// W276: advisory fast-picker telemetry. Gameplay never waits for this queue.
// language-impact: none — network diagnostics are machine-only.
(function(root){
  'use strict';
  // A measurable SVG token can still be outside a panned board or mobile viewport.
  // This observation is conservative; it never substitutes for the server Move receipt.
  function onScreen(node,board){
    if(!node||typeof node.getBoundingClientRect!=='function'||typeof root.getComputedStyle!=='function') return false;
    var v=root.visualViewport, left=v?v.offsetLeft:0, top=v?v.offsetTop:0;
    var width=v?v.width:root.innerWidth, height=v?v.height:root.innerHeight;
    if(![left,top,width,height].every(Number.isFinite)||width<=0||height<=0) return false;
    var r=node.getBoundingClientRect();
    if(!r||![r.left,r.top,r.right,r.bottom].every(Number.isFinite)) return false;
    var x0=Math.max(left,r.left),y0=Math.max(top,r.top),x1=Math.min(left+width,r.right),y1=Math.min(top+height,r.bottom);
    var owns=false;
    for(var p=node;p;p=p.parentElement){
      var s=root.getComputedStyle(p);if(!s||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||s.contentVisibility==='hidden'||Number(s.opacity)===0) return false;
      if(p===board) owns=true;
      var clipX=p!==node&&/^(auto|scroll|hidden|clip)$/.test(s.overflowX),clipY=p!==node&&/^(auto|scroll|hidden|clip)$/.test(s.overflowY);
      if(clipX||clipY){
        var b=typeof p.getBoundingClientRect==='function'?p.getBoundingClientRect():null;
        if(!b||![b.left,b.top,b.right,b.bottom].every(Number.isFinite)) return false;
        if(clipX){x0=Math.max(x0,b.left);x1=Math.min(x1,b.right);}
        if(clipY){y0=Math.max(y0,b.top);y1=Math.min(y1,b.bottom);}
      }
      if(x1<=x0||y1<=y0) return false;
    }
    return owns;
  }
  function tokenAttributes(grid,t,escape){
    if(!grid||!grid.id||!grid.encounter_id||!t||!t.id||!t.ref_char_id||
       !['pc','ally','npc'].includes(t.kind)||!Number.isInteger(t.col)||!Number.isInteger(t.row)||
       t.col<0||t.col>=20||t.row<0||t.row>=20||typeof escape!=='function'||
       (Array.isArray(t.flags)&&t.flags.some(function(f){return f==='hidden'||f==='invisible';}))) return '';
    return ' data-grid-touch-character="'+escape(String(t.ref_char_id))+'" data-grid-touch-token="'+escape(String(t.id))+
      '" data-grid-touch-grid="'+escape(String(grid.id))+'" data-grid-touch-encounter="'+escape(String(grid.encounter_id))+
      '" data-grid-touch-cell="'+String.fromCharCode(65+t.col)+(t.row+1)+'"';
  }
  function create(host){
    host=host||{};
    var sessions=new Map(), queue=[], busy=false, draft=null, submitted=null, results=new Map();
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
        s={token:opaque,kind:event.kind,context:Object.assign({},ctx),openedAt:at,selectedCell:null,sent:new Set()};
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
      var accepted=enqueue(submitted.session,'command_submitted',actionId,Date.now());
      if(accepted&&kind==='move'&&submitted.session.context.encounter_id){
        results.set(actionId,{session:submitted.session,actionId:actionId,resolved:false,checking:false,nextCheckAt:0});
        if(results.size>8) results.delete(results.keys().next().value);
      }
      return accepted;
    }
    function feedbackVisible(){
      if(!submitted) return false;
      var s=submitted; submitted=null;
      return enqueue(s.session,'feedback_visible',s.actionId,Date.now());
    }
    function renderStarted(){
      var c=typeof host.context==='function'?host.context():null, ready=[];
      results.forEach(function(r,id){
        var x=r.session.context;
        if(!validContext(c)||c.campaign_id!==x.campaign_id||c.group_no!==x.group_no||c.character_id!==x.character_id||Date.now()-r.session.openedAt>600000){results.delete(id);return;}
        if(r.resolved) ready.push(id);
      });
      return ready; // Only proofs observed BEFORE this render may certify its fresh token read.
    }
    function rendered(board,paint,ready){
      if(!paint||paint.fresh!==true||!Array.isArray(ready)||!board||board.isConnected!==true||
         (root.document&&root.document.visibilityState!=='visible')||typeof board.querySelectorAll!=='function') return false;
      var sent=false,c=typeof host.context==='function'?host.context():null;
      results.forEach(function(r,id){
        var x=r.session.context;
        if(!validContext(c)||c.campaign_id!==x.campaign_id||c.group_no!==x.group_no||c.character_id!==x.character_id||Date.now()-r.session.openedAt>600000) return;
        if(paint.campaign_id!==x.campaign_id||paint.group_no!==x.group_no||paint.encounter_id!==x.encounter_id) return;
        if(r.resolved&&ready.includes(id)){
          var matches=Array.from(board.querySelectorAll('[data-grid-touch-character]')).filter(function(node){
            return node.getAttribute('data-grid-touch-character')===x.character_id&&
              node.getAttribute('data-grid-touch-grid')===paint.grid_id&&node.getAttribute('data-grid-touch-encounter')===x.encounter_id;
          });
          if(matches.length!==1) return;
          var node=matches[0],rect=typeof node.getBoundingClientRect==='function'?node.getBoundingClientRect():null;
          var style=typeof root.getComputedStyle==='function'?root.getComputedStyle(node):null;
          if(!node.getAttribute('data-grid-touch-token')||node.getAttribute('data-grid-touch-cell')!==r.session.selectedCell||
             !rect||rect.width<=0||rect.height<=0||style&&(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)||!onScreen(node,board)) return;
          if(enqueue(r.session,'result_visible',id,Date.now())){results.delete(id);sent=true;}
          return;
        }
        if(r.resolved||r.checking||Date.now()<r.nextCheckAt||typeof host.resolvedAction!=='function') return;
        r.checking=true;r.nextCheckAt=Date.now()+3000;
        Promise.resolve().then(function(){return host.resolvedAction(Object.assign({},x,{action_id:id}));}).then(function(ok){
          if(ok===true&&results.get(id)===r){r.resolved=true;if(typeof host.onResolved==='function')host.onResolved();}
        }).catch(function(){fail('result_resolution_unavailable');}).finally(function(){r.checking=false;});
      });
      return sent;
    }
    return Object.freeze({note:note,leaseReenter:leaseReenter,submittedAction:submittedAction,
      feedbackVisible:feedbackVisible,renderStarted:renderStarted,rendered:rendered,pending:function(){return queue.length;}});
  }
  root.TTRPG_GRID_TOUCH_TELEMETRY=Object.freeze({create:create,tokenAttributes:tokenAttributes});
})(typeof window!=='undefined'?window:globalThis);
