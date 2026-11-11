import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  applyGlobalLaplacianSmoothing,
  decimateModelGeometry,
  segmentAllModelTriangles,
  TriangleSubdivideMode,
} from './meshDeformer';
import {
  generateProceduralTexture,
  generateProceduralBumpTexture,
  getTexturePresetInfo,
  resolveTexturePatternId,
  TexturePatternType,
} from './proceduralTextures';
import {
  prepareGeometryNormals,
  applyNormalSmoothingToModel,
  createComicOutlineMaterial,
  createThreeToneGradientTexture,
} from './geometrySmoothing';
import { getProceduralMatcapTexture, MatcapPresetId } from './matcapGenerator';
import ayuntamientoMoguerCode from '../../ayuntamiento/ayuntamiento_moguer.py?raw';
import {
  addBlenderLoop,
  setBlenderWater,
  startBlenderRun,
  finalizeBlenderRun,
  clearBlenderAnimations,
} from './blenderAnimation';
import {
  applyBoxProjectedUv,
  applyPhotoViewsUv,
  ensureColorMapLoaded,
  isColorMapLoaded,
  PhotoView,
  getColorMapSet,
  preloadColorMapImages,
  slugifyTextureId,
} from './textureLibrary';

// PURGA DEFENSIVA INMEDIATA: NUNCA extender Object.prototype (propiedades como 'get' o 'value'
// rompen la especificación ECMAScript de descriptores en Object.defineProperty para React y librerías).
if (typeof Object.prototype === 'object' && Object.prototype !== null) {
  if ('get' in Object.prototype) {
    try {
      delete (Object.prototype as any).get;
    } catch (_) {}
  }
  if ('setdefault' in Object.prototype) {
    try {
      delete (Object.prototype as any).setdefault;
    } catch (_) {}
  }
  if ('update' in Object.prototype) {
    try {
      delete (Object.prototype as any).update;
    } catch (_) {}
  }
}

export type BlenderCoordinateMode = 'auto' | 'blender_z_up' | 'studio_y_up';

export interface ScriptExecutionResult {
  success: boolean;
  logs: string[];
  executionTimeMs: number;
  verticesModified: number;
  objectsCreated?: number;
  coordinateModeUsed?: 'blender_z_up' | 'studio_y_up';
  error?: string;
  errorLine?: number;
  errorSourceCode?: string;
  errorReason?: string;
}

export interface BlenderScriptPreset {
  id: string;
  name: string;
  category: 'generate' | 'modify';
  description: string;
  code: string;
}

export const BLENDER_SCRIPT_PRESETS: BlenderScriptPreset[] = [
  // ============================================================================
  // PLANTILLA: AYUNTAMIENTO DE MOGUER (script fuente en /ayuntamiento, con cal y teja CC0)
  // ============================================================================
  {
    id: 'gen_ayuntamiento_moguer',
    name: 'Ayuntamiento de Moguer (Huelva) con cal y teja',
    category: 'generate',
    description: 'Casa consistorial de dos plantas con arcadas, torre del reloj, plaza empedrada y palmeras. Cal blanca y teja de arcilla con texturas CC0 (color, normal y rugosidad).',
    code: ayuntamientoMoguerCode,
  },
  // ============================================================================
  // CATEGORÍA 1: GENERACIÓN PROCEDURAL DE NUEVOS OBJETOS 3D DESDE CERO EN PYTHON
  // ============================================================================
  {
    id: 'gen_catedral_sevilla',
    name: 'Catedral de Sevilla & La Giralda (Monumental)',
    category: 'generate',
    description: 'Catedral de Santa María de la Sede de Sevilla completa: 5 naves escalonadas, doble batería de arbotantes y pináculos, Cimborrio, La Giralda con paños de sebka y Giraldillo, Patio de los Naranjos con fuente animada, Capilla Real e interior con Coro, Órganos y Retablo Mayor',
    code: `import bpy
import math

# ==============================================================================
# CATEDRAL DE SANTA MARÍA DE LA SEDE DE SEVILLA & LA GIRALDA (MONUMENTAL)
# ==============================================================================
# Incluye:
# - Planta de salón de 5 naves + 2 naves de capillas perimetrales
# - Crucero con Cimborrio octogonal y linterna
# - Doble hilera de Arbotantes góticos, contrafuertes, cresterías y pináculos
# - La Giralda (Caña almohade con paños de sebka, balcones, Cuerpo de Campanas
#   renacentista de Hernán Ruiz, terraza de azucenas y estatua del Giraldillo)
# - Patio de los Naranjos (Claustro norte, Puerta del Perdón con almenas
#   escalonadas, 24 naranjos con frutos, alcorques y fuente mudéjar animada)
# - Capilla Real renacentista en la cabecera oriental con gran cúpula y linterna
# - Fachada Occidental (Puerta de la Asunción, Bautismo y San Miguel + Rosetón)
# - Interior transitable: Pilares fasciculados, Coro con sillería y 2 Órganos
#   monumentales, Capilla Mayor con Retablo Mayor de oro y Reja renacentista
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# ==========================================
# 1. SISTEMA DE MATERIALES PBR
# ==========================================
def material(nombre, color, rugosidad=0.8, metalico=0.0, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metalico
        if emision > 0 and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emision
    return mat

# Paleta cromática histórica de Sevilla (piedra albero, ladrillo almohade, oro, bronce)
mat_albero       = material("Piedra_Albero_Sevilla", (0.82, 0.72, 0.54, 1.0), 0.82)
mat_albero.texture = "stone_ashlar"
mat_albero_osc   = material("Piedra_Albero_Oscura", (0.66, 0.56, 0.40, 1.0), 0.88)
mat_albero_osc.texture = "stone_ashlar"
mat_albero_claro = material("Piedra_Labrada_Clara", (0.90, 0.83, 0.68, 1.0), 0.72)
mat_albero_claro.texture = "stone_ashlar"
mat_ladrillo_gir = material("Ladrillo_Almohade_Giralda", (0.76, 0.54, 0.38, 1.0), 0.80)
mat_ladrillo_gir.texture = "brick_mudejar"
mat_sebka        = material("Relieve_Sebka_Albero", (0.88, 0.77, 0.60, 1.0), 0.75)
mat_sebka.texture = "stone_ashlar"
mat_marmol_bl    = material("Marmol_Blanco", (0.92, 0.90, 0.86, 1.0), 0.25)
mat_marmol_bl.texture = "marble_carrara"
mat_marmol_negro = material("Marmol_Negro_Veteado", (0.14, 0.14, 0.16, 1.0), 0.20)
mat_marmol_negro.texture = "marble_nero"
mat_teja_cupula  = material("Cubierta_Piedra_Teja", (0.52, 0.42, 0.32, 1.0), 0.78)
mat_teja_cupula.texture = "terracotta_roof"
mat_pizarra      = material("Cubierta_Crucero", (0.28, 0.30, 0.34, 1.0), 0.70)
mat_oro          = material("Oro_Retablo_Giraldillo", (0.92, 0.74, 0.22, 1.0), 0.22, 0.95)
mat_oro.texture = "gold_damascene"
mat_bronce       = material("Bronce_Campanas_Giraldillo", (0.38, 0.30, 0.18, 1.0), 0.35, 0.85)
mat_bronce.texture = "copper_patina"
mat_hierro       = material("Forja_Rejas_Sevilla", (0.12, 0.12, 0.14, 1.0), 0.40, 0.80)
mat_madera_coro  = material("Caoba_Silleria_Coro", (0.26, 0.13, 0.07, 1.0), 0.48)
mat_madera_coro.texture = "stone_ashlar"
mat_madera_puerta= material("Madera_Portones", (0.22, 0.14, 0.08, 1.0), 0.70)
mat_madera_puerta.texture = "wood_oak"
mat_tronco       = material("Tronco_Naranjo", (0.32, 0.21, 0.12, 1.0), 0.90)
mat_tronco.texture = "tree_bark"
mat_hoja_naranjo = material("Copa_Naranjo", (0.14, 0.36, 0.14, 1.0), 0.75)
mat_naranja      = material("Fruto_Naranja", (0.95, 0.45, 0.05, 1.0), 0.50)
mat_agua         = material("Agua_Fuente_Mudejar", (0.15, 0.52, 0.65, 1.0), 0.10)
mat_agua.texture = "brick_mudejar"
mat_espuma       = material("Espuma_Surtidor", (0.88, 0.96, 1.0, 1.0), 0.20, 0.0, 0.4)
mat_vidriera_az  = material("Vidriera_Azul_Cobalto", (0.18, 0.48, 0.95, 1.0), 0.15, 0.0, 1.8)
mat_vidriera_az.texture = "stained_glass"
mat_vidriera_ro  = material("Vidriera_Rojo_Rubi", (0.95, 0.22, 0.18, 1.0), 0.15, 0.0, 1.6)
mat_vidriera_ro.texture = "stained_glass"
mat_vidriera_am  = material("Vidriera_Ambar_Oro", (0.98, 0.76, 0.20, 1.0), 0.15, 0.0, 2.0)
mat_vidriera_am.texture = "stained_glass"
mat_luz_calida   = material("Luz_Interior_Sagrada", (1.0, 0.88, 0.62, 1.0), 0.10, 0.0, 3.2)
mat_terracota    = material("Pavimento_Ladrillo_Patio", (0.68, 0.42, 0.28, 1.0), 0.85)
mat_terracota.texture = "brick_mudejar"

# ==========================================
# 2. PRIMITIVAS Y CONSTRUCTORES GEOMÉTRICOS
# ==========================================
def asignar_mat(obj, mat):
    if mat:
        if obj.data.materials:
            obj.data.materials[0] = mat
        else:
            obj.data.materials.append(mat)
    return obj

def caja(nombre, centro, tamano, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = tamano
    return asignar_mat(obj, mat)

def cilindro(nombre, centro, radio, alto, mat, vertices=16, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def barra_yz(nombre, x, y1, z1, y2, z2, grosor, mat):
    dy = y2 - y1
    dz = z2 - z1
    largo = math.hypot(dy, dz)
    ang = math.atan2(dz, dy)
    cy = (y1 + y2) * 0.5
    cz = (z1 + z2) * 0.5
    return caja(nombre, (x, cy, cz), (grosor, largo, grosor), mat, rot=(ang, 0, 0))

def barra_xz(nombre, x1, z1, x2, z2, y, grosor, mat):
    dx = x2 - x1
    dz = z2 - z1
    largo = math.hypot(dx, dz)
    ang = -math.atan2(dz, dx)
    cx = (x1 + x2) * 0.5
    cz = (z1 + z2) * 0.5
    return caja(nombre, (cx, y, cz), (largo, grosor, grosor), mat, rot=(0, ang, 0))

def pinaculo_gotico(nombre, x, y, z_base, escala=1.0):
    s = escala
    caja(f"{nombre}_Base", (x, y, z_base + 0.8 * s), (1.1 * s, 1.1 * s, 1.6 * s), mat_albero_claro)
    caja(f"{nombre}_Cuerpo", (x, y, z_base + 2.2 * s), (0.85 * s, 0.85 * s, 1.4 * s), mat_albero)
    cono(f"{nombre}_Aguja", (x, y, z_base + 4.2 * s), 0.65 * s, 0.04 * s, 2.8 * s, mat_albero_claro, vertices=4, rot=(0, 0, math.pi / 4))
    esfera(f"{nombre}_Floron", (x, y, z_base + 5.7 * s), 0.16 * s, mat_oro)

# ==========================================
# 3. PLATAFORMA MONUMENTAL Y PAVIMENTO (LONJA)
# ==========================================
caja("Lonja_Gradas_Inf", (2, 10, -0.9), (96.0, 96.0, 0.6), mat_albero_osc)
caja("Lonja_Gradas_Med", (2, 10, -0.45), (90.0, 90.0, 0.35), mat_albero)
caja("Suelo_Catedral_Base", (0, 0, -0.15), (78.0, 54.0, 0.3), mat_marmol_bl)

# Damero interior de mármol blanco y negro
for ix in range(-6, 7):
    for iy in range(-4, 5):
        paridad = (ix + iy) % 2
        mat_dam = mat_marmol_negro
        if paridad == 0:
            mat_dam = mat_marmol_bl
        caja(f"Damero_{ix}_{iy}", (ix * 5.0, iy * 5.0, 0.02), (4.9, 4.9, 0.04), mat_dam)

# Columnas con cadenas perimetrales de la Lonja de Sevilla
for lx in range(-42, 47, 8):
    for ly in [-34, 54]:
        cilindro(f"Col_Lonja_{lx}_{ly}", (lx, ly, 0.9), 0.28, 1.8, mat_albero_osc, vertices=10)
        caja(f"Cadena_Lonja_{lx}_{ly}", (lx + 4.0, ly, 0.95), (8.0, 0.08, 0.08), mat_hierro)

# ==========================================
# 4. PLANTA DE 5 NAVES + CAPILLAS Y PILARES FASCICULADOS
# ==========================================
tramos_x = [-30.0, -22.5, -15.0, -7.5, 0.0, 7.5, 15.0, 22.5, 30.0]
lineas_y = [-18.5, -12.5, -6.0, 6.0, 12.5, 18.5]

def pilar_fasciculado(nombre, x, y, alto):
    cilindro(f"{nombre}_Basa", (x, y, 0.6), 1.05, 1.2, mat_albero_osc, vertices=8)
    cilindro(f"{nombre}_Nucleo", (x, y, alto * 0.5), 0.78, alto, mat_albero, vertices=12)
    for ang in [0, math.pi * 0.5, math.pi, math.pi * 1.5]:
        bx = x + math.cos(ang) * 0.72
        by = y + math.sin(ang) * 0.72
        cilindro(f"{nombre}_Baq_{ang:.1f}", (bx, by, alto * 0.5), 0.22, alto, mat_albero_claro, vertices=8)
    cilindro(f"{nombre}_Capitel", (x, y, alto - 0.5), 1.0, 0.9, mat_albero_claro, vertices=8)

for ix, x in enumerate(tramos_x):
    for iy, y in enumerate(lineas_y):
        if abs(x) < 29.0:
            h_pil = 13.0
            if abs(y) == 6.0:
                h_pil = 25.0
            if abs(y) == 12.5:
                h_pil = 18.5
            if abs(x) == 0.0 and abs(y) == 6.0:
                cilindro(f"Pilar_Toral_{iy}", (x, y, 13.0), 1.15, 26.0, mat_albero_claro, vertices=16)
            else:
                pilar_fasciculado(f"Pilar_{ix}_{iy}", x, y, h_pil)

# ==========================================
# 5. VOLÚMENES ESCALONADOS, AZOTEAS Y BÓVEDAS
# ==========================================
for s_y in [-1, 1]:
    y_cl = s_y * 6.0
    caja(f"Muro_Claristorio_{s_y}", (0.0, y_cl, 22.2), (60.0, 0.85, 7.6), mat_albero)
    caja(f"Cresteria_Central_{s_y}", (0.0, y_cl, 26.3), (60.4, 0.45, 0.9), mat_albero_claro)

caja("Boveda_Techo_Central", (0.0, 0.0, 25.8), (60.0, 12.0, 0.8), mat_albero)
barra_yz("Tejado_Central_Sur", 0.0, -6.2, 26.0, 0.0, 28.8, 0.6, mat_teja_cupula)
barra_yz("Tejado_Central_Norte", 0.0, 6.2, 26.0, 0.0, 28.8, 0.6, mat_teja_cupula)
caja("Faldones_Central_Sur", (0.0, -3.1, 27.3), (60.2, 6.8, 0.45), mat_teja_cupula, rot=(0.42, 0, 0))
caja("Faldones_Central_Norte", (0.0, 3.1, 27.3), (60.2, 6.8, 0.45), mat_teja_cupula, rot=(-0.42, 0, 0))
caja("Cumbrera_Central", (0.0, 0.0, 28.9), (60.4, 0.45, 0.45), mat_oro)

# Naves Intermedias (H = 19.0 m)
for s_y in [-1, 1]:
    yc = s_y * 9.25
    ym = s_y * 12.5
    caja(f"Cubierta_Nave_Intermedia_{s_y}", (0.0, yc, 18.6), (60.0, 6.6, 0.8), mat_teja_cupula)
    caja(f"Muro_Nave_Intermedia_{s_y}", (0.0, ym, 16.0), (60.0, 0.85, 6.0), mat_albero)
    caja(f"Pretil_Intermedia_{s_y}", (0.0, ym, 19.3), (60.4, 0.45, 0.8), mat_albero_claro)

# Naves Laterales Externas (H = 13.5 m)
for s_y in [-1, 1]:
    yc = s_y * 15.5
    ym = s_y * 18.5
    caja(f"Cubierta_Nave_Externa_{s_y}", (0.0, yc, 13.1), (60.0, 6.2, 0.8), mat_teja_cupula)
    caja(f"Muro_Nave_Externa_{s_y}", (0.0, ym, 11.2), (60.0, 0.9, 4.6), mat_albero)
    caja(f"Pretil_Externa_{s_y}", (0.0, ym, 13.8), (60.4, 0.45, 0.75), mat_albero_claro)

# Capillas Perimetrales entre Contrafuertes (H = 9.5 m)
for s_y in [-1, 1]:
    yc = s_y * 20.65
    ym = s_y * 22.8
    caja(f"Cubierta_Capillas_{s_y}", (0.0, yc, 9.2), (60.0, 4.4, 0.7), mat_teja_cupula)
    caja(f"Muro_Exterior_Capillas_{s_y}", (0.0, ym, 4.75), (60.0, 1.0, 9.5), mat_albero)
    caja(f"Pretil_Capillas_{s_y}", (0.0, ym, 9.8), (60.4, 0.5, 0.7), mat_albero_claro)

# ==========================================
# 6. CRUCERO (TRANSEPTO) Y CIMBORRIO CENTRAL
# ==========================================
caja("Crucero_Cuerpo_Norte", (0.0, 14.8, 19.5), (12.0, 17.5, 13.0), mat_albero)
caja("Crucero_Cuerpo_Sur", (0.0, -14.8, 19.5), (12.0, 17.5, 13.0), mat_albero)
caja("Tejado_Crucero_Oeste", (-3.1, 0.0, 27.3), (6.8, 47.2, 0.45), mat_pizarra, rot=(0, -0.42, 0))
caja("Tejado_Crucero_Este", (3.1, 0.0, 27.3), (6.8, 47.2, 0.45), mat_pizarra, rot=(0, 0.42, 0))
caja("Cumbrera_Crucero", (0.0, 0.0, 28.9), (0.45, 47.4, 0.45), mat_oro)

cilindro("Cimborrio_Tambor_Base", (0.0, 0.0, 28.5), 5.6, 3.8, mat_albero_claro, vertices=8)
cilindro("Cimborrio_Cuerpo_Sup", (0.0, 0.0, 31.2), 4.8, 2.6, mat_albero, vertices=8)
cono("Cimborrio_Cupula", (0.0, 0.0, 33.8), 5.0, 1.2, 2.8, mat_teja_cupula, vertices=8)
cilindro("Cimborrio_Linterna", (0.0, 0.0, 36.2), 1.4, 2.4, mat_albero_claro, vertices=8)
cono("Cimborrio_Chapitel", (0.0, 0.0, 38.4), 1.5, 0.05, 2.4, mat_oro, vertices=8)
caja("Cruz_Cimborrio_V", (0.0, 0.0, 40.3), (0.18, 0.18, 1.8), mat_oro)
caja("Cruz_Cimborrio_H", (0.0, 0.0, 40.6), (0.18, 1.1, 0.18), mat_oro)

for i in range(8):
    ang = i * (math.pi / 4.0) + (math.pi / 8.0)
    px = math.cos(ang) * 5.2
    py = math.sin(ang) * 5.2
    pinaculo_gotico(f"Pin_Cimborrio_{i}", px, py, 29.5, escala=0.65)

# ==========================================
# 7. DOBLE BATERÍA DE ARBOTANTES, CONTRAFUERTES Y VIDRIERAS
# ==========================================
colores_vidriera = [mat_vidriera_az, mat_vidriera_ro, mat_vidriera_am]

for ix, x in enumerate(tramos_x):
    if abs(x) < 2.0:
        continue

    for s_y in [-1, 1]:
        caja(f"Contrafuerte_Ext_{ix}_{s_y}", (x, s_y * 23.2, 6.2), (1.35, 1.8, 12.4), mat_albero_osc)
        pinaculo_gotico(f"Pin_Ext_{ix}_{s_y}", x, s_y * 23.2, 12.4, escala=0.82)

        caja(f"Botarel_Med_{ix}_{s_y}", (x, s_y * 18.5, 9.8), (1.25, 1.4, 19.6), mat_albero_osc)
        pinaculo_gotico(f"Pin_Med_{ix}_{s_y}", x, s_y * 18.5, 19.6, escala=0.92)

        caja(f"Botarel_Int_{ix}_{s_y}", (x, s_y * 12.5, 12.2), (1.2, 1.3, 24.4), mat_albero_osc)
        pinaculo_gotico(f"Pin_Int_{ix}_{s_y}", x, s_y * 12.5, 24.4, escala=1.0)

        pinaculo_gotico(f"Pin_Claristorio_{ix}_{s_y}", x, s_y * 6.0, 26.0, escala=0.78)

        barra_yz(f"Arbotante_Inf_1_{ix}_{s_y}", x, s_y * 18.5, 14.2, s_y * 12.5, 17.8, 0.55, mat_albero_claro)
        barra_yz(f"Arbotante_Inf_2_{ix}_{s_y}", x, s_y * 18.5, 16.0, s_y * 12.5, 19.2, 0.45, mat_albero)

        barra_yz(f"Arbotante_Sup_1_{ix}_{s_y}", x, s_y * 12.5, 19.5, s_y * 6.0, 23.8, 0.58, mat_albero_claro)
        barra_yz(f"Arbotante_Sup_2_{ix}_{s_y}", x, s_y * 12.5, 21.4, s_y * 6.0, 25.4, 0.48, mat_albero)

    if ix < len(tramos_x) - 1:
        xm = (x + tramos_x[ix + 1]) * 0.5
        if abs(xm) > 4.5:
            mat_v = colores_vidriera[ix % 3]
            for s_y in [-1, 1]:
                caja(f"Vidriera_Cl_{ix}_{s_y}", (xm, s_y * 6.05, 22.2), (3.4, 0.95, 4.6), mat_v)
                caja(f"Vidriera_Int_{ix}_{s_y}", (xm, s_y * 12.55, 16.0), (3.2, 0.95, 3.6), colores_vidriera[(ix + 1) % 3])
                caja(f"Vidriera_Cap_{ix}_{s_y}", (xm, s_y * 22.85, 5.2), (2.8, 1.1, 4.2), colores_vidriera[(ix + 2) % 3])

# ==========================================
# 8. LA GIRALDA DE SEVILLA (ESQUINA NORESTE: X = 26.5, Y = 24.5)
# ==========================================
gx, gy = 26.5, 24.5

caja("Giralda_Basamento", (gx, gy, 3.0), (13.6, 13.6, 6.0), mat_albero_osc)
caja("Giralda_Cana_Almohade", (gx, gy, 27.0), (13.2, 13.2, 42.0), mat_ladrillo_gir)

for sx in [-1, 1]:
    for sy in [-1, 1]:
        caja(f"Giralda_Esquina_{sx}_{sy}", (gx + sx * 6.45, gy + sy * 6.45, 27.0), (0.6, 0.6, 42.0), mat_albero_claro)

niveles_sebka = [14.0, 26.5, 39.0]
for nz in niveles_sebka:
    for cara in range(4):
        for offset in [-3.4, 3.4]:
            if cara == 0:
                px, py, sx, sy = gx + offset, gy - 6.65, 3.2, 0.28
            elif cara == 1:
                px, py, sx, sy = gx + offset, gy + 6.65, 3.2, 0.28
            elif cara == 2:
                px, py, sx, sy = gx + 6.65, gy + offset, 0.28, 3.2
            else:
                px, py, sx, sy = gx - 6.65, gy + offset, 0.28, 3.2
            caja(f"Pano_Sebka_{nz}_{cara}_{offset}", (px, py, nz), (sx, sy, 8.8), mat_sebka)

        if cara == 0:
            vx, vy, vsx, vsy = gx, gy - 6.65, 2.0, 0.35
            bx, by, bsx, bsy = gx, gy - 7.0, 2.8, 0.7
        elif cara == 1:
            vx, vy, vsx, vsy = gx, gy + 6.65, 2.0, 0.35
            bx, by, bsx, bsy = gx, gy + 7.0, 2.8, 0.7
        elif cara == 2:
            vx, vy, vsx, vsy = gx + 6.65, gy, 0.35, 2.0
            bx, by, bsx, bsy = gx + 7.0, gy, 0.7, 2.8
        else:
            vx, vy, vsx, vsy = gx - 6.65, gy, 0.35, 2.0
            bx, by, bsx, bsy = gx - 7.0, gy, 0.7, 2.8
        caja(f"Ajimez_Giralda_{nz}_{cara}", (vx, vy, nz - 0.5), (vsx, vsy, 3.4), mat_marmol_negro)
        caja(f"Balcon_Giralda_{nz}_{cara}", (bx, by, nz - 2.3), (bsx, bsy, 0.45), mat_albero_claro)

caja("Giralda_Cornisa_Almohade", (gx, gy, 48.4), (14.4, 14.4, 1.0), mat_albero_claro)
caja("Giralda_Balaustrada_Azucenas", (gx, gy, 49.4), (13.8, 13.8, 1.1), mat_albero)

for sx in [-1, 1]:
    for sy in [-1, 1]:
        jx, jy = gx + sx * 6.5, gy + sy * 6.5
        cilindro(f"Pedestal_Azucena_{sx}_{sy}", (jx, jy, 50.4), 0.55, 1.2, mat_albero_claro, vertices=8)
        esfera(f"Jarra_Azucena_{sx}_{sy}", (jx, jy, 51.5), 0.5, mat_bronce, escala=(1, 1, 1.4))
        cono(f"Ramo_Azucenas_{sx}_{sy}", (jx, jy, 52.6), 0.45, 0.08, 1.4, mat_oro, vertices=6)

caja("Giralda_Cuerpo_Campanas_Nucleo", (gx, gy, 54.8), (10.6, 10.6, 10.5), mat_albero_claro)
for cara in range(4):
    for off in [-3.1, 0.0, 3.1]:
        if cara < 2:
            s_dir = 1
            if cara == 0:
                s_dir = -1
            cx, cy = gx + off, gy + s_dir * 5.35
            sx, sy = 1.6, 0.4
        else:
            s_dir = -1
            if cara == 2:
                s_dir = 1
            cx, cy = gx + s_dir * 5.35, gy + off
            sx, sy = 0.4, 1.6
        caja(f"Vano_Campana_{cara}_{off}", (cx, cy, 54.5), (sx, sy, 5.2), mat_marmol_negro)
        cono(f"Campana_Bronce_{cara}_{off}", (cx, cy, 55.6), 0.55, 0.2, 1.1, mat_bronce, vertices=10)

caja("Giralda_Cornisa_Campanas", (gx, gy, 60.3), (11.6, 11.6, 0.9), mat_albero_claro)
caja("Giralda_Cuerpo_Estrellas", (gx, gy, 63.6), (7.6, 7.6, 5.8), mat_albero_claro)
caja("Giralda_Cornisa_Estrellas", (gx, gy, 66.8), (8.4, 8.4, 0.7), mat_albero)

cilindro("Giralda_Tambor_Redondo", (gx, gy, 70.0), 3.2, 5.0, mat_albero_claro, vertices=12)
esfera("Giralda_Cupulin", (gx, gy, 73.2), 3.1, mat_teja_cupula, escala=(1.0, 1.0, 1.15))
cilindro("Giralda_Linterna_Sup", (gx, gy, 76.5), 1.35, 2.6, mat_albero_claro, vertices=10)
cono("Giralda_Pinaculo_Sup", (gx, gy, 78.8), 1.4, 0.2, 2.2, mat_albero_osc, vertices=10)

esfera("Giralda_Tinaja_Bronce", (gx, gy, 80.6), 0.95, mat_oro)
cilindro("Giraldillo_Cuerpo", (gx, gy, 82.8), 0.35, 3.2, mat_bronce, vertices=10)
esfera("Giraldillo_Cabeza_Casco", (gx, gy, 84.7), 0.42, mat_oro)
caja("Giraldillo_Labaro_Astil", (gx + 0.65, gy, 83.4), (0.12, 0.12, 3.8), mat_oro)
caja("Giraldillo_Labaro_Bandera", (gx + 1.35, gy, 84.2), (1.3, 0.08, 1.8), mat_oro)
barra_xz("Giraldillo_Palma", gx - 0.3, 82.8, gx - 1.4, 84.6, gy, 0.14, mat_oro)

# ==========================================
# 9. CAPILLA REAL (CABECERA ESTE: X = 30 a 41)
# ==========================================
caja("Capilla_Real_Base", (34.8, 0.0, 8.5), (9.6, 15.0, 17.0), mat_albero)
cilindro("Capilla_Real_Abside", (39.0, 0.0, 8.5), 7.2, 17.0, mat_albero_claro, vertices=12)
caja("Capilla_Real_Cornisa", (35.5, 0.0, 17.4), (11.5, 16.0, 0.9), mat_albero_claro)
cilindro("Capilla_Real_Tambor", (36.0, 0.0, 19.8), 5.6, 4.0, mat_albero_claro, vertices=12)
esfera("Capilla_Real_Cupula", (36.0, 0.0, 22.0), 5.5, mat_teja_cupula, escala=(1.0, 1.0, 0.85))
cilindro("Capilla_Real_Linterna", (36.0, 0.0, 26.8), 1.3, 2.4, mat_albero_claro, vertices=8)
cono("Capilla_Real_Chapitel", (36.0, 0.0, 28.8), 1.4, 0.08, 1.8, mat_oro, vertices=8)

for s_y in [-1, 1]:
    caja(f"Cabecera_Colateral_{s_y}", (32.5, s_y * 13.5, 6.8), (5.5, 9.5, 13.6), mat_albero)
    pinaculo_gotico(f"Pin_Cabecera_{s_y}", 35.0, s_y * 17.5, 13.6, escala=0.8)

# ==========================================
# 10. FACHADA OCCIDENTAL (PUERTAS DE LA ASUNCIÓN, BAUTISMO Y SAN MIGUEL)
# ==========================================
fx = -30.0
caja("Fachada_Oeste_Central", (fx, 0.0, 13.0), (1.4, 12.6, 26.0), mat_albero)
caja("Fachada_Oeste_Int_Sur", (fx, -9.2, 9.5), (1.3, 6.5, 19.0), mat_albero)
caja("Fachada_Oeste_Int_Norte", (fx, 9.2, 9.5), (1.3, 6.5, 19.0), mat_albero)
caja("Fachada_Oeste_Ext_Sur", (fx, -15.5, 6.8), (1.2, 6.2, 13.6), mat_albero)
caja("Fachada_Oeste_Ext_Norte", (fx, 15.5, 6.8), (1.2, 6.2, 13.6), mat_albero)

for py in [-18.5, -12.5, -6.0, 6.0, 12.5, 18.5]:
    h_cf = 14.5
    if abs(py) == 12.5:
        h_cf = 20.0
    if abs(py) == 6.0:
        h_cf = 27.0
    caja(f"Contrafuerte_Oeste_{py}", (fx - 0.9, py, h_cf * 0.5), (1.8, 1.5, h_cf), mat_albero_claro)
    pinaculo_gotico(f"Pin_Oeste_{py}", fx - 0.9, py, h_cf, escala=0.95)

def portada_gotica_abocinada(nombre, x, y, ancho, alto, prof):
    caja(f"{nombre}_Macizo", (x - prof * 0.4, y, alto * 0.55), (prof, ancho + 2.2, alto * 1.1), mat_albero_claro)
    for i in range(4):
        a_w = ancho - i * 0.55
        a_h = alto - i * 0.45
        px = x - prof + i * 0.22
        caja(f"{nombre}_Jamba_Izq_{i}", (px, y - a_w * 0.5, a_h * 0.35), (0.35, 0.35, a_h * 0.7), mat_albero_osc)
        caja(f"{nombre}_Jamba_Der_{i}", (px, y + a_w * 0.5, a_h * 0.35), (0.35, 0.35, a_h * 0.7), mat_albero_osc)
        barra_yz(f"{nombre}_Arco_Izq_{i}", px, y - a_w * 0.5, a_h * 0.7, y, a_h, 0.32, mat_albero_claro)
        barra_yz(f"{nombre}_Arco_Der_{i}", px, y + a_w * 0.5, a_h * 0.7, y, a_h, 0.32, mat_albero_claro)
    barra_yz(f"{nombre}_Gablete_Izq", x - prof, y - ancho * 0.6, alto * 0.75, y, alto * 1.32, 0.38, mat_albero_claro)
    barra_yz(f"{nombre}_Gablete_Der", x - prof, y + ancho * 0.6, alto * 0.75, y, alto * 1.32, 0.38, mat_albero_claro)
    esfera(f"{nombre}_Floron_Gablete", (x - prof, y, alto * 1.36), 0.32, mat_oro)
    caja(f"{nombre}_Timpano", (x - 0.3, y, alto * 0.78), (0.4, ancho * 0.72, alto * 0.28), mat_albero)
    caja(f"{nombre}_Puerta_Madera", (x - 0.2, y, alto * 0.32), (0.45, ancho * 0.72, alto * 0.64), mat_madera_puerta)
    caja(f"{nombre}_Parteluz", (x - 0.5, y, alto * 0.32), (0.35, 0.28, alto * 0.64), mat_albero_claro)

portada_gotica_abocinada("Puerta_Asuncion", fx, 0.0, 6.2, 11.5, 2.2)
portada_gotica_abocinada("Puerta_Bautismo", fx, -12.5, 4.2, 8.2, 1.5)
portada_gotica_abocinada("Puerta_San_Miguel", fx, 12.5, 4.2, 8.2, 1.5)

rx = fx - 0.8
cilindro("Roseton_Oeste_Marco", (rx, 0.0, 19.2), 3.8, 0.65, mat_albero_claro, vertices=24, rot=(0, math.pi / 2, 0))
cilindro("Roseton_Oeste_Vidrio", (rx + 0.1, 0.0, 19.2), 3.3, 0.35, mat_vidriera_am, vertices=24, rot=(0, math.pi / 2, 0))
cilindro("Roseton_Oeste_Nucleo", (rx - 0.1, 0.0, 19.2), 1.1, 0.5, mat_vidriera_ro, vertices=16, rot=(0, math.pi / 2, 0))
for i in range(12):
    ang = i * (math.pi / 6.0)
    ry = math.cos(ang) * 1.7
    rz = 19.2 + math.sin(ang) * 1.7
    caja(f"Radio_Roseton_{i}", (rx - 0.12, ry, rz), (0.25, 0.14, 3.4), mat_albero_claro, rot=(ang + math.pi / 2, 0, 0))

portada_gotica_abocinada("Puerta_Principe_Sur", 0.0, -23.0, 5.2, 10.2, 1.8)
cilindro("Roseton_Sur_Crucero", (0.0, -23.5, 19.0), 3.1, 0.5, mat_vidriera_az, vertices=20, rot=(math.pi / 2, 0, 0))

# ==========================================
# 11. PATIO DE LOS NARANJOS Y PUERTA DEL PERDÓN (NORTE: Y = 23 a 51)
# ==========================================
caja("Suelo_Patio_Naranjos", (-4.0, 37.0, 0.05), (46.0, 28.0, 0.15), mat_terracota)
caja("Muro_Patio_Oeste", (-27.0, 37.0, 4.2), (1.1, 28.0, 8.4), mat_albero)
caja("Muro_Patio_Este", (19.0, 37.0, 4.2), (1.1, 28.0, 8.4), mat_albero)
caja("Muro_Patio_Norte", (-4.0, 51.0, 4.5), (47.0, 1.2, 9.0), mat_albero)

for ax in range(-26, 19, 2):
    caja(f"Almena_Base_{ax}", (ax, 51.0, 9.35), (1.1, 0.8, 0.7), mat_albero_claro)
    caja(f"Almena_Pico_{ax}", (ax, 51.0, 9.9), (0.6, 0.8, 0.5), mat_albero_claro)

for gx_p in range(-22, 16, 4):
    cilindro(f"Col_Claustro_N_{gx_p}", (gx_p, 47.8, 2.8), 0.25, 5.6, mat_marmol_bl, vertices=10)
caja("Techo_Galeria_Norte", (-4.0, 49.4, 5.9), (44.0, 3.4, 0.5), mat_teja_cupula)

caja("Puerta_Perdon_Torreon", (-4.0, 51.4, 6.2), (9.2, 2.6, 12.4), mat_albero_claro)
cilindro("Puerta_Perdon_Arco_Herradura", (-4.0, 51.9, 5.2), 2.8, 1.8, mat_albero_osc, vertices=16, rot=(math.pi / 2, 0, 0))
caja("Puerta_Perdon_Hojas_Bronce", (-4.0, 51.5, 3.2), (4.6, 0.5, 6.4), mat_bronce)
caja("Puerta_Perdon_Almenas_Sup", (-4.0, 51.4, 12.8), (9.6, 2.8, 0.9), mat_oro)

filas_naranjos_x = [-20.0, -14.5, -9.5, 1.5, 6.5, 12.0]
filas_naranjos_y = [28.0, 33.5, 39.5, 44.5]

for nx in filas_naranjos_x:
    caja(f"Canalillo_Riego_{nx}", (nx, 36.2, 0.14), (0.35, 18.0, 0.08), mat_agua)
    for ny in filas_naranjos_y:
        caja(f"Alcorque_{nx}_{ny}", (nx, ny, 0.18), (1.9, 1.9, 0.18), mat_albero_osc)
        cilindro(f"Tronco_Naranjo_{nx}_{ny}", (nx, ny, 1.25), 0.18, 2.3, mat_tronco, vertices=8)
        esfera(f"Copa_Naranjo_{nx}_{ny}", (nx, ny, 2.85), 1.45, mat_hoja_naranjo, escala=(1.0, 1.0, 0.88))
        for ang_n in [0.4, 1.9, 3.5, 5.0]:
            fx_n = nx + math.cos(ang_n) * 1.18
            fy_n = ny + math.sin(ang_n) * 1.18
            esfera(f"Naranja_{nx}_{ny}_{ang_n:.1f}", (fx_n, fy_n, 2.75), 0.14, mat_naranja)

fx_p, fy_p = -4.0, 36.5
cilindro("Fuente_Patio_Grada", (fx_p, fy_p, 0.25), 3.4, 0.35, mat_albero_claro, vertices=8)
cilindro("Fuente_Patio_Taza_Oct", (fx_p, fy_p, 0.72), 2.6, 0.75, mat_marmol_bl, vertices=8)
agua_patio = cilindro("Fuente_Patio_Agua", (fx_p, fy_p, 0.98), 2.35, 0.12, mat_agua, vertices=12)
bpy.anim.agua(agua_patio, 1.3)

cilindro("Fuente_Patio_Taza_Visigoda", (fx_p, fy_p, 1.45), 1.15, 0.85, mat_albero_osc, vertices=12)
surtidor_patio = cono("Fuente_Patio_Surtidor", (fx_p, fy_p, 2.35), 0.35, 0.08, 1.4, mat_espuma, vertices=10)
bpy.anim.loop(surtidor_patio, 1.2, lambda t: (0.0, 0.0, 0.22 * math.sin(t * math.pi * 2.0)))
for j_ch in range(6):
    ang_ch = j_ch * (math.pi * 2.0 / 6.0)
    gota_f = esfera(f"Gota_Fuente_Patio_{j_ch}", (fx_p, fy_p, 1.95), 0.16, mat_espuma)
    bpy.anim.loop(gota_f, 1.4, lambda t, a=ang_ch: (
        math.cos(a) * 1.45 * t,
        math.sin(a) * 1.45 * t,
        2.8 * t * (1.0 - t) - 0.7 * t * t
    ))

# ==========================================
# 12. INTERIOR MONUMENTAL: CORO, ÓRGANOS, RETABLO MAYOR Y TUMBA DE COLÓN
# ==========================================
caja("Coro_Trascoro_Marmol", (-15.0, 0.0, 3.2), (1.1, 10.6, 6.4), mat_marmol_bl)
for s_y in [-1, 1]:
    caja(f"Coro_Muro_Lat_{s_y}", (-9.5, s_y * 5.0, 3.2), (11.0, 0.8, 6.4), mat_albero_claro)
    caja(f"Coro_Silleria_Alta_{s_y}", (-9.5, s_y * 4.2, 2.2), (9.8, 0.75, 4.4), mat_madera_coro)
    caja(f"Coro_Silleria_Baja_{s_y}", (-9.5, s_y * 3.3, 1.1), (9.2, 0.65, 2.0), mat_madera_coro)

    caja(f"Organo_Caja_{s_y}", (-9.5, s_y * 4.8, 9.8), (6.5, 1.5, 6.8), mat_madera_coro)
    caja(f"Organo_Cornisa_Oro_{s_y}", (-9.5, s_y * 4.8, 13.5), (7.0, 1.8, 0.8), mat_oro)
    for tx in range(-12, -6):
        cilindro(f"Tubo_Org_{s_y}_{tx}", (tx * 1.0, s_y * 4.0, 10.0), 0.16, 5.8, mat_oro, vertices=8)

cilindro("Coro_Facistol_Base", (-9.5, 0.0, 1.1), 0.7, 2.2, mat_madera_coro, vertices=8)
cono("Coro_Facistol_Atril", (-9.5, 0.0, 2.6), 0.9, 0.2, 1.1, mat_oro, vertices=4)

caja("Reja_Capilla_Mayor_Inf", (7.5, 0.0, 4.5), (0.28, 10.8, 9.0), mat_hierro)
caja("Reja_Capilla_Mayor_Friso_Oro", (7.5, 0.0, 9.4), (0.45, 11.0, 1.4), mat_oro)
caja("Reja_Capilla_Mayor_Cresteria", (7.5, 0.0, 11.2), (0.35, 7.5, 2.4), mat_oro)

caja("Presbiterio_Gradas", (15.0, 0.0, 0.55), (14.5, 10.8, 1.1), mat_marmol_negro)
caja("Altar_Mayor_Mesa", (16.5, 0.0, 1.8), (2.2, 4.8, 1.4), mat_oro)

rx_m = 21.8
caja("Retablo_Mayor_Estructura", (rx_m, 0.0, 11.5), (1.4, 10.8, 21.0), mat_oro)
for cx_calle in range(-4, 5, 2):
    caja(f"Retablo_Pilar_Calle_{cx_calle}", (rx_m - 0.55, cx_calle * 1.15, 11.5), (0.5, 0.28, 20.5), mat_madera_coro)
for cz_cuerpo in range(3, 21, 3):
    caja(f"Retablo_Dosel_Cuerpo_{cz_cuerpo}", (rx_m - 0.65, 0.0, cz_cuerpo * 1.0), (0.65, 10.6, 0.42), mat_oro)
caja("Retablo_Calvario_Cumbrera", (rx_m - 0.5, 0.0, 22.8), (0.9, 6.0, 2.2), mat_oro)

cx_col, cy_col = -3.5, -10.5
caja("Colon_Pedestal_Marmol", (cx_col, cy_col, 0.7), (3.4, 2.4, 1.4), mat_marmol_bl)
for sx in [-1, 1]:
    for sy in [-1, 1]:
        cilindro(f"Heraldo_Colon_{sx}_{sy}", (cx_col + sx * 1.0, cy_col + sy * 0.65, 2.3), 0.28, 1.9, mat_bronce, vertices=10)
        esfera(f"Cabeza_Heraldo_{sx}_{sy}", (cx_col + sx * 1.0, cy_col + sy * 0.65, 3.4), 0.22, mat_oro)
caja("Feretro_Cristobal_Colon", (cx_col, cy_col, 3.7), (2.8, 1.35, 0.95), mat_oro)

for lx in [-22.0, -15.0, 0.0, 12.0]:
    cilindro(f"Cable_Lampara_{lx}", (lx, 0.0, 17.5), 0.04, 15.0, mat_hierro, vertices=6)
    esfera(f"Lampara_Votiva_{lx}", (lx, 0.0, 9.8), 0.55, mat_luz_calida)
`,
  },
  {
    id: 'gen_blender52_mecha_paladin',
    name: 'Blender 5.2 Web (BSDF + Modifiers + Z-Up)',
    category: 'generate',
    description: 'Script estándar de Blender 5.2 como los creados en Gemini Web (Principled BSDF, def, Mirror, Subsurf y eje Z arriba)',
    code: `# SCRIPT ESTÁNDAR BLENDER 5.2 (Compatible directo con códigos de Gemini Web)
import bpy
import math
from mathutils import Vector, Euler

# 1. Limpiar escena al estilo Blender 5.2
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def crear_material_bsdf(nombre, color_rgba, metalico=0.2, rugosidad=0.35, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color_rgba
        bsdf.inputs["Metallic"].default_value = metalico
        bsdf.inputs["Roughness"].default_value = rugosidad
        if emision > 0:
            bsdf.inputs["Emission Color"].default_value = color_rgba
            bsdf.inputs["Emission Strength"].default_value = emision
    return mat

def asignar_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

# Materiales Principled BSDF de Blender 5.2
mat_titanio = crear_material_bsdf("Titanio_Oscuro", (0.16, 0.20, 0.28, 1.0), metalico=0.85, rugosidad=0.25)
mat_titanio.texture = "brushed_metal"
mat_carmesi = crear_material_bsdf("Armadura_Carmesi", (0.88, 0.14, 0.28, 1.0), metalico=0.45, rugosidad=0.30)
mat_oro = crear_material_bsdf("Oro_Imperial", (0.98, 0.74, 0.14, 1.0), metalico=0.92, rugosidad=0.18)
mat_oro.texture = "gold_damascene"
mat_plasma = crear_material_bsdf("Plasma_Cian", (0.06, 0.88, 0.98, 1.0), emision=4.5)
mat_plasma.texture = "solar_plasma"

# Torso blindado (En Blender 5.2 el eje Z es la altura vertical)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.55))
torso = bpy.context.active_object
torso.name = "Torso_Paladin"
torso.scale = (0.78, 0.48, 0.92)
bpy.ops.object.transform_apply(scale=True)
sub = torso.modifiers.new(name="Subsurf", type='SUBSURF')
sub.levels = 2
asignar_mat(torso, mat_carmesi)

# Núcleo reactor en el pecho
bpy.ops.mesh.primitive_ico_sphere_add(radius=0.22, subdivisions=2, location=(0, -0.26, 1.62))
reactor = bpy.context.active_object
asignar_mat(reactor, mat_plasma)

# Cabeza + Visor + Cuernos con modificador Mirror
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.30, location=(0, 0, 2.28))
cabeza = bpy.context.active_object
cabeza.scale = (0.9, 0.95, 1.05)
asignar_mat(cabeza, mat_titanio)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.24, 2.30))
visor = bpy.context.active_object
visor.scale = (0.42, 0.12, 0.10)
asignar_mat(visor, mat_plasma)

bpy.ops.mesh.primitive_cone_add(radius1=0.09, radius2=0.01, depth=0.65, location=(0.26, 0.02, 2.58), rotation=(-0.25, 0.35, 0))
cuerno = bpy.context.active_object
asignar_mat(cuerno, mat_oro)
mod_mirror_cuerno = cuerno.modifiers.new(name="MirrorX", type='MIRROR')
mod_mirror_cuerno.use_axis = (True, False, False)

# Hombreras y Brazos simétricos usando modificador MIRROR de Blender 5.2
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.28, location=(0.64, 0, 1.88))
hombrera = bpy.context.active_object
hombrera.scale = (1.1, 0.9, 0.75)
asignar_mat(hombrera, mat_oro)
hombrera.modifiers.new(name="Mirror", type='MIRROR')

bpy.ops.mesh.primitive_cylinder_add(radius=0.13, depth=0.78, location=(0.72, -0.05, 1.38), rotation=(0.2, 0.15, 0))
brazo = bpy.context.active_object
asignar_mat(brazo, mat_titanio)
brazo.modifiers.new(name="Mirror", type='MIRROR')

# Piernas articuladas con Mirror
bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.95, location=(0.28, 0, 0.58))
pierna = bpy.context.active_object
asignar_mat(pierna, mat_titanio)
pierna.modifiers.new(name="Mirror", type='MIRROR')

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.28, -0.08, 0.12))
bota = bpy.context.active_object
bota.scale = (0.28, 0.44, 0.18)
asignar_mat(bota, mat_carmesi)
bota.modifiers.new(name="Mirror", type='MIRROR')

# Halo de energía con Array radial
for i in range(6):
    ang = i * (math.pi * 2 / 6)
    px = math.cos(ang) * 0.95
    pz = 1.75 + math.sin(ang) * 0.95
    bpy.ops.mesh.primitive_cone_add(radius1=0.08, depth=0.38, location=(px, 0.35, pz), rotation=(0, ang + math.pi/2, 0))
    cristal = bpy.context.active_object
    asignar_mat(cristal, mat_plasma)

bpy.ops.object.shade_smooth()
print("Paladín Mecha Blender 5.2 (Z-Up + Principled BSDF + Mirror Modifiers) generado con éxito!")
`,
  },
  {
    id: 'gen_game_treasure_chest',
    name: 'Cofre del Tesoro & Gemas (Prop / Loot)',
    category: 'generate',
    description: 'Modela un Cofre RPG estilizado con herrajes dorados, cerradura y cristales brillantes alrededor',
    code: `# PROP DE VIDEOJUEGO: Cofre del Tesoro RPG + Cristales de Loot
import bpy
import math

bpy.ops.object.delete()

# 1. Cuerpo del cofre (Madera noble + Tapa abovedada + Bandas de hierro dorado)
bpy.ops.mesh.primitive_prop_chest_add(width=1.45, height=0.95, depth=0.95, location=(0, 0.52, 0), color=(0.48, 0.24, 0.10), accent_color=(0.96, 0.74, 0.14))

# 2. Monedas y gemas octaedricas flotando / saliendo del cofre
for i in range(6):
    ang = i * (math.pi * 2 / 6)
    gx = math.cos(ang) * 0.98
    gz = math.sin(ang) * 0.98
    gy = 0.22 + (i % 2) * 0.18
    bpy.ops.mesh.primitive_octahedron_add(radius=0.18, location=(gx, gy, gz), rotation=(0.3, ang, 0.2), color=(0.08, 0.88, 0.98))

# 3. Gran Gema Legendaria levitando sobre el cofre
bpy.ops.mesh.primitive_octahedron_add(radius=0.34, location=(0, 1.58, 0), scale=(0.85, 1.45, 0.85), color=(0.98, 0.22, 0.55))
bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.04, location=(0, 1.58, 0), rotation=(0.45, 0.3, 0), color=(0.98, 0.78, 0.15))

bpy.ops.mesh.auto_ground()
print("Prop de juego 'Cofre del Tesoro RPG' generado con éxito!")
`,
  },
  {
    id: 'gen_game_stylized_tree',
    name: 'Árbol Mágico & Isla (Naturaleza / Mundo)',
    category: 'generate',
    description: 'Construye un Árbol estilizado con raíces, rocas, setas luminosas y follaje en capas',
    code: `# ENTORNO / NATURALEZA DE JUEGO: Árbol Mágico sobre Isla Rocosa con Setas
import bpy
import math

bpy.ops.object.delete()

# 1. Base de isla rocosa y piedras laterales
bpy.ops.mesh.primitive_dodecahedron_add(radius=1.15, location=(0, 0.38, 0), scale=(1.25, 0.42, 1.25), color=(0.36, 0.40, 0.48))
bpy.ops.mesh.primitive_cylinder_add(radius=1.22, depth=0.18, location=(0, 0.62, 0), color=(0.22, 0.68, 0.34))

# 2. Tronco orgánico curvado y ramas principales
bpy.ops.mesh.primitive_horn_add(base_radius=0.36, tip_radius=0.16, length=1.65, bend=0.22, location=(0, 1.35, 0), color=(0.46, 0.28, 0.14))
bpy.ops.mesh.primitive_tree_foliage_add(radius=1.05, layers=4, location=(0, 2.25, 0), color=(0.18, 0.78, 0.38), accent_color=(0.35, 0.92, 0.48))

# 3. Rocas y setas bioluminiscentes alrededor del tronco
for i in range(5):
    ang = i * (math.pi * 2 / 5)
    rx = math.cos(ang) * 0.78
    rz = math.sin(ang) * 0.78
    # Tallo de la seta
    bpy.ops.mesh.primitive_capsule_add(radius=0.06, length=0.22, location=(rx, 0.82, rz), color=(0.92, 0.88, 0.78))
    # Sombrero de la seta brillante
    bpy.ops.mesh.primitive_cone_add(radius1=0.20, radius2=0.04, depth=0.18, location=(rx, 0.98, rz), color=(0.12, 0.88, 0.96))

bpy.ops.mesh.auto_ground()
print("Elemento de naturaleza 'Árbol Mágico & Isla' generado con éxito!")
`,
  },
  {
    id: 'gen_game_cyber_vehicle',
    name: 'Vehículo / Nave Rover Sci-Fi (Vehículo)',
    category: 'generate',
    description: 'Construye un vehículo / coche blindado con chasis aerodinámico, cabina, ruedas y turbinas',
    code: `# VEHÍCULO DE VIDEOJUEGO: Rover / Coche Blindado Sci-Fi con Turbinas
import bpy

bpy.ops.object.delete()

# 1. Chasis aerodinámico principal y cabina acristalada
bpy.ops.mesh.primitive_cube_add(size=1.0, scale=(1.35, 0.42, 2.25), location=(0, 0.68, 0), color=(0.16, 0.20, 0.28))
bpy.ops.mesh.primitive_armor_plate_add(width=1.22, height=0.45, thickness=0.85, curvature=0.35, location=(0, 1.02, -0.10), rotation=(1.57, 0, 0), color=(0.08, 0.86, 0.98))
bpy.ops.mesh.primitive_armor_plate_add(width=1.42, height=0.38, thickness=0.32, curvature=0.42, location=(0, 0.68, 1.12), color=(0.92, 0.18, 0.34))

# 2. Pares de ruedas todoterreno delanteras y traseras
bpy.ops.mesh.primitive_wheel_pair_add(radius=0.42, width=0.28, span=0.82, y_pos=0.44, z_pos=0.72, color=(0.14, 0.16, 0.20), rim_color=(0.98, 0.74, 0.14))
bpy.ops.mesh.primitive_wheel_pair_add(radius=0.46, width=0.32, span=0.86, y_pos=0.46, z_pos=-0.74, color=(0.14, 0.16, 0.20), rim_color=(0.98, 0.74, 0.14))

# 3. Alerón trasero y propulsores de plasma
bpy.ops.mesh.primitive_cube_add(size=1.0, scale=(1.45, 0.08, 0.35), location=(0, 1.18, -1.02), color=(0.92, 0.18, 0.34))
for side in [-1, 1]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.38, location=(side * 0.38, 0.68, -1.18), rotation=(1.57, 0, 0), color=(0.06, 0.90, 0.98))

bpy.ops.mesh.auto_ground()
print("Vehículo 'Rover Sci-Fi' generado con éxito!")
`,
  },
  {
    id: 'gen_game_medieval_tower',
    name: 'Torre / Portal Arquitectónico (Edificio)',
    category: 'generate',
    description: 'Construye una estructura arquitectónica con escalinata, arco de piedra, columnas y tejado',
    code: `# ARQUITECTURA / ESCENARIO DE JUEGO: Torre & Portal Mágico
import bpy
import math

bpy.ops.object.delete()

# 1. Plataforma escalonada de piedra
bpy.ops.mesh.primitive_cylinder_add(radius=1.55, depth=0.22, vertices=8, location=(0, 0.12, 0), color=(0.42, 0.46, 0.54))
bpy.ops.mesh.primitive_cylinder_add(radius=1.28, depth=0.22, vertices=8, location=(0, 0.32, 0), color=(0.50, 0.54, 0.62))

# 2. Arco monumental de entrada y columnas
bpy.ops.mesh.primitive_arch_add(width=1.45, height=1.85, thickness=0.28, location=(0, 0.42, 0), color=(0.62, 0.66, 0.74), accent_color=(0.96, 0.72, 0.16))

# 3. Vórtice de energía del portal en el centro y tejado cónico superior
bpy.ops.mesh.primitive_torus_add(major_radius=0.52, minor_radius=0.06, location=(0, 1.32, 0), color=(0.08, 0.88, 0.98))
bpy.ops.mesh.primitive_octahedron_add(radius=0.32, location=(0, 1.32, 0), scale=(0.8, 1.4, 0.3), color=(0.45, 0.22, 0.96))
bpy.ops.mesh.primitive_cone_add(radius1=1.18, radius2=0.04, depth=0.95, vertices=8, location=(0, 2.65, 0), color=(0.82, 0.22, 0.28))

bpy.ops.mesh.auto_ground()
print("Estructura arquitectónica 'Torre & Portal Mágico' generada con éxito!")
`,
  },
  {
    id: 'gen_cyber_sentinel',
    name: 'Generar Centinela Mecha (Nuevo Objeto)',
    category: 'generate',
    description: 'Limpia la escena y modela desde cero un Boss Robot Acorazado con anillos orbitales en Python',
    code: `# GENERAR NUEVO ENEMIGO DESDE CERO: Centinela Mecha Orbital
import bpy
import math

# 1. Limpiar el objeto anterior para construir uno nuevo desde cero
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# 2. Nucleo central blindado (Icosaedro subdividido)
bpy.ops.mesh.primitive_ico_sphere_add(radius=0.72, subdivisions=3, location=(0, 1.45, 0), color=(0.18, 0.22, 0.30))

# 3. Ojo laser energetico central
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.32, location=(0, 1.45, 0.56), color=(0.05, 0.85, 1.0))

# 4. Anillos de contencion gravitacional cruzados (Torus)
bpy.ops.mesh.primitive_torus_add(major_radius=1.18, minor_radius=0.075, location=(0, 1.45, 0), rotation=(0.45, 0.35, 0), color=(0.96, 0.62, 0.05))
bpy.ops.mesh.primitive_torus_add(major_radius=1.35, minor_radius=0.055, location=(0, 1.45, 0), rotation=(-0.55, 0.25, 0.4), color=(0.88, 0.15, 0.35))

# 5. Generar 8 canones/puas flotantes en orbita circular con bucle Python
for i in range(8):
    angle = i * (math.pi * 2 / 8)
    px = math.cos(angle) * 1.55
    py = 1.45 + math.sin(angle) * 1.55
    bpy.ops.mesh.primitive_cone_add(radius1=0.16, depth=0.55, location=(px, py, 0), rotation=(0, 0, angle - math.pi / 2), color=(0.95, 0.20, 0.35))

# 6. Pedestal de propulsores inferiores
bpy.ops.mesh.primitive_cylinder_add(radius=0.45, depth=0.65, location=(0, 0.42, 0), color=(0.25, 0.30, 0.40))

print("Nuevo objeto 'Centinela Mecha Orbital' generado integramente con Python!")
`,
  },
  {
    id: 'gen_elder_dragon',
    name: 'Generar Dragón Serpiente (Nuevo Objeto)',
    category: 'generate',
    description: 'Construye proceduralmente un Dragón / Wyrm con vértebras, cuernos y espinas dorsales',
    code: `# GENERAR NUEVO OBJETO: Wyrm / Dragon Abisal articulado con trigonometria
import bpy
import math

bpy.ops.object.delete()

# 1. Crear 14 segmentos vertebrales en forma de 'S' ascendente
for i in range(14):
    t = i / 13.0
    x = math.sin(t * math.pi * 2.0) * 0.65
    y = 0.35 + t * 2.35
    z = math.cos(t * math.pi * 1.5) * 0.45
    rad = 0.46 * (1.0 - t * 0.42)

    # Alternar colores de escamas entre carmesi y oro
    if i % 2 == 0:
        bpy.ops.mesh.primitive_ico_sphere_add(radius=rad, subdivisions=2, location=(x, y, z), color=(0.88, 0.12, 0.28))
    else:
        bpy.ops.mesh.primitive_ico_sphere_add(radius=rad * 0.92, subdivisions=2, location=(x, y, z), color=(0.18, 0.22, 0.32))

    # Espina dorsal sobre cada vertebra
    bpy.ops.mesh.primitive_cone_add(radius1=rad * 0.38, depth=0.48, location=(x, y + rad * 0.9, z - 0.15), rotation=(-0.4, 0, 0), color=(0.98, 0.75, 0.15))

# 2. Cabeza y cuernos del Dragon en la cima
bpy.ops.mesh.primitive_ico_sphere_add(radius=0.48, subdivisions=2, location=(0, 2.75, 0.28), color=(0.88, 0.12, 0.28))
bpy.ops.mesh.primitive_cone_add(radius1=0.14, depth=0.85, location=(-0.38, 3.15, 0.1), rotation=(-0.3, 0, 0.45), color=(0.98, 0.75, 0.15))
bpy.ops.mesh.primitive_cone_add(radius1=0.14, depth=0.85, location=(0.38, 3.15, 0.1), rotation=(-0.3, 0, -0.45), color=(0.98, 0.75, 0.15))

print("Dragon Wyrm de 14 segmentos generado con exito!")
`,
  },
  {
    id: 'gen_floating_sword',
    name: 'Generar Espada Rúnica & Escudo (Accesorios)',
    category: 'generate',
    description: 'Añade objetos nuevos (Espada colosal, Halo y Cristales) alrededor del personaje actual',
    code: `# AÑADIR NUEVOS OBJETOS AL MODELO ACTUAL (Sin borrar al enemigo)
import bpy
import math

# 1. Halo de poder flotando detras de la espalda
bpy.ops.mesh.primitive_torus_add(major_radius=1.15, minor_radius=0.05, location=(0, 1.85, -0.65), rotation=(0, 0, 0), color=(0.98, 0.75, 0.12))

# 2. Espada Colosal levitando a la derecha del enemigo
# Hoja de la espada (Cubo estilizado)
bpy.ops.mesh.primitive_cube_add(size=1.0, scale=(0.18, 2.15, 0.06), location=(1.85, 1.65, 0.35), rotation=(0, 0, -0.15), color=(0.22, 0.82, 0.98))
# Guarda cruzada
bpy.ops.mesh.primitive_cube_add(size=1.0, scale=(0.72, 0.14, 0.16), location=(1.70, 0.68, 0.35), rotation=(0, 0, -0.15), color=(0.96, 0.65, 0.10))
# Empunadura y pomo
bpy.ops.mesh.primitive_cylinder_add(radius=0.07, depth=0.45, location=(1.64, 0.42, 0.35), rotation=(0, 0, -0.15), color=(0.85, 0.15, 0.25))

# 3. Cristales arcanos orbitando a la izquierda
for i in range(4):
    ang = i * (math.pi / 2)
    cy = 1.2 + i * 0.38
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.18, subdivisions=1, location=(-1.75 + math.cos(ang)*0.2, cy, 0.3 + math.sin(ang)*0.2), color=(0.22, 0.85, 0.98))

print("Espada Colosal, Halo y Cristales añadidos a la escena!")
`,
  },
  {
    id: 'gen_custom_vertices',
    name: 'Crear Malla por Vértices y Caras (from_pydata)',
    category: 'generate',
    description: 'Usa mesh.from_pydata(verts, edges, faces) de Blender para construir un Cristal Obelisco',
    code: `# CREACION MATEMATICA DE GEOMETRIA CON mesh.from_pydata(verts, [], faces)
import bpy

# Limpiar escena para ver el Obelisco Cristalino
bpy.ops.object.delete()

# Definir coordenadas exactas (x, y, z) de los vertices del Obelisco
verts = [
    (0.0, 0.1, 0.0),     # 0: Punta inferior
    (-0.65, 0.6, -0.65), # 1: Base SO
    (0.65, 0.6, -0.65),  # 2: Base SE
    (0.65, 0.6, 0.65),   # 3: Base NE
    (-0.65, 0.6, 0.65),  # 4: Base NO
    (-0.42, 2.2, -0.42), # 5: Corona SO
    (0.42, 2.2, -0.42),  # 6: Corona SE
    (0.42, 2.2, 0.42),   # 7: Corona NE
    (-0.42, 2.2, 0.42),  # 8: Corona NO
    (0.0, 3.05, 0.0)     # 9: Punta superior (Cuspide)
]

# Definir las caras (triangulos y cuadrilateros por indice de vertice)
faces = [
    (0, 2, 1), (0, 3, 2), (0, 4, 3), (0, 1, 4), # Piramide inferior
    (1, 2, 6, 5), (2, 3, 7, 6), (3, 4, 8, 7), (4, 1, 5, 8), # Cuerpo central
    (5, 6, 9), (6, 7, 9), (7, 8, 9), (8, 5, 9)  # Piramide superior
]

# Construir malla en Blender y vincularla a la escena
mesh = bpy.data.meshes.new("Obelisco_Cristal")
mesh.from_pydata(verts, [], faces)
obj = bpy.data.objects.new("Obelisco_Obj", mesh)
bpy.context.collection.objects.link(obj)

# Añadir dos anillos de energia alrededor del obelisco
bpy.ops.mesh.primitive_torus_add(major_radius=1.15, minor_radius=0.05, location=(0, 1.4, 0), rotation=(0.35, 0, 0.25), color=(0.98, 0.68, 0.12))
bpy.ops.mesh.primitive_torus_add(major_radius=0.95, minor_radius=0.04, location=(0, 2.1, 0), rotation=(-0.35, 0, -0.25), color=(0.08, 0.82, 0.98))

print("Obelisco construido desde cero usando verts + faces (from_pydata)!")
`,
  },
  // ============================================================================
  // CATEGORÍA 2: MODIFICACIÓN Y DEFORMACIÓN DE LA MALLA EXISTENTE
  // ============================================================================
  {
    id: 'smooth_round',
    name: 'Redondear & Suavizar Malla Actual',
    category: 'modify',
    description: 'Aplica el operador bpy.ops.mesh.smooth para relajar aristas y redondear caras',
    code: `# Redondear y suavizar toda la geometria activa
import bpy

obj = bpy.context.active_object
print(f"Objeto activo seleccionado: {obj.name}")

# Suavizado laplaciano de vertices estilo Blender
bpy.ops.mesh.smooth(iterations=4, factor=0.55)
print("Geometria redondeada exitosamente. Aristas duras eliminadas.")
`,
  },
  {
    id: 'decimate_50',
    name: 'Reducción de Polígonos (Decimate 50%)',
    category: 'modify',
    description: 'Aplica el modificador Decimate de Blender para reducir a la mitad los triángulos',
    code: `# Reduccion de poligonos manteniendo la silueta exterior
import bpy

# Reducir un 50% de poligonos (ratio=0.5)
bpy.ops.mesh.decimate(ratio=0.5)
print("Modifier Decimate completado: 50% menos de poligonos.")
`,
  },
  {
    id: 'alien_waves',
    name: 'Deformación Ondulatoria Orgánica',
    category: 'modify',
    description: 'Itera sobre mesh.vertices aplicando funciones matemáticas senoidales',
    code: `# Deformacion matematica de vertices con math.sin y math.cos
import bpy
import math

obj = bpy.context.active_object
mesh = obj.data

print(f"Modificando {len(mesh.vertices)} vertices...")

for v in mesh.vertices:
    wave = math.sin(v.co.y * 5.0) * math.cos(v.co.x * 5.0)
    v.co.z += wave * 0.045
    if v.co.y > 0.4:
        v.co.x *= 1.06
        v.co.z *= 1.04

print("Deformacion organica aplicada con exito.")
`,
  },
  {
    id: 'twist_vortex',
    name: 'Torsión en Espiral (Twist Y)',
    category: 'modify',
    description: 'Rota los vértices proporcionalmente a su altura en el eje Y',
    code: `# Torsion angular de la geometria alrededor del eje vertical Y
import bpy

bpy.ops.mesh.twist(angle=0.45, axis='Y')
print("Torsion espiral aplicada al modelo.")
`,
  },
];

// Extender Array.prototype de forma no enumerable para soportar métodos nativos de listas Python (.append, .extend, .clear, .remove, .insert)
function ensurePythonArrayMethods() {
  const proto = Array.prototype as unknown as Record<string, unknown>;
  if (!proto.append) {
    Object.defineProperty(Array.prototype, 'append', {
      value: function (item: unknown) {
        this.push(item);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!proto.extend) {
    Object.defineProperty(Array.prototype, 'extend', {
      value: function (items: unknown[]) {
        if (Array.isArray(items)) this.push(...items);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!proto.clear) {
    Object.defineProperty(Array.prototype, 'clear', {
      value: function () {
        this.length = 0;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!proto.remove) {
    Object.defineProperty(Array.prototype, 'remove', {
      value: function (item: unknown) {
        const idx = this.indexOf(item);
        if (idx !== -1) this.splice(idx, 1);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!proto.insert) {
    Object.defineProperty(Array.prototype, 'insert', {
      value: function (idx: number, item: unknown) {
        this.splice(idx, 0, item);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  // Extender String.prototype de forma no enumerable para soportar métodos nativos de cadenas Python (.format, .strip, .startswith, etc.)
  const strProto = String.prototype as unknown as Record<string, unknown>;
  if (!strProto.format) {
    Object.defineProperty(String.prototype, 'format', {
      value: function (...args: unknown[]) {
        let str = String(this);
        let kw: Record<string, unknown> = {};
        if (
          args.length > 0 &&
          args[args.length - 1] &&
          typeof args[args.length - 1] === 'object' &&
          !Array.isArray(args[args.length - 1])
        ) {
          kw = args[args.length - 1] as Record<string, unknown>;
        }
        let posIdx = 0;
        return str.replace(/\{([^{}]*)\}/g, (match, key) => {
          const trimmed = key.trim();
          if (!trimmed) {
            return posIdx < args.length ? String(args[posIdx++]) : match;
          }
          if (/^\d+$/.test(trimmed)) {
            const idx = parseInt(trimmed, 10);
            return idx < args.length ? String(args[idx]) : match;
          }
          const cleanKey = trimmed.split(':')[0];
          if (cleanKey in kw) return String(kw[cleanKey]);
          return match;
        });
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.strip) {
    Object.defineProperty(String.prototype, 'strip', {
      value: function () {
        return this.trim();
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.lstrip) {
    Object.defineProperty(String.prototype, 'lstrip', {
      value: function () {
        return this.trimStart();
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.rstrip) {
    Object.defineProperty(String.prototype, 'rstrip', {
      value: function () {
        return this.trimEnd();
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.startswith) {
    Object.defineProperty(String.prototype, 'startswith', {
      value: function (prefix: string) {
        return this.startsWith(prefix);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.endswith) {
    Object.defineProperty(String.prototype, 'endswith', {
      value: function (suffix: string) {
        return this.endsWith(suffix);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.capitalize) {
    Object.defineProperty(String.prototype, 'capitalize', {
      value: function () {
        return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.title) {
    Object.defineProperty(String.prototype, 'title', {
      value: function () {
        return this.replace(/\b\w/g, (c: string) => c.toUpperCase());
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.count) {
    Object.defineProperty(String.prototype, 'count', {
      value: function (sub: string) {
        if (!sub) return 0;
        return this.split(sub).length - 1;
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.find) {
    Object.defineProperty(String.prototype, 'find', {
      value: function (sub: string) {
        return this.indexOf(sub);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.rfind) {
    Object.defineProperty(String.prototype, 'rfind', {
      value: function (sub: string) {
        return this.lastIndexOf(sub);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.lower) {
    Object.defineProperty(String.prototype, 'lower', {
      value: function () {
        return this.toLowerCase();
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto.upper) {
    Object.defineProperty(String.prototype, 'upper', {
      value: function () {
        return this.toUpperCase();
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  const pySliceImpl = function (
    this: any,
    start?: number | null,
    stop?: number | null,
    step?: number | null
  ) {
    const isStr = typeof this === 'string';
    const arr = isStr ? this.split('') : Array.isArray(this) ? this : Array.from(this || []);
    const len = arr.length;
    const st = step == null ? 1 : Number(step);
    if (st === 0) return isStr ? '' : [];
    const res: any[] = [];
    if (st > 0) {
      const s = start == null ? 0 : start < 0 ? Math.max(0, len + start) : Math.min(len, start);
      const e = stop == null ? len : stop < 0 ? Math.max(0, len + stop) : Math.min(len, stop);
      for (let i = s; i < e; i += st) res.push(arr[i]);
    } else {
      const s = start == null ? len - 1 : start < 0 ? len + start : Math.min(len - 1, start);
      const e = stop == null ? -1 : stop < 0 ? len + stop : stop;
      for (let i = s; i > e; i += st) {
        if (i >= 0 && i < len) res.push(arr[i]);
      }
    }
    return isStr ? res.join('') : res;
  };
  if (!(Array.prototype as any)._pySlice) {
    Object.defineProperty(Array.prototype, '_pySlice', {
      value: pySliceImpl,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!strProto._pySlice) {
    Object.defineProperty(String.prototype, '_pySlice', {
      value: pySliceImpl,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  // NUNCA extender Object.prototype (rompe los descriptores de Object.defineProperty en React y Web APIs).
  // Asegurar que Object.prototype no contenga get, setdefault ni update.
  if (typeof Object.prototype === 'object' && Object.prototype !== null) {
    if ('get' in Object.prototype) {
      try {
        delete (Object.prototype as any).get;
      } catch (_) {}
    }
    if ('setdefault' in Object.prototype) {
      try {
        delete (Object.prototype as any).setdefault;
      } catch (_) {}
    }
    if ('update' in Object.prototype) {
      try {
        delete (Object.prototype as any).update;
      } catch (_) {}
    }
  }

  // Extender Set.prototype para métodos nativos de sets de Python (.discard, .remove, .update)
  const setProto = Set.prototype as unknown as Record<string, unknown>;
  if (!setProto.discard) {
    Object.defineProperty(Set.prototype, 'discard', {
      value: function (val: any) {
        this.delete(val);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!setProto.remove) {
    Object.defineProperty(Set.prototype, 'remove', {
      value: function (val: any) {
        this.delete(val);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  if (!setProto.update) {
    Object.defineProperty(Set.prototype, 'update', {
      value: function (items: any) {
        if (items && Symbol.iterator in Object(items)) {
          for (const it of items) this.add(it);
        }
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

/**
 * Convierte un parámetro de color Python `(r, g, b)`, `(r, g, b, a)` o `'#hex'` en `THREE.Color`.
 */
function parsePythonColor(
  colInput?: number[] | string | { r?: number; g?: number; b?: number },
  fallbackHex: string = '#e11d48'
): THREE.Color {
  if (!colInput) return new THREE.Color(fallbackHex);
  if (typeof colInput === 'string') return new THREE.Color(colInput);
  if (Array.isArray(colInput) && colInput.length >= 3) {
    const [r, g, b] = colInput;
    if (r > 1.05 || g > 1.05 || b > 1.05) {
      return new THREE.Color(r / 255, g / 255, b / 255);
    }
    return new THREE.Color(
      Math.max(0, Math.min(1, Number(r) || 0)),
      Math.max(0, Math.min(1, Number(g) || 0)),
      Math.max(0, Math.min(1, Number(b) || 0))
    );
  }
  if (typeof colInput === 'object' && 'r' in colInput) {
    return new THREE.Color(
      Number(colInput.r) || 0,
      Number(colInput.g) || 0,
      Number(colInput.b) || 0
    );
  }
  return new THREE.Color(fallbackHex);
}

/**
 * Configura cualquier nueva malla creada por Python con todos los materiales del estudio.
 */
export interface ExtendedPBRMaterialProps {
  /** Id de una textura de imagen (incluida o "Mis texturas") usada como mapa de color */
  colorMapId?: string | null;
  /** Metros que ocupa una repetición de la imagen */
  colorMapTileMeters?: number;
  /** Vistas de una hoja de fotos que se proyectan sobre la malla (en vez de repetir la imagen) */
  colorMapViews?: PhotoView[] | null;
  /** El script usa Z hacia arriba (las vistas van en metros del script) */
  colorMapZUp?: boolean;
  metallic?: number;
  roughness?: number;
  emissionColor?: THREE.Color | null;
  emissionStrength?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  anisotropy?: number;
  anisotropyRotation?: number;
  transmission?: number;
  ior?: number;
  alpha?: number;
  bumpScale?: number;
  useNoiseBump?: boolean;
  useBackfaceCulling?: boolean;
  flipNormals?: boolean;
  customGradientMap?: THREE.DataTexture | null;
  preferPhysicalShader?: boolean;
  texturePattern?: TexturePatternType;
  textureRepeat?: number;
  textureNaturalColor?: boolean;
}

let cachedNoiseBumpTexture: THREE.DataTexture | null = null;
function getProceduralNoiseBumpTexture(): THREE.DataTexture {
  if (cachedNoiseBumpTexture) return cachedNoiseBumpTexture;
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const n1 = Math.sin(x * 0.37 + Math.cos(y * 0.41) * 3.1);
      const n2 = Math.cos(y * 0.53 - Math.sin(x * 0.29) * 2.7);
      const n3 = Math.sin((x + y) * 0.83) * 0.5;
      const val = Math.max(0, Math.min(255, Math.floor(((n1 + n2 + n3) / 2.5 * 0.5 + 0.5) * 255)));
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.needsUpdate = true;
  cachedNoiseBumpTexture = tex;
  return tex;
}

function configureNewlySpawnedMesh(
  mesh: THREE.Mesh,
  baseColor: THREE.Color,
  gradientTexture: THREE.DataTexture,
  outlineThickness: number = 1.25,
  outlineOpacity: number = 0.9,
  pbrProps?: ExtendedPBRMaterialProps
): void {
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  prepareGeometryNormals(mesh);

  const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute;
  if (posAttr) {
    mesh.userData.initialPositions = new Float32Array(posAttr.array);
  }
  mesh.userData.undoStack = [] as Float32Array[];

  const baseRough = pbrProps?.roughness ?? 0.38;
  const baseMetal = pbrProps?.metallic ?? 0.2;
  mesh.userData.originalColorHex = `#${baseColor.getHexString()}`;
  mesh.userData.baseRoughness = baseRough;
  mesh.userData.baseMetalness = baseMetal;
  mesh.userData.baseClearcoat = pbrProps?.clearcoat;
  mesh.userData.baseIor = pbrProps?.ior ?? 1.5;
  // Transparencia propia del script (cristal, agua...): la conservan los efectos globales de la app
  mesh.userData.baseTransmission = pbrProps?.transmission ?? 0;
  mesh.userData.baseAlpha = pbrProps?.alpha ?? 1;

  const stdMat = new THREE.MeshPhysicalMaterial({
    color: baseColor.clone(),
    roughness: baseRough,
    metalness: baseMetal,
    clearcoat: pbrProps?.clearcoat ?? 0,
    clearcoatRoughness: pbrProps?.clearcoatRoughness ?? 0.08,
    anisotropy: pbrProps?.anisotropy ?? 0,
    anisotropyRotation: pbrProps?.anisotropyRotation ?? 0,
    transmission: pbrProps?.transmission ?? 0,
    ior: pbrProps?.ior ?? 1.45,
    ...(pbrProps?.emissionColor && (pbrProps.emissionStrength ?? 0) > 0
      ? {
          emissive: pbrProps.emissionColor.clone(),
          emissiveIntensity: Math.min(2.5, (pbrProps.emissionStrength ?? 1) * 0.35),
        }
      : {}),
  });

  const eeveeMaterial = new THREE.MeshPhysicalMaterial({
    color: baseColor.clone(),
    roughness: Math.max(0.03, baseRough * 0.92),
    metalness: baseMetal,
    clearcoat: pbrProps?.clearcoat ?? 0.12,
    clearcoatRoughness: pbrProps?.clearcoatRoughness ?? 0.1,
    anisotropy: pbrProps?.anisotropy ?? 0,
    anisotropyRotation: pbrProps?.anisotropyRotation ?? 0,
    transmission: pbrProps?.transmission ?? 0,
    ior: pbrProps?.ior ?? 1.45,
    reflectivity: 0.78,
    envMapIntensity: 1.55,
    ...(pbrProps?.emissionColor && (pbrProps.emissionStrength ?? 0) > 0
      ? {
          emissive: pbrProps.emissionColor.clone(),
          emissiveIntensity: Math.min(2.5, (pbrProps.emissionStrength ?? 1) * 0.38),
        }
      : {}),
  });

  const defaultCyclesClearcoat =
    pbrProps?.clearcoat !== undefined
      ? pbrProps.clearcoat
      : Math.max(0, (1.0 - baseRough * 0.7) * 0.55);

  const cyclesMaterial = new THREE.MeshPhysicalMaterial({
    color: baseColor.clone(),
    roughness: Math.max(0.02, baseRough * 0.75),
    metalness: Math.min(1.0, baseMetal + 0.05),
    clearcoat: defaultCyclesClearcoat,
    clearcoatRoughness: pbrProps?.clearcoatRoughness ?? 0.06,
    anisotropy: pbrProps?.anisotropy ?? 0,
    anisotropyRotation: pbrProps?.anisotropyRotation ?? 0,
    transmission: pbrProps?.transmission ?? 0,
    ior: pbrProps?.ior ?? 1.5,
    reflectivity: 0.95,
    specularIntensity: 1.0,
    sheen: 0.25,
    sheenRoughness: 0.35,
    sheenColor: baseColor.clone().lerp(new THREE.Color(0xffffff), 0.5),
    envMapIntensity: 1.9,
    ...(pbrProps?.emissionColor && (pbrProps.emissionStrength ?? 0) > 0
      ? {
          emissive: pbrProps.emissionColor.clone(),
          emissiveIntensity: Math.min(2.8, (pbrProps.emissionStrength ?? 1) * 0.4),
        }
      : {}),
  });

  const toonMaterial = new THREE.MeshToonMaterial({
    color: baseColor.clone(),
    gradientMap: pbrProps?.customGradientMap || gradientTexture,
    ...(pbrProps?.emissionColor && (pbrProps.emissionStrength ?? 0) > 0
      ? {
          emissive: pbrProps.emissionColor.clone(),
          emissiveIntensity: Math.min(1.5, (pbrProps.emissionStrength ?? 1) * 0.22),
        }
      : {}),
  });

  const matcapMaterial = new THREE.MeshMatcapMaterial({
    matcap: getProceduralMatcapTexture('clay'),
    color: new THREE.Color(0xffffff),
  });

  const normalDebugMaterial = new THREE.MeshNormalMaterial({
    flatShading: false,
  });

  mesh.userData.originalMaterial = stdMat;
  mesh.userData.toonMaterial = toonMaterial;
  mesh.userData.eeveeMaterial = eeveeMaterial;
  mesh.userData.cyclesMaterial = cyclesMaterial;
  mesh.userData.matcapMaterial = matcapMaterial;
  mesh.userData.normalDebugMaterial = normalDebugMaterial;
  mesh.userData.pbrProps = { ...(pbrProps || {}) };
  mesh.material = pbrProps?.preferPhysicalShader ? stdMat : toonMaterial;

  // Evitar duplicar outlineMesh si ya tiene uno
  const existingOutline = mesh.children.find((c) => c.userData?.isOutlineMesh);
  if (existingOutline) {
    mesh.remove(existingOutline);
  }

  // Con el grosor por defecto (1,25 unidades) el contorno engorda cada pieza en metros: un león
  // de 2,8 m se cubría de manchas negras. Para ese caso se limita al 3 % del tamaño de la pieza
  // (las piezas de más de 41 m siguen con 1,25 como antes).
  let grosorContorno = outlineThickness;
  if (outlineThickness === 1.25) {
    mesh.geometry.computeBoundingBox();
    const caja = mesh.geometry.boundingBox;
    if (caja) {
      const tamano = Math.max(caja.max.x - caja.min.x, caja.max.y - caja.min.y, caja.max.z - caja.min.z);
      grosorContorno = Math.min(1.25, 0.03 * tamano);
    }
  }
  const outlineMat = createComicOutlineMaterial(grosorContorno, outlineOpacity);
  const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
  outlineMesh.name = `${mesh.name}_outline`;
  outlineMesh.userData.isOutlineMesh = true;
  outlineMesh.castShadow = false;
  outlineMesh.receiveShadow = false;
  mesh.add(outlineMesh);
  mesh.userData.outlineMesh = outlineMesh;
}

/**
 * Actualiza el color y propiedades PBR avanzadas (Clearcoat, Anisotropy, Transmission, Alpha, BumpMap) y Toon de una malla en Three.js.
 */
function applyMaterialToThreeMesh(
  mesh: THREE.Mesh,
  color: THREE.Color,
  metallic: number = 0.2,
  roughness: number = 0.38,
  emissionColor?: THREE.Color | null,
  emissionStrength: number = 0,
  extraPbr?: ExtendedPBRMaterialProps
) {
  // Las superficies de agua (bpy.anim.agua) usan un shader propio y no reciben colores de material
  if ((mesh.material as THREE.Material).type === 'ShaderMaterial') return;

  const texPattern =
    extraPbr?.texturePattern && extraPbr.texturePattern !== 'none'
      ? extraPbr.texturePattern
      : undefined;
  const texRepeat = extraPbr?.textureRepeat ?? 2;
  const useNatColor = extraPbr?.textureNaturalColor ?? false;
  const texPreset = texPattern ? getTexturePresetInfo(texPattern) : null;

  const baseInputColor =
    emissionColor && emissionStrength > 0.5
      ? color.clone().lerp(emissionColor, 0.65)
      : color.clone();

  const effectiveColor =
    texPattern && useNatColor ? new THREE.Color('#ffffff') : baseInputColor;

  const procColorMap = texPattern
    ? generateProceduralTexture(
        texPattern,
        useNatColor ? 'auto' : '#ffffff',
        texRepeat
      )
    : null;
  const procBumpMap = texPattern
    ? generateProceduralBumpTexture(texPattern, texRepeat)
    : extraPbr?.useNoiseBump
    ? getProceduralNoiseBumpTexture()
    : null;
  const procBumpScale = texPattern
    ? (extraPbr?.bumpScale ?? texPreset?.pbr.bumpScale ?? 0.045)
    : extraPbr?.useNoiseBump
    ? (extraPbr?.bumpScale ?? 0.035)
    : 0;

  if (texPattern) {
    mesh.userData.hasPerMeshTexture = true;
    mesh.userData.originalMap = procColorMap;
    mesh.userData.originalBumpMap = procBumpMap;
    mesh.userData.originalBumpScale = procBumpScale;
  }

  // Mapa de color con imagen: tiene prioridad sobre el procedural y se proyecta en metros
  const imageSet = extraPbr?.colorMapId ? getColorMapSet(extraPbr.colorMapId) : null;
  const imageColorMap = imageSet?.color ?? null;
  if (extraPbr?.colorMapId && !imageColorMap) {
    console.warn(`Textura de imagen "${extraPbr.colorMapId}" no cargada; se usa el color base.`);
  }
  const hadImageMap = Boolean(mesh.userData.imageMapApplied);
  if (imageColorMap) {
    mesh.userData.hasPerMeshTexture = true;
    mesh.userData.originalMap = imageColorMap;
    mesh.userData.originalBumpMap = null;
    mesh.userData.originalBumpScale = 0;
    mesh.userData.originalNormalMap = imageSet?.normal ?? null;
    mesh.userData.originalRoughnessMap = imageSet?.roughness ?? null;
    mesh.updateMatrix();
    const views = extraPbr?.colorMapViews;
    const img = imageColorMap.image as { width?: number; height?: number } | undefined;
    if (views && views.length > 0 && img?.width && img?.height) {
      // Fotos de una hoja de vistas: cada triángulo toma la vista que mejor lo ve
      const newGeo = applyPhotoViewsUv(
        mesh.geometry as THREE.BufferGeometry,
        mesh.matrix,
        views,
        img.width,
        img.height,
        Boolean(extraPbr?.colorMapZUp)
      );
      if (newGeo !== mesh.geometry) {
        mesh.geometry = newGeo;
        if (mesh.userData.outlineMesh) (mesh.userData.outlineMesh as THREE.Mesh).geometry = newGeo;
        mesh.userData.initialPositions = new Float32Array(newGeo.attributes.position.array);
      }
    } else {
      applyBoxProjectedUv(
        mesh.geometry as THREE.BufferGeometry,
        mesh.matrix,
        extraPbr?.colorMapTileMeters ?? 3
      );
    }
  } else if (hadImageMap) {
    // El script quitó el mapa de imagen: vuelve al procedural (o al color base)
    mesh.userData.hasPerMeshTexture = Boolean(texPattern);
    mesh.userData.originalMap = procColorMap;
    mesh.userData.originalBumpMap = procBumpMap;
    mesh.userData.originalBumpScale = procBumpScale;
    mesh.userData.originalNormalMap = null;
    mesh.userData.originalRoughnessMap = null;
  }
  mesh.userData.imageMapApplied = Boolean(imageColorMap);
  // ¿El mapa por malla ya trae su propio color? (imagen o patrón con color natural). Si no, la app debe
  // conservar el color base del material para teñir el patrón, como hace Blender.
  mesh.userData.perMeshMapHasColor = Boolean(imageColorMap) || Boolean(texPattern && useNatColor);

  const resolvedRough =
    texPreset && roughness === 0.38 ? texPreset.pbr.roughness : roughness;
  const resolvedMetal =
    texPreset && metallic === 0.2 ? texPreset.pbr.metalness : metallic;
  const resolvedClearcoat =
    extraPbr?.clearcoat !== undefined
      ? extraPbr.clearcoat
      : texPreset
      ? texPreset.pbr.clearcoat
      : undefined;
  const resolvedIor =
    extraPbr?.ior !== undefined
      ? extraPbr.ior
      : texPreset
      ? texPreset.pbr.ior
      : undefined;
  const resolvedTrans =
    extraPbr?.transmission !== undefined
      ? extraPbr.transmission
      : texPreset?.pbr.transmission ?? 0;

  const alphaVal = extraPbr?.alpha !== undefined ? Math.max(0.05, Math.min(1, extraPbr.alpha)) : 1.0;
  const transVal = Math.max(0, Math.min(1, resolvedTrans));
  const isTransparent = alphaVal < 0.99 || transVal > 0.05;
  const sideMode = extraPbr?.flipNormals
    ? THREE.BackSide
    : isTransparent
    ? THREE.DoubleSide
    : THREE.FrontSide;

  const stdMat = mesh.userData.originalMaterial as THREE.MeshPhysicalMaterial | undefined;
  if (stdMat) {
    stdMat.color.copy(imageColorMap ? new THREE.Color('#ffffff') : effectiveColor);
    stdMat.metalness = Math.max(0, Math.min(1, resolvedMetal));
    stdMat.roughness = Math.max(0.03, Math.min(1, resolvedRough));
    if (resolvedClearcoat !== undefined) {
      stdMat.clearcoat = Math.max(0, Math.min(1, resolvedClearcoat));
    }
    if (extraPbr?.clearcoatRoughness !== undefined) {
      stdMat.clearcoatRoughness = Math.max(0.01, Math.min(1, extraPbr.clearcoatRoughness));
    }
    if (extraPbr?.anisotropy !== undefined && 'anisotropy' in stdMat) {
      (stdMat as any).anisotropy = Math.max(0, Math.min(1, extraPbr.anisotropy));
    }
    if (extraPbr?.anisotropyRotation !== undefined && 'anisotropyRotation' in stdMat) {
      (stdMat as any).anisotropyRotation = Number(extraPbr.anisotropyRotation) || 0;
    }
    stdMat.transmission = transVal;
    if (resolvedIor !== undefined) {
      stdMat.ior = Math.max(1.0, Math.min(2.5, resolvedIor));
    }
    stdMat.transparent = isTransparent;
    stdMat.opacity = isTransparent ? Math.min(alphaVal, 1.0 - transVal * 0.55) : 1.0;
    stdMat.side = sideMode;

    // Normal y rugosidad del mapa de imagen (la rugosidad del mapa sustituye al valor fijo)
    stdMat.normalMap = imageSet?.normal ?? null;
    stdMat.roughnessMap = imageSet?.roughness ?? null;
    if (imageSet?.roughness) stdMat.roughness = 1.0;
    if (imageColorMap || procColorMap || hadImageMap) {
      stdMat.map = imageColorMap ?? procColorMap ?? null;
    }
    if (procBumpMap) {
      stdMat.bumpMap = procBumpMap;
      stdMat.bumpScale = procBumpScale;
    }

    if (emissionColor && emissionStrength > 0) {
      stdMat.emissive.copy(emissionColor);
      stdMat.emissiveIntensity = Math.min(2.5, emissionStrength * 0.3);
    }
    stdMat.needsUpdate = true;
  }

  const clampedRough = Math.max(0.03, Math.min(1, resolvedRough));
  const clampedMetal = Math.max(0, Math.min(1, resolvedMetal));
  mesh.userData.originalColorHex = `#${baseInputColor.getHexString()}`;
  mesh.userData.baseRoughness = clampedRough;
  mesh.userData.baseMetalness = clampedMetal;
  if (resolvedClearcoat !== undefined) {
    mesh.userData.baseClearcoat = Math.max(0, Math.min(1, resolvedClearcoat));
  }
  if (resolvedIor !== undefined) {
    mesh.userData.baseIor = Math.max(1.0, Math.min(2.5, resolvedIor));
  }
  mesh.userData.baseTransmission = transVal;
  mesh.userData.baseAlpha = alphaVal;

  const eeveeMat = mesh.userData.eeveeMaterial as THREE.MeshPhysicalMaterial | undefined;
  if (eeveeMat) {
    eeveeMat.color.copy(effectiveColor);
    eeveeMat.metalness = clampedMetal;
    eeveeMat.roughness = Math.max(0.03, clampedRough * 0.92);
    if (resolvedClearcoat !== undefined) {
      eeveeMat.clearcoat = Math.max(0, Math.min(1, resolvedClearcoat));
    } else {
      eeveeMat.clearcoat = Math.max(0, (1.0 - clampedRough) * 0.25);
    }
    if (extraPbr?.clearcoatRoughness !== undefined) {
      eeveeMat.clearcoatRoughness = Math.max(0.01, Math.min(1, extraPbr.clearcoatRoughness));
    }
    if (extraPbr?.anisotropy !== undefined && 'anisotropy' in eeveeMat) {
      (eeveeMat as any).anisotropy = Math.max(0, Math.min(1, extraPbr.anisotropy));
    }
    if (extraPbr?.anisotropyRotation !== undefined && 'anisotropyRotation' in eeveeMat) {
      (eeveeMat as any).anisotropyRotation = Number(extraPbr.anisotropyRotation) || 0;
    }
    eeveeMat.transmission = transVal;
    eeveeMat.ior = Math.max(1.0, Math.min(2.5, resolvedIor ?? 1.45));
    eeveeMat.transparent = isTransparent;
    eeveeMat.opacity = isTransparent ? Math.min(alphaVal, 1.0 - transVal * 0.55) : 1.0;
    eeveeMat.side = sideMode;
    if (imageColorMap) {
      // Imagen (o fotos proyectadas): el color sale de la imagen, sin teñir
      eeveeMat.map = imageColorMap;
      eeveeMat.color.set(0xffffff);
      eeveeMat.normalMap = imageSet?.normal ?? null;
    } else if (procColorMap) {
      eeveeMat.map = procColorMap;
    }
    if (procBumpMap) {
      eeveeMat.bumpMap = procBumpMap;
      eeveeMat.bumpScale = procBumpScale;
    }
    if (emissionColor && emissionStrength > 0) {
      eeveeMat.emissive.copy(emissionColor);
      eeveeMat.emissiveIntensity = Math.min(2.5, emissionStrength * 0.35);
    }
    eeveeMat.needsUpdate = true;
  }

  const cyclesMat = mesh.userData.cyclesMaterial as THREE.MeshPhysicalMaterial | undefined;
  if (cyclesMat) {
    cyclesMat.color.copy(effectiveColor);
    cyclesMat.metalness = clampedMetal;
    cyclesMat.roughness = Math.max(0.02, Math.min(1, clampedRough * 0.78));
    cyclesMat.clearcoat =
      resolvedClearcoat !== undefined
        ? Math.max(0, Math.min(1, resolvedClearcoat))
        : Math.max(0, (1.0 - clampedRough * 0.7) * 0.55);
    cyclesMat.clearcoatRoughness = Math.max(0.01, Math.min(1, extraPbr?.clearcoatRoughness ?? 0.06));
    if (extraPbr?.anisotropy !== undefined && 'anisotropy' in cyclesMat) {
      (cyclesMat as any).anisotropy = Math.max(0, Math.min(1, extraPbr.anisotropy));
    }
    if (extraPbr?.anisotropyRotation !== undefined && 'anisotropyRotation' in cyclesMat) {
      (cyclesMat as any).anisotropyRotation = Number(extraPbr.anisotropyRotation) || 0;
    }
    cyclesMat.transmission = transVal;
    cyclesMat.ior = Math.max(1.0, Math.min(2.5, resolvedIor ?? 1.5));
    cyclesMat.sheenColor = effectiveColor.clone().lerp(new THREE.Color(0xffffff), 0.5);
    cyclesMat.transparent = isTransparent;
    cyclesMat.opacity = isTransparent ? Math.min(alphaVal, 1.0 - transVal * 0.5) : 1.0;
    cyclesMat.side = sideMode;
    if (imageColorMap) {
      // Imagen (o fotos proyectadas): el color sale de la imagen, sin teñir
      cyclesMat.map = imageColorMap;
      cyclesMat.color.set(0xffffff);
      cyclesMat.normalMap = imageSet?.normal ?? null;
    } else if (procColorMap) {
      cyclesMat.map = procColorMap;
    }
    if (procBumpMap) {
      cyclesMat.bumpMap = procBumpMap;
      cyclesMat.bumpScale = procBumpScale * 1.15;
    }
    if (emissionColor && emissionStrength > 0) {
      cyclesMat.emissive.copy(emissionColor);
      cyclesMat.emissiveIntensity = Math.min(2.8, emissionStrength * 0.38);
    }
    cyclesMat.needsUpdate = true;
  }

  const toonMat = mesh.userData.toonMaterial as THREE.MeshToonMaterial | undefined;
  if (toonMat) {
    toonMat.color.copy(effectiveColor);
    toonMat.transparent = isTransparent;
    toonMat.opacity = isTransparent ? Math.min(alphaVal, 1.0 - transVal * 0.6) : 1.0;
    toonMat.side = sideMode;
    if (extraPbr?.customGradientMap) {
      toonMat.gradientMap = extraPbr.customGradientMap;
    }
    if (imageColorMap) {
      // Imagen (o fotos proyectadas): el color sale de la imagen, sin teñir
      toonMat.map = imageColorMap;
      toonMat.color.set(0xffffff);
    } else if (procColorMap) {
      toonMat.map = procColorMap;
    }
    if (procBumpMap) {
      toonMat.bumpMap = procBumpMap;
      toonMat.bumpScale = procBumpScale;
    }
    if (emissionColor && emissionStrength > 0) {
      toonMat.emissive.copy(emissionColor);
      toonMat.emissiveIntensity = Math.min(1.5, emissionStrength * 0.22);
    }
    toonMat.needsUpdate = true;
  }

  // Si el material usa Clearcoat alto, Anisotropía, Transmisión o Metálico alto (y no tiene un ColorRamp Toon explícito),
  // activamos el MeshPhysicalMaterial en la malla para que el barniz, cristal o metal cepillado brillen en 3D
  const wantsPhysical =
    !extraPbr?.customGradientMap &&
    ((resolvedClearcoat ?? 0) > 0.15 ||
      (extraPbr?.anisotropy ?? 0) > 0.15 ||
      transVal > 0.1 ||
      clampedMetal > 0.72);

  if (wantsPhysical && stdMat) {
    mesh.material = stdMat;
  } else if (extraPbr?.customGradientMap && toonMat) {
    mesh.material = toonMat;
  } else {
    const activeMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (activeMat && 'color' in activeMat) {
      (activeMat as THREE.MeshStandardMaterial).color.copy(effectiveColor);
    }
  }

  // Si es una malla de contorno manual (flipNormals + negro), ocultar su outlineMesh hijo para no duplicar bordes
  if (extraPbr?.flipNormals && mesh.userData.outlineMesh) {
    (mesh.userData.outlineMesh as THREE.Mesh).visible = false;
    (mesh.userData.outlineMesh as THREE.Mesh).userData.wantVisible = false;
  }

  mesh.userData.pbrProps = {
    ...(mesh.userData.pbrProps || {}),
    metallic: clampedMetal,
    roughness: clampedRough,
    emissionColor,
    emissionStrength,
    ...(extraPbr || {}),
  };
}

/**
 * Detecta automáticamente si un script de Python fue creado para Blender 5.2 estándar (Eje Z arriba)
 * o para el Estudio Nativo (Eje Y arriba).
 */
export function detectBlenderZUpScript(script: string): boolean {
  // 1. Etiquetas explícitas de modo de ejes inyectadas por el asistente o el usuario
  if (/#\s*COORD_MODE\s*:\s*Z_UP/i.test(script)) return true;
  if (/#\s*COORD_MODE\s*:\s*Y_UP/i.test(script)) return false;

  // 2. Presets nativos históricos Y-Up del estudio
  if (
    script.includes('Centinela Mecha Orbital') ||
    script.includes('Wyrm / Dragon Abisal articulado') ||
    script.includes('AÑADIR NUEVOS OBJETOS AL MODELO ACTUAL') ||
    script.includes('Obelisco_Cristal')
  ) {
    return false;
  }

  // 3. Señales inequívocas de scripts Blender 4.x / 5.2 (Z-Up)
  if (
    /Principled BSDF|ShaderNode|bpy\.data\.materials|use_nodes|active_material|diffuse_color|rotation_euler|modifiers\.new|modifier_add|shade_smooth|shade_auto_smooth|bmesh|mathutils|transform_apply|mode_set|origin_set|v\.co\.z/i.test(
      script
    )
  ) {
    return true;
  }

  // 4. Analizar tuplas location=(x, y, z): si varias tienen z > 0.35 con y cerca de 0, es Z-Up; si y > 0.35 con z cerca de 0, es Y-Up
  const locMatches = [
    ...script.matchAll(/location\s*=\s*[\(\[]\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*[\)\]]/g),
  ];
  if (locMatches.length >= 1) {
    let zUpScore = 0;
    let yUpScore = 0;
    for (const m of locMatches) {
      const yVal = parseFloat(m[2]);
      const zVal = parseFloat(m[3]);
      if (zVal > 0.25 && Math.abs(yVal) < 0.25) zUpScore += 2;
      else if (zVal > Math.abs(yVal) * 1.35 && zVal > 0.4) zUpScore += 1;
      if (yVal > 0.25 && Math.abs(zVal) < 0.25) yUpScore += 2;
      else if (yVal > Math.abs(zVal) * 1.35 && yVal > 0.4) yUpScore += 1;
    }
    if (zUpScore !== yUpScore) return zUpScore > yUpScore;
  }

  // 5. Por defecto en Blender 5.2 bpy, si usa bpy.ops.mesh o from_pydata sin señales de Y-Up, usar Z-Up estándar de Blender
  if (/from_pydata|bpy\.context\.collection\.objects\.link/i.test(script)) {
    return true;
  }

  return false;
}

/**
 * Detecta si un bloque de texto pegado por el usuario es código Python de Blender (`bpy`).
 */
export function isLikelyBlenderPythonCode(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const t = raw.trim();
  if (t.length < 12) return false;
  return (
    /\bimport\s+(?:bpy|bmesh|mathutils)\b/.test(t) ||
    /\bfrom\s+(?:mathutils|bpy|bmesh)\s+import\b/.test(t) ||
    /\bbpy\.(?:ops|data|context)\b/.test(t) ||
    /```(?:python|py)\b/i.test(t) ||
    (/\bdef\s+[a-zA-Z_]\w*\s*\(/.test(t) && /\b(?:bpy|bmesh|location|primitive_)\b/.test(t))
  );
}

/**
 * Extrae y limpia bloques de código pegados directamente desde Gemini Web, ChatGPT, Claude o tutoriales.
 * Normaliza espacios no separables (\u00A0), comillas tipográficas, tabuladores y cabeceras/pies de interfaz web.
 */
export function stripMarkdownCodeFences(raw: string): string {
  // 1. Normalizar saltos de línea, espacios invisibles y comillas curvas de páginas web
  let normalized = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  // 2. Si contiene bloques ```python ... ```, extraer todos los bloques de código y unirlos
  const fenceMatches = [...normalized.matchAll(/```(?:python|py|blender)?\s*\n([\s\S]*?)```/gi)];
  if (fenceMatches.length > 0) {
    normalized = fenceMatches.map((m) => m[1]).join('\n\n');
  } else {
    normalized = normalized
      .replace(/^\s*```(?:python|py|blender)?\s*$/gim, '')
      .replace(/^\s*```\s*$/gm, '');
  }

  // 3. Limpiar líneas residuales de botones de "Copiar código" de interfaces web (Gemini Web / ChatGPT)
  const webUiArtifacts =
    /^(?:python|py|blender|copiar\s+c[oó]digo|copy\s+code|content_copy|expand_more|expand_less|usa\s+el\s+c[oó]digo\s+con\s+precauci[oó]n\.?|use\s+code\s+with\s+caution\.?|c[oó]digo\s+python)$/i;

  const lines = normalized.split('\n');
  // Si el usuario copió texto explicativo antes de `import bpy`, recortar el preámbulo conversacional
  // Un script puede empezar directamente por una clase, un decorador, una asignación o un bucle
  // (sin `import bpy`); si no se reconoce, se descartaría todo lo que hay antes del primer `def`/`import`.
  const firstCodeIdx = lines.findIndex((l) => {
    const t = l.trim();
    return (
      /^import\s+(?:bpy|bmesh|math|random|numpy)/.test(t) ||
      /^from\s+(?:mathutils|math|random|bpy)/.test(t) ||
      /^bpy\.(?:ops|data|context)/.test(t) ||
      /^#/.test(t) ||
      /^def\s+[a-zA-Z_]/.test(t) ||
      /^class\s+[a-zA-Z_]\w*\s*(?:\([^)]*\))?\s*:$/.test(t) ||
      /^@[a-zA-Z_]\w*\s*(?:\(.*\))?$/.test(t) ||
      /^for\s+[a-zA-Z_]\w*\s+in\s+.+:$/.test(t) ||
      /^with\s+bpy\.[\w.]+\(.*\)\s*:$/.test(t) ||
      /^try\s*:$/.test(t) ||
      /^[a-zA-Z_][\w.\[\]'"]*\s*[+\-*/]?=(?!=)\s*\S/.test(t)
    );
  });

  const relevantLines = firstCodeIdx > 0 ? lines.slice(firstCodeIdx) : lines;

  return relevantLines
    .filter((line) => !webUiArtifacts.test(line.trim()))
    // Convertir tabuladores en 4 espacios para que el cálculo de indentación sea exacto
    .map((line) => line.replace(/\t/g, '    '))
    .join('\n')
    .trim();
}

/**
 * Elimina docstrings multilínea `"""..."""` y `'''...'''` y comentarios `# ...` respetando strings literales
 * y conservando el número exacto de saltos de línea para que los números de línea coincidan 1:1 con el script original.
 */
function stripPythonCommentsAndDocstrings(code: string): string {
  const preserveNewlines = (match: string, prefix: string = '') => {
    const nlCount = (match.match(/\n/g) || []).length;
    return prefix + '\n'.repeat(nlCount);
  };

  // 1. Reemplazar docstrings triple-comilla conservando sus saltos de línea (\n)
  const withoutDocstrings = code
    .replace(/=\s*[rRfFbBuU]{0,2}"""[\s\S]*?"""/g, (m) => preserveNewlines(m, '= ""'))
    .replace(/=\s*[rRfFbBuU]{0,2}'''[\s\S]*?'''/g, (m) => preserveNewlines(m, "= ''"))
    .replace(/[rRfFbBuU]{0,2}"""[\s\S]*?"""/g, (m) => preserveNewlines(m, ''))
    .replace(/[rRfFbBuU]{0,2}'''[\s\S]*?'''/g, (m) => preserveNewlines(m, ''));

  // 2. Eliminar comentarios # fuera de strings
  return withoutDocstrings
    .split('\n')
    .map((line) => {
      let inStr: string | null = null;
      let cleaned = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inStr) {
          cleaned += ch;
          if (ch === inStr && line[i - 1] !== '\\') inStr = null;
        } else {
          if (ch === '"' || ch === "'" || ch === '`') {
            inStr = ch;
            cleaned += ch;
          } else if (ch === '#') {
            break;
          } else {
            cleaned += ch;
          }
        }
      }
      return cleaned;
    })
    .join('\n');
}

/**
 * Convierte f-strings (`f"..."`, `f'...'`, `rf"..."`) y raw strings (`r"..."`, `b"..."`) de forma consciente
 * del estado de cadenas, evitando corromper strings normales que terminan en la letra 'f' (ej. `"Subsurf"`).
 */
function convertPythonFStringsAndRawStrings(code: string): string {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : '';
    const isStartOfToken = i === 0 || !/[a-zA-Z0-9_$"']/.test(prev);

    if (isStartOfToken) {
      // Detectar prefijos f/r/b combinados: f", f', rf", fr", r", r', b", b'
      const sub2 = code.slice(i, i + 3);
      const sub1 = code.slice(i, i + 2);
      let prefixLen = 0;
      let isFString = false;
      let quoteChar = '';

      if (/^(?:rf|fr|RF|FR|rF|Rf)["']/.test(sub2)) {
        prefixLen = 2;
        isFString = true;
        quoteChar = sub2[2];
      } else if (/^[fF]["']/.test(sub1)) {
        prefixLen = 1;
        isFString = true;
        quoteChar = sub1[1];
      } else if (/^[rRbBuU]["']/.test(sub1)) {
        prefixLen = 1;
        isFString = false;
        quoteChar = sub1[1];
      }

      if (prefixLen > 0 && quoteChar) {
        let cursor = i + prefixLen + 1;
        let inner = '';
        while (cursor < code.length) {
          const c = code[cursor];
          if (c === quoteChar && code[cursor - 1] !== '\\') {
            cursor++;
            break;
          }
          inner += c;
          cursor++;
        }
        if (isFString) {
          const tplInner = inner
            .replace(/`/g, '\\`')
            .replace(/\{\{/g, '\uE000')
            .replace(/\}\}/g, '\uE001')
            .replace(/\{([^{}:]+)(?::[^{}]*)?\}/g, (_, expr: string) => {
              return '${' + rewritePythonSyntaxInLine(expr.trim(), true) + '}';
            })
            .replace(/\uE000/g, '{')
            .replace(/\uE001/g, '}');
          out += '`' + tplInner + '`';
        } else {
          out += quoteChar + inner + quoteChar;
        }
        i = cursor;
        continue;
      }
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      out += ch;
      i++;
      while (i < code.length) {
        const c = code[i];
        out += c;
        i++;
        if (c === q && code[i - 2] !== '\\') {
          break;
        }
      }
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

/**
 * Une sentencias Python que continúan en múltiples líneas dentro de paréntesis `()`, corchetes `[]` o llaves `{}`
 * o que terminan con barra invertida `\`. También separa sentencias en una misma línea unidas con `;`,
 * etiquetando cada línea resultante con un marcador de línea para reportar la línea exacta en caso de fallo.
 */
function joinMultilineBracketStatements(code: string): string {
  const rawLines = code.split('\n');
  const outEntries: { text: string; pyLine: number }[] = [];
  let buffer = '';
  let bufferStartLine = 1;
  let depth = 0;
  let inStr: string | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    const trimmed = line.trim();
    if (!trimmed && depth === 0) {
      continue;
    }

    const hasExplicitBackslash = /\\\s*$/.test(line);
    if (hasExplicitBackslash) {
      line = line.replace(/\\\s*$/, ' ');
    }

    if (depth === 0 && !buffer) {
      buffer = line;
      bufferStartLine = i + 1;
    } else {
      buffer += ' ' + trimmed;
    }

    for (let c = 0; c < trimmed.length; c++) {
      const ch = trimmed[c];
      if (inStr) {
        if (ch === inStr && trimmed[c - 1] !== '\\') inStr = null;
      } else {
        if (ch === '"' || ch === "'" || ch === '`') {
          inStr = ch;
        } else if (ch === '(' || ch === '[' || ch === '{') {
          depth++;
        } else if (ch === ')' || ch === ']' || ch === '}') {
          depth = Math.max(0, depth - 1);
        }
      }
    }

    if (depth === 0 && !hasExplicitBackslash) {
      outEntries.push({ text: buffer, pyLine: bufferStartLine });
      buffer = '';
    }
  }

  if (buffer.trim()) {
    outEntries.push({ text: buffer, pyLine: bufferStartLine });
  }

  // Primero expandir suites de una línea (`if cond: a = 1; b = 2`) y luego dividir `;` conservando la indentación y el marcador de línea
  const expandedLines: string[] = [];
  for (const entry of outEntries) {
    const suiteExpanded = expandSingleLineColonSuite(entry.text);
    for (const sLine of suiteExpanded) {
      const sIndent = sLine.match(/^\s*/)?.[0] ?? '';
      const statements = splitTopLevelChar(sLine.trim(), ';');
      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        const nestedSuite = expandSingleLineColonSuite(sIndent + stmt.trim());
        for (const nLine of nestedSuite) {
          expandedLines.push(`/*@L:${entry.pyLine}@*/${nLine}`);
        }
      }
    }
  }

  return expandedLines.join('\n');
}

/**
 * Convierte expresiones `lambda a, b=1: cuerpo` de Python en funciones flecha JS `((a, b=1) => (cuerpo))`
 * respetando paréntesis, corchetes, llaves y cadenas anidadas dentro del cuerpo del lambda.
 */
function convertPythonLambdas(code: string): string {
  let out = '';
  let i = 0;
  let inStr: string | null = null;

  while (i < code.length) {
    const ch = code[i];
    if (inStr) {
      out += ch;
      if (ch === inStr && code[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }

    const prevChar = i > 0 ? code[i - 1] : '';
    if (!/[a-zA-Z0-9_$]/.test(prevChar)) {
      const sub = code.slice(i);
      const lambdaMatch = sub.match(/^lambda(?:\s+([a-zA-Z0-9_,\s=*]+?))?\s*:/);
      if (lambdaMatch) {
        const rawParams = (lambdaMatch[1] || '').trim();
        const bodyStart = i + lambdaMatch[0].length;
        let cursor = bodyStart;
        let depth = 0;
        let subStr: string | null = null;

        while (cursor < code.length) {
          const c = code[cursor];
          if (subStr) {
            if (c === subStr && code[cursor - 1] !== '\\') subStr = null;
          } else if (c === '"' || c === "'" || c === '`') {
            subStr = c;
          } else if (c === '(' || c === '[' || c === '{') {
            depth++;
          } else if (c === ')' || c === ']' || c === '}') {
            if (depth > 0) {
              depth--;
            } else {
              break;
            }
          } else if (depth === 0 && (c === ',' || c === ';' || c === '\n')) {
            break;
          }
          cursor++;
        }

        const rawBody = code.slice(bodyStart, cursor).trim();
        const transformedBody = convertPythonLambdas(rawBody);
        out += `((${rawParams}) => (${transformedBody}))`;
        i = cursor;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return out;
}

function splitTopLevelChar(str: string, sepChar: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      cur += ch;
      if (ch === inStr && str[i - 1] !== '\\') inStr = null;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
        cur += ch;
      } else if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
        cur += ch;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth = Math.max(0, depth - 1);
        cur += ch;
      } else if (ch === sepChar && depth === 0) {
        if (cur.trim()) parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/**
 * Si una sentencia de bloque (`if`, `elif`, `else`, `for`, `while`, `try`, `except`, `finally`, `with`)
 * tiene código en la misma línea después de `:` (ej. `if bsdf: bsdf.inputs[0].default_value = c`),
 * la divide en dos líneas con la indentación correcta.
 */
function expandSingleLineColonSuite(line: string): string[] {
  const indent = line.match(/^\s*/)?.[0] ?? '';
  const trimmed = line.trim();
  if (!/^(?:if|elif|else|for|while|try|except|finally|with|def)\b/.test(trimmed)) {
    return [line];
  }

  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (ch === inStr && trimmed[i - 1] !== '\\') inStr = null;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
      } else if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth = Math.max(0, depth - 1);
      } else if (ch === ':' && depth === 0) {
        const beforeColon = trimmed.slice(0, i + 1).trim();
        const afterColon = trimmed.slice(i + 1).trim();
        if (!afterColon) {
          return [line];
        }
        return [`${indent}${beforeColon}`, ...expandSingleLineColonSuite(`${indent}    ${afterColon}`)];
      }
    }
  }
  return [line];
}

function isBalancedOuterParens(str: string): { balanced: boolean; hasTopComma: boolean } {
  const s = str.trim();
  if (!s.startsWith('(') || !s.endsWith(')')) {
    return { balanced: false, hasTopComma: false };
  }
  let depth = 0;
  let inStr: string | null = null;
  let hasTopComma = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === inStr && s[i - 1] !== '\\') inStr = null;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
      } else if (ch === '(' || ch === '[' || ch === '{') {
        depth++;
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth--;
        if (depth === 0 && i < s.length - 1) {
          return { balanced: false, hasTopComma: false };
        }
      } else if (ch === ',' && depth === 1) {
        hasTopComma = true;
      }
    }
  }
  return { balanced: depth === 0, hasTopComma };
}

/**
 * Transforma llamadas a funciones/métodos con argumentos por nombre de Python (`fn(a, k=v)`)
 * en `fn(a, { __isKw: true, k: v })` de forma recursiva en todo el script.
 */
const NON_CALL_KEYWORDS = new Set([
  'if',
  'elif',
  'while',
  'for',
  'def',
  'return',
  'except',
  'catch',
  'switch',
  'function',
  'typeof',
  'await',
  'in',
  'not',
  'and',
  'or',
  'is',
  'else',
  'with',
  'assert',
  'del',
  'yield',
]);

function splitTopLevelCommas(rawArgs: string): string[] {
  const items: string[] = [];
  let current = '';
  let depth = 0;
  let inStr: string | null = null;

  for (let i = 0; i < rawArgs.length; i++) {
    const c = rawArgs[i];
    if (inStr) {
      current += c;
      if (c === inStr && rawArgs[i - 1] !== '\\') inStr = null;
    } else {
      if (c === '"' || chIsOpen(c)) {
        if (c === '"' || c === "'" || c === '`') {
          inStr = c;
          current += c;
        } else {
          depth++;
          current += c;
        }
      } else if (c === "'" || c === '`') {
        inStr = c;
        current += c;
      } else if (c === ')' || c === ']' || c === '}') {
        depth = Math.max(0, depth - 1);
        current += c;
      } else if (c === ',' && depth === 0) {
        if (current.trim()) items.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function chIsOpen(c: string): boolean {
  return c === '(' || c === '[' || c === '{';
}

function transformAllKeywordFunctionCalls(code: string): string {
  // No transformar la cabecera de `def nombre_funcion(...):` (respetando el marcador /*@L:N@*/)
  return code
    .split('\n')
    .map((line) => {
      const markerMatch = line.match(/^(\/\*@L:\d+@\*\/)/);
      const marker = markerMatch ? markerMatch[1] : '';
      const rest = marker ? line.slice(marker.length) : line;
      if (/^\s*def\s+[a-zA-Z_]\w*\s*\(/.test(rest)) {
        return line;
      }
      return marker + transformKeywordCallsInExpression(rest);
    })
    .join('\n');
}

function transformKeywordCallsInExpression(expr: string): string {
  let out = '';
  let i = 0;
  let inStr: string | null = null;

  while (i < expr.length) {
    const ch = expr[i];
    if (inStr) {
      out += ch;
      if (ch === inStr && expr[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }

    // Buscar un identificador o cadena de propiedades seguida de '('
    const sub = expr.slice(i);
    const callMatch = sub.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*\(/);
    if (callMatch) {
      const fnName = callMatch[1];
      const lastSegment = fnName.split('.').pop() || fnName;

      if (!NON_CALL_KEYWORDS.has(fnName) && !NON_CALL_KEYWORDS.has(lastSegment)) {
        const openParenIdx = i + callMatch[0].length - 1;
        let depth = 1;
        let cursor = openParenIdx + 1;
        let subStr: string | null = null;

        while (cursor < expr.length && depth > 0) {
          const c = expr[cursor];
          if (subStr) {
            if (c === subStr && expr[cursor - 1] !== '\\') subStr = null;
          } else {
            if (c === '"' || c === "'" || c === '`') {
              subStr = c;
            } else if (c === '(') {
              depth++;
            } else if (c === ')') {
              depth--;
            }
          }
          cursor++;
        }

        if (depth === 0) {
          const closeParenIdx = cursor - 1;
          const rawInner = expr.slice(openParenIdx + 1, closeParenIdx).trim();
          const transformedInner = rawInner ? transformKeywordCallsInExpression(rawInner) : '';

          const isAsyncDecimate = fnName === 'bpy.ops.mesh.decimate';
          const prefix = isAsyncDecimate ? 'await ' : '';

          if (!transformedInner) {
            out += `${prefix}${fnName}()`;
          } else {
            const topArgs = splitTopLevelCommas(transformedInner);
            const hasKw = topArgs.some(
              (a) => /^[a-zA-Z_]\w*\s*=(?!=)/.test(a) || /^\*\*[a-zA-Z_]\w*$/.test(a)
            );

            if (hasKw) {
              const posArgs: string[] = [];
              const kwProps: string[] = ['__isKw: true'];

              for (const arg of topArgs) {
                const kwMatch = arg.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*([\s\S]+)$/);
                const spreadKw = arg.match(/^\*\*([a-zA-Z_]\w*)$/);
                if (spreadKw) {
                  kwProps.push(`...${spreadKw[1]}`);
                } else if (kwMatch) {
                  const key = kwMatch[1];
                  let val = kwMatch[2].trim();
                  const check = isBalancedOuterParens(val);
                  if (check.balanced && check.hasTopComma) {
                    val = '[' + val.slice(1, -1) + ']';
                  }
                  kwProps.push(`${key}: ${val}`);
                } else {
                  posArgs.push(arg);
                }
              }

              const kwObjStr = `{ ${kwProps.join(', ')} }`;
              if (posArgs.length > 0) {
                out += `${prefix}${fnName}(${posArgs.join(', ')}, ${kwObjStr})`;
              } else {
                out += `${prefix}${fnName}(${kwObjStr})`;
              }
            } else {
              out += `${prefix}${fnName}(${transformedInner})`;
            }
          }

          i = cursor;
          continue;
        }
      }
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Busca ` for <vars> in <iter> [if <cond>]` en el nivel superior de una expresión interior de `[]`, `()` o `{}`.
 */
function parseTopLevelComprehension(inner: string): {
  expr: string;
  param: string;
  iter: string;
  cond?: string;
} | null {
  let depth = 0;
  let inStr: string | null = null;
  let forIdx = -1;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      if (ch === inStr && inner[i - 1] !== '\\') inStr = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      const rem = inner.slice(i);
      if (/^\s+for\s+[a-zA-Z_(]/.test(rem)) {
        forIdx = i;
        break;
      }
    }
  }

  if (forIdx <= 0) return null;

  const exprPart = inner.slice(0, forIdx).trim();
  const afterFor = inner.slice(forIdx).replace(/^\s+for\s+/, '');

  // Encontrar ` in ` a profundidad 0 en afterFor
  depth = 0;
  inStr = null;
  let inIdx = -1;
  for (let i = 0; i < afterFor.length; i++) {
    const ch = afterFor[i];
    if (inStr) {
      if (ch === inStr && afterFor[i - 1] !== '\\') inStr = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      const rem = afterFor.slice(i);
      if (/^\s+in\s+/.test(rem)) {
        inIdx = i;
        break;
      }
    }
  }

  if (inIdx <= 0) return null;

  const rawVars = afterFor.slice(0, inIdx).trim();
  const afterIn = afterFor.slice(inIdx).replace(/^\s+in\s+/, '');

  // Buscar ` if ` opcional a profundidad 0 en afterIn
  depth = 0;
  inStr = null;
  let ifIdx = -1;
  for (let i = 0; i < afterIn.length; i++) {
    const ch = afterIn[i];
    if (inStr) {
      if (ch === inStr && afterIn[i - 1] !== '\\') inStr = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      const rem = afterIn.slice(i);
      if (/^\s+if\s+/.test(rem)) {
        ifIdx = i;
        break;
      }
    }
  }

  const iterPart = (ifIdx !== -1 ? afterIn.slice(0, ifIdx) : afterIn).trim();
  const condPart = ifIdx !== -1 ? afterIn.slice(ifIdx).replace(/^\s+if\s+/, '').trim() : undefined;

  const vClean = rawVars.replace(/^\(|\)$/g, '').trim();
  const param = vClean.includes(',') ? `[${vClean.replace(/\(/g, '[').replace(/\)/g, ']')}]` : vClean;

  return {
    expr: exprPart,
    param,
    iter: iterPart,
    cond: condPart,
  };
}

/**
 * Convierte comprensiones de listas `[expr for x in iter]`, diccionarios `{k: v for x in iter}`
 * y expresiones generadoras `(expr for x in iter)` soportando corchetes anidados como `[v.co[0] for v in bm.verts]`.
 */
function convertListComprehensions(code: string): string {
  let out = '';
  let i = 0;
  let inStr: string | null = null;

  while (i < code.length) {
    const ch = code[i];
    if (inStr) {
      out += ch;
      if (ch === inStr && code[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }

    if (ch === '[' || ch === '(' || ch === '{') {
      const openChar = ch;
      const closeChar = ch === '[' ? ']' : ch === '(' ? ')' : '}';
      let depth = 1;
      let cursor = i + 1;
      let subStr: string | null = null;

      while (cursor < code.length && depth > 0) {
        const c = code[cursor];
        if (subStr) {
          if (c === subStr && code[cursor - 1] !== '\\') subStr = null;
        } else if (c === '"' || c === "'" || c === '`') {
          subStr = c;
        } else if (c === openChar) {
          depth++;
        } else if (c === closeChar) {
          depth--;
        }
        cursor++;
      }

      if (depth === 0) {
        const rawInner = code.slice(i + 1, cursor - 1);
        const comp = parseTopLevelComprehension(rawInner);
        if (comp) {
          const convExpr = rewritePythonSyntaxInLine(convertListComprehensions(comp.expr));
          const convIter = rewritePythonSyntaxInLine(convertListComprehensions(comp.iter), true);
          const convCond = comp.cond
            ? rewritePythonSyntaxInLine(convertListComprehensions(comp.cond))
            : undefined;

          if (openChar === '{') {
            // Dict comprehension `{k: v for x in iter}` vs Set comprehension `{x for x in iter}`
            let colonIdx = -1;
            let cDepth = 0;
            let cStr: string | null = null;
            for (let k = 0; k < convExpr.length; k++) {
              const cc = convExpr[k];
              if (cStr) {
                if (cc === cStr && convExpr[k - 1] !== '\\') cStr = null;
              } else if (cc === '"' || cc === "'" || cc === '`') {
                cStr = cc;
              } else if (cc === '(' || cc === '[' || cc === '{') {
                cDepth++;
              } else if (cc === ')' || cc === ']' || cc === '}') {
                cDepth = Math.max(0, cDepth - 1);
              } else if (cc === ':' && cDepth === 0) {
                colonIdx = k;
                break;
              }
            }
            if (colonIdx !== -1) {
              const kExpr = convExpr.slice(0, colonIdx).trim();
              const vExpr = convExpr.slice(colonIdx + 1).trim();
              const arrCode = convCond
                ? `Array.from(${convIter}).filter((${comp.param}) => (${convCond})).map((${comp.param}) => [${kExpr}, ${vExpr}])`
                : `Array.from(${convIter}, (${comp.param}) => [${kExpr}, ${vExpr}])`;
              out += `Object.fromEntries(${arrCode})`;
            } else {
              const arrCode = convCond
                ? `Array.from(${convIter}).filter((${comp.param}) => (${convCond})).map((${comp.param}) => (${convExpr}))`
                : `Array.from(${convIter}, (${comp.param}) => (${convExpr}))`;
              out += `new Set(${arrCode})`;
            }
          } else {
            const arrCode = convCond
              ? `Array.from(${convIter}).filter((${comp.param}) => (${convCond})).map((${comp.param}) => (${convExpr}))`
              : `Array.from(${convIter}, (${comp.param}) => (${convExpr}))`;
            out += openChar === '(' ? `(${arrCode})` : arrCode;
          }
          i = cursor;
          continue;
        }
      }
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Convierte tuplas de Python `(a, b, c)` en arrays `[a, b, c]` cuando no son llamadas a funciones ni parámetros `=>`.
 */
function convertPythonTuplesToArrays(code: string): string {
  let out = '';
  let i = 0;
  let inStr: string | null = null;

  while (i < code.length) {
    const ch = code[i];
    if (inStr) {
      out += ch;
      if (ch === inStr && code[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }

    if (ch === '(') {
      const trimmedOut = out.trimEnd();
      const prevChar = trimmedOut.length > 0 ? trimmedOut[trimmedOut.length - 1] : '';
      const trailingWordMatch = trimmedOut.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
      const trailingWord = trailingWordMatch ? trailingWordMatch[1] : '';

      const isProtectedClause =
        trailingWord === 'def' || trailingWord === 'class' || trailingWord === 'except';
      const isKeywordBeforeParen =
        trailingWord !== '' && !isProtectedClause && NON_CALL_KEYWORDS.has(trailingWord);
      const isFunctionCallOrControl =
        isProtectedClause || (!isKeywordBeforeParen && /[a-zA-Z0-9_$)\]]/.test(prevChar));

      if (!isFunctionCallOrControl) {
        let depth = 1;
        let cursor = i + 1;
        let subStr: string | null = null;
        let hasTopLevelComma = false;

        while (cursor < code.length && depth > 0) {
          const c = code[cursor];
          if (subStr) {
            if (c === subStr && code[cursor - 1] !== '\\') subStr = null;
          } else {
            if (c === '"' || c === "'" || c === '`') {
              subStr = c;
            } else if (c === '(' || c === '[' || c === '{') {
              depth++;
            } else if (c === ')' || c === ']' || c === '}') {
              depth--;
            } else if (c === ',' && depth === 1) {
              hasTopLevelComma = true;
            }
          }
          cursor++;
        }

        const afterClose = code.slice(cursor).trimStart();
        const isArrowFnParams = afterClose.startsWith('=>');

        const innerContent = code.slice(i + 1, cursor - 1).trim();
        const isEmptyTuple = depth === 0 && innerContent === '';
        if (depth === 0 && !isArrowFnParams && (hasTopLevelComma || isEmptyTuple)) {
          const cleanedInner = innerContent.replace(/,\s*$/, '');
          out += '[' + (isEmptyTuple ? '' : convertPythonTuplesToArrays(cleanedInner)) + ']';
          i = cursor;
          continue;
        }
      }
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Reescribe operadores y tokens exclusivos de Python (`True`, `False`, `None`, `and`, `or`, `not`, `is`, `in`,
 * `//`, `**`, slicing `[:3]`, índices negativos `[-1]`, unpacking `*arr`, lambdas, `@`, sets) respetando strings.
 */
function rewritePythonSyntaxInLine(line: string, isForOrCompHeader: boolean = false): string {
  // 0. Conjuntos estilo Blender (`return {'FINISHED'}`) se reescriben sobre la línea completa.
  // Deben hacerse antes de segmentar: al separar las strings, la llave y la cadena quedan en
  // segmentos distintos y ninguna regla de conjuntos llegaría a casar (provocaba "Unexpected string").
  line = line.replace(
    /(^|[^a-zA-Z0-9_$.'"])\{\s*(['"][A-Za-z_0-9]+['"](?:\s*,\s*['"][A-Za-z_0-9]+['"])*)\s*\}/g,
    '$1new Set([$2])'
  );

  // 1. Separar en segmentos fuera y dentro de strings para no alterar literales de texto
  const segments: { text: string; isString: boolean }[] = [];
  let cur = '';
  let inStr: string | null = null;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      cur += ch;
      if (ch === inStr && line[i - 1] !== '\\') {
        segments.push({ text: cur, isString: true });
        cur = '';
        inStr = null;
      }
    } else {
      if (ch === '"' || ch === "'" || ch === '`') {
        if (cur) segments.push({ text: cur, isString: false });
        cur = ch;
        inStr = ch;
      } else {
        cur += ch;
      }
    }
  }
  if (cur) {
    segments.push({ text: cur, isString: inStr !== null });
  }

  const processed = segments
    .map((seg) => {
      if (seg.isString) return seg.text;
      let t = seg.text;

      // Asignación de división entera `a //= b` -> `a = Math.trunc((a) / (b))`
      t = t.replace(/^(\s*[a-zA-Z_][a-zA-Z0-9_.\[\]]*)\s*\/\/=\s*(.+)$/, '$1 = Math.trunc(($1) / ($2))');

      // Asignaciones compuestas sobre vectores (`v.co *= 1.2`, `v.co += vec`, `obj.scale *= 0.5`, `obj.location += vec`)
      t = t.replace(
        /^(\s*[a-zA-Z_][a-zA-Z0-9_.\[\]]*\.(?:co|location|scale|rotation_euler|position|rotation))\s*(\+=|-=|\*=|\/=)\s*(.+)$/,
        "bpy._vecOpAssign($1, '$2', $3)"
      );

      // Asignación a slice completo `arr[:] = val` -> `bpy._sliceAssign(arr, val)`
      t = t.replace(/^(\s*[a-zA-Z_][a-zA-Z0-9_.\[\]]*)\[\s*:\s*\]\s*=\s*(?!=)(.+)$/, 'bpy._sliceAssign($1, $2)');

      // Negación unaria antes de exponenciación `-x ** 2` -> `-(x ** 2)` (evita SyntaxError en JS)
      t = t.replace(/(^|[=(\[,:;+\-*/%&|^~<>?\s])-\s*([a-zA-Z0-9_.()\[\]]+)\s*\*\*\s*([a-zA-Z0-9_.()\[\]+-]+)/g, '$1-($2 ** $3)');

      // Repetición de listas literales estilo Python: `[True] * n` o `[0, 0] * 4` -> `bpy._repeatList([True], n)`
      // Importante: exigir que `[` NO vaya precedido de identificador, `)` ni `]` para no alterar `verts[0] * 2.0`
      t = t.replace(
        /(^|[^a-zA-Z0-9_.\)\]])(\[[^\[\]]+\])\s*\*\s*([a-zA-Z0-9_.()\[\]]+)/g,
        '$1bpy._repeatList($2, $3)'
      );

      // Operaciones vectoriales `(a - b).length`, `(a - b).normalized()`, `(a + b).normalized()`
      t = t.replace(
        /\(([^()]+?)\s*-\s*([^()]+?)\)\.(length|normalized|normalize|dot|cross|x|y|z)\b/g,
        'bpy._sub($1, $2).$3'
      );
      t = t.replace(
        /\(([^()]+?)\s*\+\s*([^()]+?)\)\.(length|normalized|normalize|dot|cross|x|y|z)\b/g,
        'bpy._add($1, $2).$3'
      );

      // Slicing con paso: `arr[::-1]` -> `arr._pySlice(null, null, -1)`, `arr[s:e:step]` -> `arr._pySlice(s, e, step)`
      t = t.replace(
        /([a-zA-Z0-9_)\]])\[\s*([^:\[\]]*)\s*:\s*([^:\[\]]*)\s*:\s*([^:\[\]]*)\s*\]/g,
        (_, obj, start, end, step) => {
          const s = start.trim() ? start.trim() : 'null';
          const e = end.trim() ? end.trim() : 'null';
          const st = step.trim() ? step.trim() : '1';
          return `${obj}._pySlice(${s}, ${e}, ${st})`;
        }
      );
      // Slicing de listas Python: `arr[:3]` -> `arr.slice(0, 3)`, `arr[1:]` -> `arr.slice(1)`
      t = t.replace(
        /([a-zA-Z0-9_)\]])\[\s*([^:\[\]]*)\s*:\s*([^:\[\]]*)\s*\]/g,
        (_, obj, start, end) => {
          const s = start ? start.trim() : '0';
          const e = end ? end.trim() : '';
          return e ? `${obj}.slice(${s}, ${e})` : `${obj}.slice(${s})`;
        }
      );
      // Índices negativos en lectura: `arr[-1]` -> `arr.at(-1)` (cuando no va seguido de `=`)
      t = t.replace(/([a-zA-Z0-9_)\]])\[\s*-\s*([0-9]+)\s*\](?!\s*=[^=])/g, '$1.at(-$2)');
      // Desempaquetado con asterisco en tuplas/listas: `(*rgb, 1.0)` -> `(...rgb, 1.0)`
      t = t.replace(/([(\[,]\s*)\*([a-zA-Z_][a-zA-Z0-9_.[\]():]*)(?=\s*[,)\]])/g, '$1...$2');
      // Lambdas de Python: `lambda x, y: expr` -> `((x, y) => (expr))`
      t = t.replace(
        /\blambda\s+([a-zA-Z0-9_,\s]*?)\s*:\s*([^,)\]\n]+)/g,
        '(($1) => ($2))'
      );
      // Booleanos, None y operadores lógicos
      t = t
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/\bis\s+not\b/g, '!==')
        .replace(/\bis\b/g, '===')
        .replace(/\band\b/g, '&&')
        .replace(/\bor\b/g, '||')
        .replace(/\bnot\s+/g, '!');
      return t;
    })
    .join('');

  // 2. Resolver métodos de diccionario (.items(), .values(), .keys(), .get(...), .setdefault(...))
  // y multiplicación matricial `@` sobre la línea completa (soportando strings entre corchetes como nodes["Principled BSDF"].inputs.get(...))
  const afterDictAndMatmul = rewritePythonDictMethodsAndMatmul(processed);

  // 3. Resolver división entera `a // b` fuera de strings extrayendo el operando completo (ej. `len(verts) // 2`)
  const afterFloorDiv = rewritePythonFloorDivisions(afterDictAndMatmul);

  if (isForOrCompHeader) {
    return afterFloorDiv;
  }

  // 4. Resolver `x not in y` y `x in y` fuera de strings
  return rewritePythonInExpressions(afterFloorDiv);
}

function rewritePythonDictMethodsAndMatmul(line: string): string {
  let result = line;

  // 1. Métodos sin argumentos: .items(), .values(), .keys()
  const zeroArgMethods: Array<{ pattern: RegExp; helper: string }> = [
    { pattern: /^\.items\s*\(\s*\)/, helper: 'bpy._items' },
    { pattern: /^\.values\s*\(\s*\)/, helper: 'bpy._values' },
    { pattern: /^\.keys\s*\(\s*\)/, helper: 'bpy._keys' },
  ];
  for (const { pattern, helper } of zeroArgMethods) {
    let guard = 30;
    while (guard-- > 0) {
      const found = findOutsideStrings(result, pattern);
      if (!found) break;
      const beforeStr = result.slice(0, found.index);
      const afterStr = result.slice(found.index + found.length);
      const left = extractBalancedOperandBackward(beforeStr, beforeStr.length - 1);
      if (!left.operand) break;
      result = `${beforeStr.slice(0, left.startIdx)}${helper}(${left.operand})${afterStr}`;
    }
  }

  // 2. Métodos con argumentos: .get(...) y .setdefault(...)
  const callMethods: Array<{ pattern: RegExp; helper: string }> = [
    { pattern: /^\.get\s*\(/, helper: 'bpy._get' },
    { pattern: /^\.setdefault\s*\(/, helper: 'bpy._setdefault' },
  ];
  for (const { pattern, helper } of callMethods) {
    let guard = 40;
    while (guard-- > 0) {
      const found = findOutsideStrings(result, pattern);
      if (!found) break;
      const beforeStr = result.slice(0, found.index);
      const left = extractBalancedOperandBackward(beforeStr, beforeStr.length - 1);
      if (!left.operand) break;
      const afterOpenParen = result.slice(found.index + found.length);
      result = `${beforeStr.slice(0, left.startIdx)}${helper}(${left.operand}, ${afterOpenParen}`;
    }
  }

  // 3. Operador `@` de multiplicación de matrices/vectores (`Matrix.Rotation(0.5, 4, 'Z') @ vec`)
  let matmulGuard = 30;
  while (matmulGuard-- > 0) {
    const found = findOutsideStrings(result, /^\s*@\s*/);
    if (!found || found.index === 0) break;
    const beforeStr = result.slice(0, found.index);
    const afterStr = result.slice(found.index + found.length);
    const left = extractBalancedOperandBackward(beforeStr, beforeStr.length - 1);
    const right = extractBalancedOperandForward(afterStr, 0);
    if (!left.operand || !right.operand) break;
    result = `${beforeStr.slice(0, left.startIdx)}bpy._matmul(${left.operand}, ${right.operand})${afterStr.slice(right.endIdx)}`;
  }

  return result;
}

function findOutsideStrings(str: string, regex: RegExp): { index: number; length: number; match: RegExpExecArray } | null {
  let inStr: string | null = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (ch === inStr && str[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    const sub = str.slice(i);
    const m = regex.exec(sub);
    if (m && m.index === 0) {
      return { index: i, length: m[0].length, match: m };
    }
  }
  return null;
}

function rewritePythonFloorDivisions(line: string): string {
  let result = line;
  let safetyLimit = 25;
  while (safetyLimit-- > 0) {
    const found = findOutsideStrings(result, /^\/\/(?!=)/);
    if (!found) break;

    const beforeStr = result.slice(0, found.index);
    const afterStr = result.slice(found.index + found.length);
    const left = extractBalancedOperandBackward(beforeStr, beforeStr.length - 1);
    const right = extractBalancedOperandForward(afterStr, 0);
    if (!left.operand || !right.operand) break;

    const prefix = beforeStr.slice(0, left.startIdx);
    const suffix = afterStr.slice(right.endIdx);
    result = `${prefix}Math.trunc((${left.operand}) / (${right.operand}))${suffix}`;
  }
  return result;
}

function extractBalancedOperandBackward(str: string, endIdx: number): { operand: string; startIdx: number } {
  let idx = endIdx;
  while (idx >= 0 && /\s/.test(str[idx])) idx--;
  if (idx < 0) return { operand: '', startIdx: endIdx };

  if (str[idx] === '"' || str[idx] === "'" || str[idx] === '`') {
    const q = str[idx];
    let qStart = idx - 1;
    while (qStart >= 0 && (str[qStart] !== q || str[qStart - 1] === '\\')) {
      qStart--;
    }
    const start = Math.max(0, qStart);
    return { operand: str.slice(start, idx + 1), startIdx: start };
  }

  let depth = 0;
  let inQuote: string | null = null;
  let cursor = idx;
  while (cursor >= 0) {
    const ch = str[cursor];
    if (inQuote) {
      if (ch === inQuote && str[cursor - 1] !== '\\') inQuote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inQuote = ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth++;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      if (depth > 0) depth--;
      else break;
    } else if (depth === 0) {
      if (/[\s,;:?!=<>&|^~+*/%([{]/.test(ch)) {
        cursor++;
        break;
      }
    }
    cursor--;
  }
  const startIdx = Math.max(0, cursor);
  return { operand: str.slice(startIdx, idx + 1).trim(), startIdx };
}

function extractBalancedOperandForward(str: string, startIdx: number): { operand: string; endIdx: number } {
  let idx = startIdx;
  while (idx < str.length && /\s/.test(str[idx])) idx++;
  if (idx >= str.length) return { operand: '', endIdx: startIdx };

  if (str[idx] === '"' || str[idx] === "'" || str[idx] === '`') {
    const q = str[idx];
    let qEnd = idx + 1;
    while (qEnd < str.length && (str[qEnd] !== q || str[qEnd - 1] === '\\')) {
      qEnd++;
    }
    const end = Math.min(str.length, qEnd + 1);
    return { operand: str.slice(idx, end), endIdx: end };
  }

  let depth = 0;
  let inQuote: string | null = null;
  let cursor = idx;
  while (cursor < str.length) {
    const ch = str[cursor];
    if (inQuote) {
      if (ch === inQuote && str[cursor - 1] !== '\\') inQuote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inQuote = ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth > 0) depth--;
      else break;
    } else if (depth === 0) {
      if (/[\s,;:?!=<>&|^~+*/%\])}]/.test(ch)) {
        break;
      }
    }
    cursor++;
  }
  return { operand: str.slice(idx, cursor).trim(), endIdx: cursor };
}

function rewritePythonInExpressions(line: string): string {
  let result = line;
  let safetyLimit = 30;
  while (safetyLimit-- > 0) {
    const notInFound = findOutsideStrings(result, /^\s+not\s+in\s+/);
    const inFound = findOutsideStrings(result, /^\s+in\s+/);
    if (!notInFound && !inFound) break;

    let isNotIn = false;
    let matchIdx = -1;
    let matchLen = 0;

    if (notInFound && (!inFound || notInFound.index <= inFound.index)) {
      isNotIn = true;
      matchIdx = notInFound.index;
      matchLen = notInFound.length;
    } else if (inFound) {
      isNotIn = false;
      matchIdx = inFound.index;
      matchLen = inFound.length;
    } else {
      break;
    }

    const beforeStr = result.slice(0, matchIdx);
    const afterStr = result.slice(matchIdx + matchLen);

    const left = extractBalancedOperandBackward(beforeStr, beforeStr.length - 1);
    const right = extractBalancedOperandForward(afterStr, 0);

    if (!left.operand || !right.operand) {
      break;
    }

    const prefix = beforeStr.slice(0, left.startIdx);
    const suffix = afterStr.slice(right.endIdx);
    const replacement = isNotIn
      ? `!bpy._in(${left.operand}, ${right.operand})`
      : `bpy._in(${left.operand}, ${right.operand})`;

    result = prefix + replacement + suffix;
  }
  return result;
}

function rewriteInlineTernaries(line: string): string {
  if (!line.includes(' if ') || !line.includes(' else ')) {
    return line;
  }
  if (/^\s*(?:if|elif|while|for)\b/.test(line)) return line;

  let out = '';
  let i = 0;
  let inStr: string | null = null;
  while (i < line.length) {
    const ch = line[i];
    if (inStr) {
      out += ch;
      if (ch === inStr && line[i - 1] !== '\\') inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }

    const sub = line.slice(i);
    const ifMatch = sub.match(/^\s+if\s+/);
    if (ifMatch && i > 0) {
      const ifEnd = i + ifMatch[0].length;
      let depth = 0;
      let cursor = ifEnd;
      let elseIdx = -1;
      let subStr: string | null = null;

      while (cursor < line.length) {
        const c = line[cursor];
        if (subStr) {
          if (c === subStr && line[cursor - 1] !== '\\') subStr = null;
        } else if (c === '"' || c === "'" || c === '`') {
          subStr = c;
        } else if (c === '(' || c === '[' || c === '{') {
          depth++;
        } else if (c === ')' || c === ']' || c === '}') {
          if (depth > 0) depth--;
          else break;
        } else if (depth === 0) {
          const rem = line.slice(cursor);
          if (/^\s+else\s+/.test(rem)) {
            elseIdx = cursor;
            break;
          }
          if (c === ';' || c === ':') break;
        }
        cursor++;
      }

      if (elseIdx !== -1) {
        const cond = line.slice(ifEnd, elseIdx).trim();
        const elseMatch = line.slice(elseIdx).match(/^\s+else\s+/);
        const elseEnd = elseIdx + elseMatch![0].length;

        let endCursor = elseEnd;
        let endDepth = 0;
        let endSubStr: string | null = null;

        while (endCursor < line.length) {
          const c = line[endCursor];
          if (endSubStr) {
            if (c === endSubStr && line[endCursor - 1] !== '\\') endSubStr = null;
          } else if (c === '"' || c === "'" || c === '`') {
            endSubStr = c;
          } else if (c === '(' || c === '[' || c === '{') {
            endDepth++;
          } else if (c === ')' || c === ']' || c === '}') {
            if (endDepth > 0) endDepth--;
            else break;
          } else if (endDepth === 0) {
            if (c === ',' || c === ';' || c === ')') break;
          }
          endCursor++;
        }

        const right = line.slice(elseEnd, endCursor).trim();
        const eqIdx = out.lastIndexOf('=');
        if (eqIdx !== -1 && eqIdx > out.lastIndexOf('(') && eqIdx > out.lastIndexOf(',')) {
          const assignPrefix = out.slice(0, eqIdx + 1);
          const leftExpr = out.slice(eqIdx + 1).trim();
          out = `${assignPrefix} ((${cond}) ? (${leftExpr}) : (${right}))`;
        } else {
          const leftExpr = out.trim();
          out = `((${cond}) ? (${leftExpr}) : (${right}))`;
        }
        i = endCursor;
        continue;
      }
    }

    out += ch;
    i++;
  }
  return out;
}

/**
 * Crea un Proxy de Vector 3D compatible con Blender (`v.x, v.y, v.z` y `v[0], v[1], v[2]`)
 * que convierte automáticamente entre coordenadas Blender 5.2 (Z-Up) y Three.js (Y-Up) si `isZUp` está activo.
 */
function createBlenderVectorProxy(
  getThreeXYZ: () => [number, number, number],
  setThreeXYZ: (x: number, y: number, z: number) => void,
  mode: 'location' | 'scale' | 'rotation',
  isZUp: boolean
) {
  const toBlender = (): [number, number, number] => {
    const [tx, ty, tz] = getThreeXYZ();
    if (!isZUp) return [tx, ty, tz];
    if (mode === 'scale') return [tx, tz, ty];
    // En Blender Z-Up: X=tx, Y=-tz, Z=ty
    return [tx, -tz, ty];
  };

  const fromBlender = (bx: number, by: number, bz: number) => {
    if (!isZUp) {
      setThreeXYZ(bx, by, bz);
    } else if (mode === 'scale') {
      setThreeXYZ(bx, bz, by);
    } else {
      setThreeXYZ(bx, bz, -by);
    }
  };

  const target = {
    x: 0,
    y: 0,
    z: 0,
    order: 'XYZ',
    set: (x: number, y: number, z: number) => fromBlender(x, y, z),
    copy: (other: { x?: number; y?: number; z?: number } | number[]) => {
      if (Array.isArray(other)) {
        fromBlender(Number(other[0]) || 0, Number(other[1]) || 0, Number(other[2]) || 0);
      } else if (other && typeof other === 'object') {
        fromBlender(Number(other.x) || 0, Number(other.y) || 0, Number(other.z) || 0);
      }
    },
    rotate_axis: (axis: string, angle: number) => {
      const [bx, by, bz] = toBlender();
      const a = String(axis).toUpperCase();
      const rad = Number(angle) || 0;
      if (a === 'X') fromBlender(bx + rad, by, bz);
      else if (a === 'Y') fromBlender(bx, by + rad, bz);
      else if (a === 'Z') fromBlender(bx, by, bz + rad);
    },
  };

  return new Proxy(target, {
    get(_t, prop) {
      const [bx, by, bz] = toBlender();
      if (prop === 'x' || prop === '0') return bx;
      if (prop === 'y' || prop === '1') return by;
      if (prop === 'z' || prop === '2') return bz;
      if (prop === 'length') return Math.hypot(bx, by, bz);
      if (prop === Symbol.iterator) {
        return function* () {
          yield bx;
          yield by;
          yield bz;
        };
      }
      return Reflect.get(_t, prop);
    },
    set(_t, prop, value) {
      const num = Number(value) || 0;
      const [bx, by, bz] = toBlender();
      if (prop === 'x' || prop === '0') {
        fromBlender(num, by, bz);
        return true;
      }
      if (prop === 'y' || prop === '1') {
        fromBlender(bx, num, bz);
        return true;
      }
      if (prop === 'z' || prop === '2') {
        fromBlender(bx, by, num);
        return true;
      }
      return true;
    },
  });
}

/**
 * Extrae argumentos posicionales y por nombre (`__isKw`) para funciones de la API de Blender o `def` del usuario.
 */
function extractPyArgs(
  rawArgs: unknown[],
  paramNames: string[],
  defaults: Record<string, unknown> = {}
): Record<string, any> {
  const args = [...rawArgs];
  let kw: Record<string, unknown> = {};

  if (
    args.length > 0 &&
    args[args.length - 1] &&
    typeof args[args.length - 1] === 'object' &&
    !Array.isArray(args[args.length - 1]) &&
    (args[args.length - 1] as any).__isKw
  ) {
    kw = args.pop() as Record<string, unknown>;
  } else if (
    args.length === 1 &&
    args[0] &&
    typeof args[0] === 'object' &&
    !Array.isArray(args[0]) &&
    !(args[0] as any)._geometry &&
    !(args[0] as any)._threeMesh &&
    !(args[0] as any)._isBMesh &&
    !(args[0] as any)._isBlenderMaterial &&
    !(args[0] as any)._isMathutils
  ) {
    kw = args.pop() as Record<string, unknown>;
  }

  const result: Record<string, any> = { ...defaults };
  paramNames.forEach((name, idx) => {
    if (idx < args.length && args[idx] !== undefined) {
      result[name] = args[idx];
    } else if (kw[name] !== undefined) {
      result[name] = kw[name];
    }
  });

  for (const [k, v] of Object.entries(kw)) {
    if (k !== '__isKw' && v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Entorno de ejecución compatible con **Blender 5.2** (`bpy`, `bmesh`, `mathutils`, `Principled BSDF`, `modifiers`, `def`, Z-Up y Y-Up)
 */
export async function executeBlenderPythonScript(
  script: string,
  modelWrapper: THREE.Object3D,
  callbacks?: {
    onTextureChange?: (texName: TexturePatternType) => void;
    onTextureSettingsChange?: (opts: {
      activeTexture?: TexturePatternType;
      repeatScale?: number;
      bumpIntensity?: number;
      useNaturalColor?: boolean;
    }) => void;
    onColorChange?: (colorHex: string) => void;
    onRenderEngineChange?: (engine: 'eevee' | 'cycles' | 'cel' | 'matcap' | 'normals' | 'original') => void;
    onRenderSettingsChange?: (partial: {
      normalSmoothing?: number;
      outlineThickness?: number;
      outlineOpacity?: number;
      ssaoIntensity?: number;
      bgColor?: string;
      autoRotate?: boolean;
      autoRotateSpeed?: number;
      aaMode?: 'SMAA' | 'FXAA';
      matcapPreset?: MatcapPresetId;
      wireframe?: boolean;
      showPedestalGrid?: boolean;
      lightIntensity?: number;
      lightAngle?: number;
      followCameraLight?: boolean;
      eeveeBloomIntensity?: number;
      eeveeEnvIntensity?: number;
      cyclesSamples?: number;
      cyclesClearcoat?: number;
      cyclesRoughnessFactor?: number;
      cyclesIor?: number;
      cyclesGiBounceBoost?: number;
      cyclesProgressiveAccum?: boolean;
    }) => void;
    onCameraPresetChange?: (preset: 'hero' | 'front' | 'closeup' | 'macro' | 'side' | 'top') => void;
    onZoomChange?: (percent: number) => void;
    onFrameModel?: (margin?: number) => void;
    outlineThickness?: number;
    outlineOpacity?: number;
    normalSmoothing?: number;
    coordinateMode?: BlenderCoordinateMode;
  }
): Promise<ScriptExecutionResult> {
  ensurePythonArrayMethods();
  // Las imágenes de mapa de color deben estar en memoria para resolver mat.color_map de forma síncrona
  await preloadColorMapImages(script);
  startBlenderRun();

  const startTime = performance.now();
  const logs: string[] = [];

  const cleanedRawScript = stripMarkdownCodeFences(script);
  const coordMode = callbacks?.coordinateMode ?? 'auto';
  const isZUp =
    coordMode === 'blender_z_up'
      ? true
      : coordMode === 'studio_y_up'
      ? false
      : detectBlenderZUpScript(cleanedRawScript);

  logs.push(
    `Python 3.11 [Blender 5.2 bpy Engine • ${
      isZUp ? 'Modo Blender 5.2 Estándar (Z-Up → Y-Up)' : 'Modo Estudio Nativo (Y-Up)'
    }]`
  );
  logs.push(`>>> Ejecutando script...`);

  const gradientTex = createThreeToneGradientTexture();
  const outThick = callbacks?.outlineThickness ?? 1.25;
  const outOpac = callbacks?.outlineOpacity ?? 0.9;
  const normSmooth = callbacks?.normalSmoothing ?? 0.92;

  let rootGroup = modelWrapper.children.find(
    (c) => (c as THREE.Group).isGroup && !(c as THREE.Mesh).isMesh
  ) as THREE.Group | undefined;
  if (!rootGroup) {
    rootGroup = new THREE.Group();
    rootGroup.name = 'Blender_Scene_Root';
    rootGroup.position.set(0, -1.35, 0);
    while (modelWrapper.children.length > 0) {
      const child = modelWrapper.children[0];
      modelWrapper.remove(child);
      rootGroup.add(child);
    }
    modelWrapper.add(rootGroup);
  }
  const targetParent: THREE.Object3D = rootGroup;

  // Si el script construye geometría nueva (primitivas, bmesh, from_pydata, objects.new) y no es un script explícito de adición (# MODE: APPEND),
  // limpiamos automáticamente la pantalla antes de ejecutar para que nunca queden restos del modelo anterior.
  const isExplicitAppendScript =
    /#\s*MODE\s*:\s*APPEND/i.test(cleanedRawScript) ||
    cleanedRawScript.includes('AÑADIR NUEVOS OBJETOS AL MODELO ACTUAL');
  const isGenerativeScript =
    /\b(?:primitive_[a-z0-9_]+_add|from_pydata|bmesh\.ops\.create_[a-z0-9_]+|bpy\.data\.(?:meshes|objects)\.new|read_factory_settings)\b/.test(
      cleanedRawScript
    );

  if (isGenerativeScript && !isExplicitAppendScript) {
    const prevChildren = [...targetParent.children];
    prevChildren.forEach((child) => {
      child.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          (c as THREE.Mesh).geometry?.dispose();
        }
      });
      targetParent.remove(child);
    });
    targetParent.name = 'Blender_Scene_Root';
    targetParent.scale.setScalar(1);
    targetParent.position.set(0, -1.35, 0);
    targetParent.rotation.set(0, 0, 0);
    clearBlenderAnimations();
  }

  // Conversores de vectores Blender <-> Three.js según modo Z-Up / Y-Up
  const convertLocToThree = (loc?: any): [number, number, number] => {
    if (!loc) return [0, isZUp ? 0 : 1.35, 0];
    const x = Number(loc[0] ?? loc.x) || 0;
    const y = Number(loc[1] ?? loc.y) || 0;
    const z = Number(loc[2] ?? loc.z) || 0;
    return isZUp ? [x, z, -y] : [x, y, z];
  };

  const convertRotToThree = (rot?: any): [number, number, number] => {
    if (!rot) return [0, 0, 0];
    const rx = Number(rot[0] ?? rot.x) || 0;
    const ry = Number(rot[1] ?? rot.y) || 0;
    const rz = Number(rot[2] ?? rot.z) || 0;
    return isZUp ? [rx, rz, -ry] : [rx, ry, rz];
  };

  // En modo Z-Up, la rotación Euler extrínseca XYZ de Blender (R_z * R_y * R_x) conjugada por el cambio
  // de base Z-Up -> Y-Up (X'=X, Y'=Z, Z'=-Y) equivale exactamente al orden intrínseco 'YZX' en Three.js.
  const applyRotOrderForMode = (obj3d: THREE.Object3D, alreadyThreeSpace = false) => {
    obj3d.rotation.order = isZUp && !alreadyThreeSpace ? 'YZX' : 'XYZ';
  };

  const convertScaleToThree = (sc?: any): [number, number, number] => {
    if (sc === undefined || sc === null) return [1, 1, 1];
    if (typeof sc === 'number') return [sc || 1, sc || 1, sc || 1];
    const sx = Number(sc[0] ?? sc.x) || 1;
    const sy = Number(sc[1] ?? sc.y) || 1;
    const sz = Number(sc[2] ?? sc.z) || 1;
    return isZUp ? [sx, sz, sy] : [sx, sy, sz];
  };

  class VertexProxy {
    index: number;
    posAttr: THREE.BufferAttribute;
    normAttr: THREE.BufferAttribute | null;
    _coProxy!: any;
    normal: any;
    dirty: boolean;

    constructor(idx: number, pos: THREE.BufferAttribute, norm: THREE.BufferAttribute | null) {
      this.index = idx;
      this.posAttr = pos;
      this.normAttr = norm;
      this.dirty = false;
      const tx = pos.getX(idx);
      const ty = pos.getY(idx);
      const tz = pos.getZ(idx);

      const self = this;
      let _bx = tx;
      let _by = isZUp ? -tz : ty;
      let _bz = isZUp ? ty : tz;

      this._coProxy = {
        get x() {
          return _bx;
        },
        set x(v: number) {
          _bx = Number(v) || 0;
          self.dirty = true;
          self.syncToBuffer();
        },
        get y() {
          return _by;
        },
        set y(v: number) {
          _by = Number(v) || 0;
          self.dirty = true;
          self.syncToBuffer();
        },
        get z() {
          return _bz;
        },
        set z(v: number) {
          _bz = Number(v) || 0;
          self.dirty = true;
          self.syncToBuffer();
        },
        get 0() {
          return _bx;
        },
        set 0(v: number) {
          this.x = v;
        },
        get 1() {
          return _by;
        },
        set 1(v: number) {
          this.y = v;
        },
        get 2() {
          return _bz;
        },
        set 2(v: number) {
          this.z = v;
        },
        get length() {
          return Math.hypot(_bx, _by, _bz);
        },
        copy() {
          return [_bx, _by, _bz];
        },
        *[Symbol.iterator]() {
          yield _bx;
          yield _by;
          yield _bz;
        },
      };

      const nx = norm ? norm.getX(idx) : 0;
      const ny = norm ? (isZUp ? -norm.getZ(idx) : norm.getY(idx)) : 1;
      const nz = norm ? (isZUp ? norm.getY(idx) : norm.getZ(idx)) : 0;
      this.normal = {
        x: nx,
        y: ny,
        z: nz,
        0: nx,
        1: ny,
        2: nz,
        *[Symbol.iterator]() {
          yield nx;
          yield ny;
          yield nz;
        },
      };
    }

    get co(): any {
      return this._coProxy;
    }

    set co(val: any) {
      if (val && typeof val === 'object') {
        this._coProxy.x = Number(val[0] ?? val.x ?? this._coProxy.x);
        this._coProxy.y = Number(val[1] ?? val.y ?? this._coProxy.y);
        this._coProxy.z = Number(val[2] ?? val.z ?? this._coProxy.z);
      }
    }

    syncToBuffer(): void {
      if (isZUp) {
        this.posAttr.setXYZ(this.index, this._coProxy.x, this._coProxy.z, -this._coProxy.y);
      } else {
        this.posAttr.setXYZ(this.index, this._coProxy.x, this._coProxy.y, this._coProxy.z);
      }
      this.posAttr.needsUpdate = true;
      totalVerticesModified++;
    }

    commit(): boolean {
      if (this.dirty) {
        this.syncToBuffer();
        this.dirty = false;
        return true;
      }
      return false;
    }
  }

  let meshes: THREE.Mesh[] = [];
  let allVertexProxies: VertexProxy[] = [];
  let proxiesDirty = true;
  let objectsCreatedCount = 0;
  let totalVerticesModified = 0;

  const collectMeshes = () => {
    meshes = [];
    modelWrapper.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !child.userData.isOutlineMesh) {
        meshes.push(child as THREE.Mesh);
      }
    });
  };

  const ensureVertexProxies = () => {
    if (!proxiesDirty) return allVertexProxies;
    collectMeshes();
    allVertexProxies = [];
    meshes.forEach((m) => {
      const geo = m.geometry as THREE.BufferGeometry;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const norm = geo.attributes.normal as THREE.BufferAttribute | null;
      if (pos) {
        for (let i = 0; i < pos.count; i++) {
          allVertexProxies.push(new VertexProxy(i, pos, norm));
        }
      }
    });
    proxiesDirty = false;
    return allVertexProxies;
  };

  collectMeshes();

  // ==========================================================================
  // SISTEMA DE MATERIALES Y NODOS PRINCIPLED BSDF + CELSHADE DE BLENDER 5.2
  // ==========================================================================
  interface BlenderMaterialInstance {
    _isBlenderMaterial: true;
    name: string;
    use_nodes: boolean;
    use_backface_culling: boolean;
    blend_method: string;
    diffuse_color: number[];
    metallic: number;
    roughness: number;
    texture?: string;
    _colorMapId: string | null;
    _colorMapTile: number;
    _colorMapViews: PhotoView[] | null;
    _baseColor: THREE.Color;
    _emissionColor: THREE.Color | null;
    _emissionStrength: number;
    _clearcoat: number;
    _clearcoatRoughness: number;
    _anisotropy: number;
    _anisotropyRotation: number;
    _transmission: number;
    _ior: number;
    _alpha: number;
    _useNoiseBump: boolean;
    _bumpScale: number;
    _flipNormals: boolean;
    _customGradientMap: THREE.DataTexture | null;
    _texturePattern: TexturePatternType;
    _textureRepeat: number;
    _textureNaturalColor: boolean;
    _linkedMeshes: Set<THREE.Mesh>;
    _sync: () => void;
    node_tree: {
      nodes: any;
      links: { new: (...args: any[]) => any; clear: () => void };
    };
  }

  const materialsStore: BlenderMaterialInstance[] = [];

  const buildColorRampGradientTexture = (
    elements: { position: number; color: number[] }[],
    interpolation: string = 'CONSTANT'
  ): { tex: THREE.DataTexture; mainColor: THREE.Color | null } => {
    const sorted = [...elements].sort((a, b) => Number(a.position) - Number(b.position));
    const width = 64;
    const data = new Uint8Array(width * 4);
    let brightestColor: THREE.Color | null = null;
    let maxLum = -1;

    for (const el of sorted) {
      const c = parsePythonColor(el.color, '#ffffff');
      const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
      if (lum > maxLum) {
        maxLum = lum;
        brightestColor = c;
      }
    }

    for (let i = 0; i < width; i++) {
      const t = i / (width - 1);
      let chosen = sorted[0]?.color || [0.3, 0.3, 0.3, 1];

      if (String(interpolation).toUpperCase() === 'CONSTANT') {
        for (const el of sorted) {
          if (t >= Number(el.position)) {
            chosen = el.color;
          }
        }
      } else {
        let prev = sorted[0] || { position: 0, color: [0, 0, 0, 1] };
        let next = sorted[sorted.length - 1] || { position: 1, color: [1, 1, 1, 1] };
        for (let k = 0; k < sorted.length - 1; k++) {
          if (t >= Number(sorted[k].position) && t <= Number(sorted[k + 1].position)) {
            prev = sorted[k];
            next = sorted[k + 1];
            break;
          }
        }
        const span = Math.max(0.0001, Number(next.position) - Number(prev.position));
        const localT = Math.max(0, Math.min(1, (t - Number(prev.position)) / span));
        chosen = [
          (Number(prev.color[0]) || 0) * (1 - localT) + (Number(next.color[0]) || 0) * localT,
          (Number(prev.color[1]) || 0) * (1 - localT) + (Number(next.color[1]) || 0) * localT,
          (Number(prev.color[2]) || 0) * (1 - localT) + (Number(next.color[2]) || 0) * localT,
          1,
        ];
      }

      const col = parsePythonColor(chosen, '#ffffff');
      const lumByte = Math.max(35, Math.min(255, Math.round((col.r * 0.3 + col.g * 0.59 + col.b * 0.11) * 255)));
      data[i * 4] = lumByte;
      data[i * 4 + 1] = lumByte;
      data[i * 4 + 2] = lumByte;
      data[i * 4 + 3] = 255;
    }

    const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
    tex.minFilter = String(interpolation).toUpperCase() === 'CONSTANT' ? THREE.NearestFilter : THREE.LinearFilter;
    tex.magFilter = String(interpolation).toUpperCase() === 'CONSTANT' ? THREE.NearestFilter : THREE.LinearFilter;
    tex.needsUpdate = true;
    return { tex, mainColor: brightestColor };
  };

  const createBlenderMaterial = (matName: string = 'Material'): BlenderMaterialInstance => {
    // Inferencia automática de textura procedural si el nombre del material indica piedra, madera, mármol, ladrillo, agua, etc.
    // Como en Blender, el nombre del material no asigna textura: solo `mat.texture = "..."` en el script
    const inferredTex: TexturePatternType = 'none';
    const presetBump = inferredTex !== 'none' ? getTexturePresetInfo(inferredTex).pbr.bumpScale : 0.035;

    const matObj: BlenderMaterialInstance = {
      _isBlenderMaterial: true,
      name: matName,
      use_nodes: true,
      use_backface_culling: false,
      blend_method: 'OPAQUE',
      diffuse_color: [0.8, 0.8, 0.8, 1.0],
      metallic: 0.2,
      roughness: 0.38,
      _baseColor: new THREE.Color('#e11d48'),
      _emissionColor: null,
      _emissionStrength: 0,
      _clearcoat: 0,
      _clearcoatRoughness: 0.06,
      _anisotropy: 0,
      _anisotropyRotation: 0,
      _transmission: 0,
      _ior: 1.45,
      _alpha: 1.0,
      _useNoiseBump: false,
      _bumpScale: presetBump,
      _flipNormals: false,
      _customGradientMap: null,
      _texturePattern: inferredTex,
      _textureRepeat: 2,
      _textureNaturalColor: false,
      _colorMapId: null,
      _colorMapTile: 3,
      _colorMapViews: null,
      _linkedMeshes: new Set<THREE.Mesh>(),
      _sync() {
        const extraPbr: ExtendedPBRMaterialProps = {
          clearcoat: this._clearcoat,
          clearcoatRoughness: this._clearcoatRoughness,
          anisotropy: this._anisotropy,
          anisotropyRotation: this._anisotropyRotation,
          transmission: this._transmission,
          ior: this._ior,
          alpha: this._alpha,
          useNoiseBump: this._useNoiseBump,
          bumpScale: this._bumpScale,
          useBackfaceCulling: this.use_backface_culling,
          flipNormals: this._flipNormals || this.use_backface_culling,
          customGradientMap: this._customGradientMap,
          texturePattern: this._texturePattern,
          textureRepeat: this._textureRepeat,
          textureNaturalColor: this._textureNaturalColor,
          colorMapId: this._colorMapId,
          colorMapTileMeters: this._colorMapTile,
          colorMapViews: this._colorMapViews,
          colorMapZUp: isZUp,
        };
        this._linkedMeshes.forEach((m) => {
          applyMaterialToThreeMesh(
            m,
            this._baseColor,
            this.metallic,
            this.roughness,
            this._emissionColor,
            this._emissionStrength,
            extraPbr
          );
        });
      },
      node_tree: {
        nodes: null,
        links: {
          new: (...linkArgs: any[]) => {
            for (const arg of linkArgs) {
              const sName = String(arg?.name || '').toLowerCase();
              const nType = String(arg?._nodeType || '').toLowerCase();
              if (
                sName.includes('normal') ||
                sName.includes('height') ||
                nType.includes('bump') ||
                nType.includes('texnoise') ||
                nType.includes('voronoi')
              ) {
                matObj._useNoiseBump = true;
              }
              if (nType.includes('texbrick')) {
                matObj._texturePattern = 'brick_mudejar';
              } else if (nType.includes('texchecker')) {
                matObj._texturePattern = 'andalusi_tiles';
              } else if (nType.includes('texwave')) {
                if (matObj._texturePattern === 'none') matObj._texturePattern = 'marble_carrara';
              } else if (nType.includes('texmagic')) {
                matObj._texturePattern = 'stained_glass';
              }
            }
            matObj._sync();
            return {};
          },
          clear: () => {},
        },
      },
    };

    const createSocketProxy = (socketKey: string, ownerNodeType: string = 'BSDF_PRINCIPLED') => {
      let _val: any = socketKey === 'Base Color' ? [0.8, 0.8, 0.8, 1.0] : 0.0;
      return {
        name: socketKey,
        _nodeType: ownerNodeType,
        get default_value() {
          return _val;
        },
        set default_value(v: any) {
          _val = v;
          const kLower = socketKey.toLowerCase();
          const nLower = ownerNodeType.toLowerCase();

          if (nLower.includes('bump')) {
            if (kLower === 'strength' || kLower === 'distance' || kLower === '0' || kLower === '1') {
              matObj._useNoiseBump = true;
              matObj._bumpScale = Math.max(0.005, Math.min(0.25, Number(v) * 0.08 || 0.035));
              matObj._sync();
              return;
            }
          }

          if (nLower.includes('texnoise') || nLower.includes('voronoi')) {
            matObj._useNoiseBump = true;
            matObj._sync();
            return;
          }

          if (
            kLower === 'base color' ||
            kLower === 'color' ||
            kLower === '0' ||
            socketKey === 'ShaderSocket0'
          ) {
            matObj._baseColor = parsePythonColor(v, '#38bdf8');
            if (Array.isArray(v) && v.length >= 4 && typeof v[3] === 'number' && v[3] < 0.99) {
              matObj._alpha = v[3];
            }
            matObj._sync();
          } else if (kLower === 'metallic' || kLower === '4' || kLower === '1') {
            if (typeof v === 'number') {
              matObj.metallic = v;
              matObj._sync();
            }
          } else if (kLower === 'roughness' || kLower === '7' || kLower === '2') {
            if (typeof v === 'number') {
              matObj.roughness = v;
              matObj._sync();
            }
          } else if (kLower === 'coat weight' || kLower === 'clearcoat') {
            matObj._clearcoat = Math.max(0, Math.min(1, Number(v) || 0));
            matObj._sync();
          } else if (kLower === 'coat roughness' || kLower === 'clearcoat roughness') {
            matObj._clearcoatRoughness = Math.max(0.01, Math.min(1, Number(v) || 0.05));
            matObj._sync();
          } else if (kLower === 'anisotropic' || kLower === 'anisotropy') {
            matObj._anisotropy = Math.max(0, Math.min(1, Number(v) || 0));
            matObj._sync();
          } else if (kLower === 'anisotropic rotation') {
            matObj._anisotropyRotation = Number(v) || 0;
            matObj._sync();
          } else if (kLower === 'transmission weight' || kLower === 'transmission') {
            matObj._transmission = Math.max(0, Math.min(1, Number(v) || 0));
            matObj._sync();
          } else if (kLower === 'ior') {
            matObj._ior = Math.max(1.0, Math.min(2.5, Number(v) || 1.45));
            matObj._sync();
          } else if (kLower === 'alpha') {
            matObj._alpha = Math.max(0.02, Math.min(1, Number(v) ?? 1));
            matObj._sync();
          } else if (kLower.includes('emission') && !kLower.includes('strength')) {
            matObj._emissionColor = parsePythonColor(v, '#38bdf8');
            if (matObj._emissionStrength === 0) matObj._emissionStrength = 1.5;
            matObj._sync();
          } else if (kLower === 'emission strength' || kLower === 'strength') {
            matObj._emissionStrength = Number(v) || 0;
            matObj._sync();
          } else if (kLower === 'texture' || kLower === 'pattern' || kLower === 'textura') {
            matObj._texturePattern = resolveTexturePatternId(String(v));
            matObj._sync();
          } else if (kLower === 'repeat' || kLower === 'scale' || kLower === 'tiling') {
            matObj._textureRepeat = Math.max(1, Math.min(16, Number(v) || 2));
            matObj._sync();
          }
        },
      };
    };

    const createShaderNode = (nodeName: string, nodeType: string = 'ShaderNodeBsdfPrincipled') => {
      const nLower = nodeType.toLowerCase();
      if (nLower.includes('texnoise') || nLower.includes('bump') || nLower.includes('voronoi')) {
        matObj._useNoiseBump = true;
        matObj._sync();
      } else if (nLower.includes('texbrick')) {
        matObj._texturePattern = 'brick_mudejar';
        matObj._sync();
      } else if (nLower.includes('texchecker')) {
        matObj._texturePattern = 'andalusi_tiles';
        matObj._sync();
      } else if (nLower.includes('texmagic')) {
        matObj._texturePattern = 'stained_glass';
        matObj._sync();
      }

      const nodeSocketsMap: Record<string, any> = {};
      const nodeInputsProxy = new Proxy(nodeSocketsMap, {
        get(target, prop) {
          if (typeof prop === 'string') {
            if (prop === 'get') {
              return (name: string) => {
                if (!target[name]) target[name] = createSocketProxy(name, nodeType);
                return target[name];
              };
            }
            if (!target[prop]) {
              target[prop] = createSocketProxy(prop, nodeType);
            }
            return target[prop];
          }
          return Reflect.get(target, prop);
        },
        has() {
          return true;
        },
      });

      const rampElementsRaw: { position: number; color: number[] }[] = [
        { position: 0.0, color: [0.08, 0.08, 0.12, 1.0] },
        { position: 0.5, color: [0.85, 0.85, 0.9, 1.0] },
      ];
      let rampInterpolation = 'LINEAR';

      const syncRampToMaterial = () => {
        if (
          nLower.includes('valtorgb') ||
          nLower.includes('colorramp') ||
          nodeName.toLowerCase().includes('colorramp')
        ) {
          const { tex, mainColor } = buildColorRampGradientTexture(rampElementsRaw, rampInterpolation);
          matObj._customGradientMap = tex;
          if (mainColor) {
            matObj._baseColor = mainColor;
          }
          matObj._sync();
        }
      };

      const wrapRampElement = (el: { position: number; color: number[] }) =>
        new Proxy(el, {
          set(t, p, val) {
            Reflect.set(t, p, val);
            syncRampToMaterial();
            return true;
          },
        });

      const wrappedElements = rampElementsRaw.map(wrapRampElement);

      const colorRampProxy = new Proxy(
        {
          get interpolation() {
            return rampInterpolation;
          },
          set interpolation(v: string) {
            rampInterpolation = String(v || 'CONSTANT');
            syncRampToMaterial();
          },
          elements: new Proxy(wrappedElements, {
            get(arr, p) {
              if (p === 'new') {
                return (pos: number) => {
                  const rawEl = { position: Number(pos) || 0, color: [1, 1, 1, 1] };
                  rampElementsRaw.push(rawEl);
                  const wrapped = wrapRampElement(rawEl);
                  arr.push(wrapped);
                  syncRampToMaterial();
                  return wrapped;
                };
              }
              if (p === 'remove') {
                return (el: any) => {
                  const idx = arr.indexOf(el);
                  if (idx !== -1) {
                    arr.splice(idx, 1);
                    rampElementsRaw.splice(idx, 1);
                    syncRampToMaterial();
                  }
                };
              }
              return Reflect.get(arr, p);
            },
          }),
        },
        {}
      );

      if (nLower.includes('valtorgb') || nLower.includes('shadertorgb')) {
        syncRampToMaterial();
      }

      return {
        name: nodeName,
        type: nodeType,
        location: [0, 0],
        inputs: nodeInputsProxy,
        outputs: new Proxy(
          {},
          {
            get: (_t, outProp) => ({
              name: String(outProp),
              _nodeType: nodeType,
              default_value: [1, 1, 1, 1],
            }),
          }
        ),
        color_ramp: colorRampProxy,
      };
    };

    const nodesDict: Record<string, any> = {
      'Principled BSDF': createShaderNode('Principled BSDF', 'BSDF_PRINCIPLED'),
      'Material Output': createShaderNode('Material Output', 'OUTPUT_MATERIAL'),
      Emission: createShaderNode('Emission', 'EMISSION'),
    };

    matObj.node_tree.nodes = new Proxy(nodesDict, {
      get(target, prop) {
        if (prop === 'get') {
          return (name: string) => target[name] || target['Principled BSDF'];
        }
        if (prop === 'new') {
          return (...rawArgs: unknown[]) => {
            const { type } = extractPyArgs(rawArgs, ['type'], { type: 'ShaderNodeBsdfPrincipled' });
            const tStr = String(type);
            if (tStr.toLowerCase().includes('principled')) {
              return target['Principled BSDF'];
            }
            const node = createShaderNode(tStr, tStr);
            target[tStr] = node;
            return node;
          };
        }
        if (prop === 'clear') {
          return () => {};
        }
        if (prop === 'remove') {
          return () => {};
        }
        if (typeof prop === 'string') {
          if (!target[prop]) {
            target[prop] = createShaderNode(prop, prop);
          }
          return target[prop];
        }
        return Reflect.get(target, prop);
      },
    });

    return new Proxy(matObj, {
      set(target, prop, value) {
        if (prop === 'diffuse_color') {
          target.diffuse_color = value;
          target._baseColor = parsePythonColor(value, '#38bdf8');
          if (Array.isArray(value) && value.length >= 4 && typeof value[3] === 'number' && value[3] < 0.99) {
            target._alpha = value[3];
          }
          target._sync();
          return true;
        }
        if (prop === 'metallic') {
          target.metallic = Number(value) || 0;
          target._sync();
          return true;
        }
        if (prop === 'roughness') {
          target.roughness = Number(value) || 0.35;
          target._sync();
          return true;
        }
        if (prop === 'use_backface_culling') {
          target.use_backface_culling = Boolean(value);
          target._sync();
          return true;
        }
        if (prop === 'blend_method') {
          target.blend_method = String(value);
          target._sync();
          return true;
        }
        if (prop === 'texture' || prop === 'pattern' || prop === 'textura') {
          target._texturePattern = resolveTexturePatternId(String(value));
          // Como al crear un material con patrón: el relieve toma el valor del patrón si no se fijó otro
          if (target._texturePattern !== 'none' && target._bumpScale === 0.035) {
            target._bumpScale = getTexturePresetInfo(target._texturePattern).pbr.bumpScale;
          }
          target._sync();
          return true;
        }
        if (prop === 'texture_repeat' || prop === 'repeat') {
          target._textureRepeat = Math.max(1, Math.min(16, Number(value) || 2));
          target._sync();
          return true;
        }
        if (prop === 'natural_color') {
          target._textureNaturalColor = Boolean(value);
          target._sync();
          return true;
        }
        // Mapa de color con imagen: mat.color_map = "cal_blanca" (o un nombre de "Mis texturas")
        if (prop === 'color_map' || prop === 'textura_imagen' || prop === 'imagen') {
          target._colorMapId = value == null || value === '' ? null : slugifyTextureId(String(value));
          target._sync();
          // Si no se precargó (nombre en una variable), se carga ahora y se vuelve a aplicar
          const pendingId = target._colorMapId;
          if (pendingId && !isColorMapLoaded(pendingId)) {
            void ensureColorMapLoaded(pendingId).then((ok) => {
              if (ok && target._colorMapId === pendingId) target._sync();
            });
          }
          return true;
        }
        // Fotos proyectadas: mat.color_map_views = [["x", 0, u0, v0, u1, v1, h0, h1, w0, w1], ...]
        if (prop === 'color_map_views' || prop === 'vistas_foto') {
          target._colorMapViews = Array.isArray(value)
            ? (value as unknown[][]).map((v) => Array.from(v as ArrayLike<unknown>) as unknown as PhotoView)
            : null;
          target._sync();
          return true;
        }
        // Metros por repetición de la imagen: mat.color_map_scale = 2.5
        if (prop === 'color_map_scale' || prop === 'tile_m') {
          target._colorMapTile = Math.max(0.05, Math.min(200, Number(value) || 3));
          target._sync();
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    });
  };

  // ==========================================================================
  // SISTEMA DE OBJETOS Y MODIFICADORES DE BLENDER 5.2 (`BlenderObjectProxy`)
  // ==========================================================================
  interface PendingModifier {
    name: string;
    type: string;
    levels: number;
    render_levels: number;
    use_axis: boolean[];
    mirror_object: any;
    width: number;
    segments: number;
    thickness: number;
    offset: number;
    use_flip_normals: boolean;
    material_offset: number;
    count: number;
    use_relative_offset: boolean;
    relative_offset_displace: number[];
    use_constant_offset: boolean;
    constant_offset_displace: number[];
    use_object_offset: boolean;
    offset_object: any;
    ratio: number;
    angle: number;
    factor: number;
    _applied: boolean;
  }

  const allObjectProxies: any[] = [];
  let currentActiveObjProxy: any = null;

  const createBlenderObjectProxy = (mesh: THREE.Mesh) => {
    applyRotOrderForMode(mesh);
    const locProxy = createBlenderVectorProxy(
      () => [mesh.position.x, mesh.position.y, mesh.position.z],
      (x, y, z) => mesh.position.set(x, y, z),
      'location',
      isZUp
    );
    const scaleProxy = createBlenderVectorProxy(
      () => [mesh.scale.x, mesh.scale.y, mesh.scale.z],
      (x, y, z) => mesh.scale.set(x, y, z),
      'scale',
      isZUp
    );
    const rotProxy = createBlenderVectorProxy(
      () => [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
      (x, y, z) => {
        applyRotOrderForMode(mesh);
        mesh.rotation.set(x, y, z);
      },
      'rotation',
      isZUp
    );

    const assignedMaterials: BlenderMaterialInstance[] = [];
    const modifiersList: PendingModifier[] = [];

    const linkMatToMesh = (mat: any, slotIndex: number = 0) => {
      if (!mat) return;
      if (slotIndex > 0) {
        // Segundo slot de material (usado frecuentemente con SOLIDIFY material_offset = 1 para Outlines estilo Anime)
        return;
      }
      if (mat._isBlenderMaterial) {
        mat._linkedMeshes.add(mesh);
        mat._sync();
      } else if (Array.isArray(mat) || typeof mat === 'string') {
        const c = parsePythonColor(mat as any);
        applyMaterialToThreeMesh(mesh, c);
      }
    };

    const materialsArrayProxy = new Proxy(assignedMaterials, {
      get(target, prop) {
        if (prop === 'append') {
          return (mat: any) => {
            const slotIdx = target.length;
            target.push(mat);
            linkMatToMesh(mat, slotIdx);
          };
        }
        if (prop === 'clear') {
          return () => {
            target.length = 0;
          };
        }
        return Reflect.get(target, prop);
      },
      set(target, prop, value) {
        const idx = Number(prop);
        if (!Number.isNaN(idx)) {
          target[idx] = value;
          linkMatToMesh(value, idx);
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    });

    const modifiersProxy = new Proxy(modifiersList, {
      get(target, prop) {
        if (prop === 'new') {
          return (...rawArgs: unknown[]) => {
            const { name, type } = extractPyArgs(rawArgs, ['name', 'type'], {
              name: 'Modifier',
              type: 'SUBSURF',
            });
            const mod: PendingModifier = {
              name: String(name),
              type: String(type).toUpperCase(),
              levels: 2,
              render_levels: 2,
              use_axis: [true, false, false],
              mirror_object: null,
              width: 0.03,
              segments: 2,
              thickness: 0.04,
              offset: -1,
              use_flip_normals: false,
              material_offset: 0,
              count: 2,
              use_relative_offset: true,
              relative_offset_displace: [1.0, 0, 0],
              use_constant_offset: false,
              constant_offset_displace: [0, 0, 0],
              use_object_offset: false,
              offset_object: null,
              ratio: 0.5,
              angle: 0.4,
              factor: 0.4,
              _applied: false,
            };
            target.push(mod);
            return mod;
          };
        }
        if (prop === 'remove') {
          return (mod: PendingModifier) => {
            const idx = target.indexOf(mod);
            if (idx !== -1) target.splice(idx, 1);
          };
        }
        if (prop === 'get') {
          return (name: string) => target.find((m) => m.name === name) || null;
        }
        if (typeof prop === 'string' && Number.isNaN(Number(prop))) {
          const byName = target.find((m) => m.name === prop);
          if (byName) return byName;
        }
        return Reflect.get(target, prop);
      },
    });

    const getMeshVertexProxies = () => {
      const geo = mesh.geometry as THREE.BufferGeometry;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const norm = geo.attributes.normal as THREE.BufferAttribute | null;
      const list: VertexProxy[] = [];
      if (pos) {
        for (let i = 0; i < pos.count; i++) {
          list.push(new VertexProxy(i, pos, norm));
        }
      }
      return list;
    };

    const objData = {
      _geometry: mesh.geometry,
      _threeMesh: mesh,
      materials: materialsArrayProxy,
      bevel_depth: 0,
      bevel_resolution: 2,
      extrude: 0,
      use_auto_smooth: true,
      energy: 1000,
      color: [1, 1, 1],
      size: 2.0,
      get vertices() {
        return getMeshVertexProxies();
      },
      get polygons() {
        const pos = mesh.geometry.attributes.position;
        const count = pos ? Math.floor(pos.count / 3) : 0;
        const polyArr: any[] = [];
        for (let pIdx = 0; pIdx < count; pIdx++) {
          polyArr.push({
            index: pIdx,
            use_smooth: true,
            material_index: 0,
            vertices: [pIdx * 3, pIdx * 3 + 1, pIdx * 3 + 2],
          });
        }
        (polyArr as any).foreach_set = () => {};
        return polyArr;
      },
      update: () => {
        mesh.geometry.computeVertexNormals();
      },
    };

    const rawObj = {
      _threeMesh: mesh,
      _modifiers: modifiersList,
      _assignedMaterials: assignedMaterials,
      name: mesh.name,
      type: 'MESH',
      mode: 'OBJECT',
      data: objData,
      location: locProxy,
      position: locProxy,
      scale: scaleProxy,
      rotation_euler: rotProxy,
      rotation: rotProxy,
      modifiers: modifiersProxy,
      parent: null as any,
      hide_viewport: false,
      hide_render: false,
      show_wire: false,
      get matrix_world() {
        return [
          [mesh.scale.x, 0, 0, mesh.position.x],
          [0, mesh.scale.y, 0, mesh.position.y],
          [0, 0, mesh.scale.z, mesh.position.z],
          [0, 0, 0, 1],
        ];
      },
      evaluated_get: () => rawObj,
      to_mesh: () => objData,
      select_set: () => {},
      select_get: () => true,
      hide_set: () => {},
      keyframe_insert: () => {},
      copy: () => {
        const clonedGeo = mesh.geometry.clone();
        const clonedMesh = new THREE.Mesh(clonedGeo);
        clonedMesh.position.copy(mesh.position);
        clonedMesh.rotation.copy(mesh.rotation);
        clonedMesh.scale.copy(mesh.scale);
        const origMat = mesh.userData.originalMaterial as THREE.MeshStandardMaterial | undefined;
        const col = origMat ? origMat.color.clone() : new THREE.Color('#38bdf8');
        configureNewlySpawnedMesh(clonedMesh, col, gradientTex, outThick, outOpac, mesh.userData.pbrProps);
        return createBlenderObjectProxy(clonedMesh);
      },
    };

    const proxy = new Proxy(rawObj, {
      get(target, prop) {
        if (prop === 'name') return mesh.name;
        if (prop === 'active_material') return assignedMaterials[0] || null;
        if (prop === 'material_slots') {
          return new Proxy(assignedMaterials, {
            get(arr, idxProp) {
              const idx = Number(idxProp);
              if (!Number.isNaN(idx)) {
                return {
                  get material() {
                    return arr[idx];
                  },
                  set material(m: any) {
                    arr[idx] = m;
                    linkMatToMesh(m, idx);
                  },
                };
              }
              return Reflect.get(arr, idxProp);
            },
          });
        }
        if (prop === 'dimensions') {
          mesh.geometry.computeBoundingBox();
          const bb = mesh.geometry.boundingBox;
          const sz = new THREE.Vector3(1, 1, 1);
          if (bb) bb.getSize(sz);
          const dx = sz.x * mesh.scale.x;
          const dy = sz.y * mesh.scale.y;
          const dz = sz.z * mesh.scale.z;
          return isZUp ? [dx, dz, dy] : [dx, dy, dz];
        }
        return Reflect.get(target, prop);
      },
      set(target, prop, value) {
        if (prop === 'name') {
          mesh.name = String(value);
          target.name = String(value);
          return true;
        }
        if (prop === 'location' || prop === 'position') {
          if (Array.isArray(value)) {
            const [tx, ty, tz] = convertLocToThree(value);
            mesh.position.set(tx, ty, tz);
          } else if (value && typeof value === 'object') {
            locProxy.copy(value);
          }
          return true;
        }
        if (prop === 'scale') {
          if (Array.isArray(value) || typeof value === 'number') {
            const [sx, sy, sz] = convertScaleToThree(value);
            mesh.scale.set(sx, sy, sz);
          } else if (value && typeof value === 'object') {
            scaleProxy.copy(value);
          }
          return true;
        }
        if (prop === 'dimensions' && Array.isArray(value)) {
          mesh.geometry.computeBoundingBox();
          const bb = mesh.geometry.boundingBox;
          const sz = new THREE.Vector3(1, 1, 1);
          if (bb) bb.getSize(sz);
          const [tx, ty, tz] = convertScaleToThree(value);
          mesh.scale.set(
            tx / Math.max(0.001, sz.x),
            ty / Math.max(0.001, sz.y),
            tz / Math.max(0.001, sz.z)
          );
          return true;
        }
        if (prop === 'rotation_euler' || prop === 'rotation') {
          applyRotOrderForMode(mesh);
          if (Array.isArray(value)) {
            const [rx, ry, rz] = convertRotToThree(value);
            mesh.rotation.set(rx, ry, rz);
          } else if (value && typeof value === 'object') {
            rotProxy.copy(value);
          }
          return true;
        }
        if (prop === 'active_material' || prop === 'color') {
          assignedMaterials[0] = value;
          linkMatToMesh(value, 0);
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    });

    allObjectProxies.push(proxy);
    return proxy;
  };

  // Inicializar todos los objetos actuales de la escena para que `for obj in list(bpy.data.objects): bpy.data.objects.remove(obj)` funcione
  if (meshes.length > 0) {
    meshes.forEach((m) => {
      currentActiveObjProxy = createBlenderObjectProxy(m);
    });
  } else {
    const dummyMesh = new THREE.Mesh(new THREE.BufferGeometry());
    dummyMesh.name = 'Scene_Root';
    currentActiveObjProxy = createBlenderObjectProxy(dummyMesh);
  }

  const spawnPrimitiveMesh = (
    name: string,
    geometry: THREE.BufferGeometry,
    opts?: {
      location?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number] | number;
      color?: [number, number, number] | string;
      alreadyThreeSpace?: boolean;
    }
  ) => {
    const col = parsePythonColor(opts?.color, '#e11d48');
    const mesh = new THREE.Mesh(geometry);
    mesh.name = `${name}_${objectsCreatedCount + 1}`;
    const inThree = Boolean(opts?.alreadyThreeSpace);

    if (opts?.location && Array.isArray(opts.location)) {
      const [tx, ty, tz] = inThree
        ? [
            Number(opts.location[0]) || 0,
            Number(opts.location[1]) || 0,
            Number(opts.location[2]) || 0,
          ]
        : convertLocToThree(opts.location);
      mesh.position.set(tx, ty, tz);
    } else {
      mesh.position.set(0, isZUp && !inThree ? 0 : 1.35, 0);
    }

    applyRotOrderForMode(mesh, inThree);
    if (opts?.rotation && Array.isArray(opts.rotation)) {
      const [rx, ry, rz] = inThree
        ? [
            Number(opts.rotation[0]) || 0,
            Number(opts.rotation[1]) || 0,
            Number(opts.rotation[2]) || 0,
          ]
        : convertRotToThree(opts.rotation);
      mesh.rotation.set(rx, ry, rz);
    }

    if (opts?.scale !== undefined) {
      const [sx, sy, sz] = inThree
        ? typeof opts.scale === 'number'
          ? [opts.scale, opts.scale, opts.scale]
          : [
              Number(opts.scale[0]) || 1,
              Number(opts.scale[1]) || 1,
              Number(opts.scale[2]) || 1,
            ]
        : convertScaleToThree(opts.scale);
      mesh.scale.set(sx, sy, sz);
    }

    configureNewlySpawnedMesh(mesh, col, gradientTex, outThick, outOpac);

    targetParent.add(mesh);
    objectsCreatedCount++;
    proxiesDirty = true;
    collectMeshes();

    currentActiveObjProxy = createBlenderObjectProxy(mesh);

    logs.push(
      `+ Objeto creado: '${mesh.name}' (${Math.floor(
        (mesh.geometry.attributes.position?.count || 0) / 3
      )} tris)`
    );
    return currentActiveObjProxy;
  };

  // Subdividir cada triángulo de un BufferGeometry en 4 triángulos (para SUBSURF y BEVEL de cajas)
  const subdivideGeometryTriangles = (geo: THREE.BufferGeometry, levels: number = 1): THREE.BufferGeometry => {
    let current = geo.index ? geo.toNonIndexed() : geo.clone();
    const passes = Math.min(2, Math.max(1, Math.floor(levels)));
    for (let pass = 0; pass < passes; pass++) {
      const pos = current.attributes.position as THREE.BufferAttribute;
      if (!pos || pos.count < 3 || pos.count > 24000) break;
      const newPositions = new Float32Array(pos.count * 4 * 3);
      let outIdx = 0;
      const writeV = (x: number, y: number, z: number) => {
        newPositions[outIdx++] = x;
        newPositions[outIdx++] = y;
        newPositions[outIdx++] = z;
      };
      for (let i = 0; i + 2 < pos.count; i += 3) {
        const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
        const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
        const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);
        const abx = (ax + bx) * 0.5, aby = (ay + by) * 0.5, abz = (az + bz) * 0.5;
        const bcx = (bx + cx) * 0.5, bcy = (by + cy) * 0.5, bcz = (bz + cz) * 0.5;
        const cax = (cx + ax) * 0.5, cay = (cy + ay) * 0.5, caz = (cz + az) * 0.5;

        writeV(ax, ay, az); writeV(abx, aby, abz); writeV(cax, cay, caz);
        writeV(bx, by, bz); writeV(bcx, bcy, bcz); writeV(abx, aby, abz);
        writeV(cx, cy, cz); writeV(cax, cay, caz); writeV(bcx, bcy, bcz);
        writeV(abx, aby, abz); writeV(bcx, bcy, bcz); writeV(cax, cay, caz);
      }
      const nextGeo = new THREE.BufferGeometry();
      nextGeo.setAttribute('position', new THREE.BufferAttribute(newPositions.subarray(0, outIdx), 3));
      nextGeo.computeVertexNormals();
      current = nextGeo;
    }
    return current;
  };

  // Procesador de modificadores de Blender 5.2 (MIRROR, SUBSURF, BEVEL, SOLIDIFY, ARRAY, DECIMATE)
  const applyPendingModifiersForObject = async (objProxy: any) => {
    const mesh: THREE.Mesh | undefined = objProxy?._threeMesh;
    const mods: PendingModifier[] | undefined = objProxy?._modifiers;
    if (!mesh || !mods || mods.length === 0 || !mesh.parent) return;

    for (const mod of mods) {
      if (mod._applied) continue;
      mod._applied = true;

      const mType = mod.type.toUpperCase();
      if (mType === 'BEVEL') {
        const width = Math.max(0.005, Math.min(0.35, Number(mod.width) || 0.02));
        const segments = Math.min(4, Math.max(1, Number(mod.segments) || 2));
        // Si la malla tiene pocos triángulos (ej. un cubo de 12 triángulos), subdividir para poder biselar los bordes
        const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
        if (posAttr && posAttr.count <= 72) {
          mesh.geometry = subdivideGeometryTriangles(mesh.geometry, segments >= 2 ? 2 : 1);
        }
        const wrapperGroup = new THREE.Group();
        const tempClone = new THREE.Mesh(mesh.geometry);
        wrapperGroup.add(tempClone);
        applyGlobalLaplacianSmoothing(wrapperGroup, segments, Math.min(0.45, width * 6.5));
        mesh.geometry.computeVertexNormals();
        prepareGeometryNormals(mesh);
        if (mesh.userData.outlineMesh) {
          (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
        }
        logs.push(`Modifier BEVEL (width=${width}, segments=${segments}) aplicado sobre '${mesh.name}'.`);
      } else if (mType === 'SUBSURF' || mType === 'SUBDIVISION_SURFACE') {
        const levels = Math.min(3, Math.max(1, Number(mod.levels ?? mod.render_levels) || 2));
        const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
        if (posAttr && posAttr.count <= 4000) {
          mesh.geometry = subdivideGeometryTriangles(mesh.geometry, Math.min(2, levels));
        }
        const wrapperGroup = new THREE.Group();
        const tempClone = new THREE.Mesh(mesh.geometry);
        wrapperGroup.add(tempClone);
        applyGlobalLaplacianSmoothing(wrapperGroup, levels + 1, 0.48);
        mesh.geometry.computeVertexNormals();
        prepareGeometryNormals(mesh);
        if (mesh.userData.outlineMesh) {
          (mesh.userData.outlineMesh as THREE.Mesh).geometry = mesh.geometry;
        }
        logs.push(`Modifier SUBSURF (levels=${levels}) aplicado sobre '${mesh.name}'.`);
      } else if (mType === 'MIRROR') {
        const useX = Array.isArray(mod.use_axis) ? Boolean(mod.use_axis[0]) : true;
        const useY = Array.isArray(mod.use_axis) ? Boolean(mod.use_axis[1]) : false;
        const useZ = Array.isArray(mod.use_axis) ? Boolean(mod.use_axis[2]) : false;

        const mirrorCenter = mod.mirror_object?._threeMesh
          ? mod.mirror_object._threeMesh.position.clone()
          : new THREE.Vector3(0, 0, 0);

        const spawnMirrorAxis = (flipX: boolean, flipThreeY: boolean, flipThreeZ: boolean) => {
          const clonedGeo = mesh.geometry.clone();
          const cloneMesh = new THREE.Mesh(clonedGeo);
          cloneMesh.name = `${mesh.name}_Mirror`;
          cloneMesh.position.set(
            flipX ? 2 * mirrorCenter.x - mesh.position.x : mesh.position.x,
            flipThreeY ? 2 * mirrorCenter.y - mesh.position.y : mesh.position.y,
            flipThreeZ ? 2 * mirrorCenter.z - mesh.position.z : mesh.position.z
          );
          cloneMesh.rotation.set(
            flipThreeY || flipThreeZ ? -mesh.rotation.x : mesh.rotation.x,
            flipX || flipThreeZ ? -mesh.rotation.y : mesh.rotation.y,
            flipX || flipThreeY ? -mesh.rotation.z : mesh.rotation.z
          );
          cloneMesh.scale.copy(mesh.scale);
          cloneMesh.userData.isMirroredClone = true;

          // Si el objeto estaba en x == mirrorCenter.x (vértices desplazados en local), espejar la geometría
          if (
            flipX &&
            Math.abs(mesh.position.x - mirrorCenter.x) < 0.02
          ) {
            clonedGeo.scale(-1, 1, 1);
            // Invertir el orden de vértices por triángulo para conservar las normales hacia afuera
            const pos = clonedGeo.attributes.position as THREE.BufferAttribute;
            if (pos) {
              for (let i = 0; i < pos.count; i += 3) {
                const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
                const x2 = pos.getX(i + 2), y2 = pos.getY(i + 2), z2 = pos.getZ(i + 2);
                pos.setXYZ(i + 1, x2, y2, z2);
                pos.setXYZ(i + 2, x1, y1, z1);
              }
            }
            clonedGeo.computeVertexNormals();
          }

          const origMat = mesh.userData.originalMaterial as THREE.MeshPhysicalMaterial | undefined;
          const col = origMat ? origMat.color.clone() : new THREE.Color('#38bdf8');
          const savedPbr: ExtendedPBRMaterialProps = {
            ...(mesh.userData.pbrProps || {}),
            metallic: origMat?.metalness,
            roughness: origMat?.roughness,
            emissionColor: origMat?.emissive,
            emissionStrength: origMat?.emissiveIntensity,
          };
          configureNewlySpawnedMesh(cloneMesh, col, gradientTex, outThick, outOpac, savedPbr);
          applyMaterialToThreeMesh(
            cloneMesh,
            col,
            savedPbr.metallic ?? 0.2,
            savedPbr.roughness ?? 0.38,
            savedPbr.emissionColor,
            savedPbr.emissionStrength ?? 0,
            savedPbr
          );
          targetParent.add(cloneMesh);
          objectsCreatedCount++;
        };

        if (useX) spawnMirrorAxis(true, false, false);
        if (useY) spawnMirrorAxis(false, !isZUp, isZUp);
        if (useZ) spawnMirrorAxis(false, isZUp, !isZUp);
        logs.push(`Modifier MIRROR aplicado sobre '${mesh.name}'.`);
      } else if (mType === 'ARRAY') {
        const count = Math.min(150, Math.max(1, Number(mod.count) || 2));
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        const size = new THREE.Vector3(1, 1, 1);
        if (bb) bb.getSize(size);
        size.multiply(mesh.scale);

        const rel = convertLocToThree(mod.relative_offset_displace || [1, 0, 0]);
        const cst = convertLocToThree(mod.constant_offset_displace || [0, 0, 0]);
        const offsetMesh: THREE.Object3D | undefined = mod.offset_object?._threeMesh;

        const origMat = mesh.userData.originalMaterial as THREE.MeshPhysicalMaterial | undefined;
        const col = origMat ? origMat.color.clone() : new THREE.Color('#38bdf8');
        const savedPbr: ExtendedPBRMaterialProps = {
          ...(mesh.userData.pbrProps || {}),
          metallic: origMat?.metalness,
          roughness: origMat?.roughness,
          emissionColor: origMat?.emissive,
          emissionStrength: origMat?.emissiveIntensity,
        };

        for (let k = 1; k < count; k++) {
          const cloneGeo = mesh.geometry.clone();
          const cloneMesh = new THREE.Mesh(cloneGeo);
          cloneMesh.name = `${mesh.name}_Array_${k}`;

          if (mod.use_object_offset && offsetMesh) {
            // Array radial o por objeto de referencia (ej. 20 radios de llanta o rosetón gótico)
            const stepRotX = offsetMesh.rotation.x * k;
            const stepRotY = offsetMesh.rotation.y * k;
            const stepRotZ = offsetMesh.rotation.z * k;
            const pivot = offsetMesh.position.clone();
            const relPos = mesh.position.clone().sub(pivot);
            relPos.applyEuler(new THREE.Euler(stepRotX, stepRotY, stepRotZ));
            cloneMesh.position.copy(pivot.add(relPos));
            cloneMesh.rotation.set(
              mesh.rotation.x + stepRotX,
              mesh.rotation.y + stepRotY,
              mesh.rotation.z + stepRotZ
            );
          } else {
            cloneMesh.position.set(
              mesh.position.x +
                k *
                  ((mod.use_relative_offset ? rel[0] * size.x : 0) +
                    (mod.use_constant_offset ? cst[0] : 0)),
              mesh.position.y +
                k *
                  ((mod.use_relative_offset ? rel[1] * size.y : 0) +
                    (mod.use_constant_offset ? cst[1] : 0)),
              mesh.position.z +
                k *
                  ((mod.use_relative_offset ? rel[2] * size.z : 0) +
                    (mod.use_constant_offset ? cst[2] : 0))
            );
            cloneMesh.rotation.copy(mesh.rotation);
          }

          cloneMesh.scale.copy(mesh.scale);
          configureNewlySpawnedMesh(cloneMesh, col, gradientTex, outThick, outOpac, savedPbr);
          applyMaterialToThreeMesh(
            cloneMesh,
            col,
            savedPbr.metallic ?? 0.2,
            savedPbr.roughness ?? 0.38,
            savedPbr.emissionColor,
            savedPbr.emissionStrength ?? 0,
            savedPbr
          );
          targetParent.add(cloneMesh);
          objectsCreatedCount++;
        }
        logs.push(`Modifier ARRAY (count=${count}) aplicado sobre '${mesh.name}'.`);
      } else if (mType === 'SOLIDIFY') {
        const rawThick = Number(mod.thickness) || 0.04;
        // Detectar técnica de Outline CelShade con Solidify (use_flip_normals=True, grosor negativo o material_offset=1)
        if (mod.use_flip_normals || rawThick < 0 || Number(mod.material_offset) >= 1) {
          const outlineMesh = mesh.userData.outlineMesh as THREE.Mesh | undefined;
          if (outlineMesh) {
            const absThick = Math.min(4.0, Math.max(0.6, Math.abs(rawThick) * 38));
            const outlineMat = createComicOutlineMaterial(absThick, 0.98);
            const secondMat = objProxy?._assignedMaterials?.[1] as BlenderMaterialInstance | undefined;
            if (secondMat && outlineMat.uniforms?.uOutlineColor) {
              const outCol = secondMat._emissionColor || secondMat._baseColor;
              if (outCol) outlineMat.uniforms.uOutlineColor.value.copy(outCol);
            }
            outlineMesh.material = outlineMat;
            outlineMesh.visible = true;
          }
          logs.push(
            `Modifier SOLIDIFY (CelShade Outline / Flip Normals, thickness=${rawThick}) aplicado sobre '${mesh.name}'.`
          );
        } else {
          const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
          const norm = mesh.geometry.attributes.normal as THREE.BufferAttribute;
          if (pos && norm) {
            for (let i = 0; i < pos.count; i++) {
              pos.setXYZ(
                i,
                pos.getX(i) + norm.getX(i) * rawThick * 0.35,
                pos.getY(i) + norm.getY(i) * rawThick * 0.35,
                pos.getZ(i) + norm.getZ(i) * rawThick * 0.35
              );
            }
            pos.needsUpdate = true;
            mesh.geometry.computeVertexNormals();
          }
          logs.push(`Modifier SOLIDIFY (thickness=${rawThick}) aplicado sobre '${mesh.name}'.`);
        }
      }
    }
  };

  // Crear colección iterable estilo Blender (`bpy.data.objects`, `bpy.data.meshes`, `bpy.data.materials`)
  const createDataCollection = (items: any[], createFn: (...args: any[]) => any) => {
    return new Proxy(items, {
      get(target, prop) {
        if (prop === 'new') return createFn;
        if (prop === 'get') {
          return (name: string) => target.find((it) => it?.name === name) || null;
        }
        if (prop === 'remove') {
          return (...rawRemoveArgs: any[]) => {
            const item = rawRemoveArgs[0];
            const idx = target.indexOf(item);
            if (idx !== -1) target.splice(idx, 1);
            if (item?._threeMesh && item._threeMesh.parent) {
              item._threeMesh.parent.remove(item._threeMesh);
              proxiesDirty = true;
              collectMeshes();
              if (meshes.length === 0) {
                targetParent.scale.set(1, 1, 1);
                targetParent.position.set(0, -1.35, 0);
                targetParent.rotation.set(0, 0, 0);
              }
            }
          };
        }
        if (typeof prop === 'string' && Number.isNaN(Number(prop)) && prop !== 'length' && prop !== '__isKw') {
          const byName = target.find((it) => it?.name === prop);
          if (byName) return byName;
          if (typeof createFn === 'function') {
            const autoCreated = createFn({ name: prop, __isKw: true });
            if (autoCreated) {
              if (autoCreated.name === undefined) autoCreated.name = prop;
              return autoCreated;
            }
          }
        }
        return Reflect.get(target, prop);
      },
    });
  };

  const meshesStore: any[] = [];

  const createCustomMeshData = (...rawArgs: unknown[]) => {
    const { name: meshName } = extractPyArgs(rawArgs, ['name'], { name: 'CustomMesh' });
    const customGeo = new THREE.BufferGeometry();
    const meshMaterials: any[] = [];
    const meshMaterialsProxy = new Proxy(meshMaterials, {
      get(target, prop) {
        if (prop === 'append') {
          return (mat: any) => {
            target.push(mat);
            const ownerProxy = (meshDataObj as any)._ownerProxy;
            if (ownerProxy && ownerProxy.data && ownerProxy.data.materials) {
              ownerProxy.data.materials.append(mat);
            }
          };
        }
        if (prop === 'clear') {
          return () => {
            target.length = 0;
            const ownerProxy = (meshDataObj as any)._ownerProxy;
            if (ownerProxy && ownerProxy.data && ownerProxy.data.materials) {
              ownerProxy.data.materials.clear();
            }
          };
        }
        return Reflect.get(target, prop);
      },
      set(target, prop, value) {
        const idx = Number(prop);
        if (!Number.isNaN(idx)) {
          target[idx] = value;
          const ownerProxy = (meshDataObj as any)._ownerProxy;
          if (ownerProxy && ownerProxy.data && ownerProxy.data.materials) {
            ownerProxy.data.materials[idx] = value;
          }
          return true;
        }
        return Reflect.set(target, prop, value);
      },
    });

    const syncGeometryToBoundMesh = (newGeo: THREE.BufferGeometry) => {
      meshDataObj._threeGeometry = newGeo;
      meshDataObj._geometry = newGeo;
      meshDataObj._needsRebuild = true;
      const boundMesh: THREE.Mesh | null =
        meshDataObj._threeMesh || (meshDataObj._ownerProxy?._threeMesh as THREE.Mesh | null) || null;
      if (boundMesh) {
        boundMesh.geometry = newGeo;
        prepareGeometryNormals(boundMesh);
        const posAttr = boundMesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
        if (posAttr && posAttr.count > 0) {
          boundMesh.userData.initialPositions = new Float32Array(posAttr.array);
        }
        meshDataObj._geometry = boundMesh.geometry;
        if (boundMesh.userData.outlineMesh) {
          (boundMesh.userData.outlineMesh as THREE.Mesh).geometry = boundMesh.geometry;
        }
        const mats = [
          boundMesh.material,
          boundMesh.userData.originalMaterial,
          boundMesh.userData.toonMaterial,
          boundMesh.userData.matcapMaterial,
        ];
        for (const m of mats) {
          if (m && typeof m === 'object' && 'side' in m) {
            (m as THREE.Material).side = THREE.DoubleSide;
          }
        }
      }
    };

    const meshDataObj = {
      name: String(meshName),
      users: 1,
      _geometry: customGeo,
      _threeGeometry: customGeo,
      _threeMesh: null as THREE.Mesh | null,
      _ownerProxy: null as any,
      _needsRebuild: false,
      materials: meshMaterialsProxy,
      polygons: [] as any[],
      vertices: [] as any[],
      _syncGeometryToBoundMesh: syncGeometryToBoundMesh,
      from_pydata: (...fdArgs: unknown[]) => {
        const { vertices: rawVerts, faces: rawFaces } = extractPyArgs(
          fdArgs,
          ['vertices', 'edges', 'faces'],
          { vertices: [], edges: [], faces: [] }
        );
        const verts: any[] = Array.isArray(rawVerts) ? rawVerts : [];
        const faces: any[] = Array.isArray(rawFaces) ? rawFaces : [];
        const positions: number[] = [];
        const uvs: number[] = [];

        const transformedVerts: [number, number, number][] = verts.map((v: any) => {
          const vx = Number(v?.[0] ?? v?.x) || 0;
          const vy = Number(v?.[1] ?? v?.y) || 0;
          const vz = Number(v?.[2] ?? v?.z) || 0;
          return isZUp ? [vx, vz, -vy] : [vx, vy, vz];
        });

        const pushTriangle = (
          a: [number, number, number],
          b: [number, number, number],
          c: [number, number, number]
        ) => {
          positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
          uvs.push(a[0], a[2], b[0], b[2], c[0], c[2]);
        };

        for (const rawFace of faces) {
          const faceIndices: number[] = Array.isArray(rawFace)
            ? rawFace.map((idxOrV: any) => Number(typeof idxOrV === 'object' ? idxOrV?.index : idxOrV))
            : Array.isArray(rawFace?.verts)
              ? rawFace.verts.map((v: any) => Number(v?.index ?? v))
              : [];

          if (faceIndices.length === 3) {
            const v0 = transformedVerts[faceIndices[0]];
            const v1 = transformedVerts[faceIndices[1]];
            const v2 = transformedVerts[faceIndices[2]];
            if (v0 && v1 && v2) pushTriangle(v0, v1, v2);
          } else if (faceIndices.length >= 4) {
            const v0 = transformedVerts[faceIndices[0]];
            for (let k = 1; k < faceIndices.length - 1; k++) {
              const v1 = transformedVerts[faceIndices[k]];
              const v2 = transformedVerts[faceIndices[k + 1]];
              if (v0 && v1 && v2) pushTriangle(v0, v1, v2);
            }
          }
        }

        if (positions.length === 0 && transformedVerts.length > 0) {
          const sz = 0.04;
          for (let i = 0; i < transformedVerts.length; i++) {
            const p = transformedVerts[i];
            positions.push(
              p[0] - sz, p[1] - sz, p[2],
              p[0] + sz, p[1] - sz, p[2],
              p[0], p[1] + sz, p[2]
            );
            uvs.push(0, 0, 1, 0, 0.5, 1);
          }
        }

        const builtGeo = new THREE.BufferGeometry();
        builtGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        builtGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        builtGeo.computeVertexNormals();
        syncGeometryToBoundMesh(builtGeo);
        logs.push(
          `mesh.from_pydata: ${transformedVerts.length} vértices y ${faces.length} caras ensambladas.`
        );
      },
      update: () => {
        meshDataObj._geometry.computeVertexNormals();
        if (meshDataObj._threeMesh) {
          prepareGeometryNormals(meshDataObj._threeMesh);
        }
      },
    };
    meshesStore.push(meshDataObj);
    return meshDataObj;
  };

  const linkObjectToScene = (objProxy: any) => {
    if (objProxy && objProxy._threeMesh) {
      const mesh = objProxy._threeMesh as THREE.Mesh;
      const customMeshData = objProxy._meshData || objProxy.data;
      if (customMeshData?._threeGeometry && customMeshData._threeGeometry.attributes?.position?.count > 0) {
        mesh.geometry = customMeshData._threeGeometry;
      }
      if (!mesh.parent) {
        const col = objProxy._color || new THREE.Color('#22d3ee');
        configureNewlySpawnedMesh(mesh, col, gradientTex, outThick, outOpac);
        if (customMeshData) {
          customMeshData._threeMesh = mesh;
          customMeshData._geometry = mesh.geometry;
        }
        const pendingMats = [
          ...(Array.isArray(objProxy._pendingMaterials) ? objProxy._pendingMaterials : []),
          ...(Array.isArray(customMeshData?.materials) ? customMeshData.materials : []),
        ];
        if (pendingMats.length > 0) {
          pendingMats.forEach((m: any) => {
            if (m) objProxy.data.materials.append(m);
          });
        }
        const mats = [
          mesh.material,
          mesh.userData.originalMaterial,
          mesh.userData.toonMaterial,
          mesh.userData.matcapMaterial,
        ];
        for (const m of mats) {
          if (m && typeof m === 'object' && 'side' in m) {
            (m as THREE.Material).side = THREE.DoubleSide;
          }
        }
        targetParent.add(mesh);
        objProxy._threeObject = mesh;
        objectsCreatedCount++;
        proxiesDirty = true;
        collectMeshes();
      }
      currentActiveObjProxy = objProxy;
      logs.push(`Objeto '${objProxy.name || 'Custom_Mesh'}' vinculado a la colección de escena.`);
    }
  };

  // Safe proxy generator so unknown Blender scene/render settings, operators, and properties never crash
  const createSafeNoopProxy = (extra: Record<string, any> = {}): any => {
    function NoopConstructor(this: any) {
      return this instanceof NoopConstructor ? this : createSafeNoopProxy();
    }
    NoopConstructor.prototype = {};
    return new Proxy(NoopConstructor, {
      has(target, prop) {
        return prop in extra || prop in target;
      },
      get(target, prop) {
        if (prop in extra) return extra[prop as string];
        if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
        if (prop === Symbol.toPrimitive) return () => 0;
        if (prop === 'valueOf') return () => 0;
        if (prop === 'toString') return () => '';
        if (prop === Symbol.iterator) {
          return function* () {};
        }
        if (prop === 'prototype') return target.prototype;
        if (prop === 'objects') {
          return {
            link: linkObjectToScene,
            unlink: () => {},
          };
        }
        return createSafeNoopProxy();
      },
      set(_target, prop, value) {
        extra[prop as string] = value;
        return true;
      },
      apply() {
        return createSafeNoopProxy();
      },
      construct() {
        return createSafeNoopProxy();
      },
    });
  };

  const sceneObjectsProxy = new Proxy(allObjectProxies, {
    get(target, prop) {
      if (prop === 'link') return linkObjectToScene;
      if (prop === 'unlink') return () => {};
      if (prop === 'active') return currentActiveObjProxy;
      if (typeof prop === 'string' && Number.isNaN(Number(prop)) && prop !== 'length') {
        const byName = target.find((it) => it?.name === prop);
        if (byName) return byName;
      }
      return Reflect.get(target, prop);
    },
    set(target, prop, value) {
      if (prop === 'active') {
        currentActiveObjProxy = value;
        return true;
      }
      return Reflect.set(target, prop, value);
    },
  });

  // Entorno World de Blender 5.2 (Background Node Color + Strength -> HemisphereLight / AmbientLight en Three.js)
  let worldEnvLight: THREE.HemisphereLight | null = null;
  let worldBgColor = new THREE.Color('#d8dee9');
  let worldBgStrength = 0.85;

  const syncWorldEnvironmentLight = () => {
    if (!worldEnvLight) {
      const groundCol = worldBgColor.clone().multiplyScalar(0.35);
      worldEnvLight = new THREE.HemisphereLight(
        worldBgColor,
        groundCol,
        Math.min(2.5, Math.max(0.1, worldBgStrength))
      );
      worldEnvLight.name = 'Blender_World_Environment';
      targetParent.add(worldEnvLight);
    } else {
      worldEnvLight.color.copy(worldBgColor);
      worldEnvLight.groundColor.copy(worldBgColor).multiplyScalar(0.35);
      worldEnvLight.intensity = Math.min(2.5, Math.max(0.1, worldBgStrength));
    }
  };

  const createWorldSocketProxy = (key: string) => {
    let _val: any = key === '0' || key.toLowerCase().includes('color') ? [0.75, 0.78, 0.82, 1.0] : 1.0;
    return {
      name: key,
      get default_value() {
        return _val;
      },
      set default_value(v: any) {
        _val = v;
        const kLow = key.toLowerCase();
        if (kLow === '0' || kLow.includes('color')) {
          worldBgColor = parsePythonColor(v, '#d8dee9');
          syncWorldEnvironmentLight();
        } else if (kLow === '1' || kLow.includes('strength')) {
          worldBgStrength = Number(v) || 1.0;
          syncWorldEnvironmentLight();
        }
      },
    };
  };

  const worldBgNode = {
    name: 'Background',
    type: 'BACKGROUND',
    inputs: new Proxy({} as Record<string, any>, {
      get(t, p) {
        if (typeof p === 'string') {
          if (p === 'get') return (n: string) => (t[n] = t[n] || createWorldSocketProxy(n));
          if (!t[p]) t[p] = createWorldSocketProxy(p);
          return t[p];
        }
        return Reflect.get(t, p);
      },
    }),
    outputs: createSafeNoopProxy(),
  };

  const worldProxyObj = new Proxy(
    {
      name: 'World',
      use_nodes: true,
      get color() {
        return [worldBgColor.r, worldBgColor.g, worldBgColor.b];
      },
      set color(v: any) {
        worldBgColor = parsePythonColor(v, '#d8dee9');
        syncWorldEnvironmentLight();
      },
      node_tree: {
        nodes: new Proxy(
          { Background: worldBgNode, 'World Output': createSafeNoopProxy() } as Record<string, any>,
          {
            get(t, p) {
              if (p === 'get') return (n: string) => t[n] || worldBgNode;
              if (p === 'new') return () => worldBgNode;
              if (typeof p === 'string') return t[p] || worldBgNode;
              return Reflect.get(t, p);
            },
          }
        ),
        links: createSafeNoopProxy(),
      },
    },
    {
      get(t, p) {
        if (p in t) return (t as any)[p];
        return createSafeNoopProxy();
      },
      set(t, p, v) {
        if (p === 'color') {
          worldBgColor = parsePythonColor(v, '#d8dee9');
          syncWorldEnvironmentLight();
          return true;
        }
        return Reflect.set(t, p, v);
      },
    }
  );

  const createBlenderLightObject = (
    lightName: string,
    lightType: string = 'SUN',
    loc?: [number, number, number],
    rot?: [number, number, number],
    energyVal?: number,
    colorVal?: any
  ) => {
    const lType = String(lightType || 'SUN').toUpperCase();
    const lCol = parsePythonColor(colorVal, '#fff8e7');
    let rawEnergy = energyVal !== undefined ? Number(energyVal) : lType === 'SUN' ? 3.0 : 400;

    const computeThreeIntensity = (e: number) => {
      if (lType === 'SUN') return Math.min(4.5, Math.max(0.2, e * 0.55));
      return Math.min(5.0, Math.max(0.25, e / 180));
    };

    let threeLight: THREE.Light;
    if (lType === 'SUN' || lType === 'AREA') {
      threeLight = new THREE.DirectionalLight(lCol, computeThreeIntensity(rawEnergy));
    } else if (lType === 'SPOT') {
      threeLight = new THREE.SpotLight(lCol, computeThreeIntensity(rawEnergy), 35, Math.PI / 3, 0.35);
    } else {
      threeLight = new THREE.PointLight(lCol, computeThreeIntensity(rawEnergy), 30);
    }

    threeLight.name = lightName;
    if (loc && Array.isArray(loc)) {
      const [tx, ty, tz] = convertLocToThree(loc);
      threeLight.position.set(tx, ty, tz);
    } else {
      threeLight.position.set(4, 7, 5);
    }
    if (rot && Array.isArray(rot)) {
      const [rx, ry, rz] = convertRotToThree(rot);
      threeLight.rotation.set(rx, ry, rz);
    }
    targetParent.add(threeLight);

    const lightDataProxy = new Proxy(
      {
        name: lightName,
        type: lType,
        size: 2.0,
        angle: 0.5,
        use_shadow: true,
        _threeLight: threeLight,
      },
      {
        get(t, p) {
          if (p === 'energy') return rawEnergy;
          if (p === 'color') return [threeLight.color.r, threeLight.color.g, threeLight.color.b];
          return Reflect.get(t, p);
        },
        set(t, p, v) {
          if (p === 'energy') {
            rawEnergy = Number(v) || 1;
            threeLight.intensity = computeThreeIntensity(rawEnergy);
            return true;
          }
          if (p === 'color') {
            threeLight.color.copy(parsePythonColor(v, '#ffffff'));
            return true;
          }
          return Reflect.set(t, p, v);
        },
      }
    );

    const locProxy = createBlenderVectorProxy(
      () => [threeLight.position.x, threeLight.position.y, threeLight.position.z],
      (x, y, z) => threeLight.position.set(x, y, z),
      'location',
      isZUp
    );
    const rotProxy = createBlenderVectorProxy(
      () => [threeLight.rotation.x, threeLight.rotation.y, threeLight.rotation.z],
      (x, y, z) => threeLight.rotation.set(x, y, z),
      'rotation',
      isZUp
    );
    const scaleProxy = createBlenderVectorProxy(
      () => [threeLight.scale.x, threeLight.scale.y, threeLight.scale.z],
      (x, y, z) => threeLight.scale.set(x, y, z),
      'scale',
      isZUp
    );

    const lightObjProxy = new Proxy(
      {
        name: lightName,
        type: 'LIGHT',
        _threeMesh: threeLight as any,
        data: lightDataProxy,
        location: locProxy,
        rotation_euler: rotProxy,
        rotation: rotProxy,
        scale: scaleProxy,
        modifiers: createSafeNoopProxy(),
      },
      {
        set(t, p, v) {
          if (p === 'location' && Array.isArray(v)) {
            const [tx, ty, tz] = convertLocToThree(v);
            threeLight.position.set(tx, ty, tz);
            return true;
          }
          if ((p === 'rotation_euler' || p === 'rotation') && Array.isArray(v)) {
            const [rx, ry, rz] = convertRotToThree(v);
            threeLight.rotation.set(rx, ry, rz);
            return true;
          }
          return Reflect.set(t, p, v);
        },
      }
    );

    allObjectProxies.push(lightObjProxy);
    currentActiveObjProxy = lightObjProxy;
    logs.push(`+ Luz 3D creada: '${lightName}' (tipo=${lType}).`);
    return lightObjProxy;
  };

  const sceneProxyObj = new Proxy(
    {
      name: 'Scene',
      collection: {
        name: 'Master Collection',
        objects: sceneObjectsProxy,
        children: {
          link: () => {},
        },
      },
      objects: sceneObjectsProxy,
      view_layers: createSafeNoopProxy(),
      render: new Proxy(
        {
          engine: 'BLENDER_EEVEE_NEXT',
          resolution_x: 1920,
          resolution_y: 1080,
          resolution_percentage: 100,
          film_transparent: false,
        },
        {
          get(t, p) {
            if (p in t) return (t as any)[p];
            return createSafeNoopProxy();
          },
          set(t, p, v) {
            (t as any)[p] = v;
            if (p === 'engine') {
              const engStr = String(v || '').toUpperCase();
              if (engStr.includes('CYCLES')) {
                callbacks?.onRenderEngineChange?.('cycles');
                logs.push(`[Blender 5.2 Render]: Motor cambiado a CYCLES (Path-Tracing Físico Multi-Muestra).`);
              } else if (engStr.includes('EEVEE')) {
                callbacks?.onRenderEngineChange?.('eevee');
                logs.push(`[Blender 5.2 Render]: Motor cambiado a EEVEE (Tiempo Real + Bloom + IBL).`);
              } else if (engStr.includes('WORKBENCH') || engStr.includes('MATCAP')) {
                callbacks?.onRenderEngineChange?.('matcap');
                logs.push(`[Blender 5.2 Render]: Motor cambiado a WORKBENCH (MatCap Escultura).`);
              } else if (engStr.includes('CEL') || engStr.includes('TOON') || engStr.includes('ANIME')) {
                callbacks?.onRenderEngineChange?.('cel');
                logs.push(`[Blender 5.2 Render]: Motor cambiado a CEL-SHADING (Anime 3 Tonos + Contorno).`);
              } else if (engStr.includes('NORMAL')) {
                callbacks?.onRenderEngineChange?.('normals');
                logs.push(`[Blender 5.2 Render]: Motor cambiado a NORMALES RGB (Inspección Topológica).`);
              } else if (engStr.includes('ORIGINAL') || engStr.includes('PBR')) {
                callbacks?.onRenderEngineChange?.('original');
                logs.push(`[Blender 5.2 Render]: Motor cambiado a PBR ESTÁNDAR.`);
              }
            }
            return true;
          },
        }
      ),
      cycles: new Proxy(
        {
          samples: 64,
          preview_samples: 32,
          use_denoising: true,
          device: 'GPU',
          clearcoat: 0.58,
          roughness_factor: 0.75,
          ior: 1.5,
          gi_bounce: 1.35,
          progressive_accum: true,
        },
        {
          get(t, p) {
            if (p in t) return (t as any)[p];
            return createSafeNoopProxy();
          },
          set(t, p, v) {
            (t as any)[p] = v;
            if (p === 'samples' || p === 'preview_samples') {
              const s = Math.max(16, Math.min(256, Number(v) || 64));
              callbacks?.onRenderSettingsChange?.({ cyclesSamples: s });
              logs.push(`[Blender 5.2 Cycles]: Muestras configuradas a ${s} SPP.`);
            } else if (p === 'clearcoat' || p === 'coat_weight') {
              const c = Math.max(0, Math.min(1, Number(v) ?? 0.58));
              callbacks?.onRenderSettingsChange?.({ cyclesClearcoat: c });
              logs.push(`[Blender 5.2 Cycles]: Barniz Clearcoat configurado a ${Math.round(c * 100)}%.`);
            } else if (p === 'roughness_factor' || p === 'roughness') {
              const r = Math.max(0.15, Math.min(1.4, Number(v) || 0.75));
              callbacks?.onRenderSettingsChange?.({ cyclesRoughnessFactor: r });
              logs.push(`[Blender 5.2 Cycles]: Multiplicador de rugosidad ajustado a ${r.toFixed(2)}.`);
            } else if (p === 'ior') {
              const ior = Math.max(1.0, Math.min(2.4, Number(v) || 1.5));
              callbacks?.onRenderSettingsChange?.({ cyclesIor: ior });
              logs.push(`[Blender 5.2 Cycles]: Índice de refracción IOR ajustado a ${ior.toFixed(2)}.`);
            } else if (p === 'gi_bounce' || p === 'max_bounces') {
              const raw = Number(v) || 1.35;
              const gi = raw > 3 ? Math.min(2.4, 0.8 + raw * 0.12) : Math.max(0.6, Math.min(2.4, raw));
              callbacks?.onRenderSettingsChange?.({ cyclesGiBounceBoost: gi });
              logs.push(`[Blender 5.2 Cycles]: Rebote de luz indirecta (GI) ajustado a ${gi.toFixed(2)}x.`);
            } else if (p === 'progressive_accum' || p === 'use_progressive_refine') {
              const prog = Boolean(v);
              callbacks?.onRenderSettingsChange?.({ cyclesProgressiveAccum: prog });
              logs.push(`[Blender 5.2 Cycles]: Acumulación progresiva Monte Carlo = ${prog ? 'ON' : 'OFF'}.`);
            }
            return true;
          },
        }
      ),
      eevee: new Proxy(
        {
          use_bloom: true,
          bloom_intensity: 0.45,
          env_intensity: 1.45,
          use_ssr: true,
          use_gtao: true,
        },
        {
          get(t, p) {
            if (p in t) return (t as any)[p];
            return createSafeNoopProxy();
          },
          set(t, p, v) {
            (t as any)[p] = v;
            if (p === 'bloom_intensity') {
              const b = Math.max(0, Math.min(1.8, Number(v) || 0.45));
              callbacks?.onRenderSettingsChange?.({ eeveeBloomIntensity: b });
              logs.push(`[Blender 5.2 EEVEE]: Intensidad de Bloom ajustada a ${b.toFixed(2)}.`);
            } else if (p === 'env_intensity' || p === 'ibl_intensity') {
              const env = Math.max(0.2, Math.min(3.0, Number(v) || 1.45));
              callbacks?.onRenderSettingsChange?.({ eeveeEnvIntensity: env });
              logs.push(`[Blender 5.2 EEVEE]: Reflejos HDRI IBL ajustados a ${env.toFixed(2)}x.`);
            } else if (p === 'use_bloom' && v === false) {
              callbacks?.onRenderSettingsChange?.({ eeveeBloomIntensity: 0 });
            }
            return true;
          },
        }
      ),
      world: worldProxyObj,
      frame_start: 1,
      frame_end: 250,
      frame_current: 1,
    },
    {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return createSafeNoopProxy();
      },
      set() {
        return true;
      },
    }
  );

  const handleAnimWater = (...rawArgs: unknown[]) => {
    const opts = extractPyArgs(
      rawArgs,
      ['objeto', 'speed', 'amplitude', 'frequency', 'color'],
      { speed: 1.8, amplitude: 0.05, frequency: 3.2 }
    );
    const cand = opts.objeto ?? opts.object ?? opts.obj ?? rawArgs[0];
    const hasExplicitMesh =
      cand &&
      typeof cand === 'object' &&
      ('_threeMesh' in (cand as any) || '_threeObject' in (cand as any) || (cand as any).isMesh);
    const objProxy = hasExplicitMesh ? (cand as any) : currentActiveObjProxy;
    const mesh: THREE.Mesh | undefined =
      objProxy?._threeMesh ?? objProxy?._threeObject ?? (objProxy?.isMesh ? objProxy : undefined);
    if (!mesh || !(mesh as THREE.Mesh).isMesh) return;

    const speedVal = Number(opts.velocidad ?? opts.speed ?? (typeof rawArgs[1] === 'number' ? rawArgs[1] : 1.8)) || 1.8;
    const ampVal = Number(opts.amplitud ?? opts.amplitude ?? 0.05);
    const freqVal = Number(opts.frecuencia ?? opts.frequency ?? 3.2);

    const origMat = (mesh.userData.originalMaterial || mesh.material) as THREE.MeshStandardMaterial | undefined;
    const baseColor = opts.color
      ? parsePythonColor(opts.color, '#38bdf8')
      : origMat && origMat.color
      ? origMat.color.clone()
      : new THREE.Color('#38bdf8');

    setBlenderWater(mesh, baseColor, speedVal, ampVal, freqVal);
    logs.push(
      `bpy.anim.water(object='${mesh.name}', speed=${speedVal}, amplitude=${ampVal}, frequency=${freqVal})`
    );
  };

  const handleAnimLoop = (...rawArgs: unknown[]) => {
    const opts = extractPyArgs(
      rawArgs,
      ['objeto', 'duracion', 'funcion', 'type', 'speed', 'amplitude', 'axis'],
      { duracion: 1.0, speed: 1.0, amplitude: 0.15, axis: 'Y' }
    );
    const cand = opts.objeto ?? opts.object ?? opts.obj ?? rawArgs[0];
    const hasExplicitObj =
      cand &&
      typeof cand === 'object' &&
      ('_threeMesh' in (cand as any) || '_threeObject' in (cand as any) || (cand as any).isObject3D);
    const objProxy = hasExplicitObj ? (cand as any) : currentActiveObjProxy;
    const mesh: THREE.Object3D | undefined =
      objProxy?._threeMesh ?? objProxy?._threeObject ?? (objProxy?.isObject3D ? objProxy : undefined);
    if (!mesh) return;

    const fnCandidate =
      opts.funcion ??
      opts.fn ??
      opts.callback ??
      (typeof rawArgs[2] === 'function'
        ? rawArgs[2]
        : typeof rawArgs[1] === 'function'
        ? rawArgs[1]
        : undefined);

    if (typeof fnCandidate === 'function') {
      const duracion = Number(opts.duracion ?? opts.duration ?? (typeof rawArgs[1] === 'number' ? rawArgs[1] : 1.0)) || 1.0;
      addBlenderLoop({
        object: mesh,
        base: mesh.position.clone(),
        scale: 1,
        duration: Math.max(0.1, duracion),
        presetType: 'CALLBACK',
        sample: (t: number): [number, number, number] => {
          const r = fnCandidate.length >= 2 ? fnCandidate(objProxy, t) : fnCandidate(t);
          if (Array.isArray(r) && r.length >= 3 && typeof r[0] === 'number') {
            return [Number(r[0]) || 0, Number(r[1]) || 0, Number(r[2]) || 0];
          }
          return [0, 0, 0];
        },
        toThree: (v: [number, number, number]): [number, number, number] =>
          isZUp ? [v[0], v[2], -v[1]] : [v[0], v[1], v[2]],
      });
      logs.push(`bpy.anim.loop(object='${mesh.name}', duration=${duracion})`);
      return;
    }

    // Modo por tipo predefinido: 'TURNTABLE', 'HOVER', 'PULSE', 'PENDULUM', 'ORBIT'
    const rawType = String(
      opts.type ?? opts.mode ?? opts.tipo ?? (typeof rawArgs[1] === 'string' ? rawArgs[1] : 'TURNTABLE')
    ).toUpperCase();
    let presetType: 'TURNTABLE' | 'HOVER' | 'PULSE' | 'PENDULUM' | 'ORBIT' = 'TURNTABLE';
    if (rawType.includes('HOVER') || rawType.includes('FLOAT') || rawType.includes('BOB') || rawType.includes('WAVE')) {
      presetType = 'HOVER';
    } else if (rawType.includes('PULSE') || rawType.includes('SCALE') || rawType.includes('BREATH')) {
      presetType = 'PULSE';
    } else if (rawType.includes('PENDULUM') || rawType.includes('SWING') || rawType.includes('ROCK')) {
      presetType = 'PENDULUM';
    } else if (rawType.includes('ORBIT') || rawType.includes('CIRCLE')) {
      presetType = 'ORBIT';
    } else {
      presetType = 'TURNTABLE';
    }

    const speedVal = Number(opts.speed ?? opts.velocidad ?? 1.0) || 1.0;
    const ampVal = Number(opts.amplitude ?? opts.amplitud ?? 0.15);
    const rawAxis = String(opts.axis ?? opts.eje ?? 'Y').toUpperCase();
    // Si el script está en Z-Up y pide rotar sobre 'Z' (vertical de Blender), en Three.js el eje vertical es 'Y'
    let threeAxis: 'X' | 'Y' | 'Z' = 'Y';
    if (rawAxis === 'X') threeAxis = 'X';
    else if (rawAxis === 'Z') threeAxis = isZUp ? 'Y' : 'Z';
    else if (rawAxis === 'Y') threeAxis = isZUp ? 'Y' : 'Y';

    addBlenderLoop({
      object: mesh,
      base: mesh.position.clone(),
      baseRot: mesh.rotation.clone(),
      baseScale: mesh.scale.clone(),
      scale: 1,
      duration: Math.max(0.2, 2.0 / Math.max(0.1, Math.abs(speedVal))),
      presetType,
      speed: speedVal,
      amplitude: ampVal,
      axis: threeAxis,
      sample: () => [0, 0, 0],
      toThree: (v) => v,
    });
    logs.push(
      `bpy.anim.loop(object='${mesh.name}', type='${presetType}', speed=${speedVal}, amplitude=${ampVal})`
    );
  };

  const animModuleProxy = createSafeNoopProxy({
    water: handleAnimWater,
    agua: handleAnimWater,
    ocean: handleAnimWater,
    waves: handleAnimWater,
    loop: handleAnimLoop,
    animate: handleAnimLoop,
    turntable: (...args: unknown[]) => handleAnimLoop(...args, { __isKw: true, type: 'TURNTABLE' }),
    rotate: (...args: unknown[]) => handleAnimLoop(...args, { __isKw: true, type: 'TURNTABLE' }),
    spin: (...args: unknown[]) => handleAnimLoop(...args, { __isKw: true, type: 'TURNTABLE' }),
    hover: (...args: unknown[]) => handleAnimLoop(...args, { __isKw: true, type: 'HOVER' }),
    float: (...args: unknown[]) => handleAnimLoop(...args, { __isKw: true, type: 'HOVER' }),
    pulse: (...args: unknown[]) => handleAnimLoop(...args, { __isKw: true, type: 'PULSE' }),
    pendulum: (...args: unknown[]) => handleAnimLoop(...args, { __isKw: true, type: 'PENDULUM' }),
    orbit: (...args: unknown[]) => handleAnimLoop(...args, { __isKw: true, type: 'ORBIT' }),
  });

  const bpy = {
    _extractArgs: extractPyArgs,
    // Animaciones en vivo a 60 FPS: bpy.anim.water / bpy.anim.agua y bpy.anim.loop
    anim: animModuleProxy,
    _get: (obj: any, key: any, defVal: any = null) => {
      if (obj == null) return defVal;
      if (typeof obj.get === 'function') {
        const r = obj.get(key, defVal);
        return r !== undefined && r !== null ? r : defVal;
      }
      if (obj instanceof Map) {
        return obj.has(key) ? obj.get(key) : defVal;
      }
      if (typeof obj === 'object' && key in obj && obj[key] !== undefined) {
        return obj[key];
      }
      return defVal;
    },
    _setdefault: (obj: any, key: any, defVal: any = null) => {
      if (obj && typeof obj === 'object') {
        if (!(key in obj) || obj[key] === undefined) {
          obj[key] = defVal;
        }
        return obj[key];
      }
      return defVal;
    },
    _vecOpAssign: (target: any, op: string, rhs: any) => {
      if (!target || typeof target !== 'object') return target;
      const isScalar = typeof rhs === 'number';
      const rx = isScalar ? rhs : Number(rhs?.[0] ?? rhs?.x ?? (op === '*' || op === '/' ? 1 : 0));
      const ry = isScalar ? rhs : Number(rhs?.[1] ?? rhs?.y ?? (op === '*' || op === '/' ? 1 : 0));
      const rz = isScalar ? rhs : Number(rhs?.[2] ?? rhs?.z ?? (op === '*' || op === '/' ? 1 : 0));

      const apply = (a: number, b: number) => {
        if (op === '+') return a + b;
        if (op === '-') return a - b;
        if (op === '*') return a * b;
        if (op === '/') return b !== 0 ? a / b : a;
        return a;
      };

      if ('x' in target && 'y' in target && 'z' in target) {
        target.x = apply(Number(target.x) || 0, rx);
        target.y = apply(Number(target.y) || 0, ry);
        target.z = apply(Number(target.z) || 0, rz);
      } else if (Array.isArray(target)) {
        target[0] = apply(Number(target[0]) || 0, rx);
        target[1] = apply(Number(target[1]) || 0, ry);
        if (target.length > 2) target[2] = apply(Number(target[2]) || 0, rz);
      }
      return target;
    },
    _repeatList: (arr: any[], count: number) => {
      const n = Math.max(0, Math.floor(Number(count) || 0));
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        out.push(...(Array.isArray(arr) ? arr : [arr]));
      }
      return out;
    },
    _slice: (seq: any, start?: number | null, stop?: number | null, step?: number | null) => {
      if (seq == null) return [];
      const isStr = typeof seq === 'string';
      const arr = isStr ? seq.split('') : Array.isArray(seq) ? seq : Array.from(seq);
      const len = arr.length;
      const st = step == null ? 1 : Number(step);
      if (st === 0) return isStr ? '' : [];

      let s: number;
      let e: number;
      if (st > 0) {
        s = start == null ? 0 : start < 0 ? Math.max(0, len + start) : Math.min(len, start);
        e = stop == null ? len : stop < 0 ? Math.max(0, len + stop) : Math.min(len, stop);
        const res: any[] = [];
        for (let i = s; i < e; i += st) res.push(arr[i]);
        return isStr ? res.join('') : res;
      } else {
        s = start == null ? len - 1 : start < 0 ? len + start : Math.min(len - 1, start);
        e = stop == null ? -1 : stop < 0 ? len + stop : stop;
        const res: any[] = [];
        for (let i = s; i > e; i += st) {
          if (i >= 0 && i < len) res.push(arr[i]);
        }
        return isStr ? res.join('') : res;
      }
    },
    _sliceAssign: (target: any, startOrVal: any, stop?: number | null, val?: any) => {
      if (!target || typeof target !== 'object') return target;
      if (stop === undefined && val === undefined) {
        // Caso 2 argumentos: `arr[:] = val`
        const vals = Array.isArray(startOrVal) ? startOrVal : Array.from(startOrVal || []);
        if (Array.isArray(target)) {
          target.splice(0, target.length, ...vals);
        } else {
          for (let i = 0; i < vals.length; i++) target[i] = vals[i];
        }
        return target;
      }
      const vals = Array.isArray(val) ? val : Array.from(val || []);
      const s = Math.max(0, Number(startOrVal) || 0);
      const e = stop == null ? s + vals.length : Number(stop);
      for (let i = s; i < e && i - s < vals.length; i++) {
        target[i] = vals[i - s];
      }
      return target;
    },
    _add: (a: any, b: any) => {
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
      if (
        (Array.isArray(a) || a?._isMathutils || (a && 'x' in a)) &&
        (Array.isArray(b) || b?._isMathutils || (b && 'x' in b))
      ) {
        if (a?._isMathutils || b?._isMathutils || ('x' in a && 'x' in b)) {
          return createMathutilsVector([
            Number(a[0] ?? a.x ?? 0) + Number(b[0] ?? b.x ?? 0),
            Number(a[1] ?? a.y ?? 0) + Number(b[1] ?? b.y ?? 0),
            Number(a[2] ?? a.z ?? 0) + Number(b[2] ?? b.z ?? 0),
          ]);
        }
        if (Array.isArray(a) && Array.isArray(b)) {
          return [...a, ...b];
        }
      }
      return (a as any) + (b as any);
    },
    _sub: (a: any, b: any) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (
        (Array.isArray(a) || a?._isMathutils || (a && 'x' in a)) &&
        (Array.isArray(b) || b?._isMathutils || (b && 'x' in b))
      ) {
        return createMathutilsVector([
          Number(a[0] ?? a.x ?? 0) - Number(b[0] ?? b.x ?? 0),
          Number(a[1] ?? a.y ?? 0) - Number(b[1] ?? b.y ?? 0),
          Number(a[2] ?? a.z ?? 0) - Number(b[2] ?? b.z ?? 0),
        ]);
      }
      return Number(a) - Number(b);
    },
    _matmul: (a: any, b: any) => {
      if (Array.isArray(a) && (a.length === 4 || a.length === 3) && Array.isArray(a[0])) {
        // Matrix @ Matrix
        if (Array.isArray(b) && (b.length === 4 || b.length === 3) && Array.isArray(b[0])) {
          const out = [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 1],
          ];
          const dim = Math.min(a.length, b.length);
          for (let r = 0; r < dim; r++) {
            for (let c = 0; c < dim; c++) {
              let sum = 0;
              for (let k = 0; k < dim; k++) {
                sum += (a[r]?.[k] || 0) * (b[k]?.[c] || 0);
              }
              out[r][c] = sum;
            }
          }
          return out;
        }
        // Matrix @ 3D Vector
        if (Array.isArray(b) || (b && typeof b === 'object')) {
          const x = Number(b[0] ?? b.x ?? 0);
          const y = Number(b[1] ?? b.y ?? 0);
          const z = Number(b[2] ?? b.z ?? 0);
          const rx = (a[0]?.[0] ?? 1) * x + (a[0]?.[1] ?? 0) * y + (a[0]?.[2] ?? 0) * z + (a[0]?.[3] ?? 0);
          const ry = (a[1]?.[0] ?? 0) * x + (a[1]?.[1] ?? 1) * y + (a[1]?.[2] ?? 0) * z + (a[1]?.[3] ?? 0);
          const rz = (a[2]?.[0] ?? 0) * x + (a[2]?.[1] ?? 0) * y + (a[2]?.[2] ?? 1) * z + (a[2]?.[3] ?? 0);
          return createMathutilsVector([rx, ry, rz]);
        }
      }
      if (typeof a === 'number' && typeof b === 'number') return a * b;
      return b;
    },
    _in: (item: any, container: any): boolean => {
      if (!container) return false;
      if (container instanceof Set || container instanceof Map) {
        return container.has(item);
      }
      if (Array.isArray(container) || typeof container === 'string') {
        return container.includes(item);
      }
      if (typeof container === 'object') {
        return item in container;
      }
      return false;
    },
    _items: (obj: any): [any, any][] => {
      if (!obj) return [];
      if (typeof obj.items === 'function') return obj.items();
      if (obj instanceof Map) return Array.from(obj.entries());
      if (typeof obj === 'object') return Object.entries(obj);
      return [];
    },
    _values: (obj: any): any[] => {
      if (!obj) return [];
      if (typeof obj.values === 'function' && !Array.isArray(obj)) return Array.from(obj.values());
      if (Array.isArray(obj)) return obj;
      if (typeof obj === 'object') return Object.values(obj);
      return [];
    },
    _keys: (obj: any): any[] => {
      if (!obj) return [];
      if (typeof obj.keys === 'function' && !Array.isArray(obj)) return Array.from(obj.keys());
      if (typeof obj === 'object') return Object.keys(obj);
      return [];
    },
    _range: (a: number, b?: number, step: number = 1): number[] => {
      const start = b === undefined ? 0 : a;
      const end = b === undefined ? a : b;
      const arr: number[] = [];
      if (step > 0) {
        for (let k = start; k < end; k += step) arr.push(k);
      } else if (step < 0) {
        for (let k = start; k > end; k += step) arr.push(k);
      }
      return arr;
    },
    app: {
      version: [5, 2, 0],
      version_string: '5.2.0',
      version_cycle: 'release',
      background: false,
    },
    types: createSafeNoopProxy(),
    props: createSafeNoopProxy(),
    utils: createSafeNoopProxy({
      register_class: (cls: any) => {
        try {
          if (typeof cls === 'function') {
            const inst = new cls();
            const idname: string = inst.bl_idname || cls.bl_idname || '';
            if (idname && idname.includes('.')) {
              const [cat, op] = idname.split('.');
              if (!(bpy.ops as any)[cat]) (bpy.ops as any)[cat] = {};
              (bpy.ops as any)[cat][op] = (...rawArgs: unknown[]) => {
                if (typeof inst.execute === 'function') {
                  return inst.execute(bpy.context);
                }
                return { FINISHED: true };
              };
            }
            if (typeof inst.execute === 'function' && !inst._autoExecuted) {
              inst._autoExecuted = true;
              inst.execute(bpy.context);
            }
          }
        } catch {
          // Noop
        }
      },
      unregister_class: () => {},
    }),
    path: createSafeNoopProxy({
      basename: (p: string) => String(p || '').split(/[\\/]/).pop() || '',
      abspath: (p: string) => String(p || ''),
    }),
    context: {
      get active_object() {
        return currentActiveObjProxy;
      },
      set active_object(v: any) {
        if (v) currentActiveObjProxy = v;
      },
      get object() {
        return currentActiveObjProxy;
      },
      set object(v: any) {
        if (v) currentActiveObjProxy = v;
      },
      get selected_objects() {
        return allObjectProxies;
      },
      view_layer: {
        objects: sceneObjectsProxy,
        update: () => {},
      },
      collection: {
        objects: sceneObjectsProxy,
      },
      scene: sceneProxyObj,
      evaluated_depsgraph_get: () => createSafeNoopProxy(),
    },
    data: {
      scenes: createDataCollection([sceneProxyObj], () => sceneProxyObj),
      meshes: createDataCollection(meshesStore, createCustomMeshData),
      materials: createDataCollection(materialsStore, (...rawArgs: unknown[]) => {
        const { name } = extractPyArgs(rawArgs, ['name'], { name: 'Material' });
        const mat = createBlenderMaterial(String(name));
        materialsStore.push(mat);
        return mat;
      }),
      objects: createDataCollection(allObjectProxies, (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(
          rawArgs,
          ['name', 'object_data', 'color', 'data', 'mesh'],
          { name: 'Object', object_data: null, color: '#38bdf8' }
        );
        const objName = opts.name;
        const meshData = opts.object_data ?? opts.data ?? opts.mesh ?? null;
        const color = opts.color;
        if (meshData && meshData._threeLight) {
          return createBlenderLightObject(String(objName), meshData.type || 'SUN');
        }
        const geo = meshData?._threeGeometry || meshData?._geometry || new THREE.BufferGeometry();
        const col = parsePythonColor(color, '#38bdf8');
        const mesh = new THREE.Mesh(geo);
        mesh.name = String(objName);
        configureNewlySpawnedMesh(mesh, col, gradientTex, outThick, outOpac);
        const proxy = createBlenderObjectProxy(mesh);
        (proxy as any)._color = col;
        (proxy as any)._threeObject = mesh;
        (proxy as any)._meshData = meshData;
        if (meshData) {
          meshData._threeMesh = mesh;
          meshData._geometry = mesh.geometry;
          meshData._ownerProxy = proxy;
          if (typeof meshData.from_pydata === 'function') {
            (proxy.data as any).from_pydata = meshData.from_pydata;
            (proxy.data as any)._syncGeometryToBoundMesh = meshData._syncGeometryToBoundMesh;
          }
        }
        if (Array.isArray(meshData?.materials) && meshData.materials.length > 0) {
          (proxy as any)._pendingMaterials = [...meshData.materials];
          meshData.materials.forEach((m: any) => (proxy.data.materials as any).append(m));
        }
        return proxy;
      }),
      collections: createDataCollection(
        [
          {
            name: 'Collection',
            objects: sceneObjectsProxy,
          },
        ],
        (...rawArgs: unknown[]) => {
          const { name } = extractPyArgs(rawArgs, ['name'], { name: 'Collection' });
          return {
            name: String(name),
            objects: sceneObjectsProxy,
          };
        }
      ),
      curves: createDataCollection([], (...rawArgs: unknown[]) => {
        const { name } = extractPyArgs(rawArgs, ['name', 'type'], { name: 'Curve', type: 'CURVE' });
        const geo = new THREE.TorusGeometry(0.6, 0.05, 12, 32);
        return {
          name: String(name),
          _geometry: geo,
          dimensions: '3D',
          bevel_depth: 0.05,
          splines: {
            new: () => ({
              points: {
                add: () => {},
                0: { co: [0, 0, 0, 1] },
              },
              bezier_points: {
                add: () => {},
                0: { co: [0, 0, 0], handle_left: [0, 0, 0], handle_right: [0, 0, 0] },
              },
            }),
          },
        };
      }),
      armatures: createDataCollection([], () => createSafeNoopProxy()),
      lights: createDataCollection([], (...rawArgs: unknown[]) => {
        const { name, type } = extractPyArgs(rawArgs, ['name', 'type'], { name: 'Light', type: 'SUN' });
        const lightObj = createBlenderLightObject(String(name), String(type));
        return lightObj.data;
      }),
      cameras: createDataCollection([], () => createSafeNoopProxy()),
      worlds: createDataCollection([worldProxyObj], () => worldProxyObj),
    },
    ops: {
      object: {
        select_all: (_opts?: { action?: string }) => {},
        select_by_type: (_opts?: { type?: string }) => {},
        mode_set: (_opts?: { mode?: string }) => {},
        shade_smooth: () => {
          // Suaviza de verdad la pieza activa: une los vértices repetidos (from_pydata crea
          // triángulos sueltos) y recalcula normales compartidas. Sin esto la piel sale facetada.
          const mesh = currentActiveObjProxy?._threeMesh as THREE.Mesh | undefined;
          const geo = mesh?.geometry as THREE.BufferGeometry | undefined;
          if (!mesh || !geo?.attributes?.position) return;
          const base = geo.clone();
          base.deleteAttribute('normal');
          const merged = BufferGeometryUtils.mergeVertices(base, 1e-4);
          merged.computeVertexNormals();
          mesh.geometry = merged;
          const meshData = currentActiveObjProxy?._meshData || currentActiveObjProxy?.data;
          if (meshData) {
            meshData._threeGeometry = merged;
            meshData._geometry = merged;
          }
          if (mesh.userData.outlineMesh) (mesh.userData.outlineMesh as THREE.Mesh).geometry = merged;
          mesh.userData.initialPositions = new Float32Array(merged.attributes.position.array);
          geo.dispose();
        },
        shade_auto_smooth: () => {},
        shade_flat: () => {},
        origin_set: () => {},
        join: () => {},
        duplicate: () => {
          if (currentActiveObjProxy && currentActiveObjProxy.copy) {
            const copyProxy = currentActiveObjProxy.copy();
            linkObjectToScene(copyProxy);
          }
        },
        duplicate_move: (opts?: { TRANSFORM_OT_translate?: { value?: [number, number, number] } }) => {
          if (currentActiveObjProxy && currentActiveObjProxy.copy) {
            const copyProxy = currentActiveObjProxy.copy();
            linkObjectToScene(copyProxy);
            const val = opts?.TRANSFORM_OT_translate?.value;
            if (val) {
              const [dx, dy, dz] = convertLocToThree(val);
              copyProxy._threeMesh.position.x += dx;
              copyProxy._threeMesh.position.y += dy;
              copyProxy._threeMesh.position.z += dz;
            }
          }
        },
        transform_apply: (opts?: { location?: boolean; rotation?: boolean; scale?: boolean }) => {
          const mesh: THREE.Mesh | undefined = currentActiveObjProxy?._threeMesh;
          if (!mesh || !mesh.geometry) return;
          if (opts?.scale !== false) {
            mesh.geometry.scale(mesh.scale.x, mesh.scale.y, mesh.scale.z);
            mesh.scale.set(1, 1, 1);
            mesh.geometry.computeVertexNormals();
          }
          if (opts?.rotation) {
            mesh.geometry.rotateX(mesh.rotation.x);
            mesh.geometry.rotateY(mesh.rotation.y);
            mesh.geometry.rotateZ(mesh.rotation.z);
            mesh.rotation.set(0, 0, 0);
            mesh.geometry.computeVertexNormals();
          }
        },
        modifier_add: (...rawArgs: unknown[]) => {
          const { type } = extractPyArgs(rawArgs, ['type'], { type: 'SUBSURF' });
          if (currentActiveObjProxy?.modifiers?.new) {
            currentActiveObjProxy.modifiers.new(String(type), String(type));
          }
        },
        modifier_apply: async () => {
          if (currentActiveObjProxy) {
            await applyPendingModifiersForObject(currentActiveObjProxy);
          }
        },
        light_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['type', 'radius', 'align', 'location', 'rotation', 'scale'],
            { type: 'SUN', location: [4, -4, 6], rotation: [0.5, 0.2, 0.4] }
          );
          return createBlenderLightObject(
            `Light_${opts.type || 'SUN'}`,
            String(opts.type || 'SUN'),
            opts.location,
            opts.rotation
          );
        },
        camera_add: () => createSafeNoopProxy(),
        empty_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['type', 'radius', 'align', 'location', 'rotation', 'scale'],
            { type: 'PLAIN_AXES', location: [0, 0, 0], rotation: [0, 0, 0] }
          );
          const emptyMesh = new THREE.Mesh(new THREE.BufferGeometry());
          emptyMesh.name = `Empty_${objectsCreatedCount + 1}`;
          if (Array.isArray(opts.location)) {
            const [tx, ty, tz] = convertLocToThree(opts.location);
            emptyMesh.position.set(tx, ty, tz);
          }
          if (Array.isArray(opts.rotation)) {
            const [rx, ry, rz] = convertRotToThree(opts.rotation);
            emptyMesh.rotation.set(rx, ry, rz);
          }
          currentActiveObjProxy = createBlenderObjectProxy(emptyMesh);
          currentActiveObjProxy.type = 'EMPTY';
          return currentActiveObjProxy;
        },
        armature_add: () => createSafeNoopProxy(),
        text_add: () => createSafeNoopProxy(),
        metaball_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['radius', 'location', 'scale', 'color'], {
            radius: 0.5,
          });
          return bpy.ops.mesh.primitive_ico_sphere_add({
            radius: opts.radius ?? 0.5,
            subdivisions: 3,
            location: opts.location,
            scale: opts.scale,
            color: opts.color,
          });
        },
        delete: () => {
          const childrenCopy = [...targetParent.children];
          childrenCopy.forEach((child) => {
            child.traverse((c) => {
              if ((c as THREE.Mesh).isMesh) {
                const m = c as THREE.Mesh;
                m.geometry?.dispose();
              }
            });
            targetParent.remove(child);
          });
          worldEnvLight = null;
          targetParent.name = 'Blender_Scene_Root';
          targetParent.scale.setScalar(1);
          targetParent.position.set(0, -1.35, 0);
          targetParent.rotation.set(0, 0, 0);
          clearBlenderAnimations();
          allObjectProxies.length = 0;
          proxiesDirty = true;
          collectMeshes();
          logs.push(`bpy.ops.object.delete(): escena limpiada para generar nuevo modelo.`);
        },
      },
      curve: {
        primitive_bezier_circle_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['radius', 'location', 'rotation', 'scale', 'color'], {
            radius: 0.8,
          });
          const r = Number(opts.radius) || 0.8;
          const geo = new THREE.TorusGeometry(r, Math.max(0.035, r * 0.06), 14, 36);
          return spawnPrimitiveMesh('BezierCircle', geo, opts as any);
        },
        primitive_bezier_curve_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['radius', 'location', 'rotation', 'scale', 'color'], {
            radius: 1.0,
          });
          const len = Number(opts.radius) || 1.0;
          const geo = new THREE.CapsuleGeometry(0.06, len, 8, 16);
          return spawnPrimitiveMesh('BezierCurve', geo, opts as any);
        },
        primitive_nurbs_circle_add: (...rawArgs: unknown[]) =>
          bpy.ops.curve.primitive_bezier_circle_add(...rawArgs),
        primitive_nurbs_curve_add: (...rawArgs: unknown[]) =>
          bpy.ops.curve.primitive_bezier_curve_add(...rawArgs),
        primitive_nurbs_path_add: (...rawArgs: unknown[]) =>
          bpy.ops.curve.primitive_bezier_curve_add(...rawArgs),
      },
      mesh: {
        primitive_plane_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['size', 'location', 'rotation', 'scale', 'color'], {
            size: 1.5,
          });
          const s = Number(opts.size) || 1.5;
          const geo = new THREE.BoxGeometry(s, isZUp ? s : 0.04, isZUp ? 0.04 : s, 4, 4, 2);
          if (isZUp) {
            const planeGeo = new THREE.BoxGeometry(s, 0.04, s, 4, 2, 4);
            return spawnPrimitiveMesh('Plane', planeGeo, opts as any);
          }
          return spawnPrimitiveMesh('Plane', geo, opts as any);
        },
        primitive_circle_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'vertices', 'location', 'rotation', 'scale', 'color'],
            { radius: 0.8, vertices: 24 }
          );
          const r = Number(opts.radius) || 0.8;
          const v = Number(opts.vertices) || 24;
          const geo = new THREE.CylinderGeometry(r, r, 0.05, v, 1);
          return spawnPrimitiveMesh('Circle', geo, opts as any);
        },
        primitive_grid_add: (...rawArgs: unknown[]) =>
          bpy.ops.mesh.primitive_plane_add(...rawArgs),
        primitive_monkey_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['size', 'location', 'rotation', 'scale', 'color'], {
            size: 1.0,
          });
          const s = (Number(opts.size) || 1.0) * 0.5;
          const geo = new THREE.DodecahedronGeometry(s, 2);
          return spawnPrimitiveMesh('Suzanne', geo, opts as any);
        },
        primitive_cube_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['size', 'location', 'rotation', 'scale', 'color'], {
            size: 1.0,
          });
          const s = Number(opts.size ?? 1.0);
          // 1 división por cara: 12 triángulos. El suavizado conserva las aristas duras de la caja.
          const geo = new THREE.BoxGeometry(s, s, s, 1, 1, 1);
          return spawnPrimitiveMesh('Cube', geo, opts as any);
        },
        primitive_uv_sphere_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'segments', 'ring_count', 'location', 'rotation', 'scale', 'color'],
            { radius: 0.6, segments: 24, ring_count: 16 }
          );
          const r = Number(opts.radius ?? opts.diameter ?? 0.6);
          const segs = Math.min(48, Math.max(8, Number(opts.segments ?? 24)));
          const rings = Math.min(32, Math.max(6, Number(opts.ring_count ?? 16)));
          const geo = new THREE.SphereGeometry(r, segs, rings);
          return spawnPrimitiveMesh('UVSphere', geo, opts as any);
        },
        primitive_ico_sphere_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'subdivisions', 'location', 'rotation', 'scale', 'color'],
            { radius: 0.65, subdivisions: 2 }
          );
          const r = Number(opts.radius ?? 0.65);
          const sub = Math.min(4, Math.max(0, Number(opts.subdivisions ?? 2)));
          const geo = new THREE.IcosahedronGeometry(r, sub);
          return spawnPrimitiveMesh('IcoSphere', geo, opts as any);
        },
        primitive_cylinder_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'depth', 'vertices', 'location', 'rotation', 'scale', 'color'],
            { radius: 0.45, depth: 1.0, vertices: 20 }
          );
          const r = Number(opts.radius ?? 0.45);
          const d = Number(opts.depth ?? 1.0);
          const v = Math.min(48, Math.max(6, Number(opts.vertices ?? 20)));
          const geo = new THREE.CylinderGeometry(r, r, d, v, 4);
          return spawnPrimitiveMesh('Cylinder', geo, opts as any);
        },
        primitive_cone_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius1', 'radius2', 'depth', 'vertices', 'location', 'rotation', 'scale', 'color'],
            { radius1: 0.4, radius2: 0.0, depth: 0.9, vertices: 16 }
          );
          const r1 = Number(opts.radius1 ?? 0.4);
          const r2 = Number(opts.radius2 ?? 0.0);
          const d = Number(opts.depth ?? 0.9);
          const v = Math.min(48, Math.max(4, Number(opts.vertices ?? 16)));
          const geo = new THREE.CylinderGeometry(r2, r1, d, v, 4);
          return spawnPrimitiveMesh('Cone', geo, opts as any);
        },
        primitive_torus_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['major_radius', 'minor_radius', 'location', 'rotation', 'scale', 'color'],
            { major_radius: 0.8, minor_radius: 0.15 }
          );
          const maj = Number(opts.major_radius ?? 0.8);
          const min = Number(opts.minor_radius ?? 0.15);
          const geo = new THREE.TorusGeometry(maj, min, 14, 36);
          if (isZUp) {
            geo.rotateX(Math.PI / 2);
          }
          return spawnPrimitiveMesh('Torus', geo, opts as any);
        },
        primitive_torus_knot_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'tube', 'p', 'q', 'location', 'rotation', 'scale', 'color'],
            { radius: 0.7, tube: 0.18, p: 2, q: 3 }
          );
          const r = Number(opts.radius ?? 0.7);
          const tube = Number(opts.tube ?? 0.18);
          const p = Number(opts.p ?? 2);
          const q = Number(opts.q ?? 3);
          const geo = new THREE.TorusKnotGeometry(r, tube, 64, 12, p, q);
          return spawnPrimitiveMesh('TorusKnot', geo, opts as any);
        },
        primitive_capsule_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'length', 'cap_subdivisions', 'radial_segments', 'location', 'rotation', 'scale', 'color'],
            { radius: 0.32, length: 0.85, cap_subdivisions: 10, radial_segments: 20 }
          );
          const r = Number(opts.radius ?? 0.32);
          const len = Number(opts.length ?? 0.85);
          const capSub = Number(opts.cap_subdivisions ?? 10);
          const radSeg = Number(opts.radial_segments ?? 20);
          const geo = new THREE.CapsuleGeometry(r, len, capSub, radSeg);
          return spawnPrimitiveMesh('Capsule', geo, opts as any);
        },
        primitive_octahedron_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'detail', 'location', 'rotation', 'scale', 'color'],
            { radius: 0.45, detail: 0 }
          );
          const r = Number(opts.radius ?? 0.45);
          const det = Math.min(3, Math.max(0, Number(opts.detail ?? 0)));
          const geo = new THREE.OctahedronGeometry(r, det);
          return spawnPrimitiveMesh('Octahedron', geo, opts as any);
        },
        primitive_dodecahedron_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'detail', 'location', 'rotation', 'scale', 'color'],
            { radius: 0.52, detail: 0 }
          );
          const r = Number(opts.radius ?? 0.52);
          const det = Math.min(3, Math.max(0, Number(opts.detail ?? 0)));
          const geo = new THREE.DodecahedronGeometry(r, det);
          return spawnPrimitiveMesh('Dodecahedron', geo, opts as any);
        },
        primitive_blade_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['length', 'width', 'thickness', 'curve', 'location', 'rotation', 'scale', 'color'],
            { length: 1.4, width: 0.26, thickness: 0.06, curve: 0.12 }
          );
          const length = Number(opts.length ?? 1.4);
          const width = Number(opts.width ?? 0.26);
          const thickness = Number(opts.thickness ?? 0.06);
          const curve = Number(opts.curve ?? 0.12);
          const geo = new THREE.BoxGeometry(width, length, thickness, 4, 14, 2);
          const pos = geo.attributes.position as THREE.BufferAttribute;
          const halfLen = length / 2;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);
            const t = (y + halfLen) / Math.max(0.001, length);
            const taperWidth = t > 0.7 ? 1.0 - ((t - 0.7) / 0.3) * 0.92 : 1.0 + Math.sin(t * Math.PI) * 0.15;
            const edgeSharpness = Math.max(0.12, 1.0 - Math.abs(x / Math.max(0.001, width * 0.5)) * 0.82);
            const bendX = Math.pow(t, 1.8) * curve;
            pos.setXYZ(i, x * taperWidth + bendX, y, z * edgeSharpness * (1 - t * 0.5));
          }
          geo.computeVertexNormals();
          return spawnPrimitiveMesh('Blade', geo, opts as any);
        },
        primitive_horn_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['base_radius', 'tip_radius', 'length', 'bend', 'segments', 'location', 'rotation', 'scale', 'color', 'radius', 'height', 'curve', 'mirror_x'],
            { base_radius: 0.2, tip_radius: 0.015, length: 1.0, bend: 0.45, segments: 14 }
          );
          const rBase = Number(opts.base_radius ?? opts.radius ?? 0.2);
          const rTip = Number(opts.tip_radius ?? 0.015);
          const len = Number(opts.length ?? opts.height ?? 1.0);
          const bend = Number(opts.bend ?? opts.curve ?? 0.45);
          const segs = Math.min(32, Math.max(8, Number(opts.segments ?? 14)));

          const createSingleHorn = (loc?: [number, number, number], rot?: [number, number, number]) => {
            const geo = new THREE.CylinderGeometry(rTip, rBase, len, 16, segs);
            const pos = geo.attributes.position as THREE.BufferAttribute;
            const halfLen = len / 2;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i);
              const y = pos.getY(i);
              const z = pos.getZ(i);
              const t = (y + halfLen) / Math.max(0.001, len);
              const curveOffsetZ = -Math.pow(t, 2.0) * bend * len * 0.65;
              const curveOffsetX = Math.sin(t * Math.PI * 0.85) * bend * len * 0.18;
              pos.setXYZ(i, x + curveOffsetX, y, z + curveOffsetZ);
            }
            geo.computeVertexNormals();
            return spawnPrimitiveMesh('Horn', geo, { ...opts, location: loc, rotation: rot } as any);
          };

          const primary = createSingleHorn(opts.location, opts.rotation);
          if (opts.mirror_x && Array.isArray(opts.location) && Math.abs(opts.location[0]) > 0.02) {
            const mLoc: [number, number, number] = [-opts.location[0], opts.location[1], opts.location[2]];
            const mRot: [number, number, number] | undefined = Array.isArray(opts.rotation)
              ? [opts.rotation[0], -opts.rotation[1], -opts.rotation[2]]
              : undefined;
            createSingleHorn(mLoc, mRot);
          }
          return primary;
        },
        primitive_armor_plate_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['width', 'height', 'thickness', 'curvature', 'arch', 'location', 'rotation', 'scale', 'color', 'mirror_x'],
            { width: 0.72, height: 0.65, thickness: 0.09, curvature: 0.32 }
          );
          const width = Number(opts.width ?? 0.72);
          const height = Number(opts.height ?? 0.65);
          const thickness = Number(opts.thickness ?? 0.09);
          const curvature = Number(opts.curvature ?? opts.arch ?? 0.32);

          const createPlate = (loc?: [number, number, number], rot?: [number, number, number]) => {
            const geo = new THREE.BoxGeometry(width, height, thickness, 10, 8, 2);
            const pos = geo.attributes.position as THREE.BufferAttribute;
            const halfW = width / 2;
            const halfH = height / 2;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i);
              const y = pos.getY(i);
              const z = pos.getZ(i);
              const nx = x / Math.max(0.001, halfW);
              const ny = y / Math.max(0.001, halfH);
              const archZ = (1.0 - nx * nx) * curvature * 0.45;
              const shieldTaper = 1.0 - Math.max(0, -ny) * 0.25;
              pos.setXYZ(i, x * shieldTaper, y, z + archZ);
            }
            geo.computeVertexNormals();
            return spawnPrimitiveMesh('ArmorPlate', geo, { ...opts, location: loc, rotation: rot } as any);
          };

          const primary = createPlate(opts.location, opts.rotation);
          if (opts.mirror_x && Array.isArray(opts.location) && Math.abs(opts.location[0]) > 0.02) {
            const mLoc: [number, number, number] = [-opts.location[0], opts.location[1], opts.location[2]];
            const mRot: [number, number, number] | undefined = Array.isArray(opts.rotation)
              ? [opts.rotation[0], -opts.rotation[1], -opts.rotation[2]]
              : undefined;
            createPlate(mLoc, mRot);
          }
          return primary;
        },
        primitive_limb_pair_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['start_pos', 'mid_pos', 'end_pos', 'thickness', 'joint_size', 'color', 'joint_color', 'span', 'upper_len', 'lower_len', 'radius', 'bend', 'y_top', 'z_offset'],
            {}
          );

          // Soportar tanto formato (start_pos, mid_pos, end_pos) en Z-Up o Y-Up como formato paramétrico
          const toThreePt = (pt: [number, number, number], fallbackThree: [number, number, number]): [number, number, number] => {
            if (!pt || !Array.isArray(pt)) return fallbackThree;
            return convertLocToThree(pt);
          };

          let sPos: [number, number, number] = opts.start_pos
            ? toThreePt(opts.start_pos, [0.42, 1.58, 0.0])
            : [0.42, 1.58, 0.0];
          let mPos: [number, number, number] = opts.mid_pos
            ? toThreePt(opts.mid_pos, [0.78, 1.18, 0.12])
            : [0.78, 1.18, 0.12];
          let ePos: [number, number, number] = opts.end_pos
            ? toThreePt(opts.end_pos, [0.72, 0.72, 0.34])
            : [0.72, 0.72, 0.34];

          if (!opts.start_pos && opts.span !== undefined) {
            const span = Number(opts.span) || 0.38;
            const uLen = Number(opts.upper_len) || 0.52;
            const lLen = Number(opts.lower_len) || 0.54;
            const bend = Number(opts.bend) || 0.35;
            const yTop = Number(opts.y_top) || 1.2;
            const zOff = Number(opts.z_offset) || 0.0;
            sPos = [span, yTop, zOff];
            mPos = [span + bend * 0.35, yTop - uLen * 0.85, zOff + bend * 0.28];
            ePos = [span + bend * 0.2, yTop - (uLen + lLen) * 0.88, zOff + bend * 0.12];
          }

          const thick = Number(opts.thickness ?? opts.radius ?? 0.15);
          const jSize = Number(opts.joint_size ?? thick * 1.28);
          const mainCol = opts.color ?? [0.2, 0.25, 0.36];
          const jCol = opts.joint_color ?? [0.95, 0.68, 0.12];

          const createSegmentBetween = (
            p1: THREE.Vector3,
            p2: THREE.Vector3,
            r: number,
            col: [number, number, number] | string
          ) => {
            const dir = new THREE.Vector3().subVectors(p2, p1);
            const len = Math.max(0.05, dir.length());
            const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            const quat = new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              dir.clone().normalize()
            );
            const euler = new THREE.Euler().setFromQuaternion(quat);
            const geo = new THREE.CapsuleGeometry(r, Math.max(0.02, len - r * 1.2), 8, 16);
            spawnPrimitiveMesh('LimbSeg', geo, {
              location: [center.x, center.y, center.z],
              rotation: [euler.x, euler.y, euler.z],
              color: col,
              alreadyThreeSpace: true,
            });
          };

          for (const side of [-1, 1]) {
            const pStart = new THREE.Vector3(sPos[0] * side, sPos[1], sPos[2]);
            const pMid = new THREE.Vector3(mPos[0] * side, mPos[1], mPos[2]);
            const pEnd = new THREE.Vector3(ePos[0] * side, ePos[1], ePos[2]);

            spawnPrimitiveMesh('JointTop', new THREE.IcosahedronGeometry(jSize, 2), {
              location: [pStart.x, pStart.y, pStart.z],
              color: jCol,
              alreadyThreeSpace: true,
            });
            createSegmentBetween(pStart, pMid, thick, mainCol);
            spawnPrimitiveMesh('JointMid', new THREE.IcosahedronGeometry(jSize * 0.88, 2), {
              location: [pMid.x, pMid.y, pMid.z],
              color: jCol,
              alreadyThreeSpace: true,
            });
            createSegmentBetween(pMid, pEnd, thick * 0.85, mainCol);
            spawnPrimitiveMesh('LimbEnd', new THREE.DodecahedronGeometry(jSize * 0.92, 1), {
              location: [pEnd.x, pEnd.y, pEnd.z],
              color: jCol,
              alreadyThreeSpace: true,
            });
          }
          logs.push(`bpy.ops.mesh.primitive_limb_pair_add: Par de extremidades articuladas simétricas generadas.`);
        },
        primitive_wing_pair_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['span', 'feathers', 'y_height', 'z_offset', 'spread', 'color', 'accent_color', 'y_pos', 'z_pos', 'location'],
            { span: 1.9, feathers: 6, y_height: 1.65, z_offset: -0.28, spread: 0.9 }
          );
          const span = Number(opts.span ?? 1.9);
          const feathers = Math.min(12, Math.max(3, Number(opts.feathers ?? 6)));
          let yHeight = Number(opts.y_height ?? opts.y_pos ?? 1.65);
          let zOffset = Number(opts.z_offset ?? opts.z_pos ?? -0.28);
          if (Array.isArray(opts.location)) {
            const [_, ty, tz] = convertLocToThree(opts.location);
            yHeight = ty;
            zOffset = tz;
          }
          const spread = Number(opts.spread ?? 0.9);
          const colMain = opts.color ?? [0.9, 0.16, 0.32];
          const colAcc = opts.accent_color ?? [0.98, 0.74, 0.14];

          for (const side of [-1, 1]) {
            for (let i = 0; i < feathers; i++) {
              const t = i / Math.max(1, feathers - 1);
              const angle = (0.25 + t * spread * 1.15) * side;
              const dist = 0.45 + t * (span * 0.55);
              const px = side * (0.28 + Math.cos(t * 0.9) * dist * 0.75);
              const py = yHeight + (0.35 - t * 0.65) * (span * 0.45);
              const pz = zOffset - t * 0.18;
              const fLen = span * (0.68 - t * 0.28);

              const geo = new THREE.BoxGeometry(0.18, fLen, 0.045, 4, 14, 2);
              const pos = geo.attributes.position as THREE.BufferAttribute;
              const halfLen = fLen / 2;
              const curve = 0.12 * side;
              for (let k = 0; k < pos.count; k++) {
                const vx = pos.getX(k), vy = pos.getY(k), vz = pos.getZ(k);
                const u = (vy + halfLen) / Math.max(0.001, fLen);
                const taperW = u > 0.7 ? 1.0 - ((u - 0.7) / 0.3) * 0.92 : 1.0 + Math.sin(u * Math.PI) * 0.15;
                pos.setXYZ(k, vx * taperW + Math.pow(u, 1.8) * curve, vy, vz * (1 - u * 0.5));
              }
              geo.computeVertexNormals();
              spawnPrimitiveMesh('WingFeather', geo, {
                location: [px, py, pz],
                rotation: [0.18, -0.2 * side, -angle],
                color: i % 2 === 0 ? colMain : colAcc,
                alreadyThreeSpace: true,
              });
            }
          }
          logs.push(`bpy.ops.mesh.primitive_wing_pair_add: Par de alas con ${feathers * 2} plumas/hojas creadas.`);
        },
        primitive_wheel_pair_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'width', 'span', 'y_pos', 'z_pos', 'color', 'rim_color', 'location'],
            { radius: 0.42, width: 0.26, span: 0.78, y_pos: 0.42, z_pos: 0.0 }
          );
          const r = Number(opts.radius ?? 0.42);
          const w = Number(opts.width ?? 0.26);
          const span = Number(opts.span ?? 0.78);
          let yPos = Number(opts.y_pos ?? 0.42);
          let zPos = Number(opts.z_pos ?? 0.0);
          if (Array.isArray(opts.location)) {
            const [_, ty, tz] = convertLocToThree(opts.location);
            yPos = ty;
            zPos = tz;
          }
          const tireCol = opts.color ?? [0.15, 0.17, 0.22];
          const rimCol = opts.rim_color ?? [0.95, 0.72, 0.15];

          // Eje central de conexión (en coordenadas Three.js Y-Up directas)
          spawnPrimitiveMesh('Axle', new THREE.CylinderGeometry(r * 0.16, r * 0.16, span * 2, 12), {
            location: [0, yPos, zPos],
            rotation: [0, 0, Math.PI / 2],
            color: tireCol,
            alreadyThreeSpace: true,
          });

          for (const side of [-1, 1]) {
            spawnPrimitiveMesh('WheelTire', new THREE.CylinderGeometry(r, r, w, 24), {
              location: [side * span, yPos, zPos],
              rotation: [0, 0, Math.PI / 2],
              color: tireCol,
              alreadyThreeSpace: true,
            });
            spawnPrimitiveMesh('WheelRim', new THREE.CylinderGeometry(r * 0.58, r * 0.58, w * 1.08, 16), {
              location: [side * span, yPos, zPos],
              rotation: [0, 0, Math.PI / 2],
              color: rimCol,
              alreadyThreeSpace: true,
            });
          }
          logs.push(`bpy.ops.mesh.primitive_wheel_pair_add: Par de ruedas y eje generados.`);
        },
        primitive_arch_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['width', 'height', 'thickness', 'location', 'rotation', 'color', 'accent_color'],
            { width: 1.4, height: 1.8, thickness: 0.26, location: [0, 0, 0] }
          );
          const width = Number(opts.width ?? 1.4);
          const height = Number(opts.height ?? 1.8);
          const thick = Number(opts.thickness ?? 0.26);
          const rawLoc = Array.isArray(opts.location) ? opts.location : [0, 0, 0];
          const loc = convertLocToThree(rawLoc);
          const colMain = opts.color ?? [0.58, 0.62, 0.70];
          const colAcc = opts.accent_color ?? [0.95, 0.72, 0.16];

          const halfSpan = width * 0.5;
          const pillarH = height * 0.65;

          for (const side of [-1, 1]) {
            spawnPrimitiveMesh('ArchPillar', new THREE.BoxGeometry(thick, pillarH, thick, 2, 4, 2), {
              location: [loc[0] + side * halfSpan, loc[1] + pillarH * 0.5, loc[2]],
              color: colMain,
              alreadyThreeSpace: true,
            });
            spawnPrimitiveMesh('PillarBase', new THREE.BoxGeometry(thick * 1.35, thick * 0.45, thick * 1.35), {
              location: [loc[0] + side * halfSpan, loc[1] + thick * 0.22, loc[2]],
              color: colAcc,
              alreadyThreeSpace: true,
            });
            spawnPrimitiveMesh('PillarCap', new THREE.BoxGeometry(thick * 1.35, thick * 0.45, thick * 1.35), {
              location: [loc[0] + side * halfSpan, loc[1] + pillarH, loc[2]],
              color: colAcc,
              alreadyThreeSpace: true,
            });
          }

          const archSteps = 7;
          for (let i = 0; i < archSteps; i++) {
            const t = i / (archSteps - 1);
            const ang = t * Math.PI;
            const ax = loc[0] + Math.cos(ang) * halfSpan;
            const ay = loc[1] + pillarH + Math.sin(ang) * halfSpan * 0.85;
            const isKeystone = i === Math.floor(archSteps / 2);
            spawnPrimitiveMesh(
              'ArchStone',
              new THREE.BoxGeometry(thick * (isKeystone ? 1.15 : 0.92), thick * 0.95, thick * (isKeystone ? 1.2 : 1.0)),
              {
                location: [ax, ay, loc[2]],
                rotation: [0, 0, ang - Math.PI / 2],
                color: isKeystone ? colAcc : colMain,
                alreadyThreeSpace: true,
              }
            );
          }
          logs.push(`bpy.ops.mesh.primitive_arch_add: Arco arquitectónico con columnas generado.`);
        },
        primitive_tree_foliage_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['radius', 'layers', 'location', 'color', 'accent_color'],
            { radius: 0.95, layers: 3, location: isZUp ? [0, 0, 2.0] : [0, 2.0, 0] }
          );
          const rad = Number(opts.radius ?? 0.95);
          const layers = Math.min(6, Math.max(2, Number(opts.layers ?? 3)));
          const rawLoc = Array.isArray(opts.location)
            ? opts.location
            : isZUp
            ? [0, 0, 2.0]
            : [0, 2.0, 0];
          const loc = convertLocToThree(rawLoc);
          const colMain = opts.color ?? [0.18, 0.76, 0.36];
          const colAcc = opts.accent_color ?? [0.36, 0.90, 0.46];

          for (let i = 0; i < layers; i++) {
            const t = i / Math.max(1, layers - 1);
            const layerR = rad * (1.0 - t * 0.38);
            const ly = loc[1] + i * (rad * 0.45);
            spawnPrimitiveMesh('FoliageCrown', new THREE.IcosahedronGeometry(layerR, 2), {
              location: [loc[0], ly, loc[2]],
              scale: [1.15, 0.72, 1.15],
              color: i % 2 === 0 ? colMain : colAcc,
              alreadyThreeSpace: true,
            });
          }
          logs.push(`bpy.ops.mesh.primitive_tree_foliage_add: Copa de follaje estilizado en ${layers} capas creada.`);
        },
        primitive_prop_chest_add: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['width', 'height', 'depth', 'location', 'color', 'accent_color'],
            { width: 1.35, height: 0.9, depth: 0.88, location: isZUp ? [0, 0, 0.5] : [0, 0.5, 0] }
          );
          const w = Number(opts.width ?? 1.35);
          const h = Number(opts.height ?? 0.9);
          const d = Number(opts.depth ?? 0.88);
          const rawLoc = Array.isArray(opts.location)
            ? opts.location
            : isZUp
            ? [0, 0, 0.5]
            : [0, 0.5, 0];
          const loc = convertLocToThree(rawLoc);
          const woodCol = opts.color ?? [0.48, 0.24, 0.10];
          const metalCol = opts.accent_color ?? [0.96, 0.74, 0.14];

          spawnPrimitiveMesh('ChestBase', new THREE.BoxGeometry(w, h * 0.62, d, 4, 4, 4), {
            location: [loc[0], loc[1], loc[2]],
            color: woodCol,
            alreadyThreeSpace: true,
          });
          spawnPrimitiveMesh('ChestLid', new THREE.CylinderGeometry(d * 0.5, d * 0.5, w * 0.98, 18), {
            location: [loc[0], loc[1] + h * 0.31, loc[2]],
            rotation: [0, 0, Math.PI / 2],
            color: woodCol,
            alreadyThreeSpace: true,
          });
          for (const side of [-1, 1]) {
            spawnPrimitiveMesh('ChestBand', new THREE.BoxGeometry(w * 0.12, h * 0.68, d * 1.05), {
              location: [loc[0] + side * (w * 0.36), loc[1] + h * 0.04, loc[2]],
              color: metalCol,
              alreadyThreeSpace: true,
            });
          }
          spawnPrimitiveMesh('ChestLock', new THREE.BoxGeometry(w * 0.18, h * 0.28, d * 0.12), {
            location: [loc[0], loc[1] + h * 0.22, loc[2] + d * 0.52],
            color: metalCol,
            alreadyThreeSpace: true,
          });
          logs.push(`bpy.ops.mesh.primitive_prop_chest_add: Cofre / contenedor 3D generado.`);
        },
        subdivide: () => {
          const affected = applyGlobalLaplacianSmoothing(modelWrapper, 2, 0.35);
          totalVerticesModified += affected;
          proxiesDirty = true;
        },
        subdivide_triangles: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['segments', 'mode', 'object'], { segments: 2 });
          const rawSeg = opts.segments ?? opts.mode ?? 2;
          const mode: TriangleSubdivideMode =
            rawSeg === 3 || rawSeg === '3' || String(rawSeg).toLowerCase() === 'poke'
              ? 3
              : rawSeg === 4 || rawSeg === '4' || String(rawSeg).toLowerCase() === 'quad'
              ? 4
              : 2;
          const targetObj = opts.object?._threeMesh || modelWrapper;
          const res = segmentAllModelTriangles(targetObj, mode);
          proxiesDirty = true;
          logs.push(
            `bpy.ops.mesh.subdivide_triangles(segments=${mode}): ${res.beforeTriangles} → ${res.afterTriangles} triángulos.`
          );
        },
        paint_triangles: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['color', 'face_indices', 'object'], {
            color: [0.22, 0.74, 0.98],
          });
          const col = parsePythonColor(opts.color, '#38bdf8');
          const targetMesh: THREE.Mesh | undefined =
            opts.object?._threeMesh || currentActiveObjProxy?._threeMesh;
          if (targetMesh && targetMesh.isMesh) {
            applyMaterialToThreeMesh(targetMesh, col);
            logs.push(`bpy.ops.mesh.paint_triangles: Pintura aplicada en '${targetMesh.name}'.`);
          }
        },
        bevel: () => {
          const affected = applyGlobalLaplacianSmoothing(modelWrapper, 1, 0.25);
          totalVerticesModified += affected;
          proxiesDirty = true;
        },
        flip_normals: () => {
          const mesh: THREE.Mesh | undefined = currentActiveObjProxy?._threeMesh;
          if (mesh && mesh.isMesh) {
            const stdMat = mesh.userData.originalMaterial as THREE.MeshPhysicalMaterial | undefined;
            const toonMat = mesh.userData.toonMaterial as THREE.MeshToonMaterial | undefined;
            if (stdMat) {
              stdMat.side = THREE.BackSide;
              stdMat.needsUpdate = true;
            }
            if (toonMat) {
              toonMat.side = THREE.BackSide;
              toonMat.needsUpdate = true;
            }
            mesh.userData.pbrProps = { ...(mesh.userData.pbrProps || {}), flipNormals: true };
            if (mesh.userData.outlineMesh) {
              (mesh.userData.outlineMesh as THREE.Mesh).visible = false;
            }
            logs.push(`bpy.ops.mesh.flip_normals(): Normales invertidas (Backface Culling / Outline activo) en '${mesh.name}'.`);
          }
        },
        normals_make_consistent: (opts?: { inside?: boolean }) => {
          if (opts?.inside) {
            (bpy.ops.mesh as any).flip_normals();
          }
        },
        extrude_region_move: () => {},
        mirror_x: () => {
          collectMeshes();
          const sourceMeshes = [...meshes];
          let mirroredCount = 0;
          sourceMeshes.forEach((m) => {
            if (Math.abs(m.position.x) > 0.08 && !m.userData.isMirroredClone) {
              const hasTwin = sourceMeshes.some(
                (other) =>
                  other !== m &&
                  Math.abs(other.position.x + m.position.x) < 0.06 &&
                  Math.abs(other.position.y - m.position.y) < 0.06 &&
                  Math.abs(other.position.z - m.position.z) < 0.06
              );
              if (!hasTwin) {
                const clonedGeo = m.geometry.clone();
                const cloneMesh = new THREE.Mesh(clonedGeo);
                cloneMesh.name = `${m.name}_MirrorX`;
                cloneMesh.position.set(-m.position.x, m.position.y, m.position.z);
                cloneMesh.rotation.set(m.rotation.x, -m.rotation.y, -m.rotation.z);
                cloneMesh.scale.copy(m.scale);
                cloneMesh.userData.isMirroredClone = true;

                const origMat = m.userData.originalMaterial as THREE.MeshStandardMaterial | undefined;
                const col = origMat ? origMat.color.clone() : new THREE.Color('#38bdf8');
                configureNewlySpawnedMesh(cloneMesh, col, gradientTex, outThick, outOpac);
                targetParent.add(cloneMesh);
                objectsCreatedCount++;
                mirroredCount++;
              }
            }
          });
          proxiesDirty = true;
          collectMeshes();
          logs.push(`bpy.ops.mesh.mirror_x(): ${mirroredCount} piezas duplicadas en simetría espejo X.`);
        },
        taper: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['factor', 'axis'], { factor: 0.25, axis: 'Y' });
          const factor = Number(options.factor ?? 0.25);
          const axis = options.axis ?? 'Y';
          let count = 0;
          ensureVertexProxies().forEach((v) => {
            if (axis === 'Y') {
              const scaleXZ = Math.max(0.2, 1.0 + (v.co.y - 1.2) * factor);
              v.co.x *= scaleXZ;
              v.co.z *= scaleXZ;
            }
            v.commit();
            count++;
          });
          totalVerticesModified += count;
          logs.push(`bpy.ops.mesh.taper(factor=${factor}): silueta estilizada.`);
        },
        auto_ground: () => {
          collectMeshes();
          if (meshes.length === 0) return;
          let minLocalY = Infinity;
          meshes.forEach((m) => {
            m.geometry.computeBoundingBox();
            const bb = m.geometry.boundingBox;
            if (bb) {
              const worldMinY = m.position.y + bb.min.y * m.scale.y;
              if (worldMinY < minLocalY) minLocalY = worldMinY;
            }
          });
          if (Number.isFinite(minLocalY)) {
            const desiredMinY = 0.02;
            const shiftY = desiredMinY - minLocalY;
            meshes.forEach((m) => {
              m.position.y += shiftY;
            });
            logs.push(
              `bpy.ops.mesh.auto_ground(): modelo alineado perfectamente sobre el pedestal (ajuste Y=${shiftY.toFixed(2)}).`
            );
          }
        },
        smooth: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['iterations', 'factor'], {
            iterations: 3,
            factor: 0.5,
          });
          const iter = Number(options.iterations ?? 3);
          const fac = Number(options.factor ?? 0.5);
          const affected = applyGlobalLaplacianSmoothing(modelWrapper, iter, fac);
          totalVerticesModified += affected;
          proxiesDirty = true;
          logs.push(
            `bpy.ops.mesh.smooth(iterations=${iter}, factor=${fac}): ${affected} vértices redondeados.`
          );
        },
        decimate: async (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['ratio'], { ratio: 0.5 });
          const ratio = Number(options.ratio ?? 0.5);
          logs.push(`bpy.ops.mesh.decimate(ratio=${ratio}): procesando reducción...`);
          const res = await decimateModelGeometry(modelWrapper, 1 - ratio, { preserveFeatures: true });
          proxiesDirty = true;
          logs.push(
            `Reducción completada: de ${res.originalTriangles} a ${res.newTriangles} triángulos.`
          );
        },
        inflate: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['amount'], { amount: 0.05 });
          const amount = Number(options.amount ?? 0.05);
          let count = 0;
          ensureVertexProxies().forEach((v) => {
            v.co.x += v.normal.x * amount;
            v.co.y += v.normal.y * amount;
            v.co.z += v.normal.z * amount;
            v.commit();
            count++;
          });
          totalVerticesModified += count;
          logs.push(
            `bpy.ops.mesh.inflate(amount=${amount}): ${count} vértices desplazados hacia afuera.`
          );
        },
        noise: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['scale', 'frequency'], {
            scale: 0.04,
            frequency: 3.0,
          });
          const scale = Number(options.scale ?? 0.04);
          const freq = Number(options.frequency ?? 3.0);
          let count = 0;
          ensureVertexProxies().forEach((v) => {
            const nX = (Math.sin(v.co.y * freq * 3.1) + Math.cos(v.co.z * freq * 2.3)) * scale;
            const nY = (Math.sin(v.co.z * freq * 2.7) + Math.cos(v.co.x * freq * 3.7)) * scale;
            const nZ = (Math.sin(v.co.x * freq * 1.9) + Math.cos(v.co.y * freq * 2.9)) * scale;
            v.co.x += nX;
            v.co.y += nY;
            v.co.z += nZ;
            v.commit();
            count++;
          });
          totalVerticesModified += count;
          logs.push(`bpy.ops.mesh.noise(scale=${scale}, frequency=${freq}): ruido aplicado.`);
        },
        twist: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['angle', 'axis'], { angle: 0.4, axis: 'Y' });
          const angle = Number(options.angle ?? 0.4);
          const axis = options.axis ?? 'Y';
          let count = 0;
          ensureVertexProxies().forEach((v) => {
            if (axis === 'Y') {
              const theta = v.co.y * angle;
              const cosT = Math.cos(theta);
              const sinT = Math.sin(theta);
              const newX = v.co.x * cosT - v.co.z * sinT;
              const newZ = v.co.x * sinT + v.co.z * cosT;
              v.co.x = newX;
              v.co.z = newZ;
            } else if (axis === 'X') {
              const theta = v.co.x * angle;
              const cosT = Math.cos(theta);
              const sinT = Math.sin(theta);
              const newY = v.co.y * cosT - v.co.z * sinT;
              const newZ = v.co.y * sinT + v.co.z * cosT;
              v.co.y = newY;
              v.co.z = newZ;
            }
            v.commit();
            count++;
          });
          totalVerticesModified += count;
          logs.push(`bpy.ops.mesh.twist(angle=${angle}, axis='${axis}'): torsión completada.`);
        },
      },
      transform: {
        resize: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['value'], { value: [1, 1, 1] });
          const [sx, sy, sz] = convertScaleToThree(options.value);
          const targetMesh: THREE.Mesh | undefined = currentActiveObjProxy?._threeMesh;
          if (targetMesh) {
            targetMesh.scale.x *= sx;
            targetMesh.scale.y *= sy;
            targetMesh.scale.z *= sz;
          }
          logs.push(`bpy.ops.transform.resize(value=${JSON.stringify(options.value)})`);
        },
        translate: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['value'], { value: [0, 0, 0] });
          const [dx, dy, dz] = convertLocToThree(options.value);
          const targetMesh: THREE.Mesh | undefined = currentActiveObjProxy?._threeMesh;
          if (targetMesh) {
            targetMesh.position.x += dx;
            targetMesh.position.y += dy;
            targetMesh.position.z += dz;
          }
          logs.push(`bpy.ops.transform.translate(value=${JSON.stringify(options.value)})`);
        },
        rotate: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['value', 'orient_axis'], {
            value: 0,
            orient_axis: 'Y',
          });
          const val = Number(options.value ?? 0);
          const axis = String(options.orient_axis ?? 'Y').toUpperCase();
          const targetMesh: THREE.Mesh | undefined = currentActiveObjProxy?._threeMesh;
          if (targetMesh) {
            if (axis === 'X') targetMesh.rotation.x += val;
            else if (axis === 'Y') {
              if (isZUp) targetMesh.rotation.z -= val;
              else targetMesh.rotation.y += val;
            } else if (axis === 'Z') {
              if (isZUp) targetMesh.rotation.y += val;
              else targetMesh.rotation.z += val;
            }
          }
          logs.push(`bpy.ops.transform.rotate(value=${val}, axis='${axis}')`);
        },
      },
      material: {
        set_color: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['color'], {});
          if (!options.color) return;
          const col = parsePythonColor(options.color);
          const hex = `#${col.getHexString()}`;
          const activeMesh: THREE.Mesh | undefined = currentActiveObjProxy?._threeMesh;
          if (objectsCreatedCount > 0 && activeMesh) {
            applyMaterialToThreeMesh(activeMesh, col);
          } else {
            collectMeshes();
            meshes.forEach((m) => applyMaterialToThreeMesh(m, col));
            callbacks?.onColorChange?.(hex);
          }
          logs.push(`bpy.ops.material.set_color(color='${hex}')`);
        },
        set_texture: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(
            rawArgs,
            ['name', 'object', 'repeat', 'bump', 'natural_color'],
            { name: 'stone_ashlar', repeat: 2, bump: 1.0, natural_color: true }
          );
          const resolvedTex = resolveTexturePatternId(String(options.name ?? 'stone_ashlar'));
          const repeatVal = Math.max(1, Math.min(16, Number(options.repeat ?? options.scale ?? 2) || 2));
          const bumpMult = Math.max(0, Math.min(3.0, Number(options.bump ?? 1.0)));
          const natCol = options.natural_color !== undefined ? Boolean(options.natural_color) : true;
          const targetObj = options.object ?? options.objeto;
          const specificMesh: THREE.Mesh | undefined = targetObj?._threeMesh;

          if (specificMesh && specificMesh.isMesh) {
            const preset = getTexturePresetInfo(resolvedTex);
            const origMat = specificMesh.userData.originalMaterial as THREE.MeshPhysicalMaterial | undefined;
            const baseCol = origMat ? origMat.color.clone() : new THREE.Color('#ffffff');
            applyMaterialToThreeMesh(
              specificMesh,
              baseCol,
              preset.pbr.metalness,
              preset.pbr.roughness,
              null,
              0,
              {
                ...(specificMesh.userData.pbrProps || {}),
                texturePattern: resolvedTex,
                textureRepeat: repeatVal,
                textureNaturalColor: natCol,
                bumpScale: preset.pbr.bumpScale * bumpMult,
                clearcoat: preset.pbr.clearcoat,
                ior: preset.pbr.ior,
                transmission: preset.pbr.transmission,
              }
            );
            logs.push(
              `bpy.ops.material.set_texture(name='${resolvedTex}', object='${specificMesh.name}', repeat=${repeatVal}, bump=${bumpMult})`
            );
          } else {
            const preset = getTexturePresetInfo(resolvedTex);
            collectMeshes();
            meshes.forEach((m) => {
              const origMat = m.userData.originalMaterial as THREE.MeshPhysicalMaterial | undefined;
              const baseCol = origMat ? origMat.color.clone() : new THREE.Color('#ffffff');
              applyMaterialToThreeMesh(
                m,
                baseCol,
                preset.pbr.metalness,
                preset.pbr.roughness,
                null,
                0,
                {
                  ...(m.userData.pbrProps || {}),
                  texturePattern: resolvedTex,
                  textureRepeat: repeatVal,
                  textureNaturalColor: natCol,
                  bumpScale: preset.pbr.bumpScale * bumpMult,
                  clearcoat: preset.pbr.clearcoat,
                  ior: preset.pbr.ior,
                  transmission: preset.pbr.transmission,
                }
              );
            });
            callbacks?.onTextureChange?.(resolvedTex);
            callbacks?.onTextureSettingsChange?.({
              activeTexture: resolvedTex,
              repeatScale: repeatVal,
              bumpIntensity: bumpMult,
              useNaturalColor: natCol,
            });
            logs.push(
              `bpy.ops.material.set_texture(name='${resolvedTex}', repeat=${repeatVal}, bump=${bumpMult}, natural_color=${natCol})`
            );
          }
        },
        set_cel_shading: (...rawArgs: unknown[]) => {
          const options = extractPyArgs(rawArgs, ['tones', 'outline_thickness', 'outline_opacity'], {
            tones: 3,
          });
          callbacks?.onRenderEngineChange?.('cel');
          if (options.outline_thickness !== undefined || options.outline_opacity !== undefined) {
            callbacks?.onRenderSettingsChange?.({
              ...(options.outline_thickness !== undefined
                ? { outlineThickness: Number(options.outline_thickness) }
                : {}),
              ...(options.outline_opacity !== undefined
                ? { outlineOpacity: Number(options.outline_opacity) }
                : {}),
            });
          }
          logs.push(`bpy.ops.material.set_cel_shading(tones=${options.tones}): Cel-Shading activo.`);
        },
      },
      view3d: {
        camera_preset: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['view', 'preset', 'zoom'], { view: 'hero' });
          const rawV = String(opts.view ?? opts.preset ?? 'hero').toLowerCase();
          const mapPreset: Record<string, 'hero' | 'front' | 'closeup' | 'macro' | 'side' | 'top'> = {
            hero: 'hero',
            iso: 'hero',
            isometric: 'hero',
            front: 'front',
            frontal: 'front',
            closeup: 'closeup',
            rostro: 'closeup',
            macro: 'macro',
            detalle: 'macro',
            side: 'side',
            perfil: 'side',
            right: 'side',
            top: 'top',
            cenital: 'top',
          };
          const chosen = mapPreset[rawV] || 'hero';
          callbacks?.onCameraPresetChange?.(chosen);
          if (opts.zoom !== undefined) {
            callbacks?.onZoomChange?.(Math.max(25, Math.min(1600, Number(opts.zoom) || 100)));
          }
          logs.push(`bpy.ops.view3d.camera_preset(view='${chosen}')`);
        },
        set_zoom: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['percent', 'zoom'], { percent: 150 });
          const pct = Math.max(25, Math.min(1600, Number(opts.percent ?? opts.zoom) || 100));
          callbacks?.onZoomChange?.(pct);
          logs.push(`bpy.ops.view3d.set_zoom(percent=${pct}%)`);
        },
        frame_all: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['margin'], { margin: 1.2 });
          callbacks?.onFrameModel?.(Number(opts.margin) || 1.2);
          logs.push(`bpy.ops.view3d.frame_all(margin=${opts.margin ?? 1.2})`);
        },
      },
      wm: createSafeNoopProxy({
        read_factory_settings: () => {
          const childrenCopy = [...targetParent.children];
          childrenCopy.forEach((child) => {
            child.traverse((c) => {
              if ((c as THREE.Mesh).isMesh) {
                const m = c as THREE.Mesh;
                m.geometry?.dispose();
              }
            });
            targetParent.remove(child);
          });
          worldEnvLight = null;
          targetParent.name = 'Blender_Scene_Root';
          targetParent.scale.setScalar(1);
          targetParent.position.set(0, -1.35, 0);
          targetParent.rotation.set(0, 0, 0);
          clearBlenderAnimations();
          allObjectProxies.length = 0;
          proxiesDirty = true;
          collectMeshes();
          logs.push(`bpy.ops.wm.read_factory_settings(): escena reiniciada en limpio.`);
        },
      }),
      render: {
        set_engine: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            [
              'engine',
              'samples',
              'clearcoat',
              'roughness_factor',
              'ior',
              'gi_bounce',
              'progressive',
              'bloom',
              'env_intensity',
            ],
            { engine: 'CYCLES' }
          );
          const engStr = String(opts.engine || 'CYCLES').toUpperCase();
          if (engStr.includes('CYCLES')) callbacks?.onRenderEngineChange?.('cycles');
          else if (engStr.includes('EEVEE')) callbacks?.onRenderEngineChange?.('eevee');
          else if (engStr.includes('MATCAP') || engStr.includes('WORKBENCH')) callbacks?.onRenderEngineChange?.('matcap');
          else if (engStr.includes('NORMAL')) callbacks?.onRenderEngineChange?.('normals');
          else if (engStr.includes('ORIGINAL')) callbacks?.onRenderEngineChange?.('original');
          else callbacks?.onRenderEngineChange?.('cel');

          const partial: Record<string, any> = {};
          if (opts.samples !== undefined) partial.cyclesSamples = Math.max(16, Math.min(256, Number(opts.samples)));
          if (opts.clearcoat !== undefined) partial.cyclesClearcoat = Math.max(0, Math.min(1, Number(opts.clearcoat)));
          if (opts.roughness_factor !== undefined) partial.cyclesRoughnessFactor = Math.max(0.15, Math.min(1.4, Number(opts.roughness_factor)));
          if (opts.ior !== undefined) partial.cyclesIor = Math.max(1.0, Math.min(2.4, Number(opts.ior)));
          if (opts.gi_bounce !== undefined) partial.cyclesGiBounceBoost = Math.max(0.6, Math.min(2.4, Number(opts.gi_bounce)));
          if (opts.progressive !== undefined) partial.cyclesProgressiveAccum = Boolean(opts.progressive);
          if (opts.bloom !== undefined) partial.eeveeBloomIntensity = Math.max(0, Math.min(1.8, Number(opts.bloom)));
          if (opts.env_intensity !== undefined) partial.eeveeEnvIntensity = Math.max(0.2, Math.min(3.0, Number(opts.env_intensity)));
          if (Object.keys(partial).length > 0) {
            callbacks?.onRenderSettingsChange?.(partial);
          }
          logs.push(`bpy.ops.render.set_engine(engine='${opts.engine}')`);
        },
        set_shading: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['mode', 'matcap'], { mode: 'cel' });
          const mStr = String(opts.mode || 'cel').toLowerCase();
          if (mStr.includes('cycle')) callbacks?.onRenderEngineChange?.('cycles');
          else if (mStr.includes('eevee')) callbacks?.onRenderEngineChange?.('eevee');
          else if (mStr.includes('matcap')) callbacks?.onRenderEngineChange?.('matcap');
          else if (mStr.includes('normal')) callbacks?.onRenderEngineChange?.('normals');
          else if (mStr.includes('original') || mStr.includes('pbr')) callbacks?.onRenderEngineChange?.('original');
          else callbacks?.onRenderEngineChange?.('cel');

          if (opts.matcap) {
            callbacks?.onRenderSettingsChange?.({ matcapPreset: String(opts.matcap) as MatcapPresetId });
          }
          logs.push(`bpy.ops.render.set_shading(mode='${opts.mode}')`);
        },
        set_outline: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['thickness', 'opacity'], { thickness: 1.25, opacity: 0.9 });
          callbacks?.onRenderSettingsChange?.({
            outlineThickness: Math.max(0, Math.min(3.0, Number(opts.thickness ?? 1.25))),
            outlineOpacity: Math.max(0, Math.min(1.0, Number(opts.opacity ?? 0.9))),
          });
          logs.push(`bpy.ops.render.set_outline(thickness=${opts.thickness}, opacity=${opts.opacity})`);
        },
        set_normal_smoothing: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['factor'], { factor: 0.92 });
          const fac = Math.max(0, Math.min(1, Number(opts.factor ?? 0.92)));
          callbacks?.onRenderSettingsChange?.({ normalSmoothing: fac });
          applyNormalSmoothingToModel(modelWrapper, fac);
          logs.push(`bpy.ops.render.set_normal_smoothing(factor=${fac})`);
        },
        set_ssao: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['intensity'], { intensity: 1.15 });
          const val = Math.max(0, Math.min(2.5, Number(opts.intensity ?? 1.15)));
          callbacks?.onRenderSettingsChange?.({ ssaoIntensity: val });
          logs.push(`bpy.ops.render.set_ssao(intensity=${val})`);
        },
        set_lighting: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(rawArgs, ['intensity', 'angle', 'follow_camera'], {});
          const partial: Record<string, any> = {};
          if (opts.intensity !== undefined) partial.lightIntensity = Math.max(0.5, Math.min(4.0, Number(opts.intensity)));
          if (opts.angle !== undefined) partial.lightAngle = ((Number(opts.angle) % 360) + 360) % 360;
          if (opts.follow_camera !== undefined) partial.followCameraLight = Boolean(opts.follow_camera);
          callbacks?.onRenderSettingsChange?.(partial);
          logs.push(`bpy.ops.render.set_lighting(${JSON.stringify(partial)})`);
        },
        set_viewport: (...rawArgs: unknown[]) => {
          const opts = extractPyArgs(
            rawArgs,
            ['bg_color', 'show_pedestal', 'wireframe', 'auto_rotate', 'auto_rotate_speed', 'aa_mode'],
            {}
          );
          const partial: Record<string, any> = {};
          if (opts.bg_color !== undefined) {
            const c = parsePythonColor(opts.bg_color, '#1e2536');
            partial.bgColor = `#${c.getHexString()}`;
          }
          if (opts.show_pedestal !== undefined) partial.showPedestalGrid = Boolean(opts.show_pedestal);
          if (opts.wireframe !== undefined) partial.wireframe = Boolean(opts.wireframe);
          if (opts.auto_rotate !== undefined) partial.autoRotate = Boolean(opts.auto_rotate);
          if (opts.auto_rotate_speed !== undefined) partial.autoRotateSpeed = Number(opts.auto_rotate_speed) || 1.2;
          if (opts.aa_mode !== undefined) partial.aaMode = String(opts.aa_mode).toUpperCase() === 'FXAA' ? 'FXAA' : 'SMAA';
          callbacks?.onRenderSettingsChange?.(partial);
          logs.push(`bpy.ops.render.set_viewport(${JSON.stringify(partial)})`);
        },
      },
      anim: animModuleProxy,
    },
  };

  // ==========================================================================
  // MÓDULOS COMPLEMENTARIOS DE BLENDER 5.2: `bmesh`, `mathutils`, `random`
  // ==========================================================================
  const createMathutilsVector = (init?: any, y?: number, z?: number): any => {
    let _0 = 0;
    let _1 = 0;
    let _2 = 0;
    if (Array.isArray(init)) {
      _0 = Number(init[0]) || 0;
      _1 = Number(init[1]) || 0;
      _2 = Number(init[2]) || 0;
    } else if (init && typeof init === 'object' && ('x' in init || 0 in init)) {
      _0 = Number(init.x ?? init[0]) || 0;
      _1 = Number(init.y ?? init[1]) || 0;
      _2 = Number(init.z ?? init[2]) || 0;
    } else if (typeof init === 'number') {
      _0 = Number(init) || 0;
      _1 = Number(y) || 0;
      _2 = Number(z) || 0;
    }

    const vec: any = {
      _isMathutils: true,
      get 0() {
        return _0;
      },
      set 0(v: number) {
        _0 = Number(v) || 0;
      },
      get 1() {
        return _1;
      },
      set 1(v: number) {
        _1 = Number(v) || 0;
      },
      get 2() {
        return _2;
      },
      set 2(v: number) {
        _2 = Number(v) || 0;
      },
      get x() {
        return _0;
      },
      set x(v: number) {
        _0 = Number(v) || 0;
      },
      get y() {
        return _1;
      },
      set y(v: number) {
        _1 = Number(v) || 0;
      },
      get z() {
        return _2;
      },
      set z(v: number) {
        _2 = Number(v) || 0;
      },
      get length() {
        return Math.hypot(_0, _1, _2);
      },
      set length(newLen: number) {
        const cur = Math.hypot(_0, _1, _2) || 1;
        const scale = (Number(newLen) || 0) / cur;
        _0 *= scale;
        _1 *= scale;
        _2 *= scale;
      },
      get length_squared() {
        return _0 * _0 + _1 * _1 + _2 * _2;
      },
      *[Symbol.iterator]() {
        yield _0;
        yield _1;
        yield _2;
      },
      slice(start?: number, end?: number) {
        return [_0, _1, _2].slice(start, end);
      },
      map(fn: (v: number, i: number) => any) {
        return [_0, _1, _2].map(fn);
      },
      toArray() {
        return [_0, _1, _2];
      },
      normalized() {
        const l = Math.hypot(_0, _1, _2) || 1;
        return createMathutilsVector([_0 / l, _1 / l, _2 / l]);
      },
      normalize() {
        const l = Math.hypot(_0, _1, _2) || 1;
        _0 /= l;
        _1 /= l;
        _2 /= l;
        return this;
      },
      copy() {
        return createMathutilsVector([_0, _1, _2]);
      },
      dot(other: any) {
        return (
          _0 * Number(other?.[0] ?? other?.x ?? 0) +
          _1 * Number(other?.[1] ?? other?.y ?? 0) +
          _2 * Number(other?.[2] ?? other?.z ?? 0)
        );
      },
      cross(other: any) {
        const ox = Number(other?.[0] ?? other?.x ?? 0);
        const oy = Number(other?.[1] ?? other?.y ?? 0);
        const oz = Number(other?.[2] ?? other?.z ?? 0);
        return createMathutilsVector([
          _1 * oz - _2 * oy,
          _2 * ox - _0 * oz,
          _0 * oy - _1 * ox,
        ]);
      },
      angle(other: any) {
        const d = this.dot(other);
        const l1 = this.length;
        const l2 = Math.hypot(
          Number(other?.[0] ?? other?.x ?? 0),
          Number(other?.[1] ?? other?.y ?? 0),
          Number(other?.[2] ?? other?.z ?? 0)
        );
        return Math.acos(Math.max(-1, Math.min(1, d / (l1 * l2 || 1))));
      },
      negate() {
        _0 = -_0;
        _1 = -_1;
        _2 = -_2;
        return this;
      },
      to_tuple() {
        return [_0, _1, _2];
      },
    };

    return vec;
  };

  const createMathutilsEuler = (init?: any, y?: number, z?: number, order: string = 'XYZ'): any => {
    const vec = createMathutilsVector(init, y, z);
    vec.order = order;
    vec.to_matrix = function () {
      const rx = Number(vec[0]) || 0;
      const ry = Number(vec[1]) || 0;
      const rz = Number(vec[2]) || 0;
      const mx = createMathutilsMatrix.Rotation(rx, 4, 'X');
      const my = createMathutilsMatrix.Rotation(ry, 4, 'Y');
      const mz = createMathutilsMatrix.Rotation(rz, 4, 'Z');
      return bpy._matmul(mz, bpy._matmul(my, mx));
    };
    return vec;
  };

  const createMathutilsMatrix: any = function (..._args: any[]) {
    return [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
  };
  createMathutilsMatrix.Identity = () => [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  createMathutilsMatrix.Translation = (v: any) => {
    const x = Number(v?.[0] ?? v?.x ?? 0);
    const y = Number(v?.[1] ?? v?.y ?? 0);
    const z = Number(v?.[2] ?? v?.z ?? 0);
    return [
      [1, 0, 0, x],
      [0, 1, 0, y],
      [0, 0, 1, z],
      [0, 0, 0, 1],
    ];
  };
  createMathutilsMatrix.Rotation = (ang: number, _size: number = 4, axis: any = 'Z') => {
    const c = Math.cos(ang || 0);
    const s = Math.sin(ang || 0);
    if (axis && typeof axis === 'object') {
      const ax = Number(axis[0] ?? axis.x ?? 0);
      const ay = Number(axis[1] ?? axis.y ?? 0);
      const az = Number(axis[2] ?? axis.z ?? 1);
      const len = Math.hypot(ax, ay, az) || 1;
      const ux = ax / len, uy = ay / len, uz = az / len;
      const t = 1 - c;
      return [
        [t * ux * ux + c, t * ux * uy - s * uz, t * ux * uz + s * uy, 0],
        [t * ux * uy + s * uz, t * uy * uy + c, t * uy * uz - s * ux, 0],
        [t * ux * uz - s * uy, t * uy * uz + s * ux, t * uz * uz + c, 0],
        [0, 0, 0, 1],
      ];
    }
    const ax = typeof axis === 'string' ? axis.toUpperCase() : 'Z';
    if (ax === 'X') {
      return [
        [1, 0, 0, 0],
        [0, c, -s, 0],
        [0, s, c, 0],
        [0, 0, 0, 1],
      ];
    } else if (ax === 'Y') {
      return [
        [c, 0, s, 0],
        [0, 1, 0, 0],
        [-s, 0, c, 0],
        [0, 0, 0, 1],
      ];
    }
    return [
      [c, -s, 0, 0],
      [s, c, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
  };
  createMathutilsMatrix.Scale = (s: any, _size: number = 4, axis?: any) => {
    if (typeof s === 'number' && axis && (Array.isArray(axis) || typeof axis === 'object')) {
      const ax = Math.abs(Number(axis[0] ?? axis.x ?? 0)) > 0.5 ? s : 1;
      const ay = Math.abs(Number(axis[1] ?? axis.y ?? 0)) > 0.5 ? s : 1;
      const az = Math.abs(Number(axis[2] ?? axis.z ?? 0)) > 0.5 ? s : 1;
      return [
        [ax, 0, 0, 0],
        [0, ay, 0, 0],
        [0, 0, az, 0],
        [0, 0, 0, 1],
      ];
    }
    const sx = typeof s === 'number' ? s : Number(s?.[0] ?? s?.x ?? 1);
    const sy = typeof s === 'number' ? s : Number(s?.[1] ?? s?.y ?? 1);
    const sz = typeof s === 'number' ? s : Number(s?.[2] ?? s?.z ?? 1);
    return [
      [sx, 0, 0, 0],
      [0, sy, 0, 0],
      [0, 0, sz, 0],
      [0, 0, 0, 1],
    ];
  };
  createMathutilsMatrix.Diagonal = (v: any) => createMathutilsMatrix.Scale(v);

  const mathutils = {
    Vector: createMathutilsVector,
    Euler: createMathutilsEuler,
    Color: (init?: any) => parsePythonColor(init),
    Quaternion: (init?: any) => init || [1, 0, 0, 0],
    Matrix: createMathutilsMatrix,
  };

  const bmesh = {
    new: () => {
      const bmVerts: { index: number; co: any; normal: any; select?: boolean }[] = [];
      const bmFaces: any[] = [];
      let internalGeo: THREE.BufferGeometry | null = null;

      const makeBMFace = (idx: number, vObjs: any[]) => ({
        index: idx,
        verts: vObjs,
        material_index: 0,
        smooth: true,
        normal: createMathutilsVector([0, 1, 0]),
        normal_update: () => {},
        select: true,
        calc_center_median: () => {
          if (!vObjs || vObjs.length === 0) return createMathutilsVector([0, 0, 0]);
          let sx = 0, sy = 0, sz = 0;
          for (const v of vObjs) {
            sx += Number(v?.co?.x ?? v?.co?.[0] ?? 0);
            sy += Number(v?.co?.y ?? v?.co?.[1] ?? 0);
            sz += Number(v?.co?.z ?? v?.co?.[2] ?? 0);
          }
          return createMathutilsVector([sx / vObjs.length, sy / vObjs.length, sz / vObjs.length]);
        },
      });

      const bmObj = {
        _isBMesh: true,
        verts: new Proxy(bmVerts, {
          get(target, prop) {
            if (prop === 'new') {
              return (co: any = [0, 0, 0]) => {
                const x = Number(co?.[0] ?? co?.x ?? 0);
                const y = Number(co?.[1] ?? co?.y ?? 0);
                const z = Number(co?.[2] ?? co?.z ?? 0);
                const v = {
                  index: target.length,
                  co: createMathutilsVector([x, y, z]),
                  normal: createMathutilsVector([0, 0, 1]),
                  select: true,
                };
                target.push(v);
                return v;
              };
            }
            if (prop === 'ensure_lookup_table' || prop === 'index_update') return () => {};
            if (prop === 'remove') {
              return (v: any) => {
                const idx = target.indexOf(v);
                if (idx !== -1) target.splice(idx, 1);
              };
            }
            if (typeof prop === 'string') {
              const numIdx = Number(prop);
              if (!Number.isNaN(numIdx) && numIdx < 0) {
                return target[target.length + numIdx];
              }
            }
            return Reflect.get(target, prop);
          },
        }),
        edges: new Proxy([] as any[], {
          get(target, prop) {
            if (prop === 'new') return () => ({ select: true, verts: [] });
            if (prop === 'ensure_lookup_table' || prop === 'index_update') return () => {};
            return Reflect.get(target, prop);
          },
        }),
        faces: new Proxy(bmFaces, {
          get(target, prop) {
            if (prop === 'new') {
              return (vList: any[]) => {
                const vObjs = Array.isArray(vList) ? vList : [];
                const faceObj = makeBMFace(target.length, vObjs);
                target.push(faceObj);
                return faceObj;
              };
            }
            if (prop === 'ensure_lookup_table' || prop === 'index_update') return () => {};
            if (prop === 'remove') {
              return (f: any) => {
                const idx = target.indexOf(f);
                if (idx !== -1) target.splice(idx, 1);
              };
            }
            return Reflect.get(target, prop);
          },
        }),
        from_mesh: (meshData: any) => {
          const geo: THREE.BufferGeometry | undefined = meshData?._geometry;
          if (!geo) return;
          internalGeo = geo;
          const pos = geo.attributes.position as THREE.BufferAttribute;
          bmVerts.length = 0;
          bmFaces.length = 0;
          if (pos) {
            for (let i = 0; i < pos.count; i++) {
              const tx = pos.getX(i), ty = pos.getY(i), tz = pos.getZ(i);
              bmVerts.push({
                index: i,
                co: createMathutilsVector([tx, isZUp ? -tz : ty, isZUp ? ty : tz]),
                normal: createMathutilsVector([0, 0, 1]),
                select: true,
              });
            }
          }
        },
        to_mesh: (targetMeshObj: any) => {
          if (!targetMeshObj) return;
          if (bmVerts.length > 0 && bmFaces.length > 0) {
            // Re-indexar los vértices secuencialmente y extraer sus posiciones actualizadas (tras deformaciones math.sin/cos)
            const positions: number[] = [];
            const uvs: number[] = [];
            const indices: number[] = [];

            for (let i = 0; i < bmVerts.length; i++) {
              bmVerts[i].index = i;
              const vx = Number(bmVerts[i].co?.x ?? bmVerts[i].co?.[0] ?? 0);
              const vy = Number(bmVerts[i].co?.y ?? bmVerts[i].co?.[1] ?? 0);
              const vz = Number(bmVerts[i].co?.z ?? bmVerts[i].co?.[2] ?? 0);
              if (isZUp) {
                positions.push(vx, vz, -vy);
              } else {
                positions.push(vx, vy, vz);
              }
              uvs.push(vx, vy);
            }

            // Triangular caras para WebGL (triángulos, cuadriláteros -> 2 triángulos, y N-gonos)
            for (const face of bmFaces) {
              const fVerts = Array.isArray(face) ? face : Array.isArray(face?.verts) ? face.verts : [];
              const vIdxList: number[] = [];
              for (const fv of fVerts) {
                const idx = Number(typeof fv === 'object' ? fv?.index : fv);
                if (!Number.isNaN(idx) && idx >= 0 && idx < bmVerts.length) {
                  vIdxList.push(idx);
                }
              }
              if (vIdxList.length === 3) {
                indices.push(vIdxList[0], vIdxList[1], vIdxList[2]);
              } else if (vIdxList.length === 4) {
                // Cuadrilátero -> 2 triángulos
                indices.push(vIdxList[0], vIdxList[1], vIdxList[2]);
                indices.push(vIdxList[0], vIdxList[2], vIdxList[3]);
              } else if (vIdxList.length > 4) {
                for (let k = 1; k < vIdxList.length - 1; k++) {
                  indices.push(vIdxList[0], vIdxList[k], vIdxList[k + 1]);
                }
              }
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            if (indices.length > 0) {
              geometry.setIndex(indices);
            }
            geometry.computeVertexNormals(); // Crucial para el sombreado suave (f.smooth = True)

            targetMeshObj._threeGeometry = geometry;
            targetMeshObj._needsRebuild = true;

            if (typeof targetMeshObj._syncGeometryToBoundMesh === 'function') {
              targetMeshObj._syncGeometryToBoundMesh(geometry);
            } else {
              targetMeshObj._geometry = geometry;
              const boundMesh: THREE.Mesh | null =
                targetMeshObj._threeMesh || (targetMeshObj._ownerProxy?._threeMesh as THREE.Mesh | null) || null;
              if (boundMesh) {
                boundMesh.geometry = geometry;
                prepareGeometryNormals(boundMesh);
                targetMeshObj._geometry = boundMesh.geometry;
                if (boundMesh.userData.outlineMesh) {
                  (boundMesh.userData.outlineMesh as THREE.Mesh).geometry = boundMesh.geometry;
                }
              }
            }

            logs.push(
              `bm.to_mesh: ${bmVerts.length} vértices y ${bmFaces.length} caras (${Math.floor(indices.length / 3)} tris) volcados a BufferGeometry.`
            );
          } else if (internalGeo && bmVerts.length > 0) {
            const pos = internalGeo.attributes.position as THREE.BufferAttribute;
            if (pos && pos.count === bmVerts.length) {
              for (let i = 0; i < bmVerts.length; i++) {
                const c = bmVerts[i].co;
                if (isZUp) pos.setXYZ(i, c.x, c.z, -c.y);
                else pos.setXYZ(i, c.x, c.y, c.z);
              }
              pos.needsUpdate = true;
              internalGeo.computeVertexNormals();
            }
            if (typeof targetMeshObj._syncGeometryToBoundMesh === 'function') {
              targetMeshObj._syncGeometryToBoundMesh(internalGeo.clone());
            } else {
              targetMeshObj._geometry.copy(internalGeo);
              if (targetMeshObj._threeMesh) {
                prepareGeometryNormals(targetMeshObj._threeMesh);
              }
            }
          } else if (internalGeo) {
            if (typeof targetMeshObj._syncGeometryToBoundMesh === 'function') {
              targetMeshObj._syncGeometryToBoundMesh(internalGeo.clone());
            } else {
              targetMeshObj._geometry.copy(internalGeo);
              if (targetMeshObj._threeMesh) {
                prepareGeometryNormals(targetMeshObj._threeMesh);
              }
            }
          }
        },
        normal_update: () => {},
        transform: (mat: any) => {
          if (!mat) return;
          for (const v of bmVerts) {
            const transformed = bpy._matmul(mat, v.co);
            if (transformed) {
              v.co.x = Number(transformed[0] ?? transformed.x ?? v.co.x);
              v.co.y = Number(transformed[1] ?? transformed.y ?? v.co.y);
              v.co.z = Number(transformed[2] ?? transformed.z ?? v.co.z);
            }
          }
        },
        free: () => {
          bmVerts.length = 0;
          bmFaces.length = 0;
        },
        clear: () => {
          bmVerts.length = 0;
          bmFaces.length = 0;
        },
        _appendInternalGeo: (g: THREE.BufferGeometry, matrix?: any) => {
          const nonIndexed = g.index ? g.toNonIndexed() : g;
          const pos = nonIndexed.attributes.position as THREE.BufferAttribute;
          const baseIdx = bmVerts.length;
          const addedVerts: any[] = [];
          const addedFaces: any[] = [];
          if (pos) {
            for (let i = 0; i < pos.count; i++) {
              const tx = pos.getX(i), ty = pos.getY(i), tz = pos.getZ(i);
              let vec = createMathutilsVector([tx, isZUp ? -tz : ty, isZUp ? ty : tz]);
              if (matrix) {
                const tr = bpy._matmul(matrix, vec);
                if (tr) vec = createMathutilsVector([tr[0] ?? tr.x, tr[1] ?? tr.y, tr[2] ?? tr.z]);
              }
              const vObj = {
                index: baseIdx + i,
                co: vec,
                normal: createMathutilsVector([0, 0, 1]),
                select: true,
              };
              bmVerts.push(vObj);
              addedVerts.push(vObj);
            }
            for (let i = 0; i + 2 < addedVerts.length; i += 3) {
              const fObj = makeBMFace(bmFaces.length, [
                addedVerts[i],
                addedVerts[i + 1],
                addedVerts[i + 2],
              ]);
              bmFaces.push(fObj);
              addedFaces.push(fObj);
            }
          }
          internalGeo = nonIndexed;
          return { verts: addedVerts, faces: addedFaces };
        },
      };
      return bmObj;
    },
    ops: {
      create_icosphere: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'subdivisions', 'radius', 'diameter', 'matrix'], {
          subdivisions: 2,
          radius: 0.65,
        });
        const r = Number(opts.radius ?? opts.diameter ?? 0.65);
        const sub = Math.min(4, Math.max(0, Number(opts.subdivisions ?? 2)));
        const added = opts.bm?._appendInternalGeo
          ? opts.bm._appendInternalGeo(new THREE.IcosahedronGeometry(r, sub), opts.matrix)
          : { verts: [], faces: [] };
        return { geom: [...added.verts, ...added.faces], verts: added.verts, faces: added.faces, edges: [] };
      },
      create_uvsphere: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'u_segments', 'v_segments', 'radius', 'diameter', 'matrix'], {
          u_segments: 24,
          v_segments: 16,
          radius: 0.65,
        });
        const r = Number(opts.radius ?? opts.diameter ?? 0.65);
        const added = opts.bm?._appendInternalGeo
          ? opts.bm._appendInternalGeo(new THREE.SphereGeometry(r, 20, 14), opts.matrix)
          : { verts: [], faces: [] };
        return { geom: [...added.verts, ...added.faces], verts: added.verts, faces: added.faces, edges: [] };
      },
      create_cube: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'size', 'matrix'], { size: 1.0 });
        const s = Number(opts.size ?? 1.0);
        const added = opts.bm?._appendInternalGeo
          ? opts.bm._appendInternalGeo(new THREE.BoxGeometry(s, s, s, 2, 2, 2), opts.matrix)
          : { verts: [], faces: [] };
        return { geom: [...added.verts, ...added.faces], verts: added.verts, faces: added.faces, edges: [] };
      },
      create_cone: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(
          rawArgs,
          ['bm', 'segments', 'radius1', 'radius2', 'diameter1', 'diameter2', 'depth', 'matrix'],
          {
            segments: 16,
            radius1: 0.5,
            radius2: 0.0,
            depth: 1.0,
          }
        );
        const r1 = Number(opts.radius1 ?? opts.diameter1 ?? 0.5);
        const r2 = Number(opts.radius2 ?? opts.diameter2 ?? 0.0);
        const added = opts.bm?._appendInternalGeo
          ? opts.bm._appendInternalGeo(
              new THREE.CylinderGeometry(r2, r1, Number(opts.depth ?? 1.0), 16, 2),
              opts.matrix
            )
          : { verts: [], faces: [] };
        return { geom: [...added.verts, ...added.faces], verts: added.verts, faces: added.faces, edges: [] };
      },
      create_cylinder: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(
          rawArgs,
          ['bm', 'radius', 'radius1', 'radius2', 'diameter', 'depth', 'segments', 'matrix'],
          { radius: 0.5, depth: 1.0, segments: 16 }
        );
        const r1 = Number(opts.radius1 ?? opts.radius ?? opts.diameter ?? 0.5);
        const r2 = Number(opts.radius2 ?? opts.radius ?? opts.diameter ?? 0.5);
        const d = Number(opts.depth ?? 1.0);
        const segs = Math.max(6, Number(opts.segments ?? 16));
        const added = opts.bm?._appendInternalGeo
          ? opts.bm._appendInternalGeo(new THREE.CylinderGeometry(r2, r1, d, segs, 2), opts.matrix)
          : { verts: [], faces: [] };
        return { geom: [...added.verts, ...added.faces], verts: added.verts, faces: added.faces, edges: [] };
      },
      create_circle: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'segments', 'radius', 'matrix'], {
          segments: 16,
          radius: 0.5,
        });
        const r = Number(opts.radius ?? 0.5);
        const segs = Math.max(6, Number(opts.segments ?? 16));
        const added = opts.bm?._appendInternalGeo
          ? opts.bm._appendInternalGeo(new THREE.CylinderGeometry(r, r, 0.02, segs, 1), opts.matrix)
          : { verts: [], faces: [] };
        return { geom: [...added.verts, ...added.faces], verts: added.verts, faces: added.faces, edges: [] };
      },
      create_grid: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(
          rawArgs,
          ['bm', 'x_segments', 'y_segments', 'size', 'matrix', 'calc_uvs'],
          {
            x_segments: 10,
            y_segments: 10,
            size: 1.0,
            matrix: null,
            calc_uvs: false,
          }
        );
        const bmTarget = opts.bm;
        if (!bmTarget || !bmTarget.verts || !bmTarget.faces) {
          return { geom: [], verts: [], faces: [], edges: [] };
        }

        const xSegments = Math.max(1, Math.min(350, Math.round(Number(opts.x_segments) || 10)));
        const ySegments = Math.max(1, Math.min(350, Math.round(Number(opts.y_segments) || 10)));
        const size = Math.max(0.001, Number(opts.size ?? 1.0));
        const half = size / 2.0;
        const dx = size / xSegments;
        const dy = size / ySegments;

        const gridVerts: any[] = [];
        // Crear matriz bidimensional de vértices (x_segments + 1) * (y_segments + 1)
        for (let iy = 0; iy <= ySegments; iy++) {
          const y = -half + iy * dy;
          for (let ix = 0; ix <= xSegments; ix++) {
            const x = -half + ix * dx;
            let vx = x;
            let vy = y;
            let vz = 0.0;
            if (opts.matrix) {
              const transformed = bpy._matmul(opts.matrix, [vx, vy, vz]);
              if (transformed) {
                vx = Number(transformed[0] ?? transformed.x ?? vx);
                vy = Number(transformed[1] ?? transformed.y ?? vy);
                vz = Number(transformed[2] ?? transformed.z ?? vz);
              }
            }
            const v = bmTarget.verts.new([vx, vy, vz]);
            gridVerts.push(v);
          }
        }

        // Conectar caras cuadrangulares (quads [v0, v1, v2, v3])
        const stride = xSegments + 1;
        const gridFaces: any[] = [];
        for (let iy = 0; iy < ySegments; iy++) {
          for (let ix = 0; ix < xSegments; ix++) {
            const v0 = gridVerts[iy * stride + ix];
            const v1 = gridVerts[iy * stride + (ix + 1)];
            const v2 = gridVerts[(iy + 1) * stride + (ix + 1)];
            const v3 = gridVerts[(iy + 1) * stride + ix];
            const f = bmTarget.faces.new([v0, v1, v2, v3]);
            gridFaces.push(f);
          }
        }

        return {
          geom: [...gridVerts, ...gridFaces],
          verts: gridVerts,
          faces: gridFaces,
          edges: [],
        };
      },
      subdivide_edges: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'edges', 'cuts'], { cuts: 1 });
        return { geom: opts.bm?.verts || [], verts: opts.bm?.verts || [], edges: [], faces: opts.bm?.faces || [] };
      },
      bevel: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'geom', 'offset'], { offset: 0.1 });
        return { geom: opts.bm?.verts || [], verts: opts.bm?.verts || [], edges: [], faces: opts.bm?.faces || [] };
      },
      extrude_face_region: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'geom'], {});
        const geomIn = Array.isArray(opts.geom) ? opts.geom : opts.bm?.verts || [];
        return { geom: geomIn, verts: opts.bm?.verts || [], faces: opts.bm?.faces || [] };
      },
      translate: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'vec', 'verts'], {});
        const vec = opts.vec || [0, 0, 0];
        const [dx, dy, dz] = [
          Number(vec[0] ?? vec.x ?? 0),
          Number(vec[1] ?? vec.y ?? 0),
          Number(vec[2] ?? vec.z ?? 0),
        ];
        const rawList = opts.verts || opts.bm?.verts || [];
        for (const item of rawList) {
          if (item && item.co) {
            item.co.x += dx;
            item.co.y += dy;
            item.co.z += dz;
          }
        }
        return { geom: rawList };
      },
      scale: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'vec', 'verts'], {});
        const vec = opts.vec || [1, 1, 1];
        const [sx, sy, sz] = [
          Number(vec[0] ?? vec.x ?? 1),
          Number(vec[1] ?? vec.y ?? 1),
          Number(vec[2] ?? vec.z ?? 1),
        ];
        const rawList = opts.verts || opts.bm?.verts || [];
        for (const item of rawList) {
          if (item && item.co) {
            item.co.x *= sx;
            item.co.y *= sy;
            item.co.z *= sz;
          }
        }
        return { geom: rawList };
      },
      rotate: (...rawArgs: unknown[]) => {
        const opts = extractPyArgs(rawArgs, ['bm', 'matrix', 'cent', 'verts'], {});
        const rawList = opts.verts || opts.bm?.verts || [];
        const mat = opts.matrix;
        const cent = opts.cent || [0, 0, 0];
        const cx = Number(cent[0] ?? cent.x ?? 0);
        const cy = Number(cent[1] ?? cent.y ?? 0);
        const cz = Number(cent[2] ?? cent.z ?? 0);
        if (mat) {
          for (const item of rawList) {
            if (item && item.co) {
              const rel = [item.co.x - cx, item.co.y - cy, item.co.z - cz];
              const rot = bpy._matmul(mat, rel);
              if (rot) {
                item.co.x = Number(rot[0] ?? rot.x ?? rel[0]) + cx;
                item.co.y = Number(rot[1] ?? rot.y ?? rel[1]) + cy;
                item.co.z = Number(rot[2] ?? rot.z ?? rel[2]) + cz;
              }
            }
          }
        }
        return { geom: rawList };
      },
      recalc_face_normals: () => ({}),
      remove_doubles: () => ({}),
    },
  };

  let rngSeed = 1337;
  const seededRandom = () => {
    rngSeed = (rngSeed * 16807) % 2147483647;
    return (rngSeed - 1) / 2147483646;
  };

  const pyRandom = {
    seed: (s?: number) => {
      rngSeed = Math.max(1, Math.abs(Number(s) || 1337));
    },
    random: () => seededRandom(),
    uniform: (a: number, b: number) => a + seededRandom() * (b - a),
    randint: (a: number, b: number) => Math.floor(a + seededRandom() * (b - a + 1)),
    choice: <T>(arr: T[]): T => arr[Math.floor(seededRandom() * arr.length)],
    gauss: (mu: number = 0, sigma: number = 1) => {
      const u1 = Math.max(1e-6, seededRandom());
      const u2 = seededRandom();
      return mu + sigma * Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    },
    shuffle: <T>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };

  const customPrint = (...args: unknown[]) => {
    const msg = args
      .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ');
    logs.push(msg);
  };

  const pyMath = {
    PI: Math.PI,
    pi: Math.PI,
    tau: Math.PI * 2,
    e: Math.E,
    inf: Infinity,
    nan: NaN,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    sqrt: Math.sqrt,
    abs: Math.abs,
    fabs: Math.abs,
    pow: Math.pow,
    floor: Math.floor,
    ceil: Math.ceil,
    trunc: Math.trunc,
    round: Math.round,
    min: Math.min,
    max: Math.max,
    exp: Math.exp,
    log: Math.log,
    log10: Math.log10,
    log2: Math.log2,
    hypot: Math.hypot,
    radians: (deg: number) => (deg * Math.PI) / 180,
    degrees: (rad: number) => (rad * 180) / Math.PI,
    copysign: (x: number, y: number) => (Math.sign(y) < 0 ? -Math.abs(x) : Math.abs(x)),
    isclose: (a: number, b: number) => Math.abs(a - b) <= 1e-6,
  };

  // Soporte ligero para scripts que usan `import numpy as np`
  const pyNumpy = {
    pi: Math.PI,
    sin: (x: any) => (Array.isArray(x) ? x.map(Math.sin) : Math.sin(Number(x) || 0)),
    cos: (x: any) => (Array.isArray(x) ? x.map(Math.cos) : Math.cos(Number(x) || 0)),
    tan: (x: any) => (Array.isArray(x) ? x.map(Math.tan) : Math.tan(Number(x) || 0)),
    sqrt: (x: any) => (Array.isArray(x) ? x.map(Math.sqrt) : Math.sqrt(Number(x) || 0)),
    abs: (x: any) => (Array.isArray(x) ? x.map(Math.abs) : Math.abs(Number(x) || 0)),
    deg2rad: (deg: number) => (deg * Math.PI) / 180,
    rad2deg: (rad: number) => (rad * 180) / Math.PI,
    radians: (deg: number) => (deg * Math.PI) / 180,
    degrees: (rad: number) => (rad * 180) / Math.PI,
    array: (arr: any) => (Array.isArray(arr) ? [...arr] : [arr]),
    zeros: (n: number) => new Array(Number(n) || 3).fill(0),
    ones: (n: number) => new Array(Number(n) || 3).fill(1),
    linspace: (start: number, stop: number, num: number = 10) => {
      const n = Math.max(1, Math.floor(Number(num) || 10));
      if (n === 1) return [start];
      const step = (stop - start) / (n - 1);
      return Array.from({ length: n }, (_, idx) => start + idx * step);
    },
    arange: (start: number, stop?: number, step: number = 1) => bpy._range(start, stop, step),
  };

  // Funciones built-in de Python (`len`, `enumerate`, `zip`, `sum`, `reversed`, `sorted`, `isinstance`)
  const pyLen = (x: any): number => {
    if (x == null) return 0;
    if (x._isMathutils) return 3;
    if (Array.isArray(x) || typeof x === 'string') return x.length;
    if (typeof x.length === 'number') return x.length;
    if (typeof x.size === 'number') return x.size;
    if (typeof x === 'object') return Object.keys(x).length;
    return 0;
  };

  const pyEnumerate = (iterable: Iterable<any>, start: number = 0) => {
    const res: [number, any][] = [];
    let idx = start;
    if (iterable && Symbol.iterator in Object(iterable)) {
      for (const item of iterable) {
        res.push([idx++, item]);
      }
    }
    return res;
  };

  const pyZip = (...iterables: any[][]) => {
    if (iterables.length === 0) return [];
    const minLen = Math.min(...iterables.map((it) => (Array.isArray(it) ? it.length : 0)));
    const out: any[][] = [];
    for (let i = 0; i < minLen; i++) {
      out.push(iterables.map((it) => it[i]));
    }
    return out;
  };

  const pySum = (arr: number[], start: number = 0) =>
    Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b || 0), start) : start;

  // Envolver sub-espacios de bpy.ops y bmesh.ops en Proxies tolerantes para que operadores no esenciales nunca lancen TypeError
  const wrapOpsNamespace = <T extends Record<string, any>>(nsObj: T): T =>
    new Proxy(nsObj, {
      has(target, prop) {
        return prop in target;
      },
      get(target, prop) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
        const val = (target as any)[prop];
        if (val !== undefined || prop in target) return val;
        if (typeof prop === 'string') {
          return () => ({ FINISHED: true, geom: [], verts: [], edges: [], faces: [] });
        }
        return Reflect.get(target, prop);
      },
      set(target, prop, value) {
        (target as any)[prop] = value;
        return true;
      },
    });

  bpy.ops.object = wrapOpsNamespace(bpy.ops.object);
  bpy.ops.mesh = wrapOpsNamespace(bpy.ops.mesh);
  bpy.ops.curve = wrapOpsNamespace(bpy.ops.curve);
  bpy.ops.transform = wrapOpsNamespace(bpy.ops.transform);
  bpy.ops.material = wrapOpsNamespace(bpy.ops.material);
  bpy.ops.view3d = wrapOpsNamespace(bpy.ops.view3d);
  bpy.ops.render = wrapOpsNamespace(bpy.ops.render);
  (bpy as any).ops = new Proxy(bpy.ops, {
    has(target, prop) {
      return prop in target;
    },
    get(target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      const val = (target as any)[prop];
      if (val !== undefined || prop in target) return val;
      return createSafeNoopProxy();
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    },
  });
  bmesh.ops = wrapOpsNamespace(bmesh.ops);
  (bmesh as any).from_edit_mesh = (me: any) => {
    const bm = bmesh.new();
    bm.from_mesh(me);
    return bm;
  };
  (bmesh as any).update_edit_mesh = (me: any) => {
    if (me?.update) me.update();
  };

  const rawSourceLines = cleanedRawScript.split('\n');
  const transpiledStatementsForDiag: { pyLine: number; jsText: string }[] = [];

  try {
    // 0. Pre-diagnóstico de paréntesis, corchetes, llaves y comillas con número de línea exacto
    const preDiagError = diagnosePythonStructureBeforeTranspile(rawSourceLines);
    if (preDiagError) {
      const preErr = new SyntaxError(preDiagError.reason);
      (preErr as any).__pyLine = preDiagError.line;
      (preErr as any).__pyReason = preDiagError.reason;
      throw preErr;
    }

    // 1. Limpiar docstrings, comentarios y unir sentencias multilínea entre paréntesis conservando /*@L:N@*/
    let jsCode = stripPythonCommentsAndDocstrings(cleanedRawScript);
    jsCode = joinMultilineBracketStatements(jsCode);

    // 2. Limpiar imports estándar de Python/Blender y formatear f-strings/r-strings y lambdas
    jsCode = jsCode
      .replace(/^(?:\/\*@L:\d+@\*\/)?\s*import\s+[a-zA-Z0-9_.,\s*]+$/gm, '')
      .replace(/^(?:\/\*@L:\d+@\*\/)?\s*from\s+[a-zA-Z0-9_.]+\s+import\s+.*$/gm, '');
    jsCode = convertPythonFStringsAndRawStrings(jsCode);
    jsCode = convertPythonLambdas(jsCode);
    jsCode = jsCode.replace(/\brange\s*\(/g, 'bpy._range(');

    // 3. Convertir comprensiones de listas, generadores y diccionarios Python
    jsCode = convertListComprehensions(jsCode);

    // 4. Transformar todas las llamadas con argumentos keyword `fn(a, k=v)` -> `fn(a, { __isKw: true, k: v })`
    jsCode = transformAllKeywordFunctionCalls(jsCode);

    // 5. Convertir tuplas literales de Python `(a, b, c)` en arrays `[a, b, c]`
    jsCode = convertPythonTuplesToArrays(jsCode);

    // 6. Procesar bloques por indentación de Python (`def`, `for`, `while`, `if`, `elif`, `else`, `try`, `except`, `finally`, `with`)
    const lines = jsCode.split('\n');
    const transformedLines: string[] = [];
    const blockStack: {
      headerIndent: number;
      scopeVars?: Set<string>;
      fnLocalVars?: Set<string>;
      fnDeclLineIndex?: number;
      isClass?: boolean;
    }[] = [];
    const topLevelVars = new Set<string>();
    const reservedVars = new Set<string>([
      'bpy',
      'anim',
      'bmesh',
      'mathutils',
      'Vector',
      'Euler',
      'Matrix',
      'Color',
      'Quaternion',
      'random',
      'math',
      'np',
      'numpy',
      'pi',
      'tau',
      'sin',
      'cos',
      'tan',
      'asin',
      'acos',
      'atan',
      'atan2',
      'sqrt',
      'radians',
      'degrees',
      'floor',
      'ceil',
      'hypot',
      'uniform',
      'randint',
      'choice',
      'seed',
      'print',
      'len',
      'abs',
      'min',
      'max',
      'round',
      'int',
      'float',
      'str',
      'bool',
      'list',
      'tuple',
      'dict',
      'enumerate',
      'zip',
      'sum',
      'reversed',
      'sorted',
      'isinstance',
      'hasattr',
      'getattr',
      'setattr',
      'pow',
      'exp',
      'log',
      'range',
      'set',
      '__name__',
      '__pyLine',
    ]);

    const registerAssignedVariable = (varName: string) => {
      if (!varName || !/^[a-zA-Z_]\w*$/.test(varName) || reservedVars.has(varName)) return;
      const activeFnBlock = [...blockStack].reverse().find((b) => b.scopeVars);
      if (activeFnBlock) {
        if (!activeFnBlock.scopeVars!.has(varName)) {
          activeFnBlock.fnLocalVars?.add(varName);
        }
      } else {
        topLevelVars.add(varName);
      }
    };

    const closeBlockAndInjectLocals = (top: {
      headerIndent: number;
      fnLocalVars?: Set<string>;
      fnDeclLineIndex?: number;
    }) => {
      if (
        top.fnLocalVars &&
        top.fnLocalVars.size > 0 &&
        typeof top.fnDeclLineIndex === 'number'
      ) {
        transformedLines[top.fnDeclLineIndex] = `${' '.repeat(
          top.headerIndent + 2
        )}let ${Array.from(top.fnLocalVars).join(', ')};`;
      }
      transformedLines.push(`${' '.repeat(top.headerIndent)}}`);
    };

    for (let i = 0; i < lines.length; i++) {
      let rawLine = lines[i];
      let currentPyLine = i + 1;
      const markerMatch = rawLine.match(/^\/\*@L:(\d+)@\*\//);
      if (markerMatch) {
        currentPyLine = parseInt(markerMatch[1], 10);
        rawLine = rawLine.slice(markerMatch[0].length);
      }

      let trimmed = rawLine.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@')) {
        continue;
      }

      const currentIndent = rawLine.match(/^\s*/)?.[0].length ?? 0;
      const isContinuationClause =
        trimmed === 'else:' ||
        /^elif\s+.+:$/.test(trimmed) ||
        /^except\b.*:$/.test(trimmed) ||
        trimmed === 'finally:';

      while (
        blockStack.length > 0 &&
        currentIndent <= blockStack[blockStack.length - 1].headerIndent
      ) {
        const top = blockStack[blockStack.length - 1];
        if (isContinuationClause && currentIndent === top.headerIndent) {
          blockStack.pop();
          break;
        }
        blockStack.pop();
        closeBlockAndInjectLocals(top);
      }

      const indentStr = ' '.repeat(currentIndent);

      // Ignorar `pass`, `global`, `nonlocal`, `del`, `assert` de Python
      if (
        trimmed === 'pass' ||
        /^(?:global|nonlocal|del|assert)\b/.test(trimmed)
      ) {
        transformedLines.push(`${indentStr}/* ${trimmed.split(/\s+/)[0]} */`);
        continue;
      }

      const activeClassBlock = [...blockStack].reverse().find((b) => b.isClass);
      const isInClass = Boolean(activeClassBlock && currentIndent > activeClassBlock.headerIndent);
      const isDirectClassMember = Boolean(
        isInClass && blockStack[blockStack.length - 1]?.isClass
      );

      // Cabecera de clase: `class NombreClase(bpy.types.Operator):`
      const classMatch = trimmed.match(/^class\s+([a-zA-Z_]\w*)(?:\(([^)]*)\))?\s*:$/);
      if (classMatch) {
        const className = classMatch[1];
        reservedVars.add(className);
        if (!isDirectClassMember) {
          transformedLines.push(`${indentStr}__pyLine = ${currentPyLine};`);
        }
        transformedLines.push(`${indentStr}class ${className} {`);
        blockStack.push({ headerIndent: currentIndent, isClass: true });
        continue;
      }

      // Cabecera de función o método Python: `def nombre_func(a, b=1, c: float = 2.0) -> Object:`
      const defMatch = trimmed.match(/^def\s+([a-zA-Z_]\w*)\s*\((.*)\)\s*(?:->\s*[^:]+)?\s*:$/);
      if (defMatch) {
        const fnName = defMatch[1];
        const rawParamsStr = rewritePythonSyntaxInLine(defMatch[2].trim(), true);
        if (!isInClass) reservedVars.add(fnName);

        const paramParts = rawParamsStr ? splitTopLevelCommas(rawParamsStr) : [];
        const paramNames: string[] = [];
        const defaultEntries: string[] = [];
        const localScopeVars = new Set<string>();
        const fnLocalVars = new Set<string>();

        for (const p of paramParts) {
          const cleanP = p.trim();
          if (!cleanP || cleanP.startsWith('*')) continue;
          if (isInClass && (cleanP === 'self' || cleanP === 'cls')) continue;

          const eqIdx = cleanP.indexOf('=');
          if (eqIdx !== -1) {
            const left = cleanP.slice(0, eqIdx).split(':')[0].trim();
            const right = cleanP.slice(eqIdx + 1).trim();
            paramNames.push(left);
            localScopeVars.add(left);
            defaultEntries.push(`${left}: ${right}`);
          } else {
            const pName = cleanP.split(':')[0].trim();
            paramNames.push(pName);
            localScopeVars.add(pName);
          }
        }

        const paramNamesJson = JSON.stringify(paramNames);
        const defaultsObj = `{ ${defaultEntries.join(', ')} }`;
        const destructureVars =
          paramNames.length > 0
            ? `let { ${paramNames.join(', ')} } = bpy._extractArgs(__rawArgs, ${paramNamesJson}, ${defaultsObj});`
            : '';

        if (isInClass) {
          transformedLines.push(`${indentStr}${fnName}(...__rawArgs) {`);
        } else {
          transformedLines.push(`${indentStr}function ${fnName}(...__rawArgs) {`);
        }
        transformedLines.push(`${indentStr}  __pyLine = ${currentPyLine};`);
        if (destructureVars) {
          transformedLines.push(`${indentStr}  ${destructureVars}`);
          transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: destructureVars });
        }
        const fnDeclLineIndex = transformedLines.length;
        transformedLines.push('');
        blockStack.push({
          headerIndent: currentIndent,
          scopeVars: localScopeVars,
          fnLocalVars,
          fnDeclLineIndex,
        });
        continue;
      }

      // Propiedad estática/de campo dentro de una clase Python (`bl_idname = "mesh.my_op"`)
      if (
        isDirectClassMember &&
        trimmed.includes('=') &&
        !trimmed.startsWith('if ') &&
        !trimmed.startsWith('for ') &&
        !trimmed.startsWith('while ')
      ) {
        transformedLines.push(`${indentStr}${trimmed};`);
        continue;
      }

      // Bloque `with ...:` (ej. `with bpy.context.temp_override(...):`)
      if (/^with\s+.+:$/.test(trimmed)) {
        transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; if (true) {`);
        blockStack.push({ headerIndent: currentIndent });
        continue;
      }

      // Bucle `for` con soporte de desempaquetado de tuplas e iterables implícitos: `for s in -1, 1:`
      // El espacio tras `in` es opcional: un paso previo puede dejar `in[-1, 1]` al convertir tuplas
      const forMatch = trimmed.match(/^for\s+(.+?)\s+in\s*(.+):$/);
      if (forMatch) {
        const rawTarget = forMatch[1].trim();
        // `for x in (a, b):` es una tupla de Python: se trata como lista (en JS, `(a, b)` es un operador coma)
        let iterSource = forMatch[2].trim();
        const wrappedTuple = iterSource.match(/^\((.*)\)$/);
        if (wrappedTuple && splitTopLevelCommas(wrappedTuple[1]).length > 1) {
          iterSource = `[${wrappedTuple[1]}]`;
        }
        let iterExpr = rewritePythonSyntaxInLine(iterSource, true);
        if (splitTopLevelCommas(iterExpr).length > 1) {
          iterExpr = `[${iterExpr}]`;
        }
        let jsTarget = rawTarget;

        if (rawTarget.includes(',') && !rawTarget.startsWith('[')) {
          jsTarget = `[${rawTarget.replace(/\(/g, '[').replace(/\)/g, ']')}]`;
        }

        const forHeaderJs = `for (let ${jsTarget} of ${iterExpr}) {`;
        transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; ${forHeaderJs}`);
        transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: `${forHeaderJs} }` });
        blockStack.push({ headerIndent: currentIndent });
        continue;
      }

      // Bucle `while cond:`
      const whileMatch = trimmed.match(/^while\s+(.+):$/);
      if (whileMatch) {
        const condJs = rewritePythonSyntaxInLine(whileMatch[1]);
        transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; while (${condJs}) {`);
        transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: `while (${condJs}) {}` });
        blockStack.push({ headerIndent: currentIndent });
        continue;
      }

      // `if cond:`
      const ifMatch = trimmed.match(/^if\s+(.+):$/);
      if (ifMatch) {
        const condJs = rewritePythonSyntaxInLine(ifMatch[1]);
        transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; if (${condJs}) {`);
        transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: `if (${condJs}) {}` });
        blockStack.push({ headerIndent: currentIndent });
        continue;
      }

      // `elif cond:`
      const elifMatch = trimmed.match(/^elif\s+(.+):$/);
      if (elifMatch) {
        const condJs = rewritePythonSyntaxInLine(elifMatch[1]);
        transformedLines.push(
          `${indentStr}} else if ((__pyLine = ${currentPyLine}, (${condJs}))) {`
        );
        transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: `if (${condJs}) {}` });
        blockStack.push({ headerIndent: currentIndent });
        continue;
      }

      if (trimmed === 'else:') {
        transformedLines.push(`${indentStr}} else { __pyLine = ${currentPyLine};`);
        blockStack.push({ headerIndent: currentIndent });
        continue;
      }

      if (trimmed === 'try:') {
        transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; try {`);
        blockStack.push({ headerIndent: currentIndent });
        continue;
      }

      // Manejar cláusulas `except:` o `except Exception as e:` vinculando las variables e, err, error
      const exceptMatch = trimmed.match(/^except\b\s*[^:]*?(?:\s+as\s+([a-zA-Z_]\w*))?\s*:$/);
      if (exceptMatch) {
        const boundName = exceptMatch[1];
        const aliases = Array.from(new Set(['e', 'err', 'error', ...(boundName ? [boundName] : [])]));
        transformedLines.push(`${indentStr}} catch (__pyErr) { __pyLine = ${currentPyLine};`);
        transformedLines.push(
          `${indentStr}  ${aliases.map((name) => `let ${name} = __pyErr;`).join(' ')}`
        );
        blockStack.push({ headerIndent: currentIndent });
        continue;
      }

      if (trimmed === 'finally:') {
        transformedLines.push(`${indentStr}} finally { __pyLine = ${currentPyLine};`);
        blockStack.push({ headerIndent: currentIndent });
        continue;
      }

      // Soportar anotaciones de tipo en asignaciones: `verts: list = []` -> `verts = []`
      trimmed = trimmed.replace(/^([a-zA-Z_]\w*)\s*:\s*[a-zA-Z_][a-zA-Z0-9_.\[\], ]*\s*=\s*/, '$1 = ');

      // Reescribir tokens Python (`True`, `False`, `None`, `and`, `or`, `not`, `in`, slicing, etc.) en la línea actual
      trimmed = rewritePythonSyntaxInLine(trimmed);

      // Soportar `return a, b, c` (tupla implícita en return sin paréntesis)
      const returnMatch = trimmed.match(/^return\s+(.+)$/);
      if (returnMatch) {
        const retExpr = returnMatch[1].trim();
        const topParts = splitTopLevelCommas(retExpr);
        if (topParts.length > 1) {
          const stmtJs = `return [${retExpr}];`;
          transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; ${stmtJs}`);
          transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: `[${retExpr}];` });
          continue;
        }
      }

      // Soportar desempaquetado de tuplas en asignación: `x, y, z = loc` o `[x, y, z] = loc` o `x, y = 1, 2`
      const tupleAssignMatch = trimmed.match(
        /^\[?\s*([a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)+)\s*\]?\s*=\s*(?!=)([\s\S]+)$/
      );
      if (tupleAssignMatch) {
        const lhsVars = tupleAssignMatch[1].split(',').map((s) => s.trim());
        let rhsExpr = tupleAssignMatch[2].trim();
        if (splitTopLevelCommas(rhsExpr).length > 1) {
          rhsExpr = `[${rhsExpr}]`;
        }
        lhsVars.forEach((v) => registerAssignedVariable(v));
        const stmtJs = `[${lhsVars.join(', ')}] = ${rhsExpr};`;
        transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; ${stmtJs}`);
        transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: stmtJs });
        continue;
      }

      // Detectar asignación simple de variable Python `varName = expr`
      const assignMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*(?:\+|-|\*|\/)?=\s*(?!=)/);
      if (assignMatch) {
        const vName = assignMatch[1];
        registerAssignedVariable(vName);
        const eqPos = trimmed.indexOf('=');
        const opChar = trimmed[eqPos - 1];
        if (opChar !== '+' && opChar !== '-' && opChar !== '*' && opChar !== '/') {
          const rhsSingle = trimmed.slice(eqPos + 1).trim();
          if (splitTopLevelCommas(rhsSingle).length > 1) {
            const stmtJs = `${vName} = [${rhsSingle}];`;
            transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; ${stmtJs}`);
            transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: stmtJs });
            continue;
          }
        }
      }

      // Expresión ternaria inline de Python: `x = a if cond else b`
      const ternaryAssign = trimmed.match(/^([a-zA-Z0-9_.[\]]+\s*=\s*)([^=]+?)\s+if\s+(.+?)\s+else\s+(.+)$/);
      if (ternaryAssign) {
        const stmtJs = `${ternaryAssign[1]}(${ternaryAssign[3]}) ? (${ternaryAssign[2]}) : (${ternaryAssign[4]});`;
        transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; ${stmtJs}`);
        transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: stmtJs });
        continue;
      }

      // Expresiones ternarias generales dentro de argumentos o llamadas
      trimmed = rewriteInlineTernaries(trimmed);

      // Añadir punto y coma para eliminar colisiones ASI de JavaScript
      const finalStmt =
        !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.startsWith('/*')
          ? `${trimmed};`
          : trimmed;
      transformedLines.push(`${indentStr}__pyLine = ${currentPyLine}; ${finalStmt}`);
      transpiledStatementsForDiag.push({ pyLine: currentPyLine, jsText: finalStmt });
    }

    while (blockStack.length > 0) {
      const top = blockStack.pop()!;
      closeBlockAndInjectLocals(top);
    }

    const varDeclHeader =
      topLevelVars.size > 0 ? `let ${Array.from(topLevelVars).join(', ')};\n` : '';
    const processedCode =
      `let __pyLine = 1;\ntry {\n` +
      varDeclHeader +
      transformedLines.join('\n') +
      `\n} catch (__runtimeErr) {\n  if (__runtimeErr && typeof __runtimeErr === 'object') {\n    __runtimeErr.__pyLine = __pyLine;\n  }\n  throw __runtimeErr;\n}`;

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    let runner: any;
    try {
      runner = new AsyncFunction(
        'bpy',
        'anim',
        'bmesh',
        'mathutils',
        'Vector',
        'Euler',
        'Matrix',
        'Color',
        'Quaternion',
        'random',
        'math',
        'np',
        'numpy',
        'pi',
        'tau',
        'sin',
        'cos',
        'tan',
        'asin',
        'acos',
        'atan',
        'atan2',
        'sqrt',
        'pow',
        'exp',
        'log',
        'radians',
        'degrees',
        'floor',
        'ceil',
        'hypot',
        'uniform',
        'randint',
        'choice',
        'seed',
        'print',
        'len',
        'abs',
        'min',
        'max',
        'round',
        'int',
        'float',
        'str',
        'bool',
        'list',
        'tuple',
        'dict',
        'enumerate',
        'zip',
        'sum',
        'reversed',
        'sorted',
        'isinstance',
        'hasattr',
        'getattr',
        'setattr',
        'range',
        'set',
        '__name__',
        processedCode
      );
    } catch (compileErr: unknown) {
      const culpritLine = findSyntaxErrorPythonLine(
        rawSourceLines,
        transpiledStatementsForDiag,
        compileErr
      );
      if (compileErr && typeof compileErr === 'object') {
        (compileErr as any).__pyLine = culpritLine;
      }
      throw compileErr;
    }

    await runner(
      bpy,
      animModuleProxy,
      bmesh,
      mathutils,
      mathutils.Vector,
      mathutils.Euler,
      mathutils.Matrix,
      mathutils.Color,
      mathutils.Quaternion,
      pyRandom,
      pyMath,
      pyNumpy,
      pyNumpy,
      Math.PI,
      Math.PI * 2,
      Math.sin,
      Math.cos,
      Math.tan,
      Math.asin,
      Math.acos,
      Math.atan,
      Math.atan2,
      Math.sqrt,
      Math.pow,
      Math.exp,
      Math.log,
      pyMath.radians,
      pyMath.degrees,
      Math.floor,
      Math.ceil,
      Math.hypot,
      pyRandom.uniform,
      pyRandom.randint,
      pyRandom.choice,
      pyRandom.seed,
      customPrint,
      pyLen,
      Math.abs,
      Math.min,
      Math.max,
      Math.round,
      Math.trunc,
      Number,
      String,
      Boolean,
      (x: any) => (Array.isArray(x) ? [...x] : Array.from(x || [])),
      (x: any) => (Array.isArray(x) ? [...x] : Array.from(x || [])),
      (x: any) => {
        const d: Record<string, any> = {};
        if (x && typeof x === 'object') {
          if (Array.isArray(x)) {
            for (const item of x) {
              if (Array.isArray(item) && item.length >= 2) d[item[0]] = item[1];
            }
          } else {
            Object.assign(d, x);
          }
        }
        Object.defineProperty(d, 'get', {
          value: function (k: string, defVal: any = null) {
            return k in this && this[k] !== undefined ? this[k] : defVal;
          },
          enumerable: false,
          writable: true,
          configurable: true,
        });
        Object.defineProperty(d, 'setdefault', {
          value: function (k: string, defVal: any = null) {
            if (!(k in this)) this[k] = defVal;
            return this[k];
          },
          enumerable: false,
          writable: true,
          configurable: true,
        });
        Object.defineProperty(d, 'update', {
          value: function (other: any) {
            if (other && typeof other === 'object') Object.assign(this, other);
          },
          enumerable: false,
          writable: true,
          configurable: true,
        });
        return d;
      },
      pyEnumerate,
      pyZip,
      pySum,
      (arr: any[]) => (Array.isArray(arr) ? [...arr].reverse() : []),
      (arr: any[]) => (Array.isArray(arr) ? [...arr].sort() : []),
      (o: any, c: any) => Boolean(o && typeof o === 'object'),
      (o: any, k: string) => o != null && (k in o || (typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k))),
      (o: any, k: string, defVal?: any) => (o != null && k in o ? o[k] : defVal),
      (o: any, k: string, val: any) => {
        if (o != null) o[k] = val;
      },
      bpy._range,
      (init?: any) => new Set(init || []),
      '__main__'
    );

    // 7. Evaluar modificadores de Blender 5.2 pendientes (MIRROR, ARRAY, SOLIDIFY, etc.)
    for (const objProxy of [...allObjectProxies]) {
      await applyPendingModifiersForObject(objProxy);
    }

    let manualEdits = 0;
    if (!proxiesDirty && allVertexProxies.length > 0) {
      allVertexProxies.forEach((v) => {
        if (v.commit()) {
          manualEdits++;
        }
      });
    }

    collectMeshes();

    // 8. Mantener fidelidad 1:1 de las coordenadas (X, Y, Z) generadas por el script Python.
    // Solo normalizar si el script generó coordenadas descomunales (> 35m) o microscópicas (< 0.08m),
    // y alinear sobre el pedestal Y=0.02 si el objeto quedó enterrado bajo el suelo.
    let autoScaleFactor = 1;
    if (objectsCreatedCount > 0 && meshes.length > 0) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      meshes.forEach((m) => {
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        if (bb) {
          minX = Math.min(minX, m.position.x + bb.min.x * m.scale.x);
          maxX = Math.max(maxX, m.position.x + bb.max.x * m.scale.x);
          minY = Math.min(minY, m.position.y + bb.min.y * m.scale.y);
          maxY = Math.max(maxY, m.position.y + bb.max.y * m.scale.y);
          minZ = Math.min(minZ, m.position.z + bb.min.z * m.scale.z);
          maxZ = Math.max(maxZ, m.position.z + bb.max.z * m.scale.z);
        }
      });

      const heightY = maxY - minY;
      const spanMax = Math.max(maxX - minX, heightY, maxZ - minZ);

      if (Number.isFinite(spanMax) && (spanMax > 35.0 || spanMax < 0.08) && spanMax > 0.0001) {
        const normFactor = 3.0 / spanMax;
        autoScaleFactor = normFactor;
        const centerX = (minX + maxX) * 0.5;
        const centerZ = (minZ + maxZ) * 0.5;
        meshes.forEach((m) => {
          m.position.x = (m.position.x - centerX) * normFactor;
          m.position.y = (m.position.y - minY) * normFactor + 0.02;
          m.position.z = (m.position.z - centerZ) * normFactor;
          m.scale.multiplyScalar(normFactor);
        });
        logs.push(
          `[Blender 5.2 Auto-Scale]: Escala extrema normalizada (factor=${normFactor.toFixed(2)}) y apoyada en pedestal.`
        );
      } else if (Number.isFinite(minY) && minY < -0.05) {
        const shiftY = 0.02 - minY;
        meshes.forEach((m) => {
          m.position.y += shiftY;
        });
      }
    }

    // Las animaciones de posición siguen a la malla tras el auto-escalado del modelo
    finalizeBlenderRun(autoScaleFactor);

    if (manualEdits > 0 || totalVerticesModified > 0 || objectsCreatedCount > 0) {
      meshes.forEach((m) => {
        const geo = m.geometry as THREE.BufferGeometry;
        if (geo.attributes.position) {
          geo.attributes.position.needsUpdate = true;
          // Las mallas con fotos proyectadas ya traen normales suaves (y van en triángulos
          // sueltos): recalcularlas aquí las dejaría facetadas.
          if (!geo.userData?.normalesFijas) geo.computeVertexNormals();
          geo.computeBoundingBox();
          geo.computeBoundingSphere();
          prepareGeometryNormals(m);
          if (m.userData.outlineMesh) {
            (m.userData.outlineMesh as THREE.Mesh).geometry = m.geometry;
          }
        }
      });
    }

    applyNormalSmoothingToModel(modelWrapper, normSmooth);

    const execTime = Math.round(performance.now() - startTime);
    logs.push(
      `>>> Ejecución Blender 5.2 completada en ${execTime} ms (${objectsCreatedCount} objetos nuevos, ${meshes.length} mallas en escena).`
    );

    return {
      success: true,
      logs,
      executionTimeMs: execTime,
      verticesModified: totalVerticesModified + manualEdits,
      objectsCreated: objectsCreatedCount,
      coordinateModeUsed: isZUp ? 'blender_z_up' : 'studio_y_up',
    };
  } catch (err: unknown) {
    const diag = buildDetailedPythonErrorReport(err, rawSourceLines, transpiledStatementsForDiag);
    logs.push(...diag.reportLines);
    return {
      success: false,
      logs,
      executionTimeMs: Math.round(performance.now() - startTime),
      verticesModified: 0,
      coordinateModeUsed: isZUp ? 'blender_z_up' : 'studio_y_up',
      error: diag.shortSummary,
      errorLine: diag.errorLine,
      errorSourceCode: diag.errorSourceCode,
      errorReason: diag.errorReason,
    };
  }
}

/**
 * Comprueba antes de transpilar si existen comillas sin cerrar o paréntesis/corchetes/llaves desbalanceados,
 * devolviendo el número exacto de línea (1-indexed) y la explicación en español.
 */
function diagnosePythonStructureBeforeTranspile(
  sourceLines: string[]
): { line: number; reason: string } | null {
  const bracketStack: { char: string; expected: string; line: number }[] = [];
  let inTripleQuote: { quote: '"""' | "'''"; startLine: number } | null = null;

  for (let idx = 0; idx < sourceLines.length; idx++) {
    const lineNum = idx + 1;
    const line = sourceLines[idx];
    let i = 0;
    let inSingleQuote: { quote: '"' | "'"; col: number } | null = null;

    while (i < line.length) {
      if (inTripleQuote) {
        if (line.slice(i, i + 3) === inTripleQuote.quote && line[i - 1] !== '\\') {
          inTripleQuote = null;
          i += 3;
          continue;
        }
        i++;
        continue;
      }

      const ch = line[i];

      if (inSingleQuote) {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === inSingleQuote.quote) {
          inSingleQuote = null;
        }
        i++;
        continue;
      }

      if (ch === '#') {
        break; // Comentario hasta fin de línea
      }

      const next3 = line.slice(i, i + 3);
      if (next3 === '"""' || next3 === "'''") {
        inTripleQuote = { quote: next3, startLine: lineNum };
        i += 3;
        continue;
      }

      if (ch === '"' || ch === "'") {
        inSingleQuote = { quote: ch, col: i + 1 };
        i++;
        continue;
      }

      if (ch === '(' || ch === '[' || ch === '{') {
        const expected = ch === '(' ? ')' : ch === '[' ? ']' : '}';
        bracketStack.push({ char: ch, expected, line: lineNum });
      } else if (ch === ')' || ch === ']' || ch === '}') {
        if (bracketStack.length === 0) {
          return {
            line: lineNum,
            reason: `Símbolo de cierre '${ch}' inesperado en la línea ${lineNum} (no hay ningún paréntesis/corchete abierto que le corresponda).`,
          };
        }
        const top = bracketStack[bracketStack.length - 1];
        if (top.expected !== ch) {
          return {
            line: lineNum,
            reason: `En la línea ${lineNum} se encontró '${ch}', pero se esperaba cerrar '${top.expected}' (correspondiente al '${top.char}' abierto en la línea ${top.line}).`,
          };
        }
        bracketStack.pop();
      }

      i++;
    }

    if (inSingleQuote && !/\\\s*$/.test(line)) {
      return {
        line: lineNum,
        reason: `Comilla de texto (${inSingleQuote.quote}) sin cerrar en la línea ${lineNum} (columna ${inSingleQuote.col}).`,
      };
    }
  }

  if (inTripleQuote) {
    return {
      line: inTripleQuote.startLine,
      reason: `Bloque de texto multilínea (${inTripleQuote.quote}) abierto en la línea ${inTripleQuote.startLine} pero nunca se cerró al final del script.`,
    };
  }

  if (bracketStack.length > 0) {
    const unclosed = bracketStack[bracketStack.length - 1];
    return {
      line: unclosed.line,
      reason: `El símbolo '${unclosed.char}' abierto en la línea ${unclosed.line} no se cerró nunca (falta '${unclosed.expected}'). Comprueba si el código copiado está incompleto o cortado.`,
    };
  }

  return null;
}

/**
 * Si `new AsyncFunction` lanza un `SyntaxError`, localiza la línea exacta de Python probando
 * cada sentencia transpilada y analizando las líneas originales del script.
 */
function findSyntaxErrorPythonLine(
  sourceLines: string[],
  statements: { pyLine: number; jsText: string }[],
  _compileErr: unknown
): number {
  // 1. Buscar cabeceras de bloque en Python que hayan olvidado los dos puntos ':' al final
  for (let i = 0; i < sourceLines.length; i++) {
    const clean = sourceLines[i].replace(/#.*$/, '').trim();
    if (!clean) continue;
    if (
      /^(?:def\s+\w+\s*\(.*\)|class\s+\w+.*|if\s+.+|elif\s+.+|else|for\s+.+\s+in\s+.+|while\s+.+|try|except\b.*|finally|with\s+.+)$/.test(
        clean
      ) &&
      !clean.endsWith(':') &&
      !clean.endsWith('\\') &&
      !clean.endsWith(',') &&
      !clean.endsWith('(')
    ) {
      return i + 1;
    }
  }

  // 2. Probar cada sentencia individualmente con Function para detectar cuál tiene sintaxis inválida
  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
  for (const stmt of statements) {
    const testSnippet = stmt.jsText
      .replace(/^\s*return\b/, 'void ')
      .replace(/\b(?:continue|break)\b/g, 'void 0');
    try {
      new AsyncFn(testSnippet);
    } catch {
      return stmt.pyLine;
    }
  }

  return statements.length > 0 ? statements[statements.length - 1].pyLine : 1;
}

/**
 * Construye un diagnóstico detallado en español indicando exactamente en qué línea falló el script,
 * qué código hay en esa línea, por qué falló y cómo corregirlo.
 */
function buildDetailedPythonErrorReport(
  err: unknown,
  sourceLines: string[],
  statements: { pyLine: number; jsText: string }[]
): {
  errorLine: number;
  errorSourceCode: string;
  errorReason: string;
  shortSummary: string;
  reportLines: string[];
} {
  const rawMsg = err instanceof Error ? err.message : String(err);
  let pyLine = Number((err as any)?.__pyLine) || 0;

  if (!pyLine || pyLine < 1 || pyLine > sourceLines.length) {
    pyLine = findSyntaxErrorPythonLine(sourceLines, statements, err);
  }
  pyLine = Math.max(1, Math.min(sourceLines.length || 1, pyLine));

  const errorSourceCode = (sourceLines[pyLine - 1] ?? '').trim();
  const explicitReason = (err as any)?.__pyReason as string | undefined;

  let errorReason = explicitReason || '';
  let fixSuggestion = 'Revisa la sintaxis de esta línea en el editor.';

  if (!errorReason) {
    const notDefinedMatch = rawMsg.match(/([a-zA-Z_]\w*)\s+is not defined/i);
    const notAFunctionMatch = rawMsg.match(/([^\s]+)\s+is not a function/i);
    const propUndefReadMatch = rawMsg.match(
      /Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '([^']+)'\)/i
    );
    const propUndefSetMatch = rawMsg.match(
      /Cannot set propert(?:y|ies) of (?:undefined|null) \(setting '([^']+)'\)/i
    );
    const notIterableMatch = rawMsg.match(/([^\s]+)\s+is not iterable/i);
    const alreadyDeclaredMatch = rawMsg.match(/Identifier '([^']+)' has already been declared/i);

    if (notDefinedMatch) {
      const missingIdent = notDefinedMatch[1];
      errorReason = `NameError / ReferenceError: La variable o función '${missingIdent}' no está definida cuando se ejecuta la línea ${pyLine}.`;
      fixSuggestion = `Asegúrate de haber creado '${missingIdent} = ...' o 'def ${missingIdent}(...):' antes de la línea ${pyLine}, o revisa si hay una errata en el nombre.`;
    } else if (notAFunctionMatch) {
      const targetExpr = notAFunctionMatch[1];
      errorReason = `TypeError: Se intentó llamar a '${targetExpr}' como si fuera una función en la línea ${pyLine}, pero no es una función.`;
      fixSuggestion = `Verifica que no hayas sobrescrito el nombre de una función con una variable del mismo nombre, o que no falte el signo '*' de multiplicar antes de un paréntesis.`;
    } else if (propUndefReadMatch) {
      const propName = propUndefReadMatch[1];
      errorReason = `AttributeError / TypeError: Se intentó leer el atributo '.${propName}' de un objeto que vale None (vacío/inexistente) en la línea ${pyLine}.`;
      fixSuggestion = `Comprueba que el objeto, material o nodo antes de '.${propName}' exista realmente antes de acceder a sus propiedades.`;
    } else if (propUndefSetMatch) {
      const propName = propUndefSetMatch[1];
      errorReason = `AttributeError / TypeError: Se intentó modificar el atributo '.${propName}' en un objeto que vale None (vacío/inexistente) en la línea ${pyLine}.`;
      fixSuggestion = `Comprueba que el objeto antes de '.${propName}' se haya creado correctamente.`;
    } else if (notIterableMatch) {
      errorReason = `TypeError: El valor evaluado en la línea ${pyLine} no es iterable (no es una lista, tupla ni rango válido para recorrer o desempaquetar).`;
      fixSuggestion = `Asegúrate de que la expresión después de 'in' o a la derecha del '=' devuelva una colección o tupla de elementos.`;
    } else if (alreadyDeclaredMatch) {
      const ident = alreadyDeclaredMatch[1];
      errorReason = `Conflicto de declaración con el identificador '${ident}' en la línea ${pyLine}.`;
      fixSuggestion = `Usa un nombre de variable distinto para '${ident}' en esta línea.`;
    } else if (err instanceof SyntaxError || /Unexpected|Invalid/i.test(rawMsg)) {
      const cleanSrc = errorSourceCode.replace(/#.*$/, '').trim();
      if (
        /^(?:def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(cleanSrc) &&
        !cleanSrc.endsWith(':')
      ) {
        errorReason = `SyntaxError: Falta el signo de dos puntos ':' al final de la sentencia de bloque en la línea ${pyLine}.`;
        fixSuggestion = `Añade ':' al final de la línea ${pyLine} -> ${cleanSrc}:`;
      } else if (/^(?:if|elif|while)\b[^=]*[^=!<>]=\s*[^=]/.test(cleanSrc)) {
        errorReason = `SyntaxError: Se usó '=' (asignación) en lugar de '==' (comparación de igualdad) dentro de la condición en la línea ${pyLine}.`;
        fixSuggestion = `Cambia '=' por '==' en la condición de la línea ${pyLine}.`;
      } else if (
        cleanSrc.split(/\s+/).length >= 4 &&
        !/[=()\[\]{}:.,+\-*/]/.test(cleanSrc)
      ) {
        errorReason = `SyntaxError: La línea ${pyLine} parece texto explicativo normal (no código Python) copiado junto al script.`;
        fixSuggestion = `Borra la línea ${pyLine} o coméntala poniendo '#' al principio.`;
      } else {
        errorReason = `SyntaxError en la línea ${pyLine}: Sintaxis de Python inválida o expresión incompleta (${rawMsg}).`;
        fixSuggestion = `Revisa los paréntesis, comas, operadores y dos puntos ':' en la línea ${pyLine}.`;
      }
    } else {
      errorReason = `Error en la línea ${pyLine}: ${rawMsg}`;
    }
  } else {
    fixSuggestion = `Corrige el cierre de paréntesis, corchetes o comillas señalado en la línea ${pyLine}.`;
  }

  const contextStart = Math.max(1, pyLine - 2);
  const contextEnd = Math.min(sourceLines.length, pyLine + 2);
  const contextLines: string[] = [];
  for (let ln = contextStart; ln <= contextEnd; ln++) {
    const prefix = ln === pyLine ? '👉' : '  ';
    const numStr = String(ln).padStart(4, ' ');
    contextLines.push(`${prefix} ${numStr} | ${sourceLines[ln - 1]}`);
  }

  const reportLines = [
    `============================================================`,
    `❌ ERROR EN LA LÍNEA ${pyLine} DEL SCRIPT PYTHON`,
    `============================================================`,
    `📍 Línea ${pyLine}: ${errorSourceCode || '(línea vacía o final de bloque)'}`,
    `❓ Por qué falla: ${errorReason}`,
    `💡 Cómo solucionarlo: ${fixSuggestion}`,
    `------------------------------------------------------------`,
    `Fragmento del código (líneas ${contextStart} a ${contextEnd}):`,
    ...contextLines,
    `============================================================`,
  ];

  return {
    errorLine: pyLine,
    errorSourceCode,
    errorReason: `${errorReason} ${fixSuggestion}`,
    shortSummary: `Línea ${pyLine}: ${errorReason}`,
    reportLines,
  };
}
