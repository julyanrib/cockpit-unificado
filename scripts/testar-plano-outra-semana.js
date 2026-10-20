#!/usr/bin/env node
// GRAVAR EM OUTRA SEMANA NÃO COPIA A SEMANA DA TELA (20/10/26).
//
// pl6Gravar usava pl6GradeDoPlano() (a semana ABERTA na tela) como grade padrão. Gravar na semana
// seguinte, com a atual aberta, levava a semana inteira junto, com as visitas já feitas: em 16/10
// o Bruno ganhou 24 visitas "feitas" em dias que ainda não tinham chegado. Regiões e "fechado"
// também iam junto.
//
// O teste roda o pl6Gravar DE VERDADE num vm, com o banco falso e a semana 12/10 aberta na tela.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');
let ok = 0; const falhas = [];
const checar = (nome, cond, det) => { if (cond) ok++; else falhas.push(nome + (det ? ' — ' + det : '')); };
function fonte(nome) {
  const marca = tpl.indexOf('function ' + nome + '(');
  if (marca < 0) throw new Error('não achei a função ' + nome);
  const ini = tpl.lastIndexOf('\n', marca) + 1;
  let i = tpl.indexOf('{', marca), prof = 0;
  for (; i < tpl.length; i++) { if (tpl[i] === '{') prof++; else if (tpl[i] === '}' && --prof === 0) break; }
  return tpl.slice(ini, i + 1);
}

const semanaDaTela = [[{ p: 'funil', id: 'c-1', fora: true, feito: true, origem: 'app' }], [], [], [], []];
const gravados = [];
let noBanco = null; // a semana seguinte ainda não existe
const supa = {
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: noBanco ? [{ grade: noBanco }] : [], error: null }) }) }) }),
    upsert: (linha) => { gravados.push(linha); return { select: async () => ({ data: [Object.assign({ id: 'x' }, linha)], error: null }) }; },
  }),
};
const ctx = {
  supa, DATA: { supabase: true }, sessaoAtual: { email: 'gestor@x' }, console, JSON, Date, Array, Object, String, Set,
  pl6Plano: null,
  pl6SegundaEmFoco: () => '2026-10-12',
  pl6GradeDoPlano: () => JSON.parse(JSON.stringify(ctx.pl6Plano.grade)),
  pl6GradeVazia: () => [[], [], [], [], []],
  pl6RegioesDoPlano: () => ctx.pl6Plano.regioes.slice(),
  pl6SlotId: (v) => (v && v.id) || null,
};
vm.createContext(ctx);
vm.runInContext(fonte('pl6MesclarGrade') + '\n' + fonte('pl6Gravar') + '\nthis.gravar = pl6Gravar;', ctx);

const tela = (segunda) => { ctx.pl6Plano = { data_segunda: segunda, grade: semanaDaTela, regioes: ['Tijuca'], fechado_em: '2026-10-12T12:00:00Z', fechado_por: 'gestor@x' }; };
(async () => {
  tela('2026-10-12');
  // 1. grava na semana seguinte sem mandar grade (o caso do Bruno, 16/10)
  await ctx.gravar({ ownerId: '86100506' }, {}, '2026-10-19');
  let l = gravados[gravados.length - 1];
  const itens = (l.grade || []).flat().filter(Boolean);
  checar('a semana seguinte não recebe os itens da semana da tela', itens.length === 0, JSON.stringify(l.grade));
  checar('nem as regiões da tela', !('regioes' in l), JSON.stringify(l.regioes));
  checar('nem o "fechado" da tela', !('fechado_em' in l) && !('fechado_por' in l));

  // 2. com grade mandada, ela vai (o uso normal de pôr um item na semana seguinte)
  tela('2026-10-12');
  await ctx.gravar({ ownerId: '86100506' }, { grade: [[{ p: 'funil', id: 'c-9' }], [], [], [], []] }, '2026-10-19');
  l = gravados[gravados.length - 1];
  checar('a grade mandada para a outra semana é a que grava', (l.grade[0] || []).some((x) => x && x.id === 'c-9'));

  // 3. na mesma semana nada muda: grade, regiões e fechado da tela vão juntos
  tela('2026-10-19');
  noBanco = null;
  await ctx.gravar({ ownerId: '86100506' }, {}, '2026-10-19');
  l = gravados[gravados.length - 1];
  checar('na mesma semana a grade da tela grava', (l.grade[0] || []).some((x) => x && x.id === 'c-1'));
  checar('e as regiões e o fechado também', Array.isArray(l.regioes) && l.fechado_em === '2026-10-12T12:00:00Z');

  if (falhas.length) {
    console.error('\nFALHAS (' + falhas.length + '):');
    falhas.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('plano em outra semana: ' + ok + ' checagens ok — gravar a semana seguinte não copia a semana aberta na tela.');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
