# NSU Indoor Navigation — Technical Specification v2

**Revision note:** This is a rewrite of the original Gemini-generated plan. The core philosophy and several architectural pieces are kept, but the data layer has been moved from "static file now, Supabase later" to "Supabase from day one," and a full interactive admin editing system has been added as a first-class part of the MVP rather than a future enhancement. Several library choices have also been swapped where a better-fit option exists for this specific project (indoor-only navigation, small team, demo deadline, freelancer-led build via Claude Code).

---

## 1. Project Context & Philosophy

NSU's Architecture department (via Raj sir and Dr. Shifat-E-Rabbi) has asked for a modern wayfinding solution for campus visitors — admission candidates, parents, freshers, and guests from other universities during events — who currently struggle to navigate the NAC/SAC/Library complex.

**Core philosophy: zero friction.** No app download, no login for visitors. A visitor scans a physical QR code mounted on a wall or near a classroom. The QR code encodes a URL with the visitor's exact coordinates and floor level, e.g. `https://nsu-nav.app/?lat=23.8152&lng=90.4261&level=1`. The web app loads instantly, snaps that coordinate onto the nearest walkable corridor, lets the visitor pick a destination, and renders the shortest path across one or more floors.

A second, equally important user is the **admin** (you, and your CSE299 teammates) — the person who needs to add, move, and fix map data (POIs, corridors, lifts/stairs) quickly and visually, especially in the days before a demo, without touching raw GeoJSON or redeploying.

---

## 2. MVP Scope & Build Strategy

Two original plan assumptions are changed here:

1. **Supabase is live from day one**, not swapped in later. The static `nsu_indoor_map_merged.geojson` file (149 features, already cleaned and schema-normalized) becomes the **seed data** for a Postgres table — it's imported once via a script, not read directly by the frontend at runtime.
2. **Admin editing is part of the first prototype**, not a "production" feature. This is the actual reason Supabase needs to exist now: you need to fix/extend map data interactively before the demo, faster than hand-editing GeoJSON.

Because both the visitor-facing nav experience and the admin editing tools are real engineering surfaces (auth, CRUD, drawing tools, graph routing, multi-floor logic), trying to get Claude Code to build all of it in one shot is unrealistic. Section 10 below breaks this into an ordered build sequence — each step produces something you can run and look at before moving to the next.

---

## 3. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | **React + Vite** | Kept from original plan. Fast dev loop, good Claude Code support. |
| Map rendering | **MapLibre GL JS** (via `react-map-gl/maplibre`) | Swapped from Mapbox GL JS. Same API surface as Mapbox (the `react-map-gl` wrapper supports both, so this is a low-risk choice), but free, open-source, and requires no access token or usage-based billing. Since this app hides external roads/POIs and only renders your own indoor floor plan layers anyway, you don't need Mapbox's basemap ecosystem — you can optionally add a free raster satellite/OSM tile as backdrop, or render against a plain background. If you later want Mapbox Studio's styling tools or satellite imagery quality, swapping back is a config change, not a rewrite. |
| Spatial math | **Turf.js** | Kept — essential for nearest-point snapping, distance calculation, and line geometry helpers. |
| Graph & pathfinding | **graphology + graphology-shortest-path** | New addition. The original plan said "build an in-memory graph" and "use A*/Dijkstra" without specifying how. Rather than hand-rolling Dijkstra (easy to get subtly wrong, especially across multi-floor transit edges), use `graphology` for the graph structure and `graphology-shortest-path`'s built-in Dijkstra/A* implementations. Less code, fewer bugs, same result. |
| State management | **Zustand** | New addition. Lightweight global store for `activeLevel`, current route, selected POI, admin mode, and draw-tool state. Avoids prop-drilling and Redux boilerplate; pairs well with Vite/React. |
| Styling | **Tailwind CSS** | Kept. |
| UI components (admin forms/modals) | **shadcn/ui** | New addition, optional but recommended. Gives you accessible, pre-styled dialogs, dropdowns, and form inputs for the admin CRUD panels without hand-building every modal — speeds up the parts of the build that aren't the "interesting" routing logic. |
| Backend | **Supabase (Postgres)** | Kept, but used directly from day one (see Section 4). |
| Auth | **Supabase Auth** (email/password) | New addition, required for admin gating. No need for anything fancier — this is a 2–4 person admin team, not a public registration system. |
| Deployment | **Vercel** (frontend) + **Supabase Cloud** (free tier, backend) | Kept. No serverless functions needed for the MVP — Supabase's auto-generated REST API (PostgREST) and RPC functions cover everything. |

---

## 4. Data Architecture

### 4.1 Why JSONB geometry instead of native PostGIS types (for now)

The original plan called for "Supabase with PostGIS extension for advanced spatial querying." For this MVP, the spatial math (nearest-point snapping, distance) happens **client-side in Turf.js**, not in Postgres — so there's no immediate need for true PostGIS geometry columns, spatial indexes, or `ST_*` query functions. Forcing that in on day one adds real complexity to the admin write path (every insert/update would need GeoJSON→WKT conversion via an RPC function).

Instead: store geometry as **raw GeoJSON in a `jsonb` column**. This is trivial to read and write with the Supabase JS client, and it means the data shape flowing into the frontend is *identical* to the FeatureCollection structure already in use — genuinely zero refactor of the spatial/routing logic, exactly as the original "scalability requirement" intended.

Enable the `postgis` extension anyway (it's a one-line `create extension postgis;`) so it's available the moment you actually need server-side spatial queries — e.g. if you later add `pgRouting` for server-side pathfinding, or want Postgres to validate that a new POI actually falls inside a building footprint. That migration (adding a generated/computed PostGIS `geometry` column alongside the JSONB one) is a clean, isolated future task, not a blocker now.

### 4.2 Schema

**Table: `map_features`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid`, primary key, default `gen_random_uuid()` | |
| `geometry` | `jsonb` | Raw GeoJSON geometry object (`{"type": "Point", "coordinates": [...]}` etc.) |
| `properties` | `jsonb` | Everything from the existing schema: `type`, `name`, `level`, `building`, `category`, `path_id`, `path_type`, `transit_type`, `node_id`, `connects_to`, `accessible_via_path` |
| `created_at` | `timestamptz`, default `now()` | |
| `updated_at` | `timestamptz`, default `now()` | Update via trigger on row change |
| `created_by` | `uuid`, nullable, references `auth.users` | Useful once multiple admins are editing |

This single table holds footprints, paths, POIs, and transit nodes — same as the merged GeoJSON file does — because `properties.type` already discriminates between them, and PostgREST/JSONB handles mixed shapes fine.

**Table: `admin_allowlist`** (or simpler: a `is_admin` boolean on a `profiles` table linked 1:1 to `auth.users`)

A minimal allow-list so Row Level Security can tell admins apart from the general public.

### 4.3 Reading data: one RPC call returns the whole FeatureCollection

Create a Postgres function, exposed via Supabase's RPC interface:

```sql
create or replace function get_feature_collection()
returns json
language sql
stable
as $$
  select json_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(json_agg(
      json_build_object(
        'type', 'Feature',
        'geometry', geometry,
        'properties', properties || jsonb_build_object('id', id)
      )
    ), '[]'::json)
  )
  from map_features;
$$;
```

The frontend calls this once (`supabase.rpc('get_feature_collection')`) and gets back the exact same shape as the original static file — so the Turf.js snapping logic, the graph builder, and the Mapbox/MapLibre layer rendering all work unmodified against live Supabase data. (Note `id` gets merged into `properties` so the frontend can reference a feature's database row when editing it.)

### 4.4 Writing data: direct table writes, gated by RLS

Admin CRUD operations write directly via `supabase.from('map_features').insert(...)` / `.update(...)` / `.delete(...)` — no RPC needed for writes, since there's no geometry type conversion to do (it's just JSONB).

**Row Level Security policies:**
- `SELECT`: allowed for everyone, including unauthenticated (`anon`) visitors — the public nav experience needs to read the map without logging in.
- `INSERT` / `UPDATE` / `DELETE`: allowed only for authenticated users present in the admin allow-list.

This is the one piece of the whole stack that is a genuine security boundary (the Supabase anon key is public, embedded in the frontend bundle), so RLS must actually be enforced in Postgres, not just hidden behind a frontend login screen.

### 4.5 Seeding the database

A one-time Node script reads `nsu_indoor_map_merged.geojson`, iterates its 149 features, and inserts each as a row (`geometry` = the feature's `geometry` object, `properties` = the feature's `properties` object) via the Supabase service-role key (not the anon key — this script runs once, locally, not in the browser). After seeding, the static file is no longer read by the app at all; it's just the historical source of the data now living in Postgres.

---

## 5. Core Application Features (Visitor-Facing)

### 5.1 Initialization & Spatial Snapping
- On load, parse `?lat=&lng=&level=` from the URL.
- If present: place a "You Are Here" marker at the raw coordinate, use Turf.js (`nearestPointOnLine` or equivalent) to find the closest point on any `path` feature whose `level` matches the URL param, and draw a dotted "snap line" from the raw point to that path point. That snapped point becomes the routing start node.
- If absent: prompt the visitor to pick a starting point manually from the POI list (fallback for testing without a physical QR code, or for visitors who land on the page directly).

### 5.2 Graph Construction (Routing Network)
- Build the in-memory `graphology` graph once after data loads, **not** by computing line-intersections at render time. Path LineStrings in this dataset are digitized as a connected network — corridor segments share exact (or near-exact) endpoint coordinates where they meet. So: round/snap each path vertex coordinate to ~7 decimal places, treat each unique snapped coordinate as a graph node, and add a graph edge between consecutive vertices of every `path` feature, weighted by real-world distance (Turf's `distance` function).
- For each `transit` feature (lift/staircase), snap its point coordinate onto the graph the same way (it should coincide with, or sit very close to, a path vertex — that's what makes it a valid junction).
- For every `transit` node's `connects_to` array, add a **vertical edge** between the two paired nodes (e.g. `nac_stair_1_L1` ↔ `nac_stair_1_L2`) with a fixed cost representing floor-to-floor traversal time rather than a literal distance, since they're not on the same plane.
- This produces a single connected graph spanning both floors, which is what makes a query like "SAC204 (Level 2) to NAC Entrance (Level 1)" resolve as one shortest-path call instead of two separate per-floor calls glued together manually.

### 5.3 Pathfinding
- Use `graphology-shortest-path`'s Dijkstra (or A*, if a good heuristic is added later) to compute the shortest path between the snapped start node and the selected destination POI's nearest path node.
- The result is a sequence of graph nodes/edges, which is then split by `level` so each floor's segment can be drawn and stepped through separately (see 5.4).

### 5.4 Map Rendering & Multi-Level Navigation
- Render `footprint`, `path`, `poi`, and `transit` features as separate MapLibre layers, filtered by `properties.level === activeLevel` (held in the Zustand store).
- Draw the active route segment for the current level as a distinct, high-contrast (or animated/glowing) line layer.
- When the route crosses a `transit` edge into a different level, show a contextual instruction ("Walk to Lift 1, then go to Level 2") and a floating "Continue to Level 2" button. Tapping it updates `activeLevel`, triggers the layer filter transition, and reveals the next route segment.

### 5.5 Destination Selection & Turn-by-Turn UI
- Floating search/destination picker over the map, listing POIs (filterable by name/building/category).
- Bottom sheet that slides up once a route is active: estimated walking time/distance, current-floor instruction text, and the "Continue to Level X" control when relevant.

---

## 6. Admin Editing Mode (New — First-Class MVP Feature)

This is the part that didn't exist in the original plan and is now core to the first prototype, because it's what lets you fix and extend the map data quickly before the demo without redeploying.

### 6.1 Access
- A login screen (Supabase Auth email/password) gates an "Admin Mode" toggle. While in Admin Mode, the UI gets a clear visual indicator (e.g. a colored top banner or border) so it's never ambiguous whether you're looking at the live public view or the editable one.

### 6.2 POI editing
- **Add:** click "Add POI," then click a point on the map → form modal (name, category, building, level — defaults to `activeLevel`) → saves as a new row in `map_features`.
- **Edit:** click an existing POI marker in Admin Mode → same form, pre-filled → update.
- **Move:** drag-to-reposition support is a nice-to-have; clicking "Delete and re-add" is an acceptable fallback for the first version if drag handling is fiddly.
- **Delete:** confirm-and-remove.

### 6.3 Path (corridor) editing
- **Draw:** "Draw Path" tool — click sequential points to build a LineString, double-click or press Enter to finish → form for `path_type` and `level` (`path_id` auto-generated as the next available `path_L{level}_NNN`).
- **Edit/Delete:** select an existing path segment in Admin Mode to edit its metadata or delete it. Editing individual vertices of an existing path is a stretch goal — for the first version, "delete and redraw" is an acceptable substitute if full vertex-dragging proves too time-consuming to build well.

### 6.4 Transit node editing (the one piece that needs a smarter UX than a plain form)
A staircase/lift only works for routing if both its floor instances exist and correctly reference each other's `node_id` in `connects_to`. To make this hard to get wrong in the admin UI:
- "Add Transit Node" flow: pick `transit_type` (lift/staircase), click a point on the current floor, then specify which other level it connects to. The tool places a *second* point at the same coordinate on that other level automatically, generates both `node_id`s, and writes `connects_to` on both rows pointing at each other — so a single admin action always produces a valid, bidirectional pair instead of two separately-managed rows that could drift out of sync.
- Editing an existing pair (e.g. renaming) should update both linked rows together.

### 6.5 Footprint editing — explicitly deferred
Building footprint polygons change rarely (there are only 2 in the current dataset) and a full polygon-drawing/vertex-editing tool is a relatively expensive UI to build well. For the MVP, footprint edits are made directly through Supabase's built-in Table Editor (editing the `geometry` JSONB by hand or via SQL) rather than a custom in-app tool. This is a deliberate scope cut, not an oversight — revisit only if footprint edits turn out to be frequent.

### 6.6 Data flow back to visitors
Admin writes go straight to `map_features`; the public-facing app re-fetches `get_feature_collection()` on load (and the admin tools should trigger a local refetch/refresh after a save so you can immediately verify your edit in the same session). True multi-admin live sync (Supabase Realtime subscriptions, so a second admin's edits appear without a refresh) is a Phase 2 nice-to-have, not required for the first working version — see Section 10.

---

## 7. UI/UX Specifications
- **Aesthetic direction:** Native iOS-quality feel — smooth transitions, frosted-glass (`backdrop-blur`) panels, CSS variables driving a polished dark/light mode, rounded corners throughout.
- **Floating controls:** Destination search/input stays as an unobtrusive floating element so the map itself is never blocked.
- **Level selector:** A vertical, sticky floor toggle (1 / 2) on the screen's right edge, visually indicating the active level.
- **Turn-by-turn card:** Bottom sheet, slides up when a route is active — walking time, distance, current instruction.
- **Admin mode indicator:** Distinct visual treatment (banner/border/accent color) whenever Admin Mode is active, so there's no risk of mistaking the editable view for the public one during a live demo.
- **Responsiveness:** Mobile-first. Large, ergonomic touch targets — most visitors will be on a phone, walking, having just scanned a QR code.

---

## 8. Deployment & Environment
- **Frontend:** Vercel, auto-deployed from the Vite/React repo.
- **Backend:** Supabase Cloud project (free tier is more than sufficient at this scale — 149 seed features, small admin team).
- **Environment variables:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public, safe to expose — security is enforced by RLS, not by hiding the key) set in both local `.env` and Vercel project settings. The service-role key used only for the one-time seed script stays local and is never committed or shipped to the frontend.

---

## 9. Open Questions / Things to Confirm Before or During the Build
- Exact admin team (who needs login access) — informs whether `admin_allowlist` is a hardcoded list of emails or something more elaborate.
- Whether visitors should be able to search by room number directly (e.g. typing "SAC204") in addition to picking from a list — likely yes, cheap to add to the POI search.
- Whether a QR-code *generator* tool (for producing the physical codes to print and mount around campus) is needed before the demo, or after — this is a small, self-contained feature (see Section 10, Phase 2) that wasn't in the original plan but follows directly from the stated philosophy, since someone has to produce those QR codes.

---

## 10. Build Roadmap

See the companion file **`Claude_Code_Build_Prompts.md`** for the literal, copy-pasteable prompt sequence. In summary, the build proceeds in this order:

**Phase 1 — Foundation:** project scaffold, Supabase schema + RLS, seed script, basic read-only map rendering live data.
**Phase 2 — Core navigation:** QR param parsing + snapping, graph construction, single-floor pathfinding, route rendering.
**Phase 3 — Multi-floor:** transit edges, level switching, "Continue to Level X" flow.
**Phase 4 — Visitor UX polish:** destination search, turn-by-turn bottom sheet, dark mode, responsive pass.
**Phase 5 — Admin tools:** auth gate, POI CRUD, path drawing CRUD, linked transit-pair tool.
**Phase 6 — Stretch goals:** QR code generator, Realtime multi-admin sync, footprint editing tool (only if needed).

Phases 1–3 prove the hardest, riskiest part of the system (live Supabase data → working multi-floor routing) works at all, before any time is spent on admin tooling or visual polish — so if something about the data model needs to change, it changes early and cheaply.