#!/usr/bin/env node
/* ============================================================================
   O PROPÓSITO VIAJA COM O COMPROMISSO (23/09/26)

   A faixa da v7 faz o executivo escolher o propósito antes da conta, e o card agendado
   passou a carregar qual foi. Esta suíte existe porque DUAS SABOTAGENS PASSARAM VERDE
   contra as 69 suítes que havia:

     A. tirar o `p` do slot na hora de gravar  → nada pegou
     B. apagar o selo do card no markup        → nada pegou

   As duas são exatamente a coisa nova. Guarda que não reprova a remoção da função que ela
   protege é decoração — e esta casa já pagou por isso mais de uma vez.

   O QUE ELA MEDE, RODANDO O CÓDIGO DO TEMPLATE:

   1. QUEM ESCREVE põe `p` no slot, e ele vem da CONTA — não da faixa aberta na tela. A
      conta pode ter chegado pela busca por nome, pelo arraste ou pela Minha Daily, onde
      faixa nenhuma existe.

   2. QUEM LÊ devolve o `p` gravado, e devolve null para slot em string — que é a maior
      parte do que já está no banco. Null aqui NÃO é "sem propósito": é "derive da conta",
      e é o que deixa a semana montada ontem ganhar as etiquetas hoje sem migração.

   3. O CARD mostra: o selo sai do propósito, e o trilho ganha a cor dele.

   4. NADA DISSO QUEBRA QUEM NÃO SABE DO CAMPO. Os leitores desta casa leem o slot como
      `typeof v === 'object' ? v.id : v`. A checagem varre o template atrás de leitor que
      ENUMERE campos do slot — esse, sim, quebraria com um campo novo.

   Uso: node scripts/testar-proposito-no-compromisso.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; console.log('  ok  ' + nome); return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
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

/* ══ O CONTEXTO: as tabelas e funções REAIS do template ═════════════════════════════ */
const ctx = { String: String, Number: Number, Array: Array, Object: Object, Date: Date,
  Math: Math, isNaN: isNaN, console: { error: function () {} } };
vm.createContext(ctx);
[/const PL6_BLOQUEADO = '[^']+';/, /const PL6_RUA = '[^']+';/, /const PL6_REL = '[^']+';/,
  /const PL6_ETAPA_AG_PGTO = '[^']+';/, /const PL6_PROPOSITOS = \[[\s\S]*?\n\];/]
  .forEach(function (re) {
    const m = tpl.match(re);
    if (!m) { console.error('FALHA: não achei ' + re); process.exit(1); }
    vm.runInContext(m[0], ctx);
  });
['pl6Proposito', 'pl6AtrasoDoPasso', 'pl6PropositoDoLead', 'pl6SlotProposito',
  'pl6SlotId', 'pl6SlotRua', 'pl6SlotRel', 'pl6SlotBloqueado', 'pl6SlotHora',
  'pl6PorHora', 'pl6ItensDoDia']
  .forEach(function (f) { vm.runInContext(recortar(f), ctx); });

console.log('');
console.log('1 · QUEM LÊ O SLOT');

const lerProp = vm.runInContext('pl6SlotProposito', ctx);
igual('o slot objeto devolve o propósito gravado',
  lerProp({ id: '77', hora: '09:00', p: 'cobrar' }), 'cobrar');
igual('o slot em string devolve null, para a tela derivar da conta',
  lerProp('77'), null,
  'null aqui NÃO é "sem propósito": é "derive" — e é o que faz a semana de ontem ganhar '
    + 'as etiquetas hoje, sem migração');
igual('slot vazio também', lerProp(null), null);
igual('e campo p vazio não vira string vazia na tela', lerProp({ id: '77', p: '' }), null);

console.log('');
console.log('2 · QUEM LÊ O DIA');

const itensDoDia = vm.runInContext('pl6ItensDoDia', ctx);
const PL6_RUA = vm.runInContext('PL6_RUA', ctx);
const PL6_REL = vm.runInContext('PL6_REL', ctx);
const PL6_BLOQUEADO = vm.runInContext('PL6_BLOQUEADO', ctx);
(function () {
  const porId = new Map([['77', { id: '77', nome: 'Coliseu' }], ['88', { id: '88', nome: 'Aloha' }]]);
  const col = [
    { id: '77', hora: '09:00', p: 'cobrar' },
    '88',
    { id: PL6_RUA, hora: '11:00', p: 'rua' },
    PL6_REL,
    PL6_BLOQUEADO
  ];
  const itens = itensDoDia(col, porId);
  igual('o propósito gravado chega ao item do dia',
    (itens.filter(function (x) { return x.id === '77'; })[0] || {}).p, 'cobrar');
  igual('o slot em string chega sem propósito, para ser derivado',
    (itens.filter(function (x) { return x.id === '88'; })[0] || {}).p, null);
  igual('a volta de rua se identifica sozinha',
    (itens.filter(function (x) { return x.tipo === 'rua'; })[0] || {}).p, 'rua');
  igual('e o bloco de relacionamento antigo também, sem nada gravado',
    (itens.filter(function (x) { return x.tipo === 'rel'; })[0] || {}).p, 'relac',
    'semana já gravada com o sentinela antigo continua sendo lida — o slot viraria buraco '
      + 'na segunda de manhã');
  checar('e o si continua viajando em todos os ramos',
    itens.every(function (x) { return typeof x.si === 'number'; }),
    'a Daily do gestor e o g14 acham o compromisso pela POSIÇÃO na grade gravada');
}());

console.log('');
console.log('3 · QUEM ESCREVE — o trecho do template, rodando');

/* O RECORTE É O QUE MONTA O SLOT no agendar da munição. Roda de verdade: a sabotagem que
   tira o `p` daqui passou verde contra as 69 suítes que havia. */
(function () {
  const ini = tpl.indexOf('    const propDoSlot =');
  const fim = tpl.indexOf('\n', tpl.indexOf('      : l.id;', ini));
  if (ini < 0 || fim < 0) {
    checar('o recorte de quem monta o slot existe', false, 'âncora perdida');
    return;
  }
  const trecho = tpl.slice(ini, fim);
  /* CONTEXTO NOVO A CADA MONTAGEM, e as constantes redeclaradas nele: um `const` de dentro
     de um contexto de vm NÃO é copiado por Object.assign, e a primeira versão desta suíte
     estourou com "PL6_ETAPA_AG_PGTO is not defined" dentro da função recortada. */
  const montar = function (l, horaEscolhida) {
    const c = { String: String, Number: Number, Array: Array, Object: Object, Date: Date,
      Math: Math, isNaN: isNaN, l: l, horaEscolhida: horaEscolhida, valorDoSlot: null };
    vm.createContext(c);
    vm.runInContext(tpl.match(/const PL6_ETAPA_AG_PGTO = '[^']+';/)[0], c);
    vm.runInContext(tpl.match(/const PL6_PROPOSITOS = \[[\s\S]*?\n\];/)[0], c);
    ['pl6Proposito', 'pl6AtrasoDoPasso', 'pl6PropositoDoLead'].forEach(function (f) {
      vm.runInContext(recortar(f), c);
    });
    vm.runInContext(trecho, c);
    return vm.runInContext('valorDoSlot', c);
  };

  igual('agendar um negócio em Ag. Pagamento grava o propósito de cobrança',
    montar({ id: '77', tipo: 'c', stageId: '1395880473' }, '09:00'),
    { id: '77', hora: '09:00', p: 'cobrar' },
    'sem o p, a quarta de manhã tem três cards iguais e nenhum diz qual é a cobrança');
  igual('agendar um cliente da base grava relacionamento',
    montar({ id: '88', tipo: 'c', base: true }, null),
    { id: '88', p: 'relac' },
    'o slot vira objeto mesmo sem hora escolhida: as duas formas já convivem no banco');
  igual('agendar uma conta-alvo grava prospecção nova',
    montar({ id: '99', tipo: 'n' }, '14:30'),
    { id: '99', hora: '14:30', p: 'nova' });
  igual('e o resto da carteira grava "avançar o funil"',
    montar({ id: '11', tipo: 'c', stageId: '1395880472' }, null),
    { id: '11', p: 'funil' },
    'é o propósito de 119 dos 140 negócios abertos do time — se ele não for gravado, a '
      + 'maior parte dos cards fica sem etiqueta');
}());

/* OS OUTROS TRÊS CAMINHOS DE ESCRITA. Não dá para rodá-los sem a tela inteira, mas a
   ausência do campo é o que precisa ser reprovada — e ela se vê no código. */
checar('mover de horário preserva o propósito do slot antigo',
  /const pEra = pl6SlotProposito\(era\);/.test(tpl)
    && /g\[di\]\[destino\] = Object\.assign\(\{ id: id, hora: hora \}, pEra/.test(tpl),
  'remontar o slot do zero tirava a etiqueta de quem mudasse de terça para quarta');
/* O BLOCO GRAVA PROPÓSITO — e, desde a prancha final, onde e quanto tempo junto. Sem
   a duração, cinco blocos de rua na semana são cinco pontos iguais numa hora, e o que
   faz o bloco OCUPAR o dia é justamente ela. */
checar('o bloco de rua grava o próprio propósito',
  /\{ id: bl\.id, hora: hora, p: bl\.id === PL6_RUA \? 'rua' : 'relac' \}/.test(tpl),
  'a volta de rua ocupa hora como qualquer visita e tem de se anunciar igual');
checar('e leva onde e quanto tempo do compositor',
  /selRua\.regiao \? \{ regiao: String\(selRua\.regiao\) \} : \{\}/.test(tpl)
    && /selRua\.duracao \? \{ duracao: String\(selRua\.duracao\) \} : \{\}/.test(tpl),
  'bloco sem duração é um ponto solto numa hora, e nao um pedaço do dia ocupado');
checar('o espelho do próximo passo grava follow-up',
  /grade\[di\]\[si\] = Object\.assign\(\{ id: idNaGrade \}[\s\S]{0,120}p: 'follow' \}\);/.test(tpl),
  'esse compromisso nasceu de uma data combinada no CRM — é follow-up por definição, e '
    + 'deixá-lo mudo faria o card do espelho ser o único sem etiqueta');

console.log('');
console.log('4 · O CARD MOSTRA');

checar('o selo é desenhado, e ele depende do propósito',
  /\$\{sl\.selo \? `<b style="flex:none;/.test(tpl)
    && /\$\{sl\.seloCor\}/.test(tpl) && /\$\{sl\.seloBg\}/.test(tpl)
    && /\$\{sl\.selo\}<\/b>/.test(tpl),
  'a sabotagem que troca `sl.selo ?` por `false ?` apaga a etiqueta de todos os cards e '
    + 'não muda mais nada na tela — nenhuma das 69 suítes pegava isso');
checar('o dado do card monta o selo a partir do propósito',
  /selo: prop \? esc\(prop\.etiqueta\) : ''/.test(tpl)
    && /seloCor: prop \? prop\.selo/.test(tpl) && /seloBg: prop \? prop\.seloBg/.test(tpl),
  'markup ligado a campo que ninguém preenche é o selo sempre vazio, com tudo verde');
checar('e o propósito do card se deriva quando o slot não o tem',
  /const propId = it\.p \|\| \(it\.lead && typeof pl6PropositoDoLead === 'function'/.test(tpl),
  'sem a derivação, toda semana montada antes de 23/09 ficaria sem etiqueta nenhuma — e '
    + 'um campo novo que só vale para o futuro é um campo que ninguém vê na segunda');
checar('o trilho do card ganha a cor do propósito',
  /etCor: prop \? prop\.cor : \(bl \? bl\.cor/.test(tpl),
  'a faixa de cima ensina a cor de cada propósito; o card tem de falar a mesma língua');
checar('bloqueio não ganha selo',
  /it\.tipo !== 'bloqueado'/.test(tpl),
  'compromisso fora da rua não é propósito de venda — um selo nele diria que o dentista '
    + 'faz parte do funil');

console.log('');
console.log('5 · NINGUÉM QUEBRA COM O CAMPO NOVO');

/* A VARREDURA QUE IMPORTA: leitor de slot que ENUMERE campos (Object.keys, JSON.stringify
   comparando, desestruturação fechada) quebraria com `p`. Os seis leitores desta casa
   leem `typeof v === 'object' ? v.id : v`, e é isso que esta checagem exige. */
(function () {
  const leitores = tpl.match(/\(typeof v === 'object'\)[^;\n]{0,80}/g) || [];
  checar('os leitores de slot leem id e hora, e não enumeram campos',
    leitores.length >= 4 && leitores.every(function (l) {
      return /v\.id|v\.hora|v\.p/.test(l) && !/Object\.keys|JSON\.stringify/.test(l);
    }),
    'leitor que enumera campos do slot é o que transforma um campo novo em tela branca na '
      + 'outra aba · achados ' + leitores.length);
  checar('e nenhum deles compara o slot inteiro por igualdade',
    !/=== \{ id:/.test(tpl) && !/JSON\.stringify\(v\) ===/.test(tpl),
    'comparar o objeto inteiro faria o slot com propósito deixar de casar com o mesmo '
      + 'slot sem ele');
}());

console.log('');
console.log('propósito no compromisso: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
