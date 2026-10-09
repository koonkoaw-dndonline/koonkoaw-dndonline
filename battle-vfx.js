/* VFX-02: decorative battle-grid cues from VFX-01 committed, group-scoped receipts.
   Flag defaults OFF. No game-state write, no prose parsing, no target-by-name fallback. */
(function(root){
  'use strict';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DAMAGE=new Set(['acid','bludgeoning','cold','fire','force','lightning',
    'necrotic','piercing','poison','psychic','radiant','slashing','thunder']);
  const COLORS={acid:'#a8e74f',bludgeoning:'#f0be7c',cold:'#a8ebff',
    fire:'#ff9143',force:'#a7a4ff',lightning:'#f9e875',necrotic:'#b694db',
    piercing:'#e9d4ac',poison:'#9edb72',psychic:'#dc9aff',radiant:'#fff5b2',
    slashing:'#ffd1bd',thunder:'#aaa8ff',heal:'#20e390',temporary_hp:'#40a8ff',
    miss:'#d3d6e0',blocked:'#b4c6d1'};
  const ASSET_VERSION='20260927vfxlive01';
  const PACK_URL='./battle-vfx/2026-09-27/manifest.json';
  const PACK_PREFIX='./battle-vfx/2026-09-27/';
  const PACK_SHA256='603c6dea8fd13abcb35e1a211f76cd63386a9fb8c9f8d8a8ed0a39a83bfcf8fc';
  const PACK_KEYS=new Set(['acid','beam','bludgeoning','cold','dash','fire','fist',
    'force','heal','lightning','necrotic','piercing','poison','projectile',
    'psychic','radiant','slashing','temporary_hp','thunder','wave','zone_fire',
    'zone_fog','zone_smoke','zone_thorns','zone_vines','zone_web']);
  const STATUS={blinded:['BL','ตาบอด','Blinded'],charmed:['CH','ถูกเสน่ห์','Charmed'],
    deafened:['DE','หูหนวก','Deafened'],exhaustion:['EX','อ่อนล้า','Exhaustion'],
    frightened:['FR','หวาดกลัว','Frightened'],grappled:['GR','ถูกจับยึด','Grappled'],
    incapacitated:['IN','ไร้ความสามารถ','Incapacitated'],
    paralyzed:['PA','เป็นอัมพาต','Paralyzed'],petrified:['PE','กลายเป็นหิน','Petrified'],
    poisoned:['PO','ติดพิษ','Poisoned'],prone:['PR','ล้มคว่ำ','Prone'],
    restrained:['RE','ถูกตรึง','Restrained'],stunned:['ST','มึนงง','Stunned'],
    unconscious:['UN','หมดสติ','Unconscious']};
  const ZONES={fire:['F','ไฟ','Fire'],acid:['A','กรด','Acid'],
    oil:['O','น้ำมัน','Oil'],ice:['I','พื้นน้ำแข็ง','Icy terrain'],trap:['T','กับดักที่เปิดเผย','Revealed trap']};
  const manifest=Object.create(null);
  const statusIcons=Object.create(null);
  let manifestFlight=null,manifestReady=false;
  let scope='',cursor=null,boardSvg=null,boardWatched=null,observer=null;
  let layerNode=null,hostNode=null,listeners=false,listenerDocument=null;
  let inFlight=false,active=0,epoch=0,flightSerial=0,staticFlightSerial=0;
  let gateCampaign='',gateEnabled=false,gateFlight=0;
  const counts={returned:0,played:0,skipped:Object.create(null)};
  const seen=new Set();
  const staticNodes=[];
  const timers=new Set();
  const motions=new Set();
  function userEnabled(campaignId){
    try{return root.localStorage?.getItem('ttrpg_vfx_off_'+campaignId)!=='1';}
    catch(_error){return true;}
  }
  function enabled(campaignId){return gateEnabled&&gateCampaign===campaignId&&userEnabled(campaignId);}
  function skip(reason){counts.skipped[reason]=(counts.skipped[reason]||0)+1;}
  async function refreshGate(supa,campaignId,packDir=PACK_PREFIX.slice(2)){
    if(gateCampaign!==campaignId){reset();gateCampaign=campaignId;gateEnabled=false;
      counts.returned=0;counts.played=0;counts.skipped=Object.create(null);}
    const flight=++gateFlight;
    let on=false;
    try{
      if(supa&&UUID.test(String(campaignId||''))){
        const result=await supa.rpc('combat_effect_enabled_v1',{p_campaign:campaignId});
        on=!result.error&&result.data===true;
      }
    }catch(_error){}
    if(flight!==gateFlight||gateCampaign!==campaignId) return false;
    const artReady=on&&'./'+packDir===PACK_PREFIX?await loadManifest():false;
    if(flight!==gateFlight||gateCampaign!==campaignId)return false;
    gateEnabled=on&&artReady;
    if(!enabled(campaignId)) reset();
    return enabled(campaignId);
  }
  function setUserEnabled(campaignId,on){
    try{root.localStorage?.setItem('ttrpg_vfx_off_'+campaignId,on?'0':'1');}catch(_error){}
    if(!on) reset();
    return enabled(campaignId);
  }
  function mountUserControl(hud,campaignId,showText,hideText,onChange,host,statsText){
    if(!hud||!root.document) return;
    let button=hud.querySelector('#bsVfxCtl');
    if(!gateEnabled||gateCampaign!==campaignId){if(button)button.remove();return;}
    if(!button){button=root.document.createElement('button');button.id='bsVfxCtl';
      button.type='button';button.className='btn ghost sm';hud.appendChild(button);}
    const off=!userEnabled(campaignId);
    button.textContent=off?showText:hideText;
    button.title=host?statsText+' '+counts.played+'/'+counts.returned+' '+JSON.stringify(counts.skipped):'';
    button.onclick=()=>{setUserEnabled(campaignId,off);if(onChange)onChange();};
  }
  function clearVisuals(){
    for(const timer of timers) clearTimeout(timer);
    timers.clear(); active=0;
    for(const motion of motions) motion.cancel();
    motions.clear();
    if(layerNode) layerNode.replaceChildren();
    staticNodes.length=0;
  }
  function reset(){
    epoch++;flightSerial++;staticFlightSerial++;
    scope=''; cursor=null; boardSvg=null; inFlight=false; seen.clear(); clearVisuals();
    if(observer){observer.disconnect();observer=null;}
    if(boardWatched&&boardWatched.removeEventListener)
      boardWatched.removeEventListener('scroll',clearVisuals);
    boardWatched=null;
    if(layerNode&&layerNode.remove) layerNode.remove();
    if(hostNode&&hostNode.classList) hostNode.classList.remove('bs-vfx-host');
    layerNode=null;hostNode=null;
    if(listeners){
      if(root.removeEventListener){root.removeEventListener('online',onResume);root.removeEventListener('resize',clearVisuals);}
      if(listenerDocument&&listenerDocument.removeEventListener)
        listenerDocument.removeEventListener('visibilitychange',onVisibilityChange);
      listeners=false;listenerDocument=null;
    }
  }
  function onResume(){ if(!enabled(gateCampaign)){reset();return;} epoch++;flightSerial++;staticFlightSerial++;inFlight=false;cursor=null;clearVisuals(); }
  function onVisibilityChange(){
    if(root.document&&root.document.visibilityState==='visible') onResume();
  }
  function ensureListeners(){
    if(listeners) return;
    if(root.addEventListener){root.addEventListener('online',onResume);root.addEventListener('resize',clearVisuals);}
    listenerDocument=root.document;
    if(listenerDocument&&listenerDocument.addEventListener)
      listenerDocument.addEventListener('visibilitychange',onVisibilityChange);
    listeners=true;
  }
  function ensureLayer(board){
    const host=board&&board.parentElement;
    if(!host||!host.classList||!host.appendChild||!root.document||!root.document.createElement) return null;
    if(layerNode&&hostNode===host&&layerNode.isConnected) return layerNode;
    if(layerNode&&layerNode.remove) layerNode.remove();
    if(hostNode&&hostNode.classList) hostNode.classList.remove('bs-vfx-host');
    const layer=root.document.createElement('div');
    layer.id='bsVfxLayer';layer.className='bs-vfx-layer';layer.setAttribute('aria-hidden','true');
    host.classList.add('bs-vfx-host');host.appendChild(layer);
    layerNode=layer;hostNode=host;
    return layer;
  }
  const whole=(n)=>Number.isSafeInteger(Number(n))&&Number(n)>=0;
  function normalize(row,expected){
    if(!row||row.visibility_scope!=='party'||!UUID.test(String(row.campaign_id||''))||
      !UUID.test(String(row.encounter_id||''))||!UUID.test(String(row.grid_id||''))||
      !UUID.test(String(row.actor_token_id||''))||!UUID.test(String(row.target_token_id||''))||
      !UUID.test(String(row.actor_ref_id||''))||!UUID.test(String(row.target_ref_id||''))||
      row.campaign_id!==expected.campaign_id||row.encounter_id!==expected.encounter_id||
      Number(row.group_no)!==expected.group_no||!whole(row.cursor_id)||
      !whole(row.log_seq)||!whole(row.combat_round)||!whole(row.amount_applied)||
      !whole(row.actor_col)||!whole(row.actor_row)||!whole(row.actor_size)||
      !whole(row.target_col)||!whole(row.target_row)||!whole(row.target_size)||
      !['character','combat_state'].includes(row.actor_ref_kind)||
      !['character','combat_state'].includes(row.target_ref_kind)||
      !['damage','heal','temporary_hp','miss'].includes(row.kind)||
      Number(row.actor_col)>19||Number(row.actor_row)>19||
      Number(row.target_col)>19||Number(row.target_row)>19||
      Number(row.actor_size)<1||Number(row.actor_size)>20||
      Number(row.target_size)<1||Number(row.target_size)>20||
      typeof row.event_key!=='string'||!row.event_key||row.event_key.length>240) return null;
    const parts=Array.isArray(row.damage_parts)?row.damage_parts:[];
    if(parts.length>4||parts.some(p=>!p||!DAMAGE.has(p.type)||!whole(p.applied))) return null;
    if(row.kind==='damage' && !parts.length) {
      if(row.mitigation!=='immune'&&row.save_outcome!=='success_zero') return null;
    }
    if(row.kind!=='damage'&&parts.length) return null;
    if(row.delivery_key!=null&&(!['projectile','beam'].includes(row.delivery_key)||
      !['damage','miss'].includes(row.kind)||
      (row.delivery_key==='beam'&&(row.kind!=='damage'||parts.some(p=>p.type!=='fire')))||
      (row.kind==='damage'&&parts.some(p=>p.type!=='fire'&&p.type!=='force')))) return null;
    let keys=[],strength=1,blocked=false;
    if(row.kind==='damage'){
      blocked=row.mitigation==='immune'||row.save_outcome==='success_zero'||Number(row.amount_applied)===0;
      if(blocked){keys=['blocked'];strength=0.5;}
      else keys=[...parts].sort((a,b)=>Number(b.applied)-Number(a.applied))
        .slice(0,2).map(p=>p.type);
      if(!blocked){
        if(row.mitigation==='resistant'||row.save_outcome==='success_half') strength*=0.72;
        if(row.mitigation==='vulnerable'||row.attack==='critical') strength*=1.22;
      }
    } else {keys=[row.kind];if(row.kind==='miss') strength=0.45;}
    if(!keys.length) return null;
    if(row.delivery_key==='projectile'||row.delivery_key==='beam') keys=[row.delivery_key,...keys];
    return {key:row.event_key+'|'+row.target_token_id+'|'+row.kind,
      cursor:Number(row.cursor_id),target:row.target_token_id,actor:row.actor_token_id,
      grid:row.grid_id,targetRefKind:row.target_ref_kind,targetRef:row.target_ref_id,
      actorRefKind:row.actor_ref_kind,actorRef:row.actor_ref_id,
      targetCol:Number(row.target_col),targetRow:Number(row.target_row),
      targetSize:Number(row.target_size),actorCol:Number(row.actor_col),
      actorRow:Number(row.actor_row),actorSize:Number(row.actor_size),
      kind:row.kind,keys,strength,createdAt:Date.parse(row.created_at||''),
      canNudge:(row.kind==='damage'||row.kind==='miss')&&row.attack!=='none'&&
        row.actor_ref_kind==='character'&&row.target_ref_kind==='combat_state'&&
        row.actor_token_id!==row.target_token_id};
  }
  function exactToken(board,cue,which){
    const isTarget=which==='target', id=isTarget?cue.target:cue.actor;
    const refKind=isTarget?cue.targetRefKind:cue.actorRefKind;
    const refId=isTarget?cue.targetRef:cue.actorRef;
    const col=isTarget?cue.targetCol:cue.actorCol;
    const row=isTarget?cue.targetRow:cue.actorRow;
    const size=isTarget?cue.targetSize:cue.actorSize;
    const nodes=board.querySelectorAll('[data-token-id]');
    let found=null;
    for(const node of nodes){
      if(node.dataset.tokenId!==id) continue;
      if(found||node.dataset.gridId!==cue.grid||node.dataset.refKind!==refKind||
        node.dataset.refId!==refId||Number(node.dataset.col)!==col||
        Number(node.dataset.row)!==row||Number(node.dataset.size)!==size||
        node.dataset.vfxVisible!=='true') return null;
      found=node;
    }
    return found;
  }
  function point(node,layer,preferAnchor){
    const status=preferAnchor==='status';
    const sprite=(!preferAnchor||status)&&node&&node.querySelector('image');
    const anchor=sprite||node&&node.querySelector('[data-vfx-anchor]');
    if(!anchor||!anchor.getScreenCTM) return null;
    const m=anchor.getScreenCTM();
    if(!m||!root.DOMPoint) return null;
    const x=sprite?Number(sprite.getAttribute('x'))+Number(sprite.getAttribute('width'))/2:
      Number(anchor.getAttribute('cx'));
    const y=sprite?Number(sprite.getAttribute('y'))+Number(sprite.getAttribute('height'))/2:
      Number(anchor.getAttribute('cy'));
    if(!Number.isFinite(x)||!Number.isFinite(y)) return null;
    const p=new root.DOMPoint(x,y)
      .matrixTransform(m);
    const rect=layer.getBoundingClientRect();
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)) return null;
    // Status follows the transformed sprite's top edge, including prone rotation
    // and responsive board scaling. Damage/delivery still use its centre.
    if(status&&sprite){
      const sx=Number(sprite.getAttribute('x')),sy=Number(sprite.getAttribute('y'));
      const w=Number(sprite.getAttribute('width')),h=Number(sprite.getAttribute('height'));
      if(![sx,sy,w,h].every(Number.isFinite)||w<=0||h<=0) return null;
      const corners=[[sx,sy],[sx+w,sy],[sx,sy+h],[sx+w,sy+h]]
        .map(([cx,cy])=>new root.DOMPoint(cx,cy).matrixTransform(m));
      if(corners.some(c=>!Number.isFinite(c.x)||!Number.isFinite(c.y))) return null;
      return {x:(Math.min(...corners.map(c=>c.x))+Math.max(...corners.map(c=>c.x)))/2-rect.left,
        y:Math.min(...corners.map(c=>c.y))-rect.top};
    }
    if(status) return {x:p.x-rect.left,y:p.y-rect.top-12}; // vector pawn head / HP bar
    return {x:p.x-rect.left,y:p.y-rect.top};
  }
  function cueSize(node,cue){
    const image=node.querySelector('image');
    const width=image&&image.getBoundingClientRect().width;
    const measured=Number.isFinite(width)&&width>0?width:36*cue.targetSize;
    return Math.max(12,Math.min(142,Math.max(30,measured*0.72)*cue.strength));
  }
  function localFrame(url){
    return typeof url==='string'&&/^\.\/battle-vfx\/[a-z0-9_./-]+\.png$/i.test(url)&&
      !url.includes('..')?url+'?v='+ASSET_VERSION:null;
  }
  function packAsset(item){
    return item&&typeof item.url==='string'&&item.url.startsWith(PACK_PREFIX)&&
      /^[A-F0-9]{64}$/i.test(String(item.sha256||''))&&localFrame(item.url)
      ?item.url:null;
  }
  function setManifest(next){
    if(!next||next.schema!=='battle-vfx-pack/v1'||next.version!=='2026-09-27'||
      !next.effects||!next.status_icons||
      Object.keys(next.effects).length!==PACK_KEYS.size||
      Object.keys(next.status_icons).length!==15)return false;
    const effects=Object.create(null),icons=Object.create(null);
    for(const [key,value] of Object.entries(next.effects)){
      if(!PACK_KEYS.has(key)||!value||!['impact','delivery','zone'].includes(value.kind)||
        !packAsset(value.still)||!Array.isArray(value.frames)||value.frames.length>40||
        value.frames.some(item=>!packAsset(item)))return false;
      effects[key]={kind:value.kind,still:value.still.url,
        frames:value.frames.map(item=>item.url)};
    }
    for(const [key,value] of Object.entries(next.status_icons)){
      if(!Object.hasOwn(STATUS,key)&&key!=='invisible')return false;
      const url=packAsset(value);if(!url)return false;icons[key]=url;
    }
    for(const key of Object.keys(manifest))delete manifest[key];
    for(const key of Object.keys(statusIcons))delete statusIcons[key];
    Object.assign(manifest,effects);Object.assign(statusIcons,icons);
    manifestReady=true;
    return true;
  }
  async function loadManifest(){
    if(manifestReady)return true;
    if(manifestFlight)return manifestFlight;
    manifestFlight=(async()=>{
      try{
        const response=await root.fetch(PACK_URL,{cache:'force-cache'});
        if(!response.ok||!root.crypto?.subtle)return false;
        const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))]
          .map(byte=>byte.toString(16).padStart(2,'0')).join('');
        return hash===PACK_SHA256&&setManifest(JSON.parse(new TextDecoder().decode(bytes)));
      }catch(_error){return false;}
      finally{manifestFlight=null;}
    })();
    return manifestFlight;
  }
  function watchBoard(board){
    if(board===boardWatched) return;
    if(observer){observer.disconnect();observer=null;}
    if(boardWatched&&boardWatched.removeEventListener)
      boardWatched.removeEventListener('scroll',clearVisuals);
    boardWatched=board;
    if(board.addEventListener) board.addEventListener('scroll',clearVisuals,{passive:true});
    if(root.MutationObserver){
      observer=new root.MutationObserver(function(){
        if(board.querySelector('svg')!==boardSvg){clearVisuals();boardSvg=board.querySelector('svg');}
      });
      observer.observe(board,{childList:true});
    }
  }
  function play(cue,board,layer){
    if(active>=8||!layer||!board||!board.isConnected){skip('cap_or_board');return false;}
    const target=exactToken(board,cue,'target');
    const actor=exactToken(board,cue,'actor');
    if(!target||!actor){skip('exact_token');return false;}
    const center=point(target,layer);
    if(!center){skip('position');return false;}
    const effect=manifest[cue.keys[0]]||
      (['miss','blocked'].includes(cue.keys[0])?{kind:'impact',frames:[]}:null);
    if(!effect){skip('art_missing');return false;}
    const origin=effect.kind==='delivery'?point(actor,layer):null;
    if(effect.kind==='delivery'&&!origin){skip('delivery_position');return false;}
    const reduced=!!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const size=cueSize(target,cue);
    const node=root.document.createElement('div');
    node.className='bs-vfx-cue'+(reduced?' bs-vfx-still':'');
    node.style.left=center.x+'px';node.style.top=center.y+'px';
    node.style.width=size+'px';node.style.height=size+'px';
    node.style.setProperty('--vfx-color',COLORS[cue.keys[0]]||'#fff');
    node.style.setProperty('--vfx-line',Math.max(1,3*cue.strength)+'px');
    node.style.setProperty('--vfx-opacity',String(Math.min(0.92,0.45+0.45*cue.strength)));
    node.setAttribute('data-vfx-kind',cue.keys[0]);
    node.setAttribute('data-vfx-playback-kind',effect.kind);
    const frames=effect?(effect.frames.length?effect.frames:[effect.still]):null;
    const duration=effect?.kind==='delivery'?720:effect?.kind==='zone'?960:460;
    if(Array.isArray(frames)&&frames.length){
      const src=localFrame(frames[0]);
      if(src){
        const img=root.document.createElement('img');
        img.alt='';img.draggable=false;img.src=src;node.appendChild(img);
        if(!reduced&&frames.length>1){
          const frameSteps=effect.kind==='zone'?2*(frames.length-1):
            effect.kind==='delivery'?2*frames.length:frames.length-1;
          const interval=Math.max(1,Math.floor(duration/frameSteps));
          let frame=0,direction=1;
          const step=()=>{
            timers.delete(timer);
            if(!node.isConnected)return;
            if(frame>=frames.length-1&&effect.kind==='impact')return;
            if(effect.kind==='zone'&&(frame>=frames.length-1||frame<=0))
              direction=frame>=frames.length-1?-1:1;
            frame=effect.kind==='zone'?frame+direction:
              frame>=frames.length-1?0:frame+1;
            const next=localFrame(frames[frame]);if(next)img.src=next;
            timer=setTimeout(step,interval);timers.add(timer);
          };
          let timer=setTimeout(step,interval);timers.add(timer);
        }
      }
    }
    layer.appendChild(node);active++;
    if(effect.kind==='delivery'&&cue.keys.length>1){
      const nextKeys=cue.keys.slice(1);
      const delay=reduced?0:duration-120;
      const follow=setTimeout(()=>{timers.delete(follow);
        play({...cue,keys:nextKeys,canNudge:false},board,layer);
      },delay);
      timers.add(follow);
    }
    if(effect.kind==='delivery'&&!reduced&&node.animate){
      const travel=node.animate([{left:origin.x+'px',top:origin.y+'px'},
        {left:center.x+'px',top:center.y+'px'}],{duration:duration,iterations:1});
      motions.add(travel);travel.onfinish=function(){motions.delete(travel);};
    }
    if(cue.canNudge&&!reduced){
      const from=point(actor,layer);
      if(actor&&from&&actor.animate){
        const dx=Math.max(-8,Math.min(8,(center.x-from.x)*0.16));
        const dy=Math.max(-8,Math.min(8,(center.y-from.y)*0.16));
        const motion=actor.animate([{transform:'translate(0px,0px)'},
          {transform:`translate(${dx}px,${dy}px)`,offset:0.45},
          {transform:'translate(0px,0px)'}],{duration:260,iterations:1});
        motions.add(motion);motion.onfinish=function(){motions.delete(motion);};
      }
    }
    const timer=setTimeout(()=>{node.remove();active=Math.max(0,active-1);timers.delete(timer);},
      reduced?180:duration);
    timers.add(timer);
    return true;
  }
  function normalizeStatic(row,expected){
    if(!row||row.visibility_scope!=='party'||
      row.campaign_id!==expected.campaign_id||row.encounter_id!==expected.encounter_id||
      Number(row.group_no)!==expected.group_no||!UUID.test(String(row.grid_id||''))||
      !UUID.test(String(row.token_id||''))||!UUID.test(String(row.ref_id||''))||
      row.col===null||row.row===null||row.size===null||
      !whole(row.col)||!whole(row.row)||!whole(row.size)||
      Number(row.col)>19||Number(row.row)>19||
      Number(row.size)<1||Number(row.size)>20) return null;
    const kind=row.kind,slug=row.slug;
    if(kind==='status'&&(!Object.hasOwn(STATUS,slug)||
      !['character','combat_state'].includes(row.ref_kind)||row.expires_round!==null)) return null;
    if(kind==='hazard'&&(!['fire','acid','oil','ice'].includes(slug)||
      row.ref_kind!=='object'||row.ref_id!==row.token_id||
      row.expires_round===null||!whole(row.expires_round))) return null;
    if(kind==='trap'&&(slug!=='trap'||row.ref_kind!=='object'||
      row.ref_id!==row.token_id||row.expires_round!==null)) return null;
    if(!['status','hazard','trap'].includes(kind)) return null;
    return {key:row.token_id+'|'+kind+'|'+slug,kind,slug,
      target:row.token_id,grid:row.grid_id,targetRefKind:row.ref_kind,
      targetRef:row.ref_id,targetCol:Number(row.col),targetRow:Number(row.row),
      targetSize:Number(row.size)};
  }
  function renderStatic(rows,expected,board,layer){
    for(const node of staticNodes)node.remove();
    staticNodes.length=0;
    if(!Array.isArray(rows)||rows.length>256||!board.isConnected)return;
    const cues=[],keys=new Set();
    for(const row of rows){
      const cue=normalizeStatic(row,expected);
      if(!cue||keys.has(cue.key))continue;
      keys.add(cue.key);cues.push(cue);
    }
    const counts=new Map();
    for(const cue of cues){
      const token=exactToken(board,cue,'target');if(!token)continue;
      const center=point(token,layer,cue.kind==='status'?'status':true);if(!center)continue;
      const countKey=cue.kind+':'+cue.target,offset=counts.get(countKey)||0;
      counts.set(countKey,offset+1);
      const label=cue.kind==='status'?STATUS[cue.slug]:ZONES[cue.slug];
      const node=root.document.createElement('div');
      node.className='bs-vfx-static bs-vfx-'+cue.kind;
      const statusCount=cue.kind==='status'?cues.filter(c=>c.target===cue.target&&c.kind==='status').length:0;
      const rowCount=Math.min(4,statusCount-Math.floor(offset/4)*4);
      node.style.left=(center.x+(cue.kind==='status'?((offset%4)-(rowCount-1)/2)*19:0))+'px';
      node.style.top=(center.y+(cue.kind==='status'?-18-Math.floor(offset/4)*19:0))+'px';
      node.title=typeof root.uiCopy==='function'?root.uiCopy(label[1],label[2]):
        root.document?.documentElement?.lang==='en'?label[2]:label[1];
      node.setAttribute('data-vfx-static',cue.kind+':'+cue.slug);
      const art=cue.kind==='status'?statusIcons[cue.slug]:
        cue.kind==='hazard'&&cue.slug==='fire'?manifest.zone_fire?.still:null;
      if(art){const img=root.document.createElement('img');img.alt='';
        img.draggable=false;img.src=localFrame(art);node.appendChild(img);}
      else node.textContent=label[0];
      layer.appendChild(node);staticNodes.push(node);
    }
  }
  async function syncStaticSnapshot(supa,campaignId,groupNo,encounterId,board){
    if(!enabled(campaignId)||!supa||!board||
      !UUID.test(String(campaignId||''))||!UUID.test(String(encounterId||''))||
      ![1,2].includes(Number(groupNo)))return;
    const svg=board.querySelector('svg'),layer=ensureLayer(board);
    if(!svg||!layer)return;
    const expectedScope=[campaignId,groupNo,encounterId].join(':');
    if(scope!==expectedScope)return;
    const thisEpoch=epoch,thisFlight=++staticFlightSerial;
    let rows=null;
    try{
      const response=await supa.rpc('combat_status_zone_snapshot_v1',
        {p_campaign:campaignId,p_group:groupNo,p_encounter:encounterId});
      if(response&&!response.error)rows=response.data;
    }catch(_error){}
    if(thisEpoch!==epoch||thisFlight!==staticFlightSerial||
      scope!==expectedScope||board.querySelector('svg')!==svg||!enabled(campaignId))return;
    renderStatic(rows,{campaign_id:campaignId,group_no:Number(groupNo),
      encounter_id:encounterId},board,layer);
  }
  async function sync(supa,campaignId,groupNo,encounterId,board){
    if(!enabled(campaignId)){if(scope||layerNode||listeners) reset();return;}
    if(!supa||!board||!UUID.test(String(campaignId||''))||
      !UUID.test(String(encounterId||''))||![1,2].includes(Number(groupNo))){
      if(scope||layerNode||listeners) reset();
      return;
    }
    const svg=board.querySelector('svg');
    if(!svg){if(scope||layerNode||listeners) reset();return;}
    const layer=ensureLayer(board);
    if(!layer) return;
    ensureListeners();
    watchBoard(board);
    if(svg!==boardSvg){ clearVisuals();boardSvg=svg; }
    const nextScope=[campaignId,groupNo,encounterId].join(':');
    if(scope!==nextScope){epoch++;flightSerial++;inFlight=false;clearVisuals();seen.clear();scope=nextScope;cursor=null;}
    if(inFlight) return;
    const thisEpoch=epoch;
    const thisFlight=++flightSerial;
    inFlight=true;
    try{
      if(cursor===null){
        const tail=await supa.rpc('combat_effect_tail_v1',
          {p_campaign:campaignId,p_group:groupNo,p_encounter:encounterId});
        if(thisEpoch!==epoch||scope!==nextScope) return;
        if(!tail.error&&tail.data!==null&&whole(tail.data)) cursor=Number(tail.data);
        return; // first load/reconnect starts at current tail, never replays history
      }
      const response=await supa.rpc('combat_effect_after_v1',
        {p_campaign:campaignId,p_group:groupNo,p_encounter:encounterId,p_after:cursor,p_limit:30});
      if(thisEpoch!==epoch||scope!==nextScope||board.querySelector('svg')!==svg) return;
      if(response.error||!Array.isArray(response.data)) return;
      const expected={campaign_id:campaignId,group_no:Number(groupNo),encounter_id:encounterId};
      for(const row of response.data){
        if(!whole(row.cursor_id)||Number(row.cursor_id)<=cursor) continue;
        cursor=Number(row.cursor_id);
        counts.returned++;
        const cue=normalize(row,expected);
        if(!cue){skip('invalid');continue;}
        if(seen.has(cue.key)){skip('duplicate');continue;}
        seen.add(cue.key);
        if(seen.size>256) seen.delete(seen.values().next().value);
        if(Number.isFinite(cue.createdAt)&&Date.now()-cue.createdAt>20000){skip('stale');continue;}
        if(play(cue,board,layer)) counts.played++;
      }
    }catch(_error){ /* cosmetic only; next poll retries from the current cursor */ }
    finally{if(thisFlight===flightSerial) inFlight=false;}
  }
  root.BattleVfx={normalize,normalizeStatic,renderStatic,syncStaticSnapshot,
    exactToken,cueSize,localFrame,point,play,sync,reset,loadManifest,
    enabled,refreshGate,setUserEnabled,mountUserControl,stats:()=>({returned:counts.returned,
      played:counts.played,skipped:{...counts.skipped}}),
    packStats:()=>({ready:manifestReady,effects:Object.keys(manifest).length,
      icons:Object.keys(statusIcons).length}),setManifest};
})(typeof window!=='undefined'?window:globalThis);
