import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CheckSquare,
  Copy,
  Check,
  Eye,
  Layers,
  MousePointerClick,
  Paintbrush,
  RefreshCw,
  Sparkles,
  Square,
  Code2,
  Filter,
  Globe,
  Loader2,
  Search,
} from 'lucide-react';
import {
  ColorMapTextureInfo,
  PolyHavenTextureEntry,
  SubTileSpec,
  TEXTURE_PRESETS,
  applyCatalogTextureToMeshes,
  applyPolyHavenTextureToMeshes,
  listAllColorMapTextures,
  searchPolyHavenTextures,
} from '../utils/textureLibrary';

const POLYHAVEN_CATEGORIES: { id: string; label: string }[] = [
  { id: 'all', label: 'Populares' },
  { id: 'brick', label: 'Ladrillo' },
  { id: 'wood', label: 'Madera' },
  { id: 'stone', label: 'Piedra' },
  { id: 'metal', label: 'Metal' },
  { id: 'plaster', label: 'Yeso/Cal' },
  { id: 'roofing', label: 'Tejados' },
  { id: 'floor', label: 'Suelos' },
  { id: 'fabric', label: 'Tela/Cuero' },
  { id: 'terrain', label: 'Terreno' },
];

export interface ScenePieceInfo {
  uuid: string;
  name: string;
  zone: string;
  verts: number;
  tris: number;
  appliedTextureId?: string;
  appliedTextureName?: string;
  mesh: THREE.Mesh;
}

interface BpyPartTexturePainterPanelProps {
  /** Referencia al grupo raíz del modelo 3D activo en escena */
  modelGroupRef: React.RefObject<THREE.Group | null>;
  /** Contador que sube cada vez que cambia la escena Python o GLB */
  sceneRevision: number;
  /** Modo de clic 3D en el visor: desactivado, seleccionar pieza o pintar pieza al clic */
  pickMode: 'off' | 'select' | 'paint';
  onPickModeChange: (mode: 'off' | 'select' | 'paint') => void;
  /** Lista de UUIDs de piezas actualmente marcadas/seleccionadas */
  selectedPieceUuids: string[];
  onSelectedPieceUuidsChange: React.Dispatch<React.SetStateAction<string[]>>;
  /** Callback cuando el componente aplica o configura la textura activa para pintar con clic */
  onActivePaintConfigChange?: (config: {
    textureId: string;
    parentAtlasId?: string;
    tileCode?: string;
    projection: 'FLAT' | 'BOX' | 'CYLINDER';
    repeat: number;
  }) => void;
  /** Callback para añadir el comando Python generado al final de editor.py */
  onAppendPythonCode?: (pythonSnippet: string, summaryMessage: string) => void;
}

/** Clasifica semánticamente cada pieza 3D en una Zona según su nombre y proporciones */
function classifyPieceZone(mesh: THREE.Mesh): string {
  const n = (mesh.name || '').toLowerCase();
  if (
    /suelo|piso|plaza|base|pedestal|pavimento|losas|terreno|pradera|hierba|cesped|arena|alfombra|plataforma|escalon|grada/.test(
      n
    )
  ) {
    return 'Suelos y Bases';
  }
  if (/agua|rio|mar|lago|fuente|estanque|foso|canal| cascada|poza|alberca/.test(n)) {
    return 'Agua y Fosos';
  }
  if (/muro|pared|fachada|muralla|tabique|fronton|zocalo|lienzo|torre|cuerpo|nave/.test(n)) {
    return 'Muros y Paredes';
  }
  if (/columna|pilar|fuste|capitel|arco|arbotante|contrafuerte|pilastra/.test(n)) {
    return 'Columnas y Arcos';
  }
  if (/tejado|techo|cubierta|cupula|boveda|chapitel|alero|teja|cimborrio/.test(n)) {
    return 'Tejados y Cubiertas';
  }
  return 'Piezas y Detalles';
}

export default function BpyPartTexturePainterPanel({
  modelGroupRef,
  sceneRevision,
  pickMode,
  onPickModeChange,
  selectedPieceUuids,
  onSelectedPieceUuidsChange,
  onActivePaintConfigChange,
  onAppendPythonCode,
}: BpyPartTexturePainterPanelProps) {
  const [pieces, setPieces] = useState<ScenePieceInfo[]>([]);
  const [catalogTextures, setCatalogTextures] = useState<ColorMapTextureInfo[]>([]);
  const [textureSourceTab, setTextureSourceTab] = useState<'catalog' | 'procedural' | 'polyhaven'>(
    'catalog'
  );

  // Selección de textura del catálogo (Mosaicos y Atlas 5x2)
  const [selectedAtlasId, setSelectedAtlasId] = useState<string>('catalogo_progresion_agua_arena');
  const [selectedSubTileId, setSelectedSubTileId] = useState<string>('agua_profundidad_t01');

  // Selección de textura PBR procedural (38+ texturas)
  const [selectedProceduralId, setSelectedProceduralId] = useState<string>('stone_ashlar');

  // Navegador en vivo de Poly Haven CC0 (871+ texturas PBR con Diffuse + Normal + Roughness)
  const [polyHavenQuery, setPolyHavenQuery] = useState<string>('');
  const [polyHavenCategory, setPolyHavenCategory] = useState<string>('all');
  const [polyHavenRes, setPolyHavenRes] = useState<'1k' | '2k'>('1k');
  const [polyHavenItems, setPolyHavenItems] = useState<PolyHavenTextureEntry[]>([]);
  const [polyHavenTotal, setPolyHavenTotal] = useState<number>(871);
  const [polyHavenLoading, setPolyHavenLoading] = useState<boolean>(false);
  const [polyHavenError, setPolyHavenError] = useState<string | null>(null);
  const [selectedPolyHaven, setSelectedPolyHaven] = useState<PolyHavenTextureEntry | null>(null);
  const [isApplyingPolyHaven, setIsApplyingPolyHaven] = useState<boolean>(false);

  // Parámetros de proyección UV
  const [projection, setProjection] = useState<'FLAT' | 'BOX' | 'CYLINDER'>('BOX');
  const [repeat, setRepeat] = useState<number>(2);
  const [highlightSelectedIn3D, setHighlightSelectedIn3D] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeZoneFilter, setActiveZoneFilter] = useState<string>('ALL');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cargar catálogo de láminas/mosaicos/atlas
  useEffect(() => {
    void listAllColorMapTextures().then((list) => {
      setCatalogTextures(list);
      if (list.length > 0 && !list.some((t) => t.id === selectedAtlasId)) {
        setSelectedAtlasId(list[0].id);
        if (list[0].subTiles && list[0].subTiles.length > 0) {
          setSelectedSubTileId(list[0].subTiles[0].id);
        }
      }
    });
  }, [sceneRevision]);

  // Escanear todas las piezas (THREE.Mesh) presentes en la escena actual
  const scanScenePieces = () => {
    const group = modelGroupRef.current;
    if (!group) {
      setPieces([]);
      return;
    }
    const found: ScenePieceInfo[] = [];
    let autoIdx = 1;
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !child.userData?.isOutlineMesh) {
        const m = child as THREE.Mesh;
        if (!m.name || m.name.trim() === '') {
          m.name = `Pieza_${autoIdx}`;
        }
        autoIdx++;
        const geo = m.geometry as THREE.BufferGeometry | undefined;
        const verts = geo?.attributes?.position?.count ?? 0;
        const tris = geo?.index ? Math.round(geo.index.count / 3) : Math.round(verts / 3);
        found.push({
          uuid: m.uuid,
          name: m.name,
          zone: classifyPieceZone(m),
          verts,
          tris,
          appliedTextureId: m.userData?.appliedTextureId,
          appliedTextureName: m.userData?.appliedTextureName,
          mesh: m,
        });
      }
    });
    setPieces(found);

    // Si aún no hay ninguna pieza seleccionada y hay piezas en escena, mantener las válidas o seleccionar la primera
    onSelectedPieceUuidsChange((prev) => {
      const validSet = new Set(found.map((p) => p.uuid));
      const filtered = prev.filter((id) => validSet.has(id));
      if (filtered.length > 0) return filtered;
      return found.length > 0 ? found.map((p) => p.uuid) : [];
    });
  };

  useEffect(() => {
    scanScenePieces();
  }, [sceneRevision]);

  const activeCatalogItem = useMemo(
    () => catalogTextures.find((t) => t.id === selectedAtlasId) || catalogTextures[0] || null,
    [catalogTextures, selectedAtlasId]
  );

  const activeSubTile: SubTileSpec | undefined = useMemo(() => {
    if (!activeCatalogItem?.subTiles || selectedSubTileId === '__FULL__') return undefined;
    return (
      activeCatalogItem.subTiles.find((s) => s.id === selectedSubTileId) ||
      activeCatalogItem.subTiles[0]
    );
  }, [activeCatalogItem, selectedSubTileId]);

  // Cargar catálogo en vivo de Poly Haven cuando el usuario abre la pestaña o busca
  useEffect(() => {
    if (textureSourceTab !== 'polyhaven') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPolyHavenLoading(true);
      setPolyHavenError(null);
      try {
        const res = await searchPolyHavenTextures(polyHavenQuery, polyHavenCategory, 36);
        if (cancelled) return;
        setPolyHavenItems(res.items);
        setPolyHavenTotal(res.total);
        if (res.items.length > 0) {
          setSelectedPolyHaven((prev) =>
            prev && res.items.some((it) => it.id === prev.id) ? prev : res.items[0]
          );
        }
      } catch (err) {
        if (!cancelled) {
          setPolyHavenError(
            err instanceof Error ? err.message : 'No se pudo conectar con Poly Haven.'
          );
        }
      } finally {
        if (!cancelled) setPolyHavenLoading(false);
      }
    }, polyHavenQuery.trim() ? 260 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [textureSourceTab, polyHavenQuery, polyHavenCategory]);

  const effectiveTextureId = useMemo(() => {
    if (textureSourceTab === 'polyhaven') {
      const phId = selectedPolyHaven?.id || 'brick_wall_001';
      return `polyhaven:${phId}@${polyHavenRes}`;
    }
    if (textureSourceTab === 'procedural') {
      return selectedProceduralId;
    }
    if (!activeCatalogItem) return 'mosaico_romano_imperial';
    if (activeSubTile) return activeSubTile.id;
    return activeCatalogItem.id;
  }, [
    textureSourceTab,
    selectedPolyHaven,
    polyHavenRes,
    selectedProceduralId,
    activeCatalogItem,
    activeSubTile,
  ]);

  // Sincronizar configuración de pintura activa con App.tsx (para el modo "Pintar al hacer clic en 3D")
  useEffect(() => {
    onActivePaintConfigChange?.({
      textureId: effectiveTextureId,
      parentAtlasId:
        textureSourceTab === 'catalog' && activeSubTile ? activeCatalogItem?.id : undefined,
      tileCode: textureSourceTab === 'catalog' && activeSubTile ? activeSubTile.code : undefined,
      projection,
      repeat,
    });
  }, [
    effectiveTextureId,
    textureSourceTab,
    activeCatalogItem,
    activeSubTile,
    projection,
    repeat,
  ]);

  // Dibujar miniatura recortada en vivo del sub-tile o mosaico seleccionado
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || textureSourceTab !== 'catalog' || !activeCatalogItem) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (activeSubTile) {
        const [x0, y0, x1, y1] = activeSubTile.cropRect;
        const sx = Math.round(x0 * img.naturalWidth);
        const sy = Math.round(y0 * img.naturalHeight);
        const sw = Math.max(1, Math.round((x1 - x0) * img.naturalWidth));
        const sh = Math.max(1, Math.round((y1 - y0) * img.naturalHeight));
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
    };
    img.src = activeCatalogItem.url;
  }, [textureSourceTab, activeCatalogItem, activeSubTile]);

  // Efecto para resaltar visualmente en el visor 3D las piezas marcadas cuando highlightSelectedIn3D está activo
  useEffect(() => {
    const selectedSet = new Set(selectedPieceUuids);
    for (const p of pieces) {
      const m = p.mesh;
      const mat = m.material as any;
      if (!mat || typeof mat !== 'object') continue;
      if (!m.userData._savedEmissiveHex && mat.emissive?.getHexString) {
        m.userData._savedEmissiveHex = `#${mat.emissive.getHexString()}`;
        m.userData._savedEmissiveIntensity = mat.emissiveIntensity ?? 0;
      }
      if (highlightSelectedIn3D && selectedSet.has(p.uuid)) {
        if (mat.emissive?.set) {
          mat.emissive.set('#22d3ee');
          mat.emissiveIntensity = 0.42;
          mat.needsUpdate = true;
        }
      } else if (m.userData._savedEmissiveHex && mat.emissive?.set) {
        mat.emissive.set(m.userData._savedEmissiveHex);
        mat.emissiveIntensity = m.userData._savedEmissiveIntensity ?? 0;
        mat.needsUpdate = true;
      }
    }
    return () => {
      for (const p of pieces) {
        const m = p.mesh;
        const mat = m.material as any;
        if (m.userData?._savedEmissiveHex && mat?.emissive?.set) {
          mat.emissive.set(m.userData._savedEmissiveHex);
          mat.emissiveIntensity = m.userData._savedEmissiveIntensity ?? 0;
          mat.needsUpdate = true;
        }
      }
    };
  }, [highlightSelectedIn3D, selectedPieceUuids, pieces]);

  // Agrupación de piezas por zonas semánticas
  const zoneCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pieces) {
      map.set(p.zone, (map.get(p.zone) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [pieces]);

  const visiblePieces = useMemo(() => {
    return pieces.filter((p) => {
      if (activeZoneFilter !== 'ALL' && p.zone !== activeZoneFilter) return false;
      if (
        searchFilter.trim() !== '' &&
        !p.name.toLowerCase().includes(searchFilter.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [pieces, activeZoneFilter, searchFilter]);

  const selectedPiecesList = useMemo(() => {
    const set = new Set(selectedPieceUuids);
    return pieces.filter((p) => set.has(p.uuid));
  }, [pieces, selectedPieceUuids]);

  const togglePieceSelection = (uuid: string) => {
    onSelectedPieceUuidsChange((prev) =>
      prev.includes(uuid) ? prev.filter((id) => id !== uuid) : [...prev, uuid]
    );
  };

  const selectByZone = (zoneName: string) => {
    setActiveZoneFilter(zoneName);
    if (zoneName === 'ALL') {
      onSelectedPieceUuidsChange(pieces.map((p) => p.uuid));
    } else {
      const zoneUuids = pieces.filter((p) => p.zone === zoneName).map((p) => p.uuid);
      onSelectedPieceUuidsChange(zoneUuids);
    }
  };

  const selectMatchingSearch = () => {
    const matching = visiblePieces.map((p) => p.uuid);
    onSelectedPieceUuidsChange(matching);
  };

  const buildPythonCodeForSelection = (targetPieces: ScenePieceInfo[]) => {
    const namesList = targetPieces.map((p) => `"${p.name}"`).join(', ');
    const isAll = targetPieces.length === pieces.length && pieces.length > 1;
    const objectsArg = isAll ? `zone="ALL"` : `objects=[${namesList}]`;

    if (textureSourceTab === 'polyhaven') {
      const phId = selectedPolyHaven?.id || 'brick_wall_001';
      return `bpy.ops.material.set_polyhaven_texture(${objectsArg}, asset="${phId}", resolution="${polyHavenRes}", projection="${projection}", repeat=${repeat})`;
    }
    if (textureSourceTab === 'catalog' && activeCatalogItem) {
      if (activeSubTile) {
        return `bpy.ops.material.paint_zone(${objectsArg}, texture="${activeCatalogItem.id}", tile="${activeSubTile.code}", projection="${projection}", repeat=${repeat})`;
      }
      return `bpy.ops.material.paint_zone(${objectsArg}, texture="${activeCatalogItem.id}", projection="${projection}", repeat=${repeat})`;
    }
    return `bpy.ops.material.paint_zone(${objectsArg}, texture="${selectedProceduralId}", projection="${projection}", repeat=${repeat})`;
  };

  const handlePaintMeshes = async (
    targetPieces: ScenePieceInfo[],
    appendToScript: boolean = false
  ) => {
    if (targetPieces.length === 0) {
      setStatusMsg('Selecciona al menos una pieza o zona para pintar.');
      return;
    }
    const meshesToPaint = targetPieces.map((p) => p.mesh);

    if (textureSourceTab === 'polyhaven') {
      const phAssetId = selectedPolyHaven?.id || 'brick_wall_001';
      const phLabel = selectedPolyHaven?.name || phAssetId;
      setIsApplyingPolyHaven(true);
      setStatusMsg(
        `Descargando mapas PBR (${polyHavenRes.toUpperCase()}) de Poly Haven para "${phLabel}"...`
      );
      try {
        const res = await applyPolyHavenTextureToMeshes(meshesToPaint, phAssetId, {
          resolution: polyHavenRes,
          projection,
          repeat,
        });
        scanScenePieces();
        const mapsBadge = res.mapsLoaded.join(' + ');
        const msg = `Poly Haven PBR aplicado en ${res.appliedCount} pieza(s): "${phLabel}" (${polyHavenRes.toUpperCase()} · ${mapsBadge})`;
        setStatusMsg(msg);
        setTimeout(() => setStatusMsg(null), 5500);
        if (appendToScript && onAppendPythonCode) {
          const pyLine = buildPythonCodeForSelection(targetPieces);
          onAppendPythonCode(pyLine, msg);
        }
      } catch (err) {
        setStatusMsg(
          `Error Poly Haven: ${err instanceof Error ? err.message : 'No se pudo descargar la textura.'}`
        );
      } finally {
        setIsApplyingPolyHaven(false);
      }
      return;
    }

    const res = applyCatalogTextureToMeshes(meshesToPaint, effectiveTextureId, {
      projection,
      repeat,
    });
    scanScenePieces();
    const msg = `Pintadas ${res.appliedCount} pieza(s) con "${res.resolvedName}" (${projection}, repeat=${repeat}×)`;
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 4500);

    if (appendToScript && onAppendPythonCode) {
      const pyLine = buildPythonCodeForSelection(targetPieces);
      onAppendPythonCode(pyLine, msg);
    }
  };

  const handleCopyPythonSnippet = async () => {
    const targets = selectedPiecesList.length > 0 ? selectedPiecesList : pieces;
    const snippet = buildPythonCodeForSelection(targets);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
      setStatusMsg('Comando Python de zona copiado al portapapeles.');
    } catch {
      setStatusMsg('No se pudo copiar al portapapeles.');
    }
  };

  return (
    <div className="p-3 rounded-lg bg-slate-900/95 border border-amber-500/40 space-y-2.5 shadow-lg">
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
          <Paintbrush className="w-3.5 h-3.5 text-amber-400" />
          <span>Pintar Zona Marcada / Piezas Completas</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHighlightSelectedIn3D((v) => !v)}
            className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
              highlightSelectedIn3D
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-cyan-400/50'
            }`}
            title="Ilumina en color cian las piezas actualmente marcadas dentro del visor 3D"
          >
            <Eye className="w-3 h-3" />
            <span>{highlightSelectedIn3D ? 'Ocultar Marca 3D' : 'Ver Zona en 3D'}</span>
          </button>
          <button
            type="button"
            onClick={scanScenePieces}
            className="p-1 rounded bg-slate-950 border border-slate-700 text-slate-300 hover:text-amber-300 cursor-pointer"
            title="Actualizar lista de piezas 3D de la escena"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Selector de Modo Interactivo con el Ratón sobre el Visor 3D */}
      <div className="p-2 rounded-md bg-slate-950/90 border border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-300 font-semibold flex items-center gap-1">
            <MousePointerClick className="w-3.5 h-3.5 text-cyan-400" />
            <span>Interacción directa haciendo clic en el modelo 3D:</span>
          </span>
          <span className="font-mono text-amber-300 font-bold">
            {selectedPiecesList.length} / {pieces.length} piezas marcadas
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => onPickModeChange('off')}
            className={`py-1 px-1.5 rounded border font-semibold cursor-pointer transition-colors ${
              pickMode === 'off'
                ? 'bg-slate-800 border-slate-500 text-slate-100'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            🔄 Cámara Normal
          </button>
          <button
            type="button"
            onClick={() => onPickModeChange(pickMode === 'select' ? 'off' : 'select')}
            className={`py-1 px-1.5 rounded border font-semibold cursor-pointer transition-colors ${
              pickMode === 'select'
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow'
                : 'bg-slate-900 border-slate-800 text-cyan-300/80 hover:border-cyan-500/40'
            }`}
            title="Haz clic sobre cualquier pieza del modelo 3D para marcarla o desmarcarla"
          >
            🎯 Clic 3D = Marcar
          </button>
          <button
            type="button"
            onClick={() => onPickModeChange(pickMode === 'paint' ? 'off' : 'paint')}
            className={`py-1 px-1.5 rounded border font-semibold cursor-pointer transition-colors ${
              pickMode === 'paint'
                ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow'
                : 'bg-slate-900 border-slate-800 text-amber-300/80 hover:border-amber-500/40'
            }`}
            title="Haz clic sobre cualquier pieza del modelo 3D para pintarla inmediatamente con la textura elegida"
          >
            🖌️ Clic 3D = Pintar
          </button>
        </div>
      </div>

      {/* PASO 1: Selección de Zonas Completas o Piezas Individuales */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-slate-200 flex items-center gap-1">
            <Layers className="w-3 h-3 text-amber-400" />
            <span>1. Selecciona una Zona Completa o marca piezas sueltas:</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectedPieceUuidsChange(pieces.map((p) => p.uuid))}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 cursor-pointer"
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => {
                const set = new Set(selectedPieceUuids);
                onSelectedPieceUuidsChange(
                  pieces.filter((p) => !set.has(p.uuid)).map((p) => p.uuid)
                );
              }}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
            >
              Invertir
            </button>
            <button
              type="button"
              onClick={() => onSelectedPieceUuidsChange([])}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 cursor-pointer"
            >
              Ninguna
            </button>
          </div>
        </div>

        {/* Botones de Zonas Automáticas */}
        {zoneCounts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => selectByZone('ALL')}
              className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer transition-colors ${
                activeZoneFilter === 'ALL'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Todas ({pieces.length})
            </button>
            {zoneCounts.map(([zoneName, count]) => (
              <button
                key={zoneName}
                type="button"
                onClick={() => selectByZone(zoneName)}
                className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer transition-colors ${
                  activeZoneFilter === zoneName
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-amber-400/40'
                }`}
                title={`Filtrar y marcar todas las piezas de la zona "${zoneName}"`}
              >
                {zoneName} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Buscador por nombre de pieza */}
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Filter className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrar piezas por nombre (ej. Columna, Suelo, Muro, Pz_)..."
              className="w-full pl-6 pr-2 py-1 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-200 outline-none focus:border-cyan-400"
            />
          </div>
          {searchFilter.trim() !== '' && (
            <button
              type="button"
              onClick={selectMatchingSearch}
              className="px-2 py-1 rounded bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 text-[10px] font-semibold whitespace-nowrap cursor-pointer"
            >
              Marcar ({visiblePieces.length})
            </button>
          )}
        </div>

        {/* Lista de piezas con casillas de verificación */}
        <div className="max-h-40 overflow-y-auto rounded border border-slate-800 bg-slate-950/80 divide-y divide-slate-800/60">
          {visiblePieces.length === 0 ? (
            <div className="p-2.5 text-[10px] text-slate-500 text-center">
              No hay piezas en esta vista. Ejecuta un script Python o limpia el filtro.
            </div>
          ) : (
            visiblePieces.map((piece) => {
              const isChecked = selectedPieceUuids.includes(piece.uuid);
              return (
                <div
                  key={piece.uuid}
                  onClick={() => togglePieceSelection(piece.uuid)}
                  className={`px-2 py-1.5 flex items-center justify-between gap-2 text-[10px] cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-cyan-500/15 text-slate-100'
                      : 'hover:bg-slate-900/90 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {isChecked ? (
                      <CheckSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    )}
                    <span className="font-mono font-semibold truncate text-slate-200">
                      {piece.name}
                    </span>
                    <span className="px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-[9px] text-slate-400 shrink-0">
                      {piece.zone}
                    </span>
                    {piece.appliedTextureId && (
                      <span
                        className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[9px] font-mono truncate max-w-[110px]"
                        title={piece.appliedTextureName || piece.appliedTextureId}
                      >
                        🎨 {piece.appliedTextureId}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] font-mono text-slate-500">
                      {piece.tris} tris
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePaintMeshes([piece], false);
                      }}
                      className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 text-[9px] font-bold cursor-pointer"
                      title={`Pintar solo la pieza "${piece.name}" con la textura elegida`}
                    >
                      Pintar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* PASO 2: Selección de Textura Determinada (Catálogo Atlas/Mosaicos o 40 PBR Procedurales) */}
      <div className="p-2 rounded-md bg-slate-950/90 border border-slate-800 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
          <span className="font-semibold text-amber-200">
            2. Textura para pintar la zona marcada:
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setTextureSourceTab('catalog')}
              className={`px-2 py-0.5 rounded border cursor-pointer ${
                textureSourceTab === 'catalog'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              🗂️ Mosaicos ({catalogTextures.length})
            </button>
            <button
              type="button"
              onClick={() => setTextureSourceTab('procedural')}
              className={`px-2 py-0.5 rounded border cursor-pointer ${
                textureSourceTab === 'procedural'
                  ? 'bg-purple-500/20 border-purple-400 text-purple-200 font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              🧱 PBR ({TEXTURE_PRESETS.length - 1})
            </button>
            <button
              type="button"
              onClick={() => setTextureSourceTab('polyhaven')}
              className={`px-2 py-0.5 rounded border flex items-center gap-1 cursor-pointer ${
                textureSourceTab === 'polyhaven'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-semibold'
                  : 'bg-slate-900 border-slate-800 text-emerald-300/80 hover:border-emerald-400/50'
              }`}
              title="Explorar más de 870 texturas PBR CC0 en directo desde Poly Haven (Diffuse + Normal + Roughness)"
            >
              <Globe className="w-3 h-3" />
              <span>Poly Haven ({polyHavenTotal}+)</span>
            </button>
          </div>
        </div>

        {textureSourceTab === 'catalog' ? (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <canvas
                ref={previewCanvasRef}
                width={64}
                height={64}
                className="w-14 h-14 rounded border border-amber-400/50 bg-slate-900 shrink-0 object-cover"
                title="Vista previa exacta de la textura o sub-tesela 512×512 recortada"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <select
                  value={selectedAtlasId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedAtlasId(nextId);
                    const found = catalogTextures.find((t) => t.id === nextId);
                    if (found?.subTiles && found.subTiles.length > 0) {
                      setSelectedSubTileId(found.subTiles[0].id);
                      setProjection('BOX');
                    } else if (found?.kind === 'mosaic') {
                      setSelectedSubTileId('__FULL__');
                      setProjection('FLAT');
                      setRepeat(1);
                    }
                  }}
                  className="w-full py-1 px-2 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-100 outline-none focus:border-amber-400"
                >
                  <optgroup label="🌊 Nuevo: Progresión Profundidad Agua y Arena (Tileable)">
                    {catalogTextures
                      .filter((t) => t.id === 'catalogo_progresion_agua_arena')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="🏛️ Mosaicos y Murales Completos (1376×768)">
                    {catalogTextures
                      .filter((t) => t.kind === 'mosaic')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="🗂️ Catálogos Atlas 5×2 (10 Sub-Texturas 512×512 cada uno)">
                    {catalogTextures
                      .filter(
                        (t) =>
                          t.kind === 'atlas' && t.id !== 'catalogo_progresion_agua_arena'
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="🧱 PBR 1K y Texturas de Usuario">
                    {catalogTextures
                      .filter((t) => t.kind !== 'mosaic' && t.kind !== 'atlas')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </optgroup>
                </select>

                {/* Selector de Sub-Textura T-01..T-10 si es un Atlas 5x2 */}
                {activeCatalogItem?.subTiles && activeCatalogItem.subTiles.length > 0 && (
                  <select
                    value={selectedSubTileId}
                    onChange={(e) => setSelectedSubTileId(e.target.value)}
                    className="w-full py-1 px-2 rounded bg-slate-900 border border-amber-500/40 text-[10px] text-amber-200 font-mono outline-none focus:border-amber-400"
                  >
                    {activeCatalogItem.subTiles.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} {sub.isMosaic ? '🏛️ (Mosaico)' : ''} → &quot;{sub.id}&quot;
                      </option>
                    ))}
                    <option value="__FULL__">
                      🖼️ Lámina Atlas 5×2 Completa Sin Recortar ({activeCatalogItem.id})
                    </option>
                  </select>
                )}
              </div>
            </div>

            {/* Botones rápidos T-01 .. T-10 para cambiar de baldosa/profundidad con 1 clic */}
            {activeCatalogItem?.subTiles && activeCatalogItem.subTiles.length > 0 && (
              <div className="grid grid-cols-5 gap-1 pt-0.5">
                {activeCatalogItem.subTiles.map((sub) => {
                  const isSubActive = selectedSubTileId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSelectedSubTileId(sub.id)}
                      className={`py-0.5 px-1 rounded border text-[9px] font-mono truncate cursor-pointer transition-colors ${
                        isSubActive
                          ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-amber-400/50'
                      }`}
                      title={sub.name}
                    >
                      {sub.code}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : textureSourceTab === 'procedural' ? (
          <div>
            <select
              value={selectedProceduralId}
              onChange={(e) => setSelectedProceduralId(e.target.value)}
              className="w-full py-1.5 px-2 rounded bg-slate-900 border border-purple-500/40 text-[11px] text-purple-100 outline-none focus:border-purple-400"
            >
              {TEXTURE_PRESETS.filter((p) => p.id !== 'none').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — id: &quot;{p.id}&quot; ({p.category})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Buscador bilingüe + selector de resolución 1K / 2K */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="w-3 h-3 text-emerald-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={polyHavenQuery}
                  onChange={(e) => setPolyHavenQuery(e.target.value)}
                  placeholder="Buscar en Poly Haven (ej. ladrillo, madera, marmol, teja, metal, roca)..."
                  className="w-full pl-6 pr-2 py-1 rounded bg-slate-900 border border-emerald-500/40 text-[10px] text-slate-100 outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex items-center rounded border border-slate-700 bg-slate-900 overflow-hidden text-[9px] font-mono shrink-0">
                {(['1k', '2k'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPolyHavenRes(r)}
                    className={`px-1.5 py-1 cursor-pointer transition-colors ${
                      polyHavenRes === r
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title={
                      r === '1k'
                        ? '1K (1024px) — Carga rápida + Diffuse + Normal + Roughness'
                        : '2K (2048px) — Alta definición PBR + Diffuse + Normal + Roughness'
                    }
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtros de categoría Poly Haven */}
            <div className="flex flex-wrap gap-1">
              {POLYHAVEN_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setPolyHavenCategory(cat.id)}
                  className={`px-1.5 py-0.5 rounded text-[9px] border cursor-pointer transition-colors ${
                    polyHavenCategory === cat.id
                      ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Cuadrícula de miniaturas PBR CC0 */}
            {polyHavenLoading ? (
              <div className="py-5 flex items-center justify-center gap-2 text-[10px] text-emerald-300 bg-slate-900/70 rounded border border-slate-800">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Consultando catálogo CC0 de Poly Haven...</span>
              </div>
            ) : polyHavenError ? (
              <div className="p-2 rounded bg-rose-950/60 border border-rose-500/40 text-[10px] text-rose-200">
                {polyHavenError}
              </div>
            ) : polyHavenItems.length === 0 ? (
              <div className="p-3 text-center text-[10px] text-slate-400 bg-slate-900/60 rounded border border-slate-800">
                Sin coincidencias en Poly Haven. Prueba con otra palabra (ej. &quot;brick&quot;, &quot;wood&quot;, &quot;piedra&quot;).
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto grid grid-cols-3 gap-1.5 pr-0.5">
                {polyHavenItems.map((item) => {
                  const isSel = selectedPolyHaven?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedPolyHaven(item)}
                      className={`group rounded overflow-hidden border text-left transition-all cursor-pointer ${
                        isSel
                          ? 'border-emerald-400 ring-1 ring-emerald-400/60 bg-emerald-950/50'
                          : 'border-slate-800 bg-slate-900/90 hover:border-emerald-500/40'
                      }`}
                      title={`${item.name} — id: polyhaven:${item.id} (CC0 Public Domain)`}
                    >
                      <div className="relative h-14 w-full bg-slate-950 overflow-hidden">
                        <img
                          src={item.proxyThumbnailUrl}
                          alt={item.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        {isSel && (
                          <span className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded bg-emerald-500 text-slate-950 text-[8px] font-bold">
                            PBR
                          </span>
                        )}
                      </div>
                      <div className="px-1.5 py-1">
                        <div className="text-[9px] font-semibold text-slate-100 truncate">
                          {item.name}
                        </div>
                        <div className="text-[8px] font-mono text-emerald-300/80 truncate">
                          {item.id}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedPolyHaven && (
              <div className="px-2 py-1 rounded bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between gap-2 text-[9px]">
                <span className="text-emerald-200 truncate">
                  <strong>{selectedPolyHaven.name}</strong> · Diffuse + Normal + Roughness (CC0)
                </span>
                <span className="font-mono text-emerald-300 shrink-0">
                  polyhaven:{selectedPolyHaven.id}@{polyHavenRes}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Controles de Proyección UV y Repetición */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="text-slate-400">UV:</span>
            {(['FLAT', 'BOX', 'CYLINDER'] as const).map((proj) => (
              <button
                key={proj}
                type="button"
                onClick={() => setProjection(proj)}
                className={`px-1.5 py-0.5 rounded border font-mono cursor-pointer ${
                  projection === proj
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={
                  proj === 'FLAT'
                    ? 'Proyección Plana 0..1 (Ideal para Suelos, Playas y Mosaicos completos)'
                    : proj === 'BOX'
                    ? 'Proyección Triplanar / Caja (Ideal para Muros, Tejados y Objetos 3D)'
                    : 'Proyección Cilíndrica (Ideal para Columnas, Fustes y Torres)'
                }
              >
                {proj}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-400">Repetición:</span>
            {[1, 2, 3, 4].map((rVal) => (
              <button
                key={rVal}
                type="button"
                onClick={() => setRepeat(rVal)}
                className={`px-1.5 py-0.5 rounded border font-mono cursor-pointer ${
                  repeat === rVal
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {rVal}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* PASO 3: Botones de Acción para Pintar la Zona Marcada */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => void handlePaintMeshes(selectedPiecesList, false)}
          disabled={selectedPiecesList.length === 0 || isApplyingPolyHaven}
          className="py-1.5 px-2.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1.5 shadow cursor-pointer transition-all"
          title="Pinta inmediatamente en el visor 3D todas las piezas marcadas con la textura seleccionada"
        >
          {isApplyingPolyHaven ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Paintbrush className="w-3.5 h-3.5" />
          )}
          <span>
            {isApplyingPolyHaven
              ? 'Descargando PBR...'
              : `Pintar Zona (${selectedPiecesList.length})`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => void handlePaintMeshes(selectedPiecesList, true)}
          disabled={selectedPiecesList.length === 0 || isApplyingPolyHaven}
          className="py-1.5 px-2.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 border border-emerald-400/60 text-emerald-200 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          title="Pinta las piezas marcadas en 3D y añade la orden Python al código de editor.py"
        >
          <Code2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Pintar + Guardar en .PY</span>
        </button>
      </div>

      {/* Vista previa del comando Python generado para las piezas marcadas */}
      <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
        <code className="text-[9px] font-mono text-cyan-300 truncate flex-1">
          {buildPythonCodeForSelection(
            selectedPiecesList.length > 0 ? selectedPiecesList : pieces
          )}
        </code>
        <button
          type="button"
          onClick={handleCopyPythonSnippet}
          className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[9px] text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer"
          title="Copiar línea de código Python para pintar esta zona marcada"
        >
          {copiedCode ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-300">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar API</span>
            </>
          )}
        </button>
      </div>

      {statusMsg && (
        <div className="px-2.5 py-1.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-[10px] text-emerald-200 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
    </div>
  );
}
