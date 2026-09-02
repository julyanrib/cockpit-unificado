// scripts/auditar-cliques.js
// AUDITORIA DE CLIQUE MORTO — gera um preview instrumentado e imprime o script de
// auditoria para colar no console do navegador.
//
// POR QUE ISSO EXISTE: em 29/08/2026 um `rootEl` inexistente estourava ReferenceError
// no meio de prosp2LigarEventos e derrubava TODA a fiação seguinte da aba Planejamento
// — 68 dos 133 controles ficaram inertes. A tela montava bonita, o build passava, os
// guards passavam e os 100 testes passavam. Nenhum deles clica.
//
// Nenhuma verificação estática acha isso. O único jeito de saber se um botão funciona é
// clicar nele e ver se algo muda. Este arquivo torna isso repetível.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// DUAS ARMADILHAS DESTE AUDITOR (01/09/26) — as duas me pegaram no mesmo dia.
//
// 1. `__ouvinteNaCadeia` NÃO É VEREDITO. Ele responde "existe algum ouvinte de clique
//    daqui até o document?", e nestas telas existe um ouvinte GLOBAL de clique — então a
//    resposta é "global" para praticamente tudo, e usar isso como varredura dá verde em
//    botão morto. Foi assim que passaram: o segmentado "Sinal" da v4 (botões com data-v e
//    ouvinte que exigia a classe .prosp2-visao) e três botões por linha no dossiê da
//    carteira (CTA com `href` renderizado como <button>, e o ouvinte só chamava .acao()).
//    Ele serve para DIAGNOSTICAR um morto já encontrado — nunca para encontrá-lo.
//    Use auditarAba, que clica.
//
// 2. "NÃO MUDOU NADA" NEM SEMPRE É MORTE, E "MUDOU" NEM SEMPRE É VIDA.
//    Falso positivo: atalho cujo trabalho é ROLAR até um destino que já está na tela — não
//    há para onde rolar, nada muda, e o auditor acusa. Aconteceu com "Buracos restantes",
//    "Quentes sem compromisso" e o índice do Playbook. Mas repare: do ponto de vista de
//    quem usa, o auditor estava CERTO — clique sem efeito visível é clique morto. A
//    correção foi fazer o destino piscar (piscarAlvo), não silenciar o auditor.
//    Falso negativo: filtro que acende o próprio botão e não filtra a lista muta o DOM e
//    passa como vivo — é para isso que existe a auditoria semântica de filtro, mais abaixo.
//
//    Prático: dê 400ms de espera (scroll suave não cabe em 180ms) e, quando um morto
//    aparecer, CONFIRME à mão antes de consertar — metade deles é o auditor, metade é o
//    código, e as duas metades exigem consertos diferentes.
// ─────────────────────────────────────────────────────────────────────────────────────
//
// COMO USAR:
//   1. node scripts/build.js
//   2. node scripts/preview-local.js rep C:\caminho\preview.html
//   3. node scripts/auditar-cliques.js C:\caminho\preview.html
//        -> escreve preview.auditoria.html ao lado, com o gravador de listeners injetado
//   4. sirva a pasta por HTTP (file:// é bloqueado) e abra o .auditoria.html
//   5. cole no console o script que este comando imprime, e rode:
//        await auditarAba('tabBtnAgenda', 'viewAgenda')
//
// SEGURANÇA: o preview local é OFFLINE — preview-local.js zera as chaves de Supabase e
// MapTiler de propósito. Por isso é seguro clicar em TUDO, inclusive nos botões que
// gravariam no HubSpot: eles não têm para onde escrever. NUNCA rode esta auditoria em
// produção.
//
// COMO ELE DECIDE QUE UM CLIQUE ESTÁ MORTO: um MutationObserver conta mutações no
// documento inteiro e um instantâneo serializa os objetos de estado da tela. Clique que
// não produz NENHUMA mutação e NENHUMA mudança de estado está morto. É deliberadamente
// sensível — falso positivo se investiga em 30 segundos, falso negativo passa para
// produção.
//
// FALSOS POSITIVOS CONHECIDOS, e como separá-los:
//   * controle dentro de painel fechado (o drawer da Prospecção fica deslocado para
//     fora da tela). checkVisibility() já filtra a maioria; o resto se confirma com
//     document.elementFromPoint no centro do elemento.
//   * controle que depende de um alvo ainda não escolhido (os botões do drawer sem lead
//     selecionado). Se o único caminho que abre o painel também define o alvo, o estado
//     é inalcançável para o usuário — leia o código antes de "corrigir".

const fs = require('fs');
const path = require('path');

const GRAVADOR = `<script>
(function(){
  var orig = EventTarget.prototype.addEventListener;
  window.__mapa = new WeakMap();
  window.__globais = Object.create(null);
  EventTarget.prototype.addEventListener = function(tipo, fn, opts){
    try {
      if (this === document || this === window || this === document.documentElement || this === document.body) {
        __globais[tipo] = (__globais[tipo] || 0) + 1;
      } else if (this && this.nodeType === 1) {
        var m = __mapa.get(this);
        if (!m) { m = Object.create(null); __mapa.set(this, m); }
        m[tipo] = (m[tipo] || 0) + 1;
      }
    } catch (e) {}
    return orig.call(this, tipo, fn, opts);
  };
  window.__ouvinteNaCadeia = function(el, tipo){
    for (var nn = el; nn && nn.nodeType === 1; nn = nn.parentElement) {
      var m = __mapa.get(nn);
      if (m && m[tipo]) return nn === el ? 'proprio' : 'ancestral';
    }
    return __globais[tipo] ? 'global' : 'nenhum';
  };
  window.__erros = [];
  addEventListener('error', function(e){ __erros.push('error: ' + e.message); });
  addEventListener('unhandledrejection', function(e){ __erros.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)); });
})();
</script>`;

const AUDITOR = `
/* ---- cole isto no console do preview instrumentado ---- */
window.__mut = 0;
new MutationObserver(function(ms){ window.__mut += ms.length; })
  .observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });

const esperar = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };

const estado = function(){
  const g = function(n){ try { return JSON.stringify(eval(n)); } catch (e) { return 'x'; } };
  return [g('prosp2Estado'), g('precificacaoEstado'), g('playbookTelaAtual'), g('playbookPaginaAtual'),
    g('meuFunilFiltroVisao'), g('filaFocoInicial'), g('dailyRefDate'), g('prcModoCliente'),
    location.href, String(window.scrollY), String(document.body.innerHTML.length)].join('|');
};

const descrever = function(el){
  const d = Array.from(el.attributes).filter(function(a){ return a.name.indexOf('data-') === 0; })
    .map(function(a){ return a.name + '=' + a.value.slice(0, 14); }).join(' ');
  const t = (el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 44);
  return el.tagName + (el.id ? '#' + el.id : '') + '.' + String(el.className || '').split(' ')[0] + ' [' + d + '] "' + t + '"';
};

const candidatos = function(raiz){
  return Array.from(raiz.querySelectorAll('button, a, [role="button"], summary, input, select, textarea, [onclick]'))
    .filter(function(el){
      if (el.disabled) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      /* checkVisibility() SEM opções não olha visibility:hidden nem content-visibility —
         só display:none e tamanho zero. Foi por isso que a auditoria do Planejamento em
         02/09/26 reportou "+ Agendar visita" do drawer fechado como morto: o botão tem
         visibility:hidden e mora em x=1469 numa janela de 1440. Passar as duas opções faz
         o filtro dizer o que o nome dele promete, e o falso positivo desaparece. */
      if (typeof el.checkVisibility === 'function'
        && !el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
      /* FORA DA JANELA NO EIXO X não é candidato: painel fechado fica deslocado para o
         lado (o drawer da Prospecção, em x=1469 numa janela de 1440) e produzia um morto
         por rodada cuja investigação terminava sempre na mesma conclusão. Controle que só
         existe com o painel aberto se audita COM o painel aberto — outro passo, não este.

         MAS NÃO NO EIXO Y, e este era um defeito GRAVE deste auditor (corrigido 02/09/26).
         Eu escrevi a regra nos dois eixos de uma vez, e abaixo da dobra é o lugar normal
         de quase todo controle: a Agenda tem 2.610px de altura e 99 controles, dos quais
         a janela mostra 5. O auditor dizia 'novos: 1, mortos: 0' e isso parecia aprovação.
         Ele só cobria mais que isso por acidente — clique que rola a página traz outros
         controles para dentro da janela. Auditoria que depende de sorte não é auditoria.
         Agora quem está abaixo da dobra é candidato, e o clique rola até ele primeiro. */
      if (r.right < 0 || r.left > window.innerWidth) return false;
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
      return true;
    });
};

const alcancavel = function(el){
  const r = el.getBoundingClientRect();
  const alvo = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  if (!alvo) return 'nada no ponto';
  return (alvo === el || el.contains(alvo)) ? 'SIM' : 'coberto por ' + alvo.tagName;
};

/* Roda até a cobertura parar de crescer. Deduplica por DESCRITOR, não por índice: um
   clique pode refiltrar a lista e embaralhar as posições, e aí a iteração por índice
   audita duas vezes o mesmo botão e nunca chega em outro. */
window.auditarAba = async function(idAba, idView, orcamentoMs){
  const view = document.getElementById(idView);
  const abrir = async function(){
    document.getElementById(idAba).click();
    for (var t = 0; t < 40; t++) {
      if (getComputedStyle(view).display !== 'none' && candidatos(view).length) return true;
      await esperar(150);
    }
    return false;
  };
  await abrir();
  const vistos = new Set(); const mortos = [];
  const r = { aba: idAba, novos: 0, vivo: 0, nativo: 0, link: 0, mortos: mortos, restam: 0 };
  const t0 = Date.now();
  while (Date.now() - t0 < (orcamentoMs || 30000)) {
    if (getComputedStyle(view).display === 'none') await abrir();
    const lista = candidatos(view).filter(function(el){ return !vistos.has(descrever(el)); });
    r.restam = lista.length;
    if (!lista.length) break;
    const el = lista[0], desc = descrever(el), tag = el.tagName;
    vistos.add(desc); r.novos++;
    if (tag === 'A') {
      const h = el.getAttribute('href') || '';
      if (h && h !== '#' && h.indexOf('javascript:') !== 0) { r.link++; continue; }  // navegação nativa
    }
    if (tag === 'SUMMARY' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { r.nativo++; continue; }
    /* Rola até o alvo ANTES de fotografar o estado, por dois motivos: elementFromPoint
       (que é como alcancavel() decide se o botão está coberto) só responde sobre o que
       está na janela; e estado() inclui window.scrollY — rolar depois da foto faria todo
       controle fora da dobra parecer VIVO só por ter mudado a rolagem. */
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    await esperar(90);
    const am = window.__mut, ae = estado();
    try { el.click(); } catch (e) { mortos.push({ desc: desc, motivo: 'erro: ' + e.message }); continue; }
    await esperar(180);
    if (window.__mut === am && estado() === ae) {
      mortos.push({ desc: desc, ouvinte: window.__ouvinteNaCadeia(el, 'click'), alcancavel: alcancavel(el) });
    } else { r.vivo++; }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await esperar(55);
  }
  return r;
};

/* As oito abas do executivo. Rode uma por vez: o console tem limite de tempo por chamada.
     await auditarAba('tabBtnMeuPainel',    'viewMeuPainel')
     await auditarAba('tabBtnMeuFunil',     'viewMeuFunil')
     await auditarAba('tabBtnDaily',        'viewDaily')
     await auditarAba('tabBtnAgenda',       'viewAgenda')     // Planejamento
     await auditarAba('tabBtnAgendaSemana', 'viewAgenda')     // Agenda — MESMA view, outro conteúdo
     await auditarAba('tabBtnPDIs',         'viewPDIs')
     await auditarAba('tabBtnPrecificacao', 'viewPrecificacao')
     await auditarAba('tabBtnPlaybook',     'viewPlaybook')
   Planejamento e Agenda compartilham #viewAgenda: confirme o conteúdo certo antes de
   confiar no resultado (a Prospecção tem #prosp2Grid, a Agenda não). */


/* ═══════════════════════════════════════════════════════════════════════════════════
   AUDITORIA SEMÂNTICA DE FILTRO — "mudou" não é "mudou o certo"

   O auditor de cima responde "esse clique faz alguma coisa?". Isso NÃO basta para
   filtro: um filtro que acende o próprio botão e não filtra a lista produz mutação e
   passa como vivo. Foi essa a lacuna que o Julyan apontou em 30/08.

   Este responde a pergunta certa: o rótulo declara um número ("Sem próximo passo · 25",
   "Casa dos Dados 2", "Todos (19)"); depois do clique, a lista tem de ter exatamente
   esse número de itens. E o conjunto renderizado tem de MUDAR entre as opções — é isso
   que separa filtrar de pintar de outra cor.

   ARMADILHAS que me deram três falsos alarmes antes de eu acertar:
     * SELETOR DE ITEM ERRADO devolve zero e parece filtro morto. Confirme a classe
       real no DOM antes de acreditar (a lista de etapa do Meu funil é .mf-lead-row,
       não .lead-row).
     * FILTROS COMPÕEM. Zere os outros antes: o filtro de etapa do Meu funil se soma à
       visão, e o de tipo da Agenda se soma à vista. Sem zerar, tudo dá zero.
     * BOTÃO desabilitado (balde com 0) não filtra nada, e está certo: não é morto.
       NÃO use acento grave neste texto: ele vive dentro de um template literal, e um
       acento grave solto fecha a string e derruba o arquivo inteiro em silêncio.
   ═══════════════════════════════════════════════════════════════════════════════════ */
window.auditarFiltro = async function(nome, seletorBotoes, seletorLista, seletorItem, esperaMs){
  const linhas = [];
  const btns = function(){ return Array.from(document.querySelectorAll(seletorBotoes)); };
  const total = btns().length;
  for (var i = 0; i < total; i++) {
    const b = btns()[i];
    if (!b) continue;
    const rot = b.textContent.replace(/\\s+/g, ' ').trim();
    const nums = rot.match(/(\\d+)/g);
    const declarado = nums ? Number(nums[nums.length - 1]) : null;
    const desabilitado = !!b.disabled;
    b.click();
    await esperar(esperaMs || 700);
    const lista = document.querySelector(seletorLista);
    const itens = lista ? Array.from(lista.querySelectorAll(seletorItem)) : [];
    linhas.push({
      rotulo: rot, declarado: declarado, desabilitado: desabilitado, renderizados: itens.length,
      bate: declarado == null ? '—' : (declarado === itens.length ? 'SIM' : 'NAO'),
      assinatura: itens.map(function(el){ return (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40); }).join('|').slice(0,300)
    });
  }
  const distintos = new Set(linhas.filter(function(l){ return !l.desabilitado; }).map(function(l){ return l.assinatura; }));
  return { filtro: nome, opcoes: linhas.map(function(l){ delete l.assinatura; return l; }),
    conjuntosDistintos: distintos.size, discrimina: distintos.size > 1 };
};

/* As nove famílias de filtro do executivo, com o seletor de item JÁ CONFERIDO no DOM.
     await auditarFiltro('Meu funil · visão',    '[data-mfvisao]',                '#mfKanbanSlot', '.kb-card')
     await auditarFiltro('Meu funil · etapa',    '[data-mfetapa]',                '#mfKanbanSlot', '.mf-lead-row')
     await auditarFiltro('Modal de etapa',       '#stageOverlay [data-filtro]',   '#stageOverlay', '.lead-row')
     await auditarFiltro('Planejamento · balde', '#filaFollowUp [data-fila-balde]','#filaFollowUp', '.fila-item')
     await auditarFiltro('Planejamento · fonte', '#viewAgenda [data-f]',          '#prosp2Grid',   '.prosp2-card')
     await auditarFiltro('Planejamento · visão', '#viewAgenda [data-v]',          '#prosp2Grid',   '.prosp2-card')
     await auditarFiltro('Agenda · tipo',        '#viewAgenda [data-agfiltro]',   '#viewAgenda',   '[data-agev]')
     await auditarFiltro('Agenda · vista',       '#viewAgenda [data-agvista]',    '#viewAgenda',   '[data-agev]')
     await auditarFiltro('Playbook · categoria', '#viewPlaybook [data-pb-cat]',   '.pb-catalog',   '[data-pb-page]')

   A LISTA ACIMA JÁ FICOU INCOMPLETA UMA VEZ (30/08/26): a família do Playbook faltava, e
   por isso ela passou uma rodada inteira sem auditoria enquanto eu declarava as outras
   oito conferidas. Ao criar um filtro novo, acrescente a linha aqui no mesmo commit —
   auditoria que não conhece o controle não o cobre, e o relatório fica falso sem ninguém
   perceber. Para conferir se falta alguma, liste os atributos de filtro do template:
     Object.keys([...document.querySelectorAll('#viewPlaybook,#viewAgenda,#viewMeuFunil'))
   ou, mais direto, no repositório:
     grep -o 'data-[a-z-]*\\(filtro\\|cat\\|visao\\|vista\\|balde\\|etapa\\|visao\\)[a-z-]*=' template/cockpit.template.html | sort -u

   O chip "Todos" do Playbook carrega data-pb-cat="Todos", que NÃO é uma categoria dos
   dados — ele mostra a biblioteca inteira. Ao comparar com playbookDados(), trate-o à
   parte, senão o esperado vira 0 e o relatório acusa um falso negativo (foi o que me
   aconteceu; as 8 categorias reais somam exatamente o total de guias).

   A busca do Playbook é INPUT e não se testa clicando — digite:
     const i = document.querySelector('#viewPlaybook input');
     i.value = 'objecao'; i.dispatchEvent(new Event('input', {bubbles:true}));
   e confira que .pb-home-result aparece, e que um termo sem match diz
   "Nenhum guia encontrado". */


/* ═══════════════════════════════════════════════════════════════════════════════════
   LEADS DE PRAÇA SINTÉTICOS — sem isto, dois filtros ficam INTESTÁVEIS

   O preview local vem com prospeccaoCache VAZIO (medido: 0), porque as contas-alvo
   moram no Supabase e o preview é offline. Resultado: as pílulas de fonte e de visão do
   Planejamento não têm o que filtrar, e foi exatamente aí que os filtros mortos
   passaram batido — "0 de 0" parece funcionar.

   Cole isto ANTES de auditar o Planejamento. Os seis leads cobrem as quatro
   combinações que os predicados do produto distinguem.
   ═══════════════════════════════════════════════════════════════════════════════════ */
window.semearLeadsDePraca = async function(){
  const owner = sessaoAtual.ownerId;
  const terr = territorioDe(owner);
  const base = { lat: terr ? terr.lat : -20.3155, lng: terr ? terr.lng : -40.3128 };
  const hoje = Date.now();
  const iso = function(d){ return new Date(hoje - d * 86400000).toISOString().slice(0, 10); };
  const mk = function(i, o){
    return Object.assign({
      id: 'sint-' + i, nome: 'Restaurante Sintetico ' + i, responsavel_owner_id: owner,
      status: 'novo', lat: base.lat + i * 0.002, lng: base.lng + i * 0.002,
      bairro: 'Centro', cidade: 'Teste', categoria: 'restaurante',
      telefone: null, data_abertura: null, avaliacoes: null, fonte: 'casa dos dados'
    }, o);
  };
  const leads = [
    mk(1, { data_abertura: iso(30) }),                                                    // recém-aberta, sem telefone
    mk(2, { data_abertura: iso(60) }),                                                    // recém-aberta, sem telefone
    mk(3, { fonte: 'Google Places', telefone: '(27) 3333-4444', avaliacoes: 120 }),        // pronta pra ligar
    mk(4, { fonte: 'outscraper', telefone: '27999998888', avaliacoes: 80 }),               // pronta pra ligar
    mk(5, { fonte: 'Google Places', telefone: '(27) 3222-1111', data_abertura: iso(20) }), // as duas
    mk(6, { fonte: 'tripadvisor', avaliacoes: 300 })                                       // nenhuma das duas
  ];
  prospeccaoCache.push.apply(prospeccaoCache, leads);
  agendaProspeccaoPronta = true;
  prosp2Estado.fonte = 'todas'; prosp2Estado.visao = 'todas'; prosp2Estado.agenda = {};
  await renderProspeccaoExecutivo();
  return { semeados: leads.length, noCache: prospeccaoCache.length };
};
`;

const entrada = process.argv[2];
if (!entrada) {
  console.error('uso: node scripts/auditar-cliques.js <caminho do preview.html>');
  process.exit(1);
}
if (!fs.existsSync(entrada)) {
  console.error('não encontrei: ' + entrada);
  process.exit(1);
}
let html = fs.readFileSync(entrada, 'utf8');
const i = html.indexOf('<head>');
if (i < 0) { console.error('o arquivo não parece ser o preview (sem <head>)'); process.exit(1); }
html = html.slice(0, i + 6) + '\n' + GRAVADOR + html.slice(i + 6);

const saida = entrada.replace(/\.html$/i, '') + '.auditoria.html';
fs.writeFileSync(saida, html);

console.log('Preview instrumentado: ' + saida);
console.log('Sirva a pasta por HTTP (file:// é bloqueado), abra o arquivo e cole no console:');
console.log(AUDITOR);
