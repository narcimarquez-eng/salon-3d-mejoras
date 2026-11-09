import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# Vaso de café con leche
# ==============================================================================
# Vaso de cristal de bar (ligeramente abierto, base gruesa y borde redondeado)
# con café con leche: fondo de café más oscuro, cuerpo color avellana y capa de
# espuma cremosa con burbujas. Platillo de loza blanca, cucharilla de acero y
# sobre de azúcar, sobre una barra de madera.
# Los colores van en valores lineales, como en Blender (el visor los pasa a sRGB).
# Escala: 1 unidad = 10 cm (el vaso mide 1 unidad de alto, como uno real de 10 cm).
# Ejes: X = ancho, Y = profundidad, Z = altura.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Luz cálida de cafetería y reflejos suaves en el cristal
bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.7, bloom=0.04)
bpy.ops.render.set_lighting(intensity=1.25, angle=40)
bpy.ops.render.set_ssao(intensity=1.1)

def material(nombre, color, rugosidad=0.5, metalico=0.0, alfa=1.0, barniz=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
        if alfa < 1.0:
            # Transparencia clásica: se ve igual en el visor y en cualquier motor de juego
            bsdf.inputs["Alpha"].default_value = alfa
        if barniz > 0:
            bsdf.inputs["Coat Weight"].default_value = barniz
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

def cilindro(nombre, centro, radio, alto, mat, vertices=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0), segmentos=16, anillos=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def aro(nombre, centro, radio, grosor, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=radio, minor_radius=grosor, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

# ==========================================
# 1. MATERIALES
# ==========================================
m_cristal = material("Vaso_Cristal", (0.80, 0.90, 0.93, 1.0), 0.05, 0.0, alfa=0.13, barniz=1.0)
m_cafe = material("Liquido_Cafe_Fondo", (0.035, 0.013, 0.005, 1.0), 0.12)
m_con_leche = material("Liquido_Cafe_Con_Leche", (0.22, 0.095, 0.032, 1.0), 0.14)
m_transicion = material("Liquido_Transicion", (0.33, 0.17, 0.065, 1.0), 0.18)
m_espuma = material("Espuma_Leche", (0.62, 0.47, 0.29, 1.0), 0.85)
m_burbuja = material("Espuma_Burbuja", (0.80, 0.68, 0.50, 1.0), 0.35)
m_canela = material("Espuma_Mancha_Cafe", (0.28, 0.13, 0.05, 1.0), 0.8)
m_loza = material("Platillo_Loza", (0.95, 0.95, 0.93, 1.0), 0.22, barniz=0.6)
m_filete = material("Platillo_Filete_Azul", (0.10, 0.28, 0.58, 1.0), 0.3, barniz=0.6)
m_acero = material("Cucharilla_Acero", (0.82, 0.82, 0.84, 1.0), 0.18, metalico=1.0)
m_papel = material("Sobre_Papel", (0.96, 0.94, 0.88, 1.0), 0.9)
m_sobre_rojo = material("Sobre_Franja", (0.72, 0.10, 0.10, 1.0), 0.7)
m_barra = material("Barra_Madera", (0.36, 0.21, 0.11, 1.0), 0.45)
m_barra_canto = material("Barra_Madera_Canto", (0.26, 0.15, 0.08, 1.0), 0.5)
m_barra.texture = "wood_oak"
m_barra_canto.texture = "wood_oak"

# ==========================================
# 2. BARRA DE MADERA
# ==========================================
caja("Barra_Tablero", (0, 0, -0.06), (2.6, 2.0, 0.12), m_barra)
caja("Barra_Canto_Frontal", (0, -1.02, -0.09), (2.64, 0.06, 0.18), m_barra_canto)

# ==========================================
# 3. PLATILLO DE LOZA
# ==========================================
cilindro("Platillo_Pie", (0, 0, 0.012), 0.42, 0.024, m_loza, vertices=40)
cono("Platillo_Ala", (0, 0, 0.05), 0.46, 0.92, 0.055, m_loza, vertices=48)
aro("Platillo_Borde", (0, 0, 0.078), 0.92, 0.014, m_loza)
aro("Platillo_Filete", (0, 0, 0.074), 0.84, 0.006, m_filete)
cilindro("Platillo_Hueco", (0, 0, 0.03), 0.46, 0.012, m_loza, vertices=40)

# ==========================================
# 4. VASO DE CRISTAL (abre un poco hacia arriba)
# ==========================================
z0 = 0.036            # el vaso apoya en el hueco del platillo
alto = 1.0
r_abajo = 0.30
r_arriba = 0.36
pared = 0.018

def radio_en(z):
    # radio exterior del vaso a una altura z (desde su base)
    return r_abajo + (r_arriba - r_abajo) * (z / alto)

cono("Vaso_Pared", (0, 0, z0 + alto / 2), r_abajo, r_arriba, alto, m_cristal, vertices=48)
cilindro("Vaso_Culo_Grueso", (0, 0, z0 + 0.045), r_abajo - 0.004, 0.09, m_cristal, vertices=48)
aro("Vaso_Borde", (0, 0, z0 + alto), r_arriba - 0.006, 0.012, m_cristal)
# Facetas suaves en la parte baja, como los vasos de bar
for i in range(12):
    ang = i * (2 * math.pi / 12)
    rf = radio_en(0.16) + 0.002
    caja("Vaso_Faceta_" + str(i), (rf * math.cos(ang), rf * math.sin(ang), z0 + 0.16), (0.012, 0.11, 0.2), m_cristal, rot=(0, 0, ang))

# ==========================================
# 5. CAFÉ CON LECHE POR CAPAS (dentro del cristal)
# ==========================================
def capa_liquida(nombre, z_desde, z_hasta, mat):
    r1 = radio_en(z_desde) - pared
    r2 = radio_en(z_hasta) - pared
    cono(nombre, (0, 0, z0 + (z_desde + z_hasta) / 2), r1, r2, z_hasta - z_desde, mat, vertices=48)

capa_liquida("Liquido_Fondo_Cafe", 0.092, 0.24, m_cafe)
capa_liquida("Liquido_Transicion_Baja", 0.24, 0.30, m_transicion)
capa_liquida("Liquido_Cuerpo", 0.30, 0.78, m_con_leche)
capa_liquida("Liquido_Transicion_Alta", 0.78, 0.82, m_transicion)
capa_liquida("Espuma_Capa", 0.82, 0.90, m_espuma)

# Superficie de espuma ligeramente abombada con burbujas y una mancha de café
r_top = radio_en(0.90) - pared
esfera("Espuma_Cupula", (0, 0, z0 + 0.90), r_top, m_espuma, escala=(1.0, 1.0, 0.09), segmentos=40, anillos=12)
esfera("Espuma_Mancha", (0.05, -0.04, z0 + 0.918), r_top * 0.42, m_canela, escala=(1.0, 0.8, 0.03), segmentos=24, anillos=8)
burbujas = [
    (0.21, 0.08, 0.018), (0.17, -0.14, 0.014), (-0.12, 0.2, 0.016), (-0.22, -0.05, 0.02),
    (0.02, 0.24, 0.012), (-0.06, -0.22, 0.015), (0.25, -0.02, 0.011), (-0.24, 0.12, 0.012),
    (0.12, 0.2, 0.01), (-0.17, -0.18, 0.011), (0.09, -0.23, 0.013), (-0.02, 0.1, 0.009),
]
for i in range(len(burbujas)):
    b = burbujas[i]
    esfera("Espuma_Burbuja_" + str(i), (b[0], b[1], z0 + 0.912), b[2], m_burbuja, escala=(1.0, 1.0, 0.6), segmentos=10, anillos=6)

# ==========================================
# 6. CUCHARILLA DE ACERO SOBRE EL PLATILLO
# ==========================================
ang_cuch = math.radians(-28)
cx = 0.58
cy = -0.32
mango_largo = 0.62
caja("Cucharilla_Mango", (cx + math.cos(ang_cuch) * 0.2, cy + math.sin(ang_cuch) * 0.2, 0.094), (mango_largo, 0.045, 0.012), m_acero, rot=(0, 0, ang_cuch))
esfera("Cucharilla_Remate", (cx + math.cos(ang_cuch) * 0.52, cy + math.sin(ang_cuch) * 0.52, 0.094), 0.034, m_acero, escala=(1.4, 1.0, 0.35))
esfera("Cucharilla_Pala", (cx - math.cos(ang_cuch) * 0.17, cy - math.sin(ang_cuch) * 0.17, 0.096), 0.1, m_acero, escala=(1.35, 0.85, 0.22))

# ==========================================
# 7. SOBRE DE AZÚCAR
# ==========================================
caja("Sobre_Azucar", (-0.55, -0.42, 0.098), (0.36, 0.13, 0.018), m_papel, rot=(0, 0, math.radians(18)))
caja("Sobre_Franja_Roja", (-0.55, -0.42, 0.108), (0.36, 0.035, 0.004), m_sobre_rojo, rot=(0, 0, math.radians(18)))
