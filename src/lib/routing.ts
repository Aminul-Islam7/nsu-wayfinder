import Graph from 'graphology'
import { bidirectional as dijkstra } from 'graphology-shortest-path/dijkstra'
import { distance as turfDistance, point, nearestPointOnLine } from '@turf/turf'

const getNodeKey = (coords: [number, number], level: number): string => {
  return `${coords[0].toFixed(7)},${coords[1].toFixed(7)},${level}`
}

// 2D Line intersection helper
function lineIntersection(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number]
): [number, number] | null {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];
  const x4 = p4[0], y4 = p4[1];

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null; // Parallel

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  const tol = 1e-9;
  if (ua >= -tol && ua <= 1 + tol && ub >= -tol && ub <= 1 + tol) {
    const x = x1 + ua * (x2 - x1);
    const y = y1 + ua * (y2 - y1);
    return [x, y];
  }

  return null;
}

// Position distance in meters
function getDistance(coord1: [number, number], coord2: [number, number]): number {
  const lon1 = coord1[0], lat1 = coord1[1];
  const lon2 = coord2[0], lat2 = coord2[1];
  const R = 6371e3; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Computes the shortest path along the corridor network spanning multiple floor levels.
 */
export function computeShortestPath(
  features: any[],
  originLevel: number,
  originCoords: [number, number],
  destLevel: number,
  destCoords: [number, number]
): [number, number, number][] {
  // 1. Get all path features on levels 1 and 2
  const originalPaths = features.filter(
    (f) =>
      f.geometry &&
      f.properties?.type === 'path' &&
      (f.properties?.level === 1 || f.properties?.level === 2)
  )

  console.log('computeShortestPath inputs:', {
    originLevel,
    originCoords,
    destLevel,
    destCoords,
    originalPathsCount: originalPaths.length
  });

  if (originalPaths.length === 0) return []

  // 2. Extract coordinates and IDs from path features
  const pathVertices = originalPaths.map((p) => ({
    id: p.properties?._feature_id || 'unnamed',
    coords: [...(p.geometry.coordinates as [number, number][])]
  }))

  // 3. Find all intersection points between paths on the same floor level
  const intersections: { idxA: number; idxB: number; segA: number; segB: number; coord: [number, number] }[] = []

  for (let i = 0; i < pathVertices.length; i++) {
    const pA = pathVertices[i]
    const lvlA = originalPaths[i].properties?.level
    for (let j = i + 1; j < pathVertices.length; j++) {
      const pB = pathVertices[j]
      const lvlB = originalPaths[j].properties?.level

      // Only intersect paths on the same floor level!
      if (lvlA !== lvlB) continue

      for (let sA = 0; sA < pA.coords.length - 1; sA++) {
        for (let sB = 0; sB < pB.coords.length - 1; sB++) {
          const pt = lineIntersection(
            pA.coords[sA],
            pA.coords[sA + 1],
            pB.coords[sB],
            pB.coords[sB + 1]
          )
          if (pt) {
            intersections.push({
              idxA: i,
              idxB: j,
              segA: sA,
              segB: sB,
              coord: pt
            })
          }
        }
      }
    }
  }

  console.log(`Found ${intersections.length} intersections across all levels`);

  // 4. Assign intersections to the corresponding segments
  const pathSegments = pathVertices.map((p) => {
    const segments: { start: [number, number]; end: [number, number]; intersections: [number, number][] }[] = []
    for (let i = 0; i < p.coords.length - 1; i++) {
      segments.push({
        start: p.coords[i],
        end: p.coords[i + 1],
        intersections: []
      })
    }
    return segments
  })

  intersections.forEach((inter) => {
    pathSegments[inter.idxA][inter.segA].intersections.push(inter.coord)
    pathSegments[inter.idxB][inter.segB].intersections.push(inter.coord)
  })

  // 5. Reconstruct paths by splitting at intersection points
  const splitPaths = pathVertices.map((p, idx) => {
    const segments = pathSegments[idx]
    const coords: [number, number][] = [segments[0].start]

    segments.forEach((seg) => {
      // Sort intersections on this segment by distance from start
      const sortedInters = [...seg.intersections].sort((a, b) => {
        return getDistance(seg.start, a) - getDistance(seg.start, b)
      })

      // Add sorted intersections, avoiding duplicates
      sortedInters.forEach((pt) => {
        const last = coords[coords.length - 1]
        if (getDistance(last, pt) > 0.001) {
          coords.push(pt)
        }
      })

      // Add segment end point
      const last = coords[coords.length - 1]
      if (getDistance(last, seg.end) > 0.001) {
        coords.push(seg.end)
      }
    })

    return {
      id: p.id,
      level: originalPaths[idx].properties?.level as number,
      coords
    }
  })

  // 6. Build the Graphology Graph with level-aware nodes
  const g = new Graph()
  const nodeCoords: { key: string; coords: [number, number]; level: number }[] = []
  const SNAP_THRESHOLD = 0.1 // 10 cm snapping threshold

  function getOrCreateNodeKey(coords: [number, number], level: number): string {
    for (const item of nodeCoords) {
      if (item.level === level && getDistance(item.coords, coords) < SNAP_THRESHOLD) {
        return item.key
      }
    }
    const key = getNodeKey(coords, level)
    if (g.hasNode(key)) return key
    g.addNode(key, { coords, level })
    nodeCoords.push({ key, coords, level })
    return key
  }

  splitPaths.forEach((path) => {
    const coords = path.coords
    const level = path.level
    if (!coords || coords.length < 2) return

    for (let i = 0; i < coords.length; i++) {
      const key = getOrCreateNodeKey(coords[i], level)

      if (i > 0) {
        const prevKey = getOrCreateNodeKey(coords[i - 1], level)
        const currKey = key

        if (prevKey !== currKey && !g.hasUndirectedEdge(prevKey, currKey)) {
          const d = getDistance(coords[i - 1], coords[i])
          g.addUndirectedEdge(prevKey, currKey, { weight: d })
        }
      }
    }
  })

  // 7. Snapping helper for level-specific endpoints
  const snapAndInsert = (coords: [number, number], targetLevel: number): string | null => {
    const pt = point(coords)
    let minDistance = Infinity
    let closestSnapped: any = null
    let closestPath: any = null

    // Filter paths to active floor only
    const targetPaths = splitPaths.filter((p) => p.level === targetLevel).map((p) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: p.coords
      },
      properties: {
        _feature_id: p.id
      }
    }))

    for (const path of targetPaths) {
      try {
        const snapped = nearestPointOnLine(path, pt)
        const dist = snapped.properties?.dist ?? Infinity
        if (dist < minDistance) {
          minDistance = dist
          closestSnapped = snapped
          closestPath = path
        }
      } catch (e) {
        console.error(e)
      }
    }

    if (!closestSnapped || !closestPath) {
      return null
    }

    const snapCoords = closestSnapped.geometry.coordinates as [number, number]
    
    // Check if snapped point is within SNAP_THRESHOLD of an existing node on this level
    for (const item of nodeCoords) {
      if (item.level === targetLevel && getDistance(item.coords, snapCoords) < SNAP_THRESHOLD) {
        return item.key
      }
    }

    const snapKey = getNodeKey(snapCoords, targetLevel)
    if (g.hasNode(snapKey)) {
      return snapKey
    }

    const segIndex = closestSnapped.properties?.index
    if (segIndex === undefined) return null

    const splitPath = splitPaths.find((p) => p.id === closestPath.properties?._feature_id)
    if (!splitPath) return null

    const pathCoords = splitPath.coords
    if (segIndex >= pathCoords.length - 1) return null

    const pA = pathCoords[segIndex]
    const pB = pathCoords[segIndex + 1]

    const keyA = getOrCreateNodeKey(pA, targetLevel)
    const keyB = getOrCreateNodeKey(pB, targetLevel)

    // Add snapped node
    g.addNode(snapKey, { coords: snapCoords, level: targetLevel })
    nodeCoords.push({ key: snapKey, coords: snapCoords, level: targetLevel })

    // Add split edges
    const distA = getDistance(pA, snapCoords)
    const distB = getDistance(snapCoords, pB)

    g.addUndirectedEdge(keyA, snapKey, { weight: distA })
    g.addUndirectedEdge(snapKey, keyB, { weight: distB })

    if (g.hasUndirectedEdge(keyA, keyB)) {
      g.dropUndirectedEdge(keyA, keyB)
    }

    return snapKey
  }

  // 8. Connect L1 and L2 transit features
  const transitFeatures = features.filter((f) => f.properties?.type === 'transit')
  const l1Transits = transitFeatures.filter((f) => f.properties?.level === 1)
  const l2Transits = transitFeatures.filter((f) => f.properties?.level === 2)

  console.log(`Connecting transits. L1 count: ${l1Transits.length}, L2 count: ${l2Transits.length}`)

  l1Transits.forEach((t1) => {
    const coords1 = t1.geometry.coordinates as [number, number]
    // Find matching transit on L2
    const t2 = l2Transits.find((t2) => {
      const coords2 = t2.geometry.coordinates as [number, number]
      // They should be extremely close in 2D space (typically same coords)
      return getDistance(coords1, coords2) < 2.0 // within 2 meters
    })

    if (t2) {
      // Snap transit point on L1 to L1 path network
      const key1 = snapAndInsert(coords1, 1)
      // Snap transit point on L2 to L2 path network
      const key2 = snapAndInsert(t2.geometry.coordinates as [number, number], 2)

      if (key1 && key2) {
        // Add vertical edge between the L1 path snap and L2 path snap!
        if (!g.hasUndirectedEdge(key1, key2)) {
          // Weight of 5.0 represents floor transition penalty (5 meters equivalent)
          g.addUndirectedEdge(key1, key2, { weight: 5.0 })
          console.log(`Connected transits: ${t1.properties?.name} (${key1} <-> ${key2})`)
        }
      }
    }
  })

  console.log(`Graph built. Order: ${g.order}, Size: ${g.size}`);

  const originKey = snapAndInsert(originCoords, originLevel)
  const destKey = snapAndInsert(destCoords, destLevel)

  if (typeof window !== 'undefined' && (window as any).useStore) {
    (window as any).useStore.debugGraph = g;
    (window as any).useStore.debugKeys = { originKey, destKey };
  }

  console.log('originKey:', originKey, 'destKey:', destKey);

  if (!originKey || !destKey) return []

  try {
    const pathKeys = dijkstra(g, originKey, destKey, 'weight')
    console.log('pathKeys found:', pathKeys);
    if (!pathKeys) return []

    return pathKeys.map((key) => {
      const attrs = g.getNodeAttributes(key)
      return [attrs.coords[0], attrs.coords[1], attrs.level] as [number, number, number]
    })
  } catch (err) {
    console.error('Dijkstra pathfinding error:', err)
    return []
  }
}
