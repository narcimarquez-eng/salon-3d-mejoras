// Ejecuta un script Python de salon-3d en la app, captura vistas y (opcional) exporta el GLB Completo.
//
// Uso:
//   node capturar_y_exportar.cjs <script.py> <prefijo_salida> [<salida.glb>]
//
// Necesita el servidor de desarrollo en http://127.0.0.1:5173 (o la variable URL).
// Guarda <prefijo>_overview.png (3/4), _front.png (desde -Y del script), _side.png (desde +X) y _top.png.
//
// Vistas propias en metros del script (opcional):
//   REFS='[{"nombre":"MT_G0_F0_Pilar_0","pos":[5.7,-5.49,3.7]},{"nombre":"MT_G10_F0_Pilar_3","pos":[200.9,5.49,3.7]}]'
//   VISTAS='[{"nombre":"lateral","pos":[55,-48,9],"target":[80,0,6]}]'
// REFS son dos piezas del script cuyo centro conoces (nombre exacto o prefijo y su posición
// x, y, z del script, con Z hacia arriba). Deben estar separadas en X. Con ellas se calcula la
// escala que aplica la app y cada vista coloca la cámara en "pos" mirando a "target".
const { chromium } = require('playwright');
const fs = require('fs');

const [, , scriptPath, prefijo, glbOut] = process.argv;
if (!scriptPath || !prefijo) {
  console.error('Uso: node capturar_y_exportar.cjs <script.py> <prefijo_salida> [<salida.glb>]');
  process.exit(2);
}
const URL = process.env.URL || 'http://127.0.0.1:5173/?visor-api=1';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Pegar y ejecutar el script en el estudio Python
  await page.getByText('Abrir Estudio Completo Python + Gemini').first().click();
  await page.waitForTimeout(900);
  await page.locator('textarea[placeholder^="# Pega aquí"]').fill(fs.readFileSync(scriptPath, 'utf8'));
  const t0 = Date.now();
  await page.getByRole('button', { name: /Ejecutar y Ver en 3D/ }).first().click();
  await page.waitForFunction(() => /triángulos/.test(document.body.innerText), null, { timeout: 300000 }).catch(() => {});
  await page.waitForTimeout(8000);
  const body = await page.locator('body').innerText();
  const fallo = (body.match(/Fallo en Línea \d+[^\n]*|SyntaxError[^\n]{0,160}|Por qué falla:[^\n]{0,200}/g) || []).slice(0, 2).join(' || ');
  if (await page.locator('text=Consola Python de Blender').count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
  if (await page.locator('button', { hasText: 'Ejes Visibles' }).count()) {
    await page.locator('button', { hasText: 'Ejes Visibles' }).first().click();
    await page.waitForTimeout(400);
  }
  const etiqueta = await page.locator('text=/triángulos/').first().innerText().catch(() => '');
  console.log(`ERROR: ${fallo || 'ninguno'} | ${etiqueta.slice(0, 80)} | ${Math.round((Date.now() - t0) / 1000)} s | errores de página: ${JSON.stringify(pageErrors.slice(0, 3))}`);

  // Vistas de la app
  // Vistas generales encuadradas a todo el modelo. Dirección hacia la cámara en ejes de la escena
  // de la app (x = x del script, y = altura, z = -y del script): la fachada que mira a -Y del
  // script se ve desde +z.
  const vistaGeneral = async (archivo, dir, margen = 1.15) => {
    await page.mouse.move(1300, 120);
    await page.evaluate(([d, m]) => window.celshadeViewer.frameModel(m, d || undefined), [dir, margen]);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${prefijo}_${archivo}.png` });
  };
  await page.getByRole('button', { name: '3/4 Estudio', exact: true }).first().click();
  await page.waitForTimeout(1200);
  await vistaGeneral('overview', null);
  await vistaGeneral('front', [0, 0.18, 1]);
  await vistaGeneral('side', [1, 0.18, 0]);
  await vistaGeneral('top', [0.25, 1, 0.45], 1.45);

  // Vistas propias en metros del script
  const refs = JSON.parse(process.env.REFS || '[]');
  const vistas = JSON.parse(process.env.VISTAS || '[]');
  if (vistas.length) {
    if (refs.length < 2) throw new Error('VISTAS necesita REFS con dos piezas de referencia');
    const a = await page.evaluate((n) => window.celshadeViewer.worldPosOf(n), refs[0].nombre);
    const c = await page.evaluate((n) => window.celshadeViewer.worldPosOf(n), refs[1].nombre);
    if (!a || !c) throw new Error(`No encuentro las piezas de referencia: ${refs[0].nombre} / ${refs[1].nombre}`);
    const A = refs[0].pos, C = refs[1].pos;
    const k = (c[0] - a[0]) / (C[0] - A[0]); // la escena de la app: x = x, y = z del script, z = -y
    const conv = (q) => [a[0] + k * (q[0] - A[0]), a[1] + k * (q[2] - A[2]), a[2] - k * (q[1] - A[1])];
    for (const v of vistas) {
      await page.evaluate(([p, t]) => window.celshadeViewer.setCameraPose(p, t), [conv(v.pos), conv(v.target)]);
      await page.mouse.move(1300, 120);
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${prefijo}_${v.nombre}.png` });
    }
  }

  // Exportar el GLB en modo Completo
  if (glbOut) {
    await page.getByRole('button', { name: /Completo/ }).filter({ hasText: /💎/ }).first().click();
    await page.waitForTimeout(300);
    const descarga = page.waitForEvent('download', { timeout: 300000 });
    await page.getByRole('button', { name: 'Descargar .GLB' }).click();
    await (await descarga).saveAs(glbOut);
    console.log(`GLB guardado en ${glbOut}`);
  }
  await browser.close();
})().catch((e) => {
  console.error('FALLÓ', e.message.slice(0, 400));
  process.exit(1);
});
