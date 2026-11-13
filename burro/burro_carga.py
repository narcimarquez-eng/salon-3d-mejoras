import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# BURRO DE CARGA (con alforjas, cajas, mantas, cuerdas, sartenes y farol)
# ==============================================================================
# Basado en la hoja de vistas del usuario (frente, dos perfiles, espalda y cenital).
# La "cola" larga y horizontal que aparece en los perfiles de la hoja es un fallo de
# la imagen: aquí la cola cuelga recta hacia abajo, como en las vistas de frente y espalda.
# Aproximado: proporciones de un burro común (cruz ~1,10 m, largo del tronco ~1,30 m).
# Ejes: X = ancho, Y = profundidad (la cabeza mira a Y negativo), Z = altura.
# Las pezuñas apoyan en Z = 0. Medidas en metros. Colores lineales.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.55, bloom=0.05)
bpy.ops.render.set_lighting(intensity=1.25, angle=38)
bpy.ops.render.set_ssao(intensity=1.2)

def material(nombre, color, rugosidad=0.6, metalico=0.0, emision=0.0, alfa=1.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
        if alfa < 1.0:
            bsdf.inputs["Alpha"].default_value = alfa
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

def esfera(nombre, centro, mat, escala=(1.0, 1.0, 1.0), segmentos=14, anillos=9, rot=(0, 0, 0)):
    # Elipsoide: esfera de radio 1 escalada a sus semiejes (X, Y, Z)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=1.0, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def caja(nombre, centro, tamano, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = tamano
    return asignar_mat(obj, mat)

def cilindro(nombre, centro, radio, alto, mat, vertices=14, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def aro(nombre, centro, radio, grosor, mat, rot=(0, 0, 0), escala=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=radio, minor_radius=grosor, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def tubo(nombre, a, b, ra, rb, mat, vertices=10):
    # Miembro de radio ra en a a radio rb en b (patas, cuello, cola). Mismo convenio que el león.
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dz * dz)
    largo = math.sqrt(horiz * horiz + dy * dy)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    rx = math.atan2(-dy, horiz)
    ry = math.atan2(dx, dz)
    return cono(nombre, centro, ra, rb, largo, mat, vertices=vertices, rot=(rx, ry, 0))

def viga(nombre, a, b, grosor, mat):
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dy * dy)
    largo = math.sqrt(horiz * horiz + dz * dz)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    return caja(nombre, centro, (largo, grosor, grosor), mat, rot=(0, -math.atan2(dz, horiz), math.atan2(dy, dx)))

# ==========================================
# 1. MATERIALES (pocos y compartidos) con texturas recortadas de la foto del usuario
#    (public/textures/burro_*_diff_1k.jpg, sin costuras; color_map_scale = metros por repetición)
# ==========================================
m_pelo = material("BUR_Pelaje_Pardo", (0.12, 0.092, 0.07, 1.0), 0.85)
m_pelo.color_map = "burro_pelaje"
m_pelo.color_map_scale = 0.22
m_claro = material("BUR_Hocico_Vientre", (0.30, 0.265, 0.23, 1.0), 0.85)
m_claro.color_map = "burro_hocico"
m_claro.color_map_scale = 0.12
m_oscuro = material("BUR_Crin_Cola", (0.045, 0.035, 0.028, 1.0), 0.8)
m_oscuro.color_map = "burro_crin"
m_oscuro.color_map_scale = 0.15
m_barriga = material("BUR_Barriga_Clara", (0.5, 0.45, 0.4, 1.0), 0.85)
m_barriga.color_map = "burro_barriga"
m_barriga.color_map_scale = 0.3
m_pezuna = material("BUR_Pezuna_Nariz", (0.025, 0.02, 0.018, 1.0), 0.5)
m_ojo = material("BUR_Ojo", (0.012, 0.008, 0.006, 1.0), 0.15)
m_madera = material("BUR_Madera_Cajas", (0.13, 0.065, 0.028, 1.0), 0.75)
m_madera.color_map = "burro_madera"
m_madera.color_map_scale = 0.32
m_cuero = material("BUR_Cuero", (0.16, 0.055, 0.025, 1.0), 0.6)
m_cuero.color_map = "burro_cuero"
m_cuero.color_map_scale = 0.22
m_lona = material("BUR_Lona_Sacos", (0.21, 0.16, 0.085, 1.0), 0.9)
m_lona.color_map = "burro_saco"
m_lona.color_map_scale = 0.25
m_verde = material("BUR_Manta_Verde", (0.05, 0.085, 0.04, 1.0), 0.9)
m_verde.color_map = "burro_manta_verde"
m_verde.color_map_scale = 0.22
m_gris = material("BUR_Manta_Gris", (0.095, 0.088, 0.085, 1.0), 0.9)
m_gris.color_map = "burro_manta_gris"
m_gris.color_map_scale = 0.28
m_cuerda = material("BUR_Cuerda", (0.26, 0.17, 0.08, 1.0), 0.95)
m_cuerda.color_map = "burro_cuerda"
m_cuerda.color_map_scale = 0.12
m_metal = material("BUR_Metal", (0.32, 0.32, 0.33, 1.0), 0.35, metalico=1.0)
m_metal.color_map = "burro_metal"
m_metal.color_map_scale = 0.18
m_hierro = material("BUR_Hierro", (0.03, 0.028, 0.026, 1.0), 0.5, metalico=0.6)
m_luz = material("BUR_Luz_Farol", (1.0, 0.72, 0.35, 1.0), 0.3, emision=2.5)

# ==========================================
# 2. TRONCO
# ==========================================
esfera("BUR_Barriga", (0, 0.0, 0.86), m_pelo, escala=(0.25, 0.50, 0.27), segmentos=18, anillos=12)
esfera("BUR_Pecho", (0, -0.40, 0.90), m_pelo, escala=(0.21, 0.24, 0.27), segmentos=16, anillos=10)
esfera("BUR_Grupa", (0, 0.42, 0.93), m_pelo, escala=(0.235, 0.27, 0.26), segmentos=16, anillos=10)
esfera("BUR_Vientre", (0, 0.0, 0.70), m_barriga, escala=(0.20, 0.40, 0.16), segmentos=16, anillos=10)

# ==========================================
# 3. CUELLO Y CABEZA
# ==========================================
tubo("BUR_Cuello", (0, -0.50, 0.98), (0, -0.90, 1.30), 0.19, 0.11, m_pelo, vertices=14)
# Cabeza alargada inclinada hacia abajo (el morro queda delante y abajo)
esfera("BUR_Cabeza", (0, -1.02, 1.22), m_pelo, escala=(0.11, 0.27, 0.13), segmentos=16, anillos=10, rot=(0.75, 0, 0))
esfera("BUR_Hocico", (0, -1.19, 1.04), m_claro, escala=(0.10, 0.11, 0.095), segmentos=14, anillos=9, rot=(0.75, 0, 0))
esfera("BUR_Nariz_I", (-0.045, -1.27, 1.01), m_pezuna, escala=(0.022, 0.012, 0.03), segmentos=8, anillos=6)
esfera("BUR_Nariz_D", (0.045, -1.27, 1.01), m_pezuna, escala=(0.022, 0.012, 0.03), segmentos=8, anillos=6)
esfera("BUR_Boca", (0, -1.22, 0.955), m_pezuna, escala=(0.06, 0.03, 0.008), segmentos=8, anillos=6)
esfera("BUR_Ojo_I", (-0.105, -0.96, 1.29), m_ojo, escala=(0.018, 0.03, 0.022), segmentos=8, anillos=6)
esfera("BUR_Ojo_D", (0.105, -0.96, 1.29), m_ojo, escala=(0.018, 0.03, 0.022), segmentos=8, anillos=6)
esfera("BUR_Ceja_I", (-0.10, -0.95, 1.33), m_claro, escala=(0.02, 0.04, 0.012), segmentos=8, anillos=6)
esfera("BUR_Ceja_D", (0.10, -0.95, 1.33), m_claro, escala=(0.02, 0.04, 0.012), segmentos=8, anillos=6)

# Orejas grandes de burro: cono pardo con el interior claro y la punta oscura
for lado in [-1, 1]:
    s = "_D"
    if lado < 0:
        s = "_I"
    base = (0.065 * lado, -0.88, 1.40)
    punta = (0.17 * lado, -0.84, 1.72)
    o = tubo("BUR_Oreja" + s, base, punta, 0.055, 0.012, m_pelo, vertices=10)
    o.scale = (1.0, 0.6, 1.0)
    tubo("BUR_Oreja_Int" + s, (0.068 * lado, -0.905, 1.42), (0.162 * lado, -0.866, 1.66), 0.03, 0.008, m_oscuro, vertices=8)
    esfera("BUR_Oreja_Punta" + s, (0.168 * lado, -0.842, 1.70), m_oscuro, escala=(0.018, 0.014, 0.03), segmentos=8, anillos=6)

# Crin corta y tiesa a lo largo del cuello, y tupé entre las orejas
for i in range(9):
    t = i / 8.0
    y = -0.88 + 0.40 * t
    z = 1.43 - 0.30 * t
    esfera("BUR_Crin_" + str(i), (0, y, z), m_oscuro, escala=(0.035, 0.06, 0.07), segmentos=8, anillos=6, rot=(-0.6, 0, 0))
esfera("BUR_Tupe", (0, -0.93, 1.42), m_oscuro, escala=(0.05, 0.05, 0.05), segmentos=8, anillos=6)

# ==========================================
# 4. PATAS (finas, con la parte baja algo más oscura) y pezuñas
# ==========================================
for lado in [-1, 1]:
    s = "_D"
    if lado < 0:
        s = "_I"
    x = 0.125 * lado
    # Delanteras
    tubo("BUR_Brazo" + s, (x, -0.42, 0.82), (x, -0.43, 0.40), 0.085, 0.05, m_pelo)
    esfera("BUR_Rodilla" + s, (x, -0.43, 0.40), m_pelo, escala=(0.05, 0.05, 0.05), segmentos=8, anillos=6)
    tubo("BUR_Caña_Del" + s, (x, -0.43, 0.40), (x, -0.44, 0.08), 0.045, 0.04, m_pelo)
    cono("BUR_Pezuna_Del" + s, (x, -0.445, 0.04), 0.055, 0.042, 0.08, m_pezuna)
    # Traseras: muslo, corvejón hacia atrás y caña
    esfera("BUR_Muslo" + s, (x, 0.44, 0.80), m_pelo, escala=(0.11, 0.20, 0.25), segmentos=12, anillos=8)
    tubo("BUR_Pierna" + s, (x, 0.40, 0.66), (x, 0.52, 0.38), 0.09, 0.05, m_pelo)
    esfera("BUR_Corvejon" + s, (x, 0.52, 0.38), m_pelo, escala=(0.048, 0.055, 0.05), segmentos=8, anillos=6)
    tubo("BUR_Caña_Tra" + s, (x, 0.52, 0.38), (x, 0.48, 0.08), 0.045, 0.04, m_pelo)
    cono("BUR_Pezuna_Tra" + s, (x, 0.475, 0.04), 0.055, 0.042, 0.08, m_pezuna)

# ==========================================
# 5. COLA: cuelga recta hacia abajo (sin la cola horizontal rara de la hoja)
# ==========================================
tubo("BUR_Cola_Raiz", (0, 0.64, 1.02), (0, 0.71, 0.80), 0.045, 0.03, m_pelo)
tubo("BUR_Cola_Medio", (0, 0.71, 0.80), (0, 0.73, 0.62), 0.03, 0.028, m_pelo)
tubo("BUR_Cola_Borla", (0, 0.73, 0.66), (0, 0.735, 0.36), 0.035, 0.06, m_oscuro)
esfera("BUR_Cola_Punta", (0, 0.735, 0.36), m_oscuro, escala=(0.06, 0.05, 0.05), segmentos=8, anillos=6)

# ==========================================
# 6. CABEZADA (correas de cuero en la cabeza)
# ==========================================
# Muserola alrededor del morro (aro con el eje a lo largo de la cabeza)
aro("BUR_Muserola", (0, -1.10, 1.14), 0.118, 0.014, m_cuero, rot=(2.32, 0, 0), escala=(0.95, 1.0, 1.15))
for lado in [-1, 1]:
    s = "_D"
    if lado < 0:
        s = "_I"
    viga("BUR_Carrillera" + s, (0.112 * lado, -1.08, 1.17), (0.10 * lado, -0.88, 1.40), 0.025, m_cuero)
    esfera("BUR_Hebilla" + s, (0.115 * lado, -1.06, 1.18), m_hierro, escala=(0.012, 0.02, 0.02), segmentos=8, anillos=6)
viga("BUR_Testera", (-0.10, -0.87, 1.40), (0.10, -0.87, 1.40), 0.025, m_cuero)

# ==========================================
# 7. ARREOS: manta, petral, cincha y retranca
# ==========================================
esfera("BUR_Manta_Lomo", (0, 0.0, 1.07), m_gris, escala=(0.265, 0.42, 0.10), segmentos=16, anillos=8)
for lado in [-1, 1]:
    s = "_D"
    if lado < 0:
        s = "_I"
    caja("BUR_Faldon" + s, (0.235 * lado, 0.0, 0.94), (0.03, 0.66, 0.28), m_gris, rot=(0, -0.22 * lado, 0))
# Cincha alrededor de la barriga
aro("BUR_Cincha", (0, -0.22, 0.87), 0.262, 0.022, m_cuero, rot=(1.5708, 0, 0), escala=(1.0, 1.0, 1.10))
# Petral por delante del pecho y retranca por detrás de la grupa
aro("BUR_Petral", (0, -0.20, 0.93), 0.23, 0.02, m_cuero, escala=(1.0, 1.95, 1.0))
aro("BUR_Retranca", (0, 0.24, 0.80), 0.245, 0.02, m_cuero, escala=(1.0, 2.05, 1.0))

# ==========================================
# 8. BASTO DE MADERA Y CARGA DE ARRIBA
# ==========================================
for k in [-1, 1]:
    viga("BUR_Basto_A" + str(k), (-0.24, 0.20 * k, 1.05), (0.0, 0.20 * k, 1.22), 0.04, m_madera)
    viga("BUR_Basto_B" + str(k), (0.24, 0.20 * k, 1.05), (0.0, 0.20 * k, 1.22), 0.04, m_madera)

caja("BUR_Caja_Grande", (0, -0.12, 1.30), (0.56, 0.40, 0.26), m_madera)
caja("BUR_Caja_Grande_Tapa", (0, -0.12, 1.435), (0.58, 0.42, 0.02), m_madera)
cilindro("BUR_Manta_Enrollada", (0, 0.24, 1.31), 0.13, 0.58, m_verde, vertices=16, rot=(0, 1.5708, 0))
aro("BUR_Manta_Atadura_A", (-0.18, 0.24, 1.31), 0.13, 0.012, m_cuerda, rot=(0, 1.5708, 0))
aro("BUR_Manta_Atadura_B", (0.18, 0.24, 1.31), 0.13, 0.012, m_cuerda, rot=(0, 1.5708, 0))
caja("BUR_Manta_Doblada", (0, 0.04, 1.50), (0.50, 0.58, 0.11), m_gris)
caja("BUR_Caja_Pequena", (0.02, -0.06, 1.64), (0.38, 0.28, 0.17), m_madera)
caja("BUR_Asa_Caja", (0.02, -0.06, 1.745), (0.14, 0.025, 0.03), m_cuero)
esfera("BUR_Saco_Arriba", (0.20, 0.18, 1.62), m_lona, escala=(0.10, 0.12, 0.09), segmentos=10, anillos=7)

# Cuerdas que atan toda la carga de arriba (cruzando por encima)
for k in [-1, 1]:
    viga("BUR_Cuerda_Sup_" + str(k), (-0.30, 0.14 * k - 0.02, 1.30), (0.30, 0.14 * k - 0.02, 1.30), 0.018, m_cuerda)
    viga("BUR_Cuerda_Alta_" + str(k), (-0.26, 0.10 * k + 0.02, 1.565), (0.26, 0.10 * k + 0.02, 1.565), 0.016, m_cuerda)
viga("BUR_Cuerda_Long", (0.0, -0.33, 1.45), (0.0, 0.35, 1.565), 0.016, m_cuerda)
viga("BUR_Cuerda_Cruz", (-0.25, -0.30, 1.44), (0.25, 0.30, 1.56), 0.014, m_cuerda)

# ==========================================
# 9. CARGA DEL LADO IZQUIERDO (-X): caja, sacos, rollo de cuerda, farol y cacharros
# ==========================================
L = -1
caja("BUR_Caja_Lat_I", (0.33 * L, -0.05, 1.08), (0.20, 0.46, 0.30), m_madera)
esfera("BUR_Saco_I_A", (0.38 * L, 0.27, 0.96), m_lona, escala=(0.13, 0.16, 0.20), segmentos=12, anillos=8)
esfera("BUR_Saco_I_B", (0.40 * L, -0.03, 0.88), m_lona, escala=(0.12, 0.17, 0.17), segmentos=12, anillos=8)
cono("BUR_Saco_I_Cuello", (0.38 * L, 0.27, 1.17), 0.05, 0.03, 0.07, m_lona)
aro("BUR_Saco_I_Atado", (0.38 * L, 0.27, 1.15), 0.045, 0.01, m_cuerda)
esfera("BUR_Saco_I_C", (0.36 * L, -0.33, 0.95), m_lona, escala=(0.11, 0.12, 0.16), segmentos=12, anillos=8)
# Rollo de cuerda colgado
for r in range(3):
    aro("BUR_Rollo_I_" + str(r), (0.44 * L, -0.08, 1.12 - 0.02 * r), 0.11 - 0.012 * r, 0.022, m_cuerda, rot=(0, 1.5708, 0))
# Farol de hierro con luz
fx = 0.46 * L
fy = -0.30
cilindro("BUR_Farol_Base", (fx, fy, 1.00), 0.05, 0.03, m_hierro, vertices=10)
cilindro("BUR_Farol_Luz", (fx, fy, 1.07), 0.04, 0.11, m_luz, vertices=10)
for k in range(4):
    a = k * 1.5708 + 0.785
    cilindro("BUR_Farol_Barra_" + str(k), (fx + 0.042 * math.cos(a), fy + 0.042 * math.sin(a), 1.07), 0.006, 0.12, m_hierro, vertices=6)
cono("BUR_Farol_Techo", (fx, fy, 1.155), 0.055, 0.02, 0.06, m_hierro, vertices=10)
aro("BUR_Farol_Asa", (fx, fy, 1.21), 0.03, 0.006, m_hierro, rot=(1.5708, 0, 0))
# Cacharros: olla y dos sartenes colgadas
cilindro("BUR_Olla", (0.47 * L, 0.10, 0.93), 0.085, 0.12, m_metal, vertices=16)
aro("BUR_Olla_Borde", (0.47 * L, 0.10, 0.99), 0.085, 0.008, m_metal)
cilindro("BUR_Sarten_I_A", (0.50 * L, 0.32, 0.82), 0.11, 0.04, m_metal, vertices=18, rot=(0, 1.5708, 0))
caja("BUR_Sarten_I_A_Mango", (0.50 * L, 0.32, 1.00), (0.015, 0.03, 0.18), m_hierro)
cilindro("BUR_Sarten_I_B", (0.52 * L, 0.42, 0.98), 0.09, 0.035, m_metal, vertices=18, rot=(0, 1.5708, 0))
caja("BUR_Sarten_I_B_Mango", (0.52 * L, 0.42, 1.12), (0.015, 0.025, 0.14), m_hierro)
viga("BUR_Correa_Lat_I", (0.25 * L, -0.30, 1.18), (0.45 * L, -0.30, 1.21), 0.02, m_cuero)

# ==========================================
# 10. CARGA DEL LADO DERECHO (+X): caja, morral de cuero, cantimplora, martillo
# ==========================================
R = 1
caja("BUR_Caja_Lat_D", (0.33 * R, 0.0, 1.20), (0.20, 0.50, 0.24), m_madera)
caja("BUR_Morral", (0.40 * R, 0.02, 0.95), (0.10, 0.36, 0.30), m_cuero)
caja("BUR_Morral_Solapa", (0.455 * R, 0.02, 1.04), (0.02, 0.37, 0.14), m_cuero)
caja("BUR_Morral_Hebilla", (0.468 * R, 0.02, 0.98), (0.01, 0.04, 0.03), m_hierro)
esfera("BUR_Saco_D_A", (0.36 * R, 0.32, 0.95), m_lona, escala=(0.12, 0.14, 0.19), segmentos=12, anillos=8)
esfera("BUR_Saco_D_B", (0.36 * R, -0.32, 0.92), m_lona, escala=(0.12, 0.13, 0.18), segmentos=12, anillos=8)
# Cantimplora de calabaza
esfera("BUR_Calabaza_Cuerpo", (0.47 * R, -0.22, 0.80), m_cuero, escala=(0.07, 0.07, 0.09), segmentos=12, anillos=8)
esfera("BUR_Calabaza_Cuello", (0.47 * R, -0.22, 0.92), m_cuero, escala=(0.04, 0.04, 0.05), segmentos=10, anillos=6)
viga("BUR_Calabaza_Cordel", (0.47 * R, -0.22, 0.97), (0.40 * R, -0.25, 1.12), 0.01, m_cuerda)
# Martillo/pico atado a la caja
viga("BUR_Martillo_Mango", (0.445 * R, -0.18, 1.32), (0.445 * R, 0.16, 1.08), 0.025, m_madera)
caja("BUR_Martillo_Cabeza", (0.445 * R, -0.17, 1.33), (0.04, 0.05, 0.13), m_hierro)
for k in [-1, 1]:
    viga("BUR_Cuerda_Lat_D_" + str(k), (0.42 * R, 0.17 * k, 1.33), (0.42 * R, 0.17 * k, 1.07), 0.016, m_cuerda)
# Rollo de cuerda pequeño
for r in range(2):
    aro("BUR_Rollo_D_" + str(r), (0.45 * R, 0.30, 1.22 - 0.02 * r), 0.07, 0.018, m_cuerda, rot=(0, 1.5708, 0))
