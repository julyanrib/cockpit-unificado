// scripts/generate-daily-gargalo.js
// Roda toda vez que o daily-refresh.yml roda (todo dia de madrugada, depois do
// fetch-hubspot.js) — ver .github/workflows/daily-refresh.yml.
//
// Regenera SÓ o diagnóstico "gargalo" (+ tag/tagLabel) de cada executivo em
// data/narrativas.json, usando os números frescos que acabaram de ser buscados do
// HubSpot. Pode repetir o mesmo texto de um dia pro outro se nada mudou nos números —
// a ideia é só nunca deixar ficar parado numa data velha (era o problema: o gargalo
// ficava com "dado ao vivo, 27/07" grudado, sem atualizar sozinho).
//
// IMPORTANTE — o que este script NUNCA toca, de propósito:
// - narrativas.reps[id].compromissos: são promessas de PDI combinadas ao vivo no 1:1,
//   com checkbox de "cumprido" no Meu Painel. Só devem mudar quando o Julyan pedir pra
//   atualizar a análise manualmente — nunca sozinhas.
// - narrativas._atualizado_em: é a "versão" que o template usa pra decidir quando
//   resetar os checkboxes de PDI no navegador (ver pdiStorageKey() em
//   template/cockpit.template.html). Se esse script mexesse nela, os compromissos de
//   todo mundo resetariam o check-off todo santo dia.
// Só mexe em: reps[id].gargalo, reps[id].tag, reps[id].tagLabel.
//
// Requer: ANTHROPIC_API_KEY (mesma secret já usada pelos outros robôs de texto).

const fs = require('fs');
const path = require('path');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error('ERRO: variável ANTHROPIC_API_KEY não encontrada. Configure em GitHub → Settings → Secrets → Actions.');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const hubspot = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hubspot.json'), 'utf8'));
const narrativasPath = path.join(root, 'data', 'narrativas.json');
const narrativas = JSON.parse(fs.readFileSync(narrativasPath, 'utf8'));

// Aproxima Brasília (UTC-3, sem considerar horário de verão — o Brasil não usa mais).
function hojeBrasiliaDDMM() {
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dd = String(agora.getUTCDate()).padStart(2, '0');
  const mm = String(agora.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Tolerante a preâmbulo/cerca de código que a IA às vezes inclui mesmo instruída a não
// fazer isso — pega do primeiro '{' ao último '}' em vez de confiar que o texto inteiro
// é só o JSON.
function extrairJSON(texto) {
  const semCercas = texto.replace(/```json|```/g, '').trim();
  const inicio = semCercas.indexOf('{');
  const fim = semCercas.lastIndexOf('}');
  if (inicio === -1 || fim === -1 || fim < inicio) return semCercas;
  return semCercas.slice(inicio, fim + 1);
}

// Mesmo padrão de robustez dos outros dois robôs de texto (generate-weekly-summary.js e
// generate-individual-analysis.js): retry em 429, em resposta sem bloco de texto e em
// JSON malformado/cortado, antes de desistir — e loga a resposta bruta na desistência
// final pra dar pra investigar sem vasculhar o Actions na mão.
async function chamarClaude(prompt, maxTokens, tentativa = 1) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      // Correção 08/08/26: 'claude-sonnet-5' NÃO é um model string válido da API — toda
      // chamada passou a falhar em 04/08 (gargalo congelado em 03/08, resumo semanal
      // reciclando o texto da semana anterior, 7/7 análises individuais em fallback).
      // 'claude-sonnet-4-6' é o identificador documentado e estável.
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  // 529 (overloaded) e 5xx também merecem retry — só erro de request (4xx tipo
  // modelo inválido/key errada) falha direto, porque repetir não muda nada.
  if ((res.status === 429 || res.status === 529 || res.status >= 500) && tentativa <= 4) {
    await sleep(1500 * tentativa);
    return chamarClaude(prompt, maxTokens, tentativa + 1);
  }
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const textBlock = data.content.find(b => b.type === 'text');
  if (!textBlock) {
    if (tentativa <= 3) { await sleep(800 * tentativa); return chamarClaude(prompt, maxTokens, tentativa + 1); }
    throw new Error('Resposta da Claude não trouxe bloco de texto, mesmo após 3 tentativas.');
  }

  try {
    return JSON.parse(extrairJSON(textBlock.text));
  } catch (e) {
    if (tentativa <= 3) {
      await sleep(800 * tentativa);
      return chamarClaude(prompt, maxTokens, tentativa + 1);
    }
    console.error(`JSON malformado mesmo após 3 tentativas. Resposta bruta (primeiros 500 caracteres): ${textBlock.text.slice(0, 500)}`);
    throw e;
  }
}

async function main() {
  const dataHoje = hojeBrasiliaDDMM();
  const ownerIds = Object.keys(narrativas.reps);
  const labels = (hubspot.stageMeta && hubspot.stageMeta.labels) || {};

  console.log(`Gerando ${ownerIds.length} diagnósticos de gargalo (dado ao vivo, ${dataHoje}) em paralelo...`);

  const prompts = ownerIds.map(ownerId => {
    const h = hubspot.reps[ownerId] || { open: 0, stages: {} };
    const totalAberto = h.open || 0;
    const stageEntries = Object.entries(h.stages || {});
    const stagesOrdenadas = stageEntries.sort((a, b) => b[1] - a[1]);
    const stagesDetalhe = stagesOrdenadas.map(([id, count]) => `${labels[id] || id}: ${count}`).join(', ');
    const dominante = stagesOrdenadas.length ? stagesOrdenadas[0] : null;
    const pctDominante = dominante && totalAberto ? Math.round((dominante[1] / totalAberto) * 100) : 0;

    return `Você é um analista de operações de vendas. Escreva o diagnóstico de funil de UM executivo de Field Sales,
no MESMO estilo e formato de um texto já usado neste painel (veja o exemplo). Baseie-se SÓ nos números abaixo — não
invente dado que não foi dado.

Exemplo de estilo (não copie o conteúdo, é só referência de tom/formato):
"<b>HubSpot (dado ao vivo, 27/07):</b> 36 negócios abertos, 67% ainda em Prospecção (24 de 36) — funil não avança,
mesmo padrão dos últimos ciclos. Só 2 negócios chegaram em Ag. Pagamento — o gargalo é decisão, não geração."

Dados de hoje (${dataHoje}):
- Negócios em aberto: ${totalAberto}
- Distribuição por etapa: ${stagesDetalhe || 'sem negócios abertos'}
- Etapa dominante: ${dominante ? `${labels[dominante[0]] || dominante[0]} (${pctDominante}% do funil, ${dominante[1]} de ${totalAberto})` : 'nenhuma'}
- Leads com SLA estourado: ${h.leadsTravados || 0}
- Ganhos fechados essa semana: ${h.ganhosSemana || 0}

Responda SOMENTE com JSON válido, sem markdown, neste formato exato:
{
  "gargalo": "1 parágrafo HTML (pode usar <b>) começando com '<b>HubSpot (dado ao vivo, ${dataHoje}):</b>' seguido do diagnóstico, no mesmo estilo do exemplo — cite os números reais acima",
  "tag": "crit, warn ou ok — crit se a maior parte do funil está travada numa etapa só sem avançar, warn se há concentração preocupante mas com algum avanço, ok se o funil está razoavelmente distribuído ou avançando bem",
  "tagLabel": "NO MÁXIMO 3 palavras resumindo o estado, caixa normal (não maiúsculas), sem repetir o número (isso já está no gargalo completo) — ex: 'SLA estourado', 'Funil travado', 'Travado em Decisor', 'Funil saudável', 'Zero fechamentos'. Se não houver negócio nenhum em aberto, responda exatamente 'Sem dados'."
}`;
  });

  const resultados = await Promise.allSettled(prompts.map(p => chamarClaude(p, 500)));

  let sucesso = 0, falhas = 0;
  for (let i = 0; i < ownerIds.length; i++) {
    const ownerId = ownerIds[i];
    const resultado = resultados[i];
    const nomeRep = narrativas.reps[ownerId].name || ownerId;

    if (resultado.status === 'rejected') {
      falhas++;
      // Fallback seguro: mantém o gargalo/tag/tagLabel do dia anterior em vez de
      // sobrescrever com algo fabricado — só não atualiza esse dia específico, tenta
      // de novo amanhã.
      console.error(`Falha ao gerar gargalo de ${nomeRep}: ${resultado.reason?.message || resultado.reason} — mantendo o texto anterior.`);
      continue;
    }

    const { gargalo, tag, tagLabel } = resultado.value;
    if (gargalo) narrativas.reps[ownerId].gargalo = gargalo;
    if (tag) narrativas.reps[ownerId].tag = tag;
    if (tagLabel) narrativas.reps[ownerId].tagLabel = tagLabel;
    sucesso++;
  }

  // Propositalmente NÃO mexe em narrativas._atualizado_em nem em reps[id].compromissos
  // — ver comentário no topo do arquivo.
  fs.writeFileSync(narrativasPath, JSON.stringify(narrativas, null, 2));
  console.log(`OK — gargalo atualizado: ${sucesso} sucesso(s), ${falhas} falha(s) mantida(s) com o texto anterior.`);
}

main().catch(err => {
  console.error('Falha geral ao gerar gargalo diário:', err.message);
  process.exit(1);
});
