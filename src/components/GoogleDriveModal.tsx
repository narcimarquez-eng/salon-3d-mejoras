import React, { useEffect, useState } from 'react';
import {
  HardDrive,
  RefreshCw,
  Download,
  AlertCircle,
  X,
  FileCode2,
  ExternalLink,
  Loader2,
  Check,
  Search,
} from 'lucide-react';
import {
  GoogleDriveGlbFile,
  listGlbFilesFromDrive,
  downloadGlbFileFromDrive,
} from '../utils/googleDrive';

interface GoogleDriveModalProps {
  isOpen: boolean;
  accessToken: string | null;
  onClose: () => void;
  onSelectGlbFile: (file: File) => void;
  onRequestSignIn: () => Promise<void>;
}

export default function GoogleDriveModal({
  isOpen,
  accessToken,
  onClose,
  onSelectGlbFile,
  onRequestSignIn,
}: GoogleDriveModalProps) {
  const [files, setFiles] = useState<GoogleDriveGlbFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');

  const loadFiles = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listGlbFilesFromDrive(token);
      setFiles(list);
    } catch (err: unknown) {
      console.error('Error al listar archivos de Drive:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && accessToken) {
      void loadFiles(accessToken);
    }
  }, [isOpen, accessToken]);

  if (!isOpen) return null;

  const handleDownloadAndOpen = async (fileItem: GoogleDriveGlbFile) => {
    if (!accessToken) return;
    setDownloadingId(fileItem.id);
    setError(null);
    try {
      const glbFile = await downloadGlbFileFromDrive(fileItem.id, fileItem.name, accessToken);
      onSelectGlbFile(glbFile);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error al descargar ${fileItem.name}: ${msg}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-slate-200">
        {/* Encabezado */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>Archivos .GLB en tu Google Drive</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-normal">
                  Drive API
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 leading-none">
                Selecciona cualquier modelo 3D para cargarlo de inmediato en el visor
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {!accessToken ? (
            <div className="p-6 text-center space-y-3 bg-slate-950/40 rounded-lg border border-slate-800/80">
              <div className="w-12 h-12 mx-auto rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <HardDrive className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">Conecta tu cuenta de Google</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Inicia sesión para conceder acceso de lectura y listar tus modelos 3D (.glb / .gltf) guardados en Google Drive.
                </p>
              </div>
              <button
                type="button"
                onClick={onRequestSignIn}
                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-2 mx-auto transition-colors cursor-pointer"
              >
                <span>Conectar con Google Drive</span>
              </button>
            </div>
          ) : (
            <>
              {/* Barra de búsqueda y recarga */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Filtrar modelos por nombre..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => loadFiles(accessToken)}
                  disabled={loading}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Actualizar lista de Drive"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refrescar</span>
                </button>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div>
                    <p className="font-semibold">No se pudo acceder a Google Drive</p>
                    <p className="text-[11px] text-rose-200/80 leading-snug">{error}</p>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="py-12 text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-sky-400" />
                  <p className="text-xs text-slate-400">Buscando archivos .glb en tu Google Drive...</p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="py-10 text-center space-y-2 bg-slate-950/30 rounded-lg border border-slate-800/60 p-4">
                  <FileCode2 className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs text-slate-300 font-medium">
                    {filterQuery
                      ? 'No hay archivos que coincidan con la búsqueda'
                      : 'No se han encontrado archivos .glb o .gltf en la raíz de tu Drive'}
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Asegúrate de que tus modelos tienen la extensión <span className="text-slate-300">.glb</span> en el nombre del archivo.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                  {filteredFiles.map((fileItem) => {
                    const isDownloading = downloadingId === fileItem.id;
                    const sizeMb = fileItem.size
                      ? (parseInt(fileItem.size, 10) / (1024 * 1024)).toFixed(2)
                      : null;

                    return (
                      <div
                        key={fileItem.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 hover:bg-slate-800/60 border border-slate-800 hover:border-sky-500/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0 text-sky-300">
                            <FileCode2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate" title={fileItem.name}>
                              {fileItem.name}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              {sizeMb && <span>{sizeMb} MB</span>}
                              {fileItem.modifiedTime && (
                                <span>· {new Date(fileItem.modifiedTime).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDownloadAndOpen(fileItem)}
                          disabled={isDownloading}
                          className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-60"
                        >
                          {isDownloading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Cargando...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>Abrir en 3D</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Pie */}
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-[11px] text-slate-400">
          <span>Solo lectura segura de tus archivos 3D de Drive</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
