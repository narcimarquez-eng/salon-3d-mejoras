import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# CASA ENCALADA DE DOS PLANTAS CON BALCONES (hoja de 5 vistas del usuario)
# ==============================================================================
# Planta baja: portón de madera con recerco de piedra, dos ventanas con reja voladiza
# y guardapolvo. Planta alta: tres balcones de forja con macetas. Cubierta de teja árabe
# a dos aguas con la cumbrera paralela a la fachada; hastiales en los laterales.
# Texturas: la PROPIA HOJA (foto_limpia.jpg, sin la línea discontinua que cruzaba la
# fachada); cada cara lleva UV a su trozo de la vista que le toca.
# La hoja no trae cotas: escala sacada de la puerta (2,4 m) -> 1 px = 2,58 cm:
# 11,4 x 10,7 m, alero a 5,95 m y cumbrera a 9,2 m. Todo aproximado.
# Incongruencia: la vista posterior dibuja un hastial, pero la frontal y las laterales
# ponen la cumbrera paralela a la fachada. Manda la frontal: la trasera usa solo la
# parte de muro de su dibujo (con sus ventanas y su puerta) y el faldón trasero lleva
# las tejas de la frontal.
# Ejes: X = ancho, Y = fondo (la fachada mira a Y negativo), Z = altura.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.8, bloom=0.0)
bpy.ops.render.set_lighting(intensity=1.0, angle=45)
bpy.ops.render.set_ssao(intensity=0.8)

def material_imagen(nombre, ruta, alfa=1.0):
    img = bpy.data.images.load(ruta)
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.95
    bsdf.inputs["Metallic"].default_value = 0.0
    if alfa < 1.0:
        bsdf.inputs["Alpha"].default_value = alfa
    nodo = mat.node_tree.nodes.new('ShaderNodeTexImage')
    nodo.image = img
    mat.node_tree.links.new(nodo.outputs['Color'], bsdf.inputs['Base Color'])
    return mat

def material(nombre, color, rugosidad=0.9, metalico=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rugosidad
    bsdf.inputs["Metallic"].default_value = metalico
    return mat

def asignar_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj

m_foto = material_imagen("CD_Foto", "/textures/casa_dos_plantas/foto_limpia.jpg")
m_plantas = material_imagen("CD_Plantas", "/textures/casa_dos_plantas/plantas.png", 0.97)
m_forja = material("CD_Forja", (0.02, 0.02, 0.022, 1.0), 0.5, 0.6)
m_suelo = material("CD_Suelo", (0.20, 0.17, 0.12, 1.0), 0.95)
m_barro = material("CD_Maceta", (0.40, 0.17, 0.09, 1.0), 0.9)
m_hoja = material("CD_Hojas", (0.05, 0.11, 0.03, 1.0), 0.85)
m_flor = material("CD_Flores", (0.55, 0.03, 0.10, 1.0), 0.8)

# ==========================================
# 1. MALLA CON UV A LA HOJA (2000 x 1493 px)
# ==========================================
IMG_W = 2000.0
IMG_H = 1493.0

def nueva_malla():
    return [[], [], []]

def cara(m, pts, pix, ancho=IMG_W, alto=IMG_H):
    base = len(m[0])
    for i in range(len(pts)):
        m[0].append(pts[i])
        p = pix[i]
        m[2].append((p[0] / ancho, 1.0 - p[1] / alto))
    if len(pts) == 4:
        m[1].append((base, base + 1, base + 2, base + 3))
    else:
        m[1].append((base, base + 1, base + 2))

def crear(nombre, m, mat):
    malla = bpy.data.meshes.new(nombre)
    malla.from_pydata(m[0], [], m[1])
    capa = malla.uv_layers.new(name="UVMap")
    for i in range(len(m[2])):
        capa.data[i].uv = m[2][i]
    obj = bpy.data.objects.new(nombre, malla)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

def rect(r):
    return [[r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]]]

K = 0.0258
X0 = -5.72
X1 = 5.72
Y0 = -5.35
Y1 = 5.35
HM = 5.95        # muros hasta el alero (cornisa incluida)
HC = 9.16        # cumbrera (cara de arriba)
VX = 0.33        # vuelo en los hastiales
VY = 0.65        # vuelo de los aleros
GR = 0.15
PEND = (HC - (HM + GR)) / Y1
EY = Y1 + VY
ZE = HC - EY * PEND
ZH = HC - GR - 0.04

def fr(x, z):
    # Frontal: muro de 779 a 1223 px, suelo a 880,7 px
    return [1001.0 + x / K, 880.7 - z / K]

def iz(y, z):
    # Lateral izquierdo: fachada a la derecha (533 px), trasera a la izquierda (121 px)
    return [533.0 - (y - Y0) * 412.0 / 10.7, 880.0 - z / K]

def de(y, z):
    # Lateral derecho: fachada a la izquierda (1448 px), trasera a la derecha (1866 px)
    return [1448.0 + (y - Y0) * 418.0 / 10.7, 880.0 - z / K]

def tr(x, z):
    # Posterior: x = +5,72 en 778 px, x = -5,72 en 1222 px; muro de 1355 (suelo) a 1125 px
    return [778.0 + (X1 - x) / 11.44 * 444.0, 1355.0 - z * 230.0 / HM]

ENLUCIDO = [1520, 760, 1600, 820]
SOMBRA = [800, 662, 1200, 668]

casa = nueva_malla()

# Muros
cara(casa, [(X0, Y0, 0), (X1, Y0, 0), (X1, Y0, HM), (X0, Y0, HM)], [fr(X0, 0), fr(X1, 0), fr(X1, HM), fr(X0, HM)])
cara(casa, [(X1, Y1, 0), (X0, Y1, 0), (X0, Y1, HM), (X1, Y1, HM)], [tr(X1, 0), tr(X0, 0), tr(X0, HM), tr(X1, HM)])
cara(casa, [(X0, Y1, 0), (X0, Y0, 0), (X0, Y0, HM), (X0, Y1, HM)], [iz(Y1, 0), iz(Y0, 0), iz(Y0, HM), iz(Y1, HM)])
cara(casa, [(X0, Y1, HM), (X0, Y0, HM), (X0, 0, ZH)], [iz(Y1, HM), iz(Y0, HM), [327, 540]])
cara(casa, [(X1, Y0, 0), (X1, Y1, 0), (X1, Y1, HM), (X1, Y0, HM)], [de(Y0, 0), de(Y1, 0), de(Y1, HM), de(Y0, HM)])
cara(casa, [(X1, Y0, HM), (X1, Y1, HM), (X1, 0, ZH)], [de(Y0, HM), de(Y1, HM), [1658, 540]])

# Cubierta: faldones con las tejas de la frontal (alero 650 px, cumbrera 522 px)
RX0 = X0 - VX
RX1 = X1 + VX
pa = fr(RX0, 0)[0]
pb = fr(RX1, 0)[0]
cara(casa, [(RX0, -EY, ZE), (RX1, -EY, ZE), (RX1, 0, HC), (RX0, 0, HC)], [[pa, 650], [pb, 650], [pb, 522], [pa, 522]])
cara(casa, [(RX1, EY, ZE), (RX0, EY, ZE), (RX0, 0, HC), (RX1, 0, HC)], [[pa, 650], [pb, 650], [pb, 522], [pa, 522]])
cara(casa, [(RX0, -EY, ZE - GR), (RX1, -EY, ZE - GR), (RX1, -EY, ZE), (RX0, -EY, ZE)], [[pa, 652], [pb, 652], [pb, 642], [pa, 642]])
cara(casa, [(RX1, EY, ZE - GR), (RX0, EY, ZE - GR), (RX0, EY, ZE), (RX1, EY, ZE)], [[pa, 652], [pb, 652], [pb, 642], [pa, 642]])

def borde(px_centro, px_por_m, y, abajo):
    # Arista superior del tejado en un lateral: 523 px en la cumbrera, 648 px en el alero
    py = 520.0 + abs(y) / EY * 125.0
    if abajo:
        py = py + 9.0
    return [px_centro + y * px_por_m, py]

def bi(y, abajo):
    return borde(327.5, -1.0 / K, y, abajo)

def bd(y, abajo):
    return borde(1658.5, 423.0 / 10.7, y, abajo)

cara(casa, [(RX0, 0, HC - GR), (RX0, -EY, ZE - GR), (RX0, -EY, ZE), (RX0, 0, HC)], [bi(0, True), bi(-EY, True), bi(-EY, False), bi(0, False)])
cara(casa, [(RX0, EY, ZE - GR), (RX0, 0, HC - GR), (RX0, 0, HC), (RX0, EY, ZE)], [bi(EY, True), bi(0, True), bi(0, False), bi(EY, False)])
cara(casa, [(RX1, -EY, ZE - GR), (RX1, 0, HC - GR), (RX1, 0, HC), (RX1, -EY, ZE)], [bd(-EY, True), bd(0, True), bd(0, False), bd(-EY, False)])
cara(casa, [(RX1, 0, HC - GR), (RX1, EY, ZE - GR), (RX1, EY, ZE), (RX1, 0, HC)], [bd(0, True), bd(EY, True), bd(EY, False), bd(0, False)])
cara(casa, [(RX0, 0, HC - GR), (RX1, 0, HC - GR), (RX1, -EY, ZE - GR), (RX0, -EY, ZE - GR)], rect(SOMBRA))
cara(casa, [(RX1, 0, HC - GR), (RX0, 0, HC - GR), (RX0, EY, ZE - GR), (RX1, EY, ZE - GR)], rect(SOMBRA))

def resalte(x0, x1, z0, z1, sal):
    y0 = Y0 - sal
    p0 = fr(x0, z1)
    p1 = fr(x1, z0)
    cara(casa, [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], rect([p0[0], p0[1], p1[0], p1[1]]))
    cara(casa, [(x0, y0, z1), (x1, y0, z1), (x1, Y0, z1), (x0, Y0, z1)], rect(ENLUCIDO))
    cara(casa, [(x0, Y0, z0), (x0, y0, z0), (x0, y0, z1), (x0, Y0, z1)], rect(ENLUCIDO))
    cara(casa, [(x1, y0, z0), (x1, Y0, z0), (x1, Y0, z1), (x1, y0, z1)], rect(ENLUCIDO))
    cara(casa, [(x0, y0, z0), (x0, Y0, z0), (x1, Y0, z0), (x1, y0, z0)], rect(ENLUCIDO))

# Balcones: losa (759-768 px) con su moldura
BALCONES = [[-4.75, -2.43], [-1.53, 1.50], [2.37, 4.72]]
SAL = 0.65
ZL0 = 2.90
ZL1 = 3.14
for b in BALCONES:
    resalte(b[0], b[1], ZL0, ZL1, SAL)
# Guardapolvos y basamentos de las ventanas bajas, recerco de piedra de la puerta, cornisa
for xs in [[-4.60, -2.55], [2.52, 4.55]]:
    resalte(xs[0], xs[1], 2.34, 2.73, 0.15)
    resalte(xs[0], xs[1], 0.0, 0.46, 0.10)
resalte(-1.25, 1.20, 0.0, 2.70, 0.08)
resalte(X0, X1, 5.74, HM, 0.08)

crear("CD_Casa", casa, m_foto)

# ==========================================
# 2. BARANDILLAS DE FORJA (cajas finas en una sola malla)
# ==========================================
hierro = nueva_malla()

def barra(x0, x1, y0, y1, z0, z1):
    # caja alineada a los ejes; UV sin uso (material liso)
    p = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    caras = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]]
    for c in caras:
        cara(hierro, [p[c[0]], p[c[1]], p[c[2]], p[c[3]]], [[0, 0], [1, 0], [1, 1], [0, 1]])

ZB = ZL1
ZT = 4.22
G = 0.025
for b in BALCONES:
    yf = Y0 - SAL + 0.04
    x0 = b[0] + 0.05
    x1 = b[1] - 0.05
    barra(x0, x1, yf - G, yf + G, ZT - 0.05, ZT)          # pasamanos
    barra(x0, x1, yf - G, yf + G, ZB + 0.08, ZB + 0.12)   # pletina baja
    n = int((x1 - x0) / 0.13)
    for i in range(n + 1):
        x = x0 + i * (x1 - x0) / n
        barra(x - 0.012, x + 0.012, yf - 0.012, yf + 0.012, ZB, ZT)
    for xl in [x0, x1]:
        barra(xl - G, xl + G, yf, Y0, ZT - 0.05, ZT)
        for j in range(4):
            y = yf + (j + 1) * (Y0 - yf) / 5
            barra(xl - 0.012, xl + 0.012, y - 0.012, y + 0.012, ZB, ZT)
crear("CD_Barandillas", hierro, m_forja)

# ==========================================
# 3. MACETAS Y PLANTAS
# ==========================================
def maceta(pref, x, y, z, r, alto, flores=True):
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r * 0.7, radius2=r, depth=alto, location=(x, y, z + alto / 2))
    o = bpy.context.active_object
    o.name = pref + "_Tiesto"
    asignar_mat(o, m_barro)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=7, ring_count=4, radius=r * 1.15, location=(x, y, z + alto + r * 0.4))
    o = bpy.context.active_object
    o.scale = (1.0, 1.0, 0.8)
    o.name = pref + "_Mata"
    asignar_mat(o, m_hoja)
    if flores:
        for k in range(3):
            a = k * 2.1 + 0.5
            bpy.ops.mesh.primitive_uv_sphere_add(segments=6, ring_count=3, radius=r * 0.4, location=(x + r * 0.6 * math.cos(a), y - r * 0.5, z + alto + r * 0.8 + 0.03 * k))
            o = bpy.context.active_object
            o.name = pref + "_Flor_" + str(k)
            asignar_mat(o, m_flor)

# Macetas colgadas de las barandillas laterales (sobre el pasamanos) y en la losa central
for xm in [-4.28, -2.95, 2.89, 4.21]:
    maceta("CD_MacetaBalcon_" + str(int(xm * 10)), xm, Y0 - SAL + 0.04, ZT - 0.12, 0.16, 0.18)
for xm in [-1.20, 1.15]:
    maceta("CD_MacetaLosa_" + str(int(xm * 10)), xm, Y0 - SAL + 0.25, ZL1, 0.16, 0.25, False)
# Tinajas junto al portón y macetas al pie de las rejas
maceta("CD_Tinaja_I", -1.70, Y0 - 0.35, 0.0, 0.30, 0.65, False)
maceta("CD_Tinaja_D", 1.58, Y0 - 0.35, 0.0, 0.30, 0.65, False)
maceta("CD_Maceta_Esq", 4.95, Y0 - 0.35, 0.0, 0.20, 0.40, False)

plantas = nueva_malla()

def tarjeta(a, b, alto, r):
    cara(plantas, [(a[0], a[1], 0.0), (b[0], b[1], 0.0), (b[0], b[1], alto), (a[0], a[1], alto)], rect(r), 256.0, 256.0)

MATA_I = [0, 0, 105, 138]
MATA_D = [120, 0, 222, 111]
tarjeta((-6.65, -5.0), (-5.75, -5.0), 1.19, MATA_I)
tarjeta((-6.2, -5.5), (-6.2, -4.5), 1.19, MATA_I)
tarjeta((5.75, -4.9), (6.6, -4.9), 0.95, MATA_D)
tarjeta((6.15, -5.4), (6.15, -4.4), 0.95, MATA_D)
crear("CD_PlantasFoto", plantas, m_plantas)

# ==========================================
# 4. SUELO
# ==========================================
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.5, -0.05))
suelo = bpy.context.active_object
suelo.name = "CD_Suelo"
suelo.scale = (14.5, 13.5, 0.1)
asignar_mat(suelo, m_suelo)
