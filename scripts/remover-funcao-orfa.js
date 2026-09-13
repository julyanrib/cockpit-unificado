// scripts/remover-funcao-orfa.js
//
// REMOVE UMA FUNÇÃO ÓRFÃ INTEIRA — corpo e a nota que a explica.
// ---------------------------------------------------------------------------------------
// Por que isto é um script e não sed: em 11/09 um laço meu fechou a cascata de código
// morto sozinho e removeu 769 funções, gutando o template. A cascata é real (tirar órfã
// orfana mais), mas quem decide cada rodada tem de ser gente olhando a lista — este
// arquivo remove EXATAMENTE os nomes que recebe, um por vez, e recusa qualquer coisa que
// não consiga recortar com certeza.
//
// AS TRÊS RECUSAS:
//   · nome que não é declarado exatamente uma vez na coluna 0;
//   · função sem uma linha `}` sozinha na coluna 0 fechando o corpo;
//   · pedaço recortado que não fecha o mesmo tanto de chave e de comentário que abre —
//     a mesma trava do scripts/css-morto.js, pelo mesmo motivo.
//
// A NOTA VAI JUNTO: comentário bom sobre código que não existe mais é pior do que código
// morto sem comentário — é a guarda 21 dizendo isso sobre CSS, e vale igual para função.
//
// Uso: node scripts/remover-funcao-orfa.js nomeA nomeB ...

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const nomes = process.argv.slice(2).filter(n => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n));
if (!nomes.length) { console.error('uso: node scripts/remover-funcao-orfa.js nomeA nomeB ...'); process.exit(1); }

let cru = fs.readFileSync(T, 'utf8');
const NL = cru.indexOf('\r\n') > -1 ? '\r\n' : '\n';
const conta = (t, p) => t.split(p).length - 1;

let removidas = 0, bytes = 0;
nomes.forEach(nome => {
  const linhas = cru.split(NL);
  const re = new RegExp('^(async )?function ' + nome + '\\s*\\(');
  const achados = [];
  linhas.forEach((l, i) => { if (re.test(l)) achados.push(i); });
  if (achados.length !== 1) {
    console.error('X ' + nome + ': ' + achados.length + ' declaração(ões) na coluna 0 — não mexo');
    process.exit(1);
  }
  let ini = achados[0];

  /* A NOTA ACIMA: sobe enquanto a linha anterior for comentário de linha, ou fizer parte
     de um bloco que fecha logo acima. Para na primeira linha em branco DEPOIS de já ter
     subido algum comentário — nota separada por linha vazia é da seção, não da função. */
  let topo = ini;
  while (topo > 0) {
    const ant = linhas[topo - 1];
    if (/^\s*\/\//.test(ant)) { topo--; continue; }
    if (/\*\/\s*$/.test(ant)) {
      let j = topo - 1;
      while (j > 0 && !/^\s*\/\*/.test(linhas[j])) j--;
      if (/^\s*\/\*/.test(linhas[j])) { topo = j; continue; }
      break;
    }
    break;
  }

  /* O FIM. Duas formas neste arquivo:
     · a função de UMA LINHA — `function gxNum(v) { return Number(v || 0); }` — que fecha
       nela mesma. A primeira versão disto não a conhecia, saía procurando um `}` na coluna
       0 lá embaixo e teria levado tudo o que houvesse no caminho; ela recusou por causa da
       trava do `^function`, que é exatamente para isso;
     · e a normal, que fecha numa linha só com `}` na coluna 0. */
  let fim = -1;
  if (conta(linhas[ini], '{') > 0 && conta(linhas[ini], '{') === conta(linhas[ini], '}')) {
    fim = ini;
  } else {
    for (let i = ini + 1; i < linhas.length; i++) {
      if (linhas[i] === '}') { fim = i; break; }
      if (/^(async )?function /.test(linhas[i])) break; /* achou outra antes do fecho: recuso */
    }
  }
  if (fim < 0) {
    console.error('X ' + nome + ': não achei a chave que fecha o corpo na coluna 0 — não mexo');
    process.exit(1);
  }

  const pedaco = linhas.slice(topo, fim + 1).join(NL) + NL;
  if (conta(pedaco, '{') !== conta(pedaco, '}') || conta(pedaco, '/*') !== conta(pedaco, '*/')) {
    console.error('X ' + nome + ': o pedaço não fecha o que abre ({=' + conta(pedaco, '{')
      + ' }=' + conta(pedaco, '}') + ' /*=' + conta(pedaco, '/*') + ') — não mexo');
    process.exit(1);
  }
  /* e a linha seguinte, se for em branco, vai junto — senão sobra buraco duplo */
  let ate = fim + 1;
  if (linhas[ate] === '') ate++;

  const novas = linhas.slice(0, topo).concat(linhas.slice(ate));
  bytes += pedaco.length;
  removidas++;
  console.log('ok ' + nome + ' — linhas ' + (topo + 1) + '-' + fim + ' (' + (fim - topo + 1) + ' linhas)');
  cru = novas.join(NL);
});

fs.writeFileSync(T, cru);
console.log('--- ' + removidas + ' função(ões) fora, ' + bytes + ' bytes brutos');
