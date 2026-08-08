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

function isoDateHoje(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      // Correção 08/08/26: 'claude-sonnet-5' NÃO é um model string válido da API — toda
      // chamada passou a falhar em 04/08 (gargalo congelado em 03/08, resumo semanal
      // reciclando o texto da semana anterior, 7/7 análises individuais em fallback).
      // 'claude-sonnet-4-6' é o identificador documentado e estável.
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 1000,
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
      // BUG encontrado em produção (revisão pré-lançamento): sem isso, dominante[0] é o ID
      // bruto do HubSpot (ex: "1395880470"), e a IA simplesmente repete esse número no texto
      // ("etapa 1395880470") em vez do nome da etapa — apareceu nos compromissos de pelo
      // menos um executivo. hubspot.stageMeta.labels já existe e é a mesma fonte que o
      // template usa (STAGE_LABELS), então mapeia aqui antes de mandar pro prompt.
      const dominanteLabel = dominante ? ((hubspot.stageMeta && hubspot.stageMeta.labels && hubspot.stageMeta.labels[dominante[0]]) || dominante[0]) : 'nenhuma';
      const anterior = anteriores[ownerId];
      const blocoAnterior = anterior
        ? `\nNa semana passada (${anterior.semana_label}) a orientação pro gestor foi: "${anterior.como_agir}" (gargalo mapeado: "${anterior.gargalo_semana}"). Se esse MESMO gargalo continuar essa semana, diga isso explicitamente e proponha uma ação diferente/mais firme — não repita a mesma frase de novo. Se foi resolvido, reconheça em 1 frase curta e vá direto pro novo ponto de atenção.`
        : '\nNão há histórico de semana anterior pra essa pessoa ainda (primeira análise dela).';
      const boaPratica = (n.boasPraticas || [])[0] || null;
      const ganhosNomes = (h.ganhosSemanaNomes || []).slice(0, 3).join(', ');

      return `Você é um analista de operações de vendas ajudando um GESTOR de time de Field Sales (não o vendedor).
Essa análise é PRIVADA — só o gestor vê, nunca o vendedor. Seja direto e específico sobre o que o GESTOR deve fazer
(como conduzir o 1:1, o que cobrar, o que elogiar), não uma mensagem pro vendedor ler.

Dados de ${n.name} (${n.praca}) nesta semana (${semanaAtualLabel}):
- Negócios em aberto: ${h.open}
- Etapa dominante: ${dominanteLabel} (${dominante ? dominante[1] : 0} negócios)
- Leads com SLA estourado: ${h.leadsTravados || 0}
- Ganhos fechados essa semana: ${h.ganhosSemana || 0}
- Gargalo já mapeado: ${n.gargalo}
- Compromissos combinados na semana passada: ${(n.compromissos || []).length ? n.compromissos.join(' | ') : 'nenhum ainda'}
- Boa prática registrada dessa pessoa (o que ela faz BEM e deve manter): ${boaPratica ? `"${boaPratica}"` : 'nenhuma registrada — se os números mostrarem algo bem feito, nomeie'}
- Ganhos da semana com nome: ${ganhosNomes || 'nenhum ainda'}
${blocoAnterior}

IMPORTANTE: esta análise é REGERADA TODO DIA com números frescos — escreva sobre o estado de AGORA,
não sobre "o que planejar pra semana" como se fosse segunda-feira.

Responda SOMENTE com JSON válido, sem markdown, neste formato exato:
{
  "gargaloSemana": "1-2 frases sobre o que está acontecendo com essa pessoa essa semana especificamente, baseado nos números acima",
  "comoAgir": "Roteiro pro gestor conduzir o 1:1, em 2-4 frases curtas e NESTA ORDEM: (1) abrir revisitando a semana anterior — o compromisso combinado foi cumprido ou não, diga qual; (2) o que MANTER — elogiar nominalmente a boa prática ou um ganho concreto da semana (cliente pelo nome, se houver); (3) o que cobrar agora, específico. Sem genérico, sem repetir a orientação da semana passada se o gargalo já foi resolvido.",
  "tendencia": "1 frase curta dizendo se essa pessoa está melhorando, piorando ou estável, com base no volume travado e ganhos",
  "compromissos": ["compromisso 1", "compromisso 2", "compromisso 3 (opcional)"]
}

REGRAS OBRIGATÓRIAS pro campo "compromissos":
- NUNCA retorne uma lista vazia. Isso é proibido, mesmo que nada tenha mudado.
- Sempre retorne 2 ou 3 strings, cada uma um compromisso concreto e checável (ex: "Avançar pelo menos 5 leads de Prospecção pra Visita até sexta"), nunca um objetivo vago.
- Se os compromissos da semana passada ainda fazem sentido porque não foram cumpridos, repita-os quase literalmente — não os troque por outra coisa e não os esvazie.
- Se não havia compromisso na semana passada (primeira vez), crie 2-3 novos do zero com base no gargalo mapeado.
- NUNCA comece um compromisso com um rótulo anunciando o que ele é ("Novo:", "Repetindo de novo:", "Nova ação mais firme:" ou qualquer variação). Escreva direto a ação, tom profissional, sem narrar se é novo ou repetido — o compromisso fala por si.
- Esta análise roda TODO DIA. Compromisso é combinado pra SEMANA: dentro da mesma semana, mantenha os compromissos atuais estáveis (repita-os) a menos que um já tenha sido claramente cumprido (aí troque só esse) ou o quadro tenha mudado de verdade. Compromisso que muda todo dia vira ruído e o executivo para de levar a sério.`;
    });

    const resultados = await Promise.allSettled(prompts.map(p => chamarClaude(p, 1100)));

    let compromissosMudaram = false;

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
          tendencia: 'Sem dado — geração falhou essa semana.',
          compromissos: null // null = mantém o compromisso da semana passada, não apaga
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

      // Compromissos do PDI agora são automáticos (antes só mudavam quando o Julyan editava
      // manualmente o narrativas.json depois de um 1:1). Se a IA falhou essa semana, NÃO mexe
      // no compromisso existente — só atualiza quando tem coisa nova de verdade pra colocar.
      if (Array.isArray(analise.compromissos) && analise.compromissos.length > 0) {
        narrativas.reps[ownerId].compromissos = analise.compromissos;
        compromissosMudaram = true;
      } else if (Array.isArray(n.compromissos) && n.compromissos.length > 0) {
        // Rede de segurança: mesmo com a instrução explícita, a IA às vezes ainda devolve
        // lista vazia quando acha que "nada mudou". Em vez de deixar a automação travada pra
        // sempre nesse caso, reforça o compromisso já existente automaticamente.
        console.log(`${n.name}: IA não devolveu compromissos novos — mantendo os existentes automaticamente.`);
        narrativas.reps[ownerId].compromissos = n.compromissos;
        compromissosMudaram = true;
      }
    }

    // narrativas._atualizado_em é o carimbo que o front-end usa pra saber quando resetar o
    // check-off de "cumprido" dos compromissos (ver pdiStorageKey() no template) — só avança
    // UMA vez por rodada semanal (não por pessoa), e só se algum compromisso realmente mudou.
    // É esperado e correto que isso reset o check-off de todo mundo toda sexta: compromisso
    // novo da semana, não faz sentido carregar o check da semana passada.
    if (compromissosMudaram) {
      narrativas._atualizado_em = isoDateHoje(hoje);
      fs.writeFileSync(path.join(root, 'data', 'narrativas.json'), JSON.stringify(narrativas, null, 2));
      console.log(`narrativas.json atualizado — compromissos da semana + versão avançada para ${narrativas._atualizado_em}.`);
    }
  } else {
    console.log('FORCE_MONTHLY_MESANO ativo — bloco semanal pulado de propósito.');
  }

  // Última semana do mês: gera o resumo mensal consolidado por executivo
  if (ehUltimaSemana) {
    console.log('Última sexta do mês — gerando resumo mensal por executivo...');
    for (const ownerId of ownerIds) {
      const n = narrativas.reps[ownerId];
      const h = hubspot.reps[ownerId] || { open: 0, stages: {}, leadsTravados: 0, fechadosNoMes: 0, metaMensal: 10 };
      const semanasDoMes = await supabaseSelect(
        'analise_individual_semanal',
        `owner_id=eq.${ownerId}&mes_ano=eq.${mesAno}&order=numero_semana_mes.asc`
      );

      if (semanasDoMes.length === 0) continue;

      const contexto = semanasDoMes.map(s => `Semana ${s.numero_semana_mes} (${s.semana_label}): ${s.gargalo_semana} | Tendência: ${s.tendencia}`).join('\n');

      // Números reais do funil e dos ganhos pra fechar o mês — antes o prompt só tinha o
      // texto de gargalo semana a semana, sem o dado bruto por trás. "Independente do canal
      // de aquisição" pq fechadosNoMes já é o total de ganhos do pipeline (não filtra por
      // origem do lead) — reforça isso explicitamente pro texto não inventar um recorte que
      // o dado não tem.
      const stageEntriesMes = Object.entries(h.stages || {});
      const dominanteMes = stageEntriesMes.length ? stageEntriesMes.sort((a, b) => b[1] - a[1])[0] : null;
      const dominanteMesLabel = dominanteMes ? ((hubspot.stageMeta && hubspot.stageMeta.labels && hubspot.stageMeta.labels[dominanteMes[0]]) || dominanteMes[0]) : 'nenhuma';
      const pctMeta = h.metaMensal > 0 ? Math.round((h.fechadosNoMes / h.metaMensal) * 100) : 0;
      const boaPraticaExistente = (n.boasPraticas || [])[0] || null;

      const mesAnterior = await buscarMesAnterior(ownerId, mesAno);
      const blocoMesAnterior = mesAnterior
        ? `\nFechamento do mês passado (${mesAnterior.mes_ano}): "${mesAnterior.resumo_mes}" — ações recomendadas na época: ${(mesAnterior.acoes_recomendadas || []).join('; ')}. Se os mesmos pontos continuarem em aberto, diga isso explicitamente em vez de repetir as mesmas ações recomendadas de novo.`
        : '';

      const promptMensal = `Você é um analista de operações de vendas fazendo o FECHAMENTO MENSAL de um vendedor de Field Sales,
pro gestor dele usar na avaliação do mês. Privado, só o gestor vê.

DADOS DO FUNIL E DOS GANHOS de ${n.name} (${n.praca}) neste mês (${mesAno}):
- Negócios em aberto agora: ${h.open}
- Etapa onde mais negócios estão parados: ${dominanteMesLabel}
- Leads com SLA estourado agora: ${h.leadsTravados || 0}
- Ganhos fechados no mês: ${h.fechadosNoMes || 0} de meta ${h.metaMensal || 10} (${pctMeta}% da meta) — total do pipeline, JÁ SOMANDO todos os canais de aquisição, não filtre nem mencione canal específico a menos que o dado diga isso
- Boa prática já registrada pra essa pessoa: ${boaPraticaExistente ? `"${boaPraticaExistente}"` : 'nenhuma registrada ainda — se o histórico da semana mostrar algo bem feito, nomeie isso como a boa prática do mês'}

Histórico semana a semana desse mês:
${contexto}
${blocoMesAnterior}

Responda SOMENTE com JSON válido, sem markdown:
{
  "resumoMes": "Avaliação objetiva do mês inteiro, em no máximo 4 frases curtas e diretas — sem enrolação. Precisa cobrir, nesta ordem: (1) o que aconteceu no funil (volume, gargalo dominante, SLA), (2) o resultado de ganhos do mês contra a meta, (3) uma boa prática concreta dessa pessoa pra reforçar. Tom calmo e factual — o gestor precisa terminar de ler e saber exatamente onde as coisas estão, sem alarme desnecessário nem elogio genérico.",
  "acoesRecomendadas": ["2-3 ações concretas e checáveis que o gestor deve tomar com essa pessoa no próximo mês"]
}

REGRAS OBRIGATÓRIAS pro campo "acoesRecomendadas" (mesmo padrão do compromisso semanal — isso é o que mais falhava):
- NUNCA vago ou genérico ("melhorar a prospecção", "focar mais"). Cada ação tem que ser checável: o que fazer, em que volume ou prazo (ex: "Acompanhar em campo os 3 negócios mais antigos em Visita até o dia 10").
- NUNCA uma lista vazia.
- Sempre 2 ou 3 itens.
- Se um ponto do mês passado (acima) ainda não foi resolvido, repita a ação quase literalmente e diga que ela continua em aberto — não troque por outra coisa só pra parecer novo.
- NUNCA comece um item com rótulo anunciando o que ele é ("Novo:", "Mantido:", etc.) — escreva a ação direto.`;

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
