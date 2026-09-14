// scripts/backfill-google-places.js
//
// OS MAIS BEM AVALIADOS, AUTOMATICO E EM LOTE (Google Places).
//
// Pedido do Julyan (03/09/26): "temos que puxar esses leads da casa dos dados, e os mais
// avaliados tem q vir do google places, isso tem q ser automatico, obvio q em lotes para
// nao sujar o funil do executivo".
//
// A Casa dos Dados JA ERA AUTOMATICA — medido antes de escrever isto: 1032 contas na base,
// ultima carga em 01/09 (a segunda-feira do cron). O que faltava era este lado.
//
// AS DUAS FONTES TEM REGUAS OPOSTAS, E ISSO E DELIBERADO:
//
//   Casa dos Dados   quem ABRIU AGORA. Nao tem avaliacao nenhuma — nao e lead ruim, e
//                    lead novo: ainda nao escolheu PDV, ainda nao assinou com ninguem.
//   Google Places    quem tem MAIS VOLUME de avaliacao — bem OU mal avaliado. Ja tem
//                    fornecedor, mas a operacao e grande e o ticket, maior.
//
// Sao complementares, nao redundantes. api/novidades-mercado.js ja registra essa
// distincao por escrito; este arquivo e o outro lado dela.
//
// POR QUE MENSAL, E NAO SEMANAL COMO A CASA DOS DADOS:
// Restaurante bem avaliado nao aparece de uma semana para a outra — a nota e a contagem
// de avaliacoes se movem em meses. Rodar toda semana devolveria quase o mesmo conjunto, o
// dedup do importador jogaria fora, e a unica coisa que mudaria seria a fatura da API do
// Google. Abertura nova, ao contrario, acontece toda semana — por isso a outra fonte e
// semanal. A cadencia segue o dado, nao a vontade de parecer ativo.
//
// COMO O LOTE PROTEGE O FUNIL:
// Cada cidade tem objetivoMinimo (para nao chegar vazio) e tetoMaximo (para nao virar
// fila que ninguem le). O teto aqui e BEM MENOR que o da Casa dos Dados: 40 contra 150-500.
// Conta madura exige um ciclo de venda mais longo, e cinquenta delas de uma vez na tela do
// executivo nao e oportunidade — e ruido que enterra o que ele ia fazer hoje.
//
// NENHUMA REGRA DE NEGOCIO NOVA AQUI. Roteamento por territorio, deduplicacao (por
// place_id e entre fontes), corte de qualidade e limpeza de rede excluida ja vivem em
// api/importar-leads.js, que e testado. Este script so BUSCA e entrega.
//
// Variaveis de ambiente:
//   GOOGLE_PLACES_API_KEY  -> chave do Google Cloud com a Places API (New) habilitada
//   IMPORT_SECRET          -> mesmo segredo que api/importar-leads.js valida
//   COCKPIT_URL            -> opcional, default aponta pra producao
//   PULAR_CIDADES          -> opcional, nomes separados por virgula

const fs = require('fs');
const path = require('path');

/* ══ A FONTE MUDOU PARA O SERPER (14/09/26) ═══════════════════════════════════════
   A Places API (New) exige projeto no Google Cloud com billing ligado, e a chave nunca
   existiu — conferido nos dois lugares: Secrets do GitHub e env vars da Vercel. Este
   coletor esta escrito desde 03/09 e NUNCA rodou uma vez por causa disso.

   O Serper devolve o mesmo dado do Google Maps por uma chave so. A busca e a traducao
   moram em lib/serper-places.js — inclusive o filtro de "so restaurante", que e o
   pedido do Julyan de hoje. Daqui para baixo nada mudou. */
const { buscarLugares } = require('../lib/serper-places.js');
const COCKPIT_URL = process.env.COCKPIT_URL || 'https://fieldsalestakeat.vercel.app';

/* ══ O CORTE E DE VOLUME, NAO DE QUALIDADE (mudado em 03/09/26) ══════════════════════
   Julyan: "eu quero dos MAIS avaliados independente se sao bons ou ruins".

   A VERSAO ANTERIOR exigia nota >= 4,5 — e aquele numero nao era invencao minha: era o
   criterio que ele proprio validou no sourcing mensal, escrito na skill de contas-alvo.
   Ele mudou de posicao, e a posicao nova e melhor que a antiga. Fica registrado como
   MUDANCA, e nao reescrito como se sempre tivesse sido assim.

   POR QUE A NOTA NAO DEVE FILTRAR:
     nota          mede a EXPERIENCIA de quem foi la
     avaliacoes    mede o TAMANHO da operacao — quanta gente passa por ali

   Uma casa com 3,2 e cinco mil avaliacoes nao e um lead ruim: e uma operacao grande com
   problema operacional. E problema operacional com volume e o melhor argumento de venda
   que a Takeat tem — PDV e gestao existem para isso. Cortar por nota alta deixava de fora
   exatamente quem mais precisa, e ficava com quem ja esta bem servido.

   O QUE SOBRA COMO CORTE e o piso de volume: abaixo de 100 avaliacoes nao da para chamar
   de "mais avaliado". E a ordenacao por avaliacoes decrescente, com o teto cortando pelo
   fim da fila, e o que faz "os MAIS avaliados" ser literalmente verdade.

   A NOTA CONTINUA SENDO GRAVADA e aparece no card ("nota 3,2 · 5.140 avaliações"): ela
   deixou de ser porteira e virou informacao de abordagem. Saber que a casa tem volume E
   nota baixa muda a primeira frase da visita. */
const AVALIACOES_MINIMAS = 100;

/* Trava de seguranca: nunca pagina para sempre, mesmo se a API responder bem. */
const MAX_PAGINAS_POR_CONSULTA = 3;   // 20 por pagina => ate 60 candidatos por bairro

/* ══ AS PRACAS, E POR QUE POR BAIRRO ══════════════════════════════════════════════════
   A Places API responde no maximo ~20 por consulta de texto. Uma consulta por CIDADE
   devolveria os mesmos vinte de sempre — os mais famosos do centro — e o executivo nunca
   veria o bairro onde ele realmente anda. Por isso a consulta e por bairro, com os bairros
   de maior densidade comercial de cada praca.

   Os bairros de Vitoria e Vila Velha vem do sourcing que ja rodou (skill de contas-alvo);
   os das outras pracas foram escolhidos por densidade de foodservice e ficam aqui para
   serem corrigidos com o tempo — nome de bairro errado nao quebra nada, so devolve pouco. */
const CIDADES = [
  { municipio: 'Vila Velha', uf: 'ES', objetivoMinimo: 12, tetoMaximo: 40,
    bairros: ['Centro de Vila Velha', 'Praia da Costa', 'Itapuã', 'Praia de Itaparica', 'Glória'] },
  { municipio: 'Vitória', uf: 'ES', objetivoMinimo: 12, tetoMaximo: 40,
    bairros: ['Centro', 'Praia do Canto', 'Jardim da Penha', 'Jardim Camburi', 'Mata da Praia'] },
  { municipio: 'Rio de Janeiro', uf: 'RJ', objetivoMinimo: 20, tetoMaximo: 60,
    bairros: ['Copacabana', 'Ipanema', 'Leblon', 'Botafogo', 'Barra da Tijuca', 'Tijuca', 'Centro'] },
  { municipio: 'São Paulo', uf: 'SP', objetivoMinimo: 20, tetoMaximo: 60,
    bairros: ['Mooca', 'Pinheiros', 'Vila Madalena', 'Itaim Bibi', 'Tatuapé', 'Moema'] },
  { municipio: 'Porto Alegre', uf: 'RS', objetivoMinimo: 12, tetoMaximo: 40,
    bairros: ['Moinhos de Vento', 'Cidade Baixa', 'Bom Fim', 'Auxiliadora', 'Petrópolis'] },
  { municipio: 'Salvador', uf: 'BA', objetivoMinimo: 12, tetoMaximo: 40,
    bairros: ['Rio Vermelho', 'Barra', 'Pituba', 'Itaigara', 'Pelourinho'] }
];

const semAcento = s => String(s || '').normalize('NFD')
  .split('').filter(c => { const p = c.charCodeAt(0); return p < 0x300 || p > 0x36f; }).join('')
  .toLowerCase().trim();

/* ══ A BUSCA DE UM BAIRRO ═════════════════════════════════════════════════════════
   Era uma chamada direta a Places API com FieldMask e paginacao por pageToken. Agora
   delega: lib/serper-places.js busca, traduz e ja devolve SO restaurante, com a conta
   do que descartou e por que. O `local` vai junto porque o Google Maps responde
   conforme de onde a busca parte — sem ele, "Centro" cai no Centro errado do pais. */
let descartesDaPraca = {};

async function buscarBairro(chave, consulta, local) {
  const r = await buscarLugares(chave, consulta, { local: local, maxPaginas: MAX_PAGINAS_POR_CONSULTA });
  Object.keys(r.descartes || {}).forEach(function (m) {
    descartesDaPraca[m] = (descartesDaPraca[m] || 0) + r.descartes[m];
  });
  return r.lugares;
}

async function buscarCidade(cfg, chave) {
  const { municipio, uf, bairros, objetivoMinimo, tetoMaximo } = cfg;
  const porPlaceId = new Map();
  for (const bairro of bairros) {
    if (porPlaceId.size >= tetoMaximo) break;
    const consulta = `restaurantes em ${bairro}, ${municipio} ${uf}`;
    let achados = [];
    try {
      /* O LOCAL VAI JUNTO: o Google Maps responde conforme de onde a busca parte, e sem
         ele "Centro" pode cair no Centro errado do pais. */
      achados = await buscarBairro(chave, consulta, `${municipio}, ${uf}, Brazil`);
    } catch (e) {
      /* Um bairro que falha nao derruba a praca: o resto da cidade continua valendo, e o
         log diz qual caiu. Silenciar seria pior — a proxima rodada nao saberia. */
      console.error(`[places] ${municipio}/${bairro} falhou: ${e.message}`);
      continue;
    }
    let aceitos = 0;
    for (const l of achados) {
      /* avaliacoes null cai fora porque sem ela nao da para ORDENAR por mais avaliado —
         e ausencia de medicao nao vira zero. nota null PASSA: o lugar pode ter volume e
         nao ter media publicada, e isso nao o torna menos alvo. */
      if (l.avaliacoes == null) continue;
      if (l.avaliacoes < AVALIACOES_MINIMAS) continue;
      if (porPlaceId.has(l.place_id)) continue;
      porPlaceId.set(l.place_id, l);
      aceitos++;
      if (porPlaceId.size >= tetoMaximo) break;
    }
    console.log(`[places] ${municipio}/${bairro}: ${achados.length} candidato(s), ${aceitos} no corte`
      + ` (${AVALIACOES_MINIMAS}+ avaliações, sem corte de nota) — acumulado ${porPlaceId.size}/${tetoMaximo}`);
  }
  /* Os mais avaliados primeiro: quando o teto corta, corta pelo fim da fila. */
  /* O QUE CAIU, E POR QUE. Sem esta linha, praca que rende pouco parece praca sem
     restaurante — e pode ser a minha lista de categorias cortando demais. */
  const motivos = Object.keys(descartesDaPraca).sort((a, b) => descartesDaPraca[b] - descartesDaPraca[a]);
  if (motivos.length) {
    console.log(`[places] ${municipio}/${uf} — descartados por categoria: `
      + motivos.slice(0, 6).map(m => `${descartesDaPraca[m]}x ${m}`).join(' · '));
  }
  descartesDaPraca = {};

  const lista = [...porPlaceId.values()].sort((a, b) => (b.avaliacoes || 0) - (a.avaliacoes || 0));
  const finais = lista.slice(0, tetoMaximo);
  if (finais.length < objetivoMinimo) {
    console.warn(`[places] ${municipio}/${uf}: ${finais.length} conta(s), abaixo do objetivo de ${objetivoMinimo}.`
      + ' Isso costuma ser lista de bairros curta para a praça — não é erro de execução.');
  }
  return finais;
}

async function principal() {
  const chave = process.env.SERPER_API_KEY;
  if (!chave) {
    console.error('[places] SERPER_API_KEY ausente. Esta rodada não tem como buscar nada.');
    console.error('  Para ligar: serper.dev → API keys → copiar a chave →');
    console.error('  GitHub → Settings → Secrets and variables → Actions → SERPER_API_KEY.');
    console.error('  Sem a chave o script sai com erro de propósito: rodada silenciosa que não');
    console.error('  importa nada é pior que rodada que falha e avisa.');
    process.exit(1);
  }

  /* ══ MODO AMOSTRA: UMA CONSULTA, NADA IMPORTADO (14/09/26) ═══════════════════════
     Eu escrevi a traducao dos campos do Serper SEM poder testar contra a API — a chave
     nao e minha para ter. Escrever leitor contra formato suposto e como ja perdi um dia
     nesta base: o codigo fica valido, a resposta chega, e todo registro sai null sem
     ninguem reclamar.

     Entao existe este modo: UMA busca, e imprime o registro CRU ao lado do TRADUZIDO,
     mais o veredito de categoria de cada resultado. Rodar isto antes da primeira carga
     e o que separa "integrei" de "achei que integrei". Nada e importado aqui. */
  if (process.argv.includes('--amostra')) {
    const { buscarPagina, normalizarLugar, categoriaDeRestaurante } = require('../lib/serper-places.js');
    const consulta = process.env.AMOSTRA_CONSULTA || 'restaurantes em Praia do Canto, Vitória ES';
    const local = process.env.AMOSTRA_LOCAL || 'Vitória, ES, Brazil';
    console.log('[amostra] consulta: ' + consulta + '   ·   local: ' + local);
    const { bruto } = await buscarPagina(chave, consulta, local, 1);
    console.log('[amostra] a API devolveu ' + bruto.length + ' resultado(s).');
    if (!bruto.length) return;
    console.log('');
    console.log('[amostra] ── REGISTRO CRU, como o Serper mandou ──────────────────');
    console.log(JSON.stringify(bruto[0], null, 2));
    console.log('');
    console.log('[amostra] ── TRADUZIDO, como o cockpit gravaria ──────────────────');
    console.log(JSON.stringify(normalizarLugar(bruto[0]), null, 2));
    console.log('');
    console.log('[amostra] ── QUEM ENTRA E QUEM SAI, pelo filtro de restaurante ───');
    bruto.map(normalizarLugar).filter(Boolean).forEach(function (l) {
      const v = categoriaDeRestaurante(l.categoria);
      console.log('  ' + (v.aceito ? 'ENTRA' : 'sai  ') + '  '
        + String(l.nome).slice(0, 32).padEnd(32) + '  '
        + String(l.categoria || '(sem categoria)').slice(0, 26).padEnd(26) + '  '
        + (l.avaliacoes == null ? 'sem avaliações' : l.avaliacoes + ' aval.').padEnd(16)
        + '· ' + v.motivo);
    });
    console.log('');
    console.log('[amostra] nada foi importado. Confira os campos e rode sem --amostra.');
    return;
  }

  const pular = String(process.env.PULAR_CIDADES || '').split(',').map(semAcento).filter(Boolean);
  const daRodada = CIDADES.filter(c => !pular.includes(semAcento(c.municipio)));
  if (pular.length) {
    console.log('[places] pulando nesta rodada: ' + CIDADES.filter(c => pular.includes(semAcento(c.municipio)))
      .map(c => c.municipio).join(', '));
  }

  const todos = [];
  for (const cfg of daRodada) {
    const leads = await buscarCidade(cfg, chave);
    console.log(`[places] ${cfg.municipio}/${cfg.uf}: ${leads.length} conta(s) para importar.`);
    todos.push(...leads);
  }

  console.log(`[places] total da rodada: ${todos.length} conta(s) em ${daRodada.length} praça(s).`);
  if (!todos.length) {
    console.warn('[places] nada para importar. Saindo sem chamar o importador.');
    return;
  }

  const segredo = process.env.IMPORT_SECRET;
  if (!segredo) {
    /* MESMA PONTE que o backfill da Casa dos Dados usa: sem o segredo, grava o JSON como
       artefato da execucao para importacao manual, em vez de perder a rodada inteira. */
    const dir = path.join(__dirname, '..', 'artifacts');
    fs.mkdirSync(dir, { recursive: true });
    const arquivo = path.join(dir, 'leads-google-places.json');
    fs.writeFileSync(arquivo, JSON.stringify({ fonte: 'google_places', leads: todos }, null, 2));
    console.warn('[places] IMPORT_SECRET ausente — nada foi importado.');
    console.warn(`  As ${todos.length} contas ficaram em ${arquivo}, anexado como artefato da execução.`);
    console.warn('  Para importar automaticamente: IMPORT_SECRET nos dois lados (GitHub Actions e Vercel).');
    return;
  }

  const resp = await fetch(`${COCKPIT_URL}/api/importar-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-import-secret': segredo },
    /* fonte: 'google_places' — a chave que FONTES_ROTULO ja conhece. Escrever "Google
       Places" com espaco criaria um QUARTO rotulo para a mesma fonte: a base ja tem
       "Google Places", "google_places" e "outscraper + Google Places", e cada rotulo novo
       quebra a metrica por origem em mais um pedaco. */
    body: JSON.stringify({ fonte: 'google_places', leads: todos })
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`[places] importador respondeu ${resp.status}: ${JSON.stringify(dados).slice(0, 400)}`);
    process.exit(1);
  }
  console.log('[places] importado: ' + JSON.stringify({
    criados: dados.leadsCriados ? dados.leadsCriados.length : dados.criados,
    duplicados: dados.duplicados,
    reprovados_qualidade: dados.reprovados_qualidade,
    reprovados_fit: dados.reprovados_fit
  }));
}

principal().catch(e => {
  console.error('[places] rodada falhou: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
