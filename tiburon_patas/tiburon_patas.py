import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# TIBURÓN BLANCO CON CUATRO PATAS (criatura cuadrúpeda)
# ==============================================================================
# Hecho a partir de la hoja de vistas del usuario (frente, dos perfiles, espalda y
# cenital): cuerpo de tiburón blanco con la barriga blanca, aleta dorsal alta, aletas
# pectorales, cola en media luna y cuatro patas musculosas con garras.
# Proporciones medidas a ojo en la hoja; colores aproximados.
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
    # aplastar < 1 estrecha el tubo de lado (en X).
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
        for k in range(n):
            ang = 2 * math.pi * k / n
            d = sumar(por(a, math.cos(ang) * r), por(b, math.sin(ang) * r))
            d[0] = d[0] * aplastar
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
# 1. MATERIALES
# ==========================================
m_lomo = material("TB_Lomo", (0.085, 0.13, 0.19, 1.0), 0.55, barniz=0.25)
m_barriga = material("TB_Barriga", (0.62, 0.64, 0.66, 1.0), 0.6)
m_pata = material("TB_Pata", (0.075, 0.11, 0.155, 1.0), 0.7)
m_oscuro = material("TB_Oscuro", (0.012, 0.012, 0.016, 1.0), 0.35, barniz=0.6)
m_boca = material("TB_Boca", (0.16, 0.03, 0.035, 1.0), 0.5)
m_diente = material("TB_Diente", (0.85, 0.83, 0.76, 1.0), 0.3)
m_garra = material("TB_Garra", (0.03, 0.035, 0.04, 1.0), 0.4)
m_lomo.texture = "beast_hide"
m_pata.texture = "beast_hide"

# ==========================================
# 2. CUERPO (secciones a lo largo de Y)
# ==========================================
# Medido en el perfil de la hoja: hocico en y = -2.1, base de la cola en y = 1.25.
Y0 = -2.10
Y1 = 1.25

def perfil(s):
    # Devuelve [z_centro, radio_alto, radio_bajo, radio_ancho] a la fracción s del cuerpo.
    # Hocico cónico y romo, máximo grosor hacia s = 0.38, pedúnculo de la cola estrecho.
    if s < 0.38:
        f = s / 0.38
        g = math.pow(math.sin(f * math.pi / 2), 0.62)
    else:
        f = (s - 0.38) / 0.62
        g = 1.0 - 0.86 * math.pow(f, 1.25)
    zc = 1.62 + 0.18 * s * s
    if s < 0.12:
        zc = zc + 0.10 * (0.12 - s) / 0.12
    r_alto = 0.03 + 0.45 * g
    r_bajo = 0.03 + 0.44 * g
    r_ancho = 0.025 + 0.40 * g
    if s > 0.70:
        # pedúnculo aplanado de lado, con quilla
        r_ancho = r_ancho * (1.0 - 0.45 * (s - 0.70) / 0.30)
    return [zc, r_alto, r_bajo, r_ancho]

NS = 34
NT = 28
verts = []
for i in range(NS + 1):
    s = i / NS
    s = s * s * (3 - 2 * s) * 0.35 + s * 0.65   # más secciones en el hocico y la cola
    y = Y0 + (Y1 - Y0) * s
    p = perfil(s)
    for k in range(NT):
        ang = 2 * math.pi * k / NT
        c = math.cos(ang)
        sn = math.sin(ang)
        r = p[1]
        if sn < 0:
            r = p[2]
        # sección algo cuadrada por abajo (barriga plana) y redonda por arriba
        z = p[0] + sn * r
        if sn < 0:
            z = p[0] - math.pow(-sn, 0.8) * r
        x = c * p[3] * (1.0 + 0.08 * sn)
        verts.append((x, y, z))

# Línea de la barriga: más alta en la cabeza (mandíbula blanca) y baja hacia la cola,
# ondulada como en el dibujo.
def limite_barriga(s):
    return -0.22 - 0.10 * math.sin(s * 9.0) * (1.0 - s) + 0.18 * s

caras_lomo = []
caras_barriga = []
for i in range(NS):
    s = (i + 0.5) / NS
    for k in range(NT):
        k2 = (k + 1) % NT
        cara = (i * NT + k, (i + 1) * NT + k, (i + 1) * NT + k2, i * NT + k2)
        ang = 2 * math.pi * (k + 0.5) / NT
        if math.sin(ang) < limite_barriga(s):
            caras_barriga.append(cara)
        else:
            caras_lomo.append(cara)
# punta del hocico y cierre de la cola
ip = len(verts)
verts.append((0.0, Y0 - 0.05, perfil(0)[0] - 0.02))
iq = len(verts)
verts.append((0.0, Y1 + 0.02, perfil(1)[0]))
for k in range(NT):
    k2 = (k + 1) % NT
    caras_lomo.append((ip, k2, k))
    caras_lomo.append((iq, NS * NT + k, NS * NT + k2))

malla("TB_Cuerpo_Lomo", verts, caras_lomo, m_lomo)
malla("TB_Cuerpo_Barriga", verts, caras_barriga, m_barriga)

def punto_cuerpo(s, ang, extra=0.0):
    # Punto de la piel a la fracción s y el ángulo ang (0 = lado +X, pi/2 = lomo).
    p = perfil(s)
    sn = math.sin(ang)
    r = p[1]
    if sn < 0:
        r = p[2]
    z = p[0] + sn * (r + extra)
    x = math.cos(ang) * (p[3] + extra) * (1.0 + 0.08 * sn)
    return [x, Y0 + (Y1 - Y0) * s, z]

# ==========================================
# 3. CABEZA: ojos, boca, dientes, branquias
# ==========================================
for lado in [-1, 1]:
    s_ojo = 0.095
    p = perfil(s_ojo)
    ojo = [lado * (p[3] * 0.93), Y0 + (Y1 - Y0) * s_ojo, p[0] + 0.07]
    esfera("TB_Ojo_" + str(lado), ojo, 0.034, m_oscuro, segmentos=10, anillos=6)

# Boca: línea oscura en media luna bajo el hocico, con una fila de dientes blancos.
NB = 13
boca = []
for i in range(NB):
    t = i / (NB - 1)
    a = math.pi * (0.16 + 0.68 * t)       # de una comisura a otra por debajo
    s = 0.10 + 0.05 * math.sin(a)          # las comisuras van más atrás
    boca.append(punto_cuerpo(s, -a, 0.004))
radios_boca = []
for i in range(NB):
    t = i / (NB - 1)
    radios_boca.append(0.012 + 0.016 * math.sin(t * math.pi))
tubo("TB_Boca", boca, radios_boca, m_boca, n=8)
for i in range(2, NB - 2):
    q = boca[i]
    cono("TB_Diente_" + str(i), (q[0] * 1.02, q[1] - 0.012, q[2] + 0.004), 0.013, 0.0, 0.035, m_diente, vertices=4, rot=(math.pi, 0, 0))

# Hendiduras branquiales: cinco rayas finas inclinadas a cada lado.
for lado in [-1, 1]:
    for g in range(5):
        s = 0.205 + g * 0.026
        ang = 0.05
        if lado < 0:
            ang = math.pi - 0.05
        q = punto_cuerpo(s, ang, -0.004)
        alto = 0.26 - g * 0.02
        caja("TB_Branquia_" + str(lado) + "_" + str(g), q, (0.012, 0.009, alto), m_oscuro, rot=(0.22, 0, 0))

# ==========================================
# 4. ALETAS
# ==========================================
UP = [0.0, 0.0, 1.0]
ATRAS = [0.0, 1.0, 0.0]

# Dorsal: alta, triangular, con el borde de salida cóncavo (u = hacia atrás, v = arriba)
s_d = 0.40
base_d = punto_cuerpo(s_d, math.pi / 2, -0.06)
aleta("TB_Aleta_Dorsal", [[-0.40, 0.0], [-0.18, 0.30], [0.08, 0.62], [0.30, 0.86], [0.24, 0.62], [0.22, 0.40], [0.30, 0.12], [0.42, 0.0]], base_d, ATRAS, UP, 0.07, m_lomo)

# Segunda dorsal y anal, pequeñas
aleta("TB_Aleta_Dorsal2", [[-0.06, 0.0], [0.04, 0.10], [0.07, 0.11], [0.06, 0.0]], punto_cuerpo(0.86, math.pi / 2, -0.02), ATRAS, UP, 0.02, m_lomo)
aleta("TB_Aleta_Anal", [[-0.06, 0.0], [0.04, -0.10], [0.07, -0.11], [0.06, 0.0]], punto_cuerpo(0.86, -math.pi / 2, -0.02), ATRAS, UP, 0.02, m_lomo)

# Pectorales: largas, hacia fuera, abajo y atrás (en la hoja salen por delante de la pata delantera)
for lado in [-1, 1]:
    ang = -0.55
    if lado < 0:
        ang = math.pi + 0.55
    base = punto_cuerpo(0.30, ang, -0.05)
    # a lo largo de la aleta: hacia fuera, muy hacia abajo y hacia atrás (se ve de perfil)
    u2 = unit([lado * 0.42, 0.55, -0.72])
    # borde de ataque: hacia delante y algo hacia abajo
    v2 = unit(cruz([lado * 1.0, 0.0, 0.0], u2))
    if v2[1] > 0:
        v2 = por(v2, -1)
    cont = [[0.0, -0.12], [0.22, 0.10], [0.55, 0.13], [0.86, 0.05], [1.05, -0.10], [0.70, -0.10], [0.35, -0.22], [0.06, -0.32]]
    aleta("TB_Aleta_Pectoral_" + str(lado), cont, base, u2, v2, 0.035, m_lomo)

# Pélvicas pequeñas, delante de las patas traseras
for lado in [-1, 1]:
    ang = -1.1
    if lado < 0:
        ang = math.pi + 1.1
    base = punto_cuerpo(0.68, ang, -0.02)
    u = unit([lado * 0.4, 0.55, -0.6])
    aleta("TB_Aleta_Pelvica_" + str(lado), [[0.0, -0.05], [0.20, 0.03], [0.24, -0.02], [0.08, -0.10]], base, u, [0.0, -1.0, 0.0], 0.02, m_lomo)

# Caudal en media luna: lóbulo alto grande y lóbulo bajo algo menor, con la muesca de la punta
cola = [0.0, Y1 - 0.02, perfil(1)[0]]
aleta("TB_Cola_Alta", [[-0.12, -0.06], [0.10, 0.20], [0.42, 0.62], [0.60, 0.92], [0.48, 0.66], [0.34, 0.34], [0.26, 0.10], [0.20, -0.04]], cola, ATRAS, UP, 0.05, m_lomo)
aleta("TB_Cola_Baja", [[-0.10, 0.04], [0.08, -0.18], [0.30, -0.44], [0.46, -0.62], [0.36, -0.40], [0.28, -0.18], [0.22, 0.02]], cola, ATRAS, UP, 0.045, m_lomo)
# quillas del pedúnculo
for lado in [-1, 1]:
    caja("TB_Quilla_" + str(lado), (lado * 0.06, Y1 - 0.20, perfil(0.94)[0]), (0.04, 0.40, 0.035), m_lomo)

# ==========================================
# 5. PATAS (musculosas, garras de tres dedos y un espolón)
# ==========================================
def pie(pref, talon, lado, escala=1.0):
    # Pie ancho con tres dedos hacia delante (-Y) y garras oscuras.
    esfera(pref + "_Planta", (talon[0], talon[1] - 0.06 * escala, 0.07 * escala), 0.13 * escala, m_pata, escala=(1.05, 1.25, 0.55))
    for d in range(3):
        dx = (d - 1) * 0.085 * escala
        base = [talon[0] + dx, talon[1] - 0.12 * escala, 0.07 * escala]
        punta = [talon[0] + dx * 1.3, talon[1] - 0.27 * escala, 0.045 * escala]
        tubo(pref + "_Dedo_" + str(d), [base, punta], [0.05 * escala, 0.038 * escala], m_pata, n=8)
        cono(pref + "_Garra_" + str(d), (punta[0], punta[1] - 0.04 * escala, 0.03 * escala), 0.03 * escala, 0.0, 0.09 * escala, m_garra, vertices=6, rot=(math.pi / 2 + 0.35, 0, 0))
    # espolón trasero
    cono(pref + "_Espolon", (talon[0] - lado * 0.06 * escala, talon[1] + 0.10 * escala, 0.05 * escala), 0.025 * escala, 0.0, 0.07 * escala, m_garra, vertices=6, rot=(-math.pi / 2 - 0.4, 0, 0))

X_PATA = 0.30
for lado in [-1, 1]:
    x = lado * X_PATA
    # Delantera: hombro bajo la pectoral, brazo recto con codo hacia atrás
    yh = -0.62
    hombro = [x, yh, 1.42]
    codo = [x * 1.05, yh + 0.12, 0.80]
    muneca = [x, yh - 0.02, 0.30]
    talon = [x, yh + 0.02, 0.10]
    esfera("TB_Hombro_" + str(lado), (x * 0.92, yh + 0.02, 1.25), 0.30, m_pata, escala=(0.78, 1.0, 1.25))
    tubo("TB_Brazo_" + str(lado), [hombro, [x * 1.05, yh + 0.08, 1.10], codo, [x * 1.02, yh + 0.04, 0.55], muneca, talon], [0.22, 0.24, 0.17, 0.15, 0.12, 0.12], m_pata, n=14, aplastar=0.85)
    pie("TB_PieD_" + str(lado), talon, lado, 1.0)

    # Trasera: muslo grande, rodilla hacia delante, corvejón hacia atrás (como un perro)
    yc = 0.62
    cadera = [x, yc, 1.48]
    rodilla = [x * 1.08, yc - 0.18, 0.95]
    corvejon = [x * 1.02, yc + 0.20, 0.50]
    talon2 = [x, yc + 0.02, 0.10]
    esfera("TB_Muslo_" + str(lado), (x * 0.95, yc - 0.04, 1.15), 0.34, m_pata, escala=(0.72, 1.05, 1.15))
    tubo("TB_Pierna_" + str(lado), [cadera, [x * 1.06, yc - 0.10, 1.18], rodilla, [x * 1.05, yc + 0.05, 0.72], corvejon, [x, yc + 0.12, 0.28], talon2], [0.24, 0.27, 0.18, 0.15, 0.12, 0.11, 0.11], m_pata, n=14, aplastar=0.85)
    pie("TB_PieT_" + str(lado), talon2, lado, 1.05)

# Suelo pequeño para que la vista general encuadre bien
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=2.6, depth=0.04, location=(0, -0.3, -0.02))
suelo = bpy.context.active_object
suelo.name = "TB_Suelo"
asignar_mat(suelo, material("TB_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
