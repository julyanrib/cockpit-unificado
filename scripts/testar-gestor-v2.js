/* ============================================================================
   COCKPIT DO GESTOR v2 · A BASE ÚNICA (06/10/26)

   O pacote vasco.zip pede "zero tolerância": o número do topo é a soma das linhas. Esta
   suíte roda o bloco gv2 do template de verdade (extraído entre os marcadores), com um
   DATA e um supa falsos de 3 pessoas, e confere:
     · o ritmo: 11:20 → 31% da meta do dia (jornada 8h30–17h30);
     · a exceção e a ordem (sem plano > plano sem visita > furou);
     · a linha Time é a soma das pessoas e a Prova não acusa nada;
     · a Prova ACUSA quando um total é adulterado (a guarda tem dente).
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };

const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
checar('o bloco gv2 está no template entre os marcadores', ini > 0 && fim > ini);
const codigo = tpl.slice(ini + '<script id="gv2-js">'.length, fim).replace('GV2.instalar();', '');
checar('o bloco não tem crase (guarda 26)', codigo.indexOf('`') < 0);
checar('a versão nova é o padrão do gestor, sempre: só ?gv2=0 na URL desliga (o "0" gravado não vale mais)',
  /return q !== '0';/.test(codigo) && !/localStorage\.getItem\('gv2'\)/.test(codigo));
/* UM COCKPIT SÓ (Julyan, 07/10: "não quero nada indo pro cockpit antigo"): Prospecção e Playbook
   abrem dentro do novo (GV2.visitar); nenhum botão desliga a tela nova para visitar uma aba antiga. */
// o botão "Tomada de contas e Radar" vivia na Rua antiga, sobrescrita pela v5 (limpeza de 16/10/26)
checar('Prospecção é aba do cockpit novo',
  /\['prospeccao', 'Prospecção'/.test(codigo));
checar('nenhum botão sai para Rotas/Playbook do antigo (menu:rotas some; Playbook e Praça usam GV2.visitar)',
  !/acao: 'menu:rotas'/.test(codigo) && /if \(o === 'rotas' \|\| o === 'playbook'\) return GV2\.visitar\(o\);/.test(codigo)
  && /GV2\.pxPlaybook = function[\s\S]{0,200}GV2\.visitar\('playbook'\)/.test(codigo));
checar('o menu não oferece "Abrir o cockpit antigo" (só a tela de erro guarda a saída)',
  (codigo.match(/Abrir o cockpit antigo/g) || []).length === 1 && (codigo.match(/GV2\.botaoVoltar\(\);/g) || []).length === 1);
checar('aplicarVisaoPorPapel chama GV2.ligar', tpl.indexOf("if (typeof GV2 !== 'undefined' && GV2.ligar) GV2.ligar();") > 0);

/* ── o mundo falso ── */
const HOJE = '2026-10-06'; // terça
const SEG = '2026-10-05';
const dia = (planejadas, provadas, meta) => ({ planejadas, provadas, feitasDoPlano: provadas, feitas: provadas, meta: meta || 6 });
const pessoasRpc = [
  { ownerId: '1', dias: [dia(6, 3), dia(0, 0), dia(5, 0), dia(5, 0), dia(5, 0)], plano: { promessaDadaEm: '2026-10-05' }, ultimo: { em: '2026-10-05T20:00:00Z', lat: -20.3, lng: -40.3 } },
  { ownerId: '2', dias: [dia(6, 6), dia(6, 0), dia(6, 0), dia(6, 0), Object.assign(dia(6, 0), { semLugar: 2 })], plano: null, ultimo: null },
  { ownerId: '3', dias: [dia(4, 4), dia(4, 2, 4), dia(4, 0, 4), dia(4, 0, 4), dia(4, 0, 4)], plano: { promessaDadaEm: 'x' }, ultimo: null }
];
const tabelas = {
  visitas_com_prova: [{ owner_id: '1', provada: true, client_id: 'c1', visited_at: '2026-10-05T13:00:00Z' }, { owner_id: '1', provada: true, client_id: 'c2', visited_at: '2026-10-05T15:00:00Z' }, { owner_id: '2', provada: true }, { owner_id: '2', provada: false }],
  fichas_de_rua: [{ owner_id: '1' }],
  /* estorno de contrato aponta o negócio; o de visita (−20 pts) não tem negócio e não desfaz venda (16/10/26) */
  pontos_eventos: [{ owner_id: '2', tipo: 'contrato', negocio_id: 'n2' }, { owner_id: '2', tipo: 'estorno', origem_id: 'visita_provada:x' }, { owner_id: '2', tipo: 'demo_realizada' }, { owner_id: '3', tipo: 'contrato', negocio_id: 'n3' }, { owner_id: '3', tipo: 'estorno', negocio_id: 'n3' }],
  client_stage_changes: [], playbook_progresso: [], gestor_idas_campo: [],
  /* v4 (07/10/26): a disciplina e as leituras do gestor */
  profiles: [{ id: 'u1', id_hubspot: '1' }, { id: 'u2', id_hubspot: '2' }, { id: 'u3', id_hubspot: '3' }],
  client_meetings: [{ id: 'm1', client_id: 'c1', created_by: 'u1', scheduled_at: '2026-10-05T15:00:00Z', type: 'reuniao' }, { id: 'm2', client_id: 'c2', created_by: 'u1', scheduled_at: '2026-10-02T15:00:00Z', type: 'follow_up' }, { id: 'm3', client_id: 'c1', created_by: 'u1', scheduled_at: '2026-08-22T15:00:00Z' /* 45 dias antes do relógio do teste (06/10); com a data real, envelhecia */, type: 'reuniao' }],
  fila_feitas: [{ user_id: 'u2', dia: '2026-10-06', estado: 'gravada' }, { user_id: 'u2', dia: '2026-10-06', estado: 'desfeita' }],
  dailies: [{ seller_id: 'u3', prometido_visitas: 4 }],
  gestor_v4_leituras: { prospeccao: { '1': { atribuidas: 10, visitadas: 2, avancaram: 1 } }, fonte: [{ dono: '1', origem: 'alvo', portas: 5, avancaram: 2 }, { dono: '3', origem: 'rua', portas: 10, avancaram: 1 }] },
  um_a_um: [{ owner_id: '1', data: '2026-09-23', canal: 'video', created_at: '2026-09-23T12:00:00Z', compromissos: ['a', 'b', 'c'],
    combinados: [{ texto: 'Plano todo dia', regra: 'plano_diario' }, { texto: 'Travados com data', regra: 'travados_com_data' }, { texto: 'Duas demos', regra: 'livre' }] },
    { owner_id: '2', data: '2026-10-01', canal: 'campo', created_at: '2026-10-01T20:00:00Z', compromissos: ['voltar no Bar'], devolutiva: { foco: 'Disciplina de plano' } }], clients: [{ id: 'c1', nome: 'José', empresa: 'Bar do Zé', id_hubspot: 'a' }, { id: 'c2', nome: 'Sidnei', empresa: 'Cantina Sol', id_hubspot: null }]
};
const q = (dados) => { const o = { then: (a, b) => Promise.resolve({ data: dados, error: null }).then(a, b) }; ['select', 'eq', 'gte', 'lt', 'in', 'order', 'limit', 'range', 'not'].forEach(k => { o[k] = () => o; }); return o; };
global.supa = {
  rpc: (nome, a) => (global.__rpcLog = (global.__rpcLog || []).concat([nome]), nome === 'gestor_nomes_dos_clientes' && global.__nomesFalha ? Promise.resolve({ data: null, error: { message: 'função fora' } }) : q(nome === 'planejamento_do_time' ? { pessoas: a.p_segunda === SEG ? pessoasRpc : [], mapa: { checkins: [], plano: [] } } : nome === 'gestor_nomes_dos_clientes' ? tabelas.clients : tabelas[nome] || [])),
  from: (t) => (global.__fromLog = (global.__fromLog || []).concat([t]), q(tabelas[t] || []))
};
const lead = (id, dono, dias, mrr, breach, tarefa) => ({ id, ownerId: dono, name: 'N' + id, dias, mrr, slaBreach: breach, tarefas: tarefa ? [{ timestamp: '2026-10-08T12:00:00Z', subject: 'x' }] : [] });
global.DATA = {
  reps: [{ ownerId: '1', name: 'Ana Lima', praca: 'Vitória' }, { ownerId: '2', name: 'Bia Souza', praca: 'Vitória' }, { ownerId: '3', name: 'Caio Reis', praca: 'Rio' }],
  usuarios: [], stageMeta: { slaDays: {} },
  funilLeads: {
    '1395880472': [lead('a', '1', 2, 500, false, false), lead('b', '2', 9, 300, true, true)],
    '1395880473': [lead('c', '3', 9, 200, true, true)] /* v4: Ag. Pagamento estourando a régua — nem assim é travado */,
    '1395880470': [lead('d', '1', 6, 0, true, false)],
    /* v4: o mesmo restaurante do mesmo dono em Visita (repetido de Na, que está em Negociação) */
    '1396005401': [Object.assign(lead('x', '1', 3, 0, false, false), { name: 'Na' })]
  }
};
global.sessaoAtual = { role: 'manager', nome: 'Julyan Ribeiro', ownerId: '99' };
global.metaClientesDoRep = r => 5;
global.proximoPassoDoLead = l => (l.tarefas[0] ? { quando: new Date(l.tarefas[0].timestamp) } : null);
global.mrrDoNegocio = l => l.mrr || null;
global.esc = v => String(v == null ? '' : v);
global.document = { documentElement: { getAttribute: () => 'sol' } };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };

const relogio = (iso) => { const R = Date; global.Date = class extends R { constructor(...a) { super(...(a.length ? a : [iso])); } static now() { return new R(iso).getTime(); } }; };

/* ── Raio X › Praça (zip-raiox-praca): sistema, dor, decisor e horário; ganhos, perdas e a folha ── */
const [la, lb] = DATA.funilLeads['1395880472'];
la.nome_do_sistema = 'SAIPOS';
lb.nome_do_sistema = 'VERIFICAR'; lb.gargalo_operacional = 'Fila';
Object.assign(DATA.funilLeads['1395880473'][0], { nome_do_sistema: 'anotai', gargalo_operacional: 'Fila', melhor_horario_do_decisor: 'Noite, após as 17', decisorNome: 'Carlos', decisorPapel: 'Dono' });
DATA.funilLeads['1396006164'] = [
  { id: 'p1', ownerId: '1', name: 'P1', nome_do_sistema: 'saipos', motivo_do_perdido: 'Preço', perdidoEm: '2026-10-02', lat: -20.3, lng: -40.3 },
  { id: 'p2', ownerId: '3', name: 'P2', nome_do_sistema: 'Saipos', motivo_do_perdido: 'Outros', perdidoEm: '2026-09-20' }
];
DATA.funilLeads['1396006162'] = [{ id: 'g1', ownerId: '2', name: 'G1', nome_do_sistema: 'Saipos', ganhoEm: '2026-10-01' }];
tabelas.gv2_falta_etapa = [
  { negocio_id: 'b', exec_id: '2', etapa: 'Demo/Proposta', faltou: ['decisor', 'horario'], armas: { sistema: 'Goomer', dor: 'Fila' }, criado_em: '2026-10-05T12:00:00Z' },
  { negocio_id: 'b', exec_id: '2', etapa: 'armas', faltou: ['decisor'], armas: { sistema: 'Goomer' }, criado_em: '2026-10-04T12:00:00Z' }
];

(async () => {
  relogio('2026-10-06T14:20:00Z'); // 11:20 em Brasília
  const GV2 = new Function(codigo + '\nreturn GV2;')();
  /* sem tela neste teste: o redesenho que as leituras pedem por trás (nota mais recente, rota) não faz nada */
  GV2.pintar = function () {};
  const b = await GV2.montar();
  GV2.base = b;
  /* 17/10/26: o playbook atrasado não segura a montagem do gestor; a conta é refeita com a mesma leitura */
  {
    const antPb = global.carregarPlaybookProtegido, antDados = global.playbookDados;
    let soltar; const atrasado = new Promise(function (r) { soltar = r; });
    global.carregarPlaybookProtegido = function () { return atrasado; };
    global.playbookDados = function () { return null; };
    const t0 = Date.now ? process.hrtime.bigint() : 0n;
    /* com prazo: uma promessa que nunca resolve não segura o Node, e a suíte sumiria com código 0 */
    const bSem = await Promise.race([GV2.montar(), new Promise(function (r) { setTimeout(function () { r(null); }, 2000); })]);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    checar('playbook atrasado: a montagem do gestor não espera por ele (< 1 s) e marca o atraso',
      !!bSem && ms < 1000 && !!GV2.playbookAtrasado && !!GV2.ultimaLeitura && !!GV2.ultimaLeitura.L, Math.round(ms) + ' ms');
    let leu = 0; const lerOrig = GV2.ler; GV2.ler = function () { leu++; return lerOrig.apply(GV2, arguments); };
    soltar({});
    const bCom = await GV2.montar(undefined, GV2.ultimaLeitura.L);
    GV2.ler = lerOrig;
    checar('playbook atrasado: refazer a conta usa a leitura que já tinha (nenhuma ida ao banco)', !!bCom && leu === 0 && !GV2.playbookAtrasado, 'leituras ' + leu);
    if (antPb === undefined) delete global.carregarPlaybookProtegido; else global.carregarPlaybookProtegido = antPb;
    if (antDados === undefined) delete global.playbookDados; else global.playbookDados = antDados;
    GV2.playbookAtrasado = null;
  }
  /* 17/10/26: as leituras do gestor saem no login com o time guardado; só valem se o time for o mesmo */
  {
    const antLs = global.localStorage, antSess = global.sessaoAtual;
    const mem = {}; global.localStorage = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } };
    global.sessaoAtual = { email: 'gestor@x', role: 'manager' };
    await GV2.montar();
    const guardado = JSON.parse(mem[GV2.chaveDoTime('gestor@x')] || 'null');
    checar('a montagem do gestor guarda o time neste aparelho', !!guardado && guardado.donos.length > 0, JSON.stringify(guardado && guardado.donos));
    let leu = 0; const lerOrig = GV2.ler; GV2.ler = function () { leu++; return lerOrig.apply(GV2, arguments); };
    GV2.preler('gestor@x');
    await GV2.montar();
    checar('com o mesmo time, a montagem aproveita a leitura do login (uma leitura só)', leu === 1 && !GV2.preLeitura, 'leituras ' + leu);
    leu = 0;
    mem[GV2.chaveDoTime('gestor@x')] = JSON.stringify({ donos: ['999'], emails: {} });
    GV2.preler('gestor@x');
    await GV2.montar();
    checar('com outro time guardado, lê de novo (a leitura adiantada não vale)', leu === 2 && !GV2.preLeitura, 'leituras ' + leu);
    GV2.ler = lerOrig;
    if (antLs === undefined) delete global.localStorage; else global.localStorage = antLs;
    if (antSess === undefined) delete global.sessaoAtual; else global.sessaoAtual = antSess;
  }
  const ana = b.porId['1'], bia = b.porId['2'], caio = b.porId['3'];
  /* 15/10/26: a meta é 6 por dia útil para TODOS (Julyan, 13/10); a meta do app de cada um não entra mais */
  checar('ritmo às 11:20 = 31% da meta de 6: 2 esperadas para todos', ana.esperado === 2 && caio.esperado === 2, 'ana ' + ana.esperado + ' caio ' + caio.esperado);
  checar('sem plano hoje vale 3 de exceção (+1 se furou ontem)', ana.hoje.paradas_plano === 0 && ana.excecao === 4, 'ana ' + ana.excecao);
  checar('plano sem visita abaixo do ritmo vale 2', bia.excecao === 2, 'bia ' + bia.excecao);
  checar('quem está no ritmo e cumpriu ontem tem 0', caio.excecao === 0, 'caio ' + caio.excecao);
  checar('a ordem é por exceção', b.ordem.map(p => p.id).join() === '1,2,3', b.ordem.map(p => p.id).join());
  checar('ontem numa terça é a segunda da mesma semana', ana.ontem.paradas_plano === 6 && ana.ontem.visitas_com_prova === 3 && ana.furou === 3);
  checar('quente = Negociação e Ag. Pagamento; travado = estouro da régua do Cockpit',
    b.time.quentes === 3 && b.time.travados === 2, 'q ' + b.time.quentes + ' t ' + b.time.travados);
  checar('fechado = contratos − estornos do negócio; estorno de visita não desfaz venda', bia.funil_mes.fechado === 1 && caio.funil_mes.fechado === 0);
  checar('portas = só visitas provadas', ana.funil_mes.portas === 2 && bia.funil_mes.portas === 1);
  checar('a meta do mês é a soma das pessoas', b.time.metaMes === 15);
  checar('provável = fechados + Ag. Pagamento + 60% de Negociação (v4)', bia.provavel === 2 && ana.provavel === 1 && caio.provavel === 1, 'bia ' + bia.provavel + ' ana ' + ana.provavel + ' caio ' + caio.provavel);
  /* ── v4 (Pessoas e Raio X, 07/10/26): os testes de aceite 1–4 e 8 do prompt ── */
  checar('v4 · 1: o provável do Time é a soma das Pessoas e o KPI Mês mostra o mesmo número',
    /* 02/11/26: o KPI Mês é o da Hoje (GV2.kpisHoje); o render.kpisTime do Time v4 saiu como código morto */
    b.time.provavel === ana.provavel + bia.provavel + caio.provavel && GV2.kpisHoje(b).provavel === b.time.provavel, 'time ' + b.time.provavel);
  checar('v4 · 3: negócio repetido (mesmo dono, mesmo nome) conta uma vez, na etapa mais avançada, com rep e as outras etapas',
    b.negocios.filter(n => n.nome === 'Na').length === 1 && b.negocios.find(n => n.nome === 'Na').etapa_idx === 4 && b.negocios.find(n => n.nome === 'Na').rep === 2 && /Visita/.test(b.negocios.find(n => n.nome === 'Na').outros.join()),
    b.negocios.map(n => n.nome + ':' + n.etapa_idx).join());
  const agp = b.negocios.find(n => n.id === 'c');
  checar('v4 · 4: Ag. Pagamento nunca é travado, sem passo nem "a puxar", mesmo estourando a régua', agp && agp.agPag && !agp.travado && GV2.semProximoPasso([agp]).length === 0 && !agp.puxar);
  GV2.estado.filtro = 'quentes';
  const negQ = GV2.render.negocios();
  checar('v4 · 4: na lista do Raio X o Ag. Pagamento aparece "com o financeiro" e sem Cobrar', /com o financeiro/.test(negQ) && negQ.indexOf('cobrar:neg:c"') < 0);
  checar('v4: as reuniões que passaram sem desfecho chegam à pessoa pelo created_by (perfis → dono)', ana.disc.nReunioes === 2 && bia.disc.nReunioes === 0 && ana.disc.reunioes[0].id === 'm1', JSON.stringify(ana.disc));
  checar('v4: reunião de mais de 30 dias fica à parte (antigas), fora do número cobrado', ana.disc.antigas && ana.disc.antigas.length === 1 && ana.disc.antigas[0].id === 'm3' && !ana.disc.reunioes.some(function (x) { return x.id === 'm3'; }), JSON.stringify(ana.disc.antigas));
  checar('v4: fila do app conta o Feito e ignora o desfeito; promessa do dia vem de dailies', bia.disc.fila7 === 1 && caio.promessa === 4 && ana.promessa === null);
  checar('v4: prospecção e resultado do mês por pessoa', ana.prosp.atribuidas === 10 && bia.resultado.fechados === 1 && bia.resultado.meta === 5 && bia.resultado.faltam === 4);
  checar('cada passo do funil é a lista que o gestor abre ao clicar', [0, 1, 2, 3, 4].every(i => b.time.funil[i] === b.funilItens[i].length), b.time.funil.join() + ' vs ' + b.funilItens.map(x => x.length).join());
  GV2.estado.passo = 0; GV2.estado.passoDono = '1';
  const lista = GV2.render.negocios();
  checar('o passo lista o RESTAURANTE (negócio no funil ou empresa), nunca o contato, com a etapa de hoje', lista.indexOf('>Na</b>') >= 0 && /Cantina Sol/.test(lista) && !/Sidnei|José/.test(lista) && /Negociação/.test(lista));
  GV2.estado.passo = null;
  /* ── Pessoas (pacote pessoa.zip) ── */
  GV2.pessoasMontar(b);
  checar('1:1 e campo contam dias corridos desde o último registro de cada canal', ana.u1 === 13 && ana.uv === null && bia.u1 === null && bia.uv === 5, 'ana ' + ana.u1 + '/' + ana.uv + ' bia ' + bia.u1 + '/' + bia.uv);
  checar('necessidade = exceção + 1:1 atrasado + campo atrasado', ana.necessidade === 8 && bia.necessidade === 4 && caio.necessidade === 4, [ana.necessidade, bia.necessidade, caio.necessidade].join());
  checar('sem plano hoje, o foco do dia é disciplina de plano', ana.foco === 'plano');
  const cs = ana.combinados;
  checar('o combinado é conferido sozinho: plano (não), travados (não), livre (a conferir)', cs[0].ok === false && /hoje sem plano/.test(cs[0].ev) && cs[1].ok === false && /0 de 1 com data/.test(cs[1].ev) && cs[2].ok === null, cs.map(c => c.ok + ':' + c.ev).join(' | '));
  checar('a pauta diz o placar dos combinados', /Cumpriu 0 de 2/.test(GV2.pautaPessoa(ana)[1].t));
  const rt = GV2.roteiro(ana);
  /* 08/10/26: sem parada não é "sem plano" quando há agenda; a mesma fonte da Agenda do app */
  (function () {
    const hoje = GV2.base.agora.iso;
    const antes = DATA.agenda;
    DATA.agenda = { itens: [
      { hubspot_owner_id: ana.id, hs_task_subject: 'OPORTUNIDADE - LIGAÇÃO - Casa X', hs_timestamp: hoje + 'T15:45:00Z', hs_task_status: 'NOT_STARTED' },
      { hubspot_owner_id: ana.id, hs_task_subject: 'Follow-up', hs_timestamp: hoje + 'T13:00:00Z', hs_task_status: 'COMPLETED' },
      { hubspot_owner_id: ana.id, hs_note_body: 'nota', hs_timestamp: hoje + 'T13:00:00Z' },
      { hubspot_owner_id: ana.id, hs_meeting_title: 'Reunião Y', hs_meeting_start_time: hoje + 'T17:00:00Z' }
    ] };
    const ag = GV2.compromissosDoDia(ana.id, hoje);
    DATA.agenda = antes;
    const p = { hoje: { agenda: ag } }, vazio = { hoje: { agenda: { n: 0 } } };
    checar('agenda do dia: conta tarefa e reunião, ignora nota e tarefa concluída; quem não tem parada mas tem agenda é "sem rota", não "sem plano"',
      ag.n === 2 && ag.lig === 1 && ag.reun === 1 && GV2.semRotaHoje(p) === 'sem rota hoje · 1 ligação, 1 reunião na agenda' && GV2.semRotaHoje(vazio) === 'sem plano nem agenda hoje', JSON.stringify(ag));
  })();
  /* 08/10/26: no Raio X, cada número abre a gaveta com quem está ali */
  (function () {
    GV2.estado.veu = null; GV2.estado.rxGav = null;
    GV2.rxGavClique(['rxg', 'passo', '1']);
    const g1 = GV2.estado.rxGav && GV2.estado.veu === GV2.render.rxGav && GV2.render.rxGav().indexOf('gv2-rxg') > 0;
    GV2.rxGavClique(['rxg', 'etapa', '4', 'sv']);
    const c = GV2.rxGavConteudo();
    const g2 = /sem valor/.test(c.tit);
    GV2.rxGavClique(['rxg', 'filtro', 'travados']);
    const g3 = /^Travados · \d+/.test(GV2.rxGavConteudo().tit);
    GV2.rxGavClique(['rxg', 'fechar']);
    const g4 = GV2.estado.rxGav === null && GV2.estado.veu === null && GV2.estado.passo === null;
    const h = GV2.render.raiox();
    const mortos = (h.match(/<button[^>]*data-gv2=""/g) || []).length;
    checar('raio x: passo, etapa sem valor e KPI abrem a gaveta; fechar limpa; nenhum botão sem destino', g1 && g2 && g3 && g4 && mortos === 0 && /data-gv2="rxg:passo:\d+:\d+"/.test(h) && /data-gv2="rxg:etapa:/.test(h) && /class="gv2-v4-funil-lin[^"]*" data-gv2="rxg:passo:\d+"/.test(h) && /data-gv2="rxg:passo:[0-9]" class="gv2-v5-kpi"/.test(h) && /data-gv2="rxg:filtro:todos"/.test(h), JSON.stringify({ g1: g1, g2: g2, g3: g3, g4: g4, mortos: mortos, a: /data-gv2="rxg:passo:\d+:\d+"/.test(h), b: /data-gv2="rxg:etapa:/.test(h), c: /class="gv2-v4-funil-lin[^"]*" data-gv2="rxg:passo:\d+"/.test(h), d: /data-gv2="rxg:passo:[0-9]" class="gv2-v5-kpi"/.test(h), e: /data-gv2="rxg:filtro:todos"/.test(h) }));
  })();
  (function () {
    GV2.estado.veu = null; GV2.estado.rxGav = null;
    GV2.rxGavClique(['rxg', 'plano', ana.id]);
    const c = GV2.rxGavConteudo();
    const tempo = GV2.render.time ? GV2.render.time() : '';
    GV2.rxGavClique(['rxg', 'fechar']);
    checar('planejamento: o cartão do Hoje abre a gaveta, o Funil leva à Rua › Semana (v8); o plano de cada um abre o dia na Rua', /^Planejamento de /.test(c.tit) && c.corpo.indexOf('gv2-rt') > 0 && tempo.indexOf('v5dia:' + ana.id + ':') > 0 && tempo.indexOf('data-gv2="rxg:plano"') > 0 && GV2.render.raiox().indexOf('data-gv2="v8ir:rua:semana"') > 0, c.tit);
  })();
  (function () {
    GV2.estado.rotaSem = -1; GV2.estado.rotaDia = '2026-09-30';
    GV2.rotaComando('ruasel', ['ruasel', ana.id]);
    checar('rua: trocar de pessoa volta a rota para esta semana e hoje', GV2.estado.rotaSem === 0 && GV2.estado.rotaDia === null);
  })();
  /* DESENVOLVIMENTO DO EXECUTIVO (07/10/26): o teste de aceite 1 — os 4 números do topo são os
     do resumo da Pessoas v4 para a mesma pessoa, da mesma base; e a frase segue a ordem das regras */
  (function () {
    const DV = GV2.DV;
    DV.estado.base = GV2.base; DV.estado.medias = { pessoas: 3, reunioes30: 3, portas7: 10, portasSemFicha: 1, fichasMes: 10, decisorMes: 5, fila7: 1, diasComPlano: 6, diasUteisAteHoje: 3 };
    const nums = function (html, re) { const m = []; let x; while ((x = re.exec(html))) m.push(x[1].replace(/<[^>]+>/g, '')); return m; };
    GV2.base.pessoas.forEach(function (p) {
      DV.estado.p = p; DV.estado.fizEm = {};
      const h = DV.com(function () { return DV.html(p); });
      /* v3 (09/10/26, ws.zip): os 5 cartões do topo são os da Pessoas v5 do gestor (GV2.render.v5Pessoa),
         mesma base. Porta → decisor: o gestor mostra a %, o executivo a escada; a % sai da escada. */
      const dv = nums(h, /class="dv-c5"><small>[^<]*<\/small><b[^>]*>([^<]*)<\/b>/g);
      const pg = GV2.render.v5Pessoa ? GV2.render.v5Pessoa(p) : '';
      const ge = nums(pg, /class="gv2-v5-res"[^>]*><small>[^<]*<\/small><b[^>]*>([^<]*)<\/b>/g);
      const so = function (t) { return (String(t).match(/[0-9]+(,[0-9]+)?|—/g) || []).join(' '); };
      const fm = p.funil_mes || {};
      const pdEscada = fm.portas >= 3 ? Math.round(fm.decisor / fm.portas * 100) + '%' : '—';
      const iguais = dv.length === 5 && ge.length === 5
        && so(dv[0]) === so(ge[0]) && dv[0].replace(/[0-9 de]/g, '') === ge[0].replace(/[0-9 de]/g, '')
        && so(dv[1]) === so(ge[1]) && so(dv[2]) === so(ge[2]); /* v8 (13/10/26): os dois últimos do gestor viraram Quentes e Travados (o resumo da gaveta); Hoje, Semana e Mês seguem iguais aos do executivo */
      checar('desenvolvimento: Hoje, Semana e Mês de ' + p.nome + ' são os mesmos da Pessoas do gestor (mesma base)', iguais, JSON.stringify({ dv: dv, gestor: ge, pdEscada: pdEscada }));
    });
    const p = GV2.base.pessoas[0], d = p.disc;
    const um = { dia: '2026-10-13', hora: '08:30', dias: 5, hoje: false };
    const salva = { n: d.nReunioes, u: p.ultimo1a1 };
    d.nReunioes = 25; p.ultimo1a1 = p.ultimo1a1 || { data: '2026-10-05', combinados: [] };
    const f1 = DV.com(function () { return DV.frase(p, um, [], null); });
    p.ultimo1a1 = null;
    const f2 = DV.com(function () { return DV.frase(p, um, null, null); });
    const f3 = DV.com(function () { return DV.frase(p, { dia: '2026-10-08', hora: '08:30', dias: 1, hoje: false }, [{ r: 'em_aberto' }, { r: 'cumprido' }], null); });
    d.nReunioes = salva.n; p.ultimo1a1 = salva.u;
    checar('desenvolvimento: a frase do topo segue a ordem das regras (véspera > primeiro 1:1 > ... > reuniões)', /^Feche as reuniões que passaram: 25 esperando desfecho\.$/.test(f1.t) && f1.ir === 'disc' && /^Seu primeiro 1:1 é terça 13\/10\./.test(f2.t) && /^Amanhã às 08:30: 1 combinado em aberto\.$/.test(f3.t), [f1.t, f2.t, f3.t].join(' | '));
    const um2 = DV.proximo1a1({ iso: '2026-10-07', min: 600, dow: 3 });
    checar('desenvolvimento: 1:1 de segunda que cai em feriado vai para o próximo dia útil, mesma hora', um2.dia === '2026-10-13' && um2.hora === '08:30', JSON.stringify(um2));
  })();
  checar('sidebar: o selo do Hoje conta as linhas de "Quem precisa de você" que pedem ação (não conta "Ainda não saiu") e some com 0', (function () {
    const n = GV2.v5Grupos().grupos.filter(function (g) { return g.sev < 3; }).length, h = GV2.navHTML();
    const m = h.match(/class="gv2-badge">(\d+)</);
    const orig = GV2.v5Grupos; GV2.v5Grupos = function () { return { grupos: [{ sev: 3 }], sit: {} }; }; const h0 = GV2.navHTML(); GV2.v5Grupos = orig;
    return n > 0 && m && Number(m[1]) === n && h0.indexOf('gv2-badge') < 0 && h0.indexOf('gv2-nav-ponto') < 0;
  })(), String(GV2.v5Grupos().grupos.length));
  checar('sidebar: símbolo oficial em PNG (nunca o t de texto), um ícone por aba e o ativo marcado', (function () {
    const h = GV2.navHTML();
    const paths = (h.match(/<path d="[^"]+"/g) || []).slice(0, 7);
    return h.indexOf('assets/takeat-t-oficial.png') > 0 && h.indexOf('>t<') < 0 && paths.length === 7 && new Set(paths).size === 7 && /aria-current="page"/.test(h);
  })());
  /* 02/11/26: a grade da Rua v4 (render.ruaSemana) e a linha de promessa (v4Promessa) saíram como código
     morto; fica a prova do dado, que a Rua v5 lê */
  checar('sem lugar no mapa: o item do plano que o app não põe na rota chega ao gestor', GV2.base.porId['2'].semana[4].semLugar === 2, JSON.stringify(GV2.base.porId['2'].semana[4]));
  checar('roteiro: quente e travado primeiro (o mais perto do dinheiro antes), com o motivo certo', rt[0].n.id === 'a' && /pedir a decisão juntos/.test(rt[0].motivo) && rt[1].n.id === 'd' && rt[1].motivo.indexOf('régua 4) · ir junto no decisor') >= 0 && rt[0].hora === '09:00' && rt.slice(2).every(function (r) { return !r.n.quente && !r.n.travado; }), rt.map(r => r.hora + ' ' + r.n.id + ' ' + r.motivo).join(' | '));
  checar('combinar agora: sem plano pede o plano; travado pede data; quente pede decisão no negócio', (function () { const c = GV2.combinarAgora(ana); return c[0].regra === 'plano_diario' && c[1].regra === 'travados_com_data' && c[2].regra === 'decisao_em_negocio' && c[2].alvo.negocio_id === 'a'; })());
  checar('a rotação proposta é uma praça por semana, a mais urgente primeiro', (function () { const r = GV2.propostaRotacao(false); return r.length === 5 && r[0].inicio === '2026-10-05' && r[1].inicio === '2026-10-12'; })());
  /* Pessoas v3 (06/10/26): uma página com 5 seções fixas, a lista e a barra do pé; a rotação vira folha */
  let p3 = '';
  try { p3 = GV2.render.pessoas(); } catch (e) { falhas.push('pessoas v3: ' + e.message); }
  const melhor = GV2.melhorV4(b.pessoas, b.time.funil);
  checar('v4 · 2: "melhor" nunca mostra taxa menor ou igual à do time nem amostra < 3', melhor.slice(1).every(function (m, j) {
    const i = j + 1, K = ['portas', 'decisor', 'demo', 'proposta', 'fechado'], F = b.time.funil;
    if (!m.nome) return /ninguém acima do time|sem comparação honesta/.test(m.txt);
    const p = b.pessoas.find(x => x.nome === m.nome);
    return p.funil_mes[K[i - 1]] >= 3 && m.pct > Math.round(F[i] / F[i - 1] * 100);
  }), JSON.stringify(melhor));
  /* Pessoas v2 (02/11/26, design_handoff_gestor_v2): a página da pessoa abre num painel largo, e a página de
     antes vai inteira para "A página de antes, inteira" no fim do painel (nada some). As checagens da v5/v6
     abaixo leem essa parte; a v2 tem a suíte própria (testar-pessoas-v2.js). */
  GV2.estado.pv2Pan = b.pessoas[0].id;
  let p3pan = '';
  try { p3pan = GV2.render.pessoas(); } catch (e) { falhas.push('pessoas v2 · painel: ' + e.message); }
  GV2.estado.pv2Pan = null;
  const antes = p3pan.slice(p3pan.indexOf('<details class="pv2-antes"'));
  checar('v6 · Pessoas (a página de antes, no painel v2): 4 blocos numa rolagem (Agora e semana → Rua · 7 dias → Coaching → Evolução), o resumo de 5, sem segundo nível de abas, sem "Promessa de hoje" e sem "Chamar"',
    antes.indexOf('1 · Agora e semana') > 0 && antes.indexOf('2 · Rua · 7 dias') > antes.indexOf('1 · Agora e semana') && antes.indexOf('3 · Coaching') > antes.indexOf('2 · Rua · 7 dias') && antes.indexOf('4 · Evolução') > antes.indexOf('3 · Coaching')
      && (antes.match(/class="gv2-v5-res"/g) || []).length === 5 && p3pan.indexOf('gv2-p3-abas') < 0 && p3pan.indexOf('Promessa de hoje') < 0 && p3pan.indexOf('p3:chamar') < 0);
  checar('v2 · Pessoas: "Onde o seu tempo rende" virou os 4 contadores e a placa (uma linha por pessoa); o painel tem os atalhos para a gaveta (1:1, disciplina, campo, funil) e a rotação',
    !/Onde o seu tempo rende esta semana/.test(p3) && /MINHA SEMANA DE LÍDER/.test(p3) && (p3.match(/class="pv2-cont[ "]/g) || []).length === 4 && (p3.match(/class="pv2-lin( is-feito)?( is-apagada)?"/g) || []).length === b.pessoas.length
      && ['um', 'disc', 'campo', 'funil'].every(function (t) { return p3pan.indexOf('data-gv2="v5gav:' + t + ':') > 0; }) && /data-gv2="p3:rotacao"/.test(p3) && !/Sua rotação de campo/.test(p3));
  let telas = p3; try { telas += GV2.render.time(); } catch (e) { falhas.push('time: ' + e.message); }
  checar('v4 · 8: "0 de 0" não aparece em lugar nenhum (Pessoas e Time)', !/(^|[^0-9])0 de 0([^0-9]|$)/.test(telas.replace(/<[^>]+>/g, ' ')), (function () { const t = telas.replace(/<[^>]+>/g, ' '); const i = t.search(/(^|[^0-9])0 de 0([^0-9]|$)/); return i < 0 ? '' : t.slice(Math.max(0, i - 80), i + 40).replace(/s+/g, ' '); })());
  GV2.estado.p3rotacao = true;
  checar('Pessoas v3: a rotação abre numa folha lateral, com o mesmo componente', /class="gv2-p3-folha"/.test(GV2.render.pessoas()) && /Sua rotação de campo/.test(GV2.render.pessoas()));
  GV2.estado.p3rotacao = false;
  checar('a Prova não acusa nada com a base íntegra', GV2.testes.prova().length === 0, GV2.testes.ultimo.join(' · '));
  /* a guarda tem dente: um total adulterado tem de aparecer */
  const errOrig = console.error; console.error = () => {};
  b.time.visitas += 1;
  const acusou = GV2.testes.prova().some(e => /visitas/.test(e));
  b.time.visitas -= 1;
  console.error = errOrig;
  checar('a Prova acusa um total que não é a soma das pessoas', acusou);
  /* 02/11/26 (auditoria): a Prova prova os KPIs que a Hoje MOSTRA (visitasTodas, planos sem rampa,
     sem próximo passo pela regra canônica), não o render.kpisTime do Time v4 */
  {
    console.error = () => {};
    b.time.visitasTodas += 1;
    const acusouTodas = GV2.testes.prova().some(e => /visitas da Hoje/.test(e));
    b.time.visitasTodas -= 1;
    console.error = errOrig;
    const K = GV2.kpisHoje(b), pv = GV2.render.prova();
    const linhaTopo = pv.slice(pv.indexOf('Hoje (topo)'));
    checar('auditoria 02/11 · G4: a Prova acusa quando o KPI de visitas da Hoje (visitasTodas) não é a soma das pessoas', acusouTodas);
    checar('auditoria 02/11 · G4/G3: a Prova tem a coluna "Sem próx. passo" e a linha do topo traz o número de GV2.semProximoPasso',
      pv.indexOf('Sem próx. passo') > 0 && K.semProximoPasso === GV2.semProximoPasso(b.negocios).length && linhaTopo.indexOf('>' + K.semProximoPasso + '<') > 0 && pv.indexOf('Time e Raio X') < 0, String(K.semProximoPasso));
    checar('auditoria 02/11 · G4: a Hoje lê os mesmos KPIs (GV2.kpisHoje) que a Prova prova', /const KH = GV2\.kpisHoje\(b\);/.test(codigo) && /KH\.planos \+ ' de ' \+ KH\.naRua/.test(codigo));
    /* G1: a conferência automática aparece dentro do GV2 */
    const antSync = DATA.syncStatus;
    DATA.syncStatus = { conferencia: { em: '2026-10-06T12:30:00Z', itens: [{ texto: 'fechados: HubSpot 5, cockpit 4' }] } };
    const nav = GV2.navHTML(), pv2 = GV2.render.prova();
    DATA.syncStatus = antSync;
    checar('auditoria 02/11 · G1: a divergência da conferência aparece no menu do GV2 e na Prova',
      /1 divergência na conferência das 09:30 — ver/.test(nav) && /data-gv2="menu:prova"[^>]*>1 divergência/.test(nav.replace(/title="[^"]*"/g, '')) && pv2.indexOf('fechados: HubSpot 5, cockpit 4') > 0, nav.slice(nav.indexOf('gv2-nav-pe'), nav.indexOf('gv2-nav-pe') + 300));
    checar('auditoria 02/11 · G1: com gv2-on, as views antigas (dentro de main.app-main) somem de verdade',
      /body\.gv2-on #appRoot \.app-main > \.view\{display:none !important;\}/.test(tpl) && !/body\.gv2-on #appRoot > \.view/.test(tpl));
    /* G12: sem ownerId na sessão, "Ver como executivo" some */
    const antS = global.sessaoAtual;
    global.sessaoAtual = { role: 'manager', nome: 'Gestor' };
    const navSem = GV2.navHTML();
    global.sessaoAtual = antS;
    checar('auditoria 02/11 · G12: "Ver como executivo" some sem ownerId na sessão', navSem.indexOf('menu:executivo') < 0 && GV2.navHTML().indexOf('menu:executivo') > 0);
    /* G3: "sem próximo passo" por pessoa é GV2.semProximoPasso; o que é só dos quentes diz "quentes sem passo" */
    const pp = GV2.render.v8PorPessoa();
    const spAna = GV2.semProximoPasso(ana.negocios).length;
    checar('auditoria 02/11 · G3: Funil › Por pessoa tem a coluna "Sem próx. passo" com o número da regra canônica',
      pp.indexOf('<span>Sem próx. passo</span>') > 0 && new RegExp('data-gv2="v8neg:sempasso:1"[^>]*><span><b class="num[^"]*">' + spAna + '</b>').test(pp), String(spAna));
    const rx = GV2.render.raiox();
    checar('auditoria 02/11 · G3: "Negócios para puxar" diz "em Negociação sem passo", não "sem próximo passo (no prazo"',
      /em Negociação sem passo \(no prazo/.test(rx) && !/sem próximo passo \(no prazo/.test(rx));
    const pes = GV2.render.v5Pessoa(ana), hj = GV2.render.time();
    checar('auditoria 02/11 · G3: os cartões de Quentes (Pessoas e Hoje) dizem "quentes sem passo" e não chamam isso de "sem próximo passo"',
      !/[0-9]+ sem próximo passo<\/span>/.test(pes) && /sem próximo passo no funil/.test(pes) && /quentes? sem passo/.test(hj) && !/>[0-9]+ sem próximo passo</.test(hj));
    /* G6: o mini do Por pessoa mostra o esperado E a meta; esperado 0 é "mês começando", não "0 de 0" */
    const rOrig = GV2.v8Ritmo;
    GV2.v8Ritmo = function (p, b2) { const R = rOrig(p, b2); if (p && R) { R.cli = Object.assign({}, R.cli, { feito: 0, esp: 0, meta: 8 }); } return R; };
    const pp0 = GV2.render.v8PorPessoa();
    GV2.v8Ritmo = rOrig;
    checar('auditoria 02/11 · G6: com esperado 0, o Por pessoa diz "mês começando · meta 8" e nunca "0 de 0"',
      /mês começando · meta 8/.test(pp0) && !/<\/b> de 0</.test(pp0));
    /* G7: sem meta é "sem meta" — nada de "N de 0", da meta 8 do "|| 8" nem do MRR de reserva 1500/3000 */
    const metaEra = ana.meta_clientes_mes;
    ana.meta_clientes_mes = 0;
    const pesSem = GV2.render.v5Pessoa(ana).replace(/<[^>]+>/g, ' '), m7 = GV2.v7Meta(ana, 5), mrr0 = GV2.v8dMrr(ana);
    ana.meta_clientes_mes = metaEra;
    checar('auditoria 02/11 · G7: meta 0 → "sem meta" na Pessoas (nunca "de 0"), v7Meta sem a meta 8 inventada, MRR sem a reserva 1500/3000',
      /sem meta/.test(pesSem) && !/[0-9] de 0([^0-9,]|$)/.test(pesSem) && m7.vendas === null && m7.demos === null && mrr0.meta === null && GV2.deMeta(3, 0) === '3 · sem meta' && GV2.deMeta(3, 8) === '3 de 8',
      JSON.stringify({ m7: m7, mrr: mrr0 }));
    /* G8: a proposta vencida volta em dias ÚTEIS (régua 7, 9 dias úteis → 2 dias úteis antes de ter 06/10 = sex 02/10, não dom 04/10) */
    const pB = b.propostas.lista.find(x => x.deal === 'b');
    checar('auditoria 02/11 · G8: o "vale até" da vencida conta para trás em dias úteis (sex 02/10, não dom 04/10)', pB && pB.valeAteRot === '02/10', JSON.stringify(pB && { st: pB.status, ate: pB.valeAteRot }));
    checar('auditoria 02/11 · G7: o rodapé da Semana não fixa mais "pleno 8 · rampa 4"', tpl.indexOf('pleno 8 · rampa 4') < 0);
  }
  checar('cada aba desenha sem erro', ['time', 'raiox', 'rua', 'pessoas', 'propostas', 'playbook', 'prova'].every(a => {
    try { GV2.estado.aba = a; return typeof GV2.render[a]() === 'string'; } catch (e) { falhas.push('aba ' + a + ': ' + e.message); return false; }
  }));
  GV2.estado.daily = 0;
  checar('a daily desenha a primeira pessoa da ordem', /Ana Lima/.test(GV2.render.daily()));
  GV2.estado.daily = null;

  /* ── Raio X › Funil e Praça (zip-raiox-praca, Parte 8) ── */
  const N = (v, e) => checar('sistema "' + v + '" → ' + (e || 'não registrado'), GV2.normalizarSistema(v) === e, String(GV2.normalizarSistema(v)));
  N('SAIPOS', 'Saipos'); N('anotai', 'Anota Aí'); N('saipos e cardápio web', 'Saipos'); N('não usa', 'Nenhum'); N('VERIFICAR', null); N('', null); N('Não sei ainda', null); N('Sistema da casa', 'Outro');
  const ng = id => b.negocios.find(n => n.id === id);
  checar('o sistema: a folha (Goomer) vence o VERIFICAR do HubSpot; anotai vira Anota Aí', ng('a').arma.sistema === 'Saipos' && ng('b').arma.sistema === 'Goomer' && ng('c').arma.sistema === 'Anota Aí');
  checar('decisor e horário do HubSpot entram nas armas', ng('c').arma.faltam.length === 0 && ng('c').arma.decisor === 'Carlos' && ng('c').arma.horario === 'após 17h', ng('c').arma.faltam.join());
  checar('com Todas, o recorte É a base (bate com Time e Prova)', (GV2.estado.prf = 'todas', GV2.rx() === b));
  GV2.estado.prf = 'vv';
  checar('o recorte por praça soma só as pessoas da praça', GV2.rx().time.quentes === 2 && GV2.rx().negocios.length === 3, GV2.rx().time.quentes + '/' + GV2.rx().negocios.length);
  checar('a Prova segue limpa com uma praça escolhida', GV2.testes.prova().length === 0, GV2.testes.ultimo.join());
  GV2.estado.prf = 'todas';
  checar('filtro "Sem sistema ou dor": Demo em diante sem um dos dois', GV2.filtroNegocios('semarma').map(n => n.id).join() === 'a', GV2.filtroNegocios('semarma').map(n => n.id).join());
  GV2.estado.filtro = 'todos'; GV2.estado.aba = 'raiox'; GV2.estado.rxm = 'funil';
  const rxf = GV2.render.raiox();
  /* v5: a tabela de Negócios (Sistema, filtros, Cobrar) vive na gaveta "Ver todos os negócios" */
  GV2.rxGavClique(['rxg', 'filtro', 'todos']);
  const gNeg = GV2.rxGavConteudo().corpo;
  GV2.rxGavClique(['rxg', 'fechar']);
  checar('Negócios (na gaveta "Ver todos") ganha a coluna Sistema, com "não registrado", os filtros e o clique para o Território', /Sistema/.test(gNeg) && /não registrado/.test(gNeg) && /data-gv2="pxsis:vv:Saipos"/.test(gNeg) && /data-gv2="rxg:filtro:semarma"/.test(gNeg));
  {
    const pintarT = GV2.pintar, irT = GV2.ir; GV2.pintar = function () {}; GV2.ir = function (a) { GV2.estado.aba = a; };
    GV2.pxComando('pxsis', ['pxsis', 'vv', 'Saipos']);
    GV2.pintar = pintarT; GV2.ir = irT;
    checar('v5 · o clique no sistema abre o Território na praça, com o concorrente', GV2.estado.aba === 'terr' && GV2.estado.pr === 'vv' && GV2.estado.cz === 'Saipos');
    GV2.estado.aba = 'raiox'; GV2.estado.cz = null;
  }
  checar('Funil do mês diz que é contagem por passo, não a mesma turma (v4)', /não a mesma turma/.test(rxf));
  checar('a ficha do negócio carrega o bloco das armas (Meu funil do executivo)', tpl.indexOf("GV2.armasNaFicha(l, document.getElementById('gv2ArmasFicha'))") > 0);
  const C = GV2.pracaContra('vv');
  checar('Contra quem: abertos por sistema = lista do painel', C.lista.every(x => x.ab === x.abertos.length));
  checar('Contra quem: abertos com sistema + não registrados = abertos da praça', C.lista.reduce((s, x) => s + x.ab, 0) + C.nSem === C.abertos && C.abertos === 3);
  const sai = C.lista.find(x => x.k === 'Saipos');
  checar('Contra quem: Saipos 1 aberto, 1 ganho, 1 perda por Preço', sai && sai.ab === 1 && sai.g === 1 && sai.p === 1 && sai.motivo === 'Preço', JSON.stringify(sai && { ab: sai.ab, g: sai.g, p: sai.p, m: sai.motivo }));
  checar('amostra pequena (n < 10): mostra contagem', C.pequena === true && C.nSis === 2);
  const A = GV2.pracaArmas('vv');
  const linha = id => A.linhas.find(l => l.p.id === id);
  checar('armas que faltam: Ana 1 negócio de Demo em diante, sem dor, decisor e horário', linha('1').ns.length === 1 && linha('1').c.dor === 1 && linha('1').c.sistema === 0 && linha('1').c.decisor === 1, JSON.stringify(linha('1').c));
  checar('"Avançou sem preencher" conta a folha e ignora o "Salvar as armas"', linha('2').pulou === 1, String(linha('2').pulou));
  const AR = GV2.armas(ng('c'));
  checar('GV2.armas: Ag. Pagamento é "pra Negociação", 4 de 4, argumento do delivery', AR.titulo === 'Suas armas pra Negociação' && AR.n === 4 && AR.argumento.objecao === 'Meu delivery já está resolvido');
  checar('GV2.armas: a praça do executivo pelo agregado do banco (executivo sem base)',
    /Fila é a dor nº 1 \(14 negócios em Rio\)\. Contra a Anota Aí, o time ganhou 0 e perdeu 2, a maioria por "preço"\./.test(GV2.linhaDaPraca(GV2.armas(ng('c'), { praca: 'Rio', dores: [{ dor: 'Fila', n: 14 }], fechados: [{ s: 'anota ai', g: false, m: 'Preço' }, { s: 'Anota Aí', g: false, m: 'Outros' }] }))));
  /* a Praça desenha com as leituras do banco já feitas */
  GV2.px.cache.vv = { estado: 'ok', em: '11:20', vis: { data: [] }, notas: { data: [] }, cli: { data: [] },
    leads: { data: [{ lat: -20.31, lng: -40.29, bairro: 'Praia do Canto' }, { lat: -20.32, lng: -40.3, bairro: 'PRAIA DO CANTO' }, { lat: -20.33, lng: -40.31, bairro: 'Centro' }] } };
  GV2.estado.rxm = 'praca'; GV2.estado.pr = 'vv'; GV2.estado.cz = 'Saipos';
  /* Território v2 (15/10/26): a Praça (Onde atacar, calor, armas) saiu da aba; o "Saipos" da gaveta
     de Negócios (pxsis) continua abrindo o painel do concorrente, agora por cima do Território v2 */
  let px = '';
  try { px = GV2.render.t10Concorrente(); } catch (e) { falhas.push('Território · concorrente: ' + e.message); }
  checar('o clique no sistema abre o painel do concorrente por cima do Território v2', /Concorrente · Vitória/.test(px) && /<h2>Saipos<\/h2>/.test(px) && /data-gv2="pxcz:"/.test(px), px.slice(0, 200));
  /* Pessoas › Funil e o mapa grande (06/10/26) */
  GV2.estado.cz = null; GV2.estado.aba = 'pessoas'; GV2.estado.pmodo = 'funil'; GV2.estado.pessoa = '1';
  /* v5: o funil da pessoa (Para puxar, Cobrar) abre na gaveta, pelo cartão do funil ou pelo Mês */
  GV2.estado.v5Gav = { t: 'funil', id: '1' };
  let pf = '';
  try { pf = GV2.render.pessoas(); } catch (e) { falhas.push('Pessoas › Funil: ' + e.message); }
  const ana1 = GV2.base.porId['1'];
  /* 02/11/26: o render.funilPessoa (dossiê v2) saiu como código morto; o funil da pessoa é o da gaveta */
  checar('Pessoas › Funil em barras: o funil do mês e as etapas clicáveis', /Funil do mês/.test(pf) && /data-gv2="fpetapa:4"/.test(pf));
  checar('Pessoas v3 › Funil: "Para puxar" com Cobrar em cada linha e Cobrar os N (travado d, quente a sem passo)', /Para puxar · travados e quentes sem passo · 2/.test(pf) && /data-gv2="cobrar:neg:d"/.test(pf) && /data-gv2="cobrar:neg:a"/.test(pf) && /data-gv2="p3:cobrartodos:1"/.test(pf));
  /* v5: a pauta completa, os combinados e o Registrar abrem na gaveta do 1:1 */
  GV2.estado.v5Gav = { t: 'um', id: '1' };
  const um = GV2.render.pessoas();
  checar('1:1: + Combinado, Tirar, prazo que troca e Automático | Você confere em cada cartão', /data-gv2="comb:add:1"/.test(um) && /data-gv2="comb:tirar:1:0"/.test(um) && /data-gv2="p3:prazo:1:0"/.test(um) && /data-gv2="p3:conf:1:0:manual"/.test(um));
  /* a barra do pé segue a seção em foco (§8) */
  const pe = function (s) { return GV2.p3Pe(ana1, s); };
  checar('barra do pé: 1:1 → Registrar 1:1 · 3 combinados; Disciplina → Cobrar a disciplina; Funil → Cobrar os 2; Campo → Marcar ida; sempre Pauta e nunca Chamar (v4)',
    /Registrar 1:1 · 3 combinados/.test(pe('um')) && /Cobrar a disciplina/.test(pe('disc')) && /Cobrar os 2/.test(pe('funil')) && /Marcar ida/.test(pe('campo')) && ['agora', 'ritmo', 'disc', 'funil', 'um', 'campo'].every(function (s) { return !/p3:chamar/.test(pe(s)) && /data-gv2="pauta:wa:1"/.test(pe(s)); }));
  checar('barra do pé: sem plano pede o plano até 15h; plano com 0 provadas → Cobrar a primeira visita (v4)', /Pedir o plano até 15h|Pedir o plano de amanhã/.test(pe('agora')) && /v4:cobrarvisita:2/.test(GV2.p3Pe(GV2.base.porId['2'], 'agora')));
  /* nada some: o texto do combinado fica ao trocar de pessoa e voltar */
  GV2.estado.comb1a1['1'][0].texto = 'Texto que não pode sumir';
  GV2.estado.pessoa = '2'; GV2.estado.v5Gav = { t: 'um', id: '2' }; const outra = GV2.render.pessoas(); GV2.estado.pessoa = '1'; GV2.estado.v5Gav = { t: 'um', id: '1' };
  checar('nada some: digitar num combinado, trocar de pessoa e voltar mantém o texto', !/Texto que não pode sumir/.test(outra) && /Texto que não pode sumir/.test(GV2.render.pessoas()));
  GV2.estado.v5Gav = null;
  /* Registrar grava prazo, conferência e origem por combinado e manda cada um para o sino */
  {
    const supaOrig = global.supa, cdOrig = GV2.comDesfazer, recOrig = GV2.recado;
    let gravado = null; const recados = [];
    global.supa = { from: function () { return { insert: function (l) { gravado = l; return { select: function () { return { single: async function () { return { data: Object.assign({ id: 'x' }, l), error: null }; } }; } }; } }; } };
    GV2.comDesfazer = function (id, gravar) { return gravar(); };
    GV2.recado = async function (p, t) { recados.push(t); };
    await GV2.registrarUmAUm('1');
    global.supa = supaOrig; GV2.comDesfazer = cdOrig; GV2.recado = recOrig;
    checar('Registrar grava em um_a_um com prazo, conferência e origem por combinado e manda cada um ao sino',
      !!gravado && gravado.combinados.length === 3 && gravado.combinados.every(function (c) { return c.prazo && (c.conferencia === 'auto' || c.conferencia === 'manual') && 'origem' in c; }) && recados.length === 3,
      gravado ? JSON.stringify(gravado.combinados[0]) : 'nada gravado');
    GV2.base.cru.umAUm.shift(); GV2.pessoasMontar(GV2.base);
  }
  /* Rua › Rotas: a rota da pessoa dia a dia (itens_do_plano) e a feita pela visita com prova */
  tabelas.rotas_da_semana = [
    { owner_id: '1', dia: '2026-10-06', vaga: 1, hora: '10:00', client_id: 'c1', nome: 'Bar do Zé', proposito: 'visita', lat: -20.31, lng: -40.3 },
    { owner_id: '1', dia: '2026-10-06', vaga: 2, hora: '09:00', client_id: 'c2', nome: 'Cantina Sol', proposito: 'visita', acao: 'demo', lat: -20.32, lng: -40.31 },
    { owner_id: '1', dia: '2026-10-07', vaga: 1, hora: '09:00', client_id: 'c3', nome: 'Padaria', proposito: 'visita', lat: null, lng: null },
    { owner_id: '2', dia: '2026-10-06', vaga: 1, hora: '09:00', client_id: 'c9', nome: 'Da Bia', proposito: 'visita', lat: -20.3, lng: -40.3 }
  ];
  tabelas.visitas_com_prova.push({ owner_id: '1', provada: true, client_id: 'c2', dia: '2026-10-06' });
  GV2.estado.aba = 'rua'; GV2.estado.rua = 'dia'; GV2.estado.ruaSel = '1'; GV2.estado.rotaDia = null;
  const pintarOrig = GV2.pintar; GV2.pintar = function () {};
  await GV2.rotaLer(GV2.rotaSegunda(), true);
  GV2.pintar = pintarOrig;
  const rr = GV2.render.rua();
  const ordem = rr.indexOf('Cantina Sol') >= 0 && rr.indexOf('Cantina Sol') < rr.indexOf('Bar do Zé');
  checar('Rua › Pessoa · dia: hoje, na ordem do dia, a feita marcada, sem o plano dos outros', ordem && /is-feita/.test(rr) && !/Da Bia/.test(rr) && !/Padaria/.test(rr) && /data-gv2-v5mapa="1\|2026-10-06"/.test(rr));
  checar('Rua › Pessoa · dia: a ação do pino (0175) aparece com o mesmo rótulo do app', /<b class="gv2-ellip">Bar do Zé<\/b><small[^>]*>Demo|Bar do Zé/.test(rr) && /Demo/.test(rr));
  /* 06/10/26: combinado "decisão em negócio" lia GV2.base na PRIMEIRA carga (null) e
     derrubava o painel inteiro do gestor. A montagem tem de usar a base que monta. */
  {
    const salva = GV2.base; const p0 = salva.pessoas[0];
    salva.cru = salva.cru || { umAUm: [], idas: [], visitas4: null };
    const umEra = salva.cru.umAUm;
    salva.cru.umAUm = umEra.concat([{ owner_id: p0.id, data: salva.agora.iso, created_at: '2099-01-01T00:00:00Z', canal: 'video',
      combinados: [{ texto: 'decidir o negócio', regra: 'decisao_em_negocio', alvo: { negocio_id: 'a' } }] }]);
    let quebrou = null;
    GV2.base = null;
    try { GV2.pessoasMontar(salva); } catch (e) { quebrou = e.message; }
    GV2.base = salva; salva.cru.umAUm = umEra; GV2.pessoasMontar(salva);
    checar('primeira carga com combinado de decisão em negócio não derruba o painel', !quebrou);
  }
  GV2.estado.rotaDia = '2026-10-07';
  const rs = GV2.render.rua();
  checar('Rua › Pessoa · dia: a parada sem endereço vai para "Sem lugar no mapa" e fica fora da linha', /Padaria/.test(rs) && /Sem lugar no mapa/.test(rs) && /negócio sem endereço/.test(rs) && /1 sem lugar fica fora/.test(rs));
  /* D3 (08/10/26): a ordem do DIA — feitas pela hora do check-in, depois o que falta pela hora do
     plano, depois sem hora, por último sem lugar. Antes: 18:00 primeiro e as feitas no meio. */
  {
    const segD3 = '2099-01-05';
    GV2.rota.cache[segD3] = { estado: 'ok', itens: [
      { owner_id: '1', dia: '2099-01-05', vaga: 1, hora: '18:00', client_id: 'x1', nome: 'Noite', lat: -20, lng: -40 },
      { owner_id: '1', dia: '2099-01-05', vaga: 2, hora: null, client_id: 'x2', nome: 'SemHoraFeita', lat: -20, lng: -40 },
      { owner_id: '1', dia: '2099-01-05', vaga: 3, hora: null, client_id: 'x3', nome: 'SemHora', lat: -20, lng: -40 },
      { owner_id: '1', dia: '2099-01-05', vaga: 4, hora: '09:00', client_id: 'x4', nome: 'SemLugar', lat: null, lng: null },
      { owner_id: '1', dia: '2099-01-05', vaga: 5, hora: '19:00', client_id: 'x5', nome: 'PlanoTardeFeitaCedo', lat: -20, lng: -40 },
      { owner_id: '1', dia: '2099-01-05', vaga: 6, hora: '14:00', client_id: 'x6', nome: 'Tarde', lat: -20, lng: -40 }
    ], visitas: [
      { owner_id: '1', provada: true, client_id: 'x2', dia: '2099-01-05', visited_at: '2099-01-05T14:30:00Z' },
      { owner_id: '1', provada: true, client_id: 'x5', dia: '2099-01-05', visited_at: '2099-01-05T13:58:00Z' }
    ] };
    const d3 = GV2.rotaParadas(GV2.base.porId['1'], segD3, '2099-01-05').map(x => x.nome).join();
    checar('D3: rota na ordem do dia (feitas pelo check-in → falta pela hora → sem hora → sem lugar)',
      d3 === 'PlanoTardeFeitaCedo,SemHoraFeita,Tarde,Noite,SemHora,SemLugar', d3);
    delete GV2.rota.cache[segD3];
  }
  /* D5 (08/10/26): a célula da Grade abre o dia da pessoa em Rua › Rotas */
  {
    /* 02/11/26: a Grade v4 (render.ruaSemana) saiu como código morto; o comando ruadia segue */
    GV2.estado.rua = 'semana';
    const iso0 = GV2.base.semana[0].iso;
    const pintarD5 = GV2.pintar; GV2.pintar = function () {};
    GV2.rotaComando('ruadia', ['ruadia', '2', iso0]);
    GV2.pintar = pintarD5;
    checar('D5: o clique leva a Rua › Rotas com a pessoa e o dia', GV2.estado.rua === 'dia' && GV2.estado.ruaSel === '2' && GV2.estado.rotaDia === iso0 && GV2.estado.rotaSem === 0);
    GV2.estado.ruaSel = '1'; GV2.estado.rotaDia = null;
  }
  /* RUA v5 (08/10/26, go.zip): uma conta só para o dia de uma pessoa (GV2.v5Dia) */
  {
    const segV = '2099-02-02', diaV = '2099-02-03';
    GV2.rota.cache[segV] = { estado: 'ok', itens: [
      { owner_id: '1', dia: diaV, vaga: 1, hora: '14:00', client_id: 'a1', item_id: 'c-a', nome: 'Feita1', proposito: 'funil', lat: -20, lng: -40 },
      { owner_id: '1', dia: diaV, vaga: 2, hora: null, client_id: 'a2', nome: 'Feita2', proposito: 'funil', lat: -20, lng: -40 },
      { owner_id: '1', dia: diaV, vaga: 3, hora: null, client_id: 'a2', nome: 'Feita2 repetida', proposito: 'funil', lat: -20, lng: -40 },
      { owner_id: '1', dia: diaV, vaga: 4, hora: '15:00', client_id: 'a3', nome: 'Declarada', proposito: 'funil', lat: -20, lng: -40 },
      { owner_id: '1', dia: diaV, vaga: 5, hora: '18:00', client_id: 'a4', nome: 'Falta', proposito: 'nova', lat: -20, lng: -40 },
      { owner_id: '1', dia: diaV, vaga: 6, hora: '09:00', client_id: null, nome: 'SemLugar', proposito: 'follow', lat: null, lng: null }
    ], visitas: [
      { owner_id: '1', provada: true, client_id: 'a1', dia: diaV, visited_at: diaV + 'T17:00:00Z', motivo: 'gps', distancia_m: 22 },
      { owner_id: '1', provada: true, client_id: 'a2', dia: diaV, visited_at: diaV + 'T17:05:00Z', motivo: 'foto', distancia_m: 900 },
      { owner_id: '1', provada: false, declarada: true, client_id: 'a3', dia: diaV, visited_at: diaV + 'T17:08:00Z', motivo: 'declarada sem GPS, sem foto' },
      { owner_id: '1', provada: true, client_id: 'z9', dia: diaV, visited_at: diaV + 'T17:10:00Z', motivo: 'gps', distancia_m: 30 },
      { owner_id: '1', provada: true, client_id: 'z8', dia: diaV, visited_at: diaV + 'T17:15:00Z', motivo: 'gps', distancia_m: 30 }
    ] };
    const dv = GV2.v5Dia(GV2.base.porId['1'], diaV);
    checar('v5 · x de y: só visita com prova NO plano conta; o mesmo restaurante conta uma vez; a declarada não conta (C6)',
      dv.x === 2 && dv.y === 5 && GV2.v5Xdy(dv) === '2 de 5', dv.x + ' de ' + dv.y);
    checar('v5 · a visita com prova fora do plano vai para "Fora do plano"', dv.fora.length === 2, String(dv.fora.length));
    checar('v5 · ordem do dia: aconteceu pelo check-in → falta pela hora → sem lugar por último',
      dv.itens.map(function (x) { return x.nome; }).join() === 'Feita1,Feita2,Declarada,Falta,SemLugar', dv.itens.map(function (x) { return x.nome; }).join());
    checar('v5 · prova na linha: GPS com a distância, ou foto', dv.itens[0].prova === 'GPS 22 m' && dv.itens[1].prova === 'foto' && /^sem prova/.test(dv.itens[2].prova));
    checar('v5 · jornada: 1º ao último check-in com prova (dentro e fora do plano); 4 portas em 15 min = check-ins colados (C9)',
      dv.jornada && dv.jornada.n === 4 && dv.jornada.min === 15 && dv.jornada.porta === 5 && dv.jornada.colados === true, JSON.stringify(dv.jornada));
    /* 2 portas coladas não acusam nada */
    GV2.rota.cache[segV].visitas = GV2.rota.cache[segV].visitas.slice(0, 2);
    const dv2 = GV2.v5Dia(GV2.base.porId['1'], diaV);
    checar('v5 · C9: 2 check-ins colados não viram aviso', dv2.jornada && dv2.jornada.porta === 5 && dv2.jornada.colados === false);
    /* sem parada + com agenda = "sem rota", nunca "sem plano" */
    GV2.rota.cache[segV].itens = [];
    const agOrig = GV2.compromissosDoDia;
    GV2.compromissosDoDia = function () { return { n: 1, lig: 1, reun: 0, tar: 0, itens: [{ hora: '12:45', titulo: 'Ligar', tipo: 'ligação', cliente: '' }] }; };
    GV2.estado.aba = 'rua'; GV2.estado.rua = 'dia'; GV2.estado.ruaSel = '1'; GV2.estado.rotaDia = diaV;
    const hv = GV2.render.rua();
    GV2.compromissosDoDia = agOrig;
    checar('v5 · sem parada e com agenda: "Sem rota … com agenda", nunca "sem plano"', /Sem rota neste dia, com agenda/.test(hv) && !/Sem plano neste dia/.test(hv));
    delete GV2.rota.cache[segV];
    GV2.estado.rotaDia = null;
  }
  {
    GV2.estado.rua = 'semana';
    const gv = GV2.render.rua();
    checar('v5 · Semana: toda célula abre o dia (v5dia) e o total é "feito + plano" contra a meta da semana',
      (gv.match(/class="gv2-v5-gr-cel [^"]*" data-gv2="v5dia:/g) || []).length === GV2.base.pessoas.length * GV2.base.semana.length && /Feito \+ plano/.test(gv));
    const pintarV = GV2.pintar; GV2.pintar = function () {};
    GV2.v5RuaComando('v5dia', ['v5dia', '2', GV2.base.semana[0].iso]);
    GV2.pintar = pintarV;
    checar('v5 · o clique leva a Rua › Pessoa · dia com a pessoa e o dia', GV2.estado.aba === 'rua' && GV2.estado.rua === 'dia' && GV2.estado.ruaSel === '2' && GV2.estado.rotaDia === GV2.base.semana[0].iso);
    GV2.estado.rua = 'hoje';
    const hh = GV2.render.rua();
    checar('v5 · Rua › Hoje: uma faixa por pessoa e o mapa ao vivo; o "Agora no mapa" e a "Tomada de contas" saíram da Rua',
      (hh.match(/class="gv2-v5-tl-l is-linha"/g) || []).length === GV2.base.pessoas.length && /data-gv2-mapa="rua"/.test(hh) && !/Agora no mapa/.test(hh) && !/Tomada de contas/.test(hh));
    GV2.estado.ruaSel = '1'; GV2.estado.rotaDia = null;
  }
  /* HOJE v5 (08/10/26): a situação de cada um e as linhas de "Quem precisa de você" */
  {
    const b5 = GV2.base, minOrig = b5.agora.min, fdjOrig = b5.foraDaJornada, diaOrig = GV2.v5Dia;
    const p0 = b5.pessoas[0];
    const comItens = function (horas) { return function () { return { estado: 'ok', itens: horas.map(function (h) { return { horaMin: h, lat: -20 }; }), jornada: null, agenda: { n: 0, itens: [] } }; }; };
    const fake = function (o) { return Object.assign({}, p0, { hoje: Object.assign({}, p0.hoje, o.hoje), janela: o.janela, ontem: o.ontem || p0.ontem }); };
    b5.foraDaJornada = false;
    GV2.v5Dia = comItens([600]);
    b5.agora.min = 680;
    const sNao = GV2.v5Situacao(fake({ hoje: { paradas_plano: 5, visitas_com_prova: 0, visitas_todas: 0 }, janela: { min: 840, dias: 9 } }));
    b5.agora.min = 960;
    const sTrav = GV2.v5Situacao(fake({ hoje: { paradas_plano: 5, visitas_com_prova: 0, visitas_todas: 0 }, janela: { min: 840, dias: 9 } }));
    b5.agora.min = 700;
    const sTravCedo = GV2.v5Situacao(fake({ hoje: { paradas_plano: 5, visitas_com_prova: 0, visitas_todas: 0 }, janela: { min: null, dias: 2 } }));
    GV2.v5Dia = comItens([]);
    b5.agora.min = 965;
    const sPadrao = GV2.v5Situacao(fake({ hoje: { paradas_plano: 1, visitas_com_prova: 0, visitas_todas: 0 }, janela: { min: null, dias: 2 } }));
    const sRota = GV2.v5Situacao(fake({ hoje: { paradas_plano: 0, visitas_com_prova: 0, visitas_todas: 0 }, janela: null }));
    const sAnda = GV2.v5Situacao(fake({ hoje: { paradas_plano: 5, visitas_com_prova: 0, visitas_todas: 1 }, janela: null }));
    GV2.v5Dia = diaOrig; b5.agora.min = minOrig; b5.foraDaJornada = fdjOrig;
    checar('v5 · C4: com a 1ª parada às 10:00 e a janela às 14:00, às 11:20 "Ainda não saiu" e às 16:00 "Travou"', sNao.k === 'naosaiu' && sTrav.k === 'travou', sNao.k + '/' + sTrav.k);
    checar('v5 · C7: sem janela habitual (menos de 5 dias) vale a 1ª parada: 10:00 + 1 h → às 11:40 já travou', sTravCedo.k === 'travou', sTravCedo.k);
    checar('v5 · sem hora no plano nem janela: a referência é 15:00 + 1 h (às 16:05 travou)', sPadrao.k === 'travou', sPadrao.k);
    checar('v5 · sem parada = "semrota"; visita com prova (mesmo fora do plano) = "andando"', sRota.k === 'semrota' && sAnda.k === 'andando');
    /* força uma pessoa em cada situação, para a ordem e o "só informa" terem o que medir */
    const sitOrig = GV2.v5Situacao, ks = ['travou', 'semrota', 'naosaiu', 'andando'];
    GV2.v5Situacao = function (p) { return { k: ks[b5.pessoas.indexOf(p) % ks.length], prim: 600, jan: null }; };
    const G5 = GV2.v5Grupos();
    /* 09/10/26: de madrugada "Ainda não saiu" listava o time inteiro; antes das 06:00 a linha some */
    const minNoite = b5.agora.min; b5.agora.min = 11;
    const G5noite = GV2.v5Grupos();
    b5.agora.min = minNoite;
    GV2.v5Situacao = sitOrig;
    checar('v5 · às 00:11 "Ainda não saiu" não aparece (o dia de rua não começou); Travou e Sem rota continuam',
      !G5noite.grupos.some(function (g) { return g.k === 'naosaiu'; }) && G5noite.grupos.some(function (g) { return g.k === 'semrota'; }), G5noite.grupos.map(function (g) { return g.k; }).join());
    checar('v5 · o caso de teste tem Travou, Sem rota e Ainda não saiu', ['travou', 'semrota', 'naosaiu'].every(function (k) { return G5.grupos.some(function (g) { return g.k === k; }); }), G5.grupos.map(function (g) { return g.k; }).join());
    const ordem = { travou: 0, semrota: 1, furou: 2, dinheiro: 3, naosaiu: 4 };
    checar('v5 · as linhas vêm na ordem da gravidade e "Ainda não saiu" só informa (sem botão)',
      G5.grupos.every(function (g, i, a) { return i === 0 || ordem[g.k] > ordem[a[i - 1].k]; }) && G5.grupos.every(function (g) { return g.k !== 'naosaiu' || (g.info && !g.acao); }), G5.grupos.map(function (g) { return g.k; }).join());
    const fo = G5.grupos.find(function (g) { return g.k === 'furou'; });
    const furaram = b5.pessoas.filter(function (p) { return p.ontem.paradas_plano > 0 && p.ontem.visitas_com_prova * 2 < p.ontem.paradas_plano; }).length;
    checar('v5 · C5: "Furou ontem" = menos da metade do plano de ontem', (fo ? fo.chips.length : 0) === furaram, String(furaram));
    b5.planoErro = 'planejamento_do_time';
    const hf = GV2.render.time();
    const Gf = GV2.v5Grupos();
    b5.planoErro = null;
    checar('v5 · 1c: plano fora = "—" com o nome da fonte, nenhum 0 inventado, e Travou/Sem rota somem',
      /Não li o Planejamento agora/.test(hf) && /planejamento_do_time/.test(hf) && />— de [0-9]+</.test(hf) && !/>0 de [0-9]+</.test(hf.replace(/>0 de 0</g, "").replace(/<button type="button" class="gv2-v5-pp-c gv2-v8-ppmes[\s\S]*?<\/button>/g, "")) && !Gf.grupos.some(function (g) { return g.k === 'travou' || g.k === 'semrota' || g.k === 'naosaiu'; }));
    const ht = GV2.render.time();
    checar('v5 · Hoje: 5 cartões, cada um com destino; a coluna Jornada; o plano e a jornada abrem o dia na Rua, o nome abre a Pessoa',
      (ht.match(/class="gv2-v5-kpi[^"]*" data-gv2="[^"]+"/g) || []).length === 5 && /Jornada/.test(ht) && (ht.match(/class="gv2-v5-pp-c[^"]*" data-gv2="v5dia:/g) || []).length === b5.pessoas.length * 2 && (ht.match(/class="gv2-v5-pp-p" data-gv2="pessoa:/g) || []).length === b5.pessoas.length);
  }
  /* AUDITORIA v5 (08/10/26): velocidade. O Hoje levava 935 ms para desenhar (a conta do dia refeita
     dezenas de vezes por pintura) e o plano da semana só era pedido depois da primeira pintura. */
  {
    const segH = GV2.segundaDe(GV2.base.agora.iso);
    const cacheAntes = GV2.rota.cache[segH];
    delete GV2.rota.cache[segH];
    await GV2.montar();
    const veioJunto = !!(GV2.rota.cache[segH] && GV2.rota.cache[segH].estado === 'ok');
    if (!veioJunto) GV2.rota.cache[segH] = cacheAntes;
    checar('v5 · velocidade: o plano da semana chega JUNTO com a carga (está no cache logo depois do montar)', veioJunto);
    const contaOrig = GV2.v5DiaConta; let n = 0;
    GV2.v5DiaConta = function () { n++; return contaOrig.apply(this, arguments); };
    const cH = GV2.rota.cache[segH]; if (cH) cH._v5b = null;
    GV2.estado.aba = 'time'; GV2.render.time(); GV2.navHTML();
    const primeira = n; n = 0;
    GV2.render.time(); GV2.navHTML(); GV2.estado.aba = 'rua'; GV2.estado.rua = 'hoje'; GV2.render.rua();
    const segunda = n;
    if (cH) cH.visitas = cH.visitas.slice();
    n = 0; GV2.v5Dia(GV2.base.pessoas[0], GV2.base.agora.iso);
    const depoisDeMudar = n;
    GV2.v5DiaConta = contaOrig; GV2.estado.aba = 'time';
    checar('v5 · velocidade: cada (pessoa, dia) é contado uma vez por carga; repintar não reconta; visita nova reconta', primeira > 0 && primeira <= GV2.base.pessoas.length * 2 && segunda === 0 && depoisDeMudar === 1, primeira + '/' + segunda + '/' + depoisDeMudar);
  }
  /* 0185: os nomes dos clientes vêm da função gestor_nomes_dos_clientes, junto com a carga; se ela
     falhar, a busca antiga por lotes de ids entra como reserva e nenhum nome some */
  {
    global.__rpcLog = []; global.__fromLog = [];
    const b1 = await GV2.montar();
    const viaFuncao = global.__rpcLog.indexOf('gestor_nomes_dos_clientes') >= 0 && global.__fromLog.indexOf('clients') < 0 && b1.nomeCliente('c2') === 'Cantina Sol';
    global.__nomesFalha = true; global.__fromLog = [];
    const b2 = await GV2.montar();
    global.__nomesFalha = false;
    const reserva = global.__fromLog.indexOf('clients') >= 0 && b2.nomeCliente('c2') === 'Cantina Sol';
    checar('0185: os nomes vêm da função numa ida só (sem a segunda ida por lotes)', viaFuncao, global.__rpcLog.join());
    checar('0185: com a função fora, a busca antiga por lotes entra e o nome continua lá', reserva);
  }
  /* O cockpit do executivo é do design (pedido de 08/10/26): os números dele não se mexem por aqui */
  {
    const ht2 = GV2.render.time();
    /* v9 (13/10/26): o cartão do kit tem UMA linha de comparação; o "x de meta do time" foi para o "i" */
    /* 14/10/26 (Julyan: "eles estão na rua, preciso disso correto"): o número é TODA visita com
       prova do dia contra a META do time; o plano vai para a comparação */
    const tt = GV2.base.time;
    checar('gestor v10: "Visitas com prova" = todas as visitas do dia ÷ meta do time; o plano fica na comparação',
      /Visitas com prova<i class="gv2-v8-i" title="[^"]*TODOS os pontos de contato do dia[^"]*"[^>]*>i<\/i><\/small><div class="gv2-v9-num"><b class="num">[0-9]+ de [0-9]+<\/b><em>da meta<\/em><\/div><span class="gv2-v9-cmp"[^>]*>((?:[0-9]+ repetidas? · )?do plano [0-9]+ de [0-9]+|[a-zçãé]{3} [0-9]{2}\/[0-9]{2} [0-9]+ de [0-9]+ · a rua começa)/.test(ht2)
        && ht2.indexOf('<b class="num">' + (tt.visitasTodas || 0) + ' de ' + tt.meta + '</b>') > 0, (tt.visitasTodas || 0) + ' de ' + tt.meta);
    /* repetida = restaurante que a pessoa já visitou com prova nesta semana (inclusive mais cedo hoje) */
    {
      const pint = GV2.pintar, base0 = GV2.base; GV2.pintar = function () {};
      const b0 = await GV2.montar(); const id0 = b0.pessoas[0].id, hj = b0.agora.iso;
      const antes = b0.porId[id0].hoje.repetidas;
      const extra = [{ owner_id: id0, provada: true, client_id: 'cRep', dia: hj, visited_at: hj + 'T13:00:00Z' }, { owner_id: id0, provada: true, client_id: 'cRep', dia: hj, visited_at: hj + 'T15:00:00Z' }, { owner_id: id0, provada: false, client_id: 'cRep', dia: hj, visited_at: hj + 'T16:00:00Z' }];
      extra.forEach(function (x) { tabelas.visitas_com_prova.push(x); });
      const b1 = await GV2.montar();
      const depois = b1.porId[id0].hoje.repetidas;
      tabelas.visitas_com_prova.splice(tabelas.visitas_com_prova.length - extra.length, extra.length);
      GV2.pintar = pint;
      checar('repetidas: o segundo check-in com prova no mesmo restaurante conta 1 repetida (o sem prova não)',
        typeof antes === 'number' && depois === antes + 1 && GV2.repHoje(b1.porId[id0]).indexOf('repetida') > 0, JSON.stringify([antes, depois]));
      checar('repetidas: o time soma as repetidas de cada um', b1.time.repetidas === b1.pessoas.reduce(function (a, p) { return a + (p.hoje.repetidas || 0); }, 0));
      GV2.base = base0;
    }
    const pz = GV2.base.pessoas[0];
    checar('v10: o x de y da pessoa é o total de visitas ÷ meta do dia, não o plano',
      GV2.visHoje(pz) === (pz.hoje.visitas_todas || 0) + ' de ' + pz.meta_visitas_dia);
  }
  /* ACESSOS (19/10/26): a aba do Cockpit novo que substitui o painel antigo */
  {
    const A = GV2.acc, contas0 = A.contas;
    A.contas = [
      { id: 'm1', nome: 'Master Um', email: 'm@x', role: 'gestor', setor: 'Outbound', hubspot: '', desativado: false, alerta: '', carteira: 0 },
      { id: 'e1', nome: 'Exec Um', email: 'e@x', role: 'user', setor: 'Outbound', hubspot: '11', desativado: false, alerta: '', carteira: 7 },
      { id: 'e2', nome: 'Exec Dois', email: 'd@x', role: 'user', setor: 'Outbound', hubspot: '22', desativado: false, alerta: '', carteira: 3 }
    ];
    A.form.tipo = 'executivo';
    const hExec = GV2.render.acessos();
    A.form.tipo = 'master';
    const hMaster = GV2.render.acessos();
    checar('acessos: executivo pede ID do HubSpot; os dois escolhem o setor', hExec.indexOf('data-gv2-acc="hubspot"') > 0 && hExec.indexOf('data-gv2-acc="setor"') > 0
      && hMaster.indexOf('data-gv2-acc="hubspot"') < 0 && hMaster.indexOf('data-gv2-acc="setor"') > 0 && hMaster.indexOf('Criar master') > 0);
    checar('acessos: a lista conta masters e executivos', hExec.indexOf('1 masters · 2 executivos') > 0);
    A.aberto = 'e1';
    const hGav = GV2.render.acessos();
    checar('acessos: tirar acesso de quem tem carteira pede o destino, e o destino não é a própria pessoa',
      hGav.indexOf('Quem fica com os 7 leads?') > 0 && hGav.indexOf('<option value="22"') > 0 && hGav.indexOf('<option value="11"') < 0);
    checar('acessos: executivo pode virar master', hGav.indexOf('acc:papel:e1:gestor') > 0);
    checar('acessos: a gaveta troca o setor de quem já existe', hGav.indexOf('data-gv2-acc="novoSetor"') > 0 && hGav.indexOf('acc:setor:e1') > 0);
    checar('acessos: a gaveta muda a senha de quem já existe', hGav.indexOf('data-gv2-acc="novaSenha"') > 0 && hGav.indexOf('acc:senha:e1') > 0);
    A.aberto = null; A.contas = contas0; A.form.tipo = 'executivo';
  }
  /* FUNIL e TERRITÓRIO v5 (08/10/26) */
  {
    const nav = GV2.navHTML();
    const rots = (nav.match(/<span class="gv2-nav-rot">[^<]+</g) || []).map(function (x) { return x.replace('<span class="gv2-nav-rot">', '').replace('<', ''); });
    /* 31/10/26: a Rampa entra logo abaixo de Pessoas (handoff "Acelerar Field Sales v2", 1a); o resto do menu não muda */
    /* a Rampa saiu do menu (Julyan, 01/11/26) */
    checar('v5 · menu: Hoje · Rua · Funil · Território · Pessoas · Propostas · Playbook (sem Raio X, Prospecção nem Rampa); atalhos TakeatOS e HubSpot em outra aba', rots.slice(0, 7).join(' · ') === 'Hoje · Rua · Funil · Território · Pessoas · Propostas · Playbook' && rots.slice(7).join(' · ') === 'Prova dos números · Acessos · Ver como executivo · TakeatOS · HubSpot' && nav.indexOf('>Do diretor<') > 0 && nav.indexOf('href="https://takeatos.vercel.app" target="_blank"') > 0, rots.join(' · '));
    checar('rolagem: corpo v5 e gaveta não deixam o cartão encolher (Por pessoa e "Para puxar" sumiam, 09/10/26)',
      tpl.indexOf('.gv2-corpo.gv2-v5 > *{flex-shrink:0;}') > 0 && tpl.indexOf('.gv2-rxg-corpo > *{flex-shrink:0;}') > 0);
    checar('mapa em tela cheia: todo mapa v5 ganha o botão e o mapa da Pessoa · dia reenquadra quando a caixa muda (09/10/26)',
      typeof GV2.v5MapaAplicar === 'function' && tpl.indexOf('.gv2-v5-mapa-cx.is-cheio{position:fixed;') > 0
        && tpl.indexOf("const enq = g.enq = function () { if (!el.clientWidth) return; if (pts.length === 1)") > 0
        && tpl.indexOf('.gv2-rxg-corpo .gv2-rt-corpo{flex:none;height:max(') > 0 && tpl.indexOf('#gv2Raiz .gv2-rt-mapa') > 0 && tpl.indexOf('const enq = g.enq = function () { if (!el.clientWidth || !document.body.contains(el))') > 0);
    {
      const fsx = require('fs'), px = require('path');
      const api = fsx.readFileSync(px.join(__dirname, '..', 'lib', 'atualizar-hubspot.js'), 'utf8');
      const wf = fsx.readFileSync(px.join(__dirname, '..', '.github', 'workflows', 'daily-refresh.yml'), 'utf8');
      /* 14/10/26: a regra de gestor é eh_gestor_cockpit (gestor do app OU manager do cockpit); is_field_admin sozinho barrava o gestor que só existe no cockpit */
      checar('Atualizar HubSpot: botão na Hoje, rota só para gestor (eh_gestor_cockpit), origem cockpit, e o robô não gera IA em disparo com origem (09/10/26)',
        GV2.render.time().indexOf('data-gv2="hsatu"') > 0 && api.indexOf('/rest/v1/rpc/eh_gestor_cockpit') > 0 && api.indexOf('/rest/v1/rpc/is_field_admin') < 0 && api.indexOf("inputs: { origem: 'cockpit' }") > 0
          && api.indexOf('PLACEHOLDER') < 0 && wf.indexOf('if [ -n "${{ github.event.inputs.origem }}" ]; then') > 0
          && fsx.readFileSync(px.join(__dirname, '..', 'api', 'hubspot-webhook.js'), 'utf8').indexOf("req.query.acao === 'atualizar'") > 0 && fsx.readdirSync(px.join(__dirname, '..', 'api')).filter(function (f) { return /\.js$/.test(f); }).length <= 12);
    }
    checar('executivo · Meu funil: o R$ dos sem próximo passo usa a lista do movimento (não x.semPasso) e Ag. Pagamento vazio não manda puxar munição (09/10/26)',
      /* 02/11/26: a lista do movimento virou fn2SemPasso, e o R$ lê movimentos[0].itens */
      tpl.indexOf('const mrrSemPasso = ((movimentos[0] && movimentos[0].itens) || [])') > 0 && tpl.indexOf('const semPasso = fn2SemPasso(itens);') > 0
        && tpl.indexOf("col.pagto ? 'Os negócios que aceitarem a proposta em Negociação chegam aqui.'") > 0);
    GV2.estado.menu = true;
    const navMenu = GV2.navHTML();
    GV2.estado.menu = false;
    checar('menu do nome tem "Sair da conta" e o clique chega ao sair do perfil (09/10/26: não havia como sair)',
      navMenu.indexOf('data-gv2="menu:sair">Sair da conta<') > 0 && tpl.indexOf("if (o === 'sair') { const bt = document.getElementById('perfilSairBtn');") > 0);
    GV2.estado.aba = 'raiox'; GV2.estado.prf = 'todas';
    const fu = GV2.render.raiox();
    checar('v5 · Funil: 4 cartões do funil, sem o "Funil · Praça" e com "Negócios para puxar" (travado separado de sem passo)', (fu.match(/class="gv2-v5-kpi( is-fixo)?"/g) || []).length === 4 && fu.indexOf('data-gv2="rxm:') < 0 && /Negócios para puxar/.test(fu) && /passou do prazo da etapa/.test(fu) && /<h1>Funil<\/h1>/.test(fu));
    const fpp = GV2.render.funilPorPessoa();
    const algumMenor = GV2.base.pessoas.some(function (p) { return p.funil_mes.portas > 0 && p.funil_mes.portas < 3 && p.funil_mes.decisor > 0; });
    checar('v5 · Funil por pessoa: a taxa só aparece com 3 ou mais no passo anterior (senão "—", nunca 400%)', !/>[0-9]{3,}%</.test(fpp) && /a taxa só aparece com 3 ou mais/.test(fpp) && (!algumMenor || /<small>—<\/small>/.test(fpp)));
    /* 02/11/26: o Abastecer do Território v5/v9 (v5Abastecer, v5Estoque) saiu como código morto — o
       Território v10 (t10) não o usa */
    /* a leitura da praça repinta o Território quando termina (só repintava o Raio X › Praça) */
    {
      const pg = GV2.pxGlobal, cm = GV2.camada, pt = GV2.pintar, cacheVv = GV2.px.cache.vv;
      let pintou = 0;
      GV2.pxGlobal = async function () { return { vis: { data: [] }, notas: { data: [] } }; };
      GV2.camada = async function () { return { data: [] }; };
      GV2.pintar = function () { pintou++; };
      GV2.estado.aba = 'terr'; delete GV2.px.cache.vv;
      await GV2.pxLer('vv');
      GV2.pxGlobal = pg; GV2.camada = cm; GV2.pintar = pt; GV2.px.cache.vv = cacheVv;
      checar('v5 · Território: a leitura da praça termina e repinta a aba (senão fica no esqueleto)', pintou >= 2, String(pintou));
    }
    checar('v5 · Território: sem jargão', !/torneira|munição|backlog/i.test(GV2.render.terr()));
  }
  /* D1 e D2 (08/10/26): só dá para medir no Google de verdade; aqui, que as travas estão no lugar */
  {
    const mg = codigo.slice(codigo.indexOf('GV2.mapa = {'), codigo.indexOf('GV2.mapa = {') + 9000);
    checar('D1: o mapa do time nasce sobre as pessoas, não no centro fixo', mg.indexOf("center: { lat: -20.3, lng: -40.3 }") < 0 && /center: \{ lat: c0\.lat, lng: c0\.lng \}/.test(mg));
    checar('D1: "enquadrado" só marca depois de enquadrar de fato (dentro do enq)', /const enq = g\.enq = function \(\) \{[^}]*clientWidth[\s\S]{0,200}g\.enquadrado = chaveEnq;/.test(mg) && !/g\.enquadrado = chaveEnq;\s*const alvo/.test(mg));
    const px = codigo.slice(codigo.indexOf('GV2.pxMapa = {'));
    checar('D2: o calor da Praça some até o Google assentar e o mapa remede quando a caixa muda', /vigiar: function \(el, g\)/.test(px) && /GV2\.pxMapa\.vigiar\(el, g\);/.test(px) && /GV2\.pxMapa\.vigiar\(el, guardado\);/.test(px) && /cv0\.style\.opacity = '0'/.test(px));
  }
  GV2.estado.rotaDia = null; GV2.estado.aba = 'pessoas';
  let mg = '';
  try { GV2.estado.destaque = '1'; mg = GV2.render.mapaGrande(); } catch (e) { falhas.push('mapa grande: ' + e.message); }
  checar('mapa grande: o time inteiro na lista e o mapa "grande"', (mg.match(/data-gv2="mg:pessoa:/g) || []).length === 3 && /data-gv2-mapa="grande"/.test(mg) && /Ana Lima/.test(mg));
  GV2.estado.destaque = null;

  /* v7 (13/10/26): Rua › Semana passada — o placar fechado contra a meta do funil, o que ficou quente e se está no plano desta semana */
  {
    const segAnt = GV2.somaDias(GV2.segundaDe(GV2.base.agora.iso), -7);
    const segHoje = GV2.segundaDe(GV2.base.agora.iso);
    const rotaEra = GV2.rota.cache[segHoje];
    GV2.rota.cache[segAnt] = { estado: 'ok', itens: [{ owner_id: '1', dia: segAnt, vaga: 1, client_id: 'k1', item_id: 'c-k1', nome: 'K1', lat: -20, lng: -40 }], visitas: [{ owner_id: '1', provada: true, client_id: 'k1', dia: segAnt, visited_at: segAnt + 'T13:00:00Z' }] };
    GV2.rota.cache[segHoje] = { estado: 'ok', itens: [{ owner_id: '2', dia: GV2.somaDias(segHoje, 2), vaga: 1, client_id: 'kb', item_id: 'c-b', nome: 'Nb', lat: -20, lng: -40 }], visitas: [] };
    GV2.v6Rk.cache[segAnt] = { em: Date.now(), d: { segunda: segAnt, sexta: GV2.somaDias(segAnt, 4), premio: 250, fechada: true, gravado: { nome: 'Ana Lima', pontos: 400 }, linhas: [
      { ownerId: '1', nome: 'Ana Lima', pontos: 400, visitas: 31, reunioes: 3, vendas: 2, vendasLista: [{ id: 'v1', mrr: 400 }, { id: 'v2', mrr: 350 }], reunioesLista: [{ id: 'a', cliente: 'Na', dia: GV2.somaDias(segAnt, 2) }, { id: 'v1', cliente: 'V1', dia: segAnt }, { id: 'z', cliente: 'Z', dia: segAnt }] },
      { ownerId: '2', nome: 'Bia Souza', pontos: 30, visitas: 10, reunioes: 0, vendas: 0, vendasLista: [], reunioesLista: [] }] } };
    const lidas = [];
    const lerEra = GV2.v6RkLer; GV2.v6RkLer = function (sg) { lidas.push(sg); };
    GV2.estado.rua = 'passada';
    let v7 = '';
    try { v7 = GV2.render.rua(); } catch (e) { falhas.push('v7 Semana passada: ' + e.message); }
    GV2.v6RkLer = lerEra;
    checar('v7: a Rua tem a aba Semana passada e ela lê o placar da semana anterior', /Semana passada/.test(v7) && lidas[0] === segAnt, lidas.join());
    checar('v7: a meta da semana é a do funil (30 visitas, 5 demos, 2 vendas) e o semáforo separa no ritmo de fora', /31<small> \/ 30/.test(v7) && /fora do ritmo/.test(v7) && /atenção/.test(v7));
    checar('v7: o MRR da semana soma as vendas', /R\$ 750/.test(v7));
    checar('v7: das demos, uma virou venda, uma segue aberta e uma saiu do funil', /3 demos na semana passada \(1 virou venda, 1 aberta, 1 saiu do funil\)/.test(v7));
    checar('v7: o quente sem próximo passo e fora do plano aparece em vermelho', /Na<\/b>[\s\S]{0,200}sem próximo passo[\s\S]{0,80}fora do plano/.test(v7));
    checar('v7: o quente que já está no Planejamento desta semana diz o dia', /no plano · qua /.test(v7));
    checar('v8: a Semana passada marca o melhor (mais pontos) e o mais atrasado, com os pontos embaixo do nome', /gv2-v7-l is-melhor[^]{0,400}melhor da semana · 400 pts/.test(v7) && /gv2-v7-l is-pior[^]{0,400}mais atrasado · /.test(v7) && /Para planejar esta semana/.test(v7));
    checar('v7: Ag. Pagamento só como contagem do financeiro, nunca na lista de quentes', /1 em Ag\. Pagamento \(financeiro\)/.test(v7) && !/>Nc</.test(v7));
    checar('v7: o plano feito da semana passada vem da Grade (1 de 1)', /1<small> de 1<\/small>/.test(v7));
    GV2.FERIADOS.push(segHoje);
    GV2.estado.rua = 'semana';
    let gf = '';
    try { gf = GV2.render.rua(); } catch (e) { falhas.push('grade com feriado: ' + e.message); }
    GV2.FERIADOS.pop();
    checar('feriado na Grade: a segunda vira "feriado", não "furou", e a meta da semana tira o dia', (gf.match(/<small>feriado/g) || []).length === 3 && (gf.match(/<small>furou/g) || []).length === 0 && /feriado não conta/.test(gf), gf.slice(gf.indexOf('gv2-v5-cab'), gf.indexOf('gv2-v5-cab') + 400));
    delete GV2.rota.cache[segAnt]; delete GV2.v6Rk.cache[segAnt];
    if (rotaEra) GV2.rota.cache[segHoje] = rotaEra; else delete GV2.rota.cache[segHoje];
    GV2.estado.rua = 'hoje';
  }
  /* 13/10/26: o passo do Funil por pessoa abre quem está PARADO na etapa hoje, cada negócio numa etapa só */
  {
    const era = GV2.estado.rxGav;
    GV2.estado.rxGav = { t: 'passo', i: 3 };
    let g3 = {}, g1 = {};
    try { g3 = GV2.rxGavConteudo(); GV2.estado.rxGav = { t: 'passo', i: 1 }; g1 = GV2.rxGavConteudo(); } catch (e) { falhas.push('gaveta do passo: ' + e.message); }
    GV2.estado.rxGav = era;
    /* 15/10/26: o título diz os dois números (do mês e de hoje); a lista continua sendo a dos parados */
    checar('passo Negociação abre os parados em Negociação (Na e Nb), não o decisor', /^Negociação · \d+ no mês · 2 parados hoje$/.test(g3.tit || '') && />Na</.test(g3.corpo || '') && />Nb</.test(g3.corpo || '') && !/>Nd</.test((g3.corpo || '').split('gv2-rxg-mes')[0]), g3.tit);
    checar('passo Decisor abre só quem está em Conversa com decisor hoje (Nd)', /^Conversa com decisor · \d+ no mês · 1 parados? hoje$/.test(g1.tit || '') && />Nd</.test(g1.corpo || '') && !/>Na</.test((g1.corpo || '').split('gv2-rxg-mes')[0]), g1.tit);
    checar('a contagem do mês continua na gaveta, recolhida', /<details class="gv2-rxg-mes">/.test(g3.corpo || ''));
  }
  /* 13/10/26: as 8 correções da auditoria do gestor */
  {
    const p1 = GV2.base.porId['1'];
    const fm = Object.assign({}, p1.funil_mes), tr = p1.travados, qs = p1.quentes, ord = GV2.estado.daily;
    /* 5 · taxa acima de 100% vira — */
    p1.funil_mes = Object.assign({}, fm, { portas: 20, decisor: 4, demo: 5, proposta: 1, fechado: 0 });
    let fpp = ''; try { fpp = GV2.render.funilPorPessoa(); } catch (e) { falhas.push('funil por pessoa: ' + e.message); }
    checar('Funil por pessoa: demo maior que decisor não mostra 125%', fpp.indexOf('125%') < 0);
    /* 4 · coaching: visita que não vira demo pesa mais que reunião sem desfecho */
    p1.funil_mes = Object.assign({}, fm, { portas: 40, decisor: 10, demo: 0, proposta: 0, fechado: 0 });
    const c4 = GV2.v5Coaching(p1);
    checar('coaching: 40 visitas e 0 demo é o motivo nº 1 (visita → demo)', c4.g === 90 && /visita → demo/.test(c4.t), JSON.stringify(c4));
    p1.funil_mes = fm;
    /* 3 · Pra destravar: o dinheiro primeiro */
    p1.travados = [{ id: 'z1', nome: 'ProspeccaoParada', etapa_idx: 0, mrr: 0, dias: 30, travado: true }];
    p1.quentes = [{ id: 'z2', nome: 'NegociacaoSemPasso', etapa_idx: 4, mrr: 500, dias: 3, travado: false, agPag: false, proximo_passo: null }];
    GV2.estado.daily = GV2.base.ordem.indexOf(p1);
    let dl = ''; try { dl = GV2.render.daily(); } catch (e) { falhas.push('daily: ' + e.message); }
    checar('daily › Pra destravar: Negociação com MRR antes de Prospecção parada', dl.indexOf('NegociacaoSemPasso') > 0 && dl.indexOf('NegociacaoSemPasso') < dl.indexOf('ProspeccaoParada'));
    p1.travados = tr; p1.quentes = qs; GV2.estado.daily = ord;
    /* 1 · ficha da pessoa: o feriado aparece como feriado */
    GV2.FERIADOS.push(GV2.base.semana[0].iso);
    GV2.estado.aba = 'pessoas'; GV2.estado.pessoa = '1'; GV2.estado.pv2Pan = '1';
    let pf = ''; try { pf = GV2.render.pessoas(); } catch (e) { falhas.push('pessoas: ' + e.message); }
    GV2.FERIADOS.pop(); GV2.estado.pv2Pan = null;
    checar('Pessoas › ficha: o dia de feriado diz "feriado", não x de y', /<b class="num">feriado<\/b>/.test(pf));
  }
  /* v8 etapa 1 (13/10/26): clicar abre gaveta, não troca de aba; o ritmo com 6 visitas por dia para todos */
  {
    const pinta0 = GV2.pintar; GV2.pintar = function () {};
    const aba0 = GV2.estado.aba, gav0 = GV2.estado.rxGav, pes0 = GV2.estado.pessoa;
    GV2.estado.aba = 'time';
    GV2.v8Comando('pessoa', ['pessoa', '1']);
    checar('v8: o nome no Hoje abre a gaveta da Pessoa, sem trocar de aba', GV2.estado.rxGav && GV2.estado.rxGav.t === 'pessoa' && GV2.estado.aba === 'time', JSON.stringify(GV2.estado.rxGav));
    let gp = {}; try { gp = GV2.rxGavConteudo(); } catch (e) { falhas.push('gaveta da pessoa: ' + e.message); }
    checar('v8: a gaveta da Pessoa tem hoje, semana, mês, quentes, travados, o funil contra o esperado e a página completa', /Funil do mês contra o esperado/.test(gp.corpo || '') && (gp.corpo.match(/class="gv2-v8-tile[ "]/g) || []).length === 5 && /v8pagina:1/.test(gp.corpo) && /Ver o dia na Rua/.test(gp.corpo), gp.tit + ' :: ' + [/Funil do mês contra o esperado/.test(gp.corpo || ''), (gp.corpo.match(/gv2-v8-tile/g) || []).length, /v8pagina:1/.test(gp.corpo), /Ver o dia na Rua/.test(gp.corpo)].join());
    GV2.rxGavFechar();
    GV2.estado.aba = 'raiox'; GV2.v8Comando('rx', ['rx', 'pessoa', '2']);
    checar('v8: o nome no Funil por pessoa abre a gaveta (não pula para Pessoas)', GV2.estado.rxGav && GV2.estado.rxGav.t === 'pessoa' && GV2.estado.rxGav.id === '2' && GV2.estado.aba === 'raiox');
    GV2.rxGavFechar(); GV2.estado.aba = 'time';
    GV2.v8Comando('ir', ['ir', 'raiox', 'quentes']);
    const gq = GV2.rxGavConteudo();
    checar('v8: o KPI Quentes abre a gaveta de Negócios com o mesmo total do KPI', GV2.estado.aba === 'time' && GV2.estado.rxGav.t === 'neg' && new RegExp('Quentes · ' + GV2.base.time.quentes + '$').test(gq.tit), gq.tit);
    GV2.rxGavFechar();
    const ir0 = GV2.ir; GV2.ir = function (x) { GV2.estado.aba = x; }; GV2.v8Comando('v8pagina', ['v8pagina', '3']); GV2.ir = ir0;
    checar('v8: "Abrir a página completa" vai para a Pessoas na pessoa certa', GV2.estado.aba === 'pessoas' && GV2.estado.pessoa === '3');
    checar('v8: dentro da Pessoas, o nome continua escolhendo a pessoa da página', GV2.v8Comando('pessoa', ['pessoa', '1']) === false);
    const R = GV2.v8Ritmo(GV2.base.porId['3']), M = GV2.v8Mes();
    checar('v8: visitas esperadas = 6 por dia útil para todos; demos = meta ÷ 40%; clientes = meta', R.vis.meta === 6 * M.uteis && Math.abs(R.vis.esp - 6 * M.passados) < 1e-9 && R.dem.meta === R.cli.meta / 0.4, JSON.stringify({ meta: R.vis.meta, esp: R.vis.esp, uteis: M.uteis, passados: M.passados }));
    checar('v8: taxa acima de 100% vira — e só com 3 ou mais no passo anterior', GV2.v8Tx(4, 5) === '—' && GV2.v8Tx(2, 1) === '—' && GV2.v8Tx(10, 3) === '30%');
    GV2.estado.aba = aba0; GV2.estado.rxGav = gav0; GV2.estado.pessoa = pes0; GV2.pintar = pinta0;
  }
  /* v8 etapa 2 (13/10/26): o Funil lido de cima para baixo, e nenhum clique da grade antiga se perde */
  {
    let fu = ''; try { fu = GV2.render.raiox(); } catch (e) { falhas.push('funil v8: ' + e.message); }
    const pos = ['1 · O mês contra a meta', 'Funil do mês', '3 · Por pessoa', '4 · Negócios para puxar', 'gv2-v8-fl5'].map(function (x) { return fu.indexOf(x); });
    checar('v8 Funil: o mês contra a meta → funil e dinheiro → por pessoa → para puxar → perdas', pos.every(function (x, i) { return x > 0 && (i === 0 || x > pos[i - 1]); }), pos.join());
    checar('v8 Funil: cada pessoa tem o nome que abre a gaveta e os passos que abrem os parados dela', GV2.base.pessoas.every(function (pp) { return fu.indexOf('data-gv2="pessoa:' + pp.id + '"') > 0; }) && /data-gv2="rxg:passo:[0-9]:[0-9]+"/.test(fu));
    checar('v8 Funil: os 4 KPIs de antes continuam (porta → fechado, decisor → demo, ciclo, perdas)', /Porta → fechado/.test(fu) && /Decisor → Demo/.test(fu) && /Ciclo · mediana/.test(fu) && /Perdas do mês/.test(fu));
  }
  /* v8 etapa 3 (13/10/26): a Daily · fila pelo motivo, 6 blocos, o dinheiro primeiro, compromisso do último dia útil e o resumo */
  await (async function () {
    const pinta0 = GV2.pintar, rec0 = GV2.recado, supa0 = global.supa, toast0 = GV2.toast, ler0 = GV2.v6RkLer;
    GV2.pintar = function () {}; GV2.recado = async function () { return true; }; GV2.toast = function () {}; GV2.v6RkLer = function () {};
    const b = GV2.base, seg = GV2.segundaDe(b.agora.iso);
    const cache0 = GV2.v6Rk.cache[seg];
    GV2.v6Rk.cache[seg] = { em: Date.now(), d: { linhas: b.pessoas.map(function (x, i) { return { ownerId: x.id, pos: i + 1, pontos: 100 - i * 10 }; }) } };
    const fila = GV2.v8dFila(), rank = { plano: 0, furou: 1, travados: 2, ritmo: 3, rampa: 4 };
    checar('v8 Daily: a fila vai de sem plano → furou → travados → no ritmo', fila.every(function (x, i) { return i === 0 || rank[GV2.v8dMotivo(fila[i - 1]).k] <= rank[GV2.v8dMotivo(x).k]; }), fila.map(function (x) { return GV2.v8dMotivo(x).k; }).join());
    let erros = [], htmls = [];
    for (let i = 0; i < fila.length; i++) { GV2.estado.daily = i; try { htmls.push(GV2.render.daily()); } catch (e) { erros.push(i + ': ' + e.message); } }
    const blocos = ['1 · O mês', '2 · Onde o funil trava', '3 · Último dia útil', '4 · Pra destravar', '5 · Compromisso', '6 · A semana'];
    checar('v8 Daily: cada pessoa da fila abre com os 6 blocos, sem erro', !erros.length && htmls.every(function (h) { return blocos.every(function (x) { return h.indexOf(x) > 0; }); }), erros.join(' | ') || blocos.filter(function (x) { return htmls[0].indexOf(x) < 0; }).join());
    checar('v8 Daily: a faixa diz por que a pessoa abre a daily, e o nome abre a gaveta', htmls.every(function (h, i) { return h.indexOf(GV2.e(GV2.v8dMotivo(fila[i]).t)) > 0 && h.indexOf('data-gv2="pessoa:' + fila[i].id + '"') > 0; }));
    const comD = b.pessoas.find(function (x) { return GV2.v8dDestravar(x).length >= 2; });
    if (comD) { const d = GV2.v8dDestravar(comD); const ids = d.map(function (n) { return n.id; });
      checar('v8 Daily: pra destravar vem pelo dinheiro, sem repetir negócio e sem Ag. Pagamento', d.every(function (n, i) { return !n.agPag && (i === 0 || (d[i - 1].mrr || 0) >= (n.mrr || 0)); }) && new Set(ids).size === ids.length, d.map(function (n) { return n.mrr; }).join()); }
    else checar('v8 Daily: o mundo de teste tem alguém com 2+ negócios para destravar', false);
    /* o plano do dia aparece no bloco Hoje: mesma leitura da Rua (rotas_da_semana) */
    const segR = GV2.segundaDe(b.agora.iso), rc0 = GV2.rota.cache[segR], pp = fila[0];
    GV2.rota.cache[segR] = { estado: 'ok', itens: [{ owner_id: pp.id, dia: b.agora.iso, hora: '09:30', nome: 'Bar Teste Plano', proposito: 'Demo', client_id: 'c1', lat: -23.5, lng: -46.6 }, { owner_id: pp.id, dia: b.agora.iso, hora: '14:00', nome: 'Sem Endereco Teste', client_id: 'c2', lat: null, lng: null }], visitas: [{ provada: true, owner_id: pp.id, client_id: 'c1', dia: b.agora.iso, visited_at: b.agora.iso + 'T12:40:00Z' }] };
    GV2.estado.daily = 0; const hp = GV2.render.daily();
    checar('v8 Daily: o plano do dia aparece no bloco Hoje, com o feito e o sem lugar', /Bar Teste Plano/.test(hp) && /is-feita/.test(hp) && /Sem Endereco Teste/.test(hp) && /sem lugar no mapa/.test(hp));
    GV2.rota.cache[segR] = rc0;
    const p0 = fila[0];
    const linha = { id: 'dl1', owner_id: p0.id, data: b.ontemIso, created_at: b.ontemIso + 'T12:00:00Z', canal: 'video', resumo: 'Daily ' + GV2.ddmm(b.ontemIso), compromissos: ['montar o plano até 12h'], combinados: null };
    b.cru = b.cru || { umAUm: [], idas: [], visitas4: null }; b.cru.umAUm.unshift(linha);
    GV2.estado.daily = 0; const hc = GV2.render.daily();
    checar('v8 Daily: o compromisso do último dia útil aparece com cumpriu / em parte / não cumpriu', hc.indexOf('montar o plano até 12h') > 0 && hc.indexOf('daily:marca:' + p0.id + ':parcial') > 0);
    const so0 = b.cru.umAUm; b.cru.umAUm = [linha]; GV2.pessoasMontar(b); const u1 = p0.ultimo1a1; b.cru.umAUm = so0; GV2.pessoasMontar(b);
    checar('v8 Daily: a linha "Daily" do um_a_um não vira o último 1:1 da Pessoas', u1 === null);
    let upd = null;
    global.supa = { from: function () { return {
      update: function (v) { upd = v; return { eq: async function () { return { error: null }; } }; },
      insert: function (l) { return { select: async function () { return { data: [Object.assign({ id: 'novo', created_at: b.agora.iso + 'T12:00:00Z', combinados: null }, l)], error: null }; } }; } }; } };
    await GV2.v8dMarcar(p0.id, 'parcial');
    checar('v8 Daily: marcar "em parte" grava no próprio registro da daily', upd && upd.combinados && upd.combinados[0].resultado === 'parcial' && GV2.v8dCompromissoAnt(p0).resultado === 'parcial');
    GV2.estado.compromissos = {}; GV2.estado.compromissos[p0.id] = 'duas demos marcadas até sexta';
    await GV2.v8dEncerrar();
    const res = GV2.render.daily();
    checar('v8 Daily: encerrar grava o compromisso e mostra o resumo do time', GV2.estado.daily === 'fim' && /Resumo do time/.test(res) && res.indexOf('duas demos marcadas até sexta') > 0 && b.cru.umAUm[0].resumo === 'Daily ' + GV2.ddmm(b.agora.iso), b.cru.umAUm[0].resumo);
    checar('v8 Daily: o resumo copiado tem uma linha por pessoa', GV2.v8dTexto().split('\n').length === fila.length + 1);
    b.cru.umAUm = b.cru.umAUm.filter(function (x) { return x.id !== 'dl1' && x.id !== 'novo'; }); GV2.pessoasMontar(b);
    GV2.v6Rk.cache[seg] = cache0; GV2.estado.daily = null; GV2.estado.compromissos = {}; GV2.v8dFeitos = null;
    GV2.pintar = pinta0; GV2.recado = rec0; global.supa = supa0; GV2.toast = toast0; GV2.v6RkLer = ler0;
  })();
  /* v8 etapa 3 · Hoje (13/10/26): KPIs com "i" e comparação; a rua à esquerda; "só informa" numa faixa; Por pessoa com Mês */
  {
    const ab0 = GV2.estado.aba; GV2.estado.aba = 'time';
    let h = ''; try { h = GV2.render.time(); } catch (e) { falhas.push('hoje v8: ' + e.message); }
    const RT = GV2.v8Ritmo(null);
    const hKpis = h.slice(h.indexOf('<div class="gv2-v5-kpis">'), h.indexOf('gv2-v5-meio'));
    checar('v8 Hoje: os 5 KPIs têm o "i" com a definição', (hKpis.match(/class="gv2-v8-i"/g) || []).length === 5);
    checar('v8/v9 Hoje: o Mês diz o esperado e o provável, com selo e barra de ritmo', h.indexOf('esperado ' + GV2.v8Num(RT.cli.esp) + ' · provável ') > 0 && /Mês<em class="gv2-v9-selo is-(ok|av|mal)">/.test(hKpis) && /gv2-v9-trilha is-/.test(hKpis));
    checar('v8 Hoje: a rua vem antes de "Quem precisa de você"', h.indexOf('gv2-v5-ruaagora') > 0 && h.indexOf('gv2-v5-ruaagora') < h.indexOf('gv2-v5-quem'));
    const linhasPP = (h.match(/class="gv2-v5-pp-l( is-(melhor|pior))?"/g) || []).length;
    checar('v8 Hoje: Por pessoa tem a coluna Mês (abre o mês da pessoa), melhor e pior marcados, quentes e travados abrem a gaveta',
      (h.match(/data-gv2="v8neg:mes:/g) || []).length === GV2.base.pessoas.length && /gv2-v5-pp-l is-melhor/.test(h) && /gv2-v5-pp-l is-pior/.test(h)
      && (h.match(/data-gv2="v8neg:quentes:/g) || []).length === GV2.base.pessoas.length && (h.match(/data-gv2="v8neg:travados:/g) || []).length === GV2.base.pessoas.length && linhasPP === GV2.base.pessoas.length);
    /* a régua de melhor/pior: empate em 0 desempata pela distância ao esperado; quem está em Preparação não disputa */
    const mk = function (id, meta, fech, fase) { return { id: id, nome: id, meta_clientes_mes: meta, fase: fase || 'Pleno', funil_mes: { portas: 0, decisor: 0, demo: 0, proposta: 0, fechado: fech } }; };
    const rk = GV2.v8Ranking([mk('z4zero', 4, 0), mk('a8zero', 8, 0), mk('c4dois', 4, 2), mk('novato', 4, 0, 'Preparação')]);
    checar('v8: mais longe do ritmo é quem está mais longe do esperado (não o primeiro do alfabeto), e o novato não disputa', rk.melhor === 'c4dois' && rk.pior === 'a8zero', JSON.stringify(rk));
    GV2.estado.aba = ab0;
  }
  /* COBRAR = NO APP (13/10/26): nenhuma cobrança abre o WhatsApp; a mensagem vai para o app da pessoa */
  await (async function () {
    const wa0 = GV2.wa, rec0 = GV2.recado, tar0 = GV2.tarefaNoNegocio, pin0 = GV2.pintar, toa0 = GV2.toast;
    let wa = 0; const recs = [];
    GV2.wa = function () { wa++; }; GV2.recado = async function (pp, t) { recs.push([pp.id, t]); return true; };
    GV2.tarefaNoNegocio = async function () {}; GV2.pintar = function () {}; GV2.toast = function () {};
    const p0 = GV2.base.pessoas[0];
    await GV2.cobrarPessoa(p0.id);
    GV2.chamarPessoa(p0.id); await new Promise(function (r) { setTimeout(r, 0); });
    const n0 = GV2.base.negocios.find(function (n) { return !n.agPag && GV2.base.porId[n.dono]; });
    if (n0) await GV2.cobrarNegocio(n0.id);
    GV2.estado.loteDados = { tipo: 'semplano', grupos: GV2.base.pessoas.slice(0, 2).map(function (pp) { return { p: pp, ns: [], texto: 'texto de ' + pp.id }; }) };
    GV2.estado.lote = null;
    await GV2.enviarLote(1);
    const sobrou = GV2.estado.loteDados && GV2.estado.loteDados.grupos.length;
    checar('cobrar no app: Cobrar, Chamar, cobrar negócio e "Só para X" não abrem o WhatsApp e mandam a mensagem ao app',
      wa === 0 && recs.length === (n0 ? 4 : 3) && recs[0][1] === GV2.textoSemPlano(p0) && recs[recs.length - 1][1] === 'texto de ' + GV2.base.pessoas[1].id && sobrou === 1,
      JSON.stringify({ wa: wa, recs: recs.length, sobrou: sobrou }));
    GV2.estado.loteDados = null; GV2.estado.veu = null; GV2.estado.lote = null; GV2.estado.cobrados = {};
    GV2.wa = wa0; GV2.recado = rec0; GV2.tarefaNoNegocio = tar0; GV2.pintar = pin0; GV2.toast = toa0;
  })();
  /* MAPA COM A ABA OCULTA (13/10/26): nasce quebrado; então não nasce, e a tela redesenha quando a aba volta */
  {
    const doc0 = global.document, pin0 = GV2.pintar; let pintou = 0, ouvinte = null;
    global.document = { visibilityState: 'hidden', addEventListener: function (t, f) { if (t === 'visibilitychange') ouvinte = f; }, removeEventListener: function () { ouvinte = null; } };
    GV2.pintar = function () { pintou++; }; GV2.mapaEsperando = false;
    const esperou = GV2.mapaEsperarAba();
    global.document.visibilityState = 'visible'; if (ouvinte) ouvinte();
    const visivel = GV2.mapaEsperarAba();
    checar('mapa: com a aba oculta não nasce; quando a aba volta, a tela redesenha; com a aba visível nasce na hora', esperou === true && pintou === 1 && visivel === false, JSON.stringify({ esperou: esperou, pintou: pintou, visivel: visivel }));
    global.document = doc0; GV2.pintar = pin0; GV2.mapaEsperando = false;
  }
  /* RAMPAGEM (13/10/26): quem está em Preparação não é cobrado de rua nem entra nas visitas esperadas */
  {
    const b = GV2.base, alvo = b.pessoas.find(function (x) { return !x.hoje.paradas_plano; }) || b.pessoas[0];
    const fase0 = alvo.fase, par0 = alvo.hoje.paradas_plano;
    alvo.hoje.paradas_plano = 0;
    const visAntes = GV2.v8Ritmo(null).vis.meta;
    const srAntes = (GV2.v5Grupos().grupos.find(function (g) { return g.k === 'semrota'; }) || { chips: [] }).chips.length;
    alvo.fase = 'Preparação';
    const G = GV2.v5Grupos(), sr = G.grupos.find(function (g) { return g.k === 'semrota'; });
    const noSr = !!(sr && sr.chips.some(function (c) { return c.tip === alvo.nome; }));
    const visDepois = GV2.v8Ritmo(null).vis.meta;
    const mot = GV2.v8dMotivo(alvo).k, fila = GV2.v8dFila();
    checar('rampagem: não aparece em Sem rota, sai das visitas esperadas do time e vai para o fim da Daily',
      !noSr && G.sit[alvo.id].k === 'rampa' && visDepois < visAntes && mot === 'rampa' && fila[fila.length - 1].id === alvo.id,
      JSON.stringify({ srAntes: srAntes, noSr: noSr, visAntes: visAntes, visDepois: visDepois, mot: mot }));
    alvo.fase = fase0; alvo.hoje.paradas_plano = par0;
  }
  /* v8 etapa 4 (13/10/26): Rua e Pessoas */
  {
    const b = GV2.base, ab0 = GV2.estado.aba, rua0 = GV2.estado.rua, pes0 = GV2.estado.pessoa;
    GV2.estado.aba = 'rua'; GV2.estado.rua = 'hoje';
    let hr = ''; try { hr = GV2.render.rua(); } catch (e) { falhas.push('rua v8: ' + e.message); }
    checar('v8 Rua: "Planejamento do time" no cabeçalho e a régua x de y num "i"', /data-gv2="v5rua:semana"[^>]*>Planejamento do time</.test(hr) && /gv2-v8-regra/.test(hr) && !/<span class="gv2-v5-regra">/.test(hr));
    GV2.estado.rua = 'semana';
    let hs = ''; try { hs = GV2.render.rua(); } catch (e) { falhas.push('rua semana v8: ' + e.message); }
    checar('v8 Rua › Semana: o título é o Planejamento do time', /Planejamento do time · semana de/.test(hs));
    GV2.estado.pessoa = b.pessoas[0].id; GV2.estado.aba = 'pessoas';
    let hp = ''; try { hp = GV2.render.pessoas(); } catch (e) { falhas.push('pessoas v8: ' + e.message); }
    const p0 = b.porId[GV2.estado.pessoa];
    checar('v8 Pessoas: a página começa pelo resumo da gaveta (Mês, Quentes e Travados abrem os negócios dela) e o funil contra o esperado está à vista',
      hp.indexOf('data-gv2="v8neg:mes:' + p0.id + '"') > 0 && hp.indexOf('data-gv2="v8neg:quentes:' + p0.id + '"') > 0 && hp.indexOf('data-gv2="v8neg:travados:' + p0.id + '"') > 0 && /Funil do mês contra o esperado/.test(hp) && hp.indexOf('data-gv2="v5gav:disc:' + p0.id + '"') > 0);
    const semDesfecho = b.pessoas.map(function (x) { return GV2.v5Coaching(x).t; }).filter(function (t) { return /sem desfecho/.test(t); });
    checar('v8 Pessoas: a ordem do coaching não usa mais reunião sem desfecho', !semDesfecho.length && !/reuniões? sem desfecho nos últimos/.test(hp), semDesfecho.join(' | '));
    GV2.estado.aba = ab0; GV2.estado.rua = rua0; GV2.estado.pessoa = pes0;
  }
  /* v8 etapa 5 (13/10/26): o modo apresentação e as Propostas */
  {
    const ab0 = GV2.estado.aba; GV2.estado.aba = 'time';
    let h0 = ''; try { h0 = GV2.render.time(); } catch (e) { falhas.push('hoje ap: ' + e.message); }
    checar('v8 Apresentar: o botão está no cabeçalho do Hoje', /data-gv2="ap:abrir"/.test(h0));
    const telas = [], erros = [];
    for (let i = 0; i < 4; i++) { GV2.estado.ap = i; try { telas.push(GV2.render.v8Apresentar()); } catch (e) { erros.push(i + ': ' + e.message); } }
    GV2.estado.ap = null;
    checar('v8 Apresentar: as 4 telas abrem, sem botão de cobrança, sem MRR de pessoa e com navegação',
      !erros.length && telas.length === 4 && telas.every(function (t) { return !/data-gv2="(cobrar|ligar|v5lote|rxg:|ficha:)/.test(t) && !/não abriu/.test(t) && /data-gv2="ap:sair"/.test(t); })
      && /meta do time/.test(telas[0]) && /Funil do time no mês/.test(telas[2]) && /negócios? para planejar/.test(telas[3]) && !/R\$/.test(telas[0] + telas[2] + telas[3]) && !/\/mês/.test(telas[1]),
      erros.join(' | '));
    GV2.estado.aba = 'propostas'; GV2.estado.prop = 'acomp';
    let hp = ''; try { hp = GV2.render.propostas(); } catch (e) { falhas.push('propostas v8: ' + e.message); }
    checar('v8 Propostas: "Venceu ontem · ligar hoje" separado de "Esquecidas" (ou o aviso de que não leu)', /Venceu ontem · ligar hoje/.test(hp) && /Esquecidas/.test(hp) || /Lendo as propostas|Não consegui ler as propostas/.test(hp));
    GV2.estado.aba = ab0;
  }
  /* v9 (13/10/26): a aba Território absorve a tela antiga; três gavetas; toda escrita conta o que voltou */
  {
    const g = global, b = GV2.base, ids = b.pessoas.map(function (p) { return p.id; });
    const ant = { R: g.RT7_ESTADO, A: g.rt7Ativos, F: g.rt7FilaDoExec, S: g.rt7Score, M: g.rt7Marcado, P: g.rt7ProximaSegunda, E: g.rt7Estoque, G: g.rt7Registrar, C: g.rt7Carteira, supa: g.supa, pintar: GV2.pintar, ir: GV2.ir, aba: GV2.estado.aba };
    const L = function (id, dono, st, cidade, extra) { return Object.assign({ id: id, nome: 'Conta ' + id, status: st, responsavel_owner_id: dono, cidade: cidade, bairro: 'Centro', created_at: '2026-10-12T12:00:00Z' }, extra || {}); };
    g.RT7_ESTADO = { carregou: true, cargas: [], leads: [
      L('f1', '97353029', 'atribuido', 'Nova Iguaçu', { estado: 'RJ' }), L('f2', '97353029', 'atribuido', 'NOVA IGUACU', { estado: 'RJ' }),
      L('f3', '97353029', 'na_rota', 'Nova Iguaçu'),
      L('s1', null, 'pendente', 'Rio de Janeiro'),
      L('a1', ids[0], 'atribuido', 'Rio de Janeiro', { nota: 4.9, avaliacoes: 1200, telefone: '21999990000' }),
      L('a2', ids[0], 'atribuido', 'Rio de Janeiro')] };
    g.rt7Ativos = function () { return b.pessoas.map(function (p) { return { ownerId: p.id, nome: p.nome, role: 'rep' }; }); };
    g.rt7FilaDoExec = function (id, todas) { return g.RT7_ESTADO.leads.filter(function (l) { return ['pendente', 'atribuido'].indexOf(l.status) >= 0 && String(l.responsavel_owner_id) === String(id); }).map(function (l) { return { l: l, sc: l.nota ? 98 : null, orfa: false }; }); };
    g.rt7Score = function (l) { return l.nota ? 98 : null; };
    g.rt7Marcado = function (s, l) { const v = (s || {})[String(l.id)]; return v === undefined ? !l.responsavel_owner_id : !!v; };
    g.rt7ProximaSegunda = function () { return '2026-10-19'; };
    g.rt7Estoque = function (id) { return id === ids[0] ? { contas: 2, consumo: 4, semanas: 0.5 } : { contas: 80, consumo: null, semanas: null }; };
    g.rt7Registrar = function (e) { g.RT7_ESTADO.cargas = g.RT7_ESTADO.cargas.concat([e]); };
    g.rt7Carteira = function () { return { ativas: 1, cap: 60 }; };
    g.RT7_TETO = 0.75;
    const pedidos = [];
    g.supa = { from: function (tab) { return { update: function (c) { return { in: function (col, lista) { return { select: async function () { pedidos.push({ tab: tab, c: c, ids: lista.slice() }); return { data: lista.map(function (i) { return { id: i }; }), error: null }; } }; } }; } }; } };
    GV2.pintar = function () {}; GV2.ir = function (a) { GV2.estado.aba = a; };
    GV2.estado.aba = 'terr'; GV2.estado.v9g = null;
    /* Território v2 (15/10/26): a tela é a do territ.zip (scripts/testar-territorio-v2.js mede as
       regras); aqui, que ela desenha neste mundo e que nenhum botão leva à tela v9 nem à busca paga.
       O motor de escrita da v9 (gravar, registrar, desfazer) continua e é medido logo abaixo. */
    GV2.t10 = { lendo: false, erro: null, em: Date.now(), vis: [], cli: {} };
    let h = ''; try { h = GV2.render.terr(); } catch (e) { falhas.push('território v2: ' + e.message); }
    /* Território v3 (02/11/26): o mapa abre na lente "cobertura" (a v2 é a lente "carga da semana") e o
       Por executivo abre nos 30 dias (a semana é a outra aba): os cinco continuam na tela */
    checar('Território v2: 5 números, Onde agir, Territórios, Por executivo e Contra quem',
      (h.match(/class="gv2-t10-kpi[" ]/g) || []).length === 5 && /<b>Onde agir<\/b>/.test(h) && /<b>(Territórios|O território · cobertura)/.test(h) && /<b>Por executivo/.test(h) && /<b>Contra quem<\/b>/.test(h), h.slice(0, 300));
    checar('Território v2: nenhum botão abre a tela antiga nem a busca paga (v5rt7, v9g, Importar, munição)',
      !/data-gv2="v5rt7|data-gv2="v9g|Importar|Prospecção completa|munição|torneira/.test(h));
    const P = GV2.v9Pendencias();
    const fora = P.filter(function (x) { return x.tipo === 'fora'; });
    checar('v9 Decidir: conta de quem saiu entra uma vez por grafia de cidade, e só a que ainda pode mudar (na_rota fica)',
      fora.length === 1 && fora[0].n === 2 && fora[0].titulo === 'Nova Iguaçu/RJ', JSON.stringify(fora.map(function (x) { return [x.n, x.titulo]; })));
    /* 02/11/26: a gaveta da v9 (render.v9Gav e as v9Gav*) saiu como código morto — nenhuma tela a
       desenhava desde o Território v2; o motor de escrita (aprovar, desfazer, dar dono) segue medido */
    GV2.v9Comando('v9g', ['v9g', 'contas', ids[0]]);
    GV2.v9Comando('v9marcar', ['v9marcar', 'a1']);
    GV2.v9Comando('v9conf', ['v9conf', 'aprovar']);
    await GV2.v9Aprovar();
    const a1 = g.RT7_ESTADO.leads.find(function (l) { return l.id === 'a1'; });
    checar('v9 Contas: aprovar grava status na rota + data_rota da segunda + dono, e só a marcada',
      pedidos.length === 1 && pedidos[0].c.status === 'na_rota' && pedidos[0].c.data_rota === '2026-10-19' && pedidos[0].c.responsavel_owner_id === ids[0] && pedidos[0].ids.join() === 'a1' && a1.status === 'na_rota', JSON.stringify(pedidos));
    await GV2.v9Desfazer(0);
    {
      const dias = GV2.v9Dias();
      checar('Para quando: 10 dias úteis a partir de hoje, sem fim de semana nem feriado', dias.length === 10 && dias.every(function (d) { return GV2.util(d); }), JSON.stringify(dias));
      const quarta = dias.find(function (d) { return GV2.dow(d) === 3 && d > dias[0]; });
      GV2.v9Comando('v9dia', ['v9dia', quarta]);
      checar('Para quando: escolher a quarta grava na_rota naquela data', JSON.stringify(GV2.v9Campos({ responsavel_owner_id: 'x' })) === JSON.stringify({ status: 'na_rota', data_rota: quarta, responsavel_owner_id: 'x' }), JSON.stringify(GV2.v9Campos()));
      checar('Para quando: o chip do dia escolhido fica marcado', new RegExp('is-on" data-gv2="v9dia:' + quarta).test(GV2.v9DiaHTML()));
      GV2.v9Comando('v9dia', ['v9dia', 'municao']);
      checar('Para quando: sem dia grava atribuído, sem data_rota (ele escolhe no Planejamento)', JSON.stringify(GV2.v9Campos()) === JSON.stringify({ status: 'atribuido', data_rota: null }) && /sem dia/.test(GV2.v9DiaRot()), JSON.stringify(GV2.v9Campos()));
      GV2.v9Comando('v9dia', ['v9dia', '2020-01-01']);
      checar('Para quando: dia fora da lista volta para a próxima segunda', GV2.v9Dia() === GV2.v9Seg(), GV2.v9Dia());
      GV2.estado.terrDia = null;
    }
    checar('v9 Desfazer: a conta volta ao status e ao dia de antes', a1.status === 'atribuido' && a1.data_rota == null && pedidos[1] && pedidos[1].c.status === 'atribuido', JSON.stringify(pedidos[1]));
    GV2.v9Comando('v9g', ['v9g', 'dono']);
    const kFora = fora[0].k;
    GV2.v9Comando('v9conf', ['v9conf', 'dar', kFora, ids[1]]);
    await GV2.v9Dar(kFora, ids[1]);
    const P2 = GV2.v9Pendencias();
    checar('v9 Decidir dono: grava o dono nas contas e a pendência de quem saiu some',
      pedidos[2] && pedidos[2].c.responsavel_owner_id === ids[1] && !P2.some(function (x) { return x.tipo === 'fora'; }), JSON.stringify(pedidos[2]));
    let pedidosAntes = pedidos.length;
    g.supa = { from: function () { return { update: function () { return { in: function () { return { select: async function () { return { data: [], error: null }; } }; } }; } }; } };
    GV2.v9Comando('v9g', ['v9g', 'contas', ids[0]]);
    GV2.v9Comando('v9marcar', ['v9marcar', 'a2']);
    await GV2.v9Aprovar();
    checar('v9 Contas: banco que devolve 0 linhas é "nada foi gravado", nunca ✓', /Nada foi gravado/.test(GV2.estado.v9g.erro || '') && !GV2.estado.v9g.ok);
    g.RT7_FONTES = [{ id: 'casa_dos_dados', rot: 'Casa dos Dados', ativa: true }, { id: 'google_places', rot: 'Google Places', ativa: false, porque: 'x' }, { id: 'tripadvisor', rot: 'TripAdvisor', ativa: false, porque: 'y' }];
    GV2.estado.aba = 'time'; try { GV2.visitar('rotas'); } catch (e) { /* a antiga não existe aqui: conta como não ter vindo para o Território */ }
    checar('v9: "Rotas & Prospecção" não abre mais: visitar rotas cai no Território', GV2.estado.aba === 'terr');
    g.RT7_ESTADO = ant.R; g.rt7Ativos = ant.A; g.rt7FilaDoExec = ant.F; g.rt7Score = ant.S; g.rt7Marcado = ant.M; g.rt7ProximaSegunda = ant.P; g.rt7Estoque = ant.E; g.rt7Registrar = ant.G; g.rt7Carteira = ant.C; g.supa = ant.supa;
    GV2.pintar = ant.pintar; GV2.ir = ant.ir; GV2.estado.aba = ant.aba; GV2.estado.v9g = null; GV2.estado.v9feito = null; GV2.estado.v9conf = null;
  }
  /* v9 Acabamento fase 1 (13/10/26): o kit nas telas, sem mudar estrutura */
  {
    const b = GV2.base, ab0 = GV2.estado.aba, d0 = GV2.estado.daily;
    GV2.estado.aba = 'time';
    let h = ''; try { h = GV2.render.time(); } catch (e) { falhas.push('acab hoje: ' + e.message); }
    const kp = h.slice(h.indexOf('<div class="gv2-v5-kpis">'), h.indexOf('gv2-v5-meio'));
    checar('v9 Acabamento · Hoje: os 5 cartões do kit têm UMA linha de comparação cada (o resto vai para o "i")',
      (kp.match(/class="gv2-v5-kpi gv2-v9-kpi"/g) || []).length === 5 && (kp.match(/class="gv2-v9-cmp/g) || []).length === 5 && kp.indexOf('gv2-v5-kpi-l') < 0);
    const cab = h.slice(h.indexOf('gv2-v9-cabacoes'), h.indexOf('</header>'));
    checar('v9 Acabamento · Hoje: "Conduzir a daily" é o único botão preenchido; Apresentar, Atualizar HubSpot e Comunicado ficam leves e visíveis',
      (cab.match(/gv2-v5-btn is-prim/g) || []).length === 1 && (cab.match(/gv2-v5-btn is-leve/g) || []).length === 3 && /data-gv2="ap:abrir"/.test(cab) && /data-gv2="hsatu"/.test(cab) && /data-gv2="v6gav:com"/.test(cab));
    const p = b.pessoas[0];
    let gp = null; try { gp = GV2.v8GavPessoa(p.id); } catch (e) { falhas.push('acab gaveta: ' + e.message); }
    let fp = ''; try { fp = GV2.render.v8PorPessoa(); } catch (e) { falhas.push('acab funil pp: ' + e.message); }
    checar('v9 Acabamento · os passos do funil são degraus (gaveta da Pessoa e Funil › Por pessoa), não a frase "portas → n (x%)"',
      gp && /class="gv2-v9-passos"/.test(gp.corpo) && /class="gv2-v9-passos is-compacto"/.test(fp) && !/portas → [0-9]+ \(/.test(gp.corpo + fp));
    GV2.estado.daily = 0;
    let dl = ''; try { dl = GV2.render.daily(); } catch (e) { falhas.push('acab daily: ' + e.message); }
    checar('v9 Acabamento · Daily: o bloco 2 é o funil curto (visitas → demos → clientes, com as duas taxas) e a barra de Clientes não se repete',
      !dl || ((dl.match(/class="gv2-v9-fc-c"|class="gv2-v9-fc-c" |gv2-v9-fc-c"/g) || []).length >= 3 && /vira demo/.test(dl) && /vira cliente/.test(dl) && (dl.match(/gv2-v8d-bar/g) || []).length === 2));
    GV2.estado.daily = d0; GV2.estado.aba = ab0;
    const css = tpl.slice(tpl.indexOf('<style id="gv2-css">'), tpl.indexOf('</style><!-- /gv2-css -->'));
    checar('v9 Acabamento · barra usa o token de barra (no escuro o texto verde/vermelho é claro e não serve de preenchimento)',
      css.indexOf('background:var(--gv2-ok);') < 0 && css.indexOf('background:var(--gv2-erro);') < 0 && /--gv2-ok-barra:#22C55E/.test(css) && /--gv2-erro-barra:#F05252/.test(css));
    checar('v9 Acabamento · abaixo de 900 px os blocos da Daily não encolhem (no celular eles se sobrepunham)',
      /@media \(max-width:900px\)\{\s*\.gv2-v8d > \*\{flex-shrink:0;\}\s*\.gv2-v8d-grade\{flex:none;\}/.test(css));
  }
  /* v9 (13/10/26): Amanhã não cobra quem está em rampagem e não fala mais em WhatsApp (o pedido abre no app) */
  {
    const b = GV2.base, p = b.pessoas[0], fase0 = p.fase, dia0 = GV2.v5Dia;
    GV2.v5Dia = function (x, iso) { return { estado: 'ok', y: 0, itens: [], semLugar: 0 }; };
    p.fase = 'Preparação';
    let h = ''; try { h = GV2.render.v5Amanha(); } catch (e) { falhas.push('amanha: ' + e.message); }
    p.fase = fase0; GV2.v5Dia = dia0;
    const pedidos = (h.match(/data-gv2="v5pedir:[0-9]+"/g) || []).length;
    checar('v9 Rua › Amanhã: quem está em rampagem não leva "Pedir o plano" nem entra no "Pedir o plano a N", e o texto não promete WhatsApp',
      pedidos === b.pessoas.length - 1 && h.indexOf('Pedir o plano a ' + (b.pessoas.length - 1)) > 0 && /em rampagem · não é cobrado/.test(h) && !/WhatsApp/.test(h), pedidos + ' pedidos');
  }
  /* auditoria 13/10/26: o "Semana" da gaveta e da página da Pessoa (v5rua) não fazia nada fora da Rua */
  {
    const ab0 = GV2.estado.aba, rua0 = GV2.estado.rua, ir0 = GV2.ir, p0 = GV2.pintar;
    let foi = null;
    GV2.ir = function (a) { foi = a; GV2.estado.aba = a; };
    GV2.pintar = function () {};
    GV2.estado.aba = 'pessoas'; GV2.estado.rua = 'hoje';
    const qs0 = global.document && global.document.querySelector; if (global.document) global.document.querySelector = function () { return null; };
    try { GV2.v5RuaComando('v5rua', ['v5rua', 'semana']); } catch (e) { falhas.push('v5rua: ' + e.message); }
    const ok = foi === 'rua' && GV2.estado.rua === 'semana';
    GV2.ir = ir0; GV2.pintar = p0; GV2.estado.aba = ab0; GV2.estado.rua = rua0; if (global.document) global.document.querySelector = qs0;
    checar('auditoria · v5rua fora da Rua leva para a Rua na visão pedida (antes o clique não fazia nada)', ok, String(foi));
  }
  /* auditoria 14/10/26: a carga pede as visitas com prova UMA vez (mês, 4 semanas e semana saem por recorte) */
  checar('auditoria · a carga do gestor pede visitas_com_prova uma vez só e recorta as três janelas',
    codigo.indexOf("visJanela: GV2.rpcTudo('visitas_com_prova'") > 0 && codigo.indexOf("visitas4: supa.rpc('visitas_com_prova'") < 0 && codigo.indexOf("visSem: supa.rpc('visitas_com_prova'") < 0 && codigo.indexOf("visitasMes: supa.rpc('visitas_com_prova'") < 0 && codigo.indexOf('out.visitas4 = recorte(GV2.somaDias(seg, -21));') > 0);
  /* 14/10/26: negócio no Planejamento de hoje em diante TEM próximo passo (Julyan: "a partir do
     momento que eles planejam e agendam, tem próximo passo"); plano que já passou não conta */
  {
    const pintarOrig2 = GV2.pintar; GV2.pintar = function () {};
    const rotasOrig = tabelas.rotas_da_semana;
    tabelas.rotas_da_semana = [];
    const b0 = await GV2.montar();
    /* 02/11/26: o campo n.semPasso saiu (auditoria); a regra é GV2.semProximoPasso */
    const semPasso = GV2.semProximoPasso([].concat.apply([], b0.pessoas.map(p => p.negocios || [])));
    const hojeIso = b0.agora.iso;
    const futuro = semPasso[0], passado = semPasso[1];
    tabelas.rotas_da_semana = [
      { owner_id: futuro && futuro.dono, dia: GV2.somaDias(hojeIso, 2), vaga: 1, item_id: 'c-' + (futuro && futuro.id), nome: 'x', proposito: 'funil' },
      { owner_id: passado && passado.dono, dia: GV2.somaDias(hojeIso, -1), vaga: 1, item_id: 'c-' + (passado && passado.id), nome: 'y', proposito: 'funil' }
    ];
    const b1 = await GV2.montar();
    const achar = (b, id) => [].concat.apply([], b.pessoas.map(p => p.negocios || [])).find(n => n.id === id);
    const f1 = futuro && achar(b1, futuro.id), p1 = passado && achar(b1, passado.id);
    checar('no plano = próximo passo: o quente planejado para depois de amanhã sai de "sem próximo passo"',
      semPasso.length >= 2 && f1 && GV2.semProximoPasso([f1]).length === 0 && /^no plano · /.test(f1.proximo_passo || '') && !f1.puxar === !f1.travado,
      JSON.stringify([semPasso.length, f1 && f1.proximo_passo]));
    checar('no plano = próximo passo: plano que já passou não conta', p1 && GV2.semProximoPasso([p1]).length === 1 && !p1.proximo_passo, JSON.stringify([p1 && p1.proximo_passo]));
    checar('auditoria 02/11 · G3: o campo morto n.semPasso saiu da base', !('semPasso' in f1));
    checar('no plano = próximo passo: a carga lê também a semana que vem',
      codigo.indexOf("rotaProx: supa.rpc('rotas_da_semana', { p_segunda: GV2.somaDias(seg, 7)") > 0);
    tabelas.rotas_da_semana = rotasOrig;
    GV2.pintar = pintarOrig2;
  }
  /* 14/10/26: o combinado "6 visitas por dia" conta toda visita com prova, do plano ou não */
  {
    const pz = { semana: [], hoje: { paradas_plano: 0 }, ontem: { paradas_plano: 0, visitas_com_prova: 0, visitas_todas: 6 }, meta_visitas_dia: 6, w: [], travados: [] };
    const c1 = GV2.conferir(pz, { regra: 'visitas_dia' }, {});
    pz.ontem = { paradas_plano: 8, visitas_com_prova: 4, visitas_todas: 5 };
    const c2 = GV2.conferir(pz, { regra: 'visitas_dia' }, {});
    checar('visitas_dia: 6 visitas de rua sem plano cumprem; 5 (4 do plano) não',
      c1.ok === true && c2.ok === false && /4 do plano de 8/.test(c2.ev), JSON.stringify([c1, c2]));
  }
  /* 14/10/26: o PDI volta na Pessoas (bloco 5 + gaveta de anexo) */
  {
    const pintarOrig3 = GV2.pintar; GV2.pintar = function () {};
    const b0 = await GV2.montar(); GV2.base = b0; GV2.pessoasMontar(b0);
    const p0 = b0.pessoas[0];
    GV2.pdi.cache[p0.id] = { estado: 'ok', lista: [{ titulo: 'PDI semana teste', data: '2026-10-14', url: 'https://x/pdi.pdf', compromissos: ['a', 'b'] }] };
    const pag = GV2.render.v5Pessoa(p0);
    checar('PDI: a página da pessoa tem o bloco 5 com o documento e o Anexar PDI',
      pag.indexOf('5 · PDI') > 0 && pag.indexOf('PDI semana teste') > 0 && pag.indexOf('data-gv2="v5gav:pdi:' + p0.id + '"') > 0 && pag.indexOf('href="https://x/pdi.pdf"') > 0);
    GV2.estado.v5Gav = { t: 'pdi', id: p0.id };
    const gav = GV2.render.v5Gav();
    checar('PDI: a gaveta tem título, compromissos, arquivo e o botão de anexar',
      gav.indexOf('data-gv2-pdi="titulo"') > 0 && gav.indexOf('data-gv2-pdi="comp"') > 0 && gav.indexOf('data-gv2-pdi="arq"') > 0 && gav.indexOf('data-gv2="v9pdi:anexar:' + p0.id + '"') > 0);
    GV2.estado.v5Gav = { t: 'um', id: p0.id };
    checar('PDI: as outras gavetas da pessoa seguem abrindo', GV2.render.v5Gav().indexOf('1:1 com') > 0);
    GV2.estado.v5Gav = null;
    GV2.pintar = pintarOrig3;
  }
  /* HOJE DO EXECUTIVO v4 (16/10/26, hj.zip): "sem próximo passo" é UM número em quatro lugares, a
     linha marca tipo + data e grava pela porta certa, e fonte fora é "—", nunca 0 */
  await (async function () {
    const DV = GV2.DV, EXH = GV2.EXH, X = GV2.EXH4;
    checar('v4 Hoje · o módulo da Hoje v4 está no bloco', !!X && typeof X.semPassoHTML === 'function');
    if (!X) return;
    const pintarOrig4 = GV2.pintar; GV2.pintar = function () {}; GV2.base = await GV2.montar(); GV2.pintar = pintarOrig4;
    DV.estado.base = GV2.base;
    const p = GV2.base.pessoas.find(function (x) { return X.semPasso(x, GV2.base).length > 0; }) || GV2.base.pessoas[0];
    DV.estado.p = p;
    const so = function (h) { return String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); };
    const n0 = DV.com(function () { return X.semPasso(p, GV2.base).length; });
    const cart = DV.com(function () { return X.cartoesHTML(p, GV2.base, 'dia'); });
    const reg = DV.com(function () { return X.regrasHTML(p, GV2.base); });
    const sp = DV.com(function () { return X.semPassoHTML(p, GV2.base); });
    const m5 = /<small>Sem próximo passo<\/small><b[^>]*>(\d+)<\/b>/.exec(cart);
    checar('v4 Hoje · o 5º cartão é "Sem próximo passo" (não mais "Sem desfecho") e mostra o mesmo N da regra 2 e do título',
      !!m5 && Number(m5[1]) === n0 && cart.indexOf('<small>Sem desfecho</small>') < 0
        && (n0 ? so(reg).indexOf(n0 + ' sem plano') > -1 && so(sp).indexOf(n0 === 1 ? '1 lead está sem plano.' : n0 + ' leads estão sem plano.') > -1 : so(reg).indexOf('todos com plano') > -1),
      JSON.stringify({ n0: n0, cartao: m5 && m5[1] }));
    checar('v4 Hoje · as 5 regras e o placar "N de 5"', (reg.match(/class="exh4-regra is-/g) || []).length === 5 && /\d de 5<\/b>/.test(reg));
    checar('v4 Hoje · antes das 18h a regra 5 (fechar o dia) fica neutra: "abre às 18h"', /is-nao[^>]*><i>5<\/i><span><b>Fechar o dia até 19h<\/b><small>abre às 18h/.test(reg));
    const datas = X.datas(GV2.base);
    checar('v4 Hoje · as datas são hoje + os 3 próximos dias úteis', datas.length === 4 && datas[0] === GV2.base.agora.iso && datas.every(function (d) { return GV2.util(d); }), datas.join());
    const lista = DV.com(function () { return X.ordenados(p, GV2.base); });
    /* 16/10/26: 64 de 247 negócios tinham só tarefa vencida; a linha diz que o passo venceu */
    const nv = lista[0];
    if (nv) {
      if (!nv.lead) nv.lead = {};
      const t0 = nv.lead.tarefas;
      nv.lead.tarefas = [{ subject: 'Follow-up - Ligar', timestamp: '2026-10-05T12:00:00Z' }, { subject: 'Visita - velha', timestamp: '2026-10-01T12:00:00Z' }];
      const lv = DV.com(function () { return X.linhaHTML(nv, GV2.base); });
      const sv = DV.com(function () { return X.semPassoHTML(p, GV2.base); });
      checar('v4 Hoje · tarefa vencida: a linha diz "passo venceu", com a data e o assunto da mais recente',
        /passo venceu seg 05\/10: Ligar, sem ser feito/.test(so(lv)) && !/velha/.test(lv), so(lv).slice(0, 240));
      checar('v4 Hoje · o cabeçalho conta quantos tinham passo marcado e o dia passou', /1 deles tinha passo marcado/.test(so(sv)));
      nv.lead.tarefas = [{ subject: 'Follow-up - Ligar', timestamp: '2026-10-08T12:00:00Z' }];
      checar('v4 Hoje · tarefa de hoje em diante não é "venceu"', !/passo venceu/.test(DV.com(function () { return X.linhaHTML(nv, GV2.base); })));
      nv.lead.tarefas = t0;
    }
    checar('v4 Hoje · a lista põe os quentes primeiro (quente = Decisor em diante, GV2.quenteCadencia)', lista.findIndex(function (n) { return !GV2.quenteCadencia(n); }) === -1 || lista.slice(lista.findIndex(function (n) { return !GV2.quenteCadencia(n); })).every(function (n) { return !GV2.quenteCadencia(n); }));
    checar('v4 Hoje · quente da cadência: Decisor, Demo, Negociação e Ag. Pagamento sim; Prospecção e Visita não', [0, 1, 2, 3, 4, 5].map(function (i) { return GV2.quenteCadencia({ etapa_idx: i }); }).join() === 'false,false,true,true,true,true');
    checar('v4 Hoje · a sugestão de tipo segue a etapa (Negociação liga, Demo/Decisor visita, Visita WhatsApp, Prospecção liga)',
      X.sugestao({ etapa_idx: 4 }) === 'ligar' && X.sugestao({ etapa_idx: 3 }) === 'visita' && X.sugestao({ etapa_idx: 2 }) === 'visita' && X.sugestao({ etapa_idx: 1 }) === 'whats' && X.sugestao({ etapa_idx: 0 }) === 'ligar');
    /* a gravação: ligar vai pelo hubspot-sync (create_task, tarefa aberta, dono = executivo) e o passo espelha na agenda */
    const alvo = DV.com(function () { return X.semPasso(p, GV2.base)[0]; });
    if (alvo) {
      const rep0 = EXH.repintarTudo, toast0 = EXH.toast, gt0 = GV2.toast, fn0 = global.supa.functions, esp0 = global.espelharPassoNasTelas;
      EXH.repintarTudo = function () {}; EXH.toast = function () {}; GV2.toast = function () {};
      const chamadas = [], espelhos = [];
      global.supa.functions = { invoke: function (nome, op) { chamadas.push({ nome: nome, body: op.body }); return Promise.resolve({ data: { ok: true }, error: null }); } };
      global.espelharPassoNasTelas = function (l, iso, tipo, dono) { espelhos.push({ id: l.id, iso: iso, tipo: tipo, dono: dono }); return Promise.resolve({ ok: true }); };
      const pp0 = alvo.proximo_passo;
      await X.gravar(alvo, p, 'ligar', datas[1]);
      const c = chamadas[0] || { body: {} };
      checar('v4 Hoje · "ligar" cria a tarefa aberta no negócio pelo hubspot-sync, com o dono do executivo e a data escolhida',
        chamadas.length === 1 && c.nome === 'hubspot-sync' && c.body.type === 'create_task' && c.body.id_hubspot === alvo.id && c.body.owner_id === p.id
          && c.body.concluida === false && c.body.due_at === datas[1] + 'T12:00:00.000Z' && /^Ligar para /.test(c.body.titulo), JSON.stringify(c));
      checar('v4 Hoje · o passo gravado espelha no Planejamento e na agenda (a porta de todo passo)', espelhos.length === 1 && espelhos[0].id === alvo.id && espelhos[0].iso === datas[1] && espelhos[0].dono === p.id);
      const n1 = DV.com(function () { return X.semPasso(p, GV2.base).length; });
      checar('v4 Hoje · depois de gravar o negócio sai de "sem próximo passo" (o número cai 1)', n1 === n0 - 1 && !!alvo.proximo_passo, n0 + ' → ' + n1);
      /* a falha: o lead volta para a lista e o passo não fica marcado */
      const outro = DV.com(function () { return X.semPasso(p, GV2.base)[0]; });
      if (outro) {
        global.supa.functions = { invoke: function () { return Promise.resolve({ data: null, error: { message: 'HubSpot recusou' } }); } };
        await X.gravar(outro, p, 'whats', datas[0]);
        checar('v4 Hoje · HubSpot recusou: o lead continua sem próximo passo (nada de ✓ falso)', !outro.proximo_passo && !X.estado.marcados[outro.id]);
      }
      alvo.proximo_passo = pp0; delete X.estado.marcados[alvo.id];
      EXH.repintarTudo = rep0; EXH.toast = toast0; GV2.toast = gt0; global.supa.functions = fn0; global.espelharPassoNasTelas = esp0;
    }
    /* fonte fora: "—" e o nome da fonte */
    const d0 = X.disp;
    X.disp = { estado: 'erro', erro: 'função ausente', em: Date.now() };
    const dsp = DV.com(function () { return X.disputaHTML(p, GV2.base); });
    checar('v4 Hoje · o placar fora do ar: "—" e o nome da fonte (disputa_da_semana), nunca 0', /exh4-gm-pos">—</.test(dsp) && dsp.indexOf('disputa_da_semana') > -1 && !/>0º</.test(dsp));
    X.disp = { estado: 'ok', em: Date.now(), d: { linhas: [{ owner_id: 'x', nome: 'Rui Alto', pts: 120, pos: 1 }, { owner_id: p.id, nome: p.nome, pts: 80, pos: 2, eu: true, vendas: 0, demos: 2, visitas: 10 }], eventos: [{ em: '2026-10-06T13:00:00Z', owner_id: 'x', nome: 'Rui Alto', tipo: 'contrato', pts: 100 }] } };
    const dsp2 = DV.com(function () { return X.disputaHTML(p, GV2.base); });
    checar('v4 Hoje · a disputa mostra a posição, quem está à frente e o que falta (1 venda ou ⌈dif/25⌉ demos)',
      /exh4-gm-pos">2º</.test(dsp2) && /Rui A\.<\/b> está 40 pts à frente/.test(dsp2) && /Para alcançar Rui A\.: 1 venda ou 2 demos\./.test(dsp2), so(dsp2).slice(0, 300));
    checar('v4 Hoje · as regras do bônus na tela são as de hoje (demo conta com a venda; visita sem teto, 1x por restaurante)',
      /conta junto com a venda/.test(dsp2) && /sem teto por dia, cada restaurante uma vez na semana/.test(dsp2) && !/teto de 6/.test(dsp2));
    X.disp = d0;
    const vm0 = DATA.vendasMes;
    DATA.vendasMes = { mes: '2000-01', porRep: [] };
    const mes = DV.com(function () { return X.mesHTML(p, GV2.base); });
    checar('v4 Hoje · vendas de outro mês: o Meu mês diz "—" e a fonte (vendasMes), não 0', /<b>—<\/b><span>as vendas deste mês não vieram \(vendasMes\)/.test(mes));
    DATA.vendasMes = vm0;
  })();
  /* PLANEJAMENTO v2 · A CADÊNCIA DA CARTEIRA (16/10/26, plal.zip): 5 grupos sem sobreposição, que
     somam a carteira; as 5 regras; o selo; e a ligação no template */
  {
    const P = GV2.PL7;
    checar('pl7 · o módulo da cadência está no bloco', !!P && typeof P.cadencia === 'function');
    if (P) {
      const at0 = global.pl6AtrasoDoPasso, fu0 = global.pl6PassoFuturo;
      global.pl6AtrasoDoPasso = function (l) { return l._at == null ? null : l._at; };
      global.pl6PassoFuturo = function (l) { return !!l._fut; };
      const H = '2026-10-16';
      const c = function (id, st, x) { return Object.assign({ id: id, tipo: 'c', stageId: st, nome: id, dias: 3 }, x || {}); };
      const n = function (id, dias, x) { return Object.assign({ id: id, tipo: 'n', nome: id, _bruto: { data_abertura: GV2.somaDias(H, -dias) } }, x || {}); };
      const todos = [
        c('c-neg', '1395880472'),                     // quente (Negociação sem nada)
        c('c-dec', '1395880470', { _at: 0 }),          // passo vence hoje: com passo
        c('c-vis', '1396005401', { _at: 3 }),          // venceu há 3 d
        c('c-fut', '1396005401', { _fut: true }),      // com passo futuro
        c('c-pro', '1395880469'),                      // outro
        c('c-pag', '1395880473'),                      // Ag. Pagamento: fora da carteira
        c('c-gra', '1395880472'),                      // quente, mas está na grade: com passo
        c('c-rel', '1396006162', { base: true }),      // base de clientes: fora
        c('c-rec', '1398311191', { etapa: 'Reciclagem' }), // Reciclagem: fora (só leads ativos, 16/10)
        n('n-novo', 10), n('n-velho', 120), n('n-plan', 5)
      ];
      const naGrade = new Set(['c-gra', 'n-plan']);
      const cad = P.cadencia(todos, naGrade, H);
      checar('pl7 · a carteira é SÓ o funil aberto dele (6), e os 4 grupos somam ela sem se sobrepor',
        cad.total === 6 && cad.passo === 3 && cad.quente === 1 && cad.venc === 1 && cad.outro === 1 && cad.sem === 3
          && cad.passo + cad.quente + cad.venc + cad.outro === cad.total, JSON.stringify(cad));
      checar('pl7 · CNPJ novo conta à parte: 1 sem visita e 1 no plano, fora do "sem próximo passo"', cad.cnpj === 1 && cad.cnpjNoPlano === 1);
      checar('pl7 · Reciclagem não é carteira (só os leads ativos)', P.grupo(todos[8], naGrade, H) === null);
      checar('pl7 · Ag. Pagamento, cliente da base e CNPJ com mais de 90 d não são carteira',
        P.grupo(todos[5], naGrade, H) === null && P.grupo(todos[7], naGrade, H) === null && P.grupo(todos[10], naGrade, H) === null);
      checar('pl7 · passo que vence hoje conta como passo (a mesma regra da Hoje)', P.grupo(todos[1], naGrade, H) === 'passo');
      checar('pl7 · o quente que está no plano da semana conta como com passo', P.grupo(todos[6], naGrade, H) === 'passo');
      const dias = [0, 1, 2, 3, 4].map(function (i) { return { iso: GV2.somaDias('2026-10-19', i) }; });
      const cheio = function (k) { const a = []; for (let i = 0; i < k; i++) a.push('c-' + i); return a; };
      const reg = P.regras(cad, [cheio(6), cheio(6), cheio(2), cheio(7), cheio(6)], dias, 6, function (v) { return v; }, function () { return false; });
      checar('pl7 · as 5 regras: 1 a 3 e 5 pendentes, a 4 conta 1 dia abaixo de 6',
        reg.length === 5 && reg.feitas === 0 && reg[0].st === '1 quente sem data' && reg[1].st === '1 follow-up vencido'
          && reg[2].st === '1 conta nova sem visita' && reg[3].st === '1 dia abaixo de 6' && reg[4].st === '3 negócios sem próximo passo', JSON.stringify(reg.map(function (r) { return r.st; })));
      const passou = P.regras(cad, [[], [], cheio(6), cheio(6), cheio(6)], dias, 6, function (v) { return v; }, function (iso) { return iso < '2026-10-21'; });
      checar('pl7 · dia que passou não reprova a regra 4 (é resultado, não plano)', passou[3].ok === true);
      const zero = P.cadencia([c('c-x', '1395880472', { _fut: true })], new Set(), H);
      checar('pl7 · carteira toda com passo: 5 verde e 100%', zero.sem === 0 && zero.pct === 100 && P.regras(zero, [cheio(6), cheio(6), cheio(6), cheio(6), cheio(6)], dias, 6, function (v) { return v; }, function () { return false; }).feitas === 5);
      checar('pl7 · os selos: QUENTE, VENCEU HÁ 3 D, CNPJ NOVO · 10 D, SEM PASSO',
        P.selo(todos[0], naGrade, H).tag === 'QUENTE' && P.selo(todos[2], naGrade, H).tag === 'VENCEU HÁ 3 D'
          && P.selo(todos[9], naGrade, H).tag === 'CNPJ NOVO · 10 D' && P.selo(todos[4], naGrade, H).tag === 'SEM PASSO');
      const ord = todos.filter(function (l) { const g = P.grupo(l, naGrade, H); return g && g !== 'passo'; }).sort(P.comparar(naGrade, H)).map(function (l) { return l.id; });
      checar('pl7 · a ordem de "Todos sem passo": quente, vencido, CNPJ novo, o resto', ord.join() === 'c-neg,c-vis,n-novo,c-pro', ord.join());
      const bl = P.blocoHTML(cad, reg);
      checar('pl7 · o bloco diz "3 de 6 negócios seus sem próximo passo", põe o CNPJ novo fora do funil, e a legenda abre a aba',
        /3 de 6 negócios seus sem próximo passo\./.test(bl) && /fora dele, 1 conta nova \(CNPJ até 90 d\) sem visita/.test(bl)
          && /3 de 6 negócios com próximo passo datado/.test(bl) && (bl.match(/class="pl7-seg"/g) || []).length === 4
          && /data-pl6-acao="cadaba:q"/.test(bl) && /data-pl6-acao="cadaba:cn"/.test(bl) && /0 de 5/.test(bl));
      /* MONTAR A SEMANA, EM RASCUNHO: propõe nos dias que não passaram, até a meta, na ordem da
         cadência, sem conta nova; o que foi tirado não volta */
      const filaM = todos.filter(function (l) { const g = P.grupo(l, naGrade, H); return g === 'quente' || g === 'venc' || g === 'outro'; }).sort(P.comparar(naGrade, H));
      const gradeM = [cheio(5), cheio(6), [], cheio(4), cheio(6)];
      const prop = P.montar([n('n-x', 3)].concat(filaM), gradeM, dias, 6, function (v) { return v; }, function (iso) { return iso === '2026-10-21'; }, new Set());
      checar('pl7 · montar: completa só os dias abaixo de 6 que não passaram, na ordem da cadência, sem conta nova',
        prop.total === 3 && prop[0].di === 0 && prop[0].itens.map(function (l) { return l.id; }).join() === 'c-neg'
          && prop[1].di === 3 && prop[1].itens.map(function (l) { return l.id; }).join() === 'c-vis,c-pro', JSON.stringify(prop.map(function (d) { return [d.di, d.itens.map(function (l) { return l.id; })]; })));
      const prop2 = P.montar(filaM, gradeM, dias, 6, function (v) { return v; }, function () { return false; }, new Set(['c-neg']));
      checar('pl7 · montar: o que ele tirou do rascunho não é proposto de novo', prop2.every(function (d) { return d.itens.every(function (l) { return l.id !== 'c-neg'; }); }));
      const rf = P.rascunhoHTML(prop, {});
      const ra = P.rascunhoHTML(prop, { aberto: true });
      checar('pl7 · montar: fechado é um botão que só propõe; aberto mostra os dias, "tirar" em cada um e o confirmar',
        /data-pl6-acao="pl7montar"/.test(rf) && /propor 3 contas/.test(rf) && !/pl7confirmar/.test(rf)
          && (ra.match(/data-pl6-acao="pl7tirar:/g) || []).length === 3 && /data-pl6-acao="pl7confirmar"/.test(ra) && /Nada foi gravado/.test(ra));
      checar('pl7 · montar: sem o que propor, diz por quê (sem botão morto)', /já estão com a meta/.test(P.rascunhoHTML(P.montar([], gradeM, dias, 6, function (v) { return v; }, null, new Set()), {})));
      const ab = P.abasHTML(cad, 'v');
      checar('pl7 · as 4 abas com o número e a descrição da aberta', (ab.match(/<button type="button" class="pl7-aba/g) || []).length === 4 && /pl7-aba is-on" data-pl6-acao="faixa:v"/.test(ab) && /o dia passou sem ser feito/.test(ab));
      global.pl6AtrasoDoPasso = at0; global.pl6PassoFuturo = fu0;
    }
    if (P) {
      const c4 = P.capacidadeHTML(4, 6, '3 follow-up · 1 avançar o funil');
      const c8 = P.capacidadeHTML(8, 6, '');
      checar('pl7 · capacidade do dia: 6 segmentos, 4 âmbar abaixo da meta; com 8, verde e "+2", sem teto',
        (c4.match(/<i class="pl7-cap-s/g) || []).length === 6 && (c4.match(/is-av/g) || []).length === 4 && /4 · meta 6/.test(c4) && /3 follow-up/.test(c4)
          && /pl7-cap is-ok/.test(c8) && /8 \(\+2\) · meta 6/.test(c8) && !/pl7-mix/.test(c8));
    }
    if (P) {
      const e2 = P.enviarHTML(2, null, false), e5 = P.enviarHTML(5, null, false), eE = P.enviarHTML(3, '2026-10-16T21:10:00Z', false);
      checar('pl7 · enviar ao gestor: com 2 de 5 é contornado e diz que pode enviar; com 5 fica vermelho; enviado mostra a hora',
        /data-pl6-acao="pl7enviar:2"/.test(e2) && !/is-pronto/.test(e2) && /pode enviar com regra faltando/.test(e2)
          && /pl7-enviar-bt is-pronto/.test(e5) && /plano enviado ✓/.test(eE) && /18:10/.test(eE) && /Reenviar/.test(eE));
    }
    if (P) {
      const A = { lat: -23.5505, lng: -46.6333 }, B = { lat: -23.5605, lng: -46.6333 };
      checar('pl7 · mapa: 0,01° de latitude ≈ 1,1 km em linha reta', Math.abs(P.km(A, B) - 1.112) < 0.01, String(P.km(A, B)));
      const perto = P.perto([A], [{ id: 'a', lat: -23.551, lng: -46.6333 }, { id: 'longe', lat: -23.70, lng: -46.6333 }, { id: 'q', quente: true, lat: -23.56, lng: -46.6333 }], 4);
      checar('pl7 · mapa: "por perto" só até 3 km, o quente primeiro', perto.map(function (x) { return x.id; }).join() === 'q,a', perto.map(function (x) { return x.id; }).join());
      const dd = { dias: [{ rot: 'seg', data: '19/10' }, { rot: 'ter', data: '20/10', pl7Mapa: { di: 1, iso: '2026-10-20', rot: 'ter', data: '20/10', regiao: 'Pinheiros', href: '/?agenda=2026-10-20', semLugar: 1,
        paradas: [{ nome: 'Duca', lat: A.lat, lng: A.lng, hora: '09:00' }, { nome: 'Lobo', lat: B.lat, lng: B.lng, hora: '≈ 09:40' }] } }],
        pl7Perto: [{ id: 'c-9', nome: 'Luigi', etapa: 'Negociação', quente: true, lat: -23.552, lng: -46.6333 }] };
      const md = P.mapaDiaHTML(dd);
      checar('pl7 · mapa: o painel do dia aberto tem a rota, a distância, o "+ encaixar" e o "abrir no app"',
        /Rota de ter 20\/10 · Pinheiros/.test(md) && /2 paradas · ≈ 1,1 km em linha reta/.test(md) && /1 sem lugar no mapa/.test(md)
          && /<b>09:00<\/b><span>Duca<\/span><small>início/.test(md) && /data-pl6-acao="pl7encaixar:c-9\|1"/.test(md)
          && /href="\/\?agenda=2026-10-20"/.test(md) && /data-pl7-mapa="/.test(md) && /pl7-md-dia is-on" data-pl6-acao="pl7mapa:1"/.test(md));
      checar('pl7 · mapa: sem dia aberto, nada', P.mapaDiaHTML({ dias: [{ rot: 'seg', data: '19/10' }] }) === '');
    }
    if (P) {
      const tq = P.toquesHTML([true, false, false, true, true, false]);
      checar('pl7 · toques: 6 quadrados do mais antigo ao atual, verde onde teve toque; sem leitura, nada (nunca 6 vazios)',
        (tq.match(/<i/g) || []).length === 6 && (tq.match(/is-ok/g) || []).length === 3 && /3 de 6 semanas/.test(tq) && P.toquesHTML(null) === '' && P.toquesHTML([true]) === '');
      const rpc0 = global.supa.rpc;
      const pedidos = [];
      global.supa.rpc = function (nome, args) { pedidos.push({ nome: nome, args: args }); return Promise.resolve({ data: { '111': [true, true, false, false, false, true] }, error: null }); };
      let chegou = 0;
      P.toques.cache = {}; P.toques.pedidos = {};
      P.toquesPedir(['111', '222', '111', null], function () { chegou++; });
      await new Promise(function (r) { setTimeout(r, 10); });
      P.toquesPedir(['111', '222'], function () { chegou++; });
      await new Promise(function (r) { setTimeout(r, 10); });
      checar('pl7 · toques: pede em lote, sem repetir id, uma vez só; o que não veio fica sem linha',
        pedidos.length === 1 && pedidos[0].nome === 'toques_por_semana' && pedidos[0].args.p_deals.join() === '111,222' && chegou === 1
          && Array.isArray(P.toquesDe('111')) && P.toquesDe('222') === null, JSON.stringify(pedidos));
      global.supa.rpc = rpc0;
    }
    checar('pl7 · no template: Reciclagem decide — reciclar cria o retorno em 60 d no HubSpot e espelha na agenda; perdido passa pela ficha (com motivo)',
      /decidir: l\.etapa === 'Reciclagem' && pl7/.test(tpl)
        && /if \(verbo === 'pl7reciclar'\)[\s\S]{0,1200}type: 'create_task'[\s\S]{0,1400}espelharPassoNasTelas\(/.test(tpl)
        && /if \(verbo === 'pl7perder'\)[\s\S]{0,200}pl6MoverPelaFicha\(rep, String\(arg\), '1396006164'/.test(tpl)
        && /data-pl6-acao="\$\{m\.perder\}">perdido</.test(tpl));
    checar('pl7 · no template: o mini mapa abre pelo botão "rota" do dia, desenha depois de cada pintura e encaixa pelo agendarNoSlot',
      /data-pl6-acao="\$\{dia\.pl7MapaOn\}"/.test(tpl) && (tpl.match(/GV2\.PL7\.mapaAposPintar\(/g) || []).length === 2
        && /if \(verbo === 'pl7encaixar'\)[\s\S]{0,250}return agendarNoSlot\(par\[0\], diE, primeiraVaga\(diE\), null\);/.test(tpl));
    checar('pl7 · no template: enviar grava fechado_em/fechado_por da semana em foco (o que a Daily lê como semana validada)',
      /if \(verbo === 'pl7enviar'\)[\s\S]{0,700}\.update\(\{ fechado_em: agoraIso, fechado_por: quem \}\)[\s\S]{0,200}\.eq\('data_segunda', segunda\)/.test(tpl));
    checar('pl7 · no template: na sexta a tela abre na próxima semana, uma vez, e o chip manda depois',
      /weekday: 'short' \}\) === 'Fri'\) \{\n    PL6_SEMANA = 1; pl6UI\.semanaTocada = true;/.test(tpl) && /pl6UI\.semanaTocada = true;\n      if \(nova === \(Number\(PL6_SEMANA\) \|\| 0\)\) return;/.test(tpl));
    checar('pl7 · no template: dois cartões na mesma hora levam "mesmo horário de X" (avisa, não trava)',
      /const horaAcertar = mesmoHora \? 'mesmo horário de ' \+ mesmoHora/.test(tpl) && /GV2\.PL7\.capacidadeHTML\(dia\.capN, dia\.capMeta, dia\.mixTxt\)/.test(tpl));
    checar('pl7 · no template: confirmar o rascunho grava pelo agendarNoSlot de sempre, uma conta por vez, e propor não grava',
      /if \(verbo === 'pl7confirmar'\)[\s\S]{0,900}await agendarNoSlot\(it\.id, it\.di, primeiraVaga\(it\.di\), null\)/.test(tpl)
        && /if \(verbo === 'pl7montar'\) \{ s\.pl7Aberto = true; s\.pl7Feito = null; s\.pl7Fora = new Set\(\); return redesenhar\(\); \}/.test(tpl));
    checar('pl7 · no template: a Cadência é o 7º propósito, abre por padrão, e a legenda tem o clique "cadaba"',
      /\{ id: 'cad', nome: 'Cadência'/.test(tpl) && /const propAtivo = s\.proposito \|\| \(typeof GV2 !== 'undefined' && GV2\.PL7 \? 'cad'/.test(tpl)
        && /if \(verbo === 'cadaba'\)/.test(tpl) && /\$\{d\.cadHTML \|\| ''\}/.test(tpl) && /\$\{d\.cadAbasHTML \|\| ''\}/.test(tpl));
  }
  /* ── GRUPO 0 do "Acelerar Field Sales v2" (#920, 31/10/26): quente parado, demo sem retorno,
     perda depois da demo. Negócios falsos com horas relativas ao relógio de verdade. ── */
  {
    const negEra = GV2.base.negocios, dataEra = global.DATA.perdasPosDemo;
    const ha = function (h) { return new Date(Date.now() - h * 3600000).toISOString(); };
    const neg = function (id, o) { return Object.assign({ id: id, nome: 'N' + id, dono: '1', etapa_idx: 4, mrr: 500, dias: 9, agPag: false, proximo_passo: 'ligar', lead: {} }, o); };
    GV2.base.negocios = [
      neg('semPasso', { proximo_passo: null, lead: { temperatura: 'quente', ultimaInteracao: ha(2) } }),
      neg('semToque', { lead: { temperatura: 'quente', ultimaInteracao: ha(72) } }),
      neg('emDia', { lead: { temperatura: 'quente', ultimaInteracao: ha(10) } }),
      neg('agPag', { agPag: true, etapa_idx: 5, proximo_passo: null, lead: { temperatura: 'quente', ultimaInteracao: ha(200) } }),
      neg('morno', { proximo_passo: null, lead: { temperatura: 'morno', ultimaInteracao: ha(200) } }),
      neg('demoMuda', { etapa_idx: 3, lead: { temperatura: 'morno', entrouNaEtapaEm: ha(72), ultimaInteracao: ha(71.5) } }),
      neg('demoVoltou', { etapa_idx: 3, lead: { temperatura: 'morno', entrouNaEtapaEm: ha(72), ultimaInteracao: ha(60) } }),
      neg('demoNova', { etapa_idx: 3, lead: { temperatura: 'morno', entrouNaEtapaEm: ha(10) } })
    ];
    const qp = GV2.g0QuenteParado().map(function (x) { return x.n.id; });
    checar('g0 · quente parado: sem próximo passo OU sem toque há 48 h; em dia, Ag. pagamento e morno ficam fora',
      qp.sort().join() === 'semPasso,semToque', qp.join());
    const dm = GV2.g0DemoSemRetorno().map(function (x) { return x.n.id; });
    checar('g0 · demo sem retorno: 48 h na Demo sem toque depois de 1 h da entrada; o toque da própria demo não conta',
      dm.join() === 'demoMuda', dm.join());
    const cnaEra = GV2.cobrarNoApp, cneEra = GV2.cobrarNegocio;
    let recado = null, hubspot = false;
    GV2.cobrarNoApp = function (p, texto) { recado = texto; return Promise.resolve(false); };
    GV2.cobrarNegocio = function () { hubspot = true; return Promise.resolve(false); };
    await GV2.g0Cobrar('semToque');
    GV2.cobrarNoApp = cnaEra; GV2.cobrarNegocio = cneEra;
    checar('g0 · Cobrar vira recado no app com o prefixo que a semana reconhece, e nunca tarefa no HubSpot',
      /^Quente parado: NsemToque está 3 dias sem andar\./.test(String(recado)) && !hubspot, String(recado));
    global.DATA.perdasPosDemo = {
      mes: { total: 5, porMotivo: { 'Preço': 3, 'Outros': 2 }, porOwner: { '1': { total: 3, porMotivo: { 'Preço': 3 } }, '99': { total: 2, porMotivo: { 'Outros': 2 } } } },
      base: { total: 4, rotulo: 'julho e agosto', porMotivo: { 'Sem retorno': 4 }, porOwner: { '2': { total: 1, porMotivo: { 'Sem retorno': 1 } }, '98': { total: 3, porMotivo: { 'Sem retorno': 3 } } } },
      lidoEm: '2026-10-31T12:00:00Z'
    };
    const pd = GV2.render.g0Perda();
    checar('g0 · perda: o título traz mês e base; a tabela soma o título, com quem saiu do time numa linha só',
      /5 perdas depois da demo em .* · 4 em julho e agosto/.test(pd)
        && /<b>Quem saiu do time<\/b><\/td><td class="num">3<\/td><td class="num">2<\/td><td>Outros<\/td>/.test(pd)
        && /<td class="num">0<\/td><td class="num">3<\/td><td>Preço<\/td>/.test(pd), pd.slice(0, 400));
    global.DATA.perdasPosDemo = null;
    checar('g0 · perda: sem a leitura do robô, o cartão diz que chega na próxima, sem número inventado',
      /chega na próxima leitura do HubSpot pelo robô/.test(GV2.render.g0Perda()));
    GV2.base.negocios = negEra; global.DATA.perdasPosDemo = dataEra;
  }

  /* ── A RAMPA (handoff "Acelerar Field Sales v2", 1a–1c · 31/10/26): a fase sai das aprovações,
     aprovar exige evidência e data, sem bater pede motivo, prospecção antes da S4 vira alerta. ── */
  {
    const rpEra = Object.assign({}, GV2.rp), supaEra = global.supa.from;
    const sem = function (seg, provadas, uteis) { return { segunda: seg, provadas: provadas, uteis: uteis == null ? 5 : uteis }; };
    const pes = function (id, o) { return Object.assign({ pessoa: id, ownerId: null, nome: 'Pessoa ' + id, inicio: '2026-10-05', turma: '2026-10-05', padrinhoNome: 'Marco Filho', dia: 27, fases: {}, decisao: null,
      medido: { demos: 0, clientes: 0, visitasBase: 0, prospeccao: 0, prospeccaoDias: [], semanas: [] } }, o); };
    const ap = function (d, real) { return { aprovadaEm: d, aprovadaPor: 'Julyan', evidencia: 'Gravação', realizado: real || {} }; };
    const camila = pes('camila', { fases: { s1: ap('2026-10-12', { reunioes: 10, simulacoes: 3 }) }, medido: { demos: 16, clientes: 0, visitasBase: 0, prospeccao: 0, prospeccaoDias: [], semanas: [] } });
    const fabio = pes('fabio', { fases: { s1: ap('2026-10-12'), s23: ap('2026-10-26') }, medido: { demos: 17, clientes: 0, visitasBase: 6, prospeccao: 0, prospeccaoDias: [], semanas: [] } });
    const diego = pes('diego', { fases: { s1: ap('2026-10-13'), s23: { estendidaAte: '2026-11-06', motivo: 'faltam demos', realizado: {} } },
      medido: { demos: 9, clientes: 0, visitasBase: 0, prospeccao: 3, prospeccaoDias: ['2026-10-27', '2026-10-28'], semanas: [] } });
    const leandro = pes('leandro', { inicio: '2026-09-14', turma: '2026-09-14', dia: 48, fases: { s1: ap('2026-09-21'), s23: ap('2026-10-05'), s4: ap('2026-10-14') },
      medido: { demos: 18, clientes: 0, visitasBase: 13, prospeccao: 0, prospeccaoDias: [], semanas: [sem('2026-10-19', 20), sem('2026-10-26', 21)] } });
    GV2.rp.d = { hoje: '2026-10-31', pessoas: [camila, fabio, diego, leandro], lidoEm: '2026-10-31T11:00:00Z' };
    GV2.rp.em = Date.now(); GV2.rp.lendo = false; GV2.rp.erro = null; GV2.rp.equipe = [];
    const est = function (x) { return GV2.RP.fases.map(function (f, i) { const s = GV2.rpFase(x, i); return s.k + (s.k === 'off' ? '(' + (s.ant.k === 'cur' ? 'a partir ' + GV2.somaDias(s.ant.prazo, 1) : 'depois ' + s.ant.f.curto) + ')' : ''); }).join(' '); };
    checar('rampa · a fase sai das aprovações: S2–3 vencida sem aprovar trava as seguintes ("depois da S2–3")',
      est(camila) === 'ok av off(depois S2–3) off(depois S4)', est(camila));
    checar('rampa · S4 em curso até o dia 30 e a rua "a partir de" o dia seguinte',
      est(fabio) === 'ok ok cur off(a partir 2026-11-04)' && GV2.rpFase(fabio, 2).prazo === '2026-11-03', est(fabio));
    checar('rampa · fase estendida fica em curso até a nova data',
      GV2.rpFase(diego, 1).k === 'cur' && GV2.rpFase(diego, 1).estendida && GV2.rpFase(diego, 1).prazo === '2026-11-06', JSON.stringify(GV2.rpFase(diego, 1)));
    const D = GV2.rpD45(leandro);
    checar('rampa · dia 45 = dia 1 + 44; sem decisão depois dele é vencido',
      D.data === '2026-10-28' && D.vencida && GV2.rpD45(fabio).data === '2026-11-18' && !GV2.rpD45(fabio).vencida, JSON.stringify(D));
    checar('rampa · "estende" marca nova data e pede outra decisão nela',
      (function () { const y = pes('y', { decisao: { decisao: 'estende', novaData: '2026-11-13', plano: 'semana 1: 5 por dia' } }); const d = GV2.rpD45(y); return d.pendente && d.data === '2026-11-13' && !d.vencida; })());
    /* 02/11/26: o quadro da Rampa (render.rampa, rpQuadro, rpLinha, rpCelula, rpGav*, rpGrupos,
       rpSemanaItens, rpProsp) saiu como código morto — a aba saiu do menu em 01/11; fica o que o
       padrinho e o cadastro usam (rpLer, rpPessoas, rpFase, rpD45, rpComando, gravar) */
    checar('rampa · os dias de prospecção por extenso',
      GV2.rpDiasTxt(['2026-10-28', '2026-10-27']) === '27 e 28/10' && GV2.rpDiasTxt(['2026-10-30', '2026-11-02']) === '30/10 e 02/11');
    checar('rampa · a rua aprova com 6 por dia por 2 semanas seguidas (semanas inteiras)',
      GV2.rpRuaOk({ medido: { semanas: [sem('a', 30), sem('b', 31)] } }) && !GV2.rpRuaOk({ medido: { semanas: [sem('a', 29), sem('b', 31)] } })
        && !GV2.rpRuaOk({ medido: { semanas: [sem('a', 30), sem('b', 18, 3)] } }) && GV2.rpVisitasDia(leandro) === 4.2);
    /* gravar: aprovar exige evidência; sem bater a meta pede motivo; nada vai para o HubSpot */
    const gravou = [];
    global.supa.from = function (tab) { return { upsert: function (row, o) { gravou.push({ tab: tab, row: row, o: o }); return Promise.resolve({ error: null }); },
      update: function (row) { return { eq: function () { return { eq: function () { gravou.push({ tab: tab, row: row }); return Promise.resolve({ error: null }); } }; } }; } }; };
    GV2.estado.rpGav = { t: 'aprovar', pessoa: 'camila', fase: 's23' };
    GV2.estado.rpForm = { n_demoAprovada: '1' };
    await GV2.rpAprovar('camila', 's23');
    checar('rampa · aprovar sem evidência não grava', !gravou.length && /evidência/.test(GV2.estado.rpErro || ''), GV2.estado.rpErro);
    GV2.estado.rpForm = { n_demoAprovada: '1', evTipo: 'Gravação', evDet: 'demo de 23/10' };
    await GV2.rpAprovar('camila', 's23');
    checar('rampa · aprovar fora do prazo pede o motivo escrito', !gravou.length && /fora do prazo/.test(GV2.estado.rpErro || ''), GV2.estado.rpErro);
    GV2.estado.rpForm = { n_demoAprovada: '0', evTipo: 'Gravação', evDet: 'demo de 23/10', motivo: 'Bateu em 23/10; a aprovação ficou para depois.' };
    await GV2.rpAprovar('camila', 's23');
    checar('rampa · a contagem manual que não bate a meta também pede motivo (aqui ele existe e grava)', gravou.length === 1, GV2.estado.rpErro);
    const lin = gravou[0] && gravou[0].row;
    checar('rampa · a aprovação grava fase, data, quem, evidência e o realizado do momento em rampa_fases',
      gravou[0].tab === 'rampa_fases' && lin.fase === 's23' && lin.aprovada_em === '2026-10-31' && lin.evidencia === 'Gravação · demo de 23/10'
        && lin.realizado.demos === 16 && lin.realizado.demoAprovada === 0 && gravou[0].o.onConflict === 'pessoa,fase', JSON.stringify(gravou[0]));
    await new Promise(function (r) { setTimeout(r, 5); });
    gravou.length = 0;
    GV2.estado.rpForm = { d45: 'estende', texto: 'curto' };
    await GV2.rpDecidir('leandro');
    checar('rampa · estender no dia 45 pede o plano escrito', !gravou.length && /plano/.test(GV2.estado.rpErro || ''), GV2.estado.rpErro);
    GV2.estado.rpForm = { d45: 'estende', texto: 'Semana 1: 5 por dia, rota na véspera. Semana 2: 6 por dia.' };
    await GV2.rpDecidir('leandro');
    checar('rampa · "estende com plano" grava a decisão com nova data de 15 dias e o plano',
      gravou.length === 1 && gravou[0].tab === 'rampa_decisao_d45' && gravou[0].row.decisao === 'estende' && gravou[0].row.nova_data === '2026-11-15' && /Semana 1/.test(gravou[0].row.plano), JSON.stringify(gravou[0]));
    await new Promise(function (r) { setTimeout(r, 5); });
    checar('rampa · nenhuma escrita no HubSpot no módulo', !/hubapi|tarefaNoNegocio|cobrarNegocio\(/.test(codigo.slice(codigo.indexOf('GV2.RP = {'), codigo.indexOf('GV2.CB = {'))));
    global.supa.from = supaEra;
    Object.assign(GV2.rp, rpEra);
    GV2.estado.rpGav = null; GV2.estado.rpForm = null; GV2.estado.rpErro = null;
  }

  /* ── OS 7 COMBINADOS (handoff "Acelerar Field Sales v2", 2a–2c · 31/10/26): o semáforo só mostra,
     a ocorrência é do gestor, o degrau sai do histórico do mesmo combinado, registro falso é o 3. ── */
  {
    const cbEra = Object.assign({}, GV2.cb), supaEra = global.supa.from;
    const pessoa = function (id, ownerId, o) { return Object.assign({ pessoa: id, ownerId: ownerId, nome: 'Pessoa ' + id,
      visitas: { visitas: 41, provadas: 40, comPasso: 33, naHora: 34, divergencias: [] }, fichas: { donoAusente: 19, voltaMarcada: 9 },
      vespera: { dias: 5, planejados: 4, semPlano: ['2026-10-27'] },
      rituais: { umAUm: 0, ultimoUmAUm: '2026-10-14', fechoDias: [{ dia: '2026-10-30', fechou: false }], marcados: [
        { dia: '2026-10-26', ritual: 'daily', presente: true }, { dia: '2026-10-27', ritual: 'daily', presente: true }, { dia: '2026-10-26', ritual: 'simulacao', presente: true }, { dia: '2026-10-28', ritual: 'simulacao', presente: false }] },
      aceite: { versao: GV2.CB.versao, aceitoEm: '2026-10-05', registradoPor: 'Julyan' }, ocorrencias: [] }, o); };
    const bia = pessoa('bia', '1', { ocorrencias: [{ id: 'o1', combinado: 3, degrau: 1, dia: '2026-10-13', oQue: 'combinou ficha antes da próxima porta' }] });
    const rui = pessoa('rui', '2', { aceite: null, visitas: { visitas: 10, provadas: 9, comPasso: 10, naHora: 10, divergencias: [{ dia: '2026-10-27', nome: 'Bar do Zé', clientId: 'c9' }] } });
    GV2.cb.d = { segunda: '2026-10-26', sexta: '2026-10-30', ate: '2026-10-30', hoje: '2026-10-30', pessoas: [bia, rui], lidoEm: '2026-10-30T21:00:00Z' };
    GV2.cb.em = Date.now(); GV2.cb.lendo = false; GV2.cb.erro = null;
    /* gravar relê o quadro (cbLer): o supa falso devolve outra coisa, então o teste repõe o mundo antes do passo */
    const mundoCb = GV2.cb.d;
    const M = GV2.cbMedir(bia);
    checar('combinados · as 7 medidas e o semáforo (95 / 80): 98% verde, 80% e 83% âmbar, 47% vermelho, 0 divergência verde, 4 de 5 âmbar',
      M.map(function (m) { return m.val + ':' + m.k; }).join(' | ') === '98%:ok | 80%:av | 83%:av | 47%:erro | 0 divergências:ok | 4 de 5 dias:av | 3 de 6:erro'
        && M[3].como === 'dono ausente em 19 · volta marcada em 9', M.map(function (m) { return m.val + ':' + m.k; }).join(' | '));
    const R = GV2.cbRituais(bia);
    checar('combinados · rituais: daily e simulação só o que foi marcado; 1:1 e fecho da fonte',
      R.daily.feito === 2 && R.daily.total === 2 && R.sim.feito === 1 && R.sim.total === 2 && R.um.feito === 0 && R.fecho.total === 1 && R.feito === 3 && R.total === 6, JSON.stringify(R));
    checar('combinados · divergência na auditoria é vermelho na hora', GV2.cbMedir(rui)[4].k === 'erro' && GV2.cbMedir(rui)[4].curto === '1');
    /* G5 (auditoria 02/11/26): na segunda, com o último 1:1 há 4 dias, o 1:1 ainda não é devido (fora da
       conta, nada de "não houve"); na sexta (último dia útil) é. Feriado não entra nos rituais. */
    {
      const hojeEra = GV2.cb.d.hoje, ateEra = GV2.cb.d.ate;
      GV2.cb.d.hoje = '2026-10-26'; GV2.cb.d.ate = '2026-10-26';
      const cedo = pessoa('cedo', '1', { rituais: { umAUm: 0, ultimoUmAUm: '2026-10-22', fechoDias: [], marcados: [{ dia: '2026-10-26', ritual: 'daily', presente: true }] } });
      const Rc = GV2.cbRituais(cedo), hc = GV2.render.cbRituais(cedo);
      GV2.cb.d.hoje = hojeEra; GV2.cb.d.ate = ateEra;
      const fer = pessoa('fer', '1', { rituais: { umAUm: 1, ultimoUmAUm: '2026-10-28', fechoDias: [{ dia: '2026-11-02', fechou: false }], marcados: [{ dia: '2026-11-02', ritual: 'daily', presente: false }] } });
      const Rf = GV2.cbRituais(fer);
      checar('auditoria 02/11 · G5: na segunda o 1:1 não é cobrado (fora da conta, "até sex 30/10"), e feriado não conta daily nem fecho',
        Rc.um.total === 0 && !Rc.um.devido && Rc.total === 1 && hc.indexOf('não houve') < 0 && hc.indexOf('até sex 30/10') > 0 && Rf.daily.total === 0 && Rf.fecho.total === 0,
        JSON.stringify({ um: Rc.um, tot: Rc.total, fd: Rf.daily, ff: Rf.fecho }));
    }
    checar('combinados · o degrau sai do histórico do MESMO combinado; registro falso vai direto ao 3',
      GV2.cbDegrau(bia, 3, false) === 2 && GV2.cbDegrau(bia, 4, false) === 1 && GV2.cbDegrau(bia, 4, true) === 3
        && GV2.cbDegrau(pessoa('z', '3', { ocorrencias: [{ combinado: 3, degrau: 2, dia: '2026-10-20' }] }), 3, false) === 3
        && GV2.cbDegrau(pessoa('z', '3', { ocorrencias: [{ combinado: 3, degrau: 2, dia: '2026-06-01' }] }), 3, false) === 1);
    GV2.estado.pessoa = '1';
    const pag = GV2.render.cbPessoa(GV2.base.porId['1']);
    checar('combinados · 2a: a tabela, o aceite, os rituais e a sugestão do próximo degrau (o cockpit só sugere)',
      /Os 7 combinados de \S+ · semana 26 a 30\/10/.test(pag) && /quebrado/.test(pag) && /no combinado/.test(pag) && /aceito/.test(pag)
        && /Rituais da semana/.test(pag) && /Visita com o dono em 47% nesta semana\. Se registrar, é o degrau 1: conversa\./.test(pag)
        && /data-gv2="cb:ocor:bia:4"/.test(pag), pag.slice(0, 200));
    const time = GV2.render.cbTime();
    checar('combinados · 2c: a grade do time, o aceite pendente e a divergência com "Ver a auditoria"',
      /time: 86% das visitas com ficha na hora · dono ausente em 75% das portas/.test(time) && /is-av">pendente/.test(time)
        && /1 divergência na auditoria: visita de 27\/10 em Bar do Zé sem prova no endereço da ficha\. Se for registro falso, vai direto para a advertência\./.test(time)
        && /data-gv2="v5dia:2:2026-10-27">Ver a auditoria/.test(time), time.slice(0, 300));
    const itPauta = GV2.cbPautaItem(GV2.base.porId['2']);
    checar('combinados · a pauta do 1:1 ganha o aceite pendente no fim (os itens de antes não mudam); com o aceite em dia, não',
      itPauta && itPauta.rot === 'Os 7 combinados' && GV2.cbPautaItem(GV2.base.porId['1']) === null
        && /\{ rot: 'Tendência', tom: caiu \? 'erro' : 'mute', t: tend \}\n  \]\.concat\(GV2\.cbPautaItem && GV2\.cbPautaItem\(p\) \? \[GV2\.cbPautaItem\(p\)\] : \[\]\);/.test(codigo), JSON.stringify(itPauta));
    const gravou = [];
    global.supa.from = function (tab) { return { insert: function (row) { gravou.push({ tab: tab, row: row }); return Promise.resolve({ error: null }); } }; };
    GV2.estado.cbGav = { pessoa: 'bia', n: 3 }; GV2.estado.cbForm = { oQue: '7 de 41 visitas sem ficha antes da próxima porta.' };
    const dr = GV2.render.cbGav();
    checar('combinados · 2b: o drawer propõe o degrau 2 (plano escrito) com a conversa de 13/10 como feita',
      /Registrar plano escrito/.test(dr) && /13\/10 · Ficha na hora/.test(dr) && /este registro · prazo de 2 semanas/.test(dr), dr.slice(0, 200));
    await GV2.cbRegistrar('bia');
    checar('combinados · registrar grava a ocorrência com o degrau e o prazo de 2 semanas do plano escrito',
      gravou.length === 1 && gravou[0].tab === 'ocorrencias' && gravou[0].row.degrau === 2 && gravou[0].row.combinado === 3 && gravou[0].row.prazo === '2026-11-13' && !gravou[0].row.registro_falso, JSON.stringify(gravou));
    gravou.length = 0;
    GV2.estado.cbGav = { pessoa: 'rui', n: 5 }; GV2.estado.cbForm = { falso: true, oQue: 'Visita de 27/10 registrada sem ter acontecido.' };
    await GV2.cbRegistrar('rui');
    checar('combinados · registro falso grava direto no degrau 3', gravou.length === 1 && gravou[0].row.degrau === 3 && gravou[0].row.registro_falso === true, JSON.stringify(gravou));
    gravou.length = 0;
    GV2.cb.d = mundoCb; GV2.cb.em = Date.now(); GV2.cb.lendo = false;
    GV2.estado.cbGav = { pessoa: 'rui', n: 2 }; GV2.estado.cbForm = { oQue: '  ' };
    await GV2.cbRegistrar('rui');
    checar('combinados · sem escrever o que aconteceu, não grava', !gravou.length && /o que aconteceu/.test(GV2.estado.cbErro || ''), JSON.stringify({ g: gravou, e: GV2.estado.cbErro }));
    checar('combinados · nenhuma escrita no HubSpot no módulo', !/hubapi|tarefaNoNegocio|cobrarNegocio\(/.test(codigo.slice(codigo.indexOf('GV2.CB = {'), codigo.indexOf('GV2.cbPautaItem = function'))));
    global.supa.from = supaEra;
    Object.assign(GV2.cb, cbEra);
    GV2.estado.cbGav = null; GV2.estado.cbForm = null; GV2.estado.cbErro = null;
  }

  /* ── A HABILIDADE DO MÊS (handoff "Acelerar Field Sales v2", 3a–3c · 31/10/26): a sugestão é a maior
     distância para o time, a meta nasce na média do time, o veredito sai de antes, meta e agora. ── */
  {
    const hbEra = Object.assign({}, GV2.hb), supaEra = global.supa.from;
    const sem = function (o) { return Object.assign({ p: 0, f: 0, o: 0, m: 0, c: 0 }, o); };
    /* outubro: 80 visitas, 80 fichas, 20 com o dono (25%), 16 demos (20%), 4 clientes (25%) */
    const out = ['2026-10-06', '2026-10-14', '2026-10-21', '2026-10-28'].map(function (d) { return sem({ d: d, p: 20, f: 20, o: 5, m: 4, c: 1 }); });
    const bia = { pessoa: 'bia', ownerId: '1', nome: 'Bia Souza', emRampa: false, ultimoUmAUm: '2026-10-06',
      dias: out.concat([sem({ d: '2026-11-03', p: 10, f: 10, o: 3, m: 2 }), sem({ d: '2026-11-10', p: 10, f: 10, o: 4, m: 1, c: 1 }), sem({ d: '2026-11-16', p: 2, f: 2, o: 1 })]),
      habilidade: { taxa: 'dono', antes: 25, meta: 50, comoTreinar: 'Pedir o dono na primeira frase.', combinadaEm: '2026-11-02', combinadaPor: 'Julyan' }, habilidadeAnterior: null, habilidadeSeguinte: null };
    const rui = { pessoa: 'rui', ownerId: '2', nome: 'Rui Lima', emRampa: false, ultimoUmAUm: null, dias: out.slice(), habilidade: null, habilidadeAnterior: null, habilidadeSeguinte: null };
    const leo = { pessoa: 'leo', ownerId: '9', nome: 'Leo Novo', emRampa: true, dias: [], habilidade: null, habilidadeAnterior: null, habilidadeSeguinte: null };
    const mundo = function (hoje) {
      return { mes: '2026-11-01', anterior: '2026-10-01', fim: '2026-11-30', ate: hoje, hoje: hoje, gestor: true, ultimoUmAUmTime: '2026-10-14',
        time: { anterior: { p: 468, f: 393, o: 195, m: 98, c: 40, pessoas: 6 }, atual: { p: 200, f: 180, o: 90, m: 40, c: 15, pessoas: 6 } },
        pessoas: [bia, rui, leo], lidoEm: '2026-11-16T13:55:00Z' };
    };
    const por = function (d) { GV2.hb.d = d; GV2.hb.em = Date.now(); GV2.hb.lendo = false; GV2.hb.erro = null; };
    por(mundo('2026-11-16'));
    checar('habilidade · as 4 taxas de outubro e as do time (soma ÷ soma; volume por pessoa e por semana de 5 dias úteis)',
      GV2.hbDaPessoa(bia, 'dono', 'anterior').v === 25 && GV2.hbDaPessoa(bia, 'demo', 'anterior').v === 20 && GV2.hbDaPessoa(bia, 'fechar', 'anterior').v === 25 && GV2.hbDaPessoa(bia, 'volume', 'anterior').v === 19
        && GV2.hbDoTime('dono', 'anterior').v === 50 && GV2.hbDoTime('demo', 'anterior').v === 21 && GV2.hbDoTime('fechar', 'anterior').v === 41 && GV2.hbDoTime('volume', 'anterior').v === 19 /* 01/11/26: outubro tem 21 dias úteis (12/10 é feriado), não 22 */,
      JSON.stringify(GV2.HB.taxas.map(function (t) { return [GV2.hbDaPessoa(bia, t.k, 'anterior').v, GV2.hbDoTime(t.k, 'anterior').v]; })));
    checar('habilidade · a sugestão é a maior distância para o time (sair com o dono: 25% contra 50%)', GV2.hbSugestao(bia, 'anterior') === 'dono');
    const ana = Object.assign({}, rui, { pessoa: 'ana', dias: out.map(function (d) { return Object.assign({}, d, { o: 15, m: 6, c: 4 }); }) });
    const sa = GV2.hbSugestaoInfo(ana, 'anterior');
    checar('habilidade · quem está acima do time em tudo recebe a taxa mais perto do time (volume, empatado)', sa && sa.k === 'volume' && sa.dist === 0, JSON.stringify(sa));
    const ss = GV2.hbSemanas(bia, 'dono', 'anterior');
    checar('habilidade · outubro semana a semana, cortado nas bordas do mês',
      ss.map(function (s) { return s.rot; }).join() === '01 a 02/10,05 a 09/10,12 a 16/10,19 a 23/10,26 a 30/10' && ss[1].val.v === 25 && ss[0].val.v === null, JSON.stringify(ss.map(function (s) { return [s.rot, s.val.v]; })));
    const H = { meta: 50, antes: 25 };
    checar('habilidade · veredito: bateu a meta = melhorou; passou do antes = subiu, não bateu; senão, não melhorou',
      GV2.hbVeredito(H, 50).k === 'melhorou' && GV2.hbVeredito(H, 36).k === 'subiu' && GV2.hbVeredito(H, 25).k === 'nao_melhorou' && GV2.hbVeredito(H, null) === null);
    GV2.estado.hbForm = null; GV2.estado.hbEditar = null;
    const esc = GV2.render.hbPessoa(GV2.base.porId['2']);
    checar('habilidade · 3a: sem habilidade, a escolha com a sugestão marcada, a meta na média do time e o alerta do 1:1',
      /Habilidade de novembro/.test(esc) && /sugerida · maior distância/.test(esc) && /50% · a média do time em outubro/.test(esc) && /Combinar no 1:1/.test(esc)
        && /Último 1:1 de Rui: nenhum\. Do time: 14\/10\. A habilidade só vale se for combinada no 1:1\./.test(esc) && /Sair com o dono · outubro/.test(esc), esc.slice(0, 300));
    const res = GV2.render.hbPessoa(GV2.base.porId['1']);
    checar('habilidade · 3a combinada: antes 25%, meta 50% e agora 36% (âmbar: subiu, não bateu), semana a semana de novembro',
      /Sair com o dono/.test(res) && /combinada em 02\/11 · treino: Pedir o dono na primeira frase\./.test(res) && />25%</.test(res) && />50%</.test(res) && /class="num t-av">36%</.test(res) && /<b>02 a 06\/11<\/b>/.test(res) && /<b>16\/11<\/b>/.test(res), res.slice(0, 300));
    checar('habilidade · quem está em rampa não tem o cartão', GV2.render.hbPessoa({ id: '9', nome: 'Leo Novo' }) === '');
    const pi = GV2.hbPautaItem(GV2.base.porId['1']), pr = GV2.hbPautaItem(GV2.base.porId['2']);
    checar('habilidade · 3b: a linha da pauta com agora, meta e antes; sem habilidade, pede para escolher; a linha entra no TOPO',
      pi && pi.rot === 'Habilidade do mês' && /sair com o dono · agora 36% de 50% \(antes 25%\)/.test(pi.t) && pr && /Ainda sem a habilidade de novembro: escolher juntos \(sugerida: sair com o dono\)/.test(pr.t)
        && /const it = GV2\.hbPautaItem\(p\); if \(it\) itens\.unshift\(it\);/.test(codigo), JSON.stringify([pi, pr]));
    checar('habilidade · 3c fica fora do meio do mês', GV2.render.hbTime() === '');
    const g = [];
    GV2.hbGrupos(g, GV2.base, function (p, s, a) { return { n: p.nome, s: s, a: a }; });
    checar('habilidade · "Quem precisa de você": passou do dia 5 sem habilidade (quem está em rampa não entra)',
      g.length === 1 && g[0].k === 'hbdef' && g[0].chips.length === 1 && g[0].chips[0].s === 'sem habilidade de novembro' && g[0].chips[0].a === 'v8pagina:2', JSON.stringify(g));
    por(mundo('2026-11-26'));
    const fim = GV2.render.hbTime();
    checar('habilidade · 3c na última semana: o veredito, "Mudar o plano", "Definir para dezembro" e a rampa fora',
      /Novembro até 26\/11 · 0 de 1 bateu a meta/.test(fim) && /subiu, não bateu/.test(fim) && /data-gv2="hb:fim:bia:plano">Mudar o plano/.test(fim)
        && /data-gv2="hb:fim:rui:definir">Definir para dezembro/.test(fim) && /na rampa · não entra/.test(fim), fim.slice(0, 400));
    const gravou = [];
    global.supa.from = function (tab) { return {
      upsert: function (row, o) { gravou.push({ tab: tab, row: row, o: o }); return Promise.resolve({ error: null }); },
      update: function (row) { return { eq: function (k1, v1) { return { eq: function (k2, v2) { gravou.push({ tab: tab, upd: row, onde: [v1, v2] }); return Promise.resolve({ error: null }); } }; } }; } }; };
    GV2.hbComando('hb', ['hb', 'fim', 'bia', 'plano']);
    const dr = GV2.render.hbGav();
    checar('habilidade · 3c "Mudar o plano": o drawer começa na mesma habilidade, com o veredito do mês',
      GV2.estado.hbGav && GV2.estado.hbGav.veredito === 'subiu' && GV2.estado.hbForm.taxa === 'dono' && /Mudar o plano/.test(dr) && /Combinar para dezembro/.test(dr) && /aria-checked="true" class="gv2-rp-radio is-on" data-gv2="hb:taxa:bia:2026-12-01:dono"/.test(dr), dr.slice(0, 300));
    const mundoFim = GV2.hb.d;
    await GV2.hbCombinar('bia', '2026-12-01');
    checar('habilidade · combinar grava dezembro (antes = novembro, meta = média do time) e o veredito de novembro, sem HubSpot',
      gravou.length === 2 && gravou[0].tab === 'habilidades_mes' && gravou[0].row.mes === '2026-12-01' && gravou[0].row.taxa === 'dono' && gravou[0].row.antes === 36 && gravou[0].row.meta === 50
        && gravou[0].o.onConflict === 'pessoa,mes' && gravou[1].upd.veredito === 'subiu' && gravou[1].upd.veredito_valor === 36 && gravou[1].onde.join() === 'bia,2026-11-01' && !GV2.estado.hbGav, JSON.stringify(gravou));
    por(mundoFim);
    checar('habilidade · nenhuma escrita no HubSpot no módulo', !/hubapi|tarefaNoNegocio|cobrarNegocio\(/.test(codigo.slice(codigo.indexOf('GV2.HB = {'), codigo.indexOf('GV2.hbComando = function'))));
    global.supa.from = supaEra;
    Object.assign(GV2.hb, hbEra);
    GV2.estado.hbGav = null; GV2.estado.hbForm = null; GV2.estado.hbErro = null; GV2.estado.hbEditar = null;
  }

  /* ── RECONHECIMENTO E DISPUTA (handoff "Acelerar Field Sales v2", 4a–4b · 01/11/26): por praça, uma por
     vez, até 2 semanas, o traço é onde a praça começou, o selo só com a auditoria da sexta. ── */
  {
    const rcEra = Object.assign({}, GV2.rc), supaEra = global.supa.from, rcLerEra = GV2.rcLer;
    const dd = function (d, v, nh) { return { d: d, v: v, p: v, cp: v, nh: nh, f: v, o: 0, m: 0 }; };
    const pessoas = [
      { pessoa: 'ana', ownerId: '1', nome: 'Ana Lima', emRampa: false, dias: [dd('2026-11-02', 20, 8), dd('2026-11-10', 10, 6), dd('2026-11-12', 10, 8)] },
      { pessoa: 'bia', ownerId: '2', nome: 'Bia Souza', emRampa: false, dias: [dd('2026-11-03', 10, 5), dd('2026-11-11', 10, 5)] },
      { pessoa: 'caio', ownerId: '3', nome: 'Caio', emRampa: false, dias: [dd('2026-11-04', 10, 2), dd('2026-11-10', 10, 3)] },
      { pessoa: 'leo', ownerId: '1', nome: 'Leo Novo', emRampa: true, dias: [dd('2026-11-10', 50, 50)] }
    ];
    const disputa = { id: 'd1', nome: 'Ficha antes da próxima porta', taxa: 'naHora', times: 'praca', inicio: '2026-11-09', fim: '2026-11-20' };
    const por = function (hoje, aud) {
      GV2.rc.d = { hoje: hoje, de: '2026-10-01', disputas: [disputa], auditorias: aud || [], pessoas: pessoas, lidoEm: hoje + 'T15:00:00Z' };
      GV2.rc.em = Date.now(); GV2.rc.lendo = false; GV2.rc.erro = null;
    };
    por('2026-11-12');
    const praca3 = GV2.base.porId['3'] && GV2.base.porId['3'].praca;
    const L = GV2.rcPlacar(disputa), vit = L.find(function (l) { return l.praca === 'Vitória'; }), rio = L.find(function (l) { return l.praca === praca3; });
    /* 01/11/26: os novatos entram na disputa (Julyan) — o Leo, em rampa, soma no time de Vitória */
    checar('disputa · placar por praça: o valor da disputa, onde começou (14 dias antes) e o último dia; quem está em rampa entra no time',
      vit && vit.n === 3 && vit.v === 86 && vit.ini === 43 && vit.hoje === 80 && rio && rio.v === 30 && rio.ini === 20, JSON.stringify(L));
    checar('disputa · lidera quem mais subiu desde o começo (Vitória +43 contra +10)', vit.lidera === true && rio.lidera === false);
    /* a taxa "passo" é passo cumprido ÷ passo vencido (0238), não visita com passo ÷ visita */
    const dpassos = { id: 'd2', nome: 'Passo cumprido', taxa: 'passo', times: 'praca', inicio: '2026-11-09', fim: '2026-11-20' };
    const pesEra = pessoas.slice();
    pessoas.length = 0;
    pessoas.push({ pessoa: 'ana', ownerId: '1', nome: 'Ana Lima', emRampa: false, dias: [{ d: '2026-11-10', v: 10, p: 10, cp: 10, nh: 10, f: 10, o: 0, m: 0, pv: 4, pc: 3 }] });
    por('2026-11-12');
    checar('disputa · a taxa do passo é passos cumpridos ÷ passos que venceram', GV2.rcValor('passo', pessoas, '2026-11-09', '2026-11-12') === 75 && /passos cumpridos até o dia seguinte ÷ passos que venceram/.test(GV2.rcTaxaDef('passo').como));
    pessoas.length = 0; pesEra.forEach(function (x) { pessoas.push(x); });
    por('2026-11-12');
    const c1 = GV2.render.rcDisputa();
    checar('disputa · 4a: nome, período, faltam dias úteis, traço do começo e a primeira auditoria na sexta',
      /Disputa da vez · 09\/11 a 20\/11/.test(c1) && /Ficha antes da próxima porta/.test(c1) && /faltam 5 dias úteis/.test(c1) /* 20/11 é feriado */ && /começou em 43%/.test(c1)
        && /is-ok">lidera/.test(c1) && /A primeira auditoria é na sexta 13\/11/.test(c1), c1.slice(0, 400));
    por('2026-11-14');
    const c2 = GV2.render.rcDisputa();
    checar('disputa · sem a auditoria da sexta, "Não auditado" e o botão para registrar',
      /Não auditado: a sexta 13\/11 ainda não foi conferida/.test(c2) && /data-gv2="rc:auditar:2026-11-09">Registrar a auditoria/.test(c2), c2.slice(0, 300));
    por('2026-11-14', [{ segunda: '2026-11-09', em: '2026-11-13T20:00:00Z', por: 'Julyan', nota: '3 fichas corrigidas' }]);
    const c3 = GV2.render.rcDisputa();
    checar('disputa · com a auditoria, o selo "Auditado na sexta"', /Auditado na sexta 13\/11 · 13\/11 \d\d:00 · 3 fichas corrigidas/.test(c3) && !/Registrar a auditoria/.test(c3), c3.slice(0, 300));
    por('2026-11-12');
    checar('disputa · 4b: uma por vez, até 2 semanas, nada no passado',
      /Uma por vez/.test(GV2.rcValidar({ nome: 'Outra', taxa: 'dono', inicio: '2026-11-16', fim: '2026-11-27' }) || '')
        && /Até 2 semanas/.test(GV2.rcValidar({ nome: 'Outra', taxa: 'dono', inicio: '2026-11-23', fim: '2026-12-09' }) || '')
        && /passado/.test(GV2.rcValidar({ nome: 'Outra', taxa: 'dono', inicio: '2026-11-02', fim: '2026-11-06' }) || '')
        && GV2.rcValidar({ nome: 'Outra', taxa: 'dono', inicio: '2026-11-23', fim: '2026-12-04' }) === null);
    const P = GV2.rcNovaPadrao();
    checar('disputa · a nova começa na segunda depois da atual e dura 2 semanas', P.inicio === '2026-11-23' && P.fim === '2026-12-04', JSON.stringify(P));
    GV2.estado.rcGav = { t: 'nova' }; GV2.estado.rcForm = { nome: 'Sair com o dono' };
    const dr = GV2.render.rcGav();
    checar('disputa · 4b: o drawer com a regra "uma por vez", o comportamento, os times por praça e as regras',
      /a atual termina sex 20\/11/.test(dr) && /Ficha na hora · fichas em até 15 min ÷ visitas/.test(dr) && /Por praça · /.test(dr) && /nunca individual/.test(dr) && /Agendar disputa/.test(dr), dr.slice(0, 300));
    const gravou = [];
    global.supa.from = function (tab) { return { insert: function (row) { gravou.push({ tab: tab, row: row }); return Promise.resolve({ error: null }); },
      upsert: function (row, o) { gravou.push({ tab: tab, row: row, o: o }); return Promise.resolve({ error: null }); } }; };
    GV2.rcLer = function () {};
    await GV2.rcAgendar();
    checar('disputa · agendar grava a disputa por praça com as datas, sem HubSpot',
      gravou.length === 1 && gravou[0].tab === 'disputas' && gravou[0].row.taxa === 'naHora' && gravou[0].row.inicio === '2026-11-23' && gravou[0].row.fim === '2026-12-04' && gravou[0].row.times === 'praca' && !GV2.estado.rcGav, JSON.stringify(gravou));
    gravou.length = 0;
    GV2.estado.rcForm = { nota: '3 fichas corrigidas' };
    await GV2.rcAuditou('2026-11-09');
    checar('auditoria · registrar grava a semana, quem e o que foi corrigido', gravou.length === 1 && gravou[0].tab === 'auditorias_semana' && gravou[0].row.segunda === '2026-11-09' && gravou[0].row.nota === '3 fichas corrigidas' && gravou[0].o.onConflict === 'segunda', JSON.stringify(gravou));
    /* previsão honesta: demo sem chance dita entra com a conversão do mês anterior */
    GV2.rc.pv = { mes: '2026-11-01', anterior: '2026-10-01', hoje: '2026-11-12', convAnterior: 40, lidoEm: '2026-11-12T15:00:00Z',
      time: { demos: 10, ditas: 4, somaDita: 240, fecharam: 3 },
      pessoas: [{ ownerId: '1', emRampa: false, demos: 6, ditas: 4, somaDita: 240, fecharam: 2 }, { ownerId: '3', emRampa: false, demos: 4, ditas: 0, somaDita: 0, fecharam: 1 }] };
    GV2.rc.pvAnt = null;
    const pv = GV2.render.rcPrevisao();
    checar('previsão · 4a: o time disse 48% (4 ditas + 6 com 40%), fechou 30%, 18 pts; a praça mais perto',
      /O time disse 48%\. Fechou 30%\./.test(pv) && />18 pts</.test(pv) && /4 de 10 demos com a chance dita; as outras entram com 40%/.test(pv)
        && /disse 53% · fechou 33%/.test(pv) && /disse 40% · fechou 25%/.test(pv) && /15 pts<\/b><span class="gv2-rp-chip is-ok">mais perto/.test(pv), pv.slice(0, 400));
    GV2.rc.pv.time = { demos: 2, ditas: 0, somaDita: 0, fecharam: 0 };
    GV2.rc.pvAnt = { mes: '2026-10-01', anterior: '2026-09-01', hoje: '2026-11-12', convAnterior: 43, time: { demos: 96, ditas: 0, somaDita: 0, fecharam: 39 }, pessoas: [] };
    const pv2 = GV2.render.rcPrevisao();
    checar('previsão · com menos de 5 demos no mês, mostra o mês anterior fechado e avisa que ninguém disse a chance',
      /Previsão honesta · outubro fechado/.test(pv2) && /Ninguém disse a chance ainda: as 96 demos entram com a conversão do time em setembro \(43%\)/.test(pv2), pv2.slice(0, 400));
    /* reconhecimento da sexta: um destaque por combinado */
    const pc = function (id, ownerId, nome, o) { return Object.assign({ pessoa: id, ownerId: ownerId, nome: nome,
      visitas: { visitas: 20, provadas: 18, comPasso: 18, naHora: 18, divergencias: [] }, fichas: { donoAusente: 5, voltaMarcada: 4 },
      vespera: { dias: 5, planejados: 5, semPlano: [] }, rituais: { umAUm: 1, ultimoUmAUm: '2026-11-03', fechoDias: [{ dia: '2026-11-03', fechou: true }], marcados: [] },
      aceite: null, ocorrencias: [] }, o); };
    const seg = GV2.rcSemanaRec();
    GV2.rc.cb[seg] = { d: { segunda: seg, sexta: GV2.somaDias(seg, 4), ate: GV2.somaDias(seg, 4), pessoas: [
      pc('ana', '1', 'Ana Lima', { visitas: { visitas: 20, provadas: 20, comPasso: 18, naHora: 19, divergencias: [] } }),
      pc('bia', '2', 'Bia Souza', { vespera: { dias: 5, planejados: 3, semPlano: [] }, visitas: { visitas: 20, provadas: 18, comPasso: 18, naHora: 18, divergencias: [{ dia: seg }] } })] } };
    const D = GV2.rcDestaques(GV2.rc.cb[seg].d);
    checar('reconhecimento · um destaque por combinado: o melhor (empate fica junto), quem não teve divergência, rota na véspera',
      D.length === 7 && D[0].quem === 'Ana' && D[0].s === '20 de 20 visitas com prova' && /Ana e Bia/.test(D[1].quem) && D[4].quem === '1 de 2' && D[5].quem === '1 pessoa', JSON.stringify(D));
    const rec = GV2.render.rcReconhecer();
    checar('reconhecimento · 4a: "Apresentar" abre o modo apresentação na tela nova; "Levar para a daily"; sem auditoria, avisa',
      /Um destaque por combinado/.test(rec) && /data-gv2="ap:abrir:4">Apresentar/.test(rec) && /Levar para a daily/.test(rec) && /não auditado/.test(rec), rec.slice(0, 300));
    checar('reconhecimento · o modo apresentação ganha a 5ª tela, no fim (as 4 de antes não mudam)',
      GV2.V8AP_N === 5 && /Reconhecimento da semana/.test(GV2.v8apReconhecer()) && /const telas = \[GV2\.v8apMes, GV2\.v8apPlacar, GV2\.v8apFunil, GV2\.v8apPlanejar, GV2\.v8apReconhecer\];/.test(codigo));
    checar('reconhecimento · o texto da daily leva cada destaque', /A porta é provada: Ana \(20 de 20 visitas com prova\)/.test(GV2.rcTextoDaily(seg, D)));
    checar('reconhecimento · nenhuma escrita no HubSpot no módulo', !/hubapi|tarefaNoNegocio|cobrarNegocio\(/.test(codigo.slice(codigo.indexOf('GV2.RC = {'), codigo.indexOf('GV2.rcComando = function'))));
    global.supa.from = supaEra;
    GV2.rcLer = rcLerEra;
    Object.assign(GV2.rc, rcEra);
    GV2.estado.rcGav = null; GV2.estado.rcForm = null; GV2.estado.rcErro = null;
  }

  /* ── PADRINHO E LÍDER DE PRAÇA (handoff "Acelerar Field Sales v2", 5a–5b · 01/11/26): os 4 critérios do
     Playbook, os afilhados com o estado da Rampa e o padrinho natural da próxima turma. ── */
  {
    const ldEra = Object.assign({}, GV2.ld), rpEra = Object.assign({}, GV2.rp), supaEra = global.supa.from, ldLerEra = GV2.ldLer, rpLerEra = GV2.rpLer;
    const mes = function (m, n) { return { mes: m, provadas: n }; };
    const formado = { pessoa: 'igor', nome: 'Igor Santana', inicio: '2026-08-03', turma: '2026-08-03', encerradaEm: null,
      fases: { s1: { aprovadaEm: '2026-08-09' }, s23: { aprovadaEm: '2026-08-22' }, s4: { aprovadaEm: '2026-08-31' }, rua: { aprovadaEm: '2026-09-25' } }, decisao: { decisao: 'avanca' } };
    const atrasada = { pessoa: 'camila', nome: 'Camila Reis', inicio: '2026-10-05', turma: '2026-10-05', encerradaEm: null, fases: { s1: { aprovadaEm: '2026-10-10' } }, decisao: null };
    GV2.ld.d = { hoje: '2026-11-12', mes: '2026-11-01', de: '2026-08-01', lidoEm: '2026-11-12T15:00:00Z', pessoas: [
      { pessoa: 'ana', ownerId: '1', nome: 'Ana Lima', emRampa: false, meses: [mes('2026-08-01', 130), mes('2026-09-01', 140), mes('2026-10-01', 120), mes('2026-11-01', 40)], conv: { demos: 30, clientes: 12 }, registro: { n: 0, ultima: null }, afilhados: [formado, atrasada] },
      { pessoa: 'bia', ownerId: '2', nome: 'Bia Souza', emRampa: false, meses: [mes('2026-08-01', 130), mes('2026-09-01', 140), mes('2026-10-01', 135), mes('2026-11-01', 30)], conv: { demos: 20, clientes: 6 }, registro: { n: 1, ultima: '2026-11-06' }, afilhados: [] },
      { pessoa: 'caio', ownerId: '3', nome: 'Caio Prado', emRampa: false, meses: [mes('2026-08-01', 0), mes('2026-09-01', 0), mes('2026-10-01', 0), mes('2026-11-01', 0)], conv: { demos: 5, clientes: 3 }, registro: { n: 0, ultima: null }, afilhados: [] },
      { pessoa: 'leo', ownerId: '1', nome: 'Leo Novo', emRampa: true, meses: [], conv: { demos: 0, clientes: 0 }, registro: { n: 0 }, afilhados: [] }] };
    GV2.ld.em = Date.now(); GV2.ld.lendo = false; GV2.ld.erro = null; GV2.ldLer = function () {};
    GV2.rp.d = { hoje: '2026-11-12', lidoEm: '2026-11-12T15:00:00Z', pessoas: [{ pessoa: 'zed', nome: 'Zed Novo', inicio: '2026-11-09', turma: '2026-11-09', dia: 4, padrinho: null, fases: {}, medido: {} },
      { pessoa: 'camila', nome: 'Camila Reis', inicio: '2026-10-05', turma: '2026-10-05', dia: 39, padrinho: 'ana', fases: {}, medido: {} }] };
    GV2.rp.em = Date.now(); GV2.rp.lendo = false; GV2.rpLer = function () {};
    const ana = GV2.ld.d.pessoas[0], bia = GV2.ld.d.pessoas[1], caio = GV2.ld.d.pessoas[2];
    const R = GV2.ldRitmo(ana);
    /* 01/11/26: o dia útil não conta feriado; outubro (12/10) tem 21 dias, e a mesma fixture dá 5,7 em vez de 5,5 */
    checar('líder · 3 meses no ritmo: 6 visitas com prova por dia útil nos 3 meses fechados (outubro em 5,7 falta)',
      R.n === 2 && !R.ok && R.sub === 'outubro ficou em 5,7 visitas/dia' && R.chip === 'falta 1 mês' && GV2.ldRitmo(bia).ok === true, JSON.stringify(R));
    checar('líder · demo vira cliente contra o time (soma ÷ soma, sem a rampa); com menos de 10 demos, amostra pequena',
      GV2.ldConvTime() === 38 && GV2.ldConv(ana).ok && GV2.ldConv(ana).val === '40%' && !GV2.ldConv(bia).ok && GV2.ldConv(caio).pequena === true, JSON.stringify([GV2.ldConvTime(), GV2.ldConv(ana), GV2.ldConv(caio)]));
    checar('líder · registro: ocorrência do combinado 5 ou de registro falso tira o critério', GV2.ldRegistro(ana).ok && !GV2.ldRegistro(bia).ok && GV2.ldRegistro(bia).chip === 'em análise');
    const eF = GV2.ldAfilhado(formado), eA = GV2.ldAfilhado(atrasada);
    checar('padrinho · o afilhado com as regras da Rampa: formado no prazo (54 dias) e S2–3 com aprovação atrasada',
      eF.bem === true && /4 fases em 54 dias/.test(eF.s) && eA.chip[0] === 'aprovação atrasada' && /dia 39 · S2–3 venceu 25\/10/.test(eA.s) && GV2.ldTurma(ana).ok && GV2.ldTurma(ana).val === 'Igor', JSON.stringify([eF, eA]));
    checar('líder · Ana cumpre 3 de 4; Bia e Caio, 1 de 4', GV2.ldCriterios(ana).n === 3 && GV2.ldCriterios(bia).n === 1 && GV2.ldCriterios(caio).n === 1);
    const pag = GV2.render.ldPessoa(GV2.base.porId['1']);
    checar('líder · 5a: "Padrinho de" com os afilhados e "Rumo a líder de praça" com 3 de 4 e o chip de cada critério',
      /Padrinho de/.test(pag) && /Igor Santana/.test(pag) && /is-ok">formado/.test(pag) && /is-av">aprovação atrasada/.test(pag)
        && /Rumo a líder de praça/.test(pag) && />3 de 4</.test(pag) && /falta 1 mês/.test(pag) && !/aba:rampa/.test(pag) /* a aba Rampa saiu (01/11/26) */, pag.slice(0, 300));
    checar('líder · quem está em rampa não tem os cartões', GV2.render.ldPessoa({ id: '9' }) === '' || !/Leo/.test(GV2.render.ldPessoa({ id: '9' })));
    const tab = GV2.render.ldTime();
    checar('líder · 5b: a tabela dos plenos (a rampa fora), "time 38%", e o padrinho natural: quem cumpre mais e não tem afilhado em curso',
      /Próximo líder de praça/.test(tab) && /time 38%/.test(tab) && !/Leo/.test(tab) && tab.indexOf('>Ana<') < tab.indexOf('>Bia<')
        && /Bia e Caio cumprem 1 de 4 e não têm afilhado em curso: são os padrinhos naturais da próxima turma\./.test(tab) && /data-gv2="ld:indicar:bia">Indicar Bia/.test(tab) && /data-gv2="ld:indicar:caio">Indicar Caio/.test(tab)
        && tab.indexOf('gv2-ld-nat') > tab.indexOf('>Caio<')
        && /Camila · S2–3 atrasada/.test(tab) && /amostra pequena/.test(tab) && /em análise/.test(tab), tab.slice(0, 400));
    GV2.ldComando('ld', ['ld', 'indicar', 'bia']);
    const dr = GV2.render.ldGav();
    checar('padrinho · "Indicar padrinho" lista só quem está na Rampa sem padrinho', /Zed Novo/.test(dr) && !/Camila/.test(dr) && /data-gv2="ld:padrinho:bia:zed">Indicar Bia/.test(dr), dr.slice(0, 300));
    const gravou = [];
    global.supa.from = function (tab2) { return { update: function (row) { return { eq: function (k, v) { gravou.push({ tab: tab2, row: row, onde: [k, v] }); return Promise.resolve({ error: null }); } }; } }; };
    await GV2.ldIndicar('bia', 'zed');
    checar('padrinho · indicar grava o padrinho em rampa_pessoas, sem HubSpot',
      gravou.length === 1 && gravou[0].tab === 'rampa_pessoas' && gravou[0].row.padrinho === 'bia' && gravou[0].onde.join() === 'pessoa,zed' && !GV2.estado.ldGav, JSON.stringify(gravou));
    checar('padrinho e líder · nenhuma escrita no HubSpot no módulo', !/hubapi|tarefaNoNegocio|cobrarNegocio\(/.test(codigo.slice(codigo.indexOf('GV2.LD = {'), codigo.indexOf('GV2.ldComando = function'))));
    global.supa.from = supaEra;
    GV2.ldLer = ldLerEra; GV2.rpLer = rpLerEra;
    Object.assign(GV2.ld, ldEra); Object.assign(GV2.rp, rpEra);
    GV2.estado.ldGav = null; GV2.estado.ldErro = null;
  }

  /* ── O CLIENTE QUE FICA (handoff "Acelerar Field Sales v2", 6a · 01/11/26): quem vendeu e quem ficou,
     cruzado pelo CNPJ; ativo = pagando há até 35 dias; uso real = comanda em 20 de 30 dias; comissão
     em duas partes desligada pela chave. ── */
  {
    const cfEra = Object.assign({}, GV2.cf), dataEra = global.DATA.clienteQueFica, cfLerEra = GV2.cfLer;
    const ven = function (id, owner, cnpj, fechou) { return { id: id, nome: 'Venda ' + id, ownerId: owner, fechou: fechou || '2026-08-10', cnpj: cnpj, mrr: 300 }; };
    global.DATA.clienteQueFica = { de: '2026-05-05', ate: '2026-09-02', dias: 60, lidoEm: '2026-11-01T10:00:00Z', vendas: [
      ven('a1', '1', '111'), ven('a2', '1', '112'), ven('a3', '1', '113'), ven('a4', '1', '114'),
      ven('b1', '2', '211'), ven('b2', '2', '212'), ven('b3', '2', null),
      ven('x1', '999', '911') ] };
    const cs = function (id, sit, cob, dias, etapa) { return { id: id, achou: true, situacao: sit, etapa: etapa || 'Saudável', ultimaCobranca: cob, diasComanda: dias }; };
    GV2.cf.d = { hoje: '2026-11-01', fotoDesde: '2026-09-27', lidoEm: '2026-11-01T10:05:00Z', vendas: [
      cs('a1', 'ativo', '2026-10-20', 25), cs('a2', 'ativo', '2026-10-28', 22), cs('a3', 'em_risco', '2026-10-10', 21), cs('a4', 'ativo', '2026-10-15', 9),
      cs('b1', 'ex', '2026-08-13', 0, 'Churn'), cs('b2', 'ativo', '2026-08-31', 26), { id: 'b3', achou: false },
      cs('x1', 'ativo', '2026-10-30', 30)] };
    GV2.cf.em = Date.now(); GV2.cf.lendo = false; GV2.cf.erro = null;
    GV2.cf.chave = global.DATA.clienteQueFica.lidoEm + ':' + global.DATA.clienteQueFica.vendas.length;
    GV2.cfLer = function () {};
    const L = GV2.cfLinhas(), por = {};
    L.forEach(function (l) { por[l.v.id] = l; });
    checar('cliente que fica · ativo = na carteira e cobrança há até 35 dias; uso real = comanda em 20 de 30',
      por.a1.ativo && por.a1.uso && por.a3.uso && por.a4.ativo && !por.a4.uso && !por.b1.ativo && !por.b2.ativo && !por.b3.achou && !por.b3.ativo, JSON.stringify(L.map(function (l) { return [l.v.id, l.ativo, l.uso]; })));
    const G = GV2.cfGrupos(L);
    checar('cliente que fica · por executivo, com quem saiu do time numa linha só no fim',
      G.length === 3 && G[0].o === '1' && G[0].n === 4 && G[0].ativos === 4 && G[0].uso === 3 && G[0].pct === 75 && G[1].o === '2' && G[1].pct === 0 && G[2].nome === 'Quem saiu do time' && G[2].pct === 100, JSON.stringify(G.map(function (g) { return [g.o, g.n, g.ativos, g.uso, g.pct]; })));
    const sessEra = global.sessaoAtual;
    global.sessaoAtual = Object.assign({}, sessEra || {}, { ownerId: '999' });
    const G2 = GV2.cfGrupos(L);
    global.sessaoAtual = sessEra;
    checar('cliente que fica · a venda do gestor logado tem linha própria, não vai para quem saiu', G2[2].o === 'eu' && G2[2].nome === 'Você (gestor)' && G2.length === 3, JSON.stringify(G2.map(function (g) { return g.o; })));
    checar('cliente que fica · o sinal: 75% fica, 50 a 74% atenção, abaixo de 50% não fica',
      GV2.cfSinal(75).t === 'fica' && GV2.cfSinal(74).t === 'atenção' && GV2.cfSinal(50).k === 'av' && GV2.cfSinal(49).t === 'não fica');
    GV2.estado.cfAberto = '2';
    const h = GV2.render.cfTime();
    checar('cliente que fica · 6a: o cartão com a janela de vendas, o total do time, as vendas de cada um ao tocar e a regra escrita',
      /O cliente que fica · vendas de 05\/05 a 02\/09/.test(h) && /time: 8 vendidos, 4 com uso real hoje \(50%\)/.test(h) && /data-gv2="cf:abrir:2" aria-expanded="true"/.test(h)
        && /saiu · Churn/.test(h) && /última cobrança 31\/08/.test(h) && /venda sem CNPJ no HubSpot/.test(h) && /1 venda não foi achada no CS pelo CNPJ/.test(h) && /comanda em pelo menos 20 dos últimos 30 dias/.test(h), h.slice(0, 400));
    checar('cliente que fica · a comissão em duas partes fica desligada, sem valor nenhum',
      GV2.CF.COMISSAO_DUAS_PARTES === false && /Aguarda a diretoria/.test(h) && /Só aparece quando a diretoria aprovar a regra\. Até lá, sem valores\./.test(h) && /disabled aria-disabled="true">Desligado/.test(h) && !/R\$/.test(GV2.render.cfComissao()));
    global.DATA.clienteQueFica = null;
    checar('cliente que fica · sem as vendas do robô, o cartão não aparece', GV2.render.cfTime() === '');
    checar('cliente que fica · nenhuma escrita no HubSpot nem no ASAAS no módulo', !/hubapi|asaas\.com|tarefaNoNegocio|cobrarNegocio\(|\.insert\(|\.update\(|\.upsert\(/.test(codigo.slice(codigo.indexOf('GV2.CF = {'), codigo.indexOf('GV2.cfComando = function'))));
    global.DATA.clienteQueFica = dataEra; GV2.cfLer = cfLerEra; Object.assign(GV2.cf, cfEra); GV2.estado.cfAberto = null;
  }

  /* ── OS EXPERIMENTOS DO TIME (handoff "Acelerar Field Sales v2", 7a · 01/11/26): no fim do Funil,
     hipótese, indicador, dono, período e resultado; os 3 do ebook como sugestão até o gestor planejar;
     um de cada vez por indicador; no fim, vira regra, descarta ou repete. ── */
  {
    const exEra = Object.assign({}, GV2.ex), exLerEra = GV2.exLer, supaEra = global.supa.from, pintaEra = GV2.pintar, toastEra = GV2.toast;
    GV2.exLer = function () {}; GV2.pintar = function () {}; GV2.toast = function () {};
    const dono = GV2.base.pessoas[0].id;
    GV2.ex.d = { hoje: '2026-11-01', lidoEm: '2026-11-01T21:00:00Z', lista: [
      { id: 'e1', medida: 'horario_dono', hipotese: 'Horário do dono', pergunta: 'visitar entre 14h30 e 17h encontra mais o dono?', indicador: 'conversa com o dono ÷ visitas', dono: dono, inicio: '2026-10-19', fim: '2026-11-13',
        parcial: { a: { n: 45, x: 22 }, b: { n: 51, x: 16 }, ate: '2026-11-01' } },
      { id: 'e2', medida: 'livre', hipotese: 'Ligar antes', pergunta: null, indicador: 'demos ÷ visitas', dono: null, inicio: '2026-09-01', fim: '2026-09-30', parcial: null },
      { id: 'e3', medida: 'followup_48h', hipotese: 'Follow-up de 48 h', indicador: 'clientes ÷ demos', dono: null, inicio: '2026-08-01', fim: '2026-08-31', veredito: 'regra', resultado: 'fecha 12 pontos a mais', parcial: null }] };
    GV2.ex.em = Date.now(); GV2.ex.erro = null; GV2.ex.lendo = false;
    const h = GV2.render.exFunil();
    checar('experimentos · 7a: o cartão com a fonte, as colunas e a regra do fim',
      /Experimentos do time/.test(h) && /3 da lista do ebook · um de cada vez por indicador/.test(h) && /fichas de rua \+ HubSpot · 01\/11/.test(h)
        && /<span>Hipótese<\/span><span>Indicador<\/span><span>Dono<\/span><span>Período<\/span><span>Resultado<\/span>/.test(h) && /No fim, uma de três: vira regra no Playbook, descarta, ou repete com mais amostra\./.test(h), h.slice(0, 400));
    checar('experimentos · o parcial na língua do indicador, com a taxa só a partir de 3',
      /parcial: 49% das 14h30 às 17h, 31% no resto do dia · 96 visitas/.test(h) && GV2.exPct({ n: 2, x: 2 }) === '—' && GV2.exPct({ n: 3, x: 1 }) === '33%', h);
    checar('experimentos · em curso, escrever o resultado, concluído com o veredito, nessa ordem',
      h.indexOf('data-gv2="ex:abrir:e2"') < h.indexOf('data-gv2="ex:abrir:e1"') && h.indexOf('data-gv2="ex:abrir:e1"') < h.indexOf('data-gv2="ex:abrir:e3"')
        && /escrever o resultado/.test(h) && /is-cur">em curso/.test(h) && /fecha 12 pontos a mais<\/span><span class="gv2-rp-chip is-ok">virou regra/.test(h) && /<b class="gv2-ex-d">o time<\/b>/.test(h));
    checar('experimentos · o do ebook que ainda não existe aparece como sugestão, com Planejar, e nada é gravado sozinho',
      /Recém-aberto primeiro/.test(h) && /data-gv2="ex:planejar:recem_aberto"/.test(h) && !/ex:planejar:horario_dono/.test(h) && !/ex:planejar:followup_48h/.test(h) && /sugestão do ebook/.test(h));
    let gravado = null;
    global.supa.from = function (t) { return {
      insert: async function (l) { gravado = { t: t, op: 'insert', l: l }; return { error: null }; },
      update: function (l) { return { eq: async function (c, v) { gravado = { t: t, op: 'update', l: l, id: v }; return { error: null }; } }; } }; };
    GV2.exComando('ex', ['ex', 'planejar', 'recem_aberto']);
    const gv = GV2.render.exGav();
    checar('experimentos · planejar a sugestão abre a gaveta já preenchida, com 28 dias a partir de hoje',
      /Novo experimento/.test(gv) && /value="Recém-aberto primeiro"/.test(gv) && /value="2026-11-01"/.test(gv) && /value="2026-11-28"/.test(gv) && /O time inteiro/.test(gv), gv.slice(0, 300));
    await GV2.exSalvar();
    checar('experimentos · planejar grava só na tabela experimentos, com a régua do ebook',
      gravado && gravado.t === 'experimentos' && gravado.op === 'insert' && gravado.l.medida === 'recem_aberto' && gravado.l.indicador === 'demos ÷ visitas' && gravado.l.inicio === '2026-11-01' && !GV2.estado.exGav, JSON.stringify(gravado));
    GV2.exComando('ex', ['ex', 'abrir', 'e2']);
    gravado = null;
    await GV2.exConcluir();
    checar('experimentos · o resultado pede uma de três antes de gravar', gravado === null && /uma de três/.test(GV2.estado.exErro || ''));
    GV2.exComando('ex', ['ex', 'veredito', 'repete']); GV2.exForm('resultado', 'amostra pequena, repetir em novembro');
    await GV2.exConcluir();
    checar('experimentos · registrar o resultado grava o veredito e o texto',
      gravado && gravado.op === 'update' && gravado.id === 'e2' && gravado.l.veredito === 'repete' && gravado.l.resultado === 'amostra pequena, repetir em novembro' && !!gravado.l.concluido_em, JSON.stringify(gravado));
    GV2.exComando('ex', ['ex', 'novo']); GV2.exForm('medida', 'livre'); GV2.exForm('hipotese', 'Teste'); GV2.exForm('indicador', 'demos ÷ visitas'); GV2.exForm('fim', '2026-10-01');
    gravado = null; await GV2.exSalvar();
    checar('experimentos · fim antes do início não grava', gravado === null && /depois do início/.test(GV2.estado.exErro || ''));
    global.supa.from = function () { return { insert: async function () { return { error: { code: '23P01', message: 'x' } }; } }; };
    GV2.exForm('fim', '2026-11-20'); await GV2.exSalvar();
    checar('experimentos · um de cada vez: a recusa do banco vira frase', /Um de cada vez/.test(GV2.estado.exErro || ''), GV2.estado.exErro);
    GV2.exFechar();
    checar('experimentos · o módulo não escreve no HubSpot', !/hubapi|tarefaNoNegocio|cobrarNegocio\(/.test(codigo.slice(codigo.indexOf('GV2.EX = {'), codigo.indexOf('GV2.exComando = function'))));
    GV2.ex.d = null; GV2.ex.erro = 'falhou';
    checar('experimentos · sem o banco, o cartão diz o erro', /Não li os experimentos agora \(falhou\)/.test(GV2.render.exFunil()));
    global.supa.from = supaEra; GV2.exLer = exLerEra; GV2.pintar = pintaEra; GV2.toast = toastEra; Object.assign(GV2.ex, exEra);
  }

  /* ── AUDITORIA 01/11/26: o dia 1º do mês, o "ontem" que não é ontem, a semana de propostas que
     atravessa o mês e quem recebe a carteira de quem saiu ── */
  {
    const agEra = GV2.base.agora, ontEra = GV2.base.ontemIso, hbEra = GV2.hb.d, hbLerEra = GV2.hbLer;
    GV2.hbLer = function () {};
    /* domingo 01/11: o mês não tem dia útil fechado; o último dia útil foi sexta 30/10 */
    GV2.base.agora = Object.assign({}, agEra, { iso: '2026-11-01', min: 700 }); GV2.base.ontemIso = '2026-10-30';
    checar('auditoria · no domingo, o último dia útil é "na sexta 30/10", não "ontem"', GV2.ontemDe() === 'na sexta 30/10' && GV2.ontemCurto() === 'Sex 30/10', GV2.ontemDe());
    checar('auditoria · na terça, ontem é ontem', GV2.ontemDe('2026-11-02', '2026-11-03') === 'ontem');
    checar('auditoria · dia 1º antes do primeiro dia útil: "mês começando", não "no ritmo"', GV2.v8Comecando() && GV2.v8Selo(0, 0).t === 'mês começando' && /O mês começa terça 03\/11/.test(GV2.v8Gargalo(GV2.v8Ritmo(null)).t), JSON.stringify([GV2.v8Comecando(), GV2.v8Mes(), GV2.v8Selo(0, 0), GV2.v8Gargalo(GV2.v8Ritmo(null))]));
    const mk = function (id, meta, fech) { return { id: id, nome: id, meta_clientes_mes: meta, fase: 'Pleno', funil_mes: { portas: 0, decisor: 0, demo: 0, proposta: 0, fechado: fech } }; };
    checar('auditoria · sem esperado ainda, ninguém é "mais longe do ritmo"', GV2.v8Ranking([mk('a', 4, 0), mk('z', 8, 0)]).pior === null);
    GV2.hb.d = { time: { anterior: { p: 312, f: 290, o: 140, m: 96, c: 39, pessoas: 6 } } };
    const ant = GV2.render.v8MesAnterior();
    checar('auditoria · o Funil mostra outubro fechado enquanto novembro não começa', /Outubro fechado/.test(ant) && />312</.test(ant) && /48%/.test(ant) && /41% das demos/.test(ant), ant.slice(0, 300));
    GV2.base.agora = agEra; GV2.base.ontemIso = ontEra;
    checar('auditoria · com o mês andando, o quadro do mês anterior some', GV2.render.v8MesAnterior() === '' || !GV2.v8Comecando());
    GV2.hb.d = hbEra; GV2.hbLer = hbLerEra;
    checar('auditoria · a carteira de quem saiu só vai para quem está no time de rua', /doTimeRua\[String\(c\.hubspot\)\]/.test(codigo));
    checar('auditoria · a semana de propostas soma quem entrou em Negociação desde a segunda, mesmo no mês anterior', /entrouNegociacaoEm[\s\S]{0,120}>= seg && doTime\(n\.dono\)\) marcaSem/.test(codigo));
  }

  /* ── O COMBINADO 2 MEDE O PASSO CUMPRIDO (0238, 01/11/26): o app obriga o passo na ficha, então "ter
     passo" dava sempre 100%; agora é o passo que venceu e teve toque até o dia seguinte ── */
  {
    const base = { visitas: { visitas: 20, provadas: 20, comPasso: 20, naHora: 18, divergencias: [] }, fichas: { donoAusente: 0, voltaMarcada: 0 }, vespera: { dias: 5, planejados: 5 }, rituais: {} };
    const m1 = GV2.cbMedir(Object.assign({}, base, { passos: { julgados: 8, cumpridos: 6, semComoSaber: 2, faltaram: [] } }))[1];
    checar('combinado 2 · o passo cumprido: 6 de 8 = 75%, atenção, e diz quantos ficaram sem como saber',
      m1.val === '75%' && m1.k === 'erro' && /6 de 8 passos cumpridos até o dia seguinte · 2 sem como saber/.test(m1.como), JSON.stringify(m1));
    const m2 = GV2.cbMedir(Object.assign({}, base, { passos: { julgados: 0, cumpridos: 0, semComoSaber: 0, faltaram: [] } }))[1];
    checar('combinado 2 · sem passo vencido na semana, sem dado (não 100%)', m2.val === '—' && m2.pct === null && /nenhum passo venceu ainda/.test(m2.como));
    const m3 = GV2.cbMedir(base)[1];
    checar('combinado 2 · sem o dado novo (banco antigo), a conta de antes', m3.val === '100%' && /com próximo passo e data/.test(m3.como));
    checar('combinado 2 · a descrição diz o que mede', GV2.CB.itens[1].s === 'a data marcada é cumprida');
  }

  /* ── O LAÇO QUE CONGELAVA A HOJE DO EXECUTIVO (01/11/26): pedir uma semana que outra parte da tela
     já está lendo devolvia uma promessa resolvida na hora; a Hoje repintava e pedia de novo, num laço
     de microtarefas sem fim. Quem chega no meio tem que esperar a MESMA leitura. ── */
  await (async function () {
    const cacheEra = GV2.rota.cache, promEra = GV2.rota.prom, agoraEra = GV2.rotaLerAgora;
    let leituras = 0, soltar;
    GV2.rota.cache = {}; GV2.rota.prom = {};
    GV2.rotaLerAgora = function (seg) { leituras++; GV2.rota.cache[seg] = { estado: 'lendo' }; return new Promise(function (r) { soltar = function () { GV2.rota.cache[seg] = { estado: 'ok', itens: [], visitas: [] }; r(); }; }); };
    const p1 = GV2.rotaLer('2026-11-02');
    const p2 = GV2.rotaLer('2026-11-02');
    let p2Voltou = false;
    p2.then(function () { p2Voltou = true; });
    await new Promise(function (r) { setTimeout(r, 0); });
    checar('rota · quem pede a semana que já está sendo lida espera a mesma leitura (não volta na hora)', leituras === 1 && !p2Voltou, JSON.stringify({ leituras: leituras, p2Voltou: p2Voltou }));
    soltar(); await p1; await p2;
    checar('rota · quando a leitura chega, os dois recebem a semana pronta', GV2.rota.cache['2026-11-02'].estado === 'ok' && !GV2.rota.prom['2026-11-02']);
    checar('rota · a Hoje do executivo repinta numa tarefa nova se a semana ainda não chegou (nunca em cadeia de microtarefas)', /if \(!ainda \|\| ainda\.estado === 'lendo'\) \{ setTimeout\(EXH\.pintar, 400\); return; \}/.test(codigo));
    GV2.rota.cache = cacheEra; GV2.rota.prom = promEra; GV2.rotaLerAgora = agoraEra;
  })();

  /* ── AUDITORIA DE ENTREGA (01/11/26): a semana do executivo não conta feriado e diz quando já fechou ── */
  {
    const EXH = GV2.EXH;
    const dias = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
    const pS = { meta_visitas_dia: 6, semana: dias.map(function (iso) { return { iso: iso, todas: 4, passado: true }; }) };
    const s1 = EXH.semana(pS, { semana: dias.map(function (iso) { return { iso: iso }; }), agora: { iso: '2026-11-04' } });
    checar('semana do executivo · Finados (02/11) não tem meta: 6 × 4 = 24', s1.meta === 24 && s1.aberta === true, JSON.stringify(s1));
    const fds = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];
    const s2 = EXH.semana({ meta_visitas_dia: 6, semana: fds.map(function (iso) { return { iso: iso, todas: 0, passado: true }; }) }, { semana: fds.map(function (iso) { return { iso: iso }; }), agora: { iso: '2026-11-01' } });
    checar('semana do executivo · no domingo a semana fechou: o que falta "ficou faltando"', s2.meta === 30 && s2.aberta === false && /sem\.aberta \? 'faltam ' \+ sem\.faltam : 'ficaram faltando '/.test(codigo), JSON.stringify(s2));
    /* 02/11/26: a Grade v4 (render.ruaSemana) saiu como código morto; a Rua v5 (render.v5Semana) é a que mostra a semana */
    checar('rua da semana · feriado aparece como feriado e fica fora da meta', /s = d\.todas \? 'feriado · fez ' \+ d\.todas : 'feriado · não conta'/.test(codigo) && /const uteis = b\.semana\.filter\(function \(d\) \{ return GV2\.util\(d\.iso\); \}\)\.length;/.test(codigo));
    checar('time · a legenda das metas sai do ranking, não do "8 e 2" escrito à mão', /metaPorPat/.test(tpl) && !/2 para quem está em rampa/.test(tpl));
    checar('rua da semana do gestor · semana fechada diz "ficaram faltando"', /\(aberta \? 'faltam ' : 'ficaram faltando '\) \+ \(meta - feito - falta\)/.test(codigo) && /const aberta = b\.semana\.some\(function \(d\) \{ return GV2\.util\(d\.iso\) && d\.iso >= b\.agora\.iso; \}\);/.test(codigo));
    {
      const m = tpl.match(/function repsSemMetaInventada\(\) \{[\s\S]*?\n\}/);
      const sb = { DATA: { reps: [{ name: 'Gestor', metaMensal: 10, patamarMeta: null, metaMrr: null, metaReceita: null }, { name: 'Pleno', metaMensal: 8, patamarMeta: 'pleno', metaMrr: 3000, metaReceita: 9000 }, { name: 'Fora', metaMensal: 0, patamarMeta: 'sem meta', metaMrr: 0, metaReceita: 0 }] } };
      if (m) require('vm').runInNewContext(m[0] + '; repsSemMetaInventada();', sb);
      checar('dados do servidor · a linha sem patamar nem meta de dinheiro vira "sem meta", as outras ficam como vieram', !!m && sb.DATA.reps[0].metaMensal === 0 && sb.DATA.reps[0].patamarMeta === 'sem meta' && sb.DATA.reps[1].metaMensal === 8 && sb.DATA.reps[2].metaMensal === 0, JSON.stringify(sb.DATA.reps));
      checar('dados do servidor · a correção roda no login e no farol', (tpl.match(/Object\.assign\(DATA, (corpo\.dados|dados)\);\n\s*if \(typeof repsSemMetaInventada === 'function'\) repsSemMetaInventada\(\);/g) || []).length === 2);
    }
    {
      /* Planejamento do executivo (auditoria 01/11/26): feriado sem meta, sem sugestão e fora do "montar a semana" */
      const PL7 = GV2.PL7;
      const dias = [{ iso: '2026-11-02', rot: 'seg', data: '02/11', feriado: true }, { iso: '2026-11-03', rot: 'ter', data: '03/11' }];
      const fila = [1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return { id: 'c' + i, tipo: 'c' }; });
      const mt = PL7.montar(fila, [[], []], dias, 6, function (v) { return v; }, function () { return false; }, null);
      checar('planejamento · "montar a semana" não põe conta no feriado', mt.length === 1 && mt[0].iso === '2026-11-03' && mt.total === 6, JSON.stringify(mt));
      const rg = PL7.regras({ quente: 0, venc: 0, cnpj: 0, sem: 0 }, [[], ['a', 'b', 'c', 'd', 'e', 'f']], dias, 6, function (v) { return v; }, function () { return false; });
      checar('planejamento · a regra "todo dia com 6+" não conta o feriado', rg.filter(function (x) { return x.n === 4; })[0].ok === true, JSON.stringify(rg[3]));
      checar('planejamento · feriado sem sugestão, sugestão sem conta repetida entre dias, topo conta o que a grade mostra',
        /\|\| d\.feriado \|\| !pl6SugRegioes\.length\) return null;/.test(tpl) && /const pl6SugUsadas = new Set\(\);/.test(tpl) && /escolhidas\.forEach\(function \(l\) \{ pl6SugUsadas\.add\(l\.id\); \}\);/.test(tpl)
          && /const agendadas = grade\.reduce\(function \(s, col\) \{\s*return s \+ pl6ItensDoDia\(col, porId\)/.test(tpl) && /feriado · sem meta/.test(tpl) && tpl.indexOf("vazioRot: d.feriado ? 'feriado — ninguém é cobrado de rua neste dia'") > -1);
    }
    /* números iguais no app e no Cockpit (auditoria 01/11/26) */
    checar('habilidade · novembro/26 tem 19 dias úteis (Finados e Consciência Negra fora), como o uteis() do app', GV2.hbUteis('2026-11-01', '2026-11-30') === 19, String(GV2.hbUteis('2026-11-01', '2026-11-30')));
    checar('sem próximo passo · o card do executivo mostra a mesma quebra da aba Tarefas do app (vencido + nunca marcado)',
      /venc \+ ' com passo vencido \+ ' \+ \(sp - venc\) \+ ' nunca '/.test(codigo));
    checar('ver como executivo · quem está fora do time fica sem meta, não com 10', tpl.indexOf("fechadosNoMes: 0, metaMensal: 0, metaMrr: 0, metaReceita: 0, patamarMeta: 'sem meta'") > -1 && tpl.indexOf('fechadosNoMes: 0, metaMensal: 10,') < 0);
  }
  /* G9 (auditoria 02/11/26): o "sem próx. passo" do Meu funil do executivo é a regra canônica —
     Ag. Pagamento fora e o mesmo restaurante em duas etapas conta uma vez (no mais avançado);
     "ganho + onboarding" conta as etapas laterais, não os itens de venda (dava 0 sempre) */
  {
    const i0 = tpl.indexOf('const FN2_AG_PAGAMENTO');
    const i1 = tpl.indexOf('/* ── OS TRÊS MOVIMENTOS', i0);
    const fonte = i0 > 0 && i1 > i0 ? tpl.slice(i0, i1) : '';
    let fn = null;
    try {
      fn = new Function('GV2', 'FN2_ETAPA_PERDIDO', 'FN2_ETAPAS_ABERTAS', fonte + '\nreturn fn2SemPasso;')(GV2, '1396006164',
        ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473'].map(id => ({ id })));
    } catch (e) { fn = null; }
    const it = (id, stageId, nome, passo, dias) => ({ lead: { id, name: nome, ownerId: '1' }, stageId, dias: dias || 1, est: { passo } });
    const lista = [
      it('1', '1395880469', 'Bar do Zé', false), it('2', '1395880471', 'Restaurante Bar do Zé', false), /* repetido: fica o de Demo */
      it('3', '1395880473', 'Casa Paga', false), /* Ag. Pagamento: fora */
      it('4', '1396005401', 'Cantina', true), it('5', '1395880469', 'Pizzaria Nova', false)
    ];
    const sp = fn ? fn(lista).map(x => x.lead.id).sort().join() : 'sem função';
    checar('auditoria 02/11 · G9: Meu funil · sem próx. passo tira Ag. Pagamento e conta o repetido uma vez (no mais avançado)', sp === '2,5', sp);
    checar('auditoria 02/11 · G9: Meu funil · "ganho + onboarding" conta as etapas laterais e o Playbook usa a mesma regra',
      /const nGanho = colGanho \? laterais\.filter/.test(tpl) && /laterais\.filter\(function \(x\) \{ return String\(x\.stageId\) === String\(FN3_ETAPA_ONBOARDING\)/.test(tpl) && tpl.indexOf('const sem = new Set(typeof fn2SemPasso === \'function\'') > 0);
  }
  /* G12 (auditoria 02/11/26): plural de "saiu do funil", uma régua só de "muitos travados", e o Território
     não chama de "viraram negócio" quem só tem negócio */
  checar('auditoria 02/11 · G12: "2 saíram do funil" (plural) e "1 saiu do funil"', codigo.indexOf("sairam + (sairam > 1 ? ' saíram do funil' : ' saiu do funil')") > 0);
  checar('auditoria 02/11 · G12: "muitos travados" é GV2.MUITOS_TRAVADOS em todo lugar (nada de 3, 4, 5 ou 10 soltos)',
    GV2.MUITOS_TRAVADOS === 4 && (codigo.match(/travados(\.length|\s*\|\|\s*\[\]\)\.length) >= GV2\.MUITOS_TRAVADOS/g) || []).length >= 6 && !/travados(\.length|\s*\|\|\s*\[\]\)\.length) >= (4|5|10)\b/.test(codigo));
  checar('auditoria 02/11 · G12: Território diz "Com negócio" (tem negócio, antes ou depois da visita), não "Viraram negócio"', codigo.indexOf("r: 'Com negócio'") > 0 && codigo.indexOf("r: 'Viraram negócio'") < 0);
  /* G2 (auditoria 02/11/26): no feriado o plano do dia é o REAL (o "fds ? 0" zerava e a Hoje
     discordava da Rua); quem tem plano e não saiu não vira exceção nem "nenhuma visita" */
  await (async function () {
    const utilOrig = GV2.util;
    GV2.util = function (iso) { return iso !== HOJE && utilOrig(iso); };
    const bF = await GV2.montar();
    GV2.util = utilOrig;
    const biaF = bF.porId['2'];
    checar('auditoria 02/11 · G2: no feriado o plano de hoje é o real (6 paradas), sem exceção de "plano sem visita" e sem "nenhuma visita"',
      biaF.hoje.paradas_plano === 6 && bF.time.paradas === GV2.base.time.paradas && (biaF.excecao & 2) === 0 && !/nenhuma visita/.test(biaF.motivo), JSON.stringify({ pl: biaF.hoje.paradas_plano, exc: biaF.excecao, m: biaF.motivo }));
  })();
  /* G13 (02/11/26, aprovado pelo dono): a carteira do gestor entra como "você" — contada como a de um
     executivo, mas fora de b.pessoas, da meta, do ranking e do "Quem precisa de você" */
  await (async function () {
    const antes = { base: GV2.base, gav: DATA.funilDoGestor };
    DATA.funilDoGestor = {
      '1395880472': [lead('g1', '99', 2, 700, false, false), lead('g2', '99', 12, 300, true, true)],
      '1395880469': [lead('g3', '99', 1, 0, false, false)],
      '1395880473': [lead('g4', '99', 9, 100, true, false)]
    };
    const bV = await GV2.montar();
    GV2.base = bV;
    const V = bV.voce;
    const semVoce = antes.base;
    const eo = console.error; console.error = () => {};
    const provaV = GV2.testes.prova();
    console.error = eo;
    const hj = GV2.render.time(), pv = GV2.render.prova(), pp = GV2.render.v8PorPessoa();
    const grupos = JSON.stringify(GV2.v5Grupos().grupos);
    GV2.base = antes.base; DATA.funilDoGestor = antes.gav;
    checar('auditoria 02/11 · G13: a carteira do gestor vira b.voce (quentes 3 com Ag. Pag., travado 1, sem próximo passo 2 = g1 e g3)',
      !!V && V.quentes.length === 3 && V.travados.length === 1 && V.semProximoPasso === 2 && V.quentesSemPasso === 1, JSON.stringify(V && { q: V.quentes.length, t: V.travados.length, sp: V.semProximoPasso, qsp: V.quentesSemPasso }));
    checar('auditoria 02/11 · G13: "você" fica FORA de b.pessoas, dos totais do time, da meta e do "Quem precisa de você"',
      !bV.pessoas.some(p => p.id === '99') && bV.time.quentes === semVoce.time.quentes && bV.time.travados === semVoce.time.travados && bV.time.metaMes === semVoce.time.metaMes && !bV.negocios.some(n => n.dono === '99') && grupos.indexOf('"99"') < 0 && provaV.length === 0, provaV.join(' · '));
    checar('auditoria 02/11 · G13: a Hoje mostra "+ você N" ao lado do time, a Prova e o Por pessoa têm a linha "Você" à parte',
      /\+ você 3/.test(hj) && /\+ você 1/.test(hj) && pv.indexOf('Você (fora do time · não soma no topo)') > 0 && pp.indexOf('sua carteira · fora da meta do time') > 0);
  })();
  /* G11 (auditoria 02/11/26): a pintura que lança no boot vira estado de erro com "Tentar de novo"
     (antes ficava no esqueleto). Por último: o await deixa as leituras pendentes resolverem. */
  await (async function () {
    const antB = GV2.base, antP = GV2.pintar, antM = GV2.montar, antR = GV2.raiz, antOk = GV2.telaOk;
    const raiz = { innerHTML: '' };
    GV2.base = null; GV2.telaOk = false;
    GV2.raiz = function () { return raiz; };
    GV2.montar = async function () { return antB; };
    GV2.pintar = function () { throw new Error('pintura quebrou'); };
    const eo = console.error; console.error = () => {};
    try { await GV2.carregar(); } catch (e) { /* o carregar não pode lançar */ }
    console.error = eo;
    checar('auditoria 02/11 · G11: se a pintura lança no boot, a tela mostra o erro com "Tentar de novo" (não fica no esqueleto)',
      /Tentar de novo/.test(raiz.innerHTML) && /pintura quebrou/.test(raiz.innerHTML), raiz.innerHTML.slice(0, 200));
    GV2.base = antB; GV2.pintar = antP; GV2.montar = antM; GV2.raiz = antR; GV2.telaOk = antOk;
  })();

  if (falhas.length) {
    console.log('FALHOU: ' + falhas.length);
    falhas.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('gestor v2: ' + ok + ' verificações · tudo certo.');
})().catch(e => { console.log('FALHOU: ' + e.stack); process.exit(1); });
