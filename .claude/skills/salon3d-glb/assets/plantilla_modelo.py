import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# NOMBRE DEL MODELO (lugar, fecha si es real)
# ==============================================================================
# Qué es y qué partes tiene.
# Fuentes: (ficha BIC, Wikipedia, fotos del usuario...). Lo que no dan las fuentes
# (alturas exactas, colores...) es aproximado: dilo aquí.
# Ejes: X = ancho, Y = profundidad (la fachada mira a Y negativo), Z = altura.
# Medidas en metros (para objetos pequeños, 1 unidad = 10 cm y dilo aquí).
# Los colores van en valores lineales, como en Blender (el visor los pasa a sRGB).
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Motor de render del visor: EEVEE con luz ambiente, intensidad/ángulo del sol y oclusión
bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.6, bloom=0.05)
bpy.ops.render.set_lighting(intensity=1.3, angle=35)
bpy.ops.render.set_ssao(intensity=1.2)

def material(nombre, color, rugosidad=0.6, metalico=0.0, alfa=1.0, barniz=0.0, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
        if alfa < 1.0:
            # Transparencia clásica (cristal, agua): se ve en el visor y en cualquier motor
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
    # tamano = medidas reales (ancho X, fondo Y, alto Z) del cubo de lado 1
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
    # r1 = radio abajo, r2 = radio arriba (r2 = 0 para un cono con punta)
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

def aro(nombre, centro, radio, grosor, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=radio, minor_radius=grosor, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def viga(nombre, a, b, grosor, mat):
    # Barra recta de sección cuadrada desde el punto a hasta el punto b (tirantes, diagonales,
    # celosías, vigas inclinadas). La caja va a lo largo de su X local: primero se inclina
    # (giro en Y, negativo para que suba hacia +X) y luego se orienta (giro en Z).
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dy * dy)
    largo = math.sqrt(horiz * horiz + dz * dz)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    return caja(nombre, centro, (largo, grosor, grosor), mat, rot=(0, -math.atan2(dz, horiz), math.atan2(dy, dx)))

def tejado_dos_aguas(prefijo, x0, x1, y0, y1, z_alero, altura, mat, volado=0.6, grosor=0.24):
    # Cubierta a dos aguas con la cumbrera paralela a Y (probada en la Ermita de Montemayor).
    # Faldón derecho: giro Y = +theta (su borde exterior baja); izquierdo: -theta.
    # Con los signos al revés sale un valle en vez de un tejado. Devuelve la altura de la cumbrera.
    xc = (x0 + x1) / 2
    semi = (x1 - x0) / 2 + volado
    theta = math.atan2(altura, semi)
    largo_faldon = math.hypot(semi, altura)
    z_cumbrera = z_alero + altura
    yc = (y0 + y1) / 2
    largo = (y1 - y0) + 2 * volado
    for lado in [-1, 1]:
        d = semi / 2
        caja(prefijo + "_Faldon_" + str(lado), (xc + lado * d, yc, z_cumbrera - d * math.tan(theta) - grosor / 2), (largo_faldon, largo, grosor), mat, rot=(0, lado * theta, 0))
    caja(prefijo + "_Cumbrera", (xc, yc, z_cumbrera + 0.05), (0.4, largo, 0.18), mat)
    return z_cumbrera

# ==========================================
# 1. MATERIALES (pocos y compartidos: cada material es una pieza al exportar)
# ==========================================
m_piedra = material("XX_Piedra", (0.45, 0.40, 0.32, 1.0), 0.85)
m_madera = material("XX_Madera", (0.20, 0.11, 0.05, 1.0), 0.7)
m_metal = material("XX_Hierro", (0.04, 0.04, 0.045, 1.0), 0.45, 1.0)
m_cristal = material("XX_Cristal", (0.80, 0.90, 0.93, 1.0), 0.05, alfa=0.15, barniz=1.0)
m_luz = material("XX_Farol", (1.0, 0.78, 0.42, 1.0), 0.3, emision=3.0)
# Texturas procedurales por nombre (lista en references/motor_python.md). Evítalas en piezas
# muy alargadas: la textura se estira a lo largo de la caja.
m_piedra.texture = "stone_ashlar"

# ==========================================
# 2. PIEZAS
# ==========================================
caja("XX_Suelo", (0, 0, -0.05), (10.0, 10.0, 0.1), m_piedra)
cilindro("XX_Columna", (0, 0, 1.5), 0.25, 3.0, m_piedra)
viga("XX_Tirante", (-2, 0, 0), (2, 0, 3), 0.1, m_metal)
tejado_dos_aguas("XX_Tejado", -3.0, 3.0, -4.0, 4.0, 3.0, 1.5, m_madera)
