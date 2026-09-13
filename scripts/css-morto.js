// scripts/css-morto.js
//
// O SCANNER DE CSS MORTO, REFEITO — E POR QUE ELE EXISTE DE NOVO.
// ---------------------------------------------------------------------------------------
// Em 12/09/26 eu escrevi um limpador de CSS morto e ele QUEBROU A PRODUÇÃO por meio dia.
// O defeito: ele lia como "seletor" todo o texto entre o `}` anterior e o `{` — o que
// inclui o comentário que explica a regra — e fazia `split(',')`. Comentário com vírgula
// virou "dois seletores", e a primeira metade foi reescrita SEM o `*/`. Ficaram 18
// comentários abertos; o primeiro engoliu o `}` de um `@media (max-width:760px)` e, dali
// em diante, a folha inteira virou conteúdo daquele media. 2861 regras aplicadas de ~3980
// — tela de login sem layout, aba Hoje desmontada. Build e 45 suítes, verdes.
//
// AS TRÊS REGRAS QUE ESTE ARQUIVO SEGUE POR CAUSA DAQUILO:
//
//   1. COMENTÁRIO É TOKEN PRÓPRIO. O tokenizador abaixo reconhece `/* */` e string antes de
//      qualquer outra coisa. Nenhum comentário entra num seletor, nunca — e é por isso que
//      esta versão é um TOKENIZADOR e não uma sequência de regex.
//   2. NÃO SE REESCREVE LISTA DE SELETOR. Uma regra só sai INTEIRA, e só quando TODOS os
//      seletores dela estão mortos. Recortar `.a` de `.a, .b {}` foi literalmente a
//      operação que corrompeu o arquivo; o ganho dela não paga o risco.
//   3. O NÚMERO QUE PROVA É O DE REGRAS PARSEADAS pelo navegador, não o de bytes. Presença
//      no `document.styleSheets` não é aplicabilidade: com a folha aninhada no media
//      errado, as regras apareciam TODAS lá dentro. Quem confere é `medir()` no fim.
//
// Uso:
//   node scripts/css-morto.js            — só mede e lista
//   node scripts/css-morto.js --escrever — remove as regras totalmente mortas

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');

/* ── 1. O BLOCO DE ESTILO ────────────────────────────────────────────────────────────
   Pelo índice, e não por regex com `[\s\S]*?`: o arquivo tem outras ocorrências de
   `</style>` dentro de string de template, e a preguiçosa casaria na primeira. */
function blocoDeEstilo(cru) {
  const i = cru.indexOf('<style>');
  if (i < 0) throw new Error('sem <style> no template');
  const ini = i + '<style>'.length;
  const fim = cru.indexOf('</style>', ini);
  if (fim < 0) throw new Error('<style> sem fechamento');
  return { ini: ini, fim: fim, css: cru.slice(ini, fim) };
}

/* ── 2. O TOKENIZADOR ────────────────────────────────────────────────────────────────
   Devolve a folha como uma lista de nós, cada um com o intervalo EXATO no texto original
   (para o recorte ser cirúrgico) e, quando é regra, o prelúdio limpo — o texto entre o nó
   anterior e o `{`, com os comentários JÁ RETIRADOS. É esse prelúdio limpo, e só ele, que
   pode ser dividido na vírgula.

   `dono` liga cada regra ao comentário que vem imediatamente antes dela (só espaço em
   branco no meio): sair a regra e deixar a explicação dela de pé produz o inverso do
   defeito que a guarda 21 descreve — prosa boa sobre uma tela que não existe. */
function tokenizar(css) {
  const nos = [];
  let i = 0;
  const n = css.length;
  let inicioPrelude = 0;

  function pularComentario(j) {
    const f = css.indexOf('*/', j + 2);
    return f < 0 ? n : f + 2;
  }
  function pularString(j) {
    const aspa = css[j];
    let k = j + 1;
    while (k < n) {
      if (css[k] === '\\') { k += 2; continue; }
      if (css[k] === aspa) return k + 1;
      k++;
    }
    return n;
  }

  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const fim = pularComentario(i);
      nos.push({ tipo: 'comentario', ini: i, fim: fim });
      i = fim;
      inicioPrelude = i;
      continue;
    }
    if (c === '"' || c === "'") { i = pularString(i); continue; }
    if (c === '}') {
      /* fechamento de um bloco que este nível não abriu — só acontece se o arquivo
         estiver corrompido. Reporta em vez de seguir adiante calado. */
      nos.push({ tipo: 'fechamento-orfao', ini: i, fim: i + 1 });
      i++; inicioPrelude = i; continue;
    }
    if (c === '{') {
      /* o prelúdio vai do fim do nó anterior até aqui; o corpo, daqui até a chave que
         fecha, contando profundidade e pulando comentário e string lá dentro também. */
      let d = 1, k = i + 1;
      while (k < n && d > 0) {
        const ch = css[k];
        if (ch === '/' && css[k + 1] === '*') { k = pularComentario(k); continue; }
        if (ch === '"' || ch === "'") { k = pularString(k); continue; }
        if (ch === '{') d++;
        else if (ch === '}') d--;
        k++;
      }
      const bruto = css.slice(inicioPrelude, i);
      nos.push({
        tipo: 'regra',
        ini: inicioPrelude,
        fim: k,
        iniChave: i,
        preludeBruto: bruto,
        /* O PRELÚDIO LIMPO — sem comentário. É o único texto que pode ser dividido na
           vírgula, e a razão de este arquivo existir. */
        prelude: bruto.replace(/\/\*[\s\S]*?\*\//g, ' ').trim(),
        corpo: css.slice(i + 1, Math.max(i + 1, k - 1))
      });
      i = k;
      inicioPrelude = i;
      continue;
    }
    i++;
  }
  /* liga cada regra ao comentário imediatamente anterior */
  for (let x = 1; x < nos.length; x++) {
    if (nos[x].tipo !== 'regra' || nos[x - 1].tipo !== 'comentario') continue;
    const entre = css.slice(nos[x - 1].fim, nos[x].ini);
    if (/^\s*$/.test(entre)) nos[x].comentario = nos[x - 1];
  }
  return nos;
}

/* ── 3. AS CLASSES QUE O ARQUIVO CITA FORA DO ESTILO ─────────────────────────────────
   A PRIMEIRA VERSÃO DISTO ERA AS QUATRO FORMAS das guardas 7 e 21 — `class="..."`,
   `classList.*`, `className =` e `querySelector`. Rodei e ela declarou `.b-red` morta.
   `.b-red` está VIVA, na linha 55531:

       if (d.pend === 0) badge = { rot: 'vazio', cls: 'b-red' };

   Atribuição a uma propriedade que vira classe adiante. Nenhuma das quatro formas pega
   isso, e não existe lista de formas que pegue todas — o arquivo tem anos de padrões, e
   a próxima seria `dataset`, `insertAdjacentHTML`, um mapa de cor para classe.

   MEDIR "É GERADA" É O PROBLEMA ERRADO. O que eu preciso saber para APAGAR com segurança
   não é "alguém gera esta classe", é "existe alguma chance de alguém gerar" — e para
   isso o critério certo é o mais burro possível: **o nome aparece, como token inteiro,
   em qualquer lugar do arquivo fora do bloco de estilo?** Se aparece, fica.

   Isso mantém regra morta que só é citada num comentário. Ótimo. O custo de manter uma
   regra morta é um KB; o custo de apagar uma viva foi meio dia de produção quebrada em
   12/09. A assimetria decide o critério. */
/* E O CORPUS NÃO É SÓ O TEMPLATE (segunda correção, na mesma tarde). Com o critério burro
   já valendo, o corte tirou `.pba .pb-out-h` e a suíte do playbook reprovou: `pb-out-h` é
   emitida pelo PLAYBOOK COMPILADO (data/field-sales-playbook.compiled.json), que o build
   embute na página. Markup que a tela mostra não mora só no template.

   Então o corpus passa a ser o template mais tudo o que o build pode embutir — `data/`,
   `lib/` e `api/`. Varrer demais só mantém regra morta; varrer de menos apaga regra viva.
   A cada dúvida, o lado que erra é o de manter. */
const DIRS_DO_CORPUS = ['data', 'lib', 'api'];
function corpoDeArquivos(raiz, acc) {
  acc = acc || [];
  let itens = [];
  try { itens = fs.readdirSync(raiz, { withFileTypes: true }); } catch (e) { return acc; }
  itens.forEach(it => {
    const p = path.join(raiz, it.name);
    if (it.isDirectory()) return corpoDeArquivos(p, acc);
    if (!/\.(js|json|html|md|cjs|mjs)$/i.test(it.name)) return;
    try { acc.push(fs.readFileSync(p, 'utf8')); } catch (e) { /* ilegível não vira ausência de citação */ }
  });
  return acc;
}
function classesGeradas(cru, iniEstilo, fimEstilo) {
  const pedacos = [cru.slice(0, iniEstilo), cru.slice(fimEstilo)];
  const raiz = path.join(__dirname, '..');
  DIRS_DO_CORPUS.forEach(d => corpoDeArquivos(path.join(raiz, d)).forEach(t => pedacos.push(t)));
  const citadas = new Set();
  pedacos.forEach(t => (t.match(/[A-Za-z0-9_-]+/g) || []).forEach(p => citadas.add(p)));
  return citadas;
}

/* ── 4. UM SELETOR ESTÁ MORTO? ───────────────────────────────────────────────────────
   Só respondo "sim" quando tenho certeza, e a certeza é estreita de propósito:
   · o seletor tem de ser feito SÓ de classes, combinadores e pseudos (nada de elemento,
     id, atributo, `*`), porque `button.x` continua valendo pelo elemento;
   · e pelo menos uma das classes dele nunca é gerada.
   Qualquer outra coisa devolve "não sei", que aqui é o mesmo que "vive". */
function seletorMorto(sel, geradas) {
  const s = sel.trim();
  if (!s) return false;
  if (/^@/.test(s)) return false;
  /* tira pseudo-classes/elementos com argumento antes de olhar o resto */
  const semPseudo = s.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, '');
  /* sobrou algo que não seja classe, combinador ou espaço? então não sei julgar. */
  if (/[^.\sA-Za-z0-9_>+~-]/.test(semPseudo)) return false;
  /* token que começa com letra = seletor de elemento -> não julgo */
  const tokens = semPseudo.split(/[\s>+~]+/).filter(Boolean);
  if (!tokens.length) return false;
  if (tokens.some(t => t[0] !== '.')) return false;
  const classes = (semPseudo.match(/\.([A-Za-z0-9_-]+)/g) || []).map(c => c.slice(1));
  if (!classes.length) return false;
  return classes.some(c => !geradas.has(c));
}

function analisar() {
  const cru = fs.readFileSync(T, 'utf8');
  const { ini, fim, css } = blocoDeEstilo(cru);
  const nos = tokenizar(css);
  const geradas = classesGeradas(cru, ini, fim);

  const orfaos = nos.filter(x => x.tipo === 'fechamento-orfao').length;
  const regras = nos.filter(x => x.tipo === 'regra');
  /* SÓ REGRA DE TOPO: dentro de @media/@supports o prelúdio do filho não é um nó deste
     nível (o tokenizador consome o bloco inteiro), então isto já é só o topo. Regra morta
     dentro de um @media fica para outro dia — e fica DE PROPÓSITO: o estrago de 12/09
     nasceu de mexer perto de fechamento de @media. */
  const mortas = [];
  regras.forEach(r => {
    if (/^@/.test(r.prelude)) return;
    const sels = r.prelude.split(',').map(s => s.trim()).filter(Boolean);
    if (!sels.length) return;
    if (sels.every(s => seletorMorto(s, geradas))) mortas.push({ no: r, sels: sels });
  });

  return { cru, ini, fim, css, nos, regras, mortas, orfaos, geradas };
}

/* SÓ IMPRIME QUANDO É CHAMADO NA MÃO. `testar-css-morto.js` importa `analisar` daqui, e
   um módulo que fala ao ser importado enche a saída da suíte com a lista de seletores —
   e saída suja é como uma falha real passa despercebida no meio do verde. */
const ehLinhaDeComando = require.main === module;
const a = analisar();
if (ehLinhaDeComando) {
console.log('bloco de estilo: ' + a.css.length + ' bytes, ' + a.regras.length + ' regra(s) de topo, '
  + a.nos.filter(x => x.tipo === 'comentario').length + ' comentário(s), '
  + a.orfaos + ' fechamento(s) órfão(s)');
console.log('nomes citados fora do bloco de estilo: ' + a.geradas.size);
console.log('regras com TODOS os seletores mortos: ' + a.mortas.length);
const bytes = a.mortas.reduce((s, m) => s + (m.no.fim - (m.no.comentario ? m.no.comentario.ini : m.no.ini)), 0);
console.log('bytes brutos que sairiam (regra + comentário dela): ' + bytes);
console.log('');
a.mortas.slice(0, 40).forEach(m => console.log('  ' + m.sels.join(', ').slice(0, 100)));
if (a.mortas.length > 40) console.log('  ... e mais ' + (a.mortas.length - 40));
}

/* ── 5. O RECORTE ────────────────────────────────────────────────────────────────────
   DE TRÁS PARA A FRENTE, sempre: recortar do começo desloca todos os índices seguintes, e
   índice deslocado é o corte caindo no meio de outra regra — que é como se produz um
   comentário aberto. Os intervalos vêm do tokenizador e são fatias inteiras: comentário
   dono (quando existe) + regra, do primeiro caractere ao `}`.

   E O SALDO É CONFERIDO ANTES DE GRAVAR: abertura e fechamento de chave, e abertura e
   fechamento de comentário, têm de bater com o corte pedido — senão nada é escrito. É a
   trava que faltou em 12/09.

   (Os pares de comentário estão escritos por extenso nesta nota de propósito: citar o
   fechamento entre crases dentro de um comentário de bloco FECHA o comentário, e foi
   isso que acabou de quebrar este arquivo na primeira execução.) */
function escrever() {
  const { cru, ini, fim, css, mortas } = a;
  const cortes = mortas
    .map(m => ({ de: m.no.comentario ? m.no.comentario.ini : m.no.ini, ate: m.no.fim }))
    .sort((x, y) => y.de - x.de);
  let novo = css;
  cortes.forEach(c => { novo = novo.slice(0, c.de) + novo.slice(c.ate); });

  const conta = (txt, p) => (txt.split(p).length - 1);

  /* ══ CADA PEDAÇO REMOVIDO TEM DE SER EQUILIBRADO EM SI ════════════════════════════
     A primeira versão desta trava conferia "uma chave a menos por regra removida" e
     REPROVOU um corte correto: o comentário de `.pba .pb-out-h` cita `.pba a{overflow}`
     na prosa, então aquele pedaço levava duas chaves, não uma. A conta estava cravada
     no formato esperado do corte em vez de na propriedade que importa.

     A propriedade que importa é esta: se todo pedaço retirado abre e fecha o mesmo
     tanto — de chave E de comentário — então retirá-lo não tem como desequilibrar o que
     fica. É exatamente a garantia que faltou em 12/09, quando o pedaço removido levava
     embora um fechamento de comentário que não era dele.

     Derivar o esperado das próprias fatias seria tautologia (novo = css menos as fatias,
     então bateria sempre). Por isso a trava é sobre CADA FATIA, e o total é só a
     confirmação. */
  const desequilibradas = cortes
    .map(c => ({ c: c, t: css.slice(c.de, c.ate) }))
    .filter(x => conta(x.t, '{') !== conta(x.t, '}') || conta(x.t, '/*') !== conta(x.t, '*/'));
  console.log('');
  if (desequilibradas.length) {
    console.error('NADA FOI ESCRITO — ' + desequilibradas.length + ' pedaço(s) não fecham o que abrem:');
    desequilibradas.slice(0, 5).forEach(x => console.error('  ' + JSON.stringify(x.t.slice(0, 120))));
    process.exit(1);
  }
  console.log('as ' + cortes.length + ' fatias removidas fecham o que abrem — ok');

  const antes = { ab: conta(css, '{'), fe: conta(css, '}'), ca: conta(css, '/*'), cf: conta(css, '*/') };
  const dep = { ab: conta(novo, '{'), fe: conta(novo, '}'), ca: conta(novo, '/*'), cf: conta(novo, '*/') };
  console.log('saldo  {: ' + antes.ab + ' -> ' + dep.ab + '   }: ' + antes.fe + ' -> ' + dep.fe);
  console.log('saldo /*: ' + antes.ca + ' -> ' + dep.ca + '   */: ' + antes.cf + ' -> ' + dep.cf);
  /* O SALDO NÃO É ZERO, E NUNCA FOI: a contagem crua conta chave escrita em PROSA dentro
     de comentário, e a folha já vinha com três fechamentos a mais por isso (a guarda 31
     do build documenta o mesmo saldo). Exigir zero aqui reprovaria um corte correto — o
     que tem de valer é o saldo NÃO MUDAR. */
  const saldoAntes = antes.ab - antes.fe, saldoDepois = dep.ab - dep.fe;
  console.log('saldo cru de chave: ' + saldoAntes + ' -> ' + saldoDepois + ' (tem de ser igual)');
  if (saldoAntes !== saldoDepois || dep.ca !== dep.cf) {
    console.error('NADA FOI ESCRITO — o saldo da folha mudou, ou sobrou comentário aberto.');
    process.exit(1);
  }
  /* E O RESULTADO É TOKENIZADO DE NOVO: o saldo bate até em folha corrompida de um jeito
     que se cancela. Reler é o que prova que a estrutura continua sendo a mesma, com 423
     regras a menos e nenhum fechamento órfão novo. */
  const relido = tokenizar(novo);
  const regrasDepois = relido.filter(x => x.tipo === 'regra').length;
  const orfaosDepois = relido.filter(x => x.tipo === 'fechamento-orfao').length;
  console.log('relido: ' + regrasDepois + ' regra(s) de topo (eram ' + a.regras.length + '), '
    + orfaosDepois + ' fechamento(s) órfão(s) (eram ' + a.orfaos + ')');
  if (regrasDepois !== a.regras.length - mortas.length || orfaosDepois !== a.orfaos) {
    console.error('NADA FOI ESCRITO — a releitura não encontra a estrutura esperada.');
    process.exit(1);
  }
  fs.writeFileSync(T, cru.slice(0, ini) + novo + cru.slice(fim));
  console.log('escrito: ' + mortas.length + ' regra(s) fora, ' + (css.length - novo.length) + ' bytes brutos');
}

if (ehLinhaDeComando && process.argv.indexOf('--escrever') > -1) escrever();

module.exports = { analisar, tokenizar, blocoDeEstilo, classesGeradas, seletorMorto };
