#!/usr/bin/env node
/* ============================================================================
   PLANEJAMENTO FINAL · O "COMO FOI?" E A EVIDÊNCIA DO APP (23/09/26)

   Cobre as checagens 5 a 8 pedidas no prompt da prancha final:

     5. compromisso com a hora passada e sem registro desenha "como foi?"; o que ainda vai
        acontecer NÃO desenha. Cada propósito tem as suas opções, escritas uma por uma;
     6. "remarcar" move o compromisso e leva a tarefa junto, sem criar uma segunda, e o
        propósito é preservado;
     7. o slot com `r` é lido, e o slot em string continua sendo lido;
     8. "sem check-in" e "na fila do app" são estados distintos, e nunca aparecem juntos.

   O RELÓGIO É O DA CASA. pl6HoraJaPassou sai de agendaParaBRT/agendaChave/agendaHhmm — as
   mesmas funções que a agenda e a Daily usam. Esta suíte roda a função DE VERDADE com o
   relógio congelado, porque a pergunta "já passou?" é a única coisa que decide se a tela
   cobra ou não cobra, e um fuso errado aqui cobraria o dia inteiro às 6 da manhã.

   Uso: node scripts/testar-como-foi.js
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
function ctxBase(extra) {
  const c = Object.assign({ String: String, Number: Number, Array: Array, Object: Object,
    Date: Date, Math: Math, isNaN: isNaN, isFinite: isFinite, Set: Set,
    console: { error: function () {} } }, extra || {});
  vm.createContext(c);
  [/const PL6_BLOQUEADO = '[^']+';/, /const PL6_RUA = '[^']+';/, /const PL6_REL = '[^']+';/,
    /const PL6_RESULTADOS = \{[\s\S]*?\n\};/, /const PL6_MOTIVOS = \[[\s\S]*?\n\];/]
    .forEach(function (re) {
      const m = tpl.match(re);
      if (!m) { console.error('FALHA: não achei ' + re); process.exit(1); }
      vm.runInContext(m[0], c);
    });
  return c;
}

console.log('');
console.log('5a · A PERGUNTA SÓ APARECE DEPOIS DA HORA');

(function () {
  /* O RELÓGIO CONGELADO em 23/09/2026 14:10 de Brasília = 17:10 UTC. As funções de hora
     desta casa deslocam o UTC em 3h e leem a Date em UTC; recortá-las de verdade é o que
     separa esta suíte de uma que repetiria a conta em vez de medi-la. */
  const c = ctxBase({ AGORA_ISO: '2026-09-23T17:10:00.000Z' });
  ['agendaParaBRT', 'agendaP2', 'agendaChave', 'agendaHhmm'].forEach(function (f) {
    vm.runInContext(recortar(f), c);
  });
  vm.runInContext('function agendaAgora() { return agendaParaBRT(AGORA_ISO); }', c);
  vm.runInContext(recortar('pl6HoraJaPassou'), c);
  const passou = vm.runInContext('pl6HoraJaPassou', c);

  igual('o relógio congelou às 14:10 de Brasília',
    vm.runInContext('agendaHhmm(agendaAgora())', c), '14:10',
    'se esta linha falhar, todas as de baixo estão medindo outro horário');

  checar('compromisso das 09:00 de hoje já passou', passou('2026-09-23', '09:00') === true);
  checar('o das 14:00 já passou (a hora chegou)', passou('2026-09-23', '14:00') === true);
  checar('o das 14:10 já passou, no minuto exato', passou('2026-09-23', '14:10') === true);
  checar('o das 16:00 NÃO passou', passou('2026-09-23', '16:00') === false,
    'perguntar "como foi?" às 14:10 de um compromisso das 16h é perguntar de uma coisa '
      + 'que não aconteceu');
  checar('o de amanhã não passou', passou('2026-09-24', '08:00') === false);
  checar('qualquer um de ontem passou', passou('2026-09-22', '23:00') === true);
  checar('sem hora, HOJE ainda não passou', passou('2026-09-23', '') === false,
    'o dia dele não acabou; cobrar às 9h um compromisso sem hora marcada é cobrar cedo');
  checar('sem hora, ONTEM passou', passou('2026-09-22', null) === true,
    'ele existe, ficou sem registro, e não perguntar seria perder justamente o que '
      + 'ninguém anotou');
  checar('dia nulo não estoura', passou(null, '09:00') === false);
}());

checar('e a tela só desenha a pergunta quando a hora passou e não há registro',
  /const perg = passou && !reg;/.test(codigo)
    && /comoFoi: perg && !motivosAqui/.test(codigo),
  'perguntar de novo depois de registrado é não ter ouvido');
checar('bloqueio não é perguntado',
  /it\.tipo !== 'bloqueado' && pl6HoraJaPassou/.test(codigo),
  'compromisso fora da rua não tem resultado de venda para dar');
checar('e em dia anterior a pergunta muda de rótulo',
  /FICOU SEM REGISTRO — COMO FOI\?/.test(codigo) && /'COMO FOI\?'/.test(codigo),
  '"como foi?" numa terça-feira, na sexta, esconde que aquilo ficou para trás');

console.log('');
console.log('5b · CADA PROPÓSITO TEM AS SUAS OPÇÕES, ESCRITAS UMA POR UMA');

(function () {
  const c = ctxBase();
  ['pl6ResultadosDe', 'pl6ResultadoInfo', 'pl6MotivoRotulo'].forEach(function (f) {
    vm.runInContext(recortar(f), c);
  });
  const de = vm.runInContext('pl6ResultadosDe', c);
  const rot = function (p) { return de(p).map(function (o) { return o.id; }); };

  igual('follow', rot('follow'), ['proposta', 'avancou', 'remarcar', 'nao_rolou']);
  igual('funil', rot('funil'), ['avancou', 'proposta', 'remarcar', 'nao_rolou']);
  igual('cobrar', rot('cobrar'), ['pagou', 'nova_data', 'nao_rolou']);
  igual('relac', rot('relac'), ['feita', 'indicacao', 'remarcar', 'nao_rolou']);
  igual('nova', rot('nova'), ['virou_negocio', 'voltar_depois', 'sem_interesse']);
  igual('rua', rot('rua'), ['fui', 'nao_fui']);

  checar('"pagou" não aparece num follow-up',
    rot('follow').indexOf('pagou') < 0 && rot('funil').indexOf('pagou') < 0,
    'montar as opções de uma lista genérica é como "pagou" chega a um negócio que ninguém '
      + 'mandou cobrar');
  checar('"proposta" não aparece numa visita de relacionamento',
    rot('relac').indexOf('proposta') < 0);
  checar('a rua não oferece nada que mexa no CRM',
    de('rua').every(function (o) { return !o.efeito || o.efeito === 'motivo'; }),
    'o bloco de rua não tem negócio: qualquer efeito ali seria tarefa órfã');

  /* CADA PROPÓSITO TEM UM CAMINHO PARA O "NÃO" — e é dele que o motivo volta. */
  ['follow', 'funil', 'cobrar', 'relac', 'nova', 'rua'].forEach(function (p) {
    checar('o propósito ' + p + ' tem uma saída para o que não aconteceu',
      de(p).filter(function (o) { return o.ruim; }).length === 1,
      'sem ela, o único jeito de tirar o compromisso do dia seria apagá-lo — e apagar é '
        + 'como a semana fica limpa sem ninguém saber o que houve');
  });

  igual('os motivos são uma lista fechada',
    vm.runInContext('PL6_MOTIVOS.map(function (m) { return m.id; })', c),
    ['dono_ausente', 'fechado', 'sem_tempo', 'sem_interesse', 'outro'],
    'texto livre no corpo de uma tarefa do CRM é campo aberto para qualquer coisa');
}());

checar('e as opções desenhadas saem da tabela do propósito daquele slot',
  /const prop = pl6SlotProposito\(slot\) \|\| 'funil';/.test(codigo)
    && /pl6ResultadosDe\(propId2\)\.map/.test(codigo),
  'ler o propósito da FAIXA daria as opções de cobrança a um follow-up quando a faixa '
    + 'estivesse em "Cobrar"');

console.log('');
console.log('6 · REMARCAR MOVE, LEVA A TAREFA E PRESERVA O PROPÓSITO');

checar('remarcar não grava resultado',
  (function () {
    /* O RAMO, E SÓ ELE: do `if` até o `return redesenhar()` que o fecha. Varrer 400
       caracteres a partir daqui cai no `return pl6RegistrarResultado` que encerra o
       verbo `res` — e a checagem reprova o código certo. */
    const i = codigo.indexOf("if (info.efeito === 'remarcar') {");
    if (i < 0) return false;
    const j = codigo.indexOf('return redesenhar();', i);
    if (j < 0) return false;
    const ramo = codigo.slice(i, j);
    return /s\.sel = \{ lead:/.test(ramo) && !/pl6RegistrarResultado/.test(ramo);
  }()),
  'o compromisso não aconteceu, ele mudou de hora — gravar "remarcado" como resultado '
    + 'faria o gestor ler um desfecho onde houve adiamento');
checar('ele vai para a mão marcado como remarcando',
  /deDi: di, deSi: si, remarcando: true/.test(codigo),
  'é o que separa o remarcar do arraste comum, que só ajusta o plano');
/* A SENTENÇA INTEIRA, e não o nome da função: `if (false) await criarTarefa...` deixa
   a chamada escrita e desligada, e foi assim que esta checagem passou verde contra uma
   sabotagem. Exige que a chamada seja o começo da sentença — nada de condição colada
   na frente dela. */
checar('e o próximo horário leva a tarefa junto',
  /const remarcando = !!s\.sel\.remarcando;/.test(codigo)
    && /if \(remarcando && leadRem && leadRem\._bruto/.test(codigo)
    && /\n\s*await criarTarefaVisitaNoHubspot\(leadRem\._bruto/.test(codigo),
  'a tarefa tem de ir junto: ele combinou outra hora com o cliente');
checar('pela rota de sempre, que deduplica',
  (tpl.match(/criarTarefaVisitaNoHubspot\(/g) || []).length >= 2
    && !/criar-tarefa-remarcar|api\/remarcar/.test(tpl),
  'a rota da tarefa já procura uma em aberto do mesmo assunto no mesmo dia e faz PATCH; '
    + 'rota nova duplicaria o que ela já resolve');
checar('e a agenda dele fica sabendo',
  /if \(remarcando[\s\S]{0,700}?registrarAgendamentoLocal\(leadRem\._bruto/.test(codigo),
  'escrever no CRM sem espelhar nas telas é a tela dizendo ✓ e o gestor lendo "não '
    + 'prometeu" — a guarda testar-passo-chega-na-agenda me pegou exatamente aqui');
checar('o propósito sobrevive à mudança de horário',
  /const pEra = pl6SlotProposito\(era\);/.test(codigo)
    && /Object\.assign\(\{ id: id, hora: hora \}, pEra/.test(codigo),
  'remontar o slot do zero tiraria a etiqueta de quem remarcasse');
checar('e o toast diz a verdade sobre a tarefa do dia antigo',
  /a do dia antigo continua lá/.test(tpl) && /tarefa do HubSpot remarcada/.test(tpl),
  'a rota deduplica por DIA: remarcar para outro dia cria no dia novo e deixa a antiga — '
    + 'prometer uma limpeza que a tela não faz é pior que avisar');

/* ══ O REGISTRO TEM DONO E HORA ═══════════════════════════════════════════════════
   A Daily do gestor vai mostrar o registro do executivo ao lado do que foi medido no
   CRM. Registro sem autor é afirmação sem dono, e sem hora não dá para saber se ele
   anotou na porta do restaurante ou na sexta à noite, tapando buraco.
   Achado por sabotagem: apagar o `por` não reprovava nada. */
checar('o registro guarda quem anotou e quando',
  /base\.r\.em = new Date\(\)\.toISOString\(\);/.test(codigo)
    && /if \(rep && rep\.ownerId\) base\.r\.por = String\(rep\.ownerId\);/.test(codigo),
  'registro sem autor é afirmação sem dono, e a Daily do gestor mostra os dois lado a lado');
checar('e o slot antigo não perde a hora nem o propósito quando ganha registro',
  /const base = \(typeof era === 'object'\) \? Object\.assign\(\{\}, era\) : \{ id: era \};/.test(codigo),
  'remontar o slot do zero aqui apagaria a hora e a etiqueta — é o mesmo defeito que o'
    + ' mover já teve, e está no commit dele');
checar('e "alterar" apaga o registro, e só ele',
  /if \(!tipo\) \{\s*delete base\.r;/.test(codigo),
  'apagar o slot inteiro tiraria o compromisso do dia; o que ele pediu foi corrigir o'
    + ' que anotou');

console.log('');
console.log('7 · O SLOT COM REGISTRO É LIDO, E O SLOT EM STRING TAMBÉM');

(function () {
  const c = ctxBase();
  ['pl6ResultadoDoSlot', 'pl6SlotProposito', 'pl6SlotId', 'pl6SlotRua', 'pl6SlotRel',
    'pl6SlotBloqueado', 'pl6SlotHora', 'pl6PorHora', 'pl6ItensDoDia']
    .forEach(function (f) { vm.runInContext(recortar(f), c); });
  const ler = vm.runInContext('pl6ResultadoDoSlot', c);
  const itens = vm.runInContext('pl6ItensDoDia', c);

  igual('o registro gravado é lido',
    ler({ id: '7', hora: '09:00', p: 'cobrar', r: { tipo: 'pagou', em: 'x', por: '1' } }),
    { tipo: 'pagou', motivo: null, em: 'x', por: '1' });
  igual('com motivo, ele vem junto',
    ler({ id: '7', r: { tipo: 'nao_rolou', motivo: 'fechado' } }).motivo, 'fechado');
  igual('slot em string não tem registro, e isso não é erro', ler('7'), null,
    'null aqui quer dizer "ninguém registrou ainda", que é o estado de toda semana '
      + 'gravada antes de hoje');
  igual('registro sem tipo não conta', ler({ id: '7', r: {} }), null,
    'objeto vazio no `r` faria a tela dizer que houve registro e não ter o que mostrar');

  const col = [
    { id: '7', hora: '09:00', p: 'cobrar', r: { tipo: 'pagou' } },
    '8',
    { id: '__rua', hora: '08:00', p: 'rua', duracao: '3h', regiao: 'Tijuca' }
  ];
  const lidos = itens(col, new Map([['7', { nome: 'A' }], ['8', { nome: 'B' }]]));
  igual('o item do dia carrega o registro',
    (lidos.filter(function (x) { return x.id === '7'; })[0] || {}).r.tipo, 'pagou');
  igual('e o slot em string continua sendo lido',
    (lidos.filter(function (x) { return x.id === '8'; })[0] || {}).tipo, 'visita',
    'é o formato da maior parte do que está no banco');
  igual('o bloco de rua carrega a janela que reservou',
    (lidos.filter(function (x) { return x.tipo === 'rua'; })[0] || {}).duracao, '3h',
    'sem ela, a evidência de rua contaria os check-ins do dia inteiro');
}());

checar('nenhum leitor de slot enumera campos',
  (function () {
    const ls = codigo.match(/\(typeof v === 'object'\)[^;\n]{0,80}/g) || [];
    return ls.length >= 4 && ls.every(function (l) {
      return !/Object\.keys|JSON\.stringify/.test(l);
    });
  }()),
  'leitor que enumera campos do slot transforma um campo novo em tela branca na outra aba');

console.log('');
console.log('8 · OS QUATRO ESTADOS DA EVIDÊNCIA, NUNCA DOIS JUNTOS');

(function () {
  const base = {
    agendaParaBRT: function (iso) { const d = new Date(iso); return new Date(d.getTime() - 3 * 3600 * 1000); },
    agendaChave: function (d) { return d.toISOString().slice(0, 10); },
    agendaHhmm: function (d) { return d.toISOString().slice(11, 16); }
  };
  const monta = function (evs, fila) {
    const c = ctxBase(Object.assign({}, base, {
      DATA: { agenda: evs },
      agendaNormalizar: function (x) { return x; },
      filaPwaResumo: function () { return fila || { porOwner: {} }; }
    }));
    ['pl6CheckinsDoDia', 'pl6ChecksNaJanela', 'pl6EvidenciaSemCheck', 'pl6EvidenciaDoSlot']
      .forEach(function (f) { vm.runInContext(recortar(f), c); });
    return vm.runInContext('pl6EvidenciaDoSlot', c);
  };

  const ev = function (dealId, isoUtc) {
    return { registro: true, inicio: isoUtc, ownerId: '9', dealId: dealId };
  };

  /* 1 · check-in daquele negócio, com a hora */
  const e1 = monta([ev('77', '2026-09-23T13:41:00.000Z')]);
  igual('check-in do negócio traz a hora de Brasília',
    e1({ tipo: 'visita', id: '77' }, '2026-09-23', '9').txt, 'check-in 10:41 ✓');

  /* 2 · contagem no bloco de rua, dentro da janela */
  const e2 = monta([
    ev(null, '2026-09-23T11:10:00.000Z'),   /* 08:10 — dentro */
    ev(null, '2026-09-23T12:30:00.000Z'),   /* 09:30 — dentro */
    ev(null, '2026-09-23T13:20:00.000Z'),   /* 10:20 — dentro */
    ev(null, '2026-09-23T19:00:00.000Z')    /* 16:00 — fora da janela */
  ]);
  igual('a rua conta os check-ins DA JANELA que reservou',
    e2({ tipo: 'rua', hora: '08:00', duracao: '3h' }, '2026-09-23', '9').txt,
    '3 check-ins no bloco',
    'contar o dia inteiro daria crédito de rua ao que aconteceu às quatro da tarde');
  igual('e o singular não sai errado',
    monta([ev(null, '2026-09-23T11:10:00.000Z')])(
      { tipo: 'rua', hora: '08:00', duracao: '2h' }, '2026-09-23', '9').txt,
    '1 check-in no bloco');

  /* 3 · fila do app */
  const e3 = monta([], { porOwner: { 9: { pendentes: 2 } } });
  igual('coisa presa na fila do app é "não sabemos"',
    e3({ tipo: 'visita', id: '77' }, '2026-09-23', '9').txt,
    'check-in na fila do app — não subiu');
  checar('e ela sai em âmbar, não em verde nem em cinza',
    e3({ tipo: 'visita', id: '77' }, '2026-09-23', '9').cor === '#8A6516');

  /* 4 · sem check-in */
  const e4 = monta([]);
  igual('sem nada, a tela diz "sem check-in"',
    e4({ tipo: 'visita', id: '77' }, '2026-09-23', '9').txt, 'sem check-in');
  checar('e em cinza, sem fundo: é ausência, não acusação',
    e4({ tipo: 'visita', id: '77' }, '2026-09-23', '9').cor === '#B4AC9C'
      && e4({ tipo: 'visita', id: '77' }, '2026-09-23', '9').bg === 'transparent');

  /* OS DOIS ÚLTIMOS SÃO EXCLUDENTES — e é isso que o prompt pede em letras. */
  checar('"sem check-in" e "na fila do app" nunca aparecem juntos',
    e3({ tipo: 'visita', id: '77' }, '2026-09-23', '9').txt
      !== e4({ tipo: 'visita', id: '77' }, '2026-09-23', '9').txt
      && !/sem check-in/.test(e3({ tipo: 'visita', id: '77' }, '2026-09-23', '9').txt),
    'com a fila pendente, "sem check-in" seria uma afirmação sobre o celular da pessoa');

  /* COMPROMISSO DE OUTRO DONO E DE OUTRO DIA NÃO CONTAM. */
  igual('check-in de outro dia não conta',
    monta([ev('77', '2026-09-22T13:41:00.000Z')])(
      { tipo: 'visita', id: '77' }, '2026-09-23', '9').txt, 'sem check-in');
  igual('e o de outro negócio também não',
    monta([ev('88', '2026-09-23T13:41:00.000Z')])(
      { tipo: 'visita', id: '77' }, '2026-09-23', '9').txt, 'sem check-in');
}());

console.log('');
console.log('como foi: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
