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

/* QUALIFICAÇÃO (28/08/26) — terceira coisa que este arquivo cobre, pelo MESMO motivo
   que ele já cobria duas: o limite de 12 funções serverless do plano Hobby.
   Eu tinha criado api/qualificar-negocio.js e com isso o projeto foi a 13 funções — o
   deploy da Vercel passou a falhar, e produção ficou servindo o último deploy que deu
   certo. O limite já estava documentado no topo deste arquivo desde 15/08 e eu passei
   por cima dele. A rota separada foi removida e virou este trecho.

   A consolidação saiu melhor que a rota separada, e não pior: a tela já fazia POST
   aqui para criar a tarefa do próximo passo, então a qualificação viaja no MESMO
   request. Some a ida e volta extra, e o "grava a dor antes de marcar a tarefa" deixa
   de depender de duas chamadas em sequência no navegador — vira ordem de execução
   dentro de um único handler.

   Continua sendo whitelist de DUAS propriedades e mais nada. */
const ETAPAS_QUALIFICAVEIS = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473', '1398311191'];

/* MESMA lista do OP_GARGALO da tela (template/cockpit.template.html). Duplicada aqui
   de propósito: o servidor não pode confiar no que o navegador manda, e a propriedade
   no HubSpot é enumeração — valor fora da lista volta como erro cru da API. Validar
   aqui devolve mensagem que se entende. Se a lista mudar na tela, muda aqui também. */
const OP_GARGALO = ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'];

/* Grava as duas propriedades de qualificação, se vieram. Devolve { erro } para o
   chamador abortar, ou { props } com o que foi gravado (vazio se nada veio).
   Roda ANTES de criar a tarefa de propósito: tarefa datada em cima de negócio que
   segue cego é exatamente o estado que produziu 49 negócios em Visita sem nada
   registrado. Se a qualificação falha, não existe próximo passo. */
async function gravarQualificacao({ token, dealId, deal, qualificacao }) {
  if (!qualificacao || typeof qualificacao !== 'object') return { props: {} };

  const etapa = String((deal && deal.properties && deal.properties.dealstage) || '');
  if (!ETAPAS_QUALIFICAVEIS.includes(etapa)) {
    return { erro: { status: 403, mensagem: 'Só dá pra qualificar negócio em etapa aberta do funil.' } };
  }

  const props = {};
  const sistema = qualificacao.nomeDoSistema;
  if (sistema != null && String(sistema).trim() !== '') {
    const s = String(sistema).trim();
    if (s.length > 120) return { erro: { status: 400, mensagem: 'Nome do sistema muito longo (máximo 120 caracteres).' } };
    props.nome_do_sistema = s;
  }
  const gargalo = qualificacao.gargalo;
  if (gargalo != null && String(gargalo).trim() !== '') {
    const g = String(gargalo).trim();
    if (!OP_GARGALO.includes(g)) {
      return { erro: { status: 400, mensagem: `Dor inválida. Use uma destas: ${OP_GARGALO.join(', ')}.` } };
    }
    props.gargalo_operacional = g;
  }
  if (Object.keys(props).length === 0) return { props: {} };

  try {
    const patch = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: props })
    });
    if (!patch.ok) {
      const det = await patch.json().catch(() => ({}));
      return { erro: { status: patch.status, mensagem: det.message || 'O HubSpot recusou a qualificação.' } };
    }
  } catch (e) {
    return { erro: { status: 502, mensagem: 'Falha ao gravar a qualificação: ' + String(e.message || e) } };
  }
  return { props };
}

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

  // Qualificação primeiro: se ela falhar, não se cria tarefa nenhuma (ver comentário
  // em gravarQualificacao). O guard acima já garantiu pipeline e dono deste negócio.
  const qual = await gravarQualificacao({
    token, dealId, deal: guard.deal, qualificacao: req.body && req.body.qualificacao
  });
  if (qual.erro) return res.status(qual.erro.status).json({ erro: qual.erro.mensagem });

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

  // `qualificacao` volta pro cliente espelhar no DATA em memória — sem isso a ficha
  // continuaria cobrando o que acabou de ser gravado, até o próximo sync.
  return res.status(200).json({
    ok: true, id: taskId, associada: true,
    qualificacao: Object.keys(qual.props).length ? qual.props : null,
    url: `https://app.hubspot.com/contacts/24373118/record/0-27/${taskId}`
  });
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
