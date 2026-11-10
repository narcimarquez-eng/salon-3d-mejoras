import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# PONI (tipo Shetland, pelo largo)
# ==============================================================================
# Hecho a partir de la hoja de vistas del usuario: frente, perfil (2.ª columna, mirando a
# la izquierda; el otro costado usa la misma foto volteada), espalda y cenital.
# Medidas tomadas en la hoja: frente, perfil y espalda a 0,28 cm por píxel (cruz a ~1,05 m);
# la cenital a 0,314 cm por píxel. La piel es la propia foto (mat.color_map_views).
# Hoja preparada en public/textures/pony_hoja.jpg.
# Ejes: Y = largo (el morro mira a Y negativo), X = ancho, Z = altura. Metros.
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
# 1. MATERIALES: la foto proyectada
# ==========================================
HOJA = "pony_hoja"
ESC = 0.0028           # metros por píxel en frente, perfil y espalda
ESC_TOP = 0.00314      # metros por píxel en la cenital
PX_Y0 = 800            # píxel del perfil que cae en y = 0
SUELO = 945            # fila del suelo

def y_de(px):
    return (px - PX_Y0) * ESC

def z_de(py):
    return (SUELO - py) * ESC

Y_MORRO = y_de(498)
ALTO = z_de(460)

VISTAS = [
    ["x", 0, 498, 460, 1097, 945, y_de(498), y_de(1097), ALTO, 0.0, 1.6],              # perfil
    ["z", 1, 2316, 616, 2850, 816, Y_MORRO, Y_MORRO + 534 * ESC_TOP, 100 * ESC_TOP, -100 * ESC_TOP, 1.0],  # cenital
    ["y", -1, 160, 460, 360, 945, -0.28, 0.28, ALTO, 0.0, 1.2],                        # frente
    ["y", 1, 1970, 460, 2170, 945, 0.28, -0.28, ALTO, 0.0, 1.2],                       # espalda
]
VISTAS_PATAS = [
    ["x", 0, 498, 460, 1097, 945, y_de(498), y_de(1097), ALTO, 0.0, 1.3],
    ["y", -1, 160, 460, 360, 945, -0.28, 0.28, ALTO, 0.0, 1.0],
    ["y", 1, 1970, 460, 2170, 945, 0.28, -0.28, ALTO, 0.0, 1.0],
]

def material_foto(nombre, vistas, rugosidad=0.85, barniz=0.0):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad, barniz=barniz)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

m_piel = material_foto("PN_Pelo", VISTAS)
m_pata = material_foto("PN_Patas", VISTAS_PATAS)
m_garra = material("PN_Casco", (0.03, 0.028, 0.026, 1.0), 0.6)

# ==========================================
# 2. CUERPO: del morro a la grupa en una sola pieza (cabeza, cuello con crin y tronco)
# ==========================================
# Perfil: [px, arriba, abajo] (abajo ya va 6 px por dentro de la silueta)
PERFIL = [
    [498, 630, 640], [508, 610, 652], [518, 590, 656], [538, 506, 664], [558, 490, 666],
    [578, 482, 664], [598, 480, 646], [618, 476, 630], [638, 482, 650], [658, 488, 676],
    [678, 494, 708], [698, 508, 740], [718, 516, 752], [738, 531, 758], [758, 542, 762],
    [778, 546, 764], [798, 550, 764], [818, 560, 768], [838, 574, 771], [858, 575, 772],
    [878, 572, 769], [898, 569, 765], [918, 565, 758], [938, 562, 750], [958, 560, 748],
    [978, 563, 745], [1000, 570, 736], [1020, 583, 720], [1040, 597, 696], [1058, 604, 668],
    [1072, 618, 640],
]
# Cenital: [px, medio ancho en px] (centro en la fila 716)
CENITAL = [
    [2316, 3], [2326, 14], [2336, 20], [2356, 34], [2376, 40], [2396, 42], [2416, 44],
    [2436, 48], [2456, 52], [2476, 54], [2496, 60], [2516, 66], [2536, 67], [2556, 68],
    [2576, 74], [2596, 80], [2616, 84], [2636, 86], [2656, 84], [2676, 82], [2696, 76],
    [2716, 76], [2736, 74], [2756, 66], [2776, 50], [2790, 30],
]

def seccion(y):
    px = y / ESC + PX_Y0
    top = z_de(interp(PERFIL, px, 1))
    bot = z_de(interp(PERFIL, px, 2))
    pxc = (y - Y_MORRO) / ESC_TOP + 2316
    hw = interp(CENITAL, pxc, 1) * ESC_TOP
    if hw < 0.012:
        hw = 0.012
    zc = bot + (top - bot) * 0.5
    return [zc, top - zc, zc - bot, hw]

Y0 = Y_MORRO
Y1 = y_de(1072)
NS = 56
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
        x = c * p[3] * (1.0 - 0.05 * sn)
        if abs(c) > 0.0:
            x = x * math.pow(abs(c), -0.1)
        verts.append((x, y, z))
caras = []
for i in range(NS):
    for k in range(NT):
        k2 = (k + 1) % NT
        caras.append((i * NT + k, (i + 1) * NT + k, (i + 1) * NT + k2, i * NT + k2))
ip = len(verts)
p0 = seccion(Y0)
verts.append((0.0, Y0 - 0.008, p0[0]))
iq = len(verts)
p1 = seccion(Y1)
verts.append((0.0, Y1 + 0.008, p1[0]))
for k in range(NT):
    k2 = (k + 1) % NT
    caras.append((ip, k2, k))
    caras.append((iq, NS * NT + k, NS * NT + k2))
malla("PN_Cuerpo", verts, caras, m_piel)

# ==========================================
# 3. OREJAS Y COLA
# ==========================================
for lado in [-1, 1]:
    cono("PN_Oreja_" + str(lado), (lado * 0.155, y_de(588), z_de(484)), 0.035, 0.004, 0.10, m_piel, vertices=8, rot=(0.15, lado * 0.45, 0))
    bpy.context.active_object.scale = (1.0, 0.6, 1.0)

# Cola larga de pelo: nace en la grupa y cae casi hasta el suelo (perfil y espalda)
cola = [[0, y_de(1052), z_de(612)], [0, y_de(1062), z_de(650)], [0, y_de(1062), z_de(720)], [0, y_de(1058), z_de(790)], [0, y_de(1056), z_de(850)], [0, y_de(1054), z_de(888)]]
tubo("PN_Cola", cola, [0.04, 0.05, 0.055, 0.05, 0.04, 0.02], m_piel, n=12, aplastar=0.6)

# ==========================================
# 4. PATAS: finas, con casco; nacen dentro del cuerpo y se abren al salir
# ==========================================
def casco(pref, centro):
    cono(pref + "_Casco", (centro[0], centro[1], 0.035), 0.062, 0.05, 0.07, m_garra, vertices=14)

for lado in [-1, 1]:
    # Delantera (x = ±0.095 en el frente; y ~ -0.13 en el perfil)
    puntos = [
        [lado * 0.05, y_de(752), z_de(690)],
        [lado * 0.085, y_de(752), z_de(745)],
        [lado * 0.095, y_de(758), z_de(785)],
        [lado * 0.095, y_de(756), z_de(830)],
        [lado * 0.095, y_de(752), z_de(870)],
        [lado * 0.095, y_de(752), z_de(905)],
        [lado * 0.095, y_de(750), z_de(925)],
    ]
    radios = [0.09, 0.11, 0.085, 0.065, 0.055, 0.06, 0.058]
    tubo("PN_Pata_Del_" + str(lado), puntos, radios, m_pata, n=14, aplastar=[0.9, 0.75, 0.75, 0.8, 0.9, 0.9, 0.9])
    casco("PN_PieD_" + str(lado), [lado * 0.095, y_de(748)])

    # Trasera (x = ±0.11 en la espalda; muslo, corvejón atrás y caña vertical)
    puntos = [
        [lado * 0.05, y_de(985), z_de(660)],
        [lado * 0.10, y_de(990), z_de(720)],
        [lado * 0.11, y_de(995), z_de(780)],
        [lado * 0.11, y_de(1015), z_de(840)],
        [lado * 0.11, y_de(1012), z_de(880)],
        [lado * 0.11, y_de(1005), z_de(910)],
        [lado * 0.11, y_de(998), z_de(925)],
    ]
    radios = [0.10, 0.13, 0.09, 0.06, 0.05, 0.058, 0.058]
    tubo("PN_Pata_Tras_" + str(lado), puntos, radios, m_pata, n=14, aplastar=[0.8, 0.65, 0.7, 0.85, 0.9, 0.9, 0.9])
    casco("PN_PieT_" + str(lado), [lado * 0.11, y_de(996)])

# Suelo pequeño para que la vista general encuadre bien
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1.2, depth=0.02, location=(0, 0, -0.01))
suelo = bpy.context.active_object
suelo.name = "PN_Suelo"
asignar_mat(suelo, material("PN_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
