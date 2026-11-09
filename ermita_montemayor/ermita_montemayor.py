import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# ERMITA DE MONTEMAYOR (Moguer, Huelva) - versión 2, basada en fotografías
# ==============================================================================
# Edificio blanco de cal con zócalos, cornisas y recercados de ladrillo naranja.
# - Nave central de dos aguas (cumbrera a lo largo del eje Y) con gablete a la fachada.
# - Portada de ladrillo de arco de medio punto, puerta de madera, reja y abanico.
# - Espadaña de dos campanas en el frente derecho, con cruz de forja.
# - Torre octogonal con óculo de ladrillo y cubierta piramidal con linterna.
# - Ala izquierda más baja, con ventanas de arco y rejas de hierro.
# - Faroles de forja en los muros, escudo cerámico y escalinata de ladrillo.
# Ejes: X = ancho, Y = profundidad (la fachada principal mira a Y negativo), Z = altura.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Render con volumen (EEVEE), luz suave y oclusión para los relieves
bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.6, bloom=0.06)
bpy.ops.render.set_lighting(intensity=1.3, angle=35)
bpy.ops.render.set_ssao(intensity=1.3)

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

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def arco_medio_punto(prefijo, x, y, z_base, ancho, alto, mat, pasos=8, marco=None):
    # Vano con remate de medio punto por escalones; frente a Y negativo
    rad = ancho / 2
    if marco:
        rm = rad + 0.3
        caja(prefijo + "_Jamba_I", (x - rm, y, z_base + alto / 2), (0.3, 0.45, alto), marco)
        caja(prefijo + "_Jamba_D", (x + rm, y, z_base + alto / 2), (0.3, 0.45, alto), marco)
        for k in range(pasos):
            h = (k + 0.5) / pasos * rm
            w = 2 * math.sqrt(max(0.0, rm * rm - h * h))
            caja(prefijo + "_Dovela_" + str(k), (x, y, z_base + alto + h), (w, 0.45, rm / pasos + 0.03), marco)
    caja(prefijo + "_Vano", (x, y, z_base + alto / 2), (ancho, 0.3, alto), mat)
    for k in range(pasos):
        h = (k + 0.5) / pasos * rad
        w = 2 * math.sqrt(max(0.0, rad * rad - h * h))
        caja(prefijo + "_Arco_" + str(k), (x, y, z_base + alto + h), (w, 0.3, rad / pasos + 0.03), mat)

def tejado_dos_aguas(prefijo, x0, x1, y0, y1, z_alero, altura, mat_teja, mat_borde, volado=0.8):
    # Cubierta a dos aguas con cumbrera paralela a Y.
    # Faldón derecho: rot_y = +θ (su borde exterior baja). Faldón izquierdo: rot_y = -θ.
    xc = (x0 + x1) / 2
    semi = (x1 - x0) / 2 + volado
    theta = math.atan2(altura, semi)
    slope_len = math.hypot(semi, altura)
    ridge_z = z_alero + altura
    yc = (y0 + y1) / 2
    yl = (y1 - y0) + 2 * volado
    for sx in [-1, 1]:
        d = semi / 2
        cx = xc + sx * d
        cz = ridge_z - d * math.tan(theta) - 0.12
        caja(prefijo + "_Faldon_" + str(sx), (cx, yc, cz), (slope_len, yl, 0.24), mat_teja, rot=(0, sx * theta, 0))
        for k in range(12):
            yy = y0 - volado + 0.3 + k * (yl - 0.6) / 11
            caja(prefijo + "_Canal_" + str(sx) + "_" + str(k), (cx, yy, cz + 0.2), (slope_len * 0.98, 0.1, 0.07), mat_teja, rot=(0, sx * theta, 0))
    caja(prefijo + "_Cumbrera", (xc, yc, ridge_z + 0.08), (0.45, yl, 0.2), mat_teja)
    for sx in [-1, 1]:
        caja(prefijo + "_Cornisa_Ladrillo_" + str(sx), (xc + sx * (semi - 0.3), yc, z_alero - 0.1), (0.5, yl, 0.35), mat_borde)
    return ridge_z

# ==========================================
# 1. MATERIALES
# ==========================================
m_cal = material("EM_Cal_Blanca", (0.93, 0.91, 0.86, 1.0), 0.8)
m_cal.color_map = "cal_blanca"
m_cal.color_map_scale = 2.0
m_teja = material("EM_Teja_Arabe", (0.62, 0.36, 0.20, 1.0), 0.75)
m_teja.color_map = "teja_arcilla"
m_teja.color_map_scale = 2.5
m_teja.texture = "terracotta_roof"
m_teja.texture_repeat = 6
m_ladrillo = material("EM_Ladrillo_Naranja", (0.80, 0.40, 0.18, 1.0), 0.8)
m_ladrillo.texture = "brick_mudejar"
m_ladrillo.texture_repeat = 8
m_piedra = material("EM_Piedra_Clara", (0.86, 0.82, 0.72, 1.0), 0.7)
m_hierro = material("EM_Hierro_Forja", (0.08, 0.08, 0.09, 1.0), 0.45, 0.8)
m_hierro.texture = "brushed_metal"
m_madera = material("EM_Madera_Oscura", (0.20, 0.11, 0.05, 1.0), 0.7)
m_madera.texture = "wood_oak"
m_madera.texture_repeat = 3
m_cristal = material("EM_Vidrio_Oscuro", (0.05, 0.08, 0.09, 1.0), 0.15, 0.1)
m_hueco = material("EM_Hueco_Sombra", (0.03, 0.025, 0.02, 1.0), 0.95)
m_bronce = material("EM_Campana_Bronce", (0.62, 0.42, 0.18, 1.0), 0.35, 0.9)
m_arena = material("EM_Arena_Plaza", (0.66, 0.38, 0.20, 1.0), 0.95)
m_farol = material("EM_Farol_Metal", (0.05, 0.05, 0.05, 1.0), 0.4, 0.6)
m_luz = material("EM_Luz_Farol", (1.0, 0.85, 0.5, 1.0), 0.3)
m_escudo = material("EM_Escudo_Ceramica", (0.88, 0.55, 0.20, 1.0), 0.4)

# ==========================================
# 2. PLAZA Y ESCALINATA DE LADRILLO
# ==========================================
caja("EM_Plaza_Arena", (0, -8.0, -0.05), (40.0, 34.0, 0.1), m_arena)
for k in range(4):
    caja("EM_Escalinata_" + str(k), (0, -17.0 - k * 0.6, 0.15 + k * 0.15), (14.0, 0.7, 0.3 + k * 0.15), m_ladrillo)

# ==========================================
# 3. NAVE CENTRAL: MUROS DE CAL, ZÓCALO Y CORNISAS
# ==========================================
NX0, NX1 = -6.0, 6.0
NY0, NY1 = -8.0, 10.0
HW = 6.0
caja("EM_Nave_Muro", (0, (NY0 + NY1) / 2, HW / 2), (NX1 - NX0, NY1 - NY0, HW), m_cal)
caja("EM_Nave_Zocalo_Frente", (0, NY0 - 0.02, 0.45), (NX1 - NX0 + 0.1, 0.2, 0.9), m_ladrillo)
caja("EM_Nave_Zocalo_Lado_I", (NX0 - 0.02, (NY0 + NY1) / 2, 0.45), (0.2, NY1 - NY0, 0.9), m_ladrillo)
caja("EM_Nave_Zocalo_Lado_D", (NX1 + 0.02, (NY0 + NY1) / 2, 0.45), (0.2, NY1 - NY0, 0.9), m_ladrillo)
# Recercados de esquina alternando sillares (quoins)
for sx in [-1, 1]:
    for sy in [NY0, NY1]:
        for k in range(6):
            caja("EM_Quoin_" + str(sx) + "_" + str(sy) + "_" + str(k), (sx * NX1, sy, 0.6 + k * 1.0), (0.5, 0.3, 0.45), m_ladrillo)

# Cubierta de la nave
RIDGE = tejado_dos_aguas("EM_Nave", NX0, NX1, NY0, NY1, HW, 3.2, m_teja, m_ladrillo, volado=0.8)
# Gablete de la fachada: triángulo de cal bajo el faldón
for k in range(5):
    z = HW + k * 0.64
    w = (NX1 - NX0) * (1 - (z - HW) / 3.2)
    caja("EM_Gablete_Cal_" + str(k), (0, NY0 - 0.05, z + 0.3), (w, 0.3, 0.7), m_cal)
caja("EM_Gablete_Cornisa", (0, NY0 - 0.2, HW + 3.3), (6.6, 0.25, 0.3), m_ladrillo)
cilindro("EM_Cruz_Poste", (0, NY0 - 0.1, RIDGE + 0.9), 0.05, 1.8, m_hierro, vertices=6)
caja("EM_Cruz_Brazo", (0, NY0 - 0.1, RIDGE + 1.3), (0.9, 0.07, 0.07), m_hierro)
caja("EM_Cruz_Brazo_Sup", (0, NY0 - 0.1, RIDGE + 1.6), (0.45, 0.07, 0.07), m_hierro)

# Escudo cerámico en el gablete
cilindro("EM_Escudo", (0, NY0 - 0.25, HW + 1.6), 0.55, 0.12, m_escudo, vertices=16, rot=(math.pi / 2, 0, 0))
cilindro("EM_Escudo_Borde", (0, NY0 - 0.31, HW + 1.6), 0.62, 0.05, m_ladrillo, vertices=16, rot=(math.pi / 2, 0, 0))

# ==========================================
# 4. PORTADA DE LADRILLO CON REJA Y ABANICO
# ==========================================
arco_medio_punto("EM_Portada", 0, NY0 - 0.1, 0.0, 3.2, 4.0, m_madera, pasos=10, marco=m_ladrillo)
# Reja de hierro: montantes y travesaños
for sx in [-1, 1]:
    for k in range(7):
        caja("EM_Reja_Barrote_" + str(sx) + "_" + str(k), (sx * (0.2 + k * 0.25), NY0 - 0.32, 2.0), (0.03, 0.03, 3.8), m_hierro)
for k in range(5):
    caja("EM_Reja_Travesano_" + str(k), (0, NY0 - 0.32, 0.9 + k * 0.85), (3.0, 0.03, 0.03), m_hierro)
# Abanico de hierro sobre la puerta (rayos radiales)
for k in range(9):
    a = math.radians(-80 + k * 20)
    caja("EM_Abanico_" + str(k), (0.45 * math.cos(a), NY0 - 0.32, 4.1 + 0.45 * math.sin(a)), (0.03, 0.03, 0.9), m_hierro, rot=(0, a, 0))
# Óculo de ladrillo con vidrio emplomado sobre el arco
cilindro("EM_Oculo_Frente", (0, NY0 - 0.26, 5.6), 0.5, 0.15, m_ladrillo, vertices=16, rot=(math.pi / 2, 0, 0))
cilindro("EM_Oculo_Vidrio", (0, NY0 - 0.33, 5.6), 0.36, 0.05, m_hierro, vertices=16, rot=(math.pi / 2, 0, 0))

# ==========================================
# 5. PORTADA GÓTICA DEL LADO DERECHO
# ==========================================
caja("EM_Portada_Lat_Fondo", (4.2, NY0 - 0.1, 1.9), (1.8, 0.3, 3.8), m_ladrillo)
arco_medio_punto("EM_Portada_Lat", 4.2, NY0 - 0.14, 0.0, 1.6, 2.6, m_madera, pasos=6, marco=m_ladrillo)

# Ventanas de arco con rejas en los muros laterales de la nave
for sx in [-1, 1]:
    for yy in [-5.0, -0.5, 4.0]:
        x = sx * (NX1 + 0.02)
        caja("EM_Vent_Marco_" + str(sx) + "_" + str(yy), (x, yy, 3.0), (0.2, 1.4, 2.0), m_ladrillo)
        caja("EM_Vent_Hueco_" + str(sx) + "_" + str(yy), (x + sx * 0.03, yy, 3.0), (0.1, 1.1, 1.9), m_cristal)
        for k in range(4):
            caja("EM_Vent_Reja_" + str(sx) + "_" + str(yy) + "_" + str(k), (x + sx * 0.08, yy - 0.4 + k * 0.27, 3.0), (0.03, 0.03, 1.9), m_hierro)
        caja("EM_Vent_Travesano_" + str(sx) + "_" + str(yy), (x + sx * 0.08, yy, 3.0), (0.03, 1.1, 0.03), m_hierro)
        cilindro("EM_Vent_Arco_" + str(sx) + "_" + str(yy), (x, yy, 4.05), 0.7, 0.2, m_ladrillo, vertices=12, rot=(0, math.pi / 2, 0))

# Faroles de forja en los muros
for fa in [[NX1 + 0.4, -3.0, 3.6], [NX1 + 0.4, 3.0, 3.6], [NX0 - 0.4, -3.0, 3.6], [NX0 - 0.4, 3.0, 3.6]]:
    x, y, z = fa[0], fa[1], fa[2]
    caja("EM_Farol_Brazo_" + str(x) + "_" + str(y), (x, y, z), (0.7, 0.05, 0.05), m_farol)
    caja("EM_Farol_Caja_" + str(x) + "_" + str(y), (x + 0.2, y, z - 0.3), (0.3, 0.25, 0.45), m_farol)
    cono("EM_Farol_Techo_" + str(x) + "_" + str(y), (x + 0.2, y, z + 0.05), 0.22, 0.0, 0.25, m_farol, vertices=6)
    caja("EM_Farol_Luz_" + str(x) + "_" + str(y), (x + 0.2, y, z - 0.3), (0.18, 0.12, 0.3), m_luz)

# ==========================================
# 6. ESPADAÑA DE DOS CAMPANAS (frente derecho)
# ==========================================
BX, BY = 4.6, -10.5
caja("EM_Espadana_Cuerpo", (BX, BY, 5.0), (2.6, 2.6, 10.0), m_cal)
for sx in [-1, 1]:
    for sy in [-1, 1]:
        caja("EM_Espadana_Esquina_" + str(sx) + "_" + str(sy), (BX + sx * 1.3, BY + sy * 1.3, 4.0), (0.35, 0.35, 8.0), m_ladrillo)
for k in range(2):
    caja("EM_Espadana_Cornisa_" + str(k), (BX, BY, 9.2 + k * 0.4), (2.9 - k * 0.2, 2.9 - k * 0.2, 0.25), m_ladrillo)
for k in range(2):
    xb = BX + (k * 2 - 1) * 0.55
    arco_medio_punto("EM_Espadana_Vano_" + str(k), xb, BY - 1.33, 7.6, 0.8, 1.2, m_hueco, pasos=4, marco=m_ladrillo)
    cilindro("EM_Yugo_" + str(k), (xb, BY - 1.5, 8.8), 0.02, 0.6, m_hierro, vertices=6, rot=(0, math.pi / 2, 0))
    cono("EM_Campana_" + str(k), (xb, BY - 1.5, 8.7), 0.17, 0.1, 0.3, m_bronce, vertices=10)
cono("EM_Espadana_Tejado", (BX, BY, 10.9), 1.8, 0.0, 1.6, m_teja, vertices=4, rot=(0, 0, math.pi / 4))
cilindro("EM_Espadana_Cruz", (BX, BY, 12.2), 0.04, 1.0, m_hierro, vertices=6)
caja("EM_Espadana_Cruz_Brazo", (BX, BY, 12.4), (0.5, 0.06, 0.06), m_hierro)

# ==========================================
# 7. TORRE OCTOGONAL CON ÓCULO Y CUBIERTA PIRAMIDAL
# ==========================================
OX, OY, OR = 10.5, 3.0, 3.6
cilindro("EM_Torre_Octo_Muro", (OX, OY, 4.8), OR, 9.0, m_cal, vertices=8, rot=(0, 0, math.pi / 8))
cilindro("EM_Torre_Octo_Friso", (OX, OY, 0.9), OR + 0.1, 0.35, m_ladrillo, vertices=8, rot=(0, 0, math.pi / 8))
cilindro("EM_Torre_Octo_Cornisa", (OX, OY, 9.4), OR + 0.25, 0.4, m_ladrillo, vertices=8, rot=(0, 0, math.pi / 8))
cilindro("EM_Torre_Oculo_Marco", (OX, OY - OR - 0.02, 6.2), 0.95, 0.2, m_ladrillo, vertices=16, rot=(math.pi / 2, 0, 0))
cilindro("EM_Torre_Oculo_Vidrio", (OX, OY - OR - 0.1, 6.2), 0.7, 0.05, m_hierro, vertices=16, rot=(math.pi / 2, 0, 0))
cono("EM_Torre_Octo_Tejado", (OX, OY, 11.0), OR + 0.8, 0.0, 4.0, m_teja, vertices=8, rot=(0, 0, math.pi / 8))
cilindro("EM_Torre_Linterna", (OX, OY, 13.2), 0.7, 1.2, m_cal, vertices=8, rot=(0, 0, math.pi / 8))
cono("EM_Torre_Linterna_Tejado", (OX, OY, 14.3), 0.9, 0.0, 0.9, m_teja, vertices=8, rot=(0, 0, math.pi / 8))
cilindro("EM_Torre_Cruz", (OX, OY, 15.5), 0.03, 1.0, m_hierro, vertices=6)

# ==========================================
# 8. ALA IZQUIERDA (más baja, con tejado propio)
# ==========================================
LX0, LX1 = -15.0, -6.0
LY0, LY1 = -5.0, 6.0
HL = 4.2
caja("EM_Ala_Izq_Muro", ((LX0 + LX1) / 2, (LY0 + LY1) / 2, HL / 2), (LX1 - LX0, LY1 - LY0, HL), m_cal)
caja("EM_Ala_Izq_Zocalo", ((LX0 + LX1) / 2, LY0 - 0.02, 0.45), (LX1 - LX0, 0.2, 0.9), m_ladrillo)
tejado_dos_aguas("EM_AlaIzq", LX0, LX1, LY0, LY1, HL, 2.2, m_teja, m_ladrillo, volado=0.7)
for k in range(3):
    xx = LX0 + 1.4 + k * 2.8
    caja("EM_Ala_Vent_Marco_" + str(k), (xx, LY0 - 0.02, 2.2), (1.4, 0.2, 1.9), m_ladrillo)
    caja("EM_Ala_Vent_Hueco_" + str(k), (xx, LY0 - 0.1, 2.2), (1.0, 0.1, 1.6), m_cristal)
    for j in range(3):
        caja("EM_Ala_Vent_Reja_" + str(k) + "_" + str(j), (xx - 0.3 + j * 0.3, LY0 - 0.14, 2.2), (0.03, 0.03, 1.6), m_hierro)
    cilindro("EM_Ala_Vent_Arco_" + str(k), (xx, LY0 - 0.08, 3.1), 0.5, 0.15, m_ladrillo, vertices=12, rot=(math.pi / 2, 0, 0))

# ==========================================
# 9. ESCALERAS, MACETAS Y DETALLES DE PLAZA
# ==========================================
for sx in [-1, 1]:
    caja("EM_Banco_Plaza_" + str(sx), (sx * 9.0, -12.0, 0.4), (3.0, 0.7, 0.4), m_piedra)
for k in range(3):
    cilindro("EM_Maceta_" + str(k), (-3.0 + k * 3.0, -12.8, 0.35), 0.4, 0.7, m_teja, vertices=10)

print("Ermita de Montemayor v2 generada")
