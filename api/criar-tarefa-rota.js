// api/criar-tarefa-rota.js
// Função serverless da Vercel — mesma arquitetura do criar-negocio.js: o navegador
// nunca conhece o HUBSPOT_TOKEN; manda só os dados da conta-alvo + o token de sessão
// do Supabase, e esta rota valida tudo antes de escrever no HubSpot.
//
// Objetivo (Julyan, 08/08/26): quando o executivo adiciona uma conta-alvo à rota do
// dia (mapa da aba Rota & Agenda), a visita PRECISA aparecer sozinha na Agenda — sem
// depender de ele também marcar no Expogo. Esta rota cria uma TAREFA no HubSpot com
// o mesmo formato que o Expogo já usa ("Visita - <restaurante>"), reaproveitando 100%
// do reconhecimento que já existe: fetch-hubspot.js, agendaTipoDoTexto (Agenda) e
// visitasTarefasHojeByOwner (contagem da Daily) já sabem ler esse padrão — nenhuma
// lógica nova de leitura foi criada, só a escrita.
//
// Variáveis de ambiente na Vercel (as mesmas já usadas pelo criar-negocio.js):
//   HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY

// usuarios.json vai junto no deploy (require com caminho estático é empacotado pela Vercel).
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

  // FAIL-CLOSED (mesmo padrão do criar-negocio.js): sem as três variáveis de ambiente
  // a rota se recusa a operar, em vez de pular a checagem de sessão.
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

  // ---- 3. dados da conta-alvo ----
  const { nome, ownerId, bairro, cidade, horaPrevista } = req.body || {};
  if (!nome || !ownerId) return res.status(400).json({ erro: 'Faltam campos obrigatórios: nome e ownerId.' });

  // Escopo por papel: executivo só cria tarefa pra si mesmo; gestor pode criar pra
  // qualquer um do time (ex.: montando a rota de alguém junto no 1:1).
  if (usuario.role !== 'manager' && String(ownerId) !== String(usuario.ownerId)) {
    return res.status(403).json({ erro: 'Executivo só pode adicionar visita à própria rota — peça ao gestor para atribuir a outro dono.' });
  }

  // hs_timestamp em horário de Brasília: usa a hora prevista se veio (ex.: "14:30"),
  // senão 09:00 — mesma convenção de "compromisso do dia" usada no resto do cockpit.
  const agoraBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const [hh, mm] = (horaPrevista || '09:00').split(':').map(Number);
  const dataTarefaMs = Date.UTC(agoraBRT.getUTCFullYear(), agoraBRT.getUTCMonth(), agoraBRT.getUTCDate(), (hh || 9) + 3, mm || 0, 0);

  const corpo = [
    (bairro || cidade) ? `Endereço: ${[bairro, cidade].filter(Boolean).join(', ')}` : null,
    'Origem: conta-alvo adicionada à rota do dia pelo Cockpit (Rota & Agenda).'
  ].filter(Boolean).join('\n');

  try {
    const resp = await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          hs_task_subject: `Visita - ${nome}`,
          hs_task_body: corpo,
          hs_task_status: 'NOT_STARTED',
          hs_task_type: 'TODO',
          hs_timestamp: String(dataTarefaMs),
          hubspot_owner_id: String(ownerId)
        }
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ erro: data.message || 'HubSpot recusou a criação da tarefa.', detalhe: data });
    }
    return res.status(200).json({ ok: true, id: data.id, url: `https://app.hubspot.com/contacts/24373118/record/0-27/${data.id}` });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};
