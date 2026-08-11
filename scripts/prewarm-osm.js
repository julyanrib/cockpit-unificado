#!/usr/bin/env node
// scripts/prewarm-osm.js
// Pré-aquece o cache de estabelecimentos OSM das praças fixas de cada executivo.
//
// O PROBLEMA QUE ISTO RESOLVE (medido em 11/08, não suposto):
// A 1ª consulta a uma praça nova levou 62 SEGUNDOS ao vivo — a 1s do limite de 60s da
// função serverless da Vercel, e tempo nenhum que alguém em campo aceita olhando tela
// branca. A 2ª consulta, já em cache, levou 504ms.
// Conclusão: o problema não é a consulta, é QUEM paga por ela. Aqui o robô da madrugada
// paga; de dia o executivo sempre pega os 504ms.
//
// POR QUE NÃO CHAMA api/restaurantes-proximos.js:
// Aquele endpoint exige sessão Supabase de um usuário logado (fail-closed, de propósito)
// e vive dentro do teto de 60s da Vercel. O robô não tem sessão e não tem pressa — fala
// direto com a Overpass e grava no Supabase com a service key, usando a MESMA lib para
// gerar chave e formato idênticos ao que o endpoint espera ler.
//
// SEGURO RODAR NAS DUAS RODADAS (23:59 e 08:59): âncora com cache fresco é PULADO sem
// gastar consulta. Então a rodada das 08:59 custa quase nada e serve de segunda tentativa
// para o que tiver falhado de madrugada.
//
// Variáveis de ambiente:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  -> obrigatórias (sem elas não há cache pra encher)

const path = require('path');
const osm = require(path.join(__dirname, '..', 'lib', 'osm.js'));
const CONFIG = require(path.join(__dirname, '..', 'data', 'regioes-prewarm.json'));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Intervalo entre consultas reais. Os espelhos da Overpass são gratuitos e mantidos por
// voluntários; 11 consultas em rajada é o tipo de coisa que rende bloqueio de IP. 3s
// entre elas é educado e não muda nada pra quem roda de madrugada.
const PAUSA_ENTRE_CONSULTAS_MS = 3000;

const espera = ms => new Promise(r => setTimeout(r, ms));

// Lê o cache pela chave exata, só para decidir "preciso renovar este âncora?".
async function idadeDoCacheEmDias(chave) {
  try {
    const url = SUPABASE_URL + '/rest/v1/restaurantes_osm?chave=eq.' + encodeURIComponent(chave)
      + '&select=buscado_em,itens&limit=1';
    const r = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } });
    if (!r.ok) return null;
    const row = (await r.json() || [])[0];
    if (!row || !row.buscado_em) return null;
    const dias = (Date.now() - new Date(row.buscado_em).getTime()) / 86400000;
    return { dias: dias, total: Array.isArray(row.itens) ? row.itens.length : 0 };
  } catch (e) { return null; }
}

async function aquecer(ancora, raioKm, renovarApos) {
  const raio = Math.round(raioKm * 1000);
  const chave = osm.celulaCache(ancora.lat, ancora.lng, raio);
  const rotulo = ancora.cobre || ancora.id;

  const atual = await idadeDoCacheEmDias(chave);
  if (atual && atual.dias < renovarApos) {
    console.log('  = ' + rotulo + '\n      já fresco (' + atual.dias.toFixed(1) + ' dias, '
      + atual.total + ' estabelecimentos) — pulando sem gastar consulta.');
    return { status: 'fresco', total: atual.total };
  }

  const t0 = Date.now();
  const consulta = osm.montarConsulta(ancora.lat, ancora.lng, raio, 90);
  const r = await osm.consultarOverpass(consulta, osm.TIMEOUT_ROBO_MS);
  const seg = ((Date.now() - t0) / 1000).toFixed(1);

  if (!r.elements) {
    console.log('  ✗ ' + rotulo + '\n      nenhum espelho respondeu em ' + seg + 's: ' + r.erros.join(' | '));
    return { status: 'falhou', total: 0 };
  }

  const itens = osm.dedup(
    r.elements.map(el => osm.normalizar(el, ancora.lat, ancora.lng)).filter(Boolean)
  ).sort((a, b) => a.km - b.km);

  const gravou = await osm.gravarCache(SUPABASE_URL, SERVICE_KEY, chave, ancora.lat, ancora.lng, raio, itens);
  if (!gravou) {
    console.log('  ✗ ' + rotulo + '\n      Overpass respondeu ' + itens.length + ' itens mas o Supabase recusou a gravação.');
    return { status: 'falhou', total: itens.length };
  }

  const comTelefone = itens.filter(i => i.telefone).length;
  console.log('  ✓ ' + rotulo + '\n      ' + itens.length + ' estabelecimentos (' + comTelefone
    + ' com telefone) em ' + seg + 's via ' + r.espelho);
  return { status: 'aquecido', total: itens.length, segundos: Number(seg) };
}

(async function main() {
  console.log('=== Pré-aquecimento do cache OSM das praças de campo ===');

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log('SUPABASE_URL e SUPABASE_SERVICE_KEY não estão definidas — sem elas não há');
    console.log('cache pra encher. Pulando o pré-aquecimento (o endpoint continua funcionando');
    console.log('ao vivo, só mais lento na primeira consulta de cada praça).');
    process.exit(0);
  }

  const raioKm = Number(CONFIG.raio_km_padrao) || 6;
  const renovarApos = Number(CONFIG.renovar_apos_dias) || 21;
  const ancoras = Array.isArray(CONFIG.ancoras) ? CONFIG.ancoras : [];

  if (!ancoras.length) {
    console.log('data/regioes-prewarm.json não tem âncoras. Nada a fazer.');
    process.exit(0);
  }

  console.log(ancoras.length + ' praças | raio ' + raioKm + 'km | renova após ' + renovarApos + ' dias');
  console.log('(o endpoint aceita cache de até 30 dias; renovar aos ' + renovarApos + ' garante que');
  console.log('nenhum executivo cai numa consulta ao vivo por cache vencido no meio do dia)\n');

  const resumo = { aquecido: 0, fresco: 0, falhou: 0 };
  let consultasReais = 0;

  for (const a of ancoras) {
    if (!Number.isFinite(Number(a.lat)) || !Number.isFinite(Number(a.lng))) {
      console.log('  ✗ ' + (a.id || '?') + ' — lat/lng inválidos no JSON, pulando.');
      resumo.falhou++;
      continue;
    }
    // Pausa só antes de consulta REAL: pular âncora fresco não precisa de intervalo.
    if (consultasReais > 0) await espera(PAUSA_ENTRE_CONSULTAS_MS);

    const antes = consultasReais;
    const r = await aquecer(
      { id: a.id, lat: Number(a.lat), lng: Number(a.lng), cobre: a.cobre },
      Number(a.raio_km) || raioKm,
      renovarApos
    );
    resumo[r.status] = (resumo[r.status] || 0) + 1;
    if (r.status !== 'fresco') consultasReais = antes + 1;
  }

  console.log('\n--- Resumo ---');
  console.log('aquecidos agora: ' + resumo.aquecido + ' | já frescos: ' + resumo.fresco + ' | falharam: ' + resumo.falhou);

  if (resumo.falhou && !resumo.aquecido && !resumo.fresco) {
    // Todos falharam = Overpass fora do ar ou service key errada. Vale falhar alto pra
    // aparecer no log, mas o passo está marcado continue-on-error no workflow: o cockpit
    // do dia seguinte não pode deixar de atualizar por causa do OSM.
    console.log('Nenhuma praça foi aquecida. Overpass fora do ar ou credencial do Supabase inválida.');
    process.exit(1);
  }

  if (resumo.falhou) {
    console.log(resumo.falhou + ' praça(s) ficaram sem aquecer — a rodada das 08:59 tenta de novo.');
  }
  console.log('De dia essas praças respondem do cache (~500ms) em vez de consultar ao vivo.');
  process.exit(0);
})();
