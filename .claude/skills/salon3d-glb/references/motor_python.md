# El motor Python de salon-3d

El motor (`src/utils/blenderPythonEngine.ts`) interpreta un subconjunto de Python con la API de
Blender. Lo que aquí figura como "probado" se ha usado en modelos que funcionan; lo demás existe
en el código pero conviene probarlo en un script pequeño antes de depender de ello.

## Contenido
1. Cabecera y estructura
2. Subconjunto de Python
3. Operaciones
4. Materiales
5. Texturas
6. Rotaciones y orientación
7. Escala y encuadre
8. Ajustes de render

## 1. Cabecera y estructura

- Primera línea útil: `# COORD_MODE: Z_UP` (Z hacia arriba, como Blender; la app lo convierte a
  su sistema Y-up).
- Empieza borrando la escena: `bpy.ops.object.select_all(action='SELECT')` y
  `bpy.ops.object.delete(use_global=False)`.
- Nombra todas las piezas con un prefijo del modelo (`MT_`, `EM_`, `Pz_`, `Arq_`...). Sirve para
  localizarlas desde las capturas (`worldPosOf(prefijo)`) y para leer el GLB.

## 2. Subconjunto de Python

Funciona (probado): `import math`, `def` con argumentos por defecto, `return`, listas, índices
`p[0]`, `for i in range(n)`, `for x in lista`, `if / elif / else`, operaciones aritméticas,
`math.sin/cos/atan2/sqrt/radians/pi`, concatenar texto con `+ str(i)`, tuplas como argumentos.

Evítalo (ha fallado o no está garantizado):
- `for (x, y, z) in [...]` y desempaquetar en el `for`: recorre una lista e indexa
  (`b = lista[i]`, `b[0]`).
- Expresiones condicionales `a if cond else b`: usa un `if` en dos líneas.
- Comprensiones de listas, `lambda`, clases, `try`, f-strings: no las uses.
- Desempaquetar el resultado de una función (`x, y, h = punto(s)`): devuelve una lista y usa
  `p = punto(s)` y `p[0]`.

## 3. Operaciones

Probadas:
- `bpy.ops.mesh.primitive_cube_add(size=1.0, location=..., rotation=...)` y después
  `obj.scale = (ancho, fondo, alto)`.
- `primitive_cylinder_add(vertices, radius, depth, location, rotation)`.
- `primitive_cone_add(vertices, radius1, radius2, depth, location, rotation)` (radius1 abajo).
- `primitive_uv_sphere_add(segments, ring_count, radius, location)` + `obj.scale` para elipsoides.
- `primitive_torus_add(major_radius, minor_radius, location, rotation)`.
- `bpy.context.active_object` para la pieza recién creada; `obj.name`, `obj.data.materials`.
- Mallas propias con `mesh.from_pydata(verts, [], caras)` (la usan las plantillas internas).

Existen en el motor (probar antes): `primitive_ico_sphere_add`, `primitive_plane_add`,
`primitive_capsule_add`, `primitive_arch_add`, `primitive_octahedron_add`,
`primitive_dodecahedron_add`, `primitive_horn_add`, `primitive_wing_pair_add`,
`primitive_limb_pair_add`, `primitive_wheel_pair_add`, `primitive_tree_foliage_add`,
`primitive_prop_chest_add`, `primitive_armor_plate_add`, `curve.primitive_bezier_curve_add`,
modificadores `MIRROR` y `SUBSURF`, `mesh.decimate`, `mesh.smooth`, `mesh.noise`, `mesh.twist`,
`mesh.taper`, `object.shade_smooth`.

## 4. Materiales

```python
mat = bpy.data.materials.new(name="XX_Nombre")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
```

Entradas que entiende el BSDF: `Base Color`, `Metallic`, `Roughness`, `Coat Weight` (barniz),
`Coat Roughness`, `Anisotropic`, `Transmission Weight`, `IOR`, `Alpha`, `Emission Color`,
`Emission Strength`, y además `texture` y `repeat` (patrón procedural y repeticiones).

- **Los colores son lineales**, como en Blender: el visor los convierte a sRGB y los aclara mucho.
  Un marrón café con leche se escribe `(0.22, 0.095, 0.032)`, no `(0.56, 0.36, 0.20)`. Para pasar
  un color sRGB (0–1) a lineal, elévalo a 2,2 aproximadamente. Con la luz del visor, los colores
  medios se ven más claros todavía: si algo sale lavado, oscurécelo.
- **Cristal y agua: usa `Alpha` (0,1–0,25) más `Coat Weight` alto**, no `Transmission Weight`.
  La transmisión se ve blanca y opaca en el visor (y no la soportan todos los motores de juego);
  con Alpha el GLB sale con `alphaMode BLEND`, que funciona en todas partes.
- **Brillos de luz** (farolas, runas): `Emission Color` = color y `Emission Strength` 2–4.
- **Pocos materiales**: la exportación Completo junta en una sola pieza todo lo que comparte
  material. Diez o quince materiales bien elegidos dan un GLB ligero.
- Atajos: `mat.texture = "stone_ashlar"` pone un patrón procedural; `mat.color_map = "cal_blanca"`
  usa una imagen (texturas CC0 `cal_blanca`, `teja_arcilla` o una de "Mis texturas") y
  `mat.color_map_scale = 2.5` fija los metros por repetición.

## 5. Texturas procedurales

Se ponen con `mat.texture = "<id>"`. Son grises o con color propio, se repiten sin costuras y
llevan relieve. Ids disponibles:

cobblestone (roca/piedra bruta), wood_oak (madera veteada), wood_mahogany (caoba), tree_bark
(corteza), water_caustics, ocean_deep (parece una piscina: no la uses para ríos o rías), desert_sand,
moss_nature, grass_meadow, ice_crystal, fresh_snow, stone_ashlar (sillería), travertine_roman,
marble_carrara, marble_nero, brick_mudejar, terracotta_roof (teja árabe), slate_roof,
andalusi_tiles (azulejo), stained_glass, concrete_brutalist, brushed_metal, damascus_steel,
gold_damascene, copper_patina, carbon_weave, leather_tufted (capitoné), royal_velvet,
woven_linen (tela), beast_hide (piel granulada), animal_fur (pelaje), feathers (plumas),
bone_ivory (hueso), chitin_carapace (quitina), dragon_scales, biomech_plates, magma_cracks,
solar_plasma, hologram_grid, halftone_manga, cyber_circuits, smooth_skin (degradado que no se
repite bien: evítalo con repeticiones).

La textura se ajusta a cada cara de la caja: en piezas muy alargadas (tablas de 20 m, vigas) la
veta se estira y parece arena. Ahí, mejor color liso o dividir la pieza.

## 6. Rotaciones y orientación

- `rotation=(rx, ry, rz)` en radianes, Euler XYZ como Blender: se aplica primero X, luego Y,
  luego Z, en ejes globales.
- **Giro en Y positivo baja el extremo +X** de la pieza. Para una barra que sube hacia +X usa
  `ry = -atan2(dz, dx)`. La función `viga(a, b)` de la plantilla ya lo resuelve: úsala para
  cualquier tirante o diagonal.
- Para orientar una pieza en planta: `rz = atan2(dy, dx)`. Para inclinarla y orientarla a la vez:
  `(0, -inclinación, rumbo)`.
- Tejado a dos aguas con la cumbrera en Y: faldón derecho `ry = +pendiente`, izquierdo
  `-pendiente` (con los signos al revés sale un valle). Función `tejado_dos_aguas` en la plantilla.
- Trazados curvos (muelles, murallas): define una función `punto(s)` que devuelva `[x, y, rumbo]`
  a s metros del inicio y otra que desplace a un lado; coloca piezas como cuerdas entre puntos y
  alárgalas un poco (0,5–1 m) para tapar las juntas en la curva.

## 7. Escala y encuadre

- Mide en metros reales. Para objetos pequeños (un vaso), usa 1 unidad = 10 cm y dilo en la
  cabecera: piezas de pocos centímetros dan problemas de cámara.
- La app normaliza el tamaño de la escena: un suelo o un agua enormes dejan el modelo diminuto
  en la vista general. Ajusta el suelo al tamaño del modelo con algo de margen.

## 8. Ajustes de render (opcionales, solo afectan al visor)

```python
bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.6, bloom=0.05)
bpy.ops.render.set_lighting(intensity=1.3, angle=35)   # ángulo del sol: bajo = atardecer
bpy.ops.render.set_ssao(intensity=1.2)                  # oclusión ambiental
```
