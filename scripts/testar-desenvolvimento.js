/* ══ SUÍTE DA ABA DESENVOLVIMENTO DO EXECUTIVO (05/09/26) ═══════════════════════════
   A aba foi reconstruída a partir da prancha final (prompt-claude-code-desenvolvimento-
   do-zero.md) e ganhou de uma vez: barra do quadro, duas colunas, fala pronta, "como
   fazer" por prioridade, contrastes, benchmark do time, rodapé de perguntas e conquistas.
   Nada disso tinha trava.

   O que esta suíte protege são as REGRAS, não o desenho:
     1. nenhum clique promete destino que não existe (o pedido literal do Julyan);
     2. prioridade que veio de texto livre NÃO ganha CTA — CTA adivinhado é pior que
        nenhum, e essa decisão já custou uma volta em 30/08;
     3. a fala pronta cobre as mesmas etapas que o gesto — senão ela some justamente na
        etapa em que o executivo está travado;
     4. o benchmark do time NÃO vaza dado de colega para o executivo;
     5. o rodapé só faz pergunta que ele sabe responder com número real;
     6. o reskin fica dentro da aba — as classes são compartilhadas com o Meu Funil e com
        as telas do gestor.
   ══════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(raiz, 'template/cockpit.template.html'), 'utf8');
const montar = require('./montar-dados.js');

const falhas = [];
let ok = 0;
function checar(nome, condicao, porque) {
  if (condicao) { ok++; return; }
  falhas.push(nome + (porque ? ' — ' + porque : ''));
}

/* ── 1. DESTINOS ─────────────────────────────────────────────────────────────────
   Todo data-acao-ir escrito no template usa um tipo que a fiação sabe tratar. Um tipo
   novo escrito com outro nome (ir/goto/abrir) cai no else silencioso e o clique morre. */
const TIPOS = ['visao', 'etapa', 'aba'];
const tiposUsados = [...template.matchAll(/data-acao-ir="(?:\$\{esc\((?:ir|p)\.tipo\)\}|([a-z]+))"/g)]
  .map(m => m[1]).filter(Boolean);
checar('todo destino usa um tipo que a fiação trata',
  tiposUsados.every(t => TIPOS.includes(t)),
  'tipo fora de ' + TIPOS.join('/') + ' cai no else e o clique não leva a lugar nenhum: ' + tiposUsados.join(', '));

checar('a fiação trata os três tipos',
  TIPOS.every(t => template.indexOf("tipo === '" + t + "'") > -1),
  'um tipo emitido e não tratado é o clique morto clássico');

/* Os três caminhos são os que já existem no produto — reusar é o que impede este atalho
   de envelhecer sozinho quando o Meu Funil mudar. */
checar('os destinos reusam os caminhos que já existem',
  template.indexOf('irParaMeuFunilVisao(valor)') > -1
  && template.indexOf('meuFunilFiltroEtapa = valor') > -1,
  'um quarto caminho próprio para o funil se desatualiza sozinho');

/* ── 2. CTA SÓ COM DESTINO DERIVADO ──────────────────────────────────────────────
   As ações da prosa semanal entram com ir:null. Se um dia alguém mapear a frase livre
   para um destino, o CTA passa a apontar para um lugar adivinhado. */
checar('prioridade vinda da prosa semanal não ganha CTA próprio',
  /acoesSemana \|\| \[\]\)\.map\(t => \(\{ txt: t, ir: null \}\)\)/.test(template),
  'texto livre da análise não tem categoria — CTA ali é chute');

/* PRESA AO CÓDIGO, DE NOVO (05/09/26): esta checagem exigia a linha `const cta = ir`, e o
   quadro copiado do mockup escreve o botão inline. A regra nunca mudou — botão de
   prioridade só existe dentro de um condicional sobre o destino. É isso que ela mede
   agora, e é isso que ela deveria ter medido desde o começo. */
checar('o CTA só é desenhado quando existe destino',
  /\$\{pr\.ir \?[\s\S]{0,140}data-acao-ir/.test(template),
  'botão de prioridade fora do condicional nasce sem saber para onde ir');

/* ── 3. A FALA PRONTA COBRE AS MESMAS ETAPAS QUE O GESTO ─────────────────────────── */
function idsDoCatalogo(nome) {
  const i = template.indexOf('const ' + nome + ' = {');
  if (i < 0) return [];
  const fim = template.indexOf('\n};', i);
  return [...template.slice(i, fim).matchAll(/'(\d{9,})':/g)].map(m => m[1]);
}
const idsGesto = idsDoCatalogo('GESTO_DA_ETAPA');
const idsFala = idsDoCatalogo('FALA_DA_ETAPA');
checar('a fala pronta existe para toda etapa que tem gesto',
  idsGesto.length > 0 && idsGesto.every(id => idsFala.includes(id)),
  'etapa com gesto e sem fala deixa o bloco sumir justamente onde o executivo travou. '
  + 'gesto: ' + idsGesto.length + ', fala: ' + idsFala.length);

checar('a fala pronta não aparece sem gargalo',
  /falaPronta = \(\(\) => \{[\s\S]{0,220}gestoVivo\.saudavel/.test(template),
  'sem etapa travada não há o que pedir — script genérico é conselho de biscoito');

/* ── 4. O BENCHMARK NÃO VAZA COLEGA ──────────────────────────────────────────────
   Roda de verdade contra o montador: é o mesmo corte que já fechou o vazamento de
   snapshotReps em 07/08, e ele precisa continuar fechado com o campo novo. */
(function () {
  let dados;
  try { dados = montar.montarDadosCompletos(); } catch (e) { dados = null; }
  if (!dados || !dados.habitosTime) {
    checar('o agregado de hábitos existe no payload do gestor', false,
      'sem ele o bloco "seu jogo vs. os melhores" não tem com o que comparar');
    return;
  }
  ok++;
  const algumId = Object.keys(dados.habitosTime.porRep || {})[0];
  const doRep = montar.filtrarParaPapel(dados, { role: 'rep', ownerId: algumId, nome: 'teste' });
  checar('o executivo não recebe o hábito dos colegas',
    !!doRep.habitosTime && !doRep.habitosTime.porRep,
    'porRep tem o número de cada pessoa do time — o executivo recebe só o dele e o agregado');
  checar('o executivo recebe o próprio hábito e o benchmark',
    !!(doRep.habitosTime && doRep.habitosTime.meu && doRep.habitosTime.benchmark),
    'sem os dois o bloco não desenha, e a coluna da direita fica com um buraco');
  checar('quem não tem funil aberto não entra na conta do time',
    /if \(!abertos\) return \{ cadencia: null/.test(fs.readFileSync(path.join(raiz, 'scripts/montar-dados.js'), 'utf8')),
    'n/0 não é 0%: é não medido, e um zero desses derruba o benchmark de todo mundo');
}());

/* ── 5. O RODAPÉ SÓ PERGUNTA O QUE SABE RESPONDER ────────────────────────────────
   Cada pergunta do "Entenda seus números" nasce junto com a resposta, no mesmo objeto.
   Uma pergunta solta na lista seria um chip que abre uma caixa vazia. */
const blocoPerguntas = (() => {
  const i = template.indexOf('const perguntasNumeros = (() => {');
  return i < 0 ? '' : template.slice(i, template.indexOf('const entendaHTML', i));
})();
const qtdQ = (blocoPerguntas.match(/\n\s+q: '/g) || []).length;
const qtdA = (blocoPerguntas.match(/\n\s+a: /g) || []).length;
checar('toda pergunta do rodapé nasce com resposta',
  qtdQ > 0 && qtdQ === qtdA,
  'perguntas: ' + qtdQ + ', respostas: ' + qtdA + ' — chip que abre caixa vazia é clique morto com outro nome');

checar('a resposta não vai buscar dado no clique',
  template.indexOf('const respostasNumeros = perguntasNumeros;') > -1
  && !/data-dev-q[\s\S]{0,400}await fetch/.test(template),
  'a prancha pede resposta pré-computada: na rua, em 3G, ida de rede no clique é tela parada');

/* ── 6. CONTRASTE SÓ COM GAP ─────────────────────────────────────────────────────── */
checar('contraste com gap zero não entra',
  /contrastesDoExecutivo[\s\S]{0,320}\.filter\(c => c\.n > 0\)/.test(template),
  'quem já fecha a visita dentro do CRM não precisa ler que devia');

checar('o texto do contraste é conteúdo, não geração',
  template.indexOf('const CONTRASTES_DE_HABITO = [') > -1,
  'hábito de venda inventado em tempo de render vira conselho genérico');

/* ── 7. O ACORDO MARCADO NÃO SE DECLARA CONCLUÍDO ────────────────────────────────── */
checar('acordo marcado fica aguardando o gestor',
  template.indexOf("situacao = 'aguardando validação do gestor'") > -1
  && template.indexOf("situacao = 'concluído'") === -1,
  'quem fecha o acordo é o gestor no 1:1 — a linha dizia "concluído" e desmentia a nota logo abaixo dela');

/* ── 8. O RESKIN FICA DENTRO DA ABA ──────────────────────────────────────────────
   .acao, .sec, .pcard, .diag e .um são compartilhadas com o Meu Funil e com o gestor.
   Uma regra do bloco sem o prefixo repinta as outras telas — e a do gestor eu não
   consigo ver no preview local. */
(function () {
  const i = template.indexOf('RESKIN · ABA DESENVOLVIMENTO DO EXECUTIVO');
  if (i < 0) { checar('o bloco do reskin existe', false); return; }
  const bloco = template.slice(i, template.indexOf('/* ═══', i + 400) > -1 ? template.indexOf('@media (max-width:1240px)', i) : template.length);
  const linhasDeRegra = bloco.split('\n').filter(l => /^\s{2}[.#a-zA-Z]/.test(l) && l.indexOf('{') > -1);
  /* '#viewPDIs' em qualquer forma serve: o fundo da pagina e por body:has(#viewPDIs
     .active), que tambem esta preso a aba. O que nao pode e regra sem a aba no seletor. */
  const forasDeEscopo = linhasDeRegra.filter(l => l.indexOf('#viewPDIs') === -1 && l.indexOf('@') === -1);
  checar('nenhuma regra do reskin escapa da aba',
    forasDeEscopo.length === 0,
    'estas repintariam o Meu Funil e as telas do gestor: ' + forasDeEscopo.slice(0, 3).map(l => l.trim().slice(0, 40)).join(' | '));
}());

checar('o fundo da página só muda nesta aba',
  template.indexOf('body.exec-v3:has(#viewPDIs.active){background:#E9E5DC;}') > -1,
  'sem o :has, o cockpit inteiro trocaria de fundo');

/* ── 9. O QUE JÁ EXISTIA E NÃO PODE SUMIR ────────────────────────────────────────── */
['focoDeHabilidadeHTML', 'buildIndicadoresExecutivoHTML', 'compromissosComPrazo', 'destravarFunil']
  .forEach(fn => checar('continua existindo: ' + fn, template.indexOf('function ' + fn) > -1));

/* ── 10. O TREINO DA SEMANA ──────────────────────────────────────────────────────
   Coluna aditiva em pdi_compromissos (treino_feito_em, treino_foco), autorizada pelo
   Julyan em 05/09. Duas regras que nao podem cair: */
/* A primeira versão desta checagem media a FUNÇÃO inteira e reprovava sozinha: o corpo
   tem `{ checked: [], data: '' }` como valor padrão do cache, que não é o upsert. O que
   importa é o PAYLOAD que sobe — é ele que o Postgres aplica. */
checar('o treino grava sem apagar os acordos', (function () {
  const i = template.indexOf('function savePdiTreino(');
  if (i < 0) return false;
  const u = template.indexOf(".upsert({", i);
  if (u < 0 || u > i + 900) return false;
  const fim = template.indexOf('}, {', u);
  if (fim < 0) return false;
  return template.slice(u, fim).indexOf('checked') === -1;
}()),
  'mandar checked no payload faria o treino sobrescrever os acordos do 1:1 com o que estivesse no cache');
/* E aqui o que importa é o GUARDA: sem ele a linha do treino aparece para todo mundo,
   inclusive para quem nunca marcou — que é o oposto do que a coluna significa. */
checar('o gestor ve o treino, e só quando ele existe', (function () {
  const i = template.indexOf('idPrefix}PdiCount');
  if (i < 0) return false;
  const trecho = template.slice(i, i + 900);
  return trecho.indexOf("if (!est.treinoEm) return ''") > -1 && trecho.indexOf('treino de habilidade feito') > -1;
}()),
  'sem isso o executivo marca e ninguem ve — e a promessa da tela dele e que o gestor ve');
checar('treino nao marcado e ausencia, nao falso',
  template.indexOf('treinoEm: row.treino_feito_em || null') > -1,
  'quem nunca marcou nao pode aparecer como quem desmarcou');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('desenvolvimento: ' + ok + ' checagens ok — todo clique tem destino, o benchmark não vaza colega, e o reskin não sai da aba.');
