// scripts/fetch-hubspot.js
// Roda 1x/dia via GitHub Actions. Busca dados FRESCOS do HubSpot e grava data/hubspot.json.
// Esse arquivo é a ÚNICA parte do cockpit que muda sozinha todo dia.
// Requer variável de ambiente HUBSPOT_TOKEN (Private App token, escopo crm.objects.deals.read).

const fs = require('fs');
const path = require('path');

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
  reciclagem: '1398311191'
};

const OPEN_STAGES = [STAGES.prospeccao, STAGES.visita, STAGES.diagnostico, STAGES.demoProposta, STAGES.negociacao, STAGES.agPagamento];

// Meta mensal de negócios fechados do time inteiro — combinada com o Julyan em 27/07/2026.
// Configurável aqui até existir um lugar melhor pra isso (ex.: data/config.json).
const META_MENSAL_FECHADOS = 80;

const STAGE_LABELS = {
  [STAGES.prospeccao]: 'Prospecção',
  [STAGES.visita]: 'Visita',
  [STAGES.diagnostico]: 'Conversa com Decisor',
  [STAGES.demoProposta]: 'Demo/Proposta',
  [STAGES.negociacao]: 'Negociação',
  [STAGES.agPagamento]: 'Ag. Pagamento'
};

// SLA (dias máximos esperados) por etapa — confirmados com Julyan.
const SLA_DAYS = {
  [STAGES.prospeccao]: 5,
  [STAGES.visita]: 5,
  [STAGES.diagnostico]: 4,
  [STAGES.demoProposta]: 3,
  [STAGES.negociacao]: 7,
  [STAGES.agPagamento]: 2
};

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

// Descrições curtas de cada etapa, usadas nos tooltips do painel
const STAGE_DESCRIPTIONS = {
  [STAGES.prospeccao]: 'Primeiro contato feito (PAP). Deveria avançar ou virar decisão em até 5 dias.',
  [STAGES.visita]: 'Visita presencial já ocorreu. Esperado confirmar próximo passo em até 5 dias.',
  [STAGES.diagnostico]: 'Conversa com o decisor em andamento. SLA de 4 dias pra avançar pra demo.',
  [STAGES.demoProposta]: 'Demonstração feita, proposta em análise. SLA de 3 dias pra negociação.',
  [STAGES.negociacao]: 'Negociação de condições comerciais. SLA de 7 dias pra fechar.',
  [STAGES.agPagamento]: 'Contrato fechado, aguardando pagamento. SLA de 2 dias — gargalo crítico se estourar.'
};

// Reps ativos (nome bate com narrativas.json / expogo.json)
const REPS = [
  { ownerId: '86100506', name: 'Bruno Martins' },
  { ownerId: '87569072', name: 'Sandro Brito' },
  { ownerId: '91477292', name: 'Kelly Travieso Di Domenico' },
  { ownerId: '89842507', name: 'Wericles Andrade (Whell)' },
  { ownerId: '87069181', name: 'Amanda Pardim' },
  { ownerId: '86100505', name: 'Marco Filho' },
  { ownerId: '94079973', name: 'Michel Carvalho' }
];

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
async function gravarSnapshotDaily(ownerId, dataISO, campos) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/dailies?on_conflict=owner_id,data`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ owner_id: String(ownerId), data: dataISO, ...campos }])
    });
    if (!res.ok) console.log(`Aviso: snapshot diário (${ownerId}/${dataISO}) não salvou — ${res.status} ${await res.text()}`);
  } catch (e) {
    console.log(`Aviso: snapshot diário (${ownerId}/${dataISO}) falhou — ${e.message}`);
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
  await gravarSnapshotDaily(ownerId, dataISO, campos);
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

// Visita/revisita no app agora vira TAREFA no HubSpot — e a Daily conta a TAREFA criada
// hoje (a ação de registrar a visita), não mais a entrada do negócio na etapa "Visita".
// Motivo: revisitar um cliente pra falar com o decisor é visita de verdade e não move
// etapa nenhuma — no modelo antigo ela simplesmente não contava.
// Conta só tarefa que é visita mesmo: título começando com Visita/Revisita, ou corpo
// assinado pelo app ("App Outbound"). Tarefa manual de cadência (D1 - Ligação etc.) fica fora.
// diaISO opcional (YYYY-MM-DD, Brasília). Sem ele, conta o dia corrente — mesmo
// comportamento de antes. Com ele, conta a JANELA FECHADA daquele dia (00h–24h BRT),
// que é o que permite gravar o realizado de ontem já consolidado.
async function visitasTarefasHojeByOwner(ownerId, diaISO) {
  const base = diaISO ? new Date(diaISO + 'T12:00:00Z') : new Date(Date.now() - 3 * 60 * 60 * 1000);
  const inicioDoDiaBRTms = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 3, 0, 0);
  const fimDoDiaBRTms = inicioDoDiaBRTms + 86400000;
  const filtrosData = diaISO
    ? [{ propertyName: 'hs_createdate', operator: 'BETWEEN', value: String(inicioDoDiaBRTms), highValue: String(fimDoDiaBRTms) }]
    : [{ propertyName: 'hs_createdate', operator: 'GTE', value: String(inicioDoDiaBRTms) }];
  const data = await hsSearchTipo('tasks', {
    filterGroups: [{ filters: [
      { propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(ownerId) },
      ...filtrosData
    ] }],
    properties: ['hs_task_subject', 'hs_task_body', 'hs_task_status'],
    limit: 100
  });
  // BLOCO 17 (12/08/26) — CORRECAO DE DADO. Antes contava toda tarefa de visita CRIADA
  // no dia, sem olhar o status. Só que a rota do cockpit cria tarefa NOT_STARTED no
  // momento em que o executivo monta o dia: a visita que ele ainda VAI fazer entrava
  // como visita FEITA. Flagrado na Kelly em 12/08 — o cockpit dizia "2 realizado" às
  // 09h e as duas tarefas eram compromissos das 10:00 e 10:45, ainda não realizados.
  // Isso é exatamente o dado errado que não pode chegar na Daily: cobrar entrega de
  // quem ainda nem saiu, ou dar por feito o que não foi.
  // Visita registrada pelo Expogo nasce COMPLETED; a marcada pela rota nasce
  // NOT_STARTED e vira COMPLETED quando o executivo registra. Então realizado = COMPLETED.
  return (data.results || []).filter(t => {
    const titulo = String(t.properties.hs_task_subject || '');
    const corpo = String(t.properties.hs_task_body || '');
    const ehVisita = /^\s*(re)?visita\b/i.test(titulo) || /app\s*outbound/i.test(corpo);
    return ehVisita && String(t.properties.hs_task_status || '') === 'COMPLETED';
  }).length;
}

// Busca TODAS as páginas de uma pesquisa, sem cap de 100/200 — várias contagens
// do cockpit (leads criados, perdidos, fechados no mês, negócios por executivo)
// usavam só a 1ª página e ficavam erradas sempre que passavam do limite. Uma
// semana de 204 leads criados ou 100 perdidos (já aconteceu, é real) já bastava
// pra dar número errado. Isso resolve pra sempre, independente do volume.
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

async function stageTotal(stageId, extraFilters = []) {
  const data = await hsSearch({
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: stageId },
        ...extraFilters
      ]
    }],
    limit: 1
  });
  return data.total || 0;
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
    properties: ['dealname', 'hubspot_owner_id']
  });
  return results.filter(d => !isExcludedDeal(d));
}

// Negócios de teste/dummy (ex: "Teste", "TESTE_SONY_DIAG", "Coliseu teste") não devem contar
// em NENHUMA métrica. Detectado em auditoria manual — filtra pelo nome, case-insensitive.
function isTestDeal(dealname) {
  if (!dealname) return false;
  return /teste/i.test(dealname);
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
  if (EXCLUDED_DEAL_IDS.includes(String(deal.id))) return true;
  return isTestDeal(deal.properties && deal.properties.dealname);
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
      'cep', 'bairro', 'cidade', 'logradouro', 'numero', ...ENTERED_STAGE_PROPS]
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
      // BLOCO 20 (12/08/26) — Julyan: "corrija de uma vez so esse erro de localizacao dos
      // quentes". Estes cinco campos EXISTEM no HubSpot (conferido via get_properties:
      // cep, bairro, cidade, logradouro, numero) e o cron nunca os pediu. Sem eles o
      // cockpit so tinha latitude/longitude, que o Expogo grava no check-in -- ou seja,
      // negocio nunca visitado nao tinha como aparecer no mapa, nem com endereco
      // preenchido no CRM. Agora vem tudo, e o front geocodifica o que faltar.
      // Medido hoje: a maioria desses campos ainda esta VAZIA no CRM (dos quentes sem
      // coordenada, so o UAU UNIDADE PENHA tinha CEP). Pedir custa zero e o pino passa a
      // aparecer sozinho conforme o time preenche.
      'cep', 'bairro', 'cidade', 'logradouro', 'numero', ...ENTERED_STAGE_PROPS]
  });
  return todos.filter(d => !isExcludedDeal(d));
}

// Busca as 2 notas/observações mais recentes de um negócio específico.
// Requer o escopo crm.objects.notes.read no Private App do HubSpot (além do
// crm.objects.deals.read que já usávamos) — se não tiver, retorna lista vazia sem quebrar nada.
async function buscarNotasDoLead(dealId, limite = 2) {
  try {
    await sleep(350);
    const assocRes = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/notes`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    if (!assocRes.ok) return [];
    const assocData = await assocRes.json();
    const noteIds = (assocData.results || []).map(r => r.id).slice(0, limite);
    if (noteIds.length === 0) return [];

    const notas = [];
    for (const noteId of noteIds) {
      await sleep(350);
      const noteRes = await fetch(`https://api.hubapi.com/crm/v3/objects/notes/${noteId}?properties=hs_note_body,hs_timestamp`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` }
      });
      if (!noteRes.ok) continue;
      const noteData = await noteRes.json();
      notas.push({
        texto: (noteData.properties.hs_note_body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
        data: noteData.properties.hs_timestamp
      });
    }
    return notas.sort((a, b) => new Date(b.data) - new Date(a.data));
  } catch (e) {
    return [];
  }
}

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
// Meta mensal INDIVIDUAL de cada executivo — 10 fechamentos/mês, igual ao design
// (8 executivos ativos × 10 = 80, bate com a meta do time inteiro combinada com o Julyan).
const META_MENSAL_POR_EXECUTIVO = 10;

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
    properties: ['dealname', 'hubspot_owner_id', 'valor_de_mrr', 'closedate']
  });
  return results.filter(d => !isExcludedDeal(d)).map(d => ({
    id: d.id,
    nome: d.properties.dealname,
    ownerId: d.properties.hubspot_owner_id ? String(d.properties.hubspot_owner_id) : null,
    mrr: Math.round(parseFloat(d.properties.valor_de_mrr) || 0),
    closedate: d.properties.closedate || null
  }));
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

  console.log('Buscando dados no HubSpot...');

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
    funilLeads[stageId] = deals.map(d => {
      const dias = daysInCurrentStage(d.properties);
      // Coordenada real do check-in via Expogo (Julyan, 10/08: "eles marcam no Expogo
      // e tem coordenadas que enviam para o HubSpot" — direto na propriedade do negócio,
      // não precisa mais casar por nome com a base de prospecção pra achar isso).
      const lat = d.properties.latitude != null ? Number(d.properties.latitude) : null;
      const lng = d.properties.longitude != null ? Number(d.properties.longitude) : null;
      return {
        name: d.properties.dealname,
        id: d.id,
        dias,
        slaBreach: dias > (SLA_DAYS[stageId] || 999),
        proximaAtividade: d.properties.notes_next_activity_date || null,
        ultimaInteracao: d.properties.notes_last_updated || null,
        valor: Math.round(parseFloat(d.properties.amount) || 0),
        vendedor: ownerNameById[d.properties.hubspot_owner_id] || '—',
        ownerId: d.properties.hubspot_owner_id || null,
        lat: (lat != null && !isNaN(lat)) ? lat : null,
        // Endereço textual segue junto: é o que permite ao front geocodificar quem não
        // tem coordenada, em vez de sumir do mapa.
        cep: d.properties.cep || null,
        bairro: d.properties.bairro || null,
        cidade: d.properties.cidade || null,
        logradouro: d.properties.logradouro || null,
        numero: d.properties.numero || null,
        lng: (lng != null && !isNaN(lng)) ? lng : null
      };
    }).sort((a, b) => b.dias - a.dias);
  }

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
    // Ontem em Brasília. Com as DUAS rodadas diárias (23:59 e 08:59, 11/08), "ontem"
    // quase sempre já está fechado nos dois horários — às 23:59 o dia de hoje está
    // terminando, às 08:59 o dia de ontem virou definitivamente passado à meia-noite.
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
    // Com as DUAS (agora TRÊS, ver Automação 1) rodadas diárias: a de 23:59 já fecha
    // "ontem" quase completo (o dia está acabando); as seguintes refazem o mesmo
    // fechamento como segurança, caso alguma rodada anterior tenha falhado.
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

    const withDays = deals.map(d => {
      const dias = daysInCurrentStage(d.properties);
      const stageId = d.properties.dealstage;
      const slaBreach = dias > (SLA_DAYS[stageId] || 999);
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

      // Temperatura: SLA estourado = frio/travado (precisa limpar o funil).
      // Etapa avançada (Demo+) e dentro do prazo (não estourou) = quente — é isso que fecha.
      // Antes exigia ter usado até metade do prazo (slaRatio <= 0.5); isso escondia negócio
      // avançado e saudável só porque já tinha passado da metade do SLA sem estourar — um
      // negócio em Negociação com 5 de 7 dias é tão prioritário quanto um com 2 de 7, os
      // dois ainda estão dentro do prazo. Ampliado pra cobrir toda a faixa não estourada.
      let temperatura = 'morno';
      if (slaBreach) temperatura = 'frio';
      else if (rank >= 4) temperatura = 'quente';

      // Mesma coordenada real do check-in via Expogo — ver comentário em funilLeads acima.
      const lat = d.properties.latitude != null ? Number(d.properties.latitude) : null;
      const lng = d.properties.longitude != null ? Number(d.properties.longitude) : null;

      return {
        name: d.properties.dealname,
        id: d.id,
        stage: STAGE_LABELS[stageId] || stageId,
        stageId,
        dias,
        slaBreach,
        slaRatio: Math.round(slaRatio * 100),
        rank,
        temperatura,
        proximaReuniao,
        proximaAtividade,
        ultimaInteracao: d.properties.notes_last_updated || null,
        valor: Math.round(parseFloat(d.properties.amount) || 0),
        lat: (lat != null && !isNaN(lat)) ? lat : null,
        // Endereço textual segue junto: é o que permite ao front geocodificar quem não
        // tem coordenada, em vez de sumir do mapa.
        cep: d.properties.cep || null,
        bairro: d.properties.bairro || null,
        cidade: d.properties.cidade || null,
        logradouro: d.properties.logradouro || null,
        numero: d.properties.numero || null,
        lng: (lng != null && !isNaN(lng)) ? lng : null
      };
    }).sort((a, b) => b.dias - a.dias);

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
      plotaveis: withDays
        .filter(l => l.lat != null && l.lng != null)
        .map(l => ({
          id: l.id, name: l.name, stage: l.stage, stageId: l.stageId,
          dias: l.dias, slaBreach: !!l.slaBreach, temperatura: l.temperatura,
          lat: l.lat, lng: l.lng
        })),
      leadsTravados,
      ganhosSemana: ganhosSemanaDeals.length,
      ganhosSemanaNomes: ganhosSemanaDeals.map(d => d.name),
      // BLOCO 15: os nomes ao lado das contagens do dia. Teto de 12 pelo mesmo motivo
      // de plotaveis: este objeto vai inteiro pro navegador de todo gestor.
      avancosHojeNomes: avancosHojeNomes.slice(0, 12),
      propostasHojeNomes: propostasHojeNomes.slice(0, 12),
      fechadosNoMes: fechadosNoMesRep,
      metaMensal: META_MENSAL_POR_EXECUTIVO,
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
  const leadsQuentes = todosQuentes.sort((a, b) => (b.rank - a.rank) || (a.slaRatio - b.slaRatio)).slice(0, 12);
  const leadsFrios = todosFrios.sort((a, b) => b.dias - a.dias).slice(0, 12);

  // Busca as notas/observações mais recentes dos leads que realmente aparecem em tela:
  // os ~24 em destaque do time (quentes/frios) MAIS os 5 travados de cada executivo — que
  // são os que alimentam o "roteiro de hoje" no painel individual dele. Sem incluir os
  // travados por executivo, o roteiro ficava sem contexto justamente pros leads dele.
  // Dedupe por id: um mesmo lead costuma estar em mais de uma lista, e cada busca de nota
  // custa 3 chamadas com pausa de rate limit — buscar 2x o mesmo lead era desperdício.
  // Requer escopo crm.objects.notes.read no Private App do HubSpot.
  const travadosPorRep = Object.values(repsData).flatMap(r => (r.travados || []).slice(0, 5));
  const leadsQuePrecisamDeNota = [...leadsQuentes, ...leadsFrios, ...travadosPorRep];
  const idsUnicos = [...new Set(leadsQuePrecisamDeNota.map(l => l.id))];

  console.log(`Buscando notas de campo de ${idsUnicos.length} leads em destaque...`);
  const notasPorId = {};
  for (const id of idsUnicos) {
    notasPorId[id] = await buscarNotasDoLead(id);
  }
  // Aplica em TODOS os objetos que referenciam aquele lead (o mesmo negócio aparece em
  // repsData[x].travados e em leadsFrios como objetos separados).
  leadsQuePrecisamDeNota.forEach(lead => { lead.notas = notasPorId[lead.id] || []; });

  const output = {
    updatedAt: new Date().toISOString(),
    kpis: {
      leadsCriados,
      ganhos: ganhoSemana,
      perdidos: perdidoSemana,
      emAberto: emAbertoTime,
      emReciclagem: reciclagem,
      leadsTravados: leadsTravadosTime,
      fechadosNoMes,
      metaMensalFechados: META_MENSAL_FECHADOS,
      taxaAvanco: emAbertoTime > 0 ? Math.round((avancaramSemanaTime / emAbertoTime) * 100) : 0
    },
    kpiDetalhe: {
      leadsCriados: leadsCriadosDeals.map(d => ({ nome: d.properties.dealname, ownerId: d.properties.hubspot_owner_id })),
      perdidos: perdidoSemanaDeals.map(d => ({ nome: d.properties.dealname, ownerId: d.properties.hubspot_owner_id }))
    },
    funil: {
      labels: ['Backlog', 'Prospecção', 'Visita', 'Conversa com Decisor', 'Demo/Proposta', 'Negociação', 'Ag. Pagamento', 'Fechado/Onboarding', 'Perdido', 'Reciclagem'],
      valores: [backlog, prospeccao, visita, diagnostico, demoProposta, negociacao, agPagamento, ganho, perdido, reciclagem],
      cores: ['#6B7280', '#E8A33D', '#4A7FC7', '#7C6FE0', '#2FA88A', '#D9668F', '#E51A31', '#1FA35C', '#8C1220', '#8B92A3']
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
}

main().catch(err => {
  console.error('Falha ao buscar dados do HubSpot:', err.message);
  process.exit(1);
});
