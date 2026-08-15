// api/criar-nota-negocio.js
// Função serverless da Vercel — mesma arquitetura de api/criar-tarefa-rota.js.
//
// CONSOLIDAÇÃO (15/08/26) — limite de 12 funções serverless do plano Hobby da Vercel:
// este arquivo agora cobre DOIS propósitos que antes eram dois endpoints separados
// (criar-nota-negocio.js + criar-proximo-passo.js). Precisei abrir espaço pra
// api/hubspot-webhook.js sem passar do limite. A lógica de cada um não mudou NADA —
// só foram colocados atrás de um discriminador `tipo` no corpo da requisição:
//   tipo ausente ou 'nota'    → cria uma NOTE associada ao negócio (comportamento
//                               idêntico ao antigo criar-nota-negocio.js)
//   tipo === 'proximo-passo'  → cria uma TASK associada ao negócio (comportamento
//                               idêntico ao antigo criar-proximo-passo.js)
//
// Objetivo original (Julyan, 14/08/26): nota escrita no Cockpit vira uma NOTE de
// verdade no HubSpot, associada ao negócio — aparece no timeline dele, pra quem
// abrir lá. Próximo passo vira uma TASK, mesmo padrão.
//
// As duas usam a associação PADRÃO do HubSpot (crm/v4 .../associations/default/...)
// em vez de um ID numérico de tipo de associação chutado — esse ID varia por
// portal/config, e chutar errado criaria um objeto ÓRFÃO (existe no HubSpot, mas não
// aparece em lugar nenhum do negócio) sem erro nenhum aparecer aqui. A rota "default"
// deixa o próprio HubSpot resolver o tipo certo.
//
// Variáveis de ambiente na Vercel: HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY.

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

const { buscarDealAutorizado, removerObjetoHubSpot } = require('../lib/hubspot-deal-guard');

const TIPOS_PASSO = {
  'follow-up': 'Follow-up',
  visita: 'Visita',
  reuniao: 'Reunião',
  reunião: 'Reunião',
  demo: 'Demo'
};

async function tratarNota(req, res, usuario, emailLogado, token) {
  const { dealId, texto } = req.body || {};
  if (!dealId || !texto || !String(texto).trim()) return res.status(400).json({ erro: 'Faltam campos obrigatórios: dealId e texto.' });

  const guard = await buscarDealAutorizado({ token, dealId, usuario });
  if (guard.erro) return res.status(guard.erro.status).json({ erro: guard.erro.mensagem });

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
          hubspot_owner_id: guard.ownerId || undefined
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
      const removida = await removerObjetoHubSpot(token, 'notes', notaId);
      return res.status(502).json({
        ok: false, etapa: 'associacao',
        erro: 'O HubSpot não associou a nota ao negócio; a operação foi cancelada' + (removida ? ' e a nota solta foi removida.' : ', mas não foi possível remover a nota solta automaticamente.'),
        detalhe: det
      });
    }
  } catch (e) {
    const removida = await removerObjetoHubSpot(token, 'notes', notaId);
    return res.status(502).json({
      ok: false, etapa: 'associacao',
      erro: 'Falha ao associar a nota ao negócio' + (removida ? '; a nota solta foi removida.' : '; não foi possível remover a nota solta automaticamente.')
    });
  }

  return res.status(200).json({ ok: true, id: notaId, associada: true });
}

async function tratarProximoPasso(req, res, usuario, token) {
  const { dealId, texto, data, tipo } = req.body || {};
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

  const guard = await buscarDealAutorizado({ token, dealId, usuario });
  if (guard.erro) return res.status(guard.erro.status).json({ erro: guard.erro.mensagem });

  // "tipo" aqui é o TIPO DO PASSO (Follow-up/Visita/Reunião/Demo) — nada a ver com o
  // "tipo" de nível mais alto que escolhe entre nota/próximo-passo nesta rota.
  const tipoNormalizado = tipo == null ? null : TIPOS_PASSO[String(tipo).trim().toLowerCase()];
  if (tipo != null && !tipoNormalizado) {
    return res.status(400).json({ erro: 'Tipo de próximo passo inválido.' });
  }
  const assuntoLivre = String(texto).trim();
  const assunto = tipoNormalizado ? `${tipoNormalizado} - ${assuntoLivre}` : assuntoLivre;

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
          hs_task_subject: assunto.slice(0, 200),
          hs_task_status: 'NOT_STARTED',
          hs_task_type: 'TODO',
          hs_timestamp: String(dataTarefaMs),
          hubspot_owner_id: guard.ownerId || undefined
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
      const removida = await removerObjetoHubSpot(token, 'tasks', taskId);
      return res.status(502).json({
        ok: false, etapa: 'associacao',
        erro: 'O HubSpot não associou a tarefa ao negócio; a operação foi cancelada' + (removida ? ' e a tarefa solta foi removida.' : ', mas não foi possível remover a tarefa solta automaticamente.'),
        detalhe: det
      });
    }
  } catch (e) {
    const removida = await removerObjetoHubSpot(token, 'tasks', taskId);
    return res.status(502).json({
      ok: false, etapa: 'associacao',
      erro: 'Falha ao associar a tarefa ao negócio' + (removida ? '; a tarefa solta foi removida.' : '; não foi possível remover a tarefa solta automaticamente.')
    });
  }

  return res.status(200).json({ ok: true, id: taskId, associada: true, url: `https://app.hubspot.com/contacts/24373118/record/0-27/${taskId}` });
}

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

  // ---- 3. despacha pro tratamento certo ----
  const tipoAcao = (req.body && req.body.tipoAcao) || 'nota';
  if (tipoAcao === 'proximo-passo') return tratarProximoPasso(req, res, usuario, token);
  return tratarNota(req, res, usuario, emailLogado, token);
};
