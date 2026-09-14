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

  /* ══ O CORTE DEIXOU DE TER NOTA (03/09/26) ══════════════════════════════════════════
     Esta assercao exigia NOTA_MINIMA = 4.5, e estava certa no dia em que nasceu. O Julyan
     mudou: "eu quero dos MAIS avaliados independente se sao bons ou ruins".

     A razao dele e boa: nota mede EXPERIENCIA, avaliacoes medem TAMANHO. Uma casa com 3,2
     e cinco mil avaliacoes e operacao grande com problema operacional — o melhor argumento
     de venda que a Takeat tem. O corte antigo deixava de fora justamente quem mais precisa.

     Entao a assercao passa a proteger o que sobrou de decisivo (o piso de volume) e, no
     lugar do que saiu, GUARDA A AUSENCIA: se NOTA_MINIMA voltar a aparecer no script, e
     porque alguem reintroduziu o filtro sem ler esta nota. */
  checar('o piso de volume esta explicito e nao escondido numa query',
    /const AVALIACOES_MINIMAS = 100;/.test(places),
    'este numero decide quem o executivo visita — mudar muda a operacao');
  checar('a nota NAO filtra: ela e informacao de abordagem, nao porteira',
    !/NOTA_MINIMA/.test(places) && !/l\.nota <\s/.test(places),
    'cortar por nota alta deixa de fora a operacao grande com problema operacional');
  checar('a ordem e por avaliacoes decrescente — e o que faz "os MAIS avaliados" ser verdade',
    /\(b\.avaliacoes \|\| 0\) - \(a\.avaliacoes \|\| 0\)/.test(places),
    'sem a ordem, o teto cortaria ao acaso em vez de cortar pelo fim da fila');

  /* ══ O TETO VIROU CONTA, E AS DUAS GUARDAS ESTAVAM CRAVADAS NO LITERAL (14/09/26)
     Elas contavam `tetoMaximo: <numero>` no texto. Desde que as pracas passaram a ser
     derivadas de territorios.json, o teto e calculado por quantos executivos a cidade
     atende — nao ha literal para contar, e as duas reprovaram mudanca correta.
     A REGRA continua inteira; o que muda e como se mede. */
  /* ══ O TETO VIROU COTA DE CADA UM (14/09/26) ══════════════════════════════════════
     Esta guarda media "existe teto da cidade e o laco para nele". A regra continua, mas
     o teto por CIDADE era ele mesmo um defeito: medido no log do Rio, os quatro
     primeiros bairros do Bruno encheram as 120 vagas e o laco encerrou — os 42 bairros
     do Andre nunca foram consultados, e ele ficou com ZERO contas do Google.
     Agora a cota e por executivo, e e isso que se mede. */
  checar('cada executivo tem cota propria, e o laco para na dele',
    /teto: 40/.test(places)
      && /\(porPlaceId\.size - antesDoDono\) >= dono\.teto/.test(places)
      && /for \(const dono of donos\)/.test(places),
    'teto por cidade numa lista em ordem de arquivo e fila em que o primeiro leva tudo — '
      + 'e nada na tela diz que o ultimo ficou sem nada');

  checar('e quem fica abaixo do objetivo aparece pelo NOME',
    /\$\{dono\.rep\}: \$\{doDono\} conta\(s\), abaixo do/.test(places),
    'objetivo nao batido sem dizer de QUEM e o zero que ninguem contesta');

  checar('o teto por executivo do Places e menor que o da Casa dos Dados',
    (function () {
      const m = places.match(/tetoMaximo: (\d+) \* c\.reps/);
      if (!m) return false;
      return Number(m[1]) <= 60;
    }()),
    'conta madura tem ciclo mais longo: cinquenta de uma vez enterram o que ele ia fazer hoje');

  checar('o Places manda a fonte com a chave que o importador conhece',
    /fonte: 'google_places'/.test(places) && !/fonte: 'Google Places'/.test(places),
    'rotulo novo quebra a metrica por origem em mais um pedaco');

  checar('sem chave o script FALHA em vez de rodar calado',
    /* A REGRA E "falha e avisa", NAO o nome da chave (14/09/26). Esta linha dizia
       GOOGLE_PLACES_API_KEY e reprovou a troca da fonte para o Serper — mudanca correta,
       reprovada por grafia. O nome da chave e conferido contra o workflow em
       testar-serper-places.js, que e onde essa pergunta mora. */
    (function () { const j = places.indexOf('ausente. Esta rodada não tem como buscar nada'); if (j < 0) return false; const ramo = places.slice(j, j + 700); return /process\.exit\(1\)/.test(ramo); }()),
    'rodada silenciosa que nao importa nada e pior que rodada que falha e avisa');

  checar('sem avaliacoes o lead nao entra (ausencia nao vira zero)',
    /if \(l\.avaliacoes == null\) continue;/.test(places),
    'sem a contagem nao da para ORDENAR por mais avaliado, e ausencia nao e zero');
  checar('sem NOTA o lead entra: volume sem media publicada nao e menos alvo',
    !/l\.nota == null.*continue/.test(places),
    'exigir nota descartaria conta com volume que so nao tem media no Google');

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
