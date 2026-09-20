#!/usr/bin/env node
/* ============================================================================
   O COMPROMISSO DO 1:1: ETAPA PELO NOME E PRAZO QUE É CAMPO (19/09/26)

   Três defeitos MEDIDOS na tabela `narrativas` da semana 14–20/09, não deduzidos:

   1. Seis dos nove compromissos citam o ID cru da etapa — "os 12 negócios parados na
      etapa 1395880469". Bruno, Sandro, Renata, Luiz, André e Sérgio receberam assim.
      A raiz não era a IA: `data/hubspot.json` está no .gitignore desde 02/09, o runner
      nunca tem esse arquivo, e o try que lia dali SEMPRE caía no catch em produção.
      STAGE_LABELS ficava {} e o fallback era o número.

   2. O prazo do Sérgio dizia "quarta-feira, 24/09/2026". 24/09/2026 é quinta. A regra
      "o dia da semana tem que bater com a data" JÁ ESTAVA ESCRITA no prompt — instrução
      em prosa não segura isso. Agora a IA escreve só a data e o robô escreve o dia.

   3. O prazo só existia dentro da prosa. Sem campo, a aba Pessoas não consegue dizer o
      que venceu — que é justamente a manchete que o gestor abre na segunda.

   POR QUE `compromissos` CONTINUA ARRAY DE STRING: cinco leitores indexam nele, e
   `pdi_compromissos.checked[]` guarda a POSIÇÃO do que o executivo marcou. Trocar o tipo
   do elemento faria três telas imprimirem [object Object] e perderia o check de todo
   mundo. O prazo entra como array irmão, mesmo índice.

   Uso: node scripts/testar-compromisso-prazo.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const gerador = fs.readFileSync(path.join(raiz, 'scripts', 'generate-weekly-summary.js'), 'utf8');
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
/* A SUÍTE NÃO PODE MORRER NO LUGAR DE REPROVAR. A sabotagem "o scrub quebra em nulo"
   derrubou este arquivo com TypeError em vez de imprimir a linha vermelha — terceira vez
   nesta base. Toda chamada que pode estourar passa por aqui. */
function seguro(fn) {
  try { return fn(); } catch (e) { return '‹estourou: ' + e.message + '›'; }
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

/* ══ O AMBIENTE ═══════════════════════════════════════════════════════════════════════
   As duas funções rodam DE VERDADE, com os nomes de etapa reais do pipeline. Checar o
   texto do arquivo diria que o código existe; não diria que a quinta sai como quinta. */
const LABELS = {
  '1395880469': 'Prospecção', '1395880470': 'Conversa com Decisor',
  '1395880471': 'Demo/Proposta', '1395880472': 'Negociação',
  '1395880473': 'Ag. Pagamento', '1396005401': 'Visita',
  '1396006162': 'Ganho', '1398311191': 'Reciclagem'
};
const gritos = [];
const ctx = { STAGE_LABELS: LABELS, console: { error: m => gritos.push(String(m)), log: () => {} } };
vm.createContext(ctx);
vm.runInContext(recortar(gerador, 'trocarIdsDeEtapa'), ctx);
const iDias = gerador.indexOf('const DIAS_PT = [');
if (iDias < 0) { console.error('FALHA: DIAS_PT não existe.'); process.exit(1); }
vm.runInContext(gerador.slice(iDias, gerador.indexOf('];', iDias) + 2), ctx);
vm.runInContext(recortar(gerador, 'normalizarCompromissos'), ctx);

/* ══ 1. A ETAPA PELO NOME ═════════════════════════════════════════════════════════════ */

/* O TEXTO REAL DO BRUNO desta semana, copiado da tabela. */
igual('o ID cru da etapa vira o nome',
  ctx.trocarIdsDeEtapa('Dos 12 negócios parados na etapa 1395880469, escolha os 3'),
  'Dos 12 negócios parados na etapa Prospecção, escolha os 3',
  'seis das nove pessoas leram o número esta semana');

igual('e o do Sandro também', ctx.trocarIdsDeEtapa('os 10 negócios da etapa 1396005401'),
  'os 10 negócios da etapa Visita');

igual('mais de um ID na mesma frase',
  ctx.trocarIdsDeEtapa('de 1395880469 para 1395880471'),
  'de Prospecção para Demo/Proposta');

igual('texto sem ID passa intacto', ctx.trocarIdsDeEtapa('Ligue para o decisor amanhã.'),
  'Ligue para o decisor amanhã.');

igual('não quebra em nulo', seguro(() => ctx.trocarIdsDeEtapa(null)), null,
  'gargaloSemana e tendencia podem vir nulos quando a IA falha — o scrub não pode ser o '
    + 'que derruba a rodada');

/* A REDE TEM DE VALER PARA TODO TEXTO DA IA, não só o compromisso: o ID vazava igual no
   gargalo e no roteiro do 1:1, que são o que o gestor lê na tela. */
checar('o scrub cobre os cinco campos da IA',
  /gargaloSemana: trocarIdsDeEtapa\(/.test(gerador)
    && /comoAgirGestor: trocarIdsDeEtapa\(/.test(gerador)
    && /tendencia: trocarIdsDeEtapa\(/.test(gerador)
    && /resumoIndividual: trocarIdsDeEtapa\(/.test(gerador)
    && /comoAgirIndividual: \(resultado\.value\.comoAgirIndividual \|\| \[\]\)\.map\(trocarIdsDeEtapa\)/.test(gerador),
  'scrubbar só o compromisso deixaria o número na tela do gestor');

/* E A RAIZ: o arquivo local não existe no runner. */
checar('os nomes de etapa vêm do snapshot, não do arquivo ignorado',
  /const snap = await lerSnapshot\('hubspot'\);/.test(gerador)
    && /const labels = snap && snap\.stageMeta && snap\.stageMeta\.labels;/.test(gerador),
  'data/hubspot.json está no .gitignore desde 02/09 — ler só dele é ler o catch');

checar('e a rodada aborta se nenhuma das duas fontes tiver os nomes',
  /throw new Error\('sem nomes de etapa/.test(gerador),
  'seguir com o mapa vazio é exatamente o que colocou o número na tela de nove pessoas; '
    + 'rodada que morre se re-dispara, texto enviado não volta');

checar('e isso acontece antes de montar o contexto do prompt',
  gerador.indexOf('await carregarStageLabels();') > 0
    && gerador.indexOf('await carregarStageLabels();') < gerador.indexOf('repsContext = montarRepsContext();'),
  'montarRepsContext é quem transforma etapa dominante em contexto — carregar depois dele '
    + 'não corrige nada');

/* ══ 2. O PRAZO ═══════════════════════════════════════════════════════════════════════ */
const HOJE = '2026-09-19';   /* sexta */

/* O DEFEITO DO SÉRGIO, reproduzido: a IA pede 24/09 e chama de quarta. Agora ela só manda
   a data, e quem escreve o dia é o robô — então sai quinta. */
(function () {
  const r = ctx.normalizarCompromissos(
    [{ acao: 'Registre uma nota em cada negócio da etapa 1395880469', prazo: '2026-09-24' }], HOJE);
  igual('o dia da semana é calculado, não escrito pela IA', r.textos,
    ['Registre uma nota em cada negócio da etapa Prospecção — até <b>quinta-feira, 24/09</b>.'],
    '24/09/2026 é quinta; o texto real desta semana dizia quarta');
  igual('e o prazo sai como campo', r.prazos, ['2026-09-24'],
    'sem campo, a aba Pessoas não consegue dizer o que venceu');
}());

igual('segunda é segunda',
  ctx.normalizarCompromissos([{ acao: 'Ligue', prazo: '2026-09-21' }], HOJE).textos,
  ['Ligue — até <b>segunda-feira, 21/09</b>.']);

/* O PONTO FINAL DA IA não pode virar "Ligue. — até". */
igual('a ação que já termina em ponto não ganha dois',
  ctx.normalizarCompromissos([{ acao: 'Ligue para o decisor.', prazo: '2026-09-22' }], HOJE).textos,
  ['Ligue para o decisor — até <b>terça-feira, 22/09</b>.']);

/* O FUSO. O runner roda em UTC; um prazo de hoje não pode ser recusado por isso. */
igual('o prazo de hoje ainda vale',
  ctx.normalizarCompromissos([{ acao: 'Feche', prazo: HOJE }], HOJE).prazos, [HOJE],
  'compromisso "até hoje" é legítimo na sexta à noite; recusar seria perder o texto');

(function () {
  const r = ctx.normalizarCompromissos([{ acao: 'Feche o Salseiro', prazo: '2026-09-10' }], HOJE);
  igual('prazo no passado é recusado', r.prazos, [null],
    'prazo vencido no nascimento faria a tela abrir com um vencido falso');
  igual('mas a ação NÃO se perde', r.textos, ['Feche o Salseiro'],
    'jogar o compromisso fora por causa da data apagaria o plano da semana de alguém');
}());

igual('prazo com formato errado é recusado',
  ctx.normalizarCompromissos([{ acao: 'Feche', prazo: '24/09/2026' }], HOJE).prazos, [null],
  'a forma que um humano escreveria; o regex e o Date recusam os dois, de propósito');

/* MÊS 13 PASSA NO REGEX e deixa o Date inválido — e `new Date(NaN).toISOString()` ESTOURA.
   Sem o !isNaN antes da volta ao ISO, um prazo assim não seria recusado: derrubaria a
   rodada semanal inteira, para as nove pessoas. Já matei um robô assim nesta base. */
igual('mês 13 é recusado sem estourar',
  seguro(() => ctx.normalizarCompromissos([{ acao: 'Feche', prazo: '2026-13-45' }], HOJE).prazos),
  [null], 'a ordem das checagens é o que segura: regex, depois isNaN, só então toISOString');

/* ESTE É O CASO QUE A SABOTAGEM ME ENSINOU. Eu tinha escrito no comentário que o Date
   corrige a data impossível em silêncio, e não guardei contra isso — o teste passava
   porque a data que escolhi (31/02) estava no PASSADO e caía na outra regra. Medido:
   new Date('2026-11-31T12:00:00Z') devolve 01/12/2026, válido e errado. Agora a data é
   FUTURA, então só a volta ao ISO pode recusá-la. */
igual('data que não existe no calendário é recusada',
  ctx.normalizarCompromissos([{ acao: 'Feche', prazo: '2026-11-31' }], HOJE).prazos, [null],
  '31/11 vira 01/12 sem erro nenhum — um compromisso venceria um dia depois do combinado');

checar('e cada recusa grita no log', gritos.length >= 3,
  'prazo perdido em silêncio é defeito que ninguém vê até a tela mentir');

/* A FORMA ANTIGA CONTINUA VALENDO. A IA pode devolver string; formato novo que derruba o
   texto de alguém seria pior do que o defeito que ele corrige. */
(function () {
  const r = ctx.normalizarCompromissos(['Ligue para o decisor da etapa 1395880470'], HOJE);
  igual('string pura ainda entra', r.textos, ['Ligue para o decisor da etapa Conversa com Decisor']);
  igual('sem prazo, mas na mesma posição', r.prazos, [null],
    'os dois arrays têm de andar no mesmo índice ou o vencido aponta para o compromisso errado');
}());

igual('lista vazia não quebra', ctx.normalizarCompromissos([], HOJE), { textos: [], prazos: [] });
igual('nem lista ausente', ctx.normalizarCompromissos(undefined, HOJE), { textos: [], prazos: [] });
igual('item sem ação some', ctx.normalizarCompromissos([{ acao: '  ', prazo: '2026-09-22' }], HOJE),
  { textos: [], prazos: [] }, 'compromisso vazio com prazo seria uma linha em branco vencendo');

(function () {
  const r = ctx.normalizarCompromissos([
    { acao: 'Um', prazo: '2026-09-22' },
    { acao: 'Dois', prazo: 'lixo' },
    { acao: 'Três', prazo: '2026-09-25' }
  ], HOJE);
  igual('os dois arrays têm sempre o mesmo tamanho', [r.textos.length, r.prazos.length], [3, 3]);
  igual('e o índice do meio guarda o buraco', r.prazos, ['2026-09-22', null, '2026-09-25'],
    'array irmão que encolhe desalinha tudo depois dele — e checked[] de pdi_compromissos '
      + 'também indexa por posição');
}());

/* ══ 3. O QUE VAI PARA O BANCO ════════════════════════════════════════════════════════ */
checar('narrativas recebe o texto e o prazo lado a lado',
  /narrativas\.reps\[ownerId\]\.compromissos = c\.compromissos\.textos;/.test(gerador)
    && /narrativas\.reps\[ownerId\]\.compromissosPrazo = c\.compromissos\.prazos;/.test(gerador));

/* O CONTRATO COM OS LEITORES. Esta é a checagem que me impede de "melhorar" o formato
   daqui a um mês e derrubar três telas de uma vez. */
checar('compromissos continua sendo array de STRING',
  gerador.indexOf('narrativas.reps[ownerId].compromissos = c.compromissos.textos;') > 0
    && gerador.indexOf('narrativas.reps[ownerId].compromissos = c.compromissos;') < 0,
  'gravar o objeto faria o PDI do executivo, os combinados do gestor e a aba Pessoas '
    + 'imprimirem [object Object]');

checar('e os leitores da tela continuam tratando o item como texto',
  /sel\.compromissos\.map\(function \(txt, i\)/.test(tpl)
    && /r\.compromissos\.map\(\(c, ci\)/.test(tpl),
  'se algum deles passar a esperar objeto, o outro quebra — eles leem o MESMO array');

/* ══ 4. O PROMPT ══════════════════════════════════════════════════════════════════════ */
checar('o prompt pede a data no campo, em AAAA-MM-DD',
  /"prazo": "AAAA-MM-DD"/.test(gerador));

checar('e proíbe escrever data ou dia da semana na ação',
  /NÃO escreva data nem dia da semana dentro de/.test(gerador),
  'foi a instrução em prosa que falhou — mas deixar o pedido ambíguo faria a IA escrever '
    + 'a data duas vezes, uma delas errada');

checar('a regra antiga do dia da semana saiu',
  gerador.indexOf('o dia da\n  semana escrito tem que bater com a data escrita') < 0
    && gerador.indexOf('semana escrito tem que bater com a data escrita') < 0,
  'manter as duas regras deixaria a IA escolher qual seguir');

checar('e o prompt pede a etapa pelo nome',
  /cite a etapa pelo NOME/.test(gerador));

console.log('');
console.log('compromisso com prazo: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(f => console.log('  ✗ ' + f));
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
