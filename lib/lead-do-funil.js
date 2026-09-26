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
  'informacoes_sobre_o_maior_desafio', 'data_da_reuniao', 'reuniao_agendada', 'description'];

/* O que um card do funil precisa do negócio — a lista que stageDealsTeamWide pede.
   Quem espelha um negócio fora do robô pede ESTA lista, para o card sair igual. */
const PROPS_DO_CARD = ['dealname', 'dealstage', 'createdate', 'hubspot_owner_id', 'notes_last_updated',
  'notes_next_activity_date', 'amount', 'hs_lastmodifieddate', 'latitude', 'longitude',
  'closedate', 'motivo_do_perdido',
  'cep', 'bairro', 'cidade', 'logradouro', 'numero', 'celular', ...FIELD_SALES_STAGE_PROPS, ...ENTERED_STAGE_PROPS];

function diasUteisEntre(startMs, endMs) {
  if (!(startMs < endMs)) return 0;
  const cursor = new Date(startMs);
  cursor.setUTCHours(0, 0, 0, 0);
  const fim = new Date(endMs);
  fim.setUTCHours(0, 0, 0, 0);
  let count = 0;
  while (cursor < fim) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay(); // 0=domingo, 6=sábado
    if (dow !== 0 && dow !== 6) count++;
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

  const candidates = [enteredDate, lastActivity, createdFallback].filter(t => t !== null && !isNaN(t));
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

module.exports = {
  STAGES, OPEN_STAGES, SLA_DAYS, ENTERED_STAGE_PROPS, FIELD_SALES_STAGE_PROPS, PROPS_DO_CARD,
  diasUteisEntre, daysInCurrentStage, estadoDaRegua, coordenadaValida, comTemperatura, montarLeadDoFunil
};
