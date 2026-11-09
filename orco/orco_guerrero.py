import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# ORCO GUERRERO (estilo Lineage 2, bajo polígono)
# ==============================================================================
# Figura de pie de unos 2,3 m: piel verde oscura, colmillos, cresta, armadura de
# cuero y hierro, y hacha en la mano derecha.
# Ejes: X = ancho (izquierda -/derecha +), Y = profundidad (la cara mira a Y negativo),
#       Z = altura. Los pies están en Z = 0.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(nombre, color, rugosidad=0.7, metalico=0.0):
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
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

# ==========================================
# 1. MATERIALES
# ==========================================
m_piel = material("Or_Piel_Verde", (0.17, 0.36, 0.09, 1.0), 0.75)
m_piel_oscura = material("Or_Piel_Oscura", (0.08, 0.20, 0.05, 1.0), 0.75)
m_correa = material("Or_Correa", (0.22, 0.13, 0.07, 1.0), 0.8)
m_taparrabos = material("Or_Taparrabos", (0.28, 0.18, 0.09, 1.0), 0.9)
m_hierro = material("Or_Hierro", (0.36, 0.38, 0.42, 1.0), 0.4, 0.8)
m_diente = material("Or_Diente", (0.88, 0.85, 0.72, 1.0), 0.4)
m_ojo = material("Or_Ojo_Rojo", (0.95, 0.14, 0.05, 1.0), 0.2)
m_pelo = material("Or_Cresta_Oscura", (0.10, 0.08, 0.05, 1.0), 0.9)
m_mango = material("Or_Mango_Hacha", (0.28, 0.17, 0.08, 1.0), 0.8)

# ==========================================
# 2. PIES Y PIERNAS (robustas, ligeramente arqueadas)
# ==========================================
for sx in [-1, 1]:
    caja("Or_Bota_" + str(sx), (sx * 0.17, -0.05, 0.08), (0.26, 0.38, 0.16), m_correa)
    cilindro("Or_Pantorrilla_" + str(sx), (sx * 0.17, 0.0, 0.44), 0.13, 0.58, m_piel_oscura, vertices=8)
    cilindro("Or_Muslo_" + str(sx), (sx * 0.19, 0.0, 0.98), 0.17, 0.56, m_piel, vertices=8)

# ==========================================
# 3. CADERA, TAPARRABOS Y CINTURÓN
# ==========================================
esfera("Or_Cadera", (0, 0, 1.18), 0.30, m_piel, escala=(1.2, 0.9, 0.75))
caja("Or_Taparrabos_Frente", (0, -0.22, 1.02), (0.46, 0.08, 0.5), m_taparrabos)
caja("Or_Cinturon", (0, -0.03, 1.33), (0.6, 0.18, 0.1), m_correa)

# ==========================================
# 4. TORSO MUSCULOSO, ESPALDA Y PECHO
# ==========================================
esfera("Or_Pecho", (0, 0, 1.6), 0.32, m_piel, escala=(1.45, 0.95, 1.2))
esfera("Or_Espalda_Alta", (0, 0.1, 1.78), 0.28, m_piel_oscura, escala=(1.5, 0.8, 0.7))
esfera("Or_Vientre", (0, 0.0, 1.26), 0.26, m_piel, escala=(1.2, 0.85, 0.9))
# Chaleco de cuero con tachuelas de hierro (en vez de peto de placa)
caja("Or_Chaleco", (0, -0.27, 1.56), (0.56, 0.06, 0.5), m_correa)
for k in range(3):
    esfera("Or_Tachuela_" + str(k), (-0.14 + k * 0.14, -0.31, 1.7), 0.022, m_hierro)
caja("Or_Correa_Pecho", (0, -0.3, 1.4), (0.58, 0.04, 0.07), m_correa, rot=(0, 0, 0.3))

# ==========================================
# 5. HOMBROS, BRAZOS Y PUÑOS
# ==========================================
for sx in [-1, 1]:
    esfera("Or_Hombrera_" + str(sx), (sx * 0.46, 0, 1.86), 0.2, m_hierro, escala=(1.1, 1.0, 0.65))
    esfera("Or_Hombro_" + str(sx), (sx * 0.46, 0, 1.76), 0.16, m_piel)
    for k in range(2):
        cono("Or_Pincho_" + str(sx) + "_" + str(k), (sx * (0.4 + k * 0.12), 0.02 - k * 0.1, 2.06), 0.035, 0.0, 0.14, m_hierro, vertices=5)
    cilindro("Or_Brazo_" + str(sx), (sx * 0.58, 0.0, 1.5), 0.12, 0.46, m_piel, vertices=8, rot=(0, sx * 0.12, 0))
    cilindro("Or_Antebrazo_" + str(sx), (sx * 0.62, -0.08, 1.16), 0.105, 0.44, m_piel_oscura, vertices=8, rot=(-0.35, 0, sx * 0.08))
    caja("Or_Brazal_" + str(sx), (sx * 0.62, -0.1, 1.2), (0.26, 0.26, 0.2), m_correa, rot=(-0.35, 0, sx * 0.08))
    esfera("Or_Puño_" + str(sx), (sx * 0.64, -0.2, 0.98), 0.13, m_piel)

# ==========================================
# 6. CUELLO, CABEZA Y RASGOS
# ==========================================
cilindro("Or_Cuello", (0, 0, 1.94), 0.16, 0.2, m_piel_oscura, vertices=8)
esfera("Or_Cabeza", (0, 0, 2.14), 0.27, m_piel, escala=(1.12, 1.0, 1.05))
# Mandíbula ancha con labio inferior saliente
caja("Or_Mandibula", (0, -0.08, 1.99), (0.38, 0.22, 0.12), m_piel_oscura)
caja("Or_Labio", (0, -0.2, 2.0), (0.3, 0.08, 0.06), m_piel_oscura)
# Arco de la ceja muy marcado
caja("Or_Arco_Ceja", (0, -0.2, 2.22), (0.46, 0.1, 0.08), m_piel_oscura)
for sx in [-1, 1]:
    esfera("Or_Ojo_" + str(sx), (sx * 0.1, -0.23, 2.16), 0.045, m_ojo)
    # Orejas puntiagudas, a la altura de los ojos y hacia los lados
    cono("Or_Oreja_" + str(sx), (sx * 0.3, 0.0, 2.14), 0.07, 0.0, 0.26, m_piel, vertices=6, rot=(0, sx * math.pi / 2, 0))
    # Colmillos que salen de la mandíbula hacia arriba
    cono("Or_Colmillo_" + str(sx), (sx * 0.14, -0.27, 2.08), 0.045, 0.0, 0.2, m_diente)
caja("Or_Nariz", (0, -0.25, 2.1), (0.08, 0.06, 0.12), m_piel_oscura)
# Cresta de pelo oscuro en la coronilla
for k in range(4):
    cono("Or_Cresta_" + str(k), (0, 0.04 - k * 0.07, 2.36 - abs(k - 1.5) * 0.02), 0.05, 0.0, 0.2, m_pelo, vertices=5)

# ==========================================
# 7. HACHA EN LA MANO DERECHA
# ==========================================
cilindro("Or_Mango", (0.66, -0.2, 1.12), 0.025, 1.1, m_mango, vertices=6)
caja("Or_Hoja_Hacha", (0.66, -0.26, 1.7), (0.05, 0.12, 0.34), m_hierro)
caja("Or_Hoja_Filo", (0.66, -0.26, 1.7), (0.3, 0.1, 0.05), m_hierro, rot=(0, 0, 0))
caja("Or_Filo_Hacha", (0.66, -0.2, 1.87), (0.08, 0.1, 0.06), m_hierro)

print("Orco guerrero generado")
