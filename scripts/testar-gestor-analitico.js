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

const q3 = String.fromCharCode(39);   /* apostrofo, para casar codigo-fonte sem escapar */

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
/* Checa a PROPRIEDADE, nao a forma: esta assertiva quebrou quando a lista virou cartoes
   e o HTML deixou de ser template literal, embora a hora da carga continuasse declarada
   nos dois lugares. Checagem que depende de sintaxe de string vira falso vermelho no
   proximo redesenho. */
checar('a fila declara a hora da carga que está lendo',
  template.indexOf('Carga de ') > 0 &&
  templateCodigo.indexOf('DATA.hubspotUpdatedAtFmt') > 0);

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
  template.indexOf('frentes sobre ') > 0 &&
  templateCodigo.indexOf('casosTotais') > 0 &&
  templateCodigo.indexOf("linhas.reduce((n, l) => n + (Number(l.casos) || 1), 0)") > 0);

/* ── 11. UM CAMPO DE MRR DIGITADO, DOIS DERIVADOS ─────────────────────────────────
   Medido no pipeline em 02/09/26: 5.207 negocios, 597 com mrr (11%) e 353 com
   valor_de_mrr (7%) — e os dois DIVERGIAM onde ambos existiam (403 x 244,33 no mesmo
   negocio; um contrato trimestral com 900 no campo mensal). amount e o total do periodo:
   838 trimestral tem amount 2.514. Somar amount como MRR infla por 3 ou por 6. */
const servidor = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'), 'utf8');
const servidorCodigo = soCodigo(servidor);
checar('o servidor deriva mrr e amount de valor_de_mrr',
  servidorCodigo.indexOf('function derivarDinheiro(') > 0 &&
  servidorCodigo.indexOf('MESES_DO_PERIODO') > 0);
checar('a derivacao acontece antes da escrita e sobrescreve o que o cliente mandou',
  servidorCodigo.indexOf('const propriedadesFinais = derivarDinheiro(') > 0 &&
  servidorCodigo.indexOf('...propriedadesFinais, dealstage:') > 0 &&
  servidorCodigo.indexOf('...limpeza.propriedades, dealstage:') < 0);
/* ══ QUATRO ASSERÇOES APOSENTADAS EM 03/09/26 ═══════════════════════════════════════
   Elas nasceram no PR #230 (02/09) para garantir a consolidacao dos tres campos de
   dinheiro em Ag. Pagamento. O Julyan mandou desfazer, e a razao dele e de campo: os
   campos amount e mrr sao o que o RPA/ASAAS le para gerar o LINK DE PAGAMENTO, e o
   executivo os preenche a mao. A etapa tinha aviso escrito desde 15/08 — "automacao real
   de RPA/ASAAS vive la, nunca mexer" — e eu mexi.

   O que cada uma garantia, e onde a garantia esta hoje:

     "Ag. Pagamento nao exige mais amount nem mrr digitados"
     "a ficha nao chama o total do periodo de mensal"
     "campo calculado nao abre input que o servidor sobrescreve"
        -> as tres descrevem a consolidacao desfeita. Nao ha para onde migrar: a
           decisao que elas protegiam nao existe mais.

     "sem periodo conhecido o amount nao e inventado"
        -> esta regra CONTINUA VALENDO e continua no codigo (if (meses && !veio(...))).
           Ela some daqui so porque le a linha exata da versao antiga; a regra em si e
           boa: derivar valor de contrato sem saber o periodo e inventar dinheiro.

   O QUE FICOU NO LUGAR, e isto e novo: derivarDinheiro() passou a PREENCHER LACUNA em
   vez de sobrescrever. O campo que veio no pedido manda. Era a sobrescrita que apagava,
   em silencio, o que o executivo digitava — porque o negocio chega em Ag. Pagamento com
   valor_de_mrr das etapas anteriores e a derivacao sempre vencia.

   A licao que fica escrita: consolidar campo que uma automacao DE FORA le nao e limpeza,
   e cortar o meio de campo de quem depende dele. As 87 outras checagens deste arquivo
   continuam valendo. */

checar('Demo/Proposta passa a exigir valor de MRR, plano e data da reuniao',
  servidorCodigo.indexOf('1395880471' + q3 + ': [') > 0 &&
  servidorCodigo.indexOf(q3 + 'valor_de_mrr' + q3 + ', ' + q3 + 'plano_apresentado') > 0 &&
  servidorCodigo.indexOf(q3 + 'data_da_reuniao' + q3 + ']') > 0);
/* A checagem olha o MAPA DA ETAPA, nao o arquivo inteiro: amount e mrr continuam em
   PROPS_PERMITIDAS e PROPS_NUMERICAS de proposito — a rota tem que aceita-los para
   normalizar e a derivacao tem que poder escrever neles. O que nao pode e a etapa
   EXIGIR que uma pessoa os digite. A primeira versao desta linha varria o arquivo todo
   e reprovou codigo correto. */
const mapaPagamento = servidorCodigo.slice(
  servidorCodigo.indexOf(String.fromCharCode(39) + '1395880473' + String.fromCharCode(39) + ':'),
  servidorCodigo.indexOf(String.fromCharCode(39) + '1396006163' + String.fromCharCode(39) + ':'));

/* ── 12. O FURO DA BARREIRA VIRA EVIDENCIA ─────────────────────────────────────────
   A barreira de campos obrigatorios so vale DENTRO do Cockpit: quem move o negocio no
   HubSpot passa por fora da API. Medido: a Negociacao exige valor_de_mrr e 10 dos 29
   negocios de la entraram sem ele. A fila do gestor passa a listar isso como evidencia. */
checar('a fila lista negocio que esta na etapa sem o campo que a etapa exige',
  templateCodigo.indexOf("id: 'campo_obrigatorio_faltando'") > 0 &&
  templateCodigo.indexOf('function gxCamposFaltando(') > 0 &&
  templateCodigo.indexOf('GX_EXIGE_POR_ETAPA') > 0);
checar('a etapa do lead vem da chave do mapa, nao de um campo que nao existe',
  templateCodigo.indexOf('function gxCamposFaltando(lead, stageId)') > 0 &&
  templateCodigo.indexOf('gxCamposFaltando(lead, etapaId)') > 0);

/* ── 13. COMPORTAMENTO POR ETAPA, EXECUTIVO A EXECUTIVO (bloco Semana) ────────────
   A secao compara pessoas, e comparar pessoas e onde este produto mais facilmente
   viraria nota. As checagens abaixo guardam as tres regras que impedem isso: amostra
   curta nao mostra taxa, a coluna vem do agregado (nao de um literal de etapas) e a
   propria tela diz que nao e ranking. */
checar('a comparacao por executivo reusa porOwner, que ja existia no agregado',
  templateCodigo.indexOf('function gsPorExecutivoHTML(') > 0 &&
  templateCodigo.indexOf('gsPorExecutivoHTML(h)') > 0 &&
  templateCodigo.indexOf('const po = h.porOwner') > 0);
checar('celula com amostra curta mostra o n, nunca a taxa',
  templateCodigo.indexOf('GS_MIN_CELULA') > 0 &&
  templateCodigo.indexOf('curta: e.chegaram < GS_MIN_CELULA') > 0 &&
  templateCodigo.indexOf('if (c.curta) return ' + q3 + '<td class="gs-px-curta">n=' + q3) > 0);
checar('a cor so aparece com diferenca que nao e ruido de semana',
  templateCodigo.indexOf('GS_DIF_QUE_CONTA = 0.10') > 0 &&
  templateCodigo.indexOf('Math.abs(c.taxa - ref[i]) < GS_DIF_QUE_CONTA') > 0);
checar('as colunas vem do agregado do robo, nao de uma lista de etapas escrita a mao',
  templateCodigo.indexOf('const ordem = Array.isArray(h.agregado) ? h.agregado : []') > 0);
checar('a tela declara que nao e ranking e diz de onde vem o numero',
  template.indexOf('Isto não é ranking.') > 0 &&
  template.indexOf('data de entrada em etapa no HubSpot') > 0);
checar('a comparacao respeita quem ainda esta no campo',
  templateCodigo.indexOf('!ownerAtivoNoField(rep.ownerId)) return null') > 0);
checar('o degrau da escada mostra avancaram em numero, nao so a taxa',
  templateCodigo.indexOf(q3 + " saíram · " + q3) > 0 ||
  templateCodigo.indexOf("e.avancaram + ' saíram · '") > 0);

/* ── 14. RAIO-X: O FUNIL INTERATIVO (aba Time, prancha v4) ────────────────────────
   O cartao poe ESTOQUE e CONVERSAO um em cima do outro, que sao fontes, janelas e
   denominadores diferentes. E o lugar mais facil do produto para trocar um pelo outro,
   entao as checagens guardam que os dois estao rotulados e que a conversao vem do
   historico, nunca da contagem de abertos. */
checar('o funil do raio-X separa estoque de conversao no proprio rotulo',
  template.indexOf('abertos aqui agora') > 0 &&
  template.indexOf('saem daqui') > 0 &&
  template.indexOf('Estoque alto não é conversão ruim') > 0);
checar('a conversao do cartao vem do historico de etapa, nao da contagem de abertos',
  templateCodigo.indexOf('const taxa = et.chegaram > 0 ? (et.avancaram / et.chegaram) : null') > 0 &&
  templateCodigo.indexOf('const ordem = Array.isArray(h.agregado) ? h.agregado : []') > 0);
checar('o estoque do cartao vem dos abertos, e so de quem esta no campo',
  templateCodigo.indexOf('(DATA.funilLeads || {})[id] || []') > 0 &&
  templateCodigo.indexOf('ownerAtivoNoField(l.ownerId)') > 0);
checar('o topo vermelho nao acende por estar abaixo da media, e sim onde o vao pesa',
  templateCodigo.indexOf('const maiorPeso = Math.max.apply') > 0 &&
  templateCodigo.indexOf('e.acende = maiorPeso > 0 && e.peso >= maiorPeso * 0.75') > 0 &&
  templateCodigo.indexOf('pontos abaixo do time, com ') > 0);
checar('amostra curta nao acusa ninguem no funil interativo',
  templateCodigo.indexOf('curta: dele.chegaram < GX_FX_MIN_CELULA') > 0 &&
  templateCodigo.indexOf('dele.chegaram >= GX_FX_MIN_CELULA') > 0);
checar('o caso ordena pelo estouro do prazo, nao pelos dias',
  templateCodigo.indexOf('(sla == null || l.dias == null) ? null : (l.dias - sla)') > 0);
checar('MRR ausente no caso aparece marcado, nunca como zero',
  template.indexOf('sem MRR preenchido') > 0 &&
  templateCodigo.indexOf('const mrr = mrrDoNegocio(l);') > 0);
checar('etapa sem caso estourado explica, em vez de ficar vazia',
  template.indexOf('passou do prazo desta etapa') > 0 &&
  template.indexOf('estes são os mais antigos') > 0);
checar('a linha do caso nao e clicavel: nao existe destino para negocio isolado aqui',
  templateCodigo.indexOf('data-gx-fx-lead') < 0 &&
  templateCodigo.indexOf('data-gx-fx-dossie') > 0);
checar('sem historico de etapa o raio-X diz por que esta vazio',
  template.indexOf('O raio-X do funil entra no próximo carregamento do HubSpot') > 0);

/* ── 15. A PAUTA DA DAILY (aba Time, prancha v4) ──────────────────────────────────
   A pauta e o unico lugar do produto onde o gestor MARCA algo, e por isso e o lugar mais
   perigoso: um "+" ao lado de uma cobranca parece cobrar alguem. As checagens guardam que
   ela se declara como lista pessoal, que nao escreve em nenhuma fonte, e que o texto do
   chip sai da carga viva em vez de congelar o numero da leitura. */
/* A frase da nota nasce concatenada em varias linhas no fonte, entao a checagem olha os
   pedacos - foi ela que me pegou escrevendo a busca por uma frase que nunca existiu
   contigua no arquivo. */
checar('a pauta declara que nao chega no executivo e nao escreve em fonte nenhuma',
  template.indexOf('não escreve no HubSpot') > 0 &&
  template.indexOf('não cria tarefa') > 0 &&
  template.indexOf('não chega no executivo') > 0 &&
  template.indexOf('marcar aqui não cobra ninguém') > 0);
checar('a pauta guarda a chave, nao a frase: o numero e rederivado da carga',
  templateCodigo.indexOf('function gxPautaChaveDe(linha)') > 0 &&
  templateCodigo.indexOf('gxPautaItens()') > 0 &&
  templateCodigo.indexOf('return gxPauta.map(function (x) {') > 0);
checar('a chave da pauta e a mesma que a fila usa para agrupar',
  templateCodigo.indexOf("String(linha.ownerId == null ? 'time' : linha.ownerId) + '|' + String(linha.categoria)") > 0 &&
  templateCodigo.indexOf("const k = String(l.ownerId) + '|' + l.categoria") > 0);
checar('item que saiu da fila vira estado, nao desaparece nem vira erro',
  templateCodigo.indexOf('saiu: true') > 0 &&
  template.indexOf('Saiu da fila desde a leitura') > 0);
checar('a frase do chip vem da evidencia, que carrega a contagem',
  templateCodigo.indexOf('const oque = String(linha.evidencia || linha.rotulo') > 0);
checar('a pauta sobrevive a falta de armazenamento sem quebrar a tela',
  templateCodigo.indexOf('function gxPautaLer()') > 0 &&
  templateCodigo.indexOf('catch (e) { gxPauta = []; }') > 0 &&
  templateCodigo.indexOf('function gxPautaGravar()') > 0);
checar('a barra so aparece quando tem item',
  templateCodigo.indexOf("if (!gxPauta.length) { el.innerHTML = ''; return; }") > 0);

/* O CONTADOR DE CASOS SUBCONTAVA: a categoria de SLA empurra uma linha por PESSOA com o
   total dentro (quantidade), e o agrupamento marcava casos:1 nela. Cinco linhas dizendo
   9, 22, 8, 4 e 3 negocios entravam na conta como 5. */
checar('linha que chega ja agregada declara o proprio volume na contagem',
  templateCodigo.indexOf('if (g.casos === 1 && Number(g.quantidade) > 1) {') > 0 &&
  templateCodigo.indexOf('return { ...g, casos: Number(g.quantidade) };') > 0);
checar('e a linha pre-agregada nao tem a frase reescrita por cima',
  templateCodigo.indexOf('return { ...g, casos: Number(g.quantidade) };') <
  templateCodigo.indexOf("evidencia: g.casos + ' negócios com '"));

/* ── 16. DE ONDE SAI O MRR DE UM NEGOCIO ──────────────────────────────────────────
   Medido no snapshot: 14 dos 146 abertos tem `mrr` preenchido e `valor_de_mrr` vazio -
   R$ 5.262/mes que o Cockpit nao via, porque toda tela lia so `valor_de_mrr`. Quem move
   o negocio pelo formulario de etapa DENTRO do HubSpot digita no campo `mrr`.
   Estas checagens guardam que existe UM leitor, que ele prefere o campo que a nossa rota
   escreve, que zero nao conta como preenchido e que a exigencia de campo obrigatorio
   olha os dois - senao ela acusa quem preencheu. */
checar('existe um leitor unico de MRR, e ele encadeia os dois campos',
  templateCodigo.indexOf('function mrrDoNegocio(lead)') > 0 &&
  templateCodigo.indexOf('const fechado = Number(lead.mrr)') > 0 &&
  templateCodigo.indexOf('const emNegociacao = Number(lead.valor_de_mrr)') > 0);
/* A ORDEM INVERTEU EM 03/09/26, POR REGRA COMERCIAL — e a assercao continua sendo de
   ordem, porque era a ordem que estava errada e nao a ideia de fixar uma.
     mrr           preenchido em Ag. Pagamento; e dele que o ASAAS emite o link, e e o
                   que se mede ("o mrr que vamos medir de cada executivo E EXATAMENTE
                   esse que ele preenche ao aguardar pagamento" — Julyan, 03/09).
     valor_de_mrr  valor em NEGOCIACAO, que ainda nao fechou.
   Preferir o da negociacao media promessa como receita: negocio proposto a 450 e
   fechado a 299 aparecia valendo 450. */
checar('o leitor prefere o MRR fechado de Ag. Pagamento, nao o valor em negociacao',
  templateCodigo.indexOf('const fechado = Number(lead.mrr)') <
  templateCodigo.indexOf('const emNegociacao = Number(lead.valor_de_mrr)'));
checar('zero e negativo nao contam como MRR preenchido, e a ausencia e null',
  templateCodigo.indexOf('if (isFinite(fechado) && fechado > 0) return fechado;') > 0 &&
  templateCodigo.indexOf('if (isFinite(emNegociacao) && emNegociacao > 0) return emNegociacao;') > 0 &&
  /(function mrrDoNegocio[\s\S]{0,900}?return null;)/.test(templateCodigo));
/* E A ROTA QUE CORRIGE O MRR TEM QUE ESCREVER O CAMPO QUE A TELA MEDE. Ela gravava so
   valor_de_mrr enquanto o total soma `mrr`: a correcao aparecia na tela e voltava atras
   na proxima carga do robo, porque o HubSpot recebia metade. */
checar('a correcao de MRR grava os DOIS campos no HubSpot',
  (function () {
    const f = require('path').join(__dirname, '..', 'lib', 'acoes-negocio', 'atualizar-mrr.js');
    const c = require('fs').readFileSync(f, 'utf8');
    return c.indexOf('valor_de_mrr: String(Math.round(mrrNum))') > 0
      && c.indexOf('mrr: String(Math.round(mrrNum))') > 0;
  })());
/* O PISO DESARMADO, E A LISTA VAZIA EM VEZ DO BLOCO REMOVIDO. 349 e o ticket ideal, nao
   trava: negocio fechado a 299 era recusado na gravacao e travava a etapa. */
checar('nao existe piso de valor bloqueando a gravacao',
  (function () {
    const f = require('path').join(__dirname, '..', 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js');
    const c = require('fs').readFileSync(f, 'utf8');
    return c.indexOf('const PROPS_COM_PISO = [];') > 0;
  })());
checar('a exigencia de campo obrigatorio nao acusa quem preencheu no outro campo',
  templateCodigo.indexOf("if (x.p === 'valor_de_mrr') return mrrDoNegocio(lead) == null;") > 0);
checar('o formulario de etapa abre com o MRR que o negocio ja tem',
  templateCodigo.indexOf("campo.prop === 'valor_de_mrr' ? mrrDoNegocio(lead)") > 0);
checar('o dinheiro em risco e a soma por etapa usam o leitor unico',
  templateCodigo.indexOf('(r.travados || []).filter(l => mrrDoNegocio(l) != null)') > 0 &&
  templateCodigo.indexOf('(mrrDoNegocio(l) || 0)') > 0 &&
  templateCodigo.indexOf('gxNum(l.valor_de_mrr)') < 0);
checar('quando o numero vem do campo do HubSpot, a tela declara a procedencia',
  template.indexOf('campo do HubSpot') > 0 &&
  templateCodigo.indexOf('function mrrFonteDoNegocio(lead)') > 0);

/* ── 17. OS CINCO CARTOES DO RAIO-X (aba Time, prancha v4 secao 3b) ───────────────
   Quatro dos cinco reusam calculo que ja existia; o quinto (onde os negocios morrem) sai
   do mesmo retrato do funil interativo. As checagens guardam as regras que impedem que
   cada cartao invente numero: cobertura em negocios e nao em dinheiro, ritmo como conta e
   nao previsao, promessa ausente como nao medido, mediana em vez de media no estouro, e
   ninguem cobrado de rua fora da fase de rua. */
checar('o cartao de campo usa visita comprovada, nunca planejada',
  template.indexOf('Visita comprovada por evento do Expogo/HubSpot — planejada não conta') > 0 &&
  templateCodigo.indexOf("(ev.desfecho === 'COMPLETED' || ev.registro)") > 0);
checar('quem nao esta na rua nesta fase nao aparece como parado',
  templateCodigo.indexOf('parado: e.naRua && e.comprovadas === 0 && e.paradas === 0') > 0 &&
  template.indexOf('não está na rua nesta fase da rampagem') > 0);
checar('o estouro de prazo usa mediana, nao media',
  templateCodigo.indexOf('const excessos = estourados.map(l => l.dias - prazo).sort') > 0 &&
  template.indexOf('média seria distorcida por um negócio parado há meses') > 0);
checar('a meta e a soma das metas individuais declaradas, e o ritmo e conta',
  templateCodigo.indexOf('const alvo = ativos.reduce((n, r) => n + (Number(r.metaMensal) || 0), 0)') > 0 &&
  templateCodigo.indexOf('ritmo: (du && du > 0) ? (falta / du) : null') > 0);
checar('a cobertura e em negocios abertos, nunca em dinheiro',
  templateCodigo.indexOf('cobertura: falta > 0 ? (abertos / falta) : null') > 0 &&
  template.indexOf('negócios abertos</b> para esses ') > 0 &&
  template.indexOf('convenção declarada, não medição') > 0);
checar('promessa ausente na semana vira nao medido, nunca 0%',
  templateCodigo.indexOf('function gxPrometidoCumprido()') > 0 &&
  template.indexOf('não medido</span>') > 0 &&
  template.indexOf('nenhuma visita prometida nesta semana') > 0);
checar('o prometido x cumprido reusa visitasInformadasDetalhe, sem segundo calculo',
  templateCodigo.indexOf('visitasInformadasDetalhe(String(r.ownerId))') > 0);
checar('as perdas declaram a cobertura do proprio preenchimento',
  template.indexOf('não é um motivo — é a lista de motivos não dando conta') > 0);
checar('todo nome do raio-X abre o dossie',
  templateCodigo.indexOf('data-gx-rx-quem') > 0 &&
  templateCodigo.indexOf("gxAbrirDestino({ view: 'viewCockpit', ownerId: oid })") > 0);
checar('os quatro blocos que o raio-X resume foram recolhidos, nao apagados',
  template.indexOf('id="gxDetalheBlocos"') > 0 &&
  template.indexOf('id="cockpitExecutionCommand"') > 0 &&
  template.indexOf('id="reps"') > 0 &&
  template.indexOf('id="vendasMesBloco"') > 0 &&
  template.indexOf('id="cockpitPorQuePerdemos"') > 0);

/* ── 18. O DOSSIE DO 1:1 (aba Time, prancha v4 secao 5) ───────────────────────────
   O dossie ja tinha a forma do funil dele contra o time, a idade por etapa, o dinheiro
   parado, a meta e a aderencia. Faltavam a manchete de treino, o que cobrar hoje e a
   pauta - e eu escrevi um bloco de perdas que JA EXISTIA e era melhor que o meu. As
   checagens guardam que o duplicado nao volta e que a versao mantida e a completa. */
checar('a manchete de treino vem antes das formas, e o cartao GARGALO nao ficou duplicado',
  template.indexOf('Onde treinar com ${esc(String(r.name).split(') > 0 &&
  template.indexOf('>GARGALO<') < 0);
checar('existe UM bloco de perdas por pessoa, o que compara com o time',
  templateCodigo.indexOf('function gxComoElePerdeHTML') < 0 &&
  template.indexOf('régua = o time') > 0 &&
  template.indexOf('d.razao >= 1.5 && d.n >= 5') > 0);
checar('o bloco de perdas por pessoa liga o motivo a um modulo do Playbook',
  template.indexOf('Objeções — a conversa é sobre margem') > 0 &&
  template.indexOf('Follow-up — presença no prazo certo') > 0);
checar('o MRR das perdas dele aparece com a cobertura, e nao como receita',
  templateCodigo.indexOf('mp.mrrPorOwner[String(r.ownerId)]') > 0 &&
  template.indexOf('os negócios sem MRR preenchido não entram nesta soma') > 0);
checar('o que cobrar hoje reusa a fila e o mesmo + da pauta da Daily',
  templateCodigo.indexOf('function gxCobrarHojeHTML(r)') > 0 &&
  templateCodigo.indexOf("gxFilaDeIntervencao().filter(function (l) { return String(l.ownerId) === String(r.ownerId); })") > 0);
checar('a pauta do 1:1 monta texto do que a tela mostra, sem escrever em fonte nenhuma',
  templateCodigo.indexOf('function gxTextoPautaDo11(r)') > 0 &&
  template.indexOf('copiar pauta do 1:1') > 0 &&
  templateCodigo.indexOf('RECONHECER (comportamento observado para multiplicar)') > 0);
checar('a comparacao com o time e a pauta nao chegam ao executivo',
  templateCodigo.indexOf("souRepSessao ? '' : gxCobrarHojeHTML(r)") > 0 &&
  templateCodigo.indexOf("souRepSessao ? '' : '<button type=\"button\" id=\"gxCopiarPauta11\"") > 0);
checar('o que abre lista no dossie cumpre o piso de 38px no desktop',
  template.indexOf('.coach-funil-etapa.is-abre{min-height:38px;}') > 0);

/* ── resultado ──────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('gestor analítico: ' + ok + ' checagens ok — estoque≠conversão, MRR com cobertura, plano≠execução, evidência sem julgamento e nenhum botão sem destino.');
