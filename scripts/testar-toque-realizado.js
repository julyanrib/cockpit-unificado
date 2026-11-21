#!/usr/bin/env node
/* ============================================================================
   TOQUE É ATIVIDADE REALIZADA (19/09/26)

   Julyan, olhando a tela Time: "voce consegue ver que só deram 1 toque no lead". Estava
   olhando um número que contava compromisso MARCADO como toque DADO.

   O DEFEITO era do lado do gestor: `tm10ToquesPorNegocio` (a Time antiga) somava tarefa
   NOT_STARTED como toque. O lado do executivo (`toquesDoLead`) nunca contou assim —
   "Tarefas EM ABERTO não são toques realizados; são o próximo passo".

   20/11/26: a Time antiga (tm10*) saiu com as telas do ?gv2=0, e com ela as seções desta
   suíte que rodavam o tm10 em vm. Fica a regra que sobrevive, no lado que continua no ar:
   o núcleo do executivo declara que tarefa em aberto não é toque e conta só o realizado.
   Ela é a origem da régua; se mudar aqui, o número do lead muda em toda tela que o lê.

   Uso: node scripts/testar-toque-realizado.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, condicao, porque) {
  if (condicao) { ok++; return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
}

/* ── O CONTRATO DO LADO DO EXECUTIVO ─────────────────────────────────────────────── */
(function () {
  const i = html.indexOf('// (c) Tarefas EM ABERTO');
  checar('o núcleo do executivo continua declarando que tarefa em aberto não é toque',
    i > 0 && html.indexOf('_realizado: false', i) > i && html.indexOf('_realizado: false', i) - i < 1600,
    'se este lado mudar, o mesmo lead passa a ler dois números — foi o defeito que esta suíte veio fechar');
  checar('e a contagem dele continua filtrando por _realizado',
    html.indexOf('const realizados = lista.filter(t => t._realizado);') > 0);
  checar('e a Time antiga, que contava compromisso como toque, não voltou',
    html.indexOf('function tm10ToquesPorNegocio(') < 0 && html.indexOf('function tm10Tq(') < 0);
}());

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('toque realizado: ' + ok + ' checagens ok — no núcleo do executivo, compromisso marcado não conta como toque dado.');
