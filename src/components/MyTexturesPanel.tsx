import { useEffect, useRef, useState } from 'react';
import { Copy, ImagePlus, Trash2, Check, Layers, BookOpen, Grid, Sparkles } from 'lucide-react';
import {
  ColorMapTextureInfo,
  SubTileSpec,
  addUserTexture,
  listAllColorMapTextures,
  removeUserTexture,
} from '../utils/textureLibrary';

interface MyTexturesPanelProps {
  /** Id de la textura aplicada ahora al modelo, o null */
  activeId: string | null;
  tileMeters: number;
  onTileMetersChange: (meters: number) => void;
  /** Aplica (info) o quita (null) la textura como mapa de color del modelo actual */
  onApply: (info: ColorMapTextureInfo | null) => void;
}

export default function MyTexturesPanel({
  activeId,
  tileMeters,
  onTileMetersChange,
  onApply,
}: MyTexturesPanelProps) {
  const [textures, setTextures] = useState<ColorMapTextureInfo[]>([]);
  const [selectedSubTiles, setSelectedSubTiles] = useState<Record<string, string>>({});
  const [showApiHelp, setShowApiHelp] = useState<boolean>(false);
  const [filterKind, setFilterKind] = useState<'all' | 'mosaic' | 'atlas'>('all');
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const list = await listAllColorMapTextures();
    setTextures(list);
    setSelectedSubTiles((prev) => {
      const next = { ...prev };
      for (const t of list) {
        if (t.subTiles && t.subTiles.length > 0 && !next[t.id]) {
          next[t.id] = t.subTiles[0].id;
        }
      }
      return next;
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const flash = (type: 'ok' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let added = 0;
    for (const file of Array.from(files)) {
      try {
        await addUserTexture(file);
        added++;
      } catch (err) {
        flash('error', err instanceof Error ? err.message : String(err));
      }
    }
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (added > 0) {
      flash('ok', added === 1 ? 'Textura guardada' : `${added} texturas guardadas`);
      await refresh();
    }
  };

  const handleDelete = async (info: ColorMapTextureInfo) => {
    if (info.source !== 'user') return;
    try {
      await removeUserTexture(info.id);
      if (activeId === info.id) onApply(null);
      await refresh();
    } catch (err) {
      flash('error', err instanceof Error ? err.message : String(err));
    }
  };

  const resolveEffectiveInfo = (info: ColorMapTextureInfo): {
    effectiveInfo: ColorMapTextureInfo;
    activeSub?: SubTileSpec;
  } => {
    if (info.subTiles && info.subTiles.length > 0) {
      const chosenId = selectedSubTiles[info.id] || info.subTiles[0].id;
      if (chosenId !== '__FULL__') {
        const sub = info.subTiles.find((s) => s.id === chosenId) || info.subTiles[0];
        return {
          effectiveInfo: {
            ...info,
            id: sub.id,
            name: `${info.name.replace(/^Catálogo:\s*/i, '')} — ${sub.name}`,
          },
          activeSub: sub,
        };
      }
    }
    return { effectiveInfo: info };
  };

  const handleCopy = async (info: ColorMapTextureInfo) => {
    const { effectiveInfo, activeSub } = resolveEffectiveInfo(info);
    const snippet = activeSub
      ? `bpy.ops.material.set_mosaic_texture(object=obj, texture="${info.id}", tile="${activeSub.code}", repeat=2, projection="BOX")`
      : info.kind === 'mosaic'
      ? `bpy.ops.material.set_mosaic_texture(object=obj, texture="${effectiveInfo.id}", repeat=1, projection="FLAT")`
      : `mat.color_map = "${effectiveInfo.id}"`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedId(info.id);
      setTimeout(() => setCopiedId(null), 1600);
      flash('ok', `Código API copiado: ${effectiveInfo.id}`);
    } catch {
      flash('error', 'No se pudo copiar al portapapeles');
    }
  };

  const filteredTextures = textures.filter((t) => {
    if (filterKind === 'mosaic') return t.kind === 'mosaic' || t.isMosaic;
    if (filterKind === 'atlas') return t.kind === 'atlas';
    return true;
  });

  const totalSubTiles = textures.reduce((acc, t) => acc + (t.subTiles?.length ?? 0), 0);
  const totalIndividualTextures =
    textures.filter((t) => !t.subTiles || t.subTiles.length === 0).length + totalSubTiles;

  return (
    <div className="p-3 rounded-lg bg-slate-900/85 border border-slate-800/90 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-cyan-300 flex items-center gap-1.5 text-xs">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>Catálogo de Mosaicos y Atlas 5×2</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowApiHelp((v) => !v)}
            className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
              showApiHelp
                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                : 'bg-slate-950 border-slate-700 text-amber-300 hover:border-amber-400/50'
            }`}
            title="Ver cómo usar los Mosaicos, Catálogos Atlas 5x2 y Poly Haven CC0 desde la API de Python y HTTP"
          >
            <BookOpen className="w-3 h-3" />
            <span>{showApiHelp ? 'Ocultar API' : 'Ver API Python'}</span>
          </button>
          <span className="text-[10px] font-mono text-slate-400">
            {textures.length} láminas ({totalIndividualTextures} tex)
          </span>
        </div>
      </div>

      {/* Filtros rápidos: Todos / Mosaicos / Atlas 5x2 */}
      <div className="flex items-center gap-1 text-[10px]">
        {(
          [
            { id: 'all', label: `Todas (${textures.length} láminas / ${totalIndividualTextures} tex)` },
            { id: 'mosaic', label: '🏛️ Mosaicos y Murales' },
            { id: 'atlas', label: '🗂️ Atlas 5×2 (10 Sub-Tiles)' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterKind(tab.id)}
            className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
              filterKind === tab.id
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showApiHelp && (
        <div className="p-2.5 rounded-lg bg-slate-950 border border-amber-500/40 space-y-2 text-[10px] text-slate-300">
          <div className="font-semibold text-amber-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>API Python y REST: Mosaicos, Atlas 5×2 y Poly Haven CC0 (871+ PBR):</span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            Incluye <strong>Mosaicos Completos</strong> (Romano Circular, Gótico 5×3, Mural Nazarí 6×3), <strong>7 Catálogos Atlas 5×2</strong> con 70 sub-texturas de 512×512 px (incluyendo <code className="text-cyan-300">catalogo_progresion_agua_arena</code> con <code className="text-cyan-300">agua_profundidad_t01..t10</code>) y acceso en vivo a las <strong>871+ texturas PBR CC0 de Poly Haven</strong> (Diffuse + Normal + Roughness + Metalness):
          </p>
          <pre className="p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-amber-100 overflow-x-auto leading-relaxed">{`# 1. Aplicar un MOSAICO COMPLETO (Romano, Gótico 5x3 o Nazarí 6x3):
bpy.ops.material.set_mosaic_texture(
    object=obj,
    texture="mosaico_romano_imperial", # o "mosaico_gotico_carmesi", "mosaico_muro_nazari"
    repeat=1,
    projection="FLAT" # "FLAT" (0..1), "BOX" o "CYLINDER"
)

# 2. Pintar una ZONA o PIEZAS con una sub-textura de Atlas 5x2 (T-01..T-10):
bpy.ops.material.paint_zone(
    zone="Suelo", # o objects=["Mar", "Playa"] o zone="ALL"
    texture="catalogo_progresion_agua_arena",
    tile="T-04", # Agua Turquesa Media (3m) — o "agua_profundidad_t04"
    repeat=2,
    projection="FLAT"
)

# 3. Aplicar cualquier textura PBR CC0 en directo de POLY HAVEN (871+):
bpy.ops.material.set_polyhaven_texture(
    zone="Muro",               # o objects=["Fachada", "Torre"]
    asset="brick_wall_001",    # ID de Poly Haven (carga Diffuse + Normal + Roughness)
    resolution="1k",           # "1k" o "2k"
    projection="BOX",
    repeat=2
)
# También funciona con prefijo en paint_zone, mat.color_map y bpy.data.images.load:
mat.color_map = "polyhaven:cobblestone_floor_08@1k"
img = bpy.data.images.load("polyhaven:wood_planks_dirt@2k")

# 4. Proyectar solo 1 celda (col, row) de un Mosaico en cuadrícula (ej. 5x3 o 6x3):
bpy.ops.uv.project_mosaic(object=obj, cols=6, rows=3, col=2, row=2)

# 5. Endpoints REST del servidor (JSON / Proxy CORS):
# GET /api/textures/docs                         -> Especificación completa de la API
# GET /api/polyhaven/textures?q=ladrillo&limit=36 -> Buscar entre las 871+ texturas CC0
# GET /api/polyhaven/files/brick_wall_001?res=1k -> Mapas Diffuse/Normal/Roughness/Metalness`}</pre>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-1.5 px-3 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          <span>{busy ? 'Guardando…' : 'Subir textura propia'}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 whitespace-nowrap">
          <span>m/rep.</span>
          <input
            type="number"
            min={0.5}
            max={50}
            step={0.5}
            value={tileMeters}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) onTileMetersChange(Math.min(50, Math.max(0.5, v)));
            }}
            className="w-14 py-1 px-1.5 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono text-[11px]"
            title="Metros que ocupa una repetición de la imagen"
          />
        </label>
      </div>

      {message && (
        <div
          className={`text-[11px] px-2 py-1 rounded border ${
            message.type === 'ok'
              ? 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30'
              : 'text-rose-300 bg-rose-500/10 border-rose-400/30'
          }`}
        >
          {message.text}
        </div>
      )}

      <ul className="space-y-2 max-h-96 overflow-y-auto pr-0.5">
        {filteredTextures.map((info) => {
          const { effectiveInfo, activeSub } = resolveEffectiveInfo(info);
          const isActive = activeId === effectiveInfo.id || activeId === info.id;

          return (
            <li
              key={info.id}
              className={`p-2 rounded-lg border space-y-1.5 transition-colors ${
                isActive
                  ? 'border-cyan-400/70 bg-cyan-500/10'
                  : 'border-slate-800 bg-slate-950/75 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <img
                  src={info.url}
                  alt={info.name}
                  className="w-14 h-14 rounded object-cover border border-slate-700 flex-shrink-0 bg-slate-900"
                />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {info.kind === 'mosaic' && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[9px] font-bold uppercase">
                        🏛️ Mosaico
                      </span>
                    )}
                    {info.kind === 'atlas' && (
                      <span className="px-1.5 py-0.2 rounded bg-purple-500/20 border border-purple-400/40 text-purple-300 text-[9px] font-bold uppercase flex items-center gap-0.5">
                        <Grid className="w-2.5 h-2.5" />
                        Atlas 5×2 (10 Tiles)
                      </span>
                    )}
                    <span className="text-[11px] text-slate-100 font-semibold truncate" title={info.name}>
                      {info.name}
                    </span>
                  </div>

                  <div className="text-[10px] font-mono text-cyan-300/90 truncate">
                    ID API: <code>&quot;{effectiveInfo.id}&quot;</code>
                    {info.gridLayout ? ` • ${info.gridLayout}` : ''}
                  </div>

                  {info.description && (
                    <p className="text-[10px] text-slate-400 leading-snug line-clamp-2" title={info.description}>
                      {info.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onApply(isActive ? null : effectiveInfo)}
                    className={`py-1 px-2.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 hover:bg-cyan-500/35'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-cyan-400/50 hover:text-cyan-300'
                    }`}
                  >
                    {isActive ? 'Quitar' : 'Aplicar 3D'}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopy(info)}
                      title={`Copiar código API Python para "${effectiveInfo.id}"`}
                      className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900 text-[10px] text-slate-300 hover:text-cyan-300 hover:border-cyan-400/50 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === info.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>API</span>
                        </>
                      )}
                    </button>
                    {info.source === 'user' && (
                      <button
                        type="button"
                        onClick={() => handleDelete(info)}
                        title="Borrar esta textura"
                        className="p-1 rounded border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-400/50 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Selector de sub-textura T-01..T-10 para los 6 Catálogos Atlas 5x2 */}
              {info.subTiles && info.subTiles.length > 0 && (
                <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-slate-400 whitespace-nowrap">
                    Recortar sub-textura:
                  </span>
                  <select
                    value={selectedSubTiles[info.id] || info.subTiles[0].id}
                    onChange={(e) => {
                      const nextSubId = e.target.value;
                      setSelectedSubTiles((prev) => ({ ...prev, [info.id]: nextSubId }));
                      if (isActive) {
                        const sub = info.subTiles?.find((s) => s.id === nextSubId);
                        if (sub) {
                          onApply({
                            ...info,
                            id: sub.id,
                            name: `${info.name} — ${sub.name}`,
                          });
                        } else if (nextSubId === '__FULL__') {
                          onApply(info);
                        }
                      }
                    }}
                    className="flex-1 py-1 px-2 rounded bg-slate-900 border border-slate-700 text-amber-200 font-mono text-[10px] outline-none focus:border-cyan-400"
                  >
                    {info.subTiles.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} {sub.isMosaic ? '🏛️ (Mosaico)' : ''} → id: &quot;{sub.id}&quot;
                      </option>
                    ))}
                    <option value="__FULL__">
                      🖼️ Lámina Completa Sin Recortar (Atlas 5×2 entero) → id: &quot;{info.id}&quot;
                    </option>
                  </select>
                  {activeSub?.isMosaic && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-semibold whitespace-nowrap">
                      Sub-Mosaico
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
