// api/importar-leads.js — Etapa 4 (Prospecção)
// Recebe um lote de leads já raspados (Outscraper, Google Places, Firecrawl/iFood,
// Firecrawl/TripAdvisor — qualquer fonte no mesmo formato normalizado) e grava na área
// de staging (tabela leads_prospeccao). NUNCA cria Company/Deal aqui — isso só acontece
// depois, quando algém confirma manualmente em api/criar-empresa-prospeccao.js.
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

const FONTES_ROTULO = {
  outscraper: 'Outscraper', google_places: 'Google Places',
  tripadvisor: 'Tripadvisor', ifood: 'iFood', manual: 'Manual',
  // BLOCO 14 (12/08/26): a Casa dos Dados vira fonte de primeira classe. Antes so dava
  // pra importar como "manual", o que apagava a origem e, pior, caia no corte de
  // qualidade padrao -- ver FONTES_SEM_AVALIACAO logo abaixo.
  casa_dos_dados: 'Casa dos Dados'
};

// Fontes cujo lead NAO PODE ter avaliacao, por definicao. Uma empresa que abriu ha dez
// dias nao tem 100 avaliacoes no Google -- nao e lead ruim, e lead novo, e e exatamente
// o que queremos atacar: restaurante recem-aberto ainda nao escolheu sistema. Aplicar o
// corte de volume aqui reprovaria 100% da Casa dos Dados, e foi por isso que nada dela
// chegou na fila de Prospeccao. O corte continua valendo integralmente para Outscraper,
// Google Places, TripAdvisor e iFood, onde a ausencia de avaliacao indica de fato
// estabelecimento fraco ou cadastro sujo.
const FONTES_SEM_AVALIACAO = new Set(['casa_dos_dados']);

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

function normalizarTelefone(tel) {
  if (!tel) return null;
  let digitos = String(tel).replace(/\D/g, '');
  // A mesma linha costuma vir como +55 27... no Tripadvisor e 27... no iFood.
  // Normaliza o DDI brasileiro para que fontes diferentes não virem duas contas.
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) digitos = digitos.slice(2);
  return digitos.length >= 8 ? digitos : null;
}

function normalizarTexto(valor) {
  return String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// A nota não define fit comercial. O único corte de potencial é volume de avaliações.
// Ainda assim, uma categoria explicitamente fora de foodservice não pode entrar na fila
// só por ter muitas avaliações (ex.: monumento, hostel ou shopping). Fontes verticais
// como iFood/Tripadvisor podem vir sem categoria e continuam válidas.
const CATEGORIAS_FORA_FOODSERVICE = new Set([
  'hostel', 'hotel', 'lodging', 'monument', 'museu', 'park', 'tourist attraction',
  'shopping', 'shopping mall', 'store', 'supermarket', 'grocery store', 'pharmacy',
  'school', 'university', 'hospital', 'gym'
]);
function fazSentidoFoodservice(lead) {
  const categoria = normalizarTexto(lead.categoria);
  const nome = normalizarTexto(lead.nome);
  const nomeEvidenciaFoodservice = /\b(restaurante|restaurant|cafe|cafeteria|bar|pub|bistro|burger|hamburg|pizza|pizzaria|churrasc|lanch|doceria|padaria|confeitaria|cozinha|cantina|choperia|grill|comida|food|sushi|temakeria|sorvet|acai)\b/.test(nome);
  if (nomeEvidenciaFoodservice) return true;
  return !categoria || !CATEGORIAS_FORA_FOODSERVICE.has(categoria);
}

function distanciaKm(a, b) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const rad = x => Number(x) * Math.PI / 180;
  const dLat = rad(Number(b.lat) - Number(a.lat));
  const dLng = rad(Number(b.lng) - Number(a.lng));
  const lat1 = rad(a.lat), lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function mesmoRestaurante(a, b) {
  if (a.place_id && b.place_id && String(a.place_id) === String(b.place_id)) return true;
  const telA = normalizarTelefone(a.telefone_normalizado || a.telefone);
  const telB = normalizarTelefone(b.telefone_normalizado || b.telefone);
  if (telA && telB && telA === telB) return true;
  const mesmoNomeCidade = normalizarTexto(a.nome) && normalizarTexto(a.nome) === normalizarTexto(b.nome) &&
    normalizarTexto(a.cidade) === normalizarTexto(b.cidade);
  if (!mesmoNomeCidade) return false;
  const endA = normalizarTexto(a.endereco), endB = normalizarTexto(b.endereco);
  if (endA && endB && endA === endB) return true;
  const bairroA = normalizarTexto(a.bairro), bairroB = normalizarTexto(b.bairro);
  if (bairroA && bairroB && bairroA === bairroB) return true;
  return distanciaKm(a, b) <= 0.15;
}

function juntarFontes(a, b) {
  const fontes = [...String(a || '').split('+'), ...String(b || '').split('+')]
    .map(x => x.trim()).filter(Boolean);
  return [...new Set(fontes)].join(' + ');
}

// Não soma avaliações de plataformas: Outscraper pode representar o mesmo Google
// Places. Mantém o maior volume confiável e a nota ligada a esse volume.
function mesclarRestaurante(base, novo) {
  const novoTemMaisImpacto = (Number(novo.avaliacoes) || 0) > (Number(base.avaliacoes) || 0);
  return {
    fonte: juntarFontes(base.fonte, novo.fonte),
    place_id: base.place_id || novo.place_id || null,
    categoria: base.categoria || novo.categoria || null,
    endereco: base.endereco || novo.endereco || null,
    bairro: base.bairro || novo.bairro || null,
    estado: base.estado || novo.estado || null,
    telefone: base.telefone || novo.telefone || null,
    telefone_normalizado: base.telefone_normalizado || novo.telefone_normalizado || null,
    nota: novoTemMaisImpacto ? novo.nota : base.nota,
    avaliacoes: novoTemMaisImpacto ? novo.avaliacoes : base.avaliacoes,
    lat: base.lat != null ? base.lat : novo.lat,
    lng: base.lng != null ? base.lng : novo.lng,
    presencial: base.presencial !== false || novo.presencial !== false,
    delivery: !!base.delivery || !!novo.delivery,
    horario_funcionamento: base.horario_funcionamento || novo.horario_funcionamento || null,
    ja_existe_hubspot: !!base.ja_existe_hubspot || !!novo.ja_existe_hubspot,
    updated_at: new Date().toISOString()
  };
}

// ---- Roteamento por território (mesma regra do time de campo) ----
// Lead entra no staging JÁ com o executivo certo. Cidade/bairro fora do mapa
// de território fica 'pendente' sem dono — o gestor decide, nada de chute.
// Porto Alegre: rotação Kelly/Ricardo fica pra quando o Ricardo tiver owner ID
// no HubSpot; até lá, POA e Canoas vão pra Kelly.
function semAcento(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// Rotas oficiais passadas pelo Julyan em 10/08/2026:
//   Marco→Vila Velha · Amanda→Vitória · Whell→Zona Sul de SP · Michel→Campo Grande/RJ
//   Bruno→Taquara/Jacarepaguá · Sandro→Tijuca · Kelly→POA+Canoas · Ricardo→POA.
// Nova Iguaçu saiu do mapa do Michel nesta rodada. O split POA Kelly/Ricardo entra
// quando o Ricardo tiver owner ID real no HubSpot (hoje: 'pendente_ricardo2') —
// até lá POA inteira roteia pra Kelly, e o gestor reatribui na ficha se quiser.
const TERRITORIOS = [
  { owner: '86100505', nome: 'Marco Filho', teste: t => t.includes('vila velha') },
  { owner: '87069181', nome: 'Amanda Pardim', teste: t => t.includes('vitoria') },
  { owner: '87569072', nome: 'Sandro Linhares', teste: t => t.includes('tijuca') },
  { owner: '86100506', nome: 'Bruno Martins', teste: t => t.includes('taquara') || t.includes('jacarepagua') || (t.includes('rio de janeiro') && /\banil\b/.test(t)) },
  { owner: '94079973', nome: 'Michel Carvalho', teste: t => t.includes('campo grande') && !t.includes('campo grande - ms') },
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

  // Régua oficial: somente volume de avaliações. Nota é contexto, nunca corte nem
  // desempate. O mínimo pode ser ajustado por lote, sempre com relatório explícito.
  const semCorteDeAvaliacao = FONTES_SEM_AVALIACAO.has(fonte);
  const qualidade = {
    avaliacoesMin: (req.body.qualidade && req.body.qualidade.avaliacoesMin != null)
      ? Number(req.body.qualidade.avaliacoesMin)
      : (semCorteDeAvaliacao ? 0 : 100)
  };

  const linhasTodas = leads.map(l => {
    const cidade = l.cidade || l.city || '';
    const bairro = l.bairro || null;
    // Dono: explícito no lead (l.responsavel_owner_id) vence; senão, roteia por território.
    const dono = l.responsavel_owner_id ? String(l.responsavel_owner_id) : rotearTerritorio(cidade, bairro);
    return {
    place_id: l.place_id || null,
    fonte: FONTES_ROTULO[fonte],
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

  // Atencao ao `== null`: para as fontes normais, avaliacao ausente E reprovacao (o
  // lead veio sem o dado que define o corte). Para a Casa dos Dados a ausencia e o
  // estado esperado, entao so reprova se vier um numero abaixo do minimo.
  const reprovadosQualidade = linhasTodas.filter(l =>
    semCorteDeAvaliacao
      ? (l.avaliacoes != null && Number(l.avaliacoes) < qualidade.avaliacoesMin)
      : (l.avaliacoes == null || Number(l.avaliacoes) < qualidade.avaliacoesMin)
  );
  const reprovadosFit = linhasTodas.filter(l => !fazSentidoFoodservice(l));
  const linhas = linhasTodas.filter(l =>
    !reprovadosQualidade.includes(l) && !reprovadosFit.includes(l)
  );

  if (linhas.length === 0) {
    const soQualidade = linhasTodas.length > 0 && reprovadosQualidade.length === linhasTodas.length;
    return res.status(400).json({
      erro: soQualidade
        ? `Nenhuma conta passou pela régua de impacto (avaliações >= ${qualidade.avaliacoesMin}; a nota não influencia).`
        : 'Nenhum restaurante válido no lote (precisa de nome, cidade, avaliações mínimas e categoria compatível com foodservice).',
      reprovados_qualidade: reprovadosQualidade.length,
      reprovados_fit: reprovadosFit.length
    });
  }

  // Carrega a base canônica para deduplicar também entre fontes diferentes. Falha
  // fechada: se n�>s dar para conferir a base, não importa e não arrisca duplicar.
  let existentes = [];
  try {
    // Pagina toda a base: o limite padrão do PostgREST não pode transformar uma
    // conta antiga em "nova" só porque ela ficou fora da primeira página.
    const tamanhoPagina = 1000;
    for (let offset = 0; ; offset += tamanhoPagina) {
      const respExistentes = await fetch(`${supaUrl}/rest/v1/leads_prospeccao?select=id,place_id,fonte,nome,categoria,endereco,bairro,cidade,estado,telefone,telefone_normalizado,nota,avaliacoes,lat,lng,presencial,delivery,horario_funcionamento,ja_existe_hubspot&limit=${tamanhoPagina}&offset=${offset}`, {
        headers: { apikey: supaService, Authorization: `Bearer ${supaService}` }
      });
      if (!respExistentes.ok) throw new Error((await respExistentes.text()).slice(0, 200));
      const pagina = await respExistentes.json();
      existentes.push(...pagina);
      if (pagina.length < tamanhoPagina) break;
    }
  } catch (e) {
    return res.status(502).json({ erro: 'Não foi possível conferir duplicidades antes da importação. Nada foi gravado: ' + String(e.message || e) });
  }

  const novas = [];
  const mesclas = new Map();
  const resultado = {
    inseridos: 0, duplicados: 0, mesclados: 0, erros: [], duplicados_exemplos: [],
    reprovados_qualidade: reprovadosQualidade.length,
    reprovados_fit: reprovadosFit.length,
    regra_qualidade: `avaliações >= ${qualidade.avaliacoesMin}; nota não influencia`,
    reprovados_exemplos: reprovadosQualidade.slice(0, 10).map(l => `${l.nome} (${l.avaliacoes ?? '?'} avaliações)`),
    reprovados_fit_exemplos: reprovadosFit.slice(0, 10).map(l => `${l.nome} (${l.categoria || 'sem categoria'})`)
  };
  linhas.forEach(l => {
    const existente = existentes.find(x => mesmoRestaurante(x, l));
    if (existente) {
      resultado.duplicados++;
      if (resultado.duplicados_exemplos.length < 10) resultado.duplicados_exemplos.push(`${l.nome} (${l.fonte} → ${existente.fonte})`);
      const camposMesclados = mesclarRestaurante(existente, l);
      Object.assign(existente, camposMesclados);
      mesclas.set(existente.id, camposMesclados);
      return;
    }
    const indiceNoLote = novas.findIndex(x => mesmoRestaurante(x, l));
    if (indiceNoLote >= 0) {
      resultado.duplicados++;
      if (resultado.duplicados_exemplos.length < 10) resultado.duplicados_exemplos.push(`${l.nome} (repetido no próprio lote)`);
      novas[indiceNoLote] = { ...novas[indiceNoLote], ...mesclarRestaurante(novas[indiceNoLote], l) };
      return;
    }
    novas.push(l);
  });

  // Enriquece o registro já existente com a nova fonte e com os melhores dados,
  // preservando owner, status e histórico comercial.
  const pendentesMescla = [...mesclas.entries()];
  for (let i = 0; i < pendentesMescla.length; i += 20) {
    const loteMescla = pendentesMescla.slice(i, i + 20);
    const respostas = await Promise.all(loteMescla.map(([id, campos]) => fetch(`${supaUrl}/rest/v1/leads_prospeccao?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { apikey: supaService, Authorization: `Bearer ${supaService}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(campos)
    })));
    respostas.forEach(resp => { if (resp.ok) resultado.mesclados++; else resultado.erros.push('Falha ao enriquecer um registro existente.'); });
  }

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

