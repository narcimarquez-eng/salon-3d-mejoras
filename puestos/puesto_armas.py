import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# Puesto de armas (Lineage 2)
# ==============================================================================
# Estilo Lineage 2: puesto de mercado de madera con toldo de tela y mercancía.
# Geometría de bajo peso: primitivas con pocos lados, materiales compartidos
# (se fusionan por material al exportar). Sin texturas de imagen.
# Ejes: X = ancho del puesto, Y = profundidad (el mostrador mira a Y negativo),
#       Z = altura. Medidas en metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(nombre, color, rugosidad=0.8, metalico=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metalico
    return mat

def asignar_mat(obj, mat):
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

def cilindro(nombre, centro, radio, alto, mat, vertices=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=6, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=6, ring_count=4, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

# ==========================================
# 1. MATERIALES (nombres neutros: no activan texturas procedurales)
# ==========================================
m_tabla_clara = material("Pz_Tabla_Clara", (0.62, 0.42, 0.24, 1.0), 0.85)
m_tabla_oscura = material("Pz_Tabla_Oscura", (0.36, 0.24, 0.14, 1.0), 0.85)
m_toldo = material("Pz_Toldo_Principal", (0.45, 0.08, 0.08, 1.0), 0.95)
m_franja = material("Pz_Franja_Toldo", (0.15, 0.15, 0.16, 1.0), 0.95)
m_letrero = material("Pz_Letrero", (0.40, 0.42, 0.45, 1.0), 0.7)
m_hierro = material("Pz_Hierro_Brillante", (0.75, 0.77, 0.80, 1.0), 0.3, 0.9)
m_empunadura = material("Pz_Empunadura_Cuerda", (0.25, 0.12, 0.06, 1.0), 0.8)
m_laton = material("Pz_Laton_Guarnicion", (0.80, 0.62, 0.26, 1.0), 0.35, 0.8)

# ==========================================
# 2. ESTRUCTURA DEL PUESTO
# ==========================================
caja("Pz_Plataforma", (0, 0, 0.08), (4.2, 2.8, 0.16), m_tabla_oscura)
for sx in [-1, 1]:
    for sy in [-1, 1]:
        cilindro("Pz_Poste_" + str(sx) + "_" + str(sy), (sx * 1.95, sy * 1.3, 1.45), 0.07, 2.9, m_tabla_oscura, vertices=6)
caja("Pz_Mostrador", (0, -0.75, 0.52), (3.7, 0.8, 1.04), m_tabla_clara)
caja("Pz_Mostrador_Tapa", (0, -0.75, 1.07), (3.8, 0.9, 0.06), m_tabla_oscura)
caja("Pz_Fondo", (0, 1.3, 1.5), (4.0, 0.08, 2.6), m_tabla_clara)
caja("Pz_Toldo", (0, -0.35, 2.95), (4.7, 3.0, 0.05), m_toldo, rot=(0.22, 0, 0))
caja("Pz_Toldo_Franja", (0, -1.86, 2.41), (4.7, 0.05, 0.42), m_franja)
caja("Pz_Letrero_Puesto", (0, -1.44, 2.0), (1.9, 0.05, 0.42), m_letrero)

# ==========================================
# 3. MERCANCÍA
# ==========================================
# Espadas colgadas del fondo (hoja hacia arriba)
for i in range(7):
    x = -1.62 + i * 0.54
    caja("Pz_Espada_Hoja_" + str(i), (x, 1.20, 1.95), (0.06, 0.02, 0.95), m_hierro)
    caja("Pz_Espada_Guarda_" + str(i), (x, 1.20, 1.42), (0.24, 0.05, 0.05), m_laton)
    cilindro("Pz_Espada_Mango_" + str(i), (x, 1.20, 1.26), 0.025, 0.2, m_empunadura, vertices=6)
    esfera("Pz_Espada_Pomo_" + str(i), (x, 1.20, 1.14), 0.035, m_laton)
# Hachas en la segunda fila
for i in range(3):
    x = -1.1 + i * 1.1
    cilindro("Pz_Hacha_Mango_" + str(i), (x, 1.20, 2.35), 0.025, 0.9, m_empunadura, vertices=6)
    caja("Pz_Hacha_Cabeza_" + str(i), (x + 0.10, 1.20, 2.62), (0.20, 0.03, 0.22), m_hierro)
# Lanzas apoyadas en las esquinas del fondo
for sx in [-1, 1]:
    cilindro("Pz_Lanza_Asta_" + str(sx), (sx * 1.85, 0.75, 1.45), 0.02, 2.7, m_empunadura, vertices=6)
    cono("Pz_Lanza_Punta_" + str(sx), (sx * 1.85, 0.75, 2.92), 0.05, 0.0, 0.20, m_hierro, vertices=6)
# Espadas tumbadas sobre el mostrador
for i in range(3):
    x = -1.0 + i * 0.55
    caja("Pz_Espada_Tumbada_" + str(i), (x, -0.70, 1.115), (0.07, 0.95, 0.02), m_hierro)
    caja("Pz_Espada_Tumbada_Guarda_" + str(i), (x, -0.22, 1.12), (0.24, 0.05, 0.04), m_laton)
    cilindro("Pz_Espada_Tumbada_Mango_" + str(i), (x, -0.05, 1.12), 0.022, 0.18, m_empunadura, vertices=6, rot=(0, math.pi / 2, 0))
# Barril con dagas
cilindro("Pz_Barril_Dagas", (1.60, -0.80, 1.10 + 0.14), 0.22, 0.28, m_tabla_oscura, vertices=8)
for i in range(4):
    caja("Pz_Daga_" + str(i), (1.60 - 0.09 + i * 0.06, -0.80, 1.10 + 0.34), (0.05, 0.01, 0.22), m_hierro, rot=(0.2, 0, 0))


print("Puesto de armas (Lineage 2) generado")
