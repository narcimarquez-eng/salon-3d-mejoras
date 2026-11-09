# Lecciones de los modelos ya hechos

Fallos reales que aparecieron al revisar capturas, y cómo se arreglaron. Antes de dar un modelo
por bueno, comprueba que no repite ninguno.

## Contenido
1. Problemas de aspecto (colores, transparencia, texturas)
2. Problemas de geometría (giros, escala, juntas)
3. Problemas del motor Python
4. Problemas al capturar y exportar
5. GLB importados, optimización y monstruos
6. Modelos de referencia en el repo

## 1. Aspecto

- **Colores lavados** (vaso de café, 2026-11): un café con leche salía como leche. El motor trata
  el color como lineal y la luz del visor aclara más; se arregló bajando los valores a lineal
  (`(0.22, 0.095, 0.032)` para el cuerpo del café, `(0.035, 0.013, 0.005)` para café solo).
- **Hierro rosado** (muelle del tinto): `(0.10, 0.035, 0.022)` con metálico 0.35 se veía salmón.
  Un hierro oscuro de óxido es `(0.042, 0.013, 0.008)` con metálico 0.2.
- **Cristal blanco y opaco**: dos causas. (1) `Transmission Weight` no se ve bien en el visor;
  usa `Alpha`. (2) Un fallo de la app borraba la transparencia de todos los objetos de los
  scripts cuando no había textura global; ya está arreglado (cada malla guarda `baseAlpha` y
  `baseTransmission`). Si vuelve a pasar, comprueba el material con
  `celshadeViewer.materialOf('Prefijo')` (`?visor-api=1`).
- **Agua de piscina**: la textura `ocean_deep` dibuja celdas de cáusticas; para una ría, color
  liso verde turbio `(0.03, 0.045, 0.035)` con rugosidad baja.
- **Madera que parece arena**: la veta de `wood_oak` se estira en tablas de 20 m. En tableros
  largos, color liso.
- **Texturas por nombre**: antes la app ponía texturas según el nombre del material; ya no. Si
  quieres una textura, pon `mat.texture = "..."` de forma explícita.
- **Pelaje que parece plástico** (monstruos de Enemigo-rpg): el color venía del brillo "sheen"
  sobre una base casi negra; al poner la textura de pelaje se aclara la base con su mismo tono.

## 2. Geometría

- **Tejado en valle** (ermita): el faldón derecho tenía `ry = -θ`. Correcto: derecho `+θ`,
  izquierdo `-θ` (función `tejado_dos_aguas` de la plantilla).
- **Diagonales mal giradas**: usa siempre la función `viga(a, b)`; calcula inclinación y rumbo
  con el convenio de signos correcto.
- **Juntas en curvas** (muelle): las piezas entre dos puntos de una curva dejan cuñas en el lado
  exterior; alarga cada pieza 0,5–1 m.
- **Modelo diminuto en la vista general**: el suelo o el agua eran mucho más grandes que el
  modelo. Ajústalos al tamaño del modelo.
- **Partes finas que desaparecen al reducir triángulos**: ver sección 5.

## 3. Motor Python

- `for (x, y, z) in [...]` falla: recorre una lista e indexa.
- Una expresión condicional en una línea hizo fallar la ermita v1: usa `if` normal.
- Variable sin definir (`m_correa` en el orco): el error dice la línea; revisa nombres.
- El mensaje de error aparece en la consola del estudio como "Fallo en Línea N" y el script de
  captura lo imprime.

## 4. Capturar y exportar

- El servidor de Vite se apaga con el comando que lo lanzó: arráncalo en segundo plano.
- Un servidor de archivos estáticos (`python3 -m http.server`) debe escuchar solo en
  `--bind 127.0.0.1`; si no, el sistema de permisos lo bloquea.
- La primera carga de un módulo nuevo puede recargar la página (Vite optimiza dependencias):
  si Playwright dice "Execution context was destroyed", espera unos segundos y repite.
- El estudio Python tapa la vista: el script de captura lo cierra con Escape.
- El botón de modo (EEVEE) vuelve al de la sesión al cerrar el estudio; no hace falta tocarlo.
- Todos los GLB exportados llevan como nodo raíz "Golem_Enemigo_LowPoly" (herencia del modelo de
  demostración). No cambia nada visual; pendiente de arreglar si el usuario lo pide.

## 5. GLB importados, optimización y monstruos

- El botón "GLB Ligero" de la app reconstruye el modelo y **pierde esqueletos y animaciones**.
  Para monstruos o personajes animados usa el panel "Optimizar GLB por zonas", que solo reescribe
  lo que cambia del archivo original.
- Reducción de triángulos: el optimizador usa meshoptimizer con un mismo error máximo para todo
  el modelo (búsqueda binaria). Con un porcentaje igual por pieza, los cuernos del dragón se
  aplanaban hasta desaparecer.
- Para monstruos de Enemigo-rpg, mejor usar su calidad propia (Low ~15 k triángulos) que reducir
  la High al 25 %: Low quita los mechones de pelo sueltos y la textura de pelaje hace el resto.
- El validador oficial (`npx gltf-transform validate`) marca `EXT_materials_bump` como extensión
  no soportada y los colores de vértice > 1 de Enemigo-rpg: vienen del original, no son errores
  nuevos.
- Los 282 monstruos se generan sin errores: Low 46 s y 333 MB en total; Medium 70 s y 558 MB.

## 6. Humanos desde fotos (puerto del motor de Vortex3D)

- **`userData` se cuela entera en el .glb.** GLTFExporter serializa `userData` de cada objeto
  como `extras`. El visor cuelga ahí las posiciones originales y la pila de deshacer, así que
  el primer personaje exportado pesó **103 MB** (86 MB solo de JSON) en vez de 3,4. El
  exportador del panel vacía `userData` en la copia que exporta, nunca en la escena.
- **`prepareGeometryNormals` separa la geometría por caras** (`toNonIndexed`), lo que
  multiplica por seis los vértices. Los personajes de foto (y cualquier malla con esqueleto)
  se lo saltan: sus normales ya vienen medidas de la imagen.
- **Las texturas de procedimiento pisaban el material de la foto.** El efecto que aplica los
  presets de textura escribe `map`, `normalMap`, `roughnessMap` y `bumpScale` sobre
  `userData.originalMaterial`, y con el preset "ninguna" los dejaba a null: el .glb salía sin
  mapa de normales. Se arregló con la marca `userData.photoHuman`.
- **`SkeletonUtils.clone` comparte la geometría con la escena**: si el exportador le borra un
  atributo, se lo borra al modelo que se está viendo. Hay que clonar la geometría antes.
- **El contorno de tinta** (malla invertida) no se crea en mallas con esqueleto (se quedaría
  quieto al animar) y se quita del .glb.
- Qué **no** se portó del motor original: el solucionador de Poisson, las formas preset y la
  tira lateral de unión. El relieve que recibe el molde es el mapa de brillo normalizado;
  `addPhotoDetail` ya le aplica un paso alto, así que la parte de baja frecuencia que ponía
  Poisson se descartaba igual. Efecto medible: con el mismo personaje de prueba, el recorte
  del puerto conserva las espinillas que la app original se comía (allí el relieve suavizado
  bajaba del umbral de "zona plana"); el resto de la salida coincide pieza a pieza
  (cuerpo + 2 botas, 19 huesos, las mismas 4 animaciones).
- **Vista de perfil (añadida aquí, no está en Vortex3D):** el molde repartía la profundidad con
  proporciones fijas (hombros 0,8 · pecho 0,74 · cintura 0,64 · cadera 0,7 del ancho) y los
  personajes anchos salían planos. Ahora, si hay dibujo de perfil, se mide su anchura fila a
  fila y se escala la profundidad del cuerpo a esa altura; la forma de la sección no cambia.
  Las dos vistas se alinean por la altura de la figura, así que da igual a qué tamaño esté
  dibujado cada panel. Dos trampas: de perfil la melena y los cuernos tapan el cuerpo y lo
  hacen medir el doble (la cabeza salía como una pelota), por eso se descuentan las clases
  "pelo" y "pinchos" del mapa de capas del perfil; y el factor se limita a [0,5 · 2,2] por fila
  para que una fila rara no deforme el cuerpo.
- Los valores de metal y normales de Vortex3D (1,0 y 1,5) salen de plástico brillante con las
  luces de salon-3d, que no tiene mapa de entorno. Por defecto van a 0,45 y 0,6, y los
  deslizadores llegan al valor original.

## 7. Modelos de referencia en el repo

Mira el script más parecido antes de empezar uno nuevo:

| Carpeta | Qué enseña |
|---|---|
| `cafe/` | Objeto pequeño a escala 1 = 10 cm, cristal con Alpha, líquido por capas, colores lineales |
| `muelle_tinto/` | Estructura larga con trazado curvo `punto(s)`, celosías con diagonales, muchas piezas repetidas, datos del BOJA |
| `ermita_montemayor/` | Edificio a partir de fotos del usuario, tejado a dos aguas, torre octogonal |
| `plaza_espana/` | Conjunto grande semicircular, arcos con cajas escalonadas, solo giros en Z |
| `ayuntamiento/` | Fachada con texturas CC0 (`mat.color_map`) y optimización del GLB |
| `puestos/` | Props ligeros de estilo Lineage 2 (pocos lados, materiales compartidos) |
| `orco/` | Personaje con manos, pies y armadura hecho con primitivas |
