/* ============================================================================
   TERRITÓRIO v3 · O MOTOR DE PROSPECÇÃO DA PRAÇA (02/11/26)

   design_handoff_territorio_v3: a aba ganha a decisão do gestor (a carga por semana) e três
   ações em lote, e nenhuma delas grava no plano de ninguém. Esta suíte roda o bloco gv2 do
   template de verdade num mundo falso (segunda 02/11/26) e prova:
     · PARIDADE: os totais de "Por executivo · 30 dias" = o funil do programa, em todas as
       praças e em cada uma (atribuídos, na rota, visitados, negócios);
     · o funil: entraram ⊇ atribuídos ⊇ na rota ⊇ negócios; o gargalo é a menor passagem;
     · visita = com prova (sem prova não conta), no pino do lead;
     · a carga: N por executivo, os que vencem primeiro, sem visitado, sem quem já está na rota
       ou já tem sugestão viva; a semana do plano vira no sábado;
     · o resgate: vence = 76 a 90 dias sem visita e sem negócio; o destino é o dono do bairro
       (com o dia dele lá), e bairro sem dono vai para "deixar sair";
     · nada é gravado no plano: as ações só chamam as funções de sugestão do servidor, nunca
       update/insert em leads_prospeccao nem em planos_semanais;
     · sem a atualização do servidor a tela mostra os números, avisa e não grava;
     · um motor só: a sugestão do gestor passa na frente das contas-alvo no PLV3.sugestoes,
       que continua só no bairro do dia;
     · nada da v2 sumiu (aviso de carga, filtro de praça, 5 números, Onde agir, mapa, Por
       executivo, Contra quem); zero emoji; sem jargão técnico na tela; alvo ≥ 40 px;
     · a medição registra a tela 'territorio'.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };

const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
checar('o bloco gv2 está no template', ini > 0 && fim > ini);
const codigo = tpl.slice(ini + '<script id="gv2-js">'.length, fim).replace('GV2.instalar();', '');
checar('o Território v3 está no bloco gv2', codigo.indexOf('TERRITÓRIO v3 (02/11/26') > 0);
checar('o bloco gv2 continua sem crase', codigo.indexOf('`') < 0);

/* ── o mundo falso: segunda 02/11/26, 09:00 em Brasília ── */
const R = Date;
global.Date = class extends R { constructor(...a) { super(...(a.length ? a : ['2026-11-02T12:00:00Z'])); } static now() { return new R('2026-11-02T12:00:00Z').getTime(); } };
global.esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
global.document = undefined;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
global.sessaoAtual = { role: 'manager', ownerId: '99' };
global.DATA = { territorios: [
  { rep: 'Ana Lima', areas: [{ municipio: 'Rio de Janeiro', bairros: ['Taquara', 'Freguesia (Jacarepaguá)'] }] },
  { rep: 'Beto Reis', areas: [{ municipio: 'Rio de Janeiro', bairros: ['Méier'] }] },
  { rep: 'Caio Melo', areas: [{ municipio: 'Vila Velha', todoOMunicipio: true }] },
  { rep: 'Gil Saiu', ativo: false, areas: [{ municipio: 'Rio de Janeiro', bairros: ['Anil'] }] }
] };
const recados = [];
global.pt6EnviarRecado = async (id, texto) => { recados.push({ id, texto }); return true; };

const CDD = 'Casa dos Dados';
const TAQ = { lat: -22.921, lng: -43.372 }, MEI = { lat: -22.902, lng: -43.280 }, ANIL = { lat: -22.951, lng: -43.338 };
const L = (id, dono, bairro, cidade, abertura, criado, extra) => Object.assign({ id, nome: 'RESTAURANTE ' + id.toUpperCase(), fonte: CDD, status: 'atribuido', responsavel_owner_id: dono, bairro, cidade,
  data_abertura: abertura + 'T00:00:00+00:00', created_at: criado, endereco: 'RUA ' + id.toUpperCase() }, extra || {});
global.RT7_ESTADO = { carregou: true, cargas: [], leads: [
  /* Ana · Taquara · entraram em 20/10 */
  L('a1', '1', 'Taquara', 'Rio de Janeiro', '2026-10-01', '2026-10-20T13:00:00Z', Object.assign({}, TAQ)),          // visitado com prova + negócio
  L('a2', '1', 'Taquara', 'Rio de Janeiro', '2026-10-02', '2026-10-20T13:00:00Z', Object.assign({ status: 'na_rota', data_rota: '2026-11-03' }, TAQ)), // na rota
  L('a3', '1', 'Taquara', 'Rio de Janeiro', '2026-10-03', '2026-10-20T13:00:00Z', Object.assign({}, TAQ)),          // esteve na grade (n-a3)
  L('a4', '1', 'Taquara', 'Rio de Janeiro', '2026-10-04', '2026-10-20T13:00:00Z', Object.assign({}, TAQ)),          // só atribuído (já tem sugestão viva)
  L('a5', '1', 'Taquara', 'Rio de Janeiro', '2026-10-05', '2026-10-21T13:00:00Z', Object.assign({}, TAQ)),          // visita SEM prova: não é visitado
  /* Beto · Méier */
  L('b1', '2', 'Méier', 'Rio de Janeiro', '2026-10-10', '2026-10-25T13:00:00Z', Object.assign({}, MEI)),            // visitado + negócio
  L('b2', '2', 'Méier', 'Rio de Janeiro', '2026-10-11', '2026-10-25T13:00:00Z', Object.assign({}, MEI)),
  L('b3', '2', 'Méier', 'Rio de Janeiro', '2026-10-12', '2026-10-26T13:00:00Z', Object.assign({}, MEI)),
  /* Caio · Vila Velha */
  L('c1', '3', 'Praia da Costa', 'Vila Velha', '2026-10-10', '2026-10-25T13:00:00Z'), L('c2', '3', 'Itapuã', 'Vila Velha', '2026-10-11', '2026-10-25T13:00:00Z'),
  /* sem dono no time: entram, não são atribuídos */
  L('s1', null, 'Anil', 'Rio de Janeiro', '2026-10-15', '2026-10-20T13:00:00Z', Object.assign({ status: 'pendente' }, ANIL)),
  L('g1', '77', 'Taquara', 'Rio de Janeiro', '2026-10-15', '2026-10-20T13:00:00Z'),
  /* fora da janela de 30 dias */
  L('o1', '1', 'Taquara', 'Rio de Janeiro', '2026-08-30', '2026-09-01T13:00:00Z'),
  /* vencendo: 84 dias, sem visita, sem negócio */
  L('v1', '1', 'Freguesia (Jacarepaguá)', 'Rio de Janeiro', '2026-08-10', '2026-09-01T13:00:00Z'),
  L('v2', null, 'Anil', 'Rio de Janeiro', '2026-08-12', '2026-09-01T13:00:00Z', Object.assign({ status: 'pendente' }, ANIL)),
  L('v3', '2', 'Méier', 'Rio de Janeiro', '2026-08-12', '2026-09-01T13:00:00Z'),                                    // visitado: não vence
  L('v4', '2', 'Méier', 'Rio de Janeiro', '2026-08-12', '2026-09-01T13:00:00Z', { hubspot_deal_id: 'D7' }),         // tem negócio: não vence
  /* uma conta-alvo de outra fonte, para a carteira */
  L('x1', '1', 'Taquara', 'Rio de Janeiro', null, '2026-09-01T13:00:00Z', { fonte: 'outscraper', data_abertura: null })
] };
const clientes = [['ca1', 'a1', 'D1'], ['ca5', 'a5'], ['cb1', 'b1', 'D2'], ['cv3', 'v3'], ['cx1', 'x1', 'D9']]
  .map(([id, lead, deal]) => ({ id, lead_prospeccao_id: lead, id_hubspot: deal || null, etapa: null, status: 'lead' }));
const V = (cid, dono, dia, extra) => Object.assign({ client_id: cid, owner_id: dono, dia, visited_at: dia + 'T15:00:00Z', provada: true }, extra || {});
const visitas = [V('ca1', '1', '2026-10-22'), V('ca5', '1', '2026-10-23', { provada: false }), V('cb1', '2', '2026-10-27'), V('cv3', '2', '2026-10-20'), V('cx1', '1', '2026-10-28'),
  V('k-meier', '2', '2026-10-29')];

/* o banco falso: registra TODA escrita; as funções do servidor respondem conforme o cenário */
const escritas = [], chamadas = [];
let semServidor = false;
const thenable = (dados, erro) => { const o = { then: (a, b) => Promise.resolve({ data: erro ? null : dados, error: erro || null }).then(a, b) }; ['select', 'not', 'order', 'eq', 'gte', 'is', 'lte'].forEach(k => { o[k] = () => o; }); o.range = (i) => thenable(i === 0 ? dados : [], erro); o.in = () => thenable(dados, erro); return o; };
const SUGS = [{ lead_id: 'a4', owner_id: '1', origem: 'carga', semana: '2026-11-02', vale_ate: '2026-11-06', confirmada_em: null, criado_em: '2026-11-02T11:00:00Z' },
  { lead_id: 'a3', owner_id: '1', origem: 'carga', semana: '2026-10-26', vale_ate: '2026-10-30', confirmada_em: null, criado_em: '2026-10-26T11:00:00Z' } /* venceu: voltou ao motor */];
const PLANOS = [{ owner_id: '1', data_segunda: '2026-10-26', regioes: [null, null, null, null, null], grade: [[{ id: 'n-a3', p: 'novo' }], [], [], [], []] },
  { owner_id: '1', data_segunda: '2026-11-02', regioes: ['b:freguesia', null, 'b:taquara', null, null], grade: [[], [], [], [], []] }];
const tabela = (t) => {
  if (t === 'clients') return thenable(clientes);
  if (t === 'territorio_sugestoes') return semServidor ? thenable(null, { code: '42P01', message: 'relation "territorio_sugestoes" does not exist' }) : thenable(SUGS);
  if (t === 'territorio_carga') return semServidor ? thenable(null, { code: '42P01', message: 'does not exist' }) : thenable([{ carga: 5 }]);
  if (t === 'planos_semanais') return thenable(PLANOS);
  if (t === 'clients_vis') return thenable([]);
  return thenable([]);
};
global.supa = {
  rpc: (nome, args) => {
    chamadas.push({ nome, args });
    if (nome === 'visitas_com_prova') return thenable(visitas);
    if (nome === 'registrar_abertura') return thenable(null);
    if (semServidor) return thenable(null, { code: '42883', message: 'function ' + nome + ' does not exist' });
    return thenable(args && args.p_leads ? args.p_leads.length : 1);
  },
  from: (t) => ({
    select: () => tabela(t),
    update: (c) => { escritas.push({ t, op: 'update', c }); return { in: () => ({ select: async () => ({ data: [], error: null }) }), eq: () => thenable([]) }; },
    insert: (c) => { escritas.push({ t, op: 'insert', c }); return thenable([]); },
    upsert: (c) => { escritas.push({ t, op: 'upsert', c }); return thenable([]); },
    delete: () => { escritas.push({ t, op: 'delete' }); return thenable([]); }
  })
};

(async () => {
  const GV2 = new Function(codigo + '\nreturn GV2;')();
  GV2.pintar = function () {};
  const toasts = [];
  GV2.toast = function (t) { toasts.push(String(t)); };
  checar('as funções da v3 existem', ['t3Modelo', 't3Gargalo', 't3Escolher', 't3Resgate', 't3Cobertura', 't3Perto', 't3Semana', 't3PorNoPlano', 't3Redistribuir', 't3Sair', 't3DarDono'].every(k => typeof GV2[k] === 'function'));
  if (typeof GV2.t3Modelo !== 'function') return fechar();
  const P = (id, nome, praca) => ({ id, nome, praca, iniciais: nome[0], fase: 'Rua' });
  const pessoas = [P('1', 'Ana Lima', 'Rio de Janeiro'), P('2', 'Beto Reis', 'Rio de Janeiro'), P('3', 'Caio Melo', 'Vila Velha/ES')];
  GV2.base = { agora: { iso: '2026-11-02', min: 9 * 60 }, pessoas, porId: Object.fromEntries(pessoas.map(p => [p.id, p])), negocios: [], cru: { fichas: [] }, faltas: [] };
  GV2.estado = Object.assign(GV2.estado || {}, { aba: 'terr', cobrados: {} });
  await GV2.t10Ler(true);
  await GV2.t3Ler(true);
  checar('a leitura da v3 acha o servidor e as sugestões', GV2.t3.servidor === true && GV2.t3.sugs.length === 2 && GV2.t3.planos.length === 2, JSON.stringify({ s: GV2.t3.servidor, e: GV2.t3.erro }));

  const M = GV2.t10Modelo();
  GV2.t10M = M;
  const M3 = GV2.t3Modelo(M);
  GV2.t3M = M3;
  const f = M3.fun;

  /* ── 1 · o funil ── */
  checar('entraram = os recém-abertos dos 30 dias (fora: o de 01/09 e a conta de outra fonte)', f.ent === 12, String(f.ent));
  checar('atribuídos = os de um executivo do time (fora: sem dono e dono de fora do time)', f.atr === 10, String(f.atr));
  checar('na rota = na rota hoje, esteve na grade, visitado ou com negócio', f.rota === 4, String(f.rota));
  checar('visitados = com prova no pino (a visita sem prova não conta)', f.vis === 2, String(f.vis));
  checar('negócios = tem negócio (no lead ou no pino)', f.neg === 2, String(f.neg));
  checar('o funil só desce: entraram ≥ atribuídos ≥ na rota ≥ negócios', f.ent >= f.atr && f.atr >= f.rota && f.rota >= f.neg && f.rota >= f.vis);
  const g = GV2.t3Gargalo(f, 5);
  checar('o gargalo é a menor passagem (atribuído → rota, 40%)', g && g.etapa === 'rota' && g.pct === '40%', JSON.stringify(g));
  checar('a frase do gargalo é escrita pela regra', g && /^Atribuído não vira rota: de 10 atribuídos, só 4 viraram parada \(40%\)\. A carga é 5 por pessoa/.test(g.t), g && g.t);
  checar('o gargalo muda quando a passagem muda (rota → negócio)', GV2.t3Gargalo({ ent: 100, atr: 90, rota: 60, neg: 3 }, 5).etapa === 'neg');
  checar('a % abaixo de 10 sai com uma casa (2,6%)', GV2.t3Pct(17, 642) === '2,6%' && GV2.t3Pct(11, 17) === '65%' && GV2.t3Pct(1, 0) === '—');

  /* ── 2 · PARIDADE: Por executivo = funil, em todas e em cada praça ── */
  const soma = (P3, k) => Object.keys(P3.porEx).reduce((a, id) => a + P3.porEx[id][k], 0);
  for (const pr of ['todas', 'rj', 'vv']) {
    GV2.estado.t10pr = pr === 'todas' ? null : pr;
    const Mx = GV2.t10Modelo(), Px = GV2.t3Modelo(Mx);
    const ok4 = ['atr', 'rota', 'vis', 'neg'].every(k => soma(Px, k) === Px.fun[k]);
    checar('paridade em ' + pr + ': atribuídos, na rota, visitados e negócios da tabela = o funil', ok4, JSON.stringify({ fun: Px.fun, tab: ['atr', 'rota', 'vis', 'neg'].map(k => soma(Px, k)) }));
    const html = GV2.render.t3Tabela(Mx, Px, 5);
    const tot = (html.match(/is-tot[\s\S]*?<\/div><\/div>/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    checar('a linha Total da tabela (' + pr + ') mostra os números do funil', new RegExp(' ' + Px.fun.atr + ' ' + Px.fun.rota + '( \\+\\d+ sugeridos)? ' + Px.fun.vis + ' ' + Px.fun.neg + ' ').test(tot), tot);
  }
  GV2.estado.t10pr = null;
  checar('praça RJ: entraram 10 (Vila Velha fora), atribuídos 8', (() => { GV2.estado.t10pr = 'rj'; const x = GV2.t3Modelo(GV2.t10Modelo()).fun; GV2.estado.t10pr = null; return x.ent === 10 && x.atr === 8; })());
  checar('a conversão do programa é dos visitados (nunca passa de 100%): negócio sem visita não entra', Object.keys(M3.porEx).every(id => M3.porEx[id].visNeg <= M3.porEx[id].vis) && M3.fun.visNeg === 2);
  checar('a carteira: as outras contas-alvo visitadas com prova (Ana 1 de 1 com negócio)', M3.porEx['1'].cartV === 1 && M3.porEx['1'].cartN === 1, JSON.stringify(M3.porEx['1']));

  /* ── 3 · as sugestões e a carga ── */
  checar('a sugestão viva da semana conta (Ana +1); a da semana passada venceu e voltou ao motor', M3.porEx['1'].sug === 1 && M3.jaSug.a4 && !M3.jaSug.a3, JSON.stringify({ sug: M3.porEx['1'].sug, ja: M3.jaSug }));
  const E = GV2.t3Escolher(M, M3, 2);
  checar('Pôr no plano: o que vence primeiro, sem visitado, sem quem está na rota, sem quem já tem sugestão (Ana completa 2 com v1)', E.porEx['1'] && E.porEx['1'].join() === 'v1', JSON.stringify(E.porEx));
  checar('Pôr no plano: Beto e Caio recebem 2 cada, os mais novos primeiro', E.porEx['2'].join() === 'b3,b2' && E.porEx['3'].length === 2, JSON.stringify(E.porEx));
  checar('a semana do plano vira no sábado (sáb 07/11 → seg 09/11 a sex 13/11)', GV2.t3Semana('2026-11-07').seg === '2026-11-09' && GV2.t3Semana('2026-11-07').sex === '2026-11-13' && GV2.t3Semana('2026-11-04').seg === '2026-11-02');
  checar('a carga é de 1 a 12 e começa na guardada pelo gestor', GV2.t3CargaAtual() === 5 && GV2.T3.MIN === 1 && GV2.T3.MAX === 12);

  /* ── 4 · o resgate ── */
  const Rg = GV2.t3Resgate(M, M3);
  checar('vence = 76 a 90 dias, sem visita e sem negócio (v1 e v2; o visitado e o com negócio ficam fora)', Rg.n === 2 && M3.venc.map(y => y.id).sort().join() === 'v1,v2', M3.venc.map(y => y.id).join());
  const gF = Rg.comDono[0];
  checar('o destino é o dono do bairro, com o dia dele lá (Ana · seg em Freguesia)', gF && gF.destino.x.id === '1' && /seg em Freguesia/.test(gF.destino.porque), gF && JSON.stringify(gF.destino.porque));
  checar('bairro sem dono vai para "deixar sair" (Anil)', Rg.semDono.length === 1 && Rg.semDono[0].nome === 'Anil' && Rg.nSair === 1);
  checar('"saem do mapa até" = o último a sair, no dia seguinte ao 90º (v2 aberto em 12/08 → 11/11)', Rg.ate === '2026-11-11', Rg.ate);

  /* ── 5 · a cobertura e o dar dono ── */
  const G = GV2.t3Cobertura(M, M3, 'rj');
  const bl = n => G.blocos.find(b => b.nome === n);
  checar('Taquara: parcial (2 visitas com prova em 4 semanas, a do recém-aberto e a da outra conta-alvo; a sem prova não conta)', bl('Taquara') && bl('Taquara').st === 'parc' && bl('Taquara').vis === 2, bl('Taquara') && JSON.stringify({ st: bl('Taquara').st, v: bl('Taquara').vis }));
  checar('Anil (quem cobria saiu): sem dono, tracejado', bl('Anil') && bl('Anil').st === 'sem');
  const perto = GV2.t3Perto(M, G, bl('Anil'));
  checar('quem já roda perto do Anil: Ana (Taquara, ~4 km) antes de Beto (Méier)', perto.length === 2 && perto[0].x.id === '1' && perto[0].km > 2 && perto[0].km < 6 && perto[1].x.id === '2', JSON.stringify(perto.map(p => [p.x.id, p.km, p.onde])));

  /* ── 6 · a tela ── */
  const html = GV2.render.terr();
  const texto = html.replace(/<[^>]+>/g, ' ');
  checar('a tela v3 tem o funil, o gargalo, a carga, o resgate, o mapa de cobertura e o Por executivo de 30 dias',
    /O FUNIL DO PROGRAMA · 30 DIAS/.test(html) && /GARGALO/.test(html) && /A CARGA CABE NA RUA/.test(html) && /RESGATAR O QUE VENCE/.test(html) && /O território · cobertura por bairro/.test(html) && /Por executivo · 30 dias/.test(html));
  checar('nada da v2 sumiu: filtro de praça, 5 números, Onde agir, lente "carga da semana", aba "semana" e Contra quem',
    /data-gv2="t10pr:todas"/.test(html) && (html.match(/class="gv2-t10-kpi[" ]/g) || []).length === 5 && /<b>Onde agir<\/b>/.test(html) && /data-gv2="t3lente:carga"/.test(html) && /data-gv2="t3tab:sem"/.test(html) && /<b>Contra quem<\/b>/.test(html));
  GV2.estado.t3lente = 'carga'; GV2.estado.t3tab = 'sem';
  const h2 = GV2.render.terr();
  checar('a lente "carga da semana" é o mapa da v2 e a aba "semana" é a tabela da v2', /<b>Territórios/.test(h2) && /gv2-t10-bl/.test(h2) && /Visitados<\/span><span>Negócio<\/span><span>Parados/.test(h2));
  GV2.estado.t3lente = null; GV2.estado.t3tab = null;
  checar('o aviso de carga da v2 continua no render', /gv2-t10-aviso/.test(codigo.slice(codigo.indexOf('GV2.render.terr = function'), codigo.indexOf('GV2.render.t10Kpis = function'))) && /\+ aviso/.test(codigo.slice(codigo.indexOf('GV2.render.terr = function'), codigo.indexOf('GV2.render.t10Kpis = function'))));
  checar('depois de sugerir: a faixa "sugeridos · aguardando confirmação" e a prévia da grade com o selo', /recém-abertos sugeridos nos planos/.test(html) && /aguardando confirmação na grade/.test(html) && /Como aparece no Planejamento de Ana/.test(html), (html.match(/gv2-t3-ok[\s\S]{0,300}/) || [''])[0]);
  checar('Por executivo mostra "+1 sugeridos" na rota da Ana', /3 \+1 sugeridos/.test(texto) || /\d \+1 sugeridos/.test(texto));
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{2714}\u{2716}]/u;
  const v3 = codigo.slice(codigo.indexOf('TERRITÓRIO v3 (02/11/26'), codigo.indexOf('/* ══ A VOZ DA RUA vai para Pessoas'));
  checar('zero emoji na tela e no código da v3', !emoji.test(html) && !emoji.test(v3), (html.match(emoji) || v3.match(emoji) || [''])[0]);
  checar('sem jargão técnico na tela (tabela, função, servidor por nome)', !/territorio_|sugerir_no_plano|leads_prospeccao|planos_semanais|snapshot|Supabase|0248|pipeline|rpc/i.test(texto), (texto.match(/territorio_|sugerir_no_plano|leads_prospeccao|planos_semanais|snapshot|Supabase|0248|pipeline|rpc/i) || [''])[0]);
  const iCss = tpl.indexOf('/* ══ TERRITÓRIO v3 (02/11/26, design_handoff_territorio_v3) ══ só tokens');
  const css = tpl.slice(iCss, tpl.indexOf('.gv2-t3-gr{grid-template-columns:repeat(5,minmax(96px,1fr))', iCss) + 80);
  const alvo = (sel) => { const m = css.match(new RegExp('\\' + sel + '\\{[^}]*\\}')); return m && /(min-height|height):(4[0-9]|[5-9][0-9])px/.test(m[0]); };
  checar('alvo ≥ 40 px: botões, − e +, opções de dono, linhas, abas de executivo e "ver por bairro"', ['.gv2-t3-bt', '.gv2-t3-nb', '.gv2-t3-op', '.gv2-t3-tr', '.gv2-t3-link', '.gv2-t3-rr'].every(alvo) && /\.gv2-t3-exs button\{min-height:40px/.test(css));
  checar('a CSS da v3 usa só os tokens --gv2-* (nenhuma cor de tema solta além do branco do selo)', !/#(?!FFFFFF)[0-9A-Fa-f]{3,6}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
  checar('a medição registra a tela "territorio"', /GV2\.pv2Medir\('territorio', 'menu'\)/.test(codigo) && /p_tela: 'territorio'/.test(codigo));

  /* ── 7 · nada é gravado no plano ── */
  escritas.length = 0; chamadas.length = 0;
  GV2.estado.t3carga = 2;
  await GV2.t3PorNoPlano();
  GV2.estado.t3carga = null;
  const sug = chamadas.filter(c => c.nome === 'sugerir_no_plano');
  checar('Pôr no plano chama só a sugestão (origem carga), com os escolhidos', sug.length === 1 && sug[0].args.p_origem === 'carga' && sug[0].args.p_leads.slice().sort().join() === ['v1', 'b2', 'b3', 'c1', 'c2'].sort().join(), JSON.stringify(sug));
  checar('Pôr no plano não grava em leads_prospeccao nem em planos_semanais', !escritas.some(w => /leads_prospeccao|planos_semanais/.test(w.t)), JSON.stringify(escritas));
  chamadas.length = 0;
  await GV2.t3Redistribuir();
  const red = chamadas.filter(c => c.nome === 'redistribuir_recem_abertos');
  checar('Redistribuir: uma chamada por bairro, para o destino (Ana, v1)', red.length === 1 && red[0].args.p_para === '1' && red[0].args.p_leads.join() === 'v1', JSON.stringify(red));
  checar('Redistribuir: a frase do que aconteceu', GV2.estado.t3res && /1 redistribuído para Ana/.test(GV2.estado.t3res.txt), GV2.estado.t3res && GV2.estado.t3res.txt);
  GV2.t3Comando('t3sair', ['t3sair']);
  checar('Deixar sair pede confirmação antes', GV2.estado.t3sairOk === true && !chamadas.some(c => c.nome === 'deixar_sair_recem_abertos'));
  GV2.t3R = GV2.t3Resgate(M, M3);
  await GV2.t3Sair();
  checar('Deixar sair: só os de bairro sem dono (v2)', chamadas.some(c => c.nome === 'deixar_sair_recem_abertos' && c.args.p_leads.join() === 'v2'));
  chamadas.length = 0;
  await GV2.t3DarDono('rj', bl('Anil').k, '1');
  const dd = chamadas.find(c => c.nome === 'dar_dono_bairro');
  checar('Dar dono: o bairro, o município, a UF e o nome do executivo no território', dd && dd.args.p_bairro === 'Anil' && dd.args.p_municipio === 'Rio de Janeiro' && dd.args.p_uf === 'RJ' && dd.args.p_rep === 'Ana Lima', JSON.stringify(dd));
  checar('Dar dono: o bloco vira "dono novo · hoje"', GV2.t3Cobertura(M, M3, 'rj').blocos.find(b => b.nome === 'Anil').st === 'novo');
  checar('nenhuma ação da v3 escreveu direto numa tabela', escritas.length === 0, JSON.stringify(escritas));
  chamadas.length = 0;
  await GV2.t3Sugerir('agir:2:1', ['a5']);
  checar('o "Sugerir no plano" do Onde agir e da gaveta usa a mesma sugestão (origem gestor)', chamadas.some(c => c.nome === 'sugerir_no_plano' && c.args.p_origem === 'gestor' && c.args.p_leads.join() === 'a5'));
  checar('o botão do Onde agir e da gaveta é "Sugerir no plano", não grava a rota', /data-gv2="t3sug:/.test(GV2.t10BotaoPlano('x', ['b2'], true)) && !/t10plano:/.test(GV2.t10BotaoPlano('x', ['b2'], true)));

  /* ── 8 · sem a atualização do servidor: avisa, não trava ── */
  semServidor = true;
  GV2.t3.em = 0; GV2.t3.servidor = null;
  await GV2.t3Ler(true);
  checar('sem a atualização do servidor a leitura não dá erro e marca a falta', GV2.t3.servidor === false && !GV2.t3.erro && GV2.t3.sugs.length === 0, JSON.stringify({ s: GV2.t3.servidor, e: GV2.t3.erro }));
  let h3 = '';
  try { h3 = GV2.render.terr(); } catch (e) { falhas.push('render sem servidor: ' + e.message); }
  checar('a tela continua inteira e mostra a nota discreta', /O FUNIL DO PROGRAMA/.test(h3) && /depende[mn]? de uma atualização do servidor/.test(h3) && /Pôr 5 no plano de cada um/.test(h3));
  escritas.length = 0; chamadas.length = 0; toasts.length = 0;
  GV2.estado.t3ocupado = false;
  await GV2.t3PorNoPlano();
  checar('sem a atualização, Pôr no plano avisa e não grava nada', escritas.length === 0 && !chamadas.some(c => c.nome === 'sugerir_no_plano') && toasts.some(t => /atualização do servidor/.test(t)), JSON.stringify({ escritas, toasts }));
  semServidor = false;

  /* ── 9 · um motor só: a sugestão do gestor entra no PLV3.sugestoes, pelo bairro do dia ── */
  const PL = GV2.PLV3;
  const alvos = [{ ref: 'n-x', leadId: 'x', nome: 'X', bairro: 'b:taquara' }, { ref: 'n-y', leadId: 'y', nome: 'Y', bairro: 'b:taquara' }, { ref: 'n-z', leadId: 'z', nome: 'Z', bairro: 'b:meier' }];
  const ord = PL.alvosDoGestor(alvos, [{ lead_id: 'y', origem: 'carga', semana: '2026-11-02' }, { lead_id: 'z', origem: 'carga', semana: '2026-11-09' }], '2026-11-02');
  checar('a sugestão do gestor desta semana passa na frente; a de outra semana não muda nada', ord[0].ref === 'n-y' && ord[0].gestor === 'carga' && !ord.find(a => a.ref === 'n-z').gestor);
  const dias = [0, 1, 2, 3, 4].map(i => ({ iso: '2026-11-0' + (2 + i), feriado: '', passou: false, hoje: false }));
  const s = PL.sugestoes({ meta: 6, dias, cont: [5, 5, 5, 5, 5], bDia: ['b:taquara', 'b:meier', null, null, null], bSel: [null, null, null, null, null], fila: [], alvos: ord });
  checar('o motor é o mesmo: no dia do bairro, a vaga vai para a sugestão do gestor; Méier não recebe Taquara', s.deLead['n-y'] && s.deLead['n-y'].dia === 0 && !s.deLead['n-x'] && s.porDia[1].every(x => x.bairro === 'b:meier'), JSON.stringify(s.deLead));
  const dia = codigo.slice(codigo.indexOf('PLV3.diaHTML = function'), codigo.indexOf('PLV3.cartaoHTML = function'));
  checar('na grade do executivo a sugestão do gestor leva o selo RECÉM-ABERTO e só o "Pôr" dele grava', /tagHTML\('RECÉM-ABERTO', 'is-rota'\)/.test(dia) && /data-pv3-acao="por:/.test(dia));
  const por = codigo.slice(codigo.indexOf('PLV3.porNoDia = async function'), codigo.indexOf('PLV3.porVarios = async function'));
  checar('confirmar na grade anota a sugestão como confirmada (depois que a grade gravou)', /const ok = await PLV3\.mutar\(campos\)[\s\S]{0,200}if \(ok && alvo\)[\s\S]{0,200}PLV3\.confirmarGestor\(alvo\.leadId\)/.test(por));

  fechar();
})().catch(e => { falhas.push('erro: ' + (e && e.stack || e)); fechar(); });

function fechar() {
  if (falhas.length) {
    console.log('território v3: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
    falhas.forEach(f => console.log('  · ' + f));
    console.log('FALHOU: ' + falhas.length);
    process.exit(1);
  }
  console.log('território v3: ' + ok + ' de ' + ok + ' ok');
}
