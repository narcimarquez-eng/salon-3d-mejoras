import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# MONSTRUO CUADRÚPEDO (bestia tipo hiena con púas en el lomo)
# ==============================================================================
# Hecho a partir de la hoja de vistas del usuario: frente, perfil (se usa la 3.ª columna,
# la que enseña la cola; la 2.ª es otro perfil mirando al mismo lado y no se usa), espalda
# y cenital. El otro costado usa el mismo perfil volteado.
# Medidas tomadas en la hoja: frente, perfil y espalda a 0,4 cm por píxel; la cenital a
# 0,438 cm por píxel. La piel es la propia foto (mat.color_map_views): cada cara toma la vista
# que mejor la ve. Hoja preparada en public/textures/monstruo_cuadrupedo_hoja.jpg.
# Ejes: Y = largo (el hocico mira a Y negativo), X = ancho, Z = altura. Metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.7, bloom=0.03)
bpy.ops.render.set_lighting(intensity=1.3, angle=40)
bpy.ops.render.set_ssao(intensity=1.1)

def material(nombre, color, rugosidad=0.6, metalico=0.0, barniz=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
        if barniz > 0:
            bsdf.inputs["Coat Weight"].default_value = barniz
    return mat

def asignar_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj

def malla(nombre, verts, caras, mat, suave=True):
    me = bpy.data.meshes.new(nombre)
    me.from_pydata(verts, [], caras)
    obj = bpy.data.objects.new(nombre, me)
    bpy.context.collection.objects.link(obj)
    if suave:
        # une los vértices y suaviza las normales (si no, la piel sale a facetas)
        bpy.ops.object.shade_smooth()
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0), segmentos=16, anillos=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def caja(nombre, centro, tamano, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = tamano
    return asignar_mat(obj, mat)

# --- Vectores ---
def sumar(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

def restar(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

def por(a, k):
    return [a[0] * k, a[1] * k, a[2] * k]

def cruz(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

def unit(a):
    l = math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
    if l < 1e-9:
        return [0.0, 0.0, 1.0]
    return [a[0] / l, a[1] / l, a[2] / l]

def tubo(nombre, pts, radios, mat, n=12, aplastar=1.0):
    # Tubo liso que sigue una lista de puntos con un radio en cada uno (patas, dedos).
    # aplastar < 1 estrecha el tubo de lado (en X); puede ser un número o uno por punto.
    verts = []
    caras = []
    m = len(pts)
    for i in range(m):
        if i == 0:
            t = restar(pts[1], pts[0])
        elif i == m - 1:
            t = restar(pts[m - 1], pts[m - 2])
        else:
            t = restar(pts[i + 1], pts[i - 1])
        t = unit(t)
        ref = [1.0, 0.0, 0.0]
        if abs(t[0]) > 0.9:
            ref = [0.0, 1.0, 0.0]
        a = unit(cruz(t, ref))
        b = unit(cruz(t, a))
        r = radios[i]
        ap = aplastar
        if isinstance(aplastar, list):
            ap = aplastar[i]
        for k in range(n):
            ang = 2 * math.pi * k / n
            d = sumar(por(a, math.cos(ang) * r), por(b, math.sin(ang) * r))
            d[0] = d[0] * ap
            verts.append(sumar(pts[i], d))
    for i in range(m - 1):
        for k in range(n):
            k2 = (k + 1) % n
            caras.append((i * n + k, i * n + k2, (i + 1) * n + k2, (i + 1) * n + k))
    # tapas
    c0 = len(verts)
    verts.append(pts[0])
    c1 = len(verts)
    verts.append(pts[m - 1])
    for k in range(n):
        k2 = (k + 1) % n
        caras.append((c0, k2, k))
        caras.append((c1, (m - 1) * n + k, (m - 1) * n + k2))
    return malla(nombre, verts, caras, mat)

def interp(tabla, x, col):
    if x <= tabla[0][0]:
        return tabla[0][col]
    for i in range(len(tabla) - 1):
        a = tabla[i]
        b = tabla[i + 1]
        if x <= b[0]:
            t = (x - a[0]) / (b[0] - a[0])
            return a[col] + (b[col] - a[col]) * t
    return tabla[len(tabla) - 1][col]

def aleta3d(nombre, contorno, grosor, mat):
    # Aleta plana a partir de su contorno en 3D; el centro es más grueso que los bordes.
    n = len(contorno)
    c = [0.0, 0.0, 0.0]
    for q in contorno:
        c = sumar(c, q)
    c = por(c, 1.0 / n)
    nrm = [0.0, 0.0, 0.0]
    for i in range(n):
        a = restar(contorno[i], c)
        b = restar(contorno[(i + 1) % n], c)
        nrm = sumar(nrm, cruz(a, b))
    nrm = unit(nrm)
    verts = []
    for q in contorno:
        verts.append(sumar(q, por(nrm, grosor * 0.15)))
        verts.append(sumar(q, por(nrm, -grosor * 0.15)))
    ia = len(verts)
    verts.append(sumar(c, por(nrm, grosor)))
    ib = len(verts)
    verts.append(sumar(c, por(nrm, -grosor)))
    caras = []
    for i in range(n):
        j = (i + 1) % n
        caras.append((ia, 2 * i, 2 * j))
        caras.append((ib, 2 * j + 1, 2 * i + 1))
        caras.append((2 * i, 2 * i + 1, 2 * j + 1, 2 * j))
    return malla(nombre, verts, caras, mat)

def plano_yz(puntos, x=0.0):
    out = []
    for q in puntos:
        out.append([x, q[0], q[1]])
    return out

def pie(pref, talon, lado, largo, ancho):
    # Pie ancho con cuatro dedos hacia delante (-Y) y garras oscuras (como en la vista de frente)
    esfera(pref + "_Planta", (talon[0], talon[1] - largo * 0.15, 0.085), 0.5, m_pata, escala=(ancho, largo * 0.95, 0.18))
    for d in range(4):
        f = (d - 1.5) / 1.5
        dx = f * ancho * 0.36
        base = [talon[0] + dx, talon[1] - largo * 0.35, 0.08]
        punta = [talon[0] + dx * 1.15, talon[1] - largo * 0.62 + abs(f) * 0.05, 0.05]
        tubo(pref + "_Dedo_" + str(d), [base, punta], [0.06, 0.045], m_pata, n=8)
        cono(pref + "_Garra_" + str(d), (punta[0], punta[1] - 0.045, 0.035), 0.032, 0.0, 0.10, m_garra, vertices=6, rot=(math.pi / 2 + 0.3, 0, 0))


# ==========================================
# 1. MATERIALES: la foto proyectada y garras oscuras
# ==========================================
HOJA = "monstruo_cuadrupedo_hoja"
ESC = 0.004            # metros por píxel en frente, perfil y espalda
ESC_TOP = 0.00438      # metros por píxel en la cenital
PX_Y0 = 1615           # píxel del perfil que cae en y = 0
SUELO = 858            # fila del suelo en la hoja

def y_de(px):
    return (px - PX_Y0) * ESC

def z_de(py):
    return (SUELO - py) * ESC

Y_HOCICO = y_de(1229)
ALTO = z_de(355)

# [eje, lado, u0, v0, u1, v1 (píxeles), h0, h1, w0, w1 (metros), peso]
VISTAS = [
    ["x", 0, 1229, 355, 2002, 858, y_de(1229), y_de(2002), ALTO, 0.0, 1.6],          # perfil (3.ª columna)
    ["z", 1, 2473, 415, 3113, 815, Y_HOCICO, Y_HOCICO + 640 * ESC_TOP, 200 * ESC_TOP, -200 * ESC_TOP, 1.0],  # cenital
    ["y", -1, 167, 355, 367, 858, -0.4, 0.4, ALTO, 0.0, 1.2],                        # frente
    ["y", 1, 2125.5, 355, 2325.5, 858, 0.4, -0.4, ALTO, 0.0, 1.2],                  # espalda
]
VISTAS_PATAS = [
    ["x", 0, 1229, 355, 2002, 858, y_de(1229), y_de(2002), ALTO, 0.0, 1.3],
    ["y", -1, 167, 355, 367, 858, -0.4, 0.4, ALTO, 0.0, 1.0],
    ["y", 1, 2125.5, 355, 2325.5, 858, 0.4, -0.4, ALTO, 0.0, 1.0],
]

def material_foto(nombre, vistas, rugosidad=0.85, barniz=0.0):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad, barniz=barniz)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

m_piel = material_foto("MQ_Piel", VISTAS)
m_pata = material_foto("MQ_Patas", VISTAS_PATAS)
m_garra = material("MQ_Garra", (0.02, 0.018, 0.016, 1.0), 0.35, barniz=0.5)

# ==========================================
# 2. CUERPO: del hocico a la grupa en una sola pieza (cabeza, cuello y tronco)
# ==========================================
# Perfil: [px, arriba (pelo, sin púas), abajo (mandíbula, garganta, pecho, barriga)]
PERFIL = [
    [1229, 560, 574], [1240, 548, 592], [1254, 537, 604], [1279, 518, 630], [1304, 494, 630],
    [1329, 481, 630], [1354, 469, 628], [1379, 457, 622], [1404, 446, 624], [1429, 437, 634],
    [1454, 430, 650], [1479, 427, 668], [1504, 426, 680], [1529, 427, 684], [1554, 432, 684],
    [1579, 438, 680], [1604, 445, 674], [1629, 450, 667], [1654, 455, 658], [1679, 458, 650],
    [1704, 460, 645], [1729, 462, 646], [1754, 466, 650], [1779, 473, 645], [1804, 486, 630],
    [1829, 501, 610], [1845, 520, 585], [1856, 538, 566],
]
# Cenital: [px, medio ancho en px] (el centro está en la fila 615)
CENITAL = [
    [2473, 2], [2480, 12], [2500, 27], [2525, 38], [2550, 47], [2575, 55], [2600, 60],
    [2625, 60], [2650, 70], [2700, 92], [2750, 100], [2800, 96], [2850, 80], [2900, 72],
    [2950, 84], [3000, 72], [3030, 44], [3048, 22],
]

def seccion(y):
    px = y / ESC + PX_Y0
    top = z_de(interp(PERFIL, px, 1))
    # la barriga se sube 8 px: así su cara de abajo cae dentro de la silueta de la foto
    # y no coge el fondo que hay entre las patas
    bot = z_de(interp(PERFIL, px, 2) - 8)
    pxc = (y - Y_HOCICO) / ESC_TOP + 2473
    hw = interp(CENITAL, pxc, 1) * ESC_TOP
    if hw < 0.02:
        hw = 0.02
    zc = bot + (top - bot) * 0.5
    return [zc, top - zc, zc - bot, hw]

Y0 = Y_HOCICO
Y1 = y_de(1856)
NS = 52
NT = 32
verts = []
for i in range(NS + 1):
    t = i / NS
    y = Y0 + (Y1 - Y0) * t
    p = seccion(y)
    for k in range(NT):
        ang = 2 * math.pi * k / NT
        c = math.cos(ang)
        sn = math.sin(ang)
        if sn >= 0:
            z = p[0] + math.pow(sn, 0.9) * p[1]
        else:
            z = p[0] - math.pow(-sn, 0.9) * p[2]
        # sección redondeada pero algo cuadrada (bestia musculosa)
        x = c * p[3] * (1.0 - 0.06 * sn)
        if abs(c) > 0.0:
            x = x * math.pow(abs(c), -0.12)
        verts.append((x, y, z))
caras = []
for i in range(NS):
    for k in range(NT):
        k2 = (k + 1) % NT
        caras.append((i * NT + k, (i + 1) * NT + k, (i + 1) * NT + k2, i * NT + k2))
ip = len(verts)
p0 = seccion(Y0)
verts.append((0.0, Y0 - 0.01, p0[0]))
iq = len(verts)
p1 = seccion(Y1)
verts.append((0.0, Y1 + 0.01, p1[0]))
for k in range(NT):
    k2 = (k + 1) % NT
    caras.append((ip, k2, k))
    caras.append((iq, NS * NT + k, NS * NT + k2))
malla("MQ_Cuerpo", verts, caras, m_piel)

# ==========================================
# 3. PÚAS DEL LOMO (puntas medidas en el perfil) y COLA
# ==========================================
PUAS = [[1433, 406], [1462, 396], [1488, 377], [1517, 380], [1546, 368], [1590, 392], [1622, 416], [1653, 431], [1672, 444], [1700, 452]]
for i in range(len(PUAS)):
    q = PUAS[i]
    y = y_de(q[0])
    base = seccion(y)
    z_base = base[0] + base[1] - 0.06
    alto = z_de(q[1]) - z_base
    if alto > 0.06:
        ancho = 0.05 + alto * 0.35
        cono("MQ_Pua_" + str(i), (0, y + alto * 0.18, z_base + alto * 0.5), ancho, 0.004, alto, m_piel, vertices=6, rot=(-0.38, 0, 0))
        bpy.context.active_object.scale = (0.55, 1.0, 1.0)

# Cola peluda: cae desde la grupa hacia atrás (perfil) y queda en el centro (espalda)
cola = [[0, y_de(1846), z_de(548)], [0, y_de(1872), z_de(598)], [0, y_de(1905), z_de(648)], [0, y_de(1940), z_de(668)], [0, y_de(1975), z_de(678)], [0, y_de(2000), z_de(684)]]
tubo("MQ_Cola", cola, [0.06, 0.10, 0.075, 0.05, 0.03, 0.008], m_piel, n=12, aplastar=0.6)

# ==========================================
# 4. PATAS: nacen estrechas dentro del cuerpo y se abren al cruzar la piel
# ==========================================
# Delantera: centro x = ±0.344 (frente); en el perfil baja por y ~ -0.28..-0.36
# Trasera:   centro x = ±0.31 (espalda); muslo en y ~ 0.64, corvejón en y ~ 0.94
for lado in [-1, 1]:
    puntos = [
        [lado * 0.12, y_de(1545), z_de(520)],
        [lado * 0.24, y_de(1548), z_de(590)],
        [lado * 0.31, y_de(1548), z_de(650)],
        [lado * 0.34, y_de(1545), z_de(700)],
        [lado * 0.344, y_de(1537), z_de(750)],
        [lado * 0.344, y_de(1532), z_de(780)],
        [lado * 0.344, y_de(1526), z_de(805)],
        [lado * 0.344, y_de(1522), z_de(828)],
    ]
    radios = [0.14, 0.26, 0.25, 0.19, 0.135, 0.13, 0.14, 0.15]
    tubo("MQ_Pata_Del_" + str(lado), puntos, radios, m_pata, n=18, aplastar=[0.9, 0.85, 0.85, 0.9, 1.0, 1.05, 1.0, 1.0])
    pie("MQ_PieD_" + str(lado), [lado * 0.344, y_de(1530), 0.0], lado, 0.42, 0.36)

    puntos = [
        [lado * 0.10, y_de(1760), z_de(520)],
        [lado * 0.20, y_de(1765), z_de(580)],
        [lado * 0.27, y_de(1776), z_de(650)],
        [lado * 0.30, y_de(1801), z_de(700)],
        [lado * 0.31, y_de(1834), z_de(728)],
        [lado * 0.31, y_de(1850), z_de(752)],
        [lado * 0.31, y_de(1848), z_de(778)],
        [lado * 0.31, y_de(1842), z_de(805)],
        [lado * 0.31, y_de(1836), z_de(828)],
    ]
    radios = [0.14, 0.27, 0.25, 0.22, 0.19, 0.14, 0.13, 0.14, 0.15]
    tubo("MQ_Pata_Tras_" + str(lado), puntos, radios, m_pata, n=18, aplastar=[0.85, 0.75, 0.75, 0.8, 0.85, 1.0, 1.05, 1.0, 1.0])
    pie("MQ_PieT_" + str(lado), [lado * 0.31, y_de(1842), 0.0], lado, 0.42, 0.34)

# Suelo pequeño para que la vista general encuadre bien
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=2.0, depth=0.03, location=(0, 0, -0.015))
suelo = bpy.context.active_object
suelo.name = "MQ_Suelo"
asignar_mat(suelo, material("MQ_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
