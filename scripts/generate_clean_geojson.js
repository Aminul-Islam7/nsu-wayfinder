#!/usr/bin/env node
/**
 * generate_clean_geojson.js
 * 
 * The original nsu_indoor_map_merged.geojson was wiped by Vite --overwrite.
 * This script regenerates nsu_indoor_map_merged_clean.geojson from embedded data.
 * 
 * Degenerate paths removed:
 *   - path_L1_001: zero-length LineString at [90.426206, 23.815926] (outside footprint)
 *   - path_L2_001: identical artifact on Level 2
 * 
 * Result: 147 features (was 149 in original).
 */
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const features = [
  // ── LEVEL 1 FOOTPRINT ──────────────────────────────────────────
  {
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [[[90.4252291,23.8152162],[90.4252601,23.8149515],[90.4253273,23.8149561],[90.4253406,23.814815],[90.4254305,23.8148223],[90.4254346,23.8147757],[90.4271632,23.8149193],[90.4270933,23.8158427],[90.4266314,23.8158159],[90.4266603,23.8155341],[90.4253782,23.8154272],[90.4253863,23.8153401],[90.4252884,23.8153328],[90.4252964,23.8152469],[90.4252267,23.8152419],[90.4252291,23.8152162]]] },
    "properties": { "type": "footprint", "level": 1, "name": "Building Footprint" }
  },
  // ── LEVEL 1 POIs ───────────────────────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4256607,23.8153621] }, "properties": { "type": "poi", "category": "amenity", "name": "Female Student Lounge", "building": "NAC", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257043,23.8148918] }, "properties": { "type": "poi", "category": "amenity", "name": "Male Student Lounge", "building": "SAC", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4259383,23.8154489] }, "properties": { "type": "poi", "category": "navigation", "name": "NAC Entrance", "building": "NAC", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4260237,23.8148593] }, "properties": { "type": "poi", "category": "navigation", "name": "SAC Entrance", "building": "SAC", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4265182,23.8150089] }, "properties": { "type": "poi", "category": "navigation", "name": "NSU Cafeteria Entrance 1", "building": "SAC", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4265,23.8151364] }, "properties": { "type": "poi", "category": "navigation", "name": "Recreation Hall Entrance 2", "building": "PLAZA", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4264264,23.8154803] }, "properties": { "type": "poi", "category": "amenity", "name": "Club Rooms", "building": "NAC", "level": 1, "accessible_via_path": null } },
  // ── LEVEL 1 TRANSIT ────────────────────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257359,23.8154323] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "nac_lift_2_L1", "name": "Lift 2", "building": "NAC", "level": 1, "connects_to": ["nac_lift_2_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257158,23.8154311] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "nac_lift_1_L1", "name": "Lift 1", "building": "NAC", "level": 1, "connects_to": ["nac_lift_1_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261445,23.8154636] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "nac_lift_3_L1", "name": "Lift 3", "building": "NAC", "level": 1, "connects_to": ["nac_lift_3_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261671,23.8154666] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "nac_lift_4_L1", "name": "Lift 4", "building": "NAC", "level": 1, "connects_to": ["nac_lift_4_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257783,23.8148373] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "sac_lift_5_L1", "name": "Lift 5", "building": "SAC", "level": 1, "connects_to": ["sac_lift_5_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257974,23.8148399] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "sac_lift_6_L1", "name": "Lift 6", "building": "SAC", "level": 1, "connects_to": ["sac_lift_6_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4262242,23.8148784] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "sac_lift_7_L1", "name": "Lift 7", "building": "SAC", "level": 1, "connects_to": ["sac_lift_7_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4262483,23.8148814] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "sac_lift_8_L1", "name": "Lift 8", "building": "SAC", "level": 1, "connects_to": ["sac_lift_8_L2"] } },
  // ── LEVEL 1 POIs (continued) ───────────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4253975,23.815254] }, "properties": { "type": "poi", "category": "amenity", "name": "NSU Book Shop", "building": "ADMIN", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4255597,23.8148824] }, "properties": { "type": "poi", "category": "amenity", "name": "Lost & Found", "building": "ADMIN", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.42676634592334,23.815069066346247] }, "properties": { "type": "poi", "category": "navigation", "name": "Library Building Entrance", "building": "LIB", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.426865,23.8152571] }, "properties": { "type": "poi", "category": "amenity", "name": "NSU Indoor Sports & Fitness Center", "building": "PLAZA", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4268099,23.8155516] }, "properties": { "type": "poi", "category": "amenity", "name": "NSU Model Pharmacy", "building": "PLAZA", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4269558,23.815471] }, "properties": { "type": "poi", "category": "amenity", "name": "Exhibition Center", "building": "PLAZA", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.42592036292852,23.815152472728418] }, "properties": { "type": "poi", "category": "navigation", "name": "NSU Plaza Area", "building": "PLAZA", "level": 1, "accessible_via_path": null } },
  // ── LEVEL 1 TRANSIT (staircases) ──────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257833,23.8154359] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "nac_stair_1_L1", "name": "NAC Staircase 1", "building": "NAC", "level": 1, "connects_to": ["nac_stair_1_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261042,23.8154592] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "nac_stair_2_L1", "name": "NAC Staircase 2", "building": "NAC", "level": 1, "connects_to": ["nac_stair_2_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4258552,23.8148432] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "sac_stair_1_L1", "name": "SAC Staircase 1", "building": "SAC", "level": 1, "connects_to": ["sac_stair_1_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261864,23.8148741] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "sac_stair_2_L1", "name": "SAC Staircase 2", "building": "SAC", "level": 1, "connects_to": ["sac_stair_2_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261206,23.8152366] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "plaza_nac_stair_L1", "name": "Plaza NAC Staircase", "building": "NAC", "level": 1, "connects_to": ["plaza_nac_stair_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261409,23.8151012] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "plaza_sac_stair_L1", "name": "Plaza SAC Staircase", "building": "SAC", "level": 1, "connects_to": ["plaza_sac_stair_L2"] } },
  // ── LEVEL 1 POIs (more nav) ────────────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4264042,23.8149339] }, "properties": { "type": "poi", "category": "navigation", "name": "NSU Cafeteria Entrance 2", "building": "SAC", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4264839,23.8152756] }, "properties": { "type": "poi", "category": "navigation", "name": "Recreation Hall Entrance 1", "building": "PLAZA", "level": 1, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4267052,23.8156475] }, "properties": { "type": "poi", "category": "navigation", "name": "Gate 8 Entrance", "building": "PLAZA", "level": 1, "accessible_via_path": null } },
  // ── LEVEL 1 TRANSIT (library) ─────────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4268108,23.8150594] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "lib_stair_L1", "name": "Library Building Staircase", "building": "LIB", "level": 1, "connects_to": ["lib_stair_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4268392,23.8150085] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "lib_lift_9_L1", "name": "Lift 9", "building": "LIB", "level": 1, "connects_to": ["lib_lift_9_L2"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4268664,23.8150094] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "lib_lift_10_L1", "name": "Lift 10", "building": "LIB", "level": 1, "connects_to": ["lib_lift_10_L2"] } },
  // NOTE: path_L1_001 DELETED (zero-length degenerate at [90.426206, 23.815926])
  // ── LEVEL 1 PATHS ─────────────────────────────────────────────
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4255547,23.8152672],[90.4255881,23.814968],[90.4263455,23.8150306],[90.4263069,23.8153414],[90.4255552,23.8152671]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_002", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42630690962913,23.815341322467987],[90.4267329342094,23.815385137454776]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_003", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4267052,23.8156475],[90.42676634592334,23.815069066346247]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_004", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4263455,23.8150306],[90.42676634592334,23.815069066346247]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_005", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42564037476305,23.815275518897025],[90.42567553904492,23.814975226939808]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_006", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42573234209168,23.815284609189053],[90.42576523520782,23.814982640433072]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_007", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42582196270257,23.815293467525343],[90.425860591562,23.8149905217478]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_008", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42589918497185,23.815301100377024],[90.42593949809253,23.81499704346527]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_009", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42597425892389,23.81530852088339],[90.42601668400306,23.815003422971472]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_010", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42604733952845,23.815315744362064],[90.426087705429,23.81500929297578]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_011", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42618681815325,23.815329530795246],[90.4262267664621,23.815020786533573]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_012", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42556110684126,23.81520980697894],[90.42631478955799,23.8152803735475]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_013", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42557133269034,23.815118202965557],[90.4263256,23.8151911]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_014", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42558093090473,23.815032221356432],[90.42633704893093,23.815098646431803]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_015", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42556110684126,23.81520980697894],[90.42564046177877,23.815275425308535]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_016", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42557139849725,23.815118209325544],[90.42573236621487,23.815284387730866]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_017", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4255809863616,23.815032226228325],[90.42582196270257,23.815293467525343]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_018", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4255881,23.814968],[90.42589918497185,23.815301100377024]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_019", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42567553904492,23.814975226939808],[90.42597425892389,23.81530852088339]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_020", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42576523520782,23.814982640433072],[90.42604739272758,23.815315340482886]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_021", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42586057198206,23.81499067530292],[90.4261214,23.8153233]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_022", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42593949223107,23.814997087674712],[90.42618681815325,23.815329530795246]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_023", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42601668400306,23.815003422971472],[90.42625969558205,23.815336734191497]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_024", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42615053208428,23.815014485672663],[90.42631468130709,23.81528036341207]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_025", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4262267664621,23.815020786533573],[90.42632558815004,23.815191098853838]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_026", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42567557544389,23.814975267551624],[90.4255809863616,23.815032226228325]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_027", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42576523520782,23.814982640433072],[90.42557139849725,23.815118209325544]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_028", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42586057198206,23.81499067530292],[90.42556143145649,23.815210075402177]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_029", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42564022822779,23.815275232186025],[90.42593949223107,23.814997087674712]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_030", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42573236049974,23.815284440197512],[90.42601668400306,23.815003422971472]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_031", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42582196270257,23.815293467525343],[90.42608754521487,23.81501050929552]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_032", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42589918497185,23.815301100377024],[90.42615053208428,23.815014485672663]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_033", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4262267664621,23.815020786533573],[90.42597425892389,23.81530852088339]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_034", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42604739272758,23.815315340482886],[90.42634617126879,23.81503066135561]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_035", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42633704893093,23.815098646431803],[90.4261214,23.8153233]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_036", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42632558815004,23.815191098853838],[90.42618681815325,23.815329530795246]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_037", "level": 1 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42631478955799,23.8152803735475],[90.42625969558205,23.815336734191497]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L1_038", "level": 1 } },
  // ── LEVEL 2 FOOTPRINT (polygon with hole) ─────────────────────
  {
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [
      [[90.4252267,23.8152419],[90.4252291,23.8152162],[90.4252601,23.8149515],[90.4253273,23.8149561],[90.4253406,23.814815],[90.4254305,23.8148223],[90.4254346,23.8147757],[90.4271632,23.8149193],[90.4270933,23.8158427],[90.4266314,23.8158159],[90.4266603,23.8155341],[90.4253782,23.8154272],[90.4253863,23.8153401],[90.4252884,23.8153328],[90.4252964,23.8152469],[90.4252267,23.8152419]],
      [[90.4255485,23.8152505],[90.4261597,23.8152996],[90.4261857,23.8150438],[90.4255745,23.8149903],[90.4255485,23.8152505]]
    ]},
    "properties": { "type": "footprint", "level": 2, "name": "Building Footprint" }
  },
  // ── LEVEL 2 POIs (amenity) ────────────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4266833,23.8150124] }, "properties": { "type": "poi", "category": "amenity", "name": "NSU Open Gallery", "building": "SAC", "level": 2, "accessible_via_path": null } },
  // ── LEVEL 2 TRANSIT (NAC lifts) ───────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257359,23.8154323] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "nac_lift_2_L2", "name": "Lift 2", "building": "NAC", "level": 2, "connects_to": ["nac_lift_2_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257158,23.8154311] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "nac_lift_1_L2", "name": "Lift 1", "building": "NAC", "level": 2, "connects_to": ["nac_lift_1_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261445,23.8154636] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "nac_lift_3_L2", "name": "Lift 3", "building": "NAC", "level": 2, "connects_to": ["nac_lift_3_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261671,23.8154666] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "nac_lift_4_L2", "name": "Lift 4", "building": "NAC", "level": 2, "connects_to": ["nac_lift_4_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257783,23.8148373] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "sac_lift_5_L2", "name": "Lift 5", "building": "SAC", "level": 2, "connects_to": ["sac_lift_5_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257974,23.8148399] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "sac_lift_6_L2", "name": "Lift 6", "building": "SAC", "level": 2, "connects_to": ["sac_lift_6_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4262242,23.8148784] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "sac_lift_7_L2", "name": "Lift 7", "building": "SAC", "level": 2, "connects_to": ["sac_lift_7_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4262483,23.8148814] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "sac_lift_8_L2", "name": "Lift 8", "building": "SAC", "level": 2, "connects_to": ["sac_lift_8_L1"] } },
  // ── LEVEL 2 POIs (LIB) ────────────────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4268871,23.8150412] }, "properties": { "type": "poi", "category": "navigation", "name": "Study Hall Entrance 1", "building": "LIB", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4269407,23.8151374] }, "properties": { "type": "poi", "category": "navigation", "name": "Study Hall Entrance 2", "building": "LIB", "level": 2, "accessible_via_path": null } },
  // ── LEVEL 2 TRANSIT (staircases) ──────────────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257833,23.8154359] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "nac_stair_1_L2", "name": "NAC Staircase 1", "building": "NAC", "level": 2, "connects_to": ["nac_stair_1_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261042,23.8154592] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "nac_stair_2_L2", "name": "NAC Staircase 2", "building": "NAC", "level": 2, "connects_to": ["nac_stair_2_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4258552,23.8148432] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "sac_stair_1_L2", "name": "SAC Staircase 1", "building": "SAC", "level": 2, "connects_to": ["sac_stair_1_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261864,23.8148741] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "sac_stair_2_L2", "name": "SAC Staircase 2", "building": "SAC", "level": 2, "connects_to": ["sac_stair_2_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261206,23.8152366] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "plaza_nac_stair_L2", "name": "Plaza NAC Staircase", "building": "NAC", "level": 2, "connects_to": ["plaza_nac_stair_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4261409,23.8151012] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "plaza_sac_stair_L2", "name": "Plaza SAC Staircase", "building": "SAC", "level": 2, "connects_to": ["plaza_sac_stair_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4268108,23.8150594] }, "properties": { "type": "transit", "transit_type": "staircase", "node_id": "lib_stair_L2", "name": "Library Building Staircase", "building": "LIB", "level": 2, "connects_to": ["lib_stair_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4268392,23.8150085] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "lib_lift_9_L2", "name": "Lift 9", "building": "LIB", "level": 2, "connects_to": ["lib_lift_9_L1"] } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4268664,23.8150094] }, "properties": { "type": "transit", "transit_type": "lift", "node_id": "lib_lift_10_L2", "name": "Lift 10", "building": "LIB", "level": 2, "connects_to": ["lib_lift_10_L1"] } },
  // ── LEVEL 2 NAC CLASSROOMS (NAC201–NAC220) ────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4262191,23.8154203] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC201", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4262258,23.8153811] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC202", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4263156,23.8153884] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC203", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4263096,23.8154289] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC204", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4264074,23.8153983] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC205", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4264003,23.8154375] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC206", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4265122,23.8154048] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC207", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4265041,23.8154479] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC208", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4260519,23.8153712] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC209", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.426047,23.8154012] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC210", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4259777,23.8153627] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC211", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4259705,23.8153993] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC212", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4258986,23.8153538] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC213", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4258916,23.8153903] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC214", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4258198,23.8153446] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC215", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4258131,23.8153808] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC216", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257457,23.8153351] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC217", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257384,23.8153727] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC218", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4265951,23.8154104] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC219", "building": "NAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.426588,23.8154517] }, "properties": { "type": "poi", "category": "classroom", "name": "NAC220", "building": "NAC", "level": 2, "accessible_via_path": null } },
  // ── LEVEL 2 SAC CLASSROOMS (SAC201–SAC220) ────────────────────
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4262301,23.8149627] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC201", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4262239,23.8149253] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC202", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4263114,23.8149396] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC203", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4263052,23.8149714] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC204", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4264039,23.8149462] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC205", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4263972,23.8149813] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC206", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4264973,23.8149568] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC207", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4264909,23.8149886] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC208", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4260871,23.8149169] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC209", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4260814,23.8149474] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC210", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4260022,23.8149117] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC211", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4259976,23.8149379] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC212", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4259137,23.8149012] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC213", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4259046,23.8149295] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC214", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257359,23.8149116] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC215", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4257427,23.8148841] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC216", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4256682,23.8149078] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC217", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4256734,23.8148795] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC218", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4255927,23.8149026] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC219", "building": "SAC", "level": 2, "accessible_via_path": null } },
  { "type": "Feature", "geometry": { "type": "Point", "coordinates": [90.4255983,23.8148748] }, "properties": { "type": "poi", "category": "classroom", "name": "SAC220", "building": "SAC", "level": 2, "accessible_via_path": null } },
  // NOTE: path_L2_001 DELETED (zero-length degenerate at [90.426206, 23.815926])
  // ── LEVEL 2 PATHS ─────────────────────────────────────────────
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4255457,23.8152677],[90.4270933,23.8153906]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_002", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.425573,23.8149704],[90.4267817,23.8150845]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_003", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42617699023432,23.81539593487594],[90.42622906566496,23.81494417804398]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_004", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4262456266779,23.81532328347681],[90.42627805421567,23.815036956371316]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_005", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42631205681069,23.815328558911887],[90.42634445403414,23.815043224443862]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_006", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42638314732413,23.815334204443097],[90.42641752557422,23.815050122319864]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_007", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42645749285472,23.815340108465914],[90.42649439122505,23.815057378355903]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_008", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42653161015834,23.815345994364474],[90.4265659882171,23.81506413703613]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_009", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42660013892377,23.81535143645886],[90.426636287884,23.81507077325024]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_010", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42667184230399,23.815357130659837],[90.42670832978148,23.81507757392907]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_011", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4267817,23.8150845],[90.42674531916475,23.815362965698725]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_012", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.42617356539175,23.81516318587658],[90.42676397178568,23.81522019505915]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_013", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.4255325,23.8153395],[90.4265112,23.8154252]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_014", "level": 2 } },
  { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [[90.425585,23.8148854],[90.4265668,23.814975]] }, "properties": { "type": "path", "path_type": "corridor", "path_id": "path_L2_015", "level": 2 } },
];

const fc = { type: "FeatureCollection", features };

console.log(`Writing ${features.length} features...`);
const dest = join(__dirname, "..", "nsu_indoor_map_merged_clean.geojson");
writeFileSync(dest, JSON.stringify(fc, null, 2), "utf-8");
console.log(`Written: ${dest}`);
