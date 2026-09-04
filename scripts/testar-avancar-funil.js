// scripts/testar-avancar-funil.js
//
// O "→ AVANÇAR" DO CARTÃO SÓ PODE PROPOR UM AVANÇO DE VERDADE.
// ---------------------------------------------------------------------------------------
// O DEFEITO QUE PRODUZIU ESTE TESTE (04/09/26, meu, medido na tela do Bruno): a primeira
// versão de fn3ProximaEtapa era `ORDEM_ETAPAS_FUNIL[i + 1]`. Parece óbvio e está errado —
// a medição, etapa por etapa, devolveu:
//
//     Enviado Onboarding  ->  Reciclagem
//
// Ou seja: no cartão de um negócio GANHO aparecia um botão verde, de um toque, para jogá-lo
// na lixeira de 60 dias. E o arraste JÁ recusava aquele cartão (e.onb tira o draggable): o
// atalho furava uma regra que a tela tinha.
//
// A CAUSA É CONCEITUAL, e é por isso que ela merece teste em vez de comentário:
// ORDEM_ETAPAS_FUNIL existe para comparar RANK — é o que deixa fn2PodeMover saber o que é
// "voltar". Reciclagem está no fim daquela lista porque é o rank mais baixo, não porque
// seja o passo seguinte a alguma coisa. Quem ler a lista como escada repete o defeito, e
// nenhuma outra checagem pega: a sintaxe fica válida e o botão aparece bonito.
//
// ELE LÊ A REGRA DO ARQUIVO e a executa de verdade — não confere texto. Se o corpo da
// função mudar de forma, o teste continua medindo o COMPORTAMENTO.

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

/* ── as peças que a regra usa, extraídas do próprio template ─────────────────────── */
function pegar(re, oQue) {
  const m = re.exec(tpl);
  if (!m) { console.error('não achei ' + oQue + ' no template — a âncora do teste se perdeu.'); process.exit(1); }
  return m[0];
}

const src = [
  pegar(/const ORDEM_ETAPAS_FUNIL = \[[^\]]*\];/, 'ORDEM_ETAPAS_FUNIL'),
  pegar(/const FN2_ETAPA_PERDIDO = '[0-9]+';/, 'FN2_ETAPA_PERDIDO'),
  pegar(/const FN3_ETAPA_ONBOARDING = '[0-9]+';/, 'FN3_ETAPA_ONBOARDING'),
  pegar(/const FN3_ETAPA_RECICLAGEM = '[0-9]+';/, 'FN3_ETAPA_RECICLAGEM'),
  pegar(/function fn2PodeMover\(de, para\) \{[\s\S]*?\n\}/, 'fn2PodeMover'),
  pegar(/function fn3PodeMover\(de, para\) \{[\s\S]*?\n\}/, 'fn3PodeMover'),
  pegar(/function fn3ProximaEtapa\(de\) \{[\s\S]*?\n\}/, 'fn3ProximaEtapa')
].join('\n');

const fn3ProximaEtapa = new Function(src + '\nreturn fn3ProximaEtapa;')();

/* ── as etapas, por nome, para o teste falar português ────────────────────────────── */
const E = {
  prospeccao: '1395880469',
  visita: '1396005401',
  decisor: '1395880470',
  demo: '1395880471',
  negociacao: '1395880472',
  pagamento: '1395880473',
  onboarding: '1396006163',
  reciclagem: '1398311191'
};

/* ── 1. a escada da venda continua inteira ───────────────────────────────────────── */
const escada = [
  ['prospeccao', 'visita'],
  ['visita', 'decisor'],
  ['decisor', 'demo'],
  ['demo', 'negociacao'],
  ['negociacao', 'pagamento'],
  ['pagamento', 'onboarding']
];
escada.forEach(([de, para]) => {
  const r = fn3ProximaEtapa(E[de]);
  checar('de ' + de + ' avança para ' + para, r === E[para],
    'devolveu ' + JSON.stringify(r) + ' — se virar null, o atalho desaparece de uma coluna inteira');
});

/* ── 2. as duas exceções de natureza ─────────────────────────────────────────────── */
// Este é o caso exato que estava quebrado. Um negócio ganho não "avança".
checar('de Onboarding NÃO se avança',
  fn3ProximaEtapa(E.onboarding) === null,
  'era isto que punha um botão de um toque para jogar negócio ganho em Reciclagem');
checar('de Reciclagem NÃO se avança pelo atalho',
  fn3ProximaEtapa(E.reciclagem) === null,
  'sair da reciclagem é VOLTAR para Prospecção — o ⌄ faz isso, o atalho verde não');

/* ── 3. e ninguém, de nenhuma etapa, avança PARA Reciclagem ──────────────────────── */
// A checagem que sobrevive a uma reordenação de ORDEM_ETAPAS_FUNIL: mesmo que Reciclagem
// mude de lugar na lista, ela nunca pode ser proposta como avanço.
const propoemReciclagem = Object.keys(E).filter(k => fn3ProximaEtapa(E[k]) === E.reciclagem);
checar('nenhuma etapa propõe Reciclagem como avanço',
  propoemReciclagem.length === 0,
  'propõem: ' + propoemReciclagem.join(', '));

/* ── 4. e nunca um destino fora do funil ─────────────────────────────────────────── */
const validos = Object.values(E);
const forasteiros = Object.keys(E)
  .map(k => ({ de: k, para: fn3ProximaEtapa(E[k]) }))
  .filter(x => x.para !== null && validos.indexOf(x.para) < 0);
checar('todo destino proposto é uma etapa real do funil',
  forasteiros.length === 0, JSON.stringify(forasteiros));

/* ── 5. e o botão não grava sozinho: ele abre o registro ─────────────────────────── */
// A regra da aba é "nada muda de etapa sem registro". O atalho encurta a CHEGADA ao
// registro; se algum dia ele chamar a gravação direto, o dado que o gestor lê na daily
// passa a existir sem o desfecho que o produz.
const iFia = tpl.indexOf("el.querySelectorAll('[data-fn3-avancar]')");
const fiacao = iFia > 0 ? tpl.slice(iFia, iFia + 1400) : '';
checar('o avançar do cartão abre fn3AbrirRegistro',
  /fn3AbrirRegistro\(lead, para, redesenhar\)/.test(fiacao),
  'botão que grava direto pula o registro, e é dele que sai o número da daily do gestor');
checar('o perder do cartão abre fn3AbrirRegistro',
  /fn3AbrirRegistro\(lead, FN2_ETAPA_PERDIDO, redesenhar\)/.test(fiacao),
  'o HubSpot exige motivo da perda: sem o registro, a gravação é recusada');
checar('os dois param a propagação do clique',
  (fiacao.match(/ev\.stopPropagation\(\)/g) || []).length >= 2,
  'sem isto o cartão abre a ficha junto — duas telas por um toque');

console.log('');
if (falhas) {
  console.error(falhas + ' falha(s) — o atalho de avançar pode propor um passo que não é avanço.');
  process.exit(1);
}
console.log('avançar do funil: a escada da venda inteira, e nenhum atalho para a reciclagem.');
