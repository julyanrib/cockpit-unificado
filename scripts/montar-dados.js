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

// Arquivos opcionais — podem não existir num repo recém-clonado ou antes da 1ª execução
// dos workflows. try/catch com require estático mantém o empacotamento da Vercel funcionando.
function requireOpcional(fn) {
  try { return fn(); } catch (e) { return null; }
}

// ══ DE ONDE VEM O SNAPSHOT DO CRM (02/09/26) ═══════════════════════════════════════
// Os seis arquivos que o ROBO produz (hubspot, narrativas, resumo-semanal, weekly-raw,
// sync-status, hubspot-previous) sairam do repositorio: agora eles vivem numa tabela do
// Supabase (public.cockpit_snapshot) e a rota /api/dados os injeta aqui antes de montar.
// Motivo: cada rodada do robo commitava esses arquivos, e todo commit gera um deploy na
// Vercel — com o teto de 100 deploys/dia, a atualizacao ficava limitada a ~15 por dia.
//
// ELES SAO `let` E NAO `const`, e a troca e do PROCESSO INTEIRO, de proposito. O snapshot
// e o mesmo para todo mundo: nao existe versao do CRM por usuario. O que e por usuario e o
// FILTRO, e ele acontece depois, em filtrarParaPapel(dados, usuario), que recebe a pessoa
// por argumento. Guardar o snapshot no modulo e cache; guardar o usuario seria vazamento.
//
// E O REQUIRE CONTINUA AQUI COMO REDE: se a tabela estiver vazia ou o Supabase fora do ar,
// a rota cai no arquivo. Por isso hubspot e narrativas viraram opcionais — antes eram
// require duro, e no dia em que o arquivo deixar de ser commitado o modulo nem carregaria.
let hubspot = requireOpcional(() => require('../data/hubspot.json'));
let narrativas = requireOpcional(() => require('../data/narrativas.json'));
const usuariosRaw = require('../data/usuarios.json');

/* ══ OS GESTORES QUE TAMBÉM VENDEM (24/09/26) ═══════════════════════════════════
   Julyan vende em evento e pelo field sales, e as vendas dele contam no placar do
   time. Ele não é rep — não tem plano de dia, não entra na rodada, não tem meta
   individual — mas o que ele fecha é venda da casa.
   A lista sai do MESMO usuarios.json que define os reps, pela role: quem é manager e
   tem ownerId. Sem ownerId não dá para saber quais negócios são dele, e é por isso
   que a linha do Julyan ganhou o dele hoje. */
const GESTORES_QUE_VENDEM = (function () {
  const lista = Array.isArray(usuariosRaw) ? usuariosRaw : (usuariosRaw.usuarios || []);
  const out = {};
  lista.forEach(function (u) {
    if (!u || u.role !== 'manager') return;
    if (!u.ownerId || String(u.ownerId).startsWith('pendente_')) return;
    out[String(u.ownerId)] = { name: u.nome || 'gestor', ownerId: String(u.ownerId) };
  });
  return out;
}());

// (requireOpcional foi movida para o topo do arquivo em 02/09/26: ela passou a ser usada
// pelos primeiros requires, e declaracao de function sobe por hoisting mas fica confusa
// de ler — ver o bloco no inicio do arquivo.)
const leadsReferencia = requireOpcional(() => require('../data/leads-referencia.json')) || { pracas: [] };
/* QUEM COBRE O QUÊ (09/09/26) — a declaração única de território.
   ANTES DISTO A MESMA REGRA VIVIA EM DOIS LUGARES: a tela do gestor derivava a praça de
   cada executivo dos BAIRROS DOS LEADS DE EXEMPLO em leads-referencia.json, e a busca
   semanal tinha a própria cópia em regex (as metaBairros do backfill). As duas divergiam
   calada, e o preço foi medido em 09/09: quatro dos onze executivos não apareciam em
   praça nenhuma, e por isso não podiam receber carga de prospecção. */
const territorios = requireOpcional(() => require('../data/territorios.json')) || { territorios: [] };
const supabaseConfig = requireOpcional(() => require('../data/supabase-config.json'));
const maptilerConfig = requireOpcional(() => require('../data/maptiler-config.json'));
let resumoSemanal = requireOpcional(() => require('../data/resumo-semanal.json'));
let weeklyRaw = requireOpcional(() => require('../data/weekly-raw.json'));
// AUTOMAÇÃO 3 (13/08/26) — status da última rodada do robô da Daily: falhas de
// sincronização de realizado_visitas/avancos/propostas, se houver. Opcional porque só
// passa a existir depois da PRIMEIRA execução do fetch-hubspot.js com esta automação.
let syncStatus = requireOpcional(() => require('../data/sync-status.json'));
// Grandes redes que a Takeat não atende — usado pela Prospecção para tirar da fila
// recomendada (vai pra "Revisar escopo", não some). Dado editável em data/.
const redesExcluidas = requireOpcional(() => require('../data/redes-excluidas.json'));
let hubspotPrevious = requireOpcional(() => require('../data/hubspot-previous.json'));
// Régua de cadência (data/cadencias.json). É CONFIGURAÇÃO, não código: o template lê
// DATA.cadencias e nunca hardcoda os passos, então ajustar a régua (dias, canais, quais
// cadências existem, motivos válidos de saída) é editar esse JSON e rodar o build.
// Opcional pelo mesmo motivo dos outros: repo recém-clonado pode não ter o arquivo — aí
// o template cai no fallback mínimo e mostra "régua não configurada" em vez de inventar.
const cadencias = requireOpcional(() => require('../data/cadencias.json'));
/* Tabela do variável (data/comissionamento.json). CONFIGURAÇÃO pelo mesmo motivo das
   outras: o valor de cada faixa é decisão do Julyan, não regra de código, e a tela
   NUNCA escreve um número de dinheiro que não tenha saído daqui. Opcional como as
   demais — sem o arquivo, a tela não mostra a caixa da comissão em vez de inventar
   quanto alguém vai receber, que é o pior número errado possível. */
const comissionamento = requireOpcional(() => require('../data/comissionamento.json'));
/* Régua da temperatura (data/temperatura.json). CONFIGURAÇÃO, como cadencias: o robô
   calcula a nota com ela e a tela ESCREVE a fórmula a partir dela. Duas cópias da
   frase (uma no JSON, uma no template) divergiriam no primeiro ajuste de peso. */
const temperaturaRegua = requireOpcional(() => require('../data/temperatura.json'));

const USUARIOS = Array.isArray(usuariosRaw) ? usuariosRaw : (usuariosRaw.usuarios || []);

function fmtDate(iso) {
  const d = new Date(iso);
  // CORREÇÃO (18/08/26, achado na revisão final: "atualizado em 18/08 às 21:46"
  // exibido numa segunda-feira à noite, horário de Brasília) — a HORA já convertia
  // pro fuso certo (timeZone abaixo), mas a DATA não tinha o mesmo timeZone e usava
  // o fuso do SERVIDOR (UTC, no GitHub Actions) — à noite em Brasília (UTC-3), já é
  // "amanhã" em UTC, então a data mostrava 1 dia à frente do que realmente é aqui.
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }) +
    ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// ============ MONTAGEM DO DATA COMPLETO (idêntica à antiga lógica do build.js) ============

// ══ A ROTA INJETA O SNAPSHOT AQUI ══════════════════════════════════════════════════
// Recebe o que veio da tabela e substitui SO o que veio preenchido. Chave ausente ou
// nula mantem o arquivo — nunca apaga um dado que existe com um vazio que chegou, porque
// tabela sem a linha e "ainda nao publicou", nao "nao ha dado".
//
// Devolve o que foi trocado, e a rota registra isso: sem esse retorno nao daria para
// saber, olhando producao, se a tela esta sendo servida pelo Supabase ou pelo arquivo —
// e essa e a unica pergunta que importa durante a virada.
function usarSnapshot(fontes) {
  const f = fontes || {};
  const trocadas = [];
  const usar = (chave, valor, aplicar) => {
    if (valor == null) return;
    aplicar(valor);
    trocadas.push(chave);
  };
  usar('hubspot', f.hubspot, v => { hubspot = v; });
  usar('narrativas', f.narrativas, v => { narrativas = v; });
  usar('resumo-semanal', f['resumo-semanal'], v => { resumoSemanal = v; });
  usar('weekly-raw', f['weekly-raw'], v => { weeklyRaw = v; });
  usar('sync-status', f['sync-status'], v => { syncStatus = v; });
  usar('hubspot-previous', f['hubspot-previous'], v => { hubspotPrevious = v; });
  return trocadas;
}

// ══ CADA LEAD DIZ EM QUE ETAPA ESTA (04/09/26) ═════════════════════════════════════
// Os objetos de funilLeads[etapa] vinham do robo SEM stageId: a etapa existia so como
// chave do mapa. Medido na ficha do negocio — ela faz ORDEM_FUNIL_FICHA.indexOf(l.stageId)
// e com -1 NAO DESENHA A TRILHA: os oito segmentos de mudar etapa nao existiam para
// negocio nenhum vindo da carga (0 segmentos medidos num lead do robo, 8 no criado na
// sessao, que nasce com stageId). O chip do topo tambem saia sem o nome da etapa.
//
// AQUI E NAO NO ROBO porque esta funcao e a porta unica — producao, preview e as suites
// passam por ela, e o snapshot do Supabase e injetado antes dela rodar. Corrigir no robo
// valeria so na proxima rodada e deixaria todo snapshot ja gravado sem o campo.
//
// `||` e nao sobrescrita: se o lead ja trouxer a etapa, a dele manda. A chave do mapa e o
// fallback, nao a autoridade.
function comEtapaNoLead(porEtapa) {
  const saida = {};
  Object.entries(porEtapa || {}).forEach(([etapa, leads]) => {
    saida[etapa] = (Array.isArray(leads) ? leads : []).map(l => (l && typeof l === 'object')
      ? Object.assign({}, l, {
          stageId: l.stageId || etapa,
          stage: l.stage || ((hubspot.stageMeta && hubspot.stageMeta.labels) ? (hubspot.stageMeta.labels[etapa] || '') : '')
        })
      : l);
  });
  return saida;
}

// O snapshot do CRM e obrigatorio para montar qualquer coisa. Sem ele — nem na tabela nem
// no arquivo — a resposta certa e um erro claro, nunca uma tela com zeros: zero negocio
// aberto e uma afirmacao sobre o funil, e nao ha funil nenhum para afirmar.
/* NARRATIVAS TAMBEM E OBRIGATORIO (03/09/26), e isto nao era verdade antes de hoje.
   Ele deixou de ser versionado (o robo commitava e cada commit gerava um deploy), entao
   nao esta mais no pacote do deploy: a UNICA fonte dele passou a ser a tabela. E ele nao
   e complemento — montarDadosCompletos() abre com Object.keys(narrativas.reps), ou seja
   ELE E O QUADRO DE EXECUTIVOS. Sem ele nao ha uma pessoa na tela.

   Antes desta linha, uma leitura de tabela que falhasse (6s de timeout em api/dados.js)
   derrubava a rota com TypeError em campo nulo — 500 e stack trace. Agora cai no mesmo
   503 com motivo que o hubspot ausente ja produzia, que e a resposta certa: a tela diz
   que nao tem dado, em vez de mentir ou explodir. Ver o bloco do .gitignore. */
function temSnapshot() { return !!(hubspot && hubspot.kpis && narrativas && narrativas.reps); }
/* QUAL das duas faltou. Vive aqui porque hubspot e narrativas sao locais deste modulo;
   a rota nao os ve. Uma funcao so, usada num lugar so, para o 503 mandar procurar no
   lugar certo: as duas chegam pelo mesmo caminho e quebram por motivos diferentes. */
function faltandoNoSnapshot() {
  const f = [];
  if (!(hubspot && hubspot.kpis)) f.push('o funil do CRM');
  if (!(narrativas && narrativas.reps)) f.push('o quadro de executivos (narrativas)');
  return f;
}

function montarDadosCompletos() {
  // Ordem de exibição = ordem em que aparecem no narrativas.json
  const ownerIds = Object.keys(narrativas.reps);

  const reps = ownerIds.map(ownerId => {
    const n = narrativas.reps[ownerId];
    const h = hubspot.reps[ownerId] || { open: 0, stages: {}, criticos: [], travados: [], leadsTravados: 0, ganhosSemana: 0, ganhosSemanaNomes: [], fechadosNoMes: 0, metaMensal: 10, metaMrr: null, metaReceita: null, patamarMeta: null, visitasHubspotHoje: 0, avancosHubspotHoje: 0, propostasHubspotHoje: 0, fechamentosHubspotHoje: 0 };

    return {
      ownerId,
      name: n.name,
      praca: n.praca,
      tag: n.tag,
      tagLabel: n.tagLabel,
      gargalo: n.gargalo,
      boasPraticas: n.boasPraticas,
      compromissos: n.compromissos,
      /* O PRAZO DE CADA COMPROMISSO, mesmo índice de `compromissos` (19/09/26). Sem ele a
         aba Pessoas não consegue dizer o que VENCEU, que é a manchete do gestor na
         segunda. Array irmão em vez de objeto porque cinco leitores indexam o texto e o
         checked[] de pdi_compromissos guarda a POSIÇÃO. */
      compromissosPrazo: Array.isArray(n.compromissosPrazo) ? n.compromissosPrazo : [],
      open: h.open,
      stages: h.stages,
      criticos: h.criticos,
      travados: h.travados || [],
      /* TODOS os abertos, enxutos — o mapa de cadência precisa da régua de cada um, e os
         recortes (criticos/travados/plotaveis) cobriam 124 dos 204 negócios do time.
         ESTE OBJETO É UM FILTRO: campo que não está nesta lista não chega à tela, e foi
         assim que metaMrr e metaReceita morreram em silêncio em 10/09. */
      abertos: Array.isArray(h.abertos) ? h.abertos : [],
      quentes: h.quentes || [],
      leadsTravados: h.leadsTravados || 0,
      ganhosSemana: h.ganhosSemana || 0,
      ganhosSemanaNomes: h.ganhosSemanaNomes || [],
      fechadosNoMes: h.fechadosNoMes || 0,
      /* ══ AS TRES METAS PASSAM, E ZERO E ZERO (10/09/26) ══════════════════════════
         Duas coisas estavam erradas nesta linha, e as duas apareceram medindo a tela
         depois da rodada do robo:

         1. ESTE OBJETO E UM FILTRO. `metaMrr` e `metaReceita` chegavam do robo e
            morriam aqui, porque nao estavam na lista — a tela recebia undefined nas
            duas metas novas.
         2. `|| 10` TRANSFORMA ZERO EM DEZ. A Amanda saiu da planilha e tem meta 0; a
            tela mostrava 10 para ela, que e exatamente o numero que este trabalho veio
            tirar. Zero e falsy, e `|| ` nao distingue "nao tem meta" de "meta zero". */
      metaMensal: h.metaMensal != null ? h.metaMensal : 10,
      metaMrr: h.metaMrr != null ? h.metaMrr : null,
      metaReceita: h.metaReceita != null ? h.metaReceita : null,
      patamarMeta: h.patamarMeta || null,
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

  // ---- Vendas do mês: as TRÊS medidas por executivo (10/09/26) ------------------
  //  Antes daqui saíam clientes e MRR. A receita (o valor TOTAL do plano negociado,
  //  `amount`) não vinha, e por isso duas das três metas do Julyan não tinham
  //  realizado nenhum na tela.
  //
  //  E O MÊS DE CADA VENDA PASSA A SER O DE COMPETÊNCIA, não o do closedate. Julyan,
  //  10/09: "uma venda do marco foi no mes passado, é q o boleto compensou na virada
  //  pro dia 1". O CRM não sabe disso — o único campo de data do ganho é o closedate.
  //  Quem sabe é ele, e a decisão está registrada em data/metas.json, negócio por
  //  negócio, com motivo. Aqui a venda ajustada SAI do mês e o ajuste viaja no payload
  //  para a tela poder dizer que houve — divergir do CRM em silêncio seria pior que o
  //  número errado.
  let vendasMes = null;
  if (Array.isArray(hubspot.vendasMes)) {
    const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const agoraBr = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const mesCorrente = agoraBr.toISOString().slice(0, 7);
    const porOwnerMes = {};
    const ajustadas = [];
    /* AS VENDAS DO GESTOR FICAM À PARTE, e não em porOwnerMes: aquela lista é o pódio
       e a régua por pessoa, e é ela que alimenta a rodada, a Daily e a meta individual.
       O gestor não tem plano de dia nem lugar na fila — o que ele tem é venda. */
    const doGestor = { count: 0, mrrTotal: 0, receitaTotal: 0, clientes: [], name: null, ownerId: null };
    /* E O QUE NÃO É DE NINGUÉM DO TIME CONTINUA FORA, mas agora CONTADO: antes ele
       sumia sem deixar rastro, e foi assim que quatro vendas do gestor ficaram um mês
       inteiro fora do placar sem ninguém ver. */
    const foraDoTime = [];
    hubspot.vendasMes.forEach(d => {
      const ehGestor = !!(d.ownerId && GESTORES_QUE_VENDEM[d.ownerId]);
      if (!d.ownerId || (!narrativas.reps[d.ownerId] && !ehGestor)) {
        foraDoTime.push({ id: d.id || null, nome: d.nome, ownerId: d.ownerId || null,
          mrr: d.mrr || 0, receita: d.receita || 0, closedate: d.closedate || null });
        return;
      }
      // A venda cujo mês de competência não é o corrente sai da conta do mês, e fica
      // registrada para a tela mostrar.
      const mes = d.mesDeCompetencia || mesCorrente;
      if (mes !== mesCorrente) {
        /* O NOME SAI DA FONTE CERTA para cada um: a do rep vem de narrativas, a do
           gestor de usuarios.json. Ler narrativas.reps[ownerId].name para o gestor
           estouraria aqui — ele não está lá, e é justamente por isso que este patch
           existe. */
        const quem = narrativas.reps[d.ownerId] || GESTORES_QUE_VENDEM[d.ownerId];
        ajustadas.push({ id: d.id || null, nome: d.nome, ownerId: d.ownerId,
          name: (quem && quem.name) || 'sem nome', mrr: d.mrr || 0, receita: d.receita || 0,
          closedate: d.closedate || null, contaEm: mes, motivo: d.ajustado || null });
        return;
      }
      if (ehGestor) {
        doGestor.count += 1;
        doGestor.mrrTotal += d.mrr || 0;
        doGestor.receitaTotal += d.receita || 0;
        doGestor.name = GESTORES_QUE_VENDEM[d.ownerId].name;
        doGestor.ownerId = d.ownerId;
        doGestor.clientes.push({ id: d.id || null, nome: d.nome, mrr: d.mrr || 0,
          receita: d.receita || 0, closedate: d.closedate || null });
        return;
      }
      if (!porOwnerMes[d.ownerId]) porOwnerMes[d.ownerId] = { count: 0, mrrTotal: 0, receitaTotal: 0, clientes: [] };
      porOwnerMes[d.ownerId].count += 1;
      porOwnerMes[d.ownerId].mrrTotal += d.mrr || 0;
      porOwnerMes[d.ownerId].receitaTotal += d.receita || 0;
      porOwnerMes[d.ownerId].clientes.push({ id: d.id || null, nome: d.nome, mrr: d.mrr || 0,
        receita: d.receita || 0, closedate: d.closedate || null });
    });
    const porRepMes = Object.entries(porOwnerMes).map(([ownerId, v]) => ({
      ownerId,
      name: narrativas.reps[ownerId].name,
      praca: narrativas.reps[ownerId].praca || '—',
      count: v.count,
      mrrTotal: v.mrrTotal,
      receitaTotal: v.receitaTotal,
      clientes: v.clientes.sort((a, b) => (b.mrr || 0) - (a.mrr || 0))
    })).sort((a, b) => (b.count - a.count) || (b.mrrTotal - a.mrrTotal));

    vendasMes = {
      mesLabel: `${MESES_PT[agoraBr.getUTCMonth()]}/${agoraBr.getUTCFullYear()}`,
      mes: mesCorrente,
      /* ══ OS TOTAIS SOMAM O TIME MAIS O GESTOR (24/09/26) ═══════════════════════
         Venda do gestor é venda da casa e conta no placar. O `porRep` abaixo NÃO a
         inclui de propósito — ele é o pódio e a régua por pessoa. Quem quiser saber a
         diferença entre os dois lê `gestor`, que viaja ao lado com nome e clientes. */
      totalClientes: porRepMes.reduce((s, r) => s + r.count, 0) + doGestor.count,
      totalMrr: porRepMes.reduce((s, r) => s + r.mrrTotal, 0) + doGestor.mrrTotal,
      totalReceita: porRepMes.reduce((s, r) => s + r.receitaTotal, 0) + doGestor.receitaTotal,
      porRep: porRepMes,
      /* A PARTE DO GESTOR, nomeada. `null` quando ele não vendeu no mês — e null é
         diferente de zero: zero seria uma linha na tela dizendo que ele não vendeu. */
      gestor: doGestor.count ? {
        ownerId: doGestor.ownerId, name: doGestor.name, count: doGestor.count,
        mrrTotal: doGestor.mrrTotal, receitaTotal: doGestor.receitaTotal,
        clientes: doGestor.clientes.sort((a, b) => (b.mrr || 0) - (a.mrr || 0))
      } : null,
      /* E O QUE FICOU FORA DO TIME, CONTADO em vez de sumido em silêncio. */
      foraDoTime: foraDoTime,
      // as vendas que saíram do mês por competência, com o motivo de cada uma
      ajustadas: ajustadas
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
    /* AS OPÇÕES DAS PROPRIEDADES DE ENUMERAÇÃO, como o HubSpot as nomeia. A tela usa
       para MOSTRAR; o valor gravado continua vindo das listas do template. Sem isto a
       tela imprimia o valor cru e oito opções divergiam do CRM. */
    opcoesHubspot: hubspot.opcoesDeNegocio || null,
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
    /* POR QUE PERDEMOS (30/08/26): motivo de perda dos ultimos 90 dias, por motivo e por
       executivo. Vem do HubSpot em motivo_do_perdido, que o time preenche.

       DESDE 19/09 ELE CARREGA emLotePorMotivo: quanto de cada motivo foi marcado numa
       sentada. O objeto vai INTEIRO para o gestor, então os campos novos viajam
       sozinhos — não há lista de campos aqui que precise ser atualizada. */
    motivosPerda: hubspot.motivosPerda || null,
    /* Conversão por turma, velocidade de etapa e ciclo — o gestor recebe inteiro. */
    historicoEtapas: hubspot.historicoEtapas || null,
    funil: hubspot.funil,
    /* SEM ISTO A TRILHA DE ETAPAS DA FICHA NAO DESENHA — ver comEtapaNoLead. */
    funilLeads: comEtapaNoLead(hubspot.funilLeads),
    /* o numero de quem saiu do time viaja DENTRO de kpisHub, que a tela ja recebe
       inteiro — passar de novo no topo era um caminho que a lista branca do recorte por
       papel descartava em silencio. */
    /* O CORTE DA COLUNA PERDIDO desce para os dois papeis. Sem ele a tela nao tem como
       dizer 'nada saiu da carteira desde 01/09' e a coluna vazia leria como 'nunca perdi
       nada' — mentira por omissao, com 1.811 perdas no CRM. */
    perdidoVisivel: hubspot.perdidoVisivel || null,
    onboardingVisivel: hubspot.onboardingVisivel || null,
    leadsReciclagem60: hubspot.leadsReciclagem60 || [],
    vendasMes,
    temperatura: temperaturaComPraca,
    stageMeta: hubspot.stageMeta || { slaDays: {}, descriptions: {}, labels: {} },
    saude,
    reps,
    /* AGREGADO ANÔNIMO: só percentuais e a contagem de quantas pessoas entraram na
       conta. Nenhum nome, nenhum ownerId de colega, nenhuma lista. */
    habitosTime: habitosDoTime(hubspot.reps || {}, ownerIds),
    leadsReferencia: leadsReferencia.pracas || [],
    /* O MAPA INTEIRO É DO GESTOR: é com ele que a aba Rotas sabe de quem é cada praça,
       quem está sem rota declarada e o que ficou sem dono. O recorte do executivo está
       mais abaixo — ele recebe só a rota dele. */
    territorios: territorios.territorios || [],
    territoriosSemDono: territorios._sem_dono || [],
    footerText: `Fonte: HubSpot (pipeline 916011864, atualizado a cada 2h no horário comercial) + Daily (prometido/realizado) · Leads críticos = mais antigos sem avanço de etapa.`,
    // AUTOMAÇÃO 3 (13/08/26) — status da última rodada do robô: se alguma escrita de
    // realizado_visitas/avancos/propostas falhou ou não bateu na conferência pós-escrita.
    // Opcional: undefined até a primeira rodada rodar com esta automação.
    syncStatus: syncStatus || null,
    resumoSemanal: (resumoSemanal || weeklyRaw) ? {
      geradoEmFmt: resumoSemanal ? fmtDate(resumoSemanal.geradoEm) : null,
      numerosAtualizadosEmFmt: weeklyRaw ? fmtDate(weeklyRaw.geradoEm) : (resumoSemanal ? fmtDate(resumoSemanal.geradoEm) : null),
      janela: (weeklyRaw && weeklyRaw.janela) || (resumoSemanal && resumoSemanal.janela),
      /* A JANELA QUE O TEXTO DA IA DESCREVE (19/09/26), que NÃO é a de cima.
         `janela` acima vem do weekly-raw, regravado a cada daily-refresh; `porRep` e
         `comoAgir` logo abaixo vêm do resumo-semanal, escrito só no cron de domingo
         22h. A janela do weekly-raw vira na sexta 23:59 e a do resumo só no domingo:
         nesse fim de semana o placar é de uma semana e o board é da anterior. Sem
         este campo a tela não tem como saber disso, e foi assim que "2 ganhos" e
         "R$ 857 de MRR" de semanas diferentes ficaram lado a lado em 16/09. */
      janelaDaLeitura: (resumoSemanal && resumoSemanal.janela && resumoSemanal.janela.atual) || null,
      kpisComparativo: (weeklyRaw && weeklyRaw.kpisComparativo) || (resumoSemanal && resumoSemanal.kpisComparativo),
      resumoGeral: resumoSemanal ? resumoSemanal.resumoGeral : null,
      comoAgir: resumoSemanal ? resumoSemanal.comoAgir : [],
      // BLOCO 41 — faísca de 5 semanas (fechamentos/reuniões/criados) pros KPIs de time
      // da aba Semana do gestor. Só existe a partir desta build; resumo-semanal.json de
      // builds antigas não tem o campo, daí o fallback pra null (a tela desenha 1 barra só).
      serieSemanal: resumoSemanal ? (resumoSemanal.serieSemanal || null) : null,
      porRep: resumoSemanal ? (resumoSemanal.porRep || {}) : {},
      /* A aba Semana mostra um selo discreto quando a rodada da IA falhou em parte.
         Sem repassar aqui, aquele selo seria codigo morto por construcao — o campo
         existe no snapshot e nao existia nesta projecao. */
      _falhasIA: resumoSemanal ? (resumoSemanal._falhasIA || null) : null,
      ganhosSemanaDetalhe: ganhosDetalheFresco,
      reunioesSemanaDetalhe: (weeklyRaw && weeklyRaw.reunioesSemanaDetalhe) || (resumoSemanal && resumoSemanal.reunioesSemanaDetalhe) || [],
      // BLOCO 41 — "criados" por pessoa na semana (board da Semana do gestor).
      leadsCriadosSemanaDetalhe: (weeklyRaw && weeklyRaw.leadsCriadosSemanaDetalhe) || (resumoSemanal && resumoSemanal.leadsCriadosSemanaDetalhe) || [],
      quentesDemoOuNegociacao: (weeklyRaw && weeklyRaw.quentesDemoOuNegociacao) || (resumoSemanal && resumoSemanal.quentesDemoOuNegociacao) || [],
      // snapshotReps alimenta o card "Onde atacar esta semana" (visão por praça).
      // Ele só existe no weekly-raw.json — o resumo-semanal.json (texto da IA) não tem.
      // Sem esta linha o card lia undefined e sumia da tela em silêncio, sem erro.
      snapshotReps: (weeklyRaw && weeklyRaw.snapshotReps) || {},
      ranking: rankingSemanal
    } : null,
    agenda: hubspot.agenda || null,
    redesExcluidas: (redesExcluidas && Array.isArray(redesExcluidas.redes)) ? redesExcluidas.redes : [],
    // Configuração da régua de cadência — igual pros dois papéis (é política do canal,
    // não dado de cliente), por isso passa intacta pelo filtrarParaPapel.
    cadencias: cadencias || null,
    /* A TABELA DO VARIÁVEL — igual para os dois papéis, como cadencias: é política de
       remuneração, não dado de cliente. O que o filtro por papel corta é a LISTA de
       vendas por pessoa (vendasMes), e é dela que sai quantos clientes cada um tem —
       então o executivo calcula a comissão dele e não vê a do colega. */
    comissionamento: comissionamento || null,
    /* CADÊNCIA DIÁRIA (08/09/26): atividade por executivo por dia útil, do robô.
       DADO, não configuração — o filtro por papel abaixo corta para o executivo. */
    cadenciaDiaria: hubspot.cadenciaDiaria || null,
    /* A RÉGUA DA TEMPERATURA vai inteira para os dois papéis: é política de
       priorização, e a tela precisa dela para escrever de onde a nota vem. */
    temperaturaRegua: temperaturaRegua || null,
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
/* ══ HÁBITOS DO TIME — NÚMERO AGREGADO, SEM NOME ════════════════════════════════════
   Ver o cabeçalho de scripts/montar-dados.js? Não: a razão inteira está no commit e no
   comentário da aba. Aqui fica a mecânica.
   Três percentuais por pessoa, e o percentil 80 do time como referência. Quem não tem
   negócio aberto fica FORA da conta (n/0 não é 0%, é "não medido" — e um zero desses
   puxaria o benchmark do time inteiro para baixo). */
function pctSeguro(parte, total) {
  if (!total || total <= 0) return null;
  return Math.round((parte / total) * 100);
}

function habitosDoRep(h) {
  const abertos = Number(h && h.open) || 0;
  if (!abertos) return { cadencia: null, qualificacao: null, proximoPasso: null, abertos: 0 };
  const travados = Number(h && h.leadsTravados) || 0;
  /* a lista completa de abertos por rep não vem no snapshot; o que vem por rep são os
     recortes (travados, criticos, quentes). Para os dois hábitos de registro, a base é
     a união desses recortes — é a amostra que existe, e ela é a mesma para todo mundo. */
  const amostra = [];
  ['travados', 'criticos', 'quentes'].forEach(k => {
    (h && Array.isArray(h[k]) ? h[k] : []).forEach(l => {
      if (l && l.id && !amostra.some(x => x.id === l.id)) amostra.push(l);
    });
  });
  const comQualif = amostra.filter(l => String(l.nome_do_sistema || '').trim() && String(l.gargalo_operacional || '').trim()).length;
  const comPasso = amostra.filter(l => String(l.proximaAtividade || l.proximaReuniao || '').trim()).length;
  return {
    cadencia: pctSeguro(abertos - travados, abertos),
    qualificacao: pctSeguro(comQualif, amostra.length),
    proximoPasso: pctSeguro(comPasso, amostra.length),
    abertos
  };
}

function percentil80(valores) {
  const v = (valores || []).filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  /* percentil 80 pelo método do índice mais próximo: com 6 pessoas cai no 2º melhor. */
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil(0.8 * v.length) - 1));
  return v[i];
}

function habitosDoTime(hubspotReps, ownerIds) {
  const porRep = {};
  (ownerIds || []).forEach(id => { porRep[id] = habitosDoRep((hubspotReps || {})[id]); });
  const medidos = Object.values(porRep).filter(x => x && x.abertos > 0);
  const benchmark = {
    cadencia: percentil80(medidos.map(x => x.cadencia)),
    qualificacao: percentil80(medidos.map(x => x.qualificacao)),
    proximoPasso: percentil80(medidos.map(x => x.proximoPasso))
  };
  return { porRep, benchmark, pessoasMedidas: medidos.length };
}

function resumoDeColega(r) {
  return {
    ownerId: r.ownerId,
    name: r.name,
    praca: r.praca,
    fechadosNoMes: r.fechadosNoMes,
    metaMensal: r.metaMensal,
    metaMrr: r.metaMrr,
    metaReceita: r.metaReceita,
    patamarMeta: r.patamarMeta,
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
    // BLOCO 41 — mesmo corte de privacidade dos outros dois: o executivo só vê os
    // negócios criados que são dele, nunca os dos colegas.
    leadsCriadosSemanaDetalhe: soMeu(rs.leadsCriadosSemanaDetalhe),
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
  /* O corte de Perdido nao tem nome de ninguem: e a data em que o Cockpit passou a
     registrar perda. Vai inteiro para o executivo. */
  const perdidoVisivel = dados.perdidoVisivel || null;
  const onboardingVisivel = dados.onboardingVisivel || null;

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

  /* A ROTA DELE, E SÓ A DELE. O mapa completo diz por onde cada colega anda, e território
     de quem está ao lado não é informação do executivo — mesma regra que cortou
     snapshotReps em 07/08. O que ele PRECISA é a própria rota, porque é ela que define
     onde a prospecção dele acontece. */
  const meuTerritorio = (dados.territorios || []).filter(x => x && x.rep === meuNome);

  /* O EXECUTIVO RECEBE O PRÓPRIO HÁBITO E O NÚMERO DO TIME — nunca o porRep inteiro.
     O spread de ...dados levaria o mapa com todo mundo, que é exatamente o vazamento
     silencioso que o corte de snapshotReps fechou em 07/08. */
  /* CADÊNCIA DIÁRIA DO EXECUTIVO: só a linha dele. O heatmap do time é da tela do
     gestor; mandar `porOwner` inteiro para o executivo entregaria a atividade diária
     de cada colega no payload dele — o oposto do corte de 07/08/26. Os `dias` vão
     junto porque sem eles o sparkline não sabe a que dia cada barra pertence. */
  const cadenciaMinha = (dados.cadenciaDiaria && dados.cadenciaDiaria.porOwner) ? {
    dias: dados.cadenciaDiaria.dias || [],
    porOwner: { [meuId]: dados.cadenciaDiaria.porOwner[meuId] || null },
    fonte: dados.cadenciaDiaria.fonte || null,
    naoConta: dados.cadenciaDiaria.naoConta || null,
    truncado: dados.cadenciaDiaria.truncado || [],
    geradoEm: dados.cadenciaDiaria.geradoEm || null
  } : null;
  const habitosMeu = (dados.habitosTime && dados.habitosTime.porRep && dados.habitosTime.porRep[meuId]) || null;
  const habitosTime = dados.habitosTime ? {
    meu: habitosMeu,
    benchmark: dados.habitosTime.benchmark,
    pessoasMedidas: dados.habitosTime.pessoasMedidas
  } : null;

  return {
    ...dados,
    habitosTime,
    /* SEM ESTA LINHA o spread acima entregaria cadenciaDiaria.porOwner INTEIRO ao
       executivo — a atividade diária de cada colega no payload dele. Declarar
       cadenciaMinha e esquecer de usá-la é o vazamento em silêncio de sempre. */
    cadenciaDiaria: cadenciaMinha,
    reps,
    kpiDetalhe: {
      leadsCriados: soMeu(dados.kpiDetalhe.leadsCriados),
      perdidos: soMeu(dados.kpiDetalhe.perdidos)
    },
    /* O EXECUTIVO VE SO A PROPRIA ASSINATURA DE PERDA. O total do time e a comparacao
       entre executivos e material de gestao: saber que o colega perde mais por preco nao
       ajuda ninguem na rua, e ranking de derrota nas costas do outro nao e transparencia. */
    /* HISTÓRICO DE ETAPA DO EXECUTIVO: só a fatia dele, mais as referências do time que
       não têm nome de ninguém (velocidade por etapa, ciclo e agregado). Corte no
       servidor, como o resto do arquivo: carteira de outra pessoa não desce para o
       navegador dele. A escada por turma sai — é leitura de time, não dele. */
    historicoEtapas: dados.historicoEtapas ? {
      dias: dados.historicoEtapas.dias,
      primeiroMes: dados.historicoEtapas.primeiroMes,
      ultimoMes: dados.historicoEtapas.ultimoMes,
      minimoDaTurma: dados.historicoEtapas.minimoDaTurma,
      escada: {},
      velocidade: dados.historicoEtapas.velocidade || [],
      ciclo: dados.historicoEtapas.ciclo || null,
      agregado: dados.historicoEtapas.agregado || null,
      porOwner: { [meuId]: (dados.historicoEtapas.porOwner || {})[meuId] || null }
    } : null,
    motivosPerda: dados.motivosPerda ? {
      dias: dados.motivosPerda.dias,
      total: Object.values((dados.motivosPerda.porOwner || {})[meuId] || {}).reduce((a, b) => a + b, 0),
      porMotivo: (dados.motivosPerda.porOwner || {})[meuId] || {},
      porOwner: { [meuId]: (dados.motivosPerda.porOwner || {})[meuId] || {} },
      /* Exemplos para o clique no motivo — so os negocios DELE. Corte no servidor: perda
         de outra pessoa nao desce para o navegador dele. */
      exemplos: Object.keys(dados.motivosPerda.exemplos || {}).reduce((acc, motivo) => {
        const meus = (dados.motivosPerda.exemplos[motivo] || []).filter(x => String(x.ownerId || '') === String(meuId));
        if (meus.length) acc[motivo] = meus;
        return acc;
      }, {})
    } : null,
    temperatura: {
      quentes: soMeu(dados.temperatura.quentes),
      frios: soMeu(dados.temperatura.frios)
    },
    funilLeads,
    perdidoVisivel,
    onboardingVisivel,
    leadsReciclagem60: soMeu(dados.leadsReciclagem60 || []),
    vendasMes,
    resumoSemanal: resumoSemanalFiltrado,
    agenda,
    leadsReferencia,
    territorios: meuTerritorio,
    // AUTOMAÇÃO 3 — o relatório BRUTO do robô (falhas por executivo, verificação de
    // escrita) continua sendo do gestor. Mas o executivo precisa saber se a carga que
    // está na tela dele é confiável: recomendação em cima de snapshot velho, ou visita
    // que ficou presa no app e não subiu, muda o que ele faz às 8h30. Então ele recebe
    // um recorte: quando rodou, se a rodada teve falha, e se ALGUMA falha era dele —
    // nunca as falhas dos colegas.
    syncStatus: dados.syncStatus ? {
      ultimaExecucao: dados.syncStatus.ultimaExecucao || null,
      houveFalha: Array.isArray(dados.syncStatus.falhas) && dados.syncStatus.falhas.length > 0,
      falhaMinha: Array.isArray(dados.syncStatus.falhas)
        ? dados.syncStatus.falhas.some(f => String(f && (f.ownerId || f.owner_id) || '') === meuId)
        : false
    } : null
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

module.exports = { montarDadosCompletos, filtrarParaPapel, configSupabase, configMaptiler, USUARIOS, usarSnapshot, temSnapshot, faltandoNoSnapshot };
