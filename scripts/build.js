// scripts/build.js
// Junta data/hubspot.json (auto) + data/expogo.json (manual) + data/narrativas.json (manual)
// e gera public/index.html — o arquivo que o Netlify publica.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const hubspot = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hubspot.json'), 'utf8'));
const expogo = JSON.parse(fs.readFileSync(path.join(root, 'data', 'expogo.json'), 'utf8'));
const narrativas = JSON.parse(fs.readFileSync(path.join(root, 'data', 'narrativas.json'), 'utf8'));

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// Ordem de exibição = ordem em que aparecem no narrativas.json
const ownerIds = Object.keys(narrativas.reps);

const reps = ownerIds.map(ownerId => {
  const n = narrativas.reps[ownerId];
  const h = hubspot.reps[ownerId] || { open: 0, stages: {}, criticos: [] };
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
    expogoVisitas: e.visitasGPS
  };
});

const DATA = {
  hubspotUpdatedAtFmt: fmtDate(hubspot.updatedAt),
  expogoJanela: expogo.janela,
  banner: expogo.banner,
  kpisHub: hubspot.kpis,
  kpisExpogo: expogo.kpis,
  funil: hubspot.funil,
  motivoPerda: expogo.motivoPerda,
  reps,
  footerText: `Fontes: HubSpot (pipeline 916011864, auto-atualizado diariamente) + Expogo (export RPA manual, janela ${expogo.janela}) · Leads críticos = mais antigos sem avanço de etapa · Compromissos marcados não são salvos ao recarregar a página.`
};

const template = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');
const output = template.replace('{{DATA_JSON}}', JSON.stringify(DATA));

const publicDir = path.join(root, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'index.html'), output);

console.log('OK — public/index.html gerado com sucesso.');
