/* ============================================================================
   O COLETOR DE MAIS AVALIADOS: SERPER, E SÓ RESTAURANTE (14/09/26)

   DOIS PEDIDOS DO JULYAN NUM COMMIT SÓ:
     · "estou no serper.dev, para puxarmos os mais avaliados do google pra eles"
     · "vou precisar de toda a ajuda de configuração focada só em restaurante"

   O QUE ESTA SUÍTE PROTEGE, e por que cada regra existe:

   1. TRADUÇÃO CEGA. Eu escrevi o de/para dos campos do Serper sem poder testar contra a
      API — a chave não é minha para ter. O modo de falha desse tipo de código é o pior
      desta casa: a resposta chega, o código roda, e todo registro sai `null` sem ninguém
      reclamar. Por isso o adaptador é obrigado a JOGAR ERRO quando a página inteira vem
      sem nome ou sem contagem de avaliações — e é isso que se mede aqui.

   2. SÓ RESTAURANTE. A consulta de texto não basta: "restaurantes em Copacabana" no
      Google Maps devolve hotel com restaurante, shopping com praça de alimentação e
      mercado com rotisseria. Quem separa é a categoria de cada resultado, e o veto passa
      ANTES da aceitação — "Restaurante do Hotel X" tem as duas palavras e é hotel.

   3. QUEM BUSCA NÃO DECIDE. O corte de volume, o dedup, o teto por praça e a ordenação
      continuam no coletor. Se o adaptador começar a filtrar por nota ou a ordenar, passa
      a haver duas regras para a mesma coisa — e é assim que elas divergem em silêncio.
   ============================================================================ */

const fs = require('fs');
const path = require('path');
const os = require('os');

const raiz = path.join(__dirname, '..');
const lib = require(path.join(raiz, 'lib', 'serper-places.js'));
const fonteLib = fs.readFileSync(path.join(raiz, 'lib', 'serper-places.js'), 'utf8');
const coletor = fs.readFileSync(path.join(raiz, 'scripts', 'backfill-google-places.js'), 'utf8');
const workflow = fs.readFileSync(path.join(raiz, '.github', 'workflows', 'google-places-mensal.yml'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, detalhe) => { if (cond) { ok++; return; } falhas.push(nome + (detalhe ? ' — ' + detalhe : '')); };

/* ── 1. SÓ RESTAURANTE ───────────────────────────────────────────────────────────── */

checar('restaurante e bar entram',
  ['Restaurante', 'Restaurant', 'Bar', 'Gastrobar', 'Churrascaria', 'Pizzaria',
    'Hamburgueria', 'Pub', 'Cervejaria', 'Bistrô', 'Restaurante japonês', 'Petiscaria']
    .every(c => lib.categoriaDeRestaurante(c).aceito),
  'a lista de aceitas perdeu um tipo de casa que é cliente Takeat');

checar('hotel, shopping e mercado NÃO entram',
  ['Hotel', 'Pousada', 'Shopping center', 'Supermercado', 'Grocery store', 'Farmácia',
    'Posto de gasolina', 'Academia', 'Escola'].every(c => !lib.categoriaDeRestaurante(c).aceito),
  'é isso que a consulta de texto sozinha deixa passar');

checar('o veto ganha da aceitação quando as duas palavras aparecem',
  !lib.categoriaDeRestaurante('Restaurante do Hotel Praia').aceito
    && !lib.categoriaDeRestaurante('Bar do Shopping Vitória').aceito,
  '"Restaurante do Hotel X" é hotel: quem decide compra de PDV ali é a rede, não o salão');

checar('padaria e cafeteria ficam de fora — decisão, não esquecimento',
  !lib.categoriaDeRestaurante('Padaria').aceito
    && !lib.categoriaDeRestaurante('Bakery').aceito
    && !lib.categoriaDeRestaurante('Sorveteria').aceito,
  'Julyan pediu "focada só em restaurante"; voltar atrás é uma linha em CATEGORIAS_VETADAS');

checar('categoria vazia não entra por omissão',
  !lib.categoriaDeRestaurante(null).aceito
    && !lib.categoriaDeRestaurante('').aceito
    && !lib.categoriaDeRestaurante('Point of interest').aceito,
  'aceitar o que não se sabe o que é enche a carteira de ruído com cara de lead');

checar('o descarte diz o motivo',
  (function () {
    const v = lib.categoriaDeRestaurante('Hotel');
    return v.motivo && v.motivo.indexOf('hotel') > -1;
  }()),
  'praça que rende pouco sem motivo escrito parece praça sem restaurante — e pode ser a '
    + 'lista de categorias cortando demais');

/* ── 2. A TRADUÇÃO NÃO PODE SER CEGA ─────────────────────────────────────────────── */

checar('a tradução aceita os apelidos conhecidos de cada campo',
  (function () {
    const a = lib.normalizarLugar({ title: 'X', ratingCount: 10, rating: 4.1, latitude: -20, longitude: -40,
      placeId: 'p1', phoneNumber: '27999', address: 'rua 1', category: 'Restaurante' });
    const b = lib.normalizarLugar({ name: 'X', reviews: 10, stars: 4.1, lat: -20, lng: -40,
      cid: 'c1', phone: '27999', address: 'rua 1', type: 'Restaurante' });
    return a && b && a.avaliacoes === 10 && b.avaliacoes === 10
      && a.nota === 4.1 && b.nota === 4.1 && a.lat === -20 && b.lat === -20
      && a.telefone === '27999' && b.telefone === '27999';
  }()),
  'eu não pude conferir a grafia contra a API; ler os dois apelidos custa nada e evita o '
    + 'pior caso desta casa — campo que chega e ninguém lê');

checar('sem nome o registro é descartado, não vira linha vazia',
  lib.normalizarLugar({ ratingCount: 900 }) === null
    && lib.normalizarLugar({}) === null
    && lib.normalizarLugar(null) === null,
  'conta sem nome na carteira do executivo é uma linha que ele não consegue nem abrir');

checar('avaliações ausente vira null, e nunca zero',
  (function () {
    const l = lib.normalizarLugar({ title: 'X', category: 'Restaurante' });
    return l && l.avaliacoes === null && l.nota === null;
  }()),
  'zero por falta de medição lê como "ninguém avaliou" e é o zero que tranquiliza');

checar('sem placeId a chave de dedup ainda existe, e o registro se declara',
  (function () {
    const l = lib.normalizarLugar({ title: 'Bar do Zé', address: 'Rua A, 10', category: 'Bar' });
    return l && l.place_id && l.place_id.indexOf('serper:') === 0 && l.semPlaceId === true;
  }()),
  'sem chave nenhuma o dedup do coletor para de funcionar e a mesma casa entra toda rodada');

/* A TRAVA PRINCIPAL: página inteira ilegível tem de VIRAR ERRO, não lista de nulls. */
checar('página inteira sem nome joga erro com a amostra crua',
  /NENHUM tinha nome/.test(fonteLib) && /JSON\.stringify\(bruto\[0\]\)/.test(fonteLib),
  'sem isto, formato mudado vira "a praça não tem restaurante" — e ninguém contesta esse zero');

checar('página inteira sem contagem de avaliações também',
  /Nenhum resultado trouxe contagem de avaliacoes/.test(fonteLib),
  'sem a contagem o corte "mais avaliados" não existe, e a rodada importaria qualquer coisa');

checar('forma de resposta desconhecida joga erro dizendo o que chegou',
  /devolveu uma forma que eu nao reconheco/.test(fonteLib)
    && /Object\.keys\(dados \|\| \{\}\)/.test(fonteLib),
  '"places" pode se chamar outra coisa; a mensagem tem de trazer as chaves reais');

/* ── 3. QUEM BUSCA NÃO DECIDE ────────────────────────────────────────────────────── */

checar('o adaptador não filtra por nota nem ordena',
  !/AVALIACOES_MINIMAS|sort\(/.test(fonteLib),
  'o corte de volume e a ordenação são do coletor; duas regras para a mesma coisa é como '
    + 'elas divergem em silêncio');

checar('o corte de volume continua no coletor',
  /const AVALIACOES_MINIMAS = \d+;/.test(coletor)
    && coletor.indexOf('.sort((a, b) => (b.avaliacoes || 0) - (a.avaliacoes || 0))') > -1,
  'se ele sair daqui, "os MAIS avaliados" deixa de ser literalmente verdade');

/* ── 4. A CHAVE ──────────────────────────────────────────────────────────────────── */

checar('o coletor e o workflow pedem a MESMA chave',
  coletor.indexOf('process.env.SERPER_API_KEY') > -1
    && workflow.indexOf('SERPER_API_KEY: ${{ secrets.SERPER_API_KEY }}') > -1,
  'nome divergente entre os dois é rodada que falha por motivo que ninguém entende');

checar('sem chave o script falha e diz onde pôr, em vez de rodar em silêncio',
  /SERPER_API_KEY ausente/.test(coletor)
    && /serper\.dev → API keys/.test(coletor)
    && coletor.indexOf('process.exit(1)') > -1,
  'rodada silenciosa que não importa nada é pior que rodada que falha e avisa');

checar('nenhuma chave foi escrita no código',
  !/[A-Za-z0-9]{32,}/.test(fonteLib.replace(/https?:\/\/\S+/g, '')),
  'chave de API mora em Secret, nunca no repositório — que é público');

/* ── 5. O MODO AMOSTRA ───────────────────────────────────────────────────────────── */

checar('existe um modo que mostra o registro cru sem importar nada',
  coletor.indexOf("process.argv.includes('--amostra')") > -1
    && coletor.indexOf('REGISTRO CRU') > -1
    && coletor.indexOf('nada foi importado') > -1,
  'a primeira rodada tem de provar a grafia dos campos ANTES de gravar na carteira de '
    + 'alguém — é o que separa "integrei" de "achei que integrei"');


/* ══ O ENDPOINT, MEDIDO E NÃO SUPOSTO (14/09/26) ═══════════════════════════════════
   Eu escolhi `/places` pelo nome. O diagnóstico bateu os dois na MESMA consulta:

     campo         /places                 /maps
     ratingCount   6                       6703
     phoneNumber   ausente                 +55 27 3100-0011
     endereço      "R. Aleixo Netto, 577"  "… - Praia do Canto, Vitória - ES, 29055-145"

   Com o /places o piso de 100 avaliações zeraria TODA rodada — verde, e trazendo nada.
   Esta guarda existe para ninguém trocar de volta por achar que "places" combina mais. */
checar('a fonte é /maps, que é a que traz avaliação, telefone e bairro',
  /const SERPER_URL = 'https:\/\/google\.serper\.dev\/maps';/.test(fonteLib),
  '/places devolve ratingCount de um dígito — com o piso de 100, a rodada importa zero '
    + 'sem erro nenhum');

/* ══ O BAIRRO É QUEM DECIDE O DONO ═════════════════════════════════════════════════
   `api/importar-leads.js` roteia por rotearTerritorio(cidade, bairro, lat, lng) e o
   BAIRRO ganha de tudo — é nele que o Julyan nomeou executivo por executivo. Sem bairro
   o lead cai na coordenada, que é a última regra da escada. */
checar('a tradução entrega bairro, cidade e estado para o roteador',
  (function () {
    const l = lib.normalizarLugar({
      title: 'Mahai', ratingCount: 6703, type: 'Restaurante',
      address: 'R. Aleixo Netto, 577 - Praia do Canto, Vitória - ES, 29055-145, Brasil'
    });
    return l && l.bairro === 'Praia do Canto' && l.cidade === 'Vitória' && l.estado === 'ES';
  }()),
  'sem bairro o lead não respeita a fronteira de rota que ele desenhou');

checar('endereço sem bairro devolve null, e não um chute',
  (function () {
    const l = lib.normalizarLugar({ title: 'X', ratingCount: 10, type: 'Restaurante', address: 'R. Aleixo Netto, 577' });
    return l && l.bairro === null && l.cidade === null;
  }()),
  'chutar bairro é pior que não ter: "Tijuca" dentro de "Barra da Tijuca" já pôs lead '
    + 'na carteira errada');

/* ══ AS COZINHAS SÃO RESTAURANTE ═══════════════════════════════════════════════════
   A primeira lista saiu da minha cabeça e cortou três de dez na amostra da Praia do
   Canto — Brasileira, Bife e Bufê — todos cliente óbvio da Takeat. O Google nomeia a
   COZINHA, não o tipo de casa. */
checar('as cozinhas que o Google escreve entram',
  ['Brasileira', 'Italiana', 'Japonesa', 'Frutos do mar', 'Bife', 'Bufê', 'Mineira',
    'Restaurante brasileira', 'Carnes'].every(c => lib.categoriaDeRestaurante(c).aceito),
  'cortar por categoria parece praça sem restaurante — some sem deixar rastro');

checar('e o veto continua ganhando delas',
  !lib.categoriaDeRestaurante('Hotel').aceito
    && !lib.categoriaDeRestaurante('Padaria').aceito
    && !lib.categoriaDeRestaurante('Restaurante do Hotel Praia').aceito,
  'ampliar a lista de aceitas não pode abrir a porta para hotel e padaria');


/* ══ ENDEREÇO DE VERDADE TEM COMPLEMENTO (14/09/26) ════════════════════════════════
   A primeira versão contava pedaço a partir do COMEÇO — `partes[1]` seria o bairro.
   Isso só vale no endereço simples. Na carga real de 209 contas, sete saíram assim:

     cidade "36"          bairro "R. Olávo Barreto Viana"
     cidade "528"         bairro "Av. Rio Branco"
     cidade "90570-040"   bairro "RS"

   Porque cada complemento ("Loja 336", "Ground floor", "Ed. Danúbio") é mais um " - " e
   empurra os índices. A âncora estável é a UF, perto do fim.

   OS CASOS ABAIXO SÃO LITERAIS DA BASE, não inventados: é o único jeito de esta guarda
   medir o que quebrou de verdade. */
(function () {
  const casos = [
    ['R. Aleixo Netto, 577 - Praia do Canto, Vitória - ES, 29055-145, Brasil',
      'Praia do Canto', 'Vitória', 'ES'],
    ['Moinhos Shopping - R. Olávo Barreto Viana, 36 - Loja 336 - Moinhos de Vento, Porto Alegre - RS, 90570-070, Brasil',
      'Moinhos de Vento', 'Porto Alegre', 'RS'],
    ['Ground floor - Praça Dr. Maurício Cardoso, 49 - Moinhos de Vento, Porto Alegre - RS, 90570-010, Brasil',
      'Moinhos de Vento', 'Porto Alegre', 'RS'],
    ['Ed. Danúbio - R. Expedicionário Aquino Araújo, 90 - Lj 03 - Centro de Vila Velha, Vila Velha - ES, 29100-032, Brasil',
      'Centro de Vila Velha', 'Vila Velha', 'ES'],
    ['Edifício River Mall - Av. Rio Branco, 528 - loja 1 - Santa Lucia, Vitória - ES, 29056-560, Brasil',
      'Santa Lucia', 'Vitória', 'ES'],
    /* sem bairro informado: cidade sai certa e bairro fica NULL — chutar poria o lead
       na carteira errada, e "Tijuca" dentro de "Barra da Tijuca" já fez isso aqui */
    ['Dinarte Ribeiro, Street, 155, Porto Alegre - RS, 90570-040, Brasil',
      null, 'Porto Alegre', 'RS'],
    ['Rua Morás, 53 Pinheiros 05434-020, São Paulo - SP, 05419-001, Brasil',
      null, 'São Paulo', 'SP']
  ];
  const erros = casos.filter(function (c) {
    const l = lib.normalizarLugar({ title: 'x', ratingCount: 500, type: 'Restaurante', address: c[0] });
    return !l || l.bairro !== c[1] || l.cidade !== c[2] || l.estado !== c[3];
  });
  checar('o endereço com complemento não vira lixo em cidade e bairro',
    erros.length === 0,
    erros.length + ' de ' + casos.length + ' endereços reais saem errados — '
      + erros.map(function (c) { return String(c[0]).slice(0, 40); }).join(' | '));
}());


/* ══ SÓ SE BUSCA ONDE TEM DONO (14/09/26, Julyan) ══════════════════════════════════
   "quero só apenas para os executivos que temos e o que voce ja sabe do bairro de cada um."

   A lista de praças era escrita à mão e já divergia do mapa real: trazia SALVADOR (39
   contas boas importadas sem dono) e bairros de São Paulo que ninguém nomeou, e NÃO
   trazia Nova Iguaçu, Canoas, Mogi, Suzano, Guarulhos — que têm dono e ficavam sem
   munição nova.

   Duas listas para a mesma pergunta divergem em silêncio. Agora é uma: o MESMO
   territorios.json que o importador usa para decidir de quem é o lead. */
(function () {
  const cidadesDoColetor = (function () {
    const m = coletor.match(/const CIDADES = \(function[\s\S]*?\}\(\)\);/);
    if (!m) return null;
    const corpo = m[0].replace("require('../data/territorios.json')",
      'require(' + JSON.stringify(path.join(raiz, 'data', 'territorios.json')) + ')');
    try {
      return new Function('require', corpo + ' return CIDADES;')(require);
    } catch (e) { return null; }
  }());

  checar('a lista de praças é DERIVADA de territorios.json, não escrita à mão',
    /require\('\.\.\/data\/territorios\.json'\)/.test(coletor)
      && !/municipio: 'Salvador'/.test(coletor),
    'lista paralela envelhece: a de 03/09 buscava Salvador, onde não há executivo, e '
      + 'ignorava cinco cidades que têm');

  checar('a derivação produz praças de verdade',
    Array.isArray(cidadesDoColetor) && cidadesDoColetor.length >= 8,
    'sem isto as checagens abaixo mediriam uma lista vazia e passariam verdes');

  if (Array.isArray(cidadesDoColetor) && cidadesDoColetor.length) {
    const territorios = require(path.join(raiz, 'data', 'territorios.json')).territorios || [];
    const ativos = territorios.filter(function (t) { return t && t.ativo !== false; });

    /* toda praça buscada tem de ter pelo menos um rep ATIVO declarado nela */
    const semDono = cidadesDoColetor.filter(function (c) {
      return !ativos.some(function (t) {
        return (t.areas || []).some(function (a) {
          return a && a.municipio === c.municipio && a.uf === c.uf;
        });
      });
    });
    checar('nenhuma praça é buscada sem executivo ativo declarado nela',
      semDono.length === 0,
      semDono.map(function (c) { return c.municipio; }).join(', ')
        + ' — foi assim que 39 restaurantes do Rio Vermelho entraram sem dono');

    /* rep inativo não gera praça: é a trava que mantém a Amanda fora */
    const inativos = territorios.filter(function (t) { return t && t.ativo === false; });
    const soDeInativo = cidadesDoColetor.filter(function (c) {
      const deAtivo = ativos.some(function (t) {
        return (t.areas || []).some(function (a) { return a && a.municipio === c.municipio; });
      });
      const deInativo = inativos.some(function (t) {
        return (t.areas || []).some(function (a) { return a && a.municipio === c.municipio; });
      });
      return deInativo && !deAtivo;
    });
    /* ══ ESTA CHECAGEM PRECISA DE TERRITÓRIO FABRICADO ═══════════════════════════
       Contra o arquivo real ela não tem dente: hoje Vitória tem a Amanda (inativa) E o
       Marco (ativo), então "cidade só de inativo" não existe, e tirar a trava do código
       passava verde. Medi isso com sabotagem antes de deixar assim.

       Então a derivação é exercitada contra um mapa inventado onde o ÚNICO rep daquela
       cidade está inativo. É o caso que a trava existe para cobrir, e é o caso que vai
       acontecer no dia em que alguém sair e ninguém assumir a praça — que já aconteceu
       uma vez aqui, com Vitória. */
    checar('praça que só tem rep inativo não é buscada',
      (function () {
        const fixture = { territorios: [
          { rep: 'Quem Saiu', ativo: false,
            areas: [{ municipio: 'Cidade Fantasma', uf: 'XX', bairros: ['Centro'] }] },
          { rep: 'Quem Ficou',
            areas: [{ municipio: 'Cidade Viva', uf: 'XX', bairros: ['Centro'] }] }
        ] };
        const arq = path.join(os.tmpdir(), 'territorios-fixture-' + process.pid + '.json');
        fs.writeFileSync(arq, JSON.stringify(fixture));
        try {
          const m = coletor.match(/const CIDADES = \(function[\s\S]*?\}\(\)\);/);
          if (!m) return false;
          const corpo = m[0].replace("require('../data/territorios.json')",
            'require(' + JSON.stringify(arq) + ')');
          const lista = new Function('require', corpo + ' return CIDADES;')(require);
          const temFantasma = lista.some(function (c) { return c.municipio === 'Cidade Fantasma'; });
          const temViva = lista.some(function (c) { return c.municipio === 'Cidade Viva'; });
          return !temFantasma && temViva;
        } finally { try { fs.unlinkSync(arq); } catch (e) {} }
      }()),
      'carregar munição para quem saiu é enchê-la numa carteira que ninguém abre — e a praça fica parecendo atendida');

    /* cidade inteira de um rep é consultada pelo nome da cidade */
    const inteiras = ativos.reduce(function (acc, t) {
      (t.areas || []).forEach(function (a) { if (a && a.todoOMunicipio) acc.push(a.municipio); });
      return acc;
    }, []);
    const faltando = inteiras.filter(function (mun) {
      const c = cidadesDoColetor.find(function (x) { return x.municipio === mun; });
      return !c || c.bairros.indexOf(mun) < 0;
    });
    checar('cidade inteira de alguém é consultada pelo nome da cidade',
      faltando.length === 0,
      faltando.join(', ') + ' — sem a consulta da cidade, quem tem o município todo só '
        + 'recebe o que cair nos bairros que OUTRO rep nomeou');
  }
}());

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('serper/places: ' + ok + ' checagens ok — só restaurante, tradução que grita quando não entende, e a chave fora do código.');
