// scripts/testar-login.js
//
// A TELA DE LOGIN (07/09/26)
// -----------------------------------------------------------------------------
// Ela é a única tela cuja regressão tranca o time inteiro fora do produto — e até
// hoje não tinha suíte. Nasceu junto com a troca pela artboard 1b, e cada
// checagem aqui existe por um defeito real, a maioria deles cometido por mim
// nesta mesma troca.
//
// O QUE ELA NÃO MEDE: se o login funciona. Isso é Supabase de verdade e só se
// prova entrando. Ela mede o CONTRATO em volta: os ids que a auth toca, os três
// formulários, os três estados, o que vaza no HTML público e o piso de toque.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let falhas = 0;
let ok = 0;
function checar(nome, condicao, porque) {
  if (condicao) { ok++; return; }
  falhas++;
  console.error('  ✗ ' + nome);
  if (porque) console.error('      ' + porque);
}

/* ── 1. O CONTRATO COM A AUTENTICAÇÃO ──────────────────────────────────────────
   Os ids abaixo são tocados por iniciarAuth() e mostrarFormulario(). Perder um
   não quebra build nem suíte nenhuma: quebra o login, em produção, para todos.
   Foram 14 quando a 1b entrou, e cada um tem de existir UMA vez. */
const IDS = ['loginGate', 'loginForm', 'loginEmail', 'loginPassword', 'loginBtn',
  'esqueciSenhaLink', 'resetForm', 'resetEmail', 'resetBtn', 'voltarLoginLink',
  'novaSenhaForm', 'novaSenhaInput', 'novaSenhaBtn', 'loginStatus'];
IDS.forEach(function (id) {
  const n = template.split('id="' + id + '"').length - 1;
  checar('o id ' + id + ' existe uma vez', n === 1,
    'a auth chama getElementById(\'' + id + '\') — achei ' + n);
});

/* ── 2. OS TRÊS FORMULÁRIOS ────────────────────────────────────────────────────
   mostrarFormulario() alterna entre os três por id. Se o de reset desaparecer no
   redesenho, ninguém descobre até alguém esquecer a senha — e aí a pessoa fica
   sem caminho nenhum. */
checar('os formulários de reset e de nova senha nascem ocultos',
  template.indexOf('<div id="resetForm" style="display:none;">') > 0 &&
  template.indexOf('<div id="novaSenhaForm" style="display:none;">') > 0,
  'mostrarFormulario() os mostra na hora certa; nascer visível empilharia os três');

/* ── 3. NADA SENSÍVEL ANTES DO LOGIN ──────────────────────────────────────────
   Regra do prompt e teste de aceite 3: ver o código-fonte antes de entrar não
   pode revelar funil, MRR nem nome de cliente. O DATA público é uma casca desde
   07/08/26, e a tela 1b acrescentou DOIS INTEIROS (o tamanho do time). */
const build = path.join(raiz, 'scripts', 'build.js');
const buildSrc = fs.readFileSync(build, 'utf8');
checar('o DATA público continua sem usuários',
  buildSrc.indexOf('usuarios: []') > 0,
  'usuarios carrega e-mails: lista cheia no HTML público é vazamento');
checar('o tamanho do time entra como dois inteiros, e não como lista',
  buildSrc.indexOf('timeNoField: contarTimeNoField()') > 0 &&
  buildSrc.indexOf('return { ativos: reps.length - emPreparacao, emPreparacao: emPreparacao };') > 0,
  'a tela precisa do NÚMERO, e número não carrega nome nem e-mail');

/* A MESMA REGRA NAS DUAS TELAS. O cabeçalho do app publica esse número depois do
   login (preencherCabecalhoRodape: reps cadastrados menos os aComecar). Se o
   login dissesse 11 e o cabeçalho 6, o executivo veria dois tamanhos de time em
   dez segundos — e o primeiro número que ele lê é o da tela de login.
   A regra existe em dois lugares por necessidade (Node no build, navegador na
   tela), então esta checagem compara os dois resultados de verdade. */
(function contagemBate() {
  let arq;
  try { arq = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'usuarios.json'), 'utf8')); }
  catch (e) { checar('a contagem do time bate com a do cabeçalho', false, 'não li usuarios.json: ' + e.message); return; }
  const lista = Array.isArray(arq) ? arq : (arq.usuarios || []);
  const reps = lista.filter(function (u) { return u && u.role === 'rep'; });
  const emPrep = reps.filter(function (u) { return u.aComecar; }).length;
  const esperado = reps.length - emPrep;
  /* roda a função do build de verdade, em vez de reimplementá-la aqui */
  let doBuild = null;
  try {
    const m = /function contarTimeNoField\(\)[\s\S]*?\n\}/.exec(buildSrc);
    const fn = new Function('fs', 'path', 'root', m[0] + '; return contarTimeNoField();');
    doBuild = fn(fs, path, raiz);
  } catch (e) { /* cai no null e reprova abaixo */ }
  checar('a contagem do time bate com a regra do cabeçalho',
    doBuild && doBuild.ativos === esperado,
    'build diz ' + JSON.stringify(doBuild) + ' e a regra do cabeçalho diz ' + esperado);
}());

/* ── 4. OS TRÊS ESTADOS DA PRANCHA ────────────────────────────────────────────
   Erro de credencial, sessão expirada e carregando têm desenhos diferentes. Quem
   sabe em qual estado a tela está é a auth — ela DIZ, num data-estado. A
   alternativa era a tela farejar o texto da mensagem para escolher a cor, que
   quebra na primeira vez que alguém reescrever uma frase. */
checar('existe uma função só para o estado do login',
  (template.match(/function loginEstado\(/g) || []).length === 1,
  'dois lugares decidindo o estado divergem na primeira mudança');
['erro', 'carregando', 'expirada'].forEach(function (estado) {
  checar('a auth declara o estado ' + estado,
    /* o estado chega por duas portas: loginEstado direto, ou mostrarLogin(msg, estado)
       — a segunda e como a sessao expirada se declara. As duas contam. */
    template.indexOf("loginEstado('" + estado + "'") > 0 || template.indexOf("'" + estado + "');") > 0,
    'estado que ninguém declara nunca é desenhado');
});
checar('sessão expirada não aparece duas vezes',
  template.indexOf("if (st) st.textContent = (estado === 'expirada') ? '' : (mensagem || '');") > 0,
  'a pill diz a frase; a linha de mensagem tem de ficar vazia');

/* ── 5. OS DOIS DEFEITOS DE ESPECIFICIDADE, que eu cometi nesta troca ─────────
   A prancha é toda estilo inline, e inline vence a folha. Duas vezes o desenho
   certo não apareceu:
     · a pill de sessão expirada nasce com `hidden` E com display:flex inline —
       hidden=true e display=flex ao mesmo tempo, e todo visitante de primeira
       viagem lia "sua sessão terminou" sobre sessão que nunca existiu;
     · a borda vermelha de erro não pintava, porque o campo tem
       `border:1.5px solid #DCE1EA` no inline. */
checar('o [hidden] vence o display inline da prancha',
  template.indexOf('#login1bExpirada[hidden],') > 0 &&
  template.indexOf('#login1bTime[hidden]{display:none !important;}') > 0,
  'sem isto a pill fica visível para quem nunca logou');
checar('a borda de erro vence o inline da prancha',
  /\.login-1b\[data-estado="erro"\][\s\S]{0,400}border-color:#E51A31 !important;/.test(template),
  'a mensagem aparecia e o campo continuava cinza');

/* ── 6. O DIA DA SEMANA, sem API ───────────────────────────────────────────────
   Sete dias, e sábado e domingo NÃO mandam ninguém para a rua — "hoje tem rua
   pra fazer" no sábado seria a tela cobrando o que ninguém vai fazer. */
checar('a tabela do dia tem os sete dias',
  (template.match(/\{ curto: '(dom|seg|ter|qua|qui|sex|sáb)'/g) || []).length === 7,
  'dia sem linha na tabela cai no fallback e mostra a frase de outro dia');
checar('o dia é o de Brasília, e não o do relógio do aparelho',
  template.indexOf("timeZone: 'America/Sao_Paulo', weekday: 'short'") > 0,
  'um celular com fuso errado abriria a tela num dia diferente do resto do time');
checar('sábado e domingo não mandam ninguém para a rua',
  template.indexOf('A semana<br>começa amanhã') > 0 &&
  template.indexOf('Sábado.<br>A rua descansa') > 0,
  'entusiasmo em dia que não tem rua é a tela cobrando o que não existe');

/* ── 7. PISO DE TOQUE ─────────────────────────────────────────────────────────
   Quem entra nisto entra da rua, no celular, muitas vezes com uma mão. */
checar('os campos têm 44px e o botão 48px',
  (template.match(/height:44px;border:1\.5px solid #DCE1EA/g) || []).length >= 1 &&
  template.indexOf('min-height:48px;border:0;border-radius:12px;background:#E51A31') > 0,
  'alvo menor que 44px erra o dedo de quem está em pé na calçada');

/* ── 8. O QUE SAIU ────────────────────────────────────────────────────────────
   As quatro abas decorativas do briefing ("01 Território / 02 Prioridade / 03
   Presença / 04 Parceria") eram clicáveis e só trocavam uma frase embaixo delas.
   A prancha as tira. Uma checagem negativa: elas passam por estarem ausentes. */
checar('o briefing de quatro abas decorativas não voltou',
  template.indexOf('data-login-stage') < 0 &&
  template.indexOf('login-brief') < 0,
  'quatro cliques que só trocavam uma frase — a prancha os removeu');

if (falhas) {
  console.error('\nlogin: ' + falhas + ' checagem(ns) reprovada(s) de ' + (ok + falhas) + '.');
  process.exit(1);
}
console.log('login: ' + ok + ' checagens ok — contrato da auth intacto, três estados declarados, '
  + 'nada sensível antes de entrar e piso de toque de quem usa na rua.');
