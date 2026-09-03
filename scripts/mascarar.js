// scripts/mascarar.js
//
// UMA MASCARA DE COMENTARIO, NO LUGAR DE QUATRO COPIADAS.
//
// Varias guardas de check-scripts.js precisam distinguir CODIGO de COMENTARIO. Comentario
// nao e tela: a guarda 10 chegou a validar uma citacao dentro de um comentario e reportar
// verde em cima do defeito que existia para pegar. Cada guarda foi nascendo com a sua
// propria copia da mascara, e as copias eram todas ingenuas do mesmo jeito.
//
// O DEFEITO DA VERSAO INGENUA, medido em 03/09/26:
//
//   <input type="file" accept="image/*" ...>            (linha 9788 do template)
//
// Aquele `/*` dentro do atributo abre um comentario que nao existe, e a regex
// /\/\*[\s\S]*?\*\//g apaga tudo ate o proximo `*/` de verdade — 260 linhas adiante. Some
// markup real: foi assim que `<div class="view" id="viewAgenda">` (linha 10048) desapareceu
// do texto mascarado, e uma varredura minha reportou 107 ids "sem markup" que existem todos.
//
// Numero grande de achados nao e auditoria; e ruido com aparencia de rigor. E o pior: uma
// varredura que le a estrutura errada erra com confianca.
//
// A REGRA QUE CONSERTA: `/*` so abre comentario se o caractere anterior for inicio de linha,
// espaco, ou um dos separadores `; { } ( ) , /`. Nos casos reais deste arquivo:
//
//   accept="image/*"        antes vem `e`  -> nao abre   (era o bug)
//   designs/*.html          antes vem `s`  -> nao abre
//   .prosa,      /* nota */ antes vem ` `  -> abre
//   x = 1;/* nota */        antes vem `;`  -> abre
//   */\/* outro bloco       antes vem `/`  -> abre       (dois blocos colados)
//
// Nao e um lexer de JavaScript, e nao pretende ser: um lexer completo sobre HTML+JS+CSS num
// arquivo unico traria uma classe nova de erro para resolver uma que esta resolvida. E uma
// regra explicita, com os contra-exemplos escritos aqui, que e o que permite conferir se ela
// continua valendo quando aparecer um caso novo.

const ABRE_DEPOIS_DE = ' \t\n\r;{}(),/';

/* Substitui todo caractere por espaco, PRESERVANDO as quebras de linha e o comprimento: os
   indices continuam valendo no texto original, e a numeracao de linha nao anda. Sem isso a
   guarda acha o alvo numa posicao e reporta outra. */
const embranquecer = trecho => trecho.replace(/[^\n]/g, ' ');

/* Mascara os comentarios de bloco /* *\/ com a regra de abertura acima. */
function mascararBloco(texto) {
  let fora = '';
  let i = 0;
  while (i < texto.length) {
    if (texto[i] === '/' && texto[i + 1] === '*') {
      const anterior = i === 0 ? '\n' : texto[i - 1];
      if (ABRE_DEPOIS_DE.indexOf(anterior) >= 0) {
        const fim = texto.indexOf('*/', i + 2);
        /* Comentario sem fecho: mascara ate o fim do arquivo, que e o que o navegador
           tambem faria — e o build ja reprovaria por sintaxe. */
        const ate = fim < 0 ? texto.length : fim + 2;
        fora += embranquecer(texto.slice(i, ate));
        i = ate;
        continue;
      }
    }
    fora += texto[i];
    i++;
  }
  return fora;
}

/* Comentario HTML. Aqui a versao ingenua serve: `<!--` nao aparece dentro de atributo neste
   arquivo, e um `-->` solto em string nao abre nada. */
function mascararHtml(texto) {
  return texto.replace(/<!--[\s\S]*?-->/g, embranquecer);
}

/* Comentario de linha, SO quando o `//` abre a linha (depois de espaco em branco). Assim
   `https://` no meio de uma string nao vira comentario — que e o outro erro classico desta
   familia, e o motivo de este passo ser o mais restritivo dos tres. */
function mascararLinha(texto) {
  return texto.replace(/(^|\n)([ \t]*)\/\/[^\n]*/g, (m, a, b) =>
    a + b + ' '.repeat(m.length - a.length - b.length));
}

/* A ordem importa: HTML primeiro (pode conter // e /* dentro), bloco depois, linha por
   ultimo — um `//` dentro de um bloco ja foi embranquecido e nao interfere. */
function mascararComentarios(texto) {
  return mascararLinha(mascararBloco(mascararHtml(texto)));
}

module.exports = { mascararComentarios, mascararBloco, mascararHtml, mascararLinha };
