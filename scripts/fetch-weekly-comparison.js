// scripts/fetch-weekly-comparison.js
// Roda toda SEGUNDA-FEIRA via GitHub Actions. Compara a semana que passou com a anterior
// e grava data/weekly-raw.json — que o generate-weekly-summary.js usa pra pedir o resumo à Claude.

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('ERRO: variável HUBSPOT_TOKEN não encontrada.');
  process.exit(1);
}

const PIPELINE_ID = '916011864';
const STAGES = {
  ganho1: '1396006162',
  ganho2: '1396006163',
  perdido: '1396006164',
  reciclagem: '1398311191'
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function hsSearch(body, attempt = 1) {
  await sleep(350);
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * attempt);
    return hsSearch(body, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${text}`);
  }
  return res.json();
}

function fmtRange(start, end) {
  const f = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${f(start)}–${f(end)}/${end.getFullYear()}`;
}

async function countBy(propertyName, filters) {
  const data = await hsSearch({
    filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID }, ...filters] }],
    limit: 1
  });
  return data.total || 0;
}

async function windowCounts(startMs, endMs) {
  const dateFilter = (prop) => ({ propertyName: prop, operator: 'BETWEEN', value: String(startMs), highValue: String(endMs) });

  const leadsCriados = await countBy(null, [dateFilter('createdate')]);
  const ganho1 = await countBy(null, [{ propertyName: 'dealstage', operator: 'EQ', value: STAGES.ganho1 }, dateFilter('hs_lastmodifieddate')]);
  const ganho2 = await countBy(null, [{ propertyName: 'dealstage', operator: 'EQ', value: STAGES.ganho2 }, dateFilter('hs_lastmodifieddate')]);
  const perdidos = await countBy(null, [{ propertyName: 'dealstage', operator: 'EQ', value: STAGES.perdido }, dateFilter('hs_lastmodifieddate')]);
  const reciclagem = await countBy(null, [{ propertyName: 'dealstage', operator: 'EQ', value: STAGES.reciclagem }, dateFilter('hs_lastmodifieddate')]);

  return { leadsCriados, ganhos: ganho1 + ganho2, perdidos, reciclagem };
}

async function main() {
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;

  const atualFim = now;
  const atualInicio = new Date(now.getTime() - 6 * DAY);
  const anteriorFim = new Date(atualInicio.getTime() - DAY);
  const anteriorInicio = new Date(anteriorFim.getTime() - 6 * DAY);

  console.log('Buscando semana atual...');
  const atual = await windowCounts(atualInicio.getTime(), atualFim.getTime());
  console.log('Buscando semana anterior...');
  const anterior = await windowCounts(anteriorInicio.getTime(), anteriorFim.getTime());

  // Reaproveita o snapshot de hoje (já buscado pelo job diário) pra dar contexto de gargalo por executivo
  const hubspotPath = path.join(__dirname, '..', 'data', 'hubspot.json');
  const hubspotSnapshot = fs.existsSync(hubspotPath) ? JSON.parse(fs.readFileSync(hubspotPath, 'utf8')) : null;

  const output = {
    geradoEm: now.toISOString(),
    janela: {
      atual: fmtRange(atualInicio, atualFim),
      anterior: fmtRange(anteriorInicio, anteriorFim)
    },
    kpisComparativo: { atual, anterior },
    snapshotReps: hubspotSnapshot ? hubspotSnapshot.reps : {}
  };

  fs.writeFileSync(path.join(__dirname, '..', 'data', 'weekly-raw.json'), JSON.stringify(output, null, 2));
  console.log('OK — data/weekly-raw.json gravado.');
}

main().catch(err => {
  console.error('Falha ao buscar comparação semanal:', err.message);
  process.exit(1);
});
