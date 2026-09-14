/* ============================================================================
   TODO PASSO QUE VAI PRO CRM TEM DE CHEGAR NA AGENDA DELE (14/09/26)

   PERGUNTA QUE ORIGINOU ESTA SUITE, do Julyan: "tudo que eles registram nesses
   proximos passos, eles estao indo pra agenda deles? tudo ta sendo coerente?"

   A resposta era NAO em duas portas, e as duas eram do mesmo feitio do defeito da
   vespera: a tela avisava "tarefa no HubSpot ✓" e nem a grade da semana, nem a faixa
   de agenda da Hoje, nem a Daily do gestor ficavam sabendo. Quem promete e nao aparece
   para o gestor vira "nao prometeu" na tela dele — foi exatamente essa a queixa.

   O QUE ESTA SUITE MEDE, e por que ela e diferente das outras: ela nao vigia um
   trecho de codigo. Ela vigia uma REGRA DE ARQUITETURA — existe UMA porta de escrita
   no CRM (`criarTarefaVisitaNoHubspot`) e todo uso dela precisa de um espelho nas
   telas por perto (`registrarAgendamentoLocal` ou `espelharPassoNasTelas`). O valor
   dela nao esta nas 16 chamadas de hoje: esta na 17a, que alguem vai escrever daqui a
   tres meses sem lembrar desta conversa.

   O PISO E ZERO E NAO TEM LISTA DE DIVIDA, de proposito. Lista de excecao aqui seria
   o lugar onde o proximo passo mudo se esconderia com aparencia de decisao tomada.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const linhas = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8')
  .split(/\r?\n/);

/* A JANELA E DE 45 LINHAS PARA CIMA E PARA BAIXO. Nao e arbitraria: e maior que o
   maior bloco try/catch/compensacao das cinco portas da rota, que e o padrao mais
   espalhado desta base (grava, falha, desfaz no Supabase, avisa). Janela curta
   reprovaria codigo correto; janela sem limite aceitaria espelho de outra funcao. */
const JANELA = 45;

const chamadas = [];
linhas.forEach((linha, i) => {
  if (linha.indexOf('criarTarefaVisitaNoHubspot(') < 0) return;
  if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return;                    /* comentario nao grava */
  if (linha.indexOf('async function criarTarefaVisitaNoHubspot') > -1) return;  /* a propria */
  if (linha.indexOf('typeof criarTarefaVisitaNoHubspot') > -1) return;          /* a sondagem */

  const volta = linhas.slice(Math.max(0, i - JANELA), Math.min(linhas.length, i + JANELA))
    .join('\n')
    .replace(/^\s*(\/\/|\*).*$/gm, '');   /* espelho citado em comentario nao espelha nada */

  let dono = '(topo do arquivo)';
  for (let k = i; k >= 0; k--) {
    const m = linhas[k].match(/^\s*(?:async )?function ([A-Za-z0-9_$]+)/);
    if (m) { dono = m[1]; break; }
  }
  chamadas.push({
    linha: i + 1,
    dono: dono,
    espelha: /registrarAgendamentoLocal\(|espelharPassoNasTelas\(/.test(volta)
  });
});

let ok = 0;
const falhas = [];
const checar = (nome, cond, detalhe) => { if (cond) { ok++; return; } falhas.push(nome + (detalhe ? ' — ' + detalhe : '')); };

/* 1 — a porta unica continua unica. Se alguem escrever tarefa por outro caminho, a
       contagem acima passa a medir menos do que existe, e esta suite ficaria verde
       vigiando o vazio. */
checar('a escrita de tarefa no CRM tem uma porta so',
  chamadas.length >= 14,
  'achei só ' + chamadas.length + ' chamadas de criarTarefaVisitaNoHubspot; ou a porta '
    + 'mudou de nome, ou apareceu um segundo caminho de escrita que esta suíte não vê');

/* 2 — a regra */
const mudas = chamadas.filter(c => !c.espelha);
checar('todo passo gravado no CRM avisa as telas do executivo',
  mudas.length === 0,
  mudas.length + ' porta(s) gravam no HubSpot e a agenda dele não fica sabendo: '
    + mudas.map(c => c.dono + ' (linha ' + c.linha + ')').join(', ')
    + ' — a tela diz ✓ e o gestor vê "não prometeu"');

/* 3 — os dois espelhos continuam existindo. Uma renomeacao silenciosa faria a
       checagem 2 reprovar tudo de uma vez, e a mensagem acima seria enganosa; esta
       aqui separa "alguem abriu porta muda" de "o espelho mudou de nome". */
const corpo = linhas.join('\n');
checar('os dois espelhos existem com o nome que a regra cita',
  /function registrarAgendamentoLocal\(/.test(corpo)
    && /function espelharPassoNasTelas\(/.test(corpo),
  'se um deles foi renomeado, a checagem acima reprova o arquivo inteiro por um motivo '
    + 'que não é o verdadeiro');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('passo chega na agenda: ' + ok + ' checagens ok — '
  + chamadas.length + ' portas gravam no CRM, as ' + chamadas.length + ' avisam a tela dele.');
