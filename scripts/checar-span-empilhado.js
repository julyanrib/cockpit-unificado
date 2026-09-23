#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════════════════
   GUARDA 29 — <span> QUE EMPILHA SEM DECLARAR display (22/09/26)

   Julyan viu no print da aba Hoje: "Cadências resolvidas6 contas acima da régua da etapa
   sem decisãoresolver cadências". Três <span> escritos para empilhar, com margin-top entre
   eles, dentro de um pai que é ITEM de flex mas não é CONTAINER de flex. <span> é inline:
   a margem vertical não aplica e a linha de baixo encosta na de cima.

   Varrendo o navegador nos dois papéis, eram TRÊS lugares e não um: a daily do executivo,
   as 8 capas do Playbook (onde "01", "Comece aqui" e "4 páginas · 25 min" saíam na mesma
   linha) e o check de página do Playbook.

   POR QUE UMA GUARDA E NÃO SÓ O CONSERTO: no arquivo as três regras PARECEM certas. O que
   está errado mora em outro bloco — o display do pai — e nenhum grep liga as duas pontas.
   Build, 33 guardas e 61 suítes passaram por cima disto por semanas.

   A REGRA: <span> com margem vertical declara display. Quando o pai é flex a declaração
   não muda nada (item de flex já é blockificado), então satisfazer a guarda é sempre
   seguro — e quando o pai NÃO é flex, é exatamente o conserto.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const tpl = fs.readFileSync(
  path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

/* OS QUE JÁ EXISTIAM. Não são perdão: são dívida com nome. Nenhum destes foi medido na
   tela — entraram na lista porque já estavam no arquivo quando a guarda nasceu, e a
   varredura do navegador não alcançou o estado em que cada um aparece. Quem tocar num
   desses blocos mede o display do pai e tira o nome daqui. */
const DIVIDA = [
  'prospeccao-impact-track', 'ck', 'checkbox', 'chart-subtitle',
  'agw-regn', 'pb9-liga', 'gx-fonte', 'xv3-check-anel'
];

/* 1. as classes que o markup coloca num <span> */
const classesDeSpan = new Set();
/* `<span(?=[\s>])` e não `<span`: sem isso a varredura casa <spanX> e <spanner>, e foi o
   que a sabotagem da âncora mostrou — trocar a tag inteira deixava a guarda verde. */
const reSpan = /<span(?=[\s>])[^>]*\bclass=(?:"|\\")([^"\\]+)/g;
let m;
while ((m = reSpan.exec(tpl))) {
  m[1].split(/\s+/).forEach(function (c) { if (c && !/[${]/.test(c)) classesDeSpan.add(c); });
}

/* 2. as regras de uma classe só, com margem vertical não nula e sem display */
function temMargemVertical(corpo) {
  if (/margin-top\s*:\s*0(px)?\s*[;}]/.test(corpo) && !/margin-bottom|margin\s*:/.test(corpo)) return false;
  if (/margin\s*:\s*0\s*[;}]/.test(corpo) && !/margin-top|margin-bottom/.test(corpo)) return false;
  return /margin-top\s*:|margin-bottom\s*:|margin\s*:/.test(corpo);
}

const faltando = [];
const reRegra = /\n\s*\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
while ((m = reRegra.exec(tpl))) {
  const cls = m[1];
  const corpo = m[2];
  if (!classesDeSpan.has(cls)) continue;
  if (DIVIDA.indexOf(cls) > -1) continue;
  if (!temMargemVertical(corpo)) continue;
  if (/display\s*:/.test(corpo)) continue;
  faltando.push('.' + cls + ' { ' + corpo.trim().replace(/\s+/g, ' ').slice(0, 90) + ' }');
}

/* A ÂNCORA: se a varredura parar de achar <span> com classe, ela passa a medir o vazio e
   fica verde para sempre. */
if (classesDeSpan.size < 100) {
  console.error('X span empilhado — a varredura achou só ' + classesDeSpan.size
    + ' classes de <span>; a âncora quebrou e a guarda passaria medindo nada.');
  process.exit(1);
}

const naDivida = DIVIDA.filter(function (c) { return classesDeSpan.has(c); }).length;

if (faltando.length) {
  console.error('X span empilhado — ' + faltando.length
    + ' <span> com margem vertical e sem display (a margem não aplica e o texto cola):');
  faltando.forEach(function (l) { console.error('    ' + l); });
  console.error('  conserto: declare display:block na regra. Se o pai for flex a'
    + ' declaração não muda nada; se não for, é o conserto.');
  process.exit(1);
}

console.log('OK span empilhado — nenhum <span> com margem vertical sem display ('
  + classesDeSpan.size + ' classes varridas, ' + naDivida + ' na lista de dívida).');
