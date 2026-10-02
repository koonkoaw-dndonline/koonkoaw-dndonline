// SEQ130. Paired server copy only; readiness never replays a gameplay request.
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
  function create(ports){
    let generation=0,state=null,timer=null,probe=null,attempt=0;
    const later=ports.setTimeout||setTimeout,cancel=ports.clearTimeout||clearTimeout;
    const context=()=>String(ports.context()||'');
    const capture=()=>({generation,context:context()});
    const current=s=>s.generation===generation&&s.context===context();
    const blocked=()=>!!state;
    const note=()=>state?(ports.language()==='en'?state.note_en:state.note_th):'';
    const failure=()=>Object.assign(new Error(note()),{name:'MaintenanceError'});
    function notify(){ ports.render(state?note():null); }
    function reset(){
      generation++; state=null; attempt=0;
      if(timer!==null)cancel(timer); timer=null;
      if(probe)probe.abort(); probe=null; notify();
    }
    function schedule(){
      if(!state||timer!==null||probe)return;
      timer=later(()=>{timer=null;void check();},Math.min(60000,5000*Math.pow(2,attempt)));
    }
    async function check(){
      if(!state||probe)return;
      const stamp=capture(),controller=new AbortController(); probe=controller;
      let deadline;
      try{
        const timeout=new Promise((_,reject)=>{deadline=later(()=>{controller.abort();reject(new Error('maintenance_probe_timeout'));},8000);});
        const result=await Promise.race([ports.probe(stamp.context,controller.signal),timeout]);
        if(!current(stamp)||!state||controller.signal.aborted)return;
        if(result&&!result.error&&ready(result.data)){ reset(); return; }
        if(result&&!result.error&&refusal(result.data)){
          state={error:result.data.error,retryable:true,note_th:result.data.note_th,note_en:result.data.note_en}; notify();
        }
      }catch(_error){ /* Remain paused; the next read-only probe uses bounded backoff. */ }
      finally{
        if(deadline!==undefined)cancel(deadline);
        if(probe===controller)probe=null;
        if(current(stamp)&&state){attempt=Math.min(4,attempt+1);schedule();}
      }
    }
    function enter(value,stamp){
      if(!refusal(value)||stamp&&!current(stamp))return false;
      const first=!state;
      state={error:value.error,retryable:true,note_th:value.note_th,note_en:value.note_en};
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
      const actionRpc=rpc&&['submit_action_v2','retract_action_v2'].includes(rpc[1]);
      const edge=/^\/functions\/v1\/(?:resolve-round|resolve-story-round|resolve-combat-round|aux-endpoints)(?:\/|$)/.test(url.pathname);
      const write=/^\/rest\/v1\//.test(url.pathname)&&!['GET','HEAD','OPTIONS'].includes(method);
      return edge||write?{actionRpc:!!actionRpc,edge}:null;
    }
    async function send(fetcher,input,options){
      const target=route(input,options);
      if(!target)return fetcher(input,options);
      if(blocked())throw failure();
      const stamp=capture(),response=await fetcher(input,options);
      if(target.edge&&response.status===503||target.actionRpc&&response.ok){
        let data=null;try{data=await response.clone().json();}catch(_error){}
        if(enter(data,stamp))throw failure();
      }
      return response;
    }
    return Object.freeze({blocked,note,capture,current,enter,reset,render:notify,send});
  }
  // SEQ138: report only an explicit failed table write, in a separate transaction.
  // The original actor's headers and world are captured before either request awaits.
  function createDirectDenial(ports){
    const later=ports.setTimeout||setTimeout,cancel=ports.clearTimeout||clearTimeout;
    function capture(input,options){
      let url;
      try{url=new URL(typeof input==='string'?input:input.url||String(input));}catch(_error){return null;}
      const method=String(options&&options.method||input&&input.method||'GET').toUpperCase();
      const table=url.pathname.match(/^\/rest\/v1\/([a-z_][a-z0-9_]*)$/);
      if(url.origin!==ports.origin||!table||!['POST','PATCH','DELETE'].includes(method))return null;
      const context=ports.context(),headers=new Headers(options&&options.headers||input&&input.headers);
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
      if(error&&error.code==='P0001'&&/^round_split_writer_wall_denied(?:\s*:|$)/.test(String(error.message||''))){
        notice(stamp,false);
        let timer,controller;
        try{
          if(!stamp.campaignId&&stamp.relation!=='profiles')throw new Error('direct_denial_context_missing');
          if(!stamp.authorization||!stamp.apikey)throw new Error('direct_denial_actor_missing');
          controller=new AbortController();
          const timeout=new Promise((_,reject)=>{timer=later(()=>{controller.abort();reject(new Error('direct_denial_audit_timeout'));},8000);});
          const audit=ports.report(fetcher,new URL('/rest/v1/rpc/round_split_report_direct_denial_v1',ports.origin).href,{
            method:'POST',headers:{'content-type':'application/json',authorization:stamp.authorization,apikey:stamp.apikey},
            body:JSON.stringify({p_campaign_id:stamp.campaignId,p_relation:stamp.relation,p_operation:stamp.operation}),signal:controller.signal,
          }).then(async reported=>{
            const receipt=await reported.json().catch(()=>null);
            if(!reported.ok||!receipt||receipt.ok!==true||receipt.code!=='direct_denial_logged')throw new Error('direct_denial_audit_unconfirmed');
          });
          await Promise.race([audit,timeout]);
        }catch(failure){
          ports.failure(String(failure&&failure.message||'direct_denial_audit_failed'));
          notice(stamp,true);
        }finally{if(timer!==undefined)cancel(timer);}
      }
      return response;
    }
    return Object.freeze({capture,send});
  }
  root.EverRollMaintenance=Object.freeze({create,refusal,ready,createDirectDenial});
})(typeof window!=='undefined'?window:globalThis);
