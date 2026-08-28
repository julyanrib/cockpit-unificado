// api/qualificar-negocio.js
// Grava a QUALIFICAÇÃO de um negócio — o sistema que o restaurante usa hoje e a dor
// que ele contou — sem mexer na etapa.
//
// POR QUE ESTA ROTA EXISTE (28/08/26)
// Medido nos 132 negócios abertos da carteira real:
//
//   etapa                 n    c/ sistema   c/ dor
//   Visita               51        0          2
//   Conversa c/ Decisor  21        8         21
//
// `gargalo_operacional` está 100% preenchido exatamente na etapa onde o formulário de
// passagem exige, e em 4% na Visita, onde não exigia nada. O gate de campo funciona —
// só estava instalado na etapa errada. Isso foi corrigido em CAMPOS_POR_ETAPA, o que
// resolve daqui pra frente.
//
// Mas o gate roda só na transição de ENTRADA, e 49 negócios JÁ estão em Visita sem
// nada registrado. Eles não seriam perguntados até tentarem ir pro Decisor — que é
// exatamente o movimento que não está acontecendo. Todos os 49 estão em Visita há no
// máximo 19 dias (mediana 3), ou seja: o executivo ainda lembra da visita. Dava pra
// recuperar, e não havia como — nenhuma rota do Cockpit escrevia propriedade de
// negócio sem mudar etapa (`atualizar-mrr` grava só valor_de_mrr, e só em negócio já
// ganho).
//
// ESCOPO DELIBERADAMENTE ESTREITO, no mesmo padrão do atualizar-mrr.js: esta rota NÃO
// é um editor genérico de deals. Ela escreve DUAS propriedades e mais nada, e a
// picklist é validada aqui no servidor, não só na tela.
//
// Regras de segurança (validadas AQUI, não só no navegador):
//   1. Sessão Supabase válida.
//   2. O e-mail logado precisa existir em data/usuarios.json.
//   3. O negócio precisa ser do pipeline Field Sales e estar numa etapa ABERTA —
//      qualificar negócio ganho ou perdido não tem uso e só amplia a superfície.
//   4. Executivo (rep) só qualifica negócio cujo dono no HubSpot é ele mesmo.
//      Gestor (manager) qualifica qualquer um do time.
//
// Variáveis de ambiente na Vercel (as mesmas das outras rotas):
//   HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY

const PIPELINE_FIELD_SALES = '916011864';

// Espelha ETAPAS_ABERTAS de api/mudar-etapa-negocio.js, MENOS 1396006163 (Enviado
// Onboarding): lá ela conta como etapa alcançável do funil, aqui não — negócio já
// entregue pro onboarding não se qualifica mais.
const ETAPAS_QUALIFICAVEIS = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473', '1398311191'];

// MESMA lista do OP_GARGALO da tela (template/cockpit.template.html). Duplicada aqui
// de propósito: o servidor não pode confiar no que o navegador manda, e a propriedade
// no HubSpot é enumeração — valor fora da lista volta como erro cru da API. Validar
// aqui devolve mensagem que se entende. Se a lista mudar na tela, muda aqui também.
const OP_GARGALO = ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'];

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

  // Fail-closed: sem as três variáveis a rota se recusa a operar, em vez de pular a
  // checagem de sessão (foi exatamente esse o furo corrigido no atualizar-mrr em 06/08).
  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão válida + quem está chamando ----
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

  // ---- 2. papel ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  if (usuario.role !== 'manager' && usuario.role !== 'rep') {
    return res.status(403).json({ erro: 'Papel de usuário não autorizado a qualificar negócio.' });
  }

  // ---- 3. entrada: exatamente dois campos, ambos opcionais, ao menos um presente ----
  const { dealId, nomeDoSistema, gargalo } = req.body || {};
  if (!dealId) return res.status(400).json({ erro: 'Falta o dealId.' });

  const propriedades = {};

  if (nomeDoSistema !== undefined && nomeDoSistema !== null && String(nomeDoSistema).trim() !== '') {
    const s = String(nomeDoSistema).trim();
    if (s.length > 120) return res.status(400).json({ erro: 'Nome do sistema muito longo (máximo 120 caracteres).' });
    propriedades.nome_do_sistema = s;
  }

  if (gargalo !== undefined && gargalo !== null && String(gargalo).trim() !== '') {
    const g = String(gargalo).trim();
    if (!OP_GARGALO.includes(g)) {
      return res.status(400).json({ erro: `Dor inválida. Use uma destas: ${OP_GARGALO.join(', ')}.` });
    }
    propriedades.gargalo_operacional = g;
  }

  if (Object.keys(propriedades).length === 0) {
    return res.status(400).json({ erro: 'Nada a gravar — mande o sistema que ele usa hoje, a dor, ou os dois.' });
  }

  try {
    // ---- 4. confere o negócio ANTES de escrever: pipeline, etapa aberta e dono ----
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
    if (!ETAPAS_QUALIFICAVEIS.includes(String(p.dealstage))) {
      return res.status(403).json({ erro: 'Só dá pra qualificar negócio em etapa aberta do funil.' });
    }
    if (usuario.role !== 'manager' && String(p.hubspot_owner_id) !== String(usuario.ownerId)) {
      return res.status(403).json({ erro: 'Esse negócio não é seu — só o dono ou o gestor pode qualificar.' });
    }

    // ---- 5. grava ----
    const patchResp = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: propriedades })
    });
    const data = await patchResp.json();
    if (!patchResp.ok) {
      return res.status(patchResp.status).json({ erro: data.message || 'HubSpot recusou a atualização.', detalhe: data });
    }
    return res.status(200).json({ ok: true, id: String(dealId), gravado: propriedades });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};
