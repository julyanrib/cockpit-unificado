#!/usr/bin/env node
/* ============================================================================
   A LIMPEZA DAS TAREFAS EXCEDENTES (22/09/26)

   Julyan, depois de ver o mesmo negócio duas vezes na aba Hoje do Sérgio: "PODE FAZER AS
   DUAS" — a regra na origem (feita, em criar-tarefa-rota.js) e a limpeza do que já está lá.

   O QUE ESTE SCRIPT FAZ: para cada negócio ABERTO com mais de uma tarefa ABERTA, mantém
   UMA e remove as outras.

   QUAL FICA: a mais próxima de vencer. É a mesma regra que a origem passou a usar — é o
   compromisso que o cliente está esperando primeiro, e duas regras diferentes para a mesma
   escolha fariam a limpeza brigar com a rota na semana seguinte.

   POR QUE REMOVER E NÃO CONCLUIR, e esta foi a decisão que mudou o desenho: o cockpit
   conta tarefa COMPLETED como TOQUE REALIZADO (tm10ToqueRealizado). Marcar 198 tarefas
   como concluídas somaria 198 toques que ninguém deu, inflando a contagem de 93 negócios
   e mentindo no piso de 4 toques — que é justamente a régua que o Julyan criou em 19/09.
   Concluir seria mais "seguro" no gesto e mais mentiroso no dado.

   E TAREFA CONCLUÍDA NUNCA É TOCADA: realizado é histórico.

   O LOG: antes de remover qualquer coisa, o script escreve um JSON com id, assunto, data,
   dono e negócio de CADA tarefa que vai sair. Remoção é irreversível no HubSpot; o log é o
   que permite recriar se a decisão se mostrar errada.

   Uso:
     node scripts/limpar-tarefas-excedentes.js              # só mede e escreve o log
     node scripts/limpar-tarefas-excedentes.js --aplicar    # mede, escreve o log e remove
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.HUBSPOT_TOKEN;
const APLICAR = process.argv.indexOf('--aplicar') > -1;
const PIPELINE = '916011864';
/* as etapas ABERTAS do Field Sales. Negócio fechado não recebe nem perde próximo passo
   por este script: a tarefa aberta dele é outra conversa, e misturar as duas faria a
   limpeza tocar em coisa que o Julyan não pediu. */
const ETAPAS_ABERTAS = ['1395880469', '1396005401', '1395880470',
  '1395880471', '1395880472', '1395880473'];

if (!TOKEN) {
  console.error('ERRO: falta HUBSPOT_TOKEN. Este script roda pela Action, onde o segredo existe.');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function hs(url, opts, tentativa) {
  const t = tentativa || 1;
  const r = await fetch(url, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      (opts && opts.headers) || {})
  }));
  if (r.status === 429 && t <= 5) { await sleep(1000 * t); return hs(url, opts, t + 1); }
  return r;
}

async function negociosAbertos() {
  const out = [];
  let after = null;
  do {
    const r = await hs('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{ filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE },
          { propertyName: 'dealstage', operator: 'IN', values: ETAPAS_ABERTAS }
        ] }],
        properties: ['dealname', 'dealstage', 'hubspot_owner_id'],
        limit: 100,
        after: after || undefined
      })
    });
    if (!r.ok) throw new Error('busca de negócios: HTTP ' + r.status);
    const d = await r.json();
    (d.results || []).forEach(x => out.push(x));
    after = d.paging && d.paging.next ? d.paging.next.after : null;
    await sleep(200);
  } while (after);
  return out;
}

async function tarefasDo(dealId) {
  const r = await hs('https://api.hubapi.com/crm/v4/objects/deals/' + dealId + '/associations/tasks?limit=100');
  if (!r.ok) return null;
  const d = await r.json();
  const ids = (d.results || [])
    .map(x => String((x.toObjectId != null ? x.toObjectId : (x.to && x.to.id)) || ''))
    .filter(Boolean);
  if (!ids.length) return [];
  const rl = await hs('https://api.hubapi.com/crm/v3/objects/tasks/batch/read', {
    method: 'POST',
    body: JSON.stringify({
      properties: ['hs_task_subject', 'hs_task_status', 'hs_timestamp'],
      inputs: ids.slice(0, 100).map(id => ({ id }))
    })
  });
  if (!rl.ok) return null;
  const dl = await rl.json();
  return (dl.results || []).filter(x =>
    String((x.properties || {}).hs_task_status || '') !== 'COMPLETED');
}

(async function () {
  console.log(APLICAR ? '=== LIMPEZA (vai remover) ===' : '=== MEDIÇÃO (não remove nada) ===');
  const negocios = await negociosAbertos();
  console.log('negócios abertos no Field Sales: ' + negocios.length);

  const paraRemover = [];
  const resumo = { negocios: negocios.length, comTarefaAberta: 0, comMaisDeUma: 0,
    abertasTotal: 0, excedentes: 0, piorCaso: 0, falhas: 0 };

  for (const n of negocios) {
    const abertas = await tarefasDo(n.id);
    await sleep(160);
    if (abertas === null) { resumo.falhas += 1; continue; }
    if (!abertas.length) continue;
    resumo.comTarefaAberta += 1;
    resumo.abertasTotal += abertas.length;
    if (abertas.length > resumo.piorCaso) resumo.piorCaso = abertas.length;
    if (abertas.length < 2) continue;
    resumo.comMaisDeUma += 1;

    /* A MAIS PRÓXIMA DE VENCER FICA — a mesma regra da rota de criação. */
    abertas.sort((a, b) => Number((a.properties || {}).hs_timestamp || 0)
      - Number((b.properties || {}).hs_timestamp || 0));
    abertas.slice(1).forEach(t => {
      resumo.excedentes += 1;
      paraRemover.push({
        tarefaId: String(t.id),
        assunto: (t.properties || {}).hs_task_subject || null,
        quando: (t.properties || {}).hs_timestamp || null,
        status: (t.properties || {}).hs_task_status || null,
        negocioId: String(n.id),
        negocio: (n.properties || {}).dealname || null,
        etapa: (n.properties || {}).dealstage || null,
        dono: (n.properties || {}).hubspot_owner_id || null,
        fica: String(abertas[0].id)
      });
    });
  }

  console.log('');
  console.log('negócios com tarefa aberta ....... ' + resumo.comTarefaAberta);
  console.log('tarefas abertas .................. ' + resumo.abertasTotal);
  console.log('negócios com mais de uma ......... ' + resumo.comMaisDeUma);
  console.log('excedentes (sairiam) ............. ' + resumo.excedentes);
  console.log('pior caso num negócio só ......... ' + resumo.piorCaso);
  if (resumo.falhas) console.log('AVISO: ' + resumo.falhas + ' negócio(s) não puderam ser lidos.');

  /* O LOG SAI SEMPRE, e SAI ANTES de remover. */
  const destino = path.join(__dirname, '..', 'data', 'limpeza-tarefas-' + new Date().toISOString().slice(0, 10) + '.json');
  fs.writeFileSync(destino, JSON.stringify({ geradoEm: new Date().toISOString(),
    aplicado: APLICAR, resumo, tarefas: paraRemover }, null, 2));
  console.log('log: ' + destino + ' (' + paraRemover.length + ' tarefas)');

  if (!APLICAR) {
    console.log('');
    console.log('Nada foi removido. Rode com --aplicar para executar.');
    return;
  }

  let removidas = 0; const erros = [];
  for (const t of paraRemover) {
    try {
      const r = await hs('https://api.hubapi.com/crm/v3/objects/tasks/' + t.tarefaId, { method: 'DELETE' });
      if (r.ok || r.status === 404) removidas += 1;
      else erros.push(t.tarefaId + ': HTTP ' + r.status);
    } catch (e) { erros.push(t.tarefaId + ': ' + String(e.message || e).slice(0, 80)); }
    await sleep(120);
  }
  console.log('');
  console.log('removidas: ' + removidas + ' de ' + paraRemover.length);
  if (erros.length) {
    console.log('erros (' + erros.length + '):');
    erros.slice(0, 20).forEach(e => console.log('  ' + e));
  }
}()).catch(e => { console.error('ERRO: ' + (e && e.message || e)); process.exit(1); });
