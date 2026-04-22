# wraith-idle

> **Authorized use only.** This module is part of [Wraith](https://github.com/tilmana/wraith), an educational security research tool. Do not use against systems without explicit permission. See the [LICENSE](../../LICENSE) for details.

Idle & tab visibility tracker module for Wraith.

## What it does

- Tracks `visibilitychange` events (tab visible/hidden)
- Tracks `focus` and `blur` events (window focus state)
- Detects mouse/keyboard/scroll inactivity (30s threshold) via a poll
- Provides time breakdown: visible vs hidden, focused vs blurred, active vs idle

## UI

- **Panel**: live status indicator (Active / Unfocused / Hidden / Idle), tab visibility, window focus, state change count
- **View**: time breakdown stats, filterable event timeline with color-coded entries, CSV/JSON export

## Capture

| Type | ID / Event | Persist | Description |
|------|------------|---------|-------------|
| event | `visibilitychange` | yes | `state` (visible/hidden), `t` timestamp |
| event | `focus` | yes | `t` timestamp |
| event | `blur` | yes | `t` timestamp |
| event | `mousemove` | no | Throttled 5s — drives live idle detection only |
| poll | `idle-check` | yes | Every 5s — emits state change when user goes idle (30s) or returns |

## Commands

None.

## Screenshots

See [demo screenshots](https://github.com/tilmana/wraith#idle-screenshots) in the main Wraith repo.

## Install

Clone or copy this directory into the Wraith `modules/` folder, run `pnpm install`, and restart the dev server. The framework discovers modules automatically.
