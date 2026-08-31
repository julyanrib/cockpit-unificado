// api/fila-pwa.js
//
// A FILA PENDENTE DO APP DE CAMPO (31/08/26).
//
// POR QUE ISTO EXISTE
// O Cockpit lê o HubSpot, não os apps. Consequência prática, que estava escrita na tela em
// produção: quando a Daily mostra "0 visitas", ninguém sabe se a pessoa não saiu ou se
// trabalhou o dia todo e o celular ficou sem sinal. Cobrar em cima disso é chute — e é o pior
// erro que a ferramenta pode induzir, porque acusa alguém por falha de rede na frente do time.
//
// Esta rota é onde o PWA declara o que está na fila local e ainda não subiu. Com ela, a Daily
// passa a ter três estados em vez de dois: SUBIU · PENDENTE · FALHOU. Ausência de linha
// continua significando "não sabemos" — nunca zero.
//
// CONTRATO
//   POST /api/fila-pwa
//   Authorization: Bearer <token de sessão do Supabase>   (o mesmo login do Cockpit)
//   {
//     "ownerId": "86100506",            obrigatório
//     "dia": "2026-09-01",              obrigatório, AAAA-MM-DD
//     "pendentes": 3,                   obrigatório, inteiro >= 0
//     "falhas": 0,                      opcional, inteiro >= 0
//     "ultimaTentativa": "2026-09-01T14:22:10Z",   opcional, ISO
//     "versaoApp": "1.4.2",             opcional
//     "detalhe": [ { "tipo": "visita", "cliente": "Bar do Zé", "em": "..." } ]   opcional
//   }
//
// QUEM PODE ESCREVER O QUÊ
// O executivo só declara a PRÓPRIA fila. O gestor pode declarar por qualquer um do time —
// existe para caso de suporte ("o app dele travou, registra aí"), e fica marcado na coluna
// `origem` para ninguém confundir depois com o que o app mandou sozinho.
//
// A ESCRITA É IDEMPOTENTE por (ownerId, dia): o app pode mandar a cada tentativa de sync sem
// criar histórico duplicado. Quem quiser série temporal olha `atualizado_em`.

const USUARIOS = require('../data/usuarios.json');

const HUBSPOT_OK = () => !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY && !!process.env.SUPABASE_SERVICE_KEY;

function usuarioPorEmail(email) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return null;
  const lista = Array.isArray(USUARIOS) ? USUARIOS : (USUARIOS.usuarios || []);
  return lista.find(u => String(u.email || '').trim().toLowerCase() === alvo) || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  if (!HUBSPOT_OK()) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  /* ── sessão: mesmo padrão das outras rotas de escrita ─────────────────────── */
  const auth = String(req.headers.authorization || req.headers.Authorization || '');
  const sessionToken = auth.replace(/^Bearer\s+/i, '');
  if (!sessionToken) return res.status(401).json({ erro: 'Sem sessão. Faça login no cockpit de novo.' });

  let emailLogado = '';
  try {
    const check = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${sessionToken}`, apikey: process.env.SUPABASE_ANON_KEY }
    });
    if (!check.ok) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Faça login de novo.' });
    const dados = await check.json();
    emailLogado = String((dados && dados.email) || '').trim();
  } catch (e) {
    return res.status(401).json({ erro: 'Não foi possível validar a sessão.' });
  }
  if (!emailLogado) return res.status(401).json({ erro: 'Sessão sem e-mail associado. Faça login de novo.' });

  const usuario = usuarioPorEmail(emailLogado);
  if (!usuario) return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });

  /* ── corpo ────────────────────────────────────────────────────────────────── */
  const { ownerId, dia, pendentes, falhas, ultimaTentativa, versaoApp, detalhe } = req.body || {};
  if (!ownerId || !dia) return res.status(400).json({ erro: 'Faltam campos obrigatórios: ownerId e dia (AAAA-MM-DD).' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) return res.status(400).json({ erro: 'Campo "dia" deve estar no formato AAAA-MM-DD.' });

  /* pendentes é o motivo desta rota existir: sem número, não há o que declarar. E precisa ser
     um inteiro — "pendentes: null" seria exatamente a ambiguidade que a rota veio resolver. */
  /* PEGO POR TESTE (31/08/26): `Number(null)` é 0, e `Number.isInteger(0)` é true — então
     `pendentes: null` entrava como ZERO, quer dizer "subiu tudo", quando o app estava
     dizendo "não sei". Seria a mesma ambiguidade que esta rota existe para matar, agora
     gravada no banco com cara de dado. Vazio, nulo e booleano são recusados antes da
     conversão; quem não sabe não manda a linha, e ausência de linha continua significando
     "não sabemos". */
  if (pendentes === undefined || pendentes === null || pendentes === '' || typeof pendentes === 'boolean') {
    return res.status(400).json({ erro: 'Campo "pendentes" é obrigatório e precisa ser um número. Se o app não sabe quantos estão na fila, NÃO mande a linha — ausência é uma informação, zero é outra.' });
  }
  const nPend = Number(pendentes);
  if (!Number.isInteger(nPend) || nPend < 0 || nPend > 100000) {
    return res.status(400).json({ erro: 'Campo "pendentes" deve ser um inteiro entre 0 e 100000.' });
  }
  const nFalhas = falhas === undefined || falhas === null ? 0 : Number(falhas);
  if (!Number.isInteger(nFalhas) || nFalhas < 0 || nFalhas > 100000) {
    return res.status(400).json({ erro: 'Campo "falhas" deve ser um inteiro entre 0 e 100000.' });
  }
  if (ultimaTentativa != null && Number.isNaN(Date.parse(String(ultimaTentativa)))) {
    return res.status(400).json({ erro: 'Campo "ultimaTentativa" deve ser uma data ISO válida.' });
  }

  /* executivo só declara a própria fila; gestor pode declarar pelo time, e fica marcado */
  const souGestor = usuario.role === 'manager';
  if (!souGestor && String(usuario.ownerId || '') !== String(ownerId)) {
    return res.status(403).json({ erro: 'Executivo só pode declarar a própria fila. Peça ao gestor se precisar registrar por outra pessoa.' });
  }

  /* ── grava (upsert por ownerId+dia, com a service key) ────────────────────── */
  const linha = {
    owner_id: String(ownerId),
    dia: String(dia),
    pendentes: nPend,
    falhas: nFalhas,
    ultima_tentativa: ultimaTentativa ? new Date(String(ultimaTentativa)).toISOString() : null,
    versao_app: versaoApp ? String(versaoApp).slice(0, 40) : null,
    /* o detalhe é opcional e limitado: é para a conversa da Daily ("quais ficaram na fila"),
       não para virar log de aplicação dentro do banco do Cockpit. */
    detalhe: Array.isArray(detalhe) ? detalhe.slice(0, 50) : null,
    origem: souGestor && String(usuario.ownerId || '') !== String(ownerId) ? 'gestor' : 'pwa',
    atualizado_em: new Date().toISOString()
  };

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/fila_pwa?on_conflict=owner_id,dia`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify([linha])
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(502).json({ erro: 'Falha ao gravar a fila: ' + txt.slice(0, 240) });
    }
    const salvo = await r.json().catch(() => null);
    return res.status(200).json({ ok: true, gravado: Array.isArray(salvo) ? salvo[0] : linha });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o banco: ' + String(e.message || e) });
  }
};
