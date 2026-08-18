/*
 * Grid command UI flow — pre-wire runtime module.
 *
 * This file is intentionally not loaded by campaign.html or beta.html yet.
 * It owns only synchronous picker state, stale-snapshot guards, and draft
 * creation. The existing command builder and server remain authoritative.
 *
 * language-impact: th+en — all player-visible status copy is paired.
 */
(function attachGridCommandFlow(root){
  'use strict';

  const BUILD='20260730-prewire-1';
  const CELL_COLUMNS='ABCDEFGHIJKLMNOPQRST';
  const IDENTITY_FIELDS=Object.freeze([
    'campaignId',
    'encounterId',
    'roundId',
    'groupNo',
    'gridId',
    'gridRevision'
  ]);
  const COPY=Object.freeze({
    th:Object.freeze({
      movePrompt:'🚶 แตะช่องสีเขียว แล้วกด ✓ ยืนยัน',
      aoePrompt:'🎯 แตะช่องศูนย์กลาง แล้วกด ✓ ยืนยันพื้นที่',
      chooseMove:'แตะช่องปลายทางก่อน',
      chooseAoe:'แตะช่องศูนย์กลางก่อน',
      invalidMove:'ช่องนี้ไม่อยู่ในพื้นที่เดินที่แสดง',
      invalidAoe:'ช่องนี้ใช้เป็นศูนย์กลางไม่ได้',
      stale:'สถานะการต่อสู้เปลี่ยนแล้ว — ยกเลิกตำแหน่งเก่า กรุณาเลือกใหม่',
      snapshotMissing:'กำลังเปิดแผนที่แบบปกติ เพราะข้อมูลกริดที่เตรียมไว้ยังไม่พร้อม',
      pickerUnavailable:'กำลังเปิดแผนที่แบบปกติ เพราะชั้นเลือกตำแหน่งยังไม่พร้อม',
      paintFailed:'กำลังเปิดแผนที่แบบปกติ เพราะอัปเดตตำแหน่งแบบทันทีไม่สำเร็จ',
      applyFailed:'ยังยืนยันตำแหน่งไม่ได้ — คำสั่งเดิมยังไม่ถูกเปลี่ยน',
      moveReady:'เลือกช่อง {cell} แล้ว ✓',
      aoeReady:'เลือกศูนย์กลาง {cell} แล้ว ✓',
      cancelled:'ยกเลิกการเลือกตำแหน่งแล้ว'
    }),
    en:Object.freeze({
      movePrompt:'🚶 Tap a green cell, then press ✓ to confirm.',
      aoePrompt:'🎯 Tap the center cell, then press ✓ to confirm the area.',
      chooseMove:'Choose a destination cell first.',
      chooseAoe:'Choose a center cell first.',
      invalidMove:'That cell is outside the displayed movement area.',
      invalidAoe:'That cell cannot be used as the area center.',
      stale:'Combat state changed — the old position was cancelled. Choose again.',
      snapshotMissing:'Opening the standard map because the prepared grid data is not ready.',
      pickerUnavailable:'Opening the standard map because the position picker is not ready.',
      paintFailed:'Opening the standard map because the instant position update failed.',
      applyFailed:'The position could not be confirmed — the existing command was not changed.',
      moveReady:'Cell {cell} selected ✓',
      aoeReady:'Center {cell} selected ✓',
      cancelled:'Position selection cancelled.'
    })
  });

  function isObject(value){
    return !!value&&typeof value==='object'&&!Array.isArray(value);
  }

  function finiteNumber(value){
    if(value===null||value===undefined||value==='') return null;
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  }

  function integerInRange(value,min,max){
    const n=Number(value);
    return Number.isInteger(n)&&n>=min&&n<=max?n:null;
  }

  function cleanText(value,maxLength){
    const text=String(value==null?'':value).trim();
    return text&&text.length<=maxLength?text:'';
  }

  function languageOf(value){
    return String(value||'').toLowerCase()==='en'?'en':'th';
  }

  function message(language,key,vars){
    let text=(COPY[languageOf(language)]&&COPY[languageOf(language)][key])||'';
    Object.entries(vars||{}).forEach(function(entry){
      text=text.split('{'+entry[0]+'}').join(String(entry[1]));
    });
    return text;
  }

  function cellLabel(c,r){
    c=integerInRange(c,0,CELL_COLUMNS.length-1);
    r=integerInRange(r,0,999);
    return c===null||r===null?'':CELL_COLUMNS[c]+String(r+1);
  }

  function normalizeIdentity(raw){
    const source=isObject(raw)&&isObject(raw.identity)?raw.identity:raw;
    if(!isObject(source)) return null;
    const identity={
      campaignId:cleanText(source.campaignId??source.campaign_id,200),
      encounterId:cleanText(source.encounterId??source.encounter_id,200),
      roundId:cleanText(source.roundId??source.round_id,200),
      groupNo:cleanText(source.groupNo??source.group_no,40),
      gridId:cleanText(source.gridId??source.grid_id,200),
      gridRevision:cleanText(
        source.gridRevision??source.grid_revision??source.revision??source.updated_at,
        240
      )
    };
    if(IDENTITY_FIELDS.some(function(field){ return !identity[field]; })) return null;
    return Object.freeze(identity);
  }

  function snapshotKey(raw){
    const identity=normalizeIdentity(raw);
    return identity?IDENTITY_FIELDS.map(function(field){
      return encodeURIComponent(identity[field]);
    }).join('|'):'';
  }

  function sameIdentity(left,right){
    const a=normalizeIdentity(left), b=normalizeIdentity(right);
    return !!a&&!!b&&IDENTITY_FIELDS.every(function(field){ return a[field]===b[field]; });
  }

  // GRID-G5 (2026-08-19): กติกาเดียวที่ตัดสินว่า identity ที่เปลี่ยนระหว่างผู้เล่นกำลังเลือกตำแหน่ง
  // "ยังเป็นกระดานเดิม" หรือไม่ — host ใช้ตัดสินระหว่าง re-enter อัตโนมัติ (ผู้เล่นไม่สะดุด)
  // กับ reset UI พร้อมบอกเหตุ · ตัวสัญญาของ invalidate()/prime() ไม่เปลี่ยน (พินไว้ใน golden เดิม)
  //   'same-board'      = campaign/encounter/round/group/grid เดิมทั้งหมด ต่างแค่ gridRevision (realtime token/grid หรือ bumpRevision ฝั่ง host)
  //   'different-board' = อย่างน้อยหนึ่งใน 5 ฟิลด์ผูกฉากเปลี่ยน ⇒ ตำแหน่งเก่าใช้ไม่ได้แน่นอน
  //   'unknown'         = อ่าน identity ฝั่งใดฝั่งหนึ่งไม่ได้ ⇒ ห้ามเดา ให้ผู้เรียกถือว่าไม่ต่อเนื่อง
  const CONTINUITY_FIELDS=Object.freeze(IDENTITY_FIELDS.filter(function(field){
    return field!=='gridRevision';
  }));

  function boardContinuity(previous,next){
    const a=normalizeIdentity(previous), b=normalizeIdentity(next);
    if(!a||!b) return 'unknown';
    return CONTINUITY_FIELDS.every(function(field){ return a[field]===b[field]; })
      ?'same-board'
      :'different-board';
  }

  function normalizeShape(raw){
    if(!isObject(raw)) return null;
    const kind=cleanText(raw.kind,20);
    if(kind==='polygon'){
      const points=cleanText(raw.points,4096);
      return points?Object.freeze({kind:'polygon',points:points}):null;
    }
    if(kind==='path'){
      const d=cleanText(raw.d,8192);
      return d?Object.freeze({kind:'path',d:d}):null;
    }
    if(kind==='rect'){
      const x=finiteNumber(raw.x), y=finiteNumber(raw.y);
      const width=finiteNumber(raw.width), height=finiteNumber(raw.height);
      if([x,y,width,height].some(function(value){ return value===null; })||width<=0||height<=0) return null;
      return Object.freeze({kind:'rect',x:x,y:y,width:width,height:height});
    }
    return null;
  }

  function normalizeCell(raw,cols,rows){
    if(!isObject(raw)) return null;
    const c=integerInRange(raw.c??raw.col,0,cols-1);
    const r=integerInRange(raw.r??raw.row,0,rows-1);
    if(c===null||r===null) return null;
    const centerX=finiteNumber(raw.centerX??raw.center_x);
    const centerY=finiteNumber(raw.centerY??raw.center_y);
    const shape=normalizeShape(raw.shape);
    return Object.freeze({
      c:c,
      r:r,
      cell:cellLabel(c,r),
      pickable:raw.pickable!==false,
      moveAllowed:raw.moveAllowed===true||raw.move_allowed===true,
      centerX:centerX,
      centerY:centerY,
      shape:shape
    });
  }

  function normalizeSnapshot(raw){
    if(!isObject(raw)) return null;
    const identity=normalizeIdentity(raw.identity||raw);
    const cols=integerInRange(raw.cols,1,CELL_COLUMNS.length);
    const rows=integerInRange(raw.rows,1,200);
    const cellFt=finiteNumber(raw.cellFt??raw.cell_ft);
    if(!identity||cols===null||rows===null||cellFt===null||cellFt<=0) return null;
    if(!Array.isArray(raw.cells)||!raw.cells.length) return null;
    const seen=new Set(), cells=[];
    raw.cells.forEach(function(item){
      const cell=normalizeCell(item,cols,rows);
      if(!cell||seen.has(cell.cell)) return;
      seen.add(cell.cell);
      cells.push(cell);
    });
    cells.sort(function(a,b){ return a.r-b.r||a.c-b.c; });
    if(!cells.length) return null;
    const originRaw=raw.origin;
    const origin=isObject(originRaw)?normalizeCell({
      c:originRaw.c??originRaw.col,
      r:originRaw.r??originRaw.row,
      pickable:true
    },cols,rows):null;
    return Object.freeze({
      identity:identity,
      key:snapshotKey(identity),
      cols:cols,
      rows:rows,
      cellFt:cellFt,
      cells:Object.freeze(cells),
      origin:origin
    });
  }

  function parseAreaTarget(target,radiusFt){
    const text=cleanText(target,100).toLowerCase();
    const match=/^(sphere|cone|line|cube|square|cylinder)_?(\d+)/.exec(text);
    const shape=match?match[1]:'sphere';
    const parsed=finiteNumber(radiusFt??(match&&match[2]));
    return Object.freeze({
      shape:shape,
      radiusFt:parsed===null?20:Math.max(0,Math.min(1000,parsed)),
      policy:'legacy-chebyshev-v1'
    });
  }

  function normalizeRequest(raw){
    if(!isObject(raw)) return null;
    const kind=raw.kind==='move'||raw.kind==='aoe'?raw.kind:null;
    if(!kind) return null;
    return Object.freeze({
      kind:kind,
      language:languageOf(raw.language),
      commandKey:cleanText(raw.commandKey??raw.command_key,120),
      requestToken:cleanText(raw.requestToken??raw.request_token,200),
      area:kind==='aoe'?parseAreaTarget(raw.target,raw.radiusFt??raw.radius_ft):null
    });
  }

  function affectedCells(snapshot,center,radiusFt){
    if(!snapshot||!center) return Object.freeze([]);
    const radius=Math.max(0,Math.round(Number(radiusFt||0)/snapshot.cellFt));
    return Object.freeze(snapshot.cells.filter(function(cell){
      return Math.max(Math.abs(cell.c-center.c),Math.abs(cell.r-center.r))<=radius;
    }).map(function(cell){ return cell.cell; }));
  }

  function isThenable(value){
    return !!value&&(typeof value==='object'||typeof value==='function')&&typeof value.then==='function';
  }

  function freezeResult(value){
    return Object.freeze(value);
  }

  function createController(adapter){
    if(!isObject(adapter)) throw new TypeError('grid-flow-adapter-required');
    ['readIdentity','mountPicker','paintSelection','applyDraft'].forEach(function(name){
      if(typeof adapter[name]!=='function') throw new TypeError('grid-flow-adapter-'+name+'-required');
    });

    let snapshot=null;
    let active=null;
    let lastDraft=null;
    let sequence=0;

    function callOptional(name,arg){
      if(typeof adapter[name]!=='function') return undefined;
      try{ return adapter[name](arg); }catch(error){ return error; }
    }

    function emit(type,detail){
      let at=Date.now();
      try{ if(typeof adapter.now==='function') at=adapter.now(); }catch(error){}
      callOptional('onEvent',Object.freeze(Object.assign({
        type:type,
        at:at
      },detail||{})));
    }

    function announce(session,key,level,vars){
      const text=message(session&&session.request?session.request.language:'th',key,vars);
      callOptional('announce',Object.freeze({
        key:key,
        level:level||'info',
        text:text,
        sessionId:session?session.id:null
      }));
      return text;
    }

    function unmount(session,reason){
      callOptional('unmountPicker',Object.freeze({
        sessionId:session?session.id:null,
        reason:reason
      }));
    }

    function requestFallback(session,reason){
      if(session&&session.fallbackRequested) return false;
      if(session) session.fallbackRequested=true;
      const key=reason==='snapshot-missing'||reason==='snapshot-stale'?'snapshotMissing':
        (reason==='paint-failed'?'paintFailed':'pickerUnavailable');
      announce(session,key,'warn');
      callOptional('requestFallback',Object.freeze({
        reason:reason,
        request:session?session.request:null,
        sessionId:session?session.id:null
      }));
      emit('fallback-requested',{reason:reason,sessionId:session?session.id:null});
      return true;
    }

    function readCurrentIdentity(){
      try{ return normalizeIdentity(adapter.readIdentity()); }catch(error){ return null; }
    }

    function deactivateStale(session,reason){
      if(!session||!active||active.id!==session.id) return false;
      active=null;
      unmount(session,reason);
      callOptional('resumeCommandMenu',Object.freeze({
        reason:reason,
        cancelled:true,
        sessionId:session.id
      }));
      announce(session,'stale','error');
      emit('picker-invalidated',{reason:reason,sessionId:session.id});
      return true;
    }

    function ensureFresh(session){
      if(!session||!active||active.id!==session.id) return false;
      const current=readCurrentIdentity();
      if(!current||!sameIdentity(current,session.snapshot.identity)){
        deactivateStale(session,'context-changed');
        return false;
      }
      return true;
    }

    function prime(raw){
      const next=normalizeSnapshot(raw);
      if(!next) return freezeResult({ok:false,reason:'invalid-snapshot'});
      if(active&&!sameIdentity(active.snapshot.identity,next.identity)){
        deactivateStale(active,'snapshot-replaced');
      }
      snapshot=next;
      emit('snapshot-primed',{key:next.key});
      return freezeResult({ok:true,key:next.key,snapshot:next});
    }

    function clearSnapshot(identity){
      if(identity&&snapshot&&!sameIdentity(identity,snapshot.identity)){
        return freezeResult({ok:false,reason:'identity-mismatch'});
      }
      if(active) deactivateStale(active,'snapshot-cleared');
      snapshot=null;
      emit('snapshot-cleared',{});
      return freezeResult({ok:true});
    }

    function select(rawCell,sessionId){
      const session=active;
      if(!session||sessionId!==undefined&&session.id!==sessionId){
        return freezeResult({ok:false,reason:'stale-session'});
      }
      if(!ensureFresh(session)) return freezeResult({ok:false,reason:'context-changed'});
      const c=integerInRange(rawCell&&rawCell.c,0,session.snapshot.cols-1);
      const r=integerInRange(rawCell&&rawCell.r,0,session.snapshot.rows-1);
      const label=c===null||r===null?'':cellLabel(c,r);
      const cell=label?session.snapshot.cells.find(function(item){ return item.cell===label; }):null;
      const allowed=!!cell&&(session.request.kind==='move'?cell.moveAllowed:cell.pickable);
      if(!allowed){
        announce(session,session.request.kind==='move'?'invalidMove':'invalidAoe','error');
        emit('selection-rejected',{reason:'cell-not-allowed',sessionId:session.id,cell:label});
        return freezeResult({ok:false,reason:'cell-not-allowed'});
      }
      const selection=Object.freeze({c:cell.c,r:cell.r,cell:cell.cell});
      let painted;
      try{
        painted=adapter.paintSelection(Object.freeze({
          sessionId:session.id,
          kind:session.request.kind,
          request:session.request,
          snapshot:session.snapshot,
          selection:selection,
          affected:session.request.kind==='aoe'
            ?affectedCells(session.snapshot,selection,session.request.area.radiusFt)
            :Object.freeze([])
        }));
      }catch(error){
        painted=false;
      }
      if(painted===false||isThenable(painted)){
        active=null;
        unmount(session,'paint-failed');
        requestFallback(session,'paint-failed');
        return freezeResult({ok:false,reason:'paint-failed',fallback:true});
      }
      session.selection=selection;
      emit('selection-changed',{sessionId:session.id,kind:session.request.kind,cell:selection.cell});
      return freezeResult({ok:true,selection:selection});
    }

    function makeDraft(session){
      const base={
        schemaVersion:1,
        source:'grid-command-flow',
        kind:session.request.kind,
        identity:session.snapshot.identity,
        commandKey:session.request.commandKey,
        requestToken:session.request.requestToken
      };
      if(session.request.kind==='move'){
        base.destination=session.selection;
      }else{
        base.area=Object.freeze({
          shape:session.request.area.shape,
          radiusFt:session.request.area.radiusFt,
          policy:session.request.area.policy,
          center:session.selection,
          cells:affectedCells(session.snapshot,session.selection,session.request.area.radiusFt)
        });
      }
      return Object.freeze(base);
    }

    function confirm(sessionId){
      const session=active;
      if(!session||sessionId!==undefined&&session.id!==sessionId){
        return freezeResult({ok:false,reason:'stale-session'});
      }
      if(!ensureFresh(session)) return freezeResult({ok:false,reason:'context-changed'});
      if(!session.selection){
        announce(session,session.request.kind==='move'?'chooseMove':'chooseAoe','error');
        return freezeResult({ok:false,reason:'selection-required'});
      }
      const draft=makeDraft(session);
      let applied;
      try{ applied=adapter.applyDraft(draft); }catch(error){ applied=false; }
      if(applied===false||isThenable(applied)){
        announce(session,'applyFailed','error');
        emit('draft-apply-failed',{sessionId:session.id,kind:session.request.kind});
        return freezeResult({ok:false,reason:'apply-failed'});
      }
      lastDraft=draft;
      active=null;
      unmount(session,'confirmed');
      callOptional('resumeCommandMenu',Object.freeze({
        reason:'confirmed',
        cancelled:false,
        sessionId:session.id,
        draft:draft
      }));
      announce(
        session,
        session.request.kind==='move'?'moveReady':'aoeReady',
        'success',
        {cell:session.selection.cell}
      );
      emit('draft-ready',{sessionId:session.id,kind:session.request.kind,cell:session.selection.cell});
      return freezeResult({ok:true,draft:draft});
    }

    function cancel(reason,sessionId){
      const session=active;
      if(!session||sessionId!==undefined&&session.id!==sessionId){
        return freezeResult({ok:false,reason:'stale-session'});
      }
      active=null;
      unmount(session,reason||'cancelled');
      callOptional('resumeCommandMenu',Object.freeze({
        reason:reason||'cancelled',
        cancelled:true,
        sessionId:session.id
      }));
      announce(session,'cancelled','info');
      emit('picker-cancelled',{reason:reason||'cancelled',sessionId:session.id});
      return freezeResult({ok:true});
    }

    function open(rawRequest){
      const request=normalizeRequest(rawRequest);
      if(!request) return freezeResult({ok:false,reason:'invalid-request'});
      if(active){
        const replaced=active;
        active=null;
        unmount(replaced,'replaced');
      }
      const session={
        id:++sequence,
        request:request,
        snapshot:snapshot,
        selection:null,
        fallbackRequested:false
      };
      const current=readCurrentIdentity();
      if(!snapshot){
        requestFallback(session,'snapshot-missing');
        return freezeResult({ok:false,reason:'snapshot-missing',fallback:true});
      }
      session.snapshot=snapshot;
      if(!current||!sameIdentity(current,snapshot.identity)){
        requestFallback(session,'snapshot-stale');
        return freezeResult({ok:false,reason:'snapshot-stale',fallback:true});
      }
      active=session;
      const handlers=Object.freeze({
        select:function(cell){ return select(cell,session.id); },
        confirm:function(){ return confirm(session.id); },
        cancel:function(){ return cancel('user',session.id); }
      });
      let mounted;
      try{
        mounted=adapter.mountPicker(Object.freeze({
          sessionId:session.id,
          kind:request.kind,
          request:request,
          snapshot:snapshot,
          handlers:handlers
        }));
      }catch(error){
        mounted=false;
      }
      if(mounted===false||isThenable(mounted)){
        active=null;
        unmount(session,'picker-unavailable');
        requestFallback(session,'picker-unavailable');
        return freezeResult({ok:false,reason:'picker-unavailable',fallback:true});
      }
      callOptional('closeCommandSheet',Object.freeze({
        reason:'picker-opened',
        sessionId:session.id
      }));
      announce(session,request.kind==='move'?'movePrompt':'aoePrompt','info');
      emit('picker-opened',{sessionId:session.id,kind:request.kind,key:snapshot.key});
      return freezeResult({ok:true,sessionId:session.id,handlers:handlers});
    }

    function invalidate(nextIdentity,reason){
      if(!active) return freezeResult({ok:false,reason:'no-active-picker'});
      if(nextIdentity&&sameIdentity(nextIdentity,active.snapshot.identity)){
        return freezeResult({ok:false,reason:'identity-unchanged'});
      }
      const session=active;
      deactivateStale(session,reason||'external-invalidation');
      return freezeResult({ok:true});
    }

    function state(){
      return Object.freeze({
        phase:active?'picking':'idle',
        sessionId:active?active.id:null,
        kind:active?active.request.kind:null,
        selection:active?active.selection:null,
        snapshotKey:snapshot?snapshot.key:'',
        lastDraft:lastDraft
      });
    }

    return Object.freeze({
      build:BUILD,
      prime:prime,
      clearSnapshot:clearSnapshot,
      open:open,
      select:select,
      confirm:confirm,
      cancel:cancel,
      invalidate:invalidate,
      state:state,
      readLastDraft:function(){ return lastDraft; }
    });
  }

  root.TTRPG_GRID_COMMAND_FLOW=Object.freeze({
    build:BUILD,
    copy:COPY,
    message:message,
    cellLabel:cellLabel,
    normalizeIdentity:normalizeIdentity,
    normalizeSnapshot:normalizeSnapshot,
    snapshotKey:snapshotKey,
    sameIdentity:sameIdentity,
    boardContinuity:boardContinuity,
    parseAreaTarget:parseAreaTarget,
    affectedCells:affectedCells,
    createController:createController
  });
})(globalThis);
