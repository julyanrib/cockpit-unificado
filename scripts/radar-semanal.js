#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════════════
   O RADAR SEMANAL DAS PRAÇAS (09/09/26; só as praças desde 20/11/26)
   ═══════════════════════════════════════════════════════════════════════════════════════
   Roda segunda 06h BRT (09:00 UTC) e escreve em `radar_pracas`: o TAM de cada praça (CNPJs
   food ativos na Receita, pela Casa dos Dados) e quanto dele o funil já tocou. Nada aqui
   inventa número nem frase.

   AS NOTÍCIAS DO SETOR SAÍRAM EM 20/11/26. Esta rodada também coletava manchetes (Abrasel
   pelo índice de busca, feeds de veículo) e gravava em `noticias_setor` — e nenhuma tela lia
   essa tabela desde a prancha FINAL de Rotas (11/09). A faxina final tirou a coleta e a
   tabela junto; o histórico do porquê das fontes está no git (antes de 20/11/26).
   ═══════════════════════════════════════════════════════════════════════════════════════ */

/* Sem acento, sem caixa e sem pontuação. As DUAS metades do radar dependem disto — o
   filtro de época e o dedupe por história, aqui; e o casamento de cidade, mais abaixo. A
   substituição usa String.fromCharCode porque a faixa de acentos escrita literalmente já
   morreu duas vezes atravessando patch e shell nesta base. */
const semAcento = t => String(t || '').toLowerCase().normalize('NFD')
  .replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function segundaDaSemana(d) {
  const base = d ? new Date(d) : new Date();
  const dow = (base.getUTCDay() + 6) % 7;
  const seg = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - dow));
  return seg.toISOString().slice(0, 10);
}

/* ══ AS PRAÇAS VÊM DE UM LUGAR SÓ ══════════════════════════════════════════════════════
   CIDADES é a lista que o backfill de segunda já usa para buscar contas. Copiá-la aqui
   criaria a sexta ocorrência do problema que passei a semana consertando: a mesma regra
   escrita em dois lugares, divergindo em silêncio. O require é seguro — aquele arquivo
   tem guarda `require.main === module` e não roda nada ao ser importado. */
const { CIDADES } = require('./backfill-casa-dos-dados');

/* ══ O TAM DE UMA PRAÇA, PELO CAMINHO BARATO ═══════════════════════════════════════════
   A Casa dos Dados é paga por consulta. Contar a cidade inteira paginando custaria
   crédito toda semana, em seis praças — e o número não vale isso.

   ENTÃO A TENTATIVA É UMA CONSULTA DE UM ITEM, lendo qualquer campo de total que a
   resposta traga. A documentação pública do provedor NÃO expõe o schema da resposta
   (conferido em docs.casadosdados.com.br: a página de informações básicas tem
   autenticação, host e um exemplo de /v4, e nada do retorno de /v5/cnpj/pesquisa), e o
   token vive só nos Secrets — então não posso provar, antes de a primeira rodada correr,
   que existe campo de total. Por isso a função procura os nomes prováveis e, quando não
   acha, devolve 'nao_medido' COM O MOTIVO ESCRITO, que a tela mostra.

   O QUE ELA NUNCA FAZ: devolver zero. TAM zero numa cidade com restaurantes é o número
   que faria a tela dizer "0% tocado" e o gestor decidir por um dado inexistente.

   O CORPO DA CONSULTA É O MESMO do backfill, MENOS os filtros que estreitam: sem janela
   de data_abertura, sem excluir MEI, sem exigir telefone. Aqui a pergunta é "quantos
   estabelecimentos food ativos a cidade tem", não "quais valem uma visita". */
const CASA_URL = 'https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo';
const CNAE_FOODSERVICE = ['5611201', '5611202', '5611203', '5611204', '5620104', '4721102', '1091102'];
const CAMPOS_DE_TOTAL = ['total', 'total_registros', 'totalRegistros', 'count', 'quantidade',
  'total_encontrados', 'totalEncontrados', 'registros_encontrados'];

/* Procura em profundidade, porque provedor nenhum promete o total na raiz — e devolve o
   CAMINHO do campo, não só o número, para `tam_detalhe` poder dizer de onde ele veio. */
function acharTotal(obj, prof) {
  prof = prof || 0;
  if (!obj || typeof obj !== 'object' || prof > 3) return null;
  for (const c of CAMPOS_DE_TOTAL) {
    const v = obj[c];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return { campo: c, valor: Math.round(v) };
    if (typeof v === 'string' && /^\d+$/.test(v)) return { campo: c, valor: Number(v) };
  }
  for (const k of Object.keys(obj)) {
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      const achado = acharTotal(obj[k], prof + 1);
      if (achado) return { campo: k + '.' + achado.campo, valor: achado.valor };
    }
  }
  return null;
}

async function tamDaPraca(municipio, uf) {
  const token = process.env.CASADOSDADOS_TOKEN;
  if (!token) {
    return { tam: null, fonte: 'nao_medido', detalhe: 'CASADOSDADOS_TOKEN ausente nesta rodada' };
  }
  const corpo = JSON.stringify({
    codigo_atividade_principal: CNAE_FOODSERVICE,
    situacao_cadastral: ['ATIVA'],
    uf: [String(uf).toLowerCase()],
    municipio: [semAcento(municipio)],
    limite: 1,
    pagina: 1
  });
  /* as mesmas quatro variantes de cabeçalho do backfill. A lista existe porque a API já
     trocou o nome do header uma vez, e descobrir isso num domingo custa a rodada. */
  const variantes = [{ 'api-key': token }, { api_key: token },
    { Authorization: 'Bearer ' + token }, { 'x-api-key': token }];
  let ultimoErro = 'a API não respondeu';
  for (const h of variantes) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(CASA_URL, {
        method: 'POST', signal: ctrl.signal,
        headers: Object.assign({ 'Content-Type': 'application/json' }, h),
        body: corpo
      });
      clearTimeout(timer);
      const texto = await r.text();
      if (!r.ok) { ultimoErro = 'a API respondeu ' + r.status; continue; }
      let j = null;
      try { j = JSON.parse(texto); } catch (e) { j = null; }
      if (!j) { ultimoErro = 'a API respondeu 200 com corpo que nao e JSON'; continue; }
      const achado = acharTotal(j);
      if (achado) {
        return { tam: achado.valor, fonte: 'contagem_api',
          detalhe: 'campo "' + achado.campo + '" da Casa dos Dados · '
            + CNAE_FOODSERVICE.length + ' CNAEs food, situação ATIVA' };
      }
      /* Respondeu, autenticou, e não trouxe total. Este é o caso que a coluna tam_fonte
         existe para dizer — e paginar a cidade toda semana para contar é o que não vamos
         fazer com crédito pago. */
      return { tam: null, fonte: 'nao_medido',
        detalhe: 'a Casa dos Dados autenticou e respondeu sem campo de total (procurei '
          + CAMPOS_DE_TOTAL.length + ' nomes); contar paginando a cidade queimaria crédito toda semana' };
    } catch (e) {
      clearTimeout(timer);
      ultimoErro = e.name === 'AbortError' ? 'a API não respondeu em 20s' : e.message;
    }
  }
  return { tam: null, fonte: 'nao_medido', detalhe: ultimoErro };
}

/* ══ QUANTO DA PRAÇA JÁ FOI TOCADO ═════════════════════════════════════════════════════
   `tocado` = negócios do funil de Field Sales cuja cidade é a da praça, EM QUALQUER
   ETAPA — inclusive Perdido. Perdido é conta tocada: quem já foi visitado e disse não
   não é mercado virgem, e contá-lo como não-tocado inflaria o que resta a fazer.

   ══ O QUE EU MEDI NO SNAPSHOT AO VIVO, E O QUE ISSO OBRIGA A ESCREVER ═══════════════
   196 negócios no funil; 153 têm `cidade` preenchida e 43 NÃO TÊM NENHUMA. Esses 43 não
   entram em praça alguma — então `tocado` é PISO, nunca total, e a leitura da linha diz
   isso com o número na cara. Sem essa frase, seis praças mostrariam cobertura menor que a
   real e ninguém saberia por quê.

   `clientes` FICA NULO, de propósito. Não existe no Cockpit base de clientes ativos: o
   snapshot do CRM tem o funil de Field Sales, e o mais perto de "cliente" ali é a etapa
   Enviado Onboarding, com 6 negócios no Brasil inteiro. Escrever 6 na coluna clientes de
   uma praça seria inventar. A coluna existe para quando a fonte existir; até lá a tela
   escreve "não medido", que é a verdade. */
const ETAPA_PERDIDO = '1396006164';

function contarTocado(snapshotHubspot) {
  const funil = (snapshotHubspot && snapshotHubspot.funilLeads) || {};
  const porCidade = new Map();
  let total = 0, semCidade = 0;
  Object.keys(funil).forEach(etapa => {
    const lista = Array.isArray(funil[etapa]) ? funil[etapa] : [];
    lista.forEach(l => {
      total += 1;
      const c = semAcento(l && l.cidade);
      if (!c) { semCidade += 1; return; }
      const atual = porCidade.get(c) || { n: 0, perdidos: 0 };
      atual.n += 1;
      if (String(etapa) === ETAPA_PERDIDO) atual.perdidos += 1;
      porCidade.set(c, atual);
    });
  });
  return { porCidade, total, semCidade };
}

/* ══ "MACEIO - AL" E "MACEIO" SÃO A MESMA CIDADE ══════════════════════════════════════
   O CRM guarda `cidade` como texto livre, e às vezes com a UF colada — no snapshot de
   09/09/26 há exatamente esse caso. Então a comparação tira uma UF do fim, quando ela
   está lá, e só depois compara por igualdade.

   O QUE ELA NÃO PODE FAZER, e a primeira versão fazia: casar por prefixo. `startsWith`
   punha "Vitória da Conquista"/BA dentro de Vitória/ES — a suite pegou isso com uma
   linha de fixture, e o efeito na tela seria cobertura inflada numa praça, com o número
   vindo de outro estado. UF é lista fechada de 27; nome de cidade não é. */
const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt',
  'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to'];

function semUfNoFim(cidade) {
  const partes = String(cidade || '').split(' ').filter(Boolean);
  if (partes.length > 1 && UFS.indexOf(partes[partes.length - 1]) > -1) {
    return partes.slice(0, -1).join(' ');
  }
  return partes.join(' ');
}

function tocadoDaPraca(contagem, municipio) {
  const alvo = semUfNoFim(semAcento(municipio));
  let n = 0, perdidos = 0;
  contagem.porCidade.forEach((v, cidade) => {
    if (semUfNoFim(cidade) === alvo) { n += v.n; perdidos += v.perdidos; }
  });
  return { tocado: n, perdidos };
}

/* ══ A LEITURA DA SEMANA ═══════════════════════════════════════════════════════════════
   Montada dos números DESTA linha, sem IA e sem adjetivo que os números não sustentem.
   Quem decide a palavra é `tam_fonte`, não a existência do número. */
/* ══ O NOME DO DENOMINADOR (09/09/26) ══════════════════════════════════════════════════
   A primeira versão escrevia "estabelecimentos food da cidade". EXAGERA, e o exagero
   muda a decisão: são 142.319 em São Paulo, contra as 40 a 50 mil que o setor estima de
   restaurante OPERANDO. A diferença é MEI parado, CNPJ registrado e não aberto, padaria
   de varejo — tudo ativo na Receita e nada disso um cliente possível.
   Com o nome certo, o 0,01% é o que é: fatia da base de CNPJ. Com o nome errado, faz
   parecer que o time não começou. */
const NOME_DO_TAM = 'CNPJs food ativos na Receita';

function leituraDaPraca(linha, semCidade) {
  const partes = [];
  if (linha.tam_fonte === 'contagem_api' && linha.tam > 0) {
    const pct = linha.pct_tocado == null ? null : String(linha.pct_tocado).replace('.', ',');
    partes.push(linha.tocado + ' de ' + linha.tam.toLocaleString('pt-BR') + ' '
      + NOME_DO_TAM + ' já estão no CRM'
      + (pct == null ? '' : ' (' + pct + '%)'));
  } else if (linha.tam_fonte === 'piso_paginado' && linha.tam > 0) {
    partes.push(linha.tocado + ' no CRM, contra pelo menos '
      + linha.tam.toLocaleString('pt-BR') + ' ' + NOME_DO_TAM);
  } else {
    partes.push(linha.tocado + ' contas da praça no CRM · tamanho do mercado não medido nesta rodada');
  }
  /* A CONCORDÂNCIA IMPORTA porque isto é frase de tela, não log: "1 negócios estão sem
     cidade" é a linha que faz alguém duvidar do resto dos números. */
  if (linha.perdidos > 0) {
    partes.push(linha.perdidos + (linha.perdidos === 1 ? ' já perdido' : ' já perdidos'));
  }
  if (semCidade > 0) {
    partes.push(semCidade === 1
      ? '1 negócio do time está sem cidade no CRM e fica fora de toda praça'
      : semCidade + ' negócios do time estão sem cidade no CRM e ficam fora de toda praça');
  }
  return partes.join(' · ') + '.';
}

/* ══ GRAVAR ════════════════════════════════════════════════════════════════════════════
   Sem service_role não grava e DIZ. Rodada que "passa" sem escrever é a pior mentira que
   um robô conta: o log fica verde e a tela mostra a semana passada como se fosse esta. */
async function gravar(tabela, linhas, conflito) {
  if (!linhas.length) return { ok: true, gravadas: 0 };
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return { ok: false, erro: 'SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes' };
  const alvo = url + '/rest/v1/' + tabela + (conflito ? '?on_conflict=' + conflito : '');
  try {
    const r = await fetch(alvo, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(linhas)
    });
    const txt = await r.text();
    if (!r.ok) return { ok: false, erro: r.status + ' ' + txt.slice(0, 240) };
    let volta = [];
    try { volta = JSON.parse(txt || '[]'); } catch (e) { volta = []; }
    return { ok: true, gravadas: Array.isArray(volta) ? volta.length : 0 };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

/* ══ A RODADA ══════════════════════════════════════════════════════════════════════════
   Julyan: "coloque semanalmente para eu saber de tudo". Segunda de manhã, antes de ele
   abrir a aba. Praça sem TAM não derruba as outras: vira linha no resumo do workflow, e o
   processo só sai com erro se nada gravou. */
async function rodar() {
  /* segundaDaSemana devolve 'AAAA-MM-DD', que é o que a coluna date espera. A primeira
     versão daqui chamava
     .toISOString() no retorno e derrubava a rodada na segunda linha. */
  const dataSemana = segundaDaSemana(new Date());
  console.log('[radar-semanal] semana de ' + dataSemana);

  const problemas = [];
  let gravouAlgo = false;

  /* ── o radar das praças ──────────────────────────────────────────────────────────── */
  let nPracas = 0;
  try {
    const { lerSnapshot } = require('../lib/publicar-snapshot');
    const hub = await lerSnapshot('hubspot');
    if (!hub) throw new Error("nao consegui ler o snapshot 'hubspot' — sem ele nao ha tocado");
    const contagem = contarTocado(hub);
    console.log('  funil: ' + contagem.total + ' negócios, ' + contagem.semCidade + ' sem cidade');

    const linhas = [];
    for (const c of CIDADES) {
      const t = await tamDaPraca(c.municipio, c.uf);
      const conta = tocadoDaPraca(contagem, c.municipio);
      /* PERCENTUAL SÓ COM DENOMINADOR MEDIDO. Percentual sobre TAM não medido é o número
         mais perigoso que esta tela poderia mostrar, porque parece cobertura. */
      const pct = (t.fonte === 'contagem_api' && t.tam > 0)
        ? Math.round((conta.tocado / t.tam) * 10000) / 100 : null;
      const linha = {
        praca: c.municipio + '/' + c.uf,
        municipio: c.municipio,
        uf: c.uf,
        data_semana: dataSemana,
        tam: t.tam,
        tam_fonte: t.fonte,
        tam_detalhe: t.detalhe,
        tocado: conta.tocado,
        pct_tocado: pct,
        clientes: null,
        atualizado_em: new Date().toISOString()
      };
      linha.leitura = leituraDaPraca(Object.assign({ perdidos: conta.perdidos }, linha), contagem.semCidade);
      linhas.push(linha);
      console.log('  ' + linha.praca + ': tam ' + (t.tam == null ? 'não medido' : t.tam)
        + ' (' + t.fonte + ') · tocado ' + conta.tocado + (pct == null ? '' : ' · ' + pct + '%'));
      if (t.fonte === 'nao_medido') problemas.push(linha.praca + ' sem TAM: ' + t.detalhe);
    }
    const r = await gravar('radar_pracas', linhas, 'praca,data_semana');
    if (r.ok) { nPracas = r.gravadas; gravouAlgo = true; }
    else problemas.push('gravar radar: ' + r.erro);
  } catch (e) {
    problemas.push('radar das praças: ' + (e.message || e));
  }

  /* ── o que ficou de fora, escrito onde alguém lê ─────────────────────────────────── */
  const resumo = ['### Radar semanal — semana de ' + dataSemana, '',
    '- praças no radar: **' + nPracas + '** de ' + CIDADES.length];
  if (problemas.length) {
    resumo.push('', '**O que não deu:**');
    problemas.forEach(p => resumo.push('- ' + p));
  }
  console.log(problemas.length ? '[radar-semanal] com ressalvas:' : '[radar-semanal] ok.');
  problemas.forEach(p => console.log('  · ' + p));
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo.join('\n') + '\n'); }
    catch (e) { /* o resumo é bônus; a rodada não depende dele */ }
  }

  /* SÓ FALHA SE NADA GRAVOU; o que faltou está no resumo. */
  if (!gravouAlgo) throw new Error('nada foi gravado nesta rodada');
  return { nPracas, problemas };
}

if (require.main === module) {
  rodar().catch(e => {
    console.log('[radar-semanal] Falha geral: ' + (e.message || e));
    process.exit(1);
  });
}

module.exports = { segundaDaSemana, tamDaPraca, acharTotal, contarTocado, tocadoDaPraca, semUfNoFim,
  leituraDaPraca, gravar, rodar, NOME_DO_TAM, CNAE_FOODSERVICE, CAMPOS_DE_TOTAL };
