// lib/lotes-de-perda.js
//
// PERDA UMA A UMA x LIMPEZA EM LOTE — uma régua só (19/09/26).
//
// POR QUE ESTE ARQUIVO EXISTE: a regra nasceu dentro de fetch-weekly-comparison.js, para
// o KPI "perdidos" da Semana. No mesmo dia ela passou a ser necessária no gráfico de
// motivos, que vive em fetch-hubspot.js. Duas cópias de "o que é um lote" seriam duas
// respostas para a mesma pergunta em duas telas — e este projeto já tem histórico disso
// (os ids de etapa em onze arquivos, o `|| 10` da meta em cinco). Aqui a régua existe uma
// vez; o transporte é de quem chama.
//
// ══ O PROBLEMA ════════════════════════════════════════════════════════════════════════
// Julyan, 19/09/26: "eles limparam o funil mesmo". O Cockpit contava faxina como derrota.
// Na semana 14–18/09 o placar dizia 65 perdidos e 45 eram descarte de base marcado em
// sessões — e eu mesmo, com o banco na mão, li a semana como um desastre onde houve o
// melhor resultado recente (6 ganhos contra 2).
//
// ══ POR QUE NÃO É UM MOTIVO NOVO NO HUBSPOT ═══════════════════════════════════════════
// `motivo_do_perdido` é propriedade do CRM, e a regra da casa é não tocar na configuração
// dele. Então a separação é derivada, não declarada.
//
// ══ A RÉGUA, E O QUE ELA NÃO RESOLVE ══════════════════════════════════════════════════
// Perda de verdade acontece uma de cada vez; limpeza acontece numa sentada. `closedate`
// tem hora cheia, então dá para encadear marcações do mesmo dono por proximidade.
//
// Calibrada contra os 65 closedates REAIS de 14–18/09:
//     gap  5min, minimo 5  ->  37 em lote
//     gap 10min, minimo 5  ->  40
//     gap 15min, minimo 5  ->  45   <= escolhido
//     gap 20min, minimo 5  ->  47
// Quinze captura a sessão da Kelly de 16/09 (sete marcações numa hora, com intervalos de
// 5 a 13 minutos) sem varrer junto as perdas isoladas do Bruno.
//
// E NENHUM LIMIAR SEPARA PERFEITAMENTE: as três marcações do Bruno em 32 segundos no dia
// 18 são uma sentada evidente e ficam de fora, porque são só três. Por isso quem mostra
// isto na tela é obrigado a escrever a régua e a dizer "provável" — e o TOTAL NUNCA É
// REDUZIDO. O lote é leitura ao lado do número, nunca subtração: inferir intenção a
// partir de horário e chamar isso de fato seria o oposto do que esta base faz.

const LOTE_GAP_MIN = 15;
const LOTE_MINIMO = 5;

/* O DONO E A HORA DE UM NEGÓCIO, nos dois formatos que os chamadores têm em mãos:
   o objeto cru do HubSpot (com `properties`) e o já achatado. Aceitar os dois evita que
   um dos lados tenha que remontar o objeto só para chamar esta função — e remontar é
   onde o campo errado entra. */
function donoEQuando(d) {
  const p = (d && d.properties) ? d.properties : (d || {});
  const owner = String(p.hubspot_owner_id || p.ownerId || '') || 'sem-dono';
  const ms = Date.parse(p.closedate || p.perdidoEm || '');
  return { owner: owner, ms: ms };
}

/* Agrupa por dono e encadeia marcações separadas por até `gapMin`; grupo com `minimo` ou
   mais é um lote. Devolve o total em lote, as sessões, e o conjunto de ids — quem precisa
   quebrar por motivo usa o conjunto. */
function lotesDePerda(deals, opcoes) {
  const o = opcoes || {};
  const gapMin = Number.isFinite(o.gapMin) ? o.gapMin : LOTE_GAP_MIN;
  const minimo = Number.isFinite(o.minimo) ? o.minimo : LOTE_MINIMO;

  const porDono = {};
  (deals || []).forEach(function (d, i) {
    const x = donoEQuando(d);
    /* DATA ILEGÍVEL SAI, e o resto continua contando: um closedate estranho num negócio
       não pode derrubar a contagem da semana inteira. */
    if (!Number.isFinite(x.ms)) return;
    const id = String((d && (d.id || (d.properties || {}).hs_object_id)) || ('#' + i));
    (porDono[x.owner] = porDono[x.owner] || []).push({ ms: x.ms, id: id });
  });

  const lotes = [];
  const ids = {};
  let emLote = 0;
  Object.keys(porDono).forEach(function (owner) {
    const lista = porDono[owner].sort(function (a, b) { return a.ms - b.ms; });
    let grupo = [lista[0]];
    const fechar = function () {
      if (grupo.length < minimo) return;
      emLote += grupo.length;
      grupo.forEach(function (g) { ids[g.id] = true; });
      /* A DATA SAI DEFENSIVA, e não é paranoia: new Date(NaN).toISOString() LANÇA, e um
         throw aqui derrubaria o robô inteiro. O filtro acima já impede que NaN chegue —
         esta é a segunda tranca, e ela existe porque a primeira é uma linha que alguém
         pode mexer. Achado por sabotagem: invertendo o filtro, a suíte ESTOUROU em vez
         de reprovar, que é o pior dos dois resultados. */
      const iso = function (ms) {
        const dt = new Date(ms);
        return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
      };
      lotes.push({ ownerId: owner, n: grupo.length,
        de: iso(grupo[0].ms), ate: iso(grupo[grupo.length - 1].ms) });
    };
    for (let i = 1; i < lista.length; i++) {
      if (lista[i].ms - lista[i - 1].ms <= gapMin * 60000) grupo.push(lista[i]);
      else { fechar(); grupo = [lista[i]]; }
    }
    fechar();
  });
  lotes.sort(function (a, b) { return b.n - a.n; });
  return { emLote: emLote, lotes: lotes, ids: ids,
    regra: { gapMin: gapMin, minimo: minimo } };
}

module.exports = { LOTE_GAP_MIN, LOTE_MINIMO, lotesDePerda, donoEQuando };
