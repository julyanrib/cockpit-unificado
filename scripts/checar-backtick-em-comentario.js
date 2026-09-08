// scripts/checar-backtick-em-comentario.js
//
// GUARDA 26 — BACKTICK DENTRO DE COMENTÁRIO QUE VIVE EM TEMPLATE LITERAL (08/09/26).
//
// O DEFEITO, três vezes na mesma noite e já registrado na memória do projeto: citar
// código entre backticks num comentário que mora dentro de um template literal FECHA a
// string. O que vem depois deixa de ser texto e passa a ser código.
//
// E o pior: NADA reprova.
//   - o JS continua sintaticamente válido — `algo.gx` seguido de backtick vira template
//     tag, e o identificador solto depois vira uma referência qualquer;
//   - o build passa, os 25 guards passam, as 28 suites passam;
//   - o erro aparece em RUNTIME, como "ReferenceError: cta is not defined" ou
//     "X.gx is not a function", e derruba a tela inteira que aquele render desenhava.
// Em 08/09 isso apagou a aba Time num caso e a tela Hoje no outro. Nos dois, a tela
// ficou VAZIA sem uma linha de erro visível para quem usa.
//
// A REGRA QUE ESTA GUARDA COBRA: comentário HTML dentro de um bloco <script> só pode
// existir dentro de uma string — e nesta base, na prática, dentro de um template literal
// que monta markup. Backtick ali nunca é legítimo.
//
// E o inverso também é dito de propósito: comentário HTML no MARKUP (fora de <script>)
// pode ter backtick à vontade, e tem — o comentário da aba Semana cita `#pm8Raiz`. Por
// isso a guarda não vale para o arquivo inteiro: valeria, reprovaria um caso legítimo, e
// a resposta seria desligá-la.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');
const CR = String.fromCharCode(96);

/* Os blocos <script> com o seu deslocamento no arquivo, para a linha do erro ser a linha
   de verdade e não a linha dentro do bloco. */
const blocos = [];
const reScript = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m;
while ((m = reScript.exec(html)) !== null) {
  if (/type="application\/json"/.test(m[1]) || /src=/.test(m[1])) continue;
  blocos.push({ ini: m.index + m[0].indexOf('>') + 1, corpo: m[2] });
}

const achados = [];
blocos.forEach(function (b) {
  const re = /<!--[\s\S]*?-->/g;
  let c;
  while ((c = re.exec(b.corpo)) !== null) {
    if (c[0].indexOf(CR) < 0) continue;
    const posNoArquivo = b.ini + c.index;
    const linha = html.slice(0, posNoArquivo).split('\n').length;
    /* mostra o trecho com o backtick, para o conserto ser óbvio */
    const i = c[0].indexOf(CR);
    achados.push({
      linha: linha,
      trecho: c[0].slice(Math.max(0, i - 45), i + 45).replace(/\s+/g, ' ').trim()
    });
  }
});

if (achados.length) {
  console.error('GUARDA 26 REPROVADA — backtick em comentário dentro de <script>:');
  achados.forEach(function (a) {
    console.error('  - L' + a.linha + ': …' + a.trecho + '…');
  });
  console.error('');
  console.error('  Um backtick aí fecha o template literal e o resto do markup vira código.');
  console.error('  Nada mais reprova: o JS segue válido, o build passa, as suites passam, e o');
  console.error('  erro aparece em runtime como "X is not defined" — com a tela vazia.');
  console.error('  Conserto: escreva o nome sem backtick (a classe .gate-cta, o seletor .gx).');
  process.exit(1);
}

console.log('OK backtick em comentário - nenhum comentário dentro de <script> cita código entre backticks.');
