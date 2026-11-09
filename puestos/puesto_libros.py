import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# Puesto de libros y pergaminos (Lineage 2)
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
m_toldo = material("Pz_Toldo_Principal", (0.42, 0.26, 0.12, 1.0), 0.95)
m_franja = material("Pz_Franja_Toldo", (0.50, 0.10, 0.10, 1.0), 0.95)
m_letrero = material("Pz_Letrero", (0.15, 0.30, 0.70, 1.0), 0.7)
m_cuero_rojo = material("Pz_Libro_Rojo", (0.55, 0.12, 0.10, 1.0), 0.6)
m_cuero_verde = material("Pz_Libro_Verde", (0.14, 0.38, 0.22, 1.0), 0.6)
m_cuero_azul = material("Pz_Libro_Azul", (0.14, 0.24, 0.50, 1.0), 0.6)
m_cuero_ocre = material("Pz_Libro_Ocre", (0.78, 0.58, 0.22, 1.0), 0.6)
m_pergamino = material("Pz_Pergamino_Claro", (0.92, 0.86, 0.70, 1.0), 0.9)
m_tinta = material("Pz_Tinta_Negra", (0.04, 0.04, 0.07, 1.0), 0.3)

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
# Estanterías del fondo con libros de pie
libro_colores = [m_cuero_rojo, m_cuero_verde, m_cuero_azul, m_cuero_ocre]
for s, z in enumerate([1.15, 1.65, 2.15]):
    caja("Pz_Balda_" + str(s), (0, 1.22, z), (3.8, 0.45, 0.05), m_tabla_oscura)
    for i in range(34):
        x = -1.62 + i * 0.1
        alto = 0.24 + ((i * 7 + s * 3) % 4) * 0.02
        caja("Pz_Libro_" + str(s) + "_" + str(i), (x, 1.22, z + 0.05 + alto / 2), (0.05, 0.22, alto), libro_colores[(i + s) % 4])
# Pilas de libros grandes sobre el mostrador
pilas = [(-1.30, -0.85, 0), (-0.55, -0.85, 1)]
for px, py, k in pilas:
    for j in range(3):
        caja("Pz_Pila_" + str(k) + "_" + str(j), (px, py, 1.10 + 0.03 + j * 0.065), (0.36, 0.27, 0.06), libro_colores[(j + k) % 4], rot=(0, 0, 0.04 * (j - 1)))
# Libro abierto
caja("Pz_Libro_Abierto_Izq", (0.45, -0.85, 1.12), (0.30, 0.24, 0.02), m_pergamino, rot=(0, 0, 0.25))
caja("Pz_Libro_Abierto_Der", (0.75, -0.85, 1.12), (0.30, 0.24, 0.02), m_pergamino, rot=(0, 0, -0.25))
# Tintero, pluma y pergamino enrollado
cilindro("Pz_Tintero", (1.30, -0.80, 1.10 + 0.06), 0.06, 0.12, m_tinta, vertices=8)
caja("Pz_Pluma", (1.30, -0.80, 1.10 + 0.20), (0.01, 0.01, 0.20), m_pergamino, rot=(0.15, 0, 0))
cilindro("Pz_Pergamino", (1.15, -0.40, 1.10 + 0.05), 0.05, 0.40, m_pergamino, vertices=8, rot=(0, math.pi / 2, 0))


print("Puesto de libros y pergaminos (Lineage 2) generado")
