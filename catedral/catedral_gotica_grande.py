import bpy
import math

# ============ Limpieza de la escena ============
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ============ Materiales ============
def material(nombre, color, rugosidad=0.8, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Roughness"].default_value = rugosidad
    if emision > 0.0:
        bsdf.inputs["Emission Color"].default_value = (color[0], color[1], color[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emision
    return mat

# ============ Primitivas ============
def caja(nombre, centro, tamano, mat, rot=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = tamano
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    return obj

def cilindro(nombre, centro, radio, alto, mat):
    bpy.ops.mesh.primitive_cylinder_add(radius=radio, depth=alto, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.data.materials.append(mat)
    return obj

def cono(nombre, centro, radio, alto, vertices, mat, rot=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cone_add(radius1=radio, radius2=0.0, depth=alto, vertices=vertices, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    return obj

def esfera(nombre, centro, radio, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.data.materials.append(mat)
    return obj

def arbol(nombre, x, y, alto, mat_copa, mat_tronco):
    cilindro(nombre + "_Tronco", (x, y, alto / 2.0), 0.25, alto, mat_tronco)
    bpy.ops.mesh.primitive_ico_sphere_add(radius=1.5, subdivisions=2, location=(x, y, alto + 0.8))
    copa = bpy.context.active_object
    copa.name = nombre + "_Copa"
    copa.data.materials.append(mat_copa)

# ============ Paredes por capas, con huecos ============
# huecos: lista ordenada de (u_ini, u_fin, z_ini, z_fin)
def segmento(lado, plano, a, b, z0, alto, grosor, mat):
    centro_u = (a + b) / 2.0
    largo = b - a
    if lado == 'x':
        caja("Muro", (centro_u, plano, z0 + alto / 2.0), (largo, grosor, alto), mat)
    else:
        caja("Muro", (plano, centro_u, z0 + alto / 2.0), (grosor, largo, alto), mat)

def muro(lado, plano, u0, u1, z0, capas, alto, huecos, mat_a, mat_b, grosor=0.3):
    for i in range(capas):
        z = z0 + i * alto
        zc = z + alto / 2.0
        mat = mat_a if i % 2 == 0 else mat_b
        cortes = []
        for h in huecos:
            if h[2] <= zc and zc <= h[3]:
                cortes.append(h)
        pos = u0
        for h in cortes:
            if h[0] > pos:
                segmento(lado, plano, pos, h[0], z, alto, grosor, mat)
            pos = max(pos, h[1])
        if pos < u1:
            segmento(lado, plano, pos, u1, z, alto, grosor, mat)

# ============ Tejados ============
# mitad: semiancho del tejado en X (incluye voladizo). Cumbrera en x=0.
def techo_dos_aguas(mitad, alero_z, cumbrera_z, largo_y, mat, grosor=0.24):
    subida = cumbrera_z - alero_z
    L = math.sqrt(mitad * mitad + subida * subida)
    ang = math.atan(subida / mitad)
    sx = math.sin(ang)
    cz = math.cos(ang)
    zc = (cumbrera_z + alero_z) / 2.0
    xc = mitad / 2.0
    caja("TechoIzq", (-(xc + sx * grosor / 2.0), 0.0, zc + cz * grosor / 2.0), (L + 0.1, largo_y, grosor), mat, (0.0, -ang, 0.0))
    caja("TechoDer", (xc + sx * grosor / 2.0, 0.0, zc + cz * grosor / 2.0), (L + 0.1, largo_y, grosor), mat, (0.0, ang, 0.0))
    caja("Cumbrera", (0.0, 0.0, cumbrera_z + 0.05), (0.5, largo_y, 0.2), mat)

# Frontones triangulares (se construyen con capas escalonadas bajo el tejado)
def fronton(plano, mitad, alero_z, cumbrera_z, ancho_pared, mat_a, mat_b, grosor=0.3):
    subida = cumbrera_z - alero_z
    n = int(round(subida / 0.3))
    for k in range(n):
        zc = alero_z + k * 0.3 + 0.15
        media = min(ancho_pared / 2.0, mitad * (cumbrera_z - zc) / subida)
        if media > 0.2:
            mat = mat_a if k % 2 == 0 else mat_b
            caja("Fronton", (0.0, plano, zc), (2.0 * media, grosor, 0.3), mat)

# Distancia angular mínima entre dos ángulos en grados
def dist_angulo(a, b):
    return abs((a - b + 540.0) % 360.0 - 180.0)

# Catedral gótica grande con interior transitable.
# Escala aproximada real: nave de 60 m de largo, 10 m de ancho interior,
# 30 m de altura en la nave, torres de unos 80 m.
# Entrada: pórtico central de la fachada occidental (y = -30), sin puertas que bloqueen el paso.

# ----- Dimensiones (en metros) -----
L = 30.0          # media longitud de la nave (y de -30 a 30)
W = 5.0           # media anchura de la nave (x de -5 a 5)
A = 11.0          # media anchura exterior de las naves laterales
HN = 30.0         # altura de los muros de la nave
HA = 15.0         # altura de los muros de las naves laterales
RH = 38.0         # altura de la cumbrera
FX = 17.5         # media anchura de la fachada occidental
TY = -29.0        # posición en y de las torres
TX = 14.5         # posición en x de las torres
BAHIAS = [-24.0, -16.0, -8.0, 0.0, 8.0, 16.0, 24.0]

piedra_clara = material("PiedraClara", (0.72, 0.68, 0.60), 0.90)
piedra = material("Piedra", (0.56, 0.53, 0.48), 0.92)
piedra_osc = material("PiedraOscura", (0.40, 0.38, 0.35), 0.95)
pizarra = material("Pizarra", (0.20, 0.21, 0.25), 0.60)
vidrio_azul = material("VidrioAzul", (0.15, 0.25, 0.65), 0.05)
vidrio_rojo = material("VidrioRojo", (0.65, 0.12, 0.10), 0.05)
vidrio_ambar = material("VidrioAmbar", (0.80, 0.55, 0.15), 0.05)
banco = material("Banco", (0.42, 0.27, 0.14), 0.60)
suelo = material("LosasSuelo", (0.50, 0.46, 0.42), 0.80)
alfombra = material("Alfombra", (0.50, 0.10, 0.12), 0.90)
hierro = material("Hierro", (0.25, 0.25, 0.27), 0.40)
hierba = material("Hierba", (0.22, 0.48, 0.16), 1.00)
cirio = material("Cirio", (1.00, 0.70, 0.30), 0.30, 8.0)

# ----- Funciones propias -----
# Barra inclinada en un plano XZ (y fijo); su grosor va en la normal del plano.
def barra_xz(x1, z1, x2, z2, y, ancho, grosor, mat):
    dx = x2 - x1
    dz = z2 - z1
    L2 = math.sqrt(dx * dx + dz * dz)
    ry = math.atan2(-dz, dx)
    caja("Barra", ((x1 + x2) / 2.0, y, (z1 + z2) / 2.0), (L2, ancho, grosor), mat, (0.0, ry, 0.0))

# Barra en un plano YZ (x fijo), para los arcos apuntados de la arcada y las vidrieras
def barra_yz(y1, z1, y2, z2, x, ancho, grosor, mat):
    dy = y2 - y1
    dz = z2 - z1
    L2 = math.sqrt(dy * dy + dz * dz)
    phi = math.atan2(dz, dy)
    caja("Arco", (x, (y1 + y2) / 2.0, (z1 + z2) / 2.0), (grosor, L2, ancho), mat, (phi, 0.0, 0.0))

# Disco (rosetón, aro) orientado a medida
def disco(nombre, centro, radio, grosor, mat, rot):
    bpy.ops.mesh.primitive_cylinder_add(radius=radio, depth=grosor, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    return obj

# ----- Terreno, plaza, escalón y suelos -----
caja("Terreno", (0, 0, -0.05), (140, 140, 0.1), hierba)
caja("Plaza", (0, -44.0, 0.02), (40, 20, 0.06), piedra_clara)
caja("Escalon", (0, -30.9, 0.05), (7.0, 1.2, 0.1), piedra_clara)
caja("Suelo", (0, 0, 0.05), (2 * A - 0.8, 2 * L, 0.1), suelo)
cilindro("SueloApside", (0, L, 0.05), W, 0.1, suelo)
caja("Alfombra", (0, 0, 0.12), (2.4, 2 * L - 4.0, 0.04), alfombra)

# ----- Fachada occidental con pórtico abierto (x de -1.6 a 1.6, z de 0 a 6) -----
muro('x', -L, -FX, FX, 0.0, 15, 2.0, [(-1.6, 1.6, 0.0, 6.0)], piedra, piedra_clara, 0.8)
fronton(-30.3, W + 0.5, HN, RH, 11.0, piedra, piedra_clara, 0.8)

# Arco apuntado del pórtico
barra_xz(-1.6, 6.0, 0.0, 7.6, -30.9, 0.6, 0.6, piedra_clara)
barra_xz(0.0, 7.6, 1.6, 6.0, -30.9, 0.6, 0.6, piedra_clara)

# Rosetón con radios, tracería y aro
disco("Rosetón", (0, -30.7, 22.0), 4.0, 0.3, vidrio_azul, (math.pi / 2.0, 0.0, 0.0))
disco("Aro", (0, -30.6, 22.0), 4.2, 0.1, piedra_clara, (math.pi / 2.0, 0.0, 0.0))
for k in range(8):
    rr = k * 0.3927
    caja("Radio", (0, -30.8, 22.0), (8.0, 0.15, 0.15), piedra_clara, (0.0, rr, 0.0))
for k in range(12):
    ang = k * 0.5236
    mat_t = vidrio_azul
    if k % 2 == 1:
        mat_t = vidrio_ambar
    caja("Tracería", (3.0 * math.cos(ang), -30.8, 22.0 + 3.0 * math.sin(ang)), (0.9, 0.15, 0.9), mat_t)

# Lancetas con arco apuntado
for x in [-3.6, 3.6]:
    caja("Lanceta", (x, -30.75, 12.0), (1.4, 0.12, 6.0), vidrio_rojo)
    barra_xz(x - 0.7, 15.0, x, 16.4, -30.8, 0.4, 0.4, piedra_clara)
    barra_xz(x, 16.4, x + 0.7, 15.0, -30.8, 0.4, 0.4, piedra_clara)
for x in [-7.6, 7.6]:
    caja("Lanceta", (x, -30.75, 12.0), (1.4, 0.12, 6.0), vidrio_ambar)

# ----- Torres occidentales (y = -29) con campanarios y agujas -----
for s in [-1.0, 1.0]:
    tx = s * TX
    caja("Torre1", (tx, TY, 18.0), (6.0, 6.0, 36.0), piedra)
    caja("Torre2", (tx, TY, 43.0), (5.0, 5.0, 14.0), piedra_clara)
    caja("Vitral", (tx, TY - 2.6, 42.0), (1.4, 0.1, 6.0), vidrio_azul)
    caja("Vitral", (tx + s * 2.6, TY, 42.0), (0.1, 1.4, 6.0), vidrio_ambar)
    caja("Campanario", (tx, TY, 55.0), (4.2, 4.2, 10.0), piedra)
    caja("Hueco", (tx, TY - 2.2, 55.0), (1.6, 0.12, 6.0), piedra_osc)
    caja("Hueco", (tx, TY + 2.2, 55.0), (1.6, 0.12, 6.0), piedra_osc)
    caja("Hueco", (tx + s * 2.2, TY, 55.0), (0.12, 1.6, 6.0), piedra_osc)
    cono("Aguja", (tx, TY, 70.0), 2.9, 20.0, 4, pizarra, (0.0, 0.0, 0.7854))
    for dx in [-2.1, 2.1]:
        for dy in [-2.1, 2.1]:
            cono("Pinaculo", (tx + dx, TY + dy, 61.2), 0.4, 2.4, 4, pizarra)

# ----- Muros: nave (solo por encima de la arcada, z de 17.5 a 30) y naves laterales -----
for s in [-1.0, 1.0]:
    muro('y', s * W, -L, L, 17.5, 6, 2.1, [], piedra, piedra_clara, 0.8)
    muro('y', s * A, -L, L, 0.0, 3, 5.0, [], piedra, piedra_clara, 0.8)

# Vidrieras de la nave (en la cara interior del muro) y ventanas de las naves laterales
for s in [-1.0, 1.0]:
    for k in range(7):
        y = BAHIAS[k]
        mat_v = vidrio_azul
        if k % 3 == 1:
            mat_v = vidrio_rojo
        if k % 3 == 2:
            mat_v = vidrio_ambar
        caja("Vidriera", (s * 4.6, y, 25.0), (0.06, 2.0, 6.0), mat_v)
        barra_yz(y - 1.0, 28.0, y, 29.4, s * 4.6, 0.25, 0.25, piedra_clara)
        barra_yz(y, 29.4, y + 1.0, 28.0, s * 4.6, 0.25, 0.25, piedra_clara)
        caja("VentanaLateral", (s * 11.42, y, 7.5), (0.1, 2.2, 5.0), vidrio_azul)
        caja("VentanaLateral", (s * 10.58, y, 7.5), (0.1, 2.2, 5.0), vidrio_azul)

# ----- Cubiertas -----
techo_dos_aguas(W + 0.5, HN, RH, 2 * L, pizarra, 0.5)
for s in [-1.0, 1.0]:
    barra_xz(s * 4.8, 17.2, s * 11.2, 15.0, 0.0, 2 * L, 0.4, pizarra)

# ----- Arcada: pilares, capiteles y arcos apuntados -----
for s in [-1.0, 1.0]:
    for y in BAHIAS:
        cilindro("Pilar", (s * W, y, 8.75), 0.8, 17.5, piedra_clara)
        caja("Capitel", (s * W, y, 17.7), (2.0, 2.0, 0.5), piedra)
        esfera("Cirio", (s * 4.1, y, 10.0), 0.15, cirio)
    for k in range(6):
        y1 = BAHIAS[k]
        y2 = BAHIAS[k + 1]
        ym = (y1 + y2) / 2.0
        barra_yz(y1, 18.0, ym, 21.0, s * W, 0.6, 0.6, piedra_clara)
        barra_yz(ym, 21.0, y2, 18.0, s * W, 0.6, 0.6, piedra_clara)

# ----- Arbotantes con pináculos y gárgolas -----
for s in [-1.0, 1.0]:
    for y in BAHIAS:
        caja("Contrafuerte", (s * 14.0, y, 11.0), (2.0, 2.0, 22.0), piedra)
        cono("Pinaculo", (s * 14.0, y, 23.2), 0.7, 2.4, 4, pizarra)
        barra_xz(s * 13.0, 20.2, s * 5.5, 26.2, y, 1.2, 1.2, piedra)
        cono("Gargola", (s * 10.6, y, 15.45), 0.3, 0.9, 4, piedra_osc)

# ----- Cimborrio central y aguja (más bajo que las torres) -----
caja("Cimborrio", (0, 0, RH + 5.0), (4.2, 4.2, 10.0), piedra)
caja("Vitral", (0, -2.17, 43.0), (1.6, 0.1, 5.0), vidrio_ambar)
caja("Vitral", (0, 2.17, 43.0), (1.6, 0.1, 5.0), vidrio_ambar)
caja("Vitral", (-2.17, 0, 43.0), (0.1, 1.6, 5.0), vidrio_azul)
caja("Vitral", (2.17, 0, 43.0), (0.1, 1.6, 5.0), vidrio_azul)
cono("AgujaCentral", (0, 0, 51.5), 2.6, 7.0, 4, pizarra, (0.0, 0.0, 0.7854))
for dx in [-1.8, 1.8]:
    for dy in [-1.8, 1.8]:
        cono("Pinaculo", (dx, dy, 49.2), 0.35, 2.0, 4, pizarra)

# ----- Ábside semicircular (radio 5, centro en y = 30) -----
for i in range(13):
    a = i * 15.0
    rad = math.radians(a)
    px = W * math.cos(rad)
    py = L + W * math.sin(rad)
    rot = (0.0, 0.0, rad + math.pi / 2.0)
    if i == 3 or i == 5 or i == 7 or i == 9:
        caja("Muro", (px, py, 6.5), (1.6, 0.8, 13.0), piedra, rot)
        caja("Vidriera", (px, py, 19.5), (1.2, 0.12, 13.0), vidrio_ambar, rot)
        caja("Muro", (px, py, 28.0), (1.6, 0.8, 4.0), piedra, rot)
    else:
        caja("Muro", (px, py, 15.0), (1.6, 0.8, 30.0), piedra, rot)
cono("AbsideTecho", (0.0, L, HN + 3.0), W + 0.6, 6.0, 16, pizarra)

# Cierre de las naves laterales al final del ábside
for s in [-1.0, 1.0]:
    caja("Cierre", (s * 8.0, L, 7.5), (6.0, 0.8, 15.0), piedra)

# ----- Interior: bancos, altar y lámparas -----
for k in range(16):
    y = -22.0 + k * 2.8
    for xc in [-7.8, -2.6, 2.6, 7.8]:
        caja("Banco", (xc, y, 0.5), (2.0, 0.7, 0.1), banco)
        caja("Respaldo", (xc, y + 0.3, 0.95), (2.0, 0.1, 0.8), banco)

caja("Altar", (0, 26.0, 0.5), (4.0, 2.4, 1.0), piedra_clara)
caja("Mantel", (0, 26.0, 1.05), (2.8, 1.6, 0.1), alfombra)
caja("Retablo", (0, 29.4, 3.0), (4.0, 0.3, 4.0), piedra_clara)
for y in [-20.0, -10.0, 0.0, 10.0, 20.0]:
    cilindro("Cadena", (0, y, 30.0), 0.06, 10.0, hierro)
    esfera("Lampara", (0, y, 24.5), 0.6, cirio)

print("Catedral gótica grande creada")
