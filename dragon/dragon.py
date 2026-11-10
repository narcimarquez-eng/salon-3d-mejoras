import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# DRAGÓN ROJO CON ALAS (dragón de lava, cuadrúpedo alado)
# ==============================================================================
# Basado en la hoja de referencia (dragon/referencia_dragon.jpg): vistas frontal,
# dos perfiles, espalda y cenital. Escamas con la textura procedural dragon_scales y
# membranas con magma_cracks (la subida de fotos como textura no funciona en esta versión).
# Aproximado: sin medidas reales en la hoja. Proporciones tomadas a ojo:
# envergadura unos 13 m, longitud de cabeza a cola unos 9 m, altura de la cruz 3,2 m.
# Ejes: X = ancho, Y = profundidad (la cabeza mira a Y negativo), Z = altura.
# Las patas apoyan en Z = 0. Medidas en metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.5, bloom=0.08)
bpy.ops.render.set_lighting(intensity=1.2, angle=35)
bpy.ops.render.set_ssao(intensity=1.2)

def material(nombre, color, rugosidad=0.6, metalico=0.0, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
        if emision > 0:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emision
    return mat

def asignar_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj

def esfera(nombre, centro, mat, escala=(1.0, 1.0, 1.0), segmentos=12, anillos=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=1.0, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def tubo(nombre, a, b, ra, rb, mat, vertices=8):
    # Miembro cilíndrico de radio ra en a a radio rb en b (cuello, patas, cola, huesos del ala)
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dz * dz)
    largo = math.sqrt(horiz * horiz + dy * dy)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    rx = math.atan2(-dy, horiz)
    ry = math.atan2(dx, dz)
    return cono(nombre, centro, ra, rb, largo, mat, vertices=vertices, rot=(rx, ry, 0))

def membrana(nombre, a, b, c, grosor, mat):
    # Lámina aproximada del triángulo a-b-c: elipsoide plano en el centroide, alargado hacia b
    cx = (a[0] + b[0] + c[0]) / 3
    cy = (a[1] + b[1] + c[1]) / 3
    cz = (a[2] + b[2] + c[2]) / 3
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    largo = math.sqrt(dx * dx + dy * dy + dz * dz) / 2
    ancho = math.sqrt((c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2 + (c[2] - a[2]) ** 2) / 2
    esfera(nombre, (cx, cy, cz), mat, escala=(largo, grosor, ancho), segmentos=8, anillos=6)

# ==========================================
# 1. MATERIALES
# ==========================================
m_escama = material("DRA_Escama_Roja", (0.30, 0.04, 0.02, 1.0), 0.55)
m_ala = material("DRA_Membrana_Lava", (0.22, 0.03, 0.015, 1.0), 0.5)
m_cuerno = material("DRA_Cuerno_Hueso", (0.45, 0.36, 0.24, 1.0), 0.4)
m_garra = material("DRA_Garra_Negra", (0.02, 0.015, 0.012, 1.0), 0.35)
m_lava = material("DRA_Lava_Brillo", (1.0, 0.35, 0.05, 1.0), 0.3, emision=3.0)
m_ojo = material("DRA_Ojo_Lava", (1.0, 0.55, 0.05, 1.0), 0.2, emision=4.0)
# Texturas procedurales de la app (la subida de fotos como mapa de color no llega a los materiales)
m_escama.texture = "dragon_scales"
m_ala.texture = "magma_cracks"

# ==========================================
# 2. TORSO Y CUELLO
# ==========================================
esfera("DRA_Pecho", (0, -0.9, 2.5), m_escama, escala=(1.25, 1.35, 1.25), segmentos=16, anillos=10)
esfera("DRA_Lomo", (0, 0.4, 2.9), m_escama, escala=(1.05, 2.0, 0.9), segmentos=16, anillos=10)
esfera("DRA_Grupa", (0, 2.1, 2.5), m_escama, escala=(1.2, 1.4, 1.2), segmentos=16, anillos=10)
esfera("DRA_Vientre_Lava", (0, 0.4, 2.0), m_lava, escala=(0.55, 1.5, 0.18), segmentos=12, anillos=8)
tubo("DRA_Cuello_1", (0, -1.8, 3.0), (0, -2.6, 3.9), 0.7, 0.5, m_escama)
tubo("DRA_Cuello_2", (0, -2.6, 3.9), (0, -3.0, 4.8), 0.5, 0.4, m_escama)

# ==========================================
# 3. CABEZA
# ==========================================
esfera("DRA_Craneo", (0, -3.2, 5.0), m_escama, escala=(0.55, 0.75, 0.5), segmentos=14, anillos=9)
esfera("DRA_Hocico", (0, -4.0, 4.85), m_escama, escala=(0.36, 0.65, 0.3), segmentos=12, anillos=8)
esfera("DRA_Mandibula", (0, -3.9, 4.6), m_escama, escala=(0.3, 0.55, 0.16), segmentos=10, anillos=6)
esfera("DRA_Ojo_I", (-0.36, -3.3, 5.2), m_ojo, escala=(0.1, 0.1, 0.07), segmentos=8, anillos=6)
esfera("DRA_Ojo_D", (0.36, -3.3, 5.2), m_ojo, escala=(0.1, 0.1, 0.07), segmentos=8, anillos=6)
for lado in [-1, 1]:
    nombre = "I" if lado < 0 else "D"
    # Cuernos curvados hacia atrás y hacia fuera
    tubo("DRA_Cuerno_" + nombre, (0.4 * lado, -2.9, 5.5), (0.9 * lado, -2.4, 6.3), 0.14, 0.03, m_cuerno)
    tubo("DRA_Cuerno_Curva_" + nombre, (0.9 * lado, -2.4, 6.3), (1.2 * lado, -1.8, 6.7), 0.05, 0.01, m_cuerno)
    # Púas de la cabeza
    cono("DRA_Pua_Cabeza_" + nombre, (0.45 * lado, -2.8, 5.1), 0.09, 0.0, 0.5, m_cuerno, vertices=6, rot=(0.6, 0.0, 0.5 * lado))

# ==========================================
# 4. PATAS DELANTERAS Y TRASERAS
# ==========================================
for lado in [-1, 1]:
    nombre = "I" if lado < 0 else "D"
    x = 0.7 * lado
    esfera("DRA_Hombro_" + nombre, (x, -1.2, 2.5), m_escama, escala=(0.42, 0.45, 0.6), segmentos=10, anillos=7)
    tubo("DRA_Brazo_" + nombre, (x, -1.3, 2.3), (x, -1.4, 1.0), 0.36, 0.22, m_escama)
    tubo("DRA_Antebrazo_" + nombre, (x, -1.4, 1.0), (x, -1.5, 0.3), 0.22, 0.16, m_escama)
    esfera("DRA_Garra_Del_" + nombre, (x, -1.6, 0.18), m_garra, escala=(0.3, 0.38, 0.18), segmentos=8, anillos=6)
    # Pata trasera: muslo, tibia y pie
    xt = 0.8 * lado
    esfera("DRA_Muslo_" + nombre, (xt, 1.9, 2.0), m_escama, escala=(0.6, 0.7, 0.75), segmentos=12, anillos=8)
    tubo("DRA_Tibia_" + nombre, (xt, 2.2, 1.6), (xt, 1.9, 0.5), 0.35, 0.2, m_escama)
    esfera("DRA_Garra_Tra_" + nombre, (xt, 1.9, 0.2), m_garra, escala=(0.35, 0.45, 0.2), segmentos=8, anillos=6)

# ==========================================
# 5. COLA (larga, con púas)
# ==========================================
tubo("DRA_Cola_1", (0, 2.9, 2.6), (0, 4.4, 2.0), 0.6, 0.42, m_escama)
tubo("DRA_Cola_2", (0, 4.4, 2.0), (0, 6.2, 1.5), 0.42, 0.25, m_escama)
tubo("DRA_Cola_3", (0, 6.2, 1.5), (0, 7.8, 1.6), 0.25, 0.08, m_escama)
for i in range(7):
    t = 0.2 + i * 0.1
    y = 3.0 + i * 0.6
    z = 2.8 - i * 0.12
    cono("DRA_Pua_Cola_" + str(i), (0, y, z), 0.14, 0.0, 0.4, m_cuerno, vertices=6, rot=(-1.57, 0.0, 0.0))

# ==========================================
# 6. ALAS (hueso del ala, dedos y membrana)
# ==========================================
for lado in [-1, 1]:
    nombre = "I" if lado < 0 else "D"
    s = (0.9 * lado, -0.4, 3.0)
    e = (3.2 * lado, -1.0, 4.4)
    w = (5.6 * lado, -0.2, 3.6)
    t1 = (6.9 * lado, 0.3, 2.0)
    t2 = (6.2 * lado, 1.2, 1.0)
    t3 = (4.8 * lado, 2.0, 0.6)
    cuerpo = (0.9 * lado, 1.6, 2.6)
    tubo("DRA_Ala_Brazo_" + nombre, s, e, 0.18, 0.12, m_escama)
    tubo("DRA_Ala_Antebrazo_" + nombre, e, w, 0.12, 0.08, m_escama)
    tubo("DRA_Ala_Dedo1_" + nombre, w, t1, 0.08, 0.03, m_escama)
    tubo("DRA_Ala_Dedo2_" + nombre, w, t2, 0.08, 0.03, m_escama)
    tubo("DRA_Ala_Dedo3_" + nombre, w, t3, 0.07, 0.03, m_escama)
    membrana("DRA_Ala_Mem_A_" + nombre, s, e, w, 0.05, m_ala)
    membrana("DRA_Ala_Mem_B_" + nombre, s, w, t1, 0.05, m_ala)
    membrana("DRA_Ala_Mem_C_" + nombre, w, t1, t2, 0.05, m_ala)
    membrana("DRA_Ala_Mem_D_" + nombre, w, t2, t3, 0.05, m_ala)
    membrana("DRA_Ala_Mem_E_" + nombre, cuerpo, w, t3, 0.05, m_ala)
    membrana("DRA_Ala_Mem_F_" + nombre, cuerpo, s, w, 0.05, m_ala)
