// scripts/fetch-hubspot.js
// Roda 1x/dia via GitHub Actions. Busca dados FRESCOS do HubSpot e grava data/hubspot.json.
// Esse arquivo é a ÚNICA parte do cockpit que muda sozinha todo dia.
// Requer variável de ambiente HUBSPOT_TOKEN (Private App token, escopo crm.objects.deals.read).

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('ERRO: variável HUBSPOT_TOKEN não encontrada. Configure em GitHub → Settings → Secrets → Actions.');
  process.exit(1);
}

const PIPELINE_ID = '916011864';

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
  reciclagem: '1398311191'
};

const OPEN_STAGES = [STAGES.prospeccao, STAGES.visita, STAGES.diagnostico, STAGES.demoProposta, STAGES.negociacao, STAGES.agPagamento];

const STAGE_LABELS = {
  [STAGES.prospeccao]: 'Prospecção',
  [STAGES.visita]: 'Visita',
  [STAGES.diagnostico]: 'Diagnóstico',
  [STAGES.demoProposta]: 'Demo/Proposta',
  [STAGES.negociacao]: 'Negociação',
  [STAGES.agPagamento]: 'Ag. Pagamento'
};

// Reps ativos (nome bate com narrativas.json / expogo.json)
const REPS = [
  { ownerId: '86100506', name: 'Bruno Martins' },
  { ownerId: '91246642', name: 'Gleyson Gabrieli' },
  { ownerId: '87569072', name: 'Sandro Brito' },
  { ownerId: '91477292', name: 'Kelly Travieso Di Domenico' },
  { ownerId: '91246573', name: 'José Ricardo (Ricardo)' },
  { ownerId: '89842507', name: 'Wericles Andrade (Whell)' },
  { ownerId: '87069181', name: 'Amanda Pardim' },
  { ownerId: '86100505', name: 'Marco Filho' }
];

async function hsSearch(body) {
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function stageTotal(stageId, extraFilters = []) {
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: stageId },
        ...extraFilters
      ]
    }],
    limit: 1
  });
  return data.total || 0;
}

async function createdLast7Days() {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'createdate', operator: 'BETWEEN', value: String(sevenDaysAgo), highValue: String(now) }
      ]
    }],
    limit: 1
  });
  return data.total || 0;
}

async function repOpenDeals(ownerId) {
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
        { propertyName: 'dealstage', operator: 'IN', values: OPEN_STAGES }
      ]
    }],
    properties: ['dealname', 'dealstage', 'createdate'],
    limit: 200,
    sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }]
  });
  return data.results || [];
}

function daysSince(dateStr) {
  const created = new Date(dateStr).getTime();
  return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
}

async function main() {
  console.log('Buscando dados no HubSpot...');

  // ---- Funil geral (donut) ----
  const [backlog, prospeccao, visita, diagnostico, demoProposta, negociacao, agPagamento, ganho1, ganho2, perdido, reciclagem] =
    await Promise.all([
      stageTotal(STAGES.backlog),
      stageTotal(STAGES.prospeccao),
      stageTotal(STAGES.visita),
      stageTotal(STAGES.diagnostico),
      stageTotal(STAGES.demoProposta),
      stageTotal(STAGES.negociacao),
      stageTotal(STAGES.agPagamento),
      stageTotal(STAGES.ganho1),
      stageTotal(STAGES.ganho2),
      stageTotal(STAGES.perdido),
      stageTotal(STAGES.reciclagem)
    ]);

  const ganho = ganho1 + ganho2;
  const leadsCriados = await createdLast7Days();

  // ---- Por executivo ----
  const repsData = {};
  let emAbertoTime = 0;

  for (const rep of REPS) {
    const deals = await repOpenDeals(rep.ownerId);
    const stages = {};
    deals.forEach(d => {
      const s = d.properties.dealstage;
      stages[s] = (stages[s] || 0) + 1;
    });

    const withDays = deals.map(d => ({
      name: d.properties.dealname,
      id: d.id,
      stage: STAGE_LABELS[d.properties.dealstage] || d.properties.dealstage,
      stageId: d.properties.dealstage,
      dias: daysSince(d.properties.createdate)
    })).sort((a, b) => b.dias - a.dias);

    const criticos = withDays.slice(0, 5).map(l => ({
      ...l,
      // destaque automático: estourou SLA de Ag. Pagamento (2 dias) OU é outlier extremo (>60 dias parado)
      destaque: (l.stageId === STAGES.agPagamento && l.dias > 2) || l.dias > 60
    }));

    repsData[rep.ownerId] = {
      name: rep.name,
      open: deals.length,
      stages,
      criticos
    };
    emAbertoTime += deals.length;
  }

  const output = {
    updatedAt: new Date().toISOString(),
    kpis: {
      leadsCriados,
      ganhos: ganho,
      perdidos: perdido,
      emAberto: emAbertoTime,
      emReciclagem: reciclagem
    },
    funil: {
      labels: ['Backlog', 'Prospecção', 'Visita', 'Diagnóstico', 'Demo/Proposta', 'Negociação', 'Ag. Pagamento', 'Fechado/Onboarding', 'Perdido', 'Reciclagem'],
      valores: [backlog, prospeccao, visita, diagnostico, demoProposta, negociacao, agPagamento, ganho, perdido, reciclagem],
      cores: ['#5C6272', '#E8A33D', '#5B8DEF', '#6E7BF2', '#4FB6A8', '#D97BA8', '#E2543F', '#3FA98F', '#B5432F', '#8B92A3']
    },
    reps: repsData
  };

  const outPath = path.join(__dirname, '..', 'data', 'hubspot.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`OK — dados gravados em ${outPath}`);
}

main().catch(err => {
  console.error('Falha ao buscar dados do HubSpot:', err.message);
  process.exit(1);
});
