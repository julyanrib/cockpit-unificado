// scripts/checar-chave-com-objeto.js
//
// GUARDA 28 — FUNÇÃO QUE PEDE UMA CHAVE RECEBENDO O OBJETO INTEIRO.
// ---------------------------------------------------------------------------------------
// O CASO QUE A PRODUZIU (11/09/26, revisão da tela do executivo na PRODUÇÃO, com a sessão
// do Bruno): três cartões do dia dele diziam
//
//     LA BOLARIA RIO DE JANEIRO BARRA DA TIJUCA · [object Object] · CNPJ aberto há 3 meses
//
// `pl6TextoDaRegiao(chave, regioes)` recebe uma CHAVE de lugar. `d7SubDaVisita` passava o
// LEAD inteiro: `String({...})` virou "[object Object]" e foi direto para a tela.
//
// POR QUE NADA PEGOU, e por que isso merece guarda:
//
//   · não há erro. JavaScript converte objeto em string sem reclamar, e a função devolveu
//     uma string NÃO VAZIA — então o `|| lead.bairro || lead.cidade`, que existia
//     exatamente para o caso de não ter região, nunca foi alcançado;
//   · build, 42 suítes e as 27 guardas passaram. O defeito não muda geometria, não quebra
//     sintaxe e não some do DOM: ele TROCA uma palavra por outra;
//   · e ficou semanas assim, na aba que o executivo abre de manhã.
//
// COMO ELA DECIDE: acha as funções cujo PRIMEIRO parâmetro se chama `chave` (ou `iso`,
// `id`, `ownerId`, `dealId` — todos escalares por contrato de nome) e reprova quando algum
// site as chama passando uma variável cujo nome é notoriamente um objeto desta casa:
// `lead`, `l`, `item`, `it`, `negocio`, `conta`, `rep`, `x`.
//
// O QUE ELA NÃO COBRE, dito para não virar promessa: só olha o NOME da variável no site da
// chamada. Passar `lead.regiao` está certo e passa; passar `algo` (nome neutro) não é
// medido. Ela responde uma pergunta só — "alguém está passando um objeto conhecido onde o
// parâmetro se chama chave?" — que é a pergunta que ninguém fez por semanas.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const cru = fs.readFileSync(T, 'utf8');
const src = cru.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');

/* 1 · as funções cujo primeiro parâmetro é escalar POR NOME */
const NOMES_ESCALARES = ['chave', 'iso', 'dataISO', 'ownerId', 'dealId', 'stageId'];
const pedemEscalar = new Map();
[...src.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)/g)]
  .forEach(function (m) {
    if (NOMES_ESCALARES.indexOf(m[2]) > -1) pedemEscalar.set(m[1], m[2]);
  });

/* 2 · os nomes que nesta casa são objeto */
const OBJETOS = ['lead', 'l', 'item', 'it', 'negocio', 'conta', 'rep', 'x', 'r', 'deal'];

const problemas = [];
pedemEscalar.forEach(function (param, fn) {
  const re = new RegExp('\\b' + fn + '\\(\\s*(' + OBJETOS.join('|') + ')\\s*[,)]', 'g');
  [...src.matchAll(re)].forEach(function (m) {
    const linha = src.slice(0, m.index).split('\n').length;
    problemas.push(fn + '(' + m[1] + ')  — o 1º parâmetro dela se chama `' + param
      + '`, e `' + m[1] + '` é objeto (linha ~' + linha + ' do template sem comentários)');
  });
});

if (problemas.length) {
  console.error('FUNÇÃO QUE PEDE CHAVE RECEBENDO O OBJETO:');
  [...new Set(problemas)].forEach(p => console.error('  ' + p));
  console.error('');
  console.error('  JavaScript converte objeto em string sem reclamar: o retorno vira');
  console.error('  "[object Object]", e como isso NAO e string vazia, o fallback logo');
  console.error('  depois (|| lead.bairro || ...) nunca e alcancado. Foi assim que a Minha');
  console.error('  Daily mostrou "[object Object]" no lugar do bairro por semanas, com o');
  console.error('  build, as 42 suites e as 27 guardas todas verdes.');
  console.error('  Passe a CHAVE (ex.: lead.regiao) ou o texto ja pronto (lead.regiaoNome).');
  process.exit(1);
}

console.log('OK chave x objeto — as ' + pedemEscalar.size
  + ' funções de primeiro parâmetro escalar são chamadas com escalar.');
