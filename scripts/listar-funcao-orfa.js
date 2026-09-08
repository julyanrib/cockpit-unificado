// scripts/listar-funcao-orfa.js
//
// RELATÓRIO — FUNÇÃO DECLARADA E NUNCA CHAMADA (07/09/26).
//
// NÃO É GUARDA, e é de propósito: registrá-la no build bloquearia com 37 dívidas de uma
// limpeza que eu comecei e revi. Rode à mão: node scripts/listar-funcao-orfa.js
//
// A guarda 3 cobre o inverso: toda chamada tem declaração. Esta cobre a outra ponta, e
// foi a varredura de 07/09 que mostrou por que ela precisa existir: 37 funções declaradas
// e nunca referenciadas, 57 KB de corpo. E não era lixo inofensivo — três achados saíram
// dali:
//
//   1. O painel numerado do gestor (1 · A FORMA, 2 · A IDADE, 3 · O DINHEIRO PARADO...)
//      foi desmontado pela metade: a função do bloco 1 já não existia, o COMENTÁRIO dela
//      ficou órfão em cima de outra função, e os blocos 2 a 7 ficaram no arquivo sem
//      chamador. Ninguém percebeu porque nada quebra.
//
//   2. `.gate-cta` — "os sete portões" da tela Hoje — tinha ouvinte VIVO e markup dentro
//      de uma função morta. Medido no DOM com dado real: zero nós. O clique estava morto
//      e a guarda de fiação passava verde, porque ela confere o TEXTO do arquivo e o texto
//      existia (dentro da função que nunca era chamada).
//
//   3. Três suites testavam funções que o app nunca chama. Estavam verdes medindo ficção.
//
// COMO ELA MEDE, e por que erra para o lado seguro:
//   - só conta como declaração o `function nome(` em POSIÇÃO DE INSTRUÇÃO. Depois de `(`,
//     `=`, `,`, `:`, `return` é função nomeada em expressão ou IIFE — que é usada no
//     mesmo lugar em que é declarada. Foi assim que `prepararLogin1b` apareceu como órfã
//     na primeira versão do meu scanner, e não era.
//   - procura o nome no código SEM COMENTÁRIO (senão a prosa que explica a função conta
//     como uso), e também no markup cru e entre aspas — porque nesta base o botão é ligado
//     por `data-*` e às vezes o nome viaja como string.
//
// A DÍVIDA É NOMEADA. Nove funções ficaram de propósito, cada uma com o motivo, e a
// checagem de dívida morta reprova o build quando o motivo deixa de valer.

const fs = require('fs');
const path = require('path');
const { cortarJs, blocosDeCodigo } = require('./cortar-comentarios.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');

/* Órfãs que FICAM, com o motivo. Lista vazia é o estado desejado. */
const DIVIDA = {
  /* as suites dependem destas — tirar cobertura de regra que o Julyan pediu é decisão
     dele, não minha, mesmo quando a regra está ancorada em código que não roda */
  rotuloDeRegistroDaVisita: 'testar-nucleo.js a chama direto, como motor puro',
  pl4RiscoDoBalde: 'testar-busca-lugar.js usa a declaração dela como delimitador do bloco v5',
  pl5Realce: 'testar-busca-lugar.js a executa como função pura',
  gxBlocoDinheiroHTML: 'testar-gestor-analitico.js afirma sobre o texto dela (o leitor único de MRR)',
  gxMetaDoTime: 'testar-gestor-analitico.js afirma sobre o texto dela (a meta é a soma das individuais)',
  focoDeHabilidadeHTML: 'testar-desenvolvimento.js exige que exista ("o que já existia e não pode sumir")',
  buildIndicadoresExecutivoHTML: 'testar-desenvolvimento.js exige que exista',
  /* estas duas o meu cortador consciente de chaves não conseguiu terminar com segurança:
     cortar no lugar errado levaria metade do arquivo */
  gxBlocoPerdaHTML: 'o corte automático não consegue terminar o corpo com segurança',
  prometidoVsRealizadoCorpoHTML: 'o corte automático não consegue terminar o corpo com segurança'
};

const codigo = blocosDeCodigo(html).map(cortarJs).join('\n');
const orfas = [];
const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
let m;
const vistas = {};
while ((m = re.exec(codigo)) !== null) {
  const nome = m[1];
  if (vistas[nome]) continue;
  vistas[nome] = true;
  /* posição de instrução? */
  const antes = codigo.slice(Math.max(0, m.index - 24), m.index).replace(/\s+$/, '');
  if (/[(=,:?]$|\breturn$|\bawait$|\byield$/.test(antes)) continue;
  const b = '\\b' + nome + '\\b';
  if ((codigo.split(new RegExp(b)).length - 1) > 1) continue;
  if ((html.split(new RegExp(b)).length - 1) > 1) continue;
  if ((html.match(new RegExp("['\"`]" + nome + "['\"`]", 'g')) || []).length) continue;
  orfas.push(nome);
}

const problemas = [];
const dividaVista = [];
orfas.forEach(function (nome) {
  if (nome in DIVIDA) { dividaVista.push(nome); return; }
  const linha = html.slice(0, html.indexOf('function ' + nome)).split('\n').length;
  problemas.push('`' + nome + '` (L' + linha + ') é declarada e NUNCA referenciada — nem no '
    + 'código, nem no markup, nem como string. Ou perdeu o chamador (e a tela perdeu o que '
    + 'ela desenhava), ou é resto de refatoração. Nenhum dos dois casos aparece como erro.');
});

Object.keys(DIVIDA).forEach(function (nome) {
  if (dividaVista.indexOf(nome) > -1) return;
  problemas.push('DIVIDA lista `' + nome + '`, mas ela já não é órfã — ou ganhou chamador, '
    + 'ou saiu do arquivo. Apague dessa lista: dívida que fica para sempre deixa de ser vista.');
});

if (problemas.length) {
  console.log('FUNÇÕES DECLARADAS E NUNCA CHAMADAS (' + problemas.length + '):');
  problemas.forEach(function (p) { console.log('  - ' + p); });
  console.error('');
  console.error('  Se for perda de chamador, o conserto é religar. Se for resto, é apagar.');
  console.error('  Se tiver que ficar, acrescente em DIVIDA com o motivo, nesta guarda.');
  process.exit(0);
}

console.log('OK função órfã - nenhuma função nova sem chamador'
  + (dividaVista.length ? ' (' + dividaVista.length + ' de dívida nomeada, cada uma com o motivo)' : '') + '.');
