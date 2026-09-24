/* ============================================================================
   A ABA HOJE — O QUADRO ÚNICO (04/09/26)

   POR QUE ESTA SUÍTE NASCE AGORA: a fila 8b subiu sem nenhuma trava, e a v9 mexe
   justamente no que não dá para ver num print — se a coluna da direita conta a MESMA
   fila da esquerda, se existe uma barra só, e se o "ontem" do card é o mesmo "ontem"
   que o executivo vai falar em voz alta na daily.

   O QUE ELA NÃO FAZ: medir pixel. Alinhamento se mede no navegador com estilo
   computado, e está medido (bordas do corpo e do rodapé em 964px, as duas). Aqui
   ficam as regras que sobrevivem a qualquer redesenho.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, detalhe) => { if (cond) { ok++; return; } falhas.push(nome + (detalhe ? ' — ' + detalhe : '')); };

/* ── 1. UM QUADRO SÓ ─────────────────────────────────────────────────────────────
   O motivo da versão, no handoff: "o problema da versão anterior era desalinhamento".
   Corpo e rodapé compartilham a MESMA grade — é isso que faz as bordas verticais
   descerem retas da fila até o pé da tela. */
checar('a aba abre um quadro único', template.indexOf('<div class="h9">') > -1);
checar('o corpo usa a grade do quadro', template.indexOf('<div class="h9-grade">') > -1);
checar('e o rodapé usa a MESMA grade, não outra',
  template.indexOf('<div class="h9-pe h9-grade">') > -1,
  'grades diferentes entre corpo e rodapé = a borda vertical muda de lugar no meio da tela');
checar('a grade é a do handoff: minmax(0,1fr) 430px',
  template.indexOf('.h9-grade{display:grid;grid-template-columns:minmax(0,1fr) 430px;}') > -1);
/* NADA SOLTO ABAIXO DO CARD: o recado do gestor e os fechamentos eram duas seções
   irmãs do quadro, cada uma com a sua largura. */
checar('o recado do gestor mora dentro do rodapé do quadro',
  template.indexOf('<div class="h9-pe-esq">') > -1
  && template.indexOf('<div id="meuPainelSugestoes"></div>') > template.indexOf('<div class="h9-pe-esq">'));
checar('os fechamentos da semana também',
  template.indexOf('<div class="h9-pe-dir">${buildVitoriasHTML(r)}</div>') > -1);

/* ── 2. O HERO ESCURO ────────────────────────────────────────────────────────────
   A classe nova entra AO LADO da antiga e cuida só da tinta: o layout, os stats e o
   anel do mês continuam nas regras que já funcionavam. E o seletor tem DUAS classes
   de propósito — .xv3-hero fica milhares de linhas abaixo no arquivo e, com a mesma
   especificidade, vencia: o hero ficava claro e só o título mudava de cor. */
checar('o hero recebe a classe da repaginação', template.indexOf('class="xv3-hero h9-hero"') > -1);
checar('e a regra vence a antiga por especificidade, não por ordem',
  template.indexOf('.xv3-hero.h9-hero{background:var(--ink);') > -1,
  'com um seletor de uma classe só, .xv3-hero vence e o hero volta a ficar claro');
/* AS CORES DE ESTADO SOBREVIVEM AO ESCURO: vermelho sobre tinta some, e "visita
   pendente" precisa ser legível justamente no dia em que ela importa. */
checar('vermelho, âmbar e verde clareiam sobre a tinta',
  template.indexOf('.h9-hero .xv3-herostat.is-red b{color:#FF8A85;}') > -1
  && template.indexOf('.h9-hero .xv3-herostat.is-amber b{color:#F2C879;}') > -1);

/* ── 3. A COLUNA DIREITA CONTA A MESMA FILA ──────────────────────────────────────
   Se ela contasse de outra fonte, a tela mostraria dois números para o mesmo dia. */
checar('existe UMA contagem por tipo', template.indexOf('function h9ContagemPorTipo(r, diag)') > -1);
checar('e ela lê a fila da esquerda, não outra lista',
  template.indexOf("const fila = (typeof h8Fila === 'function') ? h8Fila(r, diag) : [];") > -1);
/* OS TIPOS SÃO OS DE h8Insight. Escrevê-los pelos nomes do mockup fez os checks
   dizerem "nada pendente" com 57 itens na fila — nenhum item caía nos baldes. */
/* SÓ O BLOCO H9_TIPOS: id 'cadencia' também existe noutra estrutura do arquivo (a lista
   de baldes de prioridade), e medir o arquivo inteiro reprovava o código certo. */
const iTipos = template.indexOf('const H9_TIPOS = [');
const blocoTipos = iTipos > -1 ? template.slice(iTipos, template.indexOf('];', iTipos)) : '';
checar('o bloco dos tipos existe para ser medido', iTipos > -1 && blocoTipos.length > 100);
['sla', 'follow', 'quente'].forEach(function (cat) {
  checar('o tipo "' + cat + '" é um dos baldes reais do insight',
    blocoTipos.indexOf("{ id: '" + cat + "',") > -1);
});
checar('e nenhum balde inventado sobrou',
  blocoTipos.indexOf("id: 'cadencia'") < 0 && blocoTipos.indexOf("id: 'touchpoint'") < 0,
  'balde que o insight não produz = check que diz "nada pendente" para sempre');

/* ── 4. UMA BARRA SÓ, E ELA CONTA O QUE ESTÁ NA TELA ─────────────────────────────
   Havia duas na mesma coluna, com números diferentes sobre o mesmo dia ("4/7" e
   "0/7"), porque o painel de portões trazia a sua. */
checar('o denominador é tipos + portões, o que está na tela',
  template.indexOf('const total = H9_TIPOS.length + fixos.length;') > -1);
/* OS PORTÕES VOLTARAM EM 08/09/26, a pedido do Julyan — e a regra desta seção continua
   valendo, porque eles voltaram SEM o contador e SEM a barra, que era a razão da
   remoção de 04/09.

   A checagem antiga media um ATALHO: proibia a chamada de buildGatesDoDiaHTML, porque a
   chamada trazia a barra. Proibir a chamada é proibir a feature — e deixava um buraco,
   porque alguém podia religar o cartão com a barra e ela não veria.

   Agora ela olha o CORPO do cartão e cobra a ausência das duas coisas. Mais estrita, e
   ancorada no que a regra realmente diz. */
const corpoPortoes = (function () {
  const i = template.indexOf('function buildGatesDoDiaHTML');
  if (i < 0) return null;
  const j = template.indexOf('\nfunction ', i + 1);
  return template.slice(i, j > i ? j : i + 4000);
}());
checar('o cartão de portões existe para poder ser medido', corpoPortoes !== null,
  'sem ele, as duas checagens abaixo passariam por ausência');
checar('o cartão de portões NÃO traz barra de progresso',
  !!corpoPortoes && corpoPortoes.indexOf('width:${pct}%') < 0 && corpoPortoes.indexOf('const pct =') < 0,
  'duas barras com números diferentes sobre o mesmo dia é o jeito mais rápido de o executivo parar de acreditar nas duas');
checar('nem o contador prontos/total no cabeçalho dele',
  !!corpoPortoes && corpoPortoes.indexOf('${diag.prontos}<span') < 0,
  'o "0/7" logo abaixo do "4/7" era metade do problema');

/* ── 5. O SCRIPT DA DAILY ────────────────────────────────────────────────────────
   Definir e não chamar é o defeito que mais aparece nesta base — o próprio h8LigarFila
   quase subiu assim. */
checar('o script existe', template.indexOf('function h9ScriptHTML(r, diag)') > -1);
checar('e é CHAMADO na coluna, não só definido',
  template.indexOf('${h9ScriptHTML(r, diagDia)}') > -1);
checar('o copiar tem caminho', template.indexOf("el.querySelector('#h9CopiarScript')") > -1);
/* TEXTO SIMPLES: daily se fala no WhatsApp e no Meet, e markdown colado lá vira lixo. */
checar('o copiar monta texto simples com quebras de linha',
  template.indexOf('const nl = String.fromCharCode(10);') > -1
  && template.indexOf("'Ontem fiz: ' + t.ontem + nl") > -1);
/* SEM CLIPBOARD A TELA NÃO FINGE QUE COPIOU. */
checar('a falha da área de transferência é dita',
  template.indexOf('Seu navegador bloqueou a cópia') > -1);

/* ── 6. O "ONTEM" É UM SÓ ────────────────────────────────────────────────────────
   Dois leitores agora: o card do último dia e o script. Recalcular em cada um daria
   dois números para o mesmo dia — e o script é lido em voz alta na frente do gestor. */
checar('o ontem virou função', template.indexOf('function h9Ontem(r)') > -1);
checar('o card do último dia lê dela', template.indexOf('const ontemDados = h9Ontem(r)') > -1);
checar('o script também', template.indexOf("const ontem = (typeof h9Ontem === 'function') ? h9Ontem(r) : null;") > -1);
/* dailyRefDate É MUTÁVEL: os botões da aba Daily a movem. Ler dela faria o "ontem"
   do Hoje mudar quando o gestor folheasse a Daily de outro dia. */
/* A PROIBIÇÃO É DENTRO DO h9Ontem, E NÃO NO ARQUIVO INTEIRO (07/09/26).
   A regra continua a mesma e é boa: o "ontem" da aba Hoje tem de partir de HOJE,
   porque dailyRefDate é mutável e os botões da Daily a movem — ler dela faria este
   número andar quando o gestor folheasse a Daily de outro dia.

   O QUE MUDOU: a checagem media a AUSÊNCIA da string no template todo, e a Daily v3 do
   gestor passou a ter um "ontem" legítimo relativo ao dia navegado (prospecções novas
   ontem: se ele folheia para a Daily de terça, o "ontem" dali é segunda). Guarda
   cravada numa string global reprova código correto de outra tela — foi o que
   aconteceu. Agora ela lê o CORPO do h9Ontem, que é o que ela sempre quis proteger. */
checar('o ontem da aba Hoje parte de hoje, e não da data navegada na Daily',
  (function () {
    const i = template.indexOf('function h9Ontem(r) {');
    if (i < 0) return false;
    const corpo = template.slice(i, i + 900);
    return corpo.indexOf('addBusinessDays(isoDate(new Date()), -1)') > -1
      && corpo.indexOf('addBusinessDays(dailyRefDate') < 0;
  }()));
/* SEM DADO A LINHA DIZ ISSO, e não um zero: "0 visitas" afirma que ele não trabalhou. */
checar('sem registro o script não afirma que o dia foi vazio',
  template.indexOf('nada comprovado no HubSpot ainda') > -1);

/* ── 7. A NOTA DE FONTE ──────────────────────────────────────────────────────────
   Toda tela desta casa diz de onde veio o número — e aqui ela carrega a regra da fila,
   que é o que o executivo precisa entender uma vez para confiar na ordem todo dia. */
checar('a nota de fonte fecha o quadro', template.indexOf('<div class="h9-fonte">') > -1);
checar('e explica a ordem da fila',
  template.indexOf('cadência quebrada → follow-up → visita → touchpoint') > -1);

/* ── 8. A COLUNA NÃO SOBRA BRANCO (05/09/26) ─────────────────────────────────────
   O Julyan mandou print: a fila cortada e um vão branco antes do rodapé. Medido na
   tela: coluna de 1004px, card de 722px e a lista parando em 620px (o teto de 62vh)
   — 263px de branco. A grade estica as duas colunas para a altura da mais alta e a
   direita não tem teto; a esquerda tinha. Depois da correção: vão de 20px, que é o
   padding, e a lista em 862px. */
checar('a coluna da fila é flex, para a lista poder preencher',
  template.indexOf('.h9-esq{padding:20px 22px;min-width:0;display:flex;flex-direction:column;}') > -1);
checar('e a lista cresce até o fim da coluna, sem teto',
  template.indexOf('.h9-esq .h8-fila{flex:1 1 0;max-height:none;min-height:0;}') > -1,
  'com o teto de volta, a coluna estica com a irmã e sobra branco embaixo da fila');
checar('o card entre a coluna e a lista também estica',
  template.indexOf('.h9-esq > .h8-card{flex:1 1 0;display:flex;flex-direction:column;min-height:0;}') > -1,
  'sem isto o flex:1 da lista não tem contra quem crescer');
/* NO EMPILHADO O TETO VOLTA: sem coluna irmã não há vão, e 37 itens sem teto viram
   uma rolagem de página sem fim no celular. */
checar('empilhado (<=1240px) devolve o teto da fila',
  template.indexOf('.h9-esq .h8-fila{flex:none;max-height:min(62vh,720px);}') > -1);

/* ── 9. O RECADO DO GESTOR TEM UM TÍTULO SÓ ──────────────────────────────────────
   O rodapé imprime "Recado do seu gestor" no .h9-pe-rot e o painel imprimia o MESMO
   texto dentro da caixa. Só aparecia quando havia recado — por isso passou. */
(function () {
  /* CONTA O TEXTO DO ELEMENTO, não a frase no arquivo: a minha primeira versão casava
     /Recado do seu gestor/ e dava 2 — a segunda era o COMENTÁRIO que explica a remoção.
     Assertion que mede o próprio comentário é verde que não protege nada. */
  const rotulos = (template.match(/>Recado do seu gestor</g) || []).length;
  checar('"Recado do seu gestor" aparece uma vez só na tela',
    rotulos === 1,
    rotulos + ' ocorrência(s) em markup — o rótulo da célula e o título do painel eram a'
      + ' mesma frase, uma embaixo da outra');
})();

/* ── 10. A PROMESSA DO TOAST É CUMPRIDA (05/09/26) ───────────────────────────────
   O toast de conclusão dizia "a visita já entrou na sua semana e na Daily" e isso não
   acontecia: gravarDesfechoEPasso escreve nota e tarefa no HubSpot e nada mais — zero
   ocorrências de planos_semanais nele. Duas linhas acima, o mesmo bloco diz "a tela não
   afirma um registro que o gestor não vai encontrar". */
checar('existe a ponte que põe o próximo passo na semana',
  template.indexOf('async function h8AgendarNaSemana(rep, leadId, dataISO)') > -1);
checar('e a fila do dia CHAMA a ponte, não só a define',
  template.indexOf('naSemana = await h8AgendarNaSemana(r, lead.id, dataISO);') > -1,
  'definir e não chamar é o defeito que mais aparece nesta base');
/* ══ A PONTE DELEGA, E ISSO SUBSTITUIU TRÊS ASSERÇÕES DAQUI (08/09/26) ═══════════════
   Julyan: "na aba hj o lead vai pra aba planejamento, mas nao vai com o mesmo nome".

   A CAUSA: h8AgendarNaSemana era uma SEGUNDA implementação do espelho e gravava o
   dealId CRU na grade. A grade de planos_semanais é indexada com prefixo — `c-<dealId>`
   para carteira, `n-<uuid>` para conta nova, `__rua` para a volta de rua (conferido no
   banco em 08/09). Id só de dígitos não existe ali, então o Planejamento desenhava
   "conta saiu da sua base" no lugar do nome. E como gravarDesfechoEPasso JÁ chama
   espelharPassoNasTelas (que grava com prefixo), o negócio entrava DUAS vezes: um slot
   certo e um órfão. Achei um órfão vivo no plano da Kelly desta semana.

   AS TRÊS ASSERÇÕES ANTIGAS mediam o corpo daquela segunda implementação: que ela lia o
   banco antes de escrever, que ela NÃO usava pl6Gravar, e que ela recusava quando não
   havia plano. As duas primeiras propriedades continuam valendo — agora dentro de
   espelharPassoNoPlanoSemanal, que faz pl6Carregar (leitura fresca do banco) antes de
   montar a grade. A terceira MUDOU de propósito, e é a mudança que precisa estar dita:

   O "Hoje" era o ÚNICO dos seis chamadores do espelho que recusava quando a pessoa não
   tinha montado a semana. Os outros cinco criam a linha. Com a recusa, marcar a visita
   no Hoje deixava o Planejamento e a Daily negando um compromisso que ela acabou de
   marcar — exatamente o furo que o espelho foi criado para fechar. Uma regra, um lugar:
   agora ela cria, como todos os outros. */
checar('a ponte DELEGA para o espelho canônico, em vez de gravar por conta própria',
  /const r = await espelharPassoNoPlanoSemanal\(lead, dataISO, null, String\(rep\.ownerId\)\);/.test(template)
  && template.slice(template.indexOf('async function h8AgendarNaSemana'),
    template.indexOf('async function h8AgendarNaSemana') + 3200).indexOf("from('planos_semanais').upsert") < 0,
  'segunda implementação do espelho foi o que gravou o id cru e criou o slot órfão');
checar('e ela traduz as recusas do espelho, sem inventar sucesso',
  /if \(r\.fora\) return \{ ok: false/.test(template)
  && /if \(r\.cheio\) return \{ ok: false/.test(template)
  && /if \(r\.foraDaMunicao\)/.test(template),
  'as três recusas do espelho são legítimas e a fila do dia precisa dizer qual foi');
/* A LEITURA QUE FALHA NÃO PODE VIRAR ESCRITA. pl6Gravar monta a linha com
   pl6GradeDoPlano(), a grade EM MEMÓRIA: com a leitura falhada ela é vazia, e o upsert
   gravaria uma semana vazia por cima da real. pl6Carregar engolia o erro e devolvia
   undefined, então o try/catch que protegia isso nunca disparava. */
checar('o carregador do plano diz se conseguiu ler',
  /return \{ ok: false, motivo: error\.message \|\| 'o banco recusou a leitura' \};/.test(template),
  'leitura que falha em silêncio + upsert da grade em memória = a semana dele apagada');
/* ══ QUANTOS ESCREVEM NA GRADE, E QUEM ═══════════════════════════════════════════════
   A grade de planos_semanais é indexada por um ESPAÇO DE ID com prefixo. Todo escritor
   novo tem de saber disso, e o jeito de garantir que ele saiba é reprovar o build quando
   aparecer um escritor que ninguém revisou.

   Hoje são dois, e os dois estão certos: `pl6Gravar` (o Planejamento e o espelho, via
   pl6GradeDoPlano) e `g14AgendarNoHorarioLivre` (a Daily do gestor, cujo chamador resolve
   o id na carteira antes). O terceiro era h8AgendarNaSemana — e foi ele que gravou o id
   cru e criou o slot órfão no plano da Kelly. */
/* CONTA QUEM TOCA A `grade`, e não quem toca a tabela. Medido: há TRÊS upserts em
   planos_semanais, e o terceiro é `pm8Confirmar`, que grava só a coluna `promessa` — o
   upsert do PostgREST atualiza apenas as colunas enviadas, então a grade sobrevive
   intacta. A primeira versão desta guarda contou os três e reprovou o código certo. */
(function () {
  /* Olha a FUNÇÃO que contém cada upsert: ela monta `grade` ou não? Duas versões desta
     guarda erraram antes desta — a primeira contou os três upserts da tabela (e
     pm8Confirmar grava só `promessa`), e a segunda casou `upsert(linha` nos dois, porque
     pl6Gravar e pm8Confirmar dão o mesmo nome ao payload. */
  const nomes = [];
  /* AS DUAS ASPAS. A sabotagem que escreveu from("planos_semanais") passou VERDE: a
     regex pedia aspa simples, e um escritor novo com aspa dupla escapava da guarda
     inteira. Guarda que só vê um estilo de aspa é guarda que o próximo autor burla sem
     querer. */
  const re = /from\(["']planos_semanais["']\)[\s\S]{0,60}?\.upsert/g;
  let m;
  while ((m = re.exec(template))) {
    const antes = template.slice(0, m.index);
    const iFn = Math.max(antes.lastIndexOf('\nasync function '), antes.lastIndexOf('\nfunction '));
    if (iFn < 0) continue;
    const nome = (template.slice(iFn).match(/^\s*(?:async )?function ([A-Za-z0-9_]+)/) || [])[1] || '?';
    /* o corpo da função, até o próximo `\nfunction` */
    const resto = template.slice(iFn + 1);
    const fim = resto.search(/\n(?:async )?function /);
    const corpo = fim > 0 ? resto.slice(0, fim) : resto;
    if (/\bgrade\b/.test(corpo)) nomes.push(nome);
  }
  /* ERAM DOIS ATÉ 11/09/26: `pl6Gravar` (o Planejamento e o espelho) e
     `g14AgendarNoHorarioLivre` (a Daily 14a do gestor). A 14a ficou inalcançável em 04/09
     — um `html = ...` em renderDaily passou a descartar o markup do gestor — e saiu do
     arquivo em 11/09. Sobrou UM escritor, e a lista continua FECHADA: escritor novo
     reprova. Lista que só cresce é guarda morta; lista que encolhe com o arquivo é guarda. */
  checar('só o escritor conhecido toca a GRADE da semana',
    nomes.length === 1 && nomes.indexOf('pl6Gravar') > -1,
    'são ' + nomes.length + ' (' + nomes.join(', ') + ') — escritor novo na grade tem de passar pelo espaço de id (c- / n- / __rua); um dealId cru vira slot órfão');
}());

checar('e o espelho recusa escrever quando a leitura falhou',
  /if \(leu && leu\.ok === false\)/.test(template)
  && /não consegui ler seu plano da semana \(/.test(template),
  'a tarefa já está no CRM: perder o espelho é um complemento a menos, apagar a semana é estrago');
/* E O TOAST CONTA O QUE FALTOU, em vez de afirmar mesmo assim */
checar('quando a semana não recebe, o toast diz por quê',
  template.indexOf('Na sua semana ele NÃO entrou: ') > -1);
checar('a falha na semana não devolve a linha para a fila',
  template.indexOf('nunca devolve a linha para a fila: seria desfazer um registro que existe') > -1,
  'o HubSpot já gravou neste ponto — desfazer na tela criaria divergência com o CRM');
/* ══ O ASSUNTO DA TAREFA NO CRM É A AÇÃO, NUNCA O DIAGNÓSTICO (11/09/26) ═══════════════
   MEDIDO NO CRM DE PRODUÇÃO: 29 tarefas, de cinco executivos, com assunto do tipo
     "Visita - 4d na Visita — régua é 5d · a data que você marcou passou — sem telefone
      no CRM, então é visita com data nova na saída"
   Nenhuma dizia de que cliente era, e várias eram idênticas entre si.

   A fila do Hoje mandava `ins.motivo` como texto do próximo passo, e `motivo` é por
   construção `parado + ' · ' + oQue`: o diagnóstico colado na ação. O diagnóstico é para a
   TELA, onde explica por que aquela linha está na fila; o assunto da tarefa é o que a
   pessoa lê no CRM daqui a três dias. */
checar('a tarefa criada pela fila leva a AÇÃO, e não o diagnóstico da linha',
  template.indexOf('acao: oQue') > -1
  && template.indexOf("|| ins.acao || ins.motivo)") > -1
  && template.indexOf("(ins.acao || ins.motivo);") > -1,
  'com ins.motivo o CRM ganha "Visita - 4d na Visita — régua é 5d · ..." e ninguém sabe de quem é');
checar('e o diagnóstico continua inteiro na tela e na nota',
  template.indexOf("motivo: parado + ' · ' + oQue,") > -1
  && template.indexOf("observacao: 'Registrado pela fila do dia (Hoje) — ' + ins.motivo") > -1,
  'a frase que explica a linha não pode sumir de onde ela serve');

/* ══ UM CALENDÁRIO SÓ (reancorada em 24/09/26) ═══════════════════════════════════
   Ela exigia `pl6ColunaDaData` e a derivação de `d7ColunaDeHoje` a partir dela. As duas
   saíram com a Minha Daily: a primeira ficou órfã quando a segunda foi embora.

   A REGRA NÃO MUDOU — duas contas de "que dia é hoje" é como duas telas passam a
   discordar sobre qual dia é quinta. O que mudou é quem a cumpre: hoje existe UM lugar
   que resolve o dia, `agendaChave(agendaAgora())`, e a coluna sai de comparar esse ISO
   com os `dias` da semana — sem um segundo cálculo de data.

   Por isso ela agora mede a AUSÊNCIA de um segundo calendário: ninguém no template
   deriva o dia da semana de um `new Date()` cru nem de `getDay()` para escolher coluna. */
checar('a coluna da semana é calculada num lugar só',
  (function () {
    const cod = template.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const umSo = /const hojeISOPl6 = \(typeof agendaChave === 'function'/.test(cod)
      && /dias\[i\]\.iso === hojeISO/.test(cod);
    /* A CLÁUSULA NEGATIVA QUE EU TINHA ESCRITO AQUI procurava `new Date().getDay()` em
       todo o template e reprovava: existem quatro, todos anteriores a esta entrega e
       nenhum escolhendo coluna de semana (são nome de dia e dia útil). Guarda que
       reprova código que ela não governa é guarda que alguém desliga — e o que importa
       medir aqui é positivo: o dia sai de UM lugar, e a coluna sai de comparar o ISO
       dele com os dias da semana, sem uma segunda conta de data. */
    const umDefinidor = (cod.match(/const hojeISOPl6 =/g) || []).length === 1;
    return umSo && umDefinidor;
  }()),
  'dois calendários é como duas telas passam a discordar sobre qual dia é quinta');


/* ══ A HOJE PASSA A DECIDIR, E NAO SO A TOCAR (14/09/26) ═══════════════════════════
   Julyan: "aqui em hoje, as acoes tem que ser: mover de etapa? perdido? ... isso tem q
   ser melhor".

   A fila so tinha verbos de TOQUE — ligar, WhatsApp, datar, criar negocio. Medido na
   tela da Kelly: 26 leads acima do SLA, 0 em fechamento, e o primeiro da fila com 21
   dias em Prospeccao, SEM telefone no CRM e SEM nenhum toque registrado — para quem a
   melhor acao oferecida era "agendar visita" pela enesima vez. Para um negocio assim as
   opcoes honestas sao ir na porta ou enterrar com motivo, e a tela nao tinha nenhuma.

   E E O MESMO MECANISMO DO PDI DELA: 174 negocios perdidos, nenhum com motivo — porque
   o gesto que COBRA o motivo so existia no Meu funil, e a tela onde ela passa o dia nao
   o alcancava.

   OS GESTOS SAO OS MESMOS, com as mesmas travas: `abrirEscolhaDeEtapa` cobra as
   propriedades da etapa e o proximo passo datado; `fn3AbrirRegistro(..., PERDIDO)` cobra
   o motivo. Nenhum atalho novo — o que muda e o lugar de onde se alcanca. */
checar('o cartao da Hoje oferece decidir, e nao so tocar',
  template.indexOf('data-h8-decidir="') > -1
    && template.indexOf('data-h8-avancar="') > -1
    && template.indexOf('data-h8-perder="') > -1,
  'sem decisão, o negócio de 21 dias sem telefone só recebe "agendar visita" de novo');

checar('e as decisoes usam os mesmos gestos do Meu funil, com as mesmas travas',
  template.indexOf('return abrirEscolhaDeEtapa(doFunil, redesenhar);') > -1
    && template.indexOf('return fn3AbrirRegistro(doFunil, FN2_ETAPA_PERDIDO, redesenhar);') > -1,
  'atalho próprio na Hoje seria um segundo caminho para mudar etapa — e um deles '
    + 'esqueceria o motivo, que é exatamente o que já aconteceu 174 vezes');

checar('e o decidir nunca rouba a estrela da melhor acao',
  template.indexOf('data-h8-decidir="\' + id + \'">decidir ⌄') > -1
    && !/ins\.melhor === 'decidir'/.test(template),
  'a melhor ação sai de h8Insight, que mede o negócio; o decidir é porta, não recomendação');

checar('e o painel da fila fecha antes de a gaveta abrir',
  (function () {
    const i = template.indexOf('if (d.h8Avancar || d.h8Perder || d.h8Ficha) {');
    if (i < 0) return false;
    const corpo = template.slice(i, i + 1400);
    return corpo.indexOf('h8Painel = null;') > -1
      && corpo.indexOf('h8Painel = null;') < corpo.indexOf('abrirEscolhaDeEtapa(');
  }()),
  'a lição de hoje de manhã: gaveta aberta atrás de painel faz o clique parecer morto');


/* ══ A FILA RESPEITA O QUE ELE JÁ PLANEJOU (14/09/26) ══════════════════════════════
   Julyan: "descer no ranking com o selo". O negócio que ele já pôs na grade da semana
   parava de ser urgência e continuava no topo da fila de hoje, disputando atenção com
   quem não tem dia nenhum. As cinco travas abaixo cobrem as três regras da decisão —
   e a terceira é a que já custou caro nesta casa: o zero que tranquiliza. */

const h8Agenda = (function () {
  const i = template.indexOf('function h8AgendadoNaSemana()');
  if (i < 0) return '';
  const fim = template.indexOf('\n}\n', i);
  return fim < 0 ? '' : template.slice(i, fim);
}());

checar('a fila de hoje lê a MESMA grade que o Planejamento',
  h8Agenda.indexOf('pl6GradeDoPlano()') > -1
    && h8Agenda.indexOf('pl6Dias(') > -1
    && template.indexOf('const agenda = h8AgendadoNaSemana();') > -1,
  'uma segunda leitura do mesmo dia é como duas telas passam a discordar sobre o que '
    + 'está marcado na quinta');

checar('só dia FUTURO desce — hoje e passado continuam competindo',
  /if \(String\(dia\.iso\) <= String\(hoje\)\) return;/.test(h8Agenda),
  'agendado para HOJE é o trabalho de hoje, e dia que já passou é promessa quebrada: '
    + 'rebaixar qualquer um dos dois é a tela escondendo o que mais precisa doer');

checar('plano NÃO LIDO não vira "nada agendado"',
  /if \(typeof pl6Plano === 'undefined' \|\| !pl6Plano\) return null;/.test(h8Agenda)
    && template.indexOf('if (!agenda) return lista;') > -1,
  'mapa vazio no lugar de null derrubaria para o fim da fila exatamente quem planejou '
    + 'a semana inteira — e ninguém contesta uma fila que parece normal');

checar('a ordem do ranking de risco sobrevive à descida',
  template.indexOf('return agora.concat(depois);') > -1
    && (function () {
      const i = template.indexOf('const agora = [], depois = [];');
      if (i < 0) return false;
      return !/\.sort\(/.test(template.slice(i, i + 900));
    }()),
  'reordenar aqui joga fora a medida de risco que h8Insight levou a tela inteira para fazer');

/* A TINTA DO SELO EXISTE — eu escrevi `var(--green-dk, var(--green))` e o --green-dk
   nunca existiu em lugar nenhum: caiu no padrao sem erro, sem aviso, e saiu na tela com
   3.04:1 num texto de 9.5px (medido no navegador). Token inexistente nao reclama; o que
   reclama e esta linha. */
checar('a tinta do selo é um token que existe de verdade',
  /\.h8-selo-agendado[\s\S]{0,400}?color:var\(--green-ink\)/.test(template)
    && /--green-ink:#[0-9A-Fa-f]{6};/.test(template),
  'var(--nao-existe) cai no fallback em silêncio — foi assim que o selo saiu com '
    + '3.04:1, abaixo do mínimo de texto pequeno');

checar('o selo diz QUANDO, e a linha perde a tarja de alerta',
  template.indexOf('h8-selo-agendado') > -1
    && template.indexOf('item.agendado.rot') > -1
    && template.indexOf("(item.agendado ? ' is-agendado' :") > -1,
  'selo sem dia não responde "então quando?", e tarja vermelha em negócio já agendado '
    + 'é a tela cobrando o que ele já resolveu');


/* ══ A FAIXA DO DIA (14/09/26) ═════════════════════════════════════════════════════
   Julyan: "a aba hoje deles tem que vir com as prioridades do dia obviamente". A aba
   mostrava UM compromisso — o hero escolhe entre cinco casos e desenha um só. Quem
   tinha três visitas marcadas via a das 15:00 e mais nada. */

const h9DiaFonte = (function () {
  const i = template.indexOf('const listaDeHoje = deHoje');
  return i < 0 ? '' : template.slice(Math.max(0, i - 1200), i + 1600);
}());

checar('a faixa do dia sai da MESMA leitura da agenda, não de uma segunda',
  h9DiaFonte.indexOf('agendaNormalizar(DATA.agenda)') > -1
    && template.indexOf('const doDia = (hojeConta.lista || []);') > -1,
  'um segundo levantamento do mesmo dia é uma quarta tela para discordar das outras três');

checar('a faixa fica ACIMA da fila, não ao lado nem embaixo',
  (function () {
    const f = template.indexOf('<div class="h9-dia">');
    const g = template.indexOf('<div class="h9-grade">');
    return f > -1 && g > -1 && f < g;
  }()),
  'ver "por onde começar" antes de "o que eu já combinei" faz a tela recomendar contra '
    + 'o próprio compromisso dele');

checar('sem compromisso nenhum a faixa não aparece',
  /if \(!doDia\.length\) return '';/.test(template),
  'faixa vazia é ruído, e o hero já diz "sem compromisso agendado" nesse caso');

checar('só UM compromisso é o "agora"',
  template.indexOf('const proximoDaFaixa = listaDeHoje.find(') > -1
    && template.indexOf('if (proximoDaFaixa) proximoDaFaixa.agora = true;') > -1
    && /agora: false,/.test(template),
  'três destaques é nenhum destaque — "e agora, onde eu vou?" tem resposta única');

checar('o que passou da hora sem fechamento aparece marcado',
  /vencido: !feito && min < agoraMin/.test(template)
    && template.indexOf('is-vencido') > -1
    && template.indexOf('sem fechamento') > -1,
  'esse é o estado que sumia da leitura de "próximo compromisso" e por isso ficava '
    + 'invisível — o oposto de agenda vazia');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('hoje: ' + ok + ' checagens ok — um quadro, uma grade, uma contagem, uma barra e um "ontem".');
