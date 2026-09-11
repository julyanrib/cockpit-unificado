/* ══════════════════════════════════════════════════════════════════════════════════════
   A ABA ROTAS & PROSPECÇÃO DO GESTOR — a prancha FINAL (11/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Regra de ouro do prompt: "nada entra sozinho — o gestor dispara a importação, por
   praça/executivo, quando o estoque pede". E a regra zero de sempre: nenhum clique morto,
   nenhum dado inventado.

   ESTA SUÍTE FOI REESCRITA COM A ABA. A versão anterior media o desenho de 06/09, cujos
   dois blocos a prancha FINAL não tem — e o prompt é explícito: "bloco fora da lista =
   deletar". O que saiu, nomeadamente, para ninguém achar que foi descuido:

     "1 · As praças" ....... TAM food por praça, % tocado, portas não batidas, a barra da
                             praça, o casamento praça↔município, a pré-escolha de praça e
                             de fonte, o "TAM não medido não vira zero". Eram 18 checagens.
                             O DADO CONTINUA NO BANCO (o job de segunda escreve), o que
                             saiu é o leitor. Fica anotado: o TAM por praça era a única
                             resposta do Cockpit para "onde a torneira rende mais", e hoje
                             nenhuma tela responde isso.
     "5 · O setor" ......... as manchetes da semana e o link para fora. Eram 4 checagens.
                             /api/novidades-mercado continua existindo.
     o fluxo de 3 passos ... praça → fonte → executivo, com rolagem até o passo 2. A
                             prancha FINAL começa na PESSOA: clico em quem está seco, a
                             fila é dele e o painel de disparo nasce nele.

   O QUE SOBREVIVEU vem reancorado abaixo, com o motivo de cada regra preservado — e o que
   a prancha pede e o dado não tem está checado como "diz que não sabe", nunca como zero.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const template = fs.readFileSync(T, 'utf8');
/* sem comentários: comentário citando um nome faz peça morta parecer viva, e regra citada
   num comentário não é regra no código */
const codigo = template.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

const falhas = [];
function checar(nome, condicao, porque) {
  if (condicao) { console.log('  ok  ' + nome); return; }
  falhas.push('  · ' + nome + (porque ? ': ' + porque : ''));
  console.log('  ✗   ' + nome);
}

/* o bloco da aba, fatiado: proibir um nome no arquivo inteiro reprova código correto de
   outras telas, e isso já me custou duas guardas cegas nesta semana */
const iRt = codigo.indexOf('const RT7_ESTADO = {');
const fRt = codigo.indexOf('const SM4_ESTADO');
const aba = (iRt > -1 && fRt > iRt) ? codigo.slice(iRt, fRt) : '';
if (!aba) {
  console.error('X não achei o bloco da aba Rotas (RT7_ESTADO → SM4_ESTADO).');
  console.error('  Guarda sem âncora mede o arquivo errado em silêncio — isto reprova de propósito.');
  process.exit(1);
}

console.log('\n── 1 · NADA ENTRA SOZINHO, E O GATILHO É POR PESSOA');

checar('a fila é de UM executivo, e o estado dela é um só',
  aba.indexOf('filaExec: null') > 0
    && /const filaOwner = s\.filaExec \|\| \(estoques\[0\]/.test(aba),
  'sem um estado só, o painel de estoque seleciona um e a fila mostra outro');

checar('o default é quem está mais seco',
  /const sa = a\.e\.semanas == null \? 999 : a\.e\.semanas;/.test(aba)
    && /return sa - sb \|\| a\.e\.contas - b\.e\.contas;/.test(aba),
  'abrir a aba em quem está bem esconde quem fica sem conta antes de sexta');

checar('e quem não foi medido não vira urgência',
  /if \(!isFinite\(c\) \|\| c <= 0\) return \{ contas: a\.parados, consumo: null, semanas: null \};/.test(aba)
    && aba.indexOf('consumo ?') > 0,
  'consumo zero daria estoque infinito ou urgência falsa — as duas mentem sobre a mesma pessoa');

/* VISTO NA PRODUÇÃO em 11/09/26: Kelly com 166 contas e 0,25 em rota por semana dava
   "≈ 664 sem" de estoque. A conta certa, a informação invertida — o problema dela não é
   estoque, é que ela quase não põe conta em rota. Acima de 8 semanas o rótulo troca de
   assunto, e o KPI diz quantos não têm consumo medido: "backlog seco 0" com 7 de 11 sem
   medida nenhuma é o zero que tranquiliza. */
checar('estoque absurdo vira leitura de consumo',
  /x\.e\.semanas > 8 \? \(.só . \+ Math\.round\(x\.e\.consumo \* 4\) \+ . em 4 sem.\)/.test(aba.replace(/'/g, '.')),
  '"≈ 664 sem" é um número certo que não ajuda ninguém a decidir nada');

checar('e o backlog seco declara quem não foi medido',
  /const semConsumo = estoques\.filter\(function \(x\) \{ return x\.e\.semanas == null; \}\)\.length;/.test(aba)
    && aba.indexOf('sem consumo medido') > 0
    && aba.indexOf('sem pôr conta em rota nas últimas 4 semanas') > 0,
  'ninguém aparece seco quando o consumo é zero — e aí a tela fica calada sobre munição parada');

console.log('\n── 2 · A FILA QUE A TELA MOSTRA É A FILA QUE O ESCRITOR ENVIA');

checar('existe UMA função de fila, e as duas pontas a chamam',
  /function rt7FilaDoExec\(ownerId, todas\)/.test(aba)
    && /const todasEle = rt7FilaDoExec\(filaOwner, true\);/.test(aba)
    && /rt7FilaDoExec\(u\.ownerId, !!s\.verTodas\)/.test(aba),
  'a tela mostrando 8 linhas e o botão mandando as 462 da munição inteira');

checar('o contador do botão conta as VISÍVEIS',
  /const visiveis = s\.verTodas \? todasEle : todasEle\.slice\(0, RT7_FILA_VISIVEL\);/.test(aba)
    && /const selN = visiveis\.filter/.test(aba),
  'contar o que não está na tela faz o gestor aprovar o que não viu');

/* O ANTI-SUJEIRA é medido no que ele DEVOLVE, não no texto que o explicava: as frases
   longas viviam no ramo `sujo`, que saiu com a lista suja. A regra é a mesma e está em
   rt7Sujeira — os três motivos de recusa e o filtro na fila. */
checar('o anti-sujeira continua entre a fonte e a fila',
  /function rt7Sujeira\(l\)/.test(aba)
    && /if \(!rt7Sujeira\(l\)\.ok\) return false;/.test(aba)
    && /tipo: .crm./.test(aba.replace(/'/g, '.'))
    && /tipo: .perdido./.test(aba.replace(/'/g, '.'))
    && /tipo: .semnome./.test(aba.replace(/'/g, '.'))
    && aba.indexOf('fora pelo anti-sujeira') > 0,
  'sem ele a tela reoferece quem já está no CRM e quem acabou de dizer não');

checar('a conta que já tem dono nasce DESMARCADA',
  /function rt7Marcado\(sel, l\)/.test(codigo)
    && aba.indexOf('rt7SemDono(l)') > 0,
  'marcar tudo por padrão, com a lista incluindo quem tem dono, faria UM clique tirar centenas de contas de outra pessoa');

checar('e o cartão diz de quem a conta é hoje',
  /dono: naRota \? .já na rota ✓./.test(aba.replace(/'/g, '.'))
    && /x\.orfa \? .de quem saiu — aprovar transfere./.test(aba.replace(/'/g, '.'))
    && /esc\(String\(rt7Nome\(l\.responsavel_owner_id\)/.test(aba),
  'transferir da carteira de alguém fica indistinguível de distribuir conta livre');

/* ══ A ORDEM DA FILA (11/09/26) ═══════════════════════════════════════════════════════
   Julyan: "na tela do luiz pimentel, tbm aparecer de munição os leads de nova iguaçu".
   MEDIDO: o Luiz tem 326 contas e 5 com nota. Ordenar só por score punha as 5 no topo e
   as 39 de Nova Iguaçu — a praça que ele passou a cobrir naquele dia — fora das 8
   visíveis. Com 85% da base sem nota, ordenar por score é ordenar por fonte. */
checar('a fila põe a praça que ele cobre hoje na frente',
  /function rt7CidadesDoRep\(ownerId\)/.test(aba)
    && /if \(a\.praca !== b\.praca\) return a\.praca \? -1 : 1;/.test(aba)
    && /return b\.quando - a\.quando;/.test(aba)
    && aba.indexOf('a praça que ele cobre hoje primeiro, depois score, depois as mais novas') > 0,
  'com 85% da base sem nota, ordenar só por score esconde a praça que ele vai visitar');

checar('e a praça sai da MESMA declaração que roteia o import',
  /\(DATA\.territorios \|\| \[\]\)\.filter\(function \(x\) \{[\s\S]{0,200}?String\(x\.rep \|\| ..\) === String\(u\.nome \|\| ..\)/
    .test(aba.replace(/'/g, '.')),
  'segunda lista de cidades divergiria de data/territorios.json em silêncio, como já divergiu em 09/09');

checar('a conta sem dono ativo entra na fila de quem você escolheu',
  /const levaOrfas = String\(RT7_ESTADO\.orfaoDono \|\| ..\) === k;/.test(aba.replace(/'/g, '.'))
    && /return levaOrfas && \(!dono \|\| !ativos\[dono\]\);/.test(aba),
  'o card de território prometia "a transferência se faz na fila dele" e a fila filtrava por dono — a promessa não tinha caminho');

console.log('\n── 3 · O QUE A PRANCHA PEDE E O DADO NÃO TEM');

checar('score sem nota é "—", não um número inventado',
  /score: x\.sc == null \? .—. : String\(x\.sc\)/.test(aba.replace(/'/g, '.'))
    && aba.indexOf('sem nota na base') > 0,
  'os 1.677 leads da Casa dos Dados chegam sem nota; um score ali seria opinião com cara de dado');

checar('o check-in do Expogo aparece como não medido, nunca como zero',
  /cump: .não medido.,/.test(aba.replace(/'/g, '.'))
    && aba.indexOf('check-in do Expogo fora do snapshot') > 0,
  'zero aqui acusaria o time de não ter ido à rua quando o que falta é a medida');

checar('os chips do radar saem da ficha, e não de review que ninguém coleta',
  /function rt7SinaisDoLead\(l\)/.test(aba)
    && aba.indexOf('mil avaliações') > 0
    && aba.indexOf('sinais de dor por review') > 0,
  '"fila constante" a partir de nota alta é escrever opinião com cara de dado');

checar('a busca é por MUNICÍPIO, e a tela chama isso pelo nome',
  aba.indexOf('cidades do território dele') > 0
    && /body: JSON\.stringify\(\{ municipio: municipio, quantidade: qtd \}\)/.test(aba),
  'oferecer bairro seria um chip que não muda o resultado da busca');

checar('fonte apagada nunca dispara busca, e diz por quê no clique',
  /const fonte = RT7_FONTES\.filter\(function \(f\) \{ return f\.ativa; \}\)\[0\];/.test(aba)
    && /verbo === .fonteoff./.test(aba.replace(/'/g, '.'))
    && /f\.porque/.test(aba),
  'chip apagado que dispara gasta consulta paga e devolve erro');

console.log('\n── 4 · TODA AÇÃO EXECUTA, DIZ O EFEITO E NÃO INVENTA CANAL');

checar('o disparo exige cidade e avisa que é consulta paga',
  aba.indexOf('escolha pelo menos uma cidade antes de disparar') > 0
    && aba.indexOf('cada uma é uma busca paga') > 0,
  'disparar sem escolha gasta crédito do Julyan sem decisão dele');

checar('aprovar marca para a RUA e guarda o estado de antes',
  /\.update\(\{ status: .na_rota., responsavel_owner_id: String\(u\.ownerId\)/.test(aba.replace(/'/g, '.'))
    && /const voltar = escolhidos\.map/.test(aba),
  'sem o estado de antes, o desfazer devolve todas as contas para o mesmo dono');

checar('e continua exigindo a linha de volta do banco',
  aba.indexOf('o banco aceitou o pedido e não mudou nenhuma linha') > 0
    && /\.select\(.id.\);/.test(aba.replace(/'/g, '.')),
  '"sem erro" não é "gravou": o update que a RLS recusa volta com sucesso e zero linhas');

checar('as ações da rua usam os escritores que já existiam',
  /await tl5Alternar\(verbo === .case. \? .boa_pratica. : .cobranca_rota./.test(aba.replace(/'/g, '.'))
    && /\.update\(\{ status: .na_rota., data_rota: seg/.test(aba.replace(/'/g, '.'))
    && !/from\(.daily_pauta.\)/.test(aba.replace(/'/g, '.')),
  'tabela nova para a mesma pauta faz o registro desta tela não existir na Daily nem na Semana');

checar('e o rótulo promete só o que acontece de verdade',
  aba.indexOf('na sua pauta') > 0
    && aba.indexOf('no Planejamento dele') > 0
    && aba.indexOf('aviso na tela Hoje') === -1,
  'nenhuma tela do executivo lê pauta_do_lider — prometer aviso a ele seria promessa falsa');

checar('a chave da pauta é por ação E por pessoa',
  /.rotas:. \+ chave/.test(aba.replace(/'/g, '.'))
    && /const chave = verbo \+ .:. \+ ownerId;/.test(aba.replace(/'/g, '.')),
  'uma chave só faria o segundo clique num executivo desligar a pauta de outro');

console.log('\n── 5 · O REGISTRO DA SESSÃO, COM DESFAZER ONDE HÁ VOLTA');

checar('o desfazer só aparece onde existe volta real',
  /desfazer: c\.desfazivel \? \(.desfazer:. \+ k\) : ..,/.test(aba.replace(/'/g, '.'))
    && /desfazivel: false, porque: .busca já paga/.test(aba.replace(/'/g, '.')),
  'um ✕ que não reverte nada é pior que nenhum ✕');

checar('e o desfazer da aprovação devolve cada conta ao dono e ao status DELA',
  /for \(let k = 0; k < c\.voltar\.length; k\+\+\)/.test(aba)
    && /update\(\{ responsavel_owner_id: v\.dono, status: v\.status/.test(aba),
  'um update em lote devolveria todas para o mesmo dono — o desfazer viraria a segunda bagunça');

checar('o estado do botão da rua e o registro são a MESMA coisa',
  /function rt7Feito\(chave\)/.test(aba)
    && /return \(RT7_ESTADO\.cargas \|\| \[\]\)\.some\(function \(c\) \{ return c && c\.chave === chave; \}\);/.test(aba),
  'dois mapas de estado discordariam no desfazer, e o botão ficaria ✓ sobre uma ação desfeita');

console.log('\n── 6 · NENHUM CLIQUE MORTO, NENHUM RAMO MORTO');

/* A checagem que sobreviveu inteira da versão anterior, e a mais barata de todas: todo
   verbo emitido no markup é tratado, e todo verbo tratado é emitido em algum lugar. */
(function () {
  const iT = codigo.indexOf('function rt7TelaHTML(d)');
  const fT = codigo.indexOf('async function rt7Executar');
  const iE = fT;
  const fE = codigo.indexOf('function renderRotasProspeccao');
  if (iT < 0 || fT < 0 || fE < 0) {
    falhas.push('  · não achei rt7TelaHTML/rt7Executar — a varredura de verbos perdeu a âncora');
    console.log('  ✗   os verbos emitidos e tratados');
    return;
  }
  const tela = codigo.slice(iT, fT);
  const exec = codigo.slice(iE, fE);
  /* os verbos emitidos vêm do PROVEDOR (é ele que monta as strings de ação) */
  const prov = codigo.slice(codigo.indexOf('function rt7Dados()'), iT);
  /* NEM TODO `'x:' + y` É VERBO DE CLIQUE. Dois viajam no mesmo formato e não são ação:
     `chave:` (a identidade da linha no registro da sessão) e a chave de tela passada a
     tl5Alternar. A primeira versão desta varredura acusou os dois como clique morto — e
     um falso positivo aqui me faria "consertar" código correto. */
  const emitidos = [...new Set(prov.split('\n')
    .filter(function (l) { return l.indexOf('chave:') < 0 && l.indexOf('tl5Alternar') < 0; })
    .join('\n').match(/'([a-z]+):' \+/g) || [])]
    .map(function (s) { return s.replace(/'/g, '').replace(': +', '').trim(); })
    .concat(['vertodas', 'aprovar', 'aprovarbloq', 'impfechar', 'impdisparar', 'log']);
  const tratados = [...new Set((exec.match(/verbo === '([a-z]+)'/g) || [])
    .map(function (s) { return s.replace(/verbo === '/, '').replace(/'$/, ''); }))];
  const semTrato = emitidos.filter(function (v) { return tratados.indexOf(v) < 0; });
  const semEmissor = tratados.filter(function (v) { return emitidos.indexOf(v) < 0; });
  checar('todo verbo emitido é tratado, e todo verbo tratado é emitido',
    semTrato.length === 0 && semEmissor.length === 0,
    (semTrato.length ? 'emitido e não tratado (clique morto): ' + semTrato.join(', ') + '. ' : '')
      + (semEmissor.length ? 'tratado e não emitido (ramo morto): ' + semEmissor.join(', ') : ''));
}());

checar('o botão desabilitado TAMBÉM responde, dizendo o que falta',
  /aprovarLote: selN > 0 \? .aprovar. : .aprovarbloq./.test(aba.replace(/'/g, '.'))
    && aba.indexOf('marque ao menos uma conta da fila') > 0,
  'botão cinza que não diz nada é clique morto com aparência de proibição');

checar('e o nome do executivo abre a fila dele',
  /ver: .verfila:. \+ x\.u\.ownerId/.test(aba.replace(/'/g, '.')),
  'nome que não abre nada é o gestor lendo uma lista sem saber que ela responde');

console.log('\n── 7 · O TERRITÓRIO ÓRFÃO É MEDIDO, NÃO ESCRITO À MÃO');

checar('o órfão sai do cruzamento de território declarado com rep ativo',
  /function rt7Orfao\(\)/.test(aba)
    && /const cobertaPorAtivo = \(DATA\.territorios \|\| \[\]\)\.some/.test(aba),
  'texto fixo no card mente no dia em que alguém assume a praça');

checar('e as contas paradas são as de dono que não está mais no cockpit',
  /if \(ativos\[k\]\) return;/.test(aba)
    && /paradas \+= 1;/.test(aba),
  'medido em 11/09: 151 contas de Vitória seguem no nome de quem saiu do campo');

checar('sem órfão, o card diz isso em verde em vez de desaparecer',
  aba.indexOf('Nenhum território sem dono ✓') > 0
    && /orfaoTem: orfaoTem,/.test(aba),
  'card que some não prova que o problema acabou');

checar('e a decisão do território registra o caminho, não finge que moveu',
  aba.indexOf('a transferência das ') > 0
    && aba.indexOf('se faz na fila dele, com confirmação') > 0,
  'mover contas de dono é transferência de carteira, e ela tem o gesto dela');

console.log('\n── 8 · SÓ O GESTOR, E SÓ UMA ABA');

checar('só o gestor desenha esta aba',
  /function renderRotasProspeccao\(\) \{[\s\S]{0,400}?sessaoAtual\.role !== .manager.\) \{ raiz\.innerHTML = ../
    .test(codigo.replace(/'/g, '.')),
  'a view é compartilhada com a hero de rotas do executivo — sem a porteira ele vê a tela do gestor');

checar('e o bloco antigo é escondido por quem desenha a aba',
  /const antigo = document\.getElementById\('rotasAntigo'\);/.test(codigo)
    && /if \(antigo\) antigo\.style\.display = 'none';/.test(codigo),
  'há três caminhos que chegam nesta aba sem passar pelo ouvinte do botão; por eles o gestor via 222px de tela de outra pessoa');

checar('uma leitura só na abertura da aba',
  /await rt7Carregar\(\);/.test(aba)
    && aba.indexOf('rt7CarregarRadar') === -1,
  'consulta cujo resultado ninguém lê é trabalho jogado fora em toda abertura');

/* ── resultado ──────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(function (f) { console.error(f); });
  process.exit(1);
}
console.log('\nrotas & prospecção (prancha FINAL): nada entra sozinho, a fila da tela é a fila que grava,'
  + ' o que não é medido diz que não é, e nenhum clique é morto.');
