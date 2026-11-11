import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# ARQUERO ESQUELETO (versión para juego)
# ==============================================================================
# Hecho a partir de la hoja de vistas del usuario: frente, perfil (mirando a la izquierda),
# espalda y el arco suelto. Pose A, mirando a -Y. Escala 0,23 cm por píxel (1,80 m con cuernos).
# Piel: atlas de 1400 px y 200 KB con solo esas cuatro vistas
# (public/textures/arquero_esqueleto_atlas.jpg, hecho con atlas_vistas.py).
# El arco se llama "AR_Arco": al animar como humanoide va rígido en la mano derecha y
# se usan las animaciones de arquero. No uses "arma", "arco" ni "bow" en otros nombres.
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
HOJA = "arquero_esqueleto_atlas"
E = 0.0023
SA = 1.00071
SUELO = 799

def x_de(px):
    return (px - 275) * E          # vista de frente

def y_de(px):
    return (px - 676) * E          # vista de perfil (la cara a la izquierda)

def z_de(py):
    return (SUELO - py) * E

def q(fx, sx, py):
    # punto a partir de la columna del frente, la del perfil y la fila
    return [x_de(fx), y_de(sx), z_de(py)]

def frente_a(px, py):
    return [(px - 13) * SA, (py - 3) * SA]

def perfil_a(px, py):
    return [521.37 + (px - 581) * SA, (py - 3) * SA]

def espalda_a(px, py):
    return [704.50 + (px - 1048) * SA, (py - 3) * SA]

def arco_a(px, py):
    return [1202.86 + (px - 1535) * SA, (py - 17) * SA]

def vista(eje, lado, a0, a1, h0, h1, w0, w1, peso):
    return [eje, lado, a0[0], a0[1], a1[0], a1[1], h0, h1, w0, w1, peso]

V_FRENTE = vista("y", -1, frente_a(75, 15), frente_a(475, 799), x_de(75), x_de(475), z_de(15), 0.0, 1.3)
V_ESPALDA = vista("y", 1, espalda_a(1095, 15), espalda_a(1495, 799), -x_de(75), -x_de(475), z_de(15), 0.0, 1.3)
V_PERFIL = vista("x", 0, perfil_a(591, 15), perfil_a(754, 799), y_de(591), y_de(754), z_de(15), 0.0, 1.0)

def material_foto(nombre, vistas, rugosidad=0.75):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

m_cuerpo = material_foto("AR_Cuerpo", [V_FRENTE, V_PERFIL, V_ESPALDA])
m_cuerda = material("AR_Cuerda", (0.6, 0.55, 0.45, 1.0), 0.6)

# ==========================================
# 2. CABEZA, CASCO Y CUERNOS
# ==========================================
cabeza = [q(273, 660, 45), q(273, 660, 70), q(273, 658, 100), q(273, 652, 135), q(273, 646, 165), q(273, 646, 182)]
tubo("AR_Cabeza", cabeza, [0.04, 0.083, 0.095, 0.083, 0.055, 0.03], m_cuerpo, n=16, aplastar=0.95)
for lado in [-1, 1]:
    cuerno = [[lado * 0.07, y_de(662), z_de(80)], [lado * 0.105, y_de(664), z_de(62)], [lado * 0.12, y_de(660), z_de(38)], [lado * 0.105, y_de(652), z_de(16)]]
    tubo("AR_Cuerno_" + str(lado), cuerno, [0.026, 0.02, 0.012, 0.003], m_cuerpo, n=8)
tubo("AR_Cuello", [q(273, 660, 175), q(273, 664, 198)], [0.028, 0.03], m_cuerpo, n=8)

# ==========================================
# 3. TRONCO: costillas, columna y falda con placas
# ==========================================
costillas = [q(270, 662, 185), q(270, 663, 210), q(270, 663, 240), q(270, 662, 275), q(270, 662, 310), q(270, 664, 338)]
tubo("AR_Costillas", costillas, [0.07, 0.1, 0.112, 0.112, 0.1, 0.06], m_cuerpo, n=18, aplastar=[1.6, 1.4, 1.27, 1.25, 1.3, 1.4])
tubo("AR_Columna", [q(275, 670, 330), q(275, 670, 372)], [0.03, 0.03], m_cuerpo, n=8)
falda = [q(275, 664, 358), q(275, 664, 380), q(275, 666, 420), q(275, 665, 460), q(275, 666, 500), q(275, 667, 540), q(275, 666, 585)]
tubo("AR_Falda", falda, [0.09, 0.112, 0.122, 0.132, 0.115, 0.115, 0.1], m_cuerpo, n=20,
     aplastar=[1.5, 1.46, 1.62, 1.6, 1.7, 1.78, 1.7])
# hombrera del hombro izquierdo (en la foto, a la derecha del frente)
esfera("AR_Hombrera", q(347, 660, 222), 0.5, m_cuerpo, escala=(0.17, 0.2, 0.17))

# ==========================================
# 4. BRAZOS (pose A) Y PIERNAS
# ==========================================
brazo_d = [q(196, 660, 202), q(175, 662, 240), q(152, 662, 280), q(128, 660, 318), q(101, 658, 350), q(78, 656, 382), q(50, 654, 420), q(30, 654, 460)]
tubo("AR_Brazo_D", brazo_d, [0.03, 0.022, 0.022, 0.03, 0.022, 0.02, 0.03, 0.012], m_cuerpo, n=10)
brazo_i = [q(352, 660, 205), q(378, 662, 245), q(395, 662, 285), q(420, 660, 318), q(446, 658, 350), q(471, 656, 382), q(496, 654, 420), q(516, 654, 460)]
tubo("AR_Brazo_I", brazo_i, [0.04, 0.03, 0.028, 0.045, 0.045, 0.035, 0.03, 0.012], m_cuerpo, n=10)
for lado in [-1, 1]:
    fx = 220
    if lado > 0:
        fx = 331
    pierna = [q(fx, 668, 520), q(fx, 667, 560), q(fx, 666, 605), q(fx, 670, 650), q(fx, 674, 700), q(fx, 676, 745), q(fx, 676, 772)]
    tubo("AR_Pierna_" + str(lado), pierna, [0.04, 0.032, 0.04, 0.03, 0.028, 0.026, 0.03], m_cuerpo, n=10)
    esfera("AR_Pie_" + str(lado), q(fx + lado * 4, 648, 788), 0.5, m_cuerpo, escala=(0.085, 0.24, 0.04))

# ==========================================
# 5. CARCAJ A LA ESPALDA Y ARCO EN LA MANO DERECHA
# ==========================================
tubo("AR_Carcaj", [[x_de(182), y_de(737), z_de(90)], [x_de(200), y_de(737), z_de(140)], [x_de(285), y_de(737), z_de(372)]], [0.045, 0.045, 0.04], m_cuerpo, n=12)

# Arco: línea central medida en su vista de la hoja (columna, fila). Se coloca vertical,
# con el agarre (columna 1670, fila 418) en la mano derecha y la panza hacia delante (-Y).
EB = 0.0017
MANO = q(50, 654, 420)
def arco_p(px, py):
    return [MANO[0], MANO[1] - (px - 1670) * EB, MANO[2] + (418 - py) * EB]
LINEA = [[30, 1586, 9], [55, 1564, 18], [80, 1559, 26], [105, 1565, 21], [130, 1577, 28], [155, 1594, 26],
         [180, 1618, 28], [205, 1636, 29], [230, 1650, 31], [255, 1664, 35], [280, 1671, 42], [305, 1679, 53],
         [330, 1679, 57], [355, 1682, 60], [380, 1671, 23], [405, 1670, 22], [430, 1671, 23], [455, 1686, 60],
         [480, 1681, 60], [505, 1679, 51], [530, 1675, 44], [555, 1668, 36], [580, 1660, 36], [605, 1646, 30],
         [630, 1631, 29], [655, 1610, 26], [680, 1590, 26], [705, 1576, 22], [730, 1568, 22], [755, 1568, 22], [780, 1578, 17]]
puntos = []
radios = []
for i in range(len(LINEA)):
    c = LINEA[i]
    puntos.append(arco_p(c[1], c[0]))
    radios.append(c[2] * EB * 0.5)
V_ARCO = vista("x", 0, arco_a(1545, 29), arco_a(1722, 794), MANO[1] - (1545 - 1670) * EB, MANO[1] - (1722 - 1670) * EB,
               MANO[2] + (418 - 29) * EB, MANO[2] + (418 - 794) * EB, 1.0)
m_arco = material_foto("AR_ArcoMat", [V_ARCO], 0.5)
tubo("AR_Arco", puntos, radios, m_arco, n=10, aplastar=0.45)
tubo("AR_Arco_Cuerda", [arco_p(1580, 32), arco_p(1563, 418), arco_p(1574, 782)], [0.003, 0.003, 0.003], m_cuerda, n=5)

# Suelo pequeño para que la vista general encuadre bien
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=0.9, depth=0.02, location=(0, 0, -0.01))
suelo = bpy.context.active_object
suelo.name = "AR_Suelo"
asignar_mat(suelo, material("AR_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
