// W276: advisory fast-picker telemetry. Gameplay never waits for this queue.
// language-impact: none — network diagnostics are machine-only.
(function(root){
  'use strict';
  function create(host){
    host=host||{};
    var sessions=new Map(), queue=[], busy=false, draft=null, submitted=null;
    function token(){
      var c=root.crypto;
      if(!c||typeof c.getRandomValues!=='function') return null;
      var b=new Uint8Array(16); c.getRandomValues(b);
      return Array.from(b,function(x){return x.toString(16).padStart(2,'0');}).join('');
    }
    function validContext(c){ return !!(c&&c.campaign_id&&c.round_id&&c.character_id&&(c.group_no===1||c.group_no===2)); }
    function validCell(cell){ return typeof cell==='string'&&/^[A-T](?:[1-9]|1[0-9]|20)$/i.test(cell.trim()); }
    function sameCell(a,b){ return validCell(a)&&validCell(b)&&a.trim().toUpperCase()===b.trim().toUpperCase(); }
    function fail(reason){ if(typeof host.onFailure==='function') host.onFailure(reason); }
    function enqueue(s,event,actionId,at,selectedCell){
      if(!s||!validContext(s.context)||queue.length>=16){ fail('queue_full_or_scope_missing'); return false; }
      if(s.sent.has(event)) return false;
      s.sent.add(event);
      queue.push(Object.assign({},s.context,{session_id:s.token,kind:s.kind,event:event,
        action_id:actionId||null,selected_cell:selectedCell||null,
        client_latency_ms:Math.max(0,Math.min(120000,Math.round((at||Date.now())-s.openedAt)))}));
      if(typeof root.requestAnimationFrame==='function') root.requestAnimationFrame(function(){ setTimeout(flush,0); });
      else setTimeout(flush,0);
      return true;
    }
    async function flush(){
      if(busy||!queue.length) return;
      busy=true;
      while(queue.length){
        var item=queue[0], done=false;
        for(var attempt=0;attempt<2&&!done;attempt++){
          try{ var reply=await host.send(item); done=!!(reply&&reply.ok); if(!done&&reply&&reply.retryable===false) break; }
          catch(error){ fail('network_error'); }
        }
        if(!done) fail('server_receipt_missing');
        queue.shift();
      }
      busy=false;
    }
    function note(event){
      if(!event) return false;
      var id=event.sessionId, s=sessions.get(id), at=Number(event.at)||Date.now();
      if(event.type==='picker-opened'){
        var ctx=typeof host.context==='function'?host.context():null;
        var opaque=token();
        if(!opaque||!validContext(ctx)||!['move','aoe'].includes(event.kind)) return false;
        s={token:opaque,kind:event.kind,context:ctx,openedAt:at,selectedCell:null,sent:new Set()};
        sessions.set(id,s);
        if(sessions.size>8) sessions.delete(sessions.keys().next().value);
        return enqueue(s,'picker_open',null,at);
      }
      if(!s) return false;
      if(event.type==='selection-changed'&&validCell(event.cell)){
        s.selectedCell=event.cell.trim().toUpperCase();
        return true;
      }
      if(event.type==='draft-ready'&&sameCell(event.cell,s.selectedCell)&&
         enqueue(s,'pick_ready',null,at,s.selectedCell)){ draft=s; return true; }
      return false;
    }
    function leaseReenter(sessionId){ return enqueue(sessions.get(sessionId),'lease_reenter',null,Date.now()); }
    function submittedAction(actionId,structured){
      if(!draft||!actionId||!structured) return false;
      var c=typeof host.context==='function'?host.context():null;
      if(!validContext(c)||c.campaign_id!==draft.context.campaign_id||c.round_id!==draft.context.round_id||
         c.character_id!==draft.context.character_id||c.group_no!==draft.context.group_no) return false;
      var kind=draft.kind, turn=structured.turn||{};
      if(kind==='move'&&!sameCell(structured.move_to??turn.movement?.moveTo,draft.selectedCell)) return false;
      if(kind==='aoe'&&![turn.action,turn.bonus].some(function(slot){return slot&&sameCell(slot.mapTarget,draft.selectedCell)&&Array.isArray(slot.area)&&slot.area.length>0;})) return false;
      submitted={session:draft,actionId:actionId}; draft=null;
      return enqueue(submitted.session,'command_submitted',actionId,Date.now());
    }
    function feedbackVisible(){
      if(!submitted) return false;
      var s=submitted; submitted=null;
      return enqueue(s.session,'feedback_visible',s.actionId,Date.now());
    }
    return Object.freeze({note:note,leaseReenter:leaseReenter,submittedAction:submittedAction,
      feedbackVisible:feedbackVisible,pending:function(){return queue.length;}});
  }
  root.TTRPG_GRID_TOUCH_TELEMETRY=Object.freeze({create:create});
})(typeof window!=='undefined'?window:globalThis);
