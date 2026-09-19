#!/usr/bin/env node
/* ============================================================================
   TOQUE É ATIVIDADE REALIZADA (19/09/26)

   Julyan, olhando a tela Time: "voce consegue ver que só deram 1 toque no lead". Estava
   olhando um número que contava compromisso MARCADO como toque DADO.

   O DEFEITO: `fetchAgenda` busca tarefas de -60d a +90d sem filtrar status, porque a
   agenda precisa mostrar o que ainda vai acontecer. `tm10ToquesPorNegocio` lia a lista
   inteira e somava tudo. Medido em data/hubspot.json (528 itens, 500 com negócio):
     · 62 itens são tarefa NOT_STARTED — compromisso marcado, não cumprido;
     · 42 dos 305 negócios com toque tinham ao menos um desses;
     · 17 negócios liam N toques tendo feito ZERO.
   E o lado do executivo (`toquesDoLead`) nunca contou assim — "Tarefas EM ABERTO não são
   toques realizados; são o próximo passo". O mesmo lead tinha dois números por tela.

   POR QUE UMA SUÍTE DE COMPORTAMENTO, E NÃO DE TEXTO: uma checagem que só procurasse
   'COMPLETED' no template daria verde com a string presente num comentário, ou presente
   numa função que ninguém chama. O que precisa ser verdade é a CONTAGEM. Então esta
   suíte recorta as funções de produção do template e as roda em `vm`, como
   testar-nucleo.js faz com o núcleo do executivo.

   Uso: node scripts/testar-toque-realizado.js
   ============================================================================ */

/* FUSO FIXO, ANTES DO PRIMEIRO `Date`. `tm10Ultimo` compara `isoDate(new Date())` (data
   LOCAL do navegador) com o dia de Brasília do toque (-3h). No navegador do time as duas
   coisas são a mesma; no runner do GitHub Actions, que roda em UTC, entre 00h e 03h UTC
   elas divergem em um dia e o teste acusaria defeito que a tela não tem. Fixar o fuso é
   o que faz a suíte medir o código em vez do relógio de quem a roda. */
process.env.TZ = 'America/Sao_Paulo';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

/* Recorte por NOME e por contagem de chaves. Sem marcador de bloco, de propósito: se
   alguém renomear ou apagar uma destas funções, o recorte falha alto aqui em vez de a
   suíte medir outra coisa em silêncio. */
function recortar(nome) {
  const assinatura = 'function ' + nome + '(';
  const i = html.indexOf(assinatura);
  if (i < 0) {
    console.error('FALHA: ' + nome + ' não existe mais no template.');
    process.exit(1);
  }
  if (html.indexOf(assinatura, i + 1) > 0) {
    console.error('FALHA: ' + nome + ' aparece duas vezes no template — o recorte pegaria a errada.');
    process.exit(1);
  }
  let d = 0, j = i, viu = false;
  while (j < html.length) {
    const c = html[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return html.slice(i, j + 1);
}

const ALVOS = ['tm10QuandoDoItem', 'tm10ToqueRealizado', 'tm10ToquesPorNegocio', 'tm10Tq',
  'tm10Ultimo', 'isoDate'];
const codigo = 'let TM10_TQ = null;\n' + ALVOS.map(recortar).join('\n');

/* ──────────────────────────────────────────────────────────────────────────────────────
   FIXTURES

   Relógio ancorado ao meio-dia de Brasília de um dia útil, pela mesma razão de
   testar-nucleo.js: "hoje - 2h" perto da meia-noite cai no dia anterior, e a suíte
   passaria a medir a hora em que foi executada.
   ────────────────────────────────────────────────────────────────────────────────────── */
const _real = new Date();
const _d = new Date(Date.UTC(_real.getUTCFullYear(), _real.getUTCMonth(), _real.getUTCDate()));
while (_d.getUTCDay() === 0 || _d.getUTCDay() === 6) _d.setUTCDate(_d.getUTCDate() - 1);
const AGORA = Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate(), 15, 0, 0); /* 12h BRT */
const H = 3600000;
const DIA = 86400000;
const iso = (ms) => new Date(ms).toISOString();

class DataFixa extends Date {
  constructor(...a) { if (a.length === 0) super(AGORA); else super(...a); }
  static now() { return AGORA; }
}

function rodar(itens) {
  const ctx = { DATA: { agenda: { itens: itens } }, Date: DataFixa, Number: Number,
    Map: Map, String: String, console: console };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return ctx;
}

/* Um item da agenda no formato exato que o robô grava (ver fetchAgenda). */
const tarefa = (dealId, ms, status, extra) => Object.assign({
  lead_deal_id: dealId, hs_task_subject: 'Visita - Fixture', hs_task_status: status,
  hs_task_type: 'TODO', hs_timestamp: iso(ms)
}, extra || {});
const reuniao = (dealId, ms) => ({
  lead_deal_id: dealId, hs_meeting_title: 'Reunião', hs_meeting_start_time: iso(ms)
});
const nota = (dealId, ms) => ({
  lead_deal_id: dealId, hs_note_body: 'Passei no cliente — Sandro (via App Outbound)',
  hs_timestamp: iso(ms)
});

let ok = 0;
const falhas = [];
function checar(nome, condicao, porque) {
  if (condicao) { ok++; return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
}
function igual(nome, veio, esperado, porque) {
  checar(nome, veio === esperado,
    (porque ? porque + ' · ' : '') + 'esperava ' + JSON.stringify(esperado) + ', veio ' + JSON.stringify(veio));
}

/* ── 1. A REGRA POR TIPO ───────────────────────────────────────────────────────────── */
(function () {
  const c = rodar([
    tarefa('1', AGORA - 2 * H, 'COMPLETED'),
    tarefa('2', AGORA - 40 * DIA, 'NOT_STARTED'),
    tarefa('3', AGORA - 5 * DIA, 'WAITING'),
    tarefa('4', AGORA + 2 * DIA, 'COMPLETED'),
    reuniao('5', AGORA - 3 * H),
    reuniao('6', AGORA + 3 * DIA),
    nota('7', AGORA - 6 * H)
  ]);

  igual('a tarefa COMPLETED no passado é um toque', c.tm10Tq('1').n, 1,
    'é o check-in do app, que nasce COMPLETED');
  igual('a tarefa NOT_STARTED NÃO é um toque', c.tm10Tq('2').n, 0,
    'compromisso marcado e não cumprido — 62 assim no snapshot real');
  igual('e ela conta como promessa em aberto', c.tm10Tq('2').abertos, 1);
  igual('nenhum status fora de COMPLETED conta', c.tm10Tq('3').n, 0,
    'a régua é lista branca: só COMPLETED, não "tudo menos NOT_STARTED"');
  igual('tarefa com data no futuro não é toque nem quando COMPLETED', c.tm10Tq('4').n, 0,
    'a agenda vai até +90 dias; toque de amanhã não é toque de hoje');
  igual('a reunião que já começou é um toque', c.tm10Tq('5').n, 1);
  igual('a reunião de depois de amanhã não é', c.tm10Tq('6').n, 0);
  igual('e ela conta como promessa em aberto', c.tm10Tq('6').abertos, 1);
  igual('a nota do App Outbound é um toque', c.tm10Tq('7').n, 1,
    'ela é escrita DEPOIS do contato — o texto existir é o fato');
}());

/* ── 2. OS DOIS RAMOS DEFENSIVOS ───────────────────────────────────────────────────── */
(function () {
  /* O HubSpot OMITE propriedade vazia na resposta. Uma tarefa sem assunto chegaria sem
     `hs_task_subject`, e um teste só por assunto a mandaria para o ramo da nota — onde
     tudo conta. Foi por isso que a regra olha os DOIS campos. */
  const c = rodar([
    { lead_deal_id: '1', hs_task_status: 'NOT_STARTED', hs_timestamp: iso(AGORA - DIA) },
    { lead_deal_id: '2', hs_task_subject: 'Retorno.', hs_timestamp: iso(AGORA - DIA) },
    { hs_task_subject: 'Visita - sem negócio', hs_task_status: 'COMPLETED', hs_timestamp: iso(AGORA - DIA) },
    { lead_deal_id: '4', hs_task_status: 'COMPLETED', hs_timestamp: 'data-invalida' }
  ]);
  igual('tarefa sem assunto continua sendo tarefa', c.tm10Tq('1').n, 0,
    'o HubSpot omite propriedade vazia; sem este teste ela cairia no ramo da nota');
  igual('tarefa sem status não é dada por feita', c.tm10Tq('2').n, 0,
    'ausência de COMPLETED não é COMPLETED');
  igual('item sem negócio associado não entra em lugar nenhum', c.tm10ToquesPorNegocio().size, 3,
    'nota/tarefa sem deal não tem ficha onde aparecer');
  igual('data impossível de ler não vira toque', c.tm10Tq('4').n, 0);
}());

/* ── 3. ZERO POR ABANDONO x ZERO POR NUNCA TER ENTRADO ────────────────────────────── */
(function () {
  const c = rodar([tarefa('1', AGORA - 40 * DIA, 'NOT_STARTED')]);
  checar('o negócio que só tem compromisso aberto ESTÁ no mapa',
    c.tm10ToquesPorNegocio().has('1'),
    'sem isto ele lê igual ao lead que a agenda nunca tocou, e some a informação de que alguém prometeu e não foi');
  igual('e lê 0 toques com 1 aberto', c.tm10Tq('1').n + ':' + c.tm10Tq('1').abertos, '0:1');
  const zerado = c.tm10Tq('nunca-visto');
  igual('o negócio ausente lê 0 toques e 0 abertos', zerado.n + ':' + zerado.abertos, '0:0',
    'o formato tem de ser o mesmo dos dois lados ou `.abertos` vira undefined em quem lê');
}());

/* ── 4. O "ÚLTIMO TOQUE" É O ÚLTIMO REALIZADO ─────────────────────────────────────── */
(function () {
  const c = rodar([
    tarefa('1', AGORA - 9 * DIA, 'COMPLETED'),
    tarefa('1', AGORA - 2 * DIA, 'COMPLETED'),
    tarefa('1', AGORA + 4 * DIA, 'NOT_STARTED')
  ]);
  igual('o negócio soma só os dois realizados', c.tm10Tq('1').n, 2);
  igual('e o último toque é o mais recente REALIZADO, não o compromisso futuro',
    c.tm10Ultimo(c.tm10Tq('1').ultimo), 'há 2d',
    'com o futuro entrando, a tela lia "há -4d"');
}());

/* ── 5. O PISO DO tm10Ultimo ──────────────────────────────────────────────────────── */
(function () {
  const c = rodar([]);
  igual('sem toque nenhum a tela diz isso', c.tm10Ultimo(null), 'sem toque');
  igual('hoje é "hoje"', c.tm10Ultimo(AGORA - 2 * H), 'hoje');
  igual('ontem é "ontem"', c.tm10Ultimo(AGORA - DIA), 'ontem');
  igual('anteontem é "há 2d"', c.tm10Ultimo(AGORA - 2 * DIA), 'há 2d');
  igual('data no futuro não sai como número negativo', c.tm10Ultimo(AGORA + 3 * DIA), 'agendado',
    '"há -3d" na tela do gestor era o sintoma de um item não realizado ter passado');
}());

/* ── 6. O CONTRATO COM O LADO DO EXECUTIVO ────────────────────────────────────────── */
(function () {
  /* Esta é a checagem que impede a divergência de voltar. Ela olha o núcleo do
     executivo, que é a origem da régua, e não o lado do gestor que acabei de mudar. */
  const i = html.indexOf('// (c) Tarefas EM ABERTO');
  checar('o núcleo do executivo continua declarando que tarefa em aberto não é toque',
    i > 0 && html.indexOf('_realizado: false', i) > i && html.indexOf('_realizado: false', i) - i < 1600,
    'se este lado mudar, os dois números do mesmo lead divergem de novo — e foi o defeito que esta suíte veio fechar');
  checar('e a contagem dele continua filtrando por _realizado',
    html.indexOf('const realizados = lista.filter(t => t._realizado);') > 0);
}());

/* ── 7. O CACHE É DO RENDER, NÃO DA SESSÃO ───────────────────────────────────────── */
(function () {
  const c = rodar([tarefa('1', AGORA - DIA, 'COMPLETED')]);
  igual('a primeira leitura conta', c.tm10Tq('1').n, 1);
  c.DATA.agenda.itens = [];
  igual('e a segunda vem do cache', c.tm10Tq('1').n, 1,
    'é o que faz uma repintura não varrer a agenda 12 vezes');
  const zerar = html.indexOf('TM10_TQ = null;   /* uma contagem por repintura');
  checar('e existe um ponto que zera o cache a cada repintura', zerar > 0,
    'sem ele a tela nunca refletiria uma carga nova de dados');
}());

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('toque realizado: ' + ok + ' checagens ok — compromisso marcado não conta como toque dado, '
  + 'reunião futura não conta, o zero por abandono se distingue do zero por ausência e o "há -Nd" tem piso.');
