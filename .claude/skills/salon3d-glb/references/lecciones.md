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

## 8. Vegetación con tarjetas y fotos del usuario (pino pilonero, 2026-11)

- **Recorte por alpha (hojas, hierba, acículas)**: `mat.blend_method = 'CLIP'` y
  `mat.alpha_threshold = 0.5` con una imagen PNG con transparencia enlazada por
  `ShaderNodeTexImage`. Antes el motor guardaba `blend_method` sin usarlo; ahora pone
  `alphaTest`, doble cara, quita el contorno de tinta (dibujaba el rectángulo entero) y el GLB
  sale con `alphaMode MASK` + `doubleSided`. Ejemplo: `pino/pino_pilonero.py`.
- **Imágenes propias**: guárdalas en `public/<tema>/` y cárgalas con ruta relativa
  (`bpy.data.images.load("pino/corteza.jpg")`), que funciona en local y en GitHub Pages.
- **Fotos del usuario a resolución real**: las subidas llegan a 4096 px aunque se vean
  reducidas; mide el tamaño con PIL antes de recortar por coordenadas.
- **Cielo azul a alpha**: `azul = B - (R+G)/2`; cielo ≈ +80, acículas ≈ -100. Alpha =
  `clip((15 - azul)/25)` y bajar el azul de los bordes (`B = min(B, 0.85·G)`) para que no
  quede halo. Rellena el color bajo alpha 0 con el verde medio (evita bordes azules al filtrar).
- **Tubos curvos con UV propias** (tronco y ramas): `from_pydata` con anillos de `lados + 1`
  vértices (costura duplicada), marco por transporte paralelo, y
  `mesh.uv_layers.new().data.foreach_set("uv", lista_plana)` en el orden de las caras
  (4 UV por cuadrilátero). Todas las ramas en una malla = un draw call.
- **Modelos de 0,08–35 m no se reescalan** y los botones Frente/Perfil tienen la cámara fija
  para ~3 m: el script de captura usa ahora `window.celshadeViewer.frameModel(margen, dir)`
  (`?visor-api=1`, de nuevo en `App.tsx`) para encuadrar cualquier tamaño, y acepta
  `CAMARAS='[{"nombre":..,"pos":[..],"target":[..]}]'` en coordenadas de la escena (Y arriba).
- El material de imagen sale con metálico 0,2 si no se pone `Metallic` = 0.
- **Copa que parece "un montón de papeles"**: normales propias hacia fuera del elipsoide de la
  copa con `mesh.normals_split_custom_set(lista_por_esquina)` (nuevo en el motor: protege las
  normales de los recálculos de la app y llegan al GLB). Con doble cara la cara trasera se
  ilumina al revés, así que cada tarjeta lleva sus dos caras modeladas con la misma normal y el
  material `use_backface_culling = True` (con recorte alpha eso deja una sola cara visible).
- **Sombra horneada por vértice**: `col = mesh.color_attributes.new(name=..., type='FLOAT_COLOR',
  domain='CORNER')` y `col.data.foreach_set("color", [r, g, b, a, ...])` (nuevo en el motor;
  sale como COLOR_0 en el GLB). Interior y panza ~0,35-0,5, fuera 0,9.
- **Atlas con el fondo de cuadros pintado** (JPG de "transparencia" falsa): alpha por luminancia
  y saturación (el gris del fondo es claro y sin color), fuera las líneas moradas de la rejilla,
  componentes conexas para quitar números, y "desmezclar" el gris de los bordes. El atlas venía
  verde muy oscuro: aclararlo ×1,3 y apagar los reflejos; si no, la copa sale pálida a distancia.
- **Borde claro alrededor de cada tarjeta a distancia**: el color de relleno bajo alpha 0 se
  cuela en los mipmaps. Rellénalo con el verde de la pieza oscurecido (×0,55).
- **El GLB guarda todas las imágenes en PNG RGBA** (8,7 MB el pino). `pino/optimizar_glb.py`
  las recomprime: opacas a JPEG y las de recorte a PNG con paleta y alpha 0/1 (3,3 MB).
- Penachos todos hacia arriba = cojín de púas: abrirlos en abanico con más componente lateral
  y algo de azar en la inclinación.
- **Palmera** (`palmera/palmera_datilera.py`, 2026-11): cada hoja es una tira a lo largo de un
  nervio que cae con la gravedad (`s·d0 - caida·s²`), doblada en V (dos mitades con un pliegue
  de 18–30°) y con la celda del atlas con el tallo abajo y el nervio centrado (centro de masas
  del recorte). Las hojas se colocan en espiral de 137,5°; jóvenes arriba, viejas abajo.
  Atlas sobre fondo gris liso: alpha = max(saturación, luminancia sobre el fondo), quedarse con
  la componente mayor (tras dilatar 3 px para unir foliolos sueltos). 3.768 triángulos, 1,9 MB.
- `capturar_y_exportar.cjs` acepta `MARGEN=1.15` para el encuadre automático (modelos altos y
  estrechos salían cortados por arriba con 1,05).
- **Pinsapo** (`pinsapo/pinsapo.py`, 2026-11): abeto en pisos (verticilos) de 4–6 ramas girados
  entre sí; el largo de rama sigue un cono algo abombado. Ramitas a lo largo de cada rama: dos
  casi planas hacia los lados y una que sube de canto (si todas son planas, de lado se ve solo la
  madera). Ramas oscurecidas con color por vértice en la madera (0,42) y tronco en sombra por
  encima del primer piso. Rejilla del atlas gris oscura como las acículas: se repinta con los
  píxeles vecinos en sus posiciones conocidas antes de recortar. 19.216 triángulos, 3,7 MB.
- **El GLB no unía piezas por material** (pinsapo de Navidad: 264 piezas, una por bola y luz).
  Los botones "Completo" (barra superior y panel Python) llaman a `handleExportGLB` →
  `exportHumanToGLBBytes`, que no unía nada; `mergeMeshesByMaterial` no lo llamaba nadie.
  Ahora `handleExportGLB` une por material una copia de la escena cuando no hay esqueleto
  (17 piezas). Las mallas unidas se llaman `<material>_<n>piezas`.
- Bolas de metal puro (`Metallic` 1) salen negras en el visor y en motores sin mapa de entorno:
  metálico 0,45–0,75 con barniz.
- **Texto en un cartel**: el motor no tiene `text_add`; se dibuja la imagen con PIL
  (`pinsapo/generar_cartel.py`) y se pone en un quad con UV delante de la tabla. Ojo con los
  postes: van detrás de la tabla o tapan las letras.
- **Liquidámbar** (`liquidambar/liquidambar.py`, 2026-11): ramilletes de pie (3–4 tarjetas
  cruzadas) en la punta de cada rama y secundaria; desde arriba quedaban huecos porque las
  tarjetas de pie se ven de canto: una tarjeta tumbada por ramillete y un remate inclinado
  alrededor de la cima. Color por altura (rojos arriba, naranjas y amarillos abajo).
  Bordes blanquecinos de las hojas (mezcla con el fondo claro): sustituir 2 px del borde por el
  color medio de alrededor. 9.232 triángulos, 1,9 MB.
- Al insertar código buscando un texto, comprueba que no aparece antes en la cabecera: un bloque
  acabó en los comentarios del principio y el script falló en la línea 16.
- **Motas blancas/rosas dentro del follaje** (liquidámbar): en los huecos pequeños entre hojas el
  fondo claro se mezclaba con el rojo y quedaba un rosa claro con mucha saturación, que contaba
  como hoja. Con el atlas sobre **magenta** (sin rejilla): alpha = (130 − (min(R,B) − G)) / 80, y
  fuera el rosa claro (B − G > 18 y luminancia > 115; ninguna hoja ni corteza lo cumple). No
  "restes" el fondo en los bordes (con el JPEG da tonos claros): los píxeles no macizos toman el
  color de la hoja maciza vecina, y lo transparente el color medio de alrededor, antes de reducir.
  Dos versiones del atlas (verde y magenta) no sirven para "triangulation matting" si no coinciden
  píxel a píxel (estas, generadas aparte, difieren ~30 niveles en la corteza).
- **Flores en el trigo**: atlas "flores" generado con `PraderaAtlasLib.crearAtlasCanvas` de Creador-de-mundos (Playwright → `escena_liquidambar/flores.png`). Las cabezas del atlas son pequeñas y de lejos desaparecen: motas del color de la flor dominante en el suelo del campo (mismo ruido en JS y GLSL) para que se lea florido.
- **Escena HTML con vuelo de dron** (`escena_liquidambar/`, 2026-11): plantilla three.js + GLB y
  texturas en base64 (`construir.py`) para que se abra con doble clic. Cielo, nubes FBM, sombras de
  nubes en el suelo y el filtro "Zelda" copiados de Creador-de-mundos-Rpg (`visor-mundo.html`,
  `js/terreno.js`, `js/pradera-atlas.js`), inyectados con `onBeforeCompile`. Tarjetas de doble cara
  en three.js: anular el volteo de la normal en la cara trasera (`normal = normalize(vNormal)`) o la
  mitad de las matas salen negras. Para atravesar la copa, buscar la recta por dentro (a menos de
  2,5 m del tronco) más alejada de la madera; una búsqueda libre acaba rodeando el árbol.
  Para probar sin red: Playwright con `page.route` sirviendo three desde `node_modules`.
- **Eucalipto** (`eucalipto/eucalipto.py`, 2026-11): dos cortezas = dos mallas; tras crear la
  primera se vacían las listas globales (`M_VERTS = []`...) y `tubo` sigue llenando las nuevas (el
  motor lo admite). La base rugosa es un "manguito" algo más ancho que el fuste (si no, el fuste
  asoma entre la corteza). Corteza en tiras verticales: el fundido normal deja un corte horizontal
  al repetir; mezclarla con ella misma desplazada media altura (peso sin² que es 0 en el borde).
  Las vistas propias (`CAMARAS`) van en metros cuando el modelo mide 0,08–35 m (no se reescala).
