#!/usr/bin/env node
/* ============================================================================
   RELACIONAMENTO E COBRANÇA SÃO VISITA COM NEGÓCIO (23/09/26)

   Julyan: "pode colocar no planejamento para preencher slots (cobrar pagamento e
   selecionar o lead q tá na carteira) visita de relacionamento (selecionar o lead q tem
   na carteira)... a rota tem q ser uma só e com perfeição" — e, sobre de onde sai o
   cliente: "a, os ganhos e onboarding".

   Antes, os dois eram BLOCOS SENTINELA: ocupavam uma hora e não geravam tarefa nenhuma no
   CRM, porque não tinham negócio para pendurar. Agora escolhem um negócio de verdade e
   passam pelo MESMO caminho de qualquer card.

   O QUE ESTA SUÍTE MEDE, rodando o código do template em vm:
     · a base de clientes existe e sai de Ganho + Enviado Onboarding, e SÓ deles;
     · ela não polui "todas" nem "minha carteira" — cliente fechado no topo da fila do dia
       é ruído;
     · o filtro de cobrança pega Ag. Pagamento e não pega mais nada;
     · o motivo sai do NEGÓCIO (não do estado da tela), então vale por qualquer caminho;
     · e o motivo vira linha no CORPO da tarefa, nunca no assunto — mexer no prefixo do
       assunto quebra AGENDA_RE_TITULO e agendaTipoDoTexto em cadeia, e isso está escrito
       dentro de criar-tarefa-rota.js.

   Uso: node scripts/testar-planejamento-relacionamento.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const rota = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'criar-tarefa-rota.js'), 'utf8');

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
function recortar(fonte, nome) {
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

/* AS ETAPAS SAEM DO TEMPLATE, não de números repetidos aqui. */
const mBase = tpl.match(/const PL6_ETAPAS_BASE = \[([^\]]*)\];/);
const mPgto = tpl.match(/const PL6_ETAPA_AG_PGTO = '(\d+)';/);
if (!mBase || !mPgto) { console.error('FALHA: não achei as etapas da base/cobrança.'); process.exit(1); }
const ETAPAS_BASE = mBase[1].split(',').map(function (s) { return s.trim().replace(/'/g, ''); });
const AG_PGTO = mPgto[1];

igual('a base é Ganho + Enviado Onboarding', ETAPAS_BASE, ['1396006162', '1396006163'],
  'foi a escolha dele: "a, os ganhos e onboarding"');
igual('e a cobrança é Ag. Pagamento', AG_PGTO, '1395880473');

/* ══ 1. pl6Base, rodando de verdade ═════════════════════════════════════════════════ */
const NEGOCIOS = [
  { id: 1, name: 'Cliente Ganho', stageId: '1396006162', stage: 'Ganho', ownerId: '86100505' },
  { id: 2, name: 'Cliente Onboarding', stageId: '1396006163', stage: 'Enviado Onboarding', ownerId: '86100505' },
  { id: 3, name: 'Em Negociação', stageId: '1395880472', stage: 'Negociação', ownerId: '86100505' },
  { id: 4, name: 'Esperando pagar', stageId: AG_PGTO, stage: 'Ag. Pagamento', ownerId: '86100505' },
  { id: 5, name: 'Perdido', stageId: '1396006164', stage: 'Perdido', ownerId: '86100505' }
];

function rodarBase() {
  const ctx = {
    String: String, Number: Number, Array: Array, Object: Object, Map: Map,
    STAGE_LABELS: {},
    meusNegociosAbertos: function () { return NEGOCIOS; },
    pl6RegiaoDoLead: function () { return null; }
  };
  vm.createContext(ctx);
  vm.runInContext(tpl.match(/const PL6_ETAPAS_BASE = \[[^\]]*\];/)[0], ctx);
  vm.runInContext(recortar(tpl, 'pl6Base'), ctx);
  return vm.runInContext('pl6Base', ctx)({ ownerId: '86100505' }, []);
}
const base = rodarBase();
igual('a base traz só ganho e onboarding', base.map(function (x) { return x.nome; }),
  ['Cliente Ganho', 'Cliente Onboarding'],
  'negócio em andamento não é cliente da base, e perdido muito menos');
checar('e cada um deles carrega o dealId', base.every(function (x) { return !!x.dealId; }),
  'sem dealId a tarefa nasce órfã no CRM — que é exatamente o que o bloco sentinela fazia');
checar('marcados como base', base.every(function (x) { return x.base === true; }));
checar('e como negócio, para seguirem o caminho de qualquer card',
  base.every(function (x) { return x.tipo === 'c'; }),
  "tipo 'c' é o que faz a ficha, o arraste e o agendar funcionarem sem código novo");
checar('cliente da base não estoura régua',
  base.every(function (x) { return x.sla === false; }),
  'a régua é de avanço de etapa e ele já chegou ao fim — marcar sla poria a base inteira '
    + 'no topo da fila do dia');

/* ══ 2. O PROPÓSITO DE CADA CONTA, rodando a função do template ═════════════════════
   Julyan pediu que relacionamento e cobrança "selecionem o lead que está na carteira".
   Na v5 isso virou chip de origem; na v7 (23/09/26) virou propósito, e o gesto seguinte
   continua sendo o mesmo — escolher o card e o horário — para a tarefa nascer amarrada
   ao negócio, que é o que o bloco sentinela nunca conseguiu fazer.
   A checagem roda pl6PropositoDoLead DE VERDADE, recortada do template. */
const LIVRES = [
  { nome: 'Cliente Ganho', tipo: 'c', base: true, stageId: '1396006162' },
  { nome: 'Cliente Onboarding', tipo: 'c', base: true, stageId: '1396006163' },
  { nome: 'Em Negociação', tipo: 'c', stageId: '1395880472' },
  { nome: 'Esperando pagar', tipo: 'c', stageId: AG_PGTO },
  { nome: 'Conta da casa', tipo: 'n', grupo: 'casa', stageId: '' }
];
const ctxProp = { String: String, Number: Number, Array: Array, Date: Date, Math: Math, isNaN: isNaN };
vm.createContext(ctxProp);
vm.runInContext(tpl.match(/const PL6_ETAPA_AG_PGTO = '\d+';/)[0], ctxProp);
vm.runInContext(tpl.match(/const PL6_PROPOSITOS = \[[\s\S]*?\n\];/)[0], ctxProp);
['pl6Proposito', 'pl6AtrasoDoPasso', 'pl6PropositoDoLead'].forEach(function (f) {
  vm.runInContext(recortar(tpl, f), ctxProp);
});
const doProposito = vm.runInContext('pl6PropositoDoLead', ctxProp);
function noProposito(p) {
  return LIVRES.filter(function (l) { return doProposito(l) === p; })
    .map(function (l) { return l.nome; });
}

igual('o propósito de relacionamento traz só a base', noProposito('relac'),
  ['Cliente Ganho', 'Cliente Onboarding']);
igual('o propósito de cobrança traz só Ag. Pagamento', noProposito('cobrar'), ['Esperando pagar']);
igual('a base NÃO aparece em nenhum outro propósito',
  ['funil', 'follow', 'nova'].map(noProposito).reduce(function (a, b) { return a.concat(b); }, [])
    .filter(function (n) { return n.indexOf('Cliente ') === 0; }), [],
  'cliente fechado no meio dos leads a converter é ruído na fila do dia');
igual('a conta de prospecção fica em "conta nova"', noProposito('nova'), ['Conta da casa']);
igual('e o resto da carteira cai em "avançar o funil"', noProposito('funil'), ['Em Negociação'],
  'sem o sexto propósito, 119 dos 140 negócios abertos do time sumiam da munição');
checar('nenhuma conta fica sem propósito',
  LIVRES.every(function (l) { return !!doProposito(l); }),
  'propósito nulo é conta invisível — e o Julyan pediu o contrário: "ele pode movimentar'
    + ' qualquer lead da carteira"');

/* ══ 3. O MOTIVO SAI DO NEGÓCIO ═════════════════════════════════════════════════════ */
const iAg = tpl.indexOf('const motivoDaVisita = ');
const trechoMotivo = iAg > -1 ? tpl.slice(iAg, iAg + 220) : '';
checar('o motivo é decidido no agendamento', trechoMotivo.length > 0,
  'sem ele a tarefa de relacionamento chega ao CRM sem dizer por que existe');
checar('e sai do negócio, não do estado da tela',
  /l\.base \?/.test(trechoMotivo) && /l\.stageId/.test(trechoMotivo)
    && !/s\.fonte|pl6UI/.test(trechoMotivo),
  'lido do filtro, daria motivo errado para quem chegou pela busca ou pelo arraste');
checar('o motivo viaja na chamada da tarefa',
  /opcoes && opcoes\.motivo \? \{ motivo: String\(opcoes\.motivo\) \}/.test(tpl),
  'decidir o motivo e não mandá-lo é a promessa na tela com silêncio no código');

/* ══ 4. NO CORPO DA TAREFA, NUNCA NO ASSUNTO ════════════════════════════════════════ */
checar('a rota conhece os dois motivos',
  /relacionamento: 'Motivo: visita de relacionamento/.test(rota)
    && /cobranca: 'Motivo: cobrar pagamento/.test(rota),
  'motivo que o servidor não sabe traduzir não aparece para ninguém');
checar('a lista de motivos é fechada',
  /MOTIVO_ROTULO\[String\(\(req\.body && req\.body\.motivo\) \|\| ''\)\] \|\| null/.test(rota),
  'texto livre do navegador no corpo de uma tarefa do CRM é campo aberto para qualquer coisa');
checar('o motivo NÃO entra no assunto da tarefa',
  !/prefixoAssunto[\s\S]{0,200}motivo/.test(rota) && !/assunto[^\n]*motivo/i.test(rota),
  'o assunto tem de continuar "Visita - X": AGENDA_RE_TITULO e agendaTipoDoTexto fazem '
    + 'parsing dele em cadeia, e está escrito dentro do próprio arquivo da rota');
checar('e o assunto continua sendo prefixo + nome',
  /const assunto = `\$\{prefixoAssunto\} - \$\{nome\}`;/.test(rota));

/* ══ 5. A RUA CONTINUA SENDO BLOCO, E O __rel GRAVADO CONTINUA SENDO LIDO ═══════════ */
checar('só a rua é oferecida como bloco sem negócio',
  /blocos: \[PL6_RUA\]\.map/.test(tpl),
  'relacionamento virou filtro porque agora tem negócio; a rua não tem conta definida '
    + 'de verdade');
checar('mas o bloco de relacionamento continua LEGÍVEL',
  /if \(s === PL6_REL\) \{/.test(tpl),
  'semana já gravada com o bloco antigo viraria slot vazio na segunda de manhã');

console.log('');
console.log('planejamento · relacionamento e cobrança: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
