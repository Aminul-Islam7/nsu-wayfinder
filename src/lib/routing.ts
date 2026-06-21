import Graph from 'graphology'
import { bidirectional as dijkstra } from 'graphology-shortest-path/dijkstra'
import { distance as turfDistance, point, nearestPointOnLine } from '@turf/turf'

const getNodeKey = (coords: [number, number]): string => {
  return `${coords[0].toFixed(7)},${coords[1].toFixed(7)}`
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

// Haversine distance in meters
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
 * Computes the shortest path along the corridor network for a single floor.
 */
export function computeShortestPath(
  features: any[],
  activeLevel: number,
  originCoords: [number, number],
  destCoords: [number, number]
): [number, number][] {
  // 1. Get all path features on activeLevel
  const originalPaths = features.filter(
    (f) =>
      f.geometry &&
      f.properties?.type === 'path' &&
      f.properties?.level === activeLevel
  )

  console.log('computeShortestPath inputs:', {
    activeLevel,
    originCoords,
    destCoords,
    originalPathsCount: originalPaths.length
  });

  if (originalPaths.length === 0) return []

  // 2. Extract coordinates and IDs from path features
  const pathVertices = originalPaths.map((p) => ({
    id: p.properties?._feature_id || 'unnamed',
    coords: [...(p.geometry.coordinates as [number, number][])]
  }))

  // 3. Find all intersection points between all paths
  const intersections: { idxA: number; idxB: number; segA: number; segB: number; coord: [number, number] }[] = []

  for (let i = 0; i < pathVertices.length; i++) {
    const pA = pathVertices[i]
    for (let j = i + 1; j < pathVertices.length; j++) {
      const pB = pathVertices[j]

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

  console.log(`Found ${intersections.length} intersections on activeLevel ${activeLevel}`);

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
      coords
    }
  })

  console.log(`splitPaths count: ${splitPaths.length}`);

  // 6. Build the Graphology Graph with 10 cm snapping threshold
  const g = new Graph()
  const nodeCoords: { key: string; coords: [number, number] }[] = []
  const SNAP_THRESHOLD = 0.1 // 10 cm snapping threshold

  function getOrCreateNodeKey(coords: [number, number]): string {
    for (const item of nodeCoords) {
      if (getDistance(item.coords, coords) < SNAP_THRESHOLD) {
        return item.key
      }
    }
    const key = getNodeKey(coords)
    if (g.hasNode(key)) return key
    g.addNode(key, { coords })
    nodeCoords.push({ key, coords })
    return key
  }

  splitPaths.forEach((path) => {
    const coords = path.coords
    if (!coords || coords.length < 2) return

    for (let i = 0; i < coords.length; i++) {
      const key = getOrCreateNodeKey(coords[i])

      if (i > 0) {
        const prevKey = getOrCreateNodeKey(coords[i - 1])
        const currKey = key

        if (prevKey !== currKey && !g.hasUndirectedEdge(prevKey, currKey)) {
          const d = getDistance(coords[i - 1], coords[i])
          g.addUndirectedEdge(prevKey, currKey, { weight: d })
        }
      }
    }
  })

  console.log(`Graph built. Order: ${g.order}, Size: ${g.size}`);

  // 7. Snapping origin and destination to the nearest split path segment
  const turfPaths = splitPaths.map((p) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: p.coords
    },
    properties: {
      _feature_id: p.id
    }
  }))

  const snapAndInsert = (coords: [number, number]): string | null => {
    const pt = point(coords)
    let minDistance = Infinity
    let closestSnapped: any = null
    let closestPath: any = null

    for (const path of turfPaths) {
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
      console.log('snapAndInsert failed: no closest snapped/path');
      return null
    }

    const snapCoords = closestSnapped.geometry.coordinates as [number, number]
    
    // Check if snapped point is within SNAP_THRESHOLD of an existing node
    for (const item of nodeCoords) {
      if (getDistance(item.coords, snapCoords) < SNAP_THRESHOLD) {
        return item.key
      }
    }

    const snapKey = getNodeKey(snapCoords)
    if (g.hasNode(snapKey)) {
      return snapKey
    }

    console.log('snapAndInsert snapped:', {
      coords,
      minDistance,
      snapCoords,
      snapKey,
      closestPathId: closestPath.properties?._feature_id
    });

    if (g.hasNode(snapKey)) {
      return snapKey
    }

    const segIndex = closestSnapped.properties?.index
    if (segIndex === undefined) {
      console.log('snapAndInsert failed: segIndex undefined');
      return null
    }

    const pathCoords = closestPath.geometry.coordinates as [number, number][]
    if (segIndex >= pathCoords.length - 1) {
      console.log('snapAndInsert failed: segIndex out of bounds', { segIndex, pathCoordsLength: pathCoords.length });
      return null
    }

    const pA = pathCoords[segIndex]
    const pB = pathCoords[segIndex + 1]

    const keyA = getOrCreateNodeKey(pA)
    const keyB = getOrCreateNodeKey(pB)

    // Add snapped node
    g.addNode(snapKey, { coords: snapCoords })

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

  const originKey = snapAndInsert(originCoords)
  const destKey = snapAndInsert(destCoords)

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

    return pathKeys.map((key) => g.getNodeAttributes(key).coords as [number, number])
  } catch (err) {
    console.error('Dijkstra pathfinding error:', err)
    return []
  }
}
