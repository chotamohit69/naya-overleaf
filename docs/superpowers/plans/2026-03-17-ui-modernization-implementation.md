# Naya Overleaf UI Modernization (Incremental React Migration) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incrementally modernize the current vanilla JS client into a React-based, keyboard-first, accessible UI system that matches the approved 2026-03-17 design spec, without disrupting existing editing/compile workflows or requiring a big-bang rewrite.

**Architecture:** Strangler-fig migration: keep existing runtime and APIs, progressively mount React islands into `public/index.html`, then expand islands into full page regions while preserving legacy class modules (`LatexEditor`, `PdfPreview`) through adapter wrappers until replacement is low-risk.

**Tech Stack:** React 18 + existing Webpack/Babel pipeline, CSS variable/token system from spec, Jest for unit/integration client tests, Playwright for key E2E flows, Socket.IO/ShareDB/PDF.js integrations via adapter services.

---

## Chunk 1: Migration Foundation, Mount Strategy, and Risk Controls

### Milestone
Create a safe React bootstrap and feature-flagged mount points while preserving current behavior.

### React component groups in scope
- Foundation: `ThemeProvider`, `TokenVariables`, `AppShell` (scaffold only), `HotkeyProvider` (scaffold only)

### Files
- Modify: `public/index.html`, `src/client/index.js`, `webpack.config.js` (if needed for `.jsx?` handling)
- Create: `src/client/react/bootstrap/mountReactIslands.js`, `src/client/react/bootstrap/featureFlags.js`, `src/client/react/foundation/AppShell.js`, `src/client/react/foundation/ThemeProvider.js`, `src/client/react/foundation/HotkeyProvider.js`

### Acceptance criteria
- [ ] Legacy flows still work (project load/edit/compile)
- [ ] React can mount/unmount independently under feature flag
- [ ] No duplicate editor/socket initialization
- [ ] Baseline accessibility does not regress

---

## Chunk 2: Design Tokens, Theming, and A11y Reliability Primitives

### Milestone
Establish spec-compliant design language and accessibility primitives before broad feature migration.

### React component groups in scope
- Foundation: `TokenVariables`, `ThemeProvider`
- A11y/Reliability: `FocusRingStyle`, `LiveRegionStatus`, `ReducedMotionGuard`, `AsyncStateBoundary`, `ShortcutHint`

### Files
- Modify: `src/client/styles/main.css`
- Create: `src/client/styles/tokens.css`, `src/client/styles/themes.css`, `src/client/react/a11y/*`, `src/client/react/reliability/AsyncStateBoundary.js`

### Acceptance criteria
- [ ] Light/dark/system theme support with persistence
- [ ] Visible focus rings across interactive controls
- [ ] `aria-live` async status announcement support
- [ ] Semantic tokens used instead of hardcoded colors

---

## Chunk 3: Core Primitive Library and Overlay System

### Milestone
Build reusable React primitives and overlays to avoid duplicated feature-level UI logic.

### React component groups in scope
- Primitives: `Button`, `IconButton`, `Input`, `PasswordInput`, `Select`, `Toggle`, `Textarea`, `Tooltip`, `Badge`, `Tag`
- Feedback/Overlays: `ToastProvider`, `Toast`, `InlineAlert`, `Modal`, `ConfirmDialog`, `Drawer`, `DropdownMenu`, `Skeleton`, `EmptyState`, `ErrorState`

### Acceptance criteria
- [ ] Component state matrix coverage
- [ ] Focus-trap and keyboard-safe overlays
- [ ] Legacy and React notifications unified through one toast system
- [ ] No speculative variants outside spec

---

## Chunk 4: Auth + Dashboard React Flows

### Milestone
Deliver Auth and Dashboard in React while handing off workspace open actions to legacy workspace path.

### React component groups in scope
- Auth: `AuthCard`, `LoginForm`, `SignupForm`, `ResetPasswordForm`
- Dashboard: `DashboardLayout`, `ProjectSearchBar`, `ProjectFilterBar`, `ProjectCard`, `ProjectTableRow`, `RecentProjectsSection`, `SharedProjectsSection`, `TemplateSection`, `CreateProjectModal`
- Foundation: `CommandPalette`

### Acceptance criteria
- [ ] Auth state coverage (default/loading/inline/form-level errors)
- [ ] Dashboard search/filter/create behavior working
- [ ] Keyboard command palette launches and triggers global actions
- [ ] No API contract regressions

---

## Chunk 5: Workspace Shell Migration with Legacy Adapters

### Milestone
Move workspace shell to React while reusing existing `LatexEditor` and `PdfPreview` internals via adapters.

### React component groups in scope
- Workspace: `WorkspaceLayout`, `ProjectTopBar`, `WorkspaceSidebar`, `FileTree`, `EditorTabs`, `EditorContainer`, `PreviewPanel`, `RightUtilityTabs`, `BottomStatusBar`, `CompileLogPanel`, `CompileErrorList`

### Acceptance criteria
- [ ] Split-pane presets and responsive behavior match spec
- [ ] Compile state visible and non-blocking
- [ ] Error deep-linking to source and preview context works
- [ ] Legacy editing + compile behavior preserved

---

## Chunk 6: AI + Collaboration + Settings/Admin

### Milestone
Complete AI, collaboration, settings, and reliability-status surfaces in React.

### React component groups in scope
- AI: `AISuggestionBubble`, `AIPromptPanel`, `AIScopeSelector`, `AIInsertionDiffModal`, `AIErrorExplainModal`
- Collaboration: `PresenceAvatarStack`, `CommentThreadPanel`, `ShareProjectModal`, `PermissionMatrix`
- Settings/Admin: `SettingsLayout`, `AIKeyManagementForm`, `SystemStatusCard`, `CompileQueueStatusPanel`, `IncidentList`

### Acceptance criteria
- [ ] AI interactions are explicit, attributed, reversible
- [ ] Permission model and role-based sharing works
- [ ] Settings forms include non-color error cues and unsaved-state handling
- [ ] Reliability cards surface basic health/queue/incidents clearly

---

## Chunk 7: Cutover, Cleanup, and Hardening

### Milestone
Remove deprecated legacy UI paths only after parity checks and lock in quality gates.

### Acceptance criteria
- [ ] Independent rollout/rollback toggles per surface
- [ ] Keyboard-only path for core user journeys validated
- [ ] WCAG 2.1 AA checks pass for required areas
- [ ] E2E flow: auth -> dashboard -> workspace -> compile fix -> share

---

## Roll-forward strategy (no big-bang rewrite)
- [ ] Per-surface feature flags (`authReact`, `dashboardReact`, `workspaceShellReact`, `aiReact`, `settingsReact`, `adminReact`)
- [ ] Legacy adapters retained until parity proven
- [ ] Decommission old code path only after acceptance + tests pass

## Start now
- [ ] Implement Chunk 1 first slice: feature-flagged React island mounting `ThemeProvider + ThemeToggle + LiveRegionStatus` while preserving all existing vanilla flows.
- [ ] Validate project load/edit/compile remains unchanged.
