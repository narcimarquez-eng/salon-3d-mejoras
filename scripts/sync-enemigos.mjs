// Copia el generador de monstruos del repositorio Enemigo-rpg a src/enemigos/vendor.
//
// Uso:
//   node scripts/sync-enemigos.mjs                 -> descarga la última versión de GitHub
//   node scripts/sync-enemigos.mjs ../enemigo-rpg  -> usa una copia local
//
// Solo se copian los archivos que generan y exportan monstruos (tipos, constructor,
// texturas y exportador). No se editan a mano: se vuelven a copiar con este script.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/narcimarquez-eng/Enemigo-rpg.git';
const FILES = [
  'src/types/enemy.ts',
  'src/types/darkFantasyBeasts.ts',
  'src/types/materialPresets.ts',
  'src/three/enemyBuilder.ts',
  'src/three/proceduralTextures.ts',
  'src/three/exporters.ts',
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'src/enemigos/vendor');

let source = process.argv[2] ? resolve(process.argv[2]) : null;
let temp = null;
if (!source) {
  temp = mkdtempSync(join(tmpdir(), 'enemigo-rpg-'));
  execFileSync('git', ['clone', '--depth', '1', REPO, temp], { stdio: 'inherit' });
  source = temp;
}

const sha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD']).toString().trim();
const date = execFileSync('git', ['-C', source, 'log', '-1', '--format=%cI']).toString().trim();

for (const rel of FILES) {
  const text = readFileSync(join(source, rel), 'utf8');
  const out = join(dest, rel.replace(/^src\//, ''));
  mkdirSync(dirname(out), { recursive: true });
  const header =
    '// @ts-nocheck\n' +
    `// Copiado de Enemigo-rpg (${sha.slice(0, 7)}) con scripts/sync-enemigos.mjs. No editar aquí.\n`;
  writeFileSync(out, header + text);
}
writeFileSync(join(dest, 'version.json'), JSON.stringify({ repo: REPO, commit: sha, date }, null, 2) + '\n');
if (temp) rmSync(temp, { recursive: true, force: true });
console.log(`Enemigo-rpg ${sha.slice(0, 7)} (${date}) copiado en src/enemigos/vendor`);
