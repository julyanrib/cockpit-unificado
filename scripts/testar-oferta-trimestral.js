#!/usr/bin/env node
/* ============================================================================
   A OFERTA TRIMESTRAL DE 30% (23/09/26)

   Julyan: "consegue colocar na propostas uma oferta trimestral 30% de desconto? estamos
   com essa promoção agora". Escolha dele, perguntada antes de escrever: cartão
   PROMOCIONAL NOVO ao lado dos quatro períodos, sem prazo por enquanto.

   O QUE ESTA SUÍTE PROTEGE, em ordem de estrago:

   1. O ID PROMOCIONAL NÃO PODE CHEGAR AO `periodo_contratado`. Essa propriedade é uma
      enumeração FECHADA no HubSpot — 'Mensal','Trimestral','Semestral','Anual' — validada
      também no servidor e OBRIGATÓRIA em Ag. Pagamento, que é onde mora o RPA do Asaas.
      Um id novo ali derruba a geração do boleto. A aba Propostas escreve só
      `plano_apresentado` e `valor_de_mrr`, e é assim que tem de continuar.

   2. A OFERTA NÃO SUBSTITUI O TRIMESTRAL. Os dois existem: quando a promoção acabar,
      apagar a entrada devolve a tabela sem ninguém ter de lembrar que número era antes.

   3. A CONTA É A CONTA. 30% sobre o preço de tabela, três meses, três parcelas.

   Uso: node scripts/testar-oferta-trimestral.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const prec = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'precificacao.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const rotaEtapa = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
}
function igual(nome, veio, esperado, porque) {
  checar(nome, JSON.stringify(veio) === JSON.stringify(esperado),
    (porque ? porque + ' · ' : '') + 'esperava ' + JSON.stringify(esperado)
      + ', veio ' + JSON.stringify(veio));
}

/* ══ 1. A OFERTA EXISTE, E É OFERTA ═════════════════════════════════════════════════ */
const promo = prec.periodicidades.filter(function (p) { return p.promocao === true; });
igual('existe exatamente uma oferta promocional', promo.length, 1,
  'duas ofertas ao mesmo tempo é a tabela de preço virando bagunça');
const o = promo[0] || {};
igual('a oferta desconta 30%', o.desconto, 30, 'foi o que ele pediu em 23/09');
igual('e dura três meses', o.meses, 3);
igual('em três parcelas', o.parcelas, 3, 'trimestral parcelado em 3x, como os outros períodos');

/* ══ 2. ELA NÃO SUBSTITUIU O TRIMESTRAL ═════════════════════════════════════════════ */
const tri = prec.periodicidades.filter(function (p) { return p.id === 'trimestral'; })[0];
checar('o trimestral normal continua na tabela', !!tri,
  'a oferta é temporária; apagar a entrada dela tem de devolver a tabela inteira');
igual('e continua com 10%', tri && tri.desconto, 10,
  'se a oferta tivesse substituído o 10%, ninguém saberia para onde voltar');

/* ══ 3. A CONTA ═════════════════════════════════════════════════════════════════════
   Sobre o preço de tabela de cada plano, não sobre outro desconto. */
const erros = [];
prec.tipos.forEach(function (t) {
  t.planos.forEach(function (p) {
    const esperado = Math.round(p.preco * 0.7 * 100) / 100;
    const veio = Math.round(p.preco * (1 - o.desconto / 100) * 100) / 100;
    if (veio !== esperado) erros.push(t.nome + '/' + p.nome);
  });
});
igual('a oferta desconta sobre o preço de tabela de todos os planos', erros, [],
  'desconto que vale para uns e não para outros é o que faz a proposta discordar do CRM');

/* ══ 4. O QUE NÃO PODE ENCOSTAR NO HUBSPOT ══════════════════════════════════════════ */
const ENUM_PERIODO = (rotaEtapa.match(/periodo_contratado: \[([^\]]*)\]/) || [])[1] || '';
checar('a enumeração fechada do servidor foi encontrada', ENUM_PERIODO.length > 10,
  'sem ela esta checagem mede o vazio — e é a que evita quebrar o Asaas');
checar('o id da oferta NÃO está na enumeração do servidor',
  ENUM_PERIODO.indexOf('trimestral-promo') < 0 && ENUM_PERIODO.indexOf('oferta') < 0,
  'periodo_contratado é enumeração fechada e obrigatória em Ag. Pagamento, onde o RPA do '
    + 'Asaas lê — valor fora da lista é recusado e o boleto não nasce');

/* E A ABA DE PROPOSTAS CONTINUA ESCREVENDO SÓ AS DUAS PROPRIEDADES QUE ELA SABE. */
const iPrc = tpl.indexOf('const PRC_ETAPA_DEMO');
const iFim = tpl.indexOf('function prcLigarPeriodos', iPrc);
const blocoPrc = (iPrc > -1 && iFim > iPrc) ? tpl.slice(iPrc, iFim) : '';
checar('o bloco da aba Propostas foi encontrado', blocoPrc.length > 1000,
  'sem o recorte a checagem abaixo passa medindo nada');
checar('a proposta não escreve periodo_contratado',
  blocoPrc.indexOf('periodo_contratado') < 0,
  'ela escreve plano_apresentado e valor_de_mrr; o período o executivo declara na entrada '
    + 'de Ag. Pagamento, escolhendo um dos quatro valores que o HubSpot aceita');

/* ══ 5. A TELA — saiu em 20/11/26. A grade de períodos da Propostas antiga (prcBlocoPeriodoHTML e o
   cartão da oferta dentro dela) não era chamada por ninguém desde a Calculadora (pc9); a faxina final
   tirou o markup morto, e com ele estas quatro checagens de desenho. As regras de dado acima ficam. */

console.log('');
console.log('oferta trimestral: ' + ok + ' verificações');
if (falhas.length) {
  console.log('');
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('');
  console.log('FALHOU: ' + falhas.length);
  process.exit(1);
}
console.log('tudo certo.');
