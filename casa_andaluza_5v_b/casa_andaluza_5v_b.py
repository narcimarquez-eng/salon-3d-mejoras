import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# CASA DE ESTILO ANDALUZ - 5 VISTAS, VERSIÓN B (segunda hoja del usuario)
# ==============================================================================
# Casa de una planta, 8,0 x 5,0 m, muros encalados de 3,0 m y cubierta de teja árabe
# a dos aguas con la cumbrera paralela a la fachada a 4,2 m (cotas de la hoja).
# Misma casa que casa_andaluza_5v con otra hoja: contraventanas de madera, cresterías
# de forja sobre las ventanas, dintel de madera en la puerta y una ventana con reja en
# el lateral izquierdo. La hoja no trae rótulos.
# Las texturas son la PROPIA HOJA (foto_limpia.jpg, con la trasera compuesta en el hueco
# libre): cada cara lleva UV a su trozo. Todo el edificio es un material.
# Notas sobre la hoja:
#  - La vista rotulada "posterior" es un hastial (5 m, con puerta de servicio): es el
#    lateral DERECHO. La fachada trasera de 8 m no está dibujada: se ha compuesto con el
#    enlucido del lateral izquierdo y su ventana enrejada, y va en el hueco libre.
#  - Cada vista tiene su propia escala en píxeles: cada una se ajusta a las cotas.
#  - Las plantas de fuera del muro son tarjetas con transparencia recortadas de la hoja.
# Ejes: X = ancho (8 m), Y = fondo (5 m, la fachada mira a Y negativo), Z = altura.
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
        # Por debajo de 0,99 el visor respeta la transparencia de la imagen
        bsdf.inputs["Alpha"].default_value = alfa
    nodo = mat.node_tree.nodes.new('ShaderNodeTexImage')
    nodo.image = img
    mat.node_tree.links.new(nodo.outputs['Color'], bsdf.inputs['Base Color'])
    return mat

m_foto = material_imagen("CA5B_Foto", "/textures/casa_andaluza_5v_b/foto_limpia.jpg")
m_plantas = material_imagen("CA5B_Plantas", "/textures/casa_andaluza_5v_b/plantas.png", 0.97)
m_suelo = bpy.data.materials.new(name="CA5B_Suelo")
m_suelo.use_nodes = True
bs = m_suelo.node_tree.nodes.get("Principled BSDF")
bs.inputs["Base Color"].default_value = (0.10, 0.085, 0.06, 1.0)
bs.inputs["Roughness"].default_value = 0.95
bs.inputs["Metallic"].default_value = 0.0

# ==========================================
# 1. MALLA CON UV A LA HOJA
# ==========================================
def nueva_malla():
    return [[], [], []]

def cara(m, pts, pix, ancho=2000.0, alto=1116.0):
    # pts en sentido antihorario vistos desde fuera; pix = píxel de la imagen de cada esquina
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
    # r = [px0, py0, px1, py1] -> esquinas abajo-izq, abajo-dcha, arriba-dcha, arriba-izq
    return [[r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]]]

# ---------- Medidas (cotas de la hoja) ----------
X0 = -4.0
X1 = 4.0
Y0 = -2.5
Y1 = 2.5
HM = 3.0        # muros
HC = 4.2        # cumbrera (cara de arriba de la teja)
VY = 0.3        # vuelo de los aleros (vistas laterales)
VX = 0.05       # vuelo en los hastiales (en la frontal el tejado no sobresale)
GR = 0.15       # grueso de la cubierta
PEND = 0.42
ZE = HC - (Y1 + VY) * PEND      # cara de arriba en el alero
ZH = HC - GR - 0.05             # pico del hastial bajo la teja

# ---------- Funciones de cada vista (píxel de la hoja) ----------
def fr(x, z):
    # Frontal: muro de 778 a 1225 px (8 m); suelo 955 px, coronación 737 px (3 m)
    return [778.0 + (x - X0) / 8.0 * 447.0, 955.0 - z * (955.0 - 737.0) / HM]

def iz(y, z):
    # Lateral izquierdo: trasera a la izquierda (128 px), fachada a la derecha (535 px)
    return [128.0 + (Y1 - y) / 5.0 * 407.0, 950.0 - z * (950.0 - 725.0) / HM]

def de(y, z):
    # "Posterior" de la hoja = lateral derecho: fachada a la izquierda (1443), fondo 1868
    return [1443.0 + (y - Y0) / 5.0 * 425.0, 947.0 - z * (947.0 - 725.0) / HM]

def tr(x, z):
    # Trasera compuesta (hueco de la hoja): x = +4 en 40 px, x = -4 en 691 px; z 3 m en 150 px
    return [40.0 + (X1 - x) / 8.0 * 651.0, 376.0 - z * 226.0 / HM]

ENLUCIDO = [200, 760, 280, 820]     # pared limpia del lateral izquierdo
SOMBRA = [790, 738, 1210, 746]      # franja en sombra bajo el alero (frontal)

casa = nueva_malla()

# Muros
cara(casa, [(X0, Y0, 0), (X1, Y0, 0), (X1, Y0, HM), (X0, Y0, HM)], [fr(X0, 0), fr(X1, 0), fr(X1, HM), fr(X0, HM)])
cara(casa, [(X1, Y1, 0), (X0, Y1, 0), (X0, Y1, HM), (X1, Y1, HM)], [tr(X1, 0), tr(X0, 0), tr(X0, HM), tr(X1, HM)])
cara(casa, [(X0, Y1, 0), (X0, Y0, 0), (X0, Y0, HM), (X0, Y1, HM)], [iz(Y1, 0), iz(Y0, 0), iz(Y0, HM), iz(Y1, HM)])
cara(casa, [(X0, Y1, HM), (X0, Y0, HM), (X0, 0, ZH)], [iz(Y1, HM), iz(Y0, HM), [331, 617]])
cara(casa, [(X1, Y0, 0), (X1, Y1, 0), (X1, Y1, HM), (X1, Y0, HM)], [de(Y0, 0), de(Y1, 0), de(Y1, HM), de(Y0, HM)])
cara(casa, [(X1, Y0, HM), (X1, Y1, HM), (X1, 0, ZH)], [de(Y0, HM), de(Y1, HM), [1655, 617]])

# Cubierta: faldones con las tejas de la frontal (de 725 px en el alero a 597 en la cumbrera)
RX0 = X0 - VX
RX1 = X1 + VX
EY = Y1 + VY
pa = fr(RX0, 0)[0]
pb = fr(RX1, 0)[0]
cara(casa, [(RX0, -EY, ZE), (RX1, -EY, ZE), (RX1, 0, HC), (RX0, 0, HC)], [[pa, 726], [pb, 726], [pb, 598], [pa, 598]])
cara(casa, [(RX1, EY, ZE), (RX0, EY, ZE), (RX0, 0, HC), (RX1, 0, HC)], [[pa, 726], [pb, 726], [pb, 598], [pa, 598]])
# Canto de los aleros (borde de las tejas)
cara(casa, [(RX0, -EY, ZE - GR), (RX1, -EY, ZE - GR), (RX1, -EY, ZE), (RX0, -EY, ZE)], [[pa, 736], [pb, 736], [pb, 724], [pa, 724]])
cara(casa, [(RX1, EY, ZE - GR), (RX0, EY, ZE - GR), (RX0, EY, ZE), (RX1, EY, ZE)], [[pa, 736], [pb, 736], [pb, 724], [pa, 724]])

# Cantos de los hastiales: la línea de teja de las vistas laterales
def borde_iz(y, abajo):
    # arista superior del tejado en el lateral izquierdo: 600 px en la cumbrera, 722 en el alero
    py = 600.0 + abs(y) / EY * 122.0
    if abajo:
        py = py + 14.0
    return [128.0 + (Y1 - y) / 5.0 * 407.0, py]

def borde_de(y, abajo):
    py = 600.0 + abs(y) / EY * 122.0
    if abajo:
        py = py + 14.0
    return [1443.0 + (y - Y0) / 5.0 * 425.0, py]

cara(casa, [(RX0, 0, HC - GR), (RX0, -EY, ZE - GR), (RX0, -EY, ZE), (RX0, 0, HC)],
     [borde_iz(0, True), borde_iz(-EY, True), borde_iz(-EY, False), borde_iz(0, False)])
cara(casa, [(RX0, EY, ZE - GR), (RX0, 0, HC - GR), (RX0, 0, HC), (RX0, EY, ZE)],
     [borde_iz(EY, True), borde_iz(0, True), borde_iz(0, False), borde_iz(EY, False)])
cara(casa, [(RX1, -EY, ZE - GR), (RX1, 0, HC - GR), (RX1, 0, HC), (RX1, -EY, ZE)],
     [borde_de(-EY, True), borde_de(0, True), borde_de(0, False), borde_de(-EY, False)])
cara(casa, [(RX1, 0, HC - GR), (RX1, EY, ZE - GR), (RX1, EY, ZE), (RX1, 0, HC)],
     [borde_de(0, True), borde_de(EY, True), borde_de(EY, False), borde_de(0, False)])
# Panza de la cubierta
cara(casa, [(RX0, 0, HC - GR), (RX1, 0, HC - GR), (RX1, -EY, ZE - GR), (RX0, -EY, ZE - GR)], rect(SOMBRA))
cara(casa, [(RX1, 0, HC - GR), (RX0, 0, HC - GR), (RX0, EY, ZE - GR), (RX1, EY, ZE - GR)], rect(SOMBRA))

# Resaltes de la fachada: la cara delantera sale de la hoja y el resto de enlucido
def resalte(x0, x1, z0, z1, sal):
    y0 = Y0 - sal
    p0 = fr(x0, z1)
    p1 = fr(x1, z0)
    cara(casa, [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], rect([p0[0], p0[1], p1[0], p1[1]]))
    cara(casa, [(x0, y0, z1), (x1, y0, z1), (x1, Y0, z1), (x0, Y0, z1)], rect(ENLUCIDO))
    cara(casa, [(x0, Y0, z0), (x0, y0, z0), (x0, y0, z1), (x0, Y0, z1)], rect(ENLUCIDO))
    cara(casa, [(x1, y0, z0), (x1, Y0, z0), (x1, Y0, z1), (x1, y0, z1)], rect(ENLUCIDO))
    cara(casa, [(x0, y0, z0), (x0, Y0, z0), (x1, Y0, z0), (x1, y0, z0)], rect(ENLUCIDO))

resalte(-3.04, -1.52, 0.66, 1.03, 0.16)   # vierteaguas ventana izquierda
resalte(1.52, 3.06, 0.66, 1.03, 0.16)     # vierteaguas ventana derecha
resalte(-0.76, 0.71, 0.0, 0.11, 0.22)     # escalón de la puerta
resalte(X0, X1, 2.85, HM, 0.05)           # cornisa bajo el alero
resalte(-0.92, 0.87, 2.34, 2.57, 0.10)    # dintel de madera de la puerta
# Contraventanas abiertas (de 785 a 880 px de la hoja)
for xs in [[805, 838], [910, 945], [1065, 1098], [1170, 1202]]:
    resalte((xs[0] - 778.0) / 447.0 * 8.0 - 4.0, (xs[1] - 778.0) / 447.0 * 8.0 - 4.0, 1.03, 2.34, 0.05)

crear("CA5B_Casa", casa, m_foto)

# ==========================================
# 2. PLANTAS (tarjetas cruzadas con transparencia, atlas 512 x 256)
# ==========================================
plantas = nueva_malla()

def tarjeta(a, b, z0, alto, r):
    cara(plantas, [(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z0 + alto), (a[0], a[1], z0 + alto)], rect(r), 512.0, 256.0)

MATA = [0, 0, 154, 188]          # mata de la esquina (frontal)
MACETAS_IZ = [170, 0, 340, 234]  # macetas del lateral izquierdo
MACETAS_DE = [350, 0, 474, 184]  # macetas del lateral derecho
# Mata junto a la esquina delantera izquierda (en la frontal sale a la izquierda del muro)
tarjeta((-5.45, -2.3), (-4.0, -2.3), 0.0, 1.3, MATA)
tarjeta((-4.75, -3.0), (-4.75, -1.6), 0.0, 1.3, MATA)
# Macetas del lateral izquierdo, delante de la esquina
tarjeta((-4.35, -2.45), (-4.35, -3.55), 0.0, 1.55, MACETAS_IZ)
tarjeta((-4.95, -3.0), (-3.85, -3.0), 0.0, 1.55, MACETAS_IZ)
# Macetas del lateral derecho, delante de la esquina
tarjeta((4.35, -3.24), (4.35, -2.5), 0.0, 1.2, MACETAS_DE)
tarjeta((3.95, -2.87), (4.75, -2.87), 0.0, 1.2, MACETAS_DE)
crear("CA5B_Plantas", plantas, m_plantas)

# ==========================================
# 3. SUELO
# ==========================================
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -0.4, -0.05))
suelo = bpy.context.active_object
suelo.name = "CA5B_Suelo"
suelo.scale = (11.0, 8.0, 0.1)
suelo.data.materials.append(m_suelo)
