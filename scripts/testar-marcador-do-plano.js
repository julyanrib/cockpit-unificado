// scripts/testar-marcador-do-plano.js
//
// O CONTRATO QUE O PWA VAI LER (11/09/26).
//
// POR QUE ESTE ARQUIVO EXISTE
// Julyan: "preciso que eles puxem tudo nosso tbm, quero q seja sinalizado no hubspot de
// alguma forma, para o PWA puxar e ficar o ciclo completo".
//
// O Cockpit já escrevia a visita planejada no HubSpot como TAREFA. O que faltava era
// IDENTIDADE: a tarefa chegava com dono, data/hora e o assunto "Visita - <nome>", e nada
// mais — sem associação com negócio nenhum (o objeto tarefa não é associado, medido). Quem
// lê do outro lado recebia um nome em texto e tinha de adivinhar de que negócio se trata.
//
// Agora a última linha do corpo da tarefa carrega um marcador de máquina:
//
//     COCKPIT:PLANO:v1:<ownerId>:<AAAA-MM-DD>:<HH:MM>:<visita|reuniao>:<origem>:<dealId|->
//
// ISTO NÃO É DECORAÇÃO: é um contrato com um sistema de fora, que vai ser lido por código
// que não está neste repositório e que não quebra junto quando alguém mudar o formato aqui.
// É a definição de coisa que precisa de teste que EXERCITA, e não de teste que lê o código.
//
// O QUE ESTE ARQUIVO FAZ
// Chama o handler de verdade com `fetch` dublado — a validação de sessão devolve um e-mail
// do time, a busca de duplicata devolve vazio, e a criação captura o corpo que sairia para
// o HubSpot. Depois lê a linha do marcador no que FOI ENVIADO. Se o formato mudar de forma,
// de ordem ou de posição, aqui fica vermelho antes de chegar no PWA de alguém.
//
// E GUARDA AS DUAS COISAS QUE MATAM O MARCADOR EM SILÊNCIO:
//   · ele na PRIMEIRA linha em vez da última — a primeira é lida por posição pelo marcador
//     do gestor (/^SUGESTAO_GESTOR:/), e o plano lá cegaria a confirmação de sugestão;
//   · ele VAZANDO na tela do executivo — o corpo da tarefa é mostrado verbatim na ficha do
//     compromisso da Agenda, e texto de máquina no campo de observações é defeito visível.

const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

let ok = 0;
const falhas = [];
function checar(nome, condicao, dica) {
  if (condicao) { ok += 1; console.log('  ok  ' + nome); return; }
  falhas.push(nome + (dica ? '  — ' + dica : ''));
  console.log('  FALHA  ' + nome + (dica ? '  — ' + dica : ''));
}

/* ── o entorno mínimo para o handler rodar ──────────────────────────────────────────── */
const USUARIOS = (function () {
  const raw = require(path.join(raiz, 'data', 'usuarios.json'));
  return Array.isArray(raw) ? raw : (raw.usuarios || []);
}());
/* UM REP DE VERDADE do arquivo do time: e-mail inventado seria recusado no 403 de
   "não está cadastrado no time" e o teste passaria a medir o portão, não o marcador. */
const REP = USUARIOS.filter(u => u.role === 'rep' && /^[0-9]+$/.test(String(u.ownerId || '')))[0];
if (!REP) { console.error('não achei nenhum rep com ownerId numérico em data/usuarios.json'); process.exit(1); }

process.env.HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || 'token-de-teste';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://exemplo.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon-de-teste';

const criarTarefaRota = require(path.join(raiz, 'lib', 'acoes-negocio', 'criar-tarefa-rota.js'));

function respostaFalsa() {
  const r = { statusCode: 0, corpo: null, cabecalhos: {} };
  r.setHeader = function (k, v) { r.cabecalhos[k] = v; return r; };
  r.status = function (c) { r.statusCode = c; return r; };
  r.json = function (b) { r.corpo = b; return r; };
  r.end = function () { return r; };
  return r;
}

/* Dublê de rede: sessão válida, busca de duplicata vazia, criação capturada.
   `opcoesDoCaso.tarefaExistente` faz a busca devolver uma tarefa igual, para exercitar o
   caminho do REAGENDAMENTO; `opcoesDoCaso.associacaoFalha` faz o PUT da associação
   recusar, para provar que a falha volta na resposta em vez de sumir. */
async function chamar(corpoDoPedido, opcoesDoCaso) {
  const caso = opcoesDoCaso || {};
  const enviado = { criacao: null, patch: null, associacoes: [] };
  global.fetch = async function (url, opcoes) {
    const u = String(url);
    const metodo = (opcoes && opcoes.method) || 'GET';
    if (u.indexOf('/auth/v1/user') > -1) {
      return { ok: true, status: 200, json: async () => ({ email: REP.email }) };
    }
    if (u.indexOf('/tasks/search') > -1) {
      return {
        ok: true, status: 200,
        json: async () => ({ results: caso.tarefaExistente || [] })
      };
    }
    /* A ASSOCIAÇÃO: PUT em .../tasks/<id>/associations/deals/<id>/task_to_deal */
    if (metodo === 'PUT' && u.indexOf('/associations/') > -1) {
      enviado.associacoes.push(u);
      return caso.associacaoFalha
        ? { ok: false, status: 409, json: async () => ({ message: 'recusado' }) }
        : { ok: true, status: 200, json: async () => ({}) };
    }
    if (u.indexOf('/objects/tasks') > -1 && metodo === 'POST') {
      enviado.criacao = JSON.parse(opcoes.body);
      return { ok: true, status: 201, json: async () => ({ id: '555' }) };
    }
    if (metodo === 'PATCH') {
      enviado.patch = JSON.parse(opcoes.body);
      return { ok: true, status: 200, json: async () => ({ id: '777' }) };
    }
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  };
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer sessao-de-teste' },
    body: corpoDoPedido
  };
  const res = respostaFalsa();
  await criarTarefaRota(req, res);
  return { res, enviado };
}

const RE_MARCADOR = /^COCKPIT:PLANO:v1:([^:]*):([^:]*):([^:]*:[^:]*):([^:]*):([^:]*):([^:]*)$/;

async function main() {
  const fetchOriginal = global.fetch;

  /* ── 1 · A VISITA DO PLANEJAMENTO, COM NEGÓCIO ─────────────────────────────────── */
  let { res, enviado } = await chamar({
    nome: 'Bar do Teste', ownerId: String(REP.ownerId), bairro: 'Tijuca', cidade: 'Rio de Janeiro',
    horaPrevista: '14:30', data: '2026-09-15', origem: 'planejamento', dealId: '31415926'
  });
  checar('a rota aceita o pedido do Planejamento', res.statusCode === 200 && !!enviado.criacao,
    'HTTP ' + res.statusCode + ' — ' + JSON.stringify(res.corpo || {}).slice(0, 120));

  const corpo = String(((enviado.criacao || {}).properties || {}).hs_task_body || '');
  const linhas = corpo.split('\n');
  const linhaMarcador = linhas.filter(l => l.indexOf('COCKPIT:PLANO:') === 0)[0] || '';

  checar('a tarefa leva o marcador de plano no corpo', !!linhaMarcador,
    'corpo enviado: ' + JSON.stringify(corpo));

  const m = RE_MARCADOR.exec(linhaMarcador);
  checar('e ele tem o formato do contrato, campo a campo', !!m, 'linha: ' + linhaMarcador);
  if (m) {
    checar('· o dono é o ownerId do pedido', m[1] === String(REP.ownerId), 'veio ' + m[1]);
    checar('· o dia é o dia da tarefa, em AAAA-MM-DD', m[2] === '2026-09-15', 'veio ' + m[2]);
    checar('· a hora é a hora escolhida, em HH:MM', m[3] === '14:30', 'veio ' + m[3]);
    checar('· o tipo é visita', m[4] === 'visita', 'veio ' + m[4]);
    checar('· a origem é a tela que criou', m[5] === 'planejamento', 'veio ' + m[5]);
    checar('· e o negócio viaja junto, que é o elo que o objeto não tem',
      m[6] === '31415926', 'veio ' + m[6]);
  }

  /* ── 2 · A DATA DO MARCADOR É A DATA DA TAREFA ─────────────────────────────────── */
  /* Os dois saem do mesmo cálculo de propósito. Se um dia alguém derivar o marcador de
     `dataTarefaMs` sem desfazer o fuso, é aqui que aparece: a tarefa às 14:30 de Brasília
     é 17:30 UTC, e um marcador tirado do UTC cru diria o dia seguinte nas visitas da
     noite. Esta checagem é a que prende os dois juntos. */
  function diaEHoraDoTimestamp(criacao) {
    const ts = Number(((criacao || {}).properties || {}).hs_timestamp);
    const brt = new Date(ts - 3 * 60 * 60 * 1000);
    return [brt.toISOString().slice(0, 10), brt.toISOString().slice(11, 16)];
  }
  const [diaTs, horaTs] = diaEHoraDoTimestamp(enviado.criacao);
  checar('o dia e a hora do marcador batem com o hs_timestamp da tarefa',
    !!m && m[2] === diaTs && m[3] === horaTs,
    'marcador ' + (m ? m[2] + ' ' + m[3] : '—') + ' vs timestamp ' + diaTs + ' ' + horaTs);

  /* A MESMA CONTA NA VIRADA DO DIA — e é ESTA que prende os dois juntos.
     A checagem acima, sozinha, é cega: às 14:30 de Brasília o UTC é 17:30 do MESMO dia, e
     um marcador derivado do UTC cru passa igual. Medido na sabotagem: trocar a montagem do
     dia por `new Date(dataTarefaMs).toISOString()` não reprovava nada.
     Às 21:30 de Brasília o UTC é 00:30 do dia SEGUINTE. Aqui a derivação errada aparece. */
  const noite = await chamar({
    nome: 'Bar da Virada', ownerId: String(REP.ownerId),
    horaPrevista: '21:30', data: '2026-09-15', origem: 'planejamento'
  });
  const linhaNoite = String(((noite.enviado.criacao || {}).properties || {}).hs_task_body || '')
    .split('\n').filter(l => l.indexOf('COCKPIT:PLANO:') === 0)[0] || '';
  const mn = RE_MARCADOR.exec(linhaNoite);
  checar('e continuam batendo na visita da noite, que cruza o dia em UTC',
    !!mn && mn[2] === '2026-09-15' && mn[3] === '21:30',
    'marcador: ' + linhaNoite);

  /* ── 3 · A POSIÇÃO: ÚLTIMA LINHA, NUNCA A PRIMEIRA ─────────────────────────────── */
  checar('o marcador é a ÚLTIMA linha do corpo',
    linhas[linhas.length - 1].indexOf('COCKPIT:PLANO:') === 0,
    'última linha: ' + JSON.stringify(linhas[linhas.length - 1]));
  checar('e nunca a primeira — a primeira é do marcador do gestor, lido por posição',
    linhas[0].indexOf('COCKPIT:PLANO:') !== 0,
    'primeira linha: ' + JSON.stringify(linhas[0]));

  /* A PROVA de que os dois convivem: sugestão do gestor E plano no mesmo corpo. */
  const GESTOR = USUARIOS.filter(u => u.role === 'manager')[0];
  if (GESTOR) {
    global.fetch = async function (url, opcoes) {
      const u = String(url);
      if (u.indexOf('/auth/v1/user') > -1) return { ok: true, status: 200, json: async () => ({ email: GESTOR.email }) };
      if (u.indexOf('/tasks/search') > -1) return { ok: true, status: 200, json: async () => ({ results: [] }) };
      if (u.indexOf('/objects/tasks') > -1 && opcoes && opcoes.method === 'POST') {
        enviado.criacao = JSON.parse(opcoes.body);
        return { ok: true, status: 201, json: async () => ({ id: '556' }) };
      }
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    };
    const res2 = respostaFalsa();
    await criarTarefaRota({ method: 'POST', headers: { authorization: 'Bearer t' },
      body: { nome: 'Bar do Teste', ownerId: String(REP.ownerId), horaPrevista: '09:00',
        data: '2026-09-15', origem: 'planejamento', sugeridoPorGestor: true } }, res2);
    const c2 = String(((enviado.criacao || {}).properties || {}).hs_task_body || '').split('\n');
    checar('os dois marcadores convivem: gestor na primeira, plano na última',
      c2[0].indexOf('SUGESTAO_GESTOR:') === 0 && c2[c2.length - 1].indexOf('COCKPIT:PLANO:') === 0,
      'corpo: ' + JSON.stringify(c2));
  }

  /* ── 4 · SEM NEGÓCIO, O CAMPO É `-` E NÃO SOME ─────────────────────────────────── */
  const semDeal = await chamar({
    nome: 'Padaria Sem Negocio', ownerId: String(REP.ownerId),
    horaPrevista: '09:00', data: '2026-09-16', origem: 'planejamento'
  });
  const linhaSem = String(((semDeal.enviado.criacao || {}).properties || {}).hs_task_body || '')
    .split('\n').filter(l => l.indexOf('COCKPIT:PLANO:') === 0)[0] || '';
  checar('conta sem negócio ainda grava o marcador, com `-` no lugar do id',
    RE_MARCADOR.test(linhaSem) && /:-$/.test(linhaSem),
    'linha: ' + linhaSem);
  checar('e o marcador continua com o mesmo número de campos',
    linhaSem.split(':').length === linhaMarcador.split(':').length,
    linhaSem.split(':').length + ' vs ' + linhaMarcador.split(':').length);

  /* ── 5 · O QUE O NAVEGADOR MANDA NÃO ENTRA CRU ─────────────────────────────────── */
  const sujo = await chamar({
    nome: 'Bar Sujo', ownerId: String(REP.ownerId), horaPrevista: '09:00', data: '2026-09-16',
    origem: 'inventada-pelo-navegador', dealId: 'abc:123:quebra-o-formato'
  });
  const linhaSuja = String(((sujo.enviado.criacao || {}).properties || {}).hs_task_body || '')
    .split('\n').filter(l => l.indexOf('COCKPIT:PLANO:') === 0)[0] || '';
  checar('origem desconhecida cai no padrão em vez de entrar no marcador',
    RE_MARCADOR.test(linhaSuja) && linhaSuja.indexOf('inventada-pelo-navegador') < 0,
    'linha: ' + linhaSuja);
  checar('e dealId não-numérico vira `-` — dois-pontos no meio quebraria o formato',
    /:-$/.test(linhaSuja) && linhaSuja.indexOf('abc') < 0,
    'linha: ' + linhaSuja);

  global.fetch = fetchOriginal;

  /* ── 6 · O MARCADOR NÃO APARECE PARA O EXECUTIVO ───────────────────────────────── */
  /* O corpo da tarefa é MOSTRADO na ficha do compromisso da Agenda. A função que limpa
     texto de máquina tem de conhecer os dois marcadores, e os leitores têm de usá-la. */
  const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
  checar('a função que limpa o corpo conhece o marcador do plano',
    /\.replace\(AGENDA_RE_MARCADOR_PLANO, ''\)/.test(tpl)
      && /const AGENDA_RE_MARCADOR_PLANO = /.test(tpl),
    'agendaObsSemMarcador não tira o marcador novo');
  checar('e a regex dele aceita versão futura, para a tela velha não mostrar formato novo',
    /AGENDA_RE_MARCADOR_PLANO = \/\^COCKPIT:PLANO:v\\d\+:/.test(tpl),
    'a regex está cravada na v1');
  checar('nenhum leitor mostra o corpo cru da tarefa ao executivo',
    tpl.indexOf('esc(e.obs)') < 0,
    'achei `esc(e.obs)` — corpo de tarefa indo direto para a tela');

  /* ── 7 · A TAREFA ENTRA NA TIMELINE DO NEGÓCIO ─────────────────────────────────────
     Julyan, 11/09: "associa a tarefa ao negócio tbm". Antes disto o objeto nascia solto e
     a visita planejada não aparecia na ficha do negócio no HubSpot. Estas checagens medem
     a CHAMADA que sai para a rede, não a presença do texto no arquivo. */
  global.fetch = fetchOriginal;
  const comDeal = await chamar({
    nome: 'Bar Associado', ownerId: String(REP.ownerId), horaPrevista: '10:00',
    data: '2026-09-17', origem: 'planejamento', dealId: '31415926'
  });
  checar('a tarefa criada é associada ao negócio',
    comDeal.enviado.associacoes.length === 1
      && /\/objects\/tasks\/555\/associations\/deals\/31415926\/task_to_deal$/.test(comDeal.enviado.associacoes[0]),
    'associações: ' + JSON.stringify(comDeal.enviado.associacoes));
  checar('e a resposta declara que associou',
    comDeal.res.corpo && comDeal.res.corpo.associadaAoNegocio === true
      && !comDeal.res.corpo.associacaoFalhou,
    JSON.stringify(comDeal.res.corpo || {}));

  /* SEM NEGÓCIO não se inventa associação — e nem por isso a tarefa falha. */
  const semNegocio = await chamar({
    nome: 'Bar Solto', ownerId: String(REP.ownerId), horaPrevista: '10:00',
    data: '2026-09-17', origem: 'planejamento'
  });
  checar('sem dealId não sai chamada de associação, e a tarefa é criada assim mesmo',
    semNegocio.enviado.associacoes.length === 0
      && semNegocio.res.statusCode === 200
      && semNegocio.res.corpo.associadaAoNegocio === false,
    'associações: ' + semNegocio.enviado.associacoes.length
      + ' · corpo: ' + JSON.stringify(semNegocio.res.corpo || {}));

  /* A FALHA DA ASSOCIAÇÃO NÃO DERRUBA A TAREFA, E NÃO SOME.
     O compromisso já existe e o executivo tem de vê-lo na Agenda. Mas associação que some
     calada dá no mesmo que não existir, só que descoberta tarde — foi assim que negócio
     chegou em Ag. Pagamento sem contato e a cobrança do Asaas falhou depois de o cliente
     ter assinado. */
  const assocRuim = await chamar({
    nome: 'Bar Teimoso', ownerId: String(REP.ownerId), horaPrevista: '10:00',
    data: '2026-09-17', origem: 'planejamento', dealId: '31415926'
  }, { associacaoFalha: true });
  checar('associação recusada NÃO derruba a tarefa',
    assocRuim.res.statusCode === 200 && assocRuim.res.corpo.ok === true,
    'HTTP ' + assocRuim.res.statusCode + ' — ' + JSON.stringify(assocRuim.res.corpo || {}));
  checar('e a recusa volta na resposta em vez de sumir',
    !!assocRuim.res.corpo.associacaoFalhou
      && assocRuim.res.corpo.associadaAoNegocio === false,
    JSON.stringify(assocRuim.res.corpo || {}));

  /* O REAGENDAMENTO CONSERTA O PASSADO: tarefa criada antes desta mudança nasceu sem
     vínculo nenhum. O PUT é idempotente, então movê-la de horário a associa. */
  const reagendou = await chamar({
    nome: 'Bar Antigo', ownerId: String(REP.ownerId), horaPrevista: '16:00',
    data: '2026-09-17', origem: 'planejamento', dealId: '27182818'
  }, { tarefaExistente: [{ id: '777', properties: { hs_task_subject: 'Visita - Bar Antigo' } }] });
  checar('reagendar tarefa antiga também a associa ao negócio',
    reagendou.res.corpo && reagendou.res.corpo.reagendada === true
      && reagendou.enviado.associacoes.length === 1
      && /\/tasks\/777\/associations\/deals\/27182818\/task_to_deal$/.test(reagendou.enviado.associacoes[0]),
    'corpo: ' + JSON.stringify(reagendou.res.corpo || {})
      + ' · associações: ' + JSON.stringify(reagendou.enviado.associacoes));

  global.fetch = fetchOriginal;

  /* ── 8 · E O NAVEGADOR DECLARA A ORIGEM ────────────────────────────────────────────
     As checagens de 1 a 5 chamam o SERVIDOR direto, com a origem no corpo do pedido —
     então elas não sabem se a tela manda a origem. Medido na sabotagem: apagar o
     `origem` da chamada do Planejamento deixava as vinte verdes, e o marcador em
     produção sairia com 'cockpit' em toda visita da semana. Estas duas fecham o buraco. */
  checar('a função que chama a rota repassa origem e dealId',
    /\.\.\.\(opcoes && opcoes\.origem \? \{ origem: opcoes\.origem \} : \{\}\),/.test(tpl)
      && /\.\.\.\(opcoes && opcoes\.dealId \? \{ dealId: String\(opcoes\.dealId\) \} : \{\}\),/.test(tpl),
    'criarTarefaVisitaNoHubspot não manda o que o marcador precisa');
  checar('e o Planejamento assina as visitas que põe na semana',
    (tpl.match(/origem: 'planejamento'/g) || []).length >= 2,
    'achei ' + (tpl.match(/origem: 'planejamento'/g) || []).length
      + ' — os dois ramos de pl6AgendarNoSlot (carteira e conta nova) têm de assinar');

  console.log('');
  if (falhas.length) {
    console.error(falhas.length + ' falha(s) — o contrato do marcador do plano mudou.');
    falhas.forEach(f => console.error('  · ' + f));
    process.exit(1);
  }
  console.log('marcador do plano: ' + ok + ' checagens — o que o Cockpit planeja sai legível no HubSpot.');
}

main().catch(e => { console.error('quebrou: ' + (e && e.stack || e)); process.exit(1); });
