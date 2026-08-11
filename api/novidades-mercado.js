// api/novidades-mercado.js
// Empresas de foodservice ABERTAS RECENTEMENTE na praça de cada executivo (Casa dos Dados).
//
// POR QUE ESTA ROTA EXISTE (Julyan, 11/08):
// Todo o resto do cockpit olha para dentro — HubSpot e Supabase, o que o time já tocou.
// Restaurante que abriu semana passada não está em lugar nenhum desses. E é o lead com
// a melhor janela que existe: ainda não escolheu sistema de PDV, ainda não assinou com
// concorrente, e o dono está comprando tudo ao mesmo tempo.
//
// Nota deliberada sobre a régua: aqui NÃO se busca "mais bem avaliado". Avaliação alta
// significa estabelecimento maduro — que quase sempre já tem fornecedor e contrato. O
// valor desta fonte é o oposto: quem acabou de abrir.
//
// Variáveis de ambiente:
//   SUPABASE_URL, SUPABASE_ANON_KEY   -> validação de sessão (obrigatórias, fail-closed)
//   SUPABASE_SERVICE_KEY              -> cache (opcional; sem ela funciona sem cache)
//   CASADOSDADOS_TOKEN                -> chave da API (obrigatória para esta rota)

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// CNAEs de foodservice — o ICP da Takeat. Sem este filtro a busca devolve qualquer
// empresa aberta na cidade e o executivo vira triador de lista, não vendedor.
const CNAE_FOODSERVICE = [
  '5611201', // Restaurantes e similares
  '5611202', // Bares e outros estabelecimentos, com entretenimento
  '5611203', // Lanchonetes, casas de chá, de sucos e similares
  '5611204', // Bares e outros estabelecimentos, sem entretenimento
  '5620104', // Fornecimento de alimentos preparados para consumo domiciliar
  '4721102', // Padaria e confeitaria com predominância de revenda
  '1091102'  // Padaria e confeitaria com predominância de produção própria
];

const CASA_URL = 'https://api.casadosdados.com.br/v2/public/cnpj/search';

function isoDiasAtras(dias) {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

// Normaliza o registro cru da Casa dos Dados no formato que o cockpit já usa para lead.
// Os nomes de campo variam conforme a versão da API, então cada um tem alternativas —
// preferir undefined a inventar valor: campo vazio na tela é honesto, campo errado não.
function normalizar(e) {
  const pega = (...chaves) => {
    for (const k of chaves) {
      const v = k.split('.').reduce((o, p) => (o == null ? o : o[p]), e);
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return null;
  };
  const cnpj = pega('cnpj', 'cnpj_completo', 'cnpj_raiz');
  if (!cnpj) return null;
  const nome = pega('nome_fantasia', 'razao_social') || 'Sem nome';
  const logradouro = pega('logradouro', 'endereco.logradouro');
  const numero = pega('numero', 'endereco.numero');
  return {
    cnpj: cnpj,
    nome: nome.slice(0, 160),
    razaoSocial: pega('razao_social'),
    dataAbertura: pega('data_abertura', 'data_inicio_atividade'),
    cnae: pega('cnae_fiscal', 'atividade_principal.codigo', 'cnae_principal'),
    atividade: pega('cnae_fiscal_descricao', 'atividade_principal.descricao'),
    endereco: [logradouro, numero].filter(Boolean).join(', ') || null,
    bairro: pega('bairro', 'endereco.bairro'),
    municipio: pega('municipio', 'endereco.municipio', 'cidade'),
    uf: pega('uf', 'endereco.uf'),
    cep: pega('cep', 'endereco.cep'),
    telefone: pega('telefone_1', 'telefone', 'ddd_telefone_1'),
    capital: pega('capital_social')
  };
}

function chaveCache(municipio, uf, dias) {
  return String(municipio || '').toLowerCase().trim() + '|' + String(uf || '').toUpperCase().trim() + '|' + dias;
}

async function lerCache(supaUrl, serviceKey, chave, validadeHoras) {
  if (!serviceKey) return null;
  try {
    const limite = new Date(Date.now() - validadeHoras * 3600000).toISOString();
    const url = supaUrl + '/rest/v1/novidades_mercado?chave=eq.' + encodeURIComponent(chave)
      + '&buscado_em=gte.' + encodeURIComponent(limite) + '&select=itens,buscado_em&limit=1';
    const r = await fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
    if (!r.ok) return null;
    const row = (await r.json() || [])[0];
    return row && Array.isArray(row.itens) ? { itens: row.itens, buscadoEm: row.buscado_em } : null;
  } catch (e) { return null; }
}

async function gravarCache(supaUrl, serviceKey, chave, itens) {
  if (!serviceKey) return;
  try {
    await fetch(supaUrl + '/rest/v1/novidades_mercado?on_conflict=chave', {
      method: 'POST',
      headers: {
        apikey: serviceKey, Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ chave: chave, itens: itens, buscado_em: new Date().toISOString() }])
    });
  } catch (e) { /* cache é otimização: falhar aqui não invalida a resposta */ }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || null;
  const casaToken = process.env.CASADOSDADOS_TOKEN || null;
  if (!supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração (SUPABASE_URL e SUPABASE_ANON_KEY obrigatórios).' });
  }
  if (!casaToken) {
    return res.status(500).json({
      etapa: 'config',
      erro: 'CASADOSDADOS_TOKEN não está configurada na Vercel — sem ela não dá para consultar novidades de mercado.'
    });
  }

  // ---- 1. sessão válida (fail-closed, mesmo padrão das outras rotas) ----
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  let emailLogado = null;
  try {
    const check = await fetch(supaUrl + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + sessionToken, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado.' });
  if (USUARIOS.length && !USUARIOS.some(u => String(u.email).toLowerCase() === emailLogado)) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  }

  // ---- 2. parâmetros ----
  const body = req.body || {};
  const municipio = String(body.municipio || '').trim();
  const uf = String(body.uf || '').trim().toUpperCase();
  if (!municipio || !uf) return res.status(400).json({ erro: 'municipio e uf são obrigatórios.' });
  // Teto de 180 dias: acima disso "recém-aberto" deixa de ser verdade e a janela some.
  const dias = Math.min(Math.max(Number(body.dias) || 60, 7), 180);
  const chave = chaveCache(municipio, uf, dias);

  // ---- 3. cache (12h: CNPJ novo não aparece de hora em hora, e cada consulta gasta crédito) ----
  const doCache = await lerCache(supaUrl, serviceKey, chave, 12);
  if (doCache) {
    return res.status(200).json({
      ok: true, origem: 'cache', buscadoEm: doCache.buscadoEm,
      total: doCache.itens.length, itens: doCache.itens
    });
  }

  // ---- 4. Casa dos Dados ----
  // Consulta paga por crédito: 1 chamada por praça a cada 12h, nunca por tecla digitada.
  //
  // AUTENTICAÇÃO EM CASCATA (11/08): a primeira tentativa com o header `api-key` voltou
  // 403 com corpo VAZIO — sintoma de formato de autenticação recusado, não de crédito
  // acabado (que traz mensagem). A documentação da Casa dos Dados já mudou de formato
  // entre versões, então em vez de chutar uma variação por deploy, tenta as conhecidas
  // em sequência e RELATA qual passou. Para no primeiro 2xx.
  //
  // O custo disso é zero em crédito: 401/403 não consomem consulta. Assim que soubermos
  // qual vale, dá pra fixar só ela — o campo `autenticacaoQueFuncionou` na resposta é
  // exatamente esse recado.
  const variantes = [
    { nome: 'header api-key', headers: { 'api-key': casaToken } },
    { nome: 'header api_key', headers: { 'api_key': casaToken } },
    { nome: 'header Authorization Bearer', headers: { Authorization: 'Bearer ' + casaToken } },
    { nome: 'header x-api-key', headers: { 'x-api-key': casaToken } }
  ];

  try {
    const corpoConsulta = JSON.stringify({
        query: {
          termo: [],
          atividade_principal: CNAE_FOODSERVICE,
          municipio: [municipio],
          uf: [uf],
          situacao_cadastral: 'ATIVA',
          data_abertura_inicio: isoDiasAtras(dias),
          data_abertura_fim: isoDiasAtras(0)
        },
        range_query: {},
        extras: { somente_mei: false, excluir_mei: false, com_telefone: false },
        page: 1,
        limit: 100
      });

    let resp = null, json = null, usada = null;
    const tentativas = [];
    for (const v of variantes) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const r = await fetch(CASA_URL, {
          method: 'POST',
          signal: ctrl.signal,
          headers: Object.assign({ 'Content-Type': 'application/json' }, v.headers),
          body: corpoConsulta
        });
        clearTimeout(timer);
        // Lê como TEXTO primeiro: a resposta de erro deles às vezes vem em HTML, e
        // .json() engoliria a única pista útil que existe.
        const texto = await r.text();
        let j = null;
        try { j = JSON.parse(texto); } catch (e) { j = null; }
        tentativas.push({
          via: v.nome, http: r.status,
          corpo: (j && (j.message || j.erro || j.detail || j.error)) || (texto ? texto.slice(0, 220) : '(vazio)')
        });
        if (r.ok) { resp = r; json = j || {}; usada = v.nome; break; }
      } catch (e) {
        clearTimeout(timer);
        tentativas.push({ via: v.nome, http: null, corpo: String(e.message || e).slice(0, 120) });
      }
    }

    if (!resp) {
      return res.status(502).json({
        etapa: 'casadosdados',
        erro: 'Nenhum formato de autenticação foi aceito pela Casa dos Dados.',
        // Cada linha diz o que aquele formato respondeu — é o que permite corrigir
        // sem mais um ciclo de tentativa e erro.
        tentativas: tentativas
      });
    }

    // A resposta pode vir em .data.cnpj, .cnpj ou .data — cada versão da API muda isso.
    const cru = (json && (
      (json.data && (json.data.cnpj || json.data.cnpjs || json.data.results)) ||
      json.cnpj || json.results || (Array.isArray(json.data) ? json.data : null)
    )) || [];
    if (!Array.isArray(cru)) {
      return res.status(502).json({
        etapa: 'formato',
        erro: 'Resposta da Casa dos Dados veio num formato inesperado — o cockpit não sabe onde estão os registros.',
        chavesRecebidas: Object.keys(json || {})
      });
    }

    const itens = cru.map(normalizar).filter(Boolean)
      // Mais novo primeiro: a janela de oportunidade encolhe a cada dia que passa.
      .sort((a, b) => String(b.dataAbertura || '').localeCompare(String(a.dataAbertura || '')));

    await gravarCache(supaUrl, serviceKey, chave, itens);

    return res.status(200).json({
      ok: true, origem: 'casadosdados', municipio: municipio, uf: uf, dias: dias,
      autenticacaoQueFuncionou: usada,
      total: itens.length, itens: itens
    });
  } catch (e) {
    const abortou = e && e.name === 'AbortError';
    return res.status(abortou ? 504 : 500).json({
      etapa: 'casadosdados',
      erro: abortou ? 'Casa dos Dados demorou mais de 20s para responder.' : 'Falha ao falar com a Casa dos Dados: ' + String(e.message || e)
    });
  }
};
