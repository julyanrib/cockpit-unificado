// api/criar-nota-negocio.js
// Função serverless da Vercel — mesma arquitetura de api/criar-tarefa-rota.js.
//
// Objetivo (Julyan, 14/08/26): nota escrita no Cockpit vira uma NOTE de verdade no
// HubSpot, associada ao negócio — aparece no timeline dele, pra quem abrir lá.
//
// Duas chamadas: 1) cria o objeto nota (crm/v3/objects/notes); 2) associa ao negócio
// via a associação PADRÃO do HubSpot (crm/v4 .../associations/default/...) — usa
// "default" em vez de um ID numérico de tipo de associação porque esse ID varia por
// portal/config e chutar o número errado criaria uma nota ÓRFÃ (existe no HubSpot,
// mas não aparece em lugar nenhum do negócio) sem erro nenhum aparecer aqui. A rota
// "default" deixa o próprio HubSpot resolver o tipo certo.
//
// Variáveis de ambiente na Vercel: HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY.

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

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão Supabase válida ----
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

  // ---- 2. papel de quem chamou ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  // ---- 3. dados do pedido ----
  const { dealId, ownerId, texto } = req.body || {};
  if (!dealId || !texto || !String(texto).trim()) return res.status(400).json({ erro: 'Faltam campos obrigatórios: dealId e texto.' });

  if (usuario.role !== 'manager' && ownerId != null && String(ownerId) !== String(usuario.ownerId)) {
    return res.status(403).json({ erro: 'Você só pode adicionar nota nos seus próprios negócios.' });
  }

  // Assina a nota com quem escreveu — o HubSpot não faz isso sozinho quando a nota
  // entra via API com o token da integração (apareceria como se ninguém tivesse escrito).
  const corpo = `${String(texto).trim()}\n\n— ${usuario.nome || emailLogado} (via Cockpit)`;

  let notaId = null;
  try {
    const criar = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          hs_note_body: corpo,
          hs_timestamp: String(Date.now()),
          hubspot_owner_id: ownerId != null ? String(ownerId) : undefined
        }
      })
    });
    const data = await criar.json().catch(() => ({}));
    if (!criar.ok) {
      return res.status(criar.status).json({ etapa: 'criacao', erro: 'HubSpot recusou a criação da nota: ' + (data.message || 'sem mensagem'), detalhe: data });
    }
    notaId = data.id;
  } catch (e) {
    return res.status(500).json({ etapa: 'criacao', erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }

  try {
    const assoc = await fetch(`https://api.hubapi.com/crm/v4/objects/notes/${notaId}/associations/default/deals/${encodeURIComponent(dealId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!assoc.ok) {
      const det = await assoc.json().catch(() => ({}));
      // A nota EXISTE no HubSpot mesmo se a associação falhar — melhor avisar que ficou
      // solta do que fingir sucesso completo. Quem ler isso sabe ir arrumar manualmente.
      return res.status(200).json({
        ok: true, id: notaId, associada: false,
        aviso: 'Nota criada, mas não consegui associá-la ao negócio automaticamente: ' + (det.message || 'HubSpot recusou a associação') + '. Associe manualmente no HubSpot.'
      });
    }
  } catch (e) {
    return res.status(200).json({ ok: true, id: notaId, associada: false, aviso: 'Nota criada, mas a associação falhou: ' + String(e.message || e) });
  }

  return res.status(200).json({ ok: true, id: notaId, associada: true });
};
