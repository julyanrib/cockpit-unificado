// scripts/checar-arraste-sem-ouvinte.js
//
// GUARDA 27 — GESTO DE ARRASTE ANUNCIADO E SEM OUVINTE.
// ---------------------------------------------------------------------------------------
// O CASO QUE A PRODUZIU (11/09/26, varredura de código morto pedida pelo Julyan): os
// cartões da munição da Minha Daily saíam com `draggable="true"`, `cursor:grab`, a alça
// `⠿` e o título "arraste pro dia · clique pra abrir a ficha". As faixas de horário saíam
// com `data-d7-dia-drop`, o destino.
//
// E não havia UM ouvinte de dragstart, dragover ou drop naquela tela. O executivo pegava o
// cartão, arrastava até onde o convite mandava, soltava — e nada acontecia.
//
// POR QUE ISSO MERECE GUARDA, e não é só faxina:
//
//   · é pior que botão morto. Botão morto você clica e desconfia. Arraste morto ANUNCIA o
//     gesto em três lugares (cursor, alça, título) e falha em silêncio, e a pessoa conclui
//     que errou a mira — e tenta de novo, na rua, com o celular na mão;
//   · nenhuma outra guarda alcança isto. A de clique morto olha `data-*` contra ouvinte de
//     click; a 21 olha CSS contra markup. `draggable` não é nem uma coisa nem outra;
//   · e no celular dragstart não existe. Uma tela que só oferece o arraste não oferece
//     nada — foi por isso que o Planejamento tratou o clique como caminho principal.
//
// COMO ELA DECIDE: para cada `draggable="true"` do template, acha a função que o emite e
// tira o PREFIXO de família dela (`d7RenderMunicao` → `d7`). A família precisa ter, em
// algum lugar do arquivo, um `addEventListener('dragstart'` dentro de uma função do mesmo
// prefixo. Mesma régua para `data-*-drop`/`-dia-drop`, que é o destino anunciado.
//
// O QUE ELA NÃO COBRE, dito para não virar promessa: não confere se o ouvinte FUNCIONA,
// nem se o destino aceita o tipo certo. Ela responde uma pergunta só — "existe ouvinte
// nesta família?" — que é a pergunta que ficou sem resposta por semanas.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const cru = fs.readFileSync(T, 'utf8');
/* comentário citando `draggable` não é markup */
const src = cru.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');

/* a função que contém uma posição, pelo cabeçalho mais próximo acima */
const cabecalhos = [...src.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)]
  .map(m => ({ i: m.index, nome: m[1] }));
function funcaoEm(pos) {
  let achada = null;
  for (const c of cabecalhos) { if (c.i <= pos) achada = c.nome; else break; }
  return achada;
}
function familiaDe(nome) {
  if (!nome) return null;
  const m = /^([a-z]+[0-9]*)/.exec(nome);
  return m ? m[1] : null;
}

/* as famílias que têm ouvinte de arraste */
const comOuvinte = new Set();
[...src.matchAll(/addEventListener\('(dragstart|drop|dragover)'/g)].forEach(function (m) {
  const f = familiaDe(funcaoEm(m.index));
  if (f) comOuvinte.add(f);
});

const problemas = [];

/* 1 · quem se declara arrastável */
[...src.matchAll(/draggable=\\?["']true\\?["']/g)].forEach(function (m) {
  const nome = funcaoEm(m.index);
  const f = familiaDe(nome);
  if (!f || !comOuvinte.has(f)) {
    problemas.push('draggable="true" em ' + (nome || '(fora de função)')
      + ' — a família `' + (f || '?') + '` não tem ouvinte de dragstart');
  }
});

/* 2 · quem se anuncia como destino */
[...src.matchAll(/data-([a-z0-9]+)-[a-z-]*drop=/g)].forEach(function (m) {
  const f = m[1];
  if (!comOuvinte.has(f)) {
    problemas.push('data-' + f + '-…-drop emitido em ' + (funcaoEm(m.index) || '?')
      + ' — a família `' + f + '` não tem ouvinte de drop');
  }
});

if (problemas.length) {
  console.error('ARRASTE ANUNCIADO SEM OUVINTE:');
  [...new Set(problemas)].forEach(p => console.error('  ' + p));
  console.error('');
  console.error('  Arraste morto e pior que botao morto: ele ANUNCIA o gesto no cursor, na');
  console.error('  alca e no titulo, falha em silencio, e a pessoa conclui que errou a mira.');
  console.error('  Ou liga o ouvinte, ou tira o convite — cursor, alca e texto junto.');
  process.exit(1);
}

const familias = [...comOuvinte].sort().join(', ') || 'nenhuma';
console.log('OK arraste — todo `draggable` e todo destino de drop estão em família com ouvinte (' + familias + ').');
