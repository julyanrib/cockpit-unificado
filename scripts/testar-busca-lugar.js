// scripts/testar-busca-lugar.js
//
// A BUSCA DE LUGAR DO PASSO B (Planejamento v5) — a prova de que ela responde enquanto se
// digita, mostra o número antes do clique e nunca destrói o contexto.
//
// POR QUE ESTE TESTE EXISTE, e por que ele não é opcional: a busca é a primeira interação
// deste projeto que não pode ser verificada no preview local. O preview roda offline com
// Supabase e MapTiler zerados (é o que o próprio preview-local.js diz em comentário), e sem
// Supabase não existe conta-alvo nenhuma — a aba abre com "Meu território · 0" e zero cards.
// Ou seja: a única forma de ver a busca funcionando era publicar em produção e clicar lá.
// Publicar interação sem prova foi exatamente o que produziu a regressão de 01/09 (uma
// função chamada e nunca declarada, que só quebrava para quem tinha lead).
//
// O que fica provado aqui, na ordem de gravidade:
//   1. MENOS DE 2 CARACTERES NÃO ABRE NADA e não gasta geocodificação.
//   2. O CONTADOR DE CADA BAIRRO É REAL — vem dos leads, e o número que aparece antes do
//      clique é o mesmo que a lista terá depois. Se estes divergirem, o número mente e a
//      pessoa paga a mentira em deslocamento.
//   3. ACENTO NÃO IMPORTA: "botanico" acha "Jardim Botânico".
//   4. A GRADE NÃO MUDA ENQUANTO SE BUSCA — nada de prosp2Estado é tocado por digitar.
//   5. O TECLADO INTEIRO: ↑↓ circula, ↵ escolhe o destacado, esc limpa e fecha.
//   6. ESCOLHER guarda o modo anterior (o ✕ promete voltar; voltar precisa de destino) e
//      zera o lote.
//   7. VAZIO NÃO É BECO: sem resultado, três bairros clicáveis com contador.
//   8. SEM ROTA a faixa é âmbar, diz o caminho de volta, e o segmento mostra "—", nunca "0"
//      (zero parece defeito; travessão explica ausência).
//
// Roda sem rede e sem navegador: recorta os blocos do template e avalia num vm com DOM falso.
//
//   node scripts/testar-busca-lugar.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'template', 'cockpit.template.html'), 'utf8');

/* SEM COMENTÁRIO NAS CHECAGENS DE AUSÊNCIA (01/09/26).
   A 1ª versão deste teste acusou quatro falsas falhas: "Buscar aqui", "em branco",
   "Completar o dia" e o texto do banner amarelo ainda apareciam no arquivo — dentro dos
   COMENTÁRIOS que explicam a remoção deles, inclusive nos que eu acabei de escrever.
   Comentário que registra o que morreu é a memória do projeto: apagá-lo faria a próxima
   pessoa reinventar o card. Quem tem de mudar é a checagem. É a mesma correção que o guard
   de referências precisou no mesmo dia, pelo mesmo motivo. */
const RE_COMENTARIO_HTML = new RegExp('<!--[\\s\\S]*?-->', 'g');
const RE_COMENTARIO_BLOCO = new RegExp('/\\*[\\s\\S]*?\\*/', 'g');
const RE_COMENTARIO_LINHA = new RegExp('(^|[^:\\\\])//[^\\n]*', 'g');
const semComentario = t => String(t)
  .replace(RE_COMENTARIO_HTML, ' ')
  .replace(RE_COMENTARIO_BLOCO, ' ')
  .replace(RE_COMENTARIO_LINHA, '$1 ');
const codigo = semComentario(html);

let falhas = 0;
const checar = (nome, cond, detalhe) => {
  console.log((cond ? '  ok  ' : 'FALHA ') + nome + (detalhe ? ' · ' + detalhe : ''));
  if (!cond) falhas++;
};

/* ── o recorte: as funções auxiliares da v5 ─────────────────────────────────────────── */
const INI = '/* ════════════════════════════════════════════════════════════════════════════════════════\n   PLANEJAMENTO v5 — A BUSCA DE LUGAR';
const iniAlt = html.indexOf('PLANEJAMENTO v5 — A BUSCA DE LUGAR');
const a = html.lastIndexOf('/*', iniAlt);
const b = html.indexOf('function pl4RiscoDoBalde(', a);
if (iniAlt < 0 || a < 0 || b < 0) {
  console.error('FALHA: não achei o bloco das funções da v5 no template.');
  process.exit(1);
}
const codigoFuncoes = html.slice(a, b);

/* ── DOM falso: só o que estas funções usam ─────────────────────────────────────────── */
const ctx = {
  console,
  esc: t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  pl4RotuloDoDia: iso => 'quarta 02/09',
  prosp2Estado: { onde: 'rota', ondeAntes: 'rota', local: null, mostrar: 10, visao: 'todas', fonte: 'todas' },
  PROSP2_LOTE: 10,
  distanciaKm: (a1, b1, c1, d1) => {
    if (![a1, b1, c1, d1].every(Number.isFinite)) return null;
    return Math.sqrt(Math.pow(a1 - c1, 2) + Math.pow(b1 - d1, 2)) * 111;
  }
};
vm.createContext(ctx);
vm.runInContext(codigoFuncoes, ctx);

/* ── os leads de mentira, com bairros de verdade ────────────────────────────────────── */
const leads = [
  { id: 1, bairro: 'Moinhos de Vento', cidade: 'Porto Alegre', lat: -30.02, lng: -51.20, nota: 4.6 },
  { id: 2, bairro: 'Moinhos de Vento', cidade: 'Porto Alegre', lat: -30.03, lng: -51.21, nota: 4.8 },
  { id: 3, bairro: 'Moinhos de Vento', cidade: 'Porto Alegre', lat: -30.04, lng: -51.19, nota: 4.1 },
  { id: 4, bairro: 'Jardim Botânico', cidade: 'Porto Alegre', lat: -30.06, lng: -51.17, nota: 4.5 },
  { id: 5, bairro: 'Jardim Botânico', cidade: 'Porto Alegre', lat: -30.07, lng: -51.16, nota: 3.9 },
  { id: 6, bairro: 'Auxiliadora', cidade: 'Porto Alegre', lat: -30.01, lng: -51.18, nota: 4.7 },
  { id: 7, bairro: '', cidade: 'Porto Alegre', lat: -30.00, lng: -51.15, nota: 4.2 }
];

/* ── 1 e 2: contagem real por bairro, e a coordenada média ──────────────────────────── */
const bairros = ctx.pl5BairrosDoTerritorio(leads);
checar('agrupa por bairro e ordena por quantidade',
  bairros[0].nome === 'Moinhos de Vento' && bairros[0].n === 3,
  bairros.map(b => b.nome + '=' + b.n).join(' · '));
checar('lead sem bairro não inventa um bairro vazio',
  !bairros.some(b => !b.nome), 'bairros: ' + bairros.length);
checar('a contagem do bairro é a mesma que a lista terá depois do clique',
  bairros.find(b => b.nome === 'Jardim Botânico').n ===
  leads.filter(l => l.bairro === 'Jardim Botânico').length);
const mv = bairros.find(b => b.nome === 'Moinhos de Vento');
checar('o centro do bairro é a média das coordenadas dos leads dele',
  Math.abs(mv.lat - (-30.03)) < 0.0001 && Math.abs(mv.lng - (-51.20)) < 0.0001,
  mv.lat.toFixed(4) + ', ' + mv.lng.toFixed(4));

/* ── O MESMO BAIRRO EM DUAS GRAFIAS (achado em PRODUÇÃO, 01/09/26) ───────────────────
   A base tem "Praia da Costa" e "PRAIA DA COSTA" — o mesmo bairro, vindo de coletas
   diferentes. A 1ª versão agrupava pelo nome cru: a busca mostrava duas linhas iguais com
   a contagem partida (7 e 6) e nenhuma das duas dizia a verdade, 13.
   E o filtro que monta o lote DEPOIS do clique já era insensível a caixa — então clicar em
   "· 7" traria 13 cards, quebrando na cara da pessoa a única promessa que esta busca faz.
   Este caso não aparecia nos dados de mentira porque eu os escrevi com grafia consistente:
   é o tipo de defeito que só dado real produz. */
const leadsGrafia = [
  { id: 1, bairro: 'Praia da Costa', cidade: 'Vila Velha', lat: -20.33, lng: -40.29 },
  { id: 2, bairro: 'Praia da Costa', cidade: 'Vila Velha', lat: -20.34, lng: -40.28 },
  { id: 3, bairro: 'PRAIA DA COSTA', cidade: 'Vila Velha', lat: -20.35, lng: -40.30 },
  { id: 4, bairro: 'praia da costa', cidade: 'Vila Velha', lat: -20.36, lng: -40.27 },
  { id: 5, bairro: 'PRAIA DE ITAPARICA', cidade: 'Vila Velha', lat: -20.40, lng: -40.29 }
];
const grupos = ctx.pl5BairrosDoTerritorio(leadsGrafia);
checar('três grafias do mesmo bairro viram UMA linha',
  grupos.filter(g => ctx.pl5Chave(g.nome) === 'praia da costa').length === 1,
  grupos.map(g => g.nome + '=' + g.n).join(' · '));
checar('a contagem é a do grupo inteiro, não de uma grafia',
  grupos.find(g => ctx.pl5Chave(g.nome) === 'praia da costa').n === 4);
checar('o rótulo exibido é a grafia legível, não a que grita',
  grupos.find(g => ctx.pl5Chave(g.nome) === 'praia da costa').nome === 'Praia da Costa');
checar('bairro que só existe em maiúscula mantém a própria grafia',
  grupos.find(g => ctx.pl5Chave(g.nome) === 'praia de itaparica').nome === 'PRAIA DE ITAPARICA');
checar('a contagem prometida é a mesma que o filtro do lote devolve',
  grupos.find(g => ctx.pl5Chave(g.nome) === 'praia da costa').n ===
  leadsGrafia.filter(l => ctx.pl5Chave(l.bairro) === ctx.pl5Chave('Praia da Costa')).length);

/* ── 3: acento e caixa ──────────────────────────────────────────────────────────────── */
const casa = termo => bairros.filter(b => ctx.pl5Chave(b.nome).includes(ctx.pl5Chave(termo)));
checar('"botanico" sem acento acha "Jardim Botânico"',
  casa('botanico').length === 1 && casa('botanico')[0].nome === 'Jardim Botânico');
checar('"MOINHOS" em maiúscula acha "Moinhos de Vento"',
  casa('MOINHOS').length === 1);
checar('"moinhos verdes" não acha nada (o estado vazio existe de verdade)',
  casa('moinhos verdes').length === 0);
checar('o trecho digitado é sublinhado no resultado',
  ctx.pl5Realce('Moinhos de Vento', 'moi').includes('<u>Moi</u>'),
  ctx.pl5Realce('Moinhos de Vento', 'moi'));
checar('realce não quebra quando o termo não está no nome',
  ctx.pl5Realce('Auxiliadora', 'xyz') === 'Auxiliadora');

/* ── 8: a faixa de contexto, os três estados ────────────────────────────────────────── */
const rotaVazia = { diaISO: '2026-09-02', paradas: [] };
const rotaCheia = { diaISO: '2026-09-02', paradas: [{ cliente: 'Mizami', hora: '09:00', bairro: 'Moinhos', lat: -30.02, lng: -51.20 }] };

const faixaSem = ctx.pl5FaixaHTML({ modo: 'territorio', rota: rotaVazia, nNoRaio: 0, raioKm: 1, lugar: null, temRota: false, nTerritorio: 6 });
checar('sem rota: a faixa é âmbar (is-sem)', faixaSem.includes('pl5-faixa is-sem'));
checar('sem rota: diz o caminho de volta — a 1ª conta cria a rota',
  faixaSem.includes('A 1ª conta que você mandar pra bandeja cria a rota'));
checar('sem rota: oferece a agenda (aviso sem saída é só aviso)',
  faixaSem.includes('id="pl5VerAgenda"'));
checar('sem rota: NÃO usa o texto do banner amarelo antigo',
  !faixaSem.includes('Nada marcado para'));

const faixaRota = ctx.pl5FaixaHTML({ modo: 'rota', rota: rotaCheia, nNoRaio: 18, raioKm: 1, lugar: null, temRota: true, nTerritorio: 108 });
checar('modo rota: nomeia a rota e o raio', faixaRota.includes('SUA ROTA DE QUARTA') && faixaRota.includes('18 contas-alvo num raio de 1 km'));
checar('modo rota: oferece o mapa', faixaRota.includes('id="pl4VerMapaRota"'));

const faixaLugar = ctx.pl5FaixaHTML({
  modo: 'lugar', rota: rotaCheia, nNoRaio: 18, raioKm: 1, temRota: true, nTerritorio: 108,
  lugar: { rotulo: 'Moinhos de Vento', tipo: 'bairro', n: 24, kmDaParada: 2.3 }
});
checar('lugar escolhido: a faixa vira o nome do lugar',
  faixaLugar.includes('MOINHOS DE VENTO') && faixaLugar.includes('24 contas-alvo'));
checar('lugar escolhido: diz a distância até a 1ª parada (responde "vale sair de lá pra cá?")',
  faixaLugar.includes('2,3 km da sua 1ª parada'));
checar('lugar escolhido: oferece a volta ao modo anterior',
  faixaLugar.includes('id="pl5VoltarModo"') && faixaLugar.includes('voltar pra perto da rota'));
ctx.prosp2Estado.ondeAntes = 'territorio';
const faixaLugar2 = ctx.pl5FaixaHTML({
  modo: 'lugar', rota: rotaCheia, nNoRaio: 18, raioKm: 1, temRota: true, nTerritorio: 108,
  lugar: { rotulo: 'Auxiliadora', tipo: 'bairro', n: 9, kmDaParada: null }
});
checar('a volta aponta para o modo REAL anterior, não para um padrão fixo',
  faixaLugar2.includes('voltar pra meu território'));
ctx.prosp2Estado.ondeAntes = 'rota';

/* ── o contrato da barra no template (marcação, não comportamento) ───────────────────── */
/* os recortes usam marcação, não comentário: os marcadores anteriores eram comentários e
   `codigo` acabou de tirá-los — o recorte vinha vazio e TODA checagem dele falhava. */
const barra = codigo.slice(codigo.indexOf('<div class="pl5-barra">'), codigo.indexOf('<div class="pl5-sinal">'));
checar('o segmento de rota mostra "—" quando não há rota, nunca "0"',
  barra.includes("temRotaV5 ? noRaioDaRota.length : '—'"));
checar('o segmento de rota fica desabilitado (não desaparece: ausência é informação)',
  barra.includes('disabled aria-disabled="true"'));
checar('a busca é um campo vivo, sem botão "Buscar"',
  barra.includes('id="pl5BuscaInput"') && !barra.includes('Buscar aqui'));
checar('o placeholder não esconde regra invisível ("em branco, usamos a sua cidade" morreu)',
  barra.includes('ir pra outro lugar — bairro, endereço ou CEP') && !barra.includes('em branco'));
checar('o atalho / está anunciado no próprio campo', barra.includes('pl5-kbd'));
checar('lugar escolhido vira chip escuro com ✕ no lugar do campo',
  barra.includes('class="pl5-chip"') && barra.includes('id="pl5ChipX"'));

const sinal = codigo.slice(codigo.indexOf('<div class="pl5-sinal">'), codigo.indexOf('<div class="prosp2-grid"'));
checar('as quatro visões do sinal existem',
  ['data-v="todas"', 'data-v="recemAberta"', 'data-v="comTelefone"', 'data-v="notaAlta"'].every(x => sinal.includes(x)));
checar('a frase intocável das visões continua na tela',
  sinal.includes('visões exclusivas, não somáveis'));
checar('a fonte virou menu com contadores dentro',
  sinal.includes('id="pl5MenuFonte"') && sinal.includes('Fonte:'));
checar('"+ Nova conta" sobreviveu dentro do menu de fonte',
  sinal.includes('id="prosp2NovaConta"'));
checar('a ordenação diz "mais perto da rota" quando o modo é rota',
  sinal.includes("pl4ModoEfetivo === 'rota' ? 'mais perto da rota'"));

/* ── o que morreu tem de estar morto no arquivo, não escondido ───────────────────────── */
checar('o card "Compilar o dia" saiu do arquivo',
  /* a checagem é sobre MARCAÇÃO: o CSS órfão do card continua no arquivo de propósito — a
     poda automática que eu tentei picou texto de comentário (dividia por vírgula e recolava),
     e podar CSS com segurança precisa de parser de verdade, não de expressão regular. Fica
     anotado como dívida visível em vez de dano invisível. */
  !semComentario(html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')).includes('Completar o dia · contas-alvo do seu território'));
checar('o campo antigo com botão "Buscar aqui" saiu',
  !codigo.includes('id="prosp2LocGo"') && !codigo.includes('Buscar aqui'));
checar('a fileira de chips de fonte saiu',
  !codigo.includes('class="prosp2-fontes"'));
checar('o banner amarelo genérico saiu',
  !codigo.includes('Nada marcado para ${esc(pl4RotuloDoDia(rota.diaISO))} ainda'));

/* ── contadores do modo ativo (o recorte não pode ser maior que o conjunto) ──────────── */
checar('os contadores do sinal vêm do universo do modo ativo',
  html.includes('const nNovos = universoB.filter(') &&
  html.includes('const nComTelefone = universoB.filter(') &&
  html.includes('const nBem = universoB.filter('));

/* ── a fiação: o que ela pode e o que ela não pode tocar ────────────────────────────── */
const fiacao = html.slice(html.indexOf('A FIAÇÃO DA BUSCA v5'), html.indexOf('/* Por [data-v] e não por #prosp2Visoes'));
checar('digitar não chama o render da tela (a grade não muda enquanto se busca)',
  !/pl5Pintar[\s\S]*?renderProspeccaoExecutivo/.test(fiacao.slice(fiacao.indexOf('function pl5Pintar'), fiacao.indexOf('function pl5ItemDoIndice'))));
checar('mínimo de 2 caracteres antes de abrir', fiacao.includes('if (t.length < 2)'));
checar('250 ms de espera só para a parte que custa cota (geocodificação)',
  fiacao.includes('}, 250);') && fiacao.includes('geocodificarLocalAtuacao'));
checar('a resposta atrasada de uma busca antiga é descartada',
  (fiacao.match(/if \(pl5Busca\.texto !== t\) return;/g) || []).length >= 2);
checar('teclado: ↑↓ circulam pela lista', fiacao.includes("ev.key === 'ArrowDown'") && fiacao.includes('% total'));
checar('teclado: ↵ escolhe o destacado', fiacao.includes("ev.key === 'Enter'"));
checar('teclado: esc limpa o campo e fecha', fiacao.includes("ev.key === 'Escape'") && fiacao.includes("pl5Input.value = ''"));
checar('escolher guarda o modo anterior antes de virar "lugar"',
  fiacao.includes('prosp2Estado.ondeAntes =') && fiacao.includes("prosp2Estado.onde = 'lugar'"));
checar('escolher zera o lote (o lote é re-puxado, 10 melhores primeiro)',
  fiacao.includes('prosp2Estado.mostrar = PROSP2_LOTE'));
checar('o número de contas-alvo do endereço é calculado ANTES do clique',
  fiacao.includes('const n = (pl5Ctx.universo || []).filter'));
checar('vazio oferece três bairros clicáveis com contador',
  fiacao.includes('data-pl5-sug') && fiacao.includes('pl5PertoDaRota'));
checar('os ouvintes de documento têm guarda idempotente (não empilham a cada render)',
  fiacao.includes('if (!window.__pl5Globais)'));
checar('a tecla / não rouba a digitação de quem está num campo',
  fiacao.includes("a.tagName === 'INPUT'"));

console.log('');
if (falhas) { console.error(falhas + ' falha(s).'); process.exit(1); }
console.log('busca de lugar: todas as checagens ok.');
