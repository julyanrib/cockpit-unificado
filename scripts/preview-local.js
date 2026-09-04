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

/* ══ --contas=<arquivo>: A FILA DE CANDIDATOS NO PREVIEW (03/09/26) ═══════════════════
   A aba Planejamento monta a lista de contas-alvo a partir de `prospeccaoCache`, que sai
   da tabela leads_prospeccao no Supabase. O supa falso do preview devolve `{data:[]}`,
   entao a fila chegava VAZIA — e a secao "Candidatos perto de voce", que e o corpo da aba,
   nao existia para revisao. Foi assim que o Julyan viu na tela dele 172 candidatos e eu vi
   zero, achando que a aba estava quebrada.

   O caminho e o mesmo que playbookCache e precificacaoCache ja usam: pre-popular o cache
   que o carregador consulta. A diferenca e que o instantaneo NAO fica no repositorio — sao
   contas reais de CRM, e um arquivo dentro do repo seria pego por um `git add -A` sem
   ninguem notar. Por isso vem por caminho explicito, de fora:

     node scripts/preview-local.js marco.takeat@gmail.com saida.html --contas=C:/tmp/leads.json

   Sem a flag, o preview segue como era: fila vazia, e o aviso abaixo diz isso na tela em
   vez de deixar a secao parecer defeito. */
const flagContas = flags.find(f => f.startsWith('--contas='));
let CONTAS_PREVIEW = null;
if (flagContas) {
  const caminho = flagContas.slice('--contas='.length);
  if (!fs.existsSync(caminho)) {
    console.error(`--contas: arquivo não encontrado em ${caminho}`);
    process.exit(1);
  }
  CONTAS_PREVIEW = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  if (!Array.isArray(CONTAS_PREVIEW)) {
    console.error('--contas: o arquivo tem que ser um array de linhas de leads_prospeccao.');
    process.exit(1);
  }
}

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
  /* ══ O STUB RESPONDE POR TABELA (03/09/26) ═════════════════════════════════════════
     Antes ele devolvia data vazio para tudo. Eu tentei consertar a fila de candidatos
     pre-populando prospeccaoCache antes do mostrarApp() e nao funcionou: carregarProspeccao()
     roda no boot, chama supa.from('leads_prospeccao'), recebe o array vazio e SOBRESCREVE o
     cache. Pre-popular cache que um carregador reescreve e enxugar gelo.

     Responder por tabela e melhor por um motivo alem de funcionar: o carregador percorre o
     caminho REAL dele — o .eq('responsavel_owner_id', ...), o sort de
     prospeccaoCompararOrdem, o badge da praca. Se essa cadeia quebrar, o preview quebra
     junto, que e o comportamento que se quer de um ambiente de revisao.

     NOTA: este comentario vive DENTRO de um template literal (o bootstrap). Nada de
     backtick aqui — a primeira versao tinha um par deles em volta de "data vazio" e fechou
     a string, derrubando o script inteiro com "Unexpected token". Terceira vez que esta
     armadilha aparece neste projeto. */
  var TABELAS_FALSAS = ${CONTAS_PREVIEW ? JSON.stringify({ leads_prospeccao: CONTAS_PREVIEW }).replace(/<\/script>/gi, '<\\/script>') : '{}'};

  function supaFake() {
    var vazio = { data: [], error: null, count: 0 };
    var METODOS = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte',
      'lt', 'lte', 'like', 'ilike', 'is', 'in', 'not', 'or', 'filter', 'order', 'limit',
      'range', 'single', 'maybeSingle', 'match', 'contains', 'overlaps', 'returns', 'abortSignal'];
    function query(tabela) {
      var q = {};
      var linhas = (TABELAS_FALSAS[tabela] || []).slice();
      /* eq e o unico filtro que importa aqui: o carregador do rep faz
         .eq('responsavel_owner_id', ownerId), e devolver a base inteira mostraria contas de
         outro executivo na tela dele — falso positivo pior que fila vazia. */
      q.eq = function (col, val) {
        linhas = linhas.filter(function (l) { return String(l[col]) === String(val); });
        return q;
      };
      /* ══ ESCRITA ECOA O QUE RECEBEU (03/09/26) ═══════════════════════════════════
         O stub devolvia data vazio tambem para upsert/insert/update. Isso e correto como
         "nao gravei", mas torna INTESTAVEL no preview qualquer tela que confirme a
         gravacao lendo a linha de volta — e confirmar assim e a regra deste projeto,
         porque um erro nulo sem linha de volta ja fez a tela dizer "registrado" sobre tabela
         vazia (o painel de acao da Daily, 03/09).

         Ecoar o payload deixa o caminho completo exercitavel offline: a tela recebe a
         linha, atualiza o estado e redesenha, exatamente como em producao. E continua
         sendo preview: nada sai do navegador, e o aviso no pe da tela diz "sem gravacao".

         O eco NAO inventa id nem timestamp de servidor: devolve o que foi enviado. Se a
         tela depender de algo que so o Postgres gera, ela quebra aqui — o que e o
         comportamento desejado num ambiente de revisao. */
      var ecoar = function (payload) {
        var linhas = Array.isArray(payload) ? payload : [payload];
        return { data: linhas, error: null, count: linhas.length };
      };
      ['upsert', 'insert', 'update'].forEach(function (m) {
        q[m] = function (payload) { q.__eco = ecoar(payload); return q; };
      });
      METODOS.forEach(function (m) {
        if (m === 'eq' || m === 'upsert' || m === 'insert' || m === 'update') return;
        q[m] = function () { return q; };
      });
      var resolver = function () {
        /* escrita ecoada tem prioridade: o .select() depois de um upsert tem que
           devolver a linha gravada, e nao o conteudo da tabela falsa. */
        if (q.__eco) return Promise.resolve(q.__eco);
        return Promise.resolve(linhas.length
          ? { data: linhas, error: null, count: linhas.length }
          : vazio);
      };
      q.then = function (ok, err) { return resolver().then(ok, err); };
      q.catch = function (fn) { return resolver().catch(fn); };
      q.finally = function (fn) { return resolver().finally(fn); };
      return q;
    }
    var res = vazio;
    return {
      from: function (tabela) { return query(tabela); },
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
    /* A IDADE DO DADO É DO DISCO, E O PREVIEW TEM DE DIZER ISSO (04/09/26).
       A faixa vermelha do template diz "a atualização das 5h falhou" — texto que só faz
       sentido em produção, onde o dado vem do Supabase. No preview, o que está velho é
       data/hubspot.json na máquina de quem desenvolve, e essa frase fez o Julyan achar
       que o robô do CRM estava quebrado num dia em que ele rodou nove vezes com sucesso.
       Aqui a faixa é reescrita para dizer de quem é a velhice e como resolver. */
    var idadeH = null;
    try {
      var tsP = DATA.hubspotUpdatedAtISO ? new Date(DATA.hubspotUpdatedAtISO) : null;
      if (tsP && !isNaN(tsP.getTime())) idadeH = (Date.now() - tsP.getTime()) / 3600000;
    } catch (e) {}
    var faixa = document.getElementById('avisoSyncVelho');
    if (faixa) {
      faixa.textContent = '⚠ PREVIEW LOCAL: este data/hubspot.json tem '
        + Math.floor(idadeH) + 'h — é o disco desta máquina, NÃO a produção.'
        + ' A produção lê o Supabase (cockpit_snapshot). Rode o fetch local para atualizar.';
    }
    var aviso = document.createElement('div');
    aviso.textContent = 'PREVIEW LOCAL · ' + sessao.nome + ' (' + sessao.role + ') · dados reais, sem gravação'
      + (idadeH != null ? ' · dado do disco: ' + (idadeH < 1 ? 'menos de 1h' : Math.floor(idadeH) + 'h') : '');
    aviso.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#1A1613;color:#E0A64A;font:700 11px/1 system-ui;padding:7px 12px;text-align:center;letter-spacing:.06em;';
    document.body.appendChild(aviso);
  } catch (e) {
    document.body.innerHTML = '<pre style="padding:24px;color:#E51A31;white-space:pre-wrap;">Preview falhou ao montar: ' + (e && e.stack || e) + '</pre>';
  }
})();
</script>
`;

/* ══ --auditar-cliques: A PROVA DE QUE NENHUM CLIQUE E MORTO (03/09/26) ═══════════════
   Julyan: "quero que tudo que seja clicável tenha endereço firmado... não pode ter nenhum
   click morto".

   Ate aqui eu provava isso por INFERENCIA: o botao tem id, ou tem data-*, logo alguem
   deve escutar. E inferencia erra nas duas direcoes — um id sem listener passa, e um botao
   sem atributo nenhum que e pego por delegacao no ancestral reprova sem motivo.

   Esta flag troca inferencia por MEDICAO. Ela injeta um recorder ANTES do script do app,
   embrulhando addEventListener: todo elemento (e todo seletor de delegacao) que registra
   um listener de clique entra num Set. Depois do render, cada clicavel e testado contra
   ele — ou o proprio elemento tem listener, ou um ancestral tem. Nao sobra opiniao.

   So entra com a flag: em revisao normal o produto tem que rodar sem instrumentacao. */
const RECORDER = `
<script>
/* PREVIEW LOCAL · auditoria de cliques. Nao existe no template nem no arquivo publicado. */
(function () {
  var comListener = new WeakSet();
  var total = 0;
  var orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (tipo) {
    if (tipo === 'click' || tipo === 'pointerdown' || tipo === 'mousedown' || tipo === 'change') {
      try { comListener.add(this); total++; } catch (e) { /* window/document nao entram no WeakSet */ }
    }
    return orig.apply(this, arguments);
  };
  window.__AUDIT_CLIQUES__ = {
    tem: function (el) { return comListener.has(el); },
    /* um clicavel esta enderecado se ele, ou qualquer ancestral ate o body, escuta clique */
    enderecado: function (el) {
      var n = el;
      while (n && n !== document.body) { if (comListener.has(n)) return true; n = n.parentElement; }
      return comListener.has(document.body) || comListener.has(document) || comListener.has(window);
    },
    totalRegistrado: function () { return total; }
  };
})();
</script>
`;

let out = template.replace('{{DATA_JSON}}', json);
if (flags.includes('--auditar-cliques')) {
  /* antes de TUDO: listeners registrados no topo do script do app tambem tem que ser vistos */
  out = out.replace(/<head([^>]*)>/i, '<head$1>' + RECORDER);
}
out = out.replace(/<\/body>/i, bootstrap + '</body>');

const destino = destinoArg || path.join(os.tmpdir(), `cockpit-preview-${usuario.role === 'manager' ? 'gestor' : 'exec'}.html`);
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, out);

console.log(`Preview gerado: ${destino}`);
console.log(`Sessão simulada: ${usuario.nome || usuario.email} · papel ${usuario.role === 'manager' ? 'manager' : 'rep'} · ownerId ${usuario.ownerId}`);
console.log('ATENÇÃO: o arquivo contém dados reais do CRM. Não versione, não compartilhe.');
/* A IDADE NO TERMINAL, antes de eu abrir a tela: foi olhando um preview de 38h que eu
   deixei passar uma faixa vermelha acusando a produção de estar quebrada. */
try {
  const isoDisco = (typeof dados !== 'undefined' && dados) ? dados.hubspotUpdatedAtISO : null;
  const tsDisco = isoDisco ? new Date(isoDisco) : null;
  if (tsDisco && !isNaN(tsDisco.getTime())) {
    const h = (Date.now() - tsDisco.getTime()) / 3600000;
    if (h > 26) {
      console.log('AVISO: data/hubspot.json deste disco tem ' + Math.floor(h) + 'h. O preview vai',
        'mostrar números velhos — e isso NÃO diz nada sobre a produção, que lê o Supabase.');
    } else {
      console.log('data/hubspot.json deste disco: ' + (h < 1 ? 'menos de 1h' : Math.floor(h) + 'h') + '.');
    }
  } else {
    console.log('AVISO: não achei updatedAt em data/hubspot.json — a idade do dado do preview é desconhecida.');
  }
} catch (e) { console.log('AVISO: não consegui medir a idade de data/hubspot.json:', e && e.message); }
