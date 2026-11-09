import React, { useEffect, useState } from 'react';
import {
  analyzeGlbZones,
  optimizeGlb,
  suggestZoneChoice,
  type GlbSummary,
  type GlbZone,
  type OptimizeResult,
  type ZonePlan,
  type ZoneTextureChoice,
} from '../utils/glbZoneOptimizer';
import { TEXTURE_PRESETS, type TexturePatternType } from '../utils/proceduralTextures';
import { Download, Eye, Layers, Sparkles, Wand2 } from 'lucide-react';

export interface GlbZoneInfo {
  name: string;
  meshNames: string[];
  triangles: number;
}

export interface GlbSource {
  name: string;
  file: File;
  recommend?: (zones: GlbZoneInfo[]) => Record<string, string>;
  autoRun?: boolean;
}

interface GlbZonesPanelProps {
  source: GlbSource | null;
  onPreviewBytes?: (bytes: Uint8Array, name: string) => void;
  onDownloadBytes?: (bytes: Uint8Array, filename: string) => void;
}

type TierPresetId = 'completo' | 'high' | 'medium' | 'low' | 'minimum';

const TIER_PRESETS: Record<
  TierPresetId,
  { label: string; badge: string; ratio: number; maxSize: number; jpegQuality: number }
> = {
  completo: { label: 'Completo (100%)', badge: '💎 Completo', ratio: 1.0, maxSize: 0, jpegQuality: 0.95 },
  high: { label: 'High (75%)', badge: '✨ High', ratio: 0.75, maxSize: 2048, jpegQuality: 0.9 },
  medium: { label: 'Medium (50%)', badge: '⚖️ Medium', ratio: 0.5, maxSize: 1024, jpegQuality: 0.85 },
  low: { label: 'Low (25%)', badge: '⚡ Low', ratio: 0.25, maxSize: 512, jpegQuality: 0.78 },
  minimum: { label: 'Minimum (12%)', badge: '🪶 Min', ratio: 0.12, maxSize: 256, jpegQuality: 0.7 },
};

function formatKB(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function GlbZonesPanel({
  source,
  onPreviewBytes,
  onDownloadBytes,
}: GlbZonesPanelProps) {
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [zones, setZones] = useState<GlbZone[]>([]);
  const [summary, setSummary] = useState<GlbSummary | null>(null);
  const [plans, setPlans] = useState<Map<number, ZonePlan>>(new Map());
  const [triangleRatio, setTriangleRatio] = useState<number>(1.0);
  const [jpegQuality, setJpegQuality] = useState<number>(0.88);
  const [compactSkin, setCompactSkin] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<OptimizeResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLastResult(null);
    if (!source) {
      setBuffer(null);
      setZones([]);
      setSummary(null);
      setPlans(new Map());
      return;
    }

    (async () => {
      try {
        const buf = await source.file.arrayBuffer();
        if (cancelled) return;
        const { zones: zList, summary: sum } = analyzeGlbZones(buf);
        setBuffer(buf);
        setZones(zList);
        setSummary(sum);

        const initialPlans = new Map<number, ZonePlan>();
        const rec = source.recommend
          ? source.recommend(
              zList.map((z) => ({
                name: z.name,
                meshNames: [z.name],
                triangles: z.triangles,
              }))
            )
          : {};

        for (const z of zList) {
          const recPattern = rec[z.name] as TexturePatternType | undefined;
          const choice: ZoneTextureChoice =
            recPattern && recPattern !== 'none'
              ? { kind: 'pattern', pattern: recPattern, repeat: 2, natural: false }
              : { kind: 'keep' };
          initialPlans.set(z.index, { choice, maxSize: 0 });
        }
        setPlans(initialPlans);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudo analizar el archivo GLB');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source]);

  const handleAutoSuggestTextures = () => {
    const next = new Map<number, ZonePlan>();
    for (const z of zones) {
      const prev = plans.get(z.index);
      next.set(z.index, {
        choice: suggestZoneChoice(z, true),
        maxSize: prev?.maxSize ?? 0,
      });
    }
    setPlans(next);
  };

  const updateZoneChoice = (zoneIndex: number, patternValue: string) => {
    const next = new Map(plans);
    const prev = next.get(zoneIndex) ?? { choice: { kind: 'keep' as const }, maxSize: 0 };
    let choice: ZoneTextureChoice;
    if (patternValue === '__keep__') {
      choice = { kind: 'keep' };
    } else if (patternValue === '__none__') {
      choice = { kind: 'none' };
    } else {
      choice = {
        kind: 'pattern',
        pattern: patternValue as TexturePatternType,
        repeat: 2,
        natural: false,
      };
    }
    next.set(zoneIndex, { ...prev, choice });
    setPlans(next);
  };

  const runTierExport = async (tier: TierPresetId, mode: 'preview' | 'download') => {
    if (!buffer || !source) return;
    setBusy(true);
    setError(null);
    try {
      const spec = TIER_PRESETS[tier];
      const tierPlans = new Map<number, ZonePlan>();
      for (const z of zones) {
        const current = plans.get(z.index);
        tierPlans.set(z.index, {
          choice: current?.choice ?? { kind: 'keep' },
          maxSize: spec.maxSize,
        });
      }
      const res = await optimizeGlb(buffer, tierPlans, {
        jpegQuality: spec.jpegQuality,
        compactSkin: tier !== 'completo',
        triangleRatio: spec.ratio,
      });
      setLastResult(res);
      const baseName = source.name.replace(/\.(glb|gltf)$/i, '');
      const outName = `${baseName}_${tier}.glb`;
      if (mode === 'preview') {
        onPreviewBytes?.(res.bytes, outName);
      } else {
        onPreviewBytes?.(res.bytes, outName);
        onDownloadBytes?.(res.bytes, outName);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al optimizar el GLB');
    } finally {
      setBusy(false);
    }
  };

  const runCustomOptimize = async (mode: 'preview' | 'download') => {
    if (!buffer || !source) return;
    setBusy(true);
    setError(null);
    try {
      const res = await optimizeGlb(buffer, plans, {
        jpegQuality,
        compactSkin,
        triangleRatio,
      });
      setLastResult(res);
      const baseName = source.name.replace(/\.(glb|gltf)$/i, '');
      const pct = Math.round(triangleRatio * 100);
      const outName = `${baseName}_${pct}pct.glb`;
      if (mode === 'preview') {
        onPreviewBytes?.(res.bytes, outName);
      } else {
        onPreviewBytes?.(res.bytes, outName);
        onDownloadBytes?.(res.bytes, outName);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al procesar el GLB');
    } finally {
      setBusy(false);
    }
  };

  if (!source) {
    return (
      <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
        Selecciona o carga un modelo <strong>.GLB</strong> arriba para inspeccionar sus zonas, aplicar texturas por pieza y descargarlo en <strong>Completo, High, Medium, Low o Minimum</strong>.
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span className="truncate">Zonas y Niveles GLB: {source.name}</span>
        </div>
        {summary && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-300 shrink-0">
            {summary.triangles.toLocaleString()} tris · {formatKB(summary.size.total)}
          </span>
        )}
      </div>

      {error && (
        <div className="p-2 rounded bg-rose-950/80 border border-rose-500/40 text-rose-200 text-[11px]">
          {error}
        </div>
      )}

      {/* Descarga directa de los 5 niveles de detalle del GLB */}
      <div className="p-2.5 rounded-lg bg-slate-950/90 border border-emerald-500/30 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-emerald-300">
            Bajada directa por niveles de detalle (.GLB):
          </span>
          <span className="text-[10px] text-slate-400">Conserva huesos y animaciones</span>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {(['completo', 'high', 'medium', 'low', 'minimum'] as TierPresetId[]).map((tier) => {
            const spec = TIER_PRESETS[tier];
            return (
              <button
                key={tier}
                type="button"
                disabled={busy}
                onClick={() => void runTierExport(tier, 'download')}
                className="py-1.5 px-1 rounded bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-semibold text-[10px] flex flex-col items-center justify-center gap-0.5 transition-all disabled:opacity-40 cursor-pointer"
                title={`Descargar ${spec.label}`}
              >
                <span>{spec.badge}</span>
                <span className="text-[9px] text-slate-400">{Math.round(spec.ratio * 100)}%</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Control gradual de triángulos y compresión */}
      <div className="space-y-2 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-300 font-medium">Detalle de malla (Triángulos):</span>
          <span className="text-amber-300 font-mono font-bold">{Math.round(triangleRatio * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.08}
          max={1}
          step={0.02}
          value={triangleRatio}
          onChange={(e) => setTriangleRatio( parseFloat(e.target.value) )}
          className="w-full accent-amber-400"
        />

        <div className="flex items-center justify-between text-[11px] pt-1">
          <span className="text-slate-300 font-medium">Calidad de texturas JPEG:</span>
          <span className="text-sky-300 font-mono">{Math.round(jpegQuality * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={0.98}
          step={0.02}
          value={jpegQuality}
          onChange={(e) => setJpegQuality(parseFloat(e.target.value))}
          className="w-full accent-sky-400"
        />

        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={compactSkin}
            onChange={(e) => setCompactSkin(e.target.checked)}
          />
          <span>Compactar índices y pesos de huesos (sin pérdida de animación)</span>
        </label>

        <div className="flex gap-1.5 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runCustomOptimize('preview')}
            className="flex-1 py-1.5 px-2 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 font-semibold text-[11px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Previsualizar en 3D</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runCustomOptimize('download')}
            className="flex-1 py-1.5 px-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Guardar .GLB</span>
          </button>
        </div>
      </div>

      {/* Zonas de material del GLB */}
      {zones.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300">
              Materiales / Zonas del modelo ({zones.length}):
            </span>
            <button
              type="button"
              onClick={handleAutoSuggestTextures}
              className="px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 text-purple-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Wand2 className="w-3 h-3" />
              <span>Sugerir texturas</span>
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {zones.map((z) => {
              const plan = plans.get(z.index);
              const choice = plan?.choice ?? { kind: 'keep' };
              const selectVal =
                choice.kind === 'keep'
                  ? '__keep__'
                  : choice.kind === 'none'
                  ? '__none__'
                  : choice.kind === 'pattern'
                  ? choice.pattern
                  : '__keep__';

              return (
                <div
                  key={z.index}
                  className="p-2 rounded bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-slate-200 truncate">{z.name}</div>
                    <div className="text-[9px] text-slate-400">
                      {z.triangles.toLocaleString()} tris
                      {z.baseTextureSize ? ` · ${z.baseTextureSize[0]}×${z.baseTextureSize[1]}px` : ''}
                      {z.skinned ? ' · Rig' : ''}
                    </div>
                  </div>
                  <select
                    value={selectVal}
                    onChange={(e) => updateZoneChoice(z.index, e.target.value)}
                    className="py-1 px-1.5 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-200 max-w-[140px]"
                  >
                    <option value="__keep__">Mantener original</option>
                    <option value="__none__">Sin textura (Color liso)</option>
                    {TEXTURE_PRESETS.filter((p) => p.id !== 'none').map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {lastResult && (
        <div className="p-2 rounded bg-emerald-950/40 border border-emerald-500/30 text-[10px] text-emerald-200 space-y-0.5">
          <div className="font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>
              Resultado: {formatKB(lastResult.before.size.total)} → {formatKB(lastResult.after.size.total)} (
              {lastResult.before.triangles.toLocaleString()} → {lastResult.after.triangles.toLocaleString()} tris)
            </span>
          </div>
          {lastResult.notes.map((n, idx) => (
            <div key={idx} className="text-slate-300">
              • {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
