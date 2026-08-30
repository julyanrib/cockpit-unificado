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
  + '\n' + recortar('/* @nucleo2:inicio', '/* @nucleo2:fim */')
  // @nucleo3: as funções que espelham escrita no DATA em memória. Entram porque a
  // ordem "escreve → invalida → re-deriva" é contrato, e é fácil de quebrar.
  + '\n' + recortar('/* @nucleo3:inicio', '/* @nucleo3:fim */');

// ---------------------------------------------------------------------------
// Entorno mínimo. Cada stub reproduz o CONTRATO da função real do template,
// não o comportamento inteiro dela — o que o núcleo consome está aqui.
// ---------------------------------------------------------------------------
/* RELÓGIO FIXO (corrigido 28/08/26, à 00:02 UTC, com 5 testes vermelhos na mão).
   A 1ª versão usava `HOJE = new Date()` — agora de verdade — porque o núcleo chama
   Date.now() e congelar o relógio do teste num instante DIFERENTE do dele dava falso
   negativo no frescor de dados. A correção estava certa pela metade: os fixtures
   posicionam evento "de hoje" em `HOJE - N horas`, e depois da meia-noite UTC isso cai
   no dia ANTERIOR. Rodando às 00:02, cinco testes acusaram "nenhuma parada montada
   para hoje" e "veio 0" — não havia regressão nenhuma no código, era a suíte.

   Solução: fixar o relógio DOS DOIS LADOS. AGORA é meio-dia UTC do dia corrente (longe
   de qualquer borda de meia-noite), e o `Date` injetado no sandbox tem `now()` e
   `new Date()` sem argumentos devolvendo esse mesmo instante. Assim o teste e o núcleo
   concordam sobre "agora", e o resultado não depende da hora em que a suíte roda. */
const _real = new Date();
/* ...E EM DIA ÚTIL (corrigido 29/08/26, com 4 testes vermelhos na mão).
   Mesma classe do bug de meia-noite acima, na outra borda. A suíte rodou num sábado e
   quatro testes do ciclo fechado acusaram 'esperava 1, veio 0'. Não havia regressão:
   cicloFechadoDaSemana conta apenas DIAS ÚTEIS (a função pula dow 0 e 6, de propósito),
   e os fixtures posicionam a visita em iso(HOJE). Num sábado, 'hoje' não é dia útil e a
   visita fica fora da janela — o teste passou a medir o calendário, não o código.

   Ancorar num dia útil também é o mais fiel ao que a suíte existe para verificar: as
   regras deste produto são de rotina comercial de campo, escritas para segunda a sexta.
   O relógio continua sendo o de hoje (frescor de dados segue realista) e continua fixo
   dos dois lados; só recua para a sexta quando cai no fim de semana. */
const _diaUtil = new Date(Date.UTC(_real.getUTCFullYear(), _real.getUTCMonth(), _real.getUTCDate()));
while (_diaUtil.getUTCDay() === 0 || _diaUtil.getUTCDay() === 6) _diaUtil.setUTCDate(_diaUtil.getUTCDate() - 1);
const AGORA_MS = Date.UTC(_diaUtil.getUTCFullYear(), _diaUtil.getUTCMonth(), _diaUtil.getUTCDate(), 12, 0, 0);
class DataFixa extends Date {
  constructor(...a) { if (a.length === 0) super(AGORA_MS); else super(...a); }
  static now() { return AGORA_MS; }
}
const HOJE = new Date(AGORA_MS);
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
    // Date FIXO: o núcleo chama Date.now() e new Date() lá dentro; os dois têm que
    // devolver o mesmo instante que os fixtures usaram (ver RELÓGIO FIXO acima).
    Date: DataFixa,
    Math, JSON, Object, Array, Number, String, Boolean, Set, Map, isNaN, parseInt, parseFloat,
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
    // proximoPassoDoLead NÃO é stubbado (28/08/26). Ele era, e o stub reescrevia a
    // regra à mão com `x.quando >= HOJE` — a mesma comparação por instante que estava
    // errada em produção. Com a regra em duas cópias igualmente erradas, nenhum teste
    // podia pegar o bug de "tarefa de hoje desaparece às 9h01". A função foi movida
    // para dentro do @nucleo no template e agora é a real que roda aqui.
    // Stub serve para I/O, DOM e ambiente. Regra de negócio, nunca.
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
    // labels PREENCHIDO (28/08/26): estava `{}`, e o sandbox monta STAGE_LABELS a
    // partir daqui. gargaloDoRep faz `ORDEM_ETAPAS_FUNIL.filter(sid => STAGE_LABELS[sid])`
    // — com labels vazio a ordem ficava vazia e a função devolvia sid null em silêncio.
    // Em produção STAGE_LABELS é const preenchida no template, então isto era lacuna do
    // fixture, não bug do código; mas com o fixture mudo nenhum teste de gargalo valia.
    stageMeta: {
      slaDays: { '1396005401': 5, '1395880470': 4, '1395880471': 3, '1395880472': 7, '1395880473': 2, '1395880469': 5 },
      labels: {
        '1395880469': 'Prospecção', '1396005401': 'Visita', '1395880470': 'Conversa com Decisor',
        '1395880471': 'Demo/Proposta', '1395880472': 'Negociação', '1395880473': 'Ag. Pagamento',
        '1398311191': 'Reciclagem'
      }
    },
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

console.log('\n== Ordem do Meu funil (Escopo 8) ==');

teste('SLA estourado vem antes de quente sem ação e de follow-up vencido', () => {
  // Ordem da 2ª rodada do briefing: SLA estourado, quente sem próxima ação,
  // follow-up vencido, sem data de decisão, resto. (A 1ª rodada pedia visita sem
  // follow-up na frente — a instrução mais recente ganha, ver PRIORIDADE_FUNIL.)
  const visitado = lead({ id: 'A', name: 'Visitado sem passo', ultimaInteracao: diasAtras(1).toISOString(), dias: 1 });
  const estourado = lead({ id: 'B', name: 'SLA estourado', slaBreach: true, dias: 30, ultimaInteracao: diasAtras(30).toISOString() });
  const quente = lead({ id: 'C', name: 'Quente sem ação', stageId: '1395880472', dias: 2, ultimaInteracao: diasAtras(2).toISOString() });
  const c = novoContexto(dados({
    agenda: { eventos: [{ id: 'ev', ownerId: OWNER, dealId: 'A', tipo: 'rota', inicio: diasAtras(1), cliente: 'Visitado sem passo', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null }] },
    funilLeads: { '1396005401': [visitado, estourado], '1395880472': [quente] }
  }), { ownerId: OWNER, role: 'rep' });
  const ordenados = c.ordenarMeuFunil([visitado, estourado, quente], ['C']);
  igual(ordenados.map(l => l.id), ['B', 'C', 'A'], 'ordem por gravidade');
  igual(ordenados[0]._prioRotulo, 'SLA estourado');
  igual(ordenados[1]._prioRotulo, 'quente sem próxima ação');
  igual(ordenados[2]._prioRotulo, 'follow-up vencido');
});

teste('negócio em ordem cai no resto e desempata por dias na etapa', () => {
  // dias abaixo do SLA da etapa (5 em 1396005401), senão o SLA estourado ganha a
  // prioridade e o desempate nunca é exercitado.
  const ok1 = lead({ id: 'X', dias: 2, ultimaInteracao: diasAtras(1).toISOString(), tarefas: [{ subject: 'Follow-up', timestamp: diasAFrente(2).toISOString() }] });
  const ok2 = lead({ id: 'Y', dias: 4, ultimaInteracao: diasAtras(1).toISOString(), tarefas: [{ subject: 'Follow-up', timestamp: diasAFrente(2).toISOString() }] });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [ok1, ok2] } }), { ownerId: OWNER, role: 'rep' });
  const ordenados = c.ordenarMeuFunil([ok1, ok2], []);
  igual(ordenados.map(l => l._prio), [99, 99], 'ambos no resto');
  igual(ordenados.map(l => l.id), ['Y', 'X'], 'mais dias na etapa primeiro');
});

teste('tarefa datada no futuro tira o negócio do balde de cadência atrasada', () => {
  // Sem a tarefa, a régua de Visita (acesso_decisor, toque 2 em D+1) considera o
  // negócio atrasado desde ontem. Com a tarefa marcada, o executivo já comprometeu
  // uma data — o negócio não está descoberto.
  const base = { id: 'P1', name: 'Com plano', ownerId: OWNER, stageId: '1396005401', dias: 3, tarefas: [], notas: [], ultimaInteracao: diasAtras(3).toISOString() };
  const semPlano = novoContexto(dados({ funilLeads: { '1396005401': [base] } }), { ownerId: OWNER, role: 'rep' });
  igual(semPlano.estadoDoNegocio(base).cadencia.status, 'atrasada', 'sem plano: atrasada');
  igual(semPlano.filaDeFollowUp(OWNER).baldes.cadencia.length, 1, 'sem plano: entra no balde');

  const comTarefa = { ...base, tarefas: [{ subject: 'Ligar', timestamp: diasAFrente(2).toISOString() }] };
  const comPlano = novoContexto(dados({ funilLeads: { '1396005401': [comTarefa] } }), { ownerId: OWNER, role: 'rep' });
  igual(comPlano.estadoDoNegocio(comTarefa).cadencia.status, 'planejada', 'com plano: planejada');
  igual(comPlano.filaDeFollowUp(OWNER).baldes.cadencia.length, 0, 'com plano: sai do balde');
});

console.log('\n== Gates do dia e CTA (Escopo 1) ==');

teste('dia vazio: gates abertos e CTA vira "Montar minha rota"', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const d = c.gatesDoDia(c.DATA.reps[0]);
  igual(d.total, 7, 'sete gates');
  falso(d.pronto, 'dia não está pronto');
  igual(c.ctaDoDia(d).label, 'Montar minha rota', 'CTA da primeira pendência');
});

teste('visita de hoje sem desfecho leva o CTA para "Registrar resultado pendente"', () => {
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
  igual(c.ctaDoDia(d).label, 'Registrar resultado pendente');
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

teste('fase com alvo 0 não é confundida com "fase não definida"', () => {
  // Regressão: entrante em Semanas 2–3 (alvo 0) com 1 compromisso lia "fase de
  // rampagem não definida" — a fase dele ESTÁ definida, ela só não cobra rua ainda.
  const ev = { id: 'z1', ownerId: OWNER, dealId: 'zz', tipo: 'rota', inicio: diasAtras(0.1),
    cliente: 'C', desfecho: null, registro: false, obs: '', decisor: null };
  const c = novoContexto(dados({ rampAlvo: 0, agenda: { eventos: [ev] } }), { ownerId: OWNER, role: 'rep' });
  const g = c.gatesDoDia(c.DATA.reps[0]).gates.find(x => x.id === 'agenda');
  verdade(g.ok, 'alvo 0: um compromisso basta');
  falso(/não definida/.test(g.detalhe), 'NÃO deve dizer "não definida", veio: ' + g.detalhe);
  verdade(/não cobra volume/.test(g.detalhe), 'deve explicar que a fase não cobra volume, veio: ' + g.detalhe);
});

console.log('\n== Desfecho estruturado: escrever E ler (o ciclo fechado) ==');

// Reproduz exatamente o bloco que desfechoNotaEstruturada() grava.
function notaDesfecho(over) {
  const d = Object.assign({
    cliente: 'Bar do Zé', ocorrido_em: diasAtras(1).toISOString(), canal: 'visita',
    desfecho: 'decisor_ausente', pessoa: 'Marcos', papel: 'Gerente',
    decisor_alcancado: 'nao', dor: 'taxa de marketplace come a margem',
    objecao: '', interesse: 'cardápio digital', observacao: 'dono só depois das 19h',
    proximo_passo: 'ligacao | ' + iso(diasAFrente(1)) + ' | Ligar pedindo o decisor pelo nome',
    cadencia: 'acesso_decisor #2', origem: 'pwa'
  }, over || {});
  const linhas = ['DESFECHO_VISITA v1'];
  Object.keys(d).forEach(k => { if (k !== '_versao') linhas.push(k + ': ' + d[k]); });
  return linhas.join('\n');
}

teste('o bloco DESFECHO_VISITA gravado é lido de volta, campo por campo', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const d = c.tpDesfechoDaNota(notaDesfecho());
  verdade(d, 'parseou');
  igual(d.desfecho, 'decisor_ausente');
  igual(d.pessoa, 'Marcos');
  igual(d.papel, 'Gerente');
  igual(d.decisorAlcancado, false, 'nao = false');
  igual(d.dor, 'taxa de marketplace come a margem');
  igual(d.objecao, null, 'campo vazio vira null, não string vazia');
  igual(d.interesse, 'cardápio digital');
  igual(d.origem, 'pwa');
  igual(d.proximo.canal, 'ligacao');
  igual(d.proximo.acao, 'Ligar pedindo o decisor pelo nome');
  igual(d.cadencia, { nome: 'acesso_decisor', toque: 2 });
});

teste('ausência de decisor_alcancado é DESCONHECIDO, não "não"', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const semCampo = notaDesfecho().split('\n').filter(l => !/^decisor_alcancado/.test(l)).join('\n');
  igual(c.tpDesfechoDaNota(semCampo).decisorAlcancado, null, 'sem campo = null');
  igual(c.tpDesfechoDaNota(notaDesfecho({ decisor_alcancado: 'sim' })).decisorAlcancado, true);
});

teste('nota qualquer não é confundida com desfecho', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  igual(c.tpDesfechoDaNota('Falei com o gerente, pediu proposta'), null);
  igual(c.tpDesfechoDaNota(''), null);
});

teste('versão futura do bloco não é reinterpretada em silêncio', () => {
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'rep' });
  const v9 = notaDesfecho().replace('DESFECHO_VISITA v1', 'DESFECHO_VISITA v9');
  const d = c.tpDesfechoDaNota(v9);
  igual(d.versao, 9);
  falso(d.versaoConhecida, 'marcado como versão desconhecida');
  const l = lead({ id: 'V9', name: 'Bar do Zé', notas: [{ texto: v9, data: diasAtras(1).toISOString() }] });
  const c2 = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  const tp = c2.touchpointsDoLead(l)[0];
  igual(tp.sync_status, 'requer_revisao', 'entra como requer revisão, não como sincronizado');
});

teste('desfecho registrado passa a MANDAR na cadência (era o bug)', () => {
  // Negócio em Negociação: pela ETAPA, a régua seria `negociacao`. Com desfecho
  // "decisor ausente" registrado, tem que virar `acesso_decisor`.
  const semNota = lead({ id: 'C1', name: 'Bar do Zé', stageId: '1395880472', dias: 3, ultimaInteracao: diasAtras(1).toISOString() });
  const a = novoContexto(dados({ funilLeads: { '1395880472': [semNota] } }), { ownerId: OWNER, role: 'rep' });
  igual(a.estadoDoNegocio(semNota).cadencia.nome, 'negociacao', 'sem desfecho: régua da etapa');

  const comNota = { ...semNota, notas: [{ texto: notaDesfecho(), data: diasAtras(1).toISOString() }] };
  const b = novoContexto(dados({ funilLeads: { '1395880472': [comNota] } }), { ownerId: OWNER, role: 'rep' });
  const st = b.estadoDoNegocio(comNota);
  igual(st.ultimoDesfecho, 'decisor_ausente', 'desfecho lido');
  igual(st.cadencia.nome, 'acesso_decisor', 'desfecho ganha da etapa');
  igual(st.desfechos.length, 1, 'exposto para a ficha e os indicadores');
});

teste('decisor alcançado vem do desfecho, não de campo inexistente', () => {
  const l = lead({ id: 'D1', name: 'Bar do Zé', ultimaInteracao: diasAtras(1).toISOString(),
    notas: [{ texto: notaDesfecho({ desfecho: 'decisor_falou', decisor_alcancado: 'sim' }), data: diasAtras(1).toISOString() }] });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  verdade(c.estadoDoNegocio(l).decisorAlcancado, 'decisor alcançado');
});

teste('visita fica completa quando existe desfecho do mesmo dia', () => {
  const quando = diasAtras(1);
  const l = lead({ id: 'F1', name: 'Bar do Zé', ultimaInteracao: quando.toISOString() });
  // Compromisso passado e não fechado: sozinho, é registro incompleto.
  const ev = { id: 'evf', ownerId: OWNER, dealId: 'F1', tipo: 'rota', inicio: quando, cliente: 'Bar do Zé', desfecho: null, registro: false, obs: '', decisor: null };
  const sem = novoContexto(dados({ agenda: { eventos: [ev] }, funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  igual(sem.estadoDoNegocio(l).visitaSemDesfecho.length, 1, 'sem desfecho: incompleto');

  const lComNota = { ...l, notas: [{ texto: notaDesfecho({ ocorrido_em: quando.toISOString() }), data: quando.toISOString() }] };
  const com = novoContexto(dados({ agenda: { eventos: [ev] }, funilLeads: { '1396005401': [lComNota] } }), { ownerId: OWNER, role: 'rep' });
  igual(com.estadoDoNegocio(lComNota).visitaSemDesfecho.length, 0, 'com desfecho do dia: completo');
});

teste('escrita local + invalidação + re-derivação fecha o ciclo na mesma sessão', () => {
  // Contrato das funções aplicar*NoDataLocal: elas mutam os objetos DENTRO de DATA, e
  // meusNegociosAbertos devolve CÓPIA dos itens de funilLeads. Quem segurar a
  // referência antiga não vê a mutação — este teste fixa a ordem correta.
  const base = { id: 'CI1', name: 'Ciclo', ownerId: OWNER, stageId: null, dias: 3, tarefas: [], notas: [], ultimaInteracao: diasAtras(2).toISOString() };
  const c = novoContexto(dados({ funilLeads: { '1395880471': [base] } }), { ownerId: OWNER, role: 'rep' });
  const pega = () => c.meusNegociosAbertos(OWNER)[0];

  igual(c.estadoDoNegocio(pega()).ultimoDesfecho, null, 'antes: sem desfecho');
  igual(c.estadoDoNegocio(pega()).cadencia.nome, 'pos_demo', 'antes: régua da etapa Demo/Proposta');

  c.aplicarNotaNoDataLocal('CI1', { texto: notaDesfecho({ cliente: 'Ciclo' }), data: diasAtras(1).toISOString() });
  c.tpInvalidarCache();

  const depois = c.estadoDoNegocio(pega());
  igual(depois.ultimoDesfecho, 'decisor_ausente', 'depois: desfecho lido');
  igual(depois.cadencia.nome, 'acesso_decisor', 'depois: régua do desfecho');
  igual(depois.desfechos[0].pain, 'taxa de marketplace come a margem', 'dor disponível pra ficha');
});

console.log('\n== Memoização e índice (não recalcular o funil 3x por tela) ==');

teste('estadoDoNegocio é memoizado por render e invalidado junto com a agenda', () => {
  const l = lead({ id: 'M1', ultimaInteracao: diasAtras(2).toISOString() });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  const a = c.estadoDoNegocio(l);
  const b = c.estadoDoNegocio(l);
  verdade(a === b, 'segunda chamada devolve o MESMO objeto (veio do cache)');
  c.tpInvalidarCache();
  const d = c.estadoDoNegocio(l);
  falso(a === d, 'depois de invalidar, recalcula');
  igual(d.toques.total, a.toques.total, 'e o resultado continua igual');
});

teste('o índice de eventos acha o mesmo que a varredura linear achava', () => {
  const l1 = lead({ id: 'I1', name: 'Bar do Zé' });
  const l2 = lead({ id: 'I2', name: 'Outro Lugar' });
  const eventos = [
    // casa por dealId, com nome diferente (título cru do HubSpot)
    { id: 'x1', ownerId: OWNER, dealId: 'I1', tipo: 'rota', inicio: diasAtras(2), cliente: 'Visita - Bar do Ze', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null },
    // casa por nome, sem dealId
    { id: 'x2', ownerId: OWNER, tipo: 'follow_up', inicio: diasAtras(3), cliente: 'Outro Lugar', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null },
    // não é de nenhum dos dois
    { id: 'x3', ownerId: OWNER, dealId: 'ZZ', tipo: 'rota', inicio: diasAtras(1), cliente: 'Terceiro', desfecho: 'COMPLETED', registro: true, obs: '', decisor: null }
  ];
  const c = novoContexto(dados({ agenda: { eventos }, funilLeads: { '1396005401': [l1, l2] } }), { ownerId: OWNER, role: 'rep' });
  igual(c.touchpointsDoLead(l1).filter(t => t.touchpoint_id.startsWith('ag:')).map(t => t.touchpoint_id), ['ag:x1'], 'l1 por dealId');
  igual(c.touchpointsDoLead(l2).filter(t => t.touchpoint_id.startsWith('ag:')).map(t => t.touchpoint_id), ['ag:x2'], 'l2 por nome');
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
  // A contagem derivada agora vem de visitasComprovadasNoDia, que encapsula
  // visitasReaisDoOwnerNoDia + fallback no campo gravado.
  verdade(/visitasComprovadasNoDia/.test(fonte), 'usa a contagem comprovada, não campo prometido');
  verdade(/visitasReaisDoOwnerNoDia/.test(String(c.visitasComprovadasNoDia)), 'que por sua vez deriva das visitas reais');
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

console.log('\n== Sinal da conta-alvo (Prospecção: mostrar o que ela TEM) ==');

teste('com avaliação, o sinal é a avaliação', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const s = c.prospeccaoSinalPrincipal({ avaliacoes: 7790 }, HOJE.getTime());
  igual(s.tipo, 'avaliacoes', 'tipo');
  igual(s.valor, (7790).toLocaleString('pt-BR'), 'formatado em pt-BR');
  igual(s.rotulo, 'avaliações', 'rótulo');
});

teste('sem avaliação mas com data de abertura, o sinal é a idade', () => {
  // O caso das 566 da Casa dos Dados: 65% da base. Antes exibiam "—".
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const tresMeses = new Date(HOJE.getTime() - 92 * DIA).toISOString();
  const s = c.prospeccaoSinalPrincipal({ avaliacoes: null, data_abertura: tresMeses }, HOJE.getTime());
  igual(s.tipo, 'abertura', 'tipo');
  igual(s.valor, '3', 'três meses');
  igual(s.rotulo, 'meses de aberta', 'plural certo');
  verdade(s.recente, 'até 6 meses é recém-aberta');
});

teste('recém-aberta tem corte em 6 meses, e o plural de 1 mês é singular', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const umMes = new Date(HOJE.getTime() - 31 * DIA).toISOString();
  const s1 = c.prospeccaoSinalPrincipal({ data_abertura: umMes }, HOJE.getTime());
  igual(s1.valor, '1', 'um mês');
  igual(s1.rotulo, 'mês de aberta', 'singular');
  verdade(s1.recente, 'é recente');

  const oitoMeses = new Date(HOJE.getTime() - 250 * DIA).toISOString();
  const s2 = c.prospeccaoSinalPrincipal({ data_abertura: oitoMeses }, HOJE.getTime());
  falso(s2.recente, 'oito meses não é recém-aberta');
});

teste('sem avaliação e sem abertura, declara que não há sinal — não finge', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const s = c.prospeccaoSinalPrincipal({ avaliacoes: null, data_abertura: null }, HOJE.getTime());
  igual(s.tipo, 'nenhum', 'tipo');
  igual(s.valor, '—', 'travessão só quando realmente não há nada');
  igual(s.rotulo, 'sem sinal na base', 'e diz por quê');
});

teste('data de abertura inválida não vira NaN na tela', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const s = c.prospeccaoSinalPrincipal({ data_abertura: 'nao-e-data' }, HOJE.getTime());
  igual(s.tipo, 'nenhum', 'cai no caso sem sinal');
  igual(s.valor, '—', 'sem NaN');
});

teste('categoria inferida do nome, com os falsos positivos reais da base', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const f = c.prospeccaoCategoriaPeloNome;
  igual(f('AURA ROMANA PIZZARIA'), 'Pizzaria', 'pizzaria');
  igual(f('CHURRAS KELER LTDA'), 'Churrascaria', 'churrasco');
  igual(f('RAIZ XISERIA E CIA'), 'Lanchonete', 'xiseria');
  igual(f('CAFE.'), 'Cafeteria', 'café com ponto');
  igual(f('TCHE DELICIAS IND E COM DE ALIMENTACAO LTDA'), null, 'sem palavra de ramo: null, não chute');
  igual(f('E. MARQUES DA SILVA E T. BENELLI DA LUZ DA SILVA LTDA'), null, 'razão social pura');

  // Casos REAIS de falso positivo medidos na base: "barra" é bairro, não bar.
  // E nos dois primeiros a categoria certa está em OUTRA palavra — por isso a ordem
  // de teste vai do específico ao genérico e "bar" fica no fim.
  igual(f('HAMBURGUERIA BARRA'), 'Hamburgueria', 'hamburgueria vence "barra"');
  igual(f('CAFE CULTURA BARRA LTDA'), 'Cafeteria', 'café vence "barra"');
  igual(f('LA BOLARIA RIO DE JANEIRO BARRA DA TIJUCA'), null, '"barra" sozinho não é bar');
  igual(f('FISHBAR PRAIA DO CANTO LTDA'), null, '"fishbar" não é bar por fronteira de palavra');
});

teste('o rótulo declara que a categoria foi inferida', () => {
  // Inferir e avisar é honesto; inferir e apresentar como dado da base não seria.
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  igual(c.prospeccaoRotuloCategoria(null, 'AURA ROMANA PIZZARIA'), 'Pizzaria (pelo nome)', 'com aviso');
  igual(c.prospeccaoRotuloCategoria('coffee shop', 'QUALQUER COISA'), 'Cafeteria', 'categoria da base manda e não leva aviso');
  igual(c.prospeccaoRotuloCategoria(null, 'ALIMENTOS LTDA'), 'Categoria não informada', 'sem inferência possível');
  igual(c.prospeccaoRotuloCategoria(null), 'Categoria não informada', 'chamada antiga com 1 argumento segue funcionando');
});

teste('a fila põe recém-aberta na frente, e cada faixa usa o sinal que tem', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const agora = HOJE.getTime();
  const mesesAtras = m => new Date(agora - m * 30.44 * 86400000).toISOString();

  const nova2m = { nome: 'Aberta 2 meses', data_abertura: mesesAtras(2) };
  const nova5m = { nome: 'Aberta 5 meses', data_abertura: mesesAtras(5) };
  const gigante = { nome: 'Café gigante', avaliacoes: 7790 };
  const media = { nome: 'Café médio', avaliacoes: 300 };
  const velha = { nome: 'Aberta 3 anos', data_abertura: mesesAtras(36) };
  const nada = { nome: 'Zzz sem sinal' };

  const ordenada = [gigante, velha, nada, nova5m, media, nova2m]
    .sort((a, b) => c.prospeccaoCompararOrdem(a, b, agora))
    .map(x => x.nome);

  igual(ordenada, [
    'Aberta 2 meses', 'Aberta 5 meses',   // faixa 1: recém-abertas, mais nova antes
    'Café gigante', 'Café médio',         // faixa 2: com avaliação, mais avaliada antes
    'Aberta 3 anos', 'Zzz sem sinal'      // faixa 3: resto, com data antes de sem data
  ], 'três faixas, cada uma com sua régua');
});

teste('aberta há 7 anos NÃO passa na frente de quem tem avaliação', () => {
  // Era o risco de ordenar por data_abertura puro: a base tem abertura de 2018.
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const agora = HOJE.getTime();
  const antiga = { nome: 'Aberta 2018', data_abertura: new Date(agora - 84 * 30.44 * 86400000).toISOString() };
  const comAvaliacao = { nome: 'Com avaliação', avaliacoes: 500 };
  igual([antiga, comAvaliacao].sort((a, b) => c.prospeccaoCompararOrdem(a, b, agora)).map(x => x.nome),
    ['Com avaliação', 'Aberta 2018'], 'avaliação vence abertura antiga');
});

teste('o corte de recém-aberta é 6 meses', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const agora = HOJE.getTime();
  const dentro = { nome: 'dentro', data_abertura: new Date(agora - 5.5 * 30.44 * 86400000).toISOString() };
  const fora = { nome: 'fora', data_abertura: new Date(agora - 7 * 30.44 * 86400000).toISOString() };
  igual(c.prospeccaoFaixaDeOrdem(dentro, agora), 1, '5,5 meses é faixa 1');
  igual(c.prospeccaoFaixaDeOrdem(fora, agora), 3, '7 meses cai pra faixa 3');
});

teste('data inválida não quebra a ordenação', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const agora = HOJE.getTime();
  igual(c.prospeccaoFaixaDeOrdem({ nome: 'x', data_abertura: 'nao-e-data' }, agora), 3, 'cai na faixa 3');
  igual(c.prospeccaoFaixaDeOrdem(null, agora), 3, 'nulo também');
});

console.log('\n== Promessa derivada (prometido × realizado sem digitação) ==');

teste('o tipo da promessa sai da etapa do negócio', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  igual(c.tipoDaPromessa({ stageId: '1395880469' }), 'visitas', 'Prospecção = visita');
  igual(c.tipoDaPromessa({ stageId: '1396005401' }), 'visitas', 'Visita = visita');
  igual(c.tipoDaPromessa({ stageId: '1395880470' }), 'avancos', 'Decisor = avanço');
  igual(c.tipoDaPromessa({ stageId: '1395880471' }), 'propostas', 'Demo/Proposta = proposta');
  igual(c.tipoDaPromessa({ stageId: '1395880472' }), 'fechamentos', 'Negociação = fechamento');
  igual(c.tipoDaPromessa({ stageId: '1395880473' }), 'fechamentos', 'Ag. Pagamento = fechamento');
});

teste('sem etapa conhecida não inventa uma visita', () => {
  // A promessa é auditável: negócio fora do mapa precisa ser classificado antes de
  // entrar no compromisso, em vez de inflar visitas por aproximação.
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  igual(c.tipoDaPromessa({ stageId: '1396006164' }), null, 'etapa fora do mapa');
  igual(c.tipoDaPromessa({}), null, 'sem stageId');
  igual(c.tipoDaPromessa(null), null, 'lead nulo');
});

teste('a soma ignora tipo inválido em vez de transformá-lo em visita', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const itens = [
    { tipo: 'visitas' }, { tipo: 'visitas' }, { tipo: 'avancos' },
    { tipo: 'propostas' }, { tipo: 'fechamentos' }, { tipo: 'coisa_invalida' }
  ];
  const som = c.somaDaPromessa(itens);
  igual(som, { visitas: 2, avancos: 1, propostas: 1, fechamentos: 1 }, 'tipo inválido não entra na promessa');
  igual(som.visitas + som.avancos + som.propostas + som.fechamentos, itens.length - 1, 'só itens classificados entram');
});

teste('a promessa trava exatamente às 9h30 no relógio de Brasília', () => {
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  igual(c.promessaTravadaNoHorario(new Date(Date.UTC(2026, 7, 31, 9, 29))), false, '9h29 ainda permite confirmar');
  igual(c.promessaTravadaNoHorario(new Date(Date.UTC(2026, 7, 31, 9, 30))), true, '9h30 trava');
  igual(c.promessaTravadaNoHorario(new Date(Date.UTC(2026, 7, 31, 18, 0))), true, 'não reabre durante o dia');
});

// NOTA (28/08/26) — a integração "a sequência do dia carrega o tipo de cada item" NÃO
// é testada aqui de propósito. `sequenciaSugeridaDoDia` vive fora dos marcadores
// @nucleo e depende dos helpers de agenda (agendaChave, agendaAgora, agendaHhmm,
// AGENDA_TIPOS, buscarLeadFunilPorId). Trazê-la para dentro arrastaria todos eles, e
// stub de regra de negócio no harness foi exatamente o que deixou passar o bug do
// "próximo passo às 9h01" — o remédio seria pior que a doença.
// O que decide o resultado (tipoDaPromessa e somaDaPromessa) está coberto acima; a
// costura foi verificada no preview local com a carteira real de Kelly e Marco, onde
// dá pra ver o badge de cada item e a soma batendo com o que está marcado.

console.log('\n== Destravar o funil (o degrau que não está sendo subido) ==');

// Fixture do caso real do Bruno em 28/08: 14 em Visita, ZERO em Conversa com Decisor,
// e só 1 acima do SLA. Qualquer régua baseada em SLA diz que ele é o mais saudável do
// time; ele é o mais travado. É por isso que "saída travada" pesa mais que SLA.
function funilDoBruno() {
  const visita = [];
  for (let i = 0; i < 14; i++) {
    visita.push(lead({ id: 'BV' + i, name: 'Visita ' + i, stageId: '1396005401', dias: 3, slaBreach: i === 0 }));
  }
  const negociacao = [lead({ id: 'BN1', name: 'Negócio quente', stageId: '1395880472', dias: 4 })];
  return {
    funilLeads: { '1396005401': visita, '1395880472': negociacao },
    reps: [{ ownerId: OWNER, name: 'Bruno Teste', open: 15, travados: [visita[0]], criticos: [], quentes: [],
      stages: { '1396005401': 14, '1395880470': 0, '1395880472': 1 } }]
  };
}

teste('acha o degrau travado: Visita cheia com Decisor vazio', () => {
  const c = novoContexto(dados(funilDoBruno()), { ownerId: OWNER, role: 'rep' });
  const d = c.destravarFunil(OWNER);
  igual(d.etapaTravada, '1396005401', 'a etapa travada é Visita');
  igual(d.motivo, 'saida_travada', 'e o motivo é saída travada, não estoque');
  igual(d.proximaLabel, 'Conversa com Decisor', 'nomeia o degrau seguinte');
  igual(d.candidatos.length, 14, 'os 14 são candidatos a subir');
});

teste('o movimento sai do que FALTA, e qualificação vem antes de tudo', () => {
  const semNada = lead({ id: 'D1', name: 'Cego', stageId: '1396005401', dias: 5 });
  const qualificado = lead({ id: 'D2', name: 'Qualificado', stageId: '1396005401', dias: 5,
    nome_do_sistema: 'Consumer', gargalo_operacional: 'Fila' });
  const pronto = lead({ id: 'D3', name: 'Pronto', stageId: '1396005401', dias: 5,
    nome_do_sistema: 'Saipos', gargalo_operacional: 'Estoque',
    tarefas: [{ subject: 'Follow-up', timestamp: iso(HOJE) + 'T12:00:00Z' }] });
  const c = novoContexto(dados({
    funilLeads: { '1396005401': [semNada, qualificado, pronto] },
    reps: [{ ownerId: OWNER, name: 'T', open: 3, travados: [], criticos: [], quentes: [], stages: { '1396005401': 3, '1395880470': 0 } }]
  }), { ownerId: OWNER, role: 'rep' });
  const d = c.destravarFunil(OWNER);
  igual(d.candidatos.map(x => x.nome), ['Cego', 'Qualificado', 'Pronto'], 'ordem: falta qualificação, falta passo, pronto');
  verdade(/sistema e dor/.test(d.candidatos[0].movimento), 'o cego é mandado qualificar primeiro');
  verdade(/decisor/i.test(d.candidatos[1].movimento), 'o qualificado é mandado pedir o decisor');
  verdade(/executar/i.test(d.candidatos[2].movimento), 'o pronto é mandado executar e mover');
  igual([d.faltandoQualificacao, d.faltandoPasso, d.prontosParaSubir], [1, 1, 1], 'agregados coerentes');
});

teste('o gesto é o da etapa travada, não um texto genérico', () => {
  // Sandro real: 10 de 10 em Prospecção. O gesto ali é primeiro contato, não decisor.
  const presp = [];
  for (let i = 0; i < 5; i++) presp.push(lead({ id: 'P' + i, name: 'Prosp ' + i, stageId: '1395880469', dias: 7,
    nome_do_sistema: 'x', gargalo_operacional: 'Fila' }));
  const c = novoContexto(dados({
    funilLeads: { '1395880469': presp },
    reps: [{ ownerId: OWNER, name: 'T', open: 5, travados: [], criticos: [], quentes: [], stages: { '1395880469': 5, '1396005401': 0 } }]
  }), { ownerId: OWNER, role: 'rep' });
  const d = c.destravarFunil(OWNER);
  igual(d.etapaTravadaLabel, 'Prospecção', 'travou na Prospecção');
  verdade(/primeiro contato/i.test(d.candidatos[0].movimento), 'gesto de Prospecção, não de Visita');
});

teste('o retrato por etapa traz razão mediana/SLA comparável', () => {
  // Kelly real no Decisor: mediana 19d contra SLA 4 = 4,8x.
  const dec = [1, 19, 25].map((dd, i) => lead({ id: 'K' + i, name: 'Dec ' + i, stageId: '1395880470', dias: dd, slaBreach: dd > 4 }));
  const c = novoContexto(dados({
    funilLeads: { '1395880470': dec },
    reps: [{ ownerId: OWNER, name: 'T', open: 3, travados: [], criticos: [], quentes: [], stages: { '1395880470': 3 } }]
  }), { ownerId: OWNER, role: 'rep' });
  const d = c.destravarFunil(OWNER);
  const e = d.porEtapa.find(x => x.sid === '1395880470');
  igual(e.mediana, 19, 'mediana de dias na etapa');
  igual(e.sla, 4, 'SLA da etapa');
  igual(e.razao, 4.8, 'razão 19/4 = 4,8x');
  igual(e.acimaDoSla, 2, 'dois acima do SLA');
});

teste('funil SAUDÁVEL não recebe gargalo falso', () => {
  // Caso real do Marco em 28/08: Prospecção com 6 negócios, mediana 2d contra SLA 5,
  // ZERO acima do SLA. gargaloDoRep pontuava por volume e ela ganhava sempre, então a
  // tela dizia "o degrau que não está sendo subido: Prospecção" — falso. E ⚠ falso
  // treina a pessoa a ignorar o ⚠ verdadeiro.
  const presp = [];
  for (let i = 0; i < 6; i++) presp.push(lead({ id: 'S' + i, stageId: '1395880469', dias: 2, slaBreach: false }));
  const visita = [lead({ id: 'SV', stageId: '1396005401', dias: 2, slaBreach: false })];
  const c = novoContexto(dados({
    funilLeads: { '1395880469': presp, '1396005401': visita },
    reps: [{ ownerId: OWNER, name: 'Marco Teste', open: 7, travados: [], criticos: [], quentes: [],
      stages: { '1395880469': 6, '1396005401': 1 } }]
  }), { ownerId: OWNER, role: 'rep' });
  const d = c.destravarFunil(OWNER);
  verdade(d.saudavel, 'reconhece o funil como saudável');
  igual(d.porEtapa.filter(e => e.ehGargalo).length, 0, 'nenhuma etapa marcada com gargalo');
});

teste('uma condição que falha já derruba o "saudável"', () => {
  // Mesmo funil, mas UM negócio acima do SLA na etapa apontada. Volta a ser gargalo.
  const presp = [];
  for (let i = 0; i < 6; i++) presp.push(lead({ id: 'T' + i, stageId: '1395880469', dias: 2, slaBreach: i === 0 }));
  const c = novoContexto(dados({
    funilLeads: { '1395880469': presp, '1396005401': [lead({ id: 'TV', stageId: '1396005401', dias: 2 })] },
    reps: [{ ownerId: OWNER, name: 'T', open: 7, travados: [presp[0]], criticos: [], quentes: [],
      stages: { '1395880469': 6, '1396005401': 1 } }]
  }), { ownerId: OWNER, role: 'rep' });
  const d = c.destravarFunil(OWNER);
  falso(d.saudavel, 'com negócio acima do SLA não é saudável');
  verdade(d.porEtapa.some(e => e.ehGargalo), 'volta a marcar o gargalo');
});

teste('saída travada manda mais que qualquer sinal de saúde', () => {
  // Bruno: 14 em Visita, ZERO no Decisor, e só 1 acima do SLA (mediana 3d / SLA 5 = 0,6x).
  // Pelas outras duas condições ele "passaria" como saudável. Não pode.
  const c = novoContexto(dados(funilDoBruno()), { ownerId: OWNER, role: 'rep' });
  const d = c.destravarFunil(OWNER);
  igual(d.motivo, 'saida_travada', 'motivo é saída travada');
  falso(d.saudavel, 'e saída travada nunca é saudável');
});

teste('funil vazio não inventa gargalo', () => {
  const c = novoContexto(dados({
    reps: [{ ownerId: OWNER, name: 'T', open: 0, travados: [], criticos: [], quentes: [], stages: {} }]
  }), { ownerId: OWNER, role: 'rep' });
  const d = c.destravarFunil(OWNER);
  igual(d.etapaTravada, null, 'sem etapa travada');
  igual(d.candidatos, [], 'sem candidatos');
  igual(d.porEtapa, [], 'sem retrato');
});

console.log('\n== Ciclo fechado da semana (constância por qualidade, não só volume) ==');

// Uma visita comprovada precisa de evento fechado. O fixture monta o evento do jeito
// que tpEventosDoDono devolve: tipo que conta como visita, desfecho COMPLETED e dealId.
// Mesma forma dos eventos usados nos testes de ponto de contato: tipo 'rota' (é o que
// AGENDA_TIPOS conta como visita), ownerId obrigatório — sem ele tpEventosDoDono não
// devolve nada, e o teste passaria a medir vazio em silêncio.
function eventoVisita(dealId, cliente, dataISO) {
  return {
    id: 'ev_' + dealId, ownerId: OWNER, dealId: String(dealId), tipo: 'rota', cliente,
    inicio: new Date(dataISO + 'T14:00:00Z'),
    desfecho: 'COMPLETED', registro: true, obs: '', decisor: null
  };
}

teste('visita qualificada e com próximo passo = ciclo fechado', () => {
  const l = lead({ id: 'C1', name: 'Pizzaria Fechada', nome_do_sistema: 'Consumer',
    gargalo_operacional: 'Fila', tarefas: [{ subject: 'Follow-up', timestamp: iso(HOJE) + 'T12:00:00Z' }] });
  const c = novoContexto(dados({
    funilLeads: { '1396005401': [l] },
    agenda: { eventos: [eventoVisita('C1', 'Pizzaria Fechada', iso(HOJE))] }
  }), { ownerId: OWNER, role: 'rep' });
  const r = c.cicloFechadoDaSemana(OWNER, iso(HOJE));
  igual(r.avaliados, 1, 'uma visita avaliada');
  igual(r.fechados, ['Pizzaria Fechada'], 'ciclo fechado');
  igual(r.pct, 100, '100%');
});

teste('o vazamento é nomeado: sem qualificação, sem passo, ou os dois', () => {
  // É esta a parte que ensina o ofício — dizer QUAL gesto faltou, não só o total.
  const soQual = lead({ id: 'C2', name: 'Só qualificada', nome_do_sistema: 'Saipos', gargalo_operacional: 'Estoque' });
  const soPasso = lead({ id: 'C3', name: 'Só com passo',
    tarefas: [{ subject: 'Follow-up', timestamp: iso(HOJE) + 'T12:00:00Z' }] });
  const nenhum = lead({ id: 'C4', name: 'Nem um nem outro' });
  const c = novoContexto(dados({
    funilLeads: { '1396005401': [soQual, soPasso, nenhum] },
    agenda: { eventos: [
      eventoVisita('C2', 'Só qualificada', iso(HOJE)),
      eventoVisita('C3', 'Só com passo', iso(HOJE)),
      eventoVisita('C4', 'Nem um nem outro', iso(HOJE))
    ] }
  }), { ownerId: OWNER, role: 'rep' });
  const r = c.cicloFechadoDaSemana(OWNER, iso(HOJE));
  igual(r.avaliados, 3, 'três avaliadas');
  igual(r.fechados, [], 'nenhum ciclo fechado');
  igual(r.faltaPasso, ['Só qualificada'], 'qualificada mas sem passo');
  igual(r.faltaQualificacao, ['Só com passo'], 'com passo mas sem qualificação');
  igual(r.faltaAmbos, ['Nem um nem outro'], 'faltando os dois');
  igual(r.pct, 0, '0%');
});

teste('mesmo cliente visitado duas vezes na semana é UM ciclo', () => {
  const l = lead({ id: 'C5', name: 'Duas visitas', nome_do_sistema: 'Linx', gargalo_operacional: 'Fila',
    tarefas: [{ subject: 'Follow-up', timestamp: iso(HOJE) + 'T12:00:00Z' }] });
  const ontem = iso(new Date(HOJE.getTime() - DIA));
  const c = novoContexto(dados({
    funilLeads: { '1396005401': [l] },
    agenda: { eventos: [eventoVisita('C5', 'Duas visitas', iso(HOJE)), eventoVisita('C5', 'Duas visitas', ontem)] }
  }), { ownerId: OWNER, role: 'rep' });
  const r = c.cicloFechadoDaSemana(OWNER, iso(HOJE));
  igual(r.avaliados, 1, 'contado uma vez');
});

teste('visita sem negócio associado não entra no numerador nem no denominador', () => {
  // Não dá pra avaliar o ciclo de uma visita que não aponta pra negócio nenhum —
  // e inventar um veredito aqui seria pior que declarar a lacuna.
  const c = novoContexto(dados({
    funilLeads: {},
    agenda: { eventos: [Object.assign(eventoVisita('X', 'Sem negócio', iso(HOJE)), { dealId: null })] }
  }), { ownerId: OWNER, role: 'rep' });
  const r = c.cicloFechadoDaSemana(OWNER, iso(HOJE));
  igual(r.avaliados, 0, 'fora da conta');
  igual(r.semDeal, 1, 'mas declarado em semDeal');
  igual(r.pct, null, 'sem base de cálculo, pct é null e não 0');
});

teste('conta cada gesto separado, não só o combo (régua da excelência)', () => {
  // A régua precisa dizer QUAL hábito falta: anotar o sistema e datar o retorno são
  // treinos diferentes, e um número agregado esconde qual dos dois é o problema.
  const soSistema = lead({ id: 'G1', name: 'Só sistema', nome_do_sistema: 'Consumer' });
  const soDor = lead({ id: 'G2', name: 'Só dor', gargalo_operacional: 'Fila' });
  const soPasso = lead({ id: 'G3', name: 'Só passo',
    tarefas: [{ subject: 'Follow-up', timestamp: iso(HOJE) + 'T12:00:00Z' }] });
  const c = novoContexto(dados({
    funilLeads: { '1396005401': [soSistema, soDor, soPasso] },
    agenda: { eventos: [
      eventoVisita('G1', 'Só sistema', iso(HOJE)),
      eventoVisita('G2', 'Só dor', iso(HOJE)),
      eventoVisita('G3', 'Só passo', iso(HOJE))
    ] }
  }), { ownerId: OWNER, role: 'rep' });
  const r = c.cicloFechadoDaSemana(OWNER, iso(HOJE));
  igual(r.avaliados, 3, 'três visitas avaliadas');
  igual(r.comSistema, 1, 'uma com sistema anotado');
  igual(r.comDor, 1, 'uma com dor registrada');
  igual(r.comPasso, 1, 'uma com próximo passo datado');
  igual(r.fechados, [], 'e nenhuma fechou o ciclo — os três gestos são independentes');
});

teste('sem visita na semana, o número não finge zero', () => {
  const c = novoContexto(dados({ funilLeads: { '1396005401': [lead({ id: 'C6' })] } }), { ownerId: OWNER, role: 'rep' });
  const r = c.cicloFechadoDaSemana(OWNER, iso(HOJE));
  igual(r.avaliados, 0, 'nada avaliado');
  igual(r.pct, null, 'pct null — 0% diria que ele falhou, e ele não tentou');
});

console.log('\n== Próximo passo de HOJE conta o dia inteiro (bug de produção, 28/08) ==');

// O relógio dos testes é fixo às 12:00 UTC (ver RELÓGIO FIXO no topo), que é
// exatamente a hora em que o Cockpit grava as tarefas. Uma tarefa de hoje às 12:00Z
// portanto está "no limite"; as de 09:00Z e 11:00Z já passaram da hora. Era isso que
// sumia da tela no meio do dia útil.
const HOJE_ISO = iso(HOJE);
const tarefaHoje = (h) => [{ subject: 'Follow-up - cobrar', timestamp: `${HOJE_ISO}T${h}:00:00Z` }];

teste('tarefa de hoje cuja HORA já passou continua sendo próximo passo', () => {
  const l = lead({ id: 'PP1', name: 'Don Aguilar', tarefas: tarefaHoje('09') });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  const alvo = c.meusNegociosAbertos(OWNER)[0];
  const passo = c.proximoPassoDoLead(alvo);
  verdade(!!passo, 'proximoPasso existe (era null: o bug)');
  igual(c.isoDate(passo.quando), HOJE_ISO, 'e é a tarefa de hoje');
  verdade(c.estadoDoNegocio(alvo).temProximoPasso, 'temProximoPasso é true');
});

teste('esse negócio NÃO é mais "visitada e sem próximo passo"', () => {
  // O sintoma que apareceu na carteira do Marco: quatro tarefas de hoje às 12:00Z e
  // os quatro negócios listados como se ele não tivesse marcado nada.
  const l = lead({ id: 'PP2', ultimaInteracao: diasAtras(2).toISOString(), tarefas: tarefaHoje('09') });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  const alvo = c.meusNegociosAbertos(OWNER)[0];
  falso(c.estadoDoNegocio(alvo).followUpDescoberto, 'não está descoberto');
  const f = c.filaDeFollowUp(OWNER);
  igual(f.baldes.visita_sem_passo.length, 0, 'fora do balde de visita sem passo');
});

teste('"Follow-ups para hoje" recebe a tarefa de hoje (o balde vivia vazio)', () => {
  const l = lead({ id: 'PP3', ultimaInteracao: diasAtras(2).toISOString(), tarefas: tarefaHoje('09') });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  const f = c.filaDeFollowUp(OWNER);
  igual(f.baldes.hoje.length, 1, 'o balde de prioridade 1 enche');
  igual(f.baldes.hoje[0].prazo, HOJE_ISO, 'com prazo de hoje');
});

teste('cadência não vira "atrasada" no meio do dia por causa da hora', () => {
  const l = lead({ id: 'PP4', ultimaInteracao: diasAtras(6).toISOString(), tarefas: tarefaHoje('09') });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  const st = c.estadoDoNegocio(c.meusNegociosAbertos(OWNER)[0]);
  igual(st.cadencia.status, 'planejada', 'passo de hoje mantém a cadência planejada');
});

teste('tarefa de dia ANTERIOR continua fora do próximo passo', () => {
  // A correção é por dia, não "aceita qualquer coisa": passo vencido é outro problema
  // e não pode ser confundido com passo cumprido.
  const l = lead({ id: 'PP5', tarefas: [{ subject: 'Follow-up', timestamp: `${iso(new Date(HOJE.getTime() - 3 * DIA))}T12:00:00Z` }] });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [l] } }), { ownerId: OWNER, role: 'rep' });
  const alvo = c.meusNegociosAbertos(OWNER)[0];
  igual(c.proximoPassoDoLead(alvo), null, 'tarefa de 3 dias atrás não conta');
  falso(c.estadoDoNegocio(alvo).temProximoPasso, 'e o negócio segue sem próximo passo');
});

console.log('\n== Qualificação faltante (revisão do cockpit do executivo, 28/08) ==');

teste('em Visita sem sistema e sem dor, falta os dois e o negócio é cego', () => {
  const c = novoContexto(dados({ funilLeads: { '1396005401': [lead({ id: 'q1' })] } }), { ownerId: OWNER, role: 'rep' });
  const l = c.meusNegociosAbertos(OWNER)[0];
  igual(c.qualificacaoFaltante(l), ['nome_do_sistema', 'gargalo_operacional'], 'os dois campos');
  verdade(c.negocioCego(l), 'cego');
});

teste('em Prospecção o Cockpit NÃO pede qualificação', () => {
  // Não é detalhe: 26 negócios estão em Prospecção. Ninguém esteve no salão deles,
  // então pedir a dor ali seria pedir invenção — e invenção contamina o CRM inteiro.
  const c = novoContexto(dados({ funilLeads: { '1395880469': [lead({ id: 'q2', stageId: '1395880469', stage: 'Prospecção' })] } }), { ownerId: OWNER, role: 'rep' });
  const l = c.meusNegociosAbertos(OWNER)[0];
  igual(c.qualificacaoFaltante(l), [], 'nada é pedido antes da visita');
  falso(c.negocioCego(l), 'não é cego, é só não visitado');
});

teste('pede só o que falta: em Decisor com a dor preenchida, cobra apenas o sistema', () => {
  const c = novoContexto(dados({
    funilLeads: { '1395880470': [lead({ id: 'q3', gargalo_operacional: 'Fila' })] }
  }), { ownerId: OWNER, role: 'rep' });
  const l = c.meusNegociosAbertos(OWNER)[0];
  igual(c.qualificacaoFaltante(l), ['nome_do_sistema'], 'só o sistema');
  falso(c.negocioCego(l), 'meio qualificado não é cego');
});

teste('negócio qualificado não é cobrado de novo', () => {
  const c = novoContexto(dados({
    funilLeads: { '1396005401': [lead({ id: 'q4', nome_do_sistema: 'Consumer', gargalo_operacional: 'Estoque' })] }
  }), { ownerId: OWNER, role: 'rep' });
  igual(c.qualificacaoFaltante(c.meusNegociosAbertos(OWNER)[0]), [], 'nada falta');
});

teste('lead SEM stageId ainda é cobrado (a etapa vem da chave de funilLeads)', () => {
  // Regressão do defeito achado na revisão visual de 28/08: 32 dos negócios da Kelly
  // vêm de funilLeads sem o campo stageId — a etapa é só a CHAVE. Nesses,
  // qualificacaoFaltante devolvia [] e a tela não pedia NADA, em silêncio. Silêncio
  // é o pior resultado possível aqui, porque é indistinguível de "já qualificado".
  const cru = { id: 'q6', name: 'Sem etapa no objeto', ownerId: OWNER, dias: 11, tarefas: [], notas: [], ultimaInteracao: diasAtras(3).toISOString() };
  const c = novoContexto(dados({ funilLeads: { '1396005401': [cru] } }), { ownerId: OWNER, role: 'rep' });
  falso(!!cru.stageId, 'o fixture realmente não tem stageId');
  igual(c.etapaDoLead(cru), '1396005401', 'a etapa é resolvida pela chave');
  igual(c.qualificacaoFaltante(cru), ['nome_do_sistema', 'gargalo_operacional'], 'cobra mesmo assim');
});

teste('gravar espelha no DATA local e a cobrança para na mesma sessão', () => {
  // Mesmo contrato do ciclo de desfecho: escrever no HubSpot sem espelhar no DATA
  // deixava a tela pedindo de novo o que já havia sido gravado, até o próximo sync.
  const c = novoContexto(dados({ funilLeads: { '1396005401': [lead({ id: 'q5' })] } }), { ownerId: OWNER, role: 'rep' });
  verdade(c.negocioCego(c.meusNegociosAbertos(OWNER)[0]), 'cego antes');
  c.aplicarQualificacaoNoDataLocal('q5', { nome_do_sistema: 'Saipos', gargalo_operacional: 'Falta de Gestão' });
  c.tpInvalidarCache();
  const depois = c.meusNegociosAbertos(OWNER)[0];
  igual(c.qualificacaoFaltante(depois), [], 'não cobra mais');
  igual(depois.nome_do_sistema, 'Saipos', 'o valor gravado está no DATA');
});

teste('nomes da promessa: o travessao separa, o hifen do nome sobrevive', () => {
  // A linha do gestor na matinal mostra os nomes que o executivo prometeu. O separador
  // gravado por wireCompromissoDoDia e TRAVESSAO cercado de espacos; nome de
  // restaurante usa hifen a vontade. Os dois primeiros casos sao texto REAL gravado
  // em planos_diarios em 28/08 (Wericles e Kelly, plano fechado as 08:36 e 08:40).
  const c = novoContexto(dados(), { ownerId: OWNER, role: 'manager' });
  const f = c.nomesDaPromessaDoPlano;

  igual(f(['Confraria Da Carne - Steaks — Visitas sem proximo passo · Mandar prova de valor']),
    ['Confraria Da Carne - Steaks'], 'hifen dentro do nome nao corta');
  igual(f(['O Artesao - Pizzas frescas — Visitas sem proximo passo · Ligar pedindo o decisor']),
    ['O Artesao - Pizzas frescas'], 'segundo caso real, mesmo formato');
  igual(f(['Vino! — Confirmar participantes e quem decide']), ['Vino!'], 'pontuacao no fim do nome');

  // O motivo contem ' · '; dividir por ele cortaria em lugar pior. Fica explicito.
  igual(f(['Bar · Grill — Quentes sem tarefa · Confirmar cobranca']), ['Bar · Grill'],
    'ponto-medio no nome nao e separador');

  // Travessao no proprio nome: o PRIMEIRO separa, o resto e motivo.
  igual(f(['Casa — Velha — motivo aqui']), ['Casa'], 'divide no primeiro travessao');

  // Sem motivo nenhum (plano antigo, texto livre) o nome inteiro passa.
  igual(f(['Padaria Central']), ['Padaria Central'], 'item sem separador passa inteiro');

  // Entradas que ja apareceram no banco: vazio, espaco, nulo. Nenhuma vira nome.
  // Item que COMECA no separador nao tem nome: devolver vazio e o certo, porque
  // mostrar o motivo no lugar do nome do cliente seria pior que nao mostrar nada.
  igual(f(['', '   ', null, undefined, ' — so motivo']), [],
    'vazio, nulo e item sem nome somem da linha');
  igual(f([]), [], 'lista vazia');
  igual(f(null), [], 'nulo devolve lista vazia, nao explode');
  igual(f('nao e lista'), [], 'string no lugar de lista devolve vazio');
});

teste('quentes no radar: a guarda de SLA e o "sem proximo passo" sao uma fonte so', () => {
  // Nasceu de um defeito meu: a faixa da Daily do gestor mostrava 12 sob o rotulo
  // "quentes sem proxima acao" enquanto a aba Time dizia "11 no radar · 9 sem proximo
  // passo". Duas contagens do mesmo dado, e um rotulo que nao descrevia o proprio
  // numero. Agora as duas telas chamam quentesNoRadar().
  const base = dados({
    stageMeta: { labels: { '1395880473': 'Negociacao' }, slaDays: { '1395880473': 5 } },
    temperatura: { quentes: [
      // dentro do prazo (2 de 5 dias) e SEM proximo passo -> conta nos dois
      { id: 'h1', name: 'Sem passo no prazo', ownerId: OWNER, stageId: '1395880473', dias: 2, tarefas: [], notas: [] },
      // dentro do prazo e COM tarefa futura -> entra no radar, fica fora do semPasso
      { id: 'h2', name: 'Com passo no prazo', ownerId: OWNER, stageId: '1395880473', dias: 2,
        // O campo da tarefa e `timestamp` (nao `data`) — contrato de proximoPassoDoLead.
        tarefas: [{ subject: 'Ligar', timestamp: diasAtras(-3).toISOString() }], notas: [] },
      // SLA ESTOURADO (7 de 5 dias): sai do radar, e por isso sai das duas contagens.
      // E exatamente este caso que produzia 12 aqui e 11 la.
      { id: 'h3', name: 'Quente com SLA estourado', ownerId: OWNER, stageId: '1395880473', dias: 7, tarefas: [], notas: [] },
      // de outro dono: o gestor ve, o executivo nao
      { id: 'h4', name: 'De outro executivo', ownerId: '999', stageId: '1395880473', dias: 1, tarefas: [], notas: [] }
    ] }
  });
  const g = novoContexto(base, { ownerId: null, role: 'manager' });
  const rg = g.quentesNoRadar(null);
  igual(rg.radar.map(l => l.id), ['h1', 'h2', 'h4'], 'o de SLA estourado sai do radar');
  igual(rg.semPasso.map(l => l.id), ['h1', 'h4'], 'semPasso e subconjunto do radar');
  verdade(rg.semPasso.length < rg.radar.length, 'semPasso nunca e maior que o radar');

  // Filtrado por dono: e o que a aba Time faz quando quem olha e executivo.
  const r = novoContexto(base, { ownerId: OWNER, role: 'rep' });
  igual(r.quentesNoRadar(OWNER).radar.map(l => l.id), ['h1', 'h2'], 'executivo nao ve o do colega');
  igual(r.quentesNoRadar(OWNER).semPasso.map(l => l.id), ['h1'], 'e o semPasso dele tambem filtra');

  // Etapa sem SLA cadastrado NAO derruba o lead do radar: sem regra, nao ha estouro.
  const semSla = novoContexto(dados({
    stageMeta: { labels: { 'xx': 'Etapa sem SLA' }, slaDays: {} },
    temperatura: { quentes: [{ id: 'h5', name: 'Etapa sem SLA', ownerId: OWNER, stageId: 'xx', dias: 99, tarefas: [], notas: [] }] }
  }), { ownerId: null, role: 'manager' });
  igual(semSla.quentesNoRadar(null).radar.map(l => l.id), ['h5'], 'sem SLA cadastrado o lead fica no radar');

  // Sem temperatura nenhuma: listas vazias, nao explode.
  const vazio = novoContexto(dados({ temperatura: {} }), { ownerId: null, role: 'manager' });
  igual(vazio.quentesNoRadar(null).radar, [], 'temperatura vazia devolve radar vazio');
  igual(vazio.quentesNoRadar(null).semPasso, [], 'e semPasso vazio');
});

teste('visoes da prospeccao: recem-aberta e pronta-pra-ligar sao mundos disjuntos', () => {
  // Medido na base de 970 contas em 28/08: recem-aberta E com telefone = ZERO. Nao e
  // acidente de preenchimento, e a forma das fontes — Casa dos Dados vem do CNPJ e traz
  // data de abertura sem telefone; Google/Outscraper traz telefone sem data de abertura.
  // Este teste fixa esse fato, porque e ele que justifica cada pilula dizer o que lhe
  // falta. Se um dia as fontes se cruzarem, o teste falha e a copy tem que mudar junto.
  const c = novoContexto(dados(), { ownerId: null, role: 'manager' });
  const agora = HOJE.getTime();

  const casaDosDados = { nome: 'Aberta ha 2 meses', fonte: 'Casa dos Dados',
    data_abertura: diasAtras(60).toISOString(), cnpj: '12345678000199', telefone: null, avaliacoes: null };
  const outscraper = { nome: 'Com telefone', fonte: 'outscraper',
    data_abertura: null, cnpj: null, telefone: '(21) 98765-4321', avaliacoes: 340 };

  verdade(c.prospeccaoEhRecemAberta(casaDosDados, agora), 'conta do CNPJ com 2 meses e recem-aberta');
  falso(c.prospeccaoProntaParaLigar(casaDosDados), 'e a MESMA conta nao da pra ligar: sem telefone');
  verdade(c.prospeccaoProntaParaLigar(outscraper), 'conta do outscraper da pra ligar');
  falso(c.prospeccaoEhRecemAberta(outscraper, agora), 'e a MESMA conta nao e recem-aberta: sem data');

  // A janela e de 6 meses. 5 meses entra, 8 nao.
  verdade(c.prospeccaoEhRecemAberta({ data_abertura: diasAtras(150).toISOString() }, agora), '5 meses entra');
  falso(c.prospeccaoEhRecemAberta({ data_abertura: diasAtras(250).toISOString() }, agora), '8 meses nao entra');
  falso(c.prospeccaoEhRecemAberta({ data_abertura: null }, agora), 'sem data nao entra');
  falso(c.prospeccaoEhRecemAberta({ data_abertura: 'nao e data' }, agora), 'data invalida nao entra');

  // Telefone: 10 digitos e o minimo de fixo com DDD. Formatacao nao conta.
  verdade(c.prospeccaoProntaParaLigar({ telefone: '2133334444' }), 'fixo com DDD, 10 digitos');
  verdade(c.prospeccaoProntaParaLigar({ telefone: '+55 (21) 98765-4321' }), 'formatado com pais, conta');
  falso(c.prospeccaoProntaParaLigar({ telefone: '33334444' }), 'sem DDD, 8 digitos, nao conta');
  falso(c.prospeccaoProntaParaLigar({ telefone: '' }), 'vazio nao conta');
  falso(c.prospeccaoProntaParaLigar({ telefone: null }), 'nulo nao conta');
  falso(c.prospeccaoProntaParaLigar({}), 'sem o campo nao conta');
  falso(c.prospeccaoProntaParaLigar(null), 'lead nulo nao explode');

  // Dado cruzado: o '+' no campo fonte e como a importacao marca a mesclagem.
  verdade(c.prospeccaoDadoCruzado({ fonte: 'outscraper + Google Places' }), 'duas fontes mescladas');
  falso(c.prospeccaoDadoCruzado({ fonte: 'outscraper' }), 'fonte unica nao e cruzada');
  falso(c.prospeccaoDadoCruzado({ fonte: 'Casa dos Dados' }), 'Casa dos Dados sozinha nao e cruzada');
  falso(c.prospeccaoDadoCruzado({ fonte: null }), 'fonte nula nao explode');
  falso(c.prospeccaoDadoCruzado(null), 'lead nulo nao explode');
});

teste('a janela de recem-aberta na TELA tem que ser maior que o piso da IMPORTACAO', () => {
  /* Este teste amarra dois arquivos, e existe por causa de um defeito real:

     · scripts/backfill-casa-dos-dados.js tem DIAS_MINIMO_ABERTURA = 90 — a importacao
       NUNCA traz uma empresa aberta nos ultimos 90 dias. E regra pedida pelo Julyan em
       16/08 ("nao posso sujar o funil do gestor"), margem contra CNPJ que ainda pode
       fechar ou estar com cadastro incompleto.
     · o deck do executivo contava "abertas ha <= 60 dias" e mostrava esse numero num
       card do topo.

     60 < 90, entao aquele card era ZERO por construcao — todo dia, para os sete
     executivos. Confirmado no banco: a conta mais nova de toda a base abriu 91 dias
     atras. Uma regra do produto tornava a outra impossivel, e nada apontava isso.

     A checagem le o piso do proprio script de importacao em vez de repetir o numero
     aqui: se alguem mudar o piso para 200 dias, este teste falha e obriga a revisar a
     janela da tela junto. E o inverso tambem: baixar a janela da tela para menos que o
     piso volta a produzir um indicador morto. */
  const fonteBackfill = fs.readFileSync(path.join(root, 'scripts', 'backfill-casa-dos-dados.js'), 'utf8');
  const m = fonteBackfill.match(/DIAS_MINIMO_ABERTURA\s*=\s*(\d+)/);
  verdade(!!m, 'o piso de abertura ainda esta declarado no script de importacao');
  const pisoDias = Number(m[1]);

  const c = novoContexto(dados(), { ownerId: null, role: 'manager' });
  // A janela vem do TEMPLATE, do mesmo jeito que o piso vem do script de importacao:
  // os dois numeros lidos de onde moram, nenhum repetido aqui. `const` do nucleo nao
  // vira propriedade do global no vm (so `function` vira), entao ler a fonte e tambem
  // a unica forma de alcancar a constante.
  const mMeses = html.match(/PROSPECCAO_RECENTE_MESES\s*=\s*(\d+)/);
  verdade(!!mMeses, 'a janela de recem-aberta ainda esta declarada no template');
  const janelaDias = Number(mMeses[1]) * 30.44;
  verdade(janelaDias > pisoDias,
    `a janela da tela (${Math.round(janelaDias)}d) tem que ser maior que o piso da importacao (${pisoDias}d)`);

  // E o caso concreto: uma conta aberta exatamente no piso PRECISA entrar na visao,
  // senao o executivo nunca ve a conta mais nova que o sistema consegue importar.
  const noPiso = { data_abertura: diasAtras(pisoDias).toISOString() };
  verdade(c.prospeccaoEhRecemAberta(noPiso, HOJE.getTime()),
    'a conta mais nova que a importacao permite aparece como recem-aberta');
});

teste('Daily do gestor usa plano real, nao a promessa manual aposentada', () => {
  const ini = html.indexOf('async function renderDaily()');
  const fim = html.indexOf('async function renderConsolidadoDiario()', ini);
  verdade(ini >= 0 && fim > ini, 'o render da Daily continua localizavel');
  const daily = html.slice(ini, fim);

  verdade(daily.includes('const compromissoDoPlano = (plano, ownerId) =>'),
    'existe uma derivacao unica para plano e clientes nomeados');
  verdade(daily.includes("const nomesLista = nomesPlano.length ? nomesPlano : nomesAgenda"),
    'agenda confirmada cobre o vazio quando ainda nao existe plano fechado');
  verdade(daily.includes('clientes nomeados hoje'),
    'o hero declara a unidade real do compromisso');
  verdade(daily.includes('executivos sem cliente definido'),
    'o vazio vira uma cobranca objetiva');
  falso(daily.includes('const promessasHoje = repsDaily.map'),
    'o hero nao volta a contar os campos prometido_* aposentados');
  verdade(daily.includes('const resumoPlanoHoje = compromissoDoPlano(planoHoje, r.ownerId)'),
    'a ordem da reuniao usa a mesma fonte do hero');
});

teste('Agenda separa historico vazio de buraco ainda acionavel', () => {
  const ini = html.indexOf('function agendaDiagnosticoExec(o)');
  const fim = html.indexOf('function agendaVerNoMapaDaRota', ini);
  verdade(ini >= 0 && fim > ini, 'o diagnostico da Agenda continua localizavel');
  const agenda = html.slice(ini, fim);

  verdade(agenda.includes('const diasAcionaveis = o.dias.filter'),
    'a janela de acao e calculada explicitamente');
  verdade(html.includes('diasAcionaveis.length') && html.includes('dias úteis restantes'),
    'numerador e denominador usam a mesma janela');
  verdade(html.includes('<b>Busca ao vivo de novas empresas</b><span>abertas nos últimos 90 dias</span>'),
    'a busca de 90 dias nao se disfarca de carteira de 6 meses');
});

teste('as tres acoes de agora nao dao duas vagas ao mesmo cliente', () => {
  /* Defeito visto EM PRODUCAO, na tela do Marco Filho em 28/08:
       1. Registrar desfecho Bonamassa
       2. Ligar para Don Aguilar
       3. Ligar para Bonamassa
     Dois tercos das vagas no mesmo cliente, com 12 negocios esperando na fila.

     A causa era dupla: a fila era cortada em 3 ANTES de qualquer verificacao (entao
     tirar um duplicado deixaria a vaga vazia) e nao havia deduplicacao por cliente.
     Este teste reproduz o arranjo exato: o mesmo cliente com visita de hoje sem
     desfecho E no topo da fila de follow-up. */
  const hojeCedo = new Date(HOJE.getTime() - 3 * 3600000);   // ja passou, sem desfecho
  const bonamassa = lead({ id: 'LB', name: 'Bonamassa', dias: 9, ultimaInteracao: diasAtras(9).toISOString() });
  const aguilar   = lead({ id: 'LA', name: 'Don Aguilar', dias: 8, ultimaInteracao: diasAtras(8).toISOString() });
  const terceiro  = lead({ id: 'LT', name: 'Casa do Sul', dias: 7, ultimaInteracao: diasAtras(7).toISOString() });
  const quarto    = lead({ id: 'LQ', name: 'Bar do Meio', dias: 6, ultimaInteracao: diasAtras(6).toISOString() });

  const c = novoContexto(dados({
    funilLeads: { '1396005401': [bonamassa, aguilar, terceiro, quarto] },
    agenda: { eventos: [{ id: 'ev1', ownerId: OWNER, dealId: 'LB', tipo: 'rota',
      inicio: hojeCedo, cliente: 'Bonamassa', desfecho: null, registro: false, obs: '', decisor: null }] }
  }), { ownerId: OWNER, role: 'rep' });

  const rep = c.DATA.reps[0];
  const acoes = c.acoesDeAgora(rep);

  igual(acoes.length, 3, 'continua entregando tres acoes');
  const nomes = acoes.map(a => a.cliente);
  igual(new Set(nomes).size, 3, 'tres clientes DIFERENTES: ' + nomes.join(' / '));
  verdade(nomes.includes('Bonamassa'), 'o cliente da visita de hoje continua na lista');
  igual(nomes.filter(x => x === 'Bonamassa').length, 1, 'mas uma vez so');
  // A vaga liberada tem que ser PREENCHIDA pelo proximo da fila, nao ficar vazia:
  // era a outra metade do defeito (slice(0,3) antes de filtrar).
  verdade(nomes.includes('Don Aguilar') && nomes.includes('Casa do Sul'),
    'a vaga liberada foi preenchida pelo proximo da fila: ' + nomes.join(' / '));

  // A acao do cliente com visita de hoje vem PRIMEIRO: registrar o desfecho e o que
  // produz a informacao de qual proximo passo cabe.
  igual(acoes[0].cliente, 'Bonamassa', 'a visita de hoje sem desfecho vem na frente');
  verdade(/desfecho/i.test(acoes[0].verbo + ' ' + acoes[0].motivo), 'e a acao dela e registrar o desfecho');

  // Nome com acento/caixa diferente entre as fontes tambem tem que casar.
  const c2 = novoContexto(dados({
    funilLeads: { '1396005401': [lead({ id: 'LX', name: 'CAFÉ  Do Centro', dias: 9, ultimaInteracao: diasAtras(9).toISOString() }), aguilar] },
    agenda: { eventos: [{ id: 'ev2', ownerId: OWNER, dealId: 'LX', tipo: 'rota',
      inicio: hojeCedo, cliente: 'cafe do centro', desfecho: null, registro: false, obs: '', decisor: null }] }
  }), { ownerId: OWNER, role: 'rep' });
  const nomes2 = c2.acoesDeAgora(c2.DATA.reps[0]).map(a => a.cliente);
  igual(nomes2.filter(x => /caf/i.test(x)).length, 1,
    'acento e caixa diferentes contam como o MESMO cliente: ' + nomes2.join(' / '));
});

teste('telefone da acao: E.164 quando existe, null quando nao da pra ligar', () => {
  /* A tela do Marco em producao dizia "Ligar para Don Aguilar" e o unico botao era
     "Abrir e datar". O telefone existia em 19 dos 20 negocios dele. Esta funcao e o que
     leva o numero ate o botao — e o que garante que o botao NAO aparece sem numero,
     porque prometer ligacao sem telefone e pior que nao oferecer. */
  const comCel = lead({ id: 'T1', name: 'Don Aguilar', celular: '+55 21 2264-8484' });
  const semCel = lead({ id: 'T2', name: 'Sem Numero', celular: null });
  const c = novoContexto(dados({ funilLeads: { '1396005401': [comCel, semCel] } }), { ownerId: OWNER, role: 'rep' });
  const f = c.telefoneDaAcao;

  igual(f(comCel), '5521226484 84'.replace(/ /g, ''), 'formatado vira E.164 com 55');
  igual(f({ celular: '2122648484' }), '5521226484 84'.replace(/ /g, ''), '10 digitos ganham o 55');
  igual(f({ celular: '21998765432' }), '5521998765432', '11 digitos ganham o 55');
  igual(f({ celular: '5521998765432' }), '5521998765432', 'ja com 55 nao duplica');
  igual(f({ telefone: '+55 27 3335-1000' }), '5527333510 00'.replace(/ /g, ''), 'conta de prospeccao usa telefone');

  igual(f(semCel), null, 'sem celular devolve null');
  igual(f({ celular: '33334444' }), null, 'sem DDD (8 digitos) devolve null');
  igual(f(null, null), null, 'lead nulo nao explode');
  igual(f({}, null), null, 'objeto vazio devolve null');

  // O caso do DESFECHO: nasce de um evento da agenda, sem o negocio em mao. Acha pelo
  // NOME no funil, com a mesma normalizacao que o resto da tela usa.
  igual(f(null, 'don aguilar'), '5521226484 84'.replace(/ /g, ''), 'acha por nome, caixa diferente');
  igual(f(null, 'DON  AGUILAR'), '5521226484 84'.replace(/ /g, ''), 'espaco duplo e caixa alta tambem');
  igual(f(null, 'Sem Numero'), null, 'acha o lead mas ele nao tem numero: null');
  igual(f(null, 'Nao Existe'), null, 'nome que nao esta no funil: null');
});

console.log('');
teste('sem pendencia, as acoes nomeiam contas livres — e nunca disputam com a carteira', () => {
  /* Pedido do Julyan: "conseguimos indicar contas se o funil está vazio?". Antes, sem
     pendencia, o card mostrava um parabens e parava — beco sem saida justamente na hora
     em que ele deveria abrir conta nova.

     As contas chegam como PARAMETRO porque os filtros de escopo (prospeccaoAtiva,
     prospeccaoFazSentido, rede grande) vivem fora do bloco @nucleo. Quem filtra e o
     chamador, que e producao; aqui se testa a regra nova inteira, sem dublar nenhuma
     regra de negocio. */
  const contas = [
    { id: 'k1', nome: 'Cantina Nova',   responsavel_owner_id: OWNER, data_abertura: diasAtras(12).toISOString(), nota: 4.7, avaliacoes: 88, bairro: 'Taquara', telefone: '21 98888-1111' },
    { id: 'k2', nome: 'Pizzaria Recem', responsavel_owner_id: OWNER, data_abertura: diasAtras(40).toISOString(), bairro: 'Recreio' },
    { id: 'k3', nome: 'Bar do Fim',     responsavel_owner_id: OWNER, cidade: 'Rio de Janeiro' },
    { id: 'k4', nome: 'Quarta Conta',   responsavel_owner_id: OWNER, bairro: 'Barra' },
    { id: 'k5', nome: 'De Outro Dono',  responsavel_owner_id: 'outro-owner', bairro: 'Centro' },
    { id: 'k6', nome: 'Ja No Funil',    responsavel_owner_id: OWNER, hubspot_deal_id: '999', bairro: 'Centro' }
  ];

  // 1. carteira VAZIA: a tela nomeia contas em vez de parar num parabens.
  const vazio = novoContexto(dados({ funilLeads: {} }), { ownerId: OWNER, role: 'rep' });
  const semContas = vazio.acoesDeAgora(vazio.DATA.reps[0]);
  igual(semContas.length, 0, 'sem lista de contas, nao inventa acao nenhuma');

  const comContas = vazio.acoesDeAgora(vazio.DATA.reps[0], undefined, contas);
  igual(comContas.length, 3, 'tres contas sugeridas, o mesmo teto das outras acoes');
  igual(comContas.map(a => a.cliente), ['Cantina Nova', 'Pizzaria Recem', 'Bar do Fim'],
    'na ORDEM que chegou (a fila do Planejamento ja vem ordenada), sem quarta vaga');
  verdade(comContas.every(a => /Abrir negócio com/.test(a.verbo)), 'o verbo diz o que fazer');
  verdade(/melhores contas livres/.test(comContas[0].motivo), 'o motivo explica por que ela esta ali');
  verdade(/abriu há 12d/.test(comContas[0].motivo) && /4.7★ \(88\)/.test(comContas[0].motivo)
    && /Taquara/.test(comContas[0].motivo), 'e carrega as pistas reais da base: ' + comContas[0].motivo);
  verdade(!/undefined|null|NaN/.test(comContas.map(a => a.motivo + a.ultimaInteracao).join(' ')),
    'nenhum campo ausente vaza como texto');

  // 2. dono errado e conta que JA virou negocio ficam fora.
  const nomes = comContas.map(a => a.cliente);
  verdade(!nomes.includes('De Outro Dono'), 'conta de outro executivo nao entra');
  verdade(!nomes.includes('Ja No Funil'), 'conta que ja tem negocio no HubSpot nao entra');

  // 3. TELEFONE: quem tem numero na base ganha os canais; quem nao tem, nao promete.
  igual(comContas[0].tel, '5521988881111', 'telefone da conta vira E.164 pros botoes');
  igual(comContas[1].tel, null, 'sem telefone na base, nada de botao de ligar');

  // 4. A REGRA QUE MAIS IMPORTA: havendo pendencia, a sugestao NAO rouba a vaga.
  const comCarteira = novoContexto(dados({
    funilLeads: { '1396005401': [
      lead({ id: 'P1', name: 'Don Aguilar',  dias: 9, ultimaInteracao: diasAtras(9).toISOString() }),
      lead({ id: 'P2', name: 'Casa do Sul',  dias: 8, ultimaInteracao: diasAtras(8).toISOString() })
    ] }
  }), { ownerId: OWNER, role: 'rep' });
  const mistas = comCarteira.acoesDeAgora(comCarteira.DATA.reps[0], undefined, contas);
  verdade(mistas.length > 0, 'a carteira produz acao');
  verdade(mistas.every(a => !/^contaalvo:/.test(a.id)),
    'com negocio dele esperando, NENHUMA conta-alvo aparece: ' + mistas.map(a => a.cliente).join(' / '));
});

teste('distancia em km rejeita coordenada nula ANTES de converter', () => {
  /* A correcao de 11/08 que veio junto com a funcao pro nucleo: Number(null) e 0 e
     Number('') e 0, e 0 passa em Number.isFinite. Validar so o resultado aceitava nulo
     como se fosse a coordenada 0,0 e devolvia distancia "valida" de milhares de km. */
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  igual(Math.round(c.distanciaKm(-20.2884, -40.2978, -20.2884, -40.2978)), 0, 'mesmo ponto: 0 km');
  const perto = c.distanciaKm(-20.2884, -40.2978, -20.2950, -40.3010);
  verdade(perto > 0.5 && perto < 1.2, 'dois pontos vizinhos em Vitoria: ~0,8 km, veio ' + perto.toFixed(2));
  igual(c.distanciaKm(null, -40.29, -20.28, -40.29), Infinity, 'lat nula -> Infinity, nao 2000 km');
  igual(c.distanciaKm('', -40.29, -20.28, -40.29), Infinity, 'lat vazia -> Infinity');
  igual(c.distanciaKm(undefined, -40.29, -20.28, -40.29), Infinity, 'lat ausente -> Infinity');
  igual(c.distanciaKm('abc', -40.29, -20.28, -40.29), Infinity, 'lat nao numerica -> Infinity');
});

teste('eixo da semana: so dia futuro, so com coordenada, e ordenado por quem cabe no caminho', () => {
  /* A ideia veio do desenho do Claude Design ("terca voce ja esta em Jardim Camburi").
     Foi implementada por COORDENADA e nao por bairro porque o dado manda: bairro existe
     em 7 dos 121 negocios (6%), coordenada em 89 (74%), e as 970 contas-alvo tem
     coordenada em 100%. */
  const c = novoContexto(dados({}), { ownerId: OWNER, role: 'rep' });
  const HOJE_I = iso(HOJE);
  const AMANHA = iso(diasAFrente(1));
  const ONTEM = iso(diasAtras(1));

  const base = { lat: -20.2884, lng: -40.2978 };
  const ancoras = [
    { dataISO: AMANHA, cliente: 'Cervejaria Fratelli', lat: base.lat, lng: base.lng },
    { dataISO: ONTEM, cliente: 'Visita que ja passou', lat: base.lat, lng: base.lng },
    { dataISO: AMANHA, cliente: 'Sem coordenada', lat: null, lng: null }
  ];
  const contas = [
    { id: 'p1', nome: 'Vizinha 300m', lat: base.lat + 0.0027, lng: base.lng },
    { id: 'p2', nome: 'Vizinha 1,5km', lat: base.lat + 0.0135, lng: base.lng },
    { id: 'p3', nome: 'Longe 6km', lat: base.lat + 0.054, lng: base.lng },
    { id: 'p4', nome: 'Sem coordenada', lat: null, lng: null }
  ];

  const eixos = c.eixosDaSemana(HOJE_I, ancoras, contas);
  igual(eixos.length, 1, 'um eixo: so o dia futuro produz');
  igual(eixos[0].dataISO, AMANHA, 'e e o de amanha');
  igual(eixos[0].compromissos, 1, 'a ancora sem coordenada nao conta como compromisso do eixo');
  igual(eixos[0].contas.map(x => x.nome), ['Vizinha 300m', 'Vizinha 1,5km'],
    'so as que estao dentro do raio, mais perto primeiro');
  verdade(!eixos[0].contas.some(x => x.nome === 'Longe 6km'), '6 km nao e "no caminho"');
  verdade(!eixos[0].contas.some(x => x.nome === 'Sem coordenada'), 'sem coordenada nao entra');
  verdade(eixos[0].kms[0] < eixos[0].kms[1], 'os kms acompanham a ordem');
  verdade(eixos[0].kms.every(k => k <= 2), 'nenhum km declarado acima do raio: ' + eixos[0].kms.join(', '));
  igual(eixos[0].ancora.cliente, 'Cervejaria Fratelli', 'a ancora nomeada tem coordenada');

  igual(c.eixosDaSemana(HOJE_I, [], contas).length, 0, 'sem compromisso, sem eixo');
  igual(c.eixosDaSemana(HOJE_I, ancoras, []).length, 0, 'sem conta-alvo, sem eixo');
  igual(c.eixosDaSemana(HOJE_I, ancoras, [contas[2]]).length, 0, 'so conta longe: nao inventa eixo');
  igual(c.eixosDaSemana(HOJE_I, null, contas).length, 0, 'entrada invalida devolve lista vazia');

  const hojeEixo = c.eixosDaSemana(HOJE_I,
    [{ dataISO: HOJE_I, cliente: 'Hoje mesmo', lat: base.lat, lng: base.lng }], contas);
  igual(hojeEixo.length, 1, 'o proprio dia de hoje ainda e acionavel');
});

if (falhou > 0) { console.error(`${falhou} falha(s), ${ok} ok.`); process.exit(1); }
console.log(`${ok} testes ok.`);
