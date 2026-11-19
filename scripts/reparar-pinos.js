// scripts/reparar-pinos.js
//
// REPARADOR DE PINOS PELO ROBÔ DO GITHUB (19/11/26).
//
// Por que aqui e não no Supabase: o Nominatim e o Photon respondem 403 a TODO pedido vindo dos
// servidores do Supabase (testado em 19/11). A função repair-client-geocodes de lá passou a tratar
// isso como "provedor indisponível" (PWA PR #2) e para sozinha — mas não repara nada. Do runner do
// GitHub os dois respondem 200. Então a parte de FORA (achar a coordenada) roda aqui, uma vez por dia.
//
// Decisão do Julyan (29/10/26): "repare os pinos mas sem gasto" — só provedores grátis (Photon e
// Nominatim, os dois sobre o mapa do OpenStreetMap). Google fica de fora.
//
// AS REGRAS (as mesmas da função do Supabase — mudar uma é mudar a outra):
//   - Só mexe em pino que se declara APROXIMADO (geo_approximate = true). Pino exato não é tocado.
//   - Só aceita resultado na MESMA cidade do cadastro e a menos de 60 km do ponto atual.
//   - Acertou a PORTA — o provedor devolveu o MESMO número pedido: move e marca preciso
//     (geo_approximate=false). Número diferente (o vizinho) ou estabelecimento sem número vale RUA.
//   - Acertou só a RUA: move, mas continua aproximado, e só quando o ponto atual é uma pilha de 3+
//     clientes (o centro da cidade) — rua certa é melhor que a praça da cidade; pino já espalhado fica.
//   - O flag decide o raio da prova de visita (200 m preciso × 500 m aproximado): nunca afirmar
//     precisão que ninguém conferiu.
//   - Toda tentativa vai para geocode_repair_attempts com last_reason começando por "gh:", e a posição
//     antiga em last_query ("de:lat,lon"), que é o que permite desfazer.
//
// Uso:
//   node scripts/reparar-pinos.js --seco            (padrão) mostra o que faria, não grava
//   node scripts/reparar-pinos.js --aplicar         grava (o agendamento roda este)
//   node scripts/reparar-pinos.js --limite 300      quantos pinos tentar nesta rodada (padrão 300)
//
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY (os mesmos segredos do robô diário).

const SUPA = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY;

function lerArgs(argv) {
  const a = { aplicar: false, limite: 300 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--aplicar') a.aplicar = true;
    else if (argv[i] === '--seco') a.aplicar = false;
    else if (argv[i] === '--limite') a.limite = Math.max(1, Number(argv[++i]) || 300);
  }
  return a;
}

const PRACAS = new Set(['RIO DE JANEIRO', 'NITEROI', 'VITORIA', 'VILA VELHA', 'SERRA', 'CARIACICA', 'SAO PAULO',
  'PORTO ALEGRE', 'FLORIANOPOLIS', 'BELO HORIZONTE']);
const UA = { 'User-Agent': 'TakeatClientMap-GeocodeRepair', Accept: 'application/json' };
const DIAS_ENTRE_TENTATIVAS = 14;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const semAcento = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const limpo = (v) => { const t = String(v ?? '').trim(); return t || null; };
function numeroLimpo(n) {
  const t = String(n ?? '').trim();
  if (/^s\/?n/i.test(t) || /^0+$/.test(t)) return null;
  const d = t.match(/\d+/);
  return d ? String(Number(d[0])) : null;
}
function km(a, b, c, d) {
  const R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function rest(caminho, opcoes) {
  const r = await fetch(SUPA + '/rest/v1/' + caminho, Object.assign({}, opcoes, {
    headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      (opcoes || {}).headers || {}),
  }));
  if (!r.ok) throw new Error('REST ' + r.status + ' em ' + caminho.split('?')[0] + ': ' + (await r.text()).slice(0, 200));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function lerTudo(caminho) {
  const out = [];
  for (let de = 0; de < 50000; de += 1000) {
    const lote = await rest(caminho, { headers: { Range: de + '-' + (de + 999), 'Range-Unit': 'items' } });
    out.push(...lote);
    if (lote.length < 1000) break;
  }
  return out;
}

/* ── níveis do acerto ─────────────────────────────────────────────────────────────────────────── */
function nivelPhoton(p) {
  const tipo = String(p?.type ?? '').toLowerCase(), chave = String(p?.osm_key ?? '').toLowerCase();
  if (p?.housenumber || tipo === 'house') return 'porta';
  if (['amenity', 'shop', 'office', 'building', 'tourism', 'leisure', 'craft', 'healthcare'].includes(chave)) return 'porta';
  if (tipo === 'street' || chave === 'highway') return 'rua';
  return 'impreciso';
}
function nivelNominatim(h) {
  const at = String(h?.addresstype ?? '').toLowerCase(), cl = String(h?.class ?? h?.category ?? '').toLowerCase(),
    ty = String(h?.type ?? '').toLowerCase();
  const imp = new Set(['city', 'town', 'village', 'municipality', 'county', 'state', 'region', 'country', 'postcode', 'suburb', 'neighbourhood']);
  if (imp.has(at) || imp.has(ty) || cl === 'boundary' || cl === 'place') return 'impreciso';
  if (h?.address?.house_number) return 'porta';
  if (['building', 'house', 'house_number', 'shop', 'amenity', 'office', 'tourism', 'leisure', 'craft', 'healthcare']
    .some((k) => k === at || k === cl || k === ty)) return 'porta';
  return 'rua';
}

/* Porta só com o número conferido: o provedor às vezes devolve o vizinho com toda a confiança. */
function nivelConferido(nivel, numeroDevolvido, numeroPedido) {
  if (nivel !== 'porta') return nivel;
  if (!numeroPedido) return 'rua';
  return numeroLimpo(numeroDevolvido) === numeroPedido ? 'porta' : 'rua';
}

async function pegar(url) {
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) return { falha: r.status };
    return { data: await r.json() };
  } catch (e) { return { falha: String(e.message || e) }; }
}
async function photon(rua, num, cid, uf) {
  const q = [[rua, num].filter(Boolean).join(' '), cid, uf].join(', ');
  const r = await pegar('https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=5&lang=default&bbox=-74,-34,-34,6');
  if (r.falha) return { falha: r.falha };
  const feats = (r.data?.features ?? []).filter((f) => semAcento(f?.properties?.city ?? f?.properties?.county) === semAcento(cid));
  const nv = (x) => nivelConferido(nivelPhoton(x.properties), x.properties?.housenumber, num);
  const f = feats.find((x) => nv(x) === 'porta') ?? feats.find((x) => nv(x) === 'rua') ?? feats[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon, nivel: nv(f), fonte: 'photon', q };
}
async function nominatim(rua, num, cid, uf) {
  const p = new URLSearchParams({ street: [num, rua].filter(Boolean).join(' '), city: cid, state: uf, country: 'Brasil',
    format: 'jsonv2', addressdetails: '1', limit: '3', countrycodes: 'br' });
  const r = await pegar('https://nominatim.openstreetmap.org/search?' + p);
  if (r.falha) return { falha: r.falha };
  const hits = (r.data ?? []).filter((h) => semAcento(h?.address?.city ?? h?.address?.town ?? h?.address?.municipality) === semAcento(cid));
  const nv = (x) => nivelConferido(nivelNominatim(x), x?.address?.house_number, num);
  const h = hits.find((x) => nv(x) === 'porta') ?? hits.find((x) => nv(x) === 'rua');
  if (!h) return null;
  return { lat: Number(h.lat), lon: Number(h.lon), nivel: nv(h), fonte: 'nominatim', q: p.get('street') + ', ' + cid };
}

/* Decide o que fazer com UM pino. Pura: recebe o que os provedores responderam. */
function decidir(lat0, lon0, pilha, res, falhou) {
  if (!res || res.nivel === 'impreciso') return falhou ? 'falha' : 'nada';
  if (km(lat0, lon0, res.lat, res.lon) > 60) return 'longe';
  if (res.nivel === 'porta') return 'porta';
  return pilha >= 3 ? 'rua' : 'fica';
}

async function main() {
  const a = lerArgs(process.argv.slice(2));
  if (!SUPA || !KEY) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_KEY.'); process.exit(1); }

  const todos = await lerTudo('clients?select=id,endereco,numero,cidade,estado,latitude,longitude,geo_approximate&latitude=not.is.null&order=id');
  const pilha = new Map();
  for (const c of todos) { const k = c.latitude + ',' + c.longitude; pilha.set(k, (pilha.get(k) || 0) + 1); }

  const tentativas = await lerTudo('geocode_repair_attempts?select=client_id,last_attempt_at&last_reason=like.gh:*');
  const corte = Date.now() - DIAS_ENTRE_TENTATIVAS * 864e5;
  const recente = new Set(tentativas.filter((t) => new Date(t.last_attempt_at).getTime() > corte).map((t) => t.client_id));

  const fila = todos
    .filter((c) => c.geo_approximate === true && limpo(c.endereco) && limpo(c.cidade) && limpo(c.estado) && !recente.has(c.id))
    .map((c) => ({ c, praca: PRACAS.has(semAcento(c.cidade)), n: pilha.get(c.latitude + ',' + c.longitude) || 1 }))
    .sort((x, y) => (y.praca - x.praca) || (y.n - x.n));
  const rodada = fila.slice(0, a.limite);

  console.log((a.aplicar ? 'APLICANDO' : 'ENSAIO (nada gravado)') + ' · aproximados na fila: ' + fila.length +
    ' (' + fila.filter((x) => x.praca).length + ' nas praças do Field) · nesta rodada: ' + rodada.length);

  const conta = { porta: 0, rua: 0, fica: 0, longe: 0, nada: 0, falha: 0, gravados: 0 };
  let falhasSeguidas = 0;
  for (let i = 0; i < rodada.length; i++) {
    const { c, n } = rodada[i];
    const rua = limpo(c.endereco), num = numeroLimpo(c.numero), cid = limpo(c.cidade), uf = limpo(c.estado);
    const lat0 = Number(c.latitude), lon0 = Number(c.longitude);

    let res = await photon(rua, num, cid, uf);
    let falhou = res && res.falha ? res.falha : null;
    if (falhou) res = null;
    if (!res || res.nivel !== 'porta') {
      await sleep(1100);
      const nom = await nominatim(rua, num, cid, uf);
      if (nom && nom.falha) falhou = falhou || nom.falha;
      else if (nom && (!res || (nom.nivel === 'porta' && res.nivel !== 'porta'))) res = nom;
    }
    const decisao = decidir(lat0, lon0, n, res, falhou);
    conta[decisao]++;

    if (decisao === 'falha') {
      // provedor fora do ar: NÃO grava tentativa (o pino segue na fila); três seguidas param a rodada
      if (++falhasSeguidas >= 3) { console.log('Provedor fora do ar (' + falhou + '): rodada interrompida.'); break; }
    } else {
      falhasSeguidas = 0;
      if (a.aplicar) {
        const move = decisao === 'porta' || decisao === 'rua';
        if (move) {
          await rest('clients?id=eq.' + c.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
            latitude: res.lat, longitude: res.lon, geo_source: res.fonte, geo_approximate: decisao !== 'porta',
            updated_at: new Date().toISOString() }) });
          conta.gravados++;
        }
        await rest('geocode_repair_attempts?on_conflict=client_id', { method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({
            client_id: c.id, attempts: 1, last_attempt_at: new Date().toISOString(),
            last_status: move ? 'repaired' : 'skipped', last_reason: 'gh:' + decisao + (res ? ':' + res.fonte : ''),
            last_query: 'de:' + lat0 + ',' + lon0 + (res ? ' q:' + res.q : ''), last_error: null,
            last_repaired_at: move ? new Date().toISOString() : null }) });
      }
    }
    if ((i + 1) % 50 === 0) console.log('  ' + (i + 1) + '/' + rodada.length + ' ' + JSON.stringify(conta));
    await sleep(400);
  }
  console.log('FIM ' + JSON.stringify(conta));
  console.log('  porta = movido e preciso · rua = movido, segue aproximado · fica = acertou só a rua e o pino já');
  console.log('  não estava empilhado · longe/nada = não mexe · falha = provedor fora do ar (segue na fila)');
}

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });
module.exports = { decidir, nivelPhoton, nivelNominatim, nivelConferido, numeroLimpo, semAcento };
