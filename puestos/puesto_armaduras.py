import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# Puesto de armaduras (Lineage 2)
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
m_toldo = material("Pz_Toldo_Principal", (0.32, 0.36, 0.44, 1.0), 0.95)
m_franja = material("Pz_Franja_Toldo", (0.85, 0.65, 0.25, 1.0), 0.95)
m_letrero = material("Pz_Letrero", (0.85, 0.65, 0.25, 1.0), 0.7)
m_hierro_oscuro = material("Pz_Hierro_Oscuro", (0.22, 0.23, 0.26, 1.0), 0.4, 0.8)
m_hierro_claro = material("Pz_Hierro_Claro", (0.60, 0.62, 0.66, 1.0), 0.3, 0.9)
m_cota = material("Pz_Cota_Malla", (0.45, 0.47, 0.50, 1.0), 0.45, 0.7)
m_dorado = material("Pz_Dorado_Viejo", (0.85, 0.66, 0.26, 1.0), 0.35, 0.8)
m_cuero_marron = material("Pz_Correa_Marron", (0.30, 0.18, 0.09, 1.0), 0.7)

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
# Maniquíes con armadura en el fondo
def maniqui(prefijo, x, y):
    caja(prefijo + "_Peana", (x, y, 0.21), (0.62, 0.62, 0.08), m_tabla_oscura)
    caja(prefijo + "_Piernas", (x, y, 0.90), (0.42, 0.22, 0.80), m_cota)
    caja(prefijo + "_Torso", (x, y, 1.60), (0.55, 0.30, 0.60), m_hierro_claro)
    caja(prefijo + "_Cinturon", (x, y - 0.16, 1.32), (0.56, 0.02, 0.07), m_cuero_marron)
    caja(prefijo + "_Placa", (x, y - 0.16, 1.62), (0.22, 0.02, 0.22), m_dorado)
    esfera(prefijo + "_Hombro_I", (x - 0.34, y, 1.84), 0.11, m_hierro_oscuro)
    esfera(prefijo + "_Hombro_D", (x + 0.34, y, 1.84), 0.11, m_hierro_oscuro)
    cilindro(prefijo + "_Brazo_I", (x - 0.36, y, 1.42), 0.05, 0.6, m_cota, vertices=6)
    cilindro(prefijo + "_Brazo_D", (x + 0.36, y, 1.42), 0.05, 0.6, m_cota, vertices=6)
    esfera(prefijo + "_Casco", (x, y, 2.15), 0.15, m_hierro_claro, escala=(1.0, 1.0, 1.1))
    caja(prefijo + "_Visera", (x, y - 0.13, 2.14), (0.20, 0.04, 0.06), m_hierro_oscuro)
    cilindro(prefijo + "_Penacho", (x, y, 2.42), 0.03, 0.20, m_dorado, vertices=6)
maniqui("Pz_Maniqui_I", -1.05, 0.70)
maniqui("Pz_Maniqui_D", 1.05, 0.70)
# Escudos apoyados en el mostrador (de cara al cliente)
for i, x in enumerate([-1.25, -0.55]):
    cilindro("Pz_Escudo_" + str(i), (x, -0.95, 1.10 + 0.34), 0.32, 0.05, m_hierro_oscuro, vertices=8, rot=(math.pi / 2, 0, 0))
    esfera("Pz_Escudo_Umbo_" + str(i), (x, -1.0, 1.10 + 0.34), 0.07, m_dorado)
# Yelmos apilados y peto en el mostrador
for i, x in enumerate([0.30, 0.65, 1.00]):
    esfera("Pz_Yelmo_" + str(i), (x, -0.85, 1.10 + 0.12), 0.13, m_hierro_claro, escala=(1.0, 1.0, 0.85))
caja("Pz_Peto_Cota", (1.50, -0.85, 1.10 + 0.14), (0.40, 0.25, 0.26), m_cota)
# Cota de malla colgada en el fondo
caja("Pz_Cota_Colgada", (0.0, 1.22, 1.95), (1.0, 0.04, 0.8), m_cota)


print("Puesto de armaduras (Lineage 2) generado")
