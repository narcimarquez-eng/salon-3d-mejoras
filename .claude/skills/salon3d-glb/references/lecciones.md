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

## Tiburón con patas (desde una hoja de vistas)

- Las imágenes de `mat.color_map` no se cargaban (la biblioteca de texturas estaba vacía): ahora
  se precargan las que nombra el script, también con el nombre en una variable (`HOJA = "..."`).
- El visor usa el material EEVEE (o Cycles/Cel) según el modo, no el PBR base: un mapa de imagen
  hay que ponérselo a todos o sale blanco.
- Patas: mídelas en la hoja. Hechas el doble de gruesas que en la foto cogían el fondo y salían
  con rayas claras. Para unirlas al cuerpo sin que parezcan clavadas, el tubo nace estrecho muy
  dentro del cuerpo y se abre al cruzar la piel; con la misma foto en cuerpo y patas no hay
  salto de color.
- Proyección: con todas las vistas al mismo peso, la costura perfil/cenital salía en dientes de
  sierra a media altura del costado; peso 1.7 al perfil la sube al lomo.

## Monstruo y poni (mismo método que el tiburón)

- Cuerpo de una sola pieza del hocico a la grupa (cabeza, cuello y tronco): en el perfil cada
  columna tiene una sola parte del cuerpo, así que basta una tabla [px, arriba, abajo] y otra de
  medio ancho en la cenital. Patas, cola, orejas y púas aparte.
- Hoja con dos perfiles mirando al mismo lado: se usa uno (el que enseña la cola) con lado 0,
  que lo pone en los dos costados (el otro sale volteado).
- Manchas blancas en crin, cola y tupé: eran los huecos claros entre pelos, que el preparador
  tomaba por figura. Con umbral 150 cuentan como fondo y se rellenan con el color de al lado.
- La cola o la barriga que llegan justo al borde de la silueta cogen el fondo: mételas unos
  píxeles dentro (la barriga del monstruo, 8 px; la cola del poni iba 20 px desplazada).

## Animar como cuadrúpedo (`src/human/animateQuadruped.ts`)

- Junta las piezas en el mundo, pone los pies en el suelo, coloca el esqueleto de
  `creatureRig.ts` (cabeza hacia +Z de three, es decir -Y del script) y genera los clips de
  `creatureAnimations.ts`.
- Fallo visto: la malla salía estirada en reposo porque `new THREE.Skeleton(bones)` calcula la
  pose de reposo al crearse, antes de colocar los huesos, y `bind(skeleton, matriz)` no la
  recalcula. Hay que llamar a `skeleton.calculateInverses()` tras `updateMatrixWorld`.
- Las piezas con el mismo material se juntan en una sola malla: el monstruo pasó de 52 mallas
  (y 52 esqueletos en el .glb) a 2.

## Dragón (hoja de 2 filas, alas abiertas)

- Cada vista de la hoja estaba a una escala distinta (frente más cerca, espalda más lejos):
  mídela cruzando cabeza, patas y cola entre vistas, no des por hecho la misma escala.
- Cenital con la cabeza arriba en la foto: vista `"zr"` (horizontal = X, vertical = Y).
- Alas: contorno sacado de la cenital (borde de delante y de detrás por columna), levantadas
  hacia fuera y con los dedos caídos hacia atrás. Su piel es solo la cenital (en el perfil
  están plegadas, no coinciden).
- Animar con alas: el esqueleto no las veía porque medía el tronco con las alas incluidas.
  Ahora las piezas con "Ala"/"Wing" en el nombre no cuentan para el ancho del tronco (llama
  así a las alas). En el suelo las alas se quedan abiertas: plegarlas con los ángulos de los
  dragones de la app enrollaba la membrana.

## Lobo acorazado: modelos ligeros para juegos

- La hoja entera como textura pesaba 2-4 MB y además el exportador guardaba las fotos como PNG.
  Ahora: `preparar_hoja_fotos.py` y luego `atlas_vistas.py` (solo las 4 vistas, cenital girada,
  1024 px, ~120 KB); las imágenes .jpg se exportan como JPEG.
- Las normales de las mallas con foto no se compartían (el motor las recalculaba al final del
  script en triángulos sueltos): salían facetadas y el .glb no podía unir vértices. Arreglado:
  el motor respeta `normalesFijas` y el exportador une los vértices iguales. Lobo: 0,51 MB
  quieto y 0,86 MB animado (antes 1,0 y 2,1 MB).
- Los niveles High/Medium/Low bajan la textura a 384/256/128 px: con un atlas de 4 fotos se
  ve borroso. Para estos modelos usa Completo (ya es ligero).
- "Animar como cuadrúpedo" solo pone alas si hay piezas llamadas Ala/Wing: las hombreras
  anchas del lobo se tomaban por alas.
- Barniz (Coat) en la piel de foto deja puntitos blancos de brillo: déjalo a 0.

## Arquero esqueleto (humanoide para juego)

- Cuerpo hecho de tubos verticales (cabeza, costillas, falda) y tubos por los huesos de
  brazos y piernas, todos medidos en frente (x) y perfil (y). Piel: atlas de 4 vistas en una
  fila (`atlas_vistas.py ... 5000`), 200 KB.
- Arco: tubo por la línea central de su vista en la hoja, con su propia vista "x". Se llama
  AR_Arco: "Animar → Humanoide" lo pone rígido en la mano derecha (como lo sujetan las
  animaciones de arquero). Evita "arma"/"arco" en otros nombres (Armadura lo contiene).
- Esqueleto humanoide por proporciones (cadera 0,5 H, hombros 0,79 H...) y por la forma
  (pies = lo más bajo de cada lado; manos = lo más alejado a cada lado). Resultado: 0,54 MB
  animado con 3.000 triángulos.

## Arquero: disparo, flecha y pose inclinada

- Personaje inclinado al cargar el .glb animado: se exportó con una animación en marcha (la
  última, Death) y los clips que no tocan la cadera la dejaban como estaba. Ahora la
  exportación pone el esqueleto en reposo (`skeleton.pose()`) y cada clip lleva pista de
  todos los huesos (`fillMissingBoneTracks`). Re-exportados todos los animados.
- El Attack de arquero de Enemigo-rpg no vale para este esqueleto (la mano que tensa se iba
  arriba y afuera): `createBowShotClip` lo resuelve por objetivos con IK de dos huesos
  (arco al frente a la altura del hombro, cuerda a la cara con el codo alto).
- Arco con hueso propio (Bow, hijo de la mano derecha) cuyo giro se calcula para seguir recto
  respecto al cuerpo; flecha con hueso propio (Arrow, hijo de la cadera) montada entre la mano
  que tensa y el arco, que sale recta hacia delante y desaparece hasta el siguiente disparo.
- Dedos: cuatro falanges y pulgar por mano, cinco dedos por pie (tubos finos con la foto).

## Coche solar de madera (desde fotos reales, no una hoja de vistas)

- Fotos con perspectiva: no se proyectan enteras. Medidas de la vista de lado y texturas por
  recortes (madera repetida con color_map_scale, cara con ojos y lateral de la cabeza como
  calcomanías finas delante de la pieza de madera, llanta con máscara circular).
- Neumático: goma negra con tacos; la foto de la llanta solo en un disco fino por fuera (en el
  cilindro entero, la banda de rodadura salía con rayas plateadas).
- Botón "Juego" (pestaña Blender Python): junta las piezas que comparten material y quita el
  suelo. Coche: de 146 piezas a 13 y de 0,51 a 0,32 MB.

## Blender de verdad (módulo bpy 5.3, sin ventana)

- Instalación: `python3 -m venv <dir> && <dir>/bin/pip install bpy==5.3.0` (paquete oficial de
  la Blender Foundation; ~1 GB). Renderiza con Cycles en CPU (unos 5-8 s por vista a 700 px).
- `scripts/salon3d_blender.py script.py prefijo [--glb out.glb] [--juego]`: ejecuta un script
  de la app en Blender. Traduce color_map / color_map_views / color_map_scale (UV por cara con
  la misma regla que la app), ignora render.set_* y texture, suaviza por ángulo, renderiza
  frente/lado/espalda/3/4 y exporta (con --juego: sin suelo, una malla, Draco y JPEG).
- `scripts/blender_animar.py script.py animado_de_la_app.glb out.glb prefijo --rigidas
  "OR_Baston:RightHand"`: mismo esqueleto y animaciones que la app, pero con pesos
  automáticos de Blender (calor). En modelos hechos de piezas el calor falla en muchas (14-40 %
  de vértices): esas piezas, y las pequeñas o de manos y pies, van enteras a su hueso.
- Trampas vistas: bmesh solo se puede importar después de bpy; el importador glTF añade una
  esfera para dibujar huesos (no medirla); los huesos importados apuntan hacia donde quiere
  Blender (el tramo real va del inicio del hueso al inicio de su hijo); las anotaciones
  "# ..." al final de `mat.color_map_scale = ...` rompían la traducción.
- Resultado: misma forma y piel que en la app; luz y sombras mejores; .glb un 20 % más ligero
  (Draco). Con pesos automáticos el tronco y los hombros se doblan algo más suaves, pero en
  modelos de piezas no hay gran diferencia frente a la app.
- Arreglo en la app de paso: el esqueleto humanoide tomaba como mano el punto más alejado
  (un pincho del brazal, o la pierna). Ahora: el punto más lejano al hombro por fuera del
  ancho de las piernas.

## Draco en la app

- three.js lee Draco pero no lo escribe: `src/utils/dracoCompress.ts` comprime el .glb ya
  exportado con glTF-Transform + el codificador oficial `draco3d` (wasm; el archivo "nodejs"
  funciona en el navegador con `locateFile`). Conserva huesos, animaciones y texturas.
- El visor abre .glb con Draco (DRACOLoader con el decodificador en public/draco).
- Gana mucho en geometría (coche 0,53 → 0,20 MB) y poco cuando manda la textura (orco
  animado 0,87 → 0,65 MB): para eso, bajar la textura (High/Medium) o un atlas más pequeño.

## Retexturizar un modelo del panel de fotos (titán)

- El panel da buena forma, pero los costados salen estirados y la foto de perfil al 100 %
  hace franjas. `scripts/repiel_panel.cjs entrada.glb /textures/atlas.jpg '<cfg>' salida.glb`
  conserva forma, esqueleto y animaciones y le pone la piel con la regla de las vistas
  (cfg: escala del atlas, pesos, rectángulos de cada vista en la hoja y su origen en el atlas;
  ejemplo en el commit del titán). Los brazos (fuera de `medioTronco`) y las filas `tapadas`
  (donde la mano tapa el muslo en el perfil) nunca usan el perfil.
- Caras de canto cogen la línea de tinta del contorno: preparar la hoja con
  `preparar_hoja_fotos.py ... 50 0 150 7` (quitar 7 px de borde) y usar ese atlas.
- Bulto en los muslos: en la foto de perfil las manos tapan el muslo y el panel lo toma como
  grosor de la pierna. `scripts/quitar_bulto_perfil.cjs` lo aplana por anillos (no por
  franjas de altura fijas: con franjas vacías salen ondas horizontales).
- La animación Walk del panel estira mucho la entrepierna en el paso largo: viene de los
  pesos del panel (pasa igual en el .glb original), no de retexturizar.
