# UI Consistency Spec

## Shell

- Left navigation rail with product identity, main sections, and collection mode.
- Main topbar with current task and manual refresh.
- First content band with global status counts.
- Main workspace with host matrix and selected detail panel.

## Components

- `StatusPill`
- `HostPanel`
- `MetricBar`
- `ServerMatrix`
- `DryRunActionPanel`
- `DiagnosticReport`
- `AgentApiManifest`

## Color Tokens

- Background: `#f6f8fb`
- Sidebar: `#101820`
- Text: `#17202a`
- Muted text: `#657383`
- Border: `#dde5ee`
- Normal: `#26a269`
- Warning: `#d99000`
- Critical: `#c64646`
- Unknown: `#8b96a3`
- Action blue: `#1769aa`

## Density

- Operational controls should be compact and predictable.
- Cards are used only for host rows, panels, and repeated summaries.
- No nested cards.
- Text should not wrap awkwardly inside buttons.

