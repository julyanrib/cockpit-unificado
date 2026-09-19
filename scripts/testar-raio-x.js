#!/usr/bin/env node
/* ============================================================================
   A ABA RAIO X (19/09/26)

   Julyan: "pode criar essa aba pro gestor e publicar mas com revisão, quero dados reais,
   ações a fazer e gargalos a derrubar".

   A aba responde UMA pergunta: o que fecha este mês e o que está no caminho. Só fundo de
   funil (Demo/Proposta, Negociação, Ag. Pagamento). Medido em 19/09 no snapshot de
   produção: 204 negócios abertos, 29 no fundo, 23 sem próximo passo.

   ESTA SUÍTE RODA O CÓDIGO DE PRODUÇÃO em `vm`, como testar-nucleo.js e
   testar-toque-realizado.js — e não procura strings. O que precisa ser verdade aqui é a
   DERIVAÇÃO: qual etapa entra, o que conta como gargalo, em que ordem as ações saem.
   Checagem de texto não responde nenhuma das três.

   DOIS DEFEITOS REAIS desta construção estão cravados abaixo, porque os dois passaram
   pela leitura do código e só apareceram medindo no navegador:
     · `DATA.kpis` não existe no front (é `kpisHub`) — o placar do mês abriu vazio;
     · `lead.temp` não chega ao front — o chip de temperatura nasceria vazio em 100%
       das linhas.

   Uso: node scripts/testar-raio-x.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const cadenciasJson = require(path.join(raiz, 'data', 'cadencias.json'));

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

/* ── O RECORTE ───────────────────────────────────────────────────────────────────── */
function recortarFn(nome) {
  const assinatura = 'function ' + nome + '(';
  const i = html.indexOf(assinatura);
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe no template.'); process.exit(1); }
  if (html.indexOf(assinatura, i + 1) > 0) {
    console.error('FALHA: ' + nome + ' aparece duas vezes — o recorte pegaria a errada.');
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
/* RECORTE PELO NOME, NUNCA PELO VALOR. A primeira versão procurava a declaração
   INTEIRA, com os ids dentro — e aí mudar a lista de etapas fazia a suíte MORRER
   ("não achei") em vez de medir o efeito da mudança. Guarda que morre quando o código
   muda não é guarda: ela só sabe dizer que algo mexeu, não o que quebrou. */
function recortarConst(nome) {
  const decl = 'const ' + nome + ' = ';
  const i = html.indexOf(decl);
  if (i < 0) { console.error('FALHA: não achei a constante ' + nome); process.exit(1); }
  if (html.indexOf(decl, i + 1) > 0) {
    console.error('FALHA: ' + nome + ' é declarada duas vezes.'); process.exit(1);
  }
  const fim = html.indexOf('\n', i);
  return html.slice(i, fim);
}

const CONSTS = ['RX1_FUNDO', 'RX1_TOPO', 'RX1_URGENCIA', 'RX1_ACOES_TETO'].map(recortarConst);

const FNS = ['rx1Etapa', 'rx1Leads', 'rx1Mrr', 'rx1Quentes', 'rx1Dados',
  'rx1Gargalos', 'rx1Acoes', 'rx1FiltroFn', 'cadenciaMinimoToques', 'tm10Rs'];

/* RX1_FILTROS é um array multilinha — recorte por delimitador, e com conferência de que
   ele tem os cinco que a tela mostra. */
const iFil = html.indexOf('const RX1_FILTROS = [');
const fFil = html.indexOf('];', iFil) + 2;
const FILTROS_SRC = html.slice(iFil, fFil);

/* AS CONSTANTES PRECISAM DE UMA PONTE. Declaração const no topo de um contexto de vm
   NÃO vira propriedade do objeto de contexto — só var vira. Sem esta linha,
   ctx.RX1_FILTROS é undefined e a suíte ESTOURA em vez de reprovar, que é o pior dos
   dois: harness que quebra não diz qual guarda pegou o quê. */
const NL = String.fromCharCode(10);
const codigo = CONSTS.join(NL) + NL + FILTROS_SRC + NL
  + FNS.map(recortarFn).join(NL)
  + NL + 'var __rx = { FILTROS: RX1_FILTROS, TETO: RX1_ACOES_TETO,'
  + ' FUNDO: RX1_FUNDO, TOPO: RX1_TOPO };';

/* ── O ENTORNO ───────────────────────────────────────────────────────────────────── */
const AGORA = Date.UTC(2026, 8, 19, 15, 0, 0);   /* 19/09/26, meio-dia BRT */
class DataFixa extends Date {
  constructor(...a) { if (a.length === 0) super(AGORA); else super(...a); }
  static now() { return AGORA; }
}

const LABELS = {
  '1395880469': 'Prospecção', '1396005401': 'Visita', '1395880470': 'Conversa com Decisor',
  '1395880471': 'Demo/Proposta', '1395880472': 'Negociação', '1395880473': 'Ag. Pagamento',
  '1396006163': 'Enviado Onboarding', '1396006164': 'Perdido'
};

/* `tm10Tq` tem suíte própria (testar-toque-realizado.js, 28 checagens). Aqui ela é um
   dublê alimentado pelo fixture: o que ESTA suíte mede é o que o Raio X FAZ com a
   contagem, não a contagem. */
function rodar(fixture) {
  const tq = fixture.toques || {};
  const ctx = {
    DATA: {
      funilLeads: fixture.funil || {},
      stageMeta: { labels: LABELS },
      reps: fixture.reps || [],
      kpisHub: fixture.kpisHub || {},
      temperatura: fixture.temperatura || {},
      cadencias: fixture.cadencias === undefined ? cadenciasJson : fixture.cadencias,
      hubspotUpdatedAtFmt: '19/09/2026 às 09:54'
    },
    tm10Tq: function (id) { return tq[String(id)] || { n: 0, ultimo: null, abertos: 0 }; },
    tm10Ultimo: function (ms) { return ms == null ? 'sem toque' : 'há Nd'; },
    tm10TqRot: function (n) { return n === 1 ? '1 toque' : n + ' toques'; },
    sm5RitmoDoMes: function () {
      return fixture.ritmo || { uteis: 22, decorridos: 14, fracao: 14 / 22 };
    },
    Date: DataFixa, Number: Number, Math: Math, String: String, Object: Object,
    JSON: JSON, Array: Array, console: console, isNaN: isNaN, isFinite: isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  const d = ctx.rx1Dados();
  return { ctx: ctx, d: d, g: ctx.rx1Gargalos(d), a: ctx.rx1Acoes(d) };
}

/* Um negócio do funil no formato que o front recebe — conferido no navegador com o
   preview do gestor aberto. Note que NÃO existe `temp`: o snapshot tem, a projeção do
   gestor não repassa. */
const neg = (id, extra) => Object.assign({
  id: String(id), name: 'Negócio ' + id, dealname: 'Negócio ' + id,
  mrr: null, valor_de_mrr: '500', dias: 3, slaBreach: false,
  proximaAtividade: null, ownerId: '86100506', vendedor: 'Bruno Martins'
}, extra || {});

/* `name`, e não `nome`: é o campo que DATA.reps realmente tem, medido no navegador. */
const REPS = [{ ownerId: '86100506', name: 'Bruno Martins' },
  { ownerId: '86100505', name: 'Marco Filho' }];

/* ══ 1. AS ETAPAS FECHADAS NÃO ENTRAM ═══════════════════════════════════════════════
   O defeito que esta base já cometeu: DATA.funilLeads traz Enviado Onboarding e Perdido
   DENTRO dele, e quem escreve "tudo que não é topo" conta negócio morto como
   oportunidade do mês. */
(function () {
  const r = rodar({
    reps: REPS,
    funil: {
      '1395880472': [neg(1)],
      '1395880471': [neg(2)],
      '1395880473': [neg(3)],
      '1395880469': [neg(4)],
      '1396005401': [neg(5)],
      '1395880470': [neg(6)],
      '1396006163': [neg(7)],   /* Enviado Onboarding — vendido, não é oportunidade */
      '1396006164': [neg(8)]    /* Perdido — acabou */
    }
  });
  igual('o fundo são só as três etapas de fechamento', r.d.itens.length, 3,
    'Onboarding e Perdido vêm dentro de funilLeads e não podem contar como mês');
  igual('e os abertos somam topo + fundo, sem os fechados', r.d.abertos, 6);
  const ids = r.d.itens.map(function (i) { return i.id; }).sort();
  igual('nenhum negócio de etapa fechada aparece na lista', ids, ['1', '2', '3']);
}());

/* ══ 2. OS GARGALOS SÃO CONTAGENS, E O QUE ZEROU NÃO APARECE ═══════════════════════ */
(function () {
  const limpo = rodar({
    reps: REPS,
    funil: { '1395880472': [neg(1, { proximaAtividade: '2026-09-22T12:00:00Z' })] },
    toques: { '1': { n: 5, ultimo: AGORA - 86400000, abertos: 0 } },
    kpisHub: { fechadosNoMes: 50, metaMensalFechados: 50 }
  });
  const titulos = limpo.g.map(function (x) { return x.t; });
  checar('carteira sem problema não gera gargalo nenhum', limpo.g.length === 0,
    'bloco que sempre acusa algo é bloco que ninguém lê · veio ' + JSON.stringify(titulos));

  const ruim = rodar({
    reps: REPS,
    funil: {
      '1395880473': [neg(1, { valor_de_mrr: '979' })],
      '1395880472': [neg(2), neg(3, { slaBreach: true })],
      /* CINCO NO TOPO, e não quatro: com 4 de 7 dá 57% e o gargalo não dispara — o corte
         é 60%. A primeira versão desta fixture reprovou o código CERTO, e é exatamente
         para isso que se escreve o número esperado do lado. */
      '1395880469': [neg(4), neg(5), neg(6), neg(7), neg(8)]
    },
    toques: { '2': { n: 0, ultimo: null, abertos: 3 } }
  });
  const t2 = ruim.g.map(function (x) { return x.t; });
  checar('Ag. Pagamento sem data marcada é o primeiro gargalo',
    t2[0] === 'Vendido e sem ninguém marcado',
    'é o único degrau em que o negócio já está vendido · veio ' + JSON.stringify(t2));
  checar('e ele é marcado como grave', ruim.g[0].grave === true);
  checar('fundo sem data marcada é gargalo', t2.indexOf('Fundo de funil sem data marcada') > -1);
  checar('zero toque é gargalo', t2.indexOf('Negócio no fundo sem um toque registrado') > -1);
  checar('compromisso marcado sem toque feito é gargalo próprio',
    t2.indexOf('Compromisso marcado e nenhum toque feito') > -1,
    'é o dado que só existe desde que o contador separou promessa de toque dado');
  checar('régua estourada é gargalo', t2.indexOf('Régua da etapa estourada') > -1);
  checar('carteira larga em cima é gargalo quando passa de 60%',
    t2.indexOf('A carteira é larga em cima e fina embaixo') > -1,
    '4 no topo de 7 abertos é 57%... confira o corte');
}());

/* ══ 3. A DUPLICATA ACUSA OS DOIS, E SÓ DO MESMO DONO ══════════════════════════════ */
(function () {
  const r = rodar({
    reps: REPS,
    funil: { '1395880472': [
      neg(1, { name: 'Salseiro brasa e lenha' }),
      neg(2, { name: 'salseiro  brasa e lenha' }),      /* caixa e espaço diferentes */
      neg(3, { name: 'Salseiro brasa e lenha', ownerId: '86100505', vendedor: 'Marco Filho' }),
      neg(4, { name: 'Outro lugar' })
    ] }
  });
  const dup = r.d.itens.filter(function (i) { return i.duplicata; }).map(function (i) { return i.id; });
  igual('os dois do mesmo dono são acusados, e os DOIS', dup.sort(), ['1', '2'],
    'acusar só o segundo faria o gestor apagar o errado');
  checar('nome igual de dono DIFERENTE não é duplicata',
    dup.indexOf('3') < 0,
    'a mesma casa atendida por dois executivos é conflito de carteira, não ficha repetida');
  const g = r.g.filter(function (x) { return x.t === 'Mesmo nome e mesmo dono, duas vezes'; })[0];
  checar('e o gargalo manda CONFERIR, não apagar',
    !!g && /conferir/.test(g.p),
    'multiloja e upsell repetem nome de verdade — afirmar duplicata apagaria negócio bom');
}());

/* ══ 4. SEM DONO ATIVO ═════════════════════════════════════════════════════════════ */
(function () {
  const r = rodar({
    reps: REPS,
    funil: { '1395880472': [
      neg(1),
      neg(2, { ownerId: '99999999', vendedor: 'Quem Saiu' }),
      neg(3, { ownerId: '', vendedor: null })
    ] }
  });
  const orfaos = r.d.itens.filter(function (i) { return i.semDonoAtivo; }).map(function (i) { return i.id; });
  igual('negócio de quem saiu do time é marcado', orfaos.sort(), ['2', '3'],
    'DATA.reps é quem o Cockpit reconhece como time hoje');
  checar('e ele NÃO desaparece da lista', r.d.itens.length === 3,
    'sumir com ele é o que faz ninguém cobrar — some da tela e some do 1:1');
  checar('e vira gargalo grave',
    r.g.filter(function (x) { return x.t === 'Fundo de funil sem dono ativo no time' && x.grave; }).length === 1);
}());

/* ══ 5. AS AÇÕES: ORDEM E TETO ═════════════════════════════════════════════════════ */
(function () {
  const r = rodar({
    reps: REPS,
    funil: {
      '1395880471': [neg(1, { valor_de_mrr: '9000' })],   /* Demo, MRR altíssimo */
      '1395880472': [neg(2, { valor_de_mrr: '5000' })],   /* Negociação */
      '1395880473': [neg(3, { valor_de_mrr: '100' })]     /* Ag. Pagamento, MRR baixo */
    }
  });
  igual('Ag. Pagamento vem antes, mesmo com MRR muito menor',
    r.a.lista.map(function (x) { return x.id; }), ['3', '2', '1'],
    'R$ 100 a um passo do ganho fecha antes de R$ 9.000 em Demo');

  const muitos = {};
  const lista = [];
  for (let i = 1; i <= 20; i++) lista.push(neg(i));
  muitos['1395880472'] = lista;
  const r2 = rodar({ reps: REPS, funil: muitos });
  igual('a fila é cortada no teto', r2.a.lista.length, r2.ctx.__rx.TETO,
    'fila de 20 itens não é fila, é outra lista');
  igual('e o total continua sendo dito', r2.a.total, 20,
    'sem o total, o corte esconde o tamanho do problema');
}());

/* ══ 6. O VERBO DIZ O GESTO ════════════════════════════════════════════════════════ */
(function () {
  const r = rodar({
    reps: REPS,
    funil: { '1395880472': [neg(1), neg(2), neg(3, { name: 'X' }), neg(4, { name: 'X' })] },
    toques: {
      '1': { n: 0, ultimo: null, abertos: 4 },
      '2': { n: 2, ultimo: AGORA - 10 * 86400000, abertos: 0 }
    }
  });
  const por = {};
  r.a.lista.forEach(function (x) { por[x.id] = x; });
  igual('marcou e não foi vira COBRAR', por['1'].verbo, 'cobrar');
  checar('e o motivo diz quantos compromissos', /4 compromissos marcados/.test(por['1'].por),
    'veio: ' + por['1'].por);
  igual('sem próximo passo vira DATAR', por['2'].verbo, 'datar');
  igual('duplicata vira CONFERIR', por['3'].verbo, 'conferir');
  checar('e conferir é verbo calmo, não vermelho', por['3'].calmo === true,
    'duplicata é higiene, não cobrança de vendedor');
}());

/* ══ 7. O PLACAR DO MÊS ════════════════════════════════════════════════════════════ */
(function () {
  /* SEM META NÃO HÁ BARRA. Dividir por zero daria Infinity e a barra encheria sozinha —
     o zero que tranquiliza, pela porta de trás. */
  const semMeta = rodar({ reps: REPS, funil: {}, kpisHub: { fechadosNoMes: 3 } });
  igual('sem meta no snapshot, a porcentagem é null', semMeta.d.mes.pct, null,
    'null é o que faz a tela declarar a ausência em vez de desenhar 0% de um alvo que não existe');

  const batida = rodar({ reps: REPS, funil: {}, kpisHub: { fechadosNoMes: 60, metaMensalFechados: 50 } });
  igual('meta batida dá gap ZERO, não negativo', batida.d.mes.gap, 0);
  igual('e a barra não passa de 100%', batida.d.mes.pct, 100);

  const normal = rodar({ reps: REPS, funil: {},
    kpisHub: { fechadosNoMes: 11, metaMensalFechados: 50 },
    ritmo: { uteis: 22, decorridos: 14, fracao: 14 / 22 } });
  igual('o placar sai do snapshot', normal.d.mes.fechados + '/' + normal.d.mes.meta, '11/50');
  igual('o gap é a conta', normal.d.mes.gap, 39);
  igual('e os dias úteis restantes saem do calendário', normal.d.mes.restantes, 8,
    '22 úteis no mês, 14 decorridos');
}());

/* ══ 8. OS DOIS CAMPOS QUE EU ASSUMI E NÃO EXISTEM ═════════════════════════════════
   Os dois passaram pela leitura do código e só apareceram medindo no navegador. */
(function () {
  checar('os KPIs saem de kpisHub, que é o nome que o front tem',
    /const k = \(DATA && DATA\.kpisHub\) \|\| \{\};/.test(html)
      && html.indexOf('const k = (DATA && DATA.kpis) ||') < 0,
    'DATA.kpis é undefined no front — montar-dados publica como kpisHub, e a primeira '
      + 'versão desta aba abriu com o placar do mês vazio');

  checar('a temperatura NÃO sai de lead.temp',
    html.indexOf("temp: x.l.temp != null") < 0,
    'o campo existe no snapshot e não chega ao front; o chip nasceria vazio em toda linha');
  checar('e sai da lista de quentes, que chega',
    /DATA\.temperatura && DATA\.temperatura\.quentes/.test(html)
      && /quente: !!quentes\[String\(x\.l\.id\)\]/.test(html),
    'é a mesma fonte que as outras telas leem');

  checar('o nome do dono cai para reps[].name, não .nome',
    /ativos\[dono\] && ativos\[dono\]\.name/.test(html)
      && html.indexOf('ativos[dono].nome') < 0,
    'medido no navegador: DATA.reps usa `name`. Com `.nome` o ramo era código morto e '
      + 'negócio sem `vendedor` cairia em "Sem dono ativo" mesmo com dono vivo');

  /* E o comportamento, não só o texto. */
  const r = rodar({
    reps: REPS,
    funil: { '1395880472': [neg(1), neg(2)] },
    temperatura: { quentes: [{ id: '1' }] }
  });
  const q = r.d.itens.filter(function (i) { return i.quente; }).map(function (i) { return i.id; });
  igual('o negócio da lista de quentes é marcado', q, ['1']);

  /* O DONO VINDO DE reps, quando o negócio não traz `vendedor`. Este é o caso que o
     `.nome` errado tornava inalcançável. */
  const semVendedor = rodar({
    reps: [{ ownerId: '86100506', name: 'Bruno Martins' }],
    funil: { '1395880472': [neg(1, { vendedor: null })] }
  });
  igual('negócio sem vendedor pega o nome de reps', semVendedor.d.itens[0].dono, 'Bruno Martins');
  igual('e ele NÃO é marcado como sem dono ativo', semVendedor.d.itens[0].semDonoAtivo, false,
    'o owner está no time; o que faltava era só o nome colado no negócio');
}());

/* ══ 9. O MRR CAI PARA O CAMPO QUE EXISTE ══════════════════════════════════════════ */
(function () {
  const r = rodar({
    reps: REPS,
    funil: { '1395880472': [
      neg(1, { mrr: null, valor_de_mrr: '649' }),
      neg(2, { mrr: 800, valor_de_mrr: '800' }),
      neg(3, { mrr: null, valor_de_mrr: null }),
      /* TEXTO ONDE DEVIA HAVER NÚMERO. Acontece de verdade: o campo é livre no HubSpot
         e já chegou "R$ 500" e string vazia. Sem o piso, Number() devolve NaN, e um
         NaN somado ao total apaga o MRR da tela inteira. */
      neg(4, { mrr: null, valor_de_mrr: 'R$ 500' })
    ] }
  });
  const m = {};
  r.d.itens.forEach(function (i) { m[i.id] = i.mrr; });
  igual('mrr nulo cai para valor_de_mrr', m['1'], 649,
    'medido no front: mrr chega null e valor_de_mrr chega como string');
  igual('mrr preenchido manda', m['2'], 800);
  igual('sem nenhum dos dois é zero, não NaN', m['3'], 0,
    'NaN somado ao total apagaria o MRR da tela inteira');
  igual('valor que não é número também vira zero, não NaN', m['4'], 0,
    'o campo é livre no HubSpot e já chegou com texto dentro');
  const total = r.d.itens.reduce(function (s, i) { return s + i.mrr; }, 0);
  igual('e o total do fundo continua somável', total, 1449,
    'um NaN no meio faz a soma inteira virar NaN, e o hero mostra "R$ NaN"');
}());

/* ══ 10. OS FILTROS ════════════════════════════════════════════════════════════════ */
(function () {
  const r = rodar({
    reps: REPS,
    funil: {
      '1395880473': [neg(1, { valor_de_mrr: '100' })],
      '1395880472': [neg(2, { proximaAtividade: '2026-09-22T12:00:00Z', valor_de_mrr: '0' })],
      '1395880471': [neg(3)]
    },
    toques: { '2': { n: 3, ultimo: AGORA, abertos: 0 } }
  });
  const conta = function (id) { return r.d.itens.filter(r.ctx.rx1FiltroFn(id)).length; };
  igual('o filtro de todos conta tudo', conta('todos'), 3);
  igual('sem próximo passo conta os dois sem data', conta('sem'), 2);
  igual('zero toque conta os dois sem toque', conta('zero'), 2);
  igual('Ag. Pagamento conta um', conta('pag'), 1);
  igual('com MRR ignora o de valor zero', conta('mrr'), 2);
  igual('filtro desconhecido cai em todos', r.d.itens.filter(r.ctx.rx1FiltroFn('xpto')).length, 3,
    'um id novo na tela não pode esvaziar a lista em silêncio');
  igual('a tela oferece os cinco filtros', r.ctx.__rx.FILTROS.length, 5);
}());

/* ══ 11. O PISO DE TOQUES VEM DA RÉGUA, NÃO DE UM 4 ════════════════════════════════ */
(function () {
  const r = rodar({ reps: REPS, funil: { '1395880472': [neg(1), neg(2)] },
    toques: { '1': { n: 4, ultimo: AGORA, abertos: 0 }, '2': { n: 3, ultimo: AGORA, abertos: 0 } } });
  const abaixo = r.d.itens.filter(function (i) { return i.abaixoDoMinimo; }).map(function (i) { return i.id; });
  igual('quatro toques cumpre o piso de data/cadencias.json', abaixo, ['2']);
  igual('e o piso é repassado para a tela', r.d.minimo, Number(cadenciasJson.minimoToques));

  const desligado = rodar({ reps: REPS, cadencias: { cadencias: { x: {} }, minimoToques: 0 },
    funil: { '1395880472': [neg(1)] } });
  igual('piso zerado não acusa ninguém',
    desligado.d.itens.filter(function (i) { return i.abaixoDoMinimo; }).length, 0,
    'é como ele revoga a política editando o JSON, sem deploy');
}());

/* ══ 12. A ABA É DO GESTOR, E ELA SE REPINTA ═══════════════════════════════════════ */
(function () {
  checar('o botão da aba existe na navegação',
    html.indexOf('id="tabBtnRaioX"') > 0 && html.indexOf('data-view="viewRaioX"') > 0);
  checar('e a view existe com a raiz que o código pinta',
    html.indexOf('id="viewRaioX"') > 0 && html.indexOf('id="rx1Raiz"') > 0);
  checar('a aba é escondida para o executivo',
    /btnRaioX\.style\.display = souGestorSessao \? 'flex' : 'none';/.test(html),
    'o executivo tem a fila dele na Hoje; ler o fundo do TIME é papel de quem cobra');
  checar('o clique chama rx1Iniciar',
    /activateTab\('viewRaioX'\);[\s\S]{0,700}rx1Iniciar\(\)/.test(html));
  /* RECORTA O HANDLER, e não uma janela de caracteres: o handler do Raio X é seguido
     imediatamente pelo do Rotas, que USA desenharViewSeNecessario — uma regex de janela
     larga reprovava o código certo por causa do vizinho. */
  const iH = html.indexOf("document.getElementById('tabBtnRaioX').addEventListener");
  const handler = iH > 0 ? html.slice(iH, html.indexOf('\n});', iH)) : '';
  checar('o handler do Raio X existe', iH > 0);
  /* E SEM OS COMENTÁRIOS. O comentário deste handler EXPLICA por que ele não usa
     desenharViewSeNecessario — e cita o nome. A primeira versão desta checagem leu a
     própria explicação e reprovou o código certo. É a quinta vez que esta base comete
     esse erro; por isso a remoção do bloco de comentário vem antes de qualquer busca. */
  const soCodigo = (txt) => String(txt)
    .replace(new RegExp(String.fromCharCode(47, 92, 42) + '[\\s\\S]*?'
      + String.fromCharCode(92, 42, 47), 'g'), ' ')
    .split(String.fromCharCode(10))
    .filter(l => l.trim().indexOf(String.fromCharCode(47, 47)) !== 0)
    .join(String.fromCharCode(10));
  checar('e NÃO passa por desenharViewSeNecessario',
    handler.length > 0 && soCodigo(handler).indexOf('desenharViewSeNecessario') < 0,
    'cachear o desenho deixaria o gestor olhando o fundo de funil de três cargas atrás');
  checar('o cache de toques é zerado a cada abertura',
    /if \(typeof TM10_TQ !== 'undefined'\) TM10_TQ = null;/.test(html),
    'sem zerar, uma carga nova do snapshot nunca apareceria aqui');
  /* AS DUAS METADES DA FRASE. A primeira versão desta checagem exigia só "O funil não
     veio nesta" — sabotar a segunda metade (a que diz o que FAZER) passava verde. Aviso
     que constata sem instruir deixa o gestor olhando uma tela vazia do mesmo jeito. */
  /* E A BUSCA É DENTRO DE rx1Iniciar: "Recarregue a página" aparece QUATRO vezes no
     template (sessão expirada, plano da semana, Casa dos Dados). Procurar no arquivo
     inteiro deixava a segunda metade da frase ser apagada sem ninguém notar. */
  const iniciar = recortarFn('rx1Iniciar');
  checar('sem funil, a aba diz isso em vez de desenhar vazio',
    /O funil não veio nesta/.test(iniciar) && /Recarregue a página/.test(iniciar),
    'tela vazia sem motivo lê como "não há nada a fazer", e constatar sem instruir '
      + 'deixa o gestor parado do mesmo jeito');
  /* DENTRO DE rx1Dados, e não no arquivo inteiro: `tm10Tq(x.l.id)` aparece CINCO vezes
     no template, quatro delas na aba Time (tm10Travados, tm10Cobertura). A primeira
     versão desta checagem procurava no html todo e passava verde com o Raio X usando
     uma contagem própria — âncora que existe em vários lugares é âncora cega, e esta é
     a quarta vez que ela me pega nesta sessão. */
  checar('o toque vem da MESMA fonte da aba Time',
    /tm10Tq\(x\.l\.id\)/.test(recortarFn('rx1Dados')),
    'duas contagens de toque no produto seriam duas verdades sobre o mesmo lead');
  checar('a ficha é a do Cockpit, não o HubSpot direto',
    /buscarLeadFunilPorId/.test(html.slice(html.indexOf('function rx1Ligar(')))
      && /abrirFichaLeadFunilDrawer/.test(html.slice(html.indexOf('function rx1Ligar('))),
    'o link para o CRM existe DENTRO da ficha');
  checar('o ouvinte é UM, delegado na raiz',
    /raiz\.addEventListener\('click'/.test(html.slice(html.indexOf('function rx1Ligar('))),
    '29 linhas e 12 ações com ouvinte por elemento morrem a cada repintura');
  checar('e o filtro repinta a aba inteira',
    /RX1_FILTRO = filtro\.getAttribute\('data-rx1-filtro'\);[\s\S]{0,400}rx1Iniciar\(\)/.test(html),
    'os contadores dos próprios filtros são derivados; repintar meia tela deixaria o '
      + 'botão marcado sem o resto concordar');
}());

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('raio x: ' + ok + ' checagens ok — só etapa aberta, gargalo que zerou não aparece, '
  + 'Ag. Pagamento primeiro na fila e nenhum número cravado na tela.');
