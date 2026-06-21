# Product Requirements Document: NSU Indoor Navigation

## Project Context
Modern tech-based wayfinding solution for campus visitors (admission candidates, parents, freshers, guests) at North South University (NAC/SAC/Library complex).

## Core Philosophy
- **Zero friction:** No app download, no login for visitors.
- **QR Code Based:** Scan a physical QR code encoding visitor's coordinates/level -> open web app instantly -> snap to corridor -> pick destination -> shortest path across floors.

## User Roles
1. **Visitor (Unauthenticated)**: Scans QR, views map, selects destination, gets turn-by-turn.
2. **Admin (Authenticated)**: Logs in, edits POIs, paths, transit nodes visually on the map.

## Core Features
1. **Visitor UX**:
   - Initial snap to path from URL coords.
   - Destination selection & turn-by-turn UI (bottom sheet).
   - Multi-level navigation with transit switching (lift/stair).
2. **Admin UX**:
   - Auth-gated editing mode with visual indicator.
   - POI CRUD (Add, Edit, Delete, Move).
   - Path drawing and metadata editing.
   - Transit node pairs (lift/stair) generation.
