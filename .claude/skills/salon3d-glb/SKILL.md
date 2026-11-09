---
name: salon3d-glb
description: >-
  Crear modelos 3D y archivos .glb con la app salon-3d (CelShade Studio 3D) escribiendo un script
  Python tipo Blender (bpy) que la app ejecuta en el navegador, revisando capturas y exportando el
  GLB en modo Completo. Úsala siempre que el usuario pida hacer, dibujar, modelar o recrear algo en
  3D (un edificio, monumento, plaza, muelle, objeto, mueble, comida, personaje, orco, puesto de
  mercado, mazmorra, escena) o un "archivo .glb" nuevo, aunque no diga "skill" ni "script". También
  cuando quiera texturizar, optimizar o reducir triángulos de un GLB, o sacar monstruos de
  Enemigo-rpg en sus calidades. Make sure to use this skill for any request to build a 3D model or
  GLB in salon-3d, even if phrased casually ("hazme un vaso de café", "haz el muelle del tinto").
---

# Crear un GLB con salon-3d

salon-3d es una app React + three.js (repo `narcimarquez-eng/salon-3d`, Vite) con un motor que
interpreta un subconjunto de Python de Blender (`src/utils/blenderPythonEngine.ts`). Un modelo es
un script `.py` dentro de una carpeta propia del repo; la app lo ejecuta, lo muestra y lo exporta
a `.glb`. Este flujo ya ha dado el Ayuntamiento de Moguer, 5 puestos de mercado, dos orcos, la
Plaza de España, la Ermita de Montemayor, un vaso de café con leche y el Muelle del Tinto.

El usuario escribe en español y no es programador: háblale claro, enséñale capturas y entrégale
el GLB. Lo que más valora es que el modelo se parezca de verdad a lo que pidió.

## Flujo para un modelo nuevo

1. **Documéntate si es algo real.** Para un edificio, monumento o lugar real, busca medidas,
   partes y materiales en fuentes fiables (fichas BIC del BOJA, Wikipedia, webs oficiales) antes
   de modelar. Apunta en la cabecera del script qué sale de las fuentes y qué es aproximado, y
   díselo al usuario. Si no encuentras datos, dilo en vez de inventarlos. Si el usuario manda
   fotos, úsalas como referencia principal.

2. **Escribe el script** en `<tema>/<tema>.py` (por ejemplo `muelle_tinto/muelle_tinto_huelva.py`)
   partiendo de `assets/plantilla_modelo.py`, que trae la cabecera y las funciones de ayuda
   (material, caja, cilindro, cono, esfera, aro, tirantes en diagonal). Antes de escribir, lee
   `references/motor_python.md`: el motor no es Python completo y hay reglas que, si se rompen,
   hacen fallar el script o dejan piezas mal giradas.

3. **Ejecútalo en la app y mira el resultado** con `scripts/capturar_y_exportar.cjs` (cómo
   arrancar el servidor y usarlo: más abajo). Saca la vista general y 3–6 vistas cercanas
   colocando la cámara en metros del script. Mira las capturas con atención: cada vuelta suele
   descubrir algo (piezas giradas al revés, colores lavados, texturas estiradas, escala).
   `references/lecciones.md` recoge los fallos que ya han pasado y cómo se arreglaron.

4. **Repite** hasta que se parezca. Dos o tres vueltas es lo normal. Si el usuario pidió
   "inténtalo varias veces", hazlo de verdad y enséñale la evolución.

5. **Exporta el GLB** (el mismo script lo hace con el tercer argumento) a `<tema>/<tema>.glb` y
   revísalo con `scripts/inspeccionar_glb.py`: triángulos, piezas, peso, imágenes y que los
   cristales salgan con `alphaMode BLEND`.

6. **Sube y entrega.** Commit con el `.py` y el `.glb`, push a la rama de trabajo y publica (ver
   "Ramas"). Envía al usuario 2–4 capturas y el GLB con la herramienta de enviar archivos, y
   resume: qué tiene el modelo, triángulos y MB, qué es aproximado y qué podría mejorar con fotos.

## Ejecutar la app y capturar

El servidor de desarrollo se cae cuando termina el comando que lo lanzó: arráncalo como tarea en
segundo plano (`run_in_background`, timeout largo) y espera a que responda.

```bash
cd /home/user/salon-3d && npx vite --port 5173 --host 127.0.0.1
```
```bash
until curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/ | grep -q 200; do sleep 1; done
```

Luego (Playwright y Chromium ya están instalados; no los reinstales):

```bash
node .claude/skills/salon3d-glb/scripts/capturar_y_exportar.cjs <tema>/<tema>.py /ruta/salida/v1 [<tema>/<tema>.glb]
```

- Imprime si el script falló (línea y motivo), los triángulos y el tiempo, y guarda
  `v1_overview.png` (3/4), `v1_front.png` (desde -Y del script), `v1_side.png` (desde +X) y
  `v1_top.png`, todas encuadradas al modelo entero.
- Vistas propias en metros del script con las variables de entorno `REFS` y `VISTAS` (dos piezas
  de referencia con su centro conocido sirven para pasar de metros del script a la escena de la
  app, que normaliza el tamaño). Ejemplo en la cabecera del script de captura.
- `python3 .claude/skills/salon3d-glb/scripts/hoja_contactos.py salida.png v1_*.png` junta varias
  capturas en una para revisarlas de un vistazo.
- Las capturas usan swiftshader (sin GPU): los FPS que mide solo sirven para comparar, no como
  rendimiento real.
- Con `?visor-api=1` la app expone `window.celshadeViewer`: `frameModel(margen, dir)`,
  `setCameraPose(pos, target)`, `worldPosOf(prefijo)`, `materialOf(prefijo)` (material real de
  las mallas, útil si algo sale opaco o del color equivocado) y `captureDataUrl()`.

## Ramas y publicación

- Trabaja en la rama de desarrollo de la sesión (hasta ahora `claude/eager-galileo-l27y51`).
- La web publicada (GitHub Pages, `https://narcimarquez-eng.github.io/salon-3d/`) se compila desde
  `claude/wizardly-thompson-ixy39w`; el usuario también quiere `main` al día. Tras cada commit,
  si son ancestros de HEAD, avanza ambas con `git push origin HEAD:<rama>` (sin forzar).
- GitHub a veces devuelve "Internal Server Error" al hacer push: reintenta con esperas de 2, 4, 8
  y 16 s. Comprueba que la web se actualiza buscando un texto nuevo en su bundle JS.

## Presupuesto y rendimiento

- La exportación Completo junta en una pieza todo lo que comparte material, así que los draw
  calls dependen del número de materiales (10–15 es lo habitual). Usa pocos materiales y
  compártelos.
- Referencias: objetos sueltos 5–15 k triángulos; edificios 15–40 k; escenas grandes (plaza,
  muelle de 500 m) 40–80 k y 2–4 MB. Para juego en navegador eso va bien.
- Escenas muy grandes (mazmorras de miles de m²): divídelas en sectores exportados por separado
  para que el juego dibuje solo lo cercano, y usa luces emisivas en vez de muchas luces reales.
- Cilindros con 8–12 lados para piezas repetidas; 32–48 solo en objetos protagonistas y cercanos.

## Humanos desde fotos (panel "Humano desde imágenes")

Para un **personaje humano a partir de fotos** no se escribe un script: se usa el panel
"Humano desde imágenes", que trae el motor portado de la app Vortex3D
(`narcimarquez-eng/3d-con-imagenes`). Se le dan una foto de frente (obligatoria) y, si se
tienen, la de espalda y los mapas de capas pintados; saca la silueta, le ajusta un cuerpo
humano cerrado con profundidad por partes, le busca la cara, le pone botas, un esqueleto de
19 huesos con cuatro animaciones y la textura de la propia foto.

- Las fotos deben ser de **cuerpo entero, en pose A y con fondo liso**. El motor trabaja a
  256 px por vista: ese es el techo del detalle.
- **Dale la vista de perfil siempre que la tengas.** Sin ella el grosor del cuerpo sale de
  proporciones humanas fijas y el personaje queda plano; con ella se mide fila a fila en el
  dibujo. En el orco de `humano/orco_perfil/` el fondo pasó de 0,26 a 0,35 veces la altura,
  que es lo que mide el dibujo (0,32). Da igual el perfil izquierdo o el derecho: solo se mide
  su anchura. Píntale también su mapa de capas: el pelo y los pinchos se descuentan de la
  medida (si no, una melena hace que la cabeza salga como una pelota).
- Código en `src/human/`: `imagePrep.ts` (recorte, silueta, relieve, atlas),
  `humanBodyTemplate.ts` y `humanRig.ts` (copiados de Vortex3D, no los cambies sin mirar
  allí), `buildHuman.ts` (orquesta y monta el material) y `exportHuman.ts` (exporta el .glb
  conservando esqueleto, animaciones y mapas).
- El personaje se monta con su material PBR de foto y la app cambia sola a "📐 PBR Base" con
  el suavizado de normales a 0. Lleva `userData.photoHuman`, que hace que las texturas de
  procedimiento, el contorno de tinta y el suavizado de normales lo dejen en paz.
- **Para el .glb usa el botón del propio panel.** El exportador general reconstruye cada
  malla y dejaría al personaje sin esqueleto.
- Si las fotos vienen en **una hoja de varios paneles**, sepáralas antes con los scripts de la
  skill `personaje-3d-desde-imagenes` del repo 3d-con-imagenes: `split_sheet.py` para una fila
  de cuatro, `separar_hoja8.py` para dos filas de cuatro (natural arriba, codificada abajo), y
  después `limpiar_paneles.py`, que quita los restos del panel vecino; si no, el modelo sale
  con una repisa plana atravesándolo.
- Ejemplos: `humano/orco/` (cuatro paneles, sin perfil) y `humano/orco_perfil/` (ocho paneles,
  con perfil: es el bueno).
- Prueba de punta a punta (con el servidor en marcha):
  `node .claude/skills/salon3d-glb/scripts/probar_humano.cjs frente.png salida/v1 [espalda.png] [salida.glb]`
  (`ANIM=walk` deja puesta una animación, `SIN_RIG=1` construye sin esqueleto,
  `CAPAS_FRENTE` y `CAPAS_ESPALDA` cargan los mapas pintados, y `METAL`, `NORMALES`,
  `PROFUNDIDAD`, `RELIEVE`, `CAPAS`, `CARA`, `FILAS` y `PERFIL_FUERZA` mueven los deslizadores;
  `PERFIL` y `CAPAS_PERFIL` cargan la vista de perfil).
- Referencias de peso: unos 35.000 vértices, 68.000 triángulos y 3,4 MB con esqueleto y
  cuatro animaciones. Para meterlo en un juego, pásalo luego por "Optimizar GLB por zonas",
  que conserva huesos y animaciones.

## Otras tareas con GLB en la app

- **Texturizar u optimizar un GLB importado** (también monstruos): panel "Optimizar GLB por
  zonas", que aparece al cargar un .glb. Conserva esqueletos y animaciones (el botón normal "GLB
  Ligero" los pierde), recomprime imágenes, compacta huesos y puede reducir triángulos (100–10 %)
  con un error común para todo el modelo, que no aplana cuernos ni colas. Código en
  `src/utils/glbZoneOptimizer.ts` y `src/components/GlbZonesPanel.tsx`.
- **Monstruos de Enemigo-rpg**: panel "Monstruos de Enemigo-rpg" (282 monstruos, calidades
  completo/high/medium/low/minimum) con texturas recomendadas automáticas (pelaje, plumas, quitina,
  hueso, roca, corteza) y descarga en lote a carpeta o ZIP. Para navegador: Low para enemigos
  normales (~15 k triángulos, ~1,1 MB), Medium para jefes, Minimum para hordas. El generador se
  copia con `node scripts/sync-enemigos.mjs`. Código en `src/enemigos/`.
- Detalles de estas piezas y de sus pruebas: `references/lecciones.md`.

## Archivos de esta skill

- `assets/plantilla_modelo.py` — plantilla con cabecera, luz y funciones de ayuda.
- `references/motor_python.md` — qué entiende el motor (operaciones, materiales, texturas,
  rotaciones) y qué no. Léelo antes de escribir un script.
- `references/lecciones.md` — fallos ya vistos y sus arreglos, modelo a modelo.
- `scripts/capturar_y_exportar.cjs` — ejecuta un script en la app, captura vistas y exporta el GLB.
- `scripts/inspeccionar_glb.py` — resumen de un GLB (triángulos, piezas, materiales, transparencias).
- `scripts/hoja_contactos.py` — junta capturas en una sola imagen.
