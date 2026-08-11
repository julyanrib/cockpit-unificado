// api/restaurantes-proximos.js
// Função serverless da Vercel — mesma arquitetura de segurança do criar-tarefa-rota.js.
//
// POR QUE ESTA ROTA EXISTE (Julyan, 11/08):
// A base de contas-alvo cobre 4 cidades (Vitória 111, Rio 89, Porto Alegre 56, Vila
// Velha 14). São Paulo tem ZERO; Bruno e Michel têm 6 cada no Rio. Resultado prático: o
// executivo abre a Rota & Agenda, o mapa está vazio, e não tem de onde montar plano.
// Isso resolve sem depender do sourcing pago mensal.
//
// POR QUE NO SERVIDOR E NÃO NO NAVEGADOR (testado, não suposto):
//   fetch para overpass-api.de  -> "Failed to fetch" em 756ms (CORS bloqueado)
//   navegação direta na URL     -> 406 Not Acceptable (Apache recusa o Accept do Chrome)
//   espelho kumi.systems        -> travou o renderer do Chrome
// Do servidor não há CORS e dá pra mandar User-Agent/Accept adequados. De brinde, o
// resultado fica cacheado para o time todo.
//
// LIMITE HONESTO (a tela precisa dizer isso ao executivo):
// OpenStreetMap NÃO tem nota nem número de avaliações. Tem nome, categoria, telefone
// (quando alguém preencheu), rua, número e CEP. Serve para "portas para bater perto de
// mim", não para "as melhores da praça" — esse ranking depende de Google/Outscraper,
// que é pago.
//
// Variáveis de ambiente (as mesmas das outras rotas):
//   SUPABASE_URL, SUPABASE_ANON_KEY   -> validação de sessão (obrigatórias)
//   SUPABASE_SERVICE_KEY              -> cache (opcional; sem ela funciona sem cache)

const osm = require('../lib/osm.js');

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// Cache aceito por até 30 dias: OSM muda devagar, e o robô renova aos 21 dias, então na
// prática nenhuma praça pré-aquecida chega perto de vencer.
const VALIDADE_DIAS = 30;

// ---------------------------------------------------------------------------
// CAMADA 1 — cache pela chave exata (mesmo ponto, mesmo raio).
// ---------------------------------------------------------------------------
async function lerCacheExato(supaUrl, serviceKey, chave) {
  if (!serviceKey) return null;
  try {
    const limite = new Date(Date.now() - VALIDADE_DIAS * 86400000).toISOString();
    const url = supaUrl + '/rest/v1/restaurantes_osm?chave=eq.' + encodeURIComponent(chave)
      + '&buscado_em=gte.' + encodeURIComponent(limite) + '&select=itens,buscado_em&limit=1';
    const r = await fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
    if (!r.ok) return null;
    const row = (await r.json() || [])[0];
    return row && Array.isArray(row.itens) ? { itens: row.itens, buscadoEm: row.buscado_em } : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// CAMADA 2 — cache por COBERTURA. Esta é a peça que faz o pré-aquecimento valer.
//
// O PROBLEMA: a chave do cache é a célula de ~110m. O executivo digita um endereço no
// autocomplete e cai numa coordenada qualquer do bairro — quase nunca na MESMA célula
// que o robô aqueceu. Só com a Camada 1, o cache pré-aquecido praticamente nunca seria
// encontrado e o robô das 23:59 seria trabalho jogado fora.
//
// A CONTA: uma busca já feita no centro C com raio R contém todo ponto a até R de C.
// Logo, o pedido do executivo (ponto P, raio r) está inteiramente coberto quando
//     dist(P, C) + r <= R
// Se está coberto, é matematicamente o mesmo resultado — só falta recortar para o raio
// pedido e recalcular o "km" a partir de P (senão a distância na tela sai errada).
// O robô aquece com R=6km e o pedido padrão é r=3km: 3km de folga em volta do âncora.
// ---------------------------------------------------------------------------
async function lerCachePorCobertura(supaUrl, serviceKey, lat, lng, raio) {
  if (!serviceKey) return null;
  try {
    const limite = new Date(Date.now() - VALIDADE_DIAS * 86400000).toISOString();
    // Caixa de busca grosseira só pra não varrer a tabela: o raio máximo aceito é 8km,
    // então nenhum centro que possa cobrir este ponto está a mais de 8km daqui. A conta
    // de contenção de verdade é feita abaixo, em JS.
    const grauLat = 8 / 111;
    const grauLng = 8 / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    const url = supaUrl + '/rest/v1/restaurantes_osm'
      + '?lat=gte.' + (lat - grauLat) + '&lat=lte.' + (lat + grauLat)
      + '&lng=gte.' + (lng - grauLng) + '&lng=lte.' + (lng + grauLng)
      + '&raio_m=gte.' + raio // um cache menor que o pedido não pode cobri-lo
      + '&buscado_em=gte.' + encodeURIComponent(limite)
      + '&select=itens,buscado_em,lat,lng,raio_m&order=buscado_em.desc&limit=20';
    const r = await fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return null;

    const cobre = rows.find(row => {
      if (!Array.isArray(row.itens)) return false;
      const d = osm.distanciaKm(lat, lng, Number(row.lat), Number(row.lng)) * 1000;
      return d + raio <= Number(row.raio_m);
    });
    if (!cobre) return null;

    return {
      itens: osm.recortarPara(cobre.itens, lat, lng, raio),
      buscadoEm: cobre.buscado_em,
      centroKm: Math.round(osm.distanciaKm(lat, lng, Number(cobre.lat), Number(cobre.lng)) * 100) / 100,
      raioOrigemKm: Number(cobre.raio_m) / 1000
    };
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  // FAIL-CLOSED, mesmo padrão das outras rotas.
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || null;
  if (!supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração (SUPABASE_URL e SUPABASE_ANON_KEY obrigatórios).' });
  }

  // ---- 1. sessão válida ----
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
  const nLat = Number(body.lat), nLng = Number(body.lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    return res.status(400).json({ erro: 'lat e lng são obrigatórios e numéricos.' });
  }
  // Guarda-corpo: coordenada fora do Brasil é erro de digitação, não busca legítima.
  if (nLat < -34 || nLat > 6 || nLng < -74 || nLng > -33) {
    return res.status(400).json({ erro: 'Coordenada fora do Brasil — confira o ponto de atuação.' });
  }
  // Teto de 8km: acima disso a Overpass fica lenta e deixa de ser rota de um dia.
  const raio = Math.round(Math.min(Math.max(Number(body.raioKm) || 3, 0.5), 8) * 1000);
  const chave = osm.celulaCache(nLat, nLng, raio);
  const AVISO = 'Dado do OpenStreetMap: sem nota e sem número de avaliações.';

  // ---- 3. cache exato ----
  const exato = await lerCacheExato(supaUrl, serviceKey, chave);
  if (exato) {
    return res.status(200).json({
      ok: true, origem: 'cache', buscadoEm: exato.buscadoEm,
      total: exato.itens.length, itens: exato.itens, aviso: AVISO
    });
  }

  // ---- 4. cache por cobertura (praça pré-aquecida pelo robô das 23:59) ----
  const coberto = await lerCachePorCobertura(supaUrl, serviceKey, nLat, nLng, raio);
  if (coberto) {
    return res.status(200).json({
      ok: true, origem: 'cache-regiao', buscadoEm: coberto.buscadoEm,
      total: coberto.itens.length, itens: coberto.itens, aviso: AVISO,
      // Diagnóstico: dá pra ver na resposta que veio de praça aquecida e de qual raio.
      reaproveitado: { distanciaDoCentroKm: coberto.centroKm, raioOrigemKm: coberto.raioOrigemKm }
    });
  }

  // ---- 5. Overpass ao vivo (praça fora das pré-aquecidas, ou raio maior que o do robô) ----
  const r = await osm.consultarOverpass(
    osm.montarConsulta(nLat, nLng, raio, 8),
    osm.TIMEOUT_AO_VIVO_MS
  );
  if (!r.elements) {
    return res.status(502).json({
      erro: 'Nenhum espelho da Overpass respondeu agora. Tente de novo em alguns minutos.',
      detalhe: r.erros
    });
  }

  const itens = osm.dedup(
    r.elements.map(el => osm.normalizar(el, nLat, nLng)).filter(Boolean)
  ).sort((a, b) => a.km - b.km);

  await osm.gravarCache(supaUrl, serviceKey, chave, nLat, nLng, raio, itens);

  return res.status(200).json({
    ok: true, origem: 'overpass', espelho: r.espelho,
    total: itens.length, itens: itens, aviso: AVISO,
    cacheAtivo: !!serviceKey
  });
};
