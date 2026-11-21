#!/usr/bin/env node
/* ============================================================================
   PLANEJAMENTO FINAL · O "COMO FOI?" E A EVIDÊNCIA DO APP (23/09/26)

   Cobre as checagens 5 a 8 pedidas no prompt da prancha final:

     5. compromisso com a hora passada e sem registro desenha "como foi?"; o que ainda vai
        acontecer NÃO desenha. Cada propósito tem as suas opções, escritas uma por uma;
     6. "remarcar" move o compromisso e leva a tarefa junto, sem criar uma segunda, e o
        propósito é preservado;
     7. o slot com `r` é lido, e o slot em string continua sendo lido;
     8. "sem check-in" e "na fila do app" são estados distintos, e nunca aparecem juntos.

   O RELÓGIO É O DA CASA. pl6HoraJaPassou sai de agendaParaBRT/agendaChave/agendaHhmm — as
   mesmas funções que a agenda e a Daily usam. Esta suíte roda a função DE VERDADE com o
   relógio congelado, porque a pergunta "já passou?" é a única coisa que decide se a tela
   cobra ou não cobra, e um fuso errado aqui cobraria o dia inteiro às 6 da manhã.

   Uso: node scripts/testar-como-foi.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const codigo = tpl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; console.log('  ok  ' + nome); return; }
  falhas.push(nome);
  console.log('  FALHA  ' + nome + (porque ? '  — ' + porque : ''));
}
function igual(nome, veio, esperado, porque) {
  checar(nome, JSON.stringify(veio) === JSON.stringify(esperado),
    (porque ? porque + ' · ' : '') + 'esperava ' + JSON.stringify(esperado)
      + ', veio ' + JSON.stringify(veio));
}
function recortar(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe no template.'); process.exit(1); }
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return tpl.slice(i, j + 1);
}
function ctxBase(extra) {
  const c = Object.assign({ String: String, Number: Number, Array: Array, Object: Object,
    Date: Date, Math: Math, isNaN: isNaN, isFinite: isFinite, Set: Set,
    console: { error: function () {} } }, extra || {});
  vm.createContext(c);
  [/const PL6_BLOQUEADO = '[^']+';/, /const PL6_RUA = '[^']+';/, /const PL6_REL = '[^']+';/]
    .forEach(function (re) {
      const m = tpl.match(re);
      if (!m) { console.error('FALHA: não achei ' + re); process.exit(1); }
      vm.runInContext(m[0], c);
    });
  return c;
}

/* 20/11/26: as seções 5a, 5b (a pergunta e as opções do "como foi?") e 8 (os estados da evidência do
   app no slot) mediam pl6HoraJaPassou, pl6ResultadosDe e pl6EvidenciaDoSlot, que só a Daily antiga do
   gestor chamava; saíram com ela. Fica a 7: o slot gravado (com registro ou em string) continua sendo
   lido por pl6ItensDoDia, que é quem monta o dia no Planejamento v3. */
console.log('');
console.log('7 · O SLOT COM REGISTRO É LIDO, E O SLOT EM STRING TAMBÉM');

(function () {
  const c = ctxBase();
  ['pl6ResultadoDoSlot', 'pl6SlotProposito', 'pl6SlotId', 'pl6SlotRua', 'pl6SlotRel',
    'pl6SlotBloqueado', 'pl6SlotHora', 'pl6PorHora', 'pl6ItensDoDia']
    .forEach(function (f) { vm.runInContext(recortar(f), c); });
  const ler = vm.runInContext('pl6ResultadoDoSlot', c);
  const itens = vm.runInContext('pl6ItensDoDia', c);

  igual('o registro gravado é lido',
    ler({ id: '7', hora: '09:00', p: 'cobrar', r: { tipo: 'pagou', em: 'x', por: '1' } }),
    { tipo: 'pagou', motivo: null, em: 'x', por: '1' });
  igual('com motivo, ele vem junto',
    ler({ id: '7', r: { tipo: 'nao_rolou', motivo: 'fechado' } }).motivo, 'fechado');
  igual('slot em string não tem registro, e isso não é erro', ler('7'), null,
    'null aqui quer dizer "ninguém registrou ainda", que é o estado de toda semana '
      + 'gravada antes de hoje');
  igual('registro sem tipo não conta', ler({ id: '7', r: {} }), null,
    'objeto vazio no `r` faria a tela dizer que houve registro e não ter o que mostrar');

  const col = [
    { id: '7', hora: '09:00', p: 'cobrar', r: { tipo: 'pagou' } },
    '8',
    { id: '__rua', hora: '08:00', p: 'rua', duracao: '3h', regiao: 'Tijuca' }
  ];
  const lidos = itens(col, new Map([['7', { nome: 'A' }], ['8', { nome: 'B' }]]));
  igual('o item do dia carrega o registro',
    (lidos.filter(function (x) { return x.id === '7'; })[0] || {}).r.tipo, 'pagou');
  igual('e o slot em string continua sendo lido',
    (lidos.filter(function (x) { return x.id === '8'; })[0] || {}).tipo, 'visita',
    'é o formato da maior parte do que está no banco');
  igual('o bloco de rua carrega a janela que reservou',
    (lidos.filter(function (x) { return x.tipo === 'rua'; })[0] || {}).duracao, '3h',
    'sem ela, a evidência de rua contaria os check-ins do dia inteiro');
}());

checar('nenhum leitor de slot enumera campos',
  (function () {
    const ls = codigo.match(/\(typeof v === 'object'\)[^;\n]{0,80}/g) || [];
    return ls.length >= 4 && ls.every(function (l) {
      return !/Object\.keys|JSON\.stringify/.test(l);
    });
  }()),
  'leitor que enumera campos do slot transforma um campo novo em tela branca na outra aba');

console.log('');
console.log('como foi: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
