import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# DRAGÓN ROJO (cuadrúpedo con alas)
# ==============================================================================
# Hecho a partir de la hoja de vistas del usuario (2 filas): frente, dos perfiles, espalda y
# cenital (con la cabeza arriba). Se usa el perfil que mira a la izquierda; el otro costado
# usa la misma foto volteada.
# Cada vista está a su escala: perfil 0,5 cm/px, frente 0,333 cm/px, espalda 0,28 cm/px y
# cenital 0,445 cm/px (medidas cruzando cabeza, patas y cola entre vistas).
# Cuerpo, cuello, cabeza y cola son tubos que siguen la línea del perfil. Las alas se
# abren como en la cenital (su contorno sale de esa foto), levantadas como en el frente;
# su piel es solo la cenital, porque en el perfil el dragón las tiene plegadas.
# Hoja preparada en public/textures/dragon_hoja.jpg.
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
# 1. ESCALAS Y VISTAS
# ==========================================
HOJA = "dragon_hoja"
ESC = 0.005                # perfil (3.ª figura de la fila de arriba)
SUELO = 697
Y_HOCICO = -1.9
ESC_F = 0.00333            # frente
ESC_B = 0.0028             # espalda
ESC_T = 0.00445            # cenital

def y_de(px):
    return Y_HOCICO + (px - 1586) * ESC

def z_de(py):
    return (SUELO - py) * ESC

def p(px, py, x=0.0):
    return [x, y_de(px), z_de(py)]

ALTO = z_de(210)
VISTA_PERFIL = ["x", 0, 1586, 210, 2390, 697, y_de(1586), y_de(2390), ALTO, 0.0, 1.5]
VISTA_FRENTE = ["y", -1, 92, 110, 692, 772, -300 * ESC_F, 300 * ESC_F, 662 * ESC_F, 0.0, 1.2]
VISTA_ESPALDA = ["y", 1, 301, 900, 901, 1676, 300 * ESC_B, -300 * ESC_B, 776 * ESC_B, 0.0, 1.2]
# Cenital con la cabeza arriba: horizontal = X, vertical = Y (eje "zr")
VISTA_CENITAL = ["zr", 1, 1226, 879, 2374, 1785, (1226 - 1800) * ESC_T, (2374 - 1800) * ESC_T, Y_HOCICO, Y_HOCICO + 906 * ESC_T, 1.0]
VISTA_ALAS = ["zr", 0, 1226, 879, 2374, 1785, (1226 - 1800) * ESC_T, (2374 - 1800) * ESC_T, Y_HOCICO, Y_HOCICO + 906 * ESC_T, 1.0]

def material_foto(nombre, vistas, rugosidad=0.6, barniz=0.15):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad, barniz=barniz)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

m_piel = material_foto("DR_Escamas", [VISTA_PERFIL, VISTA_CENITAL, VISTA_FRENTE, VISTA_ESPALDA])
m_pata = material_foto("DR_Patas", [VISTA_PERFIL, VISTA_FRENTE, VISTA_ESPALDA])
m_ala = material_foto("DR_Alas", [VISTA_ALAS], 0.7, 0.0)
m_cuerno = material_foto("DR_Cuernos", [VISTA_PERFIL, VISTA_FRENTE], 0.5, 0.3)
m_garra = material("DR_Garra", (0.02, 0.015, 0.012, 1.0), 0.35, barniz=0.5)

# ==========================================
# 2. CUERPO: cabeza y cuello, tronco y cola (tubos sobre la línea del perfil)
# ==========================================
# Cabeza (del hocico a la nuca) y cuello en S hasta el pecho
cabeza = [p(1588, 343), p(1605, 340), p(1632, 334), p(1660, 327), p(1690, 322), p(1708, 336),
          p(1722, 372), p(1738, 420), p(1752, 468), p(1768, 515)]
tubo("DR_Cabeza_Cuello", cabeza, [0.02, 0.08, 0.12, 0.155, 0.17, 0.165, 0.18, 0.21, 0.25, 0.30], m_piel, n=20,
     aplastar=[1.0, 1.0, 1.1, 1.2, 1.2, 1.1, 1.0, 1.0, 1.05, 1.15])
# Tronco y cola (pecho a la punta de la cola)
tronco = [p(1745, 540), p(1790, 545), p(1850, 545), p(1920, 540), p(1980, 530), p(2030, 540),
          p(2070, 565), p(2110, 592), p(2160, 612), p(2220, 627), p(2280, 634), p(2340, 638), p(2392, 640)]
tubo("DR_Tronco_Cola", tronco, [0.26, 0.33, 0.33, 0.32, 0.31, 0.27, 0.2, 0.15, 0.11, 0.08, 0.055, 0.035, 0.005], m_piel, n=22,
     aplastar=[1.15, 1.2, 1.2, 1.15, 1.1, 1.05, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0])

# Cuernos: de la nuca hacia arriba y atrás, curvados (perfil) y abiertos (frente: puntas a ±0.37)
for lado in [-1, 1]:
    cuerno = [p(1690, 305, lado * 0.10), p(1715, 285, lado * 0.17), p(1745, 258, lado * 0.25), p(1775, 232, lado * 0.32), p(1800, 214, lado * 0.37)]
    tubo("DR_Cuerno_" + str(lado), cuerno, [0.05, 0.042, 0.032, 0.02, 0.004], m_cuerno, n=10)

# Púas del lomo y de la punta de la cola (puntas medidas en el perfil)
PUAS = [[1712, 318, 0.10], [1730, 345, 0.10], [1748, 380, 0.10], [1765, 420, 0.09], [1955, 470, 0.08],
        [1985, 472, 0.08], [2290, 600, 0.12], [2318, 595, 0.12], [2345, 610, 0.09]]
for i in range(len(PUAS)):
    q = PUAS[i]
    cono("DR_Pua_" + str(i), (0, y_de(q[0]), z_de(q[1]) - q[2] * 0.2), q[2] * 0.45, 0.003, q[2] * 1.4, m_piel, vertices=6, rot=(-0.6, 0, 0))
    bpy.context.active_object.scale = (0.5, 1.0, 1.0)

# ==========================================
# 3. PATAS (frente: x = ±0.29; espalda: x = ±0.26)
# ==========================================
for lado in [-1, 1]:
    del_ = [p(1792, 520, lado * 0.16), p(1795, 575, lado * 0.26), p(1793, 615, lado * 0.29), p(1786, 645, lado * 0.29), p(1780, 672, lado * 0.29), p(1778, 688, lado * 0.29)]
    tubo("DR_Pata_Del_" + str(lado), del_, [0.16, 0.2, 0.15, 0.12, 0.1, 0.1], m_pata, n=16, aplastar=[0.9, 0.85, 0.9, 1.0, 1.0, 1.0])
    pie("DR_PieD_" + str(lado), [lado * 0.29, y_de(1785), 0.0], lado, 0.34, 0.3)
    tras = [p(1985, 500, lado * 0.14), p(1995, 560, lado * 0.24), p(1995, 610, lado * 0.26), p(1985, 640, lado * 0.26), p(1970, 668, lado * 0.26), p(1965, 688, lado * 0.26)]
    tubo("DR_Pata_Tras_" + str(lado), tras, [0.2, 0.27, 0.18, 0.13, 0.1, 0.1], m_pata, n=16, aplastar=[0.85, 0.8, 0.85, 1.0, 1.0, 1.0])
    pie("DR_PieT_" + str(lado), [lado * 0.26, y_de(1975), 0.0], lado, 0.34, 0.3)

# ==========================================
# 4. ALAS: contorno de la cenital, levantadas hacia fuera y con los dedos caídos detrás
# ==========================================
# [px de la cenital, borde de delante, borde de detrás] del ala izquierda de la foto
ALA = [[1228, 1323, 1342], [1236, 1296, 1367], [1244, 1281, 1336], [1252, 1271, 1314], [1260, 1258, 1307],
       [1268, 1245, 1300], [1276, 1232, 1296], [1284, 1218, 1291], [1292, 1205, 1282], [1300, 1191, 1286],
       [1308, 1178, 1279], [1316, 1172, 1280], [1324, 1166, 1276], [1332, 1160, 1279], [1340, 1153, 1280],
       [1348, 1147, 1279], [1356, 1141, 1280], [1364, 1135, 1293], [1372, 1129, 1305], [1380, 1122, 1312],
       [1388, 1116, 1333], [1396, 1109, 1394], [1404, 1102, 1413], [1412, 1095, 1413], [1420, 1088, 1366],
       [1428, 1082, 1350], [1436, 1078, 1341], [1444, 1076, 1332], [1452, 1074, 1325], [1460, 1072, 1318],
       [1468, 1070, 1311], [1476, 1067, 1310], [1484, 1064, 1305], [1492, 1061, 1300], [1500, 1058, 1305],
       [1508, 1054, 1305], [1516, 1049, 1307], [1524, 1045, 1317], [1532, 1040, 1325], [1540, 1034, 1335],
       [1548, 1029, 1353], [1556, 1023, 1378], [1564, 1021, 1388], [1572, 990, 1334], [1580, 985, 1316],
       [1588, 988, 1308], [1596, 996, 1296], [1604, 1007, 1291], [1612, 1050, 1282], [1620, 1064, 1281],
       [1628, 1099, 1280], [1636, 1118, 1286], [1644, 1129, 1289], [1652, 1137, 1300], [1660, 1145, 1300],
       [1668, 1152, 1274], [1676, 1159, 1263], [1684, 1160, 1253], [1692, 1159, 1249]]
Z_HOMBRO = 1.30
X_HOMBRO = 0.49
SUBE = 0.6      # cuánto sube el ala por metro hacia fuera (frente: alas levantadas)
CAE = 0.45       # cuánto bajan los dedos por metro hacia atrás

def punto_ala(lado, px, py, borde_delante):
    x = (px - 1800) * ESC_T * (-lado)
    if lado < 0:
        x = (px - 1800) * ESC_T
    else:
        x = (1800 - px) * ESC_T
    y = Y_HOCICO + (py - 879) * ESC_T
    fuera = abs(x) - X_HOMBRO
    if fuera < 0:
        fuera = 0
    atras = (py - borde_delante) * ESC_T
    z = Z_HOMBRO + SUBE * fuera - CAE * atras
    return [x, y, z]

FILAS = 7
for lado in [-1, 1]:
    verts = []
    caras = []
    n = len(ALA)
    for i in range(n):
        c = ALA[i]
        for j in range(FILAS + 1):
            py = c[1] + (c[2] - c[1]) * j / FILAS
            q = punto_ala(lado, c[0], py, c[1])
            verts.append(q)
    capa = len(verts)
    for k in range(capa):
        q = verts[k]
        verts.append([q[0], q[1], q[2] - 0.025])
    for i in range(n - 1):
        for j in range(FILAS):
            a = i * (FILAS + 1) + j
            b = (i + 1) * (FILAS + 1) + j
            if lado > 0:
                caras.append((a, a + 1, b + 1, b))
                caras.append((capa + a, capa + b, capa + b + 1, capa + a + 1))
            else:
                caras.append((a, b, b + 1, a + 1))
                caras.append((capa + a, capa + a + 1, capa + b + 1, capa + b))
    malla("DR_Ala_" + str(lado), verts, caras, m_ala)

# Suelo pequeño para que la vista general encuadre bien
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=2.6, depth=0.03, location=(0, 0, -0.015))
suelo = bpy.context.active_object
suelo.name = "DR_Suelo"
asignar_mat(suelo, material("DR_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
