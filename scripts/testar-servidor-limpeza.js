#!/usr/bin/env node
/* ============================================================================
   A LIMPEZA DO SERVIDOR DO COCKPIT (14/10/26)

   Auditoria do backend: as rotas rodam no APP Outbound (Edge cockpit-api), copiadas
   deste repositório. Esta suíte roda as rotas DE VERDADE, com um Supabase e um HubSpot
   de mentira, e confere as cinco correções:
     1. buscar-leads valida o gestor por data/usuarios.json — sem o snapshot do CRM (que
        não existe no servidor) ela respondia "Não foi possível validar a sessão" a todos;
     2. importar-leads tira os nomes do CRM do cockpit_snapshot quando a montagem local
        falha (antes ficava vazio: nenhuma conta saía marcada como já no HubSpot);
     3. criar-empresa-prospeccao não cria às cegas quando a busca de duplicada falha;
     4. restaurantes-proximos e novidades-mercado não liberam qualquer login quando a
        lista de usuários está vazia;
     5. o próximo passo manda o sinal 'tarefa' e põe a visita no Planejamento (os dois
        blocos viviam só no pacote do APP, editados à mão; regenerar os apagaria).

   Uso: node scripts/testar-servidor-limpeza.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');

let ok = 0;
const falhas = [];
function checar(nome, cond, porque) { if (cond) { ok += 1; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); }

function resFalso() {
  const r = { status_: 200, corpo: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (s) => { r.status_ = s; return r; };
  r.json = (c) => { r.corpo = c; return r; };
  r.end = () => r;
  return r;
}
const usuariosRaw = require(path.join(raiz, 'data', 'usuarios.json'));
const USUARIOS = Array.isArray(usuariosRaw) ? usuariosRaw : (usuariosRaw.usuarios || []);
const gestor = USUARIOS.find(u => u.role === 'manager' && u.email);

(async function () {
  const fetch0 = global.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://supa.teste', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_KEY: 'svc', HUBSPOT_TOKEN: 'hs', CASADOSDADOS_TOKEN: 'cd', IMPORT_SECRET: 'seg' });

  /* 1. buscar-leads: passa da sessão sem tocar no snapshot e chega na validação da praça */
  {
    const fonte = fs.readFileSync(path.join(raiz, 'api', 'buscar-leads.js'), 'utf8');
    global.fetch = async (url) => {
      if (String(url).indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: gestor.email }) };
      throw new Error('chamada inesperada: ' + url);
    };
    const rota = require(path.join(raiz, 'api', 'buscar-leads.js'));
    const res = resFalso();
    await rota({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { municipio: 'Cidade Que Não Existe', quantidade: 25 } }, res);
    checar('buscar-leads: o gestor passa da sessão e chega na validação da praça (antes: 401 para todo mundo)',
      res.status_ === 400 && /Praça desconhecida/.test((res.corpo || {}).erro || ''), JSON.stringify([res.status_, res.corpo && res.corpo.erro]));
    checar('buscar-leads: não depende mais de montarDadosCompletos (o snapshot não existe no servidor)', fonte.indexOf("require('../scripts/montar-dados.js')") < 0 && fonte.indexOf('montarDadosCompletos().usuarios') < 0);
    checar('buscar-leads: lote que falhou chega na tela com o motivo', /a importação falhou: ' \+ r\.erro/.test(fonte));
  }

  /* 2. importar-leads: nomes do CRM pelo snapshot, com cache e sem quebrar se o banco falhar */
  {
    const m = require(path.join(raiz, 'api', 'importar-leads.js'));
    let chamadas = 0, urlPedida = '';
    global.fetch = async (url) => {
      chamadas++; urlPedida = String(url);
      return { ok: true, json: async () => ([{ f: { '123': [{ name: 'Bar Do Zé ' }, { name: 'Pizzaria X' }], '456': [] }, t: { quentes: [{ name: 'Quente Y' }], frios: [{ name: 'Frio Z' }] } }]) };
    };
    const nomes = await m.nomesDoCrmPeloSnapshot('https://supa.teste', 'svc');
    checar('importar-leads: lê os nomes do funil e da temperatura no cockpit_snapshot (só as duas partes)',
      nomes.has('bar do zé') && nomes.has('pizzaria x') && nomes.has('quente y') && nomes.has('frio z') && nomes.size === 4
        && /chave=eq\.hubspot/.test(urlPedida) && /select=f:conteudo->funilLeads,t:conteudo->temperatura/.test(urlPedida), JSON.stringify([...nomes]) + ' ' + urlPedida);
    await m.nomesDoCrmPeloSnapshot('https://supa.teste', 'svc');
    checar('importar-leads: o segundo lote usa o cache (os robôs mandam lotes de 80)', chamadas === 1, String(chamadas));
    const fonte = fs.readFileSync(path.join(raiz, 'api', 'importar-leads.js'), 'utf8');
    checar('importar-leads: a montagem local vazia cai no snapshot', /if \(!nomesNoHubspot\.size\) nomesNoHubspot = await nomesDoCrmPeloSnapshot\(supaUrl, supaService\);/.test(fonte));
  }

  /* 3. criar-empresa-prospeccao: busca de duplicada que falha não cria empresa */
  {
    const rota = require(path.join(raiz, 'api', 'criar-empresa-prospeccao.js'));
    const dono = USUARIOS.find(u => u.ownerId && u.email);
    let criou = false;
    const cenario = (buscaFalha) => async (url, o) => {
      const u = String(url);
      if (u.indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: dono.email }) };
      if (u.indexOf('/rest/v1/leads_prospeccao') >= 0 && (!o || !o.method || o.method === 'GET')) return { ok: true, json: async () => ([{ id: 'L1', nome: 'Restaurante Teste', cidade: 'Rio de Janeiro', status: 'atribuido', responsavel_owner_id: dono.ownerId, fonte: 'casa_dos_dados', created_at: '2026-10-10T12:00:00Z' }]) };
      if (u.indexOf('/companies/search') >= 0) { if (buscaFalha === 'rede') throw new Error('rede caiu'); return { ok: false, status: 429, json: async () => ({ message: 'rate limit' }) }; }
      if (/\/crm\/v3\/objects\/companies$/.test(u)) { criou = true; return { ok: true, json: async () => ({ id: '999' }) }; }
      return { ok: true, json: async () => ({}) };
    };
    for (const modo of ['rede', 'http']) {
      criou = false;
      global.fetch = cenario(modo);
      const res = resFalso();
      await rota({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { leadId: 'L1' } }, res);
      checar('criar-empresa: com a busca de duplicada falhando (' + modo + '), não cria a empresa e devolve 502', res.status_ === 502 && !criou, JSON.stringify([res.status_, res.corpo, criou]));
    }
  }

  /* 4. lista de usuários vazia não libera ninguém */
  for (const arq of ['restaurantes-proximos.js', 'novidades-mercado.js']) {
    const fonte = fs.readFileSync(path.join(raiz, 'api', arq), 'utf8');
    checar(arq + ': fail-closed com a lista de usuários vazia', fonte.indexOf('USUARIOS.length && !USUARIOS.some') < 0 && fonte.indexOf('if (!USUARIOS.some(u => String(u.email).toLowerCase() === emailLogado))') > 0);
  }

  /* 5. o próximo passo avisa o app e entra no Planejamento */
  {
    const fonte = fs.readFileSync(path.join(raiz, 'lib', 'acoes-negocio', 'criar-nota-negocio.js'), 'utf8');
    const i = fonte.indexOf('async function tratarProximoPasso'), j = fonte.indexOf('\nasync function ', i + 10);
    const corpo = fonte.slice(i, j > 0 ? j : undefined);
    checar('próximo passo: manda o sinal tarefa (sinais_ao_vivo) e põe visita/reunião na grade (plano_poe_slot)',
      i > 0 && corpo.indexOf("'/rest/v1/sinais_ao_vivo'") > 0 && corpo.indexOf("JSON.stringify({ tipo: 'tarefa'") > 0 && corpo.indexOf("'/rest/v1/rpc/plano_poe_slot'") > 0 && corpo.indexOf("p_origem: 'passo'") > 0);
  }

  /* 6. Atualizar HubSpot: gestor do cockpit também */
  {
    const fonte = fs.readFileSync(path.join(raiz, 'lib', 'atualizar-hubspot.js'), 'utf8');
    checar('Atualizar HubSpot: a regra é eh_gestor_cockpit', fonte.indexOf('/rest/v1/rpc/eh_gestor_cockpit') > 0 && fonte.indexOf('/rest/v1/rpc/is_field_admin') < 0);
  }

  global.fetch = fetch0;
  if (falhas.length) {
    console.log('FALHOU: ' + falhas.length);
    falhas.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('servidor (limpeza 14/10): ' + ok + ' verificações · tudo certo.');
})().catch(e => { console.log('FALHOU: ' + e.stack); process.exit(1); });
