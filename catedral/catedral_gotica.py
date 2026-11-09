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

# Catedral gótica: nave con naves laterales, arbotantes, pilares apuntados,
# rosetón y lancetas en la fachada, dos torres con agujas, cimborrio central
# y ábside semicircular. Escala real aproximada: 44 m de largo, 18 m de ancho,
# torres de unos 60 m.

piedra_clara = material("PiedraClara", (0.72, 0.68, 0.60), 0.90)
piedra = material("Piedra", (0.56, 0.53, 0.48), 0.92)
piedra_osc = material("PiedraOscura", (0.40, 0.38, 0.35), 0.95)
pizarra = material("Pizarra", (0.20, 0.21, 0.25), 0.60)
vidrio_azul = material("VidrioAzul", (0.15, 0.25, 0.65), 0.05)
vidrio_rojo = material("VidrioRojo", (0.65, 0.12, 0.10), 0.05)
vidrio_ambar = material("VidrioAmbar", (0.80, 0.55, 0.15), 0.05)
roble = material("RobleOscuro", (0.30, 0.19, 0.10), 0.70)
banco = material("Banco", (0.42, 0.27, 0.14), 0.60)
suelo = material("LosasSuelo", (0.50, 0.46, 0.42), 0.80)
alfombra = material("Alfombra", (0.50, 0.10, 0.12), 0.90)
hierro = material("Hierro", (0.25, 0.25, 0.27), 0.40)
oro = material("Oro", (0.85, 0.65, 0.25), 0.25)
hierba = material("Hierba", (0.22, 0.48, 0.16), 1.00)
cirio = material("Cirio", (1.00, 0.70, 0.30), 0.30, 8.0)

# ----- Funciones propias de la catedral -----
# Barra o losa inclinada en un plano XZ (y fijo). Su grosor va en la normal del plano.
def barra_xz(x1, z1, x2, z2, y, ancho, grosor, mat):
    dx = x2 - x1
    dz = z2 - z1
    L = math.sqrt(dx * dx + dz * dz)
    ry = math.atan2(-dz, dx)
    caja("Barra", ((x1 + x2) / 2.0, y, (z1 + z2) / 2.0), (L, ancho, grosor), mat, (0.0, ry, 0.0))

# Barra en un plano YZ (x fijo), usada para los arcos de la arcada y de la nave
def barra_yz(y1, z1, y2, z2, x, ancho, grosor, mat):
    dy = y2 - y1
    dz = z2 - z1
    L = math.sqrt(dy * dy + dz * dz)
    phi = math.atan2(dz, dy)
    caja("Arco", (x, (y1 + y2) / 2.0, (z1 + z2) / 2.0), (grosor, L, ancho), mat, (phi, 0.0, 0.0))

# Disco o cilindro orientado a medida (rosetón)
def disco(nombre, centro, radio, grosor, mat, rot):
    bpy.ops.mesh.primitive_cylinder_add(radius=radio, depth=grosor, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    return obj

# ----- Terreno, plaza y suelo -----
caja("Terreno", (0, 0, -0.05), (90, 90, 0.1), hierba)
caja("Plaza", (0, -29.0, 0.02), (30, 12, 0.06), piedra_clara)
caja("Suelo", (0, 0, 0.05), (17.0, 44.0, 0.1), suelo)
caja("Alfombra", (0, 0, 0.12), (2.6, 40.0, 0.04), alfombra)

# ----- Muros: nave (x de -4 a 4, altura 22) y naves laterales (x de 4 a 8.5, altura 12) -----
for lado in [-1.0, 1.0]:
    muro('y', lado * 4.0, -22.0, 22.0, 0.0, 4, 5.5, [], piedra, piedra_clara, 0.8)
    muro('y', lado * 8.5, -22.0, 22.0, 0.0, 3, 4.0, [], piedra, piedra_clara, 0.8)

# Contrafuertes entre las vidrieras de la nave
for lado in [-1.0, 1.0]:
    for y in [-12.0, -4.0, 4.0, 12.0]:
        caja("Contrafuerte", (lado * 4.25, y, 11.0), (0.5, 0.7, 22.0), piedra_clara)
        cono("Remate", (lado * 4.25, y, 22.8), 0.3, 1.2, 4, piedra_osc)

# Ventanas altas de la nave (vidrieras) y ventanas de las naves laterales
ventanas_nave = [-16.0, -8.0, 0.0, 8.0, 16.0]
colores = [vidrio_azul, vidrio_rojo, vidrio_ambar, vidrio_azul, vidrio_rojo]
for lado in [-1.0, 1.0]:
    for k in range(5):
        y = ventanas_nave[k]
        mat_v = colores[k]
        caja("Vidriera", (lado * 4.03, y, 17.5), (0.06, 1.6, 6.0), mat_v)
        barra_yz(y - 0.8, 20.5, y, 21.9, lado * 4.05, 0.25, 0.25, piedra_clara)
        barra_yz(y, 21.9, y + 0.8, 20.5, lado * 4.05, 0.25, 0.25, piedra_clara)
        caja("VentanaLateral", (lado * 8.95, y, 6.5), (0.1, 1.2, 4.0), mat_v)

# ----- Cubiertas -----
techo_dos_aguas(4.6, 22.0, 29.0, 44.0, pizarra, 0.4)
for lado in [-1.0, 1.0]:
    barra_xz(lado * 4.0, 14.5, lado * 8.9, 11.2, 0.0, 44.0, 0.35, pizarra)

# ----- Arcadas: pilares, capiteles y arcos apuntados -----
for lado in [-1.0, 1.0]:
    for y in ventanas_nave:
        cilindro("Pilar", (lado * 4.0, y, 7.5), 0.6, 15.0, piedra_clara)
        caja("Capitel", (lado * 4.0, y, 15.3), (1.5, 1.5, 0.6), piedra)
    for k in range(4):
        y1 = ventanas_nave[k]
        y2 = ventanas_nave[k + 1]
        ym = (y1 + y2) / 2.0
        barra_yz(y1, 15.6, ym, 17.6, lado * 4.0, 0.5, 0.5, piedra_clara)
        barra_yz(ym, 17.6, y2, 15.6, lado * 4.0, 0.5, 0.5, piedra_clara)

# ----- Arbotantes (contrafuertes volantes) con pináculos -----
for lado in [-1.0, 1.0]:
    for y in ventanas_nave:
        caja("Contrafuerte", (lado * 13.0, y, 9.0), (1.6, 1.6, 18.0), piedra)
        cono("Pinaculo", (lado * 13.0, y, 19.5), 0.5, 2.0, 4, pizarra)
        barra_xz(lado * 12.6, 17.2, lado * 4.6, 21.0, y, 1.0, 0.9, piedra)
        cono("Gargola", (lado * 8.9, y, 13.2), 0.25, 0.9, 4, piedra_osc)

# ----- Fachada occidental: muro, portada, rosetón, lancetas y frontón -----
caja("Fachada", (0, -22.3, 11.0), (19.0, 0.6, 22.0), piedra)
fronton(-22.2, 4.5, 22.0, 29.0, 9.0, piedra, piedra_clara, 0.5)

# Portada apuntada
caja("Portal", (0, -22.5, 2.3), (2.6, 0.3, 4.6), roble)
barra_xz(-1.3, 4.6, 0.0, 6.4, -22.6, 0.5, 0.5, piedra_clara)
barra_xz(0.0, 6.4, 1.3, 4.6, -22.6, 0.5, 0.5, piedra_clara)
caja("Escalinata", (0, -23.6, 0.2), (9.0, 2.0, 0.4), piedra_clara)

# Rosetón y radios
disco("Rosetón", (0, -22.4, 19.0), 3.2, 0.25, vidrio_azul, (math.pi / 2.0, 0.0, 0.0))
for k in range(8):
    rr = k * 0.3927
    caja("Radio", (0, -22.5, 19.0), (6.2, 0.15, 0.15), piedra_clara, (0.0, rr, 0.0))
disco("Aro", (0, -22.42, 19.0), 3.3, 0.12, piedra_clara, (math.pi / 2.0, 0.0, 0.0))
for k in range(12):
    ang = k * 0.5236
    tx = 2.6 * math.cos(ang)
    tz = 19.0 + 2.6 * math.sin(ang)
    mat_t = vidrio_azul
    if k % 2 == 1:
        mat_t = vidrio_ambar
    caja("Tracería", (tx, -22.45, tz), (0.7, 0.15, 0.7), mat_t)

# Lancetas bajo el rosetón
for x in [-3.2, 3.2]:
    mat_l = vidrio_rojo
    if x > 0:
        mat_l = vidrio_ambar
    caja("Lanceta", (x, -22.35, 9.0), (1.2, 0.12, 5.0), mat_l)
    barra_xz(x - 0.6, 11.5, x, 12.6, -22.4, 0.3, 0.3, piedra_clara)
    barra_xz(x, 12.6, x + 0.6, 11.5, -22.4, 0.3, 0.3, piedra_clara)

# Hornacinas con estatuas simplificadas
for x in [-5.5, -2.0, 2.0, 5.5]:
    caja("Hornacina", (x, -22.5, 14.0), (1.0, 0.5, 2.2), piedra_osc)
    caja("Estatua", (x, -22.9, 14.0), (0.5, 0.4, 1.8), piedra_clara)

# ----- Torres occidentales con agujas -----
for s in [-1.0, 1.0]:
    tx = s * 9.0
    ty = -20.5
    caja("Torre", (tx, ty, 12.0), (5.0, 5.0, 24.0), piedra)
    caja("Torre2", (tx, ty, 29.0), (4.2, 4.2, 10.0), piedra_clara)
    caja("VentanaTorre", (tx, ty - 2.12, 29.0), (1.2, 0.08, 4.5), vidrio_azul)
    caja("VentanaTorre", (tx, ty + 2.12, 29.0), (1.2, 0.08, 4.5), vidrio_azul)
    caja("Campanario", (tx, ty, 37.0), (3.4, 3.4, 6.0), piedra)
    caja("Hueco", (tx, ty - 1.72, 37.0), (1.8, 0.1, 3.5), piedra_osc)
    caja("Hueco", (tx, ty + 1.72, 37.0), (1.8, 0.1, 3.5), piedra_osc)
    cono("Aguja", (tx, ty, 50.0), 2.0, 20.0, 4, pizarra, (0.0, 0.0, 0.7854))
    for dx in [-1.7, 1.7]:
        for dy in [-1.7, 1.7]:
            cono("Pinaculo", (tx + dx, ty + dy, 40.8), 0.3, 1.5, 4, pizarra)

# ----- Cimborrio central sobre el crucero del nave -----
caja("Cimborrio", (0, 0, 32.0), (3.4, 3.4, 6.0), piedra)
cono("AgujaCentral", (0, 0, 40.0 + 4.5), 2.0, 9.0, 4, pizarra, (0.0, 0.0, 0.7854))

# ----- Ábside semicircular (radio 4, centrado en y = 22) -----
for i in range(10):
    a = i * 20.0
    rad = math.radians(a)
    px = 4.0 * math.cos(rad)
    py = 22.0 + 4.0 * math.sin(rad)
    rz = rad + math.pi / 2.0
    rot = (0.0, 0.0, rz)
    if i == 2 or i == 4 or i == 6 or i == 8:
        caja("Muro", (px, py, 6.0), (1.5, 0.8, 12.0), piedra, rot)
        caja("Vidriera", (px, py, 14.5), (1.2, 0.15, 5.0), vidrio_ambar, rot)
        caja("Muro", (px, py, 20.5), (1.5, 0.8, 3.0), piedra, rot)
    else:
        caja("Muro", (px, py, 11.0), (1.5, 0.8, 22.0), piedra, rot)
cono("AbsideTecho", (0.0, 22.0, 25.0), 4.4, 7.0, 12, pizarra)

# ----- Interior: bancos, altar, púlpito, lámparas -----
for s in [-1.0, 1.0]:
    for k in range(12):
        y = -18.0 + k * 3.0
        caja("Banco", (s * 2.5, y, 0.5), (2.0, 0.7, 0.1), banco)
        caja("Respaldo", (s * 2.5, y + 0.3, 0.95), (2.0, 0.1, 0.8), banco)
        caja("Banco", (s * 2.5, y, 0.25), (2.0, 0.7, 0.5), banco)
caja("Altar", (0, 19.0, 0.5), (3.0, 1.8, 1.0), piedra_clara)
caja("Mantel", (0, 19.0, 1.05), (2.2, 1.2, 0.1), alfombra)
caja("Pulpito", (3.0, 8.0, 1.5), (1.2, 1.2, 3.0), piedra_clara)
for y in [-12.0, -4.0, 4.0, 12.0]:
    cilindro("Cadena", (0, y, 18.0), 0.05, 6.0, hierro)
    esfera("Lampara", (0, y, 15.0), 0.5, cirio)

# Velas en los pilares
for lado in [-1.0, 1.0]:
    for y in ventanas_nave:
        esfera("Vela", (lado * 3.3, y, 9.0), 0.12, cirio)

print("Catedral gótica creada")
