/* ══════════════════════════════════════════════════════════════════════════════════════
   A JANELA DO ROBÔ SEMANAL — determinística em qualquer dia e hora (16/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "a aba semana do gestor NÃO FICOU igual ao mockup... ficou todo quebrado".

   A causa raiz de metade daquilo estava AQUI, e não na tela. O robô calculava a janela a
   partir da semana CORRENTE e capava o fim em "agora":

     const atualInicio = new Date(inicioSemanaBrasiliaMs());
     const atualFim = new Date(Math.min(now, atualInicio + 5 * DAY - 1));

   Isso só dá seg–sex se ele rodar depois da sexta e antes da segunda. O cron é
   `0 1 * * 1` = domingo 22:00 BRT, a TRÊS HORAS da virada do calendário brasileiro, e
   atraso de três horas no Actions é rotina. Passando disso a janela vira um pedaço, e o
   pedaço não fica no robô: vira o placar do gestor.

   O QUE A JANELA PARCIAL CAUSOU NA TELA, e que eu remendei sem atacar a causa:
     · o placar caía para a semana anterior e os detalhes por pessoa continuavam da
       rodada parcial — "2 ganhos" e "R$ 857 de MRR" na mesma faixa, de semanas diferentes
     · "o risco são 9 vendedores parados", sendo que oito eram falsos: "reunião zero"
       apurado sobre uma segunda-feira que ainda não aconteceu
     · a série de barras com janelas de UM dia rotuladas "últimas 2 semanas"
     · o aviso "a semana X ainda não fechou" ocupando três linhas do cabeçalho, que na
       prancha tem duas

   ESTA SUITE RECORTA A FUNÇÃO REAL do arquivo e roda em `vm`, em vez de reimplementá-la
   aqui — guarda que reimplementa a regra mede a minha cópia, não o código que embarca, e
   passa verde enquanto o original apodrece.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const fonte = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-weekly-comparison.js'), 'utf8');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}

/* ── O RECORTE: a função de início de semana e o bloco que decide a janela ────────── */
const mFn = fonte.match(/function inicioSemanaBrasiliaMs\(\)[\s\S]*?\n\}/);
if (!mFn) {
  console.log('FALHAS (1):\n  · não achei inicioSemanaBrasiliaMs: sem ela não há o que medir');
  process.exit(1);
}
/* `Date.now()` sai para o teste poder escolher o instante — é a ÚNICA troca, e ela é
   declarada aqui para ninguém confundir com reimplementar a regra. */
const fnTexto = mFn[0].replace('Date.now()', 'AGORA');

const mBloco = fonte.match(/const semanaCorrente = inicioSemanaBrasiliaMs\(\);[\s\S]*?const anteriorFim = new Date\([^\n]*\);/);
conferir('o bloco da janela existe com o nome novo',
  !!mBloco,
  'sem o recorte as checagens abaixo passariam sem medir nada — era o jeito desta suíte mentir');
if (!mBloco) {
  console.log('FALHAS (' + falhas.length + '):');
  falhas.forEach(function (f) { console.log(f); });
  process.exit(1);
}

const DAY = 86400000;
function janelaEm(iso) {
  const ctx = { AGORA: Date.parse(iso), DAY: DAY, console: { log: function () {} },
    now: new Date(Date.parse(iso)), Date: Date, Math: Math };
  vm.createContext(ctx);
  vm.runInContext(fnTexto + '\n' + mBloco[0]
    + '\nvar __r = { ai: atualInicio.getTime(), af: atualFim.getTime(),'
    + ' pi: anteriorInicio.getTime(), pf: anteriorFim.getTime() };', ctx);
  const r = ctx.__r;
  /* FORMATA EM BRT, e não em UTC. O fim da janela é sábado 02:59:59.999 UTC, que é
     sexta 23:59:59.999 em Brasília: lendo em UTC o rótulo saía "07/09–12/09" e a
     checagem reprovava o código CERTO. O robô formata em BRT — o snapshot em produção
     diz "07/09–11/09/2026" — e o teste tem de usar a MESMA régua que ele. */
  const fmt = function (ms) {
    const d = new Date(ms - 3 * 3600000);
    return String(d.getUTCDate()).padStart(2, '0') + '/'
      + String(d.getUTCMonth() + 1).padStart(2, '0');
  };
  return {
    rotulo: fmt(r.ai) + '–' + fmt(r.af),
    anterior: fmt(r.pi) + '–' + fmt(r.pf),
    /* dias de calendário BRT cobertos: o início é segunda 03:00 UTC e o fim é sábado
       02:59:59.999 UTC, que é sexta 23:59:59.999 BRT — cinco dias úteis. */
    dias: Math.round((r.af - r.ai + 1) / DAY),
    diaDaSemanaDoInicio: new Date(r.ai - 3 * 3600000).getUTCDay()
  };
}

/* ── 1. CINCO DIAS, EM TODO HORÁRIO EM QUE O ROBÔ PODE ACORDAR ───────────────────── */
/* Estes seis instantes não são decorativos: os quatro últimos são os que PRODUZIAM
   janela parcial antes desta correção. */
const QUANDO = [
  ['2026-09-11T20:00:00Z', 'sexta 17h BRT — o horário do desenho'],
  ['2026-09-12T05:00:00Z', 'sexta 23h BRT — depois do fechamento'],
  ['2026-09-13T01:00:00Z', 'sábado 22h BRT'],
  ['2026-09-14T01:00:00Z', 'domingo 22h BRT — o cron'],
  ['2026-09-14T04:00:00Z', 'segunda 01h BRT — o cron atrasado 3h'],
  ['2026-09-14T23:56:00Z', 'segunda 20h BRT — a rodada real de 14/09'],
  ['2026-09-16T13:00:00Z', 'quarta 10h BRT'],
  ['2026-09-17T13:00:00Z', 'quinta 10h BRT']
];
QUANDO.forEach(function (par) {
  const j = janelaEm(par[0]);
  conferir('rodando ' + par[1] + ' a janela tem 5 dias',
    j.dias === 5,
    'deu ' + j.dias + ' (' + j.rotulo + ') — semana parcial no robô vira placar errado no gestor');
  conferir('rodando ' + par[1] + ' a janela começa numa segunda',
    j.diaDaSemanaDoInicio === 1,
    'começou no dia ' + j.diaDaSemanaDoInicio + ' — a semana do produto é seg–sex');
});

/* ── 2. É A ÚLTIMA SEMANA FECHADA, E NÃO A EM CURSO ──────────────────────────────── */
/* O ponto do produto: o gestor lê números de uma semana que TERMINOU. Rodando na quarta,
   a resposta tem de ser a semana anterior — não três dias da atual. */
const naQuarta = janelaEm('2026-09-16T13:00:00Z');
conferir('na quarta o robô reporta a semana que fechou, não três dias da corrente',
  naQuarta.rotulo === '07/09–11/09',
  'deu ' + naQuarta.rotulo + '; a última fechada em 16/09 é 07/09–11/09');
const naSexta = janelaEm('2026-09-12T05:00:00Z');
conferir('na sexta à noite ele já reporta a própria semana',
  naSexta.rotulo === '07/09–11/09',
  'deu ' + naSexta.rotulo + '; a semana fechou às 23:59 de sexta 11/09');
const naSegunda = janelaEm('2026-09-14T23:56:00Z');
conferir('a rodada de segunda 14/09 daria 07/09–11/09, e não 14/09–14/09',
  naSegunda.rotulo === '07/09–11/09',
  'deu ' + naSegunda.rotulo + ' — era exatamente este o defeito');

/* ── 3. A MESMA RESPOSTA EM TODO DIA DA MESMA SEMANA ─────────────────────────────── */
/* DETERMINISMO é o que a tela pressupõe: o snapshot de sexta e o de quarta seguinte
   descrevem a MESMA semana, senão o histórico ganha dois registros da mesma janela — que
   é como a série virou "14/09–14/09" duas vezes. */
const mesmaSemana = ['2026-09-14T04:00:00Z', '2026-09-14T23:56:00Z',
  '2026-09-16T13:00:00Z', '2026-09-17T13:00:00Z'].map(function (i) { return janelaEm(i).rotulo; });
conferir('segunda, quarta e quinta da mesma semana dão a MESMA janela',
  new Set(mesmaSemana).size === 1,
  'deu ' + mesmaSemana.join(' | ') + ' — rodar duas vezes gravaria duas semanas diferentes');

/* ── 4. A ANTERIOR É A DE VERDADE ────────────────────────────────────────────────── */
conferir('a semana anterior fica sete dias atrás, com cinco dias',
  naQuarta.anterior === '31/08–04/09',
  'deu ' + naQuarta.anterior + '; a comparação compara útil com útil (decisão de 08/08)');

/* ── 5. A REGRA NÃO VOLTOU A OLHAR O RELÓGIO PARA O FIM DA JANELA ────────────────── */
const bloco = mBloco[0];
conferir('o fim da janela não é mais capado em "agora"',
  bloco.indexOf('Math.min(now') < 0,
  'capar em `agora` é o que produzia a janela de um dia — a semana fechada tem fim fixo');
conferir('a decisão de qual semana usar é explícita',
  bloco.indexOf('const fechou = now.getTime() >= sextaDaCorrente;') > -1,
  'sem o portão a função volta a devolver a semana corrente, em curso');

if (falhas.length) {
  console.log('FALHAS (' + falhas.length + '):');
  falhas.forEach(function (f) { console.log(f); });
  process.exit(1);
}
console.log('janela semanal: ' + ok + ' checagens ok — cinco dias e a mesma resposta em '
  + 'qualquer dia e hora que o robô acordar.');
