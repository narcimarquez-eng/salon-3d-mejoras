# COORD_MODE: Z_UP
import bpy, bmesh, math, mathutils

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 128
bpy.context.scene.cycles.clearcoat = 0.45
bpy.context.scene.cycles.roughness_factor = 0.88
bpy.context.scene.cycles.ior = 1.48
bpy.context.scene.cycles.gi_bounce = 1.35
bpy.context.scene.eevee.bloom_intensity = 0.42
bpy.context.scene.eevee.env_intensity = 1.25

def make_pbr_mat(name, color, metallic, roughness, tex_name, repeat, bump, coat, emission_color, emission_strength, transmission, ior, alpha):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = 0.14
    bsdf.inputs["Transmission Weight"].default_value = transmission
    bsdf.inputs["IOR"].default_value = ior
    bsdf.inputs["Alpha"].default_value = alpha
    if emission_strength > 0.0:
        bsdf.inputs["Emission Color"].default_value = emission_color
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if tex_name != "":
        mat.texture = tex_name
        mat.texture_repeat = repeat
        mat.bump_strength = bump
    return mat

mat_iron_dark = make_pbr_mat("Hierro_Muelle", (0.14, 0.15, 0.14, 1.0), 0.78, 0.48, "damascus_steel", 2, 1.15, 0.10, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_iron_rust = make_pbr_mat("Hierro_Oxido", (0.24, 0.16, 0.12, 1.0), 0.65, 0.62, "copper_patina", 2, 1.35, 0.05, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_iron_green = make_pbr_mat("Barandilla_Verde", (0.11, 0.21, 0.17, 1.0), 0.62, 0.42, "brushed_metal", 2, 0.65, 0.22, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_coupler = make_pbr_mat("Brida_Acople", (0.36, 0.30, 0.16, 1.0), 0.85, 0.34, "gold_damascene", 2, 0.75, 0.25, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_steel_rail = make_pbr_mat("Acero_Rail", (0.64, 0.66, 0.68, 1.0), 0.94, 0.20, "brushed_metal", 3, 0.35, 0.35, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_wood_deck = make_pbr_mat("Madera_Tablero", (0.34, 0.23, 0.14, 1.0), 0.0, 0.74, "wood_oak", 2, 1.10, 0.04, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_wood_dark = make_pbr_mat("Madera_Traviesa", (0.18, 0.12, 0.08, 1.0), 0.0, 0.82, "wood_mahogany", 2, 1.25, 0.02, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_fender = make_pbr_mat("Defensa_Pilote", (0.22, 0.16, 0.11, 1.0), 0.0, 0.86, "tree_bark", 2, 1.40, 0.0, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_lamp_glow = make_pbr_mat("Luz_Farola", (1.0, 0.80, 0.42, 1.0), 0.0, 0.12, "", 1, 0.0, 0.55, (1.0, 0.72, 0.28, 1.0), 5.8, 0.35, 1.50, 0.90)
mat_signal_red = make_pbr_mat("Senal_Roja", (0.95, 0.14, 0.10, 1.0), 0.0, 0.14, "", 1, 0.0, 0.50, (1.0, 0.18, 0.10, 1.0), 4.2, 0.30, 1.50, 0.92)

def assign_mat(obj, mat):
    if len(obj.data.materials) == 0:
        obj.data.materials.append(mat)
    else:
        obj.data.materials[0] = mat

def add_box(name, loc, dims, rot, mat, bevel_w):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = dims
    assign_mat(obj, mat)
    if bevel_w > 0.0:
        mod = obj.modifiers.new(name="Bisel", type='BEVEL')
        mod.width = bevel_w
        mod.segments = 2
    return obj

def add_cyl(name, loc, radius, depth, rot, verts, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    assign_mat(obj, mat)
    return obj

def add_xz_brace(name, x1, z1, x2, z2, y_pos, radius, mat):
    mx = (x1 + x2) * 0.5
    mz = (z1 + z2) * 0.5
    dx = x2 - x1
    dz = z2 - z1
    length = math.sqrt(dx * dx + dz * dz)
    angle_y = math.atan2(dx, dz)
    return add_cyl(name, (mx, y_pos, mz), radius, length, (0.0, angle_y, 0.0), 8, mat)

def add_yz_brace(name, y1, z1, y2, z2, x_pos, radius, mat):
    my = (y1 + y2) * 0.5
    mz = (z1 + z2) * 0.5
    dy = y2 - y1
    dz = z2 - z1
    length = math.sqrt(dy * dy + dz * dz)
    angle_x = math.atan2(-dy, dz)
    return add_cyl(name, (x_pos, my, mz), radius, length, (angle_x, 0.0, 0.0), 8, mat)

# 1. (Lamina de agua eliminada: el agua va aparte en el juego)

# 2. PORTICOS DE PILOTES METALICOS (PASO EXACTO 2.0m EN X = -5, -3, -1, +1, +3, +5)
bent_xs = [-5.0, -3.0, -1.0, 1.0, 3.0, 5.0]
pile_ys = [-1.58, -0.58, 0.58, 1.58]

for bi in range(len(bent_xs)):
    bx = bent_xs[bi]
    for pi in range(len(pile_ys)):
        py = pile_ys[pi]
        add_cyl("Pilote_Hierro", (bx, py, 1.12), 0.105, 2.14, (0.0, 0.0, 0.0), 14, mat_iron_dark)
        add_cyl("Collar_Agua", (bx, py, 0.88), 0.155, 0.10, (0.0, 0.0, 0.0), 14, mat_iron_rust)
        add_cyl("Capitel_Pilote", (bx, py, 2.02), 0.155, 0.12, (0.0, 0.0, 0.0), 14, mat_iron_dark)
    add_box("Viga_Trans_Inf", (bx, 0.0, 2.08), (0.18, 3.68, 0.18), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    add_box("Tirante_Agua", (bx, 0.0, 0.96), (0.08, 3.22, 0.08), (0.0, 0.0, 0.0), mat_iron_rust, 0.0)
    add_yz_brace("Cruz_Trans_A1", -1.58, 0.96, -0.58, 2.00, bx, 0.036, mat_iron_dark)
    add_yz_brace("Cruz_Trans_A2", -0.58, 0.96, -1.58, 2.00, bx, 0.036, mat_iron_dark)
    add_yz_brace("Cruz_Trans_B1", -0.58, 0.96, 0.58, 2.00, bx, 0.036, mat_iron_dark)
    add_yz_brace("Cruz_Trans_B2", 0.58, 0.96, -0.58, 2.00, bx, 0.036, mat_iron_dark)
    add_yz_brace("Cruz_Trans_C1", 0.58, 0.96, 1.58, 2.00, bx, 0.036, mat_iron_dark)
    add_yz_brace("Cruz_Trans_C2", 1.58, 0.96, 0.58, 2.00, bx, 0.036, mat_iron_dark)

for py in pile_ys:
    add_box("Viga_Long_Inf_Cont", (0.0, py, 2.06), (12.00, 0.14, 0.18), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)

for side in [-1.0, 1.0]:
    sy = side * 1.58
    add_box("Tirante_Long_Agua_Cont", (0.0, sy, 0.96), (12.00, 0.07, 0.07), (0.0, 0.0, 0.0), mat_iron_rust, 0.0)
    for bi in range(len(bent_xs) - 1):
        x1 = bent_xs[bi]
        x2 = bent_xs[bi + 1]
        add_xz_brace("Cruz_Long_Inf_1", x1, 0.98, x2, 1.98, sy, 0.034, mat_iron_dark)
        add_xz_brace("Cruz_Long_Inf_2", x2, 0.98, x1, 1.98, sy, 0.034, mat_iron_dark)
    add_xz_brace("Cruz_Borde_L", -6.0, 1.48, -5.0, 1.98, sy, 0.032, mat_iron_dark)
    add_xz_brace("Cruz_Borde_R", 6.0, 1.48, 5.0, 1.98, sy, 0.032, mat_iron_dark)

# 3. PASARELA INFERIOR DE INSPECCION Y TUBERIA DE SERVICIO
add_box("Pasarela_Inspeccion_Viga1", (0.0, -0.34, 1.44), (11.60, 0.06, 0.08), (0.0, 0.0, 0.0), mat_iron_rust, 0.0)
add_box("Pasarela_Inspeccion_Viga2", (0.0, 0.34, 1.44), (11.60, 0.06, 0.08), (0.0, 0.0, 0.0), mat_iron_rust, 0.0)
for gi in range(24):
    gx = -5.75 + gi * 0.50
    add_box("Rejilla_Inspeccion", (gx, 0.0, 1.49), (0.28, 0.66, 0.025), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)

add_cyl("Tuberia_Servicio_Agua", (0.0, -1.12, 1.88), 0.055, 12.00, (0.0, 1.570796, 0.0), 12, mat_iron_rust)
for bx in bent_xs:
    add_cyl("Brida_Tuberia", (bx, -1.12, 1.88), 0.085, 0.06, (0.0, 1.570796, 0.0), 12, mat_coupler)

# 4. TABLERO INFERIOR DE MADERA (12.0m EXACTOS) Y JUNTA METALICA CENTRAL
add_box("Subtablero_Inf", (0.0, 0.0, 2.18), (12.00, 3.64, 0.07), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)

plank_count = 30
for i in range(plank_count):
    px = -5.80 + i * 0.40
    z_var = 2.245
    if i % 2 == 0:
        z_var = 2.248
    add_box("Tablero_Madera", (px, 0.0, z_var), (0.36, 3.74, 0.06), (0.0, 0.0, 0.0), mat_wood_deck, 0.0)

add_box("Junta_Dilatacion_Inf", (0.0, 0.0, 2.282), (0.22, 3.74, 0.024), (0.0, 0.0, 0.0), mat_coupler, 0.004)
for jy in [-1.55, -0.95, -0.35, 0.35, 0.95, 1.55]:
    add_cyl("Remache_Junta_Inf", (0.0, jy, 2.295), 0.022, 0.018, (0.0, 0.0, 0.0), 8, mat_steel_rail)

# 5. BARANDILLAS CONTINUAS EN AMBOS LADOS (Y = -1.84 Y Y = +1.84)
def add_railing_segment(name_prefix, x_start, x_end, y_pos, z_base):
    seg_len = x_end - x_start
    xm = (x_start + x_end) * 0.5
    add_box(name_prefix + "_Bordillo", (xm, y_pos, z_base + 0.06), (seg_len, 0.12, 0.10), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)
    add_box(name_prefix + "_Top", (xm, y_pos, z_base + 0.69), (seg_len, 0.06, 0.05), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
    add_box(name_prefix + "_Mid", (xm, y_pos, z_base + 0.37), (seg_len, 0.04, 0.04), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
    steps = int(seg_len)
    if steps < 1:
        steps = 1
    dx = seg_len / float(steps)
    for k in range(steps + 1):
        px = x_start + k * dx
        add_box(name_prefix + "_Poste", (px, y_pos, z_base + 0.37), (0.05, 0.05, 0.66), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
        if k < steps:
            px2 = x_start + (k + 1) * dx
            add_xz_brace(name_prefix + "_C1", px, z_base + 0.09, px2, z_base + 0.65, y_pos, 0.015, mat_iron_green)
            add_xz_brace(name_prefix + "_C2", px2, z_base + 0.09, px, z_base + 0.65, y_pos, 0.015, mat_iron_green)

add_railing_segment("Bar_Sur", -6.0, 6.0, -1.84, 2.25)
add_railing_segment("Bar_Norte", -6.0, 6.0, 1.84, 2.25)

# 6. BRIDAS DE ACOPLE RECTO EN AMBOS EXTREMOS (X = -6.0 Y X = +6.0)
for end_s in [-1.0, 1.0]:
    ex = end_s * 5.96
    add_box("Brida_Testero_Inf", (ex, 0.0, 2.08), (0.08, 3.74, 0.24), (0.0, 0.0, 0.0), mat_coupler, 0.008)
    for py in pile_ys:
        add_box("Brida_Viga_Inf", (ex, py, 2.06), (0.10, 0.26, 0.28), (0.0, 0.0, 0.0), mat_coupler, 0.008)
        for bz in [1.98, 2.14]:
            add_cyl("Perno_Acople_Inf", (ex + end_s * 0.05, py, bz), 0.025, 0.08, (0.0, 1.570796, 0.0), 8, mat_steel_rail)
    for sy in [-0.82, 0.82]:
        add_box("Brida_Celosia_Sup", (ex, sy, 3.97), (0.10, 0.22, 0.72), (0.0, 0.0, 0.0), mat_coupler, 0.008)
        for bz in [3.74, 3.97, 4.20]:
            add_cyl("Perno_Acople_Sup", (ex + end_s * 0.05, sy, bz), 0.024, 0.08, (0.0, 1.570796, 0.0), 8, mat_steel_rail)
    for ry in [-0.34, 0.34]:
        add_box("Eclisa_Rail", (ex, ry, 4.30), (0.28, 0.11, 0.06), (0.0, 0.0, 0.0), mat_coupler, 0.0)
    for by in [-1.84, 1.84]:
        add_box("Brida_Barandilla_Top", (ex, by, 2.94), (0.10, 0.10, 0.09), (0.0, 0.0, 0.0), mat_coupler, 0.005)
        add_box("Brida_Barandilla_Mid", (ex, by, 2.62), (0.10, 0.09, 0.08), (0.0, 0.0, 0.0), mat_coupler, 0.005)

# 7. VIADUCTO FERROVIARIO SUPERIOR PASANTE (X = -6.0 a +6.0)
for bx in bent_xs:
    for side in [-1.0, 1.0]:
        uy = side * 0.80
        add_cyl("Columna_Viaducto", (bx, uy, 3.16), 0.095, 1.84, (0.0, 0.0, 0.0), 14, mat_iron_dark)
        add_box("Basa_Columna_Sup", (bx, uy, 2.31), (0.30, 0.30, 0.14), (0.0, 0.0, 0.0), mat_iron_rust, 0.01)
        add_box("Capitel_Columna_Sup", (bx, uy, 4.02), (0.28, 0.28, 0.12), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    add_box("Viga_Portal_Sup", (bx, 0.0, 4.08), (0.18, 1.96, 0.18), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    add_yz_brace("Cartela_Portal_L", -0.80, 3.55, -0.32, 4.04, bx, 0.036, mat_iron_rust)
    add_yz_brace("Cartela_Portal_R", 0.80, 3.55, 0.32, 4.04, bx, 0.036, mat_iron_rust)

for side in [-1.0, 1.0]:
    uy = side * 0.80
    add_xz_brace("Cartela_Union_L", -1.0, 3.22, -0.25, 3.70, uy, 0.034, mat_coupler)
    add_xz_brace("Cartela_Union_R", 1.0, 3.22, 0.25, 3.70, uy, 0.034, mat_coupler)

for side in [-1.0, 1.0]:
    ty = side * 0.82
    add_box("Cordon_Inf_Celosia", (0.0, ty, 3.70), (12.00, 0.12, 0.12), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    add_box("Cordon_Sup_Celosia", (0.0, ty, 4.24), (12.00, 0.13, 0.12), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    add_box("Bar_Sup_Top", (0.0, side * 0.94, 4.74), (12.00, 0.04, 0.04), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
    add_box("Bar_Sup_Mid", (0.0, side * 0.94, 4.49), (12.00, 0.03, 0.03), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
    for m in range(12):
        tx1 = -6.0 + m * 1.00
        tx2 = tx1 + 1.00
        add_box("Montante_Celosia", (tx1, ty, 3.97), (0.07, 0.08, 0.50), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)
        add_xz_brace("Diag_Celosia_1", tx1, 3.72, tx2, 4.22, ty, 0.028, mat_iron_rust)
        add_xz_brace("Diag_Celosia_2", tx2, 3.72, tx1, 4.22, ty, 0.028, mat_iron_rust)
        add_box("Poste_Bar_Sup", (tx1, side * 0.94, 4.50), (0.04, 0.04, 0.52), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
    add_box("Poste_Bar_Sup_Fin", (6.0, side * 0.94, 4.50), (0.04, 0.04, 0.52), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
    add_box("Montante_Celosia_Fin", (6.0, ty, 3.97), (0.07, 0.08, 0.50), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)

# 8. TABLERO SUPERIOR, TRAVIESAS Y VIAS FERREAS CONTINUAS (-6.0 a +6.0)
add_box("Tablero_Superior_Via", (0.0, 0.0, 4.18), (12.00, 1.64, 0.08), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)
for s in range(24):
    sx = -5.75 + s * 0.50
    add_box("Traviesa_Via", (sx, 0.0, 4.24), (0.14, 1.38, 0.07), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)

for ry in [-0.34, 0.34]:
    add_box("Rail_Acero", (0.0, ry, 4.30), (12.00, 0.065, 0.08), (0.0, 0.0, 0.0), mat_steel_rail, 0.005)
    add_box("Eclisa_Central_Rail", (0.0, ry, 4.30), (0.34, 0.11, 0.06), (0.0, 0.0, 0.0), mat_coupler, 0.0)

add_cyl("Poste_Senal_Via", (1.0, -1.04, 5.18), 0.032, 1.85, (0.0, 0.0, 0.0), 10, mat_iron_dark)
add_box("Brazo_Semaforo", (1.0, -1.32, 5.95), (0.04, 0.58, 0.12), (0.0, 0.0, 0.0), mat_iron_rust, 0.004)
add_cyl("Faro_Senal_Caja", (1.0, -1.04, 5.75), 0.085, 0.16, (0.0, 1.570796, 0.0), 12, mat_iron_dark)
add_cyl("Faro_Senal_Luz", (1.0, -1.04, 5.75), 0.062, 0.18, (0.0, 1.570796, 0.0), 12, mat_signal_red)

# 9. MOBILIARIO HISTORICO DEL PASEO (FAROLAS, BANCOS, NORAYS Y DEFENSAS)
def add_lamp(name, lx, ly, z_base):
    add_cyl(name + "_Base", (lx, ly, z_base + 0.19), 0.10, 0.34, (0.0, 0.0, 0.0), 10, mat_iron_green)
    add_cyl(name + "_Fuste", (lx, ly, z_base + 1.03), 0.04, 1.38, (0.0, 0.0, 0.0), 10, mat_iron_green)
    add_box(name + "_Cruceta", (lx, ly, z_base + 1.57), (0.28, 0.04, 0.04), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
    add_cyl(name + "_Fanal", (lx, ly, z_base + 1.83), 0.115, 0.28, (0.0, 0.0, 0.0), 6, mat_lamp_glow)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.16, radius2=0.02, depth=0.16, location=(lx, ly, z_base + 2.04), rotation=(0.0, 0.0, 0.0))
    hat = bpy.context.active_object
    hat.name = name + "_Sombrero"
    assign_mat(hat, mat_iron_dark)

for lx in [-4.0, 0.0, 4.0]:
    add_lamp("Farola_Sur", lx, -1.72, 2.25)
    add_lamp("Farola_Norte", lx, 1.72, 2.25)

for bx in [-2.0, 2.0]:
    add_box("Banco_N_Asiento", (bx, 1.44, 2.52), (0.95, 0.34, 0.05), (0.0, 0.0, 0.0), mat_wood_deck, 0.005)
    add_box("Banco_N_Respaldo", (bx, 1.60, 2.74), (0.95, 0.05, 0.28), (-0.18, 0.0, 0.0), mat_wood_deck, 0.005)
    add_box("Banco_N_PataL", (bx - 0.38, 1.46, 2.40), (0.06, 0.30, 0.24), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)
    add_box("Banco_N_PataR", (bx + 0.38, 1.46, 2.40), (0.06, 0.30, 0.24), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)
    add_box("Banco_S_Asiento", (bx, -1.44, 2.52), (0.95, 0.34, 0.05), (0.0, 0.0, 0.0), mat_wood_deck, 0.005)
    add_box("Banco_S_Respaldo", (bx, -1.60, 2.74), (0.95, 0.05, 0.28), (0.18, 0.0, 0.0), mat_wood_deck, 0.005)
    add_box("Banco_S_PataL", (bx - 0.38, -1.46, 2.40), (0.06, 0.30, 0.24), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)
    add_box("Banco_S_PataR", (bx + 0.38, -1.46, 2.40), (0.06, 0.30, 0.24), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)

for nx in [-5.0, -1.0, 3.0]:
    add_cyl("Noray_Sur_Base", (nx, -1.66, 2.34), 0.10, 0.14, (0.0, 0.0, 0.0), 12, mat_iron_dark)
    add_cyl("Noray_Sur_Cabeza", (nx, -1.66, 2.45), 0.13, 0.06, (0.0, 0.0, 0.0), 12, mat_iron_rust)
    add_cyl("Noray_Norte_Base", (-nx, 1.66, 2.34), 0.10, 0.14, (0.0, 0.0, 0.0), 12, mat_iron_dark)
    add_cyl("Noray_Norte_Cabeza", (-nx, 1.66, 2.45), 0.13, 0.06, (0.0, 0.0, 0.0), 12, mat_iron_rust)

for fx in [-5.0, -1.0, 1.0, 5.0]:
    for side in [-1.0, 1.0]:
        fy = side * 1.98
        add_cyl("Defensa_Lateral", (fx, fy, 1.44), 0.12, 2.66, (0.0, 0.0, 0.0), 12, mat_fender)
        add_cyl("Defensa_Aro", (fx, fy, 2.48), 0.14, 0.07, (0.0, 0.0, 0.0), 12, mat_iron_rust)

# 10. TEXTURAS PBR REALES POLY HAVEN CC0 POR ZONAS
bpy.ops.material.set_polyhaven_texture(zone="Tablero_Madera", asset="wood_planks_dirt", resolution="1k", projection="FLAT", repeat=2)
bpy.ops.material.set_polyhaven_texture(zone="Junta_Dilatacion", asset="rusty_metal_02", resolution="1k", projection="BOX", repeat=2)

# 11. ILUMINACION, CONTORNO, SSAO Y CAMARA HERO
bpy.ops.render.set_lighting(intensity=3.2, angle=38, headlight=True)
bpy.ops.render.set_outline(thickness=0.012, opacity=0.82)
bpy.ops.render.set_ssao(intensity=1.18)
bpy.ops.render.set_normal_smoothing(factor=0.90)
bpy.ops.render.set_viewport(bg_color="#1D2638", pedestal=False, auto_rotate=False, auto_rotate_speed=1.2)
bpy.ops.view3d.camera_preset(view='hero', zoom=112)
bpy.ops.view3d.frame_all(margin=1.12)
bpy.ops.mesh.auto_ground()