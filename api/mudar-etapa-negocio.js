// api/mudar-etapa-negocio.js
// Função serverless da Vercel — mesma arquitetura de api/criar-tarefa-rota.js: o
// navegador nunca conhece o HUBSPOT_TOKEN; manda dealId + a etapa nova + o token de
// sessão do Supabase, e esta rota valida tudo antes de escrever no HubSpot.
//
// Objetivo (Julyan, 14/08/26): "o executivo tem que poder limpar o lead... pelo
// cockpit... e registrar automaticamente no HubSpot". Este arquivo cobre a parte de
// AVANÇAR/VOLTAR ETAPA — só entre as 6 etapas ABERTAS do funil (Prospecção → Ag.
// Pagamento). Marcar como Perdido/Reciclagem ficou fora de propósito nesta rodada
// (o Julyan pediu só "avançar/voltar de etapa" quando perguntado — não os dois
// caminhos de saída do funil). Se um dia isso mudar, é uma rota nova, não esta.
//
// Variáveis de ambiente na Vercel: HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY.

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// Mesma ordem canônica usada em todo o resto do cockpit (ORDEM_ETAPAS_FUNIL /
// ORDEM_FUNIL_FICHA no template) — repetida aqui só pra VALIDAR que a etapa pedida é
// uma das 6 abertas; nunca decide nada sozinha, é apenas a lista de permitidas.
const ETAPAS_ABERTAS = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473'];

// BLOCO 49 (14/08/26) — Julyan: "as propriedades de cada etapa tem que ser mantida".
// O HubSpot só exige propriedade de etapa DENTRO da tela dele; pela API o dealstage
// muda sem pedir nada — que é como o cockpit e o PWA escrevem. Por isso o funil tinha
// negócio em Pagamento sem MRR. Agora o cockpit manda as propriedades junto com a
// etapa, e esta lista é a fronteira: qualquer prop fora dela é RECUSADA, pra que uma
// tela comprometida não consiga escrever em campo arbitrário do CRM.
// Espelho de PROPS_GRAVAVEIS no template — mudou lá, muda aqui.
const PROPS_PERMITIDAS = ['celular', 'cep', 'bairro', 'cidade', 'logradouro', 'numero',
  'amount', 'valor_de_mrr', 'data_da_reuniao', 'reuniao_agendada', 'description'];

// Piso comercial do time (R$349/mês, regra do Julyan) validado TAMBÉM no servidor: a
// checagem do navegador é conveniência, esta é a que vale.
const PISO_VALOR = 349;
const PROPS_COM_PISO = ['amount', 'valor_de_mrr'];

function limparPropriedades(bruto) {
  if (!bruto || typeof bruto !== 'object') return { propriedades: {}, erro: null };
  const propriedades = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (!PROPS_PERMITIDAS.includes(chave)) {
      return { propriedades: null, erro: `Propriedade não permitida por esta rota: "${chave}".` };
    }
    if (valor == null || String(valor).trim() === '') continue;
    const texto = String(valor).trim();
    if (PROPS_COM_PISO.includes(chave)) {
      const n = Number(texto);
      if (!isFinite(n) || n <= 0) return { propriedades: null, erro: `Valor inválido em "${chave}".` };
      if (n < PISO_VALOR) return { propriedades: null, erro: `"${chave}" abaixo do piso de R$${PISO_VALOR}.` };
      propriedades[chave] = String(n);
      continue;
    }
    if (chave === 'reuniao_agendada' && texto !== 'true' && texto !== 'false') {
      return { propriedades: null, erro: 'reuniao_agendada só aceita true ou false.' };
    }
    if (texto.length > 2000) return { propriedades: null, erro: `"${chave}" é longo demais.` };
    propriedades[chave] = texto;
  }
  return { propriedades, erro: null };
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

  // ---- 1. sessão Supabase válida (mesmo padrão de criar-tarefa-rota.js) ----
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
  const { dealId, ownerId, novaEtapa, propriedades } = req.body || {};
  if (!dealId || !novaEtapa) return res.status(400).json({ erro: 'Faltam campos obrigatórios: dealId e novaEtapa.' });
  if (!ETAPAS_ABERTAS.includes(String(novaEtapa))) {
    return res.status(400).json({ erro: 'Etapa inválida — só é possível mover entre as etapas abertas do funil por aqui.' });
  }

  // Escopo por papel: executivo só edita negócio que é dele; gestor edita qualquer um.
  // ownerId vem do próprio negócio (mandado pelo cliente pra permitir a checagem sem
  // uma consulta extra ao HubSpot) — não é usado pra decidir NADA além de permissão.
  if (usuario.role !== 'manager' && ownerId != null && String(ownerId) !== String(usuario.ownerId)) {
    return res.status(403).json({ erro: 'Você só pode mudar a etapa dos seus próprios negócios.' });
  }

  const limpeza = limparPropriedades(propriedades);
  if (limpeza.erro) return res.status(400).json({ erro: limpeza.erro });

  try {
    // Etapa e propriedades no MESMO PATCH de propósito: se fossem duas chamadas e a
    // segunda falhasse, o negócio ficaria na etapa nova sem os dados que a etapa exige
    // — exatamente o buraco que este bloco existe pra fechar. Uma escrita, tudo ou nada.
    const resp = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { ...limpeza.propriedades, dealstage: String(novaEtapa) } })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({ erro: 'HubSpot recusou a mudança de etapa: ' + (data.message || 'sem mensagem'), detalhe: data });
    }
    return res.status(200).json({
      ok: true, id: dealId, novaEtapa: String(novaEtapa),
      propriedadesGravadas: Object.keys(limpeza.propriedades),
      url: `https://app.hubspot.com/contacts/24373118/record/0-3/${dealId}`
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};
