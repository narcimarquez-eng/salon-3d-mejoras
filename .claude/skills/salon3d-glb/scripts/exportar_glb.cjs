// Ejecuta un script .py en la app y exporta el GLB (Completo, Juego, High...) sin capturas.
// Uso: node exportar_glb.cjs script.py salida.glb [Juego]
const { chromium } = require('playwright'); const fs = require('fs');
const [, , scriptPath, glbOut, tier] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  await p.getByText('Blender Python', { exact: true }).first().click().catch(() => {});
  await p.waitForTimeout(400);
  await p.getByText('Estudio Completo', { exact: true }).first().click();
  await p.waitForTimeout(900);
  await p.locator('textarea[placeholder^="# Pega aquí"]').fill(fs.readFileSync(scriptPath, 'utf8'));
  await p.getByRole('button', { name: /Ejecutar y Ver en 3D/ }).first().click();
  await p.waitForFunction(() => /Tris|triángulos/.test(document.body.innerText), null, { timeout: 300000 });
  await p.waitForTimeout(8000);
  const body = await p.locator('body').innerText();
  console.log('FALLO', (body.match(/Fallo en Línea \d+[^\n]*|SyntaxError[^\n]{0,160}/g) || []).slice(0, 2).join(' | ') || 'ninguno');
  await p.keyboard.press('Escape'); await p.waitForTimeout(800);
  const d = p.waitForEvent('download', { timeout: 300000 });
  await p.evaluate((t) => [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t).click(), tier || 'Completo');
  await (await d).saveAs(glbOut); console.log('GLB', glbOut, fs.statSync(glbOut).size);
  await b.close();
})().catch((e) => { console.error('FALLÓ', e.message.slice(0, 300)); process.exit(1); });
