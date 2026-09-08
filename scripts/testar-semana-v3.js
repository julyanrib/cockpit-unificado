/* ══════════════════════════════════════════════════════════════════════════════════════
   ABA SEMANA v3 — o que quebra em silêncio (08/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan, no pedido desta entrega: "nenhum erro, dado instantâneo, quero perfeito, revise
   todo o codigo pra nao deixar nada solto".

   POR QUE ESTA SUITE EXISTE: os dois piores defeitos desta aba já aconteceram, e nenhum
   dos dois deu erro, reprovou build ou apareceu em suite nenhuma:

     1. A REGRA DO QUENTE LIA A LISTA ERRADA. Eu escrevi a regra "temperatura >= 70 e >= 5
        dias sem toque" varrendo `DATA.funilLeads`. Medido no navegador: `temp` existe em
        0 de 140 negócios ali — a temperatura vive nas listas do rep (criticos/quentes).
        A regra NUNCA disparava. A tela simplesmente mostrava quatro ações em vez de
        cinco, para sempre, sem uma linha de erro.

     2. AS REGRAS VARRIAM AS ETAPAS FECHADAS. funilLeads é indexado por etapa e traz
        Perdido, Ganho, Onboarding e Reciclagem. Um negócio PERDIDO com régua estourada
        entraria na conta e viraria ação da semana — a tela mandando cobrar um enterro.
        Medido em 08/09: zero fechados com régua estourada, ou seja, o número estava certo
        por sorte.

   O QUE ELA MEDE, então: que cada regra leia a fonte que TEM o campo, que o vocabulário
   do banco seja o do banco, e que a tela não prometa número que não existe.

   MEDIDO NO NAVEGADOR ANTES DE VIRAR GUARDA (preview do gestor, 08/09): 14 gestos e zero
   vazios, contrato de 25 nomes fechado nas duas direções, os rótulos girando com a pauta,
   o rodapé reativo com nome, a barra de pace com marcador em 40% no dia 2 de 5, o guarda
   de papel devolvendo tela vazia para rep, e o alvo do link da aba Funil intacto. */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
/* o corpo de uma função, para medir a regra dentro dela e não no arquivo inteiro */
function corpoDe(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let d = 0, j = i, viu = false;
  while (j < tpl.length) {
    const c = tpl[j];
    if (c === '{') { d++; viu = true; }
    else if (c === '}') { d--; if (viu && d === 0) return tpl.slice(i, j + 1); }
    j++;
  }
  return '';
}

/* ── 1. A ABA EXISTE E TEM UM DONO SÓ ────────────────────────────────────────────── */
['sm3Dados', 'sm3TelaHTML', 'sm3Acoes', 'sm3Gargalos', 'sm3ModoDe', 'sm3Carregar',
 'sm3Executar', 'sm3Ligar', 'sm3Dinheiro', 'sm3Cadencia', 'sm3AbertosPorEtapa'].forEach(fn => {
  conferir('existe ' + fn,
    (tpl.match(new RegExp('function ' + fn + '\\(', 'g')) || []).length === 1,
    'a aba precisa dela, e uma vez só — duas definições e a última ganha em silêncio');
});

conferir('o render desenha a v3 e mantém as leituras',
  /raiz\.innerHTML = sm3TelaHTML\(sm3Dados\(\)\) \+ sm9LeiturasHTML\(sm9Dados\(\)\);/.test(tpl),
  'as seis leituras ficam no fim (decisão de 08/09): a aba Funil tem um botão que aterrissa numa delas');

conferir('o alvo do link da aba Funil sobreviveu',
  /data-sm9-acao="\$\{lt\.toggle\}"/.test(tpl) && /leitura:escada/.test(tpl),
  'sem ele, o botão "Ver a conversão por turma, na aba Semana" da aba Funil vira clique morto');

/* ── 2. O GUARDA DE PAPEL, na primeira linha do render ───────────────────────────── */
const render = corpoDe('renderSemana');
conferir('o render tem guarda de papel antes de desenhar',
  /role !== 'manager'/.test(render) &&
  render.indexOf("role !== 'manager'") < render.indexOf('sm3TelaHTML'),
  'esta aba mostra o placar de todo mundo; render é função global e basta alguém chamá-la');

/* ── 3. AS REGRAS LEEM A FONTE QUE TEM O CAMPO ───────────────────────────────────── */
const acoes = corpoDe('sm3Acoes');
conferir('a regra do quente lê as listas do rep, não o funilLeads',
  /sm3NegociosDoTime\(\)/.test(acoes) &&
  !/Object\.keys\(leads\)[\s\S]{0,200}l\.temp/.test(acoes),
  'temp existe em 0 de 140 negócios de funilLeads: varrer ali faz a regra nunca disparar, sem erro');

conferir('as regras varrem só as seis etapas abertas',
  /const SM3_ETAPAS_ABERTAS = \[/.test(tpl) &&
  /function sm3AbertosPorEtapa\(\)/.test(tpl) &&
  /const leads = sm3AbertosPorEtapa\(\);/.test(acoes),
  'funilLeads traz Perdido e Ganho: sem o corte, a tela manda cobrar negócio morto');

conferir('os gargalos também varrem só as abertas',
  /const leads = sm3AbertosPorEtapa\(\);/.test(corpoDe('sm3Gargalos')),
  'o mesmo defeito, na conta de "acima da régua" que alimenta o gargalo nº 1');

conferir('o negócio que está em duas listas conta uma vez',
  /const vistos = new Set\(\);/.test(corpoDe('sm3NegociosDoTime')),
  'criticos e quentes se sobrepõem: sem dedup, o mesmo negócio soma dobrado no dinheiro');

/* ── 4. O VOCABULÁRIO DO BANCO É O DO BANCO ──────────────────────────────────────── */
conferir('a promessa é lida como o banco a grava',
  /p\.promessa\.prospeccao\b/.test(tpl) || /Number\(p\.promessa\.prospeccao\)/.test(tpl),
  'planos_semanais.promessa grava `prospeccao` (singular); `prospeccoes` ali devolve undefined e soma NaN');

conferir('não sobrou leitura de prospeccoes no objeto do banco',
  !/promessa\.prospeccoes/.test(tpl.slice(tpl.indexOf('function sm3Dados'), tpl.indexOf('function sm3CombinadoSugerido'))),
  'o mesmo erro, do outro lado: dois nomes para o mesmo campo é o defeito que não dá erro');

/* ── 5. NÃO MEDIDO NÃO É ZERO ────────────────────────────────────────────────────── */
const provedor = corpoDe('sm3Dados');
conferir('os KPIs mostram travessão quando não há medida',
  (provedor.match(/'—'/g) || []).length >= 4,
  'a regra da casa: "não medido" ≠ 0, e nesta tela zero é acusação contra uma pessoa');

conferir('o dinheiro diz quantos negócios não têm valor',
  /frase:/.test(corpoDe('sm3Dinheiro')) && /sem valor no CRM/.test(corpoDe('sm3Dinheiro')),
  'valor preenchido em 6 de 45 negócios: soma sem cobertura leria como total da carteira');

/* A REGEX PEDE A INTERPOLAÇÃO EXATA. `/tituloAcoes/` casava dentro de `tituloAcoesXX`, e
   a sabotagem que renomeou o nome passou verde — a mesma regex frouxa que já me deixou
   uma guarda cega hoje. Aqui se cobra o uso no markup E a entrega no provedor. */
conferir('o título do bloco 1 conta o que está na tela',
  tpl.indexOf('${tituloAcoes}') > -1 &&
  /^\s*tituloAcoes: /m.test(tpl) &&
  !/1 · As 5 ações que viram a semana/.test(corpoDe('sm3TelaHTML')),
  'cravado em "As 5 ações", ele prometia cinco e entregava três — e o gestor procura as duas que faltam');

conferir('o grid das ações segue o número de ações',
  /repeat\(\$\{Math\.min\(Math\.max\(\(acoes5\|\|\[\]\)\.length, ?1\), ?5\)\}/.test(tpl),
  'repeat(5) fixo com duas ações deixa dois cartões estreitos e três colunas de vazio');

conferir('o diagnóstico do modo não afirma cadência que não mediu',
  /cadência não medida/.test(corpoDe('sm3ModoDe')),
  'frase que soa precisa sobre dado que não existe é a pior saída numa tela de cobrança');

conferir('combinado sem ninguém marcado não diz "0 cumpriram"',
  /ninguém marcado ainda/.test(provedor),
  '"0 de 8 cumpriram" acusaria o time todo por falta de clique do gestor');

/* ── 6. UMA PAUTA, UMA SEMANA, UM PUBLICADOR ─────────────────────────────────────── */
const exec = corpoDe('sm3Executar');
conferir('os toggles de pauta gravam pela função da aba Time',
  /tl5Alternar\('acao_semana'/.test(exec) && /tl5Alternar\('modo_agir'/.test(exec) &&
  !/from\('pauta_do_lider'\)/.test(exec),
  'a pauta que a Daily lê tem de ser a mesma que esta tela escreve — dois gravadores é o defeito antigo');

conferir('os dois tipos novos estão no mapa de rituais',
  /acao_semana: 'semanal'/.test(tpl) && /modo_agir: 'semanal'/.test(tpl),
  'sem o mapa, o item cai em ritual "daily" e aparece na rodada errada');

conferir('a semana da pauta usa a regra do produto',
  /if \(!d && typeof pl6SegundaDaSemana === 'function'\)/.test(corpoDe('tl5Semana')),
  'medido: da sexta 17h ao domingo as duas contas discordavam em 7 dias — a janela em que ele monta a Semanal');

conferir('a semana ISO tem uma implementação só',
  (tpl.match(/function numeroDaSemanaISO\(/g) || []).length === 1 &&
  /const semanaISO = numeroDaSemanaISO\(agora\);/.test(tpl),
  'havia uma cópia inline na Time v2 cujo comentário dizia ser "a mesma conta" — conferidas em 2.352 dias, zero divergências');

conferir('os combinados têm uma fonte só',
  !/TL5_ESTADO\.combinadosAnteriores =/.test(tpl) &&
  /from\('combinados_semana'\)/.test(tpl),
  'a leitura de pauta_do_lider tipo combinado saiu: duas fontes para o mesmo bloco, e a que divergir é a que ninguém olha');

/* ── 7. A TELA É INSTANTÂNEA ─────────────────────────────────────────────────────── */
conferir('a Semana repinta quando um negócio muda e quando o farol chega',
  /viewResumo: 'renderSemana'/.test(tpl),
  'ela mostra negócio nomeado nas ações e conta régua nos gargalos; fora do mapa, ficava com o número velho');

conferir('a aba não espera três idas ao Supabase em fila',
  /Promise\.allSettled\(\[/.test(corpoDe('sm9Iniciar')),
  'promessas, pauta e combinados são independentes; em série a tela espera três redes para desenhar o que já calculou');

conferir('uma rede que falha não derruba as outras duas',
  /allSettled/.test(corpoDe('sm9Iniciar')) && !/Promise\.all\(\[/.test(corpoDe('sm9Iniciar')),
  'Promise.all com uma falha deixa a aba sem pauta E sem combinados');

/* ── 8. O CLIQUE OU FAZ OU DIZ ───────────────────────────────────────────────────── */
conferir('o ouvinte é escopado na raiz da aba',
  /closest\('\[data-sm3-raiz\]'\)/.test(corpoDe('sm3Ligar')),
  'sem o escopo, um data-sm3-acao copiado para outra tela cai nesta fiação');

conferir('gravação que falha aparece na tela',
  (exec.match(/não gravou: /g) || []).length >= 2,
  'o clique que "deu certo" sem gravar é o defeito que eu já reportei como sucesso uma vez neste produto');

conferir('sem Supabase o clique diz que não gravou',
  /sem conexão com o Supabase aqui — nada foi gravado/.test(exec),
  'no preview e em rede caída, botão que não faz nada e não diz nada é clique morto');

conferir('um gesto por vez',
  /if \(SM3_GRAVANDO\) return;/.test(exec),
  'dois cliques na mesma chave disparam dois inserts e o segundo bate no unique');

/* ── 9. O CONTRATO FECHADO DO MARKUP ─────────────────────────────────────────────── */
(function () {
  const tela = corpoDe('sm3TelaHTML');
  const decl = tela.slice(tela.indexOf('const {'), tela.indexOf('} = d;'));
  const declara = [...new Set((decl.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []).filter(n => n !== 'const'))];
  const corpo = tela.slice(tela.indexOf('return `'));
  const naoUsados = declara.filter(n => n !== 'd' && corpo.indexOf(n) < 0);
  const semProvedor = declara.filter(n => n !== 'd' && provedor.indexOf(n) < 0);
  conferir('todo nome declarado é usado pelo markup',
    naoUsados.length === 0,
    'nome declarado e nunca usado: ' + naoUsados.join(', '));
  conferir('todo nome do markup é entregue pelo provedor',
    semProvedor.length === 0,
    'o markup leria undefined em: ' + semProvedor.join(', '));
  conferir('o contrato tem os 25 nomes da prancha',
    declara.length >= 25,
    'são ' + declara.length + ' — se caiu, algum bloco da prancha deixou de receber dado');
}());

/* ── 10. O QUE SAIU DA PRANCHA, SAIU ─────────────────────────────────────────────── */
/* ESTES TRÊS MEDEM O MARKUP EMBARCADO, e não o arquivo inteiro. A primeira versão media
   `tpl` e reprovou as três — porque os MEUS COMENTÁRIOS citam os textos removidos como
   exemplo do que saiu. Guarda que lê o próprio comentário reprova o trabalho certo, que é
   o mesmo erro da checagem de @media que achou a palavra dentro de um comentário. */
(function () {
  const tela = corpoDe('sm3TelaHTML');
  const markup = tela.slice(tela.indexOf('return `'));

  conferir('a anotação de design não embarcou',
    markup.indexOf('A tese do Semana v3') < 0,
    'aquele bloco explica o desenho para quem implementa, não para o gestor');

  conferir('os textos de placeholder da prancha viraram dado',
    markup.indexOf('ter, 08 de setembro · semana 37 · dia 2 de 5') < 0 &&
    markup.indexOf('meta da semana: 7 fechamentos') < 0 &&
    markup.indexOf('ataca as 36 visitas acima da régua') < 0,
    'data e meta cravadas mostrariam "dia 2 de 5" numa quinta-feira');

  conferir('a largura fixa de canvas não embarcou',
    markup.indexOf('width:1780px;flex:none;') < 0,
    'duas larguras fixas aninhadas é barra de rolagem lateral em monitor menor');
}());

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('semana v3: ' + ok + ' checagens ok — a aba abre em modo ação, cada regra lê a fonte que tem o campo, e nada promete número que não existe.');
