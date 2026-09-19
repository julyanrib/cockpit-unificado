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
    diaDaSemanaDoInicio: new Date(r.ai - 3 * 3600000).getUTCDay(),
    /* A HORA DO FIM, em BRT. Sem ela a checagem do tamanho da janela é CEGA: com o
       fim às 20h de sexta, (af - ai + 1) / DAY da 4,83 e o Math.round devolve 5 — a
       sabotagem que encurtava a janela passava verde. */
    fimBRT: (function () {
      const d = new Date(r.af - 3 * 3600000);
      return String(d.getUTCHours()).padStart(2, '0') + ':'
        + String(d.getUTCMinutes()).padStart(2, '0');
    }())
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

/* ── 6. A SEGUNDA-FEIRA DELE, COM AS DATAS QUE ELE PEDIU ─────────────────────────── */
/* Julyan, 19/09/26: 'quero que a aba semana eu abra ela na segunda com os dados da
   semana anterior (14/9 - 18/9)'. As checagens 1-5 cobrem a REGRA; esta cobre o CASO,
   com as datas dele, porque é assim que ele vai conferir se está certo. O robô pode
   acordar quatro vezes na segunda (cron de domingo 22h que atrasa, e as rodadas do
   daily-refresh) e as quatro têm de dar a mesma semana. */
const SEGUNDA_DELE = [
  ['2026-09-21T01:00:00Z', 'o cron de domingo 22h BRT'],
  ['2026-09-21T04:00:00Z', 'o cron atrasado 3h — segunda 01h BRT'],
  ['2026-09-21T11:56:00Z', 'a rodada de segunda 08:56 BRT'],
  ['2026-09-21T16:00:00Z', 'a rodada de segunda 13h BRT'],
  ['2026-09-21T22:00:00Z', 'a rodada de segunda 19h BRT']
];
SEGUNDA_DELE.forEach(function (par) {
  const j = janelaEm(par[0]);
  conferir('abrindo a Semana na segunda 21/09 (' + par[1] + ') os números são de 14/09–18/09',
    j.rotulo === '14/09–18/09',
    'deu ' + j.rotulo + ' — era esta a semana que ele pediu para ver na segunda');
  conferir('e a comparação é com 07/09–11/09 (' + par[1] + ')',
    j.anterior === '07/09–11/09',
    'deu ' + j.anterior + ' — útil contra útil, decisão de 08/08');
});
/* E NA SEXTA SEGUINTE ELA VIRA, não antes: é o que garante que ele passe a semana
   inteira lendo 14/09–18/09 em vez de ver a janela mudar na quarta. */
conferir('na quinta 24/09 a janela ainda é 14/09–18/09',
  janelaEm('2026-09-24T18:00:00Z').rotulo === '14/09–18/09',
  'deu ' + janelaEm('2026-09-24T18:00:00Z').rotulo + ' — a janela não pode virar no meio da semana');
conferir('e na sexta 25/09 depois das 23:59 BRT ela passa a ser 21/09–25/09',
  janelaEm('2026-09-26T03:30:00Z').rotulo === '21/09–25/09',
  'deu ' + janelaEm('2026-09-26T03:30:00Z').rotulo + ' — a semana fecha na sexta 23:59');

/* ── 7. OS NÚMEROS E A LEITURA DECLARAM SUAS JANELAS ─────────────────────────────── */
/* Os dois lados vêm de snapshots com cadências diferentes (weekly-raw de 2 em 2 horas,
   resumo-semanal só no domingo 22h). No fim de semana eles descrevem semanas diferentes,
   e a tela não tinha como saber. Guarda dos DOIS lados: o emissor e o leitor. */
const montarTxt = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');
const tplTxt = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
conferir('o snapshot publica a janela que a LEITURA por pessoa descreve',
  montarTxt.indexOf('janelaDaLeitura: (resumoSemanal && resumoSemanal.janela && resumoSemanal.janela.atual)') > -1,
  'sem o campo do resumo-semanal a tela só conhece a janela do weekly-raw');
conferir('e a tela LÊ esse campo',
  tplTxt.indexOf('rs.janelaDaLeitura') > -1,
  'atributo emitido e nunca lido é o defeito que esta base já tem 13 vezes');
conferir('e avisa quando as duas janelas divergem',
  tplTxt.indexOf("avisos.push('os números acima são de ' + mostrada") > -1,
  'divergir em silêncio é o defeito de 16/09 — placar de uma semana, board de outra');
conferir('o aviso da semana nao fechada nao foi perdido na troca',
  tplTxt.indexOf("avisos.push('a semana ' + j.atual + ' ainda não fechou')") > -1,
  'eram dois motivos para o mesmo lugar da tela; trocar um pelo outro perde metade');

/* ── 8 · A SEMANA FECHA ÀS 20H DE SEXTA (19/09/26) ───────────────────────────────
   Julyan: "o robo tem que rodar então sexta 20h". Com o corte antigo (sexta 23:59) o
   robô das 20h reportaria a semana RETRASADA e escreveria a leitura da IA sobre ela —
   medido antes de mexer: 07/09–11/09 no lugar de 14/09–18/09.

   20H É QUANDO O TIME PARA, não um número para caber no cron: a última rodada de dia
   útil do daily-refresh é 19:00 BRT. */
conferir('às 19h de sexta a semana ainda NÃO fechou',
  janelaEm('2026-09-18T22:00:00Z').rotulo === '07/09–11/09',
  'deu ' + janelaEm('2026-09-18T22:00:00Z').rotulo + ' — antes das 20h o dia ainda corre,'
    + ' e fechar cedo é o defeito que tirou o horário de sexta 16h em 05/09');

conferir('às 20h de sexta ela fecha, e é a semana que acabou',
  janelaEm('2026-09-18T23:00:00Z').rotulo === '14/09–18/09',
  'deu ' + janelaEm('2026-09-18T23:00:00Z').rotulo + ' — é ESTE o instante em que o robô'
    + ' novo roda, e ele tem que ver a semana dele');

conferir('e a comparação dele é com 07/09–11/09',
  janelaEm('2026-09-18T23:00:00Z').anterior === '07/09–11/09',
  'deu ' + janelaEm('2026-09-18T23:00:00Z').anterior);

/* NÃO OSCILA NO MEIO DA SEMANA: se a janela virasse de novo antes da sexta seguinte, o
   histórico ganharia duas linhas para a mesma semana — foi assim que a série virou
   "14/09–14/09" duas vezes em 16/09. */
const DEPOIS_DO_FECHAMENTO = [
  ['sábado 19/09 09h BRT', '2026-09-19T12:00:00Z'],
  ['domingo 20/09 22h BRT (o horário velho)', '2026-09-20T01:00:00Z'],
  ['segunda 21/09 08:30 BRT', '2026-09-21T11:30:00Z'],
  ['quinta 24/09 15h BRT', '2026-09-24T18:00:00Z'],
  ['sexta 25/09 19h BRT', '2026-09-25T22:00:00Z']
];
DEPOIS_DO_FECHAMENTO.forEach(function (par) {
  conferir('a janela continua 14/09–18/09 na ' + par[0],
    janelaEm(par[1]).rotulo === '14/09–18/09',
    'deu ' + janelaEm(par[1]).rotulo + ' — a janela só pode virar na sexta seguinte às 20h');
});

conferir('e vira 21/09–25/09 só às 20h da sexta seguinte',
  janelaEm('2026-09-25T23:00:00Z').rotulo === '21/09–25/09',
  'deu ' + janelaEm('2026-09-25T23:00:00Z').rotulo);

/* A JANELA DE DADOS NÃO ENCOLHEU COM O CORTE. Se ela terminasse às 20h, o negócio
   fechado na sexta à noite cairia em semana NENHUMA — a próxima só começa na segunda.
   Continua cinco dias cheios, e as quatro horas finais entram na rodada seguinte do
   daily-refresh (sábado 09:00). */
conferir('a janela continua com cinco dias cheios depois da mudança',
  janelaEm('2026-09-18T23:00:00Z').dias === 5,
  'deu ' + janelaEm('2026-09-18T23:00:00Z').dias + ' — encurtar a janela junto com o corte'
    + ' perderia a sexta à noite para sempre');

/* E O FIM É 23:59, NÃO 20:00 — esta é a checagem que pega de verdade. A de cima,
   sozinha, era cega: o Math.round transforma 4,83 dias em 5 e a sabotagem que
   encurtava a janela até as 20h passava verde. */
conferir('e ela termina às 23:59 de sexta, não às 20:00',
  janelaEm('2026-09-18T23:00:00Z').fimBRT === '23:59',
  'terminou às ' + janelaEm('2026-09-18T23:00:00Z').fimBRT + ' — o corte da SEMANA foi'
    + ' para as 20h, mas a JANELA DE DADOS não pode encolher junto: o negócio fechado na'
    + ' sexta à noite cairia em semana nenhuma');

conferir('o corte está declarado em dia e hora, e não em "5 dias menos 1ms"',
  /const sextaDaCorrente = semanaCorrente \+ 4 \* DAY \+ 20 \* HORA;/.test(fonte),
  'escrito assim, dá para comparar o corte com o cron do workflow — é o que'
    + ' testar-robos-ia.js faz, e é o que impede os dois de andarem separados');

if (falhas.length) {
  console.log('FALHAS (' + falhas.length + '):');
  falhas.forEach(function (f) { console.log(f); });
  process.exit(1);
}
console.log('janela semanal: ' + ok + ' checagens ok — cinco dias e a mesma resposta em '
  + 'qualquer dia e hora que o robô acordar.');
