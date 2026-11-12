import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# TITÁN (versión para juego)
# ==============================================================================
# Hecho a partir de la fila de arriba de la hoja del usuario (la foto real; la fila de colores
# no se usa): frente, perfil (mira a la derecha de la foto: el script lo voltea) y espalda.
# Pose A, mirando a -Y. Escala 0,25 cm por píxel (2 m). Piel: atlas de 1536 x 836 px
# (public/textures/titan_atlas.jpg) con las tres vistas.
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
HOJA = "titan_atlas"
E = 0.0025
SA = 1.00261
SUELO = 840
CX = 337.5       # eje del cuerpo en el frente
CB = 2207        # eje del cuerpo en la espalda
CY = 1000        # centro del cuerpo en el perfil

def x_de(px):
    return (px - CX) * E

def y_de(px):
    return -(px - CY) * E

def z_de(py):
    return (SUELO - py) * E

def q(fx, sx, py):
    return [x_de(fx), y_de(sx), z_de(py)]

def frente_a(px, py):
    return [(px - 6) * SA, (py - 14) * SA]

def perfil_a(px, py):
    return [664.73 + (px - 884) * SA, (py - 14) * SA]

def espalda_a(px, py):
    return [898.34 + (px - 1889) * SA, (py - 14) * SA]

def vista(eje, lado, a0, a1, h0, h1, w0, w1, peso):
    return [eje, lado, a0[0], a0[1], a1[0], a1[1], h0, h1, w0, w1, peso]

V_FRENTE = vista("y", -1, frente_a(16, 24), frente_a(659, 840), x_de(16), x_de(659), z_de(24), 0.0, 1.3)
V_ESPALDA = vista("y", 1, espalda_a(CB - 321.5, 24), espalda_a(CB + 321.5, 840), 321.5 * E, -321.5 * E, z_de(24), 0.0, 1.3)
V_PERFIL = vista("x", 0, perfil_a(894, 24), perfil_a(1107, 840), y_de(894), y_de(1107), z_de(24), 0.0, 1.0)

def material_foto(nombre, vistas, rugosidad=0.7):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

m_cuerpo = material_foto("TI_Piel", [V_FRENTE, V_PERFIL, V_ESPALDA])

# ==========================================
# 2. CABEZA CON MELENA, OREJAS Y CUELLO
# ==========================================
tubo("TI_Cabeza", [q(CX, 1012, 30), q(CX, 1012, 55), q(CX, 1010, 95), q(CX, 1015, 140), q(CX, 1020, 175), q(CX, 1010, 200)],
     [0.03, 0.12, 0.165, 0.17, 0.14, 0.09], m_cuerpo, n=18, aplastar=[1.0, 0.9, 0.85, 0.85, 0.8, 0.9])
# melena que cae por la espalda y los lados
tubo("TI_Melena", [q(CX, 975, 80), q(CX, 955, 150), q(CX, 945, 205), q(CX, 950, 250)], [0.15, 0.17, 0.14, 0.06], m_cuerpo, n=14, aplastar=1.25)
for lado in [-1, 1]:
    tubo("TI_Oreja_" + str(lado), [[lado * 0.15, y_de(1000), z_de(118)], [lado * 0.2, y_de(990), z_de(95)], [lado * 0.24, y_de(985), z_de(72)]],
         [0.03, 0.018, 0.003], m_cuerpo, n=6, aplastar=0.5)
tubo("TI_Cuello", [q(CX, 1005, 180), q(CX, 1000, 225)], [0.13, 0.15], m_cuerpo, n=14)

# ==========================================
# 3. TRONCO: [fila, medio ancho (frente), medio fondo (perfil), centro en el perfil]
# ==========================================
TRONCO = [[220, 105, 70, 990], [250, 125, 78, 990], [290, 112, 82, 996], [330, 96, 72, 1000],
          [380, 78, 62, 1003], [430, 80, 62, 1000], [470, 86, 68, 995], [500, 92, 70, 1000], [525, 70, 58, 1005]]
pts = []
rad = []
apl = []
for t in TRONCO:
    pts.append(q(CX, t[3], t[0]))
    rad.append(t[2] * E)
    apl.append(t[1] / t[2])
tubo("TI_Tronco", pts, rad, m_cuerpo, n=26, aplastar=apl)
# hombros (deltoides)
for lado in [-1, 1]:
    # algo adelantados: detrás, en la foto de perfil, cuelga el pelo
    esfera("TI_Hombro_" + str(lado), [lado * 0.31, y_de(1010), z_de(262)], 0.5, m_cuerpo, escala=(0.18, 0.17, 0.22))

# ==========================================
# 4. BRAZOS EN POSE A, MANOS CON DEDOS Y PIERNAS CON PIES
# ==========================================
def mano(pref, palma, punta, lado):
    for d in range(4):
        f = (d - 1.5) / 1.5
        base = [palma[0], palma[1] + f * 0.03, palma[2]]
        fin = [punta[0] - lado * abs(f) * 0.01, punta[1] + f * 0.04, punta[2] + abs(f) * 0.018]
        medio = [(base[0] + fin[0]) / 2 + lado * 0.01, (base[1] + fin[1]) / 2, (base[2] + fin[2]) / 2]
        tubo(pref + "_Dedo_" + str(d), [base, medio, fin], [0.017, 0.015, 0.01], m_cuerpo, n=7)
    pul = [palma[0] - lado * 0.01, palma[1] - 0.05, palma[2] + 0.02]
    tubo(pref + "_Pulgar", [pul, [pul[0] - lado * 0.01, pul[1] - 0.04, pul[2] - 0.05]], [0.018, 0.011], m_cuerpo, n=7)

# centros del brazo en el frente (fila, columna) del lado derecho del personaje (izquierda de la foto)
BRAZO = [[250, 215, 0.075], [290, 200, 0.07], [315, 193, 0.068], [340, 171, 0.06], [365, 144, 0.055],
         [390, 128, 0.05], [415, 108, 0.045], [440, 80, 0.038], [465, 61, 0.034], [490, 48, 0.034]]
for lado in [-1, 1]:
    pts = []
    rad = []
    for b in BRAZO:
        col = b[1]
        if lado > 0:
            col = 2 * CX - b[1]
        pts.append(q(col, 1000, b[0]))
        rad.append(b[2])
    tubo("TI_Brazo_" + str(lado), pts, rad, m_cuerpo, n=16)
    palma = 45
    punta = 22
    if lado > 0:
        palma = 2 * CX - 45
        punta = 2 * CX - 22
    esfera("TI_Palma_" + str(lado), q(palma, 1005, 492), 0.5, m_cuerpo, escala=(0.07, 0.09, 0.08))
    mano("TI_Mano_" + str(lado), q(palma, 1005, 500), q(punta, 1005, 535), lado)

# la pierna nace dentro de la cadera y se abre al salir (unión suave); llega hasta el pie
PIERNA = [[455, 312, 1000, 0.08], [490, 296, 1000, 0.125], [530, 288, 1000, 0.125], [580, 282, 1006, 0.1],
          [630, 279, 1003, 0.085], [680, 274, 992, 0.082], [730, 271, 986, 0.065], [780, 268, 988, 0.052],
          [815, 266, 995, 0.05]]
for lado in [-1, 1]:
    pts = []
    rad = []
    for p in PIERNA:
        col = p[1]
        if lado > 0:
            col = 2 * CX - p[1] + 4
        pts.append(q(col, p[2], p[0]))
        rad.append(p[3])
    tubo("TI_Pierna_" + str(lado), pts, rad, m_cuerpo, n=16)
    pie_x = 262
    if lado > 0:
        pie_x = 2 * CX - 262
    esfera("TI_Pie_" + str(lado), q(pie_x, 1030, 822), 0.5, m_cuerpo, escala=(0.12, 0.34, 0.075))

bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1.0, depth=0.02, location=(0, 0, -0.01))
suelo = bpy.context.active_object
suelo.name = "TI_Suelo"
asignar_mat(suelo, material("TI_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
