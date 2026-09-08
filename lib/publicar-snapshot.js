// lib/publicar-snapshot.js
//
// PUBLICAR NO cockpit_snapshot, DE QUALQUER PRODUTOR (03/09/26)
// ----------------------------------------------------------------------------
// A etapa 2 tirou a foto do CRM do git e a colocou numa tabela do Supabase, e o
// fetch-hubspot.js ganhou uma publicarNoSnapshot() propria. Ficaram fora dela as duas
// saidas de IA — data/narrativas.json e data/resumo-semanal.json —, que continuavam
// versionadas porque ninguem as publicava em lugar nenhum. Tirar do git sem publicar
// apagaria a narrativa e o resumo da tela.
//
// O PRECO DE TER FICADO ASSIM era um deploy por rodada do robo. O Julyan fez a pergunta
// certa: se o dado ja vai pro Supabase, por que ainda geramos deploy? Porque estes dois
// arquivos ficaram atras. Com eles publicando aqui, o robo commita ZERO e a cota de
// deploy do plano Hobby (100/dia, estourada em 02/09/26) fica inteira pro codigo.
//
// Este modulo existe para a mesma funcao nao ser copiada em tres produtores. Ele NAO
// lanca: publicacao que falha vira aviso e o arquivo em disco segue como rede. A
// alternativa seria derrubar a geracao da narrativa por causa do transporte dela.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

/* ══ O FAROL (08/09/26) ══════════════════════════════════════════════════════════════
   Julyan: "tudo na tela tem q ser instantaneo pelo supabase". O snapshot NAO pode ir para
   o Realtime: RLS com zero politica, de proposito, e 933 kB de CRM por WebSocket. Entao
   publicar TOCA UM FAROL — uma linha por chave, com hora e versao, sem dado de negocio,
   essa sim no Realtime. A aba escuta o farol e chama /api/dados, que continua sendo o
   unico caminho para o dado (service_role no servidor, corte por papel).

   NAO DERRUBA A PUBLICACAO: quando isto roda, o snapshot ja esta gravado. Farol que falha
   significa que a aba volta a depender da proxima carga — o comportamento de hoje, nao
   uma regressao. Por isso try/catch proprio, e so loga.

   A VERSAO E MONOTONICA porque `atualizado_em` sozinho nao basta: duas publicacoes no
   mesmo milissegundo teriam a mesma hora, e a aba compara para saber se ja viu esta
   versao. Uma leitura de 200 bytes por publicacao paga isso. */
async function tocarFarol(chave, origem) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  const cab = { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY };
  try {
    let versao = 1;
    const atual = await fetch(SUPABASE_URL + '/rest/v1/snapshot_farol?chave=eq.'
      + encodeURIComponent(String(chave)) + '&select=versao', { headers: cab });
    if (atual.ok) {
      const linhas = await atual.json().catch(function () { return []; });
      if (Array.isArray(linhas) && linhas[0] && Number.isFinite(Number(linhas[0].versao))) {
        versao = Number(linhas[0].versao) + 1;
      }
    }
    const res = await fetch(SUPABASE_URL + '/rest/v1/snapshot_farol?on_conflict=chave', {
      method: 'POST',
      headers: Object.assign({}, cab, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      }),
      body: JSON.stringify([{
        chave: String(chave),
        versao: versao,
        atualizado_em: new Date().toISOString(),
        origem: origem || 'produtor'
      }])
    });
    if (!res.ok) {
      const txt = await res.text();
      console.log("Aviso: farol '" + chave + "' NAO tocado - " + res.status + ' ' + txt.slice(0, 160)
        + ' (o snapshot esta gravado; as abas abertas so nao vao saber agora)');
      return;
    }
    console.log("OK - farol '" + chave + "' na versao " + versao + ' - as abas abertas vao buscar.');
  } catch (e) {
    console.log("Aviso: farol '" + chave + "' NAO tocado - " + e.message
      + ' (o snapshot esta gravado; as abas abertas so nao vao saber agora)');
  }
}

async function publicarSnapshot(chave, conteudo, origem) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.log("Aviso: SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes - snapshot '" + chave + "' NAO publicado.");
    return { ok: false, skipped: true };
  }
  const corpo = JSON.stringify(conteudo);
  const kb = (Buffer.byteLength(corpo, 'utf8') / 1024).toFixed(1);
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/cockpit_snapshot?on_conflict=chave', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{
        chave: String(chave),
        conteudo: conteudo,
        bytes: Buffer.byteLength(corpo, 'utf8'),
        atualizado_em: new Date().toISOString(),
        origem: origem || 'produtor'
      }])
    });
    if (!res.ok) {
      const txt = await res.text();
      console.log("Aviso: snapshot '" + chave + "' NAO publicado - " + res.status + ' ' + txt.slice(0, 200));
      return { ok: false, status: res.status };
    }
    console.log("OK - snapshot '" + chave + "' publicado (" + kb + ' KB)');
    /* DEPOIS do sucesso, e so depois: o farol anuncia dado que ja esta gravado. Toca-lo
       antes faria as abas buscarem um snapshot que talvez nao chegasse. */
    await tocarFarol(chave, origem);
    return { ok: true };
  } catch (e) {
    console.log("Aviso: snapshot '" + chave + "' NAO publicado - " + e.message);
    return { ok: false, erro: e.message };
  }
}

/* ══ LER DA TABELA, PARA O PRODUTOR SOBREVIVER SEM O ARQUIVO (03/09/26) ══════════════
   Eu tirei narrativas.json do git no PR #255, conferi a linha na tabela, e o robo teria
   caido na proxima rodada: TRES produtores leem o arquivo com readFileSync duro no topo
   do modulo. Publicar na tabela resolveu a leitura DA TELA e nao a dos produtores.

   Os outros seis arquivos untracked nao tem esse problema porque um passo ANTERIOR da
   mesma rodada os grava (fetch-hubspot, fetch-weekly-comparison). O narrativas.json e
   ESTADO ACUMULADO: ninguem o regenera do zero, e quem o carregava de uma rodada para a
   outra era o git.

   ABORTA SE NAO ACHAR EM NENHUM DOS DOIS, e isso e deliberado. Comecar de {} seria pior
   que quebrar: a primeira gravacao publicaria um narrativas vazio e apagaria a narrativa
   e os compromissos de PDI de todo mundo. Falha alta e recuperavel; apagar historico em
   silencio nao e. */
async function lerSnapshot(chave) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const url = SUPABASE_URL + '/rest/v1/cockpit_snapshot?select=conteudo&chave=eq.'
      + encodeURIComponent(String(chave)) + '&limit=1';
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY }
    });
    if (!res.ok) {
      console.log("Aviso: leitura do snapshot '" + chave + "' falhou - " + res.status);
      return null;
    }
    const linhas = await res.json();
    if (!Array.isArray(linhas) || !linhas.length || linhas[0].conteudo == null) return null;
    return linhas[0].conteudo;
  } catch (e) {
    console.log("Aviso: leitura do snapshot '" + chave + "' falhou - " + e.message);
    return null;
  }
}

/* O arquivo em disco tem precedencia sobre a tabela: dentro de uma rodada, um passo
   anterior pode ter acabado de gravar uma versao mais nova que a publicada. A tabela e o
   que atravessa rodadas, agora que o git nao atravessa mais. */
async function carregarJsonOuTabela(caminho, chave) {
  const fsl = require('fs');
  if (fsl.existsSync(caminho)) {
    return { dado: JSON.parse(fsl.readFileSync(caminho, 'utf8')), fonte: 'arquivo' };
  }
  const daTabela = await lerSnapshot(chave);
  if (daTabela != null) {
    console.log("OK - '" + chave + "' carregado da tabela (o arquivo nao estava em disco).");
    return { dado: daTabela, fonte: 'tabela' };
  }
  throw new Error("Nao achei '" + chave + "' nem em " + caminho + " nem na tabela"
    + " cockpit_snapshot. Abortando de proposito: continuar com objeto vazio publicaria"
    + " um snapshot vazio e apagaria o historico.");
}

module.exports = { publicarSnapshot, lerSnapshot, carregarJsonOuTabela };
