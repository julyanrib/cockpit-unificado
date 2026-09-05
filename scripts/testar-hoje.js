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
checar('o painel de portões não voltou para a coluna',
  template.indexOf('${buildGatesDoDiaHTML(r, diagDia)}') < 0,
  'ele traz uma segunda barra e repete dois checks com outro nome');

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
checar('o ontem parte de hoje, e não da data navegada na Daily',
  template.indexOf('addBusinessDays(isoDate(new Date()), -1)') > -1
  && template.indexOf('addBusinessDays(dailyRefDate, -1) : null;') < 0);
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
/* A LEITURA FRESCA É O QUE IMPEDE DE APAGAR A SEMANA DELE: pl6Gravar monta a linha com
   pl6GradeDoPlano(), a grade CARREGADA NA SESSÃO. Quem está no Hoje pode não ter aberto o
   Planejamento — a grade em memória viria vazia e o upsert levaria a semana junto. */
checar('a ponte lê o plano do banco antes de escrever',
  /from\('planos_semanais'\)[\s\S]{0,120}\.select\('\*'\)\.eq\('owner_id'/.test(template),
  'sem a leitura fresca, o upsert grava a grade vazia da sessão por cima da semana dele');
checar('e ela não usa pl6Gravar, que escreveria a grade da sessão',
  template.slice(template.indexOf('async function h8AgendarNaSemana'),
    template.indexOf('async function h8AgendarNaSemana') + 2600).indexOf('pl6Gravar(') < 0);
checar('sem plano da semana ela NÃO inventa a linha',
  template.indexOf('você ainda não montou a semana no Planejamento') > -1,
  'criar a semana por baixo do pano põe o executivo com um plano que ele não montou');
/* E O TOAST CONTA O QUE FALTOU, em vez de afirmar mesmo assim */
checar('quando a semana não recebe, o toast diz por quê',
  template.indexOf('Na sua semana ele NÃO entrou: ') > -1);
checar('a falha na semana não devolve a linha para a fila',
  template.indexOf('nunca devolve a linha para a fila: seria desfazer um registro que existe') > -1,
  'o HubSpot já gravou neste ponto — desfazer na tela criaria divergência com o CRM');
/* UM CALENDÁRIO SÓ: d7ColunaDeHoje passou a derivar da função geral */
checar('a coluna da semana é calculada num lugar só',
  template.indexOf('function pl6ColunaDaData(iso)') > -1
  && template.indexOf('return pl6ColunaDaData(agendaChave(agendaAgora()));') > -1,
  'dois calendários é como duas telas passam a discordar sobre qual dia é quinta');

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('hoje: ' + ok + ' checagens ok — um quadro, uma grade, uma contagem, uma barra e um "ontem".');
