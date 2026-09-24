// scripts/testar-rota-realizado.js
// Testa o recurso `?recurso=realizado-hoje` de api/dados.js com Supabase e HubSpot
// STUBBADOS — nenhuma rede, nenhum dado real, nenhuma escrita.
//
// POR QUE EXISTE (01/09/26): este é o recurso que faz a Minha Daily v2 andar durante o
// dia. Ele lê o CRM ao vivo e devolve o que já foi cumprido — ou seja, é uma rota
// autenticada que fala sobre o desempenho de uma pessoa. Duas coisas não podem falhar em
// silêncio aqui:
//
//   1. QUEM VÊ O DIA DE QUEM. Executivo só o dele; gestor pode passar ?owner=. Foi este
//      teste que pegou o papel errado: eu havia escrito 'gestor' e o cadastro usa
//      'manager' — papel que nunca casa é permissão que nunca existe, e o gestor ficaria
//      sem conseguir consultar ninguém.
//   2. ERRO NUNCA VIRA ZERO. Se o HubSpot cair, a resposta tem que ser um erro explícito.
//      Zero silencioso na tela seria a barra descendo e os pontos do executivo
//      desaparecendo sem explicação — pior que não atualizar.
//
// Uso: node scripts/testar-rota-realizado.js   (da raiz do repositório)

const path = require('path');
process.chdir(path.join(__dirname, '..'));

process.env.SUPABASE_URL = 'https://supa.fake';
process.env.SUPABASE_ANON_KEY = 'anon-fake';
process.env.HUBSPOT_TOKEN = 'hs-fake';

const USUARIOS = require('../data/usuarios.json');
const lista = Array.isArray(USUARIOS) ? USUARIOS : (USUARIOS.usuarios || []);
const REP = lista.find(u => u.role === 'rep' && u.ownerId);
const GESTOR = lista.find(u => u.role === 'manager');
const REP_OUTRO = lista.find(u => u.role === 'rep' && u.ownerId && u.ownerId !== REP.ownerId);
/* QUEM NÃO TEM ownerId — escolhido pela FALTA do ownerId, que é a condição que a rota
   testa, e não pelo papel. Até 24/09/26 este era o Julyan por acidente: ele era o
   primeiro manager da lista E o único sem owner. Quando ele ganhou o dele, o bloco 5
   ficou vermelho medindo outra coisa. Âncora por acidente é âncora que some. */
const SEM_OWNER = lista.find(u => !u.ownerId);
/* E O GESTOR QUE TEM ownerId, para o caso novo logo abaixo. */
const GESTOR_COM_OWNER = lista.find(u => u.role === 'manager' && u.ownerId);
if (!REP || !GESTOR || !REP_OUTRO) {
  console.error('data/usuarios.json não tem os papéis que o teste precisa (rep com owner, manager, outro rep).');
  process.exit(1);
}
if (!SEM_OWNER) {
  /* FALHA ALTO em vez de pular: o dia em que todo mundo tiver ownerId, a regra do
     "sem owner a rota explica em vez de zerar" fica sem ninguém para exercê-la, e um
     bloco que não mede nada passando verde é pior que um teste vermelho. */
  console.error('data/usuarios.json não tem ninguém sem ownerId: o bloco 5 (sem owner não vira zero) ficaria sem sujeito. Aponte-o para um cadastro de propósito, ou remova a regra da rota junto.');
  process.exit(1);
}
if (!GESTOR_COM_OWNER) {
  console.error('data/usuarios.json não tem gestor com ownerId: o bloco 5b (gestor que vende mede o próprio dia) ficaria sem sujeito.');
  process.exit(1);
}

let ok = 0;
const falhas = [];
const eIgual = (rotulo, veio, esperado) => {
  if (JSON.stringify(veio) === JSON.stringify(esperado)) { ok++; return; }
  falhas.push(rotulo + ': esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio));
};

/* ── o mundo de mentira ─────────────────────────────────────────────────────────────── */
function montarFetch(cfg) {
  const c = cfg || {};
  return async (url, opts) => {
    const u = String(url);
    if (u.indexOf('/auth/v1/user') >= 0) {
      if (c.sessaoInvalida) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ email: c.email }) };
    }
    if (u.indexOf('api.hubapi.com') >= 0) {
      if (c.hubspotCai) return { ok: false, status: 500, json: async () => ({}) };
      const tipo = u.indexOf('/tasks/') >= 0 ? 'tasks' : 'deals';
      return { ok: true, status: 200, json: async () => (c.hs && c.hs[tipo]) || { results: [] } };
    }
    throw new Error('fetch inesperado no teste: ' + u);
  };
}

function resFake() {
  const r = { statusCode: null, corpo: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = code => { r.statusCode = code; return r; };
  r.json = obj => { r.corpo = obj; return r; };
  r.end = () => r;
  return r;
}

async function chamar(cfg, query) {
  global.fetch = montarFetch(cfg);
  const handler = require('../api/dados.js');
  const req = { method: 'GET', headers: { authorization: 'Bearer token-fake' }, query: query || {} };
  const res = resFake();
  await handler(req, res);
  return res;
}

(async () => {
  const UTC = (h, m) => {
    /* hoje em Brasília, na hora pedida, expresso em UTC */
    const agoraBR = new Date(Date.now() - 3 * 3600 * 1000);
    const d = new Date(Date.UTC(agoraBR.getUTCFullYear(), agoraBR.getUTCMonth(), agoraBR.getUTCDate(), h + 3, m, 0));
    return d.toISOString();
  };
  const tarefa = (nome, status, hora, horaFim) => ({
    id: 't-' + nome, properties: {
      hs_task_subject: 'Visita - ' + nome, hs_task_status: status,
      hs_timestamp: UTC(hora, 0), hs_createdate: UTC(hora, 0),
      hs_task_completion_date: horaFim != null ? UTC(horaFim, 15) : null
    }
  });

  /* ── 1. o executivo vê o dia dele, com a linha do dia ─────────────────────────────── */
  {
    const res = await chamar({
      email: REP.email,
      hs: { tasks: { results: [tarefa('Nikô Ba', 'COMPLETED', 9, 9), tarefa('Lá Barra', 'NOT_STARTED', 15)] } }
    }, { recurso: 'realizado-hoje' });
    eIgual('responde 200', res.statusCode, 200);
    eIgual('conta a visita feita', res.corpo.realizado_visitas, 1);
    eIgual('e devolve a linha do dia com estado', (res.corpo.detalhe.visitas || []).map(v => [v.nome, v.estado]),
      [['Nikô Ba', 'feita'], ['Lá Barra', 'fila']]);
    eIgual('diz de quem é o dia', String(res.corpo.ownerId), String(REP.ownerId));
    eIgual('e quando mediu — a tela precisa poder dizer "há 12 min"', typeof res.corpo.medidoEm, 'string');
    /* dado de desempenho por sessão não pode cair em cache de CDN */
    eIgual('sem cache compartilhado', res.headers['Cache-Control'], 'private, no-store');
  }

  /* ── 2. QUEM VÊ O DIA DE QUEM ─────────────────────────────────────────────────────── */
  {
    const res = await chamar({ email: REP.email }, { recurso: 'realizado-hoje', owner: String(REP_OUTRO.ownerId) });
    eIgual('executivo não lê o dia do colega', res.statusCode, 403);
    const proprio = await chamar({ email: REP.email }, { recurso: 'realizado-hoje', owner: String(REP.ownerId) });
    eIgual('mas pode pedir o próprio owner explicitamente', proprio.statusCode, 200);
    /* o papel do cadastro é 'manager' — foi aqui que o teste pegou o 'gestor' que eu havia
       escrito, e que deixaria o gestor sem conseguir consultar ninguém. */
    const gestor = await chamar({ email: GESTOR.email }, { recurso: 'realizado-hoje', owner: String(REP.ownerId) });
    eIgual('o gestor lê o dia do executivo', gestor.statusCode, 200);
    eIgual('e é o dia de quem ele pediu', String(gestor.corpo.ownerId), String(REP.ownerId));
  }

  /* ── 3. sem sessão / sem cadastro ─────────────────────────────────────────────────── */
  {
    const res = await chamar({ sessaoInvalida: true }, { recurso: 'realizado-hoje' });
    eIgual('sessão inválida não mede nada', res.statusCode, 401);
    const fora = await chamar({ email: 'ninguem@fora.com' }, { recurso: 'realizado-hoje' });
    eIgual('e-mail fora do time não mede nada', fora.statusCode, 403);
  }

  /* ── 4. ERRO NUNCA VIRA ZERO ──────────────────────────────────────────────────────── */
  {
    const res = await chamar({ email: REP.email, hubspotCai: true }, { recurso: 'realizado-hoje' });
    eIgual('HubSpot fora do ar responde erro, não zero', res.statusCode, 502);
    eIgual('e o corpo não traz número nenhum', res.corpo.realizado_visitas, undefined);
    eIgual('com motivo legível para a tela mostrar', typeof res.corpo.erro, 'string');
  }

  /* ── 5. QUEM NÃO TEM ownerId PEDINDO O PRÓPRIO DIA ───────────────────────────────── */
  {
    /* Sem ownerId não há funil para ler: pedir "meu dia" não tem resposta possível, e a
       rota diz isso em vez de devolver quatro zeros como se fosse resultado. Quem cai
       aqui é o executivo em onboarding, ainda sem owner no HubSpot, e o gestor que não
       vende. O zero seria lido como "você não fez nada hoje". */
    const res = await chamar({ email: SEM_OWNER.email }, { recurso: 'realizado-hoje' });
    eIgual('sem owner, a rota explica em vez de zerar', res.statusCode, 200);
    eIgual('e marca o motivo', res.corpo.semOwner, true);
    eIgual('sem inventar números', res.corpo.realizado_visitas, undefined);
    /* e o sujeito do teste é mesmo alguém sem owner, não um cadastro qualquer que por
       acaso passou: sem esta linha, um dia em que SEM_OWNER apontasse para alguém COM
       owner daria vermelho sem dizer por quê. */
    eIgual('e quem foi medido não tem owner mesmo', SEM_OWNER.ownerId || null, null);
  }

  /* ── 5b. O GESTOR QUE VENDE MEDE O PRÓPRIO DIA (24/09/26) ────────────────────────── */
  {
    /* Julyan: "pode contar as vendas do Julyan, que sou eu, no placar geral". Ele ganhou
       ownerId no cadastro, e com ele a rota passou a ter o que medir: existe funil com o
       nome dele no HubSpot. Não é mais caso de "semOwner" — e este bloco existe para que
       a mudança esteja escrita, e não pareça um teste que alguém afrouxou. */
    const res = await chamar({ email: GESTOR_COM_OWNER.email }, { recurso: 'realizado-hoje' });
    eIgual('gestor com owner é medido, não dispensado', res.statusCode, 200);
    eIgual('e a rota não alega falta de owner', res.corpo.semOwner, undefined);
    eIgual('e mede o funil dele, não o de outro', String(res.corpo.ownerId), String(GESTOR_COM_OWNER.ownerId));
  }

  /* ── 6. sem HUBSPOT_TOKEN: fail-closed com motivo ────────────────────────────────── */
  {
    const guardado = process.env.HUBSPOT_TOKEN;
    delete process.env.HUBSPOT_TOKEN;
    const res = await chamar({ email: REP.email }, { recurso: 'realizado-hoje' });
    eIgual('sem token não mede e diz por quê', res.statusCode, 503);
    eIgual('e não devolve zero', res.corpo.realizado_visitas, undefined);
    process.env.HUBSPOT_TOKEN = guardado;
  }

  /* ── 7. o recurso não atrapalha o resto da rota ──────────────────────────────────── */
  {
    /* sem `recurso`, a rota continua sendo a que devolve o snapshot — este teste existe
       para o dia em que alguém mexer no bloco novo e deixar um `return` solto. */
    const res = await chamar({ email: REP.email }, { recurso: 'precificacao' });
    eIgual('o recurso antigo continua respondendo', res.statusCode, 200);
    eIgual('e é a precificação', !!res.corpo.precificacao, true);
  }

  if (falhas.length) {
    console.error('FALHAS (' + falhas.length + '):');
    falhas.forEach(f => console.error('  · ' + f));
    process.exit(1);
  }
  console.log('rota do realizado: ' + ok + ' checagens ok.');
})();
