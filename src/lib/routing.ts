import Graph from 'graphology'
import { bidirectional as dijkstra } from 'graphology-shortest-path/dijkstra'
import { point, nearestPointOnLine } from '@turf/turf'

const getNodeKey = (coords: [number, number], level: number): string => {
  return `${coords[0].toFixed(7)},${coords[1].toFixed(7)},${level}`
}

// 2D line segment intersection helper
function lineIntersection(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number]
): [number, number] | null {
  const x1 = p1[0], y1 = p1[1]
  const x2 = p2[0], y2 = p2[1]
  const x3 = p3[0], y3 = p3[1]
  const x4 = p4[0], y4 = p4[1]

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)
  if (denom === 0) return null // parallel

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom

  const tol = 1e-9
  if (ua >= -tol && ua <= 1 + tol && ub >= -tol && ub <= 1 + tol) {
    return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)]
  }
  return null
}

// Haversine distance in meters
function getDistance(coord1: [number, number], coord2: [number, number]): number {
  const [lon1, lat1] = coord1
  const [lon2, lat2] = coord2
  const R = 6371e3
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLam = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Computes the shortest path along the corridor network spanning multiple floor levels.
 * Returns array of [lng, lat, level] tuples.
 */
export function computeShortestPath(
  features: any[],
  originLevel: number,
  originCoords: [number, number],
  destLevel: number,
  destCoords: [number, number]
): [number, number, number][] {
  // 1. All path features on L1 + L2
  const originalPaths = features.filter(
    (f) =>
      f.geometry &&
      f.properties?.type === 'path' &&
      (f.properties?.level === 1 || f.properties?.level === 2)
  )

  console.log('[routing] paths:', originalPaths.length, 'originLevel:', originLevel, 'destLevel:', destLevel)
  if (originalPaths.length === 0) return []

  // 2. Extract vertices — use ARRAY INDEX as unique ID (feature_id is null for all paths)
  const pathVertices = originalPaths.map((p, idx) => ({
    idx,                                                      // <-- unique key
    level: p.properties?.level as number,
    coords: [...(p.geometry.coordinates as [number, number][])]
  }))

  // 3. Find intersections between same-level paths
  const intersections: {
    idxA: number; idxB: number
    segA: number; segB: number
    coord: [number, number]
  }[] = []

  for (let i = 0; i < pathVertices.length; i++) {
    const pA = pathVertices[i]
    for (let j = i + 1; j < pathVertices.length; j++) {
      const pB = pathVertices[j]
      if (pA.level !== pB.level) continue   // only intersect same-floor paths

      for (let sA = 0; sA < pA.coords.length - 1; sA++) {
        for (let sB = 0; sB < pB.coords.length - 1; sB++) {
          const pt = lineIntersection(
            pA.coords[sA], pA.coords[sA + 1],
            pB.coords[sB], pB.coords[sB + 1]
          )
          if (pt) intersections.push({ idxA: i, idxB: j, segA: sA, segB: sB, coord: pt })
        }
      }
    }
  }

  console.log('[routing] intersections:', intersections.length)

  // 4. Assign intersections to segments
  const pathSegments = pathVertices.map((p) =>
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

  // 5. Split paths at intersections → splitPaths
  const splitPaths = pathVertices.map((p, i) => {
    const segs = pathSegments[i]
    const coords: [number, number][] = [segs[0].start]

    segs.forEach((seg) => {
      const sorted = [...seg.inters].sort(
        (a, b) => getDistance(seg.start, a) - getDistance(seg.start, b)
      )
      sorted.forEach((pt) => {
        if (getDistance(coords[coords.length - 1], pt) > 0.001) coords.push(pt)
      })
      if (getDistance(coords[coords.length - 1], seg.end) > 0.001) coords.push(seg.end)
    })

    return { idx: p.idx, level: p.level, coords }
  })

  // 6. Build graph
  const g = new Graph()
  const nodeCoords: { key: string; coords: [number, number]; level: number }[] = []
  const SNAP_THRESH = 0.1 // 10 cm

  function getOrCreateNode(coords: [number, number], level: number): string {
    for (const n of nodeCoords) {
      if (n.level === level && getDistance(n.coords, coords) < SNAP_THRESH) return n.key
    }
    const key = getNodeKey(coords, level)
    if (!g.hasNode(key)) {
      g.addNode(key, { coords, level })
      nodeCoords.push({ key, coords, level })
    }
    return key
  }

  splitPaths.forEach((path) => {
    if (path.coords.length < 2) return
    for (let i = 1; i < path.coords.length; i++) {
      const kA = getOrCreateNode(path.coords[i - 1], path.level)
      const kB = getOrCreateNode(path.coords[i], path.level)
      if (kA !== kB && !g.hasUndirectedEdge(kA, kB)) {
        g.addUndirectedEdge(kA, kB, { weight: getDistance(path.coords[i - 1], path.coords[i]) })
      }
    }
  })

  // 7. Snap a point to the nearest path on targetLevel, insert into graph
  function snapAndInsert(coords: [number, number], targetLevel: number): string | null {
    const pt = point(coords)

    // Build turf-friendly line features for this level using splitPaths
    const levelPaths = splitPaths
      .filter((p) => p.level === targetLevel)
      .map((p) => ({
        pathIdx: p.idx,                       // <-- numeric, unique
        feature: {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: p.coords },
          properties: { pathIdx: p.idx }      // store idx in properties
        }
      }))

    if (levelPaths.length === 0) {
      console.warn('[routing] No paths on level', targetLevel)
      return null
    }

    let minDist = Infinity
    let bestSnapped: any = null
    let bestPathIdx: number = -1

    for (const { pathIdx, feature } of levelPaths) {
      try {
        const snapped = nearestPointOnLine(feature, pt)
        const dist = snapped.properties?.dist ?? Infinity
        if (dist < minDist) {
          minDist = dist
          bestSnapped = snapped
          bestPathIdx = pathIdx
        }
      } catch { /* skip bad geometries */ }
    }

    if (!bestSnapped || bestPathIdx === -1) return null

    const snapCoords = bestSnapped.geometry.coordinates as [number, number]

    // If an existing node is close enough, reuse it
    for (const n of nodeCoords) {
      if (n.level === targetLevel && getDistance(n.coords, snapCoords) < SNAP_THRESH) {
        return n.key
      }
    }

    // Find the split path by numeric index — always correct
    const splitPath = splitPaths.find((p) => p.idx === bestPathIdx)
    if (!splitPath) return null

    const segIndex = bestSnapped.properties?.index
    if (segIndex === undefined || segIndex >= splitPath.coords.length - 1) return null

    const pA = splitPath.coords[segIndex]
    const pB = splitPath.coords[segIndex + 1]
    const kA = getOrCreateNode(pA, targetLevel)
    const kB = getOrCreateNode(pB, targetLevel)

    const snapKey = getNodeKey(snapCoords, targetLevel)
    if (g.hasNode(snapKey)) return snapKey

    g.addNode(snapKey, { coords: snapCoords, level: targetLevel })
    nodeCoords.push({ key: snapKey, coords: snapCoords, level: targetLevel })

    const dA = getDistance(pA, snapCoords)
    const dB = getDistance(snapCoords, pB)

    if (dA > 0.001) g.addUndirectedEdge(kA, snapKey, { weight: dA })
    if (dB > 0.001) g.addUndirectedEdge(snapKey, kB, { weight: dB })

    // Remove old direct edge if it existed
    if (g.hasUndirectedEdge(kA, kB)) g.dropUndirectedEdge(kA, kB)

    return snapKey
  }

  // 8. Connect L1↔L2 via transit pairs (lifts/stairs with same name & close coords)
  const transitFeatures = features.filter((f) => f.properties?.type === 'transit')
  const l1Transits = transitFeatures.filter((f) => f.properties?.level === 1)
  const l2Transits = transitFeatures.filter((f) => f.properties?.level === 2)

  console.log('[routing] transits L1:', l1Transits.length, 'L2:', l2Transits.length)

  // Floor transition cost: ~15m equivalent (makes router prefer transit only when needed)
  const TRANSIT_COST = 15.0

  l1Transits.forEach((t1) => {
    const c1 = t1.geometry.coordinates as [number, number]
    const name1 = t1.properties?.name

    // Match by same name OR same coordinates within 2m
    const t2 = l2Transits.find((t2) => {
      const c2 = t2.geometry.coordinates as [number, number]
      const sameName = name1 && t2.properties?.name === name1
      const closeEnough = getDistance(c1, c2) < 2.0
      return sameName || closeEnough
    })

    if (!t2) return

    const key1 = snapAndInsert(c1, 1)
    const key2 = snapAndInsert(t2.geometry.coordinates as [number, number], 2)

    if (key1 && key2 && !g.hasUndirectedEdge(key1, key2)) {
      g.addUndirectedEdge(key1, key2, { weight: TRANSIT_COST })
      console.log(`[routing] transit edge: ${name1} (L1↔L2)`)
    }
  })

  console.log('[routing] graph order:', g.order, 'size:', g.size)

  // 9. Snap origin + destination into graph
  const originKey = snapAndInsert(originCoords, originLevel)
  const destKey = snapAndInsert(destCoords, destLevel)

  console.log('[routing] originKey:', originKey, 'destKey:', destKey)
  if (!originKey || !destKey) return []

  // 10. Run Dijkstra
  try {
    const pathKeys = dijkstra(g, originKey, destKey, 'weight')
    console.log('[routing] path length:', pathKeys?.length)
    if (!pathKeys) return []

    return pathKeys.map((key) => {
      const attrs = g.getNodeAttributes(key)
      return [attrs.coords[0], attrs.coords[1], attrs.level] as [number, number, number]
    })
  } catch (err) {
    console.error('[routing] Dijkstra error:', err)
    return []
  }
}
