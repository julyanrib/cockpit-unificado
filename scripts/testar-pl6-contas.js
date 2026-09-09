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

const CADEIA = ['pl6ChaveBairro', 'pl6RotuloBairro', 'pl6ChaveTerrLivre', 'pl6SemearTerrLivres',
  'pl6FontesCruas', 'pl6ContarTerrLivre',
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

/* ══════════════ A FICHA DO LEAD (prancha 6c) ══════════════════════════════════════════
   Quatro assercoes de FORMA. As tres primeiras vieram de defeitos meus nesta prancha, e a
   quarta guarda uma decisao do Julyan contra a propria prancha. */

/* 1. A GAVETA SAI DA TELA ANTES DO PAINEL.
   MEDIDO com elementFromPoint: com so `pl6Ficha = null`, o select do motivo do Perdido
   abria e quem estava no ponto dele era `.pl6-fi-v` — a ficha (z 70) cobrindo o painel
   (`.overlay`, z 50). O clique existia, o handler rodava, o painel abria, e o campo era
   INALCANCAVEL. Zerar a variavel nao tira nada do DOM; repintar tira.
   Esta assercao le o texto entre cada `pl6Ficha = null` e o `return` seguinte: se ele
   chama um `abrirPassagem*` ou `agendarNoSlot`, tem que haver um `await redesenhar()`
   no meio. */
(function () {
  const partes = tpl.split('pl6Ficha = null;').slice(1);
  let semRepintar = 0;
  partes.forEach(function (p) {
    const trecho = p.slice(0, 1400);
    const abrePainel = /return (abrirPassagem[A-Za-z]*|agendarNoSlot)\(/.test(trecho);
    if (!abrePainel) return;   /* o ✕ e o fechar terminam em redesenhar() e nao entram */
    const antes = trecho.split(/return (?:abrirPassagem[A-Za-z]*|agendarNoSlot)\(/)[0];
    if (antes.indexOf('await redesenhar()') < 0) semRepintar++;
  });
  checar('a ficha sai do DOM antes de abrir painel — nenhum `pl6Ficha = null` sem repintar',
    semRepintar === 0, semRepintar + ' caminho(s) abrem painel com a gaveta ainda na tela');
})();

/* 2. UMA FRASE SO PARA A PROXIMA MELHOR ACAO.
   A ficha usou `pl6Porque`, que responde "por que esta conta e candidata a este dia" e na
   ficha saiu como estado: "Visita · ha 9d · SLA! · Rua Lupicinio Rodrigues e regiao — fora
   da rota do dia". A acao mora em `pl6Motivo`, e o card le a MESMA. */
checar('pl6Motivo existe e e a fonte unica da proxima melhor acao',
  tpl.indexOf('function pl6Motivo(l) {') > 0);
checar('o card le pl6Motivo (nao tem copia da frase)',
  tpl.indexOf('const motivo = pl6Motivo(l);') > 0);
checar('a ficha NAO usa pl6Porque para a acao',
  tpl.indexOf("esc(pl6Porque(l, pl6RegioesDoPlano()") < 0);

/* 3. O ENDERECO DA FICHA NAO CAI NA REGIAO.
   `l.regiaoNome` e o ROTULO DA REGIAO, e a regiao leva o nome da rua do CENTROIDE dela.
   A ficha do Bistro de rua dizia "Rua Lupicinio Rodrigues e regiao" quando o endereco no
   HubSpot e "Estrada da Agua Grande". Campo vazio ele completa na visita; campo ERRADO
   ele descobre na porta da conta errada — e por isso o fallback e proibido, nao so
   corrigido. */
(function () {
  const i = tpl.indexOf('function pl6FichaHTML(');
  const corpo = i > 0 ? tpl.slice(i, i + 9000) : '';
  checar('a ficha monta o endereco sem cair em l.regiaoNome',
    corpo.indexOf('const endereco = [') > 0
    && corpo.slice(corpo.indexOf('const endereco = ['), corpo.indexOf('const endereco = [') + 420)
         .indexOf('regiaoNome') < 0);
  checar('a ficha busca o negocio bruto (senao jura que o telefone nao existe)',
    corpo.indexOf('brutoDoNegocio(l.dealId)') > 0);
})();
checar('brutoDoNegocio e uma funcao de topo, nao um local de uma tela so',
  tpl.indexOf('function brutoDoNegocio(dealId) {') > 0
  && tpl.indexOf('const brutoDoNegocio = function') < 0);
checar('brutoDoNegocio cai na reciclagem (os 48 do Bruno vem em lista separada)',
  /function brutoDoNegocio[\s\S]{0,900}leadsReciclagem60/.test(tpl));

/* 4. O PERDIDO PEDE O MOTIVO (04/09/26, Julyan).
   A prancha 6c pedia "Perdido sem trava: 1 clique limpa" e eu construi assim. O Julyan
   reverteu: "manter todas as propriedades do hubspot por etapa... o gestor precisa dos
   dados de tudo q e feito". E dele que sai a analise de perda e o bloco PERDIDOS · MES.
   Sem esta assercao, a proxima leitura da prancha desfaz a decisao dele em silencio. */
checar('o botao de perder entra pela porteira de etapa (pede motivo_do_perdido)',
  /class="pl6-fi-perder"[\s\S]{0,200}data-pl6-fi-etapa/.test(tpl));
checar('nao existe atalho de Perdido sem porteira na ficha',
  tpl.indexOf('data-pl6-fi-perder') < 0);
checar('a etapa Perdido continua exigindo o motivo',
  /'1396006164': \[[\s\S]{0,400}motivo_do_perdido[\s\S]{0,120}obrigatorio: true/.test(tpl));

/* 5. NAO SE AGENDA NO PASSADO.
   Numa sexta, os quatro primeiros dias da grade eram botao clicavel com "7 livres", e
   clicar criava tarefa no HubSpot datada na segunda anterior. Duas camadas: a ficha nao
   oferece, e a porta unica do agendar recusa. */
checar('pl6DiaPassou usa a hora de Brasilia, nao o relogio do aparelho',
  /function pl6DiaPassou[\s\S]{0,600}agendaChave\(agendaAgora\(\)\)/.test(tpl));
checar('a porta unica do agendar recusa dia que passou',
  /pl6AgendarNoSlot[\s\S]{0,4000}if \(pl6DiaPassou\(diaISO\)\)/.test(tpl));
checar('a ficha nao oferece dia que passou como botao',
  /if \(pl6DiaPassou\(d\.iso\)\)[\s\S]{0,300}pl6-fi-dia is-passou/.test(tpl));

/* 6. O HISTORICO DE TOQUES NASCE SEM DONO.
   O Julyan ja avisou que o Meu funil e o proximo a mostrar as interacoes do Expogo e do
   PWA. Se ela nascesse `pl6*`, a copia seria o caminho de menor esforco — e duas linhas
   do tempo que divergem na primeira mudanca de criterio e o defeito que esta semana
   inteira foi cacar. */
checar('historicoDeToquesHTML nao leva prefixo de tela no nome',
  tpl.indexOf('function historicoDeToquesHTML(') > 0
  && tpl.indexOf('function pl6HistoricoDeToques') < 0);
checar('o historico reusa touchpointsDoLead (nao remonta as fontes)',
  /function historicoDeToquesHTML[\s\S]{0,900}touchpointsDoLead\(/.test(tpl));
checar('o historico diz a fonte de cada toque (Expogo, PWA, HubSpot)',
  tpl.indexOf("HIST_FONTE_ROT = { expogo: 'Expogo', pwa: 'PWA', hubspot: 'HubSpot' }") > 0);


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

/* == A CAMADA ABSOLUTA DA MUNICAO (04/09/26, Julyan: "faz a camada absoluta entao, quero
   encaixado") ============================================================================
   MEDIDO ANTES: teto de viewport na lista -> 73px de vazio no pe da esquerda a 1440px.
   MEDIDO ANTES DISSO: flex:1 na lista -> coluna de 3983px, 3229px de vazio, porque com
   align-items:stretch a linha do grid sai do CONTEUDO do item mais alto e a lista flexivel
   media os 3707px dos cards. A lista nao pode derivar da coluna quando a coluna deriva da
   lista.
   MEDIDO DEPOIS DA CAMADA: 1280/1440/1760px, com 37 e com 48 cards, fim das duas colunas
   igual (diferenca 0) e a lista rolando (494 visiveis de 3707).
   As pecas abaixo sao o que sustenta isso, e cada uma sozinha desfaz o encaixe.
   SEM REGEX DE PROPOSITO: barra invertida morre no meu caminho de patch, e uma regex que
   chega sem as barras fica VALIDA e ERRADA — o ponto passa a casar qualquer caractere e a
   assertion fica verde medindo outra coisa. */
function pl6RegraCSS(nome) {
  const i = tpl.indexOf('\n  .' + nome + '{');
  if (i < 0) return null;
  return tpl.slice(i + nome.length + 5, tpl.indexOf('}', i));
}
(function () {
  const regraCaixa = pl6RegraCSS('pl6-lista-caixa');
  checar('a caixa da camada existe no CSS', regraCaixa !== null);
  const cxs = regraCaixa || '';
  checar('a caixa se posiciona (senao o inset:0 da lista sobe para a coluna)',
    cxs.indexOf('position:relative') > -1, cxs);
  checar('a caixa cresce com basis 0 (com basis auto o navegador ainda mede o conteudo)',
    cxs.indexOf('flex:1 1 0') > -1, cxs);
  checar('o piso de altura e da CAIXA, e nao da lista absoluta (onde nao teria efeito)',
    cxs.indexOf('min-height:240px') > -1, cxs);

  const lst = pl6RegraCSS('pl6-lista') || '';
  checar('a lista flutua na camada', lst.indexOf('position:absolute') > -1, lst);
  checar('e ocupa a caixa inteira', lst.indexOf('inset:0') > -1, lst);
  checar('a lista NAO tem mais teto de viewport (era ele que deixava vazio na esquerda)',
    lst.indexOf('max-height') < 0, lst);

  /* NO EMPILHADO A CAMADA SE DESFAZ: sem coluna vizinha nao ha de quem herdar altura, e a
     camada congelaria a lista nos 240px do piso. Medido a 1000px: static nas duas. */
  /* A ANCORA E A REGRA DO PL6, E NAO "@media 1050px": o template tem QUATRO blocos de
     1050px e o primeiro deles nao e desta tela — eu ancorei no @media e a fatia saiu com
     zero caractere, deixando duas assertions vermelhas por medirem o bloco errado. */
  const iUm = tpl.indexOf('.pl6-corpo{grid-template-columns:minmax(0,1fr);}');
  const bloco = tpl.slice(iUm, iUm + 900);
  checar('a ancora do empilhado nao se perdeu', iUm > -1 && bloco.length > 80,
    'bloco de ' + bloco.length + ' chars');
  checar('no empilhado a caixa volta ao fluxo',
    bloco.indexOf('.pl6-lista-caixa{position:static') > -1);
  checar('no empilhado a lista volta ao teto de viewport',
    bloco.indexOf('.pl6-lista{position:static;max-height:min(62vh') > -1);

  /* O MARKUP: a caixa envolve SO a lista. Se envolvesse o rodape, ele ficaria por baixo da
     camada — medido: fim da caixa 1021px, topo do rodape 1029px, sem sobreposicao. */
  const iCaixa = tpl.indexOf('<div class="pl6-lista-caixa">');
  checar('a caixa e emitida no markup', iCaixa > -1);
  const iFecha = tpl.indexOf("+     '</div>'", tpl.indexOf('pl6-sug-vazio'));
  const iRodape = tpl.indexOf('<div class="pl6-rodape-lista">');
  checar('o rodape da lista fica FORA da camada (senao ele some por baixo dela)',
    iFecha > -1 && iRodape > iFecha && iCaixa > -1 && iCaixa < iRodape,
    'caixa ' + iCaixa + ' fecha ' + iFecha + ' rodape ' + iRodape);
})();

/* ══ A SEMANA SEM HORÁRIO PRÉ-DEFINIDO (09/09/26) ═══════════════════════════════════
   Julyan: "não queor horários pré definidos, eles tem q definir o horario no
   planejamento" · "olha como ta hoje, deixar isso perfeito".

   MEDIDO na tela antes de mexer: numa semana vazia a grade rendia 35 linhas de
   "HH:MM · livre" — 1.330px somados, 100% cromo. E o crachá de etapa recebia 11px numa
   linha de 131 (precisava de 80), saindo "PROSPE…", "NEGOCI…" na foto dele. */
(function () {
  function ter(s) { return tpl.indexOf(s) > -1; }

  /* A HORA NÃO SE INVENTA. Era `return PL6_HORAS[si]` quando não havia hora escolhida:
     a tela anunciava 10:30 para uma visita que ninguém marcou às 10:30. */
  const hora = pegarFn('pl6SlotHora');
  checar('pl6SlotHora não cai na faixa quando não há hora escolhida',
    /if \(v && typeof v === 'object' && v\.hora\) return String\(v\.hora\);/.test(hora)
    && /return '';/.test(hora) && hora.indexOf('PL6_HORAS[si]') < 0,
    'hora inventada parece combinada, e o executivo chega às 10:30 onde esperam por ele às 14:00');

  /* e a faixa continua disponível, com nome próprio, para as duas Dailies — que ainda
     organizam o dia por posição e são o próximo passo */
  checar('a faixa vira relógio só em pl6HoraDaFaixa',
    ter('function pl6HoraDaFaixa(si) {')
    && /pl6SlotHora\(v, si\) \|\| pl6HoraDaFaixa\(si\)/.test(tpl),
    'as Dailies leem a grade por posição; sem este fallback elas perdem o horário do dia');

  /* OS VAZIOS COLAPSAM: só o primeiro de cada dia desenha */
  checar('os slots vazios colapsam numa linha por dia',
    ter("if (si !== primeiroVazio) return '';")
    && ter('+ escolher conta')
    && ter('const primeiroVazio = vaziosDoDia.length ? vaziosDoDia[0] : -1;'),
    'eram 35 linhas de "HH:MM · livre" e 1.330px de cromo numa semana vazia');

  /* A expressão mudou em 09/09 (as vagas passaram a ter duas espécies: limpa e órfã, e a
     órfã entra por último), e a REGRA não: a conta é feita UMA vez, antes do laço.
     Duas correções de cegueira nesta guarda, além da expressão:
       · ela cravava `const vaziosDoDia = []`, o texto exato de ontem;
       · `indexOf(a) < indexOf(b)` é VERDADE quando `a` não existe (-1 < qualquer coisa),
         então ela passava sem medir nada se a âncora se perdesse. Agora as duas posições
         precisam existir. */
  (function () {
    const iVazios = tpl.indexOf('const vaziosDoDia =');
    const iLaco = tpl.indexOf('const slots = ordem.map');
    checar('e a contagem de vazios é feita antes do laço, não dentro',
      iVazios > -1 && iLaco > -1 && iVazios < iLaco
        && /const limpos = \[\];[\s\S]{0,600}const vaziosDoDia = limpos\.concat\(orfaos\);/.test(tpl),
      '"é o primeiro vazio?" resolvido dentro do laço é a conta que sai errada quando alguém reordena');

    /* ══ A CONTA FORA DA CARGA É VAGA, NÃO CARTÃO ═══════════════════════════════════
       Julyan, olhando a tela: "nao quero esse nome 'conta saiu da sua base' nao precisa,
       só os slots vazios" — e o mockup do kanban não tem esse cartão nem linha de vaga
       vazia: cartões, e depois um "+ escolher conta". */
    checar('conta fora desta carga não desenha cartão no kanban',
      !/pl6-slot-quem">conta saiu da sua base/.test(tpl)
        && !/pl6-slot-tag" style="color:var\(--pl6-bloqueio\);">saiu da base/.test(tpl),
      'a casca do cartão ocupava a altura de uma visita para dizer que ali não há visita');

    checar('e ela também não conta como ocupação do dia',
      /const n = col\.filter\(x => \{ const id = pl6SlotId\(x\); return id && porId\.has\(id\); \}\)\.length;/.test(tpl),
      'contador em 11/15 com nove cartões na tela é diferença sem explicação visível');

    checar('a vaga de conta fora da carga é a última a ser preenchida',
      /if \(!id\) limpos\.push\(k\);\s*\n\s*else if \(!porId\.has\(id\)\) orfaos\.push\(k\);/.test(tpl),
      'trocar a região de ataque transforma visita planejada em órfã; sobrescrevê-la antes'
      + ' das vagas limpas apagaria um plano que volta na próxima carga');
  }());

/* ══ O KANBAN REDESENHADO (09/09/26, prancha kanban-planejamento) ════════════════════
   "Cirurgia visual: redesenhe APENAS o kanban semanal do Planejamento." As checagens
   abaixo substituem as do desenho de algumas horas antes — o input `--:--` + ✓ virou
   sete chips, e o crachá de etapa VOLTOU para a linha da hora, porque a geometria mudou:
   a pill da hora é estreita e o ✕ encolheu de 38px para 20. */

  /* O HORÁRIO É DELE, EM UM TOQUE: os sete chips no lugar do input */
  checar('o seletor de hora é chip, não input de relógio',
    ter('data-pl6-hora-slot=') && ter('data-pl6-hora-set=') && ter('data-pl6-hora-limpar=')
    && !ter('data-pl6-hora-campo=') && !ter('data-pl6-hora-salvar='),
    'a prancha manda remover o input --:-- + ✓: digitar quatro dígitos onde um toque resolve');

  checar('e as sete janelas do chip saem de PL6_HORAS',
    /const chips = PL6_HORAS\.map\(function \(h\)/.test(tpl),
    'segunda lista de horários é a divergência que ninguém vê — as janelas são uma declaração só');

  /* OCUPADO NO DIA = APAGADO E SEM CLIQUE. Sem isto ele marca dois clientes às 10:30 e
     descobre na rua. E "sem clique" é `<span>`, não botão apagado: botão desabilitado que
     ainda dispara é o que produz a visita dupla. */
  checar('a janela já tomada no dia não é clicável',
    /const horasTomadas = \{\};/.test(tpl)
    && /const ocupada = ocupadaPor != null && ocupadaPor !== si;/.test(tpl)
    && /if \(ocupada\) \{\s*\n\s*return '<span class="pl6-hora-chip is-ocupado"/.test(tpl),
    'a prancha pede "ocupado no dia = apagado (sem clique)" — dois clientes na mesma hora '
    + 'só aparecem na rua');

  checar('e só a hora ESCOLHIDA ocupa janela',
    /const h = pl6SlotHora\(col\[k\], k\);\s*\n\s*if \(h\) horasTomadas\[h\] = k;/.test(tpl),
    'posição sem hora não ocupa relógio nenhum desde que a faixa deixou de ser hora — '
    + 'contá-la apagaria as sete janelas de um dia com sete visitas sem hora');

  checar('os verbos da hora estão no seletor da delegação',
    ter('[data-pl6-hora-slot],[data-pl6-hora-set],[data-pl6-hora-limpar],'),
    'verbo fora do seletor é clique morto: o botão existe e o handler nunca roda');

  /* A HORA LIVRE NÃO SE PERDEU. Os chips são atalho, não prisão: o painel de
     "+ escolher conta" continua com o campo de hora arbitrária, e é de lá que veio o
     {id, hora:"14:20"} que já está no banco. Se ele sair, 14:20 deixa de ser possível. */
  checar('a hora arbitrária continua possível pelo painel de conta',
    ter('function pl6HoraLivreHTML(') && ter("pl6HoraLivreHTML('__slot'"),
    'os chips cobrem as sete janelas; 15:40 se digita no painel, e há hora fora da grade no banco');

  /* ESTA CHECAGEM NASCEU DE UM DEFEITO MEU. Eu chamei `renderPlanejamento6a()` sem
     argumento no handler; a função é `renderPlanejamento6a(rep)` e sem o rep ela morre
     dentro de pl6Regioes. O clique disparava, o handler entrava, a exceção subia, e nada
     acontecia. Guarda nenhuma pegaria — a chamada existe e o nome está certo. */
  const iHora = tpl.indexOf('if (d.pl6HoraSlot) {');
  const iFim = tpl.indexOf('if (d.pl6Remover) {', iHora);
  /* SEM OS COMENTÁRIOS: o meu próprio comentário no ramo CITA
     "renderPlanejamento6a()" como o que não se deve fazer, e a checagem reprovava o
     conserto por causa da nota que o explica. Sexta vez nesta base — por isso a suite
     inteira devia ler `codigo` e não `tpl`, e é o que este recorte faz localmente. */
  const ramo = (iHora > -1 && iFim > iHora)
    ? tpl.slice(iHora, iFim).replace(/\/\*[\s\S]*?\*\//g, ' ') : '';
  checar('o handler da hora redesenha pelos ganchos da tela',
    ramo.length > 0 && ramo.indexOf('await redesenhar()') > -1
    && ramo.indexOf('await mutar(') > -1
    && ramo.indexOf('renderPlanejamento6a()') < 0,
    'renderPlanejamento6a() sem o rep estoura dentro de pl6Regioes — clique vivo, nada acontecendo');

  /* AS DUAS PRESENÇAS EXIGIDAS. `a.indexOf(x) < a.indexOf(y)` devolve TRUE quando x NÃO
     EXISTE, porque indexOf dá -1 e -1 é menor que tudo: sabotei trocando a leitura do
     campo por `nova = ''` e a checagem passou VERDE. Terceira vez que este mesmo erro me
     pega hoje. */
  const antesDe = function (texto, a, b) {
    const ia = texto.indexOf(a), ib = texto.indexOf(b);
    return ia > -1 && ib > -1 && ia < ib;
  };
  /* A HORA VEM DO ATRIBUTO DO CHIP, e o split é POR POSIÇÃO. "di.si.HH:MM" tem ponto no
     meio e dois-pontos na hora: `split('.').slice(2).join('.')` devolve a hora inteira,
     e um `split('.')[2]` cru devolveria "10" de "10:30" se alguém trocasse o separador. */
  /* A PREMISSA DESTA GUARDA MUDOU EM 09/09, POR PEDIDO DELE: "o executivo tem q poder
     escolher o horário, coloque um mini marcador de relogio BONITO". Voltou a existir um
     campo — só para o mostrador, ao lado dos chips.
     O que ela protege continua igual em duas coisas, e ganha uma terceira:
       · a hora do CHIP vem do atributo dele, não de campo nenhum;
       · o split é POR POSIÇÃO, senão "10:30" perde os minutos;
       · e a hora DIGITADA é validada antes de gravar — hora inválida virando a hora da
         faixa em silêncio manda ele para a rua num horário e deixa o cliente em outro. */
  checar('a hora do chip vem do atributo, e a do mostrador é validada',
    ramo.indexOf("const bruto = String(d.pl6HoraSet || d.pl6HoraLimpar || d.pl6HoraLivre);") > -1
    && ramo.indexOf("partes.slice(2).join('.')") > -1
    && /if \(d\.pl6HoraLivre\) \{[\s\S]{0,400}data-pl6-relogio-in[\s\S]{0,300}\{1,2\}:\\d\{2\}\$\/\.test\(nova\)/.test(ramo)
    && ramo.indexOf('data-pl6-hora-campo') < 0,
    'o chip carrega a escolha no próprio atributo; o mostrador tem campo, e campo sem'
    + ' validação grava a hora errada em silêncio');

  /* ══ O MOSTRADOR DE RELÓGIO ═══════════════════════════════════════════════════════
     Julyan: "coloque um mini marcador de relogio BONITO, por favor." Três coisas o
     fazem ser um marcador e não um campo, e as três são medíveis. */
  checar('o mostrador existe e o ponteiro das horas anda com os minutos',
    /function pl6RelogioSVG\(hora\)/.test(tpl)
    && /const angH = hh \* 30 \+ mm \* 0\.5;/.test(tpl),
    'ponteiro que pula de hora em hora aponta 10:00 às 10:59 — relógio que mente em 34px'
    + ' é pior que nenhum');

  checar('os ponteiros seguem a digitação sem redesenhar a tela',
    /const relIn = ev\.target\.closest\('\[data-pl6-relogio-in\]'\);/.test(tpl)
    && /casca\.innerHTML = pl6RelogioSVG\(relIn\.value\)/.test(tpl),
    'redesenhar recria o campo e o cursor sai dele no meio da digitação — a mesma razão'
    + ' pela qual a busca de região filtra no DOM');

  checar('e o "marcar ▸" do mostrador está no seletor delegado',
    /\[data-pl6-hora-livre\]/.test(tpl) && /data-pl6-hora-livre="' \+ ref \+ '"/.test(tpl),
    'botão fora da lista de alvos tem hover e não faz nada: é o clique morto que essa'
    + ' lista existe para não ter');

  checar('"sem hora" volta a string simples, não um objeto com hora vazia',
    /g\[di\]\[si\] = nova \? \{ id: id, hora: nova \} : id;/.test(tpl),
    'um { id, hora: "" } seria um terceiro estado equivalente, com uma forma a mais para entender');

  /* ══ O CRACHÁ VOLTOU PARA A LINHA DA HORA, e isto NÃO desfaz o conserto de hoje ═════
     De manhã eu o desci porque ele recebia 11px de 80 numa linha de 131 — medido com
     estilo computado. A prancha o põe de volta ao lado da hora, e agora cabe porque a
     GEOMETRIA mudou: a pill da hora é estreita (era o botão "definir hora" de 70px) e o ✕
     encolheu de 38px para 20. O que resolveu foi a aritmética da linha, não o lugar do
     crachá — por isso a checagem cobra o corte por reticência, que é o que impede o
     "PROSPE…" voltar se alguém alargar a hora outra vez. */
  checar('o crachá de etapa está na linha 1 e corta por reticência',
    tpl.indexOf("'<span class=\"pl6-slot-tag\" style=\"color:' + cor + ';\">' + esc(tag) + '</span>'\n"
      + "          /* O ✕ PARA A PROPAGACAO na fiacao") > -1
    && /\.pl6-slot-tag\{[^}]*text-overflow:ellipsis/.test(tpl),
    'ele cabe porque a pill da hora é estreita e o ✕ foi de 38px para 20 — sem a reticência, '
    + 'basta alguém alargar a hora para voltar o "PROSPE…"');

  checar('o ✕ do card é 20px, não 38',
    /\.pl6-slot-x\{[^}]*width:20px/.test(tpl),
    'é o que abriu espaço para o crachá voltar à linha 1');

  /* O TRILHO DE ETAPA É FAIXA INTERNA, e não border-left: borda não respeita o raio, e os
     5px vazavam nos cantos do card. */
  checar('o trilho de etapa é faixa interna, dentro do raio',
    ter('.pl6-slot-trilho{') && ter('<span class="pl6-slot-trilho" aria-hidden="true"></span>')
    && !/\.pl6-slot-cheio\{[^}]*border-left:5px/.test(tpl),
    'border-left não respeita border-radius: os 5px vazavam e o card parecia ter um bico');

  checar('e a cor da etapa chega por variável, para o hover usá-la',
    ter("style=\"--pl6-et:' + cor + ';\"")
    && /\.pl6-slot-cheio:hover\{border-color:var\(--pl6-et/.test(tpl),
    'seis etapas em seis classes seria o de/para espalhado; a cor é dado e vem inline');

  /* ══ A BARRA DE CAPACIDADE ═══════════════════════════════════════════════════════ */
  /* o nome dizia "7 segmentos" e o mecanismo sempre foi PL6_SLOTS — depois de "pode
     colocar 15 contas no dia uai" o número no nome passou a mentir sobre o que a guarda
     mede. Nome cravado em número envelhece; o mecanismo não. */
  checar('a capacidade é uma barra com um segmento por vaga, e o contador ao lado',
    ter('.pl6-cap-seg{') && ter('.pl6-cap-seg.is-cheio{')
    && /for \(let k = 0; k < PL6_SLOTS; k\+\+\) \{\s*\n\s*capSegs\.push/.test(tpl),
    'substitui o "0/7" solto: a barra diz a forma, que é o que se lê de longe em 5 colunas');

  checar('e o contador tem três estados, sem zero acusatório',
    /const cntCls = n >= PL6_SLOTS \? ' is-cheio' : \(n > 0 \? ' is-parcial' : ''\);/.test(tpl)
    && /\.pl6-col-cnt\{[^}]*color:#B4AC9C/.test(tpl),
    'dia vazio é cinza — é segunda de manhã, não falha; começado é âmbar, cheio é verde');

  /* ══ A ORDEM DE LEITURA ══════════════════════════════════════════════════════════ */
  checar('os cards com hora vêm primeiro, em ordem',
    /const ordem = \[\];/.test(tpl) && /ordem\.sort\(function \(a, b\)/.test(tpl)
    && /if \(ha && hb && ha !== ha\.constructor/.test(tpl) === false
    && /if \(ha && hb && ha !== hb\) return ha < hb \? -1 : 1;/.test(tpl),
    'desde que a posição deixou de ser relógio, a ordem de ARMAZENAMENTO não é a do dia: '
    + '14:20 na posição 0 e 09:00 na 3 mostrariam a tarde antes da manhã');

  checar('e a ordenação é da LEITURA, não da grade gravada',
    /const slots = ordem\.map\(\(si\) => \{/.test(tpl)
    && !/grade\[di\]\s*=\s*ordem/.test(tpl),
    'reordenar a grade mudaria o que a Daily e a tela do gestor leem por posição — a ordem '
    + 'é "não mexa em nenhuma lógica de dados"');

  checar('o dia cheio troca o botão por "dia cheio ✓"',
    ter('<span class="pl6-dia-cheio">dia cheio ✓</span>')
    && /vagasDoDia === 0 \?/.test(tpl),
    'sem vaga não há o que clicar, e botão que não faz nada é clique morto');

  /* O CABEÇALHO FALA DE VAGAS, NÃO DE HORÁRIOS */
  checar('o cabeçalho não promete horários',
    !ter('A semana — 5 dias · 9h→19h') && !ter(" horários livres'")
    && ter('A semana — 5 dias'),
    'a semana tem VAGAS; o horário de cada visita é o que ele combina com o cliente');

  /* E O `+` DUPLO NÃO VOLTA. Aconteceu nesta entrega: uma junção quebrada em duas linhas,
     a segunda começando com `+`, virou MAIS UNÁRIO sobre string — e o cabeçalho saiu
     "nenhuma visita no plano aindaNaN". Build verde, 37 suites verdes, só a tela mostrou. */
  const linhas = tpl.split('\n');
  const duplos = [];
  for (let i = 1; i < linhas.length; i++) {
    const ant = linhas[i - 1].trimEnd();
    const cur = linhas[i].trim();
    if (ant.endsWith('+') && /^\+\s*\(/.test(cur)) duplos.push(i + 1);
  }
  checar('nenhuma junção com "+" duplo (mais unário sobre string = NaN)',
    duplos.length === 0,
    'linha(s) ' + duplos.join(', ') + ' — foi assim que o cabeçalho saiu "...aindaNaN"');
}());

/* ══ A HORA É ESCOLHA DELE, E A FAIXA É OFERTA ═════════════════════════════════════
   Julyan: "não queor horários pré definidos, eles tem q definir o horario no
   planejamento" + "pode colocar 15 contas no dia uai" + "tudo na mesma sincronia".

   O defeito que estas guardas travam entrou por CINCO portas no mesmo dia, sempre com
   build e 37 suítes verdes: a posição na coluna voltando a valer como horário. Kanban,
   Daily do gestor, Minha Daily, os caminhos de gravação e os toasts. Cada porta parecia
   um detalhe; juntas, faziam três telas discordarem do mesmo dia — e quem apanha na
   rodada é o executivo, que vê "+ hora" enquanto o gestor lê 19:00 em voz alta. */
(function () {
  /* OS COMENTÁRIOS SAEM ANTES DA CONTAGEM. Três blocos de comentário CITAM o trecho
     `PL6_HORAS[si]` para explicar por que ele saiu do código — e a primeira versão desta
     guarda contava as citações como ocorrências, reprovando o arquivo correto. É a sexta
     vez neste projeto que uma guarda minha lê o próprio comentário; a correção é sempre a
     mesma e é esta linha. Detectar "está em comentário" por marcador na mesma linha não
     funciona: dentro de um bloco de comentário as linhas do meio não têm marcador nenhum
     — e escrever o par de marcadores aqui para explicar isso fecharia este comentário no
     meio, que é como esta linha derrubou a suíte na primeira tentativa. */
  const semCom = tpl.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const cruas = (semCom.match(/(?:PL6_HORAS|D7_HORAS)\[si\]/g) || []).length;
  checar('a posição só vira relógio dentro de pl6HoraDaFaixa',
    /function pl6HoraDaFaixa\(si\) \{\s*return PL6_HORAS\[si\] \|\| '';/.test(semCom)
      && cruas === 1,
    cruas + ' indexação(ões) crua(s) da lista de faixas (a legítima é a de dentro de'
    + ' pl6HoraDaFaixa) — fora dela a lista devolve undefined para si >= 7'
    + ' ("qui 11/09 undefined bloqueado") e reinventa hora que ninguém escolheu');

  checar('o slot ocupado só tem a hora que ele escolheu',
    /const ocupado = !!pl6SlotId\(v\) \|\| pl6SlotBloqueado\(v\) \|\| pl6SlotRua\(v\);/.test(tpl)
      && /const hora = ocupado \? pl6SlotHora\(v, si\) : pl6HoraDaFaixa\(si\);/.test(tpl),
    'era pl6SlotHora(v,si) || pl6HoraDaFaixa(si): a Minha Daily dizia 19:00 onde o kanban'
    + ' dele dizia "+ hora" para a mesma visita');

  checar('a Minha Daily percorre as vagas do dia, não as sete faixas',
    /const totalSlots = \(typeof PL6_SLOTS !== 'undefined'\) \? PL6_SLOTS : D7_HORAS\.length;/.test(tpl)
      && !/return D7_HORAS\.map\(function \(horaFaixa, si\)/.test(tpl),
    'com capacidade 15 e laço de 7, ele monta 11 contas no kanban e abre a Daily com 7');

  checar('a hora escolhida vai para o banco sem comparar com a faixa',
    /grade\[di\]\[si\] = hora \? \{ id: idNaGrade, hora: String\(hora\) \} : idNaGrade;/.test(tpl)
      && /const valorDoSlot = horaEscolhida \? \{ id: l\.id, hora: horaEscolhida \} : l\.id;/.test(tpl),
    'gravar a hora só quando difere da faixa apaga a hora de quem escolheu 10:30 na'
    + ' posição cuja faixa era 10:30 — e nenhuma tela a reinventa de volta agora');

  checar('a capacidade do dia é uma constante, não o tamanho da lista de janelas',
    /const PL6_SLOTS = 15;/.test(tpl) && !/const PL6_SLOTS = PL6_HORAS\.length;/.test(tpl),
    'amarrar capacidade à lista de janelas fez "7 contas por dia" parecer regra de'
    + ' produto quando era o tamanho de um array');

  checar('a vaga sem janela não desenha linha própria na Minha Daily',
    /if \(!l\.hora\) return '';[\s\S]{0,200}data-d7-abrir/.test(tpl)
      && /mais ' \+ semJanela\.length \+ ' vagas sem hora marcada/.test(tpl),
    'quinze linhas "livre" idênticas num dia em branco escondem a visita real no meio'
    + ' delas — é o cromo de vaga vazia que saiu do kanban e da Daily do gestor');
}());

/* ══ A FICHA DO CARD ═══════════════════════════════════════════════════════════════
   Julyan: "o ideal é deixar todas as fichas dos cards com mais informação, preservando
   a identidade visual dos cards".

   As duas regras que fazem "mais informação" não virar "mais altura": campo de
   preenchimento alto tem linha fixa com nota honesta; campo de preenchimento baixo só
   nasce com conteúdo. Medido nas 1.985 linhas de leads_prospeccao antes de decidir:
   nome/endereço/bairro/cidade/coordenada 100%, CNPJ e abertura 82%, categoria/nota/
   horário 13-15%, telefone 14%, socio 3 LINHAS, delivery ZERO. */
(function () {
  const ficha = pegarFn('pl6FichaHTML');

  checar('a ficha tem campo que só nasce com conteúdo',
    /function pl6FichaCampoSeTem\(rot, valor\) \{\s*\n\s*if \(valor == null \|\| String\(valor\)\.trim\(\) === ''\) return '';/.test(tpl),
    'dez linhas de "não veio da fonte" ocupam a ficha inteira para informar nada, e'
    + ' empurram para baixo o telefone e o próximo passo, que são o que ele usa');

  /* ══ HTML NA NOTA SÓ QUANDO QUEM CHAMA DECLARA ═══════════════════════════════════
     Em 09/09 eu pus os links do Google e da rota na nota do campo vazio e a nota passa
     por esc(): a ficha imprimiu <a class="pl6-fi-link" ...>buscar no Google</a> como
     TEXTO, no meio da gaveta. Build e 37 suítes verdes — nenhuma abre a ficha. Quem
     contou foi ler o innerText no navegador. */
  checar('a nota do campo vazio escapa por padrão, e só não escapa quem declara',
    /function pl6FichaCampo\(rot, valor, porque, notaEhHtml\)/.test(tpl)
      && /\? \(notaEhHtml \? nota : esc\(nota\)\)/.test(tpl),
    'markup impresso como texto na ficha; e escapar de escapar por padrão abriria a'
    + ' porta para o nome do lead virar HTML');

  checar('e a linha do telefone é quem declara',
    /pl6FichaCampo\('Telefone', telHtml,\s*\n\s*'— não veio da fonte · ' \+ pl6FichaLinks\(l, bruto\), true\)/.test(ficha),
    'sem o quarto argumento os dois links do telefone vazio saem como texto cru');

  checar('os links do telefone vazio existem e levam a algum lugar',
    /function pl6FichaLinks\(l, bruto\)/.test(tpl)
      && /google\.com\/search\?q=' \+ busca/.test(tpl)
      && /google\.com\/maps\/dir\/\?api=1&destination='/.test(tpl)
      && /encodeURIComponent/.test(tpl),
    'o telefone falta em 86% das contas-alvo porque a API da fonte não devolve número —'
    + ' "preencher na visita" sozinho descreve o problema e deixa ele sem saída');

  checar('e eles não aparecem duas vezes na mesma ficha',
    /\(tel \? pl6FichaCampo\('Como chegar', pl6FichaLinks\(l, bruto\), ''\) : ''\)/.test(ficha),
    'os mesmos dois links na linha do telefone e na de baixo é moldura, não informação');

  /* ══ RÓTULO QUE VIVE VAZIO NÃO ENTRA ═════════════════════════════════════════════
     `socio` tem 3 linhas preenchidas em 1.985 e `delivery` tem zero (medido). Um campo
     desses na ficha é o zero que tranquiliza: o executivo lê "sem sócio informado" e
     entende que a conta não tem sócio, quando a fonte é que não conta. */
  checar('a ficha não ganha rótulo de campo que vive vazio',
    !/pl6FichaCampo(?:SeTem)?\('Sócio'/.test(ficha) && !/pl6FichaCampo(?:SeTem)?\('Delivery'/.test(ficha),
    'socio 3 linhas em 1.985 e delivery zero: rótulo vazio informa menos que ausência');

  checar('a frase da fonte fala do que falta NESTA conta',
    /if \(!tel\) faltam\.push\('telefone'\);/.test(ficha)
      && /if \(l\.nota == null\) faltam\.push\('nota'\);/.test(ficha),
    'a primeira versão dizia sempre "esta fonte não traz nota nem telefone" — e eu vi'
    + ' isso numa ficha que mostrava nota e telefone logo acima');
}());

if (falhas) {
  console.error(falhas + ' falha(s) — a cadeia de contas do Planejamento está errada.');
  process.exit(1);
}
console.log('planejamento: a cadeia de contas roda, o território sai das três fontes, e todo card é alcançável.');
