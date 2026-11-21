# Platero por el panel "Humano desde imágenes" (modo Cuadrúpedo)

- `quitar_fondo.py`: recorta el burro de las cuatro fotos con rembg (modelo `isnet-general-use`).
  Necesita `pip install "rembg[cpu]" scipy pillow`.
- `montar_hoja.py`: monta la hoja de 5 columnas (frente, perfil izquierdo, perfil derecho,
  espalda y cenital) sobre fondo blanco; quita la cabeza del niño que asoma sobre el lomo.
  La cenital no existe en foto: es el modelo Python (`../platero_moguer.glb`) visto desde arriba.
- `hoja_fotos_5vistas.png`: la hoja con las fotos. `hoja_ortografica_5vistas.png`: las cinco
  vistas planas del modelo Python, para comparar.

## Qué fallaba y cómo se arregló (21-11-2026)

El molde tallaba el volumen como si el burro tuviera ALAS: visto de frente, el cuello es
estrecho y el pecho y la tripa sobresalen de ese "núcleo", así que se tomaban por alas
(`hasWings` en `buildProfileDriven3DMoldGeometry`, `src/human/humanBodyTemplate.ts`). Con alas,
el perfil se mide sin esas zonas y las alturas del frente se estiran contra el lomo del perfil:
salía una losa en lo alto que ocupaba todo el largo, una sola pata y trozos sueltos.

Arreglo: unas alas desplegadas pasan mucho más allá de donde apoyan los pies; ahora solo hay
alas si lo que sobresale pasa del doble del ancho de los cascos. Con eso, la hoja de fotos da un
burro con cabeza, cuatro patas y cola, esqueleto de cuadrúpedo y 11 animaciones
(`platero_cuadrupedo_fotos.glb`, capturas `resultado_*.png`).

Pendiente: las patas traseras salen en bloque, la cola en trozos, las orejas como una sola punta
y la textura con franjas (las fotos tienen perspectiva y luz distinta en cada vista).

## Pruebas anteriores al arreglo


Con esta versión de la app el modo cuadrúpedo NO da un burro válido:
- Con las fotos (perspectiva) y con las vistas planas, si hay orejas largas sale una losa en lo
  alto que ocupa todo el largo, una sola pata y trozos sueltos (`prueba_ortografica_con_orejas.png`).
- Quitando las orejas de la hoja, las vistas planas sí dan un cuadrúpedo (sin orejas ni cola y con
  las patas traseras cortas: `prueba_ortografica_sin_orejas.png`), pero las fotos siguen fallando
  (`prueba_fotos_sin_orejas.png`).
- La detección del panel (siluetas, 2 patas en el perfil) es correcta: el fallo está en cómo se
  talla el volumen. El león de `leon/` sí funcionó (sin orejas altas y con dibujo plano).
