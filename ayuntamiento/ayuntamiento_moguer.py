# COORD_MODE: Z_UP
import bpy
import math

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Ayuntamiento de Moguer (Huelva) - Fachada neoclásica con arcadas y torre del reloj
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 1.2))
cuerpo = bpy.context.active_object
cuerpo.name = "Pz_FachadaCal"
cuerpo.scale = (4.2, 1.6, 1.2)
