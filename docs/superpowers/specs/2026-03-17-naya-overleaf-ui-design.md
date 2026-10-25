# Naya Overleaf UI Design Spec

Date: 2026-03-17
Status: Approved draft for implementation planning
Scope: Desktop-first product UI for Auth, Dashboard, Workspace, AI, Collaboration, Settings, and Light Admin Status.

## 1) UX North Star

Design for expert-grade LaTeX authoring with calm clarity.

Primary tension: high product power (large docs, AI, collaboration, diagnostics) vs low cognitive load.

North star: move users from idea -> write -> compile -> fix -> share with minimal friction, predictable performance, and strong reliability signals.

### Principles
1. Flow-first over feature-first
2. Progressive disclosure for advanced actions
3. Persistent status clarity (compile, sync, presence, AI)
4. Keyboard-primary interaction model
5. Calm hierarchy (neutral surfaces, restrained accents)
6. Reliability signaling that builds trust

## 2) Information Architecture

### Top-level areas
- Auth
- Dashboard
- Project Workspace
- Settings
- Admin Status (light)

### Navigation model
- Global shell: top utility bar + left workspace rail
- Workspace shell:
  - Left: file tree and project tools
  - Center: editor tabs + LaTeX editor
  - Right: tabbed utility panel (Preview / AI / Comments)
  - Bottom: compile/status/diagnostics bar
- Command palette (`Cmd/Ctrl+K`) for global actions

## 3) Layout Specs

### 3.1 Auth
- Centered card, max-width 420px
- 24px section rhythm, 12px control rhythm
- Required states: default/loading/inline error/form error

### 3.2 Dashboard
- Top row: search, quick create, notifications, user menu
- Content: Recent, Shared, Templates, optional Activity panel
- Primary actions: New Project, Import, Continue Last Session

### 3.3 Workspace (Editor + Preview)
- Default split: 45% editor / 55% preview
- Resizable with snap presets: 33/67, 50/50, 67/33
- Regions:
  1) Project bar
  2) File tree
  3) Editor tabs + editor
  4) Right utility panel (Preview/AI/Comments)
  5) Bottom compile/status bar
- Compile errors deep-link to source line and preview context

### 3.4 Settings
- Two-column layout: section nav + form content
- Save/Reset per section
- Unsaved changes indicator
- Danger zone isolated

### 3.5 Admin / Reliability (Light)
- Health cards (API/compile/storage/collab)
- Queue and latency summary
- Incident list with severity + timestamp

## 4) Responsive Rules

### Breakpoints
- XL: 1920+
- L: 1440-1919
- M: 1280-1439
- Tablet (limited): 900-1279

### Behavior
- 1920: full three-pane comfort mode
- 1440: three-pane with tighter gutters
- 1280: right panel becomes on-demand drawer when needed
- Tablet: pane toggle model (Editor <-> Preview)
- Mobile: non-primary target

## 5) Design Tokens

```css
:root {
  --color-bg-canvas: #f6f7f9;
  --color-bg-surface: #ffffff;
  --color-bg-subtle: #f1f3f6;
  --color-border-default: #d9dee6;
  --color-border-strong: #bcc5d2;
  --color-text-primary: #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted: #64748b;

  --color-primary-500: #4f46e5;
  --color-primary-600: #4338ca;
  --color-primary-700: #3730a3;
  --color-primary-soft: #e8eaff;

  --color-success-500: #16a34a;
  --color-warning-500: #d97706;
  --color-error-500: #dc2626;
  --color-info-500: #2563eb;

  --color-editor-bg: #0f172a;
  --color-editor-panel: #111827;
  --color-editor-line: #1f2937;
  --color-editor-text: #dbe4f0;
  --color-editor-muted: #94a3b8;
  --color-editor-accent: #818cf8;

  --font-sans: "Inter", "Geist", "Source Sans 3", "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;

  --font-size-12: 0.75rem;
  --font-size-13: 0.8125rem;
  --font-size-14: 0.875rem;
  --font-size-16: 1rem;
  --font-size-18: 1.125rem;
  --font-size-20: 1.25rem;

  --space-4: 0.25rem;
  --space-8: 0.5rem;
  --space-12: 0.75rem;
  --space-16: 1rem;
  --space-20: 1.25rem;
  --space-24: 1.5rem;
  --space-32: 2rem;
  --space-40: 2.5rem;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  --shadow-1: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-2: 0 4px 12px rgba(15, 23, 42, 0.10);

  --motion-fast: 120ms cubic-bezier(0.2, 0, 0, 1);
  --motion-base: 180ms cubic-bezier(0.2, 0, 0, 1);

  --z-dropdown: 1000;
  --z-modal: 1300;
  --z-toast: 1400;
  --z-command: 1500;

  --focus-ring-color: rgba(79, 70, 229, 0.45);
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;
}
```

## 6) Component Specs + States

Required states where applicable: default, hover, active, focus-visible, disabled, loading, error.

- Buttons: primary/secondary/ghost/danger (28/32/40 heights)
- Inputs: text/password/search with helper + inline error text/icon
- Select: keyboard navigable, searchable for long lists
- Toggle: labeled only
- Tabs: global + editor tabs with dirty marker
- Sidebar: expanded/collapsed
- File tree: selected/hover/rename/drag-over/conflict
- Compile status bar: idle/compiling/success/warning/error/offline
- Toasts: success/info/warning/error
- Modals: confirmation/form/task modal with focus trap
- Empty/loading/error states with clear next action

## 7) AI Interaction Model

- Inline ghost suggestions (accept Tab, dismiss Esc)
- Prompt side panel with scope (selection/file/project)
- Error explanation modal from compile diagnostics
- Diff preview before non-trivial insertion
- Explicit AI attribution + one-step undo + activity trace

## 8) Collaboration Model

- Presence avatar stack + collaborator cursors
- Anchored comments/annotations with threaded panel
- Share modal: invite/link/role assignment
- Roles: Owner, Editor, Commenter, Viewer

## 9) Accessibility (WCAG 2.1 AA)

- Text contrast >= 4.5:1; UI controls >= 3:1
- Full keyboard operability for all core tasks
- Persistent visible focus styling
- Semantic labels/roles for forms, tree, tabs, dialogs
- Non-color error indicators
- `aria-live` status updates for compile/async states
- Respect `prefers-reduced-motion`

## 10) Handoff Rules

- Components consume semantic tokens only (no inline hex)
- Explicit state tokens per component
- 4px baseline spacing grid
- Gutters: 24px (1280), 32px (1440), 40px (1920)
- Min interactive targets: 32px desktop, 40px tablet

---

# Figma-Ready Frame Map

## File structure

### Page 01 - Foundations
1. Cover
2. Design principles
3. Color tokens (light + editor dark)
4. Typography scale
5. Spacing/radius/shadow/motion/z-index/focus tokens
6. Icon sizing + stroke rules

### Page 02 - Components Core
1. Buttons (all variants + states)
2. Inputs/select/toggle/textarea
3. Tabs/chips/badges/tooltips
4. Toasts/banners/alerts
5. Modals/drawers/dropdowns
6. Loaders/skeletons/empty states/error states

### Page 03 - Components Workspace
1. Sidebar shell
2. File tree (all states)
3. Editor tabs
4. Compile status bar
5. Presence avatars/cursors
6. Comment thread primitives
7. AI suggestion bubble + AI panel controls

### Page 04 - Flows Auth
Frames:
- A1 Login default
- A2 Login error
- A3 Signup
- A4 Reset password

### Page 05 - Flows Dashboard
Frames:
- D1 Dashboard 1920
- D2 Dashboard 1440
- D3 Dashboard 1280
- D4 Project create modal
- D5 Search/filter active
- D6 Empty state (no projects)

### Page 06 - Flows Workspace (Core)
Frames:
- W1 Workspace default 1440 (3-pane)
- W2 Workspace 1280 (drawer right panel)
- W3 Workspace 1920 (comfort density)
- W4 Compile in progress
- W5 Compile success
- W6 Compile error + log selected
- W7 Jump-to-error result in editor

### Page 07 - Flows AI
Frames:
- AI1 Inline suggestion shown
- AI2 Prompt panel open (scope selector)
- AI3 AI insertion diff preview
- AI4 Error explanation modal
- AI5 AI action history state

### Page 08 - Flows Collaboration
Frames:
- C1 Multi-user presence
- C2 Inline annotation + thread panel
- C3 Share modal role assignment
- C4 Permission denied state

### Page 09 - Settings + Admin
Frames:
- S1 User profile
- S2 AI key management
- S3 Project settings
- S4 Account preferences
- R1 Reliability status overview
- R2 Compile queue warning state

### Page 10 - Accessibility + QA
1. Focus order maps (key flows)
2. Contrast audit table
3. Keyboard shortcut overlays
4. Reduced motion variants
5. Component state matrix checklist

## Frame conventions
- Naming: `[Area]-[Flow]-[State]-[Breakpoint]` (example: `Workspace-Compile-Error-1440`)
- Breakpoint widths: 1280, 1440, 1920, 1024 tablet limited
- Auto-layout required on all reusable components
- Variant properties required: `state`, `size`, `tone`, `density`, `theme`

---

# React Component Inventory Checklist

## Foundation
- [ ] `ThemeProvider`
- [ ] `TokenVariables` (CSS vars bootstrap)
- [ ] `AppShell`
- [ ] `CommandPalette`
- [ ] `HotkeyProvider`

## Primitives
- [ ] `Button`
- [ ] `IconButton`
- [ ] `Input`
- [ ] `PasswordInput`
- [ ] `Select`
- [ ] `Toggle`
- [ ] `Textarea`
- [ ] `Tooltip`
- [ ] `Badge`
- [ ] `Tag`

## Feedback + Overlays
- [ ] `ToastProvider` + `Toast`
- [ ] `InlineAlert`
- [ ] `Modal`
- [ ] `ConfirmDialog`
- [ ] `Drawer`
- [ ] `DropdownMenu`
- [ ] `Skeleton`
- [ ] `EmptyState`
- [ ] `ErrorState`

## Auth Flow
- [ ] `AuthCard`
- [ ] `LoginForm`
- [ ] `SignupForm`
- [ ] `ResetPasswordForm`

## Dashboard
- [ ] `DashboardLayout`
- [ ] `ProjectSearchBar`
- [ ] `ProjectFilterBar`
- [ ] `ProjectCard`
- [ ] `ProjectTableRow`
- [ ] `RecentProjectsSection`
- [ ] `SharedProjectsSection`
- [ ] `TemplateSection`
- [ ] `CreateProjectModal`

## Workspace Shell
- [ ] `WorkspaceLayout`
- [ ] `ProjectTopBar`
- [ ] `WorkspaceSidebar`
- [ ] `FileTree`
- [ ] `FileTreeItem`
- [ ] `EditorTabs`
- [ ] `EditorTab`
- [ ] `EditorContainer`
- [ ] `PreviewPanel`
- [ ] `RightUtilityTabs`
- [ ] `BottomStatusBar`
- [ ] `CompileStatusPill`
- [ ] `CompileLogPanel`
- [ ] `CompileErrorList`

## AI
- [ ] `AISuggestionBubble`
- [ ] `AIPromptPanel`
- [ ] `AIScopeSelector`
- [ ] `AIResultCard`
- [ ] `AIInsertionDiffModal`
- [ ] `AIErrorExplainModal`
- [ ] `AIActivityTimeline`

## Collaboration
- [ ] `PresenceAvatarStack`
- [ ] `CollaboratorCursorLayer`
- [ ] `CommentAnchor`
- [ ] `CommentThreadPanel`
- [ ] `CommentComposer`
- [ ] `ShareProjectModal`
- [ ] `PermissionMatrix`
- [ ] `RoleBadge`

## Settings + Admin
- [ ] `SettingsLayout`
- [ ] `ProfileSettingsForm`
- [ ] `AIKeyManagementForm`
- [ ] `ProjectSettingsForm`
- [ ] `AccountPreferencesForm`
- [ ] `DangerZoneCard`
- [ ] `SystemStatusCard`
- [ ] `CompileQueueStatusPanel`
- [ ] `IncidentList`

## Accessibility / Reliability Helpers
- [ ] `FocusRingStyle`
- [ ] `LiveRegionStatus`
- [ ] `ShortcutHint`
- [ ] `ReducedMotionGuard`
- [ ] `AsyncStateBoundary`

## State & QA matrix (must verify)
- [ ] All interactive components: focus-visible behavior
- [ ] Keyboard-only completion for auth, create project, compile, jump to error, share
- [ ] Non-color error messaging in all forms
- [ ] Compile + AI async states do not block editing
- [ ] Tablet limited layout remains usable for core flows
