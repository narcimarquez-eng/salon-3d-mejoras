import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# CASA ANDALUZA DE DOS PLANTAS (a partir de la hoja de vistas del usuario)
# ==============================================================================
# Casa encalada con cubierta de teja árabe a cuatro aguas (vista superior), canecillos
# de madera bajo el alero, tres balcones con cierre de forja y macetas en la planta alta,
# dos ventanas con reja y recercado de piedra en la baja, puerta de madera con dintel,
# macetas de geranios junto a la puerta y buganvillas en las esquinas delanteras.
# Fachada trasera: tres ventanas, dos ventanas con reja y una puerta.
# Medidas sacadas del dibujo (no tiene cotas): alero a 6,3 m, cumbrera a 8,0 m,
# planta 9,6 x 7,0 m. Todo es aproximado.
# Tejas: en lugar de modelar cada teja (miles de triángulos) la cubierta es una sola
# malla con la textura de teja árabe y lomos (caballetes) en cumbrera y limas.
# Ejes: X = ancho, Y = profundidad (la fachada mira a Y negativo), Z = altura.
# Colores en valores lineales, como en Blender.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.6, bloom=0.05)
bpy.ops.render.set_lighting(intensity=1.3, angle=40)
bpy.ops.render.set_ssao(intensity=1.2)

def material(nombre, color, rugosidad=0.6, metalico=0.0, alfa=1.0, barniz=0.0, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
        if alfa < 1.0:
            bsdf.inputs["Alpha"].default_value = alfa
        if barniz > 0:
            bsdf.inputs["Coat Weight"].default_value = barniz
        if emision > 0:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emision
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

def cono(nombre, centro, r1, r2, alto, mat, vertices=8):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0), segmentos=8, anillos=5):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def barra(nombre, a, b, radio, mat, vertices=6):
    # Cilindro de a hasta b (el cilindro nace a lo largo de Z: se inclina en Y y se orienta en Z)
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    largo = math.sqrt(dx * dx + dy * dy + dz * dz)
    horiz = math.sqrt(dx * dx + dy * dy)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    return cilindro(nombre, centro, radio, largo, mat, vertices, rot=(0, math.atan2(horiz, dz), math.atan2(dy, dx)))

# ==========================================
# 1. MATERIALES (pocos y compartidos)
# ==========================================
m_cal = material("CA_Cal", (0.86, 0.85, 0.82, 1.0), 0.9)
# Cal lisa: la textura cal_blanca salía sucia y gris

m_teja = material("CA_Teja", (0.42, 0.12, 0.045, 1.0), 0.8)
m_teja.texture = "terracotta_roof"
m_lomo = material("CA_TejaLomo", (0.36, 0.10, 0.04, 1.0), 0.8)
m_madera = material("CA_Madera", (0.13, 0.055, 0.025, 1.0), 0.7)
m_hierro = material("CA_Forja", (0.025, 0.025, 0.03, 1.0), 0.5, 0.8)
m_cristal = material("CA_Cristal", (0.45, 0.55, 0.62, 1.0), 0.05, alfa=0.35, barniz=1.0)
m_piedra = material("CA_Piedra", (0.42, 0.40, 0.37, 1.0), 0.85)
m_hoja = material("CA_Hojas", (0.06, 0.20, 0.035, 1.0), 0.85)
m_flor = material("CA_FlorRosa", (0.75, 0.08, 0.22, 1.0), 0.7)
m_bugan = material("CA_Buganvilla", (0.45, 0.04, 0.38, 1.0), 0.75)
m_barro = material("CA_Maceta", (0.45, 0.14, 0.05, 1.0), 0.85)
m_oscuro = material("CA_Interior", (0.03, 0.03, 0.035, 1.0), 0.9)

# ==========================================
# 2. MEDIDAS
# ==========================================
AN = 9.6      # ancho fachada (X)
FO = 7.0      # fondo (Y)
H = 6.3       # altura del alero
XA = AN / 2
YA = FO / 2
YF = -YA      # plano de la fachada principal
YT = YA       # plano de la fachada trasera

# ==========================================
# 3. MUROS Y SUELO
# ==========================================
caja("CA_Muros", (0, 0, H / 2), (AN, FO, H), m_cal)
caja("CA_Suelo", (0, -0.6, -0.04), (AN + 4.0, FO + 5.0, 0.08), m_piedra)
caja("CA_Umbral", (0, YF - 0.55, 0.04), (3.4, 1.1, 0.08), m_piedra)

# ==========================================
# 4. CUBIERTA A CUATRO AGUAS (una sola malla)
# ==========================================
V = 0.55            # vuelo del alero
GR = 0.18           # canto del alero
ex = XA + V
ey = YA + V
ZT = H + 0.30       # cara superior del alero
ZB = ZT - GR        # cara inferior
ALT = 1.7           # altura de la cubierta sobre el alero
lc = ex - ey        # media cumbrera (pendientes iguales)
ZC = ZT + ALT
verts = [
    (-ex, -ey, ZT), (ex, -ey, ZT), (ex, ey, ZT), (-ex, ey, ZT),   # 0-3 borde superior
    (-ex, -ey, ZB), (ex, -ey, ZB), (ex, ey, ZB), (-ex, ey, ZB),   # 4-7 borde inferior
    (-lc, 0, ZC), (lc, 0, ZC),                                      # 8-9 cumbrera
]
caras = [
    (0, 1, 9, 8),      # faldón delantero
    (2, 3, 8, 9),      # faldón trasero
    (1, 2, 9),         # faldón derecho
    (3, 0, 8),         # faldón izquierdo
    (4, 5, 1, 0), (5, 6, 2, 1), (6, 7, 3, 2), (7, 4, 0, 3),   # canto del alero
    (7, 6, 5, 4),      # sofito
]
malla = bpy.data.meshes.new("CA_Cubierta")
malla.from_pydata(verts, [], caras)
cub = bpy.data.objects.new("CA_Cubierta", malla)
bpy.context.collection.objects.link(cub)
asignar_mat(cub, m_teja)

# Lomos de teja en cumbrera y limas
RL = 0.11
barra("CA_Lomo_Cumbrera", (-lc - 0.05, 0, ZC + 0.03), (lc + 0.05, 0, ZC + 0.03), RL, m_lomo, 8)
esquinas = [(-ex, -ey, -lc), (ex, -ey, lc), (ex, ey, lc), (-ex, ey, -lc)]
for i in range(4):
    e = esquinas[i]
    barra("CA_Lomo_Lima_" + str(i), (e[0], e[1], ZT + 0.03), (e[2], 0, ZC + 0.03), RL, m_lomo, 8)
# Tejas de cobija en el borde del alero (fila de canalones vista en alzado)
for i in range(4):
    e0 = verts[i]
    e1 = verts[(i + 1) % 4]
    barra("CA_Lomo_Alero_" + str(i), (e0[0], e0[1], ZT + 0.02), (e1[0], e1[1], ZT + 0.02), 0.07, m_lomo, 6)

# Filas de teja árabe (cobijas) bajando por cada faldón: dan el rayado de las tejas
# del dibujo con muy pocos triángulos. Limas a 45 grados porque las pendientes son iguales.
PASO = 0.36
RC = 0.065
SUB = 0.05
pend = ALT / ey
nf = int(2 * ex / PASO)
for i in range(nf):
    x = -ex + PASO / 2 + i * PASO
    yt = ex - abs(x) - ey
    if yt > 0:
        yt = 0
    if yt + ey > 0.25:
        for s in [-1, 1]:
            a = (x, s * (ey + 0.02), ZT + SUB)
            b = (x, s * (-yt), ZT + (yt + ey) * pend + SUB)
            barra("CA_Cobija_" + str(s) + "_" + str(i), a, b, RC, m_lomo, 5)
nl = int(2 * ey / PASO)
for i in range(nl):
    y = -ey + PASO / 2 + i * PASO
    d = ey - abs(y)
    if d > 0.25:
        for s in [-1, 1]:
            a = (s * (ex + 0.02), y, ZT + SUB)
            b = (s * (ex - d), y, ZT + d * pend + SUB)
            barra("CA_CobijaL_" + str(s) + "_" + str(i), a, b, RC, m_lomo, 5)

# Canecillos de madera bajo el alero
n = 12
for i in range(n):
    x = -XA + 0.35 + i * (AN - 0.7) / (n - 1)
    caja("CA_Canecillo_F_" + str(i), (x, YF - 0.25, ZB - 0.06), (0.12, 0.5, 0.12), m_madera)
    caja("CA_Canecillo_T_" + str(i), (x, YT + 0.25, ZB - 0.06), (0.12, 0.5, 0.12), m_madera)
n = 8
for i in range(n):
    y = -YA + 0.35 + i * (FO - 0.7) / (n - 1)
    caja("CA_Canecillo_I_" + str(i), (-XA - 0.25, y, ZB - 0.06), (0.5, 0.12, 0.12), m_madera)
    caja("CA_Canecillo_D_" + str(i), (XA + 0.25, y, ZB - 0.06), (0.5, 0.12, 0.12), m_madera)
# Viga de remate bajo el alero (sombra marrón en el alzado)
caja("CA_Cornisa_F", (0, YF - 0.03, ZB - 0.02), (AN, 0.06, 0.12), m_madera)
caja("CA_Cornisa_T", (0, YT + 0.03, ZB - 0.02), (AN, 0.06, 0.12), m_madera)

# ==========================================
# 5. PIEZAS DE FACHADA
# ==========================================
def ventana(pref, x, yp, s, z0, ancho, alto, filas, cols):
    # s = -1 fachada principal, +1 trasera. Hueco oscuro, marco, cristal y travesaños.
    caja(pref + "_Hueco", (x, yp + s * 0.01, z0 + alto / 2), (ancho, 0.04, alto), m_oscuro)
    caja(pref + "_Cristal", (x, yp + s * 0.04, z0 + alto / 2), (ancho - 0.1, 0.02, alto - 0.1), m_cristal)
    g = 0.07
    caja(pref + "_MarcoA", (x, yp + s * 0.05, z0 + alto - g / 2), (ancho, 0.08, g), m_madera)
    caja(pref + "_MarcoB", (x, yp + s * 0.05, z0 + g / 2), (ancho, 0.08, g), m_madera)
    caja(pref + "_MarcoI", (x - ancho / 2 + g / 2, yp + s * 0.05, z0 + alto / 2), (g, 0.08, alto), m_madera)
    caja(pref + "_MarcoD", (x + ancho / 2 - g / 2, yp + s * 0.05, z0 + alto / 2), (g, 0.08, alto), m_madera)
    for c in range(1, cols):
        xc = x - ancho / 2 + c * ancho / cols
        caja(pref + "_Mont_" + str(c), (xc, yp + s * 0.05, z0 + alto / 2), (0.045, 0.05, alto), m_madera)
    for f in range(1, filas):
        zf = z0 + f * alto / filas
        caja(pref + "_Trav_" + str(f), (x, yp + s * 0.05, zf), (ancho, 0.05, 0.045), m_madera)

def reja(pref, x, yp, s, z0, ancho, alto):
    sal = 0.16
    nb = 7
    for i in range(nb):
        xb = x - ancho / 2 + 0.06 + i * (ancho - 0.12) / (nb - 1)
        barra(pref + "_Barrote_" + str(i), (xb, yp + s * sal, z0), (xb, yp + s * sal, z0 + alto), 0.016, m_hierro, 5)
    for k in range(3):
        zk = z0 + 0.05 + k * (alto - 0.1) / 2
        caja(pref + "_Pletina_" + str(k), (x, yp + s * sal, zk), (ancho, 0.03, 0.03), m_hierro)
    for lado in [-1, 1]:
        caja(pref + "_Brazo_" + str(lado), (x + lado * ancho / 2, yp + s * sal / 2, z0 + alto / 2), (0.03, sal, alto), m_hierro)

def macetero(pref, x, y, z, largo, fondo, flores=True):
    caja(pref + "_Jardinera", (x, y, z + 0.09), (largo, fondo, 0.18), m_barro)
    n = int(largo / 0.22)
    for i in range(n):
        xi = x - largo / 2 + 0.11 + i * (largo - 0.22) / max(1, n - 1)
        esfera(pref + "_Mata_" + str(i), (xi, y, z + 0.28), 0.16, m_hoja, (1.0, 0.9, 0.85), 7, 4)
        if flores and i % 2 == 0:
            esfera(pref + "_Flor_" + str(i), (xi + 0.05, y - 0.08, z + 0.38), 0.06, m_flor, (1, 1, 1), 6, 3)

def maceta(pref, x, y, r=0.18, alto=0.36, z=0.0):
    cono(pref + "_Tiesto", (x, y, z + alto / 2), r * 0.72, r, alto, m_barro, 10)
    esfera(pref + "_Mata", (x, y, z + alto + 0.12), r * 1.15, m_hoja, (1, 1, 0.8), 8, 5)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        esfera(pref + "_Geranio_" + str(k), (x + r * 0.75 * math.cos(a), y + r * 0.75 * math.sin(a), z + alto + 0.12 + r * 0.7), r * 0.42, m_flor, (1, 1, 1), 6, 3)

def balcon(pref, x, ancho, fondo, zs):
    # Losa con moldura, barandilla de forja y macetas sobre la losa
    caja(pref + "_Losa", (x, YF - fondo / 2, zs - 0.07), (ancho, fondo, 0.14), m_piedra)
    caja(pref + "_Moldura", (x, YF - (fondo - 0.08) / 2, zs - 0.2), (ancho - 0.12, fondo - 0.08, 0.12), m_cal)
    ha = 1.0
    yb = YF - fondo + 0.04
    caja(pref + "_Pasamanos_F", (x, yb, zs + ha), (ancho - 0.06, 0.05, 0.04), m_hierro)
    caja(pref + "_Zocalo_F", (x, yb, zs + 0.06), (ancho - 0.06, 0.03, 0.03), m_hierro)
    nb = int(ancho / 0.12)
    for i in range(nb + 1):
        xb = x - ancho / 2 + 0.03 + i * (ancho - 0.06) / nb
        barra(pref + "_Barrote_F_" + str(i), (xb, yb, zs), (xb, yb, zs + ha), 0.011, m_hierro, 4)
    for lado in [-1, 1]:
        xl = x + lado * (ancho / 2 - 0.03)
        caja(pref + "_Pasamanos_L" + str(lado), (xl, YF - fondo / 2, zs + ha), (0.04, fondo, 0.04), m_hierro)
        nl = 3
        for j in range(nl):
            yj = YF - 0.08 - j * (fondo - 0.12) / (nl - 1)
            barra(pref + "_Barrote_L" + str(lado) + "_" + str(j), (xl, yj, zs), (xl, yj, zs + ha), 0.011, m_hierro, 4)
    # Jardinera colgada por dentro de la barandilla
    macetero(pref + "_Jard", x, yb + 0.13, zs + 0.45, ancho - 0.3, 0.18)

# ---------- Planta alta, fachada principal: tres balcones ----------
ZB1 = 3.2
xs_alta = [-3.0, 0.0, 3.0]
for i in range(3):
    x = xs_alta[i]
    p = "CA_PA_" + str(i)
    ventana(p, x, YF, -1, ZB1, 1.1, 2.2, 3, 2)
    if i == 1:
        balcon(p + "_Balcon", x, 2.3, 0.55, ZB1)
    else:
        balcon(p + "_Balcon", x, 2.0, 0.55, ZB1)
        # macetas sueltas a los lados de la puerta-balcón
        for lado in [-1, 1]:
            maceta(p + "_Maceta" + str(lado), x + lado * 0.75, YF - 0.25, 0.1, 0.2, ZB1)
# ---------- Planta baja, fachada principal ----------
for i in range(2):
    x = -3.0 + i * 6.0
    p = "CA_PB_" + str(i)
    z0 = 0.95
    ventana(p, x, YF, -1, z0, 1.05, 1.4, 3, 2)
    # recercado de piedra con remate curvo
    caja(p + "_Alfeizar", (x, YF - 0.12, z0 - 0.08), (1.55, 0.24, 0.12), m_piedra)
    caja(p + "_RecercoI", (x - 0.68, YF - 0.03, z0 + 0.72), (0.18, 0.06, 1.6), m_piedra)
    caja(p + "_RecercoD", (x + 0.68, YF - 0.03, z0 + 0.72), (0.18, 0.06, 1.6), m_piedra)
    caja(p + "_RecercoA", (x, YF - 0.03, z0 + 1.55), (1.54, 0.06, 0.2), m_piedra)
    cilindro(p + "_Remate", (x, YF - 0.03, z0 + 1.62), 0.62, 0.06, m_piedra, 14, rot=(math.pi / 2, 0, 0))
    caja(p + "_RemateTapa", (x, YF - 0.03, z0 + 1.42), (1.3, 0.07, 0.25), m_cal)
    reja(p + "_Reja", x, YF, -1, z0 - 0.02, 1.2, 1.5)
    macetero(p + "_Jard", x, YF - 0.12, z0 - 0.02, 1.0, 0.18)

# Puerta principal de madera con dintel y clavos
caja("CA_Puerta_Hueco", (0, YF - 0.01, 1.15), (1.15, 0.04, 2.3), m_oscuro)
caja("CA_Puerta_HojaI", (-0.27, YF - 0.05, 1.12), (0.52, 0.07, 2.22), m_madera)
caja("CA_Puerta_HojaD", (0.27, YF - 0.05, 1.12), (0.52, 0.07, 2.22), m_madera)
for k in range(3):
    zk = 0.45 + k * 0.7
    caja("CA_Puerta_Peinazo_" + str(k), (0, YF - 0.095, zk), (1.04, 0.03, 0.07), m_hierro)
caja("CA_Puerta_Tirador", (0.12, YF - 0.11, 1.05), (0.03, 0.04, 0.16), m_hierro)
caja("CA_Puerta_Dintel", (0, YF - 0.09, 2.42), (1.6, 0.18, 0.2), m_madera)
caja("CA_Puerta_Escalon", (0, YF - 0.2, 0.06), (1.4, 0.4, 0.12), m_piedra)
maceta("CA_MacetaPuerta_I", -1.2, YF - 0.35, 0.2, 0.4)
maceta("CA_MacetaPuerta_D", 1.2, YF - 0.35, 0.2, 0.4)

# ---------- Fachada trasera ----------
for i in range(3):
    x = xs_alta[i]
    p = "CA_TA_" + str(i)
    ventana(p, x, YT, 1, 4.0, 1.0, 1.25, 2, 2)
    caja(p + "_Alfeizar", (x, YT + 0.08, 3.95), (1.15, 0.16, 0.08), m_piedra)
for i in range(2):
    x = -3.4 + i * 6.8
    p = "CA_TB_" + str(i)
    ventana(p, x, YT, 1, 0.95, 1.1, 1.35, 2, 2)
    reja(p + "_Reja", x, YT, 1, 0.9, 1.25, 1.45)
    caja(p + "_Alfeizar", (x, YT + 0.08, 0.88), (1.3, 0.16, 0.08), m_piedra)
caja("CA_PuertaT_Hueco", (0, YT + 0.01, 1.1), (1.0, 0.04, 2.2), m_oscuro)
caja("CA_PuertaT_Hoja", (0, YT + 0.05, 1.08), (0.92, 0.07, 2.14), m_madera)
caja("CA_PuertaT_Tirador", (-0.33, YT + 0.1, 1.05), (0.03, 0.04, 0.14), m_hierro)
caja("CA_PuertaT_Escalon", (0, YT + 0.2, 0.06), (1.2, 0.4, 0.12), m_piedra)

# ---------- Buganvillas en las esquinas delanteras (vistas laterales) ----------
for lado in [-1, 1]:
    xb = lado * (XA + 0.3)
    yb = YF + 0.35
    p = "CA_Buganvilla_" + str(lado)
    cono(p + "_Tiesto", (xb, yb, 0.22), 0.16, 0.24, 0.44, m_barro, 10)
    barra(p + "_Tronco", (xb, yb, 0.4), (xb + lado * 0.05, yb, 3.4), 0.05, m_madera, 5)
    for k in range(9):
        zk = 0.8 + k * 0.38
        dy = 0.25 * math.sin(k * 1.7)
        r = 0.32 - 0.012 * k
        esfera(p + "_Flor_" + str(k), (xb + lado * 0.05, yb + dy, zk), r, m_bugan, (0.8, 1.2, 1.0), 7, 4)
        if k % 2 == 0:
            esfera(p + "_Hoja_" + str(k), (xb + lado * 0.02, yb + dy - 0.2, zk + 0.15), r * 0.7, m_hoja, (0.8, 1, 1), 6, 4)
    esfera(p + "_Copa", (xb, yb + 0.1, 3.6), 0.4, m_bugan, (0.7, 1.4, 0.8), 8, 5)
