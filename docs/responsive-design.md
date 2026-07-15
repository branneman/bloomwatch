# Responsive design — Bloomwatch (story 706)

_The permanent reference for how Bloomwatch reflows across screen sizes — implemented by story 706._

This is the layout spec story 706 implements. It does **not** invent a new visual
language — it takes the existing Bloomwatch UI (one bordered reading column, purple
accent, judgement R/O/G, system font, flat borders-over-shadows) and defines how it
reflows from a 360px phone up to a 1920px desktop.

---

## 1. Principles

1. **Mobile-first, progressive enhancement.** Base CSS targets the smallest supported
   phone (360px). Every `@media` rule uses `min-width` and _adds_ capability for more
   space. There is no max-width media query walking a desktop layout back down.
2. **One reading column, capped — never ultrawide.** The whole app remains the existing
   centered, bordered `#root` column. Its content caps at **1126px** (today's value); on
   monitors wider than that the column stops growing and the extra width becomes gutters.
   We do **not** support ultrawide by spreading content edge-to-edge. Treat **1920px** as
   the widest layout worth designing for; 2560/3440 just get bigger gutters.
3. **Fluid over pixel-perfect.** Mobile is fragmented — the top five phone resolutions are
   only ~35% of usage. Design to _ranges_, verify at representative widths, use relative
   units.
4. **Respect the reader (the 100% easy-2-read standard).** Honor the user's browser default
   font size; never impose smaller. Never block pinch-zoom.

---

## 2. Breakpoints

Mobile-first `min-width` breakpoints. Names are conventions for the codebase, not framework
tokens.

| Token | `min-width` | Devices it serves (2026 usage)                               | What turns on                                                                           |
| ----- | ----------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| base  | `0`         | Phones: **360 / 390 / 393** (≈60% of mobile). Floor **360**. | Single column; everything stacked; full-width controls.                                 |
| sm    | `600px`     | Large phones landscape, small tablets portrait               | Widget grid → **2 cols**; form field + button inline; rate-limit meter beside its copy. |
| md    | `768px`     | Tablets portrait — iPad 768, base iPad 810/820               | Larger gutters; boss-row metadata all inline.                                           |
| lg    | `1024px`    | Tablet landscape / small laptops (1366×768 → ~1366 CSS)      | Widget grid → **3 cols**; single-fight overview fits with no scroll.                    |
| xl    | `1280px`    | Laptops & desktops — 1536, **1920** (≈half of desktop share) | Reading column reaches its 1126px max; surplus → gutters.                               |

```css
/* the only breakpoints in the app */
@media (min-width: 600px) {
  /* sm */
}
@media (min-width: 768px) {
  /* md */
}
@media (min-width: 1024px) {
  /* lg */
}
@media (min-width: 1280px) {
  /* xl */
}
```

**Test matrix:** 360, 390, 768, 1024, 1280, and **1536×864** (a 1920×1080 panel at 125%
Windows scaling — now one of the most common desktop _CSS_ viewports and prone to sub-pixel
rounding bugs). Test both orientations on phone/tablet.

### Why these numbers (sources)

- Desktop is concentrated: **1920×1080** leads (~half the desktop market with 1366×768).
  Windows display scaling means many 1080p laptops report **1536×864** CSS.
- Mobile clusters at **360×800** (Samsung), **390×844** (iPhone 14/15/16), **393×852** —
  together ~60% of mobile. The smallest modern iPhone (13 mini / 12 mini / SE) is **375**
  CSS-wide, so a **360** floor covers it plus common Androids.
- Tablets: **768×1024** (iPad) is the enduring anchor; base iPads 810/820.

---

## 3. The three reflow archetypes

Every screen in the flow (onboarding, report input, druid picker, whole-report dashboard,
per-fight scorecard, per-epic detail) is one of three layouts. Get these right and the app
is covered.

### A. Form (report input, connect, client-ID)

- Base: field and its action **stacked**, both full-width.
- `sm`+: field and button sit on **one row**, button hugs its content, field flexes.

```css
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}
.form .primary {
  width: 100%;
}
@media (min-width: 600px) {
  .form {
    flex-direction: row;
    align-items: flex-end;
  }
  .form .field {
    flex: 1;
  }
  .form .primary {
    width: auto;
  }
}
```

### B. Widget grid (whole-report & single-fight dashboards) — the key reflow

- Base **1 col** → `sm` **2 cols** → `lg` **3 cols**. Never a fixed pixel column count.
- 701's "whole scorecard, no scrolling" goal holds **from `lg` up** (the 3-col grid fits one
  view). On phones that constraint is impossible and correct behavior is to **stack and
  scroll** — do not shrink widgets to fit; keep each readable.

```css
.widgets {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 600px) {
  .widgets {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
}
@media (min-width: 1024px) {
  .widgets {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

### C. Metric rows (per-epic detail)

- The metric header (**title · value · Good/Fair/Bad chip**) is a `flex-wrap` row: on a
  phone the title takes the full line and value+chip wrap beneath; from `sm` they share one
  line. Progress bars and histograms are always full-width of the card.

```css
.metric-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 10px;
}
.metric-head .title {
  flex: 1 1 auto;
}
```

Boss-list rows use the same wrap trick: the boss name is `flex: 1 1 100%` at base (metadata
drops below it), `flex: 1 1 auto` from `sm` (everything inline).

---

## 4. Typography

- **Root at 100%.** `html { font-size: 100%; }` and size everything in `rem`/`em`. This is
  Reichenstein's _100% Easy-2-Read Standard_ (2006): the browser default (~16px, and
  whatever the user has personally set) wins. Never define body below 100%.
- **Body stays 18px / line-height 1.45** — the app's existing size, already above the 16px
  floor and right for a text-heavy analysis tool (the 18–24px band for long-form reading).
  Keep line-height ≥ **1.5** on multi-line prose (WCAG 1.4.12).
- **Measure 50–75 characters** (~65 ideal; ~35–40 on phones). Cap prose with `max-width:
65ch`; don't let paragraphs run the full width of a wide column.
- **Scale headings toward body on small screens.** A desktop H1 several times body size just
  pushes content off a phone. Compress the scale and lean on weight / uppercase / spacing for
  hierarchy instead of size.

---

## 5. Touch, input & accessibility

- **44px minimum touch target** on every button, link-styled-as-button, list row, tab, and
  disclosure toggle (48px is comfortable on Android). Add padding rather than shrinking text.
- **Inputs must be ≥ 16px (`1rem`).**
  > ⚠ **Known issue to fix in 706:** the design-system `Input` and `Button` render at **15px**.
  > Any `<input>` below 16px triggers **iOS Safari's auto-zoom on focus**, which yanks and
  > reflows the layout — the most common, least-diagnosed mobile form bug. Bump form-control
  > font-size to `16px` app-wide. (Display/label text can stay as-is; this is specifically
  > about focusable fields.)
- **Never block zoom.** Viewport is exactly `width=device-width, initial-scale=1`. Do **not**
  add `maximum-scale` or `user-scalable=no` — users must reach 200% (WCAG 1.4.4).
- **Motion.** Honor `prefers-reduced-motion`; keep the app's short 120–200ms opacity/color
  fades and nothing more.
- **Contrast** stays WCAG AA (4.5:1 body / 3:1 large) in both light and dark — already met by
  the token palette; re-check any new low-emphasis text you add on small screens.

---

## 6. App shell

```css
:root {
  --gutter: 16px;
  --content-max: 1126px;
}

.app {
  max-width: var(--content-max);
  margin-inline: auto;
  border-inline: 1px solid var(--border); /* the app's signature bordered column */
  min-height: 100vh;
}
.main {
  padding: 20px var(--gutter) 56px;
} /* base gutters */
@media (min-width: 768px) {
  .main {
    padding: 28px 32px 64px;
  }
}
@media (min-width: 1280px) {
  .main {
    padding: 40px 32px 72px;
  }
}
```

Gutters grow with the viewport; the column width does not exceed `--content-max`. Flat borders,
no shadow — unchanged from the desktop app.

---

## 7. Per-screen checklist (acceptance)

Each flow screen must be verified at 360 / 768 / 1280, both orientations on touch:

- [ ] **Onboarding (705)** — prose caps at ~65ch; the rotation-game link and "skip/about" are
      ≥44px; hero doesn't require scrolling past the fold to reach the primary action.
- [ ] **Report input (002)** — form archetype A; input is 16px (no iOS zoom); rate-limit
      banner (009) reflows (meter above copy on phone).
- [ ] **Druid picker (005)** — radio rows are full-width, ≥44px tall, label + cast-count wrap.
- [ ] **Whole-report dashboard (702)** — archetype B (1→2→3 col); per-boss rows are archetype
      C wrap; clickable immediately before aggregates resolve.
- [ ] **Single-fight scorecard (701)** — archetype B; no-scroll overview holds from `lg`;
      stacks and scrolls on phone without shrinking widgets.
- [ ] **Per-epic detail** — archetype C metric rows; progress bars/histograms full-width;
      "why this threshold?" disclosure toggle ≥44px.
- [ ] **Error overlay (708) & rate-limit banner (009)** — usable and legible at 360px.

---

## 8. Out of scope / non-goals

- No ultrawide (>1920) layout — column caps, gutters absorb the rest.
- No hamburger nav / off-canvas drawer — the app is a short linear flow with a hash router;
  there is no persistent nav to collapse.
- No separate mobile codebase or `.mobile` component variants — one component tree, CSS
  breakpoints only.
- No `user-scalable=no`, no font sizes expressed only in `px` for body copy.
