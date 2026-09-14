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


/* ══ A ROTA OCUPA SLOT NA GRADE (14/09/26) ═════════════════════════════════════════
   Julyan: "rota do mapa tem q ocupar slot na grade, até pra gente combater se ele vai
   mesmo ou não né". O slot é a PROMESSA e o desfecho no HubSpot é a evidência — sem o
   slot não há o que cobrar. Antes a rota vivia só em leads_prospeccao, que a Daily do
   gestor não lê: quem montava seis paradas aparecia para ele como "não prometeu". */

checar('as portas da rota põem a parada na GRADE, não só na sessão',
  (function () {
    /* registrarAgendamentoLocal sozinho é espelho de sessão: resolve a faixa de agenda
       da Hoje e não resolve a Daily do gestor. As cinco portas têm de passar pelo
       espelho completo, que escreve no plano da semana. */
    const portas = ['adicionarNaRotaDoRep', 'adicionarProspeccaoNaRota'];
    return portas.every(function (fn) {
      const i = corpo.indexOf('function ' + fn);
      if (i < 0) return false;
      return corpo.slice(i, i + 4000).indexOf('espelharPassoNasTelas(') > -1;
    });
  }()),
  'sem o plano da semana, a parada não chega na Daily do gestor e o executivo aparece '
    + 'como "na mesa · não prometeu" com o dia cheio de visitas');

checar('o id da grade sai da FORMA do id, não cravado em "c-"',
  /const idNaGrade = \(\/\^\[0-9\]\+\$\/\.test\(String\(lead\.id\)\) \? 'c-' : 'n-'\) \+ String\(lead\.id\);/
    .test(corpo),
  'conta de prospecção é n-<uuid> na munição; gravar c-<uuid> não dá erro — dá slot '
    + 'órfão, que a grade desenha e ninguém consegue abrir');

checar('o envio em lote grava uma parada por vez',
  (function () {
    const i = corpo.indexOf('btnEnviarAgenda.textContent = `Enviando');
    if (i < 0) return false;
    const trecho = corpo.slice(i, i + 1600);
    return /await espelharPassoNasTelas\(/.test(trecho);
  }()),
  'o espelho lê a grade inteira, muda um slot e grava a grade inteira de volta — seis '
    + 'em paralelo são cinco paradas perdidas, com sucesso em todas as chamadas');

checar('e o lote não dispara um aviso por parada',
  /await espelharPassoNasTelas\([^;]*\{ silencioso: true \}\)/.test(corpo)
    && /const calado = !!\(opcoes && opcoes\.silencioso\);/.test(corpo),
  'seis toasts em fila é a tela empurrando o executivo para fora dela');

checar('a frase do lote diz quantas entraram no Planejamento',
  corpo.indexOf('const sobreAGrade = (naGrade === 0 && foraDaGrade.length === 0)') > -1
    && corpo.indexOf('No seu Planejamento entraram ') > -1,
  '"na agenda" e "no Planejamento" não são a mesma coisa, e é a segunda que o gestor vê '
    + 'na Daily dele');

checar('a conta recém-criada pelo mapa entra na munição antes de virar slot',
  /prospeccaoCache\.push\(lead\);/.test(corpo),
  'a munição do Planejamento sai de prospeccaoCache — sem isso o espelho recusaria com '
    + '"fora da munição" uma conta que o próprio clique acabou de criar');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('passo chega na agenda: ' + ok + ' checagens ok — '
  + chamadas.length + ' portas gravam no CRM, as ' + chamadas.length + ' avisam a tela dele.');
