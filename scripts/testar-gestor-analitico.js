#!/usr/bin/env node
/* ============================================================================
   O GESTOR ANALÍTICO — a guarda das regras de confiança do dado (02/09/26)

   Pedido do Julyan: a tela do gestor tem que transformar as ações reais dos executivos
   em diagnóstico, impacto, ação, acompanhamento e desenvolvimento — "sem criar metas,
   scores, previsões, probabilidades, rankings comportamentais ou valores financeiros que
   não existam nas fontes atuais".

   ESTA SUÍTE PROTEGE AS REGRAS QUE NÃO PODEM SER QUEBRADAS SEM AVISO. Ela é offline e
   estática de propósito: não conversa com HubSpot nem Supabase, porque o que ela guarda
   não é o valor de um número — é a DEFINIÇÃO dele. Número errado se vê na tela; definição
   errada se propaga por meses.

   Cada checagem abaixo corresponde a uma frase do pedido, e a maioria nasceu de um erro
   real medido durante a construção (os comentários dizem qual).
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const robo = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8');
const montar = fs.readFileSync(path.join(raiz, 'scripts', 'montar-dados.js'), 'utf8');

/* As checagens de AUSÊNCIA olham CÓDIGO, não comentário: o comentário que explica um
   defeito cita a forma errada, e uma checagem ingênua acusa a própria explicação. Foi o
   que aconteceu duas vezes hoje em outras suítes. */
/* Remove o BLOCO de comentario INTEIRO, nao so as linhas que comecam com marcador: a
   primeira versao filtrava por prefixo e as linhas de CONTINUACAO de um comentario de
   bloco sobreviviam — duas checagens acusaram a propria explicacao que eu havia acabado
   de escrever. Terceira vez que este erro aparece hoje, em suites diferentes. */
const soCodigo = (txt) => String(txt)
  .replace(new RegExp(String.fromCharCode(47,92,42) + String.fromCharCode(91,92,115,92,83,93) + String.fromCharCode(42,63) + String.fromCharCode(92,42,47), "g"), " ")
  .split(String.fromCharCode(10))
  .map(l => (l.charCodeAt(l.length - 1) === 13 ? l.slice(0, -1) : l))
  .filter(l => l.trim().indexOf(String.fromCharCode(47, 47)) !== 0)
  .join(String.fromCharCode(10));
const templateCodigo = soCodigo(template);

let ok = 0;
const falhas = [];
function checar(nome, condicao) {
  if (condicao) { ok++; return; }
  falhas.push(nome);
}

/* ── 1. ESTOQUE NÃO É CONVERSÃO ───────────────────────────────────────────────────────
   A tela já chegou a mostrar "294%" dividindo dois estoques. Conversão só existe por
   turma, com chegaram/avancaram — e isso vive em historicoEtapas. */
checar('conversão existe como historicoEtapas com chegaram/avancaram',
  robo.indexOf('historicoEtapas') > 0 &&
  (robo.indexOf('chegaram') > 0 && robo.indexOf('avancaram') > 0));
checar('o gestor recebe historicoEtapas inteiro',
  montar.indexOf('historicoEtapas: hubspot.historicoEtapas') > 0);
checar('a escada de conversão tem amostra mínima declarada',
  robo.indexOf('minimoDaTurma') > 0 && montar.indexOf('historicoEtapas') > 0);

/* ── 2. DINHEIRO: MRR, COBERTURA E O QUE NÃO SE ESTIMA ──────────────────────────────
   Medido em 02/09/26: 16% dos travados e 9% dos perdidos de 90 dias têm valor_de_mrr.
   Um MRR sem a fração que ele representa é lido como total e engana por onze vezes. */
checar('existe um helper único de MRR do negócio',
  templateCodigo.indexOf('function gxMrrDoLead(') > 0);
checar('o MRR do negócio sai de valor_de_mrr/mrr e NUNCA de amount',
  templateCodigo.indexOf('lead.valor_de_mrr != null ? lead.valor_de_mrr : lead.mrr') > 0 &&
  templateCodigo.indexOf('gxMrrDoLead') > 0 &&
  /* nenhuma leitura de dinheiro do gestor pode ler amount */
  templateCodigo.indexOf('gxDinheiroDoGestor') > 0 &&
  templateCodigo.slice(
    templateCodigo.indexOf('function gxDinheiroDoGestor('),
    templateCodigo.indexOf('function gxDinheiroDoGestor(') + 4200
  ).indexOf('.amount') < 0);
checar('toda leitura de dinheiro carrega cobertura',
  templateCodigo.indexOf('function gxCobertura(') > 0 &&
  templateCodigo.indexOf('cobertura: gxCobertura(') > 0);
checar('sem cobertura o cartão diz NÃO MEDIDO, nunca zero',
  template.indexOf('MRR em risco não medido') > 0 &&
  template.indexOf('is-nao-medido') > 0);
/* A frase "receita perdida" PODE aparecer — negada, na propria explicacao do cartao
   ("e MRR informado, nao receita perdida"). O que nao pode e ela virar ROTULO. A
   primeira versao proibia a frase em qualquer lugar e reprovou a copia correta. */
checar('o rótulo das perdas é MRR INFORMADO e a frase proibida só aparece negada',
  template.indexOf('MRR informado em negócios perdidos') > 0 &&
  template.split('receita perdida').length - 1 ===
    template.split('não receita perdida').length - 1);
checar('o robô agrega MRR de TODOS os perdidos, não só dos exemplos',
  robo.indexOf('totalMrrConhecido') > 0 && robo.indexOf('mrrPorMotivo') > 0 &&
  robo.indexOf('mrrPorOwner') > 0 && robo.indexOf('semMrr') > 0);
checar('negócio afetado por duas evidências conta UMA vez no risco',
  templateCodigo.indexOf('const porId = new Map()') > 0);
checar('nada multiplica perda por ticket médio nem estima receita',
  templateCodigo.indexOf('ticketMedio') < 0 && templateCodigo.indexOf('receitaPotencial') < 0 &&
  templateCodigo.indexOf('receitaEstimada') < 0);

/* ── 3. PLANO NÃO É EXECUÇÃO, E PROMESSA MANUAL NÃO VOLTA ──────────────────────────
   A promessa manual (prometido_visitas) AINDA recebe dado — medido no Supabase em
   02/09/26, 12 de 20 linhas da semana. Ela segue viva para o executivo; o que não pode é
   a leitura do GESTOR medir por ela. Visita comprovada vem de visitasNomesDoOwnerNoDia. */
checar('a fila do gestor não pontua por promessa manual',
  templateCodigo.indexOf('function gxFilaDeIntervencao(') > 0 &&
  templateCodigo.slice(
    templateCodigo.indexOf('function gxFilaDeIntervencao('),
    templateCodigo.indexOf('function gxMrrDoLead(')
  ).indexOf('prometido') < 0);
checar('plano do dia e visita comprovada são coisas diferentes na fila',
  template.indexOf('plano do dia sem fechamento e nenhuma visita comprovada ainda') > 0 &&
  templateCodigo.indexOf('visitasNomesDoOwnerNoDia') > 0);

/* ── 4. CARGA VELHA NÃO VIRA ACUSAÇÃO ──────────────────────────────────────────────── */
checar('sincronização a confirmar é categoria própria, do time e não da pessoa',
  templateCodigo.indexOf("id: 'sync_a_confirmar'") > 0 &&
  template.indexOf('Conferir a carga antes de cobrar o campo') > 0);
checar('a fila declara a hora da carga que está lendo',
  template.indexOf('Carga de ${esc(DATA.hubspotUpdatedAtFmt') > 0);

/* ── 5. A FILA NÃO JULGA PESSOA ──────────────────────────────────────────────────────
   O pedido é explícito: "não rotular pessoas como boas ou ruins. Descrever apenas
   comportamento e evidência". */
checar('a fila diz que a linha é evidência, não nota da pessoa',
  template.indexOf('não uma nota da pessoa') > 0);
checar('nenhuma categoria da fila é adjetivo de pessoa',
  templateCodigo.indexOf('GX_CATEGORIAS') > 0 &&
  templateCodigo.indexOf("rot: 'Executivo ruim'") < 0 &&
  templateCodigo.indexOf('scoreHumano') < 0 && templateCodigo.indexOf('notaGeral') < 0);
checar('as doze categorias permitidas estão declaradas em um lugar só',
  ['sla', 'quente_sem_passo', 'proposta_sem_data', 'followup_vencido', 'visita_sem_desfecho',
    'visita_sem_qualificacao', 'cadencia_quebrada', 'abandono_1o_toque', 'plano_aberto',
    'rota_nao_montada', 'fase_sem_definicao', 'sync_a_confirmar']
    .every(id => templateCodigo.indexOf("id: '" + id + "'") > 0));

/* ── 6. NENHUMA AÇÃO GERA BOTÃO SEM DESTINO ────────────────────────────────────────── */
checar('linha sem destino não entra na fila',
  templateCodigo.indexOf('.filter(l => l.destino)') > 0);
checar('o destino abre pessoa/negócio filtrado, não só troca de aba',
  templateCodigo.indexOf('function gxAbrirDestino(') > 0 &&
  templateCodigo.indexOf('cockpitExecSelecionado = oid') > 0 &&
  templateCodigo.indexOf('renderCockpitDossieInline()') > 0);
checar('trocar de aba usa o botão de aba real, nunca activateTab à mão',
  templateCodigo.indexOf("document.getElementById(destino.view === 'viewRotas' ? 'tabBtnRotas' : 'tabBtnPDIs')") > 0);
checar('o foco por executivo rola até o card e pisca',
  templateCodigo.indexOf('function gxFocarExecutivo(') > 0 &&
  templateCodigo.indexOf('piscarAlvo(alvo)') > 0);

/* ── 7. O NÚMERO DO CARTÃO E O DA LISTA NÃO SE CONTRADIZEM ─────────────────────────
   Erro meu, pego medindo: a legenda dizia "a mesma contagem do cartão" e a lista de risco
   abria com 56 itens enquanto o cartão destaca 16 (os que têm MRR). As duas contagens são
   verdadeiras; afirmar igualdade era o defeito. */
checar('a lista declara as duas contagens, sem afirmar igualdade falsa',
  template.indexOf('com MRR informado</span>') > 0 &&
  templateCodigo.indexOf('a mesma contagem do cartão') < 0);
checar('todo valor de dinheiro abre a lista dos negócios que o compõem',
  templateCodigo.indexOf('function gxAbrirListaDeDinheiro(') > 0 &&
  templateCodigo.indexOf('data-gx-lista') > 0);

/* ── 8. AUSÊNCIA NÃO É ZERO ────────────────────────────────────────────────────────── */
checar('fase de rampagem sem definição é dita, não tratada como zero',
  template.indexOf('sem fase de rampagem definida') > 0 &&
  templateCodigo.indexOf("fase: (ramp && ramp.definido)") > 0 &&
  template.indexOf('não definida') > 0);
checar('cobrar rua respeita a fase de rampagem',
  templateCodigo.indexOf('const naRua = alvoDeCampo == null || alvoDeCampo > 0') > 0);

/* ── 9. O EXECUTIVO NÃO RECEBE DADO DO COLEGA ──────────────────────────────────────── */
checar('os blocos do gestor só desenham para papel manager',
  templateCodigo.indexOf("function renderFilaDeIntervencao() {") > 0 &&
  templateCodigo.indexOf("if (!el || !sessaoAtual || sessaoAtual.role !== 'manager') return;") > 0);
checar('o corte por papel no servidor continua intacto',
  montar.indexOf('function filtrarParaPapel(') > 0 &&
  montar.indexOf('function resumoDeColega(') > 0 &&
  montar.indexOf("if (!usuario || usuario.role === 'manager') return dados;") > 0);

/* ── 10. A FILA É TRIAGEM, NÃO RELATÓRIO ───────────────────────────────────────────
   Medido: uma linha por negócio dava 368 linhas e as 12 primeiras eram DUAS categorias,
   com duas pessoas ocupando nove delas. Agrupada por pessoa+categoria: 46 frentes sobre
   os mesmos 368 casos, e o topo passa a espalhar por pessoa e por tipo de problema. */
checar('a fila agrupa por pessoa+categoria e preserva o volume',
  templateCodigo.indexOf("const k = String(l.ownerId) + '|' + l.categoria") > 0 &&
  templateCodigo.indexOf('casos: 1') > 0);
checar('o cabeçalho publica frentes E casos',
  template.indexOf('frente${linhas.length === 1') > 0 &&
  template.indexOf('casosTotais') > 0);

/* ── resultado ──────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('gestor analítico: ' + ok + ' checagens ok — estoque≠conversão, MRR com cobertura, plano≠execução, evidência sem julgamento e nenhum botão sem destino.');
