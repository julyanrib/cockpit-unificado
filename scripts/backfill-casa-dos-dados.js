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
/* ══ AS CIDADES E AS SUB-COTAS SAEM DE data/territorios.json (09/09/26) ═══════════════
   ESTE ARRAY ERA A SEGUNDA CÓPIA DA MESMA REGRA. A tela do gestor decidia a praça de cada
   executivo por um caminho (os bairros dos leads de exemplo em leads-referencia.json) e
   esta busca decidia por outro (as metaBairros em regex, aqui). As duas divergiam calada,
   e o preço foi medido em 09/09: quatro dos onze executivos não apareciam em praça
   nenhuma na tela, e cinco municípios de rota real — Mogi das Cruzes, Biritiba Mirim,
   Salesópolis, Suzano e Guarulhos — não eram buscados por ninguém. Gente com rota e sem
   munição.

   AGORA A DECLARAÇÃO É UMA. O território de cada pessoa está em data/territorios.json, e
   tanto a tela quanto esta busca leem de lá. Mexer no bairro de alguém é mexer naquele
   arquivo, e é decisão do Julyan.

   O QUE ESTA DERIVAÇÃO FAZ:
   · junta os municípios de todos os territórios, um por cidade;
   · monta uma sub-cota por executivo em cada cidade que tem mais de um dono, com o teste
     de bairro vindo dos bairros DECLARADOS (e não de uma regex escrita à mão);
   · quem tem `todoOMunicipio` não gera sub-cota de bairro — ele cobre a cidade, menos o
     que estiver em `exceto`;
   · objetivo e teto por cidade escalam com quanta gente ela tem, porque cidade com três
     donos precisa de mais lead que cidade com um. */
const TERRITORIOS = (() => {
  try { return require('../data/territorios.json').territorios || []; }
  catch (e) {
    console.log('[backfill-casa-dos-dados] AVISO: nao li data/territorios.json — ' + e.message);
    return [];
  }
})();

const semAcentoBairro = s => String(s || '').toLowerCase().normalize('NFD')
  .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const CIDADES = (() => {
  const porCidade = new Map();
  TERRITORIOS.forEach(tr => {
    if (tr && tr.ativo === false) return;   /* Amanda, em transicao para Inside */
    (tr.areas || []).forEach(a => {
      if (!a || !a.municipio) return;
      const k = a.municipio + '|' + (a.uf || '');
      if (!porCidade.has(k)) porCidade.set(k, { municipio: a.municipio, uf: a.uf, donos: [] });
      porCidade.get(k).donos.push({ rep: tr.rep, area: a });
    });
  });

  return [...porCidade.values()].map(c => {
    /* 30 contas por dono é o objetivo que já vigorava; o teto é cinco vezes isso, para a
       busca poder passar do mínimo quando um bairro rende pouco e outro rende muito. */
    const n = c.donos.length;
    const cfg = { municipio: c.municipio, uf: c.uf, objetivoMinimo: 30 * n, tetoMaximo: 150 * n };

    /* SUB-COTA SÓ ONDE HÁ MAIS DE UM DONO E OS BAIRROS ESTÃO DECLARADOS. Sem isso, a
       cidade cumpre a meta geral com contas de uma zona só e a zona do colega nasce
       vazia — foi o motivo pelo qual as sub-cotas existem desde 01/09. */
    const comBairro = c.donos.filter(d => !d.area.todoOMunicipio && (d.area.bairros || []).length);
    if (n > 1 && comBairro.length > 1) {
      /* ══ UM BAIRRO, UM DONO ═══════════════════════════════════════════════════════
         O resolvedor é compartilhado pelas metas desta cidade, e é ele que decide de
         quem é o bairro — em vez de cada meta responder por si e o mesmo lead contar
         duas vezes.

         BORDA DE PALAVRA, e não substring: 'vila mariana' NÃO é 'vila maria'. Sem a
         borda, um bairro órfão entra na rota do vizinho de nome parecido — foi o que
         aconteceu com a Vila Mariana, que está sem dono, caindo no Sérgio.

         O CONTAINMENT existe porque o CRM guarda o bairro com apêndice digitado à mão
         ("Freguesia (Jacarepaguá, entorno imediato de Taquara)", "Tijuca (Shopping
         45)"). E é por isso que a POSIÇÃO decide: o bairro é o que vem primeiro, o
         resto é contexto. Em empate, ganha a chave mais longa, que é a mais específica. */
      const donosDoBairro = comBairro.map(d => ({
        rep: d.rep,
        chaves: (d.area.bairros || []).map(semAcentoBairro).filter(Boolean)
      }));
      const cache = new Map();
      const donoDoBairro = b => {
        const alvo = ' ' + String(b || '') + ' ';
        if (cache.has(alvo)) return cache.get(alvo);
        let melhor = null;
        donosDoBairro.forEach(d => {
          d.chaves.forEach(k => {
            const pos = alvo.indexOf(' ' + k + ' ');
            if (pos < 0) return;
            if (!melhor || pos < melhor.pos || (pos === melhor.pos && k.length > melhor.tam)) {
              melhor = { rep: d.rep, pos: pos, tam: k.length };
            }
          });
        });
        const quem = melhor ? melhor.rep : null;
        cache.set(alvo, quem);
        return quem;
      };
      cfg.metaBairros = comBairro.map(d => ({
        nome: d.rep + ' (' + (d.area.bairros || []).slice(0, 3).join(', ') + '…)',
        minimo: 30,
        teste: b => donoDoBairro(b) === d.rep
      }));
    }
    return cfg;
  });
})();

/* PRAÇA SEM NENHUM TERRITÓRIO DECLARADO AINDA PRECISA SER BUSCADA. Vitória é o caso de
   hoje: a Amanda foi para Inside e ninguém assumiu, mas a praça existe no radar e o
   estoque dela não pode secar em silêncio enquanto o Julyan não reatribui. */
const CIDADES_SEM_DONO = [
  { municipio: 'Vitória', uf: 'ES', objetivoMinimo: 30, tetoMaximo: 150 }
];
CIDADES_SEM_DONO.forEach(c => {
  if (!CIDADES.some(x => x.municipio === c.municipio)) CIDADES.push(c);
});

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
    // Repassa o diagnóstico do endpoint (presença/tamanho/trim do segredo — nunca o
    // valor). Sem isto, "recusado" não distingue variável ausente de valor diferente.
    if (data.diagnosticoSegredo) console.log('[backfill-casa-dos-dados] Diagnóstico do segredo:', JSON.stringify(data.diagnosticoSegredo));
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

  /* ── PULAR CIDADE NESTA RODADA (01/09/26) ──────────────────────────────────────────
     Pedido: "coloque outra lista de casa dos dados para os executivos online, menos a
     Amanda". A Amanda cobre Vitória, e a lista CIDADES acima mapeia cidade→executivo.

     Por que PARÂMETRO e não remoção da linha: "menos a Amanda" é o estado de hoje, não
     uma regra do produto. Apagar Vitória do array faria a próxima rodada automática (o
     cron de domingo) deixar a praça dela sem backlog para sempre, silenciosamente — e
     ninguém iria lembrar de recolocar. Com o parâmetro, o padrão continua sendo TODAS as
     cidades, e pular é uma escolha explícita de quem dispara, registrada no log.

     Casa sem acento e sem caixa, porque quem digita no botão do workflow vai escrever
     "vitoria" tanto quanto "Vitória". */
  const semAcento = t => String(t || '').normalize('NFD')
    .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
    .toLowerCase().trim();
  const pularPedido = String(process.env.PULAR_CIDADES || '').split(',').map(semAcento).filter(Boolean);
  const cidadesDaRodada = CIDADES.filter(c => !pularPedido.includes(semAcento(c.municipio)));
  if (pularPedido.length) {
    const puladas = CIDADES.filter(c => pularPedido.includes(semAcento(c.municipio))).map(c => c.municipio + '/' + c.uf);
    const naoAchadas = pularPedido.filter(p => !CIDADES.some(c => semAcento(c.municipio) === p));
    console.log('[backfill-casa-dos-dados] PULANDO nesta rodada: ' + (puladas.join(', ') || '(nenhuma)'));
    /* pedido que não casa com cidade nenhuma é erro de digitação, e erro de digitação
       aqui significa importar para quem não devia — melhor parar do que adivinhar. */
    if (naoAchadas.length) {
      console.error('[backfill-casa-dos-dados] PULAR_CIDADES tem nome que não existe na lista: ' + naoAchadas.join(', '));
      console.error('  cidades conhecidas: ' + CIDADES.map(c => c.municipio).join(', '));
      process.exit(1);
    }
    if (!cidadesDaRodada.length) {
      console.error('[backfill-casa-dos-dados] todas as cidades foram puladas — nada a fazer.');
      process.exit(1);
    }
  }

  let totalInseridos = 0, totalDuplicados = 0;
  const porCidade = {};
  const todosOsLeads = [];
  // Cidades cujo POST foi RECUSADO pelo endpoint (não é o mesmo que "nada novo pra
  // inserir"). Sem esta lista, recusa em todas as cidades fechava a execução em verde.
  const recusadas = [];
  let totalEncontrados = 0;
  for (const cidadeCfg of cidadesDaRodada) {
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
      porCidade[`${municipio}/${uf}`] = { encontrados: leadsCidade.length, inseridos: resultado.inseridos || 0, duplicados: resultado.duplicados || 0, recusado: resultado.erro || undefined, porMeta: porMeta || undefined };
      totalInseridos += resultado.inseridos || 0;
      totalDuplicados += resultado.duplicados || 0;
      totalEncontrados += leadsCidade.length;
      if (resultado.erro) recusadas.push({ cidade: `${municipio}/${uf}`, encontrados: leadsCidade.length, erro: resultado.erro });
    }
  }

  console.log('[backfill-casa-dos-dados] Resumo final:', JSON.stringify(porCidade, null, 2));

  if (modoManual) {
    const saida = { fonte: 'casa_dos_dados', leads: todosOsLeads };
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/leads-casa-dos-dados.json', JSON.stringify(saida, null, 2));
    console.log(`[backfill-casa-dos-dados] ${todosOsLeads.length} conta(s) gravadas em artifacts/leads-casa-dos-dados.json — baixe o artifact desta execução e cole o conteúdo no modal "Importar contas" (aba colar/anexar JSON) do Cockpit.`);

    /* MODO MANUAL PASSA A FALHAR A EXECUÇÃO (28/08/26).
       O fallback foi escrito em 16/08 como ponte temporária: "assim que o IMPORT_SECRET
       entrar em vigor na Vercel, este script volta a importar sozinho". Passaram 12 dias
       e ninguém configurou — e o Action fechava em VERDE toda semana, porque tinha
       encontrado as contas e gravado o artefato.

       O que isso produziu, medido: a rodada de 24/08 encontrou 400+ contas no Rio, 39 em
       Vila Velha, 38 em Vitória, com todas as cotas por executivo batidas — e o banco
       registra ZERO linhas criadas nos últimos 7 dias. Ninguém baixa artefato. A fila de
       Prospecção ficou congelada desde 16/08, e o Julyan chegou a dizer "nem eu e os
       executivos estamos usando" — não havia nada novo para usar.

       Verde escondendo no-op é pior que vermelho: vermelho é visto. O artefato continua
       sendo publicado (a etapa de upload usa `if: always()`), então nada se perde — só o
       resultado da execução passa a dizer a verdade.

       Sai daqui sozinho no momento em que o IMPORT_SECRET existir nos dois lados. */
    const aviso = `${todosOsLeads.length} contas-alvo encontradas e NENHUMA importada: IMPORT_SECRET não está configurado.`;
    console.log(`::warning title=Prospecção não foi atualizada::${aviso}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
          '## ⚠️ A fila de Prospecção NÃO foi atualizada',
          '',
          `Encontradas **${todosOsLeads.length} contas-alvo**. Importadas: **0**.`,
          '',
          'O script não tem `IMPORT_SECRET`, então não pode chamar `api/importar-leads.js`',
          'e caiu no modo manual — gravou o JSON como artefato desta execução.',
          '',
          '**Para voltar a importar sozinho, os dois lados precisam do mesmo segredo:**',
          '',
          '1. GitHub → Settings → Secrets and variables → Actions → `IMPORT_SECRET`',
          '2. Vercel → Settings → Environment Variables → `IMPORT_SECRET` (e redeploy)',
          '',
          'Enquanto isso, dá pra importar à mão: baixe o artefato `leads-casa-dos-dados`',
          'e cole o conteúdo no modal "Importar contas" do Cockpit (aba colar/anexar JSON).',
          ''
        ].join('\n'));
      } catch (e) { /* resumo é bônus; não pode derrubar o relatório */ }
    }
    console.log('[backfill-casa-dos-dados] Encerrando com falha DE PROPÓSITO: a execução não cumpriu o que existe pra fazer.');
    process.exit(1);
  } else {
    console.log(`[backfill-casa-dos-dados] Total: ${totalInseridos} contas novas, ${totalDuplicados} já existentes (mescladas).`);

    /* FALHA QUANDO O ENDPOINT RECUSA (28/08/26 — lacuna do meu próprio conserto).
       A passagem anterior fez o MODO MANUAL falhar alto, mas deixou passar o caso
       em que o segredo existe no GitHub, o POST é feito, e o endpoint recusa: a
       execução somava inseridos=0 em todas as cidades e fechava em VERDE.

       Aconteceu ao vivo na primeira execução com o segredo configurado: as 7 cidades
       responderam "Sem sessão e sem segredo de importação válido" (segredo ausente ou
       diferente do lado da Vercel, ou faltando o redeploy) e o Action deu success.

       Recusa é diferente de "nada novo": recusa é 0 inserido E 0 duplicado com contas
       encontradas. Quando tudo está certo e não há nada novo, `duplicados` sobe. */
    if (recusadas.length > 0) {
      const aviso = `${recusadas.length} cidade(s) recusadas pelo endpoint. ${totalEncontrados} contas encontradas, ${totalInseridos} importadas.`;
      console.log(`::error title=Importação recusada::${aviso}`);
      console.log('[backfill-casa-dos-dados] Recusas:', JSON.stringify(recusadas, null, 2));
      if (process.env.GITHUB_STEP_SUMMARY) {
        try {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
            '## ❌ O endpoint recusou a importação',
            '',
            `Encontradas **${totalEncontrados}** contas. Importadas: **${totalInseridos}**.`,
            '',
            `Motivo devolvido: \`${recusadas[0].erro}\``,
            '',
            'O segredo chegou daqui (o GitHub o injetou no ambiente), então a diferença',
            'está do outro lado. Confira, na Vercel:',
            '',
            '1. `IMPORT_SECRET` existe em Settings → Environment Variables?',
            '2. O valor é **idêntico** ao do GitHub?',
            '3. Houve **redeploy** depois de criar a variável? (env var nova só vale no deploy seguinte)',
            ''
          ].join('\n'));
        } catch (e) { /* resumo é bônus */ }
      }
      process.exit(1);
    }
  }
}

/* ── QUEM CHAMA ESTE ARQUIVO (06/09/26) ─────────────────────────────────────────
   Como PROGRAMA (o cron de segunda, e o disparo manual do workflow): roda a rodada
   inteira, todas as cidades. Como MODULO (api/buscar-leads.js, quando o gestor aperta
   o botao na aba Rotas): nao roda nada sozinho — quem chama escolhe a cidade.
   Sem esta guarda, um require aqui dispararia a varredura completa dentro de uma
   requisicao HTTP. */
if (require.main === module) {
  main().catch(e => {
    console.log('[backfill-casa-dos-dados] Falha geral:', e.message || e);
    process.exit(1);
  });
}

/* As pecas que a rota sob demanda reusa. Nada aqui e reimplementado do outro lado:
   busca, normalizacao, filtro de foodservice e o envio para /api/importar-leads sao
   ESTES, os mesmos que rodam toda segunda. */
module.exports = {
  CIDADES,
  buscarCidade,
  importarLote,
  normalizar,
  ehRedeGrande,
  ehPessoaFisica,
  ehForaDeFoodservice
};
