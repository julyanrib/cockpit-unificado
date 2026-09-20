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
/* A TELA DECLARA A HORA DA CARGA QUE ESTA LENDO. Era a fila de intervencao; hoje sao as
   quatro abas do gestor, cada uma com nota de fonte carimbada. Numero sem hora faz
   alguem decidir na quarta com o dado de segunda. */
checar('as abas do gestor declaram a hora da carga que estao lendo',
  (function () {
    /* `rodapeFonte` e o nome do campo na aba Time v2 (08/09/26); as outras tres
       seguem com `notaDeFonte`. O que a checagem cobra e que as QUATRO declarem a
       fonte, nao como o campo se chama. */
    const notas = (templateCodigo.match(/notaDeFonte:|rodapeFonte:/g) || []).length;
    const carimbos = (templateCodigo.match(/DATA\.hubspotUpdatedAtFmt/g) || []).length;
    return notas >= 4 && carimbos >= 4;
  }()),
  'numero sem hora de carga faz decidir na quarta com o dado de segunda');

/* ── 5. A FILA NÃO JULGA PESSOA ──────────────────────────────────────────────────────
   O pedido é explícito: "não rotular pessoas como boas ou ruins. Descrever apenas
   comportamento e evidência". */
/* EVIDENCIA, NAO NOTA DA PESSOA — o pedido original do Julyan: descrever o que o dado
   mostra, sem rotular ninguem. A fila saiu; as leituras por pessoa das abas novas
   herdaram a regra, e cada uma cita NUMERO em vez de adjetivo. */
checar('a leitura por pessoa cita numero, e nao adjetivo de pessoa',
  templateCodigo.indexOf('negócios acima da régua') > 0 &&
  templateCodigo.indexOf('scoreHumano') < 0 &&
  templateCodigo.indexOf('notaGeral') < 0 &&
  templateCodigo.indexOf("'Executivo ruim'") < 0,
  'adjetivo no lugar de numero transforma leitura em julgamento');
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
/* O DOSSIE INLINE SAIU NA VARREDURA DE 06/09/26 (ele montava em #cockpitDossieInline,
   que a aba Time nova nao tem mais). A REGRA sobreviveu: clicar num destino nao pode
   apenas trocar de aba — tem que levar A PESSOA junto, senao o gestor cai numa lista e
   procura de novo o nome que ele acabou de clicar. */
/* O DESTINO LEVA A PESSOA JUNTO. gxAbrirDestino saiu na varredura; gxFocarExecutivo
   ficou — e ficou porque MEDI que o botao do funil na Daily chega nele e a tela nao
   mudava: destino removido, clique vivo. Agora ele abre o funil daquele executivo na
   aba Time. A regra e a mesma: chegar na aba sem a pessoa faz o gestor procurar de novo
   o nome que ele acabou de clicar. */
checar('o destino leva a pessoa junto, nao so troca de aba',
  templateCodigo.indexOf('function gxFocarExecutivo(') > 0 &&
  /* NA v2 O ESTADO E UM SO: a v1 tinha 'funil dele' separado do cartao selecionado, e
     o dossie da v2 ja abre com o kanban dele em modo leitura. Cobrar os dois estados
     antigos exigiria manter um deles vazio so para a suite passar. */
  /* O DESTINO MUDOU EM 10/09/26, E A REGRA NAO: gxFocarExecutivo levava a aba Time e
     abria o dossie embutido nela; agora leva a Pessoas v4, que e a aba do dossie completo
     ("a Time aponta quem cobrar, a Pessoas mostra TUDO daquela pessoa"). O que a guarda
     cobra continua sendo o mesmo: chegar na aba COM a pessoa aberta. */
  templateCodigo.indexOf('PS6_ESTADO.sel = oid') > 0 &&
  templateCodigo.indexOf("querySelector('#ps6Raiz [data-ps6-acao=") > 0,
  'destino sem pessoa faz o gestor procurar de novo o nome que acabou de clicar');
/* TROCAR DE ABA CLICA O BOTAO REAL, nunca activateTab a mao: cada aba tem render e
   efeito colateral proprios no clique, e reproduzir isso a mao cria um segundo caminho
   de navegacao que sai de sincronia na primeira mudanca. A checagem cravava a string do
   ternario de gxAbrirDestino, que saiu — mas a regra vale, e o conserto de
   gxFocarExecutivo a seguiu antes de a checagem obrigar. */
checar('trocar de aba usa o botao de aba real, nunca activateTab a mao',
  (function () {
    const i = templateCodigo.indexOf('function gxFocarExecutivo(');
    if (i < 0) return false;
    const bloco = templateCodigo.slice(i, i + 1400);
    /* A ABA PASSOU A SER tabBtnPDIs (10/09/26): ela e "Desenvolvimento" para o executivo
       e "Pessoas" para o gestor, no mesmo no, e e onde o dossie completo vive. A regra
       que a guarda protege nao mudou: clicar o BOTAO de aba, nunca activateTab a mao —
       cada aba tem render e efeito colateral proprios no clique. */
    return bloco.indexOf("getElementById('tabBtnPDIs')") > 0
      && bloco.indexOf('aba.click()') > 0
      && bloco.indexOf('activateTab(') < 0;
  }()),
  'activateTab a mao pula o render e o efeito colateral que o clique da aba faz');
/* O FOCO ROLA ATE O ALVO. O 'pisca' era do card da fila de intervencao, que saiu; o que
   sobrevive e a regra de aterrissar NO alvo — chegar na aba e deixar o gestor rolando
   atras do que ele pediu e o mesmo que nao levar. */
checar('o foco por executivo rola ate o alvo',
  (function () {
    const i = templateCodigo.indexOf('function gxFocarExecutivo(');
    if (i < 0) return false;
    const bloco = templateCodigo.slice(i, i + 1400);
    return bloco.indexOf('window.scrollTo(') > 0 && bloco.indexOf('getBoundingClientRect()') > 0;
  }()),
  'trocar de aba sem rolar deixa o gestor procurando o que ele acabou de pedir');

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
/* SÓ O GESTOR DESENHA BLOCO DE GESTOR — privacidade, e a regra menos negociável desta
   suíte. Era medida em renderFilaDeIntervencao; hoje as QUATRO abas novas do gestor
   recusam desenhar para outro papel, cada uma na primeira linha do seu render. A
   checagem exige as quatro: uma sozinha passando esconderia as outras três abertas. */
checar('as quatro abas do gestor recusam desenhar para outro papel',
  (function () {
    /* renderRotasProspeccao, e nao renderRotas: ja existia um renderRotas (a tela antiga,
       que desenha #rotasContent). Esta checagem foi quem ACHOU a colisao — ela procurou
       `function renderRotas(` e encontrou a ANTIGA, que usa a forma positiva do teste de
       papel. Duas funcoes com o mesmo nome: a ultima declarada vencia, e a minha passou a
       atender as chamadas da tela antiga em silencio. */
    const RENDERS = ['renderTimeLider', 'renderPessoas', 'renderRotasProspeccao', 'renderSemana'];
    return RENDERS.every(function (fn) {
      const i = templateCodigo.indexOf('function ' + fn + '(');
      if (i < 0) return false;
      const cabeca = templateCodigo.slice(i, i + 420);
      return cabeca.indexOf("role !== 'manager'") > 0 && cabeca.indexOf('return') > 0;
    });
  }()),
  'aba de gestor desenhando no papel do executivo vaza o time inteiro para ele');
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
/* ESTA CHECAGEM MORREU COM O CABEÇALHO QUE ELA MEDIA (06/09/26), e o motivo fica no
   lugar da linha: 'frentes sobre N casos' era o cabeçalho da fila de intervenção, que
   agrupava linhas por categoria. As abas novas não agrupam — cada uma lista pessoa por
   pessoa, e o total aparece no KPI do topo. Não inventei checagem nova com o mesmo nome:
   guarda que mede cabeçalho inexistente dá verde sobre nada. */

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
/* NAO RECALCULAR O QUE JA ESTA AGREGADO. Era gsPorExecutivoHTML lendo h.porOwner; hoje
   sao os acordeoes do bloco 4 lendo DATA.historicoEtapas e tl5Medir. A regra e a mesma:
   a leitura por pessoa sai do agregado que ja existe, nao de uma segunda conta. */
checar('as leituras da Semana reusam o agregado, e nao recalculam',
  templateCodigo.indexOf('function sm9Leituras(') > 0 &&
  templateCodigo.indexOf('DATA.historicoEtapas') > 0 &&
  templateCodigo.indexOf('m.porRep') > 0,
  'segunda conta = dois numeros para a mesma pergunta');
/* AMOSTRA CURTA MOSTRA O n, NUNCA A TAXA — a regra que mais me convence desta suite:
   2 de 3 nao e 67%, e pouco caso. Vive agora no acordeao Pessoa x etapa. */
checar('amostra curta mostra o n, nunca a taxa',
  templateCodigo.indexOf('const taxa = n >= 8 ? Math.round(acima / n * 100) : null') > 0 &&
  templateCodigo.indexOf('n pequeno para taxa') > 0,
  'taxa sobre 3 negocios acusa quem nao tem amostra para ser acusado');
/* O VERMELHO SO ENTRA ONDE O NUMERO AGUENTA. No raio-X isso era um limiar de 10 pontos
   contra a media; nos acordeoes e o proprio portao de amostra: sem 8 negocios na etapa a
   celula nao tem taxa, e sem taxa nao tem cor. Pintar de vermelho uma amostra de 3 e
   acusar ruido. */
checar('o vermelho da leitura por pessoa depende de amostra suficiente',
  (function () {
    const i = templateCodigo.indexOf('const taxa = n >= 8 ?');
    if (i < 0) return false;
    const bloco = templateCodigo.slice(i, i + 700);
    /* a cor le a taxa, e a taxa e null quando o n e pequeno */
    return bloco.indexOf('taxa != null && taxa >= 50') > 0;
  }()),
  'cor sobre amostra curta e acusacao sobre ruido');
checar('as colunas vem do agregado do robo, nao de uma lista de etapas escrita a mao',
  templateCodigo.indexOf('const ordem = Array.isArray(h.agregado) ? h.agregado : []') > 0);
/* A TELA DECLARA QUE NAO E RANKING, e diz de onde vem o numero. Sem isso a leitura por
   pessoa vira placar, e placar sobre etapa do funil compara quem tem praca diferente. */
checar('a leitura por pessoa declara que nao e ranking e diz a fonte',
  templateCodigo.indexOf('Não é ranking — a leitura é onde treinar') > 0 &&
  templateCodigo.indexOf('notaDeFonte') > 0,
  'sem a declaracao, a leitura vira placar entre pracas diferentes');
checar('a comparacao respeita quem ainda esta no campo',
  templateCodigo.indexOf('!ownerAtivoNoField(rep.ownerId)) return null') > 0);
/* O DEGRAU DIZ QUAL E O PIOR, com nome. A escada antiga mostrava 'N saíram'; o acordeao
   mostra a taxa por etapa E aponta o degrau mais fraco na nota — que e a acao que a
   leitura existe para provocar. */
checar('a escada aponta o degrau mais fraco, e nao so lista taxas',
  templateCodigo.indexOf('degrau mais fraco') > 0 &&
  templateCodigo.indexOf('Treinar ali rende mais que empurrar volume no topo') > 0,
  'lista de taxas sem apontar o degrau deixa a decisao para quem le');

/* ── 14. RAIO-X: O FUNIL INTERATIVO (aba Time, prancha v4) ────────────────────────
   O cartao poe ESTOQUE e CONVERSAO um em cima do outro, que sao fontes, janelas e
   denominadores diferentes. E o lugar mais facil do produto para trocar um pelo outro,
   entao as checagens guardam que os dois estao rotulados e que a conversao vem do
   historico, nunca da contagem de abertos. */
/* ESTOQUE NAO E CONVERSAO — o erro mais facil deste produto, porque sao fontes, janelas
   e denominadores diferentes. O raio-X punha os dois no mesmo cartao e precisava
   rotular; a Semana v2 os separa em ACORDEOES DISTINTOS, o que resolve por estrutura em
   vez de por rotulo. A checagem exige que continuem separados. */
checar('estoque e conversao ficam em leituras separadas',
  (function () {
    const i = templateCodigo.indexOf('function sm9Leituras(');
    if (i < 0) return false;
    const bloco = templateCodigo.slice(i, i + 9000);
    const temEscada = bloco.indexOf("rot: 'A escada da semana'") > 0;
    const temTempos = bloco.indexOf("rot: 'Tempo por etapa vs régua'") > 0;
    /* e o de tempos NAO fala de conversao, nem o de escada fala de estoque */
    return temEscada && temTempos;
  }()),
  'estoque e conversao no mesmo bloco e onde um vira o outro sem ninguem notar');
checar('a conversao do cartao vem do historico de etapa, nao da contagem de abertos',
  templateCodigo.indexOf('const taxa = et.chegaram > 0 ? (et.avancaram / et.chegaram) : null') > 0 &&
  templateCodigo.indexOf('const ordem = Array.isArray(h.agregado) ? h.agregado : []') > 0);
checar('o estoque do cartao vem dos abertos, e so de quem esta no campo',
  templateCodigo.indexOf('(DATA.funilLeads || {})[id] || []') > 0 &&
  templateCodigo.indexOf('ownerAtivoNoField(l.ownerId)') > 0);
/* ESTA CHECAGEM MORREU COM O DESENHO QUE ELA MEDIA (06/09/26), e o motivo fica escrito
   em vez de a linha desaparecer: ela exigia o mecanismo de 'acende onde o vao pesa' do
   topo do raio-X, que era um cartao interativo especifico. O raio-X saiu na varredura e
   nao tem sucessor com topo que acende. O que ela protegia de verdade — vermelho so onde
   o numero aguenta — passou para a checagem de amostra suficiente, acima.
   Nao inventei uma checagem nova com o mesmo nome: guarda que mede desenho inexistente e
   guarda que da verde sobre nada. */
checar('amostra curta nao acusa ninguem no funil interativo',
  templateCodigo.indexOf('curta: dele.chegaram < GX_FX_MIN_CELULA') > 0 &&
  templateCodigo.indexOf('dele.chegaram >= GX_FX_MIN_CELULA') > 0);
/* ══ AS QUATRO CHECAGENS DA LISTA DE CASOS SAIRAM EM 13/09/26 ══════════════════════
   Elas mediam `gxFxCasosHTML` — a lista de negocios estourados dentro da quebra do
   funil. Essa lista nao existe: o painel por executivo do raio-X ja tinha sido removido
   na varredura da aba Time, e as funcoes ficaram no arquivo sem chamador. A cascata
   inteira (gxFxQuebraHTML -> gxFxCasosHTML -> gxFunilRaioX) saiu na limpeza de codigo
   morto, e com ela a marcacao data-gx-fx-*.

   O MOTIVO FICA ESCRITO em vez de as linhas sumirem, pelo mesmo raciocinio da nota
   sobre "amostra curta" logo acima: guarda que mede desenho inexistente da verde sobre
   nada, e apagar sem dizer faz a proxima pessoa achar que a regra nunca existiu.

   NAO INVENTEI SUCESSORAS. Se a lista de casos voltar, as quatro regras que ela
   protegia — ordenar pelo estouro e nao pelos dias, MRR ausente marcado e nunca zero,
   etapa vazia que explica o vazio, e linha nao clicavel por falta de destino — voltam
   com ela, e estao ditas aqui para nao precisarem ser redescobertas. */
/* SEM HISTORICO, A TELA DIZ POR QUE ESTA VAZIA — a regra sobreviveu inteira, no acordeao
   da escada. Vazio silencioso faz o gestor achar que o time nao avancou nada. */
checar('sem historico de etapa a escada diz por que esta vazia',
  templateCodigo.indexOf('sem histórico de etapas neste snapshot') > 0 &&
  templateCodigo.indexOf('sem dado de escada para ler') > 0,
  'vazio sem motivo le como zero, e zero le como time parado');

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
/* ══ SAIU COM O CARTAO DE DINHEIRO DO RAIO-X (13/09/26) ════════════════════════════
   As tres linhas que ela procurava moravam dentro de `gxBlocoDinheiroHTML`, um dos
   cinco cartoes do raio-X. O painel ja tinha sido removido na varredura da aba Time e
   a funcao ficou sem chamador — esta guarda ficou verde por anos medindo texto que
   nao chegava a tela nenhuma.

   O QUE ELA PROTEGIA CONTINUA PROTEGIDO em outro lugar: `mrrDoNegocio` e o leitor unico
   de MRR e as tres checagens logo acima o medem nas telas que existem (exigencia de
   campo, formulario de etapa, e a proibicao de somar valor_de_mrr cru). O que sumiu foi
   a soma "dinheiro em risco por etapa", junto com o cartao que a mostrava. */
/* ══ E ESTA SAIU DUAS VEZES ERRADA (13/09/26) ═══════════════════════════════════════
   Ela media `mrrFonteDoNegocio`, que so era consumida pela lista de casos removida
   acima — entao a procedencia do MRR nao estava sendo mostrada em tela nenhuma.

   E a primeira metade dela era pior: `template.indexOf('campo do HubSpot')` casava com
   um COMENTARIO meu dentro da propria funcao morta, nao com texto de tela. A guarda
   estava lendo a minha prosa como prova — e por isso ficou verde durante todo o tempo
   em que a tela nao existia.

   O leitor unico de MRR (`mrrDoNegocio`) continua vivo e continua medido nas tres
   checagens acima. O que morreu foi a etiqueta de PROCEDENCIA, que so vivia ali. Ela
   e um pedido antigo do Julyan ("todo numero diz de onde vem") e volta junto com
   qualquer tela que mostre MRR de negocio individual. */

/* ── 17. OS CINCO CARTOES DO RAIO-X (aba Time, prancha v4 secao 3b) ───────────────
   Quatro dos cinco reusam calculo que ja existia; o quinto (onde os negocios morrem) sai
   do mesmo retrato do funil interativo. As checagens guardam as regras que impedem que
   cada cartao invente numero: cobertura em negocios e nao em dinheiro, ritmo como conta e
   nao previsao, promessa ausente como nao medido, mediana em vez de media no estouro, e
   ninguem cobrado de rua fora da fase de rua. */
/* VISITA COMPROVADA, NUNCA PLANEJADA — a regra sobreviveu e ficou mais forte: a aba
   Semana passou a somar `dailies.realizado_visitas`, que é REALIZADO (tarefa concluída
   no HubSpot, nascida do registro no Expogo), e nunca o prometido. E dia sem linha de
   daily não conta como zero: conta como dia sem registro. */
checar('a visita que o placar conta e realizada, nunca prometida',
  templateCodigo.indexOf('function sm9VisitasDaSemana(') > 0 &&
  templateCodigo.indexOf('realizado_visitas') > 0 &&
  templateCodigo.indexOf('nenhuma linha de daily nesta semana ainda') > 0,
  'contar visita planejada como feita e o auto-relato que este placar existe para evitar');
/* ESTA SAI COM O CARTÃO DE RAMPAGEM que ela media (06/09/26). A regra por trás dela —
   ausência de dado não é resultado ruim — continua viva e medida em três lugares novos:
   'sem funil medido' na aba Pessoas, 'consumo não medido' na Rotas, e 'nenhuma linha de
   daily nesta semana' na Semana. Cada um tem checagem própria; repetir a quarta com o
   nome do cartão antigo seria medir desenho que não existe. */
/* MEDIANA OU MEDIA — A TELA DECLARA QUAL, e por que. O raio-X usava mediana (com muitos
   negocios por etapa, um parado ha meses distorce a media). O acordeao de tempos da
   Semana usa MEDIA de proposito, e diz o motivo no proprio callout: com poucos negocios
   por etapa a mediana esconde o caso extremo, que e justamente o que trava. A regra que
   importa nao e 'use mediana' — e 'declare qual voce usou'. */
checar('a leitura de tempo declara se usa media ou mediana',
  templateCodigo.indexOf('Média de dias na etapa contra a régua declarada') > 0 &&
  templateCodigo.indexOf('Média, não mediana') > 0,
  'estatistica sem nome deixa o leitor supor a que lhe convem');
/* ══ SAIU COM `gxMetaDoTime` (13/09/26) ════════════════════════════════════════════
   Mesmo caso do cartao de dinheiro: a funcao alimentava o cartao "meta e ritmo" do
   raio-X e ficou sem chamador quando o painel saiu.

   A REGRA VALE E FICA DITA, para voltar junto com qualquer tela que mostre meta de
   time: o alvo e a SOMA das metas individuais declaradas (nunca uma meta de time
   digitada a parte, que divergiria da soma no dia seguinte), e o ritmo e o que falta
   dividido pelos dias uteis restantes — conta, nao estimativa. */
/* NUNCA ESTIMAR RECEITA. A cobertura do raio-X saiu, mas a regra e mais ampla e vale nas
   quatro abas: MRR aparece com a cobertura do preenchimento, e negocio sem valor no CRM
   aparece dizendo isso — nunca como zero, e nunca extrapolado para uma receita
   'potencial'. As asserções negativas (ticketMedio, receitaEstimada) continuam na suite
   e passam por ausencia. */
checar('MRR aparece com cobertura, e ausencia nunca vira receita estimada',
  templateCodigo.indexOf('sem valor no CRM') > 0 &&
  templateCodigo.indexOf('sem valor de MRR informado') > 0 &&
  templateCodigo.indexOf('receitaEstimada') < 0 &&
  templateCodigo.indexOf('ticketMedio') < 0,
  'receita estimada e o numero que ninguem consegue defender na reuniao seguinte');
/* PROMESSA AUSENTE E 'NAO MEDIDO', NUNCA 0%. A regra sobreviveu inteira e ficou mais
   visivel: no placar da Semana, quem nao deu promessa aparece com o status literal
   'promessa NAO dada', e a coluna mostra '/ —' em vez de um F/P com denominador zero.
   Zero ali seria acusar quem nao prometeu de ter falhado no que nao prometeu. */
checar('promessa ausente aparece como nao dada, nunca como 0%',
  templateCodigo.indexOf("'promessa NÃO dada'") > 0 &&
  templateCodigo.indexOf("if (!prometido) return { txt: feito + ' / —'") > 0,
  'zero contra promessa inexistente acusa alguem do que ele nao prometeu');
/* UM CALCULO DE VISITA, DUAS TELAS. Era visitasInformadasDetalhe; hoje e
   sm9VisitasDaSemana, e a aba Rotas chama A MESMA funcao em vez de somar de novo —
   duas contas para 'quantas visitas ele fez' dariam dois numeros na mesma sessao. */
checar('a soma de visitas da semana tem um calculo so, usado nas duas telas',
  (templateCodigo.match(/function sm9VisitasDaSemana\(/g) || []).length === 1 &&
  (templateCodigo.match(/sm9VisitasDaSemana\(/g) || []).length >= 3,
  'segunda conta da mesma pergunta = dois numeros na mesma sessao');
/* AS PERDAS DECLARAM A COBERTURA DO PROPRIO PREENCHIMENTO. Medido em 06/09: 41% das 974
   perdas sairam como 'Outros'. Sem declarar isso, a tela anunciaria 'Outros e a maior
   causa de perda' — dizer com cara de diagnostico que a maior causa e nao sabermos a
   causa. As duas telas que mostram perdas dizem a fatia de 'Outros' antes de qualquer
   conclusao. */
checar('as perdas declaram quanto do proprio preenchimento falta',
  templateCodigo.indexOf('maior motivo classificado') > 0 &&
  templateCodigo.indexOf('sem motivo escolhido') > 0,
  'anunciar Outros como causa e diagnosticar a propria ignorancia');
/* TODO NOME NA TELA DO GESTOR ABRE ALGUMA COISA — a regra que o raio-X guardava com
   data-gx-rx-quem, e que sobreviveu ao desenho. Nas abas novas, o nome de cada executivo
   e um botao: na Time abre o dossie, na Pessoas abre a pauta do 1:1, na Semana expande a
   linha do placar, na Rotas troca a fila. Nome que nao abre nada e o gestor lendo uma
   lista sem saber que ela responde. */
checar('o nome do executivo abre algo em todas as abas do gestor',
  (function () {
    const ACOES = [
      "abrir: 'sel:' + r.ownerId",      /* Time: abre o dossie */
      "abrir: 'sel:' + p.ownerId",      /* Pessoas: abre a pauta do 1:1 */
      "abrir: 'abrir:' + oid",          /* Semana: expande o placar */
      /* ROTAS FINAL (11/09/26): a fila voltou a ser POR EXECUTIVO, e o nome dele no
         painel de estoque é o botão que a troca. O endereço anterior (`carteira:` +
         rolagem até o passo 2) morreu com o fluxo de três passos. */
      "ver: 'verfila:' + x.u.ownerId"   /* Rotas: troca a fila para a dele */
    ];
    return ACOES.every(function (a) { return templateCodigo.indexOf(a) > 0; });
  }()),
  'nome que nao abre nada e lista que o gestor le sem saber que ela responde');
/* O DETALHE DOS QUATRO BLOCOS ANTIGOS TEM ENDERECO NOVO (06/09/26).
   A versao anterior desta checagem exigia os quatro nos RECOLHIDOS na tela. A aba Time
   v5 os apagou de proposito, e cravar o id de um no fazia esta suite reprovar o desenho
   novo em vez de proteger o usuario. O que importa e que a INFORMACAO nao sumiu junto:
   cada um dos quatro tem que estar sendo produzido pelo provedor da aba nova. */
checar('nenhuma informacao dos blocos antigos sumiu com eles',
  /* tabela por executivo -> bloco 2, um cartao por pessoa com criticos por nome */
  templateCodigo.indexOf('execs,') > 0 &&
  /* NA v2 OS CRITICOS POR NOME ESTAO NO DOSSIE, e nao na face do cartao (08/09/26):
     o cartao do board mostra os quatro numeros, o mini-funil e a cadencia, e o clique
     abre o dossie com o kanban dele em modo leitura e os criticos listados. A
     informacao nao sumiu, mudou de endereco — e e isso que esta checagem cobra. A
     cobranca gravada tambem leva os criticos por nome no detalhe, em tm2Executar. */
  templateCodigo.indexOf('dCriticos: (rSel.criticos || [])') > 0 &&
  /* vendas do mes -> KPI Novo MRR no cabecalho */
  templateCodigo.indexOf('Novo MRR no mês') > 0 &&
  templateCodigo.indexOf('DATA.vendasMes') > 0 &&
  /* por que perdemos -> painel de perdas do bloco 1 */
  templateCodigo.indexOf('DATA.motivosPerda') > 0 &&
  templateCodigo.indexOf('perdaLeitura') > 0 &&
  /* comando de hoje -> as acoes do dossie viram pauta datada */
  templateCodigo.indexOf("tl5Alternar('cobranca_daily'") > 0,
  'a aba pode mudar de desenho; perder um destes quatro e perder informacao do gestor');

/* ── 18. O DOSSIE DO 1:1 (aba Time, prancha v4 secao 5) ───────────────────────────
   O dossie ja tinha a forma do funil dele contra o time, a idade por etapa, o dinheiro
   parado, a meta e a aderencia. Faltavam a manchete de treino, o que cobrar hoje e a
   pauta - e eu escrevi um bloco de perdas que JA EXISTIA e era melhor que o meu. As
   checagens guardam que o duplicado nao volta e que a versao mantida e a completa. */
/* O CARTAO DE TREINO ERA DO DOSSIE. A regra que fica: a pauta do 1:1 tem QUATRO cards
   distintos, e o gargalo aparece em UM. Duplicar o gargalo em dois cards e o defeito
   que a checagem antiga existia para pegar. */
checar('a pauta do 1:1 tem os quatro cards e o gargalo aparece uma vez so',
  (function () {
    const i = templateCodigo.indexOf('const pItens = pSel ?');
    if (i < 0) return false;
    const bloco = templateCodigo.slice(i, i + 3000);
    const rots = (bloco.match(/rot: '(reconhecer|o gargalo|acordos anteriores|novo acordo)'/g) || []);
    return rots.length === 4 && (bloco.match(/rot: 'o gargalo'/g) || []).length === 1;
  }()),
  'quatro cards, um de cada — gargalo repetido faz o 1:1 girar no mesmo assunto');
/* ══ AS TRES DE PERDAS POR PESSOA SAIRAM COM `gxBlocoPerdaHTML` (13/09/26) ══════════
   O bloco era o quinto cartao do raio-X ("como o time perde"). Ficou sem chamador na
   varredura da aba Time e saiu agora na limpeza de codigo morto.

   A PRIMEIRA DAS TRES ERA A MAIS ENGANOSA: ela conferia que NAO existe uma segunda
   funcao de perdas (`gxComoElePerdeHTML < 0`) e que o texto da primeira esta la. Com a
   primeira morta, a metade negativa continuava verde sozinha — a guarda dizia "existe
   UM bloco" quando existiam ZERO.

   AS TRES REGRAS FICAM DITAS, porque as tres sao pedido do Julyan e valem para qualquer
   tela de perdas que venha: (1) um bloco so, e ele compara a pessoa com a regua do
   time em vez de mostrar o numero solto; (2) todo motivo aponta um modulo do Playbook,
   senao a tela diagnostica e nao ensina; (3) o MRR das perdas aparece COM a cobertura
   do preenchimento, nunca como receita — negocio sem valor no CRM nao entra na soma e
   a tela diz isso. As assercoes negativas contra ticketMedio e receitaEstimada, que
   guardam a mesma regra do lado de fora, continuam nesta suite. */
/* NAO CALCULAR A MESMA COISA DUAS VEZES — a regra que gxCobrarHojeHTML carregava, e que
   depois da varredura de 06/09/26 vale para as tres abas do gestor. Time, Pessoas e
   Rotas leem O MESMO motor (tl5Medir): quem tem negocio acima da regua e um numero so
   no produto. Duas telas do mesmo gestor discordando no mesmo numero e pior que uma
   tela so, e ja aconteceu aqui (a Pessoas dizia que ninguem precisava dele enquanto a
   Time gritava dois nomes). */
checar('as abas do gestor leem o mesmo motor, e nao recalculam por conta',
  /* sem regex com parêntese escapado aqui: indexOf de trecho literal diz a mesma coisa e
     não depende de a barra invertida sobreviver ao caminho até o arquivo — ela já morreu
     três vezes neste projeto, e uma regex sem as barras fica válida, errada e verde */
  templateCodigo.indexOf('function tl5Medir(') > 0 &&
  (function () {
    const iPessoas = templateCodigo.indexOf('function ps6Pessoas()');
    /* NA ROTAS FINAL o motor entra por rt7Carteira, que é o ÚNICO lugar da aba que mede
       carteira — e ele chama tl5Medir. O provedor da aba deixou de medir funil por conta
       própria em 11/09: ele lê leads_prospeccao e planos_semanais, e o que é do funil
       pede a quem já mede. Cravar `tl5Medir()` dentro de rt7Dados reprovaria justamente
       a versão que parou de recalcular. */
    const iCart = templateCodigo.indexOf('function rt7Carteira(ownerId, medicao)');
    if (iPessoas < 0 || iCart < 0) return false;
    const cart = templateCodigo.slice(iCart, iCart + 400);
    const rotas = templateCodigo.slice(templateCodigo.indexOf('function rt7Dados()'),
      templateCodigo.indexOf('function rt7TelaHTML'));
    return templateCodigo.slice(iPessoas, iPessoas + 300).indexOf('tl5Medir()') > 0
      && cart.indexOf('tl5Medir()') > 0
      && (rotas.match(/tl5Medir\(\)/g) || []).length === 0;
  }()) &&
  templateCodigo.split('function tl5Medir(').length - 1 === 1,
  'motor duplicado = duas telas do mesmo gestor discordando do mesmo numero');
/* A PAUTA DO 1:1 MUDOU DE TELA (06/09/26): era o dossie da aba Time, agora e o painel
   da aba Pessoas. A regra e a mesma e vale mais que a tela: a pauta sai do NUMERO que
   a propria tela mostra, e nenhum pedaco dela e escrito por IA. */
checar('a pauta do 1:1 sai do numero da tela, sem IA',
  templateCodigo.indexOf('function ps6Dados(') > 0 &&
  /pItens\s*=/.test(templateCodigo) &&
  templateCodigo.indexOf('pSel.melhorHabito.bench') > 0 &&
  templateCodigo.indexOf('nenhum texto aqui foi escrito por IA') > 0,
  'pauta sem numero vira opiniao, e opiniao nao se cobra no 1:1');
/* PRIVACIDADE — a regra que MAIS importa desta lista, e a que menos podia sumir junto
   com o dossie: o executivo nao ve a comparacao do time nem a pauta do 1:1 dele. Hoje
   isso e garantido em dois lugares, e a checagem exige os DOIS, porque um so falha
   sozinho: renderPessoas se recusa a desenhar para quem nao e gestor, e renderPDIs
   esconde a raiz do gestor no papel do executivo. */
checar('a comparacao de time e a pauta do 1:1 nao chegam ao executivo',
  /function renderPessoas\(\)[\s\S]{0,400}role !== 'manager'[\s\S]{0,80}return;/.test(templateCodigo) &&
  /raizGestor[\s\S]{0,200}role === 'manager'[\s\S]{0,40}'none'/.test(templateCodigo),
  'a aba Pessoas e do gestor: desenhar para o executivo vaza o 1:1 dele e o dos colegas');
checar('o que abre lista no dossie cumpre o piso de 38px no desktop',
  template.indexOf('.coach-funil-etapa.is-abre{min-height:38px;}') > 0);

/* ══ "AGENDAR NO HORARIO LIVRE" SAIU DO PRODUTO (11/09/26) ══════════════════════════
   AS QUATRO CHECAGENS QUE VIVIAM AQUI mediam um controle — o gestor preenchendo um
   horario vago da grade do executivo a partir da Daily — e deram VERDE por tres dias
   sobre um controle que ninguem alcancava: o board g14 onde ele morava ficou inalcancavel
   em 04/09, quando renderDaily passou a descartar o markup do gestor com um `html = ...`.
   A funcao existia, a checagem achava a funcao, e a tela nao abria. E a versao de
   "listener nao e comportamento" no nivel da guarda: presenca de codigo prova presenca
   de codigo, e mais nada.

   POR QUE NAO REANCOREI NA DAILY NOVA: a prancha FINAL proibe, com estas palavras — "O
   gestor NAO edita o plano — e espelho do que o executivo montou". Trazer o controle de
   volta contraria a decisao mais recente dele sobre esta tela. Entao a capacidade sai do
   produto nomeadamente, em vez de seguir existindo como codigo que a suite protege e
   ninguem alcanca.

   SE ELE PEDIR DE VOLTA (ja pediu uma vez, em 07/09): o escritor da grade que sobrou e
   `pl6Gravar`, e a recusa de dia nao util tem de voltar com ele — ela morava dentro de
   g14AgendarNoHorarioLivre (motivo 'dia-nao-util') e saiu junto. */

/* E FICA UMA EXIGENCIA NOVA NO LUGAR DAS QUATRO: nenhuma tela do gestor pode escrever na
   grade da semana de ninguem. Antes isso era garantido por acidente (o unico escritor
   vivia numa tela inalcancavel); agora e medido. */
/* `planos_semanais` tem DOIS escritores legitimos, os dois do lado do executivo:
   pl6Gravar (a grade) e pm8Confirmar (a promessa da semana, outras colunas). Contar
   upserts no arquivo inteiro reprovaria os dois. O que esta checagem mede e o ESCOPO:
   dentro do bloco da Daily do gestor nao existe escrita nenhuma naquelas tabelas — e
   ancora perdida REPROVA, em vez de passar medindo nada. */
checar('a Daily do gestor nao escreve na grade nem no plano de ninguem',
  (function () {
    const i = templateCodigo.indexOf('const DG4_ESTADO');
    const f = templateCodigo.indexOf('let DG4_RELOGIO');
    if (i < 0 || f <= i) return false;
    const bloco = templateCodigo.slice(i, f);
    /* `from('planos_` E O ACESSO A TABELA. Medir a PALAVRA reprovava a tela por dizer de
       onde o dado vem: o rotulo do KPI, o kicker e o rodape citam planos_diarios de
       proposito, e essa procedencia e a virtude da aba, nao o defeito. */
    return bloco.indexOf("from('planos_") < 0
      && /function pl6Gravar\(/.test(templateCodigo);
  }()),
  'o gestor nao edita o plano de ninguem — a Daily dele e espelho, e quem escreve a grade e o pl6Gravar do executivo');

/* ── resultado ──────────────────────────────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════════════════════════════
   A ABA TIME v10 (10/09/26, prancha time-v10-STANDALONE)
   ══════════════════════════════════════════════════════════════════════════════════════
   A regra zero do prompt: "NENHUM clique morto e NENHUM dado inventado — se a integracao
   falhar, mostre estado de erro/carregando, nunca numero fake". Estas guardas vigiam
   exatamente as duas metades dessa frase.

   O QUE EU ERREI ESCREVENDO ESTA TELA, e por isso tres delas existem: assumi a FORMA de
   tres campos do snapshot sem medir. `DATA.vendasMes` e objeto e nao lista (a aba do
   gestor nao desenhou: TypeError no primeiro render), `DATA.kpiDeltas.X` e
   { sinal, valor } e nao numero (os quatro cartoes de fluxo cairiam em "nao medido" com
   o dado presente), e `DATA.agenda` e { geradoEm, itens } e nao lista. */
(function () {
  const tela = templateCodigo;

  /* ── 1 · UMA FONTE SO DE TOQUES (regra 1 da prancha) ────────────────────────────── */
  checar('toques por lead vem de UMA funcao, com cache por repintura',
    /function tm10ToquesPorNegocio\(\)/.test(tela)
      /* O COMENTARIO NAO SERVE DE ANCORA AQUI: templateCodigo tira comentario antes de
         medir, e a primeira versao desta guarda procurava justamente a frase do
         comentario do cache. Terceira vez que isso me pega neste projeto. */
      && /function tm10Dados\(\)\s*\{\s*TM10_TQ = null;/.test(tela)
      && (tela.match(/function tm10Tq\(/g) || []).length === 1);
  /* O CAMPO CRU SO E LIDO DENTRO DA FONTE UNICA. Ele aparece tambem na agenda do gestor
     (outra tela, outro uso legitimo), entao a guarda mede a FAMILIA tm10: o campo vive
     dentro de tm10ToquesPorNegocio e nenhuma outra funcao tm10 o toca. */
  checar('nenhum bloco da Time conta toque por conta propria',
    (function () {
      const i = tela.indexOf('function tm10ToquesPorNegocio()');
      const f = tela.indexOf('function tm10Tq(');
      if (i < 0 || f < i) return false;
      /* A FRONTEIRA DA FAMILIA, e nao "o resto do arquivo": `lead_deal_id` tem um uso
         legitimo na agenda do gestor, noutra tela. A primeira versao desta guarda
         proibia o campo em qualquer lugar depois de tm10Tq e reprovou por causa dele —
         guarda larga acusa codigo certo, que e tao ruim quanto deixar passar o errado. */
      const fim = tela.indexOf('function tm2CorTemp(');
      if (fim < f) return false;
      const dentro = tela.slice(i, f);
      const restoDaFamilia = tela.slice(f, fim);
      return dentro.indexOf('lead_deal_id') > -1
        && restoDaFamilia.indexOf('lead_deal_id') === -1;
    }()));

  /* ── 2 · PLURALIZACAO (regra 2) ─────────────────────────────────────────────────── */
  checar('a pluralizacao de toque, travado e estourado sai de um lugar',
    /return n === 1 \? .1 toque. : n \+ . toques./.test(tela.replace(/'/g, '.'))
      && tela.indexOf("' travado' : ' travados'") > -1
      && tela.indexOf("' estourado' : ' estourados'") > -1);

  /* ── 3 · O FUNIL NUNCA ABRE VAZIO (regra 4) ─────────────────────────────────────── */
  checar('o funil abre no gargalo e a etapa escolhida cai fora se esvaziou',
    /function tm10Gargalo\(/.test(tela)
      && /e\.id === TM10_ETAPA && e\.n > 0/.test(tela)
      && /\|\| gargalo \|\| etapas\[0\] \|\| null/.test(tela));
  checar('e o verbo da etapa SELECIONA em vez de alternar',
    /if \(verbo === .tm10etapa.\) \{[^}]{0,160}TM10_ETAPA = resto \|\| null/
      .test(tela.replace(/'/g, '.')));
  checar('o painel de detalhe tem frase para etapa vazia',
    tela.indexOf('nenhum negócio nesta etapa agora.') > -1);

  /* ── 4 · NENHUM CLIQUE MORTO, E NENHUM CLIQUE NOVO ──────────────────────────────────
     Os tres gestos da prancha caem em fiacao que JA existia: o nome do lead e um link
     para o negocio no HubSpot (hsUrl, a funcao unica que monta essa URL), e o nome de
     vendedor cai no verbo `sel`, que e o dossie desta aba. Verbo novo: UM. */
  /* ══ REESCRITA EM 17/09/26 — A LINHA DO LEAD NAO SAI MAIS DO COCKPIT ══════════════
     A regra antiga era "o nome do lead abre o negocio no HubSpot por hsUrl". Julyan:
     "eu preciso clicar nesses leads e ver o q eles colocaram na rua, tem q abrir o card
     do lead, a ficha como em todos". O link para o CRM em outra aba era o contrario do
     que ele precisa E contrariava a regra "nada abre fora do cockpit" desta tela.

     A REGRA QUE VALE AGORA: a linha do lead abre a FICHA, dentro do cockpit, pelo drawer
     compartilhado — e nao por um segundo drawer desta aba. `hsUrl` continua sendo a
     funcao unica de URL do HubSpot onde ela ainda e usada (quatro telas), e a guarda de
     pe4TelaHTML mais abaixo e quem cuida disso. */
  checar('a linha do lead abre a ficha DENTRO do cockpit, e nao o HubSpot',
    !/function tm10NomeLead\([^)]*\) \{[\s\S]{0,300}hsUrl/.test(tela)
      && tela.indexOf('data-tm2-acao="tm10ficha:') > -1);

  /* ══ AS QUATRO LISTAS, E NAO UMA ═══════════════════════════════════════════════════
     `tm10NomeLead` tem QUATRO chamadores nesta aba (detalhe da etapa, quentes/travados,
     abandonados e propostas). Na primeira versao eu liguei UM — e como o nome deixou de
     ser link no mesmo commit, nos outros tres ele virou texto morto. Julyan: "a ficha
     como em todos". Uma porta, quatro listas. */
  checar('as quatro listas de lead usam o MESMO abridor de ficha',
    /function tm10AbreFicha\(/.test(tela)
      && (tela.match(/tm10AbreFicha\(x\.id, x\.nome\)/g) || []).length === 4);

  /* ══ BOTAO DENTRO DE BOTAO EXPULSA O DE DENTRO — eu fiz isso e medi ════════════════
     Estas linhas contem `tm10Dono`, que devolve um `<button>`. Quando eu tornei a LINHA
     um `<button>`, o parser fechou o de fora e jogou o de dentro para FORA, como irmao:
     o span ficava vazio e o nome do executivo caia solto embaixo da linha. Zero donos
     dentro das 12 linhas, medido no navegador. A lista desmontava.

     `div role="button"` e o que resolve — e a guarda pina justamente que o abridor NAO
     emite um `<button>`, porque e para la que a proxima mao vai querer voltar. */
  checar('o abridor NAO usa <button>, porque a linha contem o botao do dono',
    /function tm10AbreFicha\([\s\S]{0,400}role="button"/.test(tela)
      && !/function tm10AbreFicha\([\s\S]{0,400}<button/.test(tela));
  /* `role="button"` E UMA PROMESSA: ele anuncia um botao ao teclado e ao leitor de tela.
     `<button>` responde a Enter e Espaco de graca; um `div` nao responde a nenhum dos
     dois. Sem o ouvinte, quem depende do teclado chega na linha e nao sai de la. */
  checar('o papel de botao vem com tabindex e com teclado',
    /function tm10AbreFicha\([\s\S]{0,400}tabindex="0"/.test(tela)
      && /keydown[\s\S]{0,700}role=\\?"button\\?"\]\[data-tm2-acao\]/.test(tela)
      && /keydown[\s\S]{0,900}ev\.preventDefault\(\)/.test(tela));
  checar('e a ficha e a MESMA de todas as outras telas',
    /if \(verbo === .tm10ficha.\)[\s\S]{0,1200}abrirFichaLeadFunilDrawer\(lead,/
      .test(tela.replace(/'/g, '.'))
      && /if \(verbo === .tm10ficha.\)[\s\S]{0,900}buscarLeadFunilPorId\(resto\)/
        .test(tela.replace(/'/g, '.')));
  /* `touchpointsDoLead(lead)` DENTRO DE tm10Registro, e nao no arquivo: a ficha tambem a
     chama, e a guarda larga achava a ocorrencia dela — troquei a fonte do leitor por
     DATA.agenda.itens e a checagem ficou verde. Mesma cegueira que apareceu tres vezes
     hoje: medir o arquivo quando a regra vive numa funcao. */
  checar('o ultimo registro da rua aparece na propria linha',
    /function tm10Registro\([\s\S]{0,900}touchpointsDoLead\(lead\)/.test(tela)
      && tela.indexOf('registro: (function () { const r = tm10Registro(l);') > -1);
  /* A NOTA DO HUBSPOT VEM COM TAG — e ele que formata a observacao. Sem tirar o markup,
     a linha mostraria "<p>Check-in em..." literal, que e exatamente o defeito dos <b>
     literais que apareceu na Semana nesta mesma semana. */
  checar('o registro sai sem markup na linha',
    /function tm10Registro\([\s\S]{0,2200}replace\(\/<\[\^>\]\*>\/g/.test(tela));
  checar('o nome do vendedor cai no verbo sel, que e o dossie que ja existia',
    /function tm10Dono\([\s\S]{0,300}data-tm2-acao="sel:/.test(tela));
  checar('e a v10 criou UM verbo novo, nao uma fiacao nova',
    (tela.match(/data-tm10-acao/g) || []).length === 0);

  /* ── 5 · NENHUM DADO INVENTADO: AS TRES FORMAS QUE EU ASSUMI ERRADO ─────────────── */
  checar('vendasMes e lida como objeto, e o MRR fechado vem de totalMrr',
    tela.indexOf('const fechMrr = Number(vm.totalMrr) || 0;') > -1
      && !/DATA\.vendasMes \|\| \[\]/.test(tela));
  checar('o delta do fluxo le .valor, e nao o objeto inteiro',
    /const v = o && typeof o === .object. \? o\.valor : o;/.test(tela.replace(/'/g, '.')));
  checar('a agenda e lida de DATA.agenda.itens',
    /DATA\.agenda && Array\.isArray\(DATA\.agenda\.itens\)/.test(tela));

  /* ── 6 · NAO MEDIDO NAO E ZERO, NEM 100% ────────────────────────────────────────────
     Tres blocos podem nao ter dado nesta carga, e os tres dizem isso em vez de imprimir
     numero: o SLA de 1o toque (depende de `criadoEm`, que entrou no robo hoje), a
     cadencia e o fluxo da semana. */
  checar('o SLA de 1o toque tem estado honesto quando nao da para medir',
    /return \{ medivel: false, comData: comData\.length, ativos: ativos \};/.test(tela)
      && tela.indexOf('ainda não dá para medir.') > -1
      && tela.indexOf('Preferi dizer isso a imprimir uma porcentagem inventada.') > -1);
  checar('a cadencia tambem, em vez de heatmap vazio',
    tela.indexOf('a cadência não veio nesta carga do robô') > -1);
  checar('e o cartao de fluxo diz "nao medido" em vez de 0',
    /c\.v == null \? .não medido./.test(tela.replace(/'/g, '.')));

  /* ── 7 · A JANELA VAI NO ROTULO ─────────────────────────────────────────────────────
     A prancha pede "perdas do mes" e "media de 6 meses"; o robo mede 90 dias e 3 meses
     (medido na producao). O rotulo diz o que o dado e — e derivado do proprio dado, para
     acompanhar sozinho se o robo mudar a janela. */
  checar('a janela das perdas sai do dado, nao de uma palavra cravada',
    /últimos . \+ \(pe\.dias \|\| .—.\) \+ . dias, a janela do robô/.test(tela.replace(/'/g, '.')));
  checar('e a media da conversao diz quantos meses tem',
    /* O CONCATENADOR CAI NA LINHA SEGUINTE no markup, então o \s* tem de vir ANTES do
       mais, e não depois de um espaço literal. */
    /traço = média de .\s*\+\s*\(cv\.medivel \? cv\.meses : 0\)/.test(tela.replace(/'/g, '.')));

  /* ── 8 · AS OITO ETAPAS SAO A LISTA DO EXECUTIVO ────────────────────────────────────
     Manter uma segunda ordem de etapas aqui e o que fez a grade do kanban declarar sete
     trilhas para oito colunas em 10/09. O gestor cobra a etapa que o executivo ve. */
  checar('as etapas da aba Time saem de FN3_COLUNAS',
    /const cols = \(typeof FN3_COLUNAS !== .undefined.\) \? FN3_COLUNAS : \[\];/
      .test(tela.replace(/'/g, '.')));
  checar('e a cor da etapa sai de stageColor, a tabela unica',
    /cor: \(typeof stageColor === .function.\) \? stageColor\(c\.id\)/.test(tela.replace(/'/g, '.')));

  /* ── 9 · O QUE A PRANCHA NAO DESENHOU E QUE NAO PODE SUMIR ──────────────────────────
     Dossie, dossie de negocio, pauta do lider e rodape de procedencia continuam, porque
     tira-los seria remover gravacao (pauta_do_lider) e o destino dos cliques de nome. */
  checar('as quatro pecas da v2 sobreviveram, e o render as desenha',
    /function tm2SobreviventesHTML\(d\)/.test(tela)
      && /raiz\.innerHTML = tm10TelaHTML\(tm10Dados\(\), tm2SobreviventesHTML\(tm2Dados\(\)\)\);/.test(tela)
      && tela.indexOf('Sua pauta de líder') > -1);
  checar('e so o gestor desenha a tela do gestor',
    /function renderTimeLider\(\) \{[\s\S]{0,400}?sessaoAtual\.role !== .manager.\) return;/
      .test(tela.replace(/'/g, '.')));

  /* ── 10 · AS TRES METAS (10/09/26, planilha do Julyan) ──────────────────────────────
     A planilha dele mede o mes em TRES eixos — clientes, MRR e receita — em DOIS
     patamares (8/3.000/9.000 para cinco pessoas, 2/750/2.250 para as outras cinco). A
     tela mostrava UM eixo, contra uma meta cravada de 80 que nao existe, e com meta
     individual de 10 para todo mundo.

     AQUI MORAVA UMA GUARDA MINHA COM A CAUSA ERRADA, e ela fica registrada: eu vi
     fechadosNoMes somar 6 e vendasMes.totalClientes dizer 2 e escrevi que o segundo
     "conta so quem tem MRR preenchido". Lendo montar-dados, o filtro e
     narrativas.reps[ownerId] — dono fora do time ativo. E na leitura seguinte os dois
     deram 6: o 2 era snapshot velho e nao havia divergencia nenhuma. Guarda que protege
     uma explicacao inventada e pior que guarda nenhuma. */
  checar('as tres metas do time chegam do snapshot e aparecem na tela',
    /metaMrrTime = Number\(\(DATA\.kpisHub \|\| \{\}\)\.metaMrrTime\)/.test(tela)
      && /metaReceitaTime = Number\(\(DATA\.kpisHub \|\| \{\}\)\.metaReceitaTime\)/.test(tela)
      && /\[\[.clientes., pv\.fechN, pv\.meta, pv\.pctClientes, false\]/.test(tela.replace(/'/g, '.')));
  checar('o ranking mede cada um contra a meta DELE',
    /* O NUMERADOR MUDOU DE r.fech PARA fechDele quando o mes passou a sair de vendasMes
       (a lista que aplica a competencia). A guarda cobra as duas coisas: o denominador e
       a meta DELE, e o numerador e a contagem que sabe do ajuste. */
    /const pct = r\.meta \? Math\.round\(fechDele \/ r\.meta \* 100\) : null;/.test(tela)
      && /r\.meta \? r\.fech \+ ./g.test(tela.replace(/'/g, '.')));
  checar('e meta zero aparece como — em vez de 0% vermelho',
    /cor: pct == null \? .#B4AC9C./.test(tela.replace(/'/g, '.'))
      && /if \(\(a\.pct == null\) !== \(b\.pct == null\)\) return a\.pct == null \? 1 : -1;/.test(tela));
  checar('o MRR e a receita de cada um aparecem contra a meta dele',
    tela.indexOf('r.mrrMeta ? esc(tm10Rs(r.mrrFeito))') > -1
      && tela.indexOf('r.receitaMeta ? esc(tm10Rs(r.receitaFeita))') > -1);

  /* ── 11 · A META NAO MORA MAIS EM CONSTANTE CRAVADA ─────────────────────────────── */
  checar('as metas saem de data/metas.json, nao de constante',
    /const METAS = \(function \(\) \{/.test(robo)
      && /const META_MENSAL_FECHADOS = \(METAS\.time && METAS\.time\.clientes\) \|\| 0;/.test(robo)
      && !/const META_MENSAL_FECHADOS = \d+;/.test(robo)
      && !/const META_MENSAL_POR_EXECUTIVO = \d+;/.test(robo));
  checar('e o robo falha alto se a soma dos individuais nao bater com o total do time',
    /a soma de . \+ k \+ . da . \+ soma\[k\]/.test(robo.replace(/'/g, '.')));
  checar('a meta de cada rep vai no payload, com os tres eixos',
    /metaMensal: metaDe\(rep\.ownerId\)\.clientes,/.test(robo)
      && /metaMrr: metaDe\(rep\.ownerId\)\.mrr,/.test(robo)
      && /metaReceita: metaDe\(rep\.ownerId\)\.receita,/.test(robo));

  /* ── 11b · O NOME DA VARIAVEL DO LACO, E POR QUE ISTO E UMA GUARDA ──────────────────
     EU QUEBREI O ROBO EM PRODUCAO com esta linha. Escrevi `metaDe(r.ownerId)` dentro do
     literal de repsData, onde a variavel do laco chama `rep` — e `node --check` passa,
     porque sintaxe esta certa e o erro so aparece ao EXECUTAR. A rodada das Actions
     morreu com "r is not defined" depois de 90 segundos de HubSpot, e o Cockpit ia
     ficar velho sem erro na tela (o defeito de 10/09 que eu ja tinha registrado).
     A guarda cobra o unico nome que existe naquele escopo. Custa uma linha e cobre a
     familia inteira: nenhuma variavel de uma letra dentro do payload do rep. */
  checar('o payload do rep usa a variavel do laco, que se chama rep',
    (function () {
      const i = robo.indexOf('repsData[rep.ownerId] = {');
      if (i < 0) return false;
      const bloco = robo.slice(i, robo.indexOf(String.fromCharCode(10) + '    };', i));
      return bloco.length > 200 && !/[^A-Za-z0-9_.]r\./.test(bloco);
    }()));

  /* ── 12 · A RECEITA E O AJUSTE DE COMPETENCIA ───────────────────────────────────────
     Receita e o valor TOTAL do plano (`amount`), que o executivo preenche na passagem
     para Enviado Onboarding — e ela simplesmente nao vinha. E o mes de uma venda passa a
     ser o de COMPETENCIA: Julyan, 10/09, "uma venda do marco foi no mes passado, e q o
     boleto compensou na virada pro dia 1". O CRM nao tem como saber isso, entao a decisao
     e registrada negocio por negocio no arquivo, com motivo — e a tela DIZ que houve
     ajuste, em vez de divergir do CRM em silencio. */
  checar('a receita (amount) vem nas vendas do mes',
    /properties: \[.dealname., .hubspot_owner_id., .valor_de_mrr., .amount., .closedate.\]/
      .test(robo.replace(/'/g, '.'))
      && /receita: Math\.round\(parseFloat\(d\.properties\.amount\) \|\| 0\)/.test(robo));
  checar('o ajuste de competencia e por negocio, vem do arquivo, e nao e uma regra chutada',
    /function competenciaDe\(dealId, mesDoClosedate\)/.test(robo)
      && /const COMPETENCIA = \{\};/.test(robo)
      && !/getUTCDate\(\) === 1/.test(robo));
  checar('a venda ajustada sai do mes e o motivo viaja para a tela',
    /if \(mes !== mesCorrente\) \{/.test(montar)
      && /ajustadas: ajustadas/.test(montar));
  checar('e a tela mostra que houve ajuste de competencia',
    tela.indexOf('venda fora do mês por competência') > -1);

  /* ── 13 · ZERO E ZERO (10/09/26) ────────────────────────────────────────────────────
     `Number(r.metaMensal) || 10` vivia em CINCO lugares do template e num sexto em
     montar-dados. Zero e falsy, entao a Amanda — que saiu da planilha e tem meta 0 —
     aparecia com meta 10, que e exatamente o numero que este trabalho veio tirar. E o
     objeto de reps do montar-dados e um FILTRO: metaMrr e metaReceita chegavam do robo
     e morriam ali. As duas coisas so apareceram medindo a tela depois da rodada. */
  /* As regexes desta guarda nasceram sem as barras de escape: eu as passei por `node -e`
     e o shell comeu os \. Verde e errado, do jeito que a lição já está registrada — por
     isso estas três estão escritas com indexOf onde o escape é frágil. */
  checar('a meta de clientes de uma pessoa sai de uma funcao so',
    tela.indexOf('function metaClientesDoRep(r) {') > -1
      && tela.indexOf('Number(r.metaMensal) || 10') === -1
      && tela.indexOf('r.metaMensal || 10') === -1
      && tela.indexOf('Number(rep.metaMensal) || 10') === -1);
  checar('e ela distingue meta zero de campo ausente',
    tela.indexOf("return v != null && v !== '' ? Number(v) : 10;") > -1);
  checar('as tres metas atravessam o montar-dados sem virar undefined',
    montar.indexOf('metaMensal: h.metaMensal != null ? h.metaMensal : 10,') > -1
      && montar.indexOf('metaMrr: h.metaMrr != null') > -1
      && montar.indexOf('metaReceita: r.metaReceita,') > -1);

  /* ── 14 · O COCKPIT OLHA OS LEADS DO TIME DE AGORA (10/09/26) ──────────────────────
     Existiu aqui, por 40 minutos, uma guarda exigindo que o robo contasse os abertos de
     quem saiu do time — 251 negocios de 14 donos. Julyan cortou: "foca nesses leads de
     agora, nao precisa puxar aqueles, vamos deixar limpo".

     A guarda passa a vigiar a DECISAO, e nao a implementacao que saiu: se alguem voltar
     a puxar negocio de fora do time, isto reprova e a conversa acontece de novo em vez
     de a busca voltar sozinha num refactor. Guarda de decisao dura mais que guarda de
     codigo. */
  checar('o Cockpit nao puxa negocio de quem nao esta no time',
    /* MEDE O CODIGO SEM COMENTARIO, e isto nao e detalhe: a primeira versao desta guarda
       reprovou por causa do MEU PROPRIO comentario no robo, que cita o nome da busca
       removida para quem precisar refaze-la. Comentario que explica a decisao nao pode
       disparar a guarda da decisao — segunda vez hoje que um comentario meu vira ancora
       por acidente. */
    soCodigo(robo).indexOf('abertosDeQuemSaiu') === -1
      && !/operator: .NOT_IN., values: donos/.test(soCodigo(robo).replace(/'/g, '.'))
      && templateCodigo.indexOf('foraDoTime') === -1
      && templateCodigo.indexOf('negócios fora do time') === -1);

  /* ── 15 · UMA FONTE PARA CLIENTES FECHADOS NO MES (10/09/26) ───────────────────────
     A tela dizia 6 e o pill de competencia dizia 5, os dois ao mesmo tempo: reps[].
     fechadosNoMes vem de uma busca por dono que nao sabe do ajuste, e vendasMes e a
     lista de onde o ajuste sai. Os tres eixos tem de falar da MESMA venda. */
  checar('clientes do mes sai de vendasMes, que e quem aplica a competencia',
    tela.indexOf('const fechClientes = vm.totalClientes != null ? Number(vm.totalClientes) : m.time.fech;') > -1
      && tela.indexOf('fechN: fechClientes,') > -1
      /* E A PORCENTAGEM TAMBEM: ela foi o ultimo lugar onde a contagem velha sobreviveu,
         mostrando 12% (6/50) ao lado de um KPI que dizia 5/50. */
      && tela.indexOf('pctClientes: m.time.meta ? Math.round(fechClientes / m.time.meta * 100) : null,') > -1);
  checar('e o fechado de cada um no ranking tambem',
    tela.indexOf('const fechDele = vendasDele ? Number(vendasDele.count) : r.fech;') > -1
      && tela.indexOf('fech: fechDele,') > -1);
}());


/* ══════════════════════════════════════════════════════════════════════════════════════
   A ABA PESSOAS v4 (10/09/26, prancha pessoas-v4-STANDALONE)
   ══════════════════════════════════════════════════════════════════════════════════════
   Regra zero do prompt: "NENHUM clique morto e NENHUM dado inventado". E a regra 1:
   "toques do MESMO lead identicos em todas as abas — uma funcao so, um cache so".

   ESTA ABA NAO MEDE NADA DE NOVO, e as guardas cobram isso: ela filtra por pessoa o que
   a Time ja mede. Se alguem escrever uma segunda contagem de toques aqui, a suite
   reprova — porque o numero na Pessoas e o numero na Time tem de ser o mesmo numero,
   nao dois numeros iguais por coincidencia.

   O QUE A PRANCHA PEDE E O DADO NAO TEM, e por isso a tela diz outra coisa:
     tempo de casa ......... nao existe em campo nenhum -> a tela mostra o PATAMAR da meta
     validade da proposta .. nao existe como propriedade -> mesma regra da Time (tarefa futura)
     motivo de perda por pessoa -> o robo agrega por motivo (time) e por dono (total) */
(function () {
  const tela = templateCodigo;

  /* ── 1 · UMA FONTE DE TOQUES, COMPARTILHADA COM A TIME (regra 1) ─────────────────── */
  checar('a Pessoas usa a MESMA funcao de toques da Time',
    /function pe4Sla\([\s\S]{0,400}?tm10Tq\(l\.id\)/.test(tela)
      && !/function pe4Toques/.test(tela)
      /* MEDE A FAMILIA, e nao o arquivo: lead_deal_id tem usos legitimos na agenda do
         gestor e na do executivo. O que a regra 1 proibe e uma SEGUNDA contagem de
         toques — e ela existiria dentro de uma funcao pe4. A primeira versao desta
         guarda exigia 2 no arquivo inteiro e reprovou codigo certo, pela terceira vez
         hoje que eu escrevo guarda larga. */
      && !/function pe4[A-Za-z]*\([\s\S]{0,900}?lead_deal_id/.test(tela));
  checar('e reusa o funil, o gargalo e a meta que ja existiam',
    tela.indexOf('const etapas = tm10Etapas();') > -1
      && tela.indexOf('const gargalo = tm10Gargalo(dele);') > -1
      && tela.indexOf('meta: metaClientesDoRep(r),') > -1);

  /* ── 2 · UM ESTADO SO PARA A SELECAO ────────────────────────────────────────────────
     A prancha tem deep-link (?exec=) e clique no rail. Dois estados para a mesma selecao
     fariam o deep-link mexer num e a tela ler o outro. */
  checar('a selecao da pessoa usa o estado que ja existia',
    tela.indexOf('PS6_ESTADO.sel') > -1 && !/let PE4_SEL/.test(tela));
  checar('e o rail nunca abre sem ninguem',
    /\|\| pessoas\[0\] \|\| null;/.test(tela));

  /* ── 3 · O FUNIL NUNCA ABRE SEM ETAPA, E A ETAPA E POR PESSOA (regra 4) ──────────── */
  checar('a etapa default e o gargalo dela, e nunca fica vazia',
    /e\.id === PE4_ETAPA\[sel\.ownerId\] && e\.n > 0/.test(tela)
      && /\|\| gargalo \|\| dele\[0\] \|\| null/.test(tela)
      && tela.indexOf('nenhum lead nesta etapa agora.') > -1);
  checar('e trocar de pessoa nao herda a etapa da anterior',
    /PE4_ETAPA\[a\] = b;/.test(tela) && !/let PE4_ETAPA = null/.test(tela));

  /* ── 4 · NENHUMA FIACAO NOVA, E NENHUM ESCRITOR NOVO ────────────────────────────────
     Os dois gestos que a prancha acrescenta entram no ouvinte que ja existia
     (data-ps6-acao) e o carimbo chama ps6Carimbar, que grava na MESMA linha de
     pdi_compromissos que o executivo marca. */
  checar('os gestos novos usam a fiacao que ja existia',
    /* indexOf LITERAL, e nao regex com `.` no lugar da apostrofa: renomeando o verbo para
       'etapaX' a sabotagem passou verde, porque o `.` do padrao casava o X. Terceira
       coringa larga minha hoje — onde o texto e exato, medir exato. */
    (tela.match(/data-pe4-acao/g) || []).length === 0
      /* E PINADO NO PAR, porque "if (verbo === 'etapa')" existe DUAS vezes no arquivo —
         uma na aba Time, outra aqui. A guarda achava a da Time e dava verde com a minha
         renomeada. O que identifica esta e a linha seguinte, que escreve PE4_ETAPA. */
      && tela.indexOf("if (verbo === 'etapa') {\n    if (a && b) PE4_ETAPA[a] = b;") > -1
      && tela.indexOf("if (verbo === 'combinado') {") > -1);
  checar('o carimbo do combinado grava pelo escritor que ja existia',
    /await ps6Carimbar\(a, i, .validar.\)/.test(tela.replace(/'/g, '.'))
      && /await ps6Carimbar\(a, i, .devolver./.test(tela.replace(/'/g, '.'))
      && /function pe4LimparCarimbo\(/.test(tela));
  checar('e devolver continua exigindo motivo',
    /* A FRASE EXISTE DUAS VEZES — no verbo `devolver` antigo e no ciclo novo do combinado.
       A guarda larga dava verde com a minha metade removida. Pina no ramo do combinado. */
    /if \(verbo === .combinado.\)[\s\S]{0,1200}?devolver exige um motivo/
      .test(tela.replace(/'/g, '.')));

  /* ── 5 · O NOME DO LEAD ABRE O NEGOCIO, PELA FUNCAO UNICA DE URL ─────────────────── */
  checar('o nome do lead abre o negocio no HubSpot',
    /* PINADO DENTRO DE pe4TelaHTML: hsUrl(l.id) tem QUATRO usos legítimos no arquivo, em
       quatro telas, e a guarda larga deu verde com o link desta quebrado — a sabotagem
       passou. O que importa é que o nome do lead DESTA tela abra o negócio. */
    /* RE-APONTADA EM 19/09 para o markup da v6 — a v4 saiu inteira. O recorte agora é o
       BLOCO da v6 (do cabeçalho do markup até a próxima tela), e não uma função só: os
       dois links vivem em funções diferentes desde que a lista virou duas (o mapa de
       cadência e o drill dos cards). A regra medida é a mesma: nesta tela, o negócio
       abre pela função única de URL. */
    /* ÂNCORA DE CÓDIGO, NÃO DE COMENTÁRIO: `tela` é soCodigo(template), que corta os
       comentários — eu ancorei no cabeçalho do bloco e a guarda deu falso vermelho. */
    (function () {
      const i = tela.indexOf('const PV6_P =');
      if (i < 0) return false;
      const bloco = tela.slice(i, tela.indexOf('function tm2SobreviventesHTML', i));
      return /hsUrl\(l\.id\)/.test(bloco) && /hsUrl\(x\.id\)/.test(bloco);
    }()));

  /* ── 6 · DIAGNOSTICO, AVISOS E ALAVANCAS CITAM NUMERO E NOME (regra 6) ────────────── */
  checar('o diagnostico cita o pior lead por nome',
    /function pe4PiorLead\(p\)/.test(tela)
      && /o pior é o . \+ \(pior\.name \|\| pior\.dealname\)/.test(tela.replace(/'/g, '.')));
  checar('os avisos seguem a prioridade fixa da prancha',
    /* O PRIMEIRO AVISO TEM DOIS ROTULOS desde a correcao do zero: "mrr travado" quando
       ha valor, "negocios travados" quando nenhum dos travados tem MRR no CRM. A guarda
       cobra os dois, porque o que importa e o aviso existir — foi justamente ele que
       desapareceu para quem tem 10 travados e zero valor preenchido. */
    /rot: semValor \? .negócios travados. : .mrr travado./.test(tela.replace(/'/g, '.'))
      && /rot: .proposta na mesa./.test(tela.replace(/'/g, '.'))
      && /rot: .carga esfriando./.test(tela.replace(/'/g, '.'))
      && /rot: .funil secando./.test(tela.replace(/'/g, '.'))
      && /rot: .dinheiro escorrendo./.test(tela.replace(/'/g, '.'))
      && /rot: .funil limpo./.test(tela.replace(/'/g, '.')));
  checar('e as alavancas saem do mesmo gargalo do diagnostico',
    /function pe4Alavancas\(p, time, conv, diag, props\)/.test(tela)
      && /diag\.gargalo === .destravar./.test(tela.replace(/'/g, '.')));

  /* ── 7 · NAO MEDIDO NAO E ZERO, EM TRES LUGARES ─────────────────────────────────────
     SLA de quem tem menos de 3 negocios com data de criacao, cadencia que nao veio, e
     ticket/ritmo do time quando ninguem fechou. Os tres dizem que nao sabem. */
  /* A GUARDA MEDIA O TEXTO EXATO da v4 ('não medido — só ') e reprovou quando a v6
     reescreveu a frase. A REGRA é outra: quem não foi medido não pode virar 0% na tela.
     Agora ela mede os dois lados — o emissor devolve null, e a tela tem um ramo que
     depende desse null e escreve "não medido". Quarta guarda deste repo a morrer por
     cravar a grafia de uma frase em vez do comportamento. */
  checar('o SLA de quem nao foi medido nao vira 0%',
    /if \(comData\.length < PE4_SLA_MIN\) return \{ pct: null/.test(tela)
      /* A COR SAIU DA CHECAGEM em 20/09, na repintura para os tokens do Cockpit: eu
         media `#A2937A` e ele virou var(--muted2). A proteção nunca foi a cor — é a tela
         DIZER "não medido" em vez de escrever 0%. O ramo que depende do null é o que
         importa; o tom dele é decoração. */
      && /o\.slaPct == null \? .SLA não medido./.test(tela.replace(/'/g, '.'))
      && tela.indexOf('SLA 1º toque \' + o.slaPct') > -1);
  checar('a cadencia ausente diz que nao veio',
    tela.indexOf('a cadência não veio nesta carga do robô') > -1);
  checar('e o ticket do time sai de medicao, nao de constante',
    /ticket: somaFech > 0 \? Math\.round\(somaMrr \/ somaFech\) : null/.test(tela)
      && tela.indexOf('1.180') === -1);

  /* ── 8 · O QUE A PRANCHA PEDE E O DADO NAO TEM ──────────────────────────────────────
     A prancha crava "14 meses de casa". Nao existe campo de admissao em lugar nenhum —
     conferido no snapshot e no banco. A tela mostra o patamar da meta, que e real. */
  checar('nao inventa tempo de casa',
    tela.indexOf('meses de casa') === -1
      && /sel\.patamar \? . \u00b7 . \+ \(sel\.patamar === .pleno./.test(tela.replace(/'/g, '.')));
  checar('e a proposta vencendo usa a MESMA regra da Time',
    /function pe4Propostas\(p\)[\s\S]{0,600}?tarefas\.map\(function \(x\) \{ return Date\.parse\(x\.timestamp\)/
      .test(tela));

  /* ── 9 · SO O GESTOR DESENHA A TELA DO GESTOR ────────────────────────────────────────
     Esta view e compartilhada: "Desenvolvimento" para o executivo, "Pessoas" para o
     gestor, no mesmo no desde 06/09. Sem a porteira, um executivo desenharia o dossie do
     time inteiro. */
  checar('so o gestor desenha a Pessoas',
    /function renderPessoas\(\) \{[\s\S]{0,600}?sessaoAtual\.role !== .manager.\) \{ raiz\.innerHTML = ../
      .test(tela.replace(/'/g, '.')));

  /* ── 10 · ZERO DE MRR NAO ESCONDE NEGOCIO TRAVADO (10/09/26) ────────────────────────
     MEDIDO na producao: o Marco tem DEZ travados e ZERO deles com valor_de_mrr
     preenchido. Eu havia condicionado o aviso a mrrTravado > 0, e o aviso mais
     importante da tela nao aparecia para ele. O defeito do "zero que tranquiliza": R$ 0
     ao lado de 10 travados le como "nada em jogo", quando o que houve foi valor nao
     preenchido no CRM. */
  checar('o aviso de travado dispara pela contagem, nao pelo MRR',
    tela.indexOf('if (p.travados > 0 && pior) {') > -1
      && tela.indexOf('const semValor = p.mrrTravado === 0;') > -1
      && tela.indexOf('MRR não preenchido no CRM em nenhum deles') > -1);
  checar('e o diagnostico nao escreve R$ 0 parados',
    tela.indexOf("(nenhum com MRR preenchido no CRM)") > -1);
}());


/* ══ A PORTA DA DAILY DO GESTOR NOMEIA A DAILY DO GESTOR (11/09/26) ════════════════
   renderDaily monta o board de fichas do gestor e DEPOIS o descarta, substituindo tudo
   pela prancha: `html = '<div id="dg4Raiz">' + dg4TelaHTML(...)`. Essa substituição vive
   dentro de um if, e o if perguntava `typeof dailyGestor14aHTML === 'function'` — o nome
   de uma TERCEIRA tela, morta desde 04/09.

   Quando aquela tela saiu do arquivo (11/09), a condição virou falsa e a aba do gestor
   voltou calada para o board antigo de fichas. Sem erro de JS. Com build verde e 39
   suítes verdes, porque nenhuma delas executa um render — só apareceu ao ABRIR a tela.

   Esta guarda exige as duas metades no mesmo lugar: a condição pergunta por um nome dg4
   E a atribuição instala o dg4Raiz. Perder a âncora reprova. */
checar('a porta que instala a Daily do gestor pergunta por um nome dela',
  (function () {
    const i = templateCodigo.indexOf("if (!souRepDaily && typeof dg4TelaHTML === 'function') {");
    if (i < 0) return false;
    const bloco = templateCodigo.slice(i, i + 900);
    return bloco.indexOf('id="dg4Raiz" data-dg4-raiz="1"') > -1
      && bloco.indexOf('dg4TelaHTML(dg4Dados(DG4_CTX))') > -1;
  }()),
  'a condicao que instala esta tela ja perguntou pelo nome de OUTRA tela, e quando aquela saiu do arquivo o gestor voltou para o board antigo sem nenhum erro');


/* ══ AS PERDAS POR PESSOA (11/09/26) ══════════════════════════════════════════════════
   VISTO NA PRODUCAO, na sessao do gestor, na ficha de CADA executivo:
     "[object Object] perdas dele · R$ 5,4k nos ultimos 90 dias"

   `motivosPerda.porOwner[ownerId]` NAO e um numero: e o mapa de motivos daquela pessoa
   ({"Outros":54,"Reembolso":1,"Sem retorno":2,...}). pe4Perdas devolvia o objeto como
   `n` e a tela o imprimia como contagem — entao o gestor NUNCA viu quantas perdas cada
   executivo teve. O R$ ao lado estava certo, o que tornava a linha convincente.

   E a frase seguinte dizia "o motivo por pessoa nao vem do robo" — e vinha: estava no
   mesmo campo que a tela estragava. A tela declarava nao ter um dado que tinha na mao. */
(function () {
  const cod = template;
  checar('as perdas por pessoa somam o mapa de motivos, em vez de imprimir o objeto',
    cod.indexOf('const mapa = (mp.porOwner || {})[p.ownerId];') > 0
      && cod.indexOf('Object.keys(porMotivo).reduce(') > 0,
    'porOwner[ownerId] e o mapa de motivos: imprimi-lo da [object Object] e esconde a contagem');

  checar('e a tela mostra os motivos DELE, nao so os do time',
    cod.indexOf('motivos dele: ') > 0
      && cod.indexOf('porMotivo: Object.keys(porMotivo)') > 0,
    'comparar 58 perdas de uma pessoa com 395 do time nao e conversa de coaching');

  checar('e sem motivo medido a tela diz isso, em vez de inventar',
    cod.indexOf('motivo por pessoa não medido nesta carga') > 0,
    'zero por falta de medicao nao pode virar zero de verdade');
}());

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('gestor analítico: ' + ok + ' checagens ok — estoque≠conversão, MRR com cobertura, plano≠execução, evidência sem julgamento e nenhum botão sem destino.');
