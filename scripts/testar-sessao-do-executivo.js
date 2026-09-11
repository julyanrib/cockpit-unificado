// scripts/testar-sessao-do-executivo.js
//
// SAIR É SAIR DESTE APARELHO (11/09/26).
//
// O CASO, medido na PRODUÇÃO com a sessão do Marco:
//   · o token no localStorage não tinha expirado — valia por mais 52 minutos;
//   · /api/dados devolvia 401 "Sessão inválida ou expirada", três vezes seguidas;
//   · e o Supabase, perguntado direto do navegador com o mesmo token, disse por quê:
//       {"code":403,"error_code":"session_not_found",
//        "msg":"Session from session_id claim in JWT does not exist"}
//
// A sessão não venceu: foi REVOGADA no servidor. E quem revogava era o cockpit.
//
// `supa.auth.signOut()` SEM ARGUMENTO é global no supabase-js: apaga a sessão do usuário
// em TODOS os aparelhos. Ele estava no ramo de 403 da hidratação — uma falha de carga numa
// aba do escritório derrubava o executivo do celular dele, na rua, no meio do dia. E o que
// sobrava no localStorage era um token que o navegador achava bom e o servidor recusava
// para sempre: a tela pedia login A CADA reload, e quem via concluía que "o cockpit
// desloga sozinho".
//
// POR QUE ISTO É SUÍTE E NÃO SÓ UM CONSERTO: `signOut()` é a chamada mais fácil de
// reescrever sem pensar no escopo — o padrão da biblioteca é o comportamento errado para
// este produto, e o certo exige um argumento que ninguém lembra de pôr.

const fs = require('fs');
const path = require('path');

const T = path.join(__dirname, '..', 'template', 'cockpit.template.html');
const cru = fs.readFileSync(T, 'utf8');
const tpl = cru.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');

let ok = 0;
const falhas = [];
function checar(nome, cond, dica) {
  if (cond) { ok += 1; console.log('  ok  ' + nome); return; }
  falhas.push(nome + (dica ? '  — ' + dica : ''));
  console.log('  FALHA  ' + nome + (dica ? '  — ' + dica : ''));
}

/* ── 1 · NENHUM signOut GLOBAL, EM LUGAR NENHUM ──────────────────────────────────── */
const chamadas = [...tpl.matchAll(/auth\.signOut\(([^)]*)\)/g)].map(m => m[1].trim());
checar('todo signOut declara escopo local',
  chamadas.length > 0 && chamadas.every(a => /scope:\s*'local'/.test(a)),
  'achei ' + chamadas.length + ' chamada(s): ' + JSON.stringify(chamadas)
    + ' — signOut() sem argumento é GLOBAL e derruba o celular dele');

/* ── 2 · O BOTÃO "SAIR" É O CASO MAIS ÓBVIO, E ERA GLOBAL ────────────────────────── */
checar('o botão sair do perfil sai só deste aparelho',
  /perfilSairBtn'\)\.addEventListener\('click', async \(\) => \{[\s\S]{0,200}?signOut\(\{ scope: 'local' \}\)/.test(tpl),
  'ninguém que clica em "sair" no computador espera cair no celular');

/* ── 3 · O TOKEN QUE O SERVIDOR RECUSA NÃO FICA GUARDADO ─────────────────────────── */
/* Com 401 o token guardado é um token que o servidor recusa. Ele continuava no
   localStorage, e cada reload tentava de novo com ele e caía no mesmo login — o que a
   pessoa lê como "o cockpit me desloga toda hora". */
checar('401 limpa o token morto antes de mandar logar de novo',
  /if \(resp\.status === 401 && supa\) \{[\s\S]{0,140}?signOut\(\{ scope: 'local' \}\)/.test(tpl),
  'sem isto, cada reload repete o 401 com o mesmo token podre');

checar('e 403 continua tratado à parte',
  /if \(resp\.status === 403 && supa\) \{/.test(tpl),
  '403 é "você não pode" — problema de permissão, não de credencial podre');

/* ── 4 · A TELA DIZ O QUE ACONTECEU ──────────────────────────────────────────────── */
checar('e a tela de login diz por que voltou',
  /mostrarLogin\(corpo\.erro \|\| 'Não foi possível carregar seus dados\. Tente entrar de novo\.'\)/.test(tpl),
  'voltar para o login sem frase é o que faz a pessoa achar que errou a senha');

console.log('');
if (falhas.length) {
  console.error(falhas.length + ' falha(s) — a sessão do executivo voltou a poder cair sozinha.');
  falhas.forEach(f => console.error('  · ' + f));
  process.exit(1);
}
console.log('sessão do executivo: ' + ok + ' checagens — sair é sair deste aparelho.');
