import React, { useState, useEffect, useRef } from 'react';
import {
  Code2,
  Play,
  RotateCcw,
  Terminal,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  X,
  FileCode,
  Copy,
  Sparkles,
  Wrench,
  Wand2,
  Loader2,
  ImagePlus,
  Eye,
  SlidersHorizontal,
  Cpu,
  Brain,
  ExternalLink,
  BarChart3,
  Trash2,
  FilePlus2,
} from 'lucide-react';
import {
  BLENDER_SCRIPT_PRESETS,
  BlenderCoordinateMode,
  BlenderScriptPreset,
  ScriptExecutionResult,
  isLikelyBlenderPythonCode,
  stripMarkdownCodeFences,
} from '../utils/blenderPythonEngine';
import { TEXTURE_PRESETS } from '../utils/proceduralTextures';

export type ThinkingLevelChoice = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SceneBoundsData {
  minX?: number;
  maxX?: number;
  minY: number;
  maxY: number;
  minZ?: number;
  maxZ?: number;
  widthX: number;
  depthZ: number;
  meshCount: number;
}

export interface GeminiDrawingHelpersState {
  archetype: string;
  symmetry: string;
  complexity: 'standard' | 'high' | 'ultra';
  palette: string;
  autoSmooth: boolean;
  autoTexture: string;
  sendViewportSnapshot: boolean;
  aiTools: string[];
  autoCritique: boolean;
}

export const AI_TOOLKIT_OPTIONS = [
  {
    id: 'use_world_props',
    label: '🏰 P1: Props, Vehículos, Árboles y Arcos',
    description: 'Cofres, ruedas de vehículos, follaje de árboles y arcos arquitectónicos (primitive_prop_chest_add / wheel_pair / tree_foliage / arch)',
  },
  {
    id: 'use_limbs',
    label: '🦾 P1: Extremidades Articuladas',
    description: 'Brazos y piernas simétricos con hombro, codo/rodilla y cápsulas (primitive_limb_pair_add)',
  },
  {
    id: 'use_armor_plates',
    label: '🛡️ P1: Placas / Chasis Curvos',
    description: 'Placas blindadas, escudos, carrocerías y tejados curvos (primitive_armor_plate_add)',
  },
  {
    id: 'use_horns_blades',
    label: '⚔️ P1: Hojas, Cuernos & Espinas',
    description: 'Hojas biseladas, alerones, cuernos, ramas y púas (primitive_horn_add / blade_add)',
  },
  {
    id: 'use_wings',
    label: '🪽 P1: Alas / Velas en Abanico',
    description: 'Par de alas simétricas desplegadas, paneles solares o velas (primitive_wing_pair_add)',
  },
  {
    id: 'use_bmesh_grid',
    label: '🕸️ P2: Mallas BMesh (create_grid)',
    description: 'Mallas topológicas densas con bmesh.ops.create_grid, deformación sin/cos y bm.to_mesh(mesh)',
  },
  {
    id: 'use_from_pydata',
    label: '📐 P2: Polígonos Exactos (from_pydata)',
    description: 'Geometría a medida por vértices y caras con mesh.from_pydata(verts, [], faces) y objects.link(obj)',
  },
  {
    id: 'use_procedural_textures_per_obj',
    label: '🧱 P3: 38 Texturas PBR+Bump por Pieza',
    description: 'Asigna cualquiera de las 38 texturas con relieve 3D por material/objeto (piedra, madera, agua, mármol, ladrillo, teja, oro, etc.)',
  },
  {
    id: 'use_pbr_clearcoat',
    label: '🚗 P4: Barniz Clearcoat & Anisotropía',
    description: 'Principled BSDF Blender 5.2 con Coat Weight=1.0, Coat Roughness=0.04 y Anisotropic para metales y carrocerías',
  },
  {
    id: 'use_pbr_glass_transmission',
    label: '💎 P4: Cristal Real & Transmisión IOR',
    description: 'Principled BSDF con Transmission Weight=0.88, IOR=1.52 y Alpha para cristales, vidrieras, faros y agua',
  },
  {
    id: 'use_cel_shader_to_rgb',
    label: '🎨 P4: Nodos Anime (ShaderToRGB + ColorRamp)',
    description: 'Nodos ShaderNodeShaderToRGB + ColorRamp CONSTANT para sombreado anime plano de 3 tonos',
  },
  {
    id: 'use_engine_cycles',
    label: '💎 P5: Motor Físico CYCLES (Path-Tracing)',
    description: 'Activa bpy.context.scene.render.engine = "CYCLES" con samples=128, rebote GI y sombras suaves',
  },
  {
    id: 'use_engine_eevee',
    label: '⚡ P5: Motor EEVEE Next (Bloom + HDRI)',
    description: 'Activa bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" con resplandor Bloom e iluminación HDRI a 60 FPS',
  },
  {
    id: 'use_three_point_lighting',
    label: '💡 P5: Luz Estudio 3 Puntos + SSAO',
    description: 'Configura bpy.ops.render.set_lighting(intensity=3.4, angle=42, headlight=True) y set_ssao(intensity=1.25)',
  },
  {
    id: 'use_camera_framing',
    label: '🎥 P5: Cámara Hero + Zoom Automático',
    description: 'Configura bpy.ops.view3d.camera_preset(view="hero", zoom=115) y frame_all(margin=1.15)',
  },
  {
    id: 'use_mod_bevel',
    label: '✨ P6: Modificador BEVEL (Biselado)',
    description: 'Aplica obj.modifiers.new(name="Bisel", type="BEVEL") (width=0.02, segments=2) para atrapar la luz en los bordes',
  },
  {
    id: 'use_mod_subsurf',
    label: '🔮 P6: Modificador SUBSURF (Suavizado)',
    description: 'Aplica obj.modifiers.new(name="Subsurf", type="SUBSURF") (levels=2) para redondear superficies orgánicas',
  },
  {
    id: 'use_mod_array_mirror',
    label: '♊ P6: Modificadores ARRAY + MIRROR',
    description: 'Clona arcos/columnas/radios con type="ARRAY" y duplica mitades simétricas con type="MIRROR"',
  },
  {
    id: 'use_mod_solidify_outline',
    label: '🖊️ P6: SOLIDIFY + Outline Anime',
    description: 'Grosor real en cristales/telas o contorno anime con use_flip_normals=True y grosor negativo',
  },
  {
    id: 'use_tri_subdivide_paint',
    label: '🔺 P6: Subdividir y Pintar Triángulos',
    description: 'Usa bpy.ops.mesh.subdivide_triangles(segments=2) y paint_triangles(color=...) para detalle por triángulos',
  },
  {
    id: 'use_live_animation',
    label: '🌊 P7: Animación 60 FPS (Agua / Loop)',
    description: 'Activa bpy.anim.water(obj) para olas vivas o bpy.anim.loop(obj, type="TURNTABLE"|"HOVER"|"PULSE")',
  },
  {
    id: 'auto_mirror',
    label: '⚖️ P6: Auto-Simetría Espejo X',
    description: 'Duplica automáticamente piezas laterales en el eje X (mirror_x)',
  },
  {
    id: 'auto_ground',
    label: '⚓ P6: Auto-Apoyar en Suelo',
    description: 'Ajusta la altura exacta del modelo sobre el pedestal Y=0.02 (auto_ground)',
  },
];

export interface GeminiTrainingTagItem {
  tag: string;
  point: string;
  codeHint: string;
}

export const GEMINI_TRAINING_TAGS: GeminiTrainingTagItem[] = [
  // Punto 1: Primitivas, Orgánicas y Macros
  { tag: '#PrimitivasClasicas', point: 'P1', codeHint: 'primitive_cube_add / uv_sphere / cylinder / cone / torus / torus_knot' },
  { tag: '#CapsulaOrganica', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_capsule_add(radius=0.25, length=0.75)' },
  { tag: '#GemaOctaedro', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_octahedron_add(radius=0.4)' },
  { tag: '#RocaDodecaedro', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_dodecahedron_add(radius=0.5)' },
  { tag: '#CuernoRamaCurva', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_horn_add(base_radius=0.2, tip_radius=0.02, length=1.0, bend=0.45)' },
  { tag: '#HojaAleronBlade', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_blade_add(length=1.4, width=0.25, thickness=0.06, curve=0.12)' },
  { tag: '#PlacaChasisCurvo', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_armor_plate_add(width=0.7, height=0.65, thickness=0.09, curvature=0.32)' },
  { tag: '#MacroArcoArquitectura', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_arch_add(width=1.25, height=1.65, thickness=0.24)' },
  { tag: '#MacroParRuedas', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_wheel_pair_add(radius=0.36, width=0.22, span=0.88)' },
  { tag: '#MacroCopaArbol', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_tree_foliage_add(radius=0.95, layers=3)' },
  { tag: '#MacroCofreTesoro', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_prop_chest_add(width=1.15, height=0.82, depth=0.78)' },
  { tag: '#MacroExtremidades', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_limb_pair_add(...)' },
  { tag: '#MacroAlasAbanico', point: 'P1', codeHint: 'bpy.ops.mesh.primitive_wing_pair_add(span=1.95, feathers=6)' },
  // Punto 2: BMesh y from_pydata
  { tag: '#BMeshCreateGrid', point: 'P2', codeHint: 'bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=40, y_segments=40, size=4.0); bm.to_mesh(mesh)' },
  { tag: '#FromPydataPoligonos', point: 'P2', codeHint: 'mesh.from_pydata(verts, edges, faces); bpy.context.collection.objects.link(obj)' },
  { tag: '#DeformacionSinCos', point: 'P2', codeHint: 'for v in bm.verts: v.co.z += 0.2 * math.sin(v.co.x * 2.0)' },
  // Punto 3: Las 38 Texturas PBR + Bump 3D
  { tag: '#TexPiedraSilleria', point: 'P3', codeHint: 'mat.texture = "stone_ashlar" # Sillería caliza con relieve' },
  { tag: '#TexTravertinoRomano', point: 'P3', codeHint: 'mat.texture = "travertine_roman" # Travertino poroso' },
  { tag: '#TexMarmolCarrara', point: 'P3', codeHint: 'mat.texture = "marble_carrara" # Mármol blanco veteado' },
  { tag: '#TexCalBlanca', point: 'P3', codeHint: 'mat.color_map = "cal_blanca"; mat.color_map_scale = 2.0 # Cal blanca CC0 (color+normal+rugosidad)' },
  { tag: '#TexTejaArcilla', point: 'P3', codeHint: 'mat.color_map = "teja_arcilla"; mat.color_map_scale = 2.5 # Teja árabe de arcilla CC0' },
  { tag: '#TexMarmolNegroOro', point: 'P3', codeHint: 'mat.texture = "marble_nero" # Mármol negro Marquina y oro' },
  { tag: '#TexAdoquinPiedra', point: 'P3', codeHint: 'mat.texture = "cobblestone" # Adoquín empedrado' },
  { tag: '#TexLadrilloMudejar', point: 'P3', codeHint: 'mat.texture = "brick_mudejar" # Ladrillo visto mudéjar' },
  { tag: '#TexTejaArabe', point: 'P3', codeHint: 'mat.texture = "terracotta_roof" # Teja curva de terracota' },
  { tag: '#TexPizarraNegra', point: 'P3', codeHint: 'mat.texture = "slate_roof" # Pizarra laminada' },
  { tag: '#TexAzulejoAndalusi', point: 'P3', codeHint: 'mat.texture = "andalusi_tiles" # Alicatado geométrico esmaltado' },
  { tag: '#TexVidrieraGotica', point: 'P3', codeHint: 'mat.texture = "stained_glass" # Vitral gótico emplomado translúcido' },
  { tag: '#TexHormigonBrutalista', point: 'P3', codeHint: 'mat.texture = "concrete_brutalist" # Hormigón visto' },
  { tag: '#TexMaderaRoble', point: 'P3', codeHint: 'mat.texture = "wood_oak" # Madera de roble con vetas' },
  { tag: '#TexCaobaImperial', point: 'P3', codeHint: 'mat.texture = "wood_mahogany" # Madera de caoba barnizada' },
  { tag: '#TexCortezaArbol', point: 'P3', codeHint: 'mat.texture = "tree_bark" # Corteza rugosa profunda' },
  { tag: '#TexAguaCausticas', point: 'P3', codeHint: 'mat.texture = "water_caustics" # Agua cristalina con cáusticas' },
  { tag: '#TexOceanoProfundo', point: 'P3', codeHint: 'mat.texture = "ocean_deep" # Oleaje marino con espuma' },
  { tag: '#TexArenaDunas', point: 'P3', codeHint: 'mat.texture = "desert_sand" # Arena dorada con ondas' },
  { tag: '#TexMusgoBosque', point: 'P3', codeHint: 'mat.texture = "moss_nature" # Musgo aterciopelado' },
  { tag: '#TexPraderaHierba', point: 'P3', codeHint: 'mat.texture = "grass_meadow" # Césped natural' },
  { tag: '#TexHieloGlaciar', point: 'P3', codeHint: 'mat.texture = "ice_crystal" # Hielo cristalino' },
  { tag: '#TexNieveVirgen', point: 'P3', codeHint: 'mat.texture = "fresh_snow" # Nieve blanca granulada' },
  { tag: '#TexAceroCepillado', point: 'P3', codeHint: 'mat.texture = "brushed_metal" # Metal anisotrópico' },
  { tag: '#TexAceroDamasco', point: 'P3', codeHint: 'mat.texture = "damascus_steel" # Acero forjado en ondas' },
  { tag: '#TexOroDamasquinado', point: 'P3', codeHint: 'mat.texture = "gold_damascene" # Oro 24k con filigrana' },
  { tag: '#TexBroncePatina', point: 'P3', codeHint: 'mat.texture = "copper_patina" # Bronce antiguo con cardenillo' },
  { tag: '#TexFibraCarbono', point: 'P3', codeHint: 'mat.texture = "carbon_weave" # Carbono trenzado 3D' },
  { tag: '#TexCueroCapitone', point: 'P3', codeHint: 'mat.texture = "leather_tufted" # Cuero acolchado con costuras' },
  { tag: '#TexTerciopeloReal', point: 'P3', codeHint: 'mat.texture = "royal_velvet" # Terciopelo carmesí' },
  { tag: '#TexLinoTejido', point: 'P3', codeHint: 'mat.texture = "woven_linen" # Tela de lino cruzada' },
  { tag: '#TexEscamasDragon', point: 'P3', codeHint: 'mat.texture = "dragon_scales"' },
  { tag: '#TexPlacasBiomech', point: 'P3', codeHint: 'mat.texture = "biomech_plates"' },
  { tag: '#TexGrietasMagma', point: 'P3', codeHint: 'mat.texture = "magma_cracks"' },
  { tag: '#TexPlasmaSolar', point: 'P3', codeHint: 'mat.texture = "solar_plasma"' },
  { tag: '#TexHologramaGrid', point: 'P3', codeHint: 'mat.texture = "hologram_grid"' },
  { tag: '#TexTramaManga', point: 'P3', codeHint: 'mat.texture = "halftone_manga"' },
  { tag: '#TexCircuitosCyber', point: 'P3', codeHint: 'mat.texture = "cyber_circuits"' },
  // Punto 4: Materiales PBR Principled BSDF & Nodos
  { tag: '#BarnizClearcoat', point: 'P4', codeHint: 'bsdf.inputs["Coat Weight"].default_value = 1.0; bsdf.inputs["Coat Roughness"].default_value = 0.04' },
  { tag: '#MetalAnisotropico', point: 'P4', codeHint: 'bsdf.inputs["Anisotropic"].default_value = 0.7' },
  { tag: '#CristalTransmision', point: 'P4', codeHint: 'bsdf.inputs["Transmission Weight"].default_value = 0.88; bsdf.inputs["IOR"].default_value = 1.52' },
  { tag: '#NodosAnimeShaderToRGB', point: 'P4', codeHint: 'ShaderNodeShaderToRGB + ShaderNodeValToRGB (interpolation="CONSTANT")' },
  // Punto 5: Motores Cycles / EEVEE / Cel, Luz y Cámara
  { tag: '#MotorCyclesPathTracing', point: 'P5', codeHint: 'bpy.context.scene.render.engine = "CYCLES"; bpy.context.scene.cycles.samples = 128' },
  { tag: '#MotorEeveeBloom', point: 'P5', codeHint: 'bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"; bpy.context.scene.eevee.bloom_intensity = 0.45' },
  { tag: '#MotorCelShading3T', point: 'P5', codeHint: 'bpy.context.scene.render.engine = "CEL"' },
  { tag: '#LuzEstudio3Puntos', point: 'P5', codeHint: 'bpy.ops.render.set_lighting(intensity=3.4, angle=42, headlight=True)' },
  { tag: '#ContornoTintaOutline', point: 'P5', codeHint: 'bpy.ops.render.set_outline(thickness=0.016, opacity=0.92)' },
  { tag: '#OclusionSSAO', point: 'P5', codeHint: 'bpy.ops.render.set_ssao(intensity=1.25)' },
  { tag: '#CamaraHeroZoom', point: 'P5', codeHint: 'bpy.ops.view3d.camera_preset(view="hero", zoom=115)' },
  // Punto 6: Modificadores y Triángulos
  { tag: '#ModBevelBiselado', point: 'P6', codeHint: 'mod = obj.modifiers.new(name="Bisel", type="BEVEL"); mod.width = 0.02; mod.segments = 2' },
  { tag: '#ModSubsurfSuave', point: 'P6', codeHint: 'mod = obj.modifiers.new(name="Subsurf", type="SUBSURF"); mod.levels = 2' },
  { tag: '#ModSolidifyGrosor', point: 'P6', codeHint: 'mod = obj.modifiers.new(name="Solidify", type="SOLIDIFY"); mod.thickness = 0.04' },
  { tag: '#ModArrayRepetir', point: 'P6', codeHint: 'mod = obj.modifiers.new(name="Array", type="ARRAY"); mod.count = 6' },
  { tag: '#ModMirrorEspejo', point: 'P6', codeHint: 'mod = obj.modifiers.new(name="Mirror", type="MIRROR"); mod.use_axis = (True, False, False)' },
  { tag: '#SubdividirTriangulos', point: 'P6', codeHint: 'bpy.ops.mesh.subdivide_triangles(segments=2, object=obj)' },
  { tag: '#PintarTriangulos', point: 'P6', codeHint: 'bpy.ops.mesh.paint_triangles(color=(0.2, 0.7, 1.0), object=obj)' },
  // Punto 7: Animación 60 FPS y Mathutils
  { tag: '#AnimAguaViva60FPS', point: 'P7', codeHint: 'bpy.anim.water(obj, speed=2.2, amplitude=0.12, frequency=2.5)' },
  { tag: '#AnimTurntableGiro', point: 'P7', codeHint: 'bpy.anim.loop(obj, type="TURNTABLE", speed=0.8)' },
  { tag: '#AnimHoverFlotar', point: 'P7', codeHint: 'bpy.anim.loop(obj, type="HOVER", speed=1.5, amplitude=0.12)' },
];

export interface GeminiWeeklyUsageStats {
  weekStartIso: string;
  totalGenerations: number;
  argonGenerations: number;
  totalTokens: number;
  thoughtTokens: number;
  lastModelUsed: string;
}

const WEEKLY_USAGE_STORAGE_KEY = 'celshade_gemini_weekly_usage_v1';

export const GEMINI_QUOTA_LINKS = {
  aiStudioPlan: 'https://aistudio.google.com/app/plan_information',
  geminiAccountUsage: 'https://myactivity.google.com/product/gemini',
  cloudQuotas: 'https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas',
};

function getStartOfCurrentWeekIso(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Lunes como inicio de semana
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export function getGeminiWeeklyUsage(): GeminiWeeklyUsageStats {
  const currentWeek = getStartOfCurrentWeekIso();
  try {
    const raw = localStorage.getItem(WEEKLY_USAGE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GeminiWeeklyUsageStats;
      if (parsed.weekStartIso === currentWeek) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    weekStartIso: currentWeek,
    totalGenerations: 0,
    argonGenerations: 0,
    totalTokens: 0,
    thoughtTokens: 0,
    lastModelUsed: 'gemini-3.8-flash',
  };
}

export function recordGeminiUsage(
  modelUsed: string,
  totalTokens: number = 0,
  thoughtTokens: number = 0
): GeminiWeeklyUsageStats {
  const current = getGeminiWeeklyUsage();
  const updated: GeminiWeeklyUsageStats = {
    ...current,
    totalGenerations: current.totalGenerations + 1,
    argonGenerations:
      current.argonGenerations + (modelUsed === 'gemini-4-argon' ? 1 : 0),
    totalTokens: current.totalTokens + (totalTokens || 1450),
    thoughtTokens: current.thoughtTokens + (thoughtTokens || 420),
    lastModelUsed: modelUsed,
  };
  try {
    localStorage.setItem(WEEKLY_USAGE_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
  return updated;
}

export const THINKING_LEVEL_OPTIONS: Array<{
  id: ThinkingLevelChoice;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'LOW',
    label: 'Low (Rápido)',
    shortLabel: 'Low',
    description: 'Mínima latencia y menor consumo de cuota semanal',
  },
  {
    id: 'MEDIUM',
    label: 'Medium (Balanceado)',
    shortLabel: 'Medium',
    description: 'Equilibrio óptimo entre profundidad geométrica y velocidad',
  },
  {
    id: 'HIGH',
    label: 'High (Profundo)',
    shortLabel: 'High',
    description: 'Máxima evolución de razonamiento espacial 3D y trigonometría compleja',
  },
];

export const LIVE_THOUGHT_PHASES: Record<ThinkingLevelChoice, string[]> = {
  LOW: [
    '1/3 • Analizando silueta 3D y dimensiones del pedestal (Y=0.0)...',
    '2/3 • Sintetizando primitivas bpy y coordenadas de simetría...',
    '3/3 • Aplicando paleta Cel-Shading de 3 tonos y compilando script...',
  ],
  MEDIUM: [
    '1/4 • Interpretando estructura morfológica y proporciones anatómicas...',
    '2/4 • Calculando matrices espaciales (X, Y, Z) y ejes de simetría...',
    '3/4 • Programando bucles trigonométricos (math.sin/cos) y sub-piezas...',
    '4/4 • Ajustando contraste de materiales Toon y verificando código bpy...',
  ],
  HIGH: [
    '1/5 • Deconstruyendo arquitectura 3D en volúmenes primarios, secundarios y micro-detalles...',
    '2/5 • Resolviendo cinemática y alineación espacial precisa con BoundingBox de escena...',
    '3/5 • Generando topología procedural avanzada con bucles iterativos y simetría axial...',
    '4/5 • Optimizando densidad poligonal, suavizado esférico de normales y capas de armadura...',
    '5/5 • Calibrando sombreado Cel-Shading de 3 tonos, contornos de tinta y validando sintaxis Python...',
  ],
};

export const ARCHETYPE_OPTIONS = [
  { id: 'auto', label: '✨ Libre / Cualquier Elemento de Juego' },
  { id: 'game_prop_item', label: '📦 Prop / Cofre / Poción / Barril / Loot' },
  { id: 'vehicle_spaceship', label: '🚀 Vehículo / Coche / Nave / Tanque / Barco' },
  { id: 'building_architecture', label: '🏰 Edificio / Casa / Torre / Puente / Portal' },
  { id: 'nature_vegetation', label: '🌲 Naturaleza / Árbol / Roca / Seta / Isla' },
  { id: 'furniture_interior', label: '🪑 Mobiliario / Mesa / Trono / Farola / Altar' },
  { id: 'weapon_relic', label: '⚔️ Arma / Escudo / Herramienta / Reliquia' },
  { id: 'biped_boss', label: '🤖 Personaje / Héroe / NPC / Robot / Guerrero' },
  { id: 'serpentine_dragon', label: '🐉 Criatura / Dragón / Monstruo / Mascota' },
  { id: 'arachnid_mecha', label: '🕷️ Arácnido / Bestia Multi-Pata / Dron' },
  { id: 'winged_entity', label: '🪽 Ser Alado / Ave / Fénix / Ángel' },
];

export const SYMMETRY_OPTIONS = [
  { id: 'bilateral_x', label: 'Simetría Bilateral X (Izq/Der)' },
  { id: 'radial_circle', label: 'Simetría Radial 360° (Anillo)' },
  { id: 'spiral_helix', label: 'Hélice / Espiral Ascendente' },
  { id: 'organic_asym', label: 'Asimétrico / Escenario Natural' },
];

export const PALETTE_OPTIONS = [
  { id: 'crimson_gold', label: 'Carmesí & Oro', colors: ['#e11d48', '#fbbf24', '#1e293b'] },
  { id: 'cyber_neon', label: 'Ciberneón Sci-Fi', colors: ['#06b6d4', '#ec4899', '#1e293b'] },
  { id: 'forest_nature', label: 'Bosque & Madera Natural', colors: ['#22c55e', '#854d0e', '#facc15'] },
  { id: 'medieval_stone', label: 'Piedra Medieval & Oro', colors: ['#64748b', '#92400e', '#fbbf24'] },
  { id: 'abyssal_void', label: 'Abisal & Esmeralda', colors: ['#10b981', '#7c3aed', '#0f172a'] },
  { id: 'celestial_ice', label: 'Cristal Ártico', colors: ['#38bdf8', '#e2e8f0', '#fbbf24'] },
  { id: 'toxic_bio', label: 'Biomecánico Ácido', colors: ['#84cc16', '#a855f7', '#1e1b4b'] },
];

const REFINEMENT_CHIPS = [
  {
    label: '🔍 Auto-Analizar y Mejorar Todo',
    prompt:
      'Analiza visualmente el objeto 3D actual y su código, enriquece su geometría con más sub-piezas detalladas (herrajes, ruedas, arcos, follaje, placas o articulaciones según el tipo de objeto) y apoya la base con bpy.ops.mesh.auto_ground().',
  },
  {
    label: '💎 + Detalles de Juego (Gemas / Luces / Herrajes)',
    prompt:
      'Añade detalles de videojuego al objeto actual: remaches metálicos, cristales brillantes (primitive_octahedron_add), marcos reforzados (primitive_armor_plate_add) y ornamentos simétricos.',
  },
  {
    label: '🌿 + Base / Pedestal de Escenario',
    prompt:
      'Añade debajo del objeto una base de escenario de videojuego con rocas facetadas (primitive_dodecahedron_add), escalones o losas y cristales ambientales.',
  },
  {
    label: '⚡ + Efectos de Energía / Ruedas / Alas',
    prompt:
      'Si es un vehículo añade turbinas/ruedas (primitive_wheel_pair_add), si es un prop/edificio añade un portal o halo de energía (primitive_torus_add), y si es criatura/personaje añade alas o armadura.',
  },
];

export const GEMINI_MODEL_OPTIONS = [
  {
    id: 'gemini-4-argon',
    label: 'Google Argon (Gemini 4)',
    sublabel: 'Modelo insignia de razonamiento espacial y código 3D avanzado (Cuenta Google)',
    badge: 'Argon 4',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    sublabel: 'Rápido, multimodal & thinking balanceado',
    badge: 'Recomendado',
  },
  {
    id: 'gemini-3.8-pro',
    label: 'Gemini 3.8 Pro',
    sublabel: 'Máxima precisión matemática y código 3D complejo',
    badge: 'Pro',
  },
  {
    id: 'gemini-3.8-thinking',
    label: 'Gemini 3.8 Thinking',
    sublabel: 'Razonamiento profundo paso a paso en geometría',
    badge: 'Deep',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    sublabel: 'Ligero y optimizado para iteraciones ultrarrápidas',
    badge: 'Flash',
  },
];

interface PythonScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunScript: (
    code: string,
    customLabel?: string,
    coordinateMode?: BlenderCoordinateMode
  ) => Promise<ScriptExecutionResult>;
  externalCode?: string | null;
  getViewportSnapshot?: () => string | null;
  getSceneBounds?: () => SceneBoundsData | undefined;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  thinkingLevel?: ThinkingLevelChoice;
  onThinkingLevelChange?: (level: ThinkingLevelChoice) => void;
  userEmail?: string | null;
  onUsageUpdated?: (stats: GeminiWeeklyUsageStats) => void;
  onClearScene?: (keepCode?: boolean) => void;
  coordinateMode?: BlenderCoordinateMode;
  onCoordinateModeChange?: (mode: BlenderCoordinateMode) => void;
  onSwapSceneAxesYZ?: () => void;
}

export default function PythonScriptModal({
  isOpen,
  onClose,
  onRunScript,
  externalCode,
  getViewportSnapshot,
  getSceneBounds,
  selectedModel = 'gemini-3.8-flash',
  onModelChange,
  thinkingLevel = 'MEDIUM',
  onThinkingLevelChange,
  userEmail,
  onUsageUpdated,
  onClearScene,
  coordinateMode: externalCoordMode,
  onCoordinateModeChange,
  onSwapSceneAxesYZ,
}: PythonScriptModalProps) {
  const [internalModel, setInternalModel] = useState<string>(selectedModel);
  const [internalThinking, setInternalThinking] = useState<ThinkingLevelChoice>(thinkingLevel);

  const activeModel = onModelChange ? selectedModel : internalModel;
  const handleModelSelect = (m: string) => {
    setInternalModel(m);
    if (onModelChange) onModelChange(m);
  };

  const activeThinking = onThinkingLevelChange ? thinkingLevel : internalThinking;
  const handleThinkingSelect = (lvl: ThinkingLevelChoice) => {
    setInternalThinking(lvl);
    if (onThinkingLevelChange) onThinkingLevelChange(lvl);
  };

  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [scriptCode, setScriptCode] = useState<string>('');
  const [internalCoordinateMode, setInternalCoordinateMode] = useState<BlenderCoordinateMode>('auto');
  const coordinateMode = onCoordinateModeChange && externalCoordMode ? externalCoordMode : internalCoordinateMode;
  const handleCoordinateModeSelect = (nextMode: BlenderCoordinateMode, reRunCurrentScript: boolean = false) => {
    setInternalCoordinateMode(nextMode);
    if (onCoordinateModeChange) {
      onCoordinateModeChange(nextMode);
    }
    if (reRunCurrentScript && scriptCode.trim()) {
      // Actualiza cabecera # COORD_MODE si existe para que coincida con la elección rápida del usuario
      const strippedHeader = scriptCode.replace(/^#\s*COORD_MODE:\s*(Z_UP|Y_UP)\s*\n?/im, '');
      const nextCode =
        nextMode === 'blender_z_up'
          ? `# COORD_MODE: Z_UP\n${strippedHeader}`
          : nextMode === 'studio_y_up'
          ? `# COORD_MODE: Y_UP\n${strippedHeader}`
          : strippedHeader;
      setScriptCode(nextCode);
      void handleExecute(false, nextCode, `Cambio Ejes (${nextMode})`, nextMode);
    }
  };
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'docs'>('editor');
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    'Python 3.11 [Motor Blender 5.2 bpy — Compatible con scripts de Gemini Web, Principled BSDF, Modifiers, bmesh y Z-Up]',
    'Puedes pegar directamente cualquier script Python de Blender 5.2 creado en la web o usar el asistente de arriba.',
    'Pulsa "Ejecutar y Ver en 3D" (o Ctrl + Enter) para construir en la escena (0 llamadas API al ejecutar código).',
  ]);
  const [lastResult, setLastResult] = useState<ScriptExecutionResult | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [copiedWebPrompt, setCopiedWebPrompt] = useState<boolean>(false);
  const [copiedConsoleSuccess, setCopiedConsoleSuccess] = useState<boolean>(false);
  const [copiedErrorSuccess, setCopiedErrorSuccess] = useState<boolean>(false);

  // Estado del Complemento Gemini AI -> Python (bpy) + Evolución del Pensamiento
  const [geminiPrompt, setGeminiPrompt] = useState<string>('');
  const [geminiMode, setGeminiMode] = useState<'replace' | 'append' | 'refine'>('replace');
  const [isGeneratingGemini, setIsGeneratingGemini] = useState<boolean>(false);
  const [geminiSummary, setGeminiSummary] = useState<string | null>(null);
  const [thoughtSteps, setThoughtSteps] = useState<string[]>([]);
  const [livePhaseIndex, setLivePhaseIndex] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [lastTokenUsage, setLastTokenUsage] = useState<{
    thoughtsTokens: number;
    totalTokens: number;
  } | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<GeminiWeeklyUsageStats>(() =>
    getGeminiWeeklyUsage()
  );

  const [showHelpersPanel, setShowHelpersPanel] = useState<boolean>(true);
  const [showTrainingTagsCloud, setShowTrainingTagsCloud] = useState<boolean>(false);
  const [helpers, setHelpers] = useState<GeminiDrawingHelpersState>({
    archetype: 'auto',
    symmetry: 'bilateral_x',
    complexity: 'high',
    palette: 'crimson_gold',
    autoSmooth: false,
    autoTexture: 'none',
    sendViewportSnapshot: true,
    aiTools: ['use_world_props', 'use_limbs', 'use_armor_plates', 'use_horns_blades', 'auto_ground'],
    autoCritique: true,
  });
  const [referenceImageBase64, setReferenceImageBase64] = useState<string | null>(null);
  const [referenceImageName, setReferenceImageName] = useState<string | null>(null);
  const [pasteHintMessage, setPasteHintMessage] = useState<string | null>(null);
  const refImgInputRef = useRef<HTMLInputElement>(null);
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const safeCopyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback para iframes con política de permisos restringida
    }
    try {
      const tempArea = document.createElement('textarea');
      tempArea.value = text;
      tempArea.style.position = 'fixed';
      tempArea.style.left = '-9999px';
      tempArea.style.top = '0';
      document.body.appendChild(tempArea);
      tempArea.focus();
      tempArea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(tempArea);
      return ok;
    } catch {
      return false;
    }
  };

  const scrollToEditorLine = (lineNum: number) => {
    const textarea = codeTextareaRef.current;
    if (!textarea || lineNum < 1) return;
    const lines = scriptCode.split('\n');
    const targetIdx = Math.min(lineNum - 1, Math.max(0, lines.length - 1));
    let charStart = 0;
    for (let i = 0; i < targetIdx; i++) {
      charStart += lines[i].length + 1;
    }
    const charEnd = charStart + (lines[targetIdx]?.length ?? 0);
    textarea.focus();
    textarea.setSelectionRange(charStart, charEnd);
    const lineHeightPx = 19.5;
    const targetScrollTop = Math.max(0, targetIdx * lineHeightPx - textarea.clientHeight / 3);
    textarea.scrollTop = targetScrollTop;
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = targetScrollTop;
    }
  };

  useEffect(() => {
    if (externalCode && externalCode.trim()) {
      setScriptCode(stripMarkdownCodeFences(externalCode));
      setSelectedPresetId('gemini_custom');
    }
  }, [externalCode]);

  // Temporizador de evolución del pensamiento en vivo mientras Gemini procesa
  useEffect(() => {
    if (!isGeneratingGemini) {
      setLivePhaseIndex(0);
      setElapsedSeconds(0);
      return;
    }
    const phases = LIVE_THOUGHT_PHASES[activeThinking] || LIVE_THOUGHT_PHASES.MEDIUM;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      setLivePhaseIndex((prev) => (prev < phases.length - 1 ? prev + 1 : prev));
    }, 1600);
    return () => clearInterval(timer);
  }, [isGeneratingGemini, activeThinking]);

  if (!isOpen) return null;

  const generatePresets = BLENDER_SCRIPT_PRESETS.filter((p) => p.category === 'generate');
  const modifyPresets = BLENDER_SCRIPT_PRESETS.filter((p) => p.category === 'modify');

  const handlePresetSelect = (preset: BlenderScriptPreset) => {
    setSelectedPresetId(preset.id);
    setScriptCode(preset.code);
    setGeminiSummary(null);
    setLastResult(null);
  };

  const handleReferenceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReferenceImageBase64(reader.result);
        setReferenceImageName(file.name);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleExecute = async (
    closeOnSuccess: boolean = false,
    codeOverride?: string,
    labelOverride?: string,
    coordOverride?: BlenderCoordinateMode
  ) => {
    const rawCodeToRun = codeOverride ?? scriptCode;
    const cleanedCodeToRun = stripMarkdownCodeFences(rawCodeToRun);
    if (cleanedCodeToRun !== scriptCode) {
      setScriptCode(cleanedCodeToRun);
    }
    const modeToUse = coordOverride ?? coordinateMode;
    setIsRunning(true);
    try {
      const res = await onRunScript(cleanedCodeToRun, labelOverride, modeToUse);
      setLastResult(res);
      setTerminalLogs(res.logs);
      if (!res.success && res.errorLine) {
        setTimeout(() => scrollToEditorLine(res.errorLine!), 80);
      }
      if (closeOnSuccess && res.success) {
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTerminalLogs((prev) => [...prev, `Excepción: ${msg}`]);
    } finally {
      setIsRunning(false);
    }
  };

  // Limpia el editor y opcionalmente vacía la escena 3D para empezar desde 0
  const handleClearEditorFromZero = (alsoClear3DScene: boolean = true) => {
    setScriptCode('');
    setSelectedPresetId('');
    setGeminiPrompt('');
    setLastResult(null);
    setGeminiSummary(null);
    setPasteHintMessage(null);
    if (alsoClear3DScene && onClearScene) {
      onClearScene(false);
      setTerminalLogs([
        '🧹 [Editor & Escena 3D] Todo borrado. Lienzo y editor listos desde 0.',
        '💡 Escribe tu código Python bpy desde cero o pega un script con Ctrl + V.',
      ]);
    } else {
      setTerminalLogs([
        '🧹 [Editor Python] Código borrado. Editor en blanco listo para escribir desde 0.',
      ]);
    }
    setTimeout(() => {
      codeTextareaRef.current?.focus();
    }, 50);
  };

  // Inserta una plantilla mínima limpia para empezar a programar en Blender 5.2 desde 0
  const handleInsertStarterTemplate = () => {
    const starter = `import bpy
import bmesh
import math
from mathutils import Vector, Matrix, Color

# 1. Limpiar escena 3D actual para empezar desde 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# 2. Escribe aquí tu código Blender 5.2 desde cero:
`;
    setScriptCode(starter);
    setSelectedPresetId('');
    setLastResult(null);
    setGeminiSummary(null);
    if (onClearScene) {
      onClearScene(true);
    }
    setTerminalLogs([
      '📄 [Plantilla Desde 0] Plantilla base cargada y escena 3D limpia.',
    ]);
    setTimeout(() => {
      if (codeTextareaRef.current) {
        codeTextareaRef.current.focus();
        codeTextareaRef.current.selectionStart = starter.length;
        codeTextareaRef.current.selectionEnd = starter.length;
      }
    }, 50);
  };

  const handleCopyConsoleOutput = async () => {
    const textToCopy = terminalLogs.join('\n');
    await safeCopyToClipboard(textToCopy);
    setCopiedConsoleSuccess(true);
    setTimeout(() => setCopiedConsoleSuccess(false), 2500);
  };

  const handleCopyErrorDiagnostic = async () => {
    if (!lastResult || lastResult.success) return;
    const errorSummary = [
      `Error en Línea ${lastResult.errorLine ?? '?'}: ${lastResult.error ?? 'Error de ejecución'}`,
      lastResult.errorSourceCode ? `Código en línea ${lastResult.errorLine}: ${lastResult.errorSourceCode}` : '',
      lastResult.errorReason ? `Por qué falla: ${lastResult.errorReason}` : '',
      '',
      '--- Consola Completa ---',
      ...terminalLogs,
    ]
      .filter(Boolean)
      .join('\n');
    await safeCopyToClipboard(errorSummary);
    setCopiedErrorSuccess(true);
    setTimeout(() => setCopiedErrorSuccess(false), 2500);
  };

  const handleTogglePromptTag = (tagItem: GeminiTrainingTagItem) => {
    setGeminiPrompt((prev) => {
      if (prev.includes(tagItem.tag)) {
        return prev.replace(tagItem.tag, '').replace(/\s{2,}/g, ' ').trim();
      }
      return `${prev.trim()} ${tagItem.tag} (${tagItem.codeHint})`.trim();
    });
  };

  const handleCopyPromptForGeminiWeb = async () => {
    const idea =
      geminiPrompt.trim() ||
      'Un asset 3D o arquitectura rica en detalles materiales, texturas PBR 3D y modificadores (ej. monumento histórico, vehículo detallado, escenario fantástico o criatura)';
    const allTagsLine = GEMINI_TRAINING_TAGS.map((t) => t.tag).join(' ');
    const activeToolkitSummary = AI_TOOLKIT_OPTIONS.filter((t) => helpers.aiTools.includes(t.id))
      .map((t) => `• ${t.label}: ${t.description}`)
      .join('\n');

    const isWebZUp = coordinateMode === 'blender_z_up' || coordinateMode === 'auto';
    const currentBounds = getSceneBounds ? getSceneBounds() : undefined;
    const boundsSection = currentBounds
      ? isWebZUp
        ? `\nBOUNDING BOX EXACTO DEL MODELO EN ESCENA (BLENDER Z-UP, SUELO EN Z=0.00):\n   - X (Izq/Der): [${(currentBounds.minX ?? -currentBounds.widthX / 2).toFixed(2)}, ${(currentBounds.maxX ?? currentBounds.widthX / 2).toFixed(2)}]\n   - Y (Profundidad Frente/Fondo): [${(-(currentBounds.maxZ ?? currentBounds.depthZ / 2)).toFixed(2)}, ${(-(currentBounds.minZ ?? -currentBounds.depthZ / 2)).toFixed(2)}]\n   - Z (ALTURA VERTICAL): desde Z=${currentBounds.minY.toFixed(2)} hasta Z=${currentBounds.maxY.toFixed(2)}`
        : `\nBOUNDING BOX EXACTO DEL MODELO EN ESCENA (ESTUDIO Y-UP, SUELO EN Y=0.00):\n   - X (Izq/Der): [${(currentBounds.minX ?? -currentBounds.widthX / 2).toFixed(2)}, ${(currentBounds.maxX ?? currentBounds.widthX / 2).toFixed(2)}]\n   - Y (ALTURA VERTICAL): desde Y=${currentBounds.minY.toFixed(2)} hasta Y=${currentBounds.maxY.toFixed(2)}\n   - Z (Profundidad Fondo/Frente): [${(currentBounds.minZ ?? -currentBounds.depthZ / 2).toFixed(2)}, ${(currentBounds.maxZ ?? currentBounds.depthZ / 2).toFixed(2)}]`
      : '';

    const webPromptText = `Actúa como un Ingeniero Técnico de Arte 3D experto en Python para Blender 5.2 (bpy, bmesh, math, mathutils) entrenado con los 7 PUNTOS COMPLETOS del motor "CelShade Studio 3D".
Construye en 3D con el máximo nivel de detalle este modelo: "${idea}".

=== SISTEMA DE EJES OBLIGATORIO (${isWebZUp ? 'BLENDER 5.2 Z-UP: EJE Z ES ALTURA' : 'ESTUDIO WEBGL Y-UP: EJE Y ES ALTURA'}) ===
- Primera línea obligatoria del script: ${isWebZUp ? '# COORD_MODE: Z_UP' : '# COORD_MODE: Y_UP'}
${
  isWebZUp
    ? '- Eje X = Izquierda(-)/Derecha(+) | Eje Y = Profundidad Frente(-)/Fondo(+) | Eje Z = ALTURA VERTICAL (Suelo en Z=0.00, Arriba es +Z).\n- PROHIBIDO usar Y como altura. En location=(x, y, z), el 3er valor z es SIEMPRE la altura vertical.'
    : '- Eje X = Izquierda(-)/Derecha(+) | Eje Y = ALTURA VERTICAL (Suelo en Y=0.00, Arriba es +Y) | Eje Z = Profundidad Fondo(-)/Frente(+).\n- PROHIBIDO usar Z como altura. En location=(x, y, z), el 2º valor y es SIEMPRE la altura vertical.'
}${boundsSection}

=== ENTRENAMIENTO MAESTRO GEMINI: LOS 7 PUNTOS COMPLETOS DE LA API DEL PROGRAMA ===

PUNTO 1. LIMPIEZA, COORDENADAS, PRIMITIVAS, GEOMETRÍA ORGÁNICA Y MACROS (\`bpy.ops.mesh.*\` & \`bpy.ops.curve.*\`):
   - Limpieza inicial:
     ${isWebZUp ? '# COORD_MODE: Z_UP' : '# COORD_MODE: Y_UP'}
     import bpy, bmesh, math, mathutils
     bpy.ops.object.select_all(action='SELECT')
     bpy.ops.object.delete()
   - Coordenadas: Respeta estrictamente ${isWebZUp ? 'Z-Up (Z=Altura, suelo Z=0.0)' : 'Y-Up (Y=Altura, suelo Y=0.0)'} sin mezclar ejes.
   - Primitivas Clásicas (todas aceptan location, rotation, scale, size/radius/depth, vertices, subdivisions, color):
     primitive_cube_add, primitive_uv_sphere_add, primitive_ico_sphere_add, primitive_cylinder_add, primitive_cone_add, primitive_torus_add, primitive_torus_knot_add, primitive_plane_add, primitive_grid_add, primitive_circle_add, primitive_monkey_add, curve.primitive_bezier_curve_add, curve.primitive_bezier_circle_add.
   - Geometría Orgánica y Chasis:
     primitive_capsule_add(radius, length), primitive_octahedron_add(radius, detail), primitive_dodecahedron_add(radius, detail), primitive_horn_add(base_radius, tip_radius, length, bend), primitive_blade_add(length, width, thickness, curve), primitive_armor_plate_add(width, height, thickness, curvature).
   - Macro-Herramientas Universales en 1 Línea:
     primitive_arch_add(width, height, thickness), primitive_wheel_pair_add(radius, width, span, y_pos, z_pos), primitive_tree_foliage_add(radius, layers), primitive_prop_chest_add(width, height, depth), primitive_limb_pair_add(start_pos, mid_pos, end_pos, thickness, joint_size), primitive_wing_pair_add(span, feathers, y_height, z_offset, spread).

PUNTO 2. MALLAS PERSONALIZADAS \`from_pydata\` Y TOPOLOGÍA DENSA \`bmesh\` (\`bmesh.ops.create_grid\` & \`objects.link\`):
   - Polígonos exactos con \`from_pydata\`:
     mesh = bpy.data.meshes.new(name="Malla"); mesh.from_pydata(verts, edges, faces); mesh.update()
     obj = bpy.data.objects.new("Objeto", mesh); bpy.context.collection.objects.link(obj)
   - Mallas procedurales densas con \`bmesh\`:
     bm = bmesh.new() # o bm.from_mesh(mesh)
     bmesh.ops.create_grid(bm, x_segments=40, y_segments=40, size=4.0) # también create_cube, create_uvsphere, create_icosphere, create_cone, create_cylinder
     for v in bm.verts: v.co.z += 0.15 * math.sin(v.co.x * 2.0) * math.cos(v.co.y * 2.0)
     for f in bm.faces: f.smooth = True
     bmesh.ops.translate / scale / rotate / extrude_face_region / bevel / bisect_plane / recalc_face_normals
     bm.to_mesh(mesh); bm.free()

PUNTO 3. BIBLIOTECA COMPLETA DE 38 TEXTURAS PBR 3D + RELIEVE BUMP (POR OBJETO O GLOBAL) Y SUS ALIAS:
   - Asignación por material:
     mat.texture = "stone_ashlar" # o bsdf.inputs["Texture"].default_value = "stone_ashlar"
     mat.texture_repeat = 2       # repetición UV (1 a 8)
     mat.bump_strength = 1.2      # relieve 3D Bump (0.0 a 2.5)
   - Asignación por objeto o global:
     bpy.ops.material.set_texture(name="stone_ashlar", object=obj, repeat=2, bump=1.2, natural_color=True)
   - LAS 38 TEXTURAS PBR + BUMP 3D DISPONIBLES:
     * Arquitectura y Piedra (11): 'stone_ashlar' (alias: 'piedra', 'silleria', 'caliza'), 'travertine_roman' ('travertino'), 'marble_carrara' ('marmol', 'carrara'), 'marble_nero' ('marmol_negro', 'marquina'), 'cobblestone' ('adoquin', 'empedrado'), 'brick_mudejar' ('ladrillo', 'mudejar'), 'terracotta_roof' ('teja', 'terracota'), 'slate_roof' ('pizarra'), 'andalusi_tiles' ('azulejo', 'ceramica'), 'stained_glass' ('vidriera', 'vitral'), 'concrete_brutalist' ('hormigon', 'cemento').
     * Maderas y Naturaleza (10): 'wood_oak' ('madera', 'roble'), 'wood_mahogany' ('caoba', 'nogal'), 'tree_bark' ('corteza', 'tronco'), 'water_caustics' ('agua', 'mar'), 'ocean_deep' ('oceano', 'olas'), 'desert_sand' ('arena', 'dunas'), 'moss_nature' ('musgo', 'liquen'), 'grass_meadow' ('hierba', 'cesped'), 'ice_crystal' ('hielo', 'glaciar'), 'fresh_snow' ('nieve', 'escarcha').
     * Metales, Tejidos y Cuero (8): 'brushed_metal' ('metal', 'acero', 'aluminio'), 'damascus_steel' ('damasco', 'forjado'), 'gold_damascene' ('oro', 'dorado', 'orfebreria'), 'copper_patina' ('bronce', 'cobre', 'patina'), 'carbon_weave' ('carbono', 'kevlar'), 'leather_tufted' ('cuero', 'piel'), 'royal_velvet' ('terciopelo', 'seda'), 'woven_linen' ('lino', 'tela', 'arpillera').
     * Fantasía, Sci-Fi y Anime (8): 'dragon_scales' ('escamas'), 'biomech_plates' ('biomecanico'), 'magma_cracks' ('magma', 'lava'), 'solar_plasma' ('plasma', 'sol'), 'hologram_grid' ('holograma'), 'halftone_manga' ('manga', 'comic'), 'cyber_circuits' ('circuitos', 'cyber'), 'smooth_skin' ('cel', 'anime').

PUNTO 4. MATERIALES PBR AVANZADOS \`Principled BSDF\` (Blender 5.2) Y NODOS CEL-SHADE / ANIME:
   - Creación: mat = bpy.data.materials.new(name="..."); mat.use_nodes = True; bsdf = mat.node_tree.nodes["Principled BSDF"]
   - Inputs soportados en bsdf.inputs[...].default_value:
     * "Base Color": (R, G, B, 1.0) | "Metallic": 0.0..1.0 | "Roughness": 0.02..1.0
     * "Coat Weight": 0.0..1.0 y "Coat Roughness": 0.02..0.5 (Barniz Clearcoat automotriz / cerámico)
     * "Anisotropic": 0.0..1.0 (Metales cepillados)
     * "Transmission Weight": 0.0..0.95, "IOR": 1.45..2.4, "Alpha": 0.15..1.0 (Cristales reales, vidrieras, agua, gemas)
     * "Emission Color": (R, G, B, 1.0) y "Emission Strength": 0.0..10.0
     * "Bump Strength" / "Normal": 0.0..2.5 | "Texture": ID de cualquiera de las 38 texturas
   - Nodos procedurales y Cel-Shade: ShaderNodeShaderToRGB + ShaderNodeValToRGB (ColorRamp con interpolation='CONSTANT'), ShaderNodeBump, ShaderNodeTexNoise, ShaderNodeTexBrick, ShaderNodeTexWave, ShaderNodeTexChecker, ShaderNodeTexVoronoi.

PUNTO 5. MOTORES DE RENDER (\`CYCLES\` / \`EEVEE\` / \`CEL\` / \`MATCAP\`), ILUMINACIÓN 3 PUNTOS, CONTORNOS, SSAO Y CÁMARA/ZOOM:
   - Selección de motor:
     bpy.context.scene.render.engine = 'CYCLES' # Opciones: 'CYCLES', 'BLENDER_EEVEE_NEXT', 'EEVEE', 'CEL', 'MATCAP', 'NORMALS', 'ORIGINAL'
   - Parámetros físicos Cycles y EEVEE:
     bpy.context.scene.cycles.samples = 128
     bpy.context.scene.cycles.clearcoat = 0.65
     bpy.context.scene.cycles.roughness_factor = 0.85
     bpy.context.scene.cycles.ior = 1.52
     bpy.context.scene.cycles.gi_bounce = 1.45
     bpy.context.scene.eevee.bloom_intensity = 0.45
     bpy.context.scene.eevee.env_intensity = 1.35
   - Iluminación, Contornos, SSAO, Suavizado de Normales, Viewport y Cámara/Zoom:
     bpy.ops.render.set_lighting(intensity=3.4, angle=42, headlight=True)
     bpy.ops.render.set_outline(thickness=0.015, opacity=0.90)
     bpy.ops.render.set_ssao(intensity=1.2)
     bpy.ops.render.set_normal_smoothing(factor=0.92)
     bpy.ops.render.set_viewport(bg_color="#182030", pedestal=True, auto_rotate=False, auto_rotate_speed=1.8)
     bpy.ops.view3d.camera_preset(view='hero', zoom=115) # Vistas: 'hero', 'front', 'closeup', 'macro', 'side', 'top'
     bpy.ops.view3d.set_zoom(percent=135)
     bpy.ops.view3d.frame_all(margin=1.15)

PUNTO 6. MODIFICADORES NO DESTRUCTIVOS (\`BEVEL\`, \`SUBSURF\`, \`SOLIDIFY\`, \`ARRAY\`, \`MIRROR\`) Y EDICIÓN DE TRIÁNGULOS:
   - Biselado realista: mod = obj.modifiers.new(name="Bisel", type='BEVEL'); mod.width = 0.02; mod.segments = 2
   - Subdivisión suave: mod = obj.modifiers.new(name="Subsurf", type='SUBSURF'); mod.levels = 2
   - Grosor / Contorno Anime: mod = obj.modifiers.new(name="Solidify", type='SOLIDIFY'); mod.thickness = 0.04 (o negativo con mod.use_flip_normals = True para outline negro)
   - Matriz matemática: mod = obj.modifiers.new(name="Array", type='ARRAY'); mod.count = 6; mod.relative_offset_displace = (1.2, 0.0, 0.0)
   - Simetría espejo: mod = obj.modifiers.new(name="Mirror", type='MIRROR'); mod.use_axis = (True, False, False)
   - Subdivisión y Pintura por Triángulos y Malla:
     bpy.ops.mesh.subdivide_triangles(segments=2, object=obj) # Divide cada triángulo en 4 (segments=2), 9 (3) o 16 (4)
     bpy.ops.mesh.paint_triangles(color=(0.2, 0.7, 1.0), object=obj)
     bpy.ops.mesh.mirror_x() | bpy.ops.mesh.taper(factor=0.22, axis='Y') | bpy.ops.mesh.smooth(iterations=3, factor=0.45) | bpy.ops.mesh.auto_ground()

PUNTO 7. ANIMACIÓN EN VIVO A 60 FPS (\`bpy.anim.*\`), ÁLGEBRA \`mathutils\` Y SINTAXIS PYTHON AVANZADA:
   - Animación continua en el visor WebGL (60 FPS):
     bpy.anim.water(obj, speed=2.0, amplitude=0.10, frequency=2.5)
     bpy.anim.loop(obj, type='TURNTABLE', speed=0.8) # Tipos: 'TURNTABLE', 'HOVER', 'PULSE', 'PENDULUM'
   - Álgebra y Sintaxis: mathutils.Vector, Euler, Matrix, Quaternion, operador @ (Matrix @ Vector), numpy as np, comprensiones de listas/dicts, slicing arr[::-1], f-strings y clases bpy.types.Operator.

=== TAGS Y OPCIONES ACTIVAS EN ESTE ENTRENAMIENTO ===
${activeToolkitSummary || '• Todos los módulos de los 7 puntos activos.'}
TAGS DISPONIBLES: ${allTagsLine}

Termina siempre con bpy.ops.mesh.auto_ground() y devuelve únicamente el bloque de código Python ejecutable.`;
    await safeCopyToClipboard(webPromptText);
    setCopiedWebPrompt(true);
    setTimeout(() => setCopiedWebPrompt(false), 3000);
  };

  const handlePasteAndRunWebScript = async () => {
    setPasteHintMessage(null);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          const cleaned = stripMarkdownCodeFences(clipText);
          onClearScene?.(true);
          setScriptCode(cleaned);
          setSelectedPresetId('web_blender52_custom');
          await handleExecute(false, cleaned, 'Script Blender 5.2 Web');
          return;
        }
      }
    } catch {
      // El navegador bloquea navigator.clipboard.readText() dentro de iframes por seguridad
    }

    if (codeTextareaRef.current) {
      codeTextareaRef.current.focus();
      codeTextareaRef.current.select();
    }
    setPasteHintMessage(
      'Pulsa ahora Ctrl + V (o Clic derecho → Pegar) en el editor o en la consola y el código Python se pegará y ejecutará en 3D automáticamente.'
    );
    setTerminalLogs((prev) => [
      ...prev,
      '>>> [Listo para Pegar]: Pulsa Ctrl + V (o Cmd + V) ahora mismo en el editor o en esta consola para pegar tu código Python y ejecutarlo.',
    ]);
  };

  const handleCodeEditorPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData?.getData('text/plain') || '';
    if (!pastedText.trim()) return;

    const textarea = e.currentTarget;
    const selectionLength = Math.abs(textarea.selectionEnd - textarea.selectionStart);
    const isEntireEditorSelected = selectionLength >= scriptCode.length * 0.85 || scriptCode.trim().length === 0;
    const isFullScriptPaste =
      /\bimport\s+bpy\b/.test(pastedText) ||
      pastedText.includes('```') ||
      (isLikelyBlenderPythonCode(pastedText) && pastedText.split('\n').length >= 12);

    // Si el usuario pega un script completo (ej. con import bpy o bloque markdown) o viene del botón "Pegar y Ejecutar",
    // reemplazamos limpiando bloques ```python y ejecutamos automáticamente.
    // Si está pegando un fragmento pequeño en medio de su código, dejamos que el navegador lo inserte en la posición del cursor.
    if (pasteHintMessage || isEntireEditorSelected || isFullScriptPaste) {
      e.preventDefault();
      const cleaned = stripMarkdownCodeFences(pastedText);
      onClearScene?.(true);
      setScriptCode(cleaned);
      setSelectedPresetId('web_blender52_custom');
      setPasteHintMessage(null);
      setGeminiSummary(
        'Código Python de Blender 5.2 pegado y ejecutado localmente (0 llamadas API).'
      );
      void handleExecute(false, cleaned, 'Script Blender 5.2 Pegado');
    }
  };

  const handleConsolePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedText = e.clipboardData?.getData('text/plain') || '';
    if (!pastedText.trim()) return;
    e.preventDefault();
    const cleaned = stripMarkdownCodeFences(pastedText);
    onClearScene?.(true);
    setScriptCode(cleaned);
    setSelectedPresetId('web_blender52_custom');
    setPasteHintMessage(null);
    setGeminiSummary(
      'Código Python pegado directamente en la consola y ejecutado (0 llamadas API).'
    );
    void handleExecute(false, cleaned, 'Script Pegado en Consola');
  };

  const handlePromptInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData?.getData('text/plain') || '';
    if (isLikelyBlenderPythonCode(pastedText)) {
      e.preventDefault();
      const cleaned = stripMarkdownCodeFences(pastedText);
      onClearScene?.(true);
      setScriptCode(cleaned);
      setSelectedPresetId('web_blender52_custom');
      setGeminiPrompt('');
      setPasteHintMessage(null);
      setGeminiSummary(
        'Detectado código Python (bpy) al pegar: ejecutado directamente en el motor Blender 5.2 (0 llamadas API).'
      );
      void handleExecute(false, cleaned, 'Script Blender 5.2 Pegado');
    } else if (pastedText.trim().length > 0 && geminiMode === 'replace') {
      onClearScene?.(true);
    }
  };

  const handleGenerateWithGemini = async (
    customPrompt?: string,
    customMode?: 'replace' | 'append' | 'refine'
  ) => {
    const promptToUse = (customPrompt ?? geminiPrompt).trim();
    const modeToUse = customMode ?? geminiMode;
    if (!promptToUse || isGeneratingGemini) return;

    // Si el usuario pegó directamente un script Python de Blender en la caja de prompt, ejecutarlo localmente sin gastar cuota API
    if (isLikelyBlenderPythonCode(promptToUse)) {
      const cleaned = stripMarkdownCodeFences(promptToUse);
      onClearScene?.(true);
      setScriptCode(cleaned);
      setSelectedPresetId('web_blender52_custom');
      setGeminiPrompt('');
      setGeminiSummary(
        'Código Python de Blender 5.2 detectado y ejecutado localmente (0 llamadas API).'
      );
      await handleExecute(false, cleaned, 'Script Blender 5.2 Directo');
      return;
    }

    setIsGeneratingGemini(true);
    setGeminiSummary(null);
    setThoughtSteps([]);
    setLastTokenUsage(null);

    const viewportSnap =
      helpers.sendViewportSnapshot && getViewportSnapshot ? getViewportSnapshot() : null;
    const sceneBounds = getSceneBounds ? getSceneBounds() : undefined;

    if (modeToUse === 'replace') {
      onClearScene?.(true);
    }

    setTerminalLogs([
      `>>> [Asistente Gemini 3D] Modelo: ${activeModel} | Pensamiento: ${activeThinking}`,
      `>>> Analizando petición: "${promptToUse}"`,
      `>>> Guías activas: Arquetipo=${helpers.archetype}, Simetría=${helpers.symmetry}, Detalle=${helpers.complexity}, Paleta=${helpers.palette}`,
      referenceImageBase64
        ? `>>> Boceto / Imagen de referencia adjunta: ${referenceImageName}`
        : `>>> Contexto visual del visor 3D: ${viewportSnap ? 'Activo (+ Medidas BoundingBox)' : 'Desactivado'}`,
    ]);

    try {
      const response = await fetch('/api/gemini/bpy-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToUse,
          mode: modeToUse,
          currentCode: scriptCode,
          helpers: {
            archetype: helpers.archetype,
            symmetry: helpers.symmetry,
            complexity: helpers.complexity,
            palette: helpers.palette,
            autoSmooth: helpers.autoSmooth,
            autoTexture: helpers.autoTexture,
            aiTools: helpers.aiTools,
            autoCritique: helpers.autoCritique || modeToUse === 'refine',
            coordinateMode,
            sceneBounds,
          },
          referenceImageBase64: referenceImageBase64 || undefined,
          viewportImageBase64: viewportSnap || undefined,
          selectedModel: activeModel,
          thinkingLevel: activeThinking,
          userEmail: userEmail || undefined,
        }),
      });

      const data = (await response.json()) as {
        title?: string;
        summary?: string;
        thoughtEvolution?: string[];
        pythonCode?: string;
        modelUsed?: string;
        fallbackNotice?: string;
        thinkingLevelUsed?: string;
        usage?: {
          promptTokens: number;
          OutputTokens: number;
          thoughtsTokens: number;
          totalTokens: number;
        };
        error?: string;
      };

      if (!response.ok || !data.pythonCode) {
        throw new Error(data.error || 'No se pudo generar el script con Gemini.');
      }

      setScriptCode(data.pythonCode);
      setSelectedPresetId('gemini_custom');
      setGeminiSummary(
        `${data.title}: ${data.summary}${data.fallbackNotice ? ` (${data.fallbackNotice})` : ''}`
      );
      if (data.thoughtEvolution && data.thoughtEvolution.length > 0) {
        setThoughtSteps(data.thoughtEvolution);
      }
      if (data.usage) {
        setLastTokenUsage({
          thoughtsTokens: data.usage.thoughtsTokens,
          totalTokens: data.usage.totalTokens,
        });
      }

      const updatedStats = recordGeminiUsage(
        data.modelUsed || activeModel,
        data.usage?.totalTokens || 0,
        data.usage?.thoughtsTokens || 0
      );
      setWeeklyStats(updatedStats);
      if (onUsageUpdated) onUsageUpdated(updatedStats);

      const execRes = await onRunScript(data.pythonCode, data.title);
      setLastResult(execRes);
      setTerminalLogs([
        `>>> [${data.modelUsed || activeModel} • Thinking ${data.thinkingLevelUsed || activeThinking}] ${data.title}`,
        ...(data.fallbackNotice ? [`>>> [Auto-Respaldo]: ${data.fallbackNotice}`] : []),
        `>>> ${data.summary}`,
        ...(data.thoughtEvolution || []).map((step, idx) => `>>> [Pensamiento ${idx + 1}] ${step}`),
        ...execRes.logs,
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTerminalLogs((prev) => [...prev, `Error Gemini API: ${msg}`]);
    } finally {
      setIsGeneratingGemini(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute(false);
    }
  };

  const handleCopyCode = async () => {
    await safeCopyToClipboard(scriptCode);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80">
      <div className="relative w-full max-w-5xl h-[92vh] bg-[#0f141c] border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-200">
        {/* Cabecera del Editor Estilo Blender */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-900/95 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
                <span>Consola Python de Blender (bpy)</span>
                <span className="px-2 py-0.5 rounded bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[10px] font-mono">
                  + Asistente Guiado Gemini 3D
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Usa las opciones de estructura, simetría, paleta o sube una imagen de referencia para guiar a Gemini al dibujar con Python
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  activeTab === 'editor'
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Editor Python + Gemini
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('docs')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  activeTab === 'docs'
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Referencia API bpy
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeTab === 'editor' ? (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Barra lateral de Plantillas dividida en "Empezar desde 0", "Generar Objetos" y "Modificar Malla" */}
            <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/60 p-3 flex flex-col overflow-y-auto">
              <div className="mb-3 pb-3 border-b border-slate-800/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-400 mb-1">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Empezar Desde Cero (0)</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleClearEditorFromZero(true)}
                  className="w-full text-left p-2 rounded-lg text-xs bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-500/40 transition-colors cursor-pointer flex items-center gap-2 font-semibold"
                  title="Borra todo el código del editor y vacía la escena 3D actual para empezar de cero"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                  <span>Borrar Todo (Editor + 3D)</span>
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleClearEditorFromZero(false)}
                    className="text-left px-2 py-1.5 rounded-lg text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-colors cursor-pointer flex items-center gap-1"
                    title="Vacía únicamente el texto del editor Python sin borrar la escena 3D"
                  >
                    <X className="w-3 h-3 shrink-0 text-slate-400" />
                    <span className="truncate">Vaciar Editor</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertStarterTemplate}
                    className="text-left px-2 py-1.5 rounded-lg text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer flex items-center gap-1"
                    title="Limpia la escena e inserta el esqueleto mínimo import bpy + delete()"
                  >
                    <FilePlus2 className="w-3 h-3 shrink-0 text-emerald-400" />
                    <span className="truncate">Base Desde 0</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generar Nuevos Objetos 3D</span>
              </div>
              <div className="space-y-1.5 mb-4">
                {generatePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left p-2 rounded-lg text-xs transition-colors cursor-pointer flex flex-col gap-0.5 ${
                      selectedPresetId === preset.id
                        ? 'bg-amber-400/15 border border-amber-400/50 text-amber-300'
                        : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-200 border border-slate-800/60'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span className="truncate">{preset.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 line-clamp-2">
                      {preset.description}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 mb-2 pt-2 border-t border-slate-800/80">
                <Wrench className="w-3.5 h-3.5" />
                <span>Deformar Objeto Actual</span>
              </div>
              <div className="space-y-1.5 flex-1">
                {modifyPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left p-2 rounded-lg text-xs transition-colors cursor-pointer flex flex-col gap-0.5 ${
                      selectedPresetId === preset.id
                        ? 'bg-sky-400/15 border border-sky-400/50 text-sky-300'
                        : 'bg-slate-900/50 hover:bg-slate-800/80 text-slate-300 border border-transparent'
                    }`}
                  >
                    <div className="font-medium flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                      <span className="truncate">{preset.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 line-clamp-1">
                      {preset.description}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Atajo: Ctrl + Enter</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  {copiedSuccess ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Zona Principal: Complemento Gemini AI + Opciones de Ayuda + Editor de Código + Consola */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* PANEL DE ASISTENCIA DE DIBUJO 3D PARA GEMINI */}
              <div className="p-3 bg-slate-900/95 border-b border-slate-800 space-y-2.5 max-h-[55vh] overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <Wand2 className="w-4 h-4 text-amber-400" />
                    <span>Asistente Gemini 3D → Python (`bpy`)</span>
                    <button
                      type="button"
                      onClick={() => setShowHelpersPanel((prev) => !prev)}
                      className={`ml-1 px-2 py-0.5 rounded text-[11px] font-medium border flex items-center gap-1 transition-colors cursor-pointer ${
                        showHelpersPanel
                          ? 'bg-amber-400/15 border-amber-400/50 text-amber-300'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      <span>{showHelpersPanel ? 'Ocultar Guías 3D' : 'Mostrar Guías 3D'}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Selector de Modelo Gemini (Incluye Google Argon) */}
                    <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-[11px]">
                      <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-slate-400 hidden sm:inline">Modelo:</span>
                      <select
                        value={activeModel}
                        onChange={(e) => handleModelSelect(e.target.value)}
                        className="bg-transparent text-amber-300 font-semibold outline-none cursor-pointer text-xs"
                      >
                        {GEMINI_MODEL_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id} className="bg-slate-900 text-slate-100">
                            {opt.label} • {opt.badge}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Selector de Nivel de Pensamiento: LOW / MEDIUM / HIGH */}
                    <div
                      className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]"
                      title="Nivel de razonamiento (Thinking Level): Low, Medium o High"
                    >
                      <Brain className="w-3.5 h-3.5 text-sky-400 ml-1.5 mr-0.5 shrink-0" />
                      {THINKING_LEVEL_OPTIONS.map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => handleThinkingSelect(lvl.id)}
                          title={lvl.description}
                          className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                            activeThinking === lvl.id
                              ? 'bg-sky-400 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {lvl.shortLabel}
                        </button>
                      ))}
                    </div>

                    {/* Selector de Modo: Nuevo Objeto / + Añadir al Actual / Refinar Código */}
                    <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setGeminiMode('replace')}
                        className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                          geminiMode === 'replace'
                            ? 'bg-amber-400 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Nuevo Objeto
                      </button>
                      <button
                        type="button"
                        onClick={() => setGeminiMode('append')}
                        className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                          geminiMode === 'append'
                            ? 'bg-amber-400 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        + Añadir al Actual
                      </button>
                      <button
                        type="button"
                        onClick={() => setGeminiMode('refine')}
                        className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                          geminiMode === 'refine'
                            ? 'bg-amber-400 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Refinar Script Actual
                      </button>
                    </div>
                  </div>
                </div>

                {/* BARRA DE USO SEMANAL DE GEMINI Y ENLACE OFICIAL A CUOTA RESTANTE */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800/90 text-[11px]">
                  <div className="flex flex-wrap items-center gap-3 text-slate-300">
                    <span className="flex items-center gap-1.5 font-semibold text-white">
                      <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                      Uso Semanal en Estudio:
                    </span>
                    <span className="font-mono text-amber-300">
                      {weeklyStats.totalGenerations} generaciones
                    </span>
                    {weeklyStats.argonGenerations > 0 && (
                      <span className="font-mono text-sky-300">
                        ({weeklyStats.argonGenerations} con Argon 4)
                      </span>
                    )}
                    <span className="text-slate-500">·</span>
                    <span className="font-mono text-slate-400">
                      {(weeklyStats.totalTokens / 1000).toFixed(1)}k tokens ({(weeklyStats.thoughtTokens / 1000).toFixed(1)}k thinking)
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <a
                      href={GEMINI_QUOTA_LINKS.aiStudioPlan}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-amber-300 hover:text-amber-200 underline underline-offset-2 font-semibold"
                      title="Consulta tu plan y límite de uso en Google AI Studio"
                    >
                      <span>Ver cuánto queda de tu uso en AI Studio</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-slate-700">|</span>
                    <a
                      href={GEMINI_QUOTA_LINKS.geminiAccountUsage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sky-300 hover:text-sky-200 underline underline-offset-2 font-medium"
                      title="Revisa tu historial y actividad semanal de Gemini en tu cuenta de Google"
                    >
                      <span>Mi Uso Semanal Google Gemini</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* CONTROLES DE AYUDA PARA GUIAR A GEMINI AL DIBUJAR */}
                {showHelpersPanel && (
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/90 space-y-2.5 text-[11px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      {/* 1. Arquetipo Estructural */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          1. Estructura / Arquetipo
                        </label>
                        <select
                          value={helpers.archetype}
                          onChange={(e) =>
                            setHelpers((prev) => ({ ...prev, archetype: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 outline-none focus:border-amber-400 text-[11px]"
                        >
                          {ARCHETYPE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 2. Simetría y Patrón Matemático */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          2. Simetría Geométrica
                        </label>
                        <select
                          value={helpers.symmetry}
                          onChange={(e) =>
                            setHelpers((prev) => ({ ...prev, symmetry: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 outline-none focus:border-amber-400 text-[11px]"
                        >
                          {SYMMETRY_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 3. Nivel de Complejidad / Piezas */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          3. Densidad de Piezas
                        </label>
                        <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded border border-slate-700">
                          {(
                            [
                              { id: 'standard', label: 'Media' },
                              { id: 'high', label: 'Alta' },
                              { id: 'ultra', label: 'Ultra+' },
                            ] as const
                          ).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() =>
                                setHelpers((prev) => ({ ...prev, complexity: c.id }))
                              }
                              className={`py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                                helpers.complexity === c.id
                                  ? 'bg-amber-400 text-slate-950 font-semibold'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 4. Paleta de Color Cel-Shading */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          4. Paleta de Color
                        </label>
                        <select
                          value={helpers.palette}
                          onChange={(e) =>
                            setHelpers((prev) => ({ ...prev, palette: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 outline-none focus:border-amber-400 text-[11px]"
                        >
                          {PALETTE_OPTIONS.map((pal) => (
                            <option key={pal.id} value={pal.id}>
                              {pal.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Fila 2 de Ayudas: Referencia Visual (Boceto + Captura del Visor 3D + Auto-Suavizado) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Subir Boceto / Imagen de Referencia para Gemini */}
                        <input
                          ref={refImgInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleReferenceImageUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => refImgInputRef.current?.click()}
                          className={`px-2.5 py-1 rounded border flex items-center gap-1.5 transition-colors cursor-pointer ${
                            referenceImageBase64
                              ? 'bg-amber-400/15 border-amber-400 text-amber-300 font-semibold'
                              : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                          title="Sube un dibujo o imagen para que Gemini copie su forma y colores en 3D"
                        >
                          <ImagePlus className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            {referenceImageName
                              ? `Boceto: ${referenceImageName.slice(0, 16)}`
                              : 'Subir Imagen / Boceto Guía'}
                          </span>
                        </button>
                        {referenceImageBase64 && (
                          <button
                            type="button"
                            onClick={() => {
                              setReferenceImageBase64(null);
                              setReferenceImageName(null);
                            }}
                            className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-red-400 text-[10px] cursor-pointer"
                          >
                            Quitar
                          </button>
                        )}

                        {/* Enviar Captura de la Escena 3D Actual + Coordenadas BoundingBox */}
                        <button
                          type="button"
                          onClick={() =>
                            setHelpers((prev) => ({
                              ...prev,
                              sendViewportSnapshot: !prev.sendViewportSnapshot,
                            }))
                          }
                          className={`px-2.5 py-1 rounded border flex items-center gap-1.5 transition-colors cursor-pointer ${
                            helpers.sendViewportSnapshot
                              ? 'bg-sky-500/15 border-sky-400/50 text-sky-300 font-medium'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                          }`}
                          title="Envía una foto del visor 3D actual y las medidas de la malla para que Gemini dibuje a escala"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>
                            Visión Escena 3D: {helpers.sendViewportSnapshot ? 'Activa' : 'Off'}
                          </span>
                        </button>

                        {/* Auto-Redondear Aristas */}
                        <button
                          type="button"
                          onClick={() =>
                            setHelpers((prev) => ({ ...prev, autoSmooth: !prev.autoSmooth }))
                          }
                          className={`px-2.5 py-1 rounded border flex items-center gap-1 transition-colors cursor-pointer ${
                            helpers.autoSmooth
                              ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300 font-medium'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Auto-Smooth: {helpers.autoSmooth ? 'Sí' : 'No'}</span>
                        </button>
                      </div>

                      {/* Textura automática opcional (38 Texturas PBR + Bump disponibles) */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-[10px]">Textura:</span>
                        <select
                          value={helpers.autoTexture}
                          onChange={(e) =>
                            setHelpers((prev) => ({ ...prev, autoTexture: e.target.value }))
                          }
                          className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 text-[10px] outline-none max-w-[190px]"
                        >
                          {TEXTURE_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name} ({preset.category})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Fila 3: Kit de Herramientas IA (23 Opciones de los 7 Puntos) + Todos los Tags de Entrenamiento */}
                    <div className="pt-2 border-t border-slate-800/80 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Wrench className="w-3 h-3 text-amber-400" />
                          <span>
                            Tags de Entrenamiento IA Activos ({helpers.aiTools.length}/{AI_TOOLKIT_OPTIONS.length} opciones de los 7 Puntos):
                          </span>
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setHelpers((prev) => ({
                                ...prev,
                                aiTools:
                                  prev.aiTools.length === AI_TOOLKIT_OPTIONS.length
                                    ? ['auto_ground']
                                    : AI_TOOLKIT_OPTIONS.map((t) => t.id),
                              }))
                            }
                            className="px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-200 text-[10px] font-semibold cursor-pointer"
                            title="Activa los 23 módulos de los 7 Puntos de la API para entrenar a Gemini al máximo"
                          >
                            {helpers.aiTools.length === AI_TOOLKIT_OPTIONS.length
                              ? 'Restablecer Selección'
                              : '✨ Activar Todos los 23 Módulos IA'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowTrainingTagsCloud((prev) => !prev)}
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer transition-colors ${
                              showTrainingTagsCloud
                                ? 'bg-purple-500/25 border-purple-400 text-purple-200'
                                : 'bg-slate-900 border-slate-700 text-purple-300 hover:border-purple-400/50'
                            }`}
                            title="Muestra los 65+ #Tags rápidos de texturas, modificadores, nodos, motores y animación para insertar en el prompt"
                          >
                            🏷️ {showTrainingTagsCloud ? 'Ocultar #Tags (65+)' : 'Ver Todos los #Tags (65+)'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setHelpers((prev) => ({
                                ...prev,
                                autoCritique: !prev.autoCritique,
                              }))
                            }
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold cursor-pointer transition-colors ${
                              helpers.autoCritique
                                ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                            title="La IA audita las proporciones del visor 3D y reemplaza partes básicas por geometría articulada"
                          >
                            Auditoría Visual IA: {helpers.autoCritique ? 'ON' : 'OFF'}
                          </button>
                          <button
                            type="button"
                            disabled={isRunning}
                            onClick={() =>
                              handleExecute(
                                false,
                                `import bpy\nbpy.ops.mesh.mirror_x()\nbpy.ops.mesh.auto_ground()\nprint("Simetría Espejo X y Auto-Apoyo en pedestal aplicados.")`,
                                'Simetría X + Apoyar'
                              )
                            }
                            className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold cursor-pointer"
                            title="Ejecuta al instante mirror_x() y auto_ground() sobre el objeto actual en escena"
                          >
                            ⚡ Aplicar Mirror X + Apoyar Ahora
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pr-1">
                        {AI_TOOLKIT_OPTIONS.map((tool) => {
                          const isSelected = helpers.aiTools.includes(tool.id);
                          return (
                            <button
                              key={tool.id}
                              type="button"
                              title={tool.description}
                              onClick={() =>
                                setHelpers((prev) => ({
                                  ...prev,
                                  aiTools: isSelected
                                    ? prev.aiTools.filter((id) => id !== tool.id)
                                    : [...prev.aiTools, tool.id],
                                }))
                              }
                              className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-400/20 border-amber-400/60 text-amber-200 font-semibold'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {tool.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Nube Desplegable con los 65+ #Tags de Entrenamiento clasificados por los 7 Puntos */}
                      {showTrainingTagsCloud && (
                        <div className="p-2.5 rounded-lg bg-slate-950/95 border border-purple-500/40 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-semibold text-purple-300">
                              🏷️ Diccionario Completo de #Tags para Entrenar a Gemini (Haz clic en cualquier tag para añadirlo a tu petición):
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const allTagsStr = GEMINI_TRAINING_TAGS.map((t) => t.tag).join(' ');
                                setGeminiPrompt((prev) => `${prev.trim()} ${allTagsStr}`.trim());
                              }}
                              className="px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-purple-200 font-semibold cursor-pointer"
                            >
                              + Insertar Todos los #Tags
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
                            {GEMINI_TRAINING_TAGS.map((item) => {
                              const active = geminiPrompt.includes(item.tag);
                              return (
                                <button
                                  key={item.tag}
                                  type="button"
                                  onClick={() => handleTogglePromptTag(item)}
                                  title={`${item.point}: ${item.codeHint}`}
                                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] border transition-colors cursor-pointer ${
                                    active
                                      ? 'bg-purple-500/30 border-purple-400 text-purple-100 font-semibold'
                                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-purple-400/50 hover:text-purple-200'
                                  }`}
                                >
                                  <span className="text-amber-400 mr-1">{item.point}</span>
                                  {item.tag}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Input de Prompt + Botón Generar con Gemini + Copiar Prompt para Gemini Pro Web */}
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={geminiPrompt}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.trim().length > 0 && geminiMode === 'replace') {
                        onClearScene?.(true);
                      }
                      setGeminiPrompt(val);
                    }}
                    onPaste={handlePromptInputPaste}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleGenerateWithGemini();
                      }
                    }}
                    placeholder="Escribe cualquier elemento de juego (o pega aquí directamente tu código Python de Blender 5.2 con Ctrl+V)..."
                    className="flex-1 min-w-[220px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700/80 focus:border-amber-400 outline-none text-xs text-white placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={handleCopyPromptForGeminiWeb}
                    title="Copia el Prompt Maestro de Entrenamiento con las 38 texturas PBR, modificadores, motores Cycles/EEVEE y operadores bpy para pegarlo en Gemini Web"
                    className="px-3 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/50 text-sky-200 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {copiedWebPrompt
                        ? '¡Prompt Maestro Copiado!'
                        : '🎓 Entrenar a Gemini (Copiar Prompt Maestro)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingGemini || !geminiPrompt.trim()}
                    onClick={() => handleGenerateWithGemini()}
                    className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isGeneratingGemini ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Razonando ({activeThinking})...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Dibujar con Gemini</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Botones de Refinamiento Iterativo en 1 Clic */}
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  <span className="text-slate-400">Ayudar a mejorar el dibujo actual:</span>
                  {REFINEMENT_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      disabled={isGeneratingGemini}
                      onClick={() => {
                        setGeminiPrompt(chip.prompt);
                        setGeminiMode('refine');
                        handleGenerateWithGemini(chip.prompt, 'refine');
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-amber-300 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* PANEL DE EVOLUCIÓN DEL PENSAMIENTO (EN PROCESO Y COMPLETADO) */}
                {(isGeneratingGemini || thoughtSteps.length > 0) && (
                  <div className="p-2.5 rounded-lg bg-slate-950/95 border border-sky-500/35 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold text-sky-300">
                        <Brain className={`w-3.5 h-3.5 text-sky-400 ${isGeneratingGemini ? 'animate-pulse' : ''}`} />
                        <span>
                          {isGeneratingGemini
                            ? `Evolución del Pensamiento en Proceso (${activeModel} • Nivel ${activeThinking})`
                            : `Evolución del Pensamiento Completada (${activeModel} • Nivel ${activeThinking})`}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">
                        {isGeneratingGemini
                          ? `${elapsedSeconds}s transcurridos`
                          : lastTokenUsage
                          ? `${lastTokenUsage.thoughtsTokens} tokens de pensamiento • ${lastTokenUsage.totalTokens} totales`
                          : 'Razonamiento finalizado'}
                      </span>
                    </div>

                    {isGeneratingGemini ? (
                      <div className="space-y-1.5">
                        {(LIVE_THOUGHT_PHASES[activeThinking] || LIVE_THOUGHT_PHASES.MEDIUM).map(
                          (phaseText, idx) => {
                            const isDone = idx < livePhaseIndex;
                            const isCurrent = idx === livePhaseIndex;
                            return (
                              <div
                                key={idx}
                                className={`flex items-center gap-2 px-2 py-1 rounded ${
                                  isCurrent
                                    ? 'bg-sky-500/15 border border-sky-400/40 text-sky-200 font-medium'
                                    : isDone
                                    ? 'text-emerald-300/80'
                                    : 'text-slate-500'
                                }`}
                              >
                                {isDone ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : isCurrent ? (
                                  <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                                ) : (
                                  <span className="w-3.5 h-3.5 rounded-full border border-slate-700 inline-block shrink-0" />
                                )}
                                <span>{phaseText}</span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {thoughtSteps.map((step, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-1.5 p-1.5 rounded bg-slate-900/90 border border-slate-800 text-slate-300"
                          >
                            <span className="font-mono text-sky-400 font-bold shrink-0">
                              #{idx + 1}
                            </span>
                            <span className="leading-snug">{step}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {geminiSummary && (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center justify-between gap-2">
                    <span className="truncate">{geminiSummary}</span>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-2.5 py-0.5 rounded bg-emerald-400 text-slate-950 font-semibold shrink-0 cursor-pointer hover:bg-emerald-300"
                    >
                      Ver Resultado en 3D →
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 relative flex flex-col bg-[#0b0e14]">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-900/70 border-b border-slate-800/60 text-xs text-slate-400">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-slate-300 font-semibold">blender_5_2_script.py</span>
                    <div
                      className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-amber-500/30 text-[11px]"
                      title="Cambia rápidamente la representación de los ejes (Z-Up de Blender 5.2 vs Y-Up de Estudio WebGL) y re-ejecuta el script"
                    >
                      <span className="text-slate-400 px-1.5 font-semibold">📐 Ejes:</span>
                      <button
                        type="button"
                        onClick={() => handleCoordinateModeSelect('blender_z_up', true)}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                          coordinateMode === 'blender_z_up'
                            ? 'bg-amber-400 text-slate-950'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                        title="Forzar Eje Z Arriba (Estándar Blender 5.2: X=Ancho, Y=Profundidad, Z=Altura)"
                      >
                        Z-Up (Blender)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCoordinateModeSelect('studio_y_up', true)}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                          coordinateMode === 'studio_y_up'
                            ? 'bg-sky-400 text-slate-950'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                        title="Forzar Eje Y Arriba (Estándar Estudio WebGL: X=Ancho, Y=Altura, Z=Profundidad)"
                      >
                        Y-Up (Estudio)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCoordinateModeSelect('auto', true)}
                        className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                          coordinateMode === 'auto'
                            ? 'bg-emerald-400 text-slate-950'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                        title="Detección inteligente automática Z-Up / Y-Up"
                      >
                        Auto
                      </button>
                    </div>
                    {onSwapSceneAxesYZ && (
                      <button
                        type="button"
                        onClick={() => {
                          onSwapSceneAxesYZ();
                          setTerminalLogs((prev) => [
                            ...prev,
                            '>>> 🔄 [Ejes 3D] Coordenadas Y ↔ Z intercambiadas en vivo y modelo asentado sobre el pedestal.',
                          ]);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 text-[11px] font-semibold transition-colors cursor-pointer"
                        title="Intercambia al instante los ejes Y y Z de todos los puntos del modelo 3D actual"
                      >
                        🔄 Invertir Y↔Z en 3D
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await safeCopyToClipboard(scriptCode);
                        setCopiedSuccess(true);
                        setTimeout(() => setCopiedSuccess(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition-colors cursor-pointer"
                      title="Copia todo el código Python del editor al portapapeles"
                    >
                      <Copy className="w-3.5 h-3.5 text-amber-400" />
                      <span>{copiedSuccess ? '¡Código Copiado!' : 'Copiar Código'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRunning || isGeneratingGemini}
                      onClick={handlePasteAndRunWebScript}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-400/40 font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      title="Pega y ejecuta directamente un código Python creado en Gemini Web / Blender 5.2 (0 llamadas API)"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Pegar y Ejecutar Código Web</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRunning || isGeneratingGemini}
                      onClick={() => handleClearEditorFromZero(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      title="Borra todo el código del editor y limpia la escena 3D para empezar desde 0"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Borrar Todo (Desde 0)</span>
                    </button>
                    <button
                      type="button"
                      disabled={isRunning || isGeneratingGemini}
                      onClick={() => handleClearEditorFromZero(false)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition-colors cursor-pointer disabled:opacity-50"
                      title="Dejar el editor completamente en blanco sin tocar el visor 3D"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Vaciar Editor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const currentPreset = BLENDER_SCRIPT_PRESETS.find(
                          (p) => p.id === selectedPresetId
                        );
                        if (currentPreset) {
                          setScriptCode(currentPreset.code);
                          setLastResult(null);
                        }
                      }}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-white cursor-pointer"
                      title="Restaurar el código de la plantilla seleccionada"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restaurar
                    </button>
                    <button
                      type="button"
                      disabled={isRunning || isGeneratingGemini}
                      onClick={() => handleExecute(false)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/30 font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      {isRunning ? 'Ejecutando...' : 'Ejecutar en Consola'}
                    </button>
                    <button
                      type="button"
                      disabled={isRunning || isGeneratingGemini}
                      onClick={() => handleExecute(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {isRunning ? 'Generando...' : 'Ejecutar y Ver en 3D'}
                    </button>
                  </div>
                </div>

                {pasteHintMessage && (
                  <div className="px-4 py-2 bg-sky-500/20 border-b border-sky-400/50 text-sky-200 text-xs flex items-center justify-between gap-2">
                    <span>{pasteHintMessage}</span>
                    <button
                      type="button"
                      onClick={() => setPasteHintMessage(null)}
                      className="text-sky-300 hover:text-white font-semibold cursor-pointer"
                    >
                      Entendido
                    </button>
                  </div>
                )}

                <div className="flex-1 relative overflow-hidden flex font-mono text-xs text-slate-200">
                  {/* Columna numerada de líneas sincronizada con el editor */}
                  <div
                    ref={lineNumbersRef}
                    className="w-12 py-3 px-2 bg-slate-950/90 border-r border-slate-800/80 text-right select-none overflow-hidden text-[11px] leading-[19.5px] text-slate-500"
                  >
                    {scriptCode.split('\n').map((_, idx) => {
                      const lineNum = idx + 1;
                      const isErrorLine =
                        Boolean(lastResult && !lastResult.success) &&
                        lastResult?.errorLine === lineNum;
                      return (
                        <div
                          key={lineNum}
                          onClick={() => scrollToEditorLine(lineNum)}
                          title={`Ir a la línea ${lineNum}`}
                          className={`cursor-pointer pr-1 rounded transition-colors ${
                            isErrorLine
                              ? 'bg-red-500/30 text-red-300 font-bold'
                              : 'hover:text-slate-300'
                          }`}
                        >
                          {lineNum}
                        </div>
                      );
                    })}
                  </div>

                  <textarea
                    ref={codeTextareaRef}
                    value={scriptCode}
                    onChange={(e) => {
                      setScriptCode(e.target.value);
                      if (pasteHintMessage) setPasteHintMessage(null);
                    }}
                    onScroll={(e) => {
                      if (lineNumbersRef.current) {
                        lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
                      }
                    }}
                    onPaste={handleCodeEditorPaste}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    className="flex-1 h-full py-3 px-4 bg-transparent resize-none outline-none font-mono text-xs leading-[19.5px] text-amber-100/95 selection:bg-amber-400/30 overflow-auto whitespace-pre"
                    placeholder="# Pega aquí con Ctrl + V cualquier código Python de Blender 5.2 (se limpiará y ejecutará automáticamente)..."
                  />
                </div>
              </div>

              {/* Terminal de Salida Python con Diagnóstico Exacto de Línea y Copiar/Pegar */}
              <div
                onPaste={handleConsolePaste}
                tabIndex={0}
                className="h-52 border-t border-slate-800 bg-[#080b10] flex flex-col outline-none"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-slate-900/80 border-b border-slate-800/80 text-[11px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-semibold text-slate-200">
                      Consola de Salida Python (stdout) — Seleccionable (Ctrl+C / Ctrl+V)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {lastResult && (
                      <div className="flex items-center gap-2 mr-1">
                        {lastResult.success ? (
                          <>
                            <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                              <CheckCircle2 className="w-3 h-3" /> Ejecutado ({lastResult.executionTimeMs} ms)
                            </span>
                            <button
                              type="button"
                              onClick={onClose}
                              className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 font-semibold cursor-pointer"
                            >
                              Ver Objeto en 3D →
                            </button>
                          </>
                        ) : (
                          <span className="text-red-400 flex items-center gap-1 text-[11px] font-semibold">
                            <AlertCircle className="w-3.5 h-3.5" />
                            {lastResult.errorLine
                              ? `Fallo en Línea ${lastResult.errorLine}`
                              : 'Error de ejecución'}
                          </span>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleCopyConsoleOutput}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                      title="Copiar toda la salida de la consola y errores al portapapeles"
                    >
                      <Copy className="w-3 h-3 text-amber-400" />
                      <span>{copiedConsoleSuccess ? '¡Consola Copiada!' : 'Copiar Consola'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePasteAndRunWebScript}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-400/30 transition-colors cursor-pointer"
                      title="Pegar código Python desde el portapapeles y ejecutarlo"
                    >
                      <FileCode className="w-3 h-3" />
                      <span>Pegar Código</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTerminalLogs([])}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                      title="Limpiar mensajes de la consola"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Limpiar Consola</span>
                    </button>
                  </div>
                </div>

                {/* Tarjeta interactiva de diagnóstico si ocurre un error en una línea concreta */}
                {lastResult && !lastResult.success && (
                  <div className="px-4 py-2 bg-red-950/60 border-b border-red-500/40 text-[11px] flex flex-col gap-1 select-text">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-red-500/30 border border-red-400/50 text-red-200 font-bold font-mono">
                          {lastResult.errorLine ? `LÍNEA ${lastResult.errorLine}` : 'ERROR PYTHON'}
                        </span>
                        {lastResult.errorSourceCode && (
                          <code className="px-2 py-0.5 rounded bg-slate-950/90 border border-red-500/30 text-amber-200 font-mono truncate max-w-xl">
                            {lastResult.errorSourceCode}
                          </code>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {lastResult.errorLine && (
                          <button
                            type="button"
                            onClick={() => scrollToEditorLine(lastResult.errorLine!)}
                            className="px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-200 font-semibold cursor-pointer"
                          >
                            Ir a la Línea {lastResult.errorLine} ↑
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleCopyErrorDiagnostic}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-red-200 font-semibold cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedErrorSuccess ? '¡Error Copiado!' : 'Copiar Error'}</span>
                        </button>
                      </div>
                    </div>
                    {lastResult.errorReason && (
                      <div className="text-red-200/95 leading-snug">
                        <span className="font-semibold text-red-300">Por qué falla: </span>
                        {lastResult.errorReason}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1 select-text cursor-text">
                  {terminalLogs.map((log, i) => (
                    <div
                      key={i}
                      className={`whitespace-pre-wrap break-words ${
                        log.startsWith('===') ||
                        log.startsWith('❌') ||
                        log.startsWith('Error') ||
                        log.startsWith('Excepción')
                          ? 'text-red-400 font-semibold'
                          : log.startsWith('📍') || log.startsWith('👉') || log.startsWith('     ^')
                          ? 'text-amber-300 font-semibold'
                          : log.startsWith('💡') || log.startsWith('🔍')
                          ? 'text-sky-300'
                          : log.startsWith('>>>')
                          ? 'text-amber-400'
                          : log.startsWith('+') || log.includes('completado') || log.includes('exito')
                          ? 'text-emerald-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Pestaña de Documentación Completa / README de Funciones Admitidas (Blender 5.2 API) */
          <div className="flex-1 p-6 overflow-y-auto space-y-5 text-xs text-slate-300 bg-[#0b0e14]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  README &amp; Entrenamiento Gemini — Todas las Opciones del Programa (Blender 5.2 Python API)
                </h3>
                <p className="text-slate-400">
                  Referencia completa de las 38 texturas PBR 3D con Bump, motores Cycles/EEVEE/Cel, modificadores, bmesh, cámara, triángulos e iluminación para entrenar a Gemini.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyPromptForGeminiWeb}
                  className="px-3 py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>
                    {copiedWebPrompt
                      ? '¡Prompt Maestro Copiado al Portapapeles!'
                      : '🎓 Copiar Prompt Maestro para Entrenar a Gemini'}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                <span className="font-mono text-amber-300 font-semibold">
                  1. Primitivas, Geometría Orgánica y Macros (`bpy.ops.mesh.*`)
                </span>
                <p className="text-slate-400">
                  Soportan argumentos posicionales y keyword (`size`, `radius`, `depth`, `location`, `rotation`, `scale`, `vertices`, `subdivisions`, `color`):
                </p>
                <code className="block p-2.5 rounded bg-slate-950 font-mono text-[11px] text-slate-200 leading-relaxed">
                  • Clásicas: primitive_cube_add, primitive_uv_sphere_add, primitive_ico_sphere_add, primitive_cylinder_add, primitive_cone_add, primitive_torus_add, primitive_torus_knot_add, primitive_plane_add, primitive_grid_add, primitive_monkey_add
                  <br />
                  • Orgánicas/Chasis: primitive_capsule_add(radius, length), primitive_octahedron_add, primitive_dodecahedron_add, primitive_horn_add(base_radius, tip_radius, length, bend), primitive_blade_add(length, width, thickness, curve), primitive_armor_plate_add(width, height, thickness, curvature)
                  <br />
                  • Macros 1-Línea: primitive_arch_add, primitive_wheel_pair_add, primitive_tree_foliage_add, primitive_prop_chest_add, primitive_limb_pair_add, primitive_wing_pair_add
                </code>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                <span className="font-mono text-amber-300 font-semibold">
                  2. Mallas `from_pydata` y Topología Densa `bmesh.ops.create_grid`
                </span>
                <p className="text-slate-400">
                  Construye mallas matemáticas (olas, terrenos, bóvedas) con `bmesh` o `from_pydata` y vincula con `objects.link(obj)`:
                </p>
                <code className="block p-2.5 rounded bg-slate-950 font-mono text-[11px] text-slate-200 leading-relaxed">
                  mesh = bpy.data.meshes.new(&quot;Malla&quot;)
                  <br />
                  obj = bpy.data.objects.new(&quot;Objeto&quot;, mesh)
                  <br />
                  bpy.context.collection.objects.link(obj)
                  <br />
                  bm = bmesh.new()
                  <br />
                  bmesh.ops.create_grid(bm, x_segments=50, y_segments=50, size=5.0)
                  <br />
                  for v in bm.verts: v.co.z = 0.25 * math.sin(v.co.x * 2.0)
                  <br />
                  for f in bm.faces: f.smooth = True
                  <br />
                  bm.to_mesh(mesh); bm.free()
                </code>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2 md:col-span-2">
                <span className="font-mono text-amber-300 font-semibold">
                  3. Biblioteca Completa de 38 Texturas PBR 3D + Relieve Bump (Por Objeto o Global)
                </span>
                <p className="text-slate-400">
                  Puedes asignar texturas individuales a cada material (`mat.texture = &apos;...&apos;`, `mat.texture_repeat = 2`, `mat.bump_strength = 1.2`) o por operador (`bpy.ops.material.set_texture(name=&apos;...&apos;, object=obj, repeat=2, bump=1.2)`):
                </p>
                <code className="block p-2.5 rounded bg-slate-950 font-mono text-[11px] text-slate-200 leading-relaxed">
                  • <span className="text-amber-300">Arquitectura y Piedra (11):</span> &apos;stone_ashlar&apos; (sillería caliza), &apos;travertine_roman&apos; (travertino romano), &apos;marble_carrara&apos; (mármol blanco), &apos;marble_nero&apos; (mármol negro y oro), &apos;cobblestone&apos; (adoquín de piedra), &apos;brick_mudejar&apos; (ladrillo mudéjar), &apos;terracotta_roof&apos; (teja árabe), &apos;slate_roof&apos; (pizarra negra), &apos;andalusi_tiles&apos; (azulejo geométrico), &apos;stained_glass&apos; (vidriera gótica), &apos;concrete_brutalist&apos; (hormigón)
                  <br />
                  • <span className="text-emerald-300">Maderas y Naturaleza (10):</span> &apos;wood_oak&apos; (roble veteado), &apos;wood_mahogany&apos; (caoba imperial), &apos;tree_bark&apos; (corteza de árbol), &apos;water_caustics&apos; (agua cristalina), &apos;ocean_deep&apos; (océano profundo), &apos;desert_sand&apos; (arena de dunas), &apos;moss_nature&apos; (musgo orgánico), &apos;grass_meadow&apos; (pradera de hierba), &apos;ice_crystal&apos; (hielo glaciar), &apos;fresh_snow&apos; (nieve virgen)
                  <br />
                  • <span className="text-sky-300">Metales, Tejidos y Cuero (8):</span> &apos;brushed_metal&apos; (acero cepillado), &apos;damascus_steel&apos; (acero de Damasco), &apos;gold_damascene&apos; (oro damasquinado), &apos;copper_patina&apos; (bronce con pátina), &apos;carbon_weave&apos; (fibra de carbono), &apos;leather_tufted&apos; (cuero capitoné), &apos;royal_velvet&apos; (terciopelo real), &apos;woven_linen&apos; (lino tejido)
                  <br />
                  • <span className="text-purple-300">Fantasía, Sci-Fi y Anime (8):</span> &apos;dragon_scales&apos;, &apos;biomech_plates&apos;, &apos;magma_cracks&apos;, &apos;solar_plasma&apos;, &apos;hologram_grid&apos;, &apos;halftone_manga&apos;, &apos;cyber_circuits&apos;, &apos;smooth_skin&apos;
                </code>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                <span className="font-mono text-amber-300 font-semibold">
                  4. Materiales PBR `Principled BSDF` y Nodos Cel-Shade (Blender 5.2)
                </span>
                <p className="text-slate-400">
                  Soporte completo de barniz Clearcoat, Anisotropía, Transmisión de cristal, Bump procedural y `ShaderToRGB` + `ColorRamp`:
                </p>
                <code className="block p-2.5 rounded bg-slate-950 font-mono text-[11px] text-slate-200 leading-relaxed">
                  bsdf = mat.node_tree.nodes[&quot;Principled BSDF&quot;]
                  <br />
                  bsdf.inputs[&quot;Base Color&quot;].default_value = (0.8, 0.2, 0.1, 1.0)
                  <br />
                  bsdf.inputs[&quot;Metallic&quot;].default_value = 0.85
                  <br />
                  bsdf.inputs[&quot;Roughness&quot;].default_value = 0.18
                  <br />
                  bsdf.inputs[&quot;Coat Weight&quot;].default_value = 1.0
                  <br />
                  bsdf.inputs[&quot;Coat Roughness&quot;].default_value = 0.04
                  <br />
                  bsdf.inputs[&quot;Transmission Weight&quot;].default_value = 0.85
                  <br />
                  bsdf.inputs[&quot;IOR&quot;].default_value = 1.52
                  <br />
                  bsdf.inputs[&quot;Texture&quot;].default_value = &quot;marble_carrara&quot;
                </code>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                <span className="font-mono text-amber-300 font-semibold">
                  5. Motores de Render (`CYCLES` / `EEVEE` / `CEL`), Luz y Cámara
                </span>
                <p className="text-slate-400">
                  Controla todas las opciones visuales del programa directamente desde Python:
                </p>
                <code className="block p-2.5 rounded bg-slate-950 font-mono text-[11px] text-slate-200 leading-relaxed">
                  bpy.context.scene.render.engine = &apos;CYCLES&apos; # &apos;EEVEE&apos;, &apos;CEL&apos;, &apos;MATCAP&apos;
                  <br />
                  bpy.context.scene.cycles.samples = 128
                  <br />
                  bpy.context.scene.cycles.clearcoat = 0.70
                  <br />
                  bpy.context.scene.cycles.gi_bounce = 1.45
                  <br />
                  bpy.context.scene.eevee.bloom_intensity = 0.45
                  <br />
                  bpy.ops.render.set_lighting(intensity=3.4, angle=42, headlight=True)
                  <br />
                  bpy.ops.render.set_outline(thickness=0.015, opacity=0.9)
                  <br />
                  bpy.ops.view3d.camera_preset(view=&apos;hero&apos;, zoom=120)
                </code>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                <span className="font-mono text-amber-300 font-semibold">
                  6. Modificadores (`BEVEL`, `SUBSURF`, `SOLIDIFY`, `ARRAY`, `MIRROR`) y Triángulos
                </span>
                <p className="text-slate-400">
                  Modificadores no destructivos, subdivisión de triángulos y pintura por caras:
                </p>
                <code className="block p-2.5 rounded bg-slate-950 font-mono text-[11px] text-slate-200 leading-relaxed">
                  • obj.modifiers.new(name=&quot;Bisel&quot;, type=&apos;BEVEL&apos;) # width=0.02, segments=2
                  <br />
                  • obj.modifiers.new(name=&quot;Subsurf&quot;, type=&apos;SUBSURF&apos;) # levels=2
                  <br />
                  • obj.modifiers.new(name=&quot;Solidify&quot;, type=&apos;SOLIDIFY&apos;) # thickness, use_flip_normals
                  <br />
                  • obj.modifiers.new(name=&quot;Array&quot;, type=&apos;ARRAY&apos;) # count, relative_offset_displace
                  <br />
                  • obj.modifiers.new(name=&quot;Mirror&quot;, type=&apos;MIRROR&apos;) # use_axis
                  <br />
                  • bpy.ops.mesh.subdivide_triangles(segments=2, object=obj)
                  <br />
                  • bpy.ops.mesh.paint_triangles(color=(0.2, 0.7, 1.0), object=obj)
                </code>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                <span className="font-mono text-amber-300 font-semibold">
                  7. Animación en Vivo (`bpy.anim.*`) y Sintaxis Python
                </span>
                <p className="text-slate-400">
                  Animaciones de vértices y objetos a 60 FPS en el visor WebGL:
                </p>
                <code className="block p-2.5 rounded bg-slate-950 font-mono text-[11px] text-slate-200 leading-relaxed">
                  • bpy.anim.water(obj, speed=2.2, amplitude=0.12, frequency=2.5)
                  <br />
                  • bpy.anim.loop(obj, type=&apos;TURNTABLE&apos;, speed=1.0) # &apos;HOVER&apos;, &apos;PULSE&apos;, &apos;PENDULUM&apos;
                  <br />
                  • Módulos: bpy, bmesh, mathutils (Vector, Euler, Matrix), math, random, numpy as np
                  <br />
                  • Comprensiones de listas/dicts, f-strings, desempaquetado y slicing completo
                </code>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-purple-300 font-semibold">
                    🏷️ Diccionario Completo de #Tags de Entrenamiento Gemini (7 Puntos de la API — Clic para añadir al Prompt)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPromptForGeminiWeb}
                    className="px-2.5 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-purple-200 text-[11px] font-semibold cursor-pointer"
                  >
                    Copiar los 7 Puntos + Todos los #Tags
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {GEMINI_TRAINING_TAGS.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => {
                        handleTogglePromptTag(item);
                        setActiveTab('editor');
                      }}
                      title={`Clic para insertar en el prompt -> ${item.codeHint}`}
                      className="px-2 py-1 rounded bg-slate-950 hover:bg-purple-500/20 border border-slate-800 hover:border-purple-400/50 font-mono text-[10px] text-slate-200 transition-colors cursor-pointer"
                    >
                      <span className="text-amber-400 font-bold mr-1">{item.point}</span>
                      <span className="text-purple-300">{item.tag}</span>
                      <span className="text-slate-500 ml-1.5">{item.codeHint.slice(0, 38)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
