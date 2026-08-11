// lib/osm.js
// Lógica compartilhada de consulta ao OpenStreetMap (Overpass).
//
// POR QUE ESTE ARQUIVO EXISTE (11/08):
// Duas coisas diferentes consultam a Overpass agora:
//   1) api/restaurantes-proximos.js  -> ao vivo, quando o executivo escolhe onde atuar
//   2) scripts/prewarm-osm.js        -> de madrugada, enchendo o cache das praças fixas
// Se cada um tivesse sua própria cópia de "montar consulta / normalizar / gerar chave de
// cache", bastaria uma divergir para o robô gravar num formato que o endpoint não acha —
// e o pré-aquecimento silenciosamente pararia de servir para nada. Fonte única aqui.
//
// Vercel inclui requires relativos no bundle da função serverless. Precedente já em
// produção neste repo: api/restaurantes-proximos.js requer '../data/usuarios.json'.

// Espelhos em ordem de preferência — REORDENADO em 11/08 com base em medição real:
// na sessão de validação os 3 espelhos "clássicos" falharam em sequência e o
// maps.mail.ru respondeu (Campo Grande/RJ, 65 itens). Custo da ordem antiga: 62s de
// espera — a 1s do limite de 60s da Vercel. Agora o que respondeu vai primeiro.
const ESPELHOS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

// Timeout por espelho no caminho AO VIVO. 8s: espelho saudável responde raio de 3km em
// 1-4s; se passou de 8s ele está sobrecarregado e insistir só queima o orçamento de 60s
// da Vercel. Pior caso 4 x 8s = 32s, com folga.
const TIMEOUT_AO_VIVO_MS = 8000;

// O robô roda no GitHub Actions, onde não existe o teto de 60s. Pode ser paciente: varre
// raio maior e prefere esperar a falhar, porque cada acerto aqui é um executivo que de
// dia não espera nada.
const TIMEOUT_ROBO_MS = 120000;

// ICP de food service. `amenity` cobre restaurante/bar/café; `shop` cobre padaria e
// confeitaria, que no Brasil é cliente Takeat tanto quanto restaurante.
function montarConsulta(lat, lng, raioMetros, timeoutSegundos) {
  const A = '["amenity"~"^(restaurant|fast_food|cafe|bar|pub|ice_cream|food_court|biergarten)$"]';
  const S = '["shop"~"^(bakery|pastry|confectionery|deli|butcher)$"]';
  const volta = '(around:' + raioMetros + ',' + lat + ',' + lng + ')';
  // O [timeout:N] manda o PRÓPRIO servidor Overpass desistir junto com o nosso abort.
  // Sem isso o espelho segue processando uma consulta que ninguém vai mais ler.
  const t = Math.max(5, Math.round(timeoutSegundos || 8));
  // "out center tags" devolve coordenada mesmo para way/relation (polígono do prédio),
  // que é como muitos restaurantes maiores estão mapeados no OSM.
  return '[out:json][timeout:' + t + '];(nwr' + A + volta + ';nwr' + S + volta + ';);out center tags;';
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

// Recalcula distância e recorta a lista para um centro DIFERENTE do que foi consultado.
// É isso que permite reaproveitar um cache de 6km do robô para um pedido de 3km em outro
// ponto do bairro — sem isso o executivo veria "km" errado na tela.
function recortarPara(itens, lat, lng, raioMetros) {
  return itens
    .map(i => Object.assign({}, i, {
      km: Math.round(distanciaKm(lat, lng, Number(i.lat), Number(i.lng)) * 100) / 100
    }))
    .filter(i => i.km * 1000 <= raioMetros)
    .sort((a, b) => a.km - b.km);
}

async function consultarOverpass(consulta, timeoutMs) {
  const erros = [];
  const limite = timeoutMs || TIMEOUT_AO_VIVO_MS;
  for (const url of ESPELHOS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), limite);
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
      erros.push(url.split('/')[2] + ' -> ' + (e.name === 'AbortError' ? 'timeout ' + (limite / 1000) + 's' : String(e.message || e).slice(0, 60)));
    }
  }
  return { elements: null, espelho: null, erros };
}

// Chave do cache = célula geográfica arredondada (3 casas ≈ 110m) + raio.
// ATENÇÃO: robô e endpoint precisam gerar a chave EXATAMENTE igual. Se mudar o
// arredondamento aqui, todo o cache pré-aquecido vira inalcançável de uma vez.
function celulaCache(lat, lng, raio) {
  return Number(lat).toFixed(3) + ',' + Number(lng).toFixed(3) + ',' + raio;
}

const HEADERS_SERVICE = k => ({
  apikey: k, Authorization: 'Bearer ' + k,
  'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
});

async function gravarCache(supaUrl, serviceKey, chave, lat, lng, raio, itens) {
  if (!serviceKey) return false;
  try {
    const r = await fetch(supaUrl + '/rest/v1/restaurantes_osm?on_conflict=chave', {
      method: 'POST',
      headers: HEADERS_SERVICE(serviceKey),
      body: JSON.stringify([{
        chave: chave, lat: lat, lng: lng, raio_m: raio,
        itens: itens, buscado_em: new Date().toISOString()
      }])
    });
    return r.ok;
  } catch (e) { return false; } // cache é otimização: falhar aqui não invalida a resposta
}

module.exports = {
  ESPELHOS, TIMEOUT_AO_VIVO_MS, TIMEOUT_ROBO_MS,
  montarConsulta, distanciaKm, normalizar, dedup, recortarPara,
  consultarOverpass, celulaCache, gravarCache
};
