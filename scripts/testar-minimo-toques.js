#!/usr/bin/env node
/* ============================================================================
   O PISO DE PONTOS DE CONTATO — CIÊNCIA, NÃO TRAVA (19/09/26)

   Julyan: "é PROIBIDO só ir uma vez no lead, tem q colocar obrigatoriedade de no mínimo
   4 pontos de contato." E, corrigindo meu rumo no meio da construção: "quando eu falo
   obrigatorio, é deixar eles ciente disso, nao travar nada."

   EU TINHA CONSTRUÍDO UMA TRAVA — a rota devolvia 409 e a tela abria um modal de
   exceção com justificativa. Saiu inteira. Esta suíte guarda o que ficou, e o PRIMEIRO
   grupo de checagens existe para impedir que a trava volte por distração: é fácil, daqui
   a dois meses, alguém ler "obrigatório" no código e achar que faltou bloquear.

   MEDIDO ANTES DE ESCREVER, com o critério de toque REALIZADO:
     · 137 dos 140 negócios abertos do funil estão abaixo de 4 toques; 54 têm ZERO;
     · dos 99 negócios perdidos entre 09/09 e 18/09, 99 tiveram menos de 4 — e 74 (75%)
       não têm UM toque registrado. Motivo mais comum: "Sem retorno".
   Parte disso é falta de REGISTRO, não de trabalho — e é por isso que o aviso conta em
   vez de acusar, e por isso o texto diz "pelo menos N".

   Uso: node scripts/testar-minimo-toques.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const rota = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'), 'utf8');
const montar = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');
const cadencias = require(path.join(raiz, 'data', 'cadencias.json'));

let ok = 0;
const falhas = [];
function checar(nome, cond, dica) {
  if (cond) { ok += 1; return; }
  falhas.push(nome + (dica ? '\n      ' + dica : ''));
}

/* ── 1. O PISO VIVE NA RÉGUA, E EM UM LUGAR SÓ ───────────────────────────────────── */
checar('data/cadencias.json declara o piso de pontos de contato',
  Number(cadencias.minimoToques) === 4,
  'o número é política, e política vive no arquivo que ele edita — veio '
    + JSON.stringify(cadencias.minimoToques));
checar('e o arquivo explica de onde o 4 saiu',
  /minimoToquesComment/.test(JSON.stringify(Object.keys(cadencias)))
    && /137 dos 140/.test(String(cadencias._minimoToquesComment || '')),
  'daqui a seis meses ninguém lembra por que era 4, e o número vira folclore');
checar('o front lê o piso por uma função só',
  tpl.indexOf('function cadenciaMinimoToques(') > 0,
  'foi assim que o || 10 da meta de clientes virou cinco cópias com o mesmo defeito');

/* PISO ZERO DESLIGA A REGRA — é como ele a revoga sem deploy, e sem que a tela passe a
   acusar o funil inteiro de estar "abaixo de zero". */
checar('piso zero desliga a regra em vez de acusar todo mundo',
  /if \(v == null \|\| v === ''\) return 0;/.test(tpl)
    && /const abaixoDoMinimo = minimoToques > 0 && toques\.total < minimoToques;/.test(tpl),
  'Number(x) || 4 daria 4 para um piso deliberadamente zerado, e zerar é decisão dele');

/* ── 2. NINGUÉM TRAVA NADA — a correção dele, virada guarda ─────────────────────── */
/* ESTAS TRÊS SÃO O CORAÇÃO DESTA SUÍTE. Eu construí a trava e desfiz; o que impede ela
   de voltar por distração é reprovar aqui, com o motivo escrito. */
checar('a rota de mudar etapa NÃO conhece o piso',
  rota.indexOf('minimoToques') < 0 && rota.indexOf('MINIMO_TOQUES') < 0,
  '"obrigatorio, é deixar eles ciente disso, nao travar nada" — 19/09/26');
checar('e não existe recusa por contagem de toques em lugar nenhum do servidor',
  rota.indexOf('abaixo_do_minimo_de_toques') < 0,
  'a perda continua sendo um direito do executivo; o Cockpit informa, não autoriza');
checar('e a tela não condiciona a gravação ao piso',
  tpl.indexOf('confirmarAbaixoDoMinimo') < 0
    && tpl.indexOf('justificativaAbaixoDoMinimo') < 0,
  'modal de exceção com justificativa obrigatória é trava com outro nome');

/* ── 3. O AVISO EXISTE, E É AVISO ────────────────────────────────────────────────── */
const iAviso = tpl.indexOf('function avisoDoMinimoHTML(');
checar('existe a função que avisa', iAviso > 0);
const corpoAviso = iAviso > 0
  ? tpl.slice(iAviso, tpl.indexOf('\n}', iAviso) + 2) : '';

checar('o aviso sai vazio quando não há o que dizer',
  /if \(!est \|\| !est\.abaixoDoMinimo\) return '';/.test(corpoAviso),
  'caixa que aparece sempre é caixa que ninguém lê — inclusive a que importa');
checar('o aviso diz quantos faltam, e não só que faltou',
  /const faltam = est\.toquesFaltando \|\| 0;/.test(corpoAviso)
    && /faltam > 0 \? ' — faltam ' \+ faltam/.test(corpoAviso),
  '"pouco toque" não é acionável; "faltam 3" é');
checar('o aviso trata a contagem como PISO, com "pelo menos"',
  /const parcial = !!\(est\.toques && est\.toques\.parcial\);/.test(corpoAviso)
    && /parcial \? 'Pelo menos ' : ''/.test(corpoAviso),
  'toques.parcial é SEMPRE true: o HubSpot não devolve histórico completo, e afirmar '
    + '"1 toque" onde o certo é "pelo menos 1" é a tela acusando com um número que não tem');
checar('e ele diz que dá para seguir mesmo assim',
  /Você pode seguir mesmo assim/.test(corpoAviso),
  'aviso que parece bloqueio é lido como bloqueio, e o executivo vai fazer no HubSpot');
checar('e oferece a saída de quem foi e não registrou',
  /não registrou, registrar agora/.test(corpoAviso),
  '74 das 99 perdas de 09-18/09 não têm um toque registrado — parte é registro, não trabalho');
checar('o aviso nunca derruba o formulário de mudar etapa',
  /try \{ est = estadoDoNegocio\(lead\); \} catch \(e\) \{ return ''; \}/.test(corpoAviso),
  'a etapa é o que grava no CRM; o aviso é acessório e não pode subir por cima dela');

/* ── 4. E ELE APARECE NAS DUAS PORTAS DE SAÍDA DO FUNIL ─────────────────────────── */
checar('o aviso aparece ao perder e ao reciclar',
  /\(para === ETAPA_PERDIDO_ID \|\| para === '1398311191'\) \? avisoDoMinimoHTML\(lead\) : ''/.test(tpl),
  'avisar só na perda deixaria a reciclagem como o desvio óbvio do aviso');

/* ── 5. O NÚCLEO DO EXECUTIVO E A FILA DO DIA ───────────────────────────────────── */
checar('o núcleo deriva abaixoDoMinimo do piso configurado',
  /const minimoToques = \(typeof cadenciaMinimoToques === 'function'\)/.test(tpl)
    && /const abaixoDoMinimo = minimoToques > 0 && toques\.total < minimoToques;/.test(tpl),
  'sem isto a fila do dia continua medindo "1 toque" enquanto a política pede 4');
checar('e os três fatos saem no objeto de estado',
  /\n    abaixoDoMinimo,\n    toquesFaltando,\n    minimoToques,/.test(tpl),
  'campo emitido e nunca lido é dívida que esta base já tem treze vezes');
checar('o abandonado passou a sair do piso, em vez do 1 cravado',
  /const abandonadoNoPrimeiroToque = abaixoDoMinimo && !passo &&/.test(tpl)
    && tpl.indexOf('const abandonadoNoPrimeiroToque = toques.total <= 1') < 0,
  'dois números de "pouco toque" no produto — o 1 daqui e o 4 da política — são duas verdades');
checar('a fila do dia nomeia a política no rótulo do balde',
  tpl.indexOf("rotulo: 'Clientes abaixo do mínimo de contatos'") > 0,
  '"Clientes para segunda tentativa" não diz que existe um número a cumprir');
checar('e o motivo do balde carrega o número',
  /st\.toques\.total \+ ' de ' \+ st\.minimoToques \+ ' toques — faltam ' \+ faltam/.test(tpl),
  'este texto vai para a fila do dia E para o 1:1 — é onde a cobrança acontece');

/* ── 6. A TELA DO GESTOR ────────────────────────────────────────────────────────── */
checar('o bloco 4 corta pelo piso, e não por 1',
  /const fora = minimoTq > 0/.test(tpl)
    && /ativos\.filter\(function \(x\) \{ return tm10Tq\(x\.l\.id\)\.n < minimoTq; \}\)/.test(tpl),
  'era n <= 1 — o corte tem de ser o mesmo número da política');
/* O EMISSOR E O LEITOR. A primeira versão desta checagem olhava só /fora: fora.length/ —
   sabotei acrescentando um campo ao objeto e ela passou verde, porque o que quebra de
   verdade é o número não CHEGAR ao rótulo. */
checar('e a tela diz QUANTOS estão abaixo do piso',
  /fora: fora\.length/.test(tpl) && /cob\.fora \+ ' de ' \+ cob\.ativos/.test(tpl),
  'mostrar os 5 maiores sem dizer 137 faz parecer que o problema são cinco leads');
checar('e quanto MRR está parado abaixo do piso',
  /foraMrr: fora\.reduce/.test(tpl) && /tm10Rs\(cob\.foraMrr\)/.test(tpl),
  'contagem sem dinheiro não prioriza — ele cobra pelo maior, não pelo primeiro');
checar('e marca quem PROMETEU e não foi',
  /prometeu: tq\.abertos > 0/.test(tpl),
  '"alguém marcou e não foi" é uma cobrança mais direta do que "ninguém foi"');
checar('a frase de cobertura cita a política em vez do 2 inventado',
  /' — a política pede ' \+ cob\.minimo/.test(tpl)
    && tpl.indexOf('abaixo de 2 toques o lead') < 0,
  'aquele 2 não saía da régua nem das faixas do histograma — era um número sem fonte');
checar('e a lista vazia distingue "está tudo certo" de "regra desligada"',
  /piso de pontos de contato desligado em data\/cadencias\.json/.test(tpl),
  'com a política desligada, "o time está tocando a carteira ✓" seria um elogio falso');

/* ── 7. O PISO CHEGA AOS DOIS PAPÉIS ────────────────────────────────────────────── */
checar('cadencias passa intacta para os dois papéis',
  /cadencias: cadencias \|\| null,/.test(montar),
  'é política do canal, não dado de cliente — o gestor e o executivo leem o mesmo piso');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('mínimo de toques: ' + ok + ' checagens ok — o piso vive na régua, a tela avisa '
  + 'com o número na hora de desistir, e nada no produto impede a perda.');
