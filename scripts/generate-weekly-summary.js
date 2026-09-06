// scripts/generate-weekly-summary.js
// Roda toda SEXTA-FEIRA às 16h (Brasília), depois do fetch-weekly-comparison.js — ver
// .github/workflows/weekly-summary.yml (cron '0 19 * * 5'). O plano fica pronto antes
// da daily de segunda-feira, mas a GERAÇÃO em si acontece na sexta.
// Manda os números pra API da Claude e pede: (1) um resumo interpretativo do TIME inteiro
// (visão de time/funil agregado, sem citar nomes — pro gestor e pra visão coletiva), e
// (2) um resumo INDIVIDUAL por executivo (endereçado a ele mesmo, "você") — cada um só
// vê o seu, no Meu Painel. O gestor vê o coletivo + a lista de todos os individuais.
//
// NA ÚLTIMA SEXTA-FEIRA DO MÊS (ou quando FORCE_MONTHLY_MESANO estiver setada, pra teste
// manual — sobrou do fechamento mensal, que foi apagado em 05/09/26. Mantida para nao
// propósito pra testar os dois robôs num único dispatch), este script gera o FECHAMENTO
// (APAGADO EM 05/09/26 — revisão de custo) o fechamento MENSAL — mesmo formato de saída
// com resumoIndividual/comoAgirIndividual), só muda o PROMPT e a janela de dados (mês
// inteiro em vez de semana vs. semana anterior). O template NÃO precisa mudar: ele só lê
// esses mesmos campos, então a troca é transparente pro front-end.
//
// Requer variável de ambiente ANTHROPIC_API_KEY (gerada em console.anthropic.com).

const fs = require('fs');
const path = require('path');
const { publicarSnapshot, carregarJsonOuTabela, lerSnapshot } = require('../lib/publicar-snapshot.js');

const API_KEY = process.env.ANTHROPIC_API_KEY;
/* AS CHAVES DO SUPABASE ENTRARAM NA FUSAO (05/09/26): este robo passou a escrever
   tambem a analise de coaching por executivo, que mora no Supabase, e os compromissos
   do 1:1. Chave de SERVICO, nao a anon — ela ignora RLS, que e o que permite o robo
   escrever sem estar logado como ninguem.
   O guarda aborta se faltar qualquer uma: chave faltando nao da erro, so faz o passo
   desistir em silencio — foi assim que o snapshot de narrativas ficou dias sem publicar. */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERRO: faltam variaveis (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY). Configure em GitHub → Settings → Secrets → Actions.');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'weekly-raw.json'), 'utf8'));
/* NARRATIVAS CARREGA DO ARQUIVO OU DA TABELA (03/09/26) =============================
   Era `const narrativas = JSON.parse(fs.readFileSync(...))` no topo do modulo. Com o
   arquivo fora do git (a etapa que a pergunta do Julyan sobre deploy pede), isso morre
   no require e derruba o robo inteiro — foi o que o PR #255 fez e o #256 reverteu.
   A carga desce para dentro do main() porque ler a tabela e assincrono, e
   carregarJsonOuTabela ABORTA se nao achar em nenhum dos dois: comecar de {} publicaria
   um narrativas vazio e apagaria a narrativa e os compromissos de PDI de todo mundo. */
const narrativasPath = path.join(root, 'data', 'narrativas.json');
let narrativas = null;

// Só pra ter acesso ao stageMeta.labels (mapeia ID bruto da etapa do HubSpot pro nome
// legível, ex: "1395880470" -> "Conversa com Decisor") — a mesma fonte que o template usa
// (STAGE_LABELS). Leitura tolerante: se o arquivo não existir por algum motivo, segue com
// mapa vazio em vez de derrubar o script inteiro (o pior caso é o texto cair pro fallback
// "etapa <id>", não travar a geração).
let STAGE_LABELS = {};
try {
  const hubspotData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hubspot.json'), 'utf8'));
  STAGE_LABELS = (hubspotData.stageMeta && hubspotData.stageMeta.labels) || {};
} catch (e) {
  console.error(`Não deu pra ler data/hubspot.json pra mapear nomes de etapa (${e.message}) — textos vão usar o ID bruto como fallback.`);
}

const CAMINHO_HISTORICO_MES = path.join(root, 'data', 'historico-semanal-mes.json');

// Monta um resumo por executivo (nome + praça + open + etapa dominante) pra dar contexto à Claude
//
// IMPORTANTE: r.ganhosSemana, r.fechadosNoMes, r.metaMensal e r.leadsTravados EXISTEM em
// data/weekly-raw.json (o fetch-weekly-comparison.js já traz isso certinho), mas antes
// não eram copiados pra cá — então promptIndividual() sempre recebia undefined nesses
// campos e caía nos valores-padrão (0, 0, meta 10), fazendo o texto individual de todo
// mundo dizer sempre "0 ganhos, 0 de 10 fechados" independente do número real. Corrigido
// carregando os campos de verdade abaixo.
//
// BUG encontrado em produção (revisão pré-lançamento): etapaDominante guardava o ID bruto
// do HubSpot (ex: "1395880470"), e a IA repetia esse número literal no texto ("etapa
// 1395880470") em vez do nome — apareceu em pelo menos um executivo no resumo real.
// Corrigido mapeando via STAGE_LABELS antes de virar contexto do prompt.
/* ══ DEFEITO DE PRODUCAO ACHADO NO ENSAIO DA FUSAO (05/09/26) ═══════════════════════
   Isto era um const de MODULO que fazia narrativas.reps[...] — e narrativas so e
   carregado dentro do main(), desde que a carga virou assincrona em 03/09. Ou seja: o
   robo semanal estourava "Cannot read properties of null" no load, TODA sexta, desde
   03/09. A prova esta no dado: resumo-semanal.json parou em 29/08.
   Nenhuma guarda pegou porque nenhuma roda este script; foi o ensaio com rede simulada
   que derrubou na primeira linha. Agora e funcao, chamada depois da carga. */
/* VEIO NA FUSAO (05/09/26): o rotulo da semana civil e escrito com ela, e ela morava no
   robo que foi apagado. Com timeZone de propósito — sem ele, este script (que roda em UTC
   no Actions) formata a data errada perto da virada do dia em Brasilia. */
function fmtRange(start, end) {
  const f = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  return `${f(start)}–${f(end)}/${end.getFullYear()}`;
}

function montarRepsContext() {
  return Object.entries(raw.snapshotReps || {}).map(([ownerId, r]) => {
  const n = narrativas.reps[ownerId] || {};
  const stageEntries = Object.entries(r.stages || {});
  const dominant = stageEntries.length ? stageEntries.sort((a, b) => b[1] - a[1])[0] : null;
  return {
    ownerId,
    name: r.name,
    praca: n.praca || '—',
    open: r.open,
    etapaDominante: dominant ? (STAGE_LABELS[dominant[0]] || dominant[0]) : null,
    etapaDominanteContagem: dominant ? dominant[1] : 0,
    ganhosSemana: r.ganhosSemana || 0,
    fechadosNoMes: r.fechadosNoMes || 0,
    metaMensal: r.metaMensal || 10,
    leadsTravados: r.leadsTravados || 0
  };
  });
}

/* preenchido no main(), depois que narrativas carrega */
let repsContext = [];

// Quantas sextas-feiras já passaram neste mês, contando hoje — define a "semana do mês".
// Se somar 7 dias a partir de hoje cair no mês seguinte, essa é a ÚLTIMA sexta do mês
// (a mesma logica vivia no robo de coaching, fundido neste em 05/09/26 — os
// scripts são independentes e não compartilham módulo).
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

function mesAnteriorStr(mesAnoAtual) {
  const [ano, mes] = mesAnoAtual.split('-').map(Number);
  const d = new Date(ano, mes - 2, 1); // mes-1 é o mês atual (0-index); -2 = mês anterior
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Lê o resumo-semanal.json ATUAL (= o da semana passada, gerado na última vez que este
// script rodou) ANTES de sobrescrevê-lo — assim dá pra alimentar a IA com o que já foi
// recomendado e evitar repetir a mesma orientação toda semana. Se for a primeira vez
// rodando (arquivo não existe ainda), segue sem histórico, sem quebrar.
async function lerResumoAnterior() {
  /* A TABELA PRIMEIRO (05/09/26): o arquivo saiu do git na virada, entao no runner ele
     nao existe. Sem isto a IA perderia a memoria da semana passada EM SILENCIO — nada
     quebra, o texto so volta a repetir a mesma recomendacao da semana anterior. */
  try {
    const daTabela = await lerSnapshot('resumo-semanal');
    if (daTabela) return daTabela;
  } catch (e) {
    console.log('Aviso: nao consegui ler o resumo anterior na tabela - ' + e.message);
  }
  const caminho = path.join(root, 'data', 'resumo-semanal.json');
  if (!fs.existsSync(caminho)) return null;
  try {
    return JSON.parse(fs.readFileSync(caminho, 'utf8'));
  } catch (e) {
    console.error(`Não deu pra ler o resumo-semanal.json anterior (${e.message}) — seguindo sem histórico.`);
    return null;
  }
}

// Acumula, semana a semana, o resumo de time + individuais gerados DENTRO do mês corrente
// — é o que alimenta o fechamento mensal na última sexta (sem isso, o fechamento mensal só
// enxergaria a última semana, não o mês inteiro). Se o mês mudou desde a última leitura,
// começa vazio de novo (não faz sentido carregar semanas de um mês já fechado).
/* O HISTÓRICO DO MÊS ATRAVESSA RODADAS PELA TABELA (05/09/26), não mais pelo git.
   Ele é o acumulador que vira o "vs. semana passada" da aba do executivo — dado de
   máquina, e commitá-lo custava um deploy por semana. A leitura continua tolerando o
   arquivo: dentro da mesma rodada ele é mais novo que a tabela. */
async function lerHistoricoMesDaTabela(mesAtualStr) {
  try {
    const daTabela = await lerSnapshot('historico-semanal-mes');
    if (daTabela && daTabela.mesAno === mesAtualStr) return daTabela;
    if (daTabela) return { mesAno: mesAtualStr, semanas: [] }; /* virou o mês: acumulador zera */
  } catch (e) {
    console.log('Aviso: nao consegui ler o historico do mes na tabela - ' + e.message);
  }
  return null;
}

function lerHistoricoMes(mesAtualStr) {
  if (!fs.existsSync(CAMINHO_HISTORICO_MES)) return { mesAno: mesAtualStr, semanas: [] };
  try {
    const h = JSON.parse(fs.readFileSync(CAMINHO_HISTORICO_MES, 'utf8'));
    if (h.mesAno !== mesAtualStr) return { mesAno: mesAtualStr, semanas: [] };
    return h;
  } catch (e) {
    console.error(`Não deu pra ler o historico-semanal-mes.json (${e.message}) — começando um histórico novo pro mês.`);
    return { mesAno: mesAtualStr, semanas: [] };
  }
}

// Fechamentos mensais já gerados em meses anteriores (time + por executivo) — pra dar
// continuidade no fechamento mensal seguinte, do mesmo jeito que buscarMesAnterior() faz
function promptTime(anterior) {
  const blocoAnterior = (anterior && anterior.comoAgir && anterior.comoAgir.length)
    ? `\nAções recomendadas na semana passada: ${anterior.comoAgir.join(' | ')}. Se os mesmos gargalos continuarem, diga isso explicitamente e escale a recomendação — não repita a mesma frase de novo. Se foram resolvidos, reconheça brevemente e foque no que é novo.`
    : '';

  return `Você é um analista de operações de vendas (sales ops) experiente, escrevendo para Julyan, que lidera o time de Field Sales (Outbound) da Takeat, uma foodtech B2B brasileira. Ele usa esse resumo toda segunda-feira para orientar os 1:1s da semana.

Dados da semana atual (${raw.janela.atual}) vs. semana anterior (${raw.janela.anterior}):
- Leads criados: ${raw.kpisComparativo.atual.leadsCriados} (semana anterior: ${raw.kpisComparativo.anterior.leadsCriados})
- Ganhos: ${raw.kpisComparativo.atual.ganhos} (semana anterior: ${raw.kpisComparativo.anterior.ganhos})
- Reuniões (entraram em Demo/Proposta): ${raw.kpisComparativo.atual.reunioes} (semana anterior: ${raw.kpisComparativo.anterior.reunioes})
- Perdidos: ${raw.kpisComparativo.atual.perdidos} (semana anterior: ${raw.kpisComparativo.anterior.perdidos})
- Reciclagem: ${raw.kpisComparativo.atual.reciclagem} (semana anterior: ${raw.kpisComparativo.anterior.reciclagem})

Snapshot atual por executivo (volume em aberto e etapa onde mais leads estão concentrados):
${JSON.stringify(repsContext, null, 2)}
${blocoAnterior}

Escreva em português do Brasil, tom direto e prático (nada de generalidades tipo "continue o bom trabalho"). Responda SOMENTE com um JSON válido, sem markdown, sem \`\`\`, no formato exato:

{
  "resumoGeral": "2-4 frases em HTML simples (pode usar <b>) explicando o que mais chamou atenção nos números da semana que passou — comparando com a anterior, citando números concretos.",
  "comoAgir": ["3 a 4 ações objetivas e priorizadas para a semana atual, cada uma como uma string curta, pode usar <b> para destacar números, diferentes das da semana passada se aqueles pontos já foram resolvidos"]
}

IMPORTANTE: fale só em nível de time/funil agregado. Não cite nome de executivo específico nem avalie
desempenho individual — essa análise é vista coletivamente por todo o time, e observações sobre uma
pessoa específica devem ficar reservadas para uma conversa de PDI, não para este resumo coletivo.`;
}

/* ── Supabase: o que a analise de coaching precisa (veio na fusao de 05/09/26) ──── */
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
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase select error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supabaseDelete(tabela, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${query}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase delete error ${res.status}: ${await res.text()}`);
}

/* O ultimo registro semanal que NAO e o desta semana: da continuidade ao gestor — se o
   gargalo e o mesmo de novo, o texto cobra mais forte em vez de repetir a mesma acao. */
async function buscarUltimaSemana(ownerId, semanaLabelAtual) {
  const linhas = await supabaseSelect(
    'analise_individual_semanal',
    `owner_id=eq.${ownerId}&order=mes_ano.desc,numero_semana_mes.desc&limit=2`
  );
  return linhas.find(l => l.semana_label !== semanaLabelAtual) || null;
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
// escapadas, resposta sem bloco de texto etc.) derrubava o resumo daquela pessoa pro
// resto da semana — era a causa de vários "Resumo individual" sumirem da aba do gestor.
// Agora: 429 continua com backoff (já existia); resposta sem bloco de texto ou JSON
// malformado/cortado tentam de novo (normalmente é transitório) antes de desistir, e
// loga a resposta bruta na desistência final pra dar pra investigar sem vasculhar o
// Actions na mão.
// Coletor de falhas de IA do run — vai gravado no JSON de saída (_falhasIA) pra
// diagnóstico sem abrir o log do Actions (o incidente de 04-08/08 ficou 4 dias invisível).
const FALHAS_IA = [];

async function chamarClaude(promptTexto, maxTokens, tentativa = 1) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      // Correção 08/08/26: 'claude-sonnet-5' NÃO é um model string válido da API — toda
      // chamada passou a falhar em 04/08 (gargalo congelado em 03/08, resumo semanal
      // reciclando o texto da semana anterior, 7/7 análises individuais em fallback).
      // 'claude-sonnet-4-6' é o identificador documentado e estável.
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens || 2500,
      messages: [{ role: 'user', content: promptTexto }]
    })
  });

  // 529 (overloaded) e 5xx também merecem retry — só erro de request (4xx tipo
  // modelo inválido/key errada) falha direto, porque repetir não muda nada.
  if ((res.status === 429 || res.status === 529 || res.status >= 500) && tentativa <= 4) {
    await sleep(1500 * tentativa);
    return chamarClaude(promptTexto, maxTokens, tentativa + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const textBlock = data.content.find(b => b.type === 'text');
  if (!textBlock) {
    if (tentativa <= 3) { await sleep(800 * tentativa); return chamarClaude(promptTexto, maxTokens, tentativa + 1); }
    throw new Error('Resposta da Claude não trouxe bloco de texto, mesmo após 3 tentativas.');
  }

  try {
    return JSON.parse(extrairJSON(textBlock.text));
  } catch (e) {
    if (tentativa <= 3) {
      await sleep(800 * tentativa);
      return chamarClaude(promptTexto, maxTokens, tentativa + 1);
    }
    console.error(`JSON malformado mesmo após 3 tentativas. Resposta bruta (primeiros 500 caracteres): ${textBlock.text.slice(0, 500)}`);
    throw e;
  }
}

// Monta o prompt do resumo INDIVIDUAL — endereçado direto ao executivo ("você"), pra
// aparecer no Meu Painel dele. A analise de coaching (privada do gestor) sai da MESMA
// que é privada e só o gestor vê: esse texto aqui é o próprio vendedor quem lê.
function promptIndividual(ownerId, rc, comoAgirAnterior, hojeDiaSemanaLabel, coachingAnterior) {
  const detalheGanhos = (raw.ganhosSemanaDetalhe || []).filter(g => g.ownerId === ownerId);
  const blocoAnterior = (comoAgirAnterior && comoAgirAnterior.length)
    ? `\nO que foi combinado com você na semana passada: ${comoAgirAnterior.join(' | ')}. Se o mesmo ponto continuar em aberto, diga isso direto. Se já resolveu, reconheça em 1 frase e siga pro próximo foco — não repita a mesma recomendação de novo.`
    : '';

  // Achado em produção (03/08/2026): "ganhos essa semana" e "fechados no mês" podem
  // divergir de verdade quando a janela da semana cruza a virada do mês (ex: semana
  // 28/07–03/08 conta os ganhos de julho, mas "fechados no mês" já zerou em agosto) — a
  // IA viu esse gap e inventou "os ganhos não foram formalizados no sistema" / "lance os
  // fechamentos no sistema", como se existisse uma ação manual de lançar/formalizar
  // fechamento. NÃO EXISTE: fechamento é automático, puxado do HubSpot quando o negócio
  // muda de etapa — ninguém "lança" nem "formaliza" nada. A instrução abaixo corta essa
  // alucinação na raiz, dando a causa real em vez de deixar a IA adivinhar uma.
  const explicacaoGap = (rc.ganhosSemana || 0) > (rc.fechadosNoMes || 0)
    ? `\nATENÇÃO — leia antes de escrever: "ganhos essa semana" (${rc.ganhosSemana || 0}) é maior que "fechados no mês" (${rc.fechadosNoMes || 0}). Isso é NORMAL quando a semana cruza a virada do mês — parte dos ganhos aconteceu no mês anterior e não conta pro contador do mês novo, que zerou. NÃO diga que os ganhos "não foram formalizados", "não foram lançados no sistema" ou qualquer variação disso — não existe essa ação manual, fechamento é automático via HubSpot. Se for citar esse gap, explique pela virada do mês, ou simplesmente não comente a diferença.`
    : '';

  /* o que o gestor ouviu na semana passada sobre esta pessoa — dá continuidade em vez
     de recomeçar do zero toda semana */
  const blocoCoaching = coachingAnterior
    ? `\nNa semana passada (${coachingAnterior.semana_label}) a orientação ao gestor foi: "${coachingAnterior.como_agir}" (gargalo mapeado: "${coachingAnterior.gargalo_semana}"). Se o MESMO gargalo continuar, diga isso explicitamente e proponha uma ação diferente e mais firme; se foi resolvido, reconheça em uma frase e vá para o novo ponto.`
    : '\nNão há histórico de coaching desta pessoa ainda (primeira análise dela).';

  return `Você é um analista de operações de vendas escrevendo DIRETO para ${rc.name}, executivo(a) de Field Sales
(Outbound) da Takeat, na praça de ${rc.praca}. Esse texto é lido só por ele(a) mesmo(a) — endereça na segunda pessoa
("você"), tom direto, respeitoso e prático. Nada de elogio vazio tipo "continue assim" sem dado por trás.

Dados da semana atual (${raw.janela.atual}) dele(a):
- Negócios em aberto: ${rc.open}
- Etapa onde mais negócios estão concentrados: ${rc.etapaDominante || 'sem dado suficiente'} (${rc.etapaDominanteContagem} negócios)
- Ganhos fechados essa semana: ${rc.ganhosSemana || 0}${detalheGanhos.length ? ' (' + detalheGanhos.map(g => g.nome).join(', ') + ')' : ''}
- Fechados no mês corrente: ${rc.fechadosNoMes || 0} de meta ${rc.metaMensal || 10}
- Leads com SLA estourado: ${rc.leadsTravados || 0}
${explicacaoGap}
${blocoAnterior}
${blocoCoaching}

ESTA MESMA RESPOSTA SERVE A DOIS LEITORES, e eles não podem se misturar:
  · resumoIndividual e comoAgirIndividual são lidos PELO EXECUTIVO (segunda pessoa, "você");
  · gargaloSemana, comoAgirGestor e tendencia são PRIVADOS DO GESTOR — o executivo nunca vê.
    Escreva esses três falando COM O GESTOR sobre ele, na terceira pessoa.
  · compromissos é o único campo que os DOIS veem: o executivo marca como feito na tela
    dele e o gestor valida no 1:1. Escreva no imperativo profissional, falando com o
    executivo ("Avance", "Registre", "Feche").

Responda SOMENTE com um JSON válido, sem markdown, sem \`\`\`, no formato exato:
{
  "resumoIndividual": "2-3 frases em HTML simples (pode usar <b>) contando pra essa pessoa como foi a semana dela especificamente, com números concretos — reconhecendo o que foi bem e nomeando o que travou, sem rodeio.",
  "comoAgirIndividual": ["2-3 ações objetivas e específicas pra essa pessoa focar na semana que começa, cada uma como uma string curta, pode usar <b> pra destacar números, diferentes das da semana passada se já foram resolvidas. PROIBIDO pedir 'enviar print do HubSpot' (por WhatsApp ou qualquer canal) como forma de mostrar progresso — a evidência tem que ser uma ação que já fica registrada sozinha no HubSpot: nota, próximo passo com data, etapa alterada, negócio descartado/reciclado."],
  "gargaloSemana": "1-2 frases, PRO GESTOR, sobre o que está acontecendo com essa pessoa nesta semana especificamente, baseado nos números acima.",
  "comoAgirGestor": "Roteiro pro gestor conduzir o 1:1, em 2-4 frases curtas e NESTA ORDEM: (1) abrir revisitando a semana anterior — o compromisso combinado foi cumprido ou não, diga qual; (2) o que MANTER — elogiar nominalmente uma boa prática ou um ganho concreto da semana (cliente pelo nome, se houver); (3) o que cobrar agora, específico. Sem genérico.",
  "tendencia": "1 frase curta dizendo se essa pessoa está melhorando, piorando ou estável, com base no volume travado e nos ganhos.",
  "compromissos": ["compromisso 1", "compromisso 2", "compromisso 3 (opcional)"]
}

REGRAS OBRIGATÓRIAS pro campo "compromissos" (elas vieram do robô de segunda-feira, que
foi fundido neste em 05/09/26 — cada uma nasceu de um defeito real na tela):
- PROIBIDO qualquer menção a consequência aplicada pelo gestor ("o gestor encerra", "sem
  aviso e sem reversão"): isso é ameaça, não compromisso. Descreva a AÇÃO e o PRAZO.
- PROIBIDO pedir "enviar print do HubSpot" como evidência — a evidência tem que ser uma
  ação que já fica registrada sozinha no CRM: nota criada, tarefa concluída, etapa
  alterada, próximo passo com data, negócio reciclado, visita registrada.
- Todo prazo é uma data FUTURA em relação a hoje (${hojeDiaSemanaLabel}), e o dia da
  semana escrito tem que bater com a data escrita.
- NUNCA retorne lista vazia. Sempre 2 ou 3 compromissos concretos e checáveis.
- Se os da semana passada não foram cumpridos e ainda fazem sentido, repita-os quase
  literalmente. Se não havia nenhum, crie 2-3 do zero a partir do gargalo.
- NUNCA comece um compromisso com rótulo ("Novo:", "Repetindo:"). Escreva a ação direto.
- O compromisso é da SEMANA: ele nasce agora e vale até a próxima rodada. Não escreva
  como se fosse mudar amanhã.`;
}


async function main() {
  narrativas = (await carregarJsonOuTabela(narrativasPath, 'narrativas')).dado;
  /* SÓ AQUI: montarRepsContext lê narrativas, e narrativas acabou de chegar. */
  repsContext = montarRepsContext();
  const hoje = new Date();
  const { numeroSemana, ehUltimaSemana, mesAno } = infoSemanaDoMes(hoje);
  /* VIERAM DO ROBÔ DE SEGUNDA na fusão de 05/09/26. A semana é CIVIL (segunda→domingo):
     o rótulo antigo era uma janela deslizante de 7 dias terminando hoje, e por isso cada
     rodada criava uma "semana" nova — 28 rótulos distintos para 5 semanas reais. */
  const hojeBRT = new Date(hoje.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const diaBRT = hojeBRT.getDay();
  const recuoAteSegunda = diaBRT === 0 ? 6 : diaBRT - 1;
  const segundaDaSemana = new Date(hoje.getTime() - recuoAteSegunda * 86400000);
  const domingoDaSemana = new Date(segundaDaSemana.getTime() + 6 * 86400000);
  const semanaAtualLabel = fmtRange(segundaDaSemana, domingoDaSemana);
  const DIAS_SEMANA_PT = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const hojeDiaSemanaLabel = `${DIAS_SEMANA_PT[hojeBRT.getDay()]}, ${hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

  // Mesma env var que .github/workflows/weekly-summary.yml já expõe pro outro robô
  // (sem efeito desde a fusao de 05/09/26) — mantida para nao quebrar disparo salvo,
  // testar o fechamento mensal dos dois scripts com um único dispatch manual, sem
  // esperar a última sexta-feira real do mês.
  /* O FECHAMENTO MENSAL FOI APAGADO (05/09/26). Era 1 chamada de time + 7 individuais
     uma vez por mês para escrever um texto que aparecia no mesmo lugar do resumo
     semanal — e mantinha um histórico que nenhuma tela abria. A última sexta do mês
     agora roda igual às outras quatro. */
  const mesAtualStr = mesAno;

  const anterior = await lerResumoAnterior();
  /* a tabela primeiro; o arquivo é a rede de quando a tabela ainda não tem a chave */
  const historicoMes = (await lerHistoricoMesDaTabela(mesAtualStr)) || lerHistoricoMes(mesAtualStr);


  let parsedTime;
  let porRep = {};
  /* nasce AQUI e nao dentro do bloco de geracao: quem grava no Supabase esta fora dele,
     e const dentro de bloco nao atravessa a chave — o erro so apareceria em producao. */
  const coachingParaGravar = {};

  /* O QUE O GESTOR OUVIU NA SEMANA PASSADA. Sem isto, o roteiro do 1:1 repete a mesma
     frase toda semana em vez de dizer "de novo o mesmo gargalo, cobre mais forte". */
  const coachingAnteriorPorRep = {};
  await Promise.all(repsContext.map(async rc => {
    try { coachingAnteriorPorRep[rc.ownerId] = await buscarUltimaSemana(rc.ownerId, semanaAtualLabel); }
    catch (e) { coachingAnteriorPorRep[rc.ownerId] = null; }
  }));

  {
    console.log(`Semana ${numeroSemana} de ${mesAno} — gerando resumo SEMANAL (1 de time + ${repsContext.length} individuais, em paralelo)...`);

    // Antes rodava 1 chamada de time + N individuais uma de cada vez (for...await) — com 9
    // reps isso empilhava ~10 chamadas sequenciais e esticava o workflow inteiro. Agora todas
    // saem juntas com Promise.allSettled: o tempo total vira ~o tempo da chamada mais lenta,
    // não a soma de todas. chamarClaude já tem retry com backoff pra 429, então rodar em
    // paralelo não devia estourar o rate limit da API pra um volume desse tamanho (10 chamadas).
    const [resultadoTime, ...resultadosIndividuais] = await Promise.allSettled([
      chamarClaude(promptTime(anterior), 2500),
      ...repsContext.map(rc => chamarClaude(promptIndividual(
        rc.ownerId, rc,
        anterior?.porRep?.[rc.ownerId]?.comoAgirIndividual,
        hojeDiaSemanaLabel,
        coachingAnteriorPorRep[rc.ownerId] || null
      ), 1500))
    ]);

    // Antes, se a chamada de time falhasse, o script inteiro morria e NADA era atualizado
    // (nem os individuais que deram certo). Agora, se falhar, cai pro texto da semana
    // anterior (se existir) em vez de deixar o gestor sem nada na tela de segunda.
    if (resultadoTime.status === 'rejected') {
      console.error(`Falha ao gerar o resumo de time: ${resultadoTime.reason?.message || resultadoTime.reason} — mantendo o texto da semana passada em vez de travar tudo.`);
      FALHAS_IA.push(String(resultadoTime.reason?.message || resultadoTime.reason).slice(0, 220));
      // Correção 08/08/26: o texto reciclado era servido SEM AVISO — parecia fresco e
      // contradizia os KPIs novos (dizia "125 pra 79" enquanto os números mostravam 566).
      // Reciclado tem que se declarar reciclado, com a data da geração original.
      const dataAnterior = anterior?.geradoEm ? new Date(anterior.geradoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
      parsedTime = {
        resumoGeral: anterior?.resumoGeral
          ? `<b>⚠ A geração desta semana falhou — texto abaixo é da semana anterior${dataAnterior ? ' (' + dataAnterior + ')' : ''}; os números do painel são os atuais.</b><br>` + anterior.resumoGeral
          : 'Resumo de time indisponível essa semana (falha técnica na geração). Consulte os números brutos no dashboard.',
        /* O "COMO AGIR" TAMBÉM TEM QUE SE DECLARAR RECICLADO (28/08/26).

           A regra estava escrita no comentário acima e aplicada só ao resumoGeral: o
           `comoAgir` herdava o texto da semana anterior CRU, sem aviso nenhum. E é o
           comoAgir que vira COMUNICADO PUBLICADO PRO TIME.

           O caso real: em 27/08 a geração falhou 7 vezes seguidas (crédito da API da
           Anthropic esgotado — está gravado em _falhasIA). O resumoGeral saiu com a
           tarja de aviso; o comunicado "Leitura da semana · 24/08–27/08" saiu com os
           números de 10–14/08 e nenhuma tarja. Publicado, dizia:

             · "a reciclagem caiu de 100 para 19"        (real da semana: 97 -> 84)
             · "81 negócios criados, queda de 25%"       (real da semana: 51, de 62)
             · "as 3 reuniões desta semana"              (real da semana: 6, de 3)

           E prescrevia, com base nesses números, que "toda perda registrada sem
           evidência de contato com o decisor será revertida pelo gestor diretamente no
           CRM, sem consulta ao executivo". Ou seja: uma diretriz severa ao time,
           fundamentada em número de duas semanas antes, sem nada avisando.

           Texto reciclado sem etiqueta é pior que texto ausente, porque ninguém tem
           como desconfiar dele. Agora a etiqueta acompanha os dois campos, e trata as
           duas formas que o comoAgir assume (string única ou lista de itens). */
        comoAgir: (() => {
          const aviso = `⚠ A geração desta semana falhou — texto abaixo é da semana anterior${dataAnterior ? ' (' + dataAnterior + ')' : ''}; NÃO use estes números para cobrar o time, use os do painel.`;
          if (!anterior?.comoAgir) return ['Revisar manualmente os números da semana — a geração automática falhou.'];
          if (Array.isArray(anterior.comoAgir)) return [aviso].concat(anterior.comoAgir);
          return `<b>${aviso}</b><br>` + anterior.comoAgir;
        })()
      };
    } else {
      parsedTime = resultadoTime.value;
    }

    // Um resumo individual por executivo — cada um só vê o seu no Meu Painel; o gestor
    // vê o coletivo acima (resumoGeral/comoAgir) + a lista de todos os individuais.
    // Antes, se a geração de alguém falhasse, essa pessoa simplesmente sumia da lista
    // "Resumo individual de cada executivo" do gestor — agora sempre entra uma entrada,
    // real (números atuais) ou de fallback, nunca fica em branco.
    repsContext.forEach((rc, i) => {
      const resultado = resultadosIndividuais[i];
      if (resultado.status === 'fulfilled') {
        porRep[rc.ownerId] = {
          name: rc.name,
          resumoIndividual: resultado.value.resumoIndividual,
          comoAgirIndividual: resultado.value.comoAgirIndividual || []
        };
        /* A METADE DO GESTOR da mesma resposta (fusão de 05/09/26). Guardada aqui e
           gravada depois do loop, junto, para não intercalar rede com montagem. */
        coachingParaGravar[rc.ownerId] = {
          gargaloSemana: resultado.value.gargaloSemana || null,
          comoAgirGestor: resultado.value.comoAgirGestor || null,
          tendencia: resultado.value.tendencia || null,
          compromissos: Array.isArray(resultado.value.compromissos) ? resultado.value.compromissos.filter(Boolean) : []
        };
      } else {
        console.error(`Falha ao gerar resumo individual de ${rc.name}: ${resultado.reason?.message || resultado.reason} — gravando fallback honesto.`);
      FALHAS_IA.push(String(resultado.reason?.message || resultado.reason).slice(0, 220));
        porRep[rc.ownerId] = {
          name: rc.name,
          resumoIndividual: `Análise indisponível essa semana (falha técnica na geração). Números atuais: <b>${rc.open}</b> negócios em aberto, etapa dominante <b>${rc.etapaDominante || 'sem dado'}</b>, <b>${rc.ganhosSemana || 0}</b> ganhos fechados.`,
          comoAgirIndividual: ['Revisar manualmente neste 1:1 — a geração automática falhou e será tentada de novo na próxima semana.']
        };
      }
    });
  }

  /* ══ A METADE DO GESTOR: coaching no Supabase + compromissos do 1:1 ═══════════════
     Isto era um robo separado, apagado na fusao de 05/09/26. Mesma
     resposta da IA, dois destinos — e nenhuma chamada a mais.

     O delete antes do insert é idempotência: se a rodada repetir na mesma semana civil,
     substitui em vez de duplicar. O rótulo é a semana CIVIL (segunda→domingo) porque a
     janela deslizante antiga criava um rótulo novo a cada rodada e o delete nunca
     alcançava a linha anterior.

     Se a IA falhou para alguém, esta pessoa simplesmente não entra — os compromissos
     dela ficam como estavam. Lista vazia aqui apagaria o plano da semana de alguém por
     causa de um timeout. */
  let compromissosMudaram = false;
  for (const ownerId of Object.keys(coachingParaGravar)) {
    const c = coachingParaGravar[ownerId];
    const nome = (narrativas.reps[ownerId] && narrativas.reps[ownerId].name) || ownerId;
    try {
      await supabaseDelete('analise_individual_semanal', `owner_id=eq.${ownerId}&semana_label=eq.${encodeURIComponent(semanaAtualLabel)}`);
      await supabaseInsert('analise_individual_semanal', {
        owner_id: ownerId,
        semana_label: semanaAtualLabel,
        numero_semana_mes: numeroSemana,
        mes_ano: mesAno,
        gargalo_semana: c.gargaloSemana,
        como_agir: c.comoAgirGestor,
        tendencia: c.tendencia
      });
    } catch (e) {
      console.error(`Falha ao gravar o coaching de ${nome}: ${e.message}`);
      FALHAS_IA.push(`coaching ${nome}: ${String(e.message).slice(0, 160)}`);
    }
    if (c.compromissos.length && narrativas.reps[ownerId]) {
      narrativas.reps[ownerId].compromissos = c.compromissos;
      compromissosMudaram = true;
    }
  }

  /* narrativas._atualizado_em é o carimbo que a tela usa para resetar o check-off dos
     acordos (pdiStorageKey). Avança UMA vez por rodada, e só se algum compromisso mudou
     de verdade: é esperado e correto que o check da semana passada seja zerado junto com
     o compromisso novo. */
  if (compromissosMudaram) {
    narrativas._atualizado_em = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(root, 'data', 'narrativas.json'), JSON.stringify(narrativas, null, 2));
    await publicarSnapshot('narrativas', narrativas, 'generate-weekly-summary');
    console.log(`narrativas atualizado — compromissos da semana + versão ${narrativas._atualizado_em}.`);
  }

  // ===== BLOCO 40 (14/08/26) — snapshot por executivo, pra viabilizar delta
  // semana-a-semana na aba Desenvolvimento do executivo.
  //
  // O que existia antes: comparativo de TIME (raw.kpisComparativo) e "vs. última
  // atualização" (data/hubspot-previous.json, que é o pull de 8h atrás — não a semana
  // passada). Nenhum dos dois responde "quantos negócios ELE tinha em Visita semana
  // passada", então a coluna "Leitura da semana" só podia mostrar valor absoluto.
  //
  // Grava o snapshot desta semana no histórico do mês e injeta em porRep o snapshot da
  // ÚLTIMA semana já registrada. O front só LÊ `indSemana.anterior` — não calcula, não
  // deduz e não mostra seta nenhuma enquanto isso for null (o que é o caso até a primeira
  // sexta rodar com este bloco, e também na 1ª semana de cada mês, porque o acumulador
  // reseta na virada — nesses casos a tela mostra só o número de hoje, de propósito).
  const snapDaSemana = Object.fromEntries(Object.entries(raw.snapshotReps || {}).map(([id, s]) => [id, {
    open: s.open || 0,
    stages: s.stages || {},
    leadsTravados: s.leadsTravados || 0,
    ganhosSemana: s.ganhosSemana || 0,
    fechadosNoMes: s.fechadosNoMes || 0
  }]));
  const semanaAnteriorSnap = (historicoMes.semanas || [])
    .filter(s => s.numeroSemana < numeroSemana && s.porRep)
    .sort((a, b) => b.numeroSemana - a.numeroSemana)[0] || null;
  Object.keys(porRep).forEach(id => {
    porRep[id].snap = snapDaSemana[id] || null;
    porRep[id].anterior = (semanaAnteriorSnap && semanaAnteriorSnap.porRep[id] && semanaAnteriorSnap.porRep[id].snap) || null;
  });

  // ===== BLOCO 41 (14/08/26) — faísca de 5 semanas pros KPIs de time da aba Semana
  // (gestor). Antes disto, NENHUM histórico de time chegava ao cliente — só o snapshot
  // de agora (kpisComparativo.atual/anterior). historico-semanal-mes.json já guarda
  // kpisSemana por semana (é o que alimenta "contexto de semanas anteriores" no prompt),
  // só nunca tinha saído do processo de geração. Pega as últimas 4 semanas já fechadas
  // + a atual (ainda não está no acumulador — só entra nele mais abaixo, depois deste
  // ponto) = até 5 pontos. Com menos de 5 semanas de histórico acumulado (é o caso agora,
  // só há 2), a série vem mais curta — o front deve desenhar só as barras que existem,
  // nunca inventar as que faltam (mesmo princípio do snapshot do Bloco 40). =====
  const ultimasSemanasFechadas = (historicoMes.semanas || [])
    .slice().sort((a, b) => a.numeroSemana - b.numeroSemana).slice(-4);
  const serieSemanal = {
    janelas: [...ultimasSemanasFechadas.map(s => s.janela.atual), raw.janela.atual],
    fechamentos: [...ultimasSemanasFechadas.map(s => s.kpisSemana.ganhos), raw.kpisComparativo.atual.ganhos],
    reunioes: [...ultimasSemanasFechadas.map(s => s.kpisSemana.reunioes), raw.kpisComparativo.atual.reunioes],
    criados: [...ultimasSemanasFechadas.map(s => s.kpisSemana.leadsCriados), raw.kpisComparativo.atual.leadsCriados]
  };

  const output = {
    geradoEm: new Date().toISOString(),
    serieSemanal,
    janela: raw.janela,
    kpisComparativo: raw.kpisComparativo,
    resumoGeral: parsedTime.resumoGeral,
    comoAgir: parsedTime.comoAgir,
    ganhosSemanaDetalhe: raw.ganhosSemanaDetalhe || [],
    reunioesSemanaDetalhe: raw.reunioesSemanaDetalhe || [],
    // BLOCO 41 — "criados" por pessoa na semana atual (board da Semana do gestor).
    leadsCriadosSemanaDetalhe: raw.leadsCriadosSemanaDetalhe || [],
    quentesDemoOuNegociacao: raw.quentesDemoOuNegociacao || [],
    porRep
  };

  // Diagnóstico sem precisar abrir o log do Actions: toda falha de chamada fica
  // registrada no próprio arquivo (o incidente de 04-08/08 ficou 4 dias invisível).
  if (FALHAS_IA.length) output._falhasIA = { em: output.geradoEm, erros: FALHAS_IA };
  fs.writeFileSync(path.join(root, 'data', 'resumo-semanal.json'), JSON.stringify(output, null, 2));
  /* Mesmo motivo do generate-daily-gargalo — ver o comentario la. */
  await publicarSnapshot('resumo-semanal', output, 'generate-weekly-summary');
  console.log('OK — data/resumo-semanal.json gravado (semanal).');

  {
    // Acumula esta semana no histórico do mês (idempotente: se rodar 2x na mesma semana,
    // substitui a entrada em vez de duplicar) — é o que alimenta o fechamento mensal daqui
    // a algumas semanas.
    historicoMes.semanas = historicoMes.semanas.filter(s => s.numeroSemana !== numeroSemana);
    historicoMes.semanas.push({
      numeroSemana,
      janela: raw.janela,
      kpisSemana: raw.kpisComparativo.atual,
      resumoGeral: output.resumoGeral,
      comoAgir: output.comoAgir,
      // BLOCO 40 — o snap entra junto: é ele que vira o `anterior` da semana que vem.
      porRep: Object.fromEntries(Object.entries(porRep).map(([id, r]) => [id, { comoAgirIndividual: r.comoAgirIndividual, snap: r.snap || null }]))
    });
    fs.writeFileSync(CAMINHO_HISTORICO_MES, JSON.stringify(historicoMes, null, 2));
    /* E VAI PARA A TABELA (05/09/26): é assim que ele atravessa para a semana que vem
       sem passar pelo git — o arquivo em disco morre com o runner. */
    await publicarSnapshot('historico-semanal-mes', historicoMes, 'generate-weekly-summary');
    console.log(`historico do mes atualizado (semana ${numeroSemana} de ${mesAno}).`);
  }
}

main().catch(err => {
  console.error('Falha ao gerar resumo semanal:', err.message);
  process.exit(1);
});
