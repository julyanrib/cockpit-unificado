// scripts/fetch-weekly-comparison.js
// Roda toda SEXTA-FEIRA via GitHub Actions. Compara a semana que passou com a anterior
// e grava data/weekly-raw.json — que o generate-weekly-summary.js usa pra pedir o resumo à Claude.

const fs = require('fs');
const path = require('path');

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
     fechada, então não tem closedate). Ver o comentário de contagemComFiltro. */
  const perdidos = await contagemComFiltro(STAGES.perdido, startMs, endMs, 'closedate');
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
  const atualInicio = new Date(inicioSemanaBrasiliaMs());
  // atualFim capado na SEXTA 23:59:59 BRT: rodando manual num sábado, a janela ia até
  // "agora" e a tela mostrava "03/08–08/08" — resultado semanal é seg–sex, sempre.
  const atualFim = new Date(Math.min(now.getTime(), atualInicio.getTime() + 5 * DAY - 1));
  const anteriorInicio = new Date(atualInicio.getTime() - 7 * DAY);
  const anteriorFim = new Date(anteriorInicio.getTime() + 5 * DAY - 1); // sexta 23:59:59.999 BRT

  console.log('Buscando semana atual...');
  const atual = await windowCounts(atualInicio.getTime(), atualFim.getTime());
  console.log('Buscando semana anterior...');
  const anterior = await windowCounts(anteriorInicio.getTime(), anteriorFim.getTime());

  // Reaproveita o snapshot de hoje (já buscado pelo job diário) — dá contexto de gargalo
  // por executivo e a lista de "quentes" já calculada (sem precisar buscar de novo)
  const hubspotPath = path.join(__dirname, '..', 'data', 'hubspot.json');
  const hubspotSnapshot = fs.existsSync(hubspotPath) ? JSON.parse(fs.readFileSync(hubspotPath, 'utf8')) : null;

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
      atual: { leadsCriados: atual.leadsCriados, ganhos: atual.ganhos, perdidos: atual.perdidos, reciclagem: atual.reciclagem, reunioes: atual.reunioes },
      anterior: { leadsCriados: anterior.leadsCriados, ganhos: anterior.ganhos, perdidos: anterior.perdidos, reciclagem: anterior.reciclagem, reunioes: anterior.reunioes }
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
