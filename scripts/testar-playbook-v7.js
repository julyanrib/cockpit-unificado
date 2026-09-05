#!/usr/bin/env node
/* ============================================================================
   PLAYBOOK v7 — as regras que a prancha declara IMUTÁVEIS (02/09/26)
   ----------------------------------------------------------------------------
   A prancha tem uma seção chamada "As regras da gamificação (imutáveis na
   implementação)". Isto é ela, executável. O que este arquivo protege não é o
   desenho — é o CONTRATO: o dia em que alguém fizer "ler" pagar ponto outra vez, ou
   subir o teto de 2/dia, ou mexer numa faixa de nível, a suíte cai antes do deploy.

   E protege uma coisa que não é opinião: que o placeholder da busca prometa termos que
   EXISTEM. O mockup sugeria "meia zero" e "fila do sábado" — os dois devolvem zero
   páginas nas 43.773 palavras, e placeholder que promete busca vazia ensina em três
   segundos que a busca não funciona.
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(raiz, 'template', 'cockpit.template.html'), 'utf8');
const compilado = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'field-sales-playbook.compiled.json'), 'utf8'));
const provas = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'playbook-prova.json'), 'utf8'));

let ok = 0;
const falhas = [];
const checar = (nome, cond, detalhe) => { if (cond) { ok++; return; } falhas.push(nome + (detalhe ? ' — ' + detalhe : '')); };

/* ── 1. +10 SÓ COM PROVA. Ler não pontua. ────────────────────────────────────────── */
checar('não existe mais botão de "marcar como lida" (pontuar por abrir a página morreu)',
  !/playbookMarcarLido/.test(template) && !/v6-btn-lida/.test(template));
/* ESTA CHECAGEM EXIGIA QUE SÓ A PROVA ESCREVESSE PROGRESSO — a regra da v7, "ler não
   pontua". A v9 muda isso de propósito: a página tem CHECK (escreve leitura) e o QUIZ
   passou a ser do capítulo (escreve prova). O que não pode mudar é o fundo da regra:
   check sozinho NÃO dá patente. Então a checagem passa a medir isso — que é o que
   sustentava a v7 — em vez do formato antigo, que agora reprovaria o desenho novo. */
checar('o check escreve leitura, e é a porta única de progresso que grava',
  template.indexOf("playbookMarcarProgresso(id, 'leitura', true)") > -1);
checar('a patente NÃO sai do check: ela exige o quiz do capítulo',
  template.indexOf("provado: comCheck.length === doCapitulo.length && comProva.length === doCapitulo.length") > -1,
  'se a patente passar a sair só dos checks, ler volta a pontuar sozinho');
checar('e o quiz do capítulo é quem grava a prova de cada página',
  template.indexOf("await playbookMarcarProgresso(p.id, 'prova', true)") > -1);
checar('o crédito acontece SÓ quando a alternativa é a correta',
  /const certo = i === pagina\.prova\.correta;/.test(template) &&
  /if \(certo\) \{[\s\S]{0,200}?playbookMarcarProgresso\(pagina\.id, 'prova', true\)/.test(template));
checar('duas tentativas, e a segunda errada TRAVA',
  /} else if \(pb7Tentativas >= 2\) \{/.test(template) && /pb7Travado = true;/.test(template));
checar('a trava só solta com nova rolagem do artigo (não por tempo, não por recarregar)',
  /function pb7TravarAteRolar\(\) \{/.test(template) &&
  /if \(Math\.abs\(window\.scrollY - y0\) < window\.innerHeight \/ 2\) return;/.test(template));
checar('clique em alternativa é ignorado enquanto travado',
  /if \(pb7Travado \|\| pb7Provadas\(\)\.has\(pagina\.id\)\) return;/.test(template));
checar('a prova diz o "porque" no acerto (ela ensina, não só mede)',
  /esc\(q\.porque\)/.test(template));

/* ── 2. teto de 2/dia, mantido do sistema atual ──────────────────────────────────── */
checar('PBV6_LEITURAS_POR_DIA continua 2', /const PBV6_LEITURAS_POR_DIA = 2;/.test(template));
checar('PBV6_PTS_LEITURA continua 10', /const PBV6_PTS_LEITURA = 10;/.test(template));
checar('a tela mostra o estado de hoje, não só o regulamento',
  /hoje <b>' \+ hoje \+ ' de ' \+ PBV6_LEITURAS_POR_DIA/.test(template));
checar('acerto acima do teto não duplica ponto e DIZ isso',
  /o teto de \$\{PBV6_LEITURAS_POR_DIA\} páginas de hoje já fechou/.test(template));

/* ── 3. níveis por páginas provadas, nas faixas da prancha ───────────────────────── */
const faixas = template.match(/const PB7_NIVEIS = \[([\s\S]*?)\];/);
checar('PB7_NIVEIS existe', !!faixas);
if (faixas) {
  [['CALOURO', 0, 5], ['RUA', 6, 15], ['FECHADOR', 16, 25], ['TOP PERFORMER', 26, 30]].forEach(([n, a, b]) => {
    checar('faixa ' + n + ' = ' + a + '-' + b,
      new RegExp("nome: '" + n + "', min: " + a + ", max: " + b).test(faixas[1]));
  });
}
checar('o nível conta provadas E as lidas antes da prova existir (ninguém perde ponto ganho)',
  /function pb7TotalNoPlacar\(\)/.test(template) &&
  /pb7Provadas\(\)\.forEach\(x => s\.add\(x\)\);[\s\S]{0,80}?playbookLidos\(\)\.forEach\(x => s\.add\(x\)\);/.test(template));
checar('a tela distingue "provada" de "lida antes da prova"',
  /antes da prova existir/.test(template) && /function pb7LidasSemProva\(\)/.test(template));

/* ── 4. capítulo 100% = selo ─────────────────────────────────────────────────────── */
/* A v8 trocou a barra do capitulo pela CAPA da estante, e o selo passou a aparecer em
   dois lugares: o emoji na capa e a linha de estado. A checagem segue o RESULTADO (o
   texto que o capitulo completo mostra), nao a forma antiga em caixa alta. */
checar('a capa do capítulo completo mostra selo e a contagem provada',
  template.indexOf('selo ✓ · ') > 0 && template.indexOf('provadas') > 0
  && template.indexOf('pb8-capa-selo') > 0 && template.indexOf('🏅') > 0);
checar('a estante não tem mais fundo colorido por capítulo (cor é fio)',
  template.indexOf('.pb8-capa{') > 0
  && template.indexOf('border-top:3px solid var(--pb8-ac)') > 0
  && template.indexOf('.pb7-cap{') < 0);
checar('um capítulo aberto por vez, e a troca é no lugar (sem acordeão)',
  template.indexOf('pb8Aberto = cat;') > 0
  && template.indexOf('spread.innerHTML = pb8SpreadHTML(') > 0
  && template.indexOf('@keyframes pb8Entra') > 0);
checar('a troca de capítulo não passa por setTimeout (aba de fundo estrangula timer)',
  template.indexOf('.pb8-spread > *{animation:pb8Entra') > 0
  && template.indexOf("spread.classList.add('is-trocando')") < 0);
checar('a numeração dos capítulos é fixa, não reordenada pelo momento',
  template.indexOf('const PB8_ORDEM = ') > 0
  && template.indexOf('function pb8NumeroDe(') > 0);
const ordemCapitulos = ['Comece aqui', 'Produto e mercado', 'Venda na rua', 'Converter e fechar',
  'Processos internos', 'Carteira e retenção', 'Desenvolvimento', 'Liderança'];
checar('a trilha dos capítulos segue aprender → vender → operar → reter → desenvolver',
  JSON.stringify(compilado.categorias) === JSON.stringify(ordemCapitulos)
  && template.indexOf("const PB8_ORDEM = ['Comece aqui', 'Produto e mercado', 'Venda na rua', 'Converter e fechar',") > 0);
const ordemPaginas = [
  'excelencia', 'onboarding', 'metas-cadencia', 'rotina-executivo',
  'ecossistema-takeat', 'catalogo-solucoes', 'concorrencia', 'dark-kitchen', 'rota-inteligente',
  'conciliacao-ofx', 'multilojas', 'equipamentos', 'displays-comandas',
  'prospeccao-inteligente', 'prospeccao-porta-a-porta', 'acesso-decisor', 'follow-up', 'rua-whatsapp',
  'mapa-dor-solucao', 'objecoes', 'fechamento', 'clientes-mrr',
  'pipeline', 'dados-cadastro', 'faq', 'links-uteis', 'relacionamento', 'evitar-churn',
  'plano-carreira', 'rotina-gestor'
];
checar('as páginas seguem a ordem pedagógica e planejar vem antes de bater na porta',
  JSON.stringify(compilado.paginas.map(p => p.id)) === JSON.stringify(ordemPaginas));
checar('o filtro de formato esmaece em vez de esconder',
  template.indexOf("pg.classList.toggle('is-fora'") > 0
  && template.indexOf('.pb8-pg.is-fora{opacity:.3;}') > 0);
checar('o selo é declarado como coisa do placar do time', /selo conta no placar do time|selo aparece no placar do time/.test(template));

/* ── 5. "mais usadas" só com uso REAL ────────────────────────────────────────────── */
checar('o quadro vem do agregado do Supabase, não de lista curada',
  /supa\.rpc\('playbook_mais_copiadas', \{ dias: 7 \}\)/.test(template));
checar('não existe lista editorial de "mais usadas" no código',
  !/MAIS_USADAS|DESTAQUES_PLAYBOOK/.test(template));
checar('a cópia é registrada em playbook_copias', /supa\.from\('playbook_copias'\)\.insert/.test(template));
checar('só conta a cópia que é fala pronta (nota explicativa copia e não conta)',
  /if \(pb7EhFalaPronta\(texto\)\) pb7RegistrarCopia\(pagina\.id\);/.test(template) &&
  /function pb7EhFalaPronta\(texto\) \{/.test(template));
checar('quadro vazio DIZ por que está vazio, em vez de sumir',
  /ninguém copiou script nesta semana ainda/.test(template));

/* ── 6. a trilha sai do funil, com mapeamento determinístico e documentado ───────── */
const mapa = template.match(/const PB7_FUNIL_PARA_PAGINA = \[([\s\S]*?)\n\];/);
checar('PB7_FUNIL_PARA_PAGINA existe', !!mapa);
if (mapa) {
  const paginas = (mapa[1].match(/pagina: '([a-z0-9-]+)'/g) || []).map(x => x.replace(/pagina: '|'/g, ''));
  checar('o mapeamento tem 5 sintomas', paginas.length === 5, 'achado ' + paginas.length);
  const ids = new Set(compilado.paginas.map(p => p.id));
  const fantasmas = paginas.filter(x => !ids.has(x));
  checar('toda página do mapeamento existe no playbook', !fantasmas.length, fantasmas.join(','));
  checar('"sem próximo passo" é o primeiro sintoma (é o vazamento medido do time)',
    /\{ id: 'sem-passo', pagina: 'follow-up'/.test(mapa[1]));
  checar('o desempate é declarado (ordem do funil), não implícito',
    /ordem de desempate|ordem do funil/.test(template));
}
checar('a trilha usa sessaoAtual.ownerId, o mesmo acessor do Meu Funil',
  /const meu = sessaoAtual \? sessaoAtual\.ownerId : null;/.test(template) &&
  !/String\(DATA\.ownerId\)/.test(template));
checar('as dailies carregam antes de medir o funil (senão tudo parece descoberto)',
  /if \(typeof carregarDailies === 'function'[\s\S]{0,220}?playbookTelaAtual === 'inicio'/.test(template));
checar('a ponte do trilho reaproveita irParaMeuFunilVisao, sem atalho novo',
  /irParaMeuFunilVisao\('sem-passo'\)/.test(template));

/* ── 7. formato e tempo em TODA página ───────────────────────────────────────────── */
const FORMATOS = ['SCRIPT', 'MÉTODO', 'ESTUDO', 'CHECKLIST'];
const semFormato = compilado.paginas.filter(p => FORMATOS.indexOf(p.formato) < 0);
checar('as 30 páginas têm um dos 4 formatos', !semFormato.length, semFormato.map(p => p.id).join(','));
const semProva = compilado.paginas.filter(p => !p.prova || !p.prova.pergunta || (p.prova.alternativas || []).length !== 3);
checar('as 30 páginas têm prova de 1 pergunta e 3 alternativas', !semProva.length, semProva.map(p => p.id).join(','));
checar('o compilado tem as 30 páginas', compilado.paginas.length === 30, 'achado ' + compilado.paginas.length);
checar('a linha da biblioteca mostra formato e tempo', /class="pb7-fmt">\$\{esc\(p\.formato\)\}<\/i> · \$\{playbookMinutos\(p\)\} min/.test(template));

/* Nenhuma resposta certa pode estar sempre na mesma posição: se estivesse, a prova
   inteira se responde com "sempre B" e o quiz vira teatro. */
const posicoes = { 0: 0, 1: 0, 2: 0 };
Object.values(provas).forEach(v => { if (v && v.prova && Number.isInteger(v.prova.correta)) posicoes[v.prova.correta]++; });
checar('as respostas certas se espalham nas 3 posições',
  posicoes[0] > 2 && posicoes[1] > 2 && posicoes[2] > 2,
  'A=' + posicoes[0] + ' B=' + posicoes[1] + ' C=' + posicoes[2]);

/* ── 8. a busca é full-text e os exemplos do placeholder EXISTEM ─────────────────── */
checar('a busca varre o campo `busca` (texto inteiro), não só o título',
  /playbookNormalizar\(\(p\.busca \|\| ''\) \+ ' ' \+ p\.titulo \+ ' ' \+ p\.resumo\)/.test(template));
const ph = template.match(/placeholder="buscar em tudo — ([^"]*(?:&quot;[^"]*)*)"/);
checar('o placeholder da busca existe', !!ph);
if (ph) {
  const termos = [...ph[1].matchAll(/&quot;([^&]+)&quot;/g)].map(m => m[1]);
  checar('o placeholder sugere pelo menos 3 termos', termos.length >= 3, 'achado ' + termos.length);
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const vazios = termos.filter(t => !compilado.paginas.some(p =>
    norm((p.busca || '') + ' ' + p.titulo + ' ' + p.resumo).indexOf(norm(t)) >= 0));
  checar('TODO termo do placeholder devolve página (o mockup sugeria dois que não existem)',
    !vazios.length, 'sem resultado: ' + vazios.join(', '));
}

/* ── 9. o que a prancha manda MORRER ────────────────────────────────────────────── */
checar('os 30 cards idênticos morreram (pbv6CartaoPaginaHTML deletado, não escondido)',
  !/pbv6CartaoPaginaHTML/.test(template));
checar('as prateleiras da v6 morreram', !/pbv6PrateleirasHTML/.test(template));
checar('o CSS órfão .v6-* saiu junto', !/\.v6-hero|\.v6-trilha|\.v6-leitor|\.v6-prateleira/.test(template));
checar('as variáveis de tipografia --v6-* FICARAM (a v7 reaproveita o artigo)',
  /--v6-corpo:/.test(template) && /\.pba\{font-size:13px/.test(template));

/* ── 10. o trilho, e a ordem que a prancha pede no celular ──────────────────────── */
checar('"LEVE PRA RUA" sai da própria página, não é inventado',
  /function pb7LevePraRua\(pagina\)/.test(template) && /o que fazer agora/i.test(template));
checar('a seção movida sai do corpo (nada dito duas vezes na mesma tela)',
  /return \{ bullets, html: html\.slice\(0, inicio\) \+ html\.slice\(fim\) \};/.test(template));
checar('sem bullets reconhecíveis, a seção FICA no corpo',
  /if \(!bullets\.length\) return \{ bullets: \[\], html \};/.test(template));
checar('no celular a ordem é quiz e depois "leve pra rua"',
  /\.pb7-prova\{order:1;\}[\s\S]{0,120}?\.pb7-rail-bloco\{order:2;\}/.test(template));
/* A v8 fechou a coluna em 640px (medida de revista da prancha nova) e subiu o corpo de
   13px para 15.5px, que era o defeito real: o critério de aceite dela é nada de corpo
   abaixo de 15px. A checagem passa a guardar os dois. */
checar('a coluna de leitura tem a medida de revista (640px) e corpo acima de 15px',
  template.indexOf('.pb7-artigo{max-width:640px') > 0
  && template.indexOf('.pba{font-size:15.5px') > 0);
checar('nenhuma tabela sobrevive: virou card com rótulo do cabeçalho',
  template.indexOf('pb8-cards') > 0 && template.indexOf('pb8-campo-rot') > 0
  && template.indexOf('.pba table{') < 0);
checar('o script continua bloco escuro copiável, e o campo variável fica âmbar',
  template.indexOf('.pba .fa-body .pb8-var{color:#F2B84B') > 0);
checar('a paleta da leitura alcança o shell do leitor',
  template.indexOf('.pbv6,.pb7-lendo{') > 0);
checar('o scrollspy casa pelo atributo que o markup gera, não por id inexistente',
  template.indexOf("querySelectorAll('.pb7-toc-sec [data-pb-anchor]')") > 0
  /* Checa o USO em codigo, nao a mencao: o comentario que documenta o defeito cita o id
     morto, e a primeira versao desta linha acusou a propria explicacao. */
  && template.indexOf('querySelectorAll(' + String.fromCharCode(39,35) + 'playbookToc') < 0);

/* ── 11. o alvo de copiar script está no piso ───────────────────────────────────── */
checar('o botão copiar script está no piso de 38px',
  /\.pba \.fa-copy\{[^}]*min-height:38px/.test(template));
checar('e vai a 44px no toque, com a regra DEPOIS da base (ordem de origem)',
  /@media \(max-width:760px\)\{ \.pba \.fa-copy\{min-height:44px;\} \}/.test(template));

/* ── resultado ──────────────────────────────────────────────────────────────────── */
/* ══ PLAYBOOK v9 — A BIBLIOTECA COM TRILHA DE PATENTES (04/09/26) ═══════════════════════
   Handoff do Julyan (prompt v9 + mockup). O que estas checagens prendem é o que a tela
   promete e não dá para ver num print: que os capítulos são os do DADO, que o cadeado é da
   patente e nunca do conteúdo, e que existe UM lugar contando o progresso. */
(function () {
  const rota = fs.readFileSync(path.join(raiz, 'api', 'dados.js'), 'utf8');
  const preview = fs.readFileSync(path.join(raiz, 'scripts', 'preview-local.js'), 'utf8');

  /* 1. OS CAPÍTULOS SÃO AS CATEGORIAS DO JSON — não uma lista paralela que envelhece
     sozinha quando o conteúdo é recategorizado. */
  const cats = compilado.categorias || [];
  checar('a trilha tem um capítulo para cada categoria do conteúdo',
    cats.every(function (c) { return template.indexOf("rot: '" + c + "'") > -1; }),
    'faltou: ' + cats.filter(function (c) { return template.indexOf("rot: '" + c + "'") < 0; }).join(', '));
  checar('e nenhum capítulo inventado além deles',
    (template.match(/rot: '[^']+',\s+accent:/g) || []).length === cats.length);

  /* 2. LIDERANÇA É DO GESTOR, E O CORTE É NO SERVIDOR. Cortar na tela deixaria o conteúdo
     viajando na resposta — papel se corta onde o resto do app corta. */
  checar('a rota corta o capítulo de gestor para executivo',
    rota.indexOf("const CAPITULO_DE_GESTOR = 'Liderança';") > -1
    && rota.indexOf('p.categoria !== CAPITULO_DE_GESTOR') > -1);
  checar('e o gestor continua recebendo tudo',
    rota.indexOf("if (ehGestor) return res.status(200).json({ ok: true, playbook: PLAYBOOK") > -1);
  /* O PREVIEW TEM DE MENTIR MENOS: era nele que eu ia conferir o corte, e ele injetava o
     playbook inteiro — preview que mostra o que produção esconde é pior que preview nenhum. */
  checar('o preview aplica o mesmo corte da rota',
    preview.indexOf("const CAPITULO_DE_GESTOR = 'Liderança';") > -1
    && preview.indexOf('JSON.stringify(playbookDoPapel())') > -1);
  /* O nome do capítulo está escrito em três arquivos porque são três processos. Se ele for
     renomeado no conteúdo, esta checagem cai — que é exatamente o que tem de acontecer. */
  checar('o nome do capítulo de gestor existe no conteúdo',
    cats.indexOf('Liderança') > -1,
    'renomearam a categoria: o corte da rota e do preview passa a não casar com nada');

  /* 3. A COROA FICA NO ÚLTIMO CAPÍTULO DE QUEM OLHA (Julyan: "quero sim q ele se torne
     elite"). Fixar Elite no capítulo 8 daria ao executivo um teto que ele nunca alcança. */
  checar('a coroa é do último capítulo da trilha de quem olha',
    template.indexOf("capitulos[capitulos.length - 1].patente = 'Elite'") > -1);

  /* 4. UM LUGAR CONTA. Biblioteca e Leitura mostram o mesmo 3/5 porque leem pb9Trilha. */
  checar('existe uma função só que monta a trilha', template.indexOf('function pb9Trilha(') > -1);
  checar('e a próxima página sai dela, não de cada tela',
    template.indexOf('function pb9Proxima(trilha)') > -1);

  /* 5. O CADEADO É DA PATENTE, NUNCA DO CONTEÚDO — é a regra que o prompt repete três
     vezes. Na prática: toda capa é clicável e todo item abre a leitura. */
  checar('a legenda diz que a leitura continua livre',
    template.indexOf('As páginas continuam abertas pra consulta') > -1);
  checar('não existe capa desabilitada por patente',
    template.indexOf('class="pb9-capa') > -1
    && template.indexOf('pb9-capa" disabled') < 0 && template.indexOf("pb9-capa' disabled") < 0);

  /* 6. O QUIZ DO CAPÍTULO SÃO AS PERGUNTAS DAS PÁGINAS DELE. O prompt pedia "5 perguntas" e
     esse conjunto não existe: cada página tem UMA e os capítulos vão de 1 a 9 páginas.
     Inventar quatro perguntas para fechar cinco seria conteúdo que ninguém escreveu. */
  checar('toda página tem a pergunta que o quiz do capítulo usa',
    compilado.paginas.every(function (p) { return p.prova && p.prova.pergunta; }),
    'páginas sem prova: ' + compilado.paginas.filter(function (p) { return !(p.prova && p.prova.pergunta); }).length);
  checar('o quiz só abre com todos os checks do capítulo',
    template.indexOf('function pb9QuizAberto(cap) {') > -1
    && template.indexOf('return !!(cap && cap.completo);') > -1);

  /* 7. O NÚMERO VIVO NÃO PODE SER CHUTE: o resumo do capítulo cita "os seus N sem próximo
     passo", e esse N vem da mesma conta do Meu Funil. Eu tinha lido um campo `.semPasso`
     que não existe — pb7EstadoDoFunil devolve uma LISTA — e a tela teria dito "undefined". */
  checar('o resumo conta os sem passo a partir da lista real do funil',
    template.indexOf("estado.filter(function (x) { return !x.passo; }).length") > -1);
})();

/* ══ PLAYBOOK v9 — A LEITURA E O QUIZ DO CAPÍTULO (04/09/26) ════════════════════════════
   As duas peças vieram juntas por necessidade: a v9 troca a prova DA PÁGINA por um check e
   move o quiz para o CAPÍTULO. Entregar só o check congelaria a trilha em zero patente e o
   gestor pararia de receber prova de leitura. */
(function () {
  /* 1. O CHECK FICA NO FIM DO ARTIGO. Dar check antes de ler seria o botão que a v7 tirou
     depois de medir 21 páginas "lidas" em dez dias. */
  checar('o check existe e é do fim da página', template.indexOf('function pb9CheckHTML(') > -1);
  const iArt = template.indexOf("+     '<div class=\"pba\" id=\"playbookArtigo\">'");
  /* A DEFINICAO CONTEM A MESMA ASSINATURA da chamada: procurar o nome cru acha a funcao,
     nao o uso. Foi assim que esta checagem reprovou o codigo certo. */
  const iCheck = template.indexOf("+     pb9CheckHTML(pagina, cap, jaTem)");
  checar('e ele vem DEPOIS do corpo do artigo, não antes',
    iArt > -1 && iCheck > iArt, 'artigo em ' + iArt + ', check em ' + iCheck);

  /* 2. O CHECK NÃO REDESENHA O LEITOR: quem acabou de ler não pode voltar ao topo do texto
     que terminou. O card se troca no lugar. */
  checar('o check troca o card no lugar em vez de remontar a tela',
    template.indexOf("caixa.outerHTML = pb9CheckHTML(pagina, cap2, true)") > -1);

  /* 3. O QUIZ SÃO AS PERGUNTAS DAS PÁGINAS DO CAPÍTULO, e 80% arredonda PARA CIMA — em 5
     perguntas são 4, e não 4 vírgula alguma coisa. */
  checar('o quiz monta uma pergunta por página do capítulo',
    template.indexOf('function pb9QuizHTML(cap)') > -1
    && template.indexOf('cap.paginas.map(function (p, i)') > -1);
  checar('o mínimo é 80% arredondado para cima',
    template.indexOf('return Math.ceil(cap.total * 0.8);') > -1);
  /* O PORQUÊ APARECE PARA QUEM ERROU: a prova ensina, e quem errou é justamente quem
     precisa da frase. */
  checar('a correção mostra o porquê de cada pergunta',
    template.indexOf('pb9QuizCorrigido && q.porque') > -1);

  /* 4. APROVAR GRAVA `prova` PARA CADA PÁGINA — mesma tabela, sem schema novo, e o placar
     do gestor (que conta provas) continua funcionando sem tocar em nada. */
  checar('aprovar o quiz grava a prova de cada página do capítulo',
    template.indexOf("await playbookMarcarProgresso(p.id, 'prova', true);") > -1);
  checar('e só grava quando passou do mínimo',
    template.indexOf('if (acertos < pb9QuizMinimo(cap)) return false;') > -1);

  /* 5. O QUIZ NÃO É UMA QUARTA TELA: ele toma o lugar do conteúdo da Biblioteca. Rota nova
     só para responder N perguntas seria mais um estado para o histórico entender. */
  checar('o quiz mora dentro da Biblioteca', template.indexOf('if (pb9QuizCap) {') > -1);

  /* 6. O QUE EU NÃO INVENTEI: o mockup mostra "atualizada ago/26 · testada na rua por Ramon
     e Iago" no kicker. Nem a data nem a autoria existem no JSON — inventar nome de colega
     numa tela de treinamento destrói a confiança na tela inteira quando alguém percebe. */
  const temAutoria = compilado.paginas.some(function (p) { return p.testadaPor || p.atualizadaEm; });
  checar('o conteúdo não tem autoria nem data de revisão por página', !temAutoria,
    'passou a ter: o kicker pode mostrar de verdade em vez de omitir');
  checar('e o kicker não inventa nenhuma das duas',
    template.indexOf('testada na rua por') < 0 || template.indexOf('testada na rua por') > template.indexOf('O QUE EU NÃO INVENTEI'));

  /* 7. O NÚMERO DO RAIL É VIVO OU NÃO EXISTE: "use hoje na rua" some quando o funil não
     tem nada, em vez de mostrar zero e ensinar o time a duvidar da tela. */
  checar('o card do funil só aparece quando há número',
    template.indexOf('const rua = (semPasso || estourados)') > -1);
})();

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
/* ══ O `versao` TEM QUE SER HASH DA SAIDA, NAO DAS ENTRADAS ═════════════════════════
   MEDIDO em 03/09/26: dos 31 commits do robo entre 01 e 03/09, NOVE mudaram um arquivo
   so (data/field-sales-playbook.compiled.json) e nesses nove o conteudo era identico —
   698008 bytes -> 698008 bytes, 43773 palavras -> 43773 palavras, tudo igual menos o
   campo `versao`. Nove builds de producao da Vercel para entregar os mesmos bytes com
   outro hash no cabecalho, numa conta que estourou duas vezes em dois dias.

   A causa era o hash ser calculado sobre as ENTRADAS cruas (o markdown como esta no
   disco). Qualquer variacao que a conversao para HTML normaliza depois mudava o hash sem
   mudar uma letra da saida — e o robo commitava, e a Vercel buildava.

   Esta assercao NAO olha a implementacao: ela recalcula o hash a partir da saida e exige
   que bata. Se o `versao` voltar a depender de qualquer coisa que nao esteja na saida,
   ela falha — que e a unica forma de este desperdicio nao voltar em silencio. */
const versaoEsperada = require('crypto').createHash('sha256').update(JSON.stringify({
  titulo: compilado.titulo,
  fonte: compilado.fonte,
  paginas: compilado.paginas,
  categorias: compilado.categorias,
  palavras: compilado.palavras
})).digest('hex').slice(0, 12);
checar('o versao do playbook e o hash da SAIDA — saida igual nao gera commit nem build',
  compilado.versao === versaoEsperada,
  'versao no arquivo ' + compilado.versao + ', hash da saida ' + versaoEsperada
    + ' — se divergem, o versao voltou a depender das entradas e o robo vai commitar por nada');
console.log('playbook v7: ' + ok + ' checagens ok — prova, teto, níveis, selo, uso real, trilha do funil e busca.');
