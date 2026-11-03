#!/usr/bin/env node
/* BLACK FRIDAY NA CALCULADORA (Julyan, 03/11/26: "SEMESTRAL 50% DE DESCONTO").
   Roda o motor (PC9-MOTOR) e a promoção (PC9-PROMO) do template, com uma tabela de preços
   INVENTADA (o repositório é público: a tabela de verdade não entra aqui). Confere:
   - a promoção entra até 30/11 (BRT) e some em 1º/12;
   - 50% em TUDO: plano e adicionais (decisão dele), 6 meses, 6x no cartão;
   - o editor de preços nunca grava a promoção (pc9SemPromo) e ela não duplica. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');
const trecho = (a, b) => {
  const i = tpl.indexOf('/* ' + a + ' */'), j = tpl.indexOf('/* ' + b + ' */');
  if (i < 0 || j < 0 || j < i) { console.error('marcador não achado: ' + a + ' / ' + b); process.exit(1); }
  return tpl.slice(i, j);
};
const ctx = {};
vm.createContext(ctx);
vm.runInContext(trecho('PC9-MOTOR-INICIO', 'PC9-MOTOR-FIM') + trecho('PC9-PROMO-INICIO', 'PC9-PROMO-FIM')
  + '\nthis.api = { pc9Calcular, pc9ComPromo, pc9SemPromo, pc9PromoValida, pc9DiasAtePromo, PC9_PROMO };', ctx);
const A = ctx.api;

let falhas = 0, n = 0;
function ok(nome, cond, info) {
  n++;
  if (cond) console.log('  ok  ' + nome);
  else { falhas++; console.log('  FALHA  ' + nome + (info !== undefined ? ' — ' + info : '')); }
}

const cfg = {
  planos: { completo: { label: 'Completo', tiers: [{ id: 'basico', name: 'Básico', price: 100 }, { id: 'profissional', name: 'Profissional', price: 200 }] } },
  periodicidades: [
    { id: 'mensal', label: 'Mensal', months: 1, discount: 0, creditCard: false },
    { id: 'sem15', label: 'Semestral (-15%)', months: 6, discount: 0.15, creditCard: true },
  ],
  adicionais: [{ id: 'totem', name: 'Totem', price: 40, perUnit: true, minUnits: 1, availableFor: ['basico', 'profissional'], includedIn: [] }],
  funcionalidades: [],
};

console.log('\nBlack Friday · a data');
const nov30 = A.pc9ComPromo(cfg, '2026-11-30');
const dez01 = A.pc9ComPromo(cfg, '2026-12-01');
ok('em 30/11 a promoção está na calculadora', nov30.periodicidades.some((p) => p.id === 'blackfriday50'));
ok('em 1º/12 ela some sozinha', !dez01.periodicidades.some((p) => p.promo));
ok('em 03/11 faltam 27 dias', A.pc9DiasAtePromo('2026-11-03') === 27, A.pc9DiasAtePromo('2026-11-03'));
ok('a tabela original não muda (a promoção é cópia)', cfg.periodicidades.length === 2);
ok('aplicar duas vezes não duplica', A.pc9ComPromo(nov30, '2026-11-30').periodicidades.filter((p) => p.promo).length === 1);

console.log('\nBlack Friday · o preço');
const est = { tipoPlano: 'completo', tier: 'profissional', periodicidade: 'blackfriday50', adicionaisAtivos: { totem: true }, quantidades: { totem: 2 } };
const c = A.pc9Calcular(nov30, est);
ok('o plano sai pela metade (200 → 100)', c.planMonthly === 100, c.planMonthly);
ok('o adicional também (40 → 20, ×2)', c.adicionaisTotal === 40, c.adicionaisTotal);
ok('total do mês 140, do semestre 840', c.totalMonthly === 140 && c.totalContract === 840, c.totalMonthly + ' / ' + c.totalContract);
ok('economia de 840 no semestre (cheio 280/mês)', c.economia === 840, c.economia);
ok('6x no cartão', c.periodo.months === 6 && c.periodo.creditCard === true);

console.log('\nBlack Friday · o editor');
const limpo = A.pc9SemPromo(nov30);
ok('o editor recebe a tabela sem a promoção', !limpo.periodicidades.some((p) => p.promo) && limpo.periodicidades.length === 2);
ok('e o semestral normal continua 15%', limpo.periodicidades.find((p) => p.id === 'sem15').discount === 0.15);

if (falhas) { console.log('\nblack friday: ' + falhas + ' de ' + n + ' FALHARAM'); process.exit(1); }
console.log('\nblack friday: ' + n + ' conferências ok — até 30/11, 50% no plano e nos adicionais, 6x, e o editor nunca grava a promoção.');
