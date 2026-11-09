import { useEffect, useRef, useState } from 'react';
import { Copy, ImagePlus, Trash2, Check, Layers } from 'lucide-react';
import {
  ColorMapTextureInfo,
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
  const [busy, setBusy] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setTextures(await listAllColorMapTextures());
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

  const handleCopy = async (info: ColorMapTextureInfo) => {
    const snippet = `mat.color_map = "${info.id}"`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedId(info.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      flash('error', 'No se pudo copiar al portapapeles');
    }
  };

  return (
    <div className="p-3 rounded-lg bg-slate-900/75 border border-slate-800/90 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>Mis texturas</span>
        </span>
        <span className="text-[10px] font-mono text-slate-400">{textures.length} disponibles</span>
      </div>

      <p className="text-[11px] text-slate-400 leading-snug">
        Imágenes usadas como mapa de color. Se aplican al modelo actual y también desde Python con{' '}
        <code className="text-cyan-300">mat.color_map = "id"</code>.
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-1.5 px-3 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          <span>{busy ? 'Guardando…' : 'Subir imágenes'}</span>
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

      <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
        {textures.map((info) => {
          const isActive = activeId === info.id;
          return (
            <li
              key={info.id}
              className={`flex items-center gap-2 p-1.5 rounded-md border ${
                isActive ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/60'
              }`}
            >
              <img
                src={info.url}
                alt=""
                className="w-10 h-10 rounded object-cover border border-slate-700 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-slate-100 font-medium truncate" title={info.name}>
                  {info.name}
                </div>
                <div className="text-[10px] text-slate-500 truncate" title={info.license}>
                  {info.license}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onApply(isActive ? null : info)}
                  className={`py-1 px-2 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/30'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-cyan-400/50 hover:text-cyan-300'
                  }`}
                >
                  {isActive ? 'Quitar' : 'Aplicar'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(info)}
                  title={`Copiar mat.color_map = "${info.id}"`}
                  className="p-1 rounded border border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-400/50 cursor-pointer"
                >
                  {copiedId === info.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {info.source === 'user' && (
                  <button
                    type="button"
                    onClick={() => handleDelete(info)}
                    title="Borrar esta textura"
                    className="p-1 rounded border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-400/50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
