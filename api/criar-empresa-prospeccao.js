// api/criar-empresa-prospeccao.js - Etapa 4 (Prospeccao)
// Cria uma Company no HubSpot a partir de uma linha de leads_prospeccao - NUNCA um Deal.
// Regra comercial (spec): prospeccao fria cria primeiro uma Company; o Deal so nasce
// depois, quando o executivo qualifica interesse de verdade (isso continua sendo feito
// pelo fluxo ja existente, api/criar-negocio.js, manualmente, quando fizer sentido).
//
// Fail-closed nas mesmas 4 variaveis de ambiente das outras rotas de escrita
// (HUBSPOT_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY) + a service key pra atualizar o status.

const PIPELINE_FIELD_SALES = '916011864';

let USUARIOS = [];
try {
    const raw = require('../data/usuarios.json');
    USUARIOS = Array.isArray(raw) ? raw : (raw.usuarios || []);
} catch (e) { USUARIOS = []; }

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Metodo nao permitido' });

    const token = process.env.HUBSPOT_TOKEN;
    const supaUrl = process.env.SUPABASE_URL;
    const supaAnon = process.env.SUPABASE_ANON_KEY;
    const supaService = process.env.SUPABASE_SERVICE_KEY;
    if (!token || !supaUrl || !supaAnon || !supaService) {
          return res.status(500).json({ erro: 'Servidor sem configuracao completa.' });
    }

    const auth = req.headers.authorization || '';
    const sessionToken = auth.replace(/^Bearer\s+/i, '');
    if (!sessionToken) return res.status(401).json({ erro: 'Sem sessao. Faca login no cockpit de novo.' });
    let emailLogado = null;
    try {
          const check = await fetch(supaUrl + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + sessionToken, apikey: supaAnon } });
          if (!check.ok) return res.status(401).json({ erro: 'Sessao invalida ou expirada.' });
          const user = await check.json();
          emailLogado = (user && user.email) ? String(user.email).toLowerCase() : null;
    } catch (e) { return res.status(401).json({ erro: 'Nao foi possivel validar a sessao.' }); }
    if (!emailLogado) return res.status(401).json({ erro: 'Sessao sem e-mail associado.' });

    const usuario = USUARIOS.find(u => String(u.email).toLowerCase() === emailLogado);
    if (!usuario) return res.status(403).json({ erro: 'E-mail logado nao esta cadastrado no time.' });

    const { leadId } = req.body || {};
    if (!leadId) return res.status(400).json({ erro: 'Falta o leadId.' });

    const getResp = await fetch(supaUrl + '/rest/v1/leads_prospeccao?id=eq.' + encodeURIComponent(leadId) + '&select=*', {
          headers: { apikey: supaService, Authorization: 'Bearer ' + supaService }
    });
    if (!getResp.ok) return res.status(502).json({ erro: 'Falha ao buscar o lead no Supabase.' });
    const linhas = await getResp.json();
    const lead = linhas[0];
    if (!lead) return res.status(404).json({ erro: 'Lead nao encontrado.' });
    if (lead.status === 'criado_hubspot') return res.status(409).json({ erro: 'Esse lead ja foi criado no HubSpot.', hubspotCompanyId: lead.hubspot_company_id });

    if (usuario.role !== 'manager' && String(lead.responsavel_owner_id) !== String(usuario.ownerId)) {
          return res.status(403).json({ erro: 'Esse lead nao esta atribuido a voce.' });
    }

    try {
          const buscaResp = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
                  method: 'POST',
                  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                            filterGroups: [{ filters: [{ propertyName: 'name', operator: 'EQ', value: lead.nome }] }],
                            properties: ['name'], limit: 1
                  })
          });
          const buscaData = await buscaResp.json();
          if (buscaResp.ok && buscaData.results && buscaData.results.length > 0) {
                  return res.status(409).json({ erro: 'Ja existe uma empresa chamada "' + lead.nome + '" no HubSpot (id ' + buscaData.results[0].id + '). Confira antes de criar de novo.' });
          }
    } catch (e) { }

    const linhasDesc = [
          lead.telefone ? 'Telefone: ' + lead.telefone : null,
          lead.horario_funcionamento ? 'Horario: ' + lead.horario_funcionamento : null,
          (lead.nota != null && lead.avaliacoes != null) ? 'Google: ' + lead.nota + ' - ' + lead.avaliacoes + ' avaliacoes' : null,
          'Fonte: ' + lead.fonte + ' (importado pelo cockpit em ' + new Date(lead.created_at).toLocaleDateString('pt-BR') + ')'
        ].filter(Boolean);

    try {
          const resp = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
                  method: 'POST',
                  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                            properties: {
                                        name: lead.nome,
                                        address: lead.endereco || '',
                                        city: lead.cidade || '',
                                        state: lead.estado || '',
                                        phone: lead.telefone || '',
                                        description: linhasDesc.join('\n')
                            }
                  })
          });
          const data = await resp.json();
          if (!resp.ok) return res.status(resp.status).json({ erro: data.message || 'HubSpot recusou a criacao da empresa.', detalhe: data });

      await fetch(supaUrl + '/rest/v1/leads_prospeccao?id=eq.' + encodeURIComponent(leadId), {
              method: 'PATCH',
              headers: { apikey: supaService, Authorization: 'Bearer ' + supaService, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ status: 'criado_hubspot', hubspot_company_id: String(data.id), updated_at: new Date().toISOString() })
      });

      return res.status(200).json({ ok: true, hubspotCompanyId: data.id, url: 'https://app.hubspot.com/contacts/24373118/company/' + data.id });
    } catch (e) {
          return res.status(500).json({ erro: 'Falha ao falar com o HubSpot: ' + String(e.message || e) });
    }
};
