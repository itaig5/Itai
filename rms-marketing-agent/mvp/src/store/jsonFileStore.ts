// Dev persistence: the demo world survives Next.js hot reloads / restarts by writing the
// whole state to a JSON file on every mutation (dev-scale data; simple and inspectable).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { MemoryStore, type RevPilotState } from './store.ts';

export class JsonFileStore extends MemoryStore {
  private file: string;

  constructor(file: string, initial: RevPilotState) {
    super(initial);
    this.file = file;
    this.persist();
  }

  /** Load from disk if present, otherwise seed with `fallback()` and persist it. */
  static load(file: string, fallback: () => RevPilotState): JsonFileStore {
    if (existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as RevPilotState;
        return new JsonFileStore(file, raw);
      } catch {
        // corrupted dev file — reseed rather than crash the dashboard
      }
    }
    return new JsonFileStore(file, fallback());
  }

  protected override persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.state), 'utf8');
  }
}
