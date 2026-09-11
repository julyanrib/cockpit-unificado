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

/* ── 1. +10 SÓ COM PROVA. Ler não pontua. ──────────────────────────────────────────

   ══ ONZE CHECAGENS SAÍRAM DAQUI EM 04/09/26 ═══════════════════════════════════
   Elas prendiam a prova de 1 pergunta (duas tentativas, trava por rolagem), o teto de
   pontos por dia, o painel "as mais usadas na rua" e a ponte do trilho — mecânicas que
   a Leitura v9 substituiu: a página tem CHECK e o capítulo tem QUIZ.
   O QUE ELAS PROTEGIAM CONTINUA TRAVADO, em outro lugar: "crédito só com a resposta
   certa" virou "o quiz só grava a prova quando acertos >= mínimo", e "ler não pontua
   sozinho" virou "a patente exige o quiz". As duas estão no bloco da v9, abaixo.
   Guarda que trava feature removida reprova o estado que o dono pediu. */

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
checar('a prova diz o "porque" no acerto (ela ensina, não só mede)',
  /esc\(q\.porque\)/.test(template));

/* ── 2. teto de 2/dia, mantido do sistema atual ──────────────────────────────────── */
checar('PBV6_LEITURAS_POR_DIA continua 2', /const PBV6_LEITURAS_POR_DIA = 2;/.test(template));
checar('PBV6_PTS_LEITURA continua 10', /const PBV6_PTS_LEITURA = 10;/.test(template));
checar('a tela mostra o estado de hoje, não só o regulamento',
  /hoje <b>' \+ hoje \+ ' de ' \+ PBV6_LEITURAS_POR_DIA/.test(template));

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
/* A ORDEM DOS CAPITULOS VIVIA EM TRES LUGARES e esta checagem prendia dois deles por
   literal. Ela pegou o capitulo novo pela metade — eu tinha atualizado o conteudo e a
   trilha e esquecido a estante da busca. Agora PB8_ORDEM DERIVA de PB9_CAPITULOS, entao
   a checagem mede o que importa: que a ordem do CONTEUDO e a ordem da TRILHA sao a mesma,
   e que ninguem voltou a escrever a lista a mao. */
/* SO O BLOCO DA TRILHA: a chave rot aparece em dezenas de estruturas do arquivo, e medir o
   arquivo inteiro trouxe 90 rotulos de outras telas. */
const iTrilha = template.indexOf('const PB9_CAPITULOS = [');
const blocoTrilha = iTrilha > -1 ? template.slice(iTrilha, template.indexOf('];', iTrilha)) : '';
const ordemNaTrilha = (blocoTrilha.match(/rot: '[^']+'/g) || []).map(function (m) { return m.slice(6, -1); });
checar('a ordem dos capitulos do conteudo e a da trilha sao a mesma',
  JSON.stringify(compilado.categorias) === JSON.stringify(ordemNaTrilha),
  'conteudo: ' + compilado.categorias.join(' > ') + '  |  trilha: ' + ordemNaTrilha.join(' > '));
checar('a estante da busca deriva da trilha, em vez de repetir a lista',
  template.indexOf("const PB8_ORDEM = PB9_CAPITULOS.map(function (c) { return c.rot; });") > -1);
/* A ORDEM MUDOU EM 05/09/26, E O MOTIVO ESTA MEDIDO: com a trava valendo, "Venda na rua"
   so abria depois de 13 paginas, 92 minutos e 2 quizzes — e o executivo esta na calcada no
   dia 2. "Produto e mercado" tem 9 paginas e 71 minutos, 36% do playbook: ele e o capitulo
   de fundo, nao o de entrada. A rua subiu para o 2o degrau e o produto foi para o 4o.
   NENHUMA PAGINA TROCOU DE CAPITULO — so a ordem dos blocos. E a lista continua fixa aqui
   de proposito: e ela que impede a ordem de mudar sem alguem decidir que mudou. */
const ordemPaginas = [
  'excelencia', 'onboarding', 'metas-cadencia', 'rotina-executivo',
  'prospeccao-inteligente', 'prospeccao-porta-a-porta', 'acesso-decisor', 'follow-up', 'rua-whatsapp',
  'mapa-dor-solucao', 'objecoes', 'fechamento', 'clientes-mrr',
  'ecossistema-takeat', 'catalogo-solucoes', 'concorrencia', 'dark-kitchen', 'rota-inteligente',
  'conciliacao-ofx', 'multilojas', 'equipamentos', 'displays-comandas',
  'pipeline', 'dados-cadastro', 'faq', 'links-uteis', 'relacionamento', 'evitar-churn',
  'plano-carreira', 'rotina-gestor'
];
checar('as páginas seguem a ordem da trilha, e a rua vem antes do catálogo de produto',
  JSON.stringify(compilado.paginas.map(p => p.id)) === JSON.stringify(ordemPaginas),
  'ordem no arquivo: ' + compilado.paginas.map(p => p.id).slice(0, 8).join(' > '));
/* O NUMERO DA PAGINA SOBE ENQUANTO SE LE: se o conteudo e a trilha discordassem, a estante
   diria "capitulo 2" e as paginas dele seriam 14 a 18. */
(function () {
  const cats = compilado.paginas.map(p => p.categoria);
  let trocas = 0;
  const vistas = [];
  cats.forEach(function (c) { if (vistas.indexOf(c) < 0) vistas.push(c); });
  cats.forEach(function (c, i) { if (i && c !== cats[i - 1] && vistas.indexOf(c) < vistas.indexOf(cats[i - 1])) trocas++; });
  checar('as páginas de um capítulo ficam juntas, em bloco',
    trocas === 0, trocas + ' ida(s) e volta(s) entre capítulos na lista de páginas');
})();
checar('o filtro de formato esmaece em vez de esconder',
  template.indexOf("pg.classList.toggle('is-fora'") > 0
  && template.indexOf('.pb8-pg.is-fora{opacity:.3;}') > 0);
checar('o selo é declarado como coisa do placar do time', /selo conta no placar do time|selo aparece no placar do time/.test(template));

/* ── 5. "mais usadas" só com uso REAL ────────────────────────────────────────────── */
checar('não existe lista editorial de "mais usadas" no código',
  !/MAIS_USADAS|DESTAQUES_PLAYBOOK/.test(template));

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
/* A v8 fechou a coluna em 640px (medida de revista da prancha nova) e subiu o corpo de
   13px para 15.5px, que era o defeito real: o critério de aceite dela é nada de corpo
   abaixo de 15px. A checagem passa a guardar os dois. */
/* A ÂNCORA ESTAVA NUMA CLASSE MORTA (11/09/26). A checagem media `.pb7-artigo`, a coluna
   do leitor v7 — e o leitor v7 não existe mais: o artigo é desenhado por `.pb9-art-col`
   desde a v9, e `.pb7-artigo` não era aplicada a markup nenhum. A regra continuava no CSS,
   a checagem continuava verde, e nenhuma das duas tinha efeito sobre a tela.
   O 640px de verdade está em `.pb9-art-col`, que é o que a coluna do leitor usa hoje. */
checar('a coluna de leitura tem a medida de revista (640px) e corpo acima de 15px',
  template.indexOf('.pb9-art-col{max-width:640px') > 0
  && template.indexOf('class="pb9-art-col"') > 0
  && template.indexOf('.pba{font-size:15.5px') > 0);
checar('nenhuma tabela sobrevive: virou card com rótulo do cabeçalho',
  template.indexOf('pb8-cards') > 0 && template.indexOf('pb8-campo-rot') > 0
  && template.indexOf('.pba table{') < 0);
checar('o script continua bloco escuro copiável, e o campo variável fica âmbar',
  template.indexOf('.pba .fa-body .pb8-var{color:#F2B84B') > 0);
checar('a paleta da leitura alcança o shell do leitor',
  /* O SELETOR MUDOU com a retirada do v7: .pbv6 e .pb7-lendo deixaram de existir e a
     paleta ficou declarada em classe que nenhum markup gera — o corpo do artigo usa
     essas variaveis em 41 lugares e cairia em var() invalido. Agora e o leitor v9. */
  template.indexOf('.pb9-ler{') > 0);
checar('o scrollspy casa pelo atributo que o markup gera, não por id inexistente',
  /* .pb9-toc-sec: a Leitura v9 renomeou o sumario e o spy ficou apontando para a classe
     velha — as ancoras nunca acendiam. TERCEIRA vez que este mesmo spy aponta para
     markup que nao existe. */
  template.indexOf("querySelectorAll('.pb9-toc-sec [data-pb-anchor]')") > 0
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
  /* A LEGENDA É ONDE A REGRA SE ENSINA, então ela é medida pelas duas metades da regra e
     não pela frase inteira: "dá para ler" e "o que espera é o crédito". Assim reescrever a
     frase não reprova, mas apagar qualquer uma das duas metades reprova. */
  checar('a legenda diz que a leitura continua livre',
    /as páginas se leem à vontade|páginas continuam abertas/.test(template),
    'sem isso o executivo lê o cadeado como "esse conteúdo não é para você"');
  checar('a legenda diz que o que espera a vez é o crédito, não o texto',
    /espera a sua vez é o check/.test(template));
  checar('a legenda explica o capítulo de consulta',
    /📖 = capítulo de consulta/.test(template));
  checar('não existe capa desabilitada por patente',
    template.indexOf('class="pb9-capa') > -1
    && template.indexOf('pb9-capa" disabled') < 0 && template.indexOf("pb9-capa' disabled") < 0);

  /* 6. O QUIZ DO CAPÍTULO SÃO AS PERGUNTAS DAS PÁGINAS DELE. O prompt pedia "5 perguntas" e
     esse conjunto não existe: cada página tem UMA e os capítulos vão de 1 a 9 páginas.
     Inventar quatro perguntas para fechar cinco seria conteúdo que ninguém escreveu. */
  checar('toda página tem a pergunta que o quiz do capítulo usa',
    compilado.paginas.every(function (p) { return p.prova && p.prova.pergunta; }),
    'páginas sem prova: ' + compilado.paginas.filter(function (p) { return !(p.prova && p.prova.pergunta); }).length);
  checar('o quiz só abre com todos os checks do capítulo E com o degrau liberado',
    template.indexOf('function pb9QuizAberto(cap) {') > -1
    && template.indexOf('return !!(cap && cap.completo && cap.liberado !== false);') > -1,
    'o quiz é o que dá a patente, então ele é o degrau: sem o liberado aqui, dava para provar'
      + ' um capítulo fora de ordem entrando nele pela busca');

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

/* ══ O PAR MESA/FOLLOW-UP E O REEQUILÍBRIO DOS CAPÍTULOS (04/09/26) ═════════════════════
   Julyan: "faz as duas, o par mesa/follow-up e o reequilíbrio dos capítulos, mas sendo
   coerente em todos os topicos para nao misturar nada q nao faça sentido". */
(function () {
  const mapa = compilado.paginas.find(function (p) { return p.id === 'mapa-dor-solucao'; });
  const obj = compilado.paginas.find(function (p) { return p.id === 'objecoes'; });
  const fech = compilado.paginas.find(function (p) { return p.id === 'fechamento'; });

  /* O PAR: a frase da mesa vem ANTES da do follow-up, porque é o que acontece antes. */
  checar('as 6 dores têm a frase da mesa', (mapa.html.match(/Na mesa\./g) || []).length === 6);
  checar('e as 6 têm o follow-up rotulado como depois da visita',
    (mapa.html.match(/No follow-up, depois da visita/g) || []).length === 6);
  checar('o rótulo "No WhatsApp" não voltou como se fosse alternativa à visita',
    mapa.html.indexOf('No WhatsApp.') < 0);
  checar('a frase da mesa vem antes da do follow-up em cada dor',
    mapa.html.indexOf('Na mesa.') < mapa.html.indexOf('No follow-up'));

  /* AS 5 OBJEÇÕES ganham o follow-up, e a REGRA vem antes das frases: ele compra a próxima
     presença, nunca rediscute por texto. Sem a regra, cinco frases prontas de WhatsApp numa
     página de mesa ensinam o contrário do que a página inteira defende. */
  checar('as 5 objeções têm o follow-up',
    (obj.html.match(/No follow-up, depois da visita/g) || []).length === 5);
  checar('e a regra que impede o follow-up de virar discussão por texto vem antes',
    obj.html.indexOf('comprar a próxima presença') > -1
    && obj.html.indexOf('comprar a próxima presença') < obj.html.indexOf('No follow-up'));

  /* NO FECHAMENTO NÃO ENTRA PAR, de propósito: a página existe para dizer que o pagamento
     acontece na mesa, e "se ele não pagou, mande mensagem" licenciaria o contrário. */
  checar('a página de fechamento continua sem follow-up de WhatsApp',
    fech.html.indexOf('No follow-up') < 0,
    'a doutrina dela é que o pagamento acontece na mesa — o par ali inverteria o ensino');

  /* O REEQUILÍBRIO DOS CAPÍTULOS FOI REVERTIDO A PEDIDO DO JULYAN (04/09/26):
     "nesses modulos que viram receitas, a gente tem tanta coisa pra limitar só naquilo...
     eu preciso que fale tudo, o executivo precisa saber tudo que a takeat tem, não quero
     mais reorganizar, prefiro do jeito que estava antes".
     Eu tinha separado quatro módulos num capítulo próprio para desempatar 9 páginas contra
     1. O nome do capítulo dava a entender que o produto se resume àqueles quatro — e o
     conhecimento de produto é justamente o que ele NÃO quer limitar.
     AS CHECAGENS QUE PRENDIAM AQUELA DIVISÃO SAÍRAM daqui: guarda que trava uma decisão
     revertida reprova o estado que o dono pediu. Fica registrado que a distribuição
     desigual (9 e 1) é ESCOLHA, não descuido — para ninguém "consertar" de novo. */
  checar("Produto e mercado continua inteiro, sem capítulo separado de módulos",
    compilado.categorias.indexOf("Módulos que viram receita") < 0);
})();

/* ══ A TRAVA SAIU DAQUI EM 05/09/26, E ISSO ERA UM DEFEITO DA SUITE ════════════════
   Ela ficava AQUI, no meio do arquivo, com 26 linhas de checagem depois dela — inclusive
   a do hash do `versao`, que existe para nao estourar a cota de deploy. Checagem depois
   do process.exit(1) nunca reprova nada: sabotei o hash de proposito e a suite terminou
   verde. Agora a trava e a ULTIMA coisa do arquivo, e toda checagem nova cai dentro dela
   por construcao. */

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

/* ══ O LINK EXTERNO E A ESTRUTURA DE TITULOS (05/09/26) ═════════════════════════════
   As quatro coisas abaixo eu quebrei ou achei quebradas nesta auditoria, e nenhuma delas
   aparece em medicao de geometria — as seis medicoes de sempre estavam verdes. */

/* 1. AUTOLINK. O compilador nao conhecia <https://...>: o esc() virava &lt;...&gt; e o
      executivo LIA a URL como texto morto. Nove URLs, TODAS na pagina de Links uteis,
      cuja propria tese e "link que voce nao acha na hora e link que nao existe". */
(function () {
  let cruas = 0;
  let selos = 0;
  let semSeguranca = 0;
  compilado.paginas.forEach(function (p) {
    const semAncora = p.html.replace(/<a [^>]*>[\s\S]*?<\/a>/g, '');
    cruas += (semAncora.match(/https?:\/\/|&lt;https?:/g) || []).length;
    (p.html.match(/<a class="pb-out"[^>]*>/g) || []).forEach(function (a) {
      selos++;
      if (!/target="_blank"/.test(a) || !/rel="noopener"/.test(a)) semSeguranca++;
    });
  });
  checar('nenhuma URL aparece como texto morto no playbook',
    cruas === 0,
    cruas + ' URL(s) fora de <a> — o autolink <https://...> voltou a ser escapado');
  checar('todo link externo tem selo, e o selo existe',
    selos >= 10, 'achei ' + selos + ' selo(s) .pb-out e esperava ao menos 10');
  checar('link externo nao rouba a aba do Cockpit',
    semSeguranca === 0,
    semSeguranca + ' selo(s) sem target="_blank" + rel="noopener" — abrir a planilha por cima do Cockpit'
      + ' perde a tela onde o executivo estava lendo, no meio da visita');
  /* o dominio e o que diz se aquilo pode aparecer na frente do cliente — a regra da
     propria pagina de Links uteis e "cliente nunca recebe link interno". */
  checar('o selo mostra o dominio, nao so o rotulo',
    compilado.paginas.some(function (p) { return /class="pb-out-h"/.test(p.html); }));
  checar('o dominio nao quebra no meio da palavra',
    /[.]pba [.]pb-out-h\{[^}]*white-space:nowrap/.test(template),
    'sem nowrap o .pba a{overflow-wrap:anywhere} parte "docs.google" numa linha e ".com" na outra');
})();

/* 2. A TESE NAO E FALA PARA O CLIENTE. Escuro tem UM significado no leitor: frase pronta
      para copiar. Quando promovi o subtitulo de abertura de h3 para h2, a citacao passou
      a vir depois do primeiro h2 e em 6 paginas a TESE virou cartao "FALE ASSIM · copiar"
      — o playbook mandando o executivo copiar o proprio manifesto para o dono. */
(function () {
  const i = template.indexOf('const antesDasSecoes');
  const bloco = i > -1 ? template.slice(i, i + 420) : '';
  checar('o manifesto e decidido por CONTAGEM de secoes antes da citacao',
    /secoesAntes\s*<=\s*1/.test(bloco),
    'a regra voltou a ser "antes do primeiro h2", que quebra em toda pagina cuja abertura e h2');
  /* e a estrutura que a regra pressupoe: no maximo 1 secao antes da primeira citacao */
  let pior = 0;
  compilado.paginas.forEach(function (p) {
    const k = p.html.indexOf('<blockquote');
    if (k < 0) return;
    const n = (p.html.slice(0, k).match(/<h2/g) || []).length;
    if (n > pior) pior = n;
  });
  checar('nenhuma pagina tem 2+ secoes antes da sua primeira citacao',
    pior <= 1,
    'a pior tem ' + pior + ' — com 2 ou mais, o limite <=1 deixa a tese virar FALE ASSIM outra vez');
})();

/* 3. A ESTRUTURA DE TITULOS. O trilho do leitor lista APENAS nivel 2: pagina que abre com
      h3 nao tem entrada para o bloco de abertura, e o executivo nao consegue voltar para
      a tese. As 30 abrem igual agora. */
(function () {
  let pulos = 0;
  let abremErrado = 0;
  compilado.paginas.forEach(function (p) {
    const h = p.headings || [];
    let anterior = 0;
    h.forEach(function (x) { if (anterior && x.nivel > anterior + 1) pulos++; anterior = x.nivel; });
    const iH1 = h.findIndex(function (x) { return x.nivel === 1; });
    const prox = h[iH1 + 1];
    if (!prox || prox.nivel !== 2) abremErrado++;
  });
  checar('nenhuma pagina pula nivel de titulo', pulos === 0, pulos + ' pulo(s)');
  checar('todas as paginas abrem com uma secao de nivel 2',
    abremErrado === 0,
    abremErrado + ' pagina(s) abrindo fora do padrao — a abertura fica sem entrada no trilho');
})();

/* 4. O MARCADOR DE PAGINA E NIVEL 3, E ISSO E ESTRUTURAL. montarPlaybook() fatia as 30
      paginas por /^###/ cruzado com MARCADORES. Eu promovi "### ECOSSISTEMA TAKEAT" para
      h2 numa arrumacao de nivel e o build morreu com "Pagina do playbook nao encontrada".
      Medir um uso (o id da ancora sai de idUnico(titulo), sem o nivel) nao prova que e o
      unico uso. */
(function () {
  const build = fs.readFileSync(path.join(raiz, 'scripts', 'build-playbook.js'), 'utf8');
  checar('o fatiador de paginas continua exigindo nivel 3 no marcador',
    /match\(\/\^#{3}\\s\+\(\.\+\)\$\/\)/.test(build) || /\^###\\s/.test(build),
    'se o fatiador mudar de nivel sem o markdown mudar junto, o build cai inteiro');
  checar('as 30 paginas continuam sendo geradas', compilado.paginas.length === 30,
    'achei ' + compilado.paginas.length);
})();

/* ══ A TRAVA DA TRILHA (05/09/26) ═══════════════════════════════════════════════════
   O Julyan pediu trava "pra eles lerem o conteúdo". Trava estrita eu medi e ela custava:
   "Venda na rua" abria no minuto 92, o capítulo de consulta no minuto 151, e 24 dos 53
   links internos apontariam para capítulo fechado — 24 pílulas mortas dentro do texto.
   O desenho que ficou: TRANCA O CAMINHO, NÃO A INFORMAÇÃO. As checagens abaixo são as
   duas metades disso, e uma sem a outra é um produto diferente. */
(function () {
  /* METADE 1 — o degrau tranca, e a regra mora num lugar só */
  const i = template.indexOf('const PB9_SEMPRE_ABERTO');
  checar('existe a lista do que nunca tranca', i > -1);
  checar('e o capítulo de consulta está nela',
    i > -1 && template.slice(i, i + 120).indexOf("'Processos internos'") > -1,
    'Pipeline, Dados para cadastro, o FAQ que se chama "é lei" e os Links úteis são consulta:'
      + ' com trava estrita eles abririam no minuto 151 e o executivo move card no dia 1');
  checar('o liberado é calculado na trilha, num lugar só',
    /c\.liberado = souGestorNaTrilha \|\| i === 0 \|\| c\.consulta/.test(template),
    'se cada tela decidir por conta, a estante tranca uma coisa e a leitura tranca outra');
  checar('o capítulo atual é o primeiro não provado ENTRE OS LIBERADOS',
    /return !c\.provado && c\.liberado && !c\.consulta/.test(template),
    'sem isso o capítulo de consulta virava "você está aqui" e o hero mandava o executivo pro FAQ');
  /* eu havia escrito aqui uma cláusula que negava um regex — `.test(...) === false` sobre
     um padrão que nunca casa. Cláusula vazia num && não mede nada e o verde é o mesmo. */
  checar('a patente sai da POSIÇÃO na trilha, não do capítulo',
    template.indexOf('const PB9_PATENTES = [') > -1
    && /patente: PB9_PATENTES\[i\]/.test(template),
    'presas ao capítulo, reordenar a trilha faria "Vendedor de Rua" cair depois de "Dono de Praça"');
  /* e o rank tem de subir: nome repetido faria dois capítulos darem a mesma patente */
  (function () {
    const iP = template.indexOf('const PB9_PATENTES = [');
    const bloco = iP > -1 ? template.slice(iP, template.indexOf('];', iP)) : '';
    const nomes = (bloco.match(/'[^']+'/g) || []).map(function (m) { return m.slice(1, -1); });
    checar('são 8 patentes, uma por capítulo, sem repetir',
      nomes.length === 8 && new Set(nomes).size === 8,
      nomes.length + ' nome(s), ' + new Set(nomes).size + ' distinto(s)');
  })();

  /* METADE 2 — a informação NÃO tranca */
  checar('a capa de capítulo fechado continua clicável',
    template.indexOf('pb9-capa" disabled') < 0 && template.indexOf("pb9-capa' disabled") < 0);
  checar('o leitor não recusa página de capítulo fechado',
    template.indexOf('function pb9MontarLeitor(slot, pb, pagina) {') > -1
    && template.slice(template.indexOf('function pb9MontarLeitor'), template.indexOf('function pb9MontarLeitor') + 900)
        .indexOf('liberado') < 0,
    'se o leitor barrar, a busca e os 53 links internos passam a levar a lugar nenhum');
  /* e o que segura a ordem em pé: consulta não credita */
  checar('o check desliga no capítulo fechado, em vez de aceitar o clique e não gravar',
    /const fechado = cap\.liberado === false;/.test(template)
    && /\(fechado \? ' disabled' : ''\)/.test(template),
    'clique que não muda nada é pior que botão desligado — o executivo acha que deu check');
  checar('e o check desligado DIZ qual patente abre o capítulo',
    /Este capítulo abre com a patente ' \+ esc\(cap\.abrePor/.test(template));
})();

/* ══ O ÍNDICE DO CATÁLOGO (05/09/26) ════════════════════════════════════════════════
   O catálogo é a página mais longa (26 min) e a única que ninguém lê: se consulta, com o
   dono na frente perguntando de um módulo. Eram 52 módulos escritos como nível 3, e o
   sumário do leitor lista só nível 2 — para chegar em "Comandas Individuais" o executivo
   rolava 26 minutos na frente do cliente.
   A checagem NÃO mede o texto do índice: mede a COBERTURA. Módulo novo na tabela que não
   aparecer no índice reprova, e âncora que aponta para lugar nenhum reprova. */
(function () {
  const cat = compilado.paginas.find(p => p.id === 'catalogo-solucoes');
  checar('o catálogo existe para ser medido', !!cat);
  if (!cat) return;
  const modulos = (cat.headings || []).filter(h => h.nivel === 3).map(h => h.id);
  const links = [...cat.html.matchAll(/data-pb-ancora="([a-z0-9-]+)"/g)].map(m => m[1]);
  const ancoras = new Set();
  compilado.paginas.forEach(p => (p.headings || []).forEach(h => ancoras.add(h.id)));
  const quebradas = links.filter(a => !ancoras.has(a));
  const fora = modulos.filter(id => links.indexOf(id) < 0);
  checar('o índice do catálogo alcança TODOS os módulos da página',
    modulos.length > 40 && fora.length === 0,
    modulos.length + ' módulo(s), ' + fora.length + ' fora do índice'
      + (fora.length ? ' — ex.: ' + fora.slice(0, 3).join(', ') : ''));
  checar('e nenhum salto do índice cai no vazio',
    quebradas.length === 0,
    quebradas.length + ' âncora(s) inexistente(s): ' + quebradas.slice(0, 3).join(', '));
  /* o título do adicional carrega o preço, então índice e seção têm de montá-lo no MESMO
     lugar — senão o índice quebra sozinho no dia que um preço mudar */
  const build = fs.readFileSync(path.join(raiz, 'scripts', 'build-playbook.js'), 'utf8');
  checar('o título do adicional é montado num lugar só',
    /const tituloAdicional = a =>/.test(build)
    && (build.match(/tituloAdicional\(a\)/g) || []).length >= 2,
    'índice e seção montando o título cada um por sua conta = índice apontando para âncora'
      + ' que deixou de existir quando o preço mudou');
})();

if (falhas.length) {
  console.error('\nFALHAS (' + falhas.length + '):');
  falhas.forEach(f => console.error('  ✗ ' + f));
  console.error('\n' + ok + ' ok, ' + falhas.length + ' falha(s).');
  process.exit(1);
}
console.log('playbook v7: ' + ok + ' checagens ok — prova, teto, níveis, selo, uso real, trilha do funil, busca, link externo e estrutura de títulos.');
