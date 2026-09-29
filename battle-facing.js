// FACE-02 / W277. language-impact: none — visual URL selection and reason codes only.
(function(root){
  'use strict';
  const ORDER=Object.freeze(['N','NE','E','SE','S','SW','W','NW']);
  const DIR=new Set(ORDER);
  const KEY=/^[a-z]+_(?:female|male)_(?:[a-z]+(?:_[a-z]+)*)$/;
  const HASH=/^[a-f0-9]{64}$/i;
  const SLUG=Object.freeze({N:'north',NE:'north-east',E:'east',SE:'south-east',S:'south',SW:'south-west',W:'west',NW:'north-west'});
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function fromDelta(dc,dr,previous){
    if(!Number.isFinite(dc)||!Number.isFinite(dr))return DIR.has(previous)?previous:null;
    const x=Math.sign(dc),y=Math.sign(dr);
    if(x===0&&y===0)return DIR.has(previous)?previous:null;
    return (y<0?'N':y>0?'S':'')+(x<0?'W':x>0?'E':'');
  }
  function fromCells(start,end,previous){
    if(!start||!end)return DIR.has(previous)?previous:null;
    if([start.col,start.row,end.col,end.row].some(v=>v===null||v===undefined||v===''))
      return DIR.has(previous)?previous:null;
    const numbers=[start.col,start.row,end.col,end.row].map(Number);
    if(numbers.some(n=>!Number.isInteger(n)))return DIR.has(previous)?previous:null;
    return fromDelta(numbers[2]-numbers[0],numbers[3]-numbers[1],previous);
  }
  function fromCommittedReceipt(row,scope,token){
    if(!row||!scope||!token||token.kind!=='pc'||
      String(token.id)!==String(row.token_id)||
      String(token.ref_char_id)!==String(row.character_id)||
      !UUID.test(String(row.token_id||''))||
      String(row.campaign_id)!==String(scope.campaign_id)||
      String(row.encounter_id)!==String(scope.encounter_id)||
      Number(row.group_no)!==Number(scope.group_no)||
      !UUID.test(String(row.character_id||''))||
      !['move','attack'].includes(row.source_kind)||!DIR.has(row.direction)||
      !['v1','v2'].includes(row.pack)||!Number.isSafeInteger(Number(row.source_seq))||
      Number(row.source_seq)<1)return null;
    return Object.freeze({tokenId:row.token_id,characterId:row.character_id,
      direction:row.direction,pack:row.pack,seq:Number(row.source_seq)||0});
  }
  function approvedSet(manifest,pack,key){
    if(!manifest||manifest.active!==true||manifest.schema_version!==1||
      !['v1','v2'].includes(pack)||!KEY.test(String(key||'')))return null;
    const set=manifest.sets&&manifest.sets[pack+'/'+key];
    if(!set||set.status!=='owner_approved'||set.pack!==pack||set.key!==key||
      !set.directions||!ORDER.every(d=>{
        const item=set.directions[d];
        return item&&HASH.test(String(item.sha256||''))&&
          (!item.path||item.path===pack+'/'+key+'/'+SLUG[d]+'.png')&&
          Number.isInteger(item.anchor_y)&&item.anchor_y>=0&&item.anchor_y<=128;
      }))return null;
    return set;
  }
  function select(input){
    const fallback=Object.freeze({href:input&&input.fallback||null,anchorFraction:0.875,
      directional:false,reason:'fallback'});
    if(!input||input.enabled!==true||input.kind!=='pc'||!UUID.test(String(input.characterId||''))||
      !DIR.has(input.direction))return fallback;
    const set=approvedSet(input.manifest,input.pack,input.key);
    if(!set)return fallback;
    const base=String(input.base||'');
    if(!base||!/^https?:\/\/|^\//.test(base))return fallback;
    const item=set.directions[input.direction];
    const href=base.replace(/\/$/,'')+'/'+(item.path||input.pack+'/'+input.key+'/'+input.direction+'.png')+'?v='+
      encodeURIComponent(String(input.manifest.version||''));
    return Object.freeze({href,anchorFraction:item.anchor_y/128,directional:true,reason:'approved'});
  }
  function selectTokenAsset(input){
    const fallback=Object.freeze({href:input&&input.fallback||null,anchorFraction:0.875,
      directional:false,reason:'fallback'});
    const token=input&&input.token;
    if(!token||token.kind!=='pc'||!UUID.test(String(token.ref_char_id||'')))return fallback;
    const match=String(input.fallback||'').match(/\/([a-z]+_(?:female|male)_[a-z_]+)\.png(?:\?.*)?$/);
    if(!match)return fallback;
    const pack=Array.isArray(token.flags)&&token.flags.some(f=>String(f).toLowerCase()==='sprite_set:v1')?'v1':'v2';
    const choice=select({enabled:input.enabled,kind:'pc',characterId:token.ref_char_id,
      direction:token.facing,pack,key:match[1],manifest:input.manifest,
      base:input.base,fallback:input.fallback});
    return choice.directional&&input.failedUrls&&input.failedUrls[choice.href]===false
      ?fallback:choice;
  }
  function turnPath(from,to,reduced){
    if(!DIR.has(to))return [];
    if(reduced||!DIR.has(from))return [to];
    const a=ORDER.indexOf(from),b=ORDER.indexOf(to),clockwise=(b-a+8)%8;
    if(!clockwise)return [];
    const step=clockwise<=4?1:-1,count=Math.min(clockwise,8-clockwise);
    return Array.from({length:count},(_,i)=>ORDER[(a+step*(i+1)+8)%8]);
  }
  function decodeImage(href){
    return new Promise((resolve,reject)=>{
      const image=new root.Image();image.decoding='async';
      image.onerror=()=>reject(new Error('facing-image-unavailable'));
      image.onload=async()=>{try{if(typeof image.decode==='function')await image.decode();resolve(image);}catch(error){reject(error);}};
      image.src=href;
    });
  }
  // Retain the last decoded frame. A presentation change never changes token.facing.
  function createPresenter(options){
    const opts=options||{},load=opts.loadImage||decodeImage,later=opts.schedule||((fn,ms)=>setTimeout(fn,ms)),cancel=opts.cancel||clearTimeout;
    const states=new Map(),images=new Map(),reduced=()=>typeof opts.reducedMotion==='function'?opts.reducedMotion():false;
    const prepare=href=>{
      if(images.has(href))return images.get(href);
      const task=Promise.resolve().then(()=>load(href)).then(image=>({image}),()=>null);images.set(href,task);
      if(images.size>256)images.delete(images.keys().next().value);
      return task;
    };
    function stop(state){state.generation++;if(state.timer!=null)cancel(state.timer);state.timer=null;}
    function present(input){
      const target=selectTokenAsset(input),token=input&&input.token,key=token&&String(token.grid_id||'')+'/'+String(token.id||'');
      const fallback=Object.freeze({href:input&&input.fallback||null,anchorFraction:.875,directional:false,reason:'fallback'});
      if(!token||!UUID.test(String(token.id||''))||!token.grid_id)return fallback;
      let state=states.get(key);
      const family=String(input.base)+'|'+String(input.manifest&&input.manifest.version)+'|'+String(input.fallback)+'|'+String(Array.isArray(token.flags)&&token.flags.some(f=>String(f).toLowerCase()==='sprite_set:v1'));
      if(state&&state.family!==family){stop(state);states.delete(key);state=null;}
      if(!target.directional){if(state){stop(state);states.delete(key);}return fallback;}
      if(!state){state={family,generation:0,timer:null,visible:fallback,direction:null,target:null};states.set(key,state);}
      if(states.size>128){const first=states.keys().next().value;if(first!==key){stop(states.get(first));states.delete(first);}}
      if(state.target===target.href)return state.visible;
      stop(state);state.target=target.href;const generation=state.generation;
      const directions=turnPath(state.direction,token.facing,reduced());
      if(!directions.length)return state.visible;
      const frames=directions.map(direction=>({direction,choice:selectTokenAsset({...input,token:{...token,facing:direction}})}));
      Promise.all(frames.map(frame=>frame.choice.directional?prepare(frame.choice.href):Promise.resolve(null))).then(ready=>{
        if(state.generation!==generation||states.get(key)!==state)return;
        // A failed intermediate image must not create a blank; use the decoded final frame directly.
        if(!ready[ready.length-1])return;
        const sequence=ready.every(Boolean)&&!reduced()?frames:[frames[frames.length-1]];
        let index=0;
        const advance=()=>{
          if(state.generation!==generation||states.get(key)!==state)return;
          if(reduced())index=sequence.length-1;
          const frame=sequence[index++],previous=state.visible;
          state.visible=frame.choice;state.direction=frame.direction;
          if(input.failedUrls)input.failedUrls[frame.choice.href]=true;
          if(typeof opts.onFrame==='function')opts.onFrame(input,frame.choice,previous);
          state.timer=index<sequence.length?later(advance,80):null;
        };
        advance();
      });
      return state.visible;
    }
    function clear(){for(const state of states.values())stop(state);states.clear();images.clear();}
    return Object.freeze({present,clear});
  }
  function paintTokenFrame(documentRef,input,choice,previous){
    if(!documentRef||!input||!input.token||!choice||!choice.href||!previous)return false;
    const token=input.token;let painted=false;
    for(const group of documentRef.querySelectorAll('[data-face-token-id]')){
      if(group.getAttribute('data-face-token-id')!==String(token.id)||group.getAttribute('data-face-grid-id')!==String(token.grid_id))continue;
      const image=group.querySelector('image');if(!image)continue;
      const href=image.getAttribute('href');if(href!==previous.href&&href!==input.fallback&&href!==choice.href)continue;
      const raw=[image.getAttribute('height'),group.getAttribute('data-face-y'),image.getAttribute('y')];
      if(raw.some(v=>v===null||v===''))continue;
      const [size,fy,oldY]=raw.map(Number);
      if(!Number.isFinite(size)||size<=0||!Number.isFinite(fy)||!Number.isFinite(oldY))continue;
      const y=fy-size*choice.anchorFraction,transform=image.getAttribute('transform');
      if(transform){
        const match=/^matrix\(([^)]+)\)$/.exec(transform);if(!match)continue;
        const m=match[1].trim().split(/[ ,]+/).map(Number);if(m.length!==6||m.some(x=>!Number.isFinite(x)))continue;
        // Preserve C0928-8's ground-centered lying bounds when the frame's foot anchor differs.
        m[4]-=m[2]*(y-oldY);m[5]-=m[3]*(y-oldY);
        image.setAttribute('transform','matrix('+m.join(' ')+')');
      }
      image.setAttribute('y',String(y));image.setAttribute('href',choice.href);painted=true;
    }
    return painted;
  }
  let presenter=null;
  function presentTokenAsset(input){
    if(!presenter)presenter=createPresenter({reducedMotion:()=>!!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches),onFrame:(input,choice,previous)=>{
      if(root._pcFacingV1===true)paintTokenFrame(root.document,input,choice,previous);
    }});
    return presenter.present(input);
  }
  root.BattleFacing=Object.freeze({ORDER,fromDelta,fromCells,fromCommittedReceipt,approvedSet,select,selectTokenAsset,turnPath,createPresenter,paintTokenFrame,presentTokenAsset});
})(typeof window!=='undefined'?window:globalThis);
