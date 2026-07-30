// scripts/build.js
// Junta data/hubspot.json (auto) + data/expogo.json (manual) + data/narrativas.json (manual)
// e gera public/index.html — o arquivo que o Netlify publica.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const hubspot = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hubspot.json'), 'utf8'));
// expogo.json não é mais lido — a métrica de atividade agora vem da Daily (prometido/realizado)
const narrativas = JSON.parse(fs.readFileSync(path.join(root, 'data', 'narrativas.json'), 'utf8'));
const leadsRefPath = path.join(root, 'data', 'leads-referencia.json');
const leadsReferencia = fs.existsSync(leadsRefPath)
  ? JSON.parse(fs.readFileSync(leadsRefPath, 'utf8'))
  : { pracas: [] };
const usuarios = JSON.parse(fs.readFileSync(path.join(root, 'data', 'usuarios.json'), 'utf8'));

// Config do Supabase (URL + chave pública) — opcional até você configurar; sem isso, o login fica desativado
const supabaseConfigPath = path.join(root, 'data', 'supabase-config.json');
const supabaseConfig = fs.existsSync(supabaseConfigPath)
  ? JSON.parse(fs.readFileSync(supabaseConfigPath, 'utf8'))
  : null;

// Resumo semanal (texto da IA) é opcional — só existe depois que o workflow de sexta-feira rodar
const resumoSemanalPath = path.join(root, 'data', 'resumo-semanal.json');
const resumoSemanal = fs.existsSync(resumoSemanalPath)
  ? JSON.parse(fs.readFileSync(resumoSemanalPath, 'utf8'))
  : null;

// weekly-raw.json agora é atualizado TODO DIA (não só sexta) — números de ganhos/ranking/
// reuniões/quentes ficam sempre frescos, mesmo que o texto interpretado pela IA (acima)
// só mude na sexta. Se ainda não existir nenhuma versão fresca, cai pro que já tem no resumo.
const weeklyRawPath = path.join(root, 'data', 'weekly-raw.json');
const weeklyRaw = fs.existsSync(weeklyRawPath)
  ? JSON.parse(fs.readFileSync(weeklyRawPath, 'utf8'))
  : null;

// Snapshot anterior (opcional) — só existe depois da 2ª execução do fetch-hubspot.js.
// Usado pras setinhas de comparação ("vs. última atualização") nos KPIs do topo.
const previousPath = path.join(root, 'data', 'hubspot-previous.json');
const hubspotPrevious = fs.existsSync(previousPath)
  ? JSON.parse(fs.readFileSync(previousPath, 'utf8'))
  : null;

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// Ordem de exibição = ordem em que aparecem no narrativas.json
const ownerIds = Object.keys(narrativas.reps);

const reps = ownerIds.map(ownerId => {
  const n = narrativas.reps[ownerId];
  const h = hubspot.reps[ownerId] || { open: 0, stages: {}, criticos: [], travados: [], leadsTravados: 0, ganhosSemana: 0, ganhosSemanaNomes: [], fechadosNoMes: 0, metaMensal: 10, visitasHubspotHoje: 0 };

  return {
    ownerId,
    name: n.name,
    praca: n.praca,
    tag: n.tag,
    tagLabel: n.tagLabel,
    gargalo: n.gargalo,
    boasPraticas: n.boasPraticas,
    compromissos: n.compromissos,
    open: h.open,
    stages: h.stages,
    criticos: h.criticos,
    travados: h.travados || [],
    leadsTravados: h.leadsTravados || 0,
    ganhosSemana: h.ganhosSemana || 0,
    ganhosSemanaNomes: h.ganhosSemanaNomes || [],
    fechadosNoMes: h.fechadosNoMes || 0,
    metaMensal: h.metaMensal || 10,
    visitasHubspotHoje: h.visitasHubspotHoje || 0
  };
});

// ---- Semáforo de saúde geral do funil ----
// Verde: poucos leads travados em relação ao total aberto. Amarelo: moderado. Vermelho: alto.
const totalAberto = hubspot.kpis.emAberto || 0;
const totalTravados = hubspot.kpis.leadsTravados || 0;
const pctTravados = totalAberto > 0 ? (totalTravados / totalAberto) * 100 : 0;
let saude;
if (pctTravados < 15) {
  saude = { nivel: 'ok', label: 'Funil saudável', detalhe: `${Math.round(pctTravados)}% dos leads abertos com SLA estourado` };
} else if (pctTravados < 35) {
  saude = { nivel: 'warn', label: 'Atenção', detalhe: `${Math.round(pctTravados)}% dos leads abertos com SLA estourado` };
} else {
  saude = { nivel: 'crit', label: 'Funil travado', detalhe: `${Math.round(pctTravados)}% dos leads abertos com SLA estourado` };
}

// ---- Deltas vs. última atualização (opcional, só existe da 2ª execução em diante) ----
function delta(atual, anterior) {
  if (anterior === undefined || anterior === null) return null;
  const diff = atual - anterior;
  if (diff === 0) return { sinal: 'flat', valor: 0 };
  return { sinal: diff > 0 ? 'up' : 'down', valor: Math.abs(diff) };
}
const kpiDeltas = hubspotPrevious ? {
  leadsCriados: delta(hubspot.kpis.leadsCriados, hubspotPrevious.kpis.leadsCriados),
  ganhos: delta(hubspot.kpis.ganhos, hubspotPrevious.kpis.ganhos),
  perdidos: delta(hubspot.kpis.perdidos, hubspotPrevious.kpis.perdidos),
  emAberto: delta(hubspot.kpis.emAberto, hubspotPrevious.kpis.emAberto),
  emReciclagem: delta(hubspot.kpis.emReciclagem, hubspotPrevious.kpis.emReciclagem),
  fechadosNoMes: delta(hubspot.kpis.fechadosNoMes, hubspotPrevious.kpis.fechadosNoMes),
  taxaAvanco: delta(hubspot.kpis.taxaAvanco, hubspotPrevious.kpis.taxaAvanco)
} : null;

// Ranking de vendas da semana — 1º/2º/3º lugar por quantidade de negócios fechados,
// empate resolvido pelo MRR total (maior ganha). Usa weekly-raw.json (atualizado todo dia)
// como fonte primária — só cai pro resumo-semanal.json (sexta) se ainda não existir nenhum.
const ganhosDetalheFresco = (weeklyRaw && weeklyRaw.ganhosSemanaDetalhe) || (resumoSemanal && resumoSemanal.ganhosSemanaDetalhe) || [];
let rankingSemanal = [];
if (ganhosDetalheFresco.length > 0) {
  const porOwner = {};
  ganhosDetalheFresco.forEach(d => {
    if (!d.ownerId) return;
    if (!porOwner[d.ownerId]) porOwner[d.ownerId] = { count: 0, mrrTotal: 0, clientes: [] };
    porOwner[d.ownerId].count += 1;
    porOwner[d.ownerId].mrrTotal += d.mrr || 0;
    porOwner[d.ownerId].clientes.push({ nome: d.nome, mrr: d.mrr || 0 });
  });
  rankingSemanal = Object.entries(porOwner)
    .map(([ownerId, v]) => ({
      ownerId,
      name: (narrativas.reps[ownerId] || {}).name || ownerId,
      count: v.count,
      mrrTotal: v.mrrTotal,
      clientes: v.clientes
    }))
    .sort((a, b) => (b.count - a.count) || (b.mrrTotal - a.mrrTotal))
    .slice(0, 3);
}

// Leads quentes/frios já vêm com nome do executivo, mas não com a praça — isso só
// existe em narrativas.json (não em hubspot.json). Anexa aqui, no build, por ownerId.
function comPraca(lista) {
  return (lista || []).map(l => ({ ...l, praca: (narrativas.reps[l.ownerId] || {}).praca || '—' }));
}
const temperaturaComPraca = {
  quentes: comPraca((hubspot.temperatura || {}).quentes),
  frios: comPraca((hubspot.temperatura || {}).frios)
};

const DATA = {
  hubspotUpdatedAtFmt: fmtDate(hubspot.updatedAt),
  versaoAnalise: narrativas._atualizado_em || 'v1',
  kpisHub: hubspot.kpis,
  kpiDetalhe: {
    leadsCriados: (hubspot.kpiDetalhe?.leadsCriados || []).map(d => ({ ...d, vendedor: (narrativas.reps[d.ownerId] || {}).name || '—' })),
    perdidos: (hubspot.kpiDetalhe?.perdidos || []).map(d => ({ ...d, vendedor: (narrativas.reps[d.ownerId] || {}).name || '—' }))
  },
  kpiDeltas,
  funil: hubspot.funil,
  funilLeads: hubspot.funilLeads || {},
  temperatura: temperaturaComPraca,
  stageMeta: hubspot.stageMeta || { slaDays: {}, descriptions: {}, labels: {} },
  saude,
  reps,
  leadsReferencia: leadsReferencia.pracas || [],
  footerText: `Fonte: HubSpot (pipeline 916011864, auto-atualizado diariamente) + Daily (prometido/realizado) · Leads críticos = mais antigos sem avanço de etapa.`,
  resumoSemanal: (resumoSemanal || weeklyRaw) ? {
    geradoEmFmt: resumoSemanal ? fmtDate(resumoSemanal.geradoEm) : null,
    numerosAtualizadosEmFmt: weeklyRaw ? fmtDate(weeklyRaw.geradoEm) : (resumoSemanal ? fmtDate(resumoSemanal.geradoEm) : null),
    janela: (weeklyRaw && weeklyRaw.janela) || (resumoSemanal && resumoSemanal.janela),
    kpisComparativo: (weeklyRaw && weeklyRaw.kpisComparativo) || (resumoSemanal && resumoSemanal.kpisComparativo),
    resumoGeral: resumoSemanal ? resumoSemanal.resumoGeral : null,
    comoAgir: resumoSemanal ? resumoSemanal.comoAgir : [],
    // Resumo individual por executivo (owner_id -> {name, resumoIndividual, comoAgirIndividual}).
    // Cada rep só vê o seu no Meu Painel; o gestor vê o coletivo acima + a lista completa.
    porRep: resumoSemanal ? (resumoSemanal.porRep || {}) : {},
    ganhosSemanaDetalhe: ganhosDetalheFresco,
    reunioesSemanaDetalhe: (weeklyRaw && weeklyRaw.reunioesSemanaDetalhe) || (resumoSemanal && resumoSemanal.reunioesSemanaDetalhe) || [],
    quentesDemoOuNegociacao: (weeklyRaw && weeklyRaw.quentesDemoOuNegociacao) || (resumoSemanal && resumoSemanal.quentesDemoOuNegociacao) || [],
    ranking: rankingSemanal
  } : null,
  usuarios: usuarios.usuarios,
  supabase: supabaseConfig ? { url: supabaseConfig.url, anonKey: supabaseConfig.anonKey } : null
};

const template = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');
const output = template.replace('{{DATA_JSON}}', JSON.stringify(DATA));

const publicDir = path.join(root, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'index.html'), output);

console.log('OK — public/index.html gerado com sucesso.');
