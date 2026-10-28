// Carimba ?v=<hash do conteúdo> nos arquivos css/js referenciados pelo index.html.
// Rode antes de cada publicação:  node tools/versionar.js
// Assim o navegador guarda os arquivos em cache e, quando um deles muda, o index.html também muda
// (é isso que dispara o aviso "há uma nova versão do painel").
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const raiz = path.join(__dirname, '..');
const arq = path.join(raiz, 'index.html');
let html = fs.readFileSync(arq, 'utf8');
let mudou = 0;
html = html.replace(/(src|href)="((?:js|css)\/[\w.-]+\.(?:js|css))(?:\?v=[0-9a-f]+)?"/g, (m, attr, f) => {
  const h = crypto.createHash('sha1').update(fs.readFileSync(path.join(raiz, f))).digest('hex').slice(0, 10);
  const novo = `${attr}="${f}?v=${h}"`;
  if (novo !== m) mudou++;
  return novo;
});
fs.writeFileSync(arq, html);
console.log(mudou ? `versões atualizadas: ${mudou}` : 'versões já estavam em dia');
