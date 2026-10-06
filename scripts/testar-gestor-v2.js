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
checar('a flag desliga por padrão: só ?gv2=1 ou localStorage.gv2 === "1" ligam',
  /return localStorage\.getItem\('gv2'\) === '1';/.test(codigo));
checar('aplicarVisaoPorPapel chama GV2.ligar', tpl.indexOf("if (typeof GV2 !== 'undefined' && GV2.ligar) GV2.ligar();") > 0);

/* ── o mundo falso ── */
const HOJE = '2026-10-06'; // terça
const SEG = '2026-10-05';
const dia = (planejadas, provadas, meta) => ({ planejadas, provadas, feitasDoPlano: provadas, feitas: provadas, meta: meta || 6 });
const pessoasRpc = [
  { ownerId: '1', dias: [dia(6, 3), dia(0, 0), dia(5, 0), dia(5, 0), dia(5, 0)], plano: { promessaDadaEm: '2026-10-05' }, ultimo: { em: '2026-10-05T20:00:00Z', lat: -20.3, lng: -40.3 } },
  { ownerId: '2', dias: [dia(6, 6), dia(6, 0), dia(6, 0), dia(6, 0), dia(6, 0)], plano: null, ultimo: null },
  { ownerId: '3', dias: [dia(4, 4), dia(4, 2, 4), dia(4, 0, 4), dia(4, 0, 4), dia(4, 0, 4)], plano: { promessaDadaEm: 'x' }, ultimo: null }
];
const tabelas = {
  visitas_com_prova: [{ owner_id: '1', provada: true }, { owner_id: '1', provada: true }, { owner_id: '2', provada: true }, { owner_id: '2', provada: false }],
  fichas_de_rua: [{ owner_id: '1' }],
  pontos_eventos: [{ owner_id: '2', tipo: 'contrato' }, { owner_id: '2', tipo: 'demo_realizada' }, { owner_id: '3', tipo: 'contrato' }, { owner_id: '3', tipo: 'estorno' }],
  client_stage_changes: [], um_a_um: [], playbook_progresso: [], clients: []
};
const q = (dados) => { const o = { then: (a, b) => Promise.resolve({ data: dados, error: null }).then(a, b) }; ['select', 'eq', 'gte', 'in', 'order', 'limit'].forEach(k => { o[k] = () => o; }); return o; };
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
    '1395880473': [lead('c', '3', 1, 200, false, true)],
    '1395880470': [lead('d', '1', 6, 0, true, false)]
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

(async () => {
  relogio('2026-10-06T14:20:00Z'); // 11:20 em Brasília
  const GV2 = new Function(codigo + '\nreturn GV2;')();
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
  checar('provável = fechados + 50% quentes + 20% mornos', bia.provavel === 2 && ana.provavel === 1 + 0, 'bia ' + bia.provavel + ' ana ' + ana.provavel);
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

  if (falhas.length) {
    console.log('FALHOU: ' + falhas.length);
    falhas.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('gestor v2: ' + ok + ' verificações · tudo certo.');
})().catch(e => { console.log('FALHOU: ' + e.stack); process.exit(1); });
