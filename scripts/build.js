// scripts/build.js
// Junta data/hubspot.json (auto) + data/expogo.json (manual) + data/narrativas.json (manual)
// e gera public/index.html — o arquivo que o Netlify publica.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const hubspot = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hubspot.json'), 'utf8'));
const expogo = JSON.parse(fs.readFileSync(path.join(root, 'data', 'expogo.json'), 'utf8'));
const narrativas = JSON.parse(fs.readFileSync(path.join(root, 'data', 'narrativas.json'), 'utf8'));

// Resumo semanal é opcional — só existe depois que o workflow de segunda-feira rodar pela 1ª vez
const resumoSemanalPath = path.join(root, 'data', 'resumo-semanal.json');
const resumoSemanal = fs.existsSync(resumoSemanalPath)
  ? JSON.parse(fs.readFileSync(resumoSemanalPath, 'utf8'))
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
  const h = hubspot.reps[ownerId] || { open: 0, stages: {}, criticos: [], travados: [], leadsTravados: 0 };
  const e = (expogo.porExecutivo && expogo.porExecutivo[ownerId]) || { visitasGPS: 0 };

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
    expogoVisitas: e.visitasGPS
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
  emReciclagem: delta(hubspot.kpis.emReciclagem, hubspotPrevious.kpis.emReciclagem)
} : null;

const DATA = {
  hubspotUpdatedAtFmt: fmtDate(hubspot.updatedAt),
  expogoJanela: expogo.janela,
  banner: expogo.banner,
  kpisHub: hubspot.kpis,
  kpisExpogo: expogo.kpis,
  kpiDeltas,
  funil: hubspot.funil,
  funilLeads: hubspot.funilLeads || {},
  stageMeta: hubspot.stageMeta || { slaDays: {}, descriptions: {}, labels: {} },
  motivoPerda: expogo.motivoPerda,
  saude,
  reps,
  footerText: `Fontes: HubSpot (pipeline 916011864, auto-atualizado diariamente) + Expogo (export RPA manual, janela ${expogo.janela}) · Leads críticos = mais antigos sem avanço de etapa · Compromissos marcados não são salvos ao recarregar a página.`,
  resumoSemanal: resumoSemanal ? {
    geradoEmFmt: fmtDate(resumoSemanal.geradoEm),
    janela: resumoSemanal.janela,
    kpisComparativo: resumoSemanal.kpisComparativo,
    resumoGeral: resumoSemanal.resumoGeral,
    comoAgir: resumoSemanal.comoAgir,
    porExecutivo: (resumoSemanal.porExecutivo || []).map(p => ({
      ...p,
      name: (narrativas.reps[p.ownerId] || {}).name || p.ownerId
    }))
  } : null
};

const template = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');
const output = template.replace('{{DATA_JSON}}', JSON.stringify(DATA));

const publicDir = path.join(root, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'index.html'), output);

console.log('OK — public/index.html gerado com sucesso.');
