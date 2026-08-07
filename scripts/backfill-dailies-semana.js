// scripts/backfill-dailies-semana.js
// Script de UMA VEZ SÓ — não faz parte do refresh diário normal.
// Recalcula, direto do histórico do HubSpot, os 4 números "realizado" (visitas, avanços,
// propostas, fechamentos) dos últimos 7 dias de cada executivo, e grava na tabela `dailies`
// do Supabase. Existe porque, antes do dia 05/08, esse snapshot só era salvo se alguém
// abrisse a aba Daily no fim do dia — vários dias ficaram sem registro.
// Só sobrescreve as 4 colunas "realizado_*" — não toca em prometido/nota/compromisso.
// Rodar 1x. Depois disso o fetch-hubspot.js normal já grava sozinho todo dia.

const TOKEN = process.env.HUBSPOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERRO: faltam variáveis (HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY). Configure em GitHub → Secrets.');
  process.exit(1);
}

const PIPELINE_ID = '916011864';
const STAGES = {
  prospeccao: '1395880469', visita: '1396005401', diagnostico: '1395880470',
  demoProposta: '1395880471', negociacao: '1395880472', agPagamento: '1395880473',
  ganho1: '1396006162', ganho2: '1396006163'
};
const OPEN_STAGES = [STAGES.prospeccao, STAGES.visita, STAGES.diagnostico, STAGES.demoProposta, STAGES.negociacao, STAGES.agPagamento];
const ENTERED_STAGE_PROPS = OPEN_STAGES.map(s => `hs_v2_date_entered_${s}`);

const REPS = [
  { ownerId: '86100506', name: 'Bruno Martins' },
  { ownerId: '87569072', name: 'Sandro Brito' },
  { ownerId: '91477292', name: 'Kelly Travieso Di Domenico' },
  { ownerId: '89842507', name: 'Wericles Andrade (Whell)' },
  { ownerId: '87069181', name: 'Amanda Pardim' },
  { ownerId: '86100505', name: 'Marco Filho' },
  { ownerId: '94079973', name: 'Michel Carvalho' }
];

// Quantos dias pra trás recuperar (7 = semana corrida, incluindo hoje — hoje o fetch normal
// já sobrescreve de qualquer jeito no próximo refresh, então recalcular hoje aqui não faz mal).
const DIAS_PARA_TRAS = 7;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function hsSearch(objectType, body, attempt = 1) {
  await sleep(350);
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 429 && attempt <= 5) {
    await sleep(1000 * attempt);
    return hsSearch(objectType, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`HubSpot API error ${res.status} em ${objectType}: ${await res.text()}`);
  return res.json();
}

async function hsSearchAll(objectType, body) {
  let todos = [], after, loop = 0;
  while (loop++ < 20) {
    const data = await hsSearch(objectType, { ...body, limit: 100, after });
    todos = todos.concat(data.results || []);
    after = data.paging && data.paging.next ? data.paging.next.after : null;
    if (!after) break;
  }
  return todos;
}

// "Hoje" em Brasília, como string YYYY-MM-DD, deslocando N dias.
function isoBrasilia(offsetDias) {
  const agoraBRT = new Date(Date.now() - 3 * 60 * 60 * 1000 + offsetDias * 86400000);
  return agoraBRT.toISOString().slice(0, 10);
}
// Converte um timestamp UTC do HubSpot pra data (YYYY-MM-DD) em Brasília.
function paraDiaBrasilia(isoUTC) {
  if (!isoUTC) return null;
  return new Date(new Date(isoUTC).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function gravarSnapshotDaily(ownerId, dataISO, campos) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dailies?on_conflict=owner_id,data`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
    },
    // criado_por é NOT NULL na tabela — este script roda com a service key (sem sessão de
    // usuário), então nunca tinha um e-mail pra preencher aqui. Erro só apareceu agora porque
    // essa era a primeira vez que o script rodava contra uma linha nova (upsert = INSERT quando
    // o dia/owner ainda não existe). 'sistema-backfill' identifica que a linha (ou a correção)
    // veio deste script, não de alguém digitando na tela.
    body: JSON.stringify([{ owner_id: String(ownerId), data: dataISO, criado_por: 'sistema-backfill', ...campos }])
  });
  if (!res.ok) throw new Error(`Supabase recusou upsert (${ownerId}/${dataISO}): ${res.status} ${await res.text()}`);
}

async function main() {
  const dias = [];
  for (let i = DIAS_PARA_TRAS - 1; i >= 0; i--) dias.push(isoBrasilia(-i));
  console.log(`Recalculando de ${dias[0]} até ${dias[dias.length - 1]} para ${REPS.length} executivos...\n`);

  for (const rep of REPS) {
    console.log(`--- ${rep.name} ---`);

    // Uma busca só de deals (todas as etapas relevantes) com as datas de entrada em cada
    // etapa embutidas — dá pra calcular os 7 dias inteiros sem repetir consulta por dia.
    const deals = await hsSearchAll('deals', {
      filterGroups: [{ filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: rep.ownerId }
      ] }],
      properties: ['dealstage', 'closedate', ...ENTERED_STAGE_PROPS]
    });

    // Uma busca só de tasks dos últimos N dias (visitas/revisitas).
    const agoraMs = Date.now();
    const tasks = await hsSearchAll('tasks', {
      filterGroups: [{ filters: [
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: rep.ownerId },
        { propertyName: 'hs_createdate', operator: 'GTE', value: String(agoraMs - DIAS_PARA_TRAS * 86400000) }
      ] }],
      properties: ['hs_task_subject', 'hs_task_body', 'hs_createdate']
    });
    const tasksVisita = tasks.filter(t => {
      const s = String(t.properties.hs_task_subject || '');
      const b = String(t.properties.hs_task_body || '');
      return /^\s*(re)?visita\b/i.test(s) || /app\s*outbound/i.test(b);
    });

    for (const dia of dias) {
      const visitasDia = tasksVisita.filter(t => paraDiaBrasilia(t.properties.hs_createdate) === dia).length;

      const avancosDia = deals.filter(d => {
        return [STAGES.diagnostico, STAGES.negociacao, STAGES.agPagamento].some(
          stageId => paraDiaBrasilia(d.properties[`hs_v2_date_entered_${stageId}`]) === dia
        );
      }).length;

      const propostasDia = deals.filter(
        d => paraDiaBrasilia(d.properties[`hs_v2_date_entered_${STAGES.demoProposta}`]) === dia
      ).length;

      const fechamentosDia = deals.filter(d =>
        [STAGES.ganho1, STAGES.ganho2].includes(d.properties.dealstage) &&
        paraDiaBrasilia(d.properties.closedate) === dia
      ).length;

      await gravarSnapshotDaily(rep.ownerId, dia, {
        realizado_visitas: visitasDia,
        realizado_avancos: avancosDia,
        realizado_propostas: propostasDia,
        realizado_fechamentos: fechamentosDia
      });

      console.log(`  ${dia}: visitas=${visitasDia} avanços=${avancosDia} propostas=${propostasDia} fechamentos=${fechamentosDia}`);
    }
  }

  console.log('\nOK — histórico da semana recalculado e gravado no Supabase.');
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
