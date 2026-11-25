import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# LIQUIDÁMBAR (Liquidambar styraciflua) en otoño - 15 m - para juego
# ==============================================================================
# Tronco recto que llega hasta la punta (guía dominante), copa ovalada algo
# piramidal y ramas que suben en espiral con ramas secundarias. Hojas en
# ramilletes de otoño: más rojos arriba, naranjas y amarillos abajo; algunas
# bolas de semillas colgando.
# Texturas de los atlas del usuario (liquidambar/generar_texturas_liquidambar.py):
#  - public/liquidambar/hojas.png: 10 ramilletes, 2 ramitas y una bola de semillas.
#  - public/liquidambar/corteza.jpg: paneles de corteza repetibles.
# Igual que el pinsapo: tubos curvos con UV, tarjetas con sus dos caras, normales
# de la copa (elipsoide) y sombra por vértice; ramas oscurecidas por vértice.
# Medidas: 15 m de alto, copa de ~8,5 m de ancho que empieza a 3,2 m.
# Ejes: Z = altura. Medidas en metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.7, bloom=0.03)
bpy.ops.render.set_lighting(intensity=1.4, angle=40)
bpy.ops.render.set_ssao(intensity=1.1)

# ------------------------------------------------------------------
# Azar con semilla (mismo árbol en cada ejecución). Cambia SEMILLA para otro liquidámbar.
# ------------------------------------------------------------------
SEMILLA = 21
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
# Malla de madera: tronco y ramas en una sola malla (un material = una pieza)
# ------------------------------------------------------------------
M_VERTS = []
M_CARAS = []
M_UVS = []
M_COL = []
TONO = [1.0]   # oscurecimiento por vértice de la madera (ramas más oscuras que el tronco)
CORTEZA_ANCHO = 0.45   # metros de perímetro que ocupa la textura de corteza
CORTEZA_ALTO = 1.8     # metros de largo que ocupa la textura de corteza

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
            for vi in [a, b, c2, d]:
                tono = TONO[0]
                if tono > 0.99:
                    # tronco: a la sombra de la copa por encima del primer piso de ramas
                    zz = M_VERTS[vi][2]
                    tono = 1.0 - 0.4 * min(1.0, max(0.0, (zz - 3.0) / 2.0))
                M_COL.append(tono)
                M_COL.append(tono)
                M_COL.append(tono)
                M_COL.append(1.0)
    return eje

def punto_en(eje, t):
    # punto del eje a fracción t (0..1)
    n = len(eje) - 1
    k = int(t * n)
    if k >= n:
        k = n - 1
    f = t * n - k
    return suma(por(eje[k], 1 - f), por(eje[k + 1], f))

# ------------------------------------------------------------------
# 1. TRONCO recto hasta la punta
# ------------------------------------------------------------------
ALTO = 15.0
Z0 = 3.2            # primeras ramas
RMAX = 4.3          # radio máximo de la copa
tronco = tubo([[0, 0, -0.3], [0.06, 0.03, ALTO * 0.33], [-0.04, 0.06, ALTO * 0.66], [0.03, 0.02, ALTO]], 0.34, 0.035, 12, 22, 0.05, 0.18)

def radio_copa(z):
    # copa ovalada (huevo): ancha a un 38 % de su altura, se cierra en punta
    f = (z - Z0) / (ALTO - Z0)
    q = 1 - ((f - 0.38) / 0.62) * ((f - 0.38) / 0.62)
    if q < 0:
        q = 0
    return 0.3 + (RMAX - 0.3) * math.sqrt(q)

ZC = Z0 + (ALTO - Z0) * 0.42
HC = (ALTO - Z0) / 2 + 0.6

# ------------------------------------------------------------------
# 2. TARJETAS (atlas hojas.png, 4x4 celdas de 512)
# ------------------------------------------------------------------
H_VERTS = []
H_CARAS = []
H_UVS = []
H_NORM = []
H_COL = []
ROJOS = [0, 2, 4, 7, 9, 10]
NARANJAS = [1, 3, 6, 8]
AMARILLOS = [5, 11]

def normal_copa(p):
    q = [p[0] / (RMAX * RMAX), p[1] / (RMAX * RMAX), (p[2] - ZC) / (HC * HC)]
    return unit(suma(unit(q), [0, 0, 0.35]))

def sombra(p):
    e = math.sqrt((p[0] / RMAX) * (p[0] / RMAX) + (p[1] / RMAX) * (p[1] / RMAX) + ((p[2] - ZC) / HC) * ((p[2] - ZC) / HC))
    if e > 1:
        e = 1
    a = 0.35 + 0.65 * e * e
    if p[2] < ZC - 1.5:
        a = a * 0.85
    return a

def tarjeta(base, d, lado, alto, ancho, celda, tinte, colgando=False):
    col = celda % 4
    fil = int(celda / 4)
    u0 = col / 4.0 + 0.002
    u1 = (col + 1) / 4.0 - 0.002
    vb = 1.0 - (fil + 1) / 4.0 + 0.002
    vt = 1.0 - fil / 4.0 - 0.002
    v_tallo = vb
    v_punta = vt
    if colgando:
        v_tallo = vt
        v_punta = vb
    hw = por(lado, ancho / 2)
    punta = suma(base, por(d, alto))
    pts = [resta(base, hw), suma(base, hw), suma(punta, hw), resta(punta, hw)]
    uvs = [[u0, v_tallo], [u1, v_tallo], [u1, v_punta], [u0, v_punta]]
    b = len(H_VERTS)
    for k in range(4):
        H_VERTS.append((pts[k][0], pts[k][1], pts[k][2]))
    caras = [[0, 1, 2, 3], [0, 3, 2, 1]]
    for c in caras:
        H_CARAS.append((b + c[0], b + c[1], b + c[2], b + c[3]))
        for k in c:
            H_UVS.append(uvs[k][0])
            H_UVS.append(uvs[k][1])
            n = normal_copa(pts[k])
            H_NORM.append((n[0], n[1], n[2]))
            s = sombra(pts[k])
            if k < 2 and not colgando:
                s = s * 0.85
            H_COL.append(s * tinte[0])
            H_COL.append(s * tinte[1])
            H_COL.append(s * tinte[2])
            H_COL.append(1.0)

def celda_por_altura(z):
    # arriba más rojo; abajo naranja y algo de amarillo
    f = (z - Z0) / (ALTO - Z0)
    r = azar()
    if r < 0.15 + 0.6 * f:
        lista = ROJOS
    elif r < 0.85 + 0.1 * f:
        lista = NARANJAS
    else:
        lista = AMARILLOS
    return lista[int(azar() * len(lista)) % len(lista)]

def ramillete(p, fuera, z):
    # 3-4 tarjetas cruzadas de pie, abiertas hacia fuera y arriba
    tam = entre(1.6, 2.3) * (0.7 + 0.3 * min(1.0, radio_copa(z) / 2.5))
    tinte = [entre(0.92, 1.08), entre(0.92, 1.05), entre(0.9, 1.0)]
    n = 3 + int(azar() * 2)
    g0 = entre(0, 3.14)
    for k in range(n):
        g = g0 + k * 3.1416 / n
        lado = [math.cos(g), math.sin(g), 0.0]
        d = unit(suma(por(fuera, entre(0.2, 0.7)), [entre(-0.25, 0.25), entre(-0.25, 0.25), 1.0]))
        lado = unit(resta(lado, por(d, punto(lado, d))))
        tarjeta(suma(p, [0, 0, -tam * 0.25]), d, lado, tam, tam, celda_por_altura(z), tinte)
    # una tumbada (casi horizontal, hacia fuera): tapa la copa vista desde arriba
    dh = unit(suma(fuera, [entre(-0.3, 0.3), entre(-0.3, 0.3), entre(0.25, 0.6)]))
    lh = unit(cruz(dh, [0, 0, 1.0]))
    tarjeta(suma(p, por(dh, -tam * 0.3)), dh, lh, tam, tam, celda_por_altura(z), tinte)

# ------------------------------------------------------------------
# 3. RAMAS en espiral, cada una con 2-3 secundarias; ramilletes en las puntas y a lo largo
# ------------------------------------------------------------------
SITIOS = []
z = Z0
k = 0
while z < ALTO - 1.2:
    f = (z - Z0) / (ALTO - Z0)
    rumbo = k * 2.39996 + entre(-0.2, 0.2)
    d = [math.cos(rumbo), math.sin(rumbo), 0.0]
    elev = math.radians(18 + 32 * f + entre(-6, 6))
    lng = radio_copa(z + 1.0) * entre(0.8, 0.95) / math.cos(elev)
    if lng < 0.6:
        lng = 0.6
    p0 = punto_en(tronco, z / ALTO)
    sube = lng * math.sin(elev)
    hz = lng * math.cos(elev)
    p1 = suma(p0, suma(por(d, hz * 0.3), [0, 0, sube * 0.45]))
    p2 = suma(p0, suma(por(d, hz * 0.68), [0, 0, sube * 0.8]))
    p3 = suma(p0, suma(por(d, hz), [0, 0, sube]))
    TONO[0] = 0.5
    eje = tubo([p0, p1, p2, p3], 0.04 + 0.03 * lng, 0.015, 6, 6, 0.15)
    SITIOS.append([eje[len(eje) - 1], d])
    SITIOS.append([punto_en(eje, 0.62), d])
    nsec = 2 + int(azar() * 2)
    for s in range(nsec):
        ts = entre(0.35, 0.85)
        q0 = punto_en(eje, ts)
        desv = entre(0.5, 1.0)
        if s % 2 == 0:
            desv = -desv
        ds = [math.cos(rumbo + desv), math.sin(rumbo + desv), 0.0]
        l2 = lng * entre(0.35, 0.55)
        q1 = suma(q0, suma(por(ds, l2 * 0.5), [0, 0, l2 * 0.35]))
        q2 = suma(q0, suma(por(ds, l2 * 0.85), [0, 0, l2 * 0.6]))
        sec = tubo([q0, q1, q1, q2], 0.03, 0.01, 5, 4, 0.08)
        SITIOS.append([sec[len(sec) - 1], ds])
    z = z + entre(0.32, 0.45)
    k = k + 1

for s in SITIOS:
    p = s[0]
    fuera = unit([p[0], p[1], 0.01])
    ramillete(p, fuera, p[2])

# relleno: ramilletes sueltos en la superficie de la copa (tapan huecos), unidos por una ramilla
for i in range(90):
    zz = Z0 + 0.6 + (ALTO - Z0 - 1.2) * math.sqrt((i + 0.5) / 90)   # más arriba, donde quedaba hueco
    a = i * 2.39996 + 0.7
    r = radio_copa(zz) * entre(0.45, 0.92)
    p = [r * math.cos(a), r * math.sin(a), zz]
    ramillete(p, unit([p[0], p[1], 0.01]), zz)

# punta: ramilletes de pie
cima = punto_en(tronco, 1.0)
for i in range(3):
    g = i * 1.047
    lado = [math.cos(g), math.sin(g), 0.0]
    tarjeta(suma(cima, [0, 0, -0.8]), [0, 0, 1.0], lado, 1.7, 1.7, ROJOS[i % 5], [1.0, 1.0, 1.0])

# remate de la copa: ramilletes inclinados alrededor de la cima (desde arriba no queda hueco)
for i in range(10):
    g = i * 0.628 + entre(-0.15, 0.15)
    fuera = [math.cos(g), math.sin(g), 0.0]
    zz = ALTO - entre(0.8, 2.2)
    p = suma(punto_en(tronco, zz / ALTO), por(fuera, entre(0.1, 0.5)))
    d = unit(suma(por(fuera, entre(0.6, 1.0)), [0, 0, 0.8]))
    lado = unit(cruz(d, [0, 0, 1.0]))
    tam = entre(1.5, 2.0)
    tarjeta(p, d, lado, tam, tam, celda_por_altura(ALTO), [1.0, 1.0, 1.0])

# bolas de semillas colgando
for i in range(30):
    s = SITIOS[int(azar() * len(SITIOS)) % len(SITIOS)]
    p = suma(s[0], [entre(-0.3, 0.3), entre(-0.3, 0.3), -0.15])
    g = entre(0, 3.14)
    for c in range(2):
        lado = [math.cos(g + c * 1.5708), math.sin(g + c * 1.5708), 0.0]
        tarjeta(p, [0, 0, -1.0], lado, 0.55, 0.55, 12, [1.0, 1.0, 1.0], True)

mesh = bpy.data.meshes.new("LQ_Madera")
mesh.from_pydata(M_VERTS, [], M_CARAS)
uv = mesh.uv_layers.new(name="UVMap")
uv.data.foreach_set("uv", M_UVS)
colm = mesh.color_attributes.new(name="Tono", type='FLOAT_COLOR', domain='CORNER')
colm.data.foreach_set("color", M_COL)
madera = bpy.data.objects.new("LQ_Tronco_Ramas", mesh)
bpy.context.collection.objects.link(madera)

img_corteza = bpy.data.images.load("liquidambar/corteza.jpg")
m_corteza = bpy.data.materials.new(name="LQ_Corteza")
m_corteza.use_nodes = True
bsdf = m_corteza.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Roughness"].default_value = 0.95
bsdf.inputs["Metallic"].default_value = 0.0
tex = m_corteza.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = img_corteza
m_corteza.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
madera.data.materials.append(m_corteza)

mesh_h = bpy.data.meshes.new("LQ_Hojas")
mesh_h.from_pydata(H_VERTS, [], H_CARAS)
uvh = mesh_h.uv_layers.new(name="UVMap")
uvh.data.foreach_set("uv", H_UVS)
mesh_h.normals_split_custom_set(H_NORM)
colh = mesh_h.color_attributes.new(name="Sombra", type='FLOAT_COLOR', domain='CORNER')
colh.data.foreach_set("color", H_COL)
hojas = bpy.data.objects.new("LQ_Copa_Hojas", mesh_h)
bpy.context.collection.objects.link(hojas)

img_hojas = bpy.data.images.load("liquidambar/hojas.png")
m_hojas = bpy.data.materials.new(name="LQ_Hojas")
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

print("Liquidámbar: " + str(k) + " ramas, " + str(len(SITIOS)) + " ramilletes en ramas, " + str(len(M_CARAS)) + " caras de madera, " + str(int(len(H_CARAS) / 2)) + " tarjetas")
