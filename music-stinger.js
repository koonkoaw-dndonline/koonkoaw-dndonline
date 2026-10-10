// Event one-shots are a separate effect layer. Never owns, seeks or restarts a music loop.
// language-impact: none — audio only; bounded failures go to the developer console.
(function(root){
  'use strict';
  const KEYS=Object.freeze(['58A','58B','58C','58D','58E']);
  const allowed=new Set(KEYS);
  const clamp=n=>Number.isFinite(Number(n))?Math.max(0,Math.min(1,Number(n))):0;
  // BACKEND278 v1: 58A :: victory:<owner receipt> :: <atomic claim UUID>.
  // This is machine response metadata, never inferred from story/prose/settings.
  function responseEvents(body){
    if(!body||typeof body!=='object'||Array.isArray(body)||!Object.hasOwn(body,'music_stinger_events')||
      typeof body.music_stinger_events!=='string'||body.music_stinger_events.length>32768)return [];
    const kinds=['victory','defeat','level_up','quest_complete','treasure'],out=[];
    const shape=/^(58[A-E]) :: ([a-z_]+):([a-zA-Z0-9:,._-]{1,240}) :: ([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
    for(const line of body.music_stinger_events.split('\n').slice(0,64)){
      const m=shape.exec(line);if(!m||!allowed.has(m[1])||kinds[KEYS.indexOf(m[1])]!==m[2])continue;
      out.push({key:m[1],receipt:m[4].toLowerCase()});
    }
    return out;
  }
  function createAssetResolver(options){
    const o=options||{};
    return async function(key){
      if(!allowed.has(key)||!o.client)return null;
      const result=await o.client.from('music_v2_official_candidates')
        .select('track_key,catalog_version,design_slot,composition_variant,asset_key,profile_id,mime_type,object_path,loop_enabled,duration_seconds')
        .eq('design_slot','58').eq('composition_variant',key.slice(2)).like('catalog_version','official-31%').eq('loop_enabled',false).limit(32);
      if(!result||result.error)throw new Error('stinger_catalog_unavailable');
      const rows=(Array.isArray(result.data)?result.data:[]).filter(row=>{
        if(!row||row.design_slot!=='58'||row.composition_variant!==key.slice(2)||row.loop_enabled!==false||
          !/^official-31(?:-|$)/.test(String(row.catalog_version||''))||
          !new RegExp('^official:58:'+key.slice(2)+':[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$').test(String(row.track_key||''))||
          typeof row.object_path!=='string'||!row.object_path||row.object_path.length>1024||
          /(?:^|\/)\.\.(?:\/|$)|[:\\?#]|^\//.test(row.object_path))return false;
        try{return !!o.canPlayType(String(row.mime_type||''));}catch(_){return false;}
      });
      const rank=row=>row.profile_id==='webm-opus-112'?0:row.profile_id==='mp3-160'?1:2;
      rows.sort((a,b)=>rank(a)-rank(b)||String(b.catalog_version).localeCompare(String(a.catalog_version))||String(a.asset_key).localeCompare(String(b.asset_key)));
      return rows.length?{url:String(o.publicBase).replace(/\/?$/,'/')+rows[0].object_path,loop:false}:null;
    };
  }
  function createController(options){
    const o=options||{},later=o.setTimeout||root.setTimeout.bind(root),cancel=o.clearTimeout||root.clearTimeout.bind(root),now=o.now||Date.now;
    const seen=new Set(),queue=[];let active=null,serial=0,duck=1,releaseTimer=null,closed=false;
    const log=(reason,key)=>{try{(o.log||((r,k)=>console.info('[music-stinger]',r,k||'')))(reason,key);}catch(_){}};
    const scope=()=>String(o.scope?o.scope():'');
    const enabled=()=>!closed&&o.enabled&&o.enabled()===true;
    const volume=()=>clamp(o.volume?o.volume():0.5);
    function setDuck(value){duck=clamp(value);try{if(o.duck)o.duck(duck);}catch(_){log('duck_callback_failed');}}
    function clearRelease(){if(releaseTimer!==null){cancel(releaseTimer);releaseTimer=null;}}
    function release(immediate){
      clearRelease();if(immediate||duck===1){setDuck(1);return;}
      const from=duck,start=now();
      function tick(){const p=Math.min(1,(now()-start)/250);setDuck(from+(1-from)*p);if(p<1)releaseTimer=later(tick,25);else releaseTimer=null;}
      tick();
    }
    function valid(job){return active===job&&job.serial===serial&&enabled()&&job.scope===scope();}
    function clean(job){
      if(job.deadline!==null)cancel(job.deadline);if(job.frame!==null)cancel(job.frame);
      if(job.audio){for(const [event,fn]of job.listeners)job.audio.removeEventListener(event,fn);try{job.audio.pause();}catch(_){}}
    }
    function finish(job,reason){
      if(active!==job)return;clean(job);active=null;serial++;if(reason)log(reason,job.key);
      release(!enabled());void pump();
    }
    function envelope(job){
      if(!valid(job)){finish(job,'cancelled');return;}
      const p=Math.max(0,Math.min(1,(now()-job.started)/250)),a=job.audio;
      const remaining=Number.isFinite(a.duration)?Math.max(0,a.duration-a.currentTime):Infinity;
      job.level=p*Math.min(1,remaining/0.25);a.volume=clamp(volume()*job.level);
      const attack=job.fromDuck+(0.3-job.fromDuck)*p;
      setDuck(1-(1-attack)*Math.min(1,remaining/0.25));
      job.frame=later(()=>envelope(job),25);
    }
    async function pump(){
      if(active||closed)return;
      while(queue.length){
        const event=queue.shift();if(!enabled()||event.scope!==scope()){log('disabled_or_scope_changed',event.key);continue;}
        const job={...event,serial:++serial,audio:null,deadline:null,frame:null,listeners:[],started:null,fromDuck:duck,level:0};
        active=job;
        job.deadline=later(()=>finish(job,'asset_or_start_timeout'),5000);
        let asset;try{asset=await o.resolveAsset(event.key);}catch(_){if(active===job)finish(job,'asset_lookup_failed');return;}
        if(!valid(job)){if(active===job)finish(job,'cancelled');return;}
        if(!asset||typeof asset.url!=='string'||!asset.url||asset.loop!==false){finish(job,'asset_missing');return;}
        try{
          const a=job.audio=(o.createAudio||(()=>new root.Audio()))();
          a.loop=false;a.preload='auto';a.volume=0;
          const listen=(type,fn)=>{a.addEventListener(type,fn);job.listeners.push([type,fn]);};
          listen('playing',()=>{if(!valid(job)||job.started!==null)return;
            clearRelease();cancel(job.deadline);job.deadline=later(()=>finish(job,'duration_limit'),15000);
            job.started=now();job.fromDuck=duck;envelope(job);
          });
          listen('ended',()=>finish(job,null));
          listen('error',()=>finish(job,'media_failed'));
          a.src=asset.url;const play=a.play();
          if(play&&typeof play.catch==='function')play.catch(()=>finish(job,'play_rejected'));
        }catch(_){finish(job,'media_failed');}
        return;
      }
    }
    function receive(event){
      if(!event||!allowed.has(event.key)||typeof event.receipt!=='string'||!event.receipt.trim()||event.receipt.length>240)return false;
      const current=scope();if(!current)return false;
      const key=JSON.stringify([current,event.receipt,event.key]);if(seen.has(key))return false;
      seen.add(key);if(seen.size>512)seen.delete(seen.values().next().value);
      if(!enabled()){log('disabled',event.key);return false;}
      if(queue.length>=8){log('queue_full',event.key);return false;}
      queue.push({key:event.key,receipt:event.receipt,scope:current});void pump();return true;
    }
    function stop(reason){queue.length=0;serial++;const job=active;active=null;if(job)clean(job);clearRelease();setDuck(1);if(reason&&job)log(reason,job.key);}
    function setVolume(){if(!enabled()){stop('disabled');return;}if(active&&active.audio)active.audio.volume=clamp(volume()*active.level);}
    function dispose(){closed=true;stop('disposed');}
    return Object.freeze({receive,stop,setVolume,dispose,state:()=>({active:active?active.key:null,queued:queue.length,duck})});
  }
  root.TTRPG_MUSIC_STINGER=Object.freeze({KEYS,createController,createAssetResolver,responseEvents});
})(globalThis);
