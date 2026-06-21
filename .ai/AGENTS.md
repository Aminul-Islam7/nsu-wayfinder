# Agent Guidelines & Rules

> [!IMPORTANT]
> All AI agents working on this codebase MUST strictly follow these rules to maintain state and consistency.

## 1. Documentation Synchronicity
- You MUST update the files in the `.ai/` directory on every turn or after completing any significant task/phase.
- Keep the following files up-to-date:
  - `MEMORY.md`: For technical decisions, lessons learned, gotchas, and database updates.
  - `PLAN.md`: For tracking roadmap status and marking phases complete.
  - `CONTEXT.md`: For keeping track of core system abstractions and environment variables.
- NEVER skip updating documentation. It is the only way subsequent sessions or subagents maintain continuity.

## 2. Technical Stack Consistency
- Map rendering: MapLibre GL + `react-map-gl/maplibre`.
- Styling: Tailwind CSS.
- State: Zustand `useStore.ts`.
- Routing: Graphology (undirected graph) + `graphology-shortest-path/dijkstra`.
- Snapping: Turf.js (`nearestPointOnLine`).
