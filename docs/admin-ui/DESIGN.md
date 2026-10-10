---
name: Obsidian Horizon
colors:
  surface: '#0d1322'
  surface-dim: '#0d1322'
  surface-bright: '#33394a'
  surface-container-lowest: '#080e1d'
  surface-container-low: '#151b2b'
  surface-container: '#191f2f'
  surface-container-high: '#242a3a'
  surface-container-highest: '#2f3445'
  on-surface: '#dde2f8'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dde2f8'
  inverse-on-surface: '#2a3040'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#b4c5ff'
  on-secondary: '#002a78'
  secondary-container: '#0053db'
  on-secondary-container: '#cdd7ff'
  tertiary: '#7bd0ff'
  on-tertiary: '#00354a'
  tertiary-container: '#23b2ec'
  on-tertiary-container: '#00415a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#c4e7ff'
  tertiary-fixed-dim: '#7bd0ff'
  on-tertiary-fixed: '#001e2c'
  on-tertiary-fixed-variant: '#004c69'
  background: '#0d1322'
  on-background: '#dde2f8'
  surface-variant: '#2f3445'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 1.75rem
---

> Historical design reference: preserve these original tokens and screenshots as provenance, not as an exact specification of the finished UI. Current public/admin styling uses Manrope and the implemented Tailwind/admin CSS. Kanban/priority/Open Pipeline descriptions and alternate fonts/status labels below are not current product features. All three email templates use the current light branded system described in [admin email](../admin-lead-email.md). Do not redesign runtime UI to match this historical reference.


## Brand & Style

This design system delivers a high-density, authoritative command center tailored for executive lead operations and agency technical administration. The aesthetic balances crisp technical precision with an uncluttered modernist corporate baseline. It deliberately avoids consumer-facing dashboard tropes, fluorescent gradients, and decorative glass blurs in favor of architectural surfaces, low-contrast 1px separation lines, and disciplined data density.

Key personality traits:
- **Engineered Authority**: Every metric, border, and status communicates precision, operational clarity, and high situational awareness.
- **Architectural Depth**: UI surfaces rely on layered deep midnight blues and desaturated slate boundaries to organize information without visual noise.
- **Signal-to-Noise Focus**: Accents are strictly functional. Luminescent cyan and tactical cobalt isolate high-value actions, active pipeline states, and live updates.
- **Executive Restraint**: Badges and status states reject heavy saturated backgrounds in favor of structural micro-dots, refined type pairing, and whisper-level translucent tinting.

## Colors

The color palette is built on deep structural slate-navy tones that maintain dark-mode contrast ratios without pure black eye strain.

### Surface Hierarchy
- **Canvas Base**: `#0B1120` — Deepest navy underlying all application views.
- **Surface Level 1 (Panels / Sidebars)**: `#0D1527` — Base structural container.
- **Surface Level 2 (Cards / Tables / Toolbars)**: `#131E36` — Elevated content working area.
- **Surface Level 3 (Inputs / Modals / Active Hover)**: `#1E293B` — Foreground interactive plane.

### Structural Lines & Borders
- **Standard Border**: `rgba(255, 255, 255, 0.08)` or `#25334D` — Razor-thin 1px dividing lines for grid structures, tables, and compartmentalized cards.
- **Focus / Active Stroke**: `#06B6D4` with a subtle alpha glow (`rgba(6, 182, 212, 0.25)`).

### Typography Tones
- **Primary Text**: `#F8FAFC` — High legibility display and body information.
- **Secondary Text**: `#94A3B8` — Supporting metadata, timestamps, and column headers.
- **Muted / Inactive Text**: `#64748B` — Field placeholders, table column labels, and system IDs.

### Semantic Status Palette
Status indicators avoid garish fills, relying on a 6px status dot paired with subtle tinted surface chips:
- **New / Unassigned**: Dot `#38BDF8` (Cyan), Background `rgba(56, 189, 248, 0.08)`, Text `#7DD3FC`.
- **Contacted**: Dot `#F59E0B` (Amber), Background `rgba(245, 158, 11, 0.08)`, Text `#FCD34D`.
- **In Progress**: Dot `#6366F1` (Indigo), Background `rgba(99, 102, 241, 0.08)`, Text `#A5B4FC`.
- **Converted**: Dot `#10B981` (Emerald), Background `rgba(16, 185, 129, 0.08)`, Text `#6EE7B7`.
- **Closed / Disqualified**: Dot `#64748B` (Slate), Background `rgba(100, 116, 139, 0.08)`, Text `#94A3B8`.

## Typography

The typographic hierarchy pairs Plus Jakarta Sans for confident, modern structural headlines with Inter for rigorous, micro-detailed body and data representation.

- **Headlines (Plus Jakarta Sans)**: Used for view titles, aggregate metrics, and primary section headers. Tight letter spacing (`-0.02em` to `-0.025em`) keeps metric counters and navigation anchors dense and impactful.
- **Body & Tabular Data (Inter)**: Handles lead contact details, activity timelines, conversion notes, and administrative inputs. Set with standard tracking to ensure legible scanning across dense 50+ row table views.
- **Labels & Micro-copy (Inter)**: Form input identifiers, table column headers, and audit timestamps utilize uppercase or medium-weight 11px–12px sizing with positive tracking (`0.01em` to `0.04em`) to maintain sharp legibility against deep background surfaces.

## Layout & Spacing

The layout is built upon an adaptive 12-column fixed/fluid hybrid grid calibrated for data-dense B2B operational tooling.

### Layout Mechanics
- **Desktop (1280px+)**: A persistent 260px left navigation rail locks into place. The primary work surface spans a 12-column grid utilizing a 24px (`1.5rem`) gutter and 32px (`2rem`) page margin. Data tables expand to container edges with internal padding controlled through tight spacing tokens.
- **Tablet (768px – 1279px)**: Navigation collapses into a compact 64px icon rail. Grid collapses to 8 columns with 16px (`1rem`) gutters and 24px margins. Lead overview side-panels convert into layered slide-over sheets.
- **Mobile (< 768px)**: Single-column stacked layout with 16px outer margins. Navigation relocates to an off-canvas drawer. Data-dense tables transition to card-based feed components with horizontal scroll indicators for detailed audit logs.

### Spacing Scale Rhythm
- `space-xs` (4px): Internal micro-spacing between dot icons and badge text, cell metadata offsets.
- `space-sm` (8px): Gaps between form inputs, inline filter buttons, action icons.
- `space-md` (12px): Standard vertical and horizontal padding for inputs, list items, and table cells.
- `space-lg` (20px): Card inner padding, section headers, container boundaries.
- `space-xl` (28px): Major module separation, pipeline stage column divisions.

## Elevation & Depth

Visual hierarchy is constructed via architectural surface stratification and razor-sharp border contrast rather than diffuse dropshadows.

### Surface Layering
1. **Base Platform (`#0B1120`)**: Sits at the floor of the viewport. Houses the outer margins and structural backdrop.
2. **Fixed Navigation & Toolbars (`#0D1527`)**: Separated from content via a continuous `1px solid rgba(255, 255, 255, 0.08)`.
3. **Card & Table Modules (`#131E36`)**: Sits above the background, outlined with `#25334D`.
4. **Interactive Inputs & Dropdown Flyouts (`#1E293B`)**: Framed with a 1px border. Dropdowns and modals introduce a low-spread structural shadow: `0 8px 24px -4px rgba(0, 0, 0, 0.45)`.

### Cyan Accent Illuminations
Interactive focal points (focused inputs, active navigation states, selected table rows) discard conventional multi-tier drop shadows. Instead, they employ a calibrated border brightening to `#06B6D4` paired with an ultra-soft atmospheric back-glow: `0 0 12px rgba(6, 182, 212, 0.15)`.

## Shapes

The design uses a restrained, professional corner radius (`roundedness: 1` — Soft / Crisp Engineering). 

- **Inputs, Buttons, and Table Cells**: Configured with standard `0.25rem` (4px) or `0.375rem` (6px) corners to preserve compact geometric precision.
- **Panels, Modals, and Dashboard Cards**: Scaled to `0.5rem` (8px) corners with a 1px border clipping the contents cleanly.
- **Pill Shapes**: Strictly reserved for circular icon actions (28px × 28px) and status dot indicators. Full pill capsules are omitted from text badges to prevent casual, consumer-app visual weight.

## Components

### Buttons
- **Primary Action**: Solid `#06B6D4` background, dark text `#082F49`, font weight 600, 6px border-radius. On hover: `#38BDF8` with a subtle cyan edge glow.
- **Secondary Action**: Background `#1E293B`, 1px border `#25334D`, text `#F8FAFC`. On hover: border color transitions to `rgba(255, 255, 255, 0.2)` with background `#24334A`.
- **Tertiary / Ghost Action**: Transparent background, text `#94A3B8`. Hover transitions to text `#F8FAFC` and surface background `rgba(255, 255, 255, 0.04)`.
- **Destructive Action**: Transparent background with 1px border `#EF4444`, text `#F87171`. On hover: background `rgba(239, 68, 68, 0.1)`.

### Status Badges
- Constructed with a structural micro-chip layout: 6px vertical, 10px horizontal padding, 4px border radius.
- Contains an inline 6px circular dot on the left followed by 11px uppercase/medium tracking label text.
- Standard background uses an 8% opacity tint corresponding to the dot color, paired with a subtle matching border stroke (`rgba(current, 0.15)`).

### Data Tables & List Rows
- **Header**: Height 36px, background `#0D1527`, text `#64748B`, 11px uppercase label font, 1px bottom border `#25334D`.
- **Row**: Height 44px (compact), background `#131E36`, alternating hover state `#182440`.
- **Border Separation**: 1px horizontal dividers using `rgba(255, 255, 255, 0.06)`. No vertical column lines.
- **Selection State**: Left border accent: 2px solid `#06B6D4`, background tint: `rgba(6, 182, 212, 0.04)`.

### Form Controls & Inputs
- **Text & Select Inputs**: Background `#0D1527`, 1px border `#25334D`, text `#F8FAFC`, placeholder `#64748B`, height 36px, inner padding 8px 12px.
- **Focus State**: Border shifts to `#06B6D4`, ring shadow `0 0 0 1px #06B6D4`.
- **Checkboxes**: 16px × 16px square, 3px border-radius, border `#334155`, unchecked background `#0D1527`. Checked state: background `#06B6D4`, border `#06B6D4`, check icon `#082F49`.
- **Radio Buttons**: 16px circle, identical border logic with an internal 6px solid dot indicator.

### Cards & Container Panels
- Background `#131E36`, 1px border `#25334D`, corner radius 8px (`rounded-lg`).
- Internal header regions feature an integrated 1px bottom border `#1E293B` separating title and action buttons from data bodies.
- Section paddings strictly follow `space-md` (compact operational cards) or `space-lg` (pipeline aggregates).

### Pipeline Kanban Stages
- Columns styled in `#0D1527` with a 1px border `#1E293B`.
- Header indicator contains stage name in `#94A3B8`, an integer counter pill with background `#1E293B`, and an active top-border colored indicator (2px height) matching stage status semantics.