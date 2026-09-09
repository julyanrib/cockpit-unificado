#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════════════════
   O RADAR SEMANAL DAS PRAÇAS + AS NOTÍCIAS DO SETOR (09/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "pode colocar fontes reais da abrasel brasil inteiro, infomoney, fontes
   relevantes, coloque semanalmente para eu saber de tudo".

   Roda segunda 06h BRT (09:00 UTC) e escreve em duas tabelas: `radar_pracas` e
   `noticias_setor`. Nada aqui inventa número nem frase.

   ══ AS TRÊS MEDIÇÕES QUE DESENHARAM ESTE ARQUIVO (08/09/26) ═════════════════════════

   1. A ABRASEL PROÍBE ROBÔ NOSSO, POR ESCRITO. O robots.txt deles:
          User-agent: ClaudeBot
          Disallow: /
      com `Content-Signal: search=yes, ai-train=no, use=reference`. Então este arquivo
      NUNCA busca abrasel.com.br. A notícia deles chega pelo ÍNDICE DE BUSCA — que eles
      autorizam — e o que guardamos é manchete, data, veículo e o link para a matéria no
      site deles. Zero texto copiado. É a diferença entre citar e coletar.

   2. FEED DE VEÍCULO NÃO FAZ RADAR SETORIAL. Medido: InfoMoney, 0 de 10 itens relevantes
      (o feed é uma janela de 10 e naquele dia era resultado da Quina e acordo comercial
      dos EUA). Agência Brasil, 1 e 4 de 10 — e esses eram FALSO POSITIVO: "desfile de 7
      de Setembro" casa com a palavra "bar" porque ela está dentro de "Brasília". Por isso
      o filtro por palavra aqui exige limite de palavra e a consulta por TEMA é a fonte
      principal, não o feed genérico.

   3. SEIS DE DEZ FONTES ESPECIALIZADAS NÃO SERVEM. Portal No Varejo responde sem itens;
      Food Magazine, Bar e Restaurante, Panorama Gastronômico e FoodServiceNews não
      respondem; Mercado&Consumo e Cozinha Profissional devolvem 200 com item mais novo de
      28 e 46 dias. Feed morto respondendo 200 é o pior caso, porque parece funcionar —
      então este arquivo DESCARTA item mais velho que JANELA_DIAS e conta quantos cada
      fonte trouxe, para uma fonte que morrer aparecer como fonte sem item.
   ══════════════════════════════════════════════════════════════════════════════════════ */

const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CASADOSDADOS_TOKEN = process.env.CASADOSDADOS_TOKEN;

/* só entra notícia da semana. 8 dias e não 7 para não perder a matéria de segunda cedo
   publicada antes da rodada. */
const JANELA_DIAS = 8;
const MAX_POR_TEMA = 8;
const MAX_POR_FEED = 12;

/* ── AS FONTES ────────────────────────────────────────────────────────────────────────
   `feed` = RSS do próprio veículo, lido direto. Só as que passaram nas três perguntas:
   responde, está viva, e o robots permite.
   `filtro: true` = veículo generalista, cujo item só entra se casar uma palavra do setor. */
const FEEDS = [
  { fonte: 'Food Connection', url: 'https://foodconnection.com.br/feed/', filtro: false },
  { fonte: 'Agência Sebrae', url: 'https://agenciasebrae.com.br/feed/', filtro: true },
  { fonte: 'Hotelier News', url: 'https://hoteliernews.com.br/feed/', filtro: true },
  { fonte: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', filtro: true },
  { fonte: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', filtro: true }
];

/* ── OS TEMAS ─────────────────────────────────────────────────────────────────────────
   Consulta por assunto no índice de notícias, que é o que traz a Abrasel, o Sebrae, o G1
   e a imprensa regional falando do setor na semana. Cada tema é uma linha do radar. */
const TEMAS = [
  { tema: 'bares e restaurantes', q: '"bares e restaurantes" OR "food service"' },
  { tema: 'delivery e apps', q: '(delivery OR iFood OR Rappi) (restaurante OR bar OR gastronomia)' },
  { tema: 'custos e tributos', q: '("reforma tributária" OR "Simples Nacional" OR "vale-refeição") (restaurante OR bar OR "food service")' },
  { tema: 'consumo fora do lar', q: '"alimentação fora do lar" OR "consumo fora do lar"' }
];

/* as palavras que fazem um item de veículo generalista interessar a quem vende PDV para
   bar e restaurante. Casadas com limite de palavra — ver a medição 2 no cabeçalho. */
const PALAVRAS = ['restaurante', 'restaurantes', 'bar', 'bares', 'lanchonete', 'padaria',
  'pizzaria', 'churrascaria', 'gastronomia', 'delivery', 'ifood', 'rappi', 'abrasel',
  'cardápio', 'garçom', 'foodservice', 'food service', 'alimentação fora do lar',
  'consumo fora do lar', 'vale-refeição', 'vale refeição', 'simples nacional',
  'reforma tributária', 'maquininha', 'bebidas'];

/* ══ BAIXAR, COM REDIRECIONAMENTO E SEM TRAVAR A RODADA ═══════════════════════════════
   Fonte fora do ar não pode derrubar o job: devolve corpo vazio e o resumo conta como
   fonte sem item. O robô existe para trazer o que der. */
function baixar(url, saltos) {
  saltos = saltos || 0;
  return new Promise(resolve => {
    if (saltos > 3) return resolve({ status: 0, corpo: '' });
    const lib = url.startsWith('http://') ? http : https;
    let req;
    try {
      req = lib.get(url, {
        headers: { 'User-Agent': 'CockpitTakeat/1.0 (+radar semanal do setor de food service)' },
        timeout: 15000
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const prox = res.headers.location.startsWith('http')
            ? res.headers.location : new URL(res.headers.location, url).href;
          return resolve(baixar(prox, saltos + 1));
        }
        let d = '';
        res.on('data', c => { d += c; });
        res.on('end', () => resolve({ status: res.statusCode, corpo: d }));
      });
    } catch (e) { return resolve({ status: 0, corpo: '' }); }
    req.on('error', () => resolve({ status: 0, corpo: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, corpo: '' }); });
  });
}

/* Sem acento, sem caixa e sem pontuação. As DUAS metades do radar dependem disto — o
   filtro de época e o dedupe por história, aqui; e o casamento de cidade, mais abaixo. A
   substituição usa String.fromCharCode porque a faixa de acentos escrita literalmente já
   morreu duas vezes atravessando patch e shell nesta base. */
const semAcento = t => String(t || '').toLowerCase().normalize('NFD')
  .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const limpar = s => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

function itensDoXml(xml) {
  return [...String(xml || '').matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(m => {
    const b = m[0];
    const pega = re => (b.match(re) || [])[1] || '';
    return {
      titulo: limpar(pega(/<title>([\s\S]*?)<\/title>/)),
      url: limpar(pega(/<link>([\s\S]*?)<\/link>/)) || limpar(pega(/<guid[^>]*>([\s\S]*?)<\/guid>/)),
      publicado: pega(/<pubDate>([^<]+)<\/pubDate>/),
      descricao: limpar(pega(/<description>([\s\S]*?)<\/description>/)),
      veiculo: limpar(pega(/<source[^>]*>([^<]+)<\/source>/))
    };
  });
}

/* LIMITE DE PALAVRA, e é o que separa notícia de coincidência: sem ele, "Brasília" casa
   com "bar" e o desfile de 7 de Setembro entra como notícia de bar — aconteceu na
   medição. */
function ehDoSetor(txt) {
  const t = ' ' + String(txt || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
  return PALAVRAS.some(p => {
    const alvo = p.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return new RegExp('(^|[^a-z0-9])' + alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(t);
  });
}

/* ══ UM VEÍCULO, UM NOME (09/09/26) ════════════════════════════════════════════════════
   O índice devolve o veículo às vezes pelo nome ("Food Connection") e às vezes pelo
   domínio ("foodconnection.com.br"). Na primeira rodada os dois apareceram como fontes
   SEPARADAS, e a tela creditaria o mesmo site duas vezes com nomes diferentes.

   A lista de fora é derivada de FEEDS, para o nome que a tela mostra ser o mesmo que a
   fonte já tem — sem uma segunda tabela de nomes para divergir. O que não estiver nela e
   vier como domínio recebe o domínio limpo, sem www e sem .com.br: melhor "gazetasp" do
   que "gazetasp.com.br", e nunca um nome inventado por mim para um site que eu não sei
   como se chama. */
const DOMINIO_DO_FEED = FEEDS.reduce((m, f) => {
  try { m[new URL(f.url).host.replace(/^www\./, '')] = f.fonte; } catch (e) { /* ignora */ }
  return m;
}, {});

function nomeDoVeiculo(bruto) {
  const t = String(bruto || '').trim();
  if (!t) return '';
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return t;   // já é nome de gente
  const host = t.toLowerCase().replace(/^www\./, '');
  if (DOMINIO_DO_FEED[host]) return DOMINIO_DO_FEED[host];
  const curto = host.replace(/\.(com|net|org|gov|edu|inf|jor)?\.?br$/, '').replace(/\.(com|net|org)$/, '');
  /* maiúscula na primeira letra: "abrasel" na tela ao lado de "Estadão" parece erro
     nosso, e é só o índice tendo mandado o domínio em vez do nome. O que não se faz é
     tentar adivinhar o resto — "bemparana" não vira "Bem Paraná" por chute. */
  return curto.charAt(0).toUpperCase() + curto.slice(1);
}

/* ══ A MANCHETE DE OUTRA ÉPOCA ═════════════════════════════════════════════════════════
   Medido na primeira rodada: o gazetasp veio com pubDate DESTA semana e conteúdo de 9 de
   julho ("esperam faturar no feriado de 9 de Julho"). O índice reindexou uma matéria
   velha, e o filtro de data — que só olha a data do índice — deixou passar.

   A REGRA É ESTREITA DE PROPÓSITO: só reprova quando o título NOMEIA um mês, e esse mês
   está a mais de um mês de distância da publicação. "feriado de 7 de setembro" numa
   notícia de setembro passa; "feriado de 9 de julho" numa de setembro, não. Mês citado
   por acaso é raro em manchete, e uma regra mais larga começaria a jogar fora notícia
   boa — que é o erro pior aqui. */
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function ehDeOutraEpoca(titulo, quando) {
  const t = ' ' + semAcento(titulo) + ' ';
  const mesPub = quando.getUTCMonth();
  for (let i = 0; i < MESES.length; i++) {
    if (new RegExp('(^|[^a-z])' + MESES[i] + '([^a-z]|$)').test(t)) {
      /* distância circular: dezembro e janeiro são vizinhos */
      const d = Math.abs(i - mesPub);
      if (Math.min(d, 12 - d) > 1) return true;
    }
  }
  return false;
}

/* ══ RANQUEAR, NÃO FILTRAR MAIS (09/09/26) ═════════════════════════════════════════════
   Depois de consertar os cinco defeitos da primeira rodada, sobraram 33 manchetes de 32
   veículos — e eu li as 33. As boas são MUITO boas: "lucro chega a só 32% dos bares do
   RN", "alimentação fora do lar movimenta R$ 287,9 bilhões", "metade dos bares gaúchos
   com faturamento em alta" (a praça da Kelly), o Magalu entrando em delivery contra o
   iFood, a briga do vale-refeição em cinco veículos.

   Só que ao lado delas ficaram: "morango cravejado", "Dia do Açaí", "Prefeitura de
   Valença busca investimentos", o Salão Abrasel em três matérias diferentes, e um texto
   do Estúdio Folha — que é conteúdo patrocinado. Nenhum é falso positivo de palavra:
   todos citam gastronomia ou restaurante de verdade. Filtro de palavra não separa
   "notícia que muda meu mês" de "evento regional" e "release".

   ENTÃO NADA MAIS É JOGADO FORA POR JULGAMENTO DE ASSUNTO — É RANQUEADO, e o motivo do
   lugar vai gravado ao lado da nota. A tela mostra as primeiras e guarda o resto atrás de
   "ver todas": quem quiser conferir o que eu rebaixei, confere. Filtro escondido decide
   pelo gestor; nota com motivo deixa ele discordar de mim.

   OS TRÊS SINAIS, e por que cada um:
   · NÚMERO NO TÍTULO vale mais que tudo. Manchete com R$, % ou "32%" carrega fato
     verificável; sem número é quase sempre opinião, evento ou anúncio.
   · VEÍCULO QUE PESA no setor: entidade (Abrasel, Sebrae), imprensa econômica e os
     grandes. Não é esnobismo com a imprensa regional — o Agora RN tem a melhor manchete
     desta semana e sobe pelo número. É que release republicado sai em dez sites pequenos.
   · MARCA DE RELEASE derruba: "Salão", "Feira", "Encontro", "Prefeitura", "oferece
     desconto", "Estúdio". São textos escritos para divulgar, não para informar. */
const VEICULOS_QUE_PESAM = ['abrasel', 'sebrae', 'exame', 'infomoney', 'valor', 'estadao',
  'folha', 'globo', 'g1', 'cnn', 'terra', 'monitor mercantil', 'food connection',
  'hotelier news', 'seu dinheiro', 'veja', 'agencia brasil', 'canaltech', 'tecnoblog'];

const MARCAS_DE_RELEASE = ['salao', 'feira', 'encontro', 'congresso', 'prefeitura',
  'estudio', 'patrocinado', 'oferece desconto', 'promove', 'reune negocios', 'workshop',
  'oficina', 'lanca campanha', 'comemorar'];

function relevancia(titulo, fonte) {
  const t = semAcento(titulo);
  const f = semAcento(fonte);
  let nota = 0;
  const motivos = [];

  /* R$ e % precisam do título CRU: semAcento come a pontuação */
  if (/R\$|\d+%|\d+,\d+\s*%/.test(String(titulo))) { nota += 3; motivos.push('número no título'); }
  else if (/\b\d{2,}\b/.test(t)) { nota += 1; motivos.push('quantidade no título'); }

  if (VEICULOS_QUE_PESAM.some(v => f.indexOf(v) > -1)) { nota += 2; motivos.push('veículo de peso no setor'); }

  const release = MARCAS_DE_RELEASE.filter(m => t.indexOf(m) > -1);
  if (release.length) { nota -= 3; motivos.push('cara de divulgação ("' + release[0] + '")'); }

  /* ══ E A MARCA PODE ESTAR NO NOME DA FONTE ═══════════════════════════════════════════
     "Estúdio Folha" é o braço de conteúdo PATROCINADO da Folha, e o item dele ("99Food
     ajuda restaurantes a vender mais") subiu para 3 na primeira medição do ranking, acima
     de matéria editorial de verdade. "Sala da Notícia" é plataforma de distribuição de
     release. O texto pode até ter número; o que ele não tem é jornalista.
     A LISTA É CURTA E VAI PRECISAR CRESCER — e isso está ok justamente porque a nota e o
     motivo aparecem na tela: quando um release passar na frente, o Julyan vê o motivo e
     me diz o nome, em vez de perder a confiança no bloco todo. */
  const FONTES_DE_RELEASE = ['sala da noticia', 'estudio', 'assessoria', 'press'];
  const fr = FONTES_DE_RELEASE.filter(m => f.indexOf(m) > -1);
  if (fr.length) { nota -= 4; motivos.push('conteúdo patrocinado ou release ("' + fr[0] + '")'); }

  /* o que o gestor vende: quem fala de margem, custo, imposto e app está falando do
     problema que o PDV resolve */
  if (/\b(lucro|margem|faturamento|custo|custos|imposto|tributaria|inadimplencia|endividamento|ticket medio|delivery|ifood|rappi|maquininha|vale refeicao)\b/.test(t)) {
    nota += 2; motivos.push('fala de dinheiro do dono');
  }

  return { nota, motivo: motivos.length ? motivos.join(' · ') : 'sem sinal forte' };
}

function segundaDaSemana(d) {
  const base = d ? new Date(d) : new Date();
  const dow = (base.getUTCDay() + 6) % 7;
  const seg = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - dow));
  return seg.toISOString().slice(0, 10);
}

async function coletarNoticias(semana) {
  const achados = [];
  const porFonte = {};
  const limite = Date.now() - JANELA_DIAS * 86400000;

  /* ── os feeds dos veículos ─────────────────────────────────────────────────────── */
  for (const f of FEEDS) {
    const r = await baixar(f.url);
    const itens = itensDoXml(r.corpo);
    let entraram = 0;
    itens.slice(0, MAX_POR_FEED).forEach(it => {
      if (!it.titulo || !it.url) return;
      const quando = it.publicado ? new Date(it.publicado) : null;
      if (!quando || isNaN(quando.getTime()) || quando.getTime() < limite) return;
      if (f.filtro && !ehDoSetor(it.titulo + ' ' + it.descricao)) return;
      const rel = relevancia(it.titulo, f.fonte);
      achados.push({
        titulo: it.titulo, fonte: f.fonte, origem: 'feed_setorial', url: it.url,
        publicado_em: quando.toISOString(), tema: f.filtro ? 'setor na imprensa' : 'food service',
        praca: null, data_semana: semana,
        relevancia: rel.nota, relevancia_motivo: rel.motivo
      });
      entraram++;
    });
    porFonte[f.fonte] = { itens: itens.length, entraram, http: r.status };
  }

  /* ── as consultas por tema ─────────────────────────────────────────────────────── */
  for (const t of TEMAS) {
    const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(t.q + ' when:' + JANELA_DIAS + 'd')
      + '&hl=pt-BR&gl=BR&ceid=BR:pt-419';
    const r = await baixar(url);
    const itens = itensDoXml(r.corpo);
    let entraram = 0;
    let candidatos = 0;
    itens.forEach(it => {
      if (entraram >= MAX_POR_TEMA) return;
      if (!it.titulo || !it.url) return;
      const quando = it.publicado ? new Date(it.publicado) : null;
      if (!quando || isNaN(quando.getTime()) || quando.getTime() < limite) return;
      const titulo = it.titulo.replace(/ - [^-]{3,40}$/, '');
      candidatos += 1;
      /* ══ O TEMA TAMBÉM PASSA PELO FILTRO DO SETOR (09/09/26) ═══════════════════════
         Eu aplicava `ehDoSetor` só nos feeds, supondo que uma consulta por assunto já
         devolvia assunto. MEDIDO nas 36 da primeira rodada: doze eram ruído — "morango
         cravejado", "TikTok ClubHouse desembarca no Brasil", "Dia do Açaí", "Connecta
         Minas", "Prefeitura de Valença busca investimentos". A consulta é OR de termos
         largos; quem garante o assunto é o filtro, não a pergunta. */
      if (!ehDoSetor(titulo + ' ' + it.descricao)) return;
      /* ══ E A MANCHETE NÃO PODE SER DE OUTRA ÉPOCA ═════════════════════════════════
         O gazetasp entrou com pubDate desta semana e conteúdo de 9 de JULHO: "hotéis,
         bares e restaurantes esperam faturar no feriado de 9 de Julho". O filtro de data
         olhava a data do índice; o texto dizia outra coisa. */
      if (ehDeOutraEpoca(titulo, quando)) return;
      /* o veículo vem no <source> do item; sem ele, o tema responde pela procedência */
      const veiculo = nomeDoVeiculo(it.veiculo) || 'imprensa';
      const rel = relevancia(titulo, veiculo);
      achados.push({
        titulo: titulo, fonte: veiculo,
        origem: 'consulta_tema', url: it.url,
        publicado_em: quando.toISOString(), tema: t.tema, praca: null, data_semana: semana,
        relevancia: rel.nota, relevancia_motivo: rel.motivo
      });
      entraram++;
    });
    porFonte['tema: ' + t.tema] = { itens: itens.length, candidatos, entraram, http: r.status };
  }

  /* ══ DEDUPE EM DUAS CAMADAS ═════════════════════════════════════════════════════════
     POR URL, antes de gravar: duas consultas de tema trazem a mesma matéria com
     frequência, e o unique da tabela recusaria o LOTE inteiro em vez de a linha.

     E POR HISTÓRIA, que a de URL não pega: "Cármen Lúcia mantém teto para taxas do
     vale-refeição em ação no STF" entrou pela Folha PE e pelo O GLOBO na primeira
     rodada — dois links, duas fontes, uma notícia. Na tela do gestor isso é a mesma
     linha duas vezes. A chave é o título sem acento, sem pontuação e sem as palavras
     de ligação.

     QUEM FICA É A DE MAIOR NOTA, não a primeira que apareceu. A ordem de coleta é
     acidental — depende de qual tema respondeu antes —, e deixar o acidente escolher
     entre o O GLOBO e um agregador é deixar o sorteio decidir o que o gestor lê. */
  const LIGACAO = ['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no',
    'na', 'nos', 'nas', 'para', 'por', 'com', 'que', 'ao', 'aos', 'um', 'uma', 'se'];
  const chaveDaHistoria = t => semAcento(t).split(' ')
    .filter(p => p.length > 2 && LIGACAO.indexOf(p) < 0).slice(0, 8).join(' ');

  const porNota = achados.slice().sort((a, b) => {
    if (b.relevancia !== a.relevancia) return b.relevancia - a.relevancia;
    /* empate: o feed do veículo especializado ganha do índice, e depois a mais nova */
    if (a.origem !== b.origem) return a.origem === 'feed_setorial' ? -1 : 1;
    return String(b.publicado_em).localeCompare(String(a.publicado_em));
  });

  const urlsVistas = new Set();
  const historiasVistas = new Set();
  const unicos = porNota.filter(a => {
    if (urlsVistas.has(a.url)) return false;
    const h = chaveDaHistoria(a.titulo);
    if (h && historiasVistas.has(h)) return false;
    urlsVistas.add(a.url);
    if (h) historiasVistas.add(h);
    return true;
  });
  return { noticias: unicos, porFonte };
}

/* ══ AS PRAÇAS VÊM DE UM LUGAR SÓ ══════════════════════════════════════════════════════
   CIDADES é a lista que o backfill de segunda já usa para buscar contas. Copiá-la aqui
   criaria a sexta ocorrência do problema que passei a semana consertando: a mesma regra
   escrita em dois lugares, divergindo em silêncio. O require é seguro — aquele arquivo
   tem guarda `require.main === module` e não roda nada ao ser importado. */
const { CIDADES } = require('./backfill-casa-dos-dados');

/* ══ O TAM DE UMA PRAÇA, PELO CAMINHO BARATO ═══════════════════════════════════════════
   A Casa dos Dados é paga por consulta. Contar a cidade inteira paginando custaria
   crédito toda semana, em seis praças — e o número não vale isso.

   ENTÃO A TENTATIVA É UMA CONSULTA DE UM ITEM, lendo qualquer campo de total que a
   resposta traga. A documentação pública do provedor NÃO expõe o schema da resposta
   (conferido em docs.casadosdados.com.br: a página de informações básicas tem
   autenticação, host e um exemplo de /v4, e nada do retorno de /v5/cnpj/pesquisa), e o
   token vive só nos Secrets — então não posso provar, antes de a primeira rodada correr,
   que existe campo de total. Por isso a função procura os nomes prováveis e, quando não
   acha, devolve 'nao_medido' COM O MOTIVO ESCRITO, que a tela mostra.

   O QUE ELA NUNCA FAZ: devolver zero. TAM zero numa cidade com restaurantes é o número
   que faria a tela dizer "0% tocado" e o gestor decidir por um dado inexistente.

   O CORPO DA CONSULTA É O MESMO do backfill, MENOS os filtros que estreitam: sem janela
   de data_abertura, sem excluir MEI, sem exigir telefone. Aqui a pergunta é "quantos
   estabelecimentos food ativos a cidade tem", não "quais valem uma visita". */
const CASA_URL = 'https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo';
const CNAE_FOODSERVICE = ['5611201', '5611202', '5611203', '5611204', '5620104', '4721102', '1091102'];
const CAMPOS_DE_TOTAL = ['total', 'total_registros', 'totalRegistros', 'count', 'quantidade',
  'total_encontrados', 'totalEncontrados', 'registros_encontrados'];

/* Procura em profundidade, porque provedor nenhum promete o total na raiz — e devolve o
   CAMINHO do campo, não só o número, para `tam_detalhe` poder dizer de onde ele veio. */
function acharTotal(obj, prof) {
  prof = prof || 0;
  if (!obj || typeof obj !== 'object' || prof > 3) return null;
  for (const c of CAMPOS_DE_TOTAL) {
    const v = obj[c];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return { campo: c, valor: Math.round(v) };
    if (typeof v === 'string' && /^\d+$/.test(v)) return { campo: c, valor: Number(v) };
  }
  for (const k of Object.keys(obj)) {
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      const achado = acharTotal(obj[k], prof + 1);
      if (achado) return { campo: k + '.' + achado.campo, valor: achado.valor };
    }
  }
  return null;
}

async function tamDaPraca(municipio, uf) {
  const token = process.env.CASADOSDADOS_TOKEN;
  if (!token) {
    return { tam: null, fonte: 'nao_medido', detalhe: 'CASADOSDADOS_TOKEN ausente nesta rodada' };
  }
  const corpo = JSON.stringify({
    codigo_atividade_principal: CNAE_FOODSERVICE,
    situacao_cadastral: ['ATIVA'],
    uf: [String(uf).toLowerCase()],
    municipio: [semAcento(municipio)],
    limite: 1,
    pagina: 1
  });
  /* as mesmas quatro variantes de cabeçalho do backfill. A lista existe porque a API já
     trocou o nome do header uma vez, e descobrir isso num domingo custa a rodada. */
  const variantes = [{ 'api-key': token }, { api_key: token },
    { Authorization: 'Bearer ' + token }, { 'x-api-key': token }];
  let ultimoErro = 'a API não respondeu';
  for (const h of variantes) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(CASA_URL, {
        method: 'POST', signal: ctrl.signal,
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: corpo
      });
      clearTimeout(timer);
      const texto = await r.text();
      if (!r.ok) { ultimoErro = 'a API respondeu ' + r.status; continue; }
      let j = null;
      try { j = JSON.parse(texto); } catch (e) { j = null; }
      if (!j) { ultimoErro = 'a API respondeu 200 com corpo que nao e JSON'; continue; }
      const achado = acharTotal(j);
      if (achado) {
        return { tam: achado.valor, fonte: 'contagem_api',
          detalhe: 'campo "' + achado.campo + '" da Casa dos Dados · '
            + CNAE_FOODSERVICE.length + ' CNAEs food, situação ATIVA' };
      }
      /* Respondeu, autenticou, e não trouxe total. Este é o caso que a coluna tam_fonte
         existe para dizer — e paginar a cidade toda semana para contar é o que não vamos
         fazer com crédito pago. */
      return { tam: null, fonte: 'nao_medido',
        detalhe: 'a Casa dos Dados autenticou e respondeu sem campo de total (procurei '
          + CAMPOS_DE_TOTAL.length + ' nomes); contar paginando a cidade queimaria crédito toda semana' };
    } catch (e) {
      clearTimeout(timer);
      ultimoErro = e.name === 'AbortError' ? 'a API não respondeu em 20s' : e.message;
    }
  }
  return { tam: null, fonte: 'nao_medido', detalhe: ultimoErro };
}

/* ══ QUANTO DA PRAÇA JÁ FOI TOCADO ═════════════════════════════════════════════════════
   `tocado` = negócios do funil de Field Sales cuja cidade é a da praça, EM QUALQUER
   ETAPA — inclusive Perdido. Perdido é conta tocada: quem já foi visitado e disse não
   não é mercado virgem, e contá-lo como não-tocado inflaria o que resta a fazer.

   ══ O QUE EU MEDI NO SNAPSHOT AO VIVO, E O QUE ISSO OBRIGA A ESCREVER ═══════════════
   196 negócios no funil; 153 têm `cidade` preenchida e 43 NÃO TÊM NENHUMA. Esses 43 não
   entram em praça alguma — então `tocado` é PISO, nunca total, e a leitura da linha diz
   isso com o número na cara. Sem essa frase, seis praças mostrariam cobertura menor que a
   real e ninguém saberia por quê.

   `clientes` FICA NULO, de propósito. Não existe no Cockpit base de clientes ativos: o
   snapshot do CRM tem o funil de Field Sales, e o mais perto de "cliente" ali é a etapa
   Enviado Onboarding, com 6 negócios no Brasil inteiro. Escrever 6 na coluna clientes de
   uma praça seria inventar. A coluna existe para quando a fonte existir; até lá a tela
   escreve "não medido", que é a verdade. */
const ETAPA_PERDIDO = '1396006164';

function contarTocado(snapshotHubspot) {
  const funil = (snapshotHubspot && snapshotHubspot.funilLeads) || {};
  const porCidade = new Map();
  let total = 0, semCidade = 0;
  Object.keys(funil).forEach(etapa => {
    const lista = Array.isArray(funil[etapa]) ? funil[etapa] : [];
    lista.forEach(l => {
      total += 1;
      const c = semAcento(l && l.cidade);
      if (!c) { semCidade += 1; return; }
      const atual = porCidade.get(c) || { n: 0, perdidos: 0 };
      atual.n += 1;
      if (String(etapa) === ETAPA_PERDIDO) atual.perdidos += 1;
      porCidade.set(c, atual);
    });
  });
  return { porCidade, total, semCidade };
}

/* ══ "MACEIO - AL" E "MACEIO" SÃO A MESMA CIDADE ══════════════════════════════════════
   O CRM guarda `cidade` como texto livre, e às vezes com a UF colada — no snapshot de
   09/09/26 há exatamente esse caso. Então a comparação tira uma UF do fim, quando ela
   está lá, e só depois compara por igualdade.

   O QUE ELA NÃO PODE FAZER, e a primeira versão fazia: casar por prefixo. `startsWith`
   punha "Vitória da Conquista"/BA dentro de Vitória/ES — a suite pegou isso com uma
   linha de fixture, e o efeito na tela seria cobertura inflada numa praça, com o número
   vindo de outro estado. UF é lista fechada de 27; nome de cidade não é. */
const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt',
  'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to'];

function semUfNoFim(cidade) {
  const partes = String(cidade || '').split(' ').filter(Boolean);
  if (partes.length > 1 && UFS.indexOf(partes[partes.length - 1]) > -1) {
    return partes.slice(0, -1).join(' ');
  }
  return partes.join(' ');
}

function tocadoDaPraca(contagem, municipio) {
  const alvo = semUfNoFim(semAcento(municipio));
  let n = 0, perdidos = 0;
  contagem.porCidade.forEach((v, cidade) => {
    if (semUfNoFim(cidade) === alvo) { n += v.n; perdidos += v.perdidos; }
  });
  return { tocado: n, perdidos };
}

/* ══ A LEITURA DA SEMANA ═══════════════════════════════════════════════════════════════
   Montada dos números DESTA linha, sem IA e sem adjetivo que os números não sustentem.
   Quem decide a palavra é `tam_fonte`, não a existência do número. */
/* ══ O NOME DO DENOMINADOR (09/09/26) ══════════════════════════════════════════════════
   A primeira versão escrevia "estabelecimentos food da cidade". EXAGERA, e o exagero
   muda a decisão: são 142.319 em São Paulo, contra as 40 a 50 mil que o setor estima de
   restaurante OPERANDO. A diferença é MEI parado, CNPJ registrado e não aberto, padaria
   de varejo — tudo ativo na Receita e nada disso um cliente possível.
   Com o nome certo, o 0,01% é o que é: fatia da base de CNPJ. Com o nome errado, faz
   parecer que o time não começou. */
const NOME_DO_TAM = 'CNPJs food ativos na Receita';

function leituraDaPraca(linha, semCidade) {
  const partes = [];
  if (linha.tam_fonte === 'contagem_api' && linha.tam > 0) {
    const pct = linha.pct_tocado == null ? null : String(linha.pct_tocado).replace('.', ',');
    partes.push(linha.tocado + ' de ' + linha.tam.toLocaleString('pt-BR') + ' '
      + NOME_DO_TAM + ' já estão no CRM'
      + (pct == null ? '' : ' (' + pct + '%)'));
  } else if (linha.tam_fonte === 'piso_paginado' && linha.tam > 0) {
    partes.push(linha.tocado + ' no CRM, contra pelo menos '
      + linha.tam.toLocaleString('pt-BR') + ' ' + NOME_DO_TAM);
  } else {
    partes.push(linha.tocado + ' contas da praça no CRM · tamanho do mercado não medido nesta rodada');
  }
  /* A CONCORDÂNCIA IMPORTA porque isto é frase de tela, não log: "1 negócios estão sem
     cidade" é a linha que faz alguém duvidar do resto dos números. */
  if (linha.perdidos > 0) {
    partes.push(linha.perdidos + (linha.perdidos === 1 ? ' já perdido' : ' já perdidos'));
  }
  if (semCidade > 0) {
    partes.push(semCidade === 1
      ? '1 negócio do time está sem cidade no CRM e fica fora de toda praça'
      : semCidade + ' negócios do time estão sem cidade no CRM e ficam fora de toda praça');
  }
  return partes.join(' · ') + '.';
}

/* ══ GRAVAR ════════════════════════════════════════════════════════════════════════════
   Sem service_role não grava e DIZ. Rodada que "passa" sem escrever é a pior mentira que
   um robô conta: o log fica verde e a tela mostra a semana passada como se fosse esta. */
async function gravar(tabela, linhas, conflito) {
  if (!linhas.length) return { ok: true, gravadas: 0 };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return { ok: false, erro: 'SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes' };
  const alvo = url + '/rest/v1/' + tabela + (conflito ? '?on_conflict=' + conflito : '');
  try {
    const r = await fetch(alvo, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(linhas)
    });
    const txt = await r.text();
    if (!r.ok) return { ok: false, erro: r.status + ' ' + txt.slice(0, 240) };
    let volta = [];
    try { volta = JSON.parse(txt || '[]'); } catch (e) { volta = []; }
    return { ok: true, gravadas: Array.isArray(volta) ? volta.length : 0 };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

/* ══ A RODADA ══════════════════════════════════════════════════════════════════════════
   Julyan: "coloque semanalmente para eu saber de tudo". Segunda de manhã, antes de ele
   abrir a aba.

   NÃO ABORTA NA PRIMEIRA FALHA. Notícia e TAM são independentes: feed fora do ar não
   pode impedir o radar das praças de gravar, e a Casa dos Dados fora do ar não pode
   apagar as manchetes da semana. O que cada metade não conseguiu vira linha no resumo do
   workflow, e o processo só sai com erro se NENHUMA das duas gravou. */
async function rodar() {
  /* segundaDaSemana devolve 'AAAA-MM-DD', que é o que a coluna date espera e o que
     coletarNoticias já grava em cada linha. A primeira versão daqui chamava
     .toISOString() no retorno e derrubava a rodada na segunda linha — defeito que build
     e suite de regex não veem, e que só apareceu quando eu rodei. */
  const dataSemana = segundaDaSemana(new Date());
  console.log('[radar-semanal] semana de ' + dataSemana);

  const problemas = [];
  let gravouAlgo = false;

  /* ── as notícias ─────────────────────────────────────────────────────────────────── */
  let nNoticias = 0;
  try {
    const { noticias, porFonte } = await coletarNoticias(dataSemana);
    /* CADA FONTE APARECE COM TRÊS NÚMEROS: http, itens que ela trouxe e itens que
       entraram. É assim que se vê no log de segunda a diferença entre "feed morto" e
       "feed vivo sem notícia do setor nesta semana" — os dois dariam 0 entraram. */
    Object.keys(porFonte).forEach(f => {
      const p = porFonte[f] || {};
      console.log('  ' + f + ': http ' + p.http + ' · ' + p.itens + ' itens · '
        + p.entraram + ' entraram');
    });
    if (!noticias.length) {
      problemas.push('nenhuma notícia do setor nesta janela de ' + JANELA_DIAS + ' dias');
    } else {
      const r = await gravar('noticias_setor', noticias.map(n => Object.assign({}, n, {
        data_semana: dataSemana
      })), 'url');
      if (r.ok) {
        nNoticias = r.gravadas;
        gravouAlgo = true;
        console.log('  gravadas: ' + r.gravadas + ' de ' + noticias.length + ' coletadas');
      } else {
        problemas.push('gravar notícias: ' + r.erro);
      }
    }
  } catch (e) {
    problemas.push('coletar notícias: ' + (e.message || e));
  }

  /* ── o radar das praças ──────────────────────────────────────────────────────────── */
  let nPracas = 0;
  try {
    const { lerSnapshot } = require('../lib/publicar-snapshot');
    const hub = await lerSnapshot('hubspot');
    if (!hub) throw new Error("nao consegui ler o snapshot 'hubspot' — sem ele nao ha tocado");
    const contagem = contarTocado(hub);
    console.log('  funil: ' + contagem.total + ' negócios, ' + contagem.semCidade + ' sem cidade');

    const linhas = [];
    for (const c of CIDADES) {
      const t = await tamDaPraca(c.municipio, c.uf);
      const conta = tocadoDaPraca(contagem, c.municipio);
      /* PERCENTUAL SÓ COM DENOMINADOR MEDIDO. Percentual sobre TAM não medido é o número
         mais perigoso que esta tela poderia mostrar, porque parece cobertura. */
      const pct = (t.fonte === 'contagem_api' && t.tam > 0)
        ? Math.round((conta.tocado / t.tam) * 10000) / 100 : null;
      const linha = {
        praca: c.municipio + '/' + c.uf,
        municipio: c.municipio,
        uf: c.uf,
        data_semana: dataSemana,
        tam: t.tam,
        tam_fonte: t.fonte,
        tam_detalhe: t.detalhe,
        tocado: conta.tocado,
        pct_tocado: pct,
        clientes: null,
        atualizado_em: new Date().toISOString()
      };
      linha.leitura = leituraDaPraca(Object.assign({ perdidos: conta.perdidos }, linha), contagem.semCidade);
      linhas.push(linha);
      console.log('  ' + linha.praca + ': tam ' + (t.tam == null ? 'não medido' : t.tam)
        + ' (' + t.fonte + ') · tocado ' + conta.tocado + (pct == null ? '' : ' · ' + pct + '%'));
      if (t.fonte === 'nao_medido') problemas.push(linha.praca + ' sem TAM: ' + t.detalhe);
    }
    const r = await gravar('radar_pracas', linhas, 'praca,data_semana');
    if (r.ok) { nPracas = r.gravadas; gravouAlgo = true; }
    else problemas.push('gravar radar: ' + r.erro);
  } catch (e) {
    problemas.push('radar das praças: ' + (e.message || e));
  }

  /* ── o que ficou de fora, escrito onde alguém lê ─────────────────────────────────── */
  const resumo = ['### Radar semanal — semana de ' + dataSemana, '',
    '- notícias novas gravadas: **' + nNoticias + '**',
    '- praças no radar: **' + nPracas + '** de ' + CIDADES.length];
  if (problemas.length) {
    resumo.push('', '**O que não deu:**');
    problemas.forEach(p => resumo.push('- ' + p));
  }
  console.log(problemas.length ? '[radar-semanal] com ressalvas:' : '[radar-semanal] ok.');
  problemas.forEach(p => console.log('  · ' + p));
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo.join('\n') + '\n'); }
    catch (e) { /* o resumo é bônus; a rodada não depende dele */ }
  }

  /* SÓ FALHA SE NADA GRAVOU. Uma metade viva é rodada útil; o que faltou está no resumo. */
  if (!gravouAlgo) throw new Error('nada foi gravado nesta rodada');
  return { nNoticias, nPracas, problemas };
}

if (require.main === module) {
  rodar().catch(e => {
    console.log('[radar-semanal] Falha geral: ' + (e.message || e));
    process.exit(1);
  });
}

module.exports = { coletarNoticias, segundaDaSemana, ehDoSetor, itensDoXml, tamDaPraca,
  acharTotal, contarTocado, tocadoDaPraca, semUfNoFim, leituraDaPraca, gravar, rodar,
  nomeDoVeiculo, ehDeOutraEpoca, NOME_DO_TAM, relevancia,
  FEEDS, TEMAS, JANELA_DIAS, CNAE_FOODSERVICE, CAMPOS_DE_TOTAL };
