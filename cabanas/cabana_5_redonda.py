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

# Cabaña 5: cabaña redonda de piedra y madera con tejado cónico de paja.

R = 2.6
piedra = material("Piedra", (0.50, 0.48, 0.45), 0.95)
madera = material("MaderaOscura", (0.30, 0.19, 0.10), 0.7)
madera_clara = material("MaderaClara", (0.52, 0.34, 0.18), 0.65)
paja = material("Paja", (0.55, 0.42, 0.18), 0.95)
cristal = material("Cristal", (0.60, 0.80, 0.95), 0.05)
suelo = material("SueloTierra", (0.40, 0.30, 0.18), 1.0)
mueble = material("Mueble", (0.52, 0.36, 0.20), 0.6)
manta = material("Manta", (0.55, 0.14, 0.12), 0.9)
hogar = material("PiedraHogar", (0.35, 0.33, 0.32), 0.95)
hierba = material("Hierba", (0.22, 0.48, 0.16), 1.0)
luz = material("Farol", (1.0, 0.65, 0.25), 0.3, 6.0)
hojas = material("Hojas", (0.12, 0.38, 0.12), 0.9)
tronco_arbol = material("TroncoArbol", (0.30, 0.20, 0.12), 0.9)

caja("Hierba", (0, 0, -0.05), (40, 40, 0.1), hierba)
cilindro("Suelo", (0, 0, 0.05), 2.4, 0.1, suelo)

# Anillo de piedra (z 0.1 a 1.3) y anillo de madera (z 1.3 a 2.9)
# Puerta en -90 grados (y negativo). Ventanas en 0, 90 y 180 grados.
for i in range(36):
    deg = i * 10.0
    rad = math.radians(deg)
    cx = R * math.cos(rad)
    cy = R * math.sin(rad)
    rz = rad + math.pi / 2.0
    rot = (0.0, 0.0, rz)
    dp = dist_angulo(deg, 270.0)
    dw = min(dist_angulo(deg, 0.0), dist_angulo(deg, 90.0), dist_angulo(deg, 180.0))
    if dp > 15.0:
        caja("Piedra", (cx, cy, 0.7), (0.5, 0.4, 1.2), piedra, rot)
    if dp <= 15.0:
        # Dintel sobre la puerta (z 2.1 a 2.9)
        caja("Dintel", (cx, cy, 2.5), (0.5, 0.4, 0.8), madera, rot)
    elif dw <= 15.0:
        # Ventana: entramado bajo y sobre el cristal
        caja("Entramado", (cx, cy, 1.45), (0.5, 0.4, 0.3), madera, rot)
        caja("Cristal", (cx, cy, 2.1), (0.5, 0.08, 1.0), cristal, rot)
        caja("Entramado", (cx, cy, 2.75), (0.5, 0.4, 0.3), madera, rot)
    else:
        caja("Madera", (cx, cy, 2.1), (0.5, 0.4, 1.6), madera, rot)

# Tejado cónico de paja y poste central
cono("Tejado", (0, 0, 4.0), R + 0.5, 2.2, 36, paja)
cilindro("PosteCentral", (0, 0, 2.5), 0.12, 5.0, madera)

# Hogar central y fuego
cilindro("Hogar", (0, 0.9, 0.25), 0.5, 0.5, hogar)
esfera("Fuego", (0, 0.9, 0.6), 0.25, luz)

# Interior: cama, mesa, barriles y farol de la puerta
caja("CamaMarco", (-1.4, 0.2, 0.3), (1.0, 1.8, 0.4), mueble)
caja("Manta", (-1.4, 0.2, 0.6), (0.95, 1.7, 0.15), manta)
caja("MesaTablero", (1.2, -0.6, 0.95), (1.2, 0.8, 0.08), mueble)
caja("MesaPata", (0.8, -0.9, 0.5), (0.08, 0.08, 0.8), mueble)
caja("MesaPata", (1.6, -0.9, 0.5), (0.08, 0.08, 0.8), mueble)
caja("MesaPata", (0.8, -0.3, 0.5), (0.08, 0.08, 0.8), mueble)
caja("MesaPata", (1.6, -0.3, 0.5), (0.08, 0.08, 0.8), mueble)
cilindro("Barril", (1.8, 1.0, 0.45), 0.3, 0.9, mueble)
cilindro("Barril", (2.0, 0.2, 0.45), 0.3, 0.9, mueble)
esfera("Farol", (0.0, -2.1, 1.8), 0.12, luz)

# Leña apilada fuera
for k in range(3):
    caja("Leña", (2.9, -1.2 + k * 0.25, 0.25), (0.8, 0.22, 0.22), madera_clara)

# Árboles
arbol("Arbol1", -6.5, -2.0, 3.0, hojas, tronco_arbol)
arbol("Arbol2", 5.5, 3.5, 2.8, hojas, tronco_arbol)

print("Cabaña 5 redonda creada")
