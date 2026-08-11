// api/restaurantes-proximos.js
// Função serverless da Vercel — mesma arquitetura de segurança do criar-tarefa-rota.js.
//
// POR QUE ESTA ROTA EXISTE (Julyan, 12/08/26):
// A base de contas-alvo cobre 4 cidades (medido em 12/08: Vitória 111, Rio 89, Porto
// Alegre 56, Vila Velha 14). São Paulo tem ZERO; Bruno e Michel têm 6 cada no Rio.
// Resultado prático: o executivo abre a Rota & Agenda, o mapa está vazio, e não tem de
// onde montar plano. Isso resolve sem depender do sourcing pago mensal.
//
// POR QUE NO SERVIDOR E NÃO NO NAVEGADOR (testado em 12/08, não suposto):
//   fetch para overpass-api.de  -> "Failed to fetch" em 756ms (CORS bloqueado)
//   navegação direta na URL     -> 406 Not Acceptable (Apache recusa o Accept do Chrome)
//   espelho kumi.systems        -> travou o renderer do Chrome
// Do servidor não há CORS e dá pra mandar User-Agent/Accept adequados — que é o que
// faltava. De brinde, o resultado fica cacheado para o time todo.
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

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// Espelhos em ordem de preferência — REORDENADO em 11/08 com base em medição real:
// na sessão de validação, os 3 espelhos "clássicos" falharam em sequência e o
// maps.mail.ru respondeu (Campo Grande/RJ, 65 itens). Custo da ordem antiga: 62s de
// espera — a 1ms do limite de 60s da Vercel. Agora o que respondeu vai primeiro e o
// timeout caiu de 22s -> 8s por espelho: caso comum ~3s, pior caso ~32s (4 x 8s).
const ESPELHOS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

// Timeout por espelho, em ms. 8s: espelho saudável responde raio de 3km em 1-4s;
// se passou de 8s ele está sobrecarregado e insistir só queima o orçamento de 60s.
const TIMEOUT_ESPELHO_MS = 8000;

// ICP de food service. `amenity` cobre restaurante/bar/café; `shop` cobre padaria e
// confeitaria, que no Brasil é cliente Takeat tanto quanto restaurante.
function montarConsulta(lat, lng, raioMetros) {
  const A = '["amenity"~"^(restaurant|fast_food|cafe|bar|pub|ice_cream|food_court|biergarten)$"]';
  const S = '["shop"~"^(bakery|pastry|confectionery|deli|butcher)$"]';
  const volta = '(around:' + raioMetros + ',' + lat + ',' + lng + ')';
  // "out center tags" devolve coordenada mesmo para way/relation (polígono do prédio),
  // que é como muitos restaurantes maiores estão mapeados no OSM.
  // [timeout:8] fala pro PRÓPRIO servidor Overpass desistir em 8s — alinhado com o
  // abort do nosso lado. Sem isso, o espelho seguiria processando uma consulta que
  // ninguém vai mais ler.
  return '[out:json][timeout:8];(nwr' + A + volta + ';nwr' + S + volta + ';);out center tags;';
}

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = g => g * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const ROTULO_TIPO = {
  restaurant: 'Restaurante', fast_food: 'Lanchonete', cafe: 'Cafeteria', bar: 'Bar',
  pub: 'Bar', ice_cream: 'Sorveteria/Açaí', food_court: 'Praça de alimentação',
  biergarten: 'Bar', bakery: 'Padaria', pastry: 'Confeitaria',
  confectionery: 'Doceria', deli: 'Empório', butcher: 'Casa de carnes'
};

// Normaliza o elemento cru do OSM no formato que o cockpit já usa para conta-alvo.
function normalizar(el, lat, lng) {
  const t = (el && el.tags) || {};
  const coord = el.type === 'node' ? { lat: el.lat, lon: el.lon } : (el.center || {});
  if (coord.lat == null || coord.lon == null) return null;
  if (!t.name) return null; // sem nome não dá pra visitar: não entra
  const tipoBruto = t.amenity || t.shop || '';
  return {
    osm_id: el.type + '/' + el.id,
    nome: String(t.name).slice(0, 160),
    tipo: ROTULO_TIPO[tipoBruto] || tipoBruto || 'Food service',
    tipo_osm: tipoBruto,
    cozinha: t.cuisine ? String(t.cuisine).replace(/[;_]/g, ', ') : null,
    telefone: t.phone || t['contact:phone'] || t['contact:mobile'] || null,
    endereco: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ') || null,
    bairro: t['addr:suburb'] || t['addr:neighbourhood'] || null,
    cidade: t['addr:city'] || null,
    cep: t['addr:postcode'] || null,
    site: t.website || t['contact:website'] || null,
    horario: t.opening_hours || null,
    lat: Number(coord.lat),
    lng: Number(coord.lon),
    km: Math.round(distanciaKm(lat, lng, Number(coord.lat), Number(coord.lon)) * 100) / 100
  };
}

// Dedup: o OSM às vezes tem o node E o polígono do mesmo estabelecimento, o que viraria
// dois pinos em cima do outro.
function dedup(itens) {
  const vistos = new Set();
  return itens.filter(i => {
    const k = i.nome.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + i.lat.toFixed(4) + ',' + i.lng.toFixed(4);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

async function consultarOverpass(consulta) {
  const erros = [];
  for (const url of ESPELHOS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_ESPELHO_MS);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Sem User-Agent identificável a Overpass devolve 429/406 — é regra deles.
          'User-Agent': 'CockpitTakeatFieldSales/1.0 (julyan@takeat.com.br)',
          'Accept': 'application/json'
        },
        body: 'data=' + encodeURIComponent(consulta)
      });
      clearTimeout(timer);
      const host = url.split('/')[2];
      if (!resp.ok) { erros.push(host + ' -> HTTP ' + resp.status); continue; }
      const json = await resp.json();
      if (!json || !Array.isArray(json.elements)) { erros.push(host + ' -> resposta sem elements'); continue; }
      return { elements: json.elements, espelho: host, erros };
    } catch (e) {
      clearTimeout(timer);
      erros.push(url.split('/')[2] + ' -> ' + (e.name === 'AbortError' ? 'timeout ' + (TIMEOUT_ESPELHO_MS / 1000) + 's' : String(e.message || e).slice(0, 60)));
    }
  }
  return { elements: null, espelho: null, erros };
}

// Chave do cache = célula geográfica arredondada (3 casas ≈ 110m) + raio. Dois
// executivos atuando no mesmo bairro reaproveitam a mesma consulta.
function celulaCache(lat, lng, raio) {
  return Number(lat).toFixed(3) + ',' + Number(lng).toFixed(3) + ',' + raio;
}

async function lerCache(supaUrl, serviceKey, chave, validadeDias) {
  if (!serviceKey) return null;
  try {
    const limite = new Date(Date.now() - validadeDias * 86400000).toISOString();
    const url = supaUrl + '/rest/v1/restaurantes_osm?chave=eq.' + encodeURIComponent(chave)
      + '&buscado_em=gte.' + encodeURIComponent(limite) + '&select=itens,buscado_em&limit=1';
    const r = await fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
    if (!r.ok) return null;
    const rows = await r.json();
    const row = (rows || [])[0];
    return row && Array.isArray(row.itens) ? { itens: row.itens, buscadoEm: row.buscado_em } : null;
  } catch (e) { return null; }
}

async function gravarCache(supaUrl, serviceKey, chave, lat, lng, raio, itens) {
  if (!serviceKey) return;
  try {
    await fetch(supaUrl + '/rest/v1/restaurantes_osm?on_conflict=chave', {
      method: 'POST',
      headers: {
        apikey: serviceKey, Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ chave: chave, lat: lat, lng: lng, raio_m: raio, itens: itens, buscado_em: new Date().toISOString() }])
    });
  } catch (e) { /* cache é otimização: falhar aqui não invalida a resposta */ }
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
  const chave = celulaCache(nLat, nLng, raio);

  // ---- 3. cache primeiro (OSM muda devagar: 30 dias é conservador) ----
  const doCache = await lerCache(supaUrl, serviceKey, chave, 30);
  if (doCache) {
    return res.status(200).json({
      ok: true, origem: 'cache', buscadoEm: doCache.buscadoEm,
      total: doCache.itens.length, itens: doCache.itens,
      aviso: 'Dado do OpenStreetMap: sem nota e sem número de avaliações.'
    });
  }

  // ---- 4. Overpass ----
  const r = await consultarOverpass(montarConsulta(nLat, nLng, raio));
  if (!r.elements) {
    return res.status(502).json({
      erro: 'Nenhum espelho da Overpass respondeu agora. Tente de novo em alguns minutos.',
      detalhe: r.erros
    });
  }

  const itens = dedup(
    r.elements.map(el => normalizar(el, nLat, nLng)).filter(Boolean)
  ).sort((a, b) => a.km - b.km);

  await gravarCache(supaUrl, serviceKey, chave, nLat, nLng, raio, itens);

  return res.status(200).json({
    ok: true, origem: 'overpass', espelho: r.espelho,
    total: itens.length, itens: itens,
    aviso: 'Dado do OpenStreetMap: sem nota e sem número de avaliações.',
    cacheAtivo: !!serviceKey
  });
};
