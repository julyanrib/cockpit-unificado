// scripts/testar-pl6-contas.js
//
// AS FUNÇÕES DO PLANEJAMENTO SÃO EXECUTADAS DE VERDADE, CONTRA UM DADO DE MENTIRA.
// ---------------------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE, com o defeito que o produziu (04/09/26): reescrevendo a
// região, substituí o trecho de pl6Reciclagem que declarava `porPonto` e deixei o uso
// dela vivo doze linhas abaixo, em `km: porPonto ? porPonto.km : null`. A aba inteira
// morria com «ReferenceError: porPonto is not defined» — e isso passou por
//
//     node scripts/build.js      → OK
//     node scripts/check-scripts.js → 19 guardas verdes
//     as 19 suítes                  → verdes
//
// porque NENHUMA delas executa uma linha do template. Guarda estática não vê variável
// local: para ela o arquivo continua com a sintaxe perfeita. Foi a terceira vez que eu
// derrubei uma aba assim (é a nota "remover bloco exige varrer os usos" na memória), e as
// duas primeiras só apareceram porque eu abri a tela no navegador.
//
// O QUE ELE FAZ: extrai as funções puras da cadeia de contas do Planejamento, injeta um
// DATA/prospeccaoCache mínimo e CHAMA cada uma. Qualquer identificador solto vira falha
// aqui, em dois segundos, sem navegador.
//
// Ele NÃO substitui olhar a tela — mede comportamento de função, não de pixel.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const tpl = fs.readFileSync(T, 'utf8');

let falhas = 0;
function checar(nome, cond, detalhe) {
  if (cond) { console.log('  ok  ' + nome); return; }
  falhas++;
  console.log('  FALHA  ' + nome + (detalhe ? '  — ' + detalhe : ''));
}

/* ── extrai uma função (ou const) pelo nome, do próprio template ─────────────────── */
function pegarFn(nome) {
  const re = new RegExp('\\nfunction ' + nome + '\\([\\s\\S]*?\\n\\}');
  const m = re.exec(tpl);
  if (!m) { console.error('não achei function ' + nome + ' — a âncora deste teste se perdeu.'); process.exit(1); }
  return m[0];
}
function pegarConst(nome) {
  const re = new RegExp('\\nconst ' + nome + ' = [\\s\\S]*?;\\n');
  const m = re.exec(tpl);
  if (!m) { console.error('não achei const ' + nome + '.'); process.exit(1); }
  return m[0];
}

/* `pl6ContarTerrLivre` SAIU DA CADEIA (09/09/26): ela não era chamada por ninguém no
   template — só por esta suíte, que exercitava código morto e, ao fazer isso, o mantinha
   com cara de vivo. Ela saiu com o redesenho da tela; a contagem de contas por território
   digitado quem faz é pl6Regioes, via pl6SemearTerrLivres, que continua na lista. */
const CADEIA = ['pl6ChaveBairro', 'pl6RotuloBairro', 'pl6ChaveTerrLivre', 'pl6SemearTerrLivres',
  'pl6FontesCruas',
  'pl6LeadNoTerrLivre', 'pl6ChaveDeLugar', 'pl6RotuloDoGrupo',
  'pl6Km', 'pl6RegiaoDoLead', 'pl6Regioes', 'pl6Carteira', 'pl6Reciclagem', 'pl6GrupoDaFonte',
  'pl6Novos', 'pl6TodasAsContas'];

// O TERRITORIO DIGITADO entrou na cadeia (prancha 6c): pl6Regioes chama pl6SemearTerrLivres
// e pl6RegiaoDoLead lê pl6TerrLivres. Sem estes dois aqui a suíte reprovaria a cadeia por
// falta de dependência — e o certo é ela EXECUTAR a cadeia nova, não ignorá-la.
const fonte = [
  pegarConst('PL6_TERR_PREFIXO'),
  /* AS ETAPAS QUE SAIRAM DO FUNIL (04/09/26). Medido na tela do Bruno: "UAU UNIDADE PENHA ·
     Perdido" aparecia na munição da semana com o conselho "sem próximo passo datado" — a tela
     mandando planejar visita a um negócio já perdido.
     O stub de FN2_ETAPAS vem ANTES da const porque ela o lê no momento da declaração; sem ele
     o `typeof` a deixaria vazia e o filtro não seria exercido — a suíte daria verde sobre um
     filtro que não filtra, que é o pior verde possível. */
  "const FN2_ETAPAS = [{ id: '1395880469', rot: 'PROSPECÇÃO' },"
    + " { id: '1396006164', rot: 'PERDIDO', saiu: true }];",
  pegarConst('PL6_ETAPAS_QUE_SAIRAM'),
  /* "ESTÁ NA CARTEIRA DELE" PASSOU A TER UMA DEFINIÇÃO SÓ (09/09/26). Antes, `pl6Novos`
     repetia à mão os dois status resolvidos e as leituras de rota usavam uma lista de
     PERMITIDOS que esquecia `pendente` — MEDIDO: 553 leads com dono e status `pendente`,
     invisíveis para os donos deles.
     A FUNÇÃO REAL entra no escopo, e não um stub: stub daria verde sobre a definição que
     eu quero justamente exercer. */
  pegarConst('PROSPECCAO_RESOLVIDOS'),
  pegarFn('prospeccaoNaCarteira'),
  'let pl6TerrLivres = [];',
  // pl6SemearTerrLivres lê o plano da semana; no cenário não há plano, e o `typeof` dela
  // já cobre isso. O stub existe para a chamada não estourar por identificador ausente.
  'function pl6RegioesDoPlano() { return []; }'
].concat(CADEIA.map(pegarFn)).join('\n');

/* ── o dado de mentira: um de cada caso que a cascata de lugar precisa cobrir ────── */
const CENARIO = `
  const STAGE_LABELS = { '1395880469': 'Prospecção', '1398311191': 'Reciclagem' };
  const DATA = {
    reps: [{ ownerId: '99', name: 'Teste Silva' }],
    leadsReciclagem60: [
      /* o caso REAL da tela: sem bairro, sem cidade, sem coordenada */
      { id: '900', ownerId: '99', name: 'SEM LUGAR NENHUM', dias: 130, stageId: '1398311191' },
      /* com CEP: tem de cair no mesmo grupo do 901 da carteira */
      { id: '901', ownerId: '99', name: 'RECIC COM CEP', dias: 140, cep: '21235-515',
        logradouro: 'Avenida Monsenhor Félix', cidade: 'Rio de Janeiro' },
      { id: '902', ownerId: '88', name: 'DE OUTRO REP', dias: 122 }
    ],
    funilLeads: {}
  };
  /* meusNegociosAbertos é a carteira. Três casos: bairro, CEP, e só cidade. */
  function meusNegociosAbertos(ownerId) {
    if (String(ownerId) !== '99') return [];
    return [
      { id: '1', name: 'COM BAIRRO', stageId: '1395880469', dias: 3, bairro: 'Praia da Costa',
        cidade: 'Vila Velha', lat: -20.33, lng: -40.29 },
      { id: '2', name: 'COM CEP A', stageId: '1395880469', dias: 9, cep: '21235280',
        logradouro: 'Avenida Monsenhor Félix', cidade: 'Rio de Janeiro', lat: -22.835, lng: -43.326 },
      { id: '3', name: 'COM CEP B', stageId: '1395880469', dias: 40, cep: '21235110',
        logradouro: 'Avenida Monsenhor Félix', cidade: 'Rio de Janeiro', lat: -22.842, lng: -43.325,
        slaBreach: true },
      { id: '4', name: 'SO CIDADE', stageId: '1395880469', dias: 1, cidade: 'Salvador' },
      /* O PERDIDO (04/09/26). meusNegociosAbertos varre TODO DATA.funilLeads e a etapa
         Perdido vem na carga como as outras — o nome dela mente. Este lead existe no cenário
         para provar que pl6Carteira se protege: negócio que saiu do funil não é munição. */
      { id: '5', name: 'JA PERDIDO', stageId: '1396006164', dias: 0, bairro: 'Praia da Costa',
        cidade: 'Vila Velha', lat: -20.33, lng: -40.29 }
    ];
  }
  const prospeccaoCache = [
    { id: '50', responsavel_owner_id: '99', nome: 'CONTA ALVO', fonte: 'Casa dos Dados',
      cep: '21235999', logradouro: 'Rua Qualquer', cidade: 'Rio de Janeiro', lat: -22.84, lng: -43.32 }
  ];
`;

let api;
try {
  api = new Function(CENARIO + '\n' + fonte
    + '\nreturn { pl6Regioes, pl6Carteira, pl6Reciclagem, pl6Novos, pl6TodasAsContas,'
    + ' pl6ChaveDeLugar, pl6RotuloDoGrupo, pl6LeadNoTerrLivre, DATA, meusNegociosAbertos,'
    + ' criarTerr: function (t) { pl6TerrLivres.push(t); },'
    + ' limparTerr: function () { pl6TerrLivres.length = 0; } };')();
} catch (e) {
  console.error('  FALHA  o bloco do Planejamento não avalia: ' + e.message);
  process.exit(1);
}

const rep = { ownerId: '99', name: 'Teste Silva' };

/* ── 1. cada função da cadeia RODA ───────────────────────────────────────────────── */
// Este é o teste que teria pego o `porPonto` solto: ele não olha o texto, ele chama.
let regioes = null, carteira = null, recic = null, novos = null, todas = null;
checar('pl6Regioes executa', (() => { try { regioes = api.pl6Regioes(rep); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);
checar('pl6Carteira executa', (() => { try { carteira = api.pl6Carteira(rep, regioes || []); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);
checar('pl6Reciclagem executa', (() => { try { recic = api.pl6Reciclagem(rep, regioes || []); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);
checar('pl6Novos executa', (() => { try { novos = api.pl6Novos(rep, regioes || []); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);
checar('pl6TodasAsContas executa', (() => { try { todas = api.pl6TodasAsContas(rep, regioes || []); return true; }
  catch (e) { checar._e = e.message; return false; } })(), checar._e);

if (falhas) {
  console.log('');
  console.error(falhas + ' falha(s) — a cadeia de contas do Planejamento não roda.');
  process.exit(1);
}

/* ── 2. a cascata de lugar cobre os três campos ──────────────────────────────────── */
checar('bairro vira chave quando existe',
  api.pl6ChaveDeLugar({ bairro: 'Praia da Costa', cep: '29101' }) === 'b:praia da costa',
  'o bairro tem precedência: é o campo mais específico');
checar('sem bairro, o CEP de 5 dígitos vira chave',
  api.pl6ChaveDeLugar({ cep: '21235-515' }) === 'z:21235',
  'e a pontuação do CEP não pode virar chave diferente');
checar('sem bairro e sem CEP, a cidade vira chave',
  api.pl6ChaveDeLugar({ cidade: 'Salvador' }) === 'c:salvador');
checar('sem nada, não há chave — e isso não é uma região chamada vazio',
  api.pl6ChaveDeLugar({}) === null,
  'chave vazia agruparia todas as contas sem endereço numa região fantasma');

/* ── 3. o mesmo lugar junta contas de fontes diferentes ──────────────────────────── */
// É o ponto da mudança: a região existe porque o território é a soma das três fontes.
const zona = (regioes || []).find(r => r.chave === 'z:21235');
checar('a faixa de CEP junta carteira, reciclagem e lote novo', !!zona
  && zona.porFonte.carteira === 2 && zona.porFonte.reciclagem === 1 && zona.porFonte.novo === 1,
  zona ? JSON.stringify(zona.porFonte) : 'a região z:21235 não se formou');
checar('e ela se chama pela via mais frequente, não pelo número do CEP',
  !!zona && /Monsenhor/.test(zona.nome), zona ? zona.nome : '');
checar('o grupo declara por qual campo se formou',
  !!zona && zona.via === 'CEP 21235', zona ? String(zona.via) : '');

/* ── 4. o centroide não é contaminado por quem não tem ponto ─────────────────────── */
// Média com zero dentro joga a região para o meio do Atlântico.
checar('o centroide sai só das contas com coordenada',
  !!zona && zona.comCoordenada === 3 && zona.lat < -22 && zona.lat > -23,
  zona ? ('comCoordenada=' + zona.comCoordenada + ' lat=' + zona.lat) : '');
const semPonto = (regioes || []).find(r => r.chave === 'c:salvador');
checar('região sem nenhuma coordenada tem centroide null, não 0,0',
  !!semPonto && semPonto.lat === null && semPonto.lng === null,
  semPonto ? JSON.stringify([semPonto.lat, semPonto.lng]) : 'c:salvador não se formou');

/* ── 5. TODAS as contas da tela são alcançáveis ──────────────────────────────────── */
// O defeito de origem: 48 dos 86 cards do Bruno eram renderizados e não estavam em
// nenhuma lista que os cliques consultavam.
const ids = new Set((todas || []).map(x => x.id));
checar('a reciclagem está em pl6TodasAsContas',
  ids.has('r-900') && ids.has('r-901'),
  'era exatamente isto que faltava: card na tela, ausente da busca do clique');
checar('a carteira está', ids.has('c-1') && ids.has('c-4'));
checar('o lote novo está', ids.has('n-50'));
checar('e conta de OUTRO rep não entra', !ids.has('r-902'),
  'carteira de colega na tela dele é vazamento de dado');
checar('o total é a soma das três fontes',
  (todas || []).length === (carteira || []).length + (recic || []).length + (novos || []).length);

/* ── 6. a região de um lead é a DELE ────────────────────────────────────────────── */
// Antes vinha do centroide mais próximo: um lead de Salvador podia sair como "Monsenhor
// Félix" se aquela fosse a única região com coordenada.
const salvador = (todas || []).find(x => x.id === 'c-4');
checar('o lead que só tem cidade cai na região da cidade dele',
  !!salvador && salvador.regiao === 'c:salvador',
  salvador ? String(salvador.regiao) : '');
const semLugar = (todas || []).find(x => x.id === 'r-900');
checar('e o lead sem nenhum campo de lugar fica SEM região',
  !!semLugar && !semLugar.regiao,
  'sem isso ele seria agendado numa região onde não está');
checar('quem não tem coordenada tem km null, não 0',
  !!semLugar && semLugar.km === null && semLugar.semEndereco === true);

/* ── 6b. O TERRITÓRIO QUE ELE DIGITA (prancha 6c) ───────────────────────────────── */
// "O executivo manda no mapa": ele digita qualquer bairro e aquilo vira território. Antes,
// `pl6UI.terr && porChave.has(...)` descartava em silêncio o texto que não fosse uma região
// derivada — o campo só filtrava chips, nunca criava.
checar('o texto casa por qualquer campo de lugar',
  api.pl6LeadNoTerrLivre({ cidade: 'Rio de Janeiro' }, 'rio')
    && api.pl6LeadNoTerrLivre({ logradouro: 'Avenida Monsenhor Félix' }, 'monsenhor')
    && api.pl6LeadNoTerrLivre({ bairro: 'Praia da Costa' }, 'praia'),
  'exigir bairro faria o território digitado não casar com quase nada — bairro tem 3,5%');
checar('e sem acento também',
  api.pl6LeadNoTerrLivre({ bairro: 'Maracanã' }, 'maracana'),
  'ele digita com uma mão, no carro');
checar('texto que não casa não captura ninguém',
  !api.pl6LeadNoTerrLivre({ cidade: 'Salvador' }, 'curitiba'));

api.limparTerr();
api.criarTerr('monsenhor');
const comTerr = api.pl6Regioes(rep);
const meu = comTerr.find(r => r.chave === 't:monsenhor');
checar('o território digitado volta como REGIÃO em pl6Regioes', !!meu,
  'todo consumidor da aba pergunta `l.regiao === chave` — um filtro de texto paralelo faria '
  + 'cinco lugares saberem de duas coisas');
checar('e ele declara que foi digitado', !!meu && meu.digitado === 'monsenhor'
  && meu.via === 'seu território',
  'o chip precisa dizer que a fonte é a palavra dele, não o bairro nem o CEP');
const todasComTerr = api.pl6TodasAsContas(rep, comTerr);
const capturados = todasComTerr.filter(x => x.regiao === 't:monsenhor');
checar('os leads que casam entram no território dele',
  capturados.length === 3 && !!meu && meu.contas === 3,
  'capturou ' + capturados.length + ', a região diz ' + (meu ? meu.contas : '?'));
// A PALAVRA DELE GANHA DA DERIVAÇÃO — mas SÓ para quem casa, e essa distinção é o ponto.
// Dos 4 leads da faixa 21235, três estão na Avenida Monsenhor Félix e um é uma conta-alvo
// na "Rua Qualquer" que só compartilha o CEP. O território "monsenhor" leva os três e deixa
// o quarto onde ele está: território é um pedaço do mapa, não um balde por faixa de CEP.
// (Escrevi esta asserção esperando ZERO na faixa; o teste me corrigiu.)
const sobraramNoCep = todasComTerr.filter(x => x.regiao === 'z:21235');
checar('os que casam saem da faixa de CEP, e só eles',
  sobraramNoCep.length === 1 && sobraramNoCep[0].id === 'n-50',
  'sobraram ' + sobraramNoCep.length + ': ' + sobraramNoCep.map(x => x.id).join(', ')
  + ' — deveria sobrar só a conta-alvo da Rua Qualquer');
api.limparTerr();
checar('sem território digitado, a cascata volta a valer',
  api.pl6TodasAsContas(rep, api.pl6Regioes(rep)).filter(x => x.regiao === 'z:21235').length === 4,
  'o território é da sessão: some quando ele desfaz');

/* ── 7. e a única fonte é a única fonte ─────────────────────────────────────────── */
// Se alguém voltar a montar "todas as contas" na mão, some uma fonte de novo.
const naMao = (tpl.match(/pl6Carteira\(rep, regioes\)\s*\n?\s*\.concat\(pl6Novos/g) || []).length;
checar('ninguém monta "todas as contas" na mão',
  naMao === 0,
  naMao + ' lugar(es) concatenando carteira+novos direto — quem quer todas chama pl6TodasAsContas');

console.log('');

/* ══ NEGOCIO QUE SAIU DO FUNIL NAO E MUNICAO (04/09/26) ══════════════════════════════
   MEDIDO na tela do Bruno: "UAU UNIDADE PENHA · Perdido · ha 0d" na lista da semana, com o
   conselho "sem proximo passo datado" embaixo — a tela mandando planejar visita a um
   negocio ja perdido, e ainda cobrando um proximo passo.
   A causa e , que varre TODO DATA.funilLeads: a etapa Perdido vem na
   carga como as outras sete, e o nome da funcao mente. Ela tem 19 chamadores, entao o
   Planejamento se protege aqui em vez de trocar o comportamento de 19 telas de uma vez.
   RECICLAGEM NAO ENTRA nesta regra e o teste abaixo prova: ela nao saiu do funil, esta
   parada — e continua sendo municao pelo chip proprio dela. */
(function () {
  const cart = api.pl6Carteira(rep, api.pl6Regioes(rep));
  const nomes = cart.map(function (l) { return l.nome; });
  checar("a carteira do Planejamento nao traz negocio Perdido",
    nomes.indexOf("JA PERDIDO") < 0, "achou: " + nomes.join(", "));
  checar("e nao perdeu os outros quatro no caminho",
    cart.length === 4, "achou " + cart.length);
  const todas = api.pl6TodasAsContas(rep, api.pl6Regioes(rep));
  checar("pl6TodasAsContas tambem nao traz o Perdido",
    todas.filter(function (l) { return l.nome === "JA PERDIDO"; }).length === 0);
  checar("a RECICLAGEM continua na municao (ela nao saiu do funil, esta parada)",
    todas.filter(function (l) { return l.reciclagem; }).length > 0,
    "reciclagem sumiu junto com o Perdido — o filtro pegou demais");
})();

/* O BLOCO DA CAMADA DA MUNIÇÃO SAIU DAQUI (09/09/26). Eram onze checagens sobre uma
   solução de layout — lista absoluta dentro de caixa flex, piso de altura, teto de
   viewport — que existiu para a coluna da direita não esticar a página. A prancha final
   resolve isso com grid de 330px e overflow na própria coluna, e a regra que sobrou está
   na seção da prancha: a munição rola por dentro e o redesenho preserva a rolagem.
   pl6RegraCSS saiu com elas: nenhuma checagem restante lê regra de classe, porque a tela
   nova é inline. */

/* ══════════════════════════════════════════════════════════════════════════════════════
   A PRANCHA FINAL DO PLANEJAMENTO (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Prancha planejamento-final-v2 + prompt. Julyan: "REVISÃO FINAL NA TELA DO EXECUTIVO...
   FAÇA COM PERFEIÇÃO".

   ══ O QUE SAIU DAQUI, E POR QUÊ ════════════════════════════════════════════════════
   Quarenta e duas checagens desta suíte cravavam o desenho ANTERIOR: a grade de 15
   posições, a barra de capacidade, o contador N/15, os sete chips de janela, o mostrador
   de relógio, a camada de rolagem da munição, o ✕ de 20px, o crachá na linha 1. O desenho
   saiu inteiro; guarda que continua exigindo o desenho velho reprova o trabalho novo, e
   guarda que aponta para função removida ESTOURA — e crash não é medição.

   Elas não foram apagadas: cada REGRA que sobreviveu está aqui embaixo, escrita contra o
   código novo. As que morreram com o desenho estão nomeadas na mensagem de commit.

   ══ O QUE ESTA SEÇÃO PROTEGE ═══════════════════════════════════════════════════════
   A primeira checagem é a que teria evitado o pior defeito do dia: a Daily do gestor
   ficou INTEIRA em branco porque o markup lia um nome que o contrato não entregava. Aqui
   isso é medido por comparação de conjuntos, e não por leitura. */
(function () {
  const dados = pegarFn('pl6DadosFinal');
  const tela = pegarFn('pl6TelaFinalHTML');
  const ligar = pegarFn('pl6Ligar');
  const semCom = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ');
  /* O MARKUP É A TELA MAIS O QUE ELA DELEGA (10/09/26). pl6TelaFinalHTML passou a
     chamar pl6FichaPainelHTML com o mesmo `d`, e ler só o corpo da tela fez esta guarda
     acusar sete nomes bons (fichaNome, fichaSub, fichaTag…). Contrato que atravessa duas
     funções tem de ser medido nas duas.
     SE UMA DELAS DEIXAR DE EXISTIR, pegarFn aborta a suíte dizendo o nome — é o
     comportamento que se quer: âncora perdida reprova, não passa. */
  const painelFicha = pegarFn('pl6FichaPainelHTML');
  const telaCod = semCom(tela) + semCom(painelFicha);
  const dadosCod = semCom(dados);
  const ligarCod = semCom(ligar);
  /* O TEMPLATE SEM COMENTÁRIO, com o nome desta suíte. Eu escrevi `codigo` — que é o nome
     da variável na suíte da Daily do gestor — e esta seção estourou depois de 39
     checagens verdes: ReferenceError no meio do arquivo. Verde parcial seguido de crash é
     o pior relatório possível, porque o número no topo parece bom. */
  const codigo = semCom(tpl);

  /* ── 1 · O CONTRATO É FECHADO ─────────────────────────────────────────────────────
     Todo `d.X` que o markup lê tem de ser chave devolvida por pl6DadosFinal. Foi assim
     que a Daily do gestor morreu hoje: `avisoForaDoCampo` era calculado numa função e
     lido no markup de outra, e nenhuma suíte executava aquele render. */
  const lidos = [...new Set([...telaCod.matchAll(/\bd\.([A-Za-z][A-Za-z0-9_]*)/g)].map(m => m[1]))];
  /* O RETURN DE TOPO, e não o último `return {` do arquivo: a primeira versão desta
     checagem pegava `lastIndexOf('return {')`, que cai dentro de um dos map() — o de
     municao devolve objeto — e então o conjunto "entregues" saía vazio e ela acusava as
     23 chaves boas. Guarda que acusa o arquivo correto é tão ruim quanto a que passa no
     errado: as duas fazem a próxima pessoa desconfiar da guarda. */
  const iRet = dadosCod.lastIndexOf('\n  return {');
  const retorno = iRet > -1 ? dadosCod.slice(iRet) : '';
  const entregues = new Set([...retorno.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9_]*):/gm)].map(m => m[1]));
  const semEntrega = lidos.filter(n => !entregues.has(n));
  checar('todo nome que o markup da prancha lê é entregue pelo contrato',
    lidos.length > 20 && semEntrega.length === 0,
    'o markup lê ' + semEntrega.join(', ') + ' e o contrato não entrega — ReferenceError'
    + ' leva a aba inteira para "Carregando...", como aconteceu com a Daily do gestor hoje');

  /* e o contrário: nome entregue que ninguém lê é peso morto no contrato, e a próxima
     pessoa acha que a tela usa aquilo */
  const naoLidos = [...entregues].filter(function (n) {
    return telaCod.indexOf('d.' + n) < 0;
  });
  checar('e todo nome entregue é lido pelo markup',
    naoLidos.length === 0,
    'o contrato entrega ' + naoLidos.join(', ') + ' e ninguém lê — contrato aberto é o'
    + ' começo de dois desenhos discordando de qual dado existe');

  /* ── 2 · SEM DENOMINADOR: A RÉGUA DE SLOTS SAIU DA TELA ──────────────────────────
     "Contador do dia: livre (cinza) ou N visita(s) (verde). Sem denominador — não existe
     teto de slots." O contador anterior dizia 11/15. */
  checar('o contador do dia não tem denominador',
    /cnt: n === 0 \? 'livre' : \(n \+ ' visita' \+ \(n > 1 \? 's' : ''\)\)/.test(dadosCod)
      && !/\/' \+ PL6_SLOTS/.test(dadosCod),
    'a prancha manda "sem denominador"; o número que importa é quantas visitas o dia tem');

  checar('e a barra de capacidade não voltou',
    telaCod.indexOf('pl6-cap-seg') < 0 && telaCod.indexOf('capSegs') < 0,
    'a barra media vaga contra teto — o teto deixou de ser produto');

  /* ── 3 · O SELETOR DE HORA ───────────────────────────────────────────────────────
     "grade de 12 chips de hora (08–19), linha de 4 chips de minuto (:00 :15 :30 :45)...
     QUALQUER hora é válida — nunca grade obrigatória, nunca input[type=time] nativo." */
  checar('doze horas e quatro minutos, e nenhum input de relógio',
    /const PF_HORAS_OPT = \['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19'\];/.test(codigo)
      && /const PF_MINS_OPT = \['00', '15', '30', '45'\];/.test(codigo)
      && telaCod.indexOf('type="time"') < 0,
    'digitar quatro dígitos onde um toque resolve — e o relógio nativo do sistema é o que'
    + ' a prancha proíbe por nome');

  /* ══ DIA QUE PASSOU NÃO CONVIDA ═══════════════════════════════════════════════════
     Medido dirigindo a tela: escolhi uma conta, cliquei em "+ colocar aqui" na terça (que
     já passou), escolhi 16:15, apertei o botão vermelho — e nada aconteceu. O verbo
     recusou certo, e a recusa ficou INVISÍVEL, porque o aviso do topo mostra a seleção
     enquanto há conta escolhida. Três cliques e silêncio.
     A sabotagem que me contou que faltava esta guarda: devolver o convite ao dia passado
     passava com as outras 60 verdes. */
  checar('dia que passou não oferece o convite nem o seletor',
    /convite: !!s\.sel && s\.diaAtivo !== di && !passouDoDia,/.test(dadosCod)
      && /colocando: !!s\.sel && s\.diaAtivo === di && !passouDoDia,/.test(dadosCod)
      && /const passouDoDia = \(typeof pl6DiaPassou === 'function'\) \? pl6DiaPassou\(d\.iso\) : false;/.test(dadosCod),
    'oferecer o botão para depois recusar é clique morto — e a recusa nem aparece, porque'
    + ' a faixa de aviso está ocupada pela seleção');

  /* ══ A FICHA ABERTA TEM UMA FONTE ══════════════════════════════════════════════════
     `pl6Ficha` é a variável de módulo que os ramos de fechar e de etapa leem e escrevem.
     Eu declarei um `ficha` dentro de pl6UI e fiz o contrato ler DELE: clicar no card
     gravava o id numa variável e a tela lia a outra. A gaveta não abria, e nada
     estourava — a mesma raiz que eu persegui em cinco telas hoje, cometida por mim na
     última. */
  checar('a ficha aberta vem de pl6Ficha, e não de um segundo lugar',
    /const ficha = \(typeof pl6Ficha !== 'undefined' && pl6Ficha\) \? porId\.get\(pl6Ficha\) : null;/.test(dadosCod)
      && codigo.indexOf('pl6UI.ficha') < 0
      && !/sel: null, diaAtivo: null, hSel: '09', mSel: '00', ficha:/.test(codigo),
    'duas fontes para "qual ficha está aberta" e o clique no card não abre gaveta nenhuma,'
    + ' sem erro nenhum');

  checar('o seletor abre em UM dia por vez',
    /colocando: !!s\.sel && s\.diaAtivo === di/.test(dadosCod)
      && /convite: !!s\.sel && s\.diaAtivo !== di/.test(dadosCod),
    'regra inviolável 2 da prancha: cinco seletores abertos é cinco decisões pedidas de'
    + ' uma vez, e nenhuma delas é a próxima');

  /* ── 4 · AGENDAR PASSA PELA REGRA COMPARTILHADA ──────────────────────────────────
     pl6AgendarNoSlot é quem cria o negócio da conta-alvo, cria a tarefa no HubSpot na
     data e hora, e só então grava a grade. A Minha Daily agenda pela mesma função. */
  checar('agendar vai por pl6AgendarNoSlot, com a hora escolhida',
    /return agendarNoSlot\(idSel, di, destino, hora\);/.test(ligarCod)
      && /return pl6AgendarNoSlot\(rep, id, di, si, \{\s*mutar: mutar, redesenhar: redesenhar, box: box, hora: hora\s*\}\);/.test(ligarCod),
    'um segundo caminho de agendar perderia um efeito colateral — a tarefa, o negócio da'
    + ' conta nova, ou o toast que diz onde gravou — e a divergência só apareceria no fim'
    + ' do mês, com metade das visitas sem tarefa no CRM');

  checar('e o dia que passou continua barrado',
    /pl6DiaPassou\(dias0\[di\]\.iso\)/.test(ligarCod),
    'tarefa datada no passado não volta atrás: fica na fila do gestor como compromisso'
    + ' que ninguém vai cumprir');

  /* ── 5 · MOVER LIMPA A ORIGEM ────────────────────────────────────────────────────
     Sem isto a visita apareceria duas vezes na semana e a Daily do dia antigo continuaria
     com ela. */
  checar('mover limpa a origem antes de escrever o destino',
    /g\[s\.sel\.deDi\]\[s\.sel\.deSi\] = null;\s*\n\s*g\[di\]\[destino\] = \{ id: id, hora: hora \};/.test(ligarCod),
    'a mesma visita em dois dias, e a Daily do dia antigo ainda a mostrando');

  checar('e o toast diz que a tarefa do CRM ficou na data antiga',
    /a tarefa no HubSpot ficou na data antiga/.test(ligar),
    'este produto não edita tarefa fora da Agenda; prometer que editou é pior que avisar');

  /* ── 6 · O ✕ MANTÉM A TRAVA DE HOJE ──────────────────────────────────────────────
     O ramo do ✕ é o mesmo de antes, com a trava que oferece arquivar o negócio criado por
     engano. O markup novo emite data-pl6-remover exatamente para cair nele. */
  checar('o ✕ do card agendado cai no ramo que tem a trava',
    /data-pl6-remover="\$\{sl\.rm\}"/.test(tela)
      && /if \(d\.pl6Remover\)/.test(ligarCod)
      && /pl6NegocioNascidoAqui\(era\)/.test(ligarCod),
    'sem cair neste ramo, tirar do plano volta a deixar o negócio no funil para sempre');

  /* ── 7 · A REGIÃO É TEXTO LIVRE ──────────────────────────────────────────────────
     "TEXTO LIVRE — nunca bloquear/validar. Vale o que ele digitar." */
  checar('a região aceita o que ele digitar, e grava como território dele',
    /const nova = doMapa \? doMapa\.chave : \(PL6_TERR_PREFIXO \+ chaveDigitada\);/.test(codigo),
    'bairro fora do mapa é bairro que existe na rua — bloquear o campo é a tela dizendo'
    + ' que a cidade dele está errada');

  checar('e digitar não redesenha a tela',
    /const reg = ev\.target\.closest && ev\.target\.closest\('\[data-pl6-reg-in\]'\);/.test(ligarCod)
      && /o\.hidden = !casa;/.test(ligarCod),
    'redesenhar recria o campo e o cursor sai dele a cada letra — ele digita isso com uma'
    + ' mão, no carro, com o motor ligado');

  checar('e grava só quando muda, no sair do campo',
    /if \(String\(antes \|\| ''\) === String\(nova\)\) return;/.test(codigo),
    'sem esta comparação é um upsert por cada vez que ele clica em qualquer outra coisa');

  /* ── 8 · O TERRITÓRIO CONTA O QUE DÁ PARA USAR ───────────────────────────────────
     "nº exato de contas livres no bairro". Bairro com 24 contas das quais 20 já estão na
     semana tem 4 para oferecer. */
  checar('o chip de bairro conta contas LIVRES',
    /const n = livres\.filter\(l => String\(l\.regiao \|\| ''\) === String\(r\.chave\)\)\.length;/.test(dadosCod),
    'contar o grupo inteiro manda ele procurar o que já está agendado');

  checar('e o filtro do bairro compara pela chave de lugar, não por texto',
    /daOrigem\.filter\(l => String\(l\.regiao \|\| ''\) === String\(s\.terr\)\)/.test(dadosCod),
    'comparar texto acha "Centro" dentro de "Centro-Sul" e põe conta de outro bairro na lista');

  /* ── 9 · A ORDEM DA MUNIÇÃO É A MEDIDA ───────────────────────────────────────────── */
  checar('a munição sai na ordem de pl6Prioridade',
    /municaoOrd = munFilt\.slice\(\)\.sort\(\(a, b\) => pl6Prioridade\(a\) - pl6Prioridade\(b\)\)/.test(dadosCod),
    'SLA estourado, parado, ★ e distância — inventar outra ordem aqui desfaria a única'
    + ' que foi medida');

  /* ── 10 · A AGENDA DO DIA SE LÊ POR HORA, E A GRADE NÃO SE REORDENA ─────────────── */
  /* A ORDEM E O si MUDARAM DE CASA (09/09/26): as duas telas do executivo passaram a ler
     o dia pela MESMA função, pl6ItensDoDia. Antes o kanban ordenava por hora e a Minha
     Daily lia em ordem de POSIÇÃO — a mesma manhã em duas ordens, nas duas telas de quem
     vai para a rua. A regra é a mesma; agora ela existe uma vez, e a checagem exige que
     as duas chamem. */
  const leitor = semCom(pegarFn('pl6ItensDoDia'));
  checar('o dia se lê por uma função só, e as duas telas a chamam',
    /function pl6ItensDoDia\(coluna, porId\)/.test(codigo)
      && /const itens = pl6ItensDoDia\(col, porId\)/.test(dadosCod)
      && /pl6ItensDoDia\(coluna, porId\)/.test(semCom(pegarFn('d7PlanoDeHoje'))),
    'duas leituras do mesmo dia é duas rotas: ele monta o dia numa tela e trabalha na outra');

  /* O COMPARADOR TEM NOME E DOIS USUÁRIOS (10/09/26). Enquanto a ordem morava dentro do
     leitor, a Minha Daily concatenava as vagas livres DEPOIS de tudo — e a prospecção de
     rua das 16:00 aparecia acima da vaga das 13:30, embaixo de um título que diz "em
     ordem de hora". Visto na tela, não medido. */
  const ordem = semCom(pegarFn('pl6PorHora'));
  checar('a ordem é hora ascendente, e sem hora no fim',
    /if \(!a\.hora\) return 1;/.test(ordem) && /if \(!b\.hora\) return -1;/.test(ordem)
      && /return a\.hora < b\.hora \? -1 :/.test(ordem),
    '14:20 na casa 0 e 09:00 na casa 3 mostrariam a tarde antes da manhã');

  checar('e há UM comparador, usado pelo leitor e pela Daily',
    /itens\.sort\(pl6PorHora\);/.test(leitor)
      && /\.concat\(livres\)\.sort\(pl6PorHora\)/.test(semCom(pegarFn('d7PlanoDeHoje')))
      && (codigo.match(/if \(!a\.hora && !b\.hora\) return a\.si - b\.si;/g) || []).length === 1,
    'duas cópias da ordem do dia é como uma tela mostra a tarde antes da manhã e a outra'
    + ' não — e nenhuma das duas parece errada sozinha');

  checar('e o si viaja com o item, porque a grade gravada não se reordena',
    /itens\.push\(\{ si: si, hora: hora, id: id, tipo: l \? 'visita' : 'orfa', lead: l \}\);/.test(leitor),
    'reordenar a grade mudaria o que a Daily do gestor e o g14 leem por posição');

  /* ── 11 · CONTA FORA DA CARGA É VAGA, NÃO CARTÃO ─────────────────────────────────
     Decisão dele, de hoje: "nao quero esse nome conta saiu da sua base nao precisa, só os
     slots vazios". A prancha não fala dela — e prancha silenciosa não revoga ordem dele. */
  checar('conta fora desta carga não desenha cartão',
    /\.filter\(x => x\.tipo !== 'orfa'\)/.test(dadosCod)
      && telaCod.indexOf('conta fora desta carga') < 0,
    'a casca do cartão ocupava a altura de uma visita para dizer que ali não há visita');

  /* BLOQUEIO E RUA APARECEM NO KANBAN desde que as duas telas leem a mesma função. Um dia
     com três bloqueios dizendo "livre" era a tela escondendo compromisso que ele marcou.
     Mas bloqueio NÃO conta como visita: dizer "3 visitas" incluindo um dentista faria o
     gestor cobrar visita que ninguém prometeu. */
  checar('bloqueio aparece no dia e não conta como visita',
    /const n = itens\.filter\(x => x\.tipo === 'visita' \|\| x\.tipo === 'rua'\)\.length;/.test(dadosCod)
      && /it\.tipo === 'bloqueado' \? 'bloqueado'/.test(dadosCod),
    'dia com bloqueio dizendo "livre" esconde o que ele já combinou');

  /* ── 12 · A PRÓXIMA MELHOR AÇÃO TEM UMA FONTE ────────────────────────────────────── */
  checar('o card e a ficha leem pl6Motivo, e não uma cópia da frase',
    /pl6Motivo\(l\)/.test(semCom(pegarFn('pl6SubDoCard')))
      && /fichaAcao: esc\(ficha \? pl6Motivo\(ficha\) : ''\)/.test(dadosCod),
    'duas cópias da mesma frase divergem no primeiro ajuste, e aí a tela dá dois conselhos'
    + ' diferentes para a mesma conta');

  /* ── 13 · A FICHA ─────────────────────────────────────────────────────────────────
     A casca é a da prancha (rótulo de 76px, chips de etapa, aviso âmbar, botão vermelho);
     o conteúdo é o que ele pediu duas horas antes ("mais informação"), com a regra que
     impede isso de virar mais altura. */
  const fic = semCom(pegarFn('pl6FichaCamposFinal'));
  checar('a ficha monta os campos por lista, e o vazio cai fora',
    /return linhas\.filter\(Boolean\);/.test(fic)
      && /function pfCampo\(rot, valor, cor, html\)/.test(codigo),
    'campo de preenchimento baixo com linha fixa enche a ficha de "não veio da fonte" e'
    + ' empurra para baixo o telefone e o próximo passo, que é o que ele usa');

  checar('e o telefone vazio carrega os dois cliques que resolvem',
    /pfCampo\('telefone', 'não veio da fonte · ' \+ pl6FichaLinks\(l, bruto\), '#8A6516', true\)/.test(fic),
    'o telefone falta em 86% das contas-alvo porque a API da fonte não devolve número —'
    + ' "preencher na visita" sozinho descreve o problema e deixa ele sem saída');

  checar('o link só não é escapado quando quem chama declara',
    /return \{ rot: esc\(rot\), v: html \? String\(valor\) : esc\(String\(valor\)\), cor: cor \|\| '#2B3440' \};/.test(codigo),
    'escapar por padrão é o que impede o nome do lead de virar HTML; e não escapar o link'
    + ' é o que impede o markup de sair como texto cru, que já aconteceu hoje');

  /* ── 14 · O PISO DE TOQUE SEGUE A TELA ──────────────────────────────────────────────
     A prancha desenha chips de 24px. No telefone, com uma mão, 24px é alvo que ele erra.
     E a lista cita ATRIBUTO porque lista de classe já envelheceu calada aqui. */
  checar('o piso de 44px cita os atributos que o markup emite',
    /#agendaContent \[data-pl6-acao\],/.test(tpl)
      && /#agendaContent \[data-pl6-reg-in\],/.test(tpl)
      && !/\.pl6-fi-etapa,/.test(tpl),
    'lista de toque cheia de seletor morto e vazia dos botões da tela nova — já aconteceu'
    + ' uma vez neste arquivo, e está na memória com estas palavras');

  /* ── 15 · O ARRASTE NÃO AGENDA SOZINHO ────────────────────────────────────────────
     "Soltar num dia → abre o seletor de hora SÓ naquele dia." Soltar e já agendar poria a
     visita numa hora que ele não escolheu. */
  checar('soltar no dia abre o seletor, e não agenda',
    /pl6UI\.diaAtivo = Number\(dia\.getAttribute\('data-pl6-dia-drop'\)\);/.test(ligarCod)
      && !/drop[\s\S]{0,400}agendarNoSlot/.test(ligarCod),
    'soltar agendando escolheria a hora por ele — e a hora é a única coisa que esta tela'
    + ' existe para ele escolher');
}());


/* ══════════════════════════════════════════════════════════════════════════════════════
   O ENDERECO QUE FALTA, E O UNICO ESCRITOR DE PROPRIEDADE (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   MEDIDO na carga desta sessao: dos 234 negocios abertos, 72 sem logradouro e 70 sem
   logradouro NEM bairro NEM coordenada — fora do mecanismo de regiao para sempre, em 7
   das 8 carteiras. O campo existe por causa desse numero, e estas guardas existem para
   que ele nao volte a ser somente-leitura sem ninguem notar.
   ══════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  const semCom = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const end = semCom(pegarFn('pl6EnderecoDoNegocio'));
  const pegarAsync = function (nome) {
    const re = new RegExp('\\nasync function ' + nome + '\\([\\s\\S]*?\\n\\}');
    const m = re.exec(tpl);
    if (!m) { console.error('nao achei async function ' + nome + ' — ancora perdida.'); process.exit(1); }
    return m[0];
  };
  const escritor = semCom(pegarAsync('gravarPropriedadesDoNegocio'));
  const ficha = semCom(pegarFn('pl6FichaCamposFinal'));
  const ligarPl6 = semCom(pegarFn('pl6Ligar'));
  const props = semCom(pegarFn('ligarPropsFichaEditaveis'));

  checar('as tres funcoes novas existem com corpo',
    end.length > 900 && escritor.length > 500 && ficha.length > 3000,
    'ancora perdida: sem corpo nao ha medicao, e verde aqui seria falso');

  /* ── 1 · A FICHA TEM UMA FONTE DE ENDERECO ───────────────────────────────────────
     Antes a linha era montada dentro de pl6FichaCamposFinal. Se ela voltar a montar,
     passam a existir duas respostas para "qual e o endereco" e uma delas nao oferece o
     campo — foi assim que a promessa, a hora e a ficha ja se partiram nesta tela. */
  checar('o endereco da ficha sai de pl6EnderecoDoNegocio, e so dela',
    /linhas\.push\(pl6EnderecoDoNegocio\(l, bruto\)\);/.test(ficha)
      && ficha.indexOf("pfCampo('endereço'") < 0,
    'endereco montado em dois lugares: um deles nao oferece o campo, e ninguem descobre'
    + ' qual dos dois a tela mostrou');

  /* ── 2 · O CAMPO SO APARECE ONDE PODE GRAVAR ─────────────────────────────────────
     Conta-alvo de prospecção tem endereco em 100% dos 1.985 leads e nao tem negocio para
     receber a escrita. Desenhar o formulario ali e clique morto com cara de zelo. */
  checar('o formulario exige negocio da carteira com dealId',
    /if \(l\.tipo !== 'c' \|\| !l\.dealId\)/.test(end)
      && /return pfCampo\('endereço', form, '#8A6516', true\);/.test(end),
    'formulario em conta que nao tem negocio e botao que sempre falha');

  /* ── 3 · O ATRIBUTO LEVA O dealId ────────────────────────────────────────────────
     O item do Planejamento tem id 'c-<dealId>'. Mandar l.id para a rota e 404 no
     HubSpot — e o toast diria "falha ao falar com o HubSpot" sobre um negocio que
     existe. */
  checar('os quatro atributos carregam l.dealId, nunca l.id',
    /data-pl6-end-gravar="' \+ esc\(l\.dealId\)/.test(end)
      && /esc\(l\.dealId\)/.test(end)
      && !/data-pl6-end-[a-z]+="' \+ esc\(l\.id\)/.test(end),
    'id do card no lugar do id do negocio da 404 com mensagem de rede');

  /* ── 4 · PEDE SO O QUE FALTA ─────────────────────────────────────────────────────
     Medido: 73 dos 234 tambem sem cidade. Eu ia cravar "cidade quase sempre existe"
     (chutei 8) — e por isso os campos sao montados a partir do que esta vazio. */
  checar('bairro e cidade so entram quando o CRM nao tem',
    /if \(!b\.bairro\) form \+= campo\('data-pl6-end-bairro'/.test(end)
      && /if \(!b\.cidade\) form \+= campo\('data-pl6-end-cidade'/.test(end),
    'formulario que pede o que ja existe e o formulario que ninguem preenche');

  /* ── 5 · A RUA E OBRIGATORIA ─────────────────────────────────────────────────────
     A falta da rua e o que traz o formulario. Gravar so o bairro deixaria o negocio
     ainda sem rua e a ficha dizendo que esta resolvido. */
  checar('gravar sem a rua nao chama o HubSpot',
    /const ruaEnd = valorDe\('data-pl6-end-rua'\);/.test(ligarPl6)
      && /if \(!ruaEnd\) \{/.test(ligarPl6)
      && ligarPl6.indexOf('gravarPropriedadesDoNegocio') > ligarPl6.indexOf('if (!ruaEnd) {'),
    'sem a trava, o botao grava bairro e a ficha passa a dizer que o endereco existe');

  checar('e o negocio tem de estar na carga desta sessao',
    /if \(!lEnd \|\| !lEnd\.stageId\) \{/.test(ligarPl6),
    'sem etapa a rota recebe novaEtapa vazio e responde 400 — erro de tela virando erro'
    + ' de HubSpot na frente dele');

  /* ── 6 · UM ESCRITOR SO ──────────────────────────────────────────────────────────
     Duas telas gravam propriedade de negocio. Se cada uma montar o fetch, uma fica sem
     o espelho local e mostra o valor velho depois de gravar com sucesso. */
  checar('as duas telas gravam pelo mesmo escritor',
    /await gravarPropriedadesDoNegocio\(/.test(ligarPl6)
      && /await gravarPropriedadesDoNegocio\(/.test(props)
      && props.indexOf("fetch('/api/negocio-acao'") < 0,
    'a ficha do funil voltou a montar o proprio fetch: uma das duas vai perder o espelho'
    + ' local e a tela mentira sobre o que gravou');

  checar('o escritor manda a etapa ATUAL, para escrever sem mover',
    /novaEtapa: lead\.stageId/.test(escritor)
      && /op: 'mudar-etapa'/.test(escritor),
    'etapa diferente da atual faz a rota exigir as propriedades da etapa — e mover o'
    + ' negocio de lugar sem ninguem pedir');

  /* ── 7 · O RELOGIO DA ETAPA NAO ZERA AO GRAVAR CAMPO ─────────────────────────────
     aplicarEtapaNoDataLocal assume dias: 0 quando ninguem passa o quarto argumento — ele
     foi escrito para MOVER. A ficha do funil chamava sem ele: salvar o celular de um
     negocio parado ha 41 dias fazia a tela dizer "hoje" ate a proxima rodada do robo. */
  checar('gravar propriedade preserva o "ha Xd na etapa"',
    /aplicarEtapaNoDataLocal\(lead\.id, lead\.stageId, props, lead\.dias != null \? lead\.dias : null\)/
      .test(escritor),
    'sem o quarto argumento o espelho local zera os dias na etapa, e o gestor le SLA'
    + ' que nao existe');
}());

/* ══════════════════════════════════════════════════════════════════════════════════════
   A LEITURA DO GESTOR FALA A LINGUA DA PRANCHA (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   O cartao de VISITA ja era compartilhado desde o redesenho da Daily. Os tres ramos que
   nao sao visita — bloqueado, rua e orfa — tinham markup proprio com as classes antigas:
   a mesma coluna com dois idiomas de cartao.
   ══════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  const semCom = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rot = semCom(pegarFn('g14RoteiroHTML'));
  /* O CARTÃO É UM SÓ DESDE A PRANCHA v2 (10/09/26): antes eram dois (d7LinhaVisita para
     a visita e d7CartaoSimples para o resto). Agora d7CartaoDoDiaHTML desenha tudo que
     ocupa hora e d7CartaoDoItem traduz o item do plano para ele. */
  const cartao = semCom(pegarFn('d7CartaoDoDiaHTML'));
  const mapa = semCom(pegarFn('d7CartaoDoItem'));
  const daily = semCom(pegarFn('d7TelaFinalHTML'));

  checar('o cartao do dia e funcao de cima, nao closure de uma tela',
    cartao.length > 800 && mapa.length > 800
      && daily.indexOf('const cartaoSimples = function') < 0,
    'closure dentro de uma tela e o que obrigou o gestor a ter markup proprio');

  /* UMA CHAMADA CADA, e não uma por tipo de item: os quatro ramos do roteiro (visita,
     bloqueado, rua, órfã) viraram um, porque o cartão já sabe desenhar os quatro. */
  checar('as duas telas desenham o dia pelo mesmo cartao',
    /d7CartaoDoDiaHTML\(d7CartaoDoItem\(l, true, linha\.planoDia \|\| null\), true\)/.test(rot)
      && /d7CartaoDoDiaHTML\(v, false\)/.test(daily)
      && /d7CartaoDoItem\(l, false, null\)/.test(semCom(pegarFn('d7DadosFinal'))),
    'markup proprio em uma das duas volta a descrever a mesma manha em dois idiomas');

  /* O ✕ E ATO DO EXECUTIVO. No roteiro do gestor os tres cartoes passam comX falso: ele
     le a promessa, e escrever na promessa de outra pessoa e tirar o dono dela. */
  /* O GESTOR PASSA soLeitura=true NOS DOIS: no mapeador (que troca a ação pela leitura
     dela) e no cartão (que esconde a régua de desfecho e o ✕). Ele lê a promessa. */
  checar('o gestor le, e nao escreve, na promessa de outra pessoa',
    /d7CartaoDoItem\(l, true,/.test(rot)
      && rot.indexOf('data-d7-tirar') < 0 && rot.indexOf('data-d7-proposta') < 0
      && /if \(soLeitura \|\| !v\.pendente\) return/.test(cartao),
    'o ✕ ou a régua na tela do gestor tira do plano de outra pessoa');

  checar('a vaga livre do roteiro esta na linguagem da prancha',
    /border:1\.5px ' \+ \(aberto \? 'solid' : 'dashed'\) \+ ' #F0A9B2/.test(rot)
      && rot.indexOf("class=\"g14-livre") < 0,
    'vaga com o estilo antigo ao lado de cartoes novos e a mesma coluna em dois produtos');

  /* AS CLASSES MORTAS SAEM. Regra que ninguem cita envelhece calada, e foi assim que a
     lista de piso de toque desta casa ficou cheia de seletor morto tres vezes. */
  checar('as classes .d7-linha* e .g14-livre* sairam do CSS e do markup',
    /* SEM COMENTARIO: a primeira versao desta checagem leu a propria nota que
       documenta a remocao (ela cita as classes por nome) e reprovou o conserto. */
    semCom(tpl).indexOf('d7-linha') < 0
      && semCom(tpl).indexOf('g14-livre') < 0,
    'CSS de classe que ninguem mais desenha: a proxima leitura acha que a tela usa aquilo');

  /* O CARTAO NOVO NAO TEM MARGEM (o antigo tinha margin-bottom:6px). Sem gap no
     container, os tres cartoes e as vagas ficam encostados. */
  checar('o container do roteiro da o espaco que o cartao novo nao carrega',
    /\.g14-roteiro\{display:flex;flex-direction:column;gap:6px;/.test(tpl),
    'cartao sem margem em container sem gap: a leitura do gestor vira um bloco unico');
}());

if (falhas) {
  console.error(falhas + ' falha(s) — a cadeia de contas do Planejamento está errada.');
  process.exit(1);
}
console.log('planejamento: a cadeia de contas roda, o território sai das três fontes, e todo card é alcançável.');
