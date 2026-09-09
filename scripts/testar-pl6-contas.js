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

if (falhas) {
  console.error(falhas + ' falha(s) — a cadeia de contas do Planejamento está errada.');
  process.exit(1);
}
console.log('planejamento: a cadeia de contas roda, o território sai das três fontes, e todo card é alcançável.');
