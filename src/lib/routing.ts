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
function snapIntoGraph(
  coords: [number, number],
  level: number,
  g: Graph,
  nodeCoords: { key: string; coords: [number, number]; level: number }[],
  splitPaths: { idx: number; level: number; coords: [number, number][] }[]
): string | null {
  const SNAP_THRESH = 0.1
  const pt = point(coords)

  const levelPaths = splitPaths.map(p => ({
    pathIdx: p.idx,
    feature: {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: p.coords },
      properties: { pathIdx: p.idx }
    }
  }))

  if (levelPaths.length === 0) return null

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

  if (!bestSnapped || bestPathIdx === -1) return null

  const snapCoords = bestSnapped.geometry.coordinates as [number, number]

  // Reuse existing node if close enough
  for (const n of nodeCoords) {
    if (getDistance(n.coords, snapCoords) < SNAP_THRESH) return n.key
  }

  const splitPath = splitPaths.find(p => p.idx === bestPathIdx)
  if (!splitPath) return null

  const segIndex = bestSnapped.properties?.index
  if (segIndex === undefined || segIndex >= splitPath.coords.length - 1) return null

  const pA = splitPath.coords[segIndex]
  const pB = splitPath.coords[segIndex + 1]

  // Need at least one neighbor node
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

  const snapKey = getNodeKey(snapCoords, level)
  if (g.hasNode(snapKey)) return snapKey

  g.addNode(snapKey, { coords: snapCoords, level })
  nodeCoords.push({ key: snapKey, coords: snapCoords, level })

  const dA = getDistance(pA, snapCoords)
  const dB = getDistance(snapCoords, pB)
  if (dA > 0.001) g.addUndirectedEdge(kA, snapKey, { weight: dA })
  if (dB > 0.001) g.addUndirectedEdge(snapKey, kB, { weight: dB })
  if (g.hasUndirectedEdge(kA, kB)) g.dropUndirectedEdge(kA, kB)

  return snapKey
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
// Find the nearest transit node (lift/staircase access point) on a given level.
// NOTE: The GeoJSON data only contains transit_type === 'lift' entries.
// Design decision: assume every lift location also has a nearby staircase.
// So we route to the nearest transit node regardless of transit_type.
// ──────────────────────────────────────────────────────────────────────────────
function findNearestTransit(
  features: any[],
  fromCoords: [number, number],
  level: number
): { coords: [number, number]; pairedCoords: [number, number] | null } | null {
  const transitsOnLevel = features.filter(
    f => f.geometry?.type === 'Point' &&
    f.properties?.type === 'transit' &&
    f.properties?.level === level
  )

  if (transitsOnLevel.length === 0) return null

  let nearest: any = null
  let minDist = Infinity
  for (const t of transitsOnLevel) {
    const d = getDistance(fromCoords, t.geometry.coordinates as [number, number])
    if (d < minDist) { minDist = d; nearest = t }
  }
  if (!nearest) return null

  const transitCoords = nearest.geometry.coordinates as [number, number]
  const transitName = nearest.properties?.name
  const transitNodeId = nearest.properties?.node_id

  // Find paired transit on the other floor by name match or proximity (< 5m)
  const otherLevel = level === 1 ? 2 : 1
  const paired = features.find(
    f => f.geometry?.type === 'Point' &&
    f.properties?.type === 'transit' &&
    f.properties?.level === otherLevel &&
    (f.properties?.name === transitName ||
     (transitNodeId && f.properties?.node_id && f.properties.node_id.replace(`_L${otherLevel}`, '') === transitNodeId.replace(`_L${level}`, '')) ||
     getDistance(f.geometry.coordinates as [number, number], transitCoords) < 5)
  )

  return {
    coords: transitCoords,
    pairedCoords: paired ? (paired.geometry.coordinates as [number, number]) : null
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
    const originKey = snapIntoGraph(originCoords, originLevel, g, nodeCoords, splitPaths)
    const destKey = snapIntoGraph(destCoords, destLevel, g, nodeCoords, splitPaths)
    if (!originKey || !destKey) return []
    return runDijkstra(g, originKey, destKey, originLevel) ?? []
  }

  // ── Multi-floor route ─────────────────────────────────────────────────────
  // Build independent graphs for origin and dest levels
  const originFloor = buildFloorGraph(features, originLevel)
  const destFloor = buildFloorGraph(features, destLevel)

  // Find nearest transit node (lift) from origin — acts as staircase access point
  const transitInfo = findNearestTransit(features, originCoords, originLevel)
  if (!transitInfo) {
    console.warn('[routing] No transit found on level', originLevel)
    return []
  }

  const { coords: stairOnOrigin, pairedCoords: stairOnDest } = transitInfo

  if (!stairOnDest) {
    console.warn('[routing] No paired transit found on level', destLevel)
    return []
  }


  // Snap all points into their respective floor graphs
  const originKey = snapIntoGraph(originCoords, originLevel, originFloor.g, originFloor.nodeCoords, originFloor.splitPaths)
  const stairOriginKey = snapIntoGraph(stairOnOrigin, originLevel, originFloor.g, originFloor.nodeCoords, originFloor.splitPaths)

  const stairDestKey = snapIntoGraph(stairOnDest, destLevel, destFloor.g, destFloor.nodeCoords, destFloor.splitPaths)
  const destKey = snapIntoGraph(destCoords, destLevel, destFloor.g, destFloor.nodeCoords, destFloor.splitPaths)

  console.log('[routing] multi-floor:', { originKey, stairOriginKey, stairDestKey, destKey })

  if (!originKey || !stairOriginKey || !stairDestKey || !destKey) return []

  // Segment 1: origin → staircase on origin level
  const seg1 = runDijkstra(originFloor.g, originKey, stairOriginKey, originLevel)
  // Segment 2: staircase on dest level → destination
  const seg2 = runDijkstra(destFloor.g, stairDestKey, destKey, destLevel)

  if (!seg1 || !seg2) {
    console.warn('[routing] Failed to compute one of the segments')
    return []
  }

  // Stitch: seg1 ends at staircase on origin level, seg2 starts at staircase on dest level
  // Remove the last point of seg1 to avoid duplicate at the staircase junction
  const result = [...seg1.slice(0, -1), [stairOnOrigin[0], stairOnOrigin[1], originLevel] as [number, number, number], [stairOnDest[0], stairOnDest[1], destLevel] as [number, number, number], ...seg2.slice(1)]
  return result
}
