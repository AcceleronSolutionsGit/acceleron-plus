# The interface

What the app looks like, and why it looks like that. Read this before
changing a colour or adding a component — most of the decisions below
exist to stop a specific thing going wrong.

---

## Setup

```bash
npm install
```

Three new dependencies, all fonts. Nothing else changed.

---

## The brand, as an interface

The logo gives two colours and one shape, and all three are used
literally.

| | |
|---|---|
| **Navy `#212f60`** | the wordmark. Text, the sidebar, primary actions. |
| **Red `#de1e24`** | the chevron. An accent, nothing else. |
| **The chevron** | the signature motif. |

The red is the rule. It marks **the active nav item**, **the active
tab**, **the rule beside a section heading**. It is not used for errors — `--color-danger` is a separate,
warmer `#c0392b`, because a form error should not look like the company
logo. Spend the red anywhere else and it stops meaning "you are here".

### The logos

`public/` now holds derived artwork alongside the two supplied files:

| File | What it is |
|---|---|
| `logo-wordmark.png` | the supplied logo, background removed, trimmed |
| `logo-wordmark-light.png` | knockout for navy surfaces; the chevron stays red |
| `favicon-64.png`, `apple-icon.png`, `icon-512.png` | app icons |

The **mark** — the ring with the chevron in its gap — is *drawn in SVG*
inside `Logo.tsx` rather than loaded from the supplied PNG. That PNG is
240px wide and goes soft the instant it is scaled, and the mark is used
at 28px in the collapsed rail and at 512px as an app icon. As SVG it is
sharp at both ends, takes `currentColor`, and can be animated — which is
what the sign-in screen does with it.

```tsx
<Logo />                              // mark + wordmark
<Logo variant="mark" />               // the ring alone
<Logo variant="wordmark" tone="light" />  // knockout, for navy
```

The wordmark carries `self-start shrink-0` internally. That is not
decoration: dropped into a flex column the image is a flex item, and the
default `align-items: stretch` blows an `h-8 w-auto` logo out to the
full column width — which squashes the logotype flat. It did, and this
is the fix.

---

## Type

Three faces, self-hosted.

| | | |
|---|---|---|
| **League Spartan** | display | Geometric, and it echoes the wordmark's construction. Headings, figures, the product name. |
| **IBM Plex Sans** | body | Replaces Inter. It has character, and — the reason it was chosen — real tabular numerals, in an app that is mostly money and hours. |
| **IBM Plex Mono** | codes | `PRJ-0001`, `WBS-003`, ticket numbers, the sign-in code. |

They ship with the app via `@fontsource`, imported at the top of
`globals.css`. They used to come from `next/font/google`, which meant
**every production build had to reach fonts.googleapis.com** — and on a
machine that could not, `next build` failed with an error that pointed
at CSS rather than at the network. That failure is now gone for good.

`--font-league-spartan` and `--font-inter` still resolve, because forty
files already write `font-[family-name:var(--font-league-spartan)]`.
They are aliases onto the new faces, so nothing had to be touched page
by page — and `--font-inter` deliberately no longer means Inter.

Tabular figures are switched on for `table`, `[data-numeric]`,
`.tabular`, number and date inputs, and `<time>`, so a 1 occupies the
same width as a 7 and a column of rupees actually lines up.

---

## Surfaces and depth

Three levels rather than one flat grey: `--color-canvas` sits back,
`--color-surface` comes forward, `--color-surface-2/3` sit between. The
page background carries two barely-visible radial gradients — flat
`#eee` is the most obviously untouched thing an interface can do.

Shadows are tinted with the brand navy instead of pure black, so they
belong to the same colour world as everything else, and there is **one**
easing curve (`--ease-out-soft`) for everything that moves. Mixed easing
is what makes an interface feel assembled rather than designed.

`prefers-reduced-motion` turns all of it off.

---

## Components

`src/components/ui/` — eleven files, all reworked. The additions:

| | |
|---|---|
| `Button` | `loading` (spinner, keeps its width so nothing shifts), `block`, `subtle` variant, `IconButton` |
| `Card` | `interactive`, `accent`, plus `SectionHeading` and `EmptyState` |
| `Badge` | tinted by default, `solid` when it really is an alarm, `dot`, plus `CodeChip` |
| `Input` | one field shell shared by `Input`, `Textarea`, `Select`, `Checkbox` — same height, same focus ring, same error slot |
| `Table` | `numeric` columns, `stickyHeader`, `dense`, plus `FieldRow` |
| `Tabs` | sliding indicator, arrow-key navigation, plus `SegmentedControl` |
| `Avatar` | deterministic colour per name, `status` pip, plus `AvatarStack` |
| `ProgressBar` | `target` marker, plus `ProgressRing` |
| `Modal` | focus trap, focus restore, sizes, `aria-modal` |

### Two decisions worth keeping

**Badges are tinted, not filled.** A project list shows a status on
every row; filled chips down a whole column make every row shout, and
once every row shouts the one that needs attention is invisible.
`src/lib/utils.ts` now returns tinted pairs from `projectStatusColor`,
`ticketStatusColor`, `milestoneStatusColor`, `riskStatusColor` and
`impactColor` — one change, every table in the app.

**Table headers are light.** The solid navy header bar competed with the
sidebar for weight and made every table look like the most important
thing on screen.

---

## The shell

**Sidebar** — a navy gradient with a red hairline down its outer edge,
and the lockup reading `acceleron SOLUTIONS │ Plus`, the rule
keeping the product name from being mistaken for part of the logo.
Collapsed state persists in `localStorage` (read in an effect, not
during render, so the server HTML matches). Collapsed, section labels
become rules rather than blank space — the grouping is information and
should survive collapsing — and each item grows a tooltip.

**Top bar** — breadcrumbs derived from the path, replacing the product
name that used to sit there telling nobody anything they did not
already know. Every step but the last is a link. Translucent and
blurred, so content scrolling underneath is felt rather than cut off.

**Sign-in** — a split screen: identity on the left with the chevron
tiled as a fine engraved pattern, the form on the right. Below `lg` the
left panel folds away; on a phone the job is to sign in, not to be
impressed. The code entry is now six boxes drawn under one transparent
input — six *real* inputs wired together breaks paste, breaks the iOS
"from Messages" autofill, and gives a screen reader six unlabelled
fields.

---

## Verified

**Build.** `next build` completes with no network access, no font stub,
no workaround. That was a recurring blocker and it is gone.

**Types.** `tsc --noEmit` clean.

**Every role, signed in for real**, against live Postgres in a real
Chromium at 1440×900:

- **Admin** — projects, lead pipeline, master data, service desk. Status
  chips tinted, breadcrumbs correct, red marker on the active tab and
  the active nav item.
- **Member** — my tasks, timesheet, skills. The timesheet grid renders,
  today's column is marked, the week total reads 7.5h.
- **Client** — lands on the portal, sees progress and milestones, no
  rupee symbol anywhere on the page.

No console errors on any page except one `Failed to fetch` raised by the
test navigating away mid-request.

**A real bug found and fixed while looking.** The wordmark was rendering
528×32 against a natural 597×151 — stretched flat — because it was a
flex item being stretched to its column. Caught by measuring the
rendered box rather than by looking at the screenshot.

**Dates on the portal** were printing as `2027-03-31`. They now use a
new `formatISODate` in `src/lib/dates.ts`, which reads the calendar
parts straight out of the string instead of going through
`new Date(...).toLocaleDateString()` — the same UTC round trip that
caused the off-by-one this module was written to stop.

Not verified here: print styles, and the app below 640px. The shell and
sign-in screen are responsive; the dense data tables are not, and were
not before.
