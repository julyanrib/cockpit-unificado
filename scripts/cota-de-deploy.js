// scripts/cota-de-deploy.js
//
// QUANTOS DEPLOYS DE PRODUÇÃO JÁ FORAM HOJE (03/09/26)
// ----------------------------------------------------------------------------
// POR QUE EXISTE: a cota do plano Hobby estourou duas vezes em dois dias, e as duas
// vezes o sintoma foi o mesmo — NENHUM erro visível. O merge fica verde, as 14 guardas
// passam, as 17 suítes passam, e a produção continua servindo o arquivo de antes. Em
// 02/09 quatro PRs de correção ficaram no main sem chegar na tela do gestor. Em 03/09
// aconteceu de novo, e a causa foi minha: 38 merges no mesmo dia, um por correção.
//
// O LIMITE NÃO É O PROBLEMA — A INVISIBILIDADE É. Este script transforma um limite que
// só aparece quando já foi ultrapassado num número que se olha antes de mesclar.
//
// COMO LER O NÚMERO, e isto importa: o que se conta aqui são os deployments que o GitHub
// registra para o repositório. A Vercel conta os builds DELA, que não é a mesma lista —
// um merge pode gerar mais de um, e builds cancelados pelo Ignored Build Step podem não
// aparecer aqui. Então este número é PISO, nunca teto: se ele já está perto do limite, a
// Vercel provavelmente está mais perto ainda. Serve para decidir "posso mesclar agora?",
// não para auditar a fatura.
//
// USO
//   node scripts/cota-de-deploy.js            (hoje, em UTC — a janela da Vercel é UTC)
//   node scripts/cota-de-deploy.js 2026-09-02
//
// De onde vem o resto da carga, medido em 03/09: o robô do daily-refresh promove 8x por
// dia útil (os horários de cadência, em .github/workflows/daily-refresh.yml). Isso é
// legítimo e é dado novo chegando na tela. O que sobra é agrupamento: um PR por sessão
// de trabalho, não um por correção.

const { execSync } = require('child_process');

/* SÃO DOIS LIMITES DIFERENTES, e o que bateu não foi o que eu supunha.

   Em 03/09 a Vercel recusou com "Deployment rate limited — retry in 24 hours" e o link
   do erro dizia `upgradeToPro=build-rate-limit`. Nesse momento o GitHub tinha registrado
   36 deployments de produção no dia — bem abaixo de 100. Ou seja: o que bateu foi o
   limite de TAXA de build, não a contagem diária.

   Por que isso muda a conduta: contra a contagem diária, o remédio seria fazer menos
   deploys no dia. Contra a taxa, o remédio é não fazer muitos JUNTOS — e eu mesclei uma
   sequência de PRs em poucos minutos. Agrupar resolve os dois; espaçar resolve só um.
   Um PR por sessão de trabalho, não um por correção.

   Os dois números ficam declarados aqui porque a Vercel não expõe nenhum dos dois por
   API. Se o plano mudar, mudam aqui. */
const LIMITE_HOBBY = 100;
const LIMITE_CONFERIDO_EM = '2026-09-03';
const REPO = 'julyanrib/cockpit-unificado';

function hojeUTC() {
  return new Date().toISOString().slice(0, 10);
}

/* O FILTRO ACONTECE AQUI, NÃO NO --jq. A primeira versão passava a expressão jq na linha
   de comando, e ela morria no aninhamento de aspas (o comando roda por um shell, e a
   citação de dia dentro de select(...) dentro de --jq'...' chega quebrada). Trazer a
   página inteira e filtrar em JS é uma chamada só e não depende de citação nenhuma. */
function buscar(dia) {
  const cmd = 'gh api repos/' + REPO + '/deployments?per_page=100';
  let bruto;
  try {
    bruto = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return null;
  }
  let lista;
  try {
    lista = JSON.parse(bruto);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(lista)) return null;
  return lista
    .filter(d => String(d.created_at || '').startsWith(dia))
    .map(d => ({ ambiente: d.environment, quando: d.created_at }));
}

function main() {
  const dia = process.argv[2] || hojeUTC();
  const linhas = buscar(dia);

  if (linhas === null) {
    console.log('Não consegui consultar o GitHub (gh não autenticado, ou sem rede).');
    console.log('Sem o número, a regra segura é a mesma de sempre: agrupar as correções');
    console.log('num PR só antes de mesclar.');
    process.exit(0);
  }

  const producao = linhas.filter(l => String(l.ambiente).toLowerCase() === 'production');
  const restam = LIMITE_HOBBY - producao.length;

  console.log('Deploys de produção em ' + dia + ' (UTC): ' + producao.length);
  console.log('Limite do plano Hobby: ' + LIMITE_HOBBY + '/dia (declarado, conferido em ' + LIMITE_CONFERIDO_EM + ')');
  console.log('');
  console.log('Este número é PISO: conta o que o GitHub registra, e a Vercel conta os');
  console.log('builds dela — que podem ser mais. Serve para decidir se dá para mesclar,');
  console.log('não para auditar a cota.');
  console.log('');

  if (producao.length === 0) {
    console.log('Nada hoje. Janela livre.');
  } else if (restam <= 0) {
    console.log('ESTOUROU. Mesclar agora não chega na produção, e não vai dar erro:');
    console.log('o merge fica verde e a tela continua velha. Esperar a virada em UTC.');
  } else if (restam <= 15) {
    console.log('APERTADO: ' + restam + ' de folga no piso, e o robô ainda vai promover');
    console.log('nos horários de cadência que faltam hoje. Agrupar tudo num PR só.');
  } else {
    console.log('Folga de pelo menos ' + restam + ' na contagem diária — mas ela não foi o');
    console.log('que travou em 03/09: com 36 no dia a Vercel recusou por TAXA de build,');
    console.log('porque eu mesclei vários PRs em poucos minutos. Um PR por sessão.');
  }

  const primeiro = producao.length ? producao[producao.length - 1].quando : null;
  const ultimo = producao.length ? producao[0].quando : null;
  if (primeiro) console.log('\nprimeiro: ' + primeiro + '   último: ' + ultimo);

  producaoEstaAtual();
}

/* A PRODUÇÃO ESTÁ SERVINDO O CÓDIGO DO MAIN?
   Esta é a pergunta que a cota esconde, e a que mais custou. Quando o limite bate, o
   merge fica verde, as 15 guardas passam, as 17 suítes passam, o commit está no main — e
   a Vercel continua servindo o arquivo de antes, sem erro em lugar nenhum. Em 02/09
   quatro PRs de correção ficaram assim, e a pergunta seguinte do Julyan foi "não
   corrigiu ainda?".
   A Vercel NÃO repete build de produção que falhou. Então depois de um merge feito
   dentro da janela fechada, alguém tem que disparar o build (um commit qualquer no main,
   ou Redeploy no painel) — e sem esta comparação ninguém sabe que precisa.
   A comparação é byte a byte: o que está no ar contra o public/index.html do disco. */
function producaoEstaAtual() {
  const fs = require('fs');
  const URL_PRODUCAO = 'https://cockpit-unificado.vercel.app/';
  const LOCAL = require('path').join(__dirname, '..', 'public', 'index.html');

  let local;
  try { local = fs.readFileSync(LOCAL); } catch (e) {
    console.log('\n(não achei public/index.html para comparar — rode node scripts/build.js)');
    return;
  }
  let servido;
  try {
    /* -L porque o domínio redireciona para fieldsalestakeat.vercel.app */
    servido = execSync('curl -sL --max-time 25 ' + URL_PRODUCAO,
      { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    console.log('\n(não consegui buscar a produção — sem rede, ou ela fora do ar)');
    return;
  }

  console.log('');
  if (servido.length === local.length && Buffer.compare(servido, local) === 0) {
    console.log('A produção está servindo exatamente o código do disco (byte a byte).');
    return;
  }
  console.log('A PRODUÇÃO ESTÁ DIFERENTE DO CÓDIGO DO DISCO.');
  console.log('  no ar: ' + servido.length + ' bytes   ·   no disco: ' + local.length + ' bytes');
  console.log('  Se o disco está igual ao main, a produção está ATRÁS: houve merge sem build');
  console.log('  (janela de cota fechada) e a Vercel não repete build que falhou. Disparar:');
  console.log('  um commit qualquer no main, ou Redeploy no painel da Vercel.');
  console.log('  Se o disco tem trabalho não commitado, a diferença pode ser só isso.');
}

if (require.main === module) main();
module.exports = { LIMITE_HOBBY };
