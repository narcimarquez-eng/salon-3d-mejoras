import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# LA GIRALDA DE SEVILLA (solo la torre)
# ==============================================================================
# Alminar almohade (1184-1198, Ahmad ibn Basso y Ali de Gomara) rematado por el
# campanario renacentista de Hernan Ruiz el Joven (1558-1568) y el Giraldillo
# (Bartolome Morel, 1568).
#
# Partes modeladas:
#  - Zocalo de sillares de piedra reaprovechados y cana de ladrillo de 13,6 m de lado.
#  - En cada cara, tres calles: la central con ventanas (arcos lobulados y ajimeces
#    de herradura con columnilla de marmol, alfiz y balcon renacentista de hierro)
#    y las laterales con dos pisos de panos de sebka (red de rombos) sobre arquerias
#    ciegas de arcos lobulados.
#  - Friso de arcos entrecruzados y banda de azulejo bajo la cornisa almohade.
#  - Terraza con balaustrada y las cuatro jarras de azucenas de las esquinas.
#  - Cuerpo de campanas con arcos abiertos y campanas de bronce, pilastras, oculos
#    y pinaculos en las esquinas.
#  - Cuerpo del reloj con la inscripcion TURRIS FORTISSIMA NOMEN DNI.
#  - Cuerpo de las estrellas, cuerpo octogonal de la carraca, tambor y cupulin.
#  - El Giraldillo: la Fe con escudo-veleta (labaro) y palma.
#
# Fuentes: Wikipedia y webs de turismo de Sevilla. Alminar ~51 m, base cuadrada de
# ~13,6 m, altura ~97,5 m sin veleta y ~104 m con el Giraldillo. Las alturas de cada
# cuerpo renacentista, el numero y la posicion exacta de ventanas, el numero de
# rombos de la sebka y los colores son aproximados (foto frontal del usuario como
# referencia de color y proporcion). El interior (35 rampas) no se modela.
# Ejes: X = ancho, Y = profundidad (cara principal a Y negativo), Z = altura. Metros.
# Colores en valores lineales, como en Blender.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.65, bloom=0.04)
bpy.ops.render.set_lighting(intensity=1.35, angle=40)
bpy.ops.render.set_ssao(intensity=1.3)

def material(nombre, color, rugosidad=0.6, metalico=0.0, alfa=1.0, barniz=0.0, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
        if alfa < 1.0:
            bsdf.inputs["Alpha"].default_value = alfa
        if barniz > 0:
            bsdf.inputs["Coat Weight"].default_value = barniz
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

def aro(nombre, centro, radio, grosor, mat, tramos=12):
    # Anillo horizontal hecho con tramos rectos (el toro del motor gasta ~1000 triangulos)
    for i in range(tramos):
        a0 = 2 * math.pi * i / tramos
        a1 = 2 * math.pi * (i + 1) / tramos
        viga(nombre + "_" + str(i), (centro[0] + radio * math.cos(a0), centro[1] + radio * math.sin(a0), centro[2]), (centro[0] + radio * math.cos(a1), centro[1] + radio * math.sin(a1), centro[2]), grosor * 2, mat)

def aro_f(nombre, f, half, u, v, z, radio, grosor, mat, tramos=12):
    # Anillo en el plano de una cara (marcos de oculos y medallones)
    for i in range(tramos):
        a0 = 2 * math.pi * i / tramos
        a1 = 2 * math.pi * (i + 1) / tramos
        viga_f(nombre + "_" + str(i), f, half, u + radio * math.cos(a0), z + radio * math.sin(a0), u + radio * math.cos(a1), z + radio * math.sin(a1), v, grosor * 2, mat)

def viga(nombre, a, b, grosor, mat):
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dy * dy)
    largo = math.sqrt(horiz * horiz + dz * dz)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    return caja(nombre, centro, (largo, grosor, grosor), mat, rot=(0, -math.atan2(dz, horiz), math.atan2(dy, dx)))

# ==========================================
# 1. MATERIALES
# ==========================================
m_ladrillo = material("GI_Ladrillo", (0.50, 0.24, 0.13, 1.0), 0.88)
m_ladrillo.texture = "brick_mudejar"
m_ladrillo.texture_repeat = 10
m_relieve = material("GI_Ladrillo_Relieve", (0.58, 0.30, 0.16, 1.0), 0.85)
m_sombra = material("GI_Ladrillo_Sombra", (0.20, 0.085, 0.045, 1.0), 0.95)
m_hueco = material("GI_Hueco", (0.018, 0.014, 0.012, 1.0), 1.0)
m_piedra = material("GI_Sillares", (0.42, 0.36, 0.27, 1.0), 0.9)
m_piedra.texture = "stone_ashlar"
m_marmol = material("GI_Marmol", (0.70, 0.68, 0.62, 1.0), 0.35)
m_marmol.texture = "marble_carrara"
m_cal = material("GI_Cal_Renacentista", (0.74, 0.68, 0.54, 1.0), 0.8)
m_albero = material("GI_Albero", (0.58, 0.32, 0.085, 1.0), 0.75)
m_azulejo = material("GI_Azulejo", (0.05, 0.22, 0.13, 1.0), 0.25, barniz=0.6)
m_azulejo.texture = "andalusi_tiles"
m_hierro = material("GI_Hierro", (0.03, 0.03, 0.032, 1.0), 0.5, 0.6)
m_campana = material("GI_Bronce_Campanas", (0.16, 0.12, 0.045, 1.0), 0.45, 0.85)
m_bronce = material("GI_Bronce_Giraldillo", (0.10, 0.075, 0.035, 1.0), 0.4, 0.9)
m_oro = material("GI_Dorado", (0.80, 0.52, 0.14, 1.0), 0.25, 1.0)
m_rojo = material("GI_Almagra", (0.26, 0.035, 0.02, 1.0), 0.7)
m_suelo = material("GI_Pavimento", (0.30, 0.28, 0.25, 1.0), 0.9)

# ==========================================
# 2. AYUDAS POR CARA
# ==========================================
# Cara 0 mira a -Y, 1 a +X, 2 a +Y, 3 a -X. u = horizontal en la cara (hacia la
# derecha mirando la fachada), v = hacia fuera desde el plano, z = altura.
GX = 0.0
GY = 0.0
FN = [[0, -1], [1, 0], [0, 1], [-1, 0]]
FT = [[1, 0], [0, 1], [-1, 0], [0, -1]]
FR = [0.0, math.pi / 2, math.pi, -math.pi / 2]

def pf(f, half, u, v, z):
    n = FN[f]
    t = FT[f]
    return (GX + n[0] * (half + v) + t[0] * u, GY + n[1] * (half + v) + t[1] * u, z)

def caja_f(nombre, f, half, u, v, z, su, sv, sz, mat):
    return caja(nombre, pf(f, half, u, v, z), (su, sv, sz), mat, rot=(0, 0, FR[f]))

def disco_f(nombre, f, half, u, v, z, r, grosor, mat, vert=16):
    # Disco fino de 5 cm (primitive_circle_add: 4 triangulos por lado, sin anillos intermedios)
    bpy.ops.mesh.primitive_circle_add(vertices=vert, radius=r, location=pf(f, half, u, v, z), rotation=(math.pi / 2, 0, FR[f]))
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def viga_f(nombre, f, half, u0, z0, u1, z1, v, grosor, mat):
    return viga(nombre, pf(f, half, u0, v, z0), pf(f, half, u1, v, z1), grosor, mat)

def arco_f(nombre, f, half, u, z, r, v, grosor, mat, tramos=8, cz=1.0):
    # Rosca de arco de medio punto (o rebajado con cz < 1) hecha con tramos rectos
    for i in range(tramos):
        a0 = math.pi * i / tramos
        a1 = math.pi * (i + 1) / tramos
        viga_f(nombre + "_" + str(i), f, half, u + r * math.cos(a0), z + cz * r * math.sin(a0), u + r * math.cos(a1), z + cz * r * math.sin(a1), v, grosor, mat)

def hueco_lobulado(nombre, f, half, u, z0, ancho, alto, v, lobulos=5):
    # Vano oscuro con arco lobulado almohade: rectangulo + medio punto + lobulos
    r = ancho / 2
    zs = z0 + alto - r
    caja_f(nombre + "_Vano", f, half, u, v, (z0 + zs) / 2, ancho, 0.06, zs - z0, m_hueco)
    disco_f(nombre + "_Arco", f, half, u, v, zs, r, 0.06, m_hueco)
    for i in range(lobulos):
        a = math.pi * (i + 0.5) / lobulos
        disco_f(nombre + "_Lob" + str(i), f, half, u + r * 0.95 * math.cos(a), v, zs + r * 0.95 * math.sin(a), r * 0.2, 0.05, m_hueco, vert=8)

def hueco_herradura(nombre, f, half, u, z0, ancho, alto, v):
    # Vano con arco de herradura: el circulo es mas ancho que la luz del vano
    r = ancho * 0.58
    zs = z0 + alto - r * 1.35
    caja_f(nombre + "_Vano", f, half, u, v, (z0 + zs) / 2, ancho, 0.06, zs - z0, m_hueco)
    disco_f(nombre + "_Arco", f, half, u, v, zs + r * 0.35, r, 0.06, m_hueco)

def alfiz_f(nombre, f, half, u, z0, ancho, alto, v, mat):
    g = 0.22
    caja_f(nombre + "_AlfSup", f, half, u, v, z0 + alto - g / 2, ancho, 0.16, g, mat)
    caja_f(nombre + "_AlfInf", f, half, u, v, z0 + g / 2, ancho, 0.16, g, mat)
    caja_f(nombre + "_AlfIzq", f, half, u - ancho / 2 + g / 2, v, z0 + alto / 2, g, 0.16, alto, mat)
    caja_f(nombre + "_AlfDer", f, half, u + ancho / 2 - g / 2, v, z0 + alto / 2, g, 0.16, alto, mat)

def balcon_f(nombre, f, half, u, z, ancho):
    # Balcon renacentista: losa de piedra con barandilla de hierro
    caja_f(nombre + "_Losa", f, half, u, 0.42, z, ancho + 0.3, 0.84, 0.16, m_marmol)
    caja_f(nombre + "_Pasam", f, half, u, 0.78, z + 1.0, ancho + 0.2, 0.06, 0.06, m_hierro)
    caja_f(nombre + "_PasamI", f, half, u - ancho / 2 - 0.08, 0.42, z + 1.0, 0.06, 0.74, 0.06, m_hierro)
    caja_f(nombre + "_PasamD", f, half, u + ancho / 2 + 0.08, 0.42, z + 1.0, 0.06, 0.74, 0.06, m_hierro)
    n = 9
    for i in range(n):
        uu = u - ancho / 2 - 0.08 + (ancho + 0.16) * i / (n - 1)
        caja_f(nombre + "_Bar" + str(i), f, half, uu, 0.78, z + 0.54, 0.035, 0.035, 0.92, m_hierro)

def sebka_f(nombre, f, half, u0, u1, z0, z1, celda_w, celda_h, v, grosor, mat):
    # Red de rombos (sebka): rectas de pendiente +k y -k recortadas al rectangulo
    k = celda_h / celda_w
    W = u1 - u0
    n = int((z1 - z0 + k * W) / celda_h) + 2
    cnt = 0
    for j in range(n):
        c = z0 - k * W + j * celda_h
        ulo = u0 + (z0 - c) / k
        uhi = u0 + (z1 - c) / k
        if ulo < u0:
            ulo = u0
        if uhi > u1:
            uhi = u1
        if uhi - ulo > 0.08:
            viga_f(nombre + "_P" + str(cnt), f, half, ulo, c + k * (ulo - u0), uhi, c + k * (uhi - u0), v, grosor, mat)
            cnt = cnt + 1
    for j in range(n):
        c = z0 + j * celda_h
        ulo = u0 + (c - z1) / k
        uhi = u0 + (c - z0) / k
        if ulo < u0:
            ulo = u0
        if uhi > u1:
            uhi = u1
        if uhi - ulo > 0.08:
            viga_f(nombre + "_N" + str(cnt), f, half, ulo, c - k * (ulo - u0), uhi, c - k * (uhi - u0), v, grosor, mat)
            cnt = cnt + 1
    # Marco del pano
    caja_f(nombre + "_MarSup", f, half, (u0 + u1) / 2, v, z1, W + 0.3, 0.2, 0.25, mat)
    caja_f(nombre + "_MarIzq", f, half, u0, v, (z0 + z1) / 2, 0.25, 0.2, z1 - z0, mat)
    caja_f(nombre + "_MarDer", f, half, u1, v, (z0 + z1) / 2, 0.25, 0.2, z1 - z0, mat)

def arqueria_ciega_f(nombre, f, half, u0, u1, z0, alto, n):
    # Arcos lobulados ciegos sobre columnillas de marmol, base de cada pano de sebka
    paso = (u1 - u0) / n
    for i in range(n):
        uc = u0 + paso * (i + 0.5)
        caja_f(nombre + "_Fondo" + str(i), f, half, uc, 0.03, z0 + (alto - paso / 2) / 2, paso * 0.78, 0.06, alto - paso / 2, m_sombra)
        disco_f(nombre + "_Arc" + str(i), f, half, uc, 0.03, z0 + alto - paso / 2, paso * 0.39, 0.06, m_sombra, vert=12)
        arco_f(nombre + "_Rosca" + str(i), f, half, uc, z0 + alto - paso / 2, paso * 0.46, 0.1, 0.11, m_relieve, tramos=6)
        for l in range(3):
            a = math.pi * (l + 1) / 4
            disco_f(nombre + "_Lb" + str(i) + "_" + str(l), f, half, uc + paso * 0.36 * math.cos(a), 0.03, z0 + alto - paso / 2 + paso * 0.36 * math.sin(a), paso * 0.12, 0.05, m_sombra, vert=6)
    for i in range(n + 1):
        uc = u0 + paso * i
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.07, depth=alto - paso / 2, location=pf(f, half, uc, 0.1, z0 + (alto - paso / 2) / 2))
        col = bpy.context.active_object
        col.name = nombre + "_Col" + str(i)
        asignar_mat(col, m_marmol)

# ==========================================
# 3. CANA ALMOHADE (z 0 - 50.5)
# ==========================================
H = 6.8          # medio lado de la cana (13.6 m)
Z_CANA = 50.5

caja("GI_Pavimento", (0, 0, -0.15), (26.0, 26.0, 0.3), m_suelo)
caja("GI_Zocalo_Sillares", (0, 0, 1.3), (14.0, 14.0, 2.6), m_piedra)
caja("GI_Zocalo_Moldura", (0, 0, 2.65), (14.15, 14.15, 0.18), m_piedra)
# La cana va en cuatro tramos de ~12 m para que la textura de ladrillo no se estire
# (la textura se ajusta a cada cara de la caja: tramos casi cuadrados = ladrillo a escala)
for t in range(4):
    z0 = 2.6 + (Z_CANA - 2.6) * t / 4
    z1 = 2.6 + (Z_CANA - 2.6) * (t + 1) / 4
    caja("GI_Cana_Tramo" + str(t), (0, 0, (z0 + z1) / 2), (2 * H, 2 * H, z1 - z0 + 0.02), m_ladrillo)

# Puerta en la cara principal (acceso de la plaza)
hueco_herradura("GI_Puerta", 0, 7.0, 0.0, 0.0, 2.0, 3.6, 0.01)
alfiz_f("GI_Puerta", 0, 7.0, 0.0, -0.1, 3.1, 4.4, 0.02, m_piedra)

# Desfase de las ventanas en cada cara (las rampas interiores las escalonan)
DESFASE = [0.0, 1.6, 3.2, 0.8]
ZV = [6.5, 12.5, 18.5, 24.5, 30.5, 36.5]

for f in range(4):
    pre = "GI_C" + str(f)
    # Calle central: ventanas
    for i in range(6):
        z = ZV[i] + DESFASE[f]
        nm = pre + "_Ven" + str(i)
        # Recuadro rehundido de la calle central
        caja_f(nm + "_Rec", f, H, 0.0, 0.01, z + 1.9, 3.1, 0.04, 4.6, m_sombra)
        if i % 2 == 0:
            # Ventana sencilla de arco lobulado
            hueco_lobulado(nm, f, H, 0.0, z + 0.4, 1.0, 2.6, 0.04)
            arco_f(nm + "_Rosca", f, H, 0.0, z + 2.5, 0.62, 0.1, 0.16, m_relieve, tramos=7)
            alfiz_f(nm, f, H, 0.0, z - 0.1, 2.3, 3.9, 0.08, m_relieve)
        else:
            # Ajimez: dos arcos de herradura con columnilla de marmol
            hueco_herradura(nm + "_A", f, H, -0.52, z + 0.3, 0.82, 2.8, 0.04)
            hueco_herradura(nm + "_B", f, H, 0.52, z + 0.3, 0.82, 2.8, 0.04)
            cilindro(nm + "_Columnilla", pf(f, H, 0.0, 0.12, z + 1.3), 0.08, 2.0, m_marmol, vertices=8)
            caja_f(nm + "_Capitel", f, H, 0.0, 0.12, z + 2.35, 0.26, 0.26, 0.14, m_marmol)
            alfiz_f(nm, f, H, 0.0, z - 0.1, 2.6, 4.0, 0.08, m_relieve)
            balcon_f(nm + "_Balcon", f, H, 0.0, z + 0.2, 1.9)
    # Calles laterales: arquerias ciegas y dos pisos de sebka
    for s in range(2):
        lado = 2 * s - 1
        ua = lado * 2.6
        ub = lado * 6.0
        u0 = ua
        u1 = ub
        if lado < 0:
            u0 = ub
            u1 = ua
        nm = pre + "_Lat" + str(s)
        # Primer piso
        arqueria_ciega_f(nm + "_ArqA", f, H, u0, u1, 17.0, 2.6, 4)
        caja_f(nm + "_FondoA", f, H, (u0 + u1) / 2, 0.02, 25.4, u1 - u0, 0.04, 11.4, m_sombra)
        sebka_f(nm + "_SebA", f, H, u0, u1, 19.7, 31.1, 0.85, 1.25, 0.12, 0.17, m_relieve)
        # Segundo piso
        arqueria_ciega_f(nm + "_ArqB", f, H, u0, u1, 32.4, 2.4, 4)
        caja_f(nm + "_FondoB", f, H, (u0 + u1) / 2, 0.02, 39.9, u1 - u0, 0.04, 10.2, m_sombra)
        sebka_f(nm + "_SebB", f, H, u0, u1, 34.8, 45.0, 0.85, 1.25, 0.12, 0.17, m_relieve)
        # Imposta de ladrillo bajo la arqueria
        caja_f(nm + "_Imposta", f, H, (u0 + u1) / 2, 0.08, 16.85, u1 - u0 + 0.4, 0.16, 0.3, m_relieve)
    # Ventanas altas de la calle central, a la altura de la sebka superior
    hueco_lobulado(pre + "_VenAlta", f, H, 0.0, 42.0, 1.1, 2.6, 0.04)
    alfiz_f(pre + "_VenAlta", f, H, 0.0, 41.6, 2.4, 3.7, 0.08, m_relieve)
    # Banda de azulejo y friso de arcos entrecruzados bajo la cornisa
    caja_f(pre + "_Azulejo", f, H, 0.0, 0.03, 46.35, 13.6, 0.08, 0.5, m_azulejo)
    caja_f(pre + "_FrisoFondo", f, H, 0.0, 0.02, 48.3, 13.6, 0.04, 3.0, m_sombra)
    for i in range(15):
        uc = -6.3 + 0.9 * i
        arco_f(pre + "_Entrec" + str(i), f, H, uc, 47.9, 0.9, 0.1, 0.13, m_relieve, tramos=6, cz=1.5)
        if i % 2 == 0:
            cilindro(pre + "_EntCol" + str(i), pf(f, H, uc, 0.1, 47.3), 0.06, 1.2, m_marmol, vertices=6)
    caja_f(pre + "_Imposta_Friso", f, H, 0.0, 0.08, 46.75, 13.8, 0.16, 0.25, m_relieve)

# Cornisa almohade y terraza
caja("GI_Cornisa_Almohade", (0, 0, 50.15), (14.3, 14.3, 0.7), m_relieve)
caja("GI_Terraza", (0, 0, 50.65), (14.5, 14.5, 0.3), m_cal)

# Balaustrada de la terraza y jarras de azucenas en las esquinas
for f in range(4):
    pre = "GI_T" + str(f)
    caja_f(pre + "_Pasamano", f, 6.95, 0.0, 0.0, 51.95, 13.9, 0.32, 0.18, m_cal)
    caja_f(pre + "_Zocalo", f, 6.95, 0.0, 0.0, 50.9, 13.9, 0.3, 0.2, m_cal)
    for i in range(22):
        u = -5.9 + i * (11.8 / 21)
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.1, depth=0.85, location=pf(f, 6.95, u, 0.0, 51.43))
        b = bpy.context.active_object
        b.name = pre + "_Balaustre" + str(i)
        asignar_mat(b, m_albero)

ESQ = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
for e in range(4):
    sx = ESQ[e][0]
    sy = ESQ[e][1]
    x = sx * 6.75
    y = sy * 6.75
    pre = "GI_Jarra" + str(e)
    caja(pre + "_Pedestal", (x, y, 51.5), (0.9, 0.9, 1.4), m_cal)
    cono(pre + "_Pie", (x, y, 52.4), 0.42, 0.18, 0.4, m_bronce, vertices=12)
    esfera(pre + "_Panza", (x, y, 53.0), 0.5, m_bronce, escala=(1.0, 1.0, 0.85), segmentos=14, anillos=8)
    cono(pre + "_Cuello", (x, y, 53.6), 0.24, 0.42, 0.5, m_bronce, vertices=12)
    viga(pre + "_Asa1", (x + 0.45, y, 53.4), (x + 0.62, y, 52.9), 0.08, m_bronce)
    viga(pre + "_Asa2", (x - 0.45, y, 53.4), (x - 0.62, y, 52.9), 0.08, m_bronce)
    for k in range(5):
        a = 2 * math.pi * k / 5
        dx = 0.55 * math.cos(a)
        dy = 0.55 * math.sin(a)
        viga(pre + "_Tallo" + str(k), (x, y, 53.8), (x + dx, y + dy, 55.2), 0.05, m_bronce)
        cono(pre + "_Flor" + str(k), (x + dx * 1.1, y + dy * 1.1, 55.4), 0.08, 0.2, 0.35, m_oro, vertices=6)
    viga(pre + "_TalloC", (x, y, 53.8), (x, y, 55.9), 0.05, m_bronce)
    cono(pre + "_FlorC", (x, y, 56.05), 0.08, 0.22, 0.4, m_oro, vertices=6)

# ==========================================
# 4. CUERPO DE CAMPANAS (z 51 - 64.5)
# ==========================================
HB = 5.5
ZB0 = 50.8
ZB1 = 62.6
caja("GI_Campanas_Interior", (0, 0, (ZB0 + ZB1) / 2), (8.4, 8.4, ZB1 - ZB0), m_hueco)

def campana(nombre, pos, r, alto):
    cono(nombre + "_Cuerpo", (pos[0], pos[1], pos[2] - alto / 2), r, r * 0.55, alto, m_campana, vertices=14)
    esfera(nombre + "_Hombro", (pos[0], pos[1], pos[2]), r * 0.55, m_campana, escala=(1.0, 1.0, 0.6), segmentos=12, anillos=6)
    aro(nombre + "_Labio", (pos[0], pos[1], pos[2] - alto), r * 0.97, r * 0.07, m_campana, tramos=10)
    caja(nombre + "_Yugo", (pos[0], pos[1], pos[2] + r * 0.45), (r * 2.2, 0.25, 0.35), m_hierro)

VANOS = [[-3.4, 1.4, 56.4], [0.0, 3.0, 57.0], [3.4, 1.4, 56.4]]   # u, ancho, arranque del arco
for f in range(4):
    pre = "GI_B" + str(f)
    # Machones entre vanos
    pil = [[-5.0, 1.0], [-1.85, 0.7], [1.85, 0.7], [5.0, 1.0]]
    for i in range(4):
        caja_f(pre + "_Machon" + str(i), f, HB, pil[i][0], -0.45, (ZB0 + ZB1) / 2, pil[i][1], 0.9, ZB1 - ZB0, m_cal)
        caja_f(pre + "_Pilastra" + str(i), f, HB, pil[i][0], 0.08, (ZB0 + 1.4 + ZB1) / 2, pil[i][1] * 0.6, 0.18, ZB1 - ZB0 - 1.4, m_albero)
    for i in range(3):
        u = VANOS[i][0]
        w = VANOS[i][1]
        zs = VANOS[i][2]
        r = w / 2
        nm = pre + "_Vano" + str(i)
        # Antepecho
        caja_f(nm + "_Antepecho", f, HB, u, -0.45, ZB0 + 0.6, w, 0.9, 1.2, m_cal)
        # Enjutas escalonadas sobre el arco
        caja_f(nm + "_Sobrearco", f, HB, u, -0.45, (zs + r + ZB1) / 2, w, 0.9, ZB1 - zs - r, m_cal)
        for q in range(3):
            fr = 0.35 + 0.22 * q
            hq = r * (1.0 - math.sqrt(1.0 - fr * fr))
            ancho_q = r * (1.0 - fr) + 0.02
            zq = zs + r - hq / 2 - 0.0
            caja_f(nm + "_EnjI" + str(q), f, HB, u - r + ancho_q / 2, -0.45, zs + r * math.sqrt(1.0 - fr * fr) + (r - r * math.sqrt(1.0 - fr * fr)) / 2, ancho_q, 0.9, r - r * math.sqrt(1.0 - fr * fr) + 0.02, m_cal)
            caja_f(nm + "_EnjD" + str(q), f, HB, u + r - ancho_q / 2, -0.45, zs + r * math.sqrt(1.0 - fr * fr) + (r - r * math.sqrt(1.0 - fr * fr)) / 2, ancho_q, 0.9, r - r * math.sqrt(1.0 - fr * fr) + 0.02, m_cal)
        arco_f(nm + "_Rosca", f, HB, u, zs, r + 0.12, 0.05, 0.24, m_albero, tramos=10)
        # Campana colgada en el vano
        rc = 0.55
        hc = 1.0
        if i == 1:
            rc = 0.95
            hc = 1.6
        campana(nm + "_Campana", pf(f, HB, u, -0.5, zs - 0.1), rc, hc)
        # Oculo sobre los vanos laterales
        if i != 1:
            disco_f(nm + "_Oculo", f, HB, u, 0.02, 59.6, 0.42, 0.06, m_hueco)
            aro_f(nm + "_OculoMarco", f, HB, u, 0.06, 59.6, 0.48, 0.07, m_albero)
    # Balaustrada del vano central
    for k in range(7):
        cilindro(pre + "_BalC" + str(k), pf(f, HB, -1.2 + 0.4 * k, 0.05, ZB0 + 1.6), 0.07, 0.75, m_albero, vertices=6)
    caja_f(pre + "_BalCPas", f, HB, 0.0, 0.05, ZB0 + 2.0, 3.0, 0.2, 0.12, m_cal)
    # Entablamento: arquitrabe, friso de almagra y cornisa
    caja_f(pre + "_Arquitrabe", f, HB, 0.0, 0.1, 62.9, 11.6, 0.3, 0.6, m_cal)
    caja_f(pre + "_Friso", f, HB, 0.0, 0.08, 63.55, 11.4, 0.2, 0.7, m_rojo)
    for k in range(8):
        disco_f(pre + "_Roseta" + str(k), f, HB, -4.9 + 1.4 * k, 0.2, 63.55, 0.18, 0.06, m_albero, vert=8)

caja("GI_Campanas_Cornisa", (0, 0, 64.15), (12.4, 12.4, 0.5), m_albero)
caja("GI_Campanas_Cubierta", (0, 0, 64.5), (11.6, 11.6, 0.2), m_cal)

# Pinaculos (flameros) de las esquinas del cuerpo de campanas
for e in range(4):
    x = ESQ[e][0] * 5.8
    y = ESQ[e][1] * 5.8
    pre = "GI_PinB" + str(e)
    caja(pre + "_Base", (x, y, 65.1), (0.8, 0.8, 1.0), m_cal)
    cono(pre + "_Aguja", (x, y, 66.9), 0.38, 0.05, 2.6, m_albero, vertices=8)
    esfera(pre + "_Bola", (x, y, 68.3), 0.18, m_oro, segmentos=8, anillos=6)

# ==========================================
# 5. CUERPO DEL RELOJ (z 64.6 - 72.4)
# ==========================================
HR = 4.4
caja("GI_Reloj", (0, 0, 68.3), (2 * HR, 2 * HR, 7.4), m_cal)
LETRAS = 22
for f in range(4):
    pre = "GI_R" + str(f)
    for s in range(2):
        u = (2 * s - 1) * 3.95
        caja_f(pre + "_Pilastra" + str(s), f, HR, u, 0.1, 67.9, 0.7, 0.2, 6.6, m_albero)
    hueco_lobulado(pre + "_Vano", f, HR, 0.0, 65.6, 2.2, 4.0, 0.02, lobulos=1)
    arco_f(pre + "_Rosca", f, HR, 0.0, 68.5, 1.22, 0.08, 0.22, m_albero, tramos=10)
    caja_f(pre + "_Imposta", f, HR, 0.0, 0.06, 68.5, 7.2, 0.12, 0.18, m_albero)
    for s in range(2):
        disco_f(pre + "_Medallon" + str(s), f, HR, (2 * s - 1) * 2.4, 0.04, 70.0, 0.55, 0.08, m_azulejo)
        aro_f(pre + "_MedMarco" + str(s), f, HR, (2 * s - 1) * 2.4, 0.08, 70.0, 0.6, 0.07, m_albero)
    # Friso con la inscripcion TURRIS FORTISSIMA NOMEN DNI (letras doradas sobre almagra)
    caja_f(pre + "_Inscripcion", f, HR, 0.0, 0.08, 71.6, 8.6, 0.16, 0.8, m_rojo)
    for k in range(LETRAS):
        if k % 7 != 6:
            caja_f(pre + "_Letra" + str(k), f, HR, -3.8 + 7.6 * k / (LETRAS - 1), 0.18, 71.6, 0.2, 0.05, 0.5, m_oro)
caja("GI_Reloj_Cornisa", (0, 0, 72.25), (9.6, 9.6, 0.5), m_albero)
caja("GI_Reloj_Cubierta", (0, 0, 72.6), (9.2, 9.2, 0.2), m_cal)
for f in range(4):
    pre = "GI_RB" + str(f)
    caja_f(pre + "_Pasamano", f, 4.5, 0.0, 0.0, 73.55, 9.0, 0.22, 0.14, m_cal)
    for i in range(15):
        cilindro(pre + "_Bal" + str(i), pf(f, 4.5, -3.9 + i * (7.8 / 14), 0.0, 73.1), 0.07, 0.75, m_albero, vertices=6)
for e in range(4):
    x = ESQ[e][0] * 4.5
    y = ESQ[e][1] * 4.5
    caja("GI_PinR" + str(e) + "_Base", (x, y, 73.3), (0.6, 0.6, 1.2), m_cal)
    cono("GI_PinR" + str(e) + "_Aguja", (x, y, 74.85), 0.28, 0.04, 1.9, m_albero, vertices=8)
    esfera("GI_PinR" + str(e) + "_Bola", (x, y, 75.9), 0.14, m_oro, segmentos=8, anillos=6)

# ==========================================
# 6. CUERPO DE LAS ESTRELLAS (z 72.7 - 80.5)
# ==========================================
HE = 3.4
caja("GI_Estrellas", (0, 0, 76.6), (2 * HE, 2 * HE, 7.8), m_cal)
for f in range(4):
    pre = "GI_E" + str(f)
    for s in range(2):
        u = (2 * s - 1) * 3.0
        caja_f(pre + "_Pilastra" + str(s), f, HE, u, 0.1, 76.4, 0.6, 0.2, 7.0, m_albero)
    # Vano central con arco
    hueco_lobulado(pre + "_Vano", f, HE, 0.0, 74.0, 1.6, 3.6, 0.02, lobulos=1)
    arco_f(pre + "_Rosca", f, HE, 0.0, 76.8, 0.9, 0.08, 0.2, m_albero, tramos=8)
    # Estrellas de ocho puntas (dos cuadrados girados) en el friso
    for s in range(3):
        u = -1.8 + 1.8 * s
        p = pf(f, HE, u, 0.08, 79.2)
        caja(pre + "_Estrella" + str(s) + "_A", p, (0.55, 0.12, 0.55), m_albero, rot=(0, 0, FR[f]))
        caja(pre + "_Estrella" + str(s) + "_B", p, (0.55, 0.12, 0.55), m_albero, rot=(0, math.pi / 4, FR[f]))
        disco_f(pre + "_EstCentro" + str(s), f, HE, u, 0.16, 79.2, 0.14, 0.06, m_oro, vert=8)
caja("GI_Estrellas_Cornisa", (0, 0, 80.6), (7.6, 7.6, 0.45), m_albero)
caja("GI_Estrellas_Cubierta", (0, 0, 80.9), (7.2, 7.2, 0.2), m_cal)
for e in range(4):
    x = ESQ[e][0] * 3.5
    y = ESQ[e][1] * 3.5
    caja("GI_PinE" + str(e) + "_Base", (x, y, 81.4), (0.5, 0.5, 0.9), m_cal)
    cono("GI_PinE" + str(e) + "_Aguja", (x, y, 82.6), 0.22, 0.03, 1.5, m_albero, vertices=8)
    esfera("GI_PinE" + str(e) + "_Bola", (x, y, 83.45), 0.12, m_oro, segmentos=8, anillos=6)

# ==========================================
# 7. CUERPO DE LA CARRACA (octogonal), TAMBOR Y CUPULIN (z 81 - 97.5)
# ==========================================
cilindro("GI_Carraca", (0, 0, 84.1), 2.9, 6.2, m_cal, vertices=8, rot=(0, 0, math.pi / 8))
for k in range(8):
    a = 2 * math.pi * k / 8
    ap = a + math.pi / 8
    # Pilastras en las aristas
    caja("GI_Carraca_Pilastra" + str(k), (2.72 * math.cos(ap), 2.72 * math.sin(ap), 84.1), (0.32, 0.32, 6.0), m_albero, rot=(0, 0, ap))
    # Ventanitas en cada lado
    cx = 2.7 * math.cos(a)
    cy = 2.7 * math.sin(a)
    caja("GI_Carraca_Vano" + str(k), (cx, cy, 83.6), (0.12, 0.9, 2.2), m_hueco, rot=(0, 0, a))
    cilindro("GI_Carraca_VanoArco" + str(k), (cx, cy, 84.7), 0.45, 0.12, m_hueco, vertices=12, rot=(math.pi / 2, 0, a + math.pi / 2))
cilindro("GI_Carraca_Cornisa", (0, 0, 87.4), 3.25, 0.5, m_albero, vertices=8, rot=(0, 0, math.pi / 8))
cilindro("GI_Tambor", (0, 0, 88.9), 2.3, 2.6, m_cal, vertices=16)
for k in range(8):
    a = 2 * math.pi * k / 8
    caja("GI_Tambor_Vano" + str(k), (2.28 * math.cos(a), 2.28 * math.sin(a), 88.9), (0.1, 0.5, 1.4), m_hueco, rot=(0, 0, a))
aro("GI_Tambor_Anillo", (0, 0, 90.2), 2.3, 0.14, m_albero)
esfera("GI_Cupulin", (0, 0, 90.2), 2.3, m_azulejo, escala=(1.0, 1.0, 1.25), segmentos=20, anillos=12)
for k in range(8):
    a = 2 * math.pi * k / 8
    # Nervios del cupulin
    for q in range(4):
        t0 = math.pi / 2 * q / 4
        t1 = math.pi / 2 * (q + 1) / 4
        viga("GI_Nervio" + str(k) + "_" + str(q), (2.33 * math.cos(t0) * math.cos(a), 2.33 * math.cos(t0) * math.sin(a), 90.2 + 2.9 * math.sin(t0)), (2.33 * math.cos(t1) * math.cos(a), 2.33 * math.cos(t1) * math.sin(a), 90.2 + 2.9 * math.sin(t1)), 0.12, m_albero)
cilindro("GI_Linterna", (0, 0, 93.6), 0.7, 1.4, m_cal, vertices=12)
cono("GI_Linterna_Tejadillo", (0, 0, 94.65), 0.85, 0.3, 0.7, m_albero, vertices=12)
cilindro("GI_Pedestal_Giraldillo", (0, 0, 95.5), 0.32, 1.0, m_bronce, vertices=10)
esfera("GI_Globo", (0, 0, 96.5), 0.62, m_oro, segmentos=14, anillos=10)
cilindro("GI_Peana", (0, 0, 97.3), 0.4, 0.4, m_bronce, vertices=10)

# ==========================================
# 8. EL GIRALDILLO (z 97.5 - 104)
# ==========================================
# Figura femenina de la Fe con tunica, casco, escudo-veleta (labaro) y palma.
cono("GI_Gir_Tunica", (0, 0, 99.0), 0.75, 0.3, 2.6, m_bronce, vertices=14)
cilindro("GI_Gir_Torso", (0, 0, 100.75), 0.3, 1.0, m_bronce, vertices=12)
esfera("GI_Gir_Pecho", (0, -0.05, 100.95), 0.32, m_bronce, escala=(1.0, 0.8, 0.9), segmentos=12, anillos=8)
esfera("GI_Gir_Cabeza", (0, 0, 101.55), 0.22, m_bronce, segmentos=12, anillos=8)
cono("GI_Gir_Casco", (0, 0, 101.8), 0.24, 0.05, 0.35, m_bronce, vertices=10)
cono("GI_Gir_Penacho", (0, 0.1, 102.05), 0.08, 0.02, 0.3, m_oro, vertices=6)
# Brazo derecho alzado con el asta del labaro
viga("GI_Gir_BrazoD", (0.28, 0, 101.1), (0.65, 0, 101.9), 0.14, m_bronce)
viga("GI_Gir_Asta", (0.7, 0, 98.8), (0.7, 0, 104.1), 0.07, m_bronce)
esfera("GI_Gir_Remate", (0.7, 0, 104.15), 0.1, m_oro, segmentos=8, anillos=6)
# Escudo-veleta: plancha alta con orla dorada (hace de veleta)
caja("GI_Gir_Labaro", (1.45, 0, 102.6), (1.4, 0.06, 2.2), m_bronce)
caja("GI_Gir_LabaroOrlaS", (1.45, 0, 103.72), (1.5, 0.08, 0.08), m_oro)
caja("GI_Gir_LabaroOrlaI", (1.45, 0, 101.48), (1.5, 0.08, 0.08), m_oro)
caja("GI_Gir_LabaroOrlaE", (2.17, 0, 102.6), (0.08, 0.08, 2.3), m_oro)
cilindro("GI_Gir_LabaroCruz", (1.45, 0, 102.7), 0.28, 0.1, m_oro, vertices=12, rot=(math.pi / 2, 0, 0))
# Brazo izquierdo con la palma
viga("GI_Gir_BrazoI", (-0.28, 0, 101.1), (-0.6, -0.1, 100.4), 0.13, m_bronce)
viga("GI_Gir_Palma", (-0.62, -0.1, 100.2), (-0.85, -0.15, 102.3), 0.05, m_bronce)
for k in range(5):
    z = 101.0 + 0.3 * k
    viga("GI_Gir_HojaI" + str(k), (-0.73 + 0.025 * k, -0.12, z), (-1.0, -0.12, z + 0.25), 0.04, m_bronce)
    viga("GI_Gir_HojaD" + str(k), (-0.73 + 0.025 * k, -0.12, z), (-0.5, -0.12, z + 0.25), 0.04, m_bronce)
