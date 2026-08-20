// scripts/backfill-casa-dos-dados.js
// Roda semanalmente via GitHub Actions — busca o BACKLOG de contas-alvo da Casa dos
// Dados por CIDADE de cada executivo (diferente de api/novidades-mercado.js, que só
// busca "quem abriu essa semana" pra Agenda). Esta rodada existe pra resolver o pedido
// do Julyan: "quero ninguém sem da Casa dos Dados" — auditoria real mostrou que só 1
// conta em toda a base tinha essa fonte (criada manualmente pela Kelly), e o Wericles
// (São Paulo) não tinha NENHUM lead de fonte nenhuma.
//
// NÃO reimplementa deduplicação, roteamento por território nem filtro de qualidade —
// tudo isso já existe e já é testado em api/importar-leads.js. Este script só busca
// na Casa dos Dados, normaliza pro formato que aquele endpoint espera, e chama ele via
// HTTP (o mesmo caminho que a doc do endpoint já previa: "webhook/automação
// server-to-server, com o header x-import-secret").
//
// Variáveis de ambiente:
//   CASADOSDADOS_TOKEN  -> chave da API (mesma usada por api/novidades-mercado.js)
//   IMPORT_SECRET       -> mesmo segredo que api/importar-leads.js já valida
//   COCKPIT_URL         -> opcional, default aponta pra produção

const CASA_URL = 'https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo';
const COCKPIT_URL = process.env.COCKPIT_URL || 'https://fieldsalestakeat.vercel.app';

// CORREÇÃO (16/08/26, Julyan): "quero mais leads pra todos, pelo menos 30 por executivo".
// Cada cidade agora carrega um objetivoMinimo (soma dos executivos que ela atende) e um
// tetoMaximo de segurança (pra não virar fila que ninguém lê — mesma preocupação de antes).
// Continua sendo backlog de verdade, não só "abriu essa semana".
const TAMANHO_PAGINA_API = 40; // a Casa dos Dados pagina; busca em blocos até o teto de cada cidade
const MAX_PAGINAS_POR_CIDADE = 30; // trava de segurança — nunca deixa uma cidade paginar pra sempre
// Janela ampla o bastante pra cobrir o mercado ativo (não só "abriu esta semana",
// que é o filtro do endpoint da Agenda) — 8 anos captura o estabelecimento maduro
// que ainda pode não ter sistema de PDV, sem se limitar a CNPJ recém-nascido.
const JANELA_DIAS = 365 * 8;
// CORREÇÃO (16/08/26, Julyan, 2ª rodada): "não posso sujar o funil do gestor" — subiu
// de 60 pra 90 dias mínimos de abertura, mais margem de segurança contra CNPJ que
// ainda pode fechar ou estar com cadastro incompleto.
const DIAS_MINIMO_ABERTURA = 90;

// Uma linha por CIDADE que api/importar-leads.js sabe rotear (a função rotearTerritorio
// de lá decide o dono certo por cidade+bairro). Rio de Janeiro cobre 2 executivos
// (Bruno, Sandro — Michel foi desligado em 20/08/26) — por isso carrega metaBairros:
// sub-cotas de 30 leads por bairro de cada um, testadas com o MESMO critério de bairro
// que rotearTerritorio usa lá no endpoint (mantido em sincronia manual — se mudar um
// lado, mudar o outro).
// Cidades de executivo único (1 rep por município) só precisam do objetivoMinimo geral.
const CIDADES = [
  { municipio: 'Vila Velha', uf: 'ES', objetivoMinimo: 30, tetoMaximo: 150 }, // Marco Filho
  { municipio: 'Vitória', uf: 'ES', objetivoMinimo: 30, tetoMaximo: 150 }, // Amanda Pardim
  {
    municipio: 'Rio de Janeiro', uf: 'RJ', objetivoMinimo: 90, tetoMaximo: 400,
    metaBairros: [
      { nome: 'Bruno Martins (Taquara/Jacarepaguá/Freguesia/Anil)', minimo: 30, teste: b => /taquara|jacarepagua|freguesia|\banil\b/.test(b) },
      { nome: 'Sandro Linhares (Tijuca)', minimo: 30, teste: b => /tijuca/.test(b) }
      // Michel Carvalho (Campo Grande) removido em 20/08/26 — desligado. Campo Grande
      // fica sem sub-cota dedicada até o Julyan reatribuir o território a alguém.
    ]
  },
  { municipio: 'São Paulo', uf: 'SP', objetivoMinimo: 30, tetoMaximo: 150 }, // Wericles Andrade (Santo Amaro/Morumbi)
  { municipio: 'Porto Alegre', uf: 'RS', objetivoMinimo: 30, tetoMaximo: 150 }, // Kelly Travieso (Moinhos de Vento/Auxiliadora/Cidade Baixa)
  { municipio: 'Canoas', uf: 'RS', objetivoMinimo: 30, tetoMaximo: 150 } // também roteia pra Kelly
];

const CNAE_FOODSERVICE = [
  '5611201', '5611202', '5611203', '5611204', '5620104', '4721102', '1091102'
];

let REDES_EXCLUIDAS = [];
try {
  const raw = require('../data/redes-excluidas.json');
  REDES_EXCLUIDAS = (raw && Array.isArray(raw.redes)) ? raw.redes : [];
} catch (e) { REDES_EXCLUIDAS = []; }

const semAcento = t => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function ehRedeGrande(nome) {
  const n = semAcento(nome);
  return !!n && REDES_EXCLUIDAS.some(r => n.includes(semAcento(r)));
}
// Mesmo padrão de api/novidades-mercado.js: CPF/raiz de CNPJ virando razão social é
// empresário individual sem estabelecimento — corta, exceto se tiver marca societária.
function ehPessoaFisica(i) {
  const t = String(i.razaoSocial || i.nome || '').trim();
  if (/\b(ltda|eireli|s\/?a\b|me\b|mei\b|epp\b)/i.test(t)) return false;
  const inicio = t.split(/\s+/)[0] || '';
  return /^\d[\d.\-\/]*$/.test(inicio) && inicio.replace(/\D/g, '').length >= 8;
}

// CORREÇÃO (16/08/26, Julyan, 2ª rodada): "filtra o que não for de food" — o CNAE de
// foodservice às vezes classifica errado (ex: mercearia/tabacaria/distribuidora
// registradas sob um CNAE de restaurante). Corta pelo NOME quando bate um desses
// padrões de varejo/serviço não-alimentício, mesmo já tendo passado pelo CNAE.
const PADROES_FORA_DE_FOODSERVICE = [
  /\bconveniencia\b/, /\bdistribuidora\b/, /\badega(s)?\b/,
  /\bhortifruti\b/, /\bfarmacia\b/, /\bdrogaria\b/, /\bpapelaria\b/, /\batacad/,
  /\bsupermercado\b/, /\bmercadinho\b/, /\bpet\b/, /\bmaterial\b/, /\bconstru/,
  /\blavanderia\b/, /\bbarbearia\b/, /\botica\b/, /\bconfec/
];
function ehForaDeFoodservice(nome) {
  const n = semAcento(nome);
  return PADROES_FORA_DE_FOODSERVICE.some(re => re.test(n));
}

function isoDiasAtras(dias) {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

// Mesma normalização de api/novidades-mercado.js — mantém os dois lugares que falam
// com a Casa dos Dados devolvendo o mesmo formato de lead.
function normalizar(e) {
  if (!e || !e.cnpj) return null;
  const end = e.endereco || {};
  const nome = (e.nome_fantasia && String(e.nome_fantasia).trim()) || (e.razao_social && String(e.razao_social).trim()) || 'Sem nome';
  const logradouro = [end.tipo_logradouro, end.logradouro].filter(Boolean).join(' ').trim();
  return {
    place_id: null, // Casa dos Dados não tem place_id do Google — dedup usa telefone/nome+cidade
    cnpj: String(e.cnpj), // CORREÇÃO (16/08/26, Julyan): ficha da rota pedia isso — o campo já vinha na resposta, só não era salvo
    data_abertura: e.data_abertura || null, // idem — alimenta o "Aberta há" na ficha (nome snake_case combinando com a coluna do Supabase)
    nome: nome.slice(0, 160),
    razaoSocial: e.razao_social || null,
    categoria: null, // CNAE já garantiu foodservice; categoria textual não vem desta fonte
    endereco: [logradouro, end.numero].filter(Boolean).join(', ') || null,
    bairro: end.bairro || null,
    cidade: end.municipio || null,
    estado: end.uf || null,
    // CONFIRMADO (16/08/26) na documentação oficial (docs.casadosdados.com.br): o
    // schema de resposta CNPJPesquisaResposta — tanto na v4 (Consulta CNPJ) quanto na
    // v5 (Pesquisa Avançada), mesmo com tipo_resultado=completo — NÃO tem campo de
    // telefone nenhum. `telefone` e `ddd` existem só como FILTRO de busca no corpo da
    // requisição (e `mais_filtros.com_telefone` filtra só quem tem telefone cadastrado)
    // — a API deixa buscar por telefone, mas nunca devolve o número de volta. Isso não
    // é lacuna do nosso código, é limitação real do provedor. Null é o valor correto
    // e definitivo aqui, não um "ainda não implementado".
    telefone: null,
    nota: null,
    avaliacoes: null, // Casa dos Dados não tem avaliação — api/importar-leads.js já sabe não cortar por isso
    // CORREÇÃO CRÍTICA (16/08/26, Julyan: "ainda não funciona" na busca por proximidade
    // — investigado ao vivo): `end.ibge.latitude/longitude` NÃO é o endereço do
    // estabelecimento, é o centro geográfico do MUNICÍPIO INTEIRO — confirmado que
    // TODOS os leads de uma mesma cidade compartilhavam a coordenada idêntica até a
    // 13ª casa decimal. Isso fazia a busca "perto de mim" nunca achar nada perto do
    // bairro real do executivo (o ponto genérico podia estar a mais de 10km de
    // distância de onde o lead de fato fica) e, quando achava, mostrava a MESMA
    // distância pra centenas de leads diferentes ao mesmo tempo. Corrigido geocodificando
    // o endereço real (rua + bairro + cidade) via MapTiler logo abaixo, em buscarCidade —
    // não aqui, porque normalizar() é síncrona e geocodificar precisa de await.
    lat: null,
    lng: null
  };
}

// Geocodifica o endereço real de cada lead via MapTiler — substitui a coordenada
// genérica do município (ver comentário em normalizar()). Roda uma vez por lead
// recém-importado, não a cada carregamento de tela. `country=br&language=pt` sem
// viés de proximidade aqui é seguro porque o endereço já tem cidade explícita —
// diferente da busca por texto solto do executivo (ver geocodificarLocalAtuacao no
// template, que precisa de viés porque o texto digitado não tem cidade junto).
async function geocodificarEnderecoReal(item, maptilerKey) {
  if (!maptilerKey) return item;
  const texto = [item.endereco, item.bairro, item.cidade, item.estado].filter(Boolean).join(', ');
  if (!texto) return item;
  try {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(texto)}.json?key=${maptilerKey}&country=br&language=pt`;
    const resp = await fetch(url);
    if (!resp.ok) return item;
    const json = await resp.json();
    const top = (json.features || [])[0];
    if (!top || !Array.isArray(top.center)) return item;
    const [lng, lat] = top.center;
    return { ...item, lat, lng };
  } catch (e) {
    return item; // geocode é bônus (melhora a ordenação por distância) — falhar não pode derrubar a importação
  }
}

async function autenticarECconsultar(corpoConsulta, casaToken) {
  const variantes = [
    { nome: 'header api-key', headers: { 'api-key': casaToken } },
    { nome: 'header api_key', headers: { 'api_key': casaToken } },
    { nome: 'header Authorization Bearer', headers: { Authorization: 'Bearer ' + casaToken } },
    { nome: 'header x-api-key', headers: { 'x-api-key': casaToken } }
  ];
  for (const v of variantes) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(CASA_URL, {
        method: 'POST', signal: ctrl.signal,
        headers: Object.assign({ 'Content-Type': 'application/json' }, v.headers),
        body: corpoConsulta
      });
      clearTimeout(timer);
      const texto = await r.text();
      let j = null;
      try { j = JSON.parse(texto); } catch (e) { j = null; }
      if (r.ok) return { ok: true, json: j || {}, via: v.nome };
    } catch (e) { clearTimeout(timer); }
  }
  return { ok: false };
}

// Retorna também o detalhe por metaBairro (quando a cidade tiver), pra main() poder
// avisar se algum executivo específico não bateu os 30 mesmo esticando o teto.
async function buscarCidade(cidadeCfg, casaToken) {
  const { municipio, uf, objetivoMinimo, tetoMaximo, metaBairros } = cidadeCfg;
  const leadsCidade = [];
  let pagina = 1;

  function contagemPorMeta() {
    if (!metaBairros) return null;
    return metaBairros.map(m => ({
      nome: m.nome,
      minimo: m.minimo,
      encontrados: leadsCidade.filter(l => m.teste(semAcento(l.bairro))).length
    }));
  }
  function metasBatidas() {
    if (!metaBairros) return leadsCidade.length >= objetivoMinimo;
    return contagemPorMeta().every(m => m.encontrados >= m.minimo);
  }

  while (leadsCidade.length < tetoMaximo && pagina <= MAX_PAGINAS_POR_CIDADE && !metasBatidas()) {
    const corpoConsulta = JSON.stringify({
      codigo_atividade_principal: CNAE_FOODSERVICE,
      situacao_cadastral: ['ATIVA'],
      uf: [uf.toLowerCase()],
      municipio: [municipio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')],
      data_abertura: { inicio: isoDiasAtras(JANELA_DIAS), fim: isoDiasAtras(DIAS_MINIMO_ABERTURA) },
      mei: { excluir_optante: true },
      mais_filtros: { com_telefone: true, excluir_email_contab: true },
      limite: TAMANHO_PAGINA_API,
      pagina
    });
    const resp = await autenticarECconsultar(corpoConsulta, casaToken);
    if (!resp.ok) {
      console.log(`[backfill-casa-dos-dados] ${municipio}/${uf}: falha de autenticação/rede na página ${pagina}.`);
      break;
    }
    const cru = (resp.json && (resp.json.cnpjs || resp.json.results || (Array.isArray(resp.json.data) ? resp.json.data : null))) || [];
    if (!Array.isArray(cru) || cru.length === 0) break; // acabaram os resultados dessa cidade

    cru.forEach(raw => {
      const item = normalizar(raw);
      if (!item) return;
      if (ehRedeGrande(item.nome) || ehRedeGrande(item.razaoSocial)) return;
      if (ehPessoaFisica(item)) return;
      if (ehForaDeFoodservice(item.nome)) return;
      leadsCidade.push(item);
    });

    if (cru.length < TAMANHO_PAGINA_API) break; // última página da Casa dos Dados pra essa cidade
    pagina++;
  }
  const leadsFinais = leadsCidade.slice(0, tetoMaximo);
  // Geocodifica em série (não em paralelo) pra não estourar rate-limit da MapTiler —
  // uma cidade tem no máximo `tetoMaximo` leads (150-400), então isso soma no máximo
  // alguns minutos a mais na rodada semanal, tempo que sobra de sabra no cron.
  const maptilerKey = (() => { try { return require('../data/maptiler-config.json').key; } catch (e) { return null; } })();
  for (let i = 0; i < leadsFinais.length; i++) {
    leadsFinais[i] = await geocodificarEnderecoReal(leadsFinais[i], maptilerKey);
  }
  return { leads: leadsFinais, porMeta: contagemPorMeta() };
}

async function importarLote(leadsCidade, importSecret) {
  if (leadsCidade.length === 0) return { inseridos: 0, duplicados: 0 };
  const resp = await fetch(`${COCKPIT_URL}/api/importar-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-import-secret': importSecret },
    body: JSON.stringify({ fonte: 'casa_dos_dados', leads: leadsCidade })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.log('[backfill-casa-dos-dados] Importação recusada:', data.erro || resp.status);
    return { inseridos: 0, duplicados: 0, erro: data.erro || String(resp.status) };
  }
  return data;
}

const fs = require('fs');

async function main() {
  const casaToken = process.env.CASADOSDADOS_TOKEN;
  const importSecret = process.env.IMPORT_SECRET;
  if (!casaToken) {
    console.log('[backfill-casa-dos-dados] Falta CASADOSDADOS_TOKEN — nada rodado.');
    process.exit(1);
  }
  // MODO FALLBACK (16/08/26): enquanto o IMPORT_SECRET não estiver ativo na Vercel
  // (precisa de redeploy, e o teto de 100 deploys/dia da Vercel travou isso hoje),
  // o script ainda busca tudo normalmente, mas em vez de chamar /api/importar-leads
  // (que recusaria sem o segredo), grava um JSON pra importação manual pelo modal
  // "colar/anexar JSON" do Cockpit (gestor, autenticado pela própria sessão — não
  // depende do IMPORT_SECRET de jeito nenhum). Assim que o IMPORT_SECRET entrar em
  // vigor na Vercel, este script volta a importar sozinho automaticamente.
  const modoManual = !importSecret;
  if (modoManual) {
    console.log('[backfill-casa-dos-dados] IMPORT_SECRET ausente — rodando em MODO MANUAL: vai gravar um JSON pra importar pelo modal do Cockpit em vez de importar sozinho.');
  }

  let totalInseridos = 0, totalDuplicados = 0;
  const porCidade = {};
  const todosOsLeads = [];
  for (const cidadeCfg of CIDADES) {
    const { municipio, uf } = cidadeCfg;
    console.log(`[backfill-casa-dos-dados] Buscando ${municipio}/${uf}… (objetivo mínimo: ${cidadeCfg.objetivoMinimo})`);
    const { leads: leadsCidade, porMeta } = await buscarCidade(cidadeCfg, casaToken);
    console.log(`[backfill-casa-dos-dados] ${municipio}/${uf}: ${leadsCidade.length} contas após filtro (rede grande e pessoa física fora).`);
    if (porMeta) {
      porMeta.forEach(m => {
        const ok = m.encontrados >= m.minimo;
        console.log(`[backfill-casa-dos-dados]   ${ok ? '✅' : '⚠️ ABAIXO DA META'} ${m.nome}: ${m.encontrados}/${m.minimo}`);
      });
    }
    if (modoManual) {
      todosOsLeads.push(...leadsCidade);
      porCidade[`${municipio}/${uf}`] = { encontrados: leadsCidade.length, porMeta: porMeta || undefined };
    } else {
      const resultado = await importarLote(leadsCidade, importSecret);
      porCidade[`${municipio}/${uf}`] = { encontrados: leadsCidade.length, inseridos: resultado.inseridos || 0, duplicados: resultado.duplicados || 0, porMeta: porMeta || undefined };
      totalInseridos += resultado.inseridos || 0;
      totalDuplicados += resultado.duplicados || 0;
    }
  }

  console.log('[backfill-casa-dos-dados] Resumo final:', JSON.stringify(porCidade, null, 2));

  if (modoManual) {
    const saida = { fonte: 'casa_dos_dados', leads: todosOsLeads };
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/leads-casa-dos-dados.json', JSON.stringify(saida, null, 2));
    console.log(`[backfill-casa-dos-dados] ${todosOsLeads.length} conta(s) gravadas em artifacts/leads-casa-dos-dados.json — baixe o artifact desta execução e cole o conteúdo no modal "Importar contas" (aba colar/anexar JSON) do Cockpit.`);
  } else {
    console.log(`[backfill-casa-dos-dados] Total: ${totalInseridos} contas novas, ${totalDuplicados} já existentes (mescladas).`);
  }
}

main().catch(e => {
  console.log('[backfill-casa-dos-dados] Falha geral:', e.message || e);
  process.exit(1);
});
