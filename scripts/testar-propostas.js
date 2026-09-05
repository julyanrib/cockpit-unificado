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
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const preco = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'precificacao.json'), 'utf8'));

let ok = 0;
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
/* FORA DO CARTÃO ESCURO: dentro, ela pareceria parte da peça que o dono recebe. */
checar('a mensagem fica fora do cartão do documento',
  template.indexOf('<div class="prc-proposal" id="precificacaoPreview">${prcPreviewHTML()}</div>') <
  template.indexOf('id="prcMensagemJunto"'));

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

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('propostas: ' + ok + ' checagens ok — o preço vem da tabela, a peça diz o nome do produto, e a mensagem que vai junto é a mesma que o CTA envia.');
