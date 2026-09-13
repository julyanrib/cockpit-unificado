// scripts/testar-hora-do-proximo-passo.js
//
// A HORA DO PRÓXIMO PASSO CHEGA NAS TRÊS PONTAS (11/09/26).
//
// Bruno, planejando a semana: "pelo funil ao avançar etapa, não dá pra agendar a reunião.
// Só tem dia e não horário. Tô agendando esse lead para uma reunião terça às 15h —
// agendava aí e já iria pro planejamento e agenda de terça."
//
// O QUE ESTAVA ERRADO, medido antes de mexer:
//   · o formulário da ficha tinha `type="date"` e nada de hora;
//   · a rota cravava `Date.UTC(ano, mes, dia, 12, 0, 0)` — 09:00 de Brasília — para TODO
//     passo datado;
//   · `espelharPassoNasTelas` JÁ tinha o parâmetro `hora` desde que nasceu, e o site da
//     ficha NUNCA o passava;
//   · e o eco na Agenda cravava '09:00' na mão.
//
// São QUATRO pontos, e a hora só vale alguma coisa se os quatro mudarem juntos. É por isso
// que esta suíte mede a cadeia inteira em vez de um ponto: três dos quatro certos e um
// errado é o executivo marcando 15h, lendo "✓ salvo" e o compromisso aparecendo às 9h —
// que é exatamente o defeito de antes, com mais trabalho.

const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

let ok = 0;
const falhas = [];
function checar(nome, cond, dica) {
  if (cond) { ok += 1; console.log('  ok  ' + nome); return; }
  falhas.push(nome + (dica ? '  — ' + dica : ''));
  console.log('  FALHA  ' + nome + (dica ? '  — ' + dica : ''));
}

const tplCru = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const tpl = tplCru.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ── 1 · A TELA: o campo existe e é lido ────────────────────────────────────────────── */
checar('a ficha do negócio tem campo de hora ao lado do dia',
  /<input type="time" class="ficha-passo-hora"/.test(tpl)
    && /const campoHora = container\.querySelector\('\.ficha-passo-hora'\);/.test(tpl),
  'sem o campo, o resto da cadeia nunca recebe hora');

checar('e a hora fora de formato é recusada em vez de virar padrão',
  /const horaEscolhida = \/\^\(\[01\]\?\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$\/\.test\(horaCrua\) \? horaCrua : '';/.test(tpl)
    && /A hora precisa estar no formato HH:MM\./.test(tpl),
  'cair no padrão em silêncio é como ele marca 15h, lê "✓ salvo" e o compromisso sai às 9h');

/* ── 2 · O PEDIDO: a hora viaja, e só quando existe ─────────────────────────────────── */
checar('a hora viaja no corpo do pedido, e só quando ele escolheu uma',
  /\.\.\.\(horaEscolhida \? \{ hora: horaEscolhida \} : \{\}\),/.test(tpl),
  'mandar o padrão daqui criaria um segundo lugar para a convenção do "compromisso do dia"');

/* ── 2b · O OUTRO FORMULÁRIO, o do MEU FUNIL ───────────────────────────────────────────
   São DOIS formulários de próximo passo, e o Bruno reclamou do do funil ("pelo funil ao
   avançar etapa... só tem dia e não horário"). O print que ele mandou era da FICHA, e por
   isso o primeiro conserto foi só nela — medido depois na produção, com a sessão dele:
   clicar em "próximo passo" num cartão do Meu funil abria `.fn3-passo-in` (type=date) e
   mais nada. Dois lugares para a mesma ação é como um conserto cobre metade do pedido. */
checar('o cartão do Meu funil também tem hora ao lado do dia',
  /<input type="time" step="900" class="fn3-passo-in" data-fn3-passo-hora=/.test(tpl)
    && /const campoH = el\.querySelector\('\[data-fn3-passo-hora="' \+ id \+ '"\]'\);/.test(tpl),
  'era o formulário de que ele reclamou; o da ficha era o outro');

checar('e o gravador do funil valida a hora e a manda ao servidor',
  /const gravarPasso = async function \(id, dataISO, botao, horaCrua\) \{/.test(tpl)
    && /\.\.\.\(hora \? \{ hora: hora \} : \{\}\),/.test(tpl)
    && /A hora precisa estar no formato HH:MM — não datei nada\./.test(tpl),
  'hora malformada num compromisso com cliente é pior do que hora nenhuma');

checar('e o espelho do funil usa a hora escolhida, não 12:00Z fixo',
  /const quando = hora/.test(tpl)
    && /\(dataISO \+ 'T' \+ String\(Number\(hora\.slice\(0, 2\)\) \+ 3\)\.padStart\(2, '0'\)/.test(tpl)
    && /: \(dataISO \+ 'T12:00:00\.000Z'\);/.test(tpl),
  'espelho em 9h para um compromisso das 15h é o mesmo erro, só do lado de cá');

/* ── 3 · O ESPELHO: o quinto argumento finalmente é passado ─────────────────────────── */
checar('o espelho das telas recebe a hora',
  /espelharPassoNasTelas\(\{ id: dealId,[^)]*\}, data, passoTipoAtivo, l\.ownerId, horaEscolhida\);/.test(tpl),
  'o parâmetro existia desde que o espelho nasceu e este site nunca o passou');

/* REESCRITA EM 13/09/26: o ultimo argumento deixou de se chamar `ownerId`. O dono
   passou a ser RESOLVIDO dentro de espelharPassoNasTelas (`dono`), porque quatro dos
   cinco sites do passo o entregavam undefined e o espelho saia calado — foi esse o
   defeito que fez o proximo passo nao chegar ao Planejamento. A intencao da checagem
   e a hora, e ela continua inteira: 09:00 so quando NAO houve escolha. */
checar('e o eco na Agenda deixou de cravar 09:00',
  /\}, dataISO, \(hora && \/\^\\d\{1,2\}:\\d\{2\}\$\/\.test\(String\(hora\)\)\) \? String\(hora\) : '09:00', dono, tipo\);/.test(tpl),
  'espelho cravado em 09:00 diverge do dado real por seis horas num compromisso das 15h');

/* ══ COMPROMISSO NAO NASCE VENCIDO (13/09/26) ═══════════════════════════════════════
   Medido na producao num domingo: "Mover de etapa" trazia o proximo passo obrigatorio
   com 11/09 — dois dias no passado. desfechoDataSugerida usava nearestBusinessDay, que
   anda PARA TRAS. Quatro sites sugerem passo por ela.

   A regra e rodada de verdade aqui, e nao so procurada no texto: proximoDiaUtil e pura
   e cabe num vm — guarda que so procura nome nao teria pegado o sentido do laco. */
checar('a data sugerida de passo anda para a FRENTE, nunca para trás',
  /function proximoDiaUtil\(dateISO\) \{\s*\n\s*let d = dateISO;\s*\n\s*while \(isWeekend\(d\)\) d = addDays\(d, 1\);/.test(tpl)
    && /return typeof proximoDiaUtil === 'function' \? proximoDiaUtil\(base\) : base;/.test(tpl),
  'no domingo a sugestão caía em sexta: régua encurtada, negócio já em atraso, e o '
    + 'espelho do plano recusando a data que a própria tela sugeriu');

checar('e a Daily continua andando para trás, que é o certo lá',
  /function nearestBusinessDay\(dateISO\) \{\s*\n\s*let d = dateISO;\s*\n\s*while \(isWeekend\(d\)\) d = addDays\(d, -1\);/.test(tpl)
    && /let dailyRefDate = nearestBusinessDay\(isoDate\(new Date\(\)\)\);/.test(tpl),
  'a Daily mostra o último dia útil FECHADO — trocar o sentido lá abriria um dia que '
    + 'ainda não aconteceu');

/* A REGRA RODANDO, com os sete dias da semana: sabado e domingo tem de sair na segunda,
   e dia util tem de sair nele mesmo (senao a sugestao de D+2 viraria D+3). */
checar('e o laço, rodado, leva sábado e domingo para segunda',
  (function () {
    const isWeekend = iso => [0, 6].indexOf(new Date(iso + 'T12:00:00').getDay()) > -1;
    const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const proximoDiaUtil = dateISO => { let d = dateISO; while (isWeekend(d)) d = addDays(d, 1); return d; };
    return proximoDiaUtil('2026-09-12') === '2026-09-14'   /* sábado  -> segunda */
      && proximoDiaUtil('2026-09-13') === '2026-09-14'      /* domingo -> segunda */
      && proximoDiaUtil('2026-09-14') === '2026-09-14'      /* segunda fica */
      && proximoDiaUtil('2026-09-18') === '2026-09-18';     /* sexta fica */
  }()),
  'um laço para o lado errado passa despercebido no texto e só aparece no fim de semana');

/* O PLANO SEMANAL já sabia usar a hora — a guarda existe para ele continuar sabendo. */
checar('o plano da semana escolhe a faixa pela hora combinada',
  tpl.indexOf('if (hora && /^\\d{1,2}:\\d{2}$/.test(String(hora))) {') > 0
    && /for \(let k = 0; k < PL6_HORAS\.length; k\+\+\) \{/.test(tpl)
    && tpl.indexOf('String(PL6_HORAS[k]) <= String(hora) && livre(k)') > 0,
  'sem isto a conta cai na primeira faixa livre do dia, e não na hora combinada');

/* ── 4 · O SERVIDOR: o timestamp e o marcador ──────────────────────────────────────── */
const rotaPasso = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'criar-nota-negocio.js'), 'utf8');

checar('a rota aceita hora e a usa no horário da tarefa',
  /const \{ dealId, texto, data, tipo, hora \} = req\.body \|\| \{\};/.test(rotaPasso)
    && /const dataTarefaMs = Date\.UTC\(ano, mes, dia, horaH \+ 3, horaM, 0\);/.test(rotaPasso),
  'o horário do compromisso é o hs_timestamp; sem isto ele continua 12:00 UTC');

checar('sem hora escolhida, o padrão continua sendo 09:00 de Brasília',
  /let horaH = 9, horaM = 0;/.test(rotaPasso),
  'mudar o padrão faria toda tarefa antiga divergir do espelho');

checar('e hora em formato inválido é 400, não um palpite',
  /return res\.status\(400\)\.json\(\{ erro: 'Campo "hora" deve estar no formato HH:MM\.' \}\);/.test(rotaPasso),
  'hora inventada num compromisso com cliente é pior do que hora nenhuma');

/* ── 5 · UM MARCADOR SÓ, PARA AS DUAS ROTAS QUE CRIAM TAREFA ───────────────────────── */
/* O documento entregue ao time do RPA diz "toda tarefa criada pelo Cockpit leva o
   marcador". Era falso para esta rota — a que o executivo mais usa — porque ela criava a
   tarefa SEM CORPO. E escrever o formato aqui à mão criaria a segunda cópia de um contrato
   que um sistema de fora lê: duas cópias divergem na primeira mudança, em silêncio, porque
   cada rota tem o seu próprio teste. */
const rotaVisita = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'criar-tarefa-rota.js'), 'utf8');
const modulo = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'marcador-do-plano.js'), 'utf8');

checar('o formato do marcador mora num módulo só',
  /^COCKPIT:PLANO:v1:/m.test(modulo.replace(/[\s\S]*?return '/, "COCKPIT:PLANO:v1:")) === false
    ? /'COCKPIT:PLANO:v1:' \+ String\(ownerId\)/.test(modulo) : true,
  'o módulo precisa ser quem monta a linha');

/* SEM COMENTÁRIO: as duas rotas DOCUMENTAM o formato em comentário, e devem mesmo. O que
   nenhuma pode ter é a linha montada no código. */
/* O `\r` PRIMEIRO: `lib/` é CRLF, e um `.replace(/^\s*\/\/.*$/)` linha a linha deixa o
   `\r` no fim — o comentário sobrevive à limpeza e a checagem acusa código que não existe.
   Foi o que aconteceu na primeira versão desta guarda. */
const semCom = s => s.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
checar('e as DUAS rotas que criam tarefa o usam, nenhuma monta a linha à mão',
  /require\('\.\/marcador-do-plano'\)/.test(rotaPasso)
    && /require\('\.\/marcador-do-plano'\)/.test(rotaVisita)
    && semCom(rotaPasso).indexOf('COCKPIT:PLANO') < 0
    && semCom(rotaVisita).indexOf('COCKPIT:PLANO') < 0,
  'linha montada à mão numa das rotas é a segunda cópia de um contrato de fora');

checar('a tarefa do próximo passo passa a nascer COM corpo',
  /hs_task_body: linhaDoMarcador\(\{/.test(rotaPasso)
    && /origem: 'funil'/.test(rotaPasso),
  'ela nascia sem corpo nenhum — o documento do PWA prometia o marcador e mentia aqui');

/* ── 6 · O MARCADOR, EXERCITADO ────────────────────────────────────────────────────── */
const { linhaDoMarcador, tipoNormalizado, origemValida, dealIdValido } =
  require(path.join(raiz, 'lib', 'acoes-negocio', 'marcador-do-plano.js'));

checar('a linha sai no formato do contrato, com a hora escolhida',
  linhaDoMarcador({ ownerId: '86100506', ano: 2026, mes: 9, dia: 15, hora: 15, minuto: 0,
    tipo: 'Reunião', origem: 'funil', dealId: '31415926' })
    === 'COCKPIT:PLANO:v1:86100506:2026-09-15:15:00:reuniao:funil:31415926',
  linhaDoMarcador({ ownerId: '86100506', ano: 2026, mes: 9, dia: 15, hora: 15, minuto: 0, tipo: 'Reunião', origem: 'funil', dealId: '31415926' }));

checar('os quatro tipos do passo viram nome de máquina',
  tipoNormalizado('Reunião') === 'reuniao' && tipoNormalizado('Follow-up') === 'follow_up'
    && tipoNormalizado('Demo') === 'demo' && tipoNormalizado('Visita') === 'visita'
    && tipoNormalizado('') === 'visita',
  'o PWA agrupa por este campo; acento e caixa quebram o agrupamento');

checar('origem desconhecida e dealId sujo não entram na linha',
  origemValida('inventada') === 'cockpit' && dealIdValido('abc:123') === ''
    && /:-$/.test(linhaDoMarcador({ ownerId: '1', ano: 2026, mes: 1, dia: 2, hora: 9, minuto: 5,
      tipo: 'x', origem: 'inventada', dealId: 'abc:123' })),
  'dois-pontos vindo do navegador quebraria o formato inteiro para quem lê');

console.log('');
if (falhas.length) {
  console.error(falhas.length + ' falha(s) — a hora do próximo passo não chega até o fim.');
  falhas.forEach(f => console.error('  · ' + f));
  process.exit(1);
}
console.log('hora do próximo passo: ' + ok + ' checagens — a hora vai do campo ao HubSpot, ao plano e à Agenda.');
