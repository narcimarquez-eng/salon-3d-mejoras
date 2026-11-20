// ============================================================================
// MOTOR DE DESCARGAS FIABLES (HTTP Attachment + Blob Fallback + FilePicker + ZIP)
// ----------------------------------------------------------------------------
// Resuelve los fallos típicos de descarga en iframes (AI Studio / WebViews),
// navegadores móviles (Android Chrome / iOS Safari) y tras procesos async
// largos que expiran la activación de usuario:
//   1. Sube temporalmente los bytes al mismo origen (/api/downloads/stage)
//      para servirlos con Content-Disposition: attachment real.
//   2. Dispara la descarga mediante un <iframe> oculto (no navega ni pierde
//      estado de la app, y los navegadores respetan attachment sin bloquearlo).
//   3. Mantiene siempre un enlace Blob de respaldo con vida útil larga (10 min)
//      y soporte opcional para window.showSaveFilePicker().
//   4. Incluye un empaquetador ZIP real (Store + CRC32) sin dependencias
//      externas para descargas en lote.
// ============================================================================

export interface PreparedDownload {
  /** URL preferida para descargar (HTTP /api/downloads/... si está disponible, o blob: fallback). */
  url: string;
  /** URL HTTP real del servidor con Content-Disposition: attachment (null si falló el staging). */
  serverUrl: string | null;
  /** URL local blob: de respaldo. */
  blobUrl: string;
  /** Blob binario listo para compartir o guardar con showSaveFilePicker. */
  blob: Blob;
  /** Nombre de archivo sanitizado. */
  filename: string;
  /** Tamaño exacto en bytes. */
  byteLength: number;
  /** Libera la URL blob: asociada cuando ya no se necesite. */
  cleanup: () => void;
}

const MAX_SERVER_STAGE_BYTES = 78 * 1024 * 1024; // Margen bajo el límite de 80 MB del servidor
const STAGE_TIMEOUT_MS = 15_000;

export function sanitizeDownloadFilename(raw: string, fallback = 'modelo_3d.glb'): string {
  const trimmed = String(raw || '').trim();
  const base = trimmed.split(/[\\/]/).pop() || '';
  const cleaned = base
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+/, '')
    .slice(0, 120);
  return cleaned || fallback;
}

export function toBlob(
  data: Blob | Uint8Array | ArrayBuffer | string,
  mimeType = 'application/octet-stream'
): Blob {
  if (data instanceof Blob) {
    return data.type ? data : new Blob([data], { type: mimeType });
  }
  if (typeof data === 'string') {
    return new Blob([data], { type: mimeType });
  }
  if (data instanceof ArrayBuffer) {
    return new Blob([data], { type: mimeType });
  }
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy.buffer], { type: mimeType });
}

async function tryStageOnServer(
  blob: Blob,
  filename: string,
  mimeType: string
): Promise<string | null> {
  if (typeof fetch !== 'function' || blob.size === 0 || blob.size > MAX_SERVER_STAGE_BYTES) {
    return null;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId =
    controller !== null ? setTimeout(() => controller.abort(), STAGE_TIMEOUT_MS) : null;

  try {
    const res = await fetch('/api/downloads/stage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': encodeURIComponent(filename),
        'X-Mime-Type': mimeType,
      },
      body: blob,
      signal: controller?.signal,
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { downloadUrl?: unknown };
    if (
      typeof payload.downloadUrl === 'string' &&
      payload.downloadUrl.startsWith('/api/downloads/')
    ) {
      return payload.downloadUrl;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

/**
 * Prepara una descarga segura: crea un único Blob + blobUrl y sube una copia
 * temporal al servidor local para obtener una URL HTTP real con attachment.
 */
export async function stageAndPrepareDownload(
  data: Blob | Uint8Array | ArrayBuffer | string,
  filename: string,
  mimeType = 'application/octet-stream'
): Promise<PreparedDownload> {
  const safeName = sanitizeDownloadFilename(filename);
  const blob = toBlob(data, mimeType);
  const blobUrl = URL.createObjectURL(blob);
  const serverUrl = await tryStageOnServer(blob, safeName, mimeType);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Ignorar si ya fue revocada
    }
  };

  return {
    url: serverUrl ?? blobUrl,
    serverUrl,
    blobUrl,
    blob,
    filename: safeName,
    byteLength: blob.size,
    cleanup,
  };
}

/**
 * Inicia la descarga de un PreparedDownload usando la vía más fiable:
 * - Si hay serverUrl (HTTP Content-Disposition: attachment), utiliza un <iframe>
 *   oculto que el navegador descarga directamente sin perder el estado SPA.
 * - Si no hay serverUrl, recurre al enlace <a download> con blobUrl.
 */
export function initiateDownload(prepared: PreparedDownload): void {
  if (typeof document === 'undefined') return;

  if (prepared.serverUrl) {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.src = prepared.serverUrl;
      document.body.appendChild(iframe);
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 60_000);
      return;
    } catch (err) {
      console.warn('initiateDownload: fallback desde iframe a <a>:', err);
    }
  }

  triggerAnchorDownload(prepared.blobUrl, prepared.filename);
}

/** Dispara una descarga directa mediante un enlace <a download> temporal. */
export function triggerAnchorDownload(href: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.style.position = 'fixed';
  link.style.top = '-9999px';
  link.style.left = '-9999px';
  link.style.opacity = '0';
  link.style.pointerEvents = 'none';
  link.href = href;
  link.download = sanitizeDownloadFilename(filename);
  link.rel = 'noopener';
  document.body.appendChild(link);
  try {
    link.click();
  } catch (err) {
    console.warn('triggerAnchorDownload: click error', err);
  }
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 1_500);
}

export function supportsSaveFilePicker(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

/**
 * Permite al usuario elegir manualmente dónde guardar el archivo usando
 * File System Access API (Chrome/Edge escritorio fuera de iframes bloqueados).
 */
export async function saveWithFilePicker(
  blob: Blob,
  filename: string
): Promise<'saved' | 'cancelled' | 'unsupported'> {
  if (!supportsSaveFilePicker()) return 'unsupported';
  const safeName = sanitizeDownloadFilename(filename);
  const ext = safeName.includes('.') ? `.${safeName.split('.').pop()!.toLowerCase()}` : '';
  const mime = blob.type || 'application/octet-stream';

  try {
    const picker = (
      window as unknown as {
        showSaveFilePicker: (opts: {
          suggestedName: string;
          types?: { description: string; accept: Record<string, string[]> }[];
        }) => Promise<{
          createWritable: () => Promise<{
            write: (data: Blob) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }>;
      }
    ).showSaveFilePicker;

    const handle = await picker({
      suggestedName: safeName,
      types: ext
        ? [{ description: `Archivo ${ext.toUpperCase()}`, accept: { [mime]: [ext] } }]
        : undefined,
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'saved';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'cancelled';
    }
    // SecurityError en iframe de origen cruzado o navegador que lo deshabilita
    return 'unsupported';
  }
}

/**
 * Helper de un solo paso para descargas automáticas fiables (GLB, ZIP, PY, JSON).
 * Limpia el blobUrl automáticamente tras 10 minutos para no cortar descargas lentas.
 */
export async function downloadBytesReliably(
  data: Blob | Uint8Array | ArrayBuffer | string,
  filename: string,
  mimeType = 'application/octet-stream'
): Promise<PreparedDownload> {
  const prepared = await stageAndPrepareDownload(data, filename, mimeType);
  initiateDownload(prepared);
  setTimeout(() => prepared.cleanup(), 10 * 60 * 1000);
  return prepared;
}

// ============================================================================
// EMPAQUETADOR ZIP REAL (Store mode + CRC32 + UTF-8, sin dependencias externas)
// ============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear()) - 1980;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    time: ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f),
    date: ((year & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f),
  };
}

export interface ZipFileEntry {
  path: string;
  bytes: Uint8Array;
}

/**
 * Construye un archivo .ZIP estándar (sin compresión / Store, ideal para GLB ya
 * binarios/comprimidos) en memoria y devuelve su Blob listo para descargar.
 */
export function buildStoreZipBlob(entries: ZipFileEntry[]): Blob {
  const encoder = new TextEncoder();
  const dos = getDosDateTime();
  const parts: BlobPart[] = [];
  const centralRecords: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanPath = entry.path.replace(/^[\\/]+/, '').replace(/\\/g, '/');
    const nameBytes = encoder.encode(cleanPath);
    const data = entry.bytes;
    const crc = crc32(data);

    // Local file header (30 bytes + name)
    const lfh = new Uint8Array(30 + nameBytes.length);
    const lfv = new DataView(lfh.buffer);
    lfv.setUint32(0, 0x04034b50, true); // signature
    lfv.setUint16(4, 20, true); // version needed 2.0
    lfv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lfv.setUint16(8, 0, true); // compression: 0 (store)
    lfv.setUint16(10, dos.time, true);
    lfv.setUint16(12, dos.date, true);
    lfv.setUint32(14, crc, true);
    lfv.setUint32(18, data.byteLength, true);
    lfv.setUint32(22, data.byteLength, true);
    lfv.setUint16(26, nameBytes.length, true);
    lfv.setUint16(28, 0, true);
    lfh.set(nameBytes, 30);

    // Copy data view safely into an owned ArrayBuffer slice for BlobPart
    const dataCopy = new Uint8Array(data.byteLength);
    dataCopy.set(data);
    parts.push(lfh.buffer, dataCopy.buffer);

    // Central directory header (46 bytes + name)
    const cdh = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cdh.buffer);
    cdv.setUint32(0, 0x02014b50, true); // signature
    cdv.setUint16(4, 20, true); // version made by
    cdv.setUint16(6, 20, true); // version needed
    cdv.setUint16(8, 0x0800, true); // UTF-8 flag
    cdv.setUint16(10, 0, true); // store
    cdv.setUint16(12, dos.time, true);
    cdv.setUint16(14, dos.date, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, data.byteLength, true);
    cdv.setUint32(24, data.byteLength, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true); // relative offset of local header
    cdh.set(nameBytes, 46);
    centralRecords.push(cdh);

    offset += lfh.byteLength + data.byteLength;
  }

  let centralSize = 0;
  for (const rec of centralRecords) {
    parts.push(rec.buffer as ArrayBuffer);
    centralSize += rec.byteLength;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eov = new DataView(eocd.buffer);
  eov.setUint32(0, 0x06054b50, true);
  eov.setUint16(4, 0, true);
  eov.setUint16(6, 0, true);
  eov.setUint16(8, entries.length, true);
  eov.setUint16(10, entries.length, true);
  eov.setUint32(12, centralSize, true);
  eov.setUint32(16, offset, true);
  eov.setUint16(20, 0, true);
  parts.push(eocd.buffer);

  return new Blob(parts, { type: 'application/zip' });
}
