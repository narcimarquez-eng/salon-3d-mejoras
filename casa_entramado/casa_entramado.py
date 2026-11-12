import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# CASA MEDIEVAL DE ENTRAMADO (desde la hoja de 5 vistas del usuario)
# ==============================================================================
# Casa de entramado de madera sobre zócalo de piedra, tejado de pizarra con musgo, porche con
# tejadillo y cráneo con cuernos, farol, estandarte, chimenea de piedra en el lado derecho.
# La piel es el propio dibujo: cada cara toma la vista de la hoja que la ve de frente
# (mat.color_map_views) a través del atlas public/textures/casa_entramado_atlas.jpg.
# Medidas: escala de la vista de frente (0,0103 m por píxel de la hoja): 6 m de ancho y 8,75 m
# hasta la cumbrera. El fondo (5,4 m) sale de la vista lateral.
# La hoja no es coherente del todo: la "lateral derecha" está dibujada como un hastial y la
# cenital va en espejo. Se toma el frente como referencia: porche a la izquierda de la puerta y
# chimenea en el lado derecho (+X); la pared derecha lleva el dibujo de la lateral izquierda.
# Ejes: X = ancho, Y = fondo (la fachada mira a -Y), Z = altura. Metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.6, bloom=0.06)
bpy.ops.render.set_lighting(intensity=1.3, angle=35)
bpy.ops.render.set_ssao(intensity=1.1)

HOJA = "casa_entramado_atlas"
S = 0.0103          # metros por píxel de la hoja (vista de frente)
SUELO_PX = 1065     # fila del suelo en la hoja

def material(nombre, color, rugosidad=0.8, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        if emision > 0:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emision
    return mat

def asignar_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj

def caja(nombre, centro, tamano, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = tamano
    return asignar_mat(obj, mat)

def malla(nombre, verts, caras, mat):
    me = bpy.data.meshes.new(nombre)
    me.from_pydata(verts, [], caras)
    obj = bpy.data.objects.new(nombre, me)
    bpy.context.collection.objects.link(obj)
    return asignar_mat(obj, mat)

def viga(nombre, a, b, grosor, mat):
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dy * dy)
    largo = math.sqrt(horiz * horiz + dz * dz)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    return caja(nombre, centro, (largo, grosor, grosor), mat, rot=(0, -math.atan2(dz, horiz), math.atan2(dy, dx)))

# ---------------------------------------------------------------- de la hoja al atlas
# (números que imprime atlas_vistas.py: origen de cada vista en la hoja y en el atlas)
ESC = 0.80789
ORIGEN = {"frente": [70, 190, 0.0], "lado": [830, 205, 517.05], "chimenea": [1780, 205, 1034.10],
          "trasera": [2235, 195, 1236.07], "porche": [3015, 830, 1745.04]}

def ax(vista, px):
    o = ORIGEN[vista]
    return o[2] + (px - o[0]) * ESC

def ay(vista, py):
    o = ORIGEN[vista]
    return (py - o[1]) * ESC

def fila(z):
    return SUELO_PX - z / S

def vista(eje, lado, nombre, px0, px1, h0, h1, z0, z1, py0, py1, peso=1.0):
    return [eje, lado, ax(nombre, px0), ay(nombre, py0), ax(nombre, px1), ay(nombre, py1), h0, h1, z0, z1, peso]

def piel(nombre, vistas):
    mat = material(nombre, (1.0, 1.0, 1.0, 1.0), 0.85)
    mat.color_map = HOJA
    mat.color_map_views = vistas
    return mat

# ---------------------------------------------------------------- medidas
MX = 3.0                 # media anchura de las paredes
MY = 2.7                 # media profundidad
Z_CUMBRE = 8.75
Z_PARED = 4.57           # donde el hastial se encuentra con el tejado
X_ALERO = 3.35
Z_ALERO = 4.05
Y_TEJADO = 3.0           # vuelo del tejado delante y detrás
CX = 389                 # columna del eje de la casa en la vista de frente
CX_TRAS = 2549           # y en la trasera

# vistas que usa cada piel
V_FRENTE = vista("y", -1, "frente", CX - MX / S, CX + MX / S, -MX, MX, 0.0, Z_CUMBRE, SUELO_PX, fila(Z_CUMBRE))
V_TRAS = vista("y", 1, "trasera", CX_TRAS + MX / S, CX_TRAS - MX / S, -MX, MX, 0.0, Z_CUMBRE, SUELO_PX + 1, fila(Z_CUMBRE) + 1)
# lateral: la hoja dibuja el frente a la izquierda; las dos paredes largas llevan este dibujo
V_LADO = vista("x", 0, "lado", 950, 1414, -MY, MY, 0.0, Z_PARED, SUELO_PX, 640)
V_TEJADO = vista("x", 0, "lado", 881, 1430, -Y_TEJADO, Y_TEJADO, Z_ALERO, Z_CUMBRE, 640, 285)

m_fachadas = piel("CE_Fachadas", [V_FRENTE, V_TRAS, V_LADO])
m_tejado = piel("CE_Tejado", [V_TEJADO])
m_madera = material("CE_Madera", (0.075, 0.05, 0.035, 1.0), 0.8)
m_madera.texture = "wood_oak"
m_piedra = material("CE_Piedra", (0.22, 0.21, 0.19, 1.0), 0.9)
m_piedra.texture = "cobblestone"
m_hierba = material("CE_Hierba", (0.07, 0.12, 0.035, 1.0), 0.95)
m_hierba.texture = "grass_meadow"
m_luz = material("CE_Farol_Luz", (1.0, 0.55, 0.18, 1.0), 0.3, emision=3.0)
m_hierro = material("CE_Hierro", (0.03, 0.03, 0.032, 1.0), 0.5)

# ==========================================
# 1. SUELO Y PAREDES (planos: una cara por pared, la piel es el dibujo)
# ==========================================
caja("CE_Suelo", (0, -1.0, -0.05), (11.0, 11.0, 0.1), m_hierba)
malla("CE_Pared_Frente", [(-MX, -MY, 0), (MX, -MY, 0), (MX, -MY, Z_PARED), (0, -MY, Z_CUMBRE - 0.15), (-MX, -MY, Z_PARED)], [(0, 1, 2, 3, 4)], m_fachadas)
malla("CE_Pared_Trasera", [(MX, MY, 0), (-MX, MY, 0), (-MX, MY, Z_PARED), (0, MY, Z_CUMBRE - 0.15), (MX, MY, Z_PARED)], [(0, 1, 2, 3, 4)], m_fachadas)
malla("CE_Pared_Izq", [(-MX, MY, 0), (-MX, -MY, 0), (-MX, -MY, Z_PARED), (-MX, MY, Z_PARED)], [(0, 1, 2, 3)], m_fachadas)
malla("CE_Pared_Der", [(MX, -MY, 0), (MX, MY, 0), (MX, MY, Z_PARED), (MX, -MY, Z_PARED)], [(0, 1, 2, 3)], m_fachadas)
# esquinas de madera que tapan las uniones de los planos
for ex in [-1, 1]:
    for ey in [-1, 1]:
        caja("CE_Esquina_" + str(ex) + "_" + str(ey), (ex * MX, ey * MY, Z_PARED / 2 + 0.6), (0.2, 0.2, Z_PARED - 1.2), m_madera)
        caja("CE_Esquina_Piedra_" + str(ex) + "_" + str(ey), (ex * MX, ey * MY, 0.6), (0.34, 0.34, 1.2), m_piedra)

# ==========================================
# 2. TEJADO DE PIZARRA (dos faldones, por arriba y por debajo)
# ==========================================
for lado in [-1, 1]:
    a = (lado * X_ALERO, -lado * Y_TEJADO, Z_ALERO)
    b = (lado * X_ALERO, lado * Y_TEJADO, Z_ALERO)
    c = (0, lado * Y_TEJADO, Z_CUMBRE)
    d = (0, -lado * Y_TEJADO, Z_CUMBRE)
    malla("CE_Faldon_" + str(lado), [a, b, c, d], [(0, 1, 2, 3)], m_tejado)
    bajo = 0.06
    malla("CE_Faldon_Bajo_" + str(lado), [(a[0], a[1], a[2] - bajo), (d[0], d[1], d[2] - bajo), (c[0], c[1], c[2] - bajo), (b[0], b[1], b[2] - bajo)], [(0, 1, 2, 3)], m_tejado)
    # tablas de borde (guardavientos) delante y detrás, y alero
    for ey in [-1, 1]:
        viga("CE_Guardavientos_" + str(lado) + "_" + str(ey), (lado * (X_ALERO + 0.05), ey * (Y_TEJADO + 0.02), Z_ALERO - 0.05), (0, ey * (Y_TEJADO + 0.02), Z_CUMBRE + 0.05), 0.2, m_madera)
    viga("CE_Alero_" + str(lado), (lado * X_ALERO, -Y_TEJADO, Z_ALERO - 0.05), (lado * X_ALERO, Y_TEJADO, Z_ALERO - 0.05), 0.12, m_madera)
viga("CE_Cumbrera", (0, -Y_TEJADO - 0.15, Z_CUMBRE + 0.08), (0, Y_TEJADO + 0.15, Z_CUMBRE + 0.08), 0.28, m_madera)
for ey in [-1, 1]:
    caja("CE_Pendolon_" + str(ey), (0, ey * (Y_TEJADO + 0.06), Z_CUMBRE + 0.12), (0.26, 0.2, 0.5), m_madera)

# ==========================================
# 3. PORCHE (a la izquierda de la puerta, como en el frente)
# ==========================================
PX = (312 - CX) * S          # eje del porche: la puerta
PH = 1.85                    # media anchura del tejadillo
PY0 = -MY
PY1 = -MY - 2.05
PZ_ALERO = 3.15
PZ_CUMBRE = 4.85
# pizarra del tejadillo desde la cenital, sin llegar al cráneo que asoma por el borde
V_PORCHE = vista("zr", 0, "porche", 3355, 3045, PX - PH, PX + PH, PY0, PY1, 875, 985)
m_porche = piel("CE_Porche_Tejado", [V_PORCHE])
for lado in [-1, 1]:
    y_a = PY1
    y_b = PY0
    if lado == -1:
        y_a = PY0
        y_b = PY1
    a = (PX + lado * PH, y_a, PZ_ALERO)
    b = (PX + lado * PH, y_b, PZ_ALERO)
    c = (PX, y_b, PZ_CUMBRE)
    d = (PX, y_a, PZ_CUMBRE)
    malla("CE_Tejadillo_" + str(lado), [a, b, c, d], [(0, 1, 2, 3)], m_porche)
    malla("CE_Tejadillo_Bajo_" + str(lado), [(a[0], a[1], a[2] - 0.05), (d[0], d[1], d[2] - 0.05), (c[0], c[1], c[2] - 0.05), (b[0], b[1], b[2] - 0.05)], [(0, 1, 2, 3)], m_porche)
    viga("CE_Porche_Borde_" + str(lado), (PX + lado * (PH + 0.04), PY1 - 0.02, PZ_ALERO - 0.04), (PX, PY1 - 0.02, PZ_CUMBRE + 0.04), 0.16, m_madera)
# frontón del porche: lleva el cráneo y las vigas dibujadas en la vista de frente
malla("CE_Porche_Fronton", [(PX - PH + 0.15, PY1 + 0.05, PZ_ALERO + 0.05), (PX + PH - 0.15, PY1 + 0.05, PZ_ALERO + 0.05), (PX, PY1 + 0.05, PZ_CUMBRE - 0.12)], [(0, 1, 2)], m_fachadas)
# postes y viga del porche (sitios del dibujo de frente)
for px in [175, 452]:
    x = (px - CX) * S
    caja("CE_Poste_" + str(px), (x, PY1 + 0.25, (PZ_ALERO + 0.05) / 2), (0.26, 0.26, PZ_ALERO + 0.05), m_madera)
    caja("CE_Poste_Base_" + str(px), (x, PY1 + 0.25, 0.2), (0.42, 0.42, 0.4), m_piedra)
caja("CE_Porche_Viga", (PX, PY1 + 0.25, PZ_ALERO - 0.1), (2 * PH - 0.1, 0.28, 0.26), m_madera)
for k in range(3):
    caja("CE_Escalon_" + str(k), (PX, -MY - 0.35 - k * 0.32, 0.27 - k * 0.09), (2.2 - k * 0.1, 0.7 - k * 0.0, 0.1 + 0.08 * (2 - k)), m_piedra)
# farol con luz y cadena (a la izquierda del porche, como en el dibujo)
xf = (113 - CX) * S
caja("CE_Farol_Luz", (xf, -MY - 0.25, (SUELO_PX - 735) * S), (0.18, 0.18, 0.3), m_luz)
caja("CE_Farol_Techo", (xf, -MY - 0.25, (SUELO_PX - 690) * S), (0.24, 0.24, 0.06), m_hierro)
viga("CE_Farol_Cadena", (xf, -MY - 0.25, (SUELO_PX - 680) * S), (xf, -MY - 0.25, (SUELO_PX - 600) * S), 0.03, m_hierro)
viga("CE_Farol_Brazo", (xf, -MY, (SUELO_PX - 600) * S), (xf, -MY - 0.3, (SUELO_PX - 600) * S), 0.06, m_madera)

# ==========================================
# 4. CHIMENEA DE PIEDRA (lado derecho, +X)
# ==========================================
V_CH_ABAJO = vista("x", 1, "chimenea", 1800, 2012, -1.05, 1.05, 0.0, 3.0, SUELO_PX, fila(3.0))
V_CH_ARRIBA = vista("x", 1, "chimenea", 1812, 1903, -0.47, 0.47, 3.0, 9.3, fila(3.0), 225)
V_CH_LADOS = vista("y", 0, "chimenea", 1812, 1903, MX + 0.05, MX + 0.75, 0.0, 9.3, SUELO_PX, 225)
m_ch_abajo = piel("CE_Chimenea_Base", [V_CH_ABAJO, V_CH_LADOS])
m_ch_arriba = piel("CE_Chimenea_Tiro", [V_CH_ARRIBA, V_CH_LADOS])
def prisma(nombre, x0, x1, y0, y1, z0, z1, mat):
    # cada cara es una pieza aparte: así la luz no redondea las aristas
    malla(nombre + "_X", [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], [(0, 1, 2, 3)], mat)
    malla(nombre + "_Yf", [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], [(0, 1, 2, 3)], mat)
    malla(nombre + "_Yt", [(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)], [(0, 1, 2, 3)], mat)
    malla(nombre + "_Z", [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], [(0, 1, 2, 3)], mat)

prisma("CE_Chimenea_Base", MX, MX + 0.9, -1.05, 1.05, 0.0, 3.0, m_ch_abajo)
prisma("CE_Chimenea_Hombro", MX, MX + 0.8, -0.75, 0.75, 3.0, 3.5, m_ch_abajo)
prisma("CE_Chimenea_Tiro", MX, MX + 0.72, -0.47, 0.47, 3.5, 9.3, m_ch_arriba)
caja("CE_Chimenea_Remate", (MX + 0.4, 0, 9.35), (0.86, 1.1, 0.14), m_piedra)
