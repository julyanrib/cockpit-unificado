#!/usr/bin/env node
/* ============================================================================
   A RÉGUA E OS TRÊS ESTADOS (23/09/26)

   Pergunta da Kelly: ela negociou, o cliente pediu retorno em 15 dias, ela marcou o
   próximo passo — e a régua de 7 dias da Negociação a marcava como estourada no oitavo.
   Ela era cobrada 8 dias ANTES da data que ela mesma combinou.

   MEDIDO NA PRODUÇÃO antes de mexer: 243 abertos, 53 travados, e apenas ONZE com próximo
   passo datado no futuro. O sistema ensinava a não marcar — registrar a data certa não
   melhorava número nenhum e ainda deixava o negócio visível como problema.

   OS TRÊS ESTADOS: no ritmo · combinado · travado.

   O QUE ESTA SUÍTE PROTEGE, em ordem de estrago:
     1. a data VENCIDA volta a travar. Se isso quebrar, qualquer negócio some da cobrança
        para sempre marcando uma data e deixando passar — é o jeito de estacionar carteira
        sem ninguém ver;
     2. a data futura não trava, que é o pedido;
     3. dentro da régua nada muda;
     4. a regra é UMA — o arquivo calcula a régua em dois lugares e telas diferentes leem
        cada um. Duas cópias é como as telas passam a discordar do mesmo negócio.

   Uso: node scripts/testar-regua-combinado.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const robo = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

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

/* ══ A FUNÇÃO SAI DO ROBÔ E RODA DE VERDADE ═════════════════════════════════════════
   Com a tabela REAL de réguas: o que precisa ser verdade não é que a função soma, é que
   a régua da Negociação continua sendo 7 e a de Ag. Pagamento 2. */
function recortar(fonte, nome) {
  const i = fonte.indexOf('function ' + nome + '(');
  if (i < 0) { console.error('FALHA: ' + nome + ' não existe no robô.'); process.exit(1); }
  let d = 0, j = i, viu = false;
  while (j < fonte.length) {
    const c = fonte[j];
    if (c === '{') { d++; viu = true; } else if (c === '}') { d--; if (viu && d === 0) break; }
    j++;
  }
  return fonte.slice(i, j + 1);
}
const mSla = robo.match(/const SLA_DAYS = \{[\s\S]*?\};/);
const mStages = robo.match(/const STAGES = \{[\s\S]*?\};/);
if (!mSla || !mStages) { console.error('FALHA: não achei STAGES/SLA_DAYS.'); process.exit(1); }

const ctx = { Date: Date, isNaN: isNaN, Math: Math, String: String, Number: Number };
vm.createContext(ctx);
vm.runInContext(mStages[0], ctx);
vm.runInContext(mSla[0], ctx);
vm.runInContext(recortar(robo, 'estadoDaRegua'), ctx);
const estado = vm.runInContext('estadoDaRegua', ctx);
const NEGOCIACAO = vm.runInContext('STAGES.negociacao', ctx);
const REGUA_NEG = vm.runInContext('SLA_DAYS[STAGES.negociacao]', ctx);

igual('a régua da Negociação continua sendo 7 dias', REGUA_NEG, 7,
  'é a régua que o caso da Kelly estourava');

const emDias = function (n) { return new Date(Date.now() + n * 864e5).toISOString(); };

/* ══ 1. O CASO DA KELLY ═════════════════════════════════════════════════════════════
   8 dias em Negociação (régua 7) e retorno combinado para daqui a 15. */
(function () {
  const e = estado(8, NEGOCIACAO, emDias(15));
  igual('quem combinou data futura NÃO está travado', e.slaBreach, false,
    'é o caso da Kelly: ela era cobrada 8 dias antes da data que combinou');
  igual('e fica marcado como aguardando', e.aguardando, true);
  checar('com a data guardada, para a tela poder dizer qual é', !!e.aguardandoAte,
    'sem a data a tela só pode dizer "aguardando", e aguardando até quando é a pergunta');
}());

/* ══ 2. A TRAVA QUE SEGURA A REGRA DE PÉ ════════════════════════════════════════════
   Se a data vencida não voltar a travar, marca-se uma data qualquer e o negócio some da
   cobrança para sempre. É o jeito de estacionar carteira sem ninguém ver. */
(function () {
  const e = estado(30, NEGOCIACAO, emDias(-1));
  igual('data combinada VENCIDA volta a travar', e.slaBreach, true,
    'a data compra prazo, não anistia');
  igual('e deixa de ser aguardando', e.aguardando, false);
  igual('e não anuncia data nenhuma', e.aguardandoAte, null);
}());

(function () {
  const e = estado(30, NEGOCIACAO, null);
  igual('fora da régua e sem data nenhuma continua travado', e.slaBreach, true);
  igual('e não é aguardando', e.aguardando, false);
}());

/* ══ 3. DENTRO DA RÉGUA NADA MUDA ═══════════════════════════════════════════════════ */
(function () {
  const e = estado(3, NEGOCIACAO, emDias(15));
  igual('dentro da régua não trava', e.slaBreach, false);
  igual('e não é aguardando, porque não há o que aguardar', e.aguardando, false,
    'aguardando é um estado de quem JÁ passou da régua — dentro dela o negócio está no '
      + 'ritmo, e chamar isso de aguardando encheria a tela de um aviso sem assunto');
  const semData = estado(3, NEGOCIACAO, null);
  igual('e sem data também não trava dentro da régua', semData.slaBreach, false);
}());

/* ══ 4. A DATA CRUA NÃO VAZA PARA A TELA ════════════════════════════════════════════
   O HubSpot mantém notes_next_activity_date depois do prazo passar. Antes desta mudança
   o mapa de funilLeads repassava a propriedade CRUA, então data vencida chegava na tela
   como se fosse compromisso em pé. */
(function () {
  const e = estado(3, NEGOCIACAO, emDias(-5));
  igual('data já vencida não é devolvida como próximo passo', e.proximaAtividade, null,
    'a tela dizia "próximo passo no CRM: 12/08" para uma data que já passou');
  const f = estado(3, NEGOCIACAO, emDias(5));
  checar('e a futura é devolvida', !!f.proximaAtividade);
}());

/* ══ 5. LIXO NÃO DERRUBA A CONTA ════════════════════════════════════════════════════ */
(function () {
  ['', 'amanhã', '0000-00-00', undefined].forEach(function (v) {
    const e = estado(30, NEGOCIACAO, v);
    if (e.slaBreach !== true || e.aguardando !== false) {
      falhas.push('data inválida (' + JSON.stringify(v) + ') deveria deixar travado\n'
        + '      data que o robô não entende não pode virar perdão de régua');
      return;
    }
    ok += 1;
  });
}());

/* ══ 6. A REGRA É UMA SÓ ════════════════════════════════════════════════════════════ */
checar('nenhum lugar do robô calcula a régua por fora',
  (robo.match(/dias > \(SLA_DAYS\[stageId\] \|\| 999\)/g) || []).length === 0,
  'a régua era calculada em dois lugares e telas diferentes liam cada um — duas cópias da '
    + 'mesma regra é como as telas passam a discordar sobre o mesmo negócio');
/* CONTA AS CHAMADAS, NÃO A DECLARAÇÃO: `function estadoDaRegua(dias, stageId` casa com o
   mesmo padrão da chamada, e a primeira versão desta checagem exigia 2 quando havia 3 —
   reprovou o conserto por contar a própria função. */
checar('e os dois caminhos chamam estadoDaRegua',
  (robo.match(/estadoDaRegua\(dias, stageId, d\.properties\.notes_next_activity_date\)/g) || []).length === 2,
  'o mapa de funilLeads e o laço por executivo alimentam telas diferentes');

/* ══ 7. A TELA MOSTRA O TERCEIRO ESTADO ═════════════════════════════════════════════
   Negócio que some da cobrança sem aparecer em lugar nenhum é como se estaciona carteira. */
checar('a etapa conta quem está aguardando',
  /aguardando: ls\.filter\(l => l\.aguardando === true\)\.length,/.test(tpl),
  'sem contar, o gestor não tem como saber que eles existem');
checar('e a linha da etapa diz isso em palavras',
  /aguardando data combinada/.test(tpl),
  'o número sem a frase vira mais um contador que ninguém sabe ler');

console.log('');
console.log('régua · três estados: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
