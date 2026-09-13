// scripts/testar-espelho-local.js
//
// NADA ESPERA O ROBÔ: toda escrita que a tela faz, a tela mostra na hora.
// ---------------------------------------------------------------------------------------
// Julyan, 04/09/26: "eu n quero mais nada no robo, tudo tem q ser instantaneo, tudo que
// der." É uma regra de produto, não um ajuste — e regra sem teste volta.
//
// POR QUE ELA PRECISA DE TESTE, com os três casos que a produziram, todos do mesmo mês:
//
//   1. O MRR gravava no HubSpot e o chip voltava a "R$ ?" (#306). A causa era escrever num
//      objeto de retorno que é CÓPIA.
//   2. A reciclagem aparecia na tela e não existia em 10 dos 13 lugares que a buscavam
//      (#307). A causa era o conjunto morar em treze pontos.
//   3. O negócio criado da conta-alvo só entrava no funil na carga seguinte — e o toast
//      dizia, com todas as letras, "o Cockpit reconcilia na próxima rodada automática".
//      A causa era "negócio novo entra nas listas" morar em DOIS lugares, um deles vazio.
//
// Os três são a mesma forma: a escrita acontece e a tela não sabe. Este arquivo mede a
// FORMA, não cada caso — é o que evita o quarto.
//
// O QUE NÃO DÁ PARA SER INSTANTÂNEO, e está aqui para não virar promessa: a COORDENADA
// (geocodificação, só o robô faz), a CONVERSÃO por etapa (agregado de 90 dias) e o
// DIAS-NA-ETAPA de negócio criado fora do cockpit.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const tpl = fs.readFileSync(T, 'utf8');
// O CÓDIGO SEM COMENTÁRIOS: as asserções abaixo procuram chamadas, e as notas longas deste
// arquivo citam os próprios nomes que elas procuram. Já tive esse falso positivo hoje.
const codigo = tpl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

let falhas = 0;
function checar(nome, cond, detalhe) {
  if (cond) { console.log('  ok  ' + nome); return; }
  falhas++;
  console.log('  FALHA  ' + nome + (detalhe ? '  — ' + detalhe : ''));
}

/* ── 1. UM lugar insere negócio novo nas listas ──────────────────────────────────── */
// Dois lugares foi o defeito nº 3: abrirNovaContaProspeccao fazia um push cru e
// abrirPassagemContaAlvoProFunil não fazia nada.
// DUAS FUNÇÕES NOMEADAS têm o direito de empurrar um negócio para as listas, e são
// operações diferentes: `inserirNegocioNoDataLocal` insere um negócio que NÃO existia, e
// `aplicarEtapaNoDataLocal` move um que já existe (tira de uma etapa e põe na outra).
// Qualquer push fora dessas duas é uma terceira implementação — e foi a terceira que
// esqueceu, em cada um dos três defeitos citados no topo.
const DONAS = ['inserirNegocioNoDataLocal', 'aplicarEtapaNoDataLocal'];
const corpoDe = function (fn) {
  const i = codigo.indexOf('function ' + fn);
  return i < 0 ? '' : codigo.slice(i, codigo.indexOf('\n}', i));
};
const pushesTotais = (codigo.match(/DATA\.funilLeads\[[^\]]+\]\.push\(/g) || []).length;
const pushesDasDonas = DONAS.reduce(function (t, fn) {
  return t + (corpoDe(fn).match(/DATA\.funilLeads\[[^\]]+\]\.push\(/g) || []).length;
}, 0);
checar('inserirNegocioNoDataLocal existe', codigo.indexOf('function inserirNegocioNoDataLocal') > 0,
  'sem ela, cada tela insere do seu jeito e uma esquece');
checar('só as duas funções donas empurram negócio para as listas',
  pushesTotais === pushesDasDonas && pushesDasDonas === 2,
  pushesTotais + ' push(es) no total, ' + pushesDasDonas + ' nas donas — o resto é push cru');

/* ── 2. e ela também mexe nos contadores do rep ──────────────────────────────────── */
// Sem isto o cartão aparece e a contagem acima dele continua dizendo o número antigo: uma
// tela discordando de si mesma, que é pior que uma tela desatualizada.
const corpoInsere = (function () {
  const i = codigo.indexOf('function inserirNegocioNoDataLocal');
  return i < 0 ? '' : codigo.slice(i, codigo.indexOf('\n}', i));
})();
checar('a inserção atualiza r.stages e r.open',
  /rep\.stages\[etapa\]/.test(corpoInsere) && /rep\.open/.test(corpoInsere),
  'o cabeçalho da coluna e o Comando de vendas leem esses dois');
checar('e ela é idempotente',
  /jaExiste/.test(corpoInsere),
  'dois cliques, ou o robô passando no meio, duplicariam o negócio na tela');

/* ── 3. as duas portas de criar negócio chamam a função ─────────────────────────── */
['abrirNovaContaProspeccao', 'abrirPassagemContaAlvoProFunil'].forEach(function (fn) {
  const i = codigo.indexOf('function ' + fn);
  const corpo = i < 0 ? '' : codigo.slice(i, i + 9000);
  checar(fn + ' insere na hora',
    /inserirNegocioNoDataLocal\(/.test(corpo),
    'sem isto o negócio criado só aparece na próxima carga do robô');
});

/* ── 4. nenhum toast manda esperar a rodada do robô ─────────────────────────────── */
// Era a frase que fazia o executivo recarregar a aba — e ela aparecia em DUAS criações.
const mandamEsperar = (tpl.match(/reconcilia na próxima rodada/g) || []).length;
checar('nenhum toast promete "reconcilia na próxima rodada"',
  mandamEsperar === 0,
  mandamEsperar + ' ocorrência(s) — a reconciliação acontece, mas ele não espera por ela');

/* ── 5. o endereço gravado entra em região na hora ──────────────────────────────── */
// A região saía de coordenada e por isso dependia do robô; desde o #307 a chave de lugar é
// bairro → CEP → cidade, e o bairro que ele acabou de digitar já basta.
//
// ══ O CAMPO DE ENDEREÇO SAIU DA FICHA EM 09/09/26, E ISTO NÃO É CONSERTO ═══════════════
// A prancha final do Planejamento (planejamento-final-v2) desenha o endereço como LEITURA:
// "endereço (ou 'sem endereço no CRM — confirmar na rua')". O campo editável, com os três
// inputs e o "Salvar no negócio ▸", morava na ficha antiga e saiu com ela.
//
// A CAPACIDADE QUE FOI EMBORA, medida em 04/09: 50 das 86 contas do Bruno estavam sem
// endereço, e sem endereço o negócio não entra em região nenhuma — não casa com o dia da
// rota, não entra no ✨, não aparece no território. Consertar isso pelo cockpit era um
// clique; agora é o HubSpot.
//
// FICA REGISTRADO AQUI porque a próxima pessoa que ler esta suíte vai perguntar onde foi
// parar a checagem — e a resposta não é "não importa mais": é que a prancha nova não tem
// o campo, e devolvê-lo é decisão do Julyan, não minha.
//
// O QUE CONTINUA MEDIDO: os outros três espelhos locais (valor do funil, próximo passo e
// a grade semanal), logo abaixo e acima. A regra "não mande ele esperar o robô" vale para
// todos, e é ela que esta suíte protege.
checar('o toast do endereço não sobreviveu ao campo que saiu',
  codigo.indexOf('if (d.pl6EndSalvar)') < 0 && !/Salvar no negócio/.test(tpl),
  'ramo ou botão de salvar endereço sem o campo que os alimenta é clique morto — e um'
  + ' deles ficou no arquivo depois do redesenho');
checar('e o toast não manda esperar a carga para a região',
  !/entra em região na próxima carga/.test(tpl),
  'a região sai de bairro/CEP desde o #307 — só o km depende da coordenada');

/* ── 6. o MRR e o próximo passo continuam espelhando ────────────────────────────── */
// Os dois primeiros defeitos desta família. As asserções ficam para eles não voltarem.
const iChip = codigo.indexOf('const gravarValor = async function');
const corpoChip = iChip > 0 ? codigo.slice(iChip, iChip + 2200) : '';
checar('o chip de valor do funil espelha pela função única',
  /aplicarPropsNoDataLocal\(id, \{ valor_de_mrr/.test(corpoChip),
  'escrever em lead.valor_de_mrr escreve numa CÓPIA — foi o defeito de #306');
const iPasso = codigo.indexOf('const gravarPasso = async function');
const corpoPasso = iPasso > 0 ? codigo.slice(iPasso, iPasso + 3400) : '';
/* O NOME MUDOU EM 04/09/26 e a razão está na guarda 11: `espelharPassoNaAgenda` passou a
   gravar também na grade semanal (planos_semanais), então virou `espelharPassoNasTelas`.
   Julyan: "quando ele marcar o proximo passo obrigatoriamente tem que ir pra agenda semanal
   dele, tem q ir pra daily tbm, ou seja, tudo tem q se conversar."
   A Daily vem de graça: `d7PlanoDeHoje` LÊ a grade. */
checar('o próximo passo do cartão espelha e vai para as telas',
  /aplicarPropsNoDataLocal\(/.test(corpoPasso) && /espelharPassoNasTelas\(/.test(corpoPasso),
  'sem os dois ele datava de novo e o HubSpot ficava com duas tarefas');
/* E A GRADE NÃO PODE VOLTAR A ESPERAR O ROBÔ: o espelho dela grava em planos_semanais na
   hora, e é dessa linha que o Planejamento e a Daily leem no render seguinte. */
checar('o espelho da grade semanal grava na hora, sem esperar carga',
  /async function espelharPassoNoPlanoSemanal[\s\S]{0,4500}await pl6Gravar\(rep, \{ grade: grade \}, semanaDaTarefa\)/.test(codigo),
  'sem o pl6Gravar a visita ficaria só na sessão e sumiria no próximo login');

/* ══ E GRAVA NA SEMANA DA TAREFA, NÃO NA QUE A TELA ESTÁ MOSTRANDO (11/09/26) ═══════
   Desde que o Planejamento ganhou o botão "próxima semana", `pl6Carregar`/`pl6Gravar`
   sem argumento usam a semana EM FOCO. Este espelho indexa os dias com
   pl6SegundaDaSemana() — a semana corrente —, então tem de ler e gravar a MESMA: um
   passo de hoje, com a tela na semana que vem, entraria na linha errada e no dia errado.
   A Minha Daily tem o mesmo cuidado, pelo mesmo motivo. */
/* REESCRITA EM 13/09/26: a checagem exigia a linha `const semanaDaTarefa =
   pl6SegundaDaSemana();`. A semana da tarefa deixou de ser sempre a corrente — passou
   a ser a que CONTEM a data do passo (esta ou a proxima), porque todo passo marcado
   para a semana seguinte estava sendo recusado em silencio. O que a checagem tem de
   garantir nunca foi a linha: e que a leitura e a escrita recebam a semana POR
   ARGUMENTO, a mesma nas duas, e que ela venha do RELOGIO (pl6SegundaDaSemana) e nao
   do foco da tela (pl6SegundaEmFoco). */
checar('e na semana da TAREFA, não na que a tela mostra',
  /pl6Carregar\(rep, semanaDaTarefa\)/.test(codigo)
    && /pl6Gravar\(rep, \{ grade: grade \}, semanaDaTarefa\)/.test(codigo)
    && /const pl6SegundaAtual = pl6SegundaDaSemana\(\);/.test(codigo)
    && /pl6Gravar\(rep, campos, pl6SegundaDaSemana\(\)\)/.test(codigo),
  'herdar o foco da tela faria o passo de hoje cair na linha da semana que vem, no dia errado');

/* ── 7. e "todas as contas" continua vindo de um lugar ──────────────────────────── */
const naMao = (codigo.match(/pl6Carteira\(rep, regioes\)\s*\n?\s*\.concat\(pl6Novos/g) || []).length;
checar('ninguém monta "todas as contas" na mão',
  naMao === 0,
  naMao + ' lugar(es) — foi o defeito de #307, em 10 de 13 consumidores');

/* ══ 8. O DONO NAO PODE SUMIR NO CAMINHO (13/09/26) ══════════════════════════════════
   Julyan: "fiz um teste e nao foi pro planejamento o proximo passo".

   Medido na producao, logado como o Marco: o botao da ficha chamava o espelho com
   `l.ownerId` UNDEFINED — o objeto do cartao vem de rep.quentes/rep.travados, e nenhum
   item dessas listas tem ownerId (0 de 12). A primeira linha do espelho era
   `if (!lead || !dataISO || !ownerId) return;`: ele saia calado, sem plano, sem agenda
   e sem repintura, enquanto a ficha dizia "ja no seu Planejamento".

   Esta e a MESMA FORMA dos tres casos do topo deste arquivo: a escrita acontece e a
   tela nao sabe. Por isso mora aqui. */
checar('o espelho resolve o dono quando quem chamou não trouxe',
  /function donoDoNegocioNaTela\(/.test(codigo)
    && /const dono = \(ownerId != null && String\(ownerId\) !== ''\) \? String\(ownerId\) : donoDoNegocioNaTela\(lead\);/.test(codigo)
    && !/if \(!lead \|\| !dataISO \|\| !ownerId\) return;/.test(codigo),
  'quatro dos cinco sites do passo entregam lead.ownerId undefined — sem a resolução o '
    + 'espelho sai calado e o Planejamento fica sem a visita que ele acabou de datar');

/* A FONTE do dono e `DATA.funilLeads`: e a unica lista da tela em que todo item traz
   ownerId (26 de 26, medido). E NAO PODE cair para `sessaoAtual`: o gestor abre ficha de
   negocio alheio, e espelhar o passo do Marco no plano do gestor e pior do que nao
   espelhar — seria um compromisso inventado na semana de quem nao vai fazer a visita. */
checar('e a resolução vem do funil, nunca da sessão',
  (function () {
    const i = codigo.indexOf('function donoDoNegocioNaTela(');
    if (i < 0) return false;
    const corpo = codigo.slice(i, codigo.indexOf('\n}', i));
    return corpo.indexOf('DATA.funilLeads') > -1 && corpo.indexOf('sessaoAtual') < 0;
  }()),
  'cair para a sessão poria o passo do executivo na semana do gestor que abriu a ficha');

/* ══ 9. E QUEM FALA DO PLANEJAMENTO E QUEM OLHOU ═════════════════════════════════════
   A frase da ficha prometia o Planejamento sem ter lido o resultado do espelho — e as
   recusas do espelho (`fora`, `cheio`, `foraDaMunicao`) eram silenciosas de proposito.
   Promessa de um lado e silencio do outro e como o defeito passou tres dias de pe.
   O Planejamento tem UMA voz: espelharPassoNasTelas, que e quem sabe se entrou. */
checar('nenhum site do passo promete o Planejamento por conta própria',
  !/já no seu Planejamento/.test(codigo)
    && !/entra no seu Planejamento, na Agenda/.test(codigo),
  'prometer sem conferir é o que fez o Julyan clicar, ler que entrou, e não estar lá');

/* RAMO A RAMO, e nao no total: a primeira versao desta checagem contava `mostrarToast(`
   no corpo inteiro e exigia cinco. Calar o ramo do dia cheio deixou cinco toasts em pe
   (o de dono nao resolvido entra na conta) e a sabotagem passou VERDE. Contar o total
   nao mede "cada saida fala" — mede outra coisa. */
checar('e o espelho fala nas cinco saídas, inclusive quando dá certo',
  (function () {
    const i = codigo.indexOf('function espelharPassoNasTelas(');
    if (i < 0) return false;
    const corpo = codigo.slice(i, codigo.indexOf('\n}', i));
    const saidas = ['r.ok', 'r.fora', 'r.cheio', 'r.foraDaMunicao', 'r.erro'];
    const onde = saidas.map(k => corpo.indexOf('if (' + k + ')'));
    if (onde.some(j => j < 0)) return false;
    /* o ramo de cada saida vai ate o comeco do ramo seguinte (o ultimo, ate o fim do
       corpo) — e e ali DENTRO que o toast dela tem de estar. Medir o total nao serve. */
    return onde.every(function (j) {
      const depois = onde.filter(x => x > j);
      const fim = depois.length ? Math.min.apply(null, depois) : corpo.length;
      return corpo.slice(j, fim).indexOf('mostrarToast(') > -1;
    });
  }()),
  'recusa muda deixa a promessa da tela de pé sozinha — foi assim que o passo sumiu');

/* ══ 10. A GRADE E DE DUAS SEMANAS, E O ESPELHO PROCURA NAS DUAS ════════════════════
   O espelho indexava so a semana em foco, de segunda a sexta. Todo passo marcado para a
   semana seguinte caia em `fora` — e o Planejamento anda duas semanas (PL6_SEMANA 0 e 1),
   entao a segunda existia e ninguem escrevia nela. Medido: passo para 21/09, marcado em
   13/09, recusado calado. */
checar('o espelho procura a data nas duas semanas que o Planejamento abre',
  /for \(let k = 0; k <= 1 && di < 0; k\+\+\)/.test(codigo)
    && /if \(i >= 0\) \{ semanaDaTarefa = seg; dias = ds; di = i; \}/.test(codigo),
  'a semana que vem é metade do que o Planejamento mostra e não recebia passo nenhum');

checar('e a recusa diz o motivo em vez de sumir',
  /motivo = \(dow === 0 \|\| dow === 6\) \? 'fimDeSemana'/.test(codigo)
    && /: \(String\(dataISO\) < String\(pl6SegundaAtual\)\) \? 'passado' : 'longe'/.test(codigo),
  '"não entrou" sem o porquê é a mesma coisa que não dizer nada');

/* ══ 11. UM NEGOCIO, UMA SEMANA (13/09/26) ═══════════════════════════════════════════
   Defeito que o conserto de hoje criou e que eu peguei medindo na producao: com o
   espelho escrevendo tambem na semana seguinte, remarcar o Rico Caipira Parque de 16/09
   para 22/09 pos o negocio na semana que vem e DEIXOU o slot da quarta de pe. O laco
   "sai de onde estava" varre so a grade que esta sendo escrita — bastava enquanto so a
   semana em foco recebia passo.

   A ordem importa: `pl6Carregar` troca o `pl6Plano` do modulo, entao limpar a outra
   semana DEPOIS de escrever deixaria a tela com a grade errada na memoria. */
checar('o passo remarcado sai da outra semana',
  /async function pl6TirarDaSemana\(rep, semana, idNaGrade\)/.test(codigo)
    && /saiuDaOutra = await pl6TirarDaSemana\(rep, outraSemana, idNaGrade\)/.test(codigo),
  'sem isto o mesmo negócio fica em duas semanas e a grade mostra uma visita que não existe');

checar('e sai ANTES de a semana da tarefa ser lida',
  (function () {
    const iLimpa = codigo.indexOf('pl6TirarDaSemana(rep, outraSemana');
    const iLe = codigo.indexOf('pl6Carregar(rep, semanaDaTarefa)');
    return iLimpa > -1 && iLe > -1 && iLimpa < iLe;
  }()),
  'pl6Carregar troca o pl6Plano do módulo — limpar depois deixaria a tela com a grade da '
    + 'semana errada na memória');

checar('e a limpeza só grava quando achou',
  (function () {
    const i = codigo.indexOf('async function pl6TirarDaSemana(');
    if (i < 0) return false;
    const corpo = codigo.slice(i, codigo.indexOf('\n}', i));
    return /if \(!tirou\) return false;/.test(corpo)
      && corpo.indexOf('if (!tirou) return false;') < corpo.indexOf('pl6Gravar(');
  }()),
  'reescrever a semana que não tinha o negócio é escrita à toa em cima do plano dele');

console.log('');
if (falhas) {
  console.error(falhas + ' falha(s) — alguma escrita voltou a esperar o robô.');
  process.exit(1);
}
console.log('espelho local: negócio novo, endereço, MRR e próximo passo aparecem na hora — e por um caminho só.');
