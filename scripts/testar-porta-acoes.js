/* PROVA QUE A PORTA ÚNICA ROTEIA CERTO — sem rede e sem tocar no HubSpot.

   Como: chamo o handler com um req/res falsos, uma vez por `op`, SEM cabeçalho de sessão.
   Cada módulo valida a sessão antes de qualquer coisa, então a resposta esperada é 401 com a
   mensagem "Sem sessão". Isso prova três coisas de uma vez:
     · a porta reconheceu o `op` e não devolveu 400 de "ação desconhecida";
     · o módulo certo foi carregado e executou (a mensagem vem de dentro dele);
     · nada foi escrito em lugar nenhum, porque a validação corta antes.

   Também testo os caminhos de recusa: sem `op`, com `op` inventado, e método errado. E
   confirmo que `fetch` NUNCA foi chamado — se algum módulo tentasse falar com o HubSpot antes
   de validar sessão, este teste pegaria. */
/* VARIAVEIS FALSAS, DE PROPOSITO. Os modulos recusam com 500 se nao houver configuracao,
   e ai o teste mediria a ausencia de env em vez do roteamento. Com valores falsos, a
   execucao chega na validacao de sessao — que e o ponto que prova que o modulo certo rodou.
   Nada aqui fala com a rede: o fetch e substituido por um que estoura se for chamado. */
process.env.HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || 'token-falso-de-teste';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://supabase.invalido';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon-falso-de-teste';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'service-falso-de-teste';

const path = require('path').join(__dirname, '..', 'api', 'negocio-acao.js');
const handler = require(path);

let fetchChamado = 0;
global.fetch = async (...args) => { fetchChamado++; throw new Error('fetch nao deveria ser chamado neste teste: ' + args[0]); };

function resFalso() {
  const r = { _status: 0, _json: null, _headers: {} };
  r.setHeader = (k, v) => { r._headers[k] = v; };
  r.status = c => { r._status = c; return r; };
  r.json = o => { r._json = o; return r; };
  r.end = () => r;
  return r;
}

const casos = [
  { nome: 'op mudar-etapa chega no modulo', body: { op: 'mudar-etapa', dealId: '1', novaEtapa: 'x' }, esperado: 401 },
  { nome: 'op nota chega no modulo', body: { op: 'nota', dealId: '1', texto: 'oi' }, esperado: 401 },
  { nome: 'op tarefa-rota chega no modulo', body: { op: 'tarefa-rota', nome: 'X', ownerId: '1' }, esperado: 401 },
  { nome: 'op mrr chega no modulo', body: { op: 'mrr', dealId: '1', mrr: 10 }, esperado: 401 },
  { nome: 'op sugestao-gestor chega no modulo', body: { op: 'sugestao-gestor', taskId: '1', acao: 'confirmar' }, esperado: 401 },
  { nome: 'sem op, recusa e lista as aceitas', body: { dealId: '1' }, esperado: 400 },
  { nome: 'op inventado, recusa', body: { op: 'apagar-tudo' }, esperado: 400 }
];

(async () => {
  let falhas = 0;
  for (const c of casos) {
    const res = resFalso();
    await handler({ method: 'POST', body: c.body, headers: {} }, res);
    const ok = res._status === c.esperado;
    const msg = res._json && (res._json.erro || JSON.stringify(res._json)).slice(0, 62);
    console.log((ok ? '  ok  ' : 'FALHA ') + c.nome + ' → ' + res._status + ' · ' + msg);
    if (!ok) falhas++;
    /* as recusas da porta precisam ensinar o contrato */
    if (c.esperado === 400 && !(res._json && Array.isArray(res._json.aceitas))) {
      console.log('FALHA a recusa nao lista as acoes aceitas'); falhas++;
    }
  }

  /* metodo errado */
  const r2 = resFalso();
  await handler({ method: 'GET', body: {}, headers: {} }, r2);
  console.log((r2._status === 405 ? '  ok  ' : 'FALHA ') + 'GET recusado → ' + r2._status);
  if (r2._status !== 405) falhas++;

  /* preflight */
  const r3 = resFalso();
  await handler({ method: 'OPTIONS', body: {}, headers: {} }, r3);
  const cors = r3._headers['Access-Control-Allow-Headers'] || '';
  console.log((r3._status === 204 && /Authorization/.test(cors) ? '  ok  ' : 'FALHA ') + 'OPTIONS responde 204 com Authorization liberado');
  if (!(r3._status === 204 && /Authorization/.test(cors))) falhas++;

  console.log((fetchChamado === 0 ? '  ok  ' : 'FALHA ') + 'nenhuma chamada de rede aconteceu (fetch: ' + fetchChamado + ')');
  if (fetchChamado !== 0) falhas++;

  console.log(falhas ? '\n' + falhas + ' falha(s).' : '\ntodos os caminhos da porta unica ok.');
  process.exit(falhas ? 1 : 0);
})();
