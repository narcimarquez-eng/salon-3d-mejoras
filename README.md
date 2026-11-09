# 3D Game & Anime Studio — Motor de Scripting Python (Blender 5.2 API)

Bienvenido a la documentación oficial del **Motor de Ejecución Python basado en Blender 5.2 (`bpy`)** integrado en la aplicación. Este motor transpila y ejecuta scripts de Python (incluidos scripts generados por Gemini, ChatGPT, Claude o escritos para Blender 4.x / 5.2) directamente en tiempo real sobre la escena WebGL / Three.js con sombreado **Anime Cel-Shading** y **PBR**.

---

## 1. Modos de Ejes de Coordenadas

En la ventana del editor Python puedes alternar entre dos sistemas de coordenadas:

- **Modo Blender 5.2 (`Z-Up`) *(Recomendado para Copiar y Pegar de la Web)***:
  - `X`: Izquierda / Derecha
  - `Y`: Profundidad (Adelante / Atrás)
  - `Z`: Altura (Arriba / Abajo)
  - *Convierte automáticamente las posiciones, rotaciones y escalas al espacio 3D del visor.*
- **Modo Three.js (`Y-Up`)**:
  - `X`: Izquierda / Derecha
  - `Y`: Altura (Arriba / Abajo)
  - `Z`: Profundidad (Adelante / Atrás)

---

## 2. Operadores de Primitivas 3D (`bpy.ops.mesh.*` y `bpy.ops.curve.*`)

Todos los operadores aceptan tanto argumentos posicionales como argumentos por palabra clave (`location`, `rotation`, `scale`, `size`, `radius`, `depth`, `color`, etc.) y actualizan automáticamente `bpy.context.active_object` (y su alias `bpy.context.object`).

| Función / Operador | Parámetros Admitidos | Descripción |
| :--- | :--- | :--- |
| `bpy.ops.mesh.primitive_cube_add(...)` | `size=2.0`, `location=(x,y,z)`, `rotation=(rx,ry,rz)`, `scale=(sx,sy,sz)`, `color` | Crea un cubo o bloque subdividido. |
| `bpy.ops.mesh.primitive_uv_sphere_add(...)` | `radius=1.0`, `segments=32`, `ring_count=16`, `location`, `rotation`, `scale`, `color` | Crea una esfera UV de alta densidad. |
| `bpy.ops.mesh.primitive_ico_sphere_add(...)` | `radius=1.0`, `subdivisions=2`, `location`, `rotation`, `scale`, `color` | Crea una esfera geodésica (icosaedro). |
| `bpy.ops.mesh.primitive_cylinder_add(...)` | `radius=1.0`, `depth=2.0`, `vertices=32`, `location`, `rotation`, `scale`, `color` | Crea un cilindro. |
| `bpy.ops.mesh.primitive_cone_add(...)` | `radius1=1.0`, `radius2=0.0`, `depth=2.0`, `vertices=32`, `location`, `rotation`, `scale`, `color` | Crea un cono o tronco de cono. |
| `bpy.ops.mesh.primitive_torus_add(...)` | `major_radius=1.0`, `minor_radius=0.25`, `major_segments=48`, `minor_segments=16`, `location`, `rotation`, `scale`, `color` | Crea un toroide / anillo. |
| `bpy.ops.mesh.primitive_plane_add(...)` | `size=2.0`, `location`, `rotation`, `scale`, `color` | Crea un plano subdividido. |
| `bpy.ops.mesh.primitive_grid_add(...)` | `size=2.0`, `x_subdivisions=10`, `y_subdivisions=10`, `location`, `rotation`, `scale`, `color` | Crea una rejilla subdividida. |
| `bpy.ops.mesh.primitive_circle_add(...)` | `radius=1.0`, `vertices=32`, `fill_type='NGON'`, `location`, `rotation`, `scale`, `color` | Crea un disco/círculo poligonal. |
| `bpy.ops.mesh.primitive_monkey_add(...)` | `size=2.0`, `location`, `rotation`, `scale`, `color` | Crea una cabeza estilizada tipo Suzanne. |
| `bpy.ops.curve.primitive_bezier_curve_add(...)` | `radius=1.0`, `location`, `rotation`, `scale`, `color` | Crea una curva tubular ajustable con `obj.data.bevel_depth`. |
| `bpy.ops.curve.primitive_bezier_circle_add(...)` | `radius=1.0`, `location`, `rotation`, `scale`, `color` | Crea un aro curvo cerrado. |

---

## 3. Operadores de Objeto, Malla y Transformación (`bpy.ops.*`)

### `bpy.ops.object.*`
- `bpy.ops.object.select_all(action='SELECT' | 'DESELECT')`: Selecciona o deselecciona objetos.
- `bpy.ops.object.delete(use_global=False)`: Elimina los objetos seleccionados si `select_all(action='SELECT')` fue invocado al inicio del script para limpiar la escena.
- `bpy.ops.object.shade_smooth()` / `bpy.ops.object.shade_auto_smooth()`: Suaviza las normales de la malla activa.
- `bpy.ops.object.shade_flat()`: Calcula normales planas (Low-Poly / Facetado).
- `bpy.ops.object.subdivision_set(level=1..3)`: Aplica subdivisión orgánica Loop-Warren + Taubin sobre el objeto activo.
- `bpy.ops.object.modifier_add(type='SUBSURF' | 'MIRROR' | 'ARRAY' | 'SOLIDIFY' | 'BEVEL' | 'DECIMATE')`: Añade un modificador al objeto activo.
- `bpy.ops.object.modifier_apply(modifier="Nombre")`: Aplica el modificador sobre la geometría.
- `bpy.ops.object.mode_set(mode='OBJECT' | 'EDIT')`: Cambia el modo del objeto activo.
- `bpy.ops.object.origin_set(...)`, `bpy.ops.object.transform_apply(...)`, `bpy.ops.object.empty_add(...)`, `bpy.ops.object.light_add(...)`, `bpy.ops.object.camera_add(...)`, `bpy.ops.object.armature_add(...)`: Soportados de forma segura para compatibilidad total con scripts completos de Blender.

### `bpy.ops.mesh.*` (Edición y Esculpido Procedural)
- `bpy.ops.mesh.subdivide(number_cuts=1, smoothness=1.0)`: Subdivide la geometría activa o seleccionada.
- `bpy.ops.mesh.vertices_smooth(factor=0.5, repeat=2)`: Relajación Laplaciana/Taubin libre de encogimiento.
- `bpy.ops.mesh.Inflate(factor=0.15)`: Infla o contrae los vértices a lo largo de sus normales.
- `bpy.ops.mesh.Symmetrize(direction='POSITIVE_X')`: Fuerza simetría bilateral en el eje X.
- `bpy.ops.mesh.ExtrudeRegionMove(...)` / `bpy.ops.mesh.Bevel(...)` / `bpy.ops.mesh.Solidify(...)` / `bpy.ops.mesh.Decimate(...)` / `bpy.ops.mesh.SimpleDeform(...)`.

### `bpy.ops.transform.*` y `bpy.ops.material.*`
- `bpy.ops.transform.resize(value=(sx, sy, sz))`
- `bpy.ops.transform.translate(value=(dx, dy, dz))`
- `bpy.ops.transform.rotate(value=angle_rad, orient_axis='X' | 'Y' | 'Z')`
- `bpy.ops.material.set_color(color='#ff4466' | (r, g, b, a))`
- `bpy.ops.material.set_texture(name='dragon_scales' | 'carbon_fiber' | 'hex_armor' | 'cloth_weave' | 'none')`

---

## 4. Construcción de Mallas Personalizadas (`bpy.data.meshes` y `from_pydata`)

Puedes construir cualquier geometría poligonal desde cero a partir de listas de vértices y caras (triángulos, quads o n-gons):

```python
import bpy

# 1. Crear el bloque de datos de malla
mesh = bpy.data.meshes.new(name="HojaEspada")

# 2. Definir vértices (x, y, z) y caras (índices de vértices)
verts = [
    (0.0, -0.1, 0.0),
    (0.15, 0.0, 0.0),
    (0.0, 0.1, 0.0),
    (-0.15, 0.0, 0.0),
    (0.0, 0.0, 1.8)
]
faces = [
    (0, 1, 4),
    (1, 2, 4),
    (2, 3, 4),
    (3, 0, 4),
    (0, 1, 2, 3)
]

# Admite argumentos posicionales o por nombre (vertices=..., edges=..., faces=...)
mesh.from_pydata(verts, [], faces)
mesh.update()

# 3. Crear el objeto y vincularlo a la colección de la escena
obj = bpy.data.objects.new("Espada", mesh)
bpy.context.collection.objects.link(obj)
```

---

## 5. Módulo `bmesh` (Modelado Topológico Avanzado)

Soporte completo para creación y manipulación mediante `bmesh`:

- `bm = bmesh.new()`
- `bm.from_mesh(mesh)` / `bmesh.from_edit_mesh(mesh)`
- `v = bm.verts.new((x, y, z))`
- `bm.verts.ensure_lookup_table()`, `bm.verts.remove(v)`, indexación negativa `bm.verts[-1]`
- `f = bm.faces.new([v1, v2, v3, ...])`, `f.smooth = True`, `f.calc_center_median()`
- `bm.transform(matrix)`
- `bm.to_mesh(mesh)` / `bmesh.update_edit_mesh(mesh)`
- `bm.free()` / `bm.clear()`
- **Operadores `bmesh.ops.*`** (pueden combinarse múltiples llamadas sobre el mismo `bm`):
  - `bmesh.ops.create_cube(bm, size=1.0, matrix=...)`
  - `bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.5, matrix=...)`
  - `bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.5, matrix=...)`
  - `bmesh.ops.create_cone(bm, segments=16, radius1=0.5, radius2=0.0, depth=1.0, matrix=...)`
  - `bmesh.ops.create_cylinder(bm, segments=16, radius=0.5, depth=1.0, matrix=...)`
  - `bmesh.ops.create_circle(bm, segments=16, radius=0.5, matrix=...)`
  - `bmesh.ops.create_grid(bm, x_segments=4, y_segments=4, size=1.0, matrix=...)`
  - `bmesh.ops.translate(bm, vec=(dx, dy, dz), verts=bm.verts)`
  - `bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)`
  - `bmesh.ops.rotate(bm, matrix=rot_mat, cent=(0,0,0), verts=bm.verts)`

---

## 6. Materiales PBR y Nodos `Principled BSDF` (Blender 4.0 / 5.2)

El motor soporta tanto propiedades directas del material como árboles de nodos `Principled BSDF`:

```python
mat = bpy.data.materials.new(name="AceroRunico")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"] # o mat.node_tree.nodes.get("Principled BSDF")

# Soportados todos los sockets estándar de Blender 5.2:
bsdf.inputs["Base Color"].default_value = (0.15, 0.55, 0.95, 1.0)
bsdf.inputs["Metallic"].default_value = 0.85
bsdf.inputs["Roughness"].default_value = 0.25
bsdf.inputs["Emission Color"].default_value = (0.0, 0.8, 1.0, 1.0)
bsdf.inputs["Emission Strength"].default_value = 2.0

# Asignación al objeto:
obj.data.materials.append(mat)
# o directamente:
obj.active_material = mat
```

---

## 7. Modificadores (`obj.modifiers`)

Puedes añadir modificadores mediante `mod = obj.modifiers.new(name="...", type="...")`:

- **`MIRROR`**: `mod.use_axis = (True, False, False)`, `mod.mirror_object = target_obj`. Espeja automáticamente tanto objetos desplazados del origen como geometrías centradas.
- **`ARRAY`**: `mod.count = 5`, `mod.use_relative_offset = True`, `mod.relative_offset_displace = (1.2, 0, 0)`, `mod.use_constant_offset = True`, `mod.constant_offset_displace = (0.5, 0, 0)`.
- **`SOLIDIFY`**: `mod.thickness = 0.05`.
- **`SUBSURF`**: `mod.levels = 2`, `mod.render_levels = 2`.
- **`BEVEL`** y **`DECIMATE`**.

---

## 8. Módulo `mathutils` (`Vector`, `Euler`, `Matrix`, `Color`, `Quaternion`)

- **`Vector((x, y, z))`**:
  - Propiedades: `.x`, `.y`, `.z`, `[0]`, `[1]`, `[2]`, `.length`, `.length_squared`.
  - Métodos: `.normalized()`, `.normalize()`, `.copy()`, `.dot(other)`, `.cross(other)`, `.angle(other)`, `.negate()`, `.to_tuple()`.
  - Operadores: Suma/resta de vectores (`v1 + v2`, `v1 - v2`) y asignación compuesta (`v.co += offset`, `v.co *= 1.2`).
- **`Euler((rx, ry, rz), 'XYZ')`**: `.x`, `.y`, `.z`, `.to_matrix()`.
- **`Matrix`**:
  - `Matrix.Identity(4)`
  - `Matrix.Translation((x, y, z))`
  - `Matrix.Rotation(angle_rad, 4, 'X' | 'Y' | 'Z')`
  - `Matrix.Scale(factor, 4, axis)`
  - Multiplicación matricial `@` (soporta `Matrix @ Matrix` y `Matrix @ Vector`).
- **`Color((r, g, b))`** y **`Quaternion((w, x, y, z))`**.

---

## 9. Librerías Estándar y Sintaxis Python Soportada

- **Módulos incluidos**: `import bpy`, `import bmesh`, `import mathutils`, `import math`, `import random`, `import numpy as np`.
- **Funciones built-in de Python**: `range()`, `len()`, `enumerate()`, `zip()`, `sum()`, `min()`, `max()`, `abs()`, `round()`, `int()`, `float()`, `str()`, `bool()`, `list()`, `tuple()`, `dict()`, `set()`, `reversed()`, `sorted()`, `isinstance()`, `hasattr()`, `getattr()`, `setattr()`, `print()`.
- **Características del lenguaje Python**:
  - Comprensiones de listas (`[expr for x in iter if cond]`), generadores (`(expr for x in iter)`) y diccionarios (`{k: v for k, v in items}`), incluyendo corchetes anidados (`[v.co[0] for v in bm.verts]`).
  - División entera `//` (`a // b`), potencia `**` (`-x ** 2`), multiplicación de listas (`[True] * 3`) y operador matricial `@`.
  - Slicing de listas y cadenas (`lista[::-1]`, `lista[1:5:2]`, `obj.scale[:2] = (1, 1)`).
  - Desempaquetado de tuplas con o sin paréntesis (`x, y, z = pos`, `a, b = 1, 2`, `for s in -1, 1:`, `return a, b`).
  - `f-strings` con especificadores de formato (`f"Pieza_{i:02d}_{val:.2f}"`) y `r-strings`.
  - Funciones `def` con valores por defecto, argumentos keyword (`fn(a=1, b=2)`), anotaciones de tipo (`def fn(x: float = 1.0) -> None:`) y ámbito local aislado.
  - Clases `class MiOperador(bpy.types.Operator):` con auto-ejecución al llamar a `bpy.utils.register_class(...)`.
