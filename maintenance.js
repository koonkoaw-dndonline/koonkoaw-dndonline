// Paired refusal copy; readiness never replays a gameplay request.
(function(root){
  'use strict';
  function refusal(value){
    return !!value&&typeof value==='object'&&!Array.isArray(value)&&
      typeof value.error==='string'&&value.error.trim().length>0&&value.retryable===true&&
      typeof value.note_th==='string'&&value.note_th.trim().length>0&&
      typeof value.note_en==='string'&&value.note_en.trim().length>0;
  }
  function ready(value){
    return !!value&&value.ready===true&&(value.phase==='legacy'||value.phase==='split')&&
      Number.isSafeInteger(value.epoch)&&value.epoch>0;
  }
  // SEQ199: preserve refusal semantics independently of HTTP status/retryability.
  function projection(value,status){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.ok===true)return null;
    const reason=value.error||value.reason_code;
    const paired=typeof value.note_th==='string'&&value.note_th.trim()&&typeof value.note_en==='string'&&value.note_en.trim();
    const modern=typeof reason==='string'&&(/^(?:split_|round_split_|combat_force_)/.test(reason)||value.ok===false||value.status==='uncertain'||value.status==='retry'&&reason==='force_claim_rolled_back'&&value.retryable===true||typeof value.retryable==='boolean'&&(status===403||status===409));
    if(!paired||typeof reason!=='string'||!reason.trim()||!(modern||refusal(value)&&(status===undefined||status===503)))return null;
    const closed=reason==='split_campaign_closed'||value.reason_code==='split_campaign_closed';
    const refresh=value.retryable===false||value.status==='uncertain'||/^combat_force_/.test(reason)||status===400||status===403||status===409;
    return {error:reason,retryable:value.retryable===true,kind:closed?'terminal':refresh?'refresh':'maintenance',
      note_th:closed?'โลกนี้ปิดแล้ว กรุณาโหลดหน้าใหม่เพื่อเลือกโลกอื่น':value.note_th,
      note_en:closed?'This world has closed. Reload the page to choose another world.':value.note_en};
  }
  function closedReadiness(){return {error:'split_campaign_closed',retryable:false,
    note_th:'คุณไม่ได้อยู่ในโลกนี้แล้ว กรุณาโหลดหน้าใหม่เพื่อเลือกโลกอื่น',
    note_en:'You are no longer in this world. Reload the page to choose another world.',kind:'terminal'};}
  function rpcRefusal(value){
    if(refusal(value))return value;
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const reason=value.reason_code||value.code;
    if(typeof reason==='string'&&/^(?:round_split_|split_)/.test(reason)){
      const normalized=Object.assign({},value,{error:reason});
      if(refusal(normalized))return normalized;
    }
    if(value.retryable===false||value.status==='uncertain'){
      const projected=projection(value);if(projected)return projected;
    }
    if(value.code==='P0001'&&/^round_split_writer_wall_denied(?:\s*:|$)/.test(String(value.message||''))){
      let detail=value.details||value.detail;try{if(typeof detail==='string')detail=JSON.parse(detail);}catch(_error){}
      const projected=projection(detail);if(projected)return projected;
      return {error:'round_split_writer_wall_denied',retryable:true,
        note_th:'ระบบพักรับการเปลี่ยนแปลงชั่วคราวและกำลังตรวจสอบความพร้อม โปรดส่งคำสั่งอีกครั้งเมื่อระบบพร้อม',
        note_en:'Changes are temporarily paused while the game checks readiness. Submit your request again when it is ready.'};
    }
    return null;
  }
  function create(ports){
    let generation=0,state=null,timer=null,probe=null,attempt=0;
    const later=ports.setTimeout||setTimeout,cancel=ports.clearTimeout||clearTimeout;
    const context=()=>String(ports.context()||'');
    const capture=()=>({generation,context:context()});
    const current=s=>s.generation===generation&&s.context===context();
    const blocked=()=>!!state;
    const note=()=>state?(ports.language()==='en'?state.note_en:state.note_th):'';
    const failure=()=>Object.assign(new Error(note()),{name:'MaintenanceError'});
    function notify(){ ports.render(state?note():null,state?{kind:state.kind}:null); }
    function reset(){
      generation++; state=null; attempt=0;
      if(timer!==null)cancel(timer); timer=null;
      if(probe)probe.abort(); probe=null; notify();
    }
    function schedule(){
      if(!state||state.kind!=='maintenance'||timer!==null||probe)return;
      timer=later(()=>{timer=null;void check();},Math.min(60000,5000*Math.pow(2,attempt)));
    }
    async function check(){
      if(!state||state.kind!=='maintenance'||probe)return;
      const stamp=capture(),controller=new AbortController(); probe=controller;
      let deadline;
      try{
        const timeout=new Promise((_,reject)=>{deadline=later(()=>{controller.abort();reject(new Error('maintenance_probe_timeout'));},8000);});
        const result=await Promise.race([ports.probe(stamp.context,controller.signal),timeout]);
        if(!current(stamp)||!state||controller.signal.aborted)return;
        if(result&&!result.error&&result.data&&result.data.ready===false&&result.data.error==='not_member'){
          state=closedReadiness();notify();return;
        }
        if(result&&!result.error&&ready(result.data)){ reset(); return; }
        if(result&&!result.error&&refusal(result.data)){
          state=projection(result.data);notify();
        }
      }catch(_error){ /* Remain paused; the next read-only probe uses bounded backoff. */ }
      finally{
        if(deadline!==undefined)cancel(deadline);
        if(probe===controller)probe=null;
        if(current(stamp)&&state){attempt=Math.min(4,attempt+1);schedule();}
      }
    }
    function enter(value,stamp,status){
      const projected=projection(value,status);
      if(!projected||stamp&&!current(stamp))return false;
      const first=!state;
      state=projected;
      // A lobby has no world readiness endpoint; its next action is explicit reload.
      if(!context()&&state.kind==='maintenance')state.kind='refresh';
      if(state.kind!=='maintenance'){
        if(timer!==null)cancel(timer);timer=null;
        if(probe)probe.abort();probe=null;
      }
      if(first){generation++;attempt=0;ports.pause();}
      notify(); schedule(); return true;
    }
    function route(input,options){
      let url;
      try{url=new URL(typeof input==='string'?input:input.url||String(input));}catch(_error){return null;}
      if(url.origin!==ports.origin)return null;
      const method=String(options&&options.method||input&&input.method||'GET').toUpperCase();
      const rpc=url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
      if(rpc&&rpc[1]==='round_split_readiness_v1')return null;
      if(rpc&&rpc[1]==='round_split_report_direct_denial_v1'&&method==='POST')return null;
      if(rpc&&rpc[1]==='round_split_report_direct_rpc_denial_v2'&&method==='POST')return null;
      const stateRpc=rpc&&['submit_action_v2','retract_action_v2','levelup_submit','respond_npc_offer_consent_v1','set_combat_effect_enabled_v1','upsert_dm_option_candidate_review_v1','end_campaign','leave_campaign','create_campaign_language_v2','join_campaign_language_v2'].includes(rpc[1]);
      const edge=/^\/functions\/v1\/(?:resolve-round|resolve-story-round|resolve-combat-round|aux-endpoints)(?:\/|$)/.test(url.pathname);
      const write=/^\/rest\/v1\//.test(url.pathname)&&!['GET','HEAD','OPTIONS'].includes(method);
      return edge||write?{stateRpc:!!stateRpc,edge}:null;
    }
    async function send(fetcher,input,options){
      const target=route(input,options);
      if(!target)return fetcher(input,options);
      if(blocked())throw failure();
      const stamp=capture(),response=await fetcher(input,options);
      if(target.edge||target.stateRpc){
        let data=null;try{data=await response.clone().json();}catch(_error){}
        if(target.stateRpc)data=rpcRefusal(data);
        if(enter(data,stamp,target.stateRpc?undefined:response.status))throw failure();
      }
      return response;
    }
    async function rpc(call){
      if(blocked())throw failure();
      const stamp=capture(),language=ports.language();
      const result=await call();
      // Supabase can convert the fetch wrapper's MaintenanceError to result.error.
      if(blocked()&&stamp.context===context())throw failure();
      const value=rpcRefusal(result&&result.data)||rpcRefusal(result&&result.error);
      if(value){
        if(enter(value,stamp))throw failure();
        // A stale world's refusal must not become a false success at its caller.
        throw Object.assign(new Error(language==='en'?value.note_en:value.note_th),{name:'MaintenanceError'});
      }
      return result;
    }
    return Object.freeze({blocked,note,capture,current,enter,reset,render:notify,send,rpc});
  }
  // SEQ138/180: report an explicit table/RPC denial in a separate transaction.
  // The original actor's headers and world are captured before either request awaits.
  function createDirectDenial(ports){
    const later=ports.setTimeout||setTimeout,cancel=ports.clearTimeout||clearTimeout;
    function capture(input,options){
      let url;
      try{url=new URL(typeof input==='string'?input:input.url||String(input));}catch(_error){return null;}
      const method=String(options&&options.method||input&&input.method||'GET').toUpperCase();
      const table=url.pathname.match(/^\/rest\/v1\/([a-z_][a-z0-9_]*)$/);
      const rpc=url.pathname.match(/^\/rest\/v1\/rpc\/(end_campaign|leave_campaign|set_combat_effect_enabled_v1)$/);
      if(url.origin!==ports.origin||(!table&&!rpc)||!['POST','PATCH','DELETE'].includes(method)||rpc&&method!=='POST')return null;
      const context=ports.context(),headers=new Headers(options&&options.headers||input&&input.headers);
      if(rpc){
        let request=null;try{if(!options?.body&&input&&typeof input.clone==='function')request=input.clone();}catch(_error){}
        return Object.freeze({campaignId:context.campaignId||null,actorId:context.actorId||null,rpc:rpc[1],
          body:typeof options?.body==='string'?options.body:null,request,
          authorization:headers.get('authorization')||'',apikey:headers.get('apikey')||''});
      }
      return Object.freeze({campaignId:context.campaignId||null,actorId:context.actorId||null,
        relation:table[1],operation:method==='PATCH'?'update':method==='DELETE'?'delete':
          /resolution=merge-duplicates/i.test(headers.get('prefer')||'')?'upsert':'insert',
        authorization:headers.get('authorization')||'',apikey:headers.get('apikey')||''});
    }
    function notice(stamp,failed){
      const current=ports.context();
      if((current.campaignId||null)!==stamp.campaignId||(current.actorId||null)!==stamp.actorId)return;
      const copy=failed
        ? ['ระบบปฏิเสธการบันทึกข้อมูล และยังบันทึกรายงานข้อผิดพลาดไม่ได้ กรุณาแจ้งผู้ดูแล','The change was blocked, and its error report could not be saved. Please notify the host.']
        : ['ระบบปฏิเสธการบันทึกข้อมูล กรุณาลองใหม่ภายหลัง','The change was blocked. Please try again later.'];
      ports.notice(copy[current.language==='en'?1:0]);
    }
    async function send(fetcher,input,options,stamp){
      const response=await fetcher(input,options);
      if(!stamp||response.ok)return response;
      let error=null;try{error=await response.clone().json();}catch(_error){}
      if(error&&error.code==='P0001'&&(stamp.rpc?/^round_split_writer_wall_denied:/:/^round_split_writer_wall_denied(?:\s*:|$)/).test(String(error.message||''))){
        if(!stamp.rpc)notice(stamp,false);
        let timer,controller;
        try{
          let campaignId=stamp.campaignId;
          if(stamp.rpc){
            const payload=JSON.parse(stamp.body!==null?stamp.body:stamp.request?await stamp.request.text():'null');
            campaignId=payload&&payload.p_campaign;
            if(typeof campaignId!=='string'||!/^[-0-9a-f]{36}$/i.test(campaignId))throw new Error('direct_rpc_denial_context_missing');
          }
          if(!campaignId&&stamp.relation!=='profiles')throw new Error('direct_denial_context_missing');
          if(!stamp.authorization||!stamp.apikey)throw new Error('direct_denial_actor_missing');
          controller=new AbortController();
          const timeout=new Promise((_,reject)=>{timer=later(()=>{controller.abort();reject(new Error('direct_denial_audit_timeout'));},8000);});
          const audit=ports.report(fetcher,new URL('/rest/v1/rpc/'+(stamp.rpc?'round_split_report_direct_rpc_denial_v2':'round_split_report_direct_denial_v1'),ports.origin).href,{
            method:'POST',headers:{'content-type':'application/json',authorization:stamp.authorization,apikey:stamp.apikey},
            body:JSON.stringify(stamp.rpc?{p_cid:campaignId,p_rpc:stamp.rpc}:{p_campaign_id:campaignId,p_relation:stamp.relation,p_operation:stamp.operation}),signal:controller.signal,
          }).then(async reported=>{
            const receipt=await reported.json().catch(()=>null);
            if(!reported.ok||!receipt||receipt.ok!==true||receipt.code!==(stamp.rpc?'direct_rpc_denial_logged':'direct_denial_logged'))throw new Error('direct_denial_audit_unconfirmed');
          });
          await Promise.race([audit,timeout]);
        }catch(failure){
          ports.failure((stamp.rpc?'direct_rpc_denial_audit_failed:'+stamp.rpc+':':'')+String(failure&&failure.message||'direct_denial_audit_failed'));
          if(!stamp.rpc)notice(stamp,true);
        }finally{if(timer!==undefined)cancel(timer);}
      }
      return response;
    }
    return Object.freeze({capture,send});
  }
  root.EverRollMaintenance=Object.freeze({create,refusal,ready,rpcRefusal,projection,createDirectDenial});
})(typeof window!=='undefined'?window:globalThis);
