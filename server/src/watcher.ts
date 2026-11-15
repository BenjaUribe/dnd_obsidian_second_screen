import chokidar, { FSWatcher } from 'chokidar';
import fs from 'fs';
import path from 'path';
import { parseVault } from './parser';
import { VaultState } from './types';

export type VaultUpdateCallback = (state: VaultState, event: string, filePath: string) => void;

export class VaultWatcher {
  private vaultPath: string;
  private watcher: FSWatcher | null = null;
  private currentState: VaultState;
  private listeners: Set<VaultUpdateCallback> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
    this.currentState = parseVault(this.vaultPath);
  }

  public getState(): VaultState {
    return this.currentState;
  }

  public refresh(changedFile?: string): VaultState {
    try {
      const nextState = parseVault(this.vaultPath, changedFile);
      this.currentState = nextState;
      return this.currentState;
    } catch (err) {
      console.error(
        `[Watcher] Error al parsear bóveda (${changedFile ?? 'manual'}); conservando último estado válido:`,
        err
      );
      return this.currentState;
    }
  }

  public onUpdate(cb: VaultUpdateCallback): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public start(): void {
    if (this.watcher) return;

    console.log(`[Watcher] Observando bóveda en modo lectura: ${this.vaultPath}`);

    this.watcher = chokidar.watch(this.vaultPath, {
      ignored: [
        /(^|[\/\\])\../, // Ignorar dotfiles como .obsidian
        /node_modules/,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 50,
      },
    });

    const handleFileEvent = (event: 'add' | 'change' | 'unlink', fullPath: string) => {
      if (!fullPath.toLowerCase().endsWith('.md')) return;

      const relativePath = path.relative(this.vaultPath, fullPath).replace(/\\/g, '/');

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(() => {
        try {
          // Evitar lecturas transitorias si el archivo quedó momentáneamente vacío (0 bytes) durante una reescritura
          if (event !== 'unlink') {
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size === 0) {
                console.warn(
                  `[Watcher] Archivo temporalmente vacío (${relativePath}); esperando escritura completa.`
                );
                return;
              }
            } catch {
              return;
            }
          }

          console.log(`[Watcher] Evento '${event}' detectado en: ${relativePath}`);
          const nextState = this.refresh(relativePath);
          for (const listener of this.listeners) {
            listener(nextState, event, relativePath);
          }
        } catch (err) {
          console.error(`[Watcher] Error al re-parsear tras cambio en ${relativePath}:`, err);
        }
      }, 60);
    };

    this.watcher
      .on('add', (fp) => handleFileEvent('add', fp))
      .on('change', (fp) => handleFileEvent('change', fp))
      .on('unlink', (fp) => handleFileEvent('unlink', fp))
      .on('error', (err) => console.error('[Watcher] Error en chokidar:', err));
  }

  public async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}

