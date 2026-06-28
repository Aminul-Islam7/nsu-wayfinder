# Execution Plan

- [x] **Phase 1: Foundation**
    - [x] Scaffold project (Vite + React + TypeScript + Tailwind + shadcn/ui).
    - [x] Setup Supabase schema (`map_features`, RLS, `get_feature_collection()` RPC).
    - [x] Seed map data from cleaned GeoJSON.
    - [x] Basic read-only map rendering live data setup.
    - [x] Initialized Git repository, configured remote, and pushed initial commit to GitHub.

- [x] **Phase 2: Core Navigation**
    - [x] QR param parsing + snapping.
    - [x] Graph construction (undirected).
    - [x] Single-floor pathfinding and route rendering.

- [x] **Phase 3: Multi-floor**
    - Transit edges, level switching, and overlaid visualization.

- [x] **Phase 4: Visitor UX Polish**
  - Destination search, turn-by-turn bottom sheet (now integrated inline), dark mode, responsive UI, curved route smoothing.

- [ ] **Phase 5: Admin Tools**
    - Auth gate setup.
    - POI CRUD.
    - Path drawing CRUD.
    - Linked transit-pair tool.

- [ ] **Phase 6: Stretch Goals**
    - QR code generator.
    - Realtime multi-admin sync.
    - Footprint editing tool.
