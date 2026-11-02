// scripts/redistribuir-leads-de-quem-saiu.js
//
// A CARTEIRA DE QUEM SAIU SEGUE O TERRITÓRIO (02/11/26). Decisão do dono: quando alguém é desativado em
// equipe_cockpit, os leads 'atribuido' (e 'na_rota') dele em leads_prospeccao vão para quem a regra de
// território dos leads NOVOS (lib/territorios.js, regraDoTerritorio, com quem saiu fora) mandaria hoje.
// Sem destino, o lead fica 'pendente' e sem dono — nunca se inventa dono. Lead com negócio no HubSpot fica
// de fora: o dono dele é o do HubSpot. O pino segue o lead pelo gatilho do banco.
//
// NÃO reimplementa nada: quem lê e grava é api/importar-leads.js (ação 'redistribuir_de_quem_saiu'), com a
// service role do lado do servidor, chamado como o backfill da Casa dos Dados chama a importação (header
// x-import-secret). Este script só pede e imprime. O relatório sai por ownerId, sem nomes.
//
// Uso:
//   node scripts/redistribuir-leads-de-quem-saiu.js --seco        (padrão) quantos vão de quem para quem
//   node scripts/redistribuir-leads-de-quem-saiu.js --aplicar     grava (o robô diário roda este)
//   node scripts/redistribuir-leads-de-quem-saiu.js --seco --entrada arquivo.json
//        ensaio offline, sem rede: o arquivo traz { desligados, ativos, leads } ou { desligados, ativos,
//        grupos: [[cidade, bairro, owner, status, negocioNoLead, negocioNoPino, quantidade], ...] } (o
//        formato agregado que um SELECT devolve). Nunca grava.
//
// Variáveis: IMPORT_SECRET (o mesmo da importação), COCKPIT_URL (opcional, padrão cockpit-robo do APP).

const fs = require('fs');
const path = require('path');
const { planejarRedistribuicao } = require('../lib/territorios.js');

// o padrão é a porta dos robôs do APP (cockpit-robo), onde mora o banco que todo mundo lê; o
// fieldsalestakeat.vercel.app grava no banco antigo (ver casa-dos-dados-semanal.yml)
const COCKPIT_URL = process.env.COCKPIT_URL || 'https://mxyjvijclhlxrlafqcrz.supabase.co/functions/v1/cockpit-robo';

function lerArgs(argv) {
  const a = { aplicar: false, entrada: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--aplicar') a.aplicar = true;
    else if (argv[i] === '--seco') a.aplicar = false;
    else if (argv[i] === '--entrada') a.entrada = argv[++i] || null;
  }
  return a;
}

/* o formato agregado vira linhas: o roteador só olha cidade, bairro e coordenada */
function leadsDaEntrada(dados) {
  if (Array.isArray(dados.leads)) return dados.leads;
  const out = [];
  (dados.grupos || []).forEach(function (g, k) {
    const [cidade, bairro, owner, status, negLead, negPino, n] = g;
    for (let i = 0; i < Number(n || 0); i++) {
      out.push({ id: 'g' + k + '-' + i, cidade, bairro, lat: null, lng: null, responsavel_owner_id: owner, status,
        hubspot_deal_id: negLead ? 'sim' : null, pinoComNegocio: !!negPino });
    }
  });
  return out;
}

function imprimir(r) {
  console.log((r.seco ? 'ENSAIO (nada gravado)' : 'APLICADO') + ' · ' + r.desligados + ' owner(s) desativado(s) · ' + r.leads + ' lead(s) para repassar');
  Object.keys(r.resumo || {}).sort().forEach(function (k) { console.log('  ' + k + ': ' + r.resumo[k]); });
  const p = r.pulados || {};
  if (p.comNegocio) console.log('  fora (negócio no HubSpot, troca de dono é lá): ' + p.comNegocio);
  if (r.aplicados != null) console.log('  gravados: ' + r.aplicados + ' · pinos que ficaram sem dono: ' + (r.pinosSemDono || 0));
  (r.erros || []).forEach(function (e) { console.log('  ERRO: ' + e); });
}

async function principal() {
  const a = lerArgs(process.argv.slice(2));
  if (a.entrada) {
    if (a.aplicar) { console.error('--entrada é só ensaio: não grava nada.'); process.exit(2); }
    const dados = JSON.parse(fs.readFileSync(path.resolve(a.entrada), 'utf8'));
    const plano = planejarRedistribuicao(leadsDaEntrada(dados), { desligados: dados.desligados || [], ativos: dados.ativos || null });
    const porque = {};
    plano.itens.filter(function (i) { return !i.para; }).forEach(function (i) { porque[i.porque] = (porque[i.porque] || 0) + 1; });
    imprimir({ seco: true, desligados: (dados.desligados || []).length, leads: plano.itens.length, resumo: plano.resumo, pulados: plano.pulados });
    Object.keys(porque).forEach(function (k) { console.log('  pendente porque ' + k + ': ' + porque[k]); });
    return;
  }
  const segredo = process.env.IMPORT_SECRET;
  if (!segredo) { console.error('IMPORT_SECRET ausente: sem ele a rota recusa (e este script não tem outra credencial).'); process.exit(2); }
  const r = await fetch(COCKPIT_URL + '/api/importar-leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-import-secret': segredo },
    body: JSON.stringify({ acao: 'redistribuir_de_quem_saiu', aplicar: a.aplicar })
  });
  const corpo = await r.json().catch(function () { return {}; });
  if (!r.ok) { console.error('A rota recusou (' + r.status + '): ' + (corpo.erro || JSON.stringify(corpo))); process.exit(1); }
  imprimir(corpo);
  if (corpo.erros && corpo.erros.length) process.exit(1);
}

if (require.main === module) principal().catch(function (e) { console.error(e); process.exit(1); });
module.exports = { leadsDaEntrada, lerArgs };
