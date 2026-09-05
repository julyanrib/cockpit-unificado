// api/criar-negocio.js
// Função serverless da Vercel — roda no servidor, nunca no navegador do executivo.
// É a ÚNICA peça que conhece o HUBSPOT_TOKEN (variável de ambiente da Vercel, nunca
// commitada no repo). O botão "Criar negócio" do cockpit chama esta rota via fetch();
// o navegador manda só os dados do lead e o token de sessão do Supabase — nunca a
// chave do HubSpot.
//
// Configuração necessária no painel da Vercel (Settings → Environment Variables):
//   HUBSPOT_TOKEN        = mesmo valor já usado no secret do GitHub Actions
//   SUPABASE_URL         = mesma URL do data/supabase-config.json
//   SUPABASE_ANON_KEY    = mesma anonKey do data/supabase-config.json
//   SUPABASE_SERVICE_KEY = opcional (mesma já usada por criar-empresa-prospeccao.js);
//                          sem ela, o Deal ainda é criado normalmente, só não associa
//                          à Company existente (ver comentário no corpo da função).

const PIPELINE_FIELD_SALES = '916011864';
const STAGE_BACKLOG = '1396007427'; // "Backlog" — mesma etapa onde o RPA já cria os testes

// BLOCO 49 (14/08/26) — Julyan: "o executivo tem que conseguir adicionar no hub na
// etapa prospecção as contas alvo". Antes TODA criação caía em Backlog e alguém tinha
// que mover à mão depois (na prática, ninguém movia — o Backlog virou depósito). Agora
// o cliente diz em qual etapa nasce; Backlog segue sendo o padrão pra quem não disser,
// então o RPA e qualquer chamada antiga continuam funcionando igual.
const ETAPAS_DE_ENTRADA = ['1396007427', '1395880469']; // Backlog, Prospecção

// Mesma fronteira da rota mudar-etapa-negocio: só estas props podem ser escritas daqui.
const PROPS_PERMITIDAS = ['celular', 'cep', 'bairro', 'cidade', 'logradouro', 'numero',
  'amount', 'valor_de_mrr', 'data_da_reuniao', 'reuniao_agendada', 'origem_do_lead'];
const ORIGENS_LEAD = ['Rua', 'Indicação', 'Casa dos Dados', 'Instagram', 'Ads', 'GoogleMaps', 'Familia', 'Eventos'];
// CORREÇÃO (15/08/26, Julyan): existia um piso de R$349 aqui bloqueando a criação do
// negócio abaixo desse valor — ERRADO. R$349 é a META que a Takeat persegue pra ficar
// saudável, nunca uma trava comercial: quem decide o valor real é o executivo
// negociando com o cliente. PROPS_COM_PISO/PISO_VALOR removidos; mantém validação
// básica (número finito e positivo), sem impor piso nenhum.
const PROPS_VALOR = ['amount', 'valor_de_mrr'];

// ══ CEP E CNPJ SO DIGITOS (04/09/26) ══════════════════════════════════════════════
// O HubSpot RECUSA a escrita inteira quando eles chegam pontuados — medido em auditoria:
// "cep: Enter only numbers and letters, not special characters like -". O executivo
// digita 29050-000 porque e assim que se escreve um CEP. Conferido no CRM: os 543
// negocios com o campo preenchido guardam so digitos, entao limpar aqui e escrever no
// formato que a base ja usa. A tela tambem limpa; esta e a ultima linha, para os
// caminhos que nao passam por ela.
const PROPS_SO_DIGITOS = { cep: 8, cnpj_cpf: 14 };
// == DIGITO VERIFICADOR DE CPF E CNPJ (04/09/26) ===================================
// O RPA do Asaas recusa documento invalido e avisa por WhatsApp horas depois, com o
// contrato ja assinado — medido em auditoria. O caso do dia foi um CNPJ com 13 digitos
// em vez de 14: um zero a menos. A tela ja confere; esta e a ultima linha.
// Aceita CPF (11) e CNPJ (14) porque a base tem os dois no mesmo campo.
function cpfEhValido(d) {
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (let corte = 9; corte <= 10; corte++) {
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * (corte + 1 - i);
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}
function cnpjEhValido(d) {
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const corte of [12, 13]) {
    const p = pesos.slice(13 - corte);
    let soma = 0;
    for (let i = 0; i < corte; i++) soma += Number(d[i]) * p[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[corte])) return false;
  }
  return true;
}
function conferirCpfCnpj(digitos) {
  if (digitos.length === 11) return cpfEhValido(digitos) ? null : 'CPF invalido — confira o numero.';
  if (digitos.length === 14) return cnpjEhValido(digitos) ? null : 'CNPJ invalido — confira o numero.';
  return 'CPF tem 11 digitos e CNPJ tem 14 — vieram ' + digitos.length + '.';
}

function soDigitos(chave, texto) {
  if (!(chave in PROPS_SO_DIGITOS)) return { valor: texto, erro: null };
  const d = String(texto).replace(/[^0-9]/g, '');
  if (d.length > PROPS_SO_DIGITOS[chave]) {
    return { valor: null, erro: `"${chave}" tem ${d.length} dígitos e o HubSpot aceita ${PROPS_SO_DIGITOS[chave]}.` };
  }
  /* o documento tambem passa pelo digito verificador — ver conferirCpfCnpj */
  if (chave === 'cnpj_cpf') {
    const problema = conferirCpfCnpj(d);
    if (problema) return { valor: null, erro: problema };
  }
  return { valor: d, erro: null };
}

function limparPropriedades(bruto) {
  if (!bruto || typeof bruto !== 'object') return { propriedades: {}, erro: null };
  const propriedades = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (!PROPS_PERMITIDAS.includes(chave)) {
      return { propriedades: null, erro: `Propriedade não permitida por esta rota: "${chave}".` };
    }
    if (valor == null || String(valor).trim() === '') continue;
    const texto = String(valor).trim();
    if (PROPS_VALOR.includes(chave)) {
      const n = Number(texto);
      if (!isFinite(n) || n < 0) return { propriedades: null, erro: `Valor inválido em "${chave}".` };
      propriedades[chave] = String(n);
      continue;
    }
    if (chave === 'reuniao_agendada' && texto !== 'true' && texto !== 'false') {
      return { propriedades: null, erro: 'reuniao_agendada só aceita true ou false.' };
    }
    if (chave === 'origem_do_lead' && !ORIGENS_LEAD.includes(texto)) {
      return { propriedades: null, erro: 'Origem do Lead inválida.' };
    }
    if (texto.length > 2000) return { propriedades: null, erro: `"${chave}" é longo demais.` };
    /* CEP e CNPJ so digitos, e o documento passa pelo digito verificador — depois da
       trava de tamanho, nunca antes: um `continue` aqui em cima ja deixou a trava morta. */
    const limpo = soDigitos(chave, texto);
    if (limpo.erro) return { propriedades: null, erro: limpo.erro };
    propriedades[chave] = limpo.valor;
    continue;
  }
  return { propriedades, erro: null };
}

// usuarios.json vai junto no deploy (require com caminho estático é empacotado pela Vercel).
// Formato real do arquivo: { _comment, usuarios: [...] } — não é um array direto.
let USUARIOS = [];
try {
  const raw = require('../data/usuarios.json');
  USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

// == O CONTATO DO NEGOCIO (04/09/26) =============================================
// O RPA do Asaas parte do CONTATO e procura o negocio dele. Sem o vinculo ele falha com
// "Sem deal associado" e manda WhatsApp de erro para o executivo — medido em auditoria.
// Os negocios que geram Asaas hoje tem contato associado (Quintal da Vo -> Veronica,
// criado 0,6s antes do proprio negocio); o que o Cockpit criava nao tinha nenhum.
// MEDI ANTES DE MEXER que NAO era a Company: nenhum dos dois que geraram Asaas tem uma.
//
// ACHAR ANTES DE CRIAR, pelo telefone: o mesmo restaurante visitado duas vezes nao pode
// virar dois contatos. Busca o telefone como foi digitado E so os digitos, porque o
// portal tem os dois formatos gravados.
async function acharOuCriarContato(token, nome, telefone) {
  const cab = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const digitos = String(telefone || '').replace(/[^0-9]/g, '');
  if (digitos.length >= 10) {
    const formas = [String(telefone).trim(), digitos];
    for (const forma of formas) {
      try {
        const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST', headers: cab,
          body: JSON.stringify({
            filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: forma }] }],
            properties: ['phone'], limit: 1
          })
        });
        if (r.ok) {
          const d = await r.json();
          if (d && Array.isArray(d.results) && d.results[0]) {
            return { id: String(d.results[0].id), criado: false, erro: null };
          }
        }
      } catch (e) { /* a busca e otimizacao: falhar aqui so leva a criar um contato novo */ }
    }
  }
  /* NOME DA FACHADA no firstname, e nao um nome de pessoa inventado: quem atende aquele
     telefone e o dono, e o Cockpit nao pergunta o nome dele na criacao. */
  try {
    const props = { firstname: String(nome).slice(0, 100) };
    if (digitos.length >= 10) props.phone = String(telefone).trim();
    const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST', headers: cab, body: JSON.stringify({ properties: props })
    });
    const d = await r.json();
    if (!r.ok) return { id: null, criado: false, erro: (d && d.message) || ('HTTP ' + r.status) };
    return { id: String(d.id), criado: true, erro: null };
  } catch (e) {
    return { id: null, criado: false, erro: String(e.message || e) };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // ajuste para o domínio do cockpit se quiser travar mais
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  // FAIL-CLOSED (correção de segurança 06/08/26): antes, se SUPABASE_URL/ANON_KEY
  // faltassem na Vercel, a checagem de sessão era PULADA (fail-open) e qualquer pessoa
  // podia criar negócios no HubSpot chamando esta rota direto. Agora, sem as três
  // variáveis de ambiente a rota se recusa a operar.
  const token = process.env.HUBSPOT_TOKEN;
  const supaUrl = process.env.SUPABASE_URL;
  const supaAnon = process.env.SUPABASE_ANON_KEY;
  const supaService = process.env.SUPABASE_SERVICE_KEY;
  if (!token || !supaUrl || !supaAnon) {
    return res.status(500).json({ erro: 'Servidor sem configuração completa (HUBSPOT_TOKEN, SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios). Operação bloqueada por segurança.' });
  }

  // ---- 1. sessão Supabase válida + QUEM está chamando (sempre obrigatório) ----
  // Não precisa de chave de admin: valida o token do próprio usuário contra o endpoint
  // público /auth/v1/user, do jeito que o Supabase recomenda para esse caso.
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

  // ---- 2. papel de quem chamou (usuarios.json é a fonte, igual ao atualizar-mrr) ----
  const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
  if (!usuario) {
    return res.status(403).json({ erro: 'E-mail logado não está cadastrado no time.' });
  }

  // ---- 3. dados do lead, validados ----
  const { nome, ownerId, telefone, endereco, bairro, cidade, tipo, nota, avaliacoes, etapa, propriedades, leadId } = req.body || {};
  if (!nome || !ownerId) {
    return res.status(400).json({ erro: 'Faltam campos obrigatórios: nome e ownerId.' });
  }

  // BUG REAL ENCONTRADO E CORRIGIDO (15/08/26): esta rota criava o Deal sempre
  // desconectado de qualquer Company — "não criar Deal desconectado da Company" era
  // um requisito explícito da revisão. Quando o front manda `leadId` (id da linha em
  // leads_prospeccao — mesmo campo que api/criar-empresa-prospeccao.js já preenche com
  // hubspot_company_id quando a Company foi criada antes), busca esse id aqui e associa
  // o Deal a ela logo depois de criado. Sem leadId (ex.: fluxo antigo de conta-alvo fria
  // que ainaind não passa por leads_prospeccao), segue sem associação — não há Company
  // conhecida pra associar, e criar uma às cegas aqui duplicaria o fluxo que já existe
  // em api/criar-empresa-prospeccao.js.
  let companyIdParaAssociar = null;
  if (leadId && supaService) {
    try {
      const leadResp = await fetch(`${supaUrl}/rest/v1/leads_prospeccao?id=eq.${encodeURIComponent(leadId)}&select=hubspot_company_id,responsavel_owner_id`, {
        headers: { apikey: supaService, Authorization: `Bearer ${supaService}` }
      });
      if (leadResp.ok) {
        const linhas = await leadResp.json();
        const linha = linhas && linhas[0];
        // Só reaproveita a Company se o lead pertencer ao MESMO dono que está sendo
        // usado para o Deal — nunca confia em leadId sozinho pra decidir associação.
        if (linha && linha.hubspot_company_id && String(linha.responsavel_owner_id) === String(ownerId)) {
          companyIdParaAssociar = String(linha.hubspot_company_id);
        }
      }
    } catch (e) { /* segue sem associação — a criação do Deal não pode travar por isso */ }
  }
  const etapaEntrada = etapa ? String(etapa) : STAGE_BACKLOG;
  if (!ETAPAS_DE_ENTRADA.includes(etapaEntrada)) {
    return res.status(400).json({ erro: 'Etapa de entrada inválida — um negócio novo só pode nascer em Backlog ou Prospecção.' });
  }
  const limpeza = limparPropriedades(propriedades);
  if (limpeza.erro) return res.status(400).json({ erro: limpeza.erro });
  if (etapaEntrada === '1395880469' && !limpeza.propriedades.origem_do_lead) {
    return res.status(400).json({ erro: 'Prospecção exige a propriedade Origem do Lead.' });
  }

  // Escopo por papel: executivo só cria negócio atribuído A ELE MESMO; gestor pode
  // atribuir a qualquer executivo. (Antes qualquer sessão podia criar em nome de qualquer um.)
  if (usuario.role !== 'manager' && String(ownerId) !== String(usuario.ownerId)) {
    return res.status(403).json({ erro: 'Executivo só pode criar negócio atribuído a si mesmo — peça ao gestor para atribuir a outro dono.' });
  }

  // Deal não tem campo próprio de telefone/endereço neste portal — vai tudo na descrição,
  // igual um humano preencheria à mão.
  const linhas = [
    telefone ? `Telefone: ${telefone}` : null,
    (endereco || bairro || cidade) ? `Endereço: ${[endereco, bairro, cidade].filter(Boolean).join(' — ')}` : null,
    tipo ? `Tipo: ${tipo}` : null,
    (nota != null && avaliacoes != null) ? `Google: ${nota} · ${avaliacoes} avaliações` : null,
    `Origem: conta-alvo — criado pelo cockpit direto em ${etapaEntrada === STAGE_BACKLOG ? 'Backlog' : 'Prospecção'}.`
  ].filter(Boolean);

  try {
    const resp = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          ...limpeza.propriedades,
          dealname: nome,
          pipeline: PIPELINE_FIELD_SALES,
          dealstage: etapaEntrada,
          hubspot_owner_id: String(ownerId),
          description: linhas.join('\n')
        }
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ erro: data.message || 'HubSpot recusou a criação.', detalhe: data });
    }

    // Associação best-effort: o Deal já existe e é válido mesmo se isto falhar — mas a
    // falha precisa aparecer, nunca ficar escondida (regra do prompt: nenhuma ação some
    // silenciosamente). `deal_to_company` é o tipo padrão documentado do HubSpot pra essa
    // associação básica v3 — não um ID numérico arriscado sem confirmação.
    let associacaoFalhou = null;
    if (companyIdParaAssociar) {
      try {
        const assoc = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals/${data.id}/associations/companies/${companyIdParaAssociar}/deal_to_company`,
          { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }
        );
        if (!assoc.ok) associacaoFalhou = 'HTTP ' + assoc.status + ' ao associar à Company ' + companyIdParaAssociar;
      } catch (e) {
        associacaoFalhou = 'exceção ao associar: ' + String(e.message || e);
      }
    }

    /* == E O CONTATO, QUE E O QUE O RPA DO ASAAS PROCURA (04/09/26) ================
       Sem este vinculo o negocio chega em Ag. Pagamento e a cobranca falha com "Sem deal
       associado" — e o executivo descobre por WhatsApp, depois de o cliente ter assinado.
       Best-effort: o negocio ja existe e e valido mesmo se isto falhar. Mas a falha VOLTA
       no retorno, porque associacao que some em silencio da no mesmo que nao existir — so
       que descoberta tarde. */
    let contatoId = null;
    let contatoCriado = false;
    let contatoFalhou = null;
    try {
      const c = await acharOuCriarContato(token, nome, telefone);
      if (!c.id) {
        contatoFalhou = c.erro || 'nao consegui achar nem criar o contato';
      } else {
        contatoId = c.id;
        contatoCriado = c.criado;
        const assoc = await fetch(
          `https://api.hubapi.com/crm/v3/objects/deals/${data.id}/associations/contacts/${contatoId}/deal_to_contact`,
          { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }
        );
        if (!assoc.ok) contatoFalhou = 'HTTP ' + assoc.status + ' ao associar ao contato ' + contatoId;
      }
    } catch (e) {
      contatoFalhou = 'excecao ao associar contato: ' + String(e.message || e);
    }

    return res.status(200).json({
      ok: true, id: data.id, etapa: etapaEntrada,
      propriedadesGravadas: Object.keys(limpeza.propriedades),
      companyIdAssociado: companyIdParaAssociar, associacaoFalhou,
      contatoId, contatoCriado, contatoFalhou,
      url: `https://app.hubspot.com/contacts/24373118/record/0-3/${data.id}`
    });
  } catch (e) {
    return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
  }
};
