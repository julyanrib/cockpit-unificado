// scripts/testar-conflito-etapa.js
//
// DOIS LADOS AO MESMO TEMPO (01/10/26, docs/09 §5 linha 37): com etapaEsperada, a rota
// de etapa recusa com 409 quando o HubSpot já está em outra etapa, e diz qual e quem.
// HubSpot e Supabase simulados — nada sai desta máquina. Sabotado na criação: sem a
// checagem, os casos 1 e 5 reprovam.

process.env.HUBSPOT_TOKEN = 'x'; process.env.SUPABASE_URL = 'https://supa.test'; process.env.SUPABASE_ANON_KEY = 'a'; process.env.SUPABASE_SERVICE_KEY = 's';
const PIPE = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'hubspot-deal-guard.js'), 'utf8').match(/PIPELINE_FIELD_SALES = '(\d+)'/)[1];
let etapaCrm, patches, historico;
global.fetch = async (url, o = {}) => {
  const j = b => ({ ok: true, status: 200, json: async () => b });
  if (url.includes('/auth/v1/user')) return j({ email: 'bruno.takeat@gmail.com' });
  if (url.includes('api.hubapi.com') && (o.method || 'GET') === 'GET') return j({ id: '1', properties: { pipeline: PIPE, dealstage: etapaCrm, hubspot_owner_id: '86100506', dealname: 'X' } });
  if (url.includes('api.hubapi.com') && o.method === 'PATCH') { patches++; return j({ id: '1' }); }
  if (url.includes('/rest/v1/clients')) return j([{ id: 'c1' }]);
  if (url.includes('/rest/v1/client_stage_changes')) return j(historico);
  return j({});
};
const h = require(require('path').join(__dirname, '..', 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'));
async function chama(body) {
  let st, out; const res = { setHeader() {}, status(s) { st = s; return this; }, json(b) { out = b; return this; }, end() { return this; } };
  await h({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res);
  return [st, out];
}
(async () => {
  const casos = [];
  // 1 · Kelly moveu no mapa para Negociação; Bruno tenta Visita→Decisor
  etapaCrm = '1395880472'; patches = 0; historico = [{ created_by_name: 'Kelly Souza', to_stage_id: '1395880472', origem: null }];
  let [s, b] = await chama({ dealId: '1', novaEtapa: '1395880470', propriedades: { celular: '21999999999', gargalo_operacional: 'Fila', nome_do_sistema: 'S' }, etapaEsperada: '1396005401' });
  casos.push(['conflito devolve 409 com a etapa real e quem', s === 409 && b.conflito.etapa === '1395880472' && b.conflito.por === 'Kelly Souza' && b.conflito.onde === 'no mapa' && patches === 0]);
  // 2 · sem etapaEsperada: comportamento antigo (aqui: pulo de fase de Negociação para Decisor é volta, então grava)
  patches = 0; [s, b] = await chama({ dealId: '1', novaEtapa: '1395880470', propriedades: {} });
  casos.push(['sem etapaEsperada nada muda', s !== 409 && !(b && b.conflito)]);
  // 3 · etapa atual já é o destino: grava sem conflito
  etapaCrm = '1395880470'; patches = 0; [s, b] = await chama({ dealId: '1', novaEtapa: '1395880470', propriedades: { celular: '21999999999', gargalo_operacional: 'Fila', nome_do_sistema: 'S' }, etapaEsperada: '1396005401' });
  casos.push(['mesmo destino não é conflito', s === 200 && patches === 1]);
  // 4 · etapa esperada confere: grava
  etapaCrm = '1396005401'; patches = 0; [s, b] = await chama({ dealId: '1', novaEtapa: '1398311191', propriedades: {}, etapaEsperada: '1396005401' });
  casos.push(['esperada confere, grava', s === 200 && patches === 1]);
  // 5 · histórico de outra etapa: conflito sem nome
  etapaCrm = '1395880471'; historico = [{ created_by_name: 'Kelly', to_stage_id: '1395880470' }]; [s, b] = await chama({ dealId: '1', novaEtapa: '1398311191', propriedades: {}, etapaEsperada: '1396005401' });
  casos.push(['quem fica vazio se o histórico é de outra etapa', s === 409 && b.conflito.por == null]);
  casos.forEach(c => console.log((c[1] ? 'ok   ' : 'FALHA') + ' ' + c[0]));
  process.exit(casos.every(c => c[1]) ? 0 : 1);
})();
