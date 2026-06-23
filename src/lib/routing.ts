import Graph from 'graphology'
import { bidirectional as dijkstra } from 'graphology-shortest-path/dijkstra'
import { point, nearestPointOnLine } from '@turf/turf'

// ──────────────────────────────────────────────────────────────────────────────
// ROUTING DESIGN (2026-06-24)
//
// Strategy: staircase-only transit between floors.
// Assumption: every staircase has a nearby lift, so routing always targets the
// nearest staircase. Lifts are intentionally excluded from the transit graph.
//
// Multi-floor route = 3 segments:
//   1. Origin   → nearest staircase on origin level  (Dijkstra on origin level)
//   2. Staircase cross-floor edge                    (fixed cost)
//   3. Staircase → destination on dest level         (Dijkstra on dest level)
//
// Same-floor route = 1 segment:
//   1. Origin → destination                          (Dijkstra on same level)
//
// All coordinates in route output carry a level tag: [lng, lat, level]
// ──────────────────────────────────────────────────────────────────────────────

const getNodeKey = (coords: [number, number], level: number): string =>
  `${coords[0].toFixed(7)},${coords[1].toFixed(7)},${level}`

// Haversine distance in metres
function getDistance(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const R = 6371e3
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLam = ((lon2 - lon1) * Math.PI) / 180
  const s = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// 2D line segment intersection
function lineIntersection(
  p1: [number, number], p2: [number, number],
  p3: [number, number], p4: [number, number]
): [number, number] | null {
  const denom = (p4[1] - p3[1]) * (p2[0] - p1[0]) - (p4[0] - p3[0]) * (p2[1] - p1[1])
  if (denom === 0) return null
  const ua = ((p4[0] - p3[0]) * (p1[1] - p3[1]) - (p4[1] - p3[1]) * (p1[0] - p3[0])) / denom
  const ub = ((p2[0] - p1[0]) * (p1[1] - p3[1]) - (p2[1] - p1[1]) * (p1[0] - p3[0])) / denom
  const tol = 1e-9
  if (ua >= -tol && ua <= 1 + tol && ub >= -tol && ub <= 1 + tol)
    return [p1[0] + ua * (p2[0] - p1[0]), p1[1] + ua * (p2[1] - p1[1])]
  return null
}

// ──────────────────────────────────────────────────────────────────────────────
// Build an undirected graph for a single floor level
// ──────────────────────────────────────────────────────────────────────────────
function buildFloorGraph(
  features: any[],
  level: number
): {
  g: Graph
  nodeCoords: { key: string; coords: [number, number]; level: number }[]
  splitPaths: { idx: number; level: number; coords: [number, number][] }[]
} {
  const originalPaths = features.filter(
    f => f.geometry && f.properties?.type === 'path' && f.properties?.level === level
  )

  const pathVertices = originalPaths.map((p, idx) => ({
    idx,
    level: p.properties?.level as number,
    coords: [...(p.geometry.coordinates as [number, number][])]
  }))

  // Find intersections
  const intersections: { idxA: number; idxB: number; segA: number; segB: number; coord: [number, number] }[] = []
  for (let i = 0; i < pathVertices.length; i++) {
    for (let j = i + 1; j < pathVertices.length; j++) {
      const pA = pathVertices[i], pB = pathVertices[j]
      for (let sA = 0; sA < pA.coords.length - 1; sA++) {
        for (let sB = 0; sB < pB.coords.length - 1; sB++) {
          const pt = lineIntersection(pA.coords[sA], pA.coords[sA + 1], pB.coords[sB], pB.coords[sB + 1])
          if (pt) intersections.push({ idxA: i, idxB: j, segA: sA, segB: sB, coord: pt })
        }
      }
    }
  }

  // Assign intersections to segments
  const pathSegments = pathVertices.map(p =>
    p.coords.slice(0, -1).map((_, i) => ({
      start: p.coords[i],
      end: p.coords[i + 1],
      inters: [] as [number, number][]
    }))
  )
  intersections.forEach(({ idxA, idxB, segA, segB, coord }) => {
    pathSegments[idxA][segA].inters.push(coord)
    pathSegments[idxB][segB].inters.push(coord)
  })

  // Split paths at intersections
  const splitPaths = pathVertices.map((p, i) => {
    const segs = pathSegments[i]
    const coords: [number, number][] = [segs[0].start]
    segs.forEach(seg => {
      const sorted = [...seg.inters].sort((a, b) => getDistance(seg.start, a) - getDistance(seg.start, b))
      sorted.forEach(pt => { if (getDistance(coords[coords.length - 1], pt) > 0.001) coords.push(pt) })
      if (getDistance(coords[coords.length - 1], seg.end) > 0.001) coords.push(seg.end)
    })
    return { idx: p.idx, level: p.level, coords }
  })

  // Build graph
  const g = new Graph()
  const nodeCoords: { key: string; coords: [number, number]; level: number }[] = []
  const SNAP_THRESH = 0.1

  function getOrCreateNode(coords: [number, number]): string {
    for (const n of nodeCoords) {
      if (getDistance(n.coords, coords) < SNAP_THRESH) return n.key
    }
    const key = getNodeKey(coords, level)
    if (!g.hasNode(key)) {
      g.addNode(key, { coords, level })
      nodeCoords.push({ key, coords, level })
    }
    return key
  }

  splitPaths.forEach(path => {
    if (path.coords.length < 2) return
    for (let i = 1; i < path.coords.length; i++) {
      const kA = getOrCreateNode(path.coords[i - 1])
      const kB = getOrCreateNode(path.coords[i])
      if (kA !== kB && !g.hasUndirectedEdge(kA, kB)) {
        g.addUndirectedEdge(kA, kB, { weight: getDistance(path.coords[i - 1], path.coords[i]) })
      }
    }
  })

  return { g, nodeCoords, splitPaths }
}

// ──────────────────────────────────────────────────────────────────────────────
// Snap a point into a floor graph, return node key
// ──────────────────────────────────────────────────────────────────────────────
function snapMultipleIntoGraph(
  coordsList: [number, number][],
  level: number,
  g: Graph,
  nodeCoords: { key: string; coords: [number, number]; level: number }[],
  splitPaths: { idx: number; level: number; coords: [number, number][] }[]
): (string | null)[] {
  const SNAP_THRESH = 0.1
  const results: (string | null)[] = []
  const snapsToProcess: {
    coordsListIndex: number
    snapCoords: [number, number]
    bestPathIdx: number
    segIndex: number
    key: string
  }[] = []

  for (let i = 0; i < coordsList.length; i++) {
    const coords = coordsList[i]
    const pt = point(coords)

    const levelPaths = splitPaths.map(p => ({
      pathIdx: p.idx,
      feature: {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: p.coords },
        properties: { pathIdx: p.idx }
      }
    }))

    if (levelPaths.length === 0) {
      results.push(null)
      continue
    }

    let minDist = Infinity
    let bestSnapped: any = null
    let bestPathIdx = -1

    for (const { pathIdx, feature } of levelPaths) {
      try {
        const snapped = nearestPointOnLine(feature, pt)
        const dist = snapped.properties?.dist ?? Infinity
        if (dist < minDist) { minDist = dist; bestSnapped = snapped; bestPathIdx = pathIdx }
      } catch { /* skip */ }
    }

    if (!bestSnapped || bestPathIdx === -1) {
      results.push(null)
      continue
    }

    const snapCoords = bestSnapped.geometry.coordinates as [number, number]

    // 1. Check if close to existing node in nodeCoords
    let reusedKey: string | null = null
    for (const n of nodeCoords) {
      if (getDistance(n.coords, snapCoords) < SNAP_THRESH) {
        reusedKey = n.key
        break
      }
    }

    // 2. Check if close to already snapped point in snapsToProcess
    if (!reusedKey) {
      for (const processed of snapsToProcess) {
        if (getDistance(processed.snapCoords, snapCoords) < SNAP_THRESH) {
          reusedKey = processed.key
          break
        }
      }
    }

    const segIndex = bestSnapped.properties?.index
    if (segIndex === undefined) {
      results.push(null)
      continue
    }

    if (reusedKey) {
      results.push(reusedKey)
      snapsToProcess.push({
        coordsListIndex: i,
        snapCoords,
        bestPathIdx,
        segIndex,
        key: reusedKey
      })
    } else {
      const key = getNodeKey(snapCoords, level)
      results.push(key)
      snapsToProcess.push({
        coordsListIndex: i,
        snapCoords,
        bestPathIdx,
        segIndex,
        key
      })
    }
  }

  const segmentsToSplit: Record<string, {
    bestPathIdx: number
    segIndex: number
    snaps: { key: string; snapCoords: [number, number] }[]
  }> = {}

  for (const snap of snapsToProcess) {
    if (g.hasNode(snap.key)) continue

    const segKey = `${snap.bestPathIdx}_${snap.segIndex}`
    if (!segmentsToSplit[segKey]) {
      segmentsToSplit[segKey] = {
        bestPathIdx: snap.bestPathIdx,
        segIndex: snap.segIndex,
        snaps: []
      }
    }
    if (!segmentsToSplit[segKey].snaps.some(s => s.key === snap.key)) {
      segmentsToSplit[segKey].snaps.push({ key: snap.key, snapCoords: snap.snapCoords })
    }
  }

  for (const segKey of Object.keys(segmentsToSplit)) {
    const { bestPathIdx, segIndex, snaps } = segmentsToSplit[segKey]
    const splitPath = splitPaths.find(p => p.idx === bestPathIdx)
    if (!splitPath || segIndex >= splitPath.coords.length - 1) continue

    const pA = splitPath.coords[segIndex]
    const pB = splitPath.coords[segIndex + 1]

    let kA: string | null = null
    let kB: string | null = null
    for (const n of nodeCoords) {
      if (getDistance(n.coords, pA) < SNAP_THRESH) kA = n.key
      if (getDistance(n.coords, pB) < SNAP_THRESH) kB = n.key
    }
    if (!kA) {
      kA = getNodeKey(pA, level)
      if (!g.hasNode(kA)) { g.addNode(kA, { coords: pA, level }); nodeCoords.push({ key: kA, coords: pA, level }) }
    }
    if (!kB) {
      kB = getNodeKey(pB, level)
      if (!g.hasNode(kB)) { g.addNode(kB, { coords: pB, level }); nodeCoords.push({ key: kB, coords: pB, level }) }
    }

    // Sort snaps by distance from pA
    snaps.sort((a, b) => getDistance(pA, a.snapCoords) - getDistance(pA, b.snapCoords))

    for (const s of snaps) {
      if (!g.hasNode(s.key)) {
        g.addNode(s.key, { coords: s.snapCoords, level })
        nodeCoords.push({ key: s.key, coords: s.snapCoords, level })
      }
    }

    let prevKey = kA
    let prevCoords = pA
    for (const s of snaps) {
      const dist = getDistance(prevCoords, s.snapCoords)
      if (dist > 0.001 && prevKey !== s.key) {
        if (!g.hasUndirectedEdge(prevKey, s.key)) {
          g.addUndirectedEdge(prevKey, s.key, { weight: dist })
        }
      }
      prevKey = s.key
      prevCoords = s.snapCoords
    }

    const distToB = getDistance(prevCoords, pB)
    if (distToB > 0.001 && prevKey !== kB) {
      if (!g.hasUndirectedEdge(prevKey, kB)) {
        g.addUndirectedEdge(prevKey, kB, { weight: distToB })
      }
    }

    if (g.hasUndirectedEdge(kA, kB)) {
      g.dropUndirectedEdge(kA, kB)
    }
  }

  return results
}

// ──────────────────────────────────────────────────────────────────────────────
// Run Dijkstra on a graph from srcKey to dstKey
// Returns list of [lng, lat, level] or null if no path
// ──────────────────────────────────────────────────────────────────────────────
function runDijkstra(g: Graph, srcKey: string, dstKey: string, level: number): [number, number, number][] | null {
  if (srcKey === dstKey) {
    const attrs = g.getNodeAttributes(srcKey)
    return [[attrs.coords[0], attrs.coords[1], level]]
  }
  try {
    const pathKeys = dijkstra(g, srcKey, dstKey, 'weight')
    if (!pathKeys || pathKeys.length === 0) return null
    return pathKeys.map(key => {
      const attrs = g.getNodeAttributes(key)
      return [attrs.coords[0], attrs.coords[1], level] as [number, number, number]
    })
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Get all staircase transit pairs that cross from `originLevel` to `destLevel`.
// Each entry is: { originCoords, destCoords } using the connects_to field for
// exact pairing (no proximity heuristic — connects_to is authoritative).
//
// Only transit_type === 'staircase' features are considered.
// Lifts are intentionally excluded — routing always targets staircases.
// ──────────────────────────────────────────────────────────────────────────────
function getStaircasePairs(
  features: any[],
  originLevel: number,
  destLevel: number
): { originCoords: [number, number]; destCoords: [number, number]; name: string }[] {
  // Index all transit features by node_id for O(1) lookup
  const byNodeId: Record<string, any> = {}
  for (const f of features) {
    const nid = f.properties?.node_id
    if (nid && f.properties?.type === 'transit') byNodeId[nid] = f
  }

  const pairs: { originCoords: [number, number]; destCoords: [number, number]; name: string }[] = []

  const staircasesOnOrigin = features.filter(
    f => f.geometry?.type === 'Point' &&
    f.properties?.type === 'transit' &&
    f.properties?.transit_type === 'staircase' &&
    f.properties?.level === originLevel
  )

  for (const stair of staircasesOnOrigin) {
    const connectsTo: string[] = stair.properties?.connects_to ?? []
    for (const targetId of connectsTo) {
      const paired = byNodeId[targetId]
      if (!paired) continue
      if (paired.properties?.level !== destLevel) continue
      if (paired.properties?.transit_type !== 'staircase') continue

      pairs.push({
        originCoords: stair.geometry.coordinates as [number, number],
        destCoords: paired.geometry.coordinates as [number, number],
        name: stair.properties?.name ?? stair.properties?.node_id,
      })
    }
  }

  return pairs
}

// ──────────────────────────────────────────────────────────────────────────────
// Dijkstra cost-only helper (no path reconstruction, just total cost).
// Edge weights equal haversine distance, so we sum node-to-node distances.
// ──────────────────────────────────────────────────────────────────────────────
function dijkstraCost(g: Graph, srcKey: string, dstKey: string): number {
  if (srcKey === dstKey) return 0
  try {
    const path = dijkstra(g, srcKey, dstKey, 'weight')
    if (!path || path.length < 2) return Infinity
    let cost = 0
    for (let i = 1; i < path.length; i++) {
      const edgeKey = g.undirectedEdge(path[i - 1], path[i])
      if (edgeKey !== undefined) {
        cost += g.getEdgeAttribute(edgeKey, 'weight') ?? 0
      } else {
        // Fallback: use haversine between nodes (edge weight = haversine, so equivalent)
        const a = g.getNodeAttributes(path[i - 1])
        const b = g.getNodeAttributes(path[i])
        cost += getDistance(a.coords, b.coords)
      }
    }
    return cost
  } catch {
    return Infinity
  }
}


// ──────────────────────────────────────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────────────────────────────────────
export function computeShortestPath(
  features: any[],
  originLevel: number,
  originCoords: [number, number] | null,
  destLevel: number,
  destCoords: [number, number]
): [number, number, number][] {
  if (!originCoords) return []

  // ── Same-floor route ──────────────────────────────────────────────────────
  if (originLevel === destLevel) {
    const { g, nodeCoords, splitPaths } = buildFloorGraph(features, originLevel)
    const [originKey, destKey] = snapMultipleIntoGraph([originCoords, destCoords], originLevel, g, nodeCoords, splitPaths)
    if (!originKey || !destKey) return []
    return runDijkstra(g, originKey, destKey, originLevel) ?? []
  }

  // ── Multi-floor route ─────────────────────────────────────────────────────
  const originFloor = buildFloorGraph(features, originLevel)
  const destFloor = buildFloorGraph(features, destLevel)

  // Snap origin and destination into their floor graphs first
  const [originKey] = snapMultipleIntoGraph([originCoords], originLevel, originFloor.g, originFloor.nodeCoords, originFloor.splitPaths)
  const [destKey] = snapMultipleIntoGraph([destCoords], destLevel, destFloor.g, destFloor.nodeCoords, destFloor.splitPaths)

  if (!originKey || !destKey) {
    console.warn('[routing] Could not snap origin or destination into graph')
    return []
  }

  // Get all staircase pairs connecting originLevel ↔ destLevel
  const pairs = getStaircasePairs(features, originLevel, destLevel)
  console.log('[routing] staircase pairs:', pairs.map(p => p.name))

  if (pairs.length === 0) {
    console.warn('[routing] No staircase pairs found between levels', originLevel, destLevel)
    return []
  }

  // For each staircase candidate, snap it into both floor graphs and compute
  // total Dijkstra cost: cost(origin→stair on originLevel) + cost(stair→dest on destLevel)
  // Pick the candidate with minimum total cost.
  let bestSeg1: [number, number, number][] | null = null
  let bestSeg2: [number, number, number][] | null = null
  let bestStairOrigin: [number, number] | null = null
  let bestStairDest: [number, number] | null = null
  let bestCost = Infinity

  for (const pair of pairs) {
    // Clone the floor graphs so snapping one candidate doesn't contaminate others
    const oFloor = buildFloorGraph(features, originLevel)
    const dFloor = buildFloorGraph(features, destLevel)

    const [oOriginKey, oStairKey] = snapMultipleIntoGraph([originCoords, pair.originCoords], originLevel, oFloor.g, oFloor.nodeCoords, oFloor.splitPaths)
    const [dStairKey, dDestKey] = snapMultipleIntoGraph([pair.destCoords, destCoords], destLevel, dFloor.g, dFloor.nodeCoords, dFloor.splitPaths)

    if (!oOriginKey || !oStairKey || !dStairKey || !dDestKey) continue

    const cost1 = dijkstraCost(oFloor.g, oOriginKey, oStairKey)
    const cost2 = dijkstraCost(dFloor.g, dStairKey, dDestKey)
    const total = cost1 + cost2

    console.log(`[routing] stair ${pair.name}: cost1=${cost1.toFixed(1)} cost2=${cost2.toFixed(1)} total=${total.toFixed(1)}`)

    if (total < bestCost) {
      bestCost = total
      bestStairOrigin = pair.originCoords
      bestStairDest = pair.destCoords

      bestSeg1 = runDijkstra(oFloor.g, oOriginKey, oStairKey, originLevel)
      bestSeg2 = runDijkstra(dFloor.g, dStairKey, dDestKey, destLevel)
    }
  }

  if (!bestSeg1 || !bestSeg2 || !bestStairOrigin || !bestStairDest) {
    console.warn('[routing] Failed to compute route via any staircase')
    return []
  }

  // Stitch segments: seg1 ends at staircase on originLevel, transition, seg2 starts at staircase on destLevel
  const result: [number, number, number][] = [
    ...bestSeg1.slice(0, -1),
    [bestStairOrigin[0], bestStairOrigin[1], originLevel],
    [bestStairDest[0], bestStairDest[1], destLevel],
    ...bestSeg2.slice(1),
  ]
  console.log('[routing] best stair cost:', bestCost.toFixed(1), 'path length:', result.length)
  return result
}
