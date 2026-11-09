#!/usr/bin/env node
/**
 * Prueba el panel "Humano desde imágenes" de salon-3d de punta a punta:
 * sube las fotos, construye el personaje, saca vistas y exporta el .glb.
 *
 *   node probar_humano.cjs <frente.png> <salida/prefijo> [espalda.png] [salida.glb]
 *
 * Variables de entorno opcionales:
 *   URL=http://127.0.0.1:5173   servidor de la app
 *   ANIM=walk                   animación a dejar puesta antes de capturar
 *   SIN_RIG=1                   construir sin esqueleto
 *   CAPAS_FRENTE=mapa.png       mapa de capas pintado de la vista de frente
 *   CAPAS_ESPALDA=mapa.png      mapa de capas pintado de la vista de espalda
 *   PERFIL=perfil.png           vista de perfil (mide el grosor del cuerpo)
 *   CAPAS_PERFIL=mapa.png       mapa de capas pintado del perfil
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [frontPath, outPrefix, backPath, glbOut] = process.argv.slice(2);
if (!frontPath || !outPrefix) {
  console.error('Uso: node probar_humano.cjs <frente.png> <salida/prefijo> [espalda.png] [salida.glb]');
  process.exit(1);
}
const URL = process.env.URL || 'http://127.0.0.1:5173';
const ANIM = process.env.ANIM || '';

(async () => {
  fs.mkdirSync(path.dirname(path.resolve(outPrefix)), { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${URL}/?visor-api=1`, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(2500);

  // El panel lleva su propio identificador de prueba.
  const container = page.getByTestId('human-panel');
  await container.waitFor({ timeout: 30000 });

  const inputs = container.locator('input[type="file"]');
  const nInputs = await inputs.count();
  if (nInputs < 1) throw new Error('No se ha encontrado el panel "Humano desde imágenes".');
  console.log(`Panel encontrado (${nInputs} huecos de imagen).`);

  await inputs.nth(0).setInputFiles(path.resolve(frontPath));
  if (backPath && fs.existsSync(backPath)) {
    await inputs.nth(1).setInputFiles(path.resolve(backPath));
  }
  if (process.env.PERFIL && fs.existsSync(process.env.PERFIL)) {
    await inputs.nth(2).setInputFiles(path.resolve(process.env.PERFIL));
  }
  if (process.env.CAPAS_FRENTE && fs.existsSync(process.env.CAPAS_FRENTE)) {
    await inputs.nth(3).setInputFiles(path.resolve(process.env.CAPAS_FRENTE));
  }
  if (process.env.CAPAS_ESPALDA && fs.existsSync(process.env.CAPAS_ESPALDA)) {
    await inputs.nth(4).setInputFiles(path.resolve(process.env.CAPAS_ESPALDA));
  }
  if (process.env.CAPAS_PERFIL && fs.existsSync(process.env.CAPAS_PERFIL)) {
    await inputs.nth(5).setInputFiles(path.resolve(process.env.CAPAS_PERFIL));
  }
  await page.waitForTimeout(600);

  // Ajustes por deslizador: METAL=0.15 NORMALES=0.6 PROFUNDIDAD=1 RELIEVE=0.5 CAPAS=1 CARA=1
  // Los deslizadores van en orden fijo dentro del panel.
  const sliders = ['PROFUNDIDAD', 'RELIEVE', 'CARA', 'CAPAS', 'FILAS', 'METAL', 'NORMALES', 'PERFIL_FUERZA'];
  const ranges = container.locator('input[type="range"]');
  for (let i = 0; i < sliders.length; i++) {
    const v = process.env[sliders[i]];
    if (!v) continue;
    await ranges.nth(i).fill(v);
    await page.waitForTimeout(120);
  }

  if (process.env.SIN_RIG === '1') {
    await container.getByText('Esqueleto y animaciones', { exact: true }).click();
  }

  const t0 = Date.now();
  await container.getByRole('button', { name: /Crear personaje 3D/ }).click();
  await container.getByText(/triángulos/).waitFor({ timeout: 180000 });
  const elapsed = Date.now() - t0;

  const resumen = (await container.innerText()).split('\n').filter(Boolean);
  console.log(`\nConstruido en ${(elapsed / 1000).toFixed(1)} s`);
  for (const l of resumen) {
    if (/vértices|triángulos|huesos|^·/.test(l)) console.log('  ' + l);
  }

  if (ANIM) {
    const label = { idle: 'Reposo', walk: 'Caminar', run: 'Correr', wave: 'Saludar', rest: 'Quieto' }[ANIM];
    if (label) {
      await container.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(900);
    }
  }

  // Vistas: 3/4, frente, perfil y espalda.
  const vistas = [
    ['overview', [0.85, 0.35, 1.0]],
    ['front', [0, 0.12, 1]],
    ['side', [1, 0.12, 0]],
    ['back', [0, 0.12, -1]],
  ];
  for (const [nombre, dir] of vistas) {
    await page.evaluate(
      ([d]) => window.celshadeViewer.frameModel(1.2, d),
      [dir]
    );
    await page.waitForTimeout(500);
    const dataUrl = await page.evaluate(() => window.celshadeViewer.captureDataUrl());
    const file = `${outPrefix}_${nombre}.png`;
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`  captura: ${file}`);
  }

  // Exportación del .glb con esqueleto y animaciones.
  if (glbOut) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      container.getByRole('button', { name: /Descargar \.glb/ }).click(),
    ]);
    await download.saveAs(path.resolve(glbOut));
    const size = fs.statSync(path.resolve(glbOut)).size;
    console.log(`  glb: ${glbOut} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  }

  if (errors.length) {
    console.log('\nErrores de consola:');
    for (const e of errors.slice(0, 12)) console.log('  ! ' + e);
  } else {
    console.log('\nSin errores de consola.');
  }

  await browser.close();
})().catch((e) => {
  console.error('FALLO:', e.message);
  process.exit(1);
});
