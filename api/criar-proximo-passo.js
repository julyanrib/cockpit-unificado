// api/criar-proximo-passo.js
// Função serverless da Vercel — mesma arquitetura de api/criar-tarefa-rota.js, mas
// pra um propósito diferente: aqui o texto é LIVRE (é o "próximo passo" que o
// executivo escreve pra um negócio específico do funil), não o padrão fixo
// "Visita - <nome>" que api/criar-tarefa-rota.js usa pra reconhecimento pela Agenda.
//
// Por isso esta rota NÃO participa do parsing por prefixo de assunto (agendaTipoDoTexto
// etc.) — ela só cria uma tarefa TODO comum, associada ao negócio pela associação
// PADRÃO do HubSpot (mesmo motivo do criar-nota-negocio.js: "default" em vez de um ID
// de tipo de associação chutado). O HubSpot, ao ver uma tarefa aberta associada com
// data futura, atualiza sozinho a propriedade `notes_next_activity_date` do negócio —
// que é exatamente o campo que fetch-hubspot.js já lê como `proximaAtividade` (nenhuma
// lógica nova de leitura precisou ser criada, só a escrita).
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
  const { dealId, ownerId, texto, data } = req.body || {};
  if (!dealId || !texto || !String(texto).trim() || !data) {
    return res.status(400).json({ erro: 'Faltam campos obrigatórios: dealId, texto e data.' });
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data).trim());
  if (!m) return res.status(400).json({ erro: 'Campo "data" deve estar no formato AAAA-MM-DD.' });
  const ano = Number(m[1]), mes = Number(m[2]) - 1, dia = Number(m[3]);
  const teste = new Date(Date.UTC(ano, mes, dia));
  if (teste.getUTCFullYear() !== ano || teste.getUTCMonth() !== mes || teste.getUTCDate() !== dia) {
    return res.status(400).json({ erro: 'Data inválida.' });
  }

  if (usuario.role !== 'manager' && ownerId != null && String(ownerId) !== String(usuario.ownerId)) {
    return res.status(403).json({ erro: 'Você só pode planejar próximo passo nos seus próprios negócios.' });
  }

  // 09:00 Brasília = 12:00 UTC — mesma convenção de "compromisso do dia" do resto do
  // cockpit quando não há hora específica (o próximo passo aqui é só data, sem hora).
  const dataTarefaMs = Date.UTC(ano, mes, dia, 12, 0, 0);

  let taskId = null;
  try {
    const criar = await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          hs_task_subject: String(texto).trim().slice(0, 200),
          hs_task_status: 'NOT_STARTED',
          hs_task_type: 'TODO',
          hs_timestamp: String(dataTarefaMs),
          hubspot_owner_id: ownerId != null ? String(ownerId) : undefined
        }
      })
    });
    const respData = await criar.json().catch(() => ({}));
    if (!criar.ok) {
      return res.status(criar.status).json({ etapa: 'criacao', erro: 'HubSpot recusou a criação da tarefa: ' + (respData.message || 'sem mensagem'), detalhe: respData });
    }
    taskId = respData.id;
  } catch (e) {
    return res.status(500).json({ etapa: 'criacao', erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }

  try {
    const assoc = await fetch(`https://api.hubapi.com/crm/v4/objects/tasks/${taskId}/associations/default/deals/${encodeURIComponent(dealId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!assoc.ok) {
      const det = await assoc.json().catch(() => ({}));
      return res.status(200).json({
        ok: true, id: taskId, associada: false,
        aviso: 'Tarefa criada, mas não consegui associá-la ao negócio automaticamente: ' + (det.message || 'HubSpot recusou a associação') + '. Associe manualmente no HubSpot — sem essa associação, o negócio não vai mostrar "próximo passo" marcado.'
      });
    }
  } catch (e) {
    return res.status(200).json({ ok: true, id: taskId, associada: false, aviso: 'Tarefa criada, mas a associação falhou: ' + String(e.message || e) });
  }

  return res.status(200).json({ ok: true, id: taskId, associada: true, url: `https://app.hubspot.com/contacts/24373118/record/0-27/${taskId}` });
};
