import fs from 'fs';

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
const paths = data.features.filter(f => f.properties.type === 'path' && f.properties.level === 2);

console.log(`Found ${paths.length} paths on level 2`);

const pathDistances = [];

paths.forEach((pA, idxA) => {
  const coordsA = pA.geometry.coordinates;
  
  paths.forEach((pB, idxB) => {
    if (idxA >= idxB) return;
    const coordsB = pB.geometry.coordinates;
    
    let minDist = Infinity;
    let closestA, closestB;
    
    for (let i = 0; i < coordsA.length; i++) {
      for (let j = 0; j < coordsB.length; j++) {
        const dist = getDistance(coordsA[i], coordsB[j]);
        if (dist < minDist) {
          minDist = dist;
          closestA = coordsA[i];
          closestB = coordsB[j];
        }
      }
    }
    
    pathDistances.push({
      pathA: pA.properties._feature_id,
      pathB: pB.properties._feature_id,
      dist: minDist,
      closestA,
      closestB
    });
  });
});

pathDistances.sort((a,b) => a.dist - b.dist);
console.log("Closest path pairs on Level 2:");
pathDistances.slice(0, 15).forEach(pair => {
  console.log(`Dist: ${pair.dist.toFixed(3)}m between ${pair.pathA} and ${pair.pathB}`);
  console.log(`  A: [${pair.closestA.join(', ')}]`);
  console.log(`  B: [${pair.closestB.join(', ')}]`);
});
