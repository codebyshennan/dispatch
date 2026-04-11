import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tests must run with cwd = monorepo root, same as the server.
// Both kb-index.ts (INDEX_DIR) and generate.ts (prompts/) use process.cwd().
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(monorepoRoot);
