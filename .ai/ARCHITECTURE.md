# Architecture & Tech Stack

## Frontend
- React + Vite
- Tailwind CSS
- shadcn/ui for components
- Zustand for state management (activeLevel, route, selected POI, admin mode)

## Map & Spatial
- MapLibre GL JS (via react-map-gl/maplibre)
- Turf.js (client-side spatial math: snapping, distance)
- graphology + graphology-shortest-path (graph routing and Dijkstra/A*)

## Backend & Data
- Supabase (Postgres) from Day 1
- Supabase Auth (email/password for admins)
- Data stored as GeoJSON in a `jsonb` column in `map_features` table
- Row Level Security (RLS): SELECT for everyone, INSERT/UPDATE/DELETE for admins

## Deployment
- Vercel (Frontend)
- Supabase Cloud (Backend)
