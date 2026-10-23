# Code Akos dashboard: design system

Dark-only, minimalist, Vercel/Supabase-style. Built on **shadcn/ui** (Radix primitives) + **Tailwind v4**.
Components live in `web/src/components/ui/` (shadcn source, owned by this repo); product components in `web/src/components/`.

## 1. Foundations

- **Consistency over creativity.** Everything is a shadcn primitive or a thin composition of one. No bespoke dialogs, selects or switches.
- **Data is the loud part.** Chrome is near-neutral (gray with the icon's slight navy tint); the only saturated pixels are status icons, chart marks and the app icon.
- **No pills.** A state is an icon and a word as plain text (`StateLabel`), never a capsule around it. Tags are small square chips (`rounded-sm`). The shadcn `Badge` is removed so a pill can't creep back in.
- **Never color alone.** Status is icon + label (see §4). Verified, not assumed: the validator gives running↔crashed a deutan ΔE of 4.1 (fail), so shape carries the meaning.
- **Dark only.** The app is an ops tool; one theme, fully validated, rather than two half-checked ones.

## 2. Tokens

The base is shadcn's `neutral` dark theme, shifted toward the app icon: its navy (`#090a12`) for the page, its white (`#f7f8fa`) for text and its blue (`#2589fe`) for data. Every shadcn component still renders correctly with no overrides. The icon itself is `web/public/icon.png` (cut from the 1024 px master, transparent outside its rounded square); the docs, the setup window and the desktop build use copies of it. On the dark UI the icon's tile is the same navy as the page, so headers use `mark.png`, the chevrons and A alone on transparency; the tile is for favicons, the app icon and light backgrounds.

| Token | Value | Use |
|---|---|---|
| `--background` | `#090a12` | page (the icon's navy) |
| `--card` / `--popover` | `#12141d` | tiles, table, dialogs, sheet. **The surface every data color is validated against** |
| `--border` | `rgb(255 255 255 / 10%)` | all hairlines |
| `--input` | `#6d7182` | field borders (3.8:1 on card; WCAG 1.4.11 needs 3:1) |
| `--foreground` | `#f7f8fa` | primary text (the icon's white) |
| `--muted-foreground` | `#a3a7b3` | secondary text, labels |
| `--primary` | `#e8eaf0` on `#12141d` | primary buttons (white-on-dark, Vercel style) |
| `--destructive` | `#e5484d` | delete only |
| `--ring` | `#d3d6de` | focus ring; shadcn draws it at 50% alpha = 4.0:1 effective on card |
| `--radius` | `0.5rem` | cards 8px, controls 6px |
| `--chart-1` | `#2589fe` | pipeline bars, in-progress icon (the icon's blue; 5.3:1 on card) |
| `--chart-muted` | `#898781` | muted chart ink |
| `--status-running` | `#0ca30c` | icon only |
| `--status-stopped` | `#898781` | icon only |
| `--status-crashed` | `#d03b3b` | icon only |

Type: **IBM Plex Sans** for UI, **Bricolage Grotesque** for headings and big counts, **Geist Mono** for paths/commands/logs (self-hosted via `@fontsource-variable`, works offline). Scale: 12 / 14 / 17 / 20 / 24 / 29 (§10). Big standalone numbers use proportional figures; `tabular-nums` only in table columns.
Spacing: Tailwind 4px scale; page gutter 16 (mobile) / 24; max width 1152px.
Motion: 150ms ease-out for hover/focus; sheet/dialog use shadcn's enter/exit; everything respects `prefers-reduced-motion`.

## 3. Layout and patterns

| Pattern | Where | Why |
|---|---|---|
| **Full-width canvas** | `App.tsx` | Content spans the screen (cap 2000px, 16/32px gutters) instead of a centred 1152px column. Cards go 1 → 2 → 3 columns at `md` / `2xl`. |
| **Project card** | `ProjectCard.tsx` | The unit of the product, laid out the same way every time so a row of cards reads as a grid. Header: repo (links to its page) and actions on the left and right, then branch; the clone status appears only when it needs attention (Cloning, Failed, Not cloned yet), never as "Ready" on a card. The project page lists it, Ready included, under "How it is set up". Body: the pipeline as large counts. Footer: two equal buttons (setup guide, copy error address), then three equal columns of facts (connection, token, fix check). |
| **Overview strip** | `Overview.tsx` | Above the cards: tracker health, resolver last poll (and poll error), and the pipeline summed across projects. |
| **Counts on the card, errors on the page** | `ProjectCard.tsx`, `ProjectPage.tsx` | A card shows only numbers: the project's pipeline (Tracked → Triaged → Filed → Fix tried → PR Open) as big counts with bars and "% of tracked", a one-line total, and a "View errors" button. It never grows with the number of errors. The errors themselves live on the project's own page at `#/projects/<id>`: back link, header with actions, the full-size pipeline, **every error** (search, state filter, 25 at a time) and how the project is set up. |
| **Hash routing** | `hooks/useProjectRoute.ts` | `#/projects/<id>` opens a project, anything else is the list. No router library or server support; it survives a reload and the back button works. A new page scrolls to the top and moves focus to its title. |
| **Connection status** | `ConnectionStatus.tsx`, `lib/connection.ts` | On each card and project page, in the place the "Connect an app" button used to be: a plain line of text (icon and words) and a guide button. **Connected** means an event has actually arrived (not a setting): "App connected · last event 3m ago", the reporting apps (by their `service` tag) on hover and in the summary line, and a "Setup guide" button that reopens the connect dialog to add another app. Before the first event the same spot reads "No app connected yet" with the "Connect an app" button. State is icon and words, never colour alone. |
| **Connect guide** | `ConnectDialog.tsx`, `lib/snippets.ts` | A "Connect an app" button on each card (and in its empty state) opens a four-step guide: the project's error address, install, init, send a test. Tabs for Python, Node.js and Browser (TypeScript and JavaScript share the code); the snippets are filled in with the project's own address and a service name taken from its repo. A table explains each recommended setting. The test sends an `info` message, so it shows on the card and is read as a test without opening a GitHub issue. |
| **Detail drawer** | `IssueDrawer.tsx` | Right-hand sheet: title, repo and branch, one row of four facts, then four equal stage sections (Triage, GitHub issue, Resolver, Pull request). Each has the same shape: the stage name and its own state (icon and word) on one line, what there is to say (the triage read, the skip reason, a link), and the one action for that stage (Triage again, Run resolver / Try again anyway). Closed, every stage is the same one line (name, state, chevron); a stage with something more to say opens on click, and one with nothing more is just the line. No timeline: the states are separate, so a skipped fix is never drawn as a finished one. |
| **Lifecycle track** | `LifecycleTrack.tsx` | Five segments per row filled to the furthest stage; the state word beside it carries the meaning. |
| **Responsive rows** | `ErrorInbox.tsx` | Under `md` the row's columns collapse into a second line (track, state, count, time) instead of a horizontally scrolling table. |
| **Progressive disclosure** | inbox | 25 rows, then "Show N more"; detail only on demand. |
| **Live, quiet** | `use*` hooks | Server-Sent Events (`/api/events`) say what changed and the hook reads it again; the last good data stays on screen if a read fails. |

**Triage** is stored per error: a status (`PENDING` / `COMPLETED` / `ERRORED`, shown as *Analyzing* / *Triaged* / *Couldn't triage*), a message (what happened, why, and who or what is the culprit), a suggestion (what to do, including "Don't report it"), and tags (`bot-safe`, `needs-human`, `test-event`, `no-stack-trace`, `third-party`, `infrastructure`). It runs for every new error, before and independent of filing; filing only reads the `bot-safe` tag. The drawer shows all of it; each row shows the message as its second line.

Components: shadcn primitives in `components/ui/`; product components in `components/`. Shared pieces to reuse, not copy: `StatusBadge` (resolver states), `Bits` (`When`, `ExternalLink`), `lib/lifecycle.ts` (stage logic and `safeUrl`).

## 4. Data visualization (from the `dataviz` procedure)

**Form.** Counts per stage are a funnel of five ordered magnitudes, so they are **stat tiles with a proportion bar**, not a chart. Per-error progress is the lifecycle track. There are no time-series charts because the server stores first/last seen and a count per error, not a series; do not draw a sparkline from two timestamps.

**Color.** The pipeline bars use one hue, the icon's blue (`#2589fe`), over a hairline track. On the card surface it reaches 5.3:1, above the 3:1 a graphic needs. Stage names and percentages are text, so nothing depends on the hue.

**Resolver status** (one component, `StatusBadge`; shape carries the meaning, color only reinforces it):

| State | Icon | Icon color | Label |
|---|---|---|---|
| Pending | circle-dashed | `--status-stopped` | Pending |
| In Progress | loader (spins; static under reduced motion) | `--chart-1` | In Progress |
| PR Open | git-pull-request | `--status-running` | PR Open |
| Skipped | circle-slash | `--status-stopped` | Skipped |
| Failed | triangle-alert | `--status-crashed` | Failed |

Labels stay in normal text ink. Text never wears a data color. No ad-hoc colors (the earlier `yellow-600` is gone).

**Interaction.** Every row is a real `<button>` with a descriptive `aria-label`; hover and focus share one background; the chevron nudges 2px on hover (disabled under `prefers-reduced-motion`).

## 5. Accessibility rules

- Every interactive element reachable and operable by keyboard; visible 2px focus ring.
- Dialogs/Sheet/AlertDialog trap focus, close on Esc, and restore focus (Radix).
- Text ≥ 4.5:1 (`#a3a7b3` on `#12141d` = 7.6:1). Status icons ≥ 3:1 and never sole carriers of meaning.
- Live-updating numbers are **not** announced on every poll; the inbox has one polite live region that announces the filtered count when a filter changes.
- The lifecycle track is `role="img"` with the stage as its label; the drawer timeline is an ordered list with "(done)" / "(not yet)" text for screen readers.
- Wizard: step list is an ordered list; validation errors are announced and focus moves to the first invalid field.

## 6. Copy rules (from the `ux-copy` pass)

- **One term per thing:** *project* (a repository and its branch), *error* (what an app reports), *issue* (on GitHub), *resolver* (what proposes the fix), *triage*. Statuses: *Ready / Cloning / Failed*, *PR Open / Skipped / Failed*.
- **Jargon is translated, then named:** a setting's technical name appears in its helper text so it stays searchable.
- **Errors = what happened + why + how to fix.** Buttons name the action ("Delete app" / "Keep app"), never "OK".
- **Reversible actions don't get confirmations.** Saving settings and retrying a clone just happen (toast confirms). Delete does, because it forgets the project's token and clone.
- All strings live in `web/src/lib/copy.ts` so wording changes in one place.

## 7. Security posture (from the review pass)

The server holds GitHub tokens and can push code, so access is layered:

1. **Loopback only** (`127.0.0.1`), never a network interface.
2. **Host allow-list**: defeats DNS rebinding.
3. **Origin / Sec-Fetch-Site check** on state-changing requests: defeats cross-site forms and fetches.
4. **Secret token**: `<data folder>/token` (mode 0600). `GET /?token=…` exchanges it for an `HttpOnly; SameSite=Strict` cookie; every `/api` route requires it. This is what stops other local users and sandboxed apps, who can all reach loopback.
5. **CSP** (`default-src 'self'`, no inline/eval scripts), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, `Cache-Control: no-store` on `/api`.
6. **Argument arrays, not shells**: git and the model's tools use `execFile`; the only shell is a project's own check command, which the user wrote.
7. The data folder (token, databases, key) is created `0700`.

---

# Part 2: Anti-slop design rules

Sections 1 to 7 record what is built. Sections 8 to 19 are the rules every new screen and every change MUST follow. Where a rule conflicts with a decision in Part 1, §8 lists the conflict and a proposed replacement. The decisions are in §21. The code does not match them yet; Part 1 describes what is built today.

## 8. Audit of Part 1 and conflicts

| Section | Problem | Fix |
|---|---|---|
| §1 Foundations | No stated personality and no reference sites. | §9 adds both. Reference sites are an open question. |
| §2 Type | Geist Sans is the primary font. Geist is banned as a primary font. | Decided: display Bricolage Grotesque, body IBM Plex Sans, mono stays Geist Mono (§10). |
| §2 Type | Scale 12 / 13 / 14 / 16 / 20 / 28 has no ratio. | 1.200 scale from 14px: 12 / 14 / 17 / 20 / 24 / 29 (§10). |
| §2 Spacing | Tailwind 4px scale allows any multiple of 4. | 8px grid with named tokens (§12). 4px only inside a control. |
| §2 Colors | Three status colors on top of six palette colors exceeds 6 named colors. | Status colors are data marks, not palette colors. `crashed` reuses `danger` (§11). |
| §3 Project card | The grid of identical project cards is a wall of identical cards. | Decided: one list, sorted by what needs attention, one row per project. Cards only for the detail view (§12). |
| §3 Overview strip | Three equal stat tiles. Same pattern as three equal cards. | Decided: one line of text per fact, numbers in the type scale. |
| §4 States | State coverage is spread across sections. | §14 defines one matrix every component fills in. |
| §6 Copy | No ban on slop phrasing, no rule for mockup data. | §15 and §16. |
| §5 Accessibility | Good. Missing: mobile width and error-to-field wiring as rules. | §18. |
| Whole file | No banned list, no ship checklist. | §19 and §20. |

## 9. Design direction

Code Akos is a calm instrument panel for a developer who wants to know which production errors have become pull requests and which need a person. It is quiet when nothing is wrong and exact when something is. It reads like a well-kept logbook: dense, plain, and trustworthy, with no marketing voice.

- MUST describe the product in these terms in every design brief.
- Reference sites: Vercel and Linear (§21). Supabase from Part 1 stays as a secondary reference for tables.
- MUST NOT add decoration that does not carry data.

## 10. Typography

| Role | Font | Fallback | Status |
|---|---|---|---|
| Display (page titles, big counts) | Bricolage Grotesque | `ui-sans-serif, sans-serif` | Decided (§21). Replaces Geist Sans. |
| Body (UI text) | IBM Plex Sans | `ui-sans-serif, sans-serif` | Decided (§21). Replaces Geist Sans. |
| Mono (paths, commands, logs) | Geist Mono | `ui-monospace, monospace` | Kept. Mono is not a primary font. |

Fonts MUST be self-hosted through `@fontsource-variable`, so the app works offline.

**Scale.** Ratio 1.200, base 14px. These are the only sizes allowed.

| Token | Size | Weight | Line height | Use |
|---|---|---|---|---|
| `text-xs` | 12px | 400 | 16px | helper text, timestamps |
| `text-sm` | 14px | 400 / 500 | 20px | body, table cells, buttons |
| `text-md` | 17px | 500 | 24px | card and section titles |
| `text-lg` | 20px | 600 | 32px | dialog and drawer titles |
| `text-xl` | 24px | 600 | 32px | page title |
| `text-2xl` | 29px | 600 | 40px | big counts |

- MUST NOT use Inter, Roboto, Arial, Open Sans, Lato, the system default, Space Grotesk or Geist as a primary font.
- MUST NOT use a size outside the table. MUST NOT use arbitrary values such as `text-[13px]`.
- MUST use only weights 400, 500 and 600.
- MUST keep body line length under 75 characters.

## 11. Color

| Name | Value | Role |
|---|---|---|
| `background` | `#090a12` | page |
| `surface` | `#12141d` | tiles, dialogs, sheet, table |
| `text` | `#f7f8fa` | primary text. Secondary text is `#a3a7b3` (7.6:1 on surface). |
| `primary` | `#e8eaf0` | the one primary action per screen |
| `accent` | `#2589fe` | data marks and in-progress icons only |
| `danger` | `#e5484d` | destructive actions and failures |

- `primary` MUST do one job: mark the single main action. It MUST NOT color links, headings or decoration.
- `accent` MUST NOT fill a button.
- Text MUST meet WCAG AA: 4.5:1 for text under 24px, 3:1 for large text and for UI borders and icons. Every new color pair MUST be checked before merge.
- MUST NOT use gradients, gradient text, neon glow, or any purple, indigo or blue gradient.
- Status icon colors (`running`, `stopped`) are data marks. MUST NOT use them for text or buttons. `crashed` MUST use `danger`; `#d03b3b` is replaced by `#e5484d` (4.69:1 on surface, §22).
- Color MUST NOT be the only signal (see §18).

## 12. Spacing and layout

**Grid.** Everything sits on an 8px grid.

| Token | Value | Use |
|---|---|---|
| `space-1` | 4px | inside a control only (icon to label) |
| `space-2` | 8px | related items |
| `space-3` | 16px | items in one group, page gutter on mobile |
| `space-4` | 24px | groups in one section, page gutter on desktop |
| `space-5` | 32px | sections |
| `space-6` | 48px | page regions |

- MUST use only these tokens. MUST NOT use arbitrary values such as `p-[13px]`.
- Related items MUST sit closer than unrelated items. The gap between groups MUST be at least twice the gap inside a group.
- **Radius set** (3 values, no more): 4px chips, 6px controls, 8px cards and dialogs. MUST NOT use `rounded-full` on a container. Circles are for avatars and icon dots only.
- **Shadow set** (2 values, no more): `shadow-sm` for menus and popovers, `shadow-lg` for the drawer and dialogs. Panels on the page MUST use a hairline border, not a shadow.
- **Layout follows the task.** The core task is: see what needs attention, open it, act on it. Screens MUST put the item that needs attention first, sorted by urgency.
- MUST NOT build a centered hero with three equal cards and icons.
- MUST NOT show more than three identical cards in a row of content. A list of many equal items MUST be a table or a list.
- A card MUST exist only when its elevation shows hierarchy (a detail panel over a list). Grouping alone MUST use spacing or a hairline.

## 13. Components

- Each screen MUST have exactly one primary action.
- Button hierarchy:

| Level | Style | Use |
|---|---|---|
| Primary | filled `primary` | the one main action |
| Secondary | outline | other actions of equal weight to the task |
| Tertiary | text only | low-weight actions, links |
| Destructive | filled `danger` | delete only, always confirmed (§16) |

- Icons MUST come from one set: `lucide-react`. MUST NOT mix sets.
- MUST NOT use emoji as icons or as decoration.
- Icon-only buttons MUST have an `aria-label` and a tooltip.
- MUST build on shadcn primitives (Part 1, §1). MUST NOT add a bespoke dialog, select or switch.

## 14. State matrix

Every component and every data-driven screen MUST define all eight states before it ships. Copy this table into the pull request description and fill it in.

| State | What the user sees | Rule |
|---|---|---|
| Default | resting appearance | |
| Hover | background shifts one step; cursor changes only on clickable items | MUST appear on every clickable item |
| Active | pressed: one step darker than hover | |
| Focus-visible | 2px ring in `--ring` | MUST be visible on keyboard focus, MUST NOT hide on mouse click |
| Disabled | 50% opacity, `aria-disabled`, tooltip says why | MUST explain why when the reason is not obvious |
| Loading | skeleton with the shape of the final layout | MUST NOT use a centered spinner for a page or list |
| Empty | what lives here, plus one action | MUST include one action |
| Error | what happened, why, how to recover | MUST include a recovery action |
| Success | quiet confirmation (toast or inline text) | MUST NOT block the user |

Template for a component or screen:

| Component / screen | Default | Hover | Active | Focus-visible | Disabled | Loading | Empty | Error | Success |
|---|---|---|---|---|---|---|---|---|---|
| _name_ | | | | | | | | | |

## 15. Microcopy

- Buttons MUST be verb + object: "Delete project", "Copy error address". MUST NOT use "OK", "Submit" or "Click here".
- Errors MUST say what happened, why, and what to do next. Errors MUST NOT blame the user ("You entered…", "Invalid input").
- Empty states MUST explain what belongs there and give one action.
- Mockups, screenshots and seed data MUST use real names, real numbers and real data from this product. MUST NOT use "John Doe", "Acme", lorem ipsum, invented statistics or fake testimonials.
- MUST keep the one-term-per-thing list from §6.

## 16. Writing style

- MUST state the point directly in plain, specific sentences.
- MUST NOT use "it's not X, it's Y" or any variant: "not just X but Y", "not only X but also Y", "no X, no Y, just Z", "less X, more Y", "stop X, start Y".
- MUST NOT use these words: seamless, delve, elevate, unlock, leverage, empower, game-changer, revolutionize.
- MUST NOT write a list of three by habit. A list MUST have as many items as there are real items.
- Destructive confirmations MUST name what is lost ("Delete app? This forgets its token and clone.").

## 17. Motion

- Every animation MUST answer a user question: did the click register, is it loading, is this hoverable.
- MUST remove any animation that answers none of these.
- Duration MUST be 150ms for feedback and the shadcn defaults for dialogs and the drawer.
- MUST respect `prefers-reduced-motion`.
- MUST NOT use parallax, looping decoration, or entrance animations on page load.

## 18. Accessibility

- MUST use semantic HTML: `button` for actions, `a` for navigation, headings in order, `table` for tabular data.
- Every input MUST have a visible label. Placeholders MUST NOT replace labels.
- Every action MUST work from the keyboard, in a logical tab order.
- Focus MUST be visible (§14).
- Field errors MUST be tied to the field with `aria-describedby` and `aria-invalid`. Focus MUST move to the first invalid field.
- Color MUST NOT be the only signal. Pair it with an icon and a word.
- Every screen MUST be checked at 360px width with no horizontal page scroll.
- Everything else in §5 still applies.

## 19. Banned list

| Category | Banned |
|---|---|
| Fonts (as primary) | Inter, Roboto, Arial, Open Sans, Lato, system default, Space Grotesk, Geist |
| Type | any size outside §10, arbitrary `text-[…]` values |
| Color | purple, indigo or blue gradients, any gradient, gradient text, neon glow, color as the only signal |
| Layout | centered hero with three equal cards and icons, wall of identical cards, card around everything, arbitrary spacing values |
| Shape | more than 3 radii, more than 2 shadows, pills (Part 1) |
| Icons | emoji as icons, a second icon set |
| Copy | "OK", "Submit", "Click here", blaming errors, placeholders (John Doe, Acme, lorem ipsum), invented stats, fake testimonials |
| Phrases | "it's not X, it's Y" and variants (not just X but Y, not only X but also Y, no X no Y just Z, less X more Y, stop X start Y) |
| Words | seamless, delve, elevate, unlock, leverage, empower, game-changer, revolutionize |
| Motion | animation that answers no user question, parallax, load-in animations |

## 20. Pre-ship checklist

Every answer MUST be yes before merge.

1. Do all fonts come from §10, with no banned primary font?
2. Does every text size come from the scale?
3. Does the screen use only the six named colors, and no gradient?
4. Does every text and icon pair meet WCAG AA?
5. Does the screen use only spacing tokens and the 8px grid?
6. Are there at most 3 radii and 2 shadows?
7. Is there exactly one primary action on the screen?
8. Is the layout built around the user's core task, with no wall of identical cards?
9. Is the state matrix (§14) filled in for every new component and data screen?
10. Is every button verb + object, and does every error say what to do next?
11. Does every mockup and seed record use real data?
12. Is the copy free of banned phrases and words?
13. Does every animation answer a user question?
14. Can the whole screen be used by keyboard, with labels, visible focus and field-linked errors?
15. Does it work at 360px width and match the other screens in layout, spacing and wording?

## 21. Decisions

Decided from the design-system and accessibility-review passes. Change any of them by editing this table.

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Reference sites | Vercel (dense, quiet, data first) and Linear (sorted lists, keyboard first) | Both are dark, list-driven tools for developers. Vercel is already named in Part 1. |
| 2 | Fonts | Bricolage Grotesque (display), IBM Plex Sans (body), Geist Mono (mono) | None are banned. Plex Sans is legible at 12 to 14px in dense tables. |
| 3 | Project card grid | Replace with a list sorted by needs attention, one row per project | Matches the core task and removes the wall of identical cards. |
| 4 | Type scale | 1.200 from 14px: 12 / 14 / 17 / 20 / 24 / 29 | Small steps suit a dense tool. 13 becomes 12 or 14, 16 becomes 17, 28 becomes 29. |
| 5 | `crashed` color | Use `danger` `#e5484d` | It is 4.69:1 on surface. `#d03b3b` is 3.82:1, which passes for icons only. |
| 6 | 4px inside controls | Allowed (`space-1`) | Icon-to-label gaps need it. |
| 7 | Product voice | The product owner. The voice is §6 and §15 to §16 | No other source exists. |

## 22. Contrast check

Measured with the WCAG formula on surface `#12141d` and background `#090a12`.

| Pair | On surface | On background | Needs | Result |
|---|---|---|---|---|
| `text` `#f7f8fa` | 17.28 | 18.58 | 4.5 | Pass |
| Secondary `#a3a7b3` | 7.64 | 8.21 | 4.5 | Pass |
| `primary` `#e8eaf0` | 15.27 | 16.41 | 4.5 | Pass |
| `accent` `#2589fe` | 5.32 | 5.72 | 3 (graphic) | Pass |
| `danger` `#e5484d` | 4.69 | 5.04 | 4.5 | Pass |
| Old `crashed` `#d03b3b` | 3.82 | 4.11 | 3 (icon) | Pass for icons, fails for text |
| `running` `#0ca30c` | 5.47 | 5.88 | 3 (icon) | Pass |
| `stopped` `#898781` | 5.11 | 5.50 | 3 (icon) | Pass |
| Field border `#6d7182` | 3.79 | 4.07 | 3 | Pass |

- Text on a primary button MUST be `#090a12` (16.41:1).
- Text on a destructive button MUST be `#090a12` (5.04:1). White text is 3.91:1 and fails.
