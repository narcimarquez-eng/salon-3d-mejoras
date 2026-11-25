import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# PINSAPO DE NAVIDAD (Abies pinsapo) - para juego
# El pinsapo de pinsapo/pinsapo.py con decoración de Navidad (al final del script).
# ==============================================================================
# Abeto de la serranía de Ronda y Grazalema: copa cónica y densa, tronco recto
# y gris, ramas en verticilos (pisos) casi horizontales con la punta un poco
# levantada, ramitas planas de acículas cortas y verde azuladas, y piñas que se
# levantan derechas en las ramas altas.
# Texturas de los atlas del usuario (pinsapo/generar_texturas_pinsapo.py):
#  - public/pinsapo/ramas.png: 8 ramitas (tallo abajo, eje centrado), una con piñas.
#  - public/pinsapo/corteza.jpg: parche de corteza repetible.
# Tronco y ramas: tubos curvos con UV propias. Follaje: tarjetas de ramitas a lo
# largo de cada rama, casi planas (como crecen) con algo de giro para que de
# lado no desaparezcan; normales del cono de la copa y sombra por vértice.
# Medidas aproximadas de un pinsapo adulto: 18 m de alto, copa de 8 m de ancho.
# Ejes: Z = altura. Medidas en metros.
# ==============================================================================

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

bpy.ops.render.set_engine(engine='BLENDER_EEVEE_NEXT', env_intensity=0.7, bloom=0.03)
bpy.ops.render.set_lighting(intensity=1.4, angle=40)
bpy.ops.render.set_ssao(intensity=1.1)

# ------------------------------------------------------------------
# Azar con semilla (mismo árbol en cada ejecución). Cambia SEMILLA para otro pinsapo.
# ------------------------------------------------------------------
SEMILLA = 5
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
CORTEZA_ANCHO = 0.58   # metros de perímetro que ocupa la textura de corteza
CORTEZA_ALTO = 0.9     # metros de largo que ocupa la textura de corteza

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
                    tono = 1.0 - 0.45 * min(1.0, max(0.0, (zz - 1.2) / 1.5))
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
# 1. TRONCO recto con la base ensanchada
# ------------------------------------------------------------------
ALTO = 18.0
R_BASE = 4.2        # radio de la copa abajo (largo de las ramas bajas)
Z0 = 1.6            # primer piso de ramas
tronco = tubo([[0, 0, -0.3], [0.05, 0.02, ALTO * 0.33], [-0.05, 0.04, ALTO * 0.66], [0.02, 0.0, ALTO]], 0.42, 0.04, 12, 20, 0.05, 0.22)

def radio_copa(z):
    # cono algo abombado (pinsapo adulto: la copa se redondea un poco)
    f = (z - Z0) / (ALTO - Z0)
    if f < 0:
        f = 0
    if f > 1:
        f = 1
    return R_BASE * math.pow(1 - f, 0.9) * (1 + 0.25 * math.sin(f * math.pi)) + 0.15

# ------------------------------------------------------------------
# 2. FOLLAJE: tarjetas de ramitas (atlas ramas.png, 4x2 celdas de 512x1024)
#    0-5 ramitas, 6 ramita con piñas, 7 ramita con yemas rojas.
# ------------------------------------------------------------------
H_VERTS = []
H_CARAS = []
H_UVS = []
H_NORM = []
H_COL = []

def normal_cono(p):
    # normal del cono de la copa: hacia fuera y algo hacia arriba
    rx = p[0]
    ry = p[1]
    r = math.sqrt(rx * rx + ry * ry) + 0.001
    pend = R_BASE / (ALTO - Z0)
    return unit([rx / r, ry / r, pend + 0.35])

def sombra(p):
    r = math.sqrt(p[0] * p[0] + p[1] * p[1])
    rc = radio_copa(p[2])
    f = r / rc
    if f > 1:
        f = 1
    a = 0.3 + 0.7 * f * f
    a = a * (0.8 + 0.2 * min(1.0, p[2] / ALTO * 1.6))   # pisos de abajo algo más oscuros
    return a

def tarjeta(base, d, lado, lng, celda, tinte, levantar=0.0):
    # ramita desde base (tallo) hacia d, ancho en la dirección lado (celda 512x1024: ancho = lng / 2)
    col = celda % 4
    fil = int(celda / 4)
    u0 = col / 4.0 + 0.002
    u1 = (col + 1) / 4.0 - 0.002
    vb = 1.0 - (fil + 1) / 2.0 + 0.002
    vt = 1.0 - fil / 2.0 - 0.002
    hw = por(lado, lng / 4)
    punta = suma(suma(base, por(d, lng)), [0, 0, levantar])
    pts = [resta(base, hw), suma(base, hw), suma(punta, hw), resta(punta, hw)]
    uvs = [[u0, vb], [u1, vb], [u1, vt], [u0, vt]]
    b = len(H_VERTS)
    for k in range(4):
        H_VERTS.append((pts[k][0], pts[k][1], pts[k][2]))
    caras = [[0, 1, 2, 3], [0, 3, 2, 1]]
    for c in caras:
        H_CARAS.append((b + c[0], b + c[1], b + c[2], b + c[3]))
        for k in c:
            H_UVS.append(uvs[k][0])
            H_UVS.append(uvs[k][1])
            n = normal_cono(pts[k])
            H_NORM.append((n[0], n[1], n[2]))
            s = sombra(pts[k])
            if k < 2:
                s = s * 0.85
            H_COL.append(s * tinte[0])
            H_COL.append(s * tinte[1])
            H_COL.append(s * tinte[2])
            H_COL.append(1.0)

# ------------------------------------------------------------------
# 3. PISOS DE RAMAS (verticilos): 4-6 ramas por piso, cada uno girado respecto al anterior
# ------------------------------------------------------------------
z = Z0
piso = 0
giro0 = entre(0, 6.28)
while z < ALTO - 1.0:
    f = (z - Z0) / (ALTO - Z0)
    nramas = 5 + int(azar() * 2)
    if f > 0.7:
        nramas = 4
    giro0 = giro0 + 0.62
    for k in range(nramas):
        rumbo = giro0 + k * 2 * math.pi / nramas + entre(-0.25, 0.25)
        d = [math.cos(rumbo), math.sin(rumbo), 0.0]
        lng = radio_copa(z) * entre(0.85, 1.05)
        if lng < 0.4:
            lng = 0.4
        p0 = punto_en(tronco, z / ALTO)
        # las ramas bajas caen un poco y levantan la punta; las altas suben
        cae = -0.12 * lng * (1 - f)
        sube = 0.10 * lng + 0.6 * f * lng
        p1 = suma(p0, suma(por(d, lng * 0.35), [0, 0, cae]))
        p2 = suma(p0, suma(por(d, lng * 0.7), [0, 0, cae * 0.8 + sube * 0.3]))
        p3 = suma(p0, suma(por(d, lng), [0, 0, sube * 0.6]))
        rr = 0.025 + 0.018 * lng
        TONO[0] = 0.42
        eje = tubo([p0, p1, p2, p3], rr, 0.012, 5, 4, 0.06)
        # ramitas a lo largo de la rama: a los dos lados, hacia fuera y casi planas
        lado_h = [-d[1], d[0], 0.0]
        nest = 2 + int(lng / 0.55)
        tinte = [entre(0.92, 1.05), entre(0.95, 1.06), entre(0.95, 1.08)]
        for e in range(nest):
            t = 0.18 + 0.82 * (e + entre(0.2, 0.8)) / nest
            q = punto_en(eje, t)
            largo_r = entre(1.2, 1.7) * (0.55 + 0.45 * min(1.0, lng / 2.5))
            for s in [-1, 0, 1]:
                ang = s * entre(0.55, 0.95)
                dd = unit(suma(por(d, math.cos(ang)), por(lado_h, math.sin(ang))))
                dd = unit(suma(dd, [0, 0, entre(-0.05, 0.25)]))
                rol = entre(-0.7, 0.7)
                if s == 0:
                    # la del centro sube y queda de canto: da volumen visto de lado
                    dd = unit(suma(por(d, 0.6), [0, 0, entre(0.5, 0.9)]))
                    rol = entre(1.2, 1.57)
                    if azar() < 0.5:
                        rol = -rol
                # ramita casi horizontal, girada alrededor de su eje
                lat = unit(cruz(dd, [0, 0, 1.0]))
                lat = unit(suma(por(lat, math.cos(rol)), [0, 0, math.sin(rol)]))
                celda = int(azar() * 6) % 6
                if f > 0.6 and azar() < 0.18:
                    celda = 6      # piñas derechas en las ramas altas
                elif azar() < 0.08:
                    celda = 7
                tarjeta(q, dd, lat, largo_r, celda, tinte)
        # punta de la rama
        fin = eje[len(eje) - 1]
        dfin = unit(resta(fin, eje[len(eje) - 2]))
        lat = unit(cruz(dfin, [0, 0, 1.0]))
        tarjeta(resta(fin, por(dfin, 0.2)), dfin, lat, entre(0.9, 1.3) * (0.6 + 0.4 * min(1.0, lng / 2.5)), int(azar() * 6) % 6, tinte)
    paso = 0.62 - 0.2 * f + entre(-0.06, 0.06)
    z = z + paso
    piso = piso + 1

# guía: ramitas derechas en la punta del árbol
cima = punto_en(tronco, 1.0)
for k in range(3):
    g = k * 1.0472 + entre(-0.2, 0.2)
    lat = [math.cos(g), math.sin(g), 0.0]
    tarjeta(suma(cima, [0, 0, -0.9]), [0, 0, 1.0], lat, entre(1.4, 1.7), 3 + (k % 2), [1.0, 1.0, 1.0])

mesh = bpy.data.meshes.new("PS_Madera")
mesh.from_pydata(M_VERTS, [], M_CARAS)
uv = mesh.uv_layers.new(name="UVMap")
uv.data.foreach_set("uv", M_UVS)
colm = mesh.color_attributes.new(name="Tono", type='FLOAT_COLOR', domain='CORNER')
colm.data.foreach_set("color", M_COL)
madera = bpy.data.objects.new("PS_Tronco_Ramas", mesh)
bpy.context.collection.objects.link(madera)

img_corteza = bpy.data.images.load("pinsapo/corteza.jpg")
m_corteza = bpy.data.materials.new(name="PS_Corteza")
m_corteza.use_nodes = True
bsdf = m_corteza.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Roughness"].default_value = 0.95
bsdf.inputs["Metallic"].default_value = 0.0
tex = m_corteza.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = img_corteza
m_corteza.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
madera.data.materials.append(m_corteza)

mesh_h = bpy.data.meshes.new("PS_Ramitas")
mesh_h.from_pydata(H_VERTS, [], H_CARAS)
uvh = mesh_h.uv_layers.new(name="UVMap")
uvh.data.foreach_set("uv", H_UVS)
mesh_h.normals_split_custom_set(H_NORM)
colh = mesh_h.color_attributes.new(name="Sombra", type='FLOAT_COLOR', domain='CORNER')
colh.data.foreach_set("color", H_COL)
hojas = bpy.data.objects.new("PS_Copa_Ramitas", mesh_h)
bpy.context.collection.objects.link(hojas)

img_ramas = bpy.data.images.load("pinsapo/ramas.png")
m_ramas = bpy.data.materials.new(name="PS_Aciculas")
m_ramas.use_nodes = True
bsdf2 = m_ramas.node_tree.nodes.get("Principled BSDF")
bsdf2.inputs["Roughness"].default_value = 0.75
bsdf2.inputs["Metallic"].default_value = 0.0
tex2 = m_ramas.node_tree.nodes.new('ShaderNodeTexImage')
tex2.image = img_ramas
m_ramas.node_tree.links.new(tex2.outputs['Color'], bsdf2.inputs['Base Color'])
m_ramas.blend_method = 'CLIP'
m_ramas.alpha_threshold = 0.5
m_ramas.use_backface_culling = True
hojas.data.materials.append(m_ramas)

print("Pinsapo: " + str(piso) + " pisos de ramas, " + str(len(M_CARAS)) + " caras de madera, " + str(int(len(H_CARAS) / 2)) + " tarjetas")

# ==============================================================================
# DECORACIÓN DE NAVIDAD: bolas, guirnalda dorada con luces, estrella, regalos y
# cartel "Feliz Natal" (imagen public/pinsapo/cartel_feliz_natal.jpg, dibujada
# por pinsapo/generar_cartel.py)
# ==============================================================================
def material(nombre, color, rugosidad=0.6, metalico=0.0, emision=0.0, barniz=0.0):
    mat = bpy.data.materials.new(name=nombre)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rugosidad
        bsdf.inputs["Metallic"].default_value = metalico
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

def esfera(nombre, centro, radio, mat, seg=10, anillos=6):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=anillos, radius=radio, location=centro)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def caja(nombre, centro, tamano, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    obj.scale = tamano
    return asignar_mat(obj, mat)

def cilindro(nombre, centro, radio, alto, mat, vertices=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radio, depth=alto, location=centro, rotation=rot)
    obj = bpy.context.active_object
    obj.name = nombre
    return asignar_mat(obj, mat)

def malla(nombre, verts, caras, mat, uvs=None):
    me = bpy.data.meshes.new(nombre)
    me.from_pydata(verts, [], caras)
    if uvs:
        capa = me.uv_layers.new(name="UVMap")
        capa.data.foreach_set("uv", uvs)
    ob = bpy.data.objects.new(nombre, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob

# colores lineales (el visor los pasa a sRGB)
m_rojo = material("NV_Bola_Roja", (0.55, 0.01, 0.015, 1.0), 0.18, 0.55, barniz=1.0)
m_oro = material("NV_Bola_Oro", (0.85, 0.5, 0.08, 1.0), 0.28, 0.75, barniz=1.0)
m_plata = material("NV_Bola_Plata", (0.8, 0.82, 0.86, 1.0), 0.3, 0.45, barniz=1.0)   # con metal puro salía negra (no hay entorno que reflejar)
m_azul = material("NV_Bola_Azul", (0.01, 0.06, 0.45, 1.0), 0.18, 0.55, barniz=1.0)
m_luz = material("NV_Luz", (1.0, 0.72, 0.32, 1.0), 0.3, emision=4.0)
m_luz_roja = material("NV_Luz_Roja", (1.0, 0.12, 0.08, 1.0), 0.3, emision=4.0)
m_guirnalda = material("NV_Guirnalda", (0.9, 0.6, 0.15, 1.0), 0.3, 1.0, emision=0.4)
m_estrella = material("NV_Estrella", (1.0, 0.5, 0.03, 1.0), 0.25, 0.6, emision=2.0)
BOLAS = [m_rojo, m_oro, m_plata, m_azul]

# ---------- bolas: repartidas por la superficie del cono (más abajo, donde es más ancho) ----------
for i in range(72):
    f = 1 - math.sqrt(azar())
    z = Z0 + 0.5 + f * (ALTO - 2.4 - Z0)
    ang = i * 2.39996 + entre(-0.2, 0.2)
    r = radio_copa(z) * entre(0.8, 0.93)
    rb = 0.1 + 0.07 * (1 - f) + entre(0, 0.03)
    esfera("NV_Bola_" + str(i), (r * math.cos(ang), r * math.sin(ang), z - 0.15), rb, BOLAS[i % 4])

# ---------- guirnalda dorada en espiral (tubo) y luces en otra espiral ----------
VUELTAS = 5.5
def espiral(t, desfase, dentro):
    z = Z0 + 0.3 + t * (ALTO - 2.2 - Z0)
    a = t * VUELTAS * 2 * math.pi + desfase
    r = radio_copa(z) * dentro + 0.05
    # cae un poco entre rama y rama
    z = z - 0.12 * abs(math.sin(a * 2.5))
    return [r * math.cos(a), r * math.sin(a), z]

G_V = []
G_C = []
NG = 260
LADOS = 6
for k in range(NG):
    p = espiral(k / (NG - 1), 0.0, 0.9)
    if k < NG - 1:
        q = espiral((k + 1) / (NG - 1), 0.0, 0.9)
    else:
        q = espiral((k - 1) / (NG - 1), 0.0, 0.9)
        q = suma(p, resta(p, q))
    T = unit(resta(q, p))
    N = unit(cruz(T, [0, 0, 1.0]))
    B = cruz(T, N)
    for j in range(LADOS):
        a = 2 * math.pi * j / LADOS
        v = suma(p, suma(por(N, 0.045 * math.cos(a)), por(B, 0.045 * math.sin(a))))
        G_V.append((v[0], v[1], v[2]))
for k in range(NG - 1):
    for j in range(LADOS):
        a = k * LADOS + j
        b = k * LADOS + (j + 1) % LADOS
        G_C.append((a, b, b + LADOS, a + LADOS))
malla("NV_Guirnalda", G_V, G_C, m_guirnalda)

NL = 150
for k in range(NL):
    p = espiral(k / (NL - 1), math.pi, 0.94)
    m = m_luz
    if k % 5 == 0:
        m = m_luz_roja
    esfera("NV_Luz_" + str(k), (p[0], p[1], p[2]), 0.05, m, 6, 4)

# ---------- estrella en la punta: dos estrellas de 5 puntas cruzadas, con volumen ----------
E_V = []
E_C = []
cz = ALTO + 1.05
for g in range(2):
    ca = math.cos(g * math.pi / 2)
    sa = math.sin(g * math.pi / 2)
    b = len(E_V)
    for i in range(10):
        rr = 0.62
        if i % 2 == 1:
            rr = 0.26
        a = math.pi / 2 + i * math.pi / 5
        x = rr * math.cos(a)
        E_V.append((x * ca, x * sa, cz + rr * math.sin(a)))
    E_V.append((-0.14 * sa, 0.14 * ca, cz))
    E_V.append((0.14 * sa, -0.14 * ca, cz))
    for i in range(10):
        E_C.append((b + 10, b + i, b + (i + 1) % 10))
        E_C.append((b + 11, b + (i + 1) % 10, b + i))
malla("NV_Estrella", E_V, E_C, m_estrella)
cilindro("NV_Estrella_Pie", (0, 0, ALTO + 0.55), 0.04, 0.5, m_oro, 6)

# ---------- regalos al pie del árbol ----------
m_papel = [material("NV_Papel_Rojo", (0.5, 0.02, 0.03, 1.0), 0.45),
           material("NV_Papel_Verde", (0.02, 0.22, 0.06, 1.0), 0.45),
           material("NV_Papel_Azul", (0.03, 0.08, 0.4, 1.0), 0.45)]
m_lazo = material("NV_Lazo", (0.85, 0.6, 0.12, 1.0), 0.3, 0.8)
for i in range(8):
    ang = i * 0.785 + entre(-0.25, 0.25)
    r = entre(1.2, 2.6)
    a = entre(0.5, 0.9)
    b = entre(0.5, 0.9)
    h = entre(0.4, 0.75)
    rz = entre(0, 1.5)
    c = (r * math.cos(ang), r * math.sin(ang), h / 2)
    caja("NV_Regalo_" + str(i), c, (a, b, h), m_papel[i % 3], (0, 0, rz))
    caja("NV_Regalo_Cinta_A_" + str(i), c, (a + 0.01, 0.06, h + 0.01), m_lazo, (0, 0, rz))
    caja("NV_Regalo_Cinta_B_" + str(i), c, (0.06, b + 0.01, h + 0.01), m_lazo, (0, 0, rz))
    esfera("NV_Regalo_Lazo_" + str(i), (c[0], c[1], h + 0.05), 0.1, m_lazo, 8, 5)

# ---------- cartel "Feliz Natal" delante del árbol (mira a -Y) ----------
m_poste = material("NV_Madera", (0.16, 0.08, 0.035, 1.0), 0.85)
m_nieve = material("NV_Nieve", (0.9, 0.93, 0.97, 1.0), 0.6)
CXc = 2.2
CYc = -6.0
ZC = 2.1         # centro del letrero
LW = 4.4         # ancho del letrero (la imagen es 1024 x 384)
LH = LW * 384 / 1024
cilindro("NV_Cartel_Poste_I", (CXc - LW * 0.4, CYc + 0.27, (ZC + 0.3) / 2), 0.11, ZC + 0.3, m_poste, 8)
cilindro("NV_Cartel_Poste_D", (CXc + LW * 0.4, CYc + 0.27, (ZC + 0.3) / 2), 0.11, ZC + 0.3, m_poste, 8)
caja("NV_Cartel_Tabla", (CXc, CYc + 0.08, ZC), (LW + 0.14, 0.14, LH + 0.14), m_poste)
caja("NV_Cartel_Nieve", (CXc, CYc + 0.08, ZC + LH / 2 + 0.1), (LW + 0.2, 0.22, 0.14), m_nieve)
img_cartel = bpy.data.images.load("pinsapo/cartel_feliz_natal.jpg")
m_cartel = bpy.data.materials.new(name="NV_Cartel")
m_cartel.use_nodes = True
bc = m_cartel.node_tree.nodes.get("Principled BSDF")
bc.inputs["Roughness"].default_value = 0.8
bc.inputs["Metallic"].default_value = 0.0
tc = m_cartel.node_tree.nodes.new('ShaderNodeTexImage')
tc.image = img_cartel
m_cartel.node_tree.links.new(tc.outputs['Color'], bc.inputs['Base Color'])
yf = CYc - 0.003
malla("NV_Cartel_Letrero", [(CXc - LW / 2, yf, ZC - LH / 2), (CXc + LW / 2, yf, ZC - LH / 2), (CXc + LW / 2, yf, ZC + LH / 2), (CXc - LW / 2, yf, ZC + LH / 2)], [(0, 1, 2, 3)], m_cartel, [0, 0, 1, 0, 1, 1, 0, 1])

print("Decoración de Navidad: 72 bolas, " + str(NL) + " luces, guirnalda, estrella, 8 regalos y cartel")
