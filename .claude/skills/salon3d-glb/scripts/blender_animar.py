"""Anima en Blender un modelo de un script de salon-3d con el esqueleto y las animaciones
que ya hizo la app ("Animar"), pero con los pesos automáticos de Blender (calor de huesos).

Uso (Python con bpy):
    python blender_animar.py script.py animado_de_la_app.glb salida.glb prefijo_render \
        [--rigidas "OR_Baston:RightHand"] [--clips Walk,Attack] [--muestras 32]
--rigidas: prefijo de piezas que van rígidas a un hueso (armas), separados por comas.
"""
import os
import re
import sys

import bpy
import bmesh  # después de bpy (bmesh solo existe cuando bpy está cargado)
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import salon3d_blender as sb  # noqa: E402


def caja(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            mn = Vector((min(mn[i], w[i]) for i in range(3)))
            mx = Vector((max(mx[i], w[i]) for i in range(3)))
    return mn, mx


def unir(objs, nombre):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = nombre
    return o


def dist_segmento(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-12, ab.length_squared)))
    return (a + ab * t - p).length


def rellenar_islas(obj, arm):
    """Las piezas sueltas a las que el calor no llegó van enteras a su hueso más cercano."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    visto = set()
    # al importar un .glb, Blender inventa hacia dónde apunta cada hueso: el tramo real va del
    # inicio del hueso al inicio de su hijo (los huesos finales se quedan en un punto)
    zs = [(obj.matrix_world @ v.co).z for v in me.vertices]
    alto = max(zs) - min(zs)
    huesos = []
    for b in arm.data.bones:
        h = arm.matrix_world @ b.head_local
        t = arm.matrix_world @ b.children[0].head_local if b.children else h
        huesos.append((b.name, h, t))
    deform = {b.name for b in arm.data.bones if b.use_deform}
    huesos = [h for h in huesos if h[0] in deform]
    for v in bm.verts:
        if v.index in visto:
            continue
        isla = []
        pila = [v]
        visto.add(v.index)
        while pila:
            x = pila.pop()
            isla.append(x.index)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o.index not in visto:
                    visto.add(o.index)
                    pila.append(o)
        con = [i for i in isla if me.vertices[i].groups]
        pts = [obj.matrix_world @ me.vertices[i].co for i in isla]
        ext = max(max(p[k] for p in pts) - min(p[k] for p in pts) for k in range(3))
        c = Vector((0, 0, 0))
        for p in pts:
            c += p
        c /= len(pts)
        cercano = min(huesos, key=lambda h: dist_segmento(c, h[1], h[2]))[0]
        # manos y pies (huesos del final) van enteros con su hueso aunque no sean pequeños
        compacta = ext < 0.12 * alto or re.search(r'(Hand|Foot|Toe)$', cercano) is not None
        if not compacta and len(con) > len(isla) * 0.5:
            # pieza larga (brazo, pierna, tronco) con pesos del calor: se queda así para doblarse
            continue
        c = Vector((0, 0, 0))
        for i in isla:
            c += obj.matrix_world @ me.vertices[i].co
        c /= len(isla)
        nombre = min(huesos, key=lambda h: dist_segmento(c, h[1], h[2]))[0]
        if os.environ.get('DEPURAR'):
            print('ISLA', len(isla), [round(x, 2) for x in c], 'ext', round(ext, 2), '->', nombre, 'compacta' if compacta else '')
        vg = obj.vertex_groups.get(nombre) or obj.vertex_groups.new(name=nombre)
        for gi in [g.group for i in isla for g in me.vertices[i].groups]:
            obj.vertex_groups[gi].remove(isla)
        vg.add(isla, 1.0, 'REPLACE')
    bm.free()


def main():
    a = sys.argv[1:]
    script, animado, salida, prefijo = a[0], a[1], a[2], a[3]
    rigidas = []
    if '--rigidas' in a:
        for t in a[a.index('--rigidas') + 1].split(','):
            pre, hueso = t.split(':')
            rigidas.append((pre, hueso))
    clips = a[a.index('--clips') + 1].split(',') if '--clips' in a else ['Walk', 'Attack']
    muestras = int(a[a.index('--muestras') + 1]) if '--muestras' in a else 32

    # 1. El modelo del script, con sus fotos y suavizado
    bpy.ops.wm.read_factory_settings(use_empty=True)
    codigo = sb.traducir(open(script, encoding='utf-8').read())
    g = {'__name__': '__main__', '_salon_imagen': sb._salon_imagen, '_salon_vistas': sb._salon_vistas,
         '_salon_escala': sb._salon_escala}
    exec(compile(codigo, script, 'exec'), g)
    sb.aplicar_fotos()
    sb.suavizar()
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and re.search('suelo', o.name, re.I):
            bpy.data.objects.remove(o, do_unlink=True)
    nuestras = [o for o in bpy.data.objects if o.type == 'MESH']

    # 2. Esqueleto y animaciones de la app
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=animado)
    nuevos = [o for o in bpy.data.objects if o not in antes]
    arm = next(o for o in nuevos if o.type == 'ARMATURE')
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    # solo las mallas con esqueleto: el importador añade también una esfera para dibujar los huesos
    sus_mallas = [o for o in nuevos if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    for o in nuevos:
        if o.type == 'MESH' and o not in sus_mallas:
            bpy.data.objects.remove(o, do_unlink=True)
    mn_a, mx_a = caja(sus_mallas)
    for o in sus_mallas:
        bpy.data.objects.remove(o, do_unlink=True)

    # 3. Nuestro modelo al tamaño y sitio del de la app
    mn_n, mx_n = caja(nuestras)
    s = (mx_a.z - mn_a.z) / max(1e-6, (mx_n.z - mn_n.z))
    cn = (mn_n + mx_n) / 2
    ca = (mn_a + mx_a) / 2
    M = Matrix.Translation(Vector((ca.x, ca.y, mn_a.z))) @ Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-cn.x, -cn.y, -mn_n.z)))
    for o in nuestras:
        o.matrix_world = M @ o.matrix_world
    bpy.ops.object.select_all(action='DESELECT')
    for o in nuestras:
        o.select_set(True)
    bpy.context.view_layer.objects.active = nuestras[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 4. Cuerpo con pesos automáticos; armas rígidas a su hueso
    grupos_rigidos = {}
    cuerpo = []
    for o in nuestras:
        r = next((h for pre, h in rigidas if o.name.startswith(pre)), None)
        if r:
            grupos_rigidos.setdefault(r, []).append(o)
        else:
            cuerpo.append(o)
    cuerpo_o = unir(cuerpo, 'Cuerpo')
    bpy.ops.object.select_all(action='DESELECT')
    cuerpo_o.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    vacios = sum(1 for v in cuerpo_o.data.vertices if not v.groups)
    print('PESOS: vértices sin hueso tras el calor', vacios, 'de', len(cuerpo_o.data.vertices))
    rellenar_islas(cuerpo_o, arm)
    vacios = sum(1 for v in cuerpo_o.data.vertices if not v.groups)
    print('PESOS: vértices sin hueso al final', vacios)
    for hueso, objs in grupos_rigidos.items():
        arma = unir(objs, 'Arma_' + hueso)
        vg = arma.vertex_groups.new(name=hueso)
        vg.add(list(range(len(arma.data.vertices))), 1.0, 'REPLACE')
        mod = arma.modifiers.new('Esqueleto', 'ARMATURE')
        mod.object = arm
        arma.parent = arm
        arma.matrix_parent_inverse = arm.matrix_world.inverted()
    arm.data.pose_position = 'POSE'

    # 5. Fotogramas de algunos clips con Cycles
    sb.preparar_escena(muestras, 640)
    sc = bpy.context.scene
    acciones = {ac.name: ac for ac in bpy.data.actions}
    print('ACCIONES', list(acciones))
    if not arm.animation_data:
        arm.animation_data_create()
    for clip in clips:
        ac = next((v for k, v in acciones.items() if k == clip or k.startswith(clip)), None)
        if not ac:
            continue
        arm.animation_data.action = ac
        try:
            slots = getattr(ac, 'slots', None)
            if slots:
                arm.animation_data.action_slot = slots[0]
        except Exception as e:
            print('slot', e)
        f0, f1 = [int(x) for x in ac.frame_range]
        for i, f in enumerate([f0 + (f1 - f0) // 4, f0 + (f1 - f0) * 3 // 5]):
            sc.frame_set(f)
            sb.render_vistas(f'{prefijo}_{clip}_{i}', [('v', (0.8, -1.0, 0.35), (0, 0, 0))])

    # 6. .glb con todas las animaciones
    sc.frame_set(0)
    arm.data.pose_position = 'REST'
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type in ('MESH', 'ARMATURE'):
            o.select_set(True)
    arm.data.pose_position = 'POSE'
    bpy.ops.export_scene.gltf(filepath=salida, export_format='GLB', use_selection=True,
                              export_image_format='JPEG', export_animation_mode='ACTIONS',
                              export_draco_mesh_compression_enable=True)
    print('GLB', salida, os.path.getsize(salida))


if __name__ == '__main__':
    main()
