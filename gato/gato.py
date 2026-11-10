import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# GATO ATIGRADO GRIS (gato doméstico adulto, tabby)
# ==============================================================================
# Basado en la hoja de referencia del usuario: se usan solo las vistas grises de la
# fila superior (frontal, lateral, lateral, espalda). La fila de colores no se aplica.
# Rayas oscuras en lomo y costados, vientre, hocico y pecho más claros, orejas con
# interior rosado, patas traseras con las puntas oscuras y punta de la cola oscura.
# Aproximado: la hoja trae una caja de "1,0 m" que no es una medida real del animal;
# las proporciones son las de un gato doméstico típico: unos 0,30 m a la cruz, 0,50 m
# de cuerpo sin cola y cola de unos 0,25 m. Ejes: X = ancho, Y = profundidad (la cara
# mira a Y negativo), Z = altura. Las patas apoyan en Z = 0. Medidas en metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.5, bloom=0.05)
bpy.ops.render.set_lighting(intensity=1.2, angle=35)
bpy.ops.render.set_ssao(intensity=1.2)

def material(nombre, color, rugosidad=0.6, metalico=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
    return mat

def asignar_mat(obj, mat):
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    return obj

def esfera(nombre, centro, mat, escala=(1.0, 1.0, 1.0), segmentos=12, anillos=8):
    # Elipsoide: esfera de radio 1 escalada a sus semiejes (X, Y, Z)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segmentos, ring_count=anillos, radius=1.0, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def caja(nombre, centro, tamano, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = tamano
    return asignar_mat(obj, mat)

def tubo(nombre, a, b, ra, rb, mat):
    # Miembro cilíndrico de radio ra en el punto a a radio rb en el punto b (patas, cola).
    # El cono va a lo largo de su Z local; primero se inclina y luego se orienta en Z.
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    horiz = math.sqrt(dx * dx + dz * dz)
    largo = math.sqrt(horiz * horiz + dy * dy)
    centro = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
    rx = math.atan2(-dy, horiz)
    ry = math.atan2(dx, dz)
    return cono(nombre, centro, ra, rb, largo, mat, vertices=10, rot=(rx, ry, 0))

# ==========================================
# 1. MATERIALES (pocos y compartidos)
# ==========================================
m_pelaje = material("GAT_Pelaje_Gris", (0.20, 0.17, 0.14, 1.0), 0.75)
m_raya = material("GAT_Raya_Oscura", (0.05, 0.04, 0.035, 1.0), 0.8)
m_claro = material("GAT_Vientre_Hocico", (0.40, 0.34, 0.29, 1.0), 0.75)
m_oreja = material("GAT_Oreja_Interior", (0.42, 0.24, 0.22, 1.0), 0.6)
m_nariz = material("GAT_Nariz", (0.36, 0.13, 0.13, 1.0), 0.5)
m_ojo = material("GAT_Ojo", (0.55, 0.45, 0.06, 1.0), 0.25)
m_pata = material("GAT_Pata_Oscura", (0.07, 0.05, 0.04, 1.0), 0.7)

# ==========================================
# 2. TRONCO
# ==========================================
esfera("GAT_Pecho", (0, -0.15, 0.20), m_pelaje, escala=(0.085, 0.10, 0.09), segmentos=16, anillos=10)
esfera("GAT_Lomo", (0, 0.05, 0.22), m_pelaje, escala=(0.085, 0.15, 0.08), segmentos=16, anillos=10)
esfera("GAT_Grupa", (0, 0.21, 0.22), m_pelaje, escala=(0.09, 0.10, 0.09), segmentos=16, anillos=10)
esfera("GAT_Vientre", (0, 0.02, 0.15), m_claro, escala=(0.07, 0.15, 0.05), segmentos=16, anillos=8)
esfera("GAT_Cuello", (0, -0.22, 0.27), m_pelaje, escala=(0.07, 0.07, 0.07), segmentos=12, anillos=8)

# Rayas del tigrado: marcas oscuras en el lomo y a los lados del cuerpo
for i in range(6):
    y = -0.10 + i * 0.07
    esfera("GAT_Raya_Lomo" + str(i), (0, y, 0.305), m_raya, escala=(0.030, 0.022, 0.010), segmentos=8, anillos=6)
for lado in [-1, 1]:
    nombre = "I" if lado < 0 else "D"
    for i in range(5):
        y = -0.08 + i * 0.09
        esfera("GAT_Raya_Costado_" + nombre + str(i), (0.085 * lado, y, 0.23), m_raya,
               escala=(0.010, 0.022, 0.030), segmentos=8, anillos=6)

# ==========================================
# 3. CABEZA
# ==========================================
esfera("GAT_Cabeza", (0, -0.30, 0.335), m_pelaje, escala=(0.075, 0.072, 0.068), segmentos=16, anillos=10)
esfera("GAT_Hocico", (0, -0.36, 0.315), m_claro, escala=(0.032, 0.028, 0.024), segmentos=12, anillos=8)
esfera("GAT_Nariz", (0, -0.385, 0.325), m_nariz, escala=(0.011, 0.007, 0.008), segmentos=8, anillos=6)
esfera("GAT_Frente_Raya_C", (0, -0.36, 0.392), m_raya, escala=(0.010, 0.010, 0.006), segmentos=8, anillos=6)
for lado in [-1, 1]:
    nombre = "I" if lado < 0 else "D"
    x = 0.052 * lado
    # Orejas: triángulo (cono de 4 lados) con interior rosado
    cono("GAT_Oreja_" + nombre, (x, -0.29, 0.415), 0.038, 0.0, 0.07, m_pelaje, vertices=4, rot=(0.0, 0.0, math.radians(45)))
    cono("GAT_Oreja_Int_" + nombre, (x, -0.305, 0.405), 0.020, 0.0, 0.045, m_oreja, vertices=4, rot=(0.0, 0.0, math.radians(45)))
    esfera("GAT_Ojo_" + nombre, (0.032 * lado, -0.362, 0.345), m_ojo, escala=(0.014, 0.008, 0.012), segmentos=8, anillos=6)
    esfera("GAT_Frente_Raya_" + nombre, (0.02 * lado, -0.355, 0.395), m_raya, escala=(0.006, 0.008, 0.007), segmentos=6, anillos=4)
    # Bigotes: dos finos por lado
    caja("GAT_Bigote_" + nombre + "1", (0.085 * lado, -0.37, 0.318), (0.08, 0.0015, 0.0015), m_claro, rot=(0, 0, 0.05 * lado))
    caja("GAT_Bigote_" + nombre + "2", (0.085 * lado, -0.37, 0.305), (0.08, 0.0015, 0.0015), m_claro, rot=(0, 0, -0.02 * lado))

# ==========================================
# 4. PATAS DELANTERAS (hombro, brazo, antebrazo, pata)
# ==========================================
for lado in [-1, 1]:
    x = 0.065 * lado
    nombre = "I" if lado < 0 else "D"
    esfera("GAT_Hombro_" + nombre, (x, -0.13, 0.22), m_pelaje, escala=(0.04, 0.045, 0.07), segmentos=10, anillos=8)
    tubo("GAT_Brazo_" + nombre, (x, -0.13, 0.20), (x, -0.15, 0.09), 0.035, 0.026, m_pelaje)
    tubo("GAT_Antebrazo_" + nombre, (x, -0.15, 0.09), (x, -0.16, 0.02), 0.026, 0.022, m_pelaje)
    esfera("GAT_Pata_Del_" + nombre, (x, -0.18, 0.018), m_pelaje, escala=(0.030, 0.045, 0.020), segmentos=10, anillos=6)

# ==========================================
# 5. PATAS TRASERAS (muslo, tibia, metatarso, pata oscura)
# ==========================================
for lado in [-1, 1]:
    x = 0.07 * lado
    nombre = "I" if lado < 0 else "D"
    esfera("GAT_Muslo_" + nombre, (x, 0.18, 0.20), m_pelaje, escala=(0.055, 0.08, 0.075), segmentos=12, anillos=8)
    tubo("GAT_Tibia_" + nombre, (x, 0.20, 0.17), (x, 0.24, 0.05), 0.030, 0.020, m_pelaje)
    tubo("GAT_Metatarso_" + nombre, (x, 0.24, 0.05), (x, 0.22, 0.02), 0.020, 0.018, m_pelaje)
    esfera("GAT_Pata_Tra_" + nombre, (x, 0.23, 0.017), m_pata, escala=(0.030, 0.050, 0.020), segmentos=10, anillos=6)

# ==========================================
# 6. COLA (larga, se curva hacia arriba al final; punta oscura)
# ==========================================
tubo("GAT_Cola_1", (0, 0.29, 0.22), (0, 0.38, 0.24), 0.024, 0.021, m_pelaje)
tubo("GAT_Cola_2", (0, 0.38, 0.24), (0, 0.44, 0.29), 0.021, 0.018, m_pelaje)
tubo("GAT_Cola_3", (0, 0.44, 0.29), (0, 0.46, 0.37), 0.018, 0.015, m_pelaje)
tubo("GAT_Cola_4", (0, 0.46, 0.37), (0, 0.45, 0.45), 0.015, 0.013, m_pelaje)
esfera("GAT_Punta_Cola", (0, 0.45, 0.47), m_raya, escala=(0.014, 0.014, 0.016), segmentos=8, anillos=6)
