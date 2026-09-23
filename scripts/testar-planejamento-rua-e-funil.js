#!/usr/bin/env node
/* ============================================================================
   PLANEJAMENTO FINAL · O BLOCO DE RUA E O CARTÃO DO FUNIL (23/09/26)

   Cobre as quatro primeiras checagens pedidas no prompt da prancha final:

     1. clicar no bloco de rua põe o bloco NA MÃO, sem nenhum outro clique; o número dele
        sai da grade, e nenhuma string "não tem lista" sobra no markup;
     2. mudar região ou duração com o bloco na mão atualiza O BLOCO NA MÃO;
     3. a faixa tem os seis propósitos, e `funil` continua recebendo toda a carteira que
        não cai nos outros;
     4. nenhuma régua fixa no código: o que a tela escreve vem de DATA.stageMeta.slaDays.

   POR QUE ELA RODA O CÓDIGO, e não só procura strings: as três funções que decidem isto —
   pl6SelDeRua, pl6BlocosDeRuaNaSemana e pl6ReguaDaEtapa — são recortadas do template e
   executadas. Checagem de presença deixou passar, hoje mesmo, duas sabotagens que
   apagavam exatamente a coisa nova.

   Uso: node scripts/testar-planejamento-rua-e-funil.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
/* ══ O TEMPLATE SEM COMENTÁRIOS ═══════════════════════════════════════════════════
   Três checagens deste arquivo procuram frases que NÃO podem estar na tela ("não tem
   lista", "régua 7d"). E três comentários do template explicam exatamente por que elas
   não podem estar lá — então as checagens reprovavam lendo a própria explicação.
   Proibição se mede no código; o comentário é onde a proibição fica escrita. */
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
function contexto(extra) {
  const c = Object.assign({ String: String, Number: Number, Array: Array, Object: Object,
    Date: Date, Math: Math, isNaN: isNaN, isFinite: isFinite }, extra || {});
  vm.createContext(c);
  [/const PL6_BLOQUEADO = '[^']+';/, /const PL6_RUA = '[^']+';/, /const PL6_REL = '[^']+';/,
    /const PL6_ETAPA_AG_PGTO = '[^']+';/, /const PL6_PROPOSITOS = \[[\s\S]*?\n\];/]
    .forEach(function (re) { vm.runInContext(tpl.match(re)[0], c); });
  return c;
}

console.log('');
console.log('1 · O BLOCO DE RUA CAI NA MÃO EM UM CLIQUE');

/* ── 1a · o objeto que vai para a mão, montado pelo template ─────────────────────── */
(function () {
  const c = contexto();
  vm.runInContext(recortar('pl6SelDeRua'), c);
  const montar = vm.runInContext('pl6SelDeRua', c);
  const PL6_RUA = vm.runInContext('PL6_RUA', c);

  const padrao = montar({ rua: { regiao: '', duracao: '2h' } });
  igual('sem região, o bloco na mão é "região livre"', padrao.lead.nome,
    'Bloco de rua · região livre',
    'é o que a barra-guia mostra, e "Bloco de rua · " sozinho seria uma frase pela metade');
  igual('e ele é o sentinela da rua, não um lead', padrao.lead.id, PL6_RUA);
  igual('a duração padrão é 2h', padrao.duracao, '2h');
  igual('e a linha de baixo diz a duração', padrao.sub, '2h · sem conta definida');

  const comOnde = montar({ rua: { regiao: 'Barra da Tijuca', duracao: '3h' } });
  igual('com região, ela entra no nome', comOnde.lead.nome, 'Bloco de rua · Barra da Tijuca');
  igual('e a duração escolhida vai junto', comOnde.duracao, '3h');
  igual('espaço em branco não vira região', montar({ rua: { regiao: '   ' } }).lead.nome,
    'Bloco de rua · região livre',
    'um nome terminando em espaço é o tipo de coisa que só aparece no print do gestor');
}());

/* ── 1b · UM clique: o verbo do propósito já põe na mão ──────────────────────────── */
checar('clicar no propósito rua já põe o bloco na mão',
  /if \(alvoProp === 'rua'\) s\.sel = pl6SelDeRua\(s\);/.test(tpl),
  'era um bloco que pedia para ser clicado e respondia "não tem lista" — o caminho real '
    + 'da rua era outro botão, escondido no meio da coluna');
checar('e o compositor não é mais o único caminho',
  /ruaPegar: 'bloco:' \+ PL6_RUA/.test(tpl)
    && /if \(verbo === 'bloco'\) \{/.test(tpl),
  'os dois gestos continuam existindo, e os dois montam o MESMO objeto');
checar('nenhuma string "não tem lista" sobrou',
  codigo.indexOf('não tem lista') < 0,
  'era a resposta do bloco a quem clicava nele; agora o clique faz alguma coisa');

/* ── 1c · o número vem da grade ──────────────────────────────────────────────────── */
(function () {
  const c = contexto();
  ['pl6SlotProposito', 'pl6SlotRua', 'pl6BlocosDeRuaNaSemana']
    .forEach(function (f) { vm.runInContext(recortar(f), c); });
  const contar = vm.runInContext('pl6BlocosDeRuaNaSemana', c);
  const PL6_RUA = vm.runInContext('PL6_RUA', c);

  igual('grade vazia dá zero', contar([[null, null], [null]]), 0);
  igual('conta o bloco gravado com propósito',
    contar([[{ id: PL6_RUA, hora: '09:00', p: 'rua' }, null], [null]]), 1);
  igual('conta também o sentinela puro, de semana já gravada',
    contar([[PL6_RUA, null], [{ id: PL6_RUA, p: 'rua' }]]), 2,
    'toda semana no banco hoje usa a string — contar só o `p` daria 0 para quem já tem '
      + 'rua marcada, e o número apareceria zerado no primeiro uso');
  igual('e não conta visita nem bloqueio',
    contar([[{ id: '77', hora: '09:00', p: 'cobrar' }, '__b', '88']]), 0);
  igual('grade nula não estoura', contar(null), 0);
}());

console.log('');
console.log('2 · REGIÃO E DURAÇÃO MEXEM NO BLOCO QUE JÁ ESTÁ NA MÃO');

checar('a duração atualiza o bloco na mão',
  /if \(verbo === 'ruadur'\) \{[\s\S]{0,300}?if \(s\.sel && s\.sel\.bloco === PL6_RUA\) s\.sel = pl6SelDeRua\(s\);/.test(tpl),
  'sem esta linha, trocar de 2h para 3h com o bloco pego mudava só o PRÓXIMO bloco — e o '
    + 'que ele acabou de marcar saía com a duração antiga, sem nada na tela dizendo isso');
checar('e a região também',
  /const ruaOnde = ev\.target\.closest[\s\S]{0,600}?pl6UI\.sel = pl6SelDeRua\(pl6UI\);/.test(tpl),
  'mesma coisa para o "onde?"');
/* O RAMO SE MEDE DENTRO DELE. A primeira versão desta checagem varria 700 caracteres a
   partir do `const ruaOnde` e caía no ramo da BUSCA POR NOME, logo abaixo — que
   redesenha de propósito e deve continuar redesenhando. */
checar('a região não redesenha a tela a cada letra',
  (function () {
    const i = codigo.indexOf('const ruaOnde = ev.target.closest');
    if (i < 0) return false;
    const j = codigo.indexOf('const buscaNome = ev.target.closest', i);
    if (j < 0 || j <= i) return false;
    const ramo = codigo.slice(i, j);
    return /pl6SelDeRua\(pl6UI\)/.test(ramo) && !/redesenhar\(/.test(ramo);
  }()),
  'redesenhar a cada letra reconstrói o campo, o foco se perde e a segunda letra vai para '
    + 'o nada — é o defeito que a busca por nome já teve nesta mesma coluna');
checar('e a barra-guia tem o gancho que ela corrige no lugar',
  /data-pl6-guia="1"/.test(tpl),
  'sem redesenho e sem gancho, a guia ficaria dizendo a região antiga');

console.log('');
console.log('3 · SEIS PROPÓSITOS, E O FUNIL RECEBE O RESTO');

(function () {
  const c = contexto();
  ['pl6Proposito', 'pl6AtrasoDoPasso', 'pl6PropositoDoLead']
    .forEach(function (f) { vm.runInContext(recortar(f), c); });
  const PROPS = vm.runInContext('PL6_PROPOSITOS', c);
  const doLead = vm.runInContext('pl6PropositoDoLead', c);

  igual('a faixa tem os seis, nesta ordem', PROPS.map(function (p) { return p.id; }),
    ['rua', 'cobrar', 'relac', 'follow', 'nova', 'funil']);
  checar('e cada um tem etiqueta e cor',
    PROPS.every(function (p) { return !!p.etiqueta && /^#[0-9A-F]{6}$/i.test(p.cor); }));
  checar('nenhuma conta da carteira fica sem propósito',
    doLead({ tipo: 'c', stageId: '1395880472' }) === 'funil'
      && doLead({ tipo: 'c', stageId: '1395880473' }) === 'cobrar'
      && doLead({ tipo: 'c', base: true }) === 'relac'
      && doLead({ tipo: 'n' }) === 'nova',
    'sem o sexto, 119 dos 140 negócios abertos do time sumiam da munição');
}());

console.log('');
console.log('4 · A RÉGUA VEM DO HUBSPOT, NUNCA DO CÓDIGO');

(function () {
  const c = contexto({ DATA: { stageMeta: { slaDays: {
    '1395880469': 5, '1396005401': 5, '1395880470': 4,
    '1395880471': 3, '1395880472': 7, '1395880473': 2
  } } } });
  ['pl6ReguaDaEtapa', 'pl6AcimaDaRegua', 'pl6PassoFuturo', 'pl6LinhaDoPasso', 'pl6MetricaDoCard']
    .forEach(function (f) { vm.runInContext(recortar(f), c); });
  const regua = vm.runInContext('pl6ReguaDaEtapa', c);
  const acima = vm.runInContext('pl6AcimaDaRegua', c);
  const cartao = vm.runInContext('pl6MetricaDoCard', c);

  igual('Ag. Pagamento tem régua 2', regua('1395880473'), 2);
  igual('Negociação tem régua 7', regua('1395880472'), 7);
  igual('etapa sem régua medida devolve null', regua('999'), null,
    'inventar régua para etapa não medida é acusar sem ter contado');

  /* A DIFERENÇA QUE UMA RÉGUA FIXA APAGARIA. */
  checar('6 dias está acima da régua no Diagnóstico e dentro dela na Negociação',
    acima({ stageId: '1395880470', dias: 6 }) === true
      && acima({ stageId: '1395880472', dias: 6 }) === false,
    'com uma régua única no código, os dois cairiam na mesma faixa e a ordem da lista '
      + 'poria o que está em dia na frente do estourado');
  checar('e sem régua medida ninguém é acusado',
    acima({ stageId: '999', dias: 90 }) === false,
    '"não medido" e "dentro da régua" são coisas diferentes, mas nenhuma das duas é '
      + '"estourado"');

  const cob = cartao({ stageId: '1395880473', dias: 9, etapa: 'Ag. Pagamento' }, 'cobrar');
  igual('o cartão da cobrança escreve a régua REAL',
    cob.l2, 'parado há 9d em Ag. Pagamento · régua 2d',
    'a prancha pedia "régua 7d", que é a da Negociação');
  igual('e marca acima da régua em vermelho', [cob.rot, cob.cor], ['acima da régua', '#C3152A']);

  const fun = cartao({ stageId: '1395880472', dias: 3, etapa: 'Negociação' }, 'funil');
  igual('o cartão do funil traz etapa e régua', fun.l2, 'Negociação · régua 7d');
  igual('e diz "na etapa" quando está em dia', fun.rot, 'na etapa');
  igual('sem próximo passo, ele diz isso', fun.l3, 'sem próximo passo datado',
    'linha vazia ali lê como "tem passo e eu não mostrei"');

  const comPasso = cartao({ stageId: '1395880472', dias: 3, etapa: 'Negociação',
    proximaAtividade: new Date(Date.UTC(2026, 11, 5, 15, 0)).toISOString() }, 'funil');
  checar('e com passo futuro ele traz a data', /^próximo passo em \d{2}\/\d{2}$/.test(comPasso.l3),
    'veio: ' + comPasso.l3);

  const semRegua = cartao({ stageId: '999', dias: 40, etapa: 'Etapa nova' }, 'funil');
  igual('etapa sem régua não inventa uma', semRegua.l2, 'Etapa nova',
    'escrever "régua 0d" ou "régua 7d" para etapa não medida é a tela afirmando o que '
      + 'ninguém contou');
}());

checar('nenhuma régua fixa escrita na tela',
  !/régua 7d/.test(codigo) && !/régua 5d/.test(codigo) && !/régua \d+d'/.test(codigo),
  'régua no código diverge do HubSpot no dia em que alguém muda a régua lá, e ninguém '
    + 'descobre — a tela continua verde');

console.log('');
console.log('planejamento · rua e funil: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
