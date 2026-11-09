import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# Puesto de frutas (Lineage 2)
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
m_toldo = material("Pz_Toldo_Principal", (0.12, 0.48, 0.20, 1.0), 0.95)
m_franja = material("Pz_Franja_Toldo", (0.95, 0.92, 0.82, 1.0), 0.95)
m_letrero = material("Pz_Letrero", (0.95, 0.52, 0.10, 1.0), 0.7)
m_manzana = material("Pz_Manzana_Roja", (0.80, 0.10, 0.08, 1.0), 0.5)
m_naranja = material("Pz_Naranja", (0.95, 0.50, 0.08, 1.0), 0.5)
m_pera = material("Pz_Pera_Verde", (0.62, 0.72, 0.18, 1.0), 0.5)
m_sandia = material("Pz_Sandia_Verde", (0.14, 0.52, 0.20, 1.0), 0.6)
m_uva = material("Pz_Uva_Morada", (0.40, 0.12, 0.50, 1.0), 0.4)

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
# Cajas de madera con fruta encima, en el mostrador
crate_pos = [(-1.35, -0.85), (-0.45, -0.85)]
for i, (cx, cy) in enumerate(crate_pos):
    caja("Pz_Caja_Fruta_" + str(i), (cx, cy, 1.10 + 0.14), (0.75, 0.55, 0.28), m_tabla_clara)
# Cestas con fruta (cilindros de pocos lados)
cilindro("Pz_Cesta_Izq", (0.45, -0.85, 1.10 + 0.10), 0.30, 0.20, m_tabla_clara, vertices=8)
cilindro("Pz_Cesta_Der", (1.25, -0.85, 1.10 + 0.10), 0.30, 0.20, m_tabla_clara, vertices=8)
# Fruta sobre cajas y cestas
fruta_mesa = [
    (-1.50, -0.80, 1.10 + 0.28 + 0.09, 0.09, m_manzana, (1, 1, 1)),
    (-1.25, -0.90, 1.10 + 0.28 + 0.09, 0.09, m_naranja, (1, 1, 1)),
    (-1.40, -0.95, 1.10 + 0.28 + 0.09, 0.09, m_manzana, (1, 1, 1)),
    (-0.60, -0.80, 1.10 + 0.28 + 0.10, 0.10, m_pera, (0.8, 0.8, 1.25)),
    (-0.40, -0.90, 1.10 + 0.28 + 0.09, 0.09, m_naranja, (1, 1, 1)),
    (0.45, -0.85, 1.10 + 0.22 + 0.10, 0.10, m_naranja, (1, 1, 1)),
    (0.60, -0.80, 1.10 + 0.22 + 0.10, 0.10, m_manzana, (1, 1, 1)),
    (0.52, -0.95, 1.10 + 0.22 + 0.10, 0.10, m_pera, (0.8, 0.8, 1.25)),
    (1.25, -0.85, 1.10 + 0.22 + 0.11, 0.12, m_sandia, (1, 1, 1)),
]
for i, (x, y, z, r, mt, sc) in enumerate(fruta_mesa):
    esfera("Pz_Fruta_Mesa_" + str(i), (x, y, z), r, mt, escala=sc)
# Racimo de uvas
for k in range(6):
    esfera("Pz_Uva_" + str(k), (1.05 + (k % 3) * 0.06, -0.72 + (k // 3) * 0.06, 1.10 + 0.22 + 0.22 + 0.04), 0.035, m_uva)
# Estantes del fondo con fruta apilada
for s, z in enumerate([1.25, 1.75]):
    caja("Pz_Estante_" + str(s), (0, 1.22, z), (3.8, 0.45, 0.05), m_tabla_oscura)
    mts = [m_manzana, m_naranja, m_pera, m_sandia]
    for i in range(8):
        x = -1.6 + i * 0.45
        esfera("Pz_Fruta_Estante_" + str(s) + "_" + str(i), (x, 1.22, z + 0.12), 0.10, mts[(i + s) % 4])


print("Puesto de frutas (Lineage 2) generado")
