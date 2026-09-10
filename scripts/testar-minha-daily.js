/* ══════════════════════════════════════════════════════════════════════════════════════
   A MINHA DAILY — A PRANCHA v2 (10/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "vamos repaginar a aba daily, lembrando que a gente ja tem todas as ligações
   possiveis, quero tudo perfeito" — com daily-final-v2-STANDALONE.html como fonte da
   verdade.

   ══ O QUE ESTA SUÍTE MEDIA ANTES, E POR QUE MUDOU ═══════════════════════════════════
   Ela media a casca de 09/09: `minhaDaily7aHTML` desenhava as 298 linhas de markup, o
   cartão da visita era `d7LinhaVisita` e o resto do dia era `d7CartaoSimples`. Com a
   prancha v2 a montagem passou a DELEGAR (contrato + markup, como o Planejamento) e os
   dois cartões viraram UM — d7CartaoDoDiaHTML, alimentado por d7CartaoDoItem, usado
   também pelo roteiro do gestor.

   Dezessete checagens desta suíte reprovaram na troca. Nenhuma delas estava errada: elas
   fixavam a forma antiga. O que era regra continua medido aqui, na forma nova; o que era
   forma saiu com a forma. Está tudo dito nas notas de cada bloco — suíte que muda sem
   dizer o que saiu é suíte que ninguém confia na próxima vez.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
/* sem os comentários: oito vezes neste projeto uma guarda minha leu a nota que documenta
   o conserto e reprovou o conserto */
const semCom = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
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

const dados = semCom(corpoDe('d7DadosFinal'));
const tela = semCom(corpoDe('d7TelaFinalHTML'));
const cartao = semCom(corpoDe('d7CartaoDoDiaHTML'));
const mapa = semCom(corpoDe('d7CartaoDoItem'));
const ligar = semCom(corpoDe('d7Ligar'));
const relogio = semCom(corpoDe('pfRelogioHTML'));
const painelFicha = semCom(corpoDe('pl6FichaPainelHTML'));

conferir('as funções da prancha existem com corpo',
  dados.length > 3000 && tela.length > 3000 && cartao.length > 800
    && mapa.length > 800 && ligar.length > 2000,
  'âncora perdida: sem corpo não há medição, e verde aqui seria falso');

/* ── 1 · A RAIZ TEM O GANCHO, E QUEM PROCURA USA O MESMO ─────────────────────────────
   Foi o defeito de 09/09: casca nova sem a classe que a fiação procurava. A tela desenha
   bonita e nenhum clique funciona — e nada estoura. */
conferir('a raiz da tela carrega data-d7-raiz',
  /data-d7-raiz="1"/.test(tela),
  'sem gancho na raiz, renderDaily não acha o nó e a tela abre sem ouvinte nenhum');

conferir('e quem liga o ouvinte procura por esse gancho',
  /querySelector\('\[data-d7-raiz\]'\)/.test(codigo)
    && codigo.indexOf("querySelector('.d7')") < 0,
  'gancho de um lado e busca do outro é tela inteira sem fiação, sem erro no console');

/* ── 2 · O CONTRATO É FECHADO, NOS DOIS SENTIDOS ─────────────────────────────────────
   Todo `d.X` que o markup lê tem de ser chave devolvida por d7DadosFinal, e toda chave
   devolvida tem de ser lida. Foi assim que a Daily do GESTOR amanheceu em branco em
   09/09: um nome calculado numa função e lido no markup de outra.

   O MARKUP É A TELA MAIS O QUE ELA DELEGA: o relógio (pfRelogioHTML) e a ficha
   (pl6FichaPainelHTML) recebem o mesmo `d` e leem 11 dos nomes. Medir só o corpo da tela
   acusaria os 11 — foi o que aconteceu na suíte do Planejamento hoje. */
const markup = tela + relogio + painelFicha;
const lidos = [...new Set([...markup.matchAll(/\bd\.([A-Za-z][A-Za-z0-9_]*)/g)].map(m => m[1]))];
const iRet = dados.lastIndexOf('\n  return {');
const entregues = new Set([...dados.slice(iRet > -1 ? iRet : 0)
  .matchAll(/^\s{4}([A-Za-z][A-Za-z0-9_]*):/gm)].map(m => m[1]));
const semEntrega = lidos.filter(n => !entregues.has(n));
const semLeitura = [...entregues].filter(n => lidos.indexOf(n) < 0);

conferir('todo nome que o markup lê é entregue pelo contrato',
  lidos.length > 15 && semEntrega.length === 0,
  'o markup lê ' + semEntrega.join(', ') + ' e o contrato não entrega — ReferenceError'
  + ' leva a aba para "Carregando..." sem dizer por quê');

conferir('e todo nome entregue é lido pelo markup',
  entregues.size > 15 && semLeitura.length === 0,
  'o contrato entrega ' + semLeitura.join(', ') + ' e ninguém lê — contrato aberto é o'
  + ' começo de dois desenhos discordando de qual dado existe');

/* ── 3 · NENHUM CLIQUE MORTO ─────────────────────────────────────────────────────────
   Todo verbo que a tela desenha tem de estar na cadeia do closest — a fiação desta tela.
   Presença do atributo em outro lugar do arquivo NÃO conta: em 09/09 uma sabotagem tirou
   um alvo da cadeia e esta suíte deu verde, porque o atributo ainda aparecia no CSS do
   piso de toque. */
const desenhados = [...new Set([...(tela + cartao + relogio + painelFicha
  + semCom(corpoDe('d7AcaoHTML')))
  .matchAll(/data-(d7-[a-z-]+)=/g)].map(m => m[1]))]
  .filter(v => v !== 'd7-raiz' && v !== 'd7-municao' && v !== 'd7-so-icone'
    && v !== 'd7-dia-drop' && v !== 'd7-arraste');
const iCadeia = ligar.indexOf('ev.target.closest(');
const cadeia = iCadeia < 0 ? '' : ligar.slice(iCadeia, ligar.indexOf(');', iCadeia));
conferir('a cadeia do closest foi encontrada',
  cadeia.length > 300,
  'sem a cadeia esta checagem não mede nada, e o verde seria falso');

/* os dois campos de texto não são clicados, são digitados — exceção NOMEADA */
const DIGITADOS = ['d7-acao-in'];
const semOuvinte = desenhados.filter(function (v) {
  if (DIGITADOS.indexOf(v) > -1) return ligar.indexOf('[data-' + v + '="') < 0;
  return cadeia.indexOf('[data-' + v + ']') < 0;
});
conferir('todo verbo desenhado na Daily está na cadeia do ouvinte',
  desenhados.length >= 12 && semOuvinte.length === 0,
  'sem ouvinte: ' + semOuvinte.join(', ') + ' — botão com hover que não faz nada é o que'
  + ' faz ele tocar duas vezes e desistir');

/* ── 4 · A IDENTIDADE É A DA PRANCHA v2 ──────────────────────────────────────────────
   Medido no daily-final-v2-STANDALONE: painel de 16px com a sombra, kicker vermelho,
   manchete Archivo 900 25px, faixa da promessa em #FBFAF6, e a grade de duas colunas com
   a munição em 330px. */
conferir('a casca é o painel da prancha',
  /* os dois pedaços vêm em linhas concatenadas diferentes do markup — medir texto de
     código exige olhar como o código escreve, não como eu leria */
  /border:1px solid #DCE1EA;border-radius:16px;/.test(tela)
    && /box-shadow:0 12px 40px rgba\(43,52,64,\.12\)/.test(tela),
  'painel diferente da prancha é a mesma pessoa em dois produtos');

conferir('o cabeçalho tem o kicker vermelho e a manchete Archivo 900 25px',
  /letter-spacing:\.14em;'\s*\n?\s*\+\s*'text-transform:uppercase;color:#E51A31/.test(tela)
    && /font:900 25px\/1\.25 \\?'Archivo\\?'/.test(tela),
  'o cabeçalho é a assinatura das duas telas — kicker, manchete e três números');

conferir('a faixa da promessa usa o fundo e o rótulo da prancha',
  /background:#FBFAF6;border-bottom:1px solid #E7E3DA/.test(tela)
    && />A promessa de hoje</.test(tela),
  'a faixa é onde as duas telas dizem "a sua palavra" — mesma forma, mesmo lugar');

conferir('a munição é a coluna de 330px da prancha',
  /grid-template-columns:minmax\(0,1fr\) 330px/.test(tela)
    && /border-left:1px solid #E7E3DA;background:#FBFAF6/.test(tela),
  'a prancha desenha o dia e a munição lado a lado, e a largura é dela');

/* O CARTÃO GANHOU TRILHO DE 4px NA v2 (era 3px na casca de 09/09) e o nome subiu para
   14px. É medição da prancha, não gosto. */
conferir('o cartão do dia tem trilho de 4px e pill de hora ink',
  /flex:none;width:4px;background:' \+ v\.trilho/.test(cartao)
    && /color:#FFFDF8;background:' \+ v\.horaBg/.test(cartao)
    && /font:800 14px \\?'Manrope\\?'/.test(cartao),
  'o trilho na cor da etapa e a pill escura da hora são o cartão da prancha');

/* ── 5 · A PROMESSA É DERIVADA, E A TRAVA CONTINUA AQUI ──────────────────────────────
   A prancha v2 NÃO desenha a trava; ela fica porque o ramo dela é o que grava
   planos_diarios (plano_fechado + os quatro prometido_*), que é a linha que o GESTOR lê.
   Há uma guarda no build sobre isso; esta diz por quê. */
conferir('os números da promessa saem do plano, e não de um campo',
  /const prom = d7PromessaDerivada\(rep, plano\);/.test(dados)
    && !/type="number"/.test(tela),
  'contador digitável faz o gestor cobrar número que ninguém cumpriu');

conferir('a trava da promessa continua na tela, apesar de a prancha não a desenhar',
  /data-d7-travar="1"/.test(tela) && /travaRot/.test(dados),
  'sem a trava o executivo não fecha o plano e a Daily do gestor passa a dizer'
  + ' "sem cliente nomeado" para o time todo, todos os dias');

conferir('e o ritmo é medido contra a hora de Brasília, não contra um número fixo',
  /agendaAgora\(\)/.test(dados) && /17 - horaAgora/.test(dados),
  'ritmo cravado num número não é ritmo: às 9h e às 16h a mesma conta significa coisas'
  + ' diferentes, e new Date() cru erra o dia das 21h à meia-noite');

/* ── 6 · A RÉGUA "COMO FOI?" — CINCO ATOS LITERAIS ──────────────────────────────── */
conferir('a régua tem os cinco atos da prancha',
  />como foi\?</.test(cartao)
    && /data-d7-proposta="/.test(cartao) && /data-d7-fechou="/.test(cartao)
    && /data-d7-retorno="/.test(cartao) && /data-d7-nao-rolou="/.test(cartao)
    && /data-d7-tirar="/.test(cartao),
  'sem "não rolou" a perda não tem onde ser registrada e a visita fica pendente para'
  + ' sempre; sem "remarcar" ela não tem como voltar ao Planejamento');

conferir('e os cinco são escritos um por um, não a partir de uma lista',
  (cartao.match(/data-d7-(?:proposta|fechou|retorno|nao-rolou|tirar)="/g) || []).length >= 5
    && cartao.indexOf("'data-d7-' +") < 0,
  'atributo montado a partir do dado cega a guarda de clique morto — aconteceu em 09/09');

conferir('o selo ✓✓ FECHOU é derivado da etapa Ag. Pagamento',
  /String\(lead\.stageId\) === '1395880473'/.test(mapa) && /'✓✓ FECHOU'/.test(mapa),
  'selo guardado na tela sobrevive a um F5 dizendo o contrário do HubSpot');

/* ── 7 · O DIA MOSTRA TUDO QUE OCUPA HORA ────────────────────────────────────────────
   A prancha tem cinco visitas de dado inventado. A grade real também tem prospecção de
   rua, bloqueio e conta que saiu da base: desenhar só visita faria o dia parecer mais
   vazio do que é, e deixaria o "tirar do dia" sem casa nos outros três. */
conferir('o dia desenha todo item que ocupa hora, e não só visita',
  /const ocupados = plano\.filter\(x => x\.tipo !== 'livre'\);/.test(dados)
    && /ehVisita/.test(mapa),
  'hora reservada que a tela não mostra é dia que parece vazio — e o gestor cobra um'
  + ' buraco que não existe');

/* ══ A FAIXA DA POSIÇÃO NÃO É RELÓGIO, NEM NO TOAST ══════════════════════════════════
   Testado em produção: tirei o bloco de relacionamento das 16:30 e a barra disse "10:30
   liberada" — 10:30 é a faixa do slot 1, e 16:30 é a hora que o executivo escolheu. É a
   mesma armadilha que morreu em cinco lugares em 09/09; sobreviveu no ramo genérico do ✕,
   que só passou a ser alcançado quando o bloco de relacionamento nasceu.
   O QUE A GUARDA MEDE: o ramo do ✕ fala da hora ESCOLHIDA (pl6SlotHora), e o que ele
   liberou tem nome — "a vaga liberada" não diz o que saiu do dia. */
conferir('o toast do ✕ cita a hora escolhida, e não a faixa da posição',
  ligar.indexOf('const quando = pl6SlotHora(era, si);') > -1
    && ligar.indexOf("(pl6HoraDaFaixa(si) || 'a vaga') + ' liberada no plano de hoje") < 0
    && /pl6SlotRel\(era\) \? 'a visita de relacionamento'/.test(ligar),
  'a posição virando relógio faz a tela confirmar uma hora que ele nunca deu — e ele'
  + ' confere no CRM uma hora que não existe');

conferir('visita sem hora escolhida mostra "sem hora"',
  /l\.hora \|\| 'sem hora'/.test(mapa),
  'escrever um relógio ali inventa o horário que ele não deu');

/* ── 8 · O RELÓGIO E A FICHA SÃO OS DO PLANEJAMENTO ──────────────────────────────────
   Regra 5 da prancha ("mesmo relógio bonito do Planejamento") e o mapa de interações
   ("clique no corpo do card = FICHA do lead (mesma ficha)"). */
conferir('o relógio é o compartilhado, na variante do dia',
  /pfRelogioHTML\(d, 'data-d7-relogio', 'encaixar', 'dia'\)/.test(tela)
    && !/input[^>]*type="time"/.test(tela),
  'dois relógios são duas réguas de hora, e input[type=time] nativo é o que a prancha'
  + ' proíbe em letra maiúscula');

/* O VERBO DO RELÓGIO NÃO APARECE LITERAL NO MARKUP: pfRelogioHTML monta o atributo a
   partir do parâmetro (`attr + '="'`), porque o painel serve as duas telas. Então ele é
   INVISÍVEL para a varredura de clique morto acima — provado por sabotagem: tirei
   `[data-d7-relogio]` da cadeia e esta suíte deu verde. Aqui ele é cobrado por nome. */
conferir('e o verbo do relógio está na cadeia do ouvinte',
  cadeia.indexOf('[data-d7-relogio]') > -1 && /if \(d\.d7Relogio\)/.test(ligar),
  'o relógio desenha 17 botões e nenhum deles seria escutado — e a varredura por atributo'
  + ' literal não vê isto, porque o atributo é montado dentro do painel compartilhado');

/* E A TELA NÃO DESENHA FICHA PRÓPRIA: o painel de 360px é do compartilhado, então esse
   número não pode aparecer no markup da Daily. Provado por sabotagem: eu montei uma ficha
   local ao lado da chamada e a checagem de baixo (que só procura a chamada) deu verde. */
conferir('a tela não monta ficha própria',
  tela.indexOf('width:360px') < 0
    /* PINA A FORMA DO TERNÁRIO, e não a presença da chamada: a sabotagem montou uma
       ficha local e deixou a chamada compartilhada dentro de um `(0 ? …)`, e a checagem
       que só procurava o nome da função deu verde. */
    && /temFicha\s*\n?\s*\? pl6FichaPainelHTML\(d, fichaCamposHTML/.test(tela),
  'duas fichas são dois lugares dizendo o telefone e o endereço da mesma conta — e foi'
  + ' isso que fez a linha da fonte contradizer a ficha em 09/09');

conferir('e a ficha é o painel compartilhado, com a fiação desta tela',
  /pl6FichaPainelHTML\(d, fichaCamposHTML, fichaEtapasHTML,/.test(tela)
    && /'data-d7-fi-fechar', 'data-d7-fi-etapa', 'data-d7-fi-agendar'/.test(tela),
  'duas fichas são dois lugares dizendo o telefone da mesma conta');

conferir('e mover etapa pela ficha é a mesma regra das duas telas',
  /pl6MoverPelaFicha\(rep, idFi, destinoFi, async function/.test(ligar)
    && /async function pl6MoverPelaFicha\(rep, idFi, destino, fechar\)/.test(codigo),
  'dois lugares decidindo como um negócio muda de etapa é o começo de duas regras de'
  + ' pipeline');

/* ── 9 · O BLOCO DE RELACIONAMENTO EXISTE DE PONTA A PONTA ───────────────────────────
   A prancha pede dois blocos tracejados. Desenhar o segundo sem ele existir na grade
   seria botão morto; e sem o leitor do GESTOR reconhecê-lo, o gestor veria buraco onde o
   executivo reservou uma hora. */
/* PINA O `if`, E NÃO A EXPRESSÃO DENTRO DELE. Provado por sabotagem: trocar
   `if (d.d7Rel)` por `if (false)` deixava o corpo intacto — e a checagem que só procurava
   `d7UI.horas === PL6_REL` dava verde sobre um botão morto. Terceira vez que eu escrevo
   uma guarda assim nesta casa. */
conferir('o bloco de relacionamento é desenhado e escutado',
  /data-d7-rel="1"/.test(tela) && cadeia.indexOf('[data-d7-rel]') > -1
    && /if \(d\.d7Rel\) \{/.test(ligar)
    && /d7UI\.horas === PL6_REL/.test(ligar),
  'botão de bloco sem ouvinte é clique morto na munição');

conferir('e ele existe na grade, no leitor do dia e no leitor do gestor',
  /const PL6_REL = '__rel';/.test(codigo)
    && /function pl6SlotRel\(v\)/.test(codigo)
    && /pl6SlotRel\(v\)\) \{ itens\.push\(\{ si: si, hora: hora, tipo: 'rel' \}\)/.test(codigo)
    && /origem: 'rel'/.test(codigo),
  'hora reservada que uma das telas não reconhece é buraco na leitura do gestor');

conferir('e o sentinela dele não é tratado como lead',
  /id === PL6_BLOQUEADO \|\| id === PL6_RUA \|\| id === PL6_REL\) return null;/.test(codigo),
  'sentinela virando id de lead faz porId.get() falhar e o slot virar "conta fora da'
  + ' carga desta sessão"');

/* ── 10 · LIGAR AGORA SÓ COM NÚMERO ─────────────────────────────────────────────── */
conferir('ligar agora ▸ só aparece com telefone, e cai para datar tarefa sem ele',
  /q\.tel\s*\n?\s*\? '<a href="tel:'/.test(tela)
    && />ligar agora ▸<\/a>/.test(tela)
    /* o `>` do fallback fica na linha anterior da concatenação */
    && /'dato tarefa ▸<\/button>'/.test(tela),
  'botão de ligar em quente sem número é clique que não liga para ninguém, na rua');

/* ── 11 · OS DOIS RODAPÉS ───────────────────────────────────────────────────────── */
conferir('o rodapé diz o que o registro faz, e o de baixo de onde vem cada número',
  /tudo que você registra aqui grava/.test(tela)
    && /remarcar manda de volta pro Planejamento/.test(tela)
    && /Supabase planos_semanais/.test(tela),
  '"remarcar" sem explicação lê como "perdi a visita"; e número sem procedência é número'
  + ' que ninguém confere');

/* ── 12 · O PISO DE TOQUE SEGUE A TELA ──────────────────────────────────────────────
   Quarta vez que esta lista envelhece. Ela cita ATRIBUTO, que é a mesma fiação do
   ouvinte — os dois envelhecem juntos. */
/* ══ O PAINEL NÃO SE ANINHA DENTRO DE SI ═════════════════════════════════════════════
   MEDIDO EM PRODUÇÃO, logado como executivo: depois da primeira ação havia DOIS painéis
   aninhados — 949px por fora e 947px por dentro, cada um com border 0.8px e o mesmo
   box-shadow. `box` é a raiz e a montagem devolve um painel que também carrega a raiz,
   então `box.innerHTML = montagem()` desenhava moldura dentro de moldura.
   Não acumulava, e a primeira pintura era correta: a moldura só dobrava depois do
   primeiro clique. Nenhuma suíte e nenhuma medição de altura pega isso. */
conferir('o redesenho põe o CONTEÚDO do painel, e não o painel dentro de si',
  ligar.indexOf('box.innerHTML = painel ? painel.innerHTML : molde.innerHTML;') > -1
    && ligar.indexOf('box.innerHTML = minhaDaily7aHTML(rep);') < 0,
  'painel dentro de painel dobra a borda, o raio e a sombra — e a primeira pintura é'
  + ' correta, então isso só aparece depois de um clique');

/* ══ E A GRADE EMPILHA NO TELEFONE ═══════════════════════════════════════════════════
   A prancha é de 1460px e reserva 330px FIXOS para a munição. A 375px sobra ~20px para a
   coluna do dia: medi o botão "+ o que você vai fazer aí?" em 22px de caixa com 35px de
   texto. A página não transborda e nenhuma medição de ALTURA acha isto — a tela só fica
   ilegível, no aparelho em que ela mais é usada. */
conferir('a grade empilha no celular, em vez de esmagar a coluna do dia',
  /\[data-d7-raiz\] > div\[style\*="grid-template-columns:minmax\(0,1fr\) 330px"\]\{\s*\n?\s*display:block !important;/.test(tpl),
  '330px fixos numa tela de 375 deixam ~20px para o dia — o cartão fica ilegível sem a'
  + ' página acusar nada');

/* E O `cancelar` DA BARRA NÃO É ÍCONE: a regra de largura cita o só-ícone, e não o ato.
   O mesmo defeito apareceu hoje cedo no `remarcar ▸`, na outra ponta desta lista. */
conferir('a regra de largura de 44px cita o só-ícone, e não o ato',
  /\[data-d7-raiz\] \[data-d7-so-icone\]\{width:44px;\}/.test(tpl)
    && tpl.indexOf('[data-d7-raiz] [data-d7-fechar-card]{width:44px;}') < 0,
  'quem carrega data-d7-fechar-card tem rótulo ("cancelar") e a regra o esmagava em 44px');

conferir('o piso de 44px cita os atributos que a tela nova emite',
  /\[data-d7-raiz\] \[data-d7-relogio\]/.test(tpl)
    && /\[data-d7-raiz\] \[data-d7-rel\]/.test(tpl)
    && /\[data-d7-raiz\] \[data-d7-ficha\]/.test(tpl),
  'lista de toque vazia dos botões da tela nova — e é no dedo, na rua, que esta tela é'
  + ' usada');


/* ══════════════════════════════════════════════════════════════════════════════════════
   O SLOT LIVRE (10/09/26, itens 28 a 31 e leis 1, 1b e 1c do contrato)
   ══════════════════════════════════════════════════════════════════════════════════════
   POR QUE ESTAS GUARDAS EXISTEM: a troca de 10/09 pela prancha v2 DESLIGOU o slot livre
   sem que nada reprovasse. `d7PlanoDeHoje` continuou calculando as vagas livres e
   `d7TelaFinalHTML` passou a mapear so `ocupados` — e o resultado foi que `data-d7-abrir`
   e `data-d7-por` ficaram citados em dois lugares do arquivo (o piso de toque e a cadeia
   do closest) e emitidos em NENHUM. A guarda de clique morto nao pega isso: ela pergunta
   'todo atributo desenhado tem ouvinte?', e a resposta era sim — zero atributos
   desenhados, zero sem ouvinte. A pergunta que faltava e a INVERSA: todo ouvinte desta
   tela tem quem o emita? */
(function () {
  /* ── 1 · O CARTAO DO SLOT E DESENHADO, E NAO SO ESCUTADO ────────────────────────── */
  conferir('o slot livre e desenhado no markup, nao so escutado',
    tela.indexOf('data-d7-abrir="') > -1 && dados.indexOf('slot: livres.length') > -1,
    'a tela calculava as vagas livres e nao desenhava nenhuma: a oferta de encaixe'
    + ' desapareceu da Daily e o atributo virou ouvinte sem emissor');

  /* A PERGUNTA INVERSA DA GUARDA DE CLIQUE MORTO: ouvinte sem emissor. Ela nao acusa
     codigo morto em geral — acusa os verbos que ESTA tela promete e nao entrega. */
  const semEmissor = ['abrir', 'm-abrir', 'q-agendar', 'rua', 'rel', 'relogio', 'ficha']
    .filter(function (v) {
      return cadeia.indexOf('data-d7-' + v + ']') > -1
        && (tela + cartao + relogio + painelFicha).indexOf('data-d7-' + v) === -1;
    });
  conferir('nenhum verbo da cadeia ficou sem quem o emita',
    semEmissor.length === 0,
    'ouvinte sem emissor e funcionalidade que sumiu da tela em silencio: ' + semEmissor.join(', '));

  /* ── 2 · A HORA E SEMPRE DO EXECUTIVO (lei 1c) ───────────────────────────────────── */
  conferir('o slot nasce sem hora — o pill diz "— : —"',
    tela.indexOf('— : —') > -1,
    'hora impressa no slot e o sistema propondo horario, e a lei 1c diz que ele nunca impoe');
  conferir('o quente passa pelo relogio em vez de agendar na primeira vaga',
    ligar.indexOf('d7QAgendar') > -1
      && !/d7QAgendar[\s\S]{0,700}?pl6AgendarNoSlot/.test(ligar),
    'o "encaixar hoje" agendava na primeira vaga vazia sem perguntar: o sistema escolhia'
    + ' o horario do dia dele, contra o item 35 e a lei 1c');

  /* ── 3 · O FOCO SOBREVIVE ATE A CONFIRMACAO ──────────────────────────────────────── */
  conferir('escolher um lead nao apaga o slot em foco',
    !/d7MAbrir\)\s*\{[\s\S]{0,220}?d7UI\.slot = null/.test(ligar),
    'apagar o foco ao escolher o lead faz o relogio abrir sem saber que e um slot sendo'
    + ' preenchido — a frase da barra e o toast saem os de um encaixe comum');
  conferir('e o cancelar da barra cancela o relogio E o foco',
    /* `[^}]` E NAO `[\s\S]`: com o coringa largo a sabotagem passou verde — tirando a
       linha de dentro do ramo, a regex atravessava a chave de fechamento e casava com o
       `d7UI.horas = null` do ramo SEGUINTE (o do filtro da municao). Guarda que atravessa
       o fim do bloco mede outro bloco. */
    /d7FecharCard\)\s*\{[^}]{0,220}?d7UI\.horas = null/.test(ligar),
    'limpando so o slot, o cancelar nao fazia NADA com o relogio aberto — clique morto'
    + ' num botao cuja unica funcao e sair');

  /* ── 4 · O SLOT NAO CONTA NO PLACAR ENQUANTO ESTA VAZIO (lei 1b) ─────────────────── */
  conferir('o placar conta so o que esta ocupado',
    dados.indexOf("const ocupados = plano.filter(x => x.tipo !== 'livre');") > -1
      && dados.indexOf("const visitasReais = ocupados.filter(x => x.tipo === 'visita');") > -1,
    'vaga livre contada como visita infla o X/N e a promessa que o gestor cobra');

  /* ── 5 · O VERBO DA MUNICAO DIZ PARA ONDE O LEAD VAI (item 29) ───────────────────── */
  conferir('com o slot em foco, os botoes da municao dizem que ocupam o slot',
    /* PINADO NA LINHA `acao:` DA MUNICAO, e nao na frase solta: ela aparece TAMBEM no
       rotulo do quente, e por isso a sabotagem que a tirou so da municao passou verde. */
    /acao: sel \? 'escolha a hora ▸' : \(emFoco \? 'colocar no slot livre ▸'/.test(dados)
      && dados.indexOf('const emFoco =') > -1,
    'sem trocar o verbo, o foco do slot e um estado invisivel: ele clica em "encaixar no'
    + ' dia" sem saber que esta preenchendo o slot');

  /* ── 6 · O TOAST DO SLOT EXISTE DE VERDADE ───────────────────────────────────────────
     Eu passei `selo` nos ganchos de pl6AgendarNoSlot e escrevi no comentario que o toast
     diria "ocupou o slot livre" — e a funcao nao lia essa chave. Opcao que ninguem le e
     comentario que mente, e o verde seria identico ao legitimo. */
  const agendar = semCom(corpoDe('pl6AgendarNoSlot'));
  conferir('o selo do slot chega ao toast de quem gravou',
    ligar.indexOf("selo: eraSlot ? 'ocupou o slot livre' : ''") > -1
      /* EXIGE QUE ELE LEIA `gk.selo`: pedir só "const selo =" aceitava
         `const selo = '';`, que é exatamente a forma de o gancho continuar sendo
         ignorado — a sabotagem passou verde com essa versão. */
      && agendar.indexOf("const selo = String(gk.selo || '').trim();") > -1
      && /mutar\(\{ grade: g \}[\s\S]{0,220}?selo \?/.test(agendar),
    'gancho passado e nunca lido: o toast sairia o comum e o comentario estaria mentindo');
}());

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('minha daily v2: ' + ok + ' checagens ok — contrato fechado, fiação na cadeia,'
  + ' cartão e relógio e ficha compartilhados com o Planejamento (' + desenhados.length
  + ' verbos conferidos).');
