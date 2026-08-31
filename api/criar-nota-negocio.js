// api/criar-nota-negocio.js
//
// APELIDO MANTIDO DE PROPÓSITO (31/08/26).
//
// A implementação desta ação mudou de lugar: virou lib/acoes-negocio/criar-nota-negocio.js e
// é servida pela porta única /api/negocio-acao (com op:'nota'). A consolidação existia para
// liberar slots de função na Vercel — as 12 do plano Hobby estavam ocupadas e o PWA precisa de
// espaço para publicar a fila pendente do app.
//
// Só que ESTA rota, especificamente, está DOCUMENTADA para outro time:
// docs/pwa-para-cockpit.md oferece `POST /api/criar-nota-negocio` com tipoAcao:'proximo-passo'
// como o caminho autenticado para o PWA gravar próximo passo e qualificação. Apagar a URL
// romperia um contrato que eu não escrevi e não posso testar daqui — e romperia em silêncio,
// com 404, no dia em que alguém do outro lado fosse usar.
//
// Então o arquivo continua existindo como casca fina. Custa um slot (ficamos com 9 de 12, 3
// livres) e mantém a palavra dada. Quando o time do PWA confirmar que migrou para
// /api/negocio-acao, este arquivo pode ser removido — e aí voltam 4 slots.
//
// Não há lógica aqui: nem validação, nem tradução de resposta. O módulo responde por si, com o
// mesmo corpo e os mesmos códigos de erro de sempre.

module.exports = require('../lib/acoes-negocio/criar-nota-negocio');
