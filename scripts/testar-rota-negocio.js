// scripts/testar-rota-negocio.js
// Testa api/criar-nota-negocio.js com HubSpot e Supabase STUBBADOS — nenhuma rede,
// nenhuma escrita em negócio real.
//
// POR QUE EXISTE (28/08/26): esta rota passou a cobrir TRÊS coisas (nota, próximo
// passo e qualificação) por causa do limite de 12 funções serverless do plano Hobby
// da Vercel. Acumular propósito numa rota é aceitável; acumular sem teste não é.
//
// O que ele protege, e que revisão visual NÃO alcança:
//   1. a ordem: o PATCH da qualificação acontece ANTES do POST da tarefa;
//   2. se a qualificação falha, NENHUMA tarefa é criada (tarefa datada em cima de
//      negócio que segue cego é o estado que produziu 49 negócios em Visita sem nada);
//   3. a picklist da dor é validada no SERVIDOR, e valor inválido não chega ao HubSpot;
//   4. etapa fechada não se qualifica e negócio de colega é recusado pelo guard;
//   5. sem qualificação, o próximo passo continua funcionando exatamente como antes.
//
// Uso: node scripts/testar-rota-negocio.js   (da raiz do repositório)

const path = require("path");
process.chdir(path.join(__dirname, ".."));
// Testa api/criar-nota-negocio.js com HubSpot e Supabase stubbados.
// Foco: a ORDEM (qualificação antes da tarefa) e a validação da picklist no servidor.
process.env.HUBSPOT_TOKEN = 'fake';
process.env.SUPABASE_URL = 'https://supa.fake';
process.env.SUPABASE_ANON_KEY = 'fake';

// Caminho relativo a ESTE arquivo: require não olha o cwd (o process.chdir acima serve
// só para o require('../data/usuarios.json') de dentro da rota se comportar como na Vercel).
const handler = require('../api/criar-nota-negocio.js');
const KELLY = { email: 'kelly.takeat@gmail.com', ownerId: '91477292' };

let ok = 0, falhou = 0;
function checa(cond, msg) { if (cond) { ok++; console.log('  ok  ' + msg); } else { falhou++; console.log('  FALHA  ' + msg); } }

function montarFetch({ patchOk = true, etapa = '1396005401', dono = KELLY.ownerId }) {
  const chamadas = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url); const m = (opts.method || 'GET').toUpperCase();
    chamadas.push(m + ' ' + u);
    if (u.includes('/auth/v1/user')) return { ok: true, json: async () => ({ email: KELLY.email }) };
    if (u.includes('/objects/deals/') && m === 'GET') {
      return { ok: true, json: async () => ({ id: '1', properties: { dealname: 'X', pipeline: '916011864', dealstage: etapa, hubspot_owner_id: dono } }) };
    }
    if (u.includes('/objects/deals/') && m === 'PATCH') {
      return patchOk ? { ok: true, json: async () => ({}) } : { ok: false, status: 400, json: async () => ({ message: 'HubSpot recusou' }) };
    }
    if (u.includes('/objects/tasks')) return { ok: true, json: async () => ({ id: 'task_1' }) };
    if (u.includes('/associations/')) return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({}) };
  };
  return chamadas;
}

function res() {
  const r = { code: null, corpo: null };
  r.setHeader = () => {};
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.corpo = b; return r; };
  r.end = () => r;
  return r;
}
const req = (body) => ({ method: 'POST', headers: { authorization: 'Bearer sess' }, body });

(async () => {
  console.log('\n== api/criar-nota-negocio: qualificação + próximo passo ==\n');

  // 1. caminho felizit
  let ch = montarFetch({});
  let r = res();
  await handler(req({ dealId: '1', texto: 'ligar', data: '2026-08-31', tipoAcao: 'proximo-passo', qualificacao: { nomeDoSistema: 'Consumer', gargalo: 'Fila' } }), r);
  checa(r.code === 200 && r.corpo.ok, 'grava qualificação e cria a tarefa (200)');
  checa(!!r.corpo.qualificacao && r.corpo.qualificacao.gargalo_operacional === 'Fila', 'devolve o que gravou, pro cliente espelhar');
  const iPatch = ch.findIndex(c => c.startsWith('PATCH'));
  const iTask = ch.findIndex(c => c.includes('/objects/tasks'));
  checa(iPatch >= 0 && iTask >= 0 && iPatch < iTask, 'PATCH da qualificação vem ANTES do POST da tarefa');

  // 2. qualificação falha -> NENHUMA tarefa
  ch = montarFetch({ patchOk: false });
  r = res();
  await handler(req({ dealId: '1', texto: 'ligar', data: '2026-08-31', tipoAcao: 'proximo-passo', qualificacao: { gargalo: 'Fila' } }), r);
  checa(r.code === 400, 'qualificação recusada devolve erro');
  checa(!ch.some(c => c.includes('/objects/tasks')), 'NENHUMA tarefa criada quando a qualificação falha');

  // 3. picklist validada no servidor
  ch = montarFetch({});
  r = res();
  await handler(req({ dealId: '1', texto: 'ligar', data: '2026-08-31', tipoAcao: 'proximo-passo', qualificacao: { gargalo: 'Inventei essa dor' } }), r);
  checa(r.code === 400 && /Dor inválida/.test(r.corpo.erro), 'dor fora da picklist é recusada pelo servidor');
  checa(!ch.some(c => c.startsWith('PATCH')), 'não chega a tocar o HubSpot com valor inválido');

  // 4. etapa fechada não se qualifica
  ch = montarFetch({ etapa: '1396006162' }); // Ganho
  r = res();
  await handler(req({ dealId: '1', texto: 'ligar', data: '2026-08-31', tipoAcao: 'proximo-passo', qualificacao: { gargalo: 'Fila' } }), r);
  checa(r.code === 403, 'negócio em etapa fechada não é qualificável');

  // 5. rep não qualifica negócio de colega
  ch = montarFetch({ dono: '99999999' });
  r = res();
  await handler(req({ dealId: '1', texto: 'ligar', data: '2026-08-31', tipoAcao: 'proximo-passo', qualificacao: { gargalo: 'Fila' } }), r);
  checa(r.code === 403, 'negócio de colega é recusado (guard de dono)');
  checa(!ch.some(c => c.startsWith('PATCH')), 'e não escreve nada');

  // 6. sem qualificação, o próximo passo funciona como antes
  ch = montarFetch({});
  r = res();
  await handler(req({ dealId: '1', texto: 'ligar', data: '2026-08-31', tipoAcao: 'proximo-passo' }), r);
  checa(r.code === 200 && r.corpo.qualificacao === null, 'sem qualificação: comportamento antigo intacto');
  checa(!ch.some(c => c.startsWith('PATCH')), 'e nenhum PATCH desnecessário');

  console.log('');
  if (falhou) { console.error(`${falhou} falha(s), ${ok} ok.`); process.exit(1); }
  console.log(`${ok} checagens ok.`);
})();
