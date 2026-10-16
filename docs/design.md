---
version: "alpha"
name: "Glassmorphism Application UI"
description: "A complete glassmorphic application interface for dashboards, partner portals, reports, tables, forms and data-driven workflows."
colors:
  primary: "#0080FF"
  secondary: "#8B00FF"
  tertiary: "#FF1493"
  teal: "#20B2AA"
  neutral: "#000000"

typography:
  h1:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 2.25rem
    fontWeight: 700
  h2:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 1.5rem
    fontWeight: 700
  body-md:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 1rem
    fontWeight: 400
  body-sm:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 0.875rem
    fontWeight: 400
  label-caps:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 0.75rem
    fontWeight: 500
  monospace:
    fontFamily: "JetBrains Mono", "SFMono-Regular", Consolas, monospace
    fontSize: 0.875rem
    fontWeight: 400

tokens:
  blur:
    low: 10px
    default: 15px
    high: 20px
  glassOpacity:
    low: 0.10
    default: 0.15
    high: 0.30
  borderColor: "rgba(255,255,255,0.2)"
  borderSubtle: "rgba(255,255,255,0.12)"
  shadowGlass: "0 8px 32px rgba(0,0,0,0.18)"
  radiusSmall: 0.5rem
  radiusMedium: 0.75rem
  radiusLarge: 1rem
  contentMaxWidth: 1280px
  spacingUnit: 0.5rem

zIndex:
  base: 0
  decorative: 1
  content: 10
  stickyNavigation: 100
  dropdown: 200
  overlay: 300
  modal: 400
  toast: 500

components:
  glassSurface:
    backgroundColor: "rgba(255,255,255,0.15)"
    backdropFilter: "blur(15px)"
    border: "1px solid rgba(255,255,255,0.2)"
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)"

  dataSurface:
    backgroundColor: "rgba(0,0,0,0.30)"
    border: "1px solid rgba(255,255,255,0.12)"

  primaryButton:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    padding: "0.75rem 1rem"
    borderRadius: "0.5rem"
    fontWeight: 600

  secondaryButton:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    border: "1px solid rgba(255,255,255,0.2)"
    padding: "0.75rem 1rem"
    borderRadius: "0.5rem"

  input:
    backgroundColor: "rgba(255,255,255,0.10)"
    border: "1px solid rgba(255,255,255,0.2)"
    borderRadius: "0.5rem"
    padding: "0.75rem 1rem"

  table:
    backgroundColor: "rgba(0,0,0,0.30)"
    border: "1px solid rgba(255,255,255,0.12)"
    rowBorder: "1px solid rgba(255,255,255,0.10)"
    headerBackgroundColor: "rgba(255,255,255,0.10)"

---

# Glassmorphism Application UI

## Overview

Glassmorphism Application UI is a translucent, layered and vibrant interface system designed for a complete application rather than a marketing landing page.

The style is intended for the Europodlahy partner application, including:

- Dashboard overview
- Sidebar and top navigation
- Partner management
- Orders and transactions
- Commission tracking
- Reports
- Data tables
- Filters and search
- Forms
- Notifications
- Dropdowns
- Modal dialogs
- Empty states
- Loading states
- Responsive mobile navigation

The design must feel modern, premium and visually distinctive while keeping data-heavy workflows readable and efficient.

Glassmorphism is used selectively. Navigation, KPI cards, overlays, dropdowns and highlighted surfaces may use translucent blurred glass. Tables, reports, forms and data-dense components must use a more opaque surface to preserve readability.

## Style

- **Name:** Glassmorphism Application UI
- **Type:** Translucent, Layered, Vibrant, Blurred
- **Keywords:** Frosted glass, transparent surfaces, blurred background, layered depth, light reflection, vibrant background, premium dashboard, data-driven interface
- **Era:** 2020s Modern
- **Light/Dark:** ✓ Full / ✓ Full
- **Density:** 6/10 — Balanced and practical
- **Variance:** 4/10 — Consistent with purposeful hierarchy
- **Motion:** 3/10 — Subtle and functional

## Color Palette

Do not change the defined color palette.

- **Primary:** Translucent white `rgba(255,255,255,0.1-0.3)`
- **Secondary:** Electric Blue `#0080FF`
- **Accent:** Neon Purple `#8B00FF`
- **Accent:** Vivid Pink `#FF1493`
- **Accent:** Teal `#20B2AA`
- **Neutral:** `#000000`

Use the colors consistently:

- Electric Blue for primary actions, links and active navigation.
- Neon Purple for secondary highlights and selected analytical elements.
- Vivid Pink for visual emphasis and decorative accents.
- Teal for secondary indicators and supporting visual elements.
- Translucent white for glass surfaces, borders and reflections.
- Black must remain available as the defined neutral color but must not be used as a large pure-black text or surface treatment where it harms readability.

Do not introduce additional brand colors.

## Background

Use a vibrant layered background with:

- A base background color.
- Large blurred color areas using the existing Electric Blue, Neon Purple, Vivid Pink and Teal colors.
- Low-opacity radial gradients.
- Subtle depth behind the main application shell.
- No visual background movement that distracts from data.

Decorative background elements must stay behind application content.

The background must never reduce text readability.

## Glass Surfaces

Use the following base glass treatment:

```css
background: rgba(255, 255, 255, 0.15);
backdrop-filter: blur(15px);
-webkit-backdrop-filter: blur(15px);
border: 1px solid rgba(255, 255, 255, 0.2);
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);




----------------------------------

Glass surfaces are appropriate for:
•	Sidebar
•	Top navigation
•	KPI cards
•	Summary cards
•	Filter panels
•	Dropdown menus
•	Notifications
•	Modal dialogs
•	Highlighted widgets
•	Empty states
•	Floating actions
Do not apply strong transparency to every component.
Data Surfaces
Data-heavy UI must prioritize readability over transparency.
Use more opaque surfaces for:
•	Tables
•	Reports
•	Forms
•	Long lists
•	Transaction histories
•	Commission details
•	Dense dashboard widgets
•	Multi-column layouts
Use this visual treatment as the default:
background: rgba(0, 0, 0, 0.30);
border: 1px solid rgba(255, 255, 255, 0.12);

Adjust opacity only when required to preserve readability. Do not add new colors.
Typography
Use the following system font stack:
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

Use this approximate scale:
•	Application title:  clamp(2rem, 4vw, 3rem) 
•	H1:  2.25rem 
•	H2:  1.5rem 
•	H3:  1.125rem 
•	Body:  1rem 
•	Small text:  0.875rem 
•	Labels:  0.75rem 
•	Technical and financial values: JetBrains Mono
Rules:
•	Use a clear hierarchy between page title, section title and content.
•	Do not use excessive uppercase text.
•	Use uppercase labels only for compact metadata or category labels.
•	Use tabular numerals for financial values, counts and metrics where supported.
•	Do not place small text directly over decorative backgrounds.
Layout
•	Use CSS Grid for application-level layouts.
•	Use Flexbox for component-level alignment.
•	Use a centered content container with a maximum width of  1280px .
•	Use  1.5rem  horizontal padding on desktop.
•	Use  1rem  horizontal padding on smaller screens.
•	Use an 8px spacing rhythm.
•	Keep the sidebar and top navigation visually distinct from the content area.
•	Use a two-column desktop structure: navigation plus main content.
•	Collapse the sidebar into a drawer or bottom navigation on mobile.
•	Do not create horizontal page overflow.
•	Do not use  h-screen ; use  min-h-[100dvh] .
Application Structure
The interface should support this general structure:
1.	Application shell
2.	Sidebar navigation
3.	Top navigation
4.	Breadcrumbs or page context
5.	Page title and actions
6.	KPI or summary area
7.	Main content
8.	Tables, reports or charts
9.	Pagination and filters
10.	Notifications and contextual feedback
The structure must work for different application pages without looking like a landing page.
Public Pages
The public part of the application may include:
•	Landing page
•	Login page
•	Registration page if it exists
•	Password reset page if it exists
•	Other public pages discovered in the existing project
The landing page may use a stronger visual glassmorphism treatment.
Authentication pages must prioritize:
•	Clear form hierarchy
•	Readable inputs
•	Validation
•	Error messages
•	Loading states
•	Keyboard accessibility
•	Mobile usability
Dashboard
The dashboard should include:
•	Page title
•	Date range or context selector
•	Primary action
•	KPI cards
•	Performance overview
•	Commission summary
•	Recent activity
•	Pending actions
•	Shortcuts to frequent workflows
•	Charts or analytical widgets where relevant
KPI cards may use glass surfaces, but values and labels must have strong visual contrast.
Do not use decorative cards that do not communicate useful information.
Navigation
Sidebar
The sidebar should use a glass surface with:
•	Application logo or wordmark
•	Main navigation groups
•	Active item indicator
•	Optional badge counts
•	User profile area
•	Collapse control on desktop
•	Drawer behavior on mobile
Active navigation items should use Electric Blue as the primary indicator.
Top Navigation
The top navigation should contain:
•	Page context or breadcrumb
•	Search where relevant
•	Notifications
•	User menu
•	Optional page-level actions
Keep the top navigation sticky where appropriate.
Tables
Tables must be clear, structured and usable.
Requirements:
•	Use an opaque or semi-opaque data surface.
•	Use clear column headers.
•	Use adequate row height.
•	Use subtle row separators.
•	Provide hover feedback without excessive glow.
•	Support horizontal scrolling on small screens where necessary.
•	Keep important columns visible.
•	Align numeric values consistently.
•	Use monospace or tabular numerals for technical and financial values.
•	Provide sorting indicators.
•	Provide pagination or virtual scrolling when needed.
•	Provide empty, loading and error states.
•	Do not place table text over highly variable decorative backgrounds.
•	Do not sacrifice readability for the glass effect.
Reports
Reports should include:
•	Clear report title
•	Date range
•	Filters
•	Search
•	Export action
•	Summary metrics
•	Chart or visual overview
•	Detailed data table
•	Loading and error states
•	Empty state with a useful next action
The report layout must remain readable when many values and filters are visible.
Forms
Forms must include:
•	Label above the input
•	Helpful placeholder only when necessary
•	Clear required-field indication
•	Visible focus state
•	Inline validation
•	Error message below the related field
•	Disabled state
•	Loading state for submission
•	Success feedback after completion
Do not use floating labels.
Buttons
Primary Button
•	Electric Blue fill.
•	Subtly rounded shape.
•	Font weight 600.
•	Cursor pointer.
•	Smooth hover state.
•	Slight elevation or color adjustment on hover.
•	Tactile press state.
•	No large outer glow.
Secondary Button
•	Transparent or glass surface.
•	Thin light border.
•	Electric Blue text or appropriate high-contrast text.
•	Subtle background change on hover.
Icon Button
•	Use an inline SVG icon.
•	Provide an accessible label.
•	Add a tooltip where the action is not obvious.
•	Provide visible hover and focus states.
Cards
Cards may use one of three treatments:
1.	Glass card for summaries, KPIs and highlighted content.
2.	Data surface for reports, tables and dense content.
3.	Flat or transparent grouping for simple layout sections.
Cards should have:
•	Consistent padding
•	Clear title and content hierarchy
•	Subtle border
•	Appropriate radius
•	Predictable hover behavior only when interactive
Icons
•	Use Lucide or Heroicons-style inline SVG icons.
•	Never use emojis as UI icons.
•	Use consistent stroke width and size.
•	Decorative icons may be muted.
•	Functional icons must have accessible labels or accompanying text.
•	Do not use icons alone for ambiguous actions.
States
Every major component should define:
•	Default state
•	Hover state
•	Focus state
•	Active state
•	Disabled state
•	Loading state
•	Error state
•	Empty state
•	Success state where applicable
Use skeleton loading states for content areas. Avoid using only circular spinners for large page sections.
Motion
•	Use ease-out curves.
•	Use durations between  200ms  and  300ms .
•	Animate only  transform  and  opacity  where possible.
•	Use fade and translate-Y entry animations sparingly.
•	Use staggered list animations only for short lists.
•	Do not animate large tables or frequently updating data.
•	Respect  prefers-reduced-motion .
Accessibility
•	Normal text must target a minimum contrast ratio of  4.5:1 .
•	Large text must target a minimum contrast ratio of  3:1 .
•	Interactive controls must have visible focus states.
•	Do not communicate information by color alone.
•	Use semantic HTML.
•	Use accessible labels for form fields and icon buttons.
•	Ensure keyboard navigation works throughout the application.
•	Ensure dialogs manage focus correctly.
•	Provide appropriate ARIA attributes where needed.
•	Test text contrast against the actual surface, not only the base background.
•	Test the actual rendered contrast without rounding borderline results.
Responsive Behavior
Desktop
•	Persistent sidebar.
•	Multi-column dashboard layout.
•	Full data tables.
•	Sticky top navigation where useful.
•	Side-by-side filters and actions.
Tablet
•	Reduced sidebar width or collapsible navigation.
•	Two-column layouts where space allows.
•	Adaptive table layout.
•	Wrapped action groups.
Mobile
•	Navigation becomes a drawer or bottom navigation.
•	All multi-column layouts stack vertically.
•	Cards become full width.
•	Filters may open in a modal or bottom sheet.
•	Tables may scroll horizontally or switch to a card/list presentation.
•	Primary actions remain easy to reach.
•	No horizontal page overflow.
Browser Fallback
Provide a solid or semi-opaque fallback when  backdrop-filter  is unavailable:
.glass-surface {
  background: rgba(0, 0, 0, 0.45);
}

@supports (backdrop-filter: blur(15px)) {
  .glass-surface {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
  }
}

Reduced Transparency
Respect user preferences:
@media (prefers-reduced-transparency: reduce) {
  .glass-surface {
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

Do
•	Use the defined Electric Blue, Neon Purple, Vivid Pink and Teal colors.
•	Use glass selectively.
•	Use opaque surfaces for tables and reports.
•	Use visible borders and clear hierarchy.
•	Use inline SVG icon systems.
•	Use semantic HTML.
•	Use responsive layouts.
•	Test contrast in real UI states.
•	Provide loading, error and empty states.
•	Preserve usability over decorative effects.
•	Reuse shared components.
•	Preserve existing application behavior.
Don’t
•	Do not change the defined color palette.
•	Do not use emojis as icons.
•	Do not use glass transparency on every component.
•	Do not place dense table content over a highly variable background.
•	Do not use low-contrast text on translucent surfaces.
•	Do not use excessive neon glow.
•	Do not use large animated background effects behind data.
•	Do not use floating labels.
•	Do not use horizontal overflow on the page.
•	Do not use  h-screen ; use  min-h-[100dvh] .
•	Do not use generic landing-page structures inside application screens.
•	Do not use fake charts or meaningless metrics.
•	Do not hide important actions behind icon-only controls without accessible labels.
•	Do not change business logic, API contracts or routes unnecessarily.
Technical CSS Base
:root {
  --blur-amount: 15px;
  --glass-opacity: 0.15;
  --border-color: rgba(255, 255, 255, 0.2);
  --border-subtle: rgba(255, 255, 255, 0.12);
  --background: vibrant color;
  --text-color: light/dark based on background;
}

.glass-surface {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(var(--blur-amount));
  -webkit-backdrop-filter: blur(var(--blur-amount));
  border: 1px solid var(--border-color);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.data-surface {
  background: rgba(0, 0, 0, 0.30);
  border: 1px solid var(--border-subtle);
}

@supports not (backdrop-filter: blur(15px)) {
  .glass-surface {
    background: rgba(0, 0, 0, 0.45);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .glass-surface {
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

Implementation Checklist
•	Existing color palette preserved.
•	No new brand colors introduced.
•	Glass effect uses blur between 10px and 20px.
•	Glass surfaces use translucent white between 10% and 30%.
•	Glass surfaces use a subtle 1px light border.
•	Vibrant background uses only the defined colors.
•	Data-heavy surfaces are opaque or semi-opaque.
•	Text contrast is checked against actual surfaces.
•	Normal text targets 4.5:1.
•	Large text targets 3:1.
•	Keyboard focus states are visible.
•	Responsive behavior works on desktop, tablet and mobile.
•	Tables have loading, empty and error states.
•	Forms have validation and focus states.
•	Backdrop-filter fallback exists.
•	Reduced-transparency support exists.
•	No emojis are used as icons.
•	No unnecessary horizontal page overflow exists.
•	Existing routes and business logic still work.
•	Shared components are reused where appropriate.