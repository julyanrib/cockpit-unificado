// scripts/checar-ordem-declaracao.js
//
// GUARDA 20 — VARIÁVEL USADA ANTES DE EXISTIR, DENTRO DAS FUNÇÕES GRANDES DE RENDER.
// ---------------------------------------------------------------------------------------
// O CASO QUE A PRODUZIU (04/09/26): usei `semRecic` na linha do filtro da munição e
// declarei 200 linhas abaixo, na barra de fontes. `const` em TDZ estoura —
// «Cannot access 'semRecic' before initialization» — e o Planejamento morria INTEIRO,
// enquanto build, 19 guardas e 22 suítes ficavam verdes.
//
// POR QUE eles não veem:
//   · `node --check` só valida SINTAXE, e o arquivo estava sintaticamente perfeito.
//   · as guardas leem texto e não avaliam nada.
//   · as suítes executam as funções PURAS (pl6Regioes, pl6Carteira…). O defeito mora nas
//     funções de RENDER, que montam string a partir de dezenas de locais e não são
//     extraíveis sem arrastar meia tela.
//
// O QUE ELA NÃO COBRE, dito claramente para não virar promessa: variável que nunca foi
// DECLARADA (`ReferenceError`, como o `porPonto` que eu deixei solto em pl6Reciclagem) —
// essa é ReferenceError, não TDZ, e quem pega é scripts/testar-pl6-contas.js, que EXECUTA
// as funções puras. As duas juntas cobrem a família: a suíte pega o não-declarado nas
// puras, esta guarda pega a ordem nas de render.
//
// O QUE ESTA GUARDA FAZ: para cada função vigiada, lista as declarações `const`/`let` de
// primeiro nível e confere que a primeira APARIÇÃO de cada nome não vem antes da linha que
// a declara. É uma checagem de ordem textual — não substitui um interpretador, mas as três
// que me morderam eram exatamente ordem textual.
//
// FALSOS POSITIVOS que ela evita de propósito: nomes dentro de string ou comentário (as
// duas coisas somem antes), e as próprias declarações (só conta uso ANTES da linha dela).

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const tpl = fs.readFileSync(T, 'utf8');

// AS FUNÇÕES VIGIADAS: as que montam tela a partir de muitos locais, que é onde a forma
// aparece. Não é a lista de todas as funções do arquivo — é a lista das que já quebraram
// assim ou têm o mesmo tamanho e a mesma natureza.
const VIGIADAS = [
  'renderPlanejamento6a',
  /* minhaDaily7aHTML saiu em 24/09/26 com a Minha Daily do executivo. O lugar dela nesta
     lista e pl6DadosFinal: e a funcao que monta o dia do executivo a partir de muitos
     locais — o mesmo tamanho e a mesma natureza, e agora a unica que faz esse trabalho. */
  'pl6DadosFinal',
  /* dailyGestor14aHTML saiu em 11/09/26 com a Daily 14a morta. O lugar dela na lista e
     dg4Dados: e a funcao que monta a Daily do gestor a partir de muitos locais, que e onde
     este defeito aparece. */
  'dg4Dados',
  'fn2ShellHTML',
  'pl6Reciclagem',
  'pl6Carteira',
  'pl6Novos'
];

let falhas = 0;
function falhar(msg) { falhas++; console.log('  FALHA  ' + msg); }

// Tira comentários e literais de string/template, para um nome citado numa frase não
// contar como uso. Preserva o comprimento (troca por espaço) para as posições continuarem
// batendo com as linhas do original.
function mascarar(txt) {
  let fora = txt
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:/])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/./g, ' '));
  // strings e templates: mesmo tratamento
  fora = fora.replace(/'(?:\\.|[^'\\\n])*'/g, m => m.replace(/./g, ' '))
    .replace(/"(?:\\.|[^"\\\n])*"/g, m => m.replace(/./g, ' '))
    .replace(/`(?:\\.|[^`\\])*`/g, m => m.replace(/[^\n]/g, ' '));
  return fora;
}

VIGIADAS.forEach(function (fn) {
  const re = new RegExp('\\n(?:async )?function ' + fn + '\\(');
  const m = re.exec(tpl);
  if (!m) { falhar('não achei a função ' + fn + ' — a lista desta guarda envelheceu'); return; }
  const ini = m.index + 1;
  // o fecho da função: a primeira linha que é exatamente "}" na coluna zero
  const fim = tpl.indexOf('\n}\n', ini);
  if (fim < 0) { falhar(fn + ': não achei o fecho'); return; }
  const corpo = mascarar(tpl.slice(ini, fim));

  // as declarações de PRIMEIRO NÍVEL (dois espaços de recuo): as internas a blocos têm
  // escopo próprio e comparar posição nelas daria falso positivo.
  const decls = [];
  const reDecl = /\n  (?:const|let) ([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;
  let d;
  while ((d = reDecl.exec(corpo))) decls.push({ nome: d[1], pos: d.index });

  decls.forEach(function (dec) {
    // USO = a palavra isolada, MENOS acesso a propriedade e chave de objeto.
    // `prom.naMesa` não é a variável `naMesa`: é um campo de outro objeto que por acaso tem
    // o mesmo nome. Sem esta exclusão a guarda acusou `naMesa` em minhaDaily7aHTML, onde
    // `prom.naMesa` aparece 96 linhas antes da declaração do local — falso positivo, e da
    // mesma família do detector que já casou com "latitude" dentro de um comentário.
    const reUso = new RegExp('(^|[^.\\w$])' + dec.nome.replace(/\$/g, '\\$') + '\\b(?!\\s*:)', 'g');
    let u, primeiro = -1;
    while ((u = reUso.exec(corpo))) {
      const at = u.index + u[1].length;
      // pula a própria declaração
      if (at >= dec.pos && at <= dec.pos + dec.nome.length + 6) continue;
      primeiro = at;
      break;
    }
    if (primeiro >= 0 && primeiro < dec.pos) {
      const linhaUso = corpo.slice(0, primeiro).split('\n').length;
      const linhaDecl = corpo.slice(0, dec.pos).split('\n').length;
      falhar(fn + ': `' + dec.nome + '` é usada na linha ' + linhaUso
        + ' e declarada na ' + linhaDecl + ' (const/let em TDZ estoura em tempo de execução)');
    }
  });
});

if (falhas) {
  console.log('');
  console.error(falhas + ' falha(s) — variável usada antes de existir derruba a aba inteira,'
    + ' e build/guardas/suítes não veem isso.');
  process.exit(1);
}
console.log('OK ordem de declaracao - nas ' + VIGIADAS.length
  + ' funcoes de render vigiadas, nada e usado antes de ser declarado.');
