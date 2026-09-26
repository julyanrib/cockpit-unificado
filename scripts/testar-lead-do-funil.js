// scripts/testar-lead-do-funil.js
//
// PROVA DE QUE A EXTRAÇÃO NÃO MUDOU UMA CONTA (26/09/26). lib/lead-do-funil.js saiu
// de dentro de scripts/fetch-hubspot.js. Este teste pega o fetch-hubspot.js ANTERIOR
// à extração (do git, antes do commit que a fez), roda o mapeamento de card antigo e
// o novo com os mesmos negócios e exige saída IDÊNTICA, campo a campo.
//
//   node scripts/testar-lead-do-funil.js [<revisão-do-arquivo-antigo>]
//
// Sem revisão, usa origin/main (onde a extração ainda não está). Depois do merge, a
// revisão antiga é o commit anterior ao da extração.

const { execSync } = require('child_process');
const vm = require('vm');
const path = require('path');
const LEAD = require('../lib/lead-do-funil.js');
const { temperaturaDoNegocio } = require('../lib/temperatura.js');
const CONFIG_TEMPERATURA = require('../data/temperatura.json');

const rev = process.argv[2] || 'origin/main';
let antigo;
try {
  antigo = execSync(`git show ${rev}:scripts/fetch-hubspot.js`, { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1 << 26 });
} catch (e) {
  console.log('SEM O ARQUIVO ANTIGO em ' + rev + ' — informe a revisão anterior à extração.');
  process.exit(1);
}
antigo = antigo.replace(/\r\n/g, '\n');
if (antigo.includes("require('../lib/lead-do-funil.js')")) {
  console.log('A revisão ' + rev + ' já tem a extração: passe a revisão ANTERIOR.');
  process.exit(1);
}

function trecho(ini, fim) {
  const i = antigo.indexOf(ini);
  if (i < 0) throw new Error('não achei: ' + ini.slice(0, 50));
  const j = antigo.indexOf(fim, i);
  if (j < 0) throw new Error('não achei o fim de: ' + ini.slice(0, 50));
  return antigo.slice(i, j + fim.length);
}
function funcao(assinatura) { return trecho(assinatura, '\n}\n'); }

const codigo = [
  trecho('const STAGES = {\n', '};\n'),
  trecho('const SLA_DAYS = {\n', '};\n'),
  trecho("const FIELD_SALES_STAGE_PROPS = ['origem_do_lead',", "'reuniao_agendada', 'description'];\n"),
  funcao('function estadoDaRegua(dias, stageId, proximaAtividadeRaw) {'),
  funcao('function diasUteisEntre(startMs, endMs) {'),
  funcao('function daysInCurrentStage(properties) {'),
  funcao('function coordenadaValida(valor) {'),
  funcao('function comTemperatura(lead, stageIdExplicito) {'),
  'function mapearAntigo(deals, stageId, ownerNameById, tarefasPorDeal) {\n  return deals.map(d => {\n' +
    trecho('      const dias = daysInCurrentStage(d.properties);\n', '    }).map(l => comTemperatura(l, stageId)).sort((a, b) => b.dias - a.dias);\n') +
  '}\n',
  'this.mapearAntigo = mapearAntigo; this.SLA_DAYS_ANTIGO = SLA_DAYS; this.estadoDaRegua = estadoDaRegua;'
].join('\n');

const caixa = { temperaturaDoNegocio, CONFIG_TEMPERATURA, Date, Math, Object, String, Number, isFinite, isNaN, parseFloat, console };
vm.createContext(caixa);
vm.runInContext(codigo, caixa);

// ── negócios de exemplo: cada campo que muda a conta, nos dois lados da régua ──
const dia = (n) => new Date(Date.now() - n * 86400000).toISOString();
const futuro = (n) => new Date(Date.now() + n * 86400000).toISOString();
const S = LEAD.STAGES;
const exemplos = [
  { id: '1', stage: S.prospeccao, p: { dealname: 'Bar A', createdate: dia(30), notes_last_updated: dia(20), hubspot_owner_id: '10', amount: '349.5', latitude: '-20.3', longitude: '-40.29', [`hs_v2_date_entered_${S.prospeccao}`]: dia(25) } },
  { id: '2', stage: S.visita, p: { dealname: 'Bar B', createdate: dia(3), hubspot_owner_id: '11', latitude: '0', longitude: '', gargalo_operacional: 'Fila', celular: '27999' } },
  { id: '3', stage: S.negociacao, p: { dealname: 'Bar C', createdate: dia(40), notes_last_updated: dia(15), notes_next_activity_date: futuro(5), hubspot_owner_id: '10', valor_de_mrr: '499', plano_apresentado: 'Inovação' } },
  { id: '4', stage: S.negociacao, p: { dealname: 'Bar D', createdate: dia(40), notes_last_updated: dia(15), notes_next_activity_date: dia(2), hubspot_owner_id: '99', mrr: '299' } },
  { id: '5', stage: S.agPagamento, p: { dealname: 'Bar E', createdate: dia(1), hubspot_owner_id: '11', amount: 'abc', cep: '29100', bairro: 'Centro', cidade: 'Vila Velha', logradouro: 'Rua X', numero: '10' } },
  { id: '6', stage: S.demoProposta, p: { dealname: 'Bar F', createdate: 'lixo', hubspot_owner_id: null } },
];
const nomes = { '10': 'Ana', '11': 'Bruno' };
const tarefas = { '1': [{ subject: 'Visita - Bar A', timestamp: futuro(1) }], '3': [] };

let falhas = 0;
const porEtapa = {};
exemplos.forEach(x => { (porEtapa[x.stage] = porEtapa[x.stage] || []).push({ id: x.id, properties: { ...x.p, dealstage: x.stage } }); });
Object.entries(porEtapa).forEach(([stageId, deals]) => {
  const velho = caixa.mapearAntigo(JSON.parse(JSON.stringify(deals)), stageId, nomes, tarefas);
  const novo = JSON.parse(JSON.stringify(deals))
    .map(d => LEAD.montarLeadDoFunil(d, stageId, { ownerNameById: nomes, tarefas: tarefas[d.id] || [], configTemperatura: CONFIG_TEMPERATURA }))
    .sort((a, b) => b.dias - a.dias);
  const a = JSON.stringify(velho), b = JSON.stringify(novo);
  if (a !== b) {
    falhas++;
    console.log('FALHA etapa ' + stageId + '\n  antigo: ' + a + '\n  novo:   ' + b);
  } else {
    console.log('OK    etapa ' + stageId + ' — ' + deals.length + ' card(s) idênticos');
  }
});

// as funções soltas também, com os casos de borda
[['diasUteisEntre', [Date.now() - 9 * 86400000, Date.now()]], ['diasUteisEntre', [Date.now(), Date.now() - 1]],
 ['coordenadaValida', ['0']], ['coordenadaValida', [' -20.5 ']], ['coordenadaValida', [null]], ['coordenadaValida', ['x']],
 ['estadoDaRegua', [9, S.negociacao, futuro(3)]], ['estadoDaRegua', [9, S.negociacao, dia(3)]], ['estadoDaRegua', [2, S.agPagamento, null]], ['estadoDaRegua', [3, 'etapa-sem-regua', null]]]
  .forEach(([nome, args]) => {
    const a = JSON.stringify(caixa[nome] ? caixa[nome](...args) : vm.runInContext(nome, caixa)(...args));
    const b = JSON.stringify(LEAD[nome](...args));
    if (a !== b) { falhas++; console.log('FALHA ' + nome + '(' + JSON.stringify(args) + '): ' + a + ' ≠ ' + b); }
    else console.log('OK    ' + nome + '(' + JSON.stringify(args).slice(0, 60) + ')');
  });

// A FRONTEIRA DE CADA RÉGUA: exatamente na régua e um dia acima, com e sem data
// combinada. Sem isto, mudar a régua de 7 para 8 passava (os exemplos acima ficam longe
// da fronteira) — foi o que a sabotagem mostrou ao escrever este teste.
Object.entries(caixa.SLA_DAYS_ANTIGO).forEach(([stageId, regua]) => {
  [regua, regua + 1].forEach((dias) => [null, futuro(2), dia(2)].forEach((prox) => {
    const x = JSON.stringify(caixa.estadoDaRegua(dias, stageId, prox));
    const y = JSON.stringify(LEAD.estadoDaRegua(dias, stageId, prox));
    if (x !== y) { falhas++; console.log('FALHA régua ' + stageId + ' dias=' + dias + ': ' + x + ' ≠ ' + y); }
  }));
});
console.log('OK    fronteira das réguas (' + Object.keys(caixa.SLA_DAYS_ANTIGO).length + ' etapas × 2 dias × 3 datas)');

if (falhas) { console.log('\n' + falhas + ' falha(s)'); process.exit(1); }
console.log('\nlead do funil: extração idêntica ao código anterior');
