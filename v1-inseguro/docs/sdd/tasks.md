# Software Design Description (SDD) Task Breakdown: Enterprise Light / Clean Tech Vanilla CSS Design System

**Project:** `v1-inseguro` (IT Helpdesk Security Lab)
**Status:** Task Breakdown / Ready for Execution
**Date:** July 19, 2026
**Target File:** `v1-inseguro/docs/sdd/tasks.md`
**Based on Approved Proposal:** `v1-inseguro/docs/sdd/proposal.md`

> [!IMPORTANT]
> **REGLA DE ORO INVIOLABLE / NON-NEGOTIABLE CORE RULE:**
> All tasks strictly modify CSS and HTML layout structure.
> 1. **ZERO backend logic changes:** No modification to controllers, routes, models, or DB scripts (`src/modules/*`, `src/db/*`).
> 2. **ZERO vulnerability fixes:** Do not escape raw output or fix any security vulnerabilities (`SQLi`, `Stored/Reflected XSS`, `CSRF`, `IDOR`, `Command Injection`, `SSRF`, `Broken Access Control`).
> 3. **Preserve EJS tags & comments:** Keep all `<%- ... %>` raw output tags, form input `name`/`action` attributes, and inline vulnerability annotations (`<!-- [VULN-xxx] -->`) 100% intact.

---

## Task List

### 1. Environment & Setup
- [x] **Task 1.1:** Verify and ensure Express static file middleware in `v1-inseguro/src/app.js` correctly serves the `/public` directory (allowing HTTP requests to `/css/styles.css`).
- [x] **Task 1.2:** Ensure target directory paths exist for static CSS (`public/css/`) and partial views (`src/views/partials/`).

### 2. Design System & CSS Assets (`/public/css/styles.css`)
- [x] **Task 2.1:** Create `v1-inseguro/public/css/styles.css` with CSS custom variables (`:root`) defining the Enterprise Light palette (`#0f52ba`, `#1a73e8`, `#f8fafc`, `#ffffff`), typography (`Inter`, `Outfit`), shadows, radii, and micro-transitions.
- [x] **Task 2.2:** Add CSS base resets and global styling (box-sizing, container sizing, page background, body text, heading hierarchies).
- [x] **Task 2.3:** Add CSS Grid & Flexbox layout helper classes (`.container`, `.grid`, `.grid-2`, `.grid-3`, `.grid-4`, `.flex`, `.flex-between`, `.gap-md`).
- [x] **Task 2.4:** Add Component styles for Surface Cards (`.card`, `.card-header`, `.card-body`, `.card-footer`, `.card-hover`).
- [x] **Task 2.5:** Add Component styles for Buttons (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-outline`, `.btn-sm`) and Flash Alerts (`.alert`, `.alert-error`, `.alert-success`, `.alert-info`).
- [x] **Task 2.6:** Add Component styles for Form Controls (`.form-group`, `.form-label`, `.form-control`, `.form-select`, `.form-actions`).
- [x] **Task 2.7:** Add Component styles for Data Tables (`.table`, `.table-striped`, `.table-hover`) and Status/Priority Badge Pills (`.badge`, `.badge-open`, `.badge-progress`, `.badge-closed`, `.badge-urgent`, `.badge-high`, `.badge-medium`, `.badge-low`).
- [x] **Task 2.8:** Add Layout Header, Navigation (`.app-header`, `.navbar`, `.nav-brand`, `.nav-links`, `.nav-user`, `.footer`), and Terminal Output box for diagnostics (`.terminal-output`).

### 3. EJS Layout Partials (`src/views/partials/`)
- [x] **Task 3.1:** Create `v1-inseguro/src/views/partials/header.ejs` containing HTML `<head>`, Google Fonts links (`Inter` & `Outfit`), viewport metadata, page title, and stylesheet link (`/css/styles.css`).
- [x] **Task 3.2:** Create `v1-inseguro/src/views/partials/navbar.ejs` containing Enterprise top header navigation, logo branding, active link states, user profile pill, and conditional session routes.
- [x] **Task 3.3:** Create `v1-inseguro/src/views/partials/footer.ejs` containing enterprise footer layout, educational lab disclaimer banner, and closing `</body></html>` tags.

### 4. View Refactoring by Domain

#### 4.1 Home Domain
- [x] **Task 4.1.1:** Refactor `v1-inseguro/src/views/home.ejs` using EJS partials (`header.ejs`, `navbar.ejs`, `footer.ejs`), wrapping content in an Enterprise Light hero card with quick-action CTA buttons.

#### 4.2 Auth Domain
- [x] **Task 4.2.1:** Refactor `v1-inseguro/src/views/auth/login.ejs` into a centered login card form with styled inputs and alerts, strictly preserving form `action`, `method`, `name="username"`, `name="password"`, and `<!-- [VULN-001] -->` inline comment.
- [x] **Task 4.2.2:** Refactor `v1-inseguro/src/views/auth/register.ejs` into a clean registration card form, strictly preserving form fields, role selectors, and `<!-- [VULN-002] -->` inline comment.

#### 4.3 Dashboard Domain
- [x] **Task 4.3.1:** Refactor `v1-inseguro/src/views/dashboard.ejs` to present a 4-card metric grid for quick navigation to Tickets, Assets, Network Diagnostics, and User Management.

#### 4.4 Tickets Domain
- [x] **Task 4.4.1:** Refactor `v1-inseguro/src/views/tickets/index.ejs` with a search card, ticket list table/grid with status badges, while preserving unescaped search tag `<%- search %>` and vulnerability comments (`<!-- [VULN-003] -->`, `<!-- [VULN-004] -->`).
- [x] **Task 4.4.2:** Refactor `v1-inseguro/src/views/tickets/detail.ejs` with ticket header card, status badges, unescaped raw description block `<%- ticket.description %>`, attachment download panel, and raw comment thread `<%- comment.body %>`, preserving vulnerability comments (`<!-- [VULN-005] -->`, `<!-- [VULN-006] -->`, `<!-- [VULN-007] -->`).
- [x] **Task 4.4.3:** Refactor `v1-inseguro/src/views/tickets/form.ejs` with modern ticket create/edit card form, dropdown selectors, and file attachment inputs.

#### 4.5 Assets Domain
- [x] **Task 4.5.1:** Refactor `v1-inseguro/src/views/assets/index.ejs` with asset search filter card and inventory data table with status tags.
- [x] **Task 4.5.2:** Refactor `v1-inseguro/src/views/assets/detail.ejs` with asset details overview card and linked tickets list, preserving unescaped fields `<%- asset.notes %>` and vulnerability comments (`<!-- [VULN-008] -->`).
- [x] **Task 4.5.3:** Refactor `v1-inseguro/src/views/assets/form.ejs` with modern asset create/edit card form.

#### 4.6 Diagnostics Domain
- [x] **Task 4.6.1:** Refactor `v1-inseguro/src/views/diagnostics/index.ejs` with dual diagnostic action cards (Ping Target & Service Health Check) and terminal output container (`.terminal-output`), preserving raw command parameters and vulnerability comments (`<!-- [VULN-009] -->`, `<!-- [VULN-010] -->`).

#### 4.7 Admin Domain
- [x] **Task 4.7.1:** Refactor `v1-inseguro/src/views/admin/index.ejs` with user administration data table, role badges, and privilege control buttons, preserving vulnerability comments (`<!-- [VULN-011] -->`, `<!-- [VULN-012] -->`).

### 5. Verification & Testing
- [x] **Task 5.1:** Verify `/css/styles.css` is served with HTTP status `200 OK` and fonts (`Inter`, `Outfit`) load cleanly.
- [x] **Task 5.2:** Perform visual rendering check on all 12 refactored EJS views across viewport sizes (desktop grid & mobile flex stack).
- [x] **Task 5.3:** Perform functional & vulnerability non-regression verification: confirm zero broken form actions, zero missing raw `<%- ... %>` EJS tags, and 100% presence of inline `<!-- [VULN-xxx] -->` annotations.
