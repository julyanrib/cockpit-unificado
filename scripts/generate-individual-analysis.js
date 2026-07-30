// scripts/generate-individual-analysis.js
// Roda toda SEXTA-FEIRA às 16h (Brasília), depois do fetch-hubspot.js e do
// generate-weekly-summary.js — ver .github/workflows/weekly-summary.yml (cron '0 19 * * 5').
// Gera, PRA CADA executivo, uma análise individual de coaching — visível SÓ pro gestor,
// pra usar no 1:1 (diferente do resumo individual em generate-weekly-summary.js, que é
// endereçado ao próprio executivo e aparece no Meu Painel dele).
// Na última sexta-feira do mês, também gera um resumo mensal consolidado.
//
// Requer: HUBSPOT_TOKEN (não usado aqui direto, mas hubspot.json já foi gerado antes),
// ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY (chave de SERVIÇO, não a anon —
// essa ignora as regras de RLS, é o que permite o robô escrever sem estar "logado" como ninguém).

const fs = require('fs');
const path = require('path');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!ANTHROPIC_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERRO: faltam variáveis (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY). Configure em GitHub → Secrets.');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const hubspot = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hubspot.json'), 'utf8'));
const narrativas = JSON.parse(fs.readFileSync(path.join(root, 'data', 'narrativas.json'), 'utf8'));

function fmtRange(start, end) {
  const f = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${f(start)}–${f(end)}/${end.getFullYear()}`;
}

// Quantas sextas-feiras já passaram neste mês, contando hoje — define a "semana do mês".
// Se somar 7 dias a partir de hoje cair no mês seguinte, essa é a ÚLTIMA sexta do mês
// (dispara o resumo mensal também).
function infoSemanaDoMes(hoje) {
  const mesAtual = hoje.getMonth();
  let numeroSemana = 0;
  const cursor = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  while (cursor <= hoje) {
    if (cursor.getDay() === 5) numeroSemana++; // 5 = sexta-feira
    cursor.setDate(cursor.getDate() + 1);
  }
  const proximaSexta = new Date(hoje);
  proximaSexta.setDate(proximaSexta.getDate() + 7);
  const ehUltimaSemana = proximaSexta.getMonth() !== mesAtual;
  const mesAno = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  return { numeroSemana, ehUltimaSemana, mesAno };
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function chamarClaude(prompt, maxTokens, tentativa = 1) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens || 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  // Rodando em paralelo, é mais fácil esbarrar no rate limit da API — tenta de novo com
  // backoff em vez de perder a análise de 1 rep por causa de 1 chamada malsucedida.
  if (res.status === 429 && tentativa <= 4) {
    await sleep(1500 * tentativa);
    return chamarClaude(prompt, maxTokens, tentativa + 1);
  }
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const textBlock = data.content.find(b => b.type === 'text');
  const clean = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function supabaseInsert(tabela, linha) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(linha)
  });
  if (!res.ok) throw new Error(`Supabase insert error ${res.status}: ${await res.text()}`);
}

async function supabaseSelect(tabela, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${query}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase select error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supabaseDelete(tabela, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${query}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase delete error ${res.status}: ${await res.text()}`);
}

async function main() {
  const hoje = new Date();
  const semanaAtualLabel = fmtRange(new Date(hoje.getTime() - 6 * 86400000), hoje);
  const { numeroSemana, ehUltimaSemana, mesAno } = infoSemanaDoMes(hoje);

  const ownerIds = Object.keys(narrativas.reps);

  // Antes chamava a API uma vez por rep, esperando terminar pra chamar a próxima —
  // com 9 reps isso empilhava no workflow inteiro. Agora dispara as 9 chamadas juntas
  // (o tempo vira ~o da mais lenta, não a soma) e só depois grava no Supabase.
  console.log(`Gerando ${ownerIds.length} análises de coaching em paralelo...`);
  const prompts = ownerIds.map(ownerId => {
    const n = narrativas.reps[ownerId];
    const h = hubspot.reps[ownerId] || { open: 0, stages: {}, leadsTravados: 0, ganhosSemana: 0 };
    const stageEntries = Object.entries(h.stages || {});
    const dominante = stageEntries.length ? stageEntries.sort((a, b) => b[1] - a[1])[0] : null;

    return `Você é um analista de operações de vendas ajudando um GESTOR de time de Field Sales (não o vendedor).
Essa análise é PRIVADA — só o gestor vê, nunca o vendedor. Seja direto e específico sobre o que o GESTOR deve fazer
(como conduzir o 1:1, o que cobrar, o que elogiar), não uma mensagem pro vendedor ler.

Dados de ${n.name} (${n.praca}) nesta semana (${semanaAtualLabel}):
- Negócios em aberto: ${h.open}
- Etapa dominante: ${dominante ? dominante[0] : 'nenhuma'} (${dominante ? dominante[1] : 0} negócios)
- Leads com SLA estourado: ${h.leadsTravados || 0}
- Ganhos fechados essa semana: ${h.ganhosSemana || 0}
- Gargalo já mapeado: ${n.gargalo}

Responda SOMENTE com JSON válido, sem markdown, neste formato exato:
{
  "gargaloSemana": "1-2 frases sobre o que está acontecendo com essa pessoa essa semana especificamente, baseado nos números acima",
  "comoAgir": "1-2 frases dizendo EXATAMENTE o que o gestor deve fazer no 1:1 ou na daily com essa pessoa esta semana — específico, não genérico",
  "tendencia": "1 frase curta dizendo se essa pessoa está melhorando, piorando ou estável, com base no volume travado e ganhos"
}`;
  });

  const resultados = await Promise.allSettled(prompts.map(p => chamarClaude(p, 600)));

  for (let i = 0; i < ownerIds.length; i++) {
    const ownerId = ownerIds[i];
    const n = narrativas.reps[ownerId];
    const resultado = resultados[i];

    if (resultado.status === 'rejected') {
      console.error(`Falha ao gerar análise de ${n.name}: ${resultado.reason?.message || resultado.reason}`);
      continue;
    }
    const analise = resultado.value;

    // Idempotência: remove análise existente pra esse owner+semana antes de inserir de novo
    // (evita duplicar caso o job rode mais de uma vez pra mesma semana).
    await supabaseDelete('analise_individual_semanal', `owner_id=eq.${ownerId}&semana_label=eq.${encodeURIComponent(semanaAtualLabel)}`);
    await supabaseInsert('analise_individual_semanal', {
      owner_id: ownerId,
      semana_label: semanaAtualLabel,
      numero_semana_mes: numeroSemana,
      mes_ano: mesAno,
      gargalo_semana: analise.gargaloSemana,
      como_agir: analise.comoAgir,
      tendencia: analise.tendencia
    });
  }

  // Última semana do mês: gera o resumo mensal consolidado por executivo
  if (ehUltimaSemana) {
    console.log('Última sexta do mês — gerando resumo mensal por executivo...');
    for (const ownerId of ownerIds) {
      const n = narrativas.reps[ownerId];
      const semanasDoMes = await supabaseSelect(
        'analise_individual_semanal',
        `owner_id=eq.${ownerId}&mes_ano=eq.${mesAno}&order=numero_semana_mes.asc`
      );

      if (semanasDoMes.length === 0) continue;

      const contexto = semanasDoMes.map(s => `Semana ${s.numero_semana_mes} (${s.semana_label}): ${s.gargalo_semana} | Tendência: ${s.tendencia}`).join('\n');

      const promptMensal = `Você é um analista de operações de vendas fazendo o FECHAMENTO MENSAL de um vendedor de Field Sales,
pro gestor dele usar na avaliação do mês. Privado, só o gestor vê.

Histórico das semanas de ${n.name} neste mês:
${contexto}

Responda SOMENTE com JSON válido, sem markdown:
{
  "resumoMes": "3-4 frases avaliando o mês inteiro dessa pessoa — evolução, consistência, principal ponto de atenção",
  "acoesRecomendadas": ["2-3 ações concretas e específicas que o gestor deve tomar com essa pessoa no próximo mês"]
}`;

      let mensal;
      try {
        mensal = await chamarClaude(promptMensal, 700);
      } catch (e) {
        console.error(`Falha ao gerar resumo mensal de ${n.name}: ${e.message}`);
        continue;
      }

      await supabaseInsert('analise_individual_mensal', {
        owner_id: ownerId,
        mes_ano: mesAno,
        resumo_mes: mensal.resumoMes,
        acoes_recomendadas: mensal.acoesRecomendadas
      });
    }
  }

  console.log('OK — análise individual gerada.');
}

main().catch(err => {
  console.error('Falha geral na análise individual:', err.message);
  process.exit(1);
});
