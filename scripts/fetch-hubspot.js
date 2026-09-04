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

// Meta mensal de negócios fechados do time inteiro — combinada com o Julyan em 27/07/2026.
// Configurável aqui até existir um lugar melhor pra isso (ex.: data/config.json).
const META_MENSAL_FECHADOS = 80;

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
  { ownerId: '89842507', name: 'Wericles Andrade' },
  { ownerId: '87069181', name: 'Amanda Pardim' },
  { ownerId: '86100505', name: 'Marco Filho' }
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
async function publicarNoSnapshot(chave, conteudo, origem) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { ok: true, skipped: true };
  const corpo = JSON.stringify(conteudo);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cockpit_snapshot?on_conflict=chave`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{
        chave: String(chave),
        conteudo: conteudo,
        bytes: Buffer.byteLength(corpo, 'utf8'),
        atualizado_em: new Date().toISOString(),
        origem: origem || 'fetch-hubspot'
      }])
    });
    if (!res.ok) {
      const txt = await res.text();
      console.log(`Aviso: snapshot '${chave}' NAO publicado no Supabase — ${res.status} ${txt.slice(0, 200)}`);
      return { ok: false, status: res.status };
    }
    console.log(`OK — snapshot '${chave}' publicado no Supabase (${(Buffer.byteLength(corpo, 'utf8') / 1024).toFixed(1)} KB)`);
    return { ok: true };
  } catch (e) {
    console.log(`Aviso: snapshot '${chave}' NAO publicado no Supabase — ${e.message}`);
    return { ok: false, erro: e.message };
  }
}

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
    properties: ['dealname', 'hubspot_owner_id']
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
  return {
    total: validos.length, dias: 90, porMotivo, porOwner, exemplos,
    totalMrrConhecido, comMrr, semMrr, mrrPorMotivo, mrrPorOwner
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
      owner: String(p.hubspot_owner_id || '') || 'sem-dono',
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
        return {
          rank: e.rank, id: e.id, nome: e.nome,
          chegaram: chegaram.length,
          avancaram: avancaram.length,
          ganharam: ganharam.length,
          perderamAqui: perderamAqui.length,
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
      const lat = d.properties.latitude != null ? Number(d.properties.latitude) : null;
      const lng = d.properties.longitude != null ? Number(d.properties.longitude) : null;
      return {
        name: d.properties.dealname,
        dealname: d.properties.dealname,
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
        celular: d.properties.celular || null,
        ...Object.fromEntries(FIELD_SALES_STAGE_PROPS.map(prop => [prop, d.properties[prop] || null])),
        tarefas: tarefasPorDeal[d.id] || [],
        lng: (lng != null && !isNaN(lng)) ? lng : null
      };
    }).sort((a, b) => b.dias - a.dias);
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
      const lat = d.properties.latitude != null ? Number(d.properties.latitude) : null;
      const lng = d.properties.longitude != null ? Number(d.properties.longitude) : null;
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
        lat: (lat != null && !isNaN(lat)) ? lat : null,
        lng: (lng != null && !isNaN(lng)) ? lng : null,
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

  // ---- Leads em Reciclagem parados há 60+ dias, pra resgate (Julyan, 17/08/26:
  // "resgatando alguns leads que estão lá há 60 dias") ----
  // Reciclagem fica FORA de OPEN_STAGES de propósito (é bucket lateral, não etapa
  // sequencial do funil aberto — ver comentário acima de OPEN_STAGES) — por isso
  // nunca tinha sido buscada. Mesmo padrão de fetch de qualquer outra etapa, só que
  // filtrando por tempo parado, já que "resgatar" só faz sentido pra quem esfriou
  // de verdade, não pra quem acabou de cair ali.
  const reciclagemDealsRaw = await stageDealsTeamWide(STAGES.reciclagem);
  const leadsReciclagem60 = reciclagemDealsRaw
    .map(d => ({
      name: d.properties.dealname,
      dealname: d.properties.dealname,
      id: d.id,
      dias: daysInCurrentStage(d.properties),
      vendedor: ownerNameById[d.properties.hubspot_owner_id] || '—',
      ownerId: d.properties.hubspot_owner_id || null,
      bairro: d.properties.bairro || null,
      cidade: d.properties.cidade || null,
      valor: Math.round(parseFloat(d.properties.amount) || 0)
    }))
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
        dealname: d.properties.dealname,
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
        celular: d.properties.celular || null,
        ...Object.fromEntries(FIELD_SALES_STAGE_PROPS.map(prop => [prop, d.properties[prop] || null])),
        tarefas: tarefasPorDealDoRep[d.id] || [],
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
  const travadosPorRep = Object.values(repsData).flatMap(r => (r.travados || []).slice(0, 5));
  /* o orçamento de notas continua nos 12 quentes mais avançados: são os que aparecem no
     cartão e no roteiro. Sem este corte, tirar o slice de cima triplicaria as chamadas. */
  const leadsQuePrecisamDeNota = [...leadsQuentes.slice(0, 12), ...leadsFrios, ...travadosPorRep];
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
      taxaAvanco: emAbertoTime > 0 ? Math.round((avancaramSemanaTime / emAbertoTime) * 100) : 0
    },
    kpiDetalhe: {
      leadsCriados: leadsCriadosDeals.map(d => ({ nome: d.properties.dealname, ownerId: d.properties.hubspot_owner_id })),
      perdidos: perdidoSemanaDeals.map(d => ({ nome: d.properties.dealname, ownerId: d.properties.hubspot_owner_id }))
    },
    motivosPerda,
    historicoEtapas,
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

  let publicados = 0;
  for (const [chave, conteudo] of paraPublicar) {
    const r = await publicarNoSnapshot(chave, conteudo, origemDaRodada);
    if (r && r.ok) publicados += 1;
  }
  console.log(`OK — ${publicados} de ${paraPublicar.length} snapshot(s) publicados no Supabase.`);
}

main().catch(err => {
  console.error('Falha ao buscar dados do HubSpot:', err.message);
  process.exit(1);
});
