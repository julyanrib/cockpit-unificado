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

/* ══ O TRECHO DO FILTRO, TIRADO DO TEMPLATE E EXECUTADO ══════════════════════════════
   Recorta do `const filtro =` até o `const municaoOrd`, que é onde a munição termina de
   ser peneirada. Não é uma cópia do filtro: é o filtro. */
function recortarFiltro() {
  const ini = tpl.indexOf('  const filtro = s.fonte || ');
  const fim = tpl.indexOf('  const municaoOrd = ', ini);
  if (ini < 0 || fim < 0) {
    console.error('FALHA: não achei o trecho do filtro da munição (âncora perdida).');
    process.exit(1);
  }
  return tpl.slice(ini, fim);
}
const TRECHO = recortarFiltro();

checar('o trecho do filtro foi encontrado', TRECHO.length > 200,
  'sem o recorte as checagens abaixo mediriam o vazio');

function rodarFiltro(livres, s) {
  const ctx = {
    livres: livres, s: s, String: String, Number: Number, Array: Array, Object: Object,
    /* a MESMA normalização do template, recortada dele */
    resultado: null
  };
  vm.createContext(ctx);
  vm.runInContext(recortarFuncao(tpl, 'pl6ChaveBairro'), ctx);
  vm.runInContext(TRECHO + '\n resultado = { daOrigem: daOrigem, porBairro: porBairro, munFilt: munFilt };', ctx);
  return ctx.resultado;
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
  const r = rodarFiltro(BASE, { fonte: 'todas', terr: 'b:barra da tijuca', q: '' });
  const nomes = r.munFilt.map(function (l) { return l.nome; });
  checar('com um bairro escolhido, a carteira inteira continua na munição',
    ['Na Brasa', 'Salseiro brasa e lenha', 'Coliseu Taquara', 'Aloha']
      .every(function (n) { return nomes.indexOf(n) >= 0; }),
    'medido na produção: 235 dos 239 negócios não têm bairro, então o filtro antigo '
      + 'apagava a carteira inteira da tela · veio ' + JSON.stringify(nomes));
  checar('e a prospecção de OUTRO bairro sai, que é para isso que o chip serve',
    nomes.indexOf('Sunomono') < 0,
    'o chip continua servindo para montar rota de rua');
  checar('a prospecção DAQUELE bairro fica',
    nomes.indexOf('Portenita Restaurante') >= 0 && nomes.indexOf('Bololo Olegario') >= 0);
}());

/* ══ 2. A BUSCA POR NOME OLHA TUDO ══════════════════════════════════════════════════
   Este é o caso exato que gerou o duplicado do "Na Brasa": bairro escolhido, nome
   digitado, zero resultado, e o executivo criando de novo. */
(function () {
  const r = rodarFiltro(BASE, { fonte: 'todas', terr: 'b:barra da tijuca', q: 'na brasa' });
  igual('procurar pelo nome acha a conta mesmo com outro bairro escolhido',
    r.munFilt.map(function (l) { return l.nome; }), ['Na Brasa'],
    'era assim que a tela dizia "0 contas" para uma conta que existia, e o executivo criava '
      + 'a segunda');
  /* E A CONTA DE PROSPECÇÃO DE OUTRO BAIRRO TAMBÉM. Este caso é o que separa os dois
     consertos: a carteira já é poupada pelo filtro, mas quem digita "sunomono" com a
     Barra escolhida está procurando o Sunomono, e ele é da Tijuca. Sem este caso, a
     sabotagem que devolve a busca para dentro do bairro passa verde. */
  const rp = rodarFiltro(BASE, { fonte: 'todas', terr: 'b:barra da tijuca', q: 'sunomono' });
  igual('procurar pelo nome acha conta de prospecção de outro bairro',
    rp.munFilt.map(function (l) { return l.nome; }), ['Sunomono'],
    'a busca tem de olhar a munição inteira, e não a fatia do chip');
  const semNada = rodarFiltro(BASE, { fonte: 'todas', terr: null, q: 'coliseu' });
  igual('e sem bairro escolhido continua achando', semNada.munFilt.map(l => l.nome), ['Coliseu Taquara']);
  const nadaMesmo = rodarFiltro(BASE, { fonte: 'todas', terr: null, q: 'restaurante que nao existe' });
  igual('o que não existe continua devolvendo vazio', nadaMesmo.munFilt.length, 0,
    'se a busca passasse a achar tudo, ela deixaria de ser busca');
}());

/* ══ 3. O FILTRO DE ORIGEM CONTINUA VALENDO ═════════════════════════════════════════
   O conserto não podia arrebentar o chip "minha carteira" nem os da base nova. */
(function () {
  const soCarteira = rodarFiltro(BASE, { fonte: 'carteira', terr: null, q: '' });
  igual('o chip "minha carteira" mostra só a carteira', soCarteira.munFilt.length, 4);
  const soCasa = rodarFiltro(BASE, { fonte: 'casa', terr: null, q: '' });
  igual('o chip "casa dos dados" mostra só a base dele', soCasa.munFilt.map(l => l.nome),
    ['Portenita Restaurante', 'Bololo Olegario']);
  const casaComBairro = rodarFiltro(BASE, { fonte: 'casa', terr: 'b:tijuca', q: '' });
  igual('origem e bairro se somam, como na prancha', casaComBairro.munFilt.length, 0,
    'nenhuma conta da casa dos dados está na Tijuca nesta base');
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
