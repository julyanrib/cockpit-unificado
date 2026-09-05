#!/usr/bin/env node
/* ============================================================================
   O KANBAN E O PIPELINE OFICIAL — a guarda das listas de etapa (01/09/26)
   ----------------------------------------------------------------------------
   Pedido do Julyan: "esse kanban representa as mudanças de etapa do pipe oficial...
   quero ele perfeito, clivável e arrastável... criar a etapa perdido, mas sem puxar
   retroativo... eu nao quero que puxe nada, que continue no hubspot, só vai pra perdido
   a partir de hoje".

   O QUE ESTE ARQUIVO PROTEGE. Mover um negócio de etapa envolve QUATRO listas em três
   arquivos, e elas têm que concordar:
     lib/acoes-negocio/mudar-etapa-negocio.js — ETAPAS_ABERTAS (a escada) e ETAPAS_DESTINO
       (a porteira). É a fronteira de escrita: o que não está aqui não grava, e o navegador
       não tem como contornar;
     template/cockpit.template.html — ORDEM_ETAPAS_FUNIL (a escada do navegador),
       ETAPAS_DESTINO_FUNIL (o menu), FN2_ETAPAS (as colunas do kanban) e fn2PodeMover
       (a legalidade do arrasto);
     scripts/fetch-hubspot.js — o corte de Perdido.
   Quando divergem, o defeito é sempre da mesma família: a tela oferece um destino que o
   servidor recusa (clique morto com formulário em cima), ou esconde um destino que o
   servidor aceita — foi exatamente isso que aconteceu com Reciclagem entre 17/08 e hoje,
   oferecida apagada com a frase falsa "conclua a etapa anterior".

   NÃO testa a UI: testa que as listas batem e que as regras estão escritas nos dois lados.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const servidor = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'), 'utf8');
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const robo = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8');
const montar = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');
const semanal = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-weekly-comparison.js'), 'utf8');
/* As checagens de AUSÊNCIA precisam olhar código, não comentário: o comentário que
   explica um defeito cita a forma errada, e a checagem ingênua acusa a explicação. */
const semanalCodigo = semanal.split(String.fromCharCode(10))
  .filter(l => l.trim().indexOf('//') !== 0 && l.trim().indexOf('*') !== 0)
  .join(String.fromCharCode(10));

let ok = 0;
const falhas = [];
const checar = (nome, condicao, detalhe) => {
  if (condicao) { ok++; return; }
  falhas.push(nome + (detalhe ? ' — ' + detalhe : ''));
};

/* Lê um array literal de ids de etapa de um arquivo, pelo nome da constante. */
function lerLista(fonte, nome) {
  const re = new RegExp('const\\s+' + nome + '\\s*=\\s*\\[([^\\]]*)\\]');
  const m = fonte.match(re);
  if (!m) return null;
  return m[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

const PERDIDO = '1396006164';
const RECICLAGEM = '1398311191';
const PAGAMENTO = '1395880473';
const GANHO = '1396006162';

/* ── 1. a escada é a mesma nos dois lados ─────────────────────────────────────────── */
const escadaServidor = lerLista(servidor, 'ETAPAS_ABERTAS');
const escadaTela = lerLista(template, 'ORDEM_ETAPAS_FUNIL');
checar('servidor declara ETAPAS_ABERTAS', Array.isArray(escadaServidor) && escadaServidor.length > 0);
checar('template declara ORDEM_ETAPAS_FUNIL', Array.isArray(escadaTela) && escadaTela.length > 0);
if (escadaServidor && escadaTela) {
  checar('a escada do servidor e a da tela são idênticas, na mesma ordem',
    escadaServidor.join('|') === escadaTela.join('|'),
    'servidor=[' + escadaServidor.join(',') + '] tela=[' + escadaTela.join(',') + ']');
  checar('Perdido NÃO está na escada (senão viraria degrau e bloquearia como pulo de fase)',
    escadaServidor.indexOf(PERDIDO) < 0 && escadaTela.indexOf(PERDIDO) < 0);
  checar('Ganho continua fora da escada (quem move para lá é o ASAAS, não uma pessoa)',
    escadaServidor.indexOf(GANHO) < 0);
}

/* ── 2. a porteira aceita Perdido, dos dois lados ─────────────────────────────────── */
const porteiraServidor = servidor.match(/const\s+ETAPAS_DESTINO\s*=\s*ETAPAS_ABERTAS\.concat\(\[\s*ETAPA_PERDIDO\s*\]\)/);
checar('servidor: ETAPAS_DESTINO = escada + Perdido', !!porteiraServidor);
checar('servidor: a validação de destino usa ETAPAS_DESTINO, não ETAPAS_ABERTAS',
  /if \(!ETAPAS_DESTINO\.includes\(String\(novaEtapa\)\)\)/.test(servidor));
checar('servidor: ETAPA_PERDIDO é o id real do pipeline Field Sales',
  new RegExp("const ETAPA_PERDIDO = '" + PERDIDO + "'").test(servidor));
checar('template: ETAPAS_DESTINO_FUNIL = escada + Perdido',
  /const ETAPAS_DESTINO_FUNIL = ORDEM_ETAPAS_FUNIL\.concat\(\['1396006164'\]\)/.test(template));
checar('template: o menu de destinos itera ETAPAS_DESTINO_FUNIL (e não a escada)',
  /\$\{ETAPAS_DESTINO_FUNIL\.map\(sid => \{/.test(template));

/* ── 3. o motivo é obrigatório para entrar em Perdido, dos dois lados ─────────────── */
/* PERTENCIMENTO, e nao posicao. A versao anterior exigia que motivo_do_perdido fosse
   o ULTIMO item da allowlist, e reprovou quando observacao__desqualificado entrou
   (o conserto do defeito da Kelly em 04/09). Teste que depende da ordem de uma lista
   quebra em toda insercao legitima e ensina a contorna-lo. */
checar('servidor: motivo_do_perdido está na allowlist de propriedades',
  /PROPS_PERMITIDAS = \[[\s\S]*?'motivo_do_perdido'[\s\S]*?\];/.test(servidor));
checar('servidor: observacao__desqualificado está na allowlist (o defeito da Kelly)',
  /PROPS_PERMITIDAS = \[[\s\S]*?'observacao__desqualificado'[\s\S]*?\];/.test(servidor),
  'sem ela o executivo preenche o motivo, clica em Perdido e leva "Propriedade não permitida"');
checar('servidor: Perdido exige motivo_do_perdido',
  new RegExp("'" + PERDIDO + "': \\['motivo_do_perdido'\\]").test(servidor));
checar('servidor: o motivo tem lista fechada de valores',
  /motivo_do_perdido: \['Preço', 'Funcionalidade', 'Sem retorno', 'Reembolso', 'Não quer mudar de sistema', 'Outros'\]/.test(servidor));
checar('template: o campo do motivo é obrigatório na etapa Perdido',
  new RegExp("'" + PERDIDO + "': \\[[\\s\\S]{0,240}?motivo_do_perdido[\\s\\S]{0,160}?obrigatorio: true").test(template));
/* PROPS_GRAVAVEIS SAIU EM 04/09/26 e esta assercao com ela: a lista era morta (uma
   declaracao, zero usos) e a mensagem deste teste era falsa — nada era recusado por
   ela. Quem recusa e o servidor, e a guarda 19 do check-scripts compara a allowlist
   dele com tudo o que CAMPOS_POR_ETAPA coleta, que e a checagem que pega o defeito
   de verdade. */

/* ══ A REGRA MUDOU EM 03/09/26: SUBCONJUNTO, NAO IGUALDADE ═══════════════════════════
   Ate 02/09 as duas listas tinham que ser identicas, e estava certo: as duas espelhavam
   a propriedade real do HubSpot.

   Em 03/09 o Julyan decidiu APOSENTAR "Sem retorno" do motivo de perda. Medido nos 981
   perdidos dos ultimos 90 dias: "Outros" 410 (42%) e "Sem retorno" 293 (30%) — 72% dos
   motivos nao sao decisao do cliente. "Sem retorno" nao e uma decisao contra nos, e a
   AUSENCIA de decisao, e pertence a `motivo_saida_cadencia`.

   O SERVIDOR CONTINUA ACEITANDO OS SEIS, e isso e deliberado. A lista dele e whitelist de
   VALIDACAO: tirar um valor de la faz o HubSpot recusar qualquer escrita com ele — e o
   Cockpit nao e o unico escritor. O PWA move negocio de etapa pela mesma porta
   (mudar-etapa-negocio.js), e nao da para garantir daqui que ele nunca manda "Sem
   retorno". Aposentar opcao quebrando o outro escritor seria trocar um problema de
   relatorio por um problema de campo.

   Entao a regra passa a ser: a tela e SUBCONJUNTO do servidor. O servidor tolera o que
   existe (historico e outros escritores), a tela nao oferece o que aposentamos. E os 293
   negocios que ja tem "Sem retorno" gravado continuam intactos.

   O QUE ESTA GUARDA AINDA IMPEDE, que e o risco de verdade: a tela oferecer um valor que
   o servidor recusa. Esse e o defeito que trava a passagem de etapa na cara do executivo,
   e ele continua reprovando o build. */
const opTela = lerLista(template, 'OP_MOTIVO_PERDA');
const opServidorM = servidor.match(/motivo_do_perdido: \[([^\]]*)\]/);
const opServidor = opServidorM ? opServidorM[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')) : null;
checar('template declara OP_MOTIVO_PERDA com as 5 que ficam',
  Array.isArray(opTela) && opTela.length === 5,
  opTela ? 'tela=[' + opTela.join(',') + ']' : 'nao achei a lista');
if (opTela && opServidor) {
  checar('toda opção da tela é aceita pelo servidor (subconjunto)',
    opTela.every(o => opServidor.indexOf(o) >= 0),
    'tela=[' + opTela.join(',') + '] servidor=[' + opServidor.join(',') + ']');
  checar('"Sem retorno" saiu da tela e ficou no servidor',
    opTela.indexOf('Sem retorno') < 0 && opServidor.indexOf('Sem retorno') >= 0,
    'a tela não pode mais oferecer, e o servidor não pode recusar o que já foi gravado');
}
checar('a observação da perda é exigida onde a opção não explica',
  /MOTIVOS_QUE_EXIGEM_TEXTO/.test(template)
    && /obrigatorioSe/.test(template) && /observacao__desqualificado/.test(template),
  'sem isso os 42% de "Outros" seguem sem uma palavra de explicação');

/* ── 4. as isenções da regra de pulo: Perdido e Reciclagem, nos dois sentidos ─────── */
checar('servidor: Reciclagem isenta da regra de pulo nos dois sentidos',
  /if \(String\(novaEtapa\) === ETAPA_RECICLAGEM \|\| atual === ETAPA_RECICLAGEM\) return null;/.test(servidor));
checar('servidor: Perdido isento da regra de pulo nos dois sentidos',
  /if \(String\(novaEtapa\) === ETAPA_PERDIDO \|\| atual === ETAPA_PERDIDO\) return null;/.test(servidor));
checar('template: o menu isenta Perdido E Reciclagem (o bug de 17/08 a 01/09 era este)',
  /const foraDaEscada = sid === ETAPA_PERDIDO_ID \|\| lead\.stageId === ETAPA_PERDIDO_ID[\s\S]{0,120}?'1398311191'/.test(template));
checar('template: a passagem de etapa isenta Perdido',
  /const ehPerdido = para === ETAPA_PERDIDO_ID \|\| de === ETAPA_PERDIDO_ID;/.test(template));

/* ── 5. o arrasto recusa exatamente o que o servidor recusaria ────────────────────── */
checar('template: fn2PodeMover existe e é o espelho de validarMovimentoEtapa',
  /function fn2PodeMover\(de, para\) \{/.test(template));
checar('fn2PodeMover libera Perdido nos dois sentidos',
  /if \(pr === FN2_ETAPA_PERDIDO \|\| d === FN2_ETAPA_PERDIDO\) return true;/.test(template));
checar('fn2PodeMover permite avançar só um degrau (e voltar para qualquer anterior)',
  /return iPara <= iDe \+ 1;/.test(template));
checar('o drop consulta fn3PodeMover ANTES de abrir o registro rápido',
  template.indexOf("if (!fn3PodeMover(voo.de, para)) {") > 0);
checar('soltar NÃO move: abre o registro rápido',
  template.indexOf("fn3AbrirRegistro(lead, para, redesenhar);") > 0);
/* A GUARDA QUE PEGOU O DEFEITO DE VERDADE (02/09/26). A primeira versão do registro
   rápido reimplementou a sequência inteira de escrita — PATCH da etapa, nota, tarefa,
   espelho local — e virou a terceira chamada de op:'mudar-etapa' no arquivo. Duas cópias
   da mesma sequência é como se perde a correção feita numa delas. Ficou uma função só,
   gravarPassagemDeEtapa, e as duas telas a chamam.

   ══ ELA PEGOU O DEFEITO DE NOVO EM 04/09/26 ════════════════════════════════════════
   O «✕ marcar perdido» da ficha do Planejamento (prancha 6c) nasceu com o fetch escrito
   à mão — a QUARTA chamada a op:'mudar-etapa' — e a irmã abaixo o pegou. Estava certa: à
   mão eu perdia o confirmarEtapaGravada, que PERGUNTA ao HubSpot se gravou depois de um
   abort em vez de chutar (a espera que a Kelly perdeu em 11:03 sobre um negócio que TINHA
   sido gravado).

   E O CONTADOR AQUI CONTINUOU EM 2, o que é o melhor sinal possível: a correção final não
   foi a ficha chamar gravarPassagemDeEtapa, foi ela entrar por abrirPassagemDeEtapa —
   que já chama. Assim a ficha ganhou de graça a porteira CAMPOS_POR_ETAPA, e é por isso
   que o «marcar perdido» pede motivo_do_perdido como qualquer outra transição (04/09/26,
   Julyan: "manter todas as propriedades do hubspot por etapa... o gestor precisa dos
   dados de tudo q é feito").

   Se algum dia este número precisar subir, subir exige vir aqui e dizer qual tela e por
   quê — mas desconfie: telas que entram pelo painel de passagem não mexem nele.

   ══ A INVARIANTE SUBIU DE NÍVEL EM 04/09/26 ════════════════════════════════════════
   Julyan: "quero que todas as ações sejam instantaneas no cockpit". As duas telas passaram
   a chamar `gravarPassagemOtimista`, que move o card no mesmo quadro, escreve atrás e —
   esta é a parte que importa — DEVOLVE o card se o HubSpot recusar.

   Então o que precisa ser medido agora é mais forte que "duas telas, uma função de
   escrita": é que NINGUÉM pule o motor. Uma tela que chame `gravarPassagemDeEtapa` direto
   fica instantânea sem reversão — ou seja, mostra um card numa etapa que o CRM não tem, e
   o gestor lê o número errado. É o oposto exato do que ele pediu na mesma conversa ("o
   gestor precisa dos dados de tudo q é feito").

   As três asserções abaixo, juntas, prendem a forma: uma sequência de escrita, um lugar
   com a regra de reversão, e o único caller da escrita é esse lugar. */
checar('existe UMA função de escrita de passagem de etapa',
  template.indexOf("async function gravarPassagemDeEtapa(opts) {") > 0);
checar('existe UM lugar com a regra de reversão',
  template.indexOf("async function gravarPassagemOtimista(opts) {") > 0);
checar('as duas telas chamam o motor otimista',
  (template.split("await gravarPassagemOtimista({").length - 1) === 2,
  'achado ' + (template.split("await gravarPassagemOtimista({").length - 1));
/* O NÚMERO É 1 E O 1 É O MOTOR. Se subir para 2, alguém escreveu no HubSpot por fora da
   reversão — e o card dele vai ficar numa etapa que o CRM recusou. */
checar('ninguém escreve etapa pulando a reversão',
  (template.split("await gravarPassagemDeEtapa(opts)").length - 1) === 1
  && (template.split("await gravarPassagemDeEtapa({").length - 1) === 0,
  'chamadas diretas com objeto: ' + (template.split("await gravarPassagemDeEtapa({").length - 1));
/* DOIS GESTOS NO MESMO NEGÓCIO AO MESMO TEMPO NÃO: sem esta trava, dois cliques rápidos
   viram duas escritas, e a reversão do segundo restaura um "antes" que já era o depois do
   primeiro — o card acaba numa etapa que ninguém escolheu. */
checar('o motor recusa gesto em cima de gravação em andamento',
  /FN_GRAVANDO\.has\(id\)/.test(template) && /FN_GRAVANDO\.add\(id\)/.test(template)
  && /FN_GRAVANDO\.delete\(id\)/.test(template));
/* A REVERSÃO TEM DE DEVOLVER OS DIAS. Avançar zera o contador (está certo, é etapa nova),
   mas o card que VOLTA precisa dos 8 dias que tinha — senão a tela diz que o negócio é
   fresco e a régua passa a mentir no caso em que nada aconteceu. */
checar('a reversão devolve etapa, dias e propriedades',
  /aplicarEtapaNoDataLocal\(id, antes\.stageId, antes\.props, antes\.dias\)/.test(template));
/* O CASO DA KELLY: espera estourada E confirmação sem resposta. Ninguém sabe se gravou, e
   reverter apagaria da tela uma mudança que talvez exista no CRM.

   A PRIMEIRA VERSÃO DESTA ASSERÇÃO DEU VERDE SEM MEDIR NADA: ela era um regex sobre o
   TEXTO do bloco, e eu a testei trocando `if (naoSei)` por `if (false && naoSei)` — o
   texto continuou lá e ela passou. Guarda que não distingue código vivo de código morto é
   a terceira que eu escrevo assim.
   Agora ela prende duas coisas verificáveis em texto: a condição é LITERALMENTE `naoSei`
   (a troca por `false &&` muda a literal e reprova), e o `return` dela vem ANTES da linha
   de reversão — que é o que faz o caso da Kelly não ser revertido. Ordem textual é fraca,
   mas é honesta sobre o que mede; o comportamento em si se prova no navegador. */
(function () {
  const iSe = template.indexOf('  if (naoSei) {');
  const iRev = template.indexOf('aplicarEtapaNoDataLocal(id, antes.stageId');
  checar('o motor testa `naoSei` sem condição pendurada',
    iSe > 0, iSe > 0 ? '' : 'não achei `if (naoSei) {` — a condição mudou de forma');
  checar('e o retorno de "não sei se gravou" vem ANTES da reversão',
    iSe > 0 && iRev > iSe,
    'naoSei em ' + iSe + ', reversão em ' + iRev);
})();
/* ══ DE 2 PARA 3 CHAMADAS, EM 03/09/26 ══════════════════════════════════════════════
   Esta assercao conta as chamadas a /api/negocio-acao para impedir que alguem crie um
   SEGUNDO caminho de escrita no negocio em vez de usar o que existe. A regra e boa e
   fica; o numero mudou porque nasceu uma terceira chamada LEGITIMA.

   A terceira e o campo de endereco da prancha 6a. A carteira do HubSpot quase nao tem
   coordenada — medido: 4 de 18 negocios do Marco —, e sem coordenada o negocio nao entra
   em regiao nenhuma, que e o mecanismo central da tela nova. O executivo preenche o
   endereco uma vez e a conta passa a casar com o dia da rota.

   E ela usa EXATAMENTE a rota que ja existia: op mudar-etapa com a etapa ATUAL do
   negocio. mudar-etapa-negocio.js calcula `movendo = atual !== nova`, entao passar a
   mesma etapa grava propriedade sem mover o negocio; e bairro, cep e logradouro ja
   estavam na whitelist dela. Zero rota nova, zero whitelist nova — que e precisamente o
   que esta assercao existe para garantir. */
checar('nenhuma chamada nova a /api/negocio-acao fora das tres conhecidas',
  (template.match(/op: 'mudar-etapa'/g) || []).length === 3,
  'esperado 3 (edição inline + função compartilhada + endereço da prancha 6a), achado ' +
  (template.match(/op: 'mudar-etapa'/g) || []).length);


/* ══ O GESTO INSTANTÂNEO TEM DE SER VISÍVEL (04/09/26) ═══════════════════════════════
   MEDIDO: confirmei "→ avançar" e o cartão DESAPARECEU da tela. Não era o motor otimista —
   o dado moveu certo (DATA e fn2Leads devolviam o lead em Visita) —, mas a coluna Visita do
   Bruno tem 31 cartões e FN2_VISIVEIS_POR_COLUNA é 3: o recém-chegado caía na 31ª posição,
   atrás do "ver os 31 →".

   É o defeito do BLOCO 16 deste produto outra vez, escrito lá sobre o primeiro cache
   otimista: "o botão virava ✓ ... parecia que não tinha funcionado, e dava vontade de clicar
   de novo (criando duplicata)". Instantâneo que não se vê é pior que a ampulheta — a
   ampulheta pelo menos dizia que algo estava acontecendo. */
checar('o recém-movido existe e sobe na coluna de destino',
  template.indexOf('const FN3_RECEM = new Set();') > 0
  && template.indexOf('const recem = a => (typeof FN3_RECEM') > 0
  && template.indexOf('const dR = recem(a) - recem(b);') > 0);
checar('o motor marca o recém-movido junto com o movimento',
  /FN_GRAVANDO\.add\(id\);[\s\S]{0,400}FN3_RECEM\.add\(id\);/.test(template));
checar('e a reversão tira a marca (ele não se moveu)',
  template.indexOf('FN3_RECEM.delete(id);') > 0);
/* TRACEJADO ENQUANTO ESCREVE: a convenção deste arquivo para "existe mas ainda não
   confirmado" (a mesma do recemAgendado na agenda). Sem ela a tela afirma uma gravação que
   pode ser recusada, e o card voltando sem aviso parece a tela se mexendo sozinha. */
checar('o cartão em voo é tracejado e diz que pode voltar',
  /\.fn3-card\.is-gravando\{border-style:dashed/.test(template)
  && template.indexOf('se recusar, o cartão volta') > 0);
/* O SELO DO TOPO NÃO PODE PROMETER REALTIME. Medido no produto: `.channel(`,
   `postgres_changes` e `.subscribe(` aparecem ZERO vezes. E realtime na FOTO do HubSpot
   (cockpit_snapshot) dispararia uma vez por rodada do robô — o oposto de tempo real. A
   prancha 12b pede o selo "Supabase realtime"; ele não entra enquanto não existir. */
/* MASCARA OS COMENTÁRIOS ANTES DE PROCURAR. A primeira versão desta asserção reprovou pelo
   PRÓPRIO comentário que explica a decisão — ele cita "Supabase realtime" para dizer por que
   o selo NÃO usa aquilo. É o mesmo falso positivo que derrubou a primeira versão da guarda
   10 e a do "hoje da agenda": a explicação do defeito contém a forma errada. */
(function () {
  const semComentario = template
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  checar('o selo do hero não promete Supabase realtime',
    semComentario.indexOf('Supabase realtime') < 0
    && semComentario.indexOf('suas ações são instantâneas') > 0,
    semComentario.indexOf('Supabase realtime') >= 0
      ? 'a promessa de realtime está em código, não em comentário' : '');
})();
checar('e ele diz o que NÃO é instantâneo',
  template.indexOf('mudança de outra pessoa entra na próxima carga') > 0);
/* ══ A ROLAGEM DO KANBAN INVERTEU EM 04/09/26, E EU ESTAVA ERRADO ═════════════════════
   No mesmo dia eu escrevi aqui a asserção oposta: piso de 232px por coluna e rolagem
   HORIZONTAL, com o argumento de que "sete colunas legíveis valem mais que sete colunas
   visíveis".

   O Julyan mandou as telas: Pagamento e Onboarding ficavam CORTADOS, com barra horizontal.
   "eu quero todas as etapas na tela... o scroll q falei foi pra baixo, chegou no ultimo lead
   de cima p baixo ele scrolla, n quero lateral" — e depois, explícito: "scroll vertical por
   coluna, cabeçalho fixo".

   Ele está certo, e a razão é o que o kanban É: uma leitura do ESTADO do funil de uma vez.
   Sete colunas com o nome truncado dizem o estado; cinco legíveis e duas fora da tela não
   dizem. O nome inteiro está no title e na ficha.

   O CABEÇALHO STICKY É PARTE DA REGRA, não enfeite: rolar a coluna sem ele faz perder de
   vista QUAL etapa se está lendo — o único dado que a coluna carrega de graça.

   E O CORTE DE 3 POR COLUNA VIROU TETO DE 60: com a coluna rolando, esconder 28 cartões
   atrás de um botão é o oposto do pedido. O 60 existe só para uma carga anômala não montar
   500 nós; a maior coluna medida tem 37. */
checar('o kanban encaixa as sete etapas e NÃO rola na horizontal',
  /\.fn3-grade\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/.test(template)
  && !/\.fn3-grade\{[^}]*overflow-x:auto/.test(template),
  'a grade voltou a rolar de lado — Pagamento e Onboarding saem da tela');
checar('a coluna rola VERTICALMENTE, com altura em vh',
  /\.fn3-col\{[\s\S]{0,400}?max-height:min\(68vh,780px\);overflow-y:auto/.test(template));
checar('e o cabeçalho da coluna fica fixo enquanto ela rola',
  template.indexOf('.fn3-col > .fn3-cab{position:sticky;top:0;') > 0,
  'sem o sticky ele rola a coluna e perde de vista qual etapa está lendo');
checar('o corte por coluna deixou de esconder cartão',
  template.indexOf('const FN2_VISIVEIS_POR_COLUNA = 60;') > 0,
  'voltou a esconder cartão atrás de um botão numa coluna que rola');
/* NO TOQUE A COLUNA NÃO ROLA POR DENTRO: ela empilha e a PÁGINA rola. Caixa de 68vh dentro
   de uma tela de 68vh é rolagem dentro de rolagem, e o dedo não sabe qual das duas move. */
checar('o acordeão do toque desfaz a rolagem por coluna',
  /\.fn3-col\{max-height:none;overflow-y:visible/.test(template)
  && /\.fn3-col > \.fn3-cab\{position:static;\}/.test(template));

/* ── 6. as colunas são o pipeline oficial ────────────────────────────────────────── */
const idsColunas = (template.match(/const FN2_ETAPAS = \[([\s\S]*?)\n\];/) || [])[1] || '';
const colunas = (idsColunas.match(/id: '(\d+)'/g) || []).map(x => x.replace(/id: '|'/g, ''));
checar('o kanban tem 7 colunas', colunas.length === 7, 'achado ' + colunas.length);
checar('Pagamento é coluna do kanban (é onde o ASAAS cobra)', colunas.indexOf(PAGAMENTO) >= 0);
checar('Perdido é a última coluna', colunas[colunas.length - 1] === PERDIDO);
checar('Ganho NÃO é coluna (ninguém move para lá à mão)', colunas.indexOf(GANHO) < 0);
checar('FN2_ETAPAS_ABERTAS existe e exclui quem saiu do funil',
  /const FN2_ETAPAS_ABERTAS = FN2_ETAPAS\.filter\(e => !e\.saiu\);/.test(template));
/* A barra do hero, o Comando e a conta de "seca em N" NÃO podem iterar as 7: contariam
   negócio perdido como negócio em jogo. Foi o primeiro defeito que a coluna nova criou. */
['const maxN = Math.max(1, ...FN2_ETAPAS_ABERTAS', 'const segmentos = FN2_ETAPAS_ABERTAS',
 'const rotulos = FN2_ETAPAS_ABERTAS', 'const linhas = FN2_ETAPAS_ABERTAS'].forEach(trecho => {
  checar('leitura de funil itera as abertas: ' + trecho.slice(0, 34), template.indexOf(trecho) >= 0);
});
checar('o shell separa "todos" (colunas) de "itens" (o funil)',
  /const todos = fn2Leads\(r\);[\s\S]{0,220}?const itens = todos\.filter\(x => x\.stageId !== FN2_ETAPA_PERDIDO\);/.test(template));

/* ── 7. Perdido não pede próximo passo ───────────────────────────────────────────── */
checar('a bandeira exigePasso existe e exclui Perdido',
  template.indexOf("const exigePasso = para !== ETAPA_PERDIDO_ID;") > 0);
checar('a seção do próximo passo só é renderizada quando exigePasso',
  /\$\{!exigePasso \? '' :/.test(template));
checar('a validação do próximo passo respeita exigePasso',
  /if \(exigePasso && \(!passoAcao \|\| !passoData\)\) \{/.test(template));
checar('a criação da tarefa respeita exigePasso (dentro da função compartilhada)',
  template.indexOf("const exigePasso = !!(opts.passoAcao && opts.passoData);") > 0 &&
  template.indexOf("tipoAcao: 'proximo-passo'") > 0);

/* ── 8. o corte: nada retroativo desce ──────────────────────────────────────────── */
checar('robô: existe um corte de Perdido, com data',
  /const CORTE_PERDIDO_ISO = '\d{4}-\d{2}-\d{2}';/.test(robo));
checar('robô: NÃO existe janela deslizante (o Julyan pediu corte único)',
  !/JANELA_PERDIDO_DIAS/.test(robo));
checar('robô: o corte é aplicado no FILTRO do HubSpot, não com .filter() depois',
  /propertyName: 'closedate', operator: 'GTE', value: String\(inicioPerdido\)/.test(robo));
checar('robô: o filtro pede a etapa Perdido e só os donos do time',
  /dealstage', operator: 'EQ', value: STAGES\.perdido[\s\S]{0,220}?hubspot_owner_id', operator: 'IN'/.test(robo));
checar('robô: a etapa Perdido NÃO entrou em OPEN_STAGES',
  !/OPEN_STAGES = \[[^\]]*perdido/.test(robo));
checar('robô: closedate e motivo_do_perdido são pedidos ao HubSpot',
  /'closedate', 'motivo_do_perdido',/.test(robo));
checar('robô: a coluna entra em funilLeads (para o corte por dono valer de graça)',
  /funilLeads\[STAGES\.perdido\] = perdidosRecentes\.map/.test(robo));
checar('robô: os perdidos são ordenados do mais recente para o mais antigo',
  /\}\)\.sort\(\(a, b\) => a\.dias - b\.dias\);/.test(robo));
checar('robô: o corte desce no payload, para a tela poder declarar a data',
  /perdidoVisivel: \{[\s\S]{0,200}?corte: CORTE_PERDIDO_ISO/.test(robo));
checar('montar-dados: o gestor recebe perdidoVisivel',
  /perdidoVisivel: hubspot\.perdidoVisivel \|\| null,/.test(montar));
checar('montar-dados: o executivo recebe perdidoVisivel',
  /const perdidoVisivel = dados\.perdidoVisivel \|\| null;/.test(montar) &&
  /^\s{4}perdidoVisivel,$/m.test(montar));
checar('a tela declara o corte na coluna Perdido vazia',
  /DATA\.perdidoVisivel && DATA\.perdidoVisivel\.corte/.test(template));

/* ── 9. Perdido não é tratado como pendência na tela ─────────────────────────────── */
checar('o estado de Perdido é decidido ANTES do bloco de "sem próximo passo"',
  template.indexOf('if (et === FN2_ETAPA_PERDIDO) {') > 0 &&
  template.indexOf('if (et === FN2_ETAPA_PERDIDO) {') < template.indexOf("/* SEM PASSO: o verbo vem da etapa"),
  'senão o kanban pediria em vermelho a próxima visita de um negócio morto');
/* PERDIDO DEIXOU DE SER COLUNA na v3: virou trilho de uma linha no rodapé. Coluna inteira
   para dizer "0" é a tela gritando o que NÃO aconteceu, no meio de seis que dizem o que
   aconteceu. O card perdido continua existindo — dentro do trilho, quando se abre.
   TODAS as checagens daqui usam indexOf literal, e não regex: escapar barra invertida
   dentro de patch é o erro que a memória do projeto já registra, e ele volta calado —
   a regex fica VÁLIDA e errada, e a guarda passa verde protegendo nada. */
const iGrade = template.indexOf('const FN3_COLUNAS = [');
const grade = iGrade > 0 ? template.slice(iGrade, template.indexOf('];', iGrade)) : '';
checar('a grade tem 7 colunas', (grade.match(/id: /g) || []).length === 7,
  'achado ' + (grade.match(/id: /g) || []).length);
checar('Perdido NÃO é coluna da grade', grade.length > 0 && grade.indexOf('1396006164') < 0);
checar('Enviado Onboarding é a última coluna da grade',
  grade.indexOf('onb: true') > grade.indexOf('pagto: true'));
checar('Perdido é trilho no rodapé, com o corte declarado',
  template.indexOf('function fn3Perdidos(perdidos) {') > 0 &&
  template.indexOf('nada saiu da sua carteira') > 0);
checar('o alternador Ativos/Perdidos existe',
  template.indexOf('data-fn3-aba="ativos"') > 0 && template.indexOf('data-fn3-aba="perdidos"') > 0);
checar('o card de Onboarding não se arrasta (o que saiu da sua mão não volta por gesto)',
  template.indexOf('const arrastavel = !e.onb;') > 0);
checar('o CTA do card perdido é reabrir, e cai no menu de etapas',
  template.indexOf("cta: 'Reabrir →', acao: 'mover'") > 0);

/* ── 10. a conversão: a correção que o Julyan pediu ─────────────────────────────── */
checar('fn2Conversao lê porOwner (dele) e agregado (do time)',
  template.indexOf('const doTime = h.agregado || [];') > 0);
checar('n pequeno é declarado em vez de virar porcentagem',
  template.indexOf('poucos: m.chegaram < FN2_N_MINIMO') > 0 &&
  template.indexOf("if (c.poucos) return 'passou '") > 0);
checar('o degrau do hero usa conversão, não estoque parado',
  template.indexOf('const pior = candidatos.slice().sort((a, b) => a.c.meu - b.c.meu)[0];') > 0);
checar('o degrau compara com o time para separar "etapa dura" de "minha passagem"',
  template.indexOf('a etapa não é o problema, a sua passagem por ela é') > 0);
checar('sem histórico suficiente o degrau não inventa etapa',
  template.indexOf('histórico curto para apontar onde o funil vaza') > 0);
/* A CONVERSÃO SAIU DO HEADER e foi para o title do hover: três linhas de estatística no
   header afogavam o nome da etapa, que é o defeito nº 2 do print que o Julyan mandou. */
checar('a conversão não ocupa linha do header — vive no title do hover',
  template.indexOf('const conv = (col.pagto || col.onb) ? null : fn2Conversao(col.id, fn2OwnerAtual);') > 0 &&
  template.indexOf('title="${dica}"') > 0);
/* O card de Perdido dizia "31/08 (segunda)" para uma perda de 01/09 (terça): 'YYYY-MM-DD'
   é meia-noite UTC pela especificação, e em Brasília (UTC−3) isso é o dia anterior. Errava
   a data e o dia da semana — que é a única coisa que o chip diz. */
/* Busca LITERAL, não regex: o padrão a verificar é ele mesmo uma expressão regular, e
   escapá-la dentro de outra só cria oportunidade de errar o escape (foi o que aconteceu na
   primeira tentativa desta checagem). indexOf não tem essa armadilha. */
checar('fn2Quando trata data só-dia sem converter fuso',
  template.indexOf("if (txt.length === 10 && txt.charAt(4) === '-' && txt.charAt(7) === '-') {") > 0);
/* E a checagem que faltava: a que teria pego o defeito de verdade. A primeira versão desta
   guarda procurava o padrão com barras invertidas e as perdeu no mesmo escape que o código
   perdeu — as duas mangleadas casaram, a guarda passou, e o bug subiu. Esta olha o
   RESULTADO em vez da forma: se sobrou regex de data neste caminho, ela reprova. */
checar('não há regex de data em fn2Quando (barra invertida some em patch e a regex fica válida e errada)',
  !/function fn2Quando\(d\) \{[\s\S]{0,900}?test\(txt\)/.test(template));
checar('fn2Quando ainda converte timestamp completo (ali a conversão é necessária)',
  template.indexOf('const iso = isoDate(new Date(d));') > 0);

/* ── 11. o comentário que declarava o limite não pode continuar mentindo ─────────── */
/* ── 11. o comentário que declarava o limite não pode continuar mentindo ─────────── */
checar('o "LIMITE DECLARADO" da fila foi corrigido (Perdido passou a ser aceito)',
  template.indexOf('LIMITE DECLARADO: "Perder com motivo" não é oferecido') < 0 &&
  template.indexOf('LIMITE LEVANTADO (01/09/26)') > 0);
checar('o comentário do topo do servidor não diz mais que Perdido ficou de fora',
  servidor.indexOf('Marcar como Perdido/Reciclagem ficou fora de propósito nesta rodada') < 0);

/* ── 12. ENVIADO ONBOARDING: clone, sem retroativo, sem escrever propriedade ──────
   Pedido do Julyan (02/09/26): "puxando do pipe do field com TODAS AS PROPRIEDADES pq
   quando eles enviam pra onboarding cria automações no whatsapp, cria outro card no pipe
   do onboarding e etc não é pra alterar NENHUMA propriedade do hubspot, apenas clonar e
   NÃO QUERO NENHUM RETROATIVO VAI SER A PARTIR DE HOJE TB".
   Medido antes: 431 negócios já estão na etapa — 391 de julho/26. Sem o corte, a coluna
   nasce com 431 cards. */
const ONB = '1396006163';
checar('robô: existe corte do onboarding, com data',
  (robo.match(/const CORTE_ONBOARDING_ISO = .[0-9]{4}-[0-9]{2}-[0-9]{2}./) || []).length === 1);
checar('robô: o corte usa a data de ENTRADA na etapa, não closedate nem lastmodified',
  robo.indexOf("const PROP_ENTRADA_ONBOARDING = 'hs_v2_date_entered_' + ETAPA_ONBOARDING;") > 0 &&
  robo.indexOf("propertyName: PROP_ENTRADA_ONBOARDING, operator: 'GTE'") > 0);
checar('robô: o corte é aplicado no FILTRO do HubSpot',
  robo.indexOf('value: String(inicioOnb)') > 0);
checar('robô: só os donos do time',
  robo.indexOf("propertyName: 'hubspot_owner_id', operator: 'IN', values: REPS.map(r => r.ownerId) },") > 0);
checar('robô: TODAS as propriedades vêm da API, não de uma lista escrita à mão',
  robo.indexOf('async function todasAsPropriedadesDeNegocio()') > 0 &&
  robo.indexOf("fetch('https://api.hubapi.com/crm/v3/properties/deals'") > 0);
checar('robô: as propriedades são pedidas em lotes (uma requisição gigante é recusada)',
  robo.indexOf('const LOTE = 120;') > 0);
checar('robô: só as propriedades PREENCHIDAS descem (nulo não vira snapshot)',
  robo.indexOf("if (v !== null && v !== undefined && String(v).trim() !== '') atual.properties[k] = v;") > 0);
checar('robô: o clone inteiro viaja no campo props',
  robo.indexOf('props: q') > 0);
checar('robô: a etapa NÃO entrou em OPEN_STAGES (não é degrau do funil aberto)',
  !/OPEN_STAGES = [[^]]*1396006163/.test(robo));
checar('robô: falhar o clone não derruba a rodada',
  robo.indexOf("console.error('Onboarding: não consegui clonar a etapa —', e.message);") > 0);
checar('robô: o corte desce no payload para a tela poder declarar a data',
  robo.indexOf('onboardingVisivel: {') > 0 && robo.indexOf('corte: CORTE_ONBOARDING_ISO') > 0);
checar('montar-dados: os dois papéis recebem onboardingVisivel',
  montar.indexOf('onboardingVisivel: hubspot.onboardingVisivel || null,') > 0 &&
  montar.indexOf('const onboardingVisivel = dados.onboardingVisivel || null;') > 0);

/* O COCKPIT NÃO ESCREVE PROPRIEDADE NESTA ETAPA. É a trava mais importante deste bloco:
   a etapa dispara automação de WhatsApp e cria card em outro pipe. A única escrita que
   pode existir é a da PASSAGEM (dealstage), e ela vai pela função compartilhada — que
   recebe {} de propriedades quando o destino é Onboarding, porque CAMPOS_POR_ETAPA não
   exige nada lá. O card não tem campo editável, e a coluna não é destino de gaveta. */
checar('template: a etapa Onboarding não exige propriedade nenhuma (nada a escrever)',
  template.indexOf("'" + ONB + "': [],") > 0);
checar('servidor: Onboarding continua destino permitido (a passagem é o que dispara)',
  servidor.indexOf(ONB) > 0);
checar('template: o card de Onboarding é espelho — nenhum campo editável',
  template.indexOf("esta coluna não edita nada") > 0);
checar('template: o registro rápido avisa o que a passagem dispara',
  template.indexOf('dispara a automação de WhatsApp e cria o card no pipe de Onboarding') > 0 ||
  (template.indexOf('automação de WhatsApp e cria o card no pipe de Onboarding') > 0 &&
   template.indexOf('Ao confirmar, o HubSpot') > 0));
checar('template: e avisa que o Cockpit grava só a etapa',
  template.indexOf('grava') > 0 && template.indexOf('só a etapa') > 0);
checar('template: Onboarding não pede próximo passo (o negócio saiu do funil de venda)',
  template.indexOf('const exigePasso = !paraOnb;') > 0);
checar('template: a coluna vazia declara o corte em vez de parecer defeito',
  template.indexOf('nada enviado para onboarding') > 0);

/* ── A PROPRIEDADE DE ENTRADA NA ETAPA NÃO EXISTE PARA TODA ETAPA (02/09/26) ─────
   O robô caiu com um HubSpot 400 porque pediu hs_v2_date_entered_1398311191, que não
   existe: a Reciclagem é a única etapa do Field Sales sem essa propriedade. E o robô é
   o gargalo de TODA a ferramenta — quando ele cai, nenhum número da semana atualiza.
   Estas checagens não conversam com o HubSpot (suíte é offline); elas travam a forma
   que já se provou errada e fixam a que se provou certa. */
checar('semanal: ninguém monta hs_v2_date_entered_ + a etapa de Reciclagem (não existe)',
  semanalCodigo.indexOf("'hs_v2_date_entered_' + STAGES.reciclagem") < 0 &&
  semanalCodigo.indexOf('hs_v2_date_entered_' + RECICLAGEM) < 0);
checar('semanal: Reciclagem conta pela data de entrada na etapa ATUAL (propriedade global)',
  semanal.indexOf("'hs_v2_date_entered_current_stage'") > 0);
checar('semanal: Perdido conta por closedate (etapa fechada), não por última modificação',
  semanal.indexOf("contagemComFiltro(STAGES.perdido, startMs, endMs, 'closedate')") > 0);
checar('semanal: a contagem é o total do servidor, não o tamanho da página',
  semanalCodigo.indexOf('return data.total || 0;') > 0 &&
  semanalCodigo.indexOf('hs_lastmodifieddate') < 0);

/* ══ A PASSAGEM DE ETAPA ABERTA PELA FICHA (04/09/26) ═══════════════════════════════════
   O JULYAN, na tela: "ao ir pra visita tá dando isso tbm" — «Falha ao falar com o HubSpot:
   Cannot read properties of undefined (reading 'name')».

   REPRODUZIDO no bundle real com fetch instrumentado, e a stack foi esta:
     TypeError ... at abrirFichaLeadFunilDrawer   <- l.name, com l === undefined
       at (o callback da trilha)                  <- leadAtualizado => abrirFicha(...)
       at redesenhar                              <- aoConcluir()  SEM ARGUMENTO
       at gravarPassagemOtimista
   Dois callers esperavam receber o lead atualizado; o único produtor chamava sem nada.
   MEDIDO o que isso causava: zero requisições ao HubSpot (a etapa NUNCA foi gravada, e a
   frase de erro dizia o contrário), o card movido só na tela, e FN_GRAVANDO preso com o id
   — toda tentativa seguinte respondia "ainda estou gravando a mudança anterior".

   As checagens abaixo prendem as quatro peças do conserto. Sem regex: barra invertida morre
   no caminho de patch, e regex sem as barras fica válida e errada. */
(function () {
  /* 1. NENHUMA CHAMADA DE CALLBACK SEM ARGUMENTO no produtor. `aoConcluir()` com parênteses
     vazios é exatamente a forma que produziu o TypeError. */
  const iPass = template.indexOf('function abrirPassagemDeEtapa(');
  const fimPass = template.indexOf(String.fromCharCode(10) + "function ", iPass + 10);
  const corpoPass = iPass > 0 ? template.slice(iPass, fimPass > 0 ? fimPass : iPass + 9000) : '';
  checar('a passagem de etapa existe para ser medida', iPass > 0 && corpoPass.length > 500);
  checar('a passagem de etapa nunca chama o callback sem o lead',
    corpoPass.indexOf('aoConcluir();') < 0,
    'voltou um aoConcluir() sem argumento — foi essa forma que matou a escrita no HubSpot');

  /* 2. E O QUE ELE ENTREGA É O LEAD DEPOIS DO MOVIMENTO: etapa de destino + o que o
     formulário coletou. Entregar o lead de antes reabriria a ficha na etapa velha. */
  const iRed = template.indexOf('redesenhar: function () {');
  checar('o produtor monta o lead atualizado para entregar', iRed > 0);
  const trecho = iRed > 0 ? template.slice(iRed, iRed + 420) : '';
  checar('o callback recebe o lead com a etapa de destino',
    trecho.indexOf('aoConcluir(Object.assign({}, lead, coleta.propriedades') > -1
    && trecho.indexOf('stageId: para') > -1, trecho.slice(0, 160));

  /* 3. UMA PORTA SÓ. Havia uma segunda chamada do mesmo callback no fim do handler
     (`passagemVoltarPara(lead)`), com o lead ANTES do movimento: duas portas para a mesma
     ideia, e a segunda desfazia o efeito da primeira na tela. */
  checar('a segunda porta do callback não voltou',
    template.indexOf('let passagemVoltarPara') < 0
    && template.indexOf('passagemVoltarPara = aoConcluir') < 0,
    'passagemVoltarPara reapareceu — o callback volta a ser chamado duas vezes, uma com o lead velho');

  /* 4. O DESENHO NÃO DERRUBA A ESCRITA. Esta é a classe, não o caso: qualquer erro em
     qualquer tela chamada pelo redesenhar abortaria a gravação no CRM. */
  const iMotor = template.indexOf('async function gravarPassagemOtimista');
  const motor = iMotor > 0 ? template.slice(iMotor, iMotor + 4200) : '';
  checar('o motor existe para ser medido', iMotor > 0);
  checar('o motor isola o desenho num try',
    motor.indexOf('try { opts.redesenhar(leadDepois); }') > -1,
    'o redesenhar voltou a ser chamado cru dentro do motor');
  checar('e a falha de pintura é dita, não silenciada',
    motor.indexOf('falhaDeDesenho') > -1 && motor.indexOf('nao conseguiu se repintar') > -1);

  /* 5. A TRANCA SAI NO `finally`. Sem isso, um erro que eu não previ deixa o negócio
     bloqueado pelo resto da sessão — foi o que a ficha fez. */
  const iFin = motor.indexOf('} finally {');
  checar('a tranca do negócio sai no finally',
    iFin > -1 && motor.slice(iFin, iFin + 90).indexOf('FN_GRAVANDO.delete(id)') > -1,
    'FN_GRAVANDO.delete voltou para fora do finally');

  /* 6. A FICHA TEM 21 CHAMADORES: a rede existe porque a próxima quebra de contrato não
     pode voltar a ser um TypeError dentro de uma escrita no CRM. */
  const iFicha = template.indexOf('function abrirFichaLeadFunilDrawer(');
  const ficha = iFicha > 0 ? template.slice(iFicha, iFicha + 700) : '';
  checar('a ficha responde em vez de estourar quando chega sem lead',
    ficha.indexOf('if (!l) {') > -1 && ficha.indexOf('recarregue a pagina') > -1);

  /* 7. O TELEFONE DA CRIAÇÃO VIRA PROPRIEDADE. Julyan: "eu preenchi o telefone e na etapa
     nao foi". Medido: o corpo enviado tinha telefone (que a rota escreve na DESCRIÇÃO) e
     propriedades sem `celular` — a propriedade que a ficha lê e o gestor filtra. */
  checar('o formulário manual manda o telefone como propriedade celular',
    template.indexOf('coleta.propriedades.celular = telefone;') > -1);
  checar('e a conta-alvo também',
    template.indexOf('if (lead.telefone) coleta.propriedades.celular = lead.telefone;') > -1);
  checar('a rota aceita celular (senão os dois acima virariam 400)',
    fs.readFileSync(path.join(raiz, 'api', 'criar-negocio.js'), 'utf8')
      .indexOf("'celular'") > -1);

  /* 8. CADA LEAD DIZ EM QUE ETAPA ESTÁ. A etapa vinha só como CHAVE do mapa, e a ficha faz
     ORDEM_FUNIL_FICHA.indexOf(l.stageId): com -1 ela NÃO DESENHA A TRILHA. Medido no
     bundle real: 0 dos 8 segmentos de mudar etapa num lead da carga, 8 no criado na
     sessão. A carteira inteira estava sem a trilha. */
  checar('montar-dados normaliza a etapa dentro do lead',
    montar.indexOf('function comEtapaNoLead(') > -1
    && montar.indexOf('funilLeads: comEtapaNoLead(hubspot.funilLeads)') > -1);
  checar('e não sobrescreve a etapa que o lead já traga',
    montar.indexOf('stageId: l.stageId || etapa') > -1,
    'a chave do mapa é o fallback, nunca a autoridade');
})();

/* ══ E ISTO RODA DE VERDADE: 146 leads, nenhum sem etapa ════════════════════════════════
   A checagem textual acima prova a forma; esta prova o COMPORTAMENTO com o dado que existe
   neste disco. As duas juntas são o que impede a normalização de virar comentário. */
(function () {
  let mod = null;
  try { mod = require(path.join(raiz, 'scripts', 'montar-dados.js')); } catch (e) { mod = null; }
  if (!mod || typeof mod.montarDadosCompletos !== 'function') {
    checar('montar-dados carrega para o teste de comportamento', false, 'nao carregou');
    return;
  }
  let d = null;
  try { d = mod.montarDadosCompletos(); } catch (e) { d = null; }
  if (!d) { checar('montarDadosCompletos roda neste disco', false, 'sem snapshot local — teste pulado'); return; }
  const todos = [];
  Object.entries(d.funilLeads || {}).forEach(function (par) {
    (par[1] || []).forEach(function (l) { todos.push([par[0], l]); });
  });
  checar('há lead na carga para medir', todos.length > 0, todos.length + ' leads');
  const semEtapa = todos.filter(function (p) { return !p[1].stageId; });
  checar('nenhum lead da carga sai sem stageId',
    semEtapa.length === 0, semEtapa.length + ' de ' + todos.length + ' sem etapa');
  const errados = todos.filter(function (p) { return String(p[1].stageId) !== String(p[0]); });
  checar('e o stageId de cada lead é a etapa em que ele está',
    errados.length === 0, errados.length + ' com etapa diferente da coluna');
})();

/* ══ CEP E CNPJ SÓ DÍGITOS — O HUBSPOT SEMPRE RECUSOU O RESTO (04/09/26) ════════════════
   ACHADO movendo um negócio de teste pelo Cockpit até Ag. Pagamento. Resposta do HubSpot,
   ao pé da letra:
     cep: Enter only numbers and letters, not special characters like -
     cnpj_cpf: Enter only numbers and letters, not special characters like ., /, -
   O executivo digita "29050-000" e "00.000.000/0001-00" — é como esses números se escrevem
   e como o cliente os dita. A passagem INTEIRA era recusada, e na etapa do dinheiro: Ag.
   Pagamento é a que alimenta o RPA/ASAAS.

   CONFERIDO NO CRM antes de escolher o formato: 543 negócios do pipeline têm o campo
   preenchido e todos guardam só dígitos (02858882000156, 05846410). Não é convenção nova —
   é o formato da casa, e é o que o RPA já lê. O Cockpit é espelho: quem se ajusta é ele.

   DUAS CAMADAS: a tela limpa na coleta (as quatro portas de passagem passam por
   coletarCamposPassagem) e as rotas limpam de novo, para os caminhos que não passam pela
   tela. E amount/mrr ficam FORA da lista de propósito: são números com decimal e são o que
   o RPA/ASAAS lê para gerar o link — limpar "tudo que parece número" comeria o ponto. */
(function () {
  const rotaEtapa = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'), 'utf8');
  const rotaCriar = fs.readFileSync(path.join(raiz, 'api', 'criar-negocio.js'), 'utf8');

  checar('a tela tem a regra de só-dígitos num lugar só',
    template.indexOf('const PROPS_SO_DIGITOS = { cep: 8, cnpj_cpf: 14 };') > -1
    && template.indexOf('function limparSoDigitos(') > -1);
  checar('a coleta de campos da passagem usa a regra',
    template.indexOf('const limpo = limparSoDigitos(campo.prop, valor);') > -1);
  checar('e a edição inline da ficha, que grava por outro caminho, usa a mesma',
    template.indexOf('const limpoUnico = limparSoDigitos(propNome, v.valor);') > -1
    && template.indexOf('v.valor = limpoUnico.valor;') > -1);

  checar('a rota de etapa limpa também',
    rotaEtapa.indexOf('const PROPS_SO_DIGITOS = { cep: 8, cnpj_cpf: 14 };') > -1
    && rotaEtapa.indexOf('const limpo = soDigitos(chave, texto);') > -1);
  checar('a rota de criação limpa também',
    rotaCriar.indexOf('const PROPS_SO_DIGITOS = { cep: 8, cnpj_cpf: 14 };') > -1
    && rotaCriar.indexOf('const limpo = soDigitos(chave, texto);') > -1);

  /* AMOUNT E MRR NÃO ENTRAM, e isto é uma trava e não uma observação: eles são o que o
     RPA/ASAAS lê para gerar o link do contrato, e um dia alguém vai querer "limpar todo
     campo numérico". 349.90 viraria 34990. */
  checar('a lista de só-dígitos é exatamente cep e cnpj — nada mais entra',
    template.indexOf("PROPS_SO_DIGITOS = { cep: 8, cnpj_cpf: 14 };") > -1
    && template.indexOf("PROPS_SO_DIGITOS = { cep: 8, cnpj_cpf: 14, ") < 0,
    'alguém ampliou a lista: com amount ou mrr dentro dela, 349.90 vira 34990');

  /* O TETO É O DO HUBSPOT, medido na recusa: "Enter 8 characters or fewer" (cep) e
     "Enter 14 characters or fewer" (cnpj_cpf). Passar de 14 dígitos é erro de digitação e
     tem de aparecer na tela, não virar recusa em inglês depois do clique. */
  checar('o teto de dígitos é dito na tela antes de o HubSpot recusar',
    template.indexOf('O HubSpot aceita no máximo ') > -1);
})();

/* ══ O QUE O RPA DO ASAAS PRECISA (04/09/26) ════════════════════════════════════════════
   Achado subindo um negócio de teste até Ag. Pagamento pelo Cockpit. O RPA respondeu, por
   WhatsApp, ao Bruno — duas falhas, e as duas eram do Cockpit:

     "Motivo do erro: Sem deal associado."   -> o negócio nascia sem contato
     "Motivo do erro: CNPJ inválido"         -> a porteira aceitava qualquer 14 dígitos

   MEDIDO no CRM antes de mexer, com leitura:
     Quintal da Vó (gerou Asaas) -> contato Veronica associado, criado 0,6s ANTES do negócio
     TORNIAMO      (gerou Asaas) -> contato Wilson Junior associado
     o criado pelo Cockpit       -> nenhum contato
   E Company NÃO é: nenhum dos dois que geraram Asaas tem uma. Eu ia consertar a associação
   errada e a medição me parou. */
(function () {
  const rotaCriar = fs.readFileSync(path.join(raiz, 'api', 'criar-negocio.js'), 'utf8');
  const rotaEtapa = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'), 'utf8');

  /* 1. O NEGÓCIO NASCE COM CONTATO — é isso que o RPA procura. */
  checar('a criação acha ou cria o contato',
    rotaCriar.indexOf('async function acharOuCriarContato(') > -1);
  checar('e a criação de fato chama isso (definir sem chamar é o defeito clássico)',
    rotaCriar.indexOf('await acharOuCriarContato(token, nome, telefone)') > -1);
  checar('a associação é deal_to_contact, que é o vínculo que faltava',
    rotaCriar.indexOf('/associations/contacts/') > -1
    && rotaCriar.indexOf('deal_to_contact') > -1);
  checar('acha antes de criar, para o mesmo restaurante não virar dois contatos',
    rotaCriar.indexOf("propertyName: 'phone', operator: 'EQ'") > -1);
  /* A FALHA NÃO PODE SUMIR: associação que falha em silêncio dá no mesmo que não existir,
     só que descoberta dias depois, por WhatsApp, na frente do cliente. */
  checar('a falha de associação volta no retorno da rota',
    rotaCriar.indexOf('contatoFalhou') > -1
    && rotaCriar.indexOf('contatoId, contatoCriado, contatoFalhou,') > -1);
  /* E NÃO PODE DERRUBAR A CRIAÇÃO: o negócio já existe e é válido sem o contato. */
  checar('o negócio não deixa de ser criado por causa do contato',
    rotaCriar.indexOf('contatoFalhou = ') > -1
    && rotaCriar.indexOf("throw new Error('contato") < 0);

  /* 2. O DÍGITO VERIFICADOR, NOS TRÊS LUGARES. */
  ['a tela', 'a rota de etapa', 'a rota de criação'].forEach(function (onde, i) {
    const fonte = [template, rotaEtapa, rotaCriar][i];
    checar(onde + ' confere o dígito verificador de CPF e CNPJ',
      fonte.indexOf('function cnpjEhValido(') > -1
      && fonte.indexOf('function cpfEhValido(') > -1
      && fonte.indexOf('function conferirCpfCnpj(') > -1);
    checar(onde + ' liga a conferência ao campo cnpj_cpf',
      fonte.indexOf("=== 'cnpj_cpf'") > -1 && fonte.indexOf('conferirCpfCnpj(') > -1);
  });

  /* CPF TAMBÉM VALE: a base tem os dois no mesmo campo (13157649701 é CPF de negócio real).
     Validar só CNPJ reprovaria metade da carteira. */
  checar('a conferência aceita CPF de 11 dígitos, não só CNPJ',
    template.indexOf('digitos.length === 11') > -1 && template.indexOf('cpfEhValido(digitos)') > -1);

  /* A FRASE DIZ QUANTO FALTA: o erro real do dia foi um zero a menos (13 dígitos), e
     "inválido" não ajuda quem tem o cliente na frente. */
  checar('a tela diz quantos dígitos faltam, em vez de só "inválido"',
    template.indexOf("'CPF tem 11 dígitos e CNPJ tem 14 — você digitou '") > -1);
})();

/* ══ E A CONFERÊNCIA RODA MESMO, contra números reais da base ═══════════════════════════
   A checagem de forma acima prova que o código existe. Esta prova que ele ACERTA — e é a
   que pegaria uma tabela de pesos trocada, que passa despercebida a olho. */
(function () {
  const i = template.indexOf('function cpfEhValido');
  const j = template.indexOf('const PROPS_SO_DIGITOS');
  if (i < 0 || j < 0 || j < i) { checar('acho a conferência no template para executá-la', false); return; }
  let conferir = null;
  try {
    // eslint-disable-next-line no-eval
    conferir = eval(template.slice(i, j) + ';conferirCpfCnpj');
  } catch (e) { checar('a conferência do template executa', false, String(e.message || e)); return; }

  /* OS VÁLIDOS SÃO DE NEGÓCIO REAL DO PIPELINE, lidos do CRM: dois CNPJ e dois CPF. */
  [['02858882000156', 'Quintal da Vó'], ['30388039000199', 'Gujorebar'],
   ['13157649701', 'Kokai (CPF)'], ['17509821886', 'Lá Dá Torta (CPF)']].forEach(function (par) {
    checar('aceita o documento real de ' + par[1], conferir(par[0]) === null, String(conferir(par[0])));
  });
  [['00000000000100', '14 dígitos que não fecham'], ['11111111111111', 'repetido'],
   ['57767203000124', 'um dígito trocado'], ['5776720300125', 'faltando um zero (13)']].forEach(function (par) {
    checar('recusa ' + par[1], conferir(par[0]) !== null);
  });
})();

/* ── resultado ──────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('kanban e etapas: ' + ok + ' checagens ok — escada, porteira, motivo, isenções, corte e conversão batendo nos três arquivos.');
