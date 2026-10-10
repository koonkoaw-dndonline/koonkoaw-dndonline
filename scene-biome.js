// One owner for the server and twin pages. This data table mirrors the available
// background paths in tools/sceneart01-bucket-assets.json; new keys change data,
// not the decision or rendering algorithm.
export const SCENE_ART_REGISTRY = Object.freeze(Object.fromEntries(
  ['cave','plain','wetland','graveyard','dungeon','town','forest','lava','castle','tavern','desert','snow','mountain',
   'sewer','interior','road','camp','manor','ruins','canyon','waterside','village'].map(key => [key, 5]).concat(
   ['city','market','cave_dungeon','tower_dungeon','prison_dungeon','dwarven_hold'].map(key => [key, 6]))
));
export const SCENE_ART_FALLBACK = Object.freeze({});
export const SCENE_ART_KEYS = Object.freeze(Object.keys(SCENE_ART_REGISTRY));
export const SCENE_KEYS = SCENE_ART_KEYS;
export const SCENE_OBJECTS = Object.freeze({
  camp:['banner_pole','bedroll','canvas_tent','hide_rack','palisade_stakes','yurt'],
  canyon:['bridge_post_rope','cactus_scrub','cliff_boulder','cracked_rock','dry_shrub','rock_pillar'],
  interior:['goods_shelf','hanging_tools','notice_board','sack_pile','shop_counter','writing_desk'],
  manor:['candelabra','empty_picture_frame','fallen_chandelier','grandfather_clock','marble_bust_plinth','sheeted_sofa'],
  road:['broken_cart','hay_bales','milestone','rail_fence','roadside_shrine','waymarker_post'],
  ruins:['broken_arch','cracked_altar','fallen_column','ivy_pillar','overgrown_wall','statue_base_empty'],
  sewer:['brick_rubble','iron_ladder','pipe_outlet','sewer_grate','sludge_puddle','valve_wheel'],
  village:['beehive_skep','chicken_coop','farm_cart','scarecrow','water_trough','wood_pile'],
  waterside:['dock_planks','fishing_net_rack','lobster_traps','mooring_post','rope_coil','rowboat'],
  cave_dungeon:['crude_barricade','glowing_crystal_cluster','mushroom_cluster_big','rock_totem','rope_bridge_post','supply_crates_crude'],
  city:['bronze_statue_faceless','city_well_fountain','flower_cart','notice_pillar','stone_bench_planter','street_lamp_ornate'],
  dwarven_hold:['dwarven_pillar_carved','forge_anvil_big','gear_mechanism','mine_cart','ore_pile','rune_brazier'],
  market:['fruit_crates','hanging_lanterns_pole','merchant_scales','pottery_stack','rug_rack','spice_stall'],
  prison_dungeon:['iron_cage','jailer_desk','prison_door_barred','rusted_portcullis_piece','torch_bracket','wall_shackles_empty'],
  tower_dungeon:['alchemy_table','arcane_pedestal','brass_orrery_small','floating_rune_stone','scroll_rack','spiral_stair_segment'],
});
const keySet = new Set(SCENE_KEYS);
const aliases = Object.freeze({inn:'tavern',pub:'tavern',shop:'interior',warehouse:'interior',guild:'interior',
  harbor:'waterside',harbour:'waterside',dock:'waterside',docks:'waterside',dockside:'waterside',crypt:'dungeon',
  tunnel:'sewer',crossroads:'road',square:'town',plaza:'town',encampment:'camp'});
const en = (s,w) => new RegExp(`(?:^|[^a-z])(?:${w})(?=$|[^a-z])`,'i').test(s);
const th = (s,...words) => words.some(w=>s.includes(w));
const match = (s,w,...thai) => en(s,w) || th(s,...thai);
export function sceneArtKey(key){ return keySet.has(key) ? key : 'plain'; }
export function sceneHash(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
export function sceneBgVariant(anchorId, key='plain'){
  const n=SCENE_ART_REGISTRY[key] || 0;
  if(!anchorId || !n) return 0;
  return 1+(sceneHash(String(anchorId)+'|bg')%n);
}
export const SCENE_DUNGEON_FAMILIES = Object.freeze(['cave_dungeon','tower_dungeon','prison_dungeon','dwarven_hold']);
export function sceneRoleVariant(key, role, gridId){
  if(!SCENE_DUNGEON_FAMILIES.includes(key)) return 0;
  if(role==='climax') return (sceneHash(String(gridId||'')+'|boss')&1)?6:4;
  const variants={guardian:1,puzzle:2,trick:3,reward:5};
  return Object.hasOwn(variants,role) ? variants[role] : 0;
}
export function sceneBackdropHref(key, grid, root, failed={}){
  if(!keySet.has(key)) return null;
  const n=SCENE_ART_REGISTRY[key] || 0;
  const frozen=Number(grid?.terrain?.bg_variant);
  const role=sceneRoleVariant(key,grid?.terrain?.dungeon_role,grid?.id);
  const v=Number.isInteger(frozen)&&frozen>=1&&frozen<=n ? frozen : Number.isInteger(role)&&role>=1&&role<=n ? role : sceneBgVariant(grid?.id,key);
  const url=v ? root+key+'/'+key+'_bg_v'+String(v).padStart(2,'0')+'.webp' : '';
  if(url&&!failed[url]) return url;
  const legacy=['cave','plain','wetland','graveyard','dungeon','town','forest','lava','castle','tavern','desert','snow','mountain'].includes(key) ? root+key+'.png' : null;
  return legacy&&!failed[legacy] ? legacy : null;
}
export function sceneBackgroundKey(value){
  const raw=String(value??'').trim().toLowerCase();
  if(!raw) return null;
  if(keySet.has(raw)) return raw;
  if(aliases[raw]) return aliases[raw];
  // DM may send a storage URL, a map path or a filename, never persist it as a key.
  const stem=raw.split(/[?#]/,1)[0].split(/[\\/]/).pop().replace(/\.(png|webp|jpe?g|svg)$/,'');
  if(keySet.has(stem)) return stem;
  if(aliases[stem]) return aliases[stem];
  return namedSite(stem,'');
}
function namedSite(site, desc){
  const s=String(site??'').trim().toLowerCase(), d=String(desc??'').toLowerCase();
  if(!s) return null;
  if(keySet.has(s)) return s;
  // A venue noun is the site kind; surrounding terrain words describe its location.
  if(match(s,'(?:tavern|inn|pub)', 'โรงเตี๊ยม','โรงเหล้า','ผับ')) return 'tavern';
  if(match(s,'(?:camp|encampment)', 'ค่าย','กระโจม')) return 'camp';
  if(match(s,'(?:harbor|harbour|dockside|docks?|quay|pier)', 'ท่าเรือ','ริมน้ำ') && !match(s,'(?:warehouse|storehouse)', 'โกดัง')) return 'waterside';
  if(match(s,'(?:prison|jail|gaol|oubliette|cells?)', 'คุก','เรือนจำ','ห้องขัง','ที่คุมขัง')) return 'prison_dungeon';
  if(match(s,'(?:wizard.?s? tower|mage tower|dark tower|spire|tower dungeon)', 'หอคอยพ่อมด','หอคอยเวท','หอคอยมืด')) return 'tower_dungeon';
  if(match(s,'(?:market hall)', 'หอตลาด','โถงตลาด')) return 'market';
  if(match(s,'(?:warehouse|storehouse|guild|hq|shop|store|room|office|hall|library)', 'โกดัง','กิลด์','ร้าน','ห้อง','โถง')) return 'interior';
  if(match(s,'(?:dwarf|dwarves|dwarven|dwarvish)', 'คนแคระ','ดวาร์ฟ','ดวาฟ') && match(s,'(?:delve|hold|mine|underground)', 'เหมือง','โพรง','ใต้ดิน','ป้อม')) return 'dwarven_hold';
  if(match(s,'(?:market|markets|bazaar|marketplace|fair|souk)', 'ตลาด','ตลาดนัด','บาซาร์')) return 'market';
  if(match(s,'(?:city|capital|metropolis)', 'เมืองหลวง','นคร','มหานคร','ราชธานี')) return 'city';
  if(match(s,'(?:manor|estate)', 'คฤหาสน์')){
    if(match(d,'(?:temple|shrine|dungeon|crypt)', 'วิหาร','ดันเจี้ยน','ใต้ดิน')) return 'dungeon';
    if(match(d,'(?:ruins?|collapsed|rubble)', 'ซากอาคาร','ซากปรัก')) return 'ruins';
    return 'manor';
  }
  if(match(s,'(?:watchtower|ruins?|ruined)', 'หอคอยร้าง','ซากปรัก')) return 'ruins';
  if(match(s,'(?:underground|subterranean)', 'ใต้ดิน') && match(s,'(?:road|way|crossroads|path)', 'ถนน','ทางแยก','เส้นทาง')) return 'cave';
  if(match(s,'(?:road|way|crossroads|path)', 'ถนน','ทางแยก','เส้นทาง')) return 'road';
  if(match(s,'(?:village|hamlet)', 'หมู่บ้าน')) return 'village';
  if(match(s,'(?:dungeon|lair)', 'ดันเจี้ยน','ใต้ดิน') && match(s,'(?:cave|cavern|grotto|hollow)', 'ถ้ำ','โพรง')) return 'cave_dungeon';
  if(match(s,'(?:cave|cavern|grotto|mine|shaft)', 'ถ้ำ','เหมือง')) return 'cave';
  if(match(s,'(?:underground|subterranean)', 'ใต้ดิน') && !match(s,'(?:room|hall|office)', 'ห้อง','โถง')) return 'cave';
  if(match(s,'(?:hollow)', 'โพรง') && match(d,'(?:cave|cavern|grotto)', 'ถ้ำ','โพรงหิน')) return 'cave';
  if(match(s,'(?:square|plaza|gate|district|market|alley|street)', 'จัตุรัส','ลานกลางเมือง','ประตู','ตลาด','ตรอก','ย่าน')){
    if(match(d,'(?:village|hamlet)', 'หมู่บ้าน')) return 'village';
    return 'town';
  }
  if(match(s,'(?:forest|woods?|heartwood|glen|grove|jungle)', 'ผืนป่า','ชายป่า','แนวป่า','ในป่า','ป่าทึบ','ป่าลึก','พงไพร')) return 'forest';
  if(match(s,'(?:ravine|chasm|canyon|ledge|gorge)', 'หุบเขา','รอยแยก','ขอบเหว','ซอกผา')) return 'canyon';
  if(match(s,'(?:sewer|undercity|drain)', 'ท่อระบาย','ท่อใต้เมือง')) return 'sewer';
  if(match(s,'(?:dungeon|crypt|catacomb|chamber|prison|vault)', 'ดันเจี้ยน','สุสาน','ห้องขัง')) return 'dungeon';
  if(match(s,'(?:outskirts)', 'ชานเมือง')) return 'village';
  if(match(s,'(?:underground)', 'ใต้ดิน')) return 'cave';
  if(match(s,'(?:graveyard|cemetery|tomb)', 'สุสาน','หลุมศพ')) return 'graveyard';
  if(match(s,'(?:swamp|marsh|wetland)', 'บึง','หนองน้ำ')) return 'wetland';
  if(match(s,'(?:desert|dunes)', 'ทะเลทราย','เนินทราย')) return 'desert';
  if(match(s,'(?:snow|icefield|glacier)', 'ทุ่งหิมะ','ธารน้ำแข็ง')) return 'snow';
  if(match(s,'(?:mountain|peak|cliff)', 'ภูเขา','หน้าผา')) return 'mountain';
  if(match(s,'(?:castle|fortress|palace)', 'ปราสาท','ป้อมปราการ')) return 'castle';
  return null;
}
function inheritedUndergroundKind(label){
  const s=String(label??'').toLowerCase();
  if(keySet.has(s)) return s;
  if(match(s,'(?:dwarven|dwarf)', 'คนแคระ','ดวาร์ฟ','ดวาฟ') && match(s,'(?:hold|delve|mine)', 'เหมือง','โพรง','ป้อม')) return 'dwarven_hold';
  if(match(s,'(?:wizard.?s? tower|mage tower|dark tower|spire|tower dungeon)', 'หอคอยพ่อมด','หอคอยเวท','หอคอยมืด')) return 'tower_dungeon';
  if(match(s,'(?:prison|jail|gaol|oubliette|cells?)', 'คุก','เรือนจำ','ห้องขัง')) return 'prison_dungeon';
  if(match(s,'(?:sewer|undercity|drain)', 'ท่อระบาย','ท่อใต้เมือง')) return 'sewer';
  if(match(s,'(?:dungeon|lair)', 'ดันเจี้ยน','ใต้ดิน') && match(s,'(?:cave|cavern|grotto)', 'ถ้ำ')) return 'cave_dungeon';
  if(match(s,'(?:dungeon|crypt|catacomb|prison)', 'ดันเจี้ยน','สุสาน','ห้องขัง')) return 'dungeon';
  if(match(s,'(?:cave|cavern|grotto|mine|shaft)', 'ถ้ำ','เหมือง')) return 'cave';
  if(match(s,'(?:graveyard|cemetery|tomb)', 'สุสาน','หลุมศพ')) return 'graveyard';
  return null;
}
function describedSite(desc){
  const s=String(desc??'').toLowerCase();
  if(!s) return null;
  const namedFamily=namedSite(s,'');
  if(SCENE_DUNGEON_FAMILIES.includes(namedFamily)) return namedFamily;
  if(NONFAMILY_VENUES.has(namedFamily)) return namedFamily;
  if(match(s,'(?:market|bazaar|marketplace|souk)', 'ตลาด','ตลาดนัด','บาซาร์')) return 'market';
  if(match(s,'(?:city|capital|metropolis)', 'เมืองหลวง','นคร','มหานคร','ราชธานี')) return 'city';
  if(match(s,'(?:prison|jail|gaol|oubliette)', 'คุก','เรือนจำ','ห้องขัง')) return 'prison_dungeon';
  if(match(s,'(?:tavern|inn|pub)', 'โรงเตี๊ยม','โรงเหล้า')) return 'tavern';
  if(match(s,'(?:shop|store|warehouse|guild|hall)', 'ร้าน','โกดัง','กิลด์','โถง')) return 'interior';
  if(match(s,'(?:crypt|dungeon|temple|prison)', 'วิหารโบราณใต้ดิน','ดันเจี้ยน','คุกใต้ดิน')) return 'dungeon';
  if(match(s,'(?:cave|cavern|grotto)', 'ถ้ำ','โพรงหิน')) return 'cave';
  if(match(s,'(?:ruins?|rubble)', 'ซากอาคาร','ซากปรัก')) return 'ruins';
  if(match(s,'(?:camp|encampment)', 'ค่าย','กระโจม')) return 'camp';
  if(match(s,'(?:harbor|harbour|dock|port)', 'ท่าเรือ','ริมน้ำ')) return 'waterside';
  if(match(s,'(?:forest|woods|grove)', 'ผืนป่า','ชายป่า','แนวป่า','ในป่า','ป่าทึบ')) return 'forest';
  if(match(s,'(?:ravine|chasm|canyon)', 'หุบเขา','รอยแยก','ซอกผา')) return 'canyon';
  if(match(s,'(?:road|path|crossroads)', 'เส้นทาง','ถนน')) return 'road';
  if(match(s,'(?:village|hamlet)', 'หมู่บ้าน')) return 'village';
  if(match(s,'(?:town|city|market|square)', 'เมือง','ตลาด','จัตุรัส')) return 'town';
  return null;
}
function dungeonFamily(site,desc){
  const s=String(site??'')+' '+String(desc??'');
  if(match(s,'(?:dwarf|dwarves|dwarven|dwarvish)', 'คนแคระ','ดวาร์ฟ','ดวาฟ')) return 'dwarven_hold';
  if(match(s,'(?:wizard.?s? tower|mage tower|dark tower|spire|tower dungeon)', 'หอคอยพ่อมด','หอคอยเวท','หอคอยมืด')) return 'tower_dungeon';
  if(match(s,'(?:prison|jail|gaol|oubliette|cells?)', 'คุก','เรือนจำ','ห้องขัง','ที่คุมขัง')) return 'prison_dungeon';
  if(match(s,'(?:cave|cavern|grotto|lair|den|hollow|underground lake)', 'ถ้ำ','โพรง','รังใต้ดิน')) return 'cave_dungeon';
  return null;
}
const NONFAMILY_VENUES=new Set(['tavern','camp','market','waterside','road','city','town','village','manor']);
function dungeonFamilyEvidence(key,label){
  // A venue key is evidence of a non-dungeon place. Its terrain adjective
  // cannot promote a generic ancestor into a dungeon family.
  if(SCENE_DUNGEON_FAMILIES.includes(key)) return key;
  if(NONFAMILY_VENUES.has(key)) return null;
  return dungeonFamily(label,'');
}
function inheritedDungeonFamily(key,label,...lowerFamilies){
  if(key!=='cave' && key!=='dungeon') return key;
  const child=lowerFamilies.find(family=>SCENE_DUNGEON_FAMILIES.includes(family)) || null;
  // A cave can only specialize into a cave dungeon; child prose cannot change its family.
  if(key==='cave') return child==='cave_dungeon' ? child : key;
  // Only the unqualified dungeon sentinel permits child specialization. A named
  // parent such as Moonshadow Crypt is authored evidence even when its art key is generic.
  const raw=String(label??'').trim().toLowerCase();
  return raw==='dungeon' || raw==='ดันเจี้ยน' ? child || key : key;
}
export function classifySceneBiome({site='',settlement='',region='',description='',parent='',anchor='',narration=''}={}){
  const siteKey=namedSite(site,description);
  const descKey=describedSite(description);
  const parentVenue=namedSite(parent,'');
  const parentKey=NONFAMILY_VENUES.has(parentVenue)
    ? parentVenue : inheritedUndergroundKind(parent) || parentVenue;
  const anchorKey=sceneBackgroundKey(anchor) || namedSite(anchor,'') || inheritedUndergroundKind(anchor);
  const parentFamily=dungeonFamilyEvidence(parentKey,parent);
  const siteFamily=dungeonFamilyEvidence(siteKey,site);
  const descFamily=dungeonFamilyEvidence(descKey,description);
  if(anchorKey && ['cave','dungeon','graveyard','sewer',...SCENE_DUNGEON_FAMILIES].includes(anchorKey)){ const family=inheritedDungeonFamily(anchorKey,anchor,parentFamily,siteFamily,descFamily); return {key:family,source:'anchor',reason_code:'s1_anchor'}; }
  if(parentKey && ['cave','dungeon','graveyard','sewer',...SCENE_DUNGEON_FAMILIES].includes(parentKey)){ const family=inheritedDungeonFamily(parentKey,parent,siteFamily,descFamily); return {key:family,source:'parent',reason_code:'s1_parent'}; }
  if(siteKey){ const cityUpgrade=siteKey==='town' && (namedSite(settlement,'')==='city' || descKey==='city'); const family=siteKey==='dungeon' ? inheritedDungeonFamily(siteKey,site,descFamily) : siteKey; return {key:cityUpgrade?'city':family,source:'site',reason_code:cityUpgrade?'s1_site_city':'s1_site'}; }
  if(descKey) return {key:descKey,source:'places',reason_code:'s1_places'};
  const settlementKey=namedSite(settlement,'') || namedSite(region,'');
  if(settlementKey && ['forest','canyon','cave','wetland','desert','mountain','snow'].includes(settlementKey)) return {key:settlementKey,source:'settlement',reason_code:'s1_settlement_nature'};
  const narrKey=describedSite(narration);
  return {key:narrKey || 'plain',source:narrKey?'narration':'default',reason_code:narrKey?'s1_narration':'s1_plain'};
}
// The classic twin pages read this after their module script has loaded.
if(typeof window!=='undefined') window.SceneBiome={sceneArtKey,sceneBackgroundKey,sceneBackdropHref,sceneBgVariant,sceneRoleVariant,classifySceneBiome,SCENE_KEYS,SCENE_OBJECTS};
