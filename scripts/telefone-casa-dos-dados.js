// scripts/telefone-casa-dos-dados.js
//
// O CELULAR DO RECÉM-ABERTO (Julyan, 30/10/26: "pode colocar o celular, podemos gastar da
// casa dos dados").
//
// A busca em lote da Casa dos Dados (a importação de domingo) NÃO devolve telefone: lá ele
// só existe como filtro (com_telefone). Quem devolve é a Consulta CNPJ (v4), no campo
// contato_telefonico — 1 crédito por empresa. Este robô faz essa consulta para os
// recém-abertos que IMPORTAM: CNPJ de até 90 dias, no nome de um executivo ativo, ainda de
// rua e sem telefone. Em 30/10 eram 280. Depois disso, só os novos de cada semana.
//
// Cada crédito vale uma vez:
//   · achou telefone  -> grava no lead (leads_prospeccao) e no pino (clients) sem telefone;
//   · não achou        -> marca telefone_normalizado = 'sem:<cnpj>' no lead, e ele não é
//                         consultado de novo (o app só lê `telefone`, a marca não aparece);
//   · número de enfeite (11 99999-9999, 21 2222-2222: o mesmo dígito depois do DDD) conta
//     como "não achou";
//   · número que já é de outro lead -> 'dup:<cnpj>', sem gravar o número.
// A marca leva o CNPJ porque telefone_normalizado é ÚNICO no banco (é a chave de dedup da
// importação): na primeira rodada, em 30/10, '0' fixo teria batido na trava no segundo
// lead, e 19 números repetidos bateram nela e ficaram sem marca.
// Preferência: celular (11 dígitos com 9 depois do DDD); sem celular, o primeiro número.
// O app avisa no cartão que o telefone do cadastro do CNPJ pode ser do contador.
//
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, CASADOSDADOS_TOKEN
//            LIMITE (padrão 300), SO_CONTAR=sim (só conta, não gasta crédito)

const { acharTelefones } = require('../lib/contato-cnpj');

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const CASA = process.env.CASADOSDADOS_TOKEN;
const LIMITE = Math.max(1, Math.min(2000, Number(process.env.LIMITE) || 300));
const SO_CONTAR = /^(sim|true|1)$/i.test(process.env.SO_CONTAR || '');
const DIAS = 90;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function falta(nome) { console.error('Falta a variável ' + nome + '.'); process.exit(1); }
if (!SUPA) falta('SUPABASE_URL');
if (!KEY) falta('SUPABASE_SERVICE_KEY');
if (!CASA && !SO_CONTAR) falta('CASADOSDADOS_TOKEN');

async function rest(caminho, opcoes) {
  const r = await fetch(SUPA + '/rest/v1/' + caminho, Object.assign({}, opcoes, {
    headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, (opcoes || {}).headers || {})
  }));
  const txt = await r.text();
  if (!r.ok) throw new Error(caminho.split('?')[0] + ' ' + r.status + ': ' + txt.slice(0, 200));
  return txt ? JSON.parse(txt) : null;
}

/* número de enfeite: depois do DDD, o mesmo dígito repetido (99999-9999, 2222-2222) */
function deEnfeite(t) {
  let d = String(t).replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return /^\d{2}(\d)\1+$/.test(d);
}
/* celular primeiro: DDD + 9 + 8 dígitos (com ou sem 55 na frente) */
function escolher(todos) {
  const telefones = todos.filter((t) => !deEnfeite(t));
  const cel = telefones.find((t) => {
    let d = String(t).replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
    return d.length === 11 && d[2] === '9';
  });
  return cel || telefones[0] || null;
}

(async () => {
  // os donos que valem: executivos ATIVOS do cockpit
  const equipe = await rest('equipe_cockpit?select=profile_id&ativo=eq.true&so_acesso=eq.false');
  const ids = (equipe || []).map((e) => e.profile_id);
  if (!ids.length) { console.log('Nenhum executivo ativo.'); return; }
  const perfis = await rest('profiles?select=id_hubspot&id=in.(' + ids.join(',') + ')&id_hubspot=not.is.null');
  const donos = (perfis || []).map((p) => String(p.id_hubspot));
  const desde = new Date(Date.now() - DIAS * 86400000).toISOString().slice(0, 10);

  const filtro = 'leads_prospeccao?select=id,cnpj,nome'
    + '&fonte=ilike.*Casa%20dos%20Dados*'
    + '&status=in.(pendente,atribuido,na_rota)'
    + '&cnpj=not.is.null'
    + '&data_abertura=gte.' + desde
    + '&responsavel_owner_id=in.(' + donos.join(',') + ')'
    // sem telefone E sem marca: telefone_normalizado preenchido com telefone vazio é marca ('sem:', 'dup:')
    + '&or=(telefone.is.null,telefone.eq.)&telefone_normalizado=is.null'
    + '&order=data_abertura.desc&limit=' + LIMITE;
  const leads = await rest(filtro);
  console.log((leads || []).length + ' recém-abertos sem telefone (até ' + DIAS + ' dias, executivo ativo, limite ' + LIMITE + ').');
  if (SO_CONTAR || !leads || !leads.length) return;

  let achou = 0, sem = 0, dup = 0, erro = 0;
  for (const l of leads) {
    const cnpj = String(l.cnpj).replace(/\D/g, '');
    if (cnpj.length !== 14) { erro++; continue; }
    try {
      const r = await fetch('https://api.casadosdados.com.br/v4/cnpj/' + cnpj, { headers: { 'api-key': CASA } });
      if (r.status === 403) { console.error('Casa dos Dados recusou (403): sem saldo? Parando aqui.'); break; }
      if (!r.ok) { erro++; console.log('  ' + l.nome + ': HTTP ' + r.status); await espera(400); continue; }
      const j = await r.json();
      const obj = (c) => (c && typeof c === 'object' && !Array.isArray(c)) ? c : null;
      const d = obj(j.cnpj) || obj(j.data) || obj(j.empresa) || j;
      const tel = escolher(acharTelefones(d));
      if (tel) {
        const so = tel.replace(/\D/g, '');
        try {
          await rest('leads_prospeccao?id=eq.' + l.id, { method: 'PATCH', body: JSON.stringify({ telefone: tel, telefone_normalizado: so }) });
        } catch (e) {
          if (!/ 409:/.test(String(e.message))) throw e;
          // o número já é de outro lead: marca e segue, sem gravar o repetido
          await rest('leads_prospeccao?id=eq.' + l.id, { method: 'PATCH', body: JSON.stringify({ telefone_normalizado: 'dup:' + cnpj }) });
          dup++; await espera(400); continue;
        }
        await rest('clients?lead_prospeccao_id=eq.' + l.id + '&or=(telefone.is.null,telefone.eq.)', { method: 'PATCH', body: JSON.stringify({ telefone: tel }) });
        achou++;
      } else {
        await rest('leads_prospeccao?id=eq.' + l.id, { method: 'PATCH', body: JSON.stringify({ telefone_normalizado: 'sem:' + cnpj }) });
        sem++;
      }
    } catch (e) {
      erro++; console.log('  ' + l.nome + ': ' + String(e.message || e).slice(0, 160));
    }
    await espera(400);
  }
  console.log('Com telefone: ' + achou + ' · sem telefone (ou de enfeite): ' + sem + ' · número de outro lead: ' + dup + ' · erro: ' + erro + ' · créditos usados: ~' + (achou + sem + dup) + '.');
})().catch((e) => { console.error(e); process.exit(1); });
