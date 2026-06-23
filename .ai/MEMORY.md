# Vibecoding Memory & Scratchpad

> *Purpose: A living document to log things learned, persistent bugs, or temporary states during development. Append notes here as we go to maintain context across sessions.*

## Current Status
- Phase 1 complete: scaffold + schema + seed done.
- Supabase project: `nsu-wayfinder` (id: `newohsmvykuelitzjrik`, region: ap-southeast-1)
- All 147 clean features seeded into `map_features`.

## Technical Decisions & Lessons Learned

### 2026-06-21 — Degenerate path fix decision
**Problem**: `path_L1_001` and `path_L2_001` were zero-length LineStrings — both vertices identical at `[90.426206, 23.815926]`.

**Decision: DELETED** (not fixed/repaired).

**Reasoning**:
- Coordinate `[90.426206, 23.815926]` is *outside* the building footprint. The footprint's northernmost vertex is `23.8158427`; the degenerate point sits at `23.815926` — ~6 m north of the roof line. It's a digitizing artifact (cursor click on empty space), not a real corridor gap.
- The rest of the path mesh (L1: paths 002–038; L2: paths 002–015) is fully connected across the corridor grid without any bridging needed at that coordinate.
- Fabricating a replacement path from an out-of-bounds point would inject a phantom edge into the graph, potentially routing users through a wall.
- Deleting is safe: Turf `nearestPointOnLine` will never crash on the remaining valid paths, and graphology will build a clean edge-set.

**Result**: Cleaned file saved as `nsu_indoor_map_merged_clean.geojson` (147 features, was 149).

### 2026-06-21 — accessible_via_path strategy
Field is `null` on all POIs in the source GeoJSON.

**Decision: Leave null for MVP.**

Routing for Phase 2 will use Turf `nearestPointOnLine` to snap any POI or QR-decoded position onto the nearest path segment at runtime. The `accessible_via_path` field is semantically dead weight for now but preserved in schema for a future admin tool that could explicitly link POIs to specific corridor segments (useful for complex indoor geometries where nearest-path snap could pick the wrong corridor).

### 2026-06-21 — Graph node keying
Transit nodes (lifts/staircases) at the same physical XY on L1 and L2 (e.g. `nac_lift_1_L1` and `nac_lift_1_L2` both at `[90.4257158, 23.8154311]`) must be keyed by `node_id` string, NOT by coordinate string. Coordinate-based dedup would collapse vertical edges into a single node, breaking multi-floor routing.

### 2026-06-21 — Vite scaffold wiped root
`create-vite --overwrite` on the project root deleted `.ai/` and the original GeoJSON. All `.ai/` files recreated from memory. The original GeoJSON is not restored (not needed — only the clean version is used going forward). `AGENTS.md` also lost — should be recreated if needed.

## Supabase Schema Notes
- Table: `map_features` — `feature_id` (unique), `geometry` (jsonb), `properties` (jsonb), `feature_type`, `level`
- RLS: SELECT open to `public`; INSERT/UPDATE/DELETE gated on `admin_allowlist` table
- RPC: `get_feature_collection(p_level integer DEFAULT NULL)` → returns GeoJSON FeatureCollection
- Service key needed for seed script (bypasses RLS); anon key for frontend reads

## Single Floor Routing Implementation

### Snapping & Dijkstra Integration
- **Snapping**: Snaps coordinates from URL params (`lat`, `lng`) to the nearest path on the active floor level using Turf.js `nearestPointOnLine`. Snapped coordinates are stored as `route.origin`.
- **Graph construction**: In `lib/routing.ts`, we construct a graphology graph dynamically using path features on the active level.
- **Shortest Path**: We execute bidirectional Dijkstra pathfinding using `graphology-shortest-path/dijkstra` from `route.origin` to the selected destination POI.

### Graphology Directed vs. Undirected Edges Bug (Fixed)
- **Problem**: When constructing the graph, we used `g.addEdge()` which creates a directed edge. Since corridor paths are bidirectional, pathfinding would fail (returning an empty route) if the target direction required traversing an edge backwards relative to its digitized orientation.
- **Fix**: Replaced `addEdge`, `hasEdge`, and `dropEdge` with `addUndirectedEdge`, `hasUndirectedEdge`, and `dropUndirectedEdge` respectively. The graph is now correctly built as an undirected network, allowing Dijkstra to navigate in either direction.

### Visual Map Stack
- Building footprints are drawn under paths and markers.
- Corridor path meshes are hidden by default and only visible when `isAdminMode` is enabled.
- Snap lines are rendered as dotted blue lines connecting the raw visitor location (You) to the snapped path position. The snap line only renders when routing to a destination is active.
- The active calculated route is rendered on top of other features as an emerald-green line with a white border.
- A destination snap line is rendered as a dashed emerald-green line connecting the end of the calculated route on the path network directly to the destination POI marker (representing the walking path from the corridor to the room).
- Corridor paths are rendered on the map always (no longer restricted to admin mode) as very thin (1.5px) grey lines (`#cbd5e1` in light, `#475569` in dark) with 0.65 opacity to represent walkable corridors without causing visual clutter.
- The raw Scan Location marker and its dotted snap line are removed. Instead, the snapped origin point is rendered directly on the path as a single starting point marker labeled "You".
- Aside overlay is cleaned up to only contain a floating, glassmorphic search combobox that acts as a type-and-search dropdown for POIs.
- POI labels are rendered without backgrounds, using a text outline stroke (black in dark mode, white in light mode) with the text color matching the POI marker color (indigo for classrooms, emerald for transit, rose for other POIs) for a clean, modern aesthetic.
- The "You" starting marker is styled as a solid blue circle with a thick white border, glowing blue animation, and set to the highest z-index (9999) to prevent it from rendering under other map elements.

### 2026-06-21 — Snapping Segment-splitting Intersection Bug (Fixed)
- **Problem**: Snapped origin and destination nodes were being created in the graph but remained completely isolated (size 1 components with 0 neighbors). Dijkstra would silently return empty routes. This was because `getOrCreateNodeKey(snapCoords)` was called before checking `g.hasNode(snapKey)`. Since `getOrCreateNodeKey` immediately adds the node to the graph when it doesn't exist, `g.hasNode(snapKey)` always returned `true` immediately after, causing the snapping function to return early and bypass the segment-splitting/edge-adding logic entirely.
- **Fix**: Replaced the direct `getOrCreateNodeKey` check with a manual distance check against `nodeCoords` first. If no existing node is within 10 cm, we generate `snapKey` and proceed to split the segment and add the edges. Snapped nodes now correctly connect to the path network, and routing works flawlessly.

### 2026-06-21 — Start Snap Line Conditional Rendering
- **Problem**: The dashed start snap line was visible on initial mount even when no destination was selected, creating visual clutter.
- **Fix**: Updated `startSnapLineData` `useMemo` in `MapCanvas.tsx` to return `null` if `route.destination` is not set or `route.routeCoordinates` is empty. The snap line now renders only when active routing is underway.

### 2026-06-21 — Overlaid Multi-floor Path Routing
- **Problem**: Moving between floors required user interaction with floating "Continue to L2" buttons, and routes on inactive floors were hidden.
- **Fix**: Wiped transition buttons. Plotted active floor route as a solid blue (#2563eb) line without borders. Plotted inactive floor route segments as dashed violet (#8b5cf6) lines overlaid on the current level. Updated markersData to include cross-floor destination POIs, and styled cross-floor markers (and inactive You marker) with 60% opacity and a floor suffix (e.g. `(L2)`). Hidden all non-destination POI pin icons during active routing, keeping only their text labels visible.

### 2026-06-24 — Multi-floor Routing Redesign (Staircase Strategy)

**Problem**: Three interrelated rendering bugs:
1. Two lines going in different directions from the start point — one from `startSnapLineData` and another from `staircaseConnectorData`.
2. The route on inactive floors showed as purple dashed but had no visual continuity from the staircase transition point.
3. A phantom `staircaseConnectorData` useMemo in MapCanvas drew a line from the "last route coord on active level" to the nearest transit — this produced a duplicate/conflicting line.

**Root Cause**: The old routing used Dijkstra across all floors simultaneously with transit edges, which let the router pick any path through the graph including non-staircase nodes. The `staircaseConnectorData` was a post-hoc hack to visually extend the route to the staircase — but since Dijkstra already handled the staircase edge, this produced a double-line.

**Fix (2026-06-24)**:
- **routing.ts completely rewritten** with explicit 3-segment architecture:
  1. Build independent floor graphs for origin and dest levels
  2. Find nearest transit node (lift) on origin level — treated as staircase access point
  3. Dijkstra: origin → nearest transit (origin level)
  4. Cross-floor jump point appended
  5. Dijkstra: transit (dest level) → destination
- Route output: `[...seg1, stairOnOrigin, stairOnDest, ...seg2]` with full level tags
- **`staircaseConnectorData` useMemo DELETED** from MapCanvas
- **`routeData` and `inactiveRouteData`** rewritten to use `buildSegments()` helper that splits route into multiple contiguous same-level LineStrings — correctly handles the case where two separate segments of the same level (origin→stair AND stair→dest if same-floor fallback) both render

**Transit data note**: GeoJSON has BOTH `transit_type === 'staircase'` AND `transit_type === 'lift'` entries. Routing exclusively uses `staircase` transit nodes (lifts excluded). Staircase pairs are resolved via the `connects_to` array (authoritative, not proximity). 

**Optimal staircase selection**: ALL valid staircase pairs between floors are evaluated. For each pair, independent floor graphs are built and Dijkstra cost (origin→stair + stair→dest) is computed. The minimum-cost pair wins. This ensures the truly shortest walking route, not just the geographically closest staircase.

**Snap lines**:
- `startSnapLineData`: rawOrigin → routeCoords[0] (always rendered with start-snap style)
- `destSnapLineData`: routeCoords[-1] → destCoords (rendered purple dashed if dest is on different floor from active level)

