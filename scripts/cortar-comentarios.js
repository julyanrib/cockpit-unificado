// scripts/cortar-comentarios.js
//
// TIRA OS COMENTÁRIOS DO ARQUIVO PUBLICADO — E SÓ DELE (07/09/26).
//
// POR QUE ISSO EXISTE: `public/index.html` tinha 3742 KB brutos, e a Vercel serve com
// Brotli (medido: `Content-Encoding: br`), então o executivo baixa 801 KB na rua, no
// celular, a cada visita sem cache. Desses 801 KB, 373 KB são comentário — 47% do que
// ele paga de dado é prosa que só eu leio. O template continua com cada comentário no
// lugar; quem emagrece é o build.
//
// O QUE NÃO É: minificação. Nome de variável, espaço dentro de string, quebra de linha
// significativa, tudo fica. Só comentário sai (mais o espaço em branco que ele deixa).
// Sem parser de verdade e sem npm nesta máquina, minificar seria adivinhar.
//
// POR QUE UMA PILHA, E NÃO UM REGEX (as duas versões que erraram antes):
//   1. Regex ingênuo come `https://` dentro de template literal e `content:"/*"` no CSS.
//   2. Contar profundidade de `${ }` somando "${" e subtraindo qualquer "}" quebra em
//      `${arr.map(x => { return x }).join('')}`: o "}" do bloco zera a conta, o scanner
//      sai do template no meio, e dali em diante lê TEXTO DE TELA como código —
//      cortando "//" que era conteúdo e lendo o backtick de fechamento como abertura.
//      Foi exatamente isso que aconteceu, e o sintoma apareceu 30 mil linhas depois.
// Agora `}` de objeto e `}` de substituição são coisas diferentes, porque a pilha sabe
// em que quadro está.
//
// COMO SE SABE QUE O CORTE ESTÁ CERTO: `verificar()` roda quatro provas e o build para
// se qualquer uma reprovar — ver os comentários de cada uma lá embaixo. Verde nas quatro
// não substitui rodar as suites e olhar a tela; vermelho impede de chegar até lá.
//
// ESCAPE: `COCKPIT_MANTER_COMENTARIOS=1 node scripts/build.js` gera o arquivo com tudo,
// para quando eu precisar ler o HTML servido em produção durante uma investigação.

const vm = require('vm');

const BS = String.fromCharCode(92);   /* a barra invertida morre em heredoc; aqui não */
const CR = String.fromCharCode(96);   /* backtick idem, ver memória do projeto */

/* ── o scanner ─────────────────────────────────────────────────────────────────────
   Um passe, dois tipos de quadro na pilha:
     'code'      código. Comentário aqui é comentário. Conta as chaves DELE.
     'template'  dentro de `...`. Nada aqui é comentário. "${" empilha um 'code'.
   `coletar`, quando passado, recebe cada literal encontrado — é assim que a prova 2
   olha o mesmo caminho de código em vez de reimplementar o scanner pela terceira vez. */
function andar(js, coletar) {
  let out = '';
  let i = 0;
  const n = js.length;
  const pilha = [{ t: 'code', chaves: 0 }];
  let ult = '';

  /* regex ou divisão? A regra clássica: é regex se o último token significativo não
     pode terminar uma expressão. `}` e backtick estão na lista porque uma versão
     anterior os esqueceu e passou a ler `${x}` / 2 como início de regex. */
  const podeSerRegex = () => !ult ? true
    : (!new RegExp('[' + BS + 'w$)' + BS + ']' + "'" + '"' + CR + '}]$').test(ult)
      || /\b(return|typeof|case|in|of|new|delete|void|instanceof|do|else)$/.test(ult));

  while (i < n) {
    const q = pilha[pilha.length - 1];
    const c = js[i], d = js[i + 1];

    if (q.t === 'template') {
      if (c === BS) { out += js.slice(i, i + 2); i += 2; continue; }
      if (c === CR) { out += c; pilha.pop(); ult = CR; i++; continue; }
      if (c === '$' && d === '{') { out += '${'; pilha.push({ t: 'code', chaves: 0 }); ult = '{'; i += 2; continue; }
      out += c; i++; continue;
    }

    /* ---- quadro de código ---- */
    if (c === '/' && d === '*') {
      const f = js.indexOf('*/', i + 2);
      const fim = f < 0 ? n : f + 2;
      /* DEIXA UMA QUEBRA se o comentário ocupava linha(s): juntar duas instruções na
         mesma linha muda o ponto-e-vírgula automático (ASI) e o efeito seria silencioso. */
      out += (js.slice(i, fim).indexOf('\n') > -1) ? '\n' : ' ';
      i = fim; continue;
    }
    if (c === '/' && d === '/') {
      let f = js.indexOf('\n', i);
      if (f < 0) f = n;
      i = f; continue;                       /* o \n fica para a próxima volta */
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (js[j] === BS) { j += 2; continue; }
        if (js[j] === c) { j++; break; }
        j++;
      }
      const t = js.slice(i, j);
      if (coletar && t.length > 6) coletar.push(t);
      out += t; ult = c; i = j; continue;
    }
    if (c === CR) { out += c; pilha.push({ t: 'template' }); ult = CR; i++; continue; }
    if (c === '{') { q.chaves++; out += c; ult = '{'; i++; continue; }
    if (c === '}') {
      if (q.chaves > 0) q.chaves--;
      else if (pilha.length > 1) pilha.pop();   /* fecha a substituição, volta ao template */
      out += c; ult = '}'; i++; continue;
    }
    if (c === '/' && podeSerRegex()) {
      let j = i + 1, classe = false, ok = false;
      while (j < n) {
        if (js[j] === BS) { j += 2; continue; }
        if (js[j] === '[') classe = true;
        else if (js[j] === ']') classe = false;
        else if (js[j] === '\n') break;                  /* regex não atravessa linha */
        else if (js[j] === '/' && !classe) { j++; ok = true; break; }
        j++;
      }
      if (ok) {
        while (j < n && /[a-z]/.test(js[j])) j++;        /* as flags */
        out += js.slice(i, j); ult = '/'; i = j; continue;
      }
    }
    if (!/\s/.test(c)) ult = (ult + c).slice(-12);
    out += c; i++;
  }
  return out;
}

function cortarJs(js) {
  return andar(js, null).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/* CSS é simples de verdade: não tem regex nem template. Só string e escape — e string
   importa, porque `content:"/*"` e url() com asterisco existem. */
function cortarCss(css) {
  let out = '', i = 0, str = '';
  while (i < css.length) {
    const c = css[i], d = css[i + 1];
    if (str) { out += c; if (c === str && css[i - 1] !== BS) str = ''; i++; continue; }
    if (c === '"' || c === "'") { str = c; out += c; i++; continue; }
    if (c === '/' && d === '*') { const f = css.indexOf('*/', i + 2); i = f < 0 ? css.length : f + 2; continue; }
    out += c; i++;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/* Os blocos de script que são código nosso. `type="application/json"` é o DATA — sair
   mexendo ali corromperia o JSON, e ele não tem comentário nenhum de qualquer forma. */
function blocosDeCodigo(html) {
  const r = [];
  html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, function (m, at, corpo) {
    if (!/type="application\/json"/.test(at) && !/src=/.test(at) && corpo.trim()) r.push(corpo);
    return m;
  });
  return r;
}

function cortar(html) {
  let s = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g,
    function (m, a, corpo) { return '<style' + a + '>' + cortarCss(corpo) + '</style>'; });
  s = s.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, function (m, a, corpo) {
    if (/type="application\/json"/.test(a) || /src=/.test(a)) return m;
    return '<script' + a + '>' + cortarJs(corpo) + '</script>';
  });
  return s;
}

/* ── as provas ─────────────────────────────────────────────────────────────────────
   Devolve lista de problemas (vazia = passou). O build chama isto e aborta se vier
   qualquer coisa: um arquivo publicado com um caractere comido dentro de uma string
   de tela é pior do que 373 KB a mais. */
function verificar(original, cortado) {
  const problemas = [];
  const A = blocosDeCodigo(original), B = blocosDeCodigo(cortado);

  if (A.length !== B.length) {
    problemas.push('número de blocos de script mudou: ' + A.length + ' -> ' + B.length);
    return problemas;
  }

  /* PROVA 1 — sintaxe, pelo parser do próprio Node. É a única perna INDEPENDENTE do
     scanner: se ele comeu um delimitador, o V8 reclama aqui. */
  B.forEach(function (c, k) {
    try { new vm.Script(c); }
    catch (e) { problemas.push('bloco ' + (k + 1) + ' não é JS válido depois do corte: ' + e.message); }
  });

  /* PROVA 2 — todo literal de string do original sobrevive byte por byte. Sintaxe
     válida não pega caractere comido DENTRO de uma string: `'Cobrar promessa'` virando
     `'Cobrar promessa'` sem o "a" continua compilando e quebra a tela em silêncio. */
  A.forEach(function (a, k) {
    const lits = [];
    andar(a, lits);
    const b = B[k];
    for (let x = 0; x < lits.length; x++) {
      if (b.indexOf(lits[x]) < 0) {
        problemas.push('bloco ' + (k + 1) + ': literal desapareceu do arquivo cortado: ' + JSON.stringify(lits[x].slice(0, 80)));
        break;                                  /* um exemplo por bloco basta para abortar */
      }
    }
  });

  /* PROVA 3 — idempotência. Cortar o já cortado não pode mudar mais nada. Se mudar, o
     scanner tem estado dependente de comentário, ou seja: está lendo código como texto. */
  B.forEach(function (b, k) {
    if (cortarJs(b).replace(/\s+/g, ' ').trim() !== b.replace(/\s+/g, ' ').trim()) {
      problemas.push('bloco ' + (k + 1) + ': cortar duas vezes dá resultado diferente de cortar uma');
    }
  });

  /* PROVA 4 — a lista de funções declaradas é a mesma. Pega nome de função comido,
     que é o defeito que mais barato passa pelas outras três. */
  const nomes = function (js) { return (js.match(/\bfunction\s+([A-Za-z_$][\w$]*)/g) || []).sort().join('|'); };
  A.forEach(function (a, k) {
    if (nomes(cortarJs(a)) !== nomes(B[k])) {
      problemas.push('bloco ' + (k + 1) + ': a lista de funções declaradas mudou depois do corte');
    }
  });

  return problemas;
}

module.exports = { cortar, cortarJs, cortarCss, verificar, blocosDeCodigo };
