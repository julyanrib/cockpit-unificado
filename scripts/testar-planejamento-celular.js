#!/usr/bin/env node
/* ============================================================================
   PLANEJAMENTO FINAL · 1.7 — NO CELULAR, A TELA ABRE NO DIA DE HOJE (23/09/26)

   No telefone, cinco dias empilhados fazem o executivo rolar meia tela até achar onde ele
   está — e onde ele está é, quase sempre, hoje. É o que a Minha Daily fazia bem, e o
   Planejamento precisa fazer antes de ela sair.

   UM MARKUP SÓ, DOIS DESENHOS. A grade é a MESMA do desktop; o dia escolhido é marcado no
   atributo e o CSS decide o que mostrar. Escrever uma tela de celular à parte é como esta
   casa acabou com o mesmo dia montado em duas telas — a dívida que a seção 2 vem pagar, e
   repeti-la aqui seria trocar uma por outra.

   A CHECAGEM MAIS IMPORTANTE DESTE ARQUIVO é a última: NENHUM elemento cujo desenho o CSS
   decide pode trazer `display` no atributo style. Inline vence folha, e esta tela pagou
   por isso TRÊS VEZES em 23 e 24/09 — a largura de 44px que nunca aplicou, a grade travada
   em cinco colunas, e estes quatro elementos do celular, que ficaram invisíveis a 375px
   com a media query casando e a regra escrita.

   Uso: node scripts/testar-planejamento-celular.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const codigo = tpl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; console.log('  ok  ' + nome); return; }
  falhas.push(nome);
  console.log('  FALHA  ' + nome + (porque ? '  — ' + porque : ''));
}
function igual(nome, veio, esperado, porque) {
  checar(nome, JSON.stringify(veio) === JSON.stringify(esperado),
    (porque ? porque + ' · ' : '') + 'esperava ' + JSON.stringify(esperado)
      + ', veio ' + JSON.stringify(veio));
}
function recortar(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe no template.'); process.exit(1); }
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return tpl.slice(i, j + 1);
}

console.log('');
console.log('1 · QUAL DIA A TELA ABRE');

(function () {
  const c = { Number: Number, String: String };
  vm.createContext(c);
  vm.runInContext(recortar('pl6DiaDaAba'), c);
  const qual = vm.runInContext('pl6DiaDaAba', c);
  const dias = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
    .map(function (iso) { return { iso: iso }; });

  igual('em dia útil, abre em hoje', qual(dias, null, '2026-09-23'), 2,
    'rolar meia tela até achar a quarta-feira é o que a Minha Daily poupava');
  igual('na segunda, abre na segunda', qual(dias, null, '2026-09-21'), 0);
  igual('na sexta, abre na sexta', qual(dias, null, '2026-09-25'), 4);
  igual('no sábado, abre na segunda', qual(dias, null, '2026-09-26'), 0,
    'hoje não está na semana montada; a segunda é o começo do que ele está planejando');
  igual('na semana que vem, também abre na segunda',
    qual(['2026-09-28', '2026-09-29'].map(function (i) { return { iso: i }; }), null, '2026-09-23'), 0);

  igual('mas a escolha dele manda', qual(dias, 3, '2026-09-23'), 3,
    'reabrir em hoje a cada redesenho faria olhar quinta-feira ser impossível');
  igual('e o zero é uma escolha, não "não escolheu"', qual(dias, 0, '2026-09-23'), 0,
    'testar `escolhido` por verdade em vez de por null jogaria a segunda-feira de volta '
      + 'para hoje a cada clique');
  igual('índice fora da semana cai em hoje', qual(dias, 9, '2026-09-23'), 2);
}());

checar('e o hoje entra por argumento, e não pela local de quem chama',
  /function pl6DiaDaAba\(dias, escolhido, hojeISO\)/.test(codigo)
    && /pl6DiaDaAba\(dias, s\.diaAba, hojeISOPl6\)/.test(codigo),
  '`hojeISOPl6` é um const DENTRO de pl6DadosFinal; a primeira versão desta função o lia '
    + 'de fora e derrubava o render com ReferenceError — a aba ficava branca no telefone');

console.log('');
console.log('2 · UM MARKUP SÓ, DOIS DESENHOS');

checar('a coluna do dia escolhido é marcada no atributo',
  /\$\{dia\.sel \? 'data-pl6-dia-sel="1"' : ''\}/.test(tpl)
    && /sel: di === diaAba,/.test(codigo),
  'é o que deixa o CSS escolher o desenho sem uma segunda tela');
checar('e o CSS esconde as outras quatro só no telefone',
  /#agendaContent \[data-pl6-dia-drop\]:not\(\[data-pl6-dia-sel\]\)\{display:none;\}/.test(tpl),
  'no desktop os cinco dias continuam lado a lado');
checar('não existe uma segunda função de render para o celular',
  !/function pl6TelaMovelHTML|function pl6TelaCelular/.test(tpl),
  'o mesmo dia montado em duas telas é a dívida que a Minha Daily vem pagar; criar outra '
    + 'aqui seria trocar uma por outra');

console.log('');
console.log('3 · A TIRA DE ABAS DIZ O QUE TEM EM CADA DIA');

checar('a aba de hoje mostra registrados sobre vencidos',
  /marca = \(vencidos\.length - semReg\) \+ '\/' \+ vencidos\.length;/.test(codigo),
  'aba que só mostra o nome do dia obriga a tocar em cinco para achar o trabalho');
checar('dia passado com pendência sai em vermelho, com bolinha',
  /marca = semReg \+ ' ●'; cor = '#C3152A';/.test(codigo),
  'é o único estado da tira que cobra alguma coisa');
checar('dia futuro mostra quantos tem, e dia vazio diz que está livre',
  /marca = String\(its\.length\); cor = '#2B3440';/.test(codigo)
    && /marca = passado \? '—' : 'livre';/.test(codigo),
  '"0" num dia que já passou lê como falha; "—" lê como o que é, nada planejado');
checar('e o cabeçalho só mostra a hora quando o dia é hoje',
  /diaAbaHoje: !!\(dias\[diaAba\] && dias\[diaAba\]\.iso === hojeISOPl6\)/.test(codigo)
    && /\$\{d\.diaAbaHoje \? `<span[^`]*\$\{d\.agoraTxt\}/.test(tpl),
  '"Quinta, 24/09 · 21:44" diria que são 21h44 de quinta, e não são');

console.log('');
console.log('4 · A PENDÊNCIA DE ONTEM E O BOTÃO DE ENCAIXAR');

checar('a pendência de ontem sobe para o topo no celular',
  /data-pl6-pend-movel="1"/.test(tpl)
    && /Sem check-in e sem registro, o gestor vê "não medido", não "não foi"/.test(tpl),
  'no desktop ela está na linha embaixo da grade; no celular a grade é um dia só, e o dia '
    + 'de ontem não está na tela');
checar('o botão leva até a munição, sem abrir nada novo',
  /if \(verbo === 'encaixar'\) \{/.test(codigo)
    && /box\.querySelector\('\[data-pl6-municao\]'\)/.test(codigo),
  'no telefone a munição fica depois da grade, fora da tela — e é a MESMA coluna do '
    + 'desktop, não uma segunda');
checar('e a aba escolhida é também o destino',
  /if \(verbo === 'diaaba'\) \{/.test(codigo) && /s\.diaAba = i;/.test(codigo),
  'duas variáveis para a mesma escolha deixariam o botão pondo a conta num dia diferente '
    + 'do que está na tela');

console.log('');
console.log('5 · O DESENHO DO CELULAR MORA NA FOLHA — INLINE VENCE FOLHA');

/* ══ A CHECAGEM QUE ESTA TELA MAIS PRECISA ═══════════════════════════════════════════
   Três vezes em dois dias: a largura de 44px que nunca aplicou, a grade travada em cinco
   colunas, e os quatro elementos do celular invisíveis a 375px. Sempre o mesmo padrão —
   quem decide entre dois desenhos é a media query, e um `display` no atributo style a
   vence em silêncio, com a regra escrita e a media query casando.
   Aqui: todo atributo que aparece numa regra de @media não pode trazer `display` inline. */
(function () {
  /* INLINE E FOLHA SÓ BRIGAM PELA MESMA PROPRIEDADE. `data-pl6-grade-semana` tem
     `display:grid` inline e o @media só troca `grid-template-columns` — isso não é
     conflito, é divisão de trabalho. O que mata é o @media declarar `display` para um
     atributo que já traz `display` no style. A primeira versão desta checagem reprovava
     os dois casos legítimos, e guarda que grita demais é guarda que alguém desliga. */
  const media = tpl.match(/@media[^{]*\{[\s\S]*?\n  \}/g) || [];
  const governados = new Map();   /* atributo -> Set de propriedades que o @media declara */
  media.forEach(function (bloco) {
    (bloco.match(/[^{}]+\{[^{}]*\}/g) || []).forEach(function (regra) {
      const corte = regra.indexOf('{');
      const sel = regra.slice(0, corte);
      const corpo = regra.slice(corte + 1).replace(/\}/g, '');
      const props = new Set((corpo.match(/(^|;)\s*([a-z-]+)\s*:/g) || [])
        .map(function (p) { return p.replace(/[^a-z-]/g, ''); }));
      (sel.match(/\[(data-pl6-[a-z-]+)\]/g) || []).forEach(function (a) {
        const attr = a.slice(1, -1);
        if (!governados.has(attr)) governados.set(attr, new Set());
        props.forEach(function (p) { governados.get(attr).add(p); });
      });
    });
  });
  checar('achei os atributos que o @media governa', governados.size >= 4,
    'sem eles a checagem abaixo mede o vazio · achei ' + governados.size);
  checar('e pelo menos um deles tem o display decidido pela folha',
    [...governados.values()].some(function (s) { return s.has('display'); }),
    'se nenhum tiver, a checagem de conflito abaixo nunca mede nada');

  const culpados = [];
  governados.forEach(function (props, attr) {
    if (!props.has('display')) return;
    const re = new RegExp('<[^>]*' + attr + '="[^"]*"[^>]*>', 'g');
    (tpl.match(re) || []).forEach(function (tag) {
      const st = tag.match(/style="([^"]*)"/);
      if (st && /(^|;)\s*display\s*:/.test(st[1])) {
        culpados.push(attr + ' :: ' + st[1].slice(0, 46));
      }
    });
  });
  checar('quem tem o display decidido pela folha não o traz no inline',
    culpados.length === 0,
    'inline vence folha, e esta tela pagou por isso três vezes em dois dias: a largura '
      + 'de 44px, a grade de cinco colunas e os quatro elementos do celular · '
      + JSON.stringify(culpados.slice(0, 3)));
}());

checar('e o estado inicial dos quatro do celular mora na folha',
  /#agendaContent \[data-pl6-cab-movel\],\s*\n\s*#agendaContent \[data-pl6-abas-dia\],\s*\n\s*#agendaContent \[data-pl6-pend-movel\],\s*\n\s*#agendaContent \[data-pl6-encaixar\]\{display:none;\}/.test(tpl),
  'escondê-los inline e mostrá-los pela folha é exatamente o defeito que esta suíte existe '
    + 'para não deixar voltar');

checar('as pílulas do "como foi?" viram duas colunas de 44px no telefone',
  /#agendaContent \[data-pl6-pill\]\{min-height:44px;flex:1 1 calc\(50% - 4px\);\}/.test(tpl),
  'quatro pílulas de 28px numa fileira dão 70px cada num telefone, e 70px com o dedo é o '
    + 'toque que erra');

console.log('');
console.log('planejamento · celular: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
