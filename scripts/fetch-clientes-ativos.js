// scripts/fetch-clientes-ativos.js
// Roda junto com o fetch-hubspot.js (mesmo GitHub Action / mesma cadência) e gera
// data/clientes-ativos.json — os restaurantes que JÁ SÃO clientes Takeat, com
// endereço geocodificado, pra sugerir parada de relacionamento/upsell na microrrota.
//
// Pedido do Julyan (10/08): a microrrota sugerida precisa saber quais clientes ativos
// existem na região que o executivo vai atuar hoje — não só leads novos.
//
// Pedido do Julyan (10/08, 2ª rodada): puxar TAMBÉM os ganhos do pipeline de Inside
// Sales (não só Field Sales), e cruzar com os pipelines de Onboarding e Sucesso pra
// saber quem de fato "pegou" no produto — um negócio ganho que nunca saiu do
// Onboarding ou que morreu no Sucesso (perdido/cancelado) não é o mesmo tipo de
// cliente ativo que um que já está com sucesso confirmado. status reflete isso:
//   'ativo'      -> tem negócio em Sucesso (87367429) que não está fechado/perdido
//   'onboarding' -> ganho, mas ainda não apareceu no pipeline de Sucesso
//   'encerrado'  -> teve passagem por Sucesso mas fechou como perdido (churn) —
//                   entra no arquivo pra transparência, mas o front-end não deve
//                   sugerir como parada (ver flag `sugerirVisita`).
//
// IDs confirmados via HubSpot (10/08/26):
//   Field Sales   = 916011864  (ganho: 1396006162, 1396006163)
//   Inside Sales  = default     (ganho: 94669416)
//   Onboarding    = 87106112
//   Sucesso       = 87367429
//
// RESOLVIDO (10/08, 3ª rodada) — "comandas" é `pedidos_entregues`, campo numérico de
// deals, populado nos negócios do pipeline de Sucesso (87367429). Achado via busca de
// propriedades por palavra-chave (search_properties) — o nome não tinha "comanda" nem
// "pedido" óbvio de bater com as tentativas anteriores. Só ~30 negócios no portal têm
// esse campo preenchido hoje (dado ainda não é universal), então nem todo cliente
// ativo vai ter um número aqui — `comandas: null` continua acontecendo pra quem não
// tem o campo preenchido, e isso é esperado, não um bug. Clientes com mais de 500
// comandas ganham destaque (`altoVolume: true`) — ver campo no resultado.
const LIMITE_ALTO_VOLUME = 500;
//
// Geocodifica com a MESMA chave MapTiler do resto do cockpit (data/maptiler-config.json).
// Cacheia por company_id: só geocodifica de novo se o endereço mudou desde a última
// execução — MapTiler tem cota, e re-geocodificar 100+ endereços por dia sem necessidade
// é desperdício.

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('ERRO: variável HUBSPOT_TOKEN não encontrada. Configure em GitHub → Settings → Secrets → Actions.');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const OUT_PATH = path.join(root, 'data', 'clientes-ativos.json');

let MAPTILER_KEY = null;
try {
  MAPTILER_KEY = require(path.join(root, 'data', 'maptiler-config.json')).key || null;
} catch (e) {
  console.warn('Aviso: data/maptiler-config.json não encontrado — clientes ativos serão salvos SEM coordenada.');
}

const PIPELINE_FIELD_SALES = '916011864';
const GANHO_FIELD_SALES = ['1396006162', '1396006163'];

const PIPELINE_INSIDE_SALES = 'default';
const GANHO_INSIDE_SALES = ['94669416'];

const PIPELINE_ONBOARDING = '87106112';
const PIPELINE_SUCESSO = '87367429';

// Mesma lista de owners ativos do fetch-hubspot.js — mantida aqui separadamente de
// propósito: este script não deve quebrar se a lista de reps mudar antes de eu
// lembrar de sincronizar os dois arquivos, então falha graciosamente pra quem não
// bate (não descarta silenciosamente — ver aviso no fim).
const REPS = [
  { ownerId: '86100506', name: 'Bruno Martins' },
  { ownerId: '87569072', name: 'Sandro Brito' },
  { ownerId: '91477292', name: 'Kelly Travieso Di Domenico' },
  { ownerId: '89842507', name: 'Wericles Andrade (Whell)' },
  { ownerId: '87069181', name: 'Amanda Pardim' },
  { ownerId: '86100505', name: 'Marco Filho' },
  { ownerId: '94079973', name: 'Michel Carvalho' }
];
const OWNER_IDS = REPS.map(r => r.ownerId);

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function hsSearchTipo(objectType, body, attempt = 1) {
  await sleep(350);
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 429 && attempt <= 5) {
    const waitMs = 1000 * attempt;
    console.log(`Rate limit do HubSpot (${objectType}) — esperando ${waitMs}ms (tentativa ${attempt}/5)...`);
    await sleep(waitMs);
    return hsSearchTipo(objectType, body, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status} em ${objectType}: ${text}`);
  }
  return res.json();
}

async function hsSearchTipoAll(objectType, body) {
  let todos = [];
  let after = undefined;
  let seguraLoop = 0;
  while (seguraLoop < 60) {
    seguraLoop++;
    const data = await hsSearchTipo(objectType, { ...body, limit: 100, after });
    todos = todos.concat(data.results || []);
    after = data.paging && data.paging.next ? data.paging.next.after : null;
    if (!after) break;
  }
  return todos;
}

async function hsAssociacoes(objectType, objectId, toType) {
  await sleep(350);
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/${objectId}/associations/${toType}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results || []).map(r => r.id || r.toObjectId);
}

async function hsGetCompany(companyId, attempt = 1) {
  await sleep(350);
  const props = 'name,address,city,zip,phone';
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=${props}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * attempt);
    return hsGetCompany(companyId, attempt + 1);
  }
  if (!res.ok) return null;
  return res.json();
}

// Todos os negócios (qualquer etapa) que essa empresa tem no pipeline informado —
// usado pra descobrir a situação em Onboarding/Sucesso, não só se ganhou ou não.
async function hsDealsDaCompanyNoPipeline(companyId, pipelineId) {
  const dealIds = await hsAssociacoes('companies', companyId, 'deals');
  if (!dealIds.length) return [];
  await sleep(350);
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/batch/read`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // pedidos_entregues (10/08, achado via search_properties): é o campo real de
      // "comandas" — número de pedidos entregues, populado no pipeline de Sucesso.
      // Confirmado com o Julyan que é o dado certo de volume de uso do produto.
      properties: ['pipeline', 'dealstage', 'hs_is_closed_won', 'hs_is_closed_lost', 'closedate', 'pedidos_entregues'],
      inputs: dealIds.map(id => ({ id }))
    })
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results || []).filter(d => d.properties.pipeline === pipelineId);
}

async function geocodificar(endereco) {
  if (!MAPTILER_KEY || !endereco) return null;
  try {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(endereco)}.json?key=${MAPTILER_KEY}&country=br&language=pt`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    const top = (json.features || [])[0];
    if (!top || !Array.isArray(top.center)) return null;
    const [lng, lat] = top.center;
    return { lat, lng };
  } catch (e) {
    console.error('Erro ao geocodificar cliente ativo:', e.message);
    return null;
  }
}

// Status real do cliente cruzando Onboarding + Sucesso, e volume de comandas (pedidos
// entregues) — pedido do Julyan (10/08): destacar quem tem mais de 500 comandas.
async function statusCicloDeVida(companyId) {
  const dealsSucesso = await hsDealsDaCompanyNoPipeline(companyId, PIPELINE_SUCESSO);
  // Maior valor de pedidos_entregues entre os negócios de Sucesso dessa empresa —
  // se houver mais de um (raro), usa o mais alto em vez de somar, porque não temos
  // garantia de que sejam períodos diferentes (podem ser o mesmo total duplicado).
  const comandas = dealsSucesso.reduce((max, d) => {
    const v = Number(d.properties.pedidos_entregues);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0) || null;

  if (dealsSucesso.length > 0) {
    const algumAtivo = dealsSucesso.some(d => d.properties.hs_is_closed_lost !== 'true');
    if (algumAtivo) return { status: 'ativo', sugerirVisita: true, comandas };
    return { status: 'encerrado', sugerirVisita: false, comandas };
  }
  const dealsOnboarding = await hsDealsDaCompanyNoPipeline(companyId, PIPELINE_ONBOARDING);
  if (dealsOnboarding.length > 0) return { status: 'onboarding', sugerirVisita: true, comandas: null };
  return { status: 'desconhecido', sugerirVisita: true, comandas: null };
}

async function main() {
  console.log('Buscando negócios GANHOS do Field Sales e do Inside Sales para montar a lista de clientes ativos...');

  const dealsFieldSales = await hsSearchTipoAll('deals', {
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_FIELD_SALES },
        { propertyName: 'dealstage', operator: 'IN', values: GANHO_FIELD_SALES },
        { propertyName: 'hubspot_owner_id', operator: 'IN', values: OWNER_IDS }
      ]
    }],
    properties: ['dealname', 'hubspot_owner_id', 'closedate', 'amount_in_home_currency']
  });
  console.log(`${dealsFieldSales.length} negócios ganhos no Field Sales.`);

  const dealsInsideSales = await hsSearchTipoAll('deals', {
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_INSIDE_SALES },
        { propertyName: 'dealstage', operator: 'IN', values: GANHO_INSIDE_SALES }
      ]
    }],
    properties: ['dealname', 'hubspot_owner_id', 'closedate', 'amount_in_home_currency']
  });
  console.log(`${dealsInsideSales.length} negócios ganhos no Inside Sales.`);

  // cache anterior — reaproveita coordenada se o endereço não mudou, poupando cota da MapTiler
  let cacheAnterior = {};
  try {
    const anterior = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    (Array.isArray(anterior) ? anterior : []).forEach(c => { cacheAnterior[c.id] = c; });
  } catch (e) { /* primeira execução, sem cache — segue normal */ }

  // companyId -> { ownerId, dealId, closedate, valor, origem: 'field_sales'|'inside_sales' }
  // Field Sales entra DEPOIS de Inside Sales de propósito: se a mesma empresa tiver
  // ganho nos dois pipelines (upsell trabalhado pelo Field Sales depois da venda
  // original do Inside Sales), o registro do Field Sales prevalece — é o dono real
  // do relacionamento de campo hoje, o que importa pra rota.
  const porCompany = new Map();
  async function registrarGanhos(deals, origem) {
    for (const deal of deals) {
      const companyIds = await hsAssociacoes('deals', deal.id, 'companies');
      const ownerId = deal.properties.hubspot_owner_id;
      const valor = Number(deal.properties.amount_in_home_currency) || 0;
      companyIds.forEach(cid => {
        const existente = porCompany.get(cid);
        const maisRecente = !existente || new Date(deal.properties.closedate) > new Date(existente.closedate);
        if (maisRecente || (origem === 'field_sales' && existente.origem === 'inside_sales')) {
          porCompany.set(cid, { ownerId, dealId: deal.id, closedate: deal.properties.closedate, valor, origem });
        }
      });
    }
  }
  await registrarGanhos(dealsInsideSales, 'inside_sales');
  await registrarGanhos(dealsFieldSales, 'field_sales');
  console.log(`${porCompany.size} empresas únicas com negócio ganho (Field Sales + Inside Sales).`);

  const resultado = [];
  const contagemStatus = { ativo: 0, onboarding: 0, encerrado: 0, desconhecido: 0 };
  let geocodificados = 0, reaproveitados = 0, semEndereco = 0, semCoordenada = 0;

  for (const [companyId, meta] of porCompany.entries()) {
    const company = await hsGetCompany(companyId);
    if (!company) continue;
    const p = company.properties || {};
    const nome = p.name || 'Sem nome';
    const endereco = [p.address, p.city].filter(Boolean).join(', ');
    const cacheado = cacheAnterior[companyId];

    let lat = null, lng = null;
    if (!endereco) {
      semEndereco++;
    } else if (cacheado && cacheado._enderecoOrigem === endereco && cacheado.lat != null) {
      lat = cacheado.lat; lng = cacheado.lng;
      reaproveitados++;
    } else {
      const geo = await geocodificar(endereco);
      if (geo) { lat = geo.lat; lng = geo.lng; geocodificados++; }
      else semCoordenada++;
    }

    const ciclo = await statusCicloDeVida(companyId);
    contagemStatus[ciclo.status] = (contagemStatus[ciclo.status] || 0) + 1;

    resultado.push({
      id: companyId,
      nome,
      endereco: p.address || null,
      cidade: p.city || null,
      telefone: p.phone || null,
      // ownerId só é um Field Sales real quando origem === 'field_sales' — pra clientes
      // que só passaram pelo Inside Sales, esse ownerId é do INSIDE SALES, e a scoping
      // por executivo de campo (montar-dados.js) trata isso combinando com a cidade,
      // nunca por igualdade direta de ownerId. Ver comentário lá.
      ownerId: meta.ownerId,
      origemPipeline: meta.origem,
      dealId: meta.dealId,
      fechadoEm: meta.closedate,
      valorFechamento: meta.valor,
      status: ciclo.status,
      sugerirVisita: ciclo.sugerirVisita,
      // Pedidos entregues (comandas) do negócio de Sucesso — null quando o campo
      // não está preenchido pra essa empresa (comum, ver comentário no topo).
      comandas: ciclo.comandas,
      altoVolume: ciclo.comandas != null && ciclo.comandas > LIMITE_ALTO_VOLUME,
      lat, lng,
      _enderecoOrigem: endereco || null // só pro cache da próxima execução, não é exibido
    });
  }

  // Cliente de alto volume primeiro — é quem mais justifica uma parada de
  // relacionamento hoje. Dentro do mesmo patamar, mantém a ordem de descoberta.
  resultado.sort((a, b) => (b.altoVolume - a.altoVolume) || ((b.comandas || 0) - (a.comandas || 0)));

  fs.writeFileSync(OUT_PATH, JSON.stringify(resultado, null, 2));
  const altoVolumeCount = resultado.filter(c => c.altoVolume).length;
  console.log(`OK — data/clientes-ativos.json gerado com ${resultado.length} clientes.`);
  console.log(`  status: ${JSON.stringify(contagemStatus)} · alto volume (>${LIMITE_ALTO_VOLUME} comandas): ${altoVolumeCount}`);
  console.log(`  geocodificados agora: ${geocodificados} · reaproveitados do cache: ${reaproveitados} · sem endereço: ${semEndereco} · endereço não localizado: ${semCoordenada}`);
}

main().catch(e => {
  console.error('Falha ao gerar clientes-ativos.json:', e);
  process.exit(1);
});

