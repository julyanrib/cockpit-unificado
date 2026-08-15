// api/hubspot-webhook.js
// Recebe os avisos ("webhooks") que o HubSpot manda toda vez que algo muda no pipeline
// Field Sales — negócio mudou de etapa, visita registrada, follow-up marcado, reunião
// agendada, qualquer propriedade alterada. Em vez de reimplementar a lógica de buscar e
// calcular tudo de novo (que já existe, testada, em scripts/fetch-hubspot.js), este
// endpoint só ACIONA o mesmo robô que já roda 3x por dia — via workflow_dispatch da
// GitHub Actions — assim que o HubSpot avisa que algo mudou. Zero lógica de negócio
// nova, zero risco de duas implementações divergentes do "como calcular o funil".
//
// Variáveis de ambiente novas na Vercel (nenhuma delas existia antes):
//   HUBSPOT_APP_SECRET = o "Client secret" do App Privado no HubSpot (aba Webhooks) —
//                        usado só pra confirmar que o aviso realmente veio do HubSpot,
//                        nunca aparece no navegador de ninguém.
//   GITHUB_PAT         = um token do GitHub com permissão de "workflow" (explico como
//                        gerar no passo a passo) — usado só pra apertar o botão
//                        "Run workflow" da Action automaticamente, no seu lugar.
//
// Segurança: HubSpot assina cada aviso (header X-HubSpot-Signature-v3) com o Client
// Secret do App Privado. A gente recalcula essa assinatura aqui e só aceita o aviso se
// bater — isso impede que qualquer pessoa na internet finja ser o HubSpot e force o
// robô a rodar à toa. Também rejeita avisos com mais de 5 minutos (proteção contra
// "replay": alguém capturar um aviso antigo válido e reenviar depois).

const crypto = require('crypto');

const GITHUB_OWNER = 'julyanrib';
const GITHUB_REPO = 'cockpit-unificado';
const WORKFLOW_FILE = 'daily-refresh.yml';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const appSecret = process.env.HUBSPOT_APP_SECRET;
  const githubPat = process.env.GITHUB_PAT;
  if (!appSecret || !githubPat) {
    // Fail-closed, mesmo padrão de todo o resto do projeto: sem as variáveis
    // configuradas, a rota se recusa a operar em vez de aceitar avisos sem checar.
    return res.status(500).json({ erro: 'Servidor sem HUBSPOT_APP_SECRET/GITHUB_PAT configurados.' });
  }

  // ---- 1. corpo cru da requisição (a assinatura é calculada sobre o texto exato) ----
  let corpoCru = '';
  try {
    corpoCru = await new Promise((resolve, reject) => {
      let dados = '';
      req.on('data', chunk => { dados += chunk; });
      req.on('end', () => resolve(dados));
      req.on('error', reject);
    });
  } catch (e) {
    return res.status(400).json({ erro: 'Não consegui ler o corpo da requisição.' });
  }

  // ---- 2. confere a assinatura (garante que veio do HubSpot de verdade) ----
  const assinaturaRecebida = req.headers['x-hubspot-signature-v3'];
  const timestampRecebido = req.headers['x-hubspot-request-timestamp'];
  if (!assinaturaRecebida || !timestampRecebido) {
    return res.status(401).json({ erro: 'Aviso sem assinatura — recusado.' });
  }
  // Proteção contra replay: aviso com mais de 5 minutos é recusado.
  const idadeMs = Date.now() - Number(timestampRecebido);
  if (!Number.isFinite(idadeMs) || idadeMs > 5 * 60 * 1000 || idadeMs < -60 * 1000) {
    return res.status(401).json({ erro: 'Aviso expirado ou com timestamp inválido — recusado.' });
  }
  // A URL completa (com protocolo e domínio) entra na conta da assinatura — precisa
  // bater exatamente com o que o HubSpot usou pra assinar.
  const protocolo = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const urlCompleta = `${protocolo}://${host}${req.url}`;
  const baseString = req.method + urlCompleta + corpoCru + timestampRecebido;
  const assinaturaEsperada = crypto.createHmac('sha256', appSecret).update(baseString).digest('base64');
  const bufEsperado = Buffer.from(assinaturaEsperada);
  const bufRecebido = Buffer.from(String(assinaturaRecebida));
  const bateu = bufEsperado.length === bufRecebido.length && crypto.timingSafeEqual(bufEsperado, bufRecebido);
  if (!bateu) {
    return res.status(401).json({ erro: 'Assinatura não confere — aviso recusado.' });
  }

  // ---- 3. evita disparar a Action de novo se já tem uma rodando/na fila ----
  // O HubSpot manda um aviso PRA CADA propriedade que mudou — mover uma etapa e
  // preencher 3 campos no mesmo clique vira 4 avisos quase simultâneos. Sem essa
  // checagem, isso disparava 4 execuções da Action ao mesmo tempo, à toa.
  // IMPORTANTE: todo esse trabalho acontece ANTES de responder ao HubSpot — na Vercel,
  // código escrito depois de res.json() não tem garantia de rodar (a função pode
  // congelar assim que a resposta é enviada). O HubSpot aceita alguns segundos de
  // espera numa resposta de webhook, então responder por último aqui é seguro.
  try {
    const headersGitHub = {
      Authorization: `Bearer ${githubPat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    const emAndamento = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?status=in_progress&per_page=1`,
      { headers: headersGitHub }
    );
    const naFila = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?status=queued&per_page=1`,
      { headers: headersGitHub }
    );
    const dadosAndamento = emAndamento.ok ? await emAndamento.json() : { total_count: 0 };
    const dadosFila = naFila.ok ? await naFila.json() : { total_count: 0 };
    if ((dadosAndamento.total_count || 0) > 0 || (dadosFila.total_count || 0) > 0) {
      return res.status(200).json({ ok: true, disparado: false, motivo: 'já havia uma rodada em andamento/na fila' });
    }

    // ---- 4. dispara a mesma Action que já roda 3x por dia, agora sob demanda ----
    const disparo = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      { method: 'POST', headers: { ...headersGitHub, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) }
    );
    if (!disparo.ok) {
      const corpoErro = await disparo.text();
      console.log('[hubspot-webhook] GitHub recusou disparar a Action:', disparo.status, corpoErro);
      return res.status(200).json({ ok: true, disparado: false, motivo: 'GitHub recusou: ' + disparo.status });
    }
    return res.status(200).json({ ok: true, disparado: true });
  } catch (e) {
    console.log('[hubspot-webhook] Falha ao falar com o GitHub:', e.message);
    // Responde 200 mesmo assim: o problema é nosso (falar com o GitHub), não do aviso
    // do HubSpot — devolver erro faria o HubSpot ficar reenviando o mesmo aviso à toa.
    return res.status(200).json({ ok: true, disparado: false, motivo: 'exceção: ' + e.message });
  }
};
