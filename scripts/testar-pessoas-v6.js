#!/usr/bin/env node
/* ============================================================================
   ABA PESSOAS v6 — O DOSSIÊ DE ACELERAÇÃO (19/09/26)

   Julyan: "quero refazer a aba pessoas... quero os dados perfeitos, e depois de analisar
   eu quero a identidade visual igual a do mockup".

   A REGRA DURA DA PRANCHA, e a razão desta suíte existir: *toda contagem bate exatamente
   com a lista que ela abre*. Na primeira versão que eu desenhei ela já não batia — o card
   do piso dizia "de 26 abertos" e o funil, dois blocos abaixo, dizia "45 em aberto". Os
   dois liam fontes diferentes e os dois pareciam certos. Vi na tela; guarda nenhuma pegou.
   Então aqui os números são CALCULADOS em vm, sobre uma fixture, e comparados um a um.

   O QUE ESTA SUÍTE NÃO MEDE, declarado: o desenho. Cor, fonte e espaçamento saíram da
   prancha desempacotada e conferidos no navegador com estilo computado — teste de string
   sobre hexadecimal só congela o que eu digitei.

   Uso: node scripts/testar-pessoas-v6.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const md = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');
const cadencias = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'cadencias.json'), 'utf8'));

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

/* ══ A FIXTURE ═══════════════════════════════════════════════════════════════════════
   Uma pessoa com SEIS abertos, montados para que cada card tenha um número DIFERENTE —
   fixture em que os números coincidem não separa card trocado de card certo. */
const HOJE = Date.now();
const DIA = 86400000;
const ABERTOS = [
  /* 0 toques, Prospecção, parado há 30d → régua estourada, sem toque, abaixo do piso */
  { id: 'a1', name: 'Las Comadres', stage: 'Prospecção', stageId: '1395880469',
    dias: 30, slaBreach: true, mrr: null, temperatura: 'frio' },
  /* 0 toques também */
  { id: 'a2', name: 'Oh Bruder', stage: 'Prospecção', stageId: '1395880469',
    dias: 13, slaBreach: true, mrr: null, temperatura: 'frio' },
  /* 2 toques, o último há 9 dias → atrasado na régua, ainda abaixo do piso de 4 */
  { id: 'a3', name: 'Deck 108', stage: 'Conversa com Decisor', stageId: '1395880470',
    dias: 10, slaBreach: false, mrr: 300, temperatura: 'morno' },
  /* 5 toques, último ontem → piso ok e em dia */
  { id: 'a4', name: 'Booze Bar', stage: 'Negociação', stageId: '1395880472',
    dias: 4, slaBreach: false, mrr: 800, temperatura: 'quente' },
  /* 1 toque, último hoje → abaixo do piso, mas não atrasado */
  { id: 'a5', name: 'Povoada', stage: 'Negociação', stageId: '1395880472',
    dias: 2, slaBreach: false, mrr: 250, temperatura: 'morno' },
  /* 0 toques */
  { id: 'a6', name: 'Relicário', stage: 'Prospecção', stageId: '1395880469',
    dias: 7, slaBreach: false, mrr: null, temperatura: 'frio' }
];
const TOQUES = {
  a1: { n: 0, ultimo: null, abertos: 0 },
  a2: { n: 0, ultimo: null, abertos: 0 },
  a3: { n: 2, ultimo: HOJE - 9 * DIA, abertos: 0 },
  a4: { n: 5, ultimo: HOJE - 1 * DIA, abertos: 0 },
  a5: { n: 1, ultimo: HOJE, abertos: 0 },
  a6: { n: 0, ultimo: null, abertos: 0 }
};

const ctx = {
  console: { log: function () {}, error: function () {} },
  Math: Math, Number: Number, Object: Object, String: String, Array: Array,
  Date: Date, isNaN: isNaN, JSON: JSON, RegExp: RegExp,
  DATA: {
    cadencias: cadencias,
    reps: [{ ownerId: '91477292', name: 'Kelly Travieso', abertos: ABERTOS, open: 6,
      compromissos: ['Zerar os sem toque', 'Destravar os 2 da Negociação', 'Fechar o Booze'],
      compromissosPrazo: ['2026-09-15', '2026-09-25', null] }],
    vendasMes: { porRep: [{ ownerId: '91477292', clientes: [
      { id: 'v1', nome: 'Coco e Tiny', mrr: 0, receita: 3144 }
    ] }] },
    stageMeta: { labels: {} }
  },
  PS6_ESTADO: { sel: '91477292', compromissos: {}, pauta: {} },
  PE4_ETAPA: {},
  PV6_CARD: {},
  tm10Tq: function (id) { return TOQUES[id] || { n: 0, ultimo: null, abertos: 0 }; },
  tm10Ultimo: function (ms) { return ms == null ? 'nunca' : 'há pouco'; },
  tm10Rs: function (n) { return 'R$ ' + (Number(n) || 0); },
  tm10MrrDo: function (l) { return Number(l && l.mrr) || 0; },
  tm10NomeCurto: function (n) { return String(n).split(' ')[0]; },
  esc: function (s) { return String(s == null ? '' : s); },
  hsUrl: function (id) { return 'https://app.hubspot.com/x/' + id; },
  isoDate: function (d) { return new Date(d).toISOString().slice(0, 10); }
};
vm.createContext(ctx);
[
  'cadenciaConfig', 'cadenciaMinimoToques', 'cadenciaDoLead', 'estadoDaCadencia',
  'pv6Abertos', 'pv6AbaixoDoPiso', 'pv6Piso', 'pv6PassosDa', 'pv6Cadencia', 'pv6UmAUmDoMes',
  'pv6Combinados', 'pv6ListaDoCard', 'pv6Funil', 'pv6Pct', 'pv6CorDoPace', 'pv6DataCurta'
].forEach(function (f) { vm.runInContext(recortar(tpl, f), ctx); });
vm.runInContext('const PV6_CANAL = ' + JSON.stringify({
  visita: { rot: 'VIS' }, ligacao: { rot: 'LIG' }, whatsapp: { rot: 'WPP' }
}) + ';', ctx);

/* ══ 1. O PISO DE TOQUES ═════════════════════════════════════════════════════════════ */
igual('o piso vem da configuração, não do código', ctx.cadenciaMinimoToques(), 4,
  'número de política em código vira cinco cópias com o mesmo defeito');

(function () {
  const ab = ctx.pv6Abertos('91477292');
  igual('a lista completa de abertos é lida do snapshot', ab.lista.length, 6);
  igual('e ela se declara completa', ab.completa, true,
    'a tela precisa saber se está lendo tudo ou o recorte antigo');

  const piso = ctx.pv6Piso(ab.lista);
  /* a1,a2,a3,a5,a6 têm menos de 4 toques; só a4 (5 toques) está no piso */
  igual('cinco dos seis abertos estão abaixo do piso', piso.abaixo, 5);
  igual('o total é a lista inteira', piso.total, 6);
  igual('e o percentual é sobre ela', piso.pct, 83);
}());

/* O FALLBACK: snapshot antigo, sem `abertos`. A tela NÃO pode fingir cobertura. */
(function () {
  const guardado = ctx.DATA.reps[0].abertos;
  ctx.DATA.reps[0].abertos = [];
  ctx.DATA.reps[0].travados = [{ id: 'a1', name: 'Las Comadres', stage: 'Prospecção',
    stageId: '1395880469', dias: 30, slaBreach: true }];
  ctx.DATA.reps[0].criticos = [];
  ctx.DATA.reps[0].quentes = [];
  const ab = ctx.pv6Abertos('91477292');
  igual('sem a lista nova, cai nos recortes antigos', ab.lista.length, 1);
  igual('e NÃO se declara completa', ab.completa, false,
    'foi por achar que via tudo que eu contei travados sobre 124 e cadência sobre 204');
  igual('e guarda quantos ficaram de fora', ab.recorte, 6,
    'a tela escreve "N abertos ainda não chegam com ficha" — silêncio aqui é o zero que '
      + 'tranquiliza');
  ctx.DATA.reps[0].abertos = guardado;
  delete ctx.DATA.reps[0].travados;
}());

/* ══ 2. A RÉGUA ══════════════════════════════════════════════════════════════════════ */
(function () {
  const cad = ctx.pv6Cadencia('91477292');
  igual('o mapa cobre todos os abertos', cad.linhas.length, 6);

  const por = {};
  cad.linhas.forEach(function (l) { por[l.id] = l; });

  igual('quem nunca foi tocado sai como não iniciada', por.a1.status, 'nao_iniciada');
  igual('e não vira "em dia" por falta de base de cálculo', por.a1.atraso, null,
    'sem último toque não há vencimento — e isso é o PIOR caso, não o melhor');

  /* a3: 2 toques na régua de acesso_decisor, último há 9 dias */
  checar('quem passou do D+n da régua sai atrasado', por.a3.atraso != null && por.a3.atraso > 0,
    'a3 tem 2 toques e o último há 9 dias; veio atraso=' + por.a3.atraso);
  igual('e a régua dele é a da etapa', por.a3.regua,
    cadencias.cadencias[cadencias.padraoPorEtapa['1395880470']].rotulo);

  igual('quem está no piso não é marcado abaixo dele', por.a4.abaixoDoPiso, false);
  igual('e quem não está, é', por.a5.abaixoDoPiso, true);

  /* A ORDEM: o que a régua manda tocar primeiro vem primeiro. Atrasado > sem toque.
     MEDE O PESO, NÃO A POSIÇÃO: com a sabotagem que zerava o ramo do "não iniciada", os
     dois pesos empatavam em -1 e a ordenação ESTÁVEL preservava a posição original — a
     guarda por índice dava verde com o defeito. */
  checar('o atrasado pesa mais que quem está em dia', por.a3.peso > por.a4.peso,
    'veio ' + por.a3.peso + ' contra ' + por.a4.peso);
  checar('e quem nunca foi tocado não vai para o fim da fila', por.a1.peso > por.a4.peso,
    'negócio sem toque nenhum não tem atraso calculável; ordenar só por atraso o jogaria '
      + 'para depois de quem está em dia — veio ' + por.a1.peso + ' contra ' + por.a4.peso);
  checar('e a ordem desenhada segue o peso',
    cad.linhas.every(function (l, i) {
      return i === 0 || cad.linhas[i - 1].peso >= l.peso; }));

  igual('as bolinhas saem da régua de verdade', por.a1.passos.length,
    cadencias.cadencias[cadencias.padraoPorEtapa['1395880469']].passos.length,
    'duas leituras da régua seriam duas réguas');
}());

/* ══ 3. TODA CONTAGEM BATE COM A LISTA QUE ELA ABRE ══════════════════════════════════
   O defeito que eu cometi e vi na tela. Aqui cada card é aberto e a lista é contada. */
(function () {
  const cad = ctx.pv6Cadencia('91477292');
  const dossie = { ownerId: '91477292', cadencia: cad, etapas: [], leads: [],
    fech: 1, meta: 8, pctMeta: 13 };

  const conta = function (card) {
    dossie.card = card;
    return ctx.pv6ListaDoCard(dossie).itens.length;
  };
  const travados = cad.linhas.filter(function (x) { return x.atraso != null && x.atraso > 0; }).length;
  const semToque = cad.linhas.filter(function (x) { return x.toques === 0; }).length;

  igual('o card de régua estourada abre exatamente a sua lista', conta('travados'), travados);
  igual('o card de sem toque abre exatamente a sua lista', conta('semtoque'), semToque);
  igual('o card do piso abre exatamente a sua lista', conta('piso'), cad.piso.abaixo);
  /* A REGRA DO PISO EXISTE UMA VEZ SÓ. Ela estava escrita em pv6Piso e de novo em
     pv6Cadencia; a sabotagem mudou uma, a outra ficou, e as duas continuaram batendo
     nesta fixture por sorte. Aqui o card e a linha leem a MESMA função. */
  checar('o card e a linha usam a mesma regra de piso',
    /abaixoDoPiso: pv6AbaixoDoPiso\(l\.id, minimo\)/.test(tpl)
      && /function \(l\) \{ return pv6AbaixoDoPiso\(l\.id, minimo\); \}/.test(tpl),
    'duas cópias da regra divergem sem ninguém ver — o card diria um número e a lista '
      + 'que ele abre, outro');
  igual('e o do mês abre as vendas do mês', conta('mes'), 1);

  /* AS TRÊS CONTAGENS TÊM DE SER DIFERENTES nesta fixture, senão a checagem acima
     passaria com os três cards lendo a mesma lista. */
  checar('os três números são distintos na fixture',
    new Set([travados, semToque, cad.piso.abaixo]).size === 3,
    'fixture onde os números coincidem não separa card trocado de card certo — veio '
      + travados + '/' + semToque + '/' + cad.piso.abaixo);

  /* O FUNIL LÊ A MESMA LISTA. Foi aqui que "45 em aberto" apareceu ao lado de
     "26 abertos". */
  const fun = ctx.pv6Funil(dossie);
  igual('o funil soma o mesmo total que o mapa de cadência',
    fun.reduce(function (s, e) { return s + e.n; }, 0), cad.linhas.length,
    'dois números para "aberto" na mesma tela foi o defeito que eu vi e nenhuma guarda '
      + 'pegou');
  igual('e o funil tem as três etapas da fixture', fun.length, 3);

  /* clicar numa etapa abre os negócios DAQUELA etapa, e o número bate */
  ctx.PE4_ETAPA['91477292'] = '1395880469';
  dossie.card = 'etapa';
  const daEtapa = ctx.pv6ListaDoCard(dossie);
  const naEtapa = fun.filter(function (e) { return e.id === '1395880469'; })[0];
  igual('a lista da etapa bate com a barra da etapa', daEtapa.itens.length, naEtapa.n);
  igual('e são os três de Prospecção', daEtapa.itens.length, 3);
  delete ctx.PE4_ETAPA['91477292'];
}());

/* ══ 4. O COMPROMISSO VENCIDO É CONTA, NÃO LEITURA DE PROSA ══════════════════════════ */
(function () {
  const v4 = [
    { txt: 'Zerar os sem toque', st: 'pendente', marcou: false, motivo: '', on: 'x:0' },
    { txt: 'Destravar os 2 da Negociação', st: 'pendente', marcou: false, motivo: '', on: 'x:1' },
    { txt: 'Fechar o Booze', st: 'pendente', marcou: false, motivo: '', on: 'x:2' }
  ];
  const c = ctx.pv6Combinados({ ownerId: '91477292' }, v4);
  igual('o prazo chega pelo array irmão, no mesmo índice',
    c.map(function (x) { return x.prazo; }), ['2026-09-15', '2026-09-25', null]);
  igual('o de prazo passado, ainda pendente, está vencido', c[0].vencido, true);
  igual('o de prazo futuro não está', c[1].vencido, false);
  igual('e sem prazo NÃO se inventa vencido', c[2].vencido, false,
    'só existe vencido com prazo estruturado — arrancar data da prosa é o que eu recusei '
      + 'fazer, porque erra em silêncio');

  /* combinado já carimbado não vence, mesmo com a data no passado */
  const feito = ctx.pv6Combinados({ ownerId: '91477292' },
    [{ txt: 'Zerar', st: 'feito', marcou: true, motivo: '', on: 'x:0' }]);
  igual('o que já foi cumprido não vira vencido', feito[0].vencido, false,
    'cobrar de novo o que a pessoa fez é como o acordo perde valor');
}());

/* ══ 5. O CONTADOR DE 1:1 MEDE O QUE DIZ QUE MEDE ════════════════════════════════════
   A tabela um_a_um está VAZIA para o time inteiro (medido em 19/09). O que existe é o
   marcador em pauta_do_lider, que é o mesmo que a Daily e a Semana leem. */
(function () {
  const mes = new Date().toISOString().slice(0, 7);
  ctx.PS6_ESTADO.pauta = {};
  igual('sem 1:1 marcado, o contador é zero', ctx.pv6UmAUmDoMes(), 0);

  ctx.PS6_ESTADO.pauta['um_a_um:91477292'] = { criado_em: mes + '-15T10:00:00Z' };
  ctx.PS6_ESTADO.pauta['cobranca_daily:86100505'] = { criado_em: mes + '-15T10:00:00Z' };
  igual('conta 1:1, e só 1:1', ctx.pv6UmAUmDoMes(), 1,
    'cobrança na daily não é 1:1 feito');

  ctx.PS6_ESTADO.pauta['um_a_um:86100505'] = { criado_em: '2026-01-02T10:00:00Z' };
  igual('e só os deste mês', ctx.pv6UmAUmDoMes(), 1,
    'contador de mês que soma o ano inteiro sobe sozinho e nunca desce');
  ctx.PS6_ESTADO.pauta = {};
}());

/* ══ 6. O QUE A TELA TEM DE DIZER ════════════════════════════════════════════════════ */
checar('a tela declara a janela de 30 dias do toque',
  tpl.indexOf('A agenda do snapshot cobre <b>30 dias para trás</b>') > -1,
  'a agenda vai de -30d a +90d. Chamar isso de "piso de 4 toques" sem a régua ao lado '
    + 'transforma um negócio velho e bem trabalhado num abandonado');

checar('e avisa quando está lendo o recorte antigo',
  tpl.indexOf('lendo o recorte antigo do snapshot') > -1,
  'a lista incompleta sem aviso é cobertura falsa');

checar('o piso e a régua se dizem vindos da configuração',
  tpl.indexOf('régua de data/cadencias.json') > -1);

checar('o rodapé diz a origem de cada número',
  tpl.indexOf('de onde vem cada número:') > -1
    && tpl.indexOf('pdi_compromissos') > -1 && tpl.indexOf('pauta_do_lider') > -1);

/* O ZERO QUE TRANQUILIZA, nos dois blocos que hoje não têm dado nenhum. */
checar('o bloco de última conversa explica o vazio em vez de sumir',
  tpl.indexOf('a tabela <code>um_a_um</code> está') > -1,
  'bloco que some quando não tem dado faz o gestor achar que não existe a informação');

checar('e o PDI sem dado vira convite, não branco',
  tpl.indexOf('Sem PDI firmado.') > -1);

checar('motivo de perda não medido não vira zero',
  tpl.indexOf('motivo por pessoa não medido nesta carga') > -1);

/* ══ 7. O CANO ATÉ A TELA ════════════════════════════════════════════════════════════
   montar-dados é um FILTRO por lista branca — campo fora dela morre em silêncio. Foi
   assim que metaMrr e metaReceita sumiram em 10/09. */
checar('o snapshot publica todos os abertos por executivo',
  /abertos,/.test(fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8')));

checar('e montar-dados deixa `abertos` passar',
  /abertos: Array\.isArray\(h\.abertos\) \? h\.abertos : \[\],/.test(md),
  'lista branca: campo que não está nela não chega à tela');

checar('e deixa `compromissosPrazo` passar',
  /compromissosPrazo: Array\.isArray\(n\.compromissosPrazo\) \? n\.compromissosPrazo : \[\],/.test(md));

/* ══ 8. A FIAÇÃO ═════════════════════════════════════════════════════════════════════ */
checar('os cards usam o ouvinte que já existia',
  tpl.indexOf('data-ps6-acao="card:') > -1
    && tpl.indexOf("if (verbo === 'card') {") > -1
    && /if \(a && b\) PV6_CARD\[a\] = b;/.test(tpl),
  'fiação nova para gesto novo numa tela que já tem ouvinte é a segunda forma de escutar '
    + 'o mesmo clique');

checar('clicar na etapa do funil TROCA a lista de baixo',
  /if \(a\) PV6_CARD\[a\] = 'card'|if \(a\) PV6_CARD\[a\] = 'etapa';/.test(tpl),
  'o gesto existia e não mudava estado nenhum — clique morto que a guarda de fiação não '
    + 'pega, porque o ouvinte está lá');

checar('e o card é por pessoa',
  !/let PV6_CARD = null/.test(tpl) && /let PV6_CARD = \{\};/.test(tpl),
  'card global faria trocar de pessoa herdar a lista aberta da anterior');

/* ══ 9. A GEOMETRIA QUE EU MEDI ══════════════════════════════════════════════════════
   A prancha nasceu com o dossiê a ~1100px. A 1240 de viewport ele tem 697, e as cinco
   colunas fixas da linha de cadência comiam 478 — sobravam 63px para o nome do negócio e
   57 para a ação. Não transborda, então nenhuma guarda de overflow pegaria. */
checar('a linha da cadência se reorganiza antes de esmagar o nome',
  /#ps6Raiz \[data-pv6-cad\]\{/.test(tpl)
    && /#ps6Raiz \[data-pv6-cad-regua\],/.test(tpl)
    && /#ps6Raiz \[data-pv6-cad-passos\]\{display:none !important;\}/.test(tpl),
  'coluna fixa em px esmaga a flexível em silêncio — foi o que aconteceu na prancha de '
    + '1460 também');

/* DUAS VEZES REESCRITA, e a segunda ensinou mais que a primeira. `min-width:0;` solto
   casava com outro trecho do bloco (guarda cega); depois eu cravei o literal inteiro
   `'border-radius:12px;min-width:0;'` e ele morreu na repintura, quando 12px virou
   var(--r-md) — a proteção continuava inteira, só a grafia mudou. Agora a âncora é o
   PEDAÇO que carrega a regra, sem o raio, que é decoração e muda de token. */
checar('o item do rail encolhe em vez de transbordar',
  (function () {
    /* recorte por FRONTEIRA SEMÂNTICA, não por contagem de caracteres: do início do item
       do rail até a primeira coisa que ele desenha dentro (as iniciais no avatar). Janela
       fixa em bytes é o outro jeito de a guarda morrer calada — já perdi uma assim. */
    const i = tpl.indexOf('data-ps6-acao="\' + p.on + \'"');
    const f = tpl.indexOf('esc(p.iniciais)', i);
    if (i < 0 || f < 0) return false;
    return tpl.slice(i, f).indexOf('min-width:0;') > -1;
  }()),
  'filho de grid tem min-width:auto e não encolhe abaixo do conteúdo; sem isto o item '
    + 'ficava 30px mais largo que o cartão, medido');

/* ══ 10. A TAG DO RAIL ═══════════════════════════════════════════════════════════════ */
checar('a tag do rail não cai sempre em destravar',
  /: \(noRitmo \? 'ritmo' : 'abordagem'\)\)\)\);/.test(tpl),
  'com o fallback em destravar, os nove do time apareciam com a mesma tag e a tela '
    + 'acusava todo mundo do mesmo problema — visto na tela');

/* ══ 11. O QUE ELE PEDIU EM 20/09 ════════════════════════════════════════════════════ */

/* O SCROLL. A Renata e o André têm 39 abertos cada; sem teto, o mapa empurra funil, PDI e
   compromissos para fora do alcance e o dossiê vira uma lista com anexos. */
checar('a lista do mapa de cadência tem teto e rola',
  /max-height:480px;overflow-y:auto;/.test(tpl)
    && /data-pv6-cad-lista/.test(tpl),
  'a Renata tem 39 abertos — 2.100px de lista antes do resto do dossiê');

checar('e o rodapé fica FORA da caixa que rola',
  (function () {
    /* o aviso de recorte incompleto do snapshot mora no rodapé. Dentro da caixa, ele só
       apareceria para quem rolasse até o fim — aviso que ninguém lê. */
    const i = tpl.indexOf('data-pv6-cad-lista');
    const f = tpl.indexOf('lendo o recorte antigo do snapshot', i);
    if (i < 0 || f < 0) return false;
    return tpl.slice(i, f).indexOf("+ '</div>'") > -1
      || tpl.slice(i, f).indexOf("'</div>'") > -1;
  }()));

checar('e o rodapé diz quantos negócios a lista tem',
  /cad\.linhas\.length \+ \(cad\.linhas\.length === 1 \? ' negócio' : ' negócios'\)/.test(tpl),
  'com a caixa rolando, o tamanho da lista deixa de ser visível de relance');

/* A SINCRONIA. Este é o defeito que ele viu: "só ta aparecendo o do marco em todos".
   `pessoaSelecionadaId` foi criada justamente para acabar com duas variáveis de seleção
   sem sincronia — e a v6 recriou o problema por outra porta. */
checar('o painel de Coaching segue a pessoa aberta no rail',
  /pessoaSelecionadaId = alvo;/.test(tpl)
    && /const alvo = dados\.dossie && dados\.dossie\.ownerId;/.test(tpl),
  'sem isto o Coaching cai no fallback DATA.reps[0] e mostra o Marco para todo mundo');

checar('e a sincronia mora no render, não no gesto',
  (function () {
    /* amarrar no verbo `sel` deixaria os outros caminhos de repintura fora de sincronia —
       foi assim que este defeito nasceu das duas vezes anteriores. */
    const i = tpl.indexOf('function renderPessoas()');
    const f = tpl.indexOf('async function ps6Iniciar', i);
    if (i < 0 || f < 0) return false;
    return tpl.slice(i, f).indexOf('pessoaSelecionadaId = alvo;') > -1;
  }()),
  'a ligação tem de valer para qualquer caminho que repinte a aba, não só para o clique');

checar('e ela segue o dossiê desenhado, não o sel cru',
  !/pessoaSelecionadaId = PS6_ESTADO\.sel/.test(tpl),
  'PS6_ESTADO.sel pode estar nulo enquanto a tela mostra o primeiro da fila — o Coaching '
    + 'tem de mostrar esse mesmo');

/* OS DOIS FUNIS. Um desenho, uma contagem. */
checar('o funil é desenhado por uma função só',
  /function pv6FunilHTML\(etapas, attrs\)/.test(tpl)
    && (tpl.match(/pv6FunilHTML\(/g) || []).length >= 3,
  'o dossiê e o painel de Coaching mostram o funil da MESMA pessoa um embaixo do outro; '
    + 'dois desenhos é como os dois acabam diferentes');

checar('e o funil do Coaching conta a mesma lista de abertos',
  /pv6Funil\(\{ ownerId: r\.ownerId, cadencia: pv6Cadencia\(r\.ownerId\),/.test(tpl),
  'antes ele saía de r.stages, a contagem agregada — outra fonte para o mesmo número');

checar('e o clique da etapa do Coaching continua vivo nos dois desenhos',
  /querySelectorAll\('\.coach-funil-etapa,\[data-coach-etapa\]'\)/.test(tpl),
  'ouvinte que só casa com um dos dois markups é o clique morto que a guarda de fiação '
    + 'não pega, porque o ouvinte existe');

/* ══ 12. A IDENTIDADE É A DA CASA ════════════════════════════════════════════════════
   Julyan, 20/09: "tudo tem que seguir a identidade visual do cockpit, o mockup é a ideia".
   A prancha veio no mundo creme; a casa é Archivo + Manrope sobre os tokens do :root. */
(function () {
  const i = tpl.indexOf('const PV6_CANAL = {');
  const f = tpl.indexOf('function tm2SobreviventesHTML', i);
  /* SEM OS COMENTÁRIOS: eles CITAM a paleta antiga de propósito, para explicar a troca.
     Medir o comentário junto faria a guarda exigir que a decisão ficasse sem registro. */
  const bloco = tpl.slice(i, f).replace(/\/\*[\s\S]*?\*\//g, '');

  checar('a fonte da aba sai dos tokens da casa',
    /const PV6_P = 'var\(--font-display\)';/.test(bloco)
      && /const PV6_D = 'var\(--font-body\)';/.test(bloco),
    'Poppins + DM Sans é a prancha; Archivo + Manrope é o Cockpit');

  /* O ÚNICO HEXADECIMAL TOLERADO é o vermelho clareado da faixa escura: #E51A31 sobre
     #2B3440 são dois tons médios e o número some. Os outros quatro são tons de borda que
     já existiam no arquivo antes desta aba. */
  const TOLERADOS = ['#E51A31', '#FF6B78', '#F0DFB6', '#CBE8DD', '#E3C6C6', '#E0A73C', '#E9E5DC'];
  const soltos = [...new Set((bloco.match(/#[0-9A-Fa-f]{6}/g) || [])
    .filter(function (h) { return TOLERADOS.indexOf(h.toUpperCase()) < 0; }))];
  igual('e nenhuma cor nova fica cravada fora dos tokens', soltos, [],
    'cor cravada não acompanha a casa quando a casa muda — foi o que separou o que veio '
      + 'junto do #E9E5DC global do que ficou para trás');

  checar('a paleta creme da prancha não sobreviveu em lugar nenhum',
    bloco.indexOf('#FDFBF0') < 0 && bloco.indexOf('#EFE9DC') < 0
      && bloco.indexOf('#E4DBC6') < 0 && bloco.indexOf('#1A1613') < 0
      && bloco.indexOf('Poppins') < 0 && bloco.indexOf('DM Sans') < 0,
    'foi a emenda entre os dois mundos — a aba creme encostada no painel de Coaching — '
      + 'que ficou feia na tela dele, não o desenho');
}());

console.log('');
console.log('pessoas v6: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(f => console.log('  ✗ ' + f));
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
