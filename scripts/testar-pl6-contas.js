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
/* o pino do app (06/10/26): as fontes passam por pl6ComPino; sem pinos lidos ele devolve o lead como veio */
const CADEIA = ['pl6PinoDe', 'pl6ComPino', 'pl6EmQueda', 'pl6ChaveBairro', 'pl6RotuloBairro', 'pl6ChaveTerrLivre', 'pl6SemearTerrLivres',
  'pl6FontesCruas',
  'pl6LeadNoTerrLivre', 'pl6ChaveDeLugar', 'pl6RotuloDoGrupo',
  'pl6Km', 'pl6RegiaoDoLead', 'pl6Regioes', 'pl6Carteira', 'pl6Reciclagem', 'pl6GrupoDaFonte', 'pl6ChaveNome', 'pl6ChaveFone', 'pl6JaNaCarteira',
  'pl6Novos', 'pl6TodasAsContas'];

// O TERRITORIO DIGITADO entrou na cadeia (prancha 6c): pl6Regioes chama pl6SemearTerrLivres
// e pl6RegiaoDoLead lê pl6TerrLivres. Sem estes dois aqui a suíte reprovaria a cadeia por
// falta de dependência — e o certo é ela EXECUTAR a cadeia nova, não ignorá-la.
const fonte = [
  'var PL6_PINO = null;',
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

/* ══ A TELA DO PLANEJAMENTO v2 (pl6DadosFinal, pl6TelaFinalHTML, pl6Ligar) SAIU EM 20/11/26 ══
   O executivo usa a v3 (PLV3) desde 01/11, e a v2 só abria pelo botão "Usar o planejamento anterior";
   a faxina final a tirou, e com ela a seção que media o contrato tela × dados dela. A cadeia de contas
   acima (pl6TodasAsContas e companhia), que a v3 usa, continua executada aqui. */


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
  /* 20/11/26: as duas travas do gravador da v2 (rua obrigatória, negócio na carga) saíram com pl6Ligar.
     Na v3 o endereço é gravado por PLV3.gravarEndereco, medido abaixo. */

  /* ── 6 · UM ESCRITOR SO ──────────────────────────────────────────────────────────
     Duas telas gravam propriedade de negocio. Se cada uma montar o fetch, uma fica sem
     o espelho local e mostra o valor velho depois de gravar com sucesso. */
  checar('as duas telas gravam pelo mesmo escritor',
    /PLV3\.gravarEndereco = [\s\S]{0,2500}?gravarPropriedadesDoNegocio\(/.test(tpl)
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
  /* O ROTEIRO DO GESTOR (g14RoteiroHTML) SAIU EM 11/09/26 com a Daily 14a morta. Este
     bloco existia para proteger "uma coluna, um idioma de cartão" entre a tela do gestor
     e a do executivo; agora só uma delas desenha o dia, e as checagens que mediam o
     markup do gestor viraram checagens do executivo — a exigência é a mesma (um cartão
     só), medida no único lado que ainda tem cartão.
     Não reancorei na Daily nova de propósito: ela é ESPELHO e não desenha cartão de
     roteiro, então não existe markup equivalente para comparar. */
  /* ══ O CARTÃO DO DIA (reancorado em 24/09/26) ══════════════════════════════════
     Aqui viviam três checagens comparando o cartão da Minha Daily com o do roteiro do
     gestor: que o cartão era função de cima e não closure, que os dois caminhos
     desenhavam pelo mesmo, e que o modo somente-leitura escondia o ✕.

     A MINHA DAILY SAIU, e com ela os dois caminhos. O cartão do dia agora é um só por
     construção: o do Planejamento, dentro de pl6TelaFinalHTML. A regra que sobrevive é
     a que sempre importou — QUEM VÊ A PROMESSA DE OUTRA PESSOA NÃO GANHA O ✕ DELA —, e
     ela mudou de dono: quem mostra o dia de outro é a Daily do GESTOR, que é só
     leitura, e é isso que esta checagem passa a exigir. */
  /* 20/11/26: o cartão da v2 (o `const agendaHTML =` de pl6TelaFinalHTML) saiu com ela; o
     único cartão de dia do Planejamento é o da v3, PLV3.cartaoHTML. */
  checar('o cartão do dia é um só, e é o do Planejamento',
    (semCom(tpl).match(/\nPLV3\.cartaoHTML = function/g) || []).length === 1
      && semCom(tpl).indexOf('const agendaHTML = ') < 0
      && semCom(tpl).indexOf('function d7CartaoDoDiaHTML') < 0,
    'dois montadores do mesmo cartão foi o que fez a mesma manhã ser descrita em dois'
      + ' idiomas — e nenhum dos dois parecia errado sozinho');

  /* 20/11/26: a Daily do gestor (dg4TelaHTML), que mostrava o dia de outra pessoa, saiu com o ?gv2=0. */

  /* A VAGA LIVRE DO ROTEIRO DO GESTOR saiu com a 14a (11/09/26). A checagem irmã, logo
     abaixo, é a que continua valendo e ficou MAIS forte: as classes .d7-linha* e
     .g14-livre* não existem no CSS nem no markup. */

  /* AS CLASSES MORTAS SAEM. Regra que ninguem cita envelhece calada, e foi assim que a
     lista de piso de toque desta casa ficou cheia de seletor morto tres vezes. */
  checar('as classes .d7-linha* e .g14-livre* sairam do CSS e do markup',
    /* SEM COMENTARIO: a primeira versao desta checagem leu a propria nota que
       documenta a remocao (ela cita as classes por nome) e reprovou o conserto. */
    semCom(tpl).indexOf('d7-linha') < 0
      && semCom(tpl).indexOf('g14-livre') < 0,
    'CSS de classe que ninguem mais desenha: a proxima leitura acha que a tela usa aquilo');

  /* O CONTAINER DO ROTEIRO DO GESTOR (.g14-roteiro) saiu em 11/09/26 com a 14a morta. O
     cuidado que ele guardava — cartão sem margem exige gap no container — continua valendo
     do lado do executivo, e é medido pela checagem do cartão único acima: o único
     container que desenha cartão de dia hoje é o da Minha Daily. */
}());


/* ══════════════════════════════════════════════════════════════════════════════════════
   PLANEJAR A PRÓXIMA SEMANA (11/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "meu time está já planejando a semana que vem, eu quero que dê a opção de já
   planejar a próxima semana".

   A SEMANA CORRENTE CONTINUA SENDO DECIDIDA PELO RELÓGIO (pl6SegundaDaSemana, que vira
   na sexta às 17h). O que nasceu foi um FOCO de tela — pl6SegundaEmFoco() — e o risco
   desta mudança não é o botão: é o foco vazar para quem fala do dia de hoje.

   QUEM PODE ANDAR COM O BOTÃO: só o caminho da tela de Planejamento (ler, gravar, montar
   os 5 dias, os handlers).
   QUEM NÃO PODE, e por quê:
     espelharPassoNoPlanoSemanal  escreve a tarefa na semana DELA
     pm8Segunda / sm9Segunda .. a promessa e a Semanal são da semana corrente
     renderDaily .............. a pré-carga do plano é para o dia de hoje */
(function () {
  const semCom = s => String(s).replace(/[/][*][sS]*?[*][/]/g, ' ');
  const cod = semCom(tpl);

  checar('a semana corrente e a semana em foco são funções diferentes',
    /function pl6SegundaDaSemana\(agora\)/.test(cod)
      && /function pl6SegundaEmFoco\(\)/.test(cod)
      && /return addDays\(pl6SegundaDaSemana\(\), \(Number\(PL6_SEMANA\) \|\| 0\) \* 7\);/.test(cod),
    'uma função só faria o botão mover a Daily, a promessa e a Semanal junto');

  /* A CHECAGEM QUE IMPORTA: nenhuma das funções de fora usa a semana EM FOCO. */
  checar('o foco da tela não vaza para quem fala de hoje',
    (function () {
      /* EXTRATOR PRÓPRIO: o pegarFn desta suíte só casa `function NOME(`, e metade destas
         é `async function` — ele sairia do processo dizendo que perdeu a âncora. */
      /* d7DadosFinal, d7Ligar e pl6ColunaDaData saíram em 24/09/26 com a Minha Daily.
         Os outros cinco continuam falando do dia de HOJE e continuam proibidos de
         enxergar o foco da tela de Planejamento. */
      /* 20/11/26: sm9Segunda, tl5Semana e renderDaily saíram com as telas antigas do gestor. */
      const donos = ['espelharPassoNoPlanoSemanal', 'pm8Segunda'];
      return donos.every(function (nome) {
        const i = cod.search(new RegExp('(?:async )?function ' + nome + '\\('));
        if (i < 0) return false;   /* âncora perdida reprova */
        let d = 0, j = i, viu = false;
        while (j < cod.length) {
          const c = cod[j];
          if (c === '{') { d++; viu = true; }
          else if (c === '}') { d--; if (viu && d === 0) { j++; break; } }
          j++;
        }
        return cod.slice(i, j).indexOf('pl6SegundaEmFoco') < 0;
      });
    }()),
    'a promessa, a Semanal e o espelho passariam a falar da semana que vem quando ele'
      + ' clicasse em "próxima" no Planejamento — sem nada dizer');

  /* REESCRITA EM 13/09/26, mesmo motivo da irma em testar-espelho-local: a semana da
     tarefa virou a que CONTEM a data (esta ou a proxima), entao a linha cravada saiu.
     A exigencia continua sendo a que importa — semana POR ARGUMENTO nas quatro
     escritas, vinda do relogio e nao do foco da tela. */
  checar('e quem escreve fora da tela diz qual semana',
    /pl6Carregar\(rep, semanaDaTarefa\)/.test(cod)
      && /pl6Gravar\(rep, \{ grade: grade \}, semanaDaTarefa\)/.test(cod)
      && /const pl6SegundaAtual = pl6SegundaDaSemana\(\);/.test(cod)
      /* A QUARTA ERA A GRAVAÇÃO DA MINHA DAILY, e saiu com ela em 24/09/26. Ficaram as
         duas pré-cargas, que são as outras leituras de fora da tela — e as duas pedem a
         semana do RELÓGIO, que é o ponto. A TERCEIRA (06/11/26) é a do Hoje do executivo v4
         (HJ4.render), que lê a grade desta semana para o "Pôr em [dia]": também do relógio. */
      /* 07/11/26: a do Hoje v4 ganhou { soGrade: true } (só a linha da semana, sem os pinos); a semana segue do relógio */
      /* 20/11/26: a pré-carga da Daily antiga do gestor saiu; fica a do Hoje do executivo v5 */
      && (cod.match(/pl6Carregar\([a-zA-Z]+, pl6SegundaDaSemana\(\)(, \{ soGrade: true \})?\)/g) || []).length === 1, /* 17/11/26: ficaram a pré-carga da Minha Daily e a do Hoje do executivo v5 (H5.render); as dos Hojes antigos saíram com eles */
    'sem o argumento, um passo de hoje entraria na linha da semana que vem, no dia errado');

  /* TROCAR DE SEMANA RECARREGA. pl6Plano é a linha de UMA semana; desenhar com a linha
     da outra mostra a grade errada com o rótulo certo. Desde 20/11/26 o único seletor de
     semana é o da v3 (data-pv3-acao="semana:N"). */
  checar('trocar de semana recarrega a linha antes de desenhar',
    /if \(verbo === 'semana'\) \{[\s\S]{0,300}?PL6_SEMANA = Number\(arg\) \|\| 0;[\s\S]{0,200}?await pl6Carregar\(PLV3\.rep\);\s*return PLV3\.pintar\(\);/.test(cod),
    'a grade de uma semana embaixo do rótulo da outra é o pior dos dois mundos');

  /* HOJE É UMA DATA, NÃO UMA POSIÇÃO — visto na foto: com a semana que vem aberta, a
     sexta aparecia marcada como HOJE, porque sexta é a quinta coluna nas duas semanas. */
  checar('a marca de HOJE compara a data, não a coluna',
    /passou: d\.iso < hojeIso, hoje: d\.iso === hojeIso/.test(cod)
      && cod.indexOf('hoje: di === diHoje') < 0,
    'comparar índice marca a sexta da semana que vem como hoje, em vermelho, na tela dele');

  /* E A TELA AVISA. Montar a segunda que vem achando que é hoje é o erro caro aqui. */
  checar('e a tela diz em voz alta qual semana está aberta',
    /data-pv3-acao="semana:' \+ estaOff \+ '" aria-pressed="' \+ \(off === estaOff\) \+ '">esta semana<\/button>/.test(cod)
      && cod.indexOf('planejando: próxima semana · virou sex 17h') > 0
      && cod.indexOf('esta semana · só leitura: plano × feitas') > 0,
    'sem o aviso, o dia montado no lugar errado só aparece na segunda-feira seguinte');
}());
/* ══════════════════════════════════════════════════════════════════════════════════════
   CRIAR LEAD NOVO NO PLANEJAMENTO (11/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "ele não consegue criar lead novo na tela de planejamento".

   O BOTÃO EXISTIA DESDE 04/09 E ESTAVA MORTO: o handler era
       if (d.pl6NovoLead) { criarLead(null); return; }
   e `criarLead` não existe no arquivo — zero ocorrências fora daquela linha. O clique
   lançava ReferenceError dentro do ouvinte e morria ali. Botão com cursor, com hover, com
   piso de 44px no celular, e sem efeito nenhum.

   NENHUMA GUARDA PEGAVA: o atributo estava no markup, o ouvinte estava ligado, o CSS
   estava lá. É "listener não é comportamento" no estado puro — e é por isso que a
   primeira checagem abaixo mede CHAMADA CONTRA DECLARAÇÃO, e não presença de botão. */
(function () {
  const semCom2 = s => String(s).replace(/[/][*][\s\S]*?[*][/]/g, ' ');
  const cod = semCom2(tpl);

  /* ── 1 · NENHUM HANDLER DESTA TELA CHAMA FUNÇÃO QUE NÃO EXISTE ────────────────────
     20/11/26: o ouvinte da v2 (pl6Ligar) saiu; o que sobra é o despachante da v3, PLV3.acao. */
  checar('todo handler do Planejamento chama função que existe',
    (function () {
      const i = cod.indexOf('\nPLV3.acao = async function');
      if (i < 0) return false;
      const corpo = cod.slice(i, cod.indexOf('\n};\n', i));
      if (corpo.length < 3000) return false;
      /* as funções soltas que o corpo CHAMA, pelo padrão `nome(` sem ponto antes */
      const chamadas = [...new Set((corpo.match(/(^|[^.\w$])([a-z][A-Za-z0-9_]{3,})\(/g) || [])
        .map(function (s) { return s.replace(/^[^a-z]/, '').slice(0, -1); }))];
      const nativas = ['function', 'catch', 'return', 'typeof', 'await', 'String', 'Number',
        'Boolean', 'Array', 'Object', 'Math', 'Date', 'JSON', 'parseInt', 'parseFloat',
        'setTimeout', 'clearTimeout', 'confirm', 'alert', 'prompt', 'console', 'isNaN',
        'decodeURIComponent', 'encodeURIComponent', 'requestAnimationFrame', 'isFinite'];
      const faltando = chamadas.filter(function (nome) {
        if (nativas.indexOf(nome) > -1) return false;
        if (new RegExp('(?:async )?function ' + nome + '\\s*\\(').test(cod)) return false;
        if (new RegExp('(?:const|let|var) ' + nome + '\\s*=').test(cod)) return false;
        return true;
      });
      if (faltando.length) console.log('      ↳ sem declaração: ' + faltando.join(', '));
      return faltando.length === 0;
    }()),
    'o botão de criar lead chamou `criarLead` por sete dias, e criarLead nunca existiu — ReferenceError no ouvinte é clique morto que nenhuma guarda de markup enxerga');

  /* ── 2 · O FORMULÁRIO EXISTE, E PEDE O MÍNIMO (o da v3) ─────────────────────────── */
  checar('o botão abre um formulário com nome, bairro, telefone e fonte',
    /st\.novo = \{ nome: arg === 'busca' \? String\(st\.q \|\| ''\) : '', bairro: '', telefone: '', fonte: 'rua'/.test(cod)
      && cod.indexOf('data-pv3-novo="nome"') > 0
      && cod.indexOf('data-pv3-novo="bairro"') > 0
      && cod.indexOf('data-pv3-novo="telefone"') > 0
      && /\[\['instagram', 'Instagram'\], \['mapa', 'Maps'\], \['rua', 'rua'\]\]/.test(cod),
    'a fonte é chip e não texto livre porque ela é medida depois — "novas → lead" por origem só existe com origem de nome fechado');

  /* ── 3 · O QUE ELE DIGITOU SOBREVIVE AO REDESENHO ───────────────────────────────── */
  checar('o que ele digitou sobrevive ao clique no chip',
    /if \(t && t\.getAttribute && t\.getAttribute\('data-pv3-novo'\) && PLV3\.st\.novo\) PLV3\.st\.novo\[t\.getAttribute\('data-pv3-novo'\)\] = t\.value;/.test(cod)
      && /if \(verbo === 'novofonte'\) \{ if \(st\.novo\) st\.novo\.fonte = arg \|\| 'rua'; return PLV3\.pintarFila\(\); \}/.test(cod),
    'o chip redesenha a fila e o redesenho reconstrói os inputs pelo estado: sem isto, digitar o nome e clicar em Instagram apaga o nome');

  /* ── 4 · UM ESCRITOR SÓ, COM DOIS DESTINOS ──────────────────────────────────────── */
  checar('a conta nova nasce pelo MESMO insert do mapa',
    /async function materializarLeadDoMapa\(poi, ownerId, fonte, destino\)/.test(cod)
      && /const r = await materializarLeadDoMapa\(poi, rep\.ownerId, fonte, 'municao'\);/.test(cod)
      && (cod.match(/from\('leads_prospeccao'\)\.insert/g) || []).length === 1,
    'dois inserts para a mesma tabela divergem nos campos na primeira mudança — e o dedupe vive nos campos');

  checar('e na munição ela nasce sem dia, não em rota sem dia',
    /status: paraMunicao \? 'atribuido' : 'na_rota',/.test(cod)
      && /data_rota: paraMunicao \? null : isoDate\(new Date\(\)\),/.test(cod),
    '`na_rota` sem `data_rota` é o estado que ninguém lê: os nove leitores comparam com HOJE');

  /* ── 5 · NÃO CRIA A MESMA CONTA DUAS VEZES ──────────────────────────────────────── */
  /* A REGRA É A RECUSA ANTES DE GRAVAR, e não a frase do aviso. A antiga exigia o texto
     'já está na sua munição'; em 23/09 o aviso passou a dizer ONDE a conta está (carteira,
     reciclagem ou munição) e a guarda reprovou o conserto que ela deveria proteger.
     Medido: `pl6CriarLead` tem de comparar o que ele digitou e SAIR com erro antes de
     chamar `materializarLeadDoMapa`. A checagem por execução está em
     scripts/testar-planejamento-carteira.js; aqui fica a ordem, que é estrutural. */
  const criarCod = (function () {
    const i = cod.indexOf('async function pl6CriarLead(');
    if (i < 0) return '';
    const j = cod.indexOf('\nasync function ', i + 10);
    return cod.slice(i, j < 0 ? cod.length : j);
  }());
  checar('pl6CriarLead foi encontrada', criarCod.length > 0,
    'sem a âncora a checagem abaixo mede o vazio');
  checar('a conta digitada é conferida antes de gravar',
    /prospeccaoNormalizarTexto[(]nome[)]/.test(criarCod)
      /* A BORDA DE PALAVRA SEM BARRA INVERTIDA: indexOf('jaTem') casa dentro de
         'jaTemDesligado', e a sabotagem que desliga a conferência passava verde — medido.
         A primeira correção usava \b e a barra invertida morreu no patch, virando
         caractere de controle dentro do arquivo. Classe de caracteres não escapa. */
      && criarCod.search(new RegExp("(^|[^A-Za-z])jaTem([^A-Za-z]|$)")) > 0
      && criarCod.search(new RegExp("(^|[^A-Za-z])jaTem([^A-Za-z]|$)")) < criarCod.indexOf('materializarLeadDoMapa'),
    'a conta digitada não passa pelo dedupe do servidor — sem a checagem, ele cria a mesma padaria toda vez que passar na porta dela');
  /* E A CARTEIRA ENTRA NA CONFERÊNCIA (23/09/26). Julyan: "se o lead já foi criado e está
     na carteira, NÃO PODE CRIAR DE NOVO E DUPLICAR". Antes olhava só leads_prospeccao, e
     o "Na Brasa" virou dois: Negociação em 16/09, Prospecção em 21/09, mesmo telefone. */
  checar('e a conferência enxerga a carteira, não só a base de prospecção',
    /meusNegociosAbertos\(rep\.ownerId\)/.test(criarCod),
    'negócio que já está no funil dele é carteira — criar de novo é o duplicado nascendo');

  /* ── 6 · A CIDADE VEM DO TERRITÓRIO, E O CAMPO DO REP É `name` ──────────────────── */
  checar('a cidade sai do território dele, lendo o campo certo',
    /const nomeDoRep = String\(\(rep && \(rep\.name \|\| rep\.nome\)\) \|\| ''\);/.test(cod)
      && /String\(x\.rep \|\| ''\) === nomeDoRep/.test(cod),
    'DATA.reps usa `name` e DATA.usuarios usa `nome`: ler só `nome` fazia a conta nascer sem cidade, com o território dele declarado no arquivo');

  /* ── 7 · A LISTA RECARREGA, SENÃO ELE CRIA DE NOVO ──────────────────────────────────
     A primeira versão desta guarda media o arquivo INTEIRO: `typeof carregarProspeccao`
     aparece em outros quatro pontos do template, então ela dava verde com a recarga
     apagada daqui. A sabotagem pegou. Agora ela mede DENTRO de pl6CriarLead. */
  const corpoCriar = (function () {
    const i = cod.indexOf('async function pl6CriarLead(rep, campos) {');
    if (i < 0) return '';
    /* 20/11/26: pl6Carregar não é mais a vizinha de baixo; o corpo vai até o fecho na coluna 0 */
    const f = cod.indexOf('\n}\n', i);
    return f < 0 ? '' : cod.slice(i, f + 2);
  }());
  checar('a munição recarrega depois de criar, dentro do escritor',
    corpoCriar.length > 200
      && /if \(typeof carregarProspeccao === 'function'\) \{[\s\S]{0,200}?await carregarProspeccao\(\);/.test(corpoCriar)
      && /onde: 'na sua munição'/.test(corpoCriar),
    'sem recarregar, a conta gravada não aparece na lista e ele cria a mesma de novo');
}());


/* 20/11/26: a BUSCA POR NOME NA MUNIÇÃO (o campo, a paginação de 6, o foco que volta ao campo)
   era da tela v2, que saiu. A regra — a busca olha a fila inteira, antes de qualquer recorte —
   continua na v3 e é executada em testar-planejamento-carteira (PLV3.linhasDoFiltro). */
/* ══ O VAZIO DA BUSCA EXPLICA O VAZIO, E A BUSCA ACHA O QUE JÁ ESTÁ NO PLANO (11/09/26) ══
   Julyan: "marco cadastrou no cockpit o lead barraca do biel e eu tento pesquisar ele e
   nao aparece". Medido: o negócio existia e JÁ ESTAVA NA GRADE — a busca herdava o corte
   de quem falta planejar e dizia que a conta não existia.
   20/11/26: o desenho da v2 (data-pl6-ir-no-plano, o vazio da munição) saiu com a tela; as
   duas regras continuam, agora na v3 (PLV3.vazioHTML, D.noPlano, PLV3.noPlanoHTML). */
(function () {
  const cod = tpl.replace(/[/][*][\s\S]*?[*][/]/g, ' ');
  const corpo = function (nome) { const i = cod.indexOf('\nPLV3.' + nome + ' = '); return i < 0 ? '' : cod.slice(i, cod.indexOf('\n};\n', i)); };
  const vazio = corpo('vazioHTML'), dados = corpo('dados'), noPlano = corpo('noPlanoHTML'), acao = corpo('acao');

  checar('a busca sem resultado diz de quando e a carga',
    /DATA\.hubspotUpdatedAtFmt \? ' \(carga de ' \+ DATA\.hubspotUpdatedAtFmt \+ '\)'/.test(vazio)
      && vazio.indexOf('Conta criada depois desta leitura entra na próxima.') > 0,
    'zero sem data afirma que a conta nao existe, quando ela so nasceu depois desta leitura');
  checar('e oferece o gesto que resolve, ligado num verbo que existe',
    vazio.indexOf('data-pv3-acao="dadonovo"') > 0 && vazio.indexOf('data-pv3-acao="novo:busca"') > 0
      && /if \(verbo === 'dadonovo'\) return PLV3\.dadoNovo\(\);/.test(acao)
      && /\nPLV3\.dadoNovo = /.test(cod),
    'botao no vazio sem ouvinte seria o clique morto que esta tela existe para nao ter');
  checar('e o vazio SEM busca continua curto, e diz qual zero é',
    /PLV3\.VAZIOS\[st\.filtro\] \|\| 'Nada neste filtro\.'/.test(vazio) && /\nPLV3\.VAZIOS = \{/.test(cod),
    'quando ele so trocou de filtro, a frase longa seria ruido — e um zero sem nome é o zero que tranquiliza');

  checar('a busca olha TODAS as contas, e nao so as que faltam planejar',
    /if \(!naGrade\[l\.id\] \|\| !PLV3\.casaBusca\(qk, PLV3\.chaveDaConta\(l\)\)\) return;/.test(dados)
      && /todos\.forEach\(function \(l\) \{/.test(dados),
    'a fila corta quem ja esta na grade; a busca herdava o corte e dizia que a conta nao existe');
  checar('e diz o dia e a hora em que ela ja esta, e leva até o dia',
    noPlano.indexOf('já no seu plano') > 0 && /data-pv3-acao="irdia:' \+ p\.di \+ ':'/.test(noPlano)
      && /p\.quando/.test(noPlano) && /if \(verbo === 'irdia'\)/.test(acao),
    '"esta no plano" sem dia e hora manda ele procurar na grade inteira');
  checar('o card achado no plano NAO volta para a lista de arrastar',
    /const busca = st\.q \? todos\.filter\(function \(l\) \{ return !naGradeFutura\[l\.id\]; \}\)/.test(dados),
    'arrastar de novo o que ja esta no dia e que seria o erro');
}());


/* ══ A ETIQUETA DIZ DE ONDE A CONTA VEIO (11/09/26) ═══════════════════════════════════
   Visto NA PRODUCAO, testando o fluxo inteiro com a sessao do Marco: criei uma conta
   pelo formulario novo com fonte "rua", e o card saiu marcado "mais avaliados" — a
   etiqueta de quem veio do Google Places COM nota e avaliacoes. A conta nao tem nota
   nenhuma: foi digitada na rua.

   Causa minha, do mesmo dia: o formulario grava instagram/mapa/rua e pl6GrupoDaFonte so
   conhecia casa/ifood/trip — todo o resto caia no padrao `aval`. O padrao existe por um
   bom motivo (fonte nova aparece em vez de sumir da tela), e eu criei tres fontes novas
   sem declara-las.

   Etiqueta que mente sobre a origem muda a PRIORIDADE que o executivo da ao card. */
(function () {
  const semCom6 = function (s) { return String(s).replace(/[/][*][\s\S]*?[*][/]/g, ' '); };
  const cod = semCom6(tpl);

  checar('as tres fontes do formulario tem etiqueta propria',
    /instagram: \{ tag: 'achei no Instagram'/.test(cod)
      && /mapa: \{ tag: 'achei no Maps'/.test(cod)
      && /rua: \{ tag: 'achei na rua'/.test(cod),
    'sem etiqueta propria elas caem em "mais avaliados", que e de quem tem nota do Places');

  checar('e o agrupador as reconhece ANTES do padrao',
    cod.indexOf("if (f === 'instagram') return 'instagram';") > 0
      && cod.indexOf("if (f === 'rua') return 'rua';") > 0
      && cod.indexOf("if (f === 'rua') return 'rua';") < cod.indexOf("return 'aval';"),
    'declarada depois do padrao e o mesmo que nao declarada');

  checar('e o padrao continua existindo para a proxima fonte',
    cod.indexOf("return 'aval';") > 0,
    'fonte nova que ninguem declarou tem de aparecer, nao sumir da tela');
}());


(function () {
  const cod = tpl;
  /* ══ O CARD ABRE A FICHA DO NEGOCIO (14/09/26) ═══════════════════════════════════
     Julyan: "o executivo quando clicar no card do lead na aba planejamento, tem q abrir
     a ficha do card". Ate aqui o clique abria um painel interno do Planejamento — util,
     mas dali nao da para datar o proximo passo, mover de etapa nem gerar proposta.

     SO PARA CARD DE NEGOCIO: a municao tem `c-<dealId>` (tem ficha) e `n-<uuid>` (conta
     da prospeccao que ainda nao virou negocio, e nao tem). Para a segunda, e para negocio
     que a carga desta sessao nao conhece, o painel interno continua sendo a resposta — e
     isso e o oposto de abrir uma ficha vazia. */
  checar('o card de negócio do Planejamento abre a ficha de verdade',
    /* 28/09/26: o cliente (r-<negócio>, relacionamento) também tem ficha de negócio.
       20/11/26: o verbo é o da v3 (data-pv3-acao="ficha:"); o da v2 saiu com a tela. */
    cod.indexOf("const dealId = /^[cr]-/.test(arg) ? arg.slice(2) : null;") > -1
      && cod.indexOf("if (doFunil && typeof abrirFichaLeadFunilDrawer === 'function')") > -1,
    'o painel interno não data próximo passo nem move etapa — quem vem do Meu funil '
      + 'procura um botão que existe em outro lugar');

  checar('e a conta nova, que não tem negócio, não abre ficha vazia',
    cod.indexOf("const abre = c.tipoC && !c.fora && c.ref ? ' data-pv3-acao=\"ficha:' + e(c.ref) + '\"") > -1
      && cod.indexOf("(l.dealId ? '<div class=\"pv3-mini\"><button type=\"button\" data-pv3-acao=\"ficha:'") > -1,
    'abrir uma ficha vazia para conta sem negócio seria pior que nada');
}());

/* 20/11/26: O PAINEL DA MUNIÇÃO CONHECE A TELA (14/09/26) media a altura do painel da v2;
   a v3 cabe em 1280 × 768 por desenho (só a fila e o corpo de cada dia rolam) e saiu dela. */

if (falhas) {
  console.error(falhas + ' falha(s) — a cadeia de contas do Planejamento está errada.');
  process.exit(1);
}
console.log('planejamento: a cadeia de contas roda, o território sai das três fontes, e todo card é alcançável.');
