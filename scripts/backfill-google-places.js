// scripts/backfill-google-places.js
//
// OS MAIS BEM AVALIADOS, AUTOMATICO E EM LOTE (Google Places).
//
// Pedido do Julyan (03/09/26): "temos que puxar esses leads da casa dos dados, e os mais
// avaliados tem q vir do google places, isso tem q ser automatico, obvio q em lotes para
// nao sujar o funil do executivo".
//
// A Casa dos Dados JA ERA AUTOMATICA — medido antes de escrever isto: 1032 contas na base,
// ultima carga em 01/09 (a segunda-feira do cron). O que faltava era este lado.
//
// AS DUAS FONTES TEM REGUAS OPOSTAS, E ISSO E DELIBERADO:
//
//   Casa dos Dados   quem ABRIU AGORA. Nao tem avaliacao nenhuma — nao e lead ruim, e
//                    lead novo: ainda nao escolheu PDV, ainda nao assinou com ninguem.
//   Google Places    quem esta MADURO E BEM AVALIADO. Ja tem fornecedor e contrato, e o
//                    argumento e outro — mas o ticket e maior e a operacao existe.
//
// Sao complementares, nao redundantes. api/novidades-mercado.js ja registra essa
// distincao por escrito; este arquivo e o outro lado dela.
//
// POR QUE MENSAL, E NAO SEMANAL COMO A CASA DOS DADOS:
// Restaurante bem avaliado nao aparece de uma semana para a outra — a nota e a contagem
// de avaliacoes se movem em meses. Rodar toda semana devolveria quase o mesmo conjunto, o
// dedup do importador jogaria fora, e a unica coisa que mudaria seria a fatura da API do
// Google. Abertura nova, ao contrario, acontece toda semana — por isso a outra fonte e
// semanal. A cadencia segue o dado, nao a vontade de parecer ativo.
//
// COMO O LOTE PROTEGE O FUNIL:
// Cada cidade tem objetivoMinimo (para nao chegar vazio) e tetoMaximo (para nao virar
// fila que ninguem le). O teto aqui e BEM MENOR que o da Casa dos Dados: 40 contra 150-500.
// Conta madura exige um ciclo de venda mais longo, e cinquenta delas de uma vez na tela do
// executivo nao e oportunidade — e ruido que enterra o que ele ia fazer hoje.
//
// NENHUMA REGRA DE NEGOCIO NOVA AQUI. Roteamento por territorio, deduplicacao (por
// place_id e entre fontes), corte de qualidade e limpeza de rede excluida ja vivem em
// api/importar-leads.js, que e testado. Este script so BUSCA e entrega.
//
// Variaveis de ambiente:
//   GOOGLE_PLACES_API_KEY  -> chave do Google Cloud com a Places API (New) habilitada
//   IMPORT_SECRET          -> mesmo segredo que api/importar-leads.js valida
//   COCKPIT_URL            -> opcional, default aponta pra producao
//   PULAR_CIDADES          -> opcional, nomes separados por virgula

const fs = require('fs');
const path = require('path');

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const COCKPIT_URL = process.env.COCKPIT_URL || 'https://fieldsalestakeat.vercel.app';

/* ══ O CORTE DE "MAIS AVALIADO" ═══════════════════════════════════════════════════════
   nota >= 4,5 E >= 100 avaliacoes. Este par nao e escolha minha: e o criterio que o
   Julyan validou no sourcing mensal, e esta escrito na skill de contas-alvo. Mudar um dos
   dois numeros muda quem o executivo visita, entao eles ficam aqui, visiveis, e nao
   escondidos numa query. */
const NOTA_MINIMA = 4.5;
const AVALIACOES_MINIMAS = 100;

/* Trava de seguranca: nunca pagina para sempre, mesmo se a API responder bem. */
const MAX_PAGINAS_POR_CONSULTA = 3;   // 20 por pagina => ate 60 candidatos por bairro

/* ══ AS PRACAS, E POR QUE POR BAIRRO ══════════════════════════════════════════════════
   A Places API responde no maximo ~20 por consulta de texto. Uma consulta por CIDADE
   devolveria os mesmos vinte de sempre — os mais famosos do centro — e o executivo nunca
   veria o bairro onde ele realmente anda. Por isso a consulta e por bairro, com os bairros
   de maior densidade comercial de cada praca.

   Os bairros de Vitoria e Vila Velha vem do sourcing que ja rodou (skill de contas-alvo);
   os das outras pracas foram escolhidos por densidade de foodservice e ficam aqui para
   serem corrigidos com o tempo — nome de bairro errado nao quebra nada, so devolve pouco. */
const CIDADES = [
  { municipio: 'Vila Velha', uf: 'ES', objetivoMinimo: 12, tetoMaximo: 40,
    bairros: ['Centro de Vila Velha', 'Praia da Costa', 'Itapuã', 'Praia de Itaparica', 'Glória'] },
  { municipio: 'Vitória', uf: 'ES', objetivoMinimo: 12, tetoMaximo: 40,
    bairros: ['Centro', 'Praia do Canto', 'Jardim da Penha', 'Jardim Camburi', 'Mata da Praia'] },
  { municipio: 'Rio de Janeiro', uf: 'RJ', objetivoMinimo: 20, tetoMaximo: 60,
    bairros: ['Copacabana', 'Ipanema', 'Leblon', 'Botafogo', 'Barra da Tijuca', 'Tijuca', 'Centro'] },
  { municipio: 'São Paulo', uf: 'SP', objetivoMinimo: 20, tetoMaximo: 60,
    bairros: ['Mooca', 'Pinheiros', 'Vila Madalena', 'Itaim Bibi', 'Tatuapé', 'Moema'] },
  { municipio: 'Porto Alegre', uf: 'RS', objetivoMinimo: 12, tetoMaximo: 40,
    bairros: ['Moinhos de Vento', 'Cidade Baixa', 'Bom Fim', 'Auxiliadora', 'Petrópolis'] },
  { municipio: 'Salvador', uf: 'BA', objetivoMinimo: 12, tetoMaximo: 40,
    bairros: ['Rio Vermelho', 'Barra', 'Pituba', 'Itaigara', 'Pelourinho'] }
];

const semAcento = s => String(s || '').normalize('NFD')
  .split('').filter(c => { const p = c.charCodeAt(0); return p < 0x300 || p > 0x36f; }).join('')
  .toLowerCase().trim();

/* ══ DE/PARA: Places -> o formato que api/importar-leads.js ja aceita ═════════════════
   O importador normaliza `rating`/`rating_count` tambem, mas eu mando `nota`/`avaliacoes`
   explicitos: o de/para fica aqui, num lugar, e nao espalhado entre os dois arquivos. */
function normalizarLugar(p) {
  if (!p || !p.id || !p.displayName) return null;
  const nota = p.rating != null ? Number(p.rating) : null;
  const avaliacoes = p.userRatingCount != null ? Number(p.userRatingCount) : null;
  const loc = p.location || {};
  return {
    place_id: p.id,
    nome: String(p.displayName.text || '').trim().slice(0, 160),
    categoria: Array.isArray(p.types)
      ? p.types.filter(t => t !== 'point_of_interest' && t !== 'establishment' && t !== 'food' && t !== 'store')
        .slice(0, 3).join(', ') || null
      : null,
    endereco: p.formattedAddress || null,
    telefone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
    nota: nota,
    avaliacoes: avaliacoes,
    lat: loc.latitude != null ? Number(loc.latitude) : null,
    lng: loc.longitude != null ? Number(loc.longitude) : null
  };
}

async function buscarBairro(chave, consulta) {
  const encontrados = [];
  let token = null;
  for (let pagina = 0; pagina < MAX_PAGINAS_POR_CONSULTA; pagina++) {
    const corpo = { textQuery: consulta, languageCode: 'pt-BR', maxResultCount: 20 };
    if (token) corpo.pageToken = token;
    const resp = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': chave,
        /* FieldMask e obrigatorio na Places API (New) e e o que se paga: pedir campo que
           nao se usa custa dinheiro por consulta. Aqui esta o minimo que o card precisa. */
        'X-Goog-FieldMask': [
          'places.id', 'places.displayName', 'places.formattedAddress', 'places.location',
          'places.rating', 'places.userRatingCount', 'places.types',
          'places.nationalPhoneNumber', 'nextPageToken'
        ].join(',')
      },
      body: JSON.stringify(corpo)
    });
    if (!resp.ok) {
      const txt = (await resp.text()).slice(0, 300);
      throw new Error(`Places respondeu ${resp.status}: ${txt}`);
    }
    const dados = await resp.json();
    (dados.places || []).forEach(p => { const n = normalizarLugar(p); if (n) encontrados.push(n); });
    token = dados.nextPageToken || null;
    if (!token) break;
  }
  return encontrados;
}

async function buscarCidade(cfg, chave) {
  const { municipio, uf, bairros, objetivoMinimo, tetoMaximo } = cfg;
  const porPlaceId = new Map();
  for (const bairro of bairros) {
    if (porPlaceId.size >= tetoMaximo) break;
    const consulta = `restaurantes em ${bairro}, ${municipio} ${uf}`;
    let achados = [];
    try {
      achados = await buscarBairro(chave, consulta);
    } catch (e) {
      /* Um bairro que falha nao derruba a praca: o resto da cidade continua valendo, e o
         log diz qual caiu. Silenciar seria pior — a proxima rodada nao saberia. */
      console.error(`[places] ${municipio}/${bairro} falhou: ${e.message}`);
      continue;
    }
    let aceitos = 0;
    for (const l of achados) {
      if (l.nota == null || l.avaliacoes == null) continue;
      if (l.nota < NOTA_MINIMA || l.avaliacoes < AVALIACOES_MINIMAS) continue;
      if (porPlaceId.has(l.place_id)) continue;
      porPlaceId.set(l.place_id, l);
      aceitos++;
      if (porPlaceId.size >= tetoMaximo) break;
    }
    console.log(`[places] ${municipio}/${bairro}: ${achados.length} candidato(s), ${aceitos} no corte`
      + ` (nota>=${NOTA_MINIMA}, ${AVALIACOES_MINIMAS}+ avaliações) — acumulado ${porPlaceId.size}/${tetoMaximo}`);
  }
  /* Os mais avaliados primeiro: quando o teto corta, corta pelo fim da fila. */
  const lista = [...porPlaceId.values()].sort((a, b) => (b.avaliacoes || 0) - (a.avaliacoes || 0));
  const finais = lista.slice(0, tetoMaximo);
  if (finais.length < objetivoMinimo) {
    console.warn(`[places] ${municipio}/${uf}: ${finais.length} conta(s), abaixo do objetivo de ${objetivoMinimo}.`
      + ' Isso costuma ser lista de bairros curta ou corte alto para a praça — não é erro de execução.');
  }
  return finais;
}

async function principal() {
  const chave = process.env.GOOGLE_PLACES_API_KEY;
  if (!chave) {
    console.error('[places] GOOGLE_PLACES_API_KEY ausente. Esta rodada não tem como buscar nada.');
    console.error('  Para ligar: Google Cloud → habilitar "Places API (New)" → criar chave →');
    console.error('  GitHub → Settings → Secrets and variables → Actions → GOOGLE_PLACES_API_KEY.');
    console.error('  Sem a chave o script sai com erro de propósito: rodada silenciosa que não');
    console.error('  importa nada é pior que rodada que falha e avisa.');
    process.exit(1);
  }

  const pular = String(process.env.PULAR_CIDADES || '').split(',').map(semAcento).filter(Boolean);
  const daRodada = CIDADES.filter(c => !pular.includes(semAcento(c.municipio)));
  if (pular.length) {
    console.log('[places] pulando nesta rodada: ' + CIDADES.filter(c => pular.includes(semAcento(c.municipio)))
      .map(c => c.municipio).join(', '));
  }

  const todos = [];
  for (const cfg of daRodada) {
    const leads = await buscarCidade(cfg, chave);
    console.log(`[places] ${cfg.municipio}/${cfg.uf}: ${leads.length} conta(s) para importar.`);
    todos.push(...leads);
  }

  console.log(`[places] total da rodada: ${todos.length} conta(s) em ${daRodada.length} praça(s).`);
  if (!todos.length) {
    console.warn('[places] nada para importar. Saindo sem chamar o importador.');
    return;
  }

  const segredo = process.env.IMPORT_SECRET;
  if (!segredo) {
    /* MESMA PONTE que o backfill da Casa dos Dados usa: sem o segredo, grava o JSON como
       artefato da execucao para importacao manual, em vez de perder a rodada inteira. */
    const dir = path.join(__dirname, '..', 'artifacts');
    fs.mkdirSync(dir, { recursive: true });
    const arquivo = path.join(dir, 'leads-google-places.json');
    fs.writeFileSync(arquivo, JSON.stringify({ fonte: 'google_places', leads: todos }, null, 2));
    console.warn('[places] IMPORT_SECRET ausente — nada foi importado.');
    console.warn(`  As ${todos.length} contas ficaram em ${arquivo}, anexado como artefato da execução.`);
    console.warn('  Para importar automaticamente: IMPORT_SECRET nos dois lados (GitHub Actions e Vercel).');
    return;
  }

  const resp = await fetch(`${COCKPIT_URL}/api/importar-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-import-secret': segredo },
    /* fonte: 'google_places' — a chave que FONTES_ROTULO ja conhece. Escrever "Google
       Places" com espaco criaria um QUARTO rotulo para a mesma fonte: a base ja tem
       "Google Places", "google_places" e "outscraper + Google Places", e cada rotulo novo
       quebra a metrica por origem em mais um pedaco. */
    body: JSON.stringify({ fonte: 'google_places', leads: todos })
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`[places] importador respondeu ${resp.status}: ${JSON.stringify(dados).slice(0, 400)}`);
    process.exit(1);
  }
  console.log('[places] importado: ' + JSON.stringify({
    criados: dados.leadsCriados ? dados.leadsCriados.length : dados.criados,
    duplicados: dados.duplicados,
    reprovados_qualidade: dados.reprovados_qualidade,
    reprovados_fit: dados.reprovados_fit
  }));
}

principal().catch(e => {
  console.error('[places] rodada falhou: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
