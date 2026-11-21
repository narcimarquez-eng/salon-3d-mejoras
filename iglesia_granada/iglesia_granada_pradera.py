import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# IGLESIA DE NUESTRA SEÑORA DE LA GRANADA (Moguer, Huelva)
# ==============================================================================
# Templo neoclásico de cinco naves (reconstruido en 1776-1783 tras el terremoto de Lisboa),
# con torre de inspiración giraldina en la esquina noroeste y una segunda torre que quedó sin
# acabar en la esquina suroeste. Cúpula sobre el crucero, portada barroca de ladrillo en la
# fachada oeste, portada lateral a la plaza (norte) y portada renacentista al patio (sur).
#
# Fuentes: fotos y plano del usuario (texturas sacadas de las propias fotos, enderezadas con
# iglesia_granada/hacer_texturas.py); torre de unos 48 m sobre planta cuadrada de 6 m, cuerpo
# bajo de ~30 m y de campanas de ~6 m (Waymarking); cinco naves (spain.info).
# Planta de cruz latina medida sobre la vista cenital de Google Earth (barra de 30 m): 35 x 61,5 m,
# nave central de 12,2 m, crucero de 11,5 m de fondo a 33,8 m de la fachada, cabecera hasta
# 54,7 m y sacristía hasta 61,5 m. La fachada oeste sale de la foto de día enderezada en metros
# (la puerta cae en el centro y la fachada mide 23 m entre las dos torres). Aproximado: alturas
# de las cubiertas y de la cúpula (fotos y vistas 3D de Google Earth).
# Ejes: X = norte(-) a sur(+), Y = oeste(0, fachada principal) a este(+), Z = altura. Metros.
# La fachada principal mira a -Y; la plaza queda al norte (-X) y los patios al sur (+X).
# ==============================================================================

# Escena: "plaza" (la plaza real de Moguer) o "pradera" (prado con flores, riachuelo y
# montañas; iglesia_granada_pradera.py es este mismo script con ESCENA = "pradera")
ESCENA = "pradera"

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.65, bloom=0.04)
bpy.ops.render.set_lighting(intensity=1.35, angle=40)
bpy.ops.render.set_ssao(intensity=1.1)


def material(nombre, color, rugosidad=0.6, metalico=0.0, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
        if emision > 0:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emision
    return mat


def mat_foto(tex):
    # Material con un recorte de foto del usuario (se pega con UV propias, sin repetir)
    mat = material("IG_" + tex, (1.0, 1.0, 1.0, 1.0), 0.85)
    mat.color_map = tex
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


def caja_lim(nombre, x0, x1, y0, y1, z0, z1, mat):
    return caja(nombre, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), mat)


def cilindro(nombre, centro, radio, alto, mat, vertices=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)


def cono(nombre, centro, r1, r2, alto, mat, vertices=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)


def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0), segmentos=12, anillos=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)


def viga(nombre, a, b, grosor, mat):
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dy * dy)
    largo = math.sqrt(horiz * horiz + dz * dz)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    return caja(nombre, centro, (largo, grosor, grosor), mat, rot=(0, -math.atan2(dz, horiz), math.atan2(dy, dx)))


def malla_uv(nombre, verts, caras, uvs, mat):
    # Malla propia con una UV por esquina de cada cara (en el mismo orden que las caras)
    mesh = bpy.data.meshes.new(nombre)
    mesh.from_pydata(verts, [], caras)
    capa = mesh.uv_layers.new(name="UVMap")
    for k in range(len(uvs)):
        capa.data[k].uv = uvs[k]
    obj = bpy.data.objects.new(nombre, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def panel(nombre, mat, p, r, w, z0, z1, u0=0.0, u1=1.0, v0=0.0, v1=1.0):
    # Rectángulo vertical con foto. p = esquina de abajo a la izquierda (vista desde fuera),
    # r = dirección horizontal hacia la derecha del que mira, w = ancho.
    a = (p[0], p[1], z0)
    b = (p[0] + r[0] * w, p[1] + r[1] * w, z0)
    c = (p[0] + r[0] * w, p[1] + r[1] * w, z1)
    d = (p[0], p[1], z1)
    return malla_uv(nombre, [a, b, c, d], [(0, 1, 2, 3)], [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], mat)


def caras_caja(prefijo, mats, x0, x1, y0, y1, z0, z1, e=0.03, v0=0.0):
    # Pega una foto en cada cara vertical de una caja. mats = [oeste, norte, este, sur]
    # (None = sin foto). v0 > 0 recorta la parte baja de la foto (caras tapadas abajo).
    if mats[0]:
        panel(prefijo + "_O", mats[0], (x0, y0 - e), (1, 0), x1 - x0, z0, z1, 0, 1, v0, 1)
    if mats[1]:
        panel(prefijo + "_N", mats[1], (x0 - e, y1), (0, -1), y1 - y0, z0, z1, 0, 1, v0, 1)
    if mats[2]:
        panel(prefijo + "_E", mats[2], (x1, y1 + e), (-1, 0), x1 - x0, z0, z1, 0, 1, v0, 1)
    if mats[3]:
        panel(prefijo + "_S", mats[3], (x1 + e, y0), (0, 1), y1 - y0, z0, z1, 0, 1, v0, 1)


def prisma_foto(nombre, mat, cx, cy, radio, z0, z1, lados, repeticiones):
    # Prisma de n caras con la foto dando "repeticiones" vueltas alrededor (tambor, linterna)
    verts = []
    caras = []
    uvs = []
    for i in range(lados):
        a0 = 2 * math.pi * i / lados
        a1 = 2 * math.pi * (i + 1) / lados
        n = len(verts)
        verts.append((cx + radio * math.cos(a0), cy + radio * math.sin(a0), z0))
        verts.append((cx + radio * math.cos(a1), cy + radio * math.sin(a1), z0))
        verts.append((cx + radio * math.cos(a1), cy + radio * math.sin(a1), z1))
        verts.append((cx + radio * math.cos(a0), cy + radio * math.sin(a0), z1))
        caras.append((n, n + 1, n + 2, n + 3))
        ua = repeticiones * i / lados
        ub = repeticiones * (i + 1) / lados
        uvs.append((ua, 0.0))
        uvs.append((ub, 0.0))
        uvs.append((ub, 1.0))
        uvs.append((ua, 1.0))
    return malla_uv(nombre, verts, caras, uvs, mat)


def cupula_foto(nombre, mat, cx, cy, z0, radio, alto, lados, anillos, repeticiones):
    # Media naranja con la foto de los nervios repetida alrededor
    verts = []
    caras = []
    uvs = []
    for j in range(anillos):
        t0 = (math.pi / 2) * j / anillos
        t1 = (math.pi / 2) * (j + 1) / anillos
        r0 = radio * math.cos(t0)
        r1 = radio * math.cos(t1)
        h0 = z0 + alto * math.sin(t0)
        h1 = z0 + alto * math.sin(t1)
        for i in range(lados):
            a0 = 2 * math.pi * i / lados
            a1 = 2 * math.pi * (i + 1) / lados
            n = len(verts)
            verts.append((cx + r0 * math.cos(a0), cy + r0 * math.sin(a0), h0))
            verts.append((cx + r0 * math.cos(a1), cy + r0 * math.sin(a1), h0))
            verts.append((cx + r1 * math.cos(a1), cy + r1 * math.sin(a1), h1))
            verts.append((cx + r1 * math.cos(a0), cy + r1 * math.sin(a0), h1))
            caras.append((n, n + 1, n + 2, n + 3))
            ua = repeticiones * i / lados
            ub = repeticiones * (i + 1) / lados
            uvs.append((ua, j / anillos))
            uvs.append((ub, j / anillos))
            uvs.append((ub, (j + 1) / anillos))
            uvs.append((ua, (j + 1) / anillos))
    return malla_uv(nombre, verts, caras, uvs, mat)


TEJA_M = 4.2  # metros que cubre una repetición de la foto de tejas


def faldon(nombre, mat, puntos, origen, eje_u, eje_v):
    # Faldón de tejado (3 o 4 puntos en orden antihorario visto desde fuera). La foto se
    # repite cada TEJA_M metros: u a lo largo del alero, v subiendo por la pendiente.
    uvs = []
    for k in range(len(puntos)):
        q = puntos[k]
        d = (q[0] - origen[0], q[1] - origen[1], q[2] - origen[2])
        u = (d[0] * eje_u[0] + d[1] * eje_u[1] + d[2] * eje_u[2]) / TEJA_M
        v = (d[0] * eje_v[0] + d[1] * eje_v[1] + d[2] * eje_v[2]) / TEJA_M
        uvs.append((u, v))
    caras = [(0, 1, 2)]
    if len(puntos) == 4:
        caras = [(0, 1, 2, 3)]
    return malla_uv(nombre, puntos, caras, uvs, mat)


def unit(v):
    m = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    return (v[0] / m, v[1] / m, v[2] / m)


def tejado_hip(prefijo, mat, x0, x1, y0, y1, z, h, a0, a1):
    # Cubierta con la cumbrera paralela a Y. a0 / a1 = largo del faldón de testero en el
    # extremo oeste / este (0 = sin faldón, el tejado acaba en la pared).
    xc = (x0 + x1) / 2
    semi = (x1 - x0) / 2
    zr = z + h
    ra = (xc, y0 + a0, zr)
    rb = (xc, y1 - a1, zr)
    # Faldón norte (mira a -X): derecha del que mira = -Y
    faldon(prefijo + "_N", mat, [(x0, y1, z), (x0, y0, z), ra, rb], (x0, y1, z), (0, -1, 0), unit((semi, 0, h)))
    # Faldón sur (mira a +X): derecha = +Y
    faldon(prefijo + "_S", mat, [(x1, y0, z), (x1, y1, z), rb, ra], (x1, y0, z), (0, 1, 0), unit((-semi, 0, h)))
    if a0 > 0:
        faldon(prefijo + "_O", mat, [(x0, y0, z), (x1, y0, z), ra], (x0, y0, z), (1, 0, 0), unit((0, a0, h)))
    if a1 > 0:
        faldon(prefijo + "_E", mat, [(x1, y1, z), (x0, y1, z), rb], (x1, y1, z), (-1, 0, 0), unit((0, -a1, h)))


def tejado_pabellon(prefijo, mat, x0, x1, y0, y1, z, h):
    # Cubierta a cuatro aguas en punta (crucero, torre inacabada)
    xc = (x0 + x1) / 2
    yc = (y0 + y1) / 2
    cima = (xc, yc, z + h)
    sx = (x1 - x0) / 2
    sy = (y1 - y0) / 2
    faldon(prefijo + "_O", mat, [(x0, y0, z), (x1, y0, z), cima], (x0, y0, z), (1, 0, 0), unit((0, sy, h)))
    faldon(prefijo + "_S", mat, [(x1, y0, z), (x1, y1, z), cima], (x1, y0, z), (0, 1, 0), unit((-sx, 0, h)))
    faldon(prefijo + "_E", mat, [(x1, y1, z), (x0, y1, z), cima], (x1, y1, z), (-1, 0, 0), unit((0, -sy, h)))
    faldon(prefijo + "_N", mat, [(x0, y1, z), (x0, y0, z), cima], (x0, y1, z), (0, -1, 0), unit((sx, 0, h)))


def tejado_pendiente(prefijo, mat, x_alero, x_muro, y0, y1, z_alero, z_muro):
    # Tejado de una sola agua (naves laterales) apoyado en el muro alto de la nave central
    if x_alero < x_muro:
        faldon(prefijo, mat, [(x_alero, y1, z_alero), (x_alero, y0, z_alero), (x_muro, y0, z_muro), (x_muro, y1, z_muro)], (x_alero, y1, z_alero), (0, -1, 0), unit((x_muro - x_alero, 0, z_muro - z_alero)))
    else:
        faldon(prefijo, mat, [(x_alero, y0, z_alero), (x_alero, y1, z_alero), (x_muro, y1, z_muro), (x_muro, y0, z_muro)], (x_alero, y0, z_alero), (0, 1, 0), unit((x_muro - x_alero, 0, z_muro - z_alero)))



def tejado_hip_x(prefijo, mat, x0, x1, y0, y1, z, h, a0, a1):
    # Cubierta con la cumbrera paralela a X (brazos del crucero). a0 / a1 = faldón de testero
    # en el extremo norte (x0) / sur (x1).
    yc = (y0 + y1) / 2
    semi = (y1 - y0) / 2
    zr = z + h
    ra = (x0 + a0, yc, zr)
    rb = (x1 - a1, yc, zr)
    faldon(prefijo + "_O", mat, [(x0, y0, z), (x1, y0, z), rb, ra], (x0, y0, z), (1, 0, 0), unit((0, semi, h)))
    faldon(prefijo + "_E", mat, [(x1, y1, z), (x0, y1, z), ra, rb], (x1, y1, z), (-1, 0, 0), unit((0, -semi, h)))
    if a0 > 0:
        faldon(prefijo + "_N", mat, [(x0, y1, z), (x0, y0, z), ra], (x0, y1, z), (0, -1, 0), unit((a0, 0, h)))
    if a1 > 0:
        faldon(prefijo + "_S", mat, [(x1, y0, z), (x1, y1, z), rb], (x1, y0, z), (0, 1, 0), unit((-a1, 0, h)))


def limas(prefijo, mat, lineas):
    # Cumbreras y limas de teja vidriada verde (se ven en la foto aérea)
    for i in range(len(lineas)):
        l = lineas[i]
        viga(prefijo + "_" + str(i), l[0], l[1], 0.3, mat)


# ==========================================
# 1. MATERIALES
# ==========================================
m_cal = material("IG_Cal", (0.74, 0.70, 0.62, 1.0), 0.9)   # encalado, color liso
m_albero = material("IG_Albero", (0.48, 0.17, 0.055, 1.0), 0.8)      # molduras ocre-almagra
m_rosa = material("IG_Rosa", (0.62, 0.25, 0.17, 1.0), 0.8)           # paños rosados de la torre
m_teja = material("IG_Teja", (1.0, 1.0, 1.0, 1.0), 0.9)
m_teja.color_map = "ig_teja"
m_teja.color_map_scale = 4.2
m_verde = material("IG_Teja_Verde", (0.03, 0.11, 0.06, 1.0), 0.35)   # cumbreras vidriadas
m_suelo = material("IG_Suelo", (0.20, 0.19, 0.17, 1.0), 0.85)        # losas grises de la plaza
m_grada = material("IG_Grada", (0.42, 0.41, 0.39, 1.0), 0.8)         # granito de las gradas
m_azotea = material("IG_Azotea", (0.20, 0.12, 0.08, 1.0), 0.9)       # azotea de la sacristía
m_hierro = material("IG_Hierro", (0.03, 0.03, 0.032, 1.0), 0.45, 0.6)
m_bronce = material("IG_Bronce", (0.06, 0.045, 0.03, 1.0), 0.4, 0.8)
m_azulejo = material("IG_Azulejo", (0.03, 0.08, 0.35, 1.0), 0.25)
m_hueco = material("IG_Hueco", (0.02, 0.02, 0.025, 1.0), 0.8)        # ventanas en sombra
m_hoja = material("IG_Hoja", (0.06, 0.12, 0.035, 1.0), 0.85)
m_tronco = material("IG_Tronco", (0.12, 0.08, 0.05, 1.0), 0.9)

f_fachada = mat_foto("ig_fachada_oeste")
f_muro = mat_foto("ig_muro_norte")
f_muro_s = mat_foto("ig_muro_sur")
f_portada_n = mat_foto("ig_portada_norte")
f_portada_s = mat_foto("ig_portada_sur")
f_clere = mat_foto("ig_clerestorio")
f_cara_n = mat_foto("ig_torre_cara_norte")
f_cara_o = mat_foto("ig_torre_cara_oeste")
f_cara_l = mat_foto("ig_torre_cara_lado")
f_campanas = mat_foto("ig_torre_campanas")
f_cuerpo_a = mat_foto("ig_torre_cuerpo_a")
f_cuerpo_b = mat_foto("ig_torre_cuerpo_b")
f_linterna = mat_foto("ig_torre_linterna")
f_balaus = mat_foto("ig_balaustrada")
f_cupula = mat_foto("ig_cupula")
f_tambor = mat_foto("ig_tambor")

# Medidas de la planta (vista cenital)
XN = -17.5      # muro norte (plaza)
XS = 17.5       # muro sur (patios)
XNAVE = 6.1     # media anchura de la nave central
Y_CRU0 = 33.8   # crucero
Y_CRU1 = 45.3
Y_CAB = 54.7    # fin de la cabecera / arranque de la sacristía
Y_FIN = 61.5    # testero de la sacristía
Z_BAJO = 12.5   # muros de las naves laterales
Z_ALTO = 19.5   # muros de la nave central, crucero y cabecera

# ==========================================
# 2. SUELO Y GRADAS
# ==========================================
if ESCENA == "plaza":
    caja_lim("IG_Plaza", -42, 48, -18, 68, -0.2, 0.0, m_suelo)
for i in range(5):
    caja_lim("IG_Grada_" + str(i), XN, 18.5, -3.0 + i * 0.3, 0.0, 0.0, 0.12 * (i + 1), m_grada)

# ==========================================
# 3. CUERPO BAJO (cinco naves) Y FACHADA OESTE
# ==========================================
caja_lim("IG_Cuerpo", XN, XS, 0, Y_CAB, 0, Z_BAJO, m_cal)
caja_lim("IG_Pretil_N", XN, XN + 0.4, 4.5, Y_CAB, Z_BAJO, 13.6, m_cal)
caja_lim("IG_Pretil_S", XS - 0.4, XS, 4.5, Y_CAB, Z_BAJO, 13.6, m_cal)

# Fachada oeste: foto de día enderezada en metros (X de -11,5 a 18,5, Z de 0,6 a 23, 40 px/m)
# recortada por su silueta. El perfil está medido en la foto enderezada: X = -18 + u/40,
# Z = 23 - v/40. Incluye la cara oeste de la torre inacabada.
perfil = [[259, 382], [321, 334], [364, 327], [393, 339], [426, 334], [455, 315], [479, 286], [488, 239], [488, 134], [498, 95], [574, 95], [612, 57], [669, 29], [727, 17], [784, 29], [841, 57], [875, 95], [956, 95], [964, 134], [964, 277], [994, 315], [1032, 334], [1070, 324], [1104, 324], [1127, 344], [1142, 377], [1166, 386], [1173, 367], [1461, 367]]
verts = []
caras = []
uvs = []
for i in range(len(perfil)):
    q = perfil[i]
    x = -18.0 + q[0] / 40.0
    verts.append((x, -0.04, 0.6))
    verts.append((x, -0.04, 23.0 - q[1] / 40.0))
for i in range(len(perfil) - 1):
    a = perfil[i]
    b = perfil[i + 1]
    ua = (a[0] / 40.0 - 6.5) / 30.0
    ub = (b[0] / 40.0 - 6.5) / 30.0
    caras.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    uvs.append((ua, 0.0))
    uvs.append((ub, 0.0))
    uvs.append((ub, (22.4 - b[1] / 40.0) / 22.4))
    uvs.append((ua, (22.4 - a[1] / 40.0) / 22.4))
malla_uv("IG_Fachada_Oeste", verts, caras, uvs, f_fachada)
# Volúmenes detrás de la fachada (alas con volutas y hastial central)
caja_lim("IG_Fachada_Alas", -11.5, 11.5, 0.0, 0.8, Z_BAJO, 13.4, m_cal)
caja_lim("IG_Hastial", -5.7, 6.0, 0.0, 0.8, Z_BAJO, 19.9, m_cal)
caja("IG_Cruz_Fachada_V", (0.2, -0.1, 23.4), (0.12, 0.12, 1.4), m_hierro)
caja("IG_Cruz_Fachada_H", (0.2, -0.1, 23.7), (0.8, 0.12, 0.12), m_hierro)

# Muro norte (a la plaza): dibujado a regla con la portada de la foto, de la torre a la sacristía
panel("IG_Muro_Norte", f_muro, (XN - 0.04, Y_CAB), (0, -1), Y_CAB - 4.5, 0, 13.6)
# Muro sur (a los patios): dibujado igual que el norte, con la portada sur de la foto
panel("IG_Muro_Sur", f_muro_s, (XS + 0.04, 4.5), (0, 1), Y_CAB - 4.5, 0, 13.6, 1.0, 0.0)

# Relieve de las portadas laterales: la foto enderezada se reparte en piezas a distinta
# profundidad (puerta hundida, cuerpo bajo saliente, columnas y cornisa más salientes, ático).
# Las caras laterales llevan la línea de borde de la foto estirada, así toman su color.
# P = [x_pared, y_centro, sentido_fuera_x, sentido_derecha_y, u0_foto, ancho_foto, alto_foto]
def pp(P, u, o, z):
    return (P[0] + P[2] * o, P[1] + P[3] * u, z)


def uvp(P, u, z):
    return ((u - P[4]) / P[5], z / P[6])


def cara_p(nombre, mat, P, u0, u1, z0, z1, o):
    verts = [pp(P, u0, o, z0), pp(P, u1, o, z0), pp(P, u1, o, z1), pp(P, u0, o, z1)]
    uvs = [uvp(P, u0, z0), uvp(P, u1, z0), uvp(P, u1, z1), uvp(P, u0, z1)]
    return malla_uv(nombre, verts, [(0, 1, 2, 3)], uvs, mat)


def bloque_p(nombre, mat, P, u0, u1, z0, z1, o0, o1, frente=True):
    # Prisma saliente: frente con la foto y lados con su borde estirado
    if frente:
        cara_p(nombre + "_F", mat, P, u0, u1, z0, z1, o1)
    a = uvp(P, u0, z0)
    b = uvp(P, u0, z1)
    malla_uv(nombre + "_I", [pp(P, u0, o0, z0), pp(P, u0, o1, z0), pp(P, u0, o1, z1), pp(P, u0, o0, z1)], [(0, 1, 2, 3)], [a, a, b, b], mat)
    a = uvp(P, u1, z0)
    b = uvp(P, u1, z1)
    malla_uv(nombre + "_D", [pp(P, u1, o1, z0), pp(P, u1, o0, z0), pp(P, u1, o0, z1), pp(P, u1, o1, z1)], [(0, 1, 2, 3)], [a, a, b, b], mat)
    a = uvp(P, u0, z1)
    b = uvp(P, u1, z1)
    malla_uv(nombre + "_T", [pp(P, u0, o1, z1), pp(P, u1, o1, z1), pp(P, u1, o0, z1), pp(P, u0, o0, z1)], [(0, 1, 2, 3)], [a, b, b, a], mat)
    a = uvp(P, u0, z0)
    b = uvp(P, u1, z0)
    malla_uv(nombre + "_B", [pp(P, u0, o0, z0), pp(P, u1, o0, z0), pp(P, u1, o1, z0), pp(P, u0, o1, z0)], [(0, 1, 2, 3)], [a, b, b, a], mat)


def portada_relieve(pre, mat, P, M):
    # M: medidas en metros sobre la foto enderezada, en este orden:
    #   puerta [u0, u1, z_clave], cuerpo [u0, u1, z_alto], cornisa [z0, z1],
    #   columnas [[u0, u1], ...], atico [u0, u1, z_alto]
    D = 0.45
    pu = M[0]
    cu = M[1]
    co = M[2]
    # Puerta hundida en el fondo del vano y mochetas
    cara_p(pre + "_Puerta", mat, P, pu[0], pu[1], 0.0, pu[2], 0.06)
    bloque_p(pre + "_Vano", mat, P, pu[0], pu[1], 0.0, pu[2], 0.06, D, False)
    # Cuerpo bajo saliente, con el hueco de la puerta
    cara_p(pre + "_Cuerpo_I", mat, P, cu[0], pu[0], 0.0, co[0], D)
    cara_p(pre + "_Cuerpo_D", mat, P, pu[1], cu[1], 0.0, co[0], D)
    cara_p(pre + "_Cuerpo_C", mat, P, pu[0], pu[1], pu[2], co[0], D)
    bloque_p(pre + "_Cuerpo", mat, P, cu[0], cu[1], 0.0, co[0], 0.0, D, False)
    # Columnas o pilastras, más salientes
    for i in range(len(M[3])):
        c = M[3][i]
        bloque_p(pre + "_Col_" + str(i), mat, P, c[0], c[1], 0.3, co[0], D, D + 0.3)
    # Cornisa volada sobre las columnas
    bloque_p(pre + "_Cornisa", mat, P, cu[0] - 0.15, cu[1] + 0.15, co[0], co[1], 0.0, D + 0.45)
    # Ático con la hornacina, algo menos saliente
    at = M[4]
    bloque_p(pre + "_Atico", mat, P, at[0], at[1], co[1], at[2], 0.0, D * 0.6)


# Portada norte (plaza): la pared mira a -X; a la derecha del que la mira queda -Y
portada_relieve("IG_PN", f_portada_n, [XN - 0.04, 22.2, -1, -1, -4.83, 9.66, 13.6], [
    [-1.48, 1.80, 5.75],
    [-4.3, 4.35, 0.0],
    [7.0, 7.5],
    [[-4.08, -3.33], [-2.95, -2.2], [2.36, 3.1], [3.42, 4.17]],
    [-2.95, 3.17, 12.4],
])
# Portada sur (patio): mira a +X; a la derecha queda +Y. La foto va escalada a 0,908 para que
# su friso caiga en el del muro, así que las medidas también.
K = 0.908
portada_relieve("IG_PS", f_portada_s, [XS + 0.04, 22.2, 1, 1, -4.9 * K, 9.8 * K, 13.0 * K], [
    [-1.8 * K, 1.89 * K, 6.25 * K],
    [-4.17 * K, 4.2 * K, 0.0],
    [7.75 * K, 8.25 * K],
    [[-4.05 * K, -2.17 * K], [2.33 * K, 4.2 * K]],
    [-1.92 * K, 2.08 * K, 12.0 * K],
])

# ==========================================
# 4. NAVE CENTRAL, CRUCERO Y CABECERA (cruz latina)
# ==========================================
caja_lim("IG_Nave_Alta", -XNAVE, XNAVE, 0.8, Y_CRU0, Z_BAJO, Z_ALTO, m_cal)
panel("IG_Clere_N", f_clere, (-XNAVE - 0.04, Y_CRU0), (0, -1), Y_CRU0 - 0.8, Z_BAJO, Z_ALTO, 0.0, 1.2)
panel("IG_Clere_S", f_clere, (XNAVE + 0.04, 0.8), (0, 1), Y_CRU0 - 0.8, Z_BAJO, Z_ALTO, 1.2, 0.0)
caja_lim("IG_Crucero", XN, XS, Y_CRU0, Y_CRU1, Z_BAJO, Z_ALTO, m_cal)
panel("IG_Crucero_N", f_clere, (XN - 0.04, Y_CRU1), (0, -1), Y_CRU1 - Y_CRU0, Z_BAJO, Z_ALTO, 0.0, 0.4)
panel("IG_Crucero_S", f_clere, (XS + 0.04, Y_CRU0), (0, 1), Y_CRU1 - Y_CRU0, Z_BAJO, Z_ALTO, 0.4, 0.0)
panel("IG_Crucero_ON", f_clere, (XN, Y_CRU0 - 0.04), (1, 0), XN * -1 - XNAVE, Z_BAJO, Z_ALTO, 0.0, 0.45)
panel("IG_Crucero_OS", f_clere, (XNAVE, Y_CRU0 - 0.04), (1, 0), XS - XNAVE, Z_BAJO, Z_ALTO, 0.45, 0.9)
panel("IG_Crucero_EN", f_clere, (-XNAVE, Y_CRU1 + 0.04), (-1, 0), XN * -1 - XNAVE, Z_BAJO, Z_ALTO, 0.0, 0.45)
panel("IG_Crucero_ES", f_clere, (XS, Y_CRU1 + 0.04), (-1, 0), XS - XNAVE, Z_BAJO, Z_ALTO, 0.45, 0.9)
caja_lim("IG_Cabecera", -XNAVE, XNAVE, Y_CRU1, Y_CAB, Z_BAJO, Z_ALTO, m_cal)
panel("IG_Cabecera_N", f_clere, (-XNAVE - 0.04, Y_CAB), (0, -1), Y_CAB - Y_CRU1, Z_BAJO, Z_ALTO, 0.0, 0.35)
panel("IG_Cabecera_S", f_clere, (XNAVE + 0.04, Y_CRU1), (0, 1), Y_CAB - Y_CRU1, Z_BAJO, Z_ALTO, 0.35, 0.0)
caja_lim("IG_Cabecera_Testero", -XNAVE, XNAVE, Y_CAB, Y_CAB + 0.3, 11.0, Z_ALTO, m_cal)
# Cornisas de ladrillo bajo los aleros
caja_lim("IG_Cornisa_Nave_N", -XNAVE - 0.3, -XNAVE + 0.1, 0.8, Y_CRU0, Z_ALTO - 0.4, Z_ALTO, m_albero)
caja_lim("IG_Cornisa_Nave_S", XNAVE - 0.1, XNAVE + 0.3, 0.8, Y_CRU0, Z_ALTO - 0.4, Z_ALTO, m_albero)
caja_lim("IG_Cornisa_Crucero_O", XN - 0.3, XS + 0.3, Y_CRU0 - 0.3, Y_CRU0 + 0.1, Z_ALTO - 0.4, Z_ALTO, m_albero)
caja_lim("IG_Cornisa_Crucero_E", XN - 0.3, XS + 0.3, Y_CRU1 - 0.1, Y_CRU1 + 0.3, Z_ALTO - 0.4, Z_ALTO, m_albero)
caja_lim("IG_Cornisa_Cabecera_N", -XNAVE - 0.3, -XNAVE + 0.1, Y_CRU1, Y_CAB + 0.3, Z_ALTO - 0.4, Z_ALTO, m_albero)
caja_lim("IG_Cornisa_Cabecera_S", XNAVE - 0.1, XNAVE + 0.3, Y_CRU1, Y_CAB + 0.3, Z_ALTO - 0.4, Z_ALTO, m_albero)

# Cubiertas de teja: nave con faldón al oeste, crucero a cuatro aguas con testeros a norte y
# sur, cabecera con faldón al este y naves laterales a un agua
H = 4.0
tejado_hip("IG_Tejado_Nave", m_teja, -XNAVE - 0.3, XNAVE + 0.3, 0.5, Y_CRU0, Z_ALTO, H, XNAVE + 0.3, 0)
tejado_hip_x("IG_Tejado_Crucero", m_teja, XN - 0.3, XS + 0.3, Y_CRU0 - 0.3, Y_CRU1 + 0.3, Z_ALTO, H, 6.1, 6.1)
tejado_hip("IG_Tejado_Cabecera", m_teja, -XNAVE - 0.3, XNAVE + 0.3, Y_CRU1, Y_CAB + 0.3, Z_ALTO, H, 0, XNAVE + 0.3)
YC = (Y_CRU0 + Y_CRU1) / 2
ZR = Z_ALTO + H
limas("IG_Lima", m_verde, [
    [(0, XNAVE + 0.8, ZR), (0, Y_CRU0, ZR)],
    [(-XNAVE - 0.3, 0.5, Z_ALTO), (0, XNAVE + 0.8, ZR)],
    [(XNAVE + 0.3, 0.5, Z_ALTO), (0, XNAVE + 0.8, ZR)],
    [(XN + 5.8, YC, ZR), (XS - 5.8, YC, ZR)],
    [(XN - 0.3, Y_CRU0 - 0.3, Z_ALTO), (XN + 5.8, YC, ZR)],
    [(XN - 0.3, Y_CRU1 + 0.3, Z_ALTO), (XN + 5.8, YC, ZR)],
    [(XS + 0.3, Y_CRU0 - 0.3, Z_ALTO), (XS - 5.8, YC, ZR)],
    [(XS + 0.3, Y_CRU1 + 0.3, Z_ALTO), (XS - 5.8, YC, ZR)],
    [(0, Y_CRU1, ZR), (0, Y_CAB + 0.3 - XNAVE - 0.3, ZR)],
    [(-XNAVE - 0.3, Y_CAB + 0.3, Z_ALTO), (0, Y_CAB - XNAVE, ZR)],
    [(XNAVE + 0.3, Y_CAB + 0.3, Z_ALTO), (0, Y_CAB - XNAVE, ZR)],
])
Z_ALERO = 13.0
Z_LIMA = 16.2
tejado_pendiente("IG_Tejado_Lat_N0", m_teja, -11.5, -XNAVE, 0.8, 4.5, Z_ALERO, Z_LIMA)
tejado_pendiente("IG_Tejado_Lat_N1", m_teja, XN + 0.4, -XNAVE, 4.5, Y_CRU0, Z_ALERO, Z_LIMA)
tejado_pendiente("IG_Tejado_Lat_N2", m_teja, XN + 0.4, -XNAVE, Y_CRU1, Y_CAB, Z_ALERO, Z_LIMA)
tejado_pendiente("IG_Tejado_Lat_S0", m_teja, 11.5, XNAVE, 0.8, 4.5, Z_ALERO, Z_LIMA)
tejado_pendiente("IG_Tejado_Lat_S1", m_teja, XS - 0.4, XNAVE, 4.5, Y_CRU0, Z_ALERO, Z_LIMA)
tejado_pendiente("IG_Tejado_Lat_S2", m_teja, XS - 0.4, XNAVE, Y_CRU1, Y_CAB, Z_ALERO, Z_LIMA)
# Lucernas sobre los faldones de la nave (las manchas claras de la vista cenital)
for i in range(2):
    sx = -1
    if i == 1:
        sx = 1
    caja("IG_Lucerna_" + str(i), (sx * 4.2, 22.0, 21.4), (1.2, 1.4, 1.0), m_cal)
    caja("IG_Lucerna_Hueco_" + str(i), (sx * 4.81, 22.0, 21.4), (0.05, 0.7, 0.6), m_hueco)

# Cúpula sobre el crucero: tambor con óculos, media naranja de nervios y linterna
DY = YC
prisma_foto("IG_Tambor", f_tambor, 0, DY, 5.6, Z_ALTO + 1.0, 24.6, 24, 4)
cilindro("IG_Tambor_Base", (0, DY, Z_ALTO + 0.5), 5.7, 1.0, m_cal, vertices=24)
cilindro("IG_Tambor_Cornisa", (0, DY, 24.8), 6.05, 0.45, m_cal, vertices=24)
cupula_foto("IG_Cupula", f_cupula, 0, DY, 25.0, 5.75, 5.2, 24, 7, 4)
cilindro("IG_Linterna", (0, DY, 30.9), 1.1, 1.9, m_cal, vertices=12)
cilindro("IG_Linterna_Anillo", (0, DY, 31.9), 1.3, 0.25, m_albero, vertices=12)
cono("IG_Linterna_Chapitel", (0, DY, 32.6), 1.15, 0.25, 1.1, m_cal, vertices=12)
esfera("IG_Linterna_Bola", (0, DY, 33.3), 0.3, m_cal)
caja("IG_Cruz_Cupula_V", (0, DY, 34.2), (0.1, 0.1, 1.5), m_hierro)
caja("IG_Cruz_Cupula_H", (0, DY, 34.5), (0.8, 0.1, 0.1), m_hierro)

# ==========================================
# 5. TORRE (noroeste, 6 x 6 m, adelantada 1,5 m a la fachada)
# ==========================================
TX0 = XN
TX1 = XN + 6.0
TY0 = -1.5
TY1 = 4.5
TC = ((TX0 + TX1) / 2, (TY0 + TY1) / 2)
caja_lim("IG_Torre_Cana", TX0, TX1, TY0, TY1, 0, 27.5, m_cal)
caja_lim("IG_Torre_Zocalo", TX0 - 0.05, TX1 + 0.05, TY0 - 0.05, TY1 + 0.05, 0, 0.6, m_grada)
# Caña: muro limpio con los detalles de las fotos (balcones, reloj, Virgen, ventanas) pegados a
# alturas comunes en las cuatro caras (iglesia_granada/dibujar_torre.py). Sur y este, solo por
# encima de los tejados.
caras_caja("IG_Torre_Cana", [f_cara_o, f_cara_n, None, None], TX0, TX1, TY0, TY1, 0, 27.5)
caras_caja("IG_Torre_Cana_Alta", [None, None, f_cara_l, f_cara_l], TX0, TX1, TY0, TY1, 13.6, 27.5, 0.03, 13.6 / 27.5)
caja("IG_Torre_Imposta", (TC[0], TC[1], 27.65), (6.5, 6.5, 0.3), m_albero)
# Cuerpo de campanas con el friso de azulejos (foto)
caja_lim("IG_Torre_Campanas", TX0 - 0.1, TX1 + 0.1, TY0 - 0.1, TY1 + 0.1, 27.8, 35.0, m_cal)
caras_caja("IG_Torre_Campanas", [f_campanas, f_campanas, f_campanas, f_campanas], TX0 - 0.1, TX1 + 0.1, TY0 - 0.1, TY1 + 0.1, 27.8, 35.0)
caja("IG_Torre_Cornisa", (TC[0], TC[1], 35.25), (6.9, 6.9, 0.5), m_albero)
# Terraza con balaustrada y jarras de azucenas en las esquinas
caras_caja("IG_Torre_Balaus", [f_balaus, f_balaus, f_balaus, f_balaus], TX0 + 0.1, TX1 - 0.1, TY0 + 0.1, TY1 - 0.1, 35.5, 36.8, 0.0)
caras_caja("IG_Torre_Balaus_In", [f_balaus, f_balaus, f_balaus, f_balaus], TX1 - 0.25, TX0 + 0.25, TY1 - 0.25, TY0 + 0.25, 35.5, 36.8, 0.0)
esquinas = [[TX0 + 0.3, TY0 + 0.3], [TX1 - 0.3, TY0 + 0.3], [TX1 - 0.3, TY1 - 0.3], [TX0 + 0.3, TY1 - 0.3]]
for i in range(4):
    q = esquinas[i]
    cono("IG_Torre_Jarra_" + str(i), (q[0], q[1], 37.2), 0.22, 0.38, 0.8, m_cal, vertices=10)
    cilindro("IG_Torre_Azucena_" + str(i), (q[0], q[1], 38.2), 0.04, 1.4, m_hierro, vertices=6)
    esfera("IG_Torre_Flor_" + str(i), (q[0], q[1], 38.95), 0.28, m_hierro, escala=(1, 1, 0.6))
# Primer cuerpo de remate (arco y pináculos)
A = 2.2
caja_lim("IG_Torre_CuerpoA", TC[0] - A, TC[0] + A, TC[1] - A, TC[1] + A, 35.5, 40.0, m_cal)
caras_caja("IG_Torre_CuerpoA", [f_cuerpo_a, f_cuerpo_a, f_cuerpo_a, f_cuerpo_a], TC[0] - A, TC[0] + A, TC[1] - A, TC[1] + A, 36.8, 40.0)
for i in range(4):
    sx = 1
    sy = 1
    if i == 0 or i == 3:
        sx = -1
    if i < 2:
        sy = -1
    cono("IG_Torre_Pinaculo_" + str(i), (TC[0] + sx * 2.55, TC[1] + sy * 2.55, 37.2), 0.22, 0.05, 0.9, m_cal, vertices=8)
caja("IG_Torre_CornisaA", (TC[0], TC[1], 40.15), (5.0, 5.0, 0.3), m_rosa)
# Segundo cuerpo de remate
B = 1.5
caja_lim("IG_Torre_CuerpoB", TC[0] - B, TC[0] + B, TC[1] - B, TC[1] + B, 40.3, 43.4, m_cal)
caras_caja("IG_Torre_CuerpoB", [f_cuerpo_b, f_cuerpo_b, f_cuerpo_b, f_cuerpo_b], TC[0] - B, TC[0] + B, TC[1] - B, TC[1] + B, 40.3, 43.4)
caja("IG_Torre_CornisaB", (TC[0], TC[1], 43.55), (3.4, 3.4, 0.3), m_rosa)
# Linterna, cupulilla de azulejo, bola y giraldillo
prisma_foto("IG_Torre_Linterna", f_linterna, TC[0], TC[1], 1.05, 43.7, 45.3, 8, 4)
cilindro("IG_Torre_Linterna_Anillo", (TC[0], TC[1], 45.4), 1.2, 0.2, m_rosa, vertices=8)
esfera("IG_Torre_Cupulilla", (TC[0], TC[1], 45.5), 0.95, m_azulejo, escala=(1, 1, 0.75), segmentos=12, anillos=8)
esfera("IG_Torre_Bola", (TC[0], TC[1], 46.75), 0.45, m_bronce)
viga("IG_Torre_Varilla_1", (TC[0] - 1.3, TC[1], 45.6), (TC[0] + 0.9, TC[1], 48.0), 0.06, m_hierro)
viga("IG_Torre_Varilla_2", (TC[0] + 1.3, TC[1], 45.6), (TC[0] - 0.9, TC[1], 48.0), 0.06, m_hierro)
cilindro("IG_Giraldillo_Cuerpo", (TC[0], TC[1], 47.8), 0.18, 1.3, m_bronce, vertices=8)
esfera("IG_Giraldillo_Cabeza", (TC[0], TC[1], 48.6), 0.15, m_bronce)
cilindro("IG_Giraldillo_Asta", (TC[0] - 0.35, TC[1], 48.4), 0.03, 2.0, m_hierro, vertices=6)
caja("IG_Giraldillo_Bandera", (TC[0] - 0.75, TC[1], 49.0), (0.7, 0.03, 0.45), m_bronce)
caja("IG_Giraldillo_Cruz", (TC[0] - 0.35, TC[1], 49.35), (0.3, 0.03, 0.05), m_hierro)

# ==========================================
# 6. TORRE INACABADA (suroeste): cuerpo de 7 m con azotea y tejadillo ochavado detrás
# ==========================================
caja_lim("IG_Torre_Sur", 11.5, 18.5, 0.0, 4.5, 0, 13.8, m_cal)
caja_lim("IG_Torre_Sur_Pretil_E", 11.5, 18.5, 4.2, 4.5, 13.8, 14.3, m_cal)
caja_lim("IG_Torre_Sur_Pretil_S", 18.2, 18.5, 0.0, 4.5, 13.8, 14.3, m_cal)
caja_lim("IG_Torre_Sur_Pretil_N", 11.5, 11.8, 0.0, 4.5, 13.8, 14.3, m_cal)
caja_lim("IG_Torre_Sur_Imposta_S", 18.5, 18.6, 0.0, 4.5, 3.6, 3.75, m_albero)
caja_lim("IG_Torre_Sur_Ventana_S", 18.5, 18.56, 1.5, 3.0, 9.5, 11.0, m_hueco)
cilindro("IG_Ochavo_Base", (14.2, 7.2, 13.2), 2.9, 1.4, m_cal, vertices=8, rot=(0, 0, math.pi / 8))
cono("IG_Ochavo_Tejado", (14.2, 7.2, 15.4), 3.15, 0.15, 3.0, m_teja, vertices=8, rot=(0, 0, math.pi / 8))
esfera("IG_Ochavo_Remate", (14.2, 7.2, 17.0), 0.25, m_verde)

# ==========================================
# 7. SACRISTÍA (este), CUPULINES Y PATIOS (sur)
# ==========================================
caja_lim("IG_Sacristia", XN, XS, Y_CAB, Y_FIN, 0, 11.0, m_cal)
caja_lim("IG_Sacristia_Azotea", XN + 0.3, XS - 0.3, Y_CAB, Y_FIN - 0.3, 11.0, 11.05, m_azotea)
caja_lim("IG_Sacristia_Pretil_E", XN, XS, Y_FIN - 0.3, Y_FIN, 11.0, 11.8, m_cal)
caja_lim("IG_Sacristia_Pretil_N", XN, XN + 0.3, Y_CAB, Y_FIN, 11.0, 11.8, m_cal)
caja_lim("IG_Sacristia_Pretil_S", XS - 0.3, XS, Y_CAB, Y_FIN, 11.0, 11.8, m_cal)
caja_lim("IG_Sacristia_Cornisa", XN - 0.15, XS + 0.15, Y_FIN - 0.15, Y_FIN + 0.15, 10.6, 11.0, m_albero)
claraboyas = [[-10.0, 56.2], [-10.0, 59.2], [9.6, 56.2], [9.6, 59.2]]
for i in range(len(claraboyas)):
    q = claraboyas[i]
    caja("IG_Claraboya_" + str(i), (q[0], q[1], 11.4), (1.3, 1.3, 0.8), m_cal)
# Testeros del este: muro de la sacristía y cabecera por encima, con la foto del cuerpo alto
# (ventanas recercadas, imposta y óculos), repetida a lo largo
# (la foto cubre unos 29 x 7 m: se pone a su proporción, en la parte alta del muro)
panel("IG_Testero_Sacristia", f_clere, (XS, Y_FIN + 0.04), (-1, 0), XS - XN, 4.8, 11.8, 0.0, 1.2)
panel("IG_Testero_Cabecera", f_clere, (XNAVE, Y_CAB + 0.34), (-1, 0), 2 * XNAVE, 11.8, Z_ALTO, 0.0, 0.42)
panel("IG_Sacristia_N", f_clere, (XN - 0.04, Y_FIN), (0, -1), Y_FIN - Y_CAB, 4.8, 11.8, 0.0, 0.23)
panel("IG_Sacristia_S", f_clere, (XS + 0.04, Y_CAB), (0, 1), Y_FIN - Y_CAB, 4.8, 11.8, 0.23, 0.0)
caja_lim("IG_Sacristia_Zocalo", XN - 0.06, XS + 0.06, Y_CAB, Y_FIN + 0.06, 0.0, 0.8, m_grada)
for i in range(4):
    vx = -12.0 + i * 8.0
    caja("IG_Testero_Ventana_" + str(i), (vx, Y_FIN + 0.03, 2.8), (1.0, 0.06, 1.6), m_hueco)
    caja("IG_Testero_Marco_" + str(i), (vx, Y_FIN + 0.02, 2.8), (1.4, 0.05, 2.0), m_albero)
for i in range(2):
    sx = -1
    if i == 1:
        sx = 1
    cilindro("IG_Cupulin_Base_" + str(i), (sx * 15.9, Y_CAB - 1.8, 13.4), 1.2, 1.8, m_cal, vertices=12)
    esfera("IG_Cupulin_" + str(i), (sx * 15.9, Y_CAB - 1.8, 14.3), 1.2, m_azulejo, escala=(1, 1, 0.9))

def hacer_plaza():
    # Tapias de los patios
    caja_lim("IG_Tapia_Oeste", XS, 26, 8.5, 9.0, 0, 4.0, m_cal)
    caja_lim("IG_Tapia_Naranjos", 25.5, 26, 9, 27, 0, 4.0, m_cal)
    caja_lim("IG_Tapia_Olivos_O", 26, 46, 26.5, 27, 0, 4.0, m_cal)
    caja_lim("IG_Tapia_Olivos_S", 45.5, 46, 27, 62, 0, 4.0, m_cal)
    caja_lim("IG_Tapia_Olivos_E", XS, 46, 61.5, 62, 0, 4.0, m_cal)
    arboles = [[21, 12, 0.9], [23.5, 12.5, 0.9], [21, 16, 0.9], [23.5, 16.5, 0.9], [21, 20, 0.9], [23.5, 20.5, 0.9], [22, 24, 0.9],
               [21, 31, 1.6], [26, 30, 1.6], [31, 32, 1.8], [37, 30, 1.6], [42, 33, 1.7], [22, 38, 1.7], [28, 37, 1.6], [34, 39, 1.9],
               [40, 40, 1.6], [24, 45, 1.7], [31, 46, 1.6], [38, 47, 1.8], [43, 50, 1.6], [26, 53, 1.6], [33, 55, 1.7], [40, 57, 1.6]]
    for i in range(len(arboles)):
        q = arboles[i]
        cilindro("IG_Arbol_Tronco_" + str(i), (q[0], q[1], q[2] * 0.6), 0.16 * q[2], q[2] * 1.2, m_tronco, vertices=6)
        esfera("IG_Arbol_Copa_" + str(i), (q[0], q[1], q[2] * 1.75), q[2] * 1.15, m_hoja, escala=(1, 1, 0.8), segmentos=8, anillos=6)

    # Palmeras y farolas de la plaza norte
    palmeras = [[-30, 10], [-34, 32]]
    for i in range(len(palmeras)):
        q = palmeras[i]
        cilindro("IG_Palmera_Tronco_" + str(i), (q[0], q[1], 4.0), 0.3, 8.0, m_tronco, vertices=8)
        for k in range(7):
            ang = 2 * math.pi * k / 7
            viga("IG_Palmera_Hoja_" + str(i) + "_" + str(k), (q[0], q[1], 8.0), (q[0] + 2.6 * math.cos(ang), q[1] + 2.6 * math.sin(ang), 7.0), 0.35, m_hoja)
    for i in range(6):
        fy = 4 + i * 9
        cilindro("IG_Farola_Poste_" + str(i), (-21.5, fy, 2.0), 0.07, 4.0, m_hierro, vertices=6)
        caja("IG_Farola_Fanal_" + str(i), (-21.5, fy, 4.2), (0.35, 0.35, 0.5), m_hierro)


if ESCENA == "plaza":
    hacer_plaza()


# ==========================================
# 8. PRADERA (ESCENA = "pradera")
# ==========================================
# Prado de la pradera florida T-09 del atlas de hierbas, rodales de flores pintados sobre la
# misma hierba (iglesia_granada/dibujar_pradera.py), riachuelo con lecho de cantos (atlas de
# agua T-23) que cruza delante de la puerta oeste, puente de madera, camino de tierra (T-08),
# orillas (T-04), árboles y un anillo de montañas con nieve en las cumbres.
def mat_tile(nombre, tex, metros):
    m = material(nombre, (1.0, 1.0, 1.0, 1.0), 0.95)
    m.color_map = tex
    m.color_map_scale = metros
    return m


def poligono_suelo(nombre, mat, cx, cy, radio, z, lados, semilla, irregular=0.35):
    # Mancha irregular (rodal) o disco: polígono en abanico; sin UV propias, así la app lo
    # proyecta en metros igual que el prado y casan
    verts = [(cx, cy, z)]
    caras = []
    for i in range(lados):
        a = 2 * math.pi * i / lados
        r = radio * (1 - irregular * 0.5 + irregular * 0.5 * (math.sin(a * 3 + semilla) * 0.6 + math.sin(a * 5 + semilla * 2.3) * 0.4))
        verts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    for i in range(lados):
        j = i + 1
        if j == lados:
            j = 0
        caras.append((0, i + 1, j + 1))
    mesh = bpy.data.meshes.new(nombre)
    mesh.from_pydata(verts, [], caras)
    obj = bpy.data.objects.new(nombre, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def cauce_y(x):
    # Línea central del riachuelo (cruza de norte a sur por delante de la fachada oeste)
    return -16.0 + 2.6 * math.sin(x / 14.0) + 1.3 * math.sin(x / 6.0 + 1.0)


def cinta(nombre, mat, puntos, semiancho, z, tile):
    # Cinta a lo largo de una polilínea [[x, y], ...] con UV propias en metros / tile
    verts = []
    caras = []
    uvs = []
    dist = 0.0
    for i in range(len(puntos) - 1):
        a = puntos[i]
        b = puntos[i + 1]
        dx = b[0] - a[0]
        dy = b[1] - a[1]
        l = math.sqrt(dx * dx + dy * dy)
        nx = -dy / l
        ny = dx / l
        n = len(verts)
        verts.append((a[0] - nx * semiancho, a[1] - ny * semiancho, z))
        verts.append((b[0] - nx * semiancho, b[1] - ny * semiancho, z))
        verts.append((b[0] + nx * semiancho, b[1] + ny * semiancho, z))
        verts.append((a[0] + nx * semiancho, a[1] + ny * semiancho, z))
        caras.append((n, n + 1, n + 2, n + 3))
        uvs.append((0.0, dist / tile))
        uvs.append((0.0, (dist + l) / tile))
        uvs.append((2 * semiancho / tile, (dist + l) / tile))
        uvs.append((2 * semiancho / tile, dist / tile))
        dist = dist + l
    return malla_uv(nombre, verts, caras, uvs, mat)


def hacer_montanas(R0, R1, n_ang, n_rad):
    m_bosque = material("IG_Monte_Bosque", (0.035, 0.07, 0.03, 1.0), 0.95)
    m_roca = material("IG_Monte_Roca", (0.16, 0.14, 0.12, 1.0), 0.9)
    m_nieve = material("IG_Monte_Nieve", (0.85, 0.87, 0.9, 1.0), 0.6)
    grupos = [[[], []], [[], []], [[], []]]
    alturas = []
    for j in range(n_rad + 1):
        fila = []
        r = R0 + (R1 - R0) * j / n_rad
        t = j / n_rad
        perfil = math.sin(min(1.0, t * 1.6) * math.pi / 2)
        for i in range(n_ang):
            a = 2 * math.pi * i / n_ang
            cresta = 70 + 30 * math.sin(3 * a + 0.5) + 22 * math.sin(7 * a + 1.3) + 12 * math.sin(13 * a + 2.1) + 7 * math.sin(23 * a + t * 3)
            fila.append([r * math.cos(a), 20 + r * math.sin(a), perfil * cresta * (0.75 + 0.25 * math.sin(5 * a + t * 4))])
        alturas.append(fila)
    for j in range(n_rad):
        for i in range(n_ang):
            k = i + 1
            if k == n_ang:
                k = 0
            # orden antihorario visto desde dentro del valle (las caras miran a la iglesia)
            q = [alturas[j][i], alturas[j + 1][i], alturas[j + 1][k], alturas[j][k]]
            hm = (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4
            g = 0
            if hm > 38:
                g = 1
            if hm > 82:
                g = 2
            vs = grupos[g][0]
            n = len(vs)
            for p in q:
                vs.append((p[0], p[1], p[2]))
            grupos[g][1].append((n, n + 1, n + 2, n + 3))
    mats = [m_bosque, m_roca, m_nieve]
    nombres = ["IG_Montes_Bosque", "IG_Montes_Roca", "IG_Montes_Nieve"]
    for g in range(3):
        if len(grupos[g][1]) > 0:
            mesh = bpy.data.meshes.new(nombres[g])
            mesh.from_pydata(grupos[g][0], [], grupos[g][1])
            obj = bpy.data.objects.new(nombres[g], mesh)
            bpy.context.collection.objects.link(obj)
            obj.data.materials.append(mats[g])


def lejos_de_todo(x, y, margen):
    # Fuera de la iglesia, del cauce y del camino
    if x > XN - margen and x < XS + 1 + margen and y > -3.5 - margen and y < Y_FIN + margen:
        return False
    if abs(y - cauce_y(x)) < 4.5 + margen:
        return False
    if abs(x) < 2.2 + margen and y < 0:
        return False
    return True


def hacer_pradera():
    m_prado = mat_tile("IG_Prado", "ig_prado", 4.0)
    flores = [mat_tile("IG_Prado_Amapolas", "ig_prado_amapolas", 4.0), mat_tile("IG_Prado_Lavanda", "ig_prado_lavanda", 4.0),
              mat_tile("IG_Prado_Botones", "ig_prado_botones", 4.0), mat_tile("IG_Prado_Mezcla", "ig_prado_mezcla", 4.0)]
    m_orilla = mat_tile("IG_Orilla", "ig_orilla", 4.0)
    m_camino = mat_tile("IG_Camino", "ig_camino", 3.0)
    m_lecho = mat_tile("IG_Lecho", "ig_lecho", 3.0)
    m_agua = material("IG_Agua", (0.02, 0.22, 0.26, 1.0), 0.05)
    bsdf = m_agua.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Alpha"].default_value = 0.4
    bsdf.inputs["Coat Weight"].default_value = 1.0
    m_madera = material("IG_Madera", (0.2, 0.11, 0.05, 1.0), 0.75)
    m_piedra = material("IG_Piedra", (0.3, 0.28, 0.25, 1.0), 0.85)
    m_hoja2 = material("IG_Hoja_Alamo", (0.1, 0.2, 0.05, 1.0), 0.8)
    m_junco = material("IG_Junco", (0.12, 0.2, 0.05, 1.0), 0.8)
    m_f_rojo = material("IG_Flor_Roja", (0.6, 0.02, 0.01, 1.0), 0.6)
    m_f_amar = material("IG_Flor_Amarilla", (0.9, 0.55, 0.02, 1.0), 0.6)
    m_f_mora = material("IG_Flor_Morada", (0.22, 0.09, 0.5, 1.0), 0.6)
    m_f_blanca = material("IG_Flor_Blanca", (0.9, 0.9, 0.85, 1.0), 0.6)

    # Prado
    poligono_suelo("IG_Prado", m_prado, 0, 20, 175, 0.0, 64, 0, 0.0)
    # Rodales de flores
    tipo = 0
    for k in range(70):
        a = k * 2.399963
        r = 14 + 4.2 * math.sqrt(k * 7)
        x = r * math.cos(a)
        y = 20 + r * math.sin(a)
        if r < 150 and lejos_de_todo(x, y, 4):
            poligono_suelo("IG_Rodal_" + str(k), flores[tipo % 4], x, y, 4 + (k % 5) * 1.4, 0.015, 14, k)
            tipo = tipo + 1
    # Riachuelo: orillas, lecho y lámina de agua
    pts = []
    for i in range(0, 69):
        x = -170 + i * 5.0
        pts.append([x, cauce_y(x)])
    cinta("IG_Orilla", m_orilla, pts, 4.4, 0.01, 4.0)
    cinta("IG_Lecho", m_lecho, pts, 2.7, 0.03, 3.0)
    cinta("IG_Agua", m_agua, pts, 2.6, 0.16, 6.0)
    # Piedras y juncos en las orillas
    for k in range(80):
        x = -150 + k * 3.8
        lado = 1
        if k % 2 == 0:
            lado = -1
        y = cauce_y(x) + lado * (2.7 + (k % 3) * 0.4)
        if abs(x) > 3:
            esfera("IG_Canto_" + str(k), (x, y, 0.08), 0.35 + (k % 4) * 0.12, m_piedra, escala=(1.3, 1.0, 0.45), segmentos=6, anillos=4)
        if k % 3 == 0 and abs(x) > 6:
            for j in range(4):
                cono("IG_Junco_" + str(k) + "_" + str(j), (x + j * 0.25 - 0.4, y + lado * 0.9, 0.7), 0.06, 0.0, 1.4 + (j % 2) * 0.4, m_junco, vertices=4)
    # Camino de tierra desde las gradas, puente y más allá
    yb = cauce_y(0)
    camino = [[0.0, -3.0], [0.2, yb + 4.6]]
    cinta("IG_Camino_Atrio", m_camino, camino, 1.8, 0.02, 3.0)
    camino = [[0.0, yb - 4.6], [-1.0, yb - 15], [1.5, yb - 30], [-2.0, yb - 48], [0.0, yb - 70], [3.0, yb - 95], [0.0, yb - 125]]
    cinta("IG_Camino_Sur", m_camino, camino, 1.6, 0.02, 3.0)
    # Puente de madera en arco sobre el riachuelo
    n = 12
    L = 10.0
    for i in range(n):
        t = (i + 0.5) / n
        y = yb - L / 2 + L * t
        z = 0.35 + 1.0 * math.sin(math.pi * t)
        pend = math.atan(1.0 * math.pi / L * math.cos(math.pi * t))
        caja("IG_Puente_Tabla_" + str(i), (0.2, y, z), (3.0, L / n * 1.04, 0.12), m_madera, rot=(pend, 0, 0))
    for lado in [-1, 1]:
        xs = 0.2 + lado * 1.45
        prev = None
        for i in range(n + 1):
            t = i / n
            y = yb - L / 2 + L * t
            z = 0.35 + 1.0 * math.sin(math.pi * t)
            if i % 3 == 0:
                caja("IG_Puente_Poste_" + str(lado) + "_" + str(i), (xs, y, z + 0.55), (0.12, 0.12, 1.1), m_madera)
            if prev:
                viga("IG_Puente_Baranda_" + str(lado) + "_" + str(i), (xs, prev[0], prev[1] + 1.05), (xs, y, z + 1.05), 0.09, m_madera)
            prev = [y, z]
    # Matas de flores en 3D a ambos lados del camino y junto al agua
    colores = [m_f_rojo, m_f_amar, m_f_mora, m_f_blanca]
    for k in range(36):
        lado = 1
        if k % 2 == 0:
            lado = -1
        y = -4.5 - (k // 2) * 1.6
        if abs(y - yb) < 5.5:
            continue
        x = lado * (2.6 + (k % 3) * 0.5)
        for j in range(5):
            ang = j * 1.256 + k
            fx = x + 0.35 * math.cos(ang)
            fy = y + 0.35 * math.sin(ang)
            h = 0.35 + (j % 3) * 0.12
            cilindro("IG_Tallo_" + str(k) + "_" + str(j), (fx, fy, h / 2), 0.015, h, m_junco, vertices=3)
            cono("IG_Flor_" + str(k) + "_" + str(j), (fx, fy, h + 0.04), 0.13, 0.03, 0.1, colores[(k + j) % 4], vertices=5)
    # Árboles: encinas y olivos por el prado, álamos junto al agua
    for k in range(90):
        a = k * 2.399963 + 0.7
        r = 30 + 1.45 * k
        x = r * math.cos(a)
        y = 20 + r * math.sin(a)
        if r < 160 and lejos_de_todo(x, y, 3):
            s = 1.2 + (k % 4) * 0.25
            cilindro("IG_Encina_Tronco_" + str(k), (x, y, s * 1.2), 0.22 * s, s * 2.4, m_tronco, vertices=6)
            esfera("IG_Encina_Copa_" + str(k), (x, y, s * 3.1), s * 2.2, m_hoja, escala=(1, 1, 0.75), segmentos=8, anillos=6)
    for k in range(16):
        x = -120 + k * 16 + 5
        if abs(x) < 12:
            continue
        lado = 1
        if k % 2 == 0:
            lado = -1
        y = cauce_y(x) + lado * 6.0
        cilindro("IG_Alamo_Tronco_" + str(k), (x, y, 2.5), 0.25, 5.0, m_tronco, vertices=6)
        esfera("IG_Alamo_Copa_" + str(k), (x, y, 9.0), 2.2, m_hoja2, escala=(1, 1, 2.4), segmentos=8, anillos=6)
    # Montañas alrededor
    hacer_montanas(168, 330, 72, 7)


if ESCENA == "pradera":
    hacer_pradera()
