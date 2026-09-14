/* ============================================================================
   CSS QUE O NAVEGADOR DESCARTA EM SILÊNCIO (14/09/26)

   Julyan: "não podemos mais ter nenhum erro igual teve hoje".

   O ERRO DE HOJE: eu escrevi `scroll-snap-type: x proximate`. A palavra não existe —
   é `proximity`. O navegador descarta a declaração inteira no parse e não avisa
   ninguém: nem erro no console, nem warning, nem nada visível. O snap simplesmente
   não acontecia, e eu só achei porque fui ler o estilo COMPUTADO em vez de olhar.

   E ELE TINHA UM IRMÃO MAIS VELHO, que estava na produção: `font: 700 12px inherit`,
   em quatro botões. `inherit` não vale como família dentro do atalho `font`. Medido
   no navegador, criando o botão com e sem a linha:

     com  `font:700 12px inherit`   ->  13.33px, peso 400, Arial
     sem  nada                      ->  13.33px, peso 400, Arial
     com  as três separadas         ->  12px,    peso 700, Manrope

   A linha não fazia absolutamente nada.

   ══ O QUE ESTA GUARDA MEDE, E O QUE ELA NÃO MEDE ═════════════════════════════════
   Ela NÃO é um validador de CSS — isso exigiria um navegador, e o build roda em Node.
   Ela cobre os dois casos em que um ERRO DE DIGITAÇÃO vira silêncio:

     1. o atalho `font:` terminando numa palavra-chave global (inherit/initial/unset/
        revert). É sempre morto, e é o defeito que estava na rua.
     2. propriedades de CONJUNTO FECHADO — aquelas cujo valor só pode ser uma palavra
        de uma lista curta e conhecida. Conjunto fechado não envelhece como uma lista
        de propriedades envelheceria, e é onde o typo mora.

   O QUE ELA DEIXA PASSAR, dito de propósito: valor com cálculo, cor, medida, função,
   e qualquer propriedade fora da lista. Uma guarda que tentasse validar tudo seria uma
   guarda que reprova CSS correto — e aí alguém a desliga, que é pior que não tê-la.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const alvo = process.argv[2] || path.join(raiz, 'template', 'cockpit.template.html');
const arquivoInteiro = fs.readFileSync(alvo, 'utf8');
/* ══ SEM OS COMENTARIOS (14/09/26) ════════════════════════════════════════════════
   A minha primeira versao leu prosa como CSS: "overflow: hidden — a pagina nao rolava"
   virou "`—` nao e um valor de overflow". Sao 754 comentarios nesta base e quase todo
   achado veio deles. Troco por espaco do MESMO TAMANHO para os numeros de linha
   continuarem apontando o lugar certo. */
const cru = arquivoInteiro.replace(/\/\*[\s\S]*?\*\//g, function (c) {
  return c.replace(/[^\n]/g, ' ');
});

/* ── os conjuntos fechados ────────────────────────────────────────────────────────
   Só entram aqui propriedades cujo valor é UMA palavra de uma lista fechada. Nada de
   propriedade que aceita medida, cor ou função: ali o erro de digitação não é
   detectável sem um navegador, e chutar seria reprovar o certo. */
const FECHADAS = {
  'scroll-snap-type': ['none', 'x', 'y', 'block', 'inline', 'both',
    'mandatory', 'proximity'],
  'scroll-snap-align': ['none', 'start', 'end', 'center'],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
  'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
  'text-transform': ['none', 'capitalize', 'uppercase', 'lowercase', 'full-width'],
  'text-overflow': ['clip', 'ellipsis'],
  'visibility': ['visible', 'hidden', 'collapse'],
  'pointer-events': ['auto', 'none', 'all', 'visible', 'painted', 'fill', 'stroke'],
  'object-fit': ['fill', 'contain', 'cover', 'none', 'scale-down'],
  'overflow': ['visible', 'hidden', 'clip', 'scroll', 'auto', 'overlay'],
  'overflow-x': ['visible', 'hidden', 'clip', 'scroll', 'auto', 'overlay'],
  'overflow-y': ['visible', 'hidden', 'clip', 'scroll', 'auto', 'overlay'],
  'position': ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  'box-sizing': ['content-box', 'border-box'],
  'font-style': ['normal', 'italic', 'oblique'],
  /* as 36 palavras, conferidas uma a uma no CSS.supports do navegador: a minha lista
     curta acusava `cursor: copy`, que e valido. Lista incompleta numa guarda e a
     guarda reprovando o certo. */
  'cursor': ['auto', 'default', 'none', 'context-menu', 'help', 'pointer', 'progress',
    'wait', 'cell', 'crosshair', 'text', 'vertical-text', 'alias', 'copy', 'move',
    'no-drop', 'not-allowed', 'grab', 'grabbing', 'e-resize', 'n-resize', 'ne-resize',
    'nw-resize', 's-resize', 'se-resize', 'sw-resize', 'w-resize', 'ew-resize',
    'ns-resize', 'nesw-resize', 'nwse-resize', 'col-resize', 'row-resize',
    'all-scroll', 'zoom-in', 'zoom-out']
};
/* valem para qualquer propriedade */
const GLOBAIS = ['inherit', 'initial', 'unset', 'revert', 'revert-layer'];

const achados = [];
let declaracoesLidas = 0;

/* A linha de cada achado, para o erro apontar o lugar e não só o defeito. */
function linhaDe(indice) { return cru.slice(0, indice).split('\n').length; }

/* ── 1. o atalho `font:` com palavra global no fim ───────────────────────────────── */
/* mesma fronteira: sem ela `font` casaria dentro de `font-family`, `font-size` etc. */
const reFont = /(^|[;{"'\s])font\s*:\s*([^;'"`}]{3,90})/gm;
let m;
while ((m = reFont.exec(cru)) !== null) {
  const valor = m[2].trim().replace(/\s*!\s*important$/i, '');
  const pedacos = valor.split(/[\s,]+/).filter(Boolean);
  const ultimo = pedacos[pedacos.length - 1];
  /* SOZINHA A PALAVRA GLOBAL E VALIDA: `font: inherit` aplica o atalho inteiro e e o
     jeito certo de herdar a fonte do pai — esta base tem 134 delas, todas corretas.
     MORTA e a palavra global no FIM de uma LISTA: `font: 700 12px inherit`, onde ela
     ocuparia o lugar da familia. A minha primeira versao desta guarda reprovou as 134
     corretas e nao teria achado nada de novo: guarda que grita demais e guarda que
     alguem desliga. */
  if (pedacos.length > 1 && ultimo && GLOBAIS.indexOf(ultimo.toLowerCase()) > -1) {
    achados.push({
      linha: linhaDe(m.index),
      decl: 'font: ' + valor,
      porque: '`' + ultimo + '` não vale como família dentro do atalho `font` — a '
        + 'declaração INTEIRA é descartada, e com ela o peso e o tamanho. Escreva '
        + 'font-weight, font-size e font-family separados.'
    });
  }
}

/* ── 2. as propriedades de conjunto fechado ──────────────────────────────────────── */
Object.keys(FECHADAS).forEach(function (prop) {
  const permitidos = FECHADAS[prop].concat(GLOBAIS);
    /* ══ FRONTEIRA DE VERDADE (14/09/26) ══════════════════════════════════════════
       Sem ela, `overflow` casa dentro de `text-overflow` e `position` dentro de
       `background-position` — noventa achados de uma vez, todos corretos no arquivo.
       A propriedade so vale se vier depois de `{`, `;`, aspas, ou comeco de linha:
       que e onde uma declaracao comeca de verdade. */
  const re = new RegExp('(^|[;{"\'\\s])' + prop.replace(/-/g, '\\-')
    + '\\s*:\\s*([^;\'"`}\\n]{1,60})', 'gm');
  let x;
  while ((x = re.exec(cru)) !== null) {
    const valor = x[2].trim().replace(/\s*!\s*important$/i, '').trim();
    if (!valor) continue;
    /* valor montado por JS não dá para conferir estaticamente, e fingir que dá seria
       a guarda medindo o que não vê */
    /* `?` entrou em 14/09: `cursor: filtroKey ? ...` e um ternario montando o valor,
       e o meu filtro so procurava ${ } e +. Valor que o JS monta nao da para conferir
       estaticamente, e fingir que da e a guarda medindo o que nao ve. */
    if (/[${}+?]|\bvar\(/.test(valor)) continue;
    declaracoesLidas++;
    const palavras = valor.split(/\s+/).filter(Boolean);
    const errada = palavras.find(function (p) { return permitidos.indexOf(p.toLowerCase()) < 0; });
    if (errada) {
      achados.push({
        linha: linhaDe(x.index),
        decl: prop + ': ' + valor,
        porque: '`' + errada + '` não é um valor de `' + prop + '`. O navegador descarta '
          + 'a declaração sem avisar. Valores: ' + FECHADAS[prop].join(', ') + '.'
      });
    }
  }
});

if (achados.length) {
  console.error('CSS DESCARTADO EM SILÊNCIO (' + achados.length + '):');
  achados.forEach(function (a) {
    console.error('  linha ' + a.linha + '  ' + a.decl);
    console.error('    ' + a.porque);
  });
  console.error('');
  console.error('  Declaração que o navegador não entende não dá erro, não dá warning e');
  console.error('  não aparece na tela: ela simplesmente não existe. Foi assim que o');
  console.error('  `scroll-snap-type: x proximate` passou, e que quatro botões ficaram em');
  console.error('  Arial sem ninguém notar.');
  process.exit(1);
}

console.log('OK css descartado - ' + declaracoesLidas + ' declaracoes de conjunto fechado'
  + ' conferidas, e nenhum atalho `font` terminando em palavra global.');
