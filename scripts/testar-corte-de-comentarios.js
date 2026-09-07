// scripts/testar-corte-de-comentarios.js
//
// SUITE DO CORTE DE COMENTÁRIOS (07/09/26).
//
// Duas metades, e a segunda é a que importa:
//   1. VERDE — o corte no arquivo real passa nas quatro provas e o ganho é o esperado.
//   2. VERMELHO — sabotagens conhecidas TÊM que reprovar. Já escrevi guard que passava
//      sem medir nada, e o verde dele era idêntico ao verde legítimo (memória do
//      projeto: "guarda nova se testa vermelha"). Aqui as sabotagens são exatamente os
//      dois defeitos que as versões anteriores do scanner produziram de verdade.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { cortar, cortarJs, verificar, blocosDeCodigo } = require('./cortar-comentarios.js');

const root = path.join(__dirname, '..');
let falhas = 0;
function checar(nome, ok, detalhe) {
  console.log((ok ? '  ok   ' : '  FALHA ') + nome + (ok || !detalhe ? '' : ' — ' + detalhe));
  if (!ok) falhas++;
}

console.log('CORTE DE COMENTÁRIOS');

const arq = path.join(root, 'public', 'index.html');
if (!fs.existsSync(arq)) {
  console.error('  sem public/index.html — rode node scripts/build.js primeiro');
  process.exit(1);
}
const emDisco = fs.readFileSync(arq, 'utf8');

/* Se o build já cortou, o arquivo em disco não tem comentário e não serve de amostra.
   A fonte da amostra é então o template, que é o que o build lê de qualquer forma. */
const temComentario = emDisco.indexOf('/* ══') > -1;
const amostra = temComentario ? emDisco
  : fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');
const cortado = cortar(amostra);

/* ── metade verde ───────────────────────────────────────────────────────────────── */
const problemas = verificar(amostra, cortado);
checar('as quatro provas passam no arquivo real', problemas.length === 0, problemas.slice(0, 3).join(' | '));

const antes = Buffer.byteLength(amostra, 'utf8'), depois = Buffer.byteLength(cortado, 'utf8');
checar('o corte tira pelo menos 25% dos bytes brutos', depois < antes * 0.75,
  'antes ' + (antes / 1024).toFixed(0) + ' KB, depois ' + (depois / 1024).toFixed(0) + ' KB');

const brA = zlib.brotliCompressSync(Buffer.from(amostra, 'utf8')).length;
const brB = zlib.brotliCompressSync(Buffer.from(cortado, 'utf8')).length;
checar('o corte tira pelo menos 200 KB DEPOIS do brotli (é o que a rua paga)',
  brA - brB >= 200 * 1024, 'ganho medido: ' + ((brA - brB) / 1024).toFixed(0) + ' KB');

/* Nada de comentário sobra nos blocos de código — e sobrar não é cosmético, é sinal de
   que o scanner saiu de um template no meio e parou de reconhecer comentário. */
let sobrou = 0;
blocosDeCodigo(cortado).forEach(function (b) {
  if (/^[ \t]*\/\//m.test(b) || b.indexOf('/* ══') > -1) sobrou++;
});
checar('nenhum bloco de código ficou com comentário de linha ou de faixa', sobrou === 0,
  sobrou + ' bloco(s) com sobra');

/* O DATA é JSON e não pode ser tocado de forma alguma. */
const reJson = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/;
const jsonAntes = reJson.exec(amostra), jsonDepois = reJson.exec(cortado);
checar('o bloco <script type="application/json"> sai idêntico',
  !!jsonAntes && !!jsonDepois && jsonAntes[1] === jsonDepois[1]);

/* Texto de tela dentro de template literal continua intacto — inclusive URL com "//",
   que foi o primeiro jeito de quebrar isso. */
const urls = amostra.match(/https:\/\/[a-z0-9./_-]{10,}/gi) || [];
const urlsPerdidas = urls.filter(function (u) { return cortado.indexOf(u) < 0; });
checar('as ' + urls.length + ' URLs do arquivo continuam lá (o "//" delas não é comentário)',
  urlsPerdidas.length === 0, urlsPerdidas.slice(0, 2).join(', '));

/* ── metade vermelha: as sabotagens precisam reprovar ───────────────────────────── */
console.log('  -- sabotagens (têm que REPROVAR) --');
const um = blocosDeCodigo(amostra).slice().sort(function (a, b) { return b.length - a.length; })[0];
const envolver = function (js) { return '<html><script>' + js + '</script></html>'; };

/* sabotagem 1: caractere comido dentro de uma string de tela. Compila, e quebra a tela. */
const alvo = (um.match(/'[A-Za-zÀ-ú ]{12,30}'/) || [])[0];
if (!alvo) {
  checar('achei uma string de tela para sabotar', false, 'nenhuma string longa no maior bloco');
} else {
  const sabotado = cortarJs(um).replace(alvo, alvo.slice(0, 5) + alvo.slice(6));
  checar('string de tela com um caractere comido REPROVA',
    verificar(envolver(um), envolver(sabotado)).length > 0);
}

/* sabotagem 2: nome de função comido. Também compila (a chamada é que morre em runtime). */
const fn = (um.match(/\bfunction\s+[A-Za-z_$][\w$]{6,}/) || [])[0];
if (!fn) {
  checar('achei uma função declarada para sabotar', false);
} else {
  const sabotado = cortarJs(um).replace(fn, fn.slice(0, -1));
  checar('nome de função com um caractere comido REPROVA',
    verificar(envolver(um), envolver(sabotado)).length > 0);
}

/* sabotagem 3: o defeito de verdade das duas versões anteriores — sair do template no
   meio e cortar como comentário um "//" que era conteúdo de tela. */
const comUrl = 'function f(x){ return `<a href="https://takeat.app/planos">plano</a> ${x}`; }';
checar('URL dentro de template literal NÃO é cortada como comentário',
  cortar(envolver(comUrl)).indexOf('https://takeat.app/planos') > -1);

/* sabotagem 4: a armadilha do "}" — objeto/arrow dentro de ${ }. Era aqui que o
   scanner antigo saía do template e passava a ler texto de tela como código. */
const comChave = 'const t = `linha ${[1,2].map(function(x){ return x; }).join("")} fim // nao e comentario`;';
checar('"}" de bloco dentro de ${ } não faz o scanner sair do template',
  cortar(envolver(comChave)).indexOf('// nao e comentario') > -1);

/* sabotagem 5: bloco de comentário removido não pode juntar duas instruções na mesma
   linha (ASI). O corte deixa uma quebra quando o comentário ocupava linha. */
const saiuAsi = cortarJs('let a = 1\n/* comentario\n   de duas linhas */\nlet b = 2\n');
checar('comentário de linha inteira deixa a quebra (não muda o ASI)',
  saiuAsi.indexOf('let a = 1\n') > -1 && saiuAsi.indexOf('let b = 2') > -1,
  JSON.stringify(saiuAsi));

console.log(falhas === 0 ? 'CORTE DE COMENTÁRIOS: tudo ok' : 'CORTE DE COMENTÁRIOS: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
