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

// Antes, qualquer resposta que não viesse em JSON perfeito (truncada, aspas não
// escapadas, etc.) derrubava a análise daquela pessoa pro resto da semana — era a causa
// de várias análises sumirem (ex.: Marco Filho, Amanda Pardim, Wericles, Gleyson na
// semana de 27/07 a 02/08). Agora: 429 continua com backoff (já existia); resposta sem
// bloco de texto ou JSON malformado/cortado agora tentam de novo (normalmente é
// transitório) antes de desistir, e loga a resposta bruta na desistência final pra dar
// pra investigar sem precisar vasculhar o Actions na mão.
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

  if (res.status === 429 && tentativa <= 4) {
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

// Busca o último registro semanal desse executivo que NÃO seja o desta mesma semana —
// dá continuidade ao gestor: se o gargalo é o mesmo de novo, o texto deve cobrar mais
// forte em vez de repetir a mesma ação genérica; se foi resolvido, reconhece e segue.
async function buscarUltimaSemana(ownerId, semanaLabelAtual) {
  const linhas = await supabaseSelect(
    'analise_individual_semanal',
    `owner_id=eq.${ownerId}&order=mes_ano.desc,numero_semana_mes.desc&limit=2`
  );
  return linhas.find(l => l.semana_label !== semanaLabelAtual) || null;
}

// Mesma ideia, só que pro fechamento mensal: pega o mês anterior desse executivo.
async function buscarMesAnterior(ownerId, mesAnoAtual) {
  const linhas = await supabaseSelect(
    'analise_individual_mensal',
    `owner_id=eq.${ownerId}&order=mes_ano.desc&limit=2`
  );
  return linhas.find(l => l.mes_ano !== mesAnoAtual) || null;
}

async function main() {
  const hoje = new Date();
  const semanaAtualLabel = fmtRange(new Date(hoje.getTime() - 6 * 86400000), hoje);
  let { numeroSemana, ehUltimaSemana, mesAno } = infoSemanaDoMes(hoje);

  // FORCE_MONTHLY_MESANO: reprocessamento manual do fechamento mensal de um mês
  // específico (ex: José Ricardo e Gleyson Gabrieli ficaram sem fechamento de julho
  // porque a geração falhou silenciosamente só pra eles). Quando setada, pula o bloco
  // semanal (não tem por que regerar a análise da semana atual, que já rodou certo) e
  // força só o bloco mensal, pro mes_ano indicado. Usar só pontualmente — reverter a
  // env var depois de confirmar que os dados foram corrigidos.
  const FORCE_MONTHLY_MESANO = process.env.FORCE_MONTHLY_MESANO;
  if (FORCE_MONTHLY_MESANO) {
    console.log(`FORCE_MONTHLY_MESANO=${FORCE_MONTHLY_MESANO} — pulando geração semanal e forçando reprocessamento do fechamento mensal desse mês/ano.`);
    ehUltimaSemana = true;
    mesAno = FORCE_MONTHLY_MESANO;
  }

  const ownerIds = Object.keys(narrativas.reps);

  if (!FORCE_MONTHLY_MESANO) {
    // Busca a semana anterior de cada um ANTES de montar os prompts, pra poder dizer
    // pra IA "isso é repetição, cobre mais forte" ou "isso já foi resolvido, siga em
    // frente" em vez de gerar sempre a mesma orientação genérica do zero toda semana.
    const anteriores = {};
    await Promise.all(ownerIds.map(async ownerId => {
      anteriores[ownerId] = await buscarUltimaSemana(ownerId, semanaAtualLabel);
    }));

    // Antes chamava a API uma vez por rep, esperando terminar pra chamar a próxima —
    // com 9 reps isso empilhava no workflow inteiro. Agora dispara as 9 chamadas juntas
    // (o tempo vira ~o da mais lenta, não a soma) e só depois grava no Supabase.
    console.log(`Gerando ${ownerIds.length} análises de coaching em paralelo...`);
    const prompts = ownerIds.map(ownerId => {
      const n = narrativas.reps[ownerId];
      const h = hubspot.reps[ownerId] || { open: 0, stages: {}, leadsTravados: 0, ganhosSemana: 0 };
      const stageEntries = Object.entries(h.stages || {});
      const dominante = stageEntries.length ? stageEntries.sort((a, b) => b[1] - a[1])[0] : null;
      const anterior = anteriores[ownerId];
      const blocoAnterior = anterior
        ? `\nNa semana passada (${anterior.semana_label}) a orientação pro gestor foi: "${anterior.como_agir}" (gargalo mapeado: "${anterior.gargalo_semana}"). Se esse MESMO gargalo continuar essa semana, diga isso explicitamente e proponha uma ação diferente/mais firme — não repita a mesma frase de novo. Se foi resolvido, reconheça em 1 frase curta e vá direto pro novo ponto de atenção.`
        : '\nNão há histórico de semana anterior pra essa pessoa ainda (primeira análise dela).';

      return `Você é um analista de operações de vendas ajudando um GESTOR de time de Field Sales (não o vendedor).
Essa análise é PRIVADA — só o gestor vê, nunca o vendedor. Seja direto e específico sobre o que o GESTOR deve fazer
(como conduzir o 1:1, o que cobrar, o que elogiar), não uma mensagem pro vendedor ler.

Dados de ${n.name} (${n.praca}) nesta semana (${semanaAtualLabel}):
- Negócios em aberto: ${h.open}
- Etapa dominante: ${dominante ? dominante[0] : 'nenhuma'} (${dominante ? dominante[1] : 0} negócios)
- Leads com SLA estourado: ${h.leadsTravados || 0}
- Ganhos fechados essa semana: ${h.ganhosSemana || 0}
- Gargalo já mapeado: ${n.gargalo}
${blocoAnterior}

Responda SOMENTE com JSON válido, sem markdown, neste formato exato:
{
  "gargaloSemana": "1-2 frases sobre o que está acontecendo com essa pessoa essa semana especificamente, baseado nos números acima",
  "comoAgir": "1-2 frases dizendo EXATAMENTE o que o gestor deve fazer no 1:1 ou na daily com essa pessoa esta semana — específico, não genérico, e sem repetir a orientação da semana passada se o gargalo já foi resolvido",
  "tendencia": "1 frase curta dizendo se essa pessoa está melhorando, piorando ou estável, com base no volume travado e ganhos"
}`;
    });

    const resultados = await Promise.allSettled(prompts.map(p => chamarClaude(p, 900)));

    for (let i = 0; i < ownerIds.length; i++) {
      const ownerId = ownerIds[i];
      const n = narrativas.reps[ownerId];
      const resultado = resultados[i];

      let analise;
      if (resultado.status === 'rejected') {
        console.error(`Falha ao gerar análise de ${n.name}: ${resultado.reason?.message || resultado.reason} — gravando fallback honesto em vez de deixar a pessoa sem nada.`);
        const h = hubspot.reps[ownerId] || { open: 0, stages: {}, leadsTravados: 0, ganhosSemana: 0 };
        analise = {
          gargaloSemana: `Análise automática indisponível essa semana (falha técnica na geração). Números brutos: ${h.open} negócios em aberto, ${h.leadsTravados || 0} com SLA estourado, ${h.ganhosSemana || 0} ganhos.`,
          comoAgir: 'Revisar manualmente com o executivo neste 1:1 — a geração automática falhou e será tentada de novo na próxima semana.',
          tendencia: 'Sem dado — geração falhou essa semana.'
        };
      } else {
        analise = resultado.value;
      }

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
  } else {
    console.log('FORCE_MONTHLY_MESANO ativo — bloco semanal pulado de propósito.');
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

      const mesAnterior = await buscarMesAnterior(ownerId, mesAno);
      const blocoMesAnterior = mesAnterior
        ? `\nFechamento do mês passado (${mesAnterior.mes_ano}): "${mesAnterior.resumo_mes}" — ações recomendadas na época: ${(mesAnterior.acoes_recomendadas || []).join('; ')}. Se os mesmos pontos continuarem em aberto, diga isso explicitamente em vez de repetir as mesmas ações recomendadas de novo.`
        : '';

      const promptMensal = `Você é um analista de operações de vendas fazendo o FECHAMENTO MENSAL de um vendedor de Field Sales,
pro gestor dele usar na avaliação do mês. Privado, só o gestor vê.

Histórico das semanas de ${n.name} neste mês:
${contexto}
${blocoMesAnterior}

Responda SOMENTE com JSON válido, sem markdown:
{
  "resumoMes": "3-4 frases avaliando o mês inteiro dessa pessoa — evolução, consistência, principal ponto de atenção",
  "acoesRecomendadas": ["2-3 ações concretas e específicas que o gestor deve tomar com essa pessoa no próximo mês, diferentes das do mês passado se aqueles pontos já foram endereçados"]
}`;

      let mensal;
      try {
        mensal = await chamarClaude(promptMensal, 1000);
      } catch (e) {
        console.error(`Falha ao gerar resumo mensal de ${n.name}: ${e.message} — gravando fallback honesto em vez de deixar sem fechamento.`);
        mensal = {
          resumoMes: `Fechamento automático indisponível esse mês (falha técnica na geração). Consulte o histórico semanal de ${n.name} acima para montar a avaliação manualmente.`,
          acoesRecomendadas: ['Revisar manualmente com base no histórico semanal — a geração automática falhou.']
        };
      }

      // Idempotência: remove fechamento mensal existente pra esse owner+mês antes de
      // inserir de novo (evita duplicar linha de quem já tinha o fechamento certo, ex:
      // Kelly, Marco etc., caso o job rode de novo pra reprocessar só quem falhou).
      await supabaseDelete('analise_individual_mensal', `owner_id=eq.${ownerId}&mes_ano=eq.${mesAno}`);
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
