import type { Exec, ExecResult } from '../../src/core/exec';

export function fakeExec(table: Array<[RegExp, Partial<ExecResult>]>) {
  const calls: string[] = [];
  const run: Exec = async (cmd, args) => {
    const line = [cmd, ...args].join(' ');
    calls.push(line);
    const hit = table.find(([re]) => re.test(line));
    if (!hit) throw new Error(`fakeExec: no response for "${line}"`);
    return { code: 0, stdout: '', stderr: '', ...hit[1] };
  };
  return { run, calls };
}
