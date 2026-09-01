// lib/territorios.js
//
// QUEM É O DONO DE CADA CONTA-ALVO — uma fonte só (01/09/26).
//
// POR QUE ESTE ARQUIVO EXISTE: a tabela de territórios vivia dentro de
// api/importar-leads.js, e a partir de hoje ela é lida por três lugares diferentes —
// a importação (que dá dono a lead novo), a redistribuição dos leads que já estão na
// base sem dono, e o backfill semanal (que precisa saber quantas contas buscar por
// executivo). Três cópias da mesma regra é o começo de três verdades: alguém corrige o
// bairro num lado, esquece nos outros, e o lead cai para quem não pediu aquele
// território. Uma fonte, importada pelos três.
//
// ATUALIZAÇÃO DE 01/09/26 (Julyan): "André e Luiz vão pro RJ. Renata e Sérgio integram
// SP." Isso muda o Rio de 2 para 4 executivos e São Paulo de 1 para 3 — e é o que
// resolve o problema que a auditoria de hoje achou: 283 contas-alvo com coordenada,
// disponíveis, INVISÍVEIS na tela porque não tinham dono (252 sem dono nenhum + 31
// presas no Michel, desligado em 20/08).
//
// A CAUSA daquele buraco: o Rio era roteado por bairro, e só cinco bairros tinham dono.
// Todo o resto da cidade — Centro, Zona Sul inteira, Ilha, Zona Norte, Zona Oeste
// extrema — caía sem dono, e o cron semanal continuava despejando lá. Agora o Rio tem
// COBERTURA TOTAL: quatro zonas e uma regra de sobra que garante que nenhuma conta do
// município fique órfã. Se um bairro novo aparecer, ele cai na zona da sobra em vez de
// desaparecer.
//
// COMO A DIVISÃO FOI FEITA, e por que:
//   · geografia antes de contagem — dividir o Rio por número de leads produziria zonas
//     que atravessam a cidade, e quem visita paga o deslocamento;
//   · quem já tinha território mantém o dele (Bruno na Jacarepaguá/Zona Oeste, Sandro
//     na Grande Tijuca): mudar território de quem está rodando custa relacionamento;
//   · os dois novos entram nas duas zonas que estavam sem ninguém e são as de maior
//     densidade de restaurante — André na Zona Sul + Centro, Luiz na Zona Norte + Ilha;
//   · Campo Grande / Santa Cruz / Bangu (a antiga zona do Michel, 42 contas) vão para o
//     Bruno, que já é o executivo da Zona Oeste — é o único vizinho de verdade.

function semAcento(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '');
}

/* atalho de leitura: casa qualquer um dos nomes na chave "cidade bairro" */
const algum = (...nomes) => t => nomes.some(n => t.includes(n));

const RIO = 'rio de janeiro';
const SAOPAULO = 'sao paulo';

/* A TRAVA DE CIDADE (01/09/26) — ver a NOTA no patch terr-cidade.
   Cada regra declara a que município pertence, e o buscador só considera a regra quando
   a cidade casa. Sem isso, os homônimos entre Rio e São Paulo — Lapa, Saúde,
   Higienópolis, Jardim Botânico, Penha — mandariam conta paulistana para executivo do
   Rio: uma conta a 400 km na fila de quem trabalha a pé. Território errado é pior que
   território vazio; o vazio se resolve com sourcing, o errado com pedido de desculpas.
   Regra sem `cidade` (a da Kelly, que já testa cidade dentro do próprio teste) continua
   valendo para qualquer município — é o caso de quem cobre a cidade inteira. */
const TERRITORIOS = [
  /* ── ES ────────────────────────────────────────────────────────────────────────── */
  { owner: '86100505', nome: 'Marco Filho', praca: 'Vila Velha/ES', cidade: 'vila velha',
    teste: t => t.includes('vila velha') },
  { owner: '87069181', nome: 'Amanda Pardim', praca: 'Vitória/ES', cidade: 'vitoria',
    teste: t => t.includes('vitoria') },

  /* ── RIO DE JANEIRO: quatro zonas ──────────────────────────────────────────────
     A ordem importa: o teste mais específico vem primeiro, e a Zona Sul é testada
     antes do Centro porque "centro" aparece em nomes compostos de outras zonas. */

  /* SANDRO — Grande Tijuca e Zona Norte central (território que ele já tinha) */
  { owner: '87569072', nome: 'Sandro Brito', praca: 'RJ · Grande Tijuca', cidade: RIO,
    teste: algum('tijuca', 'vila isabel', 'maracana', 'andarai', 'grajau', 'rio comprido',
      'estacio', 'engenho novo', 'sao francisco xavier', 'riachuelo', 'todos os santos',
      'engenho de dentro', 'piedade', 'encantado', 'jacare', 'inhauma', 'cachambi',
      'meier', 'sao cristovao', 'praca da bandeira', 'usina', 'alto da boa vista') },

  /* BRUNO — Jacarepaguá, Barra e Zona Oeste (o dele + a zona que ficou sem dono
     quando o Michel saiu: Campo Grande, Santa Cruz, Bangu e vizinhas) */
  { owner: '86100506', nome: 'Bruno Martins', praca: 'RJ · Jacarepaguá e Zona Oeste', cidade: RIO,
    teste: t => algum('taquara', 'jacarepagua', 'pechincha', 'curicica', 'gardenia azul',
      'itanhanga', 'vargem grande', 'vargem pequena', 'vila valqueire', 'jardim sulacap',
      'recreio', 'barra olimpica', 'barra da tijuca', 'guaratiba', 'campo grande',
      'santa cruz', 'bangu', 'realengo', 'padre miguel', 'senador camara',
      'magalhaes bastos', 'sepetiba', 'paciencia', 'cosmos', 'senador vasconcelos',
      'inhoaiba', 'santissimo', 'campo dos afonsos', 'deodoro', 'vila militar')(t)
      || (t.includes('freguesia') && !t.includes('ilha'))
      || (t.includes(RIO) && /\banil\b/.test(t)) },

  /* ANDRÉ (novo, 01/09/26) — Zona Sul e Centro. As duas zonas de maior densidade de
     restaurante da cidade, e as duas que estavam inteiras sem dono: só Botafogo,
     Copacabana, Leblon, Ipanema e Centro somavam 77 contas invisíveis. */
  { owner: 'pendente_andregomes', nome: 'André Gomes', praca: 'RJ · Zona Sul e Centro', cidade: RIO,
    teste: t => algum('copacabana', 'ipanema', 'leblon', 'botafogo', 'laranjeiras',
      'catete', 'flamengo', 'gloria', 'humaita', 'gavea', 'jardim botanico',
      'cosme velho', 'leme', 'rocinha', 'urca', 'lagoa', 'vidigal', 'sao conrado',
      'lapa', 'cidade nova', 'santo cristo', 'saude', 'gamboa', 'benfica',
      'catumbi', 'santa teresa', 'caju', 'mangueira')(t)
      || (t.includes(RIO) && /\bcentro\b/.test(t)) },

  /* LUIZ (novo, 01/09/26) — Zona Norte/Leste e Ilha do Governador. Cauda longa: muitos
     bairros de 1 a 6 contas cada, que só viram backlog de verdade somados. */
  { owner: 'pendente_luizpimentel', nome: 'Luiz Pimentel', praca: 'RJ · Zona Norte e Ilha', cidade: RIO,
    teste: algum('olaria', 'penha', 'vila da penha', 'braz de pina', 'bras de pina',
      'cordovil', 'parada de lucas', 'vigario geral', 'del castilho', 'mare',
      'bonsucesso', 'ramos', 'pavuna', 'coelho neto', 'costa barros', 'rocha miranda',
      'honorio gurgel', 'guadalupe', 'iraja', 'vicente de carvalho', 'madureira',
      'campinho', 'oswaldo cruz', 'marechal hermes', 'tomas coelho', 'cavalcanti',
      'agua santa', 'jardim america', 'higienopolis', 'maria da graca', 'jacarezinho',
      'jardim carioca', 'jardim guanabara', 'cacuia', 'portuguesa', 'taua', 'paqueta',
      'galeao', 'bancarios', 'zumbi', 'praia da bandeira', 'ribeira', 'cocota',
      'pitangueiras', 'moneró', 'monero',
      /* a Freguesia da ILHA e do Luiz; a Freguesia de Jacarepagua e do Bruno. O mesmo nome
         em duas zonas da cidade — a regra do Bruno exclui 'ilha' e esta a inclui, para o
         caso nao depender da regra de sobra (na simulacao os dois cairam nela por acidente,
         e acerto por acidente e o que deixa de acertar quando alguem mexe na sobra). */
      'freguesia (ilha') },

  /* SOBRA DO RIO — a regra que fecha o buraco (01/09/26).
     Antes, bairro fora das listas caía sem dono e ficava invisível para sempre. Agora
     cai no Luiz, que cobre a maior área e a cauda mais longa. Não é "lixeira": é o
     destino explícito da exceção, registrado aqui para que a próxima pessoa saiba onde
     olhar quando um bairro novo aparecer. */
  { owner: 'pendente_luizpimentel', nome: 'Luiz Pimentel', praca: 'RJ · sobra do município', cidade: RIO,
    sobra: true, teste: t => t.includes(RIO) },

  /* ── SÃO PAULO: três zonas ────────────────────────────────────────────────────────
     Whell mantém a Zona Sul, que é a dele desde 10/08. Renata e Sérgio entram nas duas
     regiões restantes. Nota de realidade: SP tem hoje 42 contas na base inteira, 35
     bairros com 1 ou 2 cada — dividir por três dá 14 por executivo, o que não é
     backlog. A divisão está certa; o que falta é sourcing, e é por isso que a meta de
     SP no backfill sobe de 30 para 90 nesta mesma rodada. */

  /* WHELL — Zona Sul e Oeste (a dele) */
  { owner: '89842507', nome: 'Wericles Andrade', praca: 'SP · Zona Sul e Oeste', cidade: SAOPAULO,
    teste: algum('morumbi', 'santo amaro', 'itaim bibi', 'vila olimpia', 'brooklin',
      'moema', 'campo belo', 'jardim paulista', 'pinheiros', 'vila madalena',
      'perdizes', 'alto de pinheiros', 'butanta', 'jardim das acacias',
      'chacara santo antonio', 'cidade moncoes', 'indianopolis', 'paraisopolis',
      'jardim morumbi', 'vila leopoldina', 'agua branca', 'jardim cabore',
      'jardim das pedras', 'jardim tres marias', 'vila do sol') },

  /* RENATA (nova, 01/09/26) — Centro expandido e Zona Leste */
  { owner: 'pendente_renatapessoa', nome: 'Renata Pessoa', praca: 'SP · Centro e Zona Leste', cidade: SAOPAULO,
    teste: t => algum('bela vista', 'consolacao', 'republica', 'se', 'liberdade',
      'bom retiro', 'bras', 'mooca', 'tatuape', 'vila regente feijo', 'vila gomes cardim',
      'vila bertioga', 'anhangabau', 'santa cecilia', 'higienopolis', 'pacaembu',
      'aclimacao', 'cambuci', 'ipiranga', 'vila prudente', 'sao mateus', 'itaquera',
      'penha de franca', 'vila formosa', 'cidade mae do ceu', 'jardim ana rosa',
      'parque sao rafael', 'parque industrial tomas edson', 'agua funda',
      'chacara nossa senhora do bom conselho',
      /* vindas do Sérgio na correção de mapa: ficam ao sul do Centro, colado na zona dela */
      'vila mariana', 'saude', 'jabaquara', 'planalto paulista', 'bosque da saude',
      'chacara inglesa', 'aclimacao', 'paraiso')(t)
      || (t.includes('sao paulo') && /\bcentro\b/.test(t)) },

  /* SÉRGIO (novo, 01/09/26) — Zona Norte.
     A 1ª versão desta linha dizia "Zona Norte e Vila Mariana", e isso estava errado no
     mapa: Santana fica ao norte do centro e Vila Mariana ao sul, com uns 12 km e a cidade
     inteira entre as duas. Zona que atravessa a cidade é zona que ninguém roda — o dia
     vira trânsito. Vila Mariana, Saúde e Jabaquara foram para a Renata, que faz
     fronteira com elas pelo Centro expandido. */
  { owner: 'pendente_scaetano', nome: 'Sérgio Caetano', praca: 'SP · Zona Norte', cidade: SAOPAULO,
    teste: algum('santana', 'tucuruvi', 'casa verde', 'freguesia do o', 'lapa',
      'barra funda', 'varzea da barra funda', 'vila guilherme', 'vila maria',
      'jacana', 'vila ede', 'parque taipas', 'brasilandia', 'pirituba', 'vila clarice',
      'jaragua', 'imirim', 'mandaqui', 'vila nova cachoeirinha', 'limao',
      'jardim sao paulo', 'parada inglesa', 'water') },

  /* SOBRA DE SÃO PAULO — mesma lógica do Rio: bairro fora das listas tem destino
     explícito em vez de virar invisível. Vai para a Renata, cuja zona (Centro
     expandido) é a de fronteira mais elástica. */
  { owner: 'pendente_renatapessoa', nome: 'Renata Pessoa', praca: 'SP · sobra do município', cidade: SAOPAULO,
    sobra: true, teste: t => t.includes('sao paulo') },

  /* ── RS ────────────────────────────────────────────────────────────────────────── */
  { owner: '91477292', nome: 'Kelly Travieso', praca: 'Porto Alegre e Canoas/RS',
    teste: algum('canoas', 'porto alegre') }
];

function rotearTerritorio(cidade, bairro) {
  const r = regraDoTerritorio(cidade, bairro);
  return r ? r.owner : null;
}

/* Igual ao de cima, mas devolve a regra inteira — a redistribuição e os relatórios
   precisam do NOME e da PRAÇA para dizer o que fizeram, não só do id. */
function regraDoTerritorio(cidade, bairro) {
  const cid = semAcento(cidade);
  const chave = cid + ' ' + semAcento(bairro);
  return TERRITORIOS.find(x => (!x.cidade || cid.includes(x.cidade)) && x.teste(chave)) || null;
}

module.exports = { TERRITORIOS, rotearTerritorio, regraDoTerritorio, semAcento };
