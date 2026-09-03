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


/* ══ AS DUAS FONTES DE LEAD SAO AUTOMATICAS, E EM DIAS DIFERENTES (03/09/26) ═════════
   Julyan: "temos que puxar esses leads da casa dos dados, e os mais avaliados tem q vir
   do google places, isso tem q ser automatico, obvio q em lotes para nao sujar o funil".

   O que se protege aqui nao e o codigo do sourcing (esse falha alto e aparece no log do
   Actions). E o ARRANJO, que e silencioso quando quebra:

     · duas fontes no MESMO dia = dois lotes de uma vez na tela do executivo, que e
       exatamente o "sujar o funil" que ele pediu para evitar;
     · teto por cidade removido = fila que ninguem le;
     · o corte de "mais avaliado" mexido sem ninguem notar muda QUEM ele visita;
     · rotulo de fonte novo quebra a metrica por origem em mais um pedaco — a base ja
       tem tres rotulos para o Google Places ("Google Places", "google_places" e
       "outscraper + Google Places"), e cada um novo piora.

   Nenhum desses aparece em teste de tela, e nenhum quebra o build. */
{
  const wfCasa = fs.readFileSync(path.join(raiz, '.github', 'workflows', 'casa-dos-dados-semanal.yml'), 'utf8');
  const wfPlaces = fs.readFileSync(path.join(raiz, '.github', 'workflows', 'google-places-mensal.yml'), 'utf8');
  const places = fs.readFileSync(path.join(raiz, 'scripts', 'backfill-google-places.js'), 'utf8');

  const cronDe = t => { const m = /cron:\s*'([^']+)'/.exec(t); return m ? m[1] : null; };
  const cronCasa = cronDe(wfCasa);
  const cronPlaces = cronDe(wfPlaces);

  checar('a Casa dos Dados tem cron', !!cronCasa, 'sem agendamento a fonte volta a ser manual');
  checar('o Google Places tem cron', !!cronPlaces, 'sem agendamento a fonte volta a ser manual');
  checar('as duas fontes NAO caem no mesmo dia',
    cronCasa !== cronPlaces,
    'dois lotes no mesmo dia enchem a tela do executivo de uma vez — cron casa=' + cronCasa + ' places=' + cronPlaces);

  checar('o Google Places roda mensal, nao semanal',
    /^\S+\s+\S+\s+1\s+\*\s+\*$/.test(String(cronPlaces)),
    'nota e contagem de avaliacoes se movem em meses; semanal devolveria o mesmo conjunto e so pagaria a API');

  checar('o corte de mais avaliado esta explicito e nao escondido numa query',
    /const NOTA_MINIMA = 4\.5;/.test(places) && /const AVALIACOES_MINIMAS = 100;/.test(places),
    'estes dois numeros decidem quem o executivo visita — mudar um muda a operacao');

  checar('cada cidade tem teto de lote',
    (places.match(/tetoMaximo:/g) || []).length >= 6 && /porPlaceId\.size >= tetoMaximo/.test(places),
    'sem teto a fila cresce ate ninguem ler');

  checar('o teto do Places e menor que o da Casa dos Dados',
    Math.max(...(places.match(/tetoMaximo: (\d+)/g) || []).map(x => Number(x.replace(/\D/g, '')))) <= 60,
    'conta madura tem ciclo mais longo: cinquenta de uma vez enterram o que ele ia fazer hoje');

  checar('o Places manda a fonte com a chave que o importador conhece',
    /fonte: 'google_places'/.test(places) && !/fonte: 'Google Places'/.test(places),
    'rotulo novo quebra a metrica por origem em mais um pedaco');

  checar('sem chave o script FALHA em vez de rodar calado',
    /GOOGLE_PLACES_API_KEY ausente/.test(places) && /process\.exit\(1\)/.test(places),
    'rodada silenciosa que nao importa nada e pior que rodada que falha e avisa');

  checar('sem nota ou sem avaliacoes o lead nao entra (ausencia nao vira zero)',
    /l\.nota == null \|\| l\.avaliacoes == null/.test(places),
    'tratar ausencia como zero reprovaria conta boa e aprovaria conta sem dado');

  checar('o Places nao cria Company nem Deal — entrega no importador',
    /api\/importar-leads/.test(places) && !/criar-negocio|criar-empresa/.test(places),
    'roteamento, dedup e corte de fit vivem no importador, que e testado');
}

if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  · ' + f));
  process.exit(1);
}
console.log('deploy: ' + ok + ' checagens ok — Preview nao gasta cota, commit que muda a tela sempre builda, '
  + 'e a regra falha para o lado de construir.');
