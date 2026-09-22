#!/usr/bin/env node
/* ============================================================================
   UM NEGÓCIO, UM PRÓXIMO PASSO ABERTO (22/09/26)

   Julyan: "o caminho do pwa, para o hub e cockpit, tem q ser unico, sem duplicação, o que
   vc criar no cockpit tem q ir pro pwa".

   O caminho JÁ era único — toda criação passa por op:'tarefa-rota'. O que faltava era ele
   ser idempotente POR NEGÓCIO: a dedupe antiga é por ASSUNTO + dia + dono, e por isso
   "Follow-up - Confirmar dados de cobrança" e "Reunião - Confirmar data" conviviam abertas
   no mesmo negócio. Medido em 22/09: 418 tarefas abertas em 220 negócios, 93 com mais de
   uma, 198 excedentes, pior caso ONZE.

   ESTA SUÍTE RODA O HANDLER DE VERDADE com o fetch trocado por um dublê que registra cada
   chamada. É a única forma de responder a pergunta que importa: a SEGUNDA tarefa nasce ou
   não? Uma checagem de texto diria que o código existe, não que ele impede a criação.

   Uso: node scripts/testar-um-passo-por-negocio.js
   ============================================================================ */
const path = require('path');
const fs = require('fs');

const raiz = path.join(__dirname, '..');
const fonte = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'criar-tarefa-rota.js'), 'utf8');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) {
  if (cond) { ok += 1; return; }
  falhas.push(nome + (porque ? '\n      ' + porque : ''));
}
function igual(nome, veio, esperado, porque) {
  checar(nome, JSON.stringify(veio) === JSON.stringify(esperado),
    (porque ? porque + ' · ' : '') + 'esperava ' + JSON.stringify(esperado)
      + ', veio ' + JSON.stringify(veio));
}

/* ══ O DUBLÊ DE REDE ═════════════════════════════════════════════════════════════════
   Cada cenário declara o que o HubSpot responde, e o dublê guarda TODAS as chamadas —
   é na lista delas que se lê se houve POST de criação ou PATCH de reaproveitamento. */
function rodar(cenario) {
  const chamadas = [];
  const fetchReal = global.fetch;
  global.fetch = async function (url, opts) {
    const u = String(url);
    const o = opts || {};
    chamadas.push({ url: u, metodo: o.method || 'GET', corpo: o.body ? JSON.parse(o.body) : null });

    if (u.indexOf('/auth/v1/user') > -1) {
      return { ok: true, status: 200, json: async () => ({ email: cenario.email }) };
    }
    /* a busca por ASSUNTO + dia + dono */
    if (u.indexOf('/objects/tasks/search') > -1) {
      return { ok: true, status: 200, json: async () => ({ results: cenario.porAssunto || [] }) };
    }
    /* as tarefas ASSOCIADAS ao negócio */
    if (u.indexOf('/associations/tasks') > -1) {
      return { ok: true, status: 200,
        json: async () => ({ results: (cenario.doNegocio || []).map(t => ({ toObjectId: t.id })) }) };
    }
    if (u.indexOf('/objects/tasks/batch/read') > -1) {
      return { ok: true, status: 200, json: async () => ({ results: cenario.doNegocio || [] }) };
    }
    if (u.indexOf('/associations/deals/') > -1) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    /* PATCH de uma tarefa existente, ou POST de uma nova */
    return { ok: true, status: 200, json: async () => ({ id: '999', properties: {} }) };
  };

  const resp = { codigo: null, corpo: null };
  const res = {
    setHeader: function () {},
    status: function (c) { resp.codigo = c; return res; },
    json: function (b) { resp.corpo = b; return res; },
    end: function () { return res; }
  };

  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer sessao-de-teste' },
    body: cenario.body
  };

  process.env.HUBSPOT_TOKEN = 'tok';
  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon';

  delete require.cache[require.resolve(path.join(raiz, 'lib', 'acoes-negocio', 'criar-tarefa-rota.js'))];
  const handler = require(path.join(raiz, 'lib', 'acoes-negocio', 'criar-tarefa-rota.js'));

  return handler(req, res).then(function () {
    global.fetch = fetchReal;
    const criou = chamadas.filter(function (c) {
      return c.metodo === 'POST' && /\/objects\/tasks$/.test(c.url.split('?')[0]);
    });
    const reescreveu = chamadas.filter(function (c) {
      return c.metodo === 'PATCH' && c.url.indexOf('/objects/tasks/') > -1;
    });
    return { resp: resp, chamadas: chamadas, criou: criou, reescreveu: reescreveu };
  }).catch(function (e) {
    global.fetch = fetchReal;
    return { erro: String(e && e.message || e), criou: [], reescreveu: [], chamadas: chamadas, resp: resp };
  });
}

const USUARIOS = require(path.join(raiz, 'data', 'usuarios.json'));
const REP = (Array.isArray(USUARIOS) ? USUARIOS : USUARIOS.usuarios || [])
  .find(function (u) { return String(u.role || u.papel) === 'rep' && u.ownerId; });

const CORPO = {
  nome: 'Boca a Boca Salgados', ownerId: REP ? String(REP.ownerId) : '97978276',
  dealId: '65061828767', data: '2026-09-25', horaPrevista: '09:00'
};

(async function () {
  if (!REP) { console.error('FALHA: não achei um rep em data/usuarios.json'); process.exit(1); }

  /* ══ 1. O CASO DO BOCA A BOCA ══════════════════════════════════════════════════════
     O negócio já tem tarefa aberta, com OUTRO assunto. Antes: a busca por assunto não
     achava nada e nascia a segunda. Agora: reescreve a que existe. */
  const r1 = await rodar({
    email: String(REP.email).toLowerCase(),
    body: CORPO,
    porAssunto: [],
    doNegocio: [
      { id: '117228450116', properties: { hs_task_subject: 'Follow-up - Confirmar dados de cobrança',
        hs_task_status: 'NOT_STARTED', hs_timestamp: '1758538800000' } }
    ]
  });
  igual('com tarefa aberta no negócio, NÃO nasce a segunda', r1.criou.length, 0,
    'é o defeito do Boca a Boca: cinco tarefas abertas, quatro para o mesmo dia'
      + (r1.erro ? ' · estourou: ' + r1.erro : ''));
  igual('e a que existe é reescrita', r1.reescreveu.length, 1);
  checar('com o assunto novo, não só a data',
    !!(r1.reescreveu[0] && r1.reescreveu[0].corpo
      && r1.reescreveu[0].corpo.properties
      && r1.reescreveu[0].corpo.properties.hs_task_subject),
    'sem reescrever o assunto, a tarefa anuncia o passo ANTERIOR com a data do novo — '
      + 'pior que duas tarefas');

  /* ══ 2. SEM TAREFA ABERTA, A TAREFA NASCE ═════════════════════════════════════════
     O erro oposto, e mais grave: trocar duplicata por passo nenhum. */
  const r2 = await rodar({
    email: String(REP.email).toLowerCase(), body: CORPO,
    porAssunto: [], doNegocio: []
  });
  igual('negócio sem tarefa aberta continua ganhando a dele', r2.criou.length, 1,
    'passo nenhum é defeito pior que passo duplicado'
      + (r2.erro ? ' · estourou: ' + r2.erro : ''));

  /* SÓ CONCLUÍDA NÃO CONTA: realizado é histórico, não próximo passo. */
  const r3 = await rodar({
    email: String(REP.email).toLowerCase(), body: CORPO,
    porAssunto: [],
    doNegocio: [{ id: '1', properties: { hs_task_subject: 'Follow-up - feito',
      hs_task_status: 'COMPLETED', hs_timestamp: '1758538800000' } }]
  });
  igual('tarefa concluída não impede o passo novo', r3.criou.length, 1,
    'concluída é histórico; bloquear por ela deixaria o negócio sem próximo passo para '
      + 'sempre');

  /* ══ 3. A QUE FICA É A MAIS PRÓXIMA DE VENCER ════════════════════════════════════
     É o compromisso que o cliente está esperando primeiro. Reescrever a mais distante
     deixaria a urgente aberta — e o negócio com duas de novo. */
  const r4 = await rodar({
    email: String(REP.email).toLowerCase(), body: CORPO,
    porAssunto: [],
    doNegocio: [
      { id: 'longe', properties: { hs_task_subject: 'b', hs_task_status: 'NOT_STARTED', hs_timestamp: '9000000000000' } },
      { id: 'perto', properties: { hs_task_subject: 'a', hs_task_status: 'NOT_STARTED', hs_timestamp: '1000000000000' } }
    ]
  });
  igual('reescreve a mais próxima de vencer', r4.criou.length, 0);
  checar('e é a "perto"',
    !!(r4.reescreveu[0] && r4.reescreveu[0].url.indexOf('/perto') > -1),
    'veio ' + (r4.reescreveu[0] ? r4.reescreveu[0].url : 'nenhuma'));

  /* ══ 4. SEM NEGÓCIO, A REGRA ANTIGA ══════════════════════════════════════════════
     Visita de rua sem negócio no funil não tem por onde deduplicar por negócio. */
  const r5 = await rodar({
    email: String(REP.email).toLowerCase(),
    body: { nome: 'Padaria da Rua', ownerId: CORPO.ownerId, data: '2026-09-25' },
    porAssunto: [], doNegocio: []
  });
  igual('sem dealId, a tarefa nasce como sempre', r5.criou.length, 1,
    'a dedupe por negócio não pode virar porteira para quem não tem negócio');

  checar('e a busca por associação nem é chamada sem dealId',
    r5.chamadas.filter(function (c) { return c.url.indexOf('/associations/tasks') > -1; }).length === 0,
    'chamada à toa em rota de escrita é latência no clique do executivo');

  /* ══ 5. A LEITURA É BEST-EFFORT ══════════════════════════════════════════════════
     Se a associação falhar, o pior caso é o de antes: nasce uma tarefa a mais. Recusar
     a criação seria trocar duplicata por passo nenhum. */
  checar('a busca por negócio não derruba a criação',
    /catch \(e\) \{\n\s*\/\* não derruba/.test(fonte)
      || /\} catch \(e\) \{[\s\S]{0,120}não derruba/.test(fonte),
    'passo nenhum é o defeito pior');

  checar('e ela vai por associação, não por assunto',
    /\/associations\/tasks/.test(fonte) && /batch\/read/.test(fonte),
    'o assunto se repete entre negócios — "Follow-up - Identificar o nome e o horário do '
      + 'decisor" existe em dezenas ao mesmo tempo, e casar por texto misturaria gente');

  checar('e "aberta" é a mesma definição da fila e do snapshot',
    /hs_task_status \|\| ''\) !== 'COMPLETED'/.test(fonte),
    'três definições de aberta seriam três respostas para a mesma pergunta');

  console.log('');
  console.log('um passo por negócio: ' + ok + ' verificações');
  if (falhas.length) {
    console.log('');
    falhas.forEach(f => console.log('  ✗ ' + f));
    console.log('');
    console.log('FALHOU: ' + falhas.length);
    process.exit(1);
  }
  console.log('tudo certo.');
}());
