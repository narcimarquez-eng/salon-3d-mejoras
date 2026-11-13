// Mete una hoja de vistas en el panel "Humano desde imágenes", elige Cuadrúpedo, quita las botas y
// exporta el GLB Completo (captura el blob del botón del panel).
// Uso: node hoja_en_panel.cjs <hoja.png> <prefijo_capturas> [salida.glb]   (FREE=1: Construcción Libre;
// EXTRA=1: cabeza al principio en la cenital + un solo perfil). Copiarlo dentro del repo para que encuentre playwright.
const { chromium } = require('playwright');
const [,, hoja, pre, glb] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
  await p.waitForSelector('canvas', { timeout: 60000 }); await p.waitForTimeout(2500);
  await p.getByText('Humano (Fotos)').first().click().catch(()=>{});
  await p.waitForTimeout(800);
  const panel = p.getByTestId('human-panel'); await panel.waitFor({ timeout: 30000 });
  const esperar = async () => { await p.waitForTimeout(4000); await p.waitForFunction(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Crear personaje 3D')); const e=document.querySelector('button[title^="Exporta el personaje al 100"]'); return b && !b.disabled && (!e || !e.disabled); }, null, { timeout: 900000, polling: 1000 }); await p.waitForTimeout(3000); };
  await p.getByTestId(process.env.FREE ? 'freeform-file-input' : 'all-in-one-file-input').setInputFiles(hoja);
  await esperar();
  await panel.getByRole('button', { name: 'Cuadrúpedo', exact: true }).click();
  await esperar();
  const botas = panel.locator('label', { hasText: 'Botas' }).locator('input'); if (await botas.isChecked().catch(()=>false)) { await botas.uncheck(); await esperar(); }
  if (process.env.EXTRA) { await panel.getByRole('button', { name: 'Al principio' }).click(); await esperar(); await panel.locator('label', { hasText: 'Usar solo un perfil' }).locator('input').check(); await esperar(); }
  if (process.env.HILOS) { await p.getByTestId('human-separate-limbs').check().catch(()=>{}); await esperar(); }
  const txt = await panel.innerText();
  console.log((txt.match(/[^\n]*(triáng|vértic|hueso|Pata|Cola)[^\n]*/gi) || []).slice(0, 12).join('\n'));
  await p.screenshot({ path: pre + '_app.png' });
  const det = p.getByTestId('limb-detection-preview');
  if (await det.count()) await det.screenshot({ path: pre + '_deteccion.png' }).catch(()=>{});
  if (glb) {
    await p.evaluate(() => { const o = URL.createObjectURL; URL.createObjectURL = (b) => { if (b && b.type === 'model/gltf-binary') window.__glb = b; return o(b); }; });
    const btn = p.locator('button[title^="Exporta el personaje al 100"]').first();
    console.log('botones export', await btn.count());
    await btn.scrollIntoViewIfNeeded(); await btn.click({ timeout: 600000 });
    await p.waitForFunction(() => !!window.__glb, null, { timeout: 400000 }).catch(e => console.log('sin glb', e.message.slice(0,80)));
    const b64 = await p.evaluate(async () => { if (!window.__glb) return ''; const a = new Uint8Array(await window.__glb.arrayBuffer()); let s=''; for (let i=0;i<a.length;i+=32768) s+=String.fromCharCode.apply(null,a.subarray(i,i+32768)); return btoa(s); });
    if (b64) { require('fs').writeFileSync(glb, Buffer.from(b64, 'base64')); console.log('GLB', glb); }
    else { await p.screenshot({ path: pre + '_fallo.png' }); }
  }
  console.log('errores', JSON.stringify(errs.slice(0,3)));
  await b.close();
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 500)); process.exit(1); });
