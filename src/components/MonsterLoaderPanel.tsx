import { useEffect, useMemo, useRef, useState } from 'react';
import { Skull, Loader2, FolderDown, X } from 'lucide-react';
import type { GlbSource } from './GlbZonesPanel';
import { MONSTER_TIERS, MonsterInfo, MonsterTier, generateMonsterGlb, getEnemigoVersion, listMonsters } from '../enemigos/enemyGenerator';
import { SURFACE_LABELS, monsterSurface, recommendMonsterPlans } from '../enemigos/monsterTextures';
import { BatchProgress, canPickFolder, exportMonstersBatch, folderSink, zipSink } from '../enemigos/batchExport';

// Peso medio por monstruo ya texturizado (medium y low medidos con los 282; el resto, con lobos y dragón)
const AVG_MB: Record<MonsterTier, number> = { completo: 6.3, high: 3.9, medium: 2.0, low: 1.2, minimum: 0.75 };

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

interface MonsterLoaderPanelProps {
  /** Entrega el GLB generado: se muestra en el visor y pasa al panel "Optimizar GLB por zonas" */
  onLoad: (source: GlbSource) => void;
}

const STORAGE_KEY = 'salon3d.monstruo.v1';

function readSaved(): { key?: string; tier?: MonsterTier; textures?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export default function MonsterLoaderPanel({ onLoad }: MonsterLoaderPanelProps) {
  const saved = useMemo(readSaved, []);
  const [open, setOpen] = useState(false);
  const [monsters, setMonsters] = useState<MonsterInfo[]>([]);
  const [version, setVersion] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [key, setKey] = useState(saved.key || 'elder_dragon');
  const [tier, setTier] = useState<MonsterTier>(saved.tier || 'medium');
  const [withTextures, setWithTextures] = useState(saved.textures ?? true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchTiers, setBatchTiers] = useState<MonsterTier[]>(['low']);
  const [batchScope, setBatchScope] = useState<'all' | 'filtered'>('all');
  const [batchBusy, setBatchBusy] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // El código de los monstruos solo se descarga al abrir el panel
  useEffect(() => {
    if (!open || monsters.length) return;
    listMonsters().then(setMonsters).catch((e) => setError(String(e)));
    getEnemigoVersion().then((v) => setVersion(`${v.commit.slice(0, 7)} · ${v.date.slice(0, 10)}`)).catch(() => {});
  }, [open, monsters.length]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ key, tier, textures: withTextures })); } catch { /* sin almacenamiento */ }
  }, [key, tier, withTextures]);

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const out = new Map<string, MonsterInfo[]>();
    for (const m of monsters) {
      if (f && !`${m.name} ${m.title} ${m.key}`.toLowerCase().includes(f)) continue;
      const list = out.get(m.categoryLabel) || [];
      list.push(m);
      out.set(m.categoryLabel, list);
    }
    return out;
  }, [monsters, filter]);

  const selected = monsters.find((m) => m.key === key);
  const filtered = useMemo(() => [...groups.values()].flat(), [groups]);
  // Si la búsqueda deja fuera al monstruo elegido, se elige el primero de la lista visible
  useEffect(() => {
    if (filtered.length && !filtered.some((m) => m.key === key)) setKey(filtered[0].key);
  }, [filtered, key]);
  const batchList = batchScope === 'all' ? monsters : filtered;
  const batchCount = batchList.length * batchTiers.length;
  const batchMb = batchList.length * batchTiers.reduce((s, t) => s + AVG_MB[t], 0);
  const toFolder = canPickFolder();

  const toggleTier = (t: MonsterTier) =>
    setBatchTiers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : MONSTER_TIERS.map((x) => x.id).filter((x) => x === t || prev.includes(x))));

  const runBatch = async (mode: 'folder' | 'zip') => {
    if (!batchCount) return;
    setBatchMsg(null); setBatchError(null);
    let sink;
    if (mode === 'folder') {
      const t0 = performance.now();
      try {
        sink = await folderSink();
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        const quick = performance.now() - t0 < 800; // nadie cierra la ventana tan rápido: no llegó a abrirse
        if (name === 'AbortError' && !quick) {
          setBatchMsg('No se eligió ninguna carpeta; no se ha descargado nada.');
        } else {
          setBatchError(
            `Chrome no ha abierto la ventana para elegir carpeta${e instanceof Error ? ` (${e.name}: ${e.message})` : ''}. ` +
              'Usa "Descargar en ZIP": hace lo mismo y los archivos van a tu carpeta de descargas.'
          );
        }
        return;
      }
    } else {
      sink = zipSink();
    }
    cancelRef.current = false;
    setBatchBusy(true);
    try {
      const { entries, cancelled } = await exportMonstersBatch(batchList, batchTiers, sink, setProgress, () => cancelRef.current);
      const ok = entries.filter((e) => !e.error);
      const failed = entries.length - ok.length;
      const mb = ok.reduce((s, e) => s + e.mb, 0);
      setBatchMsg(
        `${cancelled ? 'Cancelado. ' : ''}${ok.length} monstruos guardados (${mb.toFixed(0)} MB)` +
          (failed ? `, ${failed} con error (ver indice.csv)` : '') +
          (mode === 'folder' ? ' en la carpeta monstruos_salon3d.' : ' en archivos ZIP (carpeta de descargas), uno por calidad y categoría.')
      );
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchBusy(false);
      setProgress(null);
    }
  };

  const load = async () => {
    if (!selected) return;
    setBusy(true); setError(null); setStatus('Generando el monstruo…');
    try {
      const g = await generateMonsterGlb(selected.key, tier);
      const file = new File([g.bytes as unknown as BlobPart], g.filename, { type: 'model/gltf-binary' });
      const surface = SURFACE_LABELS[monsterSurface(g.info)];
      setStatus(`${g.info.name} · ${tier} · ${g.triangles.toLocaleString()} triángulos · ${(g.bytes.byteLength / 1e6).toFixed(2)} MB · ${surface}`);
      onLoad(
        withTextures
          ? { name: g.filename, file, recommend: (zones) => recommendMonsterPlans(g.info, tier, zones), autoRun: true }
          : { name: g.filename, file }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-lg bg-slate-900/75 border border-slate-800/90 space-y-2.5" data-testid="panel-monstruos">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between cursor-pointer">
        <span className="font-semibold text-rose-300 flex items-center gap-1.5">
          <Skull className="w-3.5 h-3.5 text-rose-400" />
          <span>Monstruos de Enemigo-rpg</span>
        </span>
        <span className="text-[10px] text-slate-400">{open ? 'ocultar' : monsters.length ? `${monsters.length}` : 'abrir'}</span>
      </button>
      {open && (
        <>
          <p className="text-[11px] text-slate-400 leading-snug">
            Genera cualquier monstruo del repositorio Enemigo-rpg en la calidad que elijas y le pone las texturas recomendadas de salon-3d
            (pelaje, plumas, quitina, hueso…) conservando huesos y animaciones.
          </p>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={monsters.length ? `Buscar entre ${monsters.length} monstruos…` : 'Cargando lista…'}
            className="w-full py-1 px-2 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-100"
            aria-label="Buscar monstruo"
          />
          <select
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full py-1 px-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-100"
            aria-label="Monstruo"
          >
            {!selected && <option value={key}>{monsters.length ? 'Elige un monstruo' : 'Cargando…'}</option>}
            {[...groups.entries()].map(([label, list]) => (
              <optgroup key={label} label={label}>
                {list.map((m) => (
                  <option key={m.key} value={m.key}>{m.name} — {m.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as MonsterTier)}
              className="flex-1 py-1 px-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-100"
              aria-label="Calidad"
            >
              {MONSTER_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300" title="Pelaje, plumas, quitina, hueso, roca o corteza según el monstruo">
              <input type="checkbox" checked={withTextures} onChange={(e) => setWithTextures(e.target.checked)} />
              <span>Texturas salon-3d</span>
            </label>
          </div>
          {selected && (
            <div className="text-[10px] text-slate-500">
              {selected.rpgTier} · {selected.element} · superficie: {SURFACE_LABELS[monsterSurface(selected)]}
            </div>
          )}
          <button
            type="button"
            onClick={load}
            disabled={busy || !selected}
            className="w-full py-2 px-2 rounded-lg bg-rose-400 hover:bg-rose-300 text-slate-950 font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Skull className="w-3.5 h-3.5" />}
            <span>{busy ? 'Generando…' : 'Cargar monstruo'}</span>
          </button>
          {status && <div className="text-[11px] text-slate-300" data-testid="monstruo-estado">{status}</div>}
          {error && <div className="text-[11px] px-2 py-1 rounded border text-rose-300 bg-rose-500/10 border-rose-400/30">{error}</div>}

          <div className="pt-2 mt-1 border-t border-slate-800 space-y-2" data-testid="lote-monstruos">
            <div className="font-semibold text-rose-200 text-[12px] flex items-center gap-1.5">
              <FolderDown className="w-3.5 h-3.5" /><span>Descargar en lote con texturas sugeridas</span>
            </div>
            <div className="flex flex-wrap gap-x-2.5 gap-y-1">
              {MONSTER_TIERS.map((t) => (
                <label key={t.id} className="flex items-center gap-1 text-[11px] text-slate-300">
                  <input type="checkbox" checked={batchTiers.includes(t.id)} onChange={() => toggleTier(t.id)} disabled={batchBusy} />
                  <span>{t.id === 'completo' ? 'Completo' : t.id[0].toUpperCase() + t.id.slice(1)}</span>
                </label>
              ))}
            </div>
            <select
              value={batchScope}
              onChange={(e) => setBatchScope(e.target.value as 'all' | 'filtered')}
              disabled={batchBusy}
              className="w-full py-1 px-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-100"
              aria-label="Qué monstruos"
            >
              <option value="all">Todos los monstruos ({monsters.length})</option>
              <option value="filtered">Solo los de la búsqueda ({filtered.length})</option>
            </select>
            <div className="text-[10px] text-slate-500">
              {batchCount} archivos · unos {batchMb >= 1000 ? `${(batchMb / 1000).toFixed(1)} GB` : `${Math.round(batchMb)} MB`} ·
              {toFolder
                ? ' con "Elegir carpeta" se guardan en la carpeta que elijas; con ZIP, en tu carpeta de descargas'
                : ' aquí no se puede elegir carpeta: se descargan ZIP (por calidad y categoría) en tu carpeta de descargas'}
            </div>
            {!batchBusy ? (
              <div className="space-y-1.5">
                {toFolder && (
                  <button
                    type="button"
                    onClick={() => void runBatch('folder')}
                    disabled={!batchCount || !monsters.length}
                    className="w-full py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-rose-400/40 text-rose-200 font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <FolderDown className="w-3.5 h-3.5" />
                    <span>Elegir carpeta y descargar</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void runBatch('zip')}
                  disabled={!batchCount || !monsters.length}
                  className={`w-full rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${toFolder ? 'py-1.5 px-2 text-[11px] text-slate-300 hover:text-rose-200 bg-transparent border border-slate-700' : 'py-2 px-2 bg-slate-800 hover:bg-slate-700 border border-rose-400/40 text-rose-200'}`}
                >
                  <FolderDown className="w-3.5 h-3.5" />
                  <span>Descargar en ZIP</span>
                </button>
              </div>
            ) : (
              <div className="space-y-1.5" data-testid="lote-progreso">
                <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
                  <div className="h-full bg-rose-400 transition-all" style={{ width: `${progress ? (progress.done / Math.max(1, progress.total)) * 100 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
                  <span className="truncate">
                    {progress ? `${progress.done}/${progress.total} · ${progress.current}` : 'Preparando…'}
                    {progress?.etaSeconds ? ` · quedan ~${formatTime(progress.etaSeconds)}` : ''}
                  </span>
                  <button type="button" onClick={() => { cancelRef.current = true; }} className="flex items-center gap-1 text-rose-300 hover:text-rose-200 cursor-pointer">
                    <X className="w-3 h-3" /><span>Cancelar</span>
                  </button>
                </div>
              </div>
            )}
            {batchMsg && <div className="text-[11px] text-emerald-300" data-testid="lote-resultado">{batchMsg}</div>}
            {batchError && (
              <div className="text-[11px] px-2 py-1 rounded border text-rose-300 bg-rose-500/10 border-rose-400/30" data-testid="lote-error">{batchError}</div>
            )}
          </div>
          {version && <div className="text-[10px] text-slate-600">Enemigo-rpg {version}</div>}
        </>
      )}
    </div>
  );
}
