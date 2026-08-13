// scripts/montar-dados.js
// FONTE ÚNICA da montagem do objeto DATA do cockpit (Etapa 1b — dados atrás do login).
//
// Antes, o build.js montava o DATA e embutia TUDO dentro do public/index.html — qualquer
// visitante via o CRM inteiro no código-fonte da página, sem logar. Agora a montagem vive
// aqui e é usada por DOIS consumidores:
//   1. scripts/build.js  — gera o HTML público SÓ com o shell (login + placeholders vazios).
//   2. api/dados.js      — serverless da Vercel: valida a sessão e devolve o DATA de verdade,
//                          já filtrado pelo papel de quem pediu (gestor = tudo; executivo =
//                          o próprio funil completo + resumo agregado dos colegas).
//
// Todos os arquivos de dados entram via require() com caminho estático — é o que garante
// que a Vercel empacote os JSONs junto com a função serverless (mesmo padrão que o
// api/atualizar-mrr.js já usa pro usuarios.json).

const hubspot = require('../data/hubspot.json');
const narrativas = require('../data/narrativas.json');
const usuariosRaw = require('../data/usuarios.json');

// Arquivos opcionais — podem não existir num repo recém-clonado ou antes da 1ª execução
// dos workflows. try/catch com require estático mantém o empacotamento da Vercel funcionando.
function requireOpcional(fn) {
  try { return fn(); } catch (e) { return null; }
}
const leadsReferencia = requireOpcional(() => require('../data/leads-referencia.json')) || { pracas: [] };
const clientesAtivos = requireOpcional(() => require('../data/clientes-ativos.json')) || [];
const supabaseConfig = requireOpcional(() => require('../data/supabase-config.json'));
const maptilerConfig = requireOpcional(() => require('../data/maptiler-config.json'));
const resumoSemanal = requireOpcional(() => require('../data/resumo-semanal.json'));
const weeklyRaw = requireOpcional(() => require('../data/weekly-raw.json'));
// AUTOMAÇÃO 3 (13/08/26) — status da última rodada do robô da Daily: falhas de
// sincronização de realizado_visitas/avancos/propostas, se houver. Opcional porque só
// passa a existir depois da PRIMEIRA execução do fetch-hubspot.js com esta automação.
const syncStatus = requireOpcional(() => require('../data/sync-status.json'));
// Grandes redes que a Takeat não atende — usado pela Prospecção para tirar da fila
// recomendada (vai pra "Revisar escopo", não some). Dado editável em data/.
const redesExcluidas = requireOpcional(() => require('../data/redes-excluidas.json'));
const hubspotPrevious = requireOpcional(() => require('../data/hubspot-previous.json'));

const USUARIOS = Array.isArray(usuariosRaw) ? usuariosRaw : (usuariosRaw.usuarios || []);

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// ============ MONTAGEM DO DATA COMPLETO (idêntica à antiga lógica do build.js) ============

function montarDadosCompletos() {
  // Ordem de exibição = ordem em que aparecem no narrativas.json
  const ownerIds = Object.keys(narrativas.reps);

  const reps = ownerIds.map(ownerId => {
    const n = narrativas.reps[ownerId];
    const h = hubspot.reps[ownerId] || { open: 0, stages: {}, criticos: [], travados: [], leadsTravados: 0, ganhosSemana: 0, ganhosSemanaNomes: [], fechadosNoMes: 0, metaMensal: 10, visitasHubspotHoje: 0, avancosHubspotHoje: 0, propostasHubspotHoje: 0, fechamentosHubspotHoje: 0 };

    return {
      ownerId,
      name: n.name,
      praca: n.praca,
      tag: n.tag,
      tagLabel: n.tagLabel,
      gargalo: n.gargalo,
      boasPraticas: n.boasPraticas,
      compromissos: n.compromissos,
      open: h.open,
      stages: h.stages,
      criticos: h.criticos,
      travados: h.travados || [],
      quentes: h.quentes || [],
      leadsTravados: h.leadsTravados || 0,
      ganhosSemana: h.ganhosSemana || 0,
      ganhosSemanaNomes: h.ganhosSemanaNomes || [],
      fechadosNoMes: h.fechadosNoMes || 0,
      metaMensal: h.metaMensal || 10,
      visitasHubspotHoje: h.visitasHubspotHoje || 0,
      // BLOCO 15: nomes de quem avancou de etapa e de quem recebeu proposta hoje, pra
      // Daily & Ritmo. Vem do fetch-hubspot; enquanto o cron nao roda, chega vazio e a
      // tela mostra so a contagem, avisando que os nomes vem na proxima rodada.
      avancosHojeNomes: Array.isArray(h.avancosHojeNomes) ? h.avancosHojeNomes : [],
      propostasHojeNomes: Array.isArray(h.propostasHojeNomes) ? h.propostasHojeNomes : [],
      avancosHubspotHoje: h.avancosHubspotHoje || 0,
      propostasHubspotHoje: h.propostasHubspotHoje || 0,
      fechamentosHubspotHoje: h.fechamentosHubspotHoje || 0
    };
  });

  // ---- Semáforo de saúde geral do funil ----
  const totalAberto = hubspot.kpis.emAberto || 0;
  const totalTravados = hubspot.kpis.leadsTravados || 0;
  const pctTravados = totalAberto > 0 ? (totalTravados / totalAberto) * 100 : 0;
  let saude;
  if (pctTravados < 15) {
    saude = { nivel: 'ok', label: 'Funil saudável', detalhe: `${Math.round(pctTravados)}% dos leads abertos com SLA estourado` };
  } else if (pctTravados < 35) {
    saude = { nivel: 'warn', label: 'Atenção', detalhe: `${Math.round(pctTravados)}% dos leads abertos com SLA estourado` };
  } else {
    saude = { nivel: 'crit', label: 'Funil travado', detalhe: `${Math.round(pctTravados)}% dos leads abertos com SLA estourado` };
  }

  // ---- Deltas vs. última atualização ----
  function delta(atual, anterior) {
    if (anterior === undefined || anterior === null) return null;
    const diff = atual - anterior;
    if (diff === 0) return { sinal: 'flat', valor: 0 };
    return { sinal: diff > 0 ? 'up' : 'down', valor: Math.abs(diff) };
  }
  const kpiDeltas = hubspotPrevious ? {
    leadsCriados: delta(hubspot.kpis.leadsCriados, hubspotPrevious.kpis.leadsCriados),
    ganhos: delta(hubspot.kpis.ganhos, hubspotPrevious.kpis.ganhos),
    perdidos: delta(hubspot.kpis.perdidos, hubspotPrevious.kpis.perdidos),
    emAberto: delta(hubspot.kpis.emAberto, hubspotPrevious.kpis.emAberto),
    emReciclagem: delta(hubspot.kpis.emReciclagem, hubspotPrevious.kpis.emReciclagem),
    fechadosNoMes: delta(hubspot.kpis.fechadosNoMes, hubspotPrevious.kpis.fechadosNoMes),
    taxaAvanco: delta(hubspot.kpis.taxaAvanco, hubspotPrevious.kpis.taxaAvanco)
  } : null;

  // ---- Ranking de vendas da semana ----
  const ganhosDetalheFresco = (weeklyRaw && weeklyRaw.ganhosSemanaDetalhe) || (resumoSemanal && resumoSemanal.ganhosSemanaDetalhe) || [];
  let rankingSemanal = [];
  if (ganhosDetalheFresco.length > 0) {
    const porOwner = {};
    ganhosDetalheFresco.forEach(d => {
      if (!d.ownerId) return;
      if (!porOwner[d.ownerId]) porOwner[d.ownerId] = { count: 0, mrrTotal: 0, clientes: [] };
      porOwner[d.ownerId].count += 1;
      porOwner[d.ownerId].mrrTotal += d.mrr || 0;
      porOwner[d.ownerId].clientes.push({ nome: d.nome, mrr: d.mrr || 0 });
    });
    rankingSemanal = Object.entries(porOwner)
      .map(([ownerId, v]) => ({
        ownerId,
        name: (narrativas.reps[ownerId] || {}).name || ownerId,
        count: v.count,
        mrrTotal: v.mrrTotal,
        clientes: v.clientes
      }))
      .sort((a, b) => (b.count - a.count) || (b.mrrTotal - a.mrrTotal))
      .slice(0, 3);
  }

  // ---- Vendas do mês (clientes + MRR por executivo) ----
  let vendasMes = null;
  if (Array.isArray(hubspot.vendasMes)) {
    const porOwnerMes = {};
    hubspot.vendasMes.forEach(d => {
      if (!d.ownerId || !narrativas.reps[d.ownerId]) return; // dono fora do time ativo
      if (!porOwnerMes[d.ownerId]) porOwnerMes[d.ownerId] = { count: 0, mrrTotal: 0, clientes: [] };
      porOwnerMes[d.ownerId].count += 1;
      porOwnerMes[d.ownerId].mrrTotal += d.mrr || 0;
      porOwnerMes[d.ownerId].clientes.push({ id: d.id || null, nome: d.nome, mrr: d.mrr || 0, closedate: d.closedate || null });
    });
    const porRepMes = Object.entries(porOwnerMes).map(([ownerId, v]) => ({
      ownerId,
      name: narrativas.reps[ownerId].name,
      praca: narrativas.reps[ownerId].praca || '—',
      count: v.count,
      mrrTotal: v.mrrTotal,
      clientes: v.clientes.sort((a, b) => (b.mrr || 0) - (a.mrr || 0))
    })).sort((a, b) => (b.count - a.count) || (b.mrrTotal - a.mrrTotal));

    const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const agoraBr = new Date(Date.now() - 3 * 60 * 60 * 1000);
    vendasMes = {
      mesLabel: `${MESES_PT[agoraBr.getUTCMonth()]}/${agoraBr.getUTCFullYear()}`,
      totalClientes: porRepMes.reduce((s, r) => s + r.count, 0),
      totalMrr: porRepMes.reduce((s, r) => s + r.mrrTotal, 0),
      porRep: porRepMes
    };
  }

  // ---- Quentes/frios com a praça anexada ----
  function comPraca(lista) {
    return (lista || []).map(l => ({ ...l, praca: (narrativas.reps[l.ownerId] || {}).praca || '—' }));
  }
  const temperaturaComPraca = {
    quentes: comPraca((hubspot.temperatura || {}).quentes),
    frios: comPraca((hubspot.temperatura || {}).frios)
  };

  return {
    hubspotUpdatedAtFmt: fmtDate(hubspot.updatedAt),
    // ITEM 4 (10/08/26): o timestamp CRU vai junto do formatado. A tela precisa dele
    // pra calcular a idade do dado e avisar em vermelho quando o robô das 5h falhou —
    // apresentar número velho na Daily sem saber que é velho era o risco real.
    hubspotUpdatedAtISO: hubspot.updatedAt || null,
    versaoAnalise: narrativas._atualizado_em || 'v1',
    kpisHub: hubspot.kpis,
    kpiDetalhe: {
      leadsCriados: (hubspot.kpiDetalhe?.leadsCriados || []).map(d => ({ ...d, vendedor: (narrativas.reps[d.ownerId] || {}).name || '—' })),
      perdidos: (hubspot.kpiDetalhe?.perdidos || []).map(d => ({ ...d, vendedor: (narrativas.reps[d.ownerId] || {}).name || '—' }))
    },
    kpiDeltas,
    funil: hubspot.funil,
    funilLeads: hubspot.funilLeads || {},
    vendasMes,
    temperatura: temperaturaComPraca,
    stageMeta: hubspot.stageMeta || { slaDays: {}, descriptions: {}, labels: {} },
    saude,
    reps,
    leadsReferencia: leadsReferencia.pracas || [],
    // Clientes Takeat já ativos, fechados pelo próprio Field Sales — usados na Rota &
    // Agenda pra sugerir parada de relacionamento/upsell perto de onde o executivo vai
    // atuar (pedido do Julyan, 10/08). Só os com coordenada aparecem no mapa; os demais
    // seguem na lista mesmo assim (sem pin), pra não esconder informação. Filtra fora
    // quem já "encerrou" (churn confirmado no pipeline de Sucesso) — sugerir visita de
    // relacionamento pra quem cancelou não faz sentido nenhum.
    clientesAtivos: (clientesAtivos || []).filter(c => c.sugerirVisita !== false),
    footerText: `Fonte: HubSpot (pipeline 916011864, atualizado 23:59, 08:59 e 15:00) + Daily (prometido/realizado) · Leads críticos = mais antigos sem avanço de etapa.`,
    // AUTOMAÇÃO 3 (13/08/26) — status da última rodada do robô: se alguma escrita de
    // realizado_visitas/avancos/propostas falhou ou não bateu na conferência pós-escrita.
    // Opcional: undefined até a primeira rodada rodar com esta automação.
    syncStatus: syncStatus || null,
    resumoSemanal: (resumoSemanal || weeklyRaw) ? {
      geradoEmFmt: resumoSemanal ? fmtDate(resumoSemanal.geradoEm) : null,
      numerosAtualizadosEmFmt: weeklyRaw ? fmtDate(weeklyRaw.geradoEm) : (resumoSemanal ? fmtDate(resumoSemanal.geradoEm) : null),
      janela: (weeklyRaw && weeklyRaw.janela) || (resumoSemanal && resumoSemanal.janela),
      kpisComparativo: (weeklyRaw && weeklyRaw.kpisComparativo) || (resumoSemanal && resumoSemanal.kpisComparativo),
      resumoGeral: resumoSemanal ? resumoSemanal.resumoGeral : null,
      comoAgir: resumoSemanal ? resumoSemanal.comoAgir : [],
      porRep: resumoSemanal ? (resumoSemanal.porRep || {}) : {},
      ganhosSemanaDetalhe: ganhosDetalheFresco,
      reunioesSemanaDetalhe: (weeklyRaw && weeklyRaw.reunioesSemanaDetalhe) || (resumoSemanal && resumoSemanal.reunioesSemanaDetalhe) || [],
      quentesDemoOuNegociacao: (weeklyRaw && weeklyRaw.quentesDemoOuNegociacao) || (resumoSemanal && resumoSemanal.quentesDemoOuNegociacao) || [],
      // snapshotReps alimenta o card "Onde atacar esta semana" (visão por praça).
      // Ele só existe no weekly-raw.json — o resumo-semanal.json (texto da IA) não tem.
      // Sem esta linha o card lia undefined e sumia da tela em silêncio, sem erro.
      snapshotReps: (weeklyRaw && weeklyRaw.snapshotReps) || {},
      ranking: rankingSemanal
    } : null,
    agenda: hubspot.agenda || null,
    redesExcluidas: (redesExcluidas && Array.isArray(redesExcluidas.redes)) ? redesExcluidas.redes : [],
    usuarios: USUARIOS
  };
}

// ============ FILTRO POR PAPEL (o que cada login pode receber do servidor) ============
//
// Gestor: DATA completo.
// Executivo: o PRÓPRIO objeto rep completo (tudo que já via no Meu Painel) + dos colegas
// apenas o resumo agregado que o Pódio/ranking precisa — SEM clientes, funil, notas,
// gargalo ou coaching dos outros. Corte aprovado pelo Julyan em 07/08/26.

// Campos de colega visíveis pra qualquer executivo (necessários pro Pódio/seletores):
function resumoDeColega(r) {
  return {
    ownerId: r.ownerId,
    name: r.name,
    praca: r.praca,
    fechadosNoMes: r.fechadosNoMes,
    metaMensal: r.metaMensal,
    ganhosSemana: r.ganhosSemana,
    // Estruturas vazias mas bem-tipadas: o template varre .criticos/.travados/.stages de
    // todos os reps em alguns pontos — vazio renderiza estado vazio, undefined quebraria.
    open: 0, stages: {}, criticos: [], travados: [], quentes: [], leadsTravados: 0,
    ganhosSemanaNomes: [], gargalo: null, boasPraticas: [], compromissos: [],
    tag: null, tagLabel: null,
    visitasHubspotHoje: 0, avancosHubspotHoje: 0, propostasHubspotHoje: 0, fechamentosHubspotHoje: 0
  };
}

function filtrarParaPapel(dados, usuario) {
  if (!usuario || usuario.role === 'manager') return dados;

  const meuId = String(usuario.ownerId);
  const soMeu = lista => (lista || []).filter(x => String(x.ownerId) === meuId);
  const meuNome = usuario.nome;

  const meuRep = dados.reps.find(r => String(r.ownerId) === meuId) || null;
  // Preserva a ORDEM original dos reps (o Pódio e os seletores dependem dela).
  const reps = dados.reps.map(r => (String(r.ownerId) === meuId ? r : resumoDeColega(r)));

  const vendasMes = dados.vendasMes ? {
    ...dados.vendasMes,
    porRep: dados.vendasMes.porRep.map(r =>
      String(r.ownerId) === meuId ? r : { ...r, clientes: [] } // agregado dos colegas sem nomes de cliente
    )
  } : null;

  const rs = dados.resumoSemanal;
  const resumoSemanalFiltrado = rs ? {
    ...rs,
    porRep: meuId in (rs.porRep || {}) ? { [meuId]: rs.porRep[meuId] } : {},
    ganhosSemanaDetalhe: soMeu(rs.ganhosSemanaDetalhe),
    reunioesSemanaDetalhe: soMeu(rs.reunioesSemanaDetalhe),
    quentesDemoOuNegociacao: soMeu(rs.quentesDemoOuNegociacao),
    ranking: (rs.ranking || []).map(r =>
      String(r.ownerId) === meuId ? r : { ...r, clientes: [] }
    ),
    // PRIVACIDADE: snapshotReps traz funil, travados, quentes e meta de TODO o time.
    // O spread acima o deixaria passar inteiro pro executivo — vazamento silencioso,
    // do mesmo tipo que o corte de 07/08 fechou para clientes/funil/notas. O executivo
    // recebe só o próprio; a visão por praça é do gestor.
    snapshotReps: (rs.snapshotReps && rs.snapshotReps[meuId])
      ? { [meuId]: rs.snapshotReps[meuId] } : {}
  } : null;

  const funilLeads = {};
  Object.entries(dados.funilLeads || {}).forEach(([stage, leads]) => {
    funilLeads[stage] = soMeu(leads);
  });

  // BLOCO 4 (11/08/26) — corte por papel na agenda.
  // Nota do Expogo e tarefa criada por automação chegam do HubSpot SEM
  // hubspot_owner_id; quem diz de quem é o compromisso é o dono do NEGÓCIO associado
  // (lead_owner_id). O cliente já sabia disso — agendaNormalizar resolve por
  // lead_owner_id justamente porque "era o que fazia compromisso sumir da agenda de
  // todo mundo". Só que este filtro roda ANTES, no servidor, e cortava o item pelo
  // campo vazio: o executivo nunca recebia o registro, então não tinha o que resolver.
  // O gestor recebia tudo e via o compromisso na agenda da pessoa — os dois olhando a
  // mesma semana e vendo agendas diferentes.
  // Medido na base: 20 itens sem hubspot_owner_id, 17 deles pertencendo a alguém do
  // time (Amanda 8, Sandro 5, Bruno 4). Os outros 3 são de owner fora do time e
  // continuam fora, como devem.
  // O corte de privacidade não afrouxa: o item só passa se o dono do negócio for
  // EXATAMENTE quem está logado. Sem dono em nenhum dos dois campos, não passa.
  const meuCompromisso = it => {
    const dono = String(it.hubspot_owner_id || it.ownerId || '');
    if (dono) return dono === meuId;
    return String(it.lead_owner_id || '') === meuId;
  };
  const agenda = dados.agenda ? {
    ...dados.agenda,
    itens: (dados.agenda.itens || []).filter(meuCompromisso)
  } : null;

  // Leads da praça: só as praças onde o executivo é responsável (por nome) ou cuja praça
  // bate com a dele — nunca a carteira de leads das outras cidades.
  const leadsReferencia = (dados.leadsReferencia || []).filter(p =>
    (Array.isArray(p.responsaveis) && p.responsaveis.includes(meuNome)) || p.nome === (meuRep && meuRep.praca)
  );

  // Clientes ativos: não existe vínculo confiável entre a empresa (que só nasce no
  // pipeline de Sucesso) e o executivo de campo que vendeu originalmente — ver
  // comentário no topo de fetch-clientes-ativos.js. A régua que sobra, e que ainda
  // faz sentido pra rota, é a cidade bater com a praça do executivo (mesmo critério
  // de leadsReferencia acima).
  const normTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const minhaPraca = normTxt(meuRep && meuRep.praca);
  const clientesAtivos = (dados.clientesAtivos || []).filter(c => {
    const cidadeCliente = normTxt(c.cidade);
    return !!cidadeCliente && !!minhaPraca && (minhaPraca.includes(cidadeCliente) || cidadeCliente.includes(minhaPraca));
  });

  return {
    ...dados,
    reps,
    kpiDetalhe: {
      leadsCriados: soMeu(dados.kpiDetalhe.leadsCriados),
      perdidos: soMeu(dados.kpiDetalhe.perdidos)
    },
    temperatura: {
      quentes: soMeu(dados.temperatura.quentes),
      frios: soMeu(dados.temperatura.frios)
    },
    funilLeads,
    vendasMes,
    resumoSemanal: resumoSemanalFiltrado,
    agenda,
    leadsReferencia,
    clientesAtivos,
    // AUTOMAÇÃO 3 — status de sincronização é informação operacional do gestor
    // (falha de robô, verificação de escrita), não faz sentido pro executivo ver.
    syncStatus: null
    // kpisHub, kpiDeltas, saude, funil (contagens agregadas do time), stageMeta,
    // hubspotUpdatedAtFmt, usuarios (nomes/e-mails do próprio time) permanecem — são
    // agregados sem detalhe de cliente, necessários pra meta coletiva e pro Pódio.
  };
}

// Config do Supabase — usada só pelo build (vai no shell público pro login funcionar).
function configSupabase() {
  return supabaseConfig ? { url: supabaseConfig.url, anonKey: supabaseConfig.anonKey } : null;
}

// Chave do MapTiler (mapa de planejamento de rota) — vem de um arquivo no repo,
// igual ao supabase-config.json, e NÃO de env var da Vercel: esse projeto não tem
// build rodando lá (deploy é estático, arquivos manuais), então uma env var no
// painel da Vercel nunca seria lida por nada. É uma chave PÚBLICA por natureza
// (o navegador precisa dela pra buscar os tiles direto) — protegida por
// restrição de domínio no próprio painel do MapTiler, não por sigilo no código.
function configMaptiler() {
  return maptilerConfig ? maptilerConfig.key : null;
}

module.exports = { montarDadosCompletos, filtrarParaPapel, configSupabase, configMaptiler, USUARIOS };
