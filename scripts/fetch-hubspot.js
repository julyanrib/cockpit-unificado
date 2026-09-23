// scripts/fetch-hubspot.js
// Roda 1x/dia via GitHub Actions. Busca dados FRESCOS do HubSpot e grava data/hubspot.json.
// Esse arquivo é a ÚNICA parte do cockpit que muda sozinha todo dia.
// Requer variável de ambiente HUBSPOT_TOKEN (Private App token, escopo crm.objects.deals.read).

const fs = require('fs');
const path = require('path');

/* A CONTA DO REALIZADO MORA NA LIB (01/09/26) — ver a nota de abertura de
   lib/realizado.js. A tela da Daily v2 pergunta "o que já foi cumprido agora" a cada
   minuto; este robô grava o mesmo número 3x por dia. Uma conta, dois transportes. */
const REALIZADO = require('../lib/realizado.js');
/* A RÉGUA DE LOTE, a mesma do robô semanal — ver o cabeçalho da lib. */
const LOTES = require('../lib/lotes-de-perda.js');

const TOKEN = process.env.HUBSPOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!TOKEN) {
  console.error('ERRO: variável HUBSPOT_TOKEN não encontrada. Configure em GitHub → Settings → Secrets → Actions.');
  process.exit(1);
}

const PIPELINE_ID = '916011864';

const STAGES = {
  backlog: '1396007427',
  prospeccao: '1395880469',
  visita: '1396005401',
  diagnostico: '1395880470',
  demoProposta: '1395880471',
  negociacao: '1395880472',
  agPagamento: '1395880473',
  ganho1: '1396006162',
  ganho2: '1396006163',
  perdido: '1396006164',
  reciclagem: '1398311191',
  contaAlvo: '1413529973'
};

const OPEN_STAGES = [STAGES.prospeccao, STAGES.visita, STAGES.diagnostico, STAGES.demoProposta, STAGES.negociacao, STAGES.agPagamento];

// O PERDIDO A PARTIR DE HOJE, E SÓ (01/09/26, Julyan: "eu nao quero que puxe nada, que
// continue no hubspot, só vai pra perdido a partir de hoje").
// Medido no CRM antes de escrever isto: 1.811 negócios já estão na etapa Perdido do
// pipeline Field Sales — 418 em julho/26, 400 em agosto, 364 só nos 30 dias até 01/09.
// Nada disso desce. Uma ÚNICA regra decide a coluna: o negócio entrou em Perdido a partir
// do dia em que esta funcionalidade subiu. O histórico continua no HubSpot, que é onde ele
// já está e onde ninguém precisa dele para trabalhar a carteira de hoje.
// Eu tinha escrito uma segunda trava aqui — janela deslizante de 7 dias, para a coluna não
// crescer sem limite. Saiu: é regra que o Julyan não pediu e que faria um negócio perdido
// há oito dias DESAPARECER da tela sem ninguém ter mandado. O crescimento é real e está
// medido (~2 perdas por executivo por dia útil, ou seja algumas centenas em um trimestre),
// mas quem segura a TELA é o teto de 3 cards por coluna com "ver todos" — apresentação, não
// política de dado. Se um dia a gaveta ficar longa demais, a janela volta como decisão dele.
// A leitura de MOTIVO de perda (motivosDePerda, 90 dias) não usa este corte de propósito:
// ali a pergunta é 'por que o time perde', e para isso quanto mais histórico melhor. Aqui a
// pergunta é 'o que saiu da minha carteira desde que o Cockpit passou a registrar'.
const CORTE_PERDIDO_ISO = '2026-09-01';

// GANHO A PARTIR DESTA SEMANA (10/09/26, Julyan: "traga os ganhos só dessa semana e a
// partir dela seja contabilizado 1 a 1"). A segunda-feira desta semana, e fixa como as
// outras duas: janela que anda sozinha faria o ganho de sexta desaparecer na segunda.
// São 24 negócios em Ganho neste pipeline, o mais antigo de março — o histórico fica no
// HubSpot, que é onde ele já está.
const CORTE_GANHO_ISO = '2026-09-07';

// ENVIADO ONBOARDING A PARTIR DE HOJE (02/09/26, Julyan: "NÃO QUERO NENHUM RETROATIVO
// VAI SER A PARTIR DE HOJE TB").
// Medido no CRM antes de escrever: 431 negócios já estão na etapa Onboarding do pipeline
// Field Sales — 391 entraram em julho/26, 39 em agosto, 1 em setembro. Puxar a etapa
// inteira poria 431 cards numa coluna do kanban. Nada disso desce.
// O corte usa hs_v2_date_entered_1396006163, que é a data em que o negócio ENTROU nesta
// etapa. Não usa closedate (que marca o fechamento, outra coisa) nem
// hs_lastmodifieddate (que é 'alguém mexeu no registro' e traria de volta um negócio
// enviado em julho e editado ontem).
const CORTE_ONBOARDING_ISO = '2026-09-02';
const ETAPA_ONBOARDING = '1396006163';
const PROP_ENTRADA_ONBOARDING = 'hs_v2_date_entered_' + ETAPA_ONBOARDING;
function inicioDoOnboardingVisivel() {
  return Date.parse(CORTE_ONBOARDING_ISO + 'T00:00:00-03:00');
}

// TODAS AS PROPRIEDADES, e por isso a lista vem do próprio HubSpot em vez de eu
// escrever cem nomes à mão: /crm/v3/properties/deals é a fonte de verdade do que existe,
// e amanhã, quando alguém criar uma propriedade nova no pipe, ela entra sozinha.
// Por que isso importa AQUI e em nenhuma outra coluna: enviar para Onboarding dispara
// automação de WhatsApp e cria um card no pipe de Onboarding. O card do Cockpit tem que
// mostrar o negócio inteiro, porque é a última vez que o executivo o vê antes de ele
// virar responsabilidade de outro time.
// A busca é feita em LOTES: a API aceita a lista de propriedades no corpo, mas centenas
// de nomes numa requisição é pedir 414/400 — e, pior, é lento sete vezes por dia útil.
let cacheDePropriedades = null;
/* {prop: [{v, r}]} das propriedades de enumeração — preenchido junto com o de nomes,
   na mesma requisição, e enviado no snapshot para a tela mostrar o rótulo do CRM. */
let cacheDeOpcoes = {};

/* ══ AS PROPRIEDADES DE LISTA QUE O COCKPIT DESENHA ═════════════════════════════════
   Só as opções DESTAS viajam no snapshot. A primeira versão levava as de TODA
   propriedade de enumeração do negócio, e o payload vai para o Supabase e para o
   navegador de cada executivo — o hubspot.json já tem 700 KB. Este portal tem muita
   propriedade customizada de enumeração ("Atingiu 100 comandas?", "Pré Seleção
   Enterprise (Delivery e Balcão)", "Motivo saída cadência"...) que nenhum formulário do
   Cockpit mostra: seria banda e memória em sete celulares por rodada, para dado que
   ninguém lê.

   A lista foi LEVANTADA do template (toda prop declarada com tipo selecao,
   multiselecao ou sim_nao), não escolhida a dedo. Fica declarada aqui porque este
   script não lê o template.

   AO ADICIONAR UM CAMPO DE LISTA NOVO NO FORMULÁRIO, PONHA O NOME AQUI. Sem isso o
   rótulo daquele campo não vem do CRM e a tela volta a mostrar o valor cru — que é
   exatamente o defeito de 03/09 (oito opções com nome diferente do HubSpot, uma delas
   trocando a pergunta: o valor "Problemas de Gestão" se chama "Gestão de Estoque"). */
const PROPS_DE_LISTA_NA_TELA = [
  'adicional',
  'deseja_criar_perfil_no_asaas_',
  'gargalo_operacional',
  'motivo_do_perdido',
  'origem_do_lead',
  'pacote_contratado',
  'periodo_contratado',
  'plano_apresentado',
  'qual_maior_desafio_',
  'reuniao_agendada',
  'tipo_de_pagamento'
];
async function todasAsPropriedadesDeNegocio() {
  if (cacheDePropriedades) return cacheDePropriedades;
  const resp = await fetch('https://api.hubapi.com/crm/v3/properties/deals', {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  if (!resp.ok) throw new Error('não consegui listar as propriedades de negócio: ' + resp.status);
  const data = await resp.json();
  const uteis = (data.results || [])
    .filter(x => x && x.name)
    /* propriedade de arquivo e de cálculo interno do HubSpot não é dado do negócio e
       algumas nem são legíveis pela search — pedir só engrossa a requisição. */
    .filter(x => !x.hidden && !x.calculated && x.type !== 'object_coordinates');
  /* AS OPÇÕES TAMBÉM, e não só o nome (03/09/26). Este fetch já era a fonte de verdade
     do que EXISTE e jogava fora o que cada opção se CHAMA — então a tela do executivo
     imprimia o valor cru e oito opções apareciam com nome diferente do CRM, uma delas
     trocando a pergunta ("Problemas de Gestão" é "Gestão de Estoque" lá). Guardar
     {v, r} aqui faz o rótulo viajar no snapshot: renomear no HubSpot aparece no
     Cockpit na próxima rodada, sem ninguém editar lista à mão. */
  cacheDeOpcoes = {};
  uteis.forEach(function (p) {
    if (p.type !== 'enumeration' || !Array.isArray(p.options) || !p.options.length) return;
    if (PROPS_DE_LISTA_NA_TELA.indexOf(p.name) < 0) return;
    cacheDeOpcoes[p.name] = p.options.map(function (o) {
      return { v: String(o.value), r: String(o.label == null ? o.value : o.label) };
    });
  });
  cacheDePropriedades = uteis.map(x => x.name);
  return cacheDePropriedades;
}
function inicioDoPerdidoVisivel() {
  return Date.parse(CORTE_PERDIDO_ISO + 'T00:00:00-03:00');
}
function inicioDoGanhoVisivel() {
  return Date.parse(CORTE_GANHO_ISO + 'T00:00:00-03:00');
}

// ══════════════════════════════════════════════════════════════════════════════════
//  AS TRES METAS MENSAIS (10/09/26) — e por que duas constantes nao davam conta
// ══════════════════════════════════════════════════════════════════════════════════
//  Aqui viviam META_MENSAL_FECHADOS = 80 e META_MENSAL_POR_EXECUTIVO = 10, "combinada
//  com o Julyan em 27/07/2026", com o proprio comentario admitindo "configuravel aqui
//  ate existir um lugar melhor". A planilha de metas dele, vista em 10/09, mostra que
//  as duas estavam erradas de tres formas:
//
//    1. a meta do time e 50, nao 80
//    2. a meta individual nao e 10 para todo mundo: sao DOIS PATAMARES, 8 e 2
//    3. nao existe UMA meta — existem TRES: clientes, MRR e receita
//
//  E havia um quarto erro que so apareceu ao somar: a Amanda saiu da planilha e
//  continuava no snapshot com meta 10, inflando a meta do time em 10 clientes.
//
//  Agora o numero mora em data/metas.json, versionado: mudar a meta de alguem e mudar
//  o arquivo, sem tocar em codigo. A tabela metas_mensais no Supabase (que o prompt da
//  Time v10 citava e que NUNCA existiu) e o proximo passo, quando o Julyan quiser
//  editar sem PR — precisa do ok dele para o DDL.
const METAS = (function () {
  try {
    const bruto = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'metas.json'), 'utf8'));
    const soma = Object.values(bruto.metas || {}).reduce(function (s, m) {
      return { clientes: s.clientes + (m.clientes || 0), mrr: s.mrr + (m.mrr || 0),
        receita: s.receita + (m.receita || 0) };
    }, { clientes: 0, mrr: 0, receita: 0 });
    // A SOMA TEM DE BATER COM O TOTAL DA PLANILHA. Meta de time que nao e a soma das
    // metas das pessoas e o tipo de numero que ninguem explica na reuniao — e foi
    // exatamente o que aconteceu com os 80.
    ['clientes', 'mrr', 'receita'].forEach(function (k) {
      const esperado = (bruto.time || {})[k];
      if (esperado != null && soma[k] !== esperado) {
        throw new Error('data/metas.json: a soma de ' + k + ' da ' + soma[k]
          + ' e o total do time diz ' + esperado);
      }
    });
    return bruto;
  } catch (e) {
    console.error('METAS: nao consegui ler data/metas.json — ' + e.message);
    throw e;   // meta errada em tela e pior que robo que nao roda
  }
}());
const META_MENSAL_FECHADOS = (METAS.time && METAS.time.clientes) || 0;
const META_MRR_TIME = (METAS.time && METAS.time.mrr) || 0;
const META_RECEITA_TIME = (METAS.time && METAS.time.receita) || 0;
function metaDe(ownerId) {
  return (METAS.metas && METAS.metas[String(ownerId)])
    || { clientes: 0, mrr: 0, receita: 0, patamar: 'sem meta' };
}
// O AJUSTE DE COMPETENCIA, por negocio. Ver a nota _competencia no arquivo: o CRM nao
// tem como saber que um boleto compensado no dia 1 e venda do mes anterior.
const COMPETENCIA = {};
(METAS.competencia || []).forEach(function (c) { COMPETENCIA[String(c.dealId)] = c; });
function competenciaDe(dealId, mesDoClosedate) {
  const c = COMPETENCIA[String(dealId)];
  return c ? c.contaEm : mesDoClosedate;
}

// CLONAGEM DE LEITURA (15/08/26) — Julyan: "clonar o pipeline do field sales pro
// cockpit... contas alvo, reciclagem, enviado onboarding e perdidos". Só rótulo e cor
// pra essas etapas aparecerem certo em QUALQUER lugar que leia stageMeta.labels — nada
// disso entra em OPEN_STAGES nem em nenhum caminho de escrita/transição. Enviado
// Onboarding (ganho2) e Ag. Pagamento têm automação real (RPA/ASAAS, grupo de
// WhatsApp, troca de pipeline) — nunca tocar na lógica de transição delas, só no nome
// que aparece quando um negócio que já está lá é exibido em alguma lista.
const STAGE_LABELS = {
  [STAGES.backlog]: 'Backlog',
  [STAGES.prospeccao]: 'Prospecção',
  [STAGES.visita]: 'Visita',
  [STAGES.diagnostico]: 'Conversa com Decisor',
  [STAGES.demoProposta]: 'Demo/Proposta',
  [STAGES.negociacao]: 'Negociação',
  [STAGES.agPagamento]: 'Ag. Pagamento',
  [STAGES.ganho1]: 'Ganho',
  [STAGES.ganho2]: 'Enviado Onboarding',
  [STAGES.perdido]: 'Perdido',
  [STAGES.reciclagem]: 'Reciclagem',
  [STAGES.contaAlvo]: 'Conta Alvo'
};

// SLA (dias máximos esperados) por etapa — confirmados com Julyan.
/* ══ PLANEJAMENTO v7 · OS PROPÓSITOS DO EXECUTIVO (23/09/26) ═══════════════════════
   A tela passou a perguntar "o que você vai fazer?" antes de "qual conta?". Estas são
   as três listas que saem do HubSpot, por executivo, já com faixa, contagem, status e
   o agrupamento de lugar. O front não recalcula: duas contas da mesma pergunta é como
   as telas passam a discordar, e esta base já pagou por isso mais de uma vez.

   O QUE NÃO ESTÁ AQUI, e é declarado no payload para ninguém procurar:
     · `nova`  — contas-alvo vivem em leads_prospeccao (Supabase), lida pelo NAVEGADOR
                 com a sessão do usuário. O robô não tem acesso;
     · `rua`   — não tem lista por definição: é sair e bater porta.
   ══════════════════════════════════════════════════════════════════════════════════ */
const PLAN_ETAPAS_BASE = [STAGES.ganho1, STAGES.ganho2];

/* A GRAFIA NORMALIZADA É A CHAVE; a grafia canônica é o rótulo. "São Paulo" e
   "SÃO PAULO" são o mesmo lugar e viravam dois chips — medido na produção. */
function planChaveLugar(txt) {
  return String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/* ONDE: cidade primeiro, bairro dentro dela, CEP como último recurso — e quem não tem
   NADA fica num balde próprio, que a tela é obrigada a mostrar. Medido hoje: 126 dos
   243 negócios abertos não têm bairro, nem cidade, nem CEP. Some-los em silêncio
   esconderia metade da carteira. */
function planLugarDo(l) {
  const cidade = String(l.cidade || '').trim();
  const bairro = String(l.bairro || '').trim();
  const cep = String(l.cep || '').replace(/\D/g, '').slice(0, 5);
  if (cidade) {
    return { chave: 'cidade:' + planChaveLugar(cidade), rotulo: cidade,
      bairro: bairro ? { chave: 'bairro:' + planChaveLugar(cidade) + '|' + planChaveLugar(bairro), rotulo: bairro } : null };
  }
  if (bairro) return { chave: 'bairro:' + planChaveLugar(bairro), rotulo: bairro, bairro: null };
  if (cep) return { chave: 'cep:' + cep, rotulo: 'CEP ' + cep, bairro: null };
  return { chave: null, rotulo: null, bairro: null };
}

function planItem(l, proposito, agoraMs) {
  const lugar = planLugarDo(l);
  return {
    id: String(l.id),
    nome: l.name || l.dealname || 'Sem nome',
    proposito: proposito,
    stageId: String(l.stageId || ''),
    etapa: l.stage || '',
    dias: l.dias != null ? Number(l.dias) : null,
    mrr: Number(l.mrr || l.valor_de_mrr || 0) || 0,
    valor: Number(l.valor || 0) || 0,
    slaBreach: !!l.slaBreach,
    aguardando: !!l.aguardando,
    proximaAtividade: l.proximaAtividade || null,
    ultimaInteracao: l.ultimaInteracao || null,
    lugarChave: lugar.chave,
    lugarRotulo: lugar.rotulo,
    bairroChave: lugar.bairro ? lugar.bairro.chave : null,
    bairroRotulo: lugar.bairro ? lugar.bairro.rotulo : null,
    semEndereco: !lugar.chave
  };
}

/* QUANTOS DIAS DE ATRASO tem o próximo passo. Negativo = ainda vai vencer; 0 = hoje. */
function planAtrasoDias(iso, agoraMs) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const diaAlvo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const hoje = new Date(agoraMs - 3 * 3600e3);
  const diaHoje = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((diaHoje - diaAlvo) / 864e5);
}

function planejamentoPorProposito(funilLeads) {
  const agoraMs = Date.now();
  const porOwner = {};
  const pega = function (ownerId) {
    if (!porOwner[ownerId]) {
      porOwner[ownerId] = { cobrar: [], relac: [], follow: [] };
    }
    return porOwner[ownerId];
  };

  Object.entries(funilLeads || {}).forEach(function (par) {
    const stageId = String(par[0]);
    (par[1] || []).forEach(function (l) {
      const ownerId = String(l.ownerId || '');
      if (!ownerId) return;
      const balde = pega(ownerId);

      /* COBRAR: quem está em Ag. Pagamento esperando o dinheiro entrar. */
      if (stageId === String(STAGES.agPagamento)) {
        balde.cobrar.push(planItem({ ...l, stageId: stageId }, 'cobrar', agoraMs));
        return;
      }

      /* RELACIONAMENTO: cliente da base — quem já fechou. */
      if (PLAN_ETAPAS_BASE.indexOf(stageId) >= 0) {
        balde.relac.push(planItem({ ...l, stageId: stageId }, 'relac', agoraMs));
        return;
      }

      /* FOLLOW-UP: negócio aberto com próximo passo datado VENCIDO ou para hoje.
         Escolha do Julyan em 23/09. A data futura NÃO entra: aquilo é compromisso em
         pé, e o dia dele não começa por quem já tem data combinada. */
      if (OPEN_STAGES.indexOf(stageId) < 0) return;
      const alvo = l.proximaAtividade
        || (Array.isArray(l.tarefas) && l.tarefas.length ? l.tarefas.map(function (x) { return x && x.timestamp; }).filter(Boolean).sort().pop() : null);
      const atraso = planAtrasoDias(alvo, agoraMs);
      if (atraso == null || atraso < 0) return;
      const it = planItem({ ...l, stageId: stageId }, 'follow', agoraMs);
      it.atrasoDias = atraso;
      it.passoEra = alvo;
      balde.follow.push(it);
    });
  });

  /* AS FAIXAS. A da cobrança sai de SLA_DAYS — a régua do Ag. Pagamento é 2 dias, e
     não os 7 que a prancha supôs (7 é a da Negociação). */
  const reguaPgto = SLA_DAYS[STAGES.agPagamento] || 2;
  const saida = {};
  Object.keys(porOwner).forEach(function (ownerId) {
    const b = porOwner[ownerId];
    b.cobrar.sort(function (x, y) { return (y.dias || 0) - (x.dias || 0); });
    b.relac.sort(function (x, y) { return (y.dias || 0) - (x.dias || 0); });
    b.follow.sort(function (x, y) { return (y.atrasoDias || 0) - (x.atrasoDias || 0); });
    const conta = function (lista, f) { return lista.filter(f).length; };
    saida[ownerId] = {
      cobrar: {
        status: 'ok', total: b.cobrar.length, itens: b.cobrar, regua: reguaPgto,
        faixas: [
          { id: 'todos', rot: 'todos', n: b.cobrar.length },
          { id: 'acima', rot: 'acima da régua (>' + reguaPgto + 'd)', n: conta(b.cobrar, function (x) { return (x.dias || 0) > reguaPgto; }) },
          { id: 'dentro', rot: 'dentro da régua', n: conta(b.cobrar, function (x) { return (x.dias || 0) <= reguaPgto; }) }
        ]
      },
      relac: {
        status: 'ok', total: b.relac.length, itens: b.relac,
        faixas: [
          { id: 'todos', rot: 'todos', n: b.relac.length },
          { id: 'ganho', rot: 'Ganho', n: conta(b.relac, function (x) { return x.stageId === String(STAGES.ganho1); }) },
          { id: 'onboarding', rot: 'Onboarding', n: conta(b.relac, function (x) { return x.stageId === String(STAGES.ganho2); }) }
        ]
      },
      follow: {
        status: 'ok', total: b.follow.length, itens: b.follow,
        faixas: [
          { id: 'todos', rot: 'todos', n: b.follow.length },
          { id: '15+', rot: '15d+', n: conta(b.follow, function (x) { return x.atrasoDias >= 15; }) },
          { id: '8-14', rot: '8–14d', n: conta(b.follow, function (x) { return x.atrasoDias >= 8 && x.atrasoDias <= 14; }) },
          { id: '1-7', rot: '1–7d', n: conta(b.follow, function (x) { return x.atrasoDias >= 1 && x.atrasoDias <= 7; }) },
          { id: 'hoje', rot: 'para hoje', n: conta(b.follow, function (x) { return x.atrasoDias === 0; }) }
        ]
      }
    };
  });

  return {
    lidoEm: new Date(agoraMs).toISOString(),
    reguaCobranca: reguaPgto,
    porOwner: saida,
    /* DECLARADO, E NÃO IMPLÍCITO: quem procurar `nova` aqui tem de achar a explicação,
       não o silêncio. */
    naoCalculadoAqui: { nova: 'leads_prospeccao é do Supabase e só o navegador lê', rua: 'não tem lista: é sair e bater porta' }
  };
}

const SLA_DAYS = {
  [STAGES.prospeccao]: 5,
  [STAGES.visita]: 5,
  [STAGES.diagnostico]: 4,
  [STAGES.demoProposta]: 3,
  [STAGES.negociacao]: 7,
  [STAGES.agPagamento]: 2
};

/* ══ A RÉGUA NÃO PUNE QUEM COMBINOU DATA (23/09/26) ═══════════════════════════════
   Pergunta da Kelly: ela negociou, o cliente pediu retorno em 15 dias, ela marcou o
   próximo passo — e a régua de 7 dias da Negociação a marcava como estourada no
   oitavo. Ela era cobrada 8 dias antes da data que ela mesma combinou.

   TRÊS ESTADOS: no ritmo · combinado · travado. Combinado é fora da régua COM data
   futura. A data compra prazo, não anistia: quando ela passa, notes_next_activity_date
   deixa de ser futura e o negócio volta a travado no mesmo sync.

   UMA FUNÇÃO SÓ porque a régua é calculada em DOIS lugares deste arquivo (o mapa de
   funilLeads e o laço por executivo) e telas diferentes leem cada um. Duas cópias da
   mesma regra é como as telas passam a discordar sobre o mesmo negócio — esta base já
   pagou por isso mais de uma vez. */
function estadoDaRegua(dias, stageId, proximaAtividadeRaw) {
  const regua = SLA_DAYS[stageId] || 999;
  const foraDaRegua = dias > regua;
  /* FUTURA DE VERDADE: o HubSpot mantém notes_next_activity_date mesmo depois do
     prazo passar, então comparar com agora é o que separa "combinado" de "vencido". */
  let combinadaEm = null;
  if (proximaAtividadeRaw) {
    const dt = new Date(proximaAtividadeRaw);
    if (!isNaN(dt.getTime()) && dt.getTime() > Date.now()) combinadaEm = dt.toISOString();
  }
  const aguardando = foraDaRegua && !!combinadaEm;
  return {
    slaBreach: foraDaRegua && !aguardando,
    aguardando: aguardando,
    aguardandoAte: aguardando ? combinadaEm : null,
    proximaAtividade: combinadaEm
  };
}

// Rank de "quão avançado" cada etapa é — usado pra calcular a temperatura do lead
// (quanto mais avançado + dentro do prazo, mais quente).
const STAGE_RANK = {
  [STAGES.prospeccao]: 1,
  [STAGES.visita]: 2,
  [STAGES.diagnostico]: 3,
  [STAGES.demoProposta]: 4,
  [STAGES.negociacao]: 5,
  [STAGES.agPagamento]: 6
};

/* ══ A TEMPERATURA TEM UMA CONTA, E ELA MORA FORA DAQUI (08/09/26) ══════════════════
   A regra inteira está em lib/temperatura.js e a régua em data/temperatura.json.
   Aqui só se aplica.

   STAGE_RANK CONTINUA ACIMA porque outras cinco contas do robô a usam (histórico de
   etapas, porta de entrada, avanço). O rank que a TEMPERATURA usa é o da config, de
   propósito: inserir etapa no pipeline não pode obrigar a mexer em código. A guarda
   logo abaixo é o preço disso. */
const { temperaturaDoNegocio } = require('../lib/temperatura.js');
const CONFIG_TEMPERATURA = require('../data/temperatura.json');

/* AS DUAS FONTES DE RANK TÊM DE CONCORDAR. STAGE_RANK (código) e a config da
   temperatura (JSON) descrevem a mesma ordem do funil. Editar uma e não a outra faria
   a temperatura ranquear por uma ordem que o resto do robô não usa — sem erro, sem
   aviso, só com o ranking errado na TV da sala. Reprova no sync, e falhar aqui é
   barato: o robô roda a cada 2h e o snapshot anterior continua no ar. */
Object.keys(STAGE_RANK).forEach(function (idEtapa) {
  const naConfig = (CONFIG_TEMPERATURA.etapa || {})[idEtapa];
  if (Number(naConfig) !== Number(STAGE_RANK[idEtapa])) {
    throw new Error('data/temperatura.json e STAGE_RANK discordam na etapa ' + idEtapa
      + ' (config=' + naConfig + ', codigo=' + STAGE_RANK[idEtapa] + ')'
      + ' — a temperatura ranquearia por uma ordem que o resto do robo nao usa.');
  }
});

/* Decora um negócio ABERTO com a temperatura. Etapa fora do funil de Field Sales
   (Backlog, Perdido, Reciclagem, Onboarding) volta INTACTA: negócio perdido não tem
   temperatura, e dar 12° a ele encheria o ranking do gestor de coisa morta. */
function comTemperatura(lead, stageIdExplicito) {
  const id = String(stageIdExplicito || (lead && lead.stageId) || '');
  if (!(CONFIG_TEMPERATURA.etapa || {})[id]) return lead;
  const medida = temperaturaDoNegocio({
    stageId: id,
    mrr: lead.mrr != null ? lead.mrr : lead.valor_de_mrr,
    valor: lead.valor,
    ultimaInteracao: lead.ultimaInteracao
  }, { config: CONFIG_TEMPERATURA });
  lead.temp = medida.nota;
  lead.tempFaixa = medida.faixa;
  lead.tempParcial = medida.parcial;
  lead.tempDiasSemToque = medida.diasSemToque;
  /* A PALAVRA DERIVA DA NOTA. Manter as duas independentes seria a mesma doença com
     nome novo: a tela mostraria "82°" ao lado de um selo "morno". */
  lead.temperatura = medida.faixa;
  return lead;
}

// Descrições curtas de cada etapa, usadas nos tooltips do painel
const STAGE_DESCRIPTIONS = {
  [STAGES.prospeccao]: 'Primeiro contato feito (PAP). Deveria avançar ou virar decisão em até 5 dias.',
  [STAGES.visita]: 'Visita presencial já ocorreu. Esperado confirmar próximo passo em até 5 dias.',
  [STAGES.diagnostico]: 'Conversa com o decisor em andamento. SLA de 4 dias pra avançar pra demo.',
  [STAGES.demoProposta]: 'Demonstração feita, proposta em análise. SLA de 3 dias pra negociação.',
  [STAGES.negociacao]: 'Negociação de condições comerciais. SLA de 7 dias pra fechar.',
  [STAGES.agPagamento]: 'Contrato fechado, aguardando pagamento. SLA de 2 dias — gargalo crítico se estourar.'
};

// ══ OS REPS VEM DE data/usuarios.json, E NAO DE UMA LISTA AQUI (07/09/26) ═══════════
//
// ESTA LISTA ERA CRAVADA, com seis ownerId fixos, e era a TERCEIRA copia do time:
//   data/usuarios.json        o que a tela sabe, e o que api/dados.js autoriza
//   mapa_usuarios (Supabase)  o que o banco deixa entrar, via RLS
//   REPS aqui                 de onde o FUNIL do snapshot e montado
//
// Foi a terceira que causou o defeito de 07/09: o Julyan abriu o Cockpit com o login
// da Renata e viu "nada liberado, apenas playbook". Mesmo depois de ela ganhar owner
// real do HubSpot e sair do portao `aComecar`, `DATA.reps` nao teria linha para ela —
// os cinco reps novos nunca entraram nesta lista, e e desta lista que sai todo filtro
// por owner nas consultas ao HubSpot (owners, nomes, e o laco por rep no fim).
//
// Conferido antes de trocar: os seis nomes cravados batiam BYTE A BYTE com os de
// usuarios.json, entao derivar reproduz a lista de hoje e acrescenta os cinco.
//
// A Amanda entra mesmo com fieldStatus "transicao_inside", porque ela esta na lista de
// hoje — a unificacao nao pode mudar quem e do time de calado. O corte e outro: quem
// nao tem ownerId, e quem ainda esta com placeholder "pendente_*" (cadastrado antes de
// existir o usuario no CRM). Owner que nao existe no HubSpot faz a API devolver 400 e
// derruba o robo inteiro.
const REPS = (function () {
  const arq = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'usuarios.json'), 'utf8'));
  const lista = Array.isArray(arq) ? arq : (arq.usuarios || []);
  const reps = lista
    .filter(u => u && u.role === 'rep' && u.ownerId && !String(u.ownerId).startsWith('pendente_'))
    .map(u => ({ ownerId: String(u.ownerId), name: u.nome }));
  if (!reps.length) {
    /* SEM REPS, NAO RODA. Um snapshot com zero rep sobrescreveria o funil do time por um
       arquivo que nao foi lido — e a tela mostraria o mes inteiro zerado, sem erro. */
    console.error('ABORTANDO: data/usuarios.json nao rendeu nenhum rep com ownerId valido.');
    process.exit(1);
  }
  console.log('REPS de data/usuarios.json: ' + reps.length + ' executivos (' +
    reps.map(r => r.name).join(', ') + ')');
  return reps;
})();

// BUG REAL corrigido aqui (30/07): todo cálculo de "hoje"/"mês corrente" abaixo usava
// now.getUTCFullYear()/Month()/Date() direto — isso é a data em UTC, não em Brasília.
// Entre ~21h e 23h59 (horário de Brasília), o UTC já virou o dia seguinte (UTC = Brasília+3h).
// Se o workflow roda nesse intervalo (ex: "Run workflow" manual à noite), o script achava
// que "hoje" já era amanhã — a janela de busca (meia-noite de "hoje" até agora) ficava
// invertida (início depois do fim) e a API sempre voltava vazio. Era por isso que visitas/
// avanços/propostas/fechamentos de hoje sumiam mesmo com o Expogo sincronizado certinho.
// Corrige convertendo pro horário de Brasília ANTES de extrair ano/mês/dia.
function agoraBrasilia() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}
function hojeISOBrasilia() {
  return agoraBrasilia().toISOString().slice(0, 10);
}

// Início da SEMANA CIVIL corrente: segunda-feira 00:00 no horário de Brasília.
// (Correção de consistência 06/08/26: todas as métricas "da semana" — leads criados,
// ganhos do time e ganhos por executivo — usavam janela ROLANTE de 7 dias (now - 7d),
// mas a interface chama tudo de "essa semana"/"Pódio da semana". Rolante de 7 dias numa
// quinta inclui a quinta/sexta da semana PASSADA — número certo pro rótulo errado.
// Regra oficial agora: semana = segunda 00:00 América/São_Paulo até agora.)
// 00:00 em Brasília = 03:00 UTC do mesmo dia civil (mesma convenção do inicioMes abaixo).
function inicioSemanaBrasilia() {
  const b = agoraBrasilia();                    // deslocado -3h; getUTC* = calendário de Brasília
  const diasDesdeSegunda = (b.getUTCDay() + 6) % 7; // seg=0, ter=1 ... dom=6
  return Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - diasDesdeSegunda, 3, 0, 0);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// HubSpot limita quantas chamadas podem chegar POR SEGUNDO. Por isso toda chamada
// passa por aqui: espera um pouco antes de cada uma, e se mesmo assim tomar 429
// (rate limit), espera mais e tenta de novo (até 5 vezes).
async function hsSearch(body, attempt = 1) {
  await sleep(350); // ~3 chamadas por segundo, bem abaixo do limite do HubSpot

  const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (res.status === 429 && attempt <= 5) {
    const waitMs = 1000 * attempt;
    console.log(`Rate limit do HubSpot — esperando ${waitMs}ms e tentando de novo (tentativa ${attempt}/5)...`);
    await sleep(waitMs);
    return hsSearch(body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Mesma coisa do hsSearch, mas pra QUALQUER objeto (tasks, meetings...) — o de cima
// é fixo em /deals/search. Mesmo rate-limit, mesmo retry.
async function hsSearchTipo(objectType, body, attempt = 1) {
  await sleep(350);
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 429 && attempt <= 5) {
    const waitMs = 1000 * attempt;
    console.log(`Rate limit do HubSpot (${objectType}) — esperando ${waitMs}ms (tentativa ${attempt}/5)...`);
    await sleep(waitMs);
    return hsSearchTipo(objectType, body, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status} em ${objectType}: ${text}`);
  }
  return res.json();
}
async function hsSearchTipoAll(objectType, body) {
  let todos = [];
  let after = undefined;
  let seguraLoop = 0;
  while (seguraLoop < 20) {
    seguraLoop++;
    const data = await hsSearchTipo(objectType, { ...body, limit: 100, after });
    todos = todos.concat(data.results || []);
    after = data.paging && data.paging.next ? data.paging.next.after : null;
    if (!after) break;
  }
  return todos;
}

// ---- Snapshot diário na tabela `dailies` (Supabase) ----
// Antes, o número de "Realizado" só era salvo se ALGUÉM abrisse a aba Daily naquele dia —
// se ninguém abrisse à noite, a última visita/avanço do dia se perdia pra sempre (o número
// "hoje" do hubspot.json é sempre o instantâneo do momento do refresh, não guarda histórico).
// Agora o próprio robô grava, em TODO refresh — sem depender de ninguém com a tela aberta.
// Sem SUPABASE_URL/SERVICE_KEY configurados, pula com aviso e o resto do fetch segue normal.
// BUG REAL ENCONTRADO E CORRIGIDO (15/08/26): a tabela `dailies` tem `criado_por` como
// NOT NULL (usado pelas escritas manuais do Cockpit — ver `sessaoAtual.email` no
// template — e já corrigido antes em scripts/backfill-dailies-semana.js com
// 'sistema-backfill'). Esta função nunca ganhou o mesmo ajuste: TODO POST daqui vinha
// sem o campo e o Postgres recusava com 400 "null value in column criado_por violates
// not-null constraint". Resultado medido: os 3 refreshes diários falhavam a escrita da
// Daily pros 7 executivos, 100% das vezes, desde que a coluna passou a ser obrigatória —
// e o sync-status só reportava o sintoma a jusante ("linha não encontrada"), nunca a
// causa. 'sistema-fetch-hubspot' identifica que a linha veio deste robô, não de alguém
// digitando na tela nem do backfill manual.
// ══ O SNAPSHOT SAI DO REPOSITORIO (02/09/26) ═══════════════════════════════════════
// Cada rodada deste robo fazia um commit em data/*.json, e todo commit gera um deploy na
// Vercel. Com o teto de 100 deploys/dia do plano Hobby, isso limitava a atualizacao a ~15
// rodadas por dia e obrigava um cooldown de 20 minutos no webhook do HubSpot — ou seja, o
// executivo mexia no CRM e o Cockpit podia levar 20 minutos para saber.
//
// Agora o mesmo JSON e publicado numa tabela do Supabase (public.cockpit_snapshot, uma
// linha por arquivo). A rota /api/dados le de la. Sem commit, sem deploy, sem teto.
//
// OS ARQUIVOS CONTINUAM SENDO GRAVADOS nesta etapa, de proposito: enquanto a leitura pelo
// Supabase nao estiver comprovada em producao, o arquivo e a rede de seguranca da rota, e
// o preview local (scripts/preview-local.js) le o arquivo direto. Parar de commitar e o
// passo seguinte, depois de eu ver a rota servindo do Supabase.
//
// SE A PUBLICACAO FALHAR, A RODADA NAO MORRE: ela avisa e segue. O robo existe para trazer
// o dado; perder a rodada inteira porque a publicacao falhou seria trocar um problema por
// um pior. O sync-status registra a falha para o gestor ver na tela.
/* A PUBLICACAO DO SNAPSHOT MORA EM lib/publicar-snapshot.js (08/09/26).
   Havia uma copia aqui, byte a byte a mesma logica — e o comentario do proprio lib diz
   que ele nasceu "para a mesma funcao nao ser copiada em tres produtores". A copia
   sobreviveu aquela limpeza.

   O que forcou a juntar foi o FAROL: ele tem de ser tocado em TODA publicacao, e com
   duas implementacoes o produtor esquecido publicaria dado novo sem avisar as abas —
   um mecanismo de frescor que finge cobrir e deixa metade de fora. */
const { publicarSnapshot } = require('../lib/publicar-snapshot.js');
async function gravarSnapshotDaily(ownerId, dataISO, campos) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { ok: true, skipped: true };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/dailies?on_conflict=owner_id,data`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ owner_id: String(ownerId), data: dataISO, criado_por: 'sistema-fetch-hubspot', ...campos }])
    });
    if (!res.ok) {
      const corpo = await res.text();
      console.log(`Aviso: snapshot diário (${ownerId}/${dataISO}) não salvou — ${res.status} ${corpo}`);
      return { ok: false, status: res.status, error: corpo };
    }
    return { ok: true };
  } catch (e) {
    console.log(`Aviso: snapshot diário (${ownerId}/${dataISO}) falhou — ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// AUTOMAÇÃO 3 (13/08/26) — "quero segurança nos dados e veracidade". Escrever com
// sucesso (HTTP 200) não é a mesma coisa que o dado estar realmente correto no banco —
// um POST pode retornar OK e o merge-duplicates fazer algo inesperado, ou uma corrida
// entre a rodada de "hoje" e a de "ontem" pode se sobrepor. Depois de gravar, LÊ DE
// VOLTA e confere se o que está no banco bate byte a byte com o que mandamos. Se não
// bater, é registrado como falha de sincronização — não fica só um "parece que deu
// certo", vira um fato conferido.
async function gravarSnapshotDailyVerificado(ownerId, nomeRep, dataISO, campos) {
  const escrita = await gravarSnapshotDaily(ownerId, dataISO, campos);
  if (escrita.skipped) return;
  // Se a própria escrita já veio com erro do Postgres/Supabase (ex.: violação de NOT
  // NULL, tipo errado, RLS), registra a CAUSA real agora — não faz sentido esperar a
  // verificação pós-escrita pra só reportar "linha não encontrada", escondendo o motivo
  // verdadeiro do gestor (era exatamente esse o buraco que gerou os 7 avisos genéricos
  // de 15/08/26; ver comentário em gravarSnapshotDaily).
  if (!escrita.ok) {
    registrarFalhaSync(ownerId, nomeRep, dataISO, 'escrita',
      new Error(`Supabase recusou o upsert (status ${escrita.status || '—'}): ${escrita.error || 'erro desconhecido'}`));
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/dailies?owner_id=eq.${encodeURIComponent(String(ownerId))}&data=eq.${dataISO}&select=realizado_visitas,realizado_avancos,realizado_propostas,realizado_fechamentos`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const linhas = res.ok ? await res.json() : null;
    const linha = linhas && linhas[0];
    const bateu = linha
      && Number(linha.realizado_visitas || 0) === Number(campos.realizado_visitas || 0)
      && Number(linha.realizado_avancos || 0) === Number(campos.realizado_avancos || 0)
      && Number(linha.realizado_propostas || 0) === Number(campos.realizado_propostas || 0)
      && Number(linha.realizado_fechamentos || 0) === Number(campos.realizado_fechamentos || 0);
    if (!bateu) {
      registrarFalhaSync(ownerId, nomeRep, dataISO, 'verificação pós-escrita',
        new Error(linha ? `banco tem ${JSON.stringify(linha)}, devia ter ${JSON.stringify(campos)}` : 'linha não encontrada depois de gravar'));
    }
  } catch (e) {
    registrarFalhaSync(ownerId, nomeRep, dataISO, 'verificação pós-escrita', e);
  }
}

// AUTOMAÇÃO 2/3 — coletor de falhas desta execução. Isolado num array de módulo (não
// um arquivo à parte) porque só precisa viver durante esta rodada: no fim do script,
// vira data/sync-status.json (ver final do arquivo), que o cockpit lê como
// DATA.syncStatus e mostra um aviso pro gestor — sem precisar de tabela nova no
// Supabase nem de acesso a log do GitHub Actions pra descobrir que algo falhou.
const falhasSyncDaily = [];
function registrarFalhaSync(ownerId, nomeRep, dataISO, etapa, erro) {
  const msg = (erro && erro.message) || String(erro);
  console.log(`AVISO DE SYNC — ${nomeRep || ownerId} (${dataISO}, ${etapa}): ${msg}`);
  falhasSyncDaily.push({ ownerId: String(ownerId), nome: nomeRep || null, data: dataISO, etapa, erro: msg, em: new Date().toISOString() });
}

// ---- Agenda da semana (aba Agenda do cockpit) ----
// O app de campo grava no HubSpot: reunião vira MEETING e follow-up vira TASK.
// Busca os dois, dos executivos ativos, de 30 dias atrás até 90 pra frente
// (a aba navega entre semanas, então precisa de passado e futuro).
// A normalização (tipo, fuso, prefixo do título) mora no template — aqui vai cru.
// ---- Associação atividade -> negócio (11/08/26) ----
// Lê em lote quais negócios estão associados a cada tarefa/nota. A API v4 de
// associações aceita 100 ids por chamada, então o custo é baixo mesmo com centenas
// de atividades na janela da agenda.
async function hsAssociacoesEmLote(deObjeto, paraObjeto, ids, attempt = 1) {
  if (!ids.length) return {};
  await sleep(350);
  const res = await fetch(`https://api.hubapi.com/crm/v4/associations/${deObjeto}/${paraObjeto}/batch/read`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: ids.map(id => ({ id: String(id) })) })
  });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * attempt);
    return hsAssociacoesEmLote(deObjeto, paraObjeto, ids, attempt + 1);
  }
  if (!res.ok) {
    // Associação é enriquecimento: se falhar, a agenda continua funcionando com o
    // título cru. Não vale derrubar o build noturno inteiro por causa disso.
    console.log(`Aviso: associações ${deObjeto}->${paraObjeto} falharam (${res.status}) — segue sem enriquecer.`);
    return {};
  }
  const data = await res.json();
  const mapa = {};
  (data.results || []).forEach(r => {
    const de = r.from && r.from.id;
    const primeiro = (r.to || [])[0];
    if (de && primeiro && primeiro.toObjectId) mapa[String(de)] = String(primeiro.toObjectId);
  });
  return mapa;
}

// BLOCO 44 (14/08/26) — "ver tudo... tarefas/compromissos já agendados" (Julyan). Lê
// TODAS as tarefas em aberto associadas a uma lista de negócios, não só a primeira
// (diferente de hsAssociacoesEmLote, que guarda só r.to[0] — aqui cada negócio pode ter
// mais de um follow-up marcado, e a ficha precisa da lista completa, não de uma única).
// Confirmado com a conta real (query_crm_data) que o app de campo já associa tarefa
// a negócio nesta pipeline — não é um dado vazio que eu estaria construindo do nada.
async function hsTarefasAbertasDosNegocios(dealIds) {
  if (!dealIds.length) return {};
  // Batch/read da API v4 de associações aceita até 100 ids por chamada — igual ao
  // hsAssociacoesEmLote acima. Prospecção sozinha já passa de 200 negócios (comentário
  // de stageDealsTeamWide), então isso PRECISA paginar, não é só teórico.
  const taskIdsPorDeal = {};
  const todosTaskIds = [];
  for (let i = 0; i < dealIds.length; i += 100) {
    const lote = dealIds.slice(i, i + 100);
    let assoc = null;
    for (let tentativa = 1; tentativa <= 5; tentativa++) {
      await sleep(350);
      const res = await fetch('https://api.hubapi.com/crm/v4/associations/deals/tasks/batch/read', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: lote.map(id => ({ id: String(id) })) })
      });
      if (res.status === 429) { await sleep(1000 * tentativa); continue; }
      if (!res.ok) { console.log(`Aviso: associações deals->tasks falharam (${res.status}) — ficha segue sem tarefas agendadas para este lote.`); break; }
      assoc = await res.json();
      break;
    }
    if (!assoc) continue;
    (assoc.results || []).forEach(r => {
      const dealId = r.from && r.from.id;
      const taskIds = (r.to || []).map(t => t.toObjectId).filter(Boolean).map(String);
      if (dealId && taskIds.length) { taskIdsPorDeal[String(dealId)] = taskIds; todosTaskIds.push(...taskIds); }
    });
  }
  if (!todosTaskIds.length) return {};

  // Lê as propriedades das tarefas em lotes de 100 (limite da API de batch/read).
  const props = {};
  for (let i = 0; i < todosTaskIds.length; i += 100) {
    const lote = todosTaskIds.slice(i, i + 100);
    await sleep(350);
    const resTask = await fetch('https://api.hubapi.com/crm/v3/objects/tasks/batch/read', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: ['hs_task_subject', 'hs_timestamp', 'hs_task_status'], inputs: lote.map(id => ({ id })) })
    });
    if (!resTask.ok) { console.log(`Aviso: leitura em lote de tarefas falhou (${resTask.status}) — ficha segue sem tarefas agendadas.`); continue; }
    const dataTask = await resTask.json();
    (dataTask.results || []).forEach(t => { props[String(t.id)] = t.properties || {}; });
  }

  // Monta o mapa final: só tarefas EM ABERTO (NOT_STARTED), ordenadas pela data mais
  // próxima, no máximo 3 por negócio — a ficha é um resumo, não a lista completa do CRM.
  const mapaFinal = {};
  Object.entries(taskIdsPorDeal).forEach(([dealId, taskIds]) => {
    const abertas = taskIds
      .map(tid => props[tid])
      .filter(p => p && p.hs_task_status === 'NOT_STARTED' && p.hs_task_subject)
      .map(p => ({ subject: p.hs_task_subject, timestamp: p.hs_timestamp || null }))
      .sort((a, b) => (a.timestamp || '9999') < (b.timestamp || '9999') ? -1 : 1)
      .slice(0, 3);
    if (abertas.length) mapaFinal[dealId] = abertas;
  });
  return mapaFinal;
}

// Lê nome e dono de vários negócios de uma vez.
async function hsNegociosEmLote(ids, attempt = 1) {
  if (!ids.length) return {};
  await sleep(350);
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: ['dealname', 'hubspot_owner_id', 'pipeline'], inputs: ids.map(id => ({ id: String(id) })) })
  });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * attempt);
    return hsNegociosEmLote(ids, attempt + 1);
  }
  if (!res.ok) {
    console.log(`Aviso: leitura em lote de negócios falhou (${res.status}) — segue sem enriquecer.`);
    return {};
  }
  const data = await res.json();
  const mapa = {};
  (data.results || []).forEach(d => {
    mapa[String(d.id)] = {
      nome: (d.properties || {}).dealname || null,
      ownerId: (d.properties || {}).hubspot_owner_id || null,
      pipeline: (d.properties || {}).pipeline || null
    };
  });
  return mapa;
}

// Enriquece os itens da agenda com o negócio associado: nome do lead (autoritativo) e
// dono (resolve a nota do Expogo que chega sem hubspot_owner_id).
async function enriquecerAgendaComNegocio(itens) {
  const porTipo = { tasks: [], notes: [], meetings: [] };
  itens.forEach(it => {
    if (!it.hs_object_id) return;
    if (it.hs_task_subject !== undefined) porTipo.tasks.push(it.hs_object_id);
    else if (it.hs_note_body !== undefined) porTipo.notes.push(it.hs_object_id);
    else if (it.hs_meeting_title !== undefined) porTipo.meetings.push(it.hs_object_id);
  });

  const assoc = {};
  for (const tipo of ['tasks', 'notes', 'meetings']) {
    const ids = porTipo[tipo];
    for (let i = 0; i < ids.length; i += 100) {
      const fatia = ids.slice(i, i + 100);
      const m = await hsAssociacoesEmLote(tipo, 'deals', fatia);
      Object.entries(m).forEach(([atividadeId, dealId]) => { assoc[atividadeId] = dealId; });
    }
  }

  const dealIds = [...new Set(Object.values(assoc))];
  const negocios = {};
  for (let i = 0; i < dealIds.length; i += 100) {
    const m = await hsNegociosEmLote(dealIds.slice(i, i + 100));
    Object.assign(negocios, m);
  }

  let comNome = 0, donoResolvido = 0;
  itens.forEach(it => {
    const dealId = assoc[String(it.hs_object_id)];
    if (!dealId) return;
    const neg = negocios[dealId];
    if (!neg) return;
    it.lead_nome = neg.nome || null;                 // nome do lead, direto do negócio
    it.lead_deal_id = dealId;
    it.lead_owner_id = neg.ownerId || null;
    if (neg.nome) comNome++;
    if (!it.hubspot_owner_id && neg.ownerId) donoResolvido++;
  });
  console.log(`Agenda: ${comNome} de ${itens.length} itens ganharam nome do lead pela associação; ${donoResolvido} tiveram o dono resolvido pelo negócio.`);
  return itens;
}

async function fetchAgenda() {
  const agoraMs = Date.now();
  // 60 dias pra trás (era 30): o "Backlog aprovado" da Prospecção agora conta "visitada"
  // pela TAREFA de visita do Expogo — com 30 dias, uma visita do começo do ciclo mensal
  // sumia da conta e o restaurante voltava a aparecer como não-visitado. A grade da
  // Agenda não muda (filtra por semana); só o payload das tasks cresce um pouco.
  const ini = String(agoraMs - 60 * 86400000);
  const fim = String(agoraMs + 90 * 86400000);
  const owners = REPS.map(r => r.ownerId);
  const itens = [];

  const meetings = await hsSearchTipoAll('meetings', {
    filterGroups: [{ filters: [
      { propertyName: 'hubspot_owner_id', operator: 'IN', values: owners },
      { propertyName: 'hs_meeting_start_time', operator: 'BETWEEN', value: ini, highValue: fim }
    ] }],
    properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_meeting_start_time', 'hs_meeting_end_time',
      'hs_meeting_outcome', 'hs_meeting_location', 'hubspot_owner_id', 'hs_createdate'],
    sorts: [{ propertyName: 'hs_meeting_start_time', direction: 'ASCENDING' }]
  });
  meetings.forEach(m => itens.push({ ...m.properties, hs_object_id: m.id }));

  const tasks = await hsSearchTipoAll('tasks', {
    filterGroups: [{ filters: [
      { propertyName: 'hubspot_owner_id', operator: 'IN', values: owners },
      { propertyName: 'hs_timestamp', operator: 'BETWEEN', value: ini, highValue: fim }
    ] }],
    properties: ['hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_task_type',
      'hs_timestamp', 'hubspot_owner_id', 'hs_createdate'],
    sorts: [{ propertyName: 'hs_timestamp', direction: 'ASCENDING' }]
  });
  tasks.forEach(t => itens.push({ ...t.properties, hs_object_id: t.id }));

  // Follow-up do app agora vira OBSERVAÇÃO (nota) no HubSpot, no modelo:
  //   Follow Up - <restaurante>
  //   Agendado para: 10/08/2026, 16:00
  //   <texto do vendedor>
  //   — Nome do Vendedor (via App Outbound)
  // Detalhe descoberto no registro real: a nota chega SEM hubspot_owner_id — por isso
  // aqui NÃO filtra por dono (o template identifica o executivo pelo rodapé). A busca
  // usa a frase "Agendado para" + corte fino no corpo pra não carregar as notas das
  // outras automações (panorama de perdas, onboarding etc.).
  const notas = await hsSearchTipoAll('notes', {
    filterGroups: [{ filters: [
      { propertyName: 'hs_timestamp', operator: 'BETWEEN', value: ini, highValue: fim },
      { propertyName: 'hs_note_body', operator: 'CONTAINS_TOKEN', value: '"Agendado para"' }
    ] }],
    properties: ['hs_note_body', 'hs_timestamp', 'hubspot_owner_id', 'hs_createdate'],
    sorts: [{ propertyName: 'hs_timestamp', direction: 'ASCENDING' }]
  });
  notas
    .filter(nt => /^\s*follow\s*up\s*[-–:]/i.test(
      String(nt.properties.hs_note_body || '').replace(/<[^>]*>/g, ' ').trim()
    ))
    .forEach(nt => itens.push({ ...nt.properties, hs_object_id: nt.id }));

  await enriquecerAgendaComNegocio(itens);
  return { geradoEm: new Date().toISOString(), itens };
}

/* ══ CADÊNCIA DIÁRIA: ATIVIDADE POR EXECUTIVO POR DIA ÚTIL (08/09/26) ═══════════════
   Pedido do Julyan para a aba Time v2: sparkline por executivo e heatmap do time.
   Antes disto o cockpit não tinha atividade por dia em lugar nenhum — o número
   chamado "cadência" em habitosTime é o percentual de abertos não travados, que é
   outra pergunta. Sem esta função a prancha só poderia ser preenchida com a agenda
   (reuniões e follow-ups), que é um subconjunto, ou com número inventado.

   TRÊS TIPOS, E SÃO OS QUE ESTE TIME USA: tarefa (visita, revisita e follow-up do app
   de campo), reunião e nota do App Outbound. A primeira versão desta função também
   consultava `calls` e `emails` e pedia dois escopos novos no HubSpot por causa deles;
   o Julyan avisou que ninguém liga nem manda e-mail pelo CRM, e a medição confirmou:
   456 tarefas, 9 reuniões, 63 notas, ZERO ligações, ZERO e-mails na janela.

   A NOTA ENTRA, e é 12% do que o time registra: ela chega sem hubspot_owner_id, e o
   dono sai da associação com o negócio, que enriquecerAgendaComNegocio já resolve.
   `fonte` viaja no payload para a tela escrever exatamente isto — nunca "atividades
   do CRM", que sugeriria tudo, inclusive o que não é contado. */
const CADENCIA_DIAS_UTEIS = 10;

/* Os N últimos dias úteis terminando HOJE (Brasília), em ordem cronológica. */
function ultimosDiasUteisBrasilia(n) {
  const dias = [];
  const b = agoraBrasilia();
  const cursor = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
  while (dias.length < n) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dias.reverse();
}

/* Dia civil de Brasília de um instante qualquer — a mesma convenção -3h do arquivo. */
function diaBrasiliaDe(valor) {
  const ms = Date.parse(valor);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/* Recebe os ITENS DA AGENDA já buscados e enriquecidos por fetchAgenda(). Não faz
   consulta nenhuma: a primeira versão desta função pedia calls e emails ao HubSpot, e
   o Julyan mediu o óbvio antes de mim — este time não liga nem manda e-mail pelo CRM.
   Medido na janela real: 456 tarefas, 9 reuniões, 63 notas, 0 ligações, 0 e-mails. */
function fetchCadenciaDiaria(itensDaAgenda) {
  const dias = ultimosDiasUteisBrasilia(CADENCIA_DIAS_UTEIS);
  const owners = REPS.map(r => String(r.ownerId));
  const indiceDoDia = {};
  dias.forEach((d, i) => { indiceDoDia[d] = i; });

  const porOwner = {};
  owners.forEach(o => { porOwner[o] = dias.map(() => 0); });
  const porTipo = { tarefa: 0, reuniao: 0, nota: 0 };
  let semDono = 0, foraDaJanela = 0;

  (itensDaAgenda || []).forEach(it => {
    /* CADA TIPO TEM O SEU CAMPO DE DATA. Reunião usa hs_meeting_start_time (quando
       ela acontece); tarefa e nota usam hs_timestamp. hs_createdate daria "quando o
       registro foi criado", e a reunião de terça marcada na segunda cairia no dia
       errado — o heatmap existe para dizer em que dia a pessoa esteve em campo. */
    let quando = null, tipo = null;
    if (it.hs_meeting_start_time !== undefined && it.hs_meeting_start_time) { quando = it.hs_meeting_start_time; tipo = 'reuniao'; }
    else if (it.hs_task_subject !== undefined) { quando = it.hs_timestamp; tipo = 'tarefa'; }
    else if (it.hs_note_body !== undefined) { quando = it.hs_timestamp; tipo = 'nota'; }
    if (!quando || !tipo) return;

    /* O DONO DA NOTA VEM DO NEGÓCIO. As 63 notas do App Outbound chegam sem
       hubspot_owner_id — está medido no comentário de enriquecerAgendaComNegocio, que
       é justamente quem resolve isso e grava lead_owner_id. Sem esta linha, um terço
       dos follow-ups do time não entraria na cadência de ninguém. */
    const dono = String(it.hubspot_owner_id || it.lead_owner_id || '');
    if (!porOwner[dono]) { semDono++; return; }

    const dia = diaBrasiliaDe(quando);
    const i = dia == null ? undefined : indiceDoDia[dia];
    if (i === undefined) { foraDaJanela++; return; }   /* sábado, domingo, ou fora dos 10 dias */
    porOwner[dono][i]++;
    porTipo[tipo]++;
  });

  return {
    geradoEm: new Date().toISOString(),
    dias,
    porOwner,
    porTipo,
    semDono,
    foraDaJanela,
    truncado: [],
    /* A FONTE, palavra por palavra, porque a tela escreve isto no rodapé. Não cita
       ligação nem e-mail: o time não usa, e prometer contagem que não existe é pior
       do que não contar. */
    fonte: 'atividades registradas no HubSpot: visitas e follow-ups do app (tarefas), reuniões e notas do App Outbound',
    naoConta: 'ligações e e-mails — este time não os registra pelo CRM (medido: 0 na janela)'
  };
}

// Visita/revisita no app agora vira TAREFA no HubSpot// Visita/revisita no app agora vira TAREFA no HubSpot — e a Daily conta a TAREFA criada
// hoje (a ação de registrar a visita), não mais a entrada do negócio na etapa "Visita".
// Motivo: revisitar um cliente pra falar com o decisor é visita de verdade e não move
// etapa nenhuma — no modelo antigo ela simplesmente não contava.
// Conta só tarefa que é visita mesmo: título começando com Visita/Revisita, ou corpo
// assinado pelo app ("App Outbound"). Tarefa manual de cadência (D1 - Ligação etc.) fica fora.
// diaISO opcional (YYYY-MM-DD, Brasília). Sem ele, conta o dia corrente — mesmo
// comportamento de antes. Com ele, conta a JANELA FECHADA daquele dia (00h–24h BRT),
// que é o que permite gravar o realizado de ontem já consolidado.
async function visitasTarefasHojeByOwner(ownerId, diaISO) {
  /* DELEGA para lib/realizado.js (01/09/26). A regra — visita feita = tarefa COMPLETED
     criada no dia, achado de 12/08/26 na Kelly, quando o cockpit dava por feitas duas
     visitas das 10h às 9h da manhã — e a janela em horário de Brasília passaram para lá,
     porque a Minha Daily v2 faz a mesma pergunta a cada minuto e duas implementações da
     mesma conta dariam dois números para o mesmo dia. O nome desta função fica: são
     dezenas de chamadas neste arquivo e nenhuma precisa saber que a conta mudou de casa. */
  return REALIZADO.visitasFeitasNoDia(hsSearchTipo, ownerId, diaISO);
}

// Busca TODAS as páginas de uma pesquisa, sem cap de 100/200 — várias contagens
// do cockpit (leads criados, perdidos, fechados no mês, negócios por executivo)
// usavam só a 1ª página e ficavam erradas sempre que passavam do limite. Uma
// semana de 204 leads criados ou 100 perdidos (já aconteceu, é real) já bastava
// pra dar número errado. Isso resolve pra sempre, independente do volume.
/* ══ COORDENADA VALIDA, OU NULL ══════════════════════════════════════════════════════
   `Number('')` e ZERO, nao NaN — e 0,0 e um ponto valido, no Golfo da Guine. O idioma
   antigo (`x != null ? Number(x) : null` + `!isNaN`) gravava zero para coordenada vazia,
   e o executivo seguiria o pino. A interface do HubSpot deixa string vazia quando se
   limpa um campo, entao isto acontece por uso normal do CRM, nao por dado corrompido.

   Medido em 04/09/26: 0 dos 125 negocios com coordenada estavam em 0,0 — era defeito
   latente, e agora nao ha por onde ele voltar. */
function coordenadaValida(valor) {
  if (valor == null) return null;
  const txt = String(valor).trim();
  if (!txt) return null;
  const n = Number(txt);
  if (!isFinite(n)) return null;
  /* 0,0 nunca e um restaurante nosso: e o valor que aparece quando o campo foi zerado. */
  if (n === 0) return null;
  return n;
}
async function hsSearchAll(body) {
  let todos = [];
  let after = undefined;
  let seguraLoop = 0;
  while (seguraLoop < 20) { // trava de segurança — nenhuma consulta daqui deveria ter 2000+ resultados
    seguraLoop++;
    const data = await hsSearch({ ...body, limit: 100, after });
    todos = todos.concat(data.results || []);
    after = data.paging && data.paging.next ? data.paging.next.after : null;
    if (!after) break;
  }
  return todos;
}

// CORREÇÃO (16/08/26) — achado real em produção: o hero mostrava "166 negócios em
// aberto" mas o funil por etapa somava 167 (39+81+21+6+15+5). A causa: repOpenDeals
// (usado no total por executivo, que alimenta o hero) já filtra isExcludedDeal —
// negócios de teste/dummy e duplicatas conhecidas (EXCLUDED_DEAL_IDS) — mas stageTotal
// (usado no funil geral por etapa) só pegava a contagem crua da API, sem esse filtro.
// O princípio já estava escrito acima ("não devem contar em NENHUMA métrica") — só não
// tinha sido aplicado aqui. Agora busca a lista completa (não só a contagem) e filtra
// igual ao resto do sistema, pra funil e hero baterem sempre.
async function stageTotal(stageId, extraFilters = []) {
  const results = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: stageId },
        ...extraFilters
      ]
    }],
    properties: ['dealname']
  });
  return results.filter(d => !isExcludedDeal(d)).length;
}

async function createdLast7Days() {
  // Nome mantido pra não mexer nos chamadores, mas a janela agora é a SEMANA CIVIL
  // (segunda 00:00 Brasília → agora), não mais 7 dias rolantes — ver inicioSemanaBrasilia().
  const now = Date.now();
  const inicioSemana = inicioSemanaBrasilia();
  const results = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'createdate', operator: 'BETWEEN', value: String(inicioSemana), highValue: String(now) }
      ]
    }],
    /* createdate entra em 07/09/26: esta busca JA FILTRA por ele (o BETWEEN acima),
       so nao o pedia de volta. A Daily v3 do gestor precisa recortar "prospeccoes
       novas ONTEM", e sem a data por item o maximo que a tela sabia era a janela de
       7 dias inteira. Uma propriedade a mais numa busca que ja existe — nenhuma
       chamada nova ao HubSpot, nenhum custo de rota. */
    properties: ['dealname', 'hubspot_owner_id', 'createdate']
  });
  return results.filter(d => !isExcludedDeal(d));
}

// Negócios de teste/dummy (ex: "Teste", "TESTE_SONY_DIAG", "Coliseu teste") não devem contar
// em NENHUMA métrica. Detectado em auditoria manual — filtra pelo nome, case-insensitive.
/* delega para lib/realizado.js: a tela ao vivo aplica a MESMA exclusão, senão ela
   creditaria +200 pts num fechamento que o robô descarta à noite. */
function isTestDeal(dealname) {
  return REALIZADO.ehNegocioDeTeste(dealname);
}

// Negócios "Ganho" no HubSpot que são exceções conhecidas e NÃO devem contar como fechamento
// novo do executivo. Auditado com o Julyan em 30/07/2026, comparando com a planilha de julho:
// - '62640951452' "Bistrô Arena Carioca" (Bruno): duplicata do deal '59997188246'
//   ("Oportunidade - BISTRO ARENA RESTAURANTE E LANCHONETES LTDA"), mesmo cliente contado 2x.
//   O deal '59997188246' fica como o registro oficial (mais antigo, mais histórico); este some.
// - '59186260237' "Pizzaria Tradição" (Sandro): cliente REATIVADO (voltou da Reciclagem,
//   deal '59183461650', 1 dia antes), não é logo nova — não deve contar em "Novos Clientes".
// Se algum dia esses IDs forem mesclados/corrigidos direto no HubSpot, essa lista pode ser
// esvaziada. Até lá, mantém o relatório batendo com a contagem manual real.
const EXCLUDED_DEAL_IDS = ['62640951452', '59186260237'];

function isExcludedDeal(deal) {
  return REALIZADO.ehNegocioExcluido(deal);
}

// Conta quantos negócios ENTRARAM numa etapa específica nos últimos 7 dias (fluxo da semana),
// usando `closedate` — o campo padrão do HubSpot pra "quando isso foi fechado de verdade".
// IMPORTANTE: testamos hs_v2_date_entered_<etapa> primeiro, mas ele deu falso positivo num caso
// real (negócio "Uau Pizza Unidade Nova", confirmado por Julyan que NÃO fechou essa semana,
// mesmo com data de entrada na etapa recente — provavelmente resíduo da migração de pipeline
// que já bagunçou datas de entrada de etapa em lote antes). closedate é o campo certo aqui.
// Conta quantos negócios ENTRARAM numa etapa específica (ou lista de etapas) nos últimos 7
// dias, usando `closedate` — o campo padrão do HubSpot pra "quando isso foi fechado de verdade".
// Ganhos precisa checar DUAS etapas (Negócio Fechado + Enviado Onboarding) porque a automação
// de vocês move o negócio pago direto pra Onboarding — um negócio fechado ontem pode já não
// estar mais parado em "Negócio Fechado" hoje. closedate é fixo e não muda quando o negócio
// avança, então cada venda real só é contada 1 vez, não importa em qual das duas etapas está agora.
async function stageDealsLast7DaysComNomes(stageIdOuLista) {
  // Nome mantido pra não mexer nos chamadores, mas a janela agora é a SEMANA CIVIL
  // (segunda 00:00 Brasília → agora), não mais 7 dias rolantes — ver inicioSemanaBrasilia().
  const now = Date.now();
  const inicioSemana = inicioSemanaBrasilia();
  const lista = Array.isArray(stageIdOuLista) ? stageIdOuLista : [stageIdOuLista];
  const filtroEtapa = lista.length > 1
    ? { propertyName: 'dealstage', operator: 'IN', values: lista }
    : { propertyName: 'dealstage', operator: 'EQ', value: lista[0] };

  const results = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        filtroEtapa,
        { propertyName: 'closedate', operator: 'BETWEEN', value: String(inicioSemana), highValue: String(now) }
      ]
    }],
    properties: ['dealname', 'hubspot_owner_id']
  });
  return results.filter(d => !isExcludedDeal(d));
}
async function stageTotalLast7Days(stageIdOuLista) {
  const results = await stageDealsLast7DaysComNomes(stageIdOuLista);
  return results.length;
}

// Conta quantos negócios fecharam DESDE O DIA 1º DO MÊS CORRENTE (horário de Brasília),
// mesmo critério de closedate usado acima — pro KPI "Fechados no mês".
/* MOTIVO DA PERDA, ultimos 90 dias (30/08/26).

   A propriedade e `motivo_do_perdido` ("Motivo - Perda (Comercial)"), conferida no
   HubSpot: 3.263 negocios perdidos classificados neste pipeline. Existem outras tres
   parecidas (`motivo_da_perda`, `closed_lost_reason`, e as de analise por IA) — esta e a
   que o time preenche, e por isso e a que vale.

   90 dias porque perda antiga nao ensina nada sobre o time de agora. Devolve o total do
   time por motivo E por executivo, porque a assinatura de perda de cada um e diferente —
   e e ela que faz o 1:1 ser individual. */
async function motivosDePerda() {
  const noventaDias = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const results = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: STAGES.perdido },
        { propertyName: 'closedate', operator: 'GTE', value: String(noventaDias) }
      ]
    }],
    properties: ['dealname', 'hubspot_owner_id', 'motivo_do_perdido', 'closedate', 'valor_de_mrr']
  });
  const validos = results.filter(d => !isExcludedDeal(d));
  const porMotivo = {};
  const porOwner = {};
  /* acumuladores do MRR informado — ver o comentario no fim desta funcao */
  let totalMrrConhecido = 0, comMrr = 0, semMrr = 0;
  const mrrPorMotivo = {};
  const mrrPorOwner = {};
  /* EXEMPLOS PARA O CLIQUE (31/08/26). O gráfico de motivo mostrava só porcentagem, e
     clicar não tinha para onde ir. Até 8 negócios por motivo, os mais recentes — oito
     nomes é o que cabe numa conversa de Daily; mais que isso é relatório. */
  const exemplos = {};
  const maisNovoPrimeiro = [...validos].sort((a, b) => {
    const ta = Date.parse((a.properties || {}).closedate || 0) || 0;
    const tb = Date.parse((b.properties || {}).closedate || 0) || 0;
    return tb - ta;
  });
  maisNovoPrimeiro.forEach(d => {
    const p = d.properties || {};
    const motivo = String(p.motivo_do_perdido || '').trim() || 'Sem motivo preenchido';
    if (!exemplos[motivo]) exemplos[motivo] = [];
    if (exemplos[motivo].length >= 8) return;
    const dono = REPS.find(r => String(r.ownerId) === String(p.hubspot_owner_id || ''));
    exemplos[motivo].push({
      id: d.id || null,
      nome: p.dealname || 'Sem nome',
      vendedor: dono ? dono.name : null,
      ownerId: p.hubspot_owner_id ? String(p.hubspot_owner_id) : null,
      fechadoEm: p.closedate ? String(p.closedate).slice(0, 10) : null,
      mrr: Number(p.valor_de_mrr) || 0
    });
  });
  validos.forEach(d => {
    const p = d.properties || {};
    /* motivo vazio nao vira 'Outros': 'Outros' e uma escolha do time e 'sem motivo' e
       outra coisa — juntar os dois esconderia justamente o problema de cadastro. */
    const motivo = String(p.motivo_do_perdido || '').trim() || 'Sem motivo preenchido';
    const owner = String(p.hubspot_owner_id || '') || 'sem-dono';
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;
    if (!porOwner[owner]) porOwner[owner] = {};
    porOwner[owner][motivo] = (porOwner[owner][motivo] || 0) + 1;
    /* MRR INFORMADO NAS PERDAS (02/09/26, pedido do gestor). A consulta ja trazia
       valor_de_mrr e ele so era usado nos 8 exemplos por motivo — o resto ia para o
       lixo. Agora soma sobre TODOS os validos.
       O NOME IMPORTA: isto e 'MRR informado em negocios perdidos', nunca 'receita
       perdida'. Medido no portal em 02/09/26: 89 dos 975 perdidos de 90 dias tem o
       campo preenchido — 9%. Chamar de receita perdida seria multiplicar por onze o
       que se sabe. Por isso comMrr/semMrr descem junto: a tela e obrigada a mostrar
       a cobertura ao lado do numero.
       E nao ha estimativa nenhuma: quem nao tem o campo entra em semMrr e fica de fora
       da soma. Nao se multiplica perda por ticket medio. */
    const mrrDaPerda = Number(p.valor_de_mrr) || 0;
    if (mrrDaPerda > 0) {
      totalMrrConhecido += mrrDaPerda;
      comMrr += 1;
      mrrPorMotivo[motivo] = (mrrPorMotivo[motivo] || 0) + mrrDaPerda;
      mrrPorOwner[owner] = (mrrPorOwner[owner] || 0) + mrrDaPerda;
    } else {
      semMrr += 1;
    }
  });
  /* ══ QUANTO DE CADA MOTIVO É LIMPEZA EM LOTE (19/09/26) ═════════════════════════
     Julyan: "faz no gráfico de motivos também". Hoje "Outros" e "Não quer mudar de
     sistema" lideram este gráfico — e boa parte é o rótulo que sobra quando alguém
     descarta em lote um lead que nunca recebeu contato. O gestor lê aquilo como
     objeção de mercado.

     ZERO CHAMADA A MAIS: a busca acima já traz hubspot_owner_id e closedate de todos
     os perdidos de 90 dias. Só faltava aplicar a régua — que mora em lib e é a mesma
     do KPI da Semana.

     E O TOTAL DE CADA MOTIVO NÃO MUDA. porMotivo continua sendo a contagem inteira;
     emLotePorMotivo vem AO LADO. A barra do gráfico continua do tamanho que é. */
  const lote = LOTES.lotesDePerda(validos);
  const emLotePorMotivo = {};
  let emLoteTotal = 0;
  validos.forEach(function (d) {
    if (!lote.ids[String(d.id)]) return;
    const m = String((d.properties || {}).motivo_do_perdido || '').trim() || 'Sem motivo preenchido';
    emLotePorMotivo[m] = (emLotePorMotivo[m] || 0) + 1;
    emLoteTotal += 1;
  });
  console.log('Motivos de perda: ' + validos.length + ' em 90 dias, ' + emLoteTotal
    + ' marcados em lote (' + lote.lotes.length + ' sessões, régua '
    + lote.regra.minimo + '+ em ' + lote.regra.gapMin + ' min).');

  return {
    total: validos.length, dias: 90, porMotivo, porOwner, exemplos,
    totalMrrConhecido, comMrr, semMrr, mrrPorMotivo, mrrPorOwner,
    emLotePorMotivo: emLotePorMotivo, emLoteTotal: emLoteTotal,
    loteRegra: lote.regra, loteSessoes: lote.lotes.length
  };
}

/* HISTORICO DE ETAPA — a primeira conversao de verdade do produto (30/08/26).

   Até aqui o Cockpit só sabia ESTOQUE: quantos negócios estão em cada etapa agora. Isso
   nunca foi conversão, e a tela chegou a mostrar "294%" por dividir dois estoques. O que
   faltava era a data de entrada em cada etapa — e ela existe e está preenchida:
   hs_v2_date_entered_<etapa>, populada a partir de julho/26.

   Com ela dá para responder o que o gestor pergunta na segunda-feira: dos negócios que
   entraram no funil em julho, quantos chegaram à Visita? Quantos dias leva cada etapa?
   Qual o ciclo de quem fechou? A resposta é por TURMA (quem entrou no mês X) — nunca
   comparando estoques de agora.

   Duas portas de entrada, não uma: 149 negócios de jul+ago entraram direto na Visita, sem
   passar por Prospecção. Contar só a porta da Prospecção esconderia 28% do funil — então a
   consulta tem dois grupos de filtro (a API faz OU entre grupos).

   Uma consulta a mais no fetch que já roda — nada de endpoint novo (12/12 na Vercel). */
const HIST_ORDEM = [STAGES.prospeccao, STAGES.visita, STAGES.diagnostico, STAGES.demoProposta, STAGES.negociacao, STAGES.agPagamento];
const HIST_DIAS = 120;
const propEntrada = id => 'hs_v2_date_entered_' + id;

function mediana(lista) {
  if (!lista.length) return null;
  const o = [...lista].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
function percentil(lista, p) {
  if (!lista.length) return null;
  const o = [...lista].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.ceil(p * o.length) - 1)];
}

async function historicoDeEtapas() {
  const corte = Date.now() - HIST_DIAS * 24 * 60 * 60 * 1000;
  const props = [
    'dealname', 'hubspot_owner_id', 'dealstage', 'valor_de_mrr', 'createdate', 'closedate',
    ...HIST_ORDEM.map(propEntrada),
    propEntrada(STAGES.ganho1), propEntrada(STAGES.ganho2), propEntrada(STAGES.perdido)
  ];
  const results = await hsSearchAll({
    filterGroups: [
      { filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: propEntrada(STAGES.prospeccao), operator: 'GTE', value: String(corte) }
      ] },
      { filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: propEntrada(STAGES.visita), operator: 'GTE', value: String(corte) }
      ] }
    ],
    properties: props
  });

  const t = v => { const n = v ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : null; };
  const DIA = 24 * 60 * 60 * 1000;

  const negocios = results.filter(d => !isExcludedDeal(d)).map(d => {
    const p = d.properties || {};
    const entrada = {};
    HIST_ORDEM.forEach((id, i) => { const ms = t(p[propEntrada(id)]); if (ms != null) entrada[i + 1] = ms; });
    const ganho = t(p[propEntrada(STAGES.ganho1)]) || t(p[propEntrada(STAGES.ganho2)]);
    const perda = t(p[propEntrada(STAGES.perdido)]);
    const ranks = Object.keys(entrada).map(Number);
    const porta = ranks.length ? Math.min(...ranks.map(r => entrada[r])) : null;
    const rankMax = ranks.length ? Math.max(...ranks) : 0;
    return {
      /* id e closedate entram para a régua de lote (19/09/26) — a busca já os traz,
         eram só eles que ficavam de fora do objeto. */
      id: String(d.id || ''),
      owner: String(p.hubspot_owner_id || '') || 'sem-dono',
      closedate: p.closedate || null,
      etapaAtual: String(p.dealstage || ''),
      mrr: Number(p.valor_de_mrr) || 0,
      entrada, ganho, perda, porta, rankMax
    };
  }).filter(d => d.porta != null);

  const mesDe = ms => new Date(ms).toISOString().slice(0, 7);

  /* TURMA = quem entrou no funil no mês. Mês com menos de 30 negócios não vira taxa: turma
     pequena com "50% de conversão" em 2 negócios é ruído com cara de dado. */
  const turmas = {};
  negocios.forEach(d => {
    const m = mesDe(d.porta);
    if (!turmas[m]) turmas[m] = [];
    turmas[m].push(d);
  });

  /* `id` viaja junto com rank e nome porque a tela usa o id para abrir a lista da etapa
     (openStageModal). Ligar por nome quebraria no dia em que alguém renomear a etapa. */
  const etapas = HIST_ORDEM.map((id, i) => ({ rank: i + 1, id, nome: STAGE_LABELS[id] }));

  /* ══ QUANTO DE CADA ETAPA É FAXINA (19/09/26) ═══════════════════════════════════
     conversao = avancaram/chegaram, e o descartado em lote conta em `chegaram` sem
     contar em `avancaram` — entra no denominador como se tivesse sido trabalhado e
     tivesse falhado. Quanto mais o time limpa, pior parece a etapa onde os leads
     estavam parados.

     A RÉGUA É A MESMA do KPI da Semana e do gráfico de motivos (lib/lotes-de-perda),
     e roda sobre a coorte INTEIRA de uma vez: uma sessão de limpeza atravessa meses
     de entrada, então agrupar por turma quebraria as sessões ao meio.

     ZERO CHAMADA A MAIS: closedate e hubspot_owner_id já vinham na busca. */
  const perdidosDaCoorte = negocios.filter(d => d.perda != null && d.closedate);
  const loteDaCoorte = LOTES.lotesDePerda(perdidosDaCoorte);
  console.log('Escada: ' + perdidosDaCoorte.length + ' perdidos na coorte de '
    + HIST_DIAS + ' dias, ' + loteDaCoorte.emLote + ' marcados em lote ('
    + loteDaCoorte.lotes.length + ' sessões).');

  const escada = {};
  Object.keys(turmas).forEach(m => {
    const lista = turmas[m];
    if (lista.length < 30) return;
    /* POR ONDE A TURMA ENTROU: sem isso a tela mostra Prospecção menor que o topo e
       parece erro de conta — na verdade é a segunda porta (entrada direta na Visita). */
    const portas = {};
    lista.forEach(d => {
      const ranks = Object.keys(d.entrada).map(Number);
      const rankPorta = ranks.filter(r => d.entrada[r] === d.porta).sort((a, b) => a - b)[0];
      const nome = STAGE_LABELS[HIST_ORDEM[rankPorta - 1]] || 'outra etapa';
      portas[nome] = (portas[nome] || 0) + 1;
    });
    escada[m] = {
      /* a régua usada, para a tela escrever o que foi medido em vez de um número
         cravado no front — mesma disciplina do KPI da Semana e dos motivos */
      loteRegra: loteDaCoorte.regra,
      entraramNoFunil: lista.length,
      portas,
      ganharam: lista.filter(d => d.ganho != null).length,
      perderam: lista.filter(d => d.perda != null).length,
      etapas: etapas.map(e => {
        const chegaram = lista.filter(d => d.entrada[e.rank] != null);
        const avancaram = chegaram.filter(d => d.rankMax > e.rank || d.ganho != null);
        const ganharam = chegaram.filter(d => d.ganho != null);
        /* Perdeu NESTA etapa = perdeu e não passou dela. Sem isso a mesma perda apareceria
           em todas as etapas por onde o negócio passou. */
        const perderamAqui = chegaram.filter(d => d.perda != null && d.rankMax === e.rank);
        const aindaAqui = chegaram.filter(d => d.etapaAtual === e.id);
        /* A PARTE DA PERDA DESTA ETAPA QUE FOI MARCADA EM LOTE. Tirar esses do
           denominador dá a taxa "sem a faxina" — e os DOIS números vão para a tela,
           porque a régua é inferência de horário e o número primário não se troca em
           silêncio. */
        const limpezaAqui = perderamAqui.filter(d => loteDaCoorte.ids[d.id]);
        const baseSemLimpeza = chegaram.length - limpezaAqui.length;
        return {
          rank: e.rank, id: e.id, nome: e.nome,
          chegaram: chegaram.length,
          avancaram: avancaram.length,
          ganharam: ganharam.length,
          perderamAqui: perderamAqui.length,
          /* SEM DIVISÃO POR ZERO e sem taxa inventada: se a limpeza levou a etapa
             inteira, não há denominador e o campo é null — a tela escreve isso em vez
             de desenhar 0% ou Infinity. */
          perderamAquiEmLote: limpezaAqui.length,
          chegaramSemLimpeza: baseSemLimpeza,
          aindaAqui: aindaAqui.length
        };
      })
    };
  });

  /* VELOCIDADE: dias entre entrar numa etapa e entrar na próxima que o negócio alcançou.
     Só quem avançou entra na conta — quem está parado não tem duração, tem idade, e são
     coisas diferentes (a idade de quem está parado já está na tela, como SLA estourado). */
  const velocidade = etapas.map(e => {
    const dias = [];
    negocios.forEach(d => {
      const de = d.entrada[e.rank];
      if (de == null) return;
      const proximos = Object.keys(d.entrada).map(Number).filter(r => r > e.rank).map(r => d.entrada[r]);
      const alvos = d.ganho != null ? proximos.concat([d.ganho]) : proximos;
      const destino = alvos.length ? Math.min.apply(null, alvos) : null;
      if (destino == null || destino <= de) return;
      dias.push((destino - de) / DIA);
    });
    return {
      rank: e.rank, id: e.id, nome: e.nome, sla: SLA_DAYS[e.id] || null, n: dias.length,
      mediana: dias.length ? Math.round(mediana(dias) * 10) / 10 : null,
      p75: dias.length ? Math.round(percentil(dias, 0.75) * 10) / 10 : null
    };
  });

  /* CICLO SÓ DE QUEM ANDOU O FUNIL (31/08/26). Na primeira rodada com dado real o ciclo
     mediano saiu 1,7 dia — e não era erro: o days_to_close do próprio HubSpot dá 1 dia
     de mediana em 82 ganhos. O negócio é cadastrado praticamente no dia do fechamento,
     porque a conversa acontece na rua e o registro entra quando já está ganho.
     Chamar isso de "ciclo" convidaria a ler "vendemos em dois dias". Então entram na
     conta só os ganhos que entraram por uma das duas portas (Prospecção ou Visita) e
     levaram pelo menos dois dias; o resto é contado à parte, para a tela poder dizer
     quantos ganhos o CRM não consegue medir — que é o achado de verdade. */
  const PORTAS_DE_ENTRADA = 2;   // rank 1 = Prospecção, rank 2 = Visita
  const rankDaPorta = d => {
    const ranks = Object.keys(d.entrada).map(Number).filter(r => d.entrada[r] === d.porta);
    return ranks.length ? Math.min.apply(null, ranks) : null;
  };
  const andouOFunil = d => {
    if (d.ganho == null) return false;
    const rp = rankDaPorta(d);
    return rp != null && rp <= PORTAS_DE_ENTRADA && (d.ganho - d.porta) >= 2 * DIA;
  };
  const ganhosNaJanela = negocios.filter(d => d.ganho != null);
  const comCiclo = ganhosNaJanela.filter(andouOFunil);
  const ciclos = comCiclo.map(d => (d.ganho - d.porta) / DIA);
  const ciclo = {
    n: ciclos.length,
    ganhosNaJanela: ganhosNaJanela.length,
    semCicloNoCrm: ganhosNaJanela.length - comCiclo.length,
    mediana: ciclos.length ? Math.round(mediana(ciclos) * 10) / 10 : null,
    p75: ciclos.length ? Math.round(percentil(ciclos, 0.75) * 10) / 10 : null
  };

  /* POR EXECUTIVO: a janela inteira, não mês a mês — turma de um mês por pessoa tem n
     pequeno demais para virar taxa. O n vai junto para a tela poder dizer "poucos casos". */
  /* SÓ OS DONOS DO TIME (31/08/26). A primeira rodada real trouxe 16 pessoas em
     porOwner: 6 do time e 10 de fora — ex-donos e outras operações — com 316 dos 991
     negócios. O agregado, que é a régua do "time", incluía todas elas: era taxa do
     pipeline com nome de taxa do time. A escada por turma continua sobre o pipeline
     inteiro, de propósito: ali a pergunta é o que acontece com quem entra no funil. */
  const idsDoTime = new Set(REPS.map(r => String(r.ownerId)));
  const porOwner = {};
  const owners = Array.from(new Set(negocios.map(d => d.owner))).filter(o => idsDoTime.has(String(o)));
  owners.forEach(o => {
    const meus = negocios.filter(d => d.owner === o);
    const cic = meus.filter(andouOFunil).map(d => (d.ganho - d.porta) / DIA);
    porOwner[o] = {
      entraramNoFunil: meus.length,
      ciclo: { n: cic.length, mediana: cic.length ? Math.round(mediana(cic) * 10) / 10 : null },
      etapas: etapas.map(e => {
        const chegaram = meus.filter(d => d.entrada[e.rank] != null);
        const avancaram = chegaram.filter(d => d.rankMax > e.rank || d.ganho != null);
        const dias = [];
        chegaram.forEach(d => {
          const de = d.entrada[e.rank];
          const proximos = Object.keys(d.entrada).map(Number).filter(r => r > e.rank).map(r => d.entrada[r]);
          const alvos = d.ganho != null ? proximos.concat([d.ganho]) : proximos;
          const destino = alvos.length ? Math.min.apply(null, alvos) : null;
          if (destino != null && destino > de) dias.push((destino - de) / DIA);
        });
        return {
          rank: e.rank, id: e.id, nome: e.nome,
          chegaram: chegaram.length, avancaram: avancaram.length,
          mediana: dias.length ? Math.round(mediana(dias) * 10) / 10 : null, nDias: dias.length
        };
      })
    };
  });

  /* AGREGADO DO TIME, pronto para virar régua. Vai separado de porOwner porque o
     executivo recebe apenas a própria fatia: sem este campo, a régua do time no login
     dele seria a soma de um só — ele mesmo — e nunca acusaria nada. */
  const doTime = negocios.filter(d => idsDoTime.has(String(d.owner)));
  const agregado = etapas.map(e => {
    const chegaram = doTime.filter(d => d.entrada[e.rank] != null);
    const avancaram = chegaram.filter(d => d.rankMax > e.rank || d.ganho != null);
    return { rank: e.rank, id: e.id, nome: e.nome, chegaram: chegaram.length, avancaram: avancaram.length };
  });

  const meses = Object.keys(escada).sort();
  return {
    dias: HIST_DIAS,
    negocios: negocios.length,
    /* De onde vem o histórico: a propriedade começa em julho/26. A tela precisa poder dizer
       isso — senão "nenhuma turma antes de julho" parece defeito do Cockpit. */
    primeiroMes: meses[0] || null,
    ultimoMes: meses[meses.length - 1] || null,
    minimoDaTurma: 30,
    escada, velocidade, ciclo, porOwner, agregado
  };
}

async function stageTotalThisMonth(stageIdOuLista) {
  const now = new Date();
  // Início do mês corrente às 00:00 em America/Sao_Paulo — usa o horário de Brasília (não UTC)
  // pra decidir qual é o mês/dia "corrente" (ver agoraBrasilia() no topo do arquivo).
  const b = agoraBrasilia();
  const inicioMes = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1, 3, 0, 0));
  const lista = Array.isArray(stageIdOuLista) ? stageIdOuLista : [stageIdOuLista];
  const filtroEtapa = lista.length > 1
    ? { propertyName: 'dealstage', operator: 'IN', values: lista }
    : { propertyName: 'dealstage', operator: 'EQ', value: lista[0] };

  const results = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        filtroEtapa,
        { propertyName: 'closedate', operator: 'BETWEEN', value: String(inicioMes.getTime()), highValue: String(now.getTime()) }
      ]
    }],
    properties: ['dealname']
  });
  return results.filter(d => !isExcludedDeal(d)).length;
}

// Propriedades automáticas do HubSpot que registram QUANDO o negócio entrou em cada etapa
// (uma por etapa). Confirmado com a API: o nome certo nesta conta é hs_v2_date_entered_<etapa>
// (não hs_date_entered_<etapa> — essa variante não existe aqui e vinha sempre vazia).
const ENTERED_STAGE_PROPS = OPEN_STAGES.map(s => `hs_v2_date_entered_${s}`);
// BLOCO 54 — propriedades condicionais obrigatórias do pipeline Field Sales,
// conferidas no HubSpot em 14/08/26. Precisam viajar no shell para pré-preencher o
// drawer; sem isso um valor já existente aparece vazio e o executivo sobrescreve à toa.
const FIELD_SALES_STAGE_PROPS = ['origem_do_lead', 'gargalo_operacional', 'nome_do_sistema',
  'plano_apresentado', 'valor_de_mrr', 'amount', 'email', 'cnpj_cpf', 'pacote_contratado',
  'adicional', 'tipo_de_pagamento', 'periodo_contratado', 'mrr',
  'deseja_criar_perfil_no_asaas_', 'qual_maior_desafio_',
  'informacoes_sobre_o_maior_desafio', 'data_da_reuniao', 'reuniao_agendada', 'description'];

async function repOpenDeals(ownerId) {
  const results = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
        { propertyName: 'dealstage', operator: 'IN', values: OPEN_STAGES }
      ]
    }],
    properties: ['dealname', 'dealstage', 'createdate', 'notes_last_updated', 'notes_next_activity_date', 'hs_lastmodifieddate', 'hs_next_meeting_start_time', 'data_da_reuniao', 'reuniao_agendada', 'amount', 'latitude', 'longitude',
      // BLOCO 20 (12/08/26) — Julyan: "corrija de uma vez so esse erro de localizacao dos
      // quentes". Estes cinco campos EXISTEM no HubSpot (conferido via get_properties:
      // cep, bairro, cidade, logradouro, numero) e o cron nunca os pediu. Sem eles o
      // cockpit so tinha latitude/longitude, que o Expogo grava no check-in -- ou seja,
      // negocio nunca visitado nao tinha como aparecer no mapa, nem com endereco
      // preenchido no CRM. Agora vem tudo, e o front geocodifica o que faltar.
      // Medido hoje: a maioria desses campos ainda esta VAZIA no CRM (dos quentes sem
      // coordenada, so o UAU UNIDADE PENHA tinha CEP). Pedir custa zero e o pino passa a
      // aparecer sozinho conforme o time preenche.
      'cep', 'bairro', 'cidade', 'logradouro', 'numero', 'celular', ...FIELD_SALES_STAGE_PROPS, ...ENTERED_STAGE_PROPS]
  });
  return results.filter(d => !isExcludedDeal(d));
}

// Busca TODOS os leads abertos de uma etapa (time inteiro) — usado pro clique no funil.
// Precisa do nome do dono pra mostrar quem é o responsável na lista.
// Busca TODOS os negócios de uma etapa, o time inteiro — sem cap de 100.
// Antes isso vinha só da 1ª página (limit:100) sem paginar; em etapas com mais de
// 100 negócios abertos (ex: Prospecção, que passa de 200), o modal mostrava um
// número MENOR que o real e faltavam leads na lista — por isso agora pagina até
// trazer tudo, do mesmo jeito que o `total` (usado no Funil por etapa) já é exato.
// Só usada pras 6 etapas ABERTAS (feed do modal de clique no funil) — por isso já filtra
// pro time ativo, mesmo escopo do stageTotal(..., filtroTimeAtivo) usado pras barras.
// Sem isso, a barra mostrava um total (já filtrado) e o modal abria com uma lista maior
// (incluindo donos fora do time, tipo o achado do "Gabriel Amaral") — inconsistente.
/* ══ O COCKPIT SO OLHA OS LEADS DO TIME DE AGORA (10/09/26, decisao do Julyan) ═══════
   Por 40 minutos este arquivo teve uma busca (abertosDeQuemSaiu) que contava os abertos
   de quem NAO esta no time: 251 negocios de 14 donos, 33 deles sem dono nenhum. Eu a
   escrevi porque tirar a Amanda fez os 21 negocios dela desaparecerem da tela, e me
   pareceu que o numero nao podia sumir.

   Julyan: "foca nesses leads de agora, nao precisa puxar aqueles, vamos deixar limpo".

   Ele esta certo e a busca saiu. O que ela media e real, mas nao e trabalho do time",
   desta semana — e um numero que nao muda nada do que o executivo faz amanha, e a aba
   Time existe para dizer o que cobrar hoje. Uma consulta a menos por rodada, tambem.

   SE ALGUEM PRECISAR DO NUMERO OUTRA VEZ: e um search no HubSpot com
   hubspot_owner_id NOT_IN os donos do time, nas OPEN_STAGES do pipeline Field Sales.
   Fica escrito aqui para nao ter de ser descoberto de novo. */
async function stageDealsTeamWide(stageId) {
  const todos = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: stageId },
        { propertyName: 'hubspot_owner_id', operator: 'IN', values: REPS.map(r => r.ownerId) }
      ]
    }],
    properties: ['dealname', 'dealstage', 'createdate', 'hubspot_owner_id', 'notes_last_updated', 'notes_next_activity_date', 'amount', 'hs_lastmodifieddate', 'latitude', 'longitude',
      // closedate e motivo_do_perdido servem à coluna Perdido do kanban (02/09/26). Pedir
      // custa zero para as outras etapas, onde vêm vazios, e sem eles a coluna Perdido não
      // teria como saber a data da perda nem mostrar o motivo no card.
      'closedate', 'motivo_do_perdido',
      // BLOCO 20 (12/08/26) — Julyan: "corrija de uma vez so esse erro de localizacao dos
      // quentes". Estes cinco campos EXISTEM no HubSpot (conferido via get_properties:
      // cep, bairro, cidade, logradouro, numero) e o cron nunca os pediu. Sem eles o
      // cockpit so tinha latitude/longitude, que o Expogo grava no check-in -- ou seja,
      // negocio nunca visitado nao tinha como aparecer no mapa, nem com endereco
      // preenchido no CRM. Agora vem tudo, e o front geocodifica o que faltar.
      // Medido hoje: a maioria desses campos ainda esta VAZIA no CRM (dos quentes sem
      // coordenada, so o UAU UNIDADE PENHA tinha CEP). Pedir custa zero e o pino passa a
      // aparecer sozinho conforme o time preenche.
      'cep', 'bairro', 'cidade', 'logradouro', 'numero', 'celular', ...FIELD_SALES_STAGE_PROPS, ...ENTERED_STAGE_PROPS]
  });
  return todos.filter(d => !isExcludedDeal(d));
}

/* ══ TODAS AS NOTAS DO APP DE CAMPO, DE UMA VEZ (17/09/26) ═════════════════════════
   Substitui o laço de `buscarNotasDoLead`, que custava 3 chamadas e ~1s de espera POR
   LEAD e por isso só rodava para ~74 negócios de destaque. Aqui são duas buscas
   paginadas para o funil inteiro:
     · a Search API de notes filtrando pela assinatura do app (619 notas hoje = 7
       chamadas de 100);
     · `hsAssociacoesEmLote`, que já existe e resolve 100 associações por chamada.

   ORDENA POR DATA NA BUSCA e corta DEPOIS de agrupar — o oposto do que
   `buscarNotasDoLead` fazia, que era cortar a lista de associações antes de ordenar e
   por isso podia devolver uma nota velha escondendo a mais nova.

   O TETO DE 5 POR NEGÓCIO existe pelo peso do snapshot, não pela API: 619 notas
   inteiras são ~95 KB no payload de 1 MB, e o teto impede que um negócio muito
   tocado leve o snapshot sozinho. Cinco é o que a ficha mostra sem rolar.

   A JANELA É A MESMA DA AGENDA (60 dias atrás): observação de campo mais velha que
   isso não muda decisão de hoje, e o app começou a rodar neste ano — medido, as 619
   notas da janela são praticamente todas as 618 que existem. */
const NOTAS_APP_POR_NEGOCIO = 5;

async function buscarNotasDoAppEmLote(iniMs, fimMs) {
  const achadas = await hsSearchTipoAll('notes', {
    filterGroups: [{ filters: [
      { propertyName: 'hs_timestamp', operator: 'BETWEEN', value: String(iniMs), highValue: String(fimMs) },
      /* A ASSINATURA DO APP, e não "Agendado para". O filtro antigo da agenda pega só
         o follow-up; a observação livre e o motivo da perda ficavam fora, e são 556
         das 618 notas que o time escreveu. */
      { propertyName: 'hs_note_body', operator: 'CONTAINS_TOKEN', value: '"via App Outbound"' }
    ] }],
    properties: ['hs_note_body', 'hs_timestamp', 'hubspot_owner_id', 'hs_createdate'],
    sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }]
  });
  if (!achadas.length) {
    console.log('Notas do app: nenhuma na janela.');
    return {};
  }

  const ids = achadas.map(function (n) { return n.id; });
  const assoc = {};
  for (let i = 0; i < ids.length; i += 100) {
    const m = await hsAssociacoesEmLote('notes', 'deals', ids.slice(i, i + 100));
    Object.entries(m).forEach(function (par) { assoc[par[0]] = par[1]; });
  }

  const porDeal = {};
  let semNegocio = 0;
  achadas.forEach(function (n) {
    const dealId = assoc[String(n.id)];
    /* NOTA SEM NEGÓCIO ASSOCIADO NÃO TEM ONDE APARECER. Conta e segue — inventar um
       dono por nome aqui poria a observação de um restaurante na ficha de outro. */
    if (!dealId) { semNegocio++; return; }
    const texto = String(n.properties.hs_note_body || '')
      .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!texto) return;
    (porDeal[dealId] = porDeal[dealId] || []).push({
      texto: texto, data: n.properties.hs_timestamp || n.properties.hs_createdate || null
    });
  });

  /* desempate por data DEPOIS de agrupar, e só então o teto */
  Object.keys(porDeal).forEach(function (id) {
    porDeal[id] = porDeal[id]
      .sort(function (a, b) { return new Date(b.data) - new Date(a.data); })
      .slice(0, NOTAS_APP_POR_NEGOCIO);
  });
  console.log('Notas do app: ' + achadas.length + ' na janela, em '
    + Object.keys(porDeal).length + ' negócios'
    + (semNegocio ? ' (' + semNegocio + ' sem negócio associado)' : '') + '.');
  return porDeal;
}

/* `buscarNotasDoLead` FOI REMOVIDA EM 17/09/26, e o motivo fica aqui porque a próxima
   mão vai procurar por ela. Ela buscava as notas de UM negócio: 1 chamada de associação
   + 1 por nota, cada uma com sleep(350). Por isso o robô só a chamava para ~74 leads de
   destaque — 222 chamadas e ~78s de espera para cobrir uma fração do funil.

   E ela tinha um defeito próprio: `.slice(0, limite)` cortava a lista de ASSOCIAÇÕES
   antes de ordenar por data. O comentário prometia "as 2 mais recentes"; o código pegava
   2 em ordem arbitrária e ordenava só aquelas duas — negócio com 5 notas podia mostrar a
   velha e esconder a nova.

   Quem faz o trabalho agora é `buscarNotasDoAppEmLote`, duas buscas paginadas para o
   funil inteiro. Nenhum chamador ficou pendurado: a varredura de `buscarNotasDoLead` em
   scripts/ e api/ devolveu só as citações em comentário. */

// Dias ÚTEIS entre duas datas (exclui sábado e domingo) — pedido do Julyan (10/08):
// final de semana não pode contar como "dia parado" pro lead, porque ninguém do time
// trabalha rua/CRM nesses dias. Conta quantos dias de seg-sex existem entre startMs
// (exclusive) e agora (inclusive), andando dia a dia em UTC pra não escorregar com
// fuso/horário de verão. Ex.: sexta 18h → segunda 9h = 1 dia útil, não 3.
function diasUteisEntre(startMs, endMs) {
  if (!(startMs < endMs)) return 0;
  const cursor = new Date(startMs);
  cursor.setUTCHours(0, 0, 0, 0);
  const fim = new Date(endMs);
  fim.setUTCHours(0, 0, 0, 0);
  let count = 0;
  while (cursor < fim) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay(); // 0=domingo, 6=sábado
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function daysSince(dateStr) {
  const created = new Date(dateStr).getTime();
  return diasUteisEntre(created, Date.now());
}

// Dias REALMENTE parado, sem interação nenhuma. Usa a data mais recente entre:
// (a) quando o negócio entrou na etapa atual (hs_v2_date_entered_<etapa>),
// (b) `notes_last_updated` — atualizada quando uma nota/ligação/e-mail/reunião/tarefa é logada
//     pelo executivo. Interação real registrada por uma pessoa "reseta" o contador de dias parado.
//
// IMPORTANTE — NÃO usar `hs_lastmodifieddate` aqui (removido em 30/07/2026): esse campo muda em
// QUALQUER alteração de propriedade do negócio, inclusive updates automáticos/de sistema que não
// têm nada a ver com o executivo trabalhar o lead. Descobrimos que o HubSpot pode tocar esse campo
// em praticamente TODOS os negócios do portal ao mesmo tempo (ex: reindexação, sync, bulk update) —
// isso zerava o "dias parado" de todo mundo de uma vez e mascarava o SLA estourado real (achado:
// negócio parado há 13 dias aparecia como "0 dias" no dashboard). `notes_last_updated` não tem esse
// problema porque só muda quando uma pessoa de fato loga uma interação.
function daysInCurrentStage(properties) {
  const enteredKey = `hs_v2_date_entered_${properties.dealstage}`;
  const enteredDate = properties[enteredKey] ? new Date(properties[enteredKey]).getTime() : null;
  const lastActivity = properties.notes_last_updated ? new Date(properties.notes_last_updated).getTime() : null;
  const createdFallback = new Date(properties.createdate).getTime();

  const candidates = [enteredDate, lastActivity, createdFallback].filter(t => t !== null && !isNaN(t));
  const maisRecente = Math.max(...candidates);
  // 10/08 (Julyan): conta só dias úteis — sábado e domingo não empurram o lead pra
  // "SLA estourado" nem inflam o "Xd parado", já que ninguém trabalha o funil nesses dias.
  return diasUteisEntre(maisRecente, Date.now());
}

// Busca os negócios que UM executivo fechou (Negócio Fechado) nos últimos 7 dias,
// usando closedate — mesmo critério validado pro Ganhos (7d) geral.
// A META INDIVIDUAL VEM DE metaDe(ownerId) — ver o bloco METAS no topo. A constante que
// morava aqui dava 10 para todo mundo, inclusive para quem tem meta 2.

async function stageTotalThisMonthByOwner(stageIdOuLista, ownerId) {
  const now = new Date();
  const b = agoraBrasilia();
  const inicioMes = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1, 3, 0, 0));
  const lista = Array.isArray(stageIdOuLista) ? stageIdOuLista : [stageIdOuLista];
  const filtroEtapa = lista.length > 1
    ? { propertyName: 'dealstage', operator: 'IN', values: lista }
    : { propertyName: 'dealstage', operator: 'EQ', value: lista[0] };

  // hsSearchAll (paginado) em vez de 1 página de 50 — garante que fechadosNoMes por
  // executivo nunca trunca e sempre bate com a contagem do Jogo do mês (mesmos filtros).
  const results = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        filtroEtapa,
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
        { propertyName: 'closedate', operator: 'BETWEEN', value: String(inicioMes.getTime()), highValue: String(now.getTime()) }
      ]
    }],
    properties: ['dealname']
  });
  return results.filter(d => !isExcludedDeal(d)).length;
}

// Todos os negócios FECHADOS no mês corrente (Negócio Fechado + Enviado Onboarding),
// com o valor de MRR (propriedade valor_de_mrr, a mesma já usada no fetch-weekly-comparison).
// Alimenta o quadro "Vendas do mês" do Cockpit — usa exatamente o mesmo critério
// (closedate + as 2 etapas de ganho + filtro de teste/exceções) do KPI fechadosNoMes,
// então a contagem daqui bate com o número que já aparece no topo do painel.
async function vendasDoMesDetalhe() {
  const now = new Date();
  const b = agoraBrasilia();
  const inicioMes = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1, 3, 0, 0));
  const results = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'IN', values: [STAGES.ganho1, STAGES.ganho2] },
        { propertyName: 'closedate', operator: 'BETWEEN', value: String(inicioMes.getTime()), highValue: String(now.getTime()) }
      ]
    }],
    /* `amount` E A RECEITA: o valor TOTAL do plano negociado, que o executivo preenche
       na passagem para Enviado Onboarding (palavra do Julyan, 10/09). Ela nao vinha,
       e por isso duas das tres metas nao tinham realizado nenhum na tela. MRR e receita
       nunca se somam: para o Sandro, R$ 800/mes viraram R$ 9.600 porque o plano e anual. */
    properties: ['dealname', 'hubspot_owner_id', 'valor_de_mrr', 'amount', 'closedate']
  });
  return results.filter(d => !isExcludedDeal(d)).map(d => {
    const fechou = d.properties.closedate || null;
    const mesCru = fechou ? String(diaBrasiliaDe(fechou) || '').slice(0, 7) : null;
    const conta = competenciaDe(d.id, mesCru);
    return {
      id: d.id,
      nome: d.properties.dealname,
      ownerId: d.properties.hubspot_owner_id ? String(d.properties.hubspot_owner_id) : null,
      mrr: Math.round(parseFloat(d.properties.valor_de_mrr) || 0),
      receita: Math.round(parseFloat(d.properties.amount) || 0),
      closedate: fechou,
      /* `mesDeCompetencia` e o mes em que esta venda CONTA, e `ajustado` diz que a
         decisao foi humana — a tela mostra o ajuste em vez de divergir do CRM calada. */
      mesDeCompetencia: conta,
      ajustado: conta !== mesCru ? (COMPETENCIA[String(d.id)] || {}).motivo || 'ajuste de competência' : null
    };
  });
}

// Conta quantos negócios de Ganho (Negócio Fechado + Enviado Onboarding) fecharam HOJE
// pra um executivo específico — usado pra alimentar automaticamente o "Fechamentos hoje"
// da Daily, sem depender de o executivo digitar (o Expogo já manda isso pro HubSpot sozinho).
async function stageDealsHojeByOwner(stageIdOuLista, ownerId, diaISO) {
  const b = diaISO ? new Date(diaISO + 'T12:00:00Z') : agoraBrasilia();
  const inicioHoje = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 3, 0, 0));
  // Dia fechado (ontem) usa a janela inteira; dia corrente vai até agora.
  const now = diaISO ? new Date(inicioHoje.getTime() + 86400000) : new Date();
  const lista = Array.isArray(stageIdOuLista) ? stageIdOuLista : [stageIdOuLista];
  const filtroEtapa = lista.length > 1
    ? { propertyName: 'dealstage', operator: 'IN', values: lista }
    : { propertyName: 'dealstage', operator: 'EQ', value: lista[0] };

  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        filtroEtapa,
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
        { propertyName: 'closedate', operator: 'BETWEEN', value: String(inicioHoje.getTime()), highValue: String(now.getTime()) }
      ]
    }],
    properties: ['dealname'],
    limit: 50
  });
  return (data.results || []).filter(d => !isExcludedDeal(d)).length;
}

async function stageDealsLast7DaysByOwner(stageIdOuLista, ownerId) {
  // Semana civil (segunda 00:00 Brasília → agora), mesmo critério do time inteiro —
  // e agora com paginação completa (hsSearchAll) em vez de 1 página de 50, pra
  // garantir a invariante "nenhuma consulta truncada por limite de paginação".
  const now = Date.now();
  const inicioSemana = inicioSemanaBrasilia();
  const lista = Array.isArray(stageIdOuLista) ? stageIdOuLista : [stageIdOuLista];
  const filtroEtapa = lista.length > 1
    ? { propertyName: 'dealstage', operator: 'IN', values: lista }
    : { propertyName: 'dealstage', operator: 'EQ', value: lista[0] };

  const results = await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        filtroEtapa,
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
        { propertyName: 'closedate', operator: 'BETWEEN', value: String(inicioSemana), highValue: String(now) }
      ]
    }],
    properties: ['dealname', 'closedate']
  });
  return results
    .filter(d => !isExcludedDeal(d))
    .map(d => ({ name: d.properties.dealname }));
}

async function main() {
  // Agenda primeiro e à prova de falha: se o token não tiver os escopos de
  // tasks/meetings (crm.objects.tasks.read + crm.objects.meetings.read no Private App),
  // isso loga o aviso e o refresh segue — o cockpit cai no rascunho, nada quebra.
  let agenda = null;
  try {
    agenda = await fetchAgenda();
    console.log(`Agenda: ${agenda.itens.length} compromissos (reuniões + tarefas) no período.`);
  } catch (e) {
    console.log('Aviso: agenda não veio — ' + String(e.message).slice(0, 160));
    console.log('Se o erro for 403, adicione os escopos crm.objects.tasks.read e crm.objects.meetings.read no Private App do HubSpot.');
  }

  /* CADÊNCIA DIÁRIA (08/09/26) — atividade por executivo por dia útil, para o
     sparkline e o heatmap da aba Time v2. Conta os itens que a agenda ACABOU de
     trazer: nenhuma consulta nova, nenhum escopo novo. Se a agenda falhou acima,
     `cadenciaDiaria` fica null e a tela escreve "não medida" — que é diferente de
     dez dias zerados, e a diferença é a acusação errada de um executivo. */
  let cadenciaDiaria = null;
  if (agenda && Array.isArray(agenda.itens)) {
    try {
      cadenciaDiaria = fetchCadenciaDiaria(agenda.itens);
      const somaCad = Object.values(cadenciaDiaria.porOwner || {})
        .reduce((tot, arr) => tot + arr.reduce((a, b) => a + b, 0), 0);
      console.log('Cadência: ' + somaCad + ' atividades de ' + REPS.length + ' executivos em '
        + cadenciaDiaria.dias.length + ' dias úteis (' + JSON.stringify(cadenciaDiaria.porTipo) + ')'
        + (cadenciaDiaria.semDono ? ' · ' + cadenciaDiaria.semDono + ' item(ns) sem dono no time' : ''));
    } catch (e) {
      console.log('Aviso: cadência diária não saiu — ' + String(e.message).slice(0, 160));
    }
  } else {
    console.log('Cadência: sem agenda nesta rodada, então a aba Time mostra "não medida".');
  }

  console.log('Buscando dados no HubSpot...');  console.log('Buscando dados no HubSpot...');

  // ---- Funil geral (donut) ----
  // Uma chamada de cada vez (não em paralelo) pra não estourar o limite de velocidade do HubSpot
  //
  // As 6 etapas ABERTAS (Prospecção...Ag.Pagamento) agora filtram por hubspot_owner_id IN
  // (só o time ativo de 9 reps) — antes contavam QUALQUER dono (inclusive gente fora do time,
  // ex: um lead achado com owner "Gabriel Amaral", que não é do Field Sales). Isso fazia o
  // "Funil por etapa" mostrar um total maior (ex: 483) do que o card "Negócios em aberto" (374),
  // que sempre foi só do time ativo — os dois agora usam o mesmo escopo.
  // OBS: esse filtro ainda não exclui negócios [TESTE] (stageTotal só lê a contagem da API,
  // sem baixar o dealname pra filtrar) — se sobrar diferença pequena depois desse fix, é isso.
  const filtroTimeAtivo = [{ propertyName: 'hubspot_owner_id', operator: 'IN', values: REPS.map(r => r.ownerId) }];
  const backlog = await stageTotal(STAGES.backlog);
  const prospeccao = await stageTotal(STAGES.prospeccao, filtroTimeAtivo);
  const visita = await stageTotal(STAGES.visita, filtroTimeAtivo);
  const diagnostico = await stageTotal(STAGES.diagnostico, filtroTimeAtivo);
  const demoProposta = await stageTotal(STAGES.demoProposta, filtroTimeAtivo);
  const negociacao = await stageTotal(STAGES.negociacao, filtroTimeAtivo);
  const agPagamento = await stageTotal(STAGES.agPagamento, filtroTimeAtivo);
  const ganho1 = await stageTotal(STAGES.ganho1);
  const ganho2 = await stageTotal(STAGES.ganho2);
  const perdido = await stageTotal(STAGES.perdido);
  const reciclagem = await stageTotal(STAGES.reciclagem);

  const ganho = ganho1 + ganho2;
  const leadsCriadosDeals = await createdLast7Days();
  const leadsCriados = leadsCriadosDeals.length;

  // Ganhos/Perdidos como FLUXO da semana (entraram nessa etapa nos últimos 7 dias) —
  // diferente do "ganho"/"perdido" acima, que é o total histórico acumulado (usado só no funil geral).
  // Ganhos conta SÓ "Negócio Fechado" (ganho1) — "Enviado Onboarding" (ganho2) é a etapa
  // seguinte do MESMO negócio, não representa um cliente novo fechando.
  const ganhoSemana = await stageTotalLast7Days([STAGES.ganho1, STAGES.ganho2]);
  const perdidoSemanaDeals = await stageDealsLast7DaysComNomes(STAGES.perdido);
  /* AS DUAS LEITURAS ADICIONAIS SÃO À PROVA DE FALHA, pelo mesmo motivo da agenda lá em
     cima: main() termina em process.exit(1), então uma exceção aqui não gravaria
     data/hubspot.json e o cockpit inteiro ficaria no snapshot de ontem — por causa de um
     bloco secundário. Falha aqui vira null com aviso no log, e a tela já sabe dizer que
     a leitura não veio, em vez de mostrar zero.

     POR QUE PERDEMOS: motivo de perda dos últimos 90 dias, por motivo e por executivo.
     CONVERSÃO DE VERDADE: por turma, sobre a data de entrada em cada etapa.
     As duas são consultas a mais no fetch que já roda — nada de endpoint novo (12/12 na
     Vercel). */
  let motivosPerda = null;
  try {
    motivosPerda = await motivosDePerda();
  } catch (e) {
    console.error('AVISO: motivo de perda não veio nesta rodada (' + e.message + '). O resto do refresh segue.');
  }
  let historicoEtapas = null;
  try {
    historicoEtapas = await historicoDeEtapas();
  } catch (e) {
    console.error('AVISO: histórico de etapa não veio nesta rodada (' + e.message + '). O resto do refresh segue.');
  }
  const perdidoSemana = perdidoSemanaDeals.length;

  // Fechados no mês corrente (pro KPI "Fechados no mês" vs. meta do time) — mesma
  // lógica de 2 etapas do ganhoSemana (Negócio Fechado + Enviado Onboarding), só que
  // com janela do mês em vez de 7 dias.
  const fechadosNoMes = await stageTotalThisMonth([STAGES.ganho1, STAGES.ganho2]);

  // Detalhe dos fechados do mês (nome + dono + MRR) — pro quadro "Vendas do mês".
  const vendasMes = await vendasDoMesDetalhe();
  console.log(`Vendas do mês: ${vendasMes.length} negócios fechados no mês corrente (com MRR).`);

  // ---- Leads por etapa, time inteiro (pro clique no funil) ----
  const ownerNameById = {};
  REPS.forEach(r => { ownerNameById[r.ownerId] = r.name; });

  const funilLeads = {};
  for (const stageId of OPEN_STAGES) {
    const deals = await stageDealsTeamWide(stageId);
    // BLOCO 44 — tarefas em aberto associadas, uma chamada em lote por etapa (não por
    // negócio) — mesmo motivo de custo de qualquer outra chamada em lote deste arquivo.
    const tarefasPorDeal = await hsTarefasAbertasDosNegocios(deals.map(d => d.id));
    funilLeads[stageId] = deals.map(d => {
      const dias = daysInCurrentStage(d.properties);
      // Coordenada real do check-in via Expogo (Julyan, 10/08: "eles marcam no Expogo
      // e tem coordenadas que enviam para o HubSpot" — direto na propriedade do negócio,
      // não precisa mais casar por nome com a base de prospecção pra achar isso).
      const lat = coordenadaValida(d.properties.latitude);
      const lng = coordenadaValida(d.properties.longitude);
      return {
        name: d.properties.dealname,
        dealname: d.properties.dealname,
        id: d.id,
        dias,
        /* OS TRÊS ESTADOS vêm de estadoDaRegua — ver a nota longa junto de SLA_DAYS.
           Antes daqui saía `proximaAtividade` CRU: a propriedade do HubSpot sobrevive
           ao prazo, então data vencida chegava na tela como se fosse compromisso em pé. */
        ...(function () {
          const e = estadoDaRegua(dias, stageId, d.properties.notes_next_activity_date);
          return { slaBreach: e.slaBreach, aguardando: e.aguardando,
            aguardandoAte: e.aguardandoAte, proximaAtividade: e.proximaAtividade };
        }()),
        ultimaInteracao: d.properties.notes_last_updated || null,
        /* ══ QUANDO O NEGOCIO NASCEU (10/09/26) ══════════════════════════════════
           `createdate` JA era pedido na busca (stageDealsTeamWide) e este mapeador
           simplesmente nao o repassava — medido na producao: 8 de 249 negocios do
           funil chegavam com data de criacao, e os 8 vinham por outro caminho.
           Sem ele, o SLA de 1o toque da aba Time e incalculavel: ele e o delta entre
           a criacao do negocio (a carga) e o primeiro engajamento. Pedir custava zero
           porque a propriedade ja vinha na resposta; o que faltava era esta linha. */
        criadoEm: d.properties.createdate || null,
        valor: Math.round(parseFloat(d.properties.amount) || 0),
        vendedor: ownerNameById[d.properties.hubspot_owner_id] || '—',
        ownerId: d.properties.hubspot_owner_id || null,
        lat: lat,   /* coordenadaValida ja garantiu: numero finito e nao-zero, ou null */
        // Endereço textual segue junto: é o que permite ao front geocodificar quem não
        // tem coordenada, em vez de sumir do mapa.
        cep: d.properties.cep || null,
        bairro: d.properties.bairro || null,
        cidade: d.properties.cidade || null,
        logradouro: d.properties.logradouro || null,
        numero: d.properties.numero || null,
        celular: d.properties.celular || null,
        ...Object.fromEntries(FIELD_SALES_STAGE_PROPS.map(prop => [prop, d.properties[prop] || null])),
        tarefas: tarefasPorDeal[d.id] || [],
        lng: (lng != null && !isNaN(lng)) ? lng : null
      };
    /* TEMPERATURA AQUI TAMBÉM (08/09/26): este é o mapa que a tela do gestor desenha
       negócio por negócio, e até hoje era o único sem nota. */
    }).map(l => comTemperatura(l, stageId)).sort((a, b) => b.dias - a.dias);
  }

  // ---- A coluna PERDIDO do kanban: só as perdas dentro do corte + janela ----
  // Filtro por closedate, que é a data que o HubSpot grava quando o negócio entra numa
  // etapa fechada — ou seja, a data da perda. Usar hs_lastmodifieddate daria 'quando
  // alguém mexeu no registro', que é outra coisa: um negócio perdido em março e editado
  // ontem voltaria para a tela.
  const inicioPerdido = inicioDoPerdidoVisivel();
  // ---- A coluna ENVIADO ONBOARDING: clone do pipe, com tudo, só de hoje em diante ----
  const inicioOnb = inicioDoOnboardingVisivel();
  let onboardingRecentes = [];
  let propsPedidas = 0;
  try {
    const todasProps = await todasAsPropriedadesDeNegocio();
    propsPedidas = todasProps.length;
    /* Em lotes de 120 nomes: cada lote traz o MESMO conjunto de negócios (o filtro é
       igual) com um pedaço das propriedades, e a gente costura por id. Assim "todas as
       propriedades" não vira uma requisição gigante que o HubSpot recusa. */
    const LOTE = 120;
    const porId = new Map();
    for (let i = 0; i < todasProps.length; i += LOTE) {
      const pedaco = todasProps.slice(i, i + LOTE);
      const achados = await hsSearchAll({
        filterGroups: [{
          filters: [
            { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
            { propertyName: 'dealstage', operator: 'EQ', value: ETAPA_ONBOARDING },
            { propertyName: 'hubspot_owner_id', operator: 'IN', values: REPS.map(r => r.ownerId) },
            { propertyName: PROP_ENTRADA_ONBOARDING, operator: 'GTE', value: String(inicioOnb) }
          ]
        }],
        /* dealname e o dono vão em TODO lote: são o que identifica o negócio na costura. */
        properties: [...new Set(['dealname', 'hubspot_owner_id', PROP_ENTRADA_ONBOARDING, ...pedaco])]
      });
      achados.filter(d => !isExcludedDeal(d)).forEach(d => {
        const atual = porId.get(d.id) || { id: d.id, properties: {} };
        Object.entries(d.properties || {}).forEach(([k, v]) => {
          /* SÓ O QUE TEM VALOR. Um negócio tem centenas de propriedades e quase todas
             vazias: guardar os nulos multiplicaria o snapshot por nada. "Clonar todas as
             propriedades" é clonar tudo o que EXISTE no negócio. */
          if (v !== null && v !== undefined && String(v).trim() !== '') atual.properties[k] = v;
        });
        porId.set(d.id, atual);
      });
    }
    onboardingRecentes = [...porId.values()];
  } catch (e) {
    /* A coluna falhar não pode derrubar a rodada: as outras seis etapas do kanban e o
       resto do Cockpit não dependem dela. Fica vazia e o log diz por quê. */
    console.error('Onboarding: não consegui clonar a etapa —', e.message);
  }
  console.log(`Onboarding: ${onboardingRecentes.length} negócio(s) enviados a partir de ` +
    `${CORTE_ONBOARDING_ISO}, com ${propsPedidas} propriedades pedidas ao HubSpot ` +
    `(só as preenchidas descem). O histórico anterior fica no HubSpot.`);

  /* O CORTE VAI NO FILTRO DO HUBSPOT, não num .filter() depois. stageDealsTeamWide traria
     a etapa inteira — 1.811 negócios, paginados de 100 em 100 — para descartar 99% em
     JavaScript, sete vezes por dia útil. O closedate GTE resolve na origem, do mesmo jeito
     que motivosDePerda() já fazia. */
  const perdidosRecentes = (await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: STAGES.perdido },
        { propertyName: 'hubspot_owner_id', operator: 'IN', values: REPS.map(r => r.ownerId) },
        { propertyName: 'closedate', operator: 'GTE', value: String(inicioPerdido) }
      ]
    }],
    properties: ['dealname', 'dealstage', 'createdate', 'hubspot_owner_id', 'notes_last_updated',
      'notes_next_activity_date', 'amount', 'closedate', 'motivo_do_perdido', 'latitude', 'longitude',
      'cep', 'bairro', 'cidade', 'logradouro', 'numero', 'celular', ...FIELD_SALES_STAGE_PROPS]
  })).filter(d => !isExcludedDeal(d));
  console.log(`Perdido: ${perdidosRecentes.length} negócio(s) do time perdidos a partir de ` +
    `${CORTE_PERDIDO_ISO} — o histórico anterior fica no HubSpot e não desce para o Cockpit.`);

  /* ENVIADO ONBOARDING no mesmo mapa funilLeads, como as outras — é o que faz
     montar-dados.js cortar por dono sem precisar saber que apareceu uma etapa nova.
     A diferença é o campo `props`: o negócio inteiro, como veio do CRM, para o card poder
     mostrar o que existe sem nenhuma escrita de volta. O Cockpit NÃO altera propriedade
     nenhuma desta etapa — ela tem automação de WhatsApp e cria card em outro pipe; aqui
     é espelho, não formulário. */
  {
    const rotuloDoDono = id => ownerNameById[id] || '—';
    funilLeads[ETAPA_ONBOARDING] = onboardingRecentes.map(d => {
      const q = d.properties || {};
      const entrou = Date.parse(q[PROP_ENTRADA_ONBOARDING] || '');
      const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
      return {
        name: q.dealname,
        dealname: q.dealname,
        id: d.id,
        /* dias = há quantos dias foi enviado. Nesta coluna a pergunta não é "quanto tempo
           parado" — é "isso saiu da minha mão quando". */
        dias: Number.isFinite(entrou) ? Math.max(0, Math.floor((Date.now() - entrou) / 86400000)) : 0,
        enviadoEm: Number.isFinite(entrou) ? new Date(entrou).toISOString().slice(0, 10) : null,
        slaBreach: false,
        valor: Math.round(num(q.amount)),
        mrr: Math.round(num(q.valor_de_mrr) || num(q.mrr)),
        vendedor: rotuloDoDono(q.hubspot_owner_id),
        ownerId: q.hubspot_owner_id || null,
        celular: q.celular || null,
        cidade: q.cidade || null,
        bairro: q.bairro || null,
        proximaAtividade: q.notes_next_activity_date || null,
        ultimaInteracao: q.notes_last_updated || null,
        tarefas: [],
        /* O CLONE. Tudo o que o negócio tem, com o nome que o HubSpot usa. */
        props: q
      };
    }).sort((a, b) => a.dias - b.dias);
  }

  // Os perdidos entram no MESMO mapa funilLeads, com a mesma forma de card: é isso que
  // faz montar-dados.js cortar por dono sem precisar saber que apareceu uma etapa nova, e
  // faz o kanban do template tratar a coluna como qualquer outra. O que muda é a
  // ordenação: perdido não tem 'dias parado' que importe — importa quando se perdeu, e o
  // mais recente primeiro, porque é o que ainda dá para desfazer ou aprender.
  {
    const tarefasPerdido = await hsTarefasAbertasDosNegocios(perdidosRecentes.map(d => d.id));
    funilLeads[STAGES.perdido] = perdidosRecentes.map(d => {
      const lat = coordenadaValida(d.properties.latitude);
      const lng = coordenadaValida(d.properties.longitude);
      const fechou = Date.parse(d.properties.closedate || '');
      return {
        name: d.properties.dealname,
        dealname: d.properties.dealname,
        id: d.id,
        /* dias = há quantos dias se perdeu. Na coluna Perdido a pergunta não é 'quanto
           tempo parado' (o negócio não vai andar), é 'quando foi'. */
        dias: Number.isFinite(fechou) ? Math.max(0, Math.floor((Date.now() - fechou) / 86400000)) : 0,
        slaBreach: false,
        perdidoEm: Number.isFinite(fechou) ? new Date(fechou).toISOString().slice(0, 10) : null,
        motivo_do_perdido: d.properties.motivo_do_perdido || null,
        proximaAtividade: d.properties.notes_next_activity_date || null,
        ultimaInteracao: d.properties.notes_last_updated || null,
        valor: Math.round(parseFloat(d.properties.amount) || 0),
        vendedor: ownerNameById[d.properties.hubspot_owner_id] || '—',
        ownerId: d.properties.hubspot_owner_id || null,
        lat: lat,   /* coordenadaValida ja garantiu: numero finito e nao-zero, ou null */
        lng: lng,
        cep: d.properties.cep || null,
        bairro: d.properties.bairro || null,
        cidade: d.properties.cidade || null,
        logradouro: d.properties.logradouro || null,
        numero: d.properties.numero || null,
        celular: d.properties.celular || null,
        ...Object.fromEntries(FIELD_SALES_STAGE_PROPS.map(prop => [prop, d.properties[prop] || null])),
        tarefas: tarefasPerdido[d.id] || []
      };
    }).sort((a, b) => a.dias - b.dias);
  }

  /* ══ GANHO: A VENDA CONTINUA VISÍVEL DEPOIS DE PAGA ═══════════════════════════════
     O corte vai no FILTRO do HubSpot, como no Perdido — a etapa inteira tem 24
     negócios e 23 deles são histórico que o CRM já guarda.
     `closedate` é a data em que a venda fechou, e é por ela que a janela corta: o
     `hs_lastmodifieddate` mexe quando alguém edita qualquer campo, e usá-lo faria uma
     venda de março reaparecer só porque alguém abriu o negócio. */
  const ganhosDaSemana = (await hsSearchAll({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: STAGES.ganho1 },
        { propertyName: 'hubspot_owner_id', operator: 'IN', values: REPS.map(r => r.ownerId) },
        { propertyName: 'closedate', operator: 'GTE', value: String(inicioDoGanhoVisivel()) }
      ]
    }],
    properties: ['dealname', 'dealstage', 'createdate', 'hubspot_owner_id', 'notes_last_updated',
      'notes_next_activity_date', 'amount', 'mrr', 'valor_de_mrr', 'closedate', 'latitude', 'longitude',
      'cep', 'bairro', 'cidade', 'logradouro', 'numero', 'celular', ...FIELD_SALES_STAGE_PROPS]
  })).filter(d => !isExcludedDeal(d));
  console.log(`Ganho: ${ganhosDaSemana.length} venda(s) do time fechadas a partir de ` +
    `${CORTE_GANHO_ISO} — o histórico anterior fica no HubSpot e não desce para o Cockpit.`);

  {
    const tarefasGanho = await hsTarefasAbertasDosNegocios(ganhosDaSemana.map(d => d.id));
    funilLeads[STAGES.ganho1] = ganhosDaSemana.map(d => {
      const lat = coordenadaValida(d.properties.latitude);
      const lng = coordenadaValida(d.properties.longitude);
      const fechou = Date.parse(d.properties.closedate || '');
      return {
        name: d.properties.dealname,
        dealname: d.properties.dealname,
        id: d.id,
        /* dias = há quantos dias FECHOU. Na coluna Ganho a pergunta não é "quanto tempo
           parado" — o negócio não está parado, está vendido: é "quando foi", que é o que
           decide se ele já devia ter ido para o Onboarding. */
        dias: Number.isFinite(fechou) ? Math.max(0, Math.floor((Date.now() - fechou) / 86400000)) : 0,
        slaBreach: false,
        ganhoEm: Number.isFinite(fechou) ? new Date(fechou).toISOString().slice(0, 10) : null,
        proximaAtividade: d.properties.notes_next_activity_date || null,
        ultimaInteracao: d.properties.notes_last_updated || null,
        valor: Math.round(parseFloat(d.properties.amount) || 0),
        mrr: Math.round(parseFloat(d.properties.mrr) || 0),
        valor_de_mrr: d.properties.valor_de_mrr || null,
        vendedor: ownerNameById[d.properties.hubspot_owner_id] || '—',
        ownerId: d.properties.hubspot_owner_id || null,
        lat: lat,
        lng: lng,
        cep: d.properties.cep || null,
        bairro: d.properties.bairro || null,
        cidade: d.properties.cidade || null,
        logradouro: d.properties.logradouro || null,
        numero: d.properties.numero || null,
        celular: d.properties.celular || null,
        ...Object.fromEntries(FIELD_SALES_STAGE_PROPS.map(prop => [prop, d.properties[prop] || null])),
        tarefas: tarefasGanho[d.id] || []
      };
    }).sort((a, b) => a.dias - b.dias);
  }

  // ---- Leads em Reciclagem parados há 60+ dias, pra resgate (Julyan, 17/08/26:
  // "resgatando alguns leads que estão lá há 60 dias") ----
  // Reciclagem fica FORA de OPEN_STAGES de propósito (é bucket lateral, não etapa
  // sequencial do funil aberto — ver comentário acima de OPEN_STAGES) — por isso
  // nunca tinha sido buscada. Mesmo padrão de fetch de qualquer outra etapa, só que
  // filtrando por tempo parado, já que "resgatar" só faz sentido pra quem esfriou
  // de verdade, não pra quem acabou de cair ali.
  const reciclagemDealsRaw = await stageDealsTeamWide(STAGES.reciclagem);
  const leadsReciclagem60 = reciclagemDealsRaw
    .map(d => {
      /* A COORDENADA VEM DO HUBSPOT (04/09/26). stageDealsTeamWide JA pede latitude e
         longitude; este mapeamento e que as descartava, e por isso as 48 contas de
         reciclagem chegavam ao Planejamento sem lugar no mapa — nao entravam na rota do
         dia e o cartao pedia um endereco que o CRM ja tinha.
         Medido na fonte: dos 336 negocios na etapa, 51 tem coordenada de check-in do
         Expogo. Numero mede o que existe; quem nao foi visitado ainda segue sem, e a tela
         diz "sem endereco no CRM" em vez de inventar um ponto. */
      const lat = coordenadaValida(d.properties.latitude);
      const lng = coordenadaValida(d.properties.longitude);
      return {
        name: d.properties.dealname,
        dealname: d.properties.dealname,
        id: d.id,
        dias: daysInCurrentStage(d.properties),
        vendedor: ownerNameById[d.properties.hubspot_owner_id] || '—',
        ownerId: d.properties.hubspot_owner_id || null,
        bairro: d.properties.bairro || null,
        cidade: d.properties.cidade || null,
        /* NaN NAO PASSA: coordenada invalida virava pino no meio do Atlantico. */
        lat: lat,   /* coordenadaValida ja garantiu: numero finito e nao-zero, ou null */
        lng: lng,
        /* o endereco completo, para o cartao nao pedir o que o CRM ja tem */
        cep: d.properties.cep || null,
        logradouro: d.properties.logradouro || null,
        numero: d.properties.numero || null,
        stageId: d.properties.dealstage || null,
        valor: Math.round(parseFloat(d.properties.amount) || 0)
      };
    })
    .filter(l => l.dias >= 60)
    .sort((a, b) => b.dias - a.dias);
  console.log(`Reciclagem: ${reciclagemDealsRaw.length} negócios no total, ${leadsReciclagem60.length} parados há 60+ dias (candidatos a resgate).`);

  // ---- Por executivo ----
  const repsData = {};
  let emAbertoTime = 0;
  let avancaramSemanaTime = 0;
  const todosQuentes = [];
  const todosFrios = [];

  for (const rep of REPS) {
    const deals = await repOpenDeals(rep.ownerId);
    const stages = {};
    deals.forEach(d => {
      const s = d.properties.dealstage;
      stages[s] = (stages[s] || 0) + 1;
    });

    // Fonte automática do campo "realizado" da Daily — o executivo trabalha pelo Expogo,
    // que sincroniza direto com o HubSpot, então ele NÃO deve digitar o realizado: o cockpit
    // lê a ação de verdade que já está no HubSpot. Reaproveita hs_v2_date_entered_<etapa>
    // que a repOpenDeals já buscou (sem chamada extra à API) pra visitas/avanços/propostas;
    // fechamentos precisa de 1 chamada extra porque Ganho não é etapa "aberta" (não vem no
    // `deals` de repOpenDeals).
    const hojeISO = hojeISOBrasilia();
    // Ontem em Brasília. Com as três rodadas diárias (08:56, 13h e 19h, 18/08), "ontem"
    // já está fechado havia horas em qualquer uma delas — a virada de dia acontece à
    // meia-noite, bem antes da primeira rodada da manhã.
    const ontemISO = new Date(new Date(hojeISO + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
    const entrouNoDia = (stageId, diaISO) => deals.filter(d => {
      const dt = d.properties[`hs_v2_date_entered_${stageId}`];
      if (!dt) return false;
      const dtBrasiliaISO = new Date(new Date(dt).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return dtBrasiliaISO === diaISO;
    }).length;
    // BLOCO 15 (12/08/26) — Julyan: "seria legal eu saber quem eles visitaram, avancaram
    // de etapa e deixaram proposta, para eu cobrar na daily". A contagem ja existia; o
    // NOME era descartado aqui mesmo, logo depois do filtro. Agora a funcao devolve os
    // negocios e quem chama decide se quer o total ou a lista.
    // Nao da pra derivar isso no front: o unico campo que diz quando o negocio entrou na
    // etapa e o hs_v2_date_entered_<stage>, e ele so existe aqui. O campo `dias` que vai
    // pro front mede tempo desde a ultima ATIVIDADE, nao desde a entrada na etapa.
    const negociosQueEntraramHojeEm = (stageId) => deals.filter(d => {
      const dt = d.properties[`hs_v2_date_entered_${stageId}`];
      if (!dt) return false;
      // Converte o timestamp do negócio (vem em UTC do HubSpot) pro horário de Brasília
      // ANTES de comparar a data — senão um negócio que entrou na etapa às 22h de Brasília
      // (já 01h UTC do dia seguinte) seria contado no dia errado.
      const dtBrasiliaISO = new Date(new Date(dt).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return dtBrasiliaISO === hojeISO;
    });
    const entrouHojeEm = (stageId) => negociosQueEntraramHojeEm(stageId).length;
    const nomesQueEntraramHojeEm = (stageIds) => {
      const vistos = new Set();
      const nomes = [];
      stageIds.forEach(id => negociosQueEntraramHojeEm(id).forEach(d => {
        const nome = String((d.properties && d.properties.dealname) || '').trim();
        // Dedup por id: o mesmo negocio pode aparecer em dois stageIds da lista se pulou
        // etapas no mesmo dia, e o gestor nao pode ver o nome repetido na Daily.
        if (!nome || vistos.has(d.id)) return;
        vistos.add(d.id);
        nomes.push(nome);
      }));
      return nomes;
    };

    // AUTOMAÇÃO 2 (13/08/26) — Julyan: "quero segurança nos dados e veracidade", depois
    // de descobrir que o Bruno teve realizado_visitas travado em 0 por dois dias
    // seguidos. Causa raiz encontrada: este for-loop não tinha NENHUM isolamento —
    // uma exceção em QUALQUER chamada (rate limit passageiro do HubSpot, timeout de
    // rede) na escrita da Daily de UM executivo abortava o loop inteiro, deixando todo
    // mundo DEPOIS dele no array REPS sem gravar naquela rodada, em silêncio total
    // (o job podia até terminar com sucesso aparente). Isso bate exatamente com o
    // sintoma: o resto dos dados do Bruno (funil, negócios) sempre esteve correto —
    // só a escrita da Daily, que fica right aqui, ficou pra trás.
    // Agora: falha na Daily de UM executivo fica CONTIDA aqui — é registrada e o loop
    // segue pro próximo. O resto do processamento do PRÓPRIO executivo (funil, mapa,
    // etc., mais abaixo) roda de qualquer jeito, porque não depende deste bloco.
    let visitasHubspotHoje = 0, avancosHubspotHoje = 0, propostasHubspotHoje = 0, fechamentosHubspotHoje = 0;
    let avancosHojeNomes = [], propostasHojeNomes = [];
    try {
      // ANTES: entrouHojeEm(STAGES.visita) — contava mudança de ETAPA, e revisita (que não
      // move etapa) ficava invisível. AGORA: conta as tarefas de visita criadas hoje pelo app.
      visitasHubspotHoje = await visitasTarefasHojeByOwner(rep.ownerId);
      // "Avanço de etapa" = negócio que progrediu pra Diagnóstico, Negociação ou Ag.Pagamento hoje —
      // NÃO inclui Demo/Proposta aqui, porque isso já vira a métrica separada de "Propostas" logo
      // abaixo (senão o mesmo negócio contaria pontuação em dobro).
      avancosHubspotHoje = [STAGES.diagnostico, STAGES.negociacao, STAGES.agPagamento]
        .reduce((soma, stageId) => soma + entrouHojeEm(stageId), 0);
      propostasHubspotHoje = entrouHojeEm(STAGES.demoProposta);
      // Mesmas etapas das contagens acima — se uma mudar, a outra tem que mudar junto,
      // senao o nome deixa de bater com o numero ao lado dele na tela.
      avancosHojeNomes = nomesQueEntraramHojeEm([STAGES.diagnostico, STAGES.negociacao, STAGES.agPagamento]);
      propostasHojeNomes = nomesQueEntraramHojeEm([STAGES.demoProposta]);
      fechamentosHubspotHoje = await stageDealsHojeByOwner([STAGES.ganho1, STAGES.ganho2], rep.ownerId);
      await gravarSnapshotDailyVerificado(rep.ownerId, rep.name, hojeISO, {
        realizado_visitas: visitasHubspotHoje,
        realizado_avancos: avancosHubspotHoje,
        realizado_propostas: propostasHubspotHoje,
        realizado_fechamentos: fechamentosHubspotHoje
      });
    } catch (e) {
      registrarFalhaSync(rep.ownerId, rep.name, hojeISO, 'hoje', e);
    }

    // ---- fecha o dia de ONTEM (todo dia útil, direto do HubSpot) ----
    // Este é o número que a Daily das 9h usa pra dizer "prometeu X, fez Y". Antes
    // dependia de o navegador de alguém ter ficado com a aba aberta no dia anterior;
    // agora o robô grava direto do HubSpot, sem depender de ninguém ter aberto tela.
    // Com as três rodadas diárias (08:56/13h/19h, 18/08/26): a das 19h já fecha
    // "ontem" (quando chega o dia seguinte) quase completo — a tarde inteira já
    // aconteceu; as seguintes refazem o mesmo fechamento como segurança, caso alguma
    // rodada anterior tenha falhado.
    // gravarSnapshotDaily faz upsert — rodar várias vezes no mesmo dia não duplica nem
    // distorce o número, só confirma o mesmo valor (ou corrige, se algo mudou).
    try {
      const visitasOntem = await visitasTarefasHojeByOwner(rep.ownerId, ontemISO);
      const avancosOntem = [STAGES.diagnostico, STAGES.negociacao, STAGES.agPagamento]
        .reduce((soma, stageId) => soma + entrouNoDia(stageId, ontemISO), 0);
      const propostasOntem = entrouNoDia(STAGES.demoProposta, ontemISO);
      const fechamentosOntem = await stageDealsHojeByOwner([STAGES.ganho1, STAGES.ganho2], rep.ownerId, ontemISO);
      await gravarSnapshotDailyVerificado(rep.ownerId, rep.name, ontemISO, {
        realizado_visitas: visitasOntem,
        realizado_avancos: avancosOntem,
        realizado_propostas: propostasOntem,
        realizado_fechamentos: fechamentosOntem
      });
    } catch (e) {
      registrarFalhaSync(rep.ownerId, rep.name, ontemISO, 'ontem', e);
    }

    // BLOCO 44 — tarefas em aberto associadas ao negócio, uma chamada em lote por
    // executivo (mesmo padrão do laço de funilLeads acima).
    const tarefasPorDealDoRep = await hsTarefasAbertasDosNegocios(deals.map(d => d.id));
    const withDays = deals.map(d => {
      const dias = daysInCurrentStage(d.properties);
      const stageId = d.properties.dealstage;
      const reguaEstado = estadoDaRegua(dias, stageId, d.properties.notes_next_activity_date);
      const slaBreach = reguaEstado.slaBreach;
      const rank = STAGE_RANK[stageId] || 0;

      // Próxima reunião: prefere o campo automático do HubSpot, cai pro campo customizado
      const proximaReuniaoRaw = d.properties.hs_next_meeting_start_time || d.properties.data_da_reuniao || null;
      let proximaReuniao = null;
      if (proximaReuniaoRaw) {
        const dt = new Date(proximaReuniaoRaw);
        if (!isNaN(dt.getTime()) && dt.getTime() > Date.now()) proximaReuniao = dt.toISOString();
      }

      // Próxima atividade considera qualquer ação futura registrada no HubSpot
      // (ligação, e-mail, tarefa ou reunião), não apenas reuniões.
      const proximaAtividadeRaw = d.properties.notes_next_activity_date || null;
      let proximaAtividade = null;
      if (proximaAtividadeRaw) {
        const dt = new Date(proximaAtividadeRaw);
        if (!isNaN(dt.getTime()) && dt.getTime() > Date.now()) proximaAtividade = dt.toISOString();
      }

      // % do prazo (SLA) da etapa já consumido — 0 = acabou de entrar, 1 = no limite do SLA, >1 = estourado
      const slaDaEtapa = SLA_DAYS[stageId] || 999;
      const slaRatio = dias / slaDaEtapa;

      /* ══ A TEMPERATURA SAIU DESTE LAÇO (08/09/26) ═══════════════════════════════
         Aqui viviam as três linhas que eram a única definição de temperatura do
         cockpit: frio se a régua estourou, quente se rank>=4, morno no resto. Sem
         valor e sem recência — um negócio em Ag. Pagamento com a régua no limite e
         nenhum toque em duas semanas contava como QUENTE e ia para o topo da lista
         que o gestor cobra na Daily.

         Agora a conta é uma só (lib/temperatura.js, régua em data/temperatura.json) e
         a palavra deriva da nota — comTemperatura entra na cadeia, no fim do laço.
         Medido no snapshot de 02/09: a lista de quentes cai de 16 para 6, e 13 dos 16
         antigos estavam sem toque há mais de uma semana. */

      // Mesma coordenada real do check-in via Expogo — ver comentário em funilLeads acima.
      const lat = coordenadaValida(d.properties.latitude);
      const lng = coordenadaValida(d.properties.longitude);

      return {
        name: d.properties.dealname,
        dealname: d.properties.dealname,
        id: d.id,
        stage: STAGE_LABELS[stageId] || stageId,
        stageId,
        dias,
        slaBreach,
        /* COMBINADO NÃO É TRAVADO, MAS TAMBÉM NÃO SOME: a tela precisa poder dizer
           "aguardando retorno · volta em 08/10". Negócio que some da cobrança é como
           se estaciona carteira. */
        aguardando: reguaEstado.aguardando,
        aguardandoAte: reguaEstado.aguardandoAte,
        slaRatio: Math.round(slaRatio * 100),
        rank,
        /* `temperatura` não é mais escrita aqui: comTemperatura a define a partir da
           nota, na cadeia no fim deste laço. */
        proximaReuniao,
        proximaAtividade,
        ultimaInteracao: d.properties.notes_last_updated || null,
        valor: Math.round(parseFloat(d.properties.amount) || 0),
        lat: lat,   /* coordenadaValida ja garantiu: numero finito e nao-zero, ou null */
        // Endereço textual segue junto: é o que permite ao front geocodificar quem não
        // tem coordenada, em vez de sumir do mapa.
        cep: d.properties.cep || null,
        bairro: d.properties.bairro || null,
        cidade: d.properties.cidade || null,
        logradouro: d.properties.logradouro || null,
        numero: d.properties.numero || null,
        celular: d.properties.celular || null,
        ...Object.fromEntries(FIELD_SALES_STAGE_PROPS.map(prop => [prop, d.properties[prop] || null])),
        tarefas: tarefasPorDealDoRep[d.id] || [],
        lng: (lng != null && !isNaN(lng)) ? lng : null
      };
    /* a nota e a faixa entram aqui, uma vez, para todos os recortes deste rep
       (travados, criticos, quentes) — que são fatias desta mesma lista. */
    }).map(l => comTemperatura(l)).sort((a, b) => b.dias - a.dias);

    const leadsTravados = withDays.filter(l => l.slaBreach).length;

    // "Avançou de etapa esta semana" = está numa etapa além de Prospecção E entrou
    // nessa etapa atual há 7 dias ou menos (usa o mesmo `dias` já calculado acima,
    // que vem de hs_v2_date_entered_<etapa>). Não é perfeito (não pega quem já nasceu
    // direto numa etapa mais avançada), mas é o proxy mais simples com o dado que já temos.
    avancaramSemanaTime += withDays.filter(l => l.stageId !== STAGES.prospeccao && l.dias <= 7).length;

    // Top 5 mais antigos (referência rápida, independente de terem estourado SLA ou não)
    const criticos = withDays.slice(0, 5).map(l => ({
      ...l,
      destaque: l.slaBreach || l.dias > 60
    }));

    // TODOS os leads com SLA estourado — pra métrica completa no card do executivo,
    // não só uma amostra de 5. Ordenado do mais travado pro menos travado.
    const travados = withDays.filter(l => l.slaBreach).map(l => ({ ...l, destaque: true }));

    /* TODOS OS ABERTOS, ENXUTOS (19/09/26). `criticos`, `travados` e `plotaveis` são
       três RECORTES: os 5 mais velhos, os que estouraram SLA, os que têm coordenada.
       Medido no snapshot deste dia, os três juntos cobriam 124 dos 204 abertos do
       time — o mapa de cadência da aba Pessoas precisa dos 204, porque a pergunta
       dele é "qual é o próximo toque de cada negócio" e um negócio ausente vira
       silêncio, não vira aviso.

       Campos escolhidos um a um: são os que a linha do mapa de cadência e o
       drill-down desenham. O negócio completo x204 são 800 KB no navegador de todo
       gestor; estes nove campos são ~27 KB. */
    const abertos = withDays.map(l => ({
      id: l.id, name: l.name, stage: l.stage, stageId: l.stageId,
      dias: l.dias, slaBreach: !!l.slaBreach, temperatura: l.temperatura,
      mrr: (l.mrr == null ? null : l.mrr),
      lat: l.lat, lng: l.lng
    }));

    // Coleta pros rankings de temperatura do time inteiro (usado no Cockpit geral)
    withDays.forEach(l => {
      const comDono = { ...l, vendedor: rep.name, ownerId: rep.ownerId };
      if (l.temperatura === 'quente') todosQuentes.push(comDono);
      if (l.temperatura === 'frio') todosFrios.push(comDono);
    });

    // Ganhos da semana desse executivo (pro painel "Ganhos por executivo")
    const ganhosSemanaDeals = await stageDealsLast7DaysByOwner([STAGES.ganho1, STAGES.ganho2], rep.ownerId);
    // Fechados no MÊS desse executivo (pra coluna "Meta do mês" da tabela Por executivo)
    const fechadosNoMesRep = await stageTotalThisMonthByOwner([STAGES.ganho1, STAGES.ganho2], rep.ownerId);

    repsData[rep.ownerId] = {
      name: rep.name,
      open: deals.length,
      stages,
      criticos,
      travados,
      /* a lista completa; `open` continua sendo a contagem e tem de bater com ela */
      abertos,
      quentes: withDays.filter(l => l.temperatura === 'quente'),
      // TODOS os negócios em aberto que dá pra plotar (Julyan, 11/08: "todos os leads
      // têm coordenadas, adicione no mapa").
      //
      // Medido no dia: 126 dos 143 negócios abertos do time (88%) têm latitude — o
      // Expogo grava quando o executivo registra na rua. Mas o snapshot só expunha
      // `criticos`/`travados`/`quentes`, que são recortes dos piores casos: 46 no total.
      // Os outros 80 existiam no CRM, tinham endereço, e simplesmente não chegavam ao
      // mapa do gestor. Ele olhava a rota de um executivo e via um terço do território.
      //
      // Campos enxutos de propósito: este objeto vai inteiro pro navegador de todo
      // gestor, e mandar o negócio completo x143 incharia o payload sem necessidade.
      plotaveis: abertos.filter(l => l.lat != null && l.lng != null),
      leadsTravados,
      ganhosSemana: ganhosSemanaDeals.length,
      ganhosSemanaNomes: ganhosSemanaDeals.map(d => d.name),
      // BLOCO 15: os nomes ao lado das contagens do dia. Teto de 12 pelo mesmo motivo
      // de plotaveis: este objeto vai inteiro pro navegador de todo gestor.
      avancosHojeNomes: avancosHojeNomes.slice(0, 12),
      propostasHojeNomes: propostasHojeNomes.slice(0, 12),
      fechadosNoMes: fechadosNoMesRep,
      /* AS TRES METAS DELE. `metaMensal` continua com o nome antigo porque quatro telas
         o leem; as duas novas vao ao lado. */
      metaMensal: metaDe(rep.ownerId).clientes,
      metaMrr: metaDe(rep.ownerId).mrr,
      metaReceita: metaDe(rep.ownerId).receita,
      patamarMeta: metaDe(rep.ownerId).patamar || null,
      visitasHubspotHoje,
      avancosHubspotHoje,
      propostasHubspotHoje,
      fechamentosHubspotHoje
    };
    emAbertoTime += deals.length;
  }

  const leadsTravadosTime = Object.values(repsData).reduce((sum, r) => sum + r.leadsTravados, 0);

  // Ranking de temperatura do time inteiro — pros cards "Leads Quentes" e "Leads Travados/Frios"
  // do Cockpit geral. Quentes: etapa avançada (Demo+) e dentro do SLA. Frios: SLA estourado.
  /* A LISTA DE QUENTES NÃO PODE SER CORTADA (31/08/26).
     Era `.slice(0, 12)`, e esse corte nasceu para o cartão "Leads quentes" e para orçar
     a busca de notas. Só que o cliente lê ESTE array em quentesNoRadar(), que alimenta
     o KPI "quentes com próximo passo" do gestor, a faixa da Daily, o dossiê do 1:1 e a
     frase de coaching. Medido em 31/08: a tela dizia 11 quentes e o time tinha 26. O
     gestor cobrava sobre um teto de cartão sem nenhum aviso na tela.
     Agora a lista vai inteira (é dela que saem as contagens) e o TETO FICA ONDE ELE
     TINHA MOTIVO: na busca de notas, logo abaixo, que custa 3 chamadas por lead. */
  const leadsQuentes = todosQuentes.sort((a, b) => (b.rank - a.rank) || (a.slaRatio - b.slaRatio));
  /* frios continua cortado de propósito: é lista de cartão, e NENHUM contador da tela lê
     este array — o KPI "Leads travados" vem de repsData e o modal dele agrega o funil
     inteiro. Cortar lista de cartão é legítimo; o defeito era contador lendo corte. */
  const leadsFrios = todosFrios.sort((a, b) => b.dias - a.dias).slice(0, 12);

  // Busca as notas/observações mais recentes dos leads que realmente aparecem em tela:
  // os ~24 em destaque do time (quentes/frios) MAIS os 5 travados de cada executivo — que
  // são os que alimentam o "roteiro de hoje" no painel individual dele. Sem incluir os
  // travados por executivo, o roteiro ficava sem contexto justamente pros leads dele.
  // Dedupe por id: um mesmo lead costuma estar em mais de uma lista, e cada busca de nota
  // custa 3 chamadas com pausa de rate limit — buscar 2x o mesmo lead era desperdício.
  // Requer escopo crm.objects.notes.read no Private App do HubSpot.
  /* ══ AS NOTAS VÊM EM LOTE, E PARA O FUNIL INTEIRO (17/09/26) ═══════════════════
     Era um laço de `buscarNotasDoLead` sobre ~74 leads de destaque — 3 chamadas e ~1s
     de espera por lead, e nos outros negócios a ficha abria SEM nada do que o
     executivo escreveu na rua. O Julyan viu isso: 3 dos 15 negócios da etapa que ele
     clicou não tinham registro nenhum.

     Agora são ~14 chamadas paginadas para TODOS os negócios, contra 222 para 74.
     Trinta vezes mais barato e sem corte arbitrário — ver buscarNotasDoAppEmLote. */
  console.log('Buscando as notas do app de campo em lote...');
  /* `agoraMs` existe só dentro de fetchAgenda — aqui o relógio é próprio. Eu tinha
     escrito `agoraMs` e `funilPorEtapa` de cabeça; o segundo não existe em lugar
     nenhum deste arquivo (o nome real é `funilLeads`). Medir os nomes no escopo antes
     de escrever é o que separou isto de um ReferenceError em produção. */
  const agoraParaNotas = Date.now();
  const notasPorId = await buscarNotasDoAppEmLote(
    agoraParaNotas - 60 * 86400000, agoraParaNotas + 86400000);

  /* APLICA EM TODO OBJETO QUE REFERENCIA O NEGÓCIO. O mesmo negócio existe como
     objetos SEPARADOS em repsData[x].travados, em repsData[x].quentes, nas listas do
     time e no funil por etapa — atribuir num só deixaria a ficha com nota em uma tela
     e sem nota na outra, para o mesmo lead. */
  const todosOsLeads = [
    ...leadsQuentes, ...leadsFrios,
    ...Object.values(repsData).flatMap(function (r) {
      return [...(r.travados || []), ...(r.quentes || []), ...(r.criticos || [])];
    }),
    ...Object.values(funilLeads || {}).flat()
  ];
  let comNota = 0;
  todosOsLeads.forEach(function (lead) {
    if (!lead || !lead.id) return;
    lead.notas = notasPorId[String(lead.id)] || [];
    if (lead.notas.length) comNota++;
  });
  console.log('Notas aplicadas: ' + comNota + ' de ' + todosOsLeads.length
    + ' objetos de lead ficaram com ao menos uma observação do app.');

  const output = {
    updatedAt: new Date().toISOString(),
    /* CADÊNCIA DIÁRIA: atividade por executivo por dia útil (aba Time v2). `null`
       quando a leitura falhou — a tela distingue isso de zero. */
    cadenciaDiaria,
    /* O QUE CADA OPÇÃO SE CHAMA NO CRM. A tela grava o valor e mostra o rótulo; sem
       isto ela mostrava o valor cru e divergia do HubSpot em oito opções. Vai junto do
       snapshot porque é dado do CRM, não configuração nossa. */
    opcoesDeNegocio: cacheDeOpcoes,
    kpis: {
      leadsCriados,
      ganhos: ganhoSemana,
      perdidos: perdidoSemana,
      emAberto: emAbertoTime,
      emReciclagem: reciclagem,
      leadsTravados: leadsTravadosTime,
      fechadosNoMes,

      metaMensalFechados: META_MENSAL_FECHADOS,
      metaMrrTime: META_MRR_TIME,
      metaReceitaTime: META_RECEITA_TIME,
      metasVersao: METAS.versao || null,
      metasMes: METAS.mes || null,
      taxaAvanco: emAbertoTime > 0 ? Math.round((avancaramSemanaTime / emAbertoTime) * 100) : 0
    },
    kpiDetalhe: {
      leadsCriados: leadsCriadosDeals.map(d => ({ nome: d.properties.dealname, ownerId: d.properties.hubspot_owner_id, criadoEm: d.properties.createdate })),
      perdidos: perdidoSemanaDeals.map(d => ({ nome: d.properties.dealname, ownerId: d.properties.hubspot_owner_id }))
    },
    motivosPerda,
    historicoEtapas,
    funil: {
      labels: ['Backlog', 'Prospecção', 'Visita', 'Conversa com Decisor', 'Demo/Proposta', 'Negociação', 'Ag. Pagamento', 'Fechado/Onboarding', 'Perdido', 'Reciclagem'],
      valores: [backlog, prospeccao, visita, diagnostico, demoProposta, negociacao, agPagamento, ganho, perdido, reciclagem]
      /* `cores` SAIU EM 07/09/26. Ela era a segunda copia da paleta de etapa: a tela
         tinha STAGE_COLORS e o snapshot trazia este array, e os dois eram lidos em
         lugares diferentes — trocar a identidade num deles deixava o outro azul.
         Cor e identidade visual, nao dado de CRM; a tela resolve por stageColor(id).
         Array posicional era o agravante: inserir uma etapa no meio desalinhava todas
         as cores seguintes sem erro nenhum. */
    },
    temperatura: {
      quentes: leadsQuentes,
      frios: leadsFrios
    },
    stageMeta: {
      slaDays: SLA_DAYS,
      descriptions: STAGE_DESCRIPTIONS,
      labels: STAGE_LABELS
    },
    funilLeads,
    /* ══ PLANEJAMENTO v7 — OS PROPÓSITOS (23/09/26) ═══════════════════════════════
       Ver planejamentoPorProposito(), logo acima do payload. Três propósitos saem
       daqui; `nova` fica no navegador porque leads_prospeccao é do Supabase. */
    planejamento: planejamentoPorProposito(funilLeads),
    /* A JANELA DO GANHO, como as outras duas: a tela diz DESDE QUANDO a coluna mostra,
       em vez de fingir uma régua de SLA que não existe para venda fechada. */
    ganhoVisivel: {
      corte: CORTE_GANHO_ISO,
      desde: new Date(inicioDoGanhoVisivel()).toISOString().slice(0, 10),
      visiveis: ganhosDaSemana.length
    },
    onboardingVisivel: {
      corte: CORTE_ONBOARDING_ISO,
      desde: new Date(inicioDoOnboardingVisivel()).toISOString().slice(0, 10),
      visiveis: onboardingRecentes.length,
      /* Quantas propriedades foram pedidas ao HubSpot. A tela não mostra isso; o log da
         rodada mostra, e é como se confere que "todas" continua sendo todas depois de
         alguém criar uma propriedade nova no pipe. */
      propriedadesPedidas: propsPedidas
    },
    perdidoVisivel: {
      corte: CORTE_PERDIDO_ISO,
      desde: new Date(inicioDoPerdidoVisivel()).toISOString().slice(0, 10),
      /* A tela precisa poder dizer de onde vem o recorte: 'Perdido (2)' sem dizer 'nos
         últimos 7 dias' seria a tela mentindo por omissão — o executivo leria que perdeu
         dois negócios na vida. O total histórico NÃO desce: são 1.811 e nenhuma tela do
         Cockpit tem pergunta que ele responda. */
      visiveis: perdidosRecentes.length
    },
    leadsReciclagem60,
    vendasMes,
    reps: repsData,
    agenda
  };

  const outPath = path.join(__dirname, '..', 'data', 'hubspot.json');
  const previousPath = path.join(__dirname, '..', 'data', 'hubspot-previous.json');

  // Guarda o snapshot de KPIs de ANTES desta atualização, pra dar as setas de
  // comparação no painel ("vs. última atualização"). Só guarda os números
  // pequenos (kpis), não o dump inteiro, pra não pesar o repositório.
  if (fs.existsSync(outPath)) {
    try {
      const prevFull = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      fs.writeFileSync(previousPath, JSON.stringify({ updatedAt: prevFull.updatedAt, kpis: prevFull.kpis }, null, 2));
    } catch (e) {
      console.log('Aviso: não consegui ler o hubspot.json anterior pra guardar o snapshot de comparação:', e.message);
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`OK — dados gravados em ${outPath}`);

  // AUTOMAÇÃO 3 (13/08/26) — grava o resultado desta rodada (mesmo quando está tudo
  // limpo) em data/sync-status.json. Sem tabela nova no Supabase, sem precisar de
  // acesso a log do GitHub Actions: o próprio site lê este arquivo (via montar-dados.js)
  // e mostra um aviso pro gestor se alguma escrita da Daily falhou ou não bateu na
  // conferência pós-escrita. "0 falhas" também é informação — confirma que a rodada
  // rodou limpa, em vez de o gestor só descobrir um problema quando alguém reclama.
  const statusPath = path.join(__dirname, '..', 'data', 'sync-status.json');
  fs.writeFileSync(statusPath, JSON.stringify({
    ultimaExecucao: new Date().toISOString(),
    totalExecutivos: REPS.length,
    falhas: falhasSyncDaily
  }, null, 2));
  console.log(`OK — status de sincronização gravado (${falhasSyncDaily.length} falha(s) nesta rodada)`);

  // ── PUBLICA O QUE ACABOU DE GRAVAR ──────────────────────────────────────────────
  // A ordem importa: os arquivos vao primeiro porque o preview local e o fallback da
  // rota dependem deles; a publicacao vem depois, com o mesmo conteudo. Assim os dois
  // lugares nunca discordam dentro de uma rodada.
  const origemDaRodada = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    ? 'webhook-ou-manual' : (process.env.GITHUB_EVENT_NAME || 'local');
  const paraPublicar = [
    ['hubspot', output],
    ['sync-status', { ultimaExecucao: new Date().toISOString(), totalExecutivos: REPS.length, falhas: falhasSyncDaily }]
  ];
  // Os outros arquivos do snapshot sao gravados por OUTROS scripts (weekly-raw e
  // resumo-semanal pelo comparativo semanal, narrativas pela geracao de texto). Aqui
  // publica-se o que ESTE robo produziu; cada um publica o seu, e a rota le a uniao.
  const anterior = (() => {
    try { return JSON.parse(fs.readFileSync(previousPath, 'utf8')); } catch (e) { return null; }
  })();
  if (anterior) paraPublicar.push(['hubspot-previous', anterior]);

  let publicados = 0, pulados = 0;
  for (const [chave, conteudo] of paraPublicar) {
    const r = await publicarSnapshot(chave, conteudo, origemDaRodada);
    if (r && r.ok) publicados += 1;
    /* PULADO NAO E PUBLICADO. A copia daqui devolvia {ok:true, skipped:true} sem
       credencial, e esta contagem somava isso como sucesso: rodando local, sem chave, o
       log dizia "7 de 7 publicados" tendo publicado zero. O lib devolve ok:false. */
    else if (r && r.skipped) pulados += 1;
  }
  console.log(`OK — ${publicados} de ${paraPublicar.length} snapshot(s) publicados no Supabase`
    + (pulados ? ` (${pulados} pulado(s): sem SUPABASE_URL/SERVICE_KEY neste ambiente)` : '') + '.');
}

main().catch(err => {
  console.error('Falha ao buscar dados do HubSpot:', err.message);
  process.exit(1);
});
