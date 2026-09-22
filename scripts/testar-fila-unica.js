#!/usr/bin/env node
/* ============================================================================
   UM NEGÓCIO, UMA LINHA NA FILA DO DIA (22/09/26)

   Julyan mandou o print da aba Hoje do Sérgio: "Boca a Boca Salgados" duas vezes, as duas
   linhas idênticas. "os leads dos executivos na aba hoje estão duplicados, o caminho do
   pwa, para o hub e cockpit, tem q ser unico, sem duplicação".

   NÃO ERA DUPLICATA DE DADO — conferido no HubSpot (um único negócio no pipeline do Field
   Sales) e no snapshot (uma entrada em funilLeads, uma em abertos). Três camadas já
   deduplicavam por id: meusNegociosAbertos, filaDeFollowUp e o teste contra o base em
   h8Fila.

   O QUE ESCAPAVA ERAM OS EXTRAS ENTRE SI. `pendentesDeHoje` é lista de COMPROMISSOS, e o
   laço dava um push por compromisso. O Boca a Boca tem quatro tarefas abertas para hoje;
   às 14:27 duas já tinham passado da hora, e a fila mostrou duas linhas.

   ESTA SUÍTE RODA h8Fila DE VERDADE, em vm, com dois compromissos vencidos no mesmo
   negócio. Uma checagem de texto diria que o código do índice existe; não diria que a
   segunda linha sumiu.

   Uso: node scripts/testar-fila-unica.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
}
function igual(nome, veio, esperado, porque) {
  checar(nome, JSON.stringify(veio) === JSON.stringify(esperado),
    (porque ? porque + ' · ' : '') + 'esperava ' + JSON.stringify(esperado)
      + ', veio ' + JSON.stringify(veio));
}
function seguro(fn) {
  try { return fn(); } catch (e) { return '‹estourou: ' + e.message + '›'; }
}
function recortar(fonte, nome) {
  const assinatura = 'function ' + nome + '(';
  const i = fonte.indexOf(assinatura);
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe.'); process.exit(1); }
  if (fonte.indexOf(assinatura, i + 1) > 0) {
    console.error('FALHA: ' + nome + ' aparece duas vezes.'); process.exit(1);
  }
  let d = 0, j = i, viu = false;
  while (j < fonte.length) {
    const c = fonte[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return fonte.slice(i, j + 1);
}

/* ══ O AMBIENTE ══════════════════════════════════════════════════════════════════════
   O NEGÓCIO É O DO PRINT: um só, na Ag. Pagamento, com DUAS tarefas das 09:00 já
   vencidas. É a reprodução exata do caso do Sérgio. */
const ONTEM = new Date(Date.now() - 6 * 3600 * 1000);
const BOCA = { id: '65061828767', name: 'Boca a Boca Salgados', stageId: '1395880473',
  stage: 'Ag. Pagamento', dias: 0, ownerId: '97978276' };

function eventos(n, dealId, cliente) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: 'ev' + i + '-' + (dealId || cliente), dealId: dealId || null,
      cliente: cliente || 'Boca a Boca Salgados',
      inicio: new Date(ONTEM.getTime() + i * 60000), desfecho: null, registro: null });
  }
  return out;
}

function montarCtx(deHoje, baseIds) {
  const ctx = {
    console: { log: function () {}, error: function () {} },
    Math: Math, Number: Number, Object: Object, String: String, Array: Array,
    Date: Date, Set: Set, JSON: JSON, isNaN: isNaN,
    buscarLeadFunilPorId: function (id) { return String(id) === BOCA.id ? BOCA : null; },
    meusNegociosAbertos: function () { return [BOCA]; },
    tpMesmoCliente: function (a, b) {
      return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    },
    estadoDoNegocio: function () { return { toques: { total: 1 }, temProximoPasso: false }; },
    telefoneDaAcao: function () { return null; },
    h8AgendadoNaSemana: function () { return null; },
    gatesDoDia: function () { return { fila: { ordenada: [] }, contexto: { deHoje: [] } }; }
  };
  vm.createContext(ctx);
  vm.runInContext(recortar(tpl, 'h8Fila'), ctx);
  const base = (baseIds || []).map(function (id) {
    return { lead: id === BOCA.id ? BOCA : { id: id, name: 'outro ' + id },
      estado: {}, balde: 'cadencia', prio: 3 };
  });
  return { ctx: ctx, diag: { fila: { ordenada: base }, contexto: { deHoje: deHoje } } };
}

/* ══ 1. O CASO DO PRINT ══════════════════════════════════════════════════════════════ */
(function () {
  const m = montarCtx(eventos(2, BOCA.id), []);
  const fila = seguro(function () { return m.ctx.h8Fila({ ownerId: '97978276' }, m.diag); });
  igual('dois compromissos vencidos no mesmo negócio dão UMA linha',
    Array.isArray(fila) ? fila.length : fila, 1,
    'é o print do Sérgio: duas tarefas das 09:00 no Boca a Boca, duas linhas idênticas');
  igual('e a linha conta os dois',
    Array.isArray(fila) ? fila[0].compromissosHoje : null, 2,
    'sumir com o segundo faria o executivo achar que o cockpit perdeu o compromisso');
}());

/* QUATRO compromissos, que é o número real do Boca a Boca no HubSpot. */
(function () {
  const m = montarCtx(eventos(4, BOCA.id), []);
  const fila = m.ctx.h8Fila({ ownerId: '97978276' }, m.diag);
  igual('quatro compromissos continuam dando uma linha', fila.length, 1);
  igual('e a conta é quatro', fila[0].compromissosHoje, 4);
}());

/* UM compromisso não ganha selo: o selo só existe quando há excesso. */
(function () {
  const m = montarCtx(eventos(1, BOCA.id), []);
  const fila = m.ctx.h8Fila({ ownerId: '97978276' }, m.diag);
  igual('um compromisso é uma linha, sem excesso', [fila.length, fila[0].compromissosHoje], [1, 1]);
}());

/* ══ 2. O EVENTO QUE FICA É O MAIS ANTIGO ════════════════════════════════════════════
   É o que está esperando há mais tempo, e é por ele que a conversa com o cliente começa.
   Guardar o último faria a linha falar da tarefa das 18:00 enquanto a das 09:00 apodrece. */
(function () {
  const evs = eventos(3, BOCA.id);
  const m = montarCtx([evs[2], evs[0], evs[1]], []);   /* fora de ordem, de propósito */
  const fila = m.ctx.h8Fila({ ownerId: '97978276' }, m.diag);
  igual('a linha fica com o compromisso mais antigo', fila[0].evento.id, evs[0].id,
    'chegaram fora de ordem; o mais antigo é o que está esperando há mais tempo');
}());

/* ══ 3. O DEDUPE CONTRA O BASE CONTINUA VALENDO ══════════════════════════════════════
   O extra SUBSTITUI a posição do negócio no base — o item do base não sabe que houve
   compromisso hoje, e é isso que muda a urgência. */
(function () {
  const m = montarCtx(eventos(2, BOCA.id), [BOCA.id, '999']);
  const fila = m.ctx.h8Fila({ ownerId: '97978276' }, m.diag);
  igual('o negócio que já estava na fila não volta a duplicar', fila.length, 2,
    'o Boca a Boca (uma vez) e o outro negócio do base');
  const ids = fila.map(function (x) { return String(x.lead.id); });
  igual('e o Boca a Boca aparece uma vez só',
    ids.filter(function (x) { return x === BOCA.id; }).length, 1);
  igual('o extra assume a posição, com o selo', fila[0].compromissosHoje, 2);
}());

/* ══ 4. O CLIENTE SEM NEGÓCIO NO FUNIL ═══════════════════════════════════════════════
   O pseudo-lead usa o id do COMPROMISSO, então dois compromissos do mesmo cliente têm
   ids diferentes e escapam de qualquer dedupe por id. A chave tem de ser o nome. */
(function () {
  const ctx = montarCtx([], []).ctx;
  ctx.buscarLeadFunilPorId = function () { return null; };
  ctx.meusNegociosAbertos = function () { return []; };
  const m = { ctx: ctx, diag: { fila: { ordenada: [] },
    contexto: { deHoje: eventos(2, null, 'Padaria Sem Negócio') } } };
  const fila = ctx.h8Fila({ ownerId: '97978276' }, m.diag);
  igual('dois compromissos do mesmo cliente sem negócio dão UMA linha', fila.length, 1,
    'ids `ev:` diferentes passam por qualquer dedupe por id — a chave é o nome');
  igual('e ela é a de criar o negócio', fila[0].semNegocio, true);
  igual('e conta os dois', fila[0].compromissosHoje, 2);
}());

/* CLIENTES DIFERENTES NÃO SE FUNDEM — o erro oposto, e mais silencioso. */
(function () {
  const ctx = montarCtx([], []).ctx;
  ctx.buscarLeadFunilPorId = function () { return null; };
  ctx.meusNegociosAbertos = function () { return []; };
  const evs = eventos(1, null, 'Padaria A').concat(eventos(1, null, 'Padaria B'));
  const fila = ctx.h8Fila({ ownerId: '97978276' },
    { fila: { ordenada: [] }, contexto: { deHoje: evs } });
  igual('dois clientes diferentes continuam sendo duas linhas', fila.length, 2,
    'fundir por nome errado esconderia uma visita do dia inteira');
}());

/* ══ 5. O SELO NA TELA ═══════════════════════════════════════════════════════════════
   compromissosHoje emitido e não lido seria o décimo quarto atributo órfão deste arquivo.
   O selo também é a conversa que o gestor precisa ter: duas tarefas abertas no mesmo
   negócio significam que ninguém fechou a anterior. */
checar('a linha desenha o excesso',
  /const nHoje = Number\(item\.compromissosHoje\) \|\| 0;/.test(tpl)
    && /compromissos hoje neste negócio/.test(tpl)
    && /\+     selo \+ seloExcesso/.test(tpl),
  'campo emitido e nunca lido é a dívida que esta base já tem treze vezes');

checar('e o selo só aparece quando há excesso',
  /const seloExcesso = nHoje > 1/.test(tpl),
  'selo em toda linha ninguém lê');

checar('o selo tem estilo alcançável',
  /\.h8-selo-excesso\{/.test(tpl),
  'classe sem regra sai sem cor nenhuma e vira texto solto no meio da linha');

/* ══ 6. AS TRÊS CAMADAS ANTIGAS DE DEDUPE CONTINUAM LÁ ═══════════════════════════════
   Elas não eram o defeito, e tirar qualquer uma reabre o mesmo buraco por outra porta. */
checar('meusNegociosAbertos continua deduplicando por id',
  /if \(vistos\.has\(String\(l\.id\)\)\) return;/.test(tpl));
checar('a fila de follow-up continua deduplicando por negócio',
  /const k = String\(it\.lead\.id\);\n      if \(vistos\.has\(k\)\) return;/.test(tpl));
checar('e o extra continua substituindo a posição no base',
  /if \(jaNaFila\.has\(String\(lead\.id\)\)\) \{/.test(tpl));

console.log('');
console.log('fila única: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(f => console.log('  ✗ ' + f));
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
