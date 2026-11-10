import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# LEÓN MACHO (león africano adulto, con melena)
# ==============================================================================
# Basado en la hoja de referencia del usuario (vistas frontal, laterales, espalda y
# cenital). Se usan los colores de la fila superior (pelaje dorado, melena castaña,
# vientre y hocico crema, nariz y punta de la cola oscuras, ojos ámbar); la fila de
# colores por zonas de la hoja no se aplica.
# Aproximado: la hoja no trae medidas fiables, así que las proporciones son las de un
# león macho típico: altura de la cruz unos 1,2 m, longitud cabeza-grupa unos 1,9 m,
# cola de unos 0,9 m. Ejes: X = ancho, Y = profundidad (la cara mira a Y negativo),
# Z = altura. Las patas apoyan en Z = 0. Medidas en metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.5, bloom=0.05)
bpy.ops.render.set_lighting(intensity=1.2, angle=35)
bpy.ops.render.set_ssao(intensity=1.2)

def material(nombre, color, rugosidad=0.6, metalico=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
    return mat

def asignar_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj

def esfera(nombre, centro, mat, escala=(1.0, 1.0, 1.0), segmentos=12, anillos=8):
    # Elipsoide: esfera de radio 1 escalada a sus semiejes (X, Y, Z)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=1.0, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def tubo(nombre, a, b, ra, rb, mat):
    # Miembro cilíndrico de radio ra en el punto a a radio rb en el punto b (patas, cola).
    # El cono va a lo largo de su Z local; primero se inclina y luego se orienta en Z.
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dz * dz)
    largo = math.sqrt(horiz * horiz + dy * dy)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    rx = math.atan2(-dy, horiz)
    ry = math.atan2(dx, dz)
    return cono(nombre, centro, ra, rb, largo, mat, vertices=10, rot=(rx, ry, 0))

# ==========================================
# 1. MATERIALES (pocos y compartidos)
# ==========================================
m_pelaje = material("LEO_Pelaje_Dorado", (0.52, 0.34, 0.17, 1.0), 0.75)
m_melena = material("LEO_Melena_Castana", (0.12, 0.06, 0.025, 1.0), 0.85)
m_claro = material("LEO_Vientre_Hocico", (0.66, 0.52, 0.32, 1.0), 0.75)
m_oscuro = material("LEO_Nariz_Punta", (0.03, 0.018, 0.012, 1.0), 0.5)
m_ojo = material("LEO_Ojo_Ambar", (0.75, 0.42, 0.06, 1.0), 0.25)

# ==========================================
# 2. TRONCO
# ==========================================
esfera("LEO_Pecho", (0, -0.42, 0.90), m_pelaje, escala=(0.30, 0.44, 0.34), segmentos=16, anillos=10)
esfera("LEO_Lomo", (0, 0.15, 0.93), m_pelaje, escala=(0.29, 0.52, 0.28), segmentos=16, anillos=10)
esfera("LEO_Grupa", (0, 0.72, 0.93), m_pelaje, escala=(0.30, 0.36, 0.31), segmentos=16, anillos=10)
esfera("LEO_Vientre", (0, 0.12, 0.70), m_claro, escala=(0.25, 0.52, 0.20), segmentos=16, anillos=10)

# ==========================================
# 3. CABEZA
# ==========================================
esfera("LEO_Cabeza", (0, -1.08, 1.13), m_pelaje, escala=(0.19, 0.20, 0.19), segmentos=16, anillos=10)
esfera("LEO_Hocico", (0, -1.30, 1.08), m_claro, escala=(0.11, 0.12, 0.09), segmentos=14, anillos=8)
esfera("LEO_Nariz", (0, -1.41, 1.11), m_oscuro, escala=(0.045, 0.03, 0.03), segmentos=8, anillos=6)
esfera("LEO_Oreja_I", (-0.12, -0.98, 1.36), m_pelaje, escala=(0.06, 0.05, 0.06), segmentos=8, anillos=6)
esfera("LEO_Oreja_D", (0.12, -0.98, 1.36), m_pelaje, escala=(0.06, 0.05, 0.06), segmentos=8, anillos=6)
esfera("LEO_Ojo_I", (-0.08, -1.26, 1.18), m_ojo, escala=(0.03, 0.02, 0.025), segmentos=8, anillos=6)
esfera("LEO_Ojo_D", (0.08, -1.26, 1.18), m_ojo, escala=(0.03, 0.02, 0.025), segmentos=8, anillos=6)

# ==========================================
# 4. MELENA (anillos de mechones alrededor de la cabeza, y cuello)
# ==========================================
esfera("LEO_Melena_Cuello", (0, -0.62, 1.04), m_melena, escala=(0.32, 0.36, 0.30), segmentos=14, anillos=9)
for i in range(12):
    ang = i * 0.5236
    x = 0.34 * math.cos(ang)
    z = 1.12 + 0.31 * math.sin(ang)
    esfera("LEO_Mechon_A" + str(i), (x, -0.92, z), m_melena, escala=(0.13, 0.13, 0.13), segmentos=8, anillos=6)
for i in range(12):
    ang = i * 0.5236 + 0.2618
    x = 0.37 * math.cos(ang)
    z = 1.10 + 0.33 * math.sin(ang)
    esfera("LEO_Mechon_B" + str(i), (x, -0.74, z), m_melena, escala=(0.12, 0.12, 0.12), segmentos=8, anillos=6)

# ==========================================
# 5. PATAS DELANTERAS (hombro, brazo, antebrazo, pata)
# ==========================================
for lado in [-1, 1]:
    x = 0.19 * lado
    nombre = "I" if lado < 0 else "D"
    esfera("LEO_Hombro_" + nombre, (x, -0.50, 0.95), m_pelaje, escala=(0.13, 0.14, 0.20), segmentos=12, anillos=8)
    tubo("LEO_Brazo_" + nombre, (x, -0.50, 0.90), (x, -0.52, 0.42), 0.12, 0.085, m_pelaje)
    tubo("LEO_Antebrazo_" + nombre, (x, -0.52, 0.42), (x, -0.55, 0.12), 0.085, 0.06, m_pelaje)
    esfera("LEO_Pata_Del_" + nombre, (x, -0.60, 0.05), m_pelaje, escala=(0.085, 0.12, 0.05), segmentos=10, anillos=6)

# ==========================================
# 6. PATAS TRASERAS (muslo, rodilla, tibia, metatarso, pata)
# ==========================================
for lado in [-1, 1]:
    x = 0.20 * lado
    nombre = "I" if lado < 0 else "D"
    esfera("LEO_Muslo_" + nombre, (x, 0.62, 0.80), m_pelaje, escala=(0.16, 0.24, 0.27), segmentos=12, anillos=8)
    esfera("LEO_Rodilla_" + nombre, (x, 0.38, 0.60), m_pelaje, escala=(0.10, 0.10, 0.10), segmentos=8, anillos=6)
    tubo("LEO_Tibia_" + nombre, (x, 0.38, 0.60), (x, 0.86, 0.22), 0.11, 0.07, m_pelaje)
    tubo("LEO_Metatarso_" + nombre, (x, 0.86, 0.22), (x, 0.76, 0.05), 0.07, 0.05, m_pelaje)
    esfera("LEO_Pata_Tra_" + nombre, (x, 0.68, 0.04), m_pelaje, escala=(0.085, 0.13, 0.05), segmentos=10, anillos=6)

# ==========================================
# 7. COLA (cuelga por detrás de las patas traseras, punta oscura)
# ==========================================
tubo("LEO_Cola_1", (0, 1.06, 0.92), (0, 1.30, 0.78), 0.05, 0.042, m_pelaje)
tubo("LEO_Cola_2", (0, 1.30, 0.78), (0, 1.40, 0.52), 0.042, 0.034, m_pelaje)
tubo("LEO_Cola_3", (0, 1.40, 0.52), (0, 1.42, 0.22), 0.034, 0.028, m_pelaje)
esfera("LEO_Punta_Cola", (0, 1.42, 0.12), m_oscuro, escala=(0.06, 0.06, 0.07), segmentos=10, anillos=7)
