// lib/atualizar-hubspot.js — servido por api/hubspot-webhook.js?acao=atualizar (limite de 12 funções do Hobby)
// O BOTÃO "ATUALIZAR HUBSPOT" DO GESTOR (09/10/26).
// Julyan: "preciso que o cockpit do gestor seja o mais real possível, é daqui que eu gerencio".
// O que vem do app (visitas, plano, mapa) já é ao vivo; o que vem do HubSpot (etapas, travados,
// quentes, Mês) só muda quando o robô (daily-refresh.yml) roda — de 2 em 2 horas, e a grade do
// GitHub chega 1-2 h atrasada (medido em 27/09, ver hubspot-webhook.js). Às 08:47 o cockpit
// mostrava o HubSpot das 07:02.
//
// Este endpoint aperta o mesmo "Run workflow" que o webhook aperta, com a mesma credencial
// (GITHUB_PAT, já na Vercel), sob três travas:
//   1. só GESTOR: a sessão do APP Outbound (Supabase mxyjvijclhlxrlafqcrz) tem de ser válida e
//      is_field_admin() tem de dizer sim — a mesma regra que o banco usa;
//   2. uma rodada por vez: rodando ou na fila, não dispara outra (responde "rodando");
//   3. 5 minutos entre disparos: cada rodada custa ~3 min de Actions, e a franquia é de
//      2.000/mês (a conta está em hubspot-webhook.js).
// O disparo vai com origem "cockpit": o robô atualiza número e NÃO gera texto de IA.
//
// GET  -> estado da última rodada ({ estado: 'rodando' | 'pronto' | 'esperando', ... })
// POST -> dispara (ou diz por que não)

const GITHUB_OWNER = 'julyanrib';
const GITHUB_REPO = 'cockpit-unificado';
const WORKFLOW_FILE = 'daily-refresh.yml';
const INTERVALO_MINUTOS = 5;
// O projeto do APP Outbound. A URL e a chave anon são públicas por natureza (estão no bundle
// do app de campo, src/integrations/supabase/client.ts); a sessão é quem prova quem é.
const APP_URL = 'https://mxyjvijclhlxrlafqcrz.supabase.co';
const APP_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14eWp2aWpjbGhseHJsYWZxY3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDA1MTQsImV4cCI6MjA4MzgxNjUxNH0.DeEJrynoil34MXrZMGBtouyHBX0ldsgK__H97NYBFyM';
const ORIGENS = ['https://pwa-app-outbound.vercel.app'];

async function ehGestor(token) {
  const u = await fetch(APP_URL + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + token, apikey: APP_ANON } });
  if (!u.ok) return false;
  const r = await fetch(APP_URL + '/rest/v1/rpc/is_field_admin', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, apikey: APP_ANON, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

module.exports = async function handler(req, res) {
  const origem = req.headers.origin || '';
  if (ORIGENS.indexOf(origem) >= 0) res.setHeader('Access-Control-Allow-Origin', origem);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) return res.status(500).json({ erro: 'Servidor sem GITHUB_PAT configurado.' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ erro: 'Sem sessão.' });
  try {
    if (!(await ehGestor(token))) return res.status(403).json({ erro: 'Só o gestor atualiza o HubSpot por aqui.' });
  } catch (e) {
    return res.status(502).json({ erro: 'Não consegui conferir a sessão: ' + e.message });
  }

  const gh = { Authorization: 'Bearer ' + githubPat, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'cockpit-atualizar-hubspot' };
  const base = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/actions/workflows/' + WORKFLOW_FILE;
  try {
    const ult = await fetch(base + '/runs?per_page=1', { headers: gh });
    if (!ult.ok) return res.status(502).json({ erro: 'O GitHub não respondeu (' + ult.status + ').' });
    const run = ((await ult.json()).workflow_runs || [])[0] || null;
    const criado = run ? Date.parse(run.created_at) : NaN;
    const rodando = !!run && run.status !== 'completed';

    if (req.method === 'GET') {
      // "desde" = quando o botão foi apertado: só conta como pronto a rodada que nasceu depois
      const desde = Number((req.query && req.query.desde) || 0);
      if (rodando) return res.status(200).json({ estado: 'rodando', desde: run.created_at });
      if (run && (!desde || criado >= desde - 60000)) {
        return res.status(200).json({ estado: 'pronto', conclusao: run.conclusion, em: run.updated_at });
      }
      return res.status(200).json({ estado: 'esperando' });
    }

    if (rodando) return res.status(200).json({ estado: 'rodando', disparado: false, desde: run.created_at });
    const minutos = Number.isFinite(criado) ? (Date.now() - criado) / 60000 : Infinity;
    if (minutos < INTERVALO_MINUTOS) {
      return res.status(200).json({ estado: 'recente', disparado: false, minutos: Math.round(minutos), em: run.updated_at });
    }
    const d = await fetch(base + '/dispatches', {
      method: 'POST',
      headers: Object.assign({}, gh, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ref: 'main', inputs: { origem: 'cockpit' } })
    });
    if (!d.ok) return res.status(502).json({ erro: 'O GitHub recusou o disparo (' + d.status + ').' });
    return res.status(200).json({ estado: 'rodando', disparado: true });
  } catch (e) {
    return res.status(502).json({ erro: 'Falha ao falar com o GitHub: ' + e.message });
  }
};
