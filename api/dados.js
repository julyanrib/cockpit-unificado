// api/dados.js — Etapa 1b (dados atrás do login)
// Função serverless da Vercel. É por AQUI que o cockpit recebe os dados do CRM agora:
// o public/index.html publicado não carrega mais nenhum dado real — só o shell + login.
//
// Fluxo: o navegador loga no Supabase → manda o token de sessão pra cá → esta rota
// valida a sessão, descobre QUEM é (usuarios.json) e devolve o DATA já filtrado:
//   - gestor: tudo (idêntico ao que o build embutia antes).
//   - executivo: o próprio funil completo + resumo agregado dos colegas (sem clientes,
//     notas, gargalos ou coaching dos outros). Corte aprovado em 07/08/26.
//
// FAIL-CLOSED: sem as env vars, sem sessão válida ou sem cadastro no time → nada sai.
// Variáveis de ambiente na Vercel (as mesmas das outras rotas): SUPABASE_URL, SUPABASE_ANON_KEY.

const { montarDadosCompletos, filtrarParaPapel, USUARIOS } = require('../scripts/montar-dados.js');
const PLAYBOOK = require('../data/field-sales-playbook.compiled.json');
const PRECIFICACAO = require('../data/precificacao.json');
const REALIZADO = require('../lib/realizado.js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Dado sensível por sessão — nunca deixar cair em cache compartilhado/CDN.
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão válida + quem está chamando ----
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });

  let emailLogado = null;
  try {
    const check = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: supaAnon }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const user = await check.json();
    emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  // ---- 2. cadastro no time (usuarios.json é a fonte, igual às outras rotas) ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time. Fale com seu gestor.' });
  }

  // Biblioteca interna sob demanda. Reutiliza esta rota autenticada para não criar uma
  // 13ª Function (limite do plano Vercel Hobby) nem adicionar 400 KB ao login normal.
  if (req.query && req.query.recurso === 'playbook') {
    return res.status(200).json({ ok: true, playbook: PLAYBOOK });
  }
  if (req.query && req.query.recurso === 'precificacao') {
    return res.status(200).json({ ok: true, precificacao: PRECIFICACAO });
  }

  /* ════════════════════════════════════════════════════════════════════════════════════
     O CUMPRIDO DE AGORA — o que faz a Minha Daily v2 ser um placar (01/09/26)

     POR QUE PRECISA EXISTIR: o resto desta rota devolve o SNAPSHOT do CRM, que o robô
     atualiza às 11:56, 16:00 e 22:00. Entre 11:56 e 16:00 o número do dia fica parado
     quatro horas. A tese da v2 é "prometido × cumprido AO VIVO": o executivo registra a
     visita e vê a barra andar. Com o snapshot, ele registraria às 14h e a tela só reagiria
     às 16h — que é o contrato estático que a v2 existe para substituir.

     POR QUE MORA AQUI E NÃO NUMA ROTA NOVA: o mesmo motivo já escrito acima para o
     playbook — o plano Hobby da Vercel limita as Functions, e esta rota já valida a sessão
     e sabe quem está chamando. Rota nova seria uma 11ª Function e uma segunda cópia da
     autenticação.

     A CONTA NÃO ESTÁ AQUI: está em lib/realizado.js, a mesma que o robô chama. Se
     estivesse aqui, a tela e a tabela `dailies` responderiam a mesma pergunta de dois
     jeitos, e ninguém saberia qual dos dois números é o dia do executivo.

     QUEM PODE PERGUNTAR PELO DIA DE QUEM: o executivo, só o dele. O gestor pode passar
     ?owner=<id> — é o mesmo corte de papel que o resto da rota já aplica.
     ════════════════════════════════════════════════════════════════════════════════════ */
  if (req.query && req.query.recurso === 'realizado-hoje') {
    const hsToken = process.env.HUBSPOT_TOKEN;
    if (!hsToken) {
      /* fail-closed com motivo legível: a tela precisa distinguir "não deu para medir" de
         "medi e é zero". Zero silencioso viraria "você não fez nada hoje". */
      return res.status(503).json({ erro: 'Servidor sem HUBSPOT_TOKEN — não é possível medir o cumprido agora.' });
    }
    /* 'manager' é o papel no cadastro (data/usuarios.json), e é assim que o resto do
       projeto testa — filtrarParaPapel em scripts/montar-dados.js compara com 'manager'.
       Eu havia escrito 'gestor' aqui, o que deixaria o gestor sem poder consultar o dia
       de ninguém: papel que nunca casa vira permissão que nunca existe. */
    const ehGestor = String(usuario.role) === 'manager';
    const ownerPedido = req.query.owner ? String(req.query.owner) : null;
    if (ownerPedido && !ehGestor && ownerPedido !== String(usuario.ownerId)) {
      return res.status(403).json({ erro: 'Você só pode consultar o seu próprio dia.' });
    }
    const ownerId = ownerPedido || (usuario.ownerId != null ? String(usuario.ownerId) : null);
    if (!ownerId) {
      /* executivo em onboarding, sem owner no HubSpot: não há o que medir, e dizer isso é
         melhor que devolver quatro zeros como se fosse resultado. */
      return res.status(200).json({ ok: true, semOwner: true, motivo: 'Sem owner no HubSpot ainda — o placar começa quando o funil começar.' });
    }

    const hsSearch = async (tipo, body) => {
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/' + tipo + '/search', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + hsToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('HubSpot ' + tipo + ' respondeu ' + r.status);
      return r.json();
    };

    try {
      /* Os negócios do executivo com a DATA DE ENTRADA em cada etapa que conta. É esta
         lista que responde "avançou/propôs hoje" — e ela vem do HubSpot, não do snapshot,
         porque a pergunta é sobre agora. Uma busca, não uma por etapa. */
      const propsEtapa = REALIZADO.ETAPAS_DE_AVANCO
        .concat([REALIZADO.STAGES_REALIZADO.demoProposta])
        .map(id => 'hs_v2_date_entered_' + id);
      const deals = await hsSearch('deals', {
        filterGroups: [{ filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: REALIZADO.PIPELINE_REALIZADO },
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
          /* só o que foi tocado nas últimas 48h pode ter entrado numa etapa hoje —
             filtrar aqui evita trazer o funil inteiro do executivo a cada minuto. */
          { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(Date.now() - 48 * 3600 * 1000) }
        ] }],
        properties: ['dealname'].concat(propsEtapa),
        limit: 100
      });
      const r = await REALIZADO.realizadoDeHoje(hsSearch, ownerId, { negocios: deals.results || [] });
      return res.status(200).json(Object.assign({ ok: true, ownerId, medidoEm: new Date().toISOString() }, r));
    } catch (e) {
      /* erro do HubSpot NÃO pode virar zero na tela: a barra desceria e o executivo veria
         pontos desaparecerem. A tela mantém o último número e mostra "sem medir agora". */
      return res.status(502).json({ erro: 'Não foi possível medir agora: ' + e.message });
    }
  }

// OTIMIZAÇÃO (19/08/26, Julyan: "o site tá cada vez mais pesado, tem algo que
// conseguimos otimizar sem perder nada do conteúdo") — achado real: em objetos de
// negócio (críticos, quentes, funil), ~50% dos campos vêm `null` do HubSpot (ex.:
// `email`, `cnpj_cpf`, `mrr`, `data_da_reuniao` — a maioria dos negócios não passou
// daquela etapa ainda). Cada `"campo":null` ocupa espaço no JSON sem carregar
// NENHUMA informação (o front-end já trata campo ausente exatamente igual a `null`
// — nenhum lugar do código faz `'campo' in objeto`, checado antes desta mudança).
// Remove essas chaves recursivamente, cortando ~metade do peso das listas grandes
// sem tirar um único dado que o usuário realmente vê.
function removerNulosRecursivo(valor) {
  if (Array.isArray(valor)) return valor.map(removerNulosRecursivo);
  if (valor && typeof valor === 'object') {
    const limpo = {};
    for (const chave in valor) {
      const v = valor[chave];
      if (v === null) continue;
      limpo[chave] = removerNulosRecursivo(v);
    }
    return limpo;
  }
  return valor;
}

  // ---- 3. monta e filtra ----
  try {
    const completo = montarDadosCompletos();
    const dados = removerNulosRecursivo(filtrarParaPapel(completo, usuario));
    /* AÇÃO DE CAMPO VAI PARA O APP (31/08/26). Decidido na reunião com o RPA: o Cockpit vira
       a aba de gestão dentro do app de campo, e o mapa é a aba operacional que fica aberta na
       rua. Ligar, mandar WhatsApp e navegar têm que entrar no app — é ele que sabe registrar
       o que aconteceu depois. A tela já sabe fazer isso; só falta o endereço do app.
       Enquanto PWA_DEEP_LINK não existir no ambiente, nada muda: tel: liga, wa.me abre,
       Maps navega. Ligar a transição é uma variável de ambiente, não um deploy de código. */
    const pwaDeepLink = String(process.env.PWA_DEEP_LINK || '').trim();
    if (/^https?:\/\//i.test(pwaDeepLink)) {
      dados.pwa = { deepLink: pwaDeepLink };
    }
    return res.status(200).json({
      sessao: { email: usuario.email, role: usuario.role, ownerId: usuario.ownerId, nome: usuario.nome, aComecar: !!usuario.aComecar },
      dados
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao montar os dados: ' + String(e.message || e) });
  }
};
