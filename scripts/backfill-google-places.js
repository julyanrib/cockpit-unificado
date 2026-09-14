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
/* ══ AS PRACAS SAEM DO MAPA DE TERRITORIOS (14/09/26) ═════════════════════════════
   Julyan: "quero só apenas para os executivos que temos e o que voce ja sabe do bairro
   de cada um".

   A lista anterior era minha, escrita a mao, e ja divergia do mapa real: trazia
   SALVADOR (39 contas boas sem dono, ninguem declarado la), trazia bairros de Sao Paulo
   que ninguem nomeou, e NAO trazia Nova Iguacu, Canoas, Mogi, Suzano e Guarulhos, que
   tem dono. Duas listas para a mesma pergunta divergem em silencio.

   Agora e uma so: data/territorios.json, o MESMO arquivo que o importador usa para
   decidir de quem e o lead. Praca sem executivo deixa de ser buscada por construcao.

   MUNICIPIO INTEIRO -> consulta pela CIDADE (qualquer resultado cai nele de qualquer
   jeito). CIDADE DIVIDIDA -> consulta por BAIRRO NOMEADO, um a um: e a unica forma de
   o resultado cair na pessoa certa. */
const CIDADES = (function () {
  let decl = [];
  try { decl = require('../data/territorios.json').territorios || []; } catch (e) { decl = []; }
  const porCidade = new Map();
  decl.forEach(function (tr) {
    /* rep inativo nao recebe carga — e a mesma trava que o backfill da Casa dos Dados
       usa, e a razao de a Amanda nao aparecer aqui. */
    if (!tr || tr.ativo === false) return;
    (tr.areas || []).forEach(function (a) {
      if (!a || !a.municipio || !a.uf) return;
      const chave = a.municipio + '/' + a.uf;
      if (!porCidade.has(chave)) {
        porCidade.set(chave, { municipio: a.municipio, uf: a.uf, reps: 0, bairros: [], cidadeInteira: false, donos: [] });
      }
      const c = porCidade.get(chave);
      c.reps++;
      if (a.todoOMunicipio) c.cidadeInteira = true;
      (a.bairros || []).forEach(function (b) { if (b && c.bairros.indexOf(b) < 0) c.bairros.push(b); });
      /* ══ POR DONO, E NAO SO POR CIDADE (14/09/26) ══════════════════════════════
         O teto era da cidade e a lista era percorrida em ordem de arquivo: no Rio, os
         quatro primeiros bairros do Bruno encheram as 120 vagas e o Andre ficou com
         ZERO. Guardando por dono, cada um recebe a propria cota. */
      c.donos.push({
        rep: tr.rep,
        alvos: a.todoOMunicipio ? [a.municipio] : (a.bairros || []).slice()
      });
    });
  });

  return [...porCidade.values()].map(function (c) {
    /* A CONSULTA DA CIDADE INTEIRA ENTRA PRIMEIRO e as nomeadas complementam: quando um
       rep tem a cidade toda e outro tem bairros dentro dela (Ricardo e Kelly em Porto
       Alegre), os dois precisam de municao. */
    const alvos = [];
    if (c.cidadeInteira) alvos.push(c.municipio);
    c.bairros.forEach(function (b) { alvos.push(b); });
    return {
      municipio: c.municipio, uf: c.uf,
      /* o total da cidade continua sendo a soma das cotas — e o que o log mostra */
      objetivoMinimo: 12 * c.reps,
      tetoMaximo: 40 * c.reps,
      bairros: alvos,
      /* A COTA DE CADA UM: 12 de objetivo e 40 de teto POR EXECUTIVO. O teto existe
         para nao despejar conta que ninguem le; por cidade, ele virava fila em que o
         primeiro da lista levava tudo. */
      donos: c.donos.map(function (d) {
        return { rep: d.rep, alvos: d.alvos, objetivo: 12, teto: 40 };
      })
    };
  }).filter(function (c) { return c.bairros.length; });
}());

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
  /* ══ RODADA QUE FALHA EM TUDO NAO PODE FICAR VERDE (14/09/26) ══════════════════
     Aconteceu: 33 bairros, todos com 400 do Serper, 0 contas importadas, e a Action
     marcada como SUCESSO. Verde escondendo no-op e pior que vermelho — vermelho
     alguem ve. O backfill da Casa dos Dados ja tinha esta licao escrita no arquivo
     dele; eu nao a apliquei aqui. */
  let bairrosQueFalharam = 0;
  const porPlaceId = new Map();
  /* ══ UM LACO POR EXECUTIVO, CADA UM COM A SUA COTA (14/09/26) ══════════════════
     Julyan: "cada executivo com o seu?". Media no log do Rio de hoje: o teto de 120
     era da CIDADE e a lista era percorrida em ordem de arquivo, entao os quatro
     primeiros bairros do Bruno (Tijuca 57, Vila Isabel 36, Maracanã 26, Andaraí 1)
     encheram as 120 vagas e o laco encerrou. Os 42 bairros do Andre e os 18 do Sandro
     nunca foram consultados: Andre ficou com ZERO contas do Google.

     O teto nao e o defeito — ele existe para nao despejar conta que ninguem vai ler.
     O defeito era ele ser da cidade: virava fila em que o primeiro leva tudo, e nada
     na tela dizia isso. Mais um zero que parece normal.

     A DEDUPLICACAO CONTINUA GLOBAL: o mesmo restaurante nao entra duas vezes, mesmo
     que bairros vizinhos de donos diferentes o devolvam. Quem consultou primeiro fica
     com ele — o mesmo critério de sempre, e a fronteira de bairro resolve o resto. */
  const donos = (cfg.donos && cfg.donos.length)
    ? cfg.donos
    : [{ rep: '(cidade)', alvos: bairros, objetivo: objetivoMinimo, teto: tetoMaximo }];

  for (const dono of donos) {
    const antesDoDono = porPlaceId.size;
    for (const bairro of (dono.alvos || [])) {
      /* a cota E DELE: o que os outros ja trouxeram nao consome a vaga dele */
      if ((porPlaceId.size - antesDoDono) >= dono.teto) break;
      const consulta = `restaurantes em ${bairro}, ${municipio} ${uf}`;
      let achados = [];
      try {
        /* O LOCAL VAI JUNTO: o Google Maps responde conforme de onde a busca parte, e
           sem ele "Centro" pode cair no Centro errado do pais. */
        achados = await buscarBairro(chave, consulta, `${municipio}, ${uf}, Brazil`);
      } catch (e) {
        /* Um bairro que falha nao derruba a praca: o resto continua valendo, e o log
           diz qual caiu. Silenciar seria pior — a proxima rodada nao saberia. */
        console.error(`[places] ${municipio}/${bairro} falhou: ${e.message}`);
        bairrosQueFalharam++;
        continue;
      }
      let aceitos = 0;
      for (const l of achados) {
        /* avaliacoes null cai fora porque sem ela nao da para ORDENAR por mais avaliado
           — e ausencia de medicao nao vira zero. nota null PASSA: o lugar pode ter
           volume e nao ter media publicada, e isso nao o torna menos alvo. */
        if (l.avaliacoes == null) continue;
        if (l.avaliacoes < AVALIACOES_MINIMAS) continue;
        if (porPlaceId.has(l.place_id)) continue;
        porPlaceId.set(l.place_id, l);
        aceitos++;
        if ((porPlaceId.size - antesDoDono) >= dono.teto) break;
      }
      console.log(`[places] ${municipio}/${bairro} (${dono.rep}): ${achados.length} candidato(s),`
        + ` ${aceitos} no corte — cota dele ${porPlaceId.size - antesDoDono}/${dono.teto}`);
    }
    const doDono = porPlaceId.size - antesDoDono;
    if (doDono < dono.objetivo) {
      console.warn(`[places] ${municipio}/${uf} — ${dono.rep}: ${doDono} conta(s), abaixo do`
        + ` objetivo de ${dono.objetivo}. Lista de bairros curta para ele, nao erro de execução.`);
    }
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
  buscarCidade.ultimaFalha = { bairros: bairros.length, falharam: bairrosQueFalharam };
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
  /* ══ COMPARA OS DOIS ENDPOINTS (14/09/26) ════════════════════════════════════════
     A amostra mostrou telefone null e contagem de avaliacoes de um digito na area mais
     densa de Vitoria. Antes de mexer no piso ou na lista de categorias eu preciso saber
     se o problema e o endpoint. Uma consulta em cada, lado a lado. */
  if (process.argv.includes('--comparar')) {
    const consulta = process.env.AMOSTRA_CONSULTA || 'restaurantes em Praia do Canto, Vitória ES';
    const local = process.env.AMOSTRA_LOCAL || 'Vitória, ES, Brazil';
    for (const caminho of ['places', 'maps']) {
      console.log('');
      console.log('══════ /' + caminho + ' ══════ consulta: ' + consulta);
      try {
        const resp = await fetch('https://google.serper.dev/' + caminho, {
          method: 'POST',
          headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: consulta, gl: 'br', hl: 'pt-br', location: local })
        });
        console.log('  HTTP ' + resp.status);
        const d = await resp.json();
        console.log('  chaves de topo: ' + Object.keys(d).join(', '));
        const lista = d.places || d.local_results || d.results || [];
        console.log('  itens: ' + lista.length);
        if (lista.length) {
          console.log('  PRIMEIRO ITEM CRU:');
          console.log(JSON.stringify(lista[0], null, 2).split('\n').map(function (l) { return '    ' + l; }).join('\n'));
          console.log('  RESUMO DOS ' + lista.length + ':');
          lista.forEach(function (x) {
            console.log('    ' + String(x.title || x.name || '?').slice(0, 30).padEnd(30)
              + ' cat=' + String(x.category || x.type || '-').slice(0, 18).padEnd(18)
              + ' aval=' + String(x.ratingCount != null ? x.ratingCount : (x.reviews != null ? x.reviews : '-')).padEnd(7)
              + ' tel=' + String(x.phoneNumber || x.phone || '-'));
          });
        }
      } catch (e) { console.error('  falhou: ' + (e && e.message)); }
    }
    return;
  }

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
    /* ZERO POR FALHA E ZERO POR AUSENCIA SAO COISAS OPOSTAS. Se a API recusou todas as
       consultas, a rodada FALHOU e tem de ficar vermelha; se ela respondeu e nao havia
       nada no corte, a rodada funcionou e o zero e informacao. */
    const f = buscarCidade.ultimaFalha;
    if (f && f.falharam > 0 && f.falharam === f.bairros) {
      console.error('[places] NENHUMA consulta foi respondida — a rodada falhou, não é praça vazia.');
      console.error('  Os ' + f.falharam + ' bairros da última praça devolveram erro. Veja as linhas acima.');
      process.exit(1);
    }
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

  /* ══ EM LOTES, E SEQUENCIAL (14/09/26) ════════════════════════════════════════════
     O importador recusa acima de 500 por chamada, e a rodada das 12 pracas achou 651:
     nada entrou. Lotes de 200 — nao de 499 — porque o objetivo nao e raspar o teto, e
     sim cada lote falhar sozinho: uma recusa custa 200 contas e as outras entram.
     Sequencial pela mesma razao do envio de paradas da rota: chamadas simultaneas no
     mesmo endpoint de escrita fazem o dedup dele decidir por ordem de chegada. */
  const TAMANHO_DO_LOTE = 200;
  const somado = { criados: 0, duplicados: 0, reprovados_qualidade: 0, reprovados_fit: 0 };
  const lotes = [];
  for (let i = 0; i < todos.length; i += TAMANHO_DO_LOTE) lotes.push(todos.slice(i, i + TAMANHO_DO_LOTE));
  let lotesQueFalharam = 0;

  for (let i = 0; i < lotes.length; i++) {
    const lote = lotes[i];
    const resp = await fetch(`${COCKPIT_URL}/api/importar-leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-import-secret': segredo },
      /* fonte: 'google_places' — a chave que FONTES_ROTULO ja conhece. Escrever "Google
         Places" com espaco criaria um QUARTO rotulo para a mesma fonte. */
      body: JSON.stringify({ fonte: 'google_places', leads: lote })
    });
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      lotesQueFalharam++;
      console.error(`[places] lote ${i + 1}/${lotes.length} (${lote.length} contas) recusado`
        + ` — ${resp.status}: ${JSON.stringify(dados).slice(0, 300)}`);
      continue;
    }
    somado.criados += (dados.leadsCriados ? dados.leadsCriados.length : (dados.criados || 0));
    somado.duplicados += (dados.duplicados || 0);
    somado.reprovados_qualidade += (dados.reprovadosQualidade || dados.reprovados_qualidade || 0);
    somado.reprovados_fit += (dados.reprovadosFit || dados.reprovados_fit || 0);
    console.log(`[places] lote ${i + 1}/${lotes.length}: ${lote.length} enviadas, `
      + `${dados.leadsCriados ? dados.leadsCriados.length : (dados.criados || 0)} criadas.`);
  }

  /* LOTE QUE CAI NAO PODE SUMIR NO VERDE: se TODOS falharam nada entrou, e a rodada e
     uma falha; se alguns entraram, a rodada vale mas o aviso tem de aparecer. */
  if (lotesQueFalharam) {
    console.error(`[places] ${lotesQueFalharam} de ${lotes.length} lote(s) foram recusados — veja acima.`);
  }
  const dados = somado;
  if (lotesQueFalharam === lotes.length) {
    console.error('[places] NENHUM lote entrou. A rodada falhou.');
    process.exit(1);
  }
  /* o total da rodada inteira, somado lote a lote */
  console.log('[places] importado: ' + JSON.stringify(dados));
}

principal().catch(e => {
  console.error('[places] rodada falhou: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
