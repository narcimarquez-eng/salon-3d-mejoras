import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# PALMERA DATILERA (Phoenix dactylifera) - para juego
# ==============================================================================
# Hecha con el atlas de palmera del usuario (palmera/fotos/atlas_palmera.jpg),
# preparado por palmera/generar_texturas_palmera.py:
#  - public/palmera/tronco.jpg: dos parches de estípite cosidos y repetibles.
#  - public/palmera/hojas.png: 12 hojas (verdes, viejas y secas) con el tallo
#    abajo y el nervio centrado, 5 racimos de dátiles y fibra.
# Estípite: tubo curvo e inclinado con UV propias. Hojas: tiras dobladas en V a
# lo largo del nervio que se arquean con la gravedad (más las de abajo, que son
# más viejas), en espiral de 137,5 grados como en la palmera real. Debajo de la
# copa cuelgan hojas secas, racimos de dátiles (tarjetas cruzadas) y fibra.
# Normales propias hacia fuera de la copa y sombra horneada por vértice; cada
# tarjeta lleva sus dos caras modeladas (material sin doble cara).
# Medidas aproximadas de una datilera adulta: estípite ~10 m, hojas de 3-4,5 m.
# Ejes: Z = altura. Medidas en metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.7, bloom=0.03)
bpy.ops.render.set_lighting(intensity=1.4, angle=40)
bpy.ops.render.set_ssao(intensity=1.1)

# ------------------------------------------------------------------
# Azar con semilla (mismo árbol en cada ejecución). Cambia SEMILLA para otra palmera.
# ------------------------------------------------------------------
SEMILLA = 11
estado = [SEMILLA * 7919 + 13]

def azar():
    estado[0] = (estado[0] * 16807) % 2147483647
    return estado[0] / 2147483647.0

def entre(a, b):
    return a + (b - a) * azar()

# ------------------------------------------------------------------
# Vectores (listas de 3)
# ------------------------------------------------------------------
def suma(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

def resta(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

def por(a, s):
    return [a[0] * s, a[1] * s, a[2] * s]

def punto(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

def cruz(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

def largo(a):
    return math.sqrt(punto(a, a))

def unit(a):
    l = largo(a)
    if l < 0.000001:
        return [0.0, 0.0, 1.0]
    return [a[0] / l, a[1] / l, a[2] / l]

def bezier(p0, p1, p2, p3, t):
    u = 1.0 - t
    a = por(p0, u * u * u)
    b = por(p1, 3 * u * u * t)
    c = por(p2, 3 * u * t * t)
    d = por(p3, t * t * t)
    return suma(suma(a, b), suma(c, d))

# ------------------------------------------------------------------
# Malla del tronco (estípite): un tubo curvo con UV propias
# ------------------------------------------------------------------
M_VERTS = []
M_CARAS = []
M_UVS = []
CORTEZA_ANCHO = 1.1    # metros de perímetro que ocupa la textura del estípite
CORTEZA_ALTO = 1.4     # metros de largo que ocupa la textura del estípite

def tubo(ctrl, r0, r1, lados, tramos, onda=0.0, ensanche=0.0):
    # Tubo a lo largo de la curva de Bézier ctrl = [p0, p1, p2, p3].
    # r0 -> r1: radio al principio y al final. onda: ondulación lateral (m) para que no sea recto.
    # ensanche: engorde extra en la base (cepa del tronco). Devuelve la lista de puntos del eje.
    fase = entre(0, 6.28)
    fase2 = entre(0, 6.28)
    eje = []
    for i in range(tramos + 1):
        t = i / tramos
        eje.append(bezier(ctrl[0], ctrl[1], ctrl[2], ctrl[3], t))
    # marco que viaja con la curva (transporte paralelo: sin retorcerse)
    T0 = unit(resta(eje[1], eje[0]))
    ref = [0.0, 0.0, 1.0]
    if abs(T0[2]) > 0.9:
        ref = [1.0, 0.0, 0.0]
    N = unit(cruz(T0, ref))
    base = len(M_VERTS)
    recorrido = 0.0
    radio_medio = (r0 + r1) / 2
    vueltas = max(1, int(2 * math.pi * radio_medio / CORTEZA_ANCHO + 0.5))
    for i in range(tramos + 1):
        t = i / tramos
        if i < tramos:
            T = unit(resta(eje[i + 1], eje[i]))
        else:
            T = unit(resta(eje[i], eje[i - 1]))
        N = unit(resta(N, por(T, punto(N, T))))
        B = cruz(T, N)
        if i > 0:
            recorrido = recorrido + largo(resta(eje[i], eje[i - 1]))
        # ondulación lateral, nula en los extremos para que encajen con la rama madre
        o = onda * math.sin(t * math.pi)
        c = suma(eje[i], suma(por(N, o * math.sin(t * 7.0 + fase)), por(B, o * math.cos(t * 5.0 + fase2))))
        eje[i] = c
        r = r0 + (r1 - r0) * t
        if ensanche > 0:
            r = r + ensanche * math.exp(-t * 9.0)
        for j in range(lados + 1):
            a = 2 * math.pi * j / lados
            # sección algo irregular (corteza en placas)
            rr = r * (1.0 + 0.06 * math.sin(3 * a + fase + t * 4))
            d = suma(por(N, math.cos(a) * rr), por(B, math.sin(a) * rr))
            v = suma(c, d)
            M_VERTS.append((v[0], v[1], v[2]))
    fila = lados + 1
    acum = [0.0]
    for i in range(1, tramos + 1):
        acum.append(acum[i - 1] + largo(resta(eje[i], eje[i - 1])))
    for i in range(tramos):
        for j in range(lados):
            a = base + i * fila + j
            b = a + 1
            c2 = a + fila + 1
            d = a + fila
            M_CARAS.append((a, b, c2, d))
            u0 = vueltas * j / lados
            u1 = vueltas * (j + 1) / lados
            v0 = acum[i] / CORTEZA_ALTO
            v1 = acum[i + 1] / CORTEZA_ALTO
            M_UVS.append(u0)
            M_UVS.append(v0)
            M_UVS.append(u1)
            M_UVS.append(v0)
            M_UVS.append(u1)
            M_UVS.append(v1)
            M_UVS.append(u0)
            M_UVS.append(v1)
    return eje

# ------------------------------------------------------------------
# 1. ESTÍPITE: algo curvado e inclinado, con la base ensanchada
# ------------------------------------------------------------------
cima = [1.3, 0.45, 9.8]
tronco = tubo([[0, 0, -0.3], [0.15, 0.05, 3.5], [1.05, 0.35, 6.5], cima], 0.40, 0.31, 12, 18, 0.05, 0.18)
# cabeza: las bases de las hojas forman un engrosamiento bajo la copa
dir_cima = unit(resta(cima, tronco[len(tronco) - 2]))
cab0 = resta(cima, por(dir_cima, 0.7))
tubo([cab0, suma(cab0, por(dir_cima, 0.4)), suma(cab0, por(dir_cima, 0.8)), suma(cima, por(dir_cima, 0.45))], 0.36, 0.22, 12, 4, 0.0, 0.0)

mesh = bpy.data.meshes.new("PD_Estipite")
mesh.from_pydata(M_VERTS, [], M_CARAS)
uv = mesh.uv_layers.new(name="UVMap")
uv.data.foreach_set("uv", M_UVS)
estipite = bpy.data.objects.new("PD_Estipite", mesh)
bpy.context.collection.objects.link(estipite)

img_tronco = bpy.data.images.load("palmera/tronco.jpg")
m_tronco = bpy.data.materials.new(name="PD_Tronco")
m_tronco.use_nodes = True
bsdf = m_tronco.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Roughness"].default_value = 0.95
bsdf.inputs["Metallic"].default_value = 0.0
tex = m_tronco.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = img_tronco
m_tronco.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
estipite.data.materials.append(m_tronco)

# ------------------------------------------------------------------
# 2. HOJAS Y FRUTOS (atlas hojas.png, 2048 x 2048)
#    Hojas: 2 filas x 6 celdas de 341 x 832 px, tallo abajo, nervio en el centro.
#      0-6 verdes, 7-8 viejas (oliva), 9-11 secas.
#    Fila de abajo (alto 384 px): 0-4 racimos de dátiles (tallo arriba), 5 fibra.
# ------------------------------------------------------------------
H_VERTS = []
H_CARAS = []
H_UVS = []
H_NORM = []
H_COL = []
CENTRO = suma(cima, [0, 0, 0.2])

def celda_hoja(c):
    col = c % 6
    fil = int(c / 6)
    return [col / 6.0 + 0.002, (col + 1) / 6.0 - 0.002, 1.0 - (fil + 1) * 832 / 2048.0 + 0.002, 1.0 - fil * 832 / 2048.0 - 0.002]

def celda_baja(c):
    return [c / 6.0 + 0.002, (c + 1) / 6.0 - 0.002, 0.002, 384 / 2048.0 - 0.002]

def normal_copa(p, sup):
    # mezcla de la normal de la superficie de la hoja y la dirección desde el centro de la copa
    d = unit(resta(p, CENTRO))
    return unit(suma(suma(por(sup, 0.55), por(d, 0.6)), [0, 0, 0.25]))

def sombra(p):
    dd = largo(resta(p, CENTRO))
    a = 0.45 + 0.55 * min(1.0, dd / 3.2)
    if p[2] < CENTRO[2] - 0.3:
        a = a * 0.8
    return a

def poner_quad(pts, uvs, sup, tinte):
    # quad con sus dos caras (la trasera en orden inverso) y la misma normal y color
    b = len(H_VERTS)
    for k in range(4):
        H_VERTS.append((pts[k][0], pts[k][1], pts[k][2]))
    caras = [[0, 1, 2, 3], [0, 3, 2, 1]]
    for c in caras:
        H_CARAS.append((b + c[0], b + c[1], b + c[2], b + c[3]))
        for k in c:
            H_UVS.append(uvs[k][0])
            H_UVS.append(uvs[k][1])
            n = normal_copa(pts[k], sup[k])
            H_NORM.append((n[0], n[1], n[2]))
            s = sombra(pts[k])
            H_COL.append(s * tinte[0])
            H_COL.append(s * tinte[1])
            H_COL.append(s * tinte[2])
            H_COL.append(1.0)

def hoja(base, rumbo, elev, lng, caida, celda, pliegue, tinte, tramos=9):
    # hoja que sale de base con rumbo (planta) y elevación (rad); "caida" la arquea hacia abajo
    cel = celda_hoja(celda)
    ancho = lng * 341.0 / 832.0
    d0 = [math.cos(elev) * math.cos(rumbo), math.cos(elev) * math.sin(rumbo), math.sin(elev)]
    lado = [-math.sin(rumbo), math.cos(rumbo), 0.0]
    giro = entre(-0.25, 0.25)        # la hoja no queda del todo plana: un poco girada
    eje = []
    for i in range(tramos + 1):
        s = lng * i / tramos
        p = suma(suma(base, por(d0, s)), [0, 0, -caida * s * s])
        eje.append(p)
    filas = []
    for i in range(tramos + 1):
        if i < tramos:
            T = unit(resta(eje[i + 1], eje[i]))
        else:
            T = unit(resta(eje[i], eje[i - 1]))
        S = unit(cruz(T, [0, 0, 1.0]))
        if largo(cruz(T, [0, 0, 1.0])) < 0.05:
            S = lado
        U = cruz(S, T)
        # giro alrededor del nervio
        S2 = suma(por(S, math.cos(giro)), por(U, math.sin(giro)))
        U2 = cruz(S2, T)
        t = i / tramos
        hw = ancho / 2
        izq = suma(suma(eje[i], por(S2, -hw * math.cos(pliegue))), por(U2, hw * math.sin(pliegue)))
        der = suma(suma(eje[i], por(S2, hw * math.cos(pliegue))), por(U2, hw * math.sin(pliegue)))
        v = cel[2] + (cel[3] - cel[2]) * t
        filas.append([izq, eje[i], der, v, U2])
    um = (cel[0] + cel[1]) / 2
    for i in range(tramos):
        a = filas[i]
        b = filas[i + 1]
        # mitad izquierda y mitad derecha (pliegue en V por el nervio)
        poner_quad([a[0], a[1], b[1], b[0]], [[cel[0], a[3]], [um, a[3]], [um, b[3]], [cel[0], b[3]]], [a[4], a[4], b[4], b[4]], tinte)
        poner_quad([a[1], a[2], b[2], b[1]], [[um, a[3]], [cel[1], a[3]], [cel[1], b[3]], [um, b[3]]], [a[4], a[4], b[4], b[4]], tinte)

# hojas verdes en espiral: las de arriba (jóvenes) suben, las de abajo se abren y caen
NVERDES = 38
for i in range(NVERDES):
    f = i / (NVERDES - 1)                 # 0 = joven (arriba), 1 = vieja (abajo)
    rumbo = i * 2.39996 + entre(-0.15, 0.15)
    elev = math.radians(72 - 95 * f + entre(-8, 8))
    lng = entre(4.4, 5.6) * (0.7 + 0.3 * min(1.0, f * 2.5))
    caida = 0.02 + 0.07 * f + entre(0, 0.015)
    base = suma(cima, [0.12 * math.cos(rumbo), 0.12 * math.sin(rumbo), -0.6 * f + 0.1])
    celda = int(azar() * 7) % 7
    if f > 0.75 and azar() < 0.5:
        celda = 7 + int(azar() * 2) % 2
    tinte = [entre(0.9, 1.08), entre(0.95, 1.08), entre(0.9, 1.0)]
    hoja(base, rumbo, elev, lng, caida, celda, math.radians(entre(18, 30)), tinte)

# hojas secas colgando pegadas al tronco
for i in range(9):
    rumbo = i * 2.39996 + 1.3 + entre(-0.2, 0.2)
    elev = math.radians(entre(-82, -64))
    base = suma(cima, [0.2 * math.cos(rumbo), 0.2 * math.sin(rumbo), -0.75 - entre(0, 0.35)])
    tinte = [entre(0.85, 1.0), entre(0.85, 1.0), entre(0.85, 1.0)]
    hoja(base, rumbo, elev, entre(3.0, 3.8), 0.0, 9 + int(azar() * 3) % 3, math.radians(10), tinte, 6)

# racimos de dátiles: dos tarjetas cruzadas que cuelgan entre las hojas
for i in range(5):
    rumbo = i * 1.2566 + entre(-0.3, 0.3)
    fuera = [math.cos(rumbo), math.sin(rumbo), 0.0]
    arriba = suma(cima, suma(por(fuera, 0.55), [0, 0, -0.45]))
    alto = entre(0.8, 1.05)
    cel = celda_baja(int(azar() * 5) % 5)
    for k in range(2):
        g = rumbo + k * 1.5708
        sv = [math.cos(g) * alto * 0.45, math.sin(g) * alto * 0.45, 0.0]
        abajo = suma(arriba, suma(por(fuera, 0.25), [0, 0, -alto]))
        pts = [resta(abajo, sv), suma(abajo, sv), suma(arriba, sv), resta(arriba, sv)]
        uvs = [[cel[0], cel[2]], [cel[1], cel[2]], [cel[1], cel[3]], [cel[0], cel[3]]]
        n = [fuera, fuera, fuera, fuera]
        poner_quad(pts, uvs, n, [1.0, 1.0, 1.0])

# fibra alrededor de la cabeza del tronco
celf = celda_baja(5)
for i in range(8):
    g = i * 0.7854 + entre(-0.2, 0.2)
    fuera = [math.cos(g), math.sin(g), 0.0]
    lado = [-math.sin(g), math.cos(g), 0.0]
    c = suma(cima, suma(por(fuera, 0.3), [0, 0, -0.75 + entre(-0.15, 0.15)]))
    w = 0.55
    h = 0.5
    pts = [suma(resta(c, por(lado, w)), [0, 0, -h]), suma(suma(c, por(lado, w)), [0, 0, -h]), suma(suma(c, por(lado, w)), [0, 0, h]), suma(resta(c, por(lado, w)), [0, 0, h])]
    uvs = [[celf[0], celf[2]], [celf[1], celf[2]], [celf[1], celf[3]], [celf[0], celf[3]]]
    poner_quad(pts, uvs, [fuera, fuera, fuera, fuera], [0.9, 0.9, 0.9])

mesh_h = bpy.data.meshes.new("PD_Hojas")
mesh_h.from_pydata(H_VERTS, [], H_CARAS)
uvh = mesh_h.uv_layers.new(name="UVMap")
uvh.data.foreach_set("uv", H_UVS)
mesh_h.normals_split_custom_set(H_NORM)
colh = mesh_h.color_attributes.new(name="Sombra", type='FLOAT_COLOR', domain='CORNER')
colh.data.foreach_set("color", H_COL)
hojas = bpy.data.objects.new("PD_Copa_Hojas", mesh_h)
bpy.context.collection.objects.link(hojas)

img_hojas = bpy.data.images.load("palmera/hojas.png")
m_hojas = bpy.data.materials.new(name="PD_Hojas")
m_hojas.use_nodes = True
bsdf2 = m_hojas.node_tree.nodes.get("Principled BSDF")
bsdf2.inputs["Roughness"].default_value = 0.7
bsdf2.inputs["Metallic"].default_value = 0.0
tex2 = m_hojas.node_tree.nodes.new('ShaderNodeTexImage')
tex2.image = img_hojas
m_hojas.node_tree.links.new(tex2.outputs['Color'], bsdf2.inputs['Base Color'])
m_hojas.blend_method = 'CLIP'
m_hojas.alpha_threshold = 0.5
m_hojas.use_backface_culling = True
hojas.data.materials.append(m_hojas)

print("Palmera datilera: " + str(len(M_CARAS)) + " caras de estípite, " + str(int(len(H_CARAS) / 2)) + " caras de hojas")
