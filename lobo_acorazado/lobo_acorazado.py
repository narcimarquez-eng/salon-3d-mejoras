import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# LOBO ACORAZADO (bestia negra con placas de armadura, cuernos y cola de púas)
# ==============================================================================
# Hecho a partir de la hoja de vistas del usuario: frente, perfil con cola (2.ª figura,
# mirando a la izquierda; el otro costado usa la misma foto volteada), espalda y cenital.
# Medidas en la hoja: frente, perfil y espalda a 0,6 cm por píxel; la cenital a 0,549.
# PENSADO PARA JUEGOS: la piel no es la hoja entera sino un atlas de 1024 px con solo las
# cuatro vistas (public/textures/lobo_acorazado_atlas.jpg, 120 KB), hecho con
# .claude/skills/salon3d-glb/scripts/atlas_vistas.py. Las medidas siguen en píxeles de la
# hoja y se pasan al atlas con las funciones de abajo.
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
# 1. ESCALAS, ATLAS Y VISTAS
# ==========================================
HOJA = "lobo_acorazado_atlas"
ESC = 0.006
ESC_T = 0.005486
SUELO = 575
Y_HOCICO = -1.6
S_ATLAS = 1.11668          # escala hoja -> atlas (lo imprime atlas_vistas.py)

def y_de(px):
    return Y_HOCICO + (px - 352) * ESC

def z_de(py):
    return (SUELO - py) * ESC

def p(px, py, x=0.0):
    return [x, y_de(px), z_de(py)]

# Hoja -> atlas, vista por vista
def perfil_a(px, py):
    return [(px - 342) * S_ATLAS, (py - 242) * S_ATLAS]

def frente_a(px, py):
    return [749.30 + (px - 72) * S_ATLAS, (py - 243) * S_ATLAS]

def espalda_a(px, py):
    return [(px - 1414) * S_ATLAS, 384.14 + (py - 242) * S_ATLAS]

def cenital_a(px, py):
    # la cenital va girada en el atlas: la cabeza queda a la izquierda
    return [(py - 66) * S_ATLAS, 768.28 + (263 - (px - 1672)) * S_ATLAS]

def vista(eje, lado, a0, a1, h0, h1, w0, w1, peso):
    return [eje, lado, a0[0], a0[1], a1[0], a1[1], h0, h1, w0, w1, peso]

V_PERFIL = vista("x", 0, perfil_a(352, 252), perfil_a(1003, 575), y_de(352), y_de(1003), z_de(252), 0.0, 1.6)
V_FRENTE = vista("y", -1, frente_a(95, 253), frente_a(295, 575), -0.6, 0.6, z_de(253), 0.0, 1.2)
V_ESPALDA = vista("y", 1, espalda_a(1429, 252), espalda_a(1629, 575), 0.6, -0.6, z_de(252), 0.0, 1.2)
# cenital: horizontal = Y (cabeza en la fila 76 de la hoja), vertical = X (centro en la columna 1804)
c0 = cenital_a(1904, 76)
c1 = cenital_a(1704, 788)
V_CENITAL = ["z", 1, c0[0], c0[1], c1[0], c1[1], Y_HOCICO, Y_HOCICO + 712 * ESC_T, 100 * ESC_T, -100 * ESC_T, 1.0]

def material_foto(nombre, vistas, rugosidad=0.8, barniz=0.0):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad, barniz=barniz)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

m_piel = material_foto("LA_Piel", [V_PERFIL, V_CENITAL, V_FRENTE, V_ESPALDA])
m_pata = material_foto("LA_Patas", [V_PERFIL, V_FRENTE, V_ESPALDA], 0.85, 0.0)
m_garra = material("LA_Garra", (0.015, 0.015, 0.018, 1.0), 0.35, barniz=0.5)

# ==========================================
# 2. CUERPO: del hocico a la punta de la cola en una pieza
# ==========================================
# Perfil: [px, arriba (placas sin púas), abajo (mandíbula, pecho, barriga, cola)]
PERFIL = [
    [352, 396, 404], [368, 381, 420], [384, 352, 436], [400, 337, 438], [416, 326, 434],
    [432, 313, 434], [448, 301, 430], [464, 294, 433], [480, 282, 438], [496, 281, 443],
    [512, 274, 456], [528, 270, 464], [544, 267, 471], [560, 273, 474], [576, 275, 474],
    [592, 278, 474], [608, 286, 472], [624, 294, 470], [640, 309, 466], [656, 318, 460],
    [672, 330, 453], [688, 333, 450], [704, 334, 450], [720, 333, 452], [736, 338, 447],
    [752, 344, 440], [768, 350, 428], [784, 362, 414], [800, 368, 414], [832, 376, 415],
    [864, 383, 415], [896, 388, 415], [928, 392, 413], [960, 395, 410], [976, 397, 407],
    [992, 399, 403], [1003, 400, 401],
]
# Cenital: [fila de la hoja, medio ancho en px] (cabeza en la fila 76)
CENITAL = [
    [76, 2], [96, 18], [116, 32], [136, 42], [156, 56], [176, 64], [216, 60], [236, 96],
    [256, 112], [276, 116], [296, 116], [316, 108], [336, 106], [356, 90], [376, 68],
    [396, 60], [416, 54], [436, 54], [456, 66], [476, 74], [496, 76], [516, 74], [536, 70],
    [556, 50], [576, 32], [596, 24], [616, 23], [656, 17], [696, 15], [736, 13], [776, 5], [788, 2],
]

def seccion(y):
    px = (y - Y_HOCICO) / ESC + 352
    top = z_de(interp(PERFIL, px, 1))
    bot = z_de(interp(PERFIL, px, 2))
    fila = (y - Y_HOCICO) / ESC_T + 76
    hw = interp(CENITAL, fila, 1) * ESC_T
    if hw < 0.01:
        hw = 0.01
    zc = bot + (top - bot) * 0.5
    return [zc, top - zc, zc - bot, hw]

Y0 = Y_HOCICO
Y1 = y_de(1003)
NS = 70
NT = 28
verts = []
for i in range(NS + 1):
    t = i / NS
    y = Y0 + (Y1 - Y0) * t
    q = seccion(y)
    for k in range(NT):
        ang = 2 * math.pi * k / NT
        c = math.cos(ang)
        sn = math.sin(ang)
        if sn >= 0:
            z = q[0] + math.pow(sn, 0.85) * q[1]
        else:
            z = q[0] - math.pow(-sn, 0.9) * q[2]
        x = c * q[3] * (1.0 - 0.08 * sn)
        if abs(c) > 0.0:
            x = x * math.pow(abs(c), -0.12)
        verts.append((x, y, z))
caras = []
for i in range(NS):
    for k in range(NT):
        k2 = (k + 1) % NT
        caras.append((i * NT + k, (i + 1) * NT + k, (i + 1) * NT + k2, i * NT + k2))
ip = len(verts)
verts.append((0.0, Y0 - 0.01, seccion(Y0)[0]))
iq = len(verts)
verts.append((0.0, Y1 + 0.01, seccion(Y1)[0]))
for k in range(NT):
    k2 = (k + 1) % NT
    caras.append((ip, k2, k))
    caras.append((iq, NS * NT + k, NS * NT + k2))
malla("LA_Cuerpo", verts, caras, m_piel)

# ==========================================
# 3. CUERNOS Y PÚAS (puntas medidas en el perfil y en el frente)
# ==========================================
for lado in [-1, 1]:
    cuerno = [p(420, 330, lado * 0.20), p(428, 312, lado * 0.30), p(432, 296, lado * 0.38), p(428, 284, lado * 0.44), p(420, 279, lado * 0.46)]
    tubo("LA_Cuerno_" + str(lado), cuerno, [0.06, 0.05, 0.038, 0.024, 0.004], m_piel, n=10)

PUAS = [[457, 276], [491, 266], [551, 252], [745, 337], [791, 356], [814, 361], [837, 364], [858, 366],
        [883, 369], [911, 375], [938, 377], [960, 382]]
for i in range(len(PUAS)):
    q = PUAS[i]
    y = y_de(q[0])
    base = seccion(y)
    z_base = base[0] + base[1] - 0.03
    alto = z_de(q[1]) - z_base
    if alto > 0.03:
        cono("LA_Pua_" + str(i), (0, y + alto * 0.25, z_base + alto * 0.5), 0.03 + alto * 0.45, 0.003, alto, m_piel, vertices=6, rot=(-0.55, 0, 0))
        bpy.context.active_object.scale = (0.45, 1.0, 1.0)

# ==========================================
# 4. PATAS (frente: x = ±0.336; espalda: x = ±0.31)
# ==========================================
for lado in [-1, 1]:
    puntos = [p(572, 400, lado * 0.14), p(576, 445, lado * 0.26), p(578, 485, lado * 0.32), p(575, 505, lado * 0.336),
              p(569, 525, lado * 0.336), p(566, 545, lado * 0.336), p(562, 560, lado * 0.336)]
    tubo("LA_Pata_Del_" + str(lado), puntos, [0.16, 0.24, 0.19, 0.16, 0.13, 0.13, 0.14], m_pata, n=16,
         aplastar=[0.9, 0.8, 0.85, 0.95, 1.05, 1.1, 1.1])
    pie("LA_PieD_" + str(lado), [lado * 0.336, y_de(560), 0.0], lado, 0.42, 0.32)
    puntos = [p(715, 400, lado * 0.12), p(722, 430, lado * 0.22), p(733, 460, lado * 0.29), p(752, 485, lado * 0.31),
              p(776, 503, lado * 0.31), p(786, 520, lado * 0.31), p(784, 540, lado * 0.31), p(778, 558, lado * 0.31)]
    tubo("LA_Pata_Tras_" + str(lado), puntos, [0.16, 0.25, 0.26, 0.22, 0.16, 0.13, 0.12, 0.13], m_pata, n=16,
         aplastar=[0.85, 0.7, 0.7, 0.75, 0.9, 1.05, 1.1, 1.1])
    pie("LA_PieT_" + str(lado), [lado * 0.31, y_de(780), 0.0], lado, 0.4, 0.3)

# Suelo pequeño para que la vista general encuadre bien
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=2.3, depth=0.03, location=(0, 0.3, -0.015))
suelo = bpy.context.active_object
suelo.name = "LA_Suelo"
asignar_mat(suelo, material("LA_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
