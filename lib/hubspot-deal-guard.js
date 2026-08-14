'use strict';

const PIPELINE_FIELD_SALES = '916011864';

function erro(status, mensagem) {
  return { status, mensagem };
}

async function buscarDealAutorizado({ token, dealId, usuario, propriedades = [] }) {
  const id = String(dealId || '').trim();
  if (!id) return { erro: erro(400, 'Falta o dealId.') };
  if (!usuario || !['manager', 'rep'].includes(usuario.role)) {
    return { erro: erro(403, 'Papel de usuário não autorizado a editar negócios.') };
  }

  const props = [...new Set(['dealname', 'pipeline', 'dealstage', 'hubspot_owner_id', ...propriedades])];
  let resposta;
  try {
    resposta = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(id)}?properties=${encodeURIComponent(props.join(','))}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    return { erro: erro(502, 'Não foi possível consultar o negócio no HubSpot: ' + String(e.message || e)) };
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    return {
      erro: erro(
        resposta.status === 404 ? 404 : 502,
        resposta.status === 404
          ? 'Negócio não encontrado no HubSpot.'
          : 'O HubSpot recusou a validação do negócio: ' + (dados.message || 'sem mensagem')
      )
    };
  }

  const deal = { ...dados, properties: dados.properties || {} };
  if (String(deal.properties.pipeline || '') !== PIPELINE_FIELD_SALES) {
    return { erro: erro(403, 'Esse negócio não pertence ao pipeline Field Sales.') };
  }
  if (usuario.role === 'rep') {
    if (!usuario.ownerId || String(usuario.ownerId).startsWith('pendente_')) {
      return { erro: erro(403, 'Seu usuário ainda não tem owner do HubSpot configurado.') };
    }
    if (String(deal.properties.hubspot_owner_id || '') !== String(usuario.ownerId)) {
      return { erro: erro(403, 'Esse negócio não é seu — somente o dono ou um gestor pode alterá-lo.') };
    }
  }

  return { deal, ownerId: deal.properties.hubspot_owner_id ? String(deal.properties.hubspot_owner_id) : null };
}

async function removerObjetoHubSpot(token, tipo, id) {
  if (!id) return false;
  try {
    const resposta = await fetch(`https://api.hubapi.com/crm/v3/objects/${tipo}/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    return resposta.ok;
  } catch (e) {
    return false;
  }
}

module.exports = { PIPELINE_FIELD_SALES, buscarDealAutorizado, removerObjetoHubSpot };
