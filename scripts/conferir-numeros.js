// scripts/conferir-numeros.js
//
// A CONFERÊNCIA AUTOMÁTICA DOS NÚMEROS (Julyan, 26/10/26: "preciso de tudo perfeito, números sempre
// sincronizados, reais ... cria a conferência automática"). Roda no fim de cada rodada do robô
// (daily-refresh) e compara o que o Cockpit mostra com a fonte de cada número:
//
//   1 · frescor   — o snapshot tem no máximo 3 h em dia útil, das 8h às 19h;
//   2 · vendas    — as vendas do mês no snapshot × os negócios ganhos do mês no HubSpot;
//   3 · quentes   — Decisor, Demo e Negociação no snapshot × os mesmos no HubSpot;
//   4 · plano     — as contas do dia no Planejamento × as paradas da rota do app (o banco).
//
// O QUE NÃO É DIVERGÊNCIA: negócio que mudou no HubSpot DEPOIS do snapshot (a próxima rodada pega),
// negócio de teste (mesma regra do robô) e as vendas com ajuste registrado em data/metas.json
// (competência e venda confirmada pelo gestor), que divergem do CRM de propósito.
//
// O resultado vai em sync-status.conferencia (o Cockpit do gestor lê de DATA.syncStatus). Nunca
// derruba a rodada: qualquer erro aqui vira um item "não consegui conferir", e o passo do workflow
// tem continue-on-error.
const { publicarSnapshot, lerSnapshot } = require('../lib/publicar-snapshot.js');
const REALIZADO = require('../lib/realizado.js');
const METAS = require('../data/metas.json');

const TOKEN = process.env.HUBSPOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PIPELINE = '916011864';
const GANHO = ['1396006162', '1396006163'];
const QUENTES = { '1395880470': 'Decisor', '1395880471': 'Demo/Proposta', '1395880472': 'Negociação' };

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const agoraBR = () => new Date(Date.now() - 3 * 3600000);

async function hsBuscaTudo(filtros, props) {
  const todos = [];
  let after;
  for (let pagina = 0; pagina < 30; pagina++) {
    let res;
    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      await espera(250);
      res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterGroups: [{ filters: filtros }], properties: props, limit: 100, after }),
      });
      if (res.status !== 429) break;
      await espera(1000 * tentativa);
    }
    if (!res.ok) throw new Error('HubSpot ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const j = await res.json();
    todos.push(...(j.results || []));
    after = j.paging && j.paging.next && j.paging.next.after;
    if (!after) break;
  }
  return todos;
}

async function hsLerEmLote(ids, props) {
  const mapa = {};
  for (let i = 0; i < ids.length; i += 100) {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: props, inputs: ids.slice(i, i + 100).map((id) => ({ id: String(id) })) }),
    });
    if (!res.ok) throw new Error('HubSpot lote ' + res.status);
    const j = await res.json();
    (j.results || []).forEach((d) => { mapa[String(d.id)] = d.properties || {}; });
  }
  return mapa;
}

async function supa(caminho) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + caminho, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY },
  });
  if (!res.ok) throw new Error('Supabase ' + caminho.split('?')[0] + ' ' + res.status);
  return res.json();
}

/* A comparação de dois conjuntos de negócios. `depoisDoSnap` é o filtro do "mudou depois": quem mudou
   no HubSpot depois da foto do snapshot não é divergência, é a próxima rodada. */
function diferencas(hsMapa, snapMapa, ignorar, depoisDoSnap) {
  const faltam = Object.keys(hsMapa).filter((id) => !snapMapa[id] && !ignorar.has(id) && !depoisDoSnap(id));
  const sobram = Object.keys(snapMapa).filter((id) => !hsMapa[id] && !ignorar.has(id) && !depoisDoSnap(id));
  return { faltam, sobram };
}

async function conferir() {
  const itens = [];
  const checado = {};
  const snap = await lerSnapshot('hubspot');
  if (!snap) return { itens: [{ tipo: 'erro', texto: 'Não consegui ler o snapshot do HubSpot.' }], checado };
  const snapEm = Date.parse(snap.updatedAt || '') || 0;
  checado.snapshotEm = snap.updatedAt || null;
  const donos = Object.keys(snap.reps || {});
  const nomeDe = (o) => ((snap.reps || {})[o] || {}).name || o;

  // 1 · frescor
  const br = agoraBR();
  const diaUtil = br.getUTCDay() >= 1 && br.getUTCDay() <= 5;
  const horaBR = br.getUTCHours();
  const idadeH = snapEm ? (Date.now() - snapEm) / 3600000 : 99;
  checado.idadeHoras = Math.round(idadeH * 10) / 10;
  if (diaUtil && horaBR >= 8 && horaBR < 19 && idadeH > 3) {
    itens.push({ tipo: 'frescor', texto: 'O Cockpit está com dados de ' + Math.round(idadeH) + ' h atrás (o robô deveria atualizar a cada 2 h).' });
  }

  const ajustados = new Set([].concat(
    (METAS.competencia || []).map((c) => String(c.dealId)),
    (METAS.vendasConfirmadas || []).map((c) => String(c.dealId)),
  ));
  const mudouDepois = {};
  const depoisDoSnap = (id) => !!mudouDepois[id];

  // 2 · vendas do mês
  const inicioMes = Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0);
  const ganhos = (await hsBuscaTudo([
    { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE },
    { propertyName: 'dealstage', operator: 'IN', values: GANHO },
    { propertyName: 'closedate', operator: 'GTE', value: String(inicioMes) },
    { propertyName: 'hubspot_owner_id', operator: 'IN', values: donos },
  ], ['dealname', 'hubspot_owner_id', 'hs_lastmodifieddate', 'closedate'])).filter((d) => !REALIZADO.ehNegocioExcluido(d));
  const hsVendas = {};
  ganhos.forEach((d) => {
    hsVendas[String(d.id)] = d.properties;
    if (Date.parse(d.properties.hs_lastmodifieddate || '') > snapEm) mudouDepois[String(d.id)] = true;
  });
  const snapVendas = {};
  (snap.vendasMes || []).forEach((v) => { if (!v.ajustado && !v.confirmada && donos.indexOf(String(v.ownerId)) >= 0) snapVendas[String(v.id)] = v; });
  checado.vendas = Object.keys(hsVendas).length;
  let dv = diferencas(hsVendas, snapVendas, ajustados, depoisDoSnap);
  if (dv.sobram.length) {
    const lidos = await hsLerEmLote(dv.sobram, ['hs_lastmodifieddate']);
    dv.sobram.forEach((id) => { if (Date.parse((lidos[id] || {}).hs_lastmodifieddate || '') > snapEm) mudouDepois[id] = true; });
    dv = diferencas(hsVendas, snapVendas, ajustados, depoisDoSnap);
  }
  dv.faltam.forEach((id) => itens.push({ tipo: 'vendas', texto: 'Venda ganha no HubSpot que o Cockpit não conta: ' + (hsVendas[id].dealname || id) + ' (' + nomeDe(hsVendas[id].hubspot_owner_id) + ').' }));
  dv.sobram.forEach((id) => itens.push({ tipo: 'vendas', texto: 'O Cockpit conta uma venda que não está ganha no HubSpot: ' + (snapVendas[id].nome || id) + ' (' + nomeDe(snapVendas[id].ownerId) + ').' }));

  // 3 · quentes
  const abertos = await hsBuscaTudo([
    { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE },
    { propertyName: 'dealstage', operator: 'IN', values: Object.keys(QUENTES) },
    { propertyName: 'hubspot_owner_id', operator: 'IN', values: donos },
  ], ['dealname', 'hubspot_owner_id', 'dealstage', 'hs_lastmodifieddate']);
  const hsQ = {};
  abertos.filter((d) => !REALIZADO.ehNegocioExcluido(d)).forEach((d) => {
    hsQ[String(d.id)] = d.properties;
    if (Date.parse(d.properties.hs_lastmodifieddate || '') > snapEm) mudouDepois[String(d.id)] = true;
  });
  const snapQ = {};
  Object.keys(QUENTES).forEach((st) => ((snap.funilLeads || {})[st] || []).forEach((l) => { snapQ[String(l.id)] = Object.assign({ stage: st }, l); }));
  checado.quentes = Object.keys(hsQ).length;
  let dq = diferencas(hsQ, snapQ, new Set(), depoisDoSnap);
  if (dq.sobram.length) {
    const lidos = await hsLerEmLote(dq.sobram, ['hs_lastmodifieddate']);
    dq.sobram.forEach((id) => { if (Date.parse((lidos[id] || {}).hs_lastmodifieddate || '') > snapEm) mudouDepois[id] = true; });
    dq = diferencas(hsQ, snapQ, new Set(), depoisDoSnap);
  }
  dq.faltam.forEach((id) => itens.push({ tipo: 'quentes', texto: 'Quente no HubSpot que o Cockpit não mostra: ' + (hsQ[id].dealname || id) + ' · ' + QUENTES[hsQ[id].dealstage] + ' (' + nomeDe(hsQ[id].hubspot_owner_id) + ').' }));
  dq.sobram.forEach((id) => itens.push({ tipo: 'quentes', texto: 'O Cockpit mostra como quente um negócio que saiu dessa etapa no HubSpot: ' + (snapQ[id].name || snapQ[id].dealname || id) + ' (' + nomeDe(snapQ[id].ownerId) + ').' }));
  // a mesma etapa nos dois lados (um negócio pode estar quente nos dois, mas em etapas diferentes)
  Object.keys(hsQ).filter((id) => snapQ[id] && !depoisDoSnap(id) && snapQ[id].stage !== hsQ[id].dealstage).forEach((id) => {
    itens.push({ tipo: 'quentes', texto: 'Etapa diferente: ' + (hsQ[id].dealname || id) + ' está em ' + QUENTES[hsQ[id].dealstage] + ' no HubSpot e em ' + QUENTES[snapQ[id].stage] + ' no Cockpit.' });
  });

  // 4 · plano × rota de hoje (dia útil), negócio por negócio
  if (diaUtil) {
    const hoje = br.toISOString().slice(0, 10);
    const di = br.getUTCDay() - 1;
    const seg = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - di)).toISOString().slice(0, 10);
    const [planos, perfis, rotas] = await Promise.all([
      supa('planos_semanais?select=owner_id,grade&data_segunda=eq.' + seg),
      supa('profiles?select=id,id_hubspot&id_hubspot=not.is.null'),
      supa('field_routes?select=seller_id,field_route_stops(client_id,status)&route_date=eq.' + hoje),
    ]);
    const perfilDo = {};
    perfis.forEach((p) => { perfilDo[String(p.id_hubspot)] = p.id; });
    const paradasDe = {};
    rotas.forEach((r) => { (r.field_route_stops || []).forEach((s) => { if (s.status !== 'removed') (paradasDe[r.seller_id] = paradasDe[r.seller_id] || []).push(s.client_id); }); });
    const doDia = [];
    planos.forEach((p) => {
      if (donos.indexOf(String(p.owner_id)) < 0) return;
      const dia = Array.isArray(p.grade) ? p.grade[di] : null;
      doDia.push({ owner: String(p.owner_id), slots: (Array.isArray(dia) ? dia : []).filter((s) => s && typeof s === 'object' && /^(c|n|r|m|l)-/.test(String(s.id || ''))) });
    });
    const deals = [...new Set([].concat(...doDia.map((x) => x.slots)).filter((s) => /^(c|r)-/.test(s.id)).map((s) => s.id.slice(2)))];
    const pinos = {};
    const negocios = {};
    for (let i = 0; i < deals.length; i += 100) {
      const lote = deals.slice(i, i + 100).join(',');
      (await supa('clients?select=id,id_hubspot,is_archived&id_hubspot=in.(' + lote + ')')).forEach((c) => {
        const k = String(c.id_hubspot);
        if (!pinos[k] || (pinos[k].is_archived && !c.is_archived)) pinos[k] = c;
      });
      (await supa('espelho_negocios?select=deal_id,props&deal_id=in.(' + lote + ')')).forEach((e) => { negocios[String(e.deal_id)] = e.props || {}; });
    }
    doDia.forEach((x) => {
      const pid = perfilDo[x.owner];
      const livres = (paradasDe[pid] || []).slice();
      const nome = (id) => (negocios[id] || {}).dealname || id;
      let novas = 0;
      x.slots.forEach((s) => {
        if (/^(n|m|l)-/.test(s.id)) { novas++; return; }
        const deal = s.id.slice(2);
        const pino = pinos[deal];
        if (pino && !pino.is_archived) {
          const k = livres.indexOf(pino.id);
          if (k >= 0) livres.splice(k, 1);
          else itens.push({ tipo: 'plano', texto: nomeDe(x.owner) + ': ' + nome(deal) + ' está no Planejamento de hoje e não está na rota do app.' });
          return;
        }
        if (pino && pino.is_archived) {
          itens.push({ tipo: 'plano', texto: nomeDe(x.owner) + ': o ponto de ' + nome(deal) + ' está arquivado no mapa, mas o negócio está ativo e no Planejamento de hoje.' });
          return;
        }
        // sem ponto: negócio novo (a rotina que cria o ponto roda a cada 15 min) ou sem endereço (o Cockpit já mostra "sem lugar")
        const n = negocios[deal] || {};
        const novo = Date.now() - (Date.parse(n.createdate || '') || 0) < 24 * 3600000;
        const semEndereco = !n.latitude && !n.logradouro;
        if (!novo && !semEndereco) itens.push({ tipo: 'plano', texto: nomeDe(x.owner) + ': ' + nome(deal) + ' tem endereço no HubSpot, mas não virou ponto no mapa (fica fora da rota).' });
      });
      if (novas !== livres.length) itens.push({ tipo: 'plano', texto: nomeDe(x.owner) + ': ' + novas + ' contas novas hoje no Planejamento e ' + livres.length + ' paradas sem negócio na rota do app.' });
    });
    checado.planos = doDia.length;
  }
  return { itens, checado };
}

(async () => {
  if (!TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.log('conferência: faltam HUBSPOT_TOKEN/SUPABASE_URL/SUPABASE_SERVICE_KEY — pulei.'); return; }
  let resultado;
  try { resultado = await conferir(); }
  catch (e) { resultado = { itens: [{ tipo: 'erro', texto: 'Não consegui conferir: ' + (e && e.message || e) }], checado: {} }; }
  const conferencia = Object.assign({ em: new Date().toISOString(), ok: resultado.itens.length === 0 }, resultado);
  console.log('Conferência dos números: ' + (conferencia.ok ? 'tudo bate' : resultado.itens.length + ' divergência(s)') + ' · ' + JSON.stringify(resultado.checado));
  resultado.itens.forEach((i) => console.log('  - [' + i.tipo + '] ' + i.texto));
  const status = (await lerSnapshot('sync-status')) || {};
  await publicarSnapshot('sync-status', Object.assign({}, status, { conferencia }), 'conferencia');
})();
