#!/usr/bin/env node
/* ============================================================================
   PROPOSTAS — A PEÇA QUE O DONO DO RESTAURANTE RECEBE (05/09/26)

   POR QUE ESTA SUÍTE NASCE AGORA: a aba já existia inteira — gerador em 5 passos,
   PNG, WhatsApp, objeções — e não tinha nenhuma trava. Ela é a única tela do Cockpit
   cujo resultado SAI da empresa: o que estiver errado aqui chega no cliente como
   documento comercial, não como bug de tela.

   O QUE ELA NÃO FAZ: medir layout. As regras abaixo são de CONTEÚDO e de FONTE —
   sobrevivem a qualquer repaginação, inclusive à próxima.
   ============================================================================ */

const fs = require('fs');
const { mascararComentarios } = require('./mascarar.js');
const path = require('path');

const raiz = path.join(__dirname, '..');
const NL = String.fromCharCode(10);
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const preco = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'precificacao.json'), 'utf8'));

let ok = 0;
/* estado que as funções do fecho leem, para poderem ser executadas aqui (checagem 15) */
const sandbox = { passo: { dias: null, hora: null, escolhido: null } };
const falhas = [];
const checar = (nome, cond, detalhe) => { if (cond) { ok++; return; } falhas.push(nome + (detalhe ? ' — ' + detalhe : '')); };

/* ── 1. O PREÇO SAI DA TABELA, NUNCA DO TEMPLATE ─────────────────────────────────
   É a regra que sustenta todas as outras: se um valor de plano estiver escrito no
   template, o dia em que a tabela mudar a proposta do cliente continua com o antigo —
   e ninguém descobre por uma tela quebrada, descobre por um contrato errado. */
(function () {
  /* SEM COMENTÁRIOS: a primeira versão desta checagem reprovou três linhas que eram
     COMENTÁRIO explicando um caso de layout ("numa coluna estreita 'R$ 299 R$ 239/mês'
     estoura") — uma delas escrita por mim, no commit anterior. Guarda que mede comentário
     reprova quem documenta e passa quem crava o número no meio do código. */
  const codigo = template.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => l.trim().indexOf('//') !== 0).join('\n');
  const valores = [];
  preco.tipos.forEach(t => t.planos.forEach(p => { if (p.preco) valores.push(Number(p.preco)); }));
  preco.adicionais.forEach(a => { if (a.preco) valores.push(Number(a.preco)); });
  const distintos = [...new Set(valores)];
  /* PREÇO CRAVADO = PREÇO DENTRO DE STRING. Duas passagens antes desta reprovaram
     comentário: primeiro os blocos /* *​/ (que eu passei a remover) e depois uma linha de
     comentário que o removedor não alcançou, porque há template literal com /* no arquivo
     e isso dessincroniza qualquer stripper simples.
     A regra certa não depende de remover comentário: o que chega na tela do cliente está
     dentro de uma string. Então só conta o "R$ N" que tem abre-aspas antes dele na mesma
     linha — que é exatamente a forma dos dois casos reais que esta suíte pegou
     ("minimo: 'Básico + adicional Totem (R$ 299/mês)'"). */
  const linhas = codigo.split('\n');
  const emString = v => linhas.some(l => {
    const k = l.indexOf('R$ ' + v);
    if (k < 0) return false;
    const antes = l.slice(0, k);
    return /['"`]/.test(antes);
  });
  const cravados = distintos.filter(emString);
  checar('nenhum preço de plano está cravado no template',
    cravados.length === 0,
    'achei ' + cravados.map(v => 'R$ ' + v).join(', ') + ' escrito(s) na tela — o preço mora em data/precificacao.json');
  checar('e a tabela tem os planos para serem lidos', distintos.length >= 4);
})();

/* ── 2. O DOCUMENTO DIZ O NOME COMERCIAL, NÃO A NOSSA ABREVIAÇÃO ─────────────────
   `rotuloOficial` é "Completo"/"Delivery": o rótulo curto do botão, feito para caber
   num segmented de duas colunas. O produto se chama "Delivery, Balcão e Mesas". O
   cabeçalho usava o rótulo curto, e o dono recebia um documento dizendo "COMPLETO". */
/* REESCRITA EM 12/09/26 (repaginação): a checagem exigia a expressão exata
   `tipo.nome || tipo.rotuloOficial` dentro do documento. No cartão novo o cabeçalho é
   `esc(String(tipo.nome))` — sem fallback, porque a tabela oficial sempre tem nome. A
   intenção é a que fica: o cartão que sai da empresa diz o nome do PRODUTO, e o rótulo
   curto ("COMPLETO") existe só no botão, onde ele cabe. */
(function () {
  const i = template.indexOf('function prcCartaoHTML()');
  const f = template.indexOf(NL + '}', i);
  const cartao = i > -1 && f > i ? template.slice(i, f) : '';
  checar('o cartão usa o nome comercial da operação, não o rótulo curto',
    cartao.indexOf('esc(String(tipo.nome))') > -1 && cartao.indexOf('rotuloOficial') === -1,
    'com rotuloOficial no cartão, a peça que sai da empresa diz "COMPLETO" em vez do nome do produto');
  checar('e o botão de operação continua com o rótulo curto',
    /const curto = \(tp\.rotuloOficial \|\| tp\.nome\)\.split\(',',?\)\[0\]/.test(template),
    'o nome inteiro não cabe num segmented de duas colunas — foi por isso que o curto existe');
}());

/* ── 3. QUEM RECEBE E QUEM ASSINA, NA MESMA LINHA ────────────────────────────────── */
/* A classe .p4-doc-para não existe mais (o cartão é estilo inline, copiado da
   prancha). A regra é a mesma: as duas coisas na mesma linha, e o "preparada por" só
   aparece quando a sessão tem nome — nunca "preparada por Equipe Takeat". */
checar('o cartão diz para quem é e quem preparou',
  template.indexOf('para ${esc(cliente)}${executivo ? \' · preparada por \' + esc(executivo) : \'\'}') > -1);

/* ── 4. O RODAPÉ: O PASSO COMBINADO E O QUE A TAKEAT ENTREGA ─────────────────────
   O passo é a única frase da proposta que o dono vai COBRAR do executivo — ela estava
   no meio do selo de validade, em caixa alta de 9px, junto com o ano. E a linha de
   entrega responde "e depois que eu assino?" antes de ele perguntar: é a única parte
   da peça que fala de serviço em vez de funcionalidade. */
/* As três continuam medindo o mesmo rodapé; o que mudou são as palavras, que agora são
   as da prancha ("treinamento incluso · suporte humano 7 dias/semana" em vez de
   "treinamento da equipe incluso · suporte humano 7 dias por semana") e o selo, que
   passou a dizer a DATA de validade em vez do número de dias — é a data que o dono
   confere. O próximo passo continua em linha própria, fora do selo. */
checar('o próximo passo tem linha própria no cartão',
  /Próximo passo combinado: \$\{esc\(passo\.dia/.test(template)
  && /fechamento marcado, não pedido/.test(template),
  'dentro do selo de validade ele vira letra miúda');
checar('o cartão promete a implantação assistida, o treinamento e o suporte',
  /implantação assistida por 30 dias/.test(template)
  && /treinamento incluso/.test(template)
  && /suporte humano 7 dias\/semana/.test(template),
  'é a única parte da peça que fala de serviço em vez de funcionalidade');
checar('e o selo de validade ficou só com validade e ano',
  /proposta válida até \$\{esc\(prcDataValidade\(\)\)\} · takeat \$\{new Date\(\)\.getFullYear\(\)\}/.test(template)
  && template.indexOf('· PRÓXIMO PASSO: ${diaPasso}') < 0);
/* A VALIDADE É TERMO COMERCIAL E VEM DA TABELA — nunca de um literal na tela. */
checar('a validade sai de precificacao.json, não do template',
  template.indexOf('precificacaoCache.validadeDias') > -1
  && !/VÁLIDA POR [0-9]/.test(template),
  'validade cravada é promessa ao cliente que ninguém revisa junto com a tabela');

/* ── 5. O MENSAL NÃO TEM TOTAL, E DIZ COMO SE PAGA ───────────────────────────────
   "Total: R$ 549,00" no mensal repete o número que está logo acima em corpo 28, e um
   "total" num plano sem prazo sugere compromisso que não existe. */
checar('o total aparece só em período parcelado',
  /\$\{per\.meses > 1 \? 'Total: ' \+ prcMoedaCentavos\(c\.total\) : 'preço de tabela, por mês'\}/.test(template),
  '"Total: R$ 549,00" no mensal repete o número que está logo acima em corpo 26');
/* O ▭ saiu da string e virou prefixo no markup (é assim na prancha), então as duas
   checagens medem a frase sem ele — e uma terceira garante que o símbolo continua lá. */
checar('o mensal diz boleto ou cartão, e sem fidelidade',
  template.indexOf("'no boleto ou cartão · sem fidelidade'") > -1);
checar('e o parcelado continua dizendo cartão de crédito',
  template.indexOf("'no cartão de crédito'") > -1);
checar('a forma de pagamento continua marcada com o ▭ da prancha',
  /▭ \$\{nParcelas > 1/.test(template));

/* ── 6. TODO PERÍODO COM DESCONTO MOSTRA O DESCONTO ──────────────────────────────
   O selo ficava só no de maior desconto. Quem escolhe período compara os três; ver
   −10% e −15% é o que faz o de 12 meses parecer o que ele é. */
/* A classe .p4-selo não existe mais; o selo é o pill verde inline da prancha. A regra
   é a mesma: ele aparece em TODO período com desconto, e não só no de maior desconto —
   quem escolhe compara os três, e ver −10% e −15% é o que faz o de 12 meses parecer o
   que ele é. */
checar('o selo aparece em todo período com desconto',
  /\$\{per\.desconto \? `<span style="[^"]*background:#1E9E7B[^"]*">−\$\{per\.desconto\}%<\/span>`/.test(template));
checar('e a nota diz quanto economiza no período',
  /economiza ' \+ prcMoeda\(c\.economia\) \+ '\/período'/.test(template));
/* FRAÇÃO PEQUENA NÃO VIRA "MÊS GRÁTIS": o trimestral dá 0,3 mês, e chamar isso de
   fração de mês grátis soa a truque na frente do dono.
   ESTA CHECAGEM JÁ ME REPROVOU UMA VEZ, COM RAZÃO: ela prendia em per.id ===
   'trimestral', e no dia em que entrou 'trimestral-parcelado' o cartão novo passou a
   anunciar "≈ 0,3 mês grátis" — a regra estava presa ao NOME e o nome mudou. Agora ela
   mede o corte numérico, que é o que a regra sempre quis dizer. */
/* A checagem procurava a palavra "truque" perto do corte, porque era assim que o
   comentário justificava o piso. O comentário foi reescrito na repaginação; o que ela
   tem de garantir é que o corte exista e saia do NÚMERO — nunca do id do período, que
   foi o defeito de 05/09 (entrou 'trimestral-parcelado' e o cartão novo passou a
   anunciar "≈ 0,3 mês grátis"). */
checar('a fração de mês grátis tem piso, e ele sai do número',
  /meses < 0\.5/.test(template)
  && !/per\.id === 'trimestral'/.test(template),
  'preso ao id do período, o corte não alcança um período novo com o mesmo prazo');

/* ── 7. A OPERAÇÃO DIZ O QUE ELA É ──────────────────────────────────────────────
   O botão lia "COMPLETO" e, embaixo, "Completo": duas linhas para a mesma palavra,
   no lugar da única informação que faz o dono escolher junto. */
checar('a segunda linha da operação é legenda, não o rótulo repetido',
  template.indexOf("${tp.id === 'mesas' ? 'salão + delivery + caixa' : 'só operação de entrega'}") > -1
  && template.indexOf('${esc(curto)}<span>${esc(tp.rotuloOficial || tp.nome)}</span>') < 0);

/* ── 8. A MENSAGEM QUE VAI JUNTO ────────────────────────────────────────────────
   O PNG não viaja sozinho: o WhatsApp leva imagem + texto, e o texto é o que faz o
   dono abrir a imagem. Ele já existia e não aparecia em lugar nenhum antes de enviar —
   o executivo mandava para o cliente uma frase que ele nunca tinha lido. */
/* O rótulo deixou de ser caixa alta no markup (a prancha escreve "Mensagem que vai
   junto" e o text-transform faz o resto), então a checagem mede o texto, não a caixa. */
checar('a mensagem que acompanha o PNG é mostrada',
  template.indexOf('id="prcMensagemJunto"') > -1
  && /Mensagem que vai junto/i.test(template));
checar('e ela é a MESMA função que o CTA envia',
  template.indexOf('${esc(textoPropostaPrecificacao())}') > -1,
  'um segundo texto aqui faria a prévia mostrar uma frase e o WhatsApp levar outra');
checar('ela se atualiza a cada clique, e não congela no primeiro estado',
  template.indexOf("const msgJunto = document.getElementById('prcMensagemJunto');") > -1
  && template.indexOf('corpo.textContent = textoPropostaPrecificacao();') > -1,
  'ela vive FORA do #precificacaoPreview, então o innerHTML da prévia não a alcança');
/* FORA DA PEÇA, E SÓ DO EXECUTIVO. Dentro do cartão ela pareceria parte do documento
   que o dono recebe; no modo cliente ela não pode existir. A checagem media ORDEM no
   arquivo, e reprovou quando a mensagem mudou de coluna — ordem de código não é lugar
   na tela. Agora mede as duas regras de verdade. */
/* DUAS METADES (12/09/26). A primeira sempre esteve aqui: dentro do cartao a mensagem
   viraria parte do documento que o dono recebe — e do PNG. A segunda custou a tela do
   Julyan: mesmo FORA do cartao, na mesma COLUNA ela tira altura da peca, porque as duas
   dividem os mesmos pixels verticais. MEDIDO a 1534x746 (notebook com Windows a 125%):
   com ela embaixo do cartao o palco tinha 299px para uma peca de 687 e a escala caia
   para 0,43 (cartao de 185x295); com ela na coluna da esquerda, 521px de palco, escala
   0,75 e cartao de 324x517 — tres vezes a area. */
checar('a mensagem nao mora na coluna da peca (nem dentro do cartao)', (function () {
  const i = template.indexOf('function prcCartaoHTML()');
  const f = template.indexOf(NL + '}', i);
  const foraDoCartao = i > -1 && f > i && template.slice(i, f).indexOf('prcMensagemJunto') === -1;
  /* e fora da coluna da peca: o trecho entre <div class="p4-peca"> e o fim dela */
  const ip = template.indexOf('<div class="p4-peca">');
  const fp = template.indexOf('</div>' + NL + '    </div>', ip);
  const foraDaColuna = ip > -1 && fp > ip && template.slice(ip, fp).indexOf('prcMensagemJunto') === -1;
  return foraDoCartao && foraDaColuna;
}()),
  'dentro do cartao ela vira parte do que o dono recebe; na coluna do cartao ela come a '
    + 'altura da peca — 299px de palco em vez de 521, e o cartao cai para 0,43 de escala');
checar('e ela some quando a tela vira para o cliente',
  template.indexOf("${prcModoCliente ? '' : prcMensagemJuntoHTML()}") > -1,
  'é o texto que o executivo manda, não parte da proposta que o dono lê');

/* Os cinco chips do handoff, pelo que o DONO diz — não pelo nome da função que os
   desenha. É o texto que tem de continuar na tela, mude o desenho que mudar. */
const PRC_CHIPS = ['está caro', 'já tenho sistema', 'meu cliente é tradicional',
  'meu restaurante é pequeno', 'e se a internet cair'];

/* ── 9. O QUE JÁ EXISTIA E NÃO PODE SUMIR ───────────────────────────────────────
   Estas quatro são as ações que fazem a aba valer: sem elas o gerador é um desenho. */
['function abrirWhatsappProposta', 'function baixarPropostaPrecificacao',
  'function copiarTextoProposta', 'function gerarBlobPropostaPrecificacao'].forEach(fn => {
  checar('continua existindo: ' + fn.replace('function ', ''), template.indexOf(fn) > -1);
});
/* AS OBJEÇÕES JÁ MUDARAM DE CASA DUAS VEZES (bloco na coluna -> botão flutuante na barra
   -> caixa âmbar no pé da coluna, com resposta inline). Estas checagens ficaram cravadas
   no nome do botão na primeira mudança e me reprovaram na segunda — de novo. Agora medem
   as três regras que sobrevivem a qualquer desenho:
     1. as cinco objeções são do EXECUTIVO e somem quando a tela vira para o cliente;
     2. abrir a resposta não empurra a coluna (teto de altura + rolagem própria);
     3. a resposta e a âncora do playbook saem do MESMO bloco — uma regra, um lugar. */
checar('as cinco objeções existem e são só do executivo',
  PRC_CHIPS.every(c => template.indexOf(c) > -1)
  && template.indexOf("${prcModoCliente ? '' : prcCaixaObjecoesHTML()}") > -1,
  'no modo cliente elas têm de sumir — é a resposta às objeções DELE, virada para ele');
checar('abrir a resposta não empurra a coluna',
  /\.p4-so-voce-resp\{[^}]*max-height:\d+px/.test(template)
  && /\.p4-so-voce-resp\{[^}]*overflow-y:auto/.test(template),
  'sem teto de altura, a resposta mais longa empurra os cinco passos e a rolagem volta');
checar('a resposta e a âncora saem do mesmo bloco do playbook',
  template.indexOf('function prcBlocoObjecao(') > -1
  && /function prcAncoraObjecao\([\s\S]{0,160}prcBlocoObjecao\(/.test(template),
  'duas buscas separadas divergem em silêncio — foi assim que a âncora devolveu null nas cinco');
/* O AVISO DA DOR NÃO FOI JUNTO: "o plano na tela não cobre X" é aviso sobre a proposta
   montada agora, não resposta a objeção — atrás de um botão ele deixa de ser aviso. */
checar('o aviso da dor continua visível na coluna',
  template.indexOf("${prcModoCliente ? '' : prcBlocoDorHTML()}") > -1);

/* ── 10. O PALCO — as três coisas que quebraram na tela do Julyan ────────────────
   Ele abriu a aba e viu duas: a peça pequena no meio de um palco largo, e o modo
   cliente com uma faixa preta de 397px empurrando o cartão para baixo da tela. */

/* ══ A PRÉVIA E O PNG SÃO O MESMO NÓ (12/09/26) ══════════════════════════════════
   A checagem anterior media a PROPORÇÃO: a peça era desenhada na razão 4:5 do PNG para
   que a prévia tivesse a forma da imagem enviada. Ela existia porque havia DOIS
   desenhos da mesma peça — o HTML da tela e um pintor de canvas de 1080x1350 —, e a
   proporção era a única coisa que dava para conferir entre eles.

   A repaginação mata a causa: o PNG virou uma FOTO do nó da prévia (html2canvas), e o
   pintor saiu. Não há mais proporção para conferir — há uma coisa só. A guarda passa a
   prender exatamente isso, que é mais forte do que o que ela media antes. */
checar('o PNG é a foto do MESMO nó que a prévia mostra',
  /const node = document\.getElementById\('cartao-proposta'\);/.test(template)
  && /const clone = node\.cloneNode\(true\);/.test(template)
  /* O NOME APARECE NO COMENTARIO QUE EXPLICA A REMOCAO (12/09/26): a primeira versao
     desta checagem procurava a string e reprovou por causa da propria prosa que
     documenta a saida do pintor. Guarda que le codigo tem de medir CODIGO — aqui, a
     ATRIBUICAO que criava o pintor, e nao a mencao ao nome dele. */
  && template.indexOf('window.TakeatPropostaPNG = {') === -1
  && template.indexOf('function prcDadosDaPeca(') === -1,
  'com um segundo desenho da peça (o pintor de canvas), o que o dono recebe diverge do '
    + 'que o executivo conferiu na tela — e a divergência só aparece depois de enviada');
checar('e a captura é a 430px, sem o transform da prévia, em scale 3',
  /clone\.style\.transform = 'none';/.test(template)
  && /clone\.style\.width = '430px';/.test(template)
  && /html2canvas\(clone, \{ scale: 3/.test(template),
  'capturar o nó com transform rasteriza o tamanho escalado e sai borrado; sem scale 3 '
    + 'chega pixelado no celular do dono');
/* O cartão continua ABSOLUTO e centrado no palco — devolvê-lo ao fluxo empurrava a
   grade com 900px de peça. Agora a posição é inline (é o nó que o PNG fotografa), e o
   que a folha guarda é só a origem do transform. */
checar('o cartão do palco continua absoluto e centrado',
  /id="cartao-proposta" style="position:absolute;top:50%;left:50%;width:430px/.test(template)
  && /\.p4-palco > #cartao-proposta\{transform-origin:center center;\}/.test(template),
  'no fluxo, a peça de ~700px empurra a grade e a aba volta a rolar');
checar('o cartão existe UMA vez no DOM, e o overlay não redigita uma segunda versão',
  /\$\{prcModoCliente \? '' : `<div id="cartao-proposta"/.test(template)
  && (template.match(/id="cartao-proposta"/g) || []).length === 2
  && (template.match(/prcCartaoHTML\(\)/g) || []).length >= 3,
  'foi uma segunda versão redigitada que fez o cartão sair "parecido mas não igual" — '
    + 'o handoff proíbe isso em letra maiúscula');

/* Grade sem template de linhas divide a SOBRA entre as fileiras automáticas. Fora do
   modo cliente não há sobra e ninguém vê; com os controles escondidos, a barra de
   voltar vira uma faixa de 397px. */
checar('a casca diz quais fileiras crescem',
  /#viewPrecificacao\.active \.prc-shell\{[^}]*grid-template-rows:auto minmax\(0,1fr\)/.test(template),
  'sem template, a barra de voltar divide a tela com a peça no modo cliente');

/* ── 11. O TEXTO CORTADO ─────────────────────────────────────────────────────────
   Medido no print do Julyan: no arranjo de duas colunas o passo 2 recebia uma célula
   de 335px e cada cartão de plano ficava com 68px — "Profissional" transbordava 39px,
   "R$ 549" 32px, "14 funcionalidades" 32px. Dividir a largura não cria espaço: troca
   altura por corte. Estas duas travam o par de regras que resolve. */
checar('os cinco passos ficam num cartão só, na largura inteira',
  /\.p4-controles\{display:flex;flex-direction:column/.test(template),
  'em duas colunas o cartão de plano fica com 68px e o nome do plano corta');
/* As grades de plano e período agora são inline (a prancha), então a checagem mede o
   par que resolve o corte onde ele está: quatro trilhas com piso ZERO e min-width:0 no
   cartão. Sem esse par, dividir a largura não cria espaço — troca altura por corte. */
checar('planos e períodos em 4 colunas que podem encolher',
  (template.match(/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/g) || []).length >= 2
  && (template.match(/cursor:pointer;min-width:0;">/g) || []).length >= 2,
  'minmax(0,1fr) e min-width:0 são o par que deixa o cartão encolher em vez de cortar');

/* ── 15. O CHIP DO PRÓXIMO PASSO LEVA A UM PASSO VÁLIDO ──────────────────────────
   ESTA CHECAGEM NASCEU DE UM DEFEITO QUE ESTAVA EM PRODUÇÃO (06/09/26), achado clicando
   na tela do gestor, não lendo código:
     antes do clique   dias=1    -> próximo passo "Amanhã, 15h", chip aceso
     depois do clique  dias=NaN  -> próximo passo "Invalid Date", chip apagado
   Clicar no chip QUEBRAVA o passo que já estava certo — e "Invalid Date" é o texto que a
   mensagem do WhatsApp e o PNG da proposta leem. A causa: dois ligadores para o mesmo
   atributo, e um deles fazia split("|") num id que nunca teve "|".

   Por que ela EXECUTA em vez de procurar texto: o código quebrado era sintaticamente
   perfeito e citava todos os nomes certos. Só rodando dá para ver o NaN. */
(function () {
  /* tira as quatro funções do template e roda de verdade. Se alguma sumir ou mudar de
     nome, isto reprova — e reprovar é o certo: elas são a regra do fecho. */
  const pegar = nome => {
    const i = template.indexOf('function ' + nome + '(');
    if (i < 0) return null;
    let nivel = 0, vi = false;
    for (let j = i; j < template.length; j++) {
      const c = template[j];
      if (c === '{') { nivel++; vi = true; }
      else if (c === '}') { nivel--; if (vi && nivel === 0) return template.slice(i, j + 1); }
    }
    return null;
  };
  const listaIni = template.indexOf('const PRC_PASSOS = [');
  const listaFim = listaIni < 0 ? -1 : template.indexOf('];', listaIni);
  const fontes = ['prcPassoDoChip', 'prcPassoAtivo', 'prcProximoPassoTexto', 'prcMaiuscula'].map(pegar);
  if (listaIni < 0 || listaFim < 0 || fontes.indexOf(null) >= 0) {
    checar('as funções do chip do fecho existem para serem medidas', false,
      'sem elas esta suíte não mede nada, e verde sem medição é o pior resultado');
    return;
  }
  ok++;
  const codigo = template.slice(listaIni, listaFim + 2) + NL + fontes.join(NL) + NL
    + 'return { PRC_PASSOS, prcPassoDoChip, prcPassoAtivo, prcProximoPassoTexto };';
  let api;
  try {
    /* precificacaoEstado é o estado que as quatro leem; entra como variável do sandbox */
    api = new Function('precificacaoEstado', codigo)(sandbox);
  } catch (e) {
    checar('as funções do chip do fecho carregam', false, e.message);
    return;
  }
  ok++;

  /* A REGRA, medida uma vez por chip que a tela oferece: clicar no chip tem que (a)
     acender esse chip e (b) produzir uma data de verdade. */
  api.PRC_PASSOS.forEach(op => {
    const escolha = api.prcPassoDoChip(op.id);
    if (!escolha) {
      checar('o chip ' + op.id + ' vira um passo', false,
        'id que a tela emite e a regra não resolve = clique sem efeito');
      return;
    }
    ok++;
    sandbox.passo = escolha;
    checar('o chip ' + op.id + ' acende depois do próprio clique',
      api.prcPassoAtivo(op),
      'o gestor clica, nada acende, e ele clica de novo');
    const t = api.prcProximoPassoTexto();
    checar('o chip ' + op.id + ' produz data válida',
      !!t.data && !isNaN(t.data.getTime()) && String(t.dia).indexOf('Invalid') < 0,
      'este é o texto que vai no WhatsApp e no PNG: ' + t.dia + ', ' + t.hora);
  });
  sandbox.passo = { dias: null, hora: null, escolhido: null };
}());

/* ── 16. UM LUGAR SÓ RESOLVE O ID DO CHIP ────────────────────────────────────────
   O defeito só existiu porque havia DOIS ligadores para [data-prc-passo] e eles
   discordavam. Não é o número de ligadores que importa (podem conviver): é nenhum deles
   inventar a própria leitura do id. */
(function () {
  const ligadores = template.split('data-prc-passo]').length - 1;
  checar('os ligadores do chip existem', ligadores >= 1);
  const atalho = template.split('dataset.prcPasso').length - 1;
  const viaRegra = template.split('prcPassoDoChip(').length - 1;
  checar('nenhum ligador inventa a leitura do id do chip',
    /* cada leitura do atributo tem que desaguar na regra; +1 porque a própria função a declara */
    viaRegra >= atalho,
    atalho + ' leitura(s) de dataset.prcPasso para ' + viaRegra + ' uso(s) da regra');
}());

/* ══ A PROPOSTA APARECE NO CELULAR (12/09/26, auditoria) ═══════════════════════════
   MEDIDO em producao a 375px, na sessao do Marco: o palco resolvia para 279x0 e a peca
   ficava em tamanho natural (760px) dentro dele, com overflow:hidden por cima — a aba
   mostrava o formulario, os planos, e um VAZIO onde vai a proposta. Ele escolhe o plano
   sem ver o que vai mostrar ao dono do restaurante, na aba que existe para isso.

   Duas causas, duas checagens. A primeira e a mais traicoeira: a conta desistia de
   escalar quando nao havia altura medivel — guarda que, ao falhar, produz exatamente o
   defeito que deveria evitar. */
checar('a escala da peca nao desiste quando o palco nao tem altura',
  /alturaUtil > 0 \? alturaUtil \/ natural : Infinity/.test(template)
  && /palco\.style\.minHeight = alturaUtil \+ 'px';/.test(template),
  'restricao que nao se mede nao restringe: com a altura zerando a conta, a peca fica '
    + 'em tamanho natural dentro de uma janela que corta');
checar('e o empilhado solta a cadeia de flex que zerava o palco',
  /@media \(max-width:1240px\)[\s\S]{0,1800}\.p4-palco\{flex:none/.test(template)
    && /@media \(max-width:1240px\)[\s\S]{0,2200}#viewPrecificacao\.active \.prc-shell\{flex:none/.test(template),
  'no desktop as duas colunas dividem a altura da tela; empilhado nao ha o que dividir '
    + 'e a cadeia toda resolve para zero');


/* ══ 16. A ORDEM QUE FAZ A IMAGEM CHEGAR NO WHATSAPP (12/09/26) ═══════════════════
   Esta é a falha 2 do handoff, e ela já aconteceu duas vezes. `wa.me` NÃO ANEXA
   ARQUIVO: no desktop o único caminho é PNG no clipboard e Ctrl+V. Três coisas quebram
   isso, cada uma sozinha:
     1. `await` do blob antes de `clipboard.write` → o gesto do usuário expira e o write
        falha em silêncio. A PROMESSA vai DENTRO do ClipboardItem;
     2. `window.open` depois de um await → bloqueado como popup, e nem o texto vai;
     3. o gerador baixado no clique → o blob leva segundos e o clipboard expira.
   As três são mecânicas de navegador, não gosto: por isso são guarda. */
/* A PRIMEIRA VERSAO DESTA CHECAGEM PASSOU VERDE COM A SABOTAGEM (12/09/26): ela
   procurava o await dentro de 400 caracteres antes do clipboard.write, e o ramo do
   compartilhamento no celular joga a distancia para mais de 400 — medir PROXIMIDADE
   outra vez. Agora a regra e categorica: NENHUM await no corpo do envio. */
(function () {
  const i = template.indexOf('function abrirWhatsappProposta()');
  const f = template.indexOf(NL + '}', i);
  /* SEM COMENTARIO: o unico 'await' ali dentro e a prosa que explica por que o
     compartilhamento no celular pode aguardar. Medir codigo, nao prosa. */
  const corpo = i > -1 && f > i ? mascararComentarios(template.slice(i, f)) : '';
  checar('o clipboard recebe a PROMESSA do blob, e nada e aguardado no envio',
    /new ClipboardItem\(\{ 'image\/png': blobP \}\)/.test(corpo)
      && corpo.indexOf('await ') === -1,
    'com await antes do write o gesto do usuário expira (NotAllowedError silencioso, '
      + 'nada no clipboard); com await antes do open, popup bloqueado e nem o texto vai');
}());
checar('e a função de envio não é assíncrona, para o window.open sair no gesto',
  /\nfunction abrirWhatsappProposta\(\) \{/.test(template)
    && !/async function abrirWhatsappProposta/.test(template),
  'window.open depois de um await é tratado como popup e bloqueado — nem o texto chega');
checar('o gerador de imagem é baixado quando a aba abre, não no clique',
  /renderPrecificacaoConfigurador\(\);[\s\S]{0,600}carregarHtml2Canvas\(\)\.catch/.test(template),
  'baixando no clique, o blob leva segundos e o clipboard expira antes de resolver');

/* ══ 17. O PISO DE TOQUE NUMA ABA DE ESTILO INLINE ════════════════════════════════
   A prancha é toda estilo inline, e INLINE VENCE A FOLHA. Sem !important, a regra de
   44px no celular não aplica em nada desta aba — e foi exatamente assim que ela já
   falhou aqui antes: o chip de 28px continuava com 28px no dedo. */
checar('o piso de toque desta aba vence o estilo inline',
  /@media \(max-width:760px\)\{[\s\S]{0,200}\.prc5-toque\{min-height:44px!important;\}/.test(template)
    && (template.match(/class="prc5-toque"/g) || []).length >= 4,
  'sem !important a regra existe e não aplica; sem a classe nos controles, não alcança nada');


/* ══ 18. A CADEIA QUE PRENDE A ABA EM 100vh ═══════════════════════════════════════
   Cada elo faz uma coisa e nenhum sozinho resolve:
     · body sem rolagem — a rede: se sobrar 1px ele e recortado em vez de devolver a
       barra que este trabalho inteiro veio tirar;
     · altura FIXA no topo da cadeia (height:100vh, nao min-height) — com min-height o
       conteudo empurra e a pagina cresce;
     · flex:1 1 0 com min-height:0 na aba, no conteudo e na grade — e o min-height:0
       que deixa o elo ENCOLHER abaixo do conteudo, que e o que faz a peca caber;
     · fileiras explicitas na casca — grade sem template distribui a sobra e, no modo
       cliente, a barra virou uma faixa de 397px empurrando o cartao para fora da tela.
   MEDIDO em 12/09/26, com a cadeia descartada por um erro de sintaxe: body rolando,
   pagina de 1246px numa janela de 900 e a peca em tamanho natural. */
checar('a cadeia que prende a aba em 100vh esta inteira',
  /body:has\(#viewPrecificacao\.active\)\{overflow:hidden;\}/.test(template)
    && /#appRoot:has\(#viewPrecificacao\.active\) > div\{height:100vh;min-height:0;\}/.test(template)
    && /\.app-main > #viewPrecificacao\.active\{flex:1 1 0;min-height:0;/.test(template)
    && /#viewPrecificacao\.active > #precificacaoContent\{flex:1 1 0;min-height:0;/.test(template)
    && /#viewPrecificacao\.active \.prc-shell\{flex:1 1 0;min-height:0;/.test(template)
    && /#viewPrecificacao\.active \.p4-grid\{flex:1 1 0;min-height:0;\}/.test(template),
  'sem um dos elos a aba volta a rolar e a peca sai em tamanho natural — e o navegador '
    + 'nao reclama: foi assim que a cadeia inteira desapareceu em silencio hoje');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('propostas: ' + ok + ' checagens ok — o preço vem da tabela, a peça diz o nome do produto, e a mensagem que vai junto é a mesma que o CTA envia.');
