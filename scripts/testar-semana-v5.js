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
  /* OS DOIS COMPANHEIROS: `data-sm5-i` viaja com o check e `data-sm5-dono` com o quente.
     Nenhum dos dois é clicável por si — são carga do cartão que o ramo do irmão lê. Eles
     têm checagem própria, logo abaixo, cobrando a LEITURA pelo dataset. */
  .filter(function (a) { return a !== 'data-sm5-i' && a !== 'data-sm5-dono'; });
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
/* AS DUAS PONTAS, e não só o leitor: a primeira versão media `dataset.sm5Dono` na fiação
   e ficou verde quando eu tirei o atributo do CARTÃO — o leitor continuava lá, lendo
   undefined para sempre. Cobrar quem EMITE e quem LÊ. */
conferir('data-sm5-dono é lido junto do quente',
  liga.indexOf('dataset.sm5Dono') > -1 && liga.indexOf('dataset.sm5Quente') > -1
    && corpoDe('sm5QuentesHTML').indexOf('data-sm5-dono=') > -1,
  'é o dono que salva o clique quando o negócio não está em funilLeads — sem ele, beco');

/* ── 4. A REGRA DA FAIXA É A DO CONTRATO ─────────────────────────────────────────── */
/* É a alma da tela: ela decide quem o gestor vai visitar hoje. Mexer nela sem querer
   reordena o dia do time inteiro e nada na tela denuncia. */
const faixa = semProsa(corpoDe('sm5Faixa'));
/* `r.trav >= 5 ||` E NÃO `r.trav >= 5`: a primeira versão media o pedaço sem o `||`, e
   `'r.trav >= 50'` CONTÉM `'r.trav >= 5'` — afrouxei a régua de 5 para 50 travados e a
   guarda ficou verde. Substring de número é a forma mais boba de guarda cega, e só a
   sabotagem mostra. */
conferir('AGIR AGORA exige reunião zero, 5 travados ou queda com mês atrasado',
  faixa.indexOf('r.reun === 0') > -1 && faixa.indexOf('r.trav >= 5 ||') > -1
    && faixa.indexOf("r.tend === 'down' && r.mesAtrasado") > -1
    && antesDe(faixa, "'agir'", "'bem'"),
  'o corte do vermelho é do contrato, e o vermelho tem de ser testado ANTES do verde');

/* ── 4b. O ALARME NÃO TOCA PARA QUEM NÃO FOI MEDIDO ──────────────────────────────── */
/* MEDIDO EM 14/09/26, e é o pior defeito que esta tela teve: o placar mostrava 5 reuniões
   (semana fechada) e o board somava 1 entre as dez pessoas, porque os detalhes por pessoa
   descrevem `janela.atual` — que hoje é "14/09–14/09", um dia. Oito dos nove vermelhos
   eram vermelhos pelo único motivo "reunião zero", apurado sobre uma segunda-feira que
   ainda não aconteceu; e o veredito anunciava "o risco são 9 vendedores parados" em 24px.
   Alarme que toca para quase todo mundo ensina o gestor a ignorar a faixa vermelha. */
conferir('"parou de marcar" só acende sobre semana fechada',
  faixa.indexOf('r.reunMedida !== false && r.reun === 0') > -1,
  'zero reuniões numa segunda-feira não é parada — é o dia não ter acontecido');
conferir('o estoque de travados NÃO entra na ressalva',
  faixa.indexOf('parouDeMarcar || r.trav >= 5') > -1,
  '`trav` é SLA estourado no snapshot do dia: 26 travados são 26 travados numa segunda-feira');
conferir('a linha carrega se a reunião foi medida sobre semana',
  corpoDe('sm5Dados').indexOf('reunMedida: !jan.usouAnterior,') > -1,
  'sem o campo a regra acima nunca sabe a resposta e volta a acusar todo mundo');
conferir('a legenda da faixa vermelha não promete o que não mediu',
  corpoDe('sm5Dados').indexOf('desc: jan.usouAnterior') > -1
    && corpoDe('sm5Dados').indexOf('só quando ela fechar') > -1,
  'dizer "pararam de marcar" na legenda de uma semana em curso é a tela afirmando o que a regra não avaliou');
conferir('o zero de reuniões da linha não fica vermelho sem medida',
  corpoDe('sm5BoardHTML').indexOf("(r.reunMedida !== false && r.reun === 0) ? '#E51A31'") > -1,
  'o zero em vermelho é uma acusação, e sobre semana em curso ela não se sustenta');

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
/* REESCRITA EM 16/09/26. A regra anterior era "perdidos e MRR saem SEM barras", porque o
   robô não tinha série para eles. Consertei o robô em vez da tela: `perdidos` já estava no
   histórico e só faltava projetar, e `mrr` passou a ser gravado por semana. Agora os cinco
   KPIs pedem série, como na prancha.

   E A CAIXA DAS BARRAS É SEMPRE DESENHADA — esta é a checagem que vale, porque foi a
   ausência dela que deformou a faixa: os dois KPIs sem histórico ficavam 38px mais baixos
   que os outros três, e a fileira de cinco virou duas fileiras. Medido contra a prancha
   desempacotada: 25 barrinhas e 1 fileira lá, 0 e 2 aqui. */
['fechamentos', 'reunioes', 'criados', 'perdidos', 'mrr'].forEach(function (s) {
  conferir('o KPI lê a série de ' + s,
    dados.indexOf("sm5Barras('" + s + "'") > -1,
    'a prancha desenha barra nos cinco; sem a série o KPI fica oco e a fileira desmonta');
});
conferir('a caixa das barras existe mesmo sem série',
  corpoDe('sm5TelaHTML').indexOf('série começa nesta semana') > -1
    && semProsa(corpoDe('sm5TelaHTML')).indexOf('k.barras.length\n        ?') < 0,
  'sem a caixa o KPI fica 38px mais baixo que os vizinhos e a fileira de cinco vira duas');
conferir('perdidos pinta a última barra de vermelho',
  dados.indexOf("sm5Barras('perdidos', '#FF6B78')") > -1,
  'neste KPI a barra alta é má notícia — é a inversão que a prancha faz nele');
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
/* O <b> LITERAL NA TELA — medido em 14/09/26: 38 tags "<b>" e "</b>" aparecendo como
   TEXTO, uma vez por marcação em cada uma das 10 linhas do board. O gargalo era o único
   texto do robô passando por `esc()`, enquanto a leitura da semana, as jogadas e o
   roteiro do 1:1 renderizavam o negrito. O gestor lia
   "Kelly, a semana fechou com <b>1 negócio ganho (Coco e Tiny)</b> — esse...". */
conferir('o gargalo do board mostra negrito, e não a tag',
  corpoDe('sm5BoardHTML').indexOf('sm5Negrito(r.gargalo)') > -1
    && corpoDe('sm5BoardHTML').indexOf('esc(r.gargalo)') < 0,
  'o robô marca os números com <b>; escapar tudo põe a tag na tela em toda linha do board');
/* OS TRÊS TEXTOS DO ROBÔ NO BOARD, e não só o que eu tinha olhado. Em 16/09 o Julyan
   mandou a captura da PRODUÇÃO com os compromissos mostrando "<b>3 leads com SLA
   estourado</b>" e "<b>16/09/2026</b>" como texto. Eu tinha consertado só o gargalo,
   porque a fixture com que revisei não tinha marcação nos compromissos — olhei onde o
   defeito não estava. Esta checagem varre os três de uma vez.

   `r.tendTexto` continua com `esc` de propósito: ele vai para dentro de um atributo
   `title=`, onde tag não renderiza e aspas soltas quebrariam o markup. */
['r.gargalo', 'c'].forEach(function (campo) {
  conferir('o texto do robô em ' + campo + ' renderiza negrito',
    semProsa(corpoDe('sm5BoardHTML')).indexOf('sm5Negrito(' + campo + ')') > -1
      && semProsa(corpoDe('sm5BoardHTML')).indexOf('esc(' + campo + ')') < 0,
    'o robô marca números e datas com <b>; escapar põe a tag na tela do gestor');
});
conferir('o texto do title continua escapado',
  corpoDe('sm5BoardHTML').indexOf('esc(r.tendTexto)') > -1,
  'dentro de atributo a tag não renderiza e aspa solta quebra o markup — ali `esc` é o certo');

conferir('o filtro reabre só negrito, e não o HTML inteiro',
  quantas(tpl, 'function sm5Negrito(') === 1
    && corpoDe('sm5Negrito').indexOf('esc(v)') > -1
    && corpoDe('sm5Negrito').indexOf('&lt;b&gt;') > -1,
  'innerHTML cru daria o mesmo visual com muito mais superfície — o filtro escapa e reabre');

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
/* REESCRITA EM 14/09/26 (a regra mudou, e a antiga era inalcançável).
   A versão anterior cobrava `if (!(meta > 0)) return null;` e dizia que era assim que
   quem saiu para o Inside deixava de aparecer. MEDIDO: esse `if` nunca dispara, porque
   `metaClientesDoRep` devolve **10** quando `metaMensal` falta — e 10 não existe na
   planilha, cujos patamares são 8 e 2. Com o snapshot do disco (anterior à planilha de
   10/09) a tela mostrou "meta 10" para as dez pessoas e mês do time 10/100; em produção
   é 50. Quem tira a Amanda do board é o `porRep` do robô, não aquela linha.
   A regra agora: ler o CAMPO, e declarar a falta sem sumir com a pessoa. */
conferir('a meta sai do campo, e não do fallback de 10',
  dados.indexOf('const metaBruta = rep.metaMensal;') > -1
    && dados.indexOf('metaClientesDoRep(rep)') < 0,
  'o fallback inventa uma meta que não existe na planilha e o mês do time vira 100 em vez de 50');
conferir('quem não tem meta continua no board, declarando a falta',
  dados.indexOf("'sem meta na planilha'") > -1
    && semProsa(dados).indexOf('if (!(meta > 0)) return null;') < 0,
  'sumir com gente por campo vazio é a tela escondendo do gestor alguém de quem ele responde');
conferir('sem meta ninguém entra no denominador do time',
  dados.indexOf('if (temMeta) { metaDoTime += meta; fechadosDoTime += mes; }') > -1,
  'somar o fechado sem somar a meta deixa a régua de ritmo do time otimista');
conferir('sem meta não há "meta batida" nem divisão por zero',
  dados.indexOf('const metaBatida = temMeta && mes >= meta;') > -1
    && dados.indexOf('const mesAtrasado = temMeta && !metaBatida') > -1,
  '`0 >= 0` pintaria "meta batida" em verde, e `mes / 0` faz o atraso virar falso');
conferir('sem meta a pessoa não entra em RODANDO BEM por omissão',
  faixa.indexOf('r.temMeta !== false &&') > -1,
  '`!mesAtrasado` é verdadeiro para quem não tem régua — a pessoa virava exemplo do time');
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

/* ── 10c. UMA SEMANA POR TELA: NADA DE NÚMERO DE OUTRA JANELA SEM DIZER ──────────── */
/* ACHADO NA PASSADA DE CLIQUES COM O SNAPSHOT DE PRODUÇÃO, 14/09/26. O robô gravou
   `janela.atual = "14/09–14/09"` — um dia — por causa do escorregão do cron de domingo.
   A tela caiu para a semana fechada no placar, e os DETALHES por pessoa continuaram
   sendo da rodada de hoje. Resultado medido: a faixa escura mostrava "2 ganhos" e
   "R$ 857 MRR fechado" a 34px de distância, e os 857 eram de 4 negócios que não são
   aqueles 2. */
conferir('o MRR não soma detalhe de uma semana sob o rótulo de outra',
  dados.indexOf('const mrrFechado = jan.usouAnterior ? null :') > -1,
  'o detalhe descreve sempre a janela atual; sob o rótulo da fechada ele é número de outra semana');
conferir('sem o dado da janela mostrada o MRR é travessão, e não zero',
  dados.indexOf("mrrFechado == null ? '—'") > -1,
  '"R$ 0" leria como mês sem faturar; o robô é que não guarda MRR da semana anterior');
conferir('o MRR diz quantos ganhos vieram sem valor',
  dados.indexOf('const ganhosSemValor =') > -1
    && dados.indexOf('nota: ganhosSemValor ?') > -1,
  'soma com negócio zerado dentro é apresentada como total e não é');
conferir('sem comparação a tela não afirma a direção do funil',
  dados.indexOf("kp == null ? '' : ' e ' + (criadosCairam") > -1,
  'hoje ela diria "funil recarregado" na semana em que os criados caíram de 120 para 47');

/* ── 10d. O QUENTE SEM VALOR, E A JANELA DE UM DIA ───────────────────────────────── */
conferir('a série recusa janela que não é semana',
  semProsa(corpoDe('sm5Serie')).indexOf('dias == null || dias < 5') > -1,
  'as três janelas de hoje têm UM dia: a primeira desenhava como semana de zero fechamentos');
conferir('a régua de semana da série é a mesma do resto da tela',
  semProsa(corpoDe('sm5Serie')).indexOf('sm5DiasDaJanela(') > -1,
  'segunda definição de "semana" é a forma de os dois números divergirem sem ninguém ver');
conferir('quente sem MRR preenchido não vira "R$ 0"',
  dados.indexOf('temMrr: Number(q.mrr || q.valor_de_mrr || 0) > 0,') > -1
    && corpoDe('sm5QuentesHTML').indexOf("(x.temMrr ? sm5Moeda(x.mrrNum) : '—')") > -1,
  '3 dos 13 quentes de hoje vêm com mrr null; "R$ 0" em verde lê como negócio de zero reais');
/* O MECANISMO, e não o nome da variável: `const quentesSemValor = 0;` contém
   `'const quentesSemValor ='` e a primeira versão desta checagem passou com a contagem
   zerada. Cobrar o filtro que conta de verdade. */
conferir('o total dos quentes declara a soma incompleta',
  dados.indexOf('quentes.filter(function (q) { return !q.temMrr; }).length') > -1
    && corpoDe('sm5QuentesHTML').indexOf('q.semValor') > -1,
  '"R$ 4.094 esperando decisão" com 3 sem valor é um total que não é total');
/* `semProsa` E NÃO `liga`: a primeira versão reprovou o código CERTO, porque o meu
   próprio comentário no ramo CITA "abra pelo Meu funil" como o texto que saiu. É a
   armadilha nº 2 da lista de cegueiras desta base, e ela pega nas duas direções. */
conferir('o quente fora do funilLeads cai no dossiê do dono',
  semProsa(liga).indexOf('openModal(dono)') > -1
    && semProsa(liga).indexOf('Meu funil') < 0,
  'medido: 1 dos 6 quentes não está em funilLeads, e "abra pelo Meu funil" é aba do executivo');

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

/* ── 12b. O BOARD CABE NO TELEFONE ───────────────────────────────────────────────── */
/* MEDIDO A 375px EM 14/09/26: 24 elementos da linha caíam FORA da caixa de 190px. O nome
   terminava 68px depois da borda, os quatro contadores acabavam em 544px e o botão
   "1:1 hoje" ficava em x=931 — inalcançável, com o documento SEM rolagem horizontal para
   chegar nele. Os `min-width` inline somam ~906px de piso. O board, que é a alma da tela,
   era inoperável no telefone e nada denunciava, porque nada transbordava o documento. */
conferir('a fileira do board é uma classe, não estilo inline solto',
  corpoDe('sm5BoardHTML').indexOf('class="sm5-linha"') > -1,
  'media query não existe em atributo `style`; sem a classe não há como quebrar a fileira');
conferir('a fileira quebra no estreito',
  tpl.indexOf('.sm5-linha{flex-wrap:wrap;') > -1,
  'sem wrap os ~906px de piso dos min-width jogam o botão do 1:1 para fora da tela');
/* O `!important` É PARTE DA REGRA, e não estilo de escrita: os min-width estão em atributo
   `style`, e inline vence a folha. Sem ele a media query aplica e não muda nada — foi
   assim que a regra de 44px de toque do login ficou inerte nesta base. */
conferir('o override dos min-width inline leva !important',
  tpl.indexOf('.sm5-linha > span{min-width:0 !important;}') > -1,
  'inline vence a folha: sem !important a media query aplica e a fileira continua sem caber');
conferir('os quatro contadores também quebram',
  tpl.indexOf('gap:8px !important;flex-wrap:wrap;}') > -1,
  '"26 travados" passava 24px da borda com o gap de 18px, que também é inline');
conferir('o drawer vira uma coluna e perde o recuo de 68px',
  corpoDe('sm5BoardHTML').indexOf('class="sm5-drawer"') > -1
    && tpl.indexOf('.sm5-drawer{grid-template-columns:1fr;padding-left:18px;') > -1,
  'o recuo existe para alinhar com o avatar; sem fileira alinhada é margem perdida em 375');

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
