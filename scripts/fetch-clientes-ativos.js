// scripts/fetch-clientes-ativos.js
// Roda junto com o fetch-hubspot.js (mesmo GitHub Action / mesma cadência) e gera
// data/clientes-ativos.json — os restaurantes que JÁ SÃO clientes Takeat, com
// endereço geocodificado, pra sugerir parada de relacionamento/upsell na microrrota.
//
// Pedido do Julyan (10/08): a microrrota sugerida precisa saber quais clientes ativos
// existem na região que o executivo vai atuar hoje — não só leads novos.
//
// CORREÇÃO DE ARQUITETURA (10/08, 4ª rodada) — a 1ª versão deste script buscava a
// empresa a partir do negócio GANHO no Field Sales/Inside Sales, e sempre dava vazio.
// Motivo real, confirmado testando várias amostras: um negócio recém-ganho SÓ tem
// contato vinculado — a Empresa (Company) só passa a existir e ser associada quando a
// conta entra de verdade no pipeline de Sucesso (87367429). Ou seja, ir de
// "ganho → empresa" bate numa porta vazia sempre; o caminho certo é o contrário:
// partir do pipeline de SUCESSO (onde a empresa já existe de verdade) e usar isso
// como fonte única de "cliente ativo". Consequência aceita: não dá pra saber se o
// cliente veio do Field Sales ou do Inside Sales (esse vínculo se perde — o negócio
// de Sucesso não carrega o negócio de venda original), então `origemPipeline` saiu
// do arquivo. A régua de "de quem é esse cliente" também mudou: como não existe
// vínculo confiável com um executivo de campo, todo cliente ativo é atribuído por
// CIDADE (praça), não por dono do negócio — ver montar-dados.js.
//
// status:
//   'ativo'     -> tem negócio em Sucesso que não está fechado como perdido
//   'encerrado' -> todos os negócios de Sucesso da empresa estão perdidos (churn) —
//                  entra no arquivo pra transparência, mas sugerirVisita fica falso
//
// "comandas" = propriedade `pedidos_entregues` (achada via busca de propriedades por
// palavra-chave), populada nos negócios de Sucesso. Cliente com mais de 500 comandas
// ganha `altoVolume: true` e é destacado primeiro na lista (pedido do Julyan, 10/08).
//
// PERFORMANCE — o pipeline de Sucesso tem ~5.200 negócios (muitos por empresa, ciclo
// recorrente de acompanhamento), então este script usa as APIs em LOTE da HubSpot
// (batch de associações e batch de leitura de empresas, até 100 por chamada) em vez
// de uma chamada por negócio — a versão anterior fazia isso um por um e ficava lenta
// à toa mesmo quando funcionava.
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

const PIPELINE_SUCESSO = '87367429';
const LIMITE_ALTO_VOLUME = 500;

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
  while (seguraLoop < 80) {
    seguraLoop++;
    const data = await hsSearchTipo(objectType, { ...body, limit: 100, after });
    todos = todos.concat(data.results || []);
    after = data.paging && data.paging.next ? data.paging.next.after : null;
    if (!after) break;
  }
  return todos;
}

function chunk(arr, tam) {
  const partes = [];
  for (let i = 0; i < arr.length; i += tam) partes.push(arr.slice(i, i + tam));
  return partes;
}

// Associações em lote (até 100 IDs por chamada) — dealId -> [companyId, ...].
// Muito mais rápido que uma chamada por negócio (o pipeline de Sucesso tem milhares).
async function hsAssociacoesEmLote(fromType, toType, ids, attempt = 1) {
  if (!ids.length) return {};
  await sleep(350);
  const res = await fetch(`https://api.hubapi.com/crm/v4/associations/${fromType}/${toType}/batch/read`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: ids.map(id => ({ id: String(id) })) })
  });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * attempt);
    return hsAssociacoesEmLote(fromType, toType, ids, attempt + 1);
  }
  if (!res.ok) {
    console.error(`Aviso: falha ao buscar associações ${fromType}->${toType} em lote (${res.status}) — esse lote fica sem empresa.`);
    return {};
  }
  const json = await res.json();
  const mapa = {};
  (json.results || []).forEach(r => {
    const fromId = r.from && r.from.id;
    if (!fromId) return;
    mapa[fromId] = (r.to || []).map(t => t.toObjectId);
  });
  return mapa;
}

// Leitura em lote de propriedades de objetos (até 100 por chamada).
async function hsBatchRead(objectType, ids, properties, attempt = 1) {
  if (!ids.length) return [];
  await sleep(350);
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/batch/read`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties, inputs: ids.map(id => ({ id: String(id) })) })
  });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * attempt);
    return hsBatchRead(objectType, ids, properties, attempt + 1);
  }
  if (!res.ok) {
    console.error(`Aviso: falha na leitura em lote de ${objectType} (${res.status}) — esse lote fica de fora.`);
    return [];
  }
  const json = await res.json();
  return json.results || [];
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

async function main() {
  console.log('Buscando negócios do pipeline de Sucesso (fonte real de "cliente ativo")...');

  const dealsSucesso = await hsSearchTipoAll('deals', {
    filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_SUCESSO }] }],
    properties: ['dealstage', 'hs_is_closed_lost', 'pedidos_entregues', 'closedate']
  });
  console.log(`${dealsSucesso.length} negócios encontrados no pipeline de Sucesso.`);

  // Associação em lote deal -> company (v4, até 100 por chamada)
  const dealIds = dealsSucesso.map(d => d.id);
  let assocMap = {};
  for (const lote of chunk(dealIds, 100)) {
    const parcial = await hsAssociacoesEmLote('deals', 'companies', lote);
    Object.assign(assocMap, parcial);
  }

  // Agrega por empresa: mais de um negócio de Sucesso pode existir pra mesma empresa
  // (acompanhamento recorrente) — junta o maior pedidos_entregues visto e marca ativo
  // se PELO MENOS UM desses negócios não estiver perdido.
  const porCompany = new Map(); // companyId -> { comandas, algumAtivo }
  dealsSucesso.forEach(d => {
    const companyIds = assocMap[d.id] || [];
    if (!companyIds.length) return;
    const comandasDoDeal = Number(d.properties.pedidos_entregues);
    const ativo = d.properties.hs_is_closed_lost !== 'true';
    companyIds.forEach(cid => {
      const atual = porCompany.get(cid) || { comandas: null, algumAtivo: false };
      const comandas = Number.isFinite(comandasDoDeal) && (atual.comandas == null || comandasDoDeal > atual.comandas)
        ? comandasDoDeal : atual.comandas;
      porCompany.set(cid, { comandas, algumAtivo: atual.algumAtivo || ativo });
    });
  });
  const totalAtivas = Array.from(porCompany.values()).filter(c => c.algumAtivo).length;
  console.log(`${porCompany.size} empresas únicas encontradas via Sucesso (${totalAtivas} ativas).`);

  // Leitura em lote dos dados da empresa (nome/endereço/cidade/telefone)
  const companyIds = Array.from(porCompany.keys());
  let empresas = [];
  for (const lote of chunk(companyIds, 100)) {
    const parcial = await hsBatchRead('companies', lote, ['name', 'address', 'city', 'zip', 'phone']);
    empresas = empresas.concat(parcial);
  }

  // cache anterior — reaproveita coordenada se o endereço não mudou, poupando cota da MapTiler
  let cacheAnterior = {};
  try {
    const anterior = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    (Array.isArray(anterior) ? anterior : []).forEach(c => { cacheAnterior[c.id] = c; });
  } catch (e) { /* primeira execução, sem cache — segue normal */ }

  const resultado = [];
  let geocodificados = 0, reaproveitados = 0, semEndereco = 0, semCoordenada = 0;

  for (const company of empresas) {
    const companyId = company.id;
    const meta = porCompany.get(companyId);
    if (!meta) continue;
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

    const status = meta.algumAtivo ? 'ativo' : 'encerrado';
    resultado.push({
      id: companyId,
      nome,
      endereco: p.address || null,
      cidade: p.city || null,
      telefone: p.phone || null,
      status,
      sugerirVisita: meta.algumAtivo,
      comandas: meta.comandas,
      altoVolume: meta.comandas != null && meta.comandas > LIMITE_ALTO_VOLUME,
      lat, lng,
      _enderecoOrigem: endereco || null // só pro cache da próxima execução, não é exibido
    });
  }

  resultado.sort((a, b) => (b.altoVolume - a.altoVolume) || ((b.comandas || 0) - (a.comandas || 0)));

  fs.writeFileSync(OUT_PATH, JSON.stringify(resultado, null, 2));
  const ativos = resultado.filter(c => c.status === 'ativo').length;
  const altoVolumeCount = resultado.filter(c => c.altoVolume).length;
  console.log(`OK — data/clientes-ativos.json gerado com ${resultado.length} clientes (${ativos} ativos, ${resultado.length - ativos} encerrados).`);
  console.log(`  alto volume (>${LIMITE_ALTO_VOLUME} comandas): ${altoVolumeCount}`);
  console.log(`  geocodificados agora: ${geocodificados} · reaproveitados do cache: ${reaproveitados} · sem endereço: ${semEndereco} · endereço não localizado: ${semCoordenada}`);
}

main().catch(e => {
  console.error('Falha ao gerar clientes-ativos.json:', e);
  process.exit(1);
});
