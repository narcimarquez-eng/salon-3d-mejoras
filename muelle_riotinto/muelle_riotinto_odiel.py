# COORD_MODE: Z_UP
# Muelle de mercancias de Riotinto sobre la ria del Odiel (modulo de 16 m acoplable).
# Script del usuario. Version sin lecho de arena ni lamina de agua (seccion 1 eliminada a peticion).
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
mat_wood_crate = make_pbr_mat("Madera_Caja", (0.48, 0.34, 0.19, 1.0), 0.0, 0.72, "wood_oak", 1, 0.95, 0.02, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_fender = make_pbr_mat("Defensa_Pilote", (0.22, 0.16, 0.11, 1.0), 0.0, 0.86, "tree_bark", 2, 1.40, 0.0, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_linen_sack = make_pbr_mat("Saco_Arpillera", (0.58, 0.50, 0.36, 1.0), 0.0, 0.90, "woven_linen", 2, 1.15, 0.0, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_ore = make_pbr_mat("Mineral_Riotinto", (0.46, 0.16, 0.09, 1.0), 0.28, 0.75, "magma_cracks", 2, 1.65, 0.08, (0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 1.45, 1.0)
mat_lamp_glow = make_pbr_mat("Luz_Farola", (1.0, 0.80, 0.42, 1.0), 0.0, 0.12, "", 1, 0.0, 0.55, (1.0, 0.72, 0.28, 1.0), 5.8, 0.35, 1.50, 0.90)

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

def add_crate(name, cx, cy, cz, sx, sy, sz):
    add_box(name + "_Cuerpo", (cx, cy, cz + sz * 0.5), (sx, sy, sz), (0.0, 0.0, 0.0), mat_wood_crate, 0.008)
    add_box(name + "_MarcoT", (cx, cy, cz + sz - 0.03), (sx + 0.02, sy + 0.02, 0.05), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)
    add_box(name + "_MarcoB", (cx, cy, cz + 0.03), (sx + 0.02, sy + 0.02, 0.05), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)
    add_box(name + "_Fleje1", (cx - sx * 0.30, cy, cz + sz * 0.5), (0.03, sy + 0.025, sz + 0.01), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)
    add_box(name + "_Fleje2", (cx + sx * 0.30, cy, cz + sz * 0.5), (0.03, sy + 0.025, sz + 0.01), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)

def add_barrel(name, cx, cy, cz, r, h):
    add_cyl(name + "_Cuerpo", (cx, cy, cz + h * 0.5), r, h, (0.0, 0.0, 0.0), 14, mat_wood_dark)
    add_cyl(name + "_Aro1", (cx, cy, cz + h * 0.25), r + 0.012, 0.035, (0.0, 0.0, 0.0), 14, mat_iron_dark)
    add_cyl(name + "_Aro2", (cx, cy, cz + h * 0.75), r + 0.012, 0.035, (0.0, 0.0, 0.0), 14, mat_iron_dark)

# 1. (Lecho de arena y agua de la ria eliminados)

# 2. PORTICOS MODULARES DE PILOTES METALICOS (PASO EXACTO 2.0m EN X = -7..+7 PARA ACOPLE 16.0m)
bent_xs = [-7.0, -5.0, -3.0, -1.0, 1.0, 3.0, 5.0, 7.0]
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
    add_box("Viga_Long_Inf_Cont", (0.0, py, 2.06), (16.00, 0.14, 0.18), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)

for side in [-1.0, 1.0]:
    sy = side * 1.58
    add_box("Tirante_Long_Agua_Cont", (0.0, sy, 0.96), (16.00, 0.07, 0.07), (0.0, 0.0, 0.0), mat_iron_rust, 0.0)
    for bi in range(len(bent_xs) - 1):
        x1 = bent_xs[bi]
        x2 = bent_xs[bi + 1]
        add_xz_brace("Cruz_Long_Inf_1", x1, 0.98, x2, 1.98, sy, 0.034, mat_iron_dark)
        add_xz_brace("Cruz_Long_Inf_2", x2, 0.98, x1, 1.98, sy, 0.034, mat_iron_dark)
    add_xz_brace("Cruz_Borde_L", -8.0, 1.48, -7.0, 1.98, sy, 0.032, mat_iron_dark)
    add_xz_brace("Cruz_Borde_R", 8.0, 1.48, 7.0, 1.98, sy, 0.032, mat_iron_dark)

# 3. TABLERO INFERIOR DE MADERA (16.0m EXACTOS) Y BARANDILLAS CON PASOS DE ACOPLE
add_box("Subtablero_Inf", (0.0, 0.0, 2.18), (16.00, 3.64, 0.07), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)

plank_count = 40
for i in range(plank_count):
    px = -7.80 + i * 0.40
    z_var = 2.245
    if i % 2 == 0:
        z_var = 2.248
    add_box("Tablero_Madera", (px, 0.0, z_var), (0.36, 3.74, 0.06), (0.0, 0.0, 0.0), mat_wood_deck, 0.0)

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

# Lado -Y: abierto en [-6.8, -5.4] (acceso rampa) y [-1.0, 1.0] (acceso montacargas)
add_railing_segment("Bar_Sur_A", -8.0, -6.8, -1.84, 2.25)
add_railing_segment("Bar_Sur_B", -5.4, -1.0, -1.84, 2.25)
add_railing_segment("Bar_Sur_C", 1.0, 8.0, -1.84, 2.25)

# Lado +Y: abierto en [-1.0, 1.0] como puerto de acople lateral en T para otro modulo
add_railing_segment("Bar_Norte_A", -8.0, -1.0, 1.84, 2.25)
add_railing_segment("Bar_Norte_B", 1.0, 8.0, 1.84, 2.25)

# 4. SISTEMA DE BRIDAS DE ACOPLE MODULAR (EXTREMOS X = -8.0 / +8.0 Y LATERAL +Y)
for end_s in [-1.0, 1.0]:
    ex = end_s * 7.96
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

# Puerto de acople lateral en +Y (para unir pasarelas o brazos adicionales en T)
add_box("Brida_Acople_Lateral_Y", (0.0, 1.88, 2.08), (2.20, 0.10, 0.24), (0.0, 0.0, 0.0), mat_coupler, 0.008)
for lx in [-0.95, -0.35, 0.35, 0.95]:
    add_cyl("Perno_Acople_Y", (lx, 1.94, 2.08), 0.028, 0.08, (1.570796, 0.0, 0.0), 8, mat_steel_rail)
for lx in [-1.0, 1.0]:
    add_cyl("Pilote_Guia_Acople_Y", (lx, 1.84, 2.58), 0.06, 0.66, (0.0, 0.0, 0.0), 10, mat_coupler)

# 5. VIADUCTO FERROVIARIO SUPERIOR PASANTE (X = -8.0 a +8.0)
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
    ty = side * 0.82
    add_box("Cordon_Inf_Celosia", (0.0, ty, 3.70), (16.00, 0.12, 0.12), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    add_box("Cordon_Sup_Celosia", (0.0, ty, 4.24), (16.00, 0.13, 0.12), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    for m in range(16):
        tx1 = -8.0 + m * 1.00
        tx2 = tx1 + 1.00
        add_box("Montante_Celosia", (tx1, ty, 3.97), (0.07, 0.08, 0.50), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)
        add_xz_brace("Diag_Celosia_1", tx1, 3.72, tx2, 4.22, ty, 0.028, mat_iron_rust)
        add_xz_brace("Diag_Celosia_2", tx2, 3.72, tx1, 4.22, ty, 0.028, mat_iron_rust)

# Barandillas superiores (lado -Y abierto entre -1.0 y +1.0 para paso de mercancia al montacargas)
add_box("Bar_Sup_Norte_Top", (0.0, 0.94, 4.74), (16.00, 0.04, 0.04), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
add_box("Bar_Sup_Norte_Mid", (0.0, 0.94, 4.49), (16.00, 0.03, 0.03), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
for m in range(17):
    add_box("Poste_Bar_Sup_N", (-8.0 + m * 1.00, 0.94, 4.50), (0.04, 0.04, 0.52), (0.0, 0.0, 0.0), mat_iron_green, 0.0)

add_box("Bar_Sup_Sur_Top1", (-4.5, -0.94, 4.74), (7.00, 0.04, 0.04), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
add_box("Bar_Sup_Sur_Mid1", (-4.5, -0.94, 4.49), (7.00, 0.03, 0.03), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
add_box("Bar_Sup_Sur_Top2", (4.5, -0.94, 4.74), (7.00, 0.04, 0.04), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
add_box("Bar_Sup_Sur_Mid2", (4.5, -0.94, 4.49), (7.00, 0.03, 0.03), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
for px in [-8.0, -7.0, -6.0, -5.0, -4.0, -3.0, -2.0, -1.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]:
    add_box("Poste_Bar_Sup_S", (px, -0.94, 4.50), (0.04, 0.04, 0.52), (0.0, 0.0, 0.0), mat_iron_green, 0.0)

# Tablero superior, traviesas y vias pasantes de extremo a extremo (-8.0 a +8.0)
add_box("Tablero_Superior_Via", (0.0, 0.0, 4.18), (16.00, 1.64, 0.08), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)
for s in range(32):
    sx = -7.75 + s * 0.50
    add_box("Traviesa_Via", (sx, 0.0, 4.24), (0.14, 1.38, 0.07), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)
for ry in [-0.34, 0.34]:
    add_box("Rail_Acero", (0.0, ry, 4.30), (16.00, 0.065, 0.08), (0.0, 0.0, 0.0), mat_steel_rail, 0.005)

# 6. PLATAFORMA BAJA DE DESCARGA DE MERCANCIAS (LADO -Y, Z = 1.32, ACOPLABLE)
plat_xs = [-2.2, -0.2, 1.8, 3.8, 5.4]
plat_ys = [-4.95, -3.55, -2.15]

for px in plat_xs:
    for py in plat_ys:
        add_cyl("Pilote_Plataforma", (px, py, 0.68), 0.095, 1.24, (0.0, 0.0, 0.0), 12, mat_iron_dark)
        add_cyl("Collar_Plataforma", (px, py, 0.86), 0.14, 0.09, (0.0, 0.0, 0.0), 12, mat_iron_rust)
    add_box("Viga_Trans_Plat", (px, -3.55, 1.22), (0.15, 3.16, 0.15), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    add_yz_brace("Cruz_Plat_A1", -4.95, 0.85, -3.55, 1.18, px, 0.028, mat_iron_rust)
    add_yz_brace("Cruz_Plat_A2", -3.55, 0.85, -4.95, 1.18, px, 0.028, mat_iron_rust)
    add_yz_brace("Cruz_Plat_B1", -3.55, 0.85, -2.15, 1.18, px, 0.028, mat_iron_rust)
    add_yz_brace("Cruz_Plat_B2", -2.15, 0.85, -3.55, 1.18, px, 0.028, mat_iron_rust)

for py in plat_ys:
    add_box("Viga_Long_Plat", (1.60, py, 1.20), (8.00, 0.13, 0.15), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)

add_box("Subtablero_Plataforma", (1.60, -3.55, 1.29), (8.04, 3.24, 0.06), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)
for i in range(21):
    px = -2.20 + i * 0.38
    z_p = 1.345
    if i % 2 == 0:
        z_p = 1.348
    add_box("Tablero_Madera_Plat", (px, -3.55, z_p), (0.34, 3.30, 0.055), (0.0, 0.0, 0.0), mat_wood_deck, 0.0)

# Bridas de union entre plataforma de mercancias y muelle principal (y brida en +X para ampliar plataforma)
add_box("Brida_Union_Plat_Muelle", (1.60, -1.90, 1.24), (7.60, 0.12, 0.18), (0.0, 0.0, 0.0), mat_coupler, 0.008)
add_box("Brida_Acople_Plat_Este", (5.64, -3.55, 1.24), (0.08, 3.26, 0.20), (0.0, 0.0, 0.0), mat_coupler, 0.008)
for by in [-4.75, -3.55, -2.35]:
    add_cyl("Perno_Acople_Plat", (5.70, by, 1.24), 0.024, 0.08, (0.0, 1.570796, 0.0), 8, mat_steel_rail)

# Defensas de atraque para barcos de carga y norays en la plataforma baja
for fx in [-2.2, -0.2, 1.8, 3.8, 5.4]:
    add_cyl("Defensa_Plat_Barco", (fx, -5.28, 1.05), 0.12, 1.86, (0.0, 0.0, 0.0), 12, mat_fender)
    add_cyl("Defensa_Plat_Aro", (fx, -5.28, 1.72), 0.138, 0.07, (0.0, 0.0, 0.0), 12, mat_iron_rust)
add_box("Viga_Defensa_Plat", (1.60, -5.25, 1.28), (7.90, 0.14, 0.16), (0.0, 0.0, 0.0), mat_wood_dark, 0.0)

for nx in [-1.6, 1.8, 4.8]:
    add_cyl("Noray_Plat_Base", (nx, -4.98, 1.44), 0.10, 0.14, (0.0, 0.0, 0.0), 12, mat_iron_dark)
    add_cyl("Noray_Plat_Cabeza", (nx, -4.98, 1.54), 0.13, 0.06, (0.0, 0.0, 0.0), 12, mat_iron_rust)

# 7. DESCANSILLO Y RAMPA INCLINADA DE BAJADA DE MERCANCIAS (Z = 2.25 -> Z = 1.34)
add_cyl("Pilote_Descansillo_1", (-6.85, -3.15, 1.12), 0.095, 2.14, (0.0, 0.0, 0.0), 12, mat_iron_dark)
add_cyl("Pilote_Descansillo_2", (-5.45, -3.15, 1.12), 0.095, 2.14, (0.0, 0.0, 0.0), 12, mat_iron_dark)
add_box("Viga_Descansillo", (-6.15, -2.55, 2.12), (1.65, 1.45, 0.14), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
add_box("Tablero_Madera_Desc", (-6.15, -2.55, 2.24), (1.62, 1.44, 0.06), (0.0, 0.0, 0.0), mat_wood_deck, 0.0)
add_railing_segment("Bar_Desc_Sur", -6.95, -5.35, -3.24, 2.25)
add_box("Bar_Desc_Oeste_Top", (-6.95, -2.55, 2.94), (0.05, 1.42, 0.05), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
add_box("Bar_Desc_Oeste_Mid", (-6.95, -2.55, 2.62), (0.04, 1.42, 0.04), (0.0, 0.0, 0.0), mat_iron_green, 0.0)

ramp_dx = 3.25
ramp_dz = -0.90
ramp_len = math.sqrt(ramp_dx * ramp_dx + ramp_dz * ramp_dz)
ramp_pitch = math.atan2(-ramp_dz, ramp_dx)
ramp_cx = -3.82
ramp_cy = -2.62
ramp_cz = 1.79

add_box("Viga_Rampa_1", (ramp_cx, ramp_cy - 0.56, ramp_cz - 0.08), (ramp_len, 0.10, 0.16), (0.0, ramp_pitch, 0.0), mat_iron_dark, 0.0)
add_box("Viga_Rampa_2", (ramp_cx, ramp_cy + 0.56, ramp_cz - 0.08), (ramp_len, 0.10, 0.16), (0.0, ramp_pitch, 0.0), mat_iron_dark, 0.0)
add_box("Tablero_Madera_Rampa", (ramp_cx, ramp_cy, ramp_cz), (ramp_len, 1.24, 0.06), (0.0, ramp_pitch, 0.0), mat_wood_deck, 0.0)
add_box("Guia_Carro_Rampa_1", (ramp_cx, ramp_cy - 0.28, ramp_cz + 0.04), (ramp_len, 0.05, 0.04), (0.0, ramp_pitch, 0.0), mat_steel_rail, 0.0)
add_box("Guia_Carro_Rampa_2", (ramp_cx, ramp_cy + 0.28, ramp_cz + 0.04), (ramp_len, 0.05, 0.04), (0.0, ramp_pitch, 0.0), mat_steel_rail, 0.0)

for ri in range(11):
    t = float(ri) / 10.0
    rx = -5.35 + t * 3.05
    rz = 2.24 - t * 0.85
    add_box("Liston_Antideslizante", (rx, ramp_cy, rz + 0.035), (0.07, 1.10, 0.03), (0.0, ramp_pitch, 0.0), mat_wood_dark, 0.0)

# Pilote intermedio bajo la rampa y barandilla inclinada exterior
add_cyl("Pilote_Rampa_Mid1", (-3.82, ramp_cy - 0.54, 0.90), 0.085, 1.65, (0.0, 0.0, 0.0), 10, mat_iron_dark)
add_cyl("Pilote_Rampa_Mid2", (-3.82, ramp_cy + 0.54, 0.90), 0.085, 1.65, (0.0, 0.0, 0.0), 10, mat_iron_dark)
add_box("Pasamanos_Rampa_Top", (ramp_cx, ramp_cy - 0.60, ramp_cz + 0.68), (ramp_len, 0.05, 0.05), (0.0, ramp_pitch, 0.0), mat_iron_green, 0.0)
add_box("Pasamanos_Rampa_Mid", (ramp_cx, ramp_cy - 0.60, ramp_cz + 0.36), (ramp_len, 0.04, 0.04), (0.0, ramp_pitch, 0.0), mat_iron_green, 0.0)
for rk in range(5):
    t = float(rk) / 4.0
    px = -5.38 + t * 3.12
    pz = 2.24 - t * 0.87
    add_box("Poste_Rampa", (px, ramp_cy - 0.60, pz + 0.36), (0.05, 0.05, 0.68), (0.0, 0.0, 0.0), mat_iron_green, 0.0)

# 8. TORRE MONTACARGAS Y PLATAFORMA ELEVADORA DE MERCANCIAS (CONECTA Z=4.24 -> Z=2.25 -> Z=1.34)
lift_xs = [-0.92, 0.92]
lift_ys = [-3.65, -2.02]

for lx in lift_xs:
    for ly in lift_ys:
        add_box("Columna_Montacargas", (lx, ly, 3.55), (0.13, 0.13, 4.46), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    add_box("Viga_Techo_Lift_Y", (lx, -2.835, 5.76), (0.14, 1.82, 0.16), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    add_yz_brace("Cruz_Lift_Lat1", -3.65, 2.30, -2.02, 4.05, lx, 0.026, mat_iron_rust)
    add_yz_brace("Cruz_Lift_Lat2", -2.02, 2.30, -3.65, 4.05, lx, 0.026, mat_iron_rust)
    add_yz_brace("Cruz_Lift_Top1", -3.65, 4.20, -2.02, 5.65, lx, 0.026, mat_iron_rust)
    add_yz_brace("Cruz_Lift_Top2", -2.02, 4.20, -3.65, 5.65, lx, 0.026, mat_iron_rust)

for ly in lift_ys:
    add_box("Viga_Techo_Lift_X", (0.0, ly, 5.76), (2.00, 0.14, 0.16), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)

# Pasarela de carga superior con rodillos desde el viaducto ferroviario hasta el montacargas
add_box("Puente_Carga_Sup", (0.0, -1.46, 4.18), (1.88, 1.12, 0.10), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
for rj in range(5):
    add_cyl("Rodillo_Transfer", (0.0, -1.04 - rj * 0.21, 4.25), 0.032, 1.62, (0.0, 1.570796, 0.0), 10, mat_steel_rail)

# Maquinaria de poleas y cabrestante superior del montacargas
add_box("Puente_Poleas_Central", (0.0, -2.835, 5.84), (2.06, 0.42, 0.14), (0.0, 0.0, 0.0), mat_iron_rust, 0.01)
add_cyl("Eje_Cabrestante", (0.0, -2.835, 6.02), 0.05, 1.92, (0.0, 1.570796, 0.0), 12, mat_steel_rail)
add_cyl("Tambor_Cable_Lift", (0.0, -2.835, 6.02), 0.16, 0.62, (0.0, 1.570796, 0.0), 16, mat_iron_rust)
for px in [-0.74, 0.74]:
    add_cyl("Polea_Lift", (px, -2.835, 6.02), 0.22, 0.07, (0.0, 1.570796, 0.0), 18, mat_coupler)

# Plataforma elevadora bajando mercancia (posicion Z = 2.75) con cables de suspension
plat_z = 2.75
add_box("Elevador_Bastidor", (0.0, -2.835, plat_z), (1.68, 1.48, 0.11), (0.0, 0.0, 0.0), mat_coupler, 0.01)
add_box("Elevador_Suelo_Madera", (0.0, -2.835, plat_z + 0.07), (1.58, 1.38, 0.05), (0.0, 0.0, 0.0), mat_wood_deck, 0.0)
for ex in [-0.78, 0.78]:
    add_box("Elevador_Tirante_V", (ex, -2.835, plat_z + 0.68), (0.07, 0.07, 1.32), (0.0, 0.0, 0.0), mat_iron_dark, 0.0)
    add_box("Elevador_Bar_Lat", (ex, -2.835, plat_z + 0.48), (0.05, 1.44, 0.05), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
    add_cyl("Cable_Montacargas", (ex, -2.835, (plat_z + 1.34 + 6.02) * 0.5), 0.018, 6.02 - (plat_z + 1.34), (0.0, 0.0, 0.0), 8, mat_steel_rail)
add_box("Elevador_Arco_Sup", (0.0, -2.835, plat_z + 1.34), (1.64, 0.10, 0.10), (0.0, 0.0, 0.0), mat_coupler, 0.01)

# Carga sobre la plataforma elevadora
add_crate("Carga_Lift_Caja1", -0.34, -2.84, plat_z + 0.095, 0.66, 0.62, 0.58)
add_crate("Carga_Lift_Caja2", 0.36, -2.96, plat_z + 0.095, 0.56, 0.52, 0.46)
add_barrel("Carga_Lift_Barril", 0.38, -2.42, plat_z + 0.095, 0.18, 0.52)

# 9. GRUA PESCANTE INDUSTRIAL SOBRE LA PLATAFORMA BAJA DE DESCARGA (X = 4.35, Y = -4.20)
gx = 4.35
gy = -4.20
add_cyl("Grua_Base", (gx, gy, 1.56), 0.36, 0.42, (0.0, 0.0, 0.0), 8, mat_iron_dark)
add_cyl("Grua_Corona", (gx, gy, 1.82), 0.28, 0.12, (0.0, 0.0, 0.0), 16, mat_coupler)
add_cyl("Grua_Mastil", (gx, gy, 3.05), 0.13, 2.38, (0.0, 0.0, 0.0), 12, mat_iron_dark)
add_box("Grua_Cabrestante", (gx, gy + 0.32, 2.15), (0.48, 0.44, 0.36), (0.0, 0.0, 0.0), mat_iron_rust, 0.01)
add_cyl("Grua_Volante", (gx + 0.28, gy + 0.32, 2.18), 0.20, 0.04, (0.0, 1.570796, 0.0), 14, mat_coupler)
add_yz_brace("Grua_Pluma_L", gy, 2.12, gy - 2.15, 4.35, gx - 0.10, 0.052, mat_iron_rust)
add_yz_brace("Grua_Pluma_R", gy, 2.12, gy - 2.15, 4.35, gx + 0.10, 0.052, mat_iron_rust)
add_yz_brace("Grua_Tirante", gy, 4.18, gy - 2.15, 4.35, gx, 0.022, mat_steel_rail)
add_cyl("Grua_Polea_Punta", (gx, gy - 2.15, 4.35), 0.14, 0.08, (0.0, 1.570796, 0.0), 14, mat_coupler)
add_cyl("Grua_Cable_Carga", (gx, gy - 2.15, 3.30), 0.018, 2.08, (0.0, 0.0, 0.0), 8, mat_steel_rail)
add_box("Grua_Gancho_Barra", (gx, gy - 2.15, 2.24), (0.48, 0.08, 0.07), (0.0, 0.0, 0.0), mat_coupler, 0.0)
add_crate("Caja_Suspendida_Grua", gx, gy - 2.15, 1.62, 0.62, 0.56, 0.54)

# 10. CARRO MANUAL Y MERCANCIAS ALMACENADAS EN LA PLATAFORMA BAJA
add_box("Carro_Plataforma", (-1.15, -3.95, 1.56), (1.12, 0.68, 0.08), (0.0, 0.0, 0.0), mat_wood_dark, 0.008)
add_box("Carro_Empuje", (-1.68, -3.95, 1.88), (0.06, 0.66, 0.58), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
for cx_w in [-1.52, -0.78]:
    for cy_w in [-4.22, -3.68]:
        add_cyl("Carro_Rueda", (cx_w, cy_w, 1.46), 0.11, 0.05, (1.570796, 0.0, 0.0), 12, mat_iron_dark)
add_crate("Carro_Caja", -1.12, -3.95, 1.60, 0.72, 0.54, 0.44)

add_crate("Almacen_Caja1", 1.85, -4.15, 1.375, 0.78, 0.68, 0.62)
add_crate("Almacen_Caja2", 2.72, -4.18, 1.375, 0.68, 0.62, 0.56)
add_crate("Almacen_Caja3", 2.26, -4.16, 1.995, 0.64, 0.58, 0.50)
add_barrel("Almacen_Barril1", 1.72, -3.10, 1.375, 0.21, 0.58)
add_barrel("Almacen_Barril2", 2.18, -3.05, 1.375, 0.21, 0.58)
add_barrel("Almacen_Barril3", 1.95, -2.65, 1.375, 0.21, 0.58)

for si in range(3):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.22, location=(3.15 + si * 0.26, -2.85, 1.50))
    sack = bpy.context.active_object
    sack.name = "Saco_Mercancia_" + str(si)
    sack.scale = (1.15, 0.85, 0.58)
    assign_mat(sack, mat_linen_sack)

# 11. TREN MINERO SOBRE EL VIADUCTO SUPERIOR (VAGON PLATAFORMA DE CAJAS + VAGON TOLVA)
def build_wagon_base(idx, cx):
    add_box("Vagon_Chasis_" + str(idx), (cx, 0.0, 4.62), (2.04, 1.06, 0.14), (0.0, 0.0, 0.0), mat_iron_dark, 0.01)
    for ax in [-0.62, 0.62]:
        add_cyl("Vagon_Eje_" + str(idx), (cx + ax, 0.0, 4.46), 0.04, 0.88, (1.570796, 0.0, 0.0), 10, mat_steel_rail)
        for wy in [-0.34, 0.34]:
            add_cyl("Vagon_Rueda_" + str(idx), (cx + ax, wy, 4.46), 0.145, 0.07, (1.570796, 0.0, 0.0), 16, mat_steel_rail)
            add_cyl("Vagon_Pestana_" + str(idx), (cx + ax, wy * 0.90, 4.46), 0.17, 0.025, (1.570796, 0.0, 0.0), 16, mat_iron_dark)
    for end_s in [-1.0, 1.0]:
        for by in [-0.28, 0.28]:
            add_cyl("Vagon_Tope_" + str(idx), (cx + end_s * 1.08, by, 4.62), 0.06, 0.16, (0.0, 1.570796, 0.0), 10, mat_steel_rail)

# Vagon 1: Plataforma de mercancias alineado con el montacargas en X = 0.0
build_wagon_base(1, 0.0)
add_box("Vagon1_Piso_Madera", (0.0, 0.0, 4.71), (1.98, 1.02, 0.05), (0.0, 0.0, 0.0), mat_wood_deck, 0.0)
add_crate("Vagon1_CajaA", -0.46, 0.0, 4.74, 0.76, 0.78, 0.62)
add_crate("Vagon1_CajaB", 0.44, 0.0, 4.74, 0.72, 0.74, 0.56)

# Vagon 2: Vagon tolva de mineral de Riotinto en X = 2.65
build_wagon_base(2, 2.65)
h_mesh = bpy.data.meshes.new(name="Tolva_Vagon_Mesh_2")
verts = []
verts.append((2.65 - 0.56, -0.36, 4.68))
verts.append((2.65 + 0.56, -0.36, 4.68))
verts.append((2.65 + 0.56, 0.36, 4.68))
verts.append((2.65 - 0.56, 0.36, 4.68))
verts.append((2.65 - 0.92, -0.58, 5.42))
verts.append((2.65 + 0.92, -0.58, 5.42))
verts.append((2.65 + 0.92, 0.58, 5.42))
verts.append((2.65 - 0.92, 0.58, 5.42))
faces = []
faces.append((0, 3, 2, 1))
faces.append((0, 1, 5, 4))
faces.append((1, 2, 6, 5))
faces.append((2, 3, 7, 6))
faces.append((3, 0, 4, 7))
faces.append((4, 5, 6, 7))
h_mesh.from_pydata(verts, [], faces)
h_mesh.update()
h_obj = bpy.data.objects.new("Tolva_Vagon_2", h_mesh)
bpy.context.collection.objects.link(h_obj)
assign_mat(h_obj, mat_iron_rust)
for ox in [-0.42, 0.0, 0.42]:
    bpy.ops.mesh.primitive_dodecahedron_add(radius=0.34, detail=1, location=(2.65 + ox, 0.0, 5.44))
    ore_obj = bpy.context.active_object
    ore_obj.name = "Mineral_Pirita_2"
    ore_obj.scale = (1.15, 0.92, 0.62)
    assign_mat(ore_obj, mat_ore)
add_cyl("Enganche_Vagones", (1.325, 0.0, 4.62), 0.04, 0.68, (0.0, 1.570796, 0.0), 8, mat_steel_rail)

# 12. FAROLAS HISTORICAS DEL MUELLE Y DE LA PLATAFORMA DE DESCARGA
def add_lamp(name, lx, ly, z_base):
    add_cyl(name + "_Base", (lx, ly, z_base + 0.19), 0.10, 0.34, (0.0, 0.0, 0.0), 10, mat_iron_green)
    add_cyl(name + "_Fuste", (lx, ly, z_base + 1.03), 0.04, 1.38, (0.0, 0.0, 0.0), 10, mat_iron_green)
    add_box(name + "_Cruceta", (lx, ly, z_base + 1.57), (0.28, 0.04, 0.04), (0.0, 0.0, 0.0), mat_iron_green, 0.0)
    add_cyl(name + "_Fanal", (lx, ly, z_base + 1.83), 0.115, 0.28, (0.0, 0.0, 0.0), 6, mat_lamp_glow)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.16, radius2=0.02, depth=0.16, location=(lx, ly, z_base + 2.04), rotation=(0.0, 0.0, 0.0))
    hat = bpy.context.active_object
    hat.name = name + "_Sombrero"
    assign_mat(hat, mat_iron_dark)

for lx in [-6.5, -2.5, 2.5, 6.5]:
    add_lamp("Farola_Norte", lx, 1.72, 2.25)
for lx in [-3.5, 3.5, 7.2]:
    add_lamp("Farola_Sur", lx, -1.72, 2.25)
add_lamp("Farola_Plat_Oeste", -1.95, -4.85, 1.35)
add_lamp("Farola_Plat_Este", 5.20, -4.85, 1.35)

# 13. TEXTURAS PBR REALES POLY HAVEN CC0 POR ZONAS
bpy.ops.material.set_polyhaven_texture(zone="Tablero_Madera", asset="wood_planks_dirt", resolution="1k", projection="FLAT", repeat=2)
bpy.ops.material.set_polyhaven_texture(zone="Tolva", asset="rusty_metal_02", resolution="1k", projection="BOX", repeat=2)

# 14. ILUMINACION, CONTORNO, SSAO Y CAMARA HERO
bpy.ops.render.set_lighting(intensity=3.2, angle=38, headlight=True)
bpy.ops.render.set_outline(thickness=0.012, opacity=0.82)
bpy.ops.render.set_ssao(intensity=1.18)
bpy.ops.render.set_normal_smoothing(factor=0.90)
bpy.ops.render.set_viewport(bg_color="#1D2638", pedestal=False, auto_rotate=False, auto_rotate_speed=1.2)
bpy.ops.view3d.camera_preset(view='hero', zoom=112)
bpy.ops.view3d.frame_all(margin=1.12)
bpy.ops.mesh.auto_ground()
