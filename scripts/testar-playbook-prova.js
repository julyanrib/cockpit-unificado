#!/usr/bin/env node
// A TRILHA DO PLAYBOOK NÃO TRAVA DEPOIS DO QUIZ (20/10/26).
//
// playbook_progresso tem UMA linha por (email, página). O quiz aprovado grava 'prova' por cima
// da linha 'leitura' da mesma página, e a trilha exige check E prova em todas as páginas. Na
// sessão seguinte o capítulo voltava "sem check", não ficava provado e trancava o próximo
// (Fabio, 20/10: quiz do capítulo 1 às 07:31, capítulo 2 trancado e sem patente).
//
// Este teste roda as funções DE VERDADE do template (carregar o progresso do banco, a trilha,
// o check de leitura) num vm, com um banco falso que guarda uma linha por página como o real.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.resolve(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
let ok = 0; const falhas = [];
const checar = (nome, cond, det) => { if (cond) ok++; else falhas.push(nome + (det ? ' — ' + det : '')); };

/** o texto de uma declaração de função do template, pelas chaves balanceadas */
function fonte(nome) {
  const marca = tpl.indexOf('function ' + nome + '(');
  if (marca < 0) throw new Error('não achei a função ' + nome);
  const ini = tpl.lastIndexOf('\n', marca) + 1;
  let i = tpl.indexOf('{', marca), prof = 0;
  for (; i < tpl.length; i++) { if (tpl[i] === '{') prof++; else if (tpl[i] === '}' && --prof === 0) break; }
  return tpl.slice(ini, i + 1);
}
function declaracao(prefixo, fimMarca) {
  const ini = tpl.indexOf(prefixo);
  if (ini < 0) throw new Error('não achei ' + prefixo);
  const fim = tpl.indexOf(fimMarca, ini);
  if (fim < 0) throw new Error('não achei o fim de ' + prefixo);
  return tpl.slice(ini, fim + fimMarca.length);
}

const codigo = [
  'let playbookProgressoCache = null; let playbookProgressoPromise = null;',
  declaracao('const PB9_PATENTES', '];'), declaracao('const PB9_CAPITULOS', 'patente: PB9_PATENTES[i] }; });'), declaracao('const PB9_SEMPRE_ABERTO', '];'),
  ['playbookProgressoLocal', 'playbookProgressoLocalSalvar', 'carregarPlaybookProgresso', 'playbookGravarProgressoSupabase',
    'playbookMarcarProgresso', 'playbookLidos', 'pb7Provadas', 'pb9Minutos', 'pb9Trilha'].map(fonte).join('\n'),
  'this.api = { carregar: carregarPlaybookProgresso, marcar: playbookMarcarProgresso, trilha: pb9Trilha, lidos: playbookLidos, provadas: pb7Provadas, zerar: function () { playbookProgressoCache = null; } };',
].join('\n');

// o banco falso: uma linha por (email, slug), como o índice único do real
const linhas = new Map();
const supa = {
  from: () => ({
    select: () => ({ eq: async () => ({ data: [...linhas.values()], error: null }) }),
    upsert: async (r) => { linhas.set(r.user_email + '|' + r.guia_slug, r); return { error: null }; },
  }),
};
const ctx = {
  supa, sessaoAtual: { email: 'fabio@x', role: 'rep' }, console, Date, Map, Set, JSON, Math, String, Number, Array, Promise,
  localStorage: { getItem: () => '[]', setItem: () => {} }, isoDate: (d) => d.toISOString().slice(0, 10),
};
vm.createContext(ctx);
vm.runInContext(codigo, ctx);
const api = ctx.api;

const pb = { paginas: [
  { id: 'a1', categoria: 'Comece aqui', busca: 'x' }, { id: 'a2', categoria: 'Comece aqui', busca: 'x' },
  { id: 'b1', categoria: 'Venda na rua', busca: 'x' }, { id: 'b2', categoria: 'Venda na rua', busca: 'x' },
] };

(async () => {
  // sessão 1: lê as duas páginas do capítulo 1 e passa no quiz
  await api.carregar();
  await api.marcar('a1', 'leitura', true);
  await api.marcar('a2', 'leitura', true);
  await api.marcar('a1', 'prova', true);
  await api.marcar('a2', 'prova', true);
  let t = api.trilha(pb);
  checar('na mesma sessão, o capítulo 1 fica provado e libera o 2', t.capitulos[0].provado && t.capitulos[1].liberado);

  // sessão 2: abre de novo (o banco tem só a linha 'prova' de a1 e a2)
  api.zerar();
  await api.carregar();
  t = api.trilha(pb);
  checar('depois de reabrir, o capítulo 1 continua provado', t.capitulos[0].provado, 'checks ' + t.capitulos[0].checks + '/' + t.capitulos[0].total);
  checar('e o capítulo 2 continua liberado (a trilha não trava)', t.capitulos[1].liberado);
  checar('a patente sai do capítulo provado', t.nivel === 1);

  // ler de novo uma página já provada não rebaixa a prova no banco
  await api.marcar('a1', 'leitura', true);
  checar('o check em página provada não apaga a prova', linhas.get('fabio@x|a1').tipo === 'prova', 'ficou ' + linhas.get('fabio@x|a1').tipo);

  // a régua do gestor: só conta capítulo com prova
  checar('o gestor conta capítulo feito só com prova (lê o tipo)',
    /select\('user_email,guia_slug,tipo,concluido_em'\)\.in\('user_email', listaEmails\)/.test(tpl)
    && tpl.indexOf("if (x.tipo === 'prova') feitosPb[x.guia_slug]") > -1);

  if (falhas.length) {
    console.error('\nFALHAS (' + falhas.length + '):');
    falhas.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('playbook prova: ' + ok + ' checagens ok — o quiz aprovado não some na próxima sessão e a trilha segue.');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
