import bpy
import math

# ==============================================================================
# CATEDRAL DE SANTA MARÍA DE LA SEDE DE SEVILLA & LA GIRALDA (MONUMENTAL)
# ==============================================================================
# Incluye:
# - Planta de salón de 5 naves + 2 naves de capillas perimetrales
# - Crucero con Cimborrio octogonal y linterna
# - Doble hilera de Arbotantes góticos, contrafuertes, cresterías y pináculos
# - La Giralda (Caña almohade con paños de sebka, balcones, Cuerpo de Campanas
#   renacentista de Hernán Ruiz, terraza de azucenas y estatua del Giraldillo)
# - Patio de los Naranjos (Claustro norte, Puerta del Perdón con almenas
#   escalonadas, 24 naranjos con frutos, alcorques y fuente mudéjar animada)
# - Capilla Real renacentista en la cabecera oriental con gran cúpula y linterna
# - Fachada Occidental (Puerta de la Asunción, Bautismo y San Miguel + Rosetón)
# - Interior transitable: Pilares fasciculados, Coro con sillería y 2 Órganos
#   monumentales, Capilla Mayor con Retablo Mayor de oro y Reja renacentista
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# ==========================================
# 1. SISTEMA DE MATERIALES PBR
# ==========================================
def material(nombre, color, rugosidad=0.8, metalico=0.0, emision=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metalico
        if emision > 0 and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = color
            bsdf.inputs["Emission Strength"].default_value = emision
    return mat

# Paleta cromática histórica de Sevilla (piedra albero, ladrillo almohade, oro, bronce)
mat_albero       = material("Piedra_Albero_Sevilla", (0.82, 0.72, 0.54, 1.0), 0.82)
mat_albero_osc   = material("Piedra_Albero_Oscura", (0.66, 0.56, 0.40, 1.0), 0.88)
mat_albero_claro = material("Piedra_Labrada_Clara", (0.90, 0.83, 0.68, 1.0), 0.72)
mat_ladrillo_gir = material("Ladrillo_Almohade_Giralda", (0.76, 0.54, 0.38, 1.0), 0.80)
mat_sebka        = material("Relieve_Sebka_Albero", (0.88, 0.77, 0.60, 1.0), 0.75)
mat_marmol_bl    = material("Marmol_Blanco", (0.92, 0.90, 0.86, 1.0), 0.25)
mat_marmol_negro = material("Marmol_Negro_Veteado", (0.14, 0.14, 0.16, 1.0), 0.20)
mat_teja_cupula  = material("Cubierta_Piedra_Teja", (0.52, 0.42, 0.32, 1.0), 0.78)
mat_pizarra      = material("Cubierta_Crucero", (0.28, 0.30, 0.34, 1.0), 0.70)
mat_oro          = material("Oro_Retablo_Giraldillo", (0.92, 0.74, 0.22, 1.0), 0.22, 0.95)
mat_bronce       = material("Bronce_Campanas_Giraldillo", (0.38, 0.30, 0.18, 1.0), 0.35, 0.85)
mat_hierro       = material("Forja_Rejas_Sevilla", (0.12, 0.12, 0.14, 1.0), 0.40, 0.80)
mat_madera_coro  = material("Caoba_Silleria_Coro", (0.26, 0.13, 0.07, 1.0), 0.48)
mat_madera_puerta= material("Madera_Portones", (0.22, 0.14, 0.08, 1.0), 0.70)
mat_tronco       = material("Tronco_Naranjo", (0.32, 0.21, 0.12, 1.0), 0.90)
mat_hoja_naranjo = material("Copa_Naranjo", (0.14, 0.36, 0.14, 1.0), 0.75)
mat_naranja      = material("Fruto_Naranja", (0.95, 0.45, 0.05, 1.0), 0.50)
mat_agua         = material("Agua_Fuente_Mudejar", (0.15, 0.52, 0.65, 1.0), 0.10)
mat_espuma       = material("Espuma_Surtidor", (0.88, 0.96, 1.0, 1.0), 0.20, 0.0, 0.4)
mat_vidriera_az  = material("Vidriera_Azul_Cobalto", (0.18, 0.48, 0.95, 1.0), 0.15, 0.0, 1.8)
mat_vidriera_ro  = material("Vidriera_Rojo_Rubi", (0.95, 0.22, 0.18, 1.0), 0.15, 0.0, 1.6)
mat_vidriera_am  = material("Vidriera_Ambar_Oro", (0.98, 0.76, 0.20, 1.0), 0.15, 0.0, 2.0)
mat_luz_calida   = material("Luz_Interior_Sagrada", (1.0, 0.88, 0.62, 1.0), 0.10, 0.0, 3.2)
mat_terracota    = material("Pavimento_Ladrillo_Patio", (0.68, 0.42, 0.28, 1.0), 0.85)

# ==========================================
# 2. PRIMITIVAS Y CONSTRUCTORES GEOMÉTRICOS
# ==========================================
def asignar_mat(obj, mat):
    if mat:
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

def cilindro(nombre, centro, radio, alto, mat, vertices=16, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def cono(nombre, centro, r1, r2, alto, mat, vertices=8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def esfera(nombre, centro, radio, mat, escala=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = escala
    return asignar_mat(obj, mat)

def barra_yz(nombre, x, y1, z1, y2, z2, grosor, mat):
    dy = y2 - y1
    dz = z2 - z1
    largo = math.hypot(dy, dz)
    ang = math.atan2(dz, dy)
    cy = (y1 + y2) * 0.5
    cz = (z1 + z2) * 0.5
    return caja(nombre, (x, cy, cz), (grosor, largo, grosor), mat, rot=(ang, 0, 0))

def barra_xz(nombre, x1, z1, x2, z2, y, grosor, mat):
    dx = x2 - x1
    dz = z2 - z1
    largo = math.hypot(dx, dz)
    ang = -math.atan2(dz, dx)
    cx = (x1 + x2) * 0.5
    cz = (z1 + z2) * 0.5
    return caja(nombre, (cx, y, cz), (largo, grosor, grosor), mat, rot=(0, ang, 0))

def pinaculo_gotico(nombre, x, y, z_base, escala=1.0):
    s = escala
    caja(f"{nombre}_Base", (x, y, z_base + 0.8 * s), (1.1 * s, 1.1 * s, 1.6 * s), mat_albero_claro)
    caja(f"{nombre}_Cuerpo", (x, y, z_base + 2.2 * s), (0.85 * s, 0.85 * s, 1.4 * s), mat_albero)
    cono(f"{nombre}_Aguja", (x, y, z_base + 4.2 * s), 0.65 * s, 0.04 * s, 2.8 * s, mat_albero_claro, vertices=4, rot=(0, 0, math.pi / 4))
    esfera(f"{nombre}_Floron", (x, y, z_base + 5.7 * s), 0.16 * s, mat_oro)

# ==========================================
# 3. PLATAFORMA MONUMENTAL Y PAVIMENTO (LONJA)
# ==========================================
# Coordenadas:
# Eje X: Oeste (-36) a Este (+40, Capilla Real)
# Eje Y: Sur (-26) a Norte (+52, Patio de los Naranjos)
caja("Lonja_Gradas_Inf", (2, 10, -0.9), (96.0, 96.0, 0.6), mat_albero_osc)
caja("Lonja_Gradas_Med", (2, 10, -0.45), (90.0, 90.0, 0.35), mat_albero)
caja("Suelo_Catedral_Base", (0, 0, -0.15), (78.0, 54.0, 0.3), mat_marmol_bl)

# Damero interior de mármol blanco y negro
for ix in range(-6, 7):
    for iy in range(-4, 5):
        paridad = (ix + iy) % 2
        mat_dam = mat_marmol_negro
        if paridad == 0:
            mat_dam = mat_marmol_bl
        caja(f"Damero_{ix}_{iy}", (ix * 5.0, iy * 5.0, 0.02), (4.9, 4.9, 0.04), mat_dam)

# Columnas con cadenas perimetrales de la Lonja de Sevilla
for lx in range(-42, 47, 8):
    for ly in [-34, 54]:
        cilindro(f"Col_Lonja_{lx}_{ly}", (lx, ly, 0.9), 0.28, 1.8, mat_albero_osc, vertices=10)
        caja(f"Cadena_Lonja_{lx}_{ly}", (lx + 4.0, ly, 0.95), (8.0, 0.08, 0.08), mat_hierro)

# ==========================================
# 4. PLANTA DE 5 NAVES + CAPILLAS Y PILARES FASCICULADOS
# ==========================================
# Alturas escalonadas góticas de las 5 naves de Sevilla:
# Nave Central (|y| < 6.0): H = 26.0 m
# Naves Intermedias (6.0 < |y| < 12.5): H = 19.0 m
# Naves Laterales Externas (12.5 < |y| < 18.5): H = 13.5 m
# Capillas Perimetrales (18.5 < |y| < 23.0): H = 9.5 m

tramos_x = [-30.0, -22.5, -15.0, -7.5, 0.0, 7.5, 15.0, 22.5, 30.0]
lineas_y = [-18.5, -12.5, -6.0, 6.0, 12.5, 18.5]

def pilar_fasciculado(nombre, x, y, alto):
    # Basa octogonal
    cilindro(f"{nombre}_Basa", (x, y, 0.6), 1.05, 1.2, mat_albero_osc, vertices=8)
    # Núcleo del pilar
    cilindro(f"{nombre}_Nucleo", (x, y, alto * 0.5), 0.78, alto, mat_albero, vertices=12)
    # Baquetones góticos adosados
    for ang in [0, math.pi * 0.5, math.pi, math.pi * 1.5]:
        bx = x + math.cos(ang) * 0.72
        by = y + math.sin(ang) * 0.72
        cilindro(f"{nombre}_Baq_{ang:.1f}", (bx, by, alto * 0.5), 0.22, alto, mat_albero_claro, vertices=8)
    # Capitel corrido
    cilindro(f"{nombre}_Capitel", (x, y, alto - 0.5), 1.0, 0.9, mat_albero_claro, vertices=8)

for ix, x in enumerate(tramos_x):
    for iy, y in enumerate(lineas_y):
        # Evitar duplicar muros extremos cerrados pero mantener pilares estructurales
        if abs(x) < 29.0:
            h_pil = 13.0
            if abs(y) == 6.0:
                h_pil = 25.0
            if abs(y) == 12.5:
                h_pil = 18.5
            # En el crucero central (x=0) los 4 pilares torales son más gruesos
            if abs(x) == 0.0 and abs(y) == 6.0:
                cilindro(f"Pilar_Toral_{iy}", (x, y, 13.0), 1.15, 26.0, mat_albero_claro, vertices=16)
            else:
                pilar_fasciculado(f"Pilar_{ix}_{iy}", x, y, h_pil)

# ==========================================
# 5. VOLÚMENES ESCALONADOS, AZOTEAS Y BÓVEDAS
# ==========================================
# En la Catedral de Sevilla las cubiertas de las naves laterales son terrazas escalonadas
# planas de piedra albero, mientras que la nave central y el crucero destacan en altura.

# 5.1 Nave Central (X de -30 a +30, Y de -6 a +6, Z hasta 26m)
# Muros de claristorio de la nave central
for s_y in [-1, 1]:
    y_cl = s_y * 6.0
    caja(f"Muro_Claristorio_{s_y}", (0.0, y_cl, 22.2), (60.0, 0.85, 7.6), mat_albero)
    # Crestería calada superior de la nave central
    caja(f"Cresteria_Central_{s_y}", (0.0, y_cl, 26.3), (60.4, 0.45, 0.9), mat_albero_claro)

# Cubierta abovedada y tejado de la Nave Central
caja("Boveda_Techo_Central", (0.0, 0.0, 25.8), (60.0, 12.0, 0.8), mat_albero)
barra_yz("Tejado_Central_Sur", 0.0, -6.2, 26.0, 0.0, 28.8, 0.6, mat_teja_cupula)
barra_yz("Tejado_Central_Norte", 0.0, 6.2, 26.0, 0.0, 28.8, 0.6, mat_teja_cupula)
caja("Faldones_Central_Sur", (0.0, -3.1, 27.3), (60.2, 6.8, 0.45), mat_teja_cupula, rot=(0.42, 0, 0))
caja("Faldones_Central_Norte", (0.0, 3.1, 27.3), (60.2, 6.8, 0.45), mat_teja_cupula, rot=(-0.42, 0, 0))
caja("Cumbrera_Central", (0.0, 0.0, 28.9), (60.4, 0.45, 0.45), mat_oro)

# 5.2 Naves Intermedias (|Y| de 6.0 a 12.5, H = 19.0 m)
for s_y in [-1, 1]:
    yc = s_y * 9.25
    ym = s_y * 12.5
    caja(f"Cubierta_Nave_Intermedia_{s_y}", (0.0, yc, 18.6), (60.0, 6.6, 0.8), mat_teja_cupula)
    caja(f"Muro_Nave_Intermedia_{s_y}", (0.0, ym, 16.0), (60.0, 0.85, 6.0), mat_albero)
    caja(f"Pretil_Intermedia_{s_y}", (0.0, ym, 19.3), (60.4, 0.45, 0.8), mat_albero_claro)

# 5.3 Naves Laterales Externas (|Y| de 12.5 a 18.5, H = 13.5 m)
for s_y in [-1, 1]:
    yc = s_y * 15.5
    ym = s_y * 18.5
    caja(f"Cubierta_Nave_Externa_{s_y}", (0.0, yc, 13.1), (60.0, 6.2, 0.8), mat_teja_cupula)
    caja(f"Muro_Nave_Externa_{s_y}", (0.0, ym, 11.2), (60.0, 0.9, 4.6), mat_albero)
    caja(f"Pretil_Externa_{s_y}", (0.0, ym, 13.8), (60.4, 0.45, 0.75), mat_albero_claro)

# 5.4 Capillas Perimetrales entre Contrafuertes (|Y| de 18.5 a 22.8, H = 9.5 m)
for s_y in [-1, 1]:
    yc = s_y * 20.65
    ym = s_y * 22.8
    caja(f"Cubierta_Capillas_{s_y}", (0.0, yc, 9.2), (60.0, 4.4, 0.7), mat_teja_cupula)
    caja(f"Muro_Exterior_Capillas_{s_y}", (0.0, ym, 4.75), (60.0, 1.0, 9.5), mat_albero)
    caja(f"Pretil_Capillas_{s_y}", (0.0, ym, 9.8), (60.4, 0.5, 0.7), mat_albero_claro)

# ==========================================
# 6. CRUCERO (TRANSEPTO) Y CIMBORRIO CENTRAL
# ==========================================
# El crucero corta de Norte a Sur en X = 0 (ancho 12 m, de Y = -23.5 a Y = +23.5, H = 26 m)
caja("Crucero_Cuerpo_Norte", (0.0, 14.8, 19.5), (12.0, 17.5, 13.0), mat_albero)
caja("Crucero_Cuerpo_Sur", (0.0, -14.8, 19.5), (12.0, 17.5, 13.0), mat_albero)
caja("Tejado_Crucero_Oeste", (-3.1, 0.0, 27.3), (6.8, 47.2, 0.45), mat_pizarra, rot=(0, -0.42, 0))
caja("Tejado_Crucero_Este", (3.1, 0.0, 27.3), (6.8, 47.2, 0.45), mat_pizarra, rot=(0, 0.42, 0))
caja("Cumbrera_Crucero", (0.0, 0.0, 28.9), (0.45, 47.4, 0.45), mat_oro)

# Cimborrio octogonal de Sevilla sobre el crucero
cilindro("Cimborrio_Tambor_Base", (0.0, 0.0, 28.5), 5.6, 3.8, mat_albero_claro, vertices=8)
cilindro("Cimborrio_Cuerpo_Sup", (0.0, 0.0, 31.2), 4.8, 2.6, mat_albero, vertices=8)
cono("Cimborrio_Cupula", (0.0, 0.0, 33.8), 5.0, 1.2, 2.8, mat_teja_cupula, vertices=8)
cilindro("Cimborrio_Linterna", (0.0, 0.0, 36.2), 1.4, 2.4, mat_albero_claro, vertices=8)
cono("Cimborrio_Chapitel", (0.0, 0.0, 38.4), 1.5, 0.05, 2.4, mat_oro, vertices=8)
caja("Cruz_Cimborrio_V", (0.0, 0.0, 40.3), (0.18, 0.18, 1.8), mat_oro)
caja("Cruz_Cimborrio_H", (0.0, 0.0, 40.6), (0.18, 1.1, 0.18), mat_oro)

# Pináculos en las 8 esquinas del Cimborrio
for i in range(8):
    ang = i * (math.pi / 4.0) + (math.pi / 8.0)
    px = math.cos(ang) * 5.2
    py = math.sin(ang) * 5.2
    pinaculo_gotico(f"Pin_Cimborrio_{i}", px, py, 29.5, escala=0.65)

# ==========================================
# 7. DOBLE BATERÍA DE ARBOTANTES, CONTRAFUERTES Y VIDRIERAS
# ==========================================
colores_vidriera = [mat_vidriera_az, mat_vidriera_ro, mat_vidriera_am]

for ix, x in enumerate(tramos_x):
    # Saltamos el centro del crucero para los arbotantes laterales
    if abs(x) < 2.0:
        continue

    for s_y in [-1, 1]:
        # Contrafuerte exterior (en Y = ±23.0)
        caja(f"Contrafuerte_Ext_{ix}_{s_y}", (x, s_y * 23.2, 6.2), (1.35, 1.8, 12.4), mat_albero_osc)
        pinaculo_gotico(f"Pin_Ext_{ix}_{s_y}", x, s_y * 23.2, 12.4, escala=0.82)

        # Botarel intermedio (en Y = ±18.5)
        caja(f"Botarel_Med_{ix}_{s_y}", (x, s_y * 18.5, 9.8), (1.25, 1.4, 19.6), mat_albero_osc)
        pinaculo_gotico(f"Pin_Med_{ix}_{s_y}", x, s_y * 18.5, 19.6, escala=0.92)

        # Botarel interior alto (en Y = ±12.5)
        caja(f"Botarel_Int_{ix}_{s_y}", (x, s_y * 12.5, 12.2), (1.2, 1.3, 24.4), mat_albero_osc)
        pinaculo_gotico(f"Pin_Int_{ix}_{s_y}", x, s_y * 12.5, 24.4, escala=1.0)

        # Pináculo de coronación en la nave central (Y = ±6.0)
        pinaculo_gotico(f"Pin_Claristorio_{ix}_{s_y}", x, s_y * 6.0, 26.0, escala=0.78)

        # Arbotante Inferior (de Y = ±18.5 a Y = ±12.5)
        barra_yz(f"Arbotante_Inf_1_{ix}_{s_y}", x, s_y * 18.5, 14.2, s_y * 12.5, 17.8, 0.55, mat_albero_claro)
        barra_yz(f"Arbotante_Inf_2_{ix}_{s_y}", x, s_y * 18.5, 16.0, s_y * 12.5, 19.2, 0.45, mat_albero)

        # Arbotante Superior Doble hacia la Nave Central (de Y = ±12.5 a Y = ±6.0)
        barra_yz(f"Arbotante_Sup_1_{ix}_{s_y}", x, s_y * 12.5, 19.5, s_y * 6.0, 23.8, 0.58, mat_albero_claro)
        barra_yz(f"Arbotante_Sup_2_{ix}_{s_y}", x, s_y * 12.5, 21.4, s_y * 6.0, 25.4, 0.48, mat_albero)

    # Ventanales góticos con vidrieras entre tramos
    if ix < len(tramos_x) - 1:
        xm = (x + tramos_x[ix + 1]) * 0.5
        if abs(xm) > 4.5:
            mat_v = colores_vidriera[ix % 3]
            for s_y in [-1, 1]:
                # Vidrieras del Claristorio (Nave Central)
                caja(f"Vidriera_Cl_{ix}_{s_y}", (xm, s_y * 6.05, 22.2), (3.4, 0.95, 4.6), mat_v)
                # Vidrieras de Naves Intermedias
                caja(f"Vidriera_Int_{ix}_{s_y}", (xm, s_y * 12.55, 16.0), (3.2, 0.95, 3.6), colores_vidriera[(ix + 1) % 3])
                # Vidrieras de Capillas Exteriores
                caja(f"Vidriera_Cap_{ix}_{s_y}", (xm, s_y * 22.85, 5.2), (2.8, 1.1, 4.2), colores_vidriera[(ix + 2) % 3])

# ==========================================
# 8. LA GIRALDA DE SEVILLA (ESQUINA NORESTE: X = 26, Y = 24)
# ==========================================
# Torre alminar almohade + Cuerpo de campanas renacentista + El Giraldillo
gx, gy = 26.5, 24.5

# 8.1 Basamento de sillería romana/visigoda y caña almohade (Z = 0 a 48 m)
caja("Giralda_Basamento", (gx, gy, 3.0), (13.6, 13.6, 6.0), mat_albero_osc)
caja("Giralda_Cana_Almohade", (gx, gy, 27.0), (13.2, 13.2, 42.0), mat_ladrillo_gir)

# Esquinas de sillería de piedra albero en la Giralda
for sx in [-1, 1]:
    for sy in [-1, 1]:
        caja(f"Giralda_Esquina_{sx}_{sy}", (gx + sx * 6.45, gy + sy * 6.45, 27.0), (0.6, 0.6, 42.0), mat_albero_claro)

# Paños de Sebka almohades (relieves romboidales calados en las 4 caras y 3 niveles)
niveles_sebka = [14.0, 26.5, 39.0]
for nz in niveles_sebka:
    for cara in range(4):
        # 2 paños laterales de sebka y un balcón/ajimez central por cara
        for offset in [-3.4, 3.4]:
            if cara == 0:   # Sur
                px, py, sx, sy = gx + offset, gy - 6.65, 3.2, 0.28
            elif cara == 1: # Norte
                px, py, sx, sy = gx + offset, gy + 6.65, 3.2, 0.28
            elif cara == 2: # Este
                px, py, sx, sy = gx + 6.65, gy + offset, 0.28, 3.2
            else:           # Oeste
                px, py, sx, sy = gx - 6.65, gy + offset, 0.28, 3.2
            caja(f"Pano_Sebka_{nz}_{cara}_{offset}", (px, py, nz), (sx, sy, 8.8), mat_sebka)

        # Ajimez / ventana geminada central y balcón renacentista en cada cara
        if cara == 0:
            vx, vy, vsx, vsy = gx, gy - 6.65, 2.0, 0.35
            bx, by, bsx, bsy = gx, gy - 7.0, 2.8, 0.7
        elif cara == 1:
            vx, vy, vsx, vsy = gx, gy + 6.65, 2.0, 0.35
            bx, by, bsx, bsy = gx, gy + 7.0, 2.8, 0.7
        elif cara == 2:
            vx, vy, vsx, vsy = gx + 6.65, gy, 0.35, 2.0
            bx, by, bsx, bsy = gx + 7.0, gy, 0.7, 2.8
        else:
            vx, vy, vsx, vsy = gx - 6.65, gy, 0.35, 2.0
            bx, by, bsx, bsy = gx - 7.0, gy, 0.7, 2.8
        caja(f"Ajimez_Giralda_{nz}_{cara}", (vx, vy, nz - 0.5), (vsx, vsy, 3.4), mat_marmol_negro)
        caja(f"Balcon_Giralda_{nz}_{cara}", (bx, by, nz - 2.3), (bsx, bsy, 0.45), mat_albero_claro)

# Cornisa y terraza de las Azucenas (Z = 48.0 m)
caja("Giralda_Cornisa_Almohade", (gx, gy, 48.4), (14.4, 14.4, 1.0), mat_albero_claro)
caja("Giralda_Balaustrada_Azucenas", (gx, gy, 49.4), (13.8, 13.8, 1.1), mat_albero)

# Las 4 Jarras de Azucenas de bronce en las esquinas de la terraza
for sx in [-1, 1]:
    for sy in [-1, 1]:
        jx, jy = gx + sx * 6.5, gy + sy * 6.5
        cilindro(f"Pedestal_Azucena_{sx}_{sy}", (jx, jy, 50.4), 0.55, 1.2, mat_albero_claro, vertices=8)
        esfera(f"Jarra_Azucena_{sx}_{sy}", (jx, jy, 51.5), 0.5, mat_bronce, escala=(1, 1, 1.4))
        cono(f"Ramo_Azucenas_{sx}_{sy}", (jx, jy, 52.6), 0.45, 0.08, 1.4, mat_oro, vertices=6)

# 8.2 Cuerpo de Campanas Renacentista (Hernán Ruiz, Z = 49.5 a 60.0 m)
caja("Giralda_Cuerpo_Campanas_Nucleo", (gx, gy, 54.8), (10.6, 10.6, 10.5), mat_albero_claro)
# Vano de campanas central y laterales con campanas de bronce
for cara in range(4):
    for off in [-3.1, 0.0, 3.1]:
        if cara < 2:
            s_dir = 1
            if cara == 0:
                s_dir = -1
            cx, cy = gx + off, gy + s_dir * 5.35
            sx, sy = 1.6, 0.4
        else:
            s_dir = -1
            if cara == 2:
                s_dir = 1
            cx, cy = gx + s_dir * 5.35, gy + off
            sx, sy = 0.4, 1.6
        caja(f"Vano_Campana_{cara}_{off}", (cx, cy, 54.5), (sx, sy, 5.2), mat_marmol_negro)
        cono(f"Campana_Bronce_{cara}_{off}", (cx, cy, 55.6), 0.55, 0.2, 1.1, mat_bronce, vertices=10)

caja("Giralda_Cornisa_Campanas", (gx, gy, 60.3), (11.6, 11.6, 0.9), mat_albero_claro)

# 8.3 Cuerpo del Reloj / Cuerpo de las Estrellas (Z = 60.8 a 66.5 m)
caja("Giralda_Cuerpo_Estrellas", (gx, gy, 63.6), (7.6, 7.6, 5.8), mat_albero_claro)
caja("Giralda_Cornisa_Estrellas", (gx, gy, 66.8), (8.4, 8.4, 0.7), mat_albero)

# 8.4 Cuerpo de las Carambolas y Cúpula Renacentista (Z = 67.2 a 76.0 m)
cilindro("Giralda_Tambor_Redondo", (gx, gy, 70.0), 3.2, 5.0, mat_albero_claro, vertices=12)
esfera("Giralda_Cupulin", (gx, gy, 73.2), 3.1, mat_teja_cupula, escala=(1.0, 1.0, 1.15))
cilindro("Giralda_Linterna_Sup", (gx, gy, 76.5), 1.35, 2.6, mat_albero_claro, vertices=10)
cono("Giralda_Pinaculo_Sup", (gx, gy, 78.8), 1.4, 0.2, 2.2, mat_albero_osc, vertices=10)

# 8.5 Globo Terráqueo y Estatua del GIRALDILLO (Z = 80.5 a 86.0 m)
esfera("Giralda_Tinaja_Bronce", (gx, gy, 80.6), 0.95, mat_oro)
cilindro("Giraldillo_Cuerpo", (gx, gy, 82.8), 0.35, 3.2, mat_bronce, vertices=10)
esfera("Giraldillo_Cabeza_Casco", (gx, gy, 84.7), 0.42, mat_oro)
# Escudo/Lábaro de la Fe (veleta) y Palma de la Victoria
caja("Giraldillo_Labaro_Astil", (gx + 0.65, gy, 83.4), (0.12, 0.12, 3.8), mat_oro)
caja("Giraldillo_Labaro_Bandera", (gx + 1.35, gy, 84.2), (1.3, 0.08, 1.8), mat_oro)
barra_xz("Giraldillo_Palma", gx - 0.3, 82.8, gx - 1.4, 84.6, gy, 0.14, mat_oro)

# ==========================================
# 9. CAPILLA REAL (CABECERA ESTE: X = 30 a 41)
# ==========================================
# Gran ábside renacentista abovedado detrás del Altar Mayor
caja("Capilla_Real_Base", (34.8, 0.0, 8.5), (9.6, 15.0, 17.0), mat_albero)
cilindro("Capilla_Real_Abside", (39.0, 0.0, 8.5), 7.2, 17.0, mat_albero_claro, vertices=12)
caja("Capilla_Real_Cornisa", (35.5, 0.0, 17.4), (11.5, 16.0, 0.9), mat_albero_claro)
cilindro("Capilla_Real_Tambor", (36.0, 0.0, 19.8), 5.6, 4.0, mat_albero_claro, vertices=12)
esfera("Capilla_Real_Cupula", (36.0, 0.0, 22.0), 5.5, mat_teja_cupula, escala=(1.0, 1.0, 0.85))
cilindro("Capilla_Real_Linterna", (36.0, 0.0, 26.8), 1.3, 2.4, mat_albero_claro, vertices=8)
cono("Capilla_Real_Chapitel", (36.0, 0.0, 28.8), 1.4, 0.08, 1.8, mat_oro, vertices=8)

# Capillas colaterales de la cabecera (San Pedro y Concepción Grande)
for s_y in [-1, 1]:
    caja(f"Cabecera_Colateral_{s_y}", (32.5, s_y * 13.5, 6.8), (5.5, 9.5, 13.6), mat_albero)
    pinaculo_gotico(f"Pin_Cabecera_{s_y}", 35.0, s_y * 17.5, 13.6, escala=0.8)

# ==========================================
# 10. FACHADA OCCIDENTAL (PUERTAS DE LA ASUNCIÓN, BAUTISMO Y SAN MIGUEL)
# ==========================================
fx = -30.0
# Muro de cierre occidental escalonado
caja("Fachada_Oeste_Central", (fx, 0.0, 13.0), (1.4, 12.6, 26.0), mat_albero)
caja("Fachada_Oeste_Int_Sur", (fx, -9.2, 9.5), (1.3, 6.5, 19.0), mat_albero)
caja("Fachada_Oeste_Int_Norte", (fx, 9.2, 9.5), (1.3, 6.5, 19.0), mat_albero)
caja("Fachada_Oeste_Ext_Sur", (fx, -15.5, 6.8), (1.2, 6.2, 13.6), mat_albero)
caja("Fachada_Oeste_Ext_Norte", (fx, 15.5, 6.8), (1.2, 6.2, 13.6), mat_albero)

# Contrafuertes de la Fachada Principal (Avenida de la Constitución)
for py in [-18.5, -12.5, -6.0, 6.0, 12.5, 18.5]:
    h_cf = 14.5
    if abs(py) == 12.5:
        h_cf = 20.0
    if abs(py) == 6.0:
        h_cf = 27.0
    caja(f"Contrafuerte_Oeste_{py}", (fx - 0.9, py, h_cf * 0.5), (1.8, 1.5, h_cf), mat_albero_claro)
    pinaculo_gotico(f"Pin_Oeste_{py}", fx - 0.9, py, h_cf, escala=0.95)

def portada_gotica_abocinada(nombre, x, y, ancho, alto, prof):
    # Cuerpo saliente del pórtico con gablete triangular
    caja(f"{nombre}_Macizo", (x - prof * 0.4, y, alto * 0.55), (prof, ancho + 2.2, alto * 1.1), mat_albero_claro)
    # Arquivoltas apuntadas escalonadas
    for i in range(4):
        a_w = ancho - i * 0.55
        a_h = alto - i * 0.45
        px = x - prof + i * 0.22
        caja(f"{nombre}_Jamba_Izq_{i}", (px, y - a_w * 0.5, a_h * 0.35), (0.35, 0.35, a_h * 0.7), mat_albero_osc)
        caja(f"{nombre}_Jamba_Der_{i}", (px, y + a_w * 0.5, a_h * 0.35), (0.35, 0.35, a_h * 0.7), mat_albero_osc)
        barra_yz(f"{nombre}_Arco_Izq_{i}", px, y - a_w * 0.5, a_h * 0.7, y, a_h, 0.32, mat_albero_claro)
        barra_yz(f"{nombre}_Arco_Der_{i}", px, y + a_w * 0.5, a_h * 0.7, y, a_h, 0.32, mat_albero_claro)
    # Gablete agudo superior con crestería y florón
    barra_yz(f"{nombre}_Gablete_Izq", x - prof, y - ancho * 0.6, alto * 0.75, y, alto * 1.32, 0.38, mat_albero_claro)
    barra_yz(f"{nombre}_Gablete_Der", x - prof, y + ancho * 0.6, alto * 0.75, y, alto * 1.32, 0.38, mat_albero_claro)
    esfera(f"{nombre}_Floron_Gablete", (x - prof, y, alto * 1.36), 0.32, mat_oro)
    # Tímpano esculpido y hojas de madera con herrajes
    caja(f"{nombre}_Timpano", (x - 0.3, y, alto * 0.78), (0.4, ancho * 0.72, alto * 0.28), mat_albero)
    caja(f"{nombre}_Puerta_Madera", (x - 0.2, y, alto * 0.32), (0.45, ancho * 0.72, alto * 0.64), mat_madera_puerta)
    caja(f"{nombre}_Parteluz", (x - 0.5, y, alto * 0.32), (0.35, 0.28, alto * 0.64), mat_albero_claro)

# Puerta Central de la Asunción y puertas laterales del Bautismo y San Miguel
portada_gotica_abocinada("Puerta_Asuncion", fx, 0.0, 6.2, 11.5, 2.2)
portada_gotica_abocinada("Puerta_Bautismo", fx, -12.5, 4.2, 8.2, 1.5)
portada_gotica_abocinada("Puerta_San_Miguel", fx, 12.5, 4.2, 8.2, 1.5)

# Gran Rosetón Occidental con tracería gótica radial
rx = fx - 0.8
cilindro("Roseton_Oeste_Marco", (rx, 0.0, 19.2), 3.8, 0.65, mat_albero_claro, vertices=24, rot=(0, math.pi / 2, 0))
cilindro("Roseton_Oeste_Vidrio", (rx + 0.1, 0.0, 19.2), 3.3, 0.35, mat_vidriera_am, vertices=24, rot=(0, math.pi / 2, 0))
cilindro("Roseton_Oeste_Nucleo", (rx - 0.1, 0.0, 19.2), 1.1, 0.5, mat_vidriera_ro, vertices=16, rot=(0, math.pi / 2, 0))
for i in range(12):
    ang = i * (math.pi / 6.0)
    ry = math.cos(ang) * 1.7
    rz = 19.2 + math.sin(ang) * 1.7
    caja(f"Radio_Roseton_{i}", (rx - 0.12, ry, rz), (0.25, 0.14, 3.4), mat_albero_claro, rot=(ang + math.pi / 2, 0, 0))

# Portada Sur del Crucero (Puerta del Príncipe / San Cristóbal) y Monumento al Triunfo
portada_gotica_abocinada("Puerta_Principe_Sur", 0.0, -23.0, 5.2, 10.2, 1.8)
cilindro("Roseton_Sur_Crucero", (0.0, -23.5, 19.0), 3.1, 0.5, mat_vidriera_az, vertices=20, rot=(math.pi / 2, 0, 0))

# ==========================================
# 11. PATIO DE LOS NARANJOS Y PUERTA DEL PERDÓN (NORTE: Y = 23 a 51)
# ==========================================
# Pavimento de ladrillo mudéjar del Patio de los Naranjos
caja("Suelo_Patio_Naranjos", (-4.0, 37.0, 0.05), (46.0, 28.0, 0.15), mat_terracota)

# Muros y galerías porticadas del Patio (Oeste, Este y Norte)
caja("Muro_Patio_Oeste", (-27.0, 37.0, 4.2), (1.1, 28.0, 8.4), mat_albero)
caja("Muro_Patio_Este", (19.0, 37.0, 4.2), (1.1, 28.0, 8.4), mat_albero)
caja("Muro_Patio_Norte", (-4.0, 51.0, 4.5), (47.0, 1.2, 9.0), mat_albero)

# Almenas escalonadas almohades coronando el muro del Patio de los Naranjos
for ax in range(-26, 19, 2):
    caja(f"Almena_Base_{ax}", (ax, 51.0, 9.35), (1.1, 0.8, 0.7), mat_albero_claro)
    caja(f"Almena_Pico_{ax}", (ax, 51.0, 9.9), (0.6, 0.8, 0.5), mat_albero_claro)

# Galerías de arcos interiores del claustro mudéjar
for gx_p in range(-22, 16, 4):
    cilindro(f"Col_Claustro_N_{gx_p}", (gx_p, 47.8, 2.8), 0.25, 5.6, mat_marmol_bl, vertices=10)
caja("Techo_Galeria_Norte", (-4.0, 49.4, 5.9), (44.0, 3.4, 0.5), mat_teja_cupula)

# Puerta del Perdón (Norte, X = -4, Y = 51.2) con arco de herradura almohade y aldabones
caja("Puerta_Perdon_Torreon", (-4.0, 51.4, 6.2), (9.2, 2.6, 12.4), mat_albero_claro)
cilindro("Puerta_Perdon_Arco_Herradura", (-4.0, 51.9, 5.2), 2.8, 1.8, mat_albero_osc, vertices=16, rot=(math.pi / 2, 0, 0))
caja("Puerta_Perdon_Hojas_Bronce", (-4.0, 51.5, 3.2), (4.6, 0.5, 6.4), mat_bronce)
caja("Puerta_Perdon_Almenas_Sup", (-4.0, 51.4, 12.8), (9.6, 2.8, 0.9), mat_oro)

# Cuadrícula simétrica de Naranjos de Sevilla con alcorques, canalillos y naranjas
filas_naranjos_x = [-20.0, -14.5, -9.5, 1.5, 6.5, 12.0]
filas_naranjos_y = [28.0, 33.5, 39.5, 44.5]

for nx in filas_naranjos_x:
    # Canalillo de riego mudéjar
    caja(f"Canalillo_Riego_{nx}", (nx, 36.2, 0.14), (0.35, 18.0, 0.08), mat_agua)
    for ny in filas_naranjos_y:
        # Alcorque cuadrado de ladrillo
        caja(f"Alcorque_{nx}_{ny}", (nx, ny, 0.18), (1.9, 1.9, 0.18), mat_albero_osc)
        # Tronco y copa frondosa del naranjo
        cilindro(f"Tronco_Naranjo_{nx}_{ny}", (nx, ny, 1.25), 0.18, 2.3, mat_tronco, vertices=8)
        esfera(f"Copa_Naranjo_{nx}_{ny}", (nx, ny, 2.85), 1.45, mat_hoja_naranjo, escala=(1.0, 1.0, 0.88))
        # Frutos (naranjas amargas de Sevilla)
        for ang_n in [0.4, 1.9, 3.5, 5.0]:
            fx_n = nx + math.cos(ang_n) * 1.18
            fy_n = ny + math.sin(ang_n) * 1.18
            esfera(f"Naranja_{nx}_{ny}_{ang_n:.1f}", (fx_n, fy_n, 2.75), 0.14, mat_naranja)

# Fuente Central Mudéjar del Patio de los Naranjos (con taza visigoda y agua animada)
fx_p, fy_p = -4.0, 36.5
cilindro("Fuente_Patio_Grada", (fx_p, fy_p, 0.25), 3.4, 0.35, mat_albero_claro, vertices=8)
cilindro("Fuente_Patio_Taza_Oct", (fx_p, fy_p, 0.72), 2.6, 0.75, mat_marmol_bl, vertices=8)
agua_patio = cilindro("Fuente_Patio_Agua", (fx_p, fy_p, 0.98), 2.35, 0.12, mat_agua, vertices=12)
bpy.anim.agua(agua_patio, 1.3)

cilindro("Fuente_Patio_Taza_Visigoda", (fx_p, fy_p, 1.45), 1.15, 0.85, mat_albero_osc, vertices=12)
surtidor_patio = cono("Fuente_Patio_Surtidor", (fx_p, fy_p, 2.35), 0.35, 0.08, 1.4, mat_espuma, vertices=10)
bpy.anim.loop(surtidor_patio, 1.2, lambda t: (0.0, 0.0, 0.22 * math.sin(t * math.pi * 2.0)))
for j_ch in range(6):
    ang_ch = j_ch * (math.pi * 2.0 / 6.0)
    gota_f = esfera(f"Gota_Fuente_Patio_{j_ch}", (fx_p, fy_p, 1.95), 0.16, mat_espuma)
    bpy.anim.loop(gota_f, 1.4, lambda t, a=ang_ch: (
        math.cos(a) * 1.45 * t,
        math.sin(a) * 1.45 * t,
        2.8 * t * (1.0 - t) - 0.7 * t * t
    ))

# ==========================================
# 12. INTERIOR MONUMENTAL: CORO, ÓRGANOS, RETABLO MAYOR Y TUMBA DE COLÓN
# ==========================================
# 12.1 El Coro Central (X de -15 a -4, en medio de la Nave Central)
caja("Coro_Trascoro_Marmol", (-15.0, 0.0, 3.2), (1.1, 10.6, 6.4), mat_marmol_bl)
for s_y in [-1, 1]:
    # Muros laterales del Coro y Sillería gótico-mudéjar de caoba
    caja(f"Coro_Muro_Lat_{s_y}", (-9.5, s_y * 5.0, 3.2), (11.0, 0.8, 6.4), mat_albero_claro)
    caja(f"Coro_Silleria_Alta_{s_y}", (-9.5, s_y * 4.2, 2.2), (9.8, 0.75, 4.4), mat_madera_coro)
    caja(f"Coro_Silleria_Baja_{s_y}", (-9.5, s_y * 3.3, 1.1), (9.2, 0.65, 2.0), mat_madera_coro)

    # Los 2 Grandes Órganos Monumentales enfrentados sobre el Coro
    caja(f"Organo_Caja_{s_y}", (-9.5, s_y * 4.8, 9.8), (6.5, 1.5, 6.8), mat_madera_coro)
    caja(f"Organo_Cornisa_Oro_{s_y}", (-9.5, s_y * 4.8, 13.5), (7.0, 1.8, 0.8), mat_oro)
    # Tubos de trompetería horizontal (batalla) y tubos verticales
    for tx in range(-12, -6):
        cilindro(f"Tubo_Org_{s_y}_{tx}", (tx * 1.0, s_y * 4.0, 10.0), 0.16, 5.8, mat_oro, vertices=8)

# Facistol central del Coro
cilindro("Coro_Facistol_Base", (-9.5, 0.0, 1.1), 0.7, 2.2, mat_madera_coro, vertices=8)
cono("Coro_Facistol_Atril", (-9.5, 0.0, 2.6), 0.9, 0.2, 1.1, mat_oro, vertices=4)

# 12.2 La Capilla Mayor y el Gran Retablo Mayor de Oro (X de +7.5 a +22.5)
# Reja Renacentista de la Capilla Mayor (X = 7.5)
caja("Reja_Capilla_Mayor_Inf", (7.5, 0.0, 4.5), (0.28, 10.8, 9.0), mat_hierro)
caja("Reja_Capilla_Mayor_Friso_Oro", (7.5, 0.0, 9.4), (0.45, 11.0, 1.4), mat_oro)
caja("Reja_Capilla_Mayor_Cresteria", (7.5, 0.0, 11.2), (0.35, 7.5, 2.4), mat_oro)

# Gradas del Presbiterio y Altar Mayor
caja("Presbiterio_Gradas", (15.0, 0.0, 0.55), (14.5, 10.8, 1.1), mat_marmol_negro)
caja("Altar_Mayor_Mesa", (16.5, 0.0, 1.8), (2.2, 4.8, 1.4), mat_oro)

# El Gran Retablo Mayor Gótico de Sevilla (el mayor retablo de la cristiandad: 20m de alto)
rx_m = 21.8
caja("Retablo_Mayor_Estructura", (rx_m, 0.0, 11.5), (1.4, 10.8, 21.0), mat_oro)
# Guardapolvo y 44 compartimentos/escenas en relieve (cuadrícula de calles y cuerpos)
for cx_calle in range(-4, 5, 2):
    caja(f"Retablo_Pilar_Calle_{cx_calle}", (rx_m - 0.55, cx_calle * 1.15, 11.5), (0.5, 0.28, 20.5), mat_madera_coro)
for cz_cuerpo in range(3, 21, 3):
    caja(f"Retablo_Dosel_Cuerpo_{cz_cuerpo}", (rx_m - 0.65, 0.0, cz_cuerpo * 1.0), (0.65, 10.6, 0.42), mat_oro)
# Viga de imaginería superior con el Calvario gótico
caja("Retablo_Calvario_Cumbrera", (rx_m - 0.5, 0.0, 22.8), (0.9, 6.0, 2.2), mat_oro)

# 12.3 Monumento Funerario de Cristóbal Colón (frente a la Puerta del Príncipe, X = -3.5, Y = -10.5)
cx_col, cy_col = -3.5, -10.5
caja("Colon_Pedestal_Marmol", (cx_col, cy_col, 0.7), (3.4, 2.4, 1.4), mat_marmol_bl)
# Los 4 Heraldos Reales (Castilla, León, Aragón y Navarra) portando el féretro en hombros
for sx in [-1, 1]:
    for sy in [-1, 1]:
        cilindro(f"Heraldo_Colon_{sx}_{sy}", (cx_col + sx * 1.0, cy_col + sy * 0.65, 2.3), 0.28, 1.9, mat_bronce, vertices=10)
        esfera(f"Cabeza_Heraldo_{sx}_{sy}", (cx_col + sx * 1.0, cy_col + sy * 0.65, 3.4), 0.22, mat_oro)
caja("Feretro_Cristobal_Colon", (cx_col, cy_col, 3.7), (2.8, 1.35, 0.95), mat_oro)

# 12.4 Lámparas votivas colgantes en las naves
for lx in [-22.0, -15.0, 0.0, 12.0]:
    cilindro(f"Cable_Lampara_{lx}", (lx, 0.0, 17.5), 0.04, 15.0, mat_hierro, vertices=6)
    esfera(f"Lampara_Votiva_{lx}", (lx, 0.0, 9.8), 0.55, mat_luz_calida)
