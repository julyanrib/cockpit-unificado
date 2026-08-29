// Transforma o export Markdown do Takeat OS em um asset estático, sanitizado e pronto
// para consulta no Cockpit. Sem dependência externa: o build precisa continuar rodando
// só com Node, tanto localmente quanto no GitHub Actions.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PAGINAS = [
  { marker: 'GUIA DE EXCELÊNCIA', id: 'excelencia', categoria: 'Comece aqui', icone: '◆', titulo: 'Executivo de excelência', resumo: 'Mentalidade, planejamento, pitch e domínio técnico de um top performer.' },
  { marker: 'ONBOARDING DE NOVOS EXECUTIVOS', id: 'onboarding', categoria: 'Comece aqui', icone: '↗', titulo: 'Onboarding e rampagem', resumo: 'Jornada dos primeiros 60 dias, gates e critérios de evolução.' },
  { marker: 'METAS & CADÊNCIA OFICIAL', id: 'metas-cadencia', categoria: 'Comece aqui', icone: '◎', titulo: 'Metas e cadência oficial', resumo: 'A fonte única para metas, matemática do funil, preço e SLA.' },
  { marker: 'ROTINA', occurrence: 0, id: 'rotina-executivo', categoria: 'Comece aqui', icone: '◷', titulo: 'Rotina do executivo', resumo: 'O cronograma diário e semanal para ganhar o dia antes de ir à rua.' },
  { marker: 'GUIA PROSPECÇÃO 1/2', id: 'prospeccao-porta-a-porta', categoria: 'Venda na rua', icone: '⌖', titulo: 'Prospecção porta a porta', resumo: 'Microrrotas, scanner de cenário, abordagem e registro em tempo real.' },
  { marker: 'GUIA PROSPECÇÃO 2/2', id: 'prospeccao-inteligente', categoria: 'Venda na rua', icone: '⌕', titulo: 'Prospecção inteligente', resumo: 'Casa dos Dados, Google Maps, Instagram e passagem do digital para o CRM.' },
  { marker: 'COMO ACHAR O TD', id: 'acesso-decisor', categoria: 'Venda na rua', icone: '◇', titulo: 'Acesso ao decisor', resumo: 'Como atravessar o gatekeeper e chegar a quem realmente assina.' },
  { marker: 'FOLLOW UP', id: 'follow-up', categoria: 'Venda na rua', icone: '↻', titulo: 'Follow-up de excelência', resumo: 'SLA, escalonamento e presença continuada sem perseguir o cliente.' },
  { marker: 'RUA x WHATSAPP', id: 'rua-whatsapp', categoria: 'Venda na rua', icone: '↔', titulo: 'Rua × WhatsApp', resumo: 'Como usar mensagem e ligação para impulsionar — não substituir — o asfalto.' },
  { arquivo: 'playbook-mapa-dor-solucao.md', id: 'mapa-dor-solucao', categoria: 'Converter e fechar', icone: '⊕', titulo: 'Mapa dor → solução', resumo: 'As 6 dores da enumeração oficial traduzidas em módulo, plano e frase de campo.' },
  { marker: 'QUEBRA DE OBJEÇÕES', id: 'objecoes', categoria: 'Converter e fechar', icone: '◈', titulo: 'Quebra de objeções', resumo: 'Respostas de impacto para preço, concorrência, tecnologia e risco.' },
  { marker: 'TÉCNICAS DE FECHAMENTO', id: 'fechamento', categoria: 'Converter e fechar', icone: '✓', titulo: 'Técnicas de fechamento', resumo: 'Transição de valor, pagamento na mesa e checklist de saída.' },
  { marker: 'CLIENTES X MRR', id: 'clientes-mrr', categoria: 'Converter e fechar', icone: '△', titulo: 'Clientes × MRR', resumo: 'Território, volume, MRR alvo e blindagem da receita recorrente.' },
  { marker: 'RELACIONAMENTO', id: 'relacionamento', categoria: 'Carteira e retenção', icone: '∞', titulo: 'Relacionamento de elite', resumo: 'Pós-venda presencial, indicações e domínio sustentável do bairro.' },
  { marker: 'COMO EVITAR CHURN', id: 'evitar-churn', categoria: 'Carteira e retenção', icone: '⊙', titulo: 'Como evitar churn', resumo: 'Radar de risco, recuperação presencial e divisão correta com CS.' },
  { marker: 'ECOSSISTEMA TAKEAT', occurrence: 0, id: 'ecossistema-takeat', categoria: 'Produto e mercado', icone: '⬡', titulo: 'Ecossistema Takeat', resumo: 'Soluções, pilares, diferenciais e como cruzar produto com dor real.' },
  { arquivo: 'playbook-dark-kitchen.md', id: 'dark-kitchen', categoria: 'Produto e mercado', icone: '◐', titulo: 'Dark Kitchen', resumo: 'Marcas virtuais sobre a mesma cozinha: faturamento novo sobre custo fixo pago.' },
  { arquivo: 'playbook-rota-inteligente.md', id: 'rota-inteligente', categoria: 'Produto e mercado', icone: '⇉', titulo: 'Rota Inteligente', resumo: 'O elo que falta no delivery próprio: agrupar e sequenciar a rota do entregador.' },
  { arquivo: 'playbook-conciliacao-cfx.md', id: 'conciliacao-cfx', categoria: 'Produto e mercado', icone: '⊞', titulo: 'Conciliação Bancária CFX', resumo: 'O único adicional que se vende como recuperação: a taxa que a maquininha cobrou errado.' },
  { arquivo: 'playbook-multilojas.md', id: 'multilojas', categoria: 'Produto e mercado', icone: '⧉', titulo: 'Multilojas / Franqueadora', resumo: 'R$ 29 é preço de decisão automática — e o gancho natural do Enterprise.' },
  { marker: 'CONCORRÊNCIA', id: 'concorrencia', categoria: 'Produto e mercado', icone: '⚑', titulo: 'Concorrência', resumo: 'Onde cada solução compete, onde o concorrente falha e como posicionar a Takeat.' },
  { marker: 'EQUIPAMENTOS', id: 'equipamentos', categoria: 'Produto e mercado', icone: '▣', titulo: 'Equipamentos', resumo: 'Infraestrutura homologada, impressoras, tablets, totem, TEF e balanças.' },
  { marker: 'DISPLAYS/COMANDAS', id: 'displays-comandas', categoria: 'Produto e mercado', icone: '▤', titulo: 'Displays e comandas', resumo: 'Materiais personalizados, processo de solicitação e valor para o restaurante.' },
  { marker: 'PIPELINE', id: 'pipeline', categoria: 'Processos internos', icone: '⟶', titulo: 'Pipeline oficial', resumo: 'Etapas, critérios, recuperação e passagem para onboarding.' },
  { marker: 'DADOS PARA CADASTRO', id: 'dados-cadastro', categoria: 'Processos internos', icone: '□', titulo: 'Dados para cadastro', resumo: 'Checklist cadastral, cardápio, identidade e dados fiscais.' },
  { marker: 'FAQ', id: 'faq', categoria: 'Processos internos', icone: '?', titulo: 'FAQ de sobrevivência', resumo: 'Política comercial, equipamentos, integrações, Asaas e onboarding.' },
  { marker: 'LINKS ÚTEIS', id: 'links-uteis', categoria: 'Processos internos', icone: '↗', titulo: 'Links úteis', resumo: 'Atalhos oficiais para sistemas, formulários e rotinas do time.' },
  { marker: 'PLANO DE CARREIRA', id: 'plano-carreira', categoria: 'Desenvolvimento', icone: '▲', titulo: 'Plano de carreira', resumo: 'Intraempreendedorismo, oportunidades de liderança e legado na Takeat.' },
  { marker: 'ROTINA', occurrence: 1, id: 'rotina-gestor', categoria: 'Liderança', icone: '♢', titulo: 'Rotina do gestor', resumo: 'Rituais, 1:1, auditoria do funil e cadência que sustenta o canal.' }
];

const MARCADORES = ['ECOSSISTEMA TAKEAT', 'GUIA DE EXCELÊNCIA', 'ONBOARDING DE NOVOS EXECUTIVOS',
  'METAS & CADÊNCIA OFICIAL', 'ROTINA', 'GUIA PROSPECÇÃO 1/2', 'GUIA PROSPECÇÃO 2/2',
  'COMO ACHAR O TD', 'CONCORRÊNCIA', 'FOLLOW UP', 'RUA x WHATSAPP', 'QUEBRA DE OBJEÇÕES',
  'TÉCNICAS DE FECHAMENTO', 'CLIENTES X MRR', 'RELACIONAMENTO', 'COMO EVITAR CHURN',
  'PIPELINE', 'DADOS PARA CADASTRO', 'EQUIPAMENTOS', 'FAQ', 'LINKS ÚTEIS',
  'DISPLAYS/COMANDAS', 'PLANO DE CARREIRA'];

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
