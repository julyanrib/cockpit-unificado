// api/criar-tarefa-rota.js
// Função serverless da Vercel — mesma arquitetura do criar-negocio.js: o navegador
// nunca conhece o HUBSPOT_TOKEN; manda só os dados da conta-alvo + o token de sessão
// do Supabase, e esta rota valida tudo antes de escrever no HubSpot.
//
// Objetivo (Julyan, 08/08/26): quando o executivo adiciona uma conta-alvo à rota do
// dia (mapa da aba Rota & Agenda), a visita PRECISA aparecer sozinha na Agenda — sem
// depender de ele também marcar no Expogo. Esta rota cria uma TAREFA no HubSpot com
// o mesmo formato que o Expogo já usa ("Visita - <restaurante>"), reaproveitando 100%
// do reconhecimento que já existe: fetch-hubspot.js, agendaTipoDoTexto (Agenda) e
// visitasTarefasHojeByOwner (contagem da Daily) já sabem ler esse padrão — nenhuma
// lógica nova de leitura foi criada, só a escrita.
//
// Variáveis de ambiente na Vercel (as mesmas já usadas pelo criar-negocio.js):
//   HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY

// usuarios.json vai junto no deploy (require com caminho estático é empacotado pela Vercel).
let USUARIOS = [];
try {
  const raw = require('../../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  // FAIL-CLOSED (mesmo padrão do criar-negocio.js): sem as três variáveis de ambiente
  // a rota se recusa a operar, em vez de pular a checagem de sessão.
  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão Supabase válida ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. papel de quem chamou ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  // ---- 3. dados da conta-alvo ----
  const { nome, ownerId, bairro, cidade, horaPrevista, data, acao } = req.body || {};
  if (!nome || !ownerId) return res.status(400).json({ erro: 'Faltam campos obrigatórios: nome e ownerId.' });
  const acaoNormalizada = String(acao || 'criar');
  if (!['criar', 'remover'].includes(acaoNormalizada)) return res.status(400).json({ erro: 'Ação inválida.' });

  // Escopo por papel: executivo só cria tarefa pra si mesmo; gestor pode criar pra
  // qualquer um do time (ex.: montando a rota de alguém junto no 1:1).
  if (usuario.role !== 'manager' && String(ownerId) !== String(usuario.ownerId)) {
    return res.status(403).json({ erro: 'Executivo só pode adicionar visita à própria rota — peça ao gestor para atribuir a outro dono.' });
  }

  // BLOCO 34 (13/08/26) — Julyan: "a agenda do executivo sempre tem que estar
  // preenchida, com follows e reuniões" + "o gestor pode adicionar leads nessa agenda".
  // Duas peças novas, sem mexer no contrato existente (tipo e sugeridoPorGestor são
  // opcionais; quem já chama esta rota sem eles continua recebendo "Visita - X" normal):
  //
  // 1) `tipo`: 'visita' (padrão, mantém "Visita - X") ou 'reuniao' ("Reunião - X").
  //    O prefixo é tudo que o resto do cockpit precisa — agendaTipoDoTexto já classifica
  //    por esse padrão (nenhuma lógica nova de leitura, só a escrita, mesma régua do
  //    comentário no topo deste arquivo).
  //
  // 2) `sugeridoPorGestor`: só tem efeito quando quem chama é o PRÓPRIO gestor (nunca
  //    confie em flag mandada pelo navegador sozinha — settei's aceitas aqui vêm do
  //    `usuario.role` já validado acima, não do body). Grava um marcador de MÁQUINA na
  //    primeira linha do corpo da tarefa: "SUGESTAO_GESTOR:<nome do gestor>:PENDENTE".
  //    Corpo, não assunto — o assunto "Reunião - X"/"Visita - X" tem que continuar
  //    batendo com AGENDA_RE_TITULO/agendaTipoDoTexto sem alteração nenhuma; o próprio
  //    comentário acima já avisa: mexer no PREFIXO do assunto quebra esse parsing em
  //    cadeia (agendaNomeDoLead, contagem da Daily, tudo). O corpo é lido à parte
  //    (campo `obs` do evento) e nunca participa dessas regras.
  const TIPOS_VALIDOS = { visita: 'Visita', reuniao: 'Reunião' };
  // CORREÇÃO (17/08/26, bug real em produção: tarefa criada como "undefined - FARTOS"
  // no HubSpot, hs_task_subject sujo desde a origem) — a lógica anterior
  // (`TIPOS_VALIDOS[String(...)] ? ... : 'visita'`) dependia de uma cadeia de
  // truthy/falsy fácil de escapar. Reescrita como comparação direta e explícita:
  // só vira 'reuniao' se o body pedir exatamente isso, senão é sempre 'visita'.
  // Impossível de resultar em undefined — não existe terceiro valor possível.
  const tipoPedido = (req.body && req.body.tipo === 'reuniao') ? 'reuniao' : 'visita';

  // DE QUE TELA VEIO. A prosa dizia "Rota & Agenda" para TODAS as origens — inclusive
  // para a visita posta na semana pelo Planejamento, que e de onde vem a maior parte
  // delas hoje. Frase cravada que mente e pior do que frase ausente: quem le a tarefa no
  // HubSpot procura no lugar errado. Lista fechada porque a origem e MEDIDA depois.
  const ORIGEM_ROTULO = {
    planejamento: 'visita posta na semana pelo Planejamento do Cockpit.',
    daily: 'visita posta no dia pela Minha Daily do Cockpit.',
    mapa: 'conta-alvo adicionada a rota pelo mapa do Cockpit.',
    cockpit: 'conta-alvo adicionada a rota do dia pelo Cockpit (Rota & Agenda).'
  };
  const origem = (req.body && ORIGEM_ROTULO[req.body.origem]) ? req.body.origem : 'cockpit';
  // O ELO COM O NEGOCIO. Aceita so digitos: id do HubSpot e numerico, e qualquer outra
  // coisa aqui e ruido do navegador entrando num campo que um robo vai ler.
  const dealId = (req.body && /^[0-9]+$/.test(String(req.body.dealId || ''))) ? String(req.body.dealId) : '';
  const prefixoAssunto = TIPOS_VALIDOS[tipoPedido];
  const sugeridoPorGestor = !!(req.body && req.body.sugeridoPorGestor) && usuario.role === 'manager';

  // hs_timestamp em horário de Brasília: usa a hora prevista se veio (ex.: "14:30"),
  // senão 09:00 — mesma convenção de "compromisso do dia" usada no resto do cockpit.
  const agoraBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
  // `data` (YYYY-MM-DD) permite agendar num dia FUTURO — é o que faz o preenchimento de
  // buraco da semana funcionar. Sem ela, tudo cairia em hoje e o executivo veria a
  // quarta-feira continuar vazia depois de agendar nela.
  // Validação estrita: formato errado vira "hoje" em silêncio, e um dia inteiro de
  // planejamento iria pro lugar errado sem ninguém perceber.
  let alvoAno = agoraBRT.getUTCFullYear(), alvoMes = agoraBRT.getUTCMonth(), alvoDia = agoraBRT.getUTCDate();
  if (data != null) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data).trim());
    if (!m) return res.status(400).json({ erro: 'Campo "data" deve estar no formato AAAA-MM-DD.' });
    alvoAno = Number(m[1]); alvoMes = Number(m[2]) - 1; alvoDia = Number(m[3]);
    const teste = new Date(Date.UTC(alvoAno, alvoMes, alvoDia));
    if (teste.getUTCFullYear() !== alvoAno || teste.getUTCMonth() !== alvoMes || teste.getUTCDate() !== alvoDia) {
      return res.status(400).json({ erro: 'Data inválida.' });
    }
  }
  const [hh, mm] = (horaPrevista || '09:00').split(':').map(Number);
  const dataTarefaMs = Date.UTC(alvoAno, alvoMes, alvoDia, (hh || 9) + 3, mm || 0, 0);
  // AS MESMAS TRES VARIAVEIS que montaram o timestamp acima, em texto, para o marcador
  // de maquina do corpo. Derivar de `dataTarefaMs` obrigaria a desfazer o +3 do fuso, e
  // e assim que a data do marcador passaria a discordar da data da tarefa na virada do
  // dia. Um calculo, duas saidas.
  const do2 = (v) => String(v).padStart(2, '0');
  const diaDaTarefaISO = `${alvoAno}-${do2(alvoMes + 1)}-${do2(alvoDia)}`;
  const horaDaTarefa = `${do2(hh || 9)}:${do2(mm || 0)}`;

  const corpo = [
    // Marcador de máquina SEMPRE na primeira linha, quando existe — confirmar-sugestao-
    // gestor.js e o front (extrairSugestaoGestor) leem só a linha 0, nunca fazem regex
    // no corpo inteiro. `usuario.nome` é o nome de quem está logado (o gestor real, não
    // o texto que o navegador mandou), então não dá pra forjar "sugestão de outro gestor".
    sugeridoPorGestor ? `SUGESTAO_GESTOR:${usuario.nome || 'Gestor'}:PENDENTE` : null,
    (bairro || cidade) ? `Endereço: ${[bairro, cidade].filter(Boolean).join(', ')}` : null,
    sugeridoPorGestor
      ? `Origem: ${prefixoAssunto.toLowerCase()} sugerida por ${usuario.nome || 'seu gestor'} pelo Cockpit — aguardando sua confirmação.`
      : `Origem: ${ORIGEM_ROTULO[origem]}`,

    // ══ O MARCADOR DE MAQUINA (11/09/26) ═══════════════════════════════════════════
    // Julyan: o PWA puxa do HubSpot, entao o que o Cockpit planeja tem de estar LEGIVEL
    // la — nao so em prosa. Esta linha e a unica coisa neste corpo escrita para maquina;
    // o resto e para gente.
    //
    // FORMATO, fixo e versionado:
    //   COCKPIT:PLANO:v1:<ownerId>:<AAAA-MM-DD>:<HH:MM>:<visita|reuniao>:<origem>:<dealId|->
    //
    // A VERSAO E O PRIMEIRO CAMPO de proposito: quem le do outro lado ancora nela e
    // ignora linha de versao que nao conhece, em vez de quebrar quando um campo entrar.
    // O dealId e o que fecha o elo que nao existe no objeto: a tarefa NAO e associada a
    // negocio nenhum (zero chamada a /associations aqui), entao sem ele o leitor recebe
    // um nome em texto e tem de adivinhar de que negocio se trata.
    // `-` quando nao ha negocio ainda (conta de prospeccao agendada antes de virar
    // negocio) — campo vazio some no split e desloca todos os que vem depois.
    // A DATA E A HORA SAO AS DA TAREFA, reconstruidas dos mesmos numeros que montaram o
    // hs_timestamp logo acima: quem le nao precisa converter fuso para saber que dia do
    // plano e este, e um eventual desencontro entre os dois aparece na hora.
    `COCKPIT:PLANO:v1:${ownerId}:${diaDaTarefaISO}:${horaDaTarefa}:${tipoPedido}:${origem}:${dealId || '-'}`
  ].filter(Boolean).join('\n');

  // REAGENDAMENTO SEM DUPLICAR (Bloco L, 11/08):
  // Quando o executivo clica em "Gerar rota", as paradas são reordenadas por
  // proximidade — e o horário que a tarefa recebeu na ordem de CLIQUE deixa de valer.
  // Reenviar sem checar criaria uma segunda "Visita - Fulano" no mesmo dia, e o HubSpot
  // dele viraria lixo em uma semana. Então: procura uma tarefa em aberto com o mesmo
  // assunto, do mesmo dono, HOJE. Se existe, só move o horário (PATCH). Se não, cria.
  //
  // A busca filtra por dono + janela do dia + status, e o assunto é comparado aqui no
  // servidor em vez de virar filtro: `hs_task_subject` nem sempre é pesquisável por
  // igualdade dependendo do portal, e falhar essa busca faria voltar a duplicar.
  const inicioDiaMs = Date.UTC(alvoAno, alvoMes, alvoDia, 3, 0, 0);
  const fimDiaMs = inicioDiaMs + 24 * 60 * 60 * 1000;
  // BLOCO 34 — dedup por assunto continua funcionando igual: "Reunião - X" nunca
  // colide com "Visita - X" da mesma conta, então marcar as duas cotas (visita do dia +
  // reunião do dia) no mesmo lead não gera falso reagendamento de uma virando a outra.
  const assunto = `${prefixoAssunto} - ${nome}`;
  let idExistente = null;
  // DIAGNÓSTICO (11/08): a busca falhando em silêncio esconde duas coisas — que o
  // reagendamento não vai funcionar, e que reenviar a rota vai DUPLICAR tarefa. Agora
  // ela reporta, mesmo quando a criação dá certo.
  let buscaFalhou = null;
  try {
    const busca = await fetch('https://api.hubapi.com/crm/v3/objects/tasks/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [{ filters: [
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(ownerId) },
          { propertyName: 'hs_task_status', operator: 'EQ', value: 'NOT_STARTED' },
          { propertyName: 'hs_timestamp', operator: 'BETWEEN', value: String(inicioDiaMs), highValue: String(fimDiaMs) }
        ] }],
        properties: ['hs_task_subject', 'hs_timestamp'],
        limit: 100
      })
    });
    if (!busca.ok) {
      const det = await busca.json().catch(() => ({}));
      buscaFalhou = 'HTTP ' + busca.status + (det && det.message ? ' — ' + String(det.message).slice(0, 140) : '');
    }
    if (busca.ok) {
      const achados = await busca.json();
      const igual = (achados.results || []).find(t =>
        String((t.properties || {}).hs_task_subject || '').trim().toLowerCase() === assunto.trim().toLowerCase());
      if (igual) idExistente = igual.id;
    }
  } catch (e) { buscaFalhou = 'excecao: ' + String(e.message || e).slice(0, 80); }

  // Tirar do plano no Cockpit precisa tirar a tarefa aberta correspondente do
  // HubSpot também. Tarefa concluída não entra na busca acima e nunca é apagada:
  // realizado é histórico, não seleção de rota.
  if (acaoNormalizada === 'remover') {
    if (buscaFalhou) return res.status(502).json({ etapa: 'busca_remocao', erro: 'Não foi possível confirmar no HubSpot qual tarefa deve ser removida: ' + buscaFalhou });
    if (!idExistente) return res.status(200).json({ ok: true, removida: false, inexistente: true, buscaFalhou });
    try {
      const del = await fetch(`https://api.hubapi.com/crm/v3/objects/tasks/${idExistente}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (!del.ok) {
        const det = await del.json().catch(() => ({}));
        return res.status(del.status).json({ etapa: 'remocao', erro: 'HubSpot recusou remover a tarefa: ' + (det.message || 'sem mensagem'), detalhe: det });
      }
      return res.status(200).json({ ok: true, removida: true, id: idExistente, buscaFalhou });
    } catch (e) {
      return res.status(500).json({ etapa: 'remocao', erro: 'Falha ao remover a tarefa no HubSpot: ' + String(e.message || e) });
    }
  }

  // BUG REAL ENCONTRADO E CORRIGIDO (15/08/26): quando a busca de duplicidade falhava
  // (buscaFalhou setado), a remoção já bloqueava corretamente (linha acima), mas a
  // CRIAÇÃO seguia em frente mesmo assim — idExistente ficava null (porque a busca
  // nem rodou), caía direto no ramo de criação e duplicava a tarefa no HubSpot toda
  // vez que a Search API falhasse. Regra do prompt: "se a consulta de duplicidade
  // falhar, não criar uma nova tarefa" — agora aplicada nos dois caminhos, não só na
  // remoção.
  if (buscaFalhou) {
    return res.status(502).json({
      etapa: 'busca_duplicata', buscaFalhou,
      erro: 'Não foi possível confirmar no HubSpot se já existe uma tarefa igual hoje: ' + buscaFalhou + '. Não criei para evitar duplicidade — tente de novo.'
    });
  }

  /* ══ A TAREFA NA TIMELINE DO NEGÓCIO (11/09/26) ═══════════════════════════════════
     Julyan: "associa a tarefa ao negócio tbm". Antes disto o objeto nascia solto — zero
     associação — e a visita planejada não aparecia na ficha do negócio no HubSpot.

     `task_to_deal` é o tipo padrão documentado da associação básica v3, o mesmo estilo
     que api/criar-negocio.js já usa para deal_to_company e deal_to_contact. Não é id
     numérico de label customizado: label é configuração do portal, e configuração do
     HubSpot não se toca daqui.

     BEST-EFFORT, MAS NUNCA SILENCIOSA: a tarefa já existe e é válida mesmo se a
     associação falhar — o executivo vê o compromisso na Agenda de qualquer forma. Mas a
     falha volta no corpo da resposta, porque associação que some calada dá no mesmo que
     não existir, só que descoberta tarde (foi assim que negócio chegou em Ag. Pagamento
     sem contato e a cobrança do Asaas falhou depois do cliente assinar).

     IDEMPOTENTE: PUT na mesma associação duas vezes não duplica. É o que faz o
     reagendamento consertar tarefa antiga que nasceu sem vínculo, sem varredura. */
  async function associarAoNegocio(taskId) {
    if (!taskId || !dealId) return null;
    try {
      const r = await fetch(
        `https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(String(taskId))}`
          + `/associations/deals/${encodeURIComponent(dealId)}/task_to_deal`,
        { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) return 'HTTP ' + r.status + ' ao associar a tarefa ao negócio ' + dealId;
      return null;
    } catch (e) {
      return 'exceção ao associar a tarefa ao negócio: ' + String(e.message || e);
    }
  }

  if (idExistente) {
    try {
      const resp = await fetch(`https://api.hubapi.com/crm/v3/objects/tasks/${idExistente}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { hs_timestamp: String(dataTarefaMs) } })
      });
      const data = await resp.json();
      if (!resp.ok) {
        return res.status(resp.status).json({
          etapa: 'reagendamento', httpHubspot: resp.status,
          erro: 'Reagendamento recusado pelo HubSpot: ' + (data.message || 'sem mensagem'), detalhe: data
        });
      }
      /* A tarefa reagendada pode ser ANTERIOR a esta mudança, e aí nasceu sem vínculo
         nenhum. O PUT idempotente conserta em silêncio o que dá para consertar. */
      const assocFalhou = await associarAoNegocio(idExistente);
      return res.status(200).json({
        ok: true, id: idExistente, reagendada: true, buscaFalhou: buscaFalhou,
        associadaAoNegocio: !!dealId && !assocFalhou,
        associacaoFalhou: assocFalhou,
        url: `https://app.hubspot.com/contacts/24373118/record/0-27/${idExistente}`
      });
    } catch (e) {
      return res.status(500).json({ etapa: 'reagendamento', erro: 'Falha ao reagendar no HubSpot: ' + String(e.message || e) });
    }
  }

  try {
    const resp = await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          hs_task_subject: assunto,
          hs_task_body: corpo,
          hs_task_status: 'NOT_STARTED',
          hs_task_type: 'TODO',
          hs_timestamp: String(dataTarefaMs),
          hubspot_owner_id: String(ownerId)
        }
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({
        etapa: 'criacao', httpHubspot: resp.status,
        erro: 'Criação recusada pelo HubSpot: ' + (data.message || 'sem mensagem'),
        buscaFalhou: buscaFalhou, detalhe: data
      });
    }
    const assocFalhou = await associarAoNegocio(data.id);
    return res.status(200).json({
      ok: true, id: data.id, reagendada: false, buscaFalhou: buscaFalhou,
      associadaAoNegocio: !!dealId && !assocFalhou,
      associacaoFalhou: assocFalhou,
      url: `https://app.hubspot.com/contacts/24373118/record/0-27/${data.id}`
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};
