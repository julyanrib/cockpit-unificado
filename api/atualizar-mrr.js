// api/atualizar-mrr.js
// Função serverless da Vercel — mesma arquitetura do criar-negocio.js: o navegador
// nunca conhece o HUBSPOT_TOKEN; manda só { dealId, mrr } + o token de sessão do
// Supabase, e esta rota valida tudo antes de escrever no HubSpot.
//
// Regras de segurança (validadas AQUI no servidor, não só na tela):
//   1. Sessão Supabase válida (mesmo check do criar-negocio).
//   2. O e-mail logado precisa existir em data/usuarios.json.
//   3. O negócio precisa ser do pipeline Field Sales E estar numa etapa de GANHO
//      (Negócio Fechado / Enviado Onboarding) — esta rota só serve pro quadro
//      "Vendas do mês", não é um editor genérico de deals.
//   4. Executivo (role: rep) só edita negócio cujo dono no HubSpot é ele mesmo.
//      Gestor (role: manager) edita qualquer um do time.
//
// Variáveis de ambiente na Vercel (as mesmas já usadas pelo criar-negocio.js):
//   HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY

const PIPELINE_FIELD_SALES = '916011864';
const STAGES_GANHO = ['1396006162', '1396006163']; // Negócio Fechado + Enviado Onboarding

// usuarios.json vai junto no deploy (require com caminho estático é empacotado pela Vercel).
// Formato real do arquivo: { _comment, usuarios: [...] } — não é um array direto.
let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  // FAIL-CLOSED (correção de segurança 06/08/26): antes, se SUPABASE_URL/ANON_KEY
  // faltassem na Vercel, a checagem de sessão era simplesmente PULADA e qualquer
  // pessoa na internet podia editar MRR chamando esta rota direto. Agora, sem as
  // três variáveis de ambiente a rota se recusa a operar.
  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão válida + descobrir QUEM está chamando (sempre obrigatório) ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. papel de quem chamou (usuarios.json é a fonte, igual ao login do cockpit) ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  }
  if (usuario.role !== 'manager' && usuario.role !== 'rep') {
    return res.status(403).json({ erro: 'Papel de usuário não autorizado a editar MRR.' });
  }

  // ---- 3. entrada ----
  const { dealId, mrr } = req.body || {};
  const mrrNum = Number(mrr);
  if (!dealId) return res.status(400).json({ erro: 'Falta o dealId.' });
  if (!Number.isFinite(mrrNum) || mrrNum < 0 || mrrNum > 1000000) {
    return res.status(400).json({ erro: 'MRR inválido — mande um número entre 0 e 1.000.000.' });
  }

  try {
    // ---- 4. confere o negócio ANTES de escrever: pipeline, etapa de ganho e dono ----
    const getResp = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}?properties=dealname,pipeline,dealstage,hubspot_owner_id`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!getResp.ok) {
      return res.status(getResp.status === 404 ? 404 : 502).json({ erro: 'Negócio não encontrado no HubSpot.' });
    }
    const deal = await getResp.json();
    const p = deal.properties || {};
    if (p.pipeline !== PIPELINE_FIELD_SALES) {
      return res.status(403).json({ erro: 'Esse negócio não é do pipeline Field Sales.' });
    }
    if (!STAGES_GANHO.includes(p.dealstage)) {
      return res.status(403).json({ erro: 'Só dá pra editar o MRR de negócios já fechados (etapa de ganho).' });
    }
    if (usuario && usuario.role !== 'manager' && String(p.hubspot_owner_id) !== String(usuario.ownerId)) {
      return res.status(403).json({ erro: 'Esse negócio não é seu — só o dono ou o gestor pode editar o MRR.' });
    }

    // ---- 5. grava ----
    const patchResp = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { valor_de_mrr: String(Math.round(mrrNum)) } })
    });
    const data = await patchResp.json();
    if (!patchResp.ok) {
      return res.status(patchResp.status).json({ erro: data.message || 'HubSpot recusou a atualização.', detalhe: data });
    }
    return res.status(200).json({ ok: true, id: String(dealId), mrr: Math.round(mrrNum) });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};
