import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# ORCO ARQUERO (inspirado en el orco de Lineage 2)
# ==============================================================================
# Cuerpo ancho y musculoso, cabeza con cresta, colmillos y orejas, armadura de
# cuero con correas cruzadas, taparrabos de tela, botas con protectores de metal,
# arco en la mano derecha y carcaj a la espalda.
# Ejes: X = ancho, Y = profundidad (la cara mira a Y negativo), Z = altura.
# Los pies están en Z = 0. Medidas en metros aproximadas.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Render con volumen y luz realistas (EEVEE) en lugar del Cel-Shading por defecto.
# Luz más suave y menos reflejo de entorno: con los valores por defecto la piel sale sobreexpuesta.
bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.4, bloom=0.05)
bpy.ops.render.set_lighting(intensity=1.0, angle=40)
bpy.ops.render.set_ssao(intensity=1.4)

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

def cilindro(nombre, centro, radio, alto, mat, vertices=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=9, radius=radio, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

# ==========================================
# 1. MATERIALES (texturas procedurales asignadas explícitamente)
# ==========================================
m_piel = material("Arq_Piel_Verde", (0.14, 0.19, 0.13, 1.0), 0.6)
m_piel_sombra = material("Arq_Piel_Sombra", (0.085, 0.12, 0.08, 1.0), 0.65)
m_cuero = material("Arq_Cuero_Marron", (0.16, 0.09, 0.04, 1.0), 0.5)
m_tela = material("Arq_Taparrabos_Tela", (0.62, 0.55, 0.42, 1.0), 0.9)
m_tela.texture = "woven_linen"
m_acero = material("Arq_Acero_Protector", (0.55, 0.57, 0.60, 1.0), 0.35, 0.9)
m_acero.natural_color = True
m_acero.texture = "brushed_metal"
m_pelo = material("Arq_Pelo_Castano", (0.14, 0.08, 0.04, 1.0), 0.85)
m_diente = material("Arq_Colmillo", (0.88, 0.84, 0.70, 1.0), 0.4)
m_ojo = material("Arq_Ojo", (0.04, 0.03, 0.02, 1.0), 0.3)
m_iris = material("Arq_Iris", (0.45, 0.30, 0.06, 1.0), 0.3)
m_madera = material("Arq_Madera_Arco", (0.40, 0.26, 0.13, 1.0), 0.7)
m_madera.natural_color = True
m_madera.texture = "wood_oak"
m_cuerda = material("Arq_Cuerda", (0.85, 0.80, 0.65, 1.0), 0.8)
m_flecha = material("Arq_Flecha", (0.55, 0.45, 0.30, 1.0), 0.7)
m_pluma = material("Arq_Pluma", (0.80, 0.75, 0.62, 1.0), 0.9)

# ==========================================
# 2. PIERNAS, BOTAS Y PROTECTORES
# ==========================================
for sx in [-1, 1]:
    caja("Arq_Bota_Cuerpo_" + str(sx), (sx * 0.22, -0.06, 0.13), (0.24, 0.36, 0.2), m_cuero)
    esfera("Arq_Bota_Puntera_" + str(sx), (sx * 0.22, -0.23, 0.11), 0.13, m_cuero, escala=(1.0, 0.9, 0.75))
    caja("Arq_Suela_" + str(sx), (sx * 0.22, -0.07, 0.03), (0.26, 0.4, 0.04), m_cuero)
    caja("Arq_Talon_" + str(sx), (sx * 0.22, 0.1, 0.1), (0.24, 0.1, 0.16), m_cuero)
    for k in range(3):
        caja("Arq_Tira_" + str(sx) + "_" + str(k), (sx * 0.22, -0.12 + k * 0.07, 0.2 + k * 0.012), (0.27, 0.025, 0.03), m_cuero, rot=(0.2, 0, 0))
    esfera("Arq_Pantorrilla_" + str(sx), (sx * 0.22, 0.02, 0.62), 0.2, m_piel, escala=(0.85, 0.9, 1.6))
    cilindro("Arq_Protector_" + str(sx), (sx * 0.22, -0.02, 0.44), 0.165, 0.3, m_acero, vertices=12)
    esfera("Arq_Muslo_" + str(sx), (sx * 0.26, 0.0, 1.2), 0.24, m_piel, escala=(0.95, 0.95, 1.5))
    esfera("Arq_Rodilla_" + str(sx), (sx * 0.24, -0.02, 0.9), 0.16, m_piel_sombra)

# ==========================================
# 3. CADERA, TAPARRABOS Y CINTURÓN
# ==========================================
esfera("Arq_Cadera", (0, 0, 1.55), 0.36, m_piel, escala=(1.25, 0.9, 0.8))
caja("Arq_Taparrabos", (0, -0.27, 1.42), (0.36, 0.05, 0.5), m_tela, rot=(0.12, 0, 0))
caja("Arq_Taparrabos_Trasero", (0, 0.27, 1.42), (0.42, 0.05, 0.48), m_tela, rot=(-0.12, 0, 0))
for sx in [-1, 1]:
    caja("Arq_Faldon_Lateral_" + str(sx), (sx * 0.36, -0.1, 1.5), (0.05, 0.22, 0.3), m_tela, rot=(0, sx * 0.25, 0))
caja("Arq_Bolsa", (-0.3, -0.24, 1.6), (0.16, 0.08, 0.18), m_cuero)
cilindro("Arq_Bolsa_Cierre", (-0.3, -0.29, 1.66), 0.02, 0.03, m_acero, vertices=8, rot=(math.pi / 2, 0, 0))
caja("Arq_Cinturon", (0, -0.04, 1.72), (0.72, 0.2, 0.12), m_cuero)
caja("Arq_Hebilla", (0, -0.16, 1.72), (0.1, 0.04, 0.1), m_acero)

# ==========================================
# 4. TORSO ANCHO, VIENTRE Y ESPALDA
# ==========================================
esfera("Arq_Vientre", (0, 0.06, 1.88), 0.44, m_piel, escala=(1.12, 0.95, 1.0))
esfera("Arq_Pecho", (0, 0, 2.25), 0.4, m_piel, escala=(1.35, 0.95, 0.95))
esfera("Arq_Pectoral_I", (-0.2, -0.22, 2.3), 0.2, m_piel, escala=(1.0, 0.7, 0.8))
esfera("Arq_Pectoral_D", (0.2, -0.22, 2.3), 0.2, m_piel, escala=(1.0, 0.7, 0.8))
esfera("Arq_Espalda", (0, 0.14, 2.45), 0.3, m_piel_sombra, escala=(1.4, 0.7, 0.7))
# Peto de cuero con correas cruzadas (en X sobre el pecho)
caja("Arq_Peto_Cuero", (0, -0.3, 2.22), (0.66, 0.08, 0.6), m_cuero)
caja("Arq_Correa_I", (0, -0.36, 2.22), (0.1, 0.04, 0.9), m_cuero, rot=(0, 0.7, 0))
caja("Arq_Correa_D", (0, -0.36, 2.22), (0.1, 0.04, 0.9), m_cuero, rot=(0, -0.7, 0))
for k in range(4):
    esfera("Arq_Remache_" + str(k), (-0.2 + k * 0.13, -0.36, 2.0), 0.02, m_acero)

# ==========================================
# 5. HOMBROS, BRAZOS, ANTEBRAZOS Y PUÑOS
# ==========================================
for sx in [-1, 1]:
    cilindro("Arq_Hombrera_Base_" + str(sx), (sx * 0.5, 0, 2.52), 0.02, 0.02, m_cuero)
    esfera("Arq_Hombrera_" + str(sx), (sx * 0.5, 0.0, 2.52), 0.22, m_cuero, escala=(1.0, 1.0, 0.6))
    for k in range(3):
        esfera("Arq_Tachuela_" + str(sx) + "_" + str(k), (sx * 0.5 + sx * 0.1 * (k - 1) * 0.0, -0.18 + k * 0.1, 2.56), 0.022, m_acero)
    esfera("Arq_Hombro_Union_" + str(sx), (sx * 0.42, 0.0, 2.4), 0.2, m_piel, escala=(1.0, 1.0, 0.9))
    esfera("Arq_Brazo_" + str(sx), (sx * 0.58, 0.0, 2.1), 0.22, m_piel, escala=(1.0, 1.0, 1.45))
    esfera("Arq_Biceps_" + str(sx), (sx * 0.6, -0.08, 2.14), 0.19, m_piel, escala=(1.0, 0.9, 1.1))
    esfera("Arq_Antebrazo_" + str(sx), (sx * 0.64, -0.1, 1.72), 0.19, m_piel_sombra, escala=(1.0, 1.0, 1.4))
    caja("Arq_Brazal_" + str(sx), (sx * 0.62, -0.12, 1.72), (0.32, 0.32, 0.22), m_cuero)
    caja("Arq_Palma_" + str(sx), (sx * 0.66, -0.25, 1.43), (0.14, 0.12, 0.16), m_piel)
    for k in range(4):
        cilindro("Arq_Dedo_" + str(sx) + "_" + str(k), (sx * 0.66 + (k - 1.5) * 0.034, -0.345, 1.34), 0.02, 0.1, m_piel, vertices=6, rot=(0.5, 0, 0))
        esfera("Arq_Nudillo_" + str(sx) + "_" + str(k), (sx * 0.66 + (k - 1.5) * 0.034, -0.31, 1.39), 0.026, m_piel_sombra)
    cilindro("Arq_Pulgar_" + str(sx), (sx * 0.73, -0.28, 1.48), 0.024, 0.09, m_piel, vertices=6, rot=(0.4, 0, sx * 0.6))

# ==========================================
# 6. CUELLO, CABEZA Y RASGOS
# ==========================================
cilindro("Arq_Cuello", (0, 0.02, 2.72), 0.21, 0.28, m_piel_sombra, vertices=12)
for sx in [-1, 1]:
    # Trapecios que unen la nuca con los hombros
    esfera("Arq_Trapecio_" + str(sx), (sx * 0.2, 0.06, 2.68), 0.16, m_piel, escala=(1.3, 1.0, 0.7))
# Cráneo y masa de la cara (pómulos anchos)
esfera("Arq_Craneo", (0, 0.03, 3.03), 0.25, m_piel)
esfera("Arq_Cara", (0, -0.12, 2.94), 0.2, m_piel, escala=(1.25, 0.9, 0.9))
# Ceja redondeada y muy marcada
esfera("Arq_Ceja", (0, -0.23, 3.07), 0.12, m_piel_sombra, escala=(2.2, 0.8, 0.55))
# Ojos hundidos bajo la ceja, con iris ámbar
for sx in [-1, 1]:
    esfera("Arq_Ojo_" + str(sx), (sx * 0.09, -0.265, 3.015), 0.032, m_ojo)
    esfera("Arq_Iris_" + str(sx), (sx * 0.09, -0.29, 3.015), 0.011, m_iris)
# Nariz ancha y chata, con orificios
esfera("Arq_Nariz", (0, -0.32, 2.95), 0.07, m_piel, escala=(1.4, 1.0, 0.9))
for sx in [-1, 1]:
    esfera("Arq_Orificio_" + str(sx), (sx * 0.035, -0.37, 2.925), 0.012, m_piel_sombra)
# Hocico, labio y mandíbula inferior saliente (prognatismo)
esfera("Arq_Hocico", (0, -0.27, 2.87), 0.12, m_piel, escala=(1.5, 0.8, 0.6))
esfera("Arq_Mandibula", (0, -0.24, 2.78), 0.15, m_piel_sombra, escala=(1.5, 1.0, 0.75))
for sx in [-1, 1]:
    # Colmillos que suben desde la mandíbula por fuera del labio
    cono("Arq_Colmillo_" + str(sx), (sx * 0.11, -0.36, 2.87), 0.035, 0.0, 0.14, m_diente, rot=(0, sx * 0.25, 0))
    # Orejas alargadas inclinadas hacia atrás
    esfera("Arq_Oreja_" + str(sx), (sx * 0.3, 0.04, 3.0), 0.1, m_piel, escala=(2.0, 0.5, 0.9), rot=(0, 0, sx * 0.45))
# Pelo castaño peinado hacia atrás y moño con cinta de cuero
esfera("Arq_Pelo", (0, 0.06, 3.13), 0.255, m_pelo, escala=(1.02, 1.05, 0.7))
esfera("Arq_Mono", (0, 0.2, 3.3), 0.09, m_pelo)
cilindro("Arq_Cinta_Mono", (0, 0.17, 3.24), 0.06, 0.04, m_cuero, vertices=10)

# ==========================================
# 7. ARCO EN LA MANO DERECHA (arco curvo, cuerda)
# ==========================================
arc_pts = []
for i in range(7):
    t = -1.0 + i * (2.0 / 6.0)
    arc_pts.append((0.92 + 0.2 * (1 - t * t), -0.3, 2.0 + t * 1.1))
for i in range(len(arc_pts) - 1):
    a = arc_pts[i]
    b = arc_pts[i + 1]
    mx = (a[0] + b[0]) / 2
    my = (a[1] + b[1]) / 2
    mz = (a[2] + b[2]) / 2
    dx = b[0] - a[0]
    dz = b[2] - a[2]
    largo = math.sqrt(dx * dx + dz * dz)
    ang = math.atan2(dx, dz)
    cilindro("Arq_Arco_Tramo_" + str(i), (mx, my, mz), 0.022, largo, m_madera, vertices=6, rot=(0, ang, 0))
top = arc_pts[0]
bot = arc_pts[-1]
cilindro("Arq_Cuerda_Arco", (0.92, -0.3, 2.0), 0.006, 2.2, m_cuerda, vertices=4)
cilindro("Arq_Empuñadura_Arco", (0.98, -0.3, 2.0), 0.05, 0.26, m_cuero, vertices=8)

# ==========================================
# 8. CARCAJ A LA ESPALDA CON FLECHAS
# ==========================================
caja("Arq_Carcaj", (0.1, 0.42, 2.55), (0.24, 0.16, 0.7), m_cuero, rot=(0.25, 0, -0.15))
for k in range(4):
    x = -0.02 + k * 0.08
    cilindro("Arq_Flecha_" + str(k), (x + 0.1, 0.42, 3.02), 0.008, 0.62, m_flecha, vertices=4, rot=(0.25, 0, -0.15))
    cono("Arq_Pluma_" + str(k), (x + 0.1, 0.42, 3.36), 0.02, 0.0, 0.1, m_pluma, vertices=3)

print("Orco arquero generado")
