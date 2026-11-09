import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# PLAZA DE ESPAÑA (Sevilla)
# ==============================================================================
# Edificio semicircular de ladrillo con arcada y galería, pabellón central, dos
# torres barrocas, canal en arco con cuatro puentes de balaustrada cerámica,
# bancos de provincias de azulejo, fuente central, farolas y barcas.
# Ejes: X = ancho, Y = profundidad, Z = altura. El semicírculo abraza la plaza
# por el lado +Y; el centro del arco está en el origen (fuente).
# Todo se orienta girando solo alrededor de Z (tangente al arco).
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Render con volumen (EEVEE), luz suave y oclusión para los relieves
bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.6, bloom=0.08)
bpy.ops.render.set_lighting(intensity=1.4, angle=35)
bpy.ops.render.set_ssao(intensity=1.3)

def material(nombre, color, rugosidad=0.8, metalico=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metalico
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

def cono(nombre, centro, r1, r2, alto, mat, vertices=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def polar(r, th, z):
    return (r * math.cos(th), r * math.sin(th), z)

def caja_arco(nombre, r, th, z, tamano, mat):
    # Caja tangente al arco en el ángulo th: X local = tangente, Y local = hacia el centro
    return caja(nombre, polar(r, th, z), tamano, mat, rot=(0, 0, th + math.pi / 2))

def arco_escalonado(prefijo, r, th, z_base, ancho, alto, mat, pasos=7, marco=None):
    # Vano con remate de medio punto aproximado por escalones (solo giro en Z).
    # Con `marco`, dibuja detrás una arquivolta algo mayor (piedra blanca).
    rad = ancho / 2
    if marco:
        rm = rad + 0.35
        caja_arco(prefijo + "_Jamba", r + 0.12, th, z_base + alto / 2, (ancho + 0.7, 0.3, alto), marco)
        for k in range(pasos):
            h = (k + 0.5) / pasos * rm
            w = 2 * math.sqrt(max(0.0, rm * rm - h * h))
            caja_arco(prefijo + "_Arquivolta_" + str(k), r + 0.12, th, z_base + alto + h, (w, 0.3, rm / pasos + 0.02), marco)
    caja_arco(prefijo + "_Vano", r, th, z_base + alto / 2, (ancho, 0.4, alto), mat)
    for k in range(pasos):
        h = (k + 0.5) / pasos * rad
        w = 2 * math.sqrt(max(0.0, rad * rad - h * h))
        caja_arco(prefijo + "_Arco_" + str(k), r, th, z_base + alto + h, (w, 0.4, rad / pasos + 0.02), mat)

# ==========================================
# 1. MATERIALES (texturas procedurales explícitas, teñidas por el color base)
# ==========================================
m_ladrillo = material("PE_Ladrillo_Visto", (0.48, 0.16, 0.07, 1.0), 0.85)
m_ladrillo.texture = "brick_mudejar"
m_ladrillo.texture_repeat = 8
m_piedra = material("PE_Piedra_Blanca", (0.86, 0.80, 0.68, 1.0), 0.7)
m_teja = material("PE_Teja_Cubierta", (0.55, 0.26, 0.13, 1.0), 0.8)
m_teja.texture = "terracotta_roof"
m_teja.texture_repeat = 6
m_azulejo = material("PE_Azulejo_Azul", (0.10, 0.25, 0.62, 1.0), 0.3)
m_azulejo.texture = "andalusi_tiles"
m_azulejo.texture_repeat = 3
m_azulejo_am = material("PE_Azulejo_Amarillo", (0.85, 0.62, 0.12, 1.0), 0.3)
m_azulejo_am.texture = "andalusi_tiles"
m_azulejo_am.texture_repeat = 3
m_hueco = material("PE_Hueco_Sombra", (0.05, 0.04, 0.04, 1.0), 0.95)
m_pavimento = material("PE_Pavimento_Albero", (0.52, 0.37, 0.20, 1.0), 0.9)
m_pavimento.texture = "stone_ashlar"
m_pavimento.texture_repeat = 16
m_cupula = material("PE_Ceramica_Azul", (0.12, 0.28, 0.58, 1.0), 0.3)
m_hierro = material("PE_Hierro_Forja", (0.06, 0.06, 0.07, 1.0), 0.4, 0.8)
m_farol = material("PE_Farol_Luz", (0.98, 0.88, 0.55, 1.0), 0.3)
m_madera = material("PE_Madera_Barca", (0.40, 0.22, 0.10, 1.0), 0.7)
m_agua = material("PE_Agua_Canal", (0.10, 0.30, 0.40, 1.0), 0.08, 0.1)
m_agua.natural_color = True
m_agua.texture = "water_caustics"
m_agua.texture_repeat = 4

# ==========================================
# 2. PLAZA: PAVIMENTO
# ==========================================
cilindro("PE_Pavimento_Plaza", (0, 0, -0.1), 105.0, 0.2, m_pavimento, vertices=64)

# ==========================================
# 3. EDIFICIO SEMICIRCULAR (planta baja con arcada + planta alta con ventanas)
# ==========================================
R = 78.0       # radio de la fachada que mira a la plaza
D = 12.0       # profundidad del edificio
H1 = 7.0       # altura de la planta baja
H2 = 7.0       # altura de la planta alta
TH0 = math.radians(9)
TH1 = math.radians(171)
N = 40
dth = (TH1 - TH0) / N
for i in range(N):
    tm = TH0 + (i + 0.5) * dth
    L = 2 * (R + D / 2) * math.sin(dth / 2) + 0.1
    caja_arco("PE_Cuerpo_" + str(i), R + D / 2, tm, (H1 + H2) / 2, (L, D, H1 + H2), m_ladrillo)
    # Cornisas e imposta de piedra blanca
    caja_arco("PE_Imposta_" + str(i), R - 0.2, tm, H1, (L, 0.6, 0.35), m_piedra)
    caja_arco("PE_Pilar_Central_" + str(i), R - 0.3, tm, 2.8, (0.7, 0.7, 5.6), m_piedra)
    caja_arco("PE_Cornisa_" + str(i), R - 0.25, tm, H1 + H2, (L, 0.8, 0.5), m_piedra)
    # Cubierta de teja inclinada hacia la plaza
    caja_arco("PE_Tejado_" + str(i), R + D / 2, tm, H1 + H2 + 1.2, (L, D + 1.0, 0.6), m_teja)
    caja_arco("PE_Pretil_" + str(i), R - 0.1, tm, H1 + H2 + 0.75, (L, 0.4, 1.0), m_piedra)
    # Dos arcos de la arcada y dos ventanas de la galería por tramo
    for k in [-1, 1]:
        ta = tm + k * dth / 4
        arco_escalonado("PE_Arcada_" + str(i) + "_" + str(k), R - 0.25, ta, 0.0, 2.6, 4.0, m_hueco, marco=m_piedra)
        caja_arco("PE_Pilar_" + str(i) + "_" + str(k), R - 0.3, tm + k * dth / 2, 2.8, (0.7, 0.7, 5.6), m_piedra)
        caja_arco("PE_Ventana_" + str(i) + "_" + str(k), R - 0.15, ta, H1 + 3.2, (1.6, 0.4, 2.6), m_hueco)
        caja_arco("PE_Ventana_Marco_" + str(i) + "_" + str(k), R - 0.2, ta, H1 + 4.65, (2.0, 0.45, 0.3), m_piedra)

# ==========================================
# 4. PABELLÓN CENTRAL (eje del semicírculo)
# ==========================================
tc = math.pi / 2
caja_arco("PE_Pabellon", R + D / 2 - 1.0, tc, 11.0, (24.0, D + 4.0, 22.0), m_ladrillo)
arco_escalonado("PE_Portada", R - 3.3, tc, 0.0, 7.0, 9.0, m_hueco, pasos=8, marco=m_piedra)
caja_arco("PE_Balcon_Central", R - 4.0, tc, 14.9, (9.0, 1.6, 0.4), m_piedra)
caja_arco("PE_Balcon_Barandilla", R - 4.7, tc, 15.6, (9.0, 0.12, 1.0), m_hierro)
for k in [-1, 0, 1]:
    arco_escalonado("PE_Pabellon_Ventana_" + str(k), R - 3.3, tc + k * 0.035, 15.2, 1.8, 3.2, m_hueco, pasos=5, marco=m_piedra)
for k in [-1, 1]:
    caja_arco("PE_Pabellon_Pilastra_" + str(k), R - 3.25, tc + k * 0.075, 11.0, (1.2, 0.5, 22.0), m_piedra)
caja_arco("PE_Portada_Marco", R - 3.3, tc, 14.2, (10.0, 0.6, 1.0), m_piedra)
caja_arco("PE_Pabellon_Cornisa", R + D / 2 - 1.0, tc, 22.2, (25.0, D + 5.0, 0.8), m_piedra)
caja_arco("PE_Pabellon_Tejado", R + D / 2 - 1.0, tc, 23.4, (24.0, D + 4.0, 1.6), m_teja)
for k in [-1, 1]:
    pos = polar(R - 2.0, tc + k * 0.13, 0)
    cilindro("PE_Torrecilla_" + str(k), (pos[0], pos[1], 26.0), 1.6, 6.0, m_ladrillo, vertices=8)
    cono("PE_Torrecilla_Chapitel_" + str(k), (pos[0], pos[1], 30.5), 1.9, 0.0, 3.0, m_cupula, vertices=8)

# ==========================================
# 5. TORRES BARROCAS EN LOS EXTREMOS
# ==========================================
def torre(prefijo, th):
    x, y, _ = polar(R + D / 2, th, 0)
    caja(prefijo + "_Base", (x, y, 16.0), (12.0, 12.0, 32.0), m_ladrillo, rot=(0, 0, th))
    caja(prefijo + "_Cornisa_1", (x, y, 32.4), (13.2, 13.2, 0.8), m_piedra, rot=(0, 0, th))
    caja(prefijo + "_Cuerpo_2", (x, y, 38.8), (10.0, 10.0, 12.0), m_ladrillo, rot=(0, 0, th))
    for a in range(4):
        ang = th + a * math.pi / 2
        hx, hy, _ = polar(5.05, ang, 0)
        caja(prefijo + "_Ventanal_" + str(a), (x + hx, y + hy, 39.5), (0.3, 2.6, 6.0), m_hueco, rot=(0, 0, ang))
    caja(prefijo + "_Cornisa_2", (x, y, 45.2), (11.2, 11.2, 0.8), m_piedra, rot=(0, 0, th))
    cilindro(prefijo + "_Tambor", (x, y, 50.6), 4.2, 10.0, m_piedra, vertices=8)
    cilindro(prefijo + "_Cornisa_3", (x, y, 55.9), 4.8, 0.6, m_piedra, vertices=8)
    esfera(prefijo + "_Cupula", (x, y, 56.2), 4.2, m_cupula, escala=(1.0, 1.0, 0.85))
    cilindro(prefijo + "_Linterna", (x, y, 61.6), 1.2, 3.2, m_piedra, vertices=8)
    cono(prefijo + "_Chapitel", (x, y, 65.0), 1.4, 0.0, 3.8, m_cupula, vertices=8)
    esfera(prefijo + "_Remate", (x, y, 67.2), 0.5, m_farol)

torre("PE_Torre_Norte", TH0 - math.radians(3))
torre("PE_Torre_Sur", TH1 + math.radians(3))

# ==========================================
# 6. BANCOS DE PROVINCIAS (48 alcobas de azulejo junto a la fachada)
# ==========================================
NB = 48
for b in range(NB):
    th = TH0 + (b + 0.5) * (TH1 - TH0) / NB
    m_b = m_azulejo if b % 2 == 0 else m_azulejo_am
    caja_arco("PE_Banco_Asiento_" + str(b), R - 3.2, th, 0.45, (4.2, 1.0, 0.5), m_b)
    caja_arco("PE_Banco_Respaldo_" + str(b), R - 2.6, th, 1.4, (4.2, 0.3, 1.9), m_b)
    for k in [-1, 1]:
        dt = k * 2.25 / (R - 2.9)
        caja_arco("PE_Banco_Pilastra_" + str(b) + "_" + str(k), R - 2.9, th + dt, 1.2, (0.5, 1.4, 2.4), m_ladrillo)

# ==========================================
# 7. CANAL EN ARCO CON AGUA ANIMADA Y BALAUSTRADAS CERÁMICAS
# ==========================================
RC = 64.0      # radio del eje del canal
WC = 9.0       # ancho del canal
NC = 36
dc = (TH1 - TH0) / NC
for i in range(NC):
    tm = TH0 + (i + 0.5) * dc
    L = 2 * RC * math.sin(dc / 2) + 0.15
    caja_arco("PE_Canal_Agua_" + str(i), RC, tm, -0.5, (L, WC, 0.2), m_agua)
    for k in [-1, 1]:
        rr = RC + k * (WC / 2 + 0.3)
        Lb = 2 * rr * math.sin(dc / 2) + 0.1
        caja_arco("PE_Canal_Muro_" + str(i) + "_" + str(k), rr, tm, 0.2, (Lb, 0.6, 1.2), m_piedra)
        caja_arco("PE_Balaustrada_" + str(i) + "_" + str(k), rr, tm, 1.2, (Lb, 0.4, 0.8), m_azulejo)
        caja_arco("PE_Albardilla_" + str(i) + "_" + str(k), rr, tm, 1.65, (Lb, 0.55, 0.12), m_piedra)

# ==========================================
# 8. CUATRO PUENTES SOBRE EL CANAL
# ==========================================
for p, deg in enumerate([38, 72, 108, 142]):
    th = math.radians(deg)
    # Tablero a lo largo del radio (girado para cruzar el canal)
    caja("PE_Puente_Tablero_" + str(p), polar(RC, th, 1.0), (6.0, WC + 4.0, 0.8), m_ladrillo, rot=(0, 0, th - math.pi / 2))
    caja("PE_Puente_Arco_" + str(p), polar(RC, th, 0.2), (5.0, WC - 2.0, 0.8), m_hueco, rot=(0, 0, th - math.pi / 2))
    for k in [-1, 1]:
        off = polar(3.1, th + math.pi / 2, 0)
        c = polar(RC, th, 1.9)
        caja("PE_Puente_Pretil_" + str(p) + "_" + str(k), (c[0] + k * off[0], c[1] + k * off[1], 1.9), (0.4, WC + 4.0, 1.0), m_azulejo, rot=(0, 0, th - math.pi / 2))
        for e in [-1, 1]:
            q = polar(RC + e * (WC / 2 + 2.0), th, 0)
            cilindro("PE_Puente_Farola_" + str(p) + "_" + str(k) + "_" + str(e), (q[0] + k * off[0], q[1] + k * off[1], 3.2), 0.12, 3.6, m_hierro, vertices=8)
            esfera("PE_Puente_Farol_" + str(p) + "_" + str(k) + "_" + str(e), (q[0] + k * off[0], q[1] + k * off[1], 5.2), 0.35, m_farol)

# ==========================================
# 9. FUENTE CENTRAL
# ==========================================
cilindro("PE_Fuente_Pilon", (0, 0, 0.4), 9.0, 0.8, m_piedra, vertices=32)
cilindro("PE_Fuente_Agua", (0, 0, 0.75), 8.4, 0.1, m_agua, vertices=32)
for j in range(8):
    a = j * math.pi / 4
    cilindro("PE_Fuente_Chorro_" + str(j), (2.2 * math.cos(a), 2.2 * math.sin(a), 1.6), 0.06, 1.8, m_agua, vertices=6)
cilindro("PE_Fuente_Columna", (0, 0, 2.6), 1.0, 4.0, m_piedra, vertices=12)
cilindro("PE_Fuente_Taza", (0, 0, 4.7), 3.0, 0.4, m_piedra, vertices=24)
cilindro("PE_Fuente_Columna_2", (0, 0, 5.9), 0.6, 2.2, m_piedra, vertices=12)
cilindro("PE_Fuente_Taza_2", (0, 0, 7.1), 1.6, 0.3, m_piedra, vertices=16)
cono("PE_Fuente_Remate", (0, 0, 8.0), 0.5, 0.0, 1.4, m_piedra)

# ==========================================
# 10. FAROLAS DEL PASEO Y BARCAS EN EL CANAL
# ==========================================
for f in range(14):
    th = TH0 + (f + 0.5) * (TH1 - TH0) / 14
    x, y, _ = polar(RC - WC / 2 - 4.0, th, 0)
    cilindro("PE_Farola_Poste_" + str(f), (x, y, 2.4), 0.14, 4.8, m_hierro, vertices=8)
    esfera("PE_Farola_Luz_" + str(f), (x, y, 5.1), 0.45, m_farol)
for b, deg in enumerate([55, 90, 125]):
    th = math.radians(deg)
    caja("PE_Barca_" + str(b), polar(RC, th, -0.25), (4.0, 1.5, 0.6), m_madera, rot=(0, 0, th + math.pi / 2))

print("Plaza de España generada")
