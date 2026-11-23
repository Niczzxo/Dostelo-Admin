# Design Tokens: Extraction Notes (Migration Stage 1)

Source of truth: `apps/storefront/public/legacy/index.html`, the preserved
legacy storefront. Every value in `tokens.css` and `tokens.ts` was copied
from that file programmatically. Nothing was guessed or approximated.

## Theme blocks

- Light theme selector: `:root`
  - 17 custom properties: `--bg`, `--panel`, `--surface`, `--surface2`,
    `--ink`, `--body`, `--muted`, `--line`, `--dark`, `--dark2`,
    `--on-dark`, `--on-dark-mut`, `--chip`, `--shadow`, `--r-lg`,
    `--r-md`, `--r-sm`.
  - Also declares `color-scheme: light`.
- Dark theme selector: `:root[data-theme="dark"]`
  - 14 custom properties: the same colour and shadow tokens with dark
    values. It does not redefine the radius tokens, so `--r-lg` (28px),
    `--r-md` (20px) and `--r-sm` (14px) carry over from `:root`.
  - Also declares `color-scheme: dark`.

## Theme behaviour

- Default: `data-theme="light"` on the `<html>` element, set before first
  paint.
- Persistence key: `dostelo-theme` in localStorage. The legacy source
  reads it with `localStorage.getItem('dostelo-theme')` and writes it with
  `localStorage.setItem('dostelo-theme', t)`, accepting only the values
  `light` and `dark`.
- The legacy CSS carries this comment above the dark block, quoted here
  because it defines the intended behaviour:

  > Dark theme - the same two colours, inverted: warm black #1C1B17
  > becomes the ground and off-white #F4F2ED the ink; every other value
  > is a tint or shade of those two, nothing new introduced. It applies
  > ONLY when the visitor toggles it in the navbar (data-theme="dark",
  > set by the toggle or restored from their saved choice) - never from
  > prefers-color-scheme or any other automatic override.

## Keyframes present in the legacy CSS

Found by scanning the legacy `<style>` block for `@keyframes` rules:

- `sway`
- `fadeRise`
- `dropIn`
- `slideIn`
- `lineUp`
- `viewIn`
- `nw-search-in`
- `hotPulse`

These names are the complete list. Keyframe bodies stay in the legacy
source for now and are ported feature by feature during Migration
Stage 3; this package carries the theme tokens only.

## Colour anchors

- Light ground: `--bg: #F4F2ED` (off-white).
- Dark ground: `--bg: #1C1B17` (warm black).
- The two themes are inversions of the same two brand colours, matching
  the storefront rule that everything is a tint or shade of #F4F2ED and
  #1C1B17.
