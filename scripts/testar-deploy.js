// scripts/testar-deploy.js
//
// A DECISAO DE BUILDAR DA VERCEL (03/09/26)
// ----------------------------------------------------------------------------
// scripts/vercel-deve-buildar.js decide se um commit gera deploy. Errar para o lado de
// PULAR e o pior defeito possivel aqui: a producao fica velha, o merge fica verde, as
// suites passam, e nada avisa. Foi exatamente o estado em que quatro PRs de correcao
// ficaram invisiveis em 02/09/26 — a diferenca e que ali a culpa era da cota da Vercel,
// e aqui seria minha.
//
// Entao esta suite cobre os dois lados da regra, e o caso mais perigoso primeiro: commit
// que mistura arquivo ignoravel com arquivo que afeta a tela TEM que buildar.

const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const { decidir, ignoravel, RAMO_DE_PRODUCAO } = require('./vercel-deve-buildar.js');

let ok = 0;
const falhas = [];
function checar(nome, condicao, porque) {
  if (condicao) { ok++; return; }
  falhas.push(nome + (porque ? ' — ' + porque : ''));
}

const MAIN = { VERCEL_GIT_COMMIT_REF: RAMO_DE_PRODUCAO, VERCEL_GIT_COMMIT_SHA: 'abc' };
const BRANCH = { VERCEL_GIT_COMMIT_REF: 'daily/etapa-e', VERCEL_GIT_COMMIT_SHA: 'abc' };

/* ── o caso mais perigoso: mistura ─────────────────────────────────────────────────── */
checar('commit que mistura teste com template BUILDA',
  decidir(MAIN, ['scripts/testar-nucleo.js', 'template/cockpit.template.html']).buildar,
  'pular aqui deixaria a correcao no main e fora da tela');

checar('commit que mistura .md com api/ BUILDA',
  decidir(MAIN, ['README.md', 'api/dados.js']).buildar);

/* ── o que deve PULAR ──────────────────────────────────────────────────────────────── */
checar('branch que nao e a de producao PULA',
  !decidir(BRANCH, ['template/cockpit.template.html']).buildar,
  'o Preview de repo privado exige login e ninguem olhava nenhum');

checar('so suite de teste PULA',
  !decidir(MAIN, ['scripts/testar-cadencia.js', 'scripts/testar-nucleo.js']).buildar);

checar('so SQL de migracao PULA',
  !decidir(MAIN, ['supabase/migrations/20260903_registros_rodada.sql']).buildar);

checar('so workflow do Actions PULA',
  !decidir(MAIN, ['.github/workflows/daily-refresh.yml']).buildar);

checar('so .md PULA',
  !decidir(MAIN, ['docs/roteiro.md', 'CLAUDE.md']).buildar);

/* ── o que deve BUILDAR ────────────────────────────────────────────────────────────── */
checar('template BUILDA', decidir(MAIN, ['template/cockpit.template.html']).buildar);
checar('public/index.html BUILDA', decidir(MAIN, ['public/index.html']).buildar);
checar('api/ BUILDA', decidir(MAIN, ['api/negocio-acao.js']).buildar);
checar('lib/ BUILDA', decidir(MAIN, ['lib/publicar-snapshot.js']).buildar);
checar('data/ BUILDA', decidir(MAIN, ['data/cadencias.json']).buildar,
  'cadencias.json e configuracao que a tela le');

/* scripts/ NAO e ignoravel em bloco: build.js gera o public/index.html e montar-dados.js
   e carregado em tempo de execucao por api/dados.js. So teste e guarda saem. */
checar('scripts/build.js BUILDA', decidir(MAIN, ['scripts/build.js']).buildar,
  'ele e quem gera o public/index.html');
checar('scripts/montar-dados.js BUILDA', decidir(MAIN, ['scripts/montar-dados.js']).buildar,
  'api/dados.js o carrega em tempo de execucao');
checar('scripts/fetch-hubspot.js BUILDA', decidir(MAIN, ['scripts/fetch-hubspot.js']).buildar);

/* ── falhar para o lado de construir ──────────────────────────────────────────────── */
checar('sem VERCEL_GIT_COMMIT_REF, BUILDA',
  decidir({}, ['template/cockpit.template.html']).buildar,
  'na duvida sobre o ramo, construir e o erro barato');
checar('lista de arquivos nula (diff falhou), BUILDA',
  decidir(MAIN, null).buildar);
checar('diff vazio, BUILDA',
  decidir(MAIN, []).buildar,
  'primeiro deploy ou sha anterior desconhecido');

/* ── a fiacao com a Vercel existe de verdade ──────────────────────────────────────── */
const vercelJson = JSON.parse(fs.readFileSync(path.join(raiz, 'vercel.json'), 'utf8'));
checar('vercel.json aponta para este script',
  vercelJson.ignoreCommand === 'node scripts/vercel-deve-buildar.js',
  'sem isto o arquivo e codigo morto e a cota continua queimando');
checar('vercel.json NAO desliga o deploy do git inteiro',
  vercelJson.git === undefined || vercelJson.git.deploymentEnabled !== false,
  'deploymentEnabled:false mataria a producao junto com os previews');

/* O contrato invertido da Vercel: 0 = ignora, 1 = constroi. Se alguem "consertar" isso
   achando que 0 e sucesso, todo commit para de deployar. */
const fonte = fs.readFileSync(path.join(raiz, 'scripts', 'vercel-deve-buildar.js'), 'utf8');
checar('o exit respeita o contrato invertido da Vercel (0=ignora, 1=constroi)',
  /process\.exit\(d\.buildar \? 1 : 0\)/.test(fonte),
  'inverter isto faz TODO commit parar de deployar, em silencio');

/* ── e a regra de ignoravel nao pode pegar caminho vizinho ────────────────────────── */
checar('scripts/testar-x.js e ignoravel, scripts/testarx.js nao',
  ignoravel('scripts/testar-nucleo.js') && !ignoravel('scripts/testando.js'));
checar('supabase/migrations/*.sql e ignoravel, lib/*.sql nao',
  ignoravel('supabase/migrations/a.sql') && !ignoravel('lib/seed.sql'));

if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  · ' + f));
  process.exit(1);
}
console.log('deploy: ' + ok + ' checagens ok — Preview nao gasta cota, commit que muda a tela sempre builda, '
  + 'e a regra falha para o lado de construir.');
