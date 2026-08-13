// api/confirmar-sugestao-gestor.js
// BLOCO 34 (13/08/26) — segunda metade do "gestor pode adicionar leads na agenda do
// executivo, mas fica marcado como sugestão até ele confirmar" (decisão do Julyan).
// criar-tarefa-rota.js já sabe CRIAR a tarefa com o marcador SUGESTAO_GESTOR:...:PENDENTE
// na primeira linha do corpo (ver comentário lá); esta rota é o outro lado — tirar o
// marcador (confirmar) ou apagar a tarefa (recusar).
//
// Mesma arquitetura das outras rotas deste diretório: HUBSPOT_TOKEN nunca sai do
// servidor, o navegador manda só o id da tarefa + o token de sessão do Supabase.

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// Mesmo padrão usado na leitura (ver template: extrairSugestaoGestor) — mantido em
// espelho aqui porque o servidor não pode confiar em nada que o navegador calculou
// sobre o próprio corpo da tarefa; precisa ler o corpo real que está no HubSpot agora,
// não o que a tela tinha na hora do clique (podem ter passado minutos entre os dois).
const RE_MARCADOR = /^SUGESTAO_GESTOR:([^:\n]*):PENDENTE\n?/;

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
    return res.status(500).json({ erro: 'Servidor sem configuração completa. Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão válida (mesma checagem das outras rotas) ----
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

  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  const { taskId, acao } = req.body || {};
  if (!taskId || !['confirmar', 'recusar'].includes(acao)) {
    return res.status(400).json({ erro: 'Faltam campos obrigatórios: taskId e acao ("confirmar" ou "recusar").' });
  }

  // ---- 2. busca a tarefa real no HubSpot — nunca confia em dado vindo do navegador
  // sobre ela (dono, corpo, se ainda está pendente) ----
  let tarefa;
  try {
    const busca = await fetch(
      `https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(taskId)}?properties=hs_task_body,hubspot_owner_id,hs_task_status`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!busca.ok) {
      return res.status(busca.status === 404 ? 404 : 502).json({ erro: 'Não encontrei essa tarefa no HubSpot — pode já ter sido removida.' });
    }
    tarefa = await busca.json();
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao consultar a tarefa no HubSpot: ' + String(e.message || e) });
  }

  const donoTarefa = String((tarefa.properties || {}).hubspot_owner_id || '');
  const corpoAtual = String((tarefa.properties || {}).hs_task_body || '');
  const eraPendente = RE_MARCADOR.test(corpoAtual);

  // ---- 3. escopo: quem pode agir ----
  // Confirmar é ato do DONO da tarefa — só o executivo dono decide se aceita a
  // sugestão na própria agenda; nem o gestor que sugeriu confirma por ele (senão a
  // palavra "sugestão" não significa nada).
  // Recusar pode ser o dono OU o gestor que sugeriu — o gestor precisa poder desfazer
  // uma sugestão que já não faz sentido (ex.: o lead fechou por outro canal) sem
  // depender do executivo abrir o app.
  const souDono = usuario.role !== 'manager' && String(usuario.ownerId) === donoTarefa;
  const souGestor = usuario.role === 'manager';
  if (acao === 'confirmar' && !souDono) {
    return res.status(403).json({ erro: 'Só o executivo dono desta tarefa pode confirmar a sugestão.' });
  }
  if (acao === 'recusar' && !souDono && !souGestor) {
    return res.status(403).json({ erro: 'Você não tem permissão sobre esta tarefa.' });
  }
  if (!eraPendente) {
    // Não é erro do usuário — a tela dele pode estar desatualizada (ex.: já confirmou
    // em outro dispositivo). Devolve sucesso idempotente em vez de erro confuso.
    return res.status(200).json({ ok: true, jaResolvida: true });
  }

  if (acao === 'recusar') {
    try {
      const del = await fetch(`https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (!del.ok && del.status !== 404) {
        const det = await del.json().catch(() => ({}));
        return res.status(del.status).json({ erro: 'HubSpot recusou apagar a tarefa: ' + (det.message || 'sem mensagem') });
      }
      return res.status(200).json({ ok: true, recusada: true });
    } catch (e) {
      return res.status(500).json({ erro: 'Falha ao remover a tarefa no HubSpot: ' + String(e.message || e) });
    }
  }

  // acao === 'confirmar': tira só a linha do marcador, preserva o resto do corpo
  // (endereço, a frase "Origem: ..." fica como histórico de que foi sugestão — só o
  // PENDENTE some, não a rastreabilidade de quem sugeriu).
  const corpoConfirmado = corpoAtual.replace(RE_MARCADOR, '');
  try {
    const patch = await fetch(`https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { hs_task_body: corpoConfirmado } })
    });
    if (!patch.ok) {
      const det = await patch.json().catch(() => ({}));
      return res.status(patch.status).json({ erro: 'HubSpot recusou confirmar: ' + (det.message || 'sem mensagem') });
    }
    return res.status(200).json({ ok: true, confirmada: true });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao confirmar no HubSpot: ' + String(e.message || e) });
  }
};
