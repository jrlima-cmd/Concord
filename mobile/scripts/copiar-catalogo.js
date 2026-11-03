'use strict';

// Copia o catálogo Ghost tech (../catalogo) para dentro do app Android. O app abre nele e o serve
// no mesmo endereço do site, ghosttech.vercel.app (veja MainActivity.java).
const fs = require('node:fs');
const path = require('node:path');

const origem = path.join(__dirname, '..', '..', 'catalogo');
const destino = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'ghosttech');
// Só o site: a função da Vercel, a configuração dela e o README ficam de fora
const FORA_DO_APP = new Set(['api', 'vercel.json', 'README.md']);

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
for (const nome of fs.readdirSync(origem)) {
    if (FORA_DO_APP.has(nome)) continue;
    fs.cpSync(path.join(origem, nome), path.join(destino, nome), { recursive: true });
}
console.log(`Catálogo Ghost tech copiado para ${path.relative(process.cwd(), destino)}`);
