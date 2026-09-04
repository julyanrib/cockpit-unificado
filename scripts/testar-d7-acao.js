// scripts/testar-d7-acao.js
//
// A AÇÃO DO DIA: a promessa do executivo, e a linha de quem ela é.
// ---------------------------------------------------------------------------------------
// A ação do dia (04/09/26) é o que o Julyan pediu para esta aba ser: "é o plano do dia
// dele, é onde ele promete oq vai fazer" — e "isso eu como gestor vou ver". Ou seja: o
// texto que o executivo escreve aqui é lido por OUTRA pessoa, na rodada das 8h30, para
// cobrar. Errar de quem é a ação é pior que não ter ação.
//
// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR, e que eu quase publiquei: d7AcaoDe caía
// em `planoDiaCache`, que é — e a declaração dele diz isso — "a linha de planos_diarios do
// dia de hoje DO REP LOGADO". Na tela do executivo está certo. Na Daily do gestor, que
// desenha as sete linhas em soLeitura, aquele cache é a linha do GESTOR: a ação ao lado da
// visita da Kelly sairia do plano de outra pessoa, ou do rascunho local do próprio gestor.
//
// É a nota "medir a linha do colega" da memória, na forma mais cara: um número certo na
// tela errada faz a rodada cobrar a pessoa errada.
//
// Ele EXECUTA as funções contra um cenário — guarda estática não vê para qual objeto uma
// função caiu no fallback.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const tpl = fs.readFileSync(T, 'utf8');

let falhas = 0;
function checar(nome, cond, detalhe) {
  if (cond) { console.log('  ok  ' + nome); return; }
  falhas++;
  console.log('  FALHA  ' + nome + (detalhe ? '  — ' + detalhe : ''));
}

function pegar(re, oQue) {
  const m = re.exec(tpl);
  if (!m) { console.error('não achei ' + oQue + ' — a âncora deste teste se perdeu.'); process.exit(1); }
  return m[0];
}

const fonte = [
  pegar(/\nconst ORDEM_ETAPAS_FUNIL = \[[^\]]*\];/, 'ORDEM_ETAPAS_FUNIL'),
  pegar(/\nconst FN3_ETAPA_RECICLAGEM = '[0-9]+';/, 'FN3_ETAPA_RECICLAGEM'),
  pegar(/\nfunction etapaEhRecuo\(de, para\) \{[\s\S]*?\n\}/, 'etapaEhRecuo'),
  pegar(/\nconst D7_ACOES = \[[\s\S]*?\n\];/, 'D7_ACOES'),
  pegar(/\nfunction d7AcaoSugerida\(lead\) \{[\s\S]*?\n\}/, 'd7AcaoSugerida'),
  pegar(/\nfunction d7AcaoDe\(lead, planoDia\) \{[\s\S]*?\n\}/, 'd7AcaoDe'),
  pegar(/\nfunction nomesDaPromessaDoPlano\(prioridades\) \{[\s\S]*?\n\}/, 'nomesDaPromessaDoPlano')
].join('\n');

let api;
try {
  api = new Function(
    'let d7UI = { acoes: {} };\n'
    + 'let planoDiaCache = null;\n'
    + fonte
    + '\nreturn { etapaEhRecuo, d7AcaoSugerida, d7AcaoDe, nomesDaPromessaDoPlano, D7_ACOES,'
    + ' setRascunho: function (k, v) { d7UI.acoes[k] = v; },'
    + ' setCache: function (v) { planoDiaCache = v; } };')();
} catch (e) {
  console.error('  FALHA  o bloco da ação não avalia: ' + e.message);
  process.exit(1);
}

const LEAD = { id: 'c-999', dealId: '999', nome: 'TESTE', tipo: 'c', stageId: '1395880471' };

/* ── 1. a ação de quem é a linha ─────────────────────────────────────────────────── */
// Este é o teste que teria pego o defeito. Duas pessoas, duas ações, o mesmo negócio.
const daKelly = { contas_alvo: [{ id: '999', nome: 'TESTE', acao: 'levar proposta revisada' }] };
const doMarco = { contas_alvo: [{ id: '999', nome: 'TESTE', acao: 'cobrar o contrato' }] };
checar('com a linha da Kelly, sai a ação da Kelly',
  api.d7AcaoDe(LEAD, daKelly) === 'levar proposta revisada');
checar('com a linha do Marco, sai a ação do Marco',
  api.d7AcaoDe(LEAD, doMarco) === 'cobrar o contrato',
  'se as duas derem o mesmo texto, o fallback global voltou');

/* ── 2. o rascunho do gestor NÃO vaza para a linha de um executivo ──────────────── */
api.setRascunho('c-999', 'RASCUNHO DO GESTOR');
api.setCache({ contas_alvo: [{ id: '999', nome: 'TESTE', acao: 'PLANO DO GESTOR' }] });
checar('a linha de um executivo ignora o rascunho local de quem está olhando',
  api.d7AcaoDe(LEAD, daKelly) === 'levar proposta revisada',
  'devolveu ' + JSON.stringify(api.d7AcaoDe(LEAD, daKelly)));
checar('e ignora o planoDiaCache de quem está olhando',
  api.d7AcaoDe(LEAD, { contas_alvo: [] }) === '',
  'o cache é a linha do rep LOGADO — na tela do gestor, é a dele');
checar('planoDia null não cai no cache nem no rascunho',
  api.d7AcaoDe(LEAD, null) === '',
  'null quer dizer "não tenho a linha desta pessoa", e isso não é "use a minha"');

/* ── 3. e na tela do próprio executivo, o rascunho vale ─────────────────────────── */
// Sem o parâmetro: é ele olhando o dia dele. Aqui o rascunho é o certo — sem isso, a ação
// que ele acabou de escrever desapareceria no redesenho seguinte.
checar('sem parâmetro, vale o que ele escreveu nesta sessão',
  api.d7AcaoDe(LEAD) === 'RASCUNHO DO GESTOR');
api.setRascunho('c-999', undefined);
delete api.D7_ACOES.__nada;
checar('e sem rascunho, vale o que ele travou antes',
  api.d7AcaoDe(LEAD) === 'PLANO DO GESTOR',
  'é o planoDiaCache — na tela dele, o cache é dele mesmo');

/* ── 4. o atalho sugerido sai da etapa ──────────────────────────────────────────── */
// Sugestão, não escolha: o chip aparece destacado e ele decide. Mesmo pudor do horário.
const porEtapa = {
  '1395880469': '1ª visita',
  '1396005401': 'follow-up',
  '1395880470': 'follow-up',
  '1398311191': 'follow-up',
  '1395880471': 'levar proposta',
  '1395880472': 'fechar',
  '1395880473': 'fechar'
};
Object.keys(porEtapa).forEach(function (st) {
  const r = api.d7AcaoSugerida({ tipo: 'c', stageId: st });
  checar('etapa ' + st + ' sugere "' + porEtapa[st] + '"', r === porEtapa[st], 'sugeriu ' + r);
});
checar('conta nova sugere 1ª visita — ela nunca foi visitada',
  api.d7AcaoSugerida({ tipo: 'n' }) === '1ª visita');
checar('etapa desconhecida não vira sugestão vazia',
  api.d7AcaoSugerida({ tipo: 'c', stageId: '000' }) === 'follow-up',
  'chip sem texto seria um botão que não diz o que faz');

/* ── 5. a ação entra na promessa SEM quebrar quem só quer o nome ────────────────── */
// prioridades é lida por quatro telas que extraem o nome cortando no primeiro " — ".
const prioridades = [
  'FRANGO CHIC — 13:30 · follow-up',
  'Bar do dudu — 15:00 · levar a proposta revisada e cobrar assinatura',
  'CONTA NOVA — 09:00 (conta nova) · 1ª visita'
];
const nomes = api.nomesDaPromessaDoPlano(prioridades);
checar('o nome continua saindo limpo com a ação anexada',
  nomes.length === 3 && nomes[0] === 'FRANGO CHIC' && nomes[1] === 'Bar do dudu'
    && nomes[2] === 'CONTA NOVA',
  JSON.stringify(nomes));

/* ── 6. sair da Reciclagem não é recuo ─────────────────────────────────────────── */
// Quem ressuscita uma conta parada há 140 dias recebia "Voltando etapa", um aviso âmbar e
// a oferta de "se foi engano, feche aqui mesmo". É o ato mais difícil que a tela pede.
checar('Reciclagem → Demo/Proposta NÃO é recuo',
  api.etapaEhRecuo('1398311191', '1395880471') === false,
  'era isto que dava o aviso âmbar para uma retomada');
checar('Reciclagem → Prospecção NÃO é recuo',
  api.etapaEhRecuo('1398311191', '1395880469') === false);
checar('mas Negociação → Visita continua sendo recuo',
  api.etapaEhRecuo('1395880472', '1396005401') === true,
  'a regra normal não pode ter sido desligada junto');
checar('e avançar não é recuo',
  api.etapaEhRecuo('1395880469', '1396005401') === false);

/* ── 7. o retorno nunca cai no passado ─────────────────────────────────────────── */
// Na sexta, `(di < 4) ? dias[di+1] : null` caía em HOJE: a tarefa nascia na pilha de
// vencidas do HubSpot no mesmo segundo. Tarefa no passado é o mesmo que tarefa nenhuma.
// AS ASSERÇÕES ABAIXO LEEM CÓDIGO, ENTÃO OS COMENTÁRIOS SAEM PRIMEIRO. A nota que eu
// escrevi ali dentro cita a frase defeituosa ("o aviso dizia 'retorno datado hoje'") para
// registrar o caso — e o detector casava com a própria nota. Já cometi esse falso positivo
// antes, com "latitude" dentro de um comentário. Mascarar é a correção, nas duas vezes.
const iRet = tpl.indexOf("if (d.d7Retorno || d.d7QTarefa) {");
const corpoRet = iRet > 0
  ? tpl.slice(iRet, iRet + 3200).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  : '';
checar('o retorno de sexta não usa mais `iso` (hoje) como destino',
  !/const alvoISO = proximo \? proximo\.iso : iso;/.test(corpoRet),
  'esse ternário era o defeito');
checar('e a sexta cai na semana seguinte',
  /di === 4 \? 7 : 0/.test(corpoRet),
  'sem isto, sexta volta a datar retorno para hoje');
checar('o aviso do retorno diz sempre a data',
  !/retorno datado ' \+ \(proximo \? /.test(corpoRet)
    && /retorno datado ' \+ proximo\.rot \+ ' ' \+ proximo\.data/.test(corpoRet),
  '"retorno datado hoje" era a frase que escondia o defeito');

console.log('');
if (falhas) {
  console.error(falhas + ' falha(s) — a promessa do dia pode estar mostrando a ação da pessoa errada.');
  process.exit(1);
}
console.log('ação do dia: a promessa é de quem escreveu, o atalho sai da etapa, e o retorno nunca cai no passado.');
