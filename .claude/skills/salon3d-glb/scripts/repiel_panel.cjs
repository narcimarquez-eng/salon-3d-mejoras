// Vuelve a poner la piel a un .glb del panel de fotos con el atlas de vistas (misma regla que
// mat.color_map_views): conserva forma, esqueleto y animaciones.
const { chromium } = require('playwright'); const fs = require('fs');
const [, , glbIn, atlasUrl, cfgJson, glbOut] = process.argv;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  const b64 = await p.evaluate(async ([glbIn, atlasUrl, cfg]) => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const E = await import('/src/human/exportHuman.ts');
    const g = await new GLTFLoader().parseAsync(await (await fetch('/' + glbIn)).arrayBuffer(), '');
    const tex = await new THREE.TextureLoader().loadAsync(atlasUrl);
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.userData.mimeType = 'image/jpeg';
    const W = tex.image.width, Hh = tex.image.height;
    g.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (geo.attributes.color) geo.deleteAttribute('color');
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const pos = geo.attributes.position, nor = geo.attributes.normal;
      const uv = new Float32Array(pos.count * 2);
      const lin = (v, a0, a1, b0, b1) => b0 + (v - a0) / (a1 - a0) * (b1 - b0);
      const n = new THREE.Vector3();
      for (let t = 0; t < pos.count; t += 3) {
        n.set(0, 0, 0);
        for (let k = 0; k < 3; k++) n.add(new THREE.Vector3().fromBufferAttribute(nor, t + k));
        n.normalize();
        // vista: frente (+z), espalda (-z), perfil (|x|)
        const sF = (n.z > 0 ? n.z : -1) * cfg.pesoFrente, sB = (n.z < 0 ? -n.z : -1) * cfg.pesoFrente, sS = Math.abs(n.x) * cfg.pesoPerfil;
        // dónde cae el triángulo en la foto de frente (columna y fila de la hoja)
        let cx = 0, cy = 0;
        for (let k = 0; k < 3; k++) { cx += pos.getX(t + k) / 3; cy += pos.getY(t + k) / 3; }
        const fcol = lin(cx, bb.min.x, bb.max.x, cfg.frente.x0, cfg.frente.x1);
        const frow = lin(cy, bb.max.y, bb.min.y, cfg.frente.y0, cfg.frente.y1);
        // brazos (fuera del tronco) y franjas tapadas en la foto de perfil: nunca el perfil
        const sinPerfil = Math.abs(fcol - cfg.eje) > cfg.medioTronco ||
          cfg.tapadas.some((r) => frow >= r[0] && frow <= r[1]);
        let v = sS >= sF && sS >= sB && !sinPerfil ? 'perfil' : sF >= sB ? 'frente' : 'espalda';
        if (sinPerfil && sF < 0 && sB < 0) v = 'frente';
        const c = cfg[v];
        for (let k = 0; k < 3; k++) {
          const i = t + k;
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          let px;
          if (v === 'frente') px = lin(x, bb.min.x, bb.max.x, c.x0, c.x1);
          else if (v === 'espalda') px = lin(x, bb.min.x, bb.max.x, c.x1, c.x0);
          else px = lin(z, bb.min.z, bb.max.z, c.x0, c.x1);   // el perfil de la hoja mira a la derecha (+z)
          // sin bajar hasta la línea de tinta de la planta del pie
          const py = Math.min(lin(y, bb.max.y, bb.min.y, c.y0, c.y1), c.y1 - cfg.margenSuelo);
          // hoja -> atlas
          const ax = c.ox + (px - c.rx) * cfg.s, ay = c.oy + (py - c.ry) * cfg.s;
          uv[i * 2] = ax / W; uv[i * 2 + 1] = ay / Hh;
        }
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      o.geometry = geo;
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0 });
      m.name = 'Piel_Fotos';
      o.material = m;
      o.userData.originalMaterial = m;
    });
    const bytes = await E.exportHumanToGLBBytes(g.scene, g.animations);
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, [glbIn, atlasUrl, JSON.parse(cfgJson)]);
  fs.writeFileSync(glbOut, Buffer.from(b64, 'base64')); console.log('GLB', glbOut, fs.statSync(glbOut).size);
  await b.close();
})().catch(e => { console.error('FALLÓ', e.message.slice(0, 500)); process.exit(1); });
