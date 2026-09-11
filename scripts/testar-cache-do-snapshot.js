// scripts/testar-cache-do-snapshot.js
//
// /api/dados NÃO BAIXA 1,2 MB QUANDO NADA MUDOU (11/09/26).
//
// O QUE ESTA SUÍTE MEDE, e por que ela EXERCITA em vez de ler código
// ---------------------------------------------------------------------------------------
// A rota lia `select=chave,conteudo,atualizado_em` da cockpit_snapshot a cada chamada. O
// `conteudo` das seis chaves são ~1,2 MB — hubspot.json sozinho tem 880 KB — e isso ia
// pelo fio a cada login e a cada vez que o farol pede dado novo, mesmo quando a tabela
// estava idêntica à chamada anterior.
//
// Medido antes de mexer, para não otimizar por palpite: montar o DATA custa 3,6 ms e
// serializar a resposta 2,6 ms. A CPU não era o custo; a leitura era.
//
// Agora a rota pergunta primeiro só `chave,atualizado_em` (centenas de bytes) e só baixa o
// conteúdo quando alguma assinatura mudou. Isso é fácil de quebrar sem ninguém notar: uma
// mudança no select, um cache gravado antes da hora, um `atualizado_em` que some do
// retorno — e a rota volta a baixar tudo, calada, com todas as suítes verdes.
//
// Então aqui o handler roda de verdade, com a rede dublada, e a suíte CONTA as leituras:
// quantas pediram conteúdo, quantas pediram só a assinatura.
//
// E MEDE A OUTRA METADE, que é a que importa de verdade: quando a tabela MUDA, o conteúdo
// novo tem de chegar na mesma chamada. Cache que serve dado velho neste produto é pior do
// que cache nenhum — a primeira lei da tela é que todo número diz de onde vem.

const path = require('path');
const raiz = path.join(__dirname, '..');

let ok = 0;
const falhas = [];
function checar(nome, cond, dica) {
  if (cond) { ok += 1; console.log('  ok  ' + nome); return; }
  falhas.push(nome + (dica ? '  — ' + dica : ''));
  console.log('  FALHA  ' + nome + (dica ? '  — ' + dica : ''));
}

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://exemplo.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon-de-teste';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'servico-de-teste';

const USUARIOS = (function () {
  const raw = require(path.join(raiz, 'data', 'usuarios.json'));
  return Array.isArray(raw) ? raw : (raw.usuarios || []);
}());
const REP = USUARIOS.filter(u => u.role === 'rep' && /^[0-9]+$/.test(String(u.ownerId || '')))[0];
if (!REP) { console.error('não achei rep com ownerId numérico em data/usuarios.json'); process.exit(1); }

const handler = require(path.join(raiz, 'api', 'dados.js'));

/* O conteúdo dublado é o dado REAL do disco: assim a montagem exercita o caminho de
   verdade, e não um objeto de brinquedo que passaria por qualquer coisa. */
function conteudoDeDisco(chave) {
  const arquivos = {
    'hubspot': 'hubspot.json', 'narrativas': 'narrativas.json',
    'resumo-semanal': 'resumo-semanal.json', 'weekly-raw': 'weekly-raw.json',
    'sync-status': 'sync-status.json', 'hubspot-previous': 'hubspot-previous.json'
  };
  try { return require(path.join(raiz, 'data', arquivos[chave])); } catch (e) { return null; }
}
const CHAVES = ['hubspot', 'narrativas', 'resumo-semanal', 'weekly-raw'];

const contador = { comConteudo: 0, soAssinatura: 0 };
let carimbo = '2026-09-11T10:00:00Z';

function resposta() {
  const r = { statusCode: 0, corpo: null };
  r.setHeader = () => r;
  r.status = c => { r.statusCode = c; return r; };
  r.json = b => { r.corpo = b; return r; };
  r.end = () => r;
  return r;
}

function ligarRede() {
  global.fetch = async function (url) {
    const u = String(url);
    if (u.indexOf('/auth/v1/user') > -1) {
      return { ok: true, status: 200, json: async () => ({ email: REP.email }) };
    }
    if (u.indexOf('cockpit_snapshot') > -1) {
      const pedeConteudo = u.indexOf('conteudo') > -1;
      if (pedeConteudo) contador.comConteudo++; else contador.soAssinatura++;
      const linhas = CHAVES.map(function (c) {
        const base = { chave: c, atualizado_em: carimbo };
        if (pedeConteudo) base.conteudo = conteudoDeDisco(c);
        return base;
      }).filter(l => !pedeConteudo || l.conteudo != null);
      return { ok: true, status: 200, json: async () => linhas };
    }
    return { ok: true, status: 200, json: async () => ([]) };
  };
}

async function chamar() {
  const res = resposta();
  await handler({ method: 'GET', headers: { authorization: 'Bearer sessao' } }, res);
  return res;
}

async function main() {
  const fetchOriginal = global.fetch;
  ligarRede();

  /* ── 1 · A PRIMEIRA CHAMADA BAIXA TUDO ──────────────────────────────────────────── */
  const r1 = await chamar();
  checar('a rota responde 200 com dados', r1.statusCode === 200 && !!(r1.corpo && r1.corpo.dados),
    'HTTP ' + r1.statusCode + ' — ' + JSON.stringify(r1.corpo || {}).slice(0, 140));
  checar('a primeira chamada baixa o conteúdo', contador.comConteudo === 1,
    'leituras com conteúdo: ' + contador.comConteudo);

  /* ── 2 · A SEGUNDA, COM A TABELA IGUAL, NÃO BAIXA ───────────────────────────────── */
  const antes = contador.comConteudo;
  const r2 = await chamar();
  checar('a segunda chamada NÃO baixa o conteúdo de novo', contador.comConteudo === antes,
    'leituras com conteúdo: ' + contador.comConteudo + ' (esperava ' + antes + ')');
  checar('e ela pergunta a assinatura, em vez de confiar no tempo',
    contador.soAssinatura >= 2,
    'leituras só de assinatura: ' + contador.soAssinatura);
  checar('e responde 200 com os mesmos dados',
    r2.statusCode === 200 && !!(r2.corpo && r2.corpo.dados)
      && JSON.stringify(r2.corpo.dados) === JSON.stringify(r1.corpo.dados),
    'HTTP ' + r2.statusCode);
  checar('a resposta declara que reaproveitou, para dar para conferir em produção',
    !!(r2.corpo && r2.corpo.procedencia),
    JSON.stringify((r2.corpo || {}).procedencia || {}));

  /* O CACHE TEM DE GUARDAR AS FONTES DE VERDADE, e não uma casca.
     Sabotagem que gravava `CACHE.fontes = CACHE.fontes || {}` passava por todas as
     checagens acima: a segunda chamada não baixava (certo), respondia 200 (certo) e os
     `dados` batiam (falso conforto — o módulo de montagem guarda estado entre chamadas,
     então ele ainda tinha as fontes da primeira). O que denuncia a casca é a PROCEDÊNCIA:
     `usarSnapshot({})` não troca chave nenhuma, e a resposta passa a dizer que o funil veio
     do arquivo. É a diferença entre "reaproveitei o dado" e "perdi o dado e não percebi". */
  checar('e reaproveitar entrega as MESMAS chaves, não uma casca vazia',
    !!(r2.corpo && r2.corpo.procedencia)
      && JSON.stringify(r2.corpo.procedencia.chaves) === JSON.stringify(r1.corpo.procedencia.chaves)
      && (r2.corpo.procedencia.chaves || []).length > 0
      && r2.corpo.procedencia.fonte === r1.corpo.procedencia.fonte,
    'antes: ' + JSON.stringify((r1.corpo || {}).procedencia || {})
      + ' · depois: ' + JSON.stringify((r2.corpo || {}).procedencia || {}));

  /* ── 3 · MUDOU A TABELA, CHEGA O DADO NOVO — ESTA É A METADE QUE IMPORTA ────────── */
  carimbo = '2026-09-11T18:30:00Z';
  const antes2 = contador.comConteudo;
  const r3 = await chamar();
  checar('quando a tabela muda, o conteúdo é baixado de novo',
    contador.comConteudo === antes2 + 1,
    'leituras com conteúdo: ' + contador.comConteudo + ' (esperava ' + (antes2 + 1) + ')');
  checar('e a procedência carrega o carimbo novo',
    !!(r3.corpo && r3.corpo.procedencia && String(r3.corpo.procedencia.atualizadoEm).indexOf('18:30') > -1),
    JSON.stringify((r3.corpo || {}).procedencia || {}));

  /* ── 4 · O RECORTE POR PAPEL NÃO PASSA PELO CACHE ───────────────────────────────── */
  /* O cache guarda as FONTES cruas, nunca o DATA montado nem o recorte por papel. Se algum
     dia alguém guardar o resultado montado para economizar os 3,6 ms da montagem, o
     recorte passa a ter dois lugares onde pode divergir — e recorte por papel é o que
     impede um executivo de ver a carteira do colega. */
  const fonte = require('fs').readFileSync(path.join(raiz, 'api', 'dados.js'), 'utf8');
  checar('o cache guarda as fontes cruas, não o DATA montado',
    /const CACHE = \{ assinatura: null, fontes: null, atualizadoEm: null \};/.test(fonte)
      && !/CACHE\.(dados|completo|montado)/.test(fonte),
    'apareceu DATA montado dentro do cache — o recorte por papel ganharia um segundo lugar');
  checar('e a montagem continua rodando a cada chamada',
    /const completo = montarDadosCompletos\(\);/.test(fonte)
      && /filtrarParaPapel\(completo, usuario\)/.test(fonte),
    'montarDadosCompletos saiu do caminho — o recorte por papel precisa dele');

  global.fetch = fetchOriginal;

  console.log('');
  if (falhas.length) {
    console.error(falhas.length + ' falha(s) — o cache do snapshot mudou de comportamento.');
    falhas.forEach(f => console.error('  · ' + f));
    process.exit(1);
  }
  console.log('cache do snapshot: ' + ok + ' checagens — só baixa 1,2 MB quando a tabela muda.');
}

main().catch(e => { console.error('quebrou: ' + (e && e.stack || e)); process.exit(1); });
