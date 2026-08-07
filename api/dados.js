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

  // ---- 3. monta e filtra ----
  try {
    const completo = montarDadosCompletos();
    const dados = filtrarParaPapel(completo, usuario);
    return res.status(200).json({
      sessao: { email: usuario.email, role: usuario.role, ownerId: usuario.ownerId, nome: usuario.nome },
      dados
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao montar os dados: ' + String(e.message || e) });
  }
};
