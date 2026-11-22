import bpy
import math

# COORD_MODE: Z_UP
# ==============================================================================
# PINO PILONERO (Pinus pinea, pino piñonero) - para juego
# ==============================================================================
# Tronco y ramas: tubos curvos generados por código (curvas de Bézier con un
# poco de ondulación), con la corteza de la foto del usuario mapeada en UV a lo
# largo de cada rama. Copa: "tarjetas" (planos cruzados como la hierba de los
# juegos) con matas de acículas recortadas de la foto de la copa, con recorte
# por alpha (blend_method = 'CLIP' -> alphaMode MASK en el GLB).
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
# 2. RAMAS: 4 brazos gruesos que suben en curva, cada uno con 2-3 ramas secundarias
# ------------------------------------------------------------------
PUNTAS = []   # extremos de las ramas finas: de ahí salen las ramillas hacia las matas
rumbo0 = entre(0, 6.28)
NBRAZOS = 4
for k in range(NBRAZOS):
    rumbo = rumbo0 + k * 2 * math.pi / NBRAZOS + entre(-0.35, 0.35)
    d = [math.cos(rumbo), math.sin(rumbo), 0.0]
    t0 = entre(0.78, 0.97)
    p0 = punto_en(tronco, t0)
    lon = entre(3.0, 4.2)
    sube = entre(3.8, 5.0)
    brazo = rama(p0, d, lon, sube, 0.27, 0.13, 10, 10, 0.35)
    nsec = 2 + int(azar() * 2)
    for s in range(nsec):
        ts = entre(0.45, 0.92)
        q0 = punto_en(brazo, ts)
        desv = entre(-0.75, 0.75)
        ds = [math.cos(rumbo + desv), math.sin(rumbo + desv), 0.0]
        sec = rama(q0, ds, entre(1.8, 3.4), entre(0.8, 2.0), 0.12 * (1.2 - ts * 0.5), 0.045, 6, 6, 0.25)
        PUNTAS.append(sec[len(sec) - 1])
        PUNTAS.append(punto_en(sec, 0.6))
    PUNTAS.append(brazo[len(brazo) - 1])

# ------------------------------------------------------------------
# 3. MATAS DE LA COPA (parasol): posiciones en un disco, cúpula baja y plana por debajo
# ------------------------------------------------------------------
CX = horq[0]
CY = horq[1]
RCOPA = 6.6
Z_BASE = 8.4     # panza de la copa
Z_ALTO = 12.0    # cima
MATAS = []
n_matas = 170
for i in range(n_matas):
    # reparto en espiral de Fibonacci + algo de azar: cubre el disco sin huecos grandes
    rr = RCOPA * math.sqrt((i + 0.5) / n_matas) * entre(0.92, 1.04)
    aa = i * 2.39996 + entre(-0.2, 0.2)
    x = CX + rr * math.cos(aa)
    y = CY + rr * math.sin(aa)
    f = rr / RCOPA
    techo = Z_BASE + (Z_ALTO - Z_BASE) * (1 - f * f * f)
    # dos capas: arriba (techo) y en la panza, para que desde abajo tampoco se vea hueco
    if i % 3 == 0:
        z = Z_BASE + entre(0.0, 0.6) + (1 - f) * 0.8
    else:
        z = techo - entre(0.0, 1.3)
    MATAS.append([x, y, z])

# ramillas: de la punta de rama más cercana a cada mata (solo para las matas del borde y de la panza,
# las de arriba quedan tapadas)
for i in range(n_matas):
    m = MATAS[i]
    mejor = PUNTAS[0]
    dmin = 999999.0
    for p in PUNTAS:
        dd = largo(resta(p, m))
        if dd < dmin:
            dmin = dd
            mejor = p
    if dmin > 0.6 and dmin < 5.5:
        fin = [m[0], m[1], m[2] - 0.25]
        medio1 = suma(por(mejor, 0.66), por(fin, 0.34))
        medio2 = suma(por(mejor, 0.33), por(fin, 0.67))
        medio1[2] = medio1[2] + 0.35
        medio2[2] = medio2[2] + 0.3
        tubo([mejor, medio1, medio2, fin], 0.05, 0.02, 4, 4, 0.12)

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
# 4. TARJETAS DE FOLLAJE: por mata, dos planos verticales cruzados y uno casi horizontal.
#    Cada plano usa una de las 4 matas del atlas copa.png (2x2).
# ------------------------------------------------------------------
H_VERTS = []
H_CARAS = []
H_UVS = []

def tarjeta(centro, eje_u, eje_v, ancho, alto, tile):
    # plano centrado en "centro" con lados eje_u (ancho) y eje_v (alto); tile 0..3 del atlas
    b = len(H_VERTS)
    hu = por(eje_u, ancho / 2)
    hv = por(eje_v, alto / 2)
    p = resta(resta(centro, hu), hv)
    H_VERTS.append((p[0], p[1], p[2]))
    p = suma(resta(centro, hv), hu)
    H_VERTS.append((p[0], p[1], p[2]))
    p = suma(suma(centro, hu), hv)
    H_VERTS.append((p[0], p[1], p[2]))
    p = suma(resta(centro, hu), hv)
    H_VERTS.append((p[0], p[1], p[2]))
    H_CARAS.append((b, b + 1, b + 2, b + 3))
    col = tile % 2
    fil = int(tile / 2)
    u0 = col * 0.5 + 0.004
    u1 = col * 0.5 + 0.496
    v1 = 1.0 - fil * 0.5 - 0.004
    v0 = 1.0 - fil * 0.5 - 0.496
    H_UVS.append(u0)
    H_UVS.append(v0)
    H_UVS.append(u1)
    H_UVS.append(v0)
    H_UVS.append(u1)
    H_UVS.append(v1)
    H_UVS.append(u0)
    H_UVS.append(v1)

for i in range(n_matas):
    m = MATAS[i]
    tam = entre(2.0, 3.0)
    giro = entre(0, 3.14)
    # tres verticales cruzadas a 60 grados (de canto se ven menos), algo inclinadas hacia fuera
    hacia = unit([m[0] - CX, m[1] - CY, 0.0])
    for c in range(3):
        g = giro + c * 1.0472
        eu = [math.cos(g), math.sin(g), 0.0]
        ev = unit(suma([0, 0, 1.0], por(hacia, 0.35)))
        tarjeta([m[0], m[1], m[2] + tam * 0.12], eu, ev, tam, tam * 0.85, int(azar() * 4) % 4)
    # horizontal (vista desde arriba/abajo), ligeramente ladeada
    g = entre(0, 6.28)
    eu = [math.cos(g), math.sin(g), entre(-0.15, 0.15)]
    ev = unit(cruz([0, 0, 1.0], eu))
    ev[2] = entre(-0.2, 0.2)
    tarjeta(m, unit(eu), unit(ev), tam * 1.15, tam * 1.15, int(azar() * 4) % 4)

mesh_h = bpy.data.meshes.new("PP_Hojas")
mesh_h.from_pydata(H_VERTS, [], H_CARAS)
uvh = mesh_h.uv_layers.new(name="UVMap")
uvh.data.foreach_set("uv", H_UVS)
hojas = bpy.data.objects.new("PP_Copa_Tarjetas", mesh_h)
bpy.context.collection.objects.link(hojas)

img_copa = bpy.data.images.load("pino/copa.png")
m_hojas = bpy.data.materials.new(name="PP_Aciculas")
m_hojas.use_nodes = True
bsdf2 = m_hojas.node_tree.nodes.get("Principled BSDF")
bsdf2.inputs["Roughness"].default_value = 0.8
bsdf2.inputs["Metallic"].default_value = 0.0
tex2 = m_hojas.node_tree.nodes.new('ShaderNodeTexImage')
tex2.image = img_copa
m_hojas.node_tree.links.new(tex2.outputs['Color'], bsdf2.inputs['Base Color'])
m_hojas.blend_method = 'CLIP'
m_hojas.alpha_threshold = 0.5
hojas.data.materials.append(m_hojas)

print("Pino pilonero: " + str(len(M_CARAS)) + " caras de madera, " + str(len(H_CARAS)) + " tarjetas de follaje")
