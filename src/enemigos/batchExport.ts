import { generateMonsterGlb, type MonsterInfo, type MonsterTier } from './enemyGenerator';

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
  return {
    kind: 'download',
    async writeFile(_tier, _category, filename, bytes) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      }, 4000);
    },
    async finish() {
      // Completed individual downloads
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
