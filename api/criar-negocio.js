// api/criar-negocio.js
// Função serverless da Vercel — roda no servidor, nunca no navegador do executivo.
// É a ÚNICA peça que conhece o HUBSPOT_TOKEN (variável de ambiente da Vercel, nunca
// commitada no repo). O botão "Criar negócio" do cockpit chama esta rota via fetch();
// o navegador manda só os dados do lead e o token de sessão do Supabase — nunca a
// chave do HubSpot.
//
// Configuração necessária no painel da Vercel (Settings → Environment Variables):
//   HUBSPOT_TOKEN        = mesmo valor já usado no secret do GitHub Actions
//   SUPABASE_URL         = mesma URL do data/supabase-config.json
//   SUPABASE_ANON_KEY    = mesma anonKey do data/supabase-config.json

const PIPELINE_FIELD_SALES = '916011864';
const STAGE_BACKLOG = '1396007427'; // "Backlog" — mesma etapa onde o RPA já cria os testes

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // ajuste para o domínio do cockpit se quiser travar mais
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token) return res.status(500).json({ erro: 'HUBSPOT_TOKEN não configurado na Vercel.' });

  // ---- 1. confirma que quem chamou está logado de verdade (sessão Supabase válida) ----
  // Não precisa de chave de admin: valida o token do próprio usuário contra o endpoint
  // público /auth/v1/user, do jeito que o Supabase recomenda para esse caso.
  if (supaUrl && supaAnon) {
    const auth = req.headers.authorization || '';
    const sessionToken = auth.replace(/^Bearer\s+/i, '');
    if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
    try {
      const check = await fetch(`${supaUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
      });
      if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    } catch (e) {
      return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
    }
  }
  // Se SUPABASE_URL/ANON_KEY não estiverem configurados na Vercel, a checagem é pulada
  // (fail-open) para não travar o recurso inteiro por uma variável de ambiente faltando —
  // mas o ideal é configurar as duas.

  // ---- 2. dados do lead, validados ----
  const { nome, ownerId, telefone, endereco, bairro, cidade, tipo, nota, avaliacoes } = req.body || {};
  if (!nome || !ownerId) {
    return res.status(400).json({ erro: 'Faltam campos obrigatórios: nome e ownerId.' });
  }

  // Deal não tem campo próprio de telefone/endereço neste portal — vai tudo na descrição,
  // igual um humano preencheria à mão.
  const linhas = [
    telefone ? `Telefone: ${telefone}` : null,
    (endereco || bairro || cidade) ? `Endereço: ${[endereco, bairro, cidade].filter(Boolean).join(' — ')}` : null,
    tipo ? `Tipo: ${tipo}` : null,
    (nota != null && avaliacoes != null) ? `Google: ${nota} · ${avaliacoes} avaliações` : null,
    'Origem: conta-alvo (Leads da praça) — criado pelo cockpit.'
  ].filter(Boolean);

  try {
    const resp = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          dealname: nome,
          pipeline: PIPELINE_FIELD_SALES,
          dealstage: STAGE_BACKLOG,
          hubspot_owner_id: String(ownerId),
          description: linhas.join('\n')
        }
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ erro: data.message || 'HubSpot recusou a criação.', detalhe: data });
    }
    return res.status(200).json({ ok: true, id: data.id, url: `https://app.hubspot.com/contacts/24373118/record/0-3/${data.id}` });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};
