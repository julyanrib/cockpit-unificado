// scripts/testar-autorizacao-escrita.js
//
// QUEM PODE ESCREVER NO NEGÓCIO DE QUEM.
//
// POR QUE ESTE ARQUIVO EXISTE (02/09/26, auditoria pedida pelo Julyan: "são rotas
// diferentes, quero auditado")
//
// As cinco ações que escrevem em negócio — mover etapa, nota de campo, tarefa de rota,
// corrigir MRR e confirmar sugestão do gestor — todas checam se quem chamou é o dono. Duas
// pelo guard compartilhado (lib/hubspot-deal-guard.js), três com comparação própria, porque
// nasceram antes dele.
//
// E NADA TESTAVA ISSO. O que existia, testar-porta-acoes.js, prova que cada `op` chega no
// módulo certo e que sem sessão a resposta é 401 — o portão da porta. Mas a regra de DONO,
// que é a que impede um executivo de mexer na carteira do colega, não era verificada em
// nenhum lugar. Uma refatoração podia removê-la de um dos cinco e todas as suítes
// continuariam verdes.
//
// O QUE ESTE ARQUIVO FAZ, EM DOIS NÍVEIS
//
//   1. TESTA A REGRA DE VERDADE. O guard consulta o HubSpot por fetch; aqui o fetch é
//      substituído por um dublê que devolve o negócio que o caso de teste descreve. Então a
//      tabela de decisão é exercitada de fato: rep no negócio do colega recusa, rep no
//      próprio aceita, gestor aceita em qualquer um, negócio de outro pipeline recusa, rep
//      sem owner configurado recusa. Não é leitura de código — é a função decidindo.
//
//   2. GUARDA AS TRÊS QUE NÃO USAM O GUARD. Para elas não há função única para exercitar,
//      então a checagem é estrutural: cada uma tem que comparar o dono com o usuário da
//      sessão e responder 403. Se alguém apagar a comparação, aqui fica vermelho.
//
// O QUE ELE NÃO PROVA, e é honesto dizer: não faz requisição real ao HubSpot nem valida
// sessão real do Supabase. Ele prova a DECISÃO de autorização, não o transporte.

'use strict';

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
let ok = 0;
const falhas = [];
function checar(nome, condicao, dica) {
  if (condicao) { ok += 1; return; }
  falhas.push(nome + (dica ? ': ' + dica : ''));
}

/* ── 1. A TABELA DE DECISÃO DO GUARD, EXERCITADA ──────────────────────────────────── */
const { buscarDealAutorizado, PIPELINE_FIELD_SALES } = require(path.join(raiz, 'lib', 'hubspot-deal-guard.js'));

const fetchOriginal = global.fetch;
function comDealFalso(propriedades, status = 200) {
  global.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ id: '999', properties: propriedades })
  });
}

const REP = { role: 'rep', ownerId: '86100506', email: 'rep@x.com' };
const GESTOR = { role: 'manager', ownerId: '1', email: 'g@x.com' };

async function main() {
  /* rep no negócio DO COLEGA: recusa, e com 403 — não 404 nem 500, porque a pessoa tem que
     entender que o negócio existe e não é dela. */
  comDealFalso({ pipeline: PIPELINE_FIELD_SALES, hubspot_owner_id: '99999999' });
  let r = await buscarDealAutorizado({ token: 't', dealId: '1', usuario: REP });
  checar('rep NÃO escreve no negócio do colega', !!r.erro && r.erro.status === 403,
    'devolveu ' + JSON.stringify(r.erro || r).slice(0, 90));
  checar('e a mensagem diz que o negócio não é dele',
    !!r.erro && /não é seu/.test(r.erro.mensagem || ''),
    'mensagem: ' + ((r.erro && r.erro.mensagem) || '—'));

  /* rep no PRÓPRIO negócio: passa */
  comDealFalso({ pipeline: PIPELINE_FIELD_SALES, hubspot_owner_id: REP.ownerId });
  r = await buscarDealAutorizado({ token: 't', dealId: '1', usuario: REP });
  checar('rep escreve no próprio negócio', !r.erro && r.ownerId === REP.ownerId,
    JSON.stringify(r.erro || { ownerId: r.ownerId }));

  /* gestor: passa em qualquer um — é o desenho, ele cobra o time inteiro */
  comDealFalso({ pipeline: PIPELINE_FIELD_SALES, hubspot_owner_id: '99999999' });
  r = await buscarDealAutorizado({ token: 't', dealId: '1', usuario: GESTOR });
  checar('gestor escreve em qualquer negócio do time', !r.erro, JSON.stringify(r.erro || {}));

  /* OUTRO PIPELINE: recusa mesmo sendo o dono. O Cockpit é do Field Sales; escrever em
     Sucesso ou Inside Sales por esta rota seria mexer em processo de outro time. */
  comDealFalso({ pipeline: '87367429', hubspot_owner_id: REP.ownerId });
  r = await buscarDealAutorizado({ token: 't', dealId: '1', usuario: REP });
  checar('negócio de outro pipeline recusa, mesmo sendo do dono',
    !!r.erro && r.erro.status === 403 && /Field Sales/.test(r.erro.mensagem || ''),
    JSON.stringify(r.erro || {}));
  comDealFalso({ pipeline: '87367429', hubspot_owner_id: '1' });
  r = await buscarDealAutorizado({ token: 't', dealId: '1', usuario: GESTOR });
  checar('e recusa para o gestor também', !!r.erro && r.erro.status === 403,
    JSON.stringify(r.erro || {}));

  /* OWNER AINDA NÃO CONFIGURADO: recusa em vez de passar. Um ownerId 'pendente_' que
     escapasse compararia string com string e poderia bater com o do negócio por acidente. */
  comDealFalso({ pipeline: PIPELINE_FIELD_SALES, hubspot_owner_id: 'pendente_x' });
  r = await buscarDealAutorizado({ token: 't', dealId: '1', usuario: { role: 'rep', ownerId: 'pendente_x' } });
  checar('rep sem owner configurado recusa', !!r.erro && r.erro.status === 403,
    JSON.stringify(r.erro || {}));

  /* PAPEL DESCONHECIDO: recusa antes de qualquer consulta */
  r = await buscarDealAutorizado({ token: 't', dealId: '1', usuario: { role: 'visitante', ownerId: '1' } });
  checar('papel fora de rep/manager recusa', !!r.erro && r.erro.status === 403,
    JSON.stringify(r.erro || {}));

  /* SEM dealId: 400, e sem chamar o HubSpot */
  let chamou = false;
  global.fetch = async () => { chamou = true; return { ok: true, status: 200, json: async () => ({}) }; };
  r = await buscarDealAutorizado({ token: 't', dealId: '', usuario: REP });
  checar('sem dealId recusa com 400 e não consulta o HubSpot',
    !!r.erro && r.erro.status === 400 && !chamou, JSON.stringify(r.erro || {}) + ' chamou=' + chamou);

  /* NEGÓCIO INEXISTENTE: 404 com mensagem própria */
  comDealFalso({}, 404);
  r = await buscarDealAutorizado({ token: 't', dealId: '1', usuario: REP });
  checar('negócio inexistente devolve 404', !!r.erro && r.erro.status === 404,
    JSON.stringify(r.erro || {}));

  global.fetch = fetchOriginal;

  /* ── 2. AS TRÊS QUE NÃO USAM O GUARD ────────────────────────────────────────────── */
  const semGuard = {
    'atualizar-mrr': {
      dono: /role !== 'manager' && String\(p\.hubspot_owner_id\) !== String\(usuario\.ownerId\)/,
      oque: 'compara o dono do negócio no HubSpot com o da sessão'
    },
    'criar-tarefa-rota': {
      dono: /role !== 'manager' && String\(ownerId\) !== String\(usuario\.ownerId\)/,
      oque: 'só cria tarefa para o próprio owner (a parada de rota pode não ter negócio)'
    },
    'confirmar-sugestao-gestor': {
      dono: /souDono = usuario\.role !== 'manager' && String\(usuario\.ownerId\) === donoTarefa/,
      oque: 'confirma só a sugestão que é dele, ou qualquer uma se for gestor'
    }
  };
  Object.entries(semGuard).forEach(([mod, regra]) => {
    const fonte = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', mod + '.js'), 'utf8');
    checar('a regra de dono de ' + mod + ' continua no lugar (' + regra.oque + ')',
      regra.dono.test(fonte),
      'a comparação de dono não foi encontrada — se ela mudou de forma, atualize ESTA regra junto, não apague a checagem');
    checar('e ' + mod + ' responde 403 quando não é dele',
      /status\(403\)/.test(fonte));
  });

  /* as duas que usam o guard continuam usando */
  ['criar-nota-negocio', 'mudar-etapa-negocio'].forEach(mod => {
    const fonte = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', mod + '.js'), 'utf8');
    checar(mod + ' continua passando pelo guard compartilhado',
      /buscarDealAutorizado\(/.test(fonte),
      'sem o guard, este módulo perde de uma vez a checagem de dono E a de pipeline');
  });

  /* ── 3. O QUE A AUDITORIA ENCONTROU E FICA REGISTRADO ───────────────────────────── */
  /* DUAS ROTAS NÃO CHECAM O PIPELINE, e por motivos diferentes:
       criar-tarefa-rota — a parada de rota pode ser um lead de prospecção que ainda não é
         negócio nenhum; exigir pipeline aqui quebraria o caso normal. A proteção dela é
         outra: só cria para o próprio owner.
       confirmar-sugestao-gestor — opera sobre uma TAREFA, não sobre o negócio, e a tarefa
         não carrega pipeline. A proteção é o dono da tarefa.
     Isto está aqui escrito para a próxima pessoa não "consertar" adicionando uma checagem
     que quebraria o fluxo — e para, se um dia a proteção real mudar, este comentário
     aparecer no diff. */
  ['criar-tarefa-rota', 'confirmar-sugestao-gestor'].forEach(mod => {
    const fonte = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', mod + '.js'), 'utf8');
    checar(mod + ' protege por dono, já que não tem pipeline para checar',
      /usuario\.ownerId/.test(fonte) && /403/.test(fonte));
  });

  /* ══ AS QUATRO ACOES DA DAILY (03/09/26, prancha §4) ══════════════════════════════
     O painel de acao da rodada grava de verdade em quatro caminhos, e o que esta suite
     guarda e que nenhum deles invente uma porta nova nem confie no cliente:

     · datar tarefa e sugerir troca passam pela PORTA UNICA /api/negocio-acao, onde a
       regra de dono do lib/hubspot-deal-guard.js ja e aplicada. Chamar o HubSpot direto
       do navegador exporia o token e pularia a guarda.
     · cobranca e reconhecimento gravam em public.registros_rodada, cuja policy de INSERT
       exige role=manager E gestor_email = auth.email(). Testado no banco com JWT
       simulado e rollback: gestor insere, rep e bloqueado, o dono le o registro sobre
       ele, outro rep nao le.
     · e o sucesso e declarado por EVIDENCIA (.select() e a linha ter voltado), nao por
       ausencia de erro — o stub do preview local devolve { data: [], error: null } sem
       chamar a rede, e a tela chegou a escrever "registrado" com a tabela vazia. */
  const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
  checar('datar tarefa passa pela porta unica, com data e tipoAcao de proximo passo',
    /daily-datar-tarefa/.test(tpl) && /op: 'nota', dealId: dealId/.test(tpl)
      && /tipoAcao: 'proximo-passo'/.test(tpl));
  checar('sugerir troca usa tarefa-rota com sugeridoPorGestor, que e o marcador do ◆',
    /op: 'tarefa-rota'/.test(tpl) && /sugeridoPorGestor: true/.test(tpl));
  checar('as duas escritas do HubSpot NAO montam URL do HubSpot no navegador',
    !/api\.hubapi\.com/.test(tpl.slice(tpl.indexOf('daily-datar-tarefa') - 3000, tpl.indexOf('daily-datar-tarefa') + 3000)));
  checar('cobranca e reconhecimento gravam em registros_rodada assinando com a sessao',
    /from\('registros_rodada'\)/.test(tpl) && /gestor_email: email/.test(tpl)
      && /sessaoAtual && sessaoAtual\.email/.test(tpl));
  checar('a escrita e idempotente pelo onConflict do UNIQUE (tipo, owner, dia)',
    /onConflict: 'tipo,owner_id,data'/.test(tpl));
  checar('sucesso por evidencia: pede a linha de volta e exige que ela venha',
    /\.select\('id'\)/.test(tpl) && /não devolveu a linha gravada/.test(tpl));
  checar('o desfazer tambem exige evidencia do que apagou',
    /não havia registro para desfazer/.test(tpl));
  checar('a falha vai para a tela, nunca ✓ silencioso',
    /não gravou: /.test(tpl));

  if (falhas.length) {
    console.error('FALHAS (' + falhas.length + '):');
    falhas.forEach(f => console.error('  · ' + f));
    process.exit(1);
  }
  console.log('autorização de escrita: ' + ok + ' checagens ok — rep não toca no negócio do colega, '
    + 'gestor toca no time, outro pipeline recusa, as cinco ações mantêm a regra de dono, '
    + 'e as quatro ações da Daily gravam pela porta única ou na tabela só-gestor, por evidência.');
}

main().catch(e => { console.error('erro na suíte:', e); process.exit(1); });
