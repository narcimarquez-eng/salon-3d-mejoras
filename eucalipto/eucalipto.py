import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# EUCALIPTO GIGANTE (Eucalyptus) - 40 m - para juego
# ==============================================================================
# Tronco muy grueso con corteza rugosa en la base (los primeros 6,5 m) y lisa
# por encima, que se desprende en tiras grises, ocres y rosadas. A unos 15 m se
# abre en muchos brazos; la copa es una cúpula ancha y muy llena,
# con las hojas en mechones al final de las ramas y colgando, como en el
# eucalipto real. Algunos frutos colgando.
# Texturas del atlas del usuario (eucalipto/generar_texturas_eucalipto.py):
#  - public/eucalipto/hojas.png: 2 ramilletes colgantes, 3 ramas de hojas, hojas
#    redondas plateadas (juveniles), 2 ramitas y 2 de frutos.
#  - public/eucalipto/corteza.jpg (lisa) y corteza_base.jpg (rugosa), repetibles.
# Igual que el liquidámbar: tubos curvos con UV, tarjetas con sus dos caras,
# normales de la copa (elipsoide) y sombra por vértice.
# Tamaño y forma de la foto del usuario (eucalipto gigante con una persona al pie):
# ~40 m de alto, tronco de ~3 m de diámetro con contrafuertes, cruz a ~15 m con
# 6 brazos que suben y 5 más bajos casi horizontales, copa en cúpula muy llena
# de ~32 m de ancho, y tiras de corteza caídas en el suelo.
# Ejes: Z = altura. Medidas en metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.7, bloom=0.03)
bpy.ops.render.set_lighting(intensity=1.4, angle=40)
bpy.ops.render.set_ssao(intensity=1.1)

# ------------------------------------------------------------------
# Azar con semilla (mismo árbol en cada ejecución). Cambia SEMILLA para otro eucalipto.
# ------------------------------------------------------------------
SEMILLA = 9
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
CORTEZA_ANCHO = 1.9    # metros de perímetro que ocupa la textura de corteza
CORTEZA_ALTO = 2.6     # metros de largo que ocupa la textura de corteza

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
                    tono = 1.0 - 0.3 * min(1.0, max(0.0, (zz - 12.0) / 6.0))
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
# 1. TRONCO: base rugosa con contrafuertes (malla aparte) y fuste liso hasta la cruz
# ------------------------------------------------------------------
ALTO = 40.0
Z_CRUZ = 15.0
eje_tronco = [[0, 0, -0.4], [0.15, 0.05, 5.0], [0.3, -0.05, 10.5], [0.4, 0.1, Z_CRUZ]]
# base rugosa: manguito algo más grueso que el fuste liso, de 0 a 6,5 m, con la cepa muy ensanchada
tubo([[0, 0, -0.5], [0.05, 0.02, 2.0], [0.12, 0.025, 4.3], [0.19, 0.03, 6.5]], 1.62, 1.36, 18, 8, 0.0, 1.1)
# contrafuertes: raíces gruesas que salen de la cepa y se meten en el suelo
for k in range(6):
    a = k * 1.047 + entre(-0.25, 0.25)
    d = [math.cos(a), math.sin(a), 0.0]
    r0 = suma(por(d, 0.8), [0, 0, 2.6])
    r3 = suma(por(d, entre(3.2, 4.4)), [0, 0, -0.6])
    tubo([r0, suma(por(d, 1.7), [0, 0, 1.2]), suma(por(d, 2.6), [0, 0, 0.2]), r3], 0.75, 0.2, 10, 6, 0.1)
mesh_b = bpy.data.meshes.new("EU_Base")
mesh_b.from_pydata(M_VERTS, [], M_CARAS)
uvb = mesh_b.uv_layers.new(name="UVMap")
uvb.data.foreach_set("uv", M_UVS)
colb = mesh_b.color_attributes.new(name="Tono", type='FLOAT_COLOR', domain='CORNER')
colb.data.foreach_set("color", M_COL)
base = bpy.data.objects.new("EU_Tronco_Base", mesh_b)
bpy.context.collection.objects.link(base)
img_b = bpy.data.images.load("eucalipto/corteza_base.jpg")
m_base = bpy.data.materials.new(name="EU_Corteza_Rugosa")
m_base.use_nodes = True
bb = m_base.node_tree.nodes.get("Principled BSDF")
bb.inputs["Roughness"].default_value = 0.95
bb.inputs["Metallic"].default_value = 0.0
tb = m_base.node_tree.nodes.new('ShaderNodeTexImage')
tb.image = img_b
m_base.node_tree.links.new(tb.outputs['Color'], bb.inputs['Base Color'])
base.data.materials.append(m_base)
# el fuste liso va en otra malla (otro material): se vacían las listas y se empieza de nuevo
M_VERTS = []
M_CARAS = []
M_UVS = []
M_COL = []

fuste = tubo(eje_tronco, 1.45, 0.95, 18, 20, 0.08, 0.0)

# ------------------------------------------------------------------
# 2. BRAZOS Y RAMAS (como en la foto: muchos brazos desde la cruz, los de abajo casi horizontales)
# ------------------------------------------------------------------
SITIOS = []     # [punto, dirección horizontal, peso] donde nacen mechones de hojas
cruz_p = punto_en(fuste, 1.0)
rumbo0 = entre(0, 6.28)

def ramificar(eje_b, rumbo, nram, lmin, lmax, grosor):
    for r in range(nram):
        tr = entre(0.25, 0.95)
        q0 = punto_en(eje_b, tr)
        desv = entre(0.5, 1.5)
        if r % 2 == 0:
            desv = -desv
        dr = [math.cos(rumbo + desv), math.sin(rumbo + desv), 0.0]
        lng = entre(lmin, lmax) * (1.15 - tr * 0.45)
        q1 = suma(q0, suma(por(dr, lng * 0.45), [0, 0, lng * 0.32]))
        q2 = suma(q0, suma(por(dr, lng * 0.85), [0, 0, lng * 0.42]))
        q3 = suma(q0, suma(por(dr, lng), [0, 0, lng * 0.25]))
        TONO[0] = 0.72
        rama = tubo([q0, q1, q2, q3], grosor * (1.1 - tr * 0.5), 0.04, 7, 7, 0.45)
        SITIOS.append([rama[len(rama) - 1], dr, 1.0])
        SITIOS.append([punto_en(rama, 0.55), dr, 0.8])
        for s in range(4):
            u0 = punto_en(rama, entre(0.35, 0.95))
            ang = rumbo + desv + entre(-1.0, 1.0)
            dd = [math.cos(ang), math.sin(ang), 0.0]
            l3 = entre(1.6, 3.2)
            u3 = suma(u0, suma(por(dd, l3), [0, 0, entre(0.2, 1.2)]))
            TONO[0] = 0.6
            tubo([u0, suma(u0, por(resta(u3, u0), 0.4)), suma(u0, por(resta(u3, u0), 0.75)), u3], 0.06, 0.02, 5, 3, 0.2)
            SITIOS.append([u3, dd, 0.85])

# brazos altos desde la cruz: suben abriéndose hasta la cima
NB = 6
for k in range(NB):
    rumbo = rumbo0 + k * 6.2832 / NB + entre(-0.3, 0.3)
    d = [math.cos(rumbo), math.sin(rumbo), 0.0]
    abre = entre(6.0, 10.0)
    sube = entre(17.0, 23.0)
    p0 = suma(cruz_p, [0, 0, entre(-2.0, 0.0)])
    p1 = suma(p0, suma(por(d, abre * 0.35), [0, 0, sube * 0.3]))
    p2 = suma(p0, suma(por(d, abre * 0.75), [0, 0, sube * 0.65]))
    p3 = suma(p0, suma(por(d, abre), [0, 0, sube]))
    TONO[0] = 0.92
    brazo = tubo([p0, p1, p2, p3], entre(0.55, 0.75), 0.12, 12, 14, 0.9)
    SITIOS.append([brazo[len(brazo) - 1], d, 1.4])
    ramificar(brazo, rumbo, 8 + int(azar() * 3), 5.0, 9.0, 0.24)

# brazos bajos que se abren casi en horizontal y caen en la punta (entre 11 y 15 m)
for k in range(5):
    rumbo = rumbo0 + 0.6 + k * 1.2566 + entre(-0.3, 0.3)
    d = [math.cos(rumbo), math.sin(rumbo), 0.0]
    z = entre(11.0, 14.5)
    q0 = punto_en(fuste, z / Z_CRUZ)
    lng = entre(11.0, 15.0)
    p1 = suma(q0, suma(por(d, lng * 0.35), [0, 0, lng * 0.25]))
    p2 = suma(q0, suma(por(d, lng * 0.75), [0, 0, lng * 0.3]))
    p3 = suma(q0, suma(por(d, lng), [0, 0, lng * 0.12]))
    TONO[0] = 0.85
    brazo = tubo([q0, p1, p2, p3], entre(0.4, 0.5), 0.08, 10, 12, 0.7)
    SITIOS.append([brazo[len(brazo) - 1], d, 1.3])
    ramificar(brazo, rumbo, 6 + int(azar() * 3), 4.0, 7.0, 0.18)

# ------------------------------------------------------------------
# 3. FOLLAJE: mechones de tarjetas (atlas hojas.png, 4x4 celdas de 512)
# ------------------------------------------------------------------
H_VERTS = []
H_CARAS = []
H_UVS = []
H_NORM = []
H_COL = []
CC = [0.0, 0.0, 27.5]   # centro de la copa
RH = 15.0               # semiancho
RV = 14.5               # semialto
COLGANTES = [0, 1]
RAMAS = [2, 3, 4, 6]

def normal_copa(p):
    q = [(p[0] - CC[0]) / (RH * RH), (p[1] - CC[1]) / (RH * RH), (p[2] - CC[2]) / (RV * RV)]
    return unit(suma(unit(q), [0, 0, 0.3]))

def sombra(p):
    ex = (p[0] - CC[0]) / RH
    ey = (p[1] - CC[1]) / RH
    ez = (p[2] - CC[2]) / RV
    e = math.sqrt(ex * ex + ey * ey + ez * ez)
    if e > 1:
        e = 1
    a = 0.4 + 0.6 * e * e
    if p[2] < CC[2] - 4:
        a = a * 0.88
    return a

def tarjeta(base, d, lado, alto, ancho, celda, tinte, colgando=False, nfija=[]):
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
            if len(nfija) > 0:
                n = nfija
            H_NORM.append((n[0], n[1], n[2]))
            s = sombra(pts[k])
            if len(nfija) > 0:
                s = 0.95
            if k < 2 and not colgando:
                s = s * 0.85
            H_COL.append(s * tinte[0])
            H_COL.append(s * tinte[1])
            H_COL.append(s * tinte[2])
            H_COL.append(1.0)

def mechon(p, fuera, peso):
    tinte = [entre(0.92, 1.06), entre(0.95, 1.05), entre(0.95, 1.05)]
    # colgantes: 2-3 tarjetas cruzadas que caen desde el punto
    nc = 2 + int(azar() * 2)
    g0 = entre(0, 3.14)
    for k in range(nc):
        g = g0 + k * 3.1416 / nc
        lado = [math.cos(g), math.sin(g), 0.0]
        alto = entre(2.0, 3.0) * peso
        d = unit(suma([0, 0, -1.0], por(fuera, entre(0.5, 1.1))))
        tarjeta(suma(p, [0, 0, 0.35]), d, lado, alto, alto * 0.75, COLGANTES[int(azar() * 2) % 2], tinte, True)
    # ramas de hojas de pie y una tumbada hacia fuera (tapa desde arriba)
    for k in range(3):
        g = g0 + 0.8 + k * 1.0472
        lado = [math.cos(g), math.sin(g), 0.0]
        alto = entre(1.6, 2.3) * peso
        d = unit(suma(por(fuera, entre(0.2, 0.6)), [entre(-0.2, 0.2), entre(-0.2, 0.2), 1.0]))
        lado = unit(resta(lado, por(d, punto(lado, d))))
        tarjeta(suma(p, [0, 0, -alto * 0.3]), d, lado, alto, alto, RAMAS[int(azar() * 4) % 4], tinte)
    dh = unit(suma(fuera, [entre(-0.3, 0.3), entre(-0.3, 0.3), entre(0.2, 0.5)]))
    lh = unit(cruz(dh, [0, 0, 1.0]))
    alto = entre(2.4, 3.2) * peso
    tarjeta(suma(p, por(dh, -alto * 0.3)), dh, lh, alto, alto, COLGANTES[int(azar() * 2) % 2], tinte)

for s in SITIOS:
    p = s[0]
    fuera = unit([p[0] - CC[0], p[1] - CC[1], 0.01])
    mechon(p, fuera, s[2])

# relleno: mechones sueltos en la copa, en grupos (copa abierta, con claros)
for i in range(70):
    g = SITIOS[int(azar() * len(SITIOS)) % len(SITIOS)]
    p = suma(g[0], [entre(-3.0, 3.0), entre(-3.0, 3.0), entre(-2.5, 1.5)])
    mechon(p, unit([p[0] - CC[0], p[1] - CC[1], 0.01]), entre(0.8, 1.1))
# copa frondosa: mechones repartidos por la capa exterior de la cúpula (espiral de Fibonacci)
NCAPA = 300
def masa(p):
    # masas de follaje: tres ondas cruzadas; donde es baja hay un claro (como en la foto)
    return math.sin(p[0] * 0.42 + 1.3) + math.sin(p[1] * 0.37 + 0.4) + math.sin(p[2] * 0.33 + p[0] * 0.1)
for i in range(NCAPA):
    zf = 1.0 - 1.4 * (i + 0.5) / NCAPA           # de arriba (1) a algo por debajo del ecuador (-0.4)
    rr = math.sqrt(max(0.0, 1.0 - zf * zf))
    a = i * 2.39996
    e = entre(0.72, 0.98)
    p = [CC[0] + RH * rr * math.cos(a) * e, CC[1] + RH * rr * math.sin(a) * e, CC[2] + RV * zf * e]
    if p[2] < 14.0 or masa(p) < -0.9:
        continue
    mechon(p, unit([p[0] - CC[0], p[1] - CC[1], 0.01]), entre(0.9, 1.2))

# tiras de corteza que se desprenden (celdas 10-11 del atlas): cuelgan pegadas al tronco donde la
# corteza rugosa da paso a la lisa (5 m), en la cruz y a lo largo de los brazos
def tira(eje, t, radio, largo, ang):
    c = punto_en(eje, t)
    fuera = [math.cos(ang), math.sin(ang), 0.0]
    lado = [-math.sin(ang), math.cos(ang), 0.0]
    arriba = suma(c, por(fuera, radio + 0.04))
    d = unit(suma([0, 0, -1.0], por(fuera, entre(0.12, 0.3))))
    tarjeta(arriba, d, lado, largo, largo * 0.7, 10 + int(azar() * 2) % 2, [entre(0.9, 1.05), 0.95, 0.9], True, fuera)

for i in range(34):
    a = i * 0.1848 + entre(-0.08, 0.08)
    tira(fuste, entre(7.2, 8.6) / Z_CRUZ, 1.32, entre(2.6, 4.2), a)
for i in range(22):
    a = entre(0, 6.28)
    tira(fuste, entre(0.62, 0.98), 1.05, entre(2.0, 3.4), a)

# tiras de corteza caídas en el suelo alrededor del tronco
for i in range(40):
    a = entre(0, 6.28)
    r = entre(2.0, 7.0)
    c = [r * math.cos(a), r * math.sin(a), 0.04 + 0.01 * i / 40]
    g = entre(0, 6.28)
    d = [math.cos(g), math.sin(g), 0.0]
    lado = [-math.sin(g), math.cos(g), 0.0]
    lt = entre(1.6, 3.0)
    tarjeta(resta(c, por(d, lt / 2)), d, lado, lt, lt * 0.6, 10 + (i % 2), [0.9, 0.85, 0.8], True, [0.0, 0.0, 1.0])

# ramitas peladas y secas (celdas 12-13) entre la copa
for i in range(28):
    g = SITIOS[int(azar() * len(SITIOS)) % len(SITIOS)]
    p = suma(g[0], [entre(-1.5, 1.5), entre(-1.5, 1.5), entre(-1.5, 0.5)])
    a = entre(0, 3.14)
    d = unit([entre(-0.4, 0.4), entre(-0.4, 0.4), 1.0])
    lado = unit(resta([math.cos(a), math.sin(a), 0.0], por(d, punto([math.cos(a), math.sin(a), 0.0], d))))
    tarjeta(p, d, lado, entre(1.0, 1.6), entre(1.0, 1.6), 12 + (i % 2), [1.0, 1.0, 1.0])

# frutos colgando
for i in range(24):
    g = SITIOS[int(azar() * len(SITIOS)) % len(SITIOS)]
    p = suma(g[0], [entre(-0.6, 0.6), entre(-0.6, 0.6), -0.2])
    a = entre(0, 3.14)
    for c in range(2):
        lado = [math.cos(a + c * 1.5708), math.sin(a + c * 1.5708), 0.0]
        tarjeta(p, [0, 0, -1.0], lado, 0.5, 0.5, 8 + (i % 2), [1.0, 1.0, 1.0], True)

# ------------------------------------------------------------------
# 4. MALLAS Y MATERIALES
# ------------------------------------------------------------------
mesh = bpy.data.meshes.new("EU_Madera")
mesh.from_pydata(M_VERTS, [], M_CARAS)
uv = mesh.uv_layers.new(name="UVMap")
uv.data.foreach_set("uv", M_UVS)
colm = mesh.color_attributes.new(name="Tono", type='FLOAT_COLOR', domain='CORNER')
colm.data.foreach_set("color", M_COL)
madera = bpy.data.objects.new("EU_Fuste_Ramas", mesh)
bpy.context.collection.objects.link(madera)
img_c = bpy.data.images.load("eucalipto/corteza.jpg")
m_corteza = bpy.data.materials.new(name="EU_Corteza_Lisa")
m_corteza.use_nodes = True
bsdf = m_corteza.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Roughness"].default_value = 0.8
bsdf.inputs["Metallic"].default_value = 0.0
tex = m_corteza.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = img_c
m_corteza.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
madera.data.materials.append(m_corteza)

mesh_h = bpy.data.meshes.new("EU_Hojas")
mesh_h.from_pydata(H_VERTS, [], H_CARAS)
uvh = mesh_h.uv_layers.new(name="UVMap")
uvh.data.foreach_set("uv", H_UVS)
mesh_h.normals_split_custom_set(H_NORM)
colh = mesh_h.color_attributes.new(name="Sombra", type='FLOAT_COLOR', domain='CORNER')
colh.data.foreach_set("color", H_COL)
hojas = bpy.data.objects.new("EU_Copa_Hojas", mesh_h)
bpy.context.collection.objects.link(hojas)
img_h = bpy.data.images.load("eucalipto/hojas.png")
m_hojas = bpy.data.materials.new(name="EU_Hojas")
m_hojas.use_nodes = True
bsdf2 = m_hojas.node_tree.nodes.get("Principled BSDF")
bsdf2.inputs["Roughness"].default_value = 0.7
bsdf2.inputs["Metallic"].default_value = 0.0
tex2 = m_hojas.node_tree.nodes.new('ShaderNodeTexImage')
tex2.image = img_h
m_hojas.node_tree.links.new(tex2.outputs['Color'], bsdf2.inputs['Base Color'])
m_hojas.blend_method = 'CLIP'
m_hojas.alpha_threshold = 0.5
m_hojas.use_backface_culling = True
hojas.data.materials.append(m_hojas)

print("Eucalipto: " + str(len(SITIOS)) + " mechones en ramas, " + str(len(M_CARAS)) + " caras de madera, " + str(int(len(H_CARAS) / 2)) + " tarjetas")
