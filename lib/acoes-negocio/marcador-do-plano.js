// lib/acoes-negocio/marcador-do-plano.js
//
// O MARCADOR DE MÁQUINA QUE O PWA LÊ — UM LUGAR SÓ.
// ---------------------------------------------------------------------------------------
// Nasceu dentro de criar-tarefa-rota.js em 11/09/26 e saiu para cá no mesmo dia, quando a
// SEGUNDA rota que cria tarefa (criar-nota-negocio.js, o "próximo passo" da ficha) passou
// a precisar dele. Duas cópias de um formato que um sistema de fora lê divergem na primeira
// mudança — e divergem em silêncio, porque cada rota tem seu próprio teste.
//
// O CONTRATO, documentado para o time do PWA:
//
//   COCKPIT:PLANO:v1:<ownerId>:<AAAA-MM-DD>:<HH:MM>:<visita|reuniao>:<origem>:<dealId|->
//
// · a VERSÃO vem primeiro para quem lê ancorar nela e ignorar formato que não conhece;
//   campos novos entram no FIM, nunca no meio;
// · `-` no lugar do dealId quando o negócio ainda não existe — campo vazio some no split
//   e desloca todos os que vêm depois;
// · a data e a hora são as da tarefa, em horário de Brasília, montadas dos MESMOS números
//   que montaram o hs_timestamp. Quem lê não precisa converter fuso, e um desencontro
//   entre os dois aparece na hora.
//
// ONDE ELE VIVE NO CORPO: última linha, SEMPRE. A primeira é lida por posição pelo
// marcador de sugestão do gestor (`/^SUGESTAO_GESTOR:/`), e o plano lá cegaria a
// confirmação de sugestão.

/* AS ORIGENS SÃO LISTA FECHADA porque a origem é MEDIDA depois: "quantas visitas nasceram
   no Planejamento contra quantas nasceram no funil" só existe com origem de nome fechado.
   Texto livre vindo do navegador viraria uma coluna que ninguém consegue agrupar. */
const ORIGEM_ROTULO = {
  planejamento: 'visita posta na semana pelo Planejamento do Cockpit.',
  daily: 'visita posta no dia pela Minha Daily do Cockpit.',
  funil: 'proximo passo datado na ficha do negocio, no Meu funil do Cockpit.',
  mapa: 'conta-alvo adicionada a rota pelo mapa do Cockpit.',
  cockpit: 'conta-alvo adicionada a rota do dia pelo Cockpit (Rota & Agenda).'
};

function origemValida(bruta) {
  return ORIGEM_ROTULO[String(bruta || '')] ? String(bruta) : 'cockpit';
}

/* O ELO COM O NEGÓCIO. Só dígitos: id do HubSpot é numérico, e qualquer outra coisa aqui é
   ruído do navegador entrando num campo que um robô vai ler — inclusive dois-pontos, que
   quebraria o formato inteiro. */
function dealIdValido(bruto) {
  return /^[0-9]+$/.test(String(bruto || '')) ? String(bruto) : '';
}

function do2(v) { return String(v).padStart(2, '0'); }

/* `tipo` aceita as duas grafias que as rotas usam hoje: a delas ('visita'/'reuniao') e a do
   passo da ficha ('Follow-up'/'Visita'/'Reunião'/'Demo'). Sai sempre em minúscula sem
   acento, porque é campo de máquina. */
function tipoNormalizado(bruto) {
  const t = String(bruto || 'visita').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (t.indexOf('reuni') === 0) return 'reuniao';
  if (t.indexOf('demo') === 0) return 'demo';
  if (t.indexOf('follow') === 0) return 'follow_up';
  return 'visita';
}

/* MONTA A LINHA a partir dos números que a rota já tem na mão. Devolve string — quem chama
   decide onde põe, e todas põem no fim. */
function linhaDoMarcador({ ownerId, ano, mes, dia, hora, minuto, tipo, origem, dealId }) {
  return 'COCKPIT:PLANO:v1:' + String(ownerId)
    + ':' + String(ano) + '-' + do2(mes) + '-' + do2(dia)
    + ':' + do2(hora) + ':' + do2(minuto)
    + ':' + tipoNormalizado(tipo)
    + ':' + origemValida(origem)
    + ':' + (dealIdValido(dealId) || '-');
}

module.exports = { ORIGEM_ROTULO, origemValida, dealIdValido, tipoNormalizado, linhaDoMarcador };
