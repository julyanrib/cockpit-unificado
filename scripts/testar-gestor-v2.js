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
  rpc: (nome, a) => q(nome === 'planejamento_do_time' ? { pessoas: a.p_segunda === SEG ? pessoasRpc : [], mapa: { checkins: [], plano: [] } } : tabelas[nome] || []),
  from: (t) => q(tabelas[t] || [])
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
      const dv = nums(h, /class="dv-num"><small>[^<]*<\/small><b[^>]*>([^<]*)<\/b>/g);
      const ge = nums(g, /<small>[^<]*<\/small><b[^>]*>([^<]*)<\/b>/g).slice(1);
      const so = function (t) { return (String(t).match(/[0-9]+(,[0-9]+)?|—/g) || []).join(' '); };
      checar('desenvolvimento: os 4 números do topo de ' + p.nome + ' são os do resumo da Pessoas (mesma base)', dv.length === 4 && ge.length >= 4 && dv.every(function (v, i) { return so(v) === so(ge[i]); }), JSON.stringify({ dv: dv, gestor: ge }));
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
    checar('desenvolvimento: a frase do topo segue a ordem das regras (véspera > primeiro 1:1 > ... > reuniões)', /^Feche as reuniões que passaram: 25 esperando desfecho\.$/.test(f1.t) && f1.ir === 'disc' && /^Seu primeiro 1:1 é terça\./.test(f2.t) && /^Amanhã às 08:30: 1 combinado em aberto\.$/.test(f3.t), [f1.t, f2.t, f3.t].join(' | '));
    const um2 = DV.proximo1a1({ iso: '2026-10-07', min: 600, dow: 3 });
    checar('desenvolvimento: 1:1 de segunda que cai em feriado vai para o próximo dia útil, mesma hora', um2.dia === '2026-10-13' && um2.hora === '08:30', JSON.stringify(um2));
  })();
  checar('sidebar: o selo do Time é o número de exceções da aba Time (a mesma função) e some com 0', (function () {
    const n = GV2.excecoesLista().length, h = GV2.navHTML();
    const m = h.match(/class="gv2-badge">(\d+)</);
    const orig = GV2.excecoesLista; GV2.excecoesLista = function () { return []; }; const h0 = GV2.navHTML(); GV2.excecoesLista = orig;
    return n > 0 && m && Number(m[1]) === n && h0.indexOf('gv2-badge') < 0 && h0.indexOf('gv2-nav-ponto') < 0;
  })(), String(GV2.excecoesLista().length));
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
  checar('v4: Pessoas tem a âncora Disciplina entre Ritmo e Funil, o resumo de 5 e nenhum "Chamar"',
    p3.indexOf('data-p3-sec="disc"') > p3.indexOf('data-p3-sec="ritmo"') && p3.indexOf('data-p3-sec="disc"') < p3.indexOf('data-p3-sec="funil"') && (p3.match(/class="gv2-v4-res"/g) || []).length === 5 && p3.indexOf('p3:chamar') < 0);
  checar('Pessoas v3: as 5 seções em ordem, a lista "Quem precisa de você", a barra do pé e o botão da rotação',
    ['agora', 'ritmo', 'funil', 'um', 'campo'].every(function (s, i, a) { return i === 0 || p3.indexOf('data-p3-sec="' + s + '"') > p3.indexOf('data-p3-sec="' + a[i - 1] + '"'); })
      && /Quem precisa de você/.test(p3) && /class="gv2-p3-pe"/.test(p3) && /data-gv2="p3:rotacao"/.test(p3) && !/Sua rotação de campo/.test(p3));
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
  checar('Negócios ganha a coluna Sistema, com "não registrado" e o clique para a Praça', /Sistema/.test(rxf) && /não registrado/.test(rxf) && /data-gv2="pxsis:vv:Saipos"/.test(rxf));
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
  try { px = GV2.render.raiox(); } catch (e) { falhas.push('Praça: ' + e.message); }
  if (process.env.DEBUG_PX) require('fs').writeFileSync(process.env.DEBUG_PX, px);
  checar('a Praça desenha: Onde atacar por bairro (grafias juntas), Contra quem, armas e o painel do concorrente',
    /Praia do Canto/.test(px) && /<span class="num cel-forte">2<\/span>/.test(px) && /As armas que faltam/.test(px) && /Concorrente · Vitória/.test(px) && /Cobrar os 2/.test(px));
  checar('Visitas, Clientes e Em queda sem ponto na praça viram "sem dado", nunca zero', (px.match(/sem dado<\/span>/g) || []).length === 3, String((px.match(/sem dado<\/span>/g) || []).length));
  /* Pessoas › Funil e o mapa grande (06/10/26) */
  GV2.estado.cz = null; GV2.estado.aba = 'pessoas'; GV2.estado.pmodo = 'funil'; GV2.estado.pessoa = '1';
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
  const um = GV2.render.pessoas();
  checar('1:1: + Combinado, Tirar, prazo que troca e Automático | Você confere em cada cartão', /data-gv2="comb:add:1"/.test(um) && /data-gv2="comb:tirar:1:0"/.test(um) && /data-gv2="p3:prazo:1:0"/.test(um) && /data-gv2="p3:conf:1:0:manual"/.test(um));
  /* a barra do pé segue a seção em foco (§8) */
  const pe = function (s) { return GV2.p3Pe(ana1, s); };
  checar('barra do pé: 1:1 → Registrar 1:1 · 3 combinados; Disciplina → Cobrar a disciplina; Funil → Cobrar os 2; Campo → Marcar ida; sempre Pauta e nunca Chamar (v4)',
    /Registrar 1:1 · 3 combinados/.test(pe('um')) && /Cobrar a disciplina/.test(pe('disc')) && /Cobrar os 2/.test(pe('funil')) && /Marcar ida/.test(pe('campo')) && ['agora', 'ritmo', 'disc', 'funil', 'um', 'campo'].every(function (s) { return !/p3:chamar/.test(pe(s)) && /data-gv2="pauta:wa:1"/.test(pe(s)); }));
  checar('barra do pé: sem plano pede o plano até 15h; plano com 0 provadas → Cobrar a primeira visita (v4)', /Pedir o plano até 15h|Pedir o plano de amanhã/.test(pe('agora')) && /v4:cobrarvisita:2/.test(GV2.p3Pe(GV2.base.porId['2'], 'agora')));
  /* nada some: o texto do combinado fica ao trocar de pessoa e voltar */
  GV2.estado.comb1a1['1'][0].texto = 'Texto que não pode sumir';
  GV2.estado.pessoa = '2'; GV2.render.pessoas(); GV2.estado.pessoa = '1';
  checar('nada some: digitar num combinado, trocar de pessoa e voltar mantém o texto', /Texto que não pode sumir/.test(GV2.render.pessoas()));
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
  GV2.estado.aba = 'rua'; GV2.estado.rua = 'rotas'; GV2.estado.ruaSel = '1'; GV2.estado.rotaDia = null;
  const pintarOrig = GV2.pintar; GV2.pintar = function () {};
  await GV2.rotaLer(GV2.rotaSegunda(), true);
  GV2.pintar = pintarOrig;
  const rr = GV2.render.rua();
  const ordem = rr.indexOf('Cantina Sol') >= 0 && rr.indexOf('Cantina Sol') < rr.indexOf('Bar do Zé');
  checar('Rua › Rotas: hoje, na ordem da hora, a feita marcada, sem o plano dos outros', ordem && /is-feita/.test(rr) && !/Da Bia/.test(rr) && !/Padaria/.test(rr) && /data-gv2-rotamapa="1\|2026-10-05\|2026-10-06"/.test(rr));
  checar('Rua › Rotas: o chip do pino (0175) aparece com o mesmo rótulo do app', /<b>Cantina Sol<\/b><small>Demo/.test(rr) && /<b>Bar do Zé<\/b><small>visita/.test(rr));
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
  GV2.estado.rotaDia = 'semana';
  const rs = GV2.render.rua();
  checar('Rua › Rotas › Semana: os dias juntos, e a parada sem endereço contada', /Padaria/.test(rs) && /sem endereço/.test(rs) && /fica fora do mapa/.test(rs));
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
