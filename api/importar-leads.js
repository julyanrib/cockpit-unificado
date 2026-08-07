// api/importar-leads.js — Etapa 4 (Prospecção)
// Recebe um lote de leads já raspados (Outscraper, Google Places, Firecrawl/iFood,
// Firecrawl/TripAdvisor — qualquer fonte no mesmo formato normalizado) e grava na área
// de staging (tabela leads_prospeccao). NUNCA cria Company/Deal aqui — isso só acontece
// depois, quando alguém confirma manualmente em api/criar-empresa-prospeccao.js.
//
// Dois jeitos de chamar esta rota, os dois seguros (nenhum token de fonte externa
// aparece no navegador):
//   1. Sessão do gestor logado no cockpit (Authorization: Bearer <token supabase>).
//   2. Um webhook/automação server-to-server (ex.: Make.com) com o header
//      x-import-secret == process.env.IMPORT_SECRET — pensado pra quando o Outscraper
//      (ou um cenário do Make) empurrar dados direto, sem passar pelo navegador de ninguém.
//
// Variáveis de ambiente novas: IMPORT_SECRET (string qualquer, só você e o Make sabem).

const { montarDadosCompletos } = require('../scripts/montar-dados.js');

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

function normalizarTelefone(tel) {
  if (!tel) return null;
  const digitos = String(tel).replace(/\D/g, '');
  return digitos.length >= 8 ? digitos : null;
}

// ---- Roteamento por território (mesma regra do time de campo) ----
// Lead entra no staging JÁ com o executivo certo. Cidade/bairro fora do mapa
// de território fica 'pendente' sem dono — o gestor decide, nada de chute.
// Porto Alegre: rotação Kelly/Ricardo fica pra quando o Ricardo tiver owner ID
// no HubSpot; até lá, POA e Canoas vão pra Kelly.
function semAcento(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
const TERRITORIOS = [
  { owner: '86100505', nome: 'Marco Filho', teste: t => t.includes('vila velha') },
  { owner: '87069181', nome: 'Amanda Pardim', teste: t => t.includes('vitoria') },
  { owner: '87569072', nome: 'Sandro Linhares', teste: t => t.includes('tijuca') },
  { owner: '94079973', nome: 'Michel Andrade', teste: t => t.includes('nova iguacu') || t.includes('campo grande') },
  { owner: '89842507', nome: 'Wericles Andrade', teste: t => t.includes('sao paulo') },
  { owner: '91477292', nome: 'Kelly Travieso', teste: t => t.includes('canoas') || t.includes('porto alegre') }
];
function rotearTerritorio(cidade, bairro) {
  const chave = semAcento(cidade) + ' ' + semAcento(bairro);
  const acerto = TERRITORIOS.find(x => x.teste(chave));
  return acerto ? acerto.owner : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-import-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const supaService = process.env.SUPABASE_SERVICE_KEY;
  const importSecret = process.env.IMPORT_SECRET;
  if (!supaUrl || !supaAnon || !supaService) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY são obrigatórios).' });
  }

  let criadoPor = null;
  const secretRecebido = req.headers['x-import-secret'];
  if (importSecret && secretRecebido && secretRecebido === importSecret) {
    criadoPor = 'automacao-importacao';
  } else {
    const auth = req.headers.authorization || '';
    const sessionToken = auth.replace(/^Bearer\s+/i, '');
    if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão e sem segredo de importação válido.' });
    try {
      const check = await fetch(`${supaUrl}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
      });
      if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
      const user = await check.json();
      const email = (user && user.email) ? String(user.email).toLowerCase() : null;
      const usuario = email ? USUARIOS.find(u => String(u.email).toLowerCase() === email) : null;
      if (!usuario || usuario.role !== 'manager') {
        return res.status(403).json({ erro: 'Só o gestor pode importar leads pela sessão do cockpit.' });
      }
      criadoPor = usuario.email;
    } catch (e) {
      return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
    }
  }

  const { fonte, leads } = req.body || {};
  if (!fonte || !['outscraper', 'google_places', 'tripadvisor', 'ifood', 'manual'].includes(fonte)) {
    return res.status(400).json({ erro: 'Campo "fonte" inválido — use outscraper, google_places, tripadvisor, ifood ou manual.' });
  }
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ erro: 'Envie "leads" como array com pelo menos 1 item.' });
  }
  if (leads.length > 500) {
    return res.status(400).json({ erro: 'Máximo 500 leads por importação — divida em lotes menores.' });
  }

  let nomesNoHubspot = new Set();
  try {
    const completo = montarDadosCompletos();
    Object.values(completo.funilLeads || {}).forEach(lista => (lista || []).forEach(l => l.name && nomesNoHubspot.add(l.name.toLowerCase().trim())));
    (completo.temperatura.quentes || []).forEach(l => l.name && nomesNoHubspot.add(l.name.toLowerCase().trim()));
    (completo.temperatura.frios || []).forEach(l => l.name && nomesNoHubspot.add(l.name.toLowerCase().trim()));
  } catch (e) { /* dedup best-effort */ }

  // Filtro de qualidade (regra do playbook: nota >= 4.2 E >= 100 avaliações).
  // Pode ser afrouxado por importação via body.qualidade, mas nunca silenciosamente:
  // o resultado reporta quantos foram descartados e por quê.
  const qualidade = {
    notaMin: (req.body.qualidade && req.body.qualidade.notaMin != null) ? Number(req.body.qualidade.notaMin) : 4.2,
    avaliacoesMin: (req.body.qualidade && req.body.qualidade.avaliacoesMin != null) ? Number(req.body.qualidade.avaliacoesMin) : 100
  };

  const linhasTodas = leads.map(l => {
    const cidade = l.cidade || l.city || '';
    const bairro = l.bairro || null;
    // Dono: explícito no lead (l.responsavel_owner_id) vence; senão, roteia por território.
    const dono = l.responsavel_owner_id ? String(l.responsavel_owner_id) : rotearTerritorio(cidade, bairro);
    return {
    place_id: l.place_id || null,
    fonte,
    nome: String(l.nome || l.name || '').trim(),
    categoria: l.categoria || null,
    endereco: l.endereco || l.address || null,
    bairro,
    cidade,
    estado: l.estado || l.state || null,
    telefone: l.telefone || l.phone_number || null,
    telefone_normalizado: normalizarTelefone(l.telefone || l.phone_number),
    nota: l.nota != null ? l.nota : (l.rating != null ? l.rating : null),
    avaliacoes: l.avaliacoes != null ? l.avaliacoes : (l.rating_count != null ? l.rating_count : null),
    lat: l.lat != null ? l.lat : (l.latitude != null ? l.latitude : null),
    lng: l.lng != null ? l.lng : (l.longitude != null ? l.longitude : null),
    presencial: l.presencial !== false,
    delivery: !!l.delivery,
    horario_funcionamento: Array.isArray(l.weekday_hours) ? l.weekday_hours.join(' | ') : (l.horario_funcionamento || null),
    ja_existe_hubspot: nomesNoHubspot.has(String(l.nome || l.name || '').toLowerCase().trim()),
    responsavel_owner_id: dono,
    status: dono ? 'atribuido' : 'pendente',
    criado_por: criadoPor
    };
  }).filter(l => l.nome && l.cidade);

  const reprovadosQualidade = linhasTodas.filter(l =>
    (l.nota != null && l.nota < qualidade.notaMin) ||
    (l.avaliacoes != null && l.avaliacoes < qualidade.avaliacoesMin)
  );
  const linhas = linhasTodas.filter(l => !reprovadosQualidade.includes(l));

  if (linhas.length === 0) {
    return res.status(400).json({ erro: 'Nenhum lead válido no lote (precisa de nome e cidade).' });
  }

  const placeIds = linhas.map(l => l.place_id).filter(Boolean);
  const telefones = linhas.map(l => l.telefone_normalizado).filter(Boolean);
  const existentes = { place_id: new Set(), telefone_normalizado: new Set() };
  async function carregarExistentes(campo, valores) {
    if (valores.length === 0) return;
    const resp = await fetch(`${supaUrl}/rest/v1/leads_prospeccao?select=${campo}&${campo}=in.(${valores.map(v => encodeURIComponent(v)).join(',')})`, {
      headers: { apikey: supaService, Authorization: `Bearer ${supaService}` }
    });
    if (resp.ok) (await resp.json()).forEach(r => existentes[campo].add(r[campo]));
  }
  await carregarExistentes('place_id', placeIds);
  await carregarExistentes('telefone_normalizado', telefones);

  const novas = [];
  const resultado = {
    inseridos: 0, duplicados: 0, erros: [],
    reprovados_qualidade: reprovadosQualidade.length,
    regra_qualidade: `nota >= ${qualidade.notaMin} e avaliações >= ${qualidade.avaliacoesMin}`,
    reprovados_exemplos: reprovadosQualidade.slice(0, 10).map(l => `${l.nome} (nota ${l.nota ?? '?'} · ${l.avaliacoes ?? '?'} avaliações)`)
  };
  linhas.forEach(l => {
    const jaTem = (l.place_id && existentes.place_id.has(l.place_id)) ||
      (l.telefone_normalizado && existentes.telefone_normalizado.has(l.telefone_normalizado));
    if (jaTem) resultado.duplicados++; else novas.push(l);
  });

  if (novas.length > 0) {
    try {
      const resp = await fetch(`${supaUrl}/rest/v1/leads_prospeccao`, {
        method: 'POST',
        headers: {
          apikey: supaService, Authorization: `Bearer ${supaService}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify(novas)
      });
      if (!resp.ok) {
        const texto = await resp.text();
        return res.status(502).json({ erro: 'Supabase recusou a importação: ' + texto.slice(0, 300), parcial: resultado });
      }
      resultado.inseridos = novas.length;
      // Distribuição por executivo — pra conferir o roteamento de território no ato
      resultado.distribuicao = {};
      novas.forEach(l => {
        const chave = l.responsavel_owner_id || 'pendente_sem_dono';
        resultado.distribuicao[chave] = (resultado.distribuicao[chave] || 0) + 1;
      });
    } catch (e) {
      return res.status(500).json({ erro: 'Falha ao gravar no Supabase: ' + String(e.message || e), parcial: resultado });
    }
  }

  return res.status(200).json(resultado);
};
