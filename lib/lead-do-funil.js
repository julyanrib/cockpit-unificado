// lib/lead-do-funil.js
//
// COMO UM NEGÓCIO DO HUBSPOT VIRA UM CARD DO FUNIL (26/09/26). Extraído de
// scripts/fetch-hubspot.js SEM MUDAR UMA CONTA: dias parado, régua (no ritmo /
// combinado / travado), temperatura e o formato do card são os mesmos.
//
// POR QUE SAIU DE LÁ: o APP de campo passa a espelhar no banco, na hora, cada
// negócio que o executivo mexe (etapa, registro, tarefa), e o Cockpit do APP
// aplica esse espelho por cima do snapshot. Se o espelho montasse o card com
// uma cópia da conta, o mesmo negócio teria dois "dias parado" — um no robô,
// outro no espelho —, a doença que esta base já pagou várias vezes. Agora os
// dois montam pelo MESMO código: o robô requer este arquivo, e o APP porta
// este arquivo.
//
// Nada aqui chama o HubSpot. Recebe o negócio já lido ({ id, properties }).

const { temperaturaDoNegocio } = require('./temperatura.js');

const STAGES = {
  backlog: '1396007427',
  prospeccao: '1395880469',
  visita: '1396005401',
  diagnostico: '1395880470',
  demoProposta: '1395880471',
  negociacao: '1395880472',
  agPagamento: '1395880473',
  ganho1: '1396006162',
  ganho2: '1396006163',
  perdido: '1396006164',
  reciclagem: '1398311191',
  contaAlvo: '1413529973'
};

const OPEN_STAGES = [STAGES.prospeccao, STAGES.visita, STAGES.diagnostico, STAGES.demoProposta, STAGES.negociacao, STAGES.agPagamento];

const SLA_DAYS = {
  [STAGES.prospeccao]: 5,
  [STAGES.visita]: 5,
  [STAGES.diagnostico]: 4,
  [STAGES.demoProposta]: 3,
  [STAGES.negociacao]: 7,
  [STAGES.agPagamento]: 2
};

const ENTERED_STAGE_PROPS = OPEN_STAGES.map(s => `hs_v2_date_entered_${s}`);

// BLOCO 54 — propriedades condicionais obrigatórias do pipeline Field Sales,
// conferidas no HubSpot em 14/08/26. Precisam viajar no shell para pré-preencher o
// drawer; sem isso um valor já existente aparece vazio e o executivo sobrescreve à toa.
const FIELD_SALES_STAGE_PROPS = ['origem_do_lead', 'gargalo_operacional', 'nome_do_sistema',
  'plano_apresentado', 'valor_de_mrr', 'amount', 'email', 'cnpj_cpf', 'pacote_contratado',
  'adicional', 'tipo_de_pagamento', 'periodo_contratado', 'mrr',
  'deseja_criar_perfil_no_asaas_', 'qual_maior_desafio_',
  'informacoes_sobre_o_maior_desafio', 'data_da_reuniao', 'reuniao_agendada', 'description',
  // o horário do decisor que o app grava (qualificar): a arma "Achar o dono" do Raio X (06/10/26)
  'melhor_horario_do_decisor'];

/* O que um card do funil precisa do negócio — a lista que stageDealsTeamWide pede.
   Quem espelha um negócio fora do robô pede ESTA lista, para o card sair igual. */
const PROPS_DO_CARD = ['dealname', 'dealstage', 'createdate', 'hubspot_owner_id', 'notes_last_updated',
  'notes_next_activity_date', 'amount', 'hs_lastmodifieddate', 'latitude', 'longitude',
  'closedate', 'motivo_do_perdido',
  'cep', 'bairro', 'cidade', 'logradouro', 'numero', 'celular', ...FIELD_SALES_STAGE_PROPS, ...ENTERED_STAGE_PROPS];

/* DIA ÚTIL É O MESMO DO COCKPIT (02/11/26, auditoria): antes só pulava sábado e domingo e cortava o
   dia em UTC — às 21h de Brasília já era "amanhã", e Finados contava como dia parado. Agora:
   o dia é o de America/Sao_Paulo e o feriado nacional fica fora, com a MESMA lista do
   GV2.feriadosDoAno do template (fixos + Carnaval, Sexta-feira Santa e Corpus Christi pela Páscoa). */
const _feriados = {};
function somaDiasIso(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function feriadosDoAno(y) {
  if (_feriados[y]) return _feriados[y];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = y + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(md => y + '-' + md);
  const moveis = [-48, -47, -2, 60].map(n => somaDiasIso(pascoa, n));
  return (_feriados[y] = new Set(fixos.concat(moveis)));
}
const _fmtBR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
function diaBR(ms) { return _fmtBR.format(new Date(ms)); }
function ehDiaUtil(iso) {
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay(); // 0=domingo, 6=sábado
  return dow !== 0 && dow !== 6 && !feriadosDoAno(Number(iso.slice(0, 4))).has(iso);
}
function diasUteisEntre(startMs, endMs) {
  // data lixo (createdate inválida → -Infinity): 0, como a versão antiga dava
  if (!(startMs < endMs) || !isFinite(startMs) || !isFinite(endMs)) return 0;
  let cursor = diaBR(startMs);
  const fim = diaBR(endMs);
  let count = 0;
  while (cursor < fim) {
    cursor = somaDiasIso(cursor, 1);
    if (ehDiaUtil(cursor)) count++;
  }
  return count;
}

// Dias REALMENTE parado, sem interação nenhuma — a nota longa sobre notes_last_updated
// x hs_lastmodifieddate está em scripts/fetch-hubspot.js, junto de onde isso nasceu.
function daysInCurrentStage(properties) {
  const enteredKey = `hs_v2_date_entered_${properties.dealstage}`;
  const enteredDate = properties[enteredKey] ? new Date(properties[enteredKey]).getTime() : null;
  const lastActivity = properties.notes_last_updated ? new Date(properties.notes_last_updated).getTime() : null;
  const createdFallback = new Date(properties.createdate).getTime();
  /* A VISITA DO APP TAMBÉM É TOQUE (05/10/26: "fizeram visita no cliente e mesmo assim aparece
     como estourado"). A visita vira tarefa concluída no HubSpot, que não mexe em notes_last_updated.
     A última visita vem da view ultima_visita_por_negocio (0164): o robô a carrega em
     globalThis.__ULTIMA_VISITA_APP (por deal id); o espelho a põe em _ultima_visita_app. */
  const mapaVisitas = (typeof globalThis !== 'undefined' && globalThis.__ULTIMA_VISITA_APP) || null;
  const visitaRaw = properties._ultima_visita_app || (mapaVisitas && properties.hs_object_id ? mapaVisitas[String(properties.hs_object_id)] : null);
  const visitaApp = visitaRaw ? new Date(visitaRaw).getTime() : null;

  const candidates = [enteredDate, lastActivity, createdFallback, visitaApp].filter(t => t !== null && !isNaN(t));
  const maisRecente = Math.max(...candidates);
  // 10/08 (Julyan): conta só dias úteis.
  return diasUteisEntre(maisRecente, Date.now());
}

/* A RÉGUA NÃO PUNE QUEM COMBINOU DATA (23/09/26) — três estados: no ritmo · combinado ·
   travado. A nota inteira está em scripts/fetch-hubspot.js, junto de SLA_DAYS. */
function estadoDaRegua(dias, stageId, proximaAtividadeRaw) {
  const regua = SLA_DAYS[stageId] || 999;
  const foraDaRegua = dias > regua;
  let combinadaEm = null;
  if (proximaAtividadeRaw) {
    const dt = new Date(proximaAtividadeRaw);
    if (!isNaN(dt.getTime()) && dt.getTime() > Date.now()) combinadaEm = dt.toISOString();
  }
  const aguardando = foraDaRegua && !!combinadaEm;
  return {
    slaBreach: foraDaRegua && !aguardando,
    aguardando: aguardando,
    aguardandoAte: aguardando ? combinadaEm : null,
    proximaAtividade: combinadaEm
  };
}

function coordenadaValida(valor) {
  if (valor == null) return null;
  const txt = String(valor).trim();
  if (!txt) return null;
  const n = Number(txt);
  if (!isFinite(n)) return null;
  /* 0,0 nunca e um restaurante nosso: e o valor que aparece quando o campo foi zerado. */
  if (n === 0) return null;
  return n;
}

/* Decora um negócio ABERTO com a temperatura. Etapa fora do funil de Field Sales volta
   INTACTA: negócio perdido não tem temperatura. */
function comTemperatura(lead, stageIdExplicito, configTemperatura) {
  const id = String(stageIdExplicito || (lead && lead.stageId) || '');
  if (!((configTemperatura || {}).etapa || {})[id]) return lead;
  const medida = temperaturaDoNegocio({
    stageId: id,
    mrr: lead.mrr != null ? lead.mrr : lead.valor_de_mrr,
    valor: lead.valor,
    ultimaInteracao: lead.ultimaInteracao
  }, { config: configTemperatura });
  lead.temp = medida.nota;
  lead.tempFaixa = medida.faixa;
  lead.tempParcial = medida.parcial;
  lead.tempDiasSemToque = medida.diasSemToque;
  lead.temperatura = medida.faixa;
  return lead;
}

/* O card de um negócio ABERTO, exatamente como o funilLeads do robô o monta.
   `tarefas` = as tarefas em aberto do negócio no formato { subject, timestamp }. */
function montarLeadDoFunil(d, stageId, opcoes) {
  const o = opcoes || {};
  const p = d.properties || {};
  const dias = daysInCurrentStage(p);
  const lat = coordenadaValida(p.latitude);
  const lng = coordenadaValida(p.longitude);
  const e = estadoDaRegua(dias, stageId, p.notes_next_activity_date);
  const lead = {
    name: p.dealname,
    dealname: p.dealname,
    id: d.id,
    dias,
    slaBreach: e.slaBreach, aguardando: e.aguardando,
    aguardandoAte: e.aguardandoAte, proximaAtividade: e.proximaAtividade,
    ultimaInteracao: p.notes_last_updated || null,
    criadoEm: p.createdate || null,
    /* QUANDO ENTROU (06/10/26, Cockpit do gestor v2): `dias` conta desde o último toque,
       não desde a entrada na etapa — e "proposta enviada no mês" precisa da entrada. As duas
       datas já vinham do HubSpot (ENTERED_STAGE_PROPS) e morriam aqui. */
    entrouNaEtapaEm: p['hs_v2_date_entered_' + stageId] || null,
    entrouNegociacaoEm: p['hs_v2_date_entered_' + STAGES.negociacao] || null,
    /* quando a dor ficou registrada: o Decisor exige gargalo_operacional, então a entrada em
       Decisor data a dor (Raio X › O que a praça fala, tendência do mês, 06/10/26) */
    entrouDecisorEm: p['hs_v2_date_entered_' + STAGES.diagnostico] || null,
    valor: Math.round(parseFloat(p.amount) || 0),
    vendedor: (o.ownerNameById || {})[p.hubspot_owner_id] || '—',
    ownerId: p.hubspot_owner_id || null,
    lat: lat,
    cep: p.cep || null,
    bairro: p.bairro || null,
    cidade: p.cidade || null,
    logradouro: p.logradouro || null,
    numero: p.numero || null,
    celular: p.celular || null,
    ...Object.fromEntries(FIELD_SALES_STAGE_PROPS.map(prop => [prop, p[prop] || null])),
    tarefas: o.tarefas || [],
    lng: (lng != null && !isNaN(lng)) ? lng : null
  };
  return comTemperatura(lead, stageId, o.configTemperatura);
}

/* O card da coluna PERDIDO: dias = há quantos dias se perdeu (a pergunta ali não é
   "quanto tempo parado", é "quando foi"), sem régua nem temperatura. */
function montarCardPerdido(d, opcoes) {
  const o = opcoes || {};
  const p = d.properties || {};
  const lat = coordenadaValida(p.latitude);
  const lng = coordenadaValida(p.longitude);
  const fechou = Date.parse(p.closedate || '');
  return {
    name: p.dealname,
    dealname: p.dealname,
    id: d.id,
    dias: Number.isFinite(fechou) ? Math.max(0, Math.floor((Date.now() - fechou) / 86400000)) : 0,
    slaBreach: false,
    perdidoEm: Number.isFinite(fechou) ? new Date(fechou).toISOString().slice(0, 10) : null,
    motivo_do_perdido: p.motivo_do_perdido || null,
    proximaAtividade: p.notes_next_activity_date || null,
    ultimaInteracao: p.notes_last_updated || null,
    valor: Math.round(parseFloat(p.amount) || 0),
    vendedor: (o.ownerNameById || {})[p.hubspot_owner_id] || '—',
    ownerId: p.hubspot_owner_id || null,
    lat: lat,
    lng: lng,
    cep: p.cep || null,
    bairro: p.bairro || null,
    cidade: p.cidade || null,
    logradouro: p.logradouro || null,
    numero: p.numero || null,
    celular: p.celular || null,
    ...Object.fromEntries(FIELD_SALES_STAGE_PROPS.map(prop => [prop, p[prop] || null])),
    tarefas: o.tarefas || []
  };
}

/* O card da coluna GANHO: dias = há quantos dias FECHOU (closedate). */
function montarCardGanho(d, opcoes) {
  const o = opcoes || {};
    const lat = coordenadaValida(d.properties.latitude);
    const lng = coordenadaValida(d.properties.longitude);
    const fechou = Date.parse(d.properties.closedate || '');
    return {
      name: d.properties.dealname,
      dealname: d.properties.dealname,
      id: d.id,
      /* dias = há quantos dias FECHOU. Na coluna Ganho a pergunta não é "quanto tempo
         parado" — o negócio não está parado, está vendido: é "quando foi", que é o que
         decide se ele já devia ter ido para o Onboarding. */
      dias: Number.isFinite(fechou) ? Math.max(0, Math.floor((Date.now() - fechou) / 86400000)) : 0,
      slaBreach: false,
      ganhoEm: Number.isFinite(fechou) ? new Date(fechou).toISOString().slice(0, 10) : null,
      proximaAtividade: d.properties.notes_next_activity_date || null,
      ultimaInteracao: d.properties.notes_last_updated || null,
      valor: Math.round(parseFloat(d.properties.amount) || 0),
      mrr: Math.round(parseFloat(d.properties.mrr) || 0),
      valor_de_mrr: d.properties.valor_de_mrr || null,
      vendedor: (o.ownerNameById || {})[d.properties.hubspot_owner_id] || '—',
      ownerId: d.properties.hubspot_owner_id || null,
      lat: lat,
      lng: lng,
      cep: d.properties.cep || null,
      bairro: d.properties.bairro || null,
      cidade: d.properties.cidade || null,
      logradouro: d.properties.logradouro || null,
      numero: d.properties.numero || null,
      celular: d.properties.celular || null,
      ...Object.fromEntries(FIELD_SALES_STAGE_PROPS.map(prop => [prop, d.properties[prop] || null])),
      tarefas: o.tarefas || []
    };
}

/* ENVIADO ONBOARDING: dias = há quantos dias foi enviado; props = o negócio como veio
   (o robô pede TODAS as propriedades; o espelho, as do card). */
const PROP_ENTRADA_ONBOARDING = 'hs_v2_date_entered_' + STAGES.ganho2;
function montarCardOnboarding(d, opcoes) {
  const o = opcoes || {};
    const q = d.properties || {};
    const entrou = Date.parse(q[PROP_ENTRADA_ONBOARDING] || '');
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    return {
      name: q.dealname,
      dealname: q.dealname,
      id: d.id,
      /* dias = há quantos dias foi enviado. Nesta coluna a pergunta não é "quanto tempo
         parado" — é "isso saiu da minha mão quando". */
      dias: Number.isFinite(entrou) ? Math.max(0, Math.floor((Date.now() - entrou) / 86400000)) : 0,
      enviadoEm: Number.isFinite(entrou) ? new Date(entrou).toISOString().slice(0, 10) : null,
      slaBreach: false,
      valor: Math.round(num(q.amount)),
      mrr: Math.round(num(q.valor_de_mrr) || num(q.mrr)),
      vendedor: ((o.ownerNameById || {})[q.hubspot_owner_id] || '—'),
      ownerId: q.hubspot_owner_id || null,
      celular: q.celular || null,
      cidade: q.cidade || null,
      bairro: q.bairro || null,
      proximaAtividade: q.notes_next_activity_date || null,
      ultimaInteracao: q.notes_last_updated || null,
      tarefas: [],
      /* O CLONE. Tudo o que o negócio tem, com o nome que o HubSpot usa. */
      props: q
    };
}

/* O que o espelho ao vivo pede de um negócio para montar QUALQUER coluna. */
const PROPS_DO_ESPELHO = [...PROPS_DO_CARD, 'pipeline', PROP_ENTRADA_ONBOARDING];

module.exports = {
  STAGES, OPEN_STAGES, SLA_DAYS, ENTERED_STAGE_PROPS, FIELD_SALES_STAGE_PROPS, PROPS_DO_CARD,
  diasUteisEntre, daysInCurrentStage, estadoDaRegua, coordenadaValida, comTemperatura, montarLeadDoFunil, montarCardPerdido,
  montarCardGanho, montarCardOnboarding, PROP_ENTRADA_ONBOARDING, PROPS_DO_ESPELHO
};
