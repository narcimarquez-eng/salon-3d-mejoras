import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# Puesto de pescado (Lineage 2)
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
m_toldo = material("Pz_Toldo_Principal", (0.10, 0.36, 0.62, 1.0), 0.95)
m_franja = material("Pz_Franja_Toldo", (0.95, 0.96, 0.97, 1.0), 0.95)
m_letrero = material("Pz_Letrero", (0.05, 0.50, 0.50, 1.0), 0.7)
m_escarcha = material("Pz_Escarcha_Azul", (0.78, 0.90, 0.98, 1.0), 0.3)
m_pez = material("Pz_Pez_Plata", (0.60, 0.68, 0.74, 1.0), 0.35, 0.3)
m_pez_dorso = material("Pz_Pez_Azul_Dorso", (0.20, 0.40, 0.60, 1.0), 0.35, 0.2)
m_pez_vientre = material("Pz_Pez_Vientre", (0.92, 0.92, 0.90, 1.0), 0.4)

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
# Bandeja de escarcha sobre el mostrador
caja("Pz_Bandeja_Escarcha", (0, -0.75, 1.14), (3.5, 0.75, 0.06), m_escarcha)
def pez(nombre, x, y, z, rot_z):
    # Cuerpo alargado en X, cola en cono y dorso azul
    esfera(nombre + "_Cuerpo", (x, y, z), 0.11, m_pez, escala=(2.2, 0.8, 0.8))
    cono(nombre + "_Cola", (x - 0.30, y, z), 0.10, 0.01, 0.14, m_pez, vertices=6, rot=(0, math.pi / 2, 0))
    esfera(nombre + "_Dorso", (x, y, z + 0.05), 0.07, m_pez_dorso, escala=(1.8, 0.7, 0.45))
for r in range(2):
    for i in range(7):
        x = -1.45 + i * 0.48
        pez("Pz_Pez_Mesa_" + str(r) + "_" + str(i), x, -0.95 + r * 0.42, 1.14 + 0.09, 0)
# Barril de pescado a un lado
cilindro("Pz_Barril_Pescado", (1.75, -1.90, 0.40), 0.30, 0.8, m_tabla_oscura, vertices=8)
for i in range(3):
    pez("Pz_Pez_Barril_" + str(i), 1.75 - 0.12 + i * 0.12, -1.90, 0.85, 0)
# Peces colgados en el fondo de una barra
cilindro("Pz_Barra_Colgado", (0, 1.25, 2.20), 0.025, 3.6, m_tabla_oscura, vertices=6, rot=(0, math.pi / 2, 0))
for i in range(7):
    x = -1.45 + i * 0.48
    esfera("Pz_Pez_Colgado_" + str(i) + "_Cuerpo", (x, 1.25, 1.85), 0.11, m_pez_vientre, escala=(2.2, 0.8, 0.8))
    cono("Pz_Pez_Colgado_" + str(i) + "_Cola", (x, 1.25, 1.85 - 0.30), 0.10, 0.01, 0.14, m_pez_vientre, vertices=6, rot=(math.pi, 0, 0))


print("Puesto de pescado (Lineage 2) generado")
