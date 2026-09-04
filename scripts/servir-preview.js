// scripts/servir-preview.js
//
// SERVIDOR ESTATICO SO PARA O PREVIEW LOCAL (03/09/26)
// ----------------------------------------------------------------------------
// preview-local.js GRAVA um HTML e nao serve nada — e file:// nao serve porque o
// template usa localStorage e fetch, que o navegador bloqueia em origem de arquivo.
// Este servidor existe para a revisao ter uma origem http de verdade.
//
// POR QUE ISSO GANHOU UM ARQUIVO: a alternativa era eu subir um servidor a mao em cada
// sessao, e numa delas a aba do navegador acabou apontando para PRODUCAO sem eu notar —
// a URL do preview morreu e a do site continuou de pe. Auditoria de clique rodando em
// producao e escrita real no HubSpot.
//
// Ele serve UM diretorio, passado por argumento, e nao aceita caminho para fora dele.
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(process.argv[2] || process.env.PREVIEW_DIR || '.');
const PORTA = Number(process.argv[3] || process.env.PORT || 4792);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  const pedido = decodeURIComponent(String(req.url || '/').split('?')[0]);
  const relativo = pedido === '/' ? 'rep-marco.html' : pedido.replace(/^\/+/, '');
  const alvo = path.resolve(RAIZ, relativo);
  /* nao sai da raiz — preview nao e motivo para expor o disco */
  if (alvo !== RAIZ && !alvo.startsWith(RAIZ + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('fora da raiz do preview');
    return;
  }
  fs.readFile(alvo, (erro, dados) => {
    if (erro) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('nao achei ' + relativo + ' em ' + RAIZ);
      return;
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream' });
    res.end(dados);
  });
}).listen(PORTA, () => {
  console.log('preview em http://localhost:' + PORTA + '  (raiz: ' + RAIZ + ')');
});
