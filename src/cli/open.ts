import { exec, type Exec } from '../core/exec';

/** Per-platform opener. Everything that shells out goes through `exec`, including this. */
export function openCommand(platform: NodeJS.Platform = process.platform): [string, string[]] {
  if (platform === 'darwin') return ['open', []];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '']];
  return ['xdg-open', []];
}

/** Best effort: a browser that will not open is not a reason to stop a race. */
export async function openInBrowser(url: string, run: Exec = exec): Promise<boolean> {
  const [cmd, args] = openCommand();
  try {
    const r = await run(cmd, [...args, url]);
    return r.code === 0;
  } catch {
    return false;
  }
}
