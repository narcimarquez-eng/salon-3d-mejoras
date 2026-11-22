import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# PINO PILONERO (Pinus pinea, pino piñonero) - para juego
# ==============================================================================
# Tronco y ramas: tubos curvos generados por código (curvas de Bézier con un
# poco de ondulación), con la corteza de la foto del usuario mapeada en UV a lo
# largo de cada rama: tronco -> 4 brazos -> ramas -> ramillas.
# Copa: "tarjetas" (planos como la hierba de los juegos) con los penachos y
# ramitas del atlas de Pinus pinea del usuario (public/pino/hojas.png), con
# recorte por alpha (blend_method = 'CLIP' -> alphaMode MASK en el GLB).
#  - Los penachos nacen en la punta de cada ramilla y apuntan arriba y afuera;
#    en la panza cuelgan ramitas.
#  - Normales propias hacia fuera de la copa: se ilumina como un volumen y no
#    como un montón de papeles. Cada tarjeta lleva sus dos caras modeladas
#    (con la misma normal) y el material sin doble cara.
#  - Color por vértice: interior y panza más oscuros (sombra horneada) y un
#    poco de variación de tono entre penachos.
# Forma típica de la especie: tronco corto que se abre en 4 ramas gruesas que
# suben en curva y una copa ancha en parasol, plana por debajo.
# Medidas aproximadas: altura ~12 m, copa ~13 m de diámetro, primera
# horquilla a ~4 m. No es un árbol concreto: lo genera una semilla.
# Ejes: Z = altura. Medidas en metros. Texturas en public/pino/.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.7, bloom=0.03)
bpy.ops.render.set_lighting(intensity=1.4, angle=40)
bpy.ops.render.set_ssao(intensity=1.1)

# ------------------------------------------------------------------
# Azar con semilla (mismo árbol en cada ejecución). Cambia SEMILLA para otro pino.
# ------------------------------------------------------------------
SEMILLA = 7
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
# Malla de madera: todas las ramas en una sola malla (un material = una pieza)
# ------------------------------------------------------------------
M_VERTS = []
M_CARAS = []
M_UVS = []
CORTEZA_ANCHO = 0.75   # metros de perímetro que ocupa la foto de corteza
CORTEZA_ALTO = 1.9     # metros de largo que ocupa la foto de corteza

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

def punto_en(eje, t):
    # punto del eje a fracción t (0..1)
    n = len(eje) - 1
    k = int(t * n)
    if k >= n:
        k = n - 1
    f = t * n - k
    return suma(por(eje[k], 1 - f), por(eje[k + 1], f))

def rama(p0, direccion, longitud, subida, r0, r1, lados, tramos, onda):
    # Rama que sale de p0 hacia "direccion" (rumbo en planta, unitario), se curva hacia arriba
    # y termina a "longitud" en horizontal y "subida" en vertical.
    d = unit([direccion[0], direccion[1], 0.0])
    p1 = suma(p0, suma(por(d, longitud * 0.25), [0, 0, subida * 0.45]))
    p2 = suma(p0, suma(por(d, longitud * 0.65), [0, 0, subida * 0.85]))
    p3 = suma(p0, suma(por(d, longitud), [0, 0, subida]))
    return tubo([p0, p1, p2, p3], r0, r1, lados, tramos, onda)

# ------------------------------------------------------------------
# 1. TRONCO: corto, algo inclinado y con la cepa ensanchada
# ------------------------------------------------------------------
inclina = [0.55, 0.25, 0.0]
horq = [inclina[0], inclina[1], 4.1]
tronco = tubo([[0, 0, -0.3], [0.05, 0.0, 1.4], [inclina[0] * 0.6, inclina[1] * 0.6, 2.8], horq], 0.46, 0.34, 12, 10, 0.08, 0.28)

# ------------------------------------------------------------------
# 2. RAMAS: 4 brazos gruesos que suben en curva, cada uno con 3-4 ramas
# ------------------------------------------------------------------
FUENTES = []   # puntos de las ramas de donde pueden salir ramillas
rumbo0 = entre(0, 6.28)
NBRAZOS = 4
for k in range(NBRAZOS):
    rumbo = rumbo0 + k * 2 * math.pi / NBRAZOS + entre(-0.35, 0.35)
    d = [math.cos(rumbo), math.sin(rumbo), 0.0]
    t0 = entre(0.78, 0.97)
    p0 = punto_en(tronco, t0)
    lon = entre(2.6, 3.6)
    sube = entre(3.6, 4.6)
    brazo = rama(p0, d, lon, sube, 0.27, 0.12, 10, 10, 0.35)
    for t in [0.75, 0.88, 1.0]:
        FUENTES.append(punto_en(brazo, t))
    nsec = 3 + int(azar() * 2)
    for s in range(nsec):
        ts = entre(0.4, 0.95)
        q0 = punto_en(brazo, ts)
        desv = entre(-0.9, 0.9)
        ds = [math.cos(rumbo + desv), math.sin(rumbo + desv), 0.0]
        sec = rama(q0, ds, entre(2.0, 3.6), entre(0.6, 1.6), 0.11 * (1.2 - ts * 0.5), 0.04, 6, 6, 0.25)
        for t in [0.45, 0.7, 0.85, 1.0]:
            FUENTES.append(punto_en(sec, t))

# ------------------------------------------------------------------
# 3. COPA EN PARASOL: puntos donde acaban las ramillas
# ------------------------------------------------------------------
CX = horq[0]
CY = horq[1]
RCOPA = 6.4      # radio de la copa (a la punta de las ramillas)
Z_BASE = 8.3     # panza
Z_ALTO = 11.2    # cima (los penachos suben ~1 m más)
ZC = 9.4         # centro del elipsoide de la copa (para normales y sombra)
HC = 2.6         # semialtura del elipsoide
PUNTAS = []
n_puntas = 300
for i in range(n_puntas):
    rr = RCOPA * math.sqrt((i + 0.5) / n_puntas) * entre(0.9, 1.05)
    aa = i * 2.39996 + entre(-0.25, 0.25)
    x = CX + rr * math.cos(aa)
    y = CY + rr * math.sin(aa)
    f = rr / RCOPA
    techo = Z_BASE + (Z_ALTO - Z_BASE) * (1 - f * f * f)
    if i % 4 == 0:
        z = Z_BASE + entre(-0.2, 0.4) + (1 - f) * 0.6     # capa de la panza
    else:
        z = techo - entre(0.0, 1.0)
    PUNTAS.append([x, y, z])

# ramillas: de la rama más cercana a cada punta, primero hacia fuera y luego hacia arriba
DIRS = []      # dirección de llegada de cada ramilla (orienta el penacho)
for i in range(n_puntas):
    m = PUNTAS[i]
    mejor = FUENTES[0]
    dmin = 999999.0
    for p in FUENTES:
        dd = largo(resta(p, m))
        if dd < dmin:
            dmin = dd
            mejor = p
    fuera = unit([m[0] - mejor[0], m[1] - mejor[1], 0.0])
    if dmin > 0.35:
        medio1 = suma(por(mejor, 0.62), por(m, 0.38))
        medio2 = suma(por(mejor, 0.25), por(m, 0.75))
        medio1[2] = medio1[2] + 0.2
        medio2[2] = medio2[2] - 0.15
        r0 = 0.035 + 0.012 * min(dmin, 3.0)
        tubo([mejor, medio1, medio2, m], r0, 0.015, 4, 3, 0.1)
        DIRS.append(unit(resta(m, medio2)))
    else:
        DIRS.append(unit(suma(fuera, [0, 0, 1.0])))

# Crear la malla de madera
mesh = bpy.data.meshes.new("PP_Madera")
mesh.from_pydata(M_VERTS, [], M_CARAS)
uv = mesh.uv_layers.new(name="UVMap")
uv.data.foreach_set("uv", M_UVS)
madera = bpy.data.objects.new("PP_Tronco_Ramas", mesh)
bpy.context.collection.objects.link(madera)

img_corteza = bpy.data.images.load("pino/corteza.jpg")
m_corteza = bpy.data.materials.new(name="PP_Corteza")
m_corteza.use_nodes = True
bsdf = m_corteza.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Roughness"].default_value = 0.95
bsdf.inputs["Metallic"].default_value = 0.0
tex = m_corteza.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = img_corteza
m_corteza.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
madera.data.materials.append(m_corteza)

# ------------------------------------------------------------------
# 4. TARJETAS DE FOLLAJE (atlas hojas.png: 6 columnas x 3 filas)
#    celdas 0-7: penachos con el tallo abajo; 8-14: ramitas colgantes con el tallo arriba;
#    15-17: penachos pequeños con el tallo abajo.
# ------------------------------------------------------------------
H_VERTS = []
H_CARAS = []
H_UVS = []
H_NORM = []
H_COL = []

def normal_copa(p):
    # normal del elipsoide de la copa en p, algo levantada hacia el cielo
    q = [(p[0] - CX) / (RCOPA * RCOPA), (p[1] - CY) / (RCOPA * RCOPA), (p[2] - ZC) / (HC * HC)]
    n = unit(q)
    return unit(suma(n, [0, 0, 0.35]))

def sombra(p):
    # 1 = fuera y arriba, ~0.4 = dentro y en la panza
    dx = (p[0] - CX) / RCOPA
    dy = (p[1] - CY) / RCOPA
    dz = (p[2] - ZC) / HC
    e = math.sqrt(dx * dx + dy * dy + dz * dz)
    if e > 1.0:
        e = 1.0
    a = 0.35 + 0.55 * e * e
    if dz < 0:
        a = a * (1.0 + 0.35 * dz)   # panza más oscura
    if a < 0.3:
        a = 0.3
    return a

def tarjeta(base, d, lado, lng, ancho, celda, tinte):
    # plano desde base (tallo) a lo largo de d, con anchura en la dirección lado
    col = celda % 6
    fil = int(celda / 6)
    u0 = col / 6.0 + 0.002
    u1 = (col + 1) / 6.0 - 0.002
    vt = 1.0 - fil / 3.0 - 0.002
    vb = 1.0 - (fil + 1) / 3.0 + 0.002
    if celda >= 8 and celda <= 14:
        v_tallo = vt      # colgantes: el tallo está arriba de la celda
        v_punta = vb
    else:
        v_tallo = vb
        v_punta = vt
    hw = por(lado, ancho / 2)
    pts = [resta(base, hw), suma(base, hw)]
    punta = suma(base, por(d, lng))
    pts.append(suma(punta, hw))
    pts.append(resta(punta, hw))
    uvs = [[u0, v_tallo], [u1, v_tallo], [u1, v_punta], [u0, v_punta]]
    b = len(H_VERTS)
    for k in range(4):
        H_VERTS.append((pts[k][0], pts[k][1], pts[k][2]))
    # cara delantera y trasera (orden inverso), con la misma normal de la copa
    caras = [[0, 1, 2, 3], [0, 3, 2, 1]]
    for c in caras:
        H_CARAS.append((b + c[0], b + c[1], b + c[2], b + c[3]))
        for k in c:
            H_UVS.append(uvs[k][0])
            H_UVS.append(uvs[k][1])
            n = normal_copa(pts[k])
            H_NORM.append((n[0], n[1], n[2]))
            s = sombra(pts[k])
            if k < 2:
                s = s * 0.8      # el tallo queda más metido en la copa
            H_COL.append(s * tinte[0])
            H_COL.append(s * tinte[1])
            H_COL.append(s * tinte[2])
            H_COL.append(1.0)

for i in range(n_puntas):
    m = PUNTAS[i]
    d0 = DIRS[i]
    fuera = unit([m[0] - CX, m[1] - CY, 0.01])
    f = largo([m[0] - CX, m[1] - CY, 0]) / RCOPA
    panza = (i % 4 == 0)
    tinte = [entre(0.9, 1.12), entre(0.95, 1.08), entre(0.9, 1.0)]
    # penachos en abanico: apuntan entre la dirección de la ramilla, hacia fuera y hacia arriba
    npen = 5 + int(azar() * 2)
    for k in range(npen):
        ang = k * 6.2832 / npen + entre(-0.4, 0.4)
        lateral = [math.cos(ang), math.sin(ang), 0.0]
        sube = entre(0.25, 1.0)
        if panza:
            sube = entre(-0.1, 0.35)
        d = unit(suma(suma(por(d0, 0.45), por(fuera, 0.6 * f)), suma(por(lateral, 0.9), [entre(-0.3, 0.3), entre(-0.3, 0.3), sube])))
        lado = unit(cruz(d, [entre(-1, 1), entre(-1, 1), entre(-0.3, 0.3)]))
        lng = entre(1.5, 2.2)
        celda = int(azar() * 8) % 8
        if (not panza) and f < 0.45 and azar() < 0.4:
            celda = 15 + int(azar() * 3) % 3
        tarjeta(suma(m, por(d, -0.12)), d, lado, lng, lng * 0.5, celda, tinte)
    # ramitas colgantes en la panza y en el borde
    if panza or f > 0.85:
        ncol = 1 + int(azar() * 2)
        for k in range(ncol):
            ang = entre(0, 6.2832)
            lateral = [math.cos(ang), math.sin(ang), 0.0]
            d = unit(suma(suma(por(fuera, 0.45), por(lateral, 0.35)), [0, 0, -1.0]))
            lado = unit(cruz(d, [0, 0, 1.0]))
            lng = entre(1.4, 1.9)
            tarjeta(m, d, lado, lng, lng * 0.5, 8 + int(azar() * 7) % 7, tinte)

mesh_h = bpy.data.meshes.new("PP_Hojas")
mesh_h.from_pydata(H_VERTS, [], H_CARAS)
uvh = mesh_h.uv_layers.new(name="UVMap")
uvh.data.foreach_set("uv", H_UVS)
mesh_h.normals_split_custom_set(H_NORM)
colh = mesh_h.color_attributes.new(name="Sombra", type='FLOAT_COLOR', domain='CORNER')
colh.data.foreach_set("color", H_COL)
hojas = bpy.data.objects.new("PP_Copa_Tarjetas", mesh_h)
bpy.context.collection.objects.link(hojas)

img_hojas = bpy.data.images.load("pino/hojas.png")
m_hojas = bpy.data.materials.new(name="PP_Aciculas")
m_hojas.use_nodes = True
bsdf2 = m_hojas.node_tree.nodes.get("Principled BSDF")
bsdf2.inputs["Roughness"].default_value = 0.75
bsdf2.inputs["Metallic"].default_value = 0.0
tex2 = m_hojas.node_tree.nodes.new('ShaderNodeTexImage')
tex2.image = img_hojas
m_hojas.node_tree.links.new(tex2.outputs['Color'], bsdf2.inputs['Base Color'])
m_hojas.blend_method = 'CLIP'
m_hojas.alpha_threshold = 0.5
m_hojas.use_backface_culling = True   # las dos caras ya están modeladas
hojas.data.materials.append(m_hojas)

print("Pino pilonero: " + str(len(M_CARAS)) + " caras de madera, " + str(int(len(H_CARAS) / 2)) + " tarjetas de follaje")
