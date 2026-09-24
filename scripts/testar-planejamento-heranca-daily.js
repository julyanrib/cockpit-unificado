#!/usr/bin/env node
/* ============================================================================
   O QUE A MINHA DAILY PROTEGIA, E QUEM PROTEGE AGORA (24/09/26)

   A aba Minha Daily do executivo saiu. Com ela saíram duas suítes:

     testar-minha-daily.js   62 checagens
     testar-d7-acao.js       19 checagens

   A MAIOR PARTE MORREU COM A TELA — o relógio da trava das 13h, o hero da promessa, os
   três fallbacks, a régua de desfecho dela, o clique morto do "Ficha" numa visita sem
   negócio. Não há onde acontecer.

   MAS SEIS REGRAS NÃO ERAM DA TELA: eram do DIA do executivo, e o dia continua, agora só
   no Planejamento. Aposentar as suítes sem trazê-las seria perder, em silêncio, seis
   coisas que alguém já quebrou uma vez. Estão aqui, uma por uma, com o defeito que as
   originou — e medidas no lugar onde o dia é montado hoje.

   Uso: node scripts/testar-planejamento-heranca-daily.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
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

console.log('');
console.log('1 · A HORA EXIBIDA É A QUE ELE ESCOLHEU');

/* VINHA DE: "toda hora exibida é a escolhida pelo executivo (pl6SlotHora), nunca a faixa
   da posição". O defeito: a leitura REINFERIA a faixa quando o slot não trazia hora, e a
   tela anunciava 10:30 para uma visita que ninguém marcou às 10:30. Ele chegava às 10:30
   num lugar que o esperava às 14:00. */
(function () {
  const c = { String: String, Number: Number };
  vm.createContext(c);
  vm.runInContext(recortar('pl6SlotHora'), c);
  const hora = vm.runInContext('pl6SlotHora', c);

  igual('o slot com hora devolve a hora dele', hora({ id: '7', hora: '14:20' }, 0), '14:20');
  igual('o slot SEM hora não inventa a da faixa', hora('7', 0), '',
    'era `return PL6_HORAS[si]` — a tela anunciava 10:30 para uma visita que ninguém '
      + 'marcou às 10:30, e ele chegava no lugar errado na hora errada');
  igual('nem na oitava posição, onde faixa nenhuma existe', hora('7', 9), '');
  igual('e o slot vazio também não', hora(null, 0), '');
}());

checar('e a tela escreve "sem hora" quando não há',
  /esc\(it\.hora \|\| 'sem hora'\)/.test(codigo),
  'hora em branco no cartão lê como "ainda vou marcar"; "sem hora" diz o que é');

console.log('');
console.log('2 · O RELÓGIO E A FICHA SÃO COMPARTILHADOS');

/* VINHA DE: "relógio e ficha compartilhados". Duas cópias do seletor de hora divergiam na
   régua de "ocupado" — que é justamente a que protege o dia de duas visitas na mesma hora. */
checar('o seletor de hora é um só',
  (codigo.match(/function pfRelogioHTML\(/g) || []).length === 1,
  'duas cópias do seletor divergiam na régua de "ocupado", que é a que impede duas '
    + 'visitas na mesma hora');
checar('e a ficha do negócio também',
  (codigo.match(/function pl6FichaPainelHTML\(/g) || []).length === 1
    && /pl6FichaPainelHTML\(/.test(codigo),
  'a ficha é onde ele move etapa e vê o telefone: duas seriam duas regras de etapa');

console.log('');
console.log('3 · O BLOCO DE RELACIONAMENTO CONTINUA SENDO LIDO');

/* VINHA DE: "bloco de relacionamento de ponta a ponta". O defeito original: a Daily CRIAVA
   o bloco e o Planejamento só sabia ler um dos dois — abrir o Planejamento depois disso
   dava TypeError e a aba não desenhava. A Daily saiu; o que ela gravou continua no banco. */
(function () {
  const c = { String: String, Number: Number, Array: Array, Object: Object, Date: Date,
    Math: Math, isNaN: isNaN };
  vm.createContext(c);
  [/const PL6_BLOQUEADO = '[^']+';/, /const PL6_RUA = '[^']+';/, /const PL6_REL = '[^']+';/]
    .forEach(function (re) { vm.runInContext(tpl.match(re)[0], c); });
  ['pl6SlotId', 'pl6SlotRua', 'pl6SlotRel', 'pl6SlotBloqueado', 'pl6SlotHora',
    'pl6SlotProposito', 'pl6ResultadoDoSlot', 'pl6PorHora', 'pl6ItensDoDia']
    .forEach(function (f) { vm.runInContext(recortar(f), c); });
  const itens = vm.runInContext('pl6ItensDoDia', c);
  const PL6_REL = vm.runInContext('PL6_REL', c);

  const lidos = itens([PL6_REL, { id: PL6_REL, hora: '10:00' }], new Map());
  igual('o sentinela antigo é reconhecido, nas duas formas',
    lidos.map(function (x) { return x.tipo; }), ['rel', 'rel'],
    'semana gravada pela Daily continua no banco — não reconhecer o sentinela é o slot '
      + 'virando buraco na segunda de manhã, que foi o TypeError de 10/09');
  igual('e ele não vira lead', lidos.map(function (x) { return x.id; }), [undefined, undefined],
    'sentinela virando id faz porId.get() falhar e o slot virar "conta fora da carga"');
}());

checar('mas ele não é mais OFERECIDO como bloco',
  !/'bloco:' \+ PL6_REL/.test(codigo),
  'relacionamento virou propósito em 23/09: ele escolhe o CLIENTE e a tarefa nasce '
    + 'amarrada ao negócio, o que o bloco sentinela nunca conseguiu fazer');

console.log('');
console.log('4 · OS SENTINELAS NÃO VIRAM LEAD');

checar('bloqueio, rua e relacionamento devolvem null em pl6SlotId',
  /id === PL6_BLOQUEADO \|\| id === PL6_RUA \|\| id === PL6_REL\) return null;/.test(codigo),
  'sentinela virando id de lead faz porId.get() falhar, e a rua entraria na lista de ids '
    + 'já usados — duas voltas de rua no mesmo dia são legítimas');

console.log('');
console.log('5 · "LIGAR AGORA" SÓ EXISTE COM TELEFONE');

/* VINHA DE: "ligar agora ▸ só com telefone, e cai para datar tarefa sem ele". O botão
   estava na Daily; o telefone hoje vive na ficha do negócio, que é para onde o prompt da
   prancha final mandou essa ação. A regra que sobrevive é a de baixo: nenhum link de
   telefone é montado sem número. */
/* A PRIMEIRA VERSÃO DESTA CHECAGEM exigia `${` em todo href de telefone, e reprovou os
   cinco que existem: quatro são montados por CONCATENAÇÃO ('href="tel:' + esc(tel)),
   que é igualmente correto. O que ela quer medir é outra coisa — que nenhum deles saia
   com o `tel:` seco, sem nada depois. */
checar('nenhum link tel: é montado sem número',
  (function () {
    /* SECO É SÓ `href="tel:"` — a primeira versão também casava `href="tel:' + esc(tel)`,
       que é a forma CONCATENADA e está correta: a aspa simples ali fecha a string do JS,
       não o atributo. Guarda que reprova a forma certa é guarda que alguém desliga. */
    const secos = codigo.match(/href="tel:"/g) || [];
    const vivos = (codigo.match(/href="tel:/g) || []).length;
    return vivos > 0 && secos.length === 0;
  }()),
  'um "ligar agora" que abre o discador vazio é pior que não ter botão: ele parece que '
    + 'funcionou');
checar('e a ficha do negócio é quem mostra o telefone',
  /whatsapp|celular/i.test(codigo) && /function pl6FichaCamposFinal\(/.test(codigo),
  'a prancha final mandou a ação de ligar para a ficha — se o telefone sumir de lá, ela '
    + 'não tem outro lugar');

console.log('');
console.log('6 · E A ABA NÃO VOLTA');

checar('nenhuma função d7* sobrou no template',
  (codigo.match(/\bd7[A-Z][A-Za-z0-9]*\s*\(/g) || []).length === 0,
  'função da tela morta é código que a próxima pessoa tenta entender antes de descobrir '
    + 'que ninguém a chama · achadas: '
    + JSON.stringify([...new Set(codigo.match(/\bd7[A-Z][A-Za-z0-9]*/g) || [])].slice(0, 5)));
checar('nenhum ouvinte data-d7-* ficou sem emissor',
  (codigo.match(/data-d7-[a-z-]+/g) || []).length === 0,
  'atributo de tela morta no CSS ou num closest é clique que nunca chega · achados: '
    + JSON.stringify([...new Set(codigo.match(/data-d7-[a-z-]+/g) || [])].slice(0, 5)));
checar('o executivo que chega na rota antiga cai no Planejamento',
  /if \(sessaoAtual && sessaoAtual\.role === 'rep'\) \{[\s\S]{0,260}?activateTab\('viewAgenda'\)/.test(codigo),
  'hash salvo, link antigo em conversa e aba restaurada pelo navegador caem todos em '
    + 'renderDaily — sem a porta, veriam uma tela que ninguém mais mantém');
checar('e a aba some do menu dele',
  /\(emOnboarding \|\| souRep\) \? 'none' : 'flex'/.test(codigo),
  'aba visível que redireciona é pior que aba ausente: ele clica e a tela pula');

console.log('');
console.log('herança da Minha Daily: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
