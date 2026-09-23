#!/usr/bin/env node
/* ============================================================================
   O PROVÁVEL DO MÊS — E A DOBRA QUE ELE TINHA (23/09/26)

   Julyan: "leads travados, quentes, etc? tudo correto?".

   Estava quase tudo. O travado batia com a régua nas seis etapas. A lista de quentes
   estava limpa — 15, todos em etapa aberta, nenhum negócio morto. O errado era a CONTA
   que usa os dois: `prováveis = fechados + ag.pagamento + quentes × 0,6`.

   Medido na produção em 23/09: 15 quentes, e NOVE deles DENTRO de Ag. Pagamento, que
   tinha 10 negócios. Não é acaso — data/temperatura.json dá o fator máximo de etapa para
   Ag. Pagamento (rank 6 de 6), então o quente se concentra lá por construção. Cada um
   desses nove entrava inteiro por `pag.n` e mais 0,6 como quente: 1,6 negócio.

   Prováveis mostrava 31 quando eram 26. O GAP mostrava 17 quando eram 22 — cinco clientes
   de folga que não existiam, no número que abre a daily do gestor.

   ESTA SUÍTE RODA A FUNÇÃO DE VERDADE, em vm, com a forma que a produção tinha naquele
   dia. Contagem de gente que vai ser cobrada não se verifica por grep.

   Uso: node scripts/testar-provavel-do-mes.js
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

function recortar(fonte, nome) {
  const assinatura = 'function ' + nome + '(';
  const i = fonte.indexOf(assinatura);
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe no template.'); process.exit(1); }
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

/* O PESO SAI DO TEMPLATE, não de um número que eu repito aqui: se alguém mudar 0,6 a
   suíte acompanha em vez de reprovar o valor novo. */
const mPeso = tpl.match(/const TM10_PESO_QUENTE = ([0-9.]+);/);
if (!mPeso) { console.error('FALHA: não achei TM10_PESO_QUENTE.'); process.exit(1); }
const PESO = Number(mPeso[1]);

const AG_PAGAMENTO = '1395880473';

/* ══ O CENÁRIO — a forma da produção em 23/09 ═══════════════════════════════════════
   10 negócios em Ag. Pagamento, 9 deles também na lista de quentes, mais 6 quentes em
   Negociação. É exatamente o caso que produzia a dobra. */
function leadsPag() {
  const l = [];
  for (let i = 1; i <= 10; i++) l.push({ id: 'pag' + i, mrr: 300 });
  return l;
}
const quentesDaProducao = []
  .concat(leadsPag().slice(0, 9).map(function (l) { return { id: l.id, mrr: 300 }; }))
  .concat([1, 2, 3, 4, 5, 6].map(function (i) { return { id: 'neg' + i, mrr: 200 }; }));

function montarCtx(quentes, pagLeads) {
  const ctx = {
    Math: Math, Number: Number, Array: Array, Object: Object, String: String, Set: Set,
    TM10_PESO_QUENTE: PESO,
    DATA: {
      temperatura: { quentes: quentes },
      vendasMes: { totalClientes: 12, totalMrr: 4086, totalReceita: 19365, mesLabel: 'setembro/2026' },
      kpisHub: { metaMrrTime: 18000, metaReceitaTime: 54000 }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(recortar(tpl, 'tm10MrrDo'), ctx);
  vm.runInContext(recortar(tpl, 'tm10Provavel'), ctx);
  const etapas = [{ id: AG_PAGAMENTO, n: pagLeads.length,
    mrr: pagLeads.reduce(function (s, l) { return s + l.mrr; }, 0), leads: pagLeads }];
  const m = { time: { meta: 48, fech: 12, acima: 63 } };
  return vm.runInContext('tm10Provavel', ctx)(m, etapas);
}

const prov = montarCtx(quentesDaProducao, leadsPag());

/* ══ 1. A DOBRA ACABOU ═══════════════════════════════════════════════════════════════
   A conta certa: 12 fechados + 10 em ag. pagamento + 6 quentes de fora × 0,6. */
const esperadoClientes = Math.round(12 + 10 + 6 * PESO);
igual('o provável não conta o mesmo negócio duas vezes', prov.clientes, esperadoClientes,
  'os 9 quentes que já estão em Ag. Pagamento entravam inteiros pela etapa e mais '
    + PESO + ' como quentes');

igual('e o gap acompanha', prov.gap, 48 - esperadoClientes,
  'o gap é o número que abre a daily: inflar o provável some com a cobrança');

checar('a dobra dava um provável MAIOR que o certo',
  Math.round(12 + 10 + 15 * PESO) > esperadoClientes,
  'se os dois jeitos dessem o mesmo número, este teste não estaria medindo nada');

/* ══ 2. O MRR TAMBÉM ════════════════════════════════════════════════════════════════ */
igual('o MRR provável também para de dobrar', prov.mrr, 4086 + 3000 + (6 * 200) * PESO,
  'mesmo negócio, mesmo dinheiro contado duas vezes');

/* ══ 3. A LISTA NÃO ENCOLHEU ════════════════════════════════════════════════════════
   O conserto é na SOMA. Se a lista dos quentes sumisse da tela, o gestor perderia
   justamente o que ele olha para decidir o que proteger hoje. */
igual('a lista de quentes continua inteira', prov.quentesN, 15,
  'quentesN é o que a tela LISTA; quentesNovosN é o que entra na conta');
igual('e o que entra na conta é só o que ainda não estava contado', prov.quentesNovosN, 6);
igual('o MRR da lista inteira continua disponível', prov.quentesMrr, 9 * 300 + 6 * 200);

/* ══ 4. OS CASOS DE BORDA ═══════════════════════════════════════════════════════════ */
(function () {
  const p = montarCtx([], leadsPag());
  igual('sem quente nenhum, o provável é fechados + ag. pagamento', p.clientes, 22);
  igual('e nenhum quente entra na conta', p.quentesNovosN, 0);
}());

(function () {
  /* TODOS os quentes dentro do Ag. Pagamento: o quente não pode somar nada. */
  const p = montarCtx(leadsPag().map(function (l) { return { id: l.id, mrr: 300 }; }), leadsPag());
  igual('quente 100% dentro do ag. pagamento não soma nada', p.clientes, 22,
    'este era o pior caso da dobra: 10 negócios virando 16');
  igual('e o ponderado vai a zero', p.quentesPondN, 0);
}());

(function () {
  /* NENHUM quente dentro: o comportamento antigo continua valendo onde ele estava certo. */
  const fora = [1, 2, 3].map(function (i) { return { id: 'x' + i, mrr: 100 }; });
  const p = montarCtx(fora, leadsPag());
  igual('quente fora do ag. pagamento continua somando', p.clientes, Math.round(22 + 3 * PESO));
}());

(function () {
  /* Ag. Pagamento vazio — a etapa pode não existir na carga. */
  const p = montarCtx([{ id: 'a', mrr: 100 }], []);
  igual('sem etapa de ag. pagamento a conta não quebra', p.clientes, Math.round(12 + 1 * PESO));
}());

/* ══ 5. AS FRASES DA TELA APONTAM PARA O NÚMERO CERTO ═══════════════════════════════
   Duas frases prometiam que o gap sai dos quentes. Apontando para a lista inteira, elas
   prometiam fechamento vindo de negócio que JÁ estava contado como provável. */
checar('a manchete usa o quente que ainda pode fechar o gap',
  /Eles saem dos ' \+ prov\.quentesNovosN/.test(tpl),
  'com quentesN a frase promete gap vindo de quem já está em Ag. Pagamento');

checar('o bloco dos quentes diz quantos ainda estão fora do ag. pagamento',
  /quentesNovosN \+ ' de ' \+ d\.prov\.quentesN \+ ' ainda fora do ag\. pagamento/.test(tpl),
  'era "15 clientes prováveis · se ninguém vacilar, o gap fecha aqui"');

checar('a legenda da barra diz quantos entraram na conta',
  /quentes × 60% · '[\s\S]{0,120}quentesNovosN \+ ' de ' \+ pv\.quentesN/.test(tpl),
  'um segmento de 3,6 com a legenda "15 na mesa" é o número sem procedência');

console.log('');
console.log('provável do mês: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
