import Graph from 'graphology'
import { bidirectional as dijkstra } from 'graphology-shortest-path/dijkstra'
import { distance, point, nearestPointOnLine } from '@turf/turf'

const getNodeKey = (coords: [number, number]): string => {
  return `${coords[0].toFixed(7)},${coords[1].toFixed(7)}`
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
  const paths = features.filter(
    (f) =>
      f.geometry &&
      f.properties?.type === 'path' &&
      f.properties?.level === activeLevel
  )

  if (paths.length === 0) return []

  const g = new Graph()

  // 2. Build graph from paths
  paths.forEach((path) => {
    const coords = path.geometry.coordinates as [number, number][]
    if (!coords || coords.length < 2) return

    for (let i = 0; i < coords.length; i++) {
      const key = getNodeKey(coords[i])
      if (!g.hasNode(key)) {
        g.addNode(key, { coords: coords[i] })
      }

      if (i > 0) {
        const prevKey = getNodeKey(coords[i - 1])
        const currKey = getNodeKey(coords[i])
        const d = distance(point(coords[i - 1]), point(coords[i]), { units: 'meters' })
        
        if (!g.hasEdge(prevKey, currKey)) {
          g.addEdge(prevKey, currKey, { weight: d })
        }
      }
    }
  })

  // 3. Helper to snap coordinate and insert it into the graph
  const snapAndInsert = (coords: [number, number]): string | null => {
    const pt = point(coords)
    let minDistance = Infinity
    let closestSnapped: any = null
    let closestPath: any = null

    // Find closest path LineString
    for (const path of paths) {
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

    if (!closestSnapped || !closestPath) return null

    const snapCoords = closestSnapped.geometry.coordinates as [number, number]
    const snapKey = getNodeKey(snapCoords)

    // If snapped exactly to an existing vertex, return it
    if (g.hasNode(snapKey)) {
      return snapKey
    }

    // Otherwise, insert it by splitting the segment it lies on
    const segIndex = closestSnapped.properties?.index
    if (segIndex === undefined) return null

    const pathCoords = closestPath.geometry.coordinates as [number, number][]
    if (segIndex >= pathCoords.length - 1) return null

    const pA = pathCoords[segIndex]
    const pB = pathCoords[segIndex + 1]

    const keyA = getNodeKey(pA)
    const keyB = getNodeKey(pB)

    // Add snapped node
    g.addNode(snapKey, { coords: snapCoords })

    // Add split edges
    const distA = distance(point(pA), point(snapCoords), { units: 'meters' })
    const distB = distance(point(snapCoords), point(pB), { units: 'meters' })

    g.addEdge(keyA, snapKey, { weight: distA })
    g.addEdge(snapKey, keyB, { weight: distB })

    // Remove direct edge if it exists
    if (g.hasEdge(keyA, keyB)) {
      g.dropEdge(keyA, keyB)
    }

    return snapKey
  }

  // 4. Insert origin and destination into graph
  const originKey = snapAndInsert(originCoords)
  const destKey = snapAndInsert(destCoords)

  if (!originKey || !destKey) return []

  try {
    // 5. Run Dijkstra shortest path
    const pathKeys = dijkstra(g, originKey, destKey, 'weight')
    if (!pathKeys) return []

    // 6. Map back to coordinate arrays
    return pathKeys.map((key) => g.getNodeAttributes(key).coords as [number, number])
  } catch (err) {
    console.error('Dijkstra pathfinding error:', err)
    return []
  }
}
