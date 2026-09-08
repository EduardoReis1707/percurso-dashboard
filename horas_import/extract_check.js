const fs = require('fs');
const html = fs.readFileSync('/tmp/percurso_dashboard/index.html', 'utf8');
const scriptRe = /<script(?:(?!src)[^>]*)>([\s\S]*?)<\/script>/g;
let m, scripts = [];
while ((m = scriptRe.exec(html))) scripts.push(m[1]);
console.log('num inline scripts:', scripts.length);
let biggest = scripts.reduce((a, b) => a.length >= b.length ? a : b, '');
fs.writeFileSync('/tmp/percurso_dashboard/_extract_check.js', biggest);
console.log('len', biggest.length);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
const counts = {};
ids.forEach(id => counts[id] = (counts[id] || 0) + 1);
const dupes = Object.entries(counts).filter(([k, v]) => v > 1);
console.log('duplicate ids:', dupes);

const getels = new Set([...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(x => x[1]));
const idSet = new Set(ids);
const missing = [...getels].filter(g => !idSet.has(g)).sort();
console.log('missing ids referenced by getElementById:', missing);
