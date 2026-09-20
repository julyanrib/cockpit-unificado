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
/* ESTA CHECAGEM CRAVAVA A ESCRITA EXATA `c.compromissos.length` e reprovou em 19/09,
   quando o compromisso passou a sair normalizado ({textos, prazos}) e a expressão virou
   `c.compromissos.textos.length`. A PROTEÇÃO CONTINUAVA INTEIRA — só a grafia mudou.
   Agora ela mede a REGRA: existe uma condição de tamanho guardando a escrita em
   narrativas, qualquer que seja o caminho até a lista. Terceira guarda deste repo a
   morrer por cravar grafia em vez de comportamento. */
checar('lista vazia não sobrescreve o compromisso',
  /if \(c\.compromissos(\.\w+)?\.length && narrativas\.reps\[ownerId\]\)/.test(robo),
  'sem a checagem de tamanho, um timeout apaga o plano da semana de alguém');

/* ── 7. O HORÁRIO, E ELE NÃO PODE ANDAR SOZINHO ──────────────────────────────────
   Sexta 20h de Brasília = 23:00 UTC de sexta (pedido do Julyan, 19/09/26).

   A VERSÃO ANTERIOR DESTA CHECAGEM CRAVAVA O DOMINGO, e foi ela que reprovou quando
   eu mudei o dia — cumpriu o papel. Mas cravar o horário sozinho protege metade: o
   que realmente quebra é o cron andar SEM o corte de "semana fechada" andar junto.
   Medido antes de mexer: com o corte em sexta 23:59 e o robô às 20h, ele reportaria
   07/09–11/09 — a semana RETRASADA — e escreveria a leitura da IA sobre ela. Seria o
   defeito de 16/09 de novo.

   Então a checagem passou a exigir os DOIS lados, e a comparar um com o outro. */
(function () {
  const y = fs.readFileSync(path.join(raiz, '.github/workflows/weekly-summary.yml'), 'utf8');
  const cmp = fs.readFileSync(path.join(raiz, 'scripts/fetch-weekly-comparison.js'), 'utf8');

  const mCron = /cron: '(\d+) (\d+) \* \* (\d)'/.exec(y);
  checar('o robô tem um cron semanal declarado', !!mCron,
    'sem cron ele só roda por disparo manual, e ninguém lembra de disparar');

  checar('o robô roda sexta 20h de Brasília', !!mCron && mCron[0] === "cron: '0 23 * * 5'",
    'o cron do GitHub é UTC: 23:00 de sexta é 20h de sexta em Brasília — veio '
      + (mCron ? mCron[0] : 'nada'));

  /* O CORTE DA SEMANA, LIDO DO CÓDIGO e convertido para a mesma unidade do cron. */
  const mCorte = /const sextaDaCorrente = semanaCorrente \+ (\d+) \* DAY \+ (\d+) \* HORA;/.exec(cmp);
  checar('o corte de semana fechada está declarado em dia e hora', !!mCorte,
    'sem ele não dá para comparar o cron com a regra, e os dois andam separados');

  if (mCron && mCorte) {
    /* cron: minuto hora * * diaDaSemana(UTC, 5 = sexta) → hora BRT = hora UTC - 3 */
    const horaCronBRT = (Number(mCron[2]) - 3 + 24) % 24;
    const diaCron = Number(mCron[3]);
    const diaCorte = Number(mCorte[1]);   /* 4 dias depois da segunda = sexta */
    const horaCorte = Number(mCorte[2]);
    checar('o cron cai no MESMO dia em que a semana fecha',
      diaCron === diaCorte + 1,
      'o corte é segunda+' + diaCorte + ' dias (dia ' + (diaCorte + 1) + ' da semana) e o '
        + 'cron é no dia ' + diaCron + ' — rodar antes de fechar faz o robô escrever a '
        + 'leitura da IA sobre a semana RETRASADA');
    checar('e NÃO ANTES da hora em que ela fecha',
      horaCronBRT >= horaCorte,
      'o robô rodaria às ' + horaCronBRT + 'h BRT e a semana só fecha às ' + horaCorte
        + 'h — foi exatamente isso que eu ia publicar antes de medir');
  }

  /* E A JANELA DE DADOS NÃO ENCOLHE COM O CORTE. Se ela terminasse às 20h, o negócio
     fechado na sexta à noite cairia em semana NENHUMA — a próxima só começa na segunda. */
  checar('a janela de dados continua indo até o fim da sexta',
    /const atualFim = new Date\(atualInicio\.getTime\(\) \+ 5 \* DAY - 1\);/.test(cmp),
    'encurtar a janela junto com o corte perderia as quatro horas finais de sexta para '
      + 'sempre; do jeito que está, elas entram na rodada seguinte do daily-refresh');
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
