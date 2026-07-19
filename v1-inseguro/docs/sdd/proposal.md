# Software Design Description (SDD) Proposal: Enterprise Light / Clean Tech Vanilla CSS Design System

**Project:** `v1-inseguro` (IT Helpdesk Security Lab)
**Status:** Proposed
**Date:** July 19, 2026
**Target Module:** UI / Layout / View Layer

> [!IMPORTANT]
> **REGLA DE ORO INVIOLABLE / NON-NEGOTIABLE CORE RULE:**
> Este cambio es **EXCLUSIVAMENTE DE ESTILOS Y ESTRUCTURA VISUAL (CSS + HTML layout)**.
> 1. **CERO cambios a la lógica de negocio ni rutas backend:** No se tocará ni modificará ningún archivo de controlador, modelo, base de datos ni ruta en JavaScript (`src/modules/*`, `src/db/*`, etc.).
> 2. **CERO 'arreglos' de seguridad:** No se desinfectará ningún input, no se corregirá ningún SQLi, Stored XSS, CSRF, IDOR, ni ninguna vulnerabilidad.
> 3. **Preservación 100% de EJS y tags:** Se mantendrán intactas todas las etiquetas EJS (`<%- ... %>` y `<%= ... %>`), atribute names de formularios, action URLs y los comentarios anotados `<!-- [VULN-xxx] -->`.
> 4. **Garantía de No-Ruptura:** Todo lo que actualmente funciona o se explota en `v1-inseguro` seguirá funcionando exactamente igual.

---

## 1. Executive Summary & Change Title

**Change Title:** Implementation of Enterprise Light / Clean Tech Vanilla CSS Design System for `v1-inseguro`

This proposal outlines the architectural plan for modernizing the user experience and visual appearance of the `v1-inseguro` IT Helpdesk application. The project will transition the raw HTML views into a clean, modern, enterprise-grade web UI powered by Vanilla CSS design tokens, Google Fonts (`Inter` & `Outfit`), CSS grid/flexbox layouts, card components, badge statuses, responsive navigation, micro-animations, and reusable EJS template partials.

Crucially, this design system overhaul operates under a strict security non-regression constraint: all functional routes, form endpoints, raw HTML EJS tags (`<%- ... %>`), and embedded security vulnerabilities (`[VULN-001]` through `[VULN-012]`) must remain 100% intact.

---

## 2. User Request & Goal

### User Request
Transform the basic EJS views in `v1-inseguro` into an Enterprise Light / Clean Tech Vanilla CSS design system.

### Key Deliverables
1. **Static Middleware Setup:** Ensure `public/` folder is correctly served via Express (`express.static`).
2. **Vanilla CSS Design Tokens (`/public/css/styles.css`):**
   - **Typography:** Import Google Fonts `Inter` (body/UI) and `Outfit` (headings/branding).
   - **Color Palette:** Corporate blue spectrum (`#0f52ba`, `#1a73e8`), crisp slate backgrounds (`#f8fafc`), clean surface cards (`#ffffff`), border tokens (`#e2e8f0`), and contextual feedback colors (success, warning, error, info).
   - **Design Architecture:** CSS custom variables (`:root`), grid/flex layout utilities, clean card components, status/priority badges, responsive header/navbar, form controls, action buttons, preformatted code/output panels, and CSS micro-animations (hover transitions, active states, focus rings).
3. **EJS Modular Partial Templates (`src/views/partials/`):**
   - `header.ejs`: Standardized HTML `<head>`, font stylesheets, metadata, CSS imports.
   - `navbar.ejs`: Top navigation header displaying branding, user session info, primary navigation links, and logout trigger.
   - `footer.ejs`: Clean institutional footer and disclaimer banner indicating local lab execution.
4. **Comprehensive View Refactoring (12 Views across 7 Domains):**
   - `Home` (`src/views/home.ejs`)
   - `Auth` (`src/views/auth/login.ejs`, `src/views/auth/register.ejs`)
   - `Dashboard` (`src/views/dashboard.ejs`)
   - `Tickets` (`src/views/tickets/index.ejs`, `src/views/tickets/detail.ejs`, `src/views/tickets/form.ejs`)
   - `Assets` (`src/views/assets/index.ejs`, `src/views/assets/detail.ejs`, `src/views/assets/form.ejs`)
   - `Diagnostics` (`src/views/diagnostics/index.ejs`)
   - `Admin` (`src/views/admin/index.ejs`)

---

## 3. Business & Academic Value

- **Realism for Security Audits & DAST Scanning:** Elevates the application to look like an actual production-grade enterprise IT Helpdesk portal, providing realistic target surfaces during Kali Linux DAST execution (OWASP ZAP scans, manual penetration testing) without altering any underlying vulnerability mechanics.
- **Maintainability & DRY Code:** Eliminates HTML head duplication across 12 EJS templates by centralizing layout structure into modular partials (`header`, `navbar`, `footer`).
- **Performance & Zero Build Overhead:** Uses pure Vanilla CSS with zero npm dependencies, bundlers, or CSS processors, ensuring instant page loads and straightforward maintenance.

---

## 4. Scope Boundaries

### In-Scope
- Creation of `/public/css/styles.css` containing design variables, base styles, layout grid, typography, cards, forms, tables, badges, and animations.
- Creation of `src/views/partials/header.ejs`, `src/views/partials/navbar.ejs`, and `src/views/partials/footer.ejs`.
- Refactoring of all 12 EJS files in `src/views/` to wrap page content inside partials and apply Semantic HTML CSS classes (`.app-header`, `.navbar`, `.card`, `.badge`, `.table`, `.form-group`, `.btn`, `.grid`).
- Verification of Express static middleware in `src/app.js` (`app.use(express.static(...))`).

### Out-of-Scope & Hard Constraints
- **NO Changes to Security Logic:** No input sanitization, output encoding, or security fixes (e.g., CSRF tokens, escaping raw output, fixing SQLi/Command Injection/SSRF) will be performed.
- **Preservation of Raw EJS Output:** All `<%- ... %>` tags (e.g., `<%- ticket.description %>`, `<%- comment.body %>`, `<%- search %>`) MUST remain exact.
- **Preservation of Vulnerability Comments:** All `<!-- [VULN-xxx]... -->` inline annotations MUST be preserved in their exact locations.
- **NO External CSS Frameworks:** Bootstrap, Tailwind, Material, etc. will not be used; pure Vanilla CSS design system will be implemented.

---

## 5. Proposed Architecture & Implementation Strategy

### A. Directory Structure Overview
```
v1-inseguro/
├── public/
│   └── css/
│       └── styles.css          <-- New Vanilla CSS Design System stylesheet
└── src/
    ├── app.js                  <-- Express static file middleware verification
    └── views/
        ├── partials/           <-- New reusable template partials
        │   ├── header.ejs
        │   ├── navbar.ejs
        │   └── footer.ejs
        ├── home.ejs            <-- Refactored with Enterprise Light UI
        ├── dashboard.ejs       <-- Refactored
        ├── admin/
        │   └── index.ejs       <-- Refactored
        ├── assets/
        │   ├── detail.ejs      <-- Refactored
        │   ├── form.ejs        <-- Refactored
        │   └── index.ejs       <-- Refactored
        ├── auth/
        │   ├── login.ejs       <-- Refactored
        │   └── register.ejs    <-- Refactored
        ├── diagnostics/
        │   └── index.ejs       <-- Refactored
        └── tickets/
            ├── detail.ejs      <-- Refactored
            ├── form.ejs        <-- Refactored
            └── index.ejs       <-- Refactored
```

### B. Design Token Architecture (`styles.css`)

```css
:root {
  /* Typography */
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-heading: 'Outfit', system-ui, -apple-system, sans-serif;

  /* Color Palette - Enterprise Corporate Light */
  --color-primary: #0f52ba;
  --color-primary-hover: #0d47a1;
  --color-primary-light: #e8f0fe;
  --color-secondary: #475569;

  --color-bg-app: #f8fafc;
  --color-surface: #ffffff;
  --color-border: #e2e8f0;
  --color-border-hover: #cbd5e1;

  /* Text Colors */
  --color-text-main: #0f172a;
  --color-text-muted: #64748b;
  --color-text-white: #ffffff;

  /* Status Colors & Badges */
  --badge-open-bg: #dbeafe;
  --badge-open-text: #1e40af;
  --badge-progress-bg: #fef3c7;
  --badge-progress-text: #92400e;
  --badge-closed-bg: #e2e8f0;
  --badge-closed-text: #334155;
  --badge-urgent-bg: #fee2e2;
  --badge-urgent-text: #991b1b;

  /* Shadows & Radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);

  /* Micro-animations */
  --transition-fast: all 0.15s ease-in-out;
  --transition-normal: all 0.25s ease-in-out;
}
```

### C. Component Patterns
1. **Cards & Containers:** White surface, border, soft shadow, smooth hover elevate animation.
2. **Forms & Inputs:** Standardized height, subtle border color, distinct focus state (`outline` ring), clean submit/cancel button groups.
3. **Data Tables:** Styled `<thead>` background, zebra hover states on rows, aligned status badges.
4. **Status Badges:** Rounded pills (`.badge-status`, `.badge-priority`) with high contrast text for ticket states (`open`, `in_progress`, `closed`) and priority (`low`, `medium`, `high`, `urgent`).
5. **Navbar:** Sticky top header with branding logo icon, active route highlighting, user profile pill, and clean logout button.
6. **Preformatted Output (Diagnostics):** Styled terminal-like block (`.terminal-output`) for command results (`ping` and `health-check`).

---

## 6. Target Modules & Affected Views

| Module | View File | Key Changes & UI Components |
|---|---|---|
| **Static Setup** | `src/app.js` | Confirm `app.use(express.static(path.join(__dirname, '..', 'public')))` serves `public/css/styles.css` |
| **Partials** | `src/views/partials/header.ejs` | Includes Google Fonts link (`Inter`, `Outfit`) & `<link rel="stylesheet" href="/css/styles.css">` |
| **Partials** | `src/views/partials/navbar.ejs` | Clean horizontal header with logo, navigation links, and session info |
| **Partials** | `src/views/partials/footer.ejs` | Standard footer with security lab disclaimer |
| **Home** | `src/views/home.ejs` | Hero section card, call-to-action buttons for Login / Register |
| **Auth** | `src/views/auth/login.ejs` | Centered login card form, error alert banner |
| **Auth** | `src/views/auth/register.ejs` | Centered registration form with user/role selection |
| **Dashboard** | `src/views/dashboard.ejs` | Quick metric/action card grid linking to Tickets, Assets, Diagnostics, Admin |
| **Tickets** | `src/views/tickets/index.ejs` | Filter card, ticket list cards with badges, search input retaining unescaped search tag |
| **Tickets** | `src/views/tickets/detail.ejs` | Main ticket detail card, unescaped description box, comments thread, file attachments list |
| **Tickets** | `src/views/tickets/form.ejs` | Create/Edit ticket form card with asset drop-down selector |
| **Assets** | `src/views/assets/index.ejs` | Search bar & asset inventory table with status tags |
| **Assets** | `src/views/assets/detail.ejs` | Asset detail overview card & associated ticket list |
| **Assets** | `src/views/assets/form.ejs` | Create/Edit asset form card |
| **Diagnostics** | `src/views/diagnostics/index.ejs` | Dual diagnostic cards (Ping Target & Service Health Check) with terminal output boxes |
| **Admin** | `src/views/admin/index.ejs` | Admin user account table with role badges |

---

## 7. Acceptance Criteria

- [ ] **Static Assets Available:** Requesting `/css/styles.css` returns the Vanilla CSS design system stylesheet with HTTP status `200 OK`.
- [ ] **Design Token System Applied:** Google Fonts (`Inter` & `Outfit`), corporate blue palette, CSS variables, and micro-animations render consistently across all pages.
- [ ] **Partials Modularization:** `header.ejs`, `navbar.ejs`, and `footer.ejs` are imported across all 12 EJS views.
- [ ] **Component Polish:** Cards, status badges, forms, action buttons, tables, and diagnostic outputs match the Enterprise Light aesthetic.
- [ ] **Functional & Vulnerability Parity:**
  - Login, registration, ticket creation/editing/closing, comment posting, attachment uploads, asset management, network diagnostics, and admin user table remain 100% operational.
  - All `<%- ... %>` unescaped tags remain intact (e.g. stored XSS in ticket description and comments, reflected XSS in ticket search).
  - All `<!-- [VULN-xxx]... -->` inline annotations remain untouched in source templates.
- [ ] **Responsive Design:** Interfaces adjust smoothly across mobile (flex vertical stack) and desktop screens (grid multi-column).

---

## 8. Next Steps & Execution Plan

Upon approval of this SDD proposal:
1. Create stylesheet `v1-inseguro/public/css/styles.css` with complete design tokens and component rules.
2. Build template partials in `v1-inseguro/src/views/partials/` (`header.ejs`, `navbar.ejs`, `footer.ejs`).
3. Update each of the 12 EJS views with semantic HTML tags and styling wrappers while strictly preserving all raw HTML rendering tags (`<%- ... %>`) and vulnerability annotations.
4. Verify application build and execute full manual & automated test suite to confirm zero functional regressions.
