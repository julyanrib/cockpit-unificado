// Transforma o export Markdown do Takeat OS em um asset estático, sanitizado e pronto
// para consulta no Cockpit. Sem dependência externa: o build precisa continuar rodando
// só com Node, tanto localmente quanto no GitHub Actions.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PAGINAS = [
  { marker: 'GUIA DE EXCELÊNCIA', id: 'excelencia', categoria: 'Comece aqui', icone: '◆', titulo: 'O padrão de quem domina uma praça', resumo: 'Mentalidade de dono, pitch na língua do dono, planejamento e domínio técnico.' },
  { marker: 'ONBOARDING DE NOVOS EXECUTIVOS', id: 'onboarding', categoria: 'Comece aqui', icone: '↗', titulo: 'Seus primeiros 60 dias', resumo: 'A jornada dia 1 ao 60, os gates e o que a empresa mede em cada um.' },
  { marker: 'METAS & CADÊNCIA OFICIAL', id: 'metas-cadencia', categoria: 'Comece aqui', icone: '◎', titulo: 'Os números que valem — fonte única', resumo: 'Meta, matemática do funil, preço, MRR e SLA. Todo número do playbook aponta para cá.' },
  { marker: 'ROTINA', occurrence: 0, id: 'rotina-executivo', categoria: 'Comece aqui', icone: '◷', titulo: 'A semana de quem bate meta', resumo: 'O cronograma do dia e da semana para ganhar o dia antes de sair de casa.' },
  { marker: 'GUIA PROSPECÇÃO 1/2', id: 'prospeccao-porta-a-porta', categoria: 'Venda na rua', icone: '⌖', titulo: 'Porta a porta: a rua como sistema', resumo: 'Microrrotas, o scanner do salão, abordagem e registro em tempo real.' },
  { marker: 'GUIA PROSPECÇÃO 2/2', id: 'prospeccao-inteligente', categoria: 'Venda na rua', icone: '⌕', titulo: 'Prospecção com dados: escolha a porta antes de sair', resumo: 'Casa dos Dados, Google Maps, Instagram e a passagem do digital para o CRM.' },
  { marker: 'COMO ACHAR O TD', id: 'acesso-decisor', categoria: 'Venda na rua', icone: '◇', titulo: 'Como chegar em quem assina', resumo: 'Como atravessar quem barra na porta e falar com quem decide.' },
  { marker: 'FOLLOW UP', id: 'follow-up', categoria: 'Venda na rua', icone: '↻', titulo: 'Follow-up: presença no prazo certo', resumo: 'SLA por etapa, escada de escalonamento e presença sem perseguir o cliente.' },
  { marker: 'RUA x WHATSAPP', id: 'rua-whatsapp', categoria: 'Venda na rua', icone: '↔', titulo: 'WhatsApp conecta, o asfalto converte', resumo: 'Como usar mensagem e ligação para levar o cliente ao presencial — não para substituí-lo.' },
  { arquivo: 'playbook-mapa-dor-solucao.md', id: 'mapa-dor-solucao', categoria: 'Converter e fechar', icone: '⊕', titulo: 'Mapa dor → solução', resumo: 'As 6 dores reais traduzidas em módulo, plano e a frase que você fala na mesa.' },
  { marker: 'QUEBRA DE OBJEÇÕES', id: 'objecoes', categoria: 'Converter e fechar', icone: '◈', titulo: 'Objeções: a conversa é sobre margem', resumo: 'As 5 objeções de mesa e o fechamento por contraste, resposta por resposta.' },
  { marker: 'TÉCNICAS DE FECHAMENTO', id: 'fechamento', categoria: 'Converter e fechar', icone: '✓', titulo: 'Fechamento: o pagamento acontece na mesa', resumo: 'A transição da demo ao Asaas aberto, e como travar o setup sem enrolação.' },
  { marker: 'CLIENTES X MRR', id: 'clientes-mrr', categoria: 'Converter e fechar', icone: '△', titulo: 'Volume × valor: a conta da sua carteira', resumo: 'Território, mancha de bairro, MRR alvo e blindagem da receita recorrente.' },
  { marker: 'RELACIONAMENTO', id: 'relacionamento', categoria: 'Carteira e retenção', icone: '∞', titulo: 'Pós-venda presencial: a máquina de indicações', resumo: 'Visita de cortesia, indicação ativa e como blindar a base do concorrente de ocasião.' },
  { marker: 'COMO EVITAR CHURN', id: 'evitar-churn', categoria: 'Carteira e retenção', icone: '⊙', titulo: 'Como evitar churn', resumo: 'O radar de risco, o resgate presencial e onde termina você e começa o CS.' },
  { marker: 'ECOSSISTEMA TAKEAT', occurrence: 0, id: 'ecossistema-takeat', categoria: 'Produto e mercado', icone: '⬡', titulo: 'O ecossistema e o comparativo contra a concorrência', resumo: 'Os 4 pilares, o produto módulo por módulo e como cruzar isso com a dor real.' },
  { gerado: 'catalogo', id: 'catalogo-solucoes', categoria: 'Produto e mercado', icone: '▦', titulo: 'Catálogo de soluções', resumo: 'O que cada funcionalidade faz, como ajuda o dono, em que plano entra e a frase de mesa.' },
  { arquivo: 'playbook-dark-kitchen.md', id: 'dark-kitchen', categoria: 'Produto e mercado', icone: '◐', titulo: 'Dark Kitchen', resumo: 'Marcas virtuais sobre a mesma cozinha: faturamento novo sobre custo fixo pago.' },
  { arquivo: 'playbook-rota-inteligente.md', id: 'rota-inteligente', categoria: 'Produto e mercado', icone: '⇉', titulo: 'Rota Inteligente', resumo: 'O elo que falta no delivery próprio: agrupar e sequenciar a rota do entregador.' },
  { arquivo: 'playbook-conciliacao-ofx.md', id: 'conciliacao-ofx', categoria: 'Produto e mercado', icone: '⊞', titulo: 'Conciliação Bancária OFX', resumo: 'O extrato do banco conversando com o caixa: o mês deixa de fechar por aproximação.' },
  { arquivo: 'playbook-multilojas.md', id: 'multilojas', categoria: 'Produto e mercado', icone: '⧉', titulo: 'Multilojas / Franqueadora', resumo: 'R$ 29 é preço de decisão automática — e o gancho natural do Enterprise.' },
  { marker: 'CONCORRÊNCIA', id: 'concorrencia', categoria: 'Produto e mercado', icone: '⚑', titulo: 'Concorrência', resumo: 'Os 3 tipos de concorrente, onde cada um falha e a pergunta que desarma cada um.' },
  { marker: 'EQUIPAMENTOS', id: 'equipamentos', categoria: 'Produto e mercado', icone: '▣', titulo: 'Equipamentos', resumo: 'Infraestrutura homologada: computador, impressora, tablet, totem, TEF e balança.' },
  { marker: 'DISPLAYS/COMANDAS', id: 'displays-comandas', categoria: 'Produto e mercado', icone: '▤', titulo: 'Material de mesa: o que faz o Garçom Digital existir', resumo: 'Displays e comandas: preço, processo de solicitação e a conta na frente do dono.' },
  { marker: 'PIPELINE', id: 'pipeline', categoria: 'Processos internos', icone: '⟶', titulo: 'Pipeline oficial', resumo: 'As 8 etapas, os critérios de cada uma e as duas automações que não se mexem.' },
  { marker: 'DADOS PARA CADASTRO', id: 'dados-cadastro', categoria: 'Processos internos', icone: '□', titulo: 'Dados para cadastro', resumo: 'O que bloqueia, o que acelera, a mensagem pronta e o fiscal em linguagem de campo.' },
  { marker: 'FAQ', id: 'faq', categoria: 'Processos internos', icone: '?', titulo: 'FAQ de sobrevivência — se está aqui, é lei', resumo: 'Política comercial, equipamentos, integrações, Asaas e onboarding.' },
  { marker: 'LINKS ÚTEIS', id: 'links-uteis', categoria: 'Processos internos', icone: '↗', titulo: 'Links úteis', resumo: 'Os atalhos oficiais, na ordem do dia: preparar a rua, demonstrar, colocar de pé.' },
  { marker: 'PLANO DE CARREIRA', id: 'plano-carreira', categoria: 'Desenvolvimento', icone: '▲', titulo: 'Plano de carreira: os degraus que você controla', resumo: 'As 6 dimensões medidas, os territórios de liderança e os três degraus.' },
  { marker: 'ROTINA', occurrence: 1, id: 'rotina-gestor', categoria: 'Liderança', icone: '♢', titulo: 'A rotina do gestor: disciplina de dado', resumo: 'Rituais, 1:1, auditoria do funil e a cadência que sustenta o canal.' }
];

const MARCADORES = ['ECOSSISTEMA TAKEAT', 'GUIA DE EXCELÊNCIA', 'ONBOARDING DE NOVOS EXECUTIVOS',
  'METAS & CADÊNCIA OFICIAL', 'ROTINA', 'GUIA PROSPECÇÃO 1/2', 'GUIA PROSPECÇÃO 2/2',
  'COMO ACHAR O TD', 'CONCORRÊNCIA', 'FOLLOW UP', 'RUA x WHATSAPP', 'QUEBRA DE OBJEÇÕES',
  'TÉCNICAS DE FECHAMENTO', 'CLIENTES X MRR', 'RELACIONAMENTO', 'COMO EVITAR CHURN',
  'PIPELINE', 'DADOS PARA CADASTRO', 'EQUIPAMENTOS', 'FAQ', 'LINKS ÚTEIS',
  'DISPLAYS/COMANDAS', 'PLANO DE CARREIRA'];

/* ============================================================================
   CATÁLOGO DE SOLUÇÕES — PÁGINA GERADA DO DADO (29/08/26)
   ----------------------------------------------------------------------------
   Pedido do Julyan: "temos que ter mais do que a takeat faz ali no sistema, ou seja
   tudo que voce viu que temos de funcionalidade ali nas propostas, tem que estar
   descrito no playbook, o que fazemos, como ajudamos etc... playbook blinda o gestor de
   perguntas idiotas e tbm é uma arma completa para o executivo".

   POR QUE GERADA, e não escrita à mão: a tabela oficial tem 40 funcionalidades e 11
   adicionais, e ela muda. Uma página escrita à mão fica atrás do produto na primeira
   alteração — e playbook desatualizado é pior que playbook faltando, porque o executivo
   confia nele na frente do cliente. Aqui o nome, a seção, o preço do adicional e O
   PLANO MÍNIMO EM QUE CADA COISA ENTRA saem de data/precificacao.json; só a descrição é
   humana, e vive em data/playbook-catalogo.json.

   E O BUILD FALHA se uma funcionalidade da tabela não tiver descrição. É de propósito,
   na mesma lógica do guard de breakpoint do check-scripts: quem acrescentar um item ao
   que a Takeat vende é obrigado a dizer o que ele faz e como ajuda, antes de o cockpit
   subir. O erro diz exatamente o que falta e onde escrever.
   ============================================================================ */
function montarCatalogo(root) {
  const preco = JSON.parse(fs.readFileSync(path.join(root, 'data', 'precificacao.json'), 'utf8'));
  const desc = JSON.parse(fs.readFileSync(path.join(root, 'data', 'playbook-catalogo.json'), 'utf8'));

  /* Onde cada funcionalidade aparece: seção + em que planos de cada tipo. Os planos são
     cumulativos (cada um herda o anterior), então o PLANO MÍNIMO já conta a história. */
  const ordemPlanos = {};
  const nomePlano = {};
  preco.tipos.forEach(t => {
    ordemPlanos[t.id] = t.planos.map(x => x.id);
    t.planos.forEach(x => { nomePlano[x.id] = x.nome; });
  });

  const mapa = new Map(); // nome -> { secao, porTipo: { tipoId: [planoIds] } }
  const ordemSecoes = [];
  preco.tipos.forEach(t => t.planos.forEach(pl => {
    Object.entries(pl.secoes || {}).forEach(([secao, itens]) => {
      if (!ordemSecoes.includes(secao)) ordemSecoes.push(secao);
      itens.forEach(nome => {
        if (!mapa.has(nome)) mapa.set(nome, { secao: secao, porTipo: {} });
        const reg = mapa.get(nome);
        reg.porTipo[t.id] = reg.porTipo[t.id] || [];
        if (!reg.porTipo[t.id].includes(pl.id)) reg.porTipo[t.id].push(pl.id);
      });
    });
  }));

  /* O GUARD. Falta de descrição para a tabela, e descrição órfã (item que saiu da
     tabela e ficou aqui) — as duas coisas param o build. */
  const semDescricao = [...mapa.keys()].filter(nome => !desc.funcionalidades[nome]);
  /* A FALA TAMBEM E OBRIGATORIA (30/08/26). O catalogo virou arma de mesa: cada item tem
     o que faz (para ele entender), como ajuda (o beneficio) e a FRASE LITERAL que ele diz
     na frente do dono. Item novo sem frase e executivo improvisando na hora — por isso
     para o build, na mesma logica do resto do guard. */
  const semFala = [...mapa.keys()].filter(nome => desc.funcionalidades[nome] && !desc.funcionalidades[nome].fala);
  const addonsSemFala = preco.adicionais.map(a => a.nome).filter(nome => desc.adicionais[nome] && !desc.adicionais[nome].fala);
  const addonsSemDescricao = preco.adicionais.map(a => a.nome).filter(nome => !desc.adicionais[nome]);
  const orfas = Object.keys(desc.funcionalidades).filter(nome => !mapa.has(nome));
  const addonsOrfaos = Object.keys(desc.adicionais).filter(nome => !preco.adicionais.some(a => a.nome === nome));
  const erros = [];
  if (semDescricao.length) erros.push('sem descrição em data/playbook-catalogo.json -> funcionalidades: ' + semDescricao.join(' | '));
  if (semFala.length) erros.push('sem a frase literal (campo "fala") -> funcionalidades: ' + semFala.join(' | '));
  if (addonsSemFala.length) erros.push('sem a frase literal (campo "fala") -> adicionais: ' + addonsSemFala.join(' | '));
  if (addonsSemDescricao.length) erros.push('sem descrição em data/playbook-catalogo.json -> adicionais: ' + addonsSemDescricao.join(' | '));
  if (orfas.length) erros.push('descrição órfã (não está mais na tabela) -> funcionalidades: ' + orfas.join(' | '));
  if (addonsOrfaos.length) erros.push('descrição órfã (não está mais na tabela) -> adicionais: ' + addonsOrfaos.join(' | '));
  if (erros.length) {
    throw new Error('CATÁLOGO DO PLAYBOOK INCOMPLETO:' + L2 + '  ' + erros.join(L2 + '  ') + L2 +
      'O catálogo é gerado da tabela oficial. Item que a Takeat vende sem descrição é gestor respondendo pergunta que o material devia responder — por isso o build para aqui.');
  }

  const ondeEntra = reg => {
    const partes = preco.tipos.map(t => {
      const pls = reg.porTipo[t.id];
      if (!pls || !pls.length) return null;
      const idx = ordemPlanos[t.id].map((id, i) => pls.includes(id) ? i : -1).filter(i => i >= 0);
      const min = Math.min.apply(null, idx);
      const idMin = ordemPlanos[t.id][min];
      const ehUltimo = min === ordemPlanos[t.id].length - 1;
      const rot = t.rotuloOficial || t.nome;
      return '**' + rot + '**: ' + (ehUltimo ? 'só no ' + nomePlano[idMin] : 'a partir do ' + nomePlano[idMin]);
    }).filter(Boolean);
    if (partes.length === 1) partes.push('**' + (preco.tipos.find(t => !reg.porTipo[t.id]).rotuloOficial || '') + '**: não se aplica');
    return partes.join(' · ');
  };

  const linhas = [];
  linhas.push('# Catálogo de soluções: o que cada funcionalidade faz, e onde ela entra');
  linhas.push('');
  linhas.push('Esta página existe para uma coisa: **ninguém na rua precisar perguntar o que a Takeat faz.** São as **' + mapa.size + ' funcionalidades** da tabela oficial e os **' + preco.adicionais.length + ' adicionais**, cada um com o que faz, como ajuda o dono e em que plano entra.');
  linhas.push('');
  linhas.push('> **Ela é gerada da tabela oficial** (`data/precificacao.json`), não escrita à mão. Nome, seção, preço e plano mínimo saem do mesmo dado que a aba Propostas usa — então o que você lê aqui é exatamente o que sai na proposta do cliente. Tabela conferida em ' + (preco.conferidoEm || '').split('-').reverse().join('/') + '.');
  linhas.push('');
  linhas.push('**Como usar na mesa — três camadas por item:** o **o que faz** é para VOCÊ entender; o **como ajuda o dono** é o benefício que justifica o preço; e a **frase em itálico** é o que sai da sua boca na frente dele, pronta, sem improviso. Descubra a dor primeiro (veja o mapa dor → solução), puxe o item que responde àquela dor e diga a frase. Ler o catálogo inteiro para o dono é o jeito mais rápido de perder a venda.');
  linhas.push('');
  linhas.push('***');

  ordemSecoes.forEach(secao => {
    const itens = [...mapa.entries()].filter(([, reg]) => reg.secao === secao);
    if (!itens.length) return;
    linhas.push('');
    linhas.push('## ' + secao + ' — ' + itens.length + (itens.length === 1 ? ' funcionalidade' : ' funcionalidades'));
    itens.forEach(([nome, reg]) => {
      const d = desc.funcionalidades[nome];
      linhas.push('');
      linhas.push('### ' + nome);
      linhas.push('');
      linhas.push('**O que faz.** ' + d.faz);
      linhas.push('');
      linhas.push('**Como ajuda o dono.** ' + d.ajuda);
      if (d.fala) { linhas.push(''); linhas.push('> *"' + d.fala + '"*'); }
      linhas.push('');
      linhas.push('**Onde entra.** ' + ondeEntra(reg));
    });
  });

  linhas.push('');
  linhas.push('***');
  linhas.push('');
  /* h2, nao h1: a pagina tem um titulo so, e o leitor monta a faixa do primeiro. */
  linhas.push('## Os ' + preco.adicionais.length + ' adicionais');
  linhas.push('');
  linhas.push('Adicional é o que entra por cima do plano. **O desconto do período vale para eles também** — cada adicional que entra na proposta também entra no desconto, e isso é argumento na mesa.');
  preco.adicionais.forEach(a => {
    const d = desc.adicionais[a.nome];
    const unid = a.unidade && a.unidade !== 'mês' ? '/' + a.unidade : '/mês';
    linhas.push('');
    linhas.push('### ' + a.nome + ' — R$ ' + a.preco + unid);
    linhas.push('');
    linhas.push('**O que faz.** ' + d.faz);
    linhas.push('');
    linhas.push('**Como ajuda o dono.** ' + d.ajuda);
    if (d.fala) { linhas.push(''); linhas.push('> *"' + d.fala + '"*'); }
    if (Array.isArray(a.incluidoEm) && a.incluidoEm.length) {
      /* Vender adicional para quem já o tem no plano é o erro mais caro de
         credibilidade que existe na mesa. O dado sabe; agora a página diz. */
      const nomes = a.incluidoEm.map(id => nomePlano[id] || id);
      linhas.push('');
      linhas.push('**Já vem incluído no ' + nomes.join(' e no ') + '** — não cobre à parte de quem está nesse plano.');
    }
    if (a.descricao) {
      linhas.push('');
      linhas.push('**Na tabela oficial:** ' + a.descricao);
    }
  });

  linhas.push('');
  linhas.push('***');
  linhas.push('');
  linhas.push('## O que este catálogo não responde');
  linhas.push('');
  linhas.push('- **Qual plano oferecer.** Isso sai da dor registrada, não da lista. Veja [Mapa dor → solução](playbook:mapa-dor-solucao).');
  linhas.push('- **Como atacar o concorrente** em cada módulo. Isso é [Ecossistema Takeat](playbook:ecossistema-takeat) e [Concorrência](playbook:concorrencia).');
  linhas.push('- **Hardware homologado** (balança, impressora, totem, TEF). Isso é [Equipamentos](playbook:equipamentos).');
  linhas.push('- **Preço final.** A tabela viva está na aba Propostas, e é ela que gera a peça do cliente.');

  /* FECHAMENTO ACIONAVEL (30/08/26). A auditoria mostrou que 26 das 30 paginas
     terminavam sem nenhuma instrucao de saida — o executivo lia e fechava a aba. O
     catalogo e gerado, entao o fechamento dele vive aqui. */
  linhas.push('');
  linhas.push('***');
  linhas.push('');
  linhas.push('## O que fazer agora');
  linhas.push('');
  linhas.push('- Escolha os **três itens** que respondem a dor mais comum do seu território e decore só as frases deles. Catálogo se usa por recorte, nunca inteiro.');
  linhas.push('- Antes de oferecer adicional, confira em que plano ele já vem incluído. Vender o que o cliente já tem é o erro mais caro de credibilidade que existe na mesa.');
  linhas.push('- Achou item cuja frase não te convence? Traga no Discord. A frase é do time, e frase ruim aqui é venda perdida na rua.');
  return linhas.join(L2);
}

const L2 = '\n';

function decodeEntities(texto) {
  return String(texto || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&nbsp;/gi, ' ');
}

function esc(texto) {
  return decodeEntities(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slug(texto) {
  return decodeEntities(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 72) || 'secao';
}

function inline(texto) {
  let s = esc(String(texto || '').replace(/\\$/g, ''));
  const tokens = [];
  const guardar = html => { const id = tokens.push(html) - 1; return `\u0000${id}\u0000`; };
  s = s.replace(/`([^`]+)`/g, (_, code) => guardar(`<code>${code}</code>`));
  s = s.replace(/\[([^\]]+)\]\(playbook:([a-z0-9-]+)(?:#([a-z0-9-]+))?\)/gi, (_, label, pagina, ancora) =>
    guardar(`<button type="button" class="pb-ir" data-pb-ir="${pagina.toLowerCase()}"${ancora ? ` data-pb-ancora="${ancora.toLowerCase()}"` : ''}>${label}<span aria-hidden="true"> →</span></button>`));
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, href) =>
    guardar(`<a href="${href}" target="_blank" rel="noopener">${label}<span aria-hidden="true"> ↗</span></a>`));
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, id) => tokens[Number(id)] || '');
  return s;
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
}

function markdownToHtml(markdown, pageId) {
  const linhas = decodeEntities(markdown).replace(/\r/g, '').split('\n');
  const html = [];
  const headings = [];
  const ids = new Map();
  const idUnico = titulo => {
    const base = `${pageId}-${slug(titulo)}`;
    const n = (ids.get(base) || 0) + 1;
    ids.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  const ehBloco = (line, next) => /^#{1,6}\s+/.test(line) || /^\s*(```|~~~)/.test(line)
    || /^\s*>/.test(line) || /^\s*([-*+]\s+|\d+[.)]\s+)/.test(line)
    || /^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(line)
    || (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(next || ''));

  for (let i = 0; i < linhas.length;) {
    const line = linhas[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^\s*(```|~~~)(.*)$/);
    if (fence) {
      const fim = fence[1]; const code = []; i++;
      while (i < linhas.length && !linhas[i].trim().startsWith(fim)) code.push(linhas[i++]);
      if (i < linhas.length) i++;
      html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const nivel = Math.min(4, Math.max(1, h[1].length));
      const titulo = h[2].trim(); const id = idUnico(titulo);
      headings.push({ id, nivel, titulo: decodeEntities(titulo).replace(/[*_`]/g, '') });
      html.push(`<h${nivel} id="${id}">${inline(titulo)}</h${nivel}>`); i++; continue;
    }
    if (/^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) { html.push('<hr>'); i++; continue; }
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(linhas[i + 1] || '')) {
      const head = splitTableRow(line); i += 2; const rows = [];
      while (i < linhas.length && linhas[i].includes('|') && linhas[i].trim()) rows.push(splitTableRow(linhas[i++]));
      html.push(`<div class="pb-table-wrap"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${head.map((_, ci) => `<td>${inline(row[ci] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < linhas.length && (/^\s*>/.test(linhas[i]) || !linhas[i].trim())) {
        if (linhas[i].trim()) quote.push(linhas[i].replace(/^\s*>\s?/, '')); i++;
      }
      html.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); continue;
    }
    const li = line.match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
    if (li) {
      const ordered = /^\d/.test(li[1]); const tag = ordered ? 'ol' : 'ul'; const itens = [];
      while (i < linhas.length) {
        const item = linhas[i].match(/^\s*([-*+]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        let texto = item[2].trim(); i++;
        while (i < linhas.length && linhas[i].trim() && !ehBloco(linhas[i], linhas[i + 1]) && /^\s{2,}/.test(linhas[i])) texto += ' ' + linhas[i++].trim();
        itens.push(`<li>${inline(texto)}</li>`);
        while (i < linhas.length && !linhas[i].trim()) i++;
      }
      html.push(`<${tag}>${itens.join('')}</${tag}>`); continue;
    }
    const par = [line.trim()]; i++;
    while (i < linhas.length && linhas[i].trim() && !ehBloco(linhas[i], linhas[i + 1])) par.push(linhas[i++].trim());
    html.push(`<p>${inline(par.join(' '))}</p>`);
  }
  return { html: html.join('\n'), headings };
}

function textoBusca(markdown) {
  return decodeEntities(markdown).replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`|\[\]()~-]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
}

function montarPlaybook(root) {
  const source = path.join(root, 'data', 'field-sales-playbook.md');
  const raw = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  const todos = [];
  lines.forEach((line, index) => {
    const match = line.match(/^###\s+(.+)$/);
    if (match && MARCADORES.some(m => m.toLocaleLowerCase('pt-BR') === match[1].trim().toLocaleLowerCase('pt-BR'))) {
      todos.push({ marker: match[1].trim(), index });
    }
  });
  const arquivosExtras = {};
  const paginas = PAGINAS.map(meta => {
    /* Página gerada: o markdown nasce do dado, então não existe arquivo para ler. */
    if (meta.gerado === 'catalogo') {
      const markdown = montarCatalogo(root);
      arquivosExtras['(catalogo gerado)'] = markdown;
      const convertido = markdownToHtml(markdown, meta.id);
      return { ...meta, html: convertido.html, headings: convertido.headings, busca: textoBusca(`${meta.titulo} ${meta.resumo} ${markdown}`) };
    }
    if (meta.arquivo) {
      const markdown = fs.readFileSync(path.join(root, 'data', meta.arquivo), 'utf8').replace(/^\uFEFF/, '').trim();
      arquivosExtras[meta.arquivo] = markdown;
      const convertido = markdownToHtml(markdown, meta.id);
      return { ...meta, html: convertido.html, headings: convertido.headings, busca: textoBusca(`${meta.titulo} ${meta.resumo} ${markdown}`) };
    }
    const iguais = todos.filter(item => item.marker.toLocaleLowerCase('pt-BR') === meta.marker.toLocaleLowerCase('pt-BR'));
    const inicio = iguais[meta.occurrence || 0];
    if (!inicio) throw new Error(`Página do playbook não encontrada: ${meta.marker} #${meta.occurrence || 0}`);
    const pos = todos.findIndex(item => item.index === inicio.index);
    const fim = todos[pos + 1] ? todos[pos + 1].index : lines.length;
    const markdown = lines.slice(inicio.index + 1, fim).join('\n').trim();
    const convertido = markdownToHtml(markdown, meta.id);
    return { ...meta, html: convertido.html, headings: convertido.headings, busca: textoBusca(`${meta.titulo} ${meta.resumo} ${markdown}`) };
  });
  const payload = {
    titulo: 'Playbook Field Sales',
    fonte: 'Takeat OS',
    versao: crypto.createHash('sha256').update(raw + Object.values(arquivosExtras).join('\n')).digest('hex').slice(0, 12),
    paginas,
    categorias: [...new Set(paginas.map(p => p.categoria))],
    palavras: (raw + '\n' + Object.values(arquivosExtras).join('\n')).trim().split(/\s+/).length
  };
  return payload;
}

function buildPlaybook(root) {
  const payload = montarPlaybook(root);
  const destino = path.join(root, 'data', 'field-sales-playbook.compiled.json');
  fs.writeFileSync(destino, JSON.stringify(payload).replace(/</g, '\\u003c') + '\n');
  console.log(`OK — playbook protegido gerado: ${payload.paginas.length} guias, ${payload.palavras.toLocaleString('pt-BR')} palavras.`);
  return payload;
}

module.exports = { buildPlaybook, montarPlaybook, markdownToHtml };

if (require.main === module) buildPlaybook(path.join(__dirname, '..'));
