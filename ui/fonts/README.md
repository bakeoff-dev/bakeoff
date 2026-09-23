# Inlined fonts

`ui/index.html` carries Geist and Geist Mono as base64 `woff2` inside its `<style>` block,
rather than a Google Fonts `<link>`. A scoreboard exported to `.bakeoff/runs/<id>.html` is
opened from `file://`, often with no network, and a link would silently fall back to
`system-ui` -- a different metric, so the 1200px column reflows and every screenshot in
the README stops matching what a user sees.

Both faces are the **latin subset only** (`U+0000-00FF` plus the punctuation and symbol
ranges Google ships with it). Geist is the **variable** face: one file covers 400-700,
which is every weight the UI asks for (400 body, 500 labels, 600 stats, 700 scores).
Geist Mono ships 400, the only weight the log drawer and the command chip use.

Cost: **+52,330 bytes** on `dist/ui.html` (281,046 -> 333,376, +18.6%). woff2 is already
compressed, so base64 gains little from gzip: 83 KB -> 124 KB gzipped.

Both are licensed under the SIL Open Font License 1.1, which permits embedding.

## Refreshing them

Google serves `woff2` only to a browser user-agent, and `ttf` to anything else:

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400"
```

Take the two `src:` URLs whose `unicode-range` begins `U+0000-00FF`, download them, base64
each, and replace the payloads in the two `@font-face` rules in `ui/index.html`.
