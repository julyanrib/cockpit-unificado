// scripts/testar-realizado.js
// Testa lib/realizado.js — a conta do "cumprido de hoje", com o HubSpot STUBBADO.
// Nenhuma rede, nenhuma leitura de dado real.
//
// POR QUE EXISTE (01/09/26): a Minha Daily v2 é um placar que anda durante o dia, e o
// número que ela mostra é o mesmo que o gestor vê e que vale pontos. Errar aqui não
// quebra tela: dá por feita uma visita que não aconteceu (ou esconde uma que aconteceu),
// e isso chega no placar do time.
//
// O que ele protege, e que nenhuma revisão de tela alcança:
//   1. VISITA FEITA = tarefa COMPLETED. A tarefa nasce NOT_STARTED quando a rota é
//      montada; contar toda tarefa do dia daria por feita a visita das 15h às 9h da
//      manhã — defeito real, flagrado na Kelly em 12/08/26;
//   2. o corte de dia é em BRASÍLIA: a visita registrada às 22h não pode cair no dia
//      seguinte só porque o HubSpot devolve UTC;
//   3. Demo/Proposta NÃO conta como avanço (contaria pontos em dobro);
//   4. o nome do restaurante sai do assunto "Visita - <nome>" — é o que liga a linha do
//      dia à conta, sem uma chamada de associação por tarefa;
//   5. a hora do registro só aparece se existir campo de conclusão. Hora inventada é
//      pior que hora ausente;
//   6. os ids de etapa desta lib e os de scripts/fetch-hubspot.js são os MESMOS. São
//      duas cópias (dívida anterior a esta mudança, onze arquivos ao todo); o teste
//      falha se alguém mexer em uma só.
//
// Uso: node scripts/testar-realizado.js   (da raiz do repositório)

const fs = require('fs');
const path = require('path');
const R = require('../lib/realizado.js');

let ok = 0;
const falhas = [];
const eIgual = (rotulo, veio, esperado) => {
  const a = JSON.stringify(veio), b = JSON.stringify(esperado);
  if (a === b) { ok++; return; }
  falhas.push(rotulo + ': esperava ' + b + ', veio ' + a);
};

/* ── o HubSpot de mentira ───────────────────────────────────────────────────────────────
   Devolve o que foi programado por tipo de objeto e registra os corpos recebidos, para o
   teste poder afirmar coisas sobre a CONSULTA (a janela de data, o filtro de dono) e não
   só sobre o resultado. */
function stub(porTipo) {
  const chamadas = [];
  const hsSearch = async (tipo, body) => {
    chamadas.push({ tipo, body });
    return porTipo[tipo] || { results: [] };
  };
  return { hsSearch, chamadas };
}

const T = (id, assunto, status, tsPrevisto, tsConclusao, corpo, tsCriacao) => ({
  id, properties: {
    hs_task_subject: assunto, hs_task_status: status, hs_timestamp: tsPrevisto,
    hs_task_completion_date: tsConclusao || null, hs_task_body: corpo || '',
    /* por padrão a tarefa nasceu no mesmo dia — o caso interessante (criada ontem) é
       passado explicitamente nos testes que tratam dele. */
    hs_createdate: tsCriacao || tsPrevisto
  }
});
/* 01/09/2026, horário de Brasília, em ISO UTC (Brasília = UTC−3) */
const UTC = (h, m) => '2026-09-01T' + String(h + 3).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00.000Z';

(async () => {
  /* ── 1. visita feita é COMPLETED, e só ela ──────────────────────────────────────── */
  {
    const { hsSearch, chamadas } = stub({
      tasks: { results: [
        T('1', 'Visita - Nikô Ba', 'COMPLETED', UTC(9, 40), UTC(9, 52)),
        T('2', 'Visita - Lá Barra Parrilla', 'NOT_STARTED', UTC(15, 30)),
        T('3', 'Visita - BoxFim', 'NOT_STARTED', UTC(16, 40)),
        T('4', 'Ligar - Aloha', 'COMPLETED', UTC(10, 0), UTC(10, 5))
      ] }
    });
    const r = await R.visitasDoDia(hsSearch, '86100505', '2026-09-01');
    eIgual('só COMPLETED conta como feita', r.total, 1);
    eIgual('a ligação não entra na linha do dia', r.prometidasNaAgenda, 3);
    eIgual('ordem por hora prevista', r.linhas.map(l => l.nome),
      ['Nikô Ba', 'Lá Barra Parrilla', 'BoxFim']);
    eIgual('estado por linha', r.linhas.map(l => l.estado), ['feita', 'fila', 'fila']);
    eIgual('a hora do registro é a da conclusão, não a prevista', r.linhas[0].horaRegistro, '09:52');
    eIgual('hora prevista da feita continua visível', r.linhas[0].horaPrevista, '09:40');
    eIgual('quem está na fila não tem hora de registro', r.linhas[1].horaRegistro, null);
    /* a consulta pergunta pela agenda DO DIA (hs_timestamp), não pela data de criação:
       a visita de hoje pode ter sido marcada ontem no Planejamento */
    const f = chamadas[0].body.filterGroups[0].filters.map(x => x.propertyName).sort();
    eIgual('filtra por dono e pela hora prevista', f, ['hs_timestamp', 'hubspot_owner_id']);
  }

  /* ── 1b. AS DUAS JANELAS: contagem por criação, linha do dia por agenda ─────────────
     Este é o teste do defeito que eu quase introduzi. A tarefa marcada ONTEM para hoje e
     registrada hoje vale ponto pela regra que já existia (COMPLETED + criada no dia). Se
     a contagem passasse a olhar só a agenda, ela continuaria contando; se passasse a olhar
     só a criação, a visita marcada ontem e feita hoje sairia da linha. Os dois lados. */
  {
    const ontem = '2026-08-31T18:00:00.000Z';
    const { hsSearch } = stub({
      tasks: { results: [
        /* marcada hoje, feita hoje: conta ponto e está na linha */
        T('a', 'Visita - Nikô Ba', 'COMPLETED', UTC(9, 40), UTC(9, 52)),
        /* marcada ONTEM para hoje, feita hoje: está na agenda de hoje, mas a criação foi
           ontem — pela regra que vale desde 12/08/26 ela NÃO soma ponto hoje. O ponto dela
           foi contado no dia em que a tarefa nasceu. */
        T('b', 'Visita - Aloha', 'COMPLETED', UTC(11, 0), UTC(11, 20), '', ontem),
        /* avulsa: criada e feita hoje, sem estar na agenda de ninguém (hs_timestamp de
           ontem porque o Expogo registra no ato). Conta ponto E aparece na linha. */
        T('c', 'Visita - Casa de Pelotas', 'COMPLETED', ontem, UTC(13, 5), '', UTC(13, 5)),
        /* marcada ontem, ainda não feita: nem ponto nem linha de hoje */
        T('d', 'Visita - Bonamassa', 'NOT_STARTED', ontem, null, '', ontem)
      ] }
    });
    const r = await R.visitasDoDia(hsSearch, '86100505', '2026-09-01');
    eIgual('ponto só para COMPLETED criada no dia', r.total, 2);
    eIgual('a linha do dia é a união das duas janelas', r.linhas.map(l => l.nome).sort(),
      ['Aloha', 'Casa de Pelotas', 'Nikô Ba']);
    eIgual('a feita marcada ontem aparece, sem ponto',
      r.linhas.filter(l => l.nome === 'Aloha').map(l => [l.estado, l.contaPontos])[0], ['feita', false]);
    eIgual('a avulsa aparece e pontua',
      r.linhas.filter(l => l.nome === 'Casa de Pelotas').map(l => l.contaPontos)[0], true);
    eIgual('a não feita de ontem não entra na linha de hoje',
      r.linhas.some(l => l.nome === 'Bonamassa'), false);
    eIgual('o total é a soma de contaPontos, não de estado feita',
      r.total, r.linhas.filter(l => l.contaPontos).length);
    /* A ORDEM DA AVULSA — foi este teste que achou o defeito. Ela traz hs_timestamp de
       ontem, então ordenar pela hora prevista a jogava para o topo da manhã, antes da
       visita das 09:40. O lugar dela é a hora em que foi registrada: 13:05. */
    eIgual('a linha do dia em ordem de hora que vale hoje', r.linhas.map(l => l.nome),
      ['Nikô Ba', 'Aloha', 'Casa de Pelotas']);
    eIgual('a avulsa não anuncia hora prevista que não é de hoje',
      r.linhas.filter(l => l.nome === 'Casa de Pelotas').map(l => l.horaPrevista)[0], null);
    eIgual('e ela mostra a hora do registro', 
      r.linhas.filter(l => l.nome === 'Casa de Pelotas').map(l => l.horaRegistro)[0], '13:05');
    /* a busca tem que trazer as DUAS janelas, senão uma das duas listas fica incompleta */
    eIgual('dois grupos de filtro (OU no HubSpot)',
      (await (async () => { const { hsSearch: h, chamadas } = stub({ tasks: { results: [] } });
        await R.visitasDoDia(h, '1', '2026-09-01');
        return chamadas[0].body.filterGroups.map(g => g.filters.map(f => f.propertyName).sort()); })()),
      [['hs_timestamp', 'hubspot_owner_id'], ['hs_createdate', 'hubspot_owner_id']]);
  }

  /* ── 1c. os DOIS caminhos dão o mesmo total ────────────────────────────────────────
     visitasFeitasNoDia faz a busca estreita (a do robô, que grava a tabela e vale pontos)
     e visitasDoDia faz a união de duas janelas (a da tela, que precisa da linha do dia).
     São dois caminhos porque têm custos diferentes — mas se derem números diferentes, a
     tela e o banco passam a discordar sobre o dia do executivo, que é exatamente o
     problema que esta lib existe para não ter. */
  {
    const ontem = '2026-08-31T18:00:00.000Z';
    const tarefas = [
      T('a', 'Visita - Nikô Ba', 'COMPLETED', UTC(9, 40), UTC(9, 52)),
      T('b', 'Visita - Aloha', 'COMPLETED', UTC(11, 0), UTC(11, 20), '', ontem),
      T('c', 'Visita - Casa de Pelotas', 'COMPLETED', ontem, UTC(13, 5), '', UTC(13, 5)),
      T('d', 'Visita - Bonamassa', 'NOT_STARTED', UTC(16, 40)),
      T('e', 'Ligar - Don Aguilar', 'COMPLETED', UTC(10, 0), UTC(10, 5))
    ];
    /* a busca estreita do robô só recebe o que casa a janela de CRIAÇÃO — o stub imita
       isso, senão o teste compararia dois universos diferentes de tarefa. */
    const criadasHoje = tarefas.filter(t => R.diaISOBrasilia(t.properties.hs_createdate) === '2026-09-01');
    const largo = stub({ tasks: { results: tarefas } });
    const estreito = stub({ tasks: { results: criadasHoje } });
    const totalDaTela = (await R.visitasDoDia(largo.hsSearch, '1', '2026-09-01')).total;
    const totalDoRobo = await R.visitasFeitasNoDia(estreito.hsSearch, '1', '2026-09-01');
    eIgual('tela e robô contam o mesmo', totalDaTela, totalDoRobo);
    eIgual('e o número é o que a regra manda', totalDoRobo, 2);
    /* a busca do robô continua com UM grupo de filtro: união traria mais linhas para o
       mesmo limite de 100 e poderia truncar a contagem que vale pontos. */
    eIgual('a busca do robô é estreita', estreito.chamadas[0].body.filterGroups.length, 1);
    eIgual('e é pela data de criação',
      estreito.chamadas[0].body.filterGroups[0].filters.map(f => f.propertyName).sort(),
      ['hs_createdate', 'hubspot_owner_id']);
  }

  /* ── 2. o corte de dia é em Brasília ────────────────────────────────────────────── */
  {
    /* 22:30 de Brasília do dia 01 = 01:30 UTC do dia 02. Se o corte fosse em UTC, esta
       visita sairia do dia — e o executivo perderia os pontos que ganhou. */
    const inicio = R.inicioDoDiaBrasiliaMs('2026-09-01');
    const fim = inicio + 86400000;
    const vinteEMeia = new Date('2026-09-02T01:30:00.000Z').getTime();
    eIgual('22h30 de Brasília ainda é o dia 01', vinteEMeia >= inicio && vinteEMeia < fim, true);
    eIgual('a hora exibida é a de Brasília', R.horaBrasilia('2026-09-02T01:30:00.000Z'), '22:30');
    eIgual('e a data também', R.diaISOBrasilia('2026-09-02T01:30:00.000Z'), '2026-09-01');
    /* e o outro lado: 00:30 de Brasília do dia 02 (03:30 UTC) NÃO é do dia 01 */
    const meiaNoiteEMeia = new Date('2026-09-02T03:30:00.000Z').getTime();
    eIgual('00h30 do dia 02 não volta para o dia 01', meiaNoiteEMeia >= fim, true);
  }

  /* ── 3. o nome sai do assunto ───────────────────────────────────────────────────── */
  eIgual('Visita - X', R.nomeDoAssunto('Visita - Nikô Ba'), 'Nikô Ba');
  eIgual('Revisita também', R.nomeDoAssunto('Revisita - Sambô Sushi'), 'Sambô Sushi');
  eIgual('travessão em vez de hífen', R.nomeDoAssunto('Visita – Casa de Pelotas'), 'Casa de Pelotas');
  eIgual('dois pontos', R.nomeDoAssunto('Visita: Don Aguilar'), 'Don Aguilar');
  eIgual('Reunião - X', R.nomeDoAssunto('Reunião - MIDBAR'), 'MIDBAR');
  /* assunto que não segue o padrão volta inteiro: melhor mostrar o assunto do HubSpot do
     que mostrar vazio ou adivinhar onde o nome começa */
  eIgual('assunto fora do padrão volta inteiro', R.nomeDoAssunto('passar no Escritório Bar'), 'passar no Escritório Bar');
  eIgual('nome com hífen no meio não é cortado', R.nomeDoAssunto('Visita - Bar do Zé - Unidade 2'), 'Bar do Zé - Unidade 2');

  /* ── 4. avanços e propostas: Demo/Proposta não conta duas vezes ─────────────────── */
  {
    const D = (id, nome, etapas) => ({ id, properties: Object.assign({ dealname: nome }, etapas) });
    const hoje = '2026-09-01';
    const noDia = '2026-09-01T17:00:00.000Z'; /* 14h de Brasília */
    const ontem = '2026-08-31T17:00:00.000Z';
    const negocios = [
      D('d1', 'Aloha', { ['hs_v2_date_entered_' + R.STAGES_REALIZADO.negociacao]: noDia }),
      D('d2', 'Bonamassa', { ['hs_v2_date_entered_' + R.STAGES_REALIZADO.demoProposta]: noDia }),
      D('d3', 'Don Aguilar', { ['hs_v2_date_entered_' + R.STAGES_REALIZADO.diagnostico]: ontem }),
      /* pulou etapa no mesmo dia: dois avanços, UM nome */
      D('d4', 'Escritório Bar', {
        ['hs_v2_date_entered_' + R.STAGES_REALIZADO.diagnostico]: noDia,
        ['hs_v2_date_entered_' + R.STAGES_REALIZADO.negociacao]: noDia
      })
    ];
    const av = R.avancosDoDia(negocios, hoje);
    const pr = R.propostasDoDia(negocios, hoje);
    eIgual('avanços contam as duas entradas do mesmo negócio', av.total, 3);
    eIgual('mas o nome aparece uma vez só', av.nomes.sort(), ['Aloha', 'Escritório Bar']);
    eIgual('quem entrou ontem não conta hoje', av.nomes.includes('Don Aguilar'), false);
    eIgual('Demo/Proposta é métrica própria', pr.total, 1);
    eIgual('e não entra em avanços', av.nomes.includes('Bonamassa'), false);
  }

  /* ── 5. fechamentos: até AGORA no dia corrente, dia inteiro no dia fechado ──────── */
  {
    const { hsSearch, chamadas } = stub({
      deals: { results: [
        { id: 'g1', properties: { dealname: 'MIDBAR', closedate: UTC(14, 20) } },
        { id: 'g2', properties: { dealname: 'Rede Grande', closedate: UTC(15, 0) } }
      ] }
    });
    const r = await R.fechamentosDoDia(hsSearch, '86100505', '2026-09-01',
      d => nomeDoDeal(d) === 'Rede Grande');
    function nomeDoDeal(d) { return String(((d.properties) || {}).dealname || ''); }
    eIgual('o excluído não entra na conta', r.total, 1);
    eIgual('nome do que fechou', r.nomes, ['MIDBAR']);
    eIgual('hora do fechamento em Brasília', r.horas, ['14:20']);
    const filtros = chamadas[0].body.filterGroups[0].filters;
    const etapas = filtros.find(f => f.propertyName === 'dealstage');
    eIgual('só as duas etapas de ganho', etapas.values,
      [R.STAGES_REALIZADO.ganho1, R.STAGES_REALIZADO.ganho2]);
    /* dia corrente (sem diaISO) não pode contar até a meia-noite: seria contar o futuro */
    const { hsSearch: hs2, chamadas: c2 } = stub({ deals: { results: [] } });
    await R.fechamentosDoDia(hs2, '86100505', null);
    const janela = c2[0].body.filterGroups[0].filters.find(f => f.propertyName === 'closedate');
    const fimDaJanela = Number(janela.highValue);
    eIgual('no dia corrente a janela para agora', fimDaJanela <= Date.now() + 2000, true);
  }

  /* ── 6. o pacote da tela usa os mesmos nomes de campo da tabela dailies ─────────── */
  {
    const { hsSearch } = stub({
      tasks: { results: [T('1', 'Visita - Nikô Ba', 'COMPLETED', UTC(9, 40), UTC(9, 52))] },
      deals: { results: [] }
    });
    const r = await R.realizadoDeHoje(hsSearch, '86100505', { diaISO: '2026-09-01', negocios: [] });
    const campos = Object.keys(r).filter(k => k.startsWith('realizado_')).sort();
    eIgual('os quatro campos com o nome da coluna do banco', campos,
      ['realizado_avancos', 'realizado_fechamentos', 'realizado_propostas', 'realizado_visitas']);
    eIgual('e o detalhe que só a v2 usa vem separado', Object.keys(r.detalhe).sort(),
      ['avancos', 'fechamentos', 'prometidasNaAgenda', 'propostas', 'visitas']);
    eIgual('o número bate com a lista', r.realizado_visitas, r.detalhe.visitas.filter(v => v.estado === 'feita').length);
  }

  /* ── 7. sem dado, zero — e nunca undefined/NaN ──────────────────────────────────── */
  {
    const { hsSearch } = stub({});
    const r = await R.realizadoDeHoje(hsSearch, '86100505', { diaISO: '2026-09-01' });
    eIgual('dia sem nada é zero em tudo',
      [r.realizado_visitas, r.realizado_avancos, r.realizado_propostas, r.realizado_fechamentos],
      [0, 0, 0, 0]);
    eIgual('e a linha do dia é lista vazia, não undefined', Array.isArray(r.detalhe.visitas), true);
  }

  /* ── 8. A GUARDA DAS DUAS CÓPIAS DE ID ─────────────────────────────────────────────
     Os ids de etapa estão nesta lib e em scripts/fetch-hubspot.js (e em mais nove
     arquivos, dívida anterior). Enquanto forem duas cópias, elas têm que ser idênticas —
     e é isto que garante, em vez de um comentário pedindo cuidado. */
  {
    const robo = fs.readFileSync(path.join(__dirname, 'fetch-hubspot.js'), 'utf8');
    const idDoRobo = nome => {
      const m = robo.match(new RegExp('\\b' + nome + ":\\s*'(\\d+)'"));
      return m ? m[1] : null;
    };
    Object.keys(R.STAGES_REALIZADO).forEach(nome => {
      const doRobo = idDoRobo(nome);
      if (!doRobo) { falhas.push('id de etapa "' + nome + '" não encontrado em fetch-hubspot.js — as cópias divergiram'); return; }
      if (doRobo !== R.STAGES_REALIZADO[nome]) {
        falhas.push('id de "' + nome + '" divergiu: lib=' + R.STAGES_REALIZADO[nome] + ' robô=' + doRobo);
        return;
      }
      ok++;
    });
    /* a lista de exclusão também é duas cópias enquanto o robô mantiver a dele */
    R.EXCLUIDOS_IDS.forEach(function (id) {
      if (robo.indexOf(id) < 0) falhas.push('id excluído ' + id + ' não está mais no robô — as listas divergiram');
      else ok++;
    });
    if (robo.indexOf('REALIZADO.ehNegocioExcluido(') < 0) {
      falhas.push('o robô não delega a exclusão — a tela pode creditar fechamento que ele descarta');
    } else ok++;

    const mPipe = robo.match(/PIPELINE_ID\s*=\s*'(\d+)'/);
    if (!mPipe || mPipe[1] !== R.PIPELINE_REALIZADO) {
      falhas.push('PIPELINE_ID divergiu: lib=' + R.PIPELINE_REALIZADO + ' robô=' + (mPipe ? mPipe[1] : 'não achou'));
    } else ok++;
    /* E A DELEGAÇÃO. A primeira versão desta guarda checava se a palavra COMPLETED
       aparecia no robô — e isso passou a ser um sinal falso no momento em que o robô
       passou a delegar: a palavra ficou num comentário e a checagem continuou verde sem
       verificar nada. O que importa afirmar é que o robô NÃO tem a sua própria cópia da
       regra: ele importa a lib e chama a função dela. */
    if (robo.indexOf(String.fromCharCode(39) + '../lib/realizado.js' + String.fromCharCode(39)) < 0) {
      falhas.push('o robô não importa lib/realizado.js — voltou a ter conta própria');
    } else ok++;
    if (robo.indexOf('REALIZADO.visitasFeitasNoDia(') < 0) {
      falhas.push('o robô não chama REALIZADO.visitasFeitasNoDia — a contagem saiu da fonte única');
    } else ok++;
    /* e não pode ter reimplementado o filtro de status em CÓDIGO: comentário pode citar
       COMPLETED (o do robô cita, explicando de onde veio a regra); linha de código que
       filtra hs_task_status por COMPLETED significa que a conta voltou a existir em dois
       lugares. */
    const linhasDeCodigo = robo.split(String.fromCharCode(10))
      .map(function (l) { return l.replace(String.fromCharCode(13), ''); })
      .filter(function (l) {
        const t = l.trim();
        return !(t.indexOf('/*') === 0 || t.indexOf('*') === 0 || t.indexOf('//') === 0);
      });
    if (linhasDeCodigo.some(l => l.indexOf('hs_task_status') >= 0 && l.indexOf('COMPLETED') >= 0)) {
      falhas.push('o robô voltou a filtrar hs_task_status === COMPLETED por conta própria');
    } else ok++;
  }

  if (falhas.length) {
    console.error('FALHAS (' + falhas.length + '):');
    falhas.forEach(f => console.error('  · ' + f));
    process.exit(1);
  }
  console.log('realizado: ' + ok + ' checagens ok.');
})();
