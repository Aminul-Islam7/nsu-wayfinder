# Vibecoding Memory & Scratchpad

> _Purpose: A living document to log things learned, persistent bugs, or temporary states during development. Append notes here as we go to maintain context across sessions._

## Current Status

- Phase 1 complete: scaffold + schema + seed done.
- Supabase project: `nsu-wayfinder` (id: `newohsmvykuelitzjrik`, region: ap-southeast-1)
- All 147 clean features seeded into `map_features`.
- 2026-06-27: Removed the developer-only logs button, added a polished initial loading experience, cleaned the search-card header so it no longer shows the NSU Wayfinder label, and compacted the floor/theme controls into a slimmer top-right bar.
- 2026-06-27: Added a stronger visual treatment to the floating recenter and route-restore controls so primary actions feel clearer and more premium on mobile and desktop.
- 2026-06-27: Fixed CSS syntax error in index.css and resolved TypeScript compile error for unused heading prop in MapCanvas.tsx.
- 2026-06-28: Simplified search panel overlay layout. Removed RECENTs, Quick Places, Favorites, sensor/gps-tracking, and app logo to satisfy design conciseness requests.

## Technical Decisions & Lessons Learned

### 2026-06-21 — Degenerate path fix decision

**Problem**: `path_L1_001` and `path_L2_001` were zero-length LineStrings — both vertices identical at `[90.426206, 23.815926]`.

**Decision: DELETED** (not fixed/repaired).

**Reasoning**:

- Coordinate `[90.426206, 23.815926]` is _outside_ the building footprint. The footprint's northernmost vertex is `23.8158427`; the degenerate point sits at `23.815926` — ~6 m north of the roof line. It's a digitizing artifact (cursor click on empty space), not a real corridor gap.
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

### 2026-06-24 — Curved Route Path Joins and Snap Line Integration

**Problem**: The route path lines had sharp joints at corners. In addition, the snap lines connecting the user (You) to the corridor network and the corridor network to the destination POI were separate lines, which met the main route at sharp angles and looked disconnected/discontinuous. Furthermore, in multi-floor routing, corners connecting staircase transitions (vertical stairs to level corridors) remained sharp.

**Fix**:

1. **Merged Snap Lines into Route**: Integrated the raw origin (`originCoords`) and raw destination (`destCoords`) directly into the main `route.routeCoordinates` array inside `computeShortestPath` (in same-floor and multi-floor routing segments).
2. **Curved Corner Smoothing**: Implemented a `smoothPath` helper in `routing.ts` using quadratic Bezier curve corner-rounding. It cuts corners within each level-specific path segment (scaling the cut distance based on segment length up to ~3 meters) and generates sampled Bezier curve points to round the corner.
3. **Staircase Transition Smoothing**: Appended the raw staircase coordinates `bestStairOrigin` and `bestStairDest` to `fullSeg1` and `fullSeg2` respectively, before passing them to `smoothPath`. This allows the corner-rounding algorithm to curve the transitions between stair entry/exit points and the level corridor paths, resolving all remaining sharp corners at multi-floor joins.
4. **Cleaned Map Layers**: Removed the separate `start-snap-line-source` and `dest-snap-line-source` layers and variables from `MapCanvas.tsx`, letting the single continuous, curved path render natively with uniform line-join and line-cap settings.
5. **Simplified App.tsx Stats**: Removed manual haversine additions of snap lines in `App.tsx` since `route.routeCoordinates` now includes the snap lines, automatically accounting for them in the distance loop.

### 2026-06-24 — Route Growing Animation

**Problem**: The route line rendered instantly without visual progression, which lacked a premium/interactive feel.

**Decision**: Implement a smooth, client-side route drawing animation.

**Implementation**:

1. **Distance-based Interpolation**: Rather than advancing the animation frame-by-frame on a fixed count of path vertices (which causes speed spikes on tight curves with dense points), we compute cumulative haversine distances along the full path. The path grows at a constant linear speed (approx 40 meters/sec) over a duration bounded between 1.5 and 4.0 seconds.
2. **Smooth Growing State**: Local component state `animatedCoords` tracks the coordinates of the path traversed up to the current frame time, with the final segment coordinate interpolated dynamically.
3. **Seamless Multi-Floor Continuity**: Since `buildSegments()` operates directly on `animatedCoords`, the active and inactive floor segments grow in perfect sync as if they are a single continuous line, avoiding simultaneous segment draws or long pauses.

### 2026-06-24 — Prevent Route Animation Replay on Level Switch

**Problem**: Changing the active level triggered the pathfinding `useEffect` to recalculate the route, calling `setRouteCoordinates` with a new array reference and causing the drawing animation to replay from the beginning even though the route was unchanged.

**Fix**: Added a coordinates comparison check using `useStore.getState().route.routeCoordinates` before calling `setRouteCoordinates`. If the newly calculated coordinates are identical to the current ones, the store update is skipped, preserving the array reference and preventing the animation from replaying.

### 2026-06-24 — Active Level URL Synchronization

**Problem**: The selected floor level (activeLevel) was not persisted in the URL query parameters, so refreshes or shared links reverted the map view to the default floor.

**Fix**:

1. **Load State**: Modified initial load `useEffect` in `App.tsx` to parse `level` query parameter and call `setActiveLevel(lvl)` if valid (1 or 2).
2. **Store to URL Sync**: Modified state-to-URL sync `useEffect` in `App.tsx` to always append `level` query parameter and stopped deleting it on start selection. Persists active level seamlessly alongside route selections.

### 2026-06-24 — Swap Start and Destination Selections

**Problem**: Reversing the route origin and destination required clearing and re-entering coordinates, which was tedious and lacked shortcut capabilities.

**Fix**:

1. **Swap Button UI**: Plotted a styled circular `ArrowUpDown` swap button between the start and destination search inputs in `App.tsx`.
2. **Swap Logic**: Implemented `handleFlip` in `App.tsx` to parse current start and destination details (including matching coordinates to POI names/IDs or coordinate strings) and swap them in the store and inputs. Handles blank states smoothly.
3. **Animation Replay**: Since swapping reverses the coordinate ordering (e.g. $[A, \dots, B]$ to $[B, \dots, A]$), the new route path naturally triggers the path growing grow animation from the new starting point.

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
 
 
### 2026-06-24 — Curved Route Path Joins and Snap Line Integration

**Problem**: The route path lines had sharp joints at corners. In addition, the snap lines connecting the user (You) to the corridor network and the corridor network to the destination POI were separate lines, which met the main route at sharp angles and looked disconnected/discontinuous. Furthermore, in multi-floor routing, corners connecting staircase transitions (vertical stairs to level corridors) remained sharp.

**Fix**:
1. **Merged Snap Lines into Route**: Integrated the raw origin (`originCoords`) and raw destination (`destCoords`) directly into the main `route.routeCoordinates` array inside `computeShortestPath` (in same-floor and multi-floor routing segments).
2. **Curved Corner Smoothing**: Implemented a `smoothPath` helper in `routing.ts` using quadratic Bezier curve corner-rounding. It cuts corners within each level-specific path segment (scaling the cut distance based on segment length up to ~3 meters) and generates sampled Bezier curve points to round the corner.
3. **Staircase Transition Smoothing**: Appended the raw staircase coordinates `bestStairOrigin` and `bestStairDest` to `fullSeg1` and `fullSeg2` respectively, before passing them to `smoothPath`. This allows the corner-rounding algorithm to curve the transitions between stair entry/exit points and the level corridor paths, resolving all remaining sharp corners at multi-floor joins.
4. **Cleaned Map Layers**: Removed the separate `start-snap-line-source` and `dest-snap-line-source` layers and variables from `MapCanvas.tsx`, letting the single continuous, curved path render natively with uniform line-join and line-cap settings.
5. **Simplified App.tsx Stats**: Removed manual haversine additions of snap lines in `App.tsx` since `route.routeCoordinates` now includes the snap lines, automatically accounting for them in the distance loop.

### 2026-06-24 — Route Growing Animation

**Problem**: The route line rendered instantly without visual progression, which lacked a premium/interactive feel.

**Decision**: Implement a smooth, client-side route drawing animation.

**Implementation**:
1. **Distance-based Interpolation**: Rather than advancing the animation frame-by-frame on a fixed count of path vertices (which causes speed spikes on tight curves with dense points), we compute cumulative haversine distances along the full path. The path grows at a constant linear speed (approx 40 meters/sec) over a duration bounded between 1.5 and 4.0 seconds.
2. **Smooth Growing State**: Local component state `animatedCoords` tracks the coordinates of the path traversed up to the current frame time, with the final segment coordinate interpolated dynamically.
3. **Seamless Multi-Floor Continuity**: Since `buildSegments()` operates directly on `animatedCoords`, the active and inactive floor segments grow in perfect sync as if they are a single continuous line, avoiding simultaneous segment draws or long pauses.

### 2026-06-24 — Prevent Route Animation Replay on Level Switch

**Problem**: Changing the active level triggered the pathfinding `useEffect` to recalculate the route, calling `setRouteCoordinates` with a new array reference and causing the drawing animation to replay from the beginning even though the route was unchanged.

**Fix**: Added a coordinates comparison check using `useStore.getState().route.routeCoordinates` before calling `setRouteCoordinates`. If the newly calculated coordinates are identical to the current ones, the store update is skipped, preserving the array reference and preventing the animation from replaying.

### 2026-06-24 — Active Level URL Synchronization

**Problem**: The selected floor level (activeLevel) was not persisted in the URL query parameters, so refreshes or shared links reverted the map view to the default floor.

**Fix**:
1. **Load State**: Modified initial load `useEffect` in `App.tsx` to parse `level` query parameter and call `setActiveLevel(lvl)` if valid (1 or 2).
2. **Store to URL Sync**: Modified state-to-URL sync `useEffect` in `App.tsx` to always append `level` query parameter and stopped deleting it on start selection. Persists active level seamlessly alongside route selections.

### 2026-06-24 — Swap Start and Destination Selections

**Problem**: Reversing the route origin and destination required clearing and re-entering coordinates, which was tedious and lacked shortcut capabilities.

**Fix**:
1. **Swap Button UI**: Plotted a styled circular `ArrowUpDown` swap button between the start and destination search inputs in `App.tsx`.
2. **Swap Logic**: Implemented `handleFlip` in `App.tsx` to parse current start and destination details (including matching coordinates to POI names/IDs or coordinate strings) and swap them in the store and inputs. Handles blank states smoothly.
3. **Animation Replay**: Since swapping reverses the coordinate ordering (e.g. $[A, \dots, B]$ to $[B, \dots, A]$), the new route path naturally triggers the path growing grow animation from the new starting point.

### 2026-06-28 — Merged Search & Navigation Overlay

**Decision**: Merge the separate "Navigating to" bottom sheet into the top-left Search Panel, placing route stats directly below the inputs.

**Implementation**:
- Removed bottom sheet completely from `App.tsx`.
- Integrated route stats (Time, Distance, Floor transitions) below destination input inside the search card.
- Added `@keyframes route-info-in` with height/fade transition (`.route-info-enter` class) in `index.css` to animate the layout expansion smoothly when route stats become active.
- Fixed mobile right-rail layout spacing by removing conditional 180px offset since the bottom sheet is gone.
- Polished layout: Slowed animation duration to `0.65s`, increased vertical divider spacing, and added a capitalized "Route Details" section label for clear separation.

### 2026-06-28 — Tracking Removal & UI Simplification

**Decision**: Remove location tracking features (GPS/sensors/compass) entirely. Merge Right Rail panels and strip brand branding from the main panel.

**Implementation**:
- Deleted device orientation, geolocation, and dead reckoning hooks from `App.tsx`.
- Removed tracking pill UI elements and brand headers (logo, "NSU Wayfinder" title) from Search Panel.
- Combined theme switcher (Sun/Moon) and floor level selector into a single vertical control panel on the right rail.
- Simplified `MapCanvasProps` and stripped out the compass cone, ping ring, and accuracy rings from the start ("You") marker in `MapCanvas.tsx`.

### 2026-06-28 — Basement & Multi-level Expansion

**Decision**: Support 11 floors (L1-L11) and 3 basements (B1-B3).

**Implementation**:
- Expanded `Level` type in `useStore.ts` to `number` to support negative values (basements) and larger level values.
- Defined `ALL_LEVELS` array in `App.tsx` mapped to values `11` down to `-3`.
- Wrapped levels in a `max-height` vertical scrollable selector container on the right rail to prevent viewport overflow.
- Updated URL level synchronization to validate parsed level against `ALL_LEVELS`.
- Restored original level button layout design (font size 15 for labels, font size 8 with 'LEVEL' text for all buttons) inside the scrollable view to prevent a squished layout.
- Polished layouts: Set level selector scroll container's `maxHeight` dynamically to `calc(100svh - offset)` to fit all levels without scrolling on larger viewports, and increased level button spacing to `8px`.
- Fixed Flexbox shrink bug: Added `flexShrink: 0` to level buttons to prevent their height and vertical padding from collapsing when the container's height is compressed on smaller viewports.
- Added horizontal padding (`paddingLeft: 4`, `paddingRight: 6`) to the level scroll container to prevent the buttons' hover scale and shadow glows from getting cropped on the edges.
- Integrated auto-scrolling: Attached a callback ref mapping to level buttons and added a `useEffect` that calls `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` on the active level button when `activeLevel` changes, ensuring the selected floor is always in view.
- Added vertical padding (`paddingTop: 8`, `paddingBottom: 8`) to the scroll container to prevent top (L11) and bottom (B3) buttons' active state shadows/transforms from getting clipped at container boundaries.
