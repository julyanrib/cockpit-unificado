#!/usr/bin/env node
/* ============================================================================
   PLANEJAMENTO v7 · O MOTOR DOS PROPÓSITOS (23/09/26)

   A prancha v7 troca o eixo da tela: em vez de "qual conta?", ela pergunta "o que você vai
   fazer?". Esta suíte roda o motor de verdade — a função que o robô usa — com negócios
   montados como a produção monta.

   O QUE ELA PROTEGE, em ordem de estrago:

   1. A RÉGUA DA COBRANÇA SAI DE SLA_DAYS. A spec pedia "acima da régua (>7d)" e o cartão
      dizendo "régua 7d" — mas 7 é a régua da NEGOCIAÇÃO; a de Ag. Pagamento é 2. Copiar o
      número da prancha teria posto na tela um "7 acima da régua" que não existe.

   2. FOLLOW-UP É PASSO VENCIDO OU PARA HOJE — decisão do Julyan. Data FUTURA não entra:
      aquilo é compromisso em pé, e o dia dele não começa por quem já combinou data. Se
      isso vazar, a lista de follow vira a carteira inteira e deixa de orientar.

   3. QUEM NÃO TEM ENDEREÇO NÃO SOME. Medido na produção: 126 dos 243 negócios abertos não
      têm bairro, nem cidade, nem CEP. Eles entram na lista marcados, e nunca são
      filtrados em silêncio.

   4. A GRAFIA NÃO DUPLICA LUGAR. "São Paulo" e "SÃO PAULO" são o mesmo chip.

   Uso: node scripts/testar-planejamento-propositos.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8');

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
function recortar(nome) {
  const i = src.indexOf('function ' + nome + '(');
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe no robô.'); process.exit(1); }
  let d = 0, j = i, viu = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return src.slice(i, j + 1);
}

/* ══ O MOTOR, RODANDO DE VERDADE, com as tabelas REAIS do robô ══════════════════════ */
const ctx = { Object: Object, Array: Array, String: String, Number: Number, Date: Date,
  isNaN: isNaN, Math: Math };
vm.createContext(ctx);
['const STAGES = {', 'const OPEN_STAGES = [', 'const SLA_DAYS = {', 'const PLAN_ETAPAS_BASE = ['].forEach(function (ini) {
  const re = ini.slice(-1) === '{' ? new RegExp(ini.replace(/[{[]/g, '\\$&') + '[\\s\\S]*?\\};')
    : new RegExp(ini.replace(/[{[]/g, '\\$&') + '[^\\]]*\\];');
  const m = src.match(re);
  if (!m) { console.error('FALHA: não achei ' + ini); process.exit(1); }
  vm.runInContext(m[0], ctx);
});
['planChaveLugar', 'planLugarDo', 'planItem', 'planAtrasoDias', 'planejamentoPorProposito']
  .forEach(function (f) { vm.runInContext(recortar(f), ctx); });

const S = vm.runInContext('STAGES', ctx);
const REGUA_PGTO = vm.runInContext('SLA_DAYS[STAGES.agPagamento]', ctx);
const motor = vm.runInContext('planejamentoPorProposito', ctx);

igual('a régua do Ag. Pagamento é 2, e não os 7 da prancha', REGUA_PGTO, 2,
  '7 é a régua da Negociação — copiar da prancha poria na tela um número que não existe');

const dias = function (n) { return new Date(Date.now() - n * 864e5).toISOString(); };
const DONO = '86100505';

const FUNIL = {};
/* AS TRÊS GRAFIAS QUE A PRODUÇÃO TEM: com acento, em caixa alta, e sem acento. A caixa
   sozinha seria pega por toLowerCase — é o "SAO PAULO" que exige normalizar o acento, e
   sem ele esta suíte dava verde para a normalização desligada (achado por sabotagem). */
FUNIL[S.agPagamento] = [
  { id: 1, name: 'Cobrar Atrasado', ownerId: DONO, dias: 9, cidade: 'São Paulo', valor: 1290 },
  { id: 2, name: 'Cobrar Recente', ownerId: DONO, dias: 1, cidade: 'SÃO PAULO' },
  { id: 10, name: 'Cobrar Sem Acento', ownerId: DONO, dias: 4, cidade: 'SAO PAULO' }
];
FUNIL[S.ganho1] = [{ id: 3, name: 'Cliente Ganho', ownerId: DONO, dias: 34, mrr: 289 }];
FUNIL[S.ganho2] = [{ id: 4, name: 'Em Onboarding', ownerId: DONO, dias: 5 }];
FUNIL[S.negociacao] = [
  { id: 5, name: 'Vencido 9d', ownerId: DONO, dias: 20, proximaAtividade: dias(9), cidade: 'Rio de Janeiro', bairro: 'Tijuca' },
  { id: 6, name: 'Para hoje', ownerId: DONO, dias: 3, proximaAtividade: dias(0) },
  { id: 7, name: 'Combinado pra frente', ownerId: DONO, dias: 30, proximaAtividade: new Date(Date.now() + 15 * 864e5).toISOString() },
  { id: 8, name: 'Sem passo nenhum', ownerId: DONO, dias: 40 }
];
FUNIL[S.perdido] = [{ id: 9, name: 'Perdido', ownerId: DONO, dias: 90, proximaAtividade: dias(30) }];

const r = motor(FUNIL);
const p = r.porOwner[DONO] || {};

/* ══ 1. COBRAR ══════════════════════════════════════════════════════════════════════ */
igual('cobrar traz só quem está em Ag. Pagamento', (p.cobrar.itens || []).map(function (x) { return x.nome; }),
  ['Cobrar Atrasado', 'Cobrar Sem Acento', 'Cobrar Recente'], 'ordenado por dias parado, decrescente');
igual('e a faixa "acima da régua" usa a régua real',
  (p.cobrar.faixas || []).filter(function (f) { return f.id === 'acima'; })[0],
  { id: 'acima', rot: 'acima da régua (>2d)', n: 2 },
  'com a régua errada (7), os de 9 e 4 dias parados cairiam em "dentro da régua"');

/* ══ 2. RELACIONAMENTO ══════════════════════════════════════════════════════════════ */
igual('relacionamento traz ganho + onboarding', (p.relac.itens || []).map(function (x) { return x.nome; }),
  ['Cliente Ganho', 'Em Onboarding']);
checar('e separa as duas etapas em faixas',
  (p.relac.faixas || []).filter(function (f) { return f.id === 'ganho' && f.n === 1; }).length === 1
    && (p.relac.faixas || []).filter(function (f) { return f.id === 'onboarding' && f.n === 1; }).length === 1);

/* ══ 3. FOLLOW-UP — vencido ou para hoje, nunca futuro ══════════════════════════════ */
igual('follow traz o vencido e o de hoje, nessa ordem',
  (p.follow.itens || []).map(function (x) { return x.nome; }), ['Vencido 9d', 'Para hoje'],
  'mais vencidos primeiro');
checar('data combinada para o futuro NÃO entra em follow',
  (p.follow.itens || []).every(function (x) { return x.nome !== 'Combinado pra frente'; }),
  'é compromisso em pé — o dia dele não começa por quem já combinou data');
checar('negócio sem passo nenhum também não entra',
  (p.follow.itens || []).every(function (x) { return x.nome !== 'Sem passo nenhum'; }),
  'follow é promessa vencida; quem nunca marcou nada é outro problema, e tem outra tela');
checar('negócio PERDIDO não entra em follow',
  (p.follow.itens || []).every(function (x) { return x.nome !== 'Perdido'; }),
  'só etapa aberta — cobrar follow de negócio morto é fila que ninguém trabalha');
igual('e as faixas de atraso contam certo',
  (p.follow.faixas || []).map(function (f) { return f.id + ':' + f.n; }),
  ['todos:2', '15+:0', '8-14:1', '1-7:0', 'hoje:1']);

/* ══ 4. LUGAR — grafia normalizada e ninguém sumindo ════════════════════════════════ */
(function () {
  const tres = (p.cobrar.itens || []);
  igual('"São Paulo", "SÃO PAULO" e "SAO PAULO" viram o mesmo lugar',
    [...new Set(tres.map(function (x) { return x.lugarChave; }))].length, 1,
    'grafia livre duplicava o mesmo chip — medido na produção. O acento é o que separa '
      + 'esta checagem de uma que toLowerCase sozinho já resolveria');
  checar('e o rótulo guarda a grafia como está escrita',
    tres[0].lugarRotulo === 'São Paulo');
  const semEnd = (p.follow.itens || []).filter(function (x) { return x.semEndereco; });
  checar('quem não tem endereço fica marcado, e não sumido',
    semEnd.length === 1 && semEnd[0].nome === 'Para hoje',
    '126 dos 243 negócios abertos não têm endereço nenhum: sumir com eles esconderia '
      + 'metade da carteira');
  const comBairro = (p.follow.itens || []).filter(function (x) { return x.bairroRotulo === 'Tijuca'; });
  checar('bairro entra dentro da cidade', comBairro.length === 1 && /^bairro:rio de janeiro\|/.test(comBairro[0].bairroChave));
}());

/* ══ 5. O QUE O ROBÔ NÃO CALCULA, DECLARADO ═════════════════════════════════════════ */
checar('o payload declara o que não é calculado aqui',
  !!(r.naoCalculadoAqui && r.naoCalculadoAqui.nova && r.naoCalculadoAqui.rua),
  'quem procurar `nova` aqui tem de achar a explicação, não o silêncio: leads_prospeccao é '
    + 'do Supabase e só o navegador lê');
checar('e a leitura vem com hora', !!r.lidoEm,
  'todo número desta casa diz de quando é');
checar('cada lista traz status', p.cobrar.status === 'ok' && p.relac.status === 'ok' && p.follow.status === 'ok',
  'zero medido e zero por falta de medição são coisas diferentes');

/* ══ 6. O CANO ══════════════════════════════════════════════════════════════════════ */
/* ══ A JANELA DAS 21H ÀS 00H (24/09/26) ═════════════════════════════════════════════
   Esta suíte reprovou sozinha às 00:38 UTC — 21:38 em Brasília — sem ninguém tocar no
   robô, e foi assim que o defeito apareceu: o HOJE era deslocado para Brasília e o ALVO
   não, então das 21h à meia-noite um passo combinado para hoje virava futuro e sumia do
   follow-up. Três horas por dia, justo quando alguém fecha o dia.
   Depender do relógio da máquina para pegar isso é depender de rodar a suíte à noite.
   Aqui a janela é FIXADA: 21:38 de Brasília, com o alvo marcado para as 22h do mesmo
   dia — que em UTC já é o dia seguinte. */
(function () {
  const atraso = vm.runInContext('planAtrasoDias', ctx);
  const noiteBrt = Date.parse('2026-09-24T00:38:00.000Z');   /* 21:38 de 23/09 em BRT */
  igual('às 21h38, um passo para as 22h de HOJE ainda é de hoje',
    atraso('2026-09-24T01:00:00.000Z', noiteBrt), 0,
    'o alvo lido em UTC vira 24/09 e o hoje em Brasília é 23/09: atraso −1, e o passo '
      + 'sai do follow-up. A lista esvaziava das 21h à meia-noite, todo dia');
  igual('e um passo de ontem continua vencido há um dia',
    atraso('2026-09-23T13:00:00.000Z', noiteBrt), 0,
    '10h de 23/09 em Brasília é o mesmo dia de 21h38 de 23/09');
  igual('o de anteontem, dois dias', atraso('2026-09-21T13:00:00.000Z', noiteBrt), 2);
  igual('e amanhã continua sendo futuro',
    atraso('2026-09-25T13:00:00.000Z', noiteBrt), -2);
  /* E DE DIA A CONTA NÃO MUDOU — o conserto não podia deslocar tudo em um dia. */
  const tardeBrt = Date.parse('2026-09-23T17:10:00.000Z');   /* 14:10 de 23/09 em BRT */
  igual('às 14h10, hoje é hoje', atraso('2026-09-23T15:00:00.000Z', tardeBrt), 0);
  igual('e ontem é ontem', atraso('2026-09-22T15:00:00.000Z', tardeBrt), 1);
}());

checar('o robô publica o motor no snapshot',
  /planejamento: planejamentoPorProposito\(funilLeads\),/.test(src),
  'motor que ninguém chama é código morto com comentário bonito');

console.log('');
console.log('planejamento · propósitos: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
