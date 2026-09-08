// lib/temperatura.js
//
// A TEMPERATURA DO NEGÓCIO, EM UM LUGAR SÓ (08/09/26).
//
// Julyan, sobre a aba Time v2: "temperatura 0–100 no robô e config, todas as telas leem
// a mesma nota". Antes desta função a temperatura era uma PALAVRA decidida em duas linhas
// dentro de scripts/fetch-hubspot.js:
//
//     let temperatura = 'morno';
//     if (slaBreach) temperatura = 'frio';
//     else if (rank >= 4) temperatura = 'quente';
//
// Ou seja: sem valor, sem recência, e binária na etapa. Sete telas leem essa palavra.
//
// POR QUE UM MÓDULO E NÃO MAIS DUAS LINHAS NO ROBÔ: o robô monta negócio em QUATRO
// lugares (funilLeads, os recortes por rep, a busca por etapa e a lista do mês). Escrever
// a conta em cada um é a receita conhecida desta base para quatro contas que discordam —
// foi assim com a paleta de etapa, com o time em quatro fontes e com a contagem de
// clientes nomeados. Aqui a regra tem um endereço, e as suites conseguem apontar para ele.
//
// E POR QUE A PALAVRA PASSA A DERIVAR DA NOTA: manter as duas independentes seria a mesma
// doença com nome novo — a tela mostraria "82°" ao lado de um selo "morno".
//
// A CONFIGURAÇÃO NÃO MORA AQUI: pesos, teto de MRR, janela de recência e cortes vêm de
// data/temperatura.json. Mexer na régua é editar JSON, não código.

const CONFIG_PADRAO = require('../data/temperatura.json');

/* Dias corridos desde uma data ISO, ou null quando não há data. Corridos, e não úteis, de
   propósito: recência é sobre o cliente esfriando, e o cliente não sabe que foi sábado. */
function diasDesde(iso, agoraMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return null;
  const dias = ((agoraMs == null ? Date.now() : agoraMs) - t) / 86400000;
  return dias < 0 ? 0 : dias;
}

function numeroOuNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}

/* ══ A CONTA ═════════════════════════════════════════════════════════════════════════
   Três fatores de 0 a 1, cada um com seu peso; a nota é a soma normalizada em 0–100.

   negocio: { stageId, mrr, valor, ultimaInteracao }
   Devolve: { nota, faixa, parcial, fatores } — `parcial` diz que um fator não existia e
   saiu da conta (hoje só a recência), e é isso que a tela usa para escrever "sem último
   toque registrado" em vez de fingir uma nota completa. */
function temperaturaDoNegocio(negocio, opcoes) {
  const cfg = (opcoes && opcoes.config) || CONFIG_PADRAO;
  const agoraMs = opcoes && opcoes.agoraMs;
  const n = negocio || {};

  const pesos = cfg.pesos || {};
  const ranks = cfg.etapa || {};
  const rank = numeroOuNull(ranks[String(n.stageId)]);
  /* maior rank da configuração, e não um 6 cravado: inserir uma etapa no pipeline não
     pode exigir mexer aqui. */
  const rankMax = Object.keys(ranks)
    .filter(k => k.charAt(0) !== '_')
    .reduce((m, k) => Math.max(m, numeroOuNull(ranks[k]) || 0), 1);

  const fatores = {};

  /* etapa: fora do funil de Field Sales (Backlog, Perdido, Reciclagem, Onboarding) não
     tem rank — e aí a etapa não pontua. Não é "parcial": um negócio em Reciclagem tem
     etapa medida, ela só não vale ponto de avanço. */
  fatores.etapa = rank == null ? 0 : (rankMax > 1 ? (rank - 1) / (rankMax - 1) : 0);

  /* valor: MRR mensal, com teto. Sem MRR, tenta o campo alternativo declarado na config
     antes de desistir — negócio sem valor no CRM é frequente e não deve zerar a nota
     inteira, só o fator dele. */
  const cv = cfg.valor || {};
  const mrr = numeroOuNull(n[cv.campo || 'mrr']);
  const teto = numeroOuNull(cv.teto) || 1;
  fatores.valor = mrr == null ? 0 : Math.max(0, Math.min(mrr / teto, 1));

  /* recência: 1 no dia do toque, 0 no fim da janela. NULL SAI DA CONTA (ver o comentário
     da config): sem toque registrado, os pesos restantes são renormalizados. */
  const janela = numeroOuNull((cfg.recencia || {}).janelaDias) || 14;
  const dias = diasDesde(n.ultimaInteracao, agoraMs);
  const semToque = dias == null;
  fatores.recencia = semToque ? null : Math.max(0, Math.min(1 - dias / janela, 1));

  const usados = [
    ['etapa', fatores.etapa],
    ['valor', fatores.valor],
    ['recencia', fatores.recencia]
  ].filter(([, v]) => v !== null);

  const somaPesos = usados.reduce((t, [k]) => t + (numeroOuNull(pesos[k]) || 0), 0);
  const soma = usados.reduce((t, [k, v]) => t + (numeroOuNull(pesos[k]) || 0) * v, 0);
  const nota = somaPesos > 0 ? Math.round((soma / somaPesos) * 100) : 0;

  const faixas = cfg.faixas || {};
  const corteQuente = numeroOuNull(faixas.quente);
  const corteMorno = numeroOuNull(faixas.morno);
  const faixa = (corteQuente != null && nota >= corteQuente) ? 'quente'
    : (corteMorno != null && nota >= corteMorno) ? 'morno' : 'frio';

  return { nota, faixa, parcial: semToque, fatores, diasSemToque: dias == null ? null : Math.round(dias) };
}

module.exports = { temperaturaDoNegocio, diasDesde, CONFIG_PADRAO };
