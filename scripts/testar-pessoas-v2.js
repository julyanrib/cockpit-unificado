/* ══ SUÍTE DA PESSOAS v2 · A SEMANA DE GESTÃO DO LÍDER (02/11/26, design_handoff_gestor_v2) ══════════════
   Roda o bloco gv2 do template de verdade, com um supa e um DATA falsos (as pessoas são Alfa, Beta, Gama e
   Delta; o gestor é o dono 99, que também tem carteira), e confere:
     · PARIDADE: o "sem passo" de cada linha é GV2.semProximoPasso da pessoa, e sobre a fixture do Hoje v3
       (a mesma do app) dá os mesmos negócios da esperada do app; missão, sequência e "abriu o app" saem do
       desenvolvimento_quadro (fixture do Desenvolvimento v2, a mesma do app) com o mesmo texto do DV2;
     · os 4 contadores, o "o que precisa de mim" na ordem 1:1 → campo → reconhecer → fase, e o filtro;
     · as escritas pelos caminhos que já existem (um_a_um, habilidade, gestor_idas_campo, o recado) e as
       novas da 0244 por RPC (reconhecer_destaque, marcar_ida_do_gestor), com o caminho antigo segurando;
     · o mapa de calor e o mapa de horários (fuso de São Paulo, feriado fora);
     · a medição em aberturas_de_tela, que nunca derruba a tela;
     · o ranking e a Disputa saíram da Pessoas e estão no Hoje; nada do que existia sumiu do painel;
     · zero emoji, alvo de clique ≥ 40 px, só tokens --gv2-*, a carteira do gestor fora da placa.
   Com PV2_HTML=<arquivo>, grava o HTML da aba e do painel (com o CSS do template) para conferir no navegador.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const raiz = path.resolve(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };

const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
const codigo = tpl.slice(ini + '<script id="gv2-js">'.length, fim).replace('GV2.instalar();', '');
checar('o bloco gv2 está no template e sem crase (guarda 26)', ini > 0 && fim > ini && codigo.indexOf('`') < 0);

/* ── o mundo falso: 4 pessoas do time e o gestor (dono 99) com carteira própria ── */
const SEG = '2026-10-05';
const dia = (planejadas, provadas) => ({ planejadas, provadas, feitasDoPlano: provadas, feitas: provadas, meta: 6 });
const pessoasRpc = ['1', '2', '3', '4', '99'].map(function (id) { return { ownerId: id, dias: [dia(6, 3), dia(5, 1), dia(5, 0), dia(5, 0), dia(5, 0)], plano: null, ultimo: null }; });
const tabelas = {
  visitas_com_prova: [], fichas_de_rua: [], pontos_eventos: [], client_stage_changes: [], playbook_progresso: [], gestor_idas_campo: [],
  profiles: [{ id: 'u1', id_hubspot: '1' }, { id: 'u2', id_hubspot: '2' }, { id: 'u3', id_hubspot: '3' }, { id: 'u4', id_hubspot: '4' }],
  client_meetings: [{ id: 'm1', client_id: 'c1', created_by: 'u2', scheduled_at: '2026-10-05T15:00:00Z', type: 'reuniao' }, { id: 'm2', client_id: 'c2', created_by: 'u2', scheduled_at: '2026-10-02T15:00:00Z', type: 'follow_up' }],
  fila_feitas: [], dailies: [{ seller_id: 'u1', prometido_visitas: 6 }],
  gestor_v4_leituras: { prospeccao: {}, fonte: [] },
  um_a_um: [
    /* Alfa: 1:1 há 13 dias (atrasado), com 3 combinados */
    { id: 'uu1', owner_id: '1', data: '2026-09-23', canal: 'video', created_at: '2026-09-23T12:00:00Z', compromissos: ['a', 'b', 'c'],
      combinados: [{ texto: 'Plano todo dia', regra: 'plano_diario' }, { texto: 'Duas demos', regra: 'livre', conferencia: 'manual' }, { texto: 'Ficha na hora', regra: 'livre', conferencia: 'manual', resultado: 'cumprido' }] },
    /* Beta: 1:1 nesta semana (segunda) */
    { id: 'uu2', owner_id: '2', data: SEG, canal: 'video', created_at: SEG + 'T12:00:00Z', compromissos: [], combinados: [] },
    /* Gama: 1:1 nesta semana */
    { id: 'uu3', owner_id: '3', data: SEG, canal: 'video', created_at: SEG + 'T12:00:00Z', compromissos: [], combinados: [] },
    /* Delta: 1:1 há 3 dias */
    { id: 'uu4', owner_id: '4', data: '2026-10-03', canal: 'video', created_at: '2026-10-03T12:00:00Z', compromissos: [], combinados: [] }
  ],
  clients: [{ id: 'c1', nome: 'Um', empresa: 'Bar Um', id_hubspot: 'a' }, { id: 'c2', nome: 'Dois', empresa: 'Bar Dois', id_hubspot: null }],
  /* os quadros do "Acelerar" vazios, no formato que as funções devolvem */
  habilidade_quadro: { mes: '2026-10-01', anterior: '2026-09-01', hoje: '2026-10-06', fim: '2026-10-31', ate: '2026-10-06', time: {}, pessoas: [] },
  combinados_quadro: { segunda: SEG, sexta: '2026-10-09', hoje: '2026-10-06', ate: '2026-10-06', pessoas: [] },
  rampa_quadro: { hoje: '2026-10-06', pessoas: [] },
  lider_quadro: { mes: '2026-10-01', pessoas: [] },
  disputa_quadro: { hoje: '2026-10-06', pessoas: [], disputas: [], auditorias: [] },
  previsao_honesta: { mes: '2026-10-01', anterior: '2026-09-01', hoje: '2026-10-06', time: { demos: 0 }, pessoas: [] },
  reconhecimentos_da_semana: []
};
const q = (dados) => { const o = { then: (a, b) => Promise.resolve({ data: dados, error: null }).then(a, b) }; ['select', 'eq', 'gte', 'lt', 'in', 'order', 'limit', 'range', 'not'].forEach(k => { o[k] = () => o; }); return o; };
const rpcLog = [];
const fromLog = [];
global.supa = {
  rpc: (nome, a) => { rpcLog.push({ nome: nome, a: a }); return q(nome === 'planejamento_do_time' ? { pessoas: a.p_segunda === SEG ? pessoasRpc : [], mapa: { checkins: [], plano: [] } } : nome === 'gestor_nomes_dos_clientes' ? tabelas.clients : tabelas[nome] || []); },
  from: (t) => { fromLog.push(t); return q(tabelas[t] || []); }
};
const lead = (id, dono, dias, extra) => Object.assign({ id, ownerId: dono, name: 'N' + id, dias, mrr: 100, slaBreach: false, tarefas: [] }, extra || {});
/* Beta tem 12 negócios abertos sem próximo passo (precisa de campo); o gestor (99) tem 5, que não entram */
const semPassoBeta = [];
for (let i = 0; i < 12; i++) semPassoBeta.push(lead('b' + i, '2', 3, { bairro: 'Centro', lat: -20.31, lng: -40.31 }));
const doGestor = [];
for (let i = 0; i < 5; i++) doGestor.push(lead('g' + i, '99', 3));
global.DATA = {
  reps: [{ ownerId: '1', name: 'Alfa Teste', praca: 'Vitória' }, { ownerId: '2', name: 'Beta Teste', praca: 'Vitória' }, { ownerId: '3', name: 'Gama Teste', praca: 'Vitória' }, { ownerId: '4', name: 'Delta Teste', praca: 'Vitória' }, { ownerId: '99', name: 'Gestor Teste', praca: 'Vitória' }],
  usuarios: [], stageMeta: { slaDays: {} },
  funilLeads: {
    '1395880470': semPassoBeta.concat(doGestor).concat([lead('a1', '1', 2, { tarefas: [{ timestamp: '2026-10-08T12:00:00Z', subject: 'x' }] })]),
    /* Ag. Pagamento sem passo: fica fora do "sem passo" (a regra do app) */
    '1395880473': [lead('ap1', '3', 2)]
  }
};
global.sessaoAtual = { role: 'manager', nome: 'Gestor Teste', ownerId: '99' };
global.metaClientesDoRep = () => 5;
global.proximoPassoDoLead = l => (l.tarefas[0] ? { quando: new Date(l.tarefas[0].timestamp) } : null);
global.mrrDoNegocio = l => l.mrr || null;
global.esc = v => String(v == null ? '' : v);
global.document = { documentElement: { getAttribute: () => 'sol' }, addEventListener: () => {}, getElementById: () => null };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
const relogio = (iso) => { const R = Date; global.Date = class extends R { constructor(...a) { super(...(a.length ? a : [iso])); } static now() { return new R(iso).getTime(); } }; };

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}]/u;
const texto = h => String(h).replace(/<[^>]+>/g, ' ');

(async () => {
  relogio('2026-10-06T14:20:00Z'); // terça 11:20 em São Paulo
  const GV2 = new Function(codigo + '\nreturn GV2;')();
  GV2.pintar = function () {};
  GV2.toast = function () {};
  const b = await GV2.montar();
  GV2.pessoasMontar(b);
  GV2.base = b;
  GV2.estado.aba = 'pessoas';
  const DV2 = GV2.DV2;
  checar('as 5 funções da etapa 1 existem', ['semanaDoLider', 'oQuePrecisaDeMim', 'pautaDo1a1', 'mapaDeCalor', 'mapaDeHorarios'].every(k => typeof GV2[k] === 'function'));

  /* ── a placa é do time: a carteira do gestor não entra ── */
  const time = GV2.pv2Time();
  checar('a placa tem o time inteiro e a carteira do gestor fica de fora', time.length === 4 && !time.some(p => p.id === '99') && !!b.porId['99'], time.map(p => p.id).join());

  /* ══ PARIDADE 1 · "sem passo" é GV2.semProximoPasso, a mesma do Hoje do executivo e da fila do app ══ */
  const F3 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hoje-v3', 'fixture.json'), 'utf8'));
  const E3 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hoje-v3', 'esperado.json'), 'utf8'));
  {
    const sp = F3.semPasso;
    const negs = sp.negocios.map(function (n) {
      const datas = n.tarefas.filter(Boolean).map(t => GV2.diaDe(t));
      if (n.noPlano) datas.push(n.noPlano);
      return { id: n.id, nome: n.nome, agPag: n.etapa === 'pagamento', etapa_idx: 0, proximo_passo: datas.some(d => d >= sp.hoje) ? 'marcado' : null };
    });
    const pessoa = { id: 'x', negocios: negs };
    const ids = GV2.semProximoPasso(negs).map(n => n.id).sort((a, c) => Number(a) - Number(c));
    checar('paridade · o "sem passo" da placa sobre a fixture do Hoje v3 dá os mesmos negócios da esperada do app (Ag. Pagamento fora, Prospecção dentro, vencido conta)',
      GV2.pv2SemPasso(pessoa) === E3.semPasso.length && JSON.stringify(ids) === JSON.stringify(E3.semPasso), ids.join() + ' × ' + E3.semPasso.join());
  }
  const beta = b.porId['2'], gama = b.porId['3'];
  checar('paridade · cada linha mostra GV2.semProximoPasso da pessoa', time.every(p => GV2.pv2SemPasso(p) === GV2.semProximoPasso(p.negocios).length) && GV2.pv2SemPasso(beta) === 12);
  checar('paridade · Ag. Pagamento sem passo não conta', gama.negocios.some(n => n.agPag) && GV2.pv2SemPasso(gama) === gama.negocios.filter(n => !n.agPag && !n.proximo_passo).length);

  /* ══ PARIDADE 2 · missão, sequência e "abriu o app" = desenvolvimento_quadro (o Meu desempenho dele) ══ */
  const FD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'desenvolvimento-v2', 'fixture.json'), 'utf8'));
  const ED = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'desenvolvimento-v2', 'esperado.json'), 'utf8'));
  const resolver = function (nome) { const e = FD.estados[nome]; const base = e.$base ? resolver(String(e.$base)) : {}; const r = Object.assign({}, base, e); delete r.$base; if (r.variavel && r.variavel.faixas === '$faixas') r.variavel = Object.assign({}, r.variavel, { faixas: FD.faixas }); return r; };
  const qQuarta = Object.assign({}, resolver('quarta'), { aberturas: { semana: 2, ultima: '2026-10-06T11:00:00Z' } });
  const qMissao = Object.assign({}, resolver('missao'), { aberturas: { semana: 0, ultima: null } });
  DV2.gestor['1'] = { q: qQuarta }; DV2.gestor['2'] = { q: qMissao }; DV2.gestor['3'] = { q: qQuarta }; DV2.gestor['4'] = { erro: 'fora do ar' };
  DV2.capitulos = function () { return FD.capitulos; };
  let aba = GV2.render.pessoas();
  const linha = function (h, nome) { const i = h.indexOf(nome); const j = h.indexOf('class="pv2-lin', i - 2000 > 0 ? i - 2000 : 0); const lin = h.slice(h.lastIndexOf('<div class="pv2-lin', i), h.indexOf('</div>', h.indexOf('pv2-bt', i)) + 6); return lin; };
  {
    const l1 = linha(aba, 'Alfa Teste');
    const mEsp = ED.quarta.vm.missao.cumprida ? 'cumprida' : ED.quarta.vm.missao.contagem;
    const ruaEsp = /Na rua (\d+) dias?/.exec(ED.quarta.vm.pilula)[1];
    checar('paridade · a missão na placa é a do Meu desempenho (esperada do app)', texto(l1).indexOf(mEsp) >= 0, mEsp + ' em ' + texto(l1).replace(/\s+/g, ' '));
    checar('paridade · "na rua" é a sequência do Meu desempenho (a mesma da pílula do app)', texto(l1).indexOf(ruaEsp + ' dias') >= 0 || texto(l1).indexOf(ruaEsp + ' dia') >= 0, ruaEsp);
    checar('"abriu o app esta semana" sai das aberturas do quadro (sim / não)', /<span class="t-ok"[^>]*>sim<\/span>/.test(l1) && /<span class="t-acao"[^>]*>não<\/span>/.test(linha(aba, 'Beta Teste')));
    checar('o quadro que não respondeu vira "—", nunca 0', /—/.test(texto(linha(aba, 'Delta Teste'))));
  }

  /* ══ os 4 contadores ══ */
  {
    const L = GV2.semanaDoLider();
    const um = L[0];
    checar('contador 1:1: os feitos desta semana contra o time (sem o gestor)', um.n === 2 && um.total === 4 && um.quem.indexOf('1') >= 0 && um.quem.indexOf('4') >= 0, JSON.stringify(um));
    checar('contador 1:1: diz quantos faltam e os atrasados', /2 faltam/.test(um.s) && /1 atrasado/.test(um.s), um.s);
    checar('contador idas: a meta é 2 por semana e diz quem precisa', L[1].total === 2 && L[1].quem.indexOf('2') >= 0 && /Beta precisa/.test(L[1].s), JSON.stringify(L[1]));
    checar('contador combinados: os do último 1:1 com prova conferida', L[3].total === 3 && L[3].n >= 1 && L[3].quem.indexOf('1') >= 0, JSON.stringify(L[3]));
    checar('os 4 contadores na tela, cada um um botão que filtra', (aba.match(/data-gv2="pv2:filtro:/g) || []).length === 4 && /MINHA SEMANA DE LÍDER/.test(aba));
    GV2.estado.pv2Filtro = '1a1';
    const fil = GV2.render.pessoas();
    checar('o filtro apaga (35%) quem não está no contador e oferece "mostrar todos"', /is-apagada/.test(linha(fil, 'Beta Teste')) && !/is-apagada/.test(linha(fil, 'Alfa Teste')) && /mostrar todos/.test(fil));
    GV2.estado.pv2Filtro = null;
  }

  /* ══ o que precisa de mim: 1:1 atrasado → campo → reconhecer → fase ══ */
  {
    const alfa = b.porId['1'], delta = b.porId['4'];
    checar('1:1 atrasado vem primeiro, com "Abrir 1:1"', GV2.oQuePrecisaDeMim(alfa).k === '1a1' && GV2.oQuePrecisaDeMim(alfa).bt === 'Abrir 1:1' && /1:1 atrasado 13 dias/.test(GV2.oQuePrecisaDeMim(alfa).t), JSON.stringify(GV2.oQuePrecisaDeMim(alfa)));
    checar('campo: muito sem passo e longe da rua, com "Marcar ida"', GV2.oQuePrecisaDeMim(beta).k === 'campo' && /12 sem próximo passo · ir a campo/.test(GV2.oQuePrecisaDeMim(beta).t), JSON.stringify(GV2.oQuePrecisaDeMim(beta)));
    const dest0 = GV2.pv2Destaques;
    GV2.pv2Destaques = function () { return { '3': { n: 3, t: 'Ficha na hora', s: '9 de 10 fichas em até 15 min', seg: '2026-09-28' }, '2': { n: 1, t: 'A porta é provada', s: '100%', seg: '2026-09-28' } }; };
    checar('reconhecer: o destaque da sexta pede "Reconhecer"', GV2.oQuePrecisaDeMim(gama).k === 'rec' && GV2.oQuePrecisaDeMim(gama).bt === 'Reconhecer');
    checar('a ordem vale: com 1:1 em dia e destaque, campo vem antes de reconhecer', GV2.oQuePrecisaDeMim(beta).k === 'campo');
    /* reconhecer é inline: a linha fica verde e o executivo recebe no app (RPC da 0244 + o recado) */
    const rec0 = GV2.recado; let recados = [];
    GV2.recado = async function (p, t) { recados.push({ p: p.id, t: t }); return true; };
    rpcLog.length = 0;
    await GV2.pv2Reconhecer('3');
    const r1 = rpcLog.find(x => x.nome === 'reconhecer_destaque');
    checar('reconhecer grava pela RPC reconhecer_destaque (0244) com o combinado e manda o recado ao app', !!r1 && r1.a.p_owner === '3' && r1.a.p_combinado === 3 && recados.length === 1 && recados[0].p === '3', JSON.stringify(r1));
    const depois = GV2.render.pessoas();
    checar('depois de reconhecer: a linha fica okSoft com "reconhecido · aparece no app dele" e o contador sobe', /pv2-lin is-feito/.test(linha(depois, 'Gama Teste')) && /reconhecido · aparece no app dele/.test(linha(depois, 'Gama Teste')) && GV2.semanaDoLider()[2].n === 1 && GV2.semanaDoLider()[2].total === 2);
    /* sem a 0244 (a RPC não existe), o recado segura: avisar, não travar */
    const rpc0 = global.supa.rpc;
    global.supa.rpc = (nome, a) => nome === 'reconhecer_destaque' ? Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'function reconhecer_destaque not found' } }) : rpc0(nome, a);
    await GV2.pv2Reconhecer('2');
    checar('sem a 0244, o reconhecimento fica (o recado chegou) e nada trava', GV2.pv2Reconhecido(beta) && recados.length === 2);
    global.supa.rpc = rpc0;
    GV2.recado = rec0; GV2.pv2Destaques = dest0; GV2.pv2.rec = {};
    /* fase: o novato com a fase vencida */
    GV2.rp.d = { hoje: '2026-10-06', pessoas: [{ pessoa: 'u4', ownerId: '4', nome: 'Delta Teste', inicio: '2026-09-23', turma: '2026-09-23', padrinho: 'u1', padrinhoOwnerId: '1', fases: {}, medido: { demos: 0, visitasBase: 0, semanas: [] } }] };
    GV2.rp.em = Date.now();
    const od = GV2.oQuePrecisaDeMim(delta);
    checar('fase: o novato com a S1 vencida pede "Aprovar fase"', od.k === 'fase' && /S1 venceu 29\/09/.test(od.t) && od.bt === 'Aprovar fase', JSON.stringify(od));
    checar('a trilha compacta do novato: dia, a fase vencida e o padrinho', GV2.pv2Trilha(GV2.pv2Rampa(delta)) === 'dia 14 de 60 · S1 venceu 29/09 · padrinho Alfa', GV2.pv2Trilha(GV2.pv2Rampa(delta)));
  }

  /* ══ a pauta do 1:1 ══ */
  {
    const alfa = b.porId['1'];
    const P = GV2.pautaDo1a1(alfa);
    checar('pauta: 4 partes (conquistas do Meu desempenho, combinados com prova, o número que caiu e a pergunta)', Array.isArray(P.conquistas) && P.conquistas.length > 0 && P.combinados.length === 3 && !!P.caiu && !!P.pergunta, JSON.stringify(P).slice(0, 300));
    checar('pauta: o combinado manual cumprido aparece cumprido; os em aberto oferecem Cumpriu / Não cumpriu', P.combinados[2].r === 'cumprido' && P.combinados[1].r === 'em_aberto' && P.combinados[1].manual);
    checar('pauta: começa desde o último 1:1', P.desde === '2026-09-23' && P.dias === 13);
  }

  /* ══ o painel: tudo o que existia, mais os blocos novos ══ */
  const spy = {};
  ['cbPessoa', 'hbPessoa', 'ldPessoa', 'v6Rua7', 'cbTime', 'hbTime', 'ldTime', 'cfTime'].forEach(function (k) { const f0 = GV2.render[k]; spy[k] = 0; GV2.render[k] = function () { spy[k]++; return f0 ? f0.apply(this, arguments) : ''; }; });
  rpcLog.length = 0;
  GV2.pv2Abrir('1', 'placa', 'um');
  const pan = GV2.render.pessoas();
  {
    checar('painel: o resumo de 5 (Hoje · Mês · Ritmo · Disciplina · Carteira), cada um leva ao bloco', (pan.match(/class="pv2-r"/g) || []).length === 5 && ['HOJE', 'MÊS', 'RITMO', 'DISCIPLINA', 'CARTEIRA'].every(k => pan.indexOf('<small>' + k + '</small>') > 0) && /data-gv2="pv2:anc:funil"/.test(pan));
    checar('painel: as âncoras 1:1 · Agora · Mapa · Ritmo · Disciplina · Funil · Desenvolvimento · Campo', ['um', 'agora', 'mapa', 'ritmo', 'disc', 'funil', 'dev', 'campo'].every(k => pan.indexOf('data-gv2="pv2:anc:' + k + '"') > 0 && pan.indexOf('id="pv2b-' + k + '"') > 0));
    checar('painel: a pauta pronta e o Registrar 1:1 na coluna da esquerda', /PAUTA DO 1:1 PRONTA/.test(pan) && /Registrar 1:1/.test(pan) && /1 · O que conquistou/.test(pan) && /4 · Pergunta sugerida/.test(pan));
    checar('painel: a barra do pé com "Pauta no WhatsApp" e a ação principal', /data-gv2="pauta:wa:1">Pauta no WhatsApp/.test(pan) && /class="pv2-pe"/.test(pan));
    checar('painel: as reuniões sem desfecho com Aconteceu · Remarcar · Não aconteceu (a RPC do app)', (function () { GV2.pv2Abrir('2', 'placa', 'um'); const h = GV2.render.pessoas(); GV2.pv2Abrir('1', 'placa', 'um'); return /v4:desf:2:m1:realizada/.test(h) && /v4:rem:m1/.test(h) && /v4:desf:2:m1:nao_aconteceu/.test(h) && /Cobrar a disciplina/.test(h); })());
    checar('painel: o "sem passo" do resumo, do Funil e da placa é o mesmo número', (function () { GV2.pv2Abrir('2', 'placa'); const h = GV2.render.pessoas(); GV2.pv2Abrir('1', 'placa', 'um'); return h.indexOf('12 sem passo') > 0 && /<small>sem próximo passo<\/small><b class="num t-acao">12<\/b>/.test(h); })());
    checar('nada some: Rua · 7 dias, os 7 combinados, a habilidade, o padrinho e o fim da aba seguem chamados', spy.cbPessoa > 0 && spy.hbPessoa > 0 && spy.ldPessoa > 0 && spy.v6Rua7 > 0 && spy.cbTime > 0 && spy.hbTime > 0 && spy.ldTime > 0 && spy.cfTime > 0, JSON.stringify(spy));
    checar('nada some: a página de antes inteira (Agora e semana, Coaching, Evolução, PDI) no fim do painel', /A página de antes, inteira/.test(pan) && /1 · Agora e semana/.test(pan) && /3 · Coaching/.test(pan) && /4 · Evolução/.test(pan) && /5 · PDI/.test(pan));
    checar('nada some: as gavetas (1:1 completo, disciplina, funil com o Como contamos, campo, PDI) e a rotação', ['um', 'disc', 'funil', 'campo', 'pdi'].every(t => pan.indexOf('data-gv2="v5gav:' + t + ':1"') > 0) && /data-gv2="p3:rotacao"/.test(pan)
      && (function () { GV2.estado.v5Gav = { t: 'funil', id: '1' }; const h = GV2.render.pessoas(); GV2.estado.v5Gav = null; return /Como contamos/.test(h); })());
    checar('painel: o Desenvolvimento mostra o que ele vê no app e "Ver como ele vê"', /DESENVOLVIMENTO · O QUE ELE VÊ NO APP/.test(pan) && /data-gv2="pv2:ver:1"/.test(pan) && pan.indexOf(ED.quarta.vm.missao.contagem) > 0);
    GV2.estado.pv2Ver = '1';
    const ver = GV2.render.pessoas();
    GV2.estado.pv2Ver = null;
    checar('"Ver como ele vê" monta o Meu desempenho dele com o mesmo DV2', /O Meu desempenho de Alfa/.test(ver) && ver.indexOf('dv2') > 0);
  }

  /* ══ registrar 1:1: até 3 dos 7 combinados + a habilidade, pelo caminho que já existe ══ */
  {
    ['1', '2', '3', '4'].forEach(n => GV2.pv2Comando('pv2', ['pv2', 'comb', '1', n]));
    checar('no máximo 3 combinados: o 4º fica de fora', JSON.stringify(GV2.estado.pv2Sel['1']) === '[1,2,3]', JSON.stringify(GV2.estado.pv2Sel['1']));
    const h = GV2.render.pessoas();
    checar('o 4º chip fica desativado e o botão diz "Registrar 1:1 · 3 combinados"', /pv2-op is-off" data-gv2="pv2:comb:1:4"/.test(h) && /Registrar 1:1 · 3 combinados/.test(h));
    const ins = []; const supa0 = global.supa;
    global.supa = Object.assign({}, supa0, { from: function (t) { const o = q([]); o.insert = function (x) { ins.push({ t: t, x: x }); return { select: () => ({ single: () => Promise.resolve({ data: Object.assign({ id: 'novo', created_at: '2026-10-06T14:20:00Z' }, x), error: null }) }), then: (a, c) => Promise.resolve({ error: null }).then(a, c) }; }; o.update = function (x) { ins.push({ t: t, up: x }); return q(null); }; return o; } });
    const rec0 = GV2.recado, cd0 = GV2.comDesfazer, hb0 = GV2.hbCombinar; let recados = 0, hb = null;
    GV2.recado = async function () { recados++; return true; };
    GV2.comDesfazer = function (id, f) { return f(); };
    GV2.hbCombinar = async function (pessoa, mes) { hb = { pessoa: pessoa, mes: mes, form: GV2.estado.hbForm }; };
    GV2.hb.d = { mes: '2026-10-01', anterior: '2026-09-01', hoje: '2026-10-06', fim: '2026-10-31', ate: '2026-10-06', time: { anterior: { p: 100, f: 50, o: 20, m: 10, c: 3, pessoas: 4 }, atual: { p: 10, f: 5, o: 2, m: 1, c: 0, pessoas: 4 } },
      pessoas: [{ pessoa: 'u1', ownerId: '1', nome: 'Alfa Teste', dias: [{ d: '2026-09-10', p: 20, f: 10, o: 2, m: 2, c: 1 }], habilidade: null }] };
    GV2.pv2Comando('pv2', ['pv2', 'hab', '1', 'dono']);
    await GV2.pv2Registrar1a1('1');
    const um = ins.find(x => x.t === 'um_a_um');
    checar('o 1:1 grava em um_a_um (canal vídeo) com os 3 combinados dos 7 do time e a origem', !!um && um.x.canal === 'video' && um.x.combinados.length === 3 && um.x.combinados.every(c => c.origem === 'os 7 combinados' && c.prazo) && um.x.combinados[0].combinado === 1, JSON.stringify(um && um.x).slice(0, 300));
    checar('cada combinado vai para o app dele aceitar (o recado), e a habilidade pelo habilidades_mes', recados === 3 && !!hb && hb.pessoa === 'u1' && hb.form.taxa === 'dono');
    const ok2 = GV2.render.pessoas();
    checar('depois: "1:1 registrado" e "O 1:1 conta N de M na sua semana"', /1:1 registrado/.test(ok2) && /Foram para o app do Alfa aceitar\. O 1:1 conta \d+ de 4 na sua semana/.test(ok2));
    GV2.recado = rec0; GV2.comDesfazer = cd0; GV2.hbCombinar = hb0; global.supa = supa0; GV2.hb.d = null; GV2.estado.pv2Ok = {};
  }

  /* ══ marcar ida e o "como foi" em 3 toques ══ */
  {
    const supa0 = global.supa, regs = [];
    let rpcFalta = true;
    global.supa = { rpc: function (nome, a) { regs.push({ rpc: nome, a: a }); if (nome === 'marcar_ida_do_gestor' && rpcFalta) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.marcar_ida_do_gestor' } }); return supa0.rpc(nome, a); },
      from: function (t) { const o = q([]); o.insert = function (x) { regs.push({ t: t, ins: x }); return { select: () => ({ single: () => Promise.resolve({ data: x, error: null }) }), then: (a, c) => Promise.resolve({ error: null }).then(a, c) }; }; o.update = function (x) { regs.push({ t: t, up: x }); return q(null); }; return o; } };
    const rec0 = GV2.recado, car0 = GV2.carregar; let recado = '';
    GV2.recado = async function (p, t) { recado = t; return true; };
    GV2.carregar = async function () {};
    GV2.pv2Abrir('2', 'placa');
    checar('quem precisa de campo abre o painel já em "Ir a campo"', GV2.pv2Modo(beta) === 'ida' && /IR A CAMPO/.test(GV2.render.pessoas()));
    GV2.pv2Comando('pv2', ['pv2', 'dia', '2', '2026-10-07']);
    await GV2.pv2MarcarIda('2');
    const ida = regs.find(x => x.t === 'gestor_idas_campo' && x.ins);
    checar('marcar ida chama marcar_ida_do_gestor (0244) e, sem ela, grava a ida em gestor_idas_campo com o dia dele', regs[0].rpc === 'marcar_ida_do_gestor' && regs[0].a.p_owner === '2' && regs[0].a.p_dia === '2026-10-07' && !!ida && ida.ins.dia_por_owner['2'] === '2026-10-07' && ida.ins.status === 'confirmada', JSON.stringify(regs).slice(0, 400));
    checar('o app mostra: o recado "Acompanhamento do gestor"', /^Acompanhamento do gestor: .* qua 07\/10, de manhã/.test(recado), recado);
    const h = GV2.render.pessoas();
    checar('depois de marcar: "Marcada" e o "como foi" em 3 toques', /Marcada: qua 07\/10, manhã/.test(h) && /como foi \(3 toques\)/.test(h) && /responda os 3 \(0 de 3\)/.test(h));
    ['bom', 'decisor', '2'].forEach((v, i) => GV2.pv2Comando('pv2', ['pv2', 'cf', '2', String(i), v]));
    regs.length = 0;
    await GV2.pv2ComoFoi('2');
    const cf = regs.find(x => x.t === 'um_a_um');
    checar('o "como foi" grava onde a devolutiva de campo já é gravada (um_a_um, canal campo) com o combinado', !!cf && cf.ins.canal === 'campo' && cf.ins.devolutiva.como_foi === 'bom' && cf.ins.devolutiva.pesa === 'decisor' && cf.ins.combinados[0].combinado === 2, JSON.stringify(cf && cf.ins).slice(0, 300));
    rpcFalta = false; regs.length = 0;
    GV2.estado.pv2Dia['3'] = '2026-10-08';
    await GV2.pv2MarcarIda('3');
    checar('com a 0244 aplicada, a RPC faz tudo e a tabela não é escrita pelo cliente', regs.length === 1 && regs[0].rpc === 'marcar_ida_do_gestor');
    global.supa = supa0; GV2.recado = rec0; GV2.carregar = car0; GV2.estado.pv2Ok = {}; GV2.estado.pv2Cf = {};
  }

  /* ══ o mapa de calor e o mapa de horários ══ */
  {
    const v = (dono, dia, hora, bairro, lat, cli) => ({ dono: dono, dia: dia, em: dia + 'T' + hora + ':00Z', bairro: bairro, lat: lat, lng: -40.3, client_id: cli });
    GV2.pv2.vis = [
      v('1', '2026-10-05', '13:00', 'Centro', -20.31, 'k1'), v('1', '2026-10-05', '14:30', 'Centro', -20.311, 'k2'), v('1', '2026-10-01', '12:10', 'Praia', -20.33, 'k3'),
      v('2', '2026-10-05', '19:00', 'Praia', -20.331, 'k4'), v('99', '2026-10-05', '13:00', 'Centro', -20.31, 'k5'),
      /* 12/10 é feriado: fora do mapa de horários */
      v('1', '2026-10-12', '13:00', 'Centro', -20.31, 'k6')
    ];
    const MT = GV2.mapaDeCalor(null, 'visitas');
    checar('mapa do time: bairros pela contagem de visitas com prova, sem a carteira do gestor', MT.lista[0].b === 'Centro' && MT.lista[0].n === 3 && MT.total === 5 && MT.lista[0].quem[0] === 'Alfa', JSON.stringify(MT.lista));
    checar('mapa do time: bairro da carteira sem visita aparece tracejado', (function () { const h = GV2.render.pessoas(); return MT.semVisita.length === 0 || /pv2-bl is-sem/.test(h); })());
    const Hr = GV2.mapaDeHorarios(b.porId['1']);
    checar('mapa de horários: seg 10h e seg 11h (fuso de São Paulo), qui 9h, feriado fora', Hr.grade[0][2] === 1 && Hr.grade[0][3] === 1 && Hr.grade[3][1] === 1 && Hr.n === 3, JSON.stringify(Hr.grade));
    const MC = GV2.mapaDeCalor(beta, 'carteira');
    checar('lente "carteira sem visita": os negócios abertos em bairro sem nenhuma visita', MC.semVisita.some(z => z.b === 'Centro' && z.neg === 12) && MC.pts.length === 12, JSON.stringify(MC.semVisita));
    checar('o km por dia e o "no bairro do dia" saem das visitas com prova', GV2.pv2KmDia(GV2.pv2Visitas('1')) != null && GV2.pv2NoBairroDoDia(GV2.pv2Visitas('1')) === 100);
    GV2.estado.pv2TPes = '1';
    const ht = GV2.render.pessoas();
    checar('o chip de uma pessoa: "ele vai aqui" e "abrir a página do Alfa"', /ele vai aqui/.test(ht) && /abrir a página do Alfa/.test(ht));
    GV2.estado.pv2TPes = null;
  }

  /* ══ medição: a Pessoas e a página de cada pessoa, sem nunca derrubar a tela ══ */
  {
    GV2.pv2.medidas = {}; rpcLog.length = 0;
    GV2.estado.pv2Pan = null;
    GV2.render.pessoas();
    GV2.pv2Abrir('4', 'mapa');
    await new Promise(r => setTimeout(r, 0));
    const ab = rpcLog.filter(x => x.nome === 'registrar_abertura');
    checar('mede a abertura da Pessoas e da página da pessoa (pessoa:{id}) pela registrar_abertura', ab.length === 2 && ab[0].a.p_tela === 'pessoas' && ab[1].a.p_tela === 'pessoa:4' && ab[1].a.p_origem === 'mapa' && ab[1].a.p_acao === 'aberto', JSON.stringify(ab));
    GV2.pv2.medidas = {};
    const rpc0 = global.supa.rpc;
    global.supa.rpc = function (nome) { if (nome === 'registrar_abertura') throw new Error('caiu'); return rpc0.apply(this, arguments); };
    let quebrou = false; try { GV2.render.pessoas(); } catch (e) { quebrou = true; }
    global.supa.rpc = rpc0;
    checar('a falha da medição é engolida', !quebrou);
    GV2.estado.pv2Pan = null;
  }

  /* ══ o ranking e a Disputa saíram da Pessoas e estão no Hoje ══ */
  {
    GV2.v6Placar.estado = 'ok'; GV2.v6Placar.em = Date.now();
    GV2.v6Placar.dados = { segunda: '2026-10-05', sexta: '2026-10-09', lidoEm: '2026-10-06T14:00:00Z', linhas: [{ pos: 1, ownerId: '1', nome: 'Alfa Teste', pontos: 28, vendas: 0, reunioes: 1, visitas: 1 }], anterior: null };
    const p = GV2.render.pessoas();
    let h = ''; try { GV2.estado.aba = 'time'; h = GV2.render.time(); } catch (e) { falhas.push('hoje: ' + e.message); }
    GV2.estado.aba = 'pessoas';
    checar('a Pessoas não tem ranking: sem o placar, sem "1º leva R$ 250" e sem o resultado do mês', !/gv2-v6-placar/.test(p) && !/R\$ 250/.test(p) && !/Resultado do mês/.test(p));
    checar('na Pessoas fica só a pílula "ranking e disputa da semana ficam no Hoje", que abre o Hoje', /ranking e disputa da semana ficam no Hoje/.test(p) && /data-gv2="pv2:hoje"/.test(p));
    checar('o Hoje mostra o placar da semana (a Disputa dos R$ 250) e o resultado do mês, com a mesma fonte', /id="gv2-hoje-ranking"/.test(h) && /Como o time se vê · melhor da semana/.test(h) && /1º leva R\$ 250/.test(h) && /Resultado do mês/.test(h) && /Ver o ranking completo/.test(h));
  }

  /* ══ as regras da tela ══ */
  {
    GV2.pv2Abrir('1', 'placa', 'um');
    const tudo = GV2.render.pessoas();
    GV2.estado.pv2Pan = null;
    const css = tpl.slice(tpl.indexOf('/* ══ PESSOAS v2 · a semana de gestão do líder'), tpl.indexOf('</style><!-- /gv2-css -->'));
    checar('zero emoji na aba e no painel', !EMOJI.test(tudo), (tudo.match(EMOJI) || [])[0]);
    checar('o bloco novo do gv2 não tem emoji', !EMOJI.test(codigo.slice(codigo.indexOf('PESSOAS v2 · A SEMANA DE GESTÃO'))));
    const alvos = ['.pv2-bt', '.pv2-chip', '.pv2-op', '.pv2-anc button', '.pv2-pilula', '.pv2-sp', '.pv2-pes', '.pv2-link', '.pv2-seg button', '.pv2-cont'];
    const semPiso = alvos.filter(function (s) { const i = css.indexOf('.gv2 ' + s + '{'); if (i < 0) return true; const r = css.slice(i, css.indexOf('}', i)); const m = /min-height:(\d+)px/.exec(r) || /(?:^|[;{])height:(\d+)px/.exec(r); return !m || Number(m[1]) < 40; });
    checar('alvo de clique com 40 px ou mais em todo botão novo', !semPiso.length, semPiso.join(', '));
    checar('só tokens --gv2-* (nenhuma cor solta além do branco sobre a cor de ação)', !(css.match(/#[0-9A-Fa-f]{3,6}\b/g) || []).some(c => c.toUpperCase() !== '#FFFFFF'), (css.match(/#[0-9A-Fa-f]{3,6}\b/g) || []).join());
    checar('Poppins: o bloco usa a fonte do token', (css.match(/font:[^;]*var\(--gv2-font\)/g) || []).length > 20 && !/font-family:(?!var\(--gv2-font\))[^;]+;/.test(css));
    checar('ninguém é desenhado "saindo": a aba mostra todo mundo, sem estado de saída', time.every(p => tudo.indexOf(p.nome) > 0) && !/saindo/i.test(texto(tudo)));
    checar('"0 de 0" não aparece', !/(^|[^0-9])0 de 0([^0-9]|$)/.test(texto(tudo).replace(/\s+/g, ' ')));
  }

  if (process.env.PV2_HTML) {
    const i0 = tpl.indexOf('<style id="gv2-css">'), f0 = tpl.indexOf('</style><!-- /gv2-css -->');
    const css = tpl.slice(i0 + '<style id="gv2-css">'.length, f0);
    GV2.estado.pv2Pan = null;
    const t1 = GV2.render.pessoas();
    GV2.pv2Abrir(process.env.PV2_PESSOA || '1', 'placa', process.env.PV2_MODO || null);
    const t2 = GV2.render.pessoas();
    const pag = (corpo, tema) => '<!doctype html><html lang="pt-BR"' + (tema === 'escuro' ? ' data-tema="escuro"' : '') + '><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{margin:0;font-family:Poppins}' + css + '</style></head><body><div id="gv2Raiz"><div class="gv2' + (GV2.navClasse ? GV2.navClasse() : '') + '">' + (GV2.navHTML ? GV2.navHTML() : '') + '<main class="gv2-main">' + corpo + '</main></div></div></body></html>';
    ['claro', 'escuro'].forEach(function (tema) {
      fs.writeFileSync(process.env.PV2_HTML + '-aba-' + tema + '.html', pag(t1, tema));
      fs.writeFileSync(process.env.PV2_HTML + '-painel-' + tema + '.html', pag(t2, tema));
    });
  }

  if (falhas.length) {
    console.log('FALHAS (' + falhas.length + '):');
    falhas.forEach(f => console.log('  ✗ ' + f));
    console.log('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
    process.exit(1);
  }
  console.log('pessoas v2: ' + ok + ' verificações · tudo certo.');
})().catch(function (e) { console.log('FALHOU: ' + (e && e.stack || e)); process.exit(1); });
