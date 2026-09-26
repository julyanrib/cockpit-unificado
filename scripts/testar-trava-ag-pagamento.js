// scripts/testar-trava-ag-pagamento.js
//
// AG. PAGAMENTO É INTOCÁVEL DEPOIS QUE A COBRANÇA SAI (26/09/26).
// O executivo passa a emitir a cobrança do ASAAS pelo celular; a trava não pode ser só
// "esconder o botão". Este teste executa a regra de verdade (travaAgPagamento) e mede:
//   - nada muda dentro de Ag. Pagamento (edição inline recusada);
//   - daqui só se sai para Reciclagem ou Perdido; Onboarding, Negociação e Ganho recusam;
//   - Perdido leva só o motivo (e a observação); qualquer outra propriedade recusa;
//   - negócio fora de Ag. Pagamento não é afetado.

const { travaAgPagamento } = require('../lib/acoes-negocio/mudar-etapa-negocio.js');

const AG = '1395880473';
const NEG = '1395880472';
const ONB = '1396006163';
const REC = '1398311191';
const PERD = '1396006164';
const GANHO = '1396006162';
const deal = (etapa) => ({ properties: { dealstage: etapa } });

let falhas = 0;
const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALHA ') + m); if (!c) falhas++; };

ok(!!travaAgPagamento(deal(AG), AG, { mrr: '399' }), 'Ag. Pagamento: editar mrr na própria etapa é recusado');
ok(!!travaAgPagamento(deal(AG), AG, {}), 'Ag. Pagamento: salvar a própria etapa sem mudança também é recusado');
ok(!!travaAgPagamento(deal(AG), NEG, {}), 'Ag. Pagamento → Negociação: recusado');
ok(!!travaAgPagamento(deal(AG), ONB, {}), 'Ag. Pagamento → Onboarding: recusado (Onboarding vem depois do Ganho)');
ok(!!travaAgPagamento(deal(AG), GANHO, {}), 'Ag. Pagamento → Ganho: recusado (só o ASAAS)');
ok(travaAgPagamento(deal(AG), REC, {}) === null, 'Ag. Pagamento → Reciclagem sem propriedades: passa');
ok(!!travaAgPagamento(deal(AG), REC, { amount: '1200' }), 'Ag. Pagamento → Reciclagem mexendo em amount: recusado');
ok(travaAgPagamento(deal(AG), PERD, { motivo_do_perdido: 'Preço', observacao__desqualificado: 'achou caro' }) === null, 'Ag. Pagamento → Perdido com o motivo: passa');
ok(!!travaAgPagamento(deal(AG), PERD, { motivo_do_perdido: 'Preço', mrr: '1' }), 'Ag. Pagamento → Perdido levando mrr junto: recusado');
ok(travaAgPagamento(deal(NEG), AG, { mrr: '399', amount: '399' }) === null, 'Negociação → Ag. Pagamento (emitir cobrança): a trava não se aplica');
ok(travaAgPagamento(deal(NEG), NEG, { valor_de_mrr: '449' }) === null, 'Negociação: edição inline continua livre');
ok(travaAgPagamento({ properties: {} }, AG, {}) === null, 'negócio sem etapa lida: a trava não inventa');

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\ntrava de Ag. Pagamento: tudo certo');
