import fs from 'fs'
import { computeShortestPath } from './src/lib/routing'

const data = JSON.parse(fs.readFileSync('./nsu_indoor_map_merged_clean.geojson', 'utf8'))

const route = computeShortestPath(data.features, 1, [90.4251, 23.8152], 2, [90.4255, 23.8156])
console.log('Result route length:', route.length)
