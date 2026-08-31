// scripts/testar-acoes-pwa.js
//
// AÇÃO DE CAMPO VAI PARA O APP — a prova de que a ponte liga e desliga direito.
//
// Contexto (31/08/26): decidido na reunião com o RPA que o Cockpit vira a aba de GESTÃO
// dentro do app de campo, e o mapa é a aba operacional. Ligar, mandar WhatsApp e navegar
// passam a entrar no app, que é quem registra o que aconteceu depois.
//
// O que precisa ficar provado, na ordem de gravidade:
//   1. DESLIGADO NÃO MEXE EM NADA. Sem PWA_DEEP_LINK, tel: liga, wa.me abre, Maps navega.
//      Se este teste quebrar, a tela de hoje quebrou por causa de um app que ainda não existe.
//   2. só http(s) absoluto vira destino — `javascript:` ou link relativo aqui seriam,
//      respectivamente, execução de código e navegação para dentro do próprio Cockpit.
//   3. o link leva o que o app precisa para registrar sozinho: tipo, telefone só com
//      dígitos, negócio, cliente, coordenada e quem clicou.
//   4. o interceptador pega o clique na CAPTURA e cancela o destino antigo — vários desses
//      links vivem dentro de cartões que dão stopPropagation.
//
// Roda sem rede e sem navegador: recorta o bloco do template e avalia num vm com DOM falso.
//
//   node scripts/testar-acoes-pwa.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');

const INI = '/* ══ AÇÃO DE CAMPO VAI PARA O APP';
const FIM = '/* ══ FILA PENDENTE DO APP DE CAMPO';
const a = html.indexOf(INI), b = html.indexOf(FIM);
if (a < 0 || b < 0 || b < a) {
  console.error('FALHA: não achei o bloco de ação de campo no template.');
  process.exit(1);
}
const codigo = html.slice(a, b);

let falhas = 0;
const checar = (nome, cond, detalhe) => {
  console.log((cond ? '  ok  ' : 'FALHA ') + nome + (detalhe ? ' · ' + detalhe : ''));
  if (!cond) falhas++;
};

/* DOM falso: só o que este bloco usa. Nada de jsdom — o contrato aqui é pequeno e
   explícito, e um DOM inteiro esconderia o que está sendo testado. */
function elemento(attrs, pai) {
  const el = {
    _attrs: Object.assign({}, attrs),
    dataset: {},
    parentElement: pai || null,
    getAttribute(k) { return this._attrs[k] != null ? this._attrs[k] : null; },
    setAttribute(k, v) { this._attrs[k] = v; },
    closest(sel) {
      /* só o suficiente: os seletores usados são `a[href]` e listas de [data-*].
         (1ª versão deste stub caía sempre em null porque strip de colchetes deixava
         'a[href' — o teste acusou "não interceptou" quando o navegador interceptava.) */
      const chaves = String(sel).split(',').map(s => s.trim());
      for (let n = this; n; n = n.parentElement) {
        const casou = chaves.some(k => {
          if (/href/.test(k)) return n._attrs.href != null;
          const attr = k.replace(/^\[|\]$/g, '');
          return n._attrs[attr] != null;
        });
        if (casou) return n;
      }
      return null;
    },
    querySelectorAll() { return []; }
  };
  return el;
}

function contexto(deepLink, ownerId) {
  const abertos = [];
  const ouvintes = [];
  const ctx = {
    DATA: deepLink === undefined ? {} : { pwa: { deepLink } },
    sessaoAtual: { ownerId: ownerId || null, role: 'rep' },
    URLSearchParams,
    console,
    document: {
      addEventListener: (tipo, fn, opts) => ouvintes.push({ tipo, fn, opts }),
      querySelectorAll: () => []
    },
    /* devolve uma janela "aberta" — o código trata null como bloqueio de popup e cai para
       navegação na própria aba, que é outro caso, testado à parte no fim do arquivo. */
    window: { open: (u) => { abertos.push(u); return { fechada: false }; }, location: { href: '' } },
    MutationObserver: function () { this.observe = () => {}; },
    setTimeout, clearTimeout
  };
  ctx.window.open = ctx.window.open.bind(ctx.window);
  vm.createContext(ctx);
  vm.runInContext(codigo, ctx);
  return { ctx, abertos, ouvintes };
}

console.log('\n== ação de campo: a ponte com o app de campo ==\n');

/* 1 · desligado não mexe em nada */
{
  const { ctx } = contexto(undefined);
  checar('sem app configurado, a ponte fica desligada', ctx.pwaAcoesAtivo() === false);
  checar('e não produz link nenhum', ctx.pwaLinkDeAcao('ligar', { telefone: '5551999887766' }) === '');

  const { ctx: c2, abertos } = contexto(undefined);
  c2.pwaLigarInterceptadorDeAcoes();
  const r = c2.abrirNavegacaoDeCampo(-30.02, -51.21, 'Bar do Zé', '99');
  checar('navegação desligada cai no Maps, como sempre foi',
    r === true && /google\.com\/maps\/dir/.test(abertos[0]) && /destination=-30.02,-51.21/.test(abertos[0]),
    abertos[0]);
}

/* 2 · só http(s) absoluto */
{
  ['javascript:alert(1)', 'data:text/html,x', '/acao', 'app://acao', '', '   '].forEach(mau => {
    const { ctx } = contexto(mau);
    checar('recusa base inválida: ' + JSON.stringify(mau), ctx.pwaAcoesAtivo() === false);
  });
  const { ctx } = contexto('https://app.takeat.exemplo/acao');
  checar('aceita https absoluto', ctx.pwaAcoesAtivo() === true);
}

/* 3 · o link leva o que o app precisa */
{
  const { ctx } = contexto('https://app.takeat.exemplo/acao', '86100506');
  const u = new URL(ctx.pwaLinkDeAcao('ligar', {
    telefone: '+55 (51) 99988-7766', dealId: '12345', cliente: 'Don Aguilar', lat: -30.1, lng: -51.2
  }));
  checar('tipo da ação vai no link', u.searchParams.get('acao') === 'ligar');
  checar('telefone só com dígitos', u.searchParams.get('telefone') === '5551999887766',
    u.searchParams.get('telefone'));
  checar('negócio, cliente e coordenada vão junto',
    u.searchParams.get('dealId') === '12345' && u.searchParams.get('cliente') === 'Don Aguilar' &&
    u.searchParams.get('lat') === '-30.1' && u.searchParams.get('lng') === '-51.2');
  checar('quem clicou e de onde veio', u.searchParams.get('ownerId') === '86100506' && u.searchParams.get('origem') === 'cockpit');

  /* base que já tem querystring não pode virar link com dois "?" */
  const { ctx: c2 } = contexto('https://app.takeat.exemplo/abrir?v=2');
  const u2 = c2.pwaLinkDeAcao('whatsapp', { telefone: '551199' });
  checar('base com querystring recebe & e não um segundo ?',
    (u2.match(/\?/g) || []).length === 1 && /[?&]v=2&acao=whatsapp/.test(u2), u2);

  /* sem dado nenhum, o link ainda é válido: o app abre a tela de ação em branco em vez
     de nada acontecer — melhor do que um clique morto. */
  checar('sem dados, ainda é um link válido', /acao=ligar/.test(c2.pwaLinkDeAcao('ligar', null)));
}

/* 4 · o tipo é lido do próprio href */
{
  const { ctx } = contexto('https://app.takeat.exemplo/acao');
  checar('tel: é ligar', ctx.pwaTipoDoLink('tel:+5551999887766') === 'ligar');
  checar('wa.me é whatsapp', ctx.pwaTipoDoLink('https://wa.me/5551999887766') === 'whatsapp');
  checar('api.whatsapp.com também', ctx.pwaTipoDoLink('https://api.whatsapp.com/send?phone=55') === 'whatsapp');
  checar('maps é navegar', ctx.pwaTipoDoLink('https://www.google.com/maps/dir/?api=1&destination=1,2') === 'navegar');
  checar('link comum não é ação de campo', ctx.pwaTipoDoLink('https://app.hubspot.com/contacts/1') === '');
  checar('href vazio não é ação de campo', ctx.pwaTipoDoLink('') === '');
}

/* 5 · o interceptador cancela o destino antigo e abre o app */
{
  const { ctx, abertos, ouvintes } = contexto('https://app.takeat.exemplo/acao', '86100506');
  ctx.pwaLigarInterceptadorDeAcoes();
  checar('o clique é ouvido na fase de CAPTURA',
    ouvintes.length === 1 && ouvintes[0].tipo === 'click' && ouvintes[0].opts === true);

  const cartao = elemento({ 'data-negocio': '77777' });
  const link = elemento({ href: 'tel:+5551999887766', title: 'Ligar para Don Aguilar — 5551999887766' }, cartao);
  let impedido = false;
  const ev = { target: link, preventDefault: () => { impedido = true; }, stopPropagation: () => {} };
  ouvintes[0].fn(ev);
  checar('cancela o tel: e abre o app', impedido === true && /acao=ligar/.test(abertos[0]), abertos[0]);
  checar('o negócio do cartão em volta entra no link', /dealId=77777/.test(abertos[0]));
  checar('o cliente sai do title', /cliente=Don\+Aguilar/.test(abertos[0]));

  /* link que não é ação de campo passa reto */
  abertos.length = 0; impedido = false;
  ouvintes[0].fn({ target: elemento({ href: 'https://app.hubspot.com/contacts/1' }), preventDefault: () => { impedido = true; }, stopPropagation: () => {} });
  checar('link do HubSpot não é desviado', impedido === false && abertos.length === 0);

  /* e se o app for desligado em tempo de execução, o ouvinte volta a se calar */
  ctx.DATA.pwa = null;
  abertos.length = 0; impedido = false;
  ouvintes[0].fn({ target: link, preventDefault: () => { impedido = true; }, stopPropagation: () => {} });
  checar('app desligado depois: o clique volta a ser tel: de verdade',
    impedido === false && abertos.length === 0);
}

/* 6 · navegação com app ligado vai para o app */
{
  const { ctx, abertos } = contexto('https://app.takeat.exemplo/acao');
  checar('sem coordenada não abre nada e diz que não abriu',
    ctx.abrirNavegacaoDeCampo(null, null, 'x') === false && abertos.length === 0);
  ctx.abrirNavegacaoDeCampo(-30.03, -51.22, 'Bar do Zé', '777');
  checar('com app, a rota abre no app',
    /acao=navegar/.test(abertos[0]) && /lat=-30.03/.test(abertos[0]) && /dealId=777/.test(abertos[0]), abertos[0]);
}

/* 7 · janela bloqueada não pode matar o clique
   Dentro do app o Cockpit roda em WebView, e WebView bloqueia janela nova. Se isso virasse
   "nada acontece", seria clique morto no celular de quem está na rua — o pior lugar. */
{
  const { ctx, abertos } = contexto('https://app.takeat.exemplo/acao');
  ctx.window.open = () => null;                 // popup bloqueado, como na WebView
  const ok1 = ctx.pwaAbrir('https://app.takeat.exemplo/acao?acao=ligar');
  checar('popup bloqueado: navega na própria aba em vez de não fazer nada',
    ok1 === true && ctx.window.location.href === 'https://app.takeat.exemplo/acao?acao=ligar',
    ctx.window.location.href);
  checar('nenhuma janela foi aberta nesse caso', abertos.length === 0);

  ctx.window.open = () => { throw new Error('bloqueado com exceção'); };
  ctx.window.location = { set href(v) { throw new Error('sem navegação'); } };
  checar('sem aba nova E sem navegação, devolve false em vez de estourar',
    ctx.pwaAbrir('https://app.takeat.exemplo/acao') === false);
  checar('url vazia não abre nada', ctx.pwaAbrir('') === false);
}

console.log(falhas ? '\n' + falhas + ' falha(s).' : '\ntodas as checagens ok.');
process.exit(falhas ? 1 : 0);
