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
  const ASSET_VERSION='20260925vfx05';
  // PixelLab exports remain visual candidates until owner upload/approval.
  const manifest=Object.create(null);
  let scope='',cursor=null,boardSvg=null,boardWatched=null,observer=null;
  let layerNode=null,hostNode=null,listeners=false,listenerDocument=null;
  let inFlight=false,active=0,epoch=0,flightSerial=0;
  let gateCampaign='',gateEnabled=false,gateFlight=0;
  const counts={returned:0,played:0,skipped:Object.create(null)};
  const seen=new Set();
  const timers=new Set();
  const motions=new Set();
  function userEnabled(campaignId){
    try{return root.localStorage?.getItem('ttrpg_vfx_off_'+campaignId)!=='1';}
    catch(_error){return true;}
  }
  function enabled(campaignId){return gateEnabled&&gateCampaign===campaignId&&userEnabled(campaignId);}
  function skip(reason){counts.skipped[reason]=(counts.skipped[reason]||0)+1;}
  async function refreshGate(supa,campaignId){
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
    gateEnabled=on;
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
  }
  function reset(){
    epoch++;flightSerial++;
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
  function onResume(){ if(!enabled(gateCampaign)){reset();return;} epoch++;flightSerial++;inFlight=false;cursor=null;clearVisuals(); }
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
    return {key:row.event_key+'|'+row.target_token_id+'|'+row.kind,
      cursor:Number(row.cursor_id),target:row.target_token_id,actor:row.actor_token_id,
      grid:row.grid_id,targetRefKind:row.target_ref_kind,targetRef:row.target_ref_id,
      actorRefKind:row.actor_ref_kind,actorRef:row.actor_ref_id,
      targetCol:Number(row.target_col),targetRow:Number(row.target_row),
      targetSize:Number(row.target_size),actorCol:Number(row.actor_col),
      actorRow:Number(row.actor_row),actorSize:Number(row.actor_size),
      kind:row.kind,keys,strength,createdAt:Date.parse(row.created_at||''),
      canNudge:row.kind==='damage'&&!blocked&&row.attack!=='none'&&
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
  function point(node,layer){
    const sprite=node&&node.querySelector('image');
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
    const frames=manifest[cue.keys[0]]&&manifest[cue.keys[0]].frames;
    if(Array.isArray(frames)&&frames.length){
      const src=localFrame(frames[0]);
      if(src){
        const img=root.document.createElement('img');
        img.alt='';img.draggable=false;img.src=src;node.appendChild(img);
        if(!reduced&&frames.length>1){
          const interval=Math.max(35,Math.floor(420/frames.length));
          let frame=0;
          const step=()=>{
            timers.delete(timer);
            if(!node.isConnected||frame>=frames.length-1) return;
            frame++;const next=localFrame(frames[frame]);if(next)img.src=next;
            timer=setTimeout(step,interval);timers.add(timer);
          };
          let timer=setTimeout(step,interval);timers.add(timer);
        }
      }
    }
    layer.appendChild(node);active++;
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
      reduced?180:540);
    timers.add(timer);
    return true;
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
  root.BattleVfx={normalize,exactToken,cueSize,localFrame,point,play,sync,reset,
    enabled,refreshGate,setUserEnabled,mountUserControl,stats:()=>({returned:counts.returned,
      played:counts.played,skipped:{...counts.skipped}}),
    setManifest:function(next){
      for(const key of Object.keys(manifest)) delete manifest[key];
      for(const [key,value] of Object.entries(next||{}))
        if(COLORS[key]&&value&&Array.isArray(value.frames)&&
          value.frames.length<=40&&value.frames.every(localFrame))
          manifest[key]={frames:value.frames.slice()};
    }};
})(typeof window!=='undefined'?window:globalThis);
