/* ══════════════════════════════════════════════════════════════════════════════════════
   DESEMPACOTAR UMA PRANCHA DO CLAUDE DESIGN (16/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "a aba semana do gestor NÃO FICOU igual ao mockup q te passei, ficou todo
   quebrado, quero q fique igual a prancha".

   ELE ESTÁ CERTO, E A CAUSA RAIZ É ESTE ARQUIVO NÃO EXISTIR ANTES. Os `-STANDALONE.html`
   do Claude Design não são HTML: são um template com `<sc-for>`, `<sc-if>` e `{{ }}`,
   renderizado por um `support.js` que NÃO vem no download. Sem ele o arquivo abre em
   branco. Resultado prático: nas 14 pranchas deste projeto eu sempre LI o código-fonte e
   nunca VI a tela — comparei de cabeça, e foi por isso que a v5 saiu diferente sem eu
   notar.

   Este script troca leitura por imagem: expande os laços com a fixture da própria prancha
   e escreve um HTML que abre em qualquer navegador. Não é interpretação minha — a fixture
   e o markup saem do arquivo dele.

   USO: node scripts/desempacotar-prancha.js <entrada.html> [saida.html]

   O QUE ELE NÃO FAZ, de propósito: `onClick` sai (a prancha é estática) e `style-hover`
   vira uma regra :hover de verdade, porque o hover faz parte do desenho que eu preciso
   comparar. Estado inicial é o `state` declarado na classe.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const entrada = process.argv[2];
if (!entrada) {
  console.error('uso: node scripts/desempacotar-prancha.js <entrada.html> [saida.html]');
  process.exit(1);
}
const saida = process.argv[3]
  || path.join(path.dirname(entrada), path.basename(entrada, '.html') + '.renderizada.html');

const bruto = fs.readFileSync(entrada, 'utf8');

/* ── 1. O CORPO E O SCRIPT ──────────────────────────────────────────────────────── */
const mCorpo = bruto.match(/<x-dc>([\s\S]*?)<\/x-dc>/);
if (!mCorpo) { console.error('X não achei <x-dc> — esta prancha não é do Claude Design'); process.exit(1); }
let corpo = mCorpo[1];

const mScript = bruto.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
if (!mScript) { console.error('X não achei o <script type="text/x-dc">'); process.exit(1); }
const fonteClasse = mScript[1];

/* as props declaradas no atributo data-props, com o default de cada uma */
let props = {};
const mProps = bruto.match(/data-props="([^"]*)"/);
if (mProps) {
  const cru = mProps[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  try {
    const decl = JSON.parse(cru);
    Object.keys(decl).forEach(function (k) { props[k] = decl[k].default; });
  } catch (e) { console.error('aviso: não consegui ler data-props:', e.message); }
}

/* ── 2. RODAR A LÓGICA DA PRANCHA ───────────────────────────────────────────────── */
/* `DCLogic` é a base do runtime que não veio. O que a fixture usa dela é `this.props`,
   `this.state` e `this.setState` — e setState só importa no clique, que aqui não existe.
   Stub mínimo, e se a prancha usar algo mais a exceção aparece em vez de sumir. */
const contexto = {
  console: console,
  DCLogic: class DCLogic {
    constructor(p) { this.props = p || {}; }
    setState() { /* prancha estática: o clique não existe aqui */ }
  },
  module: { exports: {} }
};
vm.createContext(contexto);
let vals;
try {
  vm.runInContext(fonteClasse + '\nmodule.exports = Component;', contexto);
  const C = contexto.module.exports;
  const inst = new C(props);
  inst.props = props;
  /* o `state = {...}` da classe é campo de instância e já veio do construtor */
  vals = inst.renderVals();
} catch (e) {
  console.error('X a lógica da prancha não rodou:', e && e.message);
  process.exit(1);
}
console.log('fixture lida: ' + Object.keys(vals).join(', '));

/* ── 3. EXPANDIR sc-for / sc-if / {{ }} ─────────────────────────────────────────── */
/* Avaliar uma expressão do template no escopo das variáveis do laço. As expressões da
   prancha são caminhos simples (`k.valor`, `r.aberto`) e literais (`{{ false }}`), então
   `with` num contexto de vm dá conta e não precisa de parser. */
function avaliar(expr, escopo) {
  try {
    const ctx = Object.assign({}, vals, escopo);
    return vm.runInNewContext('with (__e) { (' + expr + ') }'.replace('__e', '__e'),
      { __e: ctx, ...ctx });
  } catch (e) { return undefined; }
}
function avaliarSimples(expr, escopo) {
  const ctx = Object.assign({}, vals, escopo);
  const partes = String(expr).trim().split('.');
  if (partes.length === 1) {
    if (Object.prototype.hasOwnProperty.call(ctx, partes[0])) return ctx[partes[0]];
    try { return vm.runInNewContext('(' + expr + ')', {}); } catch (e) { return undefined; }
  }
  let v = ctx[partes[0]];
  for (let i = 1; i < partes.length && v != null; i++) v = v[partes[i]];
  return v;
}

/* acha o par de abertura/fechamento de uma tag, respeitando aninhamento do MESMO nome */
function acharBloco(txt, tag, desde) {
  const abre = new RegExp('<' + tag + '\\b[^>]*>', 'g');
  abre.lastIndex = desde || 0;
  const m = abre.exec(txt);
  if (!m) return null;
  const ini = m.index, depoisAbre = ini + m[0].length;
  let prof = 1, i = depoisAbre;
  const re = new RegExp('<' + tag + '\\b[^>]*>|</' + tag + '>', 'g');
  re.lastIndex = depoisAbre;
  let mm;
  while ((mm = re.exec(txt))) {
    if (mm[0].charAt(1) === '/') { prof--; if (prof === 0) {
      return { ini: ini, abreFim: depoisAbre, fim: mm.index, fimTag: mm.index + mm[0].length,
        atributos: m[0], interno: txt.slice(depoisAbre, mm.index) }; } }
    else prof++;
  }
  return null;
}

function interpolar(txt, escopo) {
  return txt.replace(/\{\{([^}]*)\}\}/g, function (_, e) {
    const v = avaliarSimples(e, escopo);
    return v == null ? '' : String(v);
  });
}

function expandir(txt, escopo) {
  /* sc-for primeiro, e sempre o mais EXTERNO: expandir de dentro para fora deixaria o
     laço interno sem a variável do externo */
  let b = acharBloco(txt, 'sc-for', 0);
  if (b) {
    const mLista = b.atributos.match(/list="\{\{([^}]*)\}\}"/);
    const mAs = b.atributos.match(/as="([^"]*)"/);
    const nome = mAs ? mAs[1] : 'item';
    const lista = mLista ? avaliarSimples(mLista[1], escopo) : null;
    const itens = Array.isArray(lista) ? lista : [];
    const saidaLaco = itens.map(function (it, idx) {
      const e2 = Object.assign({}, escopo);
      e2[nome] = it; e2[nome + 'Index'] = idx;
      return expandir(b.interno, e2);
    }).join('');
    return expandir(txt.slice(0, b.ini), escopo) + saidaLaco
      + expandir(txt.slice(b.fimTag), escopo);
  }
  let c = acharBloco(txt, 'sc-if', 0);
  if (c) {
    const mVal = c.atributos.match(/value="\{\{([^}]*)\}\}"/);
    const cond = mVal ? avaliarSimples(mVal[1], escopo) : false;
    return expandir(txt.slice(0, c.ini), escopo)
      + (cond ? expandir(c.interno, escopo) : '')
      + expandir(txt.slice(c.fimTag), escopo);
  }
  return interpolar(txt, escopo);
}

corpo = expandir(corpo, {});

/* ── 4. style-hover VIRA :hover DE VERDADE ──────────────────────────────────────── */
/* o hover faz parte do desenho que eu preciso comparar; jogar fora seria comparar
   metade da prancha */
let nHover = 0;
const regras = [];
corpo = corpo.replace(/\s*style-hover="([^"]*)"/g, function (_, css) {
  const cls = 'dch' + (++nHover);
  regras.push('.' + cls + ':hover{' + css + '}');
  return ' data-dch="' + cls + '" class="' + cls + '"';
});

/* onClick sai: a prancha é estática */
corpo = corpo.replace(/\s*onClick="[^"]*"/g, '');

/* ── 5. O <helmet> É O <head> ───────────────────────────────────────────────────── */
let helmet = '';
const mH = corpo.match(/<helmet>([\s\S]*?)<\/helmet>/);
if (mH) { helmet = mH[1]; corpo = corpo.replace(/<helmet>[\s\S]*?<\/helmet>/, ''); }

const html = '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  + '<title>prancha desempacotada — ' + path.basename(entrada) + '</title>\n'
  + helmet
  + '<style>\n/* hover da prancha, convertido de style-hover */\n'
  + regras.join('\n') + '\n</style>\n'
  + '</head>\n<body>\n' + corpo + '\n</body>\n</html>\n';

fs.writeFileSync(saida, html);
console.log('escrito: ' + saida);
console.log('  ' + nHover + ' regra(s) de hover convertidas');
console.log('  ' + (html.match(/\{\{/g) || []).length + ' interpolação(ões) que sobraram '
  + '(tem de ser 0)');
