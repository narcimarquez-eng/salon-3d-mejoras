# Animación desde scripts de Python (bpy.anim)

Dos funciones nuevas para la consola Python:

## `bpy.anim.loop(objeto, duracion, funcion)`

Mueve un objeto en bucle. `funcion(t)` recibe `t` entre 0 y 1 (se repite cada `duracion` segundos)
y devuelve un desplazamiento `(dx, dy, dz)` respecto a la posición inicial del objeto, en las
mismas unidades de Blender que usas en el script.

```python
def trayectoria(fase):
    def f(t):
        s = (t + fase) % 1.0
        return (s, 0.0, 4.0 * s * (1.0 - s))   # parábola
    return f

gota = caja("Gota", (0, 0, 1), (0.14, 0.14, 0.14), agua)
bpy.anim.loop(gota, 1.6, trayectoria(0.0))
```

## `bpy.anim.agua(objeto, velocidad=1.0)`

Convierte la superficie del objeto en agua con ondas animadas en el visor. En el `.glb`
se exporta como un material liso del mismo color.

```python
pileta = cilindro("Pileta", (0, 0, 0.5), 2.0, 0.05, agua)
bpy.anim.agua(pileta, 1.0)
```

## Exportación

Al exportar el `.glb` desde la app se incluye cada `bpy.anim.loop` como un clip en bucle
(25 fotogramas por ciclo, con la misma duración). Las mallas animadas no se unen con otras
para que conserven su propio nodo y su pista.

## Limitaciones

- El desplazamiento se multiplica por el mismo factor que el auto-escalado del modelo.
- Un script que cambie la escala de un objeto animado no ajusta la trayectoria.
- El agua solo se ve animada en la app; el motor de juegos recibe el color liso.
