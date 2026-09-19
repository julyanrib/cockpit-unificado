// scripts/fetch-weekly-comparison.js
// Roda toda SEXTA-FEIRA via GitHub Actions. Compara a semana que passou com a anterior
// e grava data/weekly-raw.json — que o generate-weekly-summary.js usa pra pedir o resumo à Claude.

const fs = require('fs');
const path = require('path');
/* A RÉGUA DE LOTE É COMPARTILHADA com o robô diário — ver o cabeçalho da lib. */
const { LOTE_GAP_MIN, LOTE_MINIMO, lotesDePerda } = require('../lib/lotes-de-perda.js');

const TOKEN = process.env.HUBSPOT_TOKEN;
if (!TOKEN) {
  console.error('ERRO: variável HUBSPOT_TOKEN não encontrada.');
  process.exit(1);
}

const PIPELINE_ID = '916011864';
const STAGES = {
  ganho1: '1396006162',        // Negócio Fechado — o ÚNICO que conta como venda de verdade
  ganho2: '1396006163',        // Enviado Onboarding — NÃO conta aqui (é a etapa seguinte do mesmo negócio)
  perdido: '1396006164',
  reciclagem: '1398311191',
  demoProposta: '1395880471',
  negociacao: '1395880472'
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function isTestDeal(dealname) {
  if (!dealname) return false;
  return /teste/i.test(dealname);
}

async function hsSearch(body, attempt = 1) {
  await sleep(350);
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * attempt);
    return hsSearch(body, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API error ${res.status}: ${text}`);
  }
  return res.json();
}

function fmtRange(start, end) {
  // Formata no CALENDÁRIO DE BRASÍLIA: o runner do Actions roda em UTC, e "sexta
  // 23:59 BRT" é "sábado 02:59 UTC" — o toLocaleDateString sem timezone mostrava a
  // janela terminando um dia depois (o famoso "27/07–03/08" que invadia a semana atual).
  const f = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  const ano = new Date(end.getTime() - 3 * 60 * 60 * 1000).getUTCFullYear();
  return `${f(start)}–${f(end)}/${ano}`;
}

// Etapa "Conta Alvo": lista que o Julyan sobe MANUALMENTE em lote, antes de qualquer
// trabalho de campo. Não é atividade de executivo.
const STAGE_CONTA_ALVO = '1413529973';

// Conta negócios criados na janela — EXCLUINDO Conta Alvo.
//
// POR QUE (Julyan, 11/08: "contas alvo não precisam contar ali, só a partir de
// prospecção"). Medido no dia: em agosto foram criados 597 negócios no pipeline, dos
// quais 456 (76%) eram Conta Alvo. A análise semanal leu isso como "a criação de
// negócios explodiu de 102 para 566 — o maior volume registrado" e tratou um upload de
// planilha como performance do time. Número inflado é pior que número ausente: ele
// desloca a leitura da semana inteira e some com o sinal real, que era 72.
//
// O filtro é pela etapa ATUAL, e isso é proposital: conta-alvo que o executivo pegou e
// levou pra Prospecção já saiu de "Conta Alvo" e volta a contar — que é exatamente a
// régua pedida, "só a partir de prospecção".
async function leadsCriadosNaJanela(startMs, endMs) {
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'createdate', operator: 'BETWEEN', value: String(startMs), highValue: String(endMs) },
        { propertyName: 'dealstage', operator: 'NEQ', value: STAGE_CONTA_ALVO }
      ]
    }],
    // BLOCO 41 (14/08/26) — antes só o total (limit:1) bastava pro KPI de time. O board
    // por executivo da Semana (gestor) precisa de "negócios criados" POR PESSOA, e não
    // existia essa quebra em lugar nenhum — só ganhos/reuniões já vinham com
    // hubspot_owner_id. Mesmo padrão dos dois: busca os negócios de verdade (até 100,
    // igual ganhosNaJanela/reunioesNaJanela — nenhuma semana do time bate isso hoje) e
    // devolve com dono. O total do time (leadsCriados) continua vindo de data.total,
    // que é exato mesmo se a paginação de results algum dia cortar em 100.
    properties: ['dealname', 'hubspot_owner_id'],
    limit: 100
  });
  return {
    total: data.total || 0,
    deals: (data.results || []).filter(d => !isTestDeal(d.properties.dealname)).map(d => ({
      nome: d.properties.dealname,
      ownerId: d.properties.hubspot_owner_id
    }))
  };
}

// Conta negócios que foram FECHADOS DE VERDADE (closedate, não hs_lastmodifieddate) na janela.
// IMPORTANTE: inclui as duas etapas pós-venda (Negócio Fechado E Enviado Onboarding) —
// a automação de vocês move o negócio pago direto pra Onboarding, então um negócio fechado
// ontem pode já não estar mais "parado" em Negócio Fechado hoje. closedate é fixo e não muda
// quando o negócio avança, então cada venda real só é contada 1 vez, não importa em qual das
// duas etapas ele está agora.
async function ganhosNaJanela(startMs, endMs) {
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'IN', values: [STAGES.ganho1, STAGES.ganho2] },
        { propertyName: 'closedate', operator: 'BETWEEN', value: String(startMs), highValue: String(endMs) }
      ]
    }],
    properties: ['dealname', 'hubspot_owner_id', 'valor_de_mrr', 'closedate'],
    limit: 100
  });
  return (data.results || []).filter(d => !isTestDeal(d.properties.dealname));
}

// PERDIDOS E RECICLAGEM — duas correções em 02/09/26, achadas medindo a tela da Semana.
//
// 1. "100 perdidos na semana" era o TETO DA BUSCA, não uma contagem. Esta função pedia
//    limit:100 e devolvia results.length: semana com mais de cem devolve exatamente cem. E
//    devolvia 100 nas DUAS janelas comparadas, que é a assinatura de um número saturado —
//    semana atual e anterior não dão o mesmo valor redondo por coincidência. As outras
//    contagens deste arquivo já usam data.total, que é exato (o comentário de leadsCriados
//    diz isso: "exato mesmo se a paginação cortar em 100"); esta ficou para trás.
//    O filtro isTestDeal não cabe no total (ele precisa dos results, e o total vem do
//    servidor). Os negócios de teste conhecidos são dois; publicar um teto de 100 como se
//    fosse a realidade é um erro muito maior que deixar dois passarem.
//
// 2. A DATA ERA A ERRADA. hs_lastmodifieddate é "alguém mexeu no registro nesta janela",
//    não "isto aconteceu nesta janela": negócio perdido em julho e editado ontem contava
//    como perda da semana. O comentário antigo dizia que não havia "closedate equivalente"
//    para essas etapas — e há: Perdido é etapa FECHADA, então o HubSpot grava closedate na
//    entrada dela (foi assim que a coluna Perdido do kanban datou as 1.811 do histórico).
//    Reciclagem não é fechada, então não tem closedate — e a propriedade de entrada DELA
//    (hs_v2_date_entered_1398311191) NÃO EXISTE no portal: pedi-la derrubou o robô com um
//    HubSpot 400 em 02/09/26 (run 33639042897), o que travou a rodada inteira. Todas as
//    outras etapas do Field Sales têm a sua (conferido uma por uma na API de propriedades);
//    a Reciclagem é a exceção. A propriedade global hs_v2_date_entered_current_stage existe
//    e diz a mesma coisa aqui, porque o filtro já fixa dealstage EQ Reciclagem: "está em
//    Reciclagem" + "entrou na etapa atual nesta janela" = "entrou em Reciclagem nesta
//    janela". Ela só não conta quem entrou e já saiu na mesma semana — limite que o filtro
//    por dealstage sempre teve, antes e depois desta correção.
//    LIÇÃO: propriedade por ID de etapa não é garantida por existir a etapa. Antes de pôr
//    uma no robô, perguntar à API se ela existe — o robô é o gargalo de TODA a ferramenta.
async function contagemComFiltro(stageId, startMs, endMs, propDaData) {
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: stageId },
        { propertyName: propDaData, operator: 'BETWEEN', value: String(startMs), highValue: String(endMs) }
      ]
    }],
    properties: ['dealname'],
    limit: 1
  });
  return data.total || 0;
}

/* ══ PERDA UMA A UMA x LIMPEZA EM LOTE (19/09/26) ══════════════════════════════════
   Julyan: "eles limparam o funil mesmo". O placar contava faxina como derrota — na
   semana 14–18/09, 65 "perdidos" onde 45 eram descarte de base.

   A RÉGUA VIVE EM lib/lotes-de-perda.js, e não aqui: no mesmo dia ela passou a ser
   necessária no gráfico de motivos, que é do robô DIÁRIO. Duas cópias de "o que é um
   lote" seriam duas respostas para a mesma pergunta em duas telas.

   CUSTO: esta busca SUBSTITUI a contagem que já existia (contagemComFiltro com
   limit:1). Uma página de 100 em vez de uma de 1 — mesma chamada, e nenhuma a mais.
   Acima de 100 perdidos na semana a contagem segue vindo de `total`, que é o número
   certo; só o detalhe do lote fica incompleto, e a tela diz isso. */
async function perdidosNaJanela(startMs, endMs) {
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: STAGES.perdido },
        { propertyName: 'closedate', operator: 'BETWEEN', value: String(startMs), highValue: String(endMs) }
      ]
    }],
    properties: ['dealname', 'hubspot_owner_id', 'closedate', 'motivo_do_perdido'],
    sorts: [{ propertyName: 'closedate', direction: 'ASCENDING' }],
    limit: 100
  });
  /* O TOTAL VEM DA API, e não do tamanho da página: são coisas diferentes quando
     passa de 100, e o total é o número que o placar mostra. */
  const total = data.total || 0;
  const deals = (data.results || []).filter(d => !isTestDeal(d.properties.dealname));
  return { total: total, deals: deals, completo: deals.length >= total };
}

// "Reuniões" = negócios que ENTRARAM em Demo/Proposta na janela (fazer uma demo pressupõe reunião)
async function reunioesNaJanela(startMs, endMs) {
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: STAGES.demoProposta },
        { propertyName: `hs_v2_date_entered_${STAGES.demoProposta}`, operator: 'BETWEEN', value: String(startMs), highValue: String(endMs) }
      ]
    }],
    properties: ['dealname', 'hubspot_owner_id'],
    limit: 100
  });
  return (data.results || []).filter(d => !isTestDeal(d.properties.dealname));
}

async function windowCounts(startMs, endMs) {
  const leadsCriadosResultado = await leadsCriadosNaJanela(startMs, endMs);
  const ganhosDeals = await ganhosNaJanela(startMs, endMs);
  /* closedate para Perdido (etapa fechada) e data de ENTRADA para Reciclagem (que não é
     fechada, então não tem closedate). Ver o comentário de contagemComFiltro.

     O PERDIDO DEIXOU DE SER SÓ UMA CONTAGEM (19/09/26): a mesma chamada agora traz os
     negócios, para separar perda uma a uma de limpeza em lote. Ver perdidosNaJanela. */
  const perdidosResultado = await perdidosNaJanela(startMs, endMs);
  const perdidos = perdidosResultado.total;
  const lote = lotesDePerda(perdidosResultado.deals);
  const reciclagem = await contagemComFiltro(STAGES.reciclagem, startMs, endMs,
    'hs_v2_date_entered_current_stage');
  const reunioesDeals = await reunioesNaJanela(startMs, endMs);

  return {
    leadsCriados: leadsCriadosResultado.total,
    // BLOCO 41 — só a janela ATUAL importa por pessoa (o board da Semana não compara
    // "criados" contra a semana anterior por executivo, só o time todo já compara).
    leadsCriadosDeals: leadsCriadosResultado.deals,
    ganhos: ganhosDeals.length,
    ganhosDeals: ganhosDeals.map(d => ({
      nome: d.properties.dealname,
      ownerId: d.properties.hubspot_owner_id,
      mrr: parseFloat(d.properties.valor_de_mrr) || 0
    })),
    perdidos,
    /* O TOTAL CONTINUA SENDO O TOTAL. Estes três campos são LEITURA ao lado dele, e a
       tela escreve a regra junto — nada é reclassificado em silêncio. */
    perdidosEmLote: lote.emLote,
    perdidosSozinhos: Math.max(0, perdidos - lote.emLote),
    lotesDePerda: lote.lotes,
    /* false quando passou de 100 na janela: a contagem segue certa (vem do total da
       API), mas o detalhe do lote fica incompleto e a tela precisa dizer. */
    perdidosDetalheCompleto: perdidosResultado.completo,
    loteRegra: { gapMin: LOTE_GAP_MIN, minimo: LOTE_MINIMO },
    reciclagem,
    reunioes: reunioesDeals.length,
    reunioesDeals: reunioesDeals.map(d => ({
      nome: d.properties.dealname,
      ownerId: d.properties.hubspot_owner_id
    }))
  };
}

// Início da SEMANA CIVIL corrente: segunda-feira 00:00 no horário de Brasília
// (mesma regra e mesma implementação do fetch-hubspot.js — 00:00 BRT = 03:00 UTC).
// Correção de consistência 06/08/26: antes a "semana atual" era uma janela rolante
// (now - 6 dias), diferente do critério oficial e do que a tela chama de "semana".
function inicioSemanaBrasiliaMs() {
  const b = new Date(Date.now() - 3 * 60 * 60 * 1000); // deslocado -3h; getUTC* = calendário BRT
  const diasDesdeSegunda = (b.getUTCDay() + 6) % 7;    // seg=0 ... dom=6
  return Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - diasDesdeSegunda, 3, 0, 0);
}

async function main() {
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;

  // Semana atual: segunda 00:00 BRT → agora (o cron roda sexta, então é seg–sex na prática).
  // Semana anterior: segunda → SEXTA 23:59:59 BRT da semana passada. Era segunda→domingo,
  // o que comparava 5 dias úteis contra 7 corridos — lead criado ou fechamento de sábado
  // inflava a semana anterior e a comparação nascia torta. Field sales é seg–sex; o
  // resultado semanal compara útil com útil (decisão do Julyan, 08/08/26).
  /* ══ A ÚLTIMA SEMANA FECHADA, EM QUALQUER DIA E HORA (16/09/26) ═══════════════
     Era `inicioSemanaBrasiliaMs()` cru, com o fim capado em `min(agora, +5 dias)`.
     Isso só dá seg–sex se o robô rodar DEPOIS da sexta e ANTES da segunda. O cron é
     domingo 22h BRT — três horas da virada do calendário brasileiro — e atraso de
     três horas no Actions é rotina. Medido com a própria função:

       sexta 17h BRT         → 07/09–11/09   5 dias, certo
       domingo 22h BRT       → 07/09–11/09   5 dias, certo
       segunda 01h BRT (+3h) → 14/09–14/09   UM dia
       quarta 10h BRT        → 14/09–16/09   três dias

     E a janela parcial não fica no robô: ela vira o placar do gestor. A Semana v5
     passou a semana toda se defendendo disso — MRR de outra semana ao lado dos
     ganhos, "9 vendedores parados" sendo oito falsos, barras de histórico com
     janelas de um dia. Sintomas, todos, desta linha.

     AGORA: a semana reportada é a última que FECHOU. Se a sexta desta semana já
     passou, é esta semana; senão, é a anterior. Rodar sexta à noite, domingo,
     segunda de manhã ou quarta dá a MESMA resposta, e sempre 5 dias. */
  const semanaCorrente = inicioSemanaBrasiliaMs();
  /* ══ A SEMANA FECHA ÀS 20H DE SEXTA (19/09/26) ═══════════════════════════════
     Era sexta 23:59:59.999, e o robô rodava domingo 22h. Julyan pediu o robô na
     sexta às 20h — e com o corte antigo ele reportaria a semana RETRASADA, porque
     às 20h de sexta `fechou` ainda seria falso. Medido antes de mexer: 07/09–11/09
     em vez de 14/09–18/09.

     20H NÃO É UM NÚMERO PARA CABER NO CRON: é quando o time para. A última rodada
     de dia útil do daily-refresh é 19:00 BRT e os check-ins do app cessam antes.

     E A JANELA DE DADOS NÃO ENCOLHE — ela continua indo até sexta 23:59:59.999,
     logo abaixo. Encurtá-la para as 20h faria o negócio fechado na sexta à noite
     cair em semana NENHUMA, porque a próxima janela só começa na segunda. Assim,
     as quatro horas finais entram na contagem na rodada seguinte (sábado 09:00) e
     o board da Semana, que desde 19/09 lê a fonte fresca, se completa sozinho. */
  const HORA = 60 * 60 * 1000;
  const sextaDaCorrente = semanaCorrente + 4 * DAY + 20 * HORA;   // sexta 20:00 BRT
  const fechou = now.getTime() >= sextaDaCorrente;
  const atualInicio = new Date(fechou ? semanaCorrente : semanaCorrente - 7 * DAY);
  const atualFim = new Date(atualInicio.getTime() + 5 * DAY - 1);
  const anteriorInicio = new Date(atualInicio.getTime() - 7 * DAY);
  const anteriorFim = new Date(anteriorInicio.getTime() + 5 * DAY - 1); // sexta 23:59:59.999 BRT
  console.log(fechou
    ? 'semana corrente já fechou — reportando ela'
    : 'semana corrente em curso — reportando a anterior, que é a última fechada');

  console.log('Buscando semana atual...');
  const atual = await windowCounts(atualInicio.getTime(), atualFim.getTime());
  console.log('Buscando semana anterior...');
  const anterior = await windowCounts(anteriorInicio.getTime(), anteriorFim.getTime());

  // Reaproveita o snapshot de hoje (já buscado pelo job diário) — dá contexto de gargalo
  // por executivo e a lista de "quentes" já calculada (sem precisar buscar de novo)
  /* ══ DISCO PRIMEIRO, DEPOIS A TABELA (14/09/26) ═══════════════════════════════════
     `data/hubspot.json` esta no .gitignore: existe na maquina de quem desenvolve e
     NUNCA num checkout do Actions. Este script lia so o disco, entao em producao
     `hubspotSnapshot` era sempre null e o resumo saia sem board e sem quentes — toda
     semana, em silencio, com a Action verde. Medido no snapshot de hoje: porRep {}.

     A tabela e a MESMA em que este script ja publica o weekly-raw, com as mesmas
     credenciais. Nenhuma dependencia nova. */
  const hubspotPath = path.join(__dirname, '..', 'data', 'hubspot.json');
  let hubspotSnapshot = fs.existsSync(hubspotPath)
    ? JSON.parse(fs.readFileSync(hubspotPath, 'utf8'))
    : null;
  let deOndeVeioOSnapshot = hubspotSnapshot ? 'disco' : null;

  if (!hubspotSnapshot && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/cockpit_snapshot?chave=eq.hubspot&select=conteudo`,
        { headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        } });
      if (r.ok) {
        const linhas = await r.json();
        if (Array.isArray(linhas) && linhas[0] && linhas[0].conteudo) {
          hubspotSnapshot = linhas[0].conteudo;
          deOndeVeioOSnapshot = 'tabela cockpit_snapshot';
        }
      } else {
        console.error('AVISO: a tabela recusou a leitura do snapshot hubspot — HTTP ' + r.status);
      }
    } catch (e) { console.error('AVISO: nao consegui ler o snapshot hubspot da tabela: ' + (e && e.message)); }
  }

  /* SEM O SNAPSHOT NAO HA BOARD NEM QUENTES, e um resumo assim parece completo: os KPIs
     do topo vem da API e enchem a tela. Foi exatamente essa aparencia que escondeu o
     defeito por semanas. Entao para aqui. */
  const repsNoSnapshot = hubspotSnapshot && hubspotSnapshot.reps
    ? Object.keys(hubspotSnapshot.reps).length : 0;
  if (!repsNoSnapshot) {
    console.error('ERRO: sem o snapshot do HubSpot nao ha board por executivo nem quentes.');
    console.error('  disco: ' + (fs.existsSync(hubspotPath) ? 'existe mas sem reps' : 'data/hubspot.json ausente (gitignored)'));
    console.error('  tabela: ' + (process.env.SUPABASE_URL ? 'consultada e sem resultado util' : 'SUPABASE_URL ausente neste passo'));
    console.error('  Publicar assim geraria um resumo que PARECE completo — os KPIs do topo');
    console.error('  vem da API e enchem a tela — com porRep {} e quentes []. Foi assim que');
    console.error('  isto ficou quebrado sem ninguem ver.');
    process.exit(1);
  }
  console.log('Snapshot do HubSpot: ' + repsNoSnapshot + ' executivo(s), lido do ' + deOndeVeioOSnapshot + '.');

  // "Quentes" pra essa aba: só quem está em Demo/Proposta ou Negociação (a definição
  // mais ampla, que inclui Ag.Pagamento, fica só no Cockpit geral)
  const quentesDemoOuNegociacao = hubspotSnapshot && hubspotSnapshot.temperatura
    ? hubspotSnapshot.temperatura.quentes.filter(l => l.stageId === STAGES.demoProposta || l.stageId === STAGES.negociacao)
    : [];

  const output = {
    geradoEm: now.toISOString(),
    janela: {
      atual: fmtRange(atualInicio, atualFim),
      anterior: fmtRange(anteriorInicio, anteriorFim)
    },
    kpisComparativo: {
      /* O LOTE VIAJA DENTRO DO KPI, e não num campo solto ao lado: quem lê "perdidos"
         precisa ler, no mesmo objeto, quantos daqueles foram marcados numa sentada.
         Separado, é questão de tempo até alguém somar um sem o outro. */
      atual: { leadsCriados: atual.leadsCriados, ganhos: atual.ganhos, perdidos: atual.perdidos,
        perdidosEmLote: atual.perdidosEmLote, perdidosSozinhos: atual.perdidosSozinhos,
        lotesDePerda: atual.lotesDePerda, perdidosDetalheCompleto: atual.perdidosDetalheCompleto,
        loteRegra: atual.loteRegra,
        reciclagem: atual.reciclagem, reunioes: atual.reunioes },
      anterior: { leadsCriados: anterior.leadsCriados, ganhos: anterior.ganhos, perdidos: anterior.perdidos,
        perdidosEmLote: anterior.perdidosEmLote, perdidosSozinhos: anterior.perdidosSozinhos,
        reciclagem: anterior.reciclagem, reunioes: anterior.reunioes }
    },
    ganhosSemanaDetalhe: atual.ganhosDeals,
    reunioesSemanaDetalhe: atual.reunioesDeals,
    // BLOCO 41 — "criados" por pessoa na semana atual (board da Semana do gestor).
    leadsCriadosSemanaDetalhe: atual.leadsCriadosDeals,
    quentesDemoOuNegociacao,
    snapshotReps: hubspotSnapshot ? hubspotSnapshot.reps : {}
  };

  fs.writeFileSync(path.join(__dirname, '..', 'data', 'weekly-raw.json'), JSON.stringify(output, null, 2));

  // ══ PUBLICA NO SNAPSHOT (02/09/26) ═══════════════════════════════════════════════
  // Mesmo motivo do fetch-hubspot: este arquivo era commitado em toda rodada, e todo
  // commit gera um deploy. Enquanto ele ficasse no git, a rodada continuaria commitando
  // e o ganho da virada seria zero — o snapshot grande sai e este segura a porta.
  // O padrao e o mesmo, de proposito: uma linha por chave, service key, e falha aqui
  // avisa sem derrubar a rodada.
  // SEM AS CHAVES: CALADO NA MAQUINA, ALTO NO CI (02/09/26). A guarda de ambiente
  // existe porque rodar isto na maquina de alguem, sem chave, e normal — nao ha o que
  // publicar e nao ha o que avisar. Mas dentro do GitHub Actions a ausencia da chave nao
  // e normal: e configuracao faltando, e foi exatamente o que aconteceu na primeira
  // rodada depois de eu adicionar esta publicacao. O script rodou, terminou com sucesso,
  // e a tabela ficou sem a linha - descobri conferindo a tabela, nao pelo log.
  // Silencio que esconde configuracao faltando e o pior tipo de silencio.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    if (process.env.GITHUB_ACTIONS) {
      console.log("ATENCAO: sem SUPABASE_URL/SUPABASE_SERVICE_KEY neste passo — o weekly-raw NAO foi publicado na tabela.");
      console.log("         O arquivo foi gravado, mas a rota le da tabela: o comparativo semanal vai servir do arquivo do deploy.");
    }
  }
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const corpo = JSON.stringify(output);
      const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/cockpit_snapshot?on_conflict=chave`, {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify([{ chave: 'weekly-raw', conteudo: output,
          bytes: Buffer.byteLength(corpo, 'utf8'), atualizado_em: new Date().toISOString(),
          origem: 'fetch-weekly-comparison' }])
      });
      console.log(r.ok
        ? `OK — snapshot 'weekly-raw' publicado no Supabase (${(Buffer.byteLength(corpo, 'utf8') / 1024).toFixed(1)} KB)`
        : `Aviso: snapshot 'weekly-raw' NAO publicado — ${r.status}`);
    } catch (e) {
      console.log(`Aviso: snapshot 'weekly-raw' NAO publicado — ${e.message}`);
    }
  }
  console.log('OK — data/weekly-raw.json gravado.');
}

main().catch(err => {
  console.error('Falha ao buscar comparação semanal:', err.message);
  process.exit(1);
});
