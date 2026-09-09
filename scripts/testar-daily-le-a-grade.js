/* ══════════════════════════════════════════════════════════════════════════════════════
   A DAILY DO GESTOR LÊ A GRADE DA SEMANA (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan, urgente: "eles prometeram a daily e nao apareceu para o gestor... todos com
   planejamento feito e gestor sem nada na aba, como eu mostro isso pra geral?".

   ══ O QUE EU MEDI NO BANCO, NA QUARTA 09/09 ═════════════════════════════════════════
   Índice 2 da grade (segunda = 0):

     Bruno 7 · Marco 7 · Kelly 6 · Wericles 6 · Sandro 5 · Renata 4 · André 3
     = 38 visitas planejadas para hoje, por sete pessoas.

   E a Daily do gestor mostrava ZERO. NÃO era bug de leitura nem RLS: são DUAS TABELAS.

     · a tela do executivo grava a grade 5×7 em `planos_semanais.grade` — sete pessoas
       mexeram nela hoje, entre 11:23 e 12:14;
     · a Daily do gestor lia SÓ `planos_diarios` (2 linhas hoje) e `dailies.prometido_*`
       (UMA pessoa preenchida; as onze linhas de dailies foram criadas pelo robô, com
       `criado_por: sistema-fetch-hubspot`, que escreve o realizado e não a promessa).

   A tela estava tecnicamente certa e praticamente inútil: a informação existia na tabela
   ao lado e ela não olhava. É a mesma família do defeito de [[cache-de-sessao-mente-na-outra-aba]]
   — o dado está no banco e a tela que devia mostrá-lo lê outro lugar.

   ══ E O QUE ESTA SUITE NÃO DEIXA ACONTECER ══════════════════════════════════════════
   O conserto tem um risco próprio: passar a chamar "promessa" o que é só grade. Planejar
   na grade da semana e travar o plano do dia são gestos DIFERENTES, e uma tela que diz
   "TRAVADA" sobre quem só encaixou contas é pior que a tela vazia de antes, porque
   afirma um gesto que ninguém fez.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const codigo = tpl.replace(/\/\*[\s\S]*?\*\//g, ' ');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
function corpoDe(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; }
    else if (c === '}') { d--; if (viu && d === 0) return tpl.slice(i, j + 1); }
    j++;
  }
  return '';
}

/* ── 1 · A LEITURA EXISTE, E ACOMPANHA A DOS PLANOS DO DIA ────────────────────────── */
conferir('a Daily do gestor lê planos_semanais',
  /from\('planos_semanais'\)[\s\S]{0,200}\.eq\('data_segunda', segundaDoFoco\)/.test(codigo),
  'sem esta consulta a aba abre vazia com o time todo planejado — foi o que aconteceu em 09/09');

conferir('e a falha de leitura NÃO vira "ninguém planejou"',
  /gradeLida = false/.test(codigo) && /let gradePorOwner = \{\}, gradeLida = true/.test(codigo),
  'erro de RLS ou rede virando time parado é acusação contra sete pessoas produzida por consulta quebrada');

conferir('a grade viaja no contexto, junto do dia em foco',
  /grades: gradePorOwner, gradeLida: gradeLida, diaEmFoco: dailyRefDate/.test(codigo),
  'sem o dia em foco a função não sabe qual coluna da grade ler, e o gestor caminha pelos dias na reunião');

/* ── 2 · A COLUNA CERTA DA GRADE ─────────────────────────────────────────────────────
   O índice sai da diferença entre o dia em foco e a segunda daquela linha — a mesma
   conta que a grade usa para se desenhar. Eu ERREI o dia da semana na primeira
   investigação (chamei quarta de terça) e li "Kelly tem 0 hoje" quando ela tem 6; o
   índice não pode depender da minha aritmética de cabeça. */
const daGrade = corpoDe('dg4SlotsDaGrade');
conferir('o índice do dia sai da data, não de uma tabela minha',
  /const dif = Math\.round\(\(new Date\(diaISO \+ 'T12:00:00'\) - new Date\(seg \+ 'T12:00:00'\)\) \/ 86400000\)/.test(daGrade),
  'contar dia de semana à mão foi como eu li 0 visitas para quem tinha 6');

conferir('dia fora da grade (sábado, domingo) devolve vazio em vez de estourar',
  /if \(!\(dif >= 0 && dif < g\.length\)\) return vazio;/.test(daGrade),
  'a grade é seg→sex; índice 5 num array de 5 é undefined e derruba o laço');

conferir('as constantes de slot são as do produto, não uma segunda cópia',
  /typeof PL6_RUA !== 'undefined'\) \? PL6_RUA : '__rua'/.test(daGrade) &&
  /typeof PL6_BLOQUEADO !== 'undefined'\) \? PL6_BLOQUEADO : '__b'/.test(daGrade),
  'bloqueio e volta de rua têm sentinela própria; recopiar o valor é a mesma regra em dois lugares');

conferir('bloqueio não conta como visita planejada',
  /if \(!cru \|\| cru === BLOQ\) return;/.test(daGrade),
  'slot bloqueado é hora indisponível, não conta a visitar — contá-lo infla a promessa do time');

conferir('volta de rua conta, e aparece dita como rua',
  /nome: 'volta de rua'/.test(daGrade) && /origem: 'rua'/.test(daGrade),
  'rua é trabalho de campo planejado; sumir com ela é subestimar o dia dele');

conferir('conta sem negócio no funil entra sem nome inventado',
  /nome: doFunil \? doFunil\.nome :/.test(daGrade) && /conta nova da prospecção/.test(daGrade),
  'o negócio pode não estar no snapshot; batizar o slot com um nome qualquer é pior que dizer o que se sabe');

/* ── 3 · O PLANO DO DIA TEM PRECEDÊNCIA ─────────────────────────────────────────────── */
const dados = corpoDe('dg4Dados');
conferir('quem tem plano do dia continua sendo lido de lá',
  /const daGrade = temDoPlano\s*\n?\s*\?/.test(dados) && /: dg4SlotsDaGrade\(/.test(dados),
  'o plano do dia é mais recente e mais específico que a grade da semana; a grade é o piso, não o teto');

conferir('e a grade só é consultada quando o plano do dia está vazio',
  /const temDoPlano = doPlano\.horas\.some/.test(dados),
  'ler as duas e somar contaria a mesma visita duas vezes');

/* ── 4 · PLANEJOU NÃO É PROMETEU ─────────────────────────────────────────────────────
   O risco do próprio conserto. A tela tem que distinguir os dois gestos. */
conferir('a bandeira de procedência viaja na linha da pessoa',
  /veioDaGrade: veioDaGrade/.test(codigo) && /const veioDaGrade = !temDoPlano && preenchidos\.length > 0/.test(codigo),
  'sem ela a tela não consegue dizer qual dos dois gestos aconteceu');

conferir('o cartão diz PLANEJOU NA GRADE, e não PROMESSA ABERTA',
  /x\.veioDaGrade \? 'PLANEJOU NA GRADE' : 'PROMESSA ABERTA'/.test(codigo),
  'dizer "promessa" sobre quem só encaixou contas na grade é a tela afirmando um gesto que ninguém fez');

conferir('e a cobrança pede a coisa certa',
  /x\.veioDaGrade \? 'pedir para travar o dia ▸' : 'cobrar a trava ▸'/.test(codigo),
  '"cobrar a trava" de quem não tem plano do dia manda o gestor cobrar o passo errado');

conferir('o KPI de planos montados diz quantos vieram pela grade',
  /naGrade\.length \? ' \(' \+ naGrade\.length \+ ' pela grade\)' : ''/.test(codigo) &&
  /const naGrade = medidos\.filter\(function \(x\) \{ return x\.veioDaGrade; \}\)/.test(codigo),
  '"7/7 planos montados" esconderia que seis deles nunca travaram o dia');

/* PRECISO, e não por proximidade: a primeira versão desta checagem procurava
   `prometido_visitas` a até 200 caracteres de `veioDaGrade` e reprovou porque as duas
   coisas ficam perto NO ARQUIVO — a declaração de `naGrade` é seguida da soma das
   promessas. Janela de caracteres não mede acoplamento; ler a expressão, sim. */
/* A CONTAGEM DA GRADE MUDOU DE `preenchidos` PARA `visitas` (09/09/26), e a REGRA desta
   checagem não: as duas somas continuam separadas, e é isso que ela protege.
   O motivo da troca: `preenchidos` são as chaves de `porHora`, ou seja as visitas COM
   horário. Depois de "pode colocar 15 contas no dia uai" e de a hora passar a ser escolha
   do executivo, um dia com onze visitas e três horas marcadas somava três — o número do
   topo deixou de descrever o dia. `visitas` é a lista inteira, com hora e sem. */
conferir('a promessa em número vem de dailies, e o planejado é uma conta separada',
  /const somaVisitas = medidos\.reduce\(function \(t, x\) \{ return t \+ \(Number\(x\.daily\.prometido_visitas\) \|\| 0\); \}, 0\);/.test(codigo) &&
  /const somaPlanejadas = medidos\.reduce\(function \(t, x\) \{ return t \+ x\.visitas\.length; \}, 0\);/.test(codigo),
  'somar slot da grade dentro de "visitas prometidas" inventaria promessa que ninguém deu');

/* ══ A VISITA SEM HORA EXISTE, E APARECE ═════════════════════════════════════════════
   Julyan: "pode colocar 15 contas no dia uai, não so 7!" + "conserte a daily do gestor
   junto, tudo na mesma sincronia".

   São 15 vagas por dia e 7 janelas de horário. Logo um dia pode ter oito visitas SEM
   hora — e antes desta rodada elas: (1) eram descartadas por `if (!hora) return`, (2)
   depois, na minha primeira tentativa, colidiam todas na chave vazia de `porHora` e só a
   última sobrava, e (3) mesmo contadas, não eram DESENHADAS, porque o laço da tela
   iterava as sete horas. Três formas de a mesma visita não existir. */
conferir('a visita sem hora vai para semHora, que é lista',
  /const semHora = \[\];/.test(codigo) &&
  /if \(!hora \|\| porHora\[hora\]\) semHora\.push\(item\);/.test(codigo) &&
  /return \{ horas: horas, porHora: porHora, semHora: semHora, daGrade: true/.test(codigo),
  'com 8 visitas sem hora, um objeto indexado por hora colide todas na chave vazia — '
  + '"some" viraria "some, menos uma"');

conferir('e a tela do gestor desenha as visitas, não as sete horas',
  /const visitas = preenchidos\.map\(function \(h\) \{ return grade\.porHora\[h\]; \}\)\s*\n?\s*\.concat\(grade\.semHora \|\| \[\]\);/.test(codigo) &&
  /const slots = x\.visitas\.map\(function \(sl\) \{/.test(codigo),
  'o laço iterava grade.horas: sete linhas fixas para um dia de quinze, e as sem hora em '
  + 'nenhuma delas');

/* ══ DEPOIS DA HORA, NADA ABORTA A VISITA ══════════════════════════════════════════
   Esta guarda nasceu de uma sabotagem que PASSOU: eu recoloquei `if (!hora) return;` no
   laço da grade — o defeito original de hoje, o que fazia a visita sem horário sumir da
   tela do gestor — e as quatro checagens acima ficaram verdes. Elas medem o balde
   (existe, é lista, é devolvido) e o laço da tela (itera visitas); nenhuma media se a
   visita CHEGA ao balde.

   O `return {` da IIFE que monta o item é legítimo, e é por isso que a busca é por
   `return;` com ponto e vírgula: no trecho que vai da hora ao `planejados += 1`, um
   return seco é a única forma de a visita não entrar em nenhuma das duas saídas. */
const laco = codigo.slice(codigo.indexOf('coluna.forEach(function (v, si)'));
const depoisDaHora = laco.slice(laco.indexOf('const hora ='), laco.indexOf('planejados += 1;'));
conferir('depois de a hora ser calculada, nada aborta a visita',
  laco.indexOf('coluna.forEach') === 0
    && depoisDaHora.length > 40
    && depoisDaHora.indexOf('return;') === -1,
  'um return seco entre a hora e a contagem descarta a visita sem horário — o defeito de 09/09 que sumiu com as 8 últimas do dia na tela do gestor');

conferir('a hora ausente é rótulo honesto, não relógio inventado',
  /h: sl\.hora \|\| 'sem hora',/.test(codigo),
  'ele planejou a visita e não marcou a hora — escrever um relógio ali inventa o horário '
  + 'que ele não deu');

/* ESTE NÚMERO IA ENGANAR ELE, e só apareceu quando eu fui conferir a checagem acima.
   Medido em 09/09: promessa 2, planejado 38. Sozinho, o "2" faz o gestor abrir a reunião
   achando que o time vai fazer duas visitas no dia. */
conferir('e a tela mostra os dois, com o nome do gesto de cada um',
  /somaPlanejadas > somaVisitas/.test(codigo) &&
  /somaPlanejadas \+ ' planejadas na grade'/.test(codigo),
  'promessa 2 com 38 planejadas, sem dizer as duas, é o número certo levando à conclusão errada');

/* ── 5 · NADA É ESCRITO ─────────────────────────────────────────────────────────────── */
conferir('esta leitura não grava em planos_semanais',
  !/from\('planos_semanais'\)[\s\S]{0,160}\.(insert|update|upsert|delete)\(/.test(
    codigo.slice(codigo.indexOf('segundaDoFoco') - 400, codigo.indexOf('segundaDoFoco') + 900)),
  'a Daily do gestor é espelho; escrever no plano de alguém a partir dela é mexer no trabalho dele sem ele saber');

/* ══ O CONTRATO DE dg4TelaHTML É FECHADO ══════════════════════════════════════════
   Em 09/09 a Daily do gestor ficou INTEIRA em "Carregando...": `avisoForaDoCampo` era
   calculado em dg4Dados e lido dentro do markup de dg4TelaHTML. Duas funções — o nome
   não existia no escopo de quem escrevia o HTML, e o ReferenceError levou a aba toda.

   Build e 37 suítes passaram: nenhuma executa dg4TelaHTML, e a guarda de ordem de
   declaração vigia uso-antes-de-declarar DENTRO de uma função, que é outra pergunta.
   Quem pegou foi abrir a tela. Esta guarda existe para a próxima vez não depender disso.

   COMO ELA MEDE: todo `${nome}` do corpo de dg4TelaHTML que seja um identificador nu
   (sem ponto) tem de ser um nome que EXISTE ali — declarado dentro da função, parâmetro
   dela, ou global conhecido do template. Qualquer outro só pode chegar por `d.`.
   Ela não julga o valor; julga a existência, que é exatamente o que estourou. */
const telaDg4 = corpoDe('dg4TelaHTML');
const semComentario = telaDg4.replace(/\/\*[\s\S]*?\*\//g, ' ');
const declaradosDg4 = new Set(['d', 'esc', 'DATA', 'PL6_SLOTS', 'PL6_HORAS', 'Math', 'String',
  'Number', 'Object', 'Array', 'JSON', 'Date', 'Boolean', 'window', 'document']);
/* nomes que nascem dentro da função: const/let/var, parâmetros de callback, o for e
   — o que eu esqueci na primeira versão desta guarda — a DESESTRUTURAÇÃO do contrato,
   que é justamente como dg4TelaHTML recebe os quinze nomes que usa. Sem ela a guarda
   acusava quinze falsos e escondia o único verdadeiro. */
const reDestr = /(?:const|let|var)\s*\{([^}]*)\}\s*=/g;
let md;
while ((md = reDestr.exec(semComentario)) !== null) {
  md[1].split(',').forEach(function (a) {
    const nome = a.split(':').pop().trim().split(/[\s=]/)[0];
    if (/^[A-Za-z_$][\w$]*$/.test(nome)) declaradosDg4.add(nome);
  });
}
/* nomes que nascem dentro da função: const/let/var, parâmetros de callback e o for */
let m;
const reDecl = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)|function\s*\(([^)]*)\)|\(([^)]*)\)\s*=>|for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
while ((m = reDecl.exec(semComentario)) !== null) {
  [m[1], m[4]].forEach(function (nome) { if (nome) declaradosDg4.add(nome); });
  [m[2], m[3]].forEach(function (lista) {
    if (!lista) return;
    lista.split(',').forEach(function (a) {
      const nome = a.trim().split(/[\s=]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(nome)) declaradosDg4.add(nome);
    });
  });
}
const forasDoContrato = [];
const reUso = /\$\{\s*([A-Za-z_$][\w$]*)\s*([^\w$.(]|$)/g;
while ((m = reUso.exec(semComentario)) !== null) {
  if (!declaradosDg4.has(m[1]) && forasDoContrato.indexOf(m[1]) === -1) forasDoContrato.push(m[1]);
}
conferir('todo nome que o markup do gestor lê existe no escopo dele',
  telaDg4.length > 2000 && forasDoContrato.length === 0,
  forasDoContrato.length
    ? ('dg4TelaHTML lê ' + forasDoContrato.join(', ') + ' sem receber pelo contrato — '
      + 'ReferenceError leva a aba inteira para "Carregando...", como avisoForaDoCampo em 09/09')
    : 'não consegui ler o corpo de dg4TelaHTML — sem corpo não há medição, e verde aqui seria falso');

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('daily do gestor lê a grade: ' + ok + ' checagens ok — o planejamento de sete pessoas'
  + ' aparece, e planejar continua diferente de prometer.');
