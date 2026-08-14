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

// BLOCO 49 (14/08/26) — Julyan: "o executivo tem que conseguir adicionar no hub na
// etapa prospecção as contas alvo". Antes TODA criação caía em Backlog e alguém tinha
// que mover à mão depois (na prática, ninguém movia — o Backlog virou depósito). Agora
// o cliente diz em qual etapa nasce; Backlog segue sendo o padrão pra quem não disser,
// então o RPA e qualquer chamada antiga continuam funcionando igual.
const ETAPAS_DE_ENTRADA = ['1396007427', '1395880469']; // Backlog, Prospecção

// Mesma fronteira da rota mudar-etapa-negocio: só estas props podem ser escritas daqui.
const PROPS_PERMITIDAS = ['celular', 'cep', 'bairro', 'cidade', 'logradouro', 'numero',
  'amount', 'valor_de_mrr', 'data_da_reuniao', 'reuniao_agendada'];
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

// usuarios.json vai junto no deploy (require com caminho estático é empacotado pela Vercel).
// Formato real do arquivo: { _comment, usuarios: [...] } — não é um array direto.
let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // ajuste para o domínio do cockpit se quiser travar mais
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  // FAIL-CLOSED (correção de segurança 06/08/26): antes, se SUPABASE_URL/ANON_KEY
  // faltassem na Vercel, a checagem de sessão era PULADA (fail-open) e qualquer pessoa
  // podia criar negócios no HubSpot chamando esta rota direto. Agora, sem as três
  // variáveis de ambiente a rota se recusa a operar.
  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão Supabase válida + QUEM está chamando (sempre obrigatório) ----
  // Não precisa de chave de admin: valida o token do próprio usuário contra o endpoint
  // público /auth/v1/user, do jeito que o Supabase recomenda para esse caso.
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

  // ---- 2. papel de quem chamou (usuarios.json é a fonte, igual ao atualizar-mrr) ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  }

  // ---- 3. dados do lead, validados ----
  const { nome, ownerId, telefone, endereco, bairro, cidade, tipo, nota, avaliacoes, etapa, propriedades } = req.body || {};
  if (!nome || !ownerId) {
    return res.status(400).json({ erro: 'Faltam campos obrigatórios: nome e ownerId.' });
  }
  const etapaEntrada = etapa ? String(etapa) : STAGE_BACKLOG;
  if (!ETAPAS_DE_ENTRADA.includes(etapaEntrada)) {
    return res.status(400).json({ erro: 'Etapa de entrada inválida — um negócio novo só pode nascer em Backlog ou Prospecção.' });
  }
  const limpeza = limparPropriedades(propriedades);
  if (limpeza.erro) return res.status(400).json({ erro: limpeza.erro });

  // Escopo por papel: executivo só cria negócio atribuído A ELE MESMO; gestor pode
  // atribuir a qualquer executivo. (Antes qualquer sessão podia criar em nome de qualquer um.)
  if (usuario.role !== 'manager' && String(ownerId) !== String(usuario.ownerId)) {
    return res.status(403).json({ erro: 'Executivo só pode criar negócio atribuído a si mesmo — peça ao gestor para atribuir a outro dono.' });
  }

  // Deal não tem campo próprio de telefone/endereço neste portal — vai tudo na descrição,
  // igual um humano preencheria à mão.
  const linhas = [
    telefone ? `Telefone: ${telefone}` : null,
    (endereco || bairro || cidade) ? `Endereço: ${[endereco, bairro, cidade].filter(Boolean).join(' — ')}` : null,
    tipo ? `Tipo: ${tipo}` : null,
    (nota != null && avaliacoes != null) ? `Google: ${nota} · ${avaliacoes} avaliações` : null,
    `Origem: conta-alvo — criado pelo cockpit direto em ${etapaEntrada === STAGE_BACKLOG ? 'Backlog' : 'Prospecção'}.`
  ].filter(Boolean);

  try {
    const resp = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          ...limpeza.propriedades,
          dealname: nome,
          pipeline: PIPELINE_FIELD_SALES,
          dealstage: etapaEntrada,
          hubspot_owner_id: String(ownerId),
          description: linhas.join('\n')
        }
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ erro: data.message || 'HubSpot recusou a criação.', detalhe: data });
    }
    return res.status(200).json({
      ok: true, id: data.id, etapa: etapaEntrada,
      propriedadesGravadas: Object.keys(limpeza.propriedades),
      url: `https://app.hubspot.com/contacts/24373118/record/0-3/${data.id}`
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};
