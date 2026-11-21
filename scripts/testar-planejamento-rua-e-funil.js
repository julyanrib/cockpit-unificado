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

/* 20/11/26: as seções 1 e 2 (o bloco de rua na mão em um clique, região e duração mexendo
   no bloco, a barra-guia) eram do compositor da tela v2, que saiu. O bloco de rua da v3 é
   PLV3.porRua e está medido em testar-proposito-no-compromisso e testar-planejamento-relacionamento.
   O cartão da v2 (pl6MetricaDoCard) saiu junto; a régua continua, e é ela que se mede aqui. */
console.log('');
console.log('3 · SEIS PROPÓSITOS, E O FUNIL RECEBE O RESTO');

(function () {
  const c = contexto();
  ['pl6Proposito', 'pl6AtrasoDoPasso', 'pl6PropositoDoLead']
    .forEach(function (f) { vm.runInContext(recortar(f), c); });
  const PROPS = vm.runInContext('PL6_PROPOSITOS', c);
  const doLead = vm.runInContext('pl6PropositoDoLead', c);

  /* 16/10/26 (Planejamento v2): o sétimo, a Cadência, entra no FIM (pl6Proposito cai no índice 3) */
  igual('a faixa tem os sete, nesta ordem', PROPS.map(function (p) { return p.id; }),
    ['rua', 'cobrar', 'relac', 'follow', 'nova', 'funil', 'cad']);
  checar('e cada um tem etiqueta e cor',
    /* v5: a cor do propósito pode ser token (var(--ink) no de rua); só vai para style= */
    PROPS.every(function (p) { return !!p.etiqueta && /^(#[0-9A-F]{6}|var\(--[\w-]+\))$/i.test(p.cor); }));
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
  ['pl6ReguaDaEtapa', 'pl6AcimaDaRegua']
    .forEach(function (f) { vm.runInContext(recortar(f), c); });
  const regua = vm.runInContext('pl6ReguaDaEtapa', c);
  const acima = vm.runInContext('pl6AcimaDaRegua', c);

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
