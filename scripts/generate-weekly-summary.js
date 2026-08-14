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
// manual — mesma env var que generate-individual-analysis.js já usa, reaproveitada aqui de
// propósito pra testar os dois robôs num único dispatch), este script gera o FECHAMENTO
// MENSAL em vez do resumo semanal — mesmo formato de saída (resumoGeral/comoAgir/porRep
// com resumoIndividual/comoAgirIndividual), só muda o PROMPT e a janela de dados (mês
// inteiro em vez de semana vs. semana anterior). O template NÃO precisa mudar: ele só lê
// esses mesmos campos, então a troca é transparente pro front-end.
//
// Requer variável de ambiente ANTHROPIC_API_KEY (gerada em console.anthropic.com).

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ERRO: variável ANTHROPIC_API_KEY não encontrada. Configure em GitHub → Settings → Secrets → Actions.');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'data', 'weekly-raw.json'), 'utf8'));
const narrativas = JSON.parse(fs.readFileSync(path.join(root, 'data', 'narrativas.json'), 'utf8'));

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
const CAMINHO_HISTORICO_MENSAL_TIME = path.join(root, 'data', 'historico-mensal-time.json');

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
const repsContext = Object.entries(raw.snapshotReps || {}).map(([ownerId, r]) => {
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

// Quantas sextas-feiras já passaram neste mês, contando hoje — define a "semana do mês".
// Se somar 7 dias a partir de hoje cair no mês seguinte, essa é a ÚLTIMA sexta do mês
// (mesma lógica de generate-individual-analysis.js — duplicada aqui de propósito, os
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
function lerResumoAnterior() {
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
// em generate-individual-analysis.js (lá via Supabase; aqui via arquivo local, já que este
// script não usa Supabase).
function lerHistoricoMensalTime() {
  if (!fs.existsSync(CAMINHO_HISTORICO_MENSAL_TIME)) return [];
  try {
    return JSON.parse(fs.readFileSync(CAMINHO_HISTORICO_MENSAL_TIME, 'utf8'));
  } catch (e) {
    console.error(`Não deu pra ler o historico-mensal-time.json (${e.message}) — seguindo sem histórico de meses anteriores.`);
    return [];
  }
}

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

// Versão MENSAL do prompt de time — mesmos campos de saída (resumoGeral/comoAgir), mas
// olhando o mês inteiro (soma das semanas já fechadas + a semana atual) em vez de semana
// vs. semana anterior. Usado só na última sexta do mês (ou com FORCE_MONTHLY_MESANO).
function promptTimeMensal(mesAtualStr, kpisMes, contextoSemanasTxt, mesAnterior) {
  const blocoAnterior = mesAnterior
    ? `\nFechamento do mês passado (${mesAnterior.mesAno}): "${mesAnterior.resumoMensalTime}" — ações recomendadas na época: ${(mesAnterior.comoAgirMensalTime || []).join('; ')}. Se os mesmos pontos continuarem em aberto, diga isso explicitamente em vez de repetir as mesmas ações de novo. Se foram resolvidos, reconheça brevemente.`
    : '\nNão há fechamento de mês anterior registrado ainda (primeiro fechamento mensal deste robô).';

  return `Você é um analista de operações de vendas (sales ops) experiente, escrevendo para Julyan, que lidera o time de Field Sales (Outbound) da Takeat, uma foodtech B2B brasileira. Hoje é o FECHAMENTO DO MÊS de ${mesAtualStr} — ele usa esse resumo pra avaliar o mês inteiro do time, não só a última semana.

Totais do mês inteiro (somando todas as semanas de ${mesAtualStr} apuradas até agora):
- Leads criados: ${kpisMes.leadsCriados}
- Ganhos: ${kpisMes.ganhos}
- Reuniões (entraram em Demo/Proposta): ${kpisMes.reunioes}
- Perdidos: ${kpisMes.perdidos}
- Reciclagem: ${kpisMes.reciclagem}

Leitura semana a semana dentro do mês (mais antiga primeiro):
${contextoSemanasTxt || 'Sem histórico semanal salvo pra este mês — use só os totais acima.'}
${blocoAnterior}

Escreva em português do Brasil, tom direto e prático. Responda SOMENTE com um JSON válido, sem markdown, sem \`\`\`, no formato exato:

{
  "resumoGeral": "3-5 frases em HTML simples (pode usar <b>), começando com '<b>Fechamento do mês:</b>', avaliando o MÊS INTEIRO do time — evolução ao longo das semanas, consistência, principal ponto de atenção, com números concretos.",
  "comoAgir": ["3 a 4 ações objetivas e priorizadas para o PRÓXIMO mês, diferentes das do mês passado se aqueles pontos já foram resolvidos"]
}

IMPORTANTE: fale só em nível de time/funil agregado. Não cite nome de executivo específico nem avalie
desempenho individual — essa análise é vista coletivamente por todo o time, e observações sobre uma
pessoa específica devem ficar reservadas para uma conversa de PDI, não para este resumo coletivo.`;
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
// aparecer no Meu Painel dele. Diferente da análise de coaching (generate-individual-analysis.js),
// que é privada e só o gestor vê: esse texto aqui é o próprio vendedor quem lê.
function promptIndividual(ownerId, rc, comoAgirAnterior) {
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

Responda SOMENTE com um JSON válido, sem markdown, sem \`\`\`, no formato exato:
{
  "resumoIndividual": "2-3 frases em HTML simples (pode usar <b>) contando pra essa pessoa como foi a semana dela especificamente, com números concretos — reconhecendo o que foi bem e nomeando o que travou, sem rodeio.",
  "comoAgirIndividual": ["2-3 ações objetivas e específicas pra essa pessoa focar na semana que começa, cada uma como uma string curta, pode usar <b> pra destacar números, diferentes das da semana passada se já foram resolvidas"]
}`;
}

// Versão MENSAL do prompt individual — mesmos campos de saída (resumoIndividual/
// comoAgirIndividual), olhando o mês inteiro dessa pessoa. rc.fechadosNoMes/rc.metaMensal
// já são cumulativos do mês (vêm prontos do weekly-raw.json), então dão a base numérica
// real sem precisar inventar nada.
function promptIndividualMensal(rc, mesAtualStr, comoAgirHistoricoRep, mesAnteriorRep) {
  const blocoAnterior = mesAnteriorRep
    ? `\nO que foi combinado com você no fechamento do mês passado (${mesAnteriorRep.mesAno}): ${(mesAnteriorRep.comoAgirIndividualMensal || []).join(' | ')}. Se o mesmo ponto continuar em aberto, diga isso direto. Se já resolveu, reconheça em 1 frase e siga pro próximo foco.`
    : '';
  const blocoSemanas = (comoAgirHistoricoRep && comoAgirHistoricoRep.length)
    ? `\nFoco combinado com você em cada semana deste mês: ${comoAgirHistoricoRep.join(' | ')}`
    : '';

  return `Você é um analista de operações de vendas escrevendo DIRETO para ${rc.name}, executivo(a) de Field Sales
(Outbound) da Takeat, na praça de ${rc.praca}. Hoje é o FECHAMENTO DO MÊS de ${mesAtualStr} — esse texto é lido só
por ele(a) mesmo(a), 2ª pessoa ("você"), tom direto, respeitoso e prático. Nada de elogio vazio sem dado por trás.

Fechamento do mês:
- Fechados no mês: ${rc.fechadosNoMes || 0} de meta ${rc.metaMensal || 10}
- Situação atual do funil: ${rc.open} negócios em aberto, etapa dominante ${rc.etapaDominante || 'sem dado suficiente'} (${rc.etapaDominanteContagem} negócios)
- Leads com SLA estourado agora: ${rc.leadsTravados || 0}
${blocoSemanas}
${blocoAnterior}

IMPORTANTE: fechamento é automático, puxado do HubSpot quando o negócio muda de etapa —
não existe "lançar" ou "formalizar" um ganho manualmente. Se "fechados no mês" parecer
baixo frente ao que a pessoa converteu nas semanas, não invente uma causa administrativa
("não formalizou", "não lançou no sistema") — ou explique pela janela de datas, ou não
comente a diferença.

Responda SOMENTE com um JSON válido, sem markdown, sem \`\`\`, no formato exato:
{
  "resumoIndividual": "3-4 frases em HTML simples (pode usar <b>), começando com '<b>Fechamento do mês:</b>', avaliando o MÊS INTEIRO dela(e) — consistência ao longo das semanas, o que foi bem, o que travou, com números concretos.",
  "comoAgirIndividual": ["2-3 ações objetivas pro PRÓXIMO mês, diferentes das já resolvidas"]
}`;
}

async function main() {
  const hoje = new Date();
  const { numeroSemana, ehUltimaSemana, mesAno } = infoSemanaDoMes(hoje);

  // Mesma env var que .github/workflows/weekly-summary.yml já expõe pro outro robô
  // (generate-individual-analysis.js) — reaproveitada aqui de propósito, pra dar pra
  // testar o fechamento mensal dos dois scripts com um único dispatch manual, sem
  // esperar a última sexta-feira real do mês.
  const FORCE_MONTHLY = process.env.FORCE_MONTHLY_MESANO;
  const rodarComoFechamentoMensal = ehUltimaSemana || !!FORCE_MONTHLY;
  const mesAtualStr = FORCE_MONTHLY || mesAno;

  const anterior = lerResumoAnterior();
  const historicoMes = lerHistoricoMes(mesAtualStr);
  const historicoMensalTime = lerHistoricoMensalTime();
  const mesAnteriorEntry = historicoMensalTime.find(m => m.mesAno === mesAnteriorStr(mesAtualStr)) || null;

  let parsedTime;
  let porRep = {};

  if (!rodarComoFechamentoMensal) {
    console.log(`Semana ${numeroSemana} de ${mesAno} — gerando resumo SEMANAL (1 de time + ${repsContext.length} individuais, em paralelo)...`);

    // Antes rodava 1 chamada de time + N individuais uma de cada vez (for...await) — com 9
    // reps isso empilhava ~10 chamadas sequenciais e esticava o workflow inteiro. Agora todas
    // saem juntas com Promise.allSettled: o tempo total vira ~o tempo da chamada mais lenta,
    // não a soma de todas. chamarClaude já tem retry com backoff pra 429, então rodar em
    // paralelo não devia estourar o rate limit da API pra um volume desse tamanho (10 chamadas).
    const [resultadoTime, ...resultadosIndividuais] = await Promise.allSettled([
      chamarClaude(promptTime(anterior), 2500),
      ...repsContext.map(rc => chamarClaude(promptIndividual(rc.ownerId, rc, anterior?.porRep?.[rc.ownerId]?.comoAgirIndividual), 1100))
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
      const dataAnterior = anterior?.geradoEm ? new Date(anterior.geradoEm).toLocaleDateString('pt-BR') : null;
      parsedTime = {
        resumoGeral: anterior?.resumoGeral
          ? `<b>⚠ A geração desta semana falhou — texto abaixo é da semana anterior${dataAnterior ? ' (' + dataAnterior + ')' : ''}; os números do painel são os atuais.</b><br>` + anterior.resumoGeral
          : 'Resumo de time indisponível essa semana (falha técnica na geração). Consulte os números brutos no dashboard.',
        comoAgir: anterior?.comoAgir || ['Revisar manualmente os números da semana — a geração automática falhou.']
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
  } else {
    console.log(`Fechamento MENSAL de ${mesAtualStr} (${ehUltimaSemana ? 'última sexta do mês' : 'forçado via FORCE_MONTHLY_MESANO'}) — gerando resumo de time + ${repsContext.length} individuais, em paralelo...`);

    // Totais do mês: soma das semanas já acumuladas em historico-semanal-mes.json (semanas
    // anteriores deste mês) + a semana atual (raw.kpisComparativo.atual, ainda não estava
    // no acumulador). Nunca fabrica número — é soma direta do que já foi apurado semana a
    // semana pelo fetch-weekly-comparison.js.
    const camposKpi = ['leadsCriados', 'ganhos', 'reunioes', 'perdidos', 'reciclagem'];
    const kpisMes = Object.fromEntries(camposKpi.map(c => [c, raw.kpisComparativo.atual[c] || 0]));
    historicoMes.semanas.forEach(s => {
      camposKpi.forEach(c => { kpisMes[c] += (s.kpisSemana && s.kpisSemana[c]) || 0; });
    });

    const contextoSemanasTxt = historicoMes.semanas
      .map(s => `Semana ${s.numeroSemana} (${s.janela.atual}): ${s.resumoGeral.replace(/<\/?b>/g, '')}`)
      .join('\n');

    const promptsIndividuais = repsContext.map(rc => {
      const historicoRep = historicoMes.semanas
        .map(s => (s.porRep && s.porRep[rc.ownerId] && s.porRep[rc.ownerId].comoAgirIndividual) || [])
        .flat();
      const mesAnteriorRep = mesAnteriorEntry?.porRep?.[rc.ownerId] || null;
      return promptIndividualMensal(rc, mesAtualStr, historicoRep, mesAnteriorRep);
    });

    const [resultadoTime, ...resultadosIndividuais] = await Promise.allSettled([
      chamarClaude(promptTimeMensal(mesAtualStr, kpisMes, contextoSemanasTxt, mesAnteriorEntry), 2500),
      ...promptsIndividuais.map(p => chamarClaude(p, 1100))
    ]);

    if (resultadoTime.status === 'rejected') {
      console.error(`Falha ao gerar o fechamento mensal de time: ${resultadoTime.reason?.message || resultadoTime.reason} — mantendo o texto da última semana em vez de travar tudo.`);
      FALHAS_IA.push(String(resultadoTime.reason?.message || resultadoTime.reason).slice(0, 220));
      parsedTime = {
        resumoGeral: anterior?.resumoGeral || `Fechamento do mês indisponível (falha técnica na geração). Totais brutos de ${mesAtualStr}: ${kpisMes.ganhos} ganhos, ${kpisMes.leadsCriados} leads criados.`,
        comoAgir: anterior?.comoAgir || ['Revisar manualmente os números do mês — a geração automática do fechamento mensal falhou.']
      };
    } else {
      parsedTime = resultadoTime.value;
    }

    repsContext.forEach((rc, i) => {
      const resultado = resultadosIndividuais[i];
      if (resultado.status === 'fulfilled') {
        porRep[rc.ownerId] = {
          name: rc.name,
          resumoIndividual: resultado.value.resumoIndividual,
          comoAgirIndividual: resultado.value.comoAgirIndividual || []
        };
      } else {
        console.error(`Falha ao gerar fechamento mensal individual de ${rc.name}: ${resultado.reason?.message || resultado.reason} — gravando fallback honesto.`);
      FALHAS_IA.push(String(resultado.reason?.message || resultado.reason).slice(0, 220));
        porRep[rc.ownerId] = {
          name: rc.name,
          resumoIndividual: `Fechamento do mês indisponível (falha técnica na geração). Números atuais: <b>${rc.fechadosNoMes || 0}</b> fechados de meta <b>${rc.metaMensal || 10}</b>, <b>${rc.open}</b> negócios em aberto.`,
          comoAgirIndividual: ['Revisar manualmente neste fechamento de mês — a geração automática falhou e será tentada de novo no próximo mês.']
        };
      }
    });
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

  const output = {
    geradoEm: new Date().toISOString(),
    janela: raw.janela,
    kpisComparativo: raw.kpisComparativo,
    resumoGeral: parsedTime.resumoGeral,
    comoAgir: parsedTime.comoAgir,
    ganhosSemanaDetalhe: raw.ganhosSemanaDetalhe || [],
    reunioesSemanaDetalhe: raw.reunioesSemanaDetalhe || [],
    quentesDemoOuNegociacao: raw.quentesDemoOuNegociacao || [],
    porRep
  };

  // Diagnóstico sem precisar abrir o log do Actions: toda falha de chamada fica
  // registrada no próprio arquivo (o incidente de 04-08/08 ficou 4 dias invisível).
  if (FALHAS_IA.length) output._falhasIA = { em: output.geradoEm, erros: FALHAS_IA };
  fs.writeFileSync(path.join(root, 'data', 'resumo-semanal.json'), JSON.stringify(output, null, 2));
  console.log(`OK — data/resumo-semanal.json gravado (${rodarComoFechamentoMensal ? 'FECHAMENTO MENSAL' : 'semanal'}).`);

  if (!rodarComoFechamentoMensal) {
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
    console.log(`historico-semanal-mes.json atualizado (semana ${numeroSemana} de ${mesAno}).`);
  } else {
    // Mês fechado: grava o fechamento pra servir de "mês anterior" no próximo fechamento
    // mensal, e reseta o acumulador semanal — a próxima semana já é do mês seguinte.
    const novaEntradaMensal = {
      mesAno: mesAtualStr,
      resumoMensalTime: output.resumoGeral,
      comoAgirMensalTime: output.comoAgir,
      porRep: Object.fromEntries(Object.entries(porRep).map(([id, r]) => [id, { comoAgirIndividualMensal: r.comoAgirIndividual }]))
    };
    const historicoMensalAtualizado = historicoMensalTime.filter(m => m.mesAno !== mesAtualStr);
    historicoMensalAtualizado.push(novaEntradaMensal);
    fs.writeFileSync(CAMINHO_HISTORICO_MENSAL_TIME, JSON.stringify(historicoMensalAtualizado, null, 2));
    fs.writeFileSync(CAMINHO_HISTORICO_MES, JSON.stringify({ mesAno: null, semanas: [] }, null, 2));
    console.log(`historico-mensal-time.json atualizado com o fechamento de ${mesAtualStr}; historico-semanal-mes.json resetado pro próximo mês.`);
  }
}

main().catch(err => {
  console.error('Falha ao gerar resumo semanal:', err.message);
  process.exit(1);
});
