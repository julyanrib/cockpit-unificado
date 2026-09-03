// scripts/vercel-deve-buildar.js
//
// O "IGNORED BUILD STEP" DA VERCEL (03/09/26)
// ----------------------------------------------------------------------------
// Contrato da Vercel, do doc de vercel.json: este comando roda antes do build, e
//   exit 0 = IGNORA o build   ·   exit 1 = CONTINUA o build
// (sim, invertido em relacao a intuicao de codigo de saida — 0 aqui nao e "ok, siga").
//
// POR QUE EXISTE: em 02/09/26 a cota de 100 deploys/dia do plano Hobby estourou as 23:34
// UTC. A partir dali os merges no main pararam de promover para producao e QUATRO PRs de
// correcao ficaram no main sem chegar na tela do gestor — inclusive os dois que
// consertavam o defeito que ele tinha acabado de reportar. Nada falha nesse estado: o
// merge fica verde, as 15 suites passam, as 9 guardas passam, e a producao continua velha.
//
// DE ONDE VINHA A CARGA, medido no historico de deploys do dia:
//   · cada merge gerava DOIS deploys — um Preview do push da branch e um Production do
//     merge. O Preview de branch privada exige login para abrir e ninguem olhava nenhum.
//   · o robo commitava data/narrativas.json 7x por dia util. Isso ja foi resolvido: os
//     produtores publicam na tabela do Supabase e o robo commita zero (PRs #253/#257-259).
//
// O QUE ESTE ARQUIVO CORTA: o Preview de toda branch que nao e a de producao, e o build
// de commit que NAO PODE mudar o que e servido — mudanca so em suite de teste, em .md, em
// SQL de migracao ou em workflow do Actions nao altera public/index.html nem as rotas.
//
// A REGRA FALHA PARA O LADO DE CONSTRUIR, sempre. A lista de caminhos ignoraveis e
// BRANCA (pula so se TODOS os arquivos mudados estiverem nela): caminho desconhecido
// constroi. O contrario — lista negra — significaria que um caminho novo entra pulando o
// deploy em silencio, que e exatamente a classe de defeito que causou este arquivo.

const { execSync } = require('child_process');

const RAMO_DE_PRODUCAO = 'main';

/* Caminhos que NAO PODEM mudar o que o navegador recebe.
   `scripts/` NAO entra inteiro de proposito: build.js gera o public/index.html e
   montar-dados.js e carregado em tempo de execucao por api/dados.js. So o que e teste. */
const IGNORAVEIS = [
  /^scripts\/testar-[^/]+\.js$/,
  /^scripts\/check-scripts\.js$/,
  /^supabase\/migrations\/[^/]+\.sql$/,
  /^\.github\//,
  /^docs\//,
  /\.md$/,
  /^\.gitignore$/,
  /^LICENSE$/
];

function ignoravel(caminho) {
  return IGNORAVEIS.some(re => re.test(caminho));
}

/* Devolve { buildar: boolean, motivo: string }. Separado do process.exit para a suite
   poder exercitar a tabela de decisao sem subprocesso. */
function decidir(ambiente, arquivosMudados) {
  const ramo = ambiente.VERCEL_GIT_COMMIT_REF;

  if (!ramo) {
    return { buildar: true, motivo: 'sem VERCEL_GIT_COMMIT_REF no ambiente — na duvida, constroi' };
  }
  if (ramo !== RAMO_DE_PRODUCAO) {
    return { buildar: false, motivo: 'ramo "' + ramo + '" nao e ' + RAMO_DE_PRODUCAO + ' — Preview nao vale um deploy da cota' };
  }
  if (!Array.isArray(arquivosMudados)) {
    return { buildar: true, motivo: 'nao consegui listar os arquivos mudados — na duvida, constroi' };
  }
  if (arquivosMudados.length === 0) {
    return { buildar: true, motivo: 'diff vazio (primeiro deploy, ou sha anterior desconhecido) — constroi' };
  }
  const relevantes = arquivosMudados.filter(f => !ignoravel(f));
  if (relevantes.length === 0) {
    return { buildar: false, motivo: 'os ' + arquivosMudados.length + ' arquivo(s) mudados nao alteram o que e servido' };
  }
  return { buildar: true, motivo: relevantes.length + ' arquivo(s) que afetam a tela: ' + relevantes.slice(0, 4).join(', ') };
}

function arquivosMudados(ambiente) {
  const anterior = ambiente.VERCEL_GIT_PREVIOUS_SHA;
  const atual = ambiente.VERCEL_GIT_COMMIT_SHA || 'HEAD';
  /* VERCEL_GIT_PREVIOUS_SHA e exposto SO quando existe um Ignored Build Step configurado
     (doc de system environment variables) — ou seja, so existe por causa deste arquivo.
     Sem ele, cai no HEAD^, e se nem isso der, devolve null e a decisao vira "constroi". */
  const alvo = anterior ? anterior : (atual + '^');
  try {
    const saida = execSync('git diff --name-only ' + alvo + ' ' + atual, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return String(saida).split('\n').map(l => l.trim()).filter(Boolean);
  } catch (e) {
    return null;
  }
}

module.exports = { decidir, ignoravel, IGNORAVEIS, RAMO_DE_PRODUCAO };

if (require.main === module) {
  const d = decidir(process.env, arquivosMudados(process.env));
  console.log((d.buildar ? 'BUILDAR' : 'PULAR') + ' — ' + d.motivo);
  process.exit(d.buildar ? 1 : 0);
}
