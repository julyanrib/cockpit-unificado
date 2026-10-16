/* ============================================================================
   AUDITORIA DE NÚMEROS DO COCKPIT (15/10/26)

   Cada caso abaixo é um número que estava errado na tela do gestor e foi corrigido NA REGRA, não
   no resultado. Esta suíte roda o bloco gv2 de verdade (extraído do template) e garante que a
   regra não volta:
     · o "último dia útil" mede o PLANO pelas paradas feitas (a Kelly: 15 visitas, 5 de 14 do
       plano → "furou", nunca "15 de 14 · cumpriu");
     · a meta de visitas é 6 por dia útil para todos (meta, não teto) e rampagem fica fora;
     · feriado e fim de semana não viram "Sem rota"/"Cobrar o plano"; os feriados são calculados
       para qualquer ano (a lista à mão acabava em 01/01/2027);
     · leitura de visitas paginada (o PostgREST corta em 1000 e o corte caía nas mais novas);
     · vendas do mês só valem se forem deste mês; a hora do HubSpot diz o dia quando não é hoje;
     · Funil por praça usa a meta da praça (a meta com folga é só do time inteiro);
     · taxa de passo nunca passa de 100%; proposta com retorno combinado não é "esquecida";
     · (16/10) Amanhã de sexta lê a Rua da segunda; MRR sem venda lida é "não medido"; estorno de
       visita não desconta venda; ranking de segunda cedo não diz "sem ganhador"; ausente do placar é —.
   Rode com: node scripts/testar-auditoria-numeros.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');
let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };

const ini = tpl.indexOf('<script id="gv2-js">');
const fim = tpl.indexOf('</script><!-- /gv2-js -->');
const codigo = tpl.slice(ini + '<script id="gv2-js">'.length, fim).replace('GV2.instalar();', '');
global.esc = (v) => String(v == null ? '' : v);
global.document = undefined;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
global.DATA = { reps: [], kpisHub: { metaMensalFechados: 52 } };
const GV2 = new Function(codigo + '\nreturn GV2;')();
GV2.pintar = function () {};

(async () => {
  /* 1 · feriados calculados, para qualquer ano */
  const f27 = GV2.feriadosDoAno(2027);
  checar('Carnaval, Sexta-feira Santa e Corpus Christi de 2027 calculados pela Páscoa', ['2027-02-08', '2027-02-09', '2027-03-26', '2027-05-27'].every((d) => f27.indexOf(d) >= 0), f27.join());
  checar('feriados de 2026 conferem (Carnaval 16–17/02, Sexta Santa 03/04, Corpus Christi 04/06)', ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04', '2026-11-20'].every((d) => GV2.feriadosDoAno(2026).indexOf(d) >= 0));
  checar('GV2.util: feriado de 2027 não é dia útil; a quarta de cinzas é', !GV2.util('2027-02-09') && GV2.util('2027-02-10') && !GV2.util('2027-02-13'));
  GV2.FERIADOS.push('2026-10-16');
  checar('feriado acrescentado à mão (municipal) continua valendo', !GV2.util('2026-10-16'));
  GV2.FERIADOS.pop();

  /* 2 · RPC paginada */
  const linhas = Array.from({ length: 2345 }, (_, i) => ({ i }));
  const pedidos = [];
  global.supa = { rpc: () => ({ range: (a, b) => { pedidos.push([a, b]); return Promise.resolve({ data: linhas.slice(a, b + 1), error: null }); } }) };
  const r = await GV2.rpcTudo('visitas_com_prova', {});
  checar('rpcTudo lê todas as 2.345 linhas em páginas de 1000 (o PostgREST cortava em 1000)', r.data.length === 2345 && pedidos.length === 3, r.data.length + ' em ' + pedidos.length);
  global.supa = { rpc: () => ({ range: () => Promise.resolve({ data: null, error: { message: 'caiu' } }) }) };
  const r2 = await GV2.rpcTudo('visitas_com_prova', {});
  checar('rpcTudo devolve o erro (não lista vazia, que viraria "0 de y")', r2.data === null && r2.error && r2.error.message === 'caiu');

  /* 3 · vendas do mês e hora do HubSpot */
  const mes = GV2.agoraBR().iso.slice(0, 7);
  DATA.vendasMes = { mes: '2000-01', porRep: [{ ownerId: '1', count: 9 }] };
  checar('vendas de outro mês não valem (dia 1º com snapshot velho)', GV2.vendasMesAtual() === null && GV2.vendasDoMes('1') === null);
  DATA.vendasMes = { mes: mes, porRep: [{ ownerId: '1', count: 3 }] };
  checar('vendas deste mês valem', GV2.vendasMesAtual() && GV2.vendasDoMes('1') === 3);
  const ontemTs = new Date(Date.now() - 30 * 3600000).toISOString();
  checar('hora do HubSpot de outro dia mostra a data', /\d{2}\/\d{2} \d{2}:\d{2}/.test(GV2.quandoHs(ontemTs)), GV2.quandoHs(ontemTs));
  checar('hora do HubSpot de hoje mostra só a hora', /^\d{2}:\d{2}$/.test(GV2.quandoHs(new Date().toISOString())), GV2.quandoHs(new Date().toISOString()));

  /* 4 · taxa nunca acima de 100% */
  checar('taxa de passo: mínimo de 3 e nunca acima de 100%', GV2.v8Tx(2, 1) === '—' && GV2.v8Tx(4, 6) === '—' && GV2.v8Tx(3, 2) === '67%');

  /* 5 · as somas do time */
  const P = (id, fase, extra) => Object.assign({ id, nome: 'P' + id, fase, meta_visitas_dia: 6, esperado: 3, meta_clientes_mes: 8,
    hoje: { paradas_plano: 6, visitas_com_prova: 2, visitas_todas: 3, repetidas: 0 }, ontem: { paradas_plano: 6, visitas_com_prova: 2, visitas_todas: 4 },
    quentes: [], mrrQuentes: 0, quentesSemPasso: 0, travados: [], mrrTravados: 0, funil_mes: { portas: 10, decisor: 2, demo: 1, proposta: 1, fechado: 1 }, provavel: 1, agPag: [], puxar: [] }, extra || {});
  const rampa = P('3', 'Preparação', { hoje: { paradas_plano: 0, visitas_com_prova: 0, visitas_todas: 0, repetidas: 0 }, meta_clientes_mes: 4 });
  const A = GV2.agregar([P('1', 'Pleno'), P('2', 'Pleno'), rampa], [], null);
  checar('meta de visitas do dia: rampagem sem rua fica fora (12, não 18)', A.time.meta === 12, String(A.time.meta));
  checar('meta do mês do time inteiro = a do metas.json (com a folga)', A.time.metaMes === 52);
  const R = GV2.agregar([P('1', 'Pleno'), rampa], [], null, true);
  checar('meta do mês de uma praça = soma das pessoas dela (8 + 4), não a do time', R.time.metaMes === 12, String(R.time.metaMes));
  checar('"ontem" do KPI de visitas soma TODAS as visitas com prova (contra a meta)', A.time.ontemProva === 12 && A.time.ontemPlan === 18);
  /* venda da casa (gestor): entra no time inteiro, não na praça, e o funil bate com a lista */
  const itensCasa = [[], [], [], [], [{ dono: '1', deal: 'a' }, { dono: 'casa', deal: 'g' }]];
  const T1 = GV2.agregar([P('1', 'Pleno', { funil_mes: { portas: 10, decisor: 2, demo: 1, proposta: 1, fechado: 1 } })], [], itensCasa);
  checar('a venda do gestor conta no placar do time (fechados, provável e o passo "fechado")', T1.time.fechados === 2 && T1.time.casa === 1 && T1.time.funil[4] === 2 && T1.time.provavel === 2 && T1.funilItens[4].length === 2, JSON.stringify({ f: T1.time.fechados, c: T1.time.casa, fu: T1.time.funil[4], p: T1.time.provavel }));
  const T2 = GV2.agregar([P('1', 'Pleno', { funil_mes: { portas: 10, decisor: 2, demo: 1, proposta: 1, fechado: 1 } })], [], itensCasa, true);
  checar('numa praça a venda da casa não entra (não é de ninguém dali)', T2.time.fechados === 1 && T2.time.casa === 0);
  checar('o nome do dono "casa" nas listas é "venda da casa", não "fora do time"', GV2.nomeDe('casa') === 'venda da casa');
  checar('a meta do último dia útil usa a MESMA regra do hoje: rampagem sem rua fora, com rua dentro',
    GV2.naMeta(Object.assign({}, rampa, { ontem: { paradas_plano: 0, visitas_todas: 0 } }), true) === false
    && GV2.naMeta(Object.assign({}, rampa, { ontem: { paradas_plano: 0, visitas_todas: 2 } }), true) === true
    && GV2.naMeta(P('1', 'Pleno'), true) === true);

  /* 6 · o último dia útil mede o plano pelas paradas feitas (o caso da Kelly) */
  GV2.base = { agora: { iso: '2026-10-15', min: 600 }, pessoas: [], planoErro: null };
  const kelly = P('9', 'Pleno', { ontem: { paradas_plano: 14, visitas_com_prova: 5, visitas_todas: 15, feitas_do_plano: 5 }, travados: [] });
  checar('Daily: 5 de 14 do plano com 15 visitas = "furou", não "cumpriu"', GV2.v8dMotivo(kelly).k === 'furou', GV2.v8dMotivo(kelly).k);
  checar('a origem grava o x do PLANO em ontem.visitas_com_prova e o total em visitas_todas',
    /ontem: \{ paradas_plano: Number\(dOntem\.planejadas\) \|\| 0, visitas_com_prova: Number\(dOntem\.feitasDoPlano\) \|\| 0, visitas_todas: Number\(dOntem\.provadas\) \|\| 0/.test(codigo));

  /* 7 · feriado / fim de semana / plano que não respondeu */
  const semPlano = P('8', 'Pleno', { hoje: { paradas_plano: 0, visitas_com_prova: 0, visitas_todas: 0, repetidas: 0 } });
  GV2.base = { agora: { iso: '2026-11-02', min: 600 }, pessoas: [semPlano], planoErro: null };
  checar('feriado (02/11): ninguém fica "Sem rota"', GV2.v5Situacao(semPlano).k === 'folga', GV2.v5Situacao(semPlano).k);
  checar('feriado (02/11): a Daily não abre por "sem plano"', GV2.v8dMotivo(semPlano).k !== 'plano');
  GV2.base = { agora: { iso: '2026-10-15', min: 600 }, pessoas: [semPlano], planoErro: 'planejamento_do_time fora' };
  checar('plano que não respondeu: a Daily não cobra "sem plano" de todo mundo', GV2.v8dMotivo(semPlano).k !== 'plano');
  GV2.base.planoErro = null;
  checar('dia útil com o plano lido: sem plano continua cobrado', GV2.v8dMotivo(semPlano).k === 'plano');

  /* 8 · propostas (regra no código: aguardando = combinado; venceu ontem = 1 dia útil) */
  checar('proposta com retorno combinado não cai em Esquecidas', /else if \(n\.lead && n\.lead\.aguardando\) status = 'combinado';/.test(codigo));
  checar('"venceu ontem" = venceu no último dia útil (resta === −1)', /status = resta === -1 \? 'venceu ontem'/.test(codigo) && !/resta >= -GV2\.diasCorridos/.test(codigo));

  /* 9 · auditoria 16/10/26 */
  checar('Rua › Amanhã na sexta: o bloco de Rua da PRÓXIMA semana é lido (seg − 7, seg, seg + 7)',
    /\.in\('data_segunda', \[GV2\.somaDias\(seg, -7\), seg, GV2\.somaDias\(seg, 7\)\]\)/.test(codigo));
  DATA.vendasMes = { mes: '2000-01', porRep: [{ ownerId: '1', mrrTotal: 900 }] };
  checar('Daily: sem as vendas deste mês o MRR é "não medido" (null), não R$ 0', GV2.v8dMrr(P('1', 'Pleno')).feito === null);
  DATA.vendasMes = { mes: mes, porRep: [{ ownerId: '1', mrrTotal: 900 }] };
  checar('Daily: com as vendas deste mês o MRR vale (e quem não vendeu tem 0)', GV2.v8dMrr(P('1', 'Pleno')).feito === 900 && GV2.v8dMrr(P('2', 'Pleno')).feito === 0);
  GV2.base = { agora: { iso: '2026-10-19', min: 7 * 60 }, pessoas: [] };
  checar('ranking: segunda antes das 08h a semana fechada "vai ser gravada", não "sem ganhador"', /gravado na segunda 19\/10 às 08:00/.test(GV2.v6RkSemGanhador('2026-10-12')), GV2.v6RkSemGanhador('2026-10-12'));
  GV2.base = { agora: { iso: '2026-10-20', min: 600 }, pessoas: [] };
  checar('ranking: depois da gravação, semana sem ganhador aparece como falha', /não foi gravado/.test(GV2.v6RkSemGanhador('2026-10-12')));
  checar('ranking: semana antes do bônus (05/10) diz que não havia bônus', /bônus começou/.test(GV2.v6RkSemGanhador('2026-09-28')));
  checar('ganhos por semana: só estorno ligado a contrato desfaz ganho (o de visita valia −1 venda)',
    /const contratoDe = \{\};/.test(codigo) && !/e\.tipo === 'estorno' \? -1 : 1/.test(codigo));
  checar('lista do funil: estorno sem negócio (o de visita) não cancela contrato', /if \(x\.tipo === 'estorno' && x\.negocio_id\)/.test(codigo));
  checar('Semana passada: quem não veio no placar aparece com — e fica fora da soma (não "0 visitas")',
    /const ausente = !porDono\[p\.id\];/.test(codigo) && /if \(ausente\) \{ tot\.ausentes/.test(codigo));
  checar('cabeçalho: o texto tem piso de largura e as ações descem de linha', /\.gv2-cab-txt\{flex:1 1 260px;min-width:min\(100%,260px\);\}/.test(tpl));
  checar('KPIs da Hoje acima do celular: cada cartão com ao menos 190px (5 fixas davam 117px a 767px)', /\.gv2-v5-kpis:not\(\.is-4\)\{grid-template-columns:repeat\(auto-fit,minmax\(190px,1fr\)\);\}/.test(tpl));

  console.log(falhas.length ? 'auditoria de números: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + '\n  ✗ ' + falhas.join('\n  ✗ ') : 'auditoria de números: ' + ok + ' verificações · tudo certo.');
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.log('auditoria de números: quebrou — ' + (e && e.stack || e)); process.exit(1); });
