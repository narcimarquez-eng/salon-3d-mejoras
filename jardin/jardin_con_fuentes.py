# Jardín en tres niveles: césped, dos terrazas con muros de piedra cubiertos de musgo,
# dos fuentes de surtidor, una fuente de pared, arriates con flores, pérgola con enredaderas
# y árboles. Escala aproximada: 28 m de ancho y 28 m de fondo.

hierba = material("Hierba", (0.22, 0.48, 0.16), 1.00)
hierba_clara = material("HierbaClara", (0.30, 0.58, 0.20), 1.00)
tierra = material("TierraArriate", (0.28, 0.19, 0.11), 1.00)
piedra = material("Piedra", (0.55, 0.53, 0.50), 0.92)
piedra_clara = material("PiedraClara", (0.72, 0.70, 0.65), 0.90)
musgo = material("Musgo", (0.16, 0.36, 0.12), 1.00)
musgo_oscuro = material("MusgoOscuro", (0.10, 0.26, 0.10), 1.00)
agua = material("Agua", (0.35, 0.70, 0.95), 0.05, 0.25)
madera = material("MaderaJardin", (0.45, 0.30, 0.16), 0.70)
hoja = material("Hoja", (0.25, 0.55, 0.20), 0.85)
enredadera = material("Enredadera", (0.15, 0.42, 0.12), 0.85)
tallo = material("Tallo", (0.20, 0.45, 0.15), 0.85)
tronco = material("Tronco", (0.30, 0.20, 0.12), 0.90)
hojas_arbol = material("HojasArbol", (0.14, 0.40, 0.14), 0.90)
flor_rosa = material("FlorRosa", (0.95, 0.40, 0.60), 0.70)
flor_amarilla = material("FlorAmarilla", (0.98, 0.85, 0.20), 0.70)
flor_morada = material("FlorMorada", (0.60, 0.30, 0.85), 0.70)
flor_blanca = material("FlorBlanca", (0.97, 0.96, 0.92), 0.70)
flor_roja = material("FlorRoja", (0.90, 0.15, 0.20), 0.70)
flor_naranja = material("FlorNaranja", (0.98, 0.50, 0.15), 0.70)
flores = [flor_rosa, flor_amarilla, flor_morada, flor_blanca, flor_roja, flor_naranja]
luz = material("Farol", (1.0, 0.75, 0.40), 0.30, 3.0)

# Número pseudoaleatorio determinista en [0, 1) (siempre el mismo jardín)
def rnd(i):
    x = math.sin(i * 12.9898 + 78.233) * 43758.5453
    return x - math.floor(x)

# ----- Terreno y niveles -----
caja("Terreno", (0, 0, -0.1), (60, 60, 0.1), hierba)
caja("Cesped", (0, -5.0, -0.05), (28.0, 18.0, 0.1), hierba)       # nivel 0: y de -14 a 4, z 0
caja("Terraza1", (0, 6.0, 0.4), (28.0, 4.0, 0.8), piedra_clara)   # nivel 1: y de 4 a 8, z 0.8
caja("Terraza2", (0, 11.0, 0.8), (28.0, 6.0, 1.6), piedra_clara)  # nivel 2: y de 8 a 14, z 1.6

# Senderos y escalones que suben de nivel en nivel por el centro
caja("Sendero", (0, -5.0, 0.02), (2.0, 18.0, 0.04), piedra_clara)
caja("Sendero1", (0, 6.0, 0.82), (2.0, 4.0, 0.04), piedra_clara)
caja("Sendero2", (0, 11.0, 1.62), (2.0, 6.0, 0.04), piedra_clara)
caja("Escalon", (0, 3.6, 0.2), (2.0, 0.4, 0.4), piedra)
caja("Escalon", (0, 4.0, 0.4), (2.0, 0.4, 0.8), piedra)
caja("Escalon", (0, 7.6, 0.6), (2.0, 0.4, 1.2), piedra)
caja("Escalon", (0, 8.0, 0.8), (2.0, 0.4, 1.6), piedra)

# ----- Muros de contención con paso central (y = 4 y y = 8) -----
muro('x', 4.0, -14.0, 14.0, 0.0, 2, 0.4, [(-1.0, 1.0, 0.0, 0.8)], piedra, piedra_clara, 0.4)
muro('x', 8.0, -14.0, 14.0, 0.8, 2, 0.4, [(-1.0, 1.0, 0.8, 1.6)], piedra, piedra_clara, 0.4)

# ----- Muros perimetrales (1.6 m) y muro frontal con entrada -----
muro('y', -14.0, -14.0, 14.0, 0.0, 4, 0.4, [], piedra, piedra_clara, 0.4)
muro('y', 14.0, -14.0, 14.0, 0.0, 4, 0.4, [], piedra, piedra_clara, 0.4)
muro('x', 14.0, -14.0, 14.0, 0.0, 4, 0.4, [], piedra, piedra_clara, 0.4)
muro('x', -14.0, -14.0, 14.0, 0.0, 3, 0.4, [(-1.0, 1.0, 0.0, 1.2)], piedra, piedra_clara, 0.4)

# Musgo sobre los muros (manchas en las caras y en las coronas)
for k in range(140):
    z = 0.3 + 1.2 * rnd(k + 1)
    v = -13.0 + 26.0 * rnd(k + 101)
    tam = 0.6 + 1.0 * rnd(k + 201)
    mat = musgo if k % 2 == 0 else musgo_oscuro
    lado = k % 4
    if lado == 0:
        caja("Musgo", (-13.8, v, z), (0.12, tam, 0.4), mat)
    elif lado == 1:
        caja("Musgo", (13.8, v, z), (0.12, tam, 0.4), mat)
    elif lado == 2:
        caja("Musgo", (v, 13.8, z), (tam, 0.12, 0.4), mat)
    else:
        caja("Musgo", (v, -13.8, z), (tam, 0.12, 0.4), mat)

# Enredaderas que suben por el muro del fondo y el lateral derecho
for k in range(160):
    v = -12.0 + 24.0 * rnd(k + 301)
    z = 0.2 + 1.3 * rnd(k + 401)
    caja("Enredadera", (v, 13.8, z), (0.26, 0.06, 0.22), enredadera)
    caja("Enredadera", (13.8, v * 0.9, z), (0.06, 0.26, 0.22), enredadera)

# ----- Fuentes de surtidor animadas -----
# Trayectoria de una gota: sale del cuenco, sube en parábola y cae a la piscina.
# t va de 0 a 1 y se repite (bucle). Devuelve el desplazamiento respecto al cuenco.
def trayectoria_chorro(ang, fase, altura, radio):
    def f(t):
        s = (t + fase) % 1.0
        r = radio * s
        z = 4.0 * altura * s * (1.0 - s) - 1.5 * s * s
        return (r * math.cos(ang), r * math.sin(ang), z)
    return f

def fuente(nombre, cx, cy, z0, n_chorros):
    cilindro(nombre + "_Borde", (cx, cy, z0 + 0.25), 2.2, 0.5, piedra_clara)
    pileta = cilindro(nombre + "_Agua", (cx, cy, z0 + 0.53), 1.95, 0.05, agua)
    bpy.anim.agua(pileta, 1.0)
    cilindro(nombre + "_Pedestal", (cx, cy, z0 + 1.1), 0.35, 1.2, piedra)
    cilindro(nombre + "_Cuenco", (cx, cy, z0 + 1.75), 0.9, 0.25, piedra_clara)
    cuenco = cilindro(nombre + "_AguaCuenco", (cx, cy, z0 + 1.84), 0.75, 0.04, agua)
    bpy.anim.agua(cuenco, 1.0)
    for j in range(n_chorros):
        ang = j * 6.2832 / n_chorros
        for k in range(4):
            gota = caja(nombre + "_Gota", (cx, cy, z0 + 2.0), (0.45, 0.45, 0.45), agua)
            bpy.anim.loop(gota, 1.6, trayectoria_chorro(ang, k / 4.0, 2.6, 1.7))

fuente("Fuente1", -6.0, -6.0, 0.0, 10)
fuente("Fuente2", 6.0, 11.0, 1.6, 8)

# Fuente de pared: caño en el muro, estanque y chorro que cae al agua
caja("Caño", (-9.0, 3.65, 0.45), (0.25, 0.4, 0.25), piedra)
estanque = caja("Estanque", (-9.0, 2.6, 0.12), (2.4, 1.6, 0.25), piedra_clara)
agua_estanque = caja("EstanqueAgua", (-9.0, 2.6, 0.27), (2.2, 1.4, 0.04), agua)
bpy.anim.agua(agua_estanque, 1.0)
def trayectoria_cano(fase):
    def f(t):
        s = (t + fase) % 1.0
        return (0.0, -1.0 * s, -0.15 * s * s)
    return f
for k in range(4):
    gota = caja("Chorro", (-9.0, 3.55, 0.42), (0.35, 0.35, 0.35), agua)
    bpy.anim.loop(gota, 1.6, trayectoria_cano(k / 4.0))

# ----- Arriates con flores -----
def flor(x, y, z0, k):
    caja("Tallo", (x, y, z0 + 0.175), (0.03, 0.03, 0.35), tallo)
    caja("Flor", (x, y, z0 + 0.4), (0.14, 0.14, 0.14), flores[k % 6])

def arriate(x, y, lx, ly, z0, filas, cols):
    alto = 0.3
    caja("Borde", (x, y - ly / 2.0 - 0.05, z0 + alto / 2.0), (lx + 0.2, 0.1, alto), piedra)
    caja("Borde", (x, y + ly / 2.0 + 0.05, z0 + alto / 2.0), (lx + 0.2, 0.1, alto), piedra)
    caja("Borde", (x - lx / 2.0 - 0.05, y, z0 + alto / 2.0), (0.1, ly, alto), piedra)
    caja("Borde", (x + lx / 2.0 + 0.05, y, z0 + alto / 2.0), (0.1, ly, alto), piedra)
    caja("Tierra", (x, y, z0 + 0.15), (lx, ly, 0.3), tierra)
    k = 0
    for r in range(filas):
        for c in range(cols):
            px = x - lx / 2.0 + (c + 0.5) * lx / cols
            py = y - ly / 2.0 + (r + 0.5) * ly / filas
            flor(px, py, z0 + 0.3, k + int(rnd(k + 500 + r * 13 + c) * 6))
            k += 1

arriate(-10.0, -11.0, 4.0, 1.6, 0.0, 3, 8)
arriate(10.0, -11.0, 4.0, 1.6, 0.0, 3, 8)
arriate(10.0, -3.0, 3.0, 1.2, 0.0, 2, 6)
arriate(-11.0, 6.0, 3.0, 2.2, 0.8, 2, 6)
arriate(11.0, 6.0, 3.0, 2.2, 0.8, 2, 6)
arriate(-11.0, 11.0, 2.2, 4.0, 1.6, 3, 5)
arriate(11.0, 11.0, 2.2, 4.0, 1.6, 3, 5)

# Flores sueltas a lo largo del sendero
for k in range(16):
    side = -1.0 if k % 2 == 0 else 1.0
    y = -13.0 + k * 1.1
    flor(side * 1.6, y, 0.0, k)

# ----- Pérgola sobre el sendero con enredaderas -----
for s in [-1.0, 1.0]:
    for y in [-10.0, -7.0]:
        caja("PosteP", (s * 1.6, y, 1.2), (0.2, 0.2, 2.4), madera)
caja("VigaP", (0.0, -10.0, 2.45), (4.0, 0.2, 0.2), madera)
caja("VigaP", (0.0, -7.0, 2.45), (4.0, 0.2, 0.2), madera)
for s in [-1.0, 1.0]:
    caja("VigaP", (s * 1.6, -8.5, 2.6), (0.2, 3.6, 0.2), madera)
for k in range(50):
    x = -2.0 + 4.0 * rnd(k + 601)
    y = -10.5 + 4.0 * rnd(k + 701)
    caja("Enredadera", (x, y, 2.7 + 0.2 * rnd(k + 801)), (0.26, 0.26, 0.12), enredadera)

# ----- Detalles: remates de muros, setos, piedras de paso, faroles, estanque y jardineras -----
nenufar = material("Nenufar", (0.20, 0.52, 0.22), 0.80)
for x in [-12.5, -9.5, -6.5, -3.5, 0.0, 3.5, 6.5, 9.5, 12.5]:
    caja("RemateMuro", (x, 4.0, 0.9), (2.6, 0.5, 0.2), piedra_clara)
    caja("RemateMuro", (x, 8.0, 1.7), (2.6, 0.5, 0.2), piedra_clara)
for y in [-12.0, -9.0, -6.0, -3.0]:
    caja("Seto", (-12.6, y, 0.5), (1.0, 2.2, 1.0), hojas_arbol)
    caja("Seto", (12.6, y, 0.5), (1.0, 2.2, 1.0), hojas_arbol)
for k in range(6):
    caja("PiedraPaso", (4.5, -12.0 + k * 2.0, 0.02), (0.9, 0.7, 0.04), piedra_clara)
for y in [-12.0, -6.0, -1.0]:
    for x in [-2.6, 2.6]:
        caja("PosteFarol", (x, y, 0.9), (0.12, 0.12, 1.8), madera)
        esfera("Farol", (x, y, 1.9), 0.18, luz)
cilindro("PozoBorde", (9.0, -9.0, 0.12), 1.8, 0.24, piedra_clara)
estanque_agua = cilindro("EstanqueJardin", (9.0, -9.0, 0.25), 1.6, 0.04, agua)
bpy.anim.agua(estanque_agua, 0.7)
for k in range(6):
    ang = k * 1.047
    cilindro("Nenufar", (9.0 + 0.9 * math.cos(ang), -9.0 + 0.9 * math.sin(ang), 0.29), 0.3, 0.02, nenufar)
caja("Jardinera", (-12.0, 11.0, 1.9), (0.8, 0.8, 0.6), piedra)
caja("Jardinera", (12.0, 11.0, 1.9), (0.8, 0.8, 0.6), piedra)
caja("Jardinera", (-12.0, 6.0, 1.1), (0.8, 0.8, 0.6), piedra)
caja("Jardinera", (12.0, 6.0, 1.1), (0.8, 0.8, 0.6), piedra)

# ----- Bancos -----
for pos in [(-4.0, 11.0), (4.0, 11.0)]:
    caja("BancoAsiento", (pos[0], pos[1], 1.85), (1.8, 0.5, 0.1), madera)
    caja("BancoPata", (pos[0] - 0.7, pos[1], 1.7), (0.1, 0.4, 0.3), piedra)
    caja("BancoPata", (pos[0] + 0.7, pos[1], 1.7), (0.1, 0.4, 0.3), piedra)

# ----- Árboles en el césped -----
arbol("Arbol1", -12.0, -4.0, 3.5, hojas_arbol, tronco)
arbol("Arbol2", 12.0, -5.0, 3.0, hojas_arbol, tronco)

print("Jardín creado")
