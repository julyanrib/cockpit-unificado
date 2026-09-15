/* ══════════════════════════════════════════════════════════════════════════════════════
   ABA SEMANA v5 — o que quebra em silêncio (14/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "aba semana do gestor, precisamos repaginar ela, tem tudo aí, faça" — e, antes
   disso no mesmo dia, "nao podemos mais ter nenhum erro igual teve hoje".

   ESTA SUITE NÃO SUBSTITUI testar-semana-v4.js. Aquela protege o MOTOR (sm3 e sm9), que
   a v5 continua usando inteiro: o elenco, o corte das seis etapas abertas, "não medido"
   ≠ 0, o vocabulário do banco. Esta aqui mede só o que a v5 trouxe de novo.

   ══ OS DEFEITOS QUE ESTA ENTREGA COMETEU, E QUE ESTA SUITE PRENDE ═══════════════════
     1. TRÊS NOMES DE FUNÇÃO INVENTADOS. `irParaMeuFunilDoDono`, `abrirFunilDoOwner` e
        `sm3CriarAviso` não existem nesta base. Eu os chamei atrás de
        `typeof x === 'function'`, que é o padrão que ESCONDE o defeito: o recurso nasce
        desligado e o clique cai no toast de consolo, para sempre, sem uma linha de erro.
        A guarda de chamada-sem-declaração do build pegou os dois primeiros e NÃO pegou o
        terceiro — porque atrás de `typeof` não há chamada para ela ver.
     2. `DATA.narrativas` NÃO EXISTE no front. Eu lia praça e compromissos de lá; devolvia
        `{}` sem erro, e a tela saía com praça "—" e drawer de 1:1 sem nenhum combinado.
        O caminho certo é `reps[].praca` / `reps[].compromissos`, do montar-dados.
     3. O QUEBRADOR DE FRASES NÃO CONHECIA `<b>`. O robô escreve "<b>Abra o 1:1</b> ...";
        sem o `<` no grupo de início, o roteiro do 1:1 perdia uma frase em quase todo
        texto — 3 onde havia 4 — e o gestor perdia o COBRAR.
     4. UMA BARRA POR RODADA, E NÃO POR SEMANA. O histórico do robô acumula por execução:
        rodei duas vezes num dia e a mesma janela apareceu duas vezes na série, fazendo a
        última barra parecer crescimento.

   ══ AS AFIRMAÇÕES QUE A v5 FAZ NA TELA, E QUE PRECISAM DE PROVA ═════════════════════
   "nenhum vendedor parado esta semana", "mês levemente atrás — ritmo pedia N", "▼23" em
   verde nos perdidos e a régua de ritmo no meio da barra do mês. Todas são conclusões, e
   conclusão sem medida é o defeito que este repo paga mais caro. Cada uma tem checagem
   abaixo, e cada checagem foi testada VERMELHA contra a sabotagem do defeito exato que
   ela diz medir — guarda nova que nunca reprovou nada é indistinguível de comentário.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
function quantas(txt, agulha) { return txt.split(agulha).length - 1; }

/* o corpo de uma função, para medir a regra DENTRO dela — sem isto meus próprios
   comentários (que citam o defeito como exemplo) reprovam o trabalho certo */
function corpoDe(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; }
    else if (c === '}') { d--; if (viu && d === 0) return tpl.slice(i, j + 1); }
    j++;
  }
  return '';
}
/* sem comentário: o que o navegador de fato executa */
function semProsa(txt) {
  return txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');
}
function antesDe(txt, a, b) {
  const ia = txt.indexOf(a), ib = txt.indexOf(b);
  return ia > -1 && ib > -1 && ia < ib;
}

/* ── 1. A TELA EXISTE, COM UM DONO SÓ ────────────────────────────────────────────── */
['sm5Dados', 'sm5TelaHTML', 'sm5BoardHTML', 'sm5QuentesHTML', 'sm5Ligar', 'sm5Faixa',
 'sm5Delta', 'sm5Barras', 'sm5Serie', 'sm5Janela', 'sm5DiasDaJanela', 'sm5RitmoDoMes',
 'sm5Tendencia', 'sm5Roteiro', 'sm5Numero', 'sm5Moeda', 'sm5CarregarAnalises'
].forEach(function (fn) {
  conferir('existe ' + fn,
    quantas(tpl, 'function ' + fn + '(') === 1,
    'a aba precisa dela, e uma vez só — duas definições e a última ganha em silêncio');
});

/* ── 2. NENHUM NOME INVENTADO ATRÁS DE `typeof` ──────────────────────────────────── */
/* O DEFEITO Nº 1 DESTA ENTREGA, três vezes no mesmo dia. A guarda do build não cobre
   este caso, então a cobertura é aqui: todo nome que a fiação da v5 sonda com
   `typeof x === 'function'` tem de estar DECLARADO neste template. */
const liga = corpoDe('sm5Ligar');
const sondados = (semProsa(liga).match(/typeof [A-Za-z0-9_$]+ === 'function'/g) || [])
  .map(function (s) { return s.split(' ')[1]; });
conferir('a fiação sonda pelo menos os destinos que a tela promete',
  sondados.length >= 4,
  'se a lista vier vazia esta checagem passa sem medir nada — era o jeito de ela mentir');
sondados.forEach(function (fn) {
  conferir('o destino ' + fn + ' existe de verdade',
    quantas(tpl, 'function ' + fn + '(') > 0
      || quantas(tpl, 'const ' + fn + ' =') > 0
      || quantas(tpl, 'let ' + fn + ' =') > 0
      || quantas(tpl, fn + ' = function') > 0
      || quantas(tpl, fn + ': function') > 0,
    'chamada atrás de `typeof` a um nome que não existe = recurso desligado e toast de consolo');
});

/* ── 3. NENHUM CLIQUE MORTO: todo atributo emitido tem leitor ────────────────────── */
/* "Ler o atributo não é ligá-lo": uma versão anterior de checagem parecida aceitava o
   atributo citado no CSS como prova de fiação, e a sabotagem passou. Aqui o leitor tem
   de estar no CORPO de sm5Ligar. */
const atributos = [...new Set((tpl.match(/data-sm5-[a-z]+/g) || []))]
  .filter(function (a) { return a !== 'data-sm5-i'; });   /* companheiro de data-sm5-check */
conferir('a tela emite os atributos que eu penso que ela emite',
  atributos.length >= 5,
  'lista vazia faria o laço abaixo dar verde sem medir um único botão');
atributos.forEach(function (a) {
  conferir('quem clica em ' + a + ' é atendido',
    liga.indexOf(a) > -1,
    'atributo desenhado sem leitor na fiação é clique morto — 28 de uma vez, nesta base');
});
conferir('data-sm5-i é lido junto do check',
  liga.indexOf('dataset.sm5I') > -1 && liga.indexOf('dataset.sm5Check') > -1,
  'o índice do compromisso vem no par; sem ele marcaria sempre o primeiro item');

/* ── 4. A REGRA DA FAIXA É A DO CONTRATO ─────────────────────────────────────────── */
/* É a alma da tela: ela decide quem o gestor vai visitar hoje. Mexer nela sem querer
   reordena o dia do time inteiro e nada na tela denuncia. */
const faixa = semProsa(corpoDe('sm5Faixa'));
/* `r.trav >= 5 ||` E NÃO `r.trav >= 5`: a primeira versão media o pedaço sem o `||`, e
   `'r.trav >= 50'` CONTÉM `'r.trav >= 5'` — afrouxei a régua de 5 para 50 travados e a
   guarda ficou verde. Substring de número é a forma mais boba de guarda cega, e só a
   sabotagem mostra. */
conferir('AGIR AGORA exige reunião zero, 5 travados ou queda com mês atrasado',
  faixa.indexOf('r.reun === 0 ||') > -1 && faixa.indexOf('r.trav >= 5 ||') > -1
    && faixa.indexOf("r.tend === 'down' && r.mesAtrasado") > -1
    && antesDe(faixa, "'agir'", "'bem'"),
  'o corte do vermelho é do contrato, e o vermelho tem de ser testado ANTES do verde');

/* O 5 ESTÁ ESCRITO DUAS VEZES: na regra da faixa e na cor do contador de travados do
   board. São a mesma pergunta — "este número é grave?" — e duas verdades para uma
   pergunta é a causa raiz de metade dos defeitos deste arquivo. Se alguém mexer só na
   regra, a pessoa cai em AGIR AGORA com o contador pintado de âmbar. */
conferir('a cor do contador de travados usa o mesmo corte da faixa',
  corpoDe('sm5BoardHTML').indexOf('r.trav >= 5 ?') > -1,
  'a régua do vermelho e a cor do número têm de dizer a mesma coisa sobre o mesmo dado');
conferir('RODANDO BEM exige as três coisas juntas',
  faixa.indexOf('r.ganhos >= 1 && r.trav <= 2 && !r.mesAtrasado') > -1,
  'quem fechou mas está com 11 travados não é exemplo — é problema de hoje');
conferir('quem não é vermelho nem verde cai em DE OLHO, e não fora da tela',
  faixa.indexOf("return 'olho'") > -1,
  'sem o caso padrão a pessoa sumiria do board sem ninguém notar');

/* ── 5. O MARCADOR DO MÊS É DIA ÚTIL, NÃO DIA DO MÊS ─────────────────────────────── */
const ritmoFn = semProsa(corpoDe('sm5RitmoDoMes'));
conferir('a régua de ritmo pula sábado e domingo',
  ritmoFn.indexOf('dow === 0 || dow === 6') > -1,
  'o mês tem 22 úteis e 30 corridos: pelo corrido a régua fica um terço adiantada');
const dados = corpoDe('sm5Dados');
conferir('o marcador na barra vem da fração de dias úteis',
  quantas(dados, 'Math.round(ritmo.fracao * 100)') === 1,
  'é este número que desenha o traço dourado — cravá-lo seria uma régua decorativa');
conferir('o "ritmo pedia N" é contado, não opinado',
  dados.indexOf('Math.ceil(ritmo.fracao * metaDoTime)') > -1,
  'a tela afirma um número ao gestor; ele tem de sair da mesma régua do traço');

/* ── 6. SEM SÉRIE, SEM BARRA ─────────────────────────────────────────────────────── */
const barras = semProsa(corpoDe('sm5Barras'));
conferir('menos de dois pontos não desenha série',
  barras.indexOf('valores.length < 2') > -1 && barras.indexOf('return []') > -1,
  'uma barra sozinha não mostra tendência e ocupa o lugar dizendo que mostra');
conferir('perdidos e MRR saem sem barras',
  quantas(semProsa(dados), 'barras: []') === 2,
  'a prancha desenha cinco barras nos cinco KPIs porque o dado dela é fake; estes dois não têm série');
conferir('a série fica com uma leitura por janela',
  semProsa(corpoDe('sm5Serie')).indexOf('new Map()') > -1,
  'o robô acumula por execução: duas rodadas no dia repetem a janela e a última barra finge crescimento');
conferir('o rótulo das barras conta as barras que existem',
  corpoDe('sm5TelaHTML').indexOf('k.barras.length') > -1,
  'cravar "últimas 5 semanas" com 3 barras na tela é afirmar histórico que não veio');

/* ── 7. A COR DO DELTA É SEMÂNTICA, NÃO A DIREÇÃO DA SETA ────────────────────────── */
const delta = semProsa(corpoDe('sm5Delta'));
conferir('a cor do delta sai do significado',
  delta.indexOf('cor: bom ?') > -1 && delta.indexOf('subirEhBom ? subiu : !subiu') > -1,
  'perdidos CAINDO é verde — pela direção da seta a tela pintaria de vermelho uma boa notícia');
conferir('perdidos declara que subir é ruim',
  dados.indexOf('sm5Delta(k.perdidos, kp && kp.perdidos, false)') > -1,
  'é o único dos cinco KPIs invertido; esquecê-lo dá a cor errada no número mais sensível');
conferir('sem janela anterior não há delta',
  delta.indexOf('anterior == null) return null') > -1,
  'quando a tela mostra a semana retrasada não existe anterior — "▲0" seria estabilidade inventada');

/* ── 8. O ROTEIRO DO 1:1 SOBREVIVE AO <b> DO ROBÔ ────────────────────────────────── */
const roteiro = corpoDe('sm5Roteiro');
conferir('o quebrador de frases conhece a ênfase do robô',
  roteiro.indexOf('(?=[<A-Z') > -1,
  'o robô escreve "<b>Abra o 1:1</b>"; sem o `<` o roteiro perde uma frase e o gestor perde o COBRAR');
conferir('frase que não dá para quebrar sai sem rótulo inventado',
  semProsa(roteiro).indexOf("tag: ''") > -1,
  'rotular um parágrafo inteiro de "ABRIR" é a tela afirmando uma estrutura que o texto não tem');
conferir('o que sobra da terceira frase não é descartado',
  semProsa(roteiro).indexOf("ultimo.txt += ' ' + f") > -1,
  'perder frase do 1:1 é pior que rótulo repetido — o robô manda de 2 a 4');

/* ── 9. A CARGA ASSÍNCRONA NÃO TRAVA A ABA, E NÃO DUPLICA ────────────────────────── */
const render = corpoDe('renderSemana');
conferir('a tela pinta antes de esperar as análises',
  antesDe(semProsa(render), 'raiz.innerHTML = sm5TelaHTML', 'sm5CarregarAnalises()'),
  'travar a aba num await deixa o gestor olhando tela branca por causa de um texto');
const carga = semProsa(corpoDe('sm5CarregarAnalises'));
conferir('a de-duplicação guarda a promessa em voo',
  carga.indexOf('if (SM5_CARREGANDO) return SM5_CARREGANDO;') > -1,
  '"trava depois do await não é trava": booleano no fim deixa passar os dois redesenhos simultâneos');
/* MEDIDO DENTRO DO `catch`, e não na função toda: `SM5_ANALISES = {}` aparece DUAS vezes
   em sm5CarregarAnalises — a outra é o caminho "não há Supabase nesta sessão". A primeira
   versão desta checagem olhava a função inteira, e eu troquei o `{}` do catch por `null`:
   ela ficou VERDE, porque achou o do vizinho. Sabotagem é o único jeito de ver isso. */
const ramoCatch = (function () {
  const i = carga.indexOf('} catch (e) {');
  return i < 0 ? '' : carga.slice(i);
})();
conferir('falha de leitura não apaga o board',
  ramoCatch.indexOf('SM5_ANALISES = {};') > -1,
  'null faria a tela tentar de novo para sempre; `{}` mantém todo mundo na lista com o fallback');
conferir('a falha de leitura das análises aparece, e não some',
  ramoCatch.indexOf('console.error') > -1,
  'ausência mentida é o pior defeito desta tela: o board tem de dizer que a IA não veio');
conferir('a pessoa sem análise da IA continua no board',
  dados.indexOf('an.gargalo_semana || p.resumoIndividual') > -1,
  'sumir da lista por falta de texto é a tela escondendo gente de quem o gestor é responsável');

/* ── 10. OS NÚMEROS POR PESSOA SAEM DO SNAPSHOT, E NÃO DE CONTA MINHA ────────────── */
conferir('quem não tem meta na planilha não entra no board',
  dados.indexOf('if (!(meta > 0)) return null;') > -1,
  'é assim que quem saiu para o Inside para de aparecer como cobrável — foi pedido explícito');
conferir('praça e compromissos vêm do rep, e não de DATA.narrativas',
  dados.indexOf('rep.praca') > -1 && dados.indexOf('rep.compromissos') > -1
    && semProsa(dados).indexOf('DATA.narrativas') < 0,
  'DATA.narrativas não existe no front: devolvia {} sem erro, praça "—" e drawer vazio');
conferir('a v5 não pede nada ao CRM da tela',
  semProsa(dados).indexOf('fetch(') < 0
    && semProsa(corpoDe('sm5TelaHTML')).indexOf('fetch(') < 0,
  'o front pedindo etapa ao HubSpot é a regressão que este projeto já reverteu uma vez');
conferir('o ganho por pessoa prefere o detalhe, que é quem carrega o MRR',
  dados.indexOf('ganhosPorDono[id] != null ? ganhosPorDono[id]') > -1,
  'snap.ganhosSemana e o detalhe divergem; a tela soma o detalhe, então é ele que manda');

/* ── 10b. O ZERO NÃO TRANQUILIZA ─────────────────────────────────────────────────── */
/* ACHADO NO PREVIEW, 14/09/26, e não por leitura de código: com o snapshot de 291h no
   disco o `porRep` veio vazio, e o topo da tela disse "0/0 · meta batida" e "8 fechados
   e nenhum vendedor parado esta semana" no mesmo quadro em que o board, logo abaixo,
   dizia "Nenhum executivo com meta na planilha veio no snapshot desta semana".

   Em produção metaDoTime é 50 e isso não aparece — o que é justamente o perigo: o
   defeito só acende no dia em que o robô falha, que é o dia em que o gestor mais precisa
   que a tela não minta. */
conferir('0 de 0 não é meta batida',
  dados.indexOf("!(metaDoTime > 0) ? 'sem meta no snapshot") > -1,
  '`0 >= 0` é verdadeiro: a tela pintava de verde "meta batida" exatamente quando não havia meta');
conferir('sem ninguém no board a tela não afirma que ninguém está parado',
  dados.indexOf('const semElenco = linhas.length === 0;') > -1
    && antesDe(semProsa(dados), 'semElenco', "'nenhum vendedor parado esta semana.'"),
  'afirmar ausência sem ter medido é o pior defeito desta tela — e o mais tranquilizador');

/* ── 11. A JANELA: "A SEMANA" É A QUE FECHOU ─────────────────────────────────────── */
const janela = semProsa(corpoDe('sm5Janela'));
conferir('semana fechada é a de cinco dias',
  janela.indexOf('diasAtual >= 5') > -1,
  'field sales é seg–sex; com menos a tela apresentaria uma segunda-feira como semana cheia');
conferir('o motivo de mostrar a retrasada vai para a TELA',
  janela.indexOf('aviso:') > -1 && janela.indexOf('ainda não fechou') > -1,
  'no console ninguém lê: o gestor tem de saber por que está olhando a semana anterior');
conferir('janela ilegível devolve null, e não 5',
  semProsa(corpoDe('sm5DiasDaJanela')).indexOf('return null') > -1,
  'chutar 5 dias aqui faria toda semana em curso passar por fechada');

/* ── 12. O DRAWER: UM ABERTO, E O CLIQUE NO COMPROMISSO NÃO FECHA ────────────────── */
/* MEDIDO DENTRO DO RAMO, e não no corpo todo: a primeira versão desta checagem usava
   `antesDe(liga, 'if (check)', 'ev.stopPropagation()')` — e os ramos do CRM e do negócio
   quente, que vêm DEPOIS, têm o stopPropagation deles. Tirando o do check a guarda dava
   verde, porque ela achava o do vizinho. Sabotei e passou; por isso recorta o ramo. */
const ramoCheck = (function () {
  const l = semProsa(liga);
  const i = l.indexOf('if (check) {');
  if (i < 0) return '';
  return l.slice(i, l.indexOf('return;', i));
})();
conferir('marcar compromisso não fecha o painel embaixo do dedo',
  ramoCheck.indexOf('ev.stopPropagation()') > -1,
  'o check está dentro da linha que alterna o drawer; sem parar a propagação ele se fecha ao marcar');
conferir('o compromisso grava pela mesma função do painel do executivo',
  liga.indexOf('savePdiState(') > -1 && liga.indexOf('getPdiState(') > -1,
  'segunda gravação do mesmo combinado = segunda verdade; é o único conteúdo compartilhado desta tela');
conferir('a raiz é remarcada para não ligar duas vezes',
  liga.indexOf("raiz.dataset.sm5Ligado === '1'") > -1,
  'a tela repinta a cada clique: sem a marca, o segundo ouvinte alterna o drawer duas vezes e ele nunca abre');
conferir('o primeiro da faixa vermelha abre sozinho, e só na primeira vez',
  corpoDe('sm5BoardHTML').indexOf('SM5_ABERTO === undefined') > -1,
  'testar por falsy faria o `null` de "eu fechei" reabrir o drawer a cada repintura');
conferir('faixa sem ninguém não desenha',
  dados.indexOf('return g.reps.length;') > -1,
  'um título "RODANDO BEM · 0" é a tela ocupando espaço para não dizer nada');

/* ── 13. NADA DE FIXTURE VAZADA ──────────────────────────────────────────────────── */
const v5 = semProsa(tpl.slice(tpl.indexOf('async function sm5CarregarAnalises('),
  tpl.indexOf('function renderSemana(')));
conferir('nenhum nome de pessoa cravado no código da v5',
  ['Kelly', 'Wericles', 'Marco', 'Bruno', 'Sandro', 'Ricardo', 'Renata', 'Sérgio', 'Amanda']
    .every(function (n) { return v5.indexOf("'" + n) < 0; }),
  'nome de gente em literal é fixture da prancha que sobreviveu à conversão');
conferir('nenhum ownerId cravado no código da v5',
  !/['"](8[5-9]|9[0-9])[0-9]{6}['"]/.test(v5),
  'id de dono em literal amarra a tela ao time de hoje e mente no dia que alguém entra');

if (falhas.length) {
  console.log('FALHAS (' + falhas.length + '):');
  falhas.forEach(function (f) { console.log(f); });
  process.exit(1);
}
console.log('semana v5: ' + ok + ' checagens ok — nenhum nome inventado, nenhum clique morto, '
  + 'nenhuma barra sem série e nenhuma conclusão sem a medida que a sustenta.');
