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
checar('o cabeçalho do documento usa o nome comercial da operação',
  template.indexOf('${esc(String(tipo.nome || tipo.rotuloOficial).toUpperCase())}') > -1,
  'com rotuloOficial na frente, a peça que sai da empresa diz "COMPLETO" em vez do nome do produto');
checar('e o botão continua com o rótulo curto',
  template.indexOf("const curto = (t.rotuloOficial || t.nome).split(',')[0].trim().toUpperCase();") > -1);

/* ── 3. QUEM RECEBE E QUEM ASSINA, NA MESMA LINHA ────────────────────────────────── */
checar('o documento diz para quem é e quem preparou',
  template.indexOf('<div class="p4-doc-para">para <b>${esc(cliente)}</b>${executivo ? ` · preparada por <b>${esc(executivo)}</b>` : \'\'}</div>') > -1);

/* ── 4. O RODAPÉ: O PASSO COMBINADO E O QUE A TAKEAT ENTREGA ─────────────────────
   O passo é a única frase da proposta que o dono vai COBRAR do executivo — ela estava
   no meio do selo de validade, em caixa alta de 9px, junto com o ano. E a linha de
   entrega responde "e depois que eu assino?" antes de ele perguntar: é a única parte
   da peça que fala de serviço em vez de funcionalidade. */
checar('o próximo passo tem linha própria no documento',
  /class="p4-doc-passo"/.test(template)
  && /fechamento marcado, não pedido/.test(template),
  'dentro do selo de validade ele vira letra miúda');
checar('o documento promete a implantação assistida',
  /implantação assistida por 30 dias · treinamento da equipe incluso · suporte humano 7 dias por semana/.test(template));
checar('e o selo de validade ficou só com validade e ano',
  /PROPOSTA VÁLIDA POR \$\{Number\(precificacaoCache\.validadeDias/.test(template)
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
  /\$\{per\.meses > 1[\s\S]{0,200}Total: \$\{prcMoedaCentavos\(c\.total\)\}/.test(template)
  && /'preço de tabela, por mês'/.test(template));
checar('o mensal diz boleto ou cartão, e sem fidelidade',
  template.indexOf("'▭ no boleto ou cartão · sem fidelidade'") > -1);
checar('e o parcelado continua dizendo cartão de crédito',
  template.indexOf("'▭ no cartão de crédito'") > -1);

/* ── 6. TODO PERÍODO COM DESCONTO MOSTRA O DESCONTO ──────────────────────────────
   O selo ficava só no de maior desconto. Quem escolhe período compara os três; ver
   −10% e −15% é o que faz o de 12 meses parecer o que ele é. */
checar('o selo aparece em todo período com desconto',
  template.indexOf('${per.desconto ? `<span class="p4-selo is-escuro">−${per.desconto}%</span>` : \'\'}') > -1);
checar('e a nota diz quanto economiza no período',
  /economiza ' \+ prcMoeda\(c\.economia\) \+ '\/período'/.test(template));
/* FRAÇÃO PEQUENA NÃO VIRA "MÊS GRÁTIS": o trimestral dá 0,3 mês, e chamar isso de
   fração de mês grátis soa a truque na frente do dono.
   ESTA CHECAGEM JÁ ME REPROVOU UMA VEZ, COM RAZÃO: ela prendia em per.id ===
   'trimestral', e no dia em que entrou 'trimestral-parcelado' o cartão novo passou a
   anunciar "≈ 0,3 mês grátis" — a regra estava presa ao NOME e o nome mudou. Agora ela
   mede o corte numérico, que é o que a regra sempre quis dizer. */
checar('a fração de mês grátis tem piso, e ele sai do número',
  /meses < 0\.5/.test(template)
  && /truque/.test(template.slice(Math.max(0, template.indexOf('meses < 0.5') - 500),
       template.indexOf('meses < 0.5') + 200)),
  'preso ao id do período, o corte não alcança um período novo com o mesmo prazo');

/* ── 7. A OPERAÇÃO DIZ O QUE ELA É ──────────────────────────────────────────────
   O botão lia "COMPLETO" e, embaixo, "Completo": duas linhas para a mesma palavra,
   no lugar da única informação que faz o dono escolher junto. */
checar('a segunda linha da operação é legenda, não o rótulo repetido',
  template.indexOf("${t.id === 'mesas' ? 'salão + delivery + caixa' : 'só operação de entrega'}") > -1
  && template.indexOf('${esc(curto)}<span>${esc(t.rotuloOficial || t.nome)}</span>') < 0);

/* ── 8. A MENSAGEM QUE VAI JUNTO ────────────────────────────────────────────────
   O PNG não viaja sozinho: o WhatsApp leva imagem + texto, e o texto é o que faz o
   dono abrir a imagem. Ele já existia e não aparecia em lugar nenhum antes de enviar —
   o executivo mandava para o cliente uma frase que ele nunca tinha lido. */
checar('a mensagem que acompanha o PNG é mostrada',
  template.indexOf('id="prcMensagemJunto"') > -1
  && template.indexOf('MENSAGEM QUE VAI JUNTO') > -1);
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
checar('a mensagem não é desenhada dentro da peça', (function () {
  const i = template.indexOf('function prcPreviewHTML()');
  const f = template.indexOf(NL + '}', i);
  return i > -1 && f > i
    && template.slice(i, f).indexOf('prcMensagemJunto') === -1;
}()),
  'dentro do cartão ela viraria parte do documento que o dono recebe — e do PNG');
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

/* A peça é desenhada na proporção do PNG que o dono recebe. Desenhar estreito num
   palco largo joga largura fora, porque a altura da peça quase não muda com a
   largura — o que a faz alta é o número de funcionalidades. */
checar('a peça é desenhada na proporção do PNG, lida do próprio gerador',
  template.indexOf('function prcLarguraDeDesenho(') > -1
  && /prcLarguraDeDesenho\([\s\S]{0,400}TakeatPropostaPNG\.razao/.test(template)
  && /window\.TakeatPropostaPNG = \{[\s\S]{0,120}razao: H \/ W/.test(template),
  'proporção copiada à mão diverge do PNG em silêncio — a prévia deixa de ter a forma do que é enviado');

/* position:static no cartão do palco o devolve ao fluxo: 930px de peça empurrando a
   grade. A regra é do layout v3, que usa a MESMA classe, e vencia por especificidade. */
checar('nenhuma regra devolve o cartão do palco ao fluxo',
  template.indexOf('.prc-shell.modo-cliente .prc-proposal{position:static') === -1
  && /\.p4-palco > \.prc-proposal\{position:absolute/.test(template),
  'foi assim que o cartão apareceu solto embaixo da faixa preta no modo cliente');

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
checar('planos e períodos em 4 colunas que podem encolher',
  /\.p4-planos,\.p4-periodos\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(template)
  && /\.p4-plano,\.p4-periodo\{[^}]*min-width:0/.test(template),
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
  /alturaUtil > 0 \? alturaUtil \/ natural : Infinity/.test(template),
  'restricao que nao se mede nao restringe: com a altura zerando a conta, a peca fica '
    + 'em tamanho natural dentro de uma janela que corta');
checar('e o empilhado solta a cadeia de flex que zerava o palco',
  /@media \(max-width:1240px\)[\s\S]{0,1800}\.p4-palco\{flex:none/.test(template)
    && /@media \(max-width:1240px\)[\s\S]{0,2200}#viewPrecificacao\.active \.prc-shell\{flex:none/.test(template),
  'no desktop as duas colunas dividem a altura da tela; empilhado nao ha o que dividir '
    + 'e a cadeia toda resolve para zero');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('propostas: ' + ok + ' checagens ok — o preço vem da tabela, a peça diz o nome do produto, e a mensagem que vai junto é a mesma que o CTA envia.');
