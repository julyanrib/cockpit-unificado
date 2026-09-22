#!/usr/bin/env node
/* ============================================================================
   O VARIÁVEL NA TELA (22/09/26)

   Julyan: "ISSO TEM Q ESTAR NITIDO NO COCKPIT DE CADA UM, QUANTO ELES VAO RECEBER, QUANTO
   FALTA PRA ATINGIR O OBJETIVO... pagamos por numero de clientes e alguns ativam o gatilho
   ao atingir certo numero".

   ESTA SUÍTE CALCULA DE VERDADE, em vm, com a tabela real de data/comissionamento.json.
   Aqui um número errado não é um número feio na tela: é uma pessoa esperando um pagamento
   que não vai vir, ou deixando de sair de casa porque a tela disse que não valia a pena.
   Checagem de texto não serve para isso.

   O MODELO É RETROATIVO, confirmado por ele: ao entrar numa faixa, o valor novo vale para
   TODOS os clientes do mês. É o que faz a 8ª venda valer R$ 1.100 em vez de R$ 400. Se
   alguém trocar para marginal sem querer, os saltos somem e a tela deixa de motivar
   exatamente onde ela deveria — por isso os saltos estão cravados aqui, um a um.

   Uso: node scripts/testar-comissionamento.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const md = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');
const TABELA = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'comissionamento.json'), 'utf8'));

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

/* ══ O AMBIENTE — a tabela REAL, não uma fixture ═════════════════════════════════════
   Uma fixture inventada provaria que a função soma; o que precisa ser verdade é que a
   tabela QUE ELE MANDOU produz os valores que a tela promete. */
const ctx = {
  Math: Math, Number: Number, Object: Object, String: String, Array: Array, Infinity: Infinity,
  DATA: { comissionamento: TABELA, vendasMes: { porRep: [
    { ownerId: '86100505', count: 6 },
    { ownerId: '89842507', count: 2 },
    { ownerId: '97353029', count: 0 }
  ] } }
};
vm.createContext(ctx);
['comissaoConfig', 'comissaoRs', 'comissaoFaixaDe', 'comissaoTotalDe', 'comissaoDe',
  'comissaoClientesDoRep'].forEach(function (f) {
  vm.runInContext(recortar(tpl, f), ctx);
});

/* ══ 1. A TABELA QUE ELE MANDOU ══════════════════════════════════════════════════════ */
igual('a tabela tem as cinco faixas da planilha',
  TABELA.faixas.map(function (f) { return [f.de, f.ate, f.porCliente]; }),
  [[0, 5, 250], [6, 7, 300], [8, 9, 400], [10, 14, 500], [15, null, 550]],
  'foto que ele mandou em 22/09: 0-5 = 250 · 6-7 = 300 · 8-9 = 400 · 10-14 = 500 · 15+ = 550');

igual('e o modelo está declarado como retroativo', TABELA.modelo, 'retroativo',
  'no marginal os gatilhos somem, e a tela passa a prometer motivação que não existe');

/* ══ 2. O TOTAL, CLIENTE A CLIENTE ═══════════════════════════════════════════════════
   Os 16 primeiros, calculados um a um. É a tabela de pagamento inteira. */
(function () {
  const esperado = {
    0: 0, 1: 250, 2: 500, 3: 750, 4: 1000, 5: 1250,
    6: 1800, 7: 2100,
    8: 3200, 9: 3600,
    10: 5000, 11: 5500, 12: 6000, 13: 6500, 14: 7000,
    15: 8250, 16: 8800, 20: 11000
  };
  const veio = {};
  Object.keys(esperado).forEach(function (k) { veio[k] = ctx.comissaoTotalDe(Number(k)); });
  igual('o total é retroativo em toda a escala', veio, esperado,
    'clientes × o valor da faixa em que ele ESTÁ — não a soma das faixas percorridas');
}());

/* ══ 3. OS GATILHOS — a razão de a tabela ser retroativa ═════════════════════════════
   O salto da venda que muda a faixa. Se algum destes mudar, alguém vai sair de casa com
   uma expectativa que a tela criou e o pagamento não cumpre. */
(function () {
  const salto = function (n) { return ctx.comissaoTotalDe(n) - ctx.comissaoTotalDe(n - 1); };
  igual('a 6ª venda vale +R$ 550', salto(6), 550);
  igual('a 8ª venda vale +R$ 1.100', salto(8), 1100);
  igual('a 10ª venda vale +R$ 1.400', salto(10), 1400);
  igual('a 15ª venda vale +R$ 1.250', salto(15), 1250);
  /* e a venda que NÃO muda de faixa vale só o valor dela */
  igual('a 7ª vale só o valor da faixa', salto(7), 300);
  igual('a 9ª também', salto(9), 400);
  igual('e a 11ª também', salto(11), 500);
}());

/* ══ 4. O QUADRO QUE A TELA DESENHA ══════════════════════════════════════════════════ */
(function () {
  /* O MARCO REAL: 6 clientes hoje. É o caso que o Julyan vai conferir primeiro. */
  const m = ctx.comissaoDe(6);
  igual('com 6 clientes, recebe R$ 1.800', m.total, 1800);
  igual('e o por-cliente dele é 300', m.porCliente, 300);
  igual('a próxima venda acrescenta 300', m.proximaVenda.extra, 300);
  igual('o próximo degrau é em 8', m.degrau.clientes, 8);
  igual('faltam 2', m.degrau.faltam, 2);
  igual('e ele vale +R$ 1.400', m.degrau.extra, 1400,
    'é este o número que faz alguém sair de casa: duas vendas que valem quatro');
  igual('chegando lá, recebe R$ 3.200', m.degrau.total, 3200);

  /* QUEM NUNCA VENDEU: o degrau não pode ser "faltam 0" nem somem os números. */
  const z = ctx.comissaoDe(0);
  igual('quem está em zero recebe zero', z.total, 0);
  igual('e a primeira venda vale 250', z.proximaVenda.extra, 250);
  igual('o degrau dele é a 6ª venda', [z.degrau.clientes, z.degrau.faltam], [6, 6],
    'a faixa 0-5 já é a dele: o próximo DEGRAU é onde o valor muda, não onde a faixa começa');

  /* NO TOPO não existe degrau seguinte — e a tela tem de dizer isso em vez de apontar
     para o nada. */
  const topo = ctx.comissaoDe(18);
  igual('no topo não há próximo degrau', topo.degrau, null);
  igual('e a tela sabe que é o topo', topo.noTopo, true);
  igual('cada venda no topo vale 550', topo.proximaVenda.extra, 550);
}());

/* ══ 5. OS CASOS QUE QUEBRAM CONTA DE DINHEIRO ══════════════════════════════════════ */
igual('sem clientes não estoura', seguro(function () { return ctx.comissaoTotalDe(null); }), 0);
igual('texto no lugar do número não vira NaN',
  seguro(function () { return ctx.comissaoTotalDe('abc'); }), 0,
  'NaN na tela de pagamento é pior que zero: zero é uma informação, NaN é um defeito visível');
igual('negativo não paga', seguro(function () { return ctx.comissaoTotalDe(-3); }), 0);
igual('fração arredonda para baixo', ctx.comissaoTotalDe(6.9), 1800,
  'meia venda não existe; contar 7 pagaria por uma venda que não aconteceu');

/* ══ 6. SEM A TABELA, NADA APARECE ══════════════════════════════════════════════════
   A regra mais importante da suíte: inventar quanto alguém vai receber é o pior número
   errado que este produto pode mostrar. */
(function () {
  const guardado = ctx.DATA.comissionamento;
  ctx.DATA.comissionamento = null;
  igual('sem a tabela, a config é nula', ctx.comissaoConfig(), null);
  igual('e o quadro inteiro é nulo', ctx.comissaoDe(6), null,
    'nulo faz a tela não desenhar a caixa; um fallback faria ela mentir');
  ctx.DATA.comissionamento = guardado;
}());

checar('e a tela não desenha a caixa sem o quadro',
  /const cm = \(typeof comissaoDe === 'function'\)/.test(tpl)
    && /if \(!cm\) return '';/.test(tpl),
  'sem esta saída, a caixa apareceria com undefined onde vai o valor');

checar('a tabela do gestor também não aparece sem config',
  /if \(typeof comissaoDe !== 'function' \|\| !comissaoConfig\(\)\) return '';/.test(tpl));

/* ══ 7. O FORMATO DO DINHEIRO ═══════════════════════════════════════════════════════ */
/* SEGURO: trocar a formatação por tm10Rs (que não existe neste vm) fazia a SUÍTE morrer
   em vez de imprimir a linha vermelha — quarta vez nesta base. */
igual('o valor sai cheio, com ponto de milhar',
  seguro(function () { return ctx.comissaoRs(3200); }), 'R$ 3.200');
igual('e o de cinco dígitos também',
  seguro(function () { return ctx.comissaoRs(11000); }), 'R$ 11.000');
igual('valor pequeno não ganha ponto',
  seguro(function () { return ctx.comissaoRs(250); }), 'R$ 250');
checar('e NÃO usa a abreviação de funil',
  !/comissaoRs[\s\S]{0,200}tm10Rs/.test(tpl),
  'tm10Rs escreve "R$ 3,2k" — serve para volume de funil e não serve para salário: '
    + 'ninguém confere o próprio pagamento arredondado');

/* ══ 8. A FONTE DOS CLIENTES ════════════════════════════════════════════════════════
   vendasMes, não reps[].fechadosNoMes. Os dois divergem nesta base, e só vendasMes sabe
   do ajuste de competência — se uma venda sai do mês, tem de sair da comissão junto. */
igual('os clientes saem da lista de vendas', ctx.comissaoClientesDoRep('86100505'), 6);
igual('quem não vendeu conta zero', ctx.comissaoClientesDoRep('97353029'), 0);
igual('e quem não está na lista também', ctx.comissaoClientesDoRep('00000000'), 0);

checar('a fonte é vendasMes e não fechadosNoMes',
  /function comissaoClientesDoRep[\s\S]{0,400}vendasMes/.test(tpl)
    && !/function comissaoClientesDoRep[\s\S]{0,400}fechadosNoMes/.test(tpl),
  'fechadosNoMes daria um número maior e faria a tela prometer dinheiro de uma venda que '
    + 'o placar já tirou do mês por competência');

/* ══ 9. O CANO ══════════════════════════════════════════════════════════════════════ */
checar('a tabela chega ao front por montar-dados',
  /comissionamento: comissionamento \|\| null,/.test(md)
    && /requireOpcional\(\(\) => require\('\.\.\/data\/comissionamento\.json'\)\)/.test(md),
  'ESTE OBJETO É UM FILTRO: campo fora da lista morre em silêncio, foi assim que metaMrr '
    + 'sumiu em 10/09');

checar('e o arquivo não guarda salário fixo',
  !/fixo|salario|salário/i.test(JSON.stringify(TABELA.faixas)),
  'decisão dele em 22/09: a tela mostra só a variável, e nenhum dado de remuneração fixa '
    + 'entra neste repositório');

/* ══ 10. AS DUAS TELAS LEEM O MESMO ═════════════════════════════════════════════════
   Se o gestor e o executivo mostrassem contagens diferentes, a primeira conversa sobre
   pagamento quebraria a confiança na tela inteira. */
checar('gestor e executivo usam a mesma função',
  (tpl.match(/comissaoDe\(comissaoClientesDoRep\(/g) || []).length === 2,
  'duas contas para o mesmo pagamento é como as duas telas divergem');

console.log('');
console.log('variável: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(f => console.log('  ✗ ' + f));
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
