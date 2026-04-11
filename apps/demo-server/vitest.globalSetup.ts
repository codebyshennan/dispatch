import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, '../..');

let serverProcess: ChildProcess | null = null;

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

export async function setup(): Promise<void> {
  // Kill any existing server on port 3001
  try {
    const { execSync } = await import('node:child_process');
    execSync('lsof -ti :3001 | xargs kill -9 2>/dev/null || true', { shell: '/bin/sh' });
  } catch {}
  await new Promise(r => setTimeout(r, 1000));

  const tsx = resolve(monorepoRoot, 'apps/demo-server/node_modules/.bin/tsx');
  const envFile = resolve(monorepoRoot, '.env');

  serverProcess = spawn(
    tsx,
    ['--env-file', envFile, 'apps/demo-server/src/index.ts'],
    {
      cwd: monorepoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  serverProcess.stdout?.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));

  await waitForServer('http://localhost:3001/health', 60_000);
}

export async function teardown(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}
