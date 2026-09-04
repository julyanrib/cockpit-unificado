// scripts/testar-espelho-local.js
//
// NADA ESPERA O ROBÔ: toda escrita que a tela faz, a tela mostra na hora.
// ---------------------------------------------------------------------------------------
// Julyan, 04/09/26: "eu n quero mais nada no robo, tudo tem q ser instantaneo, tudo que
// der." É uma regra de produto, não um ajuste — e regra sem teste volta.
//
// POR QUE ELA PRECISA DE TESTE, com os três casos que a produziram, todos do mesmo mês:
//
//   1. O MRR gravava no HubSpot e o chip voltava a "R$ ?" (#306). A causa era escrever num
//      objeto de retorno que é CÓPIA.
//   2. A reciclagem aparecia na tela e não existia em 10 dos 13 lugares que a buscavam
//      (#307). A causa era o conjunto morar em treze pontos.
//   3. O negócio criado da conta-alvo só entrava no funil na carga seguinte — e o toast
//      dizia, com todas as letras, "o Cockpit reconcilia na próxima rodada automática".
//      A causa era "negócio novo entra nas listas" morar em DOIS lugares, um deles vazio.
//
// Os três são a mesma forma: a escrita acontece e a tela não sabe. Este arquivo mede a
// FORMA, não cada caso — é o que evita o quarto.
//
// O QUE NÃO DÁ PARA SER INSTANTÂNEO, e está aqui para não virar promessa: a COORDENADA
// (geocodificação, só o robô faz), a CONVERSÃO por etapa (agregado de 90 dias) e o
// DIAS-NA-ETAPA de negócio criado fora do cockpit.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const tpl = fs.readFileSync(T, 'utf8');
// O CÓDIGO SEM COMENTÁRIOS: as asserções abaixo procuram chamadas, e as notas longas deste
// arquivo citam os próprios nomes que elas procuram. Já tive esse falso positivo hoje.
const codigo = tpl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

let falhas = 0;
function checar(nome, cond, detalhe) {
  if (cond) { console.log('  ok  ' + nome); return; }
  falhas++;
  console.log('  FALHA  ' + nome + (detalhe ? '  — ' + detalhe : ''));
}

/* ── 1. UM lugar insere negócio novo nas listas ──────────────────────────────────── */
// Dois lugares foi o defeito nº 3: abrirNovaContaProspeccao fazia um push cru e
// abrirPassagemContaAlvoProFunil não fazia nada.
// DUAS FUNÇÕES NOMEADAS têm o direito de empurrar um negócio para as listas, e são
// operações diferentes: `inserirNegocioNoDataLocal` insere um negócio que NÃO existia, e
// `aplicarEtapaNoDataLocal` move um que já existe (tira de uma etapa e põe na outra).
// Qualquer push fora dessas duas é uma terceira implementação — e foi a terceira que
// esqueceu, em cada um dos três defeitos citados no topo.
const DONAS = ['inserirNegocioNoDataLocal', 'aplicarEtapaNoDataLocal'];
const corpoDe = function (fn) {
  const i = codigo.indexOf('function ' + fn);
  return i < 0 ? '' : codigo.slice(i, codigo.indexOf('\n}', i));
};
const pushesTotais = (codigo.match(/DATA\.funilLeads\[[^\]]+\]\.push\(/g) || []).length;
const pushesDasDonas = DONAS.reduce(function (t, fn) {
  return t + (corpoDe(fn).match(/DATA\.funilLeads\[[^\]]+\]\.push\(/g) || []).length;
}, 0);
checar('inserirNegocioNoDataLocal existe', codigo.indexOf('function inserirNegocioNoDataLocal') > 0,
  'sem ela, cada tela insere do seu jeito e uma esquece');
checar('só as duas funções donas empurram negócio para as listas',
  pushesTotais === pushesDasDonas && pushesDasDonas === 2,
  pushesTotais + ' push(es) no total, ' + pushesDasDonas + ' nas donas — o resto é push cru');

/* ── 2. e ela também mexe nos contadores do rep ──────────────────────────────────── */
// Sem isto o cartão aparece e a contagem acima dele continua dizendo o número antigo: uma
// tela discordando de si mesma, que é pior que uma tela desatualizada.
const corpoInsere = (function () {
  const i = codigo.indexOf('function inserirNegocioNoDataLocal');
  return i < 0 ? '' : codigo.slice(i, codigo.indexOf('\n}', i));
})();
checar('a inserção atualiza r.stages e r.open',
  /rep\.stages\[etapa\]/.test(corpoInsere) && /rep\.open/.test(corpoInsere),
  'o cabeçalho da coluna e o Comando de vendas leem esses dois');
checar('e ela é idempotente',
  /jaExiste/.test(corpoInsere),
  'dois cliques, ou o robô passando no meio, duplicariam o negócio na tela');

/* ── 3. as duas portas de criar negócio chamam a função ─────────────────────────── */
['abrirNovaContaProspeccao', 'abrirPassagemContaAlvoProFunil'].forEach(function (fn) {
  const i = codigo.indexOf('function ' + fn);
  const corpo = i < 0 ? '' : codigo.slice(i, i + 9000);
  checar(fn + ' insere na hora',
    /inserirNegocioNoDataLocal\(/.test(corpo),
    'sem isto o negócio criado só aparece na próxima carga do robô');
});

/* ── 4. nenhum toast manda esperar a rodada do robô ─────────────────────────────── */
// Era a frase que fazia o executivo recarregar a aba — e ela aparecia em DUAS criações.
const mandamEsperar = (tpl.match(/reconcilia na próxima rodada/g) || []).length;
checar('nenhum toast promete "reconcilia na próxima rodada"',
  mandamEsperar === 0,
  mandamEsperar + ' ocorrência(s) — a reconciliação acontece, mas ele não espera por ela');

/* ── 5. o endereço gravado entra em região na hora ──────────────────────────────── */
// A região saía de coordenada e por isso dependia do robô; desde o #307 a chave de lugar é
// bairro → CEP → cidade, e o bairro que ele acabou de digitar já basta.
const iEnd = codigo.indexOf('if (d.pl6EndSalvar)');
const corpoEnd = iEnd > 0 ? codigo.slice(iEnd, iEnd + 3400) : '';
checar('o endereço espelha no DATA local',
  /aplicarPropsNoDataLocal\(/.test(corpoEnd),
  'sem o espelho o card continua "sem endereço no CRM" até o robô rodar');
checar('e o toast não manda esperar a carga para a região',
  !/entra em região na próxima carga/.test(tpl),
  'a região sai de bairro/CEP desde o #307 — só o km depende da coordenada');

/* ── 6. o MRR e o próximo passo continuam espelhando ────────────────────────────── */
// Os dois primeiros defeitos desta família. As asserções ficam para eles não voltarem.
const iChip = codigo.indexOf('const gravarValor = async function');
const corpoChip = iChip > 0 ? codigo.slice(iChip, iChip + 2200) : '';
checar('o chip de valor do funil espelha pela função única',
  /aplicarPropsNoDataLocal\(id, \{ valor_de_mrr/.test(corpoChip),
  'escrever em lead.valor_de_mrr escreve numa CÓPIA — foi o defeito de #306');
const iPasso = codigo.indexOf('const gravarPasso = async function');
const corpoPasso = iPasso > 0 ? codigo.slice(iPasso, iPasso + 3400) : '';
checar('o próximo passo do cartão espelha e vai para a agenda',
  /aplicarPropsNoDataLocal\(/.test(corpoPasso) && /espelharPassoNaAgenda\(/.test(corpoPasso),
  'sem os dois ele datava de novo e o HubSpot ficava com duas tarefas');

/* ── 7. e "todas as contas" continua vindo de um lugar ──────────────────────────── */
const naMao = (codigo.match(/pl6Carteira\(rep, regioes\)\s*\n?\s*\.concat\(pl6Novos/g) || []).length;
checar('ninguém monta "todas as contas" na mão',
  naMao === 0,
  naMao + ' lugar(es) — foi o defeito de #307, em 10 de 13 consumidores');

console.log('');
if (falhas) {
  console.error(falhas + ' falha(s) — alguma escrita voltou a esperar o robô.');
  process.exit(1);
}
console.log('espelho local: negócio novo, endereço, MRR e próximo passo aparecem na hora — e por um caminho só.');
