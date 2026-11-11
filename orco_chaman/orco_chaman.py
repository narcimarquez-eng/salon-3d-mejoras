import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# ORCO CHAMÁN (versión para juego, hoja en alta)
# ==============================================================================
# Hecho a partir de la segunda hoja del usuario (2655 x 1085 px, cada figura ~1020 px):
# frente, perfil (mirando a la derecha: el script lo voltea) y espalda. El bastón de
# cuernas viene de la primera hoja (no sale en esta), escalado a la misma altura.
# Escala 0,205 cm por píxel (2,1 m). Piel: atlas de 2048 x 1076 px (340 KB) con las tres
# vistas y el bastón (public/textures/orco_chaman_atlas.jpg).
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
E = 0.00205
SA = 0.99129
SUELO = 1062
CX = 414         # eje del cuerpo en la vista de frente
CB = 2257        # eje del cuerpo en la vista de espalda
CY = 1110        # centro del cuerpo en la vista de perfil

def x_de(px):
    return (px - CX) * E

def y_de(px):
    # el perfil mira a la derecha de la foto y el personaje a -Y: se voltea
    return -(px - CY) * E

def z_de(py):
    return (SUELO - py) * E

def q(fx, sx, py):
    return [x_de(fx), y_de(sx), z_de(py)]

def frente_a(px, py):
    return [(px - 48) * SA, (py - 30) * SA]

def perfil_a(px, py):
    return [726.61 + (px - 935) * SA, (py - 30) * SA]

def espalda_a(px, py):
    return [1066.63 + (px - 1895) * SA, (py - 30) * SA]

def vista(eje, lado, a0, a1, h0, h1, w0, w1, peso):
    return [eje, lado, a0[0], a0[1], a1[0], a1[1], h0, h1, w0, w1, peso]

V_FRENTE = vista("y", -1, frente_a(58, 40), frente_a(770, 1062), x_de(58), x_de(770), z_de(40), 0.0, 1.3)
V_ESPALDA = vista("y", 1, espalda_a(CB - 356, 40), espalda_a(CB + 356, 1062), 356 * E, -356 * E, z_de(40), 0.0, 1.3)
V_PERFIL = vista("x", 0, perfil_a(945, 40), perfil_a(1268, 1062), y_de(945), y_de(1268), z_de(40), 0.0, 1.0)

def material_foto(nombre, vistas, rugosidad=0.8):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

m_cuerpo = material_foto("OR_Cuerpo", [V_FRENTE, V_PERFIL, V_ESPALDA])

# ==========================================
# 2. CABEZA, MOÑO Y COLETA
# ==========================================
tubo("OR_Cabeza", [q(CX, 1130, 45), q(CX, 1138, 85), q(CX, 1150, 140), q(CX, 1155, 195), q(CX, 1150, 235), q(CX, 1135, 262)],
     [0.03, 0.075, 0.115, 0.125, 0.11, 0.07], m_cuerpo, n=18, aplastar=[1.0, 1.0, 0.95, 1.0, 1.05, 1.1])
tubo("OR_Coleta", [q(CX, 1055, 75), q(CX, 1000, 110), q(CX, 968, 180), q(CX, 958, 270), q(CX, 965, 380)],
     [0.045, 0.05, 0.045, 0.035, 0.012], m_cuerpo, n=10, aplastar=0.8)

# ==========================================
# 3. TRONCO Y FALDA: [fila, medio ancho (frente), medio fondo (perfil), centro en el perfil]
# ==========================================
TRONCO = [[235, 70, 75, 1125], [290, 140, 110, 1112], [370, 150, 118, 1105], [440, 116, 112, 1108],
          [500, 124, 118, 1112], [560, 150, 122, 1112], [650, 176, 124, 1112], [720, 182, 120, 1115], [770, 150, 100, 1112]]
pts = []
rad = []
apl = []
for t in TRONCO:
    pts.append(q(CX, t[3], t[0]))
    rad.append(t[2] * E)
    apl.append(t[1] / t[2])
tubo("OR_Tronco", pts, rad, m_cuerpo, n=24, aplastar=apl)

# Hombreras de calavera con sus cuernos
for lado in [-1, 1]:
    esfera("OR_Hombrera_" + str(lado), [lado * 0.37, y_de(1090), z_de(255)], 0.5, m_cuerpo, escala=(0.3, 0.38, 0.3))
# Cuernos: [base, punta] en la vista de frente (no son simétricos en el dibujo)
CUERNOS = [[235, 205, 226, 92, 0.045], [200, 210, 176, 140, 0.03], [538, 180, 551, 52, 0.045], [588, 205, 606, 150, 0.03]]
for i in range(len(CUERNOS)):
    c = CUERNOS[i]
    tubo("OR_Cuerno_Hombrera_" + str(i), [q(c[0], 1088, c[1]), q((c[0] + c[2]) / 2, 1088, (c[1] + c[3]) / 2), q(c[2], 1088, c[3])],
         [c[4], c[4] * 0.6, 0.004], m_cuerpo, n=8)

# ==========================================
# 4. BRAZOS CON BRAZALES, MANOS CON DEDOS Y PIERNAS CON BOTAS
# ==========================================
def mano(pref, palma, punta, lado):
    for d in range(4):
        f = (d - 1.5) / 1.5
        base = [palma[0], palma[1] + f * 0.04, palma[2]]
        fin = [punta[0] - lado * abs(f) * 0.012, punta[1] + f * 0.05, punta[2] + abs(f) * 0.02]
        medio = [(base[0] + fin[0]) / 2 + lado * 0.012, (base[1] + fin[1]) / 2, (base[2] + fin[2]) / 2]
        tubo(pref + "_Dedo_" + str(d), [base, medio, fin], [0.026, 0.024, 0.017], m_cuerpo, n=7)
    pul = [palma[0] - lado * 0.01, palma[1] - 0.06, palma[2] + 0.02]
    tubo(pref + "_Pulgar", [pul, [pul[0] - lado * 0.005, pul[1] - 0.05, pul[2] - 0.06]], [0.026, 0.017], m_cuerpo, n=7)

for lado in [-1, 1]:
    # lado -1 (derecho del personaje) = la izquierda de la foto
    if lado < 0:
        hom, cod, mun, pal, pun = 282, 190, 140, 112, 95
    else:
        hom, cod, mun, pal, pun = 548, 640, 690, 718, 740
    brazo = [q(hom, 1110, 300), q((hom + cod) / 2, 1108, 365), q(cod, 1105, 430), q((cod + mun) / 2, 1100, 495), q(mun, 1098, 560)]
    tubo("OR_Brazo_" + str(lado), brazo, [0.11, 0.1, 0.1, 0.13, 0.11], m_cuerpo, n=16)
    esfera("OR_Palma_" + str(lado), q(pal, 1098, 600), 0.5, m_cuerpo, escala=(0.13, 0.16, 0.13))
    mano("OR_Mano_" + str(lado), q(pal, 1098, 612), q(pun, 1098, 655), lado)

    if lado < 0:
        cad, rod, tob = 318, 302, 292
    else:
        cad, rod, tob = 510, 530, 540
    pierna = [q(cad, 1110, 690), q((cad + rod) / 2, 1105, 760), q(rod, 1100, 830), q((rod + tob) / 2, 1092, 900), q(tob, 1080, 960), q(tob, 1080, 1010)]
    tubo("OR_Pierna_" + str(lado), pierna, [0.15, 0.15, 0.17, 0.15, 0.11, 0.12], m_cuerpo, n=16)
    esfera("OR_Pie_" + str(lado), q(tob, 1130, 1040), 0.5, m_cuerpo, escala=(0.27, 0.42, 0.09))

# ==========================================
# PINCHOS: [base, punta] medidos en la vista de frente (columna, fila), y su grosor
# ==========================================
PINCHOS = [
    [132, 445, 118, 383, 0.024], [108, 472, 72, 433, 0.022], [98, 502, 66, 476, 0.018],      # brazal derecho
    [688, 435, 711, 383, 0.024], [716, 468, 747, 432, 0.022], [732, 498, 754, 476, 0.018],   # brazal izquierdo
    [248, 798, 236, 750, 0.018], [326, 798, 342, 772, 0.014],                                 # calavera de la rodilla
]
for i in range(len(PINCHOS)):
    c = PINCHOS[i]
    prof = 1100
    if c[1] > 700:
        prof = 1150        # la calavera va delante de la rodilla
    base = q(c[0], prof, c[1])
    punta = q(c[2], prof, c[3])
    medio = [(base[0] * 0.55 + punta[0] * 0.45), (base[1] + punta[1]) / 2, (base[2] * 0.55 + punta[2] * 0.45)]
    tubo("OR_Pincho_" + str(i), [base, medio, punta], [c[4], c[4] * 0.6, 0.003], m_cuerpo, n=7)

# ==========================================
# 5. BASTÓN DE CUERNAS (de la primera hoja) EN LA MANO DERECHA
# ==========================================
EB = 0.005       # escala de la primera hoja
MANO = q(112, 1098, 600)
def bp(px, py):
    return [MANO[0] + (px - 977) * EB, MANO[1], (450 - py) * EB]

def baston_a(px, py):
    # primera hoja -> hoja compuesta (x2,44 a la derecha de la nueva) -> atlas
    cx = 2655 + (px - 918) * 2.44
    cy = (py - 19) * 2.44
    return [1796.21 + (cx - 2645) * SA, cy * SA]

V_BASTON = vista("y", 0, baston_a(927, 29), baston_a(1007, 450), MANO[0] + (927 - 977) * EB, MANO[0] + (1007 - 977) * EB, (450 - 29) * EB, 0.0, 1.0)
m_baston = material_foto("OR_BastonMat", [V_BASTON], 0.75)
tubo("OR_Baston", [bp(980, 445), bp(979, 404), bp(974, 344), bp(976, 296), bp(980, 272), bp(975, 236), bp(981, 212), bp(978, 180), bp(970, 120), bp(968, 92)],
     [0.03, 0.03, 0.032, 0.03, 0.034, 0.03, 0.03, 0.03, 0.026, 0.02], m_baston, n=8)
tubo("OR_Baston_Cuerna_I", [bp(966, 175), bp(950, 140), bp(941, 90), bp(950, 44)], [0.022, 0.018, 0.014, 0.006], m_baston, n=6)
tubo("OR_Baston_Cuerna_D", [bp(984, 175), bp(994, 140), bp(1000, 92), bp(996, 46)], [0.022, 0.018, 0.014, 0.006], m_baston, n=6)
tubo("OR_Baston_Travesano", [bp(948, 104), bp(968, 100), bp(988, 104)], [0.014, 0.016, 0.014], m_baston, n=6)

bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1.0, depth=0.02, location=(0, 0, -0.01))
suelo = bpy.context.active_object
suelo.name = "OR_Suelo"
asignar_mat(suelo, material("OR_SueloMat", (0.30, 0.30, 0.31, 1.0), 0.9))
