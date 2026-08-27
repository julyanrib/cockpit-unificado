// scripts/testar-nucleo.js
// Testa o NÚCLEO OPERACIONAL do executivo (cadência, ponto de contato, gates, fila)
// fora do navegador, contra cenários montados à mão.
//
// COMO FUNCIONA: o núcleo vive dentro do <script> inline do template, entre os
// marcadores /* @nucleo:inicio */ e /* @nucleo:fim */. Este arquivo recorta esse trecho
// e avalia num contexto de vm com stubs mínimos (DATA, esc, helpers de data, agenda).
// Não é um mock do núcleo — é o CÓDIGO DE PRODUÇÃO rodando; só o entorno é stub.
//
// POR QUE ASSIM: os cenários que importam ("visita sem desfecho", "cadência completa",
// "recusa explícita", "evento vindo do Expogo", "aguardando sincronização") são
// combinações de dados que quase nunca aparecem juntas na base real. Esperar que a
// produção produza cada uma delas pra descobrir se a regra está certa é o oposto de
// testar. E testar escrevendo em negócio real está fora de questão.
//
// Uso: node scripts/testar-nucleo.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');

// Dois trechos: o núcleo principal e o par de derivações que vive junto do briefing
// (sequenciaDeExecucao / atividadesComprovadasNoDia) — são domínio, não UI, e por isso
// entram no teste. Os marcadores existem só para este recorte.
function recortar(iniMarca, fimMarca) {
  const a = html.indexOf(iniMarca), b = html.indexOf(fimMarca);
  if (a < 0 || b < 0 || b < a) {
    console.error(`FALHA: marcadores ${iniMarca} / ${fimMarca} não encontrados no template.`);
    process.exit(1);
  }
  return html.slice(a, b);
}
const codigoNucleo = recortar('/* @nucleo:inicio', '/* @nucleo:fim */')
  + '\n' + recortar('/* @nucleo2:inicio', '/* @nucleo2:fim */');

// ---------------------------------------------------------------------------
// Entorno mínimo. Cada stub reproduz o CONTRATO da função real do template,
// não o comportamento inteiro dela — o que o núcleo consome está aqui.
// ---------------------------------------------------------------------------
// HOJE = agora de verdade. O núcleo usa Date.now() (é assim que ele roda em
// produção); congelar o relógio do teste num instante diferente criava um falso
// negativo no frescor de dados — foi exatamente o que aconteceu na 1ª rodada.
const HOJE = new Date();
const DIA = 86400000;
function iso(d) { return new Date(d).toISOString().slice(0, 10); }
function diasAtras(n) { return new Date(HOJE.getTime() - n * DIA); }
function diasAFrente(n) { return new Date(HOJE.getTime() + n * DIA); }

const cadenciasCfg = require(path.join(root, 'data', 'cadencias.json'));

function novoContexto(DATA, sessao) {
  const ctx = {
    DATA,
    sessaoAtual: sessao,
    console,
    Date, Math, JSON, Object, Array, Number, String, Boolean, Set, Map, isNaN, parseInt, parseFloat,
    esc: v => String(v == null ? '' : v),
    isoDate: d => iso(d || HOJE),
    addDays: (isoStr, n) => iso(new Date(isoStr + 'T12:00:00Z').getTime() + n * DIA),
    addBusinessDays: (isoStr, dir) => iso(new Date(isoStr + 'T12:00:00Z').getTime() + dir * DIA),
    nearestBusinessDay: isoStr => isoStr,
    fmtDailyLabel: isoStr => isoStr,
    smoothScrollTo: () => {},
    activateTab: () => {},
    mostrarToast: () => {},
    abrirFichaLeadFunilDrawer: () => {},
    buscarLeadFunilPorId: () => null,
    abrirTodosTravados: () => {},
    abrirRegistroDeDesfecho: () => {},
    renderAgenda: undefined,
    renderMeuFunil: undefined,
    agendaEstado: { subview: 'hoje' },
    document: { querySelector: () => null, getElementById: () => null },
    setTimeout: () => {},
    STAGE_LABELS: (DATA.stageMeta && DATA.stageMeta.labels) || {},
    AGENDA_TIPOS: {
      reuniao: { rotulo: 'Reunião', conta: 'reuniao' },
      follow_up: { rotulo: 'Follow-up', conta: 'visita' },
      rota: { rotulo: 'Rota / PAP', conta: 'visita' },
      interno: { rotulo: 'Interno', conta: null }
    },
    prospeccaoNormalizarTexto: s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(),
    agendaNomeDoLead: s => String(s || '').replace(/^(visita|reunião|reuniao|follow[\s-]*up)\s*[-–]\s*/i, '').trim(),
    // A agenda do teste já vem normalizada nos fixtures (mesmos campos que
    // agendaNormalizar produz), então o stub só devolve a lista.
    agendaNormalizar: raw => (raw && raw.eventos) || [],
    agendaChave: d => iso(d),
    agendaAgora: () => HOJE,
    agendaHhmm: d => new Date(d).toISOString().slice(11, 16),
    agendaParaBRT: s => new Date(s),
    // Quente = Demo/Proposta, Negociação ou Ag. Pagamento (mesma regra do template).
    agendaQuentes: reps => {
      const ids = reps.map(r => String(r.ownerId));
      const QUENTES = ['1395880471', '1395880472', '1395880473'];
      const out = [];
      Object.values(DATA.funilLeads || {}).forEach(lista => (lista || []).forEach(l => {
        if (ids.includes(String(l.ownerId)) && QUENTES.includes(String(l.stageId))) out.push(l);
      }));
      return out;
    },
    proximoPassoDoLead: lead => {
      const cand = [];
      if (lead.proximaAtividade) cand.push({ data: lead.proximaAtividade, rotulo: 'atividade' });
      (lead.tarefas || []).forEach(t => { if (t && t.timestamp) cand.push({ data: t.timestamp, rotulo: t.subject || 'tarefa' }); });
      return cand.map(x => ({ ...x, quando: new Date(x.data) }))
        .filter(x => !isNaN(x.quando) && x.quando >= HOJE)
        .sort((x, y) => x.quando - y.quando)[0] || null;
    },
    inicioDaSemanaISO: () => '2026-08-24',
    // Mesmo contrato do rampDoOwner do template: alvo de visitas/dia útil da fase.
    // O fixture passa DATA.rampAlvo pra escolher a fase sem precisar de usuarios.json.
    rampDoOwner: () => DATA.rampAlvo != null
      ? { label: 'Fase de teste', alvo: DATA.rampAlvo, chave: 'teste', definido: true }
      : { label: 'Fase não definida', alvo: null, chave: null, definido: false }
  };
  ctx.leadTemProximoPasso = lead => !!ctx.proximoPassoDoLead(lead);
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(codigoNucleo, ctx, { filename: 'nucleo(template)' });
  return ctx;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const OWNER = '87069181';

function lead(over) {
  return {
    id: 'L' + Math.random().toString(36).slice(2, 8),
    name: 'Restaurante Teste', ownerId: OWNER, stageId: '1396005401', stage: 'Visita',
    dias: 3, slaBreach: false, tarefas: [], notas: [], ultimaInteracao: null,
    ...over
  };
}

function dados(over) {
  return {
    hubspotUpdatedAtISO: new Date(HOJE.getTime() - 30 * 60000).toISOString(),
    syncStatus: { ultimaExecucao: new Date(HOJE.getTime() - 30 * 60000).toISOString(), houveFalha: false, falhaMinha: false },
    cadencias: cadenciasCfg,
    stageMeta: { slaDays: { '1396005401': 5, '1395880470': 4, '1395880471': 3, '1395880472': 7, '1395880473': 2, '1395880469': 5 }, labels: {} },
    funilLeads: {}, temperatura: { quentes: [], frios: [] },
    reps: [{ ownerId: OWNER, name: 'Kelly Teste', travados: [], criticos: [], quentes: [], stages: {}, open: 0 }],
    agenda: { eventos: [] },
    ...over
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
let ok = 0, falhou = 0;
function teste(nome, fn) {
  try { fn(); console.log('  ok  ' + nome); ok++; }
  catch (e) { console.error('  FALHA  ' + nome + '\n         ' + e.message); falhou++; }
}
function igual(real, esperado, o) {
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    throw new Error(`${o || 'valor'}: esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(real)}`);
  }
}
function verdade(v, o) { if (!v) throw new Error((o || 'condição') + ' deveria ser verdadeira'); }
function falso(v, o) { if (v) throw new Error((o || 'condição') + ' deveria ser falsa'); }

console.log('\n== Régua de cadência (Escopo 5) ==');

teste('sem config, o motor não inventa régua', () => {
  const c = novoContexto(dados({ cadencias: null }), { ownerId: OWNER, role: 'rep' });
  igual(c.cadenciaConfig(), null, 'cadenciaConfig');
  igual(c.cadenciaDoLead(lead(), null), null, 'cadenciaDoLead');
  igual(c.estadoDaCadencia(lead(), { total: 1, ultimo: diasAtras(2).toISOString() }, null), null, 'estadoDaCadencia');
});

teste('etapa escolhe a régua quando não há desfecho', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  igual(c.cadenciaDoLead(lead({ stageId: '1395880472' }), null).nome, 'negociacao', 'régua da Negociação');
  igual(c.cadenciaDoLead(lead({ stageId: '1395880469' }), null).nome, 'primeiro_contato', 'régua da Prospecção');
});

teste('desfecho manda mais que a etapa', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  igual(c.cadenciaDoLead(lead({ stageId: '1395880472' }), 'decisor_ausente').nome, 'acesso_decisor');
});

teste('recusa explícita tira o negócio da cadência', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  igual(c.cadenciaDoLead(lead(), 'recusou'), null, 'cadência após recusa');
  const sug = c.proximaAcaoSugerida('recusou', lead());
  verdade(sug.encerra, 'sugestão de recusa encerra');
  verdade(sug.motivos.length > 0, 'recusa oferece motivos de saída');
});

teste('toque 1 dado há 2 dias => próximo é o toque 2, atrasado 1 dia', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const est = c.estadoDaCadencia(lead({ stageId: '1395880469' }), { total: 1, ultimo: diasAtras(2).toISOString() }, null);
  igual(est.proximo.toque, 2, 'número do próximo toque');
  igual(est.status, 'atrasada', 'status');
  igual(est.atrasoDias, 1, 'dias de atraso');
});

teste('cadência completa fica encerrada, não em dia', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const est = c.estadoDaCadencia(lead({ stageId: '1395880469' }), { total: 6, ultimo: diasAtras(1).toISOString() }, null);
  igual(est.status, 'encerrada');
  igual(est.proximo, null, 'não há próximo passo depois do último toque');
  verdade(est.encerramento && est.encerramento.opcoes.includes('perder_com_motivo'), 'oferece perder com motivo');
});

teste('atraso de 3 dias ou mais vira cadência quebrada', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const est = c.estadoDaCadencia(lead({ stageId: '1395880469' }), { total: 1, ultimo: diasAtras(9).toISOString() }, null);
  igual(est.status, 'quebrada');
});

console.log('\n== Ponto de contato (Escopo 6) ==');

teste('nota interna NÃO é ponto de contato; nota de contato é', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  falso(c.tpNotaEhContato({ texto: 'Lembrar de conferir o CNPJ antes da próxima etapa' }), 'nota interna');
  verdade(c.tpNotaEhContato({ texto: 'Falei com o gerente, pediu proposta' }), 'nota de contato');
});

teste('assinatura de app de campo define a origem', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  igual(c.tpOrigemDoTexto('Visita feita — Kelly (via App Outbound)'), 'expogo', 'Expogo');
  igual(c.tpOrigemDoTexto('Visita feita — Kelly (via PWA Outbound)'), 'pwa', 'PWA');
  igual(c.tpOrigemDoTexto('Anotação qualquer'), 'hubspot', 'HubSpot');
});

teste('evento do Expogo e do PWA produzem o MESMO formato de touchpoint', () => {
  const l = lead({ id: 'L1', name: 'Bar do Zé' });
  // dealId = associação no HubSpot (lead_deal_id). Sem ele a visita é 'não
  // confirmada' por regra — há um teste próprio para esse caso mais abaixo.
  const base = { ownerId: OWNER, dealId: 'L1', tipo: 'follow_up', dur: 30, cliente: 'Bar do Zé', desfecho: 'COMPLETED', registro: true, decisor: null };
  const c = novoContexto(dados({
    agenda: { eventos: [
      { ...base, id: 'e1', inicio: diasAtras(2), obs: 'visita ok — Kelly (via App Outbound)' },
      { ...base, id: 'e2', inicio: diasAtras(1), obs: 'visita ok — Kelly (via PWA Outbound)' }
    ] },
    funilLeads: { '1396005401': [l] }
  }), { ownerId: OWNER, role: 'rep' });
  const tps = c.touchpointsDoLead(l).filter(t => t.touchpoint_id.startsWith('ag:'));
  igual(tps.length, 2, 'dois touchpoints');
  igual(tps.map(t => t.source).sort(), ['expogo', 'pwa'], 'origens');
  // O contrato é o mesmo: mesmas chaves, mesmo canal, mesmo status.
  igual(Object.keys(tps[0]).sort(), Object.keys(tps[1]).sort(), 'mesmas chaves');
  igual(tps.map(t => t.sync_status), ['sincronizado', 'sincronizado'], 'ambos sincronizados');
});

teste('visita passada sem fechamento = registro incompleto, não realizada', () => {
  const l = lead({ id: 'L2', name: 'Pizzaria X' });
  const c = novoContexto(dados({
    agenda: { eventos: [{ id: 'e9', ownerId: OWNER, dealId: 'L2', tipo: 'rota', inicio: diasAtras(1), cliente: 'Pizzaria X', desfecho: null, registro: false, obs: '', decisor: null }] },
    funilLeads: { '1396005401': [l] }
  }), { ownerId: OWNER, role: 'rep' });
  const tp = c.touchpointsDoLead(l)[0];
  igual(tp.sync_status, 'sincronizado', 'o evento veio do HubSpot: sincronizado');
  falso(tp._realizado, 'não é realizado');
  verdade(tp._semDesfecho, 'está sem desfecho');
  igual(c.rotuloDeRegistroDaVisita(tp).id, 'incompleto', 'visita passada não fechada é registro incompleto, não falha de rede');
});

teste('agendado no futuro não conta como realizado', () => {
  const l = lead({ id: 'L3', name: 'Café Central' });
  const c = novoContexto(dados({
    agenda: { eventos: [{ id: 'e10', ownerId: OWNER, dealId: 'L3', tipo: 'rota', inicio: diasAFrente(1), cliente: 'Café Central', desfecho: null, registro: false, obs: '', decisor: null }] },
    funilLeads: { '1396005401': [l] }
  }), { ownerId: OWNER, role: 'rep' });
  const tp = c.touchpointsDoLead(l)[0];
  verdade(tp._agendadoFuturo, 'é futuro');
  falso(tp._realizado, 'não é realizado');
  igual(c.toquesDoLead(l).total, 0, 'nenhum toque realizado');
  igual(c.rotuloDeRegistroDaVisita(tp).id, 'agendado');
});

teste('contagem de toques é declaradamente parcial', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const t = c.toquesDoLead(lead({ ultimaInteracao: diasAtras(4).toISOString() }));
  igual(t.total, 1, 'piso de 1 toque quando o HubSpot conhece a última interação');
  verdade(t.parcial, 'marcado como parcial');
});

console.log('\n== Estado do negócio (Escopos 4, 8) ==');

teste('visita realizada sem próximo passo = follow-up descoberto', () => {
  const l = lead({ id: 'L4', name: 'Bistrô Sul', ultimaInteracao: diasAtras(1).toISOString() });
  const c = novoContexto(dados({
    agenda: { eventos: [{ id: 'e11', ownerId: OWNER, dealId: 'L4', tipo: 'rota', inicio: diasAtras(1), cliente: 'Bistrô Sul', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null }] },
    funilLeads: { '1396005401': [l] }
  }), { ownerId: OWNER, role: 'rep' });
  const st = c.estadoDoNegocio(l);
  verdade(st.followUpDescoberto, 'follow-up descoberto');
  falso(st.temProximoPasso, 'sem próximo passo');
});

teste('tarefa datada futura fecha o follow-up descoberto', () => {
  const l = lead({ id: 'L5', name: 'Bistrô Sul', tarefas: [{ subject: 'Follow-up - Bistrô Sul', timestamp: diasAFrente(1).toISOString() }] });
  const c = novoContexto(dados({
    agenda: { eventos: [{ id: 'e12', ownerId: OWNER, dealId: 'L5', tipo: 'rota', inicio: diasAtras(1), cliente: 'Bistrô Sul', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null }] },
    funilLeads: { '1396005401': [l] }
  }), { ownerId: OWNER, role: 'rep' });
  const st = c.estadoDoNegocio(l);
  verdade(st.temProximoPasso, 'tem próximo passo');
  falso(st.followUpDescoberto, 'não é mais descoberto');
});

teste('um único toque, 4 dias, nada marcado = abandonado no primeiro toque', () => {
  const l = lead({ id: 'L6', ultimaInteracao: diasAtras(4).toISOString() });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  verdade(c.estadoDoNegocio(l).abandonadoNoPrimeiroToque);
});

teste('proposta em Demo/Negociação sem tarefa = proposta sem data de decisão', () => {
  const l = lead({ id: 'L7', stageId: '1395880471', ultimaInteracao: diasAtras(2).toISOString() });
  const c = novoContexto(dados({ funilLeads: { '1395880471': [l] } }), { ownerId: OWNER, role: 'rep' });
  verdade(c.estadoDoNegocio(l).propostaSemDataDeDecisao);
});

console.log('\n== Fila de follow-up (Escopo 7) ==');

teste('os oito baldes existem e o mesmo negócio não duplica na fila ordenada', () => {
  const quenteSemNada = lead({ id: 'Q1', name: 'Quente Sem Nada', stageId: '1395880472', ultimaInteracao: diasAtras(8).toISOString() });
  const c = novoContexto(dados({ funilLeads: { '1395880472': [quenteSemNada] } }), { ownerId: OWNER, role: 'rep' });
  const fila = c.filaDeFollowUp(OWNER);
  igual(Object.keys(fila.baldes).length, 8, 'oito baldes');
  verdade(fila.baldes.quente_sem_tarefa.length === 1, 'cai em quentes sem tarefa');
  verdade(fila.baldes.cadencia.length === 1, 'cai também em cadência atrasada');
  igual(fila.ordenada.length, 1, 'aparece uma única vez na fila ordenada');
  igual(fila.negociosAfetados, 1, 'um negócio afetado');
});

teste('negócio com tudo em ordem não entra na fila', () => {
  const l = lead({ id: 'OK1', stageId: '1396005401', ultimaInteracao: diasAtras(1).toISOString(),
    tarefas: [{ subject: 'Follow-up - OK', timestamp: diasAFrente(1).toISOString() }] });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  const fila = c.filaDeFollowUp(OWNER);
  igual(fila.baldes.visita_sem_passo.length, 0);
  igual(fila.baldes.hoje.length, 0);
});

teste('próximo passo com data vencida entra em "follow-ups para hoje"', () => {
  const l = lead({ id: 'V1', tarefas: [{ subject: 'Ligar', timestamp: HOJE.toISOString() }] });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  igual(c.filaDeFollowUp(OWNER).baldes.hoje.length, 1);
});

console.log('\n== Gates do dia e CTA (Escopo 1) ==');

teste('dia vazio: gates abertos e CTA vira "Montar minha rota"', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const d = c.gatesDoDia(c.DATA.reps[0]);
  igual(d.total, 7, 'sete gates');
  falso(d.pronto, 'dia não está pronto');
  igual(c.ctaDoDia(d).label, 'Montar minha rota', 'CTA da primeira pendência');
});

teste('visita de hoje sem desfecho leva o CTA para "Registrar resultado de visita"', () => {
  const paradas = [1, 2, 3].map(i => ({
    id: 'p' + i, ownerId: OWNER, dealId: 'g' + (i - 1), tipo: 'rota', inicio: new Date(HOJE.getTime() - i * 3600000),
    cliente: 'Cliente ' + i, desfecho: 'COMPLETED', registro: true, obs: '', decisor: null, lat: -20, lng: -40
  }));
  // a quarta parada é a que ficou sem desfecho
  paradas.push({ id: 'p4', ownerId: OWNER, dealId: 'g3', tipo: 'rota', inicio: new Date(HOJE.getTime() - 3600000),
    cliente: 'Cliente Pendente', desfecho: null, registro: false, obs: '', decisor: null, lat: -20, lng: -40 });
  const leads = paradas.map((p, i) => lead({ id: 'g' + i, name: p.cliente, ultimaInteracao: diasAtras(1).toISOString(),
    tarefas: [{ subject: 'Follow-up', timestamp: diasAFrente(2).toISOString() }] }));
  const c = novoContexto(dados({ agenda: { eventos: paradas }, funilLeads: { '1396005401': leads } }), { ownerId: OWNER, role: 'rep' });
  const d = c.gatesDoDia(c.DATA.reps[0]);
  verdade(d.pronto, 'gates fechados: ' + d.pendentes.map(g => g.id + '(' + g.detalhe + ')').join(', '));
  igual(c.ctaDoDia(d).label, 'Registrar resultado de visita');
  const acoes = c.acoesDeAgora(c.DATA.reps[0], d);
  igual(acoes[0].verbo, 'Registrar desfecho', 'a primeira ação é fechar o registro');
  igual(acoes[0].cliente, 'Cliente Pendente');
});

teste('no máximo três ações, cada uma com os campos obrigatórios', () => {
  const leads = [1, 2, 3, 4, 5].map(i => lead({ id: 'm' + i, name: 'Lead ' + i, ultimaInteracao: diasAtras(6).toISOString() }));
  const c = novoContexto(dados({ funilLeads: { '1396005401': leads } }), { ownerId: OWNER, role: 'rep' });
  const d = c.gatesDoDia(c.DATA.reps[0]);
  const acoes = c.acoesDeAgora(c.DATA.reps[0], d);
  verdade(acoes.length <= 3, 'no máximo 3 (veio ' + acoes.length + ')');
  verdade(acoes.length > 0, 'pelo menos 1');
  acoes.forEach(a => {
    ['verbo', 'cliente', 'motivo', 'prazo', 'ultimaInteracao', 'ctaLabel'].forEach(k => {
      verdade(a[k], `ação sem campo ${k}`);
    });
    verdade(typeof a.acao === 'function', 'ação sem botão executável');
  });
});

teste('quente sem próxima ação abre o gate de quentes', () => {
  const q = lead({ id: 'QQ', stageId: '1395880473', ultimaInteracao: diasAtras(1).toISOString() });
  const c = novoContexto(dados({ funilLeads: { '1395880473': [q] } }), { ownerId: OWNER, role: 'rep' });
  const d = c.gatesDoDia(c.DATA.reps[0]);
  falso(d.gates.find(g => g.id === 'quentes').ok, 'gate de quentes deveria estar aberto');
});

teste('visita sem associação de negócio no HubSpot é "não confirmada"', () => {
  const l = lead({ id: 'NC', name: 'Bar Sem Vínculo' });
  const c = novoContexto(dados({
    // sem dealId de propósito: é o caso dos 24 itens da carga real que chegam sem
    // lead_deal_id — o nome bate, a associação não existe.
    agenda: { eventos: [{ id: 'enc', ownerId: OWNER, tipo: 'rota', inicio: diasAtras(1), cliente: 'Bar Sem Vínculo', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null }] },
    funilLeads: { '1396005401': [l] }
  }), { ownerId: OWNER, role: 'rep' });
  const tp = c.touchpointsDoLead(l)[0];
  verdade(tp._clienteNaoConfirmado, 'marcado como não confirmado');
  igual(c.rotuloDeRegistroDaVisita(tp).id, 'nao_confirmada', 'não confirmada ganha de qualquer outro estado');
});

teste('uma parada só não é rota; duas são', () => {
  const ev = (i, hora) => ({ id: 'r' + i, ownerId: OWNER, dealId: 'x' + i, tipo: 'rota',
    inicio: new Date(HOJE.getTime() - hora * 3600000), cliente: 'C' + i, desfecho: null, registro: false, obs: '', decisor: null });
  const um = novoContexto(dados({ agenda: { eventos: [ev(1, 2)] } }), { ownerId: OWNER, role: 'rep' });
  falso(um.gatesDoDia(um.DATA.reps[0]).gates.find(g => g.id === 'rota').ok, 'uma parada: rota aberta');
  const dois = novoContexto(dados({ agenda: { eventos: [ev(1, 2), ev(2, 1)] } }), { ownerId: OWNER, role: 'rep' });
  verdade(dois.gatesDoDia(dois.DATA.reps[0]).gates.find(g => g.id === 'rota').ok, 'duas paradas: rota fechada');
});

teste('o gate de agenda respeita o alvo da fase de rampagem', () => {
  const ev = i => ({ id: 'a' + i, ownerId: OWNER, dealId: 'y' + i, tipo: 'rota',
    inicio: new Date(HOJE.getTime() - i * 3600000), cliente: 'C' + i, desfecho: null, registro: false, obs: '', decisor: null });
  const tres = [ev(1), ev(2), ev(3)];
  // Fase com alvo 3: três compromissos fecham o gate.
  const rampa = novoContexto(dados({ rampAlvo: 3, agenda: { eventos: tres } }), { ownerId: OWNER, role: 'rep' });
  verdade(rampa.gatesDoDia(rampa.DATA.reps[0]).gates.find(g => g.id === 'agenda').ok, 'alvo 3 com 3 compromissos');
  // Fase pleno com alvo 6: os mesmos três não bastam — e o texto diz quanto falta.
  const pleno = novoContexto(dados({ rampAlvo: 6, agenda: { eventos: tres } }), { ownerId: OWNER, role: 'rep' });
  const g = pleno.gatesDoDia(pleno.DATA.reps[0]).gates.find(x => x.id === 'agenda');
  falso(g.ok, 'alvo 6 com 3 compromissos');
  verdade(/3 de 6/.test(g.detalhe), 'detalhe mostra 3 de 6, veio: ' + g.detalhe);
  // Sem fase definida, o gate não inventa alvo — basta ter 1.
  const semFase = novoContexto(dados({ agenda: { eventos: [ev(1)] } }), { ownerId: OWNER, role: 'rep' });
  const g2 = semFase.gatesDoDia(semFase.DATA.reps[0]).gates.find(x => x.id === 'agenda');
  verdade(g2.ok, 'sem fase: 1 compromisso basta');
  verdade(/não definida/.test(g2.detalhe), 'detalhe avisa que não há alvo');
});

console.log('\n== Transição Expogo → PWA (Escopo 14) ==');

teste('mesma visita chegando por dois caminhos conta UMA vez', () => {
  // Cenário real da carga de 27/08: "Rei dos galetos" no mesmo dia, duas vezes —
  // uma pela nota do app (sem associação) e uma pela tarefa (com associação).
  const hojeK = iso(HOJE);
  const c = novoContexto(dados({ agenda: { eventos: [
    { id: 'd1', ownerId: OWNER, tipo: 'follow_up', inicio: new Date(HOJE.getTime() - 3 * 3600000), cliente: 'Rei dos Galetos', desfecho: 'COMPLETED', registro: true, obs: '— Kelly (via App Outbound)', decisor: null },
    { id: 'd2', ownerId: OWNER, dealId: 'RG', tipo: 'rota', inicio: new Date(HOJE.getTime() - 2 * 3600000), cliente: 'Rei dos galetos', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null },
    { id: 'd3', ownerId: OWNER, dealId: 'OU', tipo: 'rota', inicio: new Date(HOJE.getTime() - 1 * 3600000), cliente: 'Outro Cliente', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null }
  ] } }), { ownerId: OWNER, role: 'rep' });
  const at = c.atividadesComprovadasNoDia(OWNER, hojeK);
  igual(at.feitos.length, 2, 'dois clientes distintos');
  igual(at.duplicadas.length, 1, 'uma duplicata reportada, não descartada em silêncio');
  // Fica o registro COM associação de negócio.
  verdade(at.feitos.some(e => e.id === 'd2'), 'mantém o que tem dealId');
});

teste('clientes diferentes no mesmo dia não são deduplicados', () => {
  const hojeK = iso(HOJE);
  const c = novoContexto(dados({ agenda: { eventos: [1, 2, 3].map(i => ({
    id: 'n' + i, ownerId: OWNER, dealId: 'z' + i, tipo: 'rota',
    inicio: new Date(HOJE.getTime() - i * 3600000), cliente: 'Cliente ' + i,
    desfecho: 'COMPLETED', registro: true, obs: '', decisor: null })) } }), { ownerId: OWNER, role: 'rep' });
  const at = c.atividadesComprovadasNoDia(OWNER, hojeK);
  igual(at.feitos.length, 3);
  igual(at.duplicadas.length, 0);
});

teste('sequência de execução conta visita comprovada, não promessa', () => {
  const hojeK = iso(HOJE);
  const c = novoContexto(dados({ agenda: { eventos: [
    { id: 's1', ownerId: OWNER, dealId: 'a', tipo: 'rota', inicio: new Date(HOJE.getTime() - 3600000), cliente: 'A', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null }
  ] } }), { ownerId: OWNER, role: 'rep' });
  // getDaily/visitasReaisDoOwnerNoDia/isWeekend/dailyRefDate são do entorno da Daily;
  // aqui só validamos que a função existe e não depende de prometido_*.
  verdade(typeof c.sequenciaDeExecucao === 'function', 'sequenciaDeExecucao existe');
  const fonte = String(c.sequenciaDeExecucao);
  falso(/prometido/.test(fonte), 'não lê nenhum campo prometido_*');
  verdade(/visitasReaisDoOwnerNoDia/.test(fonte), 'usa a contagem derivada de visitas reais');
});

console.log('\n== Frescor de dados (não acusar com carga velha) ==');

teste('carga recente é confiável', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const f = c.frescorDosDados();
  verdade(f.confiavel, 'confiável');
  falso(f.velho, 'não é velha');
  igual(f.expogo, 'nao_confirmado', 'Expogo declarado como não confirmado');
  igual(f.pwa, 'nao_confirmado', 'PWA declarado como não confirmado');
});

teste('carga de 10h atrás não é confiável e o gate de carga avisa sem cobrar', () => {
  const c = novoContexto(dados({ hubspotUpdatedAtISO: new Date(HOJE.getTime() - 10 * 3600000).toISOString() }), { ownerId: OWNER, role: 'rep' });
  const f = c.frescorDosDados();
  verdade(f.velho, 'marcada como velha');
  falso(f.confiavel, 'não confiável');
  const d = c.gatesDoDia(c.DATA.reps[0]);
  const gCarga = d.gates.find(g => g.id === 'carga');
  falso(gCarga.ok, 'gate de carga aberto');
  igual(gCarga.cta, null, 'gate de carga não tem CTA de cobrança');
  verdade(gCarga.informativo, 'gate de carga é informativo');
  falso(c.checagensDaJanela(c.DATA.reps[0], d).cobravel, 'janela não é cobrável com carga velha');
});

teste('falha de sincronização própria aparece pro executivo', () => {
  const c = novoContexto(dados({ syncStatus: { ultimaExecucao: HOJE.toISOString(), houveFalha: true, falhaMinha: true } }), { ownerId: OWNER, role: 'rep' });
  const f = c.frescorDosDados();
  verdade(f.falhaMinha, 'falha própria');
  falso(f.confiavel, 'não confiável com falha');
});

console.log('\n== Indicadores do executivo (Escopo 12) ==');

teste('indicadores declaram amostra quando não há base de cálculo', () => {
  const c = novoContexto(dados({ funilLeads: { '1396005401': [lead({ id: 'i1', ultimaInteracao: diasAtras(2).toISOString() })] } }), { ownerId: OWNER, role: 'rep' });
  const ind = c.indicadoresDoExecutivo(c.DATA.reps[0]);
  const t2 = ind.find(x => x.id === 'segundo_toque');
  igual(t2.valor, null, 'sem amostra, valor é null e não 0');
  verdade(/sem amostra/.test(t2.nota), 'a nota explica por quê');
});

console.log('\n== Papéis (Escopo: não alterar a experiência do gestor) ==');

teste('lead vindo de funilLeads herda a etapa da chave (e com ela a régua certa)', () => {
  // Regressão do bug de 27/08: funilLeads indexa por etapa, o lead não carrega o
  // campo. Sem herdar, um negócio em Negociação recebia a régua de primeiro contato.
  const semEtapa = { id: 'FL1', name: 'Negócio em Negociação', ownerId: OWNER, dias: 3, tarefas: [], notas: [], ultimaInteracao: diasAtras(2).toISOString() };
  const c = novoContexto(dados({
    funilLeads: { '1395880472': [semEtapa] },
    stageMeta: { slaDays: { '1395880472': 7 }, labels: { '1395880472': 'Negociação' } }
  }), { ownerId: OWNER, role: 'rep' });
  const l = c.meusNegociosAbertos(OWNER)[0];
  igual(l.stageId, '1395880472', 'stageId herdado da chave');
  igual(c.estadoDoNegocio(l).cadencia.nome, 'negociacao', 'régua da etapa, não a de primeiro contato');
});

teste('o núcleo não lê nada de colega: fila só olha o ownerId pedido', () => {
  const meu = lead({ id: 'meu', ownerId: OWNER, ultimaInteracao: diasAtras(6).toISOString() });
  const colega = lead({ id: 'colega', ownerId: '999', ultimaInteracao: diasAtras(6).toISOString() });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [meu, colega] } }), { ownerId: OWNER, role: 'rep' });
  const ids = c.meusNegociosAbertos(OWNER).map(l => l.id);
  igual(ids, ['meu'], 'só o próprio negócio');
});

console.log('');
if (falhou > 0) { console.error(`${falhou} falha(s), ${ok} ok.`); process.exit(1); }
console.log(`${ok} testes ok.`);
