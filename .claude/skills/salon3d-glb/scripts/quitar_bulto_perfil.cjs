// Quita el bulto que deja en los muslos un .glb del panel de fotos cuando, en la foto de perfil,
// las manos quedan delante del muslo (el panel toma esa silueta como grosor de la pierna).
// Por cada anillo de la malla en la franja [desde, hasta] (alturas / alto total, 0 = centro),
// encoge hacia atrás solo la cara delantera hasta una línea suave entre los bordes de la franja.
// Conserva UV, esqueleto, pesos y animaciones; recalcula las normales.
// Uso (con el servidor de la app en 127.0.0.1:5173; rutas relativas a la raíz del repo):
//   node quitar_bulto_perfil.cjs titan/entrada.glb '{"desde":-0.17,"hasta":0.0,"centro":0.04,
//        "anchoPierna":0.42,"curva":0.02}' titan/salida.glb [titan/salida_draco.glb]
// centro: z (m) desde la que se encoge; anchoPierna: |x| máximo (deja fuera las manos);
// curva: cuánto sobresale el muslo en medio de la franja (m).
const { chromium } = require('playwright'); const fs = require('fs');
const [, , glbIn, cfgJson, glbOut, dracoOut] = process.argv;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  const res = await p.evaluate(async ([glbIn, cfg, conDraco]) => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const BU = await import('/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js');
    const E = await import('/src/human/exportHuman.ts');
    const g = await new GLTFLoader().parseAsync(await (await fetch('/' + glbIn)).arrayBuffer(), '');
    const info = [];
    g.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const geo = o.geometry; geo.computeBoundingBox();
      const bb = geo.boundingBox, H = bb.max.y - bb.min.y;
      const pos = geo.attributes.position;
      const a = cfg.desde * H, bnd = cfg.hasta * H, zc = cfg.centro;
      // anillos de la malla (el panel la construye por filas horizontales)
      const filas = new Map();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i); if (y < a - 0.05 * H || y > bnd + 0.05 * H) continue;
        if (Math.abs(pos.getX(i)) > cfg.anchoPierna) continue;
        const k = y.toFixed(4); const e = filas.get(k) || { y, n: 0, z: -9 }; e.n++; e.z = Math.max(e.z, pos.getZ(i)); filas.set(k, e);
      }
      const an = [...filas.values()].filter((e) => e.n > 20).sort((p, q) => p.y - q.y);
      const dentro = an.filter((e) => e.y >= a && e.y <= bnd);
      const z0 = dentro[0].z, z1 = dentro[dentro.length - 1].z, ya = dentro[0].y, yb = dentro[dentro.length - 1].y;
      for (const e of an) {
        if (e.y <= ya || e.y >= yb) { e.f = 1; continue; }
        const t = (e.y - ya) / (yb - ya);
        const tope = z0 + (z1 - z0) * t + cfg.curva * Math.sin(Math.PI * t);
        e.f = e.z > tope ? (tope - zc) / (e.z - zc) : 1;
      }
      info.push({ anillos: dentro.length, z0, z1, pico: Math.max(...dentro.map((e) => e.z)), minFactor: Math.min(...an.map((e) => e.f)) });
      const factor = (y) => {
        if (y <= an[0].y || y >= an[an.length - 1].y) return 1;
        let j = 0; while (an[j + 1].y < y) j++;
        const w = (y - an[j].y) / (an[j + 1].y - an[j].y);
        return an[j].f * (1 - w) + an[j + 1].f * w;
      };
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i), z = pos.getZ(i);
        if (z <= zc || Math.abs(pos.getX(i)) > cfg.anchoPierna) continue;
        const fk = factor(y); if (fk === 1) continue;
        pos.setZ(i, zc + (z - zc) * fk);
      }
      pos.needsUpdate = true;
      // normales suaves por posición (sin que las costuras de textura se noten)
      const solo = new THREE.BufferGeometry(); solo.setAttribute('position', pos.clone()); solo.setIndex(geo.index.clone());
      const m = BU.mergeVertices(solo, 1e-5); m.computeVertexNormals();
      const mapa = new Map(), key = (x, y, z) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
      const mp = m.attributes.position, mn = m.attributes.normal;
      for (let i = 0; i < mp.count; i++) mapa.set(key(mp.getX(i), mp.getY(i), mp.getZ(i)), i);
      const nor = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const j = mapa.get(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
        if (j !== undefined) nor.setXYZ(i, mn.getX(j), mn.getY(j), mn.getZ(j));
      }
      nor.needsUpdate = true; geo.computeBoundingBox(); geo.computeBoundingSphere();
    });
    const enc = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
    const bytes = await E.exportHumanToGLBBytes(g.scene, g.animations);
    let draco = null;
    if (conDraco) { const D = await import('/src/utils/dracoCompress.ts'); draco = enc((await D.compressGlbWithDraco(bytes)).bytes); }
    return { info, glb: enc(bytes), draco };
  }, [glbIn, JSON.parse(cfgJson), !!dracoOut]);
  console.log(JSON.stringify(res.info));
  fs.writeFileSync(glbOut, Buffer.from(res.glb, 'base64')); console.log('GLB', glbOut, fs.statSync(glbOut).size);
  if (dracoOut) { fs.writeFileSync(dracoOut, Buffer.from(res.draco, 'base64')); console.log('DRACO', dracoOut, fs.statSync(dracoOut).size); }
  await b.close();
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 500)); process.exit(1); });
