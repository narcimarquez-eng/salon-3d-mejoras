import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# CASA RÚSTICA ENCALADA CON ANEJO (a partir de la hoja de vistas del usuario)
# ==============================================================================
# Cuerpo principal de dos plantas con cubierta a dos aguas (cumbrera paralela a la
# fachada), anejo bajo a la izquierda con tejado de una vertiente que cae hacia la
# fachada, tejadillo sobre la puerta con zapatas de madera, poyete encalado, macetas
# y dos buganvillas
# recortadas de la foto.
# Las texturas son la PROPIA FOTO: cada cara lleva coordenadas UV que apuntan a su
# trozo de la hoja (fachada, laterales, trasera, tejados), así que todo el edificio
# usa un solo material con una sola imagen.
# Se ignora la vista cenital. Donde las vistas no cuadran manda la FRONTAL:
#  - la trasera dibuja el tejado del anejo cayendo hacia atrás y el cuerpo principal
#    más estrecho: aquí el anejo cae hacia delante (frente y lateral izquierdo) y la
#    imagen trasera se estira al ancho del frente.
# Escala: 1 píxel de la hoja (2000 px de ancho) = 1,92 cm (alero a 6 m).
# Ejes: X = ancho, Y = fondo (la fachada mira a Y negativo), Z = altura.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.8, bloom=0.0)
bpy.ops.render.set_lighting(intensity=1.0, angle=45)
bpy.ops.render.set_ssao(intensity=0.8)

def material(nombre, color, rugosidad=0.9):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rugosidad
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat

def asignar_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj

def cono(nombre, centro, r1, r2, alto, mat, vertices=8):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0), segmentos=7, anillos=4):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def cilindro(nombre, centro, radio, alto, mat, vertices=6, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

# ==========================================
# 1. MATERIALES
# ==========================================
IMG_W = 2000.0
IMG_H = 1116.0
img = bpy.data.images.load("/textures/casa_rustica/foto_casa_rustica.jpg")
m_foto = bpy.data.materials.new(name="CR_Foto")
m_foto.use_nodes = True
bsdf = m_foto.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Roughness"].default_value = 0.95
bsdf.inputs["Metallic"].default_value = 0.0
nodo = m_foto.node_tree.nodes.new('ShaderNodeTexImage')
nodo.image = img
m_foto.node_tree.links.new(nodo.outputs['Color'], bsdf.inputs['Base Color'])

# Colores tomados de la foto (pasados a lineal)
m_hoja = material("CR_Hojas", (0.05, 0.10, 0.025, 1.0), 0.85)
m_flor = material("CR_FlorMaceta", (0.42, 0.10, 0.42, 1.0), 0.8)
m_barro = material("CR_Maceta", (0.40, 0.15, 0.07, 1.0), 0.9)
m_suelo = material("CR_Suelo", (0.33, 0.29, 0.22, 1.0), 0.95)

# ==========================================
# 2. MALLA ÚNICA CON LA FOTO (caras con UV a su trozo de la hoja)
# ==========================================
V = []
F = []
UV = []

def cara(pts, pix):
    # pts: esquinas en sentido antihorario vistas desde fuera; pix: píxel de la hoja de cada esquina
    base = len(V)
    for i in range(len(pts)):
        V.append(pts[i])
        p = pix[i]
        UV.append((p[0] / IMG_W, 1.0 - p[1] / IMG_H))
    if len(pts) == 4:
        F.append((base, base + 1, base + 2, base + 3))
    else:
        F.append((base, base + 1, base + 2))

K = 0.0192   # metros por píxel

def fr(x, z):
    # Vista frontal: centro del cuerpo principal en x = 913,5 px, suelo en 1015 px
    return [913.5 + x / K, 1015.0 - z / K]

def iz(y, z):
    # Vista lateral izquierda: la fachada (y = -3,3) queda a la derecha, en 407 px
    return [407.0 - (y + 3.3) / K, 1013.0 - z / K]

def de(y, z):
    # Vista lateral derecha: la fachada a la izquierda (1210 px), la trasera en 1512 px
    return [1210.0 + (y + 3.3) * 302.0 / 6.6, 1013.0 - z / K]

def tr(x, z):
    # Vista posterior: cuerpo principal de 1575 px (x = +3,3) a 1812 px (x = -3,3), estirado;
    # anejo de 1812 a 1922 px
    if x >= -3.3:
        px = 1575.0 + (3.3 - x) * 237.0 / 6.6
    else:
        px = 1812.0 + (-3.3 - x) * 110.0 / 2.29
    return [px, 1010.0 - z / K]

def rect(r):
    # r = [px0, py0, px1, py1] (arriba-izquierda, abajo-derecha) -> esquinas bl, br, tr, tl
    return [[r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]]]

ENLUCIDO = [1262, 770, 1340, 830]   # trozo limpio de pared (lateral derecho)
SOMBRA = [1290, 722, 1360, 736]     # pared en sombra bajo el alero
MADERA = [820, 905, 858, 1000]      # madera de la puerta

def caja_foto(x0, x1, y0, y1, z0, z1, r_frente, r_resto, r_arriba=None):
    # Caja con la cara delantera tomada de la foto y el resto de otro trozo
    if r_arriba == None:
        r_arriba = r_resto
    cara([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], rect(r_frente))
    cara([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], rect(r_arriba))
    cara([(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], rect(r_resto))
    cara([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], rect(r_resto))
    cara([(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)], rect(r_resto))

# ---------- Medidas ----------
X0 = -3.3          # cuerpo principal
X1 = 3.3
Y0 = -3.3
Y1 = 3.3
HA = 6.0           # arranque de la cubierta en los muros
XA = -5.59         # anejo: de XA a X0
YA1 = 2.28         # fondo del anejo

# ---------- Cuerpo principal: muros ----------
cara([(X0, Y0, 0), (X1, Y0, 0), (X1, Y0, HA), (X0, Y0, HA)], [fr(X0, 0), fr(X1, 0), fr(X1, HA), fr(X0, HA)])
cara([(X1, Y1, 0), (X0, Y1, 0), (X0, Y1, HA), (X1, Y1, HA)], [tr(X1, 0), tr(X0, 0), tr(X0, HA), tr(X1, HA)])
ZP = 7.61   # pico del hastial (bajo la teja)
cara([(X0, Y1, 0), (X0, Y0, 0), (X0, Y0, HA), (X0, Y1, HA)], [iz(Y1, 0), iz(Y0, 0), iz(Y0, HA), iz(Y1, HA)])
cara([(X0, Y1, HA), (X0, Y0, HA), (X0, 0, ZP)], [iz(Y1, HA), iz(Y0, HA), iz(0, ZP)])
cara([(X1, Y0, 0), (X1, Y1, 0), (X1, Y1, HA), (X1, Y0, HA)], [de(Y0, 0), de(Y1, 0), de(Y1, HA), de(Y0, HA)])
cara([(X1, Y0, HA), (X1, Y1, HA), (X1, 0, ZP)], [de(Y0, HA), de(Y1, HA), de(0, ZP)])

# ---------- Cubierta principal a dos aguas ----------
RX0 = -3.36
RX1 = 3.36
EY = 3.75          # vuelo del alero hasta y = ±3,75
ZR = 7.76          # cumbrera (cara de arriba)
PEND = 0.497
ZE = ZR - EY * PEND
GR = 0.16
# Faldón delantero: en la foto va de la cumbrera (612 px) al alero (704 px)
cara([(RX0, -EY, ZE), (RX1, -EY, ZE), (RX1, 0, ZR), (RX0, 0, ZR)],
     [[fr(RX0, 0)[0], 704], [fr(RX1, 0)[0], 704], [fr(RX1, 0)[0], 612], [fr(RX0, 0)[0], 612]])
# Faldón trasero, con la foto de la vista posterior
cara([(RX1, EY, ZE), (RX0, EY, ZE), (RX0, 0, ZR), (RX1, 0, ZR)],
     [[tr(RX1, 0)[0], 704], [tr(RX0, 0)[0], 704], [tr(RX0, 0)[0], 612], [tr(RX1, 0)[0], 612]])
# Canto del alero delantero y trasero
cara([(RX0, -EY, ZE - GR), (RX1, -EY, ZE - GR), (RX1, -EY, ZE), (RX0, -EY, ZE)],
     [[fr(RX0, 0)[0], 714], [fr(RX1, 0)[0], 714], [fr(RX1, 0)[0], 702], [fr(RX0, 0)[0], 702]])
cara([(RX1, EY, ZE - GR), (RX0, EY, ZE - GR), (RX0, EY, ZE), (RX1, EY, ZE)],
     [[tr(RX1, 0)[0], 714], [tr(RX0, 0)[0], 714], [tr(RX0, 0)[0], 702], [tr(RX1, 0)[0], 702]])
# Cantos de los hastiales (la teja vista de lado en las vistas laterales)
cara([(RX0, 0, ZR - GR), (RX0, -EY, ZE - GR), (RX0, -EY, ZE), (RX0, 0, ZR)],
     [iz(0, ZR - 0.4), iz(-EY, ZE - 0.4), iz(-EY, ZE), iz(0, ZR)])
cara([(RX0, EY, ZE - GR), (RX0, 0, ZR - GR), (RX0, 0, ZR), (RX0, EY, ZE)],
     [iz(EY, ZE - 0.4), iz(0, ZR - 0.4), iz(0, ZR), iz(EY, ZE)])
cara([(RX1, -EY, ZE - GR), (RX1, 0, ZR - GR), (RX1, 0, ZR), (RX1, -EY, ZE)],
     [de(-EY, ZE - 0.4), de(0, ZR - 0.4), de(0, ZR), de(-EY, ZE)])
cara([(RX1, 0, ZR - GR), (RX1, EY, ZE - GR), (RX1, EY, ZE), (RX1, 0, ZR)],
     [de(0, ZR - 0.4), de(EY, ZE - 0.4), de(EY, ZE), de(0, ZR)])
# Panza de la cubierta (vista desde abajo)
cara([(RX0, 0, ZR - GR), (RX1, 0, ZR - GR), (RX1, -EY, ZE - GR), (RX0, -EY, ZE - GR)], rect(SOMBRA))
cara([(RX1, 0, ZR - GR), (RX0, 0, ZR - GR), (RX0, EY, ZE - GR), (RX1, EY, ZE - GR)], rect(SOMBRA))

# ---------- Anejo con tejado de una vertiente hacia la fachada ----------
AF = -3.75         # alero delantero del anejo
AX0 = -5.83        # vuelo lateral
AX1 = -2.84        # en la foto el tejadillo monta un poco sobre el cuerpo principal
ZAF = 3.22         # cara de arriba en el alero (848 px)
ZAB = 4.88         # cara de arriba al fondo (760 px)
APEND = (ZAB - ZAF) / (YA1 - AF)
AGR = 0.15

def z_anejo(y):
    return ZAF + (y - AF) * APEND - AGR

zf = z_anejo(Y0)
zb = z_anejo(YA1)
cara([(XA, Y0, 0), (X0, Y0, 0), (X0, Y0, zf), (XA, Y0, zf)], [fr(XA, 0), fr(X0, 0), fr(X0, zf), fr(XA, zf)])
cara([(XA, YA1, 0), (XA, Y0, 0), (XA, Y0, zf), (XA, YA1, zb)], [iz(YA1, 0), iz(Y0, 0), iz(Y0, zf), iz(YA1, zb)])
# Trasera del anejo: la foto solo tiene pared hasta 3,1 m; se estira hasta el tejado
ptr0 = tr(X0, 0)
ptr1 = tr(XA, 0)
cara([(X0, YA1, 0), (XA, YA1, 0), (XA, YA1, zb), (X0, YA1, zb)],
     [ptr0, ptr1, [ptr1[0], 852], [ptr0[0], 852]])
# Tejado del anejo
cara([(AX0, AF, ZAF), (AX1, AF, ZAF), (AX1, YA1, ZAB), (AX0, YA1, ZAB)],
     [[fr(AX0, 0)[0], 848], [fr(AX1, 0)[0], 848], [fr(AX1, 0)[0], 760], [fr(AX0, 0)[0], 760]])
cara([(AX0, AF, ZAF - AGR), (AX1, AF, ZAF - AGR), (AX1, AF, ZAF), (AX0, AF, ZAF)],
     [[fr(AX0, 0)[0], 858], [fr(AX1, 0)[0], 858], [fr(AX1, 0)[0], 848], [fr(AX0, 0)[0], 848]])
cara([(AX0, YA1, ZAB - AGR), (AX0, AF, ZAF - AGR), (AX0, AF, ZAF), (AX0, YA1, ZAB)],
     [iz(YA1, ZAB - 0.3), iz(AF, ZAF - 0.3), iz(AF, ZAF), iz(YA1, ZAB)])
cara([(AX1, YA1, ZAB - AGR), (AX0, YA1, ZAB - AGR), (AX0, YA1, ZAB), (AX1, YA1, ZAB)], rect(MADERA))
cara([(AX0, YA1, ZAB - AGR), (AX1, YA1, ZAB - AGR), (AX1, AF, ZAF - AGR), (AX0, AF, ZAF - AGR)], rect(SOMBRA))

# ---------- Tejadillo de la puerta ----------
PX0 = -2.55
PX1 = -0.36
PY = -4.1
ZPW = 3.63     # arriba, contra el muro (826 px)
ZPF = 3.17     # alero (850 px)
cara([(PX0, PY, ZPF), (PX1, PY, ZPF), (PX1, Y0, ZPW), (PX0, Y0, ZPW)],
     [[fr(PX0, 0)[0], 850], [fr(PX1, 0)[0], 850], [fr(PX1, 0)[0], 826], [fr(PX0, 0)[0], 826]])
cara([(PX0, PY, ZPF - 0.12), (PX1, PY, ZPF - 0.12), (PX1, PY, ZPF), (PX0, PY, ZPF)],
     [[fr(PX0, 0)[0], 857], [fr(PX1, 0)[0], 857], [fr(PX1, 0)[0], 849], [fr(PX0, 0)[0], 849]])
cara([(PX0, Y0, ZPW - 0.12), (PX0, PY, ZPF - 0.12), (PX0, PY, ZPF), (PX0, Y0, ZPW)], rect(MADERA))
cara([(PX1, PY, ZPF - 0.12), (PX1, Y0, ZPW - 0.12), (PX1, Y0, ZPW), (PX1, PY, ZPF)], rect(MADERA))
cara([(PX0, Y0, ZPW - 0.12), (PX1, Y0, ZPW - 0.12), (PX1, PY, ZPF - 0.12), (PX0, PY, ZPF - 0.12)], rect(SOMBRA))
# Viga y zapatas de madera
caja_foto(-2.46, -0.45, -3.95, Y0, 2.88, ZPF - 0.12, [785, 852, 892, 866], MADERA)
for xz in [-2.42, -0.62]:
    caja_foto(xz, xz + 0.17, -3.48, Y0, 2.23, 2.88, [fr(xz, 0)[0], 866, fr(xz + 0.17, 0)[0], 899], MADERA)
    caja_foto(xz, xz + 0.17, -3.95, -3.48, 2.70, 2.88, [fr(xz, 0)[0], 866, fr(xz + 0.17, 0)[0], 875], MADERA)

# ---------- Vierteaguas, guardapolvos y poyete ----------
def resalte(x0, x1, z0, z1, sal):
    p0 = fr(x0, z1)
    p1 = fr(x1, z0)
    caja_foto(x0, x1, Y0 - sal, Y0, z0, z1, [p0[0], p0[1], p1[0], p1[1]], ENLUCIDO)

resalte(0.69, 2.07, 3.65, 3.94, 0.16)   # alféizar ventana alta
resalte(0.73, 2.03, 5.28, 5.60, 0.06)   # guardapolvo ventana alta
resalte(0.69, 2.07, 1.01, 1.30, 0.16)   # alféizar ventana baja
resalte(0.73, 2.03, 2.64, 2.96, 0.06)   # guardapolvo ventana baja
resalte(-5.06, -3.67, 1.01, 1.27, 0.16) # alféizar del anejo
# Poyete: dos brazos y asiento
resalte(0.17, 0.52, 0.0, 0.85, 0.6)
resalte(2.46, 2.81, 0.0, 0.85, 0.6)
resalte(0.52, 2.46, 0.0, 0.53, 0.55)
# Escalón de la puerta
resalte(-2.1, -0.8, 0.0, 0.10, 0.25)

malla = bpy.data.meshes.new("CR_Casa")
malla.from_pydata(V, [], F)
capa = malla.uv_layers.new(name="UVMap")
for i in range(len(UV)):
    capa.data[i].uv = UV[i]
casa = bpy.data.objects.new("CR_Casa", malla)
bpy.context.collection.objects.link(casa)
casa.data.materials.append(m_foto)

# ==========================================
# 3. SUELO, MACETAS Y PLANTAS (pocos materiales lisos)
# ==========================================
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-1.2, -0.7, -0.05))
suelo = bpy.context.active_object
suelo.name = "CR_Suelo"
suelo.scale = (13.0, 9.6, 0.1)
asignar_mat(suelo, m_suelo)

def maceta(pref, x, y, z, r, alto, flores=5):
    cono(pref + "_Tiesto", (x, y, z + alto / 2), r * 0.75, r, alto, m_barro, 10)
    esfera(pref + "_Mata", (x, y, z + alto + r * 0.5), r * 1.2, m_hoja, (1, 1, 0.75))
    for k in range(flores):
        a = k * 2 * math.pi / flores + 0.3
        esfera(pref + "_Flor_" + str(k), (x + r * 0.7 * math.cos(a), y + r * 0.7 * math.sin(a), z + alto + r * 0.9), r * 0.45, m_flor, (1, 1, 1), 6, 3)

maceta("CR_MacetaPuerta_I", -2.59, -3.62, 0.0, 0.2, 0.48)
maceta("CR_MacetaPuerta_D", -0.28, -3.62, 0.0, 0.2, 0.48)
for k in range(3):
    maceta("CR_MacetaVentana_" + str(k), 1.05 + k * 0.32, -3.42, 1.30, 0.1, 0.17, 4)
for k in range(2):
    maceta("CR_MacetaAnejo_" + str(k), -4.75 + k * 0.78, -3.42, 1.27, 0.1, 0.17, 4)

# Buganvillas: recortadas de la propia foto (PNG con transparencia) y puestas en dos
# tarjetas cruzadas cada una. Se ven como en el dibujo y cuestan 4 triángulos.
img_bug = bpy.data.images.load("/textures/casa_rustica/buganvillas.png")
m_bug = bpy.data.materials.new(name="CR_BuganvillaFoto")
m_bug.use_nodes = True
bsdf_b = m_bug.node_tree.nodes.get("Principled BSDF")
bsdf_b.inputs["Roughness"].default_value = 0.9
bsdf_b.inputs["Metallic"].default_value = 0.0
bsdf_b.inputs["Alpha"].default_value = 0.97
nodo_b = m_bug.node_tree.nodes.new('ShaderNodeTexImage')
nodo_b.image = img_bug
m_bug.node_tree.links.new(nodo_b.outputs['Color'], bsdf_b.inputs['Base Color'])

BV = []
BF = []
BUV = []

def tarjeta(a, b, alto, r):
    # Plano vertical de a hasta b (puntos x, y del suelo), con el trozo r = [u0, v0, u1, v1]
    # del atlas de 1024 px (arriba-izquierda, abajo-derecha)
    base = len(BV)
    BV.append((a[0], a[1], 0.0))
    BV.append((b[0], b[1], 0.0))
    BV.append((b[0], b[1], alto))
    BV.append((a[0], a[1], alto))
    BUV.append((r[0] / 1024.0, 1.0 - r[3] / 1024.0))
    BUV.append((r[2] / 1024.0, 1.0 - r[3] / 1024.0))
    BUV.append((r[2] / 1024.0, 1.0 - r[1] / 1024.0))
    BUV.append((r[0] / 1024.0, 1.0 - r[1] / 1024.0))
    BF.append((base, base + 1, base + 2, base + 3))

RA = [0, 0, 290, 424]      # buganvilla de la fachada (145 x 212 px de la hoja)
RB = [512, 0, 832, 530]    # buganvilla del lateral izquierdo (160 x 265 px)
# Fachada: tarjeta de frente donde la dibuja la vista frontal y otra cruzada
tarjeta((-7.08, -3.62), (-4.29, -3.62), 4.07, RA)
tarjeta((-5.75, -5.0), (-5.75, -2.2), 4.07, RA)
# Lateral izquierdo: pegada al anejo donde la dibuja la vista lateral y otra cruzada
tarjeta((-5.72, 3.94), (-5.72, 0.87), 5.09, RB)
tarjeta((-7.2, 2.3), (-4.3, 2.3), 5.09, RB)

mb = bpy.data.meshes.new("CR_Buganvillas")
mb.from_pydata(BV, [], BF)
capa_b = mb.uv_layers.new(name="UVMap")
for i in range(len(BUV)):
    capa_b.data[i].uv = BUV[i]
bug = bpy.data.objects.new("CR_Buganvillas", mb)
bpy.context.collection.objects.link(bug)
bug.data.materials.append(m_bug)
