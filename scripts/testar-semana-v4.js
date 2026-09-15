/* ══════════════════════════════════════════════════════════════════════════════════════
   ABA SEMANA v4 — o que quebra em silêncio (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan, no prompt desta entrega: as três regras invioláveis — nenhum clique morto,
   nenhuma afirmação sem prova, nada abre fora do cockpit.

   ESTA SUITE SUBSTITUI testar-semana-v3.js e CARREGA as lições dela que continuam
   valendo, porque a v4 usa o mesmo motor: a regra do quente lendo a fonte que tem o
   campo, o corte das seis etapas abertas, o vocabulário do banco, "não medido" ≠ 0, uma
   pauta com um publicador só, e o contrato fechado do markup. Apagar aquela suite sem
   trazer os defeitos que ela guardava seria devolver o direito de cometê-los.

   ══ OS QUATRO DEFEITOS QUE JÁ ACONTECERAM, E QUE ESTA SUITE PRENDE ══════════════════
     1. A REGRA DO QUENTE LEU A LISTA ERRADA (v3). `temp` existe em 0 de 140 negócios de
        funilLeads — a temperatura vive nas listas do rep. A regra nunca disparava, e a
        tela mostrava quatro ações em vez de cinco, para sempre, sem uma linha de erro.
     2. AS REGRAS VARRERAM AS ETAPAS FECHADAS (v3). Um negócio PERDIDO com régua
        estourada virava ação da semana: a tela mandando cobrar um enterro.
     3. O CLIQUE DO DOSSIÊ IA MORRER (v4, achado nesta entrega). Eu escrevi
        tm2AbrirDossie e activateTab('viewTime'); nenhum dos dois existe. Quatro botões da
        prancha, HTML válido, listener disparando, e nada acontecendo — o defeito que uma
        auditoria por listener dá como verde.
     4. A BARRA INVERTIDA MORREU DE NOVO (v4, nesta entrega). Escrevi /^\d{4}-/ e chegou
        /^d{4}-/ no arquivo: válida, sempre falsa, guarda nenhuma pega.

   ══ AS DUAS AFIRMAÇÕES QUE A v4 FAZ E A v3 NÃO FAZIA ═══════════════════════════════
   A v4 escreve na tela "nenhum combinado registrado em nenhuma semana" e "temperatura
   não medida neste snapshot". As duas são afirmações sobre AUSÊNCIA, e ausência mentida
   é a pior: se a leitura do Supabase falhou, a primeira é falsa e ninguém sabe. Por isso
   há checagem de que a falha de leitura vira toast, e não console.log.
   ══════════════════════════════════════════════════════════════════════════════════════ */
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
/* o corpo de uma função, para medir a regra DENTRO dela e não no arquivo inteiro — sem
   isto, meus próprios comentários (que citam o texto removido como exemplo) reprovam o
   trabalho certo. Foi o que aconteceu com três checagens da v3 na primeira versão. */
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

/* ══ A PRANCHA v4 SAIU DO AR EM 14/09/26 ═══════════════════════════════════════════
   `renderSemana` passou a desenhar a v5. `sm4Dados` e `sm4TelaHTML` continuam no
   arquivo e ninguém mais as chama; `sm4Ligar` ainda é chamada por `sm9Iniciar`, mas
   escopa o ouvinte numa raiz que a v5 não desenha. Ou seja: as checagens abaixo medem
   o MOTOR — que a v5 usa, e que é o que elas de fato protegem — e um desenho que já
   não está na tela.

   NÃO APAGUEI NENHUMA, de propósito: remover a v4 são ~1.900 linhas e a cascata de
   órfãs que isso abre já gutou este template uma vez. É decisão do Julyan, e está
   reportada. Enquanto ela não vier, este cabeçalho é o que impede alguém (inclusive
   eu) de ler o verde daqui como "a tela da Semana está medida". */
/* ── 1. A ABA EXISTE, COM UM DONO SÓ ─────────────────────────────────────────────── */
['sm4Dados', 'sm4TelaHTML', 'sm4Executar', 'sm4Ligar', 'sm4Consulta', 'sm4Provas',
 'sm4Projecao', 'sm4Veredito', 'sm4Botao', 'sm4Linha', 'sm4Valor', 'sm4Toque', 'sm4Prox',
 'sm4EtapaDe', 'sm4AbertosDe', 'sm4NegocioPorId'].forEach(function (fn) {
  conferir('existe ' + fn,
    (tpl.match(new RegExp('function ' + fn + '\\(', 'g')) || []).length === 1,
    'a aba precisa dela, e uma vez só — duas definições e a última ganha em silêncio');
});

/* ── 2. A TELA v3 SAIU INTEIRA, E NÃO DEIXOU USO PENDURADO ───────────────────────── */
/* "Remover bloco exige varrer os usos": três vezes nesta base eu derrubei uma aba
   deixando o uso de uma declaração removida, e guarda nenhuma cobre variável local. */
['sm3Dados', 'sm3TelaHTML', 'sm3Executar', 'sm3Ligar', 'sm3Gargalos',
 'sm3CombinadoSugerido', 'sm3NotaDeFonte', 'sm3SextaDaSemana'].forEach(function (fn) {
  conferir('a tela v3 levou ' + fn,
    tpl.indexOf('function ' + fn + '(') < 0 && tpl.indexOf(fn + '(') < 0,
    'ficou definida ou chamada em algum lugar — a v3 tinha de sair inteira');
});
conferir('o CSS da v3 saiu com ela',
  tpl.indexOf('data-sm3-hv') < 0 && tpl.indexOf('data-sm3-acao') < 0,
  'regra de hover apontando para markup que não existe mais é peso morto no bundle');

/* O MOTOR FICOU. Ele é lido pelas regras da v4 e por outras telas; apagá-lo com a tela
   seria reescrever a conta da semana com prefixo novo, que é criar a segunda definição
   de cada número — a causa raiz de quase todo defeito que este arquivo já pagou. */
['sm3Acoes', 'sm3ModoDe', 'sm3Dinheiro', 'sm3Cadencia', 'sm3AbertosPorEtapa',
 'sm3NegociosDoTime', 'sm3DescumpriuSemanas', 'sm3SegundaPassada',
 'sm9Projecao', 'sm9Pace', 'sm9Cumprido', 'sm9Elenco', 'sm9VisitasDaSemana'].forEach(function (fn) {
  conferir('o motor manteve ' + fn,
    tpl.indexOf('function ' + fn + '(') > -1,
    'a v4 é desenho novo sobre o motor medido — reescrevê-lo é onde eu trocaria um sinal');
});

/* REESCRITA EM 14/09/26, QUANDO A v5 ENTROU — e não apagada. A regra que esta guarda
   protege não é "a prancha se chama sm4": é que as SEIS LEITURAS ANALÍTICAS continuam
   no fim da aba, porque a aba Funil tem um botão que aterrissa numa delas. A versão
   anterior cravava o nome da prancha no literal, então reprovava o desenho novo sem
   medir nada de errado — "guarda cravada no nome morre", nesta mesma base.

   Agora mede no CORPO do render: a prancha, qualquer que seja o prefixo dela, e as
   leituras DEPOIS dela, na mesma atribuição. */
conferir('o render desenha a prancha e mantém as seis leituras no fim',
  /raiz[.]innerHTML = sm[0-9]TelaHTML[(]sm[0-9]Dados[(][)][)] [+] sm9LeiturasHTML[(]sm9Dados[(][)][)];/
    /* `render` só é declarada na seção 3, abaixo; aqui a leitura é direta. */
    .test(corpoDe('renderSemana')),
  'as leituras ficam no fim (decisão de 08/09): a aba Funil tem um botão que aterrissa numa delas');

conferir('o alvo do link da aba Funil sobreviveu',
  /data-sm9-acao="\$\{lt\.toggle\}"/.test(tpl) && /leitura:escada/.test(tpl),
  'sem ele, o botão "Ver a conversão por turma, na aba Semana" da aba Funil vira clique morto');

/* ── 3. O GUARDA DE PAPEL, ANTES DE DESENHAR ─────────────────────────────────────── */
const render = corpoDe('renderSemana');
conferir('o render tem guarda de papel antes de desenhar',
  /* A ÂNCORA É `sm9LeiturasHTML`, e não a prancha: é a parte do desenho que NÃO muda
     de nome a cada repaginação, e está na MESMA atribuição — então se o papel for
     conferido depois dela, o executivo já viu o placar do time inteiro. */
  antesDe(render, "role !== 'manager'", 'sm9LeiturasHTML'),
  'esta aba mostra o placar de todo mundo; render é função global e basta alguém chamá-la');

conferir('a fiação liga a v4',
  /if \(typeof sm4Ligar === 'function'\) sm4Ligar\(\);/.test(corpoDe('sm9Iniciar')),
  'sem ligar, a primeira tela desenhada não responde a clique nenhum');

/* ── 4. QUEM É DO CAMPO: UMA DECLARAÇÃO SÓ ───────────────────────────────────────── */
/* Julyan em 09/09: "pode tirar a amanda do cockpit que ela tá no inside". A declaração já
   existia no dado (fieldStatus), e MEDIDO: três filtros de elenco não a liam — entre eles
   sm9Elenco, o elenco do placar desta aba. A régua da Pessoas tirava a Amanda e a Semana
   a somava na meta, no mesmo dia, para o mesmo gestor. */
conferir('existe uma função só para "quem é do campo"',
  (tpl.match(/function ehDeCampo\(/g) || []).length === 1 &&
  (tpl.match(/function elencoDeCampo\(/g) || []).length === 1,
  'nove cópias do mesmo predicado é como três delas divergiram sem ninguém notar');
conferir('o predicado corta quem está em transição para o inside',
  /function ehDeCampo\(u\) \{[\s\S]{0,200}transicao_inside/.test(tpl),
  'sem o corte, quem saiu para o inside entra no placar da semana somando meta');
conferir('o elenco do placar usa a declaração',
  /function sm9Elenco\(\) \{\s*\n?\s*return elencoDeCampo\(\);/.test(tpl),
  'era role rep && !aComecar, sem fieldStatus — o defeito que o Julyan viu na tela');
conferir('os negócios do time usam a declaração',
  /elencoDeCampo\(\)\.forEach/.test(corpoDe('sm3NegociosDoTime')),
  'sem isto, os negócios de quem saiu do campo viram cobrança de gente que não está na rua');
conferir('a régua da aba Pessoas continua no mesmo predicado',
  /function ps6Ativos\(\) \{\s*\n?\s*return elencoDeCampo\(\)\.map/.test(tpl),
  'ela era a única que acertava; se ela sair da declaração, volta a divergir');

/* ── 5. AS REGRAS LEEM A FONTE QUE TEM O CAMPO ───────────────────────────────────── */
const acoes = corpoDe('sm3Acoes');
conferir('a regra do quente lê as listas do rep, não o funilLeads',
  /sm3NegociosDoTime\(\)/.test(acoes) &&
  !/Object\.keys\(leads\)[\s\S]{0,200}l\.temp/.test(acoes),
  'temp existe em 0 de 140 negócios de funilLeads: varrer ali faz a regra nunca disparar, sem erro');

conferir('as regras varrem só as seis etapas abertas',
  /const SM3_ETAPAS_ABERTAS = \[/.test(tpl) &&
  /const leads = sm3AbertosPorEtapa\(\);/.test(acoes),
  'funilLeads traz Perdido e Ganho: sem o corte, a tela manda cobrar negócio morto');

conferir('a projeção da v4 também lê as listas que têm temperatura',
  /sm3NegociosDoTime\(\)/.test(corpoDe('sm4Projecao')) &&
  !/funilLeads/.test(corpoDe('sm4Projecao')),
  'o mesmo defeito da v3, na conta nova: em funilLeads não há uma nota de temperatura');

conferir('o negócio de uma pessoa sai das seis abertas',
  /sm3AbertosPorEtapa\(\)/.test(corpoDe('sm4AbertosDe')),
  'sem o corte, o funil de cada um incluiria os perdidos dele');

conferir('o negócio pelo id procura nas duas fontes',
  /sm3AbertosPorEtapa\(\)/.test(corpoDe('sm4NegocioPorId')) &&
  /sm3NegociosDoTime\(\)/.test(corpoDe('sm4NegocioPorId')),
  'a jogada do quente nasce de criticos/quentes; procurar só em funilLeads abriria painel vazio');

/* ── 6. O VOCABULÁRIO DO BANCO É O DO BANCO ──────────────────────────────────────── */
const provedor = corpoDe('sm4Dados');
conferir('a promessa é lida como o banco a grava',
  /promessa\.prospeccao\b/.test(tpl),
  'planos_semanais.promessa grava `prospeccao` (singular); `prospeccoes` devolve undefined e soma NaN');
conferir('não sobrou leitura de prospeccoes no objeto do banco',
  !/promessa\.prospeccoes/.test(provedor) && !/promessa\.prospeccoes/.test(corpoDe('sm4Provas')),
  'dois nomes para o mesmo campo é o defeito que não dá erro');
conferir('o dinheiro mensal é mrr || valor_de_mrr, e não o contrato',
  /Number\(l && \(l\.mrr \|\| l\.valor_de_mrr\)\)/.test(corpoDe('sm4Valor')),
  'valor/amount é contrato: somado com mensal, o "R$ em jogo" mistura duas moedas');

/* ── 7. NÃO MEDIDO NÃO É ZERO ────────────────────────────────────────────────────── */
conferir('o topo mostra travessão quando não há medida',
  (provedor.match(/'—'/g) || []).length >= 3,
  'a regra da casa: "não medido" ≠ 0, e nesta tela zero é acusação contra uma pessoa');

conferir('a projeção separa "não medido" de "zero prováveis"',
  /medido:/.test(corpoDe('sm4Projecao')) &&
  /const medido = comNota\.length > 0;/.test(corpoDe('sm4Projecao')),
  'sem temperatura no snapshot, contar 0 prováveis declara a semana em risco por silêncio do robô');

/* ESTA CHECAGEM MEDIA TEXTO E NÃO MECANISMO. A primeira versão só exigia as palavras
   'nao_medido' e 'vespera' dentro da função; sabotei o `if (!pr.medido)` para `if (false)`
   e ela passou VERDE — as palavras continuavam lá, e o veredito voltava a declarar "em
   risco" por falta de dado. É o mesmo erro que já me deixou três guardas cegas medindo
   ordem de array em vez da regra. Agora ela cobra as CONDIÇÕES e a ORDEM: os dois portões
   têm de existir e têm de vir ANTES de qualquer return de risco. */
(function () {
  const v = corpoDe('sm4Veredito');
  const portaoVespera = v.indexOf('if (!P.comecou) {');
  const portaoMedido = v.indexOf('if (!pr.medido) {');
  const risco = v.indexOf("chave: 'risco'");
  conferir('o veredito não declara risco por falta de dado',
    portaoVespera > -1 && portaoMedido > -1 && risco > -1 &&
    portaoVespera < risco && portaoMedido < risco &&
    /nao_medido/.test(v) && /vespera/.test(v),
    'a prancha só previu ganha/no ritmo/em risco porque assumia dado completo — sem os dois '
    + 'portões antes, o silêncio do robô vira acusação contra o time');
}());

conferir('a regra do veredito é a do prompt',
  /proj >= P\.meta/.test(corpoDe('sm4Veredito')) &&
  /proj >= P\.meta - 1 && pace\.feitoPct >= pace\.esperadoPct/.test(corpoDe('sm4Veredito')),
  'projeção ≥ meta -> ganha · ≥ meta−1 e pace ≥ esperado -> no ritmo · senão -> em risco');

conferir('o toque ausente não vira "há muito tempo"',
  /sem registro de toque no CRM/.test(corpoDe('sm4Toque')),
  'ultimaInteracao em 103 de 140: nos outros 37 a data que falta não se inventa');

conferir('a falta de próximo passo só acende onde a régua estourou',
  /ruim: !!\(l && l\.slaBreach\)/.test(corpoDe('sm4Prox')),
  'medido: 3 de 140 têm próxima atividade — vermelho por linha sairia 137 vezes e não diria nada');

conferir('o dinheiro diz quantos negócios não têm valor',
  /frase:/.test(corpoDe('sm3Dinheiro')) && /sem valor no CRM/.test(corpoDe('sm3Dinheiro')) &&
  /com valor no CRM/.test(provedor),
  'mensal preenchido em 25 de 140: soma sem cobertura leria como total da carteira');

conferir('a cadência não medida não vira fileira de zeros',
  /cadência não medida/.test(corpoDe('sm4Provas')),
  'série ausente inteira é o robô calado, não dez dias sem trabalhar');

conferir('combinado sem registro não lê como cumprimento',
  /Isto não é 100% de cumprimento/.test(corpoDe('sm4Consulta')) ||
  /não existe combinado gravado em nenhuma semana/.test(corpoDe('sm4Consulta')),
  '"0 combinados descumpridos" com a tabela vazia leria como elogio medido');

conferir('a falha de leitura dos combinados vira toast, não console',
  /SM4_ESTADO\.toast = 'não consegui ler os combinados no Supabase/.test(tpl) &&
  /falhouLeitura/.test(tpl),
  'a v4 AFIRMA "nenhum combinado registrado": se a leitura falhou, a frase é falsa em silêncio');

/* ── 8. AS CONTAGENS E OS TEXTOS DA PRANCHA SÃO DADO ────────────────────────────── */
conferir('as duas colunas contam quem existe',
  /nAtencao: String\(atencao\.length\)/.test(provedor) &&
  /nRitmo: String\(ritmo\.length\)/.test(provedor),
  'a prancha cravou (4) e (4): num time de 11 com snapshot pela metade é a maquete falando por cima do CRM');

/* MEDIDO NO PREVIEW COM DADO REAL: a coluna "precisam de você" saiu com ZERO e a de
   ritmo com dez. Cadência não medida em 10 de 10, visitas em 10 de 10, promessa em 0 de
   10 — e as cinco regras de intervenção dependem de uma das três. A coluna era
   estruturalmente vazia, e o gestor leria o silêncio como "ninguém, o time está bem".
   É o espelho do "não medido virou zero", e o lado mais perigoso: o zero que acusa
   alguém é contestado; o zero que tranquiliza, ninguém contesta. */
conferir('a coluna vazia diz por que está vazia',
  /atencaoVaziaTxt/.test(provedor) && /const semBase = !comCadencia && !comVisitas && !comPromessa;/.test(provedor) &&
  /Isto NÃO quer dizer que o time está bem/.test(provedor),
  '"Precisam de você (0)" é ambíguo: sem separar "ninguém precisa" de "não consegui medir", '
  + 'a tela responde a terceira pergunta do gestor com um silêncio tranquilizador');

conferir('e a razão é contada, não opinada',
  /comCadencia = avaliados\.filter/.test(provedor) &&
  /comVisitas = avaliados\.filter/.test(provedor) &&
  /comPromessa = avaliados\.filter/.test(provedor),
  'a frase cita quantos têm cada medida: sem contar, ela seria uma desculpa genérica');

conferir('o reconhecimento é de quem puxou, medido',
  /comFech/.test(provedor) && /Ninguém fechou nesta semana ainda/.test(provedor),
  'a prancha cravou "Reconheça a Kelly"; sem ninguém com fechamento, o card não inventa um herói');

conferir('o dia útil vem da data, não de aritmética minha',
  /sm9DiaUtil\(\)/.test(corpoDe('sm9Projecao')) && /P\.dia/.test(provedor),
  'eu já errei o dia da semana nesta base e o gestor leu "0 hoje" de quem tinha 6');

conferir('o carimbo de sync é o do HubSpot',
  /DATA\.hubspotUpdatedAtFmt/.test(provedor),
  'a prancha dizia "sincronizados há 12 min" fixo: a tela mentindo sobre frescor é a mentira que ninguém desconfia');

/* ── 9. UMA PAUTA, UM PUBLICADOR, UM DESTINO ─────────────────────────────────────── */
const exec = corpoDe('sm4Executar');
conferir('os toggles gravam pela função da aba Time',
  /await tl5Alternar\(/.test(exec) && !/from\('pauta_do_lider'\)/.test(exec),
  'a pauta que a Daily lê tem de ser a mesma que esta tela escreve — dois gravadores é o defeito antigo');

conferir('o destino vai como argumento do item',
  /async function tl5Alternar\(tipo, alvoOwnerId, titulo, detalhe, chaveDaTela, ritualDoItem\)/.test(tpl) &&
  /ritual: ritualDoItem \|\| TL5_RITUAL\[tipo\] \|\| 'daily'/.test(tpl),
  'a mesma jogada vai para o 1:1 se é cobrança e para o campo se é rua: o destino é do item');

conferir('quem não passa destino continua no mapa de rituais',
  /ritualDoItem \|\| TL5_RITUAL\[tipo\]/.test(tpl),
  'as abas Time, Pessoas e Daily chamam sem o argumento — elas não podem mudar de comportamento');

conferir('o ritual novo está no mapa',
  /campo_semana: 'campo'/.test(tpl),
  'sem o mapa, ir a campo cairia em ritual daily e apareceria na rodada errada');

conferir('o destino tem uma taxonomia só',
  /const SM4_DESTINOS = \{/.test(tpl) &&
  (tpl.match(/const SM4_DESTINOS/g) || []).length === 1,
  'nome e cor de destino em dois lugares é um deles divergindo do que a Daily consome');

conferir('a pauta do rodapé lista só os itens desta tela',
  /k\.indexOf\('semana_'\) === 0/.test(provedor),
  'sem o filtro, o ✕ removeria uma decisão tomada na Daily sem o gestor saber');

conferir('a semana da pauta usa a regra do produto',
  /if \(!d && typeof pl6SegundaDaSemana === 'function'\)/.test(corpoDe('tl5Semana')),
  'medido: da sexta 17h ao domingo as duas contas discordavam em 7 dias — a janela em que ele monta a Semanal');

conferir('a semana ISO tem uma implementação só',
  (tpl.match(/function numeroDaSemanaISO\(/g) || []).length === 1,
  'cópia inline cujo comentário dizia ser "a mesma conta" — conferidas em 2.352 dias');

/* ── 9b. O COMBINADO DA SEMANA NASCE NA FAIXA DA PAUTA ──────────────────────────── */
/* Julyan em 09/09: "na pauta dessa tela mesmo, com destino Semanal". Ele existe porque a
   jogada nº 2 ("combinado descumprido ≥2 semanas") lê combinados_cumprimento, que só tem
   linha se alguém CRIOU um combinado — e o único caminho de criação do produto tinha saído
   com a tela da v3, deixando aquela regra escrita e morta para sempre. */
(function () {
  const g = corpoDe('sm4GargaloDaEtapa');
  const s = corpoDe('sm4CombinadoSugerido');
  conferir('o combinado tem motor próprio, e não sm3Gargalos de volta',
    quantas(tpl, 'function sm4GargaloDaEtapa(') === 1 &&
    quantas(tpl, 'function sm4CombinadoSugerido(') === 1 &&
    quantas(tpl, 'function sm4SextaDaSemana(') === 1 &&
    tpl.indexOf('function sm3Gargalos(') < 0,
    'sm3Gargalos devolvia TRÊS gargalos e a v4 usa um: reviver 120 linhas para ler um terço '
    + 'delas é código morto nascendo');

  conferir('o gargalo varre só as etapas abertas',
    /sm3AbertosPorEtapa\(\)/.test(g),
    'funilLeads traz Perdido e Ganho: o combinado da semana mandaria o time cobrar um enterro');

  conferir('a régua do gargalo vem da configuração',
    /DATA\.stageMeta \|\| \{\}\)\.slaDays/.test(g),
    'dia de SLA cravado no template divergiria de data/stageMeta no próximo ajuste');

  conferir('gargalo vazio é resultado, não ausência de dado',
    /if \(!ids\.length\) return \{ vazio: true, n: 0 \};/.test(g) &&
    /Nenhuma etapa acima da régua nesta semana — combinado livre/.test(s),
    'zero negócio acima da régua é a melhor notícia da semana; sugerir tema inventado ali '
    + 'seria a tela fabricando um problema');

  conferir('o combinado sugerido cita o número que ataca',
    /ataca os ' \+ g\.n \+ ' negócio/.test(s),
    'combinado sem número é slogan, e slogan não se cobra na segunda seguinte');

  const exec4 = corpoDe('sm4Executar');
  conferir('o combinado grava em combinados_semana, e não na pauta',
    /from\('combinados_semana'\)\.insert/.test(exec4) &&
    exec4.indexOf("tl5Alternar('combinado'") < 0,
    'ele tem dono, prazo, playbook, alvos e CUMPRIMENTO POR PESSOA — nada disso cabe num '
    + 'item de pauta, e modelá-lo duas vezes é a divergência que ninguém olha');

  conferir('desfazer apaga a linha, não marca na_semanal=false',
    /from\('combinados_semana'\)\.delete\(\)\.eq\('id', existente\.id\)/.test(exec4),
    'combinado que não foi fechado não é combinado meio-fechado: é combinado que não existe, '
    + 'e a linha fantasma apareceria no histórico da semana seguinte');

  conferir('os alvos ficam vazios de propósito',
    /alvo_owner_ids: \[\],/.test(exec4) && /o time todo/.test(exec4),
    'nomear os donos congelaria a lista de quem segura negócio parado HOJE, e na sexta o '
    + 'combinado cobraria as pessoas erradas');

  conferir('o combinado também confere na fonte',
    /const agora = \(SM3_ESTADO\.combinados \|\| \[\]\)\.some/.test(exec4) &&
    /NÃO GRAVOU: o banco aceitou sem erro mas o combinado/.test(exec4),
    'é a única gravação desta tela fora de tl5Alternar, então precisa da própria conferência '
    + '— e ela é na lista relida, porque TL5_ESTADO.pauta nunca teria notícia dele');

  conferir('a conferência do combinado vem depois de reler',
    antesDe(exec4, 'await sm3Carregar();', 'const agora = (SM3_ESTADO.combinados'),
    'conferir antes de reler mediria o cache, que é o próprio defeito');

  conferir('o destino declarado é a Semanal',
    /const cbDest = SM4_DESTINOS\.semanal;/.test(provedor) &&
    /passa a valer para a jogada/.test(provedor),
    'foi o destino que ele pediu, e a linha embaixo do botão tem de dizer isso');

  conferir('falha de leitura não vira "não existe combinado"',
    /naoLeu: cbFalhou && !oCombinado,/.test(provedor) &&
    /const cbFalhou = !!SM3_ESTADO.falhouLeitura;/.test(provedor) &&
    /esta linha NÃO diz que/.test(provedor),
    'afirmar ausência quando houve erro de rede é a pior mentira da tela: ninguém desconfia dela');

  conferir('o combinado abre a prova dele',
    /prova: 'lista:combsemana'/.test(provedor) &&
    corpoDe('sm4Consulta').indexOf("verbo === 'combsemana'") > -1,
    'ele AFIRMA "ataca os N acima da régua em X" — sem a consulta, seria a única afirmação '
    + 'desta tela sem prova atrás');
}());

/* ── 10. O CLIQUE OU FAZ OU DIZ ──────────────────────────────────────────────────── */
conferir('o ouvinte é escopado na raiz da aba',
  /closest\('\[data-sm4-raiz\]'\)/.test(corpoDe('sm4Ligar')),
  'sem o escopo, um data-sm4-acao copiado para outra tela cai nesta fiação');

conferir('o ouvinte não empilha',
  /if \(SM4_OUVINTE\) return;/.test(corpoDe('sm4Ligar')),
  'dois ouvintes fazem cada toggle gravar e desfazer no mesmo clique, sem erro nenhum');

conferir('um gesto por vez',
  /if \(SM4_GRAVANDO\) return;/.test(exec),
  'dois cliques na mesma chave disparam dois inserts e o segundo bate no unique');

conferir('gravação que falha aparece na tela',
  /temToast: !!SM4_ESTADO\.toast/.test(provedor) &&
  /SM4_ESTADO\.toast = TL5_ESTADO\.toast;/.test(exec),
  'o clique que "deu certo" sem gravar é o defeito que eu já reportei como sucesso uma vez neste produto');

/* MEDIDO CLICANDO NO PREVIEW: o toast anunciou 'Sabor nordestino ... ✓ na pauta' e o
   rodapé continuou em 'ver pauta (0)'. tl5Alternar declara sucesso quando o insert não
   devolve ERRO — e 'sem erro' não é 'gravou': no eco do preview a linha volta e nada
   persiste, e no banco real uma política de RLS que barre a escrita devolve sucesso com
   zero linhas. Eu já publiquei um botão que reportou sucesso sem gravar neste produto. */
/* CONTAGEM POR indexOf E NÃO POR REGEX: o parêntese do nome da função vira grupo aberto
   e a expressão nem compila — e nas vezes em que compila, é porque a barra invertida
   morreu no caminho e a regex passou a medir outra coisa. Quarta vez nesta base. */
function quantas(texto, trecho) {
  return texto.split(trecho).length - 1;
}
/* ORDEM COM AS DUAS PRESENCAS EXIGIDAS. `a.indexOf(x) < a.indexOf(y)` devolve TRUE
   quando x NAO EXISTE, porque indexOf da -1 e -1 e menor que tudo — sabotei removendo a
   chamada que a ordem protege e a suite passou VERDE. Quatro checagens minhas estavam
   cegas por isto. */
function antesDe(texto, a, b) {
  const ia = texto.indexOf(a), ib = texto.indexOf(b);
  return ia > -1 && ib > -1 && ia < ib;
}
conferir('a gravação é conferida na fonte, não no eco',
  quantas(tpl, 'function sm4Confirmar(') === 1 &&
  quantas(exec, 'sm4Confirmar(') === 4,
  'as quatro gravações desta tela têm de reler a pauta e checar se o item ESTÁ lá');

conferir('a conferência sabe o que o clique pedia',
  quantas(exec, 'const jaEstava = ') === 3,
  'sem guardar o estado anterior, não há contra o que conferir depois — e toggle confere nos dois sentidos');

conferir('a conferência vem depois de reler o banco',
  antesDe(exec, 'await tl5CarregarPauta();', 'sm4Confirmar('),
  'conferir o cache antes de reler mediria o que eu acho que gravei, que é o próprio defeito');

conferir('a conferência não engole o erro mais específico',
  /jaReclamou/.test(tpl) && /não gravou/.test(tpl),
  'se tl5Alternar já disse o motivo, a mensagem dela é melhor que a minha e fica');

/* ESTA CHECAGEM NASCEU DE UMA SABOTAGEM QUE PASSOU VERDE. Contar as quatro chamadas de
   sm4Confirmar não prova que ela COMPARA nada: troquei o corpo dela por
   `if (true) return true;` e a suite continuou verde — uma conferência que aprova tudo,
   que é pior que nenhuma, porque ela dá a impressão de estar medindo. Agora a guarda
   cobra as duas partes do mecanismo: ler o estado do banco e compará-lo com o pedido. */
(function () {
  const c = corpoDe('sm4Confirmar');
  conferir('a conferência de fato compara o banco com o pedido',
    /const esta = !!TL5_ESTADO\.pauta\[chave\];/.test(c) &&
    /if \(esta === queria\) return true;/.test(c) &&
    quantas(c, 'return true;') === 1,
    'sem a leitura E a comparação, ela é uma função que aprova tudo — e aprovar tudo é '
    + 'exatamente o defeito que ela existe para pegar');
}());

conferir('verbo desconhecido reclama em vez de sair calado',
  /clique sem destino nesta tela/.test(exec),
  'clique que não faz nada e não reclama é o que uma auditoria por listener dá como verde');

/* TODO VERBO QUE O MARKUP PRODUZ TEM RAMO NO EXECUTOR — as duas direções.
   Um verbo sem ramo é clique morto; um ramo sem verbo é código que ninguém alcança. */
(function () {
  const tela = corpoDe('sm4TelaHTML');
  const markup = tela.slice(tela.indexOf('return `'));
  /* os verbos que o markup pode emitir, pelos nomes que o provedor entrega */
  const VERBOS = ['lista', 'fechar', 'abrir', 'dossie', 'dossienome', 'acao', 'modo',
    'rec', 'tirar', 'pautaver', 'combinado'];
  const semRamo = VERBOS.filter(function (v) {
    if (v === 'pautaver' || v === 'fechar') return exec.indexOf("verbo === '" + v + "'") < 0;
    return exec.indexOf("verbo === '" + v + "'") < 0;
  });
  conferir('todo verbo desta tela tem ramo no executor',
    semRamo.length === 0,
    'sem ramo, o botão cai no "clique sem destino": ' + semRamo.join(', '));
  conferir('o markup carrega a fiação da própria aba',
    markup.indexOf('data-sm4-acao') > -1 && markup.indexOf('data-sm3-acao') < 0,
    'atributo de outra família cai no ouvinte de outra aba, ou em nenhum');
  conferir('a raiz da aba está no markup',
    markup.indexOf('data-sm4-raiz') > -1 || tela.indexOf('data-sm4-raiz') > -1,
    'sem a raiz, o closest do ouvinte falha e NENHUM clique da aba funciona');
}());

/* O DOSSIÊ USA O CAMINHO QUE EXISTE. Eu escrevi tm2AbrirDossie e activateTab('viewTime')
   nesta mesma entrega: os dois inexistentes, quatro botões, e nada acontecendo. */
conferir('o dossiê navega por gxFocarExecutivo',
  /gxFocarExecutivo\(oid\)/.test(exec) &&
  (tpl.match(/function gxFocarExecutivo\(/g) || []).length === 1,
  'era tm2AbrirDossie + viewTime, que não existem: 4 botões da prancha sem destino');
conferir('não sobrou nome de função inventada',
  tpl.indexOf('tm2AbrirDossie') < 0 && tpl.indexOf("activateTab('viewTime')") < 0,
  'nome que eu supus em vez de conferir é clique morto com aparência de clique vivo');
/* MEDE DENTRO DO RAMO, e não no executor inteiro: `SM4_ESTADO.painel = null;` também
   existe no ramo de 'fechar', que vem ANTES — então a checagem no texto todo casava aquela
   ocorrência e passava verde mesmo com o ramo do dossiê sem a linha. Âncora que casa em
   mais de um lugar não sabota nada: ela só finge medir. */
(function () {
  /* DELIMITA PELA INDENTAÇÃO DE DOIS ESPAÇOS, que é a dos ramos de primeiro nível: dentro
     deste ramo existe um `if (verbo === 'dossienome')` ANINHADO (indentado com quatro), e
     procurar 'if (verbo ===' cru fechava o recorte 105 bytes depois do início — o recorte
     ficava sem a linha que eu queria medir e a checagem reprovava o código CERTO. */
  const ABRE = "  if (verbo === 'dossie' || verbo === 'dossienome') {";
  const i = exec.indexOf(ABRE);
  const fim = i > -1 ? exec.indexOf('\n  if (verbo === ', i + ABRE.length) : -1;
  const ramo = (i > -1) ? exec.slice(i, fim > -1 ? fim : exec.length) : '';
  conferir('o dossiê fecha o painel antes de trocar de aba',
    ramo.length > 0 && antesDe(ramo, 'SM4_ESTADO.painel = null;', 'gxFocarExecutivo'),
    'o overlay escuro fica pendurado sobre a aba nova, e o gestor vê a Time atrás de um véu');
}());
conferir('sem a função, o clique DIZ que não foi',
  /o dossiê da aba Time não respondeu nesta sessão/.test(exec),
  'em vez de parecer que foi — que é o defeito, não a falha');

/* ── 11. NADA ABRE FORA DO COCKPIT ───────────────────────────────────────────────── */
(function () {
  const tela = corpoDe('sm4TelaHTML');
  const markup = tela.slice(tela.indexOf('return `'));
  conferir('o markup não tem link externo',
    markup.indexOf('<a ') < 0 && markup.indexOf('http') < 0 &&
    markup.indexOf('target="_blank"') < 0,
    'regra nº 3: HubSpot e Supabase são backend, e zero links saem desta tela');
  conferir('o executor não abre janela',
    exec.indexOf('window.open') < 0 && exec.indexOf('location.href') < 0,
    'a prova abre em painel lateral interno, não numa aba do navegador');
  conferir('o painel lateral existe no markup',
    markup.indexOf('${(temPainel) ?') > -1 || markup.indexOf('temPainel') > -1,
    'sem ele, os cliques de prova não têm onde aterrissar');
}());

/* ── 12. TODA PROVA APONTA PARA UMA CONSULTA QUE EXISTE ──────────────────────────── */
(function () {
  const provas = corpoDe('sm4Provas');
  const consulta = corpoDe('sm4Consulta');
  const pedidos = [...new Set((provas.match(/'lista:([a-z]+):/g) || [])
    .map(function (x) { return x.slice(7, -1); }))];
  const semRamo = pedidos.filter(function (v) { return consulta.indexOf("verbo === '" + v + "'") < 0; });
  conferir('toda prova aponta para consulta que existe',
    pedidos.length >= 6 && semRamo.length === 0,
    'consulta sem ramo abre painel dizendo "não reconhecida": ' + (semRamo.join(', ') || 'nenhuma prova encontrada'));
  /* e o inverso: consulta que ninguém pede é painel que nunca abre.
     O SLICE ESTAVA ERRADO por 2 caracteres e devolvia "'fechados" com apóstrofo — as 13
     consultas apareciam como órfãs. Guarda que mede errado reprova o trabalho certo, e é
     a terceira vez que um índice cravado me faz isso: capturar pelo grupo do exec não tem
     essa opção. */
  const ramos = [];
  const RE_RAMO = /verbo === '([a-z]+)'/g;
  let mr;
  while ((mr = RE_RAMO.exec(consulta))) { if (ramos.indexOf(mr[1]) < 0) ramos.push(mr[1]); }
  const doTopo = ['fechados', 'projecao', 'emjogo', 'deal'];
  const orfaos = ramos.filter(function (v) {
    return pedidos.indexOf(v) < 0 && doTopo.indexOf(v) < 0 &&
      provedor.indexOf("lista:" + v) < 0;
  });
  conferir('nenhuma consulta é órfã',
    orfaos.length === 0,
    'consulta que ninguém pede é painel que nunca abre: ' + orfaos.join(', '));
}());

conferir('toda consulta declara o filtro que usou',
  (corpoDe('sm4Consulta').match(/fonte:/g) || []).length >= 8 &&
  /CRM · dono = /.test(corpoDe('sm4Consulta')),
  'sem o filtro no rodapé, "2 negócios parados" é afirmação e não prova');

conferir('nenhuma consulta devolve lista vazia calada',
  /const vazio = function \(titulo, sub, fonte, porque, dossieDe\)/.test(corpoDe('sm4Consulta')) &&
  /nada a mostrar/.test(corpoDe('sm4Consulta')),
  'painel vazio com sucesso é o defeito mais barato de produzir nesta base e o mais caro de achar');

conferir('consulta desconhecida não devolve null',
  /Consulta não reconhecida/.test(corpoDe('sm4Consulta')),
  'um clique que abre painel em branco é pior que um clique que diz o que aconteceu');

conferir('toda pessoa tem pelo menos uma prova',
  /if \(!fora\.length\) \{/.test(corpoDe('sm4Provas')) &&
  /nenhum número dele\(a\) foi medido/.test(corpoDe('sm4Provas')),
  'card que abre em branco é clique morto com aparência de clique vivo');

/* ── 13. AS DUAS PALAVRAS SEPARADAS ─────────────────────────────────────────────── */
conferir('projeção e pace são contas diferentes, e a tela sabe',
  /function sm4Projecao\(/.test(tpl) && /function sm9Projecao\(/.test(tpl) &&
  /fechados \+ /.test(provedor),
  'a extrapolação de ritmo não tem lista atrás: ninguém pode clicar em "3" e ver quais são os três');

conferir('o corte de quente vem da configuração',
  /DATA\.temperaturaRegua/.test(corpoDe('sm4CorteQuente')),
  'régua cravada no template divergiria de data/temperatura.json no próximo ajuste');

/* ── 14. O NOME DO CRM NÃO EXECUTA NA SESSÃO DO GESTOR ──────────────────────────── */
(function () {
  const tela = corpoDe('sm4TelaHTML');
  const markup = tela.slice(tela.indexOf('return `'));
  /* NENHUMA FOLHA CRUA. A v3 interpolava ${a.titulo} direto, e o título carrega o nome do
     negócio vindo do CRM: um restaurante chamado com <img onerror=...> executaria. */
  const cruas = (markup.match(/\$\{[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?\}/g) || []);
  conferir('todo valor de folha passa por esc()',
    cruas.length === 0,
    'folha crua no markup: ' + cruas.slice(0, 6).join(' ') + ' — nome do CRM viraria código');
  conferir('e o markup de fato chama esc',
    (markup.match(/\$\{esc\(/g) || []).length >= 90,
    'são ' + (markup.match(/\$\{esc\(/g) || []).length + ' — se caiu, a conversão perdeu folhas');
}());

/* ── 15. O CONTRATO FECHADO DO MARKUP ───────────────────────────────────────────── */
(function () {
  const tela = corpoDe('sm4TelaHTML');
  const decl = tela.slice(tela.indexOf('const {'), tela.indexOf('} = d;'));
  const declara = [...new Set((decl.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []).filter(function (n) { return n !== 'const'; }))];
  const corpo = tela.slice(tela.indexOf('return `'));
  const naoUsados = declara.filter(function (n) { return n !== 'd' && corpo.indexOf(n) < 0; });
  const semProvedor = declara.filter(function (n) { return n !== 'd' && provedor.indexOf(n) < 0; });
  conferir('todo nome declarado é usado pelo markup',
    naoUsados.length === 0,
    'nome declarado e nunca usado: ' + naoUsados.join(', '));
  conferir('todo nome do markup é entregue pelo provedor',
    semProvedor.length === 0,
    'o markup leria undefined em: ' + semProvedor.join(', '));
  conferir('o contrato tem os 43 nomes da prancha v4',
    declara.length >= 43,
    'são ' + declara.length + ' — se caiu, algum bloco da prancha deixou de receber dado');
}());

/* ── 16. O QUE SAIU DA PRANCHA, SAIU ────────────────────────────────────────────── */
/* ESTES MEDEM O MARKUP EMBARCADO, e não o arquivo inteiro: os MEUS comentários citam os
   textos removidos como exemplo do que saiu, e guarda que lê o próprio comentário
   reprova o trabalho certo. */
(function () {
  const tela = corpoDe('sm4TelaHTML');
  const markup = tela.slice(tela.indexOf('return `'));

  conferir('a moldura do mockup não embarcou',
    markup.indexOf('Tudo dentro do cockpit') < 0 &&
    markup.indexOf('Afirmou? Prova.') < 0 &&
    markup.indexOf('Nenhum clique morto</p>') < 0,
    'o aside escuro de 340px explica o desenho para quem implementa, não para o gestor');

  conferir('os placeholders da prancha viraram dado',
    markup.indexOf('ter, 08 de setembro · semana 37 · dia 2 de 5') < 0 &&
    markup.indexOf('sincronizados há 12 min') < 0 &&
    markup.indexOf('Precisam de você (4)') < 0 &&
    markup.indexOf('Caminhando sozinhos (4)') < 0 &&
    markup.indexOf('Reconheça a <b>Kelly</b>') < 0 &&
    markup.indexOf('2 fechados de 7') < 0,
    'data, contagem e nome cravados mostrariam terça numa quarta e 4 pessoas num time de 11');

  conferir('o veredito não está cravado',
    markup.indexOf('>em risco<') < 0 && markup.indexOf('<b style="color:#FFFDF8;">3 de 7</b>') < 0,
    '"A semana está em risco" fixo é a maquete declarando risco todo dia, inclusive na ganha');

  conferir('a barra de pace lê os dois percentuais',
    markup.indexOf('${esc(feitoPct)}%') > -1 && markup.indexOf('${esc(esperadoPct)}%') > -1 &&
    markup.indexOf('width:29%') < 0 && markup.indexOf('left:40%') < 0,
    'a prancha cravou 29% e 40%: a barra ficaria parada no dia 2 de 5 para sempre');

  conferir('a largura fixa de canvas não embarcou',
    markup.indexOf('width:1380px;flex:none;') < 0,
    'duas larguras fixas aninhadas é barra de rolagem lateral em monitor menor');
}());

/* ── 17. OS BREAKPOINTS ESTÃO NA ESCALA DO PROJETO ─────────────────────────────── */
conferir('as duas grades empilham em corte da escala',
  /@media \(max-width: 1240px\)\{[\s\S]{0,200}1\.25fr/.test(tpl) &&
  /@media \(max-width: 1050px\)\{[\s\S]{0,220}repeat\(3,minmax\(0,1fr\)\)/.test(tpl),
  'a escala é 420·640·760·900·1050·1240, e a guarda 7 do build reprova valor fora dela');

conferir('a regra de empilhar tem alvo no markup',
  tpl.indexOf('grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)') > -1 &&
  tpl.indexOf('grid-template-columns:repeat(3,minmax(0,1fr))') > -1,
  'presença da regra no CSS não prova que ela casa: seletor sem alvo é regra que nunca aplica');

/* ── 18. A TELA É INSTANTÂNEA ───────────────────────────────────────────────────── */
conferir('a Semana repinta quando um negócio muda e quando o farol chega',
  /viewResumo: 'renderSemana'/.test(tpl),
  'ela mostra negócio nomeado nas jogadas e conta régua nas provas; fora do mapa, fica com o número velho');

conferir('a aba não espera três idas ao Supabase em fila',
  /Promise\.allSettled\(\[/.test(corpoDe('sm9Iniciar')) &&
  !/Promise\.all\(\[/.test(corpoDe('sm9Iniciar')),
  'promessas, pauta e combinados são independentes, e uma que falhe não pode levar as outras duas');

conferir('depois de gravar, relê o banco',
  (exec.match(/await tl5CarregarPauta\(\);/g) || []).length >= 4,
  'reler é o que faz o rodapé mostrar o que ESTÁ no banco, e não o que eu acho que gravei');

/* ── 19. A BARRA INVERTIDA NÃO MORREU DE NOVO ──────────────────────────────────── */
/* Aconteceu NESTA entrega: escrevi /^\d{4}-/ e chegou /^d{4}-/ — válida, sempre falsa.
   Esta checagem varre a família sm4 por regex que perdeu a barra. */
(function () {
  let bloco = tpl.slice(tpl.indexOf('const SM4_ESTADO'), tpl.indexOf('function sm9Segunda'));
  /* OS COMENTÁRIOS SAEM ANTES DA VARREDURA. A primeira versão reprovou porque o meu
     próprio comentário CITA /^d{4}-/ como exemplo do defeito que ele documenta — guarda
     que lê o próprio comentário reprova o trabalho certo, e a suite da v3 já tinha
     tropeçado nisso em três checagens. */
  bloco = bloco.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const suspeitas = (bloco.match(/\/\^?[a-z]\{\d\}/g) || []);
  conferir('nenhuma regex da v4 perdeu a barra invertida',
    suspeitas.length === 0,
    'regex sem escape: ' + suspeitas.join(' ') + ' — válida, errada, e nenhuma guarda pega');
}());

/* ── RESULTADO ─────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(function (l) { console.error(l); });
  process.exit(1);
}
console.log('semana v4: ' + ok + ' checagens ok — as 3 perguntas, nenhum clique morto, '
  + 'toda afirmação com prova que abre dentro do cockpit, e nada promete número que não existe.');
