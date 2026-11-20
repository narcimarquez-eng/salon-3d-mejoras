import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const BPY_SYSTEM_INSTRUCTION = `Eres un Ingeniero Técnico de Arte 3D experto en scripting de Blender 5.2 Python (bpy, bmesh, math, mathutils) para el motor universal "CelShade Studio 3D".
Tu objetivo es traducir CUALQUIER elemento descrito por el usuario (monumentos, catedrales, edificios, vehículos, coches, naves, barcos, tanques, props, cofres, mobiliario, árboles, terrenos, océanos, armas, criaturas, robots o personajes) en un script de Python (bpy) limpio y rico en detalles geométricos, materiales PBR y texturas procedurales 3D.

=== LOS 7 PUNTOS COMPLETOS DE LA API BPY DEL MOTOR (ENTRENAMIENTO MAESTRO GEMINI) ===

PUNTO 1. LIMPIEZA, COORDENADAS, PRIMITIVAS, GEOMETRÍA ORGÁNICA Y MACROS ('bpy.ops.mesh.*' & 'bpy.ops.curve.*'):
- Limpieza inicial (solo si mode='replace'):
  bpy.ops.object.select_all(action='SELECT')
  bpy.ops.object.delete()
- Coordenadas y Ejes: Respeta SIEMPRE y SIN MEZCLAR el Sistema de Ejes activo indicado en el prompt:
  * Si el modo activo es BLENDER 5.2 Z-UP (# COORD_MODE: Z_UP): X = Izquierda(-)/Derecha(+), Y = Profundidad Frente(-)/Fondo(+), Z = ALTURA VERTICAL (Suelo en Z=0.0, Arriba es +Z). Todas las alturas van en Z: location=(x, y, z_altura).
  * Si el modo activo es ESTUDIO 3D Y-UP (# COORD_MODE: Y_UP): X = Izquierda(-)/Derecha(+), Y = ALTURA VERTICAL (Suelo en Y=0.0, Arriba es +Y), Z = Profundidad Fondo(-)/Frente(+). Todas las alturas van en Y: location=(x, y_altura, z).
  * NUNCA mezcles alturas en Y y alturas en Z dentro del mismo script. Comienza el script con el comentario # COORD_MODE: Z_UP o # COORD_MODE: Y_UP según el modo indicado.
- Primitivas Clásicas (aceptan location=(x,y,z), rotation=(rx,ry,rz), scale=(sx,sy,sz), color=(r,g,b)):
  * bpy.ops.mesh.primitive_cube_add(size=1.0, location=..., scale=..., color=...)
  * bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=24, ring_count=16, location=..., color=...)
  * bpy.ops.mesh.primitive_ico_sphere_add(radius=0.6, subdivisions=2, location=..., color=...)
  * bpy.ops.mesh.primitive_cylinder_add(radius=0.35, depth=1.0, vertices=24, location=..., color=...)
  * bpy.ops.mesh.primitive_cone_add(radius1=0.35, radius2=0.0, depth=0.9, vertices=16, location=..., color=...)
  * bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.08, location=..., color=...)
  * bpy.ops.mesh.primitive_torus_knot_add(radius=0.65, tube=0.14, p=2, q=3, location=..., color=...)
  * bpy.ops.mesh.primitive_plane_add(size=2.0) / primitive_grid_add(size=2.0, x_subdivisions=20, y_subdivisions=20)
  * bpy.ops.mesh.primitive_circle_add(radius=1.0) / primitive_monkey_add(size=1.5)
  * bpy.ops.curve.primitive_bezier_curve_add() / primitive_bezier_circle_add()
- Herramientas de Geometría Orgánica, Chasis, Cristales y Hojas:
  * bpy.ops.mesh.primitive_capsule_add(radius=0.25, length=0.75, location=..., rotation=..., scale=..., color=...)
  * bpy.ops.mesh.primitive_octahedron_add(radius=0.42, detail=0, location=..., color=...)
  * bpy.ops.mesh.primitive_dodecahedron_add(radius=0.48, detail=0, location=..., color=...)
  * bpy.ops.mesh.primitive_horn_add(base_radius=0.20, tip_radius=0.02, length=1.05, bend=0.48, location=..., color=...)
  * bpy.ops.mesh.primitive_blade_add(length=1.45, width=0.26, thickness=0.06, curve=0.12, location=..., color=...)
  * bpy.ops.mesh.primitive_armor_plate_add(width=0.72, height=0.65, thickness=0.09, curvature=0.32, location=..., color=...)
- Macro-Herramientas Universales 1-Línea:
  * bpy.ops.mesh.primitive_prop_chest_add(width=1.15, height=0.82, depth=0.78, location=(0, 0.45, 0), color=..., accent_color=...)
  * bpy.ops.mesh.primitive_wheel_pair_add(radius=0.36, width=0.22, span=0.88, y_pos=0.36, z_pos=0.65, color=..., rim_color=...)
  * bpy.ops.mesh.primitive_tree_foliage_add(radius=0.95, layers=3, location=(0, 1.65, 0), color=..., accent_color=...)
  * bpy.ops.mesh.primitive_arch_add(width=1.25, height=1.65, thickness=0.24, location=(0, 0.0, 0), rotation=(0,0,0), color=..., accent_color=...)
  * bpy.ops.mesh.primitive_limb_pair_add(start_pos=(0.42, 1.58, 0.0), mid_pos=(0.78, 1.18, 0.14), end_pos=(0.70, 0.72, 0.36), thickness=0.15, joint_size=0.19, color=..., joint_color=...)
  * bpy.ops.mesh.primitive_wing_pair_add(span=1.95, feathers=6, y_height=1.68, z_offset=-0.26, spread=0.92, color=..., accent_color=...)

PUNTO 2. MALLAS 'from_pydata' Y TOPOLOGÍA DENSA 'bmesh' ('bmesh.ops.create_grid' & 'objects.link'):
- Mallas por vértices y caras exactas ('from_pydata'):
  mesh = bpy.data.meshes.new(name="MiMalla"); mesh.from_pydata(verts, edges, faces); mesh.update()
  obj = bpy.data.objects.new("MiObjeto", mesh); bpy.context.collection.objects.link(obj)
- Modelado topológico con 'bmesh' y 'bmesh.ops':
  bm = bmesh.new() # o bm.from_mesh(mesh)
  bmesh.ops.create_grid(bm, x_segments=40, y_segments=40, size=4.0) # o create_cube, create_uvsphere, create_icosphere, create_cone, create_cylinder
  for v in bm.verts: v.co.z += 0.18 * math.sin(v.co.x * 2.0) * math.cos(v.co.y * 2.0)
  for f in bm.faces: f.smooth = True
  bmesh.ops.translate / scale / rotate / extrude_face_region / bevel / bisect_plane / recalc_face_normals
  bm.to_mesh(mesh); bm.free()

PUNTO 3. BIBLIOTECA COMPLETA DE 38 TEXTURAS PBR 3D + RELIEVE BUMP (POR OBJETO O GLOBAL) Y ALIAS:
- Asignación por material: mat.texture = 'stone_ashlar'; mat.texture_repeat = 2; mat.bump_strength = 1.2 (o bsdf.inputs["Texture"].default_value = '...')
- Texturas de IMAGEN reales (color + normal + rugosidad, CC0 y del usuario): mat.color_map = 'cal_blanca' (cal blanca, enfoscados y muros), mat.color_map = 'teja_arcilla' (teja árabe de arcilla), mat.color_map_scale = 2.0 (metros que ocupa una repetición; por defecto 3.0). Úsalo para muros de cal, tejados de teja y fachadas reales; las UV se proyectan en metros automáticamente. Si el usuario ha subido sus propias imágenes, también puede usarse mat.color_map = 'nombre_de_la_imagen'.
- Mosaicos Completos y 7 Catálogos Atlas 5x2 (70 sub-teselas 512x512 recortadas automáticamente):
  * Mosaicos completos: 'mosaico_romano_imperial', 'mosaico_gotico_carmesi', 'mosaico_muro_nazari'.
  * Catálogos Atlas 5x2: 'catalogo_progresion_agua_arena' ('agua_profundidad_t01'..'agua_profundidad_t10', desde arena 0.5m hasta alta mar 30m+), 'catalogo_suelos_mazmorra' ('suelo_mazmorra_t01'..'t10'), 'catalogo_paredes_mazmorra' ('pared_mazmorra_t01'..'t10'), 'catalogo_columnas_mazmorra' ('columna_mazmorra_t01'..'t10'), 'catalogo_tejados' ('tejado_t01'..'t10'), 'catalogo_hierbas' ('hierba_t01'..'t10'), 'catalogo_agua_cristalina' ('agua_t21'..'t30').
  * Uso por zona/pieza: bpy.ops.material.paint_zone(zone='Suelo', texture='catalogo_progresion_agua_arena', tile='T-04', projection='FLAT', repeat=2) o bpy.ops.material.set_mosaic_texture(...).
- Texturas PBR CC0 en vivo desde POLY HAVEN (871+ materiales reales con Diffuse + Normal GL + Roughness + Metalness): usa prefijo 'polyhaven:<asset_id>' o 'polyhaven:<asset_id>@2k' (ej. 'polyhaven:brick_wall_001', 'polyhaven:wood_planks_dirt', 'polyhaven:cobblestone_floor_08', 'polyhaven:rusty_metal_02') en mat.color_map = 'polyhaven:brick_wall_001', en bpy.data.images.load('polyhaven:...'), en bpy.ops.material.paint_zone(zone='Muro', texture='polyhaven:brick_wall_001', projection='BOX', repeat=2) o en bpy.ops.material.set_polyhaven_texture(zone='Muro', asset='brick_wall_001', resolution='1k', projection='BOX', repeat=2).
- Asignación por objeto o global: bpy.ops.material.set_texture(name='stone_ashlar', object=obj, repeat=2, bump=1.2, natural_color=True)
- Las 38 Texturas PBR + Bump disponibles:
  * Arquitectura y Piedra (11): 'stone_ashlar' (alias: 'piedra', 'silleria', 'caliza'), 'travertine_roman' ('travertino'), 'marble_carrara' ('marmol', 'carrara'), 'marble_nero' ('marmol_negro', 'marquina'), 'cobblestone' ('adoquin', 'empedrado'), 'brick_mudejar' ('ladrillo', 'mudejar'), 'terracotta_roof' ('teja', 'terracota'), 'slate_roof' ('pizarra'), 'andalusi_tiles' ('azulejo', 'ceramica'), 'stained_glass' ('vidriera', 'vitral'), 'concrete_brutalist' ('hormigon', 'cemento').
  * Maderas y Naturaleza (10): 'wood_oak' ('madera', 'roble'), 'wood_mahogany' ('caoba', 'nogal'), 'tree_bark' ('corteza', 'tronco'), 'water_caustics' ('agua', 'mar'), 'ocean_deep' ('oceano', 'olas'), 'desert_sand' ('arena', 'dunas'), 'moss_nature' ('musgo', 'liquen'), 'grass_meadow' ('hierba', 'cesped'), 'ice_crystal' ('hielo', 'glaciar'), 'fresh_snow' ('nieve', 'escarcha').
  * Metales, Tejidos y Cuero (8): 'brushed_metal' ('metal', 'acero', 'aluminio'), 'damascus_steel' ('damasco', 'forjado'), 'gold_damascene' ('oro', 'dorado', 'orfebreria'), 'copper_patina' ('bronce', 'cobre', 'patina'), 'carbon_weave' ('carbono', 'kevlar'), 'leather_tufted' ('cuero', 'piel'), 'royal_velvet' ('terciopelo', 'seda'), 'woven_linen' ('lino', 'tela', 'arpillera').
  * Fantasía, Sci-Fi y Anime (8): 'dragon_scales' ('escamas'), 'biomech_plates' ('biomecanico'), 'magma_cracks' ('magma', 'lava'), 'solar_plasma' ('plasma', 'sol'), 'hologram_grid' ('holograma'), 'halftone_manga' ('manga', 'comic'), 'cyber_circuits' ('circuitos', 'cyber'), 'smooth_skin' ('cel', 'anime').

PUNTO 4. MATERIALES PBR 'Principled BSDF' (Blender 5.2) Y NODOS CEL-SHADE / ANIME:
- creación: mat = bpy.data.materials.new(name="Material"); mat.use_nodes = True; bsdf = mat.node_tree.nodes["Principled BSDF"]
- Sockets soportados en bsdf.inputs[...].default_value:
  * "Base Color": (R, G, B, 1.0) | "Metallic": 0.0..1.0 | "Roughness": 0.02..1.0
  * "Coat Weight": 0.0..1.0 y "Coat Roughness": 0.02..0.5 (Barniz Clearcoat automotriz / lacado)
  * "Anisotropic": 0.0..1.0 (Metales cepillados)
  * "Transmission Weight": 0.0..0.95, "IOR": 1.45..2.4, "Alpha": 0.15..1.0 (Cristales, vidrieras, agua, gemas)
  * "Emission Color": (R, G, B, 1.0) y "Emission Strength": 0.0..10.0
  * "Bump Strength" / "Normal": 0.0..2.5 | "Texture": ID de cualquiera de las 38 texturas
- Nodos procedurales y Cel-Shade: ShaderNodeShaderToRGB + ShaderNodeValToRGB (ColorRamp con interpolation='CONSTANT'), ShaderNodeBump, ShaderNodeTexNoise, ShaderNodeTexBrick, ShaderNodeTexWave, ShaderNodeTexChecker, ShaderNodeTexVoronoi.

PUNTO 5. MOTORES DE RENDER ('CYCLES' / 'EEVEE' / 'CEL' / 'MATCAP'), ILUMINACIÓN 3 PUNTOS, CONTORNOS, SSAO Y CÁMARA/ZOOM:
- Selección de motor: bpy.context.scene.render.engine = 'CYCLES' # Opciones: 'CYCLES', 'BLENDER_EEVEE_NEXT', 'EEVEE', 'CEL', 'MATCAP', 'NORMALS', 'ORIGINAL'
- Parámetros físicos Cycles:
  bpy.context.scene.cycles.samples = 128 # 16..256
  bpy.context.scene.cycles.clearcoat = 0.65
  bpy.context.scene.cycles.roughness_factor = 0.85
  bpy.context.scene.cycles.ior = 1.52
  bpy.context.scene.cycles.gi_bounce = 1.45
- Parámetros EEVEE Next:
  bpy.context.scene.eevee.bloom_intensity = 0.45
  bpy.context.scene.eevee.env_intensity = 1.35
- Operadores de Iluminación, Contornos, SSAO, Normales y Cámara:
  bpy.ops.render.set_lighting(intensity=3.4, angle=42, headlight=True)
  bpy.ops.render.set_outline(thickness=0.015, opacity=0.90)
  bpy.ops.render.set_ssao(intensity=1.2)
  bpy.ops.render.set_normal_smoothing(factor=0.92)
  bpy.ops.render.set_viewport(bg_color='#182030', pedestal=True, auto_rotate=False, auto_rotate_speed=1.8)
  bpy.ops.view3d.camera_preset(view='hero', zoom=115) # Vistas: 'hero', 'front', 'closeup', 'macro', 'side', 'top'
  bpy.ops.view3d.set_zoom(percent=135)
  bpy.ops.view3d.frame_all(margin=1.15)

PUNTO 6. MODIFICADORES NO DESTRUCTIVOS ('BEVEL', 'SUBSURF', 'SOLIDIFY', 'ARRAY', 'MIRROR') Y EDICIÓN DE TRIÁNGULOS:
- Modificadores por objeto (mod = obj.modifiers.new(name="...", type='...')):
  * 'BEVEL': mod.width = 0.02; mod.segments = 2 (Biselado realista que atrapa la luz en bordes)
  * 'SUBSURF': mod.levels = 2 (Subdivisión orgánica suave)
  * 'SOLIDIFY': mod.thickness = 0.04; mod.use_flip_normals = False (Grosor real o negativo + flip_normals para Outline Anime)
  * 'ARRAY': mod.count = 6; mod.relative_offset_displace = (1.2, 0.0, 0.0) (Clonación matemática de arcos, columnas, radios)
  * 'MIRROR': mod.use_axis = (True, False, False); mod.mirror_object = ref_obj (Simetría bilateral exacta)
- Operadores de Triángulos y Malla:
  * bpy.ops.mesh.subdivide_triangles(segments=2, object=obj) # Divide cada triángulo en 4 (segments=2), 9 (3) o 16 (4)
  * bpy.ops.mesh.paint_triangles(color=(0.2, 0.7, 1.0), object=obj)
  * bpy.ops.mesh.mirror_x() | bpy.ops.mesh.taper(factor=0.22, axis='Y') | bpy.ops.mesh.smooth(iterations=3, factor=0.45) | bpy.ops.mesh.auto_ground()

PUNTO 7. ANIMACIÓN EN VIVO A 60 FPS ('bpy.anim.*'), ÁLGEBRA 'mathutils' Y SINTAXIS PYTHON AVANZADA:
- Animación continua en el visor WebGL:
  * bpy.anim.water(obj, speed=2.2, amplitude=0.12, frequency=2.5) # Olas y cáusticas animadas en tiempo real
  * bpy.anim.loop(obj, type='TURNTABLE', speed=1.0, amplitude=0.15, axis='Y') # Tipos: 'TURNTABLE', 'HOVER', 'PULSE', 'PENDULUM'
- Álgebra y Sintaxis: mathutils.Vector, Euler, Matrix, Quaternion, operador @ (Matrix @ Vector), numpy as np, comprensiones de listas/dicts, slicing arr[::-1], f-strings y clases bpy.types.Operator.

REGLAS IMPORTANTES:
- Adapta SIEMPRE la geometría, los materiales PBR y las 38 texturas exactamente al elemento pedido por el usuario.
- Cierra siempre con bpy.ops.mesh.auto_ground() y un print("...") descriptivo en español.`;

interface GeminiBpyHelpers {
  archetype?: string;
  symmetry?: string;
  complexity?: 'standard' | 'high' | 'ultra';
  palette?: string;
  autoSmooth?: boolean;
  autoTexture?: string;
  aiTools?: string[];
  autoCritique?: boolean;
  coordinateMode?: 'auto' | 'blender_z_up' | 'studio_y_up';
  sceneBounds?: {
    minX?: number;
    maxX?: number;
    minY: number;
    maxY: number;
    minZ?: number;
    maxZ?: number;
    widthX: number;
    depthZ: number;
    meshCount: number;
  };
}

const AI_TOOL_INSTRUCTIONS: Record<string, string> = {
  use_world_props:
    '- TAG ACTIVO [Props, Vehículos, Árboles y Arquitectura]: Usa `primitive_prop_chest_add`, `primitive_wheel_pair_add`, `primitive_tree_foliage_add` o `primitive_arch_add` según el objeto.',
  use_limbs:
    '- TAG ACTIVO [Extremidades Articuladas & Cápsulas]: Usa `primitive_limb_pair_add` para brazos/patas articuladas y `primitive_capsule_add` para segmentos redondeados.',
  use_horns_blades:
    '- TAG ACTIVO [Hojas Biseladas & Formas Curvas]: Usa `primitive_horn_add` para ramas curvas, cuernos o escapes, y `primitive_blade_add` para hojas, alerones o hélices.',
  use_armor_plates:
    '- TAG ACTIVO [Placas Curvas & Cristales]: Usa `primitive_armor_plate_add` para carrocerías, tejados curvos, escudos o blindajes, y `primitive_octahedron_add` para gemas o faros.',
  use_wings:
    '- TAG ACTIVO [Alas / Paneles en Abanico]: Usa `primitive_wing_pair_add` cuando el modelo requiera alas, velas o paneles desplegados.',
  use_bmesh_grid:
    '- TAG ACTIVO [Topología BMesh Densa (create_grid)]: Usa `bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=36, y_segments=36, size=4.0)` con ondas trigonométricas `math.sin/cos` y `bm.to_mesh(mesh)` para terrenos, bóvedas, olas o superficies orgánicas.',
  use_from_pydata:
    '- TAG ACTIVO [Polígonos Exactos (from_pydata)]: Construye partes arquitectónicas o perfiles a medida usando `mesh.from_pydata(verts, [], faces)` y `bpy.context.collection.objects.link(obj)`.',
  use_mod_bevel:
    '- TAG ACTIVO [Modificador BEVEL (Bordes Biselados Realistas)]: Aplica `mod = obj.modifiers.new(name="Bisel", type="BEVEL"); mod.width = 0.02; mod.segments = 2` en bloques, carrocerías y muros para capturar brillos especulares en los bordes.',
  use_mod_subsurf:
    '- TAG ACTIVO [Modificador SUBSURF (Subdivisión Suave)]: Aplica `mod = obj.modifiers.new(name="Subsurf", type="SUBSURF"); mod.levels = 2` en formas orgánicas, cúpulas o neumáticos.',
  use_mod_array_mirror:
    '- TAG ACTIVO [Modificadores ARRAY y MIRROR]: Usa `obj.modifiers.new(name="Array", type="ARRAY")` para repetir arcos/columnas/radios y `obj.modifiers.new(name="Mirror", type="MIRROR")` para simetría matemática.',
  use_mod_solidify_outline:
    '- TAG ACTIVO [Modificador SOLIDIFY + Outline Anime]: Usa `mod = obj.modifiers.new(name="Solidify", type="SOLIDIFY"); mod.thickness = 0.04` para dar grosor a cristales/telas o con `mod.use_flip_normals = True` para contornos.',
  use_pbr_clearcoat:
    '- TAG ACTIVO [Material PBR Clearcoat & Anisotropía (Blender 5.2)]: Configura `bsdf.inputs["Coat Weight"].default_value = 1.0`, `bsdf.inputs["Coat Roughness"].default_value = 0.04` y `bsdf.inputs["Anisotropic"].default_value = 0.6` en materiales metálicos, cerámicos o carrocerías.',
  use_pbr_glass_transmission:
    '- TAG ACTIVO [Cristal Real, Vidriera & Transmisión IOR]: Configura `bsdf.inputs["Transmission Weight"].default_value = 0.88`, `bsdf.inputs["IOR"].default_value = 1.52` y `bsdf.inputs["Roughness"].default_value = 0.05` para ventanas, vidrieras, faros, agua o gemas.',
  use_procedural_textures_per_obj:
    '- TAG ACTIVO [38 Texturas PBR + Bump 3D por Pieza]: Asigna texturas distintas a cada parte del modelo con `mat.texture = "..."` o `bpy.ops.material.set_texture(name="...", object=obj, repeat=2, bump=1.2)` (ej. `stone_ashlar`, `marble_carrara`, `brick_mudejar`, `terracotta_roof`, `wood_oak`, `gold_damascene`, `water_caustics`).',
  use_cel_shader_to_rgb:
    '- TAG ACTIVO [Nodos Anime ShaderToRGB + ColorRamp]: Añade nodos `ShaderNodeShaderToRGB` y `ShaderNodeValToRGB` con `interpolation = "CONSTANT"` y activa `bpy.ops.render.set_outline(thickness=0.018, opacity=0.95)`.',
  use_engine_cycles:
    '- TAG ACTIVO [Motor Físico CYCLES]: Al final del script activa `bpy.context.scene.render.engine = "CYCLES"`, `bpy.context.scene.cycles.samples = 128`, `bpy.context.scene.cycles.clearcoat = 0.70` y `bpy.context.scene.cycles.gi_bounce = 1.45`.',
  use_engine_eevee:
    '- TAG ACTIVO [Motor Tiempo Real EEVEE Next]: Al final del script activa `bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"`, `bpy.context.scene.eevee.bloom_intensity = 0.48` y `bpy.context.scene.eevee.env_intensity = 1.35`.',
  use_three_point_lighting:
    '- TAG ACTIVO [Iluminación Estudio 3 Puntos + SSAO]: Configura `bpy.ops.render.set_lighting(intensity=3.4, angle=42, headlight=True)` y `bpy.ops.render.set_ssao(intensity=1.25)`.',
  use_camera_framing:
    '- TAG ACTIVO [Encuadre Cámara Hero + Zoom]: Ajusta la cámara al final con `bpy.ops.view3d.camera_preset(view="hero", zoom=115)` y `bpy.ops.view3d.frame_all(margin=1.15)`.',
  use_tri_subdivide_paint:
    '- TAG ACTIVO [Subdivisión y Pintura de Triángulos]: Usa `bpy.ops.mesh.subdivide_triangles(segments=2, object=obj)` en mallas clave que requieran mayor densidad de triángulos.',
  use_live_animation:
    '- TAG ACTIVO [Animación en Vivo 60 FPS]: Añade movimiento en vivo con `bpy.anim.water(obj, speed=2.0, amplitude=0.10)` para agua o `bpy.anim.loop(obj, type="TURNTABLE", speed=0.8)` / `type="HOVER"` para elementos dinámicos.',
  auto_mirror:
    '- TAG ACTIVO [Simetría Espejo Automática]: Asegura simetría bilateral o incluye `bpy.ops.mesh.mirror_x()` antes del final del script.',
  auto_ground:
    '- TAG ACTIVO [Auto-Apoyo en Pedestal]: Incluye `bpy.ops.mesh.auto_ground()` al final del script para asentar el modelo exactamente sobre Y=0.02.',
};

const ARCHETYPE_GUIDES: Record<string, string> = {
  auto: 'ELEMENTO DE VIDEOJUEGO LIBRE: Analiza exactamente qué pide el usuario (prop, cofre, vehículo, edificio, árbol, mueble, arma, criatura o personaje) y construye su estructura específica con todo detalle.',
  game_prop_item:
    'ARQUETIPO PROP / OBJETO DE JUEGO / BOTÍN (LOOT): Construye el objeto de inventario o escenario (cofre con primitive_prop_chest_add, barril con cilindros y aros toroidales, frasco/poción con esfera de cristal + cuello cilíndrico + tapón, llave, escudo o moneda) con herrajes metálicos y gemas.',
  vehicle_spaceship:
    'ARQUETIPO VEHÍCULO / COCHE / NAVE / TANQUE / BARCO: Construye el chasis principal aerodinámico con cubos escalados y primitive_armor_plate_add, cabina acristalada superior, par de ejes con ruedas (primitive_wheel_pair_add) o propulsores traseros cilíndricos luminosos, alerones (primitive_blade_add) y faros frontales.',
  building_architecture:
    'ARQUETIPO EDIFICIO / CASA / TORRE / CASTILLO / PUENTE / PORTAL: Construye cimientos de piedra en la base, muros o cuerpo arquitectónico, entradas y arcos con primitive_arch_add, tejado cónico o a dos aguas, almenas, ventanas iluminadas y detalles de entorno.',
  nature_vegetation:
    'ARQUETIPO NATURALEZA / ÁRBOL / ROCA / SETA / ISLA: Construye una base de terreno o isla rocosa con primitive_dodecahedron_add, raíces y tronco curvo orgánico con primitive_capsule_add / primitive_horn_add, copa frondosa multicapa con primitive_tree_foliage_add, setas luminosas o cristales minerales.',
  furniture_interior:
    'ARQUETIPO MOBILIARIO / MESA / TRONO / FAROLA / ALTAR: Construye patas o soportes simétricos bien apoyados, tablero/asiento/estructura principal con tablones y marcos metálicos, y objetos decorativos encima (velas, libros, farol brillante o cáliz).',
  weapon_relic:
    'ARQUETIPO ARMA / ESCUDO / HERRAMIENTA / RELIQUIA: Construye mango o empuñadura ergonómica, pomo facetado, guarda ornamentada, y hoja biselada (primitive_blade_add), cabeza de martillo/hacha o núcleo de reliquia con runas brillantes.',
  biped_boss:
    'ARQUETIPO PERSONAJE / HÉROE / NPC / ROBOT: Construye piernas y brazos articulados con primitive_limb_pair_add, torso estilizado, cabeza expresiva o casco con visor y accesorios característicos.',
  arachnid_mecha:
    'ARQUETIPO ARÁCNIDO / DRON / MECHA MULTI-PATA: Construye chasis central, sensores/ojos frontales y múltiples patas radiales articuladas apoyadas en el suelo.',
  serpentine_dragon:
    'ARQUETIPO CRIATURA / DRAGÓN / MONSTRUO / MASCOTA: Construye cuerpo orgánico, extremidades o cola serpenteante, cabeza con mandíbula/ojos/cuernos (primitive_horn_add) y alas o espinas dorsales.',
  winged_entity:
    'ARQUETIPO SER ALADO / AVE / FÉNIX / ÁNGEL: Construye cuerpo estilizado y despliega un gran par de alas en abanico con primitive_wing_pair_add.',
  architecture_altar:
    'ARQUETIPO ALTAR / TORRE / TRONO ARCANO: Construye base escalonada, arcos (primitive_arch_add), columnas simétricas y núcleo cristalino central.',
};

const SYMMETRY_GUIDES: Record<string, string> = {
  bilateral_x:
    'SIMETRÍA BILATERAL EJE X: Para cada elemento lateral en +X, genera su par simétrico en -X.',
  radial_circle:
    'SIMETRÍA RADIAL 360°: Distribuye los elementos periféricos en círculo usando "for i in range(N):" con math.cos(ang) y math.sin(ang).',
  spiral_helix:
    'PATRÓN ESPIRAL / HÉLICE: Distribuye partes ascendiendo en Y mientras rotan en X/Z.',
  organic_asym:
    'COMPOSICIÓN ASIMÉTRICA / ESCENARIO NATURAL: Ideal para árboles, islas rocosas, ruinas o dioramas con distribución natural.',
};

const PALETTE_GUIDES: Record<string, string> = {
  crimson_gold:
    'PALETA CARMESÍ & ORO IMPERIAL: Base oscura (0.15, 0.17, 0.24), principal carmesí (0.90, 0.14, 0.28), herrajes y detalles en oro (0.98, 0.74, 0.12), energía (1.0, 0.35, 0.15).',
  cyber_neon:
    'PALETA CIBERNEÓN SCI-FI: Chasis titanio oscuro (0.14, 0.18, 0.26), paneles secundarios (0.28, 0.34, 0.46), neón cian (0.06, 0.88, 0.98), acentos magenta (0.95, 0.18, 0.62).',
  forest_nature:
    'PALETA BOSQUE & MADERA NATURAL: Madera corteza (0.45, 0.28, 0.14), follaje verde vivo (0.16, 0.74, 0.32), acentos musgo/hoja clara (0.48, 0.88, 0.26), flores/magia dorada (0.98, 0.82, 0.18).',
  medieval_stone:
    'PALETA PIEDRA MEDIEVAL, ROBLE & ORO: Piedra gris (0.42, 0.46, 0.52), madera roble (0.52, 0.31, 0.15), bronce/oro (0.95, 0.72, 0.18), antorcha/magia cálida (1.0, 0.48, 0.12).',
  abyssal_void:
    'PALETA ABISAL & ESMERALDA: Base obsidiana (0.10, 0.12, 0.18), secundario púrpura (0.42, 0.16, 0.68), bioluminiscencia esmeralda (0.12, 0.95, 0.55), detalles marfil (0.88, 0.86, 0.78).',
  celestial_ice:
    'PALETA CRISTAL ÁRTICO & PLATA: Base marfil/plata (0.85, 0.90, 0.96), hielo profundo (0.22, 0.68, 0.96), energía celeste (0.45, 0.92, 1.0), detalles oro blanco (0.96, 0.84, 0.45).',
  toxic_bio:
    'PALETA BIOMECÁNICA ÁCIDA: Base orgánica (0.18, 0.14, 0.24), secundario púrpura (0.58, 0.18, 0.42), verde ácido (0.55, 0.98, 0.12), ámbar (0.98, 0.58, 0.08).',
};

function parseDataUrlImage(dataUrl?: string): { mimeType: string; data: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

async function startServer() {
  const app = express();

  const portArgIndex = process.argv.indexOf('--port');
  const cliPort = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : NaN;
  const PORT = !Number.isNaN(cliPort) && cliPort > 0 ? cliPort : (Number(process.env.PORT) || 3000);

  const hostArgIndex = process.argv.indexOf('--host');
  const cliHost = hostArgIndex !== -1 ? process.argv[hostArgIndex + 1] : undefined;
  const HOST = cliHost || process.env.HOST || '0.0.0.0';

  app.use(express.json({ limit: '10mb' }));

  app.post('/api/gemini/bpy-generator', async (req, res) => {
    try {
      const {
        prompt,
        mode = 'replace',
        currentCode = '',
        helpers,
        referenceImageBase64,
        viewportImageBase64,
        selectedModel = 'gemini-3.8-flash',
        thinkingLevel = 'MEDIUM',
        userEmail,
      } = req.body as {
        prompt?: string;
        mode?: 'replace' | 'append' | 'refine';
        currentCode?: string;
        helpers?: GeminiBpyHelpers;
        referenceImageBase64?: string;
        viewportImageBase64?: string;
        selectedModel?: string;
        thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
        userEmail?: string;
      };

      // Mapeo a modelos oficiales soportados en @google/genai
      const VALID_MODELS: Record<string, string> = {
        'gemini-4-argon': 'gemini-4-argon',
        'gemini-3.8-flash': 'gemini-3.8-flash',
        'gemini-3.8-pro': 'gemini-4-argon',
        'gemini-3.8-thinking': 'gemini-3.8-flash',
        'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
        'gemini-2.5-flash': 'gemini-flash-latest',
      };
      const requestedModel = VALID_MODELS[selectedModel] || 'gemini-3.8-flash';

      const THINKING_LEVEL_MAP: Record<string, ThinkingLevel> = {
        LOW: ThinkingLevel.LOW,
        MEDIUM: ThinkingLevel.MEDIUM,
        HIGH: ThinkingLevel.HIGH,
      };
      // Si el usuario eligió el preset "gemini-3.8-thinking", forzamos HIGH por defecto
      const effectiveThinkingKey =
        selectedModel === 'gemini-3.8-thinking'
          ? 'HIGH'
          : String(thinkingLevel).toUpperCase();
      const resolvedThinkingLevel =
        THINKING_LEVEL_MAP[effectiveThinkingKey] || ThinkingLevel.MEDIUM;

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Por favor escribe una descripción de lo que deseas modelar con Python.' });
        return;
      }

      let modeInstruction = '';
      if (mode === 'append') {
        modeInstruction =
          'MODO ACTUAL: APPEND (Añadir sobre el modelo actual). NO llames a bpy.ops.object.delete(). Añade los nuevos objetos, accesorios, alas, armas o deformaciones alrededor del personaje existente.';
      } else if (mode === 'refine') {
        modeInstruction =
          'MODO ACTUAL: REFINE (Mejorar y evolucionar el script Python actual). Toma el "Script actual en el editor" como base, conserva lo mejor de su estructura y mejóralo o modifícalo según la petición del usuario.';
      } else {
        modeInstruction =
          'MODO ACTUAL: REPLACE (Crear objeto nuevo desde cero). DEBES incluir bpy.ops.object.delete() al principio del script para construir el nuevo modelo completo.';
      }

      const archetypeText = helpers?.archetype
        ? ARCHETYPE_GUIDES[helpers.archetype] || ''
        : '';
      const symmetryText = helpers?.symmetry
        ? SYMMETRY_GUIDES[helpers.symmetry] || ''
        : '';
      const paletteText = helpers?.palette
        ? PALETTE_GUIDES[helpers.palette] || ''
        : '';

      let complexityText =
        'NIVEL DE DETALLE ESTÁNDAR: Combina entre 14 y 24 primitivas bien posicionadas.';
      if (helpers?.complexity === 'high') {
        complexityText =
          'NIVEL DE DETALLE ALTO: Construye un modelo rico y complejo de entre 28 y 45 piezas usando bucles for para articulaciones, placas de armadura, espinas, dedos o anillos.';
      } else if (helpers?.complexity === 'ultra') {
        complexityText =
          'NIVEL DE DETALLE ULTRA (OBRA MAESTRA PROCEDURAL): Construye una escultura 3D hiper-detallada de entre 45 y 75 piezas combinando múltiples bucles for, sub-partes anatómicas (núcleo, placas pectorales, hombreras en capas, articulaciones, corona/cuernos, armas y halo orbital).';
      }

      const postEffectsLines: string[] = [];
      if (helpers?.autoSmooth) {
        postEffectsLines.push(
          '- Al final del script, antes del print final, incluye: bpy.ops.mesh.smooth(iterations=3, factor=0.45)'
        );
      }
      if (helpers?.autoTexture && helpers.autoTexture !== 'none') {
        postEffectsLines.push(
          `- Al final del script, aplica la textura procedural: bpy.ops.material.set_texture(name='${helpers.autoTexture}')`
        );
      }

      const activeToolsLines: string[] = [];
      if (Array.isArray(helpers?.aiTools)) {
        for (const toolId of helpers.aiTools) {
          if (AI_TOOL_INSTRUCTIONS[toolId]) {
            activeToolsLines.push(AI_TOOL_INSTRUCTIONS[toolId]);
          }
        }
      }

      const autoCritiqueDirective = helpers?.autoCritique
        ? `\nMODO AUDITORÍA VISUAL Y AUTO-MEJORA 3D ACTIVO:
1. Examina la captura actual del visor 3D, las dimensiones BoundingBox y el código actual.
2. Detecta partes demasiado simples, extremidades rígidas sin articulaciones, falta de simetría o piezas flotantes.
3. Reemplaza cilindros/cubos simples por \`primitive_limb_pair_add\`, \`primitive_capsule_add\`, \`primitive_armor_plate_add\`, \`primitive_horn_add\` o \`primitive_blade_add\`.
4. Cierra el script con \`bpy.ops.mesh.auto_ground()\` para que el modelo descanse perfecto sobre el pedestal.`
        : '';

      // Determinar el sistema de ejes efectivo para evitar que Gemini mezcle Y-Up con Z-Up
      const rawCoordMode = helpers?.coordinateMode || 'auto';
      const codeLooksZUp =
        currentCode.includes('# COORD_MODE: Z_UP') ||
        currentCode.includes('bmesh.ops.create_grid') ||
        currentCode.includes('v.co.z') ||
        (!currentCode.includes('# COORD_MODE: Y_UP') && rawCoordMode === 'blender_z_up');
      const effectiveIsZUp =
        rawCoordMode === 'blender_z_up' || (rawCoordMode === 'auto' && codeLooksZUp);

      const coordSystemDirective = effectiveIsZUp
        ? `\nSISTEMA DE EJES OBLIGATORIO ACTIVO: BLENDER 5.2 ESTÁNDAR (Z-UP / EJE Z ARRIBA).
- Primera línea obligatoria del script: # COORD_MODE: Z_UP
- Eje X: Izquierda (-X) a Derecha (+X). Centro en X = 0.0.
- Eje Y: Profundidad Frente (-Y) a Fondo (+Y). Centro en Y = 0.0.
- Eje Z: ALTURA VERTICAL. El suelo del pedestal está en Z = 0.00 y hacia arriba es +Z.
- REGLA CRÍTICA DE POSICIONAMIENTO: En \`location=(x, y, z)\`, la ALTURA siempre es el 3er valor \`z\`. Un objeto de altura H apoyado en el suelo tiene su centro en \`z = H / 2\`. PROHIBIDO poner alturas verticales en el eje Y.`
        : `\nSISTEMA DE EJES OBLIGATORIO ACTIVO: ESTUDIO 3D WEBGL (Y-UP / EJE Y ARRIBA).
- Primera línea obligatoria del script: # COORD_MODE: Y_UP
- Eje X: Izquierda (-X) a Derecha (+X). Centro en X = 0.0.
- Eje Y: ALTURA VERTICAL. El suelo del pedestal está en Y = 0.00 y hacia arriba es +Y.
- Eje Z: Profundidad Fondo (-Z) a Frente (+Z). Centro en Z = 0.0.
- REGLA CRÍTICA DE POSICIONAMIENTO: En \`location=(x, y, z)\`, la ALTURA siempre es el 2º valor \`y\`. Un objeto de altura H apoyado en el suelo tiene su centro en \`y = H / 2\`. PROHIBIDO poner alturas verticales en el eje Z.`;

      const sb = helpers?.sceneBounds;
      const minXVal = sb?.minX ?? -(sb?.widthX ?? 0) / 2;
      const maxXVal = sb?.maxX ?? (sb?.widthX ?? 0) / 2;
      const minZVal = sb?.minZ ?? -(sb?.depthZ ?? 0) / 2;
      const maxZVal = sb?.maxZ ?? (sb?.depthZ ?? 0) / 2;

      const boundsInfo = sb
        ? effectiveIsZUp
          ? `\nBOUNDING BOX EXACTO DEL MODELO ACTUAL EN COORDENADAS BLENDER Z-UP (Suelo Z=0.00):
- Eje X (Izquierda/Derecha): desde X=${minXVal.toFixed(2)} hasta X=${maxXVal.toFixed(2)} (Ancho=${sb.widthX.toFixed(2)})
- Eje Y (Profundidad Frente/Fondo): desde Y=${(-maxZVal).toFixed(2)} hasta Y=${(-minZVal).toFixed(2)} (Profundidad=${sb.depthZ.toFixed(2)})
- Eje Z (ALTURA VERTICAL): base en Z=${sb.minY.toFixed(2)}, cima en Z=${sb.maxY.toFixed(2)} (${sb.meshCount} mallas activas).
Usa exactamente estos rangos (X, Y, Z) para colocar nuevos puntos o piezas sin desfase.`
          : `\nBOUNDING BOX EXACTO DEL MODELO ACTUAL EN COORDENADAS ESTUDIO Y-UP (Suelo Y=0.00):
- Eje X (Izquierda/Derecha): desde X=${minXVal.toFixed(2)} hasta X=${maxXVal.toFixed(2)} (Ancho=${sb.widthX.toFixed(2)})
- Eje Y (ALTURA VERTICAL): base en Y=${sb.minY.toFixed(2)}, cima en Y=${sb.maxY.toFixed(2)}
- Eje Z (Profundidad Atrás/Frente): desde Z=${minZVal.toFixed(2)} hasta Z=${maxZVal.toFixed(2)} (Profundidad=${sb.depthZ.toFixed(2)}, ${sb.meshCount} mallas activas).
Usa exactamente estos rangos (X, Y, Z) para colocar nuevos puntos o piezas sin desfase.`
        : '';

      const contextSnippet = currentCode
        ? `\nScript actual en el editor:\n\`\`\`python\n${currentCode.slice(0, 3500)}\n\`\`\``
        : '';

      const fullTextPrompt = [
        modeInstruction,
        coordSystemDirective,
        `NIVEL DE RAZONAMIENTO SOLICITADO: ${effectiveThinkingKey} (${userEmail ? `Cuenta Google: ${userEmail}` : 'Sesión Estándar'}).`,
        archetypeText ? `\nGUÍA DE ARQUETIPO:\n${archetypeText}` : '',
        symmetryText ? `\nGUÍA DE SIMETRÍA:\n${symmetryText}` : '',
        complexityText ? `\n${complexityText}` : '',
        paletteText ? `\n${paletteText}` : '',
        activeToolsLines.length > 0
          ? `\nKIT DE HERRAMIENTAS IA ACTIVADAS PARA MEJORAR EL RESULTADO:\n${activeToolsLines.join('\n')}`
          : '',
        autoCritiqueDirective,
        postEffectsLines.length > 0
          ? `\nACABADOS AUTOMÁTICOS REQUERIDOS:\n${postEffectsLines.join('\n')}`
          : '',
        boundsInfo,
        `\nPETICIÓN DEL USUARIO: "${prompt.trim()}"`,
        contextSnippet,
        `\nGenera el script Python (bpy) completo respetando estrictamente el modo ${effectiveIsZUp ? 'Z-UP (# COORD_MODE: Z_UP)' : 'Y-UP (# COORD_MODE: Y_UP)'} y detalla en "thoughtEvolution" los 4 a 6 pasos clave de tu evolución de pensamiento.`,
      ]
        .filter(Boolean)
        .join('\n');

      const parts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      const refImg = parseDataUrlImage(referenceImageBase64);
      if (refImg) {
        parts.push({
          inlineData: {
            mimeType: refImg.mimeType,
            data: refImg.data,
          },
        });
        parts.push({
          text: 'IMAGEN DE REFERENCIA / BOCETO ADJUNTO POR EL USUARIO: Analiza la silueta, partes anatómicas, proporciones y colores de esta imagen para reconstruirla fielmente mediante primitivas y bucles Python (bpy).',
        });
      }

      const viewImg = parseDataUrlImage(viewportImageBase64);
      if (viewImg) {
        parts.push({
          inlineData: {
            mimeType: viewImg.mimeType,
            data: viewImg.data,
          },
        });
        parts.push({
          text: 'CAPTURA ACTUAL DEL VISOR 3D: Así se ve actualmente el objeto en el escenario 3D. Ten en cuenta su forma y colores actuales.',
        });
      }

      parts.push({ text: fullTextPrompt });

      // Función auxiliar para invocar un modelo con soporte de thinkingLevel
      const callGeminiModel = async (targetModel: string) => {
        const supportsThinking =
          targetModel === 'gemini-3.8-flash' || targetModel === 'gemini-4-argon';

        return await ai.models.generateContent({
          model: targetModel,
          contents: { parts },
          config: {
            systemInstruction: BPY_SYSTEM_INSTRUCTION,
            ...(supportsThinking
              ? { thinkingConfig: { thinkingLevel: resolvedThinkingLevel } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: 'Nombre corto del modelo o modificación generada (ej. Araña Mecha Cibernética).',
                },
                summary: {
                  type: Type.STRING,
                  description: 'Breve explicación en español (1-2 frases) de las partes geométricas creadas con Python.',
                },
                thoughtEvolution: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                  },
                  description:
                    'Lista cronológica de 4 a 6 pasos detallando la evolución del pensamiento técnico de Gemini (1. Análisis de forma, 2. Coordenadas y proporciones, 3. Simetría y bucles trigonométricos, 4. Paleta Cel-Shading y ensamblado final).',
                },
                pythonCode: {
                  type: Type.STRING,
                  description: 'Código fuente Python (bpy) completo y ejecutable.',
                },
              },
              required: ['title', 'summary', 'thoughtEvolution', 'pythonCode'],
            },
          },
        });
      };

      // Sintetizador procedural local de respaldo para CUALQUIER elemento de videojuego cuando la cuota gratuita se agota (HTTP 429)
      const buildLocalProceduralFallback = () => {
        const pLower = prompt.toLowerCase();
        const palMap: Record<string, { base: string; primary: string; accent: string; glow: string }> = {
          crimson_gold: {
            base: '(0.15, 0.17, 0.24)',
            primary: '(0.90, 0.14, 0.28)',
            accent: '(0.98, 0.74, 0.12)',
            glow: '(1.00, 0.38, 0.14)',
          },
          cyber_neon: {
            base: '(0.14, 0.18, 0.26)',
            primary: '(0.26, 0.34, 0.48)',
            accent: '(0.95, 0.18, 0.62)',
            glow: '(0.06, 0.88, 0.98)',
          },
          forest_nature: {
            base: '(0.45, 0.28, 0.14)',
            primary: '(0.16, 0.74, 0.32)',
            accent: '(0.48, 0.88, 0.26)',
            glow: '(0.98, 0.82, 0.18)',
          },
          medieval_stone: {
            base: '(0.42, 0.46, 0.52)',
            primary: '(0.52, 0.31, 0.15)',
            accent: '(0.95, 0.72, 0.18)',
            glow: '(1.00, 0.48, 0.12)',
          },
          abyssal_void: {
            base: '(0.10, 0.12, 0.18)',
            primary: '(0.42, 0.16, 0.68)',
            accent: '(0.88, 0.86, 0.78)',
            glow: '(0.12, 0.95, 0.55)',
          },
          celestial_ice: {
            base: '(0.84, 0.90, 0.96)',
            primary: '(0.22, 0.68, 0.96)',
            accent: '(0.96, 0.84, 0.45)',
            glow: '(0.45, 0.92, 1.00)',
          },
          toxic_bio: {
            base: '(0.18, 0.14, 0.24)',
            primary: '(0.58, 0.18, 0.42)',
            accent: '(0.98, 0.58, 0.08)',
            glow: '(0.55, 0.98, 0.12)',
          },
        };
        const pal = palMap[helpers?.palette || 'cyber_neon'] || palMap.cyber_neon;
        const arch = helpers?.archetype || 'auto';

        const isVehicle =
          arch === 'vehicle_spaceship' ||
          /coche|auto|carro|veh[ií]culo|nave|camion|tanque|moto|rover|barco|lancha| tren|helic[oó]ptero|avi[oó]n|jet|submarino/i.test(pLower);
        const isNature =
          arch === 'nature_vegetation' ||
          /[aá]rbol|bosque|planta|pino|roble|palmera|seta|hongo|flor|roca|piedra|monta[nñ]a|isla|volc[aá]n|arbusto|cactus/i.test(pLower);
        const isBuilding =
          arch === 'building_architecture' ||
          arch === 'architecture_altar' ||
          /casa|edificio|torre|castillo|puente|portal|templo|iglesia|caba[nñ]a|muro|muralla|fortaleza|pir[aá]mide|ruina|calabozo|mazmorra|pozo|molino|faro/i.test(pLower);
        const isPropOrFurniture =
          arch === 'game_prop_item' ||
          arch === 'furniture_interior' ||
          /cofre|ba[uú]l|caja|barril|tonel|poci[oó]n|frasco|botella|llave|moneda|gema|mesa|silla|trono|cama|estanter[ií]a|farola|antorcha|farol|estatua|carrito|bomba|comida|manzana|pan|libro|pergamino/i.test(pLower);
        const isDragon =
          arch === 'serpentine_dragon' ||
          arch === 'winged_entity' ||
          /drag[oó]n|wyvern|bestia|monstruo|f[eé]nix|ave|p[aá]jaro|grifo|lobo|perro|gato|mascota|dinosaurio|serpiente/i.test(pLower);
        const isSpider =
          arch === 'arachnid_mecha' ||
          /ara[nñ]a|escorpi[oó]n|insecto|cangrejo|crust[aá]ceo|escarabajo|dron/i.test(pLower);
        const isWeapon =
          arch === 'weapon_relic' ||
          /espada|hacha|lanza|arma|mandoble|guada[nñ]a|escudo|martillo|arco|pistola|rifle|ca[nñ][oó]n|b[aá]culo|varita|daga|pico|pala/i.test(pLower);
        const isRelic =
          /cristal|reliquia|orbe|altar|corona|t[oó]tem|amuleto/i.test(pLower);

        const headerLines: string[] = [
          'import bpy',
          'import math',
          '',
          `# Generado por Motor Procedural Universal de Juegos: ${prompt.trim().replace(/\n+/g, ' ')}`,
        ];

        if (mode === 'replace' || !currentCode.trim()) {
          headerLines.push('bpy.ops.object.delete()');
        } else {
          headerLines.push('# Conservando geometría previa y añadiendo mejoras procedurales:');
          const cleanedPrev = currentCode
            .split('\n')
            .filter((line) => !line.trim().startsWith('import ') && !line.trim().startsWith('print('))
            .join('\n');
          headerLines.push(cleanedPrev);
        }

        const bodyLines: string[] = [];

        if (isVehicle) {
          const isSpaceshipOrBoat = /nave|avi[oó]n|jet|cohete|barco|lancha|submarino/i.test(pLower);
          bodyLines.push(
            '# Chasis aerodinámico del vehículo y cabina acristalada',
            `bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.56, 0.0), scale=(1.15, 0.36, 1.95), color=${pal.base})`,
            `bpy.ops.mesh.primitive_armor_plate_add(width=1.18, height=0.45, thickness=0.14, curvature=0.35, location=(0, 0.65, 0.88), rotation=(1.05, 0, 0), color=${pal.primary})`,
            `bpy.ops.mesh.primitive_ico_sphere_add(radius=0.48, subdivisions=2, location=(0, 0.86, 0.05), scale=(0.95, 0.52, 1.35), color=${pal.glow})`
          );
          if (isSpaceshipOrBoat) {
            bodyLines.push(
              '# Alas delta / estabilizadores y propulsores traseros',
              `bpy.ops.mesh.primitive_wing_pair_add(span=1.95, feathers=4, y_height=0.62, z_offset=-0.15, spread=0.55, color=${pal.primary}, accent_color=${pal.accent})`,
              'for sx in [-0.38, 0.38]:',
              `    bpy.ops.mesh.primitive_cylinder_add(radius=0.20, depth=0.65, location=(sx, 0.58, -1.02), rotation=(1.57, 0, 0), color=${pal.base})`,
              `    bpy.ops.mesh.primitive_octahedron_add(radius=0.18, location=(sx, 0.58, -1.35), color=${pal.glow})`
            );
          } else {
            bodyLines.push(
              '# Ejes delantero y trasero con neumáticos y llantas',
              `bpy.ops.mesh.primitive_wheel_pair_add(radius=0.36, width=0.24, span=0.68, y_pos=0.36, z_pos=0.66, color=(0.14, 0.16, 0.20), rim_color=${pal.glow})`,
              `bpy.ops.mesh.primitive_wheel_pair_add(radius=0.38, width=0.26, span=0.70, y_pos=0.38, z_pos=-0.66, color=(0.14, 0.16, 0.20), rim_color=${pal.glow})`,
              '# Alerón trasero y faros frontales',
              `bpy.ops.mesh.primitive_blade_add(length=1.15, width=0.24, thickness=0.06, curve=0.10, location=(0, 0.96, -0.88), rotation=(0, 0, 1.57), color=${pal.accent})`,
              'for sx in [-0.38, 0.38]:',
              `    bpy.ops.mesh.primitive_octahedron_add(radius=0.13, location=(sx, 0.58, 1.02), color=${pal.glow})`
            );
          }
        } else if (isNature) {
          bodyLines.push(
            '# Isla / terreno rocoso base y raíces',
            `bpy.ops.mesh.primitive_dodecahedron_add(radius=1.05, detail=1, location=(0, 0.28, 0), scale=(1.25, 0.35, 1.18), color=${pal.base})`,
            'for i in range(4):',
            '    ang = i * (math.pi * 2 / 4) + 0.4',
            `    bpy.ops.mesh.primitive_dodecahedron_add(radius=0.32, location=(math.cos(ang)*0.78, 0.42, math.sin(ang)*0.78), color=(0.45, 0.50, 0.58))`,
            '',
            '# Tronco orgánico y ramas principales',
            `bpy.ops.mesh.primitive_capsule_add(radius=0.25, length=1.15, location=(0, 0.95, 0), rotation=(0.06, 0, -0.05), color=(0.46, 0.28, 0.14))`,
            `bpy.ops.mesh.primitive_horn_add(base_radius=0.18, tip_radius=0.05, length=0.85, bend=0.45, location=(0.12, 1.35, 0), rotation=(0, 0, -0.55), color=(0.46, 0.28, 0.14))`,
            `bpy.ops.mesh.primitive_horn_add(base_radius=0.16, tip_radius=0.05, length=0.78, bend=0.42, location=(-0.12, 1.28, 0.08), rotation=(0.2, 0, 0.62), color=(0.46, 0.28, 0.14))`,
            '',
            '# Copa de follaje frondoso en capas y cristales/setas del bosque',
            `bpy.ops.mesh.primitive_tree_foliage_add(radius=0.96, layers=3, location=(0, 1.68, 0), color=${pal.primary}, accent_color=${pal.accent})`,
            'for i in range(5):',
            '    ang = i * (math.pi * 2 / 5)',
            `    bpy.ops.mesh.primitive_octahedron_add(radius=0.14, location=(math.cos(ang)*0.65, 0.52, math.sin(ang)*0.65), scale=(0.6, 1.5, 0.6), color=${pal.glow})`
          );
        } else if (isBuilding) {
          bodyLines.push(
            '# Cimientos escalonados y estructura arquitectónica',
            `bpy.ops.mesh.primitive_cylinder_add(radius=1.35, depth=0.22, vertices=8, location=(0, 0.11, 0), color=${pal.base})`,
            `bpy.ops.mesh.primitive_cylinder_add(radius=0.92, depth=1.55, vertices=8, location=(0, 0.95, -0.10), color=${pal.base})`,
            '',
            '# Arco de entrada principal y tejado cónico',
            `bpy.ops.mesh.primitive_arch_add(width=1.08, height=1.35, thickness=0.24, location=(0, 0.18, 0.52), color=${pal.accent}, accent_color=${pal.primary})`,
            `bpy.ops.mesh.primitive_cone_add(radius1=1.18, radius2=0.04, depth=0.95, vertices=8, location=(0, 2.22, -0.10), color=${pal.primary})`,
            '',
            '# Almenas y cristales/faroles de iluminación',
            'for i in range(8):',
            '    ang = i * (math.pi * 2 / 8)',
            `    bpy.ops.mesh.primitive_cube_add(size=0.22, location=(math.cos(ang)*0.88, 1.75, -0.10 + math.sin(ang)*0.88), color=${pal.accent})`,
            `bpy.ops.mesh.primitive_octahedron_add(radius=0.24, location=(0, 0.85, 0.52), scale=(0.75, 1.45, 0.55), color=${pal.glow})`
          );
        } else if (isPropOrFurniture) {
          const isPotionOrBottle = /poci[oó]n|frasco|botella|elixir|c[aá]liz|copa/i.test(pLower);
          const isBarrel = /barril|tonel|cubo|bid[oó]n/i.test(pLower);
          const isTableOrChair = /mesa|silla|trono|banco|altar|cama/i.test(pLower);

          if (isPotionOrBottle) {
            bodyLines.push(
              '# Base, cuerpo esférico de cristal y líquido mágico interior',
              `bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=0.14, location=(0, 0.08, 0), color=${pal.accent})`,
              `bpy.ops.mesh.primitive_uv_sphere_add(radius=0.68, location=(0, 0.72, 0), color=${pal.primary})`,
              `bpy.ops.mesh.primitive_ico_sphere_add(radius=0.52, subdivisions=2, location=(0, 0.65, 0), color=${pal.glow})`,
              '# Cuello del frasco, anillo dorado y tapón de cristal/corcho',
              `bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.48, location=(0, 1.42, 0), color=${pal.base})`,
              `bpy.ops.mesh.primitive_torus_add(major_radius=0.26, minor_radius=0.06, location=(0, 1.55, 0), rotation=(1.57, 0, 0), color=${pal.accent})`,
              `bpy.ops.mesh.primitive_octahedron_add(radius=0.24, location=(0, 1.82, 0), scale=(0.8, 1.3, 0.8), color=${pal.glow})`
            );
          } else if (isBarrel) {
            bodyLines.push(
              '# Cuerpo abombado del barril de madera y tapas',
              `bpy.ops.mesh.primitive_cylinder_add(radius=0.62, depth=1.35, vertices=16, location=(0, 0.72, 0), color=(0.52, 0.31, 0.15))`,
              `bpy.ops.mesh.primitive_uv_sphere_add(radius=0.68, location=(0, 0.72, 0), scale=(1.0, 0.85, 1.0), color=(0.56, 0.34, 0.16))`,
              '# Aros metálicos de refuerzo y remaches',
              'for y_ring in [0.28, 0.72, 1.16]:',
              `    bpy.ops.mesh.primitive_torus_add(major_radius=0.66, minor_radius=0.05, location=(0, y_ring, 0), rotation=(1.57, 0, 0), color=${pal.accent})`,
              `bpy.ops.mesh.primitive_octahedron_add(radius=0.14, location=(0, 0.72, 0.68), color=${pal.glow})`
            );
          } else if (isTableOrChair) {
            bodyLines.push(
              '# Patas simétricas y tablero/estructura de mobiliario',
              'for sx in [-0.62, 0.62]:',
              '    for sz in [-0.42, 0.42]:',
              `        bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=0.82, location=(sx, 0.42, sz), color=(0.48, 0.28, 0.14))`,
              `bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0.86, 0), scale=(1.55, 0.14, 1.12), color=(0.56, 0.34, 0.16))`,
              `bpy.ops.mesh.primitive_armor_plate_add(width=1.15, height=0.95, thickness=0.14, curvature=0.22, location=(0, 1.38, -0.48), color=${pal.primary})`,
              '# Objetos sobre el mueble (cáliz / cristal luminoso)',
              `bpy.ops.mesh.primitive_octahedron_add(radius=0.20, location=(0, 1.14, 0.12), color=${pal.glow})`
            );
          } else {
            bodyLines.push(
              '# Base de piedra, Cofre del Tesoro con herrajes y gemas de botín',
              `bpy.ops.mesh.primitive_cylinder_add(radius=1.08, depth=0.16, vertices=8, location=(0, 0.08, 0), color=${pal.base})`,
              `bpy.ops.mesh.primitive_prop_chest_add(width=1.18, height=0.84, depth=0.78, location=(0, 0.46, 0), color=(0.52, 0.29, 0.14), accent_color=${pal.accent})`,
              'for i in range(5):',
              '    ang = i * (math.pi * 2 / 5)',
              `    bpy.ops.mesh.primitive_octahedron_add(radius=0.14, location=(math.cos(ang)*0.76, 0.26, math.sin(ang)*0.76), color=${pal.glow})`
            );
          }
        } else if (isSpider) {
          bodyLines.push(
            '# Cefalotórax y abdomen acorazado',
            'bpy.ops.mesh.primitive_capsule_add(radius=0.38, length=0.55, location=(0, 0.55, 0.15), rotation=(1.35, 0, 0))',
            `bpy.ops.material.set_color(color=${pal.base})`,
            'bpy.ops.mesh.primitive_dodecahedron_add(radius=0.52, location=(0, 0.72, -0.55))',
            'bpy.ops.transform.resize(value=(1.0, 0.82, 1.28))',
            `bpy.ops.material.set_color(color=${pal.primary})`,
            '',
            '# 4 pares de patas articuladas biomecánicas',
            'for i in range(4):',
            '    z_off = 0.35 - i * 0.24',
            '    bpy.ops.mesh.primitive_limb_pair_add(span=0.36, upper_len=0.58, lower_len=0.66, radius=0.075, bend=0.72, y_top=0.55, z_offset=z_off)',
            `    bpy.ops.material.set_color(color=${pal.base})`,
            '',
            '# Ojos múltiples bioluminiscentes y colmillos',
            'for side in [-1, 1]:',
            '    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.07, location=(side * 0.14, 0.64, 0.48))',
            `    bpy.ops.material.set_color(color=${pal.glow})`,
            'bpy.ops.mesh.primitive_horn_add(radius=0.08, height=0.45, curve=0.55, location=(0.14, 0.50, 0.55), rotation=(0.8, 0, 0), mirror_x=True)',
            `bpy.ops.material.set_color(color=${pal.accent})`
          );
        } else if (isDragon) {
          bodyLines.push(
            '# Torso dracónico y cuello segmentado',
            'bpy.ops.mesh.primitive_capsule_add(radius=0.42, length=0.95, location=(0, 0.95, 0), rotation=(0.45, 0, 0))',
            `bpy.ops.material.set_color(color=${pal.primary})`,
            'bpy.ops.mesh.primitive_armor_plate_add(width=0.65, height=0.85, thickness=0.14, arch=0.35, location=(0, 0.92, 0.28), rotation=(0.45, 0, 0))',
            `bpy.ops.material.set_color(color=${pal.accent})`,
            '',
            '# Cabeza, cuernos curvados y alas desplegadas',
            'bpy.ops.mesh.primitive_dodecahedron_add(radius=0.28, location=(0, 1.68, 0.36))',
            `bpy.ops.material.set_color(color=${pal.primary})`,
            'bpy.ops.mesh.primitive_horn_add(radius=0.08, height=0.68, curve=0.72, location=(0.16, 1.82, 0.32), rotation=(-0.4, 0, -0.35), mirror_x=True)',
            `bpy.ops.material.set_color(color=${pal.accent})`,
            'bpy.ops.mesh.primitive_wing_pair_add(span=1.95, height=1.25, feathers=6, y_pos=1.22, z_pos=-0.12)',
            `bpy.ops.material.set_color(color=${pal.glow})`,
            '',
            '# Extremidades inferiores y garras',
            'bpy.ops.mesh.primitive_limb_pair_add(span=0.38, upper_len=0.56, lower_len=0.58, radius=0.11, bend=0.52, y_top=0.62, z_offset=0.05)',
            `bpy.ops.material.set_color(color=${pal.base})`
          );
        } else if (isWeapon) {
          bodyLines.push(
            '# Empuñadura, pomo octaedro y guarda ornamentada',
            'bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.85, location=(0, 0.55, 0))',
            `bpy.ops.material.set_color(color=${pal.base})`,
            'bpy.ops.mesh.primitive_octahedron_add(radius=0.18, location=(0, 0.12, 0))',
            `bpy.ops.material.set_color(color=${pal.accent})`,
            'bpy.ops.mesh.primitive_armor_plate_add(width=0.95, height=0.24, thickness=0.18, arch=0.35, location=(0, 1.02, 0))',
            `bpy.ops.material.set_color(color=${pal.accent})`,
            'bpy.ops.mesh.primitive_horn_add(radius=0.09, height=0.55, curve=0.6, location=(0.35, 1.05, 0), rotation=(0, 0, -1.1), mirror_x=True)',
            `bpy.ops.material.set_color(color=${pal.primary})`,
            '',
            '# Hoja principal biselada y núcleo de energía',
            'bpy.ops.mesh.primitive_blade_add(length=1.85, width=0.28, thickness=0.06, location=(0, 1.95, 0))',
            `bpy.ops.material.set_color(color=${pal.glow})`,
            'bpy.ops.mesh.primitive_octahedron_add(radius=0.16, location=(0, 1.02, 0.12))',
            `bpy.ops.material.set_color(color=${pal.glow})`
          );
        } else if (isRelic) {
          bodyLines.push(
            '# Núcleo sagrado dodecaédrico y anillos giroscópicos',
            'bpy.ops.mesh.primitive_dodecahedron_add(radius=0.48, location=(0, 1.05, 0))',
            `bpy.ops.material.set_color(color=${pal.glow})`,
            'bpy.ops.mesh.primitive_torus_add(major_radius=0.88, minor_radius=0.05, location=(0, 1.05, 0), rotation=(0.6, 0.4, 0))',
            `bpy.ops.material.set_color(color=${pal.accent})`,
            'bpy.ops.mesh.primitive_torus_add(major_radius=1.08, minor_radius=0.04, location=(0, 1.05, 0), rotation=(-0.5, 0.8, 0.3))',
            `bpy.ops.material.set_color(color=${pal.primary})`,
            '',
            '# Corona radial de cristales octaédricos',
            'for i in range(8):',
            '    ang = i * (math.pi * 2 / 8)',
            '    bpy.ops.mesh.primitive_octahedron_add(radius=0.18, location=(math.cos(ang)*1.25, 1.05 + math.sin(ang*2)*0.18, math.sin(ang)*1.25))',
            '    bpy.ops.transform.resize(value=(0.65, 1.85, 0.65))',
            `    bpy.ops.material.set_color(color=${pal.glow})`
          );
        } else {
          // Personaje / NPC / Robot / Héroe
          bodyLines.push(
            '# Torso estilizado, núcleo central y pelvis articulada',
            'bpy.ops.mesh.primitive_capsule_add(radius=0.36, length=0.68, location=(0, 1.18, 0))',
            `bpy.ops.material.set_color(color=${pal.base})`,
            'bpy.ops.mesh.primitive_armor_plate_add(width=0.76, height=0.62, thickness=0.16, arch=0.32, location=(0, 1.26, 0.24))',
            `bpy.ops.material.set_color(color=${pal.primary})`,
            'bpy.ops.mesh.primitive_octahedron_add(radius=0.16, location=(0, 1.30, 0.36))',
            `bpy.ops.material.set_color(color=${pal.glow})`,
            '',
            '# Cabeza, visor y detalles simétricos',
            'bpy.ops.mesh.primitive_dodecahedron_add(radius=0.26, location=(0, 1.88, 0.04))',
            `bpy.ops.material.set_color(color=${pal.primary})`,
            'bpy.ops.mesh.primitive_armor_plate_add(width=0.38, height=0.12, thickness=0.10, arch=0.45, location=(0, 1.88, 0.24))',
            `bpy.ops.material.set_color(color=${pal.glow})`,
            'bpy.ops.mesh.primitive_horn_add(radius=0.065, height=0.52, curve=0.58, location=(0.18, 2.00, 0.02), rotation=(-0.25, 0, -0.35), mirror_x=True)',
            `bpy.ops.material.set_color(color=${pal.accent})`,
            '',
            '# Piernas y brazos articulados',
            'bpy.ops.mesh.primitive_limb_pair_add(span=0.32, upper_len=0.54, lower_len=0.56, radius=0.115, bend=0.28, y_top=0.88, z_offset=0.0)',
            `bpy.ops.material.set_color(color=${pal.base})`,
            'bpy.ops.mesh.primitive_limb_pair_add(span=0.58, upper_len=0.46, lower_len=0.48, radius=0.095, bend=0.45, y_top=1.46, z_offset=0.04)',
            `bpy.ops.material.set_color(color=${pal.primary})`,
            'bpy.ops.mesh.primitive_armor_plate_add(width=0.34, height=0.32, thickness=0.14, arch=0.42, location=(0.56, 1.56, 0.04), rotation=(0, 0, -0.45), mirror_x=True)',
            `bpy.ops.material.set_color(color=${pal.accent})`
          );
        }

        if (helpers?.autoSmooth) {
          bodyLines.push('bpy.ops.mesh.smooth(iterations=2, factor=0.35)');
        }
        if (helpers?.autoTexture && helpers.autoTexture !== 'none') {
          bodyLines.push(`bpy.ops.material.set_texture(name='${helpers.autoTexture}')`);
        }

        bodyLines.push(
          'bpy.ops.mesh.auto_ground()',
          `print("Asset 3D de juego completado: ${prompt.trim().slice(0, 48).replace(/"/g, "'")}")`
        );

        return {
          title: `Asset Procedural: ${prompt.trim().slice(0, 36)}`,
          summary:
            'Elemento de juego 3D ensamblado por el Motor Procedural Universal con primitivas especializadas, simetría axial y apoyo automático.',
          thoughtEvolution: [
            `1. Analizando el tipo de asset solicitado ("${prompt.trim().slice(0, 60)}") para elegir la arquitectura 3D adecuada (prop, vehículo, edificio, naturaleza, arma o personaje).`,
            '2. Activando el Motor Procedural Autónomo para construir el objeto sin interrupción.',
            '3. Ensamblando volúmenes primarios, sub-piezas funcionales y ornamentos con operadores de Blender 5.2.',
            '4. Aplicando paleta Cel-Shading estilizada y auto_ground() sobre el pedestal.',
          ],
          pythonCode: [...headerLines, '', ...bodyLines].join('\n'),
        };
      };

      // Cadena de modelos de respaldo (cada modelo tiene su propio cupo en Free Tier)
      const candidateModels = Array.from(
        new Set([
          requestedModel,
          'gemini-3.8-flash',
          'gemini-3.1-flash-lite',
          'gemini-flash-latest',
        ])
      );

      let finalModelUsed = requestedModel;
      let fallbackNotice: string | undefined;
      let response = null;
      let lastErrMsg = '';

      for (const candidate of candidateModels) {
        try {
          response = await callGeminiModel(candidate);
          finalModelUsed = candidate;
          if (candidate !== requestedModel) {
            const isQuotaOrBilling = /429|RESOURCE_EXHAUSTED|quota|billing|403|PERMISSION_DENIED/i.test(lastErrMsg);
            fallbackNotice = isQuotaOrBilling
              ? `Se alcanzó el límite gratuito diario (20 req/día) de ${requestedModel}. Se completó automáticamente con ${candidate} (puedes ampliar tu cuota en Settings > Secrets).`
              : `El modelo ${requestedModel} estaba saturado; se completó automáticamente usando ${candidate}.`;
          }
          break;
        } catch (err: unknown) {
          lastErrMsg = err instanceof Error ? err.message : String(err);
        }
      }

      // Si todos los modelos en la nube agotaron su cuota gratuita (429), usamos el sintetizador procedural local
      if (!response) {
        const localResult = buildLocalProceduralFallback();
        res.json({
          title: localResult.title,
          summary: localResult.summary,
          thoughtEvolution: localResult.thoughtEvolution,
          pythonCode: localResult.pythonCode,
          modelUsed: 'motor-procedural-local',
          requestedModel,
          fallbackNotice:
            'Alcanzaste el límite de 20 generaciones/día del plan gratuito (Free Tier) en Gemini API. Se activó el Motor Procedural Autónomo Local para construir tu modelo 3D al instante. Si deseas cuota ilimitada en la nube, puedes actualizar tu clave en Settings > Secrets.',
          thinkingLevelUsed: effectiveThinkingKey,
          usage: {
            promptTokens: 0,
            OutputTokens: 0,
            thoughtsTokens: 0,
            totalTokens: 0,
          },
        });
        return;
      }

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        title?: string;
        summary?: string;
        thoughtEvolution?: string[];
        pythonCode?: string;
      };

      if (!parsed.pythonCode) {
        const localResult = buildLocalProceduralFallback();
        res.json({
          ...localResult,
          modelUsed: finalModelUsed,
          requestedModel,
          fallbackNotice: 'Se aplicó síntesis procedural de respaldo para garantizar geometría válida.',
          thinkingLevelUsed: effectiveThinkingKey,
          usage: { promptTokens: 0, OutputTokens: 0, thoughtsTokens: 0, totalTokens: 0 },
        });
        return;
      }

      const usage = response.usageMetadata;

      const coordHeader = effectiveIsZUp ? '# COORD_MODE: Z_UP' : '# COORD_MODE: Y_UP';
      const normalizedPythonCode = parsed.pythonCode.includes('# COORD_MODE:')
        ? parsed.pythonCode
        : `${coordHeader}\n${parsed.pythonCode}`;

      res.json({
        title: parsed.title || 'Modelo Generado con Gemini',
        summary: parsed.summary || 'Geometría 3D generada proceduralmente mediante bpy.',
        thoughtEvolution:
          parsed.thoughtEvolution && parsed.thoughtEvolution.length > 0
            ? parsed.thoughtEvolution
            : [
                'Analizando proporciones espaciales y silueta principal del modelo 3D.',
                `Calculando coordenadas exactas en sistema ${effectiveIsZUp ? 'Blender 5.2 Z-Up (Z=Altura)' : 'Estudio WebGL Y-Up (Y=Altura)'} sobre el pedestal.`,
                'Construyendo primitivas bpy y bucles trigonométricos para articulaciones y detalles.',
                'Aplicando paleta de colores contrastada para sombreado Cel-Shading de 3 tonos.',
              ],
        pythonCode: normalizedPythonCode,
        modelUsed: finalModelUsed,
        requestedModel,
        fallbackNotice,
        thinkingLevelUsed: effectiveThinkingKey,
        usage: {
          promptTokens: usage?.promptTokenCount || 0,
          OutputTokens: usage?.candidatesTokenCount || 0,
          thoughtsTokens: usage?.thoughtsTokenCount || 0,
          totalTokens: usage?.totalTokenCount || 0,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        error: `Error al generar script con Gemini: ${message}`,
      });
    }
  });

  // ============================================================================
  // API OFICIAL DE POLY HAVEN (CC0 PUBLIC DOMAIN) — BÚSQUEDA, MAPAS PBR Y PROXY
  // ============================================================================
  const POLYHAVEN_USER_AGENT = 'CelShadeStudio3D/1.0 (https://polyhaven.com)';
  const POLYHAVEN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

  interface PolyHavenRawAsset {
    name?: string;
    categories?: string[];
    tags?: string[];
    description?: string;
    download_count?: number;
    thumbnail_url?: string;
    authors?: Record<string, string>;
  }

  let polyHavenCatalogCache: {
    fetchedAt: number;
    items: Array<{
      id: string;
      name: string;
      categories: string[];
      tags: string[];
      description: string;
      downloadCount: number;
      thumbnailUrl: string;
      authors: string[];
    }>;
  } | null = null;

  const polyHavenFilesCache = new Map<
    string,
    {
      fetchedAt: number;
      data: Record<string, any>;
    }
  >();

  // Diccionario de búsqueda bilingüe Español -> Inglés para facilitar búsquedas en Poly Haven
  const ES_TO_EN_TEXTURE_TERMS: Record<string, string[]> = {
    ladrillo: ['brick', 'bricks'],
    ladrillos: ['brick', 'bricks'],
    madera: ['wood', 'planks', 'bark', 'timber'],
    tablas: ['planks', 'wood'],
    piedra: ['stone', 'rock', 'cobblestone', 'cobble'],
    roca: ['rock', 'cliff', 'stone'],
    marmol: ['marble'],
    mármol: ['marble'],
    teja: ['roof', 'tiles', 'terracotta'],
    tejado: ['roof', 'roofing', 'tiles', 'slate'],
    pizarra: ['slate', 'roof'],
    arena: ['sand', 'beach', 'desert'],
    agua: ['water', 'ice', 'puddle'],
    hierba: ['grass', 'meadow', 'moss'],
    cesped: ['grass', 'lawn'],
    césped: ['grass', 'lawn'],
    musgo: ['moss', 'forest'],
    tierra: ['dirt', 'mud', 'soil', 'ground'],
    barro: ['mud', 'dirt'],
    nieve: ['snow', 'ice'],
    hielo: ['ice', 'snow'],
    metal: ['metal', 'iron', 'steel', 'rust', 'copper', 'gold'],
    oxido: ['rust', 'rusted'],
    óxido: ['rust', 'rusted'],
    hierro: ['iron', 'metal'],
    acero: ['steel', 'metal'],
    cobre: ['copper', 'metal'],
    oro: ['gold', 'metal'],
    yeso: ['plaster', 'stucco'],
    cal: ['plaster', 'stucco', 'white'],
    hormigon: ['concrete', 'cement'],
    hormigón: ['concrete', 'cement'],
    cemento: ['concrete', 'cement'],
    asfalto: ['asphalt', 'road'],
    adoquin: ['cobblestone', 'cobble', 'paving'],
    adoquín: ['cobblestone', 'cobble', 'paving'],
    azulejo: ['tile', 'tiles', 'ceramic'],
    baldosa: ['tile', 'tiles', 'floor'],
    suelo: ['floor', 'ground', 'paving', 'cobblestone'],
    pared: ['wall', 'brick', 'plaster'],
    muro: ['wall', 'stone', 'brick'],
    tela: ['fabric', 'cloth', 'linen', 'denim'],
    cuero: ['leather'],
    corteza: ['bark', 'tree'],
    hojas: ['leaves', 'forest'],
    mosaico: ['mosaic', 'tile', 'tiles'],
  };

  async function getPolyHavenCatalog() {
    if (
      polyHavenCatalogCache &&
      Date.now() - polyHavenCatalogCache.fetchedAt < POLYHAVEN_CACHE_TTL_MS
    ) {
      return polyHavenCatalogCache.items;
    }
    const resp = await fetch('https://api.polyhaven.com/assets?t=textures', {
      headers: { 'User-Agent': POLYHAVEN_USER_AGENT },
    });
    if (!resp.ok) {
      throw new Error(`Poly Haven API respondió con estado ${resp.status}`);
    }
    const raw = (await resp.json()) as Record<string, PolyHavenRawAsset>;
    const items = Object.entries(raw)
      .map(([id, info]) => ({
        id,
        name: info.name || id.replace(/_/g, ' '),
        categories: Array.isArray(info.categories) ? info.categories : [],
        tags: Array.isArray(info.tags) ? info.tags : [],
        description: info.description || '',
        downloadCount: Number(info.download_count) || 0,
        thumbnailUrl:
          info.thumbnail_url ||
          `https://cdn.polyhaven.com/asset_img/thumbs/${encodeURIComponent(id)}.png?width=256&height=256`,
        authors: info.authors ? Object.keys(info.authors) : ['Poly Haven'],
      }))
      .sort((a, b) => b.downloadCount - a.downloadCount);

    polyHavenCatalogCache = { fetchedAt: Date.now(), items };
    return items;
  }

  // ============================================================================
  // ENDPOINT DE DOCUMENTACIÓN UNIFICADA DE LA API DE TEXTURAS Y POLY HAVEN
  // ============================================================================
  app.get('/api/textures/docs', (_req, res) => {
    return res.json({
      name: 'CelShade Studio 3D — Texture & Poly Haven PBR API',
      version: '2.0',
      restEndpoints: {
        docs: {
          method: 'GET',
          path: '/api/textures/docs',
          description:
            'Devuelve la documentación completa de endpoints REST y operadores Python (bpy) de texturas, Mosaicos, Atlas 5x2 y Poly Haven CC0.',
        },
        polyhavenSearch: {
          method: 'GET',
          path: '/api/polyhaven/textures',
          queryParams: {
            q: 'Texto libre en español o inglés (ej. ladrillo, madera, marmol, brick, wood)',
            category:
              'all | brick | wood | stone | metal | plaster | roofing | floor | fabric | terrain',
            limit: 'Número máximo de resultados (1..80, por defecto 36)',
          },
          example: '/api/polyhaven/textures?q=ladrillo&limit=12',
        },
        polyhavenFiles: {
          method: 'GET',
          path: '/api/polyhaven/files/:assetId',
          queryParams: { res: '1k | 2k (por defecto 1k)' },
          returns:
            'URLs same-origin para los mapas PBR Diffuse (sRGB), Normal GL, Roughness, Metalness y AO',
          example: '/api/polyhaven/files/brick_wall_001?res=1k',
        },
        polyhavenImageProxy: {
          method: 'GET',
          path: '/api/polyhaven/image?url=<encoded_polyhaven_url>',
          description:
            'Proxy seguro same-origin (allowlist dl.polyhaven.org y cdn.polyhaven.com) para evitar bloqueos CORS en WebGL y exportación .glb.',
        },
      },
      pythonBpyApi: {
        polyhavenOperator: {
          signature:
            'bpy.ops.material.set_polyhaven_texture(object=None, objects=None, zone=None, asset="brick_wall_001", resolution="1k", projection="BOX", repeat=2)',
          description:
            'Descarga y aplica mapas PBR CC0 completos (Diffuse + Normal + Roughness + Metalness) desde Poly Haven sobre una pieza, lista de piezas o zona.',
        },
        paintZoneOperator: {
          signature:
            'bpy.ops.material.paint_zone(zone="ALL", objects=None, texture="...", tile=None, projection="BOX", repeat=2)',
          description:
            'Pinta una zona o conjunto de piezas con Mosaicos, sub-tiles de Atlas 5x2, 38 texturas PBR procedurales o texturas Poly Haven usando prefijo "polyhaven:<asset_id>@1k|2k".',
        },
        setMosaicOperator: {
          signature:
            'bpy.ops.material.set_mosaic_texture(object=obj, texture="catalogo_progresion_agua_arena", tile="T-04", projection="FLAT", repeat=2)',
          description:
            'Aplica mosaicos completos o recorta automáticamente sub-texturas 512x512 de los 7 Catálogos Atlas 5x2.',
        },
        materialProperties: [
          'mat.color_map = "polyhaven:brick_wall_001"',
          'mat.color_map = "polyhaven:wood_planks_dirt@2k"',
          'mat.color_map = "agua_profundidad_t04"',
          'mat.color_map = "mosaico_romano_imperial"',
          'img = bpy.data.images.load("polyhaven:medieval_blocks_05@1k")',
        ],
        introspection: [
          'bpy.ops.material.list_mosaics()',
          'bpy.ops.material.list_polyhaven_api()',
        ],
      },
      builtinCatalogs: {
        mosaics: [
          'mosaico_romano_imperial',
          'mosaico_gotico_carmesi',
          'mosaico_muro_nazari',
        ],
        atlases5x2: [
          {
            id: 'catalogo_progresion_agua_arena',
            tiles: 'agua_profundidad_t01 .. agua_profundidad_t10 (T-01..T-10, 0.5m a 30m+)',
          },
          { id: 'catalogo_suelos_mazmorra', tiles: 'suelo_mazmorra_t01 .. suelo_mazmorra_t10' },
          { id: 'catalogo_paredes_mazmorra', tiles: 'pared_mazmorra_t01 .. pared_mazmorra_t10' },
          {
            id: 'catalogo_columnas_mazmorra',
            tiles: 'columna_mazmorra_t01 .. columna_mazmorra_t10',
          },
          { id: 'catalogo_tejados', tiles: 'tejado_t01 .. tejado_t10' },
          { id: 'catalogo_hierbas', tiles: 'hierba_t01 .. hierba_t10' },
          { id: 'catalogo_agua_cristalina', tiles: 'agua_t21 .. agua_t30' },
        ],
        localPbrCC0: ['cal_blanca', 'teja_arcilla'],
        polyhavenLiveCatalog:
          '871+ texturas CC0 Public Domain vía prefijo polyhaven:<asset_id>[@1k|2k]',
      },
    });
  });

  app.get('/api/polyhaven/textures', async (req, res) => {
    try {
      const qRaw = String(req.query.q || '').trim().toLowerCase();
      const category = String(req.query.category || 'all').trim().toLowerCase();
      const limit = Math.max(1, Math.min(80, Number(req.query.limit) || 36));
      const allItems = await getPolyHavenCatalog();

      // Expandir términos en español a sinónimos en inglés
      const searchTerms: string[] = [];
      if (qRaw) {
        for (const token of qRaw.split(/\s+/).filter(Boolean)) {
          searchTerms.push(token);
          const mapped = ES_TO_EN_TEXTURE_TERMS[token];
          if (mapped) searchTerms.push(...mapped);
        }
      }

      const filtered = allItems.filter((item) => {
        if (category && category !== 'all') {
          const catMatch =
            item.categories.some((c) => c.toLowerCase().includes(category)) ||
            item.tags.some((t) => t.toLowerCase().includes(category)) ||
            item.id.toLowerCase().includes(category);
          if (!catMatch) return false;
        }
        if (searchTerms.length > 0) {
          const haystack = `${item.id} ${item.name} ${item.categories.join(' ')} ${item.tags.join(' ')} ${item.description}`.toLowerCase();
          // Coincide si el texto completo o cualquiera de los términos traducidos aparece
          return haystack.includes(qRaw) || searchTerms.some((t) => haystack.includes(t));
        }
        return true;
      });

      res.json({
        total: filtered.length,
        totalCatalog: allItems.length,
        items: filtered.slice(0, limit).map((item) => ({
          ...item,
          proxyThumbnailUrl: `/api/polyhaven/image?url=${encodeURIComponent(item.thumbnailUrl)}`,
        })),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(502).json({ error: `No se pudo consultar Poly Haven: ${msg}` });
    }
  });

  app.get('/api/polyhaven/files/:assetId', async (req, res) => {
    try {
      const assetId = String(req.params.assetId || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(assetId)) {
        res.status(400).json({ error: 'ID de textura Poly Haven inválido.' });
        return;
      }
      const requestedRes = String(req.query.res || '1k').toLowerCase() === '2k' ? '2k' : '1k';
      const fallbackRes = requestedRes === '2k' ? '1k' : '2k';

      let filesJson: Record<string, any> | null = null;
      const cached = polyHavenFilesCache.get(assetId);
      if (cached && Date.now() - cached.fetchedAt < POLYHAVEN_CACHE_TTL_MS) {
        filesJson = cached.data;
      } else {
        const resp = await fetch(
          `https://api.polyhaven.com/files/${encodeURIComponent(assetId)}`,
          { headers: { 'User-Agent': POLYHAVEN_USER_AGENT } }
        );
        if (!resp.ok) {
          res.status(resp.status === 404 ? 404 : 502).json({
            error: `Textura Poly Haven "${assetId}" no encontrada (${resp.status}).`,
          });
          return;
        }
        filesJson = (await resp.json()) as Record<string, any>;
        polyHavenFilesCache.set(assetId, { fetchedAt: Date.now(), data: filesJson });
      }

      const pickMapUrl = (candidateKeys: string[]): string | null => {
        if (!filesJson) return null;
        for (const key of candidateKeys) {
          const entry = filesJson[key];
          if (!entry || typeof entry !== 'object') continue;
          const resObj = entry[requestedRes] || entry[fallbackRes] || entry['1k'] || entry['2k'];
          if (!resObj || typeof resObj !== 'object') continue;
          const url = resObj.jpg?.url || resObj.png?.url;
          if (typeof url === 'string' && url.startsWith('https://')) {
            return `/api/polyhaven/image?url=${encodeURIComponent(url)}`;
          }
        }
        return null;
      };

      const diffuse = pickMapUrl(['Diffuse', 'col', 'alb', 'diff', 'Albedo']);
      const normal = pickMapUrl(['nor_gl', 'Normal', 'nor_dx']);
      const roughness = pickMapUrl(['Rough', 'rough', 'Roughness']);
      const metalness = pickMapUrl(['Metal', 'metal', 'Metalness']);
      const ao = pickMapUrl(['AO', 'ao']);

      if (!diffuse) {
        res.status(404).json({
          error: `El asset "${assetId}" de Poly Haven no contiene un mapa Diffuse JPG/PNG en ${requestedRes}.`,
        });
        return;
      }

      res.json({
        id: assetId,
        resolution: requestedRes,
        license: 'CC0 Public Domain (Poly Haven)',
        maps: {
          diffuse,
          normal,
          roughness,
          metalness,
          ao,
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(502).json({ error: `Error obteniendo mapas de Poly Haven: ${msg}` });
    }
  });

  app.get('/api/polyhaven/image', async (req, res) => {
    try {
      const rawUrl = String(req.query.url || '').trim();
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        res.status(400).send('URL inválida');
        return;
      }
      // Allowlist estricta de dominios oficiales de Poly Haven para prevenir SSRF
      const allowedHosts = new Set(['dl.polyhaven.org', 'cdn.polyhaven.com']);
      if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
        res.status(403).send('Dominio no permitido');
        return;
      }

      const upstream = await fetch(parsed.toString(), {
        headers: { 'User-Agent': POLYHAVEN_USER_AGENT },
      });
      if (!upstream.ok) {
        res.status(upstream.status).send('No se pudo descargar la imagen de Poly Haven');
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(502).send(`Error proxy Poly Haven: ${msg}`);
    }
  });

  // ============================================================================
  // DESCARGAS FIABLES VIA HTTP (Content-Disposition: attachment)
  // ----------------------------------------------------------------------------
  // En iframes (vista previa), móviles Android/iOS y tras operaciones async
  // largas, las descargas con blob: URL suelen fallar o quedar bloqueadas.
  // Estos endpoints almacenan temporalmente el archivo en RAM y lo entregan
  // con cabeceras HTTP reales de descarga segura (attachment + nosniff).
  // ============================================================================
  interface StagedDownloadEntry {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    createdAt: number;
    expiresAt: number;
  }

  const STAGED_DOWNLOAD_TTL_MS = 15 * 60 * 1000; // 15 minutos
  const STAGED_DOWNLOAD_MAX_FILE_BYTES = 80 * 1024 * 1024; // 80 MB por archivo
  const STAGED_DOWNLOAD_MAX_TOTAL_BYTES = 160 * 1024 * 1024; // 160 MB total en RAM
  const ALLOWED_DOWNLOAD_MIMES = new Set([
    'model/gltf-binary',
    'model/gltf+json',
    'application/zip',
    'application/octet-stream',
    'text/plain',
    'text/csv',
    'text/x-python',
    'application/json',
    'image/png',
    'image/jpeg',
  ]);

  const stagedDownloads = new Map<string, StagedDownloadEntry>();
  let stagedTotalBytes = 0;

  const sanitizeStagedFilename = (raw: string): string => {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    const base = path.basename(decoded.replace(/\\/g, '/'));
    const cleaned = base
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/^[._-]+/, '')
      .slice(0, 120);
    return cleaned || 'modelo_3d.glb';
  };

  const pruneStagedDownloads = (neededBytes = 0): void => {
    const now = Date.now();
    for (const [token, entry] of stagedDownloads.entries()) {
      if (entry.expiresAt <= now) {
        stagedTotalBytes = Math.max(0, stagedTotalBytes - entry.buffer.length);
        stagedDownloads.delete(token);
      }
    }
    while (
      stagedDownloads.size > 0 &&
      stagedTotalBytes + neededBytes > STAGED_DOWNLOAD_MAX_TOTAL_BYTES
    ) {
      const oldestKey = stagedDownloads.keys().next().value;
      if (!oldestKey) break;
      const oldest = stagedDownloads.get(oldestKey);
      if (oldest) {
        stagedTotalBytes = Math.max(0, stagedTotalBytes - oldest.buffer.length);
      }
      stagedDownloads.delete(oldestKey);
    }
  };

  const cleanupTimer = setInterval(() => pruneStagedDownloads(0), 60_000);
  cleanupTimer.unref?.();

  app.post(
    '/api/downloads/stage',
    express.raw({ type: () => true, limit: '80mb' }),
    (req, res) => {
      try {
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ error: 'El archivo recibido está vacío o no es binario.' });
          return;
        }
        if (body.length > STAGED_DOWNLOAD_MAX_FILE_BYTES) {
          res.status(413).json({ error: 'El archivo supera el límite temporal de 80 MB.' });
          return;
        }

        const rawFilename = String(req.headers['x-filename'] || 'modelo_3d.glb');
        const safeFilename = sanitizeStagedFilename(rawFilename);
        const rawMime = String(req.headers['x-mime-type'] || 'application/octet-stream')
          .split(';')[0]
          .trim()
          .toLowerCase();
        const safeMime = ALLOWED_DOWNLOAD_MIMES.has(rawMime)
          ? rawMime
          : 'application/octet-stream';

        pruneStagedDownloads(body.length);

        const token = crypto.randomBytes(24).toString('base64url');
        const now = Date.now();
        stagedDownloads.set(token, {
          buffer: body,
          filename: safeFilename,
          mimeType: safeMime,
          createdAt: now,
          expiresAt: now + STAGED_DOWNLOAD_TTL_MS,
        });
        stagedTotalBytes += body.length;

        res.json({
          token,
          filename: safeFilename,
          byteLength: body.length,
          downloadUrl: `/api/downloads/${token}/${encodeURIComponent(safeFilename)}`,
          expiresInSeconds: Math.floor(STAGED_DOWNLOAD_TTL_MS / 1000),
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: `No se pudo preparar la descarga: ${msg}` });
      }
    }
  );

  app.get('/api/downloads/:token/:filename', (req, res) => {
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) {
      res.status(400).send('Identificador de descarga inválido.');
      return;
    }

    const entry = stagedDownloads.get(token);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) {
        stagedTotalBytes = Math.max(0, stagedTotalBytes - entry.buffer.length);
        stagedDownloads.delete(token);
      }
      res.status(404).send('La descarga temporal ha expirado. Vuelve a exportar el archivo.');
      return;
    }

    const safeName = entry.filename;
    const asciiName = safeName.replace(/["\\]/g, '_');
    const encodedName = encodeURIComponent(safeName);

    res.setHeader('Content-Type', entry.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`
    );
    res.setHeader('Content-Length', String(entry.buffer.length));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.end(entry.buffer);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`CelShade Studio 3D + Gemini bpy Server running on http://${HOST}:${PORT}`);
  });

  server.on('error', (err) => {
    console.error('Server error encountered:', err);
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

startServer();
