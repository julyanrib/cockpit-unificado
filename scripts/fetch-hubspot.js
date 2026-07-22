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
  [STAGES.diagnostico]: 'Conversa com Decisor',
  [STAGES.demoProposta]: 'Demo/Proposta',
  [STAGES.negociacao]: 'Negociação',
  [STAGES.agPagamento]: 'Ag. Pagamento'
};

// SLA (dias máximos esperados) por etapa — usado pra sinalizar leads travados.
// Negociação (7d) e Ag. Pagamento (2d) confirmados com Julyan; os demais são estimativas
// operacionais razoáveis (ajustável aqui, sem precisar mexer no resto do código).
const SLA_DAYS = {
  [STAGES.prospeccao]: 3,
  [STAGES.visita]: 2,
  [STAGES.diagnostico]: 3,
  [STAGES.demoProposta]: 3,
  [STAGES.negociacao]: 7,
  [STAGES.agPagamento]: 2
};

// Descrições curtas de cada etapa, usadas nos tooltips do painel
const STAGE_DESCRIPTIONS = {
  [STAGES.prospeccao]: 'Primeiro contato feito (PAP). Deveria avançar ou virar decisão em até 3 dias.',
  [STAGES.visita]: 'Visita presencial já ocorreu. Esperado confirmar próximo passo em até 2 dias.',
  [STAGES.diagnostico]: 'Conversa com o decisor em andamento. SLA de 3 dias pra avançar pra demo.',
  [STAGES.demoProposta]: 'Demonstração feita, proposta em análise. SLA de 3 dias pra negociação.',
  [STAGES.negociacao]: 'Negociação de condições comerciais. SLA de 7 dias pra fechar.',
  [STAGES.agPagamento]: 'Contrato fechado, aguardando pagamento. SLA de 2 dias — gargalo crítico se estourar.'
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
  { ownerId: '86100505', name: 'Marco Filho' },
  { ownerId: '94079973', name: 'Michel Carvalho' }
];

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// HubSpot limita quantas chamadas podem chegar POR SEGUNDO. Por isso toda chamada
// passa por aqui: espera um pouco antes de cada uma, e se mesmo assim tomar 429
// (rate limit), espera mais e tenta de novo (até 5 vezes).
async function hsSearch(body, attempt = 1) {
  await sleep(350); // ~3 chamadas por segundo, bem abaixo do limite do HubSpot

  const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (res.status === 429 && attempt <= 5) {
    const waitMs = 1000 * attempt;
    console.log(`Rate limit do HubSpot — esperando ${waitMs}ms e tentando de novo (tentativa ${attempt}/5)...`);
    await sleep(waitMs);
    return hsSearch(body, attempt + 1);
  }

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

// Busca TODOS os leads abertos de uma etapa (time inteiro) — usado pro clique no funil.
// Precisa do nome do dono pra mostrar quem é o responsável na lista.
async function stageDealsTeamWide(stageId) {
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: stageId }
      ]
    }],
    properties: ['dealname', 'dealstage', 'createdate', 'hubspot_owner_id'],
    limit: 100,
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
  // Uma chamada de cada vez (não em paralelo) pra não estourar o limite de velocidade do HubSpot
  const backlog = await stageTotal(STAGES.backlog);
  const prospeccao = await stageTotal(STAGES.prospeccao);
  const visita = await stageTotal(STAGES.visita);
  const diagnostico = await stageTotal(STAGES.diagnostico);
  const demoProposta = await stageTotal(STAGES.demoProposta);
  const negociacao = await stageTotal(STAGES.negociacao);
  const agPagamento = await stageTotal(STAGES.agPagamento);
  const ganho1 = await stageTotal(STAGES.ganho1);
  const ganho2 = await stageTotal(STAGES.ganho2);
  const perdido = await stageTotal(STAGES.perdido);
  const reciclagem = await stageTotal(STAGES.reciclagem);

  const ganho = ganho1 + ganho2;
  const leadsCriados = await createdLast7Days();

  // ---- Leads por etapa, time inteiro (pro clique no funil) ----
  const ownerNameById = {};
  REPS.forEach(r => { ownerNameById[r.ownerId] = r.name; });

  const funilLeads = {};
  for (const stageId of OPEN_STAGES) {
    const deals = await stageDealsTeamWide(stageId);
    funilLeads[stageId] = deals.map(d => ({
      name: d.properties.dealname,
      id: d.id,
      dias: daysSince(d.properties.createdate),
      slaBreach: daysSince(d.properties.createdate) > (SLA_DAYS[stageId] || 999),
      vendedor: ownerNameById[d.properties.hubspot_owner_id] || '—'
    })).sort((a, b) => b.dias - a.dias);
  }

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
      dias: daysSince(d.properties.createdate),
      // SLA estourado = dias parado na etapa acima do limite esperado PARA AQUELA ETAPA
      slaBreach: daysSince(d.properties.createdate) > (SLA_DAYS[d.properties.dealstage] || 999)
    })).sort((a, b) => b.dias - a.dias);

    const leadsTravados = withDays.filter(l => l.slaBreach).length;

    // Top 5 mais antigos (referência rápida, independente de terem estourado SLA ou não)
    const criticos = withDays.slice(0, 5).map(l => ({
      ...l,
      destaque: l.slaBreach || l.dias > 60
    }));

    // TODOS os leads com SLA estourado — pra métrica completa no card do executivo,
    // não só uma amostra de 5. Ordenado do mais travado pro menos travado.
    const travados = withDays.filter(l => l.slaBreach).map(l => ({ ...l, destaque: true }));

    repsData[rep.ownerId] = {
      name: rep.name,
      open: deals.length,
      stages,
      criticos,
      travados,
      leadsTravados
    };
    emAbertoTime += deals.length;
  }

  const leadsTravadosTime = Object.values(repsData).reduce((sum, r) => sum + r.leadsTravados, 0);

  const output = {
    updatedAt: new Date().toISOString(),
    kpis: {
      leadsCriados,
      ganhos: ganho,
      perdidos: perdido,
      emAberto: emAbertoTime,
      emReciclagem: reciclagem,
      leadsTravados: leadsTravadosTime
    },
    funil: {
      labels: ['Backlog', 'Prospecção', 'Visita', 'Conversa com Decisor', 'Demo/Proposta', 'Negociação', 'Ag. Pagamento', 'Fechado/Onboarding', 'Perdido', 'Reciclagem'],
      valores: [backlog, prospeccao, visita, diagnostico, demoProposta, negociacao, agPagamento, ganho, perdido, reciclagem],
      cores: ['#5C6272', '#E8A33D', '#5B8DEF', '#6E7BF2', '#4FB6A8', '#D97BA8', '#E2543F', '#3FA98F', '#B5432F', '#8B92A3']
    },
    stageMeta: {
      slaDays: SLA_DAYS,
      descriptions: STAGE_DESCRIPTIONS,
      labels: STAGE_LABELS
    },
    funilLeads,
    reps: repsData
  };

  const outPath = path.join(__dirname, '..', 'data', 'hubspot.json');
  const previousPath = path.join(__dirname, '..', 'data', 'hubspot-previous.json');

  // Guarda o snapshot de KPIs de ANTES desta atualização, pra dar as setas de
  // comparação no painel ("vs. última atualização"). Só guarda os números
  // pequenos (kpis), não o dump inteiro, pra não pesar o repositório.
  if (fs.existsSync(outPath)) {
    try {
      const prevFull = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      fs.writeFileSync(previousPath, JSON.stringify({ updatedAt: prevFull.updatedAt, kpis: prevFull.kpis }, null, 2));
    } catch (e) {
      console.log('Aviso: não consegui ler o hubspot.json anterior pra guardar o snapshot de comparação:', e.message);
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`OK — dados gravados em ${outPath}`);
}

main().catch(err => {
  console.error('Falha ao buscar dados do HubSpot:', err.message);
  process.exit(1);
});
