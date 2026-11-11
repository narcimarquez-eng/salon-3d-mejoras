"""Ejecuta un script de salon-3d en Blender de verdad (módulo bpy, sin ventana).

Traduce lo que solo existe en la app:
  - mat.color_map = "id"            -> nodo de imagen (public/textures/<id>.jpg|png)
  - mat.color_map_views = [...]     -> UV por cara con la misma regla que la app
                                       (cada cara toma la vista de la foto que mejor la ve)
  - mat.color_map_scale = t         -> UV de caja repetida cada t unidades
  - mat.texture = "..."             -> se ignora (patrones de la app)
  - bpy.ops.render.set_*(...)       -> se ignora (ajustes del visor de la app)
Luego suaviza (por ángulo), renderiza vistas con Cycles y exporta el .glb.

Uso (con el Python que tenga bpy instalado):
    python salon3d_blender.py script.py prefijo_salida [--glb salida.glb] [--juego]
        [--vistas "nombre:x,y,z:tx,ty,tz;..."] [--muestras 48] [--res 900]
--juego: sin suelo, todas las piezas en un objeto (una malla con un trozo por material),
         compresión Draco de la geometría y texturas JPEG.
"""
import math
import os
import re
import sys

import bpy
from mathutils import Vector

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
TEXTURAS = os.path.join(RAIZ, 'public', 'textures')

FOTO = {}  # nombre de material -> {"imagen": id, "vistas": [...], "escala": t}


def _datos(mat):
    return FOTO.setdefault(mat.name, {'imagen': None, 'vistas': None, 'escala': 3.0})


def _salon_imagen(mat, valor):
    _datos(mat)['imagen'] = str(valor) if valor else None


def _salon_vistas(mat, valor):
    _datos(mat)['vistas'] = [list(v) for v in valor] if valor else None


def _salon_escala(mat, valor):
    _datos(mat)['escala'] = max(0.05, float(valor))


def traducir(texto):
    salida = []
    for linea in texto.splitlines():
        # comentario al final de una asignación de la app: fuera (no hay '#' en esos valores)
        if re.search(r'\.(color_map\w*|texture|textura_imagen|imagen)\s*=', linea) and '#' in linea:
            linea = linea.split('#')[0].rstrip()
        m = re.match(r'^(\s*)bpy\.ops\.render\.\w+\(.*\)\s*$', linea)
        if m:
            salida.append(m.group(1) + 'pass')
            continue
        m = re.match(r'^(\s*)bpy\.ops\.object\.shade_smooth\(\)\s*$', linea)
        if m:
            salida.append(m.group(1) + 'pass')
            continue
        hecho = False
        for prop, fn in (('color_map_views', '_salon_vistas'), ('color_map_scale', '_salon_escala'),
                         ('color_map', '_salon_imagen'), ('textura_imagen', '_salon_imagen'),
                         ('imagen', '_salon_imagen')):
            m = re.match(r'^(\s*)([A-Za-z_]\w*)\.' + prop + r'\s*=\s*(.+)$', linea)
            if m:
                salida.append(f'{m.group(1)}{fn}({m.group(2)}, {m.group(3)})')
                hecho = True
                break
        if hecho:
            continue
        m = re.match(r'^(\s*)([A-Za-z_]\w*)\.texture\s*=\s*(.+)$', linea)
        if m:
            salida.append(m.group(1) + 'pass')
            continue
        salida.append(linea)
    return '\n'.join(salida)


def buscar_imagen(ident):
    for ext in ('jpg', 'png', 'webp'):
        ruta = os.path.join(TEXTURAS, f'{ident}.{ext}')
        if os.path.exists(ruta):
            return ruta
    # texturas incluidas con otro nombre de archivo (cal_blanca_diff_1k.jpg...)
    ruta = os.path.join(TEXTURAS, f'{ident}_diff_1k.jpg')
    return ruta if os.path.exists(ruta) else None


def conectar_imagen(mat, ruta):
    mat.use_nodes = True
    nodos = mat.node_tree.nodes
    bsdf = nodos.get('Principled BSDF')
    img = bpy.data.images.load(ruta, check_existing=True)
    tex = nodos.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Linear'
    tex.extension = 'REPEAT'
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return img.size[0], img.size[1]


def uv_vistas(obj, vistas, ancho, alto):
    me = obj.data
    uv = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    mw = obj.matrix_world
    nm = mw.to_3x3().inverted_safe().transposed()
    idx = {'x': 0, 'y': 1, 'z': 2, 'zr': 2}
    for pol in me.polygons:
        n = (nm @ pol.normal).normalized()
        mejor, mejor_p, cualquiera, cualquiera_p = -1, -1.0, 0, -1.0
        for i, v in enumerate(vistas):
            c = n[idx[str(v[0])]]
            lado = float(v[1])
            peso = float(v[10]) if len(v) > 10 else 1.0
            p = abs(c) * peso
            if p > cualquiera_p:
                cualquiera, cualquiera_p = i, p
            if lado != 0 and c * lado <= 0:
                continue
            if p > mejor_p:
                mejor, mejor_p = i, p
        v = vistas[mejor if mejor >= 0 else cualquiera]
        eje = str(v[0])
        u0, v0, u1, v1, h0, h1, w0, w1 = [float(t) for t in v[2:10]]
        for li in pol.loop_indices:
            s = mw @ me.vertices[me.loops[li].vertex_index].co
            if eje == 'x':
                h, w = s.y, s.z
            elif eje == 'y':
                h, w = s.x, s.z
            elif eje == 'zr':
                h, w = s.x, s.y
            else:
                h, w = s.y, s.x
            px = u0 + (h - h0) / ((h1 - h0) or 1) * (u1 - u0)
            py = v0 + (w - w0) / ((w1 - w0) or 1) * (v1 - v0)
            uv.data[li].uv = (px / ancho, 1 - py / alto)


def uv_caja(obj, t):
    me = obj.data
    uv = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    mw = obj.matrix_world
    nm = mw.to_3x3().inverted_safe().transposed()
    for pol in me.polygons:
        n = (nm @ pol.normal)
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in pol.loop_indices:
            s = mw @ me.vertices[me.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                uv.data[li].uv = (s.x / t, s.y / t)
            elif ax >= ay:
                uv.data[li].uv = (s.y / t, s.z / t)
            else:
                uv.data[li].uv = (s.x / t, s.z / t)


def aplicar_fotos():
    tam = {}
    for mat in bpy.data.materials:
        d = FOTO.get(mat.name)
        if not d or not d['imagen']:
            continue
        ruta = buscar_imagen(d['imagen'])
        if not ruta:
            print('AVISO: no encuentro la textura', d['imagen'])
            continue
        tam[mat.name] = conectar_imagen(mat, ruta)
        # el color base de la app con imagen es blanco: la imagen manda
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or not obj.data.materials:
            continue
        mat = obj.data.materials[0]
        if not mat or mat.name not in tam:
            continue
        d = FOTO[mat.name]
        if d['vistas']:
            uv_vistas(obj, d['vistas'], *tam[mat.name])
        else:
            uv_caja(obj, d['escala'])


def suavizar():
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        for pol in obj.data.polygons:
            pol.use_smooth = True
        try:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception as e:  # versiones sin el operador: se queda suave
            print('suavizado:', e)


def caja_modelo():
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or re.search('suelo', obj.name, re.I):
            continue
        for c in obj.bound_box:
            w = obj.matrix_world @ Vector(c)
            mn = Vector((min(mn[i], w[i]) for i in range(3)))
            mx = Vector((max(mx[i], w[i]) for i in range(3)))
    return mn, mx


def preparar_escena(muestras, res):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = muestras
    try:
        sc.cycles.use_denoising = True
    except Exception:
        pass
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.film_transparent = False
    mundo = bpy.data.worlds.new('Mundo') if not sc.world else sc.world
    sc.world = mundo
    mundo.use_nodes = True
    fondo = mundo.node_tree.nodes.get('Background')
    fondo.inputs['Color'].default_value = (0.16, 0.17, 0.2, 1)
    fondo.inputs['Strength'].default_value = 1.0
    sol = bpy.data.lights.new('Sol', 'SUN')
    sol.energy = 3.5
    sol.angle = math.radians(8)
    o = bpy.data.objects.new('Sol', sol)
    o.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    sc.collection.objects.link(o)
    relleno = bpy.data.lights.new('Relleno', 'SUN')
    relleno.energy = 1.0
    o2 = bpy.data.objects.new('Relleno', relleno)
    o2.rotation_euler = (math.radians(60), 0, math.radians(150))
    sc.collection.objects.link(o2)


def render_vistas(prefijo, vistas):
    sc = bpy.context.scene
    mn, mx = caja_modelo()
    centro = (mn + mx) / 2
    tam = max((mx - mn).length, 1e-3)
    cam_d = bpy.data.cameras.new('Camara')
    cam_d.lens = 50
    cam = bpy.data.objects.new('Camara', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    for nombre, dirv, objetivo in vistas:
        d = Vector(dirv).normalized()
        cam.location = centro + d * tam * 1.55
        mira = centro + Vector(objetivo) * tam
        cam.rotation_euler = (mira - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{prefijo}_{nombre}.png'
        bpy.ops.render.render(write_still=True)
        print('RENDER', sc.render.filepath)


def exportar(ruta, juego):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in list(bpy.data.objects):
        if obj.type in ('LIGHT', 'CAMERA'):
            continue
        if juego and obj.type == 'MESH' and re.search('suelo', obj.name, re.I):
            bpy.data.objects.remove(obj, do_unlink=True)
    mallas = [o for o in bpy.data.objects if o.type == 'MESH']
    if juego and len(mallas) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in mallas:
            o.select_set(True)
        bpy.context.view_layer.objects.active = mallas[0]
        bpy.ops.object.join()
        mallas[0].name = 'Modelo_Juego'
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.select_set(True)
    opciones = dict(filepath=ruta, export_format='GLB', use_selection=True, export_apply=True,
                    export_image_format='JPEG', export_jpeg_quality=85)
    if juego:
        opciones.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    try:
        bpy.ops.export_scene.gltf(**opciones)
    except TypeError:
        opciones.pop('export_jpeg_quality', None)
        bpy.ops.export_scene.gltf(**opciones)
    print('GLB', ruta, os.path.getsize(ruta))


def main():
    args = sys.argv[1:]
    script, prefijo = args[0], args[1]
    glb = args[args.index('--glb') + 1] if '--glb' in args else None
    juego = '--juego' in args
    muestras = int(args[args.index('--muestras') + 1]) if '--muestras' in args else 48
    res = int(args[args.index('--res') + 1]) if '--res' in args else 900
    vistas = [('frente', (0, -1, 0.15), (0, 0, 0)), ('lado', (1, 0, 0.12), (0, 0, 0)),
              ('espalda', (0, 1, 0.15), (0, 0, 0)), ('tres_cuartos', (0.75, -0.9, 0.45), (0, 0, 0))]
    if '--vistas' in args:
        vistas = []
        for trozo in args[args.index('--vistas') + 1].split(';'):
            n, d, t = trozo.split(':')
            vistas.append((n, tuple(float(x) for x in d.split(',')), tuple(float(x) for x in t.split(','))))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    codigo = traducir(open(script, encoding='utf-8').read())
    g = {'__name__': '__main__', '_salon_imagen': _salon_imagen, '_salon_vistas': _salon_vistas,
         '_salon_escala': _salon_escala}
    exec(compile(codigo, script, 'exec'), g)
    aplicar_fotos()
    suavizar()
    preparar_escena(muestras, res)
    if prefijo != '-':
        render_vistas(prefijo, vistas)
    if glb:
        exportar(glb, juego)


if __name__ == '__main__':
    main()
