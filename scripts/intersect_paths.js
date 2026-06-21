import fs from 'fs';
import Graph from 'graphology';

// Simple line intersection in 2D
// Line A: p1 to p2, Line B: p3 to p4
function lineIntersection(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];
  const x4 = p4[0], y4 = p4[1];

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null; // Parallel

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  // Is intersection on both segments?
  // We allow a tiny tolerance to include endpoints
  const tol = 1e-9;
  if (ua >= -tol && ua <= 1 + tol && ub >= -tol && ub <= 1 + tol) {
    const x = x1 + ua * (x2 - x1);
    const y = y1 + ua * (y2 - y1);
    return [x, y];
  }

  return null;
}

// Distance in meters
function getDistance(coord1, coord2) {
  const lon1 = coord1[0], lat1 = coord1[1];
  const lon2 = coord2[0], lat2 = coord2[1];
  const R = 6371e3;
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

const data = JSON.parse(fs.readFileSync('nsu_indoor_map_merged_clean.geojson', 'utf8'));

function analyzeLevel(level) {
  const paths = data.features.filter(f => f.properties.type === 'path' && f.properties.level === level);
  console.log(`\n--- Level ${level} ---`);
  console.log(`Original paths: ${paths.length}`);

  // Reconstruct paths by finding and inserting all intersections
  // We represent each path as an array of vertices
  const pathVertices = paths.map(p => ({
    id: p.properties._feature_id || 'unnamed',
    coords: [...p.geometry.coordinates]
  }));

  // Find all intersections
  const intersections = []; // { pathA, pathB, coord }

  for (let i = 0; i < pathVertices.length; i++) {
    const pA = pathVertices[i];
    for (let j = i + 1; j < pathVertices.length; j++) {
      const pB = pathVertices[j];
      
      // Intersect every segment of A with every segment of B
      for (let sA = 0; sA < pA.coords.length - 1; sA++) {
        for (let sB = 0; sB < pB.coords.length - 1; sB++) {
          const pt = lineIntersection(
            pA.coords[sA], pA.coords[sA+1],
            pB.coords[sB], pB.coords[sB+1]
          );
          if (pt) {
            intersections.push({
              idxA: i,
              idxB: j,
              segA: sA,
              segB: sB,
              coord: pt
            });
          }
        }
      }
    }
  }

  console.log(`Found ${intersections.length} intersections`);

  // Now insert intersection points into the paths.
  // To do this cleanly, for each path segment, we collect all intersection points that lie on it,
  // sort them by distance from the segment's start point, and insert them.
  const pathSegments = pathVertices.map(p => {
    const segments = [];
    for (let i = 0; i < p.coords.length - 1; i++) {
      segments.push({
        start: p.coords[i],
        end: p.coords[i+1],
        intersections: []
      });
    }
    return segments;
  });

  // Assign intersections to segments
  intersections.forEach(inter => {
    pathSegments[inter.idxA][inter.segA].intersections.push(inter.coord);
    pathSegments[inter.idxB][inter.segB].intersections.push(inter.coord);
  });

  // Reconstruct the paths
  const newPaths = pathVertices.map((p, idx) => {
    const segments = pathSegments[idx];
    const coords = [segments[0].start];
    
    segments.forEach(seg => {
      // Sort intersections on this segment by distance from start
      const sortedInters = [...seg.intersections].sort((a, b) => {
        return getDistance(seg.start, a) - getDistance(seg.start, b);
      });
      
      // Add them, avoiding duplicates
      sortedInters.forEach(pt => {
        const last = coords[coords.length - 1];
        if (getDistance(last, pt) > 0.001) {
          coords.push(pt);
        }
      });
      
      // Add end point
      const last = coords[coords.length - 1];
      if (getDistance(last, seg.end) > 0.001) {
        coords.push(seg.end);
      }
    });

    return {
      id: p.id,
      coords
    };
  });

  // Build the graph using the reconstructed paths (with 5cm snapping threshold for safety)
  const g = new Graph();
  const nodeCoords = [];
  const thresholdMeters = 0.05;

  function getOrCreateNodeKey(coords) {
    for (const item of nodeCoords) {
      if (getDistance(item.coords, coords) < thresholdMeters) {
        return item.key;
      }
    }
    const key = `${coords[0].toFixed(7)},${coords[1].toFixed(7)}`;
    if (g.hasNode(key)) return key;
    g.addNode(key, { coords });
    nodeCoords.push({ key, coords });
    return key;
  }

  newPaths.forEach((path) => {
    const coords = path.coords;
    if (!coords || coords.length < 2) return;

    for (let i = 0; i < coords.length; i++) {
      const key = getOrCreateNodeKey(coords[i]);

      if (i > 0) {
        const prevKey = getOrCreateNodeKey(coords[i - 1]);
        const currKey = key;
        
        if (prevKey !== currKey && !g.hasUndirectedEdge(prevKey, currKey)) {
          const d = getDistance(coords[i - 1], coords[i]);
          g.addUndirectedEdge(prevKey, currKey, { weight: d });
        }
      }
    }
  });

  // Count connected components
  const visited = new Set();
  const components = [];
  
  g.forEachNode((node) => {
    if (visited.has(node)) return;
    
    const component = [];
    const queue = [node];
    visited.add(node);
    
    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);
      
      const neighbors = g.neighbors(current);
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    components.push(component);
  });

  console.log(`Reconstructed Graph -> Components: ${components.length}, Order: ${g.order}, Size: ${g.size}, Sizes: [${components.map(c => c.length).sort((a,b) => b-a).join(', ')}]`);
}

analyzeLevel(1);
analyzeLevel(2);
