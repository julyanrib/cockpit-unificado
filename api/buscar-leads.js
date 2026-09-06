// api/buscar-leads.js
//
// BUSCA SOB DEMANDA NA CASA DOS DADOS (06/09/26, aba Rotas & Prospecção do gestor).
//
// POR QUE ESTA ROTA EXISTE: a regra de ouro da aba nova é "nada entra sozinho — o gestor
// dispara a importação, por praça, quando o estoque pede". Até aqui existiam duas metades
// e faltava a ponte entre elas:
//   · scripts/backfill-casa-dos-dados.js BUSCA, mas só roda no cron de segunda;
//   · api/importar-leads.js RECEBE leads prontos, mas não sai buscando.
// Esta rota é a ponte: recebe uma praça, chama a MESMA busca do coletor semanal e entrega
// o resultado para o MESMO endpoint de importação.
//
// NÃO REIMPLEMENTA NADA. Busca, normalização, filtro de foodservice, deduplicação,
// roteamento por território e corte de qualidade continuam onde sempre estiveram e
// continuam sendo testados lá. Este arquivo tem uma responsabilidade só: autorizar o
// gestor e amarrar as duas pontas. Se um dia o critério de qualidade mudar, muda num
// lugar e vale para o cron e para o botão — que é o contrário do que já me custou caro
// neste produto (a mesma regra escrita em dois lugares, divergindo em silêncio).
//
// O QUE ESTA ROTA NÃO FAZ, e o motivo está na tela:
//   · Google Places — o coletor existe (scripts/backfill-google-places.js) e roda mensal,
//     mas GOOGLE_PLACES_API_KEY só existe nos Secrets do GitHub, não nas env vars da
//     Vercel. Sem a chave aqui, disparar Places daqui devolveria erro. O chip fica
//     desabilitado dizendo isso.
//   · TripAdvisor — fora da allowlist de rede e o ToS proíbe coleta automatizada. Não é
//     "ainda não fizemos": é uma fonte que não pode existir por este caminho.
//
// Variáveis de ambiente (todas já existem na Vercel):
//   CASADOSDADOS_TOKEN  -> a mesma que api/novidades-mercado.js usa
//   IMPORT_SECRET       -> o mesmo que api/importar-leads.js valida
//   SUPABASE_URL / SUPABASE_ANON_KEY -> para validar a sessão do gestor

const { CIDADES, buscarCidade, importarLote } = require('../scripts/backfill-casa-dos-dados.js');
const { montarDadosCompletos } = require('../scripts/montar-dados.js');

/* teto de segurança: o botão é do gestor, mas uma requisição HTTP não pode paginar a
   Casa dos Dados por minutos. 100 é o topo que a própria tela oferece. */
const QUANTIDADE_MAXIMA = 100;
const QUANTIDADE_PADRAO = 25;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const casaToken = process.env.CASADOSDADOS_TOKEN;
  const importSecret = process.env.IMPORT_SECRET;
  if (!casaToken) return res.status(500).json({ erro: 'CASADOSDADOS_TOKEN não configurado neste deployment.' });
  if (!importSecret) return res.status(500).json({ erro: 'IMPORT_SECRET não configurado neste deployment.' });

  /* ── SÓ O GESTOR DISPARA ──────────────────────────────────────────────────────
     Mesma checagem de api/importar-leads.js: sessão do Supabase, e-mail conferido
     contra data/usuarios.json. Aqui é mais restrito de propósito — importar-leads
     deixa o executivo trazer conta da Casa dos Dados para a própria carteira; disparar
     uma VARREDURA de praça é decisão de quem olha o estoque do time. */
  const auth = req.headers.authorization || '';
  if (!/^Bearer\s+/i.test(auth)) return res.status(401).json({ erro: 'Faça login para disparar a importação.' });
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaAnon) return res.status(500).json({ erro: 'Supabase não configurado neste deployment.' });

  let quemPediu = null;
  try {
    const check = await fetch(supaUrl + '/auth/v1/user', {
      headers: { Authorization: auth, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    const email = String(((await check.json()) || {}).email || '').toLowerCase();
    const USUARIOS = (montarDadosCompletos().usuarios) || [];
    const u = email ? USUARIOS.find(x => String(x.email).toLowerCase() === email) : null;
    if (!u || u.role !== 'manager') {
      return res.status(403).json({ erro: 'Só o gestor dispara importação de praça.' });
    }
    quemPediu = u.email;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }

  /* ── a praça tem que ser uma que o roteador saiba rotear ────────────────────────
     CIDADES é a lista do coletor, e é ela que api/importar-leads sabe transformar em
     dono. Aceitar município livre criaria lead sem território — órfão nascendo por
     digitação, que é o problema que o card de território órfão existe para resolver. */
  const municipio = String((req.body && req.body.municipio) || '').trim();
  const cfgOriginal = CIDADES.find(c => c.municipio.toLowerCase() === municipio.toLowerCase());
  if (!cfgOriginal) {
    return res.status(400).json({
      erro: 'Praça desconhecida — o roteador não saberia de quem é o lead.',
      pracasValidas: CIDADES.map(c => c.municipio)
    });
  }

  let quantidade = Number((req.body && req.body.quantidade) || QUANTIDADE_PADRAO);
  if (!isFinite(quantidade) || quantidade <= 0) quantidade = QUANTIDADE_PADRAO;
  quantidade = Math.min(Math.round(quantidade), QUANTIDADE_MAXIMA);

  /* a quantidade pedida vira o objetivo E o teto desta rodada: o coletor para de paginar
     assim que alcança, então o gestor não espera por 500 leads que ele não pediu */
  const cfg = Object.assign({}, cfgOriginal, { objetivoMinimo: quantidade, tetoMaximo: quantidade });

  try {
    const leads = await buscarCidade(cfg, casaToken);
    if (!leads || !leads.length) {
      return res.status(200).json({
        ok: true, municipio: cfgOriginal.municipio, encontrados: 0, inseridos: 0, duplicados: 0,
        aviso: 'A busca rodou e não trouxe conta nova nesta praça — o filtro de foodservice e a janela de abertura já descartam o resto.'
      });
    }
    const r = await importarLote(leads, importSecret);
    return res.status(200).json({
      ok: true,
      municipio: cfgOriginal.municipio,
      encontrados: leads.length,
      inseridos: r.inseridos || 0,
      duplicados: r.duplicados || 0,
      pedidoPor: quemPediu
    });
  } catch (e) {
    /* O ERRO CHEGA NA TELA COM O MOTIVO. Importação que "rodou" e não trouxe nada, sem
       dizer por quê, faz o gestor apertar o botão de novo — e a segunda tentativa custa
       a mesma cota de API da primeira. */
    return res.status(502).json({ erro: 'A busca na Casa dos Dados falhou: ' + (e && e.message ? e.message : 'erro desconhecido') });
  }
};
