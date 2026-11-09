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

# Cabaña 3: cabaña de pescador sobre pilotes, con muelle, barca y tejado de paja.

agua = material("Agua", (0.10, 0.35, 0.50), 0.1)
tabla_a = material("TablaGris", (0.45, 0.42, 0.38), 0.85)
tabla_b = material("TablaGrisOsc", (0.36, 0.33, 0.30), 0.85)
paja = material("Paja", (0.55, 0.42, 0.18), 0.95)
madera = material("Madera", (0.40, 0.26, 0.14), 0.7)
madera_clara = material("MaderaClara", (0.58, 0.40, 0.22), 0.65)
manta = material("Manta", (0.60, 0.20, 0.15), 0.9)
hierro = material("Hierro", (0.25, 0.25, 0.27), 0.4)
cristal = material("Cristal", (0.60, 0.80, 0.95), 0.05)
luz = material("Farol", (1.0, 0.65, 0.25), 0.3, 6.0)
hojas = material("Hojas", (0.12, 0.38, 0.12), 0.9)
tronco_arbol = material("TroncoArbol", (0.30, 0.20, 0.12), 0.9)

# Agua (superficie en z = -0.5)
caja("Agua", (0, 0, -0.6), (60, 60, 0.2), agua)

# Pilotes que sostienen la plataforma
for x in [-2.2, 0.0, 2.2]:
    for y in [-1.8, 1.8]:
        cilindro("Pilote", (x, y, -0.45), 0.14, 1.1, madera)

# Plataforma de la cabaña (z = 0.1)
caja("Plataforma", (0, 0, 0.0), (6.2, 5.0, 0.2), madera)

# Paredes de tablas (planta de 6 x 5 m, altura 2.8 m)
muro('x', -2.5, -3.1, 3.1, 0.1, 9, 0.3, [
    (-2.1, -1.1, 0.95, 2.1),
    (-0.5, 0.5, 0.0, 2.2),
    (1.1, 2.1, 0.95, 2.1),
], tabla_a, tabla_b, 0.25)
muro('x', 2.5, -3.1, 3.1, 0.1, 9, 0.3, [
    (-1.0, 1.0, 0.95, 2.1),
], tabla_a, tabla_b, 0.25)
muro('y', -3.0, -2.5, 2.5, 0.1, 9, 0.3, [
    (-1.2, 0.2, 0.95, 2.1),
], tabla_a, tabla_b, 0.25)
muro('y', 3.0, -2.5, 2.5, 0.1, 9, 0.3, [
    (-1.2, 0.2, 0.95, 2.1),
], tabla_a, tabla_b, 0.25)

# Cristales
caja("Cristal", (-1.6, -2.5, 1.5), (0.8, 0.04, 1.15), cristal)
caja("Cristal", (1.6, -2.5, 1.5), (0.8, 0.04, 1.15), cristal)
caja("Cristal", (-3.0, -0.5, 1.5), (0.04, 1.4, 1.15), cristal)
caja("Cristal", (3.0, -0.5, 1.5), (0.04, 1.4, 1.15), cristal)

# Tejado de paja muy inclinado y frontones
techo_dos_aguas(3.3, 2.8, 4.2, 6.4, paja, 0.3)
fronton(-2.5, 3.3, 2.8, 4.2, 6.0, tabla_a, tabla_b, 0.25)
fronton(2.5, 3.3, 2.8, 4.2, 6.0, tabla_a, tabla_b, 0.25)

# Muelle de madera que sale hacia el lago
caja("Muelle", (0, -4.6, 0.0), (1.6, 4.2, 0.12), madera_clara)
for x in [-0.7, 0.7]:
    for y in [-3.5, -6.0]:
        cilindro("PiloteMuelle", (x, y, -0.45), 0.12, 1.1, madera)
cilindro("Barril", (-1.0, -2.9, 0.6), 0.3, 0.9, madera)
caja("Cajon", (-0.8, -5.2, 0.35), (0.6, 0.6, 0.5), madera_clara)

# Barca amarrada al muelle
caja("Barca", (2.8, -4.8, -0.3), (1.5, 3.2, 0.6), madera_clara)
caja("Asiento", (2.8, -4.8, 0.05), (0.9, 0.4, 0.06), madera)

# Interior: cama, mesa y estufa
caja("Cama", (-1.9, 1.4, 0.35), (1.1, 2.0, 0.5), madera)
caja("Manta", (-1.9, 1.4, 0.66), (1.0, 1.9, 0.12), manta)
caja("MesaTablero", (1.2, -0.6, 0.95), (1.2, 0.8, 0.08), madera)
caja("MesaPata", (0.7, -0.9, 0.5), (0.08, 0.08, 0.8), madera)
caja("MesaPata", (1.7, -0.9, 0.5), (0.08, 0.08, 0.8), madera)
caja("MesaPata", (0.7, -0.3, 0.5), (0.08, 0.08, 0.8), madera)
caja("MesaPata", (1.7, -0.3, 0.5), (0.08, 0.08, 0.8), madera)
caja("Estufa", (-1.8, -1.8, 0.6), (0.8, 0.8, 1.0), hierro)

# Farol en la entrada
esfera("Farol", (0.9, -2.8, 2.0), 0.12, luz)

# Árboles de la orilla
arbol("Arbol1", -6.0, -2.0, 3.0, hojas, tronco_arbol)
arbol("Arbol2", 5.5, 3.0, 2.6, hojas, tronco_arbol)

print("Cabaña 3 de pescador creada")
