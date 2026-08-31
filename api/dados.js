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
