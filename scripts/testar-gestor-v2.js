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
checar('Prospecção é aba do cockpit novo e "Tomada de contas e Radar" vai para ela',
  /\['prospeccao', 'Prospecção'/.test(codigo) && /texto: 'Tomada de contas e Radar', acao: 'aba:prospeccao'/.test(codigo));
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
  pontos_eventos: [{ owner_id: '2', tipo: 'contrato' }, { owner_id: '2', tipo: 'demo_realizada' }, { owner_id: '3', tipo: 'contrato' }, { owner_id: '3', tipo: 'estorno' }],
  client_stage_changes: [], playbook_progresso: [], gestor_idas_campo: [],
  /* v4 (07/10/26): a disciplina e as leituras do gestor */
  profiles: [{ id: 'u1', id_hubspot: '1' }, { id: 'u2', id_hubspot: '2' }, { id: 'u3', id_hubspot: '3' }],
  client_meetings: [{ id: 'm1', client_id: 'c1', created_by: 'u1', scheduled_at: '2026-10-05T15:00:00Z', type: 'reuniao' }, { id: 'm2', client_id: 'c2', created_by: 'u1', scheduled_at: '2026-10-02T15:00:00Z', type: 'follow_up' }, { id: 'm3', client_id: 'c1', created_by: 'u1', scheduled_at: new Date(Date.now() - 45 * 86400000).toISOString(), type: 'reuniao' }],
  fila_feitas: [{ user_id: 'u2', dia: '2026-10-06', estado: 'gravada' }, { user_id: 'u2', dia: '2026-10-06', estado: 'desfeita' }],
  dailies: [{ seller_id: 'u3', prometido_visitas: 4 }],
  gestor_v4_leituras: { prospeccao: { '1': { atribuidas: 10, visitadas: 2, avancaram: 1 } }, fonte: [{ dono: '1', origem: 'alvo', portas: 5, avancaram: 2 }, { dono: '3', origem: 'rua', portas: 10, avancaram: 1 }] },
  um_a_um: [{ owner_id: '1', data: '2026-09-23', canal: 'video', created_at: '2026-09-23T12:00:00Z', compromissos: ['a', 'b', 'c'],
    combinados: [{ texto: 'Plano todo dia', regra: 'plano_diario' }, { texto: 'Travados com data', regra: 'travados_com_data' }, { texto: 'Duas demos', regra: 'livre' }] },
    { owner_id: '2', data: '2026-10-01', canal: 'campo', created_at: '2026-10-01T20:00:00Z', compromissos: ['voltar no Bar'], devolutiva: { foco: 'Disciplina de plano' } }], clients: [{ id: 'c1', nome: 'José', empresa: 'Bar do Zé', id_hubspot: 'a' }, { id: 'c2', nome: 'Sidnei', empresa: 'Cantina Sol', id_hubspot: null }]
};
const q = (dados) => { const o = { then: (a, b) => Promise.resolve({ data: dados, error: null }).then(a, b) }; ['select', 'eq', 'gte', 'lt', 'in', 'order', 'limit'].forEach(k => { o[k] = () => o; }); return o; };
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
  const ana = b.porId['1'], bia = b.porId['2'], caio = b.porId['3'];
  checar('ritmo às 11:20 = 31% da meta: 6 → 2 esperadas, 4 → 1', ana.esperado === 2 && caio.esperado === 1, 'ana ' + ana.esperado + ' caio ' + caio.esperado);
  checar('sem plano hoje vale 3 de exceção (+1 se furou ontem)', ana.hoje.paradas_plano === 0 && ana.excecao === 4, 'ana ' + ana.excecao);
  checar('plano sem visita abaixo do ritmo vale 2', bia.excecao === 2, 'bia ' + bia.excecao);
  checar('quem está no ritmo e cumpriu ontem tem 0', caio.excecao === 0, 'caio ' + caio.excecao);
  checar('a ordem é por exceção', b.ordem.map(p => p.id).join() === '1,2,3', b.ordem.map(p => p.id).join());
  checar('ontem numa terça é a segunda da mesma semana', ana.ontem.paradas_plano === 6 && ana.ontem.visitas_com_prova === 3 && ana.furou === 3);
  checar('quente = Negociação e Ag. Pagamento; travado = estouro da régua do Cockpit',
    b.time.quentes === 3 && b.time.travados === 2, 'q ' + b.time.quentes + ' t ' + b.time.travados);
  checar('fechado = contratos − estornos (o mesmo do ranking)', bia.funil_mes.fechado === 1 && caio.funil_mes.fechado === 0);
  checar('portas = só visitas provadas', ana.funil_mes.portas === 2 && bia.funil_mes.portas === 1);
  checar('a meta do mês é a soma das pessoas', b.time.metaMes === 15);
  checar('provável = fechados + Ag. Pagamento + 60% de Negociação (v4)', bia.provavel === 2 && ana.provavel === 1 && caio.provavel === 1, 'bia ' + bia.provavel + ' ana ' + ana.provavel + ' caio ' + caio.provavel);
  /* ── v4 (Pessoas e Raio X, 07/10/26): os testes de aceite 1–4 e 8 do prompt ── */
  checar('v4 · 1: o provável do Time é a soma das Pessoas e o KPI Mês mostra o mesmo número',
    b.time.provavel === ana.provavel + bia.provavel + caio.provavel && GV2.render.kpisTime()[4].unidade === 'provável ' + b.time.provavel, 'time ' + b.time.provavel);
  checar('v4 · 3: negócio repetido (mesmo dono, mesmo nome) conta uma vez, na etapa mais avançada, com rep e as outras etapas',
    b.negocios.filter(n => n.nome === 'Na').length === 1 && b.negocios.find(n => n.nome === 'Na').etapa_idx === 4 && b.negocios.find(n => n.nome === 'Na').rep === 2 && /Visita/.test(b.negocios.find(n => n.nome === 'Na').outros.join()),
    b.negocios.map(n => n.nome + ':' + n.etapa_idx).join());
  const agp = b.negocios.find(n => n.id === 'c');
  checar('v4 · 4: Ag. Pagamento nunca é travado, sem passo nem "a puxar", mesmo estourando a régua', agp && agp.agPag && !agp.travado && !agp.semPasso && !agp.puxar);
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
    checar('planejamento: o cartão do Hoje e o Raio X abrem a gaveta; o plano de cada um abre o dia na Rua (v5)', /^Planejamento de /.test(c.tit) && c.corpo.indexOf('gv2-rt') > 0 && tempo.indexOf('v5dia:' + ana.id + ':') > 0 && tempo.indexOf('data-gv2="rxg:plano"') > 0 && GV2.render.raiox().indexOf('data-gv2="rxg:plano"') > 0, c.tit);
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
      const g = GV2.p3Resumo(p);
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
        && so(dv[1]) === so(ge[1]) && so(dv[2]) === so(ge[2]) && pdEscada === ge[3] && so(dv[4]) === so(ge[4]);
      checar('desenvolvimento: os 5 cartões do topo de ' + p.nome + ' são os da Pessoas v5 do gestor (mesma base)', iguais, JSON.stringify({ dv: dv, gestor: ge, pdEscada: pdEscada }));
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
  checar('sem lugar no mapa: o item do plano que o app não põe na rota chega ao gestor e aparece na grade', GV2.base.porId['2'].semana[4].semLugar === 2 && GV2.render.ruaSemana().indexOf('2 s/ lugar') > 0, JSON.stringify(GV2.base.porId['2'].semana[4]));
  checar('promessa: com alguém prometendo aparece; ninguém prometeu hoje, some das linhas (não vira 7 x não prometeu)', (function () { const ps = GV2.base.pessoas, antes = ps.map(function (p) { return p.promessa; }); const com = GV2.v4Promessa(ana); ps.forEach(function (p) { p.promessa = null; }); const sem = GV2.v4Promessa(ana); ps.forEach(function (p, i) { p.promessa = antes[i]; }); return com === 'não prometeu' && sem === ''; })());
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
  checar('v5 · Pessoas: 3 blocos numa rolagem (Agora e semana → Coaching → Evolução), o resumo de 5, sem segundo nível de abas, sem "Promessa de hoje" e sem "Chamar"',
    p3.indexOf('1 · Agora e semana') > 0 && p3.indexOf('2 · Coaching') > p3.indexOf('1 · Agora e semana') && p3.indexOf('3 · Evolução') > p3.indexOf('2 · Coaching')
      && (p3.match(/class="gv2-v5-res"/g) || []).length === 5 && p3.indexOf('gv2-p3-abas') < 0 && p3.indexOf('Promessa de hoje') < 0 && p3.indexOf('p3:chamar') < 0);
  checar('v5 · Pessoas: "Onde o seu tempo rende" (até 3), a lista pela necessidade de coaching e os atalhos para a gaveta (1:1, disciplina, campo, funil) e a rotação',
    /Onde o seu tempo rende esta semana/.test(p3) && (p3.match(/class="card gv2-v5-rend"/g) || []).length <= 3 && /pela necessidade de coaching/.test(p3)
      && ['um', 'disc', 'campo', 'funil'].every(function (t) { return p3.indexOf('data-gv2="v5gav:' + t + ':') > 0; }) && /data-gv2="p3:rotacao"/.test(p3) && !/Sua rotação de campo/.test(p3));
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
  checar('rodapé do dinheiro: o maior MRR em jogo é contra a Saipos', (GV2.maiorMrrContra(b) || {}).s === 'Saipos' && GV2.maiorMrrContra(b).v === 500);
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
  let px = '';
  /* v5: a Praça mora no Território (Onde atacar + o que ela já tinha, abaixo) */
  try { px = GV2.render.terr(); } catch (e) { falhas.push('Território: ' + e.message); }
  if (process.env.DEBUG_PX) require('fs').writeFileSync(process.env.DEBUG_PX, px);
  checar('a Praça desenha: Onde atacar por bairro (grafias juntas), Contra quem, armas e o painel do concorrente',
    /Praia do Canto/.test(px) && /<span class="num cel-forte">2<\/span>/.test(px) && /As armas que faltam/.test(px) && /Concorrente · Vitória/.test(px) && /Cobrar os 2/.test(px));
  checar('Visitas, Clientes e Em queda sem ponto na praça viram "sem dado", nunca zero', (px.match(/sem dado<\/span>/g) || []).length === 3, String((px.match(/sem dado<\/span>/g) || []).length));
  /* Pessoas › Funil e o mapa grande (06/10/26) */
  GV2.estado.cz = null; GV2.estado.aba = 'pessoas'; GV2.estado.pmodo = 'funil'; GV2.estado.pessoa = '1';
  /* v5: o funil da pessoa (Para puxar, Cobrar) abre na gaveta, pelo cartão do funil ou pelo Mês */
  GV2.estado.v5Gav = { t: 'funil', id: '1' };
  let pf = '';
  try { pf = GV2.render.pessoas(); } catch (e) { falhas.push('Pessoas › Funil: ' + e.message); }
  const ana1 = GV2.base.porId['1'];
  const fp1 = GV2.render.funilPessoa(ana1);
  checar('Pessoas › Funil em barras: o funil do mês e as etapas clicáveis, sem negócio aberto até escolher', /Funil do mês/.test(pf) && /data-gv2="fpetapa:4"/.test(pf) && !/data-gv2="ficha:/.test(fp1));
  checar('Pessoas v3 › Funil: "Para puxar" com Cobrar em cada linha e Cobrar os N (travado d, quente a sem passo)', /Para puxar · travados e quentes sem passo · 2/.test(pf) && /data-gv2="cobrar:neg:d"/.test(pf) && /data-gv2="cobrar:neg:a"/.test(pf) && /data-gv2="p3:cobrartodos:1"/.test(pf));
  GV2.estado.fpEtapa = 4;
  const pf2 = GV2.render.funilPessoa(ana1);
  checar('Pessoas › Funil: clicar numa etapa lista só os negócios dela, da pessoa', /data-gv2="ficha:a"/.test(pf2) && !/data-gv2="ficha:d"/.test(pf2) && !/data-gv2="ficha:b"/.test(pf2));
  GV2.estado.fpEtapa = null;
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
    GV2.estado.rua = 'semana';
    const gs = GV2.render.ruaSemana();
    const iso0 = GV2.base.semana[0].iso;
    checar('D5: cada célula da Grade é botão para o dia da pessoa', gs.indexOf('data-gv2="ruadia:1:' + iso0 + '"') > 0
      && (gs.match(/data-gv2="ruadia:/g) || []).length === GV2.base.ordem.length * GV2.base.semana.length);
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
      /Não li o Planejamento agora/.test(hf) && /planejamento_do_time/.test(hf) && />— de [0-9]+</.test(hf) && !/>0 de [0-9]+</.test(hf.replace(/>0 de 0</g, "")) && !Gf.grupos.some(function (g) { return g.k === 'travou' || g.k === 'semrota' || g.k === 'naosaiu'; }));
    const ht = GV2.render.time();
    checar('v5 · Hoje: 5 cartões, cada um com destino; a coluna Jornada; o plano e a jornada abrem o dia na Rua, o nome abre a Pessoa',
      (ht.match(/class="gv2-v5-kpi" data-gv2="[^"]+"/g) || []).length === 5 && /Jornada/.test(ht) && (ht.match(/class="gv2-v5-pp-c[^"]*" data-gv2="v5dia:/g) || []).length === b5.pessoas.length * 2 && (ht.match(/class="gv2-v5-pp-p" data-gv2="pessoa:/g) || []).length === b5.pessoas.length);
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
    checar('gestor: "Visitas com prova" é toda visita com prova contra a meta, com o Plano embaixo (o mesmo par do app)',
      /Visitas com prova<\/small><b class="num">[0-9]+ de [0-9]+<\/b><span>meta do time · plano [0-9]+ de [0-9]+/.test(ht2));
  }
  /* FUNIL e TERRITÓRIO v5 (08/10/26) */
  {
    const nav = GV2.navHTML();
    const rots = (nav.match(/<span class="gv2-nav-rot">[^<]+</g) || []).map(function (x) { return x.replace('<span class="gv2-nav-rot">', '').replace('<', ''); });
    checar('v5 · menu: Hoje · Rua · Funil · Território · Pessoas · Propostas · Playbook (sem Raio X nem Prospecção)', rots.join(' · ') === 'Hoje · Rua · Funil · Território · Pessoas · Propostas · Playbook', rots.join(' · '));
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
      checar('Atualizar HubSpot: botão na Hoje, rota só para gestor (is_field_admin), origem cockpit, e o robô não gera IA em disparo com origem (09/10/26)',
        GV2.render.time().indexOf('data-gv2="hsatu"') > 0 && api.indexOf('/rest/v1/rpc/is_field_admin') > 0 && api.indexOf("inputs: { origem: 'cockpit' }") > 0
          && api.indexOf('PLACEHOLDER') < 0 && wf.indexOf('if [ -n "${{ github.event.inputs.origem }}" ]; then') > 0
          && fsx.readFileSync(px.join(__dirname, '..', 'api', 'hubspot-webhook.js'), 'utf8').indexOf("req.query.acao === 'atualizar'") > 0 && fsx.readdirSync(px.join(__dirname, '..', 'api')).filter(function (f) { return /\.js$/.test(f); }).length <= 12);
    }
    checar('executivo · Meu funil: o R$ dos sem próximo passo usa a lista do movimento (não x.semPasso) e Ag. Pagamento vazio não manda puxar munição (09/10/26)',
      tpl.indexOf('const mrrSemPasso = itens.filter(function (x) { return !(x.est && x.est.passo); })') > 0 && tpl.indexOf('return x.semPasso; })') < 0
        && tpl.indexOf("col.pagto ? 'Os negócios que aceitarem a proposta em Negociação chegam aqui.'") > 0);
    GV2.estado.menu = true;
    const navMenu = GV2.navHTML();
    GV2.estado.menu = false;
    checar('menu do nome tem "Sair da conta" e o clique chega ao sair do perfil (09/10/26: não havia como sair)',
      navMenu.indexOf('data-gv2="menu:sair">Sair da conta<') > 0 && tpl.indexOf("if (o === 'sair') { const bt = document.getElementById('perfilSairBtn');") > 0);
    GV2.estado.aba = 'raiox'; GV2.estado.prf = 'todas';
    const fu = GV2.render.raiox();
    checar('v5 · Funil: 4 cartões do funil, sem o "Funil · Praça" e com "Negócios travados"', (fu.match(/class="gv2-v5-kpi( is-fixo)?"/g) || []).length === 4 && fu.indexOf('data-gv2="rxm:') < 0 && /Negócios travados/.test(fu) && /<h1>Funil<\/h1>/.test(fu));
    const fpp = GV2.render.funilPorPessoa();
    const algumMenor = GV2.base.pessoas.some(function (p) { return p.funil_mes.portas > 0 && p.funil_mes.portas < 3 && p.funil_mes.decisor > 0; });
    checar('v5 · Funil por pessoa: a taxa só aparece com 3 ou mais no passo anterior (senão "—", nunca 400%)', !/>[0-9]{3,}%</.test(fpp) && /a taxa só aparece com 3 ou mais/.test(fpp) && (!algumMenor || /<small>—<\/small>/.test(fpp)));
    /* Território: o Abastecer com a regra C8 (estoque ÷ contas que saíram por semana) */
    const g = global, ant = { R: g.RT7_ESTADO, E: g.rt7Estoque, O: g.rt7Orfao };
    const ids = GV2.base.pessoas.map(function (p) { return p.id; });
    const E = {}; E[ids[0]] = { contas: 30, consumo: 36, semanas: 30 / 36 }; E[ids[1]] = { contas: 40, consumo: 30, semanas: 40 / 30 }; E[ids[2]] = { contas: 50, consumo: null, semanas: null };
    g.RT7_ESTADO = { carregou: true, leads: [{ id: 'x', status: 'pendente', responsavel_owner_id: ids[0], bairro: 'Tijuca', created_at: '2026-10-07T12:00:00Z' }] };
    g.rt7Estoque = function (id) { return E[id] || { contas: 80, consumo: 20, semanas: 4 }; };
    g.rt7Orfao = function () { return { paradas: 722, cidades: ['Vitória/ES'] }; };
    const ab = GV2.render.v5Abastecer();
    const k0 = GV2.v5Estoque(GV2.base.pessoas[0]).k, k1 = GV2.v5Estoque(GV2.base.pessoas[1]).k, k2 = GV2.v5Estoque(GV2.base.pessoas[2]).k;
    g.RT7_ESTADO = ant.R; g.rt7Estoque = ant.E; g.rt7Orfao = ant.O;
    checar('v5 · C8: < 1 semana = sem estoque (Importar), < 1,5 = acompanhar, sem consumo = "consumo não medido"', k0 === 'sem' && k1 === 'acomp' && k2 === 'nao' && /data-gv2="v5rt7:imp:/.test(ab), [k0, k1, k2].join());
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
    checar('v5 · Território: fila de aprovação por dono, território sem dono com o número, e sem jargão', /Fila de aprovação/.test(ab) && /data-gv2="v5rt7:fila:/.test(ab) && /Território sem dono · 722 contas/.test(ab) && !/torneira|munição|backlog/i.test(ab + GV2.render.terr()));
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
  checar('só um bloco vermelho na Praça (as armas que faltam)', (px.match(/is-falta"/g) || []).length <= 1 && /gv2-px-l3 is-falta/.test(px));

  if (falhas.length) {
    console.log('FALHOU: ' + falhas.length);
    falhas.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('gestor v2: ' + ok + ' verificações · tudo certo.');
})().catch(e => { console.log('FALHOU: ' + e.stack); process.exit(1); });
