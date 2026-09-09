// api/desfazer-negocio.js — DESFAZER o negócio criado por engano no Planejamento
// =========================================================================================
// PEDIDO (09/09/26, Julyan): "se eu coloquei sem querer o lead em prospecção no
// planejamento e retirei, ele tem que sair do funil, tem que ter uma trava, ele tem q
// confirmar, algo do tipo".
//
// O CASO REAL, medido no dia do pedido: o negócio 64905141165 ("RSM ENCOMENDAS DE PAES
// ARTESANAIS", do André) nasceu às 22:55, em Prospecção, sem valor e sem uma única
// atividade — criado por um clique no Planejamento e removido do plano em seguida. O
// cockpit tirava o cartão do dia e o negócio ficava no funil para sempre, aparecendo na
// tela do gestor como "0D · sem próximo passo" e contando no funil do time.
//
// ══ O QUE ESTA ROTA FAZ, E O QUE ELA SE RECUSA A FAZER ══════════════════════════════════
// Ela ARQUIVA o negócio no HubSpot — o DELETE da API v3 manda para a lixeira, de onde ele
// é restaurável por 90 dias. Não é apagar: é desfazer, e desfazer tem volta.
//
// Ela só faz isso quando as QUATRO condições valem, e cada uma existe por um motivo:
//   1. O NEGÓCIO FOI CRIADO AQUI. `leads_prospeccao.hubspot_deal_id` tem de apontar para
//      ele. Sem essa amarra, esta rota viraria um jeito de apagar qualquer negócio do
//      pipeline a partir do navegador.
//   2. ELE AINDA ESTÁ EM PROSPECÇÃO. Negócio que avançou de etapa é trabalho feito, e
//      trabalho feito não se desfaz por um ✕ de planejamento.
//   3. NÃO TEM VALOR NEM MENSALIDADE. Valor preenchido é alguém negociando.
//   4. NÃO TEM NENHUMA ATIVIDADE — nota, tarefa, ligação, reunião ou e-mail. Uma nota é
//      uma conversa que aconteceu; arquivar levaria o registro dela.
// Falhando qualquer uma, a resposta é 409 com o motivo, e a tela manda ele resolver no
// HubSpot. Recusar explicando é melhor que apagar em silêncio.
//
// ══ POR QUE ISTO NÃO CONTRARIA "SÓ MEXEMOS NO COCKPIT" ═════════════════════════════════
// A regra dele é sobre PROPRIEDADE e configuração do CRM: "quando eu falo não alterar
// nada, é propriedade, qualquer coisa formatada lá". Criar negócio a partir do cockpit já
// é gesto do produto (api/criar-negocio.js). Esta rota é o gesto SIMÉTRICO do mesmo
// clique, pedido por ele, e restringido ao negócio que o próprio cockpit criou e que
// ninguém tocou. Nenhuma propriedade é editada — o negócio inteiro vai para a lixeira.
//
// Variáveis de ambiente: as mesmas de api/criar-negocio.js (HUBSPOT_TOKEN, SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY).

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

/* A etapa de Prospecção do pipeline de Field Sales. Cravada de propósito: a rota só
   desfaz o que está NELA, e uma lista mais larga aqui seria a porta para desfazer
   negócio em Demo. */
const ETAPA_PROSPECCAO = '1395880469';
const PIPELINE_FIELD_SALES = '916011864';

/* As cinco associações que contam como "alguém trabalhou este negócio". */
const ATIVIDADES = ['notes', 'tasks', 'calls', 'meetings', 'emails'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const supaService = process.env.SUPABASE_SERVICE_KEY;
  if (!token || !supaUrl || !supaAnon || !supaService) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa. Operação bloqueada por segurança.' });
  }

  /* ── 1. sessão ─────────────────────────────────────────────────────────────────── */
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  let emailLogado = null;
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  const usuario = emailLogado
    ? USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado) : null;
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  /* ── 2. o pedido ───────────────────────────────────────────────────────────────── */
  const { dealId, leadId } = req.body || {};
  if (!dealId || !leadId) {
    return res.status(400).json({ erro: 'Faltam dealId e leadId — os dois, porque é o par que prova que este negócio nasceu aqui.' });
  }

  /* ── 3. o negócio nasceu AQUI, e é do dono certo ───────────────────────────────── */
  let linha = null;
  try {
    const r = await fetch(`${supaUrl}/rest/v1/leads_prospeccao?id=eq.${encodeURIComponent(String(leadId))}`
      + '&select=id,nome,hubspot_deal_id,responsavel_owner_id,status', {
      headers: { apikey: supaService, Authorization: `Bearer ${supaService}` }
    });
    const j = await r.json().catch(() => []);
    linha = Array.isArray(j) ? j[0] : null;
  } catch (e) {
    return res.status(502).json({ erro: 'Não consegui ler a conta na fila de prospecção.' });
  }
  if (!linha) return res.status(404).json({ erro: 'Não achei esta conta na fila de prospecção.' });
  if (String(linha.hubspot_deal_id || '') !== String(dealId)) {
    return res.status(409).json({
      erro: 'Este negócio não foi criado pelo cockpit a partir desta conta — desfazer daqui poderia arquivar negócio de outra origem. Resolva no HubSpot.',
      motivo: 'nao-nasceu-aqui'
    });
  }
  /* O executivo desfaz o que é dele; o gestor desfaz de qualquer um. Mesma regra do
     criar-negocio, e pela mesma razão: quem não é dono não sabe o que está desfazendo. */
  if (usuario.role !== 'manager'
    && String(linha.responsavel_owner_id || '') !== String(usuario.ownerId || '')) {
    return res.status(403).json({ erro: 'Esta conta é da carteira de outro executivo.' });
  }

  /* ── 4. o negócio está intocado? ───────────────────────────────────────────────── */
  let negocio = null;
  try {
    const r = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`
      + '?properties=dealname,dealstage,pipeline,amount,mrr,valor_de_mrr'
      + '&associations=' + ATIVIDADES.join(','), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (r.status === 404) {
      /* JÁ NÃO EXISTE: alguém arquivou antes, ou o desfazer rodou duas vezes. Isso não é
         erro para quem clicou — o resultado que ele queria já está lá. A fila é limpa
         mesmo assim, para o botão de criar voltar a aparecer. */
      await limparLead(supaUrl, supaService, leadId);
      return res.status(200).json({ ok: true, jaNaoExistia: true });
    }
    if (!r.ok) return res.status(502).json({ erro: 'O HubSpot não respondeu sobre este negócio.' });
    negocio = await r.json();
  } catch (e) {
    return res.status(502).json({ erro: 'Não consegui falar com o HubSpot.' });
  }

  const props = (negocio && negocio.properties) || {};
  if (String(props.pipeline || '') !== PIPELINE_FIELD_SALES) {
    return res.status(409).json({ erro: 'Este negócio não está no pipeline de Field Sales.', motivo: 'outro-pipeline' });
  }
  if (String(props.dealstage || '') !== ETAPA_PROSPECCAO) {
    return res.status(409).json({
      erro: 'Este negócio já saiu de Prospecção — alguém avançou a etapa. Trabalho feito não se desfaz por um ✕ de planejamento; mova ou perca no HubSpot.',
      motivo: 'avancou'
    });
  }
  const dinheiro = Number(props.amount || 0) + Number(props.mrr || 0) + Number(props.valor_de_mrr || 0);
  if (dinheiro > 0) {
    return res.status(409).json({
      erro: 'Este negócio já tem valor preenchido — alguém está negociando. Não arquivei nada.',
      motivo: 'tem-valor'
    });
  }
  const assoc = (negocio && negocio.associations) || {};
  const comAtividade = ATIVIDADES.filter(function (k) {
    const bloco = assoc[k] || assoc[k.replace(/s$/, '')] || null;
    return bloco && Array.isArray(bloco.results) && bloco.results.length > 0;
  });
  if (comAtividade.length) {
    return res.status(409).json({
      erro: 'Este negócio já tem ' + comAtividade.join(', ') + ' registrada(s) — arquivar levaria esse registro. Não arquivei nada.',
      motivo: 'tem-atividade'
    });
  }

  /* ── 5. arquiva (lixeira do HubSpot, restaurável por 90 dias) ───────────────────── */
  try {
    const r = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(String(dealId))}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok && r.status !== 404) {
      const txt = await r.text().catch(() => '');
      return res.status(502).json({ erro: 'O HubSpot recusou o arquivamento: ' + String(txt).slice(0, 180) });
    }
  } catch (e) {
    return res.status(502).json({ erro: 'Não consegui arquivar no HubSpot.' });
  }

  /* ── 6. a fila volta ao estado de antes ────────────────────────────────────────── */
  const limpou = await limparLead(supaUrl, supaService, leadId);
  return res.status(200).json({
    ok: true,
    nome: linha.nome || null,
    /* SE A FILA NÃO LIMPOU, A TELA PRECISA SABER: o negócio foi arquivado e a conta
       continuaria marcada como "já criada", sem botão de criar de novo. Erro nulo sem
       linha de volta já fez tela dizer "pronto" sobre tabela intacta. */
    filaLimpa: !!limpou
  });
};

/* Tira o `hubspot_deal_id` da linha, para a conta poder ser criada de novo. O status
   continua o que era: ela nunca deixou de ser conta do executivo. */
async function limparLead(supaUrl, supaService, leadId) {
  try {
    const r = await fetch(`${supaUrl}/rest/v1/leads_prospeccao?id=eq.${encodeURIComponent(String(leadId))}`, {
      method: 'PATCH',
      headers: {
        apikey: supaService, Authorization: `Bearer ${supaService}`,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify({ hubspot_deal_id: null, updated_at: new Date().toISOString() })
    });
    if (!r.ok) return false;
    const j = await r.json().catch(() => []);
    return Array.isArray(j) && j.length > 0;
  } catch (e) { return false; }
}
