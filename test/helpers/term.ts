/**
 * A terminal just big enough to catch redraw bugs: it models line wrapping,
 * cursor-up (CUU) and erase-to-end-of-screen (ED0), which is all the live view uses.
 * Wrapping is the point -- a renderer that counts logical lines instead of the
 * physical rows they occupy will leave stale rows behind, and only a screen model
 * that wraps can see that.
 */
export class FakeTerm {
  readonly rows: string[] = [];
  cursor = 0;

  constructor(readonly columns: number) {}

  /** Visible width, ignoring SGR colour codes. */
  static width(s: string): number {
    return [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
  }

  private putLine(line: string, advance: boolean): void {
    const v = line.replace(/\x1b\[[0-9;]*m/g, '');
    const pieces: string[] = [];
    for (let i = 0; i < v.length; i += this.columns) pieces.push(v.slice(i, i + this.columns));
    if (pieces.length === 0) pieces.push('');
    for (const [i, piece] of pieces.entries()) {
      this.rows[this.cursor] = piece;
      if (advance || i < pieces.length - 1) this.cursor += 1;
    }
  }

  private flush(buf: string): void {
    if (buf === '') return;
    const parts = buf.split('\n');
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      if (last && part === '') return;
      this.putLine(part, !last);
    });
  }

  write(s: string): void {
    let buf = '';
    let i = 0;
    while (i < s.length) {
      const m = /^\x1b\[(\d*)([AJ])/.exec(s.slice(i));
      if (m) {
        this.flush(buf);
        buf = '';
        if (m[2] === 'A') this.cursor = Math.max(0, this.cursor - Number(m[1] || '1'));
        else this.rows.length = this.cursor; // ED0: erase from cursor to end of screen
        i += m[0].length;
        continue;
      }
      buf += s[i];
      i += 1;
    }
    this.flush(buf);
  }

  /** The stream a renderer writes to. */
  get stream(): NodeJS.WriteStream {
    return {
      isTTY: true,
      columns: this.columns,
      write: (s: string) => {
        this.write(s);
        return true;
      },
    } as unknown as NodeJS.WriteStream;
  }

  screen(): string[] {
    return [...this.rows];
  }

  countMatching(re: RegExp): number {
    return this.rows.filter((r) => re.test(r)).length;
  }
}
