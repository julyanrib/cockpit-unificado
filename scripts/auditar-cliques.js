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
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false;
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
