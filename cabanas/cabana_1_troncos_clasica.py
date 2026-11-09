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

# Cabaña 1: troncos clásica con interior, puerta abierta y tejado a dos aguas.

tronco_oscuro = material("TroncoOscuro", (0.32, 0.20, 0.11), 0.75)
tronco_claro = material("TroncoClaro", (0.48, 0.31, 0.17), 0.70)
techo_mat = material("TechoMadera", (0.28, 0.17, 0.10), 0.65)
piedra = material("Piedra", (0.42, 0.42, 0.44), 0.95)
suelo_madera = material("SueloMadera", (0.36, 0.24, 0.13), 0.60)
mueble = material("Mueble", (0.52, 0.36, 0.20), 0.60)
tela = material("Manta", (0.55, 0.14, 0.12), 0.90)
lino = material("Lino", (0.85, 0.82, 0.75), 0.90)
cristal = material("Cristal", (0.60, 0.80, 0.95), 0.05)
hierba = material("Hierba", (0.22, 0.48, 0.16), 1.00)
tierra = material("Camino", (0.45, 0.36, 0.24), 1.00)
hojas = material("Hojas", (0.12, 0.38, 0.12), 0.90)
tronco_arbol = material("TroncoArbol", (0.30, 0.20, 0.12), 0.90)
luz = material("Farol", (1.00, 0.65, 0.25), 0.30, 6.0)

# Suelo, hierba y camino
caja("Hierba", (0, 0, -0.05), (40, 40, 0.1), hierba)
caja("Camino", (0, -7.0, 0.01), (1.6, 6.0, 0.02), tierra)
caja("Suelo", (0, 0, 0.05), (5.4, 4.4, 0.1), suelo_madera)

# Paredes (planta: x de -3 a 3, y de -2.5 a 2.5)
muro('x', -2.5, -3.0, 3.0, 0.1, 9, 0.3, [
    (-2.2, -1.2, 0.95, 2.1),
    (-0.6, 0.6, 0.0, 2.2),
    (1.2, 2.2, 0.95, 2.1),
], tronco_oscuro, tronco_claro)
muro('x', 2.5, -3.0, 3.0, 0.1, 9, 0.3, [
    (-2.2, -1.2, 0.95, 2.1),
], tronco_oscuro, tronco_claro)
muro('y', -3.0, -2.5, 2.5, 0.1, 9, 0.3, [
    (-1.6, -0.4, 0.95, 2.1),
], tronco_oscuro, tronco_claro)
muro('y', 3.0, -2.5, 2.5, 0.1, 9, 0.3, [
    (-1.2, 0.2, 0.95, 2.1),
], tronco_oscuro, tronco_claro)

# Cristales
caja("Cristal", (-1.7, -2.5, 1.5), (1.0, 0.04, 1.15), cristal)
caja("Cristal", (1.7, -2.5, 1.5), (1.0, 0.04, 1.15), cristal)
caja("Cristal", (-3.0, -1.0, 1.5), (0.04, 1.2, 1.15), cristal)
caja("Cristal", (3.0, -0.5, 1.5), (0.04, 1.4, 1.15), cristal)
caja("Cristal", (-1.7, 2.5, 1.5), (1.0, 0.04, 1.15), cristal)

# Marco y puerta abierta
caja("MarcoIzq", (-0.66, -2.5, 1.15), (0.12, 0.3, 2.3), tronco_oscuro)
caja("MarcoDer", (0.66, -2.5, 1.15), (0.12, 0.3, 2.3), tronco_oscuro)
caja("PuertaAbierta", (-0.6, -2.0, 1.1), (0.08, 0.9, 2.1), tronco_claro)

# Tejado y frontones
techo_dos_aguas(3.4, 2.8, 4.6, 6.8, techo_mat)
fronton(-2.5, 3.4, 2.8, 4.6, 6.0, tronco_oscuro, tronco_claro)
fronton(2.5, 3.4, 2.8, 4.6, 6.0, tronco_oscuro, tronco_claro)

# Chimenea y porche
caja("Chimenea", (1.9, 2.85, 3.6), (0.9, 0.9, 2.5), piedra)
caja("Baseporche", (0, -3.3, 0.06), (3.6, 1.6, 0.12), piedra)
caja("Porche", (0, -3.3, 0.2), (3.6, 1.6, 0.15), suelo_madera)
caja("Escalon", (0, -4.3, 0.1), (1.6, 0.4, 0.2), piedra)
caja("PosteIzq", (-1.6, -3.9, 1.25), (0.18, 0.18, 2.5), tronco_oscuro)
caja("PosteDer", (1.6, -3.9, 1.25), (0.18, 0.18, 2.5), tronco_oscuro)
caja("TechoPorche", (0, -3.3, 2.45), (3.8, 1.8, 0.12), techo_mat)

# Interior: mesa, sillas, cama, cofre, barriles, hogar y faroles
caja("MesaTablero", (0.9, 0.4, 0.95), (1.5, 0.9, 0.08), mueble)
caja("MesaPata", (0.2, 0.0, 0.5), (0.08, 0.08, 0.8), mueble)
caja("MesaPata", (1.6, 0.0, 0.5), (0.08, 0.08, 0.8), mueble)
caja("MesaPata", (0.2, 0.8, 0.5), (0.08, 0.08, 0.8), mueble)
caja("MesaPata", (1.6, 0.8, 0.5), (0.08, 0.08, 0.8), mueble)
caja("SillaAsiento", (0.9, -0.4, 0.5), (0.42, 0.42, 0.06), mueble)
caja("SillaRespaldo", (0.9, -0.66, 0.8), (0.42, 0.06, 0.45), mueble)
caja("SillaAsiento", (0.9, 1.25, 0.5), (0.42, 0.42, 0.06), mueble)
caja("SillaRespaldo", (0.9, 1.5, 0.8), (0.42, 0.06, 0.45), mueble)
caja("CamaMarco", (-1.9, -1.2, 0.3), (1.1, 2.1, 0.4), mueble)
caja("Colchon", (-1.9, -1.2, 0.6), (1.0, 2.0, 0.2), tela)
caja("Almohada", (-1.9, -1.9, 0.76), (0.6, 0.4, 0.14), lino)
caja("Cofre", (2.1, -1.7, 0.4), (0.9, 0.5, 0.6), mueble)
caja("CofreTapa", (2.1, -1.7, 0.78), (0.92, 0.52, 0.1), tronco_oscuro)
cilindro("Barril", (-2.0, 1.5, 0.6), 0.35, 1.0, mueble)
cilindro("Barril", (-2.0, 0.8, 0.6), 0.35, 1.0, mueble)
caja("Hogar", (-0.8, 2.0, 0.35), (1.2, 0.5, 0.5), piedra)
caja("Fuego", (-0.8, 1.45, 0.25), (0.45, 0.3, 0.2), luz)
esfera("Farol", (-2.55, 0.0, 2.0), 0.12, luz)
esfera("Farol", (2.55, 0.0, 2.0), 0.12, luz)

# Árboles
arbol("Arbol1", -6.5, -1.0, 3.0, hojas, tronco_arbol)
arbol("Arbol2", 6.8, 0.5, 3.2, hojas, tronco_arbol)
arbol("Arbol3", -5.5, 6.0, 2.8, hojas, tronco_arbol)
arbol("Arbol4", 6.0, -7.0, 3.0, hojas, tronco_arbol)
arbol("Arbol5", -8.0, -6.5, 2.6, hojas, tronco_arbol)

print("Cabaña 1 de troncos creada")
