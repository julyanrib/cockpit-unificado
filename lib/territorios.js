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

/* atalho de leitura: casa qualquer um dos nomes na chave "cidade bairro".

   FRONTEIRA DE PALAVRA, e por que ela não é detalhe (01/09/26): a primeira versão usava
   includes cru, e com isso o nome de duas letras 'se' (o distrito da Sé) casava
   "vila sao JOSE" e "SERralheiro", e 'bras' casava "BRASilandia". Como o passo do nome
   vem antes da coordenada, uma zona recebia bairro que não é dela e o executivo herdava
   o dono errado. Medido: 7 das 400 contas de São Paulo estavam assim — pouco em número e
   grosseiro em espécie, porque "Vila São José (Cidade Dutra)" na fila de quem roda o Centro
   é uma visita de 25 km. (O desequilíbrio 290 · 88 · 22 tinha outra causa, já corrigida: a
   regra de sobra por nome numa cidade de 96 distritos. Ver a NOTA de CENTROS_DE_ZONA.)
   Espaço, parêntese e fim de string são fronteira, então nome composto continua casando
   dentro de rótulo sujo: "FREGUESIA (ILHA DO GOVERNADOR)" casa 'ilha do governador' e
   "PENHA CIRCULAR" casa 'penha'. As expressões são compiladas uma vez, na carga. */
const escaparRe = n => n.replace(/[.*+?^${}()|[\]\\]/g, function (c) { return '\\' + c; });
const algum = (...nomes) => {
  const res = nomes.map(n => new RegExp('\\b' + escaparRe(n) + '\\b'));
  return t => res.some(re => re.test(t));
};

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
/* ══ O ID REAL, POR NOME ═══════════════════════════════════════════════════════════
   Quatro regras deste arquivo tinham `owner: idDoNome('André Gomes', 'pendente_andregomes')` e parentes — nomes
   de espera cadastrados antes do ownerId existir. NINGUÉM os resolve: o fetch-hubspot
   apenas os FILTRA. Uma regra dessas roteando um lead grava id falso em
   responsavel_owner_id, e aquele lead fica sem aparecer na Daily de ninguém.
   Agora o id sai de data/usuarios.json, por nome, e o placeholder é só o fallback de
   quem realmente ainda não tem id. */
const USUARIOS_PARA_ID = (() => {
  try {
    const u = require('../data/usuarios.json');
    const lista = Array.isArray(u) ? u : (u.usuarios || []);
    const m = {};
    lista.forEach(function (x) {
      const n = semAcento(x && (x.nome || x.name));
      if (n && x.ownerId && !String(x.ownerId).startsWith('pendente_')) m[n] = String(x.ownerId);
    });
    return m;
  } catch (e) { return {}; }
})();

function idDoNome(nome, fallback) {
  return USUARIOS_PARA_ID[semAcento(nome)] || fallback || null;
}

/* ══ AS REGRAS DECLARADAS (09/09/26) ═════════════════════════════════════════════════
   Derivadas de data/territorios.json, a mesma fonte que a tela do gestor e a busca
   semanal leem. Elas vêm ANTES das listas largas abaixo: bairro que o Julyan nomeou hoje
   ganha de bairro que estava numa lista de 01/09.

   `todoOMunicipio` gera regra de cidade inteira, respeitando `exceto` — é o caso do
   Ricardo em Porto Alegre ("só não pega cidade baixa") e do Luiz na Baixada.

   BORDA DE PALAVRA, não substring: 'vila mariana' não é 'vila maria'. Foi o defeito que a
   derivação das sub-cotas do backfill pegou hoje, e ele valeria igual aqui. */
/* ══ O BAIRRO DE VERDADE, DENTRO DE UM CAMPO SUJO ══════════════════════════════════
   MEDIDO no banco: a coluna `bairro` de leads_prospeccao frequentemente carrega o
   endereço com o bairro no fim — "Lj B - Tijuca", "Loja A B C D - Barra da Tijuca",
   "SUC 0028 - Tijuca", "frente - Tijuca", "Lj D - Rio Comprido". O que vem depois do
   ÚLTIMO " - " é o bairro; o resto é número de loja, e comparar a string inteira faria
   nenhum deles casar com nada.

   Também aparece endereço puro sem bairro nenhum ("Av. Lúcio Costa", "R. Des. Izidro").
   Nesses o resultado é o próprio texto, que não casa com bairro declarado — e o lead
   fica sem dono e VISÍVEL, que é o certo: ninguém sabe em que bairro ele está. */
function bairroLimpo(bairro) {
  let s = String(bairro == null ? '' : bairro).trim();
  const i = s.lastIndexOf(' - ');
  if (i > -1) s = s.slice(i + 3).trim();
  return semAcento(s);
}

const DECLARADOS = (() => {
  let decl = [];
  try { decl = require('../data/territorios.json').territorios || []; } catch (e) { decl = []; }
  const regras = [];
  /* ══ COMPARA O BAIRRO INTEIRO, NÃO UM PEDAÇO DELE ═══════════════════════════════
     Era ' <declarado> ' dentro de ' <cidade> <bairro do lead> ', e "Barra da Tijuca"
     contém " tijuca ": o "Tijuca" do Bruno levava a Barra do André, e o `.find` entrega
     ao primeiro que casa, ou seja a quem aparece antes no JSON. Mesma família do
     "vila maria" que casava "vila mariana", agora no caso em que um bairro é o SUFIXO do
     outro — Tijuca/Barra da Tijuca, Penha/Penha Circular, Freguesia/Freguesia (Jacarepaguá).

     O teste recebe a chave "<cidade> <bairro>" por compatibilidade com as regras antigas,
     então o bairro é o que sobra depois de tirar o nome da cidade. */
  const casaBairro = function (chaves, cidadeChave) {
    return function (t) {
      const inteiro = semAcento(t);
      let bai = inteiro;
      if (cidadeChave && bai.indexOf(cidadeChave) === 0) bai = bai.slice(cidadeChave.length).trim();
      const limpo = bairroLimpo(bai);
      return chaves.some(function (k) { return limpo === k || bai === k; });
    };
  };
  /* bairro nomeado primeiro; cidade inteira depois — senão a regra de cidade do Ricardo
     engoliria os três bairros da Kelly em Porto Alegre. */
  decl.forEach(function (tr) {
    if (!tr || tr.ativo === false) return;
    (tr.areas || []).forEach(function (a) {
      if (!a || !a.municipio || a.todoOMunicipio) return;
      const chaves = (a.bairros || []).map(semAcento).filter(Boolean);
      if (!chaves.length) return;
      regras.push({
        owner: idDoNome(tr.rep, null), nome: tr.rep,
        praca: a.municipio + '/' + a.uf + ' · declarado',
        cidade: semAcento(a.municipio), declarado: true,
        teste: casaBairro(chaves, semAcento(a.municipio))
      });
    });
  });
  decl.forEach(function (tr) {
    if (!tr || tr.ativo === false) return;
    (tr.areas || []).forEach(function (a) {
      if (!a || !a.municipio || !a.todoOMunicipio) return;
      const fora = (a.exceto || []).map(semAcento).filter(Boolean);
      const cid = semAcento(a.municipio);
      regras.push({
        owner: idDoNome(tr.rep, null), nome: tr.rep,
        praca: a.municipio + '/' + a.uf + ' · município inteiro'
          + (fora.length ? ' (exceto ' + (a.exceto || []).join(', ') + ')' : ''),
        cidade: cid, declarado: true, todoOMunicipioDeclarado: true,
        teste: function (t) {
          const alvo = ' ' + String(t || '') + ' ';
          if (fora.some(function (k) { return alvo.indexOf(' ' + k + ' ') > -1; })) return false;
          return alvo.indexOf(cid) > -1;
        }
      });
    });
  });
  /* ══ A SOBRA DA CIDADE DE UM DONO SÓ ══════════════════════════════════════════════
     A rota é declarada por BAIRRO e a busca varre o MUNICÍPIO. Medido em 09/09: 301
     leads sem dono, sendo 247 de Guarulhos em 106 bairros que ninguém nomeou (a cidade
     tem ~140), 29 de Suzano, 19 de Mogi e 5 de Salesópolis.

     Cidade com UM ÚNICO dono declarado: a sobra é dele, sem ambiguidade — ele é a única
     pessoa que anda ali. Cidade com DOIS OU MAIS: a sobra NÃO entra, porque dividir
     bairro entre duas pessoas é decisão de território e é do Julyan. Aqueles leads
     continuam sem dono e VISÍVEIS na fila da praça, onde ele distribui. Sem dono e
     visível é melhor que com dono errado. */
  const porCidade = {};
  regras.forEach(function (r) {
    if (!r.owner) return;
    (porCidade[r.cidade] = porCidade[r.cidade] || {})[r.nome] = true;
  });
  Object.keys(porCidade).forEach(function (cid) {
    const donos = Object.keys(porCidade[cid]);
    if (donos.length !== 1) return;                       /* dois donos: decisão dele */
    const base = regras.find(function (r) { return r.cidade === cid && r.nome === donos[0]; });
    if (!base || base.todoOMunicipioDeclarado) return;    /* já cobre a cidade inteira */
    regras.push({
      owner: base.owner, nome: base.nome,
      praca: cid + ' · sobra do município (único dono declarado)',
      cidade: cid, declarado: true, sobraDeclarada: true,
      teste: function (t) { return (' ' + String(t || '') + ' ').indexOf(cid) > -1; }
    });
  });

  /* regra sem id não entra: melhor SEM DONO do que com id inventado */
  return regras.filter(function (r) { return !!r.owner; });
})();

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
  { owner: idDoNome('André Gomes', 'pendente_andregomes'), nome: 'André Gomes', praca: 'RJ · Zona Sul e Centro', cidade: RIO,
    teste: t => algum('copacabana', 'ipanema', 'leblon', 'botafogo', 'laranjeiras',
      'catete', 'flamengo', 'gloria', 'humaita', 'gavea', 'jardim botanico',
      'cosme velho', 'leme', 'rocinha', 'urca', 'lagoa', 'vidigal', 'sao conrado',
      'lapa', 'cidade nova', 'santo cristo', 'saude', 'gamboa', 'benfica',
      'catumbi', 'santa teresa', 'caju', 'mangueira')(t)
      || (t.includes(RIO) && /\bcentro\b/.test(t)) },

  /* LUIZ (novo, 01/09/26) — Zona Norte/Leste e Ilha do Governador. Cauda longa: muitos
     bairros de 1 a 6 contas cada, que só viram backlog de verdade somados. */
  { owner: idDoNome('Luiz Pimentel', 'pendente_luizpimentel'), nome: 'Luiz Pimentel', praca: 'RJ · Zona Norte e Ilha', cidade: RIO,
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
  { owner: idDoNome('Luiz Pimentel', 'pendente_luizpimentel'), nome: 'Luiz Pimentel', praca: 'RJ · sobra do município', cidade: RIO,
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
  { owner: idDoNome('Renata Pessoa', 'pendente_renatapessoa'), nome: 'Renata Pessoa', praca: 'SP · Centro e Zona Leste', cidade: SAOPAULO,
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
  { owner: idDoNome('Sérgio Caetano', 'pendente_scaetano'), nome: 'Sérgio Caetano', praca: 'SP · Zona Norte e Lapa', cidade: SAOPAULO,
    teste: algum('santana', 'tucuruvi', 'casa verde', 'freguesia do o', 'lapa',
      'barra funda', 'varzea da barra funda', 'vila guilherme', 'vila maria',
      'jacana', 'vila ede', 'parque taipas', 'brasilandia', 'pirituba', 'vila clarice',
      'jaragua', 'imirim', 'mandaqui', 'vila nova cachoeirinha', 'limao',
      'jardim sao paulo', 'parada inglesa') },

  /* SOBRA DE SÃO PAULO — mesma lógica do Rio: bairro fora das listas tem destino
     explícito em vez de virar invisível. Vai para a Renata, cuja zona (Centro
     expandido) é a de fronteira mais elástica. */
  { owner: idDoNome('Renata Pessoa', 'pendente_renatapessoa'), nome: 'Renata Pessoa', praca: 'SP · sobra do município', cidade: SAOPAULO,
    sobra: true, teste: t => t.includes('sao paulo') },

  /* ── RS ────────────────────────────────────────────────────────────────────────── */
  { owner: '91477292', nome: 'Kelly Travieso', praca: 'Porto Alegre e Canoas/RS',
    teste: algum('canoas', 'porto alegre') }
];

/* ══════════════════════════════════════════════════════════════════════════════════════
   A SOBRA POR CENTRO MAIS PRÓXIMO — ver a NOTA do patch sobra-por-coordenada.
   Nome resolve o bairro conhecido; coordenada resolve a cauda. São Paulo tem 96 distritos
   e enumerar todos de cabeça é como se erra território: um nome trocado manda o executivo
   para o outro lado da cidade.
   Os centros são os MESMOS declarados em TERRITORIO_DO_EXECUTIVO no template — repetidos
   aqui porque este módulo roda no servidor (api/importar-leads) e aquele objeto vive no
   navegador. Divergir os dois seria duas verdades sobre a mesma zona, então a lista traz
   o aviso: mudou lá, muda aqui.
   ══════════════════════════════════════════════════════════════════════════════════════ */
const CENTROS_DE_ZONA = [
  { owner: '86100506', nome: 'Bruno Martins', cidade: RIO, lat: -22.9260, lng: -43.3760 },
  { owner: '87569072', nome: 'Sandro Brito', cidade: RIO, lat: -22.9245, lng: -43.2320 },
  { owner: idDoNome('André Gomes', 'pendente_andregomes'), nome: 'André Gomes', cidade: RIO, lat: -22.9500, lng: -43.1830 },
  { owner: idDoNome('Luiz Pimentel', 'pendente_luizpimentel'), nome: 'Luiz Pimentel', cidade: RIO, lat: -22.8420, lng: -43.2790 },
  { owner: '89842507', nome: 'Wericles Andrade', cidade: SAOPAULO, lat: -23.6520, lng: -46.7080 },
  /* centro no MEIO da zona (Centro -> Zona Leste), nao na ponta: com o centro na Se, a
     Zona Leste caia no Sergio por diferenca de 700 metros — medido com Parque Cisper. */
  { owner: idDoNome('Renata Pessoa', 'pendente_renatapessoa'), nome: 'Renata Pessoa', cidade: SAOPAULO, lat: -23.5500, lng: -46.5900 },
  { owner: idDoNome('Sérgio Caetano', 'pendente_scaetano'), nome: 'Sérgio Caetano', cidade: SAOPAULO, lat: -23.5020, lng: -46.6250 }
];

/* distância em km, suficiente para comparar centros dentro de uma cidade */
/* ══ AS CIDADES EM QUE ELE JÁ NOMEOU BAIRRO ════════════════════════════════════════
   Nelas, as listas largas de 01/09 param de valer: elas foram escritas antes das quatro
   rodadas de rota ditada e dizem o INVERSO do mapa de hoje ("André = Zona Sul e Centro",
   "Bruno = Jacarepaguá e Zona Oeste"). Bairro que ninguém nomeou fica SEM DONO e visível
   na fila da praça — sem dono e visível é melhor que com dono errado. */
const CIDADES_COM_BAIRRO_DECLARADO = (() => {
  const fora = {};
  let decl = [];
  try { decl = require('../data/territorios.json').territorios || []; } catch (e) { decl = []; }
  decl.forEach(function (tr) {
    if (!tr || tr.ativo === false) return;
    (tr.areas || []).forEach(function (a) {
      if (!a || !a.municipio || a.todoOMunicipio) return;
      if ((a.bairros || []).length) fora[semAcento(a.municipio)] = true;
    });
  });
  return fora;
})();

/* ══ O QUE ESTÁ FORA DE ROTA ════════════════════════════════════════════════════════
   `_fora_de_rota` mora em data/territorios.json desde 08/09 — "zona oeste no momento nao
   precisa" — e MEDIDO em 09/09 nenhum consumidor o lia. A frase estava escrita e não
   valia para nada: o Bruno tinha 60 leads em Campo Grande, Santa Cruz e Bangu.

   Ele corta ANTES de qualquer atribuição, inclusive da declarada: se o Julyan tirou a
   região de rota, ninguém deve receber lead dali nem por engano. */
const FORA_DE_ROTA = (() => {
  let lista = [];
  try { lista = require('../data/territorios.json')._fora_de_rota || []; } catch (e) { lista = []; }
  return lista.map(function (z) {
    return {
      cidade: semAcento(z.municipio),
      zona: z.zona || 'fora de rota',
      bairros: (z.bairros || []).map(semAcento).filter(Boolean)
    };
  }).filter(function (z) { return z.cidade && z.bairros.length; });
})();

function estaForaDeRota(cidade, bairro) {
  const cid = semAcento(cidade);
  const bai = bairroLimpo(bairro);
  if (!bai) return null;
  const z = FORA_DE_ROTA.find(function (x) {
    return cid.indexOf(x.cidade) > -1 && x.bairros.indexOf(bai) > -1;
  });
  return z || null;
}

/* ══ A SOBRA DO MUNICÍPIO, ESCOLHIDA A DEDO ═════════════════════════════════════════
   `sobraDoMunicipio: true` numa área declarada por bairro: este rep leva o RESTO daquele
   município — o bairro que ninguém nomeou, a grafia que não casa com nada, e o registro
   que veio com endereço no lugar do bairro.

   É a garantia de "nao deixa sem dono" (Julyan, 09/09) como REGRA e não como promessa de
   que eu listei os 163 bairros do Rio corretamente. */
const SOBRAS_DE_MUNICIPIO = (() => {
  let decl = [];
  try { decl = require('../data/territorios.json').territorios || []; } catch (e) { decl = []; }
  const fora = [];
  decl.forEach(function (tr) {
    if (!tr || tr.ativo === false) return;
    (tr.areas || []).forEach(function (a) {
      if (!a || !a.municipio || !a.sobraDoMunicipio) return;
      const owner = idDoNome(tr.rep, null);
      if (!owner) return;
      fora.push({
        owner: owner, nome: tr.rep,
        praca: a.municipio + '/' + a.uf + ' · sobra do município (declarada)',
        cidade: semAcento(a.municipio), declarado: true, sobraDoMunicipio: true
      });
    });
  });
  return fora;
})();

function kmEntre(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* De todos os executivos daquele município, o do centro mais próximo. Devolve null quando
   não há coordenada — e aí a regra de sobra por nome, que continua existindo, assume. */
function donoPorProximidade(cidade, lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  const cid = semAcento(cidade);
  const candidatos = CENTROS_DE_ZONA.filter(c => cid.includes(c.cidade));
  if (!candidatos.length) return null;
  let melhor = null, menor = Infinity;
  for (const c of candidatos) {
    const d = kmEntre(Number(lat), Number(lng), c.lat, c.lng);
    if (d < menor) { menor = d; melhor = c; }
  }
  return melhor ? { owner: melhor.owner, nome: melhor.nome, praca: melhor.nome + ' · por proximidade (' + menor.toFixed(1) + ' km do centro da zona)', porCoordenada: true } : null;
}

/* A ZONA QUE VEM ESCRITA NO NOME DO BAIRRO — ver a NOTA do patch dica-de-zona.
   Só existe para São Paulo e só para as quatro zonas que a fonte escreve entre
   parênteses. Vale mais que a coordenada porque o parêntese nunca é um chute: a
   coordenada, quando o geocodificador falha, vira o centróide do município e passa a
   apontar para o centro de zona de quem estiver mais perto do centróide. */
const ZONAS_ESCRITAS = [
  { marca: ['(zona norte)', '(z norte)'], owner: idDoNome('Sérgio Caetano', 'pendente_scaetano'), nome: 'Sérgio Caetano' },
  { marca: ['(zona leste)', '(z leste)'], owner: idDoNome('Renata Pessoa', 'pendente_renatapessoa'), nome: 'Renata Pessoa' },
  { marca: ['(zona sul)', '(z sul)', '(zona oeste)', '(z oeste)'], owner: '89842507', nome: 'Wericles Andrade' }
];

function donoPorZonaEscrita(cidade, bairro) {
  const cid = semAcento(cidade);
  if (!cid.includes(SAOPAULO)) return null;
  const b = semAcento(bairro);
  const z = ZONAS_ESCRITAS.find(x => x.marca.some(m => b.includes(m)));
  return z
    ? { owner: z.owner, nome: z.nome, praca: z.nome + ' · zona escrita no nome do bairro', porZonaEscrita: true }
    : null;
}

/* ══ CIDADE DIVIDIDA POR MERIDIANO ═══════════════════════════════════════════════════
   Guarulhos tem DOIS donos e ~140 bairros, dos quais 18 estão nomeados. Sem esta regra a
   busca traz 83% do município sem dono. O divisor mora em data/territorios.json, junto do
   resto do território — não cravado aqui.

   A COORDENADA SÓ DECIDE DENTRO DA CAIXA DA CIDADE. Medido em 09/09: 38 dos 247 leads de
   Guarulhos tinham ponto entre -51,4 e -45,6 de longitude, para uma cidade de 30 km — o
   geocodificador falha e devolve outra cidade. Fora da caixa, devolve null: o lead fica
   sem dono e VISÍVEL na fila da praça, onde o gestor distribui. */
const DIVISORES = (() => {
  try { return require('../data/territorios.json')._divisores_de_cidade || []; }
  catch (e) { return []; }
})();

function donoPorMeridiano(cidade, lat, lng) {
  const cid = semAcento(cidade);
  const d = DIVISORES.find(function (x) { return cid.indexOf(semAcento(x.municipio)) > -1; });
  if (!d) return null;
  const la = Number(lat), lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const cx = d.caixa || {};
  const dentro = Array.isArray(cx.lat) && Array.isArray(cx.lng)
    && la >= cx.lat[0] && la <= cx.lat[1] && lo >= cx.lng[0] && lo <= cx.lng[1];
  if (!dentro) return null;   /* coordenada impossível não decide território */
  const nome = lo < Number(d.corte) ? d.oeste : d.leste;
  const owner = idDoNome(nome, null);
  if (!owner) return null;
  return { owner: owner, nome: nome,
    praca: d.municipio + '/' + d.uf + ' · ' + (lo < Number(d.corte) ? 'oeste' : 'leste')
      + ' do meridiano ' + d.corte, porMeridiano: true };
}

function rotearTerritorio(cidade, bairro, lat, lng) {
  const r = regraDoTerritorio(cidade, bairro, lat, lng);
  return r ? r.owner : null;
}

/* Igual ao de cima, mas devolve a regra inteira — a redistribuição e os relatórios
   precisam do NOME e da PRAÇA para dizer o que fizeram, não só do id. */
function regraDoTerritorio(cidade, bairro, lat, lng) {
  const cid = semAcento(cidade);
  const chave = cid + ' ' + semAcento(bairro);
  /* 1º o bairro conhecido (a fronteira que não é um raio); 2º a zona escrita no nome do
     bairro, quando a fonte a declara; 3º a coordenada; 4º a sobra por nome, que só
     existe para lead sem coordenada nenhuma. */
  /* A DECLARAÇÃO DO JULYAN GANHA DE TUDO (09/09/26). Ela é a decisão de hoje; as listas
     largas abaixo são a cobertura de 01/09 que ele nunca revogou, e continuam valendo
     para o bairro que ele não nomeou. Sem esta precedência, Copacabana ia para o André
     (que saiu da Zona Sul) e Cachambi para o Sandro (que saiu da Grande Tijuca). */
  /* bairro NOMEADO primeiro; a sobra da cidade de um dono só depois — ela é o resto, e
     consultá-la antes faria a cidade inteira cair no primeiro dono mesmo onde outro tem
     bairro nomeado. */
  /* FORA DE ROTA CORTA ANTES DE TUDO: se ele tirou a região da rota, ninguém recebe
     lead dali — nem por declaração, nem por lista antiga, nem por coordenada. */
  if (estaForaDeRota(cidade, bairro)) return null;
  const declarado = DECLARADOS.find(x => !x.sobraDeclarada && cid.includes(x.cidade) && x.teste(chave));
  if (declarado) return declarado;
  const sobraDele = DECLARADOS.find(x => x.sobraDeclarada && cid.includes(x.cidade) && x.teste(chave));
  if (sobraDele) return sobraDele;
  /* o meridiano vem DEPOIS do bairro nomeado — quem nomeou a rua manda — e ANTES das
     listas largas e da coordenada genérica, porque ele é a divisão que o Julyan pediu
     para aquela cidade */
  const porMeridiano = donoPorMeridiano(cidade, lat, lng);
  if (porMeridiano) return porMeridiano;
  /* A SOBRA DECLARADA DO MUNICÍPIO vem DEPOIS do bairro nomeado de todo mundo (senão o
     dono da sobra levaria a Zona Sul do vizinho) e ANTES das listas largas de 01/09
     (senão o mapa antigo volta a decidir, que é o defeito que pôs 107 leads na carteira
     errada). É ela que cumpre o "nao deixa sem dono". */
  const sobraDoMunicipio = SOBRAS_DE_MUNICIPIO.find(x => cid.indexOf(x.cidade) > -1);
  if (sobraDoMunicipio) return sobraDoMunicipio;
  /* ══ AS LISTAS DE 01/09 NÃO VALEM ONDE ELE JÁ NOMEOU BAIRRO ═════════════════════
     Elas são cobertura para praça que ele não detalhou. Onde detalhou, elas são o mapa
     ANTIGO e o mapa antigo diz o inverso do de hoje — provado: CENTRO caía no André pela
     regra "RJ · Zona Sul e Centro", de quando ele era da Zona Sul. Deixá-las valendo é o
     que punha 107 leads de Copacabana e Botafogo na carteira de quem trabalha na Barra. */
  const cidadeDetalhada = Object.keys(CIDADES_COM_BAIRRO_DECLARADO)
    .some(function (c) { return cid.indexOf(c) > -1; });
  if (cidadeDetalhada) return null;
  const porNome = TERRITORIOS.find(x => (!x.cidade || cid.includes(x.cidade)) && x.teste(chave) && !x.sobra);
  if (porNome) return porNome;
  const porZona = donoPorZonaEscrita(cidade, bairro);
  if (porZona) return porZona;
  const porCoord = donoPorProximidade(cidade, lat, lng);
  if (porCoord) return porCoord;
  return TERRITORIOS.find(x => (!x.cidade || cid.includes(x.cidade)) && x.teste(chave)) || null;
}

module.exports = { TERRITORIOS, DECLARADOS, DIVISORES, donoPorMeridiano, FORA_DE_ROTA, estaForaDeRota, bairroLimpo, CIDADES_COM_BAIRRO_DECLARADO, SOBRAS_DE_MUNICIPIO, CENTROS_DE_ZONA, ZONAS_ESCRITAS, rotearTerritorio, regraDoTerritorio, donoPorProximidade, donoPorZonaEscrita, kmEntre, semAcento };
