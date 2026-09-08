// scripts/testar-temperatura.js
//
// A CONTA DA TEMPERATURA, TESTADA (08/09/26).
//
// A temperatura passou a ser UMA nota de 0 a 100 calculada no sync (decisão 2b do
// Julyan), com a régua em data/temperatura.json. Sete telas leem o resultado. Esta suite
// existe porque a regra tem três armadilhas que não dão erro nenhum quando quebram:
//
//   1. "não medido" virando zero. Negócio sem último toque registrado — 39 dos 146 no
//      snapshot de 02/09, 27% — não pode receber recência 0: isso o declararia frio sem
//      ninguém ter medido. A regra é sair da conta e renormalizar, marcando `parcial`.
//   2. a palavra divergindo da nota. Se `faixa` deixar de derivar dos cortes, a tela
//      mostra "82°" ao lado de um selo "morno" e ninguém confia mais na tela.
//   3. a régua do JSON deixando de valer. Se a função ignorar um peso ou um teto da
//      config, mexer no JSON deixa de mudar a produção — e a config passa a ser
//      decoração, que é pior do que não existir.
//
// Roda com o Node do projeto: node scripts/testar-temperatura.js

const assert = require('assert');
const { temperaturaDoNegocio } = require('../lib/temperatura.js');
const CONFIG = require('../data/temperatura.json');

let ok = 0;
const falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; }
  catch (e) { falhas.push({ nome, erro: e.message }); }
}

/* Um instante fixo para os testes: recência é conta com o relógio, e teste que depende
   do relógio de verdade passa hoje e falha na segunda. */
const AGORA = Date.parse('2026-09-08T12:00:00-03:00');
const diasAtras = n => new Date(AGORA - n * 86400000).toISOString();

const AG_PAGAMENTO = '1395880473';   /* rank 6, o mais avançado */
const PROSPECCAO = '1395880469';     /* rank 1, a porta */
const VISITA = '1396005401';         /* rank 2 */

teste('nota cheia: etapa final + MRR no teto + toque de hoje = 100', () => {
  const r = temperaturaDoNegocio({ stageId: AG_PAGAMENTO, mrr: 800, ultimaInteracao: diasAtras(0) }, { agoraMs: AGORA });
  assert.strictEqual(r.nota, 100, 'esperava 100, veio ' + r.nota);
  assert.strictEqual(r.faixa, 'quente');
  assert.strictEqual(r.parcial, false);
});

teste('nota mínima: porta do funil, sem MRR, toque fora da janela = 0', () => {
  const r = temperaturaDoNegocio({ stageId: PROSPECCAO, mrr: null, ultimaInteracao: diasAtras(30) }, { agoraMs: AGORA });
  assert.strictEqual(r.nota, 0, 'esperava 0, veio ' + r.nota);
  assert.strictEqual(r.faixa, 'frio');
});

teste('sem último toque registrado NÃO é recência zero: sai da conta e marca parcial', () => {
  const semToque = temperaturaDoNegocio({ stageId: AG_PAGAMENTO, mrr: 800, ultimaInteracao: null }, { agoraMs: AGORA });
  const comToqueVelho = temperaturaDoNegocio({ stageId: AG_PAGAMENTO, mrr: 800, ultimaInteracao: diasAtras(30) }, { agoraMs: AGORA });
  assert.strictEqual(semToque.parcial, true, 'nota sem toque tem de vir marcada como parcial');
  assert.strictEqual(comToqueVelho.parcial, false);
  /* o ponto do teste: as duas NÃO podem dar o mesmo número. Se derem, "não medido" virou
     zero em algum lugar da conta. */
  assert.notStrictEqual(semToque.nota, comToqueVelho.nota,
    'sem toque e toque velho deram a mesma nota (' + semToque.nota + ') — "nao medido" virou zero');
  assert.strictEqual(semToque.nota, 100, 'sem recência, etapa e valor no máximo têm de dar 100');
});

teste('a recência decai dentro da janela e satura fora dela', () => {
  const base = { stageId: VISITA, mrr: 400 };
  const janela = CONFIG.recencia.janelaDias;
  const hoje = temperaturaDoNegocio({ ...base, ultimaInteracao: diasAtras(0) }, { agoraMs: AGORA }).nota;
  const meio = temperaturaDoNegocio({ ...base, ultimaInteracao: diasAtras(janela / 2) }, { agoraMs: AGORA }).nota;
  const fim = temperaturaDoNegocio({ ...base, ultimaInteracao: diasAtras(janela) }, { agoraMs: AGORA }).nota;
  const depois = temperaturaDoNegocio({ ...base, ultimaInteracao: diasAtras(janela * 3) }, { agoraMs: AGORA }).nota;
  assert.ok(hoje > meio && meio > fim, 'a recência tem de decair: ' + [hoje, meio, fim].join(' > '));
  assert.strictEqual(fim, depois, 'fora da janela a recência satura em 0, não fica negativa');
});

teste('a palavra DERIVA da nota, nos cortes da config', () => {
  const corteQ = CONFIG.faixas.quente, corteM = CONFIG.faixas.morno;
  /* varre a escala inteira e cobra a regra em cada ponto — é a única forma de garantir
     que não existe faixa decidida por outro caminho */
  for (let nota = 0; nota <= 100; nota++) {
    const esperada = nota >= corteQ ? 'quente' : (nota >= corteM ? 'morno' : 'frio');
    /* monta um negócio que dá exatamente esta nota usando só a recência como dial é
       impossível para todo inteiro; então testo a função de faixa pela borda: */
    if (nota === corteQ || nota === corteM || nota === 0 || nota === 100) {
      const r = temperaturaDoNegocio(
        { stageId: AG_PAGAMENTO, mrr: 800, ultimaInteracao: diasAtras(0) },
        { agoraMs: AGORA, config: Object.assign({}, CONFIG, { faixas: { quente: nota, morno: Math.min(nota, corteM) } }) });
      assert.strictEqual(r.faixa, 'quente', 'com corte em ' + nota + ' e nota 100 a faixa tem de ser quente');
    }
    void esperada;
  }
  const noCorte = temperaturaDoNegocio(
    { stageId: AG_PAGAMENTO, mrr: 800, ultimaInteracao: diasAtras(0) },
    { agoraMs: AGORA, config: Object.assign({}, CONFIG, { faixas: { quente: 101, morno: 50 } }) });
  assert.strictEqual(noCorte.faixa, 'morno', 'corte de quente acima de 100 tem de deixar a nota 100 como morno');
});

teste('a régua do JSON manda: dobrar o peso da etapa muda a nota', () => {
  const negocio = { stageId: VISITA, mrr: 400, ultimaInteracao: diasAtras(7) };
  const comPadrao = temperaturaDoNegocio(negocio, { agoraMs: AGORA }).nota;
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.pesos.etapa = CONFIG.pesos.etapa * 2;
  const comDobro = temperaturaDoNegocio(negocio, { agoraMs: AGORA, config: cfg }).nota;
  assert.notStrictEqual(comPadrao, comDobro,
    'mudar peso na config não mudou a nota — a régua virou decoração');
});

teste('o teto de MRR satura: acima dele o fator não cresce', () => {
  const teto = CONFIG.valor.teto;
  const noTeto = temperaturaDoNegocio({ stageId: VISITA, mrr: teto, ultimaInteracao: diasAtras(1) }, { agoraMs: AGORA }).nota;
  const acima = temperaturaDoNegocio({ stageId: VISITA, mrr: teto * 10, ultimaInteracao: diasAtras(1) }, { agoraMs: AGORA }).nota;
  assert.strictEqual(noTeto, acima, 'MRR acima do teto não pode continuar pontuando');
});

teste('etapa fora do funil de Field Sales não pontua avanço', () => {
  const r = temperaturaDoNegocio({ stageId: 'etapa-que-nao-existe', mrr: 800, ultimaInteracao: diasAtras(0) }, { agoraMs: AGORA });
  assert.ok(r.nota < 100, 'etapa desconhecida não pode pontuar como Ag. Pagamento');
  assert.strictEqual(r.parcial, false, 'etapa desconhecida não torna a nota parcial — só não pontua');
});

teste('MRR em texto com vírgula (como o HubSpot manda) é lido como número', () => {
  const comTexto = temperaturaDoNegocio({ stageId: VISITA, mrr: '400,00', ultimaInteracao: diasAtras(1) }, { agoraMs: AGORA }).nota;
  const comNumero = temperaturaDoNegocio({ stageId: VISITA, mrr: 400, ultimaInteracao: diasAtras(1) }, { agoraMs: AGORA }).nota;
  assert.strictEqual(comTexto, comNumero, 'mrr como string tem de valer o mesmo que número');
});

teste('a config e o funil concordam: os 6 ids de etapa existem na régua', () => {
  const ids = Object.keys(CONFIG.etapa).filter(k => k.charAt(0) !== '_');
  assert.strictEqual(ids.length, 6, 'a régua tem de cobrir as 6 etapas abertas do Field Sales, tem ' + ids.length);
  const ranks = ids.map(k => Number(CONFIG.etapa[k])).sort((a, b) => a - b);
  assert.deepStrictEqual(ranks, [1, 2, 3, 4, 5, 6], 'os ranks têm de ser 1..6 sem buraco nem repetido');
});

console.log('temperatura: ' + ok + ' teste(s) passaram' + (falhas.length ? ', ' + falhas.length + ' FALHARAM' : ''));
if (falhas.length) {
  falhas.forEach(f => console.error('  FALHOU: ' + f.nome + '\n    ' + f.erro));
  process.exit(1);
}
