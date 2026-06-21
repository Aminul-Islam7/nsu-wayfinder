import fs from 'fs';

const data = JSON.parse(fs.readFileSync('nsu_indoor_map_merged_clean.geojson', 'utf8'));
const paths = data.features.filter(f => f.properties.type === 'path' && f.properties.level === 2);

console.log(`Found ${paths.length} paths on level 2:`);
paths.forEach(p => {
  console.log(`- ID: ${p.properties._feature_id}, name: ${p.properties.name || 'unnamed'}, coords count: ${p.geometry.coordinates.length}`);
  console.log(`  coords: ${JSON.stringify(p.geometry.coordinates)}`);
});
