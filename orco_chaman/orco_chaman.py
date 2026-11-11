import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# ORCO CHAMÁN (versión para juego)
# ==============================================================================
# Hecho a partir de la hoja de vistas del usuario (captura del móvil, 1174 x 472 px):
# frente, perfil (mirando a la izquierda), espalda y el bastón de cuernas. Pose A, mirando
# a -Y. Escala 0,5 cm por píxel (2,1 m). Piel: atlas de 1024 px con esas cuatro vistas
# (public/textures/orco_chaman_atlas.jpg). La hoja es pequeña: con la imagen original
# (no la captura) la piel saldría bastante más nítida.
# El bastón se llama "OR_Baston": al animar como humanoide va rígido en la mano derecha.
# Ejes: X = ancho (el lado derecho del personaje en -X), Y = fondo (mira a -Y), Z = altura.
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


# ==========================================
# 1. ESCALA, ATLAS Y VISTAS
# ==========================================
HOJA = "orco_chaman_atlas"
E = 0.005
SA = 1.18656
SUELO = 450

def x_de(px):
    return (px - 163.5) * E

def y_de(px):
    return (px - 390) * E

def z_de(py):
    return (SUELO - py) * E

def q(fx, sx, py):
    return [x_de(fx), y_de(sx), z_de(py)]

def frente_a(px, py):
    return [(px - 8) * SA, (py - 19) * SA]

def perfil_a(px, py):
    return [370.21 + (px - 319) * SA, (py - 19) * SA]

def espalda_a(px, py):
    return [542.26 + (px - 628) * SA, (py - 19) * SA]

def baston_a(px, py):
    return [905.34 + (px - 918) * SA, (py - 19) * SA]

def vista(eje, lado, a0, a1, h0, h1, w0, w1, peso):
    return [eje, lado, a0[0], a0[1], a1[0], a1[1], h0, h1, w0, w1, peso]

V_FRENTE = vista("y", -1, frente_a(23.5, 29), frente_a(303.5, 450), x_de(23.5), x_de(303.5), z_de(29), 0.0, 1.3)
V_ESPALDA = vista("y", 1, espalda_a(643.75, 29), espalda_a(923.75, 450), -x_de(23.5), -x_de(303.5), z_de(29), 0.0, 1.3)
V_PERFIL = vista("x", 0, perfil_a(329, 29), perfil_a(454, 450), y_de(329), y_de(454), z_de(29), 0.0, 1.0)

def material_foto(nombre, vistas, rugosidad=0.8):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

m_cuerpo = material_foto("OR_Cuerpo", [V_FRENTE, V_PERFIL, V_ESPALDA])

# ==========================================
# 2. CABEZA, COLETA Y TRONCO
# ==========================================
tubo("OR_Cabeza", [q(163, 372, 34), q(163, 372, 50), q(163, 374, 75), q(163, 372, 95), q(163, 380, 110)],
     [0.03, 0.08, 0.125, 0.115, 0.08], m_cuerpo, n=16, aplastar=1.05)
tubo("OR_Coleta", [q(163, 412, 48), q(163, 428, 70), q(163, 436, 120), q(163, 438, 190)], [0.05, 0.045, 0.035, 0.015], m_cuerpo, n=8, aplastar=0.7)
# tronco: [fila, medio ancho (frente), medio fondo (perfil)]
TRONCO = [[105, 0.07, 0.07], [125, 0.28, 0.2], [160, 0.28, 0.22], [200, 0.23, 0.22], [245, 0.32, 0.22],
          [290, 0.36, 0.22], [322, 0.32, 0.2]]
pts = []
rad = []
apl = []
for t in TRONCO:
    pts.append(q(163.5, 390, t[0]))
    rad.append(t[2])
    apl.append(t[1] / t[2])
tubo("OR_Tronco", pts, rad, m_cuerpo, n=22, aplastar=apl)
# hombreras de calavera
for lado in [-1, 1]:
    esfera("OR_Hombrera_" + str(lado), [lado * 0.32, y_de(392), z_de(118)], 0.5, m_cuerpo, escala=(0.3, 0.3, 0.26))

# ==========================================
# 3. BRAZOS, MANOS CON DEDOS Y PIERNAS
# ==========================================
def mano(pref, palma, punta, lado):
    for d in range(4):
        f = (d - 1.5) / 1.5
        base = [palma[0], palma[1] + f * 0.035, palma[2]]
        fin = [punta[0] - lado * abs(f) * 0.01, punta[1] + f * 0.045, punta[2] + abs(f) * 0.02]
        tubo(pref + "_Dedo_" + str(d), [base, fin], [0.022, 0.016], m_cuerpo, n=6)
    pul = [palma[0] + lado * 0.01, palma[1] - 0.05, palma[2] + 0.02]
    tubo(pref + "_Pulgar", [pul, [pul[0], pul[1] - 0.04, pul[2] - 0.05]], [0.022, 0.014], m_cuerpo, n=6)

brazo_d = [q(95, 390, 125), q(75, 388, 160), q(55, 384, 195), q(42, 380, 230), q(40, 376, 252)]
tubo("OR_Brazo_D", brazo_d, [0.1, 0.085, 0.075, 0.085, 0.07], m_cuerpo, n=14)
esfera("OR_Palma_D", q(40, 374, 262), 0.5, m_cuerpo, escala=(0.1, 0.13, 0.11))
mano("OR_Mano_D", q(40, 374, 268), q(36, 374, 290), -1)
brazo_i = [q(232, 390, 125), q(255, 388, 160), q(275, 384, 195), q(288, 380, 230), q(295, 376, 252)]
tubo("OR_Brazo_I", brazo_i, [0.1, 0.085, 0.075, 0.085, 0.07], m_cuerpo, n=14)
esfera("OR_Palma_I", q(296, 374, 262), 0.5, m_cuerpo, escala=(0.1, 0.13, 0.11))
mano("OR_Mano_I", q(296, 374, 268), q(300, 374, 290), 1)

for lado in [-1, 1]:
    fx = 116
    if lado > 0:
        fx = 208
    pierna = [q(fx, 386, 300), q(fx, 382, 345), q(fx, 380, 380), q(fx - lado * 2, 380, 412), q(fx - lado * 2, 382, 432)]
    tubo("OR_Pierna_" + str(lado), pierna, [0.13, 0.12, 0.15, 0.1, 0.11], m_cuerpo, n=14)
    esfera("OR_Pie_" + str(lado), q(fx - lado * 6, 372, 441), 0.5, m_cuerpo, escala=(0.26, 0.4, 0.09))

# ==========================================
# 4. BASTÓN DE CUERNAS EN LA MANO DERECHA
# ==========================================
MANO = q(40, 374, 262)
def bp(px, py):
    # punto del bastón: su vista de la hoja va de frente, con el agarre (columna 977) en la mano
    return [MANO[0] + (px - 977) * E, MANO[1], z_de(py)]

V_BASTON = vista("y", 0, baston_a(927, 29), baston_a(1007, 450), MANO[0] + (927 - 977) * E, MANO[0] + (1007 - 977) * E, z_de(29), 0.0, 1.0)
m_baston = material_foto("OR_BastonMat", [V_BASTON], 0.75)
tubo("OR_Baston", [bp(980, 445), bp(979, 404), bp(974, 344), bp(976, 296), bp(980, 272), bp(975, 236), bp(981, 212), bp(978, 180), bp(970, 120), bp(968, 92)],
     [0.03, 0.03, 0.032, 0.03, 0.034, 0.03, 0.03, 0.03, 0.026, 0.02], m_baston, n=8)
tubo("OR_Baston_Cuerna_I", [bp(966, 175), bp(950, 140), bp(941, 90), bp(950, 44)], [0.022, 0.018, 0.014, 0.006], m_baston, n=6)
tubo("OR_Baston_Cuerna_D", [bp(984, 175), bp(994, 140), bp(1000, 92), bp(996, 46)], [0.022, 0.018, 0.014, 0.006], m_baston, n=6)
tubo("OR_Baston_Travesano", [bp(948, 104), bp(968, 100), bp(988, 104)], [0.014, 0.016, 0.014], m_baston, n=6)

# Suelo pequeño para que la vista general encuadre bien
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1.0, depth=0.02, location=(0, 0, -0.01))
suelo = bpy.context.active_object
suelo.name = "OR_Suelo"
asignar_mat(suelo, material("OR_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
