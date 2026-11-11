import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# COCHE SOLAR DE MADERA (kit de contrachapado del usuario)
# ==============================================================================
# Hecho a partir de cuatro fotos del usuario (frente, detrás y los dos lados). Las fotos
# tienen perspectiva, así que no se proyectan enteras: las medidas salen de la vista de
# lado (0,115 cm por píxel en una foto de 2000 px) y las texturas son recortes de las fotos:
#   carrito_madera (contrachapado), carrito_ojos (cara con los ojos pirograbados),
#   carrito_lado (lateral de la cabeza con sus ranuras) y carrito_rueda (llanta y neumático).
# Medidas aproximadas: base 12 x 6,7 cm, ruedas de 3,8 cm, 11 cm de alto.
# 1 unidad = 10 cm (las piezas miden pocos milímetros). Ejes: X = ancho, Y = largo
# (el frente, con la cara, mira a -Y), Z = altura.
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


K = 0.1   # centímetros -> unidades

def cilindro(nombre, centro, radio, alto, mat, vertices=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def cm(v):
    return [v[0] * K, v[1] * K, v[2] * K]

def pieza(nombre, centro, tamano, mat, rot=(0, 0, 0)):
    return caja(nombre, cm(centro), (tamano[0] * K, tamano[1] * K, tamano[2] * K), mat, rot)

def prisma_yz(nombre, contorno, x0, x1, mat):
    # placa plana en el plano YZ (contorno convexo en cm), de x0 a x1
    n = len(contorno)
    verts = []
    for c in contorno:
        verts.append((x0 * K, c[0] * K, c[1] * K))
    for c in contorno:
        verts.append((x1 * K, c[0] * K, c[1] * K))
    caras = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        caras.append((i, j, n + j, n + i))
    return malla(nombre, verts, caras, mat, suave=False)

def prisma_xz(nombre, contorno, y0, y1, mat):
    n = len(contorno)
    verts = []
    for c in contorno:
        verts.append((c[0] * K, y0 * K, c[1] * K))
    for c in contorno:
        verts.append((c[0] * K, y1 * K, c[1] * K))
    caras = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        caras.append((i, n + i, n + j, j))
    return malla(nombre, verts, caras, mat, suave=False)

def foto(nombre, imagen, vistas, rugosidad=0.75, barniz=0.0):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), rugosidad, barniz=barniz)
    mat.color_map = imagen
    if vistas:
        mat.color_map_views = vistas
    return mat

# ==========================================
# 1. MATERIALES
# ==========================================
m_madera = foto("CS_Madera", "carrito_madera", None)
m_madera.color_map_scale = 0.35          # un trozo de foto cada 3,5 cm
m_canto = material("CS_Canto", (0.18, 0.08, 0.03, 1.0), 0.8)   # bordes quemados por el láser
m_panel = material("CS_Panel_Solar", (0.012, 0.014, 0.02, 1.0), 0.15, barniz=1.0)
m_metal = material("CS_Metal", (0.62, 0.62, 0.64, 1.0), 0.3, metalico=1.0)
m_naranja = material("CS_Engranaje", (0.9, 0.28, 0.03, 1.0), 0.5)
m_blanco = material("CS_Plastico", (0.85, 0.85, 0.82, 1.0), 0.5)
m_rojo = material("CS_Cable_Rojo", (0.55, 0.02, 0.02, 1.0), 0.45)
m_negro = material("CS_Cable_Negro", (0.01, 0.01, 0.01, 1.0), 0.45)
m_goma = material("CS_Goma", (0.014, 0.014, 0.015, 1.0), 0.8)
m_cubo = material("CS_Cubo", (0.03, 0.028, 0.026, 1.0), 0.8)   # interior oscuro que se ve por los huecos

# ==========================================
# 2. BASE, EJES Y RUEDAS
# ==========================================
Z_BASE = 3.3            # cara de abajo de la base
T = 0.3                 # grosor del contrachapado
Y_DEL = -3.8            # eje delantero (lado de la cara)
Y_TRAS = 2.8
R_RUEDA = 1.9
X_RUEDA = 4.15
pieza("CS_Base", (0, 0, Z_BASE + T / 2), (6.7, 12.0, T), m_madera)
for lado in [-1, 1]:
    pieza("CS_Base_Canto_" + str(lado), (lado * 3.36, 0, Z_BASE + T / 2), (0.03, 12.0, T), m_canto)

def neumatico(nombre, centro_cm, lado):
    # Goma con perfil redondeado (giro de un perfil alrededor del eje X), hueca por dentro
    # para que la llanta quede hundida, como en la foto de cerca.
    PERFIL_R = [[1.45, 0.52], [1.62, 0.63], [1.78, 0.6], [1.86, 0.5], [1.9, 0.3], [1.9, -0.3],
                [1.86, -0.5], [1.78, -0.6], [1.62, -0.63], [1.45, -0.52]]
    NSEG = 32
    verts = []
    caras = []
    np_ = len(PERFIL_R)
    for i in range(NSEG):
        a = 2 * math.pi * i / NSEG
        for pr in PERFIL_R:
            verts.append(((centro_cm[0] + pr[1]) * K, (centro_cm[1] + pr[0] * math.cos(a)) * K, (centro_cm[2] + pr[0] * math.sin(a)) * K))
    for i in range(NSEG):
        i2 = (i + 1) % NSEG
        for j in range(np_):
            j2 = (j + 1) % np_
            caras.append((i * np_ + j, i * np_ + j2, i2 * np_ + j2, i2 * np_ + j))
    malla(nombre, verts, caras, m_goma)

def rueda(nombre, y):
    # llanta: dibujo limpio sacado de la foto de cerca (5 radios, 5 tuercas y el eje)
    v = ["x", 0, 0, 0, 512, 512, (y - 1.45) * K, (y + 1.45) * K, 1.45 * 2 * K, 0.0, 1.0]
    m = foto("CS_Llanta_" + nombre, "carrito_rueda", [v], 0.35, barniz=0.4)
    for lado in [-1, 1]:
        c = [lado * X_RUEDA, y, R_RUEDA]
        neumatico("CS_Neumatico_" + nombre + "_" + str(lado), c, lado)
        # tacos grandes y alternados: cruzan la banda y asoman por los dos laterales
        for t in range(20):
            a = 2 * math.pi * (t + 0.5 * (t % 2)) / 20
            sx = 1
            if t % 2 == 1:
                sx = -1
            ca = math.cos(a)
            sa = math.sin(a)
            pieza("CS_Taco_" + nombre + "_" + str(lado) + "_" + str(t), (c[0] + sx * 0.22, y + 1.95 * ca, R_RUEDA + 1.95 * sa), (0.82, 0.48, 0.16), m_goma, rot=(a + math.pi / 2, 0, 0))
            pieza("CS_TacoLat_" + nombre + "_" + str(lado) + "_" + str(t), (c[0] + sx * 0.64, y + 1.72 * ca, R_RUEDA + 1.72 * sa), (0.1, 0.42, 0.34), m_goma, rot=(a + math.pi / 2, 0, 0))
        # llanta hundida en las dos caras y el cubo
        for cara in [-1, 1]:
            cilindro("CS_Llanta_" + nombre + "_" + str(lado) + "_" + str(cara), cm((c[0] + cara * 0.44, y, R_RUEDA)), 1.46 * K, 0.04 * K, m, vertices=32, rot=(0, math.pi / 2, 0))
        cilindro("CS_Cubo_" + nombre + "_" + str(lado), cm((c[0], y, R_RUEDA)), 1.44 * K, 0.84 * K, m_cubo, vertices=24, rot=(0, math.pi / 2, 0))
    cilindro("CS_Eje_" + nombre, cm((0, y, R_RUEDA)), 0.1 * K, 8.4 * K, m_metal, vertices=8, rot=(0, math.pi / 2, 0))
    for lado in [-1, 1]:
        # soportes del eje bajo la base
        pieza("CS_Soporte_Eje_" + nombre + "_" + str(lado), (lado * 2.6, y, (R_RUEDA + Z_BASE) / 2), (T, 0.9, Z_BASE - R_RUEDA + 0.3), m_madera)

rueda("Del", Y_DEL)
rueda("Tras", Y_TRAS)

# Engranaje naranja en el eje delantero y piñón blanco del motor
cilindro("CS_Engranaje_Grande", cm((1.1, Y_DEL, R_RUEDA)), 1.25 * K, 0.25 * K, m_naranja, vertices=24, rot=(0, math.pi / 2, 0))
for i in range(24):
    a = 2 * math.pi * i / 24
    pieza("CS_Diente_" + str(i), (1.1, Y_DEL + 1.3 * math.cos(a), R_RUEDA + 1.3 * math.sin(a)), (0.25, 0.14, 0.14), m_naranja, rot=(a, 0, 0))

# ==========================================
# 3. MOTOR, BANDEJA Y COLUMNA CON LA CABEZA
# ==========================================
Z_SUP = Z_BASE + T
cilindro("CS_Motor", cm((0.15, -3.35, Z_SUP + 0.85)), 0.85 * K, 2.4 * K, m_metal, vertices=20, rot=(0, math.pi / 2, 0))
cilindro("CS_Motor_Eje", cm((1.55, -3.35, Z_SUP + 0.85)), 0.06 * K, 0.6 * K, m_metal, vertices=6, rot=(0, math.pi / 2, 0))
cilindro("CS_Pinon", cm((1.55, -3.35, Z_SUP + 0.85)), 0.35 * K, 0.25 * K, m_blanco, vertices=12, rot=(0, math.pi / 2, 0))
pieza("CS_Bandeja", (0, -2.5, 5.55), (3.0, 3.6, T), m_madera)
pieza("CS_Travesano", (0, -4.4, 4.4), (2.6, T, 0.6), m_madera)

# Columna: dos patas verticales hasta la cabeza
for lado in [-1, 1]:
    pieza("CS_Columna_" + str(lado), (lado * 0.95, -5.1, (Z_SUP + 8.6) / 2), (T, 1.55, 8.6 - Z_SUP), m_madera)
    pieza("CS_Columna_Canto_" + str(lado), (lado * 0.95, -5.89, (Z_SUP + 8.6) / 2), (T + 0.02, 0.03, 8.6 - Z_SUP), m_canto)

# Cabeza: frente con los ojos, laterales con sus ranuras, tapa y trasera
Z0 = 8.4
Z1 = 11.0
pieza("CS_Cabeza_Frente", (0, -7.0, (Z0 + Z1) / 2), (5.3, T, Z1 - Z0), m_madera)
v_ojos = ["y", -1, 0, 0, 512, 245, -2.65 * K, 2.65 * K, Z1 * K, Z0 * K, 1.0]
m_ojos = foto("CS_Ojos", "carrito_ojos", [v_ojos], 0.75)
pieza("CS_Cabeza_Ojos", (0, -7.16, (Z0 + Z1) / 2), (5.3, 0.02, Z1 - Z0), m_ojos)
pieza("CS_Cabeza_Tapa", (0, -5.45, Z1 - T / 2), (5.3, 3.4, T), m_madera)
pieza("CS_Cabeza_Trasera", (0, -3.9, (Z0 + Z1) / 2 + 0.3), (5.3, T, Z1 - Z0 - 0.6), m_madera)
# lateral: rectángulo con el chaflán abajo-atrás (como en la foto de lado)
LATERAL = [[-7.15, Z1], [-3.75, Z1], [-3.75, 9.9], [-4.55, Z0 - 0.4], [-7.15, Z0 - 0.4]]
v_lado = ["x", 0, 0, 0, 384, 292, -7.15 * K, -3.75 * K, Z1 * K, (Z0 - 0.4) * K, 1.0]
m_lado = foto("CS_Lateral", "carrito_lado", [v_lado], 0.75)
for lado in [-1, 1]:
    prisma_yz("CS_Cabeza_Lateral_" + str(lado), LATERAL, lado * 2.65 - T / 2, lado * 2.65 + T / 2, m_lado)
    pieza("CS_Cabeza_Canto_" + str(lado), (lado * 2.65, -7.17, (Z0 + Z1) / 2 - 0.2), (T + 0.02, 0.03, Z1 - Z0 + 0.4), m_canto)

# ==========================================
# 4. SOPORTE EN V Y PANELES SOLARES
# ==========================================
Z_PANEL = 6.4
Y_V = -0.8
for lado in [-1, 1]:
    # brazo de la V: del centro de la base hacia fuera y arriba
    brazo = [[lado * 1.6, Z_SUP], [lado * 2.6, Z_SUP], [lado * 4.7, Z_PANEL], [lado * 3.5, Z_PANEL]]
    if lado < 0:
        brazo = [brazo[1], brazo[0], brazo[3], brazo[2]]
    prisma_xz("CS_V_Brazo_" + str(lado), brazo, Y_V - T / 2, Y_V + T / 2, m_madera)
    # placa bajo el panel y el panel solar
    pieza("CS_Placa_Panel_" + str(lado), (lado * 3.6, -0.45, Z_PANEL + T / 2), (3.4, 4.4, T), m_madera)
    pieza("CS_Panel_" + str(lado), (lado * 3.6, -0.45, Z_PANEL + T + 0.08), (3.8, 4.9, 0.16), m_panel)
pieza("CS_V_Base", (0, Y_V, Z_SUP + 0.3), (3.2, T, 0.6), m_madera)

# ==========================================
# 5. CABLES (rojo y negro) Y EL MAZO DE ATRÁS
# ==========================================
for lado in [-1, 1]:
    tubo("CS_Cable_R_" + str(lado), [cm((lado * 2.3, 0.6, Z_PANEL)), cm((lado * 1.4, 1.2, 5.0)), cm((lado * 0.4, 1.5, Z_SUP + 0.15)), cm((0.2, 3.6, Z_SUP + 0.2))],
         [0.06 * K, 0.06 * K, 0.06 * K, 0.06 * K], m_rojo, n=6)
    tubo("CS_Cable_N_" + str(lado), [cm((lado * 2.0, 0.9, Z_PANEL)), cm((lado * 0.9, 0.2, 5.2)), cm((0, -1.5, 5.0)), cm((0.3, -2.9, Z_SUP + 1.2))],
         [0.06 * K, 0.06 * K, 0.06 * K, 0.06 * K], m_negro, n=6)
# mazo sujeto con una brida blanca en la parte de atrás
tubo("CS_Mazo_R", [cm((0.2, 3.6, Z_SUP + 0.2)), cm((0.8, 5.0, Z_SUP + 0.6)), cm((1.4, 6.3, Z_SUP + 1.6)), cm((0.6, 6.6, Z_SUP + 2.6)), cm((-0.4, 6.0, Z_SUP + 2.0))],
     [0.007, 0.007, 0.007, 0.007, 0.007], m_rojo, n=6)
tubo("CS_Mazo_N", [cm((-0.2, 3.6, Z_SUP + 0.2)), cm((0.5, 5.1, Z_SUP + 0.8)), cm((1.0, 6.4, Z_SUP + 1.9)), cm((0.2, 6.8, Z_SUP + 2.8)), cm((-0.8, 6.2, Z_SUP + 2.3))],
     [0.007, 0.007, 0.007, 0.007, 0.007], m_negro, n=6)
cilindro("CS_Brida", cm((0.65, 5.05, Z_SUP + 0.7)), 0.18 * K, 0.25 * K, m_blanco, vertices=10, rot=(0.6, 0, 0))

# Suelo pequeño para que la vista general encuadre bien
bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1.0, depth=0.01, location=(0, 0, -0.005))
suelo = bpy.context.active_object
suelo.name = "CS_Suelo"
asignar_mat(suelo, material("CS_SueloMat", (0.45, 0.45, 0.45, 1.0), 0.9))
