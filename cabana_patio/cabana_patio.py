import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# CABAÑA DE TRONCOS CON PATIO Y FUENTE (texturas fotográficas del usuario)
# ==============================================================================
# La cabaña de cabana_espectacular/ con los materiales cambiados por las texturas de las cinco
# láminas del usuario (guardadas en public/textures/<grupo>_tNN.jpg) y un patio delante:
# suelo empedrado, muro bajo de canto rodado con puerta y pilares con farol, fuente de piedra
# de dos tazas con chorro y cortina de agua, bancos, jardineras con flores y un árbol.
# Texturas: madera_cabana_t07 (troncos), madera_cabana_t01 (tablas), madera_cabana_t08 (corteza),
# tejado_t03 (tablillas), piedra_pared_t01 (zócalo y chimenea), piedra_pared_t05 (muro del patio),
# piedra_pared_t08 y t06 (fuente), suelo_piedras_t02 (patio), suelo_piedras_t08 (entrada),
# suelo_piedras_t03 (tierra de jardineras), agua_t03 / agua_t01 / agua_t07 (agua de la fuente).
# Ejes: X = ancho, Y = fondo (la fachada, el porche y el patio miran a Y negativo), Z = altura.
# Medidas en metros. Colores lineales, como en Blender.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.55, bloom=0.08)
bpy.ops.render.set_lighting(intensity=1.35, angle=28)
bpy.ops.render.set_ssao(intensity=1.3)

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

def cilindro(nombre, centro, radio, alto, mat, vertices=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0), segmentos=10, anillos=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def viga(nombre, a, b, grosor, mat):
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dy * dy)
    largo = math.sqrt(horiz * horiz + dz * dz)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    return caja(nombre, centro, (largo, grosor, grosor), mat, rot=(0, -math.atan2(dz, horiz), math.atan2(dy, dx)))

# pseudoazar fijo: el modelo sale igual cada vez
semilla = [12345]
def azar():
    semilla[0] = (semilla[0] * 1103515245 + 12345) % 2147483648
    return semilla[0] / 2147483648.0

def entre(a, b):
    return a + (b - a) * azar()

# ==========================================
# 1. MATERIALES (fotos del usuario; color blanco para no oscurecer la foto)
# ==========================================
def foto(nombre, imagen, metros, rugosidad=0.85, alfa=1.0, barniz=0.0, tinte=(1.0, 1.0, 1.0, 1.0)):
    mat = material(nombre, tinte, rugosidad, alfa=alfa, barniz=barniz)
    mat.color_map = imagen
    mat.color_map_scale = metros
    return mat

m_tronco = foto("CB_Troncos", "madera_cabana_t07", 1.6)
m_tabla = foto("CB_Tablas", "madera_cabana_t01", 1.2)
m_tejado = foto("CB_Tablillas", "tejado_t03", 1.4)
m_tejado2 = foto("CB_Tablillas_Musgo", "tejado_t03", 1.4, tinte=(0.55, 0.75, 0.45, 1.0))
m_piedra = foto("CB_Piedra", "piedra_pared_t01", 1.3, 0.9)
m_hierro = material("CB_Hierro", (0.03, 0.03, 0.032, 1.0), 0.45, 1.0)
m_ventana = material("CB_Ventana_Luz", (1.0, 0.5, 0.16, 1.0), 0.3, emision=2.2)
m_farol = material("CB_Farol_Luz", (1.0, 0.45, 0.12, 1.0), 0.2, emision=3.0)
m_hierba = material("CB_Hierba", (0.09, 0.17, 0.035, 1.0), 0.95)
m_hierba.texture = "grass_meadow"
m_hojas = material("CB_Hojas", (0.03, 0.10, 0.03, 1.0), 0.9)
m_hojas.texture = "moss_nature"
m_corteza = foto("CB_Corteza", "madera_cabana_t08", 1.0, 0.95)
m_flor_roja = material("CB_Flor_Roja", (0.65, 0.05, 0.04, 1.0), 0.6)
m_flor_amarilla = material("CB_Flor_Amarilla", (0.85, 0.55, 0.05, 1.0), 0.6)
m_humo = material("CB_Humo", (0.55, 0.55, 0.58, 1.0), 1.0, alfa=0.35)
# patio y fuente
m_patio = foto("CP_Suelo_Patio", "suelo_piedras_t02", 1.8, 0.9)
m_entrada = foto("CP_Suelo_Entrada", "suelo_piedras_t08", 2.0, 0.9)
m_muro = foto("CP_Muro", "piedra_pared_t05", 1.1, 0.9)
m_albardilla = foto("CP_Albardilla", "piedra_pared_t08", 0.9, 0.85)
m_fuente = foto("CP_Fuente_Piedra", "piedra_pared_t06", 1.0, 0.85)
m_tierra = foto("CP_Tierra", "suelo_piedras_t03", 1.2, 0.95)
m_agua = foto("CP_Agua", "agua_t03", 1.6, 0.05, alfa=0.82, barniz=1.0)
m_agua_alta = foto("CP_Agua_Taza", "agua_t01", 0.9, 0.05, alfa=0.8, barniz=1.0)
m_chorro = foto("CP_Chorro", "agua_t07", 0.6, 0.1, alfa=0.55, barniz=1.0)
m_cortina = foto("CP_Cortina", "agua_t01", 0.5, 0.05, alfa=0.22, barniz=1.0)

# ==========================================
# 2. MEDIDAS DE LA CABAÑA
# ==========================================
MX = 3.0          # media anchura (X) entre ejes de las paredes
MY = 2.25         # media profundidad (Y)
Z0 = 0.5          # alto del zócalo de piedra
R = 0.15          # radio de los troncos
PASO = 0.28       # separación entre hileras de una misma pared
FILAS = 9
SOBRA = 0.38      # lo que asoman los troncos en las esquinas cruzadas
Z_TOPE = Z0 + FILAS * PASO
ALTO_TEJADO = 1.9
Z_CUMBRE = Z_TOPE + ALTO_TEJADO
VOLADO = 0.65

# huecos [desde, hasta, z_abajo, z_arriba]
huecos_frente = [[-0.55, 0.55, Z0, Z0 + 2.05], [-2.25, -1.15, Z0 + 0.8, Z0 + 1.75], [1.15, 2.25, Z0 + 0.8, Z0 + 1.75]]
huecos_fondo = [[-0.6, 0.6, Z0 + 0.8, Z0 + 1.7]]
huecos_izq = [[-0.55, 0.55, Z0 + 0.8, Z0 + 1.7]]
huecos_der = []

def tramos(a0, a1, z, huecos):
    # quita del tronco [a0, a1] los huecos que corta a la altura z
    lista = [[a0, a1]]
    for h in huecos:
        if z + R * 0.6 > h[2] and z - R * 0.6 < h[3]:
            nueva = []
            for s in lista:
                if h[1] <= s[0] or h[0] >= s[1]:
                    nueva.append(s)
                else:
                    if h[0] - s[0] > 0.12:
                        nueva.append([s[0], h[0]])
                    if s[1] - h[1] > 0.12:
                        nueva.append([h[1], s[1]])
            lista = nueva
    return lista

def tronco_x(nombre, x0, x1, y, z, mat):
    largo = x1 - x0
    t = cilindro(nombre, ((x0 + x1) / 2, y, z), R, largo, mat, 12, rot=(0, math.pi / 2, 0))
    return t

def tronco_y(nombre, y0, y1, x, z, mat):
    largo = y1 - y0
    return cilindro(nombre, (x, (y0 + y1) / 2, z), R, largo, mat, 12, rot=(math.pi / 2, 0, 0))

# ==========================================
# 3. SUELO, ZÓCALO Y PAREDES DE TRONCOS
# ==========================================
caja("CB_Suelo", (0, -4.6, -0.05), (16.0, 20.0, 0.1), m_hierba)
caja("CB_Zocalo", (0, 0, Z0 / 2), (2 * MX + 0.5, 2 * MY + 0.5, Z0), m_piedra)
caja("CB_Zocalo_Remate", (0, 0, Z0 - 0.03), (2 * MX + 0.62, 2 * MY + 0.62, 0.06), m_piedra)

for i in range(FILAS):
    zf = Z0 + R + i * PASO
    zl = zf + PASO / 2
    for lado in [-1, 1]:
        huecos = huecos_frente
        if lado == 1:
            huecos = huecos_fondo
        ts = tramos(-MX - SOBRA, MX + SOBRA, zf, huecos)
        for k in range(len(ts)):
            tronco_x("CB_Tronco_F" + str(lado) + "_" + str(i) + "_" + str(k), ts[k][0], ts[k][1], lado * MY, zf, m_tronco)
        huecos = huecos_izq
        if lado == 1:
            huecos = huecos_der
        if zl < Z_TOPE:
            ts = tramos(-MY - SOBRA, MY + SOBRA, zl, huecos)
            for k in range(len(ts)):
                tronco_y("CB_Tronco_L" + str(lado) + "_" + str(i) + "_" + str(k), ts[k][0], ts[k][1], lado * MX, zl, m_tronco)

# hastiales: troncos cada vez más cortos bajo el tejado (paredes laterales)
pendiente = ALTO_TEJADO / (MY + VOLADO)
j = 0
z = Z_TOPE + PASO / 2
while z < Z_CUMBRE - 0.25:
    media = (Z_CUMBRE - z) / pendiente - 0.15
    if media > MY + 0.1:
        media = MY + 0.1
    for lado in [-1, 1]:
        tronco_y("CB_Hastial_" + str(lado) + "_" + str(j), -media, media, lado * MX, z, m_tronco)
    z = z + PASO
    j = j + 1

# ==========================================
# 4. TEJADO DE TABLILLAS A DOS AGUAS (cumbrera a lo largo de X)
# ==========================================
semi = MY + VOLADO
theta = math.atan2(ALTO_TEJADO, semi)
faldon = math.hypot(semi, ALTO_TEJADO)
largo_tejado = 2 * MX + 2 * VOLADO + 0.4
for lado in [-1, 1]:
    rx = -lado * theta
    # tablero
    d = semi / 2
    caja("CB_Tablero_" + str(lado), (0, lado * d, Z_CUMBRE - d * math.tan(theta) - 0.06), (largo_tejado, faldon, 0.12), m_tabla, rot=(rx, 0, 0))
    # hileras de tablillas, de alero a cumbrera, con juntas alternas
    n = 10
    for k in range(n):
        s = (k + 0.5) / n
        yy = lado * semi * (1 - s)
        zz = Z_TOPE + s * ALTO_TEJADO + 0.06
        desfase = 0.0
        if k % 2 == 1:
            desfase = 0.35
        x = -largo_tejado / 2 + desfase
        p = 0
        while x < largo_tejado / 2 - 0.05:
            ancho = 0.7
            if x + ancho > largo_tejado / 2:
                ancho = largo_tejado / 2 - x
            mat = m_tejado
            if azar() < 0.22:
                mat = m_tejado2
            caja("CB_Tablilla_" + str(lado) + "_" + str(k) + "_" + str(p), (x + ancho / 2, yy, zz + entre(-0.01, 0.015)), (ancho - 0.03, faldon / n * 1.25, 0.05), mat, rot=(rx + lado * 0.05, entre(-0.02, 0.02), 0))
            x = x + ancho
            p = p + 1
    # tabla de remate en el alero y en los bordes del hastial
    caja("CB_Alero_" + str(lado), (0, lado * (semi + 0.02), Z_TOPE - 0.05), (largo_tejado, 0.06, 0.2), m_tabla)
    for e in [-1, 1]:
        viga("CB_Guardavientos_" + str(lado) + "_" + str(e), (e * (largo_tejado / 2 + 0.02), lado * (semi + 0.05), Z_TOPE - 0.02), (e * (largo_tejado / 2 + 0.02), 0, Z_CUMBRE + 0.08), 0.14, m_tabla)
cilindro("CB_Cumbrera", (0, 0, Z_CUMBRE + 0.06), 0.13, largo_tejado + 0.1, m_tronco, 10, rot=(0, math.pi / 2, 0))

# ==========================================
# 5. CHIMENEA DE PIEDRA CON HUMO (pared derecha, +X)
# ==========================================
cx = MX + 0.55
cy = 0.9
caja("CB_Chimenea_Base", (cx, cy, 1.15), (0.95, 1.15, 2.3), m_piedra)
caja("CB_Chimenea_Hombro", (cx - 0.05, cy, 2.45), (0.8, 0.95, 0.4), m_piedra, rot=(0, 0.18, 0))
caja("CB_Chimenea_Tiro", (cx - 0.12, cy, (2.6 + Z_CUMBRE + 0.9) / 2), (0.62, 0.7, Z_CUMBRE + 0.9 - 2.6), m_piedra)
caja("CB_Chimenea_Remate", (cx - 0.12, cy, Z_CUMBRE + 0.95), (0.78, 0.86, 0.12), m_piedra)
for k in range(5):
    r = 0.22 + k * 0.09
    esfera("CB_Humo_" + str(k), (cx - 0.12 + k * 0.18, cy + k * 0.07, Z_CUMBRE + 1.25 + k * 0.42), r, m_humo, (1.0, 1.0, 0.8), 10, 6)

# ==========================================
# 6. PUERTA Y VENTANAS (iluminadas por dentro)
# ==========================================
yf = -MY - R
caja("CB_Puerta", (0, yf + 0.06, Z0 + 1.0), (1.0, 0.08, 2.0), m_tabla)
for k in range(4):
    caja("CB_Puerta_Tabla_" + str(k), (-0.375 + k * 0.25, yf + 0.0, Z0 + 1.0), (0.02, 0.04, 1.95), m_tronco)
for k in range(2):
    caja("CB_Bisagra_" + str(k), (-0.25, yf - 0.03, Z0 + 0.45 + k * 1.1), (0.55, 0.02, 0.07), m_hierro)
esfera("CB_Pomo", (0.38, yf - 0.06, Z0 + 1.0), 0.05, m_hierro)
caja("CB_Dintel_Puerta", (0, yf, Z0 + 2.12), (1.35, 0.3, 0.2), m_tabla)
for e in [-1, 1]:
    caja("CB_Jamba_" + str(e), (e * 0.6, yf, Z0 + 1.02), (0.12, 0.3, 2.05), m_tabla)

def ventana(prefijo, centro, ancho, alto, eje, sale):
    # eje "y" = ventana en pared frontal/trasera (cara mira a -Y o +Y); "x" = pared lateral
    cxv = centro[0]
    cyv = centro[1]
    czv = centro[2]
    if eje == "y":
        caja(prefijo + "_Luz", (cxv, cyv, czv), (ancho, 0.06, alto), m_ventana)
        caja(prefijo + "_Parteluz_V", (cxv, cyv + sale * 0.05, czv), (0.06, 0.05, alto), m_tabla)
        caja(prefijo + "_Parteluz_H", (cxv, cyv + sale * 0.05, czv), (ancho, 0.05, 0.06), m_tabla)
        caja(prefijo + "_Alfeizar", (cxv, cyv + sale * 0.12, czv - alto / 2 - 0.05), (ancho + 0.3, 0.3, 0.08), m_tabla)
        caja(prefijo + "_Cargadero", (cxv, cyv + sale * 0.06, czv + alto / 2 + 0.07), (ancho + 0.3, 0.26, 0.14), m_tabla)
        for e in [-1, 1]:
            caja(prefijo + "_Marco_" + str(e), (cxv + e * (ancho / 2 + 0.05), cyv + sale * 0.06, czv), (0.1, 0.26, alto), m_tabla)
            # contraventanas abiertas
            caja(prefijo + "_Contra_" + str(e), (cxv + e * (ancho / 2 + 0.38), cyv + sale * 0.1, czv), (0.5, 0.05, alto + 0.05), m_tabla)
            caja(prefijo + "_Contra_Z_" + str(e), (cxv + e * (ancho / 2 + 0.38), cyv + sale * 0.14, czv), (0.5, 0.02, 0.08), m_tronco, rot=(0, 0.6, 0))
    else:
        caja(prefijo + "_Luz", (cxv, cyv, czv), (0.06, ancho, alto), m_ventana)
        caja(prefijo + "_Parteluz_V", (cxv + sale * 0.05, cyv, czv), (0.05, 0.06, alto), m_tabla)
        caja(prefijo + "_Parteluz_H", (cxv + sale * 0.05, cyv, czv), (0.05, ancho, 0.06), m_tabla)
        caja(prefijo + "_Alfeizar", (cxv + sale * 0.12, cyv, czv - alto / 2 - 0.05), (0.3, ancho + 0.3, 0.08), m_tabla)
        caja(prefijo + "_Cargadero", (cxv + sale * 0.06, cyv, czv + alto / 2 + 0.07), (0.26, ancho + 0.3, 0.14), m_tabla)
        for e in [-1, 1]:
            caja(prefijo + "_Marco_" + str(e), (cxv + sale * 0.06, cyv + e * (ancho / 2 + 0.05), czv), (0.26, 0.1, alto), m_tabla)

zv = Z0 + 1.27
ventana("CB_VentanaFI", (-1.7, -MY, zv), 1.0, 0.9, "y", -1)
ventana("CB_VentanaFD", (1.7, -MY, zv), 1.0, 0.9, "y", -1)
ventana("CB_VentanaT", (0, MY, Z0 + 1.25), 1.1, 0.85, "y", 1)
ventana("CB_VentanaL", (-MX, 0, Z0 + 1.25), 1.0, 0.85, "x", -1)

# jardineras con flores bajo las ventanas de la fachada
for e in [-1, 1]:
    x = e * 1.7
    caja("CB_Jardinera_" + str(e), (x, -MY - 0.42, zv - 0.62), (1.15, 0.24, 0.22), m_tabla)
    for k in range(7):
        mat = m_flor_roja
        if k % 2 == 1:
            mat = m_flor_amarilla
        esfera("CB_Flor_J" + str(e) + "_" + str(k), (x - 0.48 + k * 0.16, -MY - 0.42 + entre(-0.05, 0.05), zv - 0.45 + entre(0, 0.06)), 0.07, mat, (1, 1, 0.8), 8, 5)
        esfera("CB_Hoja_J" + str(e) + "_" + str(k), (x - 0.48 + k * 0.16, -MY - 0.42, zv - 0.5), 0.08, m_hojas, (1, 1, 0.6), 8, 5)

# ==========================================
# 7. PORCHE: TARIMA, ESCALONES, POSTES, TEJADILLO, BARANDILLA, FAROLES Y BANCO
# ==========================================
YP = -MY - 1.85      # borde exterior del porche
for k in range(9):
    y = -MY - 0.12 - k * 0.2
    caja("CB_Tarima_" + str(k), (0, y, Z0 - 0.03), (2 * MX + 0.6, 0.185, 0.06), m_tabla)
for k in range(3):
    caja("CB_Escalon_" + str(k), (0, YP - 0.2 - k * 0.32, Z0 - 0.17 - k * 0.165), (1.6, 0.36, 0.08), m_tabla)
    caja("CB_Escalon_Zanca_" + str(k), (0, YP - 0.2 - k * 0.32, (Z0 - 0.17 - k * 0.165) / 2), (1.5, 0.32, Z0 - 0.17 - k * 0.165), m_piedra)
postes = [-MX - 0.1, -0.95, 0.95, MX + 0.1]
Z_PORCHE = Z0 + 2.3
for k in range(4):
    cilindro("CB_Poste_" + str(k), (postes[k], YP + 0.15, (Z0 + Z_PORCHE) / 2), 0.1, Z_PORCHE - Z0, m_tronco, 10)
    cilindro("CB_Poste_Pie_" + str(k), (postes[k], YP + 0.15, Z0 / 2), 0.14, Z0, m_piedra, 8)
cilindro("CB_Viga_Porche", (0, YP + 0.15, Z_PORCHE + 0.08), 0.12, 2 * MX + 0.6, m_tronco, 10, rot=(0, math.pi / 2, 0))
# tejadillo: de la pared (alto) al borde del porche (bajo)
z_alto = Z_PORCHE + 0.55
z_bajo = Z_PORCHE + 0.12
dyp = (-MY - R) - (YP - 0.4)
inc = math.atan2(z_alto - z_bajo, dyp)
largo_p = math.hypot(dyp, z_alto - z_bajo)
ycp = ((-MY - R) + (YP - 0.4)) / 2
caja("CB_Tejadillo", (0, ycp, (z_alto + z_bajo) / 2 + 0.08), (2 * MX + 0.9, largo_p, 0.1), m_tabla, rot=(inc, 0, 0))
for k in range(5):
    s = (k + 0.5) / 5
    yy = (YP - 0.4) + s * dyp
    zz = z_bajo + s * (z_alto - z_bajo) + 0.16
    desfase = 0.0
    if k % 2 == 1:
        desfase = 0.35
    x = -(2 * MX + 0.9) / 2 + desfase
    p = 0
    while x < (2 * MX + 0.9) / 2 - 0.05:
        ancho = 0.7
        if x + ancho > (2 * MX + 0.9) / 2:
            ancho = (2 * MX + 0.9) / 2 - x
        mat = m_tejado
        if azar() < 0.2:
            mat = m_tejado2
        caja("CB_TablillaP_" + str(k) + "_" + str(p), (x + ancho / 2, yy, zz), (ancho - 0.03, largo_p / 5 * 1.25, 0.05), mat, rot=(inc + 0.05, 0, 0))
        x = x + ancho
        p = p + 1
# barandilla (con el hueco de la escalera)
tramos_b = [[-MX - 0.1, -0.95], [0.95, MX + 0.1]]
for t in range(2):
    a = tramos_b[t][0]
    b = tramos_b[t][1]
    caja("CB_Pasamanos_" + str(t), ((a + b) / 2, YP + 0.15, Z0 + 0.95), (b - a, 0.1, 0.08), m_tronco)
    caja("CB_Zocalo_Bar_" + str(t), ((a + b) / 2, YP + 0.15, Z0 + 0.12), (b - a, 0.08, 0.06), m_tronco)
    n = int((b - a) / 0.22)
    for k in range(1, n):
        caja("CB_Balaustre_" + str(t) + "_" + str(k), (a + k * (b - a) / n, YP + 0.15, Z0 + 0.53), (0.05, 0.05, 0.8), m_tabla)
for e in [-1, 1]:
    x = e * (MX + 0.1)
    caja("CB_Pasamanos_L" + str(e), (x, (YP + 0.15 - MY - 0.2) / 2, Z0 + 0.95), (0.1, -MY - 0.2 - YP - 0.15, 0.08), m_tronco)
    for k in range(1, 7):
        caja("CB_Balaustre_L" + str(e) + "_" + str(k), (x, YP + 0.15 + k * 0.24, Z0 + 0.53), (0.05, 0.05, 0.8), m_tabla)
# faroles colgados de la viga
for e in [-1, 1]:
    x = e * 0.95
    cilindro("CB_Cadena_" + str(e), (x, YP + 0.15, Z_PORCHE - 0.12), 0.012, 0.3, m_hierro, 6)
    caja("CB_Farol_Marco_" + str(e), (x, YP + 0.15, Z_PORCHE - 0.42), (0.2, 0.2, 0.28), m_hierro)
    caja("CB_Farol_Luz_" + str(e), (x, YP + 0.15, Z_PORCHE - 0.42), (0.22, 0.22, 0.22), m_farol)
    cono("CB_Farol_Techo_" + str(e), (x, YP + 0.15, Z_PORCHE - 0.22), 0.17, 0.02, 0.14, m_hierro, 4, rot=(0, 0, math.pi / 4))
# banco bajo la ventana derecha
caja("CB_Banco_Asiento", (1.7, -MY - 0.55, Z0 + 0.42), (1.3, 0.4, 0.07), m_tabla)
for e in [-1, 1]:
    caja("CB_Banco_Pata_" + str(e), (1.7 + e * 0.55, -MY - 0.55, Z0 + 0.2), (0.08, 0.36, 0.4), m_tabla)

# ==========================================
# 8. LEÑERA, BARRILES, TOCÓN CON HACHA
# ==========================================
lx = -MX - 0.75
for fila in range(4):
    n = 9 - fila
    for k in range(n):
        y = -1.0 + 0.11 + fila * 0.11 + k * 0.22
        cilindro("CB_Lena_" + str(fila) + "_" + str(k), (lx + entre(-0.03, 0.03), y, 0.1 + fila * 0.19), 0.1, 0.55, m_corteza, 8, rot=(0, math.pi / 2, 0))
for e in [-1, 1]:
    cilindro("CB_Lenera_Poste_" + str(e), (lx - 0.35, e * 1.15, 0.7), 0.06, 1.4, m_tronco, 8)
caja("CB_Lenera_Techo", (lx - 0.05, 0, 1.45), (0.95, 2.5, 0.06), m_tabla, rot=(0, -0.35, 0))
for k in range(2):
    bx = -MX - 0.6 + k * 0.7
    by = YP - 0.4 - k * 0.5
    cilindro("CB_Barril_" + str(k), (bx, by, 0.45), 0.32, 0.9, m_tabla, 14)
    for h in range(3):
        cilindro("CB_Barril_Aro_" + str(k) + "_" + str(h), (bx, by, 0.12 + h * 0.33), 0.33, 0.05, m_hierro, 14)
cilindro("CB_Toc0n", (-4.9, -2.6, 0.25), 0.3, 0.5, m_corteza, 12)
viga("CB_Hacha_Mango", (-4.85, -2.6, 0.5), (-4.55, -2.75, 1.0), 0.05, m_tabla)
caja("CB_Hacha_Hoja", (-4.86, -2.6, 0.53), (0.24, 0.04, 0.16), m_hierro, rot=(0, 0.5, 0))
for k in range(3):
    cilindro("CB_Astilla_" + str(k), (-4.5 + k * 0.2, -2.3 - k * 0.1, 0.06), 0.06, 0.3, m_corteza, 6, rot=(math.pi / 2, 0, k * 0.9))

# ==========================================
# 9. VALLA, CAMINO, ARBUSTOS, FLORES Y PINOS
# ==========================================
def valla(prefijo, a, b):
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    largo = math.hypot(dx, dy)
    n = int(largo / 1.5) + 1
    for k in range(n + 1):
        t = k / n
        cilindro(prefijo + "_Poste_" + str(k), (a[0] + dx * t, a[1] + dy * t, 0.5), 0.07, 1.0, m_corteza, 8)
    for h in range(2):
        z = 0.4 + h * 0.4
        viga(prefijo + "_Riel_" + str(h), (a[0], a[1], z + entre(-0.03, 0.03)), (b[0], b[1], z + entre(-0.03, 0.03)), 0.08, m_tronco)

valla("CB_Valla_I", (-6.0, -4.6), (-6.0, 4.0))
valla("CB_Valla_D", (6.0, -4.6), (6.0, 4.0))
for k in range(3):
    esfera("CB_Mata_" + str(k), (MX + 0.4 + k * 0.5, -MY - 0.8 - k * 0.3, 0.2), 0.32, m_hojas, (1.1, 1.0, 0.75), 10, 6)
for k in range(2):
    x = -3.5 + k * 7.5
    y = 3.3 + k * 0.4
    cilindro("CB_Pino_Tronco_" + str(k), (x, y, 1.0), 0.18, 2.0, m_corteza, 10)
    for c in range(4):
        cono("CB_Pino_Copa_" + str(k) + "_" + str(c), (x, y, 1.6 + c * 1.05), 1.55 - c * 0.32, 0.15, 1.6, m_hojas, 10)


# ==========================================
# 10. PATIO EMPEDRADO CON MURO BAJO
# ==========================================
PY_A = -5.0          # el patio empieza al pie de los escalones del porche
PY_B = -13.0
PX_P = 5.4
caja("CP_Empedrado", (0, (PY_A + PY_B) / 2, 0.03), (2 * PX_P, PY_A - PY_B, 0.06), m_patio)
caja("CP_Entrada", (0, PY_B - 1.2, 0.025), (2.2, 2.4, 0.05), m_entrada)
H_MURO = 0.75
def muro(nombre, a, b):
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    largo = math.hypot(dx, dy)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    giro = math.atan2(dy, dx)
    caja(nombre, (centro[0], centro[1], H_MURO / 2), (largo + 0.4, 0.4, H_MURO), m_muro, rot=(0, 0, giro))
    caja(nombre + "_Albardilla", (centro[0], centro[1], H_MURO + 0.05), (largo + 0.5, 0.52, 0.1), m_albardilla, rot=(0, 0, giro))
muro("CP_Muro_I", (-PX_P, PY_A + 0.4), (-PX_P, PY_B))
muro("CP_Muro_D", (PX_P, PY_A + 0.4), (PX_P, PY_B))
muro("CP_Muro_F1", (-PX_P, PY_B), (-1.25, PY_B))
muro("CP_Muro_F2", (1.25, PY_B), (PX_P, PY_B))
# pilares de la entrada con farol
for e in [-1, 1]:
    x = e * 1.45
    caja("CP_Pilar_" + str(e), (x, PY_B, 0.75), (0.6, 0.6, 1.5), m_muro)
    caja("CP_Pilar_Remate_" + str(e), (x, PY_B, 1.55), (0.72, 0.72, 0.1), m_albardilla)
    caja("CP_Farol_Marco_" + str(e), (x, PY_B, 1.78), (0.24, 0.24, 0.34), m_hierro)
    caja("CP_Farol_Luz_" + str(e), (x, PY_B, 1.78), (0.26, 0.26, 0.26), m_farol)
    cono("CP_Farol_Techo_" + str(e), (x, PY_B, 2.02), 0.2, 0.02, 0.16, m_hierro, 4, rot=(0, 0, math.pi / 4))

# ==========================================
# 11. FUENTE DE DOS TAZAS
# ==========================================
FY = -9.0
cilindro("CP_Fuente_Pileta", (0, FY, 0.33), 1.7, 0.54, m_fuente, 8)
# borde de la pileta: ocho piedras a lo largo del octógono (deja ver el agua por dentro)
for k in range(8):
    a0 = (k + 0.5) * math.pi / 4
    a1 = (k + 1.5) * math.pi / 4
    ra = 1.74
    viga("CP_Fuente_Borde_" + str(k), (ra * math.cos(a0), FY + ra * math.sin(a0), 0.66), (ra * math.cos(a1), FY + ra * math.sin(a1), 0.66), 0.24, m_albardilla)
cilindro("CP_Fuente_Agua", (0, FY, 0.61), 1.58, 0.04, m_agua, 24)
cilindro("CP_Fuente_Fuste", (0, FY, 1.2), 0.22, 1.2, m_fuente, 12)
cilindro("CP_Fuente_Anillo", (0, FY, 0.75), 0.32, 0.14, m_albardilla, 12)
cono("CP_Fuente_Taza", (0, FY, 1.88), 0.22, 0.85, 0.36, m_albardilla, 16)
cilindro("CP_Fuente_Agua_Taza", (0, FY, 2.04), 0.78, 0.03, m_agua_alta, 24)
cono("CP_Fuente_Pinaculo", (0, FY, 2.25), 0.14, 0.06, 0.4, m_fuente, 10)
esfera("CP_Fuente_Bola", (0, FY, 2.5), 0.11, m_albardilla, (1, 1, 1), 12, 8)
# chorro que sube y cortina de agua que cae de la taza a la pileta
cilindro("CP_Chorro", (0, FY, 2.85), 0.05, 0.6, m_chorro, 10)
esfera("CP_Chorro_Copa", (0, FY, 3.15), 0.14, m_chorro, (1, 1, 0.6), 12, 6)
cono("CP_Cortina", (0, FY, 1.36), 0.96, 0.84, 0.64, m_cortina, 24)

# ==========================================
# 12. BANCOS, JARDINERAS, FLORES Y UN ÁRBOL
# ==========================================
for e in [-1, 1]:
    x = e * 3.3
    caja("CP_Banco_Asiento_" + str(e), (x, FY, 0.48), (0.5, 1.8, 0.09), m_tabla)
    caja("CP_Banco_Respaldo_" + str(e), (x + e * 0.24, FY, 0.82), (0.08, 1.8, 0.45), m_tabla, rot=(0, e * 0.12, 0))
    for f in [-1, 1]:
        caja("CP_Banco_Pie_" + str(e) + "_" + str(f), (x, FY + f * 0.75, 0.22), (0.42, 0.16, 0.44), m_fuente)
for k in range(4):
    ex = 1
    if k % 2 == 0:
        ex = -1
    ey = PY_A - 0.9
    if k >= 2:
        ey = PY_B + 0.9
    x = ex * (PX_P - 0.9)
    caja("CP_Jardinera_" + str(k), (x, ey, 0.3), (1.2, 1.2, 0.6), m_albardilla)
    caja("CP_Jardinera_Tierra_" + str(k), (x, ey, 0.58), (1.05, 1.05, 0.06), m_tierra)
    esfera("CP_Mata_" + str(k), (x, ey, 0.85), 0.42, m_hojas, (1.0, 1.0, 0.75), 10, 6)
    for f in range(6):
        mat = m_flor_roja
        if f % 2 == 1:
            mat = m_flor_amarilla
        ang = f * math.pi / 3
        esfera("CP_Flor_" + str(k) + "_" + str(f), (x + 0.38 * math.cos(ang), ey + 0.38 * math.sin(ang), 0.95 + entre(0, 0.12)), 0.08, mat, (1, 1, 1), 8, 5)
# arbol del patio (rincón izquierdo, junto al muro)
cilindro("CP_Arbol_Tronco", (-3.8, -11.4, 1.3), 0.2, 2.6, m_corteza, 10)
for c in range(3):
    esfera("CP_Arbol_Copa_" + str(c), (-3.8 + entre(-0.4, 0.4), -11.4 + entre(-0.4, 0.4), 2.9 + c * 0.55), 1.2 - c * 0.25, m_hojas, (1, 1, 0.85), 12, 8)
# macetas junto a los escalones
for e in [-1, 1]:
    cilindro("CP_Maceta_" + str(e), (e * 1.15, -5.35, 0.25), 0.25, 0.4, m_albardilla, 12)
    esfera("CP_Maceta_Flores_" + str(e), (e * 1.15, -5.35, 0.55), 0.28, m_flor_roja, (1, 1, 0.7), 10, 6)
