# Platero por el panel "Humano desde imágenes" (modo Cuadrúpedo)

- `quitar_fondo.py`: recorta el burro de las cuatro fotos con rembg (modelo `isnet-general-use`).
  Necesita `pip install "rembg[cpu]" scipy pillow`.
- `montar_hoja.py`: monta la hoja de 5 columnas (frente, perfil izquierdo, perfil derecho,
  espalda y cenital) sobre fondo blanco; quita la cabeza del niño que asoma sobre el lomo.
  La cenital no existe en foto: es el modelo Python (`../platero_moguer.glb`) visto desde arriba.
- `hoja_fotos_5vistas.png`: la hoja con las fotos. `hoja_ortografica_5vistas.png`: las cinco
  vistas planas del modelo Python, para comparar.

## Resultado (21-11-2026)

Con esta versión de la app el modo cuadrúpedo NO da un burro válido:
- Con las fotos (perspectiva) y con las vistas planas, si hay orejas largas sale una losa en lo
  alto que ocupa todo el largo, una sola pata y trozos sueltos (`prueba_ortografica_con_orejas.png`).
- Quitando las orejas de la hoja, las vistas planas sí dan un cuadrúpedo (sin orejas ni cola y con
  las patas traseras cortas: `prueba_ortografica_sin_orejas.png`), pero las fotos siguen fallando
  (`prueba_fotos_sin_orejas.png`).
- La detección del panel (siluetas, 2 patas en el perfil) es correcta: el fallo está en cómo se
  talla el volumen. El león de `leon/` sí funcionó (sin orejas altas y con dibujo plano).
