// lib/realizado.js
//
// A CONTA DO "REALIZADO DE HOJE" — uma fonte só (01/09/26).
//
// POR QUE ESTE ARQUIVO EXISTE: a Minha Daily v2 é um placar que anda durante o dia. Para
// andar, ela precisa perguntar ao HubSpot "o que já foi cumprido AGORA" — e essa mesma
// pergunta já era respondida em scripts/fetch-hubspot.js, que roda 3x por dia e grava o
// resultado na tabela `dailies`. Duas respostas para a mesma pergunta é o começo de duas
// verdades: a tela mostraria um número às 14h e o robô gravaria outro às 16h, e o
// executivo (e o gestor) não teriam como saber qual está certo.
//
// O aviso já estava escrito no projeto, em api/hubspot-webhook.js, e vale palavra por
// palavra aqui: "Zero lógica de negócio nova, zero risco de duas implementações
// divergentes do 'como calcular o funil'."
//
// COMO É USADO NOS DOIS LADOS: as funções recebem o BUSCADOR por parâmetro (`hsSearch`),
// porque o robô e a rota falam com o HubSpot de maneiras diferentes (o robô tem paginação
// completa e retry; a rota tem timeout curto de serverless). A conta é a mesma; o
// transporte é de quem chama.
//
// POR QUE A DAILY NÃO PODE SIMPLESMENTE LER A TABELA: a tabela `dailies` é atualizada às
// 11:56, 16:00 e 22:00 pelo cron, mais no máximo uma vez por hora pelo webhook (que tem
// janela de descanso de 60 min porque cada disparo custava um deploy na Vercel). Ou seja:
// entre 11:56 e 16:00 o número fica parado. Um placar que fica parado 4 horas não é um
// placar — é o contrato estático que a v2 existe para substituir.

/* Os ids de etapa deste pipeline. ATENÇÃO, e isto é dívida conhecida: os mesmos ids
   também estão escritos em scripts/fetch-hubspot.js, scripts/fetch-weekly-comparison.js,
   scripts/backfill-dailies-semana.js e nas ações de lib/acoes-negocio/ — onze arquivos ao
   todo, de antes deste. Consolidar tudo é um refactor que toca o projeto inteiro e não
   cabe nesta mudança; o que cabe é NÃO deixar a divergência passar em silêncio:
   scripts/testar-realizado.js compara esta tabela com a de fetch-hubspot.js e falha se
   alguém mexer em uma só. Guarda vale mais que promessa. */
const STAGES_REALIZADO = {
  diagnostico: '1395880470',
  demoProposta: '1395880471',
  negociacao: '1395880472',
  agPagamento: '1395880473',
  ganho1: '1396006162',
  ganho2: '1396006163'
};
const PIPELINE_REALIZADO = '916011864';

/* Brasília é UTC−3 e o HubSpot devolve tudo em UTC. Todo corte de dia deste arquivo passa
   por aqui, porque errar isto conta a visita das 22h no dia seguinte — e foi um defeito
   real desta base antes de a conversão existir. */
function inicioDoDiaBrasiliaMs(diaISO) {
  const base = diaISO
    ? new Date(diaISO + 'T12:00:00Z')
    : new Date(Date.now() - 3 * 60 * 60 * 1000);
  return Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 3, 0, 0);
}

function diaISOBrasilia(ts) {
  if (!ts) return null;
  return new Date(new Date(ts).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function horaBrasilia(ts) {
  if (!ts) return null;
  const d = new Date(new Date(ts).getTime() - 3 * 60 * 60 * 1000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

/* O nome do restaurante vive DENTRO do assunto da tarefa: o Expogo e a rota do cockpit
   criam "Visita - <restaurante>" (ver lib/acoes-negocio/criar-tarefa-rota.js). É daí que
   a linha do dia sabe de quem é cada linha, sem precisar pedir associações ao HubSpot —
   uma chamada por tarefa seria caro e lento para uma tela que atualiza sozinha. */
function nomeDoAssunto(assunto) {
  const s = String(assunto || '').trim();
  const m = s.match(/^\s*(?:re)?vis[ií]ta\s*[-–:]\s*(.+)$/i) || s.match(/^\s*reuni[aã]o\s*[-–:]\s*(.+)$/i);
  return m ? m[1].trim() : s;
}

function ehTarefaDeVisita(props) {
  const titulo = String((props || {}).hs_task_subject || '');
  const corpo = String((props || {}).hs_task_body || '');
  return /^\s*(re)?visita\b/i.test(titulo) || /app\s*outbound/i.test(corpo);
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   1. AS VISITAS DO DIA — e o estado de cada uma

   A REGRA QUE NÃO PODE SE PERDER, e ela custou um defeito de dado em produção (12/08/26,
   flagrado na Kelly): visita FEITA é a tarefa com status COMPLETED. A tarefa nasce
   NOT_STARTED quando o executivo monta a rota — contar toda tarefa criada no dia daria
   por feita a visita que ele ainda vai fazer. Às 9h da manhã o cockpit dizia "2
   realizado" e as duas eram compromissos das 10:00 e 10:45.

   AS DUAS JANELAS, e por que elas não podem ser uma só — achado antes de ligar esta lib
   no robô: a CONTAGEM que vale pontos é "tarefa de visita COMPLETED criada hoje"
   (hs_createdate), e é assim desde 12/08/26. A LINHA DO DIA precisa de outra coisa: a
   agenda do dia (hs_timestamp), porque a visita das 15h30 foi marcada ontem no
   Planejamento e tem que aparecer na fila às 9h da manhã.
   Se eu tivesse trocado uma pela outra para "simplificar", a visita registrada hoje numa
   tarefa marcada ontem sairia da contagem — e o executivo perderia 20 pontos que ganhou,
   sem nada na tela explicando. Então a busca traz as duas janelas (dois filterGroups, que
   o HubSpot trata como OU) e a classificação é feita aqui:
     · conta pontos  → COMPLETED com hs_createdate de hoje  (a regra que já valia)
     · linha do dia  → (hs_timestamp de hoje) ∪ (as COMPLETED contadas acima)

   Daqui sai também a LINHA DO DIA da v2, e é por isso que esta função devolve as listas e
   não só o total: a fila (NOT_STARTED, com a hora prevista em hs_timestamp) e as feitas
   (COMPLETED, com a hora REAL do registro). "Registrada 09:52" só é verdade se sair de um
   campo de conclusão — inventar a hora seria pior que não mostrar.
   ══════════════════════════════════════════════════════════════════════════════════════ */
async function visitasDoDia(hsSearch, ownerId, diaISO) {
  const inicio = inicioDoDiaBrasiliaMs(diaISO);
  const fim = inicio + 86400000;
  const data = await hsSearch('tasks', {
    /* dois grupos = OU no HubSpot: a agenda do dia e o que foi criado hoje. */
    filterGroups: [
      { filters: [
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(ownerId) },
        { propertyName: 'hs_timestamp', operator: 'BETWEEN', value: String(inicio), highValue: String(fim) }
      ] },
      { filters: [
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(ownerId) },
        { propertyName: 'hs_createdate', operator: 'BETWEEN', value: String(inicio), highValue: String(fim) }
      ] }
    ],
    properties: ['hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_timestamp',
      'hs_task_completion_date', 'hs_lastmodifieddate', 'hs_createdate'],
    limit: 100
  });

  const linhas = (data.results || [])
    .filter(t => ehTarefaDeVisita(t.properties))
    .map(t => {
      const p = t.properties || {};
      const feita = String(p.hs_task_status || '') === 'COMPLETED';
      /* hs_task_completion_date é o campo certo; hs_lastmodifieddate é a rede de
         segurança para tarefa concluída fora do app, onde a HubSpot às vezes não
         preenche o primeiro. Se nenhum dos dois vier, a hora fica null e a tela diz
         "registrada" sem hora — em vez de mostrar uma hora que não aconteceu. */
      const tsRegistro = feita ? (p.hs_task_completion_date || p.hs_lastmodifieddate || null) : null;
      const dia = diaISO || diaISOBrasilia(Date.now());
      const criadaNoDia = diaISOBrasilia(p.hs_createdate) === dia;
      const naAgendaDoDia = diaISOBrasilia(p.hs_timestamp) === dia;
      return {
        id: t.id,
        nome: nomeDoAssunto(p.hs_task_subject),
        assunto: String(p.hs_task_subject || ''),
        estado: feita ? 'feita' : 'fila',
        /* contaPontos é a REGRA QUE JÁ VALIA (COMPLETED + criada no dia). Fica explícita
           em cada linha para a tela poder mostrar "+20" só onde o ponto existe de fato —
           e para o teste poder afirmar que o total é a soma deste campo, e não de "feita". */
        contaPontos: feita && criadaNoDia,
        naAgendaDoDia,
        horaPrevista: naAgendaDoDia ? horaBrasilia(p.hs_timestamp) : null,
        horaRegistro: horaBrasilia(tsRegistro),
        msPrevisto: p.hs_timestamp ? new Date(p.hs_timestamp).getTime() : null,
        /* A HORA QUE ORDENA A LINHA DO DIA, e ela não é sempre a prevista. A visita avulsa
           (registrada sem estar na agenda) traz hs_timestamp de outro dia — isso não é
           "sem hora", é hora que não vale para hoje. Ordenar por ela jogaria a visita das
           13h05 para o topo da manhã. O lugar dela na linha é a hora em que foi
           registrada; quem está na agenda de hoje ordena pela hora marcada. */
        msNaLinha: naAgendaDoDia
          ? new Date(p.hs_timestamp).getTime()
          : (tsRegistro ? new Date(tsRegistro).getTime() : Infinity)
      };
    })
    .sort((a, b) => a.msNaLinha - b.msNaLinha);

  /* A linha do dia é a UNIÃO das duas janelas: o que estava marcado para hoje mais o que
     foi registrado hoje (inclusive a visita avulsa, que não estava na agenda de ninguém —
     e é justamente a que o executivo mais quer ver creditada). */
  const daLinha = linhas.filter(l => l.naAgendaDoDia || l.contaPontos);

  return {
    total: linhas.filter(l => l.contaPontos).length,
    prometidasNaAgenda: daLinha.filter(l => l.naAgendaDoDia).length,
    linhas: daLinha
  };
}

/* O TOTAL SOZINHO — a busca ESTREITA, que é a do robô.
   Não delega para visitasDoDia de propósito: aquela faz a união de duas janelas para
   montar a linha do dia, e união traz mais linhas para o mesmo limite de 100 por página.
   O robô só precisa do número, e trocar a busca dele por uma mais larga seria arriscar
   truncar a contagem que vale pontos para ganhar nada. Mesma REGRA (COMPLETED + criada no
   dia), mesma resposta — o teste afirma que os dois caminhos dão o mesmo total. */
async function visitasFeitasNoDia(hsSearch, ownerId, diaISO) {
  const inicio = inicioDoDiaBrasiliaMs(diaISO);
  const fim = inicio + 86400000;
  const data = await hsSearch('tasks', {
    filterGroups: [{ filters: [
      { propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(ownerId) },
      { propertyName: 'hs_createdate', operator: 'BETWEEN', value: String(inicio), highValue: String(fim) }
    ] }],
    properties: ['hs_task_subject', 'hs_task_body', 'hs_task_status'],
    limit: 100
  });
  return (data.results || [])
    .filter(t => ehTarefaDeVisita(t.properties))
    .filter(t => String((t.properties || {}).hs_task_status || '') === 'COMPLETED')
    .length;
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   2. AVANÇOS E PROPOSTAS — função PURA sobre a lista de negócios

   Não faz I/O de propósito: o robô já tem a lista de negócios do executivo carregada, e a
   rota ao vivo busca a dela. Assim a REGRA (quais etapas contam, e que Demo/Proposta não
   conta duas vezes) fica num lugar só, e quem chama decide de onde vem a lista.

   Demo/Proposta fica FORA de "avanços" porque virou métrica própria — se entrasse nas
   duas, o mesmo negócio pontuaria em dobro.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const ETAPAS_DE_AVANCO = [STAGES_REALIZADO.diagnostico, STAGES_REALIZADO.negociacao, STAGES_REALIZADO.agPagamento];

function entrouNaEtapaNoDia(negocio, stageId, diaISO) {
  const dt = ((negocio || {}).properties || {})['hs_v2_date_entered_' + stageId];
  return !!dt && diaISOBrasilia(dt) === diaISO;
}

function nomeDoNegocio(negocio) {
  return String(((negocio || {}).properties || {}).dealname || '').trim();
}

function contarEtapas(negocios, stageIds, diaISO) {
  const vistos = new Set();
  const nomes = [];
  let total = 0;
  (stageIds || []).forEach(stageId => {
    (negocios || []).forEach(d => {
      if (!entrouNaEtapaNoDia(d, stageId, diaISO)) return;
      total++;
      /* Dedup por id só na lista de NOMES: o mesmo negócio pode ter entrado em duas
         etapas no mesmo dia (pulou etapa), e o nome repetido na tela parece dado errado.
         O total continua contando os dois avanços, porque os dois aconteceram. */
      const nome = nomeDoNegocio(d);
      if (!nome || vistos.has(d.id)) return;
      vistos.add(d.id);
      nomes.push(nome);
    });
  });
  return { total, nomes };
}

function avancosDoDia(negocios, diaISO) {
  return contarEtapas(negocios, ETAPAS_DE_AVANCO, diaISO);
}

function propostasDoDia(negocios, diaISO) {
  return contarEtapas(negocios, [STAGES_REALIZADO.demoProposta], diaISO);
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   3. FECHAMENTOS — negócio que caiu em Ganho hoje, pela closedate

   E A EXCLUSÃO, que precisa estar aqui e não só no robô: são dois negócios auditados com
   o Julyan em 30/07/26 (uma duplicata e um cliente reativado, que não é venda nova) mais
   qualquer negócio com "teste" no nome. Se a tela ao vivo contasse um fechamento que o
   robô descarta, o executivo veria +200 pts às 15h e o placar da noite mostraria 0 — e a
   explicação seria impossível de dar.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const EXCLUIDOS_IDS = ['62640951452', '59186260237'];

function ehNegocioDeTeste(dealname) {
  if (!dealname) return false;
  return /teste/i.test(String(dealname));
}

function ehNegocioExcluido(negocio) {
  if (!negocio) return false;
  if (EXCLUIDOS_IDS.indexOf(String(negocio.id)) >= 0) return true;
  return ehNegocioDeTeste(((negocio.properties) || {}).dealname);
}

async function fechamentosDoDia(hsSearch, ownerId, diaISO, ehExcluido) {
  const inicio = inicioDoDiaBrasiliaMs(diaISO);
  /* Dia fechado usa a janela inteira; dia corrente vai até agora — contar até meia-noite
     de um dia que ainda não acabou é contar o futuro. */
  const fim = diaISO ? inicio + 86400000 : Date.now();
  const data = await hsSearch('deals', {
    filterGroups: [{
      filters: [
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_REALIZADO },
        { propertyName: 'dealstage', operator: 'IN', values: [STAGES_REALIZADO.ganho1, STAGES_REALIZADO.ganho2] },
        { propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(ownerId) },
        { propertyName: 'closedate', operator: 'BETWEEN', value: String(inicio), highValue: String(fim) }
      ]
    }],
    properties: ['dealname', 'closedate'],
    limit: 50
  });
  /* quem chama pode passar a própria regra (o robô passa a dele, que é a mesma), mas o
     PADRÃO é excluir — esquecer o parâmetro não pode virar número inflado. */
  const excluir = typeof ehExcluido === 'function' ? ehExcluido : ehNegocioExcluido;
  const lista = (data.results || []).filter(d => !excluir(d));
  return {
    total: lista.length,
    nomes: lista.map(nomeDoNegocio).filter(Boolean),
    horas: lista.map(d => horaBrasilia(((d.properties || {}).closedate) || null)).filter(Boolean)
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   4. O PACOTE QUE A TELA CONSOME

   Devolve os quatro números NA MESMA FORMA das colunas de `dailies` (realizado_visitas,
   realizado_avancos, realizado_propostas, realizado_fechamentos), mais o detalhe que só a
   v2 usa: a linha do dia e os nomes por métrica. Números iguais, campos iguais — quem
   comparar a tela com a tabela tem que encontrar a mesma coisa.
   ══════════════════════════════════════════════════════════════════════════════════════ */
async function realizadoDeHoje(hsSearch, ownerId, opts) {
  const o = opts || {};
  const diaISO = o.diaISO || null;
  const hoje = diaISO || diaISOBrasilia(Date.now());
  const negocios = o.negocios || [];

  const visitas = await visitasDoDia(hsSearch, ownerId, diaISO);
  const avancos = avancosDoDia(negocios, hoje);
  const propostas = propostasDoDia(negocios, hoje);
  const fechamentos = await fechamentosDoDia(hsSearch, ownerId, diaISO, o.ehExcluido);

  return {
    dia: hoje,
    realizado_visitas: visitas.total,
    realizado_avancos: avancos.total,
    realizado_propostas: propostas.total,
    realizado_fechamentos: fechamentos.total,
    detalhe: {
      visitas: visitas.linhas,
      prometidasNaAgenda: visitas.prometidasNaAgenda,
      avancos: avancos.nomes,
      propostas: propostas.nomes,
      fechamentos: fechamentos.nomes
    }
  };
}

module.exports = {
  STAGES_REALIZADO, PIPELINE_REALIZADO, ETAPAS_DE_AVANCO,
  EXCLUIDOS_IDS, ehNegocioDeTeste, ehNegocioExcluido,
  inicioDoDiaBrasiliaMs, diaISOBrasilia, horaBrasilia,
  nomeDoAssunto, ehTarefaDeVisita,
  visitasDoDia, visitasFeitasNoDia,
  entrouNaEtapaNoDia, contarEtapas, avancosDoDia, propostasDoDia,
  fechamentosDoDia, realizadoDeHoje
};
