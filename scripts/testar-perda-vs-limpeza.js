#!/usr/bin/env node
/* ============================================================================
   PERDA UMA A UMA x LIMPEZA EM LOTE (19/09/26)

   Julyan, confirmando o que eu perguntei sobre as 65 perdas da semana 14–18/09:
   "eles limparam o funil mesmo".

   O COCKPIT CONTAVA FAXINA COMO DERROTA. Eu mesmo, com o banco na mão, li a semana
   como um desastre onde houve o melhor resultado recente (6 ganhos contra 2). Se
   acontece comigo, acontece na reunião de segunda.

   NÃO DÁ PARA CRIAR UM MOTIVO "LIMPEZA" NO HUBSPOT — `motivo_do_perdido` é configuração
   do CRM e a regra da casa é não tocar nela. O que dá é medir a CADÊNCIA da marcação:
   perda de verdade acontece uma de cada vez, limpeza acontece numa sentada.

   ESTA SUÍTE RODA `lotesDePerda` DE VERDADE, em vm, inclusive contra os 65 closedates
   REAIS da semana. Uma checagem de texto não diria se o agrupamento funciona — e o
   agrupamento é a única coisa que importa aqui.

   O LIMITE, DECLARADO: nenhum limiar separa perfeitamente. Calibrado nos 65 reais,
   5min dá 37, 10min dá 40, 15min dá 45, 20min dá 47. Por isso a tela escreve a régua e
   usa a palavra "provável", e por isso o total NUNCA é reduzido.

   Uso: node scripts/testar-perda-vs-limpeza.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const robo = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-weekly-comparison.js'), 'utf8');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
}
function igual(nome, veio, esperado, porque) {
  checar(nome, JSON.stringify(veio) === JSON.stringify(esperado),
    (porque ? porque + ' · ' : '') + 'esperava ' + JSON.stringify(esperado)
      + ', veio ' + JSON.stringify(veio));
}

function recortar(fonte, nome) {
  const assinatura = 'function ' + nome + '(';
  const i = fonte.indexOf(assinatura);
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe.'); process.exit(1); }
  if (fonte.indexOf(assinatura, i + 1) > 0) {
    console.error('FALHA: ' + nome + ' aparece duas vezes.'); process.exit(1);
  }
  let d = 0, j = i, viu = false;
  while (j < fonte.length) {
    const c = fonte[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return fonte.slice(i, j + 1);
}
function constante(fonte, nome) {
  const decl = 'const ' + nome + ' = ';
  const i = fonte.indexOf(decl);
  if (i < 0) { console.error('FALHA: não achei ' + nome); process.exit(1); }
  return fonte.slice(i, fonte.indexOf('\n', i));
}

/* A RÉGUA VIROU MÓDULO em 19/09, quando o gráfico de motivos (robô DIÁRIO) passou a
   precisar dela — antes vivia dentro do robô semanal e esta suíte a recortava com vm.
   Importar é mais forte que recortar: mede o que os dois robôs realmente carregam, e
   não uma cópia do texto. O `vm` continua aqui só para a função de tela. */
const LOTES = require(path.join(raiz, 'lib', 'lotes-de-perda.js'));
const ctx = { lotesDePerda: LOTES.lotesDePerda,
  __r: { gap: LOTES.LOTE_GAP_MIN, min: LOTES.LOTE_MINIMO } };

const T0 = Date.parse('2026-09-18T13:00:00.000Z');
const neg = (owner, minutos, nome) => ({ properties: {
  hubspot_owner_id: owner, closedate: new Date(T0 + minutos * 60000).toISOString(),
  dealname: nome || ('n' + minutos) } });

/* ══ 1. A RÉGUA ════════════════════════════════════════════════════════════════════ */
igual('a régua é 5 marcações em até 15 minutos', [ctx.__r.min, ctx.__r.gap], [5, 15],
  'calibrado nos 65 perdidos reais de 14–18/09; mudar aqui muda o número da tela, e a '
    + 'tela escreve a régua junto justamente por isso');

/* FONTE ÚNICA. A régua serve ao KPI da Semana (robô semanal) e ao gráfico de motivos
   (robô diário). Duas cópias seriam duas respostas para a mesma pergunta em duas
   telas — este projeto já tem histórico disso com os ids de etapa e com o || 10 da
   meta. Os dois robôs têm de IMPORTAR, nunca redefinir. */
const diario = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8');
checar('a régua existe uma vez só, na lib',
  robo.indexOf('function lotesDePerda(') < 0 && diario.indexOf('function lotesDePerda(') < 0,
  'redefinir num dos robôs faz a Semana e o gráfico de motivos discordarem sobre o que '
    + 'é um lote, e ninguém percebe porque as duas telas parecem certas');
checar('e os dois robôs a importam',
  /require\(['"]\.\.\/lib\/lotes-de-perda\.js['"]\)/.test(robo)
    && /require\(['"]\.\.\/lib\/lotes-de-perda\.js['"]\)/.test(diario));

/* ══ 2. O AGRUPAMENTO ══════════════════════════════════════════════════════════════ */
(function () {
  const cinco = ctx.lotesDePerda([neg('A', 0), neg('A', 1), neg('A', 2), neg('A', 3), neg('A', 4)]);
  igual('cinco marcações seguidas são um lote', cinco.emLote, 5);
  igual('e sai um lote só', cinco.lotes.length, 1);

  const quatro = ctx.lotesDePerda([neg('A', 0), neg('A', 1), neg('A', 2), neg('A', 3)]);
  igual('quatro não são', quatro.emLote, 0,
    'o mínimo é 5 — abaixo disso é indistinguível de três perdas seguidas de verdade');

  /* O ENCADEAMENTO é o que faz a sessão longa contar. A da Kelly em 16/09 são sete
     marcações espalhadas por uma hora, com intervalos de 5 a 13 minutos: uma janela
     fixa de 15 min perderia; o encadeamento pega. */
  const longa = ctx.lotesDePerda([neg('A', 0), neg('A', 14), neg('A', 28), neg('A', 42),
    neg('A', 56), neg('A', 70)]);
  igual('seis marcações encadeadas de 14 em 14 min são UM lote', longa.emLote, 6,
    'sessão longa com intervalos curtos é uma sentada só');

  const partida = ctx.lotesDePerda([neg('A', 0), neg('A', 1), neg('A', 2),
    neg('A', 30), neg('A', 31), neg('A', 32)]);
  igual('um intervalo maior que a régua QUEBRA o grupo', partida.emLote, 0,
    'dois grupos de três não somam um lote de seis');
}());

/* ══ 3. UM DONO NÃO EMPRESTA LOTE PARA O OUTRO ═════════════════════════════════════ */
(function () {
  const misto = ctx.lotesDePerda([
    neg('A', 0), neg('B', 1), neg('A', 2), neg('B', 3), neg('A', 4),
    neg('B', 5), neg('A', 6), neg('B', 7), neg('A', 8), neg('B', 9)
  ]);
  igual('dez marcações intercaladas viram DOIS lotes de cinco', misto.lotes.length, 2);
  igual('e cada um tem o seu dono',
    misto.lotes.map(function (l) { return l.ownerId; }).sort(), ['A', 'B']);

  const soUm = ctx.lotesDePerda([neg('A', 0), neg('A', 1), neg('A', 2),
    neg('B', 3), neg('B', 4)]);
  igual('e o agrupamento NÃO mistura donos para fechar o mínimo', soUm.emLote, 0,
    'cinco marcações no mesmo minuto por DUAS pessoas não são uma faxina de ninguém');
}());

/* ══ 4. OS SESSENTA E CINCO DE VERDADE ═════════════════════════════════════════════
   Os closedates reais da semana 14–18/09, lidos do HubSpot. É o único teste que prova
   que a régua escolhida descreve a operação, e não um cenário que eu inventei. */
const REAIS = [
  ['S', '2026-09-14T12:09:29.284Z'], ['K', '2026-09-14T12:15:06.348Z'],
  ['K', '2026-09-14T12:15:26.512Z'], ['K', '2026-09-14T12:50:04.435Z'],
  ['S', '2026-09-15T11:33:28.473Z'], ['S', '2026-09-15T11:35:09.237Z'],
  ['S', '2026-09-15T11:35:24.488Z'], ['S', '2026-09-15T11:35:38.205Z'],
  ['S', '2026-09-15T11:35:53.690Z'], ['S', '2026-09-15T11:36:09.595Z'],
  ['S', '2026-09-15T11:36:25.272Z'], ['B', '2026-09-16T11:57:09.371Z'],
  ['K', '2026-09-16T13:41:09.539Z'], ['K', '2026-09-16T13:41:17.774Z'],
  ['K', '2026-09-16T14:14:04.439Z'], ['K', '2026-09-16T14:22:28.779Z'],
  ['K', '2026-09-16T14:27:19.637Z'], ['K', '2026-09-16T14:30:31.286Z'],
  ['K', '2026-09-16T14:43:57.526Z'], ['S', '2026-09-17T13:18:25.396Z'],
  ['S', '2026-09-17T13:28:25.710Z'], ['S', '2026-09-17T14:38:11.532Z'],
  ['S', '2026-09-17T14:38:32.655Z'], ['S', '2026-09-17T14:38:53.978Z'],
  ['S', '2026-09-17T14:39:06.353Z'], ['S', '2026-09-17T14:39:14.534Z'],
  ['S', '2026-09-17T14:39:49.253Z'], ['S', '2026-09-17T14:40:10.435Z'],
  ['S', '2026-09-17T14:55:47.607Z'], ['S', '2026-09-17T15:05:17.024Z'],
  ['K', '2026-09-17T18:03:57.357Z'], ['B', '2026-09-17T23:40:16.188Z'],
  ['K', '2026-09-18T10:41:25.540Z'], ['K', '2026-09-18T10:41:47.548Z'],
  ['K', '2026-09-18T10:42:41.532Z'], ['K', '2026-09-18T10:43:32.106Z'],
  ['K', '2026-09-18T10:43:56.334Z'], ['K', '2026-09-18T10:54:01.885Z'],
  ['K', '2026-09-18T10:54:51.690Z'], ['K', '2026-09-18T10:55:09.174Z'],
  ['K', '2026-09-18T10:55:33.268Z'], ['K', '2026-09-18T10:56:09.955Z'],
  ['K', '2026-09-18T10:56:51.937Z'], ['K', '2026-09-18T11:01:26.424Z'],
  ['K', '2026-09-18T11:01:47.808Z'], ['K', '2026-09-18T11:02:00.838Z'],
  ['K', '2026-09-18T11:02:51.064Z'], ['K', '2026-09-18T11:04:06.016Z'],
  ['S', '2026-09-18T11:39:18.238Z'], ['K', '2026-09-18T14:07:02.892Z'],
  ['K', '2026-09-18T18:35:16.877Z'], ['S', '2026-09-18T18:36:40.410Z'],
  ['S', '2026-09-18T18:43:56.182Z'], ['S', '2026-09-18T18:45:20.669Z'],
  ['S', '2026-09-18T18:54:30.158Z'], ['S', '2026-09-18T18:55:15.169Z'],
  ['S', '2026-09-18T18:55:36.174Z'], ['S', '2026-09-18T18:55:54.111Z'],
  ['S', '2026-09-18T18:56:16.734Z'], ['S', '2026-09-18T18:56:36.014Z'],
  ['S', '2026-09-18T18:58:07.551Z'], ['S', '2026-09-18T19:30:38.943Z'],
  ['B', '2026-09-18T20:52:03.197Z'], ['B', '2026-09-18T20:52:20.224Z'],
  ['B', '2026-09-18T20:52:35.882Z']
].map(function (r) {
  return { properties: { hubspot_owner_id: r[0], closedate: r[1], dealname: 'real' } };
});

(function () {
  igual('a amostra real tem os 65 da semana', REAIS.length, 65);
  const r = ctx.lotesDePerda(REAIS);
  igual('a régua acha 45 dos 65 em lote', r.emLote, 45,
    'foi assim que a semana passou de "65 perdas" para "20 perdas e uma faxina"');
  igual('em cinco sessões', r.lotes.length, 5);
  /* `(r.lotes[0] || {})` E NÃO `r.lotes[0]`: com zero lotes o acesso direto lança e a
     SUÍTE estoura em vez de reprovar — foi o que aconteceu numa sabotagem, e harness que
     quebra não diz qual guarda pegou o quê. É a segunda vez que este erro me pega. */
  const maior = r.lotes[0] || {};
  igual('e a maior é a da Kelly em 18/09, com 16',
    [maior.ownerId, maior.n], ['K', 16],
    'a sessão dela vai das 10:41 às 11:04 — 23 minutos, encadeada');

  /* E O QUE A RÉGUA NÃO PEGA, cravado para ninguém achar que ela é exata: as três
     marcações do Bruno em 32 segundos no dia 18 são uma sentada evidente e ficam de
     fora, porque são só três. */
  const bruno = r.lotes.filter(function (l) { return l.ownerId === 'B'; });
  igual('e ela NÃO pega as três do Bruno em 32 segundos', bruno.length, 0,
    'limite conhecido: abaixo do mínimo, faxina e perda ficam indistinguíveis — por isso '
      + 'a tela escreve a régra e diz "provável" em vez de afirmar');
}());

/* ══ 4b. OS DOIS FORMATOS QUE OS CHAMADORES TÊM EM MÃOS ════════════════════════════
   O robô semanal passa o objeto CRU do HubSpot (com `properties`); quem tiver o
   objeto já achatado não deve precisar remontá-lo só para chamar a régua — remontar é
   onde o campo errado entra. */
(function () {
  const cru = [0, 1, 2, 3, 4].map(function (m) {
    return { id: 'c' + m, properties: { hubspot_owner_id: 'A',
      closedate: new Date(T0 + m * 60000).toISOString() } };
  });
  const achatado = [0, 1, 2, 3, 4].map(function (m) {
    return { id: 'p' + m, ownerId: 'A', closedate: new Date(T0 + m * 60000).toISOString() };
  });
  igual('o objeto cru do HubSpot agrupa', ctx.lotesDePerda(cru).emLote, 5);
  igual('e o objeto já achatado também', ctx.lotesDePerda(achatado).emLote, 5,
    'sem isto, quem tem o lead do snapshot precisaria remontar properties à mão');

  /* DOIS DONOS NO FORMATO ACHATADO, e esta é a fixture que PROVA que o campo é lido:
     com cinco de um dono só, tirar o fallback de `ownerId` joga todos em 'sem-dono' e
     eles continuam agrupando — o teste passava verde com o campo ignorado. Com três de
     cada, ler o dono dá ZERO lotes e ignorá-lo dá um lote de seis. */
  const doisDonos = ['A', 'A', 'A', 'B', 'B', 'B'].map(function (o, i) {
    return { id: 'd' + i, ownerId: o, closedate: new Date(T0 + i * 60000).toISOString() };
  });
  igual('e o dono do objeto achatado é REALMENTE lido', ctx.lotesDePerda(doisDonos).emLote, 0,
    'três de cada não fecham o mínimo; se o campo for ignorado, os seis viram um lote só');

  /* O CONJUNTO DE IDS é o que permite quebrar o lote POR MOTIVO no gráfico: sem ele, o
     robô diário teria que reimplementar o agrupamento para saber quem entrou. */
  igual('a régua devolve quem entrou em lote, por id',
    Object.keys(ctx.lotesDePerda(cru).ids).sort(), ['c0', 'c1', 'c2', 'c3', 'c4']);
  igual('e não marca quem ficou de fora',
    Object.keys(ctx.lotesDePerda([cru[0], cru[1]]).ids).length, 0);
}());

/* ══ 5. OS RAMOS DEFENSIVOS ════════════════════════════════════════════════════════ */
(function () {
  igual('lista vazia não estoura', ctx.lotesDePerda([]).emLote, 0);
  igual('e devolve lotes vazios', ctx.lotesDePerda([]).lotes, []);
  const sujo = ctx.lotesDePerda([
    { properties: { hubspot_owner_id: 'A', closedate: 'nao-e-data', dealname: 'x' } },
    { properties: { hubspot_owner_id: 'A', dealname: 'sem data' } },
    neg('A', 0), neg('A', 1), neg('A', 2), neg('A', 3), neg('A', 4)
  ]);
  igual('data ilegível é descartada, e o resto continua contando', sujo.emLote, 5,
    'um closedate estranho não pode derrubar a contagem da semana inteira');
}());

/* ══ 6. O TOTAL NUNCA É REDUZIDO ═══════════════════════════════════════════════════
   A regra de honestidade desta feature: o lote é LEITURA ao lado do número, nunca uma
   subtração. Reclassificar em silêncio trocaria um número errado por outro, porque a
   inferência é por horário de marcação e não por intenção declarada. */
(function () {
  checar('o perdidos do KPI continua sendo o total do servidor',
    /const perdidos = perdidosResultado\.total;/.test(robo),
    'se virar `total - emLote`, o placar passa a esconder perda de verdade');
  checar('e os sozinhos são uma SUBTRAÇÃO declarada, com piso em zero',
    /perdidosSozinhos: Math\.max\(0, perdidos - lote\.emLote\)/.test(robo),
    'sem o piso, um lote maior que o total da página daria número negativo na tela');
  checar('a régua usada viaja junto com o número',
    /loteRegra: \{ gapMin: LOTE_GAP_MIN, minimo: LOTE_MINIMO \}/.test(robo),
    'a tela escreve a régua; se ela não vier do robô, a frase pode divergir do que foi medido');
  checar('e a tela sabe quando o detalhe está incompleto',
    /completo: deals\.length >= total/.test(robo)
      && /perdidosDetalheCompleto: atual\.perdidosDetalheCompleto/.test(robo),
    'acima de 100 na janela a contagem segue certa e o lote fica parcial — e isso precisa '
      + 'aparecer, senão a tela afirma uma faxina menor do que foi');
}());

/* ══ 7. A FRASE NA TELA ════════════════════════════════════════════════════════════ */
(function () {
  const ctx2 = { console: console };
  vm.createContext(ctx2);
  vm.runInContext(recortar(tpl, 'sm5NotaDeLimpeza'), ctx2);

  igual('sem lote, não há nota', ctx2.sm5NotaDeLimpeza({ perdidos: 9, perdidosEmLote: 0 }), null,
    'KPI que sempre carrega uma nota vira KPI cuja nota ninguém lê');
  igual('sem dado nenhum, também não', ctx2.sm5NotaDeLimpeza(null), null);

  const nota = ctx2.sm5NotaDeLimpeza({ perdidos: 65, perdidosEmLote: 45,
    loteRegra: { gapMin: 15, minimo: 5 }, perdidosDetalheCompleto: true });
  checar('a nota diz quantos', /^45 em lote/.test(nota), 'veio: ' + nota);
  checar('e diz a RÉGRA que o robô usou', /5\+ em 15 min/.test(nota),
    'sem a régua o gestor não tem como julgar o número · veio: ' + nota);
  checar('e usa a palavra provável', /provável limpeza de base/.test(nota),
    'marcação em rajada é indício forte e não é prova · veio: ' + nota);
  checar('a nota NÃO afirma que foi limpeza', nota.indexOf('foi limpeza') < 0,
    'afirmar intenção a partir de horário é o oposto do que esta base faz');

  const parcial = ctx2.sm5NotaDeLimpeza({ perdidos: 140, perdidosEmLote: 90,
    loteRegra: { gapMin: 15, minimo: 5 }, perdidosDetalheCompleto: false });
  checar('e avisa quando o detalhe passou de 100', /detalhe parcial acima de 100/.test(parcial),
    'veio: ' + parcial);

  const semRegra = ctx2.sm5NotaDeLimpeza({ perdidos: 10, perdidosEmLote: 6 });
  checar('sem a régua no snapshot, a frase não inventa uma',
    /marcados em sequência/.test(semRegra) && semRegra.indexOf('+ em') < 0,
    'snapshot velho não pode fazer a tela afirmar uma régua que não foi usada · veio: ' + semRegra);

  checar('e o KPI de perdidos lê a nota',
    /nota: sm5NotaDeLimpeza\(k\)/.test(tpl),
    'campo emitido e nunca lido é a dívida que esta base já tem treze vezes');
}());

/* ══ 8. O GRÁFICO DE MOTIVOS ═══════════════════════════════════════════════════════
   Julyan: "faz no gráfico de motivos também". "Outros" e "Não quer mudar de sistema"
   lideram os 90 dias — e boa parte é o rótulo que sobra quando alguém descarta em
   lote um lead que nunca recebeu contato. O gestor lia aquilo como objeção de
   mercado. */
checar('o robô diário quebra o lote POR MOTIVO',
  /const lote = LOTES\.lotesDePerda\(validos\);/.test(diario)
    && /emLotePorMotivo\[m\] = \(emLotePorMotivo\[m\] \|\| 0\) \+ 1;/.test(diario),
  'sem a quebra por motivo, a tela só saberia o total e não daria para ver QUAL motivo '
    + 'está inflado pela faxina');

checar('e usa o conjunto de ids da régua, sem reimplementar o agrupamento',
  /if \(!lote\.ids\[String\(d\.id\)\]\) return;/.test(diario),
  'reimplementar aqui seria a segunda definição de lote');

checar('o total de cada motivo NÃO é reduzido',
  /porMotivo\[motivo\] = \(porMotivo\[motivo\] \|\| 0\) \+ 1;/.test(diario)
    && diario.indexOf('porMotivo[motivo] -= ') < 0,
  'a barra continua do tamanho que é; o lote é uma faixa DENTRO dela');

checar('a régua usada viaja com os motivos',
  /loteRegra: lote\.regra/.test(diario),
  'a legenda escreve a régua; se ela não vier do robô, a frase pode divergir do medido');

/* A TELA */
checar('a barra sabe desenhar a faixa do lote',
  /const barra = function \(rot, n, pct, cor, cauda, lote\) \{/.test(tpl)
    && /const pctLote = \(lote > 0 && n > 0\)/.test(tpl),
  'sem o parâmetro, o dado chega ao front e morre lá');

checar('e o bloco 6 PASSA o lote para ela',
  /return barra\(x\.rot, x\.n, x\.pct, x\.cor, tm10Rs\(x\.mrr\), x\.lote\);/.test(tpl),
  'campo emitido e nunca lido é a dívida que esta base já tem treze vezes');

checar('tm10Perdas lê emLotePorMotivo',
  /const emLote = mp\.emLotePorMotivo \|\| \{\};/.test(tpl)
    && /lote: emLote\[k\] \|\| 0/.test(tpl));

checar('o total do lote vem do gráfico inteiro, não da soma das 5 linhas',
  /emLote: Number\(mp\.emLoteTotal \|\| 0\)/.test(tpl),
  'o gráfico mostra os 5 maiores motivos e a frase fala dos 90 dias todos — somar as '
    + 'linhas daria um número menor sem ninguém perceber');

(function () {
  const ctx3 = { esc: function (s) { return String(s); }, console: console };
  vm.createContext(ctx3);
  vm.runInContext(recortar(tpl, 'tm10LegendaDeLimpeza'), ctx3);
  igual('sem lote, não há legenda', ctx3.tm10LegendaDeLimpeza({ emLote: 0 }), '',
    'legenda que aparece sempre explica o nada quando não há faixa na tela');
  igual('sem dado nenhum, também não', ctx3.tm10LegendaDeLimpeza(null), '');
  const leg = ctx3.tm10LegendaDeLimpeza({ emLote: 380, totalGeral: 972,
    loteRegra: { gapMin: 15, minimo: 5 }, loteSessoes: 24 });
  checar('a legenda diz quantos de quantos', /380 de 972 marcados em lote/.test(leg),
    'veio: ' + leg);
  checar('e a régua', /5\+ em 15 min/.test(leg), 'veio: ' + leg);
  checar('e quantas sessões', /em 24 sessões/.test(leg), 'veio: ' + leg);
  checar('e diz que é provável, e o que NÃO é',
    /provável limpeza de base, não objeção de mercado/.test(leg),
    'é essa a frase que muda a leitura do gráfico · veio: ' + leg);
}());

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('perda x limpeza: ' + ok + ' checagens ok — a régua acha 45 dos 65 reais, '
  + 'o total nunca é reduzido e a tela escreve a régua em vez de afirmar intenção.');
