import { generateMonsterGlb, type MonsterInfo, type MonsterTier } from './enemyGenerator';
import {
  buildStoreZipBlob,
  downloadBytesReliably,
  type ZipFileEntry,
} from '../utils/reliableDownload';

export interface BatchProgress {
  done: number;
  total: number;
  current: string;
  etaSeconds?: number;
}

export interface BatchEntry {
  key: string;
  tier: MonsterTier;
  mb: number;
  error?: string;
}

export interface BatchSink {
  kind: 'folder' | 'download';
  dirHandle?: FileSystemDirectoryHandle;
  writeFile: (tier: MonsterTier, category: string, filename: string, bytes: Uint8Array) => Promise<void>;
  finish: (entries: BatchEntry[]) => Promise<void>;
}

export function canPickFolder(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function folderSink(): Promise<BatchSink> {
  const picker = (window as unknown as { showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  const rootHandle = await picker({ mode: 'readwrite' });
  const subDir = await rootHandle.getDirectoryHandle('monstruos_salon3d', { create: true });

  return {
    kind: 'folder',
    dirHandle: subDir,
    async writeFile(tier, category, filename, bytes) {
      const tierDir = await subDir.getDirectoryHandle(tier, { create: true });
      const safeCat = category.replace(/[^a-z0-9_-]/gi, '_');
      const catDir = await tierDir.getDirectoryHandle(safeCat, { create: true });
      const fileHandle = await catDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes as unknown as BufferSource);
      await writable.close();
    },
    async finish(entries) {
      const csvLines = [
        'key,tier,mb,error',
        ...entries.map((e) => `${e.key},${e.tier},${e.mb.toFixed(3)},${e.error || ''}`),
      ];
      const fileHandle = await subDir.getFileHandle('indice.csv', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(new TextEncoder().encode(csvLines.join('\n')) as unknown as BufferSource);
      await writable.close();
    },
  };
}

export function zipSink(): BatchSink {
  const files: ZipFileEntry[] = [];
  const MAX_CHUNK_BYTES = 60 * 1024 * 1024; // Partir en lotes de ~60 MB para no saturar RAM ni servidor
  let chunkBytes = 0;
  let partIndex = 1;

  const flushPart = async (suffix?: string) => {
    if (files.length === 0) return;
    const zipBlob = buildStoreZipBlob(files);
    const name = suffix
      ? `monstruos_celshade_${suffix}.zip`
      : partIndex > 1
        ? `monstruos_celshade_parte${partIndex}.zip`
        : 'monstruos_celshade.zip';
    await downloadBytesReliably(zipBlob, name, 'application/zip');
    files.length = 0;
    chunkBytes = 0;
    partIndex++;
  };

  return {
    kind: 'download',
    async writeFile(tier, category, filename, bytes) {
      const safeCat = category.replace(/[^a-z0-9_-]/gi, '_');
      if (chunkBytes > 0 && chunkBytes + bytes.byteLength > MAX_CHUNK_BYTES) {
        await flushPart();
      }
      files.push({ path: `${tier}/${safeCat}/${filename}`, bytes });
      chunkBytes += bytes.byteLength;
    },
    async finish(entries) {
      const csvLines = [
        'key,tier,mb,error',
        ...entries.map((e) => `${e.key},${e.tier},${e.mb.toFixed(3)},${e.error || ''}`),
      ];
      files.push({
        path: 'indice.csv',
        bytes: new TextEncoder().encode(csvLines.join('\n')),
      });
      await flushPart();
    },
  };
}

export async function exportMonstersBatch(
  monsters: MonsterInfo[],
  tiers: MonsterTier[],
  sink: unknown,
  onProgress: (p: BatchProgress) => void,
  isCancelled: () => boolean
): Promise<{ entries: BatchEntry[]; cancelled: boolean }> {
  const activeSink = (sink as BatchSink) || zipSink();
  const entries: BatchEntry[] = [];
  const total = monsters.length * tiers.length;
  let done = 0;
  const tStart = performance.now();

  for (const tier of tiers) {
    for (const m of monsters) {
      if (isCancelled()) {
        return { entries, cancelled: true };
      }
      onProgress({
        done,
        total,
        current: `${m.name} (${tier})`,
        etaSeconds:
          done > 0
            ? ((performance.now() - tStart) / 1000 / done) * (total - done)
            : undefined,
      });

      try {
        const res = await generateMonsterGlb(m.key, tier);
        const mb = res.bytes.byteLength / (1024 * 1024);
        await activeSink.writeFile(tier, m.categoryLabel, res.filename, res.bytes);
        entries.push({ key: m.key, tier, mb });
      } catch (err) {
        entries.push({
          key: m.key,
          tier,
          mb: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      done++;
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  onProgress({ done: total, total, current: 'Completado' });
  await activeSink.finish(entries);
  return { entries, cancelled: false };
}
