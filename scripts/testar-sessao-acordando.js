// scripts/testar-sessao-acordando.js — o 401 de quem acordou o computador (auditoria de 19/11/26).
// Extrai fetchQueEsperaOLogin do template e roda com fetch, sessão e relógio falsos.
// Uso: node scripts/testar-sessao-acordando.js
const fs = require('fs');
const path = require('path');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8').replace(/\r\n/g, '\n');
const ini = tpl.indexOf('  async function fetchQueEsperaOLogin(');
const fim = tpl.indexOf('  supa = window.supabase.createClient(DATA.supabase.url, DATA.supabase.anonKey, { global: { fetch: fetchQueEsperaOLogin } });');
let ok = 0; const falhas = [];
function conferir(nome, cond, porque) { if (cond) ok++; else falhas.push(nome + ' — ' + porque); }

conferir('o template tem a função e o createClient usa ela', ini > 0 && fim > ini, 'sem isso o resto do teste mede o vazio');
if (ini < 0 || fim < 0) { console.log('FALHA: ' + falhas.join('; ')); process.exit(1); }

const ANON = 'chave-publica';
function montar(respostas, sessoes) {
  const chamadas = [];
  let s = 0;
  const ctx = {
    DATA: { supabase: { anonKey: ANON } },
    Headers,
    setTimeout: (fn) => fn(),
    fetch: async (url, op) => { chamadas.push({ url, auth: new Headers((op && op.headers) || {}).get('Authorization') }); return { status: respostas.shift() }; },
    supa: { auth: { getSession: async () => ({ data: { session: sessoes[s++] || null } }) } },
  };
  const fn = new Function(...Object.keys(ctx), tpl.slice(ini, fim) + '\nreturn fetchQueEsperaOLogin;')(...Object.values(ctx));
  return { fn, chamadas };
}
const REST = 'https://x.supabase.co/rest/v1/rpc/desenvolvimento_quadro';
const semLogin = { headers: { Authorization: 'Bearer ' + ANON } };
const comLogin = { headers: { Authorization: 'Bearer token-do-usuario' } };

(async () => {
  let t = montar([200], []);
  let r = await t.fn(REST, semLogin);
  conferir('200 passa direto, sem nova tentativa', r.status === 200 && t.chamadas.length === 1, JSON.stringify(t.chamadas));

  t = montar([401, 200], [{ access_token: 'renovado' }]);
  r = await t.fn(REST, semLogin);
  conferir('401 sem login + sessão renovada: tenta de novo COM o login', r.status === 200 && t.chamadas.length === 2 && t.chamadas[1].auth === 'Bearer renovado', JSON.stringify(t.chamadas));

  t = montar([401, 200], [null, { access_token: 'tarde' }]);
  r = await t.fn(REST, semLogin);
  conferir('a sessão que volta na segunda espera também serve', r.status === 200 && t.chamadas[1].auth === 'Bearer tarde', JSON.stringify(t.chamadas));

  t = montar([401], [{ access_token: 'x' }]);
  r = await t.fn(REST, comLogin);
  conferir('401 de pedido que JÁ tinha login é recusa de verdade: não repete', r.status === 401 && t.chamadas.length === 1, JSON.stringify(t.chamadas));

  t = montar([401], [null, null]);
  r = await t.fn(REST, semLogin);
  conferir('sem sessão nenhuma: devolve o 401 (o aviso de sessão terminada é do onAuthStateChange)', r.status === 401 && t.chamadas.length === 1, JSON.stringify(t.chamadas));

  t = montar([401], [{ access_token: 'x' }]);
  r = await t.fn('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', semLogin);
  conferir('o próprio login (/auth/v1) nunca é repetido', r.status === 401 && t.chamadas.length === 1, JSON.stringify(t.chamadas));

  t = montar([401, 200], [{ access_token: 'renovado' }]);
  r = await t.fn('https://x.supabase.co/functions/v1/cockpit-api/negocio-acao', semLogin);
  conferir('Edge function também ganha a nova tentativa', r.status === 200 && t.chamadas.length === 2, JSON.stringify(t.chamadas));

  if (falhas.length) { console.log('sessão acordando: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length)); falhas.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('sessão acordando: ' + ok + ' verificações ok');
})();
