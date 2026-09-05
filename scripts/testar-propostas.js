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
/* TRIMESTRAL NÃO GANHA "MESES GRÁTIS": são 0,3 mês e chamar isso de fração de mês
   grátis soa a truque na frente do dono. */
checar('trimestral fica só com o absoluto, sem fração de mês grátis',
  /per\.id === 'trimestral'/.test(template)
  && /truque/.test(template.slice(Math.max(0, template.indexOf("per.id === 'trimestral'") - 400),
       template.indexOf("per.id === 'trimestral'") + 200)));

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

/* ── 9. O QUE JÁ EXISTIA E NÃO PODE SUMIR ───────────────────────────────────────
   Estas quatro são as ações que fazem a aba valer: sem elas o gerador é um desenho. */
['function abrirWhatsappProposta', 'function baixarPropostaPrecificacao',
  'function copiarTextoProposta', 'function gerarBlobPropostaPrecificacao'].forEach(fn => {
  checar('continua existindo: ' + fn.replace('function ', ''), template.indexOf(fn) > -1);
});
checar('o bloco de objeções é só do executivo',
  template.indexOf('SÓ VOCÊ VÊ — SE ELE DISSER…') > -1
  && template.indexOf('${prcModoCliente ? \'\' : `<div class="p4-so-voce">') > -1,
  'no modo cliente ele tem de sumir — é a resposta às objeções DELE, virada para ele');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('propostas: ' + ok + ' checagens ok — o preço vem da tabela, a peça diz o nome do produto, e a mensagem que vai junto é a mesma que o CTA envia.');
