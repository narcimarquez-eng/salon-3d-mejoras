import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# PLATERO - estatua de bronce del burrito en la plaza del Cabildo de Moguer (Huelva)
# ==============================================================================
# Burro joven de bronce, de pie, con el pelaje rizado en cuello, cabeza y tronco,
# grupa y patas lisas, orejas grandes y cola que cae y se riza al final.
# Fuentes: las cuatro fotos del usuario (frente, perfil izquierdo, perfil derecho y
# espalda). El contorno sale de la foto de perfil derecho (cabeza a la derecha).
# Medidas aproximadas: unos 0,95 m hasta la cruz, estimados por el niño de la foto
# (no hay ficha con medidas); el resto va en proporción a la foto.
# La textura "bronce_platero" es un recorte del costado de la propia estatua.
# Ejes: X = hacia la cabeza, Y = costado izquierdo del burro, Z = altura. Metros.
# Colores lineales, como en Blender.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.7, bloom=0.03)
bpy.ops.render.set_lighting(intensity=1.4, angle=38)
bpy.ops.render.set_ssao(intensity=1.1)

def material(nombre, color, rugosidad=0.5, metalico=0.0, barniz=0.0):
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

# Pelaje rizado: la imagen sacada de la estatua (color + relieve + rugosidad)
m_pelo = material("PL_Bronce_Pelaje", (1.0, 1.0, 1.0, 1.0), 0.45, 0.45, 0.15)
m_pelo.color_map = "bronce_platero"
m_pelo.color_map_scale = 0.28
# Bronce liso y pulido de la grupa, las patas, la cola y las orejas
m_liso = material("PL_Bronce_Liso", (0.060, 0.036, 0.022, 1.0), 0.36, 0.85, 0.25)
# Pezuñas y ojos, algo más oscuros
m_oscuro = material("PL_Bronce_Oscuro", (0.030, 0.020, 0.014, 1.0), 0.42, 0.8, 0.1)

# Paso de la foto de perfil (píxeles) a metros: el suelo de la foto está en y = 1340 y la
# cruz en y = 600 -> 0,95 m; x = 1000 es el origen.
ESC = 0.95 / 740.0

def px(x, y):
    return [(x - 1000.0) * ESC, (1340.0 - y) * ESC]

def catmull(a, b, c, d, t):
    t2 = t * t
    t3 = t2 * t
    return 0.5 * ((2.0 * b) + (-a + c) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2 + (-a + 3.0 * b - 3.0 * c + d) * t3)

def suavizar(puntos, pasos):
    # Curva Catmull-Rom que pasa por todos los puntos; cada punto = [x, y, z, ancho, alto]
    n = len(puntos)
    salida = []
    for i in range(n - 1):
        a = puntos[i - 1]
        if i == 0:
            a = puntos[0]
        b = puntos[i]
        c = puntos[i + 1]
        d = c
        if i + 2 < n:
            d = puntos[i + 2]
        for k in range(pasos):
            t = float(k) / float(pasos)
            p = []
            for m in range(5):
                p.append(catmull(a[m], b[m], c[m], d[m], t))
            salida.append(p)
    salida.append(puntos[n - 1])
    return salida

def normalizar(v):
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if l < 0.000000001:
        return [0.0, 0.0, 1.0]
    return [v[0] / l, v[1] / l, v[2] / l]

def tubo(nombre, puntos, mat, lados=16, pasos=4):
    # Tubo de sección elíptica que sigue una línea de puntos [x, y, z, semiancho, semialto].
    # El semiancho va hacia el costado (Y) y el semialto en el plano de la curva.
    pts = suavizar(puntos, pasos)
    n = len(pts)
    verts = []
    caras = []
    for i in range(n):
        p = pts[i]
        q0 = pts[i - 1]
        if i == 0:
            q0 = pts[0]
        q1 = pts[n - 1]
        if i + 1 < n:
            q1 = pts[i + 1]
        t = normalizar([q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]])
        # costado: Y global sin su parte a lo largo de la curva
        dot = t[1]
        s = normalizar([-dot * t[0], 1.0 - dot * t[1], -dot * t[2]])
        # normal = t x s
        nn = [t[1] * s[2] - t[2] * s[1], t[2] * s[0] - t[0] * s[2], t[0] * s[1] - t[1] * s[0]]
        for j in range(lados):
            ang = 2.0 * math.pi * j / lados
            ca = math.cos(ang) * p[3]
            sa = math.sin(ang) * p[4]
            verts.append((p[0] + ca * s[0] + sa * nn[0], p[1] + ca * s[1] + sa * nn[1], p[2] + ca * s[2] + sa * nn[2]))
    for i in range(n - 1):
        for j in range(lados):
            j2 = (j + 1) % lados
            caras.append((i * lados + j, i * lados + j2, (i + 1) * lados + j2, (i + 1) * lados + j))
    # tapas
    c0 = len(verts)
    verts.append((pts[0][0], pts[0][1], pts[0][2]))
    c1 = len(verts)
    verts.append((pts[n - 1][0], pts[n - 1][1], pts[n - 1][2]))
    base = (n - 1) * lados
    for j in range(lados):
        j2 = (j + 1) % lados
        caras.append((c0, j2, j))
        caras.append((c1, base + j, base + j2))
    malla = bpy.data.meshes.new(name=nombre + "_Malla")
    malla.from_pydata(verts, [], caras)
    malla.update()
    obj = bpy.data.objects.new(nombre, malla)
    bpy.context.collection.objects.link(obj)
    return asignar_mat(obj, mat)

def perfil(lista, y):
    # lista de [x_foto, y_foto, semialto_foto, semiancho_m] -> puntos del tubo
    salida = []
    for e in lista:
        p = px(e[0], e[1])
        salida.append([p[0], y, p[1], e[3], e[2] * ESC])
    return salida

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat):
    bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=r1, radius2=r2, depth=alto, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

# ==========================================
# 1. TRONCO (de la grupa al pecho)
# ==========================================
tronco = [
    [628, 725, 35, 0.05],
    [648, 712, 100, 0.12],
    [700, 718, 128, 0.14],
    [780, 733, 140, 0.15],
    [880, 744, 140, 0.155],
    [980, 747, 137, 0.155],
    [1080, 744, 133, 0.15],
    [1160, 740, 126, 0.135],
    [1220, 738, 108, 0.115],
    [1258, 742, 74, 0.09],
    [1280, 745, 28, 0.04],
]
tubo("PL_Tronco", perfil(tronco, 0.0), m_pelo, 20, 4)

# Grupa lisa (en la estatua las ancas no llevan pelo tallado): dos ancas pulidas
for lado in [-1.0, 1.0]:
    a = px(705, 735)
    esfera("PL_Anca", (a[0] + 0.01, lado * 0.045, a[1] - 0.01), 0.15, m_liso, (1.0, 0.66, 1.02))

# ==========================================
# 2. CUELLO Y CRIN
# ==========================================
cuello = [
    [1150, 705, 115, 0.11],
    [1240, 659, 100, 0.085],
    [1300, 623, 88, 0.07],
    [1360, 580, 82, 0.064],
    [1408, 545, 66, 0.058],
    [1440, 525, 40, 0.04],
]
tubo("PL_Cuello", perfil(cuello, 0.0), m_pelo, 16, 4)

crin = [
    [1120, 660, 6, 0.01],
    [1170, 618, 16, 0.022],
    [1220, 572, 22, 0.028],
    [1300, 520, 26, 0.03],
    [1380, 466, 24, 0.028],
    [1432, 432, 14, 0.02],
    [1450, 450, 5, 0.01],
]
tubo("PL_Crin", perfil(crin, 0.0), m_pelo, 10, 4)

# ==========================================
# 3. CABEZA (inclinada hacia abajo), OJOS Y OREJAS
# ==========================================
cabeza = [
    [1418, 455, 40, 0.05],
    [1432, 480, 58, 0.068],
    [1446, 525, 58, 0.07],
    [1462, 568, 46, 0.058],
    [1478, 608, 36, 0.05],
    [1492, 640, 28, 0.045],
    [1498, 656, 10, 0.03],
]
tubo("PL_Cabeza", perfil(cabeza, 0.0), m_pelo, 16, 4)

for lado in [-1.0, 1.0]:
    o = px(1462, 505)
    esfera("PL_Ojo", (o[0], lado * 0.066, o[1]), 0.016, m_oscuro, (1.3, 0.6, 0.9))
    n = px(1492, 634)
    esfera("PL_Ollar", (n[0] + 0.01, lado * 0.026, n[1]), 0.011, m_oscuro, (1.0, 0.8, 1.4))

# Orejas: grandes, la izquierda algo abierta hacia fuera (como en la foto de frente)
b = px(1440, 432)
oreja_d = [
    [b[0], -0.04, b[1], 0.026, 0.016],
    [b[0] + 0.025, -0.05, b[1] + 0.07, 0.045, 0.016],
    [b[0] + 0.05, -0.058, b[1] + 0.15, 0.036, 0.012],
    [b[0] + 0.07, -0.062, b[1] + 0.21, 0.004, 0.004],
]
tubo("PL_Oreja_Der", oreja_d, m_liso, 10, 3)
oreja_i = [
    [b[0], 0.04, b[1], 0.026, 0.016],
    [b[0] + 0.02, 0.085, b[1] + 0.055, 0.045, 0.016],
    [b[0] + 0.04, 0.14, b[1] + 0.11, 0.036, 0.012],
    [b[0] + 0.055, 0.18, b[1] + 0.155, 0.004, 0.004],
]
tubo("PL_Oreja_Izq", oreja_i, m_liso, 10, 3)

# ==========================================
# 4. PATAS (delanteras rectas, traseras con el corvejón marcado) Y PEZUÑAS
# ==========================================
def pata(nombre, lista, y_arriba, y_abajo, dx):
    # la pata se abre un poco hacia abajo (de y_arriba a y_abajo), como en la foto de espalda
    puntos = []
    for e in lista:
        p = px(e[0] + dx, e[1])
        f = (e[1] - lista[0][1]) / (lista[len(lista) - 1][1] - lista[0][1])
        y = y_arriba + (y_abajo - y_arriba) * f
        puntos.append([p[0], y, p[1], e[2], e[2]])
    tubo(nombre, puntos, m_liso, 12, 4)
    ult = lista[len(lista) - 1]
    h = px(ult[0] + dx + 4, 1340)
    cono(nombre + "_Pezuna", (h[0], y_abajo, h[1] + 0.022), 0.034, 0.026, 0.044, m_oscuro)

delantera = [
    [1192, 740, 0.045],
    [1192, 800, 0.058],
    [1190, 900, 0.046],
    [1186, 1000, 0.036],
    [1188, 1088, 0.032],
    [1191, 1150, 0.024],
    [1196, 1240, 0.022],
    [1201, 1290, 0.028],
    [1210, 1316, 0.024],
]
pata("PL_Pata_Del_Izq", delantera, 0.06, 0.075, 0.0)
pata("PL_Pata_Del_Der", delantera, -0.06, -0.075, -35.0)

trasera = [
    [712, 700, 0.06],
    [715, 770, 0.08],
    [742, 880, 0.062],
    [712, 985, 0.046],
    [668, 1090, 0.036],
    [652, 1140, 0.033],
    [646, 1210, 0.024],
    [642, 1288, 0.028],
    [646, 1316, 0.024],
]
pata("PL_Pata_Tras_Izq", trasera, 0.06, 0.085, 0.0)
pata("PL_Pata_Tras_Der", trasera, -0.06, -0.085, 55.0)

# ==========================================
# 5. COLA (cae por detrás y se riza en la punta, algo ladeada como en la foto de espalda)
# ==========================================
cola = []
cola_foto = [
    [662, 612, 0.024, 0.0],
    [610, 650, 0.022, -0.005],
    [565, 720, 0.020, -0.012],
    [548, 800, 0.019, -0.02],
    [558, 860, 0.020, -0.026],
    [588, 896, 0.028, -0.03],
    [618, 900, 0.03, -0.03],
    [632, 885, 0.006, -0.03],
]
for e in cola_foto:
    p = px(e[0], e[1])
    cola.append([p[0], e[3], p[1], e[2], e[2]])
tubo("PL_Cola", cola, m_liso, 10, 4)

bpy.ops.mesh.auto_ground()
