// api/novidades-mercado.js
// Empresas de foodservice ABERTAS RECENTEMENTE na praça de cada executivo (Casa dos Dados).
//
// POR QUE ESTA ROTA EXISTE (Julyan, 11/08):
// Todo o resto do cockpit olha para dentro — HubSpot e Supabase, o que o time já tocou.
// Restaurante que abriu semana passada não está em lugar nenhum desses. E é o lead com
// a melhor janela que existe: ainda não escolheu sistema de PDV, ainda não assinou com
// concorrente, e o dono está comprando tudo ao mesmo tempo.
//
// Nota deliberada sobre a régua: aqui NÃO se busca "mais bem avaliado". Avaliação alta
// significa estabelecimento maduro — que quase sempre já tem fornecedor e contrato. O
// valor desta fonte é o oposto: quem acabou de abrir.
//
// Variáveis de ambiente:
//   SUPABASE_URL, SUPABASE_ANON_KEY   -> validação de sessão (obrigatórias, fail-closed)
//   SUPABASE_SERVICE_KEY              -> cache (opcional; sem ela funciona sem cache)
//   CASADOSDADOS_TOKEN                -> chave da API (obrigatória para esta rota)

// Grandes redes / key accounts que a Takeat não atende. Mesmo arquivo que a tela usa,
// pra fila e novidade não discordarem sobre o que é lead válido.
let REDES_EXCLUIDAS = [];
try {
  const raw = require('../data/redes-excluidas.json');
  REDES_EXCLUIDAS = (raw && Array.isArray(raw.redes)) ? raw.redes : [];
} catch (e) { REDES_EXCLUIDAS = []; }

// Tira acento E pontuação: sem o segundo passo, "Bob's Burger" não casava com a entrada
// "bobs burger" — e esse caso existe de verdade na base ("Bob's Burger - General Rocca").
const semAcento = t => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function ehRedeGrande(nome) {
  const n = semAcento(nome);
  return !!n && REDES_EXCLUIDAS.some(r => n.includes(semAcento(r)));
}

let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// CNAEs de foodservice — o ICP da Takeat. Sem este filtro a busca devolve qualquer
// empresa aberta na cidade e o executivo vira triador de lista, não vendedor.
const CNAE_FOODSERVICE = [
  '5611201', // Restaurantes e similares
  '5611202', // Bares e outros estabelecimentos, com entretenimento
  '5611203', // Lanchonetes, casas de chá, de sucos e similares
  '5611204', // Bares e outros estabelecimentos, sem entretenimento
  '5620104', // Fornecimento de alimentos preparados para consumo domiciliar
  '4721102', // Padaria e confeitaria com predominância de revenda
  '1091102'  // Padaria e confeitaria com predominância de produção própria
];

// Endpoint e header conferidos na documentação oficial (v5). A versão anterior usava
// /v2/public/..., que NÃO EXISTE — só há v4 e v5. Requisição a caminho inexistente caía
// no site e voltava a página de desafio do Cloudflare ("Just a moment"), com 403 e corpo
// HTML. Parecia problema de chave; era caminho errado.
// tipo_resultado=completo é obrigatório pra vir endereço, telefone e coordenada IBGE.
// TETO POR PRAÇA (Julyan, 11/08). Não é economia de crédito — é higiene de funil.
// A fila de contas-alvo já tem 267 registros. Somar 100 CNPJs novos por praça por
// semana transformaria a Prospecção numa lista que ninguém lê. 30 é o que um executivo
// consegue tocar de verdade numa semana, junto do resto do trabalho dele.
const LIMITE_POR_PRACA = 30;

const CASA_URL = 'https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo';

function isoDiasAtras(dias) {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toISOString().slice(0, 10);
}

// Normaliza o registro cru da Casa dos Dados no formato que o cockpit já usa para lead.
// Os nomes de campo variam conforme a versão da API, então cada um tem alternativas —
// preferir undefined a inventar valor: campo vazio na tela é honesto, campo errado não.
function normalizar(e) {
  if (!e || !e.cnpj) return null;
  const end = e.endereco || {};
  const nome = (e.nome_fantasia && String(e.nome_fantasia).trim()) || (e.razao_social && String(e.razao_social).trim()) || 'Sem nome';
  const logradouro = [end.tipo_logradouro, end.logradouro].filter(Boolean).join(' ').trim();
  return {
    cnpj: String(e.cnpj),
    nome: nome.slice(0, 160),
    razaoSocial: e.razao_social || null,
    dataAbertura: e.data_abertura || null,
    porte: (e.porte_empresa && e.porte_empresa.descricao) || null,
    endereco: [logradouro, end.numero].filter(Boolean).join(', ') || null,
    bairro: end.bairro || null,
    municipio: end.municipio || null,
    uf: end.uf || null,
    cep: end.cep || null,
    // CORREÇÃO CRÍTICA (16/08/26, Julyan: "ainda não funciona" na busca por
    // proximidade — investigado ao vivo com o Bruno): `end.ibge.latitude/longitude`
    // NÃO é o endereço do estabelecimento, é o centro geográfico do MUNICÍPIO
    // INTEIRO — confirmado que todos os leads de uma mesma cidade compartilhavam a
    // coordenada idêntica até a 13ª casa decimal, fazendo a busca "perto de mim" não
    // achar nada perto do bairro real, ou mostrar centenas de leads com a mesma
    // distância falsa. Geocodifica de verdade logo abaixo, em paralelo, onde `itens`
    // é montado — null aqui é o valor honesto até a geocodificação real acontecer.
    lat: null,
    lng: null,
    capital: e.capital_social != null ? Number(e.capital_social) : null,
    // Sem nome fantasia costuma ser empresário individual usando o próprio nome —
    // sinal fraco de estabelecimento com salão. Não descarta (pode ser cadastro
    // incompleto de um restaurante real), mas a tela avisa antes de ele ir até lá.
    semNomeFantasia: !(e.nome_fantasia && String(e.nome_fantasia).trim())
  };
}

// VERSÃO DOS FILTROS na chave do cache. Bug real, pego em 11/08: depois de acrescentar
// os filtros de MEI/contabilidade/rede, Vitória continuou devolvendo 100 resultados —
// era a linha antiga, gravada quando não havia filtro nenhum. Cache não sabe que a regra
// mudou; a chave precisa dizer. Suba este número sempre que mexer no corpo da consulta
// ou nos descartes, senão o filtro novo demora até 7 dias pra valer.
const VERSAO_FILTROS = 2;

function chaveCache(municipio, uf, dias) {
  return 'v' + VERSAO_FILTROS + '|' + String(municipio || '').toLowerCase().trim() + '|' + String(uf || '').toUpperCase().trim() + '|' + dias;
}

async function lerCache(supaUrl, serviceKey, chave, validadeHoras) {
  if (!serviceKey) return null;
  try {
    const limite = new Date(Date.now() - validadeHoras * 3600000).toISOString();
    const url = supaUrl + '/rest/v1/novidades_mercado?chave=eq.' + encodeURIComponent(chave)
      + '&buscado_em=gte.' + encodeURIComponent(limite) + '&select=itens,buscado_em&limit=1';
    const r = await fetch(url, { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey } });
    if (!r.ok) return null;
    const row = (await r.json() || [])[0];
    return row && Array.isArray(row.itens) ? { itens: row.itens, buscadoEm: row.buscado_em } : null;
  } catch (e) { return null; }
}

async function gravarCache(supaUrl, serviceKey, chave, itens) {
  if (!serviceKey) return;
  try {
    await fetch(supaUrl + '/rest/v1/novidades_mercado?on_conflict=chave', {
      method: 'POST',
      headers: {
        apikey: serviceKey, Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ chave: chave, itens: itens, buscado_em: new Date().toISOString() }])
    });
  } catch (e) { /* cache é otimização: falhar aqui não invalida a resposta */ }
}

// Geocodifica em paralelo (Promise.all) — sequencial estourava fácil o timeout de uma
// função serverless (30 leads x algumas centenas de ms cada = pode passar dos 10s do
// plano Hobby). Paralelo, todas as chamadas saem juntas e o tempo total vira o de
// UMA chamada, não da soma de 30. Falha individual não derruba a lista inteira.
async function geocodificarLote(itens, maptilerKey) {
  if (!maptilerKey) return itens;
  return Promise.all(itens.map(async item => {
    const texto = [item.endereco, item.bairro, item.municipio, item.uf].filter(Boolean).join(', ');
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
    } catch (e) { return item; }
  }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || null;
  const casaToken = process.env.CASADOSDADOS_TOKEN || null;
  if (!supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração (SUPABASE_URL e SUPABASE_ANON_KEY obrigatórios).' });
  }
  if (!casaToken) {
    return res.status(500).json({
      etapa: 'config',
      erro: 'CASADOSDADOS_TOKEN não está configurada na Vercel — sem ela não dá para consultar novidades de mercado.'
    });
  }

  // ---- 1. sessão válida (fail-closed, mesmo padrão das outras rotas) ----
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
  let emailLogado = null;
  try {
    const check = await fetch(supaUrl + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + sessionToken, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado.' });
  if (USUARIOS.length && !USUARIOS.some(u => String(u.email).toLowerCase() === emailLogado)) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  }

  // ---- 2a. CONTATO SOB DEMANDA (uma empresa por vez) ----
  //
  // O schema da Pesquisa Avançada (CNPJPesquisaResposta) NÃO tem telefone nem e-mail —
  // conferido na documentação. O filtro `com_telefone` apenas seleciona quem possui
  // telefone; não devolve o número. Para obter contato é preciso a Consulta CNPJ (v4),
  // que cobra crédito POR EMPRESA.
  //
  // Por isso não se busca contato das 30 de uma vez: seriam 150 créditos por semana
  // (5 praças) para telefones que ninguém pediu. Aqui o executivo pede o contato da
  // empresa em que vai agir — 1 crédito, no momento em que vale a pena. O cache é
  // longo porque telefone de CNPJ não muda.
  if (req.body && req.body.cnpj) {
    const cnpjLimpo = String(req.body.cnpj).replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return res.status(400).json({ erro: 'CNPJ deve ter 14 dígitos.' });
    const chaveContato = 'contato|v' + VERSAO_FILTROS + '|' + cnpjLimpo;

    const doCacheContato = await lerCache(supaUrl, serviceKey, chaveContato, 24 * 90);
    if (doCacheContato) {
      return res.status(200).json({ ok: true, origem: 'cache', contato: doCacheContato.itens[0] || null });
    }
    try {
      const r = await fetch('https://api.casadosdados.com.br/v4/cnpj/' + cnpjLimpo, {
        method: 'GET', headers: { 'api-key': casaToken }
      });
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) { j = null; }
      if (!r.ok || !j) {
        return res.status(r.status || 502).json({
          etapa: 'consulta-cnpj', httpCasa: r.status,
          erro: (j && (j.message || j.erro)) || 'Casa dos Dados recusou a consulta de CNPJ.'
        });
      }
      // A v4 aninha o registro em .cnpj em algumas versões; aceita os dois.
      const d = j.cnpj || j.data || j;
      // PEDIDO (17/08/26, Julyan: "puxar endereço, sócio majoritário e telefone") —
      // endereço já vem na busca em lote (v5); telefone e sócio só saem na Consulta
      // CNPJ avulsa (v4), que é esta mesma chamada — então sócio "pega carona" no
      // crédito que já ia ser gasto pelo telefone, sem custo adicional.
      //
      // AVISO IMPORTANTE: não testei esta chamada ao vivo (sem acesso ao navegador
      // no momento em que isso foi escrito) — os nomes de campo abaixo são os mais
      // comuns entre APIs de CNPJ brasileiras (todas espelham o mesmo dado-base da
      // Receita Federal), com várias variações como fallback, no mesmo estilo do
      // telefone acima. Se o primeiro teste real mostrar um campo diferente, é só
      // me avisar com o que a ficha mostrou (ou abrir o Network do navegador) que eu
      // ajusto na hora — não é uma reescrita, é trocar o nome de um campo.
      //
      // "Sócio majoritário" com percentual de participação não é dado público da
      // Receita Federal (QSA só traz nome + qualificação, ex.: "49-Sócio-Administrador"),
      // então mostramos o PRIMEIRO sócio da lista (geralmente o fundador/administrador)
      // como proxy — rotulado só "Sócio", pra não prometer um dado que não existe.
      const qsa = d.qsa || d.socios || d.quadro_societario || [];
      const primeiroSocio = Array.isArray(qsa) && qsa.length
        ? (qsa[0].nome_socio || qsa[0].nome || qsa[0].nome_representante_legal || null)
        : (d.socio_administrador || d.nome_socio || null);
      const end = d.endereco || d;
      const enderecoCompleto = [
        [end.tipo_logradouro, end.logradouro || end.rua].filter(Boolean).join(' '),
        end.numero, end.bairro, end.municipio || end.cidade, end.uf || end.estado
      ].filter(Boolean).join(', ') || null;
      const contato = {
        cnpj: cnpjLimpo,
        telefone: d.telefone_1 || d.telefone || (Array.isArray(d.telefones) ? (d.telefones[0] && (d.telefones[0].numero || d.telefones[0])) : null) || null,
        telefone2: d.telefone_2 || null,
        email: d.email || null,
        socio: primeiroSocio,
        endereco: enderecoCompleto
      };

      /* DIAGNÓSTICO DE CONTRATO (28/08/26).
         O comentário acima admite que os nomes de campo nunca foram validados contra a
         resposta real da v4 — foram escolhidos por semelhança com outras APIs de CNPJ. E
         o banco mostra o resultado disso: `socio` está preenchido em 0 das 869 contas-alvo.
         Ou o campo tem outro nome, ou ninguém nunca clicou no botão. Sem ver a resposta
         real não há como saber qual das duas.

         Então a rota passa a se auto-diagnosticar: quando o parse não encontra NEM
         telefone NEM sócio, ela devolve as chaves que realmente vieram. Nome de chave não
         é dado sensível e resolve o problema em uma chamada, em vez de exigir tentativa e
         erro a 1 crédito por tentativa.

         `bruto` só sai com `debug: true` explícito no corpo: é a resposta inteira da
         Receita para aquele CNPJ, e não deve trafegar por acidente em uso normal.
         NÃO entra no cache — o cache guarda só `contato`, para não fossilizar um
         diagnóstico junto do dado. */
      const achouAlgo = !!(contato.telefone || contato.socio);
      const diagnostico = achouAlgo ? null : {
        aviso: 'Parse não achou telefone nem sócio. Abaixo, as chaves que a Casa dos Dados devolveu de fato.',
        chavesTopo: Object.keys(j || {}),
        chavesRegistro: Object.keys(d || {}),
        temQsa: Array.isArray(d.qsa) || Array.isArray(d.socios) || Array.isArray(d.quadro_societario),
        chavesEndereco: (d.endereco && typeof d.endereco === 'object') ? Object.keys(d.endereco) : null
      };

      await gravarCache(supaUrl, serviceKey, chaveContato, [contato]);
      return res.status(200).json(Object.assign(
        { ok: true, origem: 'casadosdados', contato: contato },
        diagnostico ? { diagnostico } : {},
        (diagnostico && req.body && req.body.debug === true) ? { bruto: d } : {}
      ));
    } catch (e) {
      return res.status(500).json({ etapa: 'consulta-cnpj', erro: 'Falha ao consultar o CNPJ: ' + String(e.message || e) });
    }
  }

  // ---- 2. parâmetros ----
  const body = req.body || {};
  const municipio = String(body.municipio || '').trim();
  const uf = String(body.uf || '').trim().toUpperCase();
  if (!municipio || !uf) return res.status(400).json({ erro: 'municipio e uf são obrigatórios.' });
  // Teto de 180 dias: acima disso "recém-aberto" deixa de ser verdade e a janela some.
  const dias = Math.min(Math.max(Number(body.dias) || 60, 7), 180);
  const chave = chaveCache(municipio, uf, dias);

  // ---- 3. cache SEMANAL ----
  // 7 dias, não 12h (Julyan: "uma vez por semana"). Duas razões que apontam pro mesmo
  // número: cada consulta gasta crédito, e uma lista que muda todo dia impede o
  // executivo de terminar a da semana passada. Estabilidade aqui é feature.
  const doCache = await lerCache(supaUrl, serviceKey, chave, 24 * 7);
  if (doCache) {
    return res.status(200).json({
      ok: true, origem: 'cache', buscadoEm: doCache.buscadoEm,
      total: doCache.itens.length, itens: doCache.itens
    });
  }

  // ---- 4. Casa dos Dados ----
  // Consulta paga por crédito: 1 chamada por praça a cada 12h, nunca por tecla digitada.
  //
  // AUTENTICAÇÃO EM CASCATA (11/08): a primeira tentativa com o header `api-key` voltou
  // 403 com corpo VAZIO — sintoma de formato de autenticação recusado, não de crédito
  // acabado (que traz mensagem). A documentação da Casa dos Dados já mudou de formato
  // entre versões, então em vez de chutar uma variação por deploy, tenta as conhecidas
  // em sequência e RELATA qual passou. Para no primeiro 2xx.
  //
  // O custo disso é zero em crédito: 401/403 não consomem consulta. Assim que soubermos
  // qual vale, dá pra fixar só ela — o campo `autenticacaoQueFuncionou` na resposta é
  // exatamente esse recado.
  const variantes = [
    { nome: 'header api-key', headers: { 'api-key': casaToken } },
    { nome: 'header api_key', headers: { 'api_key': casaToken } },
    { nome: 'header Authorization Bearer', headers: { Authorization: 'Bearer ' + casaToken } },
    { nome: 'header x-api-key', headers: { 'x-api-key': casaToken } }
  ];

  try {
    const corpoConsulta = JSON.stringify({
      codigo_atividade_principal: CNAE_FOODSERVICE,
      situacao_cadastral: ['ATIVA'],
      uf: [uf.toLowerCase()],
      // A doc exemplifica município em minúsculas e sem acento ("sao paulo"), então
      // normaliza — mandar "Vitória" e receber zero seria o pior tipo de falha: silenciosa.
      municipio: [municipio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')],
      data_abertura: { inicio: isoDiasAtras(dias), fim: isoDiasAtras(0) },
      // MEI FORA (Julyan, 11/08: "a ideia é não sujar o funil da galera").
      // A primeira consulta real a Vitória voltou 100 empresas e a primeira era
      // "68.524.312 KEVEN BRAVO FERREIRA" — MEI, razão social com CPF, sem nome
      // fantasia. MEI de foodservice é quase sempre cozinha de casa ou ambulante:
      // não tem salão, não tem comanda, não é cliente de PDV. Entram em volume e
      // afogam o restaurante de verdade que a busca deveria achar.
      mei: { excluir_optante: true },
      // Sem telefone o executivo não tem por onde começar a abordagem.
      // excluir_email_contab: sem isso o contato que vem é o escritório de contabilidade
      // que abriu o CNPJ, não o dono do restaurante. O executivo liga, fala com quem não
      // decide nada, e marca o lead como "sem interesse" — perdendo um lead que era bom.
      mais_filtros: { com_telefone: true, excluir_email_contab: true },
      limite: LIMITE_POR_PRACA,
      pagina: 1
    });

    let resp = null, json = null, usada = null;
    const tentativas = [];
    for (const v of variantes) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      try {
        const r = await fetch(CASA_URL, {
          method: 'POST',
          signal: ctrl.signal,
          headers: Object.assign({ 'Content-Type': 'application/json' }, v.headers),
          body: corpoConsulta
        });
        clearTimeout(timer);
        // Lê como TEXTO primeiro: a resposta de erro deles às vezes vem em HTML, e
        // .json() engoliria a única pista útil que existe.
        const texto = await r.text();
        let j = null;
        try { j = JSON.parse(texto); } catch (e) { j = null; }
        tentativas.push({
          via: v.nome, http: r.status,
          corpo: (j && (j.message || j.erro || j.detail || j.error)) || (texto ? texto.slice(0, 220) : '(vazio)')
        });
        if (r.ok) { resp = r; json = j || {}; usada = v.nome; break; }
      } catch (e) {
        clearTimeout(timer);
        tentativas.push({ via: v.nome, http: null, corpo: String(e.message || e).slice(0, 120) });
      }
    }

    if (!resp) {
      return res.status(502).json({
        etapa: 'casadosdados',
        erro: 'Nenhum formato de autenticação foi aceito pela Casa dos Dados.',
        // Cada linha diz o que aquele formato respondeu — é o que permite corrigir
        // sem mais um ciclo de tentativa e erro.
        tentativas: tentativas
      });
    }

    // Formato documentado: { total, cnpjs: [...] }. Mantidas alternativas como rede de
    // segurança — a doc tem "modificado há aproximadamente 1 ano" e formato muda.
    const cru = (json && (json.cnpjs || json.results || (Array.isArray(json.data) ? json.data : null))) || [];
    if (!Array.isArray(cru)) {
      return res.status(502).json({
        etapa: 'formato',
        erro: 'Resposta da Casa dos Dados veio num formato inesperado — o cockpit não sabe onde estão os registros.',
        chavesRecebidas: Object.keys(json || {})
      });
    }

    // Rede grande fora também aqui: o filtro de MEI e o de contabilidade acontecem na
    // API, mas nome de rede só dá pra avaliar depois que o registro chega.
    // EMPRESÁRIO INDIVIDUAL PELO CPF NO NOME — medido antes de decidir o corte.
    // Em Porto Alegre, 15 dos 30 resultados vinham sem nome fantasia. A tentação era
    // cortar os 15; só que 12 deles têm LTDA/EIRELI na razão social — são empresas de
    // verdade com cadastro incompleto, e cortá-las jogaria fora lead bom.
    // Os outros 3 começam com dígito: é o CPF virando razão social, padrão do
    // empresário individual sem estabelecimento. Esses saem.
    // Precisão importa: "4 Estações Restaurante LTDA" também começa com dígito e é
    // cliente legítimo. O padrão do empresário individual é o CPF INTEIRO no início —
    // 11 dígitos, com ou sem pontuação — seguido do nome da pessoa. E se houver marca
    // societária (LTDA/EIRELI/S.A./ME), é empresa: não corta em nenhuma hipótese.
    const ehPessoaFisica = i => {
      const t = String(i.razaoSocial || i.nome || '').trim();
      if (/\b(ltda|eireli|s\/?a\b|me\b|mei\b|epp\b)/i.test(t)) return false;
      const inicio = t.split(/\s+/)[0] || '';
      // >= 8 dígitos: o caso real da base ("68.524.312 ...") é a RAIZ DO CNPJ virando
      // razão social, com 8 dígitos — não CPF com 11, como eu supus primeiro. Oito é o
      // piso seguro: nenhum nome comercial começa com um número de 8 dígitos
      // ("24 Horas", "360 Graus", "4 Estações" têm 2 ou 3).
      return /^\d[\d.\-\/]*$/.test(inicio) && inicio.replace(/\D/g, '').length >= 8;
    };
    let descartadasRede = 0, descartadasPF = 0;
    const itens = cru.map(normalizar).filter(Boolean)
      .filter(i => {
        const rede = ehRedeGrande(i.nome) || ehRedeGrande(i.razaoSocial);
        if (rede) { descartadasRede++; return false; }
        if (ehPessoaFisica(i)) { descartadasPF++; return false; }
        return true;
      })
      // Mais novo primeiro: a janela de oportunidade encolhe a cada dia que passa.
      .sort((a, b) => String(b.dataAbertura || '').localeCompare(String(a.dataAbertura || '')));

    const maptilerKey = (() => { try { return require('../data/maptiler-config.json').key; } catch (e) { return null; } })();
    const itensComCoordenada = await geocodificarLote(itens, maptilerKey);

    await gravarCache(supaUrl, serviceKey, chave, itensComCoordenada);

    return res.status(200).json({
      ok: true, origem: 'casadosdados', municipio: municipio, uf: uf, dias: dias,
      autenticacaoQueFuncionou: usada,
      // Transparência do funil: quantas vieram e quantas foram cortadas, e por quê.
      // Número que encolhe sem explicação é número em que ninguém confia.
      recebidasDaApi: cru.length,
      descartadasRede: descartadasRede,
      descartadasPessoaFisica: descartadasPF,
      total: itensComCoordenada.length, itens: itensComCoordenada
    });
  } catch (e) {
    const abortou = e && e.name === 'AbortError';
    return res.status(abortou ? 504 : 500).json({
      etapa: 'casadosdados',
      erro: abortou ? 'Casa dos Dados demorou mais de 20s para responder.' : 'Falha ao falar com a Casa dos Dados: ' + String(e.message || e)
    });
  }
};
