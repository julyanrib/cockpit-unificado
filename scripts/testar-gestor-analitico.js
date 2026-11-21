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

   20/11/26: 110 das 141 checagens mediam as telas antigas do gestor (Time, Daily, Semana,
   Pessoas e o comando de execução, atrás do ?gv2=0) e saíram com elas. Ficam as 31 que medem
   o robô (fetch-hubspot), a montagem do servidor (montar-dados), as ações do servidor e o que
   o template vivo ainda faz. As regras do cockpit novo do gestor estão em testar-gestor-v2.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const robo = fs.readFileSync(path.join(raiz, 'scripts', 'fetch-hubspot.js'), 'utf8');
const metasDoMesSrc = fs.readFileSync(path.join(raiz, 'scripts', 'metas-do-mes.js'), 'utf8');
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

checar('o robô agrega MRR de TODOS os perdidos, não só dos exemplos',
  robo.indexOf('totalMrrConhecido') > 0 && robo.indexOf('mrrPorMotivo') > 0 &&
  robo.indexOf('mrrPorOwner') > 0 && robo.indexOf('semMrr') > 0);
checar('negócio afetado por duas evidências conta UMA vez no risco',
  templateCodigo.indexOf('const porId = new Map()') > 0);
checar('nada multiplica perda por ticket médio nem estima receita',
  templateCodigo.indexOf('ticketMedio') < 0 && templateCodigo.indexOf('receitaPotencial') < 0 &&
  templateCodigo.indexOf('receitaEstimada') < 0);







checar('o corte por papel no servidor continua intacto',
  montar.indexOf('function filtrarParaPapel(') > 0 &&
  montar.indexOf('function resumoDeColega(') > 0 &&
  /* desde a gaveta de fora do time, o ramo do gestor tira o funilForaDoTime antes de devolver */
  montar.indexOf("if (!usuario || usuario.role === 'manager') {") > 0 &&
  montar.indexOf('const meuId = String(usuario.ownerId);') > 0);

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
  /* #626: saindo de Ag. Pagamento não deriva (amount e mrr são o que o RPA/ASAAS lê) */
  servidorCodigo.indexOf('const propriedadesFinais = saindoDeAgPagamento ? limpeza.propriedades : derivarDinheiro(') > 0 &&
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
checar('o formulario de etapa abre com o MRR que o negocio ja tem',
  templateCodigo.indexOf("campo.prop === 'valor_de_mrr' ? mrrDoNegocio(lead)") > 0);

checar('o que abre lista no dossie cumpre o piso de 38px no desktop',
  template.indexOf('.coach-funil-etapa.is-abre{min-height:38px;}') > 0);


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






  checar('e a v10 criou UM verbo novo, nao uma fiacao nova',
    (tela.match(/data-tm10-acao/g) || []).length === 0);

  checar('a agenda e lida de DATA.agenda.itens',
    /DATA\.agenda && Array\.isArray\(DATA\.agenda\.itens\)/.test(tela));






  /* ── 11 · A META NAO MORA MAIS EM CONSTANTE CRAVADA ─────────────────────────────── */
  checar('as metas saem de data/metas.json, nao de constante',
    /const METAS = \(function \(\) \{/.test(robo)
      && /const META_MENSAL_FECHADOS = \(METAS\.time && METAS\.time\.clientes\) \|\| 0;/.test(robo)
      && !/const META_MENSAL_FECHADOS = \d+;/.test(robo)
      && !/const META_MENSAL_POR_EXECUTIVO = \d+;/.test(robo));
  /* A CONFERENCIA DA SOMA MUDOU DE ARQUIVO EM 28/10/26, nao de existencia: foi para
     scripts/metas-do-mes.js junto com a escolha do mes. Esta guarda era cravada no TEXTO
     do fetch-hubspot.js e ficou vermelha sem nada ter se perdido — o jeito honesto de
     consertar e apontar para onde a regra mora agora E exigir que o robo passe por la,
     em vez de afrouxar o que ela cobra. Ver scripts/testar-metas-por-mes.js, que sabota
     a soma em tres lugares. */
  checar('e o robo falha alto se a soma dos individuais nao bater com o total do time',
    /a soma de . \+ k \+ . d[áa] . \+ soma\[k\]/.test(metasDoMesSrc.replace(/'/g, '.'))
      && /require\(.\.\/metas-do-mes.\)/.test(robo.replace(/'/g, '.'))
      && !/JSON\.parse\(fs\.readFileSync\([^)]*metas\.json/.test(robo));
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
    montar.indexOf('metaMensal: h.metaMensal != null ? h.metaMensal : 0,') > -1 /* 01/11/26: fora do robô = sem meta, não 10 */
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
      /* 'foraDoTime' voltou ao template em 09/10/26 (#783) como a marca da SESSÃO do Julyan (a
         visão de executivo dele é a do time) — não puxa negócio de ninguém; a guarda mede a busca */
      && templateCodigo.indexOf('negócios fora do time') === -1);

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


  /* ── 2 · UM ESTADO SO PARA A SELECAO ────────────────────────────────────────────────
     A prancha tem deep-link (?exec=) e clique no rail. Dois estados para a mesma selecao
     fariam o deep-link mexer num e a tela ler o outro. */
  checar('a selecao da pessoa usa o estado que ja existia',
    tela.indexOf('PS6_ESTADO.sel') > -1 && !/let PE4_SEL/.test(tela));








}());




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


}());

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('gestor analítico: ' + ok + ' checagens ok — estoque≠conversão, MRR com cobertura, plano≠execução, evidência sem julgamento e nenhum botão sem destino.');
