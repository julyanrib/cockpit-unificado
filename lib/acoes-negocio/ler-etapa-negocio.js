// lib/acoes-negocio/ler-etapa-negocio.js
//
// LER A ETAPA ATUAL DE UM NEGÓCIO — a operação que transforma "não sei se gravou" em "sei".
// ---------------------------------------------------------------------------------------
// POR QUE ELA EXISTE, com o caso que a produziu (04/09/26):
//
// A Kelly moveu "Guaruba Açaí" de Conversa com Decisor para Perdido, com motivo "Outros" e
// a frase do cliente. A tela mostrou «Falha ao falar com o HubSpot: signal is aborted
// without reason» — o navegador cancelou a espera em 10s. Fui ao HubSpot: o negócio ESTÁ
// em Perdido, com o motivo e a observação inteira, modificado às 14:03:28Z — o minuto
// exato do print dela.
//
// Ou seja: a tela disse que falhou sobre uma gravação que deu certo. Isso é pior que o
// defeito da véspera — lá nada era escrito e a mensagem era honesta. Tela que erra nos
// DOIS sentidos não serve para decidir nada, e a saída natural do executivo (tentar de
// novo) escreve duas vezes.
//
// A CAUSA DA DEMORA não é o HubSpot ser lento: `mudar-etapa` faz DUAS idas — o GET de
// autorização, que nunca confia na etapa que o navegador informou, e o PATCH — somadas à
// partida a frio da função na Vercel. Passa de 10s sem nada estar errado.
//
// E ELEVAR O PRAZO NÃO RESOLVE SOZINHO: qualquer prazo pode estourar, e a pergunta que
// sobra é sempre a mesma — "gravou ou não?". Esta rota responde. O cliente, ao ser
// abortado, pergunta a etapa atual: se já é a de destino, a mudança aconteceu e a tela diz
// isso; se não é, a tela diz que não gravou. Nenhum dos dois é chute.
//
// SÓ LÊ, e passa pela MESMA autorização das escritas (buscarDealAutorizado), porque "qual
// a etapa deste negócio" também é informação do CRM de alguém: um executivo não confirma o
// negócio de outro. Mesmo padrão de sessão de mudar-etapa-negocio.js, linha por linha —
// uma segunda forma de validar sessão seria um segundo lugar para a regra de acesso morar.

const { buscarDealAutorizado } = require('../hubspot-deal-guard');

const USUARIOS = (() => {
  const raw = require('../../data/usuarios.json');
  return Array.isArray(raw) ? raw : (raw && Array.isArray(raw.usuarios) ? raw.usuarios : []);
})();

module.exports = async function lerEtapaNegocio(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY).' });
  }

  // ---- 1. sessão Supabase válida ----
  let emailLogado = null;
  const auth = req.headers.authorization || '';
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });
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

  // ---- 2. papel de quem chamou ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  // ---- 3. o pedido ----
  const dealId = req.body && req.body.dealId;
  if (!dealId) return res.status(400).json({ erro: 'Falta o dealId.' });

  try {
    const guard = await buscarDealAutorizado({
      token, dealId, usuario, propriedades: ['dealstage', 'dealname']
    });
    if (guard.erro) return res.status(guard.erro.status).json({ erro: guard.erro.mensagem });
    const props = (guard.deal && guard.deal.properties) || {};
    return res.status(200).json({
      ok: true,
      id: String(dealId),
      etapa: String(props.dealstage || ''),
      nome: props.dealname || null
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao ler a etapa no HubSpot: ' + String(e.message || e) });
  }
};
