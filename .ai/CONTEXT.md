# System Context

This project is an indoor navigation web application for North South University.

- **Goal**: Help visitors navigate the NAC/SAC/Library complex without installing an app.
- **Workflow**: Static GeoJSON seed data -> Supabase Postgres `map_features` table -> Frontend pulls FeatureCollection via RPC -> Turf.js snaps to path -> graphology computes shortest path.
- **Current UI focus**: Floating route controls and search interactions are being refined for a more premium, mobile-friendly experience, including clearer recenter and route-restore affordances.
- **Key Concepts**:
    - `activeLevel`: Current floor being viewed/navigated.
    - `transit`: Lifts/stairs connecting floors via vertical edges in the graph.
    - Admin Mode: Live editing of Supabase database directly from the UI.
