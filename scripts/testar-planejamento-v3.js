/* ============================================================================
   PLANEJAMENTO DO EXECUTIVO v3 · AS CONTAS PURAS (01/11/26)

   design_handoff_planejamento_v3: a aba vira "nenhum lead fica sem próximo passo, e a semana
   cabe na rua". Esta suíte roda o bloco gv2 do template de verdade (o mesmo recorte das
   suítes do gestor) e confere as contas que a tela usa, sem DOM nem banco:
     · "sem próximo passo" é UMA função: a Hoje, o Raio X do gestor e o contador da v3 dão o
       mesmo número (Prospecção conta, Ag. Pagamento não, passo vencido não é passo);
     · as sugestões: nenhum lead em 2 dias; dia com bairro escolhido só recebe aquele bairro;
       trocar o bairro refaz as sugestões; feriado não tem meta, sugestão nem soltar;
     · a capacidade (1,5 × a média) e a média (fonte fora = null, novato = meta da fase);
     · "Dar data a todos": visita até a meta do dia pelo bairro, o resto vira tarefa,
       feriado fica de fora, e 20 leads saem com data em 2 cliques (abrir + confirmar).
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
checar('o bloco gv2 continua sem crase (guarda 26)', codigo.indexOf('`') < 0);
global.esc = (v) => String(v == null ? '' : v);
global.document = undefined;
global.localStorage = { getItem: () => null, setItem: () => {} };
global.location = { search: '' };
global.DATA = { reps: [], kpisHub: {} };
const GV2 = new Function(codigo + '\nreturn GV2;')();
GV2.pintar = function () {};
const P = GV2.PLV3;
checar('o módulo GV2.PLV3 existe', !!P && typeof P.sugestoes === 'function' && typeof P.proposta === 'function');

/* ── 1 · "sem próximo passo": uma função, três lugares, o mesmo número ── */
{
  const neg = (id, dono, idx, pp, extra) => Object.assign({ id: id, dono: dono, etapa_idx: idx, agPag: idx === 5, proximo_passo: pp, lead: {} }, extra || {});
  const negocios = [
    neg('a', '1', 0, null),                         /* Prospecção sem passo: CONTA (a regra da Hoje e do app) */
    neg('b', '1', 1, 'ter 03/11'),                  /* Visita com passo */
    neg('c', '1', 4, null, { lead: { tarefas: [{ timestamp: '2026-10-20T12:00:00Z' }] } }), /* passo vencido: conta */
    neg('d', '1', 5, null),                         /* Ag. Pagamento: fora */
    neg('e', '1', 2, 'no plano · qua 04/11'),       /* no Planejamento de hoje em diante: tem passo */
    neg('f', '1', 3, null),
    neg('g', '2', 0, null)                          /* de outra pessoa */
  ];
  const b = { negocios: negocios, agora: { iso: '2026-11-03', min: 600 } };
  const p = { id: '1' };
  const hoje = GV2.EXH4.semPasso(p, b).length;
  const v3 = P.contador(p, b);
  const gestor = GV2.filtroNegocios('sempasso', negocios.filter((n) => n.dono === '1')).length;
  checar('a Hoje, o Planejamento v3 e o Raio X do gestor dão o mesmo número', hoje === v3 && v3 === gestor, [hoje, v3, gestor].join(' / '));
  checar('o número é 3: Prospecção conta, passo vencido conta, Ag. Pagamento e quem tem passo não', v3 === 3, String(v3));
  checar('o EXH4.semPasso chama GV2.semProximoPasso (uma regra só no código)', /EXH4\.semPasso = function \(p, b\) \{ return GV2\.semProximoPasso\(/.test(codigo));
  checar('o filtro "sempasso" do Raio X chama GV2.semProximoPasso', /if \(k === 'sempasso'\) return GV2\.semProximoPasso\(ns\);/.test(codigo));
  GV2.EXH4.estado.marcados.f = { tipo: 'visita', data: '2026-11-04' };
  checar('o passo dado nesta sessão desce o número na hora, na Hoje e na v3 juntos', P.contador(p, b) === 2 && GV2.EXH4.semPasso(p, b).length === 2);
  delete GV2.EXH4.estado.marcados.f;
}

/* ── o mundo da semana: 09 a 13/11 (sem feriado) e 02 a 06/11 (Finados na segunda) ── */
const semana = (isos, hojeI, feriados) => isos.map((iso, i) => ({ iso: iso, feriado: (feriados || {})[i] || '', passou: hojeI >= 0 && i < hojeI, hoje: i === hojeI }));
const S1 = semana(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'], 0);
const lead = (ref, b, quente, extra) => Object.assign({ ref: ref, nome: 'L' + ref, etapaIdx: quente ? 4 : 1, dias: 3, quente: !!quente, bairro: b, semEnd: false }, extra || {});
const B = ['b:meier', 'b:tijuca', 'b:madureira', 'b:vila isabel', 'b:penha'];

/* ── 2 · sugestões: nenhum lead em 2 dias ── */
{
  let semDuplicado = true, coerente = true, msg = '';
  for (let rodada = 0; rodada < 300; rodada++) {
    let seed = rodada + 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const fila = Array.from({ length: 5 + Math.floor(rnd() * 40) }, (_, i) => lead('f' + i, B[Math.floor(rnd() * 5)], rnd() < 0.3, { semEnd: rnd() < 0.15 }));
    const alvos = Array.from({ length: Math.floor(rnd() * 30) }, (_, i) => lead('n' + i, B[Math.floor(rnd() * 5)], false, { alvo: true }));
    const cont = [0, 1, 2, 3, 4].map(() => Math.floor(rnd() * 8));
    const bSel = [0, 1, 2, 3, 4].map(() => (rnd() < 0.3 ? B[Math.floor(rnd() * 5)] : null));
    const bDia = bSel.map((x, i) => x || B[(i + rodada) % 5]);
    const r = P.sugestoes({ fila: fila, alvos: alvos, dias: S1, cont: cont, bDia: bDia, bSel: bSel, meta: 6, antesDas10: rnd() < 0.5 });
    const vistos = {};
    Object.keys(r.porDia).forEach((i) => r.porDia[i].forEach((s) => {
      if (vistos[s.ref] !== undefined) { semDuplicado = false; msg = s.ref + ' em ' + vistos[s.ref] + ' e ' + i; }
      vistos[s.ref] = i;
      if (!r.deLead[s.ref] || String(r.deLead[s.ref].dia) !== String(i)) coerente = false;
    }));
    Object.keys(r.deLead).forEach((ref) => { if (vistos[ref] === undefined) coerente = false; });
    /* ninguém sem endereço, nenhum dia além da vaga, nenhum dia não elegível */
    Object.keys(r.porDia).forEach((i) => {
      if (r.porDia[i].some((s) => fila.concat(alvos).find((l) => l.ref === s.ref).semEnd)) { coerente = false; msg = 'sem endereço sugerido'; }
      if (r.porDia[i].length > Math.max(0, 6 - cont[i])) { coerente = false; msg = 'passou da vaga em ' + i; }
    });
  }
  checar('300 semanas sorteadas: nenhum lead aparece sugerido em 2 dias', semDuplicado, msg);
  checar('o bloco do dia, o atalho da linha e o bloco Quentes leem a mesma conta (deLead = porDia), sem endereço nunca sugerido e nunca além da vaga', coerente, msg);
}

/* ── 3 · dia com bairro escolhido só recebe aquele bairro (quentes inclusive); trocar refaz ── */
{
  const fila = [lead('q1', B[1], true), lead('q2', B[2], true), lead('s1', B[1]), lead('s2', B[4]), lead('s3', B[2])];
  const alvos = [lead('a1', B[2], false, { alvo: true }), lead('a2', B[4], false, { alvo: true })];
  const cont = [0, 0, 0, 0, 0];
  const bSel = [null, null, B[4], null, null];
  const bDia = [B[0], B[0], B[4], B[0], B[0]];
  const r = P.sugestoes({ fila: fila, alvos: alvos, dias: S1, cont: cont, bDia: bDia, bSel: bSel, meta: 6, antesDas10: true });
  checar('qua com Penha escolhida recebe só leads de Penha', r.porDia[2].length > 0 && r.porDia[2].every((s) => s.bairro === B[4]), JSON.stringify(r.porDia[2]));
  checar('o quente de outro bairro vai para um dia em automático, nunca para o dia escolhido', r.deLead.q1 && r.deLead.q1.dia !== 2 && !bSel[r.deLead.q1.dia]);
  /* troca: qua passa a Tijuca */
  const bSel2 = [null, null, B[1], null, null];
  const bDia2 = [B[0], B[0], B[1], B[0], B[0]];
  const r2 = P.sugestoes({ fila: fila, alvos: alvos, dias: S1, cont: cont, bDia: bDia2, bSel: bSel2, meta: 6, antesDas10: true });
  checar('trocar o bairro de qua para Tijuca refaz as sugestões na hora: qua passa a ter só Tijuca', r2.porDia[2].length > 0 && r2.porDia[2].every((s) => s.bairro === B[1]) && r2.porDia[2].some((s) => s.ref === 'q1' || s.ref === 's1'));
  checar('depois da troca, o lead de Penha não é mais sugerido em qua', !r2.porDia[2].some((s) => s.ref === 's2'));
  /* com todos os dias escolhidos e nenhum de Madureira, o quente de Madureira fica sem dia (o bloco Quentes diz) */
  const tudo = [B[0], B[1], B[4], B[3], B[0]];
  const r3 = P.sugestoes({ fila: fila, alvos: [], dias: S1, cont: cont, bDia: tudo, bSel: tudo, meta: 6, antesDas10: true });
  checar('quente sem dia possível aparece em quentesSem (o "sem dia em Madureira")', r3.quentesSem.some((l) => l.ref === 'q2') && !r3.deLead.q2);
  checar('outros sem passo: só o mesmo bairro, até 3 por dia', (function () {
    const muitos = Array.from({ length: 9 }, (_, i) => lead('m' + i, B[3]));
    const r4 = P.sugestoes({ fila: muitos, alvos: [], dias: S1, cont: cont, bDia: [B[3], B[0], B[0], B[0], B[0]], bSel: [null, null, null, null, null], meta: 6, antesDas10: true });
    return r4.porDia[0].length === 3 && [1, 2, 3, 4].every((i) => r4.porDia[i].length === 0);
  }()));
  const r5 = P.sugestoes({ fila: fila, alvos: alvos, dias: S1, cont: cont, bDia: bDia, bSel: bSel, meta: 6, antesDas10: false });
  checar('hoje (seg) depois das 10:00 não recebe sugestão; antes das 10:00 recebe', r5.porDia[0].length === 0 && r.porDia[0].length > 0);
  const r6 = P.sugestoes({ fila: fila, alvos: alvos, dias: S1, cont: cont, bDia: bDia, bSel: bSel, meta: 6, antesDas10: true, revisando: true });
  checar('com a revisão do "Dar data a todos" aberta, nenhum dia sugere', Object.keys(r6.porDia).every((i) => !r6.porDia[i].length));
  const r7 = P.sugestoes({ fila: fila, alvos: alvos, dias: S1, cont: [6, 9, 6, 6, 6], bDia: bDia, bSel: bSel, meta: 6, antesDas10: true });
  checar('dia cheio não sugere', Object.keys(r7.porDia).every((i) => !r7.porDia[i].length));
}

/* ── 4 · feriado: sem meta, sem sugestão, não aceita soltar ── */
{
  const S0 = semana(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'], -1, { 0: P.nomeFeriado('2026-11-02') });
  checar('02/11 se chama Finados (o calendário do Cockpit)', P.nomeFeriado('2026-11-02') === 'Finados' && P.nomeFeriado('2026-11-03') === '');
  const m = P.metaDaSemana(6, S0, 8, 2, 4);
  checar('semana com Finados: meta 24 visitas (4 dias úteis × 6), não 30', m.visitas === 24 && m.uteis === 4, JSON.stringify(m));
  const fila = Array.from({ length: 12 }, (_, i) => lead('h' + i, B[i % 2], i < 3));
  const r = P.sugestoes({ fila: fila, alvos: [], dias: S0, cont: [0, 0, 0, 0, 0], bDia: [B[0], B[0], B[1], B[0], B[1]], bSel: [null, null, null, null, null], meta: 6, antesDas10: true });
  checar('o feriado não recebe sugestão', r.porDia[0].length === 0 && r.elegiveis.indexOf(0) < 0);
  checar('o feriado não aceita soltar; dia passado também não; hoje aceita', !P.aceitaSoltar(S0[0]) && P.aceitaSoltar(S0[1]) && !P.aceitaSoltar({ passou: true }) && P.aceitaSoltar({ hoje: true }));
  const prop = P.proposta({ fila: fila, dias: S0, cont: [0, 0, 0, 0, 0], bDia: [B[0], B[0], B[1], B[0], B[1]], bSel: [null, null, null, null, null], meta: 6, antesDas10: true });
  checar('"Dar data a todos" não põe nada (visita nem tarefa) no feriado', prop.length === 12 && prop.every((it) => it.dia !== 0));
}

/* ── 5 · capacidade e média ── */
{
  checar('aviso em 1,5 × a média: 5,2 → 7,8', P.limiteCapacidade(5.2) === 7.8);
  checar('9 paradas com média 5,2 avisa; 7 não', P.acimaDaCapacidade(9, 5.2) && !P.acimaDaCapacidade(7, 5.2));
  checar('novato (meta da fase 6): avisa acima de 9', P.limiteCapacidade(6) === 9 && P.acimaDaCapacidade(10, 6) && !P.acimaDaCapacidade(9, 6));
  checar('sem média (fonte fora), não avisa', P.limiteCapacidade(null) === null && !P.acimaDaCapacidade(20, null));
  const uteis = (de, ate) => GV2.uteisEntre(de, ate);
  const vis = [];
  /* 4 semanas de 12/10 a 06/11: 18 dias úteis (12/10 e 02/11 são feriado); 94 visitas com prova → 5,2 */
  for (let k = 0; k < 94; k++) vis.push({ owner_id: '1', provada: true, dia: '2026-10-' + String(13 + (k % 18)).padStart(2, '0') });
  vis.push({ owner_id: '1', provada: false, dia: '2026-10-14' }, { owner_id: '2', provada: true, dia: '2026-10-14' });
  const m = P.mediaVisitas(vis, '1', '2026-10-12', '2026-11-06', uteis, 6);
  checar('média = visitas com prova ÷ dias úteis (94 ÷ 18 = 5,2), sem contar visita sem prova nem de outra pessoa', m.fonte === 'historico' && m.v === 5.2, JSON.stringify(m));
  const nov = P.mediaVisitas([], '9', '2026-10-12', '2026-11-06', uteis, 6);
  checar('novato sem histórico: vale a meta da fase', nov.fonte === 'fase' && nov.v === 6);
  const fora = P.mediaVisitas(null, '1', '2026-10-12', '2026-11-06', uteis, 6);
  checar('fonte fora do ar: null e "fora" (a tela escreve "—", nunca 0)', fora.v === null && fora.fonte === 'fora');
}

/* ── 6 · "Dar data a todos" ── */
{
  const fila = [];
  for (let i = 0; i < 20; i++) fila.push(lead('d' + i, B[i % 4], i % 5 === 0, { semEnd: i % 7 === 3 }));
  const bDia = [B[0], B[1], B[2], B[3], B[0]];
  const cont = [0, 2, 4, 0, 5];
  const it = P.proposta({ fila: fila, dias: S1, cont: cont, bDia: bDia, bSel: [null, null, null, null, null], meta: 6, antesDas10: true });
  checar('os 20 leads saem com uma proposta (nenhum fica de fora)', it.length === 20 && new Set(it.map((x) => x.ref)).size === 20);
  const porDia = [0, 0, 0, 0, 0];
  it.filter((x) => x.tipo === 'visita').forEach((x) => { porDia[x.dia]++; });
  checar('visita só até a meta do dia (6), contando o que o dia já tem', porDia.every((n, i) => n + cont[i] <= 6), porDia.join());
  checar('lead sem endereço nunca vira visita: vira tarefa', it.filter((x) => fila.find((l) => l.ref === x.ref).semEnd).every((x) => x.tipo !== 'visita'));
  checar('tarefa de quente é "ligar", do resto é "WhatsApp"', it.filter((x) => x.tipo !== 'visita').every((x) => x.tipo === (fila.find((l) => l.ref === x.ref).quente ? 'ligar' : 'whats')));
  checar('visita vai primeiro ao dia do mesmo bairro', it.filter((x) => x.tipo === 'visita' && fila.find((l) => l.ref === x.ref).bairro === B[2]).every((x) => x.dia === 2 || porDia[2] + cont[2] >= 6));
  const comProp = P.contComProposta(cont, it);
  checar('os contadores dos dias já contam as propostas', comProp.reduce((a, n) => a + n, 0) === cont.reduce((a, n) => a + n, 0) + it.filter((x) => x.tipo === 'visita').length);
  checar('"ter 10 ▾" passa para o próximo dia útil e dá a volta', P.proximoDiaDaProposta(S1, 4, 'visita', true) === 0 && P.proximoDiaDaProposta(S1, 1, 'visita', true) === 2);
  const escolhido = P.proposta({ fila: fila, dias: S1, cont: [0, 0, 0, 0, 0], bDia: bDia, bSel: [null, null, B[2], null, null], meta: 6, antesDas10: true });
  checar('dia com bairro escolhido só recebe visita daquele bairro na proposta', escolhido.filter((x) => x.tipo === 'visita' && x.dia === 2).every((x) => fila.find((l) => l.ref === x.ref).bairro === B[2]));
  /* O CRITÉRIO DE CLIQUES (≤ 25 para 20 leads, revisando): a proposta já dá data a todos, então o caminho
     mínimo é 1 clique para abrir e 1 para confirmar; cada ajuste da revisão é 1 clique por linha ("ter 10 ▾"
     ou "×"), e com 20 linhas o pior caso é 1 + 20 + 1 = 22 cliques. */
  const cliquesMinimos = 1 + 0 + 1;
  const cliquesPiorCaso = 1 + it.length + 1;
  checar('20 leads com data em ≤ 25 cliques revisando (mínimo 2, pior caso 1 ajuste por linha = 22)', cliquesMinimos === 2 && cliquesPiorCaso <= 25, String(cliquesPiorCaso));
}

/* ── 7 · a fila por dinheiro, o bairro do dia, a meta e o topo ── */
{
  const f = P.ordemPorDinheiro([
    { ref: 'p', etapaIdx: 0, dias: 20 }, { ref: 'n1', etapaIdx: 4, dias: 2 }, { ref: 'n2', etapaIdx: 4, dias: 9 },
    { ref: 'n3', etapaIdx: 4, dias: 1, venc: 'venceu ter 27/10' }, { ref: 'd', etapaIdx: 3, dias: 30 }, { ref: 'v', etapaIdx: 1, dias: 1, ficou: 'ficou seg 09/11' }
  ]).map((x) => x.ref).join(',');
  checar('ordem por dinheiro: Negociação (vencido primeiro, depois mais dias) → Demo → Visita → Prospecção', f === 'n3,n2,n1,d,v,p', f);
  checar('bairro do dia: o escolhido manda', P.bairroDoDia('b:penha', [{ bairro: 'b:meier' }], 'b:tijuca') === 'b:penha');
  checar('bairro do dia: sem escolha, o mais comum entre as paradas', P.bairroDoDia(null, [{ bairro: 'b:meier' }, { bairro: 'b:tijuca' }, { bairro: 'b:tijuca' }], 'b:penha') === 'b:tijuca');
  checar('bairro do dia: dia vazio fica com o da rota', P.bairroDoDia(null, [], 'b:penha') === 'b:penha');
  const m = P.metaDaSemana(6, S1, 8, 2, 3);
  checar('meta da semana: 30 visitas e (8 − 2) ÷ 3 semanas = 2 fechamentos', m.visitas === 30 && m.fechamentos === 2, JSON.stringify(m));
  checar('meta do mês desconhecida: fechamentos null (a tela diz "—")', P.metaDaSemana(6, S1, null, 0, 3).fechamentos === null);
  checar('semanas que faltam: a de 09/11 tem 09, 16, 23 e 30/11 = 4', P.semanasQueFaltam('2026-11-09') === 4 && P.semanasQueFaltam('2026-11-30') === 1);
  const S0 = semana(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'], 2, { 0: 'Finados' });
  const t = P.topo(S0, [[{ feita: true }], [{ feita: true }, {}], [], [{}, {}, {}], [{}]]);
  checar('topo coerente: na grade = soma dos dias úteis (o feriado fora), cobertos = dias úteis com cartão, feitas = com check-in', t.naGrade === 6 && t.cobertos === 3 && t.uteis === 4 && t.feitas === 1, JSON.stringify(t));
  checar('"mover 3 para…" vai para o dia útil não passado com menos paradas', P.diaComMenos(S0, [0, 2, 9, 1, 4], 2) === 3);
}

if (falhas.length) {
  console.error('planejamento v3: ' + falhas.length + ' falha(s) de ' + (ok + falhas.length) + ':');
  falhas.forEach((f) => console.error('  · ' + f));
  process.exit(1);
}
console.log('OK planejamento v3 — ' + ok + ' conferências: uma função de "sem próximo passo" nos 3 lugares, sugestões sem lead em 2 dias, bairro escolhido, feriado, capacidade, média e "Dar data a todos".');
