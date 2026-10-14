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

  /* 7. quem saiu do time não é dono também no APP, onde usuarios.json só traz ativos sem a marca */
  {
    const Module = require('module');
    const arqTerr = path.join(raiz, 'lib', 'territorios.js');
    const arqUsu = path.join(raiz, 'data', 'usuarios.json');
    const arqDesl = path.join(raiz, 'data', 'desligados.json');
    const desligados = USUARIOS.filter(u => u.desligado && u.ownerId);
    const resolver0 = Module._resolveFilename;
    const carregarComo = (usuarios, deslig) => {
      delete require.cache[arqTerr];
      const cacheUsu = require.cache[arqUsu];
      require.cache[arqUsu] = { id: arqUsu, filename: arqUsu, loaded: true, exports: usuarios };
      if (deslig) {
        Module._resolveFilename = function (pedido, pai) { return /desligados\.json$/.test(pedido) ? arqDesl : resolver0.apply(this, arguments); };
        require.cache[arqDesl] = { id: arqDesl, filename: arqDesl, loaded: true, exports: deslig };
      }
      try { return require(arqTerr); } finally {
        Module._resolveFilename = resolver0;
        delete require.cache[arqDesl];
        if (cacheUsu) require.cache[arqUsu] = cacheUsu; else delete require.cache[arqUsu];
        delete require.cache[arqTerr];
      }
    };
    // o APP: lista só de ativos, sem a marca, e os desativados à parte (preenchidos DEPOIS do carregamento)
    const ativos = [], deslApp = [];
    const tApp = carregarComo(ativos, deslApp);
    USUARIOS.filter(u => !u.desligado).forEach(u => ativos.push(Object.assign({}, u)));
    desligados.forEach(u => deslApp.push({ ownerId: u.ownerId }));
    const zApp = tApp.donoPorZonaEscrita('São Paulo', 'Vila Mariana (Zona Sul)');
    checar('território no APP: zona escrita de quem saiu fica sem dono (desligados.json)',
      desligados.some(u => String(u.ownerId) === '89842507') && !(zApp && zApp.owner === '89842507'), JSON.stringify(zApp));
    const pApp = tApp.donoPorProximidade('São Paulo', -23.6520, -46.7080);
    checar('território no APP: centro de zona de quem saiu não vale (desligados.json)', !!pApp && pApp.owner !== '89842507', JSON.stringify(pApp));
    // sem desligados.json e sem a marca (o pacote antigo), a regra antiga voltaria a dar o dono que saiu
    const tSem = carregarComo(USUARIOS.filter(u => !u.desligado), null);
    const zSem = tSem.donoPorZonaEscrita('São Paulo', 'Vila Mariana (Zona Sul)');
    checar('território: a medição acima mede algo (sem as duas fontes, quem saiu ainda seria dono)', !!zSem && zSem.owner === '89842507', JSON.stringify(zSem));
    // fora do APP: a marca em usuarios.json basta, como antes
    const tVercel = carregarComo(usuariosRaw, null);
    const zV = tVercel.donoPorZonaEscrita('São Paulo', 'Vila Mariana (Zona Sul)');
    checar('território fora do APP: a marca desligado continua bastando', !(zV && zV.owner === '89842507'), JSON.stringify(zV));
  }

  /* 8. gargalo escrito (14/10/26): o texto conta como o gargalo exigido em Conversa com decisor,
        vira nota no negócio e nunca vai para o campo de lista do HubSpot */
  {
    const rota = require(path.join(raiz, 'lib', 'acoes-negocio', 'mudar-etapa-negocio.js'));
    const gestor = USUARIOS.find(u => u.role === 'manager' && u.email);
    let patch = null, nota = null, assoc = false;
    global.fetch = async (url, o) => {
      const u = String(url);
      if (u.indexOf('/auth/v1/user') >= 0) return { ok: true, json: async () => ({ email: gestor.email }) };
      if (/\/crm\/v3\/objects\/deals\/D1(\?|$)/.test(u) && (!o || !o.method || o.method === 'GET')) {
        return { ok: true, json: async () => ({ id: 'D1', properties: { dealname: 'Teste', pipeline: '916011864', dealstage: '1396005401', hubspot_owner_id: '1', celular: '27999999999', nome_do_sistema: 'Saipos' } }) };
      }
      if (/\/crm\/v3\/objects\/deals\/D1$/.test(u) && o && o.method === 'PATCH') { patch = JSON.parse(o.body); return { ok: true, json: async () => ({ id: 'D1' }) }; }
      if (/\/crm\/v3\/objects\/notes$/.test(u)) { nota = JSON.parse(o.body); return { ok: true, json: async () => ({ id: 'N1' }) }; }
      if (u.indexOf('/associations/default/deals/D1') >= 0) { assoc = true; return { ok: true, json: async () => ({}) }; }
      return { ok: true, json: async () => ({ results: [] }) };
    };
    const corpo = (extra) => Object.assign({ dealId: 'D1', novaEtapa: '1395880470', propriedades: {} }, extra);
    const r1 = resFalso();
    await rota({ method: 'POST', headers: { authorization: 'Bearer x' }, body: corpo({}) }, r1);
    checar('gargalo escrito: sem gargalo nenhum, a Conversa com decisor continua recusada', r1.status_ === 400 && /gargalo_operacional/.test((r1.corpo || {}).erro || ''), JSON.stringify([r1.status_, r1.corpo]));
    const r2 = resFalso();
    await rota({ method: 'POST', headers: { authorization: 'Bearer x' }, body: corpo({ gargaloOutro: 'Cozinha não dá conta no almoço' }) }, r2);
    checar('gargalo escrito: o texto vale para avançar e o campo de lista não recebe o texto',
      r2.status_ === 200 && patch && patch.properties.dealstage === '1395880470' && !('gargalo_operacional' in patch.properties), JSON.stringify([r2.status_, r2.corpo && r2.corpo.erro, patch]));
    checar('gargalo escrito: vira nota associada ao negócio', !!nota && /Cozinha não dá conta no almoço/.test(nota.properties.hs_note_body) && assoc && r2.corpo && r2.corpo.notaGargalo && r2.corpo.notaGargalo.ok, JSON.stringify([nota, assoc]));
    const r3 = resFalso();
    await rota({ method: 'POST', headers: { authorization: 'Bearer x' }, body: corpo({ propriedades: { gargalo_operacional: 'Cozinha lenta' } }) }, r3);
    checar('gargalo escrito: texto livre DENTRO do campo de lista continua recusado', r3.status_ === 400 && /Valor inválido/.test((r3.corpo || {}).erro || ''), JSON.stringify([r3.status_, r3.corpo]));
  }

  global.fetch = fetch0;
  if (falhas.length) {
    console.log('FALHOU: ' + falhas.length);
    falhas.forEach(f => console.log('  ✗ ' + f));
    process.exit(1);
  }
  console.log('servidor (limpeza 14/10): ' + ok + ' verificações · tudo certo.');
})().catch(e => { console.log('FALHOU: ' + e.stack); process.exit(1); });
