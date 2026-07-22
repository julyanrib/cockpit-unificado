// scripts/build.js
// Junta data/hubspot.json (auto) + data/expogo.json (manual) + data/narrativas.json (manual)
// e gera public/index.html — o arquivo que o Netlify publica.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const hubspot = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hubspot.json'), 'utf8'));
const expogo = JSON.parse(fs.readFileSync(path.join(root, 'data', 'expogo.json'), 'utf8'));
const narrativas = JSON.parse(fs.readFileSync(path.join(root, 'data', 'narrativas.json'), 'utf8'));

// Resumo semanal é opcional — só existe depois que o workflow de segunda-feira rodar pela 1ª vez
const resumoSemanalPath = path.join(root, 'data', 'resumo-semanal.json');
const resumoSemanal = fs.existsSync(resumoSemanalPath)
  ? JSON.parse(fs.readFileSync(resumoSemanalPath, 'utf8'))
  : null;

function fmtDate(iso) {
  const d = new Date(iso);
  return
