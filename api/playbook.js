// Biblioteca interna do Field Sales. O conteúdo não entra no HTML público: só é
// devolvido depois que a sessão Supabase e o cadastro no time são confirmados.
const playbook = require('../data/field-sales-playbook.compiled.json');

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Autenticação não configurada. Biblioteca bloqueada por segurança.' });
  }
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ erro: 'Sem sessão. Entre novamente no Cockpit.' });

  let email = null;
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre novamente.' });
    const user = await check.json();
    email = user && user.email ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!email || !USUARIOS.some(u => String(u.email).toLowerCase() === email)) {
    return res.status(403).json({ erro: 'Este e-mail não está cadastrado no time.' });
  }
  return res.status(200).json({ ok: true, playbook });
};
