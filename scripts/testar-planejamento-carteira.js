#!/usr/bin/env node
/* ============================================================================
   O LEAD É DA CARTEIRA, NÃO DO BAIRRO (23/09/26)

   Julyan, olhando o Planejamento: "os leads não podem ficar preso a região, ele pode
   movimentar qlq lead da carteira... se o lead já foi criado e está na carteira, NÃO PODE
   CRIAR DE NOVO E DUPLICAR... ele não pode ficar vinculado a bairro (só a carteira)".

   MEDIDO NA PRODUÇÃO: dos 239 negócios abertos do time, 235 não têm bairro e 125 não têm
   bairro, nem cidade, nem CEP. O bloco de bairros é feito quase inteiro da base de
   prospecção — então clicar num bairro escondia a carteira inteira.

   OS TRÊS DEFEITOS ERAM UM SÓ, EM CASCATA:
     1. o chip de bairro removia da munição tudo que não fosse daquele bairro;
     2. a busca por nome herdava esse corte, então digitar o nome achava zero;
     3. a criação de lead só checava duplicata contra a base de prospecção, nunca contra
        a carteira — e o duplicado nascia.

   ESTA SUÍTE RODA O CÓDIGO DE VERDADE: o trecho do filtro sai do template e é executado
   em vm com contas montadas como a produção monta (carteira sem região nenhuma).

   Uso: node scripts/testar-planejamento-carteira.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
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

function recortarFuncao(fonte, nome) {
  const assinatura = fonte.indexOf('async function ' + nome + '(') > -1
    ? 'async function ' + nome + '(' : 'function ' + nome + '(';
  const i = fonte.indexOf(assinatura);
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe no template.'); process.exit(1); }
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

/* ══ A BUSCA E O FILTRO DA FILA, TIRADOS DO TEMPLATE E EXECUTADOS ═══════════════════
   20/11/26: a munição da v2 (o trecho `comProposito`… `municaoOrd`) saiu com a tela v2. A
   regra que ela protegia continua, agora na v3: PLV3.linhasDoFiltro, PLV3.linhasBase e a
   busca (PLV3.chave, casaBusca, chaveDaLinha, chaveDaConta). Não é cópia: são elas. */
function recortarPLV3(nome) {
  const a = tpl.indexOf('\nPLV3.' + nome + ' = function');
  if (a < 0) { console.error('FALHA: PLV3.' + nome + ' não existe no template.'); process.exit(1); }
  let d = 0, j = tpl.indexOf('{', a), viu = false;
  while (j < tpl.length) { const c = tpl[j]; if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; } j++; }
  return tpl.slice(a + 1, j + 1) + ';';
}
const TRECHO = ['chave', 'casaBusca', 'chaveDaConta', 'chaveDaLinha', 'linhasBase', 'linhasDoFiltro'].map(recortarPLV3).join('\n');
checar('o trecho da fila foi encontrado', TRECHO.length > 800,
  'sem o recorte as checagens abaixo mediriam o vazio');

/* a fila como PLV3.dados a entrega: carteira (semL/funil), contas-alvo, reciclagem */
function rodarFiltro(BASEX, s) {
  const lin = function (l) { return { ref: l.id, nome: l.nome, bairro: l.regiao, bairroNome: l._bruto.bairro || '' }; };
  const carteira = BASEX.filter(function (l) { return l.tipo === 'c'; }).map(lin);
  const D = { semL: carteira, cobrar: [], relac: [], recicl: [], funil: carteira,
    alvos: BASEX.filter(function (l) { return l.tipo === 'n'; }).map(lin), busca: [],
    porId: new Map(BASEX.map(function (l) { return [l.id, l]; })) };
  const ctx = { Map: Map, String: String, Object: Object, PLV3: { st: { filtro: s.filtro, q: s.q, faixa: null, linhas: {}, bSel: s.terr ? [s.terr] : [] } } };
  vm.createContext(ctx);
  vm.runInContext(TRECHO, ctx);
  ctx.PLV3.faixas = function () { return []; };
  return { munFilt: ctx.PLV3.linhasDoFiltro(D) };
}

/* ══ A BASE: como a produção realmente é ═══════════════════════════════════════════
   Quatro da carteira SEM região (é o caso de 235 dos 239 negócios do time) e três contas
   de prospecção com bairro. */
const BASE = [
  { id: 'c-1', tipo: 'c', nome: 'Na Brasa', regiao: null, _bruto: {} },
  { id: 'c-2', tipo: 'c', nome: 'Salseiro brasa e lenha', regiao: null, _bruto: {} },
  { id: 'c-3', tipo: 'c', nome: 'Coliseu Taquara', regiao: null, _bruto: {} },
  { id: 'c-4', tipo: 'c', nome: 'Aloha', regiao: 'b:tijuca', _bruto: { bairro: 'Tijuca' } },
  { id: 'n-1', tipo: 'n', grupo: 'casa', nome: 'Portenita Restaurante', regiao: 'b:barra da tijuca', _bruto: { bairro: 'Barra da Tijuca' } },
  { id: 'n-2', tipo: 'n', grupo: 'casa', nome: 'Bololo Olegario', regiao: 'b:barra da tijuca', _bruto: { bairro: 'Barra da Tijuca' } },
  { id: 'n-3', tipo: 'n', grupo: 'aval', nome: 'Sunomono', regiao: 'b:tijuca', _bruto: { bairro: 'Tijuca' } }
];

/* ══ 1. O BAIRRO NÃO ESCONDE A CARTEIRA ═════════════════════════════════════════════ */
(function () {
  const r = rodarFiltro(BASE, { filtro: 'funil', terr: 'b:barra da tijuca', q: '' });
  const nomes = r.munFilt.map(function (l) { return l.nome; });
  /* `terr` (o bairro escolhido no dia) vai no estado de propósito: é a prova de que ele não
     volta a filtrar a fila pelas costas — na v3 o bairro do dia só orienta as sugestões. */
  checar('com um bairro no estado, a carteira inteira continua na fila',
    ['Na Brasa', 'Salseiro brasa e lenha', 'Coliseu Taquara', 'Aloha']
      .every(function (n) { return nomes.indexOf(n) >= 0; }),
    'medido na produção: 235 dos 239 negócios não têm bairro · veio ' + JSON.stringify(nomes));
  const rn = rodarFiltro(BASE, { filtro: 'alvo', terr: 'b:barra da tijuca', q: '' });
  const nomesN = rn.munFilt.map(function (l) { return l.nome; }).sort();
  checar('e a conta-alvo de outro bairro TAMBÉM continua',
    JSON.stringify(nomesN) === JSON.stringify(['Bololo Olegario', 'Portenita Restaurante', 'Sunomono']),
    'o Sunomono é da Tijuca e a Barra estava escolhida · veio ' + JSON.stringify(nomesN));
}());

/* ══ 2. A BUSCA POR NOME OLHA TUDO ══════════════════════════════════════════════════
   Este é o caso exato que gerou o duplicado do "Na Brasa": bairro escolhido, nome
   digitado, zero resultado, e o executivo criando de novo. */
(function () {
  const r = rodarFiltro(BASE, { filtro: 'alvo', terr: 'b:barra da tijuca', q: 'na brasa' });
  igual('procurar pelo nome acha a conta da carteira mesmo com outro filtro e outro bairro escolhidos',
    r.munFilt.map(function (l) { return l.nome; }), ['Na Brasa'],
    'era assim que a tela dizia "0 contas" para uma conta que existia, e o executivo criava '
      + 'a segunda');
  const rp = rodarFiltro(BASE, { filtro: 'funil', terr: 'b:barra da tijuca', q: 'sunomono' });
  igual('procurar pelo nome acha conta-alvo de outro bairro, com o filtro da carteira aberto',
    rp.munFilt.map(function (l) { return l.nome; }), ['Sunomono'],
    'a busca tem de olhar a fila inteira, e não a fatia do filtro');
  const semNada = rodarFiltro(BASE, { filtro: 'sem', terr: null, q: 'coliseu' });
  igual('e sem bairro escolhido continua achando', semNada.munFilt.map(l => l.nome), ['Coliseu Taquara']);
  const rua = rodarFiltro(BASE, { filtro: 'sem', terr: null, q: 'tijuca sunomono' });
  igual('palavra por palavra, em qualquer ordem, no nome e no bairro', rua.munFilt.map(l => l.nome), ['Sunomono']);
  const nadaMesmo = rodarFiltro(BASE, { filtro: 'sem', terr: null, q: 'restaurante que nao existe' });
  igual('o que não existe continua devolvendo vazio', nadaMesmo.munFilt.length, 0,
    'se a busca passasse a achar tudo, ela deixaria de ser busca');
}());

/* ══ 3. NINGUÉM SOME DA FILA ═══════════════════════════════════════════════════════
   Na v2 eram seis propósitos e o sexto ("Avançar o funil") existia para nenhuma conta
   da carteira sumir. Na v3 o papel é do filtro "Todo o funil" (D.funil). */
(function () {
  const r = rodarFiltro(BASE, { filtro: 'funil', terr: null, q: '' });
  igual('"Todo o funil" traz a carteira inteira',
    r.munFilt.map(function (l) { return l.nome; }).sort(),
    ['Aloha', 'Coliseu Taquara', 'Na Brasa', 'Salseiro brasa e lenha'],
    'é o gesto sem nome da prancha, e é a maior parte do trabalho do dia');
  checar('e o "Todo o funil" da v3 é a carteira sem a base, fora da grade',
    /const funil = todos\.filter\(function \(l\) \{ return l\.tipo === 'c' && !l\.base && !naGradeFutura\[l\.id\]; \}\)/.test(tpl));
}());

/* ══ 4. CRIAR LEAD ENXERGA A CARTEIRA ═══════════════════════════════════════════════ */
function criarCom(carteira, reciclagem, prospeccao, campos) {
  const ctx = {
    DATA: { leadsReciclagem60: reciclagem || [], territorios: [] },
    prospeccaoCache: prospeccao || [],
    meusNegociosAbertos: function () { return carteira || []; },
    prospeccaoNormalizarTexto: function (v) {
      return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    },
    supa: {},
    String: String, Number: Number, Array: Array, Object: Object, Date: Date,
    materializarLeadDoMapa: function () { return { lead: { nome: 'CRIOU' } }; },
    carregarProspeccao: function () { return null; }
  };
  vm.createContext(ctx);
  vm.runInContext(recortarFuncao(tpl, 'pl6CriarLead'), ctx);
  /* SEGURO: a função é async e um ReferenceError dentro dela (o caso clássico de alguém
     renomear a declaração e deixar os usos para trás) MATAVA a suíte inteira em vez de
     reprovar a checagem pelo nome. Suíte que estoura não diz o que quebrou — é a quinta
     vez que este projeto paga por isso. */
  return vm.runInContext('pl6CriarLead', ctx)({ ownerId: '86100506', name: 'Bruno Martins' }, campos)
    .catch(function (e) { return { erro: 'estourou: ' + (e && e.message) }; });
}

const CARTEIRA = [{ id: 1, name: 'NA BRASA', stage: 'Negociação', celular: '21999199791' }];

(async function () {
  /* O CASO REAL: "na brasa" já está em Negociação e ele tenta criar de novo. */
  const r1 = await criarCom(CARTEIRA, [], [], { nome: 'na brasa', telefone: '' });
  checar('não cria o que já está na carteira',
    !!(r1 && r1.erro) && r1.erro.indexOf('carteira') > -1,
    'é o caso do "Na Brasa": Negociação desde 16/09, criado de novo em 21/09 · veio '
      + JSON.stringify(r1));

  /* PELO TELEFONE, mesmo com o nome escrito de outro jeito e em outro formato. */
  const r2 = await criarCom(CARTEIRA, [], [], { nome: 'Na Brasa Niterói 2', telefone: '+55-21 99919-9791' });
  checar('nem o que casa só pelo telefone',
    !!(r2 && r2.erro) && r2.erro.indexOf('telefone') > -1,
    'o mesmo número aparece como "21999199791" e "+55-21 99919-9791" no portal · veio '
      + JSON.stringify(r2));

  /* A RECICLAGEM também é carteira dele. */
  const r3 = await criarCom([], [{ ownerId: '86100506', name: 'Bar do Zé', celular: '' }], [],
    { nome: 'bar do zé', telefone: '' });
  checar('nem o que está na reciclagem',
    !!(r3 && r3.erro) && r3.erro.indexOf('reciclagem') > -1, 'veio ' + JSON.stringify(r3));

  /* A BASE DE PROSPECÇÃO, que já era checada, continua checada. */
  const r4 = await criarCom([], [], [{ responsavel_owner_id: '86100506', nome: 'Sunomono', bairro: 'Tijuca' }],
    { nome: 'sunomono', telefone: '' });
  checar('e nem o que já está na munição de prospecção',
    !!(r4 && r4.erro) && r4.erro.indexOf('munição') > -1, 'veio ' + JSON.stringify(r4));

  /* ══ NEGÓCIO FECHADO NÃO BLOQUEIA (23/09/26, achado clicando no preview) ═══════════
     Criar um lead com o nome de um cliente GANHO, em ONBOARDING ou PERDIDO era recusado
     com "já está na sua carteira, em Enviado Onboarding". A função meusNegociosAbertos
     tem esse nome mas devolve TODAS as etapas — é ela que alimenta o funil inteiro.
     Cliente que churnou volta a ser lead, restaurante perdido em março é o que a
     reciclagem resgata, e quem fechou pode abrir uma segunda loja. */
  const FECHADOS = [
    { id: 9, name: 'Cliente que Churnou', stage: 'Ganho', stageId: '1396006162' },
    { id: 10, name: 'Em Onboarding', stage: 'Enviado Onboarding', stageId: '1396006163' },
    { id: 11, name: 'Perdido em Março', stage: 'Perdido', stageId: '1396006164' }
  ];
  const rf1 = await criarCom(FECHADOS, [], [], { nome: 'Cliente que Churnou', telefone: '' });
  checar('cliente ganho não impede de trabalhar o lugar de novo', !!(rf1 && rf1.lead) && !rf1.erro,
    'veio ' + JSON.stringify(rf1));
  const rf2 = await criarCom(FECHADOS, [], [], { nome: 'Perdido em Março', telefone: '' });
  checar('nem negócio perdido', !!(rf2 && rf2.lead) && !rf2.erro,
    'é exatamente para isso que a reciclagem existe · veio ' + JSON.stringify(rf2));
  const rf3 = await criarCom(FECHADOS, [], [], { nome: 'Em Onboarding', telefone: '' });
  checar('nem cliente em onboarding', !!(rf3 && rf3.lead) && !rf3.erro,
    'veio ' + JSON.stringify(rf3));

  /* O NEGÓCIO DE OUTRO DONO NÃO BLOQUEIA: a carteira é dele, não do time. */
  const r5 = await criarCom([], [{ ownerId: '99999999', name: 'Padaria X' }], [],
    { nome: 'Padaria X', telefone: '' });
  checar('negócio de outro executivo não impede a criação',
    !(r5 && r5.erro), 'travar pelo lead do colega tiraria conta de rua do time · veio '
      + JSON.stringify(r5));

  /* O QUE É NOVO DE VERDADE CONTINUA NASCENDO — senão o conserto vira trava. */
  const r6 = await criarCom(CARTEIRA, [], [], { nome: 'Boteco que nunca existiu', telefone: '21900000000' });
  checar('conta nova de verdade continua sendo criada',
    !!(r6 && r6.lead) && !r6.erro,
    'Julyan: "quando eu falo obrigatório, é deixar eles ciente disso, não travar nada" · veio '
      + JSON.stringify(r6));

  /* TELEFONE CURTO NÃO CASA COM NADA: 4 dígitos iguais no fim não são o mesmo número. */
  const r7 = await criarCom([{ id: 2, name: 'Outro Lugar', celular: '9791' }], [], [],
    { nome: 'Lugar Novo', telefone: '21999199791' });
  checar('telefone curto demais não bloqueia por engano',
    !!(r7 && r7.lead) && !r7.erro,
    'a comparação exige 8 dígitos dos dois lados · veio ' + JSON.stringify(r7));

  /* O ERRO DIZ ONDE ESTÁ. "já existe" sem o lugar manda procurar no escuro — que é o que
     produziu o duplicado. */
  checar('o aviso diz em que etapa a conta está',
    !!(r1 && r1.erro) && r1.erro.indexOf('Negociação') > -1,
    'veio ' + JSON.stringify(r1 && r1.erro));

  console.log('');
  console.log('planejamento · carteira: ' + ok + ' verificações');
  if (falhas.length) {
    console.log('');
    falhas.forEach(function (f) { console.log('  ✗ ' + f); });
    console.log('');
    console.log('FALHOU: ' + falhas.length);
    process.exit(1);
  }
  console.log('tudo certo.');
}());
