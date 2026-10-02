// scripts/testar-onboarding-completo.js
//
// ENVIAR PARA ONBOARDING COMPLETO (02/10/26): os campos do app passam pela rota, o cardápio
// anexado sobe para o HubSpot antes da etapa mudar (falhou, nada muda), e cardapio_da_loja
// só é escrito pelo servidor. HubSpot simulado — nada sai desta máquina.

process.env.HUBSPOT_TOKEN = 'x'; process.env.SUPABASE_URL = 'https://supa.test'; process.env.SUPABASE_ANON_KEY = 'a';
let patch = null, uploads = 0, recusar = false;
global.fetch = async (url, o = {}) => {
  const j = (b, st) => ({ ok: !st || st < 400, status: st || 200, json: async () => b });
  if (url.includes('/auth/v1/user')) return j({ email: 'julyan.takeat@gmail.com' });
  if (url.includes('/files/v3/files')) { uploads++; return recusar ? j({ message: 'This app hasn\'t been granted all required scopes' }, 403) : j({ id: 'F' + uploads }); }
  if (url.includes('api.hubapi.com') && o.method === 'PATCH') { patch = JSON.parse(o.body); return j({ id: '1' }); }
  if (url.includes('/tasks') || url.includes('associations')) return j({ results: [] });
  return j({ id: '1', properties: { pipeline: '916011864', dealstage: '1396006162', hubspot_owner_id: '86100506' } });
};
const h = require(require('path').join(__dirname, '..', 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'));
async function chama(body) {
  let st, out; const res = { setHeader() {}, status(s) { st = s; return this; }, json(b) { out = b; return this; }, end() { return this; } };
  await h({ method: 'POST', headers: { authorization: 'Bearer t' }, body }, res);
  return [st, out];
}
(async () => {
  const props = { estrutura_do_cliente: 'Loja Única', quando_vai_comecar_a_usar: '2026-10-10', perfil_do_cliente: 'lead_mid', instagram: '@x',
    criar_grupo_automaticamente_: 'true', multilojas_: 'false', cliente_vai_montar_ou_clonar_cardapio_: 'Será clonado', formato_do_cardapio: 'Anexo(s)' };
  const anexo = [{ nome: 'cardápio da loja.zip', tipo: 'application/zip', base64: Buffer.from('PK conteudo').toString('base64') }];
  const casos = [];
  let [s, o] = await chama({ dealId: '1', novaEtapa: '1396006163', propriedades: props, anexos: anexo });
  casos.push(['com anexo: sobe, grava o id e os campos', s === 200 && uploads === 1 && patch && patch.properties.cardapio_da_loja === 'F1' && patch.properties.criar_grupo_automaticamente_ === 'true' && patch.properties.dealstage === '1396006163']);
  recusar = true; patch = null;
  [s, o] = await chama({ dealId: '1', novaEtapa: '1396006163', propriedades: props, anexos: anexo });
  casos.push(['anexo recusado: 502, etapa não muda', s === 502 && patch === null && /link/.test(o.erro)]);
  recusar = false; patch = null;
  [s, o] = await chama({ dealId: '1', novaEtapa: '1396006163', propriedades: { ...props, cardapio_da_loja: 'qualquer' } });
  casos.push(['cardapio_da_loja não vem do navegador', s === 400 && patch === null]);
  [s, o] = await chama({ dealId: '1', novaEtapa: '1396006163', propriedades: props });
  casos.push(['sem anexo: os campos passam', s === 200 && patch && !patch.properties.cardapio_da_loja]);
  casos.forEach(c => console.log((c[1] ? 'ok   ' : 'FALHA') + ' ' + c[0]));
  process.exit(casos.every(c => c[1]) ? 0 : 1);
})();
