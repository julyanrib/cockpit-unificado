// scripts/testar-webhook-reserva.js
//
// O WEBHOOK COMO RESERVA DO ROBÔ (27/09/26). api/hubspot-webhook.js só pode disparar o
// daily-refresh quando a última rodada — de qualquer origem — começou há mais de
// RESERVA_MINUTOS. Este teste chama o handler DE VERDADE (assinatura v3 calculada,
// GitHub e Supabase simulados no fetch) e mede se o disparo aconteceu, não se o código
// "parece" certo.
//
//   node scripts/testar-webhook-reserva.js

const crypto = require('crypto');
const path = require('path');

process.env.HUBSPOT_APP_SECRET = 'segredo-de-teste';
process.env.GITHUB_PAT = 'pat-de-teste';
process.env.SUPABASE_URL = 'https://supa.teste';
process.env.SUPABASE_SERVICE_KEY = 'service-de-teste';

const handler = require(path.join(__dirname, '..', 'api', 'hubspot-webhook.js'));

// 10:30 de Brasília (13:30 UTC): dentro da janela 07–22.
const AGORA = Date.parse('2026-09-28T13:30:00Z');

function pedido() {
  const corpo = JSON.stringify([{ objectId: 1, propertyName: 'dealstage' }]);
  const ts = String(AGORA);
  const url = 'https://fieldsalestakeat.vercel.app/api/hubspot-webhook';
  const sig = crypto.createHmac('sha256', process.env.HUBSPOT_APP_SECRET).update('POST' + url + corpo + ts).digest('base64');
  const listeners = {};
  const req = {
    method: 'POST', url: '/api/hubspot-webhook',
    headers: { 'x-hubspot-signature-v3': sig, 'x-hubspot-request-timestamp': ts, 'x-forwarded-proto': 'https', host: 'fieldsalestakeat.vercel.app' },
    on(ev, fn) { listeners[ev] = fn; if (ev === 'end') setImmediate(() => { listeners.data && listeners.data(corpo); fn(); }); return req; },
  };
  return req;
}

async function rodar({ ultimaRodadaHaMin, lockGanho = true, githubUltimaFalha = false, emAndamento = 0 }) {
  const chamadas = [];
  global.fetch = async (url, opt = {}) => {
    const u = String(url);
    chamadas.push(u);
    const resp = (status, corpo) => ({ ok: status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) });
    if (u.includes('/rest/v1/webhook_cooldown')) return resp(200, lockGanho ? [{ id: 1 }] : []);
    if (u.includes('status=in_progress')) return resp(200, { total_count: emAndamento });
    if (u.includes('status=queued')) return resp(200, { total_count: 0 });
    if (u.includes('/runs?per_page=1')) {
      if (githubUltimaFalha) return resp(502, {});
      const criada = ultimaRodadaHaMin == null ? [] : [{ created_at: new Date(AGORA - ultimaRodadaHaMin * 60000).toISOString() }];
      return resp(200, { workflow_runs: criada });
    }
    if (u.endsWith('/dispatches')) return resp(204, {});
    throw new Error('fetch inesperado: ' + u);
  };
  const realNow = Date.now;
  Date.now = () => AGORA;
  let saida = null;
  const res = { status(c) { this.c = c; return this; }, json(b) { saida = { status: this.c, ...b }; return this; } };
  try { await handler(pedido(), res); } finally { Date.now = realNow; }
  return { saida, disparou: chamadas.some((u) => u.endsWith('/dispatches')) };
}

const casos = [
  { nome: 'robô rodou há 30 min → não dispara', cfg: { ultimaRodadaHaMin: 30 }, dispara: false },
  { nome: 'robô rodou há 109 min → não dispara', cfg: { ultimaRodadaHaMin: 109 }, dispara: false },
  { nome: 'robô rodou há 111 min → dispara (reserva)', cfg: { ultimaRodadaHaMin: 111 }, dispara: true },
  { nome: 'robô rodou há 4 h (grade falhou) → dispara', cfg: { ultimaRodadaHaMin: 240 }, dispara: true },
  { nome: 'nenhuma rodada no histórico → dispara', cfg: { ultimaRodadaHaMin: null }, dispara: true },
  { nome: 'GitHub não responde a última rodada → não dispara', cfg: { ultimaRodadaHaMin: 240, githubUltimaFalha: true }, dispara: false },
  { nome: 'consulta recente (lock perdido) → não dispara', cfg: { ultimaRodadaHaMin: 240, lockGanho: false }, dispara: false },
  { nome: 'rodada em andamento → não dispara', cfg: { ultimaRodadaHaMin: 240, emAndamento: 1 }, dispara: false },
];

(async () => {
  let falhas = 0;
  for (const c of casos) {
    const r = await rodar(c.cfg);
    const ok = r.disparou === c.dispara && r.saida && r.saida.status === 200;
    if (!ok) falhas++;
    console.log((ok ? 'OK    ' : 'FALHA ') + c.nome + '  — ' + JSON.stringify(r.saida));
  }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nwebhook reserva: ' + casos.length + ' casos ok');
  process.exit(falhas ? 1 : 0);
})();
