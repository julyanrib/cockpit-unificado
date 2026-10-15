/* ============================================================================
   TERRITÓRIO v2 (15/10/26, territ.zip · design_handoff_territorio_v2)

   Roda o bloco gv2 de verdade (extraído do template entre os marcadores) num mundo falso de 4
   pessoas e confere o aceite do handoff:
     · as réguas: recém-aberto (Casa dos Dados, CNPJ ≤ 90 dias), visitado com prova no pino do
       lead, parado (+14 dias sem visita), vencendo (aberto há 76+ dias sem visita);
     · o topo, a tabela e o mapa batem entre si em cada praça;
     · bairro sem dono não tem cor nem número; com dono mostra o número mesmo com 0;
     · Onde agir segue as 5 regras, nesta ordem, no máximo 6 e 3 em destaque;
     · a troca de dono de Vitória em 29/11 acontece sem deploy;
     · o executivo sem território aparece e não entra na meta;
     · NENHUM botão chama a busca paga (Casa dos Dados, Google);
     · Pro plano grava só o que pediu (na rota + data_rota da segunda) e o Desfazer devolve;
     · Cobrar abre no app da pessoa com o porquê da linha.
   Rode com: node scripts/testar-territorio-v2.js
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
checar('o Território v2 está no bloco gv2', codigo.indexOf('TERRITÓRIO v2 (15/10/26') > 0);

/* ── o mundo falso: segunda 26/10/26, 09:00 em Brasília ── */
const R = Date;
global.Date = class extends R { constructor(...a) { super(...(a.length ? a : ['2026-10-26T12:00:00Z'])); } static now() { return new R('2026-10-26T12:00:00Z').getTime(); } };
global.esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
global.document = undefined;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
global.sessaoAtual = { role: 'manager', ownerId: '99' };
global.DATA = { territorios: [
  { rep: 'Ana Lima', areas: [{ municipio: 'Rio de Janeiro', bairros: ['Taquara', 'Freguesia (Jacarepaguá)'] }] },
  { rep: 'Beto Reis', areas: [{ municipio: 'Rio de Janeiro', bairros: ['Méier'] }] },
  { rep: 'Caio Melo', areas: [{ municipio: 'Vila Velha', todoOMunicipio: true }, { municipio: 'Vitória', todoOMunicipio: true, ate: '2026-11-29' }] },
  { rep: 'Gil Saiu', ativo: false, areas: [{ municipio: 'Rio de Janeiro', bairros: ['Anil'] }] }
] };
const recados = [];
global.pt6EnviarRecado = async (id, texto) => { recados.push({ id, texto }); return true; };
global.rt7ProximaSegunda = () => '2026-11-02';
global.rt7Registrar = e => { global.RT7_ESTADO.cargas = global.RT7_ESTADO.cargas.concat([e]); };

const CDD = 'Casa dos Dados';
const L = (id, dono, bairro, cidade, abertura, criado, extra) => Object.assign({ id, nome: 'RESTAURANTE ' + id.toUpperCase(), fonte: CDD, status: 'atribuido', responsavel_owner_id: dono, bairro, cidade, data_abertura: abertura + 'T00:00:00+00:00', created_at: criado, endereco: 'RUA ' + id.toUpperCase() + ', 10' }, extra || {});
const CARGA = '2026-10-26T01:30:00Z'; // domingo 25/10, 22:30 em Brasília
global.RT7_ESTADO = { carregou: true, cargas: [], leads: [
  L('t1', '1', 'Taquara', 'Rio de Janeiro', '2026-10-10', CARGA), L('t2', '1', 'TAQUARA', 'Rio de Janeiro', '2026-10-11', CARGA), L('t3', '1', 'Taquara', 'Rio de Janeiro', '2026-10-12', CARGA),
  L('v1', '1', 'Freguesia (Jacarepaguá)', 'Rio de Janeiro', '2026-08-05', '2026-10-05T13:00:00Z'), // parado (21 d) e vencendo (82 d)
  L('f1', '1', 'Freguesia', 'Rio de Janeiro', '2026-09-20', '2026-10-12T13:00:00Z', { hubspot_deal_id: 'D1' }), // visitado na semana passada, virou negócio
  L('m1', '2', 'Méier', 'Rio de Janeiro', '2026-09-01', '2026-10-12T13:00:00Z'), L('m2', '2', 'Méier', 'Rio de Janeiro', '2026-09-02', '2026-10-12T13:00:00Z'),
  L('m3', '2', 'Méier', 'Rio de Janeiro', '2026-09-03', '2026-10-12T13:00:00Z'), L('m4', '2', 'Méier', 'Rio de Janeiro', '2026-09-04', '2026-10-12T13:00:00Z'),
  L('m5', '2', 'Méier', 'Rio de Janeiro', '2026-09-05', '2026-10-12T13:00:00Z'),
  L('c1', '3', 'Jardim Camburi', 'Vitória', '2026-10-01', CARGA), L('c2', '3', 'Praia da Costa', 'Vila Velha', '2026-10-02', CARGA),
  L('c3', '3', 'Centro', 'Vitória', '2026-10-03', CARGA), L('c4', '3', 'Centro', 'Vila Velha', '2026-10-04', CARGA),
  L('x1', '1', 'Taquara', 'Rio de Janeiro', '2026-07-01', '2026-10-05T13:00:00Z'), // aberto há 117 dias: não é recém-aberto
  L('x2', '1', 'Taquara', 'Rio de Janeiro', '2026-10-01', CARGA, { fonte: 'rua' }), // não é da Casa dos Dados
  L('x3', '1', 'Taquara', 'Rio de Janeiro', '2026-08-01', '2026-10-05T13:00:00Z', { status: 'sem_fit' }), // fora: não é parado nem vencendo
  L('x4', '77', 'Taquara', 'Rio de Janeiro', '2026-10-10', CARGA) // dono fora do time
] };
const clientes = [['cf1', 'f1', 'D1', 'Visita'], ['cm1', 'm1'], ['cm2', 'm2'], ['cm3', 'm3'], ['cm4', 'm4'], ['cm5', 'm5'], ['ct1', 't1'], ['cx3', 'x3']]
  .map(([id, lead, deal, etapa]) => ({ id, lead_prospeccao_id: lead, id_hubspot: deal || null, etapa: etapa || null, status: 'lead' }));
const V = (cid, dono, dia) => ({ client_id: cid, owner_id: dono, dia, visited_at: dia + 'T15:00:00Z', provada: true });
const visitas = [V('cf1', '1', '2026-10-21'), V('cf1', '1', '2026-10-22') /* o mesmo restaurante conta 1 */,
  V('cm1', '2', '2026-10-19'), V('cm2', '2', '2026-10-20'), V('cm3', '2', '2026-10-21'), V('cm4', '2', '2026-10-22'), V('cm5', '2', '2026-10-23'),
  Object.assign(V('ct1', '1', '2026-10-21'), { provada: false }) /* sem prova não conta */];
const pedidos = [];
const thenable = (dados) => { const o = { then: (a, b) => Promise.resolve({ data: dados, error: null }).then(a, b) }; ['select', 'not', 'order', 'eq', 'gte'].forEach(k => { o[k] = () => o; }); o.range = (i) => thenable(i === 0 ? dados : []); return o; };
global.supa = {
  rpc: (nome) => thenable(nome === 'visitas_com_prova' ? visitas : []),
  from: (t) => ({
    select: () => thenable(t === 'clients' ? clientes : []),
    update: (c) => ({ in: (col, lista) => ({ select: async () => { pedidos.push({ t, c, ids: lista.slice() }); return { data: lista.map(i => ({ id: i })), error: null }; } }) })
  })
};

(async () => {
  const GV2 = new Function(codigo + '\nreturn GV2;')();
  GV2.pintar = function () {};
  const P = (id, nome, praca) => ({ id, nome, praca, iniciais: nome[0], fase: 'Rua' });
  const pessoas = [P('1', 'Ana Lima', 'Rio de Janeiro'), P('2', 'Beto Reis', 'Rio de Janeiro'), P('3', 'Caio Melo', 'Vila Velha/ES'), P('4', 'Duda Nova', 'Rio de Janeiro')];
  GV2.base = { agora: { iso: '2026-10-26', min: 9 * 60 }, pessoas, porId: Object.fromEntries(pessoas.map(p => [p.id, p])), negocios: [{ id: 'D1', etapa_idx: 1 }],
    cru: { fichas: [
      { owner_id: '1', client_id: 'k1', sistema: 'Saipos', ocorrido_em: '2026-10-20T12:00:00Z' }, { owner_id: '2', client_id: 'k2', sistema: 'saipos', ocorrido_em: '2026-10-21T12:00:00Z' },
      { owner_id: '2', client_id: 'k3', sistema: 'nenhum', ocorrido_em: '2026-10-22T12:00:00Z' }, { owner_id: '3', client_id: 'k4', sistema: 'Goomer', ocorrido_em: '2026-10-22T12:00:00Z' },
      { owner_id: '1', client_id: 'k5', sistema: 'Colibri', ocorrido_em: '2026-09-01T12:00:00Z' } /* mais de 30 dias: fora */] }, faltas: [] };
  GV2.estado = Object.assign(GV2.estado || {}, { aba: 'terr', cobrados: {} });
  await GV2.t10Ler(true);
  checar('a leitura junta visitas e pinos sem erro', !GV2.t10.erro && GV2.t10.vis.length === 7 && Object.keys(GV2.t10.cli).length === clientes.length, GV2.t10.erro || '');

  const M = GV2.t10Modelo();
  const A = M.rows['1'], B = M.rows['2'], C = M.rows['3'];
  checar('recém-aberto = Casa dos Dados, CNPJ ≤ 90 dias, dono no time (fora: 117 dias, fonte rua, dono de fora)', A.ls.length === 6 && !A.ls.some(r => /^x[124]$/.test(r.id)), A.ls.map(r => r.id).join());
  checar('a carga é a de domingo 25/10 (22:30 em Brasília)', M.carga && M.carga.dia === '2026-10-25');
  checar('Entraram: 3 da Ana e 4 do Caio na carga; o Beto nenhum', A.ent === 3 && C.ent === 4 && B.ent === 0, [A.ent, C.ent, B.ent].join());
  checar('semana de referência fechada (19 a 25/10)', M.fechada && M.segA === '2026-10-19' && M.domA === '2026-10-25');
  checar('Visitados: o mesmo restaurante conta 1 por semana e visita sem prova não conta', A.vis === 1 && B.vis === 5 && C.vis === 0, [A.vis, B.vis, C.vis].join());
  checar('Viraram negócio: o visitado da Ana tem negócio (1 de 1)', A.neg === 1 && B.neg === 0);
  const v1 = A.ls.find(r => r.id === 'v1');
  checar('parado = sem visita e entrou há mais de 14 dias; vencendo = aberto há 76+ dias', v1.parado && v1.vencendo && A.par === 1 && A.ven === 1, JSON.stringify({ par: A.par, ven: A.ven }));
  checar('sem_fit não é parado nem vencendo', !A.ls.some(r => r.id === 'x3') || !A.ls.find(r => r.id === 'x3').parado);
  checar('o Beto (5 de 5, todos visitados) não tem parado nem vencendo', B.par === 0 && B.ven === 0);
  checar('executivo sem território aparece como tal (Duda) e quem saiu do time não', M.time.sem.length === 1 && M.time.sem[0].id === '4' && !M.time.ex['77']);
  checar('a cor sai da ordem de entrada na praça (Ana 1ª, Beto 2ª)', M.time.ex['1'].slot === 0 && M.time.ex['2'].slot === 1);

  /* o topo, a tabela e o mapa batem, por praça */
  const html = GV2.render.terr();
  const kp = GV2.render.t10Kpis(M);
  checar('5 números no topo', (kp.match(/class="gv2-t10-kpi[" ]/g) || []).length === 5);
  checar('Visitados com prova: 6 de 15 (meta = 5 × executivos COM território; a Duda fora)', /<b class="num t-av">6 de 15<\/b>/.test(kp), (kp.match(/Visitados com prova[\s\S]{0,160}/) || [''])[0]);
  checar('Entraram 7, em 5 bairros (Centro de Vitória e Centro de Vila Velha são dois)', />7<\/b>/.test(kp) && /em 5 bairros/.test(kp));
  for (const pk of ['rj', 'vv']) {
    const G = GV2.t10Blocos(M, pk);
    const mapa = G.blocos.reduce((a, b) => a + (b.dono ? b.n : 0), 0);
    const tab = Object.keys(M.rows).map(i => M.rows[i]).filter(r => r.x.pk === pk).reduce((a, r) => a + r.ent, 0);
    checar('mapa = tabela em ' + pk, mapa === tab, mapa + ' x ' + tab);
  }
  const RJ = GV2.t10Blocos(M, 'rj');
  const bl = n => RJ.blocos.find(b => b.nome === n);
  checar('Freguesia (Jacarepaguá) cai no bloco Freguesia, da Ana', bl('Freguesia') && bl('Freguesia').dono && bl('Freguesia').dono.id === '1');
  checar('Taquara: anel âmbar (3 novos, ninguém foi)', bl('Taquara').alerta && bl('Taquara').n === 3);
  checar('Méier tem dono e mostra 0', bl('Méier').dono && bl('Méier').n === 0);
  checar('bairro de quem saiu do time (Anil) fica sem dono e sem número', bl('Anil') && !bl('Anil').dono);
  const htmlRJ = GV2.render.t10Mapa(M);
  checar('bloco sem dono não tem número nem clique; com dono, número mesmo 0',
    /<div class="gv2-t10-bl is-sem"[^>]*title="Anil[^"]*"><span lang="pt-BR" class="gv2-t10-bn">Anil<\/span><\/div>/.test(htmlRJ) || !/Anil/.test(htmlRJ), '');
  const VV = GV2.t10Blocos(M, 'vv');
  const centros = VV.blocos.filter(b => /^Centro de V/.test(b.nome) && b.n === 1).map(b => b.nome).sort().join();
  checar('Vitória e Vila Velha não se misturam no "Centro"', centros === 'Centro de Vila Velha,Centro de Vitória', centros);
  checar('Vitória hachurada até 29/11; Vila Velha não', VV.blocos.filter(b => b.mun === 'Vitória').every(b => b.hach) && VV.blocos.filter(b => b.mun === 'Vila Velha').every(b => !b.hach));

  /* Onde agir */
  const ag = GV2.t10Agir(M);
  checar('Onde agir na ordem das regras: 1 (Caio 0 de 5), 2 (Taquara), 3 (vencendo da Ana), 5 (Vitória); o Caio não tem bairro com 3 novos', ag.map(a => a.regra).join() === '1,2,3,5', ag.map(a => a.regra + ':' + a.t).join(' | '));
  checar('regra 1 é a do Caio, com Cobrar', ag[0].id === '3' && /Caio: 0 de 5 na semana passada/.test(ag[0].t) && !!ag[0].cobrar);
  checar('regra 2 põe no plano os novos sem visita do bairro (visita sem prova não conta), os mais novos primeiro', ag.find(a => a.regra === 2 && a.id === '1').plano.join() === 't3,t2,t1', JSON.stringify(ag.find(a => a.regra === 2 && a.id === '1').plano));
  checar('regra 4 só vale de quinta em diante (hoje é segunda)', !ag.some(a => a.regra === 4));
  checar('regra 5: Vitória muda de dono em 29/11', ag.some(a => a.regra === 5 && /Vitória muda de dono em 29\/11/.test(a.t)));
  const agHtml = GV2.render.t10Agir(M);
  checar('no máximo 3 em destaque e "Também vale olhar" a partir do 4º', (agHtml.match(/gv2-t10-ag is-top/g) || []).length === 3 && agHtml.indexOf('Também vale olhar') > 0);
  checar('a regra 5 (aviso) não tem botão primário', !/Vitória muda[\s\S]{0,400}is-prim/.test(agHtml.slice(agHtml.indexOf('Vitória muda'), agHtml.indexOf('Vitória muda') + 600)));

  /* nenhum botão da aba chama a busca paga */
  const tudo = html + GV2.render.t10Gav(Object.assign(M, {})) + agHtml;
  checar('nenhum botão chama a Casa dos Dados ou o Google (Importar, buscar, disparar)', !/v9g:imp|v9disparar|v5rt7:imp|buscar-leads|Importar|buscar mais/i.test(tudo));

  /* a gaveta */
  GV2.t10Comando('t10g', ['t10g', '1', 'b=taquara']);
  let gav = GV2.render.t10Gav(M);
  checar('a gaveta vinda do bairro abre filtrada (Taquara · Novos da semana)', /is-on" data-gv2="t10gf:novos">Novos da semana · 3/.test(gav) && /Taquara ×/.test(gav), (gav.match(/gv2-t10-gchips[\s\S]{0,600}/) || [''])[0]);
  GV2.t10Comando('t10gb', ['t10gb']); GV2.t10Comando('t10gf', ['t10gf', 'todos']);
  gav = GV2.render.t10Gav(M);
  const ordem = (gav.match(/title="RESTAURANTE [A-Z0-9]+"/g) || []).map(s => s.replace(/title="RESTAURANTE |"/g, '').toLowerCase());
  checar('ordem: vence primeiro, depois os mais novos, depois parados, depois o resto', ordem[0] === 'v1' && ordem.slice(1, 4).every(x => /^t/.test(x)) && ordem.slice(4).join() === 'f1,x3', ordem.join());
  checar('o nome em caixa alta da Receita vira nome próprio', />Restaurante V1</.test(gav));
  checar('vencendo mostra "vence em 8 d"; visitado mostra a data com prova; negócio abre no HubSpot', /vence em 8 d/.test(gav) && /22\/10 · com prova/.test(gav) && /record\/0-3\/D1/.test(gav));
  checar('a gaveta não mostra telefone, nota do Google nem foto', !/telefone[^:]|★|avaliacoes|foto/i.test(gav.replace(/Sem telefone: a Casa dos Dados não entrega/, '')));
  GV2.t10Comando('t10g', ['t10g', 'fechar']);

  /* Pro plano grava só o que pediu e o Desfazer devolve */
  GV2.v9Desfazer = GV2.v9Desfazer || (async () => {});
  await GV2.t10Plano('teste', ['t1', 't2']);
  const p0 = pedidos[0];
  checar('Pro plano: leads_prospeccao na rota + data_rota da próxima segunda, só os 2 pedidos', p0 && p0.t === 'leads_prospeccao' && p0.c.status === 'na_rota' && p0.c.data_rota === '2026-11-02' && p0.ids.join() === 't1,t2'
    && Object.keys(p0.c).sort().join() === 'data_rota,status,updated_at' /* nada além disso: dono, nome e fonte ficam */, JSON.stringify(p0));
  checar('Pro plano: a linha vira "2 na rota de 02/11" com Desfazer', GV2.estado.t10feito.teste && /2 na rota de 02\/11/.test(GV2.estado.t10feito.teste.txt) && GV2.estado.t10feito.teste.idx === 0);
  await GV2.v9Desfazer(0);
  const t1 = RT7_ESTADO.leads.find(l => l.id === 't1');
  checar('Desfazer: as contas voltam ao status e ao dia de antes', t1.status === 'atribuido' && t1.data_rota == null && pedidos.length >= 2, JSON.stringify({ s: t1.status, d: t1.data_rota, n: pedidos.length }));

  /* Cobrar abre no app com o porquê */
  GV2.t10A = ag;
  await GV2.t10Cobrar(ag[0].chave);
  checar('Cobrar: recado no app do Caio com o "0 de 5 na semana passada"', recados.length === 1 && recados[0].id === '3' && /0 de 5/.test(recados[0].texto), JSON.stringify(recados));
  checar('Cobrar: a linha mostra "Cobrado às" e não cobra duas vezes', /Cobrado às/.test(GV2.render.t10Agir(M)) && (await GV2.t10Cobrar(ag[0].chave), recados.length === 1));

  /* Contra quem: 30 dias, um por restaurante, no recorte */
  const cq = GV2.render.t10Contra(M);
  checar('Contra quem: Saipos 2, Nenhum sistema 1, Goomer 1; a ficha de 01/09 fica fora', /Saipos<\/span><b class="num">2</.test(cq) && /Nenhum sistema<\/span><b class="num">1</.test(cq) && !/Colibri/.test(cq), cq.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  GV2.estado.t10pr = 'vv';
  checar('Contra quem respeita o filtro de praça (ES: só Goomer)', /Goomer/.test(GV2.render.t10Contra(M)) && !/Saipos/.test(GV2.render.t10Contra(M)));
  GV2.estado.t10pr = null;

  /* a troca de Vitória sem deploy */
  GV2.base.agora.iso = '2026-11-30';
  const M2 = GV2.t10Modelo();
  const VV2 = GV2.t10Blocos(M2, 'vv');
  checar('depois de 29/11 a hachura some e o Caio fica só com Vila Velha', !VV2.blocos.some(b => b.hach) && GV2.t10Rotulo(M2.time.ex['3']) === 'Vila Velha');
  checar('depois de 29/11 o mapa continua batendo com a tabela', VV2.blocos.reduce((a, b) => a + (b.dono ? b.n : 0), 0) === M2.rows['3'].ent);
  /* antes da primeira semana fechada da meta (começou na semana de 12/10), a referência é a semana corrente */
  GV2.base.agora.iso = '2026-10-15';
  const M3 = GV2.t10Modelo();
  checar('na semana em que a meta começou não se cobra "0 de 5 na semana passada"', !M3.fechada && !GV2.t10Agir(M3).some(a => a.regra === 1));
  GV2.base.agora.iso = '2026-10-26';

  /* a voz da rua foi para Pessoas */
  checar('"A voz da rua" saiu do Território e entrou em Pessoas', !/A voz da rua/.test(html) && /A voz da rua<\/span><span class="card-sub">/.test(codigo.slice(codigo.indexOf('A VOZ DA RUA vai para Pessoas'))));

  console.log(falhas.length ? 'território v2: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + '\n  ✗ ' + falhas.join('\n  ✗ ') : 'território v2: ' + ok + ' verificações · tudo certo.');
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.log('território v2: quebrou — ' + (e && e.stack || e)); process.exit(1); });
