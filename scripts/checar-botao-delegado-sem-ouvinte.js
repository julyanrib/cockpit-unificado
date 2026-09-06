// scripts/checar-botao-delegado-sem-ouvinte.js
//
// TODO BOTÃO DELEGADO TEM QUEM O ESCUTE (06/09/26)
// -----------------------------------------------------------------------------
// Esta guarda nasceu de um defeito meu, no mesmo dia em que ela foi escrita.
//
// A Daily & Ritmo v2 do gestor substituiu o board antigo: onde havia
// `[data-g14-raiz]` passou a haver `[data-dg2-raiz]`. Eu pendurei a chamada do
// `dg2Ligar` DENTRO do `if (raiz14)` — o bloco que resolve o nó do board antigo.
// O nó não existia mais, o `if` nunca entrava, e a tela nasceu com 28 botões
// desenhados e nenhum ligado.
//
// O QUE ISSO PASSOU INCÓLUME: build, as 21 guardas e as 26 suítes. E passou
// porque nada ali está errado no sentido que elas medem — o HTML é válido, a
// função de ligar existe e é sintaticamente perfeita, o listener é registrado.
// Só que num nó ausente. Auditar listener dá verde; quem denuncia é clicar.
//
// A REGRA QUE ELA MEDE: para cada família de delegação `data-XX-acao` que a tela
// EMITE, tem de existir alguém que a ESCUTE. Ela não mede se o clique faz a
// coisa certa — nenhuma leitura estática mede isso, e é por isso que a passada
// de navegador continua sendo o portão de verdade.
//
// TRÊS PADRÕES DE FIAÇÃO CONVIVEM NESTE ARQUIVO, e a guarda conhece os três
// porque na primeira execução ela acusou o `fn2` de ter dois botões mortos —
// e eu fui olhar antes de "consertar": os botões estão ligados, só por outro
// padrão. Guarda que só conhece o padrão da tela mais nova reprova as antigas.
//
//   1. delegação   closest('[data-XX-acao]')                 — as 5 telas do gestor
//   2. por nó      querySelectorAll('[data-XX-acao]') + addEventListener  — fn2, fn3
//   3. leitura     querySelector('[data-XX-acao]') e getAttribute         — NÃO é fiação
//
// O terceiro não conta de propósito: ler o atributo de um botão não liga nada,
// e aceitá-lo como prova faria a guarda dar verde justamente no caso em que o
// botão é lido por outra função e nunca escutado.
const fs = require('fs');
const path = require('path');

const arquivo = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const cru = fs.readFileSync(arquivo, 'utf8');

/* Descobre as famílias pelo que a tela emite, em vez de listar prefixos à mão:
   guarda com lista cravada envelhece na sexta tela e ninguém percebe. */
const emitidas = new Set();
const reEmite = /data-([a-z]{2,3}\d)-acao="/g;
let m;
while ((m = reEmite.exec(cru)) !== null) emitidas.add(m[1]);

if (!emitidas.size) {
  console.error('FIAÇÃO: não achei nenhuma família data-XX-acao — a guarda perdeu a âncora.');
  process.exit(1);
}

const problemas = [];
const comoLigam = [];
[...emitidas].sort().forEach(function (pre) {
  const alvo = '[data-' + pre + '-acao]';
  const delegado = cru.indexOf("closest('" + alvo + "')") > -1;

  /* padrão 2: o querySelectorAll do próprio seletor tem de vir com um
     addEventListener por perto — o forEach fica na mesma linha ou logo abaixo. */
  let porNo = false;
  const reTodos = new RegExp("querySelectorAll\\('" + alvo.replace(/[[\]]/g, '\\$&') + "'\\)", 'g');
  let t;
  while ((t = reTodos.exec(cru)) !== null) {
    const janela = cru.slice(t.index, t.index + 300);
    if (janela.indexOf('addEventListener') > -1) { porNo = true; break; }
  }

  if (delegado || porNo) {
    comoLigam.push(pre + (delegado ? ' (delegado)' : ' (por nó)'));
    return;
  }
  const botoes = (cru.match(new RegExp('data-' + pre + '-acao="', 'g')) || []).length;
  problemas.push('data-' + pre + '-acao: ' + botoes
    + ' ocorrência(s) desenhada(s), e nenhum ouvinte — nem closest, nem addEventListener por nó');
});

if (problemas.length) {
  console.error('BOTÃO DELEGADO SEM QUEM O ESCUTE:');
  problemas.forEach(function (p) { console.error('  ✗ ' + p); });
  console.error('  A tela desenha, o botão parece clicável, e nada acontece — build e suítes passam.');
  process.exit(1);
}

console.log('OK fiação delegada - as ' + emitidas.size
  + ' famílias data-XX-acao têm ouvinte: ' + comoLigam.join(', ') + '.');
