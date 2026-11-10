import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# TIBURÓN BLANCO CON CUATRO PATAS (criatura cuadrúpeda)
# ==============================================================================
# Hecho a partir de la hoja de vistas del usuario (frente, dos perfiles, espalda y
# cenital). Las proporciones están medidas en la hoja (1 píxel = 1 cm en frente y perfil;
# la vista cenital va a 1,12 cm/píxel) y la piel es la propia foto: cada cara del modelo
# toma la vista que mejor la ve (perfil, cenital, frente o espalda) con mat.color_map_views.
# La hoja está en public/textures/tiburon_patas_hoja.jpg (con el color de cada figura
# estirado un poco por fuera de su contorno, para que el fondo blanco no manche los bordes).
# Ejes: Y = largo (el hocico mira a Y negativo), X = ancho, Z = altura. Metros.
# Los colores van en valores lineales, como en Blender (el visor los pasa a sRGB).
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

def aleta(nombre, contorno, origen, eje_u, eje_v, grosor, mat):
    # Aleta plana con el centro más grueso que los bordes. contorno = puntos (u, v) en el plano
    # de la aleta; se triangula en abanico desde su centro (contorno con forma de estrella).
    nrm = unit(cruz(eje_u, eje_v))
    n = len(contorno)
    cu = 0.0
    cv = 0.0
    for p in contorno:
        cu = cu + p[0]
        cv = cv + p[1]
    cu = cu / n
    cv = cv / n
    verts = []
    for p in contorno:
        base = sumar(origen, sumar(por(eje_u, p[0]), por(eje_v, p[1])))
        verts.append(sumar(base, por(nrm, grosor * 0.18)))
        verts.append(sumar(base, por(nrm, -grosor * 0.18)))
    centro = sumar(origen, sumar(por(eje_u, cu), por(eje_v, cv)))
    ia = len(verts)
    verts.append(sumar(centro, por(nrm, grosor)))
    ib = len(verts)
    verts.append(sumar(centro, por(nrm, -grosor)))
    caras = []
    for i in range(n):
        j = (i + 1) % n
        caras.append((ia, 2 * i, 2 * j))
        caras.append((ib, 2 * j + 1, 2 * i + 1))
        caras.append((2 * i, 2 * i + 1, 2 * j + 1, 2 * j))
    return malla(nombre, verts, caras, mat)

# ==========================================
# 1. MATERIALES: la foto proyectada, y garras oscuras
# ==========================================
HOJA = "tiburon_patas_hoja"
# [eje, lado, u0, v0, u1, v1 (píxeles de la hoja), h0, h1, w0, w1 (metros del script), peso]
# El peso hace que el perfil mande en los costados: la cenital solo pinta el lomo y el
# frente/espalda solo el hocico y la cola, así las costuras quedan donde no se ven.
PERFIL_FOTO = ["x", 0, 334, 345, 759, 603, -2.10, 2.15, 2.58, 0.0, 1.7]
VISTAS = [
    PERFIL_FOTO,
    ["z", 1, 1580, 393, 1959, 593, -2.10, 2.145, 1.12, -1.12, 1.0],   # cenital (lomo)
    ["y", -1, 71.5, 345, 271.5, 603, -1.0, 1.0, 2.58, 0.0, 1.2],      # frente (cara y pecho)
    ["y", 1, 1301.5, 345, 1501.5, 603, 1.0, -1.0, 2.58, 0.0, 1.2],    # espalda (cola y ancas)
]
# Patas: perfil y, de frente/espalda, sus propias fotos (sin cenital, que solo ve el lomo)
VISTAS_PATAS = [
    ["x", 0, 334, 345, 759, 603, -2.10, 2.15, 2.58, 0.0, 1.3],
    ["y", -1, 71.5, 345, 271.5, 603, -1.0, 1.0, 2.58, 0.0, 1.0],
    ["y", 1, 1301.5, 345, 1501.5, 603, 1.0, -1.0, 2.58, 0.0, 1.0],
]

def material_foto(nombre, vistas, rugosidad=0.55, barniz=0.2):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad, barniz=barniz)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

m_piel = material_foto("TB_Piel", VISTAS)
m_aleta = material_foto("TB_Aletas", VISTAS, 0.5, 0.3)
m_pata = material_foto("TB_Patas", VISTAS_PATAS, 0.75, 0.0)
m_garra = material("TB_Garra", (0.025, 0.028, 0.032, 1.0), 0.4, barniz=0.4)

# ==========================================
# 2. CUERPO (secciones medidas en el perfil y en la vista cenital)
# ==========================================
# Perfil: [px, arriba, abajo] en píxeles de la hoja (y = (px - 334) / 100 - 2.1, z = (603 - py) / 100)
PERFIL = [
    [334, 456, 458], [338, 450, 463], [345, 444, 467], [360, 436, 473], [380, 427, 480],
    [400, 420, 486], [420, 415, 491], [440, 411, 494], [460, 408, 497], [480, 405, 499],
    [500, 402, 501], [520, 403, 503], [540, 405, 504], [560, 410, 504], [580, 415, 503],
    [600, 420, 500], [620, 425, 494], [640, 430, 486], [660, 437, 478], [680, 443, 471],
    [697, 447, 468],
]
# Cenital: [px, medio ancho en px] (y = (px - 1580) * 0.0112 - 2.1, ancho = px * 0.0112)
CENITAL = [
    [1580, 1], [1585, 10], [1590, 16], [1600, 22], [1620, 29], [1640, 35], [1660, 40],
    [1680, 43], [1700, 45], [1740, 46], [1760, 42], [1790, 32], [1820, 24], [1850, 17],
    [1880, 13], [1920, 6], [1940, 4],
]

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

def seccion(y):
    # [z_centro, radio_alto, radio_bajo, medio_ancho] a la distancia y del script
    px = (y + 2.1) * 100 + 334
    top = (603 - interp(PERFIL, px, 1)) / 100
    bot = (603 - interp(PERFIL, px, 2)) / 100
    pxc = (y + 2.1) / 0.0112 + 1580
    hw = interp(CENITAL, pxc, 1) * 0.0112
    zc = bot + (top - bot) * 0.52
    if hw < 0.02:
        hw = 0.02
    return [zc, top - zc, zc - bot, hw]

Y0 = -2.10
Y1 = 1.53
NS = 46
NT = 32
verts = []
for i in range(NS + 1):
    t = i / NS
    t = t * t * (3 - 2 * t) * 0.3 + t * 0.7     # más secciones en el hocico y la cola
    y = Y0 + (Y1 - Y0) * t
    p = seccion(y)
    for k in range(NT):
        ang = 2 * math.pi * k / NT
        c = math.cos(ang)
        sn = math.sin(ang)
        if sn >= 0:
            z = p[0] + sn * p[1]
        else:
            # barriga algo plana
            z = p[0] - math.pow(-sn, 0.85) * p[2]
        # sección en "huevo": más ancha un poco por debajo del centro
        x = c * p[3] * (1.0 - 0.10 * sn)
        verts.append((x, y, z))
caras = []
for i in range(NS):
    for k in range(NT):
        k2 = (k + 1) % NT
        caras.append((i * NT + k, (i + 1) * NT + k, (i + 1) * NT + k2, i * NT + k2))
ip = len(verts)
p0 = seccion(Y0)
verts.append((0.0, Y0 - 0.02, p0[0]))
iq = len(verts)
p1 = seccion(Y1)
verts.append((0.0, Y1 + 0.01, p1[0]))
for k in range(NT):
    k2 = (k + 1) % NT
    caras.append((ip, k2, k))
    caras.append((iq, NS * NT + k, NS * NT + k2))
malla("TB_Cuerpo", verts, caras, m_piel)

# ==========================================
# 3. ALETAS (contornos sacados de la hoja, en metros del script)
# ==========================================
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

# Dorsal: base metida en el lomo, punta en (0.14, 2.58)
aleta3d("TB_Aleta_Dorsal", plano_yz([[-0.52, 1.92], [-0.30, 2.20], [-0.10, 2.42], [0.06, 2.55], [0.14, 2.58], [0.16, 2.36], [0.19, 2.10], [0.31, 1.90], [0.10, 1.84], [-0.20, 1.86]]), 0.06, m_aleta)
# Segunda dorsal, pequeña
aleta3d("TB_Aleta_Dorsal2", plano_yz([[0.90, 1.64], [1.02, 1.74], [1.10, 1.78], [1.13, 1.70], [1.06, 1.62]]), 0.02, m_aleta)
# Cola en media luna: lóbulo alto y bajo (medidos en el perfil)
aleta3d("TB_Cola_Alta", plano_yz([[1.36, 1.62], [1.62, 1.80], [1.88, 2.03], [2.13, 2.14], [1.98, 1.96], [1.86, 1.78], [1.78, 1.55], [1.42, 1.44]]), 0.05, m_aleta)
aleta3d("TB_Cola_Baja", plano_yz([[1.40, 1.48], [1.77, 1.50], [1.80, 1.26], [1.85, 1.04], [1.89, 0.84], [1.74, 0.98], [1.60, 1.18], [1.40, 1.36]]), 0.045, m_aleta)

# Pectorales: raíz en el costado, punta fuera, abajo y atrás (frente, perfil y cenital coinciden)
for lado in [-1, 1]:
    raiz_del = [lado * 0.40, -0.76, 1.22]
    raiz_tras = [lado * 0.38, -0.40, 1.10]
    punta = [lado * 0.97, -0.06, 0.70]
    medio_del = [lado * 0.70, -0.46, 0.98]   # borde de ataque algo convexo
    medio_tras = [lado * 0.62, -0.20, 0.96]  # borde de salida cóncavo
    aleta3d("TB_Aleta_Pectoral_" + str(lado), [raiz_del, medio_del, [lado * 0.88, -0.20, 0.78], punta, medio_tras, raiz_tras, [lado * 0.33, -0.58, 1.20]], 0.05, m_aleta)

# ==========================================
# 4. PATAS: nacen dentro del cuerpo y se ensanchan al llegar a él, como un anca,
#    para que la unión sea suave. Misma foto que el cuerpo, así no hay salto de color.
# ==========================================
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

# Medidas de la hoja: patas de unos 30 cm de grueso (frente y espalda), centradas en x = ±0.345;
# la delantera baja en y = -0.45..-0.58 y la trasera tiene el muslo en y ~ 1.0 y la caña en y ~ 1.33.
for lado in [-1, 1]:
    # Delantera: nace estrecha muy dentro del cuerpo y se abre al cruzar la piel, como un
    # hombro, en vez de clavarse en la barriga como un tubo.
    puntos = [
        [lado * 0.10, -0.50, 1.55],
        [lado * 0.20, -0.48, 1.25],
        [lado * 0.28, -0.46, 1.00],
        [lado * 0.33, -0.47, 0.82],
        [lado * 0.345, -0.51, 0.63],
        [lado * 0.345, -0.53, 0.43],
        [lado * 0.345, -0.57, 0.23],
        [lado * 0.345, -0.58, 0.12],
    ]
    radios = [0.14, 0.28, 0.29, 0.24, 0.17, 0.15, 0.155, 0.16]
    tubo("TB_Pata_Del_" + str(lado), puntos, radios, m_pata, n=18, aplastar=[0.9, 0.8, 0.75, 0.75, 0.95, 1.0, 1.0, 1.0])
    pie("TB_PieD_" + str(lado), [lado * 0.345, -0.45, 0.0], lado, 0.60, 0.42)

    # Trasera: anca grande que entra suave en el cuerpo, rodilla atrás y caña vertical
    puntos = [
        [lado * 0.08, 0.90, 1.55],
        [lado * 0.18, 0.93, 1.30],
        [lado * 0.27, 0.95, 1.05],
        [lado * 0.32, 1.00, 0.85],
        [lado * 0.34, 1.15, 0.63],
        [lado * 0.345, 1.30, 0.48],
        [lado * 0.345, 1.33, 0.30],
        [lado * 0.345, 1.33, 0.16],
        [lado * 0.345, 1.32, 0.10],
    ]
    radios = [0.14, 0.30, 0.34, 0.32, 0.26, 0.16, 0.14, 0.14, 0.15]
    tubo("TB_Pata_Tras_" + str(lado), puntos, radios, m_pata, n=18, aplastar=[0.8, 0.65, 0.58, 0.58, 0.65, 0.95, 1.0, 1.0, 1.0])
    pie("TB_PieT_" + str(lado), [lado * 0.345, 1.42, 0.0], lado, 0.52, 0.42)

# Suelo pequeño para que la vista general encuadre bien
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=2.6, depth=0.04, location=(0, -0.1, -0.02))
suelo = bpy.context.active_object
suelo.name = "TB_Suelo"
asignar_mat(suelo, material("TB_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
