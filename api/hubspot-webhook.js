// api/hubspot-webhook.js
// Recebe os avisos ("webhooks") que o HubSpot manda toda vez que algo muda no pipeline
// Field Sales — negócio mudou de etapa, visita registrada, follow-up marcado, reunião
// agendada, qualquer propriedade alterada. Em vez de reimplementar a lógica de buscar e
// calcular tudo de novo (que já existe, testada, em scripts/fetch-hubspot.js), este
// endpoint só ACIONA o mesmo robô que já roda 3x por dia — via workflow_dispatch da
// GitHub Actions — assim que o HubSpot avisa que algo mudou. Zero lógica de negócio
// nova, zero risco de duas implementações divergentes do "como calcular o funil".
//
// Variáveis de ambiente novas na Vercel:
//   HUBSPOT_APP_SECRET  = o "Client secret" do App Privado no HubSpot (aba Webhooks) —
//                        usado só pra confirmar que o aviso realmente veio do HubSpot,
//                        nunca aparece no navegador de ninguém.
//   GITHUB_PAT         = um token do GitHub com permissão de "workflow" (explico como
//                        gerar no passo a passo) — usado só pra apertar o botão
//                        "Run workflow" da Action automaticamente, no seu lugar.
//   SUPABASE_URL, SUPABASE_SERVICE_KEY = as mesmas usadas no resto do projeto —
//                        usadas aqui só pro lock atômico de cooldown (tabela
//                        webhook_cooldown), não pra ler/gravar nenhum dado de negócio.
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
// CORREÇÃO (16/08/26, Julyan — auditoria pós-teto de deploy da Vercel): a única trava
// que existia era "não disparar se já tem uma rodando/na fila" — isso evita duplicar um
// disparo simultâneo, mas NÃO limita frequência. O HubSpot manda um aviso pra cada
// propriedade que muda, e com 7 executivos mexendo no funil o dia todo, isso disparava
// o robô (e um deploy novo na Vercel) a cada 10-20 minutos, sem parar, durante todo o
// expediente — 70+ vezes num único dia, batendo sozinho no teto de 100 deploys/dia do
// plano Hobby, antes mesmo de somar qualquer upload manual. Esta janela de descanso
// (cooldown) limita a frequência dos disparos extras — os 3 horários fixos do dia
// (scripts/... via daily-refresh.yml) continuam garantindo atualização mesmo sem
// nenhum evento do HubSpot; o webhook só acelera entre eles, sem virar uma rajada.
// AJUSTE (16/08/26, Julyan): 15→60 min. Motivo real, não só volume de deploy — upload
// manual de correção e disparo automático (rodando com o código de ANTES da correção)
// podiam se sobrepor, e o automático, terminando depois, sobrescrevia o commit manual.
// Menos disparos automáticos por hora reduz a janela onde isso acontece.
const COOLDOWN_MINUTOS = 60;

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

  const supaUrl = process.env.SUPABASE_URL;
  const supaService = process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaService) {
    return res.status(500).json({ erro: 'Servidor sem SUPABASE_URL/SUPABASE_SERVICE_KEY configurados (necessários pro lock de cooldown).' });
  }

  // ---- 3. intervalo mínimo entre disparos (cooldown) — LOCK ATÔMICO, não checagem ----
  // CORREÇÃO (19/08/26, achado real: pares de execuções com segundos de diferença,
  // mesmo com cooldown de 60min) — a versão antiga fazia "consultar API do GitHub →
  // decidir → disparar" em passos separados (check-then-act). O HubSpot manda 1 aviso
  // POR PROPRIEDADE alterada — mudar etapa + preencher campos = vários avisos quase
  // simultâneos. Duas requisições da function podiam consultar a MESMA última
  // execução (de >60min atrás) ANTES da primeira aparecer na lista do GitHub, e ambas
  // concluíam "pode disparar". Clássica race condition.
  //
  // Agora é um único UPDATE condicional no Postgres — o banco serializa isso, então é
  // fisicamente impossível duas requisições concorrentes ganharem o lock ao mesmo
  // tempo. Só quem realmente "vence" a corrida (SET ... WHERE ultimo_disparo_em <
  // agora-60min RETURNING id) segue pro disparo; quem perde recebe array vazio e para
  // aqui, sem nunca ter chamado a API do GitHub.
  const agora = new Date();
  const limiteMs = agora.getTime() - COOLDOWN_MINUTOS * 60 * 1000;
  let ganhouLock = false;
  try {
    const respLock = await fetch(
      `${supaUrl}/rest/v1/webhook_cooldown?id=eq.1&ultimo_disparo_em=lt.${encodeURIComponent(new Date(limiteMs).toISOString())}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${supaService}`,
          apikey: supaService,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ ultimo_disparo_em: agora.toISOString() })
      }
    );
    const linhasAtualizadas = respLock.ok ? await respLock.json() : [];
    ganhouLock = Array.isArray(linhasAtualizadas) && linhasAtualizadas.length > 0;
  } catch (e) {
    console.log('[hubspot-webhook] Falha ao tentar o lock de cooldown:', e.message);
    // Falha ao falar com o Supabase não pode travar o webhook pra sempre, mas também
    // não pode arriscar disparo sem trava — nesse caso específico, prefere NÃO
    // disparar (mais seguro pedir pro próximo aviso tentar de novo do que arriscar
    // uma rajada de disparos se o Supabase estiver instável).
    return res.status(200).json({ ok: true, disparado: false, motivo: 'exceção ao checar lock de cooldown: ' + e.message });
  }
  if (!ganhouLock) {
    return res.status(200).json({ ok: true, disparado: false, motivo: `cooldown ativo ou lock perdido pra outra requisição concorrente (mínimo ${COOLDOWN_MINUTOS} min entre disparos)` });
  }

  // ---- 4. evita disparar a Action de novo se já tem uma rodando/na fila ----
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

    // ---- 5. dispara a mesma Action que já roda 3x por dia, agora sob demanda ----
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
