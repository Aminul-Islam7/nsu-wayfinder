# Execution Plan

- [x] **Phase 1: Foundation**
  - [x] Scaffold project (Vite + React + TypeScript + Tailwind + shadcn/ui).
  - [x] Setup Supabase schema (`map_features`, RLS, `get_feature_collection()` RPC).
  - [x] Seed map data from cleaned GeoJSON.
  - [x] Basic read-only map rendering live data setup.
  - [x] Initialized Git repository, configured remote, and pushed initial commit to GitHub.

- [ ] **Phase 2: Core Navigation**
  - QR param parsing + snapping.
  - Graph construction.
  - Single-floor pathfinding and route rendering.

- [ ] **Phase 3: Multi-floor**
  - Transit edges, level switching, "Continue to Level X" flow.

- [ ] **Phase 4: Visitor UX Polish**
  - Destination search, turn-by-turn bottom sheet, dark mode, responsive UI.

- [ ] **Phase 5: Admin Tools**
  - Auth gate setup.
  - POI CRUD.
  - Path drawing CRUD.
  - Linked transit-pair tool.

- [ ] **Phase 6: Stretch Goals**
  - QR code generator.
  - Realtime multi-admin sync.
  - Footprint editing tool.
