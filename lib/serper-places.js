/* ============================================================================
   SERPER COMO FONTE DO GOOGLE MAPS (14/09/26)

   POR QUE ELE E NAO A PLACES API: a Places API (New) exige projeto no Google Cloud com
   billing ligado, e a chave nunca existiu — nem nos Secrets, nem na Vercel. O coletor
   mensal esta escrito desde 03/09 e nunca rodou uma vez por falta dela. O Serper entrega
   o MESMO dado do Google Maps por uma chave so, que o Julyan ja tem na mao.

   O QUE ESTE ARQUIVO FAZ, e so isso: busca e traduz. O corte de volume, a deduplicacao,
   o teto por praca, a ordenacao por mais avaliado, o roteamento por bairro e a importacao
   continuam onde sempre estiveram (backfill-google-places.js e api/importar-leads.js), e
   continuam sendo testados la. Mesma regra que ja vale para a Casa dos Dados: quem busca
   nao decide nada.

   ══ A REGRA QUE ESTE ARQUIVO NAO PODE QUEBRAR ═══════════════════════════════════════
   NOME DE CAMPO NAO SE ADIVINHA. Eu nao tenho a chave para testar, e ja errei aqui
   escrevendo leitor contra um formato suposto: o codigo fica valido, a resposta vem, e
   todo registro sai com null sem ninguem reclamar. Entao:

     · a traducao aceita os apelidos conhecidos de cada campo (`ratingCount`/`reviews`,
       `placeId`/`cid`, `phoneNumber`/`phone`, `latitude`/`lat`);
     · e se a PAGINA INTEIRA vier sem nome ou sem contagem de avaliacao, este arquivo
       JOGA ERRO com uma amostra crua do que chegou, em vez de devolver lista de nulls.

   Silencio aqui viraria "a praca nao tem restaurante", que e o zero que tranquiliza.
   ============================================================================ */

/* ══ /maps, E NAO /places (14/09/26) ══════════════════════════════════════════════
   Medido lado a lado na mesma consulta: /places devolve `ratingCount: 6` para uma casa
   que tem 6.703 avaliacoes, e nao traz telefone, nem bairro no endereco, nem placeId.
   Com o /places o piso de 100 avaliacoes zeraria toda rodada — verde, e trazendo nada.
   O nome do endpoint enganou; a medicao nao. */
const SERPER_URL = 'https://google.serper.dev/maps';

/* ══ SO RESTAURANTE (14/09/26, Julyan: "focada so em restaurante, pelo amor de Deus") ══
   A consulta de texto sozinha NAO resolve: pedir "restaurantes em Copacabana" no Google
   Maps devolve hotel com restaurante, shopping com praca de alimentacao e mercado com
   rotisseria. Quem separa e a CATEGORIA que volta em cada resultado.

   DUAS LISTAS, e a ordem importa: o veto passa primeiro. Um "Restaurante do Hotel X" tem
   as duas palavras, e o que ele e de verdade e hotel — quem decide compra de PDV ali e a
   rede, nao o gerente do salao.

   O QUE ESTA FORA E DECISAO, NAO ESQUECIMENTO: padaria, cafeteria, açaiteria, sorveteria
   e food truck ficaram de fora porque ele pediu restaurante. Sao uma linha para voltar —
   e a linha esta logo abaixo, nomeada. */
const CATEGORIAS_VETADAS = [
  'hotel', 'pousada', 'hostel', 'motel', 'resort',
  'shopping', 'supermercado', 'supermarket', 'mercado', 'grocery', 'atacad',
  'farmacia', 'posto de gasolina', 'gas station', 'loja', 'store',
  'academia', 'gym', 'igreja', 'church', 'escola', 'school', 'hospital',
  'padaria', 'bakery', 'confeitaria', 'sorveteria', 'ice cream', 'acai',
  'food truck', 'delivery service', 'catering'
];

/* ══ AS CATEGORIAS QUE O GOOGLE REALMENTE DEVOLVE (14/09/26) ══════════════════════
   A primeira lista saiu da minha cabeca e cortou restaurante de verdade: na amostra da
   Praia do Canto, "Tero Brasa e Vinho" (Brasileira), "By Rock Steakhouse" (Bife) e
   "Oliva" (Bufê) foram descartados — tres de dez, todos clientes obvios da Takeat.

   O Google nomeia a COZINHA, nao o tipo de casa. Sem esses nomes o filtro corta
   justamente o restaurante mais caracteristico de cada praca — e corta em silencio,
   porque descarte por categoria parece praca sem restaurante. */
const CATEGORIAS_ACEITAS = [
  /* as cozinhas, do jeito que o Google escreve em pt-BR */
  'brasileira', 'italiana', 'japonesa', 'chinesa', 'mexicana', 'portuguesa', 'arabe',
  'francesa', 'espanhola', 'peruana', 'argentina', 'alema', 'tailandesa', 'indiana',
  'mineira', 'baiana', 'nordestina', 'caseira', 'contemporanea', 'mediterranea',
  'frutos do mar', 'peixe', 'bife', 'carnes', 'grelhados', 'bufe', 'buffet',
  'restaurante', 'restaurant',
  'bar', 'gastrobar', 'pub', 'boteco', 'botequim', 'cervejaria', 'brewery', 'brewpub',
  'churrascaria', 'steak', 'rodizio',
  'pizzaria', 'pizza',
  'hamburgueria', 'burger', 'lanchonete',
  'bistro', 'bistrô', 'cantina', 'trattoria', 'osteria',
  'japones', 'japanese', 'sushi', 'temakeria',
  'chines', 'chinese', 'italiano', 'italian', 'mexicano', 'mexican', 'arabe',
  'frutos do mar', 'seafood', 'peixaria',
  'buffet', 'self service', 'self-service', 'comida caseira', 'marmit',
  'petiscaria', 'espetinho', 'casa noturna', 'night club'
];

function semAcento(s) {
  return String(s == null ? '' : s).normalize('NFD')
    .split('').filter(c => { const p = c.charCodeAt(0); return p < 0x300 || p > 0x36f; })
    .join('').toLowerCase().trim();
}

/* Devolve { aceito, motivo } — o MOTIVO existe para o log dizer por que a praca rendeu
   pouco. "12 de 60 no corte" sem dizer o que cortou os outros 48 e um numero que ninguem
   consegue contestar. */
function categoriaDeRestaurante(categoria) {
  const c = semAcento(categoria);
  if (!c) return { aceito: false, motivo: 'sem categoria' };
  const vetada = CATEGORIAS_VETADAS.find(v => c.indexOf(semAcento(v)) > -1);
  if (vetada) return { aceito: false, motivo: 'vetada (' + vetada + ')' };
  const aceita = CATEGORIAS_ACEITAS.find(a => c.indexOf(semAcento(a)) > -1);
  if (aceita) return { aceito: true, motivo: aceita };
  return { aceito: false, motivo: 'fora da lista (' + c.slice(0, 40) + ')' };
}

/* ══ DE/PARA: Serper -> o formato que o coletor ja usa ════════════════════════════════
   Os apelidos existem porque eu nao pude conferir a grafia exata contra a API. Ler os
   dois nao custa nada e evita o pior caso desta casa: campo que chega e ninguem le. */
function primeiroQueExiste(obj, nomes) {
  for (let i = 0; i < nomes.length; i++) {
    const v = obj[nomes[i]];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

/* ══ O BAIRRO, QUE E QUEM DECIDE O DONO (14/09/26) ════════════════════════════════
   `api/importar-leads.js` roteia por `rotearTerritorio(cidade, bairro, lat, lng)` e o
   BAIRRO ganha de tudo — e o Julyan nomeou bairro por executivo. Sem ele o lead cai na
   coordenada, que e a ultima regra da escada e nao respeita fronteira de rota.

   O /maps devolve o endereco completo:
     "R. Aleixo Netto, 577 - Praia do Canto, Vitória - ES, 29055-145, Brasil"
      └ logradouro ────────┘   └ bairro ──┘  └ cidade ┘ └UF┘ └ CEP ─┘ └ pais ┘

   O /places devolvia so "R. Aleixo Netto, 577" — sem bairro nenhum. E mais um motivo
   pelo qual o endpoint errado teria estragado a carga inteira em silencio.

   QUANDO NAO DA PARA SEPARAR, devolve null e deixa a coordenada decidir. Chutar bairro
   e pior que nao ter: "Tijuca" dentro de "Barra da Tijuca" ja pos lead na mao errada. */
function pedacosDoEndereco(endereco) {
  const vazio = { bairro: null, cidade: null, estado: null };
  const e = String(endereco == null ? '' : endereco).trim();
  if (!e) return vazio;
  const partes = e.split(' - ').map(function (x) { return x.trim(); }).filter(Boolean);
  /* precisa de pelo menos "logradouro - bairro, cidade - UF..." */
  if (partes.length < 2) return vazio;
  const doMeio = partes[1].split(',').map(function (x) { return x.trim(); });
  const bairro = doMeio[0] || null;
  const cidade = doMeio.length > 1 ? doMeio[1] : null;
  let estado = null;
  if (partes.length > 2) {
    const m = partes[2].match(/^([A-Za-z]{2})\b/);
    if (m) estado = m[1].toUpperCase();
  }
  return { bairro: bairro || null, cidade: cidade || null, estado: estado };
}

function normalizarLugar(p) {
  if (!p || typeof p !== 'object') return null;
  const nome = primeiroQueExiste(p, ['title', 'name', 'displayName']);
  if (!nome) return null;

  const id = primeiroQueExiste(p, ['placeId', 'place_id', 'cid', 'fid']);
  const avaliacoesCru = primeiroQueExiste(p, ['ratingCount', 'reviews', 'userRatingCount', 'user_ratings_total']);
  const notaCru = primeiroQueExiste(p, ['rating', 'stars']);
  const lat = primeiroQueExiste(p, ['latitude', 'lat']);
  const lng = primeiroQueExiste(p, ['longitude', 'lng', 'lon']);
  const categoria = primeiroQueExiste(p, ['category', 'type', 'categories', 'types']);
  const pedacos = pedacosDoEndereco(primeiroQueExiste(p, ['address', 'formattedAddress', 'formatted_address']));

  return {
    /* sem placeId o dedup do coletor perde o pe — o nome+endereco vira a chave, que e
       pior mas nao e nada. Marcado para o log saber que aconteceu. */
    place_id: id ? String(id) : ('serper:' + semAcento(nome) + '|' + semAcento(primeiroQueExiste(p, ['address']) || '')),
    semPlaceId: !id,
    nome: String(nome).trim().slice(0, 160),
    categoria: Array.isArray(categoria) ? categoria.slice(0, 3).join(', ') : (categoria ? String(categoria) : null),
    endereco: primeiroQueExiste(p, ['address', 'formattedAddress', 'formatted_address']),
    /* o bairro sai do endereco completo do /maps — ver pedacosDoEndereco */
    bairro: pedacos.bairro, cidade: pedacos.cidade, estado: pedacos.estado,
    telefone: primeiroQueExiste(p, ['phoneNumber', 'phone', 'nationalPhoneNumber']),
    nota: notaCru != null ? Number(notaCru) : null,
    avaliacoes: avaliacoesCru != null ? Number(avaliacoesCru) : null,
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null,
    site: primeiroQueExiste(p, ['website', 'site'])
  };
}

/* ══ UMA PAGINA ═══════════════════════════════════════════════════════════════════════
   `location` vai junto com o `q` de proposito: o Google Maps responde diferente conforme
   de onde a busca parte, e sem ele "restaurantes no Centro" pode cair no Centro errado
   do pais. gl/hl em pt-BR porque a categoria volta no idioma da consulta — e as duas
   listas acima estao escritas em portugues e ingles justamente porque isso pode variar. */
/* ══ O `ll` A PARTIR DA PAGINA 2 (14/09/26) ═══════════════════════════════════════
   O /maps recusa com 400 — "Parameter ll (GPS location) is required for paginated
   maps search" — toda pagina depois da primeira. O proprio endpoint devolve o `ll`
   na resposta da pagina 1, entao quem pagina ja tem o que precisa na mao: e so
   devolver junto e mandar de volta. */
async function buscarPagina(chave, consulta, local, pagina, ll) {
  if (!chave) throw new Error('SERPER_API_KEY ausente: sem ela nao ha o que buscar.');
  const corpo = { q: consulta, gl: 'br', hl: 'pt-br', page: pagina || 1 };
  if (local) corpo.location = local;
  if (ll) corpo.ll = ll;

  const resp = await fetch(SERPER_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  if (!resp.ok) {
    const txt = (await resp.text()).slice(0, 300);
    throw new Error('Serper respondeu ' + resp.status + ': ' + txt);
  }
  const dados = await resp.json();
  const bruto = Array.isArray(dados.places) ? dados.places
    : Array.isArray(dados.local_results) ? dados.local_results
      : Array.isArray(dados.results) ? dados.results : null;

  if (!bruto) {
    throw new Error('Serper devolveu uma forma que eu nao reconheco. Chaves de topo: '
      + Object.keys(dados || {}).join(', ') + '. Amostra: ' + JSON.stringify(dados).slice(0, 400));
  }
  return { bruto: bruto, cru: dados, ll: dados.ll || null };
}

/* ══ A BUSCA DE UM BAIRRO, COM A TRAVA CONTRA LEITURA CEGA ════════════════════════════
   Se a pagina veio com resultado e NENHUM deles produziu nome ou contagem de avaliacao,
   a hipotese mais provavel nao e "a praca nao tem restaurante": e a minha traducao estar
   lendo campo que nao existe. O erro traz a amostra crua para consertar em um minuto. */
async function buscarLugares(chave, consulta, opcoes) {
  const o = opcoes || {};
  const maxPaginas = o.maxPaginas || 2;
  const encontrados = [];
  const descartes = {};
  let amostraCrua = null;

  let ll = null;
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    /* ══ A PRIMEIRA PAGINA NAO SE PERDE (14/09/26) ══════════════════════════════
       Era `await` solto no laco: um 400 na pagina 2 estourava a funcao inteira e as
       20 contas boas da pagina 1 iam junto. Medido numa rodada real — 33 bairros,
       0 contas, e a Action verde. A pagina 1 continua podendo estourar: ali o erro
       e da consulta, e quem chama precisa saber. */
    let bruto, cru, llNovo;
    try {
      const r = await buscarPagina(chave, consulta, o.local, pagina, ll);
      bruto = r.bruto; cru = r.cru; llNovo = r.ll;
    } catch (e) {
      if (pagina === 1) throw e;
      console.error('[serper] ' + consulta + ' — pagina ' + pagina + ' falhou ('
        + (e && e.message ? String(e.message).slice(0, 90) : 'erro') + '); fico com o que ja veio.');
      break;
    }
    if (llNovo) ll = llNovo;
    if (!amostraCrua && bruto.length) amostraCrua = bruto[0];
    if (!bruto.length) break;

    const traduzidos = bruto.map(normalizarLugar).filter(Boolean);
    if (pagina === 1 && bruto.length > 0 && traduzidos.length === 0) {
      throw new Error('Serper devolveu ' + bruto.length + ' resultado(s) e NENHUM tinha nome '
        + 'no formato que eu leio — provavelmente a grafia dos campos mudou. Amostra crua: '
        + JSON.stringify(bruto[0]).slice(0, 500));
    }
    if (pagina === 1 && traduzidos.length && traduzidos.every(t => t.avaliacoes == null)) {
      throw new Error('Nenhum resultado trouxe contagem de avaliacoes no formato que eu leio. '
        + 'Sem ela o corte "mais avaliados" nao existe. Amostra crua: '
        + JSON.stringify(bruto[0]).slice(0, 500));
    }

    traduzidos.forEach(function (l) {
      const veredito = categoriaDeRestaurante(l.categoria);
      if (!veredito.aceito) {
        descartes[veredito.motivo] = (descartes[veredito.motivo] || 0) + 1;
        return;
      }
      encontrados.push(l);
    });
    if (bruto.length < 10) break;   /* pagina curta e o fim da lista */
  }
  return { lugares: encontrados, descartes: descartes, amostraCrua: amostraCrua };
}

module.exports = {
  SERPER_URL,
  CATEGORIAS_ACEITAS,
  CATEGORIAS_VETADAS,
  semAcento,
  categoriaDeRestaurante,
  normalizarLugar,
  buscarPagina,
  buscarLugares
};
