/* ══════════════════════════════════════════════════════════════════════════════════════
   A MINHA DAILY — A TELA QUE ELE ABRE NA RUA (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "sabendo que a aba daily deles se conversam e voce ja pegou toda a identidade
   visual da aba planejamento, voce consegue redesenhar a aba daily? ... sem clique morto,
   tudo fazendo sentido".

   ══ POR QUE ESTA SUÍTE NASCE AGORA ═════════════════════════════════════════════════
   A Minha Daily tinha UMA suíte (testar-d7-acao.js) e ela cobre a lógica da AÇÃO — de
   quem é a promessa, qual atalho a etapa sugere, o retorno que não cai no passado. O
   DESENHO e a FIAÇÃO não tinham guarda nenhuma. E este é o aparelho onde a tela é de
   fato usada: telefone, na rua, com uma mão.

   O redesenho de hoje provou a falta em cinco minutos: a casca nova não tinha a classe
   `.d7`, que é por onde `renderDaily` acha o nó para ligar o ouvinte. A tela desenharia
   inteira e NENHUM clique funcionaria. Foi a guarda do build que pegou — e ela pega o
   seletor, não a regra. Aqui a regra tem nome.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
/* sem os comentários: sete vezes neste projeto uma guarda minha leu a nota que documenta
   o conserto e reprovou o conserto */
const semCom = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ');
const codigo = semCom(tpl);

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
function corpoDe(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; }
    else if (c === '}') { d--; if (viu && d === 0) return tpl.slice(i, j + 1); }
    j++;
  }
  return '';
}

const tela = semCom(corpoDe('minhaDaily7aHTML'));
const cartao = semCom(corpoDe('d7LinhaVisita'));
const acao = semCom(corpoDe('d7AcaoHTML'));
const ligar = semCom(corpoDe('d7Ligar'));

conferir('as quatro funções da tela existem',
  tela.length > 3000 && cartao.length > 800 && acao.length > 600 && ligar.length > 2000,
  'âncora perdida: sem corpo não há medição, e verde aqui seria falso');

/* ── 1 · A RAIZ TEM O GANCHO, E QUEM PROCURA USA O MESMO ─────────────────────────────
   Foi o defeito de hoje: casca nova sem a classe que a fiação procurava. A tela desenha
   bonita e nenhum clique funciona — e nada estoura. */
conferir('a raiz da tela carrega data-d7-raiz',
  /data-d7-raiz="1"/.test(tela),
  'sem gancho na raiz, renderDaily não acha o nó e a tela abre sem ouvinte nenhum');

conferir('e quem liga o ouvinte procura por esse gancho',
  /querySelector\('\[data-d7-raiz\]'\)/.test(codigo)
    && codigo.indexOf("querySelector('.d7')") < 0,
  'gancho de um lado e busca do outro é tela inteira sem fiação, sem erro no console');

/* ── 2 · NENHUM CLIQUE MORTO ─────────────────────────────────────────────────────────
   Todo verbo que a tela desenha tem de ter alvo no seletor delegado OU ramo próprio.
   Verbo desenhado sem ouvinte é botão com hover que não faz nada — e o build só olha o
   arquivo inteiro; aqui a conta é da Minha Daily. */
const desenhados = [...new Set([...(tela + cartao + acao + semCom(corpoDe('d7HorasHTML')))
  .matchAll(/data-(d7-[a-z-]+)=/g)].map(m => m[1]))]
  .filter(v => v !== 'd7-raiz' && v !== 'd7-municao');
const semOuvinte = desenhados.filter(function (v) {
  /* no seletor delegado, ou num closest próprio, ou num ramo por dataset */
  const camel = 'd7' + v.slice(3).replace(/-([a-z])/g, (m, c) => c.toUpperCase());
  return ligar.indexOf('[data-' + v + ']') < 0
    && ligar.indexOf('d.' + camel) < 0
    && codigo.indexOf('[data-' + v + ']') < 0;
});
conferir('todo verbo desenhado na Daily tem quem o escute',
  desenhados.length >= 15 && semOuvinte.length === 0,
  'sem ouvinte: ' + semOuvinte.join(', ') + ' — botão com hover que não faz nada é o que'
  + ' faz ele tocar duas vezes e desistir');

/* ── 3 · AS DUAS TELAS DELE FALAM A MESMA COISA ──────────────────────────────────────
   O cartão de uma visita é desenhado por UMA função e usado em dois lugares: a Minha
   Daily e o roteiro que o gestor lê. E o dia vem da mesma leitura do Planejamento. */
conferir('o cartão da visita é o mesmo na tela dele e na leitura do gestor',
  /d7LinhaVisita\(l\)/.test(tela)
    && /d7LinhaVisita\(l, true, linha\.planoDia \|\| null\)/.test(codigo),
  'duas linguagens de cartão para "uma visita do dia" fazem o gestor e o executivo'
  + ' descreverem a mesma manhã de dois jeitos na rodada');

conferir('e o dia vem da leitura compartilhada com o Planejamento',
  /pl6ItensDoDia\(coluna, porId\)/.test(semCom(corpoDe('d7PlanoDeHoje'))),
  'a Minha Daily lia o dia em ordem de POSIÇÃO e o kanban em ordem de HORA: a mesma manhã'
  + ' em duas ordens, nas duas telas de quem vai para a rua');

/* ── 4 · A IDENTIDADE É A DA PRANCHA DO PLANEJAMENTO ─────────────────────────────────
   Ele pediu a mesma identidade visual. Não é gosto: quem sai de uma tela e entra na outra
   não deve trocar de idioma no meio do dia. */
conferir('a casca é o painel da prancha (16px, sombra, linha #DCE1EA)',
  /border-radius:16px;box-shadow:0 12px 40px rgba\(43,52,64,\.12\)/.test(tela)
    && /border:1px solid #DCE1EA/.test(tela),
  'painel diferente do Planejamento é a mesma pessoa em dois produtos');

/* A ASPA VEM ESCAPADA no markup por concatenação (\'Archivo\'), diferente do template
   literal do Planejamento. A primeira versão desta checagem procurava a aspa nua e
   reprovou o arquivo correto — medir texto de código exige olhar como o código escreve,
   não como eu leria. */
conferir('o cabeçalho tem o kicker vermelho e a manchete Archivo 900 25px',
  /letter-spacing:\.14em;text-transform:uppercase;color:#E51A31/.test(tela)
    && /font:900 25px\/1\.25 \\?'Archivo\\?'/.test(tela),
  'o cabeçalho é a assinatura das duas telas — kicker, manchete e três números');

conferir('a faixa da promessa usa o fundo e o rótulo da prancha',
  /padding:13px 28px;background:#FBFAF6;border-bottom:1px solid #E7E3DA/.test(tela)
    && /letter-spacing:\.12em;text-transform:uppercase;color:#E51A31;">A sua promessa de hoje/.test(tela),
  'a faixa é onde as duas telas dizem "a sua palavra" — mesma forma, mesmo lugar');

conferir('e o cartão da visita tem trilho de 3px e pill de hora ink',
  /flex:none;width:3px;background:' \+ cor/.test(cartao)
    && /color:#FFFDF8;background:#2B3440;border-radius:999px/.test(cartao),
  'o trilho na cor da etapa e a pill escura da hora são o cartão do Planejamento');

/* ── 5 · A PROMESSA É DERIVADA, NUNCA DIGITADA ───────────────────────────────────────
   Lei 3 da prancha original desta tela, e a razão de ela existir: a Daily antiga tinha
   contadores com −/+ e ele digitava números que não correspondiam ao dia dele — e o
   gestor cobrava número digitado, não plano. */
conferir('os números da promessa saem do plano, e não de um campo',
  /const prom = d7PromessaDerivada\(rep, plano\);/.test(tela)
    && !/type="number"/.test(tela),
  'contador digitável faz o gestor cobrar número que ninguém cumpriu — e a promessa'
  + ' deixa de descrever o dia');

conferir('a volta de rua tem chip próprio, e só quando existe',
  /prom\.ruas \? \[\{ t: prom\.ruas \+ ' volta\(s\) de rua'/.test(tela),
  'rua não é visita (não tem cliente com nome) e não é prospecção nova (não tem conta):'
  + ' somar em qualquer um dos dois faz o gestor cobrar o número errado');

conferir('e a aposta só aparece quando há negociação no dia',
  /\(apostas\s*\n?\s*\?/.test(tela) && /D7_ETAPAS_DE_MESA\.indexOf/.test(tela),
  '"palavra dada" sem contrato na mesa é número inventado, e o gestor cobra número'
  + ' inventado na mesma moeda');

/* ── 6 · NENHUMA VISITA SEM DESFECHO ────────────────────────────────────────────────
   Os três desfechos não ficam escondidos atrás do check-in do Expogo: se o Expogo não for
   usado naquele dia, ele nunca registraria o que aconteceu. */
conferir('os três desfechos aparecem em visita que ainda não foi registrada',
  /const desfechos = \(soLeitura \|\| l\.estado === 'feita'\) \? ''/.test(cartao)
    && /data-d7-proposta/.test(cartao) && /data-d7-fechou/.test(cartao) && /data-d7-retorno/.test(cartao),
  'visita sem desfecho é o dia dele sem registro — e a regra desta tela é nenhuma visita'
  + ' sem desfecho');

conferir('e o gestor não ganha os atos do executivo',
  /soLeitura \? d7AcaoLeituraHTML\(lead, planoDia\) : d7AcaoHTML\(lead\)/.test(cartao)
    && /soLeitura \? ''\s*\n?\s*: '<button type="button" data-d7-tirar/.test(cartao),
  'o gestor lê a promessa; escrever na promessa de outra pessoa é tirar o dono dela');

/* ── 7 · SEM HORA INVENTADA ─────────────────────────────────────────────────────────── */
conferir('visita sem hora escolhida mostra "sem hora"',
  /esc\(l\.hora \|\| 'sem hora'\)/.test(cartao),
  'escrever um relógio ali inventa o horário que ele não deu — as três telas pararam de'
  + ' fazer isso hoje, e esta é a última');

/* ── 8 · O PISO DE TOQUE SEGUE A TELA ───────────────────────────────────────────────
   Terceira vez neste arquivo que uma lista de 44px envelheceu: ela cita ATRIBUTO agora,
   que é a mesma fiação do ouvinte. */
conferir('o piso de 44px cita os atributos que a tela emite',
  /\[data-d7-raiz\] \[data-d7-travar\]/.test(tpl)
    && /\[data-d7-raiz\] \[data-d7-acao-in\]/.test(tpl)
    && !/\.d7-b-prop,\.d7-b-fech/.test(tpl),
  'lista de toque cheia de seletor morto e vazia dos botões da tela nova — e é no dedo,'
  + ' na rua, que esta tela é usada');

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('minha daily: ' + ok + ' checagens ok — a tela tem fiação, fala a língua do'
  + ' Planejamento, e a promessa continua saindo do plano (' + desenhados.length
  + ' verbos conferidos).');
