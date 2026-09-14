/* ══════════════════════════════════════════════════════════════════════════════════════
   A DAILY DO GESTOR LÊ A GRADE DA SEMANA (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan, urgente: "eles prometeram a daily e nao apareceu para o gestor... todos com
   planejamento feito e gestor sem nada na aba, como eu mostro isso pra geral?".

   ══ O QUE EU MEDI NO BANCO, NA QUARTA 09/09 ═════════════════════════════════════════
   Índice 2 da grade (segunda = 0):

     Bruno 7 · Marco 7 · Kelly 6 · Wericles 6 · Sandro 5 · Renata 4 · André 3
     = 38 visitas planejadas para hoje, por sete pessoas.

   E a Daily do gestor mostrava ZERO. NÃO era bug de leitura nem RLS: são DUAS TABELAS.

     · a tela do executivo grava a grade 5×7 em `planos_semanais.grade` — sete pessoas
       mexeram nela hoje, entre 11:23 e 12:14;
     · a Daily do gestor lia SÓ `planos_diarios` (2 linhas hoje) e `dailies.prometido_*`
       (UMA pessoa preenchida; as onze linhas de dailies foram criadas pelo robô, com
       `criado_por: sistema-fetch-hubspot`, que escreve o realizado e não a promessa).

   A tela estava tecnicamente certa e praticamente inútil: a informação existia na tabela
   ao lado e ela não olhava. É a mesma família do defeito de [[cache-de-sessao-mente-na-outra-aba]]
   — o dado está no banco e a tela que devia mostrá-lo lê outro lugar.

   ══ E O QUE ESTA SUITE NÃO DEIXA ACONTECER ══════════════════════════════════════════
   O conserto tem um risco próprio: passar a chamar "promessa" o que é só grade. Planejar
   na grade da semana e travar o plano do dia são gestos DIFERENTES, e uma tela que diz
   "TRAVADA" sobre quem só encaixou contas é pior que a tela vazia de antes, porque
   afirma um gesto que ninguém fez.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const codigo = tpl.replace(/\/\*[\s\S]*?\*\//g, ' ');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}
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

/* ── 1 · A LEITURA EXISTE, E ACOMPANHA A DOS PLANOS DO DIA ────────────────────────── */
conferir('a Daily do gestor lê planos_semanais',
  /from\('planos_semanais'\)[\s\S]{0,200}\.eq\('data_segunda', segundaDoFoco\)/.test(codigo),
  'sem esta consulta a aba abre vazia com o time todo planejado — foi o que aconteceu em 09/09');

conferir('e a falha de leitura NÃO vira "ninguém planejou"',
  /gradeLida = false/.test(codigo) && /let gradePorOwner = \{\}, gradeLida = true/.test(codigo),
  'erro de RLS ou rede virando time parado é acusação contra sete pessoas produzida por consulta quebrada');

conferir('a grade viaja no contexto, junto do dia em foco',
  /grades: gradePorOwner, gradeLida: gradeLida, diaEmFoco: dailyRefDate/.test(codigo),
  'sem o dia em foco a função não sabe qual coluna da grade ler, e o gestor caminha pelos dias na reunião');

/* ── 2 · A COLUNA CERTA DA GRADE ─────────────────────────────────────────────────────
   O índice sai da diferença entre o dia em foco e a segunda daquela linha — a mesma
   conta que a grade usa para se desenhar. Eu ERREI o dia da semana na primeira
   investigação (chamei quarta de terça) e li "Kelly tem 0 hoje" quando ela tem 6; o
   índice não pode depender da minha aritmética de cabeça. */
const daGrade = corpoDe('dg4SlotsDaGrade');
conferir('o índice do dia sai da data, não de uma tabela minha',
  /const dif = Math\.round\(\(new Date\(diaISO \+ 'T12:00:00'\) - new Date\(seg \+ 'T12:00:00'\)\) \/ 86400000\)/.test(daGrade),
  'contar dia de semana à mão foi como eu li 0 visitas para quem tinha 6');

conferir('dia fora da grade (sábado, domingo) devolve vazio em vez de estourar',
  /if \(!\(dif >= 0 && dif < g\.length\)\) return vazio;/.test(daGrade),
  'a grade é seg→sex; índice 5 num array de 5 é undefined e derruba o laço');

conferir('as constantes de slot são as do produto, não uma segunda cópia',
  /typeof PL6_RUA !== 'undefined'\) \? PL6_RUA : '__rua'/.test(daGrade) &&
  /typeof PL6_BLOQUEADO !== 'undefined'\) \? PL6_BLOQUEADO : '__b'/.test(daGrade),
  'bloqueio e volta de rua têm sentinela própria; recopiar o valor é a mesma regra em dois lugares');

conferir('bloqueio não conta como visita planejada',
  /if \(!cru \|\| cru === BLOQ\) return;/.test(daGrade),
  'slot bloqueado é hora indisponível, não conta a visitar — contá-lo infla a promessa do time');

conferir('volta de rua conta, e aparece dita como rua',
  /nome: 'volta de rua'/.test(daGrade) && /origem: 'rua'/.test(daGrade),
  'rua é trabalho de campo planejado; sumir com ela é subestimar o dia dele');

/* REESCRITA EM 14/09/26: a checagem exigia o ternario numa linha so
   (`nome: doFunil ? doFunil.nome :`). A cadeia virou de TRES fontes quando a conta nova
   ganhou nome de verdade — funil, depois leads_prospeccao, e so entao o rotulo
   generico. A intencao nao era a forma da linha: e que a ULTIMA saida seja um rotulo
   honesto e nunca um nome fabricado. */
conferir('conta sem negócio no funil entra sem nome inventado',
  /nome: doFunil \? doFunil\.nome/.test(daGrade) &&
  /: daProspeccao && daProspeccao\.nome \? daProspeccao\.nome/.test(daGrade) &&
  /: \(ehNova \? 'conta nova da prospecção' : String\(cru\)\)/.test(daGrade),
  'o negócio pode não estar no snapshot; batizar o slot com um nome qualquer é pior que dizer o que se sabe');

/* ── 3 · O PLANO DO DIA TEM PRECEDÊNCIA ─────────────────────────────────────────────── */
const dados = corpoDe('dg4Dados');
conferir('quem tem plano do dia continua sendo lido de lá',
  /const daGrade = temDoPlano\s*\n?\s*\?/.test(dados) && /: dg4SlotsDaGrade\(/.test(dados),
  'o plano do dia é mais recente e mais específico que a grade da semana; a grade é o piso, não o teto');

conferir('e a grade só é consultada quando o plano do dia está vazio',
  /const temDoPlano = doPlano\.horas\.some/.test(dados),
  'ler as duas e somar contaria a mesma visita duas vezes');

/* ── 4 · PLANEJOU NÃO É PROMETEU ─────────────────────────────────────────────────────
   O risco do próprio conserto. A tela tem que distinguir os dois gestos. */
conferir('a bandeira de procedência viaja na linha da pessoa',
  /veioDaGrade: veioDaGrade/.test(codigo) && /const veioDaGrade = !temDoPlano && preenchidos\.length > 0/.test(codigo),
  'sem ela a tela não consegue dizer qual dos dois gestos aconteceu');

conferir('o cartão diz PLANEJOU NA GRADE, e não PROMESSA ABERTA',
  /x\.veioDaGrade \? 'PLANEJOU NA GRADE' : 'PROMESSA ABERTA'/.test(codigo),
  'dizer "promessa" sobre quem só encaixou contas na grade é a tela afirmando um gesto que ninguém fez');

/* O BOTÃO DE COBRAR SAIU EM 10/09/26 (prancha daily-gestor-final, regra 6: "a cobrança
   acontece NA rodada, olho no olho"). A EXIGÊNCIA NÃO SAIU: a tela continua tendo de
   pedir o gesto certo a cada um, e agora quem diz isso é a LEITURA do cartão. A guarda
   foi reancorada, não afrouxada — se alguém apagar a distinção, ela reprova de novo. */
conferir('e a leitura pede a coisa certa',
  /\? ', e isso é a grade da semana, não a promessa do dia — pedir para travar o dia é o gesto'/.test(codigo)
    && /: ', e a promessa ainda está aberta — cobrar a trava é o gesto'/.test(codigo),
  'pedir "a trava" a quem só encaixou contas na grade manda o gestor cobrar o passo errado');

conferir('o KPI de planos montados diz quantos vieram pela grade',
  /naGrade\.length \? ' \(' \+ naGrade\.length \+ ' pela grade\)' : ''/.test(codigo) &&
  /const naGrade = medidos\.filter\(function \(x\) \{ return x\.veioDaGrade; \}\)/.test(codigo),
  '"7/7 planos montados" esconderia que seis deles nunca travaram o dia');

/* PRECISO, e não por proximidade: a primeira versão desta checagem procurava
   `prometido_visitas` a até 200 caracteres de `veioDaGrade` e reprovou porque as duas
   coisas ficam perto NO ARQUIVO — a declaração de `naGrade` é seguida da soma das
   promessas. Janela de caracteres não mede acoplamento; ler a expressão, sim. */
/* A CONTAGEM DA GRADE MUDOU DE `preenchidos` PARA `visitas` (09/09/26), e a REGRA desta
   checagem não: as duas somas continuam separadas, e é isso que ela protege.
   O motivo da troca: `preenchidos` são as chaves de `porHora`, ou seja as visitas COM
   horário. Depois de "pode colocar 15 contas no dia uai" e de a hora passar a ser escolha
   do executivo, um dia com onze visitas e três horas marcadas somava três — o número do
   topo deixou de descrever o dia. `visitas` é a lista inteira, com hora e sem. */
conferir('a promessa em número vem de dailies, e o planejado é uma conta separada',
  /const somaVisitas = medidos\.reduce\(function \(t, x\) \{ return t \+ \(Number\(x\.daily\.prometido_visitas\) \|\| 0\); \}, 0\);/.test(codigo) &&
  /const somaPlanejadas = medidos\.reduce\(function \(t, x\) \{ return t \+ x\.visitas\.length; \}, 0\);/.test(codigo),
  'somar slot da grade dentro de "visitas prometidas" inventaria promessa que ninguém deu');

/* ══ A VISITA SEM HORA EXISTE, E APARECE ═════════════════════════════════════════════
   Julyan: "pode colocar 15 contas no dia uai, não so 7!" + "conserte a daily do gestor
   junto, tudo na mesma sincronia".

   São 15 vagas por dia e 7 janelas de horário. Logo um dia pode ter oito visitas SEM
   hora — e antes desta rodada elas: (1) eram descartadas por `if (!hora) return`, (2)
   depois, na minha primeira tentativa, colidiam todas na chave vazia de `porHora` e só a
   última sobrava, e (3) mesmo contadas, não eram DESENHADAS, porque o laço da tela
   iterava as sete horas. Três formas de a mesma visita não existir. */
conferir('a visita sem hora vai para semHora, que é lista',
  /const semHora = \[\];/.test(codigo) &&
  /if \(!hora \|\| porHora\[hora\]\) semHora\.push\(item\);/.test(codigo) &&
  /return \{ horas: horasNoDia, porHora: porHora, semHora: semHora, daGrade: true/.test(codigo),
  'com 8 visitas sem hora, um objeto indexado por hora colide todas na chave vazia — '
  + '"some" viraria "some, menos uma"');

/* ══ O EIXO E A HORA QUE ELE ESCOLHEU, NAO AS SETE JANELAS (14/09/26) ══════════════
   URGENTE do Julyan: "a galera esta prometendo no planejamento/daily, nao esta caindo
   para mim na minha daily aqui de gestor".

   As duas funcoes indexam por `porHora[hora]` com a hora DIGITADA pelo executivo e
   devolviam como eixo as SETE JANELAS de PL6_HORAS. Todo consumidor faz
   `horas.filter(h => porHora[h])` — entao so sobrevivia o compromisso que caisse
   exatamente em 09:00, 10:30, 13:30, 15:00, 16:30, 18:00 ou 19:00.

   MEDIDO no banco em 14/09, rodando dg4Dados() contra o dado real do dia:
     Marco (5 slots: 14:00, 15:00, 10:00, 11:30, 15:30) -> a tela lia 1
     Andre (3 slots: 10:00, 14:00, 16:00)               -> a tela lia 0, "SEM PLANO"
   Depois do conserto: 5 e 3, e a soma planejada do time foi de 1 para 8.

   Quando a POSICAO na coluna era a janela isso nao podia acontecer. A hora virou livre
   e o eixo ficou para tras — e quanto mais o time usava a hora real, mais o gestor via
   o time parado. E um defeito que PIORA com o uso correto do produto. */
conferir('o eixo das horas sai do que existe no dia, e nao das sete janelas fixas',
  /const horasNoDia = Object\.keys\(porHora\)\.sort\(\);/.test(codigo) &&
  /* declarar nao e usar: a sabotagem que trocou so o retorno passou por esta guarda e
     foi pega por outra. Guarda que aceita a declaracao mede a intencao pela metade. */
  /return \{ horas: horasNoDia, porHora: porHora/.test(codigo) &&
  /return \{ horas: Object\.keys\(porHora\)\.sort\(\), porHora: porHora, semHora: semHora \};/.test(codigo),
  'indexar por hora livre e devolver as sete janelas descarta em silêncio toda visita '
  + 'fora delas — o gestor vê o time parado quanto mais o time usa a hora de verdade');

conferir('e o dia sem nada tem eixo vazio, não sete janelas em branco',
  /const vazio = \{ horas: \[\], porHora: \{\}, semHora: \[\], daGrade: false, planejados: 0 \};/.test(codigo),
  'sete janelas vazias dão o mesmo zero por outro caminho');

/* ══ O SLOT E A PROMESSA (14/09/26) ═══════════════════════════════════════════════
   Julyan, no mesmo pedido: "eles nem precisam travar daily, so de colocar no slot, ja
   tem q aparecer pra mim". O chip de visitas saia so de `dailies.prometido_visitas`,
   escrito no ato de TRAVAR — entao o cartao listava cinco visitas e o chip do lado
   dizia "0 visitas": duas afirmacoes opostas sobre a mesma pessoa no mesmo cartao.

   `!= null` e nao `||`: quem travou prometendo ZERO disse alguma coisa, e a grade nao
   pode sobrescrever isso. E "na mesa" NAO cai na grade — a grade nao carrega proposta,
   entao sem promessa travada ele e "—" e nao 0. */
conferir('sem promessa travada, o chip de visitas conta o slot da grade',
  /const travouNumero = x\.daily\.prometido_visitas != null;/.test(codigo) &&
  /const visitas = travouNumero \? \(Number\(x\.daily\.prometido_visitas\) \|\| 0\) : \(x\.visitas \|\| \[\]\)\.length;/.test(codigo),
  'listar cinco visitas e escrever "0 visitas" ao lado é a tela discordando de si mesma');

conferir('e "na mesa" sem promessa é não medido, não zero',
  /: \{ n: '—', rot: 'na mesa · não prometeu'/.test(codigo),
  'zero ali lê como "ele disse que não vai propor nada" quando ninguém perguntou');

/* ══ A CONTA NOVA TEM NOME (14/09/26) ══════════════════════════════════════════════
   A grade guarda `c-<dealId>` para negocio do HubSpot e `n-<uuid>` para conta da
   prospeccao. O primeiro a Daily resolvia pelo funil; o segundo nao tinha fonte
   nenhuma e virava o rotulo generico "conta nova da prospecção".

   MEDIDO na foto que o Julyan mandou: o cartao do Andre com TRES linhas assim — o dia
   inteiro dele sem um nome para cobrar. Os nomes estavam no banco o tempo todo:
   SABOR MINEIRO, Sushi Delicia, Nhac Lanches. E quem abre praca planeja SO conta nova,
   entao o defeito atingia exatamente quem mais precisa aparecer na rodada.

   O rotulo generico continua existindo para quando a leitura falhar: dizer "conta nova
   da prospecção" e honesto, inventar um nome nao seria. */
conferir('o slot de conta nova mostra o nome, e não um rótulo genérico',
  /const daProspeccao = ehNova \? \(\(novasPorId \|\| \{\}\)\[String\(cru\)\.slice\(2\)\] \|\| null\) : null;/.test(codigo) &&
  /: daProspeccao && daProspeccao\.nome \? daProspeccao\.nome/.test(codigo) &&
  /function dg4SlotsDaGrade\(linhaSemana, diaISO, mapaFunil, novasPorId\)/.test(codigo),
  'quem planeja só conta nova aparecia para o gestor sem um único nome para cobrar');

conferir('e os nomes são buscados só para os ids que estão na grade do dia',
  /if \(typeof cru === "string" && cru\.indexOf\("n-"\) === 0\) idsNovas\.push\(cru\.slice\(2\)\);/.test(codigo) &&
  /\.select\('id,nome,bairro'\)\.in\('id', \[\.\.\.new Set\(idsNovas\)\]\)/.test(codigo),
  'leads_prospeccao tem milhares de linhas — trazer todas para nomear meia dúzia seria a '
  + 'consulta mais cara da tela');

conferir('e a tela do gestor desenha as visitas, não as sete horas',
  /const visitas = preenchidos\.map\(function \(h\) \{ return grade\.porHora\[h\]; \}\)\s*\n?\s*\.concat\(grade\.semHora \|\| \[\]\);/.test(codigo) &&
  /const slots = x\.visitas\.map\(function \(sl\) \{/.test(codigo),
  'o laço iterava grade.horas: sete linhas fixas para um dia de quinze, e as sem hora em '
  + 'nenhuma delas');

/* ══ DEPOIS DA HORA, NADA ABORTA A VISITA ══════════════════════════════════════════
   Esta guarda nasceu de uma sabotagem que PASSOU: eu recoloquei `if (!hora) return;` no
   laço da grade — o defeito original de hoje, o que fazia a visita sem horário sumir da
   tela do gestor — e as quatro checagens acima ficaram verdes. Elas medem o balde
   (existe, é lista, é devolvido) e o laço da tela (itera visitas); nenhuma media se a
   visita CHEGA ao balde.

   O `return {` da IIFE que monta o item é legítimo, e é por isso que a busca é por
   `return;` com ponto e vírgula: no trecho que vai da hora ao `planejados += 1`, um
   return seco é a única forma de a visita não entrar em nenhuma das duas saídas. */
const laco = codigo.slice(codigo.indexOf('coluna.forEach(function (v, si)'));
const depoisDaHora = laco.slice(laco.indexOf('const hora ='), laco.indexOf('planejados += 1;'));
conferir('depois de a hora ser calculada, nada aborta a visita',
  laco.indexOf('coluna.forEach') === 0
    && depoisDaHora.length > 40
    && depoisDaHora.indexOf('return;') === -1,
  'um return seco entre a hora e a contagem descarta a visita sem horário — o defeito de 09/09 que sumiu com as 8 últimas do dia na tela do gestor');

conferir('a hora ausente é rótulo honesto, não relógio inventado',
  /h: sl\.hora \|\| 'sem hora',/.test(codigo),
  'ele planejou a visita e não marcou a hora — escrever um relógio ali inventa o horário '
  + 'que ele não deu');

/* ESTE NÚMERO IA ENGANAR ELE, e só apareceu quando eu fui conferir a checagem acima.
   Medido em 09/09: promessa 2, planejado 38. Sozinho, o "2" faz o gestor abrir a reunião
   achando que o time vai fazer duas visitas no dia. */
/* OS DOIS NÚMEROS SAÍRAM DA FAIXA DE KPIs em 10/09/26 — a prancha FINAL tem cinco KPIs e
   dois deles são novos (a palavra de ontem e as cobranças do dia). Eles NÃO saíram da
   tela: desceram para a faixa da rodada, cada um com o nome do seu gesto. A guarda confere
   os DOIS lados — o provedor entrega e o markup escreve —, porque contrato com o número e
   markup sem ele é exatamente como um dado desaparece em silêncio. */
conferir('e a tela mostra os dois, com o nome do gesto de cada um',
  /somaVisitas: String\(somaVisitas\),/.test(codigo) &&
  /somaPlanejadas: String\(somaPlanejadas\),/.test(codigo) &&
  /\$\{somaVisitas\} visitas prometidas/.test(codigo) &&
  /\$\{somaPlanejadas\} planejadas na grade/.test(codigo),
  'promessa 2 com 38 planejadas, sem dizer as duas, é o número certo levando à conclusão errada');

/* ── 5 · NADA É ESCRITO ─────────────────────────────────────────────────────────────── */
conferir('esta leitura não grava em planos_semanais',
  !/from\('planos_semanais'\)[\s\S]{0,160}\.(insert|update|upsert|delete)\(/.test(
    codigo.slice(codigo.indexOf('segundaDoFoco') - 400, codigo.indexOf('segundaDoFoco') + 900)),
  'a Daily do gestor é espelho; escrever no plano de alguém a partir dela é mexer no trabalho dele sem ele saber');

/* ══ O CONTRATO DE dg4TelaHTML É FECHADO ══════════════════════════════════════════
   Em 09/09 a Daily do gestor ficou INTEIRA em "Carregando...": `avisoForaDoCampo` era
   calculado em dg4Dados e lido dentro do markup de dg4TelaHTML. Duas funções — o nome
   não existia no escopo de quem escrevia o HTML, e o ReferenceError levou a aba toda.

   Build e 37 suítes passaram: nenhuma executa dg4TelaHTML, e a guarda de ordem de
   declaração vigia uso-antes-de-declarar DENTRO de uma função, que é outra pergunta.
   Quem pegou foi abrir a tela. Esta guarda existe para a próxima vez não depender disso.

   COMO ELA MEDE: todo `${nome}` do corpo de dg4TelaHTML que seja um identificador nu
   (sem ponto) tem de ser um nome que EXISTE ali — declarado dentro da função, parâmetro
   dela, ou global conhecido do template. Qualquer outro só pode chegar por `d.`.
   Ela não julga o valor; julga a existência, que é exatamente o que estourou. */
const telaDg4 = corpoDe('dg4TelaHTML');
const semComentario = telaDg4.replace(/\/\*[\s\S]*?\*\//g, ' ');
const declaradosDg4 = new Set(['d', 'esc', 'DATA', 'PL6_SLOTS', 'PL6_HORAS', 'Math', 'String',
  'Number', 'Object', 'Array', 'JSON', 'Date', 'Boolean', 'window', 'document']);
/* nomes que nascem dentro da função: const/let/var, parâmetros de callback, o for e
   — o que eu esqueci na primeira versão desta guarda — a DESESTRUTURAÇÃO do contrato,
   que é justamente como dg4TelaHTML recebe os quinze nomes que usa. Sem ela a guarda
   acusava quinze falsos e escondia o único verdadeiro. */
const reDestr = /(?:const|let|var)\s*\{([^}]*)\}\s*=/g;
let md;
while ((md = reDestr.exec(semComentario)) !== null) {
  md[1].split(',').forEach(function (a) {
    const nome = a.split(':').pop().trim().split(/[\s=]/)[0];
    if (/^[A-Za-z_$][\w$]*$/.test(nome)) declaradosDg4.add(nome);
  });
}
/* nomes que nascem dentro da função: const/let/var, parâmetros de callback e o for */
let m;
const reDecl = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)|function\s*\(([^)]*)\)|\(([^)]*)\)\s*=>|for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
while ((m = reDecl.exec(semComentario)) !== null) {
  [m[1], m[4]].forEach(function (nome) { if (nome) declaradosDg4.add(nome); });
  [m[2], m[3]].forEach(function (lista) {
    if (!lista) return;
    lista.split(',').forEach(function (a) {
      const nome = a.trim().split(/[\s=]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(nome)) declaradosDg4.add(nome);
    });
  });
}
const forasDoContrato = [];
const reUso = /\$\{\s*([A-Za-z_$][\w$]*)\s*([^\w$.(]|$)/g;
while ((m = reUso.exec(semComentario)) !== null) {
  if (!declaradosDg4.has(m[1]) && forasDoContrato.indexOf(m[1]) === -1) forasDoContrato.push(m[1]);
}
conferir('todo nome que o markup do gestor lê existe no escopo dele',
  telaDg4.length > 2000 && forasDoContrato.length === 0,
  forasDoContrato.length
    ? ('dg4TelaHTML lê ' + forasDoContrato.join(', ') + ' sem receber pelo contrato — '
      + 'ReferenceError leva a aba inteira para "Carregando...", como avisoForaDoCampo em 09/09')
    : 'não consegui ler o corpo de dg4TelaHTML — sem corpo não há medição, e verde aqui seria falso');

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════════════════════════════
   A DAILY FINAL DO GESTOR (10/09/26, prancha daily-gestor-final-STANDALONE)
   ══════════════════════════════════════════════════════════════════════════════════════
   Regra zero do prompt: "NENHUM clique morto e NENHUM dado inventado". E a regra 2, que
   é a razão desta tela existir: "o placar de ontem compara SEMPRE promessa travada
   (Supabase) vs medido (HubSpot) — nunca auto-relato".

   O QUE ESTAS GUARDAS PROTEGEM, em uma frase cada:
     1. quem não prometeu não furou (o zero que ACUSA, irmão do zero que tranquiliza);
     2. SLA, cadência, toques e propostas saem das MESMAS funções da Time e da Pessoas;
     3. a ordem da rodada é lei e os grupos saem do mesmo peso que ordenou a fila;
     4. chip ruim é clicável e persiste; chip bom e chip não medido não são clicáveis;
     5. nenhuma tabela nova: sinal e pergunta vão para registros_rodada;
     6. o que a prancha pede e o CRM não tem aparece com o nome do que existe.

   O QUE A PRANCHA PEDE E NÃO EXISTE, e por isso a tela diz outra coisa:
     vence HOJE ......... não há propriedade de validade de proposta no portal -> o sinal
                          é "proposta sem data", a MESMA regra da Time e da Pessoas
     daily_pauta ........ tabela inexistente -> registros_rodada, que a Semana e o Time leem
     daily_combinados ... tabela inexistente -> pdi_compromissos, a linha que ele marca */
(function () {
  /* O BLOCO DA DAILY DO GESTOR, FATIADO. `cbRot` e os verbos cobrar/reconhecer existem
     de propósito na aba Time e na Semana; medir o arquivo inteiro reprovaria código
     correto de outras telas — e foi o que a primeira versão destas guardas fez. */
  const iDg = codigo.indexOf('const DG4_ESTADO');
  const fDg = codigo.indexOf('let DG4_RELOGIO');
  if (iDg < 0 || fDg <= iDg) {
    falhas.push('as guardas da Daily FINAL não acharam o bloco dg4 — âncora perdida, e uma guarda sem âncora mede o arquivo errado em silêncio');
    return;
  }
  const tela = codigo.slice(iDg, fDg);

  /* ── 1 · QUEM NÃO PROMETEU NÃO FUROU ───────────────────────────────────────────────
     Medido em 10/09/26 para ontem: 2 dos 10 tinham promessa registrada. Com `furou`
     calculado em cima de um null virando 0, oito pessoas apareceriam devendo a palavra na
     frente do time por causa de um campo vazio. */
  conferir('a palavra de ontem só acusa quem prometeu',
    /const medido = p != null && f != null;/.test(tela)
      && /furou: medido \? f < p : false/.test(tela)
      && tela.indexOf('sem promessa registrada') > -1,
    'furo calculado sobre promessa ausente é acusação produzida por campo vazio');
  conferir('e a soma do placar só conta quem prometeu',
    /const comPromessa = medidos\.filter\(function \(x\) \{ return x\.ontem\.medido; \}\);/.test(tela)
      && /const promOntem = comPromessa\.reduce/.test(tela)
      && /const feitOntem = comPromessa\.reduce/.test(tela)
      && tela.indexOf('sem promessa registrada (não é furo)') > -1,
    'somar o feito de quem não prometeu infla um lado do placar e inventa dívida no outro');

  /* ── 2 · OS DOIS LADOS DO PLACAR VÊM DE FONTES DIFERENTES (regra 2) ──────────────── */
  conferir('o prometido sai do Supabase e o feito sai do HubSpot',
    /function dg4Ontem\(ownerId, ontemISO\)[\s\S]{0,700}?getDaily\(ownerId, ontemISO\)/.test(tela)
      && /atividadesComprovadasNoDia\(ownerId, ontemISO\)/.test(tela),
    'os dois lados vindos da mesma fonte transformam o placar em auto-relato');

  /* ── 3 · NADA É MEDIDO DE NOVO AQUI (regra 1 do prompt) ─────────────────────────── */
  conferir('SLA, cadência, toques e propostas saem das funções da Time e da Pessoas',
    /const pessoas = \(typeof pe4Pessoas === .function.\) \? pe4Pessoas\(\) : \[\];/.test(tela.replace(/'/g, '.'))
      && /pessoa\.slaEstourados > 0/.test(tela)
      && /tm2CadenciaDe\(ownerId\)/.test(tela)
      && /pe4Propostas\(pessoa\)/.test(tela)
      && !/function dg4Sla|function dg4Toques/.test(tela),
    'uma segunda contagem aqui daria dois números iguais por coincidência — e um dia divergiriam');
  conferir('e a cadência procura o DIA na série, não a penúltima posição',
    /const i = cd\.dias\.indexOf\(diaISO\);/.test(tela)
      && /if \(i < 0\) return null;/.test(tela),
    'a série pula fim de semana e feriado: a posição -2 seria o dia certo por acaso');

  /* ── 4 · A ORDEM DA RODADA É LEI, E OS GRUPOS SAEM DELA ─────────────────────────── */
  conferir('a ordem é sem plano → furou ontem → aberta → travada ✓',
    /if \(!x\.temPlano\) return 0;[\s\S]{0,200}?if \(x\.travada && x\.ontem\.furou\) return 1;[\s\S]{0,120}?if \(!x\.travada\) return 2;[\s\S]{0,60}?return 3;/.test(tela)
      && tela.indexOf('sem plano → furou ontem → promessa aberta → travadas ✓') > -1,
    'a ordem da rodada decide quem fala primeiro — é a regra 1 da prancha');
  conferir('e os quatro grupos saem do MESMO peso que ordenou a fila',
    /return peso\(x\) === 0;/.test(tela) && /return peso\(x\) === 1;/.test(tela)
      && /return peso\(x\) === 2;/.test(tela)
      && /const pz = peso\(x\);/.test(tela),
    'filtros próprios por grupo é como a ordem e a contagem passam a discordar — e quem fecha plano vazio aparece duas vezes');

  /* ── 5 · CHIP RUIM É CLICÁVEL E PERSISTE; CHIP BOM NÃO É CLICÁVEL ───────────────── */
  conferir('o chip de sinal ruim grava, e o bom não é clicável',
    /* O RAMO DO CHIP BOM TEM DE ENTREGAR VERBO VAZIO, e não só cursor de seta: um chip
       informativo com verbo é um clique que grava escondido atrás da aparência certa. */
    /if \(!sn\.ruim\) \{[\s\S]{0,400}?on: ..,[\s\S]{0,400}?cursor: .default.[\s\S]{0,40}?\}/.test(tela.replace(/'/g, '.'))
      && /on: tv \? .. : \(.sinal:. \+ oid \+ .:. \+ sn\.tipo\)/.test(tela.replace(/'/g, '.'))
      && /cursor: tv \? .default. : .pointer./.test(tela.replace(/'/g, '.')),
    'chip informativo com verbo é clique que grava numa tela projetada na parede');
  conferir('e o estado do chip vem do banco, não da sessão',
    /const naPauta = dg4Feito\(.sinal., oid, sn\.tipo\);/.test(tela.replace(/'/g, '.'))
      && /sn\.ruim && dg4Feito\(.sinal., x\.oid, sn\.tipo\)/.test(tela.replace(/'/g, '.')),
    'recarregar a página no meio da reunião não pode zerar a pauta da rodada');

  /* ── 6 · A GUARDA PRESA A UM NOME MORTO (o defeito que estava em produção) ───────── */
  conferir('nenhum leitor da pauta está protegido por um nome que não existe',
    codigo.indexOf('dg2Feito') === -1,
    'os cinco leitores da pauta estavam atrás de typeof dg2Feito, que saiu em 08/09: o gestor clicava, gravava, e o repinte devolvia o botão ao estado inicial com o contador em 0');

  /* ── 7 · NENHUMA TABELA NOVA, NENHUM ESCRITOR NOVO ──────────────────────────────── */
  conferir('o sinal e a pergunta gravam em registros_rodada',
    /g14Registrar\(.sinal., oid, tipo, chip\)/.test(tela.replace(/'/g, '.'))
      && /g14Registrar\(.alinhar., oid, cliente\)/.test(tela.replace(/'/g, '.'))
      && tela.indexOf('daily_pauta') === -1
      && tela.indexOf('daily_combinados') === -1,
    'tabela nova para a mesma pauta faz o sinal anotado aqui não existir na Semana nem no Time');
  conferir('e o combinado vem de pdi_compromissos pelo leitor da Pessoas',
    /ps6Carregar\(\)\.catch/.test(codigo)
      && /PS6_ESTADO\.compromissos\[String\(ownerId\)\]/.test(tela),
    'ler a tabela do combinado com um segundo leitor faria o ✓ da Pessoas não aparecer aqui');

  /* ── 8 · O QUE A PRANCHA PEDE E O CRM NÃO TEM ───────────────────────────────────── */
  conferir('não existe "vence HOJE" inventado',
    tela.indexOf('vence HOJE') === -1
      && tela.indexOf('proposta sem data: ') > -1,
    'não há propriedade de validade de proposta no portal — o chip mostra o parente medível, com o nome certo');
  conferir('e o texto do combinado só aparece se for o texto que ele viu',
    /const mesma = !!versao && versao === String\(DATA\.versaoAnalise \|\| ..\);/.test(tela)
      && /texto: mesma \?/.test(tela)
      && tela.indexOf('sem marcação (') > -1,
    'parear o combinado de hoje com o que ele marcou em outra análise mostra ao gestor um texto que o executivo nunca viu');

  /* ── 9 · O BOTÃO DE COBRAR SAIU, E COM ELE OS DOIS VERBOS ───────────────────────── */
  conferir('não há botão de cobrar nem verbo de cobrança no cartão',
    tela.indexOf('cbRot') === -1 && tela.indexOf('mandar reconhecimento') === -1
      && !/verbo === .cobrar./.test(tela.replace(/'/g, '.'))
      && !/verbo === .reconhecer./.test(tela.replace(/'/g, '.')),
    'regra 6 da prancha: a cobrança acontece NA rodada, olho no olho, e o registro é o sinal anotado');

  /* ── 10 · O DETALHE GRAVADO É O TEXTO QUE ELE LEU ───────────────────────────────── */
  conferir('o detalhe do registro é o rótulo do chip, vindo do ouvinte',
    /dg4Executar\(acao, alvo\.textContent \|\| ..\);/.test(tela)
      && /async function dg4Executar\(acao, rotulo\)/.test(tela),
    'reconstruir o rótulo no handler custa a varredura do funil inteira por clique — e o registro tem de dizer o que foi cobrado');
}());

if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('daily do gestor lê a grade: ' + ok + ' checagens ok — o planejamento de sete pessoas'
  + ' aparece, e planejar continua diferente de prometer.');
