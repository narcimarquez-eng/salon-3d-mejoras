# Créditos de texturas

Todas las texturas de esta carpeta son CC0 (dominio público), según la licencia de Poly Haven: https://polyhaven.com/license

| Archivo(s) | Id en Python | Asset de Poly Haven | Autor | Página |
|---|---|---|---|---|
| `cal_blanca_diff_1k.jpg`, `cal_blanca_nor_gl_1k.jpg`, `cal_blanca_rough_1k.jpg` | `cal_blanca` | White Rough Plaster (`white_rough_plaster`) | Rob Tuytel | https://polyhaven.com/a/white_rough_plaster |
| `teja_arcilla_diff_1k.jpg`, `teja_arcilla_nor_gl_1k.jpg`, `teja_arcilla_rough_1k.jpg` | `teja_arcilla` | Clay Roof Tiles 02 (`clay_roof_tiles_02`) | Amal Kumar | https://polyhaven.com/a/clay_roof_tiles_02 |

Mapas incluidos: color (diffuse), normal (OpenGL) y rugosidad, en 1K (1024 × 1024), descargados de `dl.polyhaven.org`.

## Texturas del burro de carga (`burro_*`)

Recortadas de la hoja de vistas del burro que subió el usuario (`burro/app/hoja_burro_sin_cola.png`)
con `burro/hacer_texturas_desde_foto.py`: cada recorte se amplía a 512 × 512 y se mezcla con su copia
desplazada media baldosa para que se repita sin costuras. Ids: `burro_pelaje`, `burro_barriga`,
`burro_hocico`, `burro_crin`, `burro_madera`, `burro_cuerda`, `burro_saco`, `burro_manta_verde`,
`burro_manta_gris`, `burro_cuero`, `burro_metal`.
