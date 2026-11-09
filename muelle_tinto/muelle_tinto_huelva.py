import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# MUELLE DEL TINTO (Muelle-Embarcadero de mineral de Riotinto, Huelva, 1874-1876)
# ==============================================================================
# Datos de la ficha BIC (BOJA 55, 2007) y de la historia del muelle:
# - Tramo metálico sobre la ría del Odiel: 577,6 m originales, unos 50 m
#   demolidos en 1974. Sale 200 m en perpendicular a la orilla, gira en una
#   curva amplia de 200 m de radio y acaba en un tramo recto de unos 170 m
#   orientado con la corriente y las mareas.
# - Se apoya en grupos de dobles hileras de cuatro pilares de fundición
#   (30 grupos, 60 hileras). Pilotes a 12 pies (3,66 m) en sentido transversal
#   y 15 pies (4,57 m) en sentido longitudinal.
# - Dos plataformas: la de arriba para los trenes de mineral (embarque por
#   gravedad, con cambio de agujas al final) y la de abajo para mercancías.
# - En tierra, viaducto de madera de pórticos pareados arriostrados en diagonal.
# Lo que no dan las fuentes (alturas exactas de los tableros, luces de las
# vigas, colores) es una aproximación a partir de fotografías del muelle restaurado.
# Ejes: X = hacia la ría (perpendicular a la orilla), Y = a lo largo de la orilla,
#       Z = altura. Medidas en metros. Agua en z = 0.
# Los colores van en valores lineales, como en Blender.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Luz baja y cálida de atardecer sobre la ría
bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.65, bloom=0.06)
bpy.ops.render.set_lighting(intensity=1.3, angle=28)
bpy.ops.render.set_ssao(intensity=1.2)

def material(nombre, color, rugosidad=0.6, metalico=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
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

def cilindro(nombre, centro, radio, alto, mat, vertices=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

# ==========================================
# 1. MATERIALES
# ==========================================
m_hierro = material("MT_Hierro_Fundicion", (0.042, 0.013, 0.008, 1.0), 0.6, 0.2)
m_hierro_osc = material("MT_Hierro_Arriostrado", (0.028, 0.009, 0.006, 1.0), 0.65, 0.2)
m_madera = material("MT_Tablazon_Madera", (0.15, 0.085, 0.042, 1.0), 0.75)
m_madera_vieja = material("MT_Madera_Viaducto", (0.20, 0.12, 0.065, 1.0), 0.85)
m_carril = material("MT_Carril_Acero", (0.30, 0.30, 0.31, 1.0), 0.35, 0.9)
m_barandilla = material("MT_Barandilla", (0.035, 0.035, 0.04, 1.0), 0.5, 0.5)
m_farola = material("MT_Farola_Luz", (1.0, 0.78, 0.42, 1.0), 0.3)
m_agua = material("MT_Ria_Odiel", (0.03, 0.045, 0.035, 1.0), 0.07)
m_tierra = material("MT_Marisma_Orilla", (0.14, 0.12, 0.07, 1.0), 0.95)
m_piedra = material("MT_Escollera", (0.22, 0.21, 0.19, 1.0), 0.9)
# La tablazón va sin textura: en tablas de 20 m la veta se estira y parece arena
m_madera_vieja.texture = "tree_bark"
m_tierra.texture = "desert_sand"
m_piedra.texture = "cobblestone"

# ==========================================
# 2. TRAZADO DEL TRAMO METÁLICO
# ==========================================
L_RECTO1 = 200.0
RADIO = 200.0
L_CURVA = 157.0          # 200 + 157 + 170 = 527 m que quedan tras 1974 (giro de 45 grados)
L_RECTO2 = 170.0
L_TOTAL = L_RECTO1 + L_CURVA + L_RECTO2
X_INICIO = 8.0           # el tramo metálico empieza poco después de la orilla
ANG_FINAL = L_CURVA / RADIO

def punto(s):
    # posición (x, y) y rumbo del eje del muelle a s metros del inicio del tramo metálico
    if s <= L_RECTO1:
        return [X_INICIO + s, 0.0, 0.0]
    if s <= L_RECTO1 + L_CURVA:
        a = (s - L_RECTO1) / RADIO
        return [X_INICIO + L_RECTO1 + RADIO * math.sin(a), RADIO * (1 - math.cos(a)), a]
    d = s - L_RECTO1 - L_CURVA
    xc = X_INICIO + L_RECTO1 + RADIO * math.sin(ANG_FINAL)
    yc = RADIO * (1 - math.cos(ANG_FINAL))
    return [xc + d * math.cos(ANG_FINAL), yc + d * math.sin(ANG_FINAL), ANG_FINAL]

def lateral(p, w):
    # desplaza w metros a la izquierda del eje (perpendicular al rumbo)
    return [p[0] - w * math.sin(p[2]), p[1] + w * math.cos(p[2])]

# Alturas de los tableros
Z_LECHO = -2.5          # los pilares se hunden en la ría
Z_INFERIOR = 5.0        # plataforma de mercancías
Z_SUPERIOR = 10.5       # plataforma de los trenes de mineral
ANCHO = 11.8
COLS = [-5.49, -1.83, 1.83, 5.49]     # 4 pilares a 12 pies
MEDIA_FILA = 2.285                    # 15 pies entre las dos hileras de un grupo

# ==========================================
# 3. GRUPOS DE PILARES DE FUNDICIÓN
# ==========================================
N_GRUPOS = 28
paso = L_TOTAL / (N_GRUPOS - 1)

def diagonal_transversal(nombre, p, w1, w2, z1, z2, mat):
    # tirante en el plano de una hilera (perpendicular al eje)
    a = lateral(p, (w1 + w2) / 2)
    largo = math.sqrt((w2 - w1) * (w2 - w1) + (z2 - z1) * (z2 - z1))
    giro = math.atan2(z2 - z1, w2 - w1)
    caja(nombre, (a[0], a[1], (z1 + z2) / 2), (0.09, largo, 0.09), mat, rot=(giro, 0, p[2]))

def diagonal_longitudinal(nombre, s1, s2, w, z1, z2, mat):
    # tirante a lo largo del eje entre dos hileras
    p1 = punto(s1)
    p2 = punto(s2)
    a = lateral(p1, w)
    b = lateral(p2, w)
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    horiz = math.sqrt(dx * dx + dy * dy)
    largo = math.sqrt(horiz * horiz + (z2 - z1) * (z2 - z1))
    cabeceo = -math.atan2(z2 - z1, horiz)
    rumbo = math.atan2(dy, dx)
    caja(nombre, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z1 + z2) / 2), (largo, 0.09, 0.09), mat, rot=(0, cabeceo, rumbo))

for g in range(N_GRUPOS):
    sg = g * paso
    for f in range(2):
        sf = sg - MEDIA_FILA + 2 * MEDIA_FILA * f
        p = punto(sf)
        etiqueta = "MT_G" + str(g) + "_F" + str(f)
        for c in range(4):
            q = lateral(p, COLS[c])
            alto = Z_SUPERIOR - 0.6 - Z_LECHO
            cilindro(etiqueta + "_Pilar_" + str(c), (q[0], q[1], Z_LECHO + alto / 2), 0.26, alto, m_hierro)
            # anillos de fundición a la altura de cada tablero
            cilindro(etiqueta + "_Anillo_" + str(c), (q[0], q[1], Z_INFERIOR - 0.45), 0.36, 0.22, m_hierro, vertices=8)
        # cabezales transversales que reciben las vigas de cada tablero
        caja(etiqueta + "_Cabezal_Inf", (p[0], p[1], Z_INFERIOR - 0.35), (0.35, ANCHO, 0.5), m_hierro, rot=(0, 0, p[2]))
        caja(etiqueta + "_Cabezal_Sup", (p[0], p[1], Z_SUPERIOR - 0.45), (0.35, ANCHO, 0.55), m_hierro, rot=(0, 0, p[2]))
        # cruces de San Andrés entre pilares (bajo el tablero inferior y entre tableros)
        for v in range(3):
            w1 = COLS[v]
            w2 = COLS[v + 1]
            diagonal_transversal(etiqueta + "_CruzA_" + str(v), p, w1, w2, 0.6, Z_INFERIOR - 0.7, m_hierro_osc)
            diagonal_transversal(etiqueta + "_CruzB_" + str(v), p, w2, w1, 0.6, Z_INFERIOR - 0.7, m_hierro_osc)
            diagonal_transversal(etiqueta + "_CruzC_" + str(v), p, w1, w2, Z_INFERIOR + 0.3, Z_SUPERIOR - 0.8, m_hierro_osc)
            diagonal_transversal(etiqueta + "_CruzD_" + str(v), p, w2, w1, Z_INFERIOR + 0.3, Z_SUPERIOR - 0.8, m_hierro_osc)
    # arriostrado entre las dos hileras del grupo, en los pilares exteriores
    for lado in range(2):
        w = COLS[0]
        if lado == 1:
            w = COLS[3]
        e = "MT_G" + str(g) + "_Long" + str(lado)
        diagonal_longitudinal(e + "_A", sg - MEDIA_FILA, sg + MEDIA_FILA, w, 0.6, Z_INFERIOR - 0.7, m_hierro_osc)
        diagonal_longitudinal(e + "_B", sg + MEDIA_FILA, sg - MEDIA_FILA, w, 0.6, Z_INFERIOR - 0.7, m_hierro_osc)
        diagonal_longitudinal(e + "_C", sg - MEDIA_FILA, sg + MEDIA_FILA, w, Z_INFERIOR + 0.3, Z_SUPERIOR - 0.8, m_hierro_osc)
        diagonal_longitudinal(e + "_D", sg + MEDIA_FILA, sg - MEDIA_FILA, w, Z_INFERIOR + 0.3, Z_SUPERIOR - 0.8, m_hierro_osc)

# ==========================================
# 4. VANOS: VIGAS DE CELOSÍA, TABLEROS, VÍAS Y BARANDILLAS
# ==========================================
def pieza_vano(nombre, s1, s2, w, z, ancho, alto, mat, solape=0.0):
    # pieza recta entre dos puntos del eje (en la curva, como cuerda), desplazada w a un lado
    p1 = punto(s1)
    p2 = punto(s2)
    a = lateral(p1, w)
    b = lateral(p2, w)
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    largo = math.sqrt(dx * dx + dy * dy) + solape
    caja(nombre, ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z), (largo, ancho, alto), mat, rot=(0, 0, math.atan2(dy, dx)))

PANELES = 6
for g in range(N_GRUPOS - 1):
    s1 = g * paso
    s2 = (g + 1) * paso
    e = "MT_V" + str(g)
    # Vigas de celosía en los bordes del tablero superior (cordón alto, cordón bajo y diagonales en zigzag)
    for lado in range(2):
        w = COLS[0]
        if lado == 1:
            w = COLS[3]
        pieza_vano(e + "_CordonSup_" + str(lado), s1, s2, w, Z_SUPERIOR - 0.12, 0.3, 0.22, m_hierro, 0.4)
        pieza_vano(e + "_CordonInf_" + str(lado), s1, s2, w, Z_SUPERIOR - 1.25, 0.3, 0.2, m_hierro, 0.4)
        for k in range(PANELES):
            sa = s1 + (s2 - s1) * k / PANELES
            sb = s1 + (s2 - s1) * (k + 1) / PANELES
            if k % 2 == 0:
                diagonal_longitudinal(e + "_Celosia_" + str(lado) + "_" + str(k), sa, sb, w, Z_SUPERIOR - 1.25, Z_SUPERIOR - 0.12, m_hierro)
            else:
                diagonal_longitudinal(e + "_Celosia_" + str(lado) + "_" + str(k), sa, sb, w, Z_SUPERIOR - 0.12, Z_SUPERIOR - 1.25, m_hierro)
        # viga de borde del tablero inferior
        pieza_vano(e + "_VigaInf_" + str(lado), s1, s2, w, Z_INFERIOR - 0.35, 0.3, 0.55, m_hierro, 0.4)
    # vigas interiores bajo los dos tableros
    for c in range(1, 3):
        pieza_vano(e + "_VigaSupInt_" + str(c), s1, s2, COLS[c], Z_SUPERIOR - 0.45, 0.28, 0.5, m_hierro_osc, 0.4)
        pieza_vano(e + "_VigaInfInt_" + str(c), s1, s2, COLS[c], Z_INFERIOR - 0.35, 0.28, 0.45, m_hierro_osc, 0.4)
    # tableros de madera (el solape tapa las juntas en la curva)
    pieza_vano(e + "_TableroSup", s1, s2, 0.0, Z_SUPERIOR + 0.08, ANCHO, 0.16, m_madera, 0.9)
    pieza_vano(e + "_TableroInf", s1, s2, 0.0, Z_INFERIOR + 0.0, ANCHO, 0.16, m_madera, 0.9)
    # dos vías de ancho métrico inglés (1.067 mm) en la plataforma de mineral
    for via in range(2):
        eje = -2.1 + 4.2 * via
        pieza_vano(e + "_Carril_" + str(via) + "a", s1, s2, eje - 0.533, Z_SUPERIOR + 0.22, 0.07, 0.12, m_carril, 0.6)
        pieza_vano(e + "_Carril_" + str(via) + "b", s1, s2, eje + 0.533, Z_SUPERIOR + 0.22, 0.07, 0.12, m_carril, 0.6)
    # barandillas en los dos tableros
    for lado in range(2):
        w = ANCHO / 2 - 0.1
        if lado == 1:
            w = -w
        for nivel in range(2):
            zb = Z_SUPERIOR + 0.16
            if nivel == 1:
                zb = Z_INFERIOR + 0.08
            n = "_" + str(lado) + "_" + str(nivel)
            pieza_vano(e + "_Pasamanos" + n, s1, s2, w, zb + 1.05, 0.07, 0.07, m_barandilla, 0.5)
            pieza_vano(e + "_Travesano" + n, s1, s2, w, zb + 0.55, 0.04, 0.04, m_barandilla, 0.5)
            for k in range(5):
                pk = punto(s1 + (s2 - s1) * (k + 0.5) / 5)
                q = lateral(pk, w)
                caja(e + "_Balaustre" + n + "_" + str(k), (q[0], q[1], zb + 0.52), (0.06, 0.06, 1.05), m_barandilla, rot=(0, 0, pk[2]))
    # farolas en la plataforma superior cada tres vanos
    if g % 3 == 1:
        for lado in range(2):
            w = ANCHO / 2 - 0.35
            if lado == 1:
                w = -w
            pm = punto((s1 + s2) / 2)
            q = lateral(pm, w)
            cilindro(e + "_Farola_Poste_" + str(lado), (q[0], q[1], Z_SUPERIOR + 2.2), 0.07, 4.2, m_barandilla, vertices=8)
            esfera(e + "_Farola_Luz_" + str(lado), (q[0], q[1], Z_SUPERIOR + 4.45), 0.28, m_farola)

# ==========================================
# 5. CABEZA DEL MUELLE: CAMBIO DE AGUJAS DEL EMBARQUE POR GRAVEDAD
# ==========================================
s_fin = L_TOTAL
p_fin = punto(s_fin)
caja("MT_Cabeza_Tope", (p_fin[0] + 0.3 * math.cos(p_fin[2]), p_fin[1] + 0.3 * math.sin(p_fin[2]), Z_SUPERIOR + 0.6), (0.5, ANCHO, 1.0), m_hierro, rot=(0, 0, p_fin[2]))
for via in range(2):
    eje = -2.1 + 4.2 * via
    q = lateral(p_fin, eje)
    caja("MT_Cabeza_Paragolpes_" + str(via), (q[0] - 0.6 * math.cos(p_fin[2]), q[1] - 0.6 * math.sin(p_fin[2]), Z_SUPERIOR + 0.55), (0.4, 1.4, 0.5), m_madera_vieja, rot=(0, 0, p_fin[2]))
# carriles cruzados del cambio de agujas en el último vano
s_cambio = L_TOTAL - paso * 1.5
for k in range(2):
    pa = punto(s_cambio + k * paso * 0.45)
    pb = punto(s_cambio + (k + 1) * paso * 0.45)
    a = lateral(pa, -2.1 + 4.2 * k / 2)
    b = lateral(pb, -2.1 + 4.2 * (k + 1) / 2)
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    caja("MT_Cambio_Agujas_" + str(k), ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Z_SUPERIOR + 0.24), (math.sqrt(dx * dx + dy * dy), 0.07, 0.12), m_carril, rot=(0, 0, math.atan2(dy, dx)))

# ==========================================
# 6. VIADUCTO DE MADERA EN TIERRA (pórticos pareados arriostrados)
# ==========================================
N_PORTICOS = 9
for i in range(N_PORTICOS):
    xp = X_INICIO - 6.0 - i * 11.0
    for par in range(2):
        xx = xp - par * 2.6
        e = "MT_Viaducto_" + str(i) + "_" + str(par)
        for c in range(4):
            yy = -3.6 + c * 2.4
            caja(e + "_PieDerecho_" + str(c), (xx, yy, 1.5 + (Z_SUPERIOR - 1.9) / 2), (0.45, 0.45, Z_SUPERIOR - 1.9), m_madera_vieja)
        caja(e + "_Jacena", (xx, 0, Z_SUPERIOR - 0.3), (0.5, 9.0, 0.6), m_madera_vieja)
        caja(e + "_Riostra_A", (xx, -1.8, 5.8), (0.18, 0.18, 9.6), m_madera_vieja, rot=(0.62, 0, 0))
        caja(e + "_Riostra_B", (xx, 1.8, 5.8), (0.18, 0.18, 9.6), m_madera_vieja, rot=(-0.62, 0, 0))
    # zapatas y largueros entre pórticos
    caja("MT_Viaducto_Tablero_" + str(i), (xp - 5.5, 0, Z_SUPERIOR + 0.08), (11.6, 7.4, 0.2), m_madera)
    for via in range(2):
        yv = -1.4 + 2.8 * via
        caja("MT_Viaducto_Carril_" + str(i) + "_" + str(via) + "a", (xp - 5.5, yv - 0.533, Z_SUPERIOR + 0.24), (11.6, 0.07, 0.12), m_carril)
        caja("MT_Viaducto_Carril_" + str(i) + "_" + str(via) + "b", (xp - 5.5, yv + 0.533, Z_SUPERIOR + 0.24), (11.6, 0.07, 0.12), m_carril)
    for lado in range(2):
        yb = 3.6
        if lado == 1:
            yb = -3.6
        caja("MT_Viaducto_Pasamanos_" + str(i) + "_" + str(lado), (xp - 5.5, yb, Z_SUPERIOR + 1.2), (11.6, 0.07, 0.07), m_barandilla)

# ==========================================
# 7. RÍA DEL ODIEL Y ORILLA
# ==========================================
caja("MT_Ria_Agua", (255, 100, -0.6), (530, 330, 1.2), m_agua)
caja("MT_Orilla_Marisma", (-55, 100, 0.7), (110, 330, 1.6), m_tierra)
caja("MT_Orilla_Escollera", (1.5, 100, 0.2), (3.0, 330, 1.4), m_piedra, rot=(0, 0.5, 0))

# Enlace entre el viaducto de madera y el primer grupo de pilares
caja("MT_Enlace_Tablero", (5.1, 0, Z_SUPERIOR + 0.08), (6.6, 9.0, 0.2), m_madera)
caja("MT_Enlace_Viga_A", (5.1, -3.9, Z_SUPERIOR - 0.45), (6.6, 0.3, 0.6), m_hierro)
caja("MT_Enlace_Viga_B", (5.1, 3.9, Z_SUPERIOR - 0.45), (6.6, 0.3, 0.6), m_hierro)
