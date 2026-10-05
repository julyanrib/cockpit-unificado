/* ============================================================================
   O PLANEJAMENTO BATE COM O MAPA (06/10/26, auditoria do Planejamento)

   Medido na produção, André: 48 de 65 negócios com pino no app apareciam como "sem
   endereço no CRM"; os 11 clientes em queda do mapa não existiam no Planejamento; e a
   conta nova ordenava ao contrário (as de 4,8★ do Google no fim de 149, em páginas de 6).
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const tpl = fs.readFileSync(path.join(__dirname, '..', 'template', 'cockpit.template.html'), 'utf8');

let ok = 0;
const falhas = [];
const checar = (nome, cond, porque) => { if (cond) { ok++; return; } falhas.push(nome + (porque ? ' — ' + porque : '')); };
function recortar(nome) {
  const i = tpl.indexOf('function ' + nome + '(');
  if (i < 0) return '';
  let n = 0, j = tpl.indexOf('{', i);
  for (; j < tpl.length; j++) { if (tpl[j] === '{') n++; else if (tpl[j] === '}') { n--; if (!n) break; } }
  return tpl.slice(i, j + 1);
}

/* 1 · o pino vence a fonte, e sem pino nada muda */
{
  const ctx = { PL6_PINO: null, Map: Map, Object: Object, String: String, Number: Number, isNaN: isNaN };
  vm.createContext(ctx);
  vm.runInContext(recortar('pl6ComPino'), ctx);
  const lead = { id: '1', name: 'X', lat: null, lng: null, bairro: null };
  checar('sem pinos lidos, o lead fica como veio', ctx.pl6ComPino(lead, { deal: '1' }) === lead);
  ctx.PL6_PINO = { porDeal: new Map([['1', { lat: -22.9, lng: -43.2, bairro: 'Anil', cidade: 'Rio', cep: '22750', logradouro: 'Rua A' }]]), porLead: new Map() };
  const com = ctx.pl6ComPino(lead, { deal: '1' });
  checar('com pino, o lugar é o do pino', com.lat === -22.9 && com.lng === -43.2 && com.bairro === 'Anil' && com._pino === true);
  checar('e o objeto da carga não é mexido', lead.lat === null && com !== lead);
  checar('negócio sem pino continua sem lugar', ctx.pl6ComPino({ id: '2', lat: null }, { deal: '2' }).lat === null);
}

/* 2 · as quatro fontes passam pelo pino */
checar('a carteira usa o pino', /const d = pl6ComPino\(d0, \{ deal: d0\.id \}\);/.test(recortar('pl6Carteira')));
checar('a base usa o pino', /const d = pl6ComPino\(d0, \{ deal: d0\.id \}\);/.test(recortar('pl6Base')));
checar('a reciclagem usa o pino', /pl6ComPino\(l0, \{ deal: l0\.id \}\)/.test(recortar('pl6Reciclagem')));
checar('a conta importada usa o pino (corrigido na rua vence a importação)', /pl6ComPino\(l0, \{ lead: l0\.id \}\)/.test(recortar('pl6Novos')));
checar('as regiões também', (recortar('pl6FontesCruas').match(/pl6ComPino\(/g) || []).length === 3);
checar('o "onde" do funil acha o lugar (o bruto vai junto)',
  /_bruto: d,/.test(recortar('pl6Carteira')) && /_bruto: d,/.test(recortar('pl6Base')));

/* 3 · em queda vem da mesma função do mapa e entra no relacionamento */
const carga = recortar('pl6CarregarPinosDoApp');
checar('em queda sai de mapa_contexto, filtrado pelo dono do território',
  /supa\.rpc\('mapa_contexto'\)/.test(carga) && /String\(q\[3\]\) === dono/.test(carga));
checar('e entra como conta de relacionamento pelo negócio (c-)',
  /id: 'c-' \+ q\.c\.id_hubspot, tipo: 'c', base: true, emQueda: q\.motivo,/.test(recortar('pl6EmQueda')));
checar('sem repetir o cliente que já está na base ou na carteira',
  /if \(b\) \{ b\.emQueda = q\.emQueda; return false; \}/.test(recortar('pl6TodasAsContas'))
    && /!naCarteira\.has\(q\.id\)/.test(recortar('pl6TodasAsContas')));
checar('a carga do Planejamento lê os pinos junto', /pl6CarregarPinosDoApp\(rep\)\.catch/.test(recortar('pl6Carregar')));
checar('o PostgREST é paginado', /\.range\(de, de \+ 999\)/.test(carga));

/* 4 · a ordem e as faixas da conta nova */
checar('conta nova: maior prioridade primeiro', /return pl6Prioridade\(b\) - pl6Prioridade\(a\);/.test(tpl)
  && !/return pl6Prioridade\(a\) - pl6Prioridade\(b\);/.test(tpl),
  'a - b punha as sem nota na frente das de 4,8★');
checar('faixas por fonte: Google, Casa dos Dados, rua',
  tpl.indexOf("{ id: 'g:aval', rot: 'Google avaliações'") > -1 && tpl.indexOf("{ id: 'g:casa', rot: 'Casa dos Dados'") > -1
    && /faixaAtiva\.indexOf\('g:'\) === 0/.test(tpl));
checar('relacionamento: faixa e prioridade de em queda',
  tpl.indexOf("{ id: 'queda', rot: 'em queda'") > -1 && /if \(propAtivo === 'relac' && !!a\.emQueda !== !!b\.emQueda\)/.test(tpl));

if (falhas.length) {
  console.log('FALHOU: ' + falhas.length);
  falhas.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('planejamento × mapa: ' + ok + ' verificações · tudo certo.');
