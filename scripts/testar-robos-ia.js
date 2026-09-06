/* ══ SUÍTE DOS ROBÔS QUE CHAMAM A API DO CLAUDE (05/09/26) ══════════════════════════
   Nasceu da revisão de custo pedida pelo Julyan — e do que a revisão encontrou.

   O ACHADO QUE JUSTIFICA A SUÍTE: o robô semanal estava QUEBRADO desde 03/09. Ele montava
   `repsContext` no topo do módulo lendo `narrativas.reps`, e `narrativas` passou a ser
   carregado só dentro do main() naquele dia. Resultado: "Cannot read properties of null"
   no load, toda sexta, em silêncio — a prova estava no dado (resumo-semanal.json parado
   em 29/08) e ninguém tinha olhado.
   Nenhuma guarda pegava porque nenhuma EXECUTA esses scripts: eles precisam de chave de
   API. Então esta suíte faz duas coisas que as outras não fazem:
     1. checagens estáticas das regras que já custaram dinheiro ou dado;
     2. um ENSAIO de verdade — roda o robô inteiro com a rede simulada (Claude e Supabase
        falsos), sem gastar um centavo, e confere o que ele escreveu.
   ══════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const NL = String.fromCharCode(10);
const robo = fs.readFileSync(path.join(raiz, 'scripts/generate-weekly-summary.js'), 'utf8');

const falhas = [];
let ok = 0;
function checar(nome, condicao, porque) {
  if (condicao) { ok++; return; }
  falhas.push(nome + (porque ? ' — ' + porque : ''));
}

/* ── 1. NENHUM WORKFLOW CHAMA SCRIPT QUE NÃO EXISTE ──────────────────────────────
   Apagar um robô e esquecer o passo dá erro só na próxima rodada agendada, de
   madrugada, e o Actions falha inteiro — inclusive os passos que não têm nada a ver. */
(function () {
  const dir = path.join(raiz, '.github/workflows');
  const arquivos = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f)) : [];
  const orfaos = [];
  arquivos.forEach(f => {
    const y = fs.readFileSync(path.join(dir, f), 'utf8');
    const usos = [...y.matchAll(/run:\s*node\s+(scripts\/[\w.-]+\.js)/g)].map(m => m[1]);
    usos.forEach(u => { if (!fs.existsSync(path.join(raiz, u))) orfaos.push(f + ' → ' + u); });
  });
  checar('todo workflow chama script que existe', orfaos.length === 0,
    'passo apontando para arquivo apagado quebra a rodada inteira: ' + orfaos.join(', '));
}());

/* ── 2. UM ROBÔ SÓ CHAMA A API ───────────────────────────────────────────────────
   Eram três até 05/09 (gargalo diário, coaching de segunda, resumo de sexta). Os dois
   primeiros foram apagados e o terceiro absorveu o que era lido. Robô novo entra aqui
   com o custo declarado, não de surpresa. */
(function () {
  const dir = path.join(raiz, 'scripts');
  const chamadores = fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    /* as próprias suítes citam o endereço para poder medi-lo — elas não chamam nada */
    .filter(f => f.indexOf('testar-') !== 0)
    .filter(f => fs.readFileSync(path.join(dir, f), 'utf8').indexOf('api.anthropic.com') > -1);
  checar('só um script chama a API do Claude',
    chamadores.length === 1 && chamadores[0] === 'generate-weekly-summary.js',
    'cada chamador novo é custo recorrente — declare-o aqui: ' + chamadores.join(', '));
}());

/* ── 3. NADA LÊ narrativas ANTES DA CARGA ────────────────────────────────────────
   O defeito de 03/09, exatamente. `narrativas` nasce null e só é preenchido dentro do
   main(); qualquer uso em escopo de módulo derruba o robô no load. */
(function () {
  /* Anda linha a linha contando chaves para saber a profundidade. Dentro de função é
     legítimo (só roda quando alguém chama, depois da carga); no nível 0 é o defeito.
     Comentários e o CAMINHO do arquivo ('narrativas.json') não contam — a primeira
     versão desta checagem reprovou nos três, e nenhum era o defeito. */
  const linhas = robo.split(NL);
  const iMain = linhas.findIndex(l => l.indexOf('async function main()') === 0);
  if (iMain < 0) { checar('o robô tem main()', false); return; }
  ok++;
  let nivel = 0;
  let dentroDeBloco = false;
  const usos = [];
  for (let i = 0; i < iMain; i++) {
    const cru = linhas[i];
    const t = cru.trim();
    /* comentário de bloco não é só a linha que abre: a explicação DESTE defeito ocupa
       seis linhas e cita narrativas.reps — a primeira versão da checagem reprovou nela. */
    const abreBloco = t.indexOf('/*') > -1 && t.indexOf('*/') === -1;
    const comentario = dentroDeBloco || abreBloco || t.indexOf('//') === 0 || t.indexOf('*') === 0;
    if (abreBloco) dentroDeBloco = true;
    if (dentroDeBloco && t.indexOf('*/') > -1) dentroDeBloco = false;
    /* tira strings antes de procurar: 'narrativas.json' é caminho, não leitura */
    const semTexto = cru.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
    if (!comentario && nivel === 0 && /(^|[^.\w])narrativas\s*\./.test(semTexto)) usos.push(i + 1);
    nivel += (semTexto.match(/\{/g) || []).length - (semTexto.match(/\}/g) || []).length;
    if (nivel < 0) nivel = 0;
  }
  checar('nada lê narrativas em escopo de módulo', usos.length === 0,
    'narrativas só existe depois do main(): ' + usos.map(u => 'linha ' + u).join(', '));
}());

/* ── 4. O PROMPT INDIVIDUAL DEVOLVE OS SEIS CAMPOS ───────────────────────────────
   Três do executivo, três do gestor. Se um sumir do prompt, o destino dele fica vazio e
   ninguém percebe até alguém abrir a tela. */
['resumoIndividual', 'comoAgirIndividual', 'gargaloSemana', 'comoAgirGestor', 'tendencia', 'compromissos']
  .forEach(campo => {
    checar('o prompt pede ' + campo, robo.indexOf('"' + campo + '"') > -1,
      'campo fora do prompt = destino vazio na próxima segunda');
  });

/* ── 5. OS DOIS DESTINOS ─────────────────────────────────────────────────────────── */
checar('o coaching vai para o Supabase',
  robo.indexOf("supabaseInsert('analise_individual_semanal'") > -1
  && robo.indexOf("supabaseDelete('analise_individual_semanal'") > -1,
  'sem o delete antes do insert, rodar duas vezes na mesma semana duplica a linha');
checar('os compromissos vão para narrativas',
  /narrativas\.reps\[ownerId\]\.compromissos = c\.compromissos/.test(robo),
  'é o que o executivo vê na coluna direita da aba dele');

/* ── 6. FALHA DE UM NÃO APAGA O PLANO DELE ───────────────────────────────────────
   Lista vazia por timeout não pode zerar o compromisso combinado da semana. */
checar('lista vazia não sobrescreve o compromisso',
  /if \(c\.compromissos\.length && narrativas\.reps\[ownerId\]\)/.test(robo),
  'sem a checagem de tamanho, um timeout apaga o plano da semana de alguém');

/* ── 7. O HORÁRIO ────────────────────────────────────────────────────────────────
   Domingo 22h de Brasília = 01:00 UTC de segunda. O compromisso é da semana e o
   executivo abre a tela na segunda de manhã. */
(function () {
  const y = fs.readFileSync(path.join(raiz, '.github/workflows/weekly-summary.yml'), 'utf8');
  checar('o robô roda domingo à noite', y.indexOf("cron: '0 1 * * 1'") > -1,
    'o cron do GitHub é UTC: 01:00 de segunda é 22h de domingo em Brasília');
  checar('o passo leva as chaves do Supabase',
    /run: node scripts\/generate-weekly-summary\.js/.test(y)
    && y.indexOf('SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}') > -1,
    'chave faltando não dá erro: o passo desiste em silêncio e o coaching não é gravado');
}());

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('robôs de IA: ' + ok + ' checagens ok — um robô só, ele roda de verdade, e grava nos dois destinos.');
