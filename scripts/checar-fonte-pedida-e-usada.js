#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════════════════
   GUARDA 30 — FONTE PEDIDA SEM USO, E FONTE USADA SEM PEDIDO (23/09/26)

   Duas dívidas opostas, uma guarda só:

   · FAMÍLIA PEDIDA E NÃO USADA é peso em TODA carga fria. Poppins e DM Sans ficaram no
     <link> depois que a Semana do gestor deixou de usá-las; o próprio arquivo tinha
     escrito a regra em 16/09 ("sai do carregamento no mesmo commit em que suas
     declarações zeram") e ninguém voltou para cumpri-la. Neste produto isso não é
     detalhe: cada publicação esfria o cache e a próxima pessoa a entrar paga a carga
     inteira.

   · FAMÍLIA USADA E NÃO PEDIDA é pior, porque é silenciosa: o texto cai em Arial e a tela
     continua funcionando. Está medido no comentário do <head>: Poppins e DM Sans
     desenhavam exatamente a mesma largura que uma família inexistente — ou seja, ninguém
     ia notar pela geometria.

   A REGRA: o conjunto de famílias no <link> do Google Fonts é EXATAMENTE o conjunto de
   famílias que alguma declaração usa.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

/* 1. O QUE O <link> PEDE */
const linha = (tpl.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/) || [])[0] || '';
if (!linha) {
  console.error('X fonte pedida e usada — não achei o <link> do Google Fonts.');
  console.error('  A âncora é o próprio pedido de fontes; sem ela esta guarda mede o vazio.');
  process.exit(1);
}
const pedidas = (linha.match(/family=([^&:"']+)/g) || [])
  .map(function (m) { return m.replace('family=', '').replace(/\+/g, ' '); });

if (!pedidas.length) {
  console.error('X fonte pedida e usada — o <link> existe mas não pede família nenhuma.');
  process.exit(1);
}

/* 2. O QUE O ARQUIVO USA. Só declaração de verdade: `font:` e `font-family:`. Menção em
      comentário não conta — foi exatamente o que sobrou quando as duas saíram, e tratar
      comentário como uso manteria a família carregada para sempre. */
const semComentarios = tpl
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

function usada(fonte) {
  const re = new RegExp('font(-family)?\\s*:[^;"\'}]{0,160}' + fonte.replace(/ /g, '\\s*'), 'i');
  return re.test(semComentarios);
}

const pedidasSemUso = pedidas.filter(function (f) { return !usada(f); });

/* 3. E O CONTRÁRIO: família declarada que ninguém pediu. A lista sai das próprias
      declarações — famílias genéricas e pilhas de fallback do sistema ficam de fora. */
/* GENÉRICAS E PILHAS DO SISTEMA não passam pelo Google Fonts — o navegador já as tem.
   `ui-monospace` e companhia entraram nesta lista depois que a primeira versão da guarda
   as acusou: nomear o que é falso positivo é melhor do que afrouxar a regra. */
const GENERICAS = ['sans-serif', 'serif', 'monospace', 'system-ui', 'inherit', 'initial',
  'unset', 'Inter', 'Arial', 'Helvetica', 'ui-sans-serif', 'ui-monospace', 'ui-serif',
  'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Apple Color Emoji', 'Noto Color Emoji',
  'Courier New', 'Menlo', 'Monaco', 'Consolas', 'var'];
const declaradas = new Set();
(semComentarios.match(/font(?:-family)?\s*:[^;"'}]{0,200}/gi) || []).forEach(function (d) {
  d.replace(/^font(-family)?\s*:/i, '').split(',').forEach(function (parte) {
    const nome = parte.trim().replace(/^['"]|['"]$/g, '')
      .replace(/^[0-9.]+\s*/, '').replace(/^(normal|bold|italic|\d+)\s+/i, '')
      /* a cauda de um `var(--x, algo)` e o fim de uma string escapada chegavam aqui como
         "monospace)" e "\" — nome de família não tem parêntese nem barra invertida */
      .replace(/[)\\]+$/, '').trim();
    if (!nome || nome.indexOf('(') > -1 || nome.indexOf('\\') > -1) return;
    if (nome.indexOf('-apple-system') > -1) return;
    if (/^[0-9]/.test(nome)) return;
    if (GENERICAS.indexOf(nome) > -1) return;
    declaradas.add(nome);
  });
});
const usadasSemPedido = [...declaradas].filter(function (f) {
  return !pedidas.some(function (p) { return p.toLowerCase() === f.toLowerCase(); });
});

let erro = false;
if (pedidasSemUso.length) {
  erro = true;
  console.error('X fonte pedida e usada — ' + pedidasSemUso.length
    + ' família(s) no <link> que NENHUMA declaração usa: ' + pedidasSemUso.join(', '));
  console.error('  peso em toda carga fria; tire do <link> ou use.');
}
if (usadasSemPedido.length) {
  erro = true;
  console.error('X fonte pedida e usada — ' + usadasSemPedido.length
    + ' família(s) declarada(s) que o <link> NÃO pede: ' + usadasSemPedido.join(', '));
  console.error('  o texto cai em Arial e ninguém nota: medido, a largura é a mesma.');
}
if (erro) process.exit(1);

console.log('OK fonte pedida e usada — as ' + pedidas.length + ' famílias do <link> ('
  + pedidas.join(', ') + ') são exatamente as que a tela declara.');
