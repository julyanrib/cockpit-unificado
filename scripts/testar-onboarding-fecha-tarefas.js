// scripts/testar-onboarding-fecha-tarefas.js
//
// NEGÓCIO QUE SAI DA MÃO DELE LEVA AS TAREFAS JUNTO (11/09/26).
//
// Julyan: "enviado pra onboarding não precisa ir pras tarefas da aba hoje".
//
// MEDIDO NO CRM ANTES DE MEXER: 12 tarefas ABERTAS em negócios que já estavam em
// Onboarding — oito delas do Marco, e uma vencendo no próprio dia ("Follow-up - Confirmar
// pagamento"). O cockpit já NÃO criava próximo passo ao mover para Onboarding, Ganho ou
// Perdido; o que ninguém fazia era fechar o que a etapa anterior tinha deixado aberto.
//
// O efeito é o que ele descreveu: a venda acabou, o negócio saiu do funil dele, e a fila do
// dia continua cobrando um follow-up que não existe mais — todo dia, até alguém fechar na
// mão.
//
// ESTA SUÍTE EXERCITA a rota com a rede dublada e CONTA as escritas, em vez de ler o
// arquivo: o que importa aqui é o que sai para o HubSpot em cada destino de etapa, e isso
// um grep não responde.

const path = require('path');
const raiz = path.join(__dirname, '..');

let ok = 0;
const falhas = [];
function checar(nome, cond, dica) {
  if (cond) { ok += 1; console.log('  ok  ' + nome); return; }
  falhas.push(nome + (dica ? '  — ' + dica : ''));
  console.log('  FALHA  ' + nome + (dica ? '  — ' + dica : ''));
}

process.env.HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || 'token-de-teste';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://exemplo.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon-de-teste';

const USUARIOS = (function () {
  const raw = require(path.join(raiz, 'data', 'usuarios.json'));
  return Array.isArray(raw) ? raw : (raw.usuarios || []);
}());
const GESTOR = USUARIOS.filter(u => u.role === 'manager')[0];
if (!GESTOR) { console.error('não achei gestor em data/usuarios.json'); process.exit(1); }

const rota = require(path.join(raiz, 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'));

const PIPELINE = '916011864';
const ONBOARDING = '1396006163';
const GANHO = '1396006162';
const PERDIDO = '1396006164';
const RECICLAGEM = '1398311191';
/* O NEGOCIO DO FIXTURE PARTE DE PAGAMENTO: o pipeline nao deixa pular fase, e
   Negociacao -> Onboarding pula Pagamento. A regra e do produto e a suite obedece a ela
   em vez de contorna-la — teste que desliga a regra para passar mede outro sistema. */
const PAGAMENTO = '1395880473';

function resposta() {
  const r = { statusCode: 0, corpo: null };
  r.setHeader = () => r; r.status = c => { r.statusCode = c; return r; };
  r.json = b => { r.corpo = b; return r; }; r.end = () => r;
  return r;
}

/* Dublê: sessão do gestor, negócio em Negociação, duas tarefas associadas — uma aberta e
   uma já concluída. A concluída existe para provar que não a tocamos: remarcar como
   concluída o que já estava concluído põe data errada no histórico do CRM, e data errada
   em histórico é pior do que tarefa aberta. */
async function mover(novaEtapa, opcoes) {
  const caso = opcoes || {};
  const enviado = { patchDeal: null, batchUpdate: null, listouTarefas: 0 };
  global.fetch = async function (url, op) {
    const u = String(url);
    const metodo = (op && op.method) || 'GET';
    if (u.indexOf('/auth/v1/user') > -1) {
      return { ok: true, status: 200, json: async () => ({ email: GESTOR.email }) };
    }
    /* A ASSOCIACAO VEM ANTES DO NEGOCIO, e nao e ordem por gosto: a URL da associacao
       e /crm/v4/objects/deals/{id}/associations/tasks — ela contem '/objects/deals/'. Com
       o ramo do negocio primeiro, o duble devolvia o DEAL para o pedido de tarefas e a
       suite media zero fechamento num codigo que fechava certo. Foi o que aconteceu na
       primeira execucao desta suite. */
    if (u.indexOf('/associations/tasks') > -1) {
      enviado.listouTarefas += 1;
      if (caso.listarFalha) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ results: [{ toObjectId: '901' }, { toObjectId: '902' }] }) };
    }
    if (u.indexOf('/objects/deals/') > -1 && metodo === 'GET') {
      return { ok: true, status: 200, json: async () => ({
        id: '777', properties: { pipeline: PIPELINE, dealstage: PAGAMENTO,
          hubspot_owner_id: String(GESTOR.ownerId || '1'), amount: '500', valor_de_mrr: '500' } }) };
    }
    if (u.indexOf('/objects/deals/') > -1 && metodo === 'PATCH') {
      enviado.patchDeal = JSON.parse(op.body);
      return { ok: true, status: 200, json: async () => ({ id: '777' }) };
    }
    if (u.indexOf('/tasks/batch/read') > -1) {
      return { ok: true, status: 200, json: async () => ({ results: [
        { id: '901', properties: { hs_task_status: 'NOT_STARTED' } },
        { id: '902', properties: { hs_task_status: 'COMPLETED' } }
      ] }) };
    }
    if (u.indexOf('/tasks/batch/update') > -1) {
      enviado.batchUpdate = JSON.parse(op.body);
      if (caso.fecharFalha) return { ok: false, status: 502, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const res = resposta();
  await rota({ method: 'POST', headers: { authorization: 'Bearer s' },
    body: { dealId: '777', novaEtapa: novaEtapa, propriedades: caso.propriedades || {} } }, res);
  return { res, enviado };
}

async function main() {
  const fetchOriginal = global.fetch;

  /* ── 1 · ONBOARDING FECHA O QUE ESTAVA ABERTO ───────────────────────────────────── */
  let r = await mover(ONBOARDING);
  checar('mover para Onboarding grava a etapa', r.res.statusCode === 200
    && r.enviado.patchDeal && r.enviado.patchDeal.properties.dealstage === ONBOARDING,
    'HTTP ' + r.res.statusCode + ' — ' + JSON.stringify(r.res.corpo || {}).slice(0, 120));

  checar('e fecha as tarefas abertas daquele negócio',
    !!r.enviado.batchUpdate
      && r.enviado.batchUpdate.inputs.length === 1
      && r.enviado.batchUpdate.inputs[0].id === '901'
      && r.enviado.batchUpdate.inputs[0].properties.hs_task_status === 'COMPLETED',
    'enviado: ' + JSON.stringify(r.enviado.batchUpdate));

  checar('sem tocar na que já estava concluída',
    !!r.enviado.batchUpdate && r.enviado.batchUpdate.inputs.every(i => i.id !== '902'),
    'remarcar o que já estava concluído põe data errada no histórico do CRM');

  checar('e a resposta diz quantas fechou',
    r.res.corpo && r.res.corpo.tarefasFechadas === 1 && !r.res.corpo.tarefasFalhou,
    JSON.stringify(r.res.corpo || {}));

  /* ── 2 · GANHO E PERDIDO TAMBÉM ─────────────────────────────────────────────────── */
  /* GANHO NAO E DESTINO DESTA ROTA — 'Ganho e degrau, nao destino', e quem move para la
     e o ASAAS na confirmacao do pagamento. A rota recusa, e esta checagem existe para
     registrar isso: o dia em que Ganho virar destino, ela reprova e obriga a decidir se
     as tarefas fecham junto. */
  r = await mover(GANHO);
  checar('Ganho continua fora desta rota — quem move para la e o ASAAS',
    r.res.statusCode === 400 && !r.enviado.batchUpdate,
    'HTTP ' + r.res.statusCode + ' — se virar destino, decidir se fecha as tarefas junto');
  /* PERDIDO EXIGE MOTIVO — a rota recusa sem `motivo_do_perdido`, e a suite manda o
     motivo em vez de desligar a exigencia. */
  r = await mover(PERDIDO, { propriedades: { motivo_do_perdido: 'Preço' } });
  checar('e Perdido também — acabou', !!r.enviado.batchUpdate,
    'tarefa pendente de negócio perdido é a definição de lixo na fila · HTTP ' + r.res.statusCode + ' ' + JSON.stringify(r.res.corpo || {}).slice(0, 90));

  /* ── 3 · RECICLAGEM NÃO ─────────────────────────────────────────────────────────── */
  /* Reciclar é combinar um toque novo, e a tarefa dele É esse próximo passo. Fechar aqui
     apagaria justamente o compromisso que a etapa existe para criar. */
  r = await mover(RECICLAGEM);
  checar('Reciclagem NÃO fecha nada — reciclar é combinar o toque novo',
    !r.enviado.batchUpdate && r.enviado.listouTarefas === 0,
    'fechar aqui apagaria o próximo passo que a etapa existe para criar');

  /* ── 4 · FALHAR AO FECHAR NÃO DESFAZ A ETAPA, E NÃO SOME ────────────────────────── */
  r = await mover(ONBOARDING, { fecharFalha: true });
  checar('se o fechamento falha, a etapa continua gravada',
    r.res.statusCode === 200 && r.res.corpo.ok === true,
    'a venda não pode ser desfeita por causa de uma tarefa');
  checar('e a falha volta na resposta em vez de sumir',
    !!(r.res.corpo && r.res.corpo.tarefasFalhou),
    JSON.stringify(r.res.corpo || {}));

  global.fetch = fetchOriginal;

  console.log('');
  if (falhas.length) {
    console.error(falhas.length + ' falha(s) — negócio fora do funil voltou a deixar tarefa aberta.');
    falhas.forEach(f => console.error('  · ' + f));
    process.exit(1);
  }
  console.log('onboarding x tarefas: ' + ok + ' checagens — quem sai do funil leva as tarefas junto.');
}

main().catch(e => { console.error('quebrou: ' + (e && e.stack || e)); process.exit(1); });
