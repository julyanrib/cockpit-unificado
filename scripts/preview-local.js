// scripts/preview-local.js
// Gera um HTML LOCAL do cockpit já logado, para revisão visual durante o desenvolvimento.
//
// POR QUE ISSO EXISTE: o public/index.html publicado é um shell vazio — os dados só
// chegam depois do login, via api/dados.js, que precisa de sessão do Supabase e das env
// vars da Vercel. Resultado prático: não havia nenhuma forma de OLHAR a tela do
// executivo com dado real sem entrar em produção. Toda revisão visual acontecia em cima
// do ambiente de verdade, com o risco óbvio de clicar em algo que escreve no HubSpot.
//
// O que ele faz: injeta o DATA completo (montado por scripts/montar-dados.js e filtrado
// pelo papel pedido, exatamente como o servidor faria), desliga o shell protegido e
// anexa um bootstrap que define a sessão e chama mostrarApp() — sem Supabase, sem rede.
//
// SEGURANÇA: o arquivo gerado CONTÉM DADOS REAIS DO CRM. Ele nunca é escrito dentro do
// repositório: o destino padrão é a pasta temporária do sistema, e `preview/` está no
// .gitignore como cinto de segurança caso alguém passe um caminho local. As chaves de
// Supabase e MapTiler são zeradas de propósito — o preview é offline e não deve nem
// poder falar com serviço nenhum.
//
// Uso:
//   node scripts/preview-local.js                      # executivo (1º rep do time)
//   node scripts/preview-local.js gestor               # visão do gestor
//   node scripts/preview-local.js <email@takeat.app>   # um executivo específico
//   node scripts/preview-local.js rep C:\saida\a.html  # destino customizado

const fs = require('fs');
const os = require('os');
const path = require('path');
const { montarDadosCompletos, filtrarParaPapel, USUARIOS } = require('./montar-dados.js');

const root = path.join(__dirname, '..');
const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const posicionais = process.argv.slice(2).filter(a => !a.startsWith('--'));
const arg = (posicionais[0] || 'rep').trim();
const destinoArg = posicionais[1];
// --sem-supa: não injeta o cliente Supabase falso. Serve pra isolar problema: se a
// tela quebra com o stub e funciona sem, o problema é o stub, não o template.
const comSupaFake = !flags.includes('--sem-supa');
// --manual: prepara sessão e supa mas NÃO chama mostrarApp(). Serve pra encontrar
// travamento no caminho de carga: com isto a página abre inerte e dá pra chamar cada
// pedaço à mão (aplicarVisaoPorPapel, renderDaily, ...) e ver qual pendura.
const manual = flags.includes('--manual');

const completos = montarDadosCompletos();

// Escolha do usuário a simular.
let usuario;
if (arg.includes('@')) {
  usuario = USUARIOS.find(u => String(u.email).toLowerCase() === arg.toLowerCase());
  if (!usuario) {
    console.error(`E-mail "${arg}" não está em data/usuarios.json.`);
    process.exit(1);
  }
} else if (arg === 'gestor' || arg === 'manager') {
  usuario = USUARIOS.find(u => u.role === 'manager');
  if (!usuario) { console.error('Nenhum usuário com role "manager" em data/usuarios.json.'); process.exit(1); }
} else {
  // Primeiro executivo que tem funil de verdade — simular quem está em onboarding
  // (sem ownerId real) mostraria a tela de boas-vindas, não o Hoje.
  usuario = USUARIOS.find(u => u.role !== 'manager' && !u.aComecar &&
    completos.reps.some(r => String(r.ownerId) === String(u.ownerId)));
  if (!usuario) { console.error('Nenhum executivo com funil encontrado.'); process.exit(1); }
}

const dados = filtrarParaPapel(completos, usuario);

// Shell desligado: o template cai no "modo antigo" (dados embutidos) e não tenta
// buscar /api/dados. Supabase/MapTiler zerados: preview é offline.
const DATA_PREVIEW = Object.assign({}, dados, {
  shellProtegido: false,
  supabase: null,
  maptiler: null
});

/* PROPOSTAS E PLAYBOOK NO PREVIEW (28/08/26).

   Essas duas abas abriam com "Sessão não encontrada. Entre novamente." e 122px de
   altura, em TODA revisão offline — descobri isso auditando as telas: as duas
   passam por tokenDeSessaoGlobal() e depois buscam /api/dados?recurso=..., e no
   preview não existe nem sessão do Supabase nem rota de API. Ou seja: as duas abas
   eram invisíveis pra revisão, o que é justamente o tipo de canto onde defeito
   sobrevive (foi assim que 122px de "tela vazia" passaram por várias passadas).

   A correção não mexe no produto: o preview pré-popula os caches que os dois
   carregadores consultam ANTES de pedir token (precificacaoCache e playbookCache),
   lendo os MESMOS arquivos que api/dados.js serve em produção. Se a fonte mudar de
   forma, o preview quebra junto — que é o comportamento desejado.

   O playbook compilado é grande; ele já é o mesmo conteúdo que o arquivo gerado
   carrega, e o aviso de "contém dados reais, não versione" continua valendo. */
const PLAYBOOK_PREVIEW = require(path.join(root, 'data', 'field-sales-playbook.compiled.json'));
const PRECIFICACAO_PREVIEW = require(path.join(root, 'data', 'precificacao.json'));

const template = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');

// </script> dentro do JSON fecharia o <script id="cockpit-data"> antes da hora.
const json = JSON.stringify(DATA_PREVIEW).replace(/<\/script>/gi, '<\\/script>');

const bootstrap = `
<script>
/* PREVIEW LOCAL — este bloco NÃO existe no template nem no arquivo publicado.
   Ele só entra aqui, no arquivo gerado por scripts/preview-local.js, para pular o
   gate de login numa revisão visual offline. Funções e bindings de topo de um script
   clássico ficam no escopo global, então dá pra atribuir sessaoAtual e chamar
   mostrarApp() de fora do bloco principal. */
(function () {
  var sessao = ${JSON.stringify({
    email: usuario.email,
    role: usuario.role === 'manager' ? 'manager' : 'rep',
    ownerId: usuario.ownerId,
    nome: usuario.nome || usuario.name || usuario.email,
    aComecar: !!usuario.aComecar
  })};
  /* Cliente Supabase FALSO. Sem ele, metade das telas do executivo (Daily/Briefing,
     Planejamento, PDI) sai pelo caminho "if (!DATA.supabase || !supa) return" e a
     revisão visual mostra "Nenhuma daily registrada hoje ainda" em vez da tela.
     O stub é encadeável e resolve sempre {data: [], error: null} — ou seja, o preview
     mostra a tela com as fontes do Supabase VAZIAS. É a leitura pessimista de
     propósito: se a tela aguenta o vazio, aguenta o cheio. E não fala com rede
     nenhuma, então não existe risco de gravar em nada.

     Implementado com uma lista EXPLÍCITA de métodos, não com Proxy: a primeira versão
     usava Proxy e devolvia função pra qualquer propriedade, então acessos como
     .length ou Symbol.iterator viravam funções truthy e travavam o renderizador numa
     das telas do gestor (travou de verdade, na revisão de 27/08). Lista explícita
     falha alto (TypeError no console) em vez de travar em silêncio. */
  function supaFake() {
    var res = { data: [], error: null, count: 0 };
    var METODOS = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte',
      'lt', 'lte', 'like', 'ilike', 'is', 'in', 'not', 'or', 'filter', 'order', 'limit',
      'range', 'single', 'maybeSingle', 'match', 'contains', 'overlaps', 'returns', 'abortSignal'];
    function query() {
      var q = {};
      METODOS.forEach(function (m) { q[m] = function () { return q; }; });
      q.then = function (ok, err) { return Promise.resolve(res).then(ok, err); };
      q.catch = function (fn) { return Promise.resolve(res).catch(fn); };
      q.finally = function (fn) { return Promise.resolve(res).finally(fn); };
      return q;
    }
    return {
      from: function () { return query(); },
      rpc: function () { return query(); },
      storage: { from: function () { return { list: function () { return Promise.resolve(res); }, upload: function () { return Promise.resolve(res); }, createSignedUrl: function () { return Promise.resolve(res); } }; } },
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: null }, error: null }); },
        getUser: function () { return Promise.resolve({ data: { user: null }, error: null }); },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
        signOut: function () { return Promise.resolve({ error: null }); }
      }
    };
  }

  try {
    sessaoAtual = sessao;
    if (${comSupaFake ? 'true' : 'false'}) {
      DATA.supabase = { url: 'preview-local', anonKey: 'preview-local' };
      supa = supaFake();
    }
    /* Antes do mostrarApp(): os carregadores de Propostas e Playbook consultam o
       cache na primeira linha e só pedem token se ele estiver vazio. Preenchendo-o
       aqui, as duas abas montam sem rede e sem sessão. Ver a nota longa em
       PLAYBOOK_PREVIEW, no topo deste arquivo. */
    try {
      playbookCache = ${JSON.stringify(PLAYBOOK_PREVIEW).replace(/<\/script>/gi, '<\\/script>')};
      precificacaoCache = ${JSON.stringify(PRECIFICACAO_PREVIEW).replace(/<\/script>/gi, '<\\/script>')};
    } catch (e) { console.warn('[preview] nao consegui pre-popular playbook/precificacao:', e); }
    if (!${manual ? 'true' : 'false'}) mostrarApp();
    else { window.__PREVIEW_MANUAL__ = true; console.log('[preview] modo manual: sessão e supa prontos, mostrarApp() NÃO chamado'); }
    var aviso = document.createElement('div');
    aviso.textContent = 'PREVIEW LOCAL · ' + sessao.nome + ' (' + sessao.role + ') · dados reais, sem gravação';
    aviso.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1A1613;color:#E0A64A;font:700 11px/1 system-ui;padding:7px 12px;text-align:center;letter-spacing:.06em;';
    document.body.appendChild(aviso);
  } catch (e) {
    document.body.innerHTML = '<pre style="padding:24px;color:#E51A31;white-space:pre-wrap;">Preview falhou ao montar: ' + (e && e.stack || e) + '</pre>';
  }
})();
</script>
`;

let out = template.replace('{{DATA_JSON}}', json);
out = out.replace(/<\/body>/i, bootstrap + '</body>');

const destino = destinoArg || path.join(os.tmpdir(), `cockpit-preview-${usuario.role === 'manager' ? 'gestor' : 'exec'}.html`);
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, out);

console.log(`Preview gerado: ${destino}`);
console.log(`Sessão simulada: ${usuario.nome || usuario.email} · papel ${usuario.role === 'manager' ? 'manager' : 'rep'} · ownerId ${usuario.ownerId}`);
console.log('ATENÇÃO: o arquivo contém dados reais do CRM. Não versione, não compartilhe.');
