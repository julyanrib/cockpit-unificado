/* ══════════════════════════════════════════════════════════════════════════════════════
   O FAROL DA TELA — as propriedades que quebram em SILÊNCIO (08/09/26)
   ══════════════════════════════════════════════════════════════════════════════════════
   Julyan: "eu quero que a tela atualize toda hora que for possível... tudo na tela tem q
   ser instantaneo pelo supabase".

   POR QUE ESTE ARQUIVO EXISTE: nenhum defeito do farol aparece no build nem numa tela
   aberta por dez minutos. Ele falha assim:
     · a aba para de escutar e mostra dado velho — igual ao comportamento de antes, e
       ninguém percebe que o mecanismo morreu;
     · pior: ele repinta POR CIMA de alguém digitando. O campo que se apaga pode ser o
       motivo do perdido, que é obrigatório e não se recupera.

   Então o que se cobra aqui é a janela de segurança (as quatro condições que fazem o dado
   ESPERAR) e o que o farol faz depois de aplicar. As duas coisas são texto no template, e
   texto se mede sem navegador — que é o que permite isto rodar no CI, sem credencial.

   MEDIDO NO NAVEGADOR ANTES DE VIRAR GUARDA (preview do gestor, 08/09/26): os quatro
   bloqueios devolvendo false, o texto do campo intacto, o aviso na linha de frescor, e a
   linha do topo passando de "02/09 às 17:57" para a hora nova. Guarda que nunca viu o
   comportamento de verdade só mede o formato do meu próprio comentário. */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
function conferir(nome, condicao, porque) {
  if (condicao) { ok += 1; return; }
  falhas.push('  · ' + nome + ': ' + porque);
}

/* ── 1. A ABA ESCUTA, E SÓ DEPOIS DO LOGIN ───────────────────────────────────────── */
conferir('a tela liga o farol depois de existir sessão',
  /if \(typeof farolLigar === 'function'\) farolLigar\(\);/.test(tpl) &&
  tpl.indexOf('hidratadoPara = email;') < tpl.indexOf("if (typeof farolLigar === 'function') farolLigar();"),
  'a política de leitura do farol é para `authenticated` — ligar antes da sessão não recebe nada');

conferir('o canal escuta snapshot_farol, e não o snapshot',
  /table: 'snapshot_farol'/.test(tpl) && !/table: 'cockpit_snapshot'/.test(tpl),
  'cockpit_snapshot tem RLS com zero política de propósito: 933 kB de CRM não vão para o navegador');

conferir('o farol não traz dado de negócio: quem busca é /api/dados',
  /fetch\('\/api\/dados'/.test(tpl),
  'o corte por papel vive no servidor, com service_role; a linha do farol é só "mudou, vai buscar"');

/* ── 2. NÃO BUSCAR A MESMA COISA SETE VEZES ──────────────────────────────────────── */
conferir('versão já vista não dispara busca',
  /if \(FAROL_VISTO\[chave\] != null && versao <= FAROL_VISTO\[chave\]\) return;/.test(tpl),
  'a reconexão do WebSocket reentrega o último evento, e uma rodada publica 7 chaves');

conferir('só as chaves que mudam ESTA tela disparam busca',
  /const FAROL_CHAVES = \['hubspot', 'narrativas', 'weekly-raw', 'resumo-semanal'\];/.test(tpl) &&
  /if \(FAROL_CHAVES\.indexOf\(chave\) < 0\) return;/.test(tpl),
  'sync-status é telemetria e hubspot-previous é a foto anterior: buscar 933 kB por elas é tráfego por nada');

conferir('uma busca por vez',
  /if \(FAROL_BUSCANDO\) \{ FAROL_PENDENTE = true; return; \}/.test(tpl),
  'sem o trinco, um lote de eventos vira um lote de buscas do mesmo payload');

/* ── 3. A JANELA DE SEGURANÇA — a regra que não se negocia ───────────────────────── */
const janela = tpl.slice(tpl.indexOf('function farolPodeAplicar()'),
  tpl.indexOf('async function farolBuscarEAplicar'));

conferir('ficha ou menu de etapa aberto faz o dado esperar',
  /\.overlay\.show, #stageOverlay\.show/.test(janela),
  'repintar com a ficha aberta troca o negócio debaixo do que a pessoa está lendo');

conferir('gravação em curso faz o dado esperar',
  /FN_GRAVANDO\.size > 0/.test(janela),
  'repintar no meio da escrita otimista desfaz a ordem que a tela já mostrou');

conferir('campo em foco faz o dado esperar',
  /a\.tagName === 'INPUT'/.test(janela) && /a\.tagName === 'TEXTAREA'/.test(janela) &&
  /a\.isContentEditable/.test(janela),
  'um repinte apaga o que está no campo, e o campo pode ser o motivo do perdido');

/* A REGEX PEDE O ID EXATO. `/conducaoOverlay/` casava dentro de `conducaoOverlayXX`, e a
   sabotagem que trocou o id passou verde — guarda cega que eu só descobri porque testei
   as dez sabotagens uma por uma. */
conferir('a condução da rodada faz o dado esperar',
  /getElementById\('conducaoOverlay'\)/.test(janela) &&
  /cond\.classList\.contains\('show'\)/.test(janela),
  'a tela está projetada para o time; ela não muda no meio da fala de alguém');

conferir('a janela é conferida DE NOVO depois da busca',
  (tpl.match(/if \(!farolPodeAplicar\(\)\)/g) || []).length >= 2 &&
  /FAROL_DADO_ESPERANDO = corpo\.dados;/.test(tpl),
  'a busca leva segundos e a pessoa pode ter aberto uma ficha nesse meio — o dado fica guardado');

conferir('dado que esperou entra no clique, sem buscar de novo',
  /if \(FAROL_DADO_ESPERANDO\) \{ farolAplicar\(FAROL_DADO_ESPERANDO\); return; \}/.test(tpl),
  'ele já está na mão; buscar outra vez são 933 kB e um segundo de espera por nada');

/* ── 4. DEPOIS DE APLICAR, A TELA INTEIRA CONTA A MESMA HISTÓRIA ─────────────────── */
const aplicar = tpl.slice(tpl.indexOf('function farolAplicar(dados)'),
  tpl.indexOf('function farolAviso(mostrar)'));

conferir('o dado novo entra no MESMO objeto DATA',
  /Object\.assign\(DATA, dados\);/.test(aplicar),
  'DATA é const e meia tela guarda referência para ele: trocar o objeto deixa metade lendo o antigo');

conferir('as dailies recarregam junto',
  /dailiesCarregado = false;/.test(aplicar) && /carregarDailies\(\)/.test(aplicar),
  'elas vêm do Supabase e não do snapshot: sem isto, o prometido×realizado fica do horário do login');

conferir('repinta pela máquina do movimento de etapa',
  /repintarOndeONegocioAparece\(\);/.test(aplicar),
  'uma pintura por gesto, e as outras telas quando abrirem — a mesma regra do funil');

conferir('o cabeçalho de frescor repinta também',
  /preencherCabecalhoRodape\(\)/.test(aplicar),
  'aquela máquina cobre as seis telas de negócio, e a linha "HubSpot atualizado em ..." não é uma delas');

conferir('a pessoa é avisada de que os números mudaram',
  /mostrarToast\(/.test(aplicar),
  'número que muda sozinho sem explicação é pior que número velho');

/* ── 5. O AVISO ──────────────────────────────────────────────────────────────────── */
const aviso = tpl.slice(tpl.indexOf('function farolAviso(mostrar)'),
  tpl.indexOf('function farolAviso(mostrar)') + 2200);

conferir('o aviso mora ao lado da linha de frescor, não em cima do conteúdo',
  /getElementById\('updatedLine'\)/.test(aviso) && /farol-aviso--linha/.test(aviso),
  'medido a 1440x900: no canto fixo ele cobria o cartão de um executivo, e ele não some sozinho');

conferir('o aviso é IRMÃO da linha, e não filho dela',
  /insertBefore\(el, linha\.nextSibling\)/.test(aviso),
  'a linha é escrita com textContent a cada pintura, e isso apagaria o aviso e o dado que espera');

conferir('clique sem sessão diz o que aconteceu',
  /Sua sessão expirou/.test(tpl),
  'clique que não faz nem diz nada é clique morto: a pessoa clica de novo achando que errou a mira');

/* ── 6. O CSS DO AVISO FORA DE @media ────────────────────────────────────────────── */
/* CONTA CHAVES, e não a distância até o último "@media". A primeira versão desta
   checagem procurava o "@media" mais próximo antes da regra e reprovou a regra CERTA:
   o que ela achou foi a palavra @media dentro do COMENTÁRIO que conta o defeito de
   06/09. Profundidade 0 a partir do <style> é o que significa "vale em toda largura", e
   é o que o navegador respondeu (a regra aplicou a 1440 e a 375). */
const iCss = tpl.indexOf('.farol-aviso{');
const iStyle = tpl.lastIndexOf('<style', iCss);
let profundidade = 0;
if (iCss > -1 && iStyle > -1) {
  const antes = tpl.slice(iStyle, iCss);
  for (const ch of antes) {
    if (ch === '{') profundidade += 1;
    else if (ch === '}') profundidade -= 1;
  }
}
conferir('o CSS do aviso não está preso dentro de um @media',
  iCss > -1 && profundidade === 0,
  'em 06/09 quatro blocos de hover ficaram dentro de @media (max-width:640px) e só funcionavam no celular');

/* ── RESULTADO ───────────────────────────────────────────────────────────────────── */
if (falhas.length) {
  console.error('FALHAS (' + falhas.length + '):');
  falhas.forEach(l => console.error(l));
  process.exit(1);
}
console.log('farol da tela: ' + ok + ' checagens ok — a aba escuta o Supabase e nunca repinta sob a mão de alguém.');
