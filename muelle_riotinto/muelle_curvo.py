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
mat_signal_amber = make_pbr_mat("Senal_Curva", (1.0, 0.58, 0.08, 1.0), 0.0, 0.14, "", 1, 0.0, 0.50, (1.0, 0.55, 0.06, 1.0), 4.5, 0.30, 1.50, 0.92)

# PARAMETROS MODULARES DE CURVA SUAVE A LA DERECHA (22.5 GRADOS EN 12.0m -> 4 MODULOS = 90 GRADOS)
ARC_LEN = 12.0
TURN_ANGLE = math.radians(22.5)
CURVE_R = ARC_LEN / TURN_ANGLE
X_ORIGIN = -6.0

def curve_pt(s, lat_y, z):
    theta = s / CURVE_R
    r = CURVE_R + lat_y
    wx = X_ORIGIN + r * math.sin(theta)
    wy = -CURVE_R + r * math.cos(theta)
    return (wx, wy, z)

def curve_yaw(s):
    return -(s / CURVE_R)

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

def add_brace_3d(name, p1, p2, radius, mat):
    mx = (p1[0] + p2[0]) * 0.5
    my = (p1[1] + p2[1]) * 0.5
    mz = (p1[2] + p2[2]) * 0.5
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    dz = p2[2] - p1[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    horiz = math.sqrt(dx * dx + dy * dy)
    ry = math.atan2(horiz, dz)
    rz = math.atan2(dy, dx)
    return add_cyl(name, (mx, my, mz), radius, length, (0.0, ry, rz), 8, mat)

def add_curved_beam(name, s_start, s_end, steps, y_center, z_center, width_y, height_z, mat):
    mesh = bpy.data.meshes.new(name=name + "_Mesh")
    verts = []
    faces = []
    hw = width_y * 0.5
    hh = height_z * 0.5
    for i in range(steps + 1):
        s = s_start + (s_end - s_start) * float(i) / float(steps)
        verts.append(curve_pt(s, y_center - hw, z_center - hh))
        verts.append(curve_pt(s, y_center + hw, z_center - hh))
        verts.append(curve_pt(s, y_center + hw, z_center + hh))
        verts.append(curve_pt(s, y_center - hw, z_center + hh))
    for i in range(steps):
        a0 = i * 4
        a1 = a0 + 1
        a2 = a0 + 2
        a3 = a0 + 3
        b0 = (i + 1) * 4
        b1 = b0 + 1
        b2 = b0 + 2
        b3 = b0 + 3
        faces.append((a0, a1, b1, b0))
        faces.append((a3, b3, b2, a2))
        faces.append((a1, a2, b2, b1))
        faces.append((a0, b0, b3, a3))
    faces.append((0, 3, 2, 1))
    end_b = steps * 4
    faces.append((end_b, end_b + 1, end_b + 2, end_b + 3))
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign_mat(obj, mat)
    return obj

# 1. PORTICOS RADIALES DE PILOTES METALICOS (PASO EXACTO 2.0m EN ARCO: s = 1, 3, 5, 7, 9, 11)
bent_ss = [1.0, 3.0, 5.0, 7.0, 9.0, 11.0]
pile_ys = [-1.58, -0.58, 0.58, 1.58]

for bi in range(len(bent_ss)):
    bs = bent_ss[bi]
    byaw = curve_yaw(bs)
    for pi in range(len(pile_ys)):
        py = pile_ys[pi]
        add_cyl("Pilote_Hierro", curve_pt(bs, py, 1.12), 0.105, 2.14, (0.0, 0.0, byaw), 14, mat_iron_dark)
        add_cyl("Collar_Agua", curve_pt(bs, py, 0.88), 0.155, 0.10, (0.0, 0.0, byaw), 14, mat_iron_rust)
        add_cyl("Capitel_Pilote", curve_pt(bs, py, 2.02), 0.155, 0.12, (0.0, 0.0, byaw), 14, mat_iron_dark)
    add_box("Viga_Trans_Inf", curve_pt(bs, 0.0, 2.08), (0.18, 3.68, 0.18), (0.0, 0.0, byaw), mat_iron_dark, 0.01)
    add_box("Tirante_Agua", curve_pt(bs, 0.0, 0.96), (0.08, 3.22, 0.08), (0.0, 0.0, byaw), mat_iron_rust, 0.0)
    add_brace_3d("Cruz_Trans_A1", curve_pt(bs, -1.58, 0.96), curve_pt(bs, -0.58, 2.00), 0.036, mat_iron_dark)
    add_brace_3d("Cruz_Trans_A2", curve_pt(bs, -0.58, 0.96), curve_pt(bs, -1.58, 2.00), 0.036, mat_iron_dark)
    add_brace_3d("Cruz_Trans_B1", curve_pt(bs, -0.58, 0.96), curve_pt(bs, 0.58, 2.00), 0.036, mat_iron_dark)
    add_brace_3d("Cruz_Trans_B2", curve_pt(bs, 0.58, 0.96), curve_pt(bs, -0.58, 2.00), 0.036, mat_iron_dark)
    add_brace_3d("Cruz_Trans_C1", curve_pt(bs, 0.58, 0.96), curve_pt(bs, 1.58, 2.00), 0.036, mat_iron_dark)
    add_brace_3d("Cruz_Trans_C2", curve_pt(bs, 1.58, 0.96), curve_pt(bs, 0.58, 2.00), 0.036, mat_iron_dark)

# Vigas longitudinales curvas continuas y cruces de San Andres exteriores
for py in pile_ys:
    add_curved_beam("Viga_Long_Inf_Curva", 0.0, ARC_LEN, 18, py, 2.06, 0.14, 0.18, mat_iron_dark)

for side in [-1.0, 1.0]:
    sy = side * 1.58
    add_curved_beam("Tirante_Long_Agua_Curvo", 0.0, ARC_LEN, 18, sy, 0.96, 0.07, 0.07, mat_iron_rust)
    for bi in range(len(bent_ss) - 1):
        s1 = bent_ss[bi]
        s2 = bent_ss[bi + 1]
        add_brace_3d("Cruz_Long_Inf_1", curve_pt(s1, sy, 0.98), curve_pt(s2, sy, 1.98), 0.034, mat_iron_dark)
        add_brace_3d("Cruz_Long_Inf_2", curve_pt(s2, sy, 0.98), curve_pt(s1, sy, 1.98), 0.034, mat_iron_dark)
    add_brace_3d("Cruz_Borde_L", curve_pt(0.0, sy, 1.48), curve_pt(1.0, sy, 1.98), 0.032, mat_iron_dark)
    add_brace_3d("Cruz_Borde_R", curve_pt(12.0, sy, 1.48), curve_pt(11.0, sy, 1.98), 0.032, mat_iron_dark)

# 2. PASARELA INFERIOR DE INSPECCION CURVA Y TUBERIA DE SERVICIO
add_curved_beam("Pasarela_Inspeccion_Viga1", 0.2, ARC_LEN - 0.2, 16, -0.34, 1.44, 0.06, 0.08, mat_iron_rust)
add_curved_beam("Pasarela_Inspeccion_Viga2", 0.2, ARC_LEN - 0.2, 16, 0.34, 1.44, 0.06, 0.08, mat_iron_rust)
for gi in range(24):
    gs = 0.25 + gi * 0.50
    add_box("Rejilla_Inspeccion", curve_pt(gs, 0.0, 1.49), (0.28, 0.66, 0.025), (0.0, 0.0, curve_yaw(gs)), mat_iron_dark, 0.0)

for ti in range(12):
    ts1 = float(ti)
    ts2 = float(ti + 1)
    add_brace_3d("Tuberia_Servicio_Agua", curve_pt(ts1, -1.12, 1.88), curve_pt(ts2, -1.12, 1.88), 0.055, mat_iron_rust)
for bs in bent_ss:
    add_cyl("Brida_Tuberia", curve_pt(bs, -1.12, 1.88), 0.085, 0.06, (0.0, 1.570796, curve_yaw(bs)), 12, mat_coupler)

# 3. TABLERO INFERIOR CURVO DE MADERA EN ABANICO RADIAL Y JUNTA CENTRAL
add_curved_beam("Subtablero_Inf_Curvo", 0.0, ARC_LEN, 20, 0.0, 2.18, 3.64, 0.07, mat_wood_dark)

plank_count = 30
for i in range(plank_count):
    ps = 0.20 + i * 0.40
    z_var = 2.245
    if i % 2 == 0:
        z_var = 2.248
    add_box("Tablero_Madera", curve_pt(ps, 0.0, z_var), (0.345, 3.74, 0.06), (0.0, 0.0, curve_yaw(ps)), mat_wood_deck, 0.0)

# Junta de dilatacion central en s = 6.0m
mid_yaw = curve_yaw(6.0)
add_box("Junta_Dilatacion_Inf", curve_pt(6.0, 0.0, 2.282), (0.22, 3.74, 0.024), (0.0, 0.0, mid_yaw), mat_coupler, 0.004)
for jy in [-1.55, -0.95, -0.35, 0.35, 0.95, 1.55]:
    add_cyl("Remache_Junta_Inf", curve_pt(6.0, jy, 2.295), 0.022, 0.018, (0.0, 0.0, mid_yaw), 8, mat_steel_rail)

# 4. BARANDILLAS CURVAS CONTINUAS EN AMBOS LADOS (Y = -1.84 Y Y = +1.84)
for side in [-1.0, 1.0]:
    ry = side * 1.84
    add_curved_beam("Bordillo_Curvo", 0.0, ARC_LEN, 20, ry, 2.31, 0.12, 0.10, mat_wood_dark)
    add_curved_beam("Pasamanos_Inf_Top_Curvo", 0.0, ARC_LEN, 20, ry, 2.94, 0.06, 0.05, mat_iron_green)
    add_curved_beam("Pasamanos_Inf_Mid_Curvo", 0.0, ARC_LEN, 20, ry, 2.62, 0.04, 0.04, mat_iron_green)
    for k in range(13):
        ks = float(k)
        add_box("Poste_Barandilla", curve_pt(ks, ry, 2.62), (0.05, 0.05, 0.66), (0.0, 0.0, curve_yaw(ks)), mat_iron_green, 0.0)
        if k < 12:
            ks2 = float(k + 1)
            add_brace_3d("Celosia_Bar_1", curve_pt(ks, ry, 2.34), curve_pt(ks2, ry, 2.90), 0.015, mat_iron_green)
            add_brace_3d("Celosia_Bar_2", curve_pt(ks2, ry, 2.34), curve_pt(ks, ry, 2.90), 0.015, mat_iron_green)

# 5. BRIDAS DE ACOPLE MODULAR EN AMBOS EXTREMOS (s = 0.0 CON ANGULO 0 Y s = 12.0 CON ANGULO -22.5)
end_configs = [(0.04, -1.0, 0.0), (ARC_LEN - 0.04, 1.0, ARC_LEN)]
for cfg in end_configs:
    es = cfg[0]
    dir_sign = cfg[1]
    bolt_s = cfg[2] + dir_sign * 0.01
    eyaw = curve_yaw(cfg[2])
    add_box("Brida_Testero_Inf", curve_pt(es, 0.0, 2.08), (0.08, 3.74, 0.24), (0.0, 0.0, eyaw), mat_coupler, 0.008)
    for py in pile_ys:
        add_box("Brida_Viga_Inf", curve_pt(es, py, 2.06), (0.10, 0.26, 0.28), (0.0, 0.0, eyaw), mat_coupler, 0.008)
        for bz in [1.98, 2.14]:
            add_cyl("Perno_Acople_Inf", curve_pt(bolt_s, py, bz), 0.025, 0.08, (0.0, 1.570796, eyaw), 8, mat_steel_rail)
    for sy in [-0.82, 0.82]:
        add_box("Brida_Celosia_Sup", curve_pt(es, sy, 3.97), (0.10, 0.22, 0.72), (0.0, 0.0, eyaw), mat_coupler, 0.008)
        for bz in [3.74, 3.97, 4.20]:
            add_cyl("Perno_Acople_Sup", curve_pt(bolt_s, sy, bz), 0.024, 0.08, (0.0, 1.570796, eyaw), 8, mat_steel_rail)
    for ry in [-0.34, 0.34]:
        add_box("Eclisa_Rail", curve_pt(es, ry, 4.30), (0.28, 0.11, 0.06), (0.0, 0.0, eyaw), mat_coupler, 0.0)
    for by in [-1.84, 1.84]:
        add_box("Brida_Barandilla_Top", curve_pt(es, by, 2.94), (0.10, 0.10, 0.09), (0.0, 0.0, eyaw), mat_coupler, 0.005)
        add_box("Brida_Barandilla_Mid", curve_pt(es, by, 2.62), (0.10, 0.09, 0.08), (0.0, 0.0, eyaw), mat_coupler, 0.005)

# 6. VIADUCTO FERROVIARIO SUPERIOR CURVO (PORTICOS, CELOSIAS Y BARANDILLAS)
for bs in bent_ss:
    byaw = curve_yaw(bs)
    for side in [-1.0, 1.0]:
        uy = side * 0.80
        add_cyl("Columna_Viaducto", curve_pt(bs, uy, 3.16), 0.095, 1.84, (0.0, 0.0, byaw), 14, mat_iron_dark)
        add_box("Basa_Columna_Sup", curve_pt(bs, uy, 2.31), (0.30, 0.30, 0.14), (0.0, 0.0, byaw), mat_iron_rust, 0.01)
        add_box("Capitel_Columna_Sup", curve_pt(bs, uy, 4.02), (0.28, 0.28, 0.12), (0.0, 0.0, byaw), mat_iron_dark, 0.01)
    add_box("Viga_Portal_Sup", curve_pt(bs, 0.0, 4.08), (0.18, 1.96, 0.18), (0.0, 0.0, byaw), mat_iron_dark, 0.01)
    add_brace_3d("Cartela_Portal_L", curve_pt(bs, -0.80, 3.55), curve_pt(bs, -0.32, 4.04), 0.036, mat_iron_rust)
    add_brace_3d("Cartela_Portal_R", curve_pt(bs, 0.80, 3.55), curve_pt(bs, 0.32, 4.04), 0.036, mat_iron_rust)

for side in [-1.0, 1.0]:
    uy = side * 0.80
    add_brace_3d("Cartela_Curva_L", curve_pt(5.0, uy, 3.22), curve_pt(5.75, uy, 3.70), 0.034, mat_coupler)
    add_brace_3d("Cartela_Curva_R", curve_pt(7.0, uy, 3.22), curve_pt(6.25, uy, 3.70), 0.034, mat_coupler)

for side in [-1.0, 1.0]:
    ty = side * 0.82
    by = side * 0.94
    add_curved_beam("Cordon_Inf_Celosia_Curvo", 0.0, ARC_LEN, 20, ty, 3.70, 0.12, 0.12, mat_iron_dark)
    add_curved_beam("Cordon_Sup_Celosia_Curvo", 0.0, ARC_LEN, 20, ty, 4.24, 0.13, 0.12, mat_iron_dark)
    add_curved_beam("Bar_Sup_Top_Curvo", 0.0, ARC_LEN, 20, by, 4.74, 0.04, 0.04, mat_iron_green)
    add_curved_beam("Bar_Sup_Mid_Curvo", 0.0, ARC_LEN, 20, by, 4.49, 0.03, 0.03, mat_iron_green)
    for m in range(13):
        ms = float(m)
        myaw = curve_yaw(ms)
        add_box("Montante_Celosia", curve_pt(ms, ty, 3.97), (0.07, 0.08, 0.50), (0.0, 0.0, myaw), mat_iron_dark, 0.0)
        add_box("Poste_Bar_Sup", curve_pt(ms, by, 4.50), (0.04, 0.04, 0.52), (0.0, 0.0, myaw), mat_iron_green, 0.0)
        if m < 12:
            ms2 = float(m + 1)
            add_brace_3d("Diag_Celosia_1", curve_pt(ms, ty, 3.72), curve_pt(ms2, ty, 4.22), 0.028, mat_iron_rust)
            add_brace_3d("Diag_Celosia_2", curve_pt(ms2, ty, 3.72), curve_pt(ms, ty, 4.22), 0.028, mat_iron_rust)

# 7. TABLERO SUPERIOR CURVO, TRAVIESAS RADIALES, VIAS Y CONTRACARRIL DE CURVA
add_curved_beam("Tablero_Superior_Via_Curvo", 0.0, ARC_LEN, 20, 0.0, 4.18, 1.64, 0.08, mat_wood_dark)

for s_idx in range(24):
    ss = 0.25 + s_idx * 0.50
    add_box("Traviesa_Via", curve_pt(ss, 0.0, 4.24), (0.14, 1.38, 0.07), (0.0, 0.0, curve_yaw(ss)), mat_wood_dark, 0.0)

for ry in [-0.34, 0.34]:
    add_curved_beam("Rail_Acero_Curvo", 0.0, ARC_LEN, 24, ry, 4.30, 0.065, 0.08, mat_steel_rail)
    add_box("Eclisa_Central_Rail", curve_pt(6.0, ry, 4.30), (0.34, 0.11, 0.06), (0.0, 0.0, mid_yaw), mat_coupler, 0.0)

# Contracarril de seguridad ferroviario en el interior de la curva (-Y)
add_curved_beam("Contracarril_Seguridad", 0.6, ARC_LEN - 0.6, 20, -0.24, 4.295, 0.04, 0.06, mat_iron_rust)

# Baliza ferroviaria luminosa de curva en s = 6.0, lado exterior (+Y)
add_cyl("Poste_Senal_Curva", curve_pt(6.0, 1.04, 5.12), 0.032, 1.72, (0.0, 0.0, mid_yaw), 10, mat_iron_dark)
add_box("Placa_Aviso_Curva", curve_pt(6.0, 1.24, 5.82), (0.04, 0.44, 0.26), (0.0, 0.0, mid_yaw), mat_coupler, 0.004)
add_cyl("Faro_Curva_Caja", curve_pt(6.0, 1.04, 5.62), 0.082, 0.16, (0.0, 1.570796, mid_yaw), 12, mat_iron_dark)
add_cyl("Faro_Curva_Luz", curve_pt(6.0, 1.04, 5.62), 0.060, 0.18, (0.0, 1.570796, mid_yaw), 12, mat_signal_amber)

# 8. MOBILIARIO HISTORICO ADAPTADO A LA CURVA (FAROLAS, BANCOS, NORAYS Y DEFENSAS)
def add_lamp(name, s_pos, lat_y, z_base):
    yaw = curve_yaw(s_pos)
    add_cyl(name + "_Base", curve_pt(s_pos, lat_y, z_base + 0.19), 0.10, 0.34, (0.0, 0.0, yaw), 10, mat_iron_green)
    add_cyl(name + "_Fuste", curve_pt(s_pos, lat_y, z_base + 1.03), 0.04, 1.38, (0.0, 0.0, yaw), 10, mat_iron_green)
    add_box(name + "_Cruceta", curve_pt(s_pos, lat_y, z_base + 1.57), (0.28, 0.04, 0.04), (0.0, 0.0, yaw), mat_iron_green, 0.0)
    add_cyl(name + "_Fanal", curve_pt(s_pos, lat_y, z_base + 1.83), 0.115, 0.28, (0.0, 0.0, yaw), 6, mat_lamp_glow)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.16, radius2=0.02, depth=0.16, location=curve_pt(s_pos, lat_y, z_base + 2.04), rotation=(0.0, 0.0, yaw))
    hat = bpy.context.active_object
    hat.name = name + "_Sombrero"
    assign_mat(hat, mat_iron_dark)

for ls in [2.0, 6.0, 10.0]:
    add_lamp("Farola_Sur", ls, -1.72, 2.25)
    add_lamp("Farola_Norte", ls, 1.72, 2.25)

for bs in [4.0, 8.0]:
    byaw = curve_yaw(bs)
    add_box("Banco_N_Asiento", curve_pt(bs, 1.44, 2.52), (0.95, 0.34, 0.05), (0.0, 0.0, byaw), mat_wood_deck, 0.005)
    add_box("Banco_N_Respaldo", curve_pt(bs, 1.60, 2.74), (0.95, 0.05, 0.28), (-0.18, 0.0, byaw), mat_wood_deck, 0.005)
    add_box("Banco_N_PataL", curve_pt(bs - 0.38, 1.46, 2.40), (0.06, 0.30, 0.24), (0.0, 0.0, byaw), mat_iron_dark, 0.0)
    add_box("Banco_N_PataR", curve_pt(bs + 0.38, 1.46, 2.40), (0.06, 0.30, 0.24), (0.0, 0.0, byaw), mat_iron_dark, 0.0)
    add_box("Banco_S_Asiento", curve_pt(bs, -1.44, 2.52), (0.95, 0.34, 0.05), (0.0, 0.0, byaw), mat_wood_deck, 0.005)
    add_box("Banco_S_Respaldo", curve_pt(bs, -1.60, 2.74), (0.95, 0.05, 0.28), (0.18, 0.0, byaw), mat_wood_deck, 0.005)
    add_box("Banco_S_PataL", curve_pt(bs - 0.38, -1.46, 2.40), (0.06, 0.30, 0.24), (0.0, 0.0, byaw), mat_iron_dark, 0.0)
    add_box("Banco_S_PataR", curve_pt(bs + 0.38, -1.46, 2.40), (0.06, 0.30, 0.24), (0.0, 0.0, byaw), mat_iron_dark, 0.0)

for ns in [1.0, 5.0, 9.0]:
    nyaw = curve_yaw(ns)
    add_cyl("Noray_Sur_Base", curve_pt(ns, -1.66, 2.34), 0.10, 0.14, (0.0, 0.0, nyaw), 12, mat_iron_dark)
    add_cyl("Noray_Sur_Cabeza", curve_pt(ns, -1.66, 2.45), 0.13, 0.06, (0.0, 0.0, nyaw), 12, mat_iron_rust)
    ns2 = ARC_LEN - ns
    nyaw2 = curve_yaw(ns2)
    add_cyl("Noray_Norte_Base", curve_pt(ns2, 1.66, 2.34), 0.10, 0.14, (0.0, 0.0, nyaw2), 12, mat_iron_dark)
    add_cyl("Noray_Norte_Cabeza", curve_pt(ns2, 1.66, 2.45), 0.13, 0.06, (0.0, 0.0, nyaw2), 12, mat_iron_rust)

for fs in [1.0, 5.0, 7.0, 11.0]:
    fyaw = curve_yaw(fs)
    for side in [-1.0, 1.0]:
        fy = side * 1.98
        add_cyl("Defensa_Lateral", curve_pt(fs, fy, 1.44), 0.12, 2.66, (0.0, 0.0, fyaw), 12, mat_fender)
        add_cyl("Defensa_Aro", curve_pt(fs, fy, 2.48), 0.14, 0.07, (0.0, 0.0, fyaw), 12, mat_iron_rust)

# 9. TEXTURAS PBR REALES POLY HAVEN CC0 POR ZONAS
bpy.ops.material.set_polyhaven_texture(zone="Tablero_Madera", asset="wood_planks_dirt", resolution="1k", projection="FLAT", repeat=2)
bpy.ops.material.set_polyhaven_texture(zone="Junta_Dilatacion", asset="rusty_metal_02", resolution="1k", projection="BOX", repeat=2)

# 10. ILUMINACION, CONTORNO, SSAO Y CAMARA HERO
bpy.ops.render.set_lighting(intensity=3.2, angle=38, headlight=True)
bpy.ops.render.set_outline(thickness=0.012, opacity=0.82)
bpy.ops.render.set_ssao(intensity=1.18)
bpy.ops.render.set_normal_smoothing(factor=0.90)
bpy.ops.render.set_viewport(bg_color="#1D2638", pedestal=False, auto_rotate=False, auto_rotate_speed=1.2)
bpy.ops.view3d.camera_preset(view='hero', zoom=112)
bpy.ops.view3d.frame_all(margin=1.12)
bpy.ops.mesh.auto_ground()