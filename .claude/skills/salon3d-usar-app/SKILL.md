---
name: salon3d-usar-app
description: >-
  Explica cómo se usa la aplicación salon-3d (CelShade Studio 3D): pestañas, barra superior, panel
  "Humano desde imágenes" (hoja de vistas, cuadrúpedo, patas y cola, cara, estudio de fotos con
  edición manual o en tiempo real), estudio Python, visor de sombreado y exportación GLB. Úsala
  cuando el usuario pregunte cómo se hace algo en la app, dónde está un botón, por qué no cambia
  el modelo, cómo cargar una hoja de vistas o cómo exportar, aunque no diga "skill".
---

# Usar la app salon-3d

La app es React + three.js (repo `narcimarquez-eng/salon-3d`). Arranca con `npx vite --port 5173`.
Esta guía describe la interfaz tal como está en la rama `claude/compassionate-keller-ds8nph`.
Los textos de botones son los que aparecen en pantalla: úsalos para ubicar cada cosa.

## 1. Pestañas y barra superior

- **Humano (Fotos)**: construye personajes a partir de fotos (panel "Humano desde imágenes").
- **Monstruos & GLB**: carga monstruos de Enemigo-rpg y optimiza GLB importados por zonas.
- **Blender Python**: estudio Python que ejecuta un script tipo bpy y muestra el resultado.
- **Cargar .GLB / .PY**: abre un GLB o un script de disco.
- **Sombreado**: `Cel` (cómic), `PBR` (físico, es el de por defecto), `Matcap`, `Malla`.
- **Contorno**: línea de cómic. Va apagado por defecto.
- **Frente / Perfil / Espalda**: cámara preestablecida. El icono ↻ restablece la cámara.
- **Drive**, **Completo**: exportación y guardado (ver §6).
- **Ocultar** (arriba a la derecha del visor): recoge el panel lateral para ver el modelo entero.

## 2. Hoja de vistas (para un personaje desde fotos)

Sube una sola imagen con botón **"Cargar imagen todo-en-uno (Cualquier personaje)"**.
La app la trocea sola:

- **Fila superior:** las vistas, de izquierda a derecha: **frente, perfil izquierdo, perfil derecho,
  espalda y cenital** (5 columnas). Con 2, 3 o 4 columnas también las reconoce.
- **Fila inferior (opcional):** mapas de capas pintados (zonas de color). Si no está, se usa la foto.
- Deja fondo liso entre columnas y entre filas: ahí corta la app.
- Fotos de cuerpo entero, en pose A y con fondo liso. Pon la vista de perfil siempre que la tengas.
- Para una criatura horizontal (cuadrúpedo, dragón) la vista cenital es la que da el ancho a lo
  largo del cuerpo; sin ella el hocico y la cola salen tan anchos como el pecho.

Para una sola foto sin molde previo: **"Cargar fotos en Construcción Libre (Sin molde previo)"**.

## 3. Esqueleto y opciones de construcción

Pulsa **"Crear personaje 3D"** para construir. Debajo aparece el resumen (vértices, triángulos,
huesos y animaciones).

- **Esqueleto:** `Automático`, `Humanoide` (19 huesos) o `Cuadrúpedo` (columna horizontal, cuatro
  patas, cola y sus propias animaciones). Para un animal, elige **Cuadrúpedo**.
- **Separar patas y rabos unidos por hilos:** corta los hilos que unen una pata o la cola con
  otra parte, para que no salgan membranas. Al marcarla aparece la imagen de detección:
  - Azul: cuerpo. Naranja: cola. Rojo: lo que se ha quitado (hilos o sobrante).
  - Recuadros verdes numerados ("Pata 1", "Cola 1") en el perfil.
  - **Pinchar** una pata o la cola en esa imagen limpia los hilos que la unen al cuerpo y
    reconstruye el personaje. **"Quitar limpiezas"** borra los puntos. "Grosor de hilo" ajusta
    qué se considera hilo.
- **Cara desde la foto de frente:** marca Ojos y cejas, Nariz, Boca, Orejas o Toda la cara. Esas
  partes se pintan con detalle de la foto; el resto sigue con la textura normal.
- **Nuca sin cara:** si no hay foto de espalda, evita que la nuca enseñe ojos y boca.
- **Usar solo un perfil (ignora el 2.º):** aparece si hay perfil derecho e izquierdo. Construye el
  perfil solo con el principal, sin promediar. Si está activa, "Promediar los dos perfiles" se oculta.
- **Recorte del contorno:** quita la línea negra del dibujo (Automático recomendado).
- **Importancia del perfil (Gradual)** y **Aplicación de textura de los perfiles**: cuánto manda el
  perfil en la profundidad y cuánta textura de perfil se aplica (0 % = solo frente y espalda).

## 4. Estudio de fotos (posición, tamaño y textura)

Panel **"Posición y Tamaño Translúcido (Junto al Frente)"** → **Abrir editor**.

- **Activar edición:** sin ella los controles no responden. Es un interruptor, y se ve en verde
  cuando está activa.
- **Manual** (por defecto): puedes mover y ajustar, pero el personaje no se reconstruye hasta
  pulsar **Ver cambios** (se activa cuando hay cambios pendientes).
- **Tiempo real:** cada cambio reconstruye el personaje al momento. Al pasar a este modo se
  aplican los cambios pendientes.
- **Recuadro de textura (verde):** es la caja a la que se ajusta la foto. Arrastrar su interior la
  mueve, arrastrar un borde o esquina cambia su tamaño, la rueda del ratón o dos dedos escalan.
  Las guías cian (Cabeza, Hombros, Cadera, Pies) son referencia; no cambian el modelo.
- **Selector de vista:** elige qué foto editas (Frente, Perfil Der, Perfil Izq, Espalda, Cenital).
- **Acoplar al Frente / Igualar 4 bordes:** alinean el recuadro de la vista activa con el del frente.
- **Deslizadores de bordes y tamaño:** mismo efecto, con números exactos. **Todo 100 %** restaura.

## 5. Visor

- **Sombreado:** `PBR` por defecto. `Cel` da el aspecto de cómic y se combina con **Contorno**.
- **Pedestal: ON/OFF:** base del modelo, para ver la figura sin ella.
- **Ocultar:** deja el visor a pantalla completa.
- La cámara se mueve con el ratón; **Frente / Perfil / Espalda** y ↻ la colocan en un preset.

## 6. Exportar

- **Descargar .GLB Completo (100 %)** en el panel del personaje: incluye esqueleto y animaciones.
- Debajo: **High / Medium / Low / Min** con menos triángulos (Low y Min para juego en navegador).
- En el estudio Python, **Completo** en "Bajar escena actual en .GLB" exporta la escena que has
  creado (sin esqueleto).
- Para un personaje, usa siempre el botón del propio panel: el exportador general pierde el
  esqueleto.

## 7. Animar como cuadrúpedo

- Recuadro verde **"Animar como cuadrúpedo"**, en la pestaña Blender Python (bajo "Bajar escena
  actual en .GLB") y en Monstruos & GLB. Pone al modelo del visor (un script o un .glb cargado)
  un esqueleto de 30 huesos y 11 animaciones: Idle, Walk, Trot, Run, Pounce, Attack, Bite, Hit,
  Death, Sit y RestPose.
- **"La cabeza mira a"**: Delante para los modelos de los scripts (hocico hacia -Y del script);
  para un .glb que mire a otro lado, elige su dirección.
- Tras pulsar **Animar**, la app pasa a Monstruos & GLB con la lista de animaciones; el .glb con
  huesos y animaciones se baja con Completo / High / Medium / Low.
- La boca no se abre (la cabeza es una pieza): Bite y Attack mueven la cabeza entera. Sit hace
  que se alce sobre las patas de atrás.

## 8. Estudio Python (Blender Python)

- Pestaña **Blender Python** → **Estudio Completo** abre el editor grande.
- Pega o escribe un script, pulsa **Ejecutar** (o Ctrl+Enter) y mira el visor.
- **Cargar .PY** o el desplegable de plantillas carga un ejemplo.
- Un error aparece con "Fallo en Línea N" en la consola del estudio.
- El visor tiene el contorno apagado y PBR por defecto; el grosor del contorno del motor se
  ajusta solo al tamaño de cada pieza.

## 9. Problemas típicos

- **"No cambia el modelo al mover la foto":** estás en Manual. Pulsa **Ver cambios**, o pasa a
  Tiempo real.
- **Los controles del estudio no responden:** falta **Activar edición**.
- **Sobra una franja alrededor de la pata en el perfil:** es la silueta de la foto. Activa
  "Separar patas y rabos" y pincha la pata en la imagen de detección.
- **La pata trasera sale como un tubo fino (solo pezuñas):** actualiza a la rama con el arreglo del
  hueco cola-pata (commit `dbd4f0b` o posterior).
- **La cara sale de espaldas:** comprueba que la foto de frente es la de cuerpo entero y que la
  vista de frente va en la primera columna de la hoja.
- **Sin foto de espalda:** activa "Nuca sin cara" para que la nuca no enseñe ojos ni boca.
