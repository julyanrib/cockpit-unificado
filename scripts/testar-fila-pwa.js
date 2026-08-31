// scripts/testar-fila-pwa.js
//
// Testa api/fila-pwa.js com o Supabase STUBBADO — nenhuma rede, nenhuma escrita real.
//
// O que importa provar aqui, na ordem de gravidade:
//   1. sem sessão não escreve (é rota de escrita exposta na internet);
//   2. executivo não declara fila de outra pessoa (senão o campo perde sentido);
//   3. `pendentes` ausente ou não-inteiro é recusado — a rota existe para acabar com a
//      ambiguidade, e aceitar null recriaria exatamente a ambiguidade;
//   4. a gravação é idempotente por (ownerId, dia): o app manda a cada tentativa de sync.
//
// Rode: node scripts/testar-fila-pwa.js

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://supabase.invalido';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon-falso';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'service-falso';

const path = require('path');
const handler = require(path.join(__dirname, '..', 'api', 'fila-pwa.js'));

const EMAIL_REP = 'bruno.takeat@gmail.com';   // ownerId 86100506, role rep
const EMAIL_GESTOR = 'julyan.takeat@gmail.com';

let ultimaGravacao = null;
let chamadasDeGravacao = 0;

/* Stub: /auth/v1/user devolve o e-mail do token; o REST registra o que seria gravado. */
function stubFetch(emailDoToken) {
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      if (!emailDoToken) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ email: emailDoToken }) };
    }
    if (u.includes('/rest/v1/fila_pwa')) {
      chamadasDeGravacao++;
      ultimaGravacao = { url: u, corpo: JSON.parse(opts.body)[0], prefer: opts.headers.Prefer };
      return { ok: true, status: 200, json: async () => [ultimaGravacao.corpo], text: async () => '' };
    }
    throw new Error('fetch inesperado: ' + u);
  };
}

function resFalso() {
  const r = { _status: 0, _json: null, _headers: {} };
  r.setHeader = (k, v) => { r._headers[k] = v; };
  r.status = c => { r._status = c; return r; };
  r.json = o => { r._json = o; return r; };
  r.end = () => r;
  return r;
}

const chamar = async (body, email, headers) => {
  stubFetch(email);
  const res = resFalso();
  await handler({ method: 'POST', body, headers: headers || (email ? { authorization: 'Bearer tok' } : {}) }, res);
  return res;
};

let falhas = 0;
const checar = (nome, condicao, detalhe) => {
  console.log((condicao ? '  ok  ' : 'FALHA ') + nome + (detalhe ? ' · ' + detalhe : ''));
  if (!condicao) falhas++;
};

(async () => {
  console.log('\n== api/fila-pwa: quem pode escrever, e o que ==\n');

  let r = await chamar({ ownerId: '86100506', dia: '2026-09-01', pendentes: 3 }, null);
  checar('sem sessão não escreve', r._status === 401 && chamadasDeGravacao === 0, r._json && r._json.erro);

  r = await chamar({ ownerId: '86100506', dia: '2026-09-01', pendentes: 3 }, EMAIL_REP);
  checar('executivo declara a própria fila', r._status === 200, JSON.stringify(ultimaGravacao && ultimaGravacao.corpo.pendentes));
  checar('grava com upsert por owner+dia', !!ultimaGravacao && /on_conflict=owner_id,dia/.test(ultimaGravacao.url) && /merge-duplicates/.test(ultimaGravacao.prefer));
  checar('marca origem como pwa', !!ultimaGravacao && ultimaGravacao.corpo.origem === 'pwa');

  const antes = chamadasDeGravacao;
  r = await chamar({ ownerId: '87569072', dia: '2026-09-01', pendentes: 1 }, EMAIL_REP);
  checar('executivo NÃO declara fila de outro', r._status === 403 && chamadasDeGravacao === antes, r._json && r._json.erro);

  r = await chamar({ ownerId: '87569072', dia: '2026-09-01', pendentes: 1 }, EMAIL_GESTOR);
  checar('gestor pode declarar pelo time', r._status === 200);
  checar('e fica marcado como origem gestor', !!ultimaGravacao && ultimaGravacao.corpo.origem === 'gestor');

  const antes2 = chamadasDeGravacao;
  r = await chamar({ ownerId: '86100506', dia: '2026-09-01' }, EMAIL_REP);
  checar('sem "pendentes" é recusado', r._status === 400 && chamadasDeGravacao === antes2, r._json && r._json.erro);

  r = await chamar({ ownerId: '86100506', dia: '2026-09-01', pendentes: null }, EMAIL_REP);
  checar('pendentes: null é recusado (é a ambiguidade que a rota vem resolver)', r._status === 400);

  r = await chamar({ ownerId: '86100506', dia: '2026-09-01', pendentes: 2.5 }, EMAIL_REP);
  checar('pendentes fracionário é recusado', r._status === 400);

  r = await chamar({ ownerId: '86100506', dia: '01/09/2026', pendentes: 1 }, EMAIL_REP);
  checar('data fora do formato é recusada', r._status === 400, r._json && r._json.erro);

  r = await chamar({ ownerId: '86100506', dia: '2026-09-01', pendentes: 1, ultimaTentativa: 'ontem' }, EMAIL_REP);
  checar('ultimaTentativa inválida é recusada', r._status === 400);

  r = await chamar({ ownerId: '86100506', dia: '2026-09-01', pendentes: 0, falhas: 2, ultimaTentativa: '2026-09-01T14:22:10Z', versaoApp: '1.4.2', detalhe: [{ tipo: 'visita', cliente: 'Bar do Zé' }] }, EMAIL_REP);
  checar('zero pendentes COM tentativa é válido (é "subiu tudo", não ausência)', r._status === 200 && ultimaGravacao.corpo.pendentes === 0);
  checar('falhas, versão e detalhe chegam ao banco', ultimaGravacao.corpo.falhas === 2 && ultimaGravacao.corpo.versao_app === '1.4.2' && Array.isArray(ultimaGravacao.corpo.detalhe));

  const res2 = resFalso();
  stubFetch(EMAIL_REP);
  await handler({ method: 'GET', body: {}, headers: { authorization: 'Bearer tok' } }, res2);
  checar('GET recusado', res2._status === 405);

  console.log(falhas ? '\n' + falhas + ' falha(s).' : '\n' + 'todas as checagens ok.');
  process.exit(falhas ? 1 : 0);
})();
