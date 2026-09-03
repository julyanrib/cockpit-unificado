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
    return { ok: true };
  } catch (e) {
    console.log("Aviso: snapshot '" + chave + "' NAO publicado - " + e.message);
    return { ok: false, erro: e.message };
  }
}

module.exports = { publicarSnapshot };
