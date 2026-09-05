/*
 * W102 "Dice center stage" — pure stage state machine + thin DOM adapter.
 *
 * The server has already committed every die face before this module sees a
 * batch. The stage only sequences WHEN the player sees them: freeze with idle
 * dice → the player presses → the existing DiceFx/Canvas animation lands on
 * the server faces → result card → acknowledge → the round's content is
 * released. There is no random source of any kind here: the module never
 * invents, reorders or reveals a value; it only owns timers, holds and chrome.
 *
 * language-impact: th+en — every module-owned string goes through the injected
 * copy(th,en) localizer (uiCopy in campaign.html); numbers/counters are neutral.
 */
(function attachDiceStage(){
  'use strict';

  const BUILD='20260905-w102-center-stage-r1';
  const DICE_PREROLL_AUTO_MS=20000;   // no press → the stage rolls on its own
  const DICE_HOLD_MAX_MS=8000;        // content that arrives before the dice batch waits at most this long
  const DICE_STAGE_TOTAL_MS=35000;    // whole freeze budget with zero input (preroll + roll + result)
  const DICE_STAGE_ACK_MIN_MS=1200;   // a result is always visible at least this long
  const DICE_STAGE_ACK_MAX_MS=25000;  // mirrors DICE_RESULT_ACK_AUTO_MS in campaign.html
  const DICE_STAGE_TICK_MS=1000;
  const MAX_GLYPHS=6;
  const OWN_LOG_ENTRY_TYPES=Object.freeze(['attack','damage','save','check','initiative','heal']);
  const REASONS=Object.freeze({
    armed:'stage_armed',pressed:'stage_pressed',prerollAuto:'stage_preroll_auto',hiddenRelease:'stage_hidden_release',
    holdStarted:'stage_hold_started',holdTimeout:'stage_hold_timeout',holdAdopted:'stage_hold_adopted',holdSettled:'stage_hold_settled',
    sequenceDone:'stage_sequence_done',released:'stage_released',toggleOff:'stage_toggle_off',errorFailOpen:'stage_error_fail_open',
    playerEscape:'stage_player_escape',superseded:'stage_superseded',spectator:'stage_spectator_skip',viewUnavailable:'stage_view_unavailable'
  });

  function finiteNumber(value){ const number=Number(value); return Number.isFinite(number)?number:null; }
  function clampMs(value,min,max){ const number=finiteNumber(value); return number===null?min:Math.max(min,Math.min(max,Math.round(number))); }
  function safeCall(callback,argument){ if(typeof callback!=='function')return false; try{ callback(argument); return true; }catch(error){ return false; } }
  function dieKind(value){
    const key=String(value||'').toLowerCase();
    return /^d(?:4|6|8|10|12|20)$/.test(key)?key:'raw';
  }

  // ── pure planning ──────────────────────────────────────────────────────
  function stageGlyphs(event){
    let kinds=[];
    if(event&&Array.isArray(event.dice)&&event.dice.length) kinds=event.dice.map(function(die){ return dieKind(die&&die.die); });
    else if(event&&Array.isArray(event.rawValues)&&event.rawValues.length) kinds=event.rawValues.map(function(){ return 'raw'; });
    else kinds=['d20'];
    return Object.freeze({kinds:Object.freeze(kinds.slice(0,MAX_GLYPHS)),collapsed:Math.max(0,kinds.length-MAX_GLYPHS),count:kinds.length});
  }
  function planStageBatch(events){
    const list=Array.isArray(events)?events.filter(function(event){ return event&&typeof event==='object'&&!Array.isArray(event); }):[];
    const own=list.filter(function(event){ return event.pressToRoll===true; });
    const first=list[0]||null;
    const queueTotal=first&&Number.isInteger(first.queueTotal)&&first.queueTotal>0?first.queueTotal:list.length;
    return Object.freeze({
      arm:own.length>0,
      ownCount:own.length,
      total:list.length,
      queueTotal:queueTotal,
      label:String(first&&first.label||'').slice(0,320),
      glyphs:stageGlyphs(first)
    });
  }
  function ackBudgetMs(armedAt,now){
    const elapsed=Math.max(0,(finiteNumber(now)||0)-(finiteNumber(armedAt)||0));
    return clampMs(DICE_STAGE_TOTAL_MS-elapsed,DICE_STAGE_ACK_MIN_MS,DICE_STAGE_ACK_MAX_MS);
  }
  function countdownSeconds(armedAt,now){
    return Math.max(0,Math.ceil(((finiteNumber(armedAt)||0)+DICE_PREROLL_AUTO_MS-(finiteNumber(now)||0))/1000));
  }
  function ownBattleLogRow(row,ownKey,keyOf){
    if(!row||typeof row!=='object'||!ownKey)return false;
    if(!OWN_LOG_ENTRY_TYPES.includes(String(row.entry_type||'').toLowerCase()))return false;
    const actor=typeof keyOf==='function'?keyOf(row.actor_name):String(row.actor_name||'').trim().toLowerCase();
    return !!actor&&actor===ownKey;
  }

  // ── pure state machine (timers injected) ───────────────────────────────
  function createStageMachine(deps){
    const d=deps&&typeof deps==='object'?deps:{};
    const now=function(){ try{ const value=Number(typeof d.now==='function'?d.now():Date.now()); return Number.isFinite(value)?value:0; }catch(error){ return 0; } };
    const setTimer=function(callback,delay){ try{ return typeof d.setTimer==='function'?d.setTimer(callback,delay):setTimeout(callback,delay); }catch(error){ return null; } };
    const clearTimer=function(id){ if(id===null||id===undefined)return; try{ if(typeof d.clearTimer==='function')d.clearTimer(id); else clearTimeout(id); }catch(error){} };
    const emit=function(name,payload){ safeCall(d[name],payload); };
    const state={phase:'idle',key:'',armedAt:null,pressedAt:null,pressedBy:'',jobsActive:0,sequenceDone:false,holdActive:false,skipping:false,lastReason:''};
    const preHolds=new Map();
    let prerollTimer=null,tickTimer=null,closeTimer=null;
    function open(){ return state.phase!=='idle'&&state.phase!=='released'; }
    function log(reason,extra){ state.lastReason=reason; emit('onLog',Object.assign({source:'diceStage',reason_code:reason,phase:state.phase,key:state.key},extra||{})); }
    function clearStageTimers(){ clearTimer(prerollTimer); prerollTimer=null; clearTimer(tickTimer); tickTimer=null; clearTimer(closeTimer); closeTimer=null; }
    // The adapter disposes a finished job before it mounts the next queued one, so "no active job" is re-checked one tick later.
    function scheduleCloseCheck(){ if(closeTimer!==null)return; closeTimer=setTimer(function(){ closeTimer=null; if(open()&&state.jobsActive===0&&state.sequenceDone&&!state.skipping)close(REASONS.sequenceDone); },0); }
    function tick(){ tickTimer=null; if(state.phase!=='armed')return; emit('onTick',countdownSeconds(state.armedAt,now())); tickTimer=setTimer(tick,DICE_STAGE_TICK_MS); }
    function arm(key){
      if(open())return false;
      state.phase='armed'; state.key=String(key||''); state.armedAt=now(); state.pressedAt=null; state.pressedBy=''; state.jobsActive=0; state.sequenceDone=false; state.holdActive=true;
      prerollTimer=setTimer(function(){ prerollTimer=null; press('auto',REASONS.prerollAuto); },DICE_PREROLL_AUTO_MS);
      tickTimer=setTimer(tick,DICE_STAGE_TICK_MS);
      log(REASONS.armed); emit('onHoldsChanged'); return true;
    }
    function press(source,reason){
      if(state.phase!=='armed')return false;
      clearStageTimers(); state.phase='rolling'; state.pressedAt=now(); state.pressedBy=source==='player'?'player':'auto';
      log(reason||REASONS.pressed,{pressed_by_player:state.pressedBy==='player'}); emit('onPress',state.pressedBy); return true;
    }
    function jobStarted(){ if(!open())return false; if(state.phase==='armed')clearStageTimers(); state.jobsActive++; state.phase='rolling'; return true; }
    function jobResult(){ if(state.phase!=='rolling')return false; state.phase='result'; return true; }
    function jobDisposed(){
      if(!open())return false;
      state.jobsActive=Math.max(0,state.jobsActive-1);
      if(state.jobsActive===0)state.phase='acked';
      if(state.jobsActive===0&&state.sequenceDone&&!state.skipping)scheduleCloseCheck();
      return true;
    }
    function sequenceDone(key){
      if(!open()||String(key||'')!==state.key)return false;
      state.sequenceDone=true; if(state.jobsActive===0&&!state.skipping)scheduleCloseCheck(); return true;
    }
    function releaseHolds(reason){ if(!state.holdActive)return false; state.holdActive=false; log(reason||REASONS.released); emit('onHoldsChanged'); return true; }
    function close(reason){
      if(!open())return false;
      clearStageTimers(); const hadHold=state.holdActive, key=state.key, why=reason||REASONS.released;
      state.phase='released'; state.holdActive=false; log(why,{closed_key:key}); emit('onClose',{reason:why,key:key});
      state.phase='idle'; state.key=''; state.sequenceDone=false; state.jobsActive=0;
      if(hadHold)emit('onHoldsChanged'); return true;
    }
    function skip(reason){
      if(!open()||state.skipping)return false;
      const why=reason||REASONS.playerEscape; clearStageTimers(); state.skipping=true;
      try{ emit('onSkip',{reason:why,key:state.key}); }finally{ state.skipping=false; }   // jobs completed by the adapter during onSkip must not auto-close with another reason
      return close(why);
    }
    function hidden(){
      if(!open())return false;
      emit('onHiddenRelease',{key:state.key}); releaseHolds(REASONS.hiddenRelease);
      if(state.phase==='armed')press('auto',REASONS.hiddenRelease); return true;
    }
    function preHoldId(kind,key){ return String(kind||'')+':'+String(key||''); }
    function preHold(kind,key){
      const id=preHoldId(kind,key); if(!kind||preHolds.has(id))return false;
      const entry={kind:String(kind),key:String(key||''),startedAt:now(),timer:null};
      entry.timer=setTimer(function(){ if(preHolds.get(id)!==entry)return; preHolds.delete(id); log(REASONS.holdTimeout,{hold_kind:entry.kind,hold_key:entry.key}); emit('onPreHoldEnd',entry); emit('onHoldsChanged'); },DICE_HOLD_MAX_MS);
      preHolds.set(id,entry); log(REASONS.holdStarted,{hold_kind:entry.kind,hold_key:entry.key}); emit('onHoldsChanged'); return true;
    }
    function endPreHold(kind,key,reason){
      const id=preHoldId(kind,key), entry=preHolds.get(id); if(!entry)return false;
      clearTimer(entry.timer); preHolds.delete(id); log(reason||REASONS.holdSettled,{hold_kind:entry.kind,hold_key:entry.key});
      emit('onPreHoldEnd',entry); emit('onHoldsChanged'); return true;
    }
    function endPreHoldsOfKind(kind,reason){ let ended=0; Array.from(preHolds.values()).forEach(function(entry){ if(entry.kind===kind&&endPreHold(entry.kind,entry.key,reason))ended++; }); return ended; }
    function preHoldActive(kind,key){ if(key===undefined){ return Array.from(preHolds.values()).some(function(entry){ return entry.kind===kind; }); } return preHolds.has(preHoldId(kind,key)); }
    function holdsRound(key){ const id=String(key||''); return (state.holdActive&&!!id&&id===state.key)||preHoldActive('narration',id); }
    function holdsBattleLog(){ return state.holdActive||preHoldActive('battleLog'); }
    function snapshot(){
      return Object.freeze({phase:state.phase,key:state.key,armedAt:state.armedAt,pressedAt:state.pressedAt,pressedBy:state.pressedBy,jobsActive:state.jobsActive,sequenceDone:state.sequenceDone,holdActive:state.holdActive,lastReason:state.lastReason,preHolds:Object.freeze(Array.from(preHolds.keys()))});
    }
    function reset(){ clearStageTimers(); preHolds.forEach(function(entry){ clearTimer(entry.timer); }); preHolds.clear(); state.phase='idle'; state.key=''; state.armedAt=null; state.pressedAt=null; state.pressedBy=''; state.jobsActive=0; state.sequenceDone=false; state.holdActive=false; state.skipping=false; state.lastReason=''; }
    return Object.freeze({
      arm:arm,press:press,jobStarted:jobStarted,jobResult:jobResult,jobDisposed:jobDisposed,sequenceDone:sequenceDone,releaseHolds:releaseHolds,close:close,skip:skip,hidden:hidden,
      preHold:preHold,endPreHold:endPreHold,endPreHoldsOfKind:endPreHoldsOfKind,preHoldActive:preHoldActive,holdsRound:holdsRound,holdsBattleLog:holdsBattleLog,
      isOpen:open,pressed:function(){ return open()&&state.phase!=='armed'?state.pressedBy||'auto':null; },
      ackBudget:function(){ return open()&&state.armedAt!==null?ackBudgetMs(state.armedAt,now()):null; },
      countdown:function(){ return state.phase==='armed'?countdownSeconds(state.armedAt,now()):null; },
      snapshot:snapshot,reset:reset
    });
  }

  // ── thin DOM adapter ───────────────────────────────────────────────────
  function glyphPoints(kind){
    if(kind==='d4') return '50,5 96,91 4,91';
    if(kind==='d8') return '50,3 94,50 50,97 6,50';
    if(kind==='d10') return '50,3 91,31 84,82 50,97 16,82 9,31';
    if(kind==='d12') return '50,3 86,16 98,52 77,91 23,91 2,52 14,16';
    if(kind==='d20') return '50,2 88,20 98,58 72,96 28,96 2,58 12,20';
    return '';
  }
  function injectStyles(documentRef){
    if(!documentRef||!documentRef.createElement)return false;
    if(documentRef.getElementById&&documentRef.getElementById('dice-stage-style'))return true;
    const style=documentRef.createElement('style'); style.id='dice-stage-style';
    style.textContent='\n'+
      '[data-dice-stage]{position:fixed;inset:0;z-index:2147482040;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:rgba(6,10,16,.6);pointer-events:auto}\n'+
      '.dstage-panel{position:relative;width:min(94vw,560px);max-height:calc(100vh - 24px);overflow:auto;display:flex;flex-direction:column;align-items:center;gap:10px;box-sizing:border-box;padding:16px 12px 18px;border:3px double #8b602f;border-radius:14px;background:linear-gradient(145deg,#f4e4bd,#d9bd82);color:#2a1a0d;text-align:center;box-shadow:0 18px 44px rgba(10,6,2,.5),inset 0 0 0 2px rgba(255,250,226,.55);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}\n'+
      '.dstage-title{margin-top:18px;font-size:var(--fs-lg,18px);font-weight:800;line-height:1.4}\n'+
      '.dstage-label{max-width:100%;font-size:var(--fs-base,14px);line-height:1.45;opacity:.85;overflow-wrap:anywhere}\n'+
      '.dstage-dice{position:relative;width:min(92vw,520px);max-width:100%;min-height:330px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border-radius:12px;background:rgba(28,16,7,.32)}\n'+
      '.dstage-glyphs{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:10px 14px;padding:12px}\n'+
      '.dstage-glyph{width:clamp(56px,16vw,88px);height:clamp(56px,16vw,88px);color:#f8edce;animation:dstage-idle 1.6s ease-in-out infinite}\n'+
      '.dstage-glyph:nth-child(2n){animation-delay:-.5s}.dstage-glyph:nth-child(3n){animation-delay:-1s}\n'+
      '.dstage-glyph svg{display:block;width:100%;height:100%;overflow:visible}\n'+
      '.dstage-glyph .dstage-shell{fill:#322316;stroke:#d9b978;stroke-width:4;stroke-linejoin:round}\n'+
      '.dstage-glyph text{fill:currentColor;font:700 30px Georgia,serif;text-anchor:middle;dominant-baseline:middle}\n'+
      '.dstage-collapse{padding:6px 10px;border:1px solid rgba(90,60,25,.7);border-radius:999px;color:#2a1a0d;font-weight:800}\n'+
      '.dstage-result{width:min(92vw,520px);max-width:100%;display:flex;flex-direction:column;align-items:center;gap:8px}\n'+
      '.dstage-result:empty{display:none}\n'+
      '.dstage-roll{min-width:220px;min-height:62px;padding:12px 26px;border:3px solid #2f1c0d;border-radius:12px;background:#3b2412;color:#fff2cf;font:800 var(--fs-lg,18px)/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 6px 0 #170d06;touch-action:manipulation;cursor:pointer}\n'+
      '.dstage-roll:active{transform:translateY(3px);box-shadow:0 3px 0 #170d06}.dstage-roll:focus-visible{outline:3px solid #fff0a8;outline-offset:3px}\n'+
      '.dstage-hint{font-size:var(--fs-sm,12px);line-height:1.45;opacity:.78}\n'+
      '.dstage-escape{position:absolute;top:8px;right:8px;padding:5px 10px;border:1px solid rgba(80,50,20,.6);border-radius:8px;background:rgba(255,250,236,.6);color:#3a2612;font:600 var(--fs-sm,12px)/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}\n'+
      '.dstage-status{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}\n'+
      '[data-dice-stage]:not([data-dice-stage-phase="armed"]) .dstage-roll,[data-dice-stage]:not([data-dice-stage-phase="armed"]) .dstage-hint,[data-dice-stage]:not([data-dice-stage-phase="armed"]) .dstage-glyphs{display:none}\n'+
      '@keyframes dstage-idle{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}\n'+
      '@media (prefers-reduced-motion:reduce){.dstage-glyph{animation:none}}\n'+
      '@media (max-width:480px){.dstage-panel{padding:14px 8px 16px}.dstage-glyph{width:clamp(48px,18vw,72px);height:clamp(48px,18vw,72px)}}';
    const target=documentRef.head||documentRef.documentElement||documentRef.body;
    if(!target||!target.appendChild)return false;
    target.appendChild(style); return true;
  }
  function createGlyph(documentRef,kind){
    const holder=documentRef.createElement('div'); holder.className='dstage-glyph'; holder.setAttribute('data-dice-stage-glyph',kind);
    const svgNs='http://www.w3.org/2000/svg';
    if(typeof documentRef.createElementNS==='function'){
      const svg=documentRef.createElementNS(svgNs,'svg'); svg.setAttribute('viewBox','0 0 100 100'); svg.setAttribute('aria-hidden','true');
      const points=glyphPoints(kind), shell=documentRef.createElementNS(svgNs,points?'polygon':'rect'); shell.setAttribute('class','dstage-shell');
      if(points) shell.setAttribute('points',points);
      else { shell.setAttribute('x','8'); shell.setAttribute('y','8'); shell.setAttribute('width','84'); shell.setAttribute('height','84'); shell.setAttribute('rx','10'); }
      const text=documentRef.createElementNS(svgNs,'text'); text.setAttribute('x','50'); text.setAttribute('y','54'); text.textContent='?';
      svg.appendChild(shell); svg.appendChild(text); holder.appendChild(svg);
    } else holder.textContent='?';
    return holder;
  }
  function mountStageView(documentRef,model){
    if(!documentRef||!documentRef.body||!documentRef.createElement||!injectStyles(documentRef))return null;
    const source=model&&typeof model==='object'?model:{};
    const focusOrigin=documentRef.activeElement&&typeof documentRef.activeElement.focus==='function'?documentRef.activeElement:null;
    const overlay=documentRef.createElement('div'); overlay.setAttribute('data-dice-stage','1'); overlay.setAttribute('data-dice-stage-phase','armed'); overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label',String(source.title||''));
    const panel=documentRef.createElement('div'); panel.className='dstage-panel';
    const escape=documentRef.createElement('button'); escape.type='button'; escape.className='dstage-escape'; escape.setAttribute('data-dice-stage-escape','1'); escape.textContent=String(source.escapeLabel||''); escape.onclick=function(){ safeCall(source.onEscape); };
    const title=documentRef.createElement('div'); title.className='dstage-title'; title.textContent=String(source.title||'');
    const label=documentRef.createElement('div'); label.className='dstage-label'; label.setAttribute('data-dice-stage-label','1'); label.textContent=String(source.label||'');
    const dice=documentRef.createElement('div'); dice.className='dstage-dice'; dice.setAttribute('data-dice-stage-dice','1');
    const glyphs=documentRef.createElement('div'); glyphs.className='dstage-glyphs'; glyphs.setAttribute('aria-hidden','true');
    const kinds=source.glyphs&&Array.isArray(source.glyphs.kinds)?source.glyphs.kinds:['d20'];
    kinds.forEach(function(kind){ glyphs.appendChild(createGlyph(documentRef,kind)); });
    if(source.glyphs&&source.glyphs.collapsed>0){ const more=documentRef.createElement('span'); more.className='dstage-collapse'; more.textContent='+'+String(source.glyphs.collapsed); glyphs.appendChild(more); }
    dice.appendChild(glyphs);
    const result=documentRef.createElement('div'); result.className='dstage-result'; result.setAttribute('data-dice-stage-result','1');
    const roll=documentRef.createElement('button'); roll.type='button'; roll.className='dstage-roll'; roll.setAttribute('data-dice-stage-roll','1'); roll.textContent=String(source.buttonLabel||''); roll.onclick=function(){ safeCall(source.onPress); };
    const hint=documentRef.createElement('div'); hint.className='dstage-hint'; hint.setAttribute('data-dice-stage-hint','1'); hint.textContent=String(source.hint||'');
    const status=documentRef.createElement('div'); status.className='dstage-status'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
    panel.appendChild(escape); panel.appendChild(title); panel.appendChild(label); panel.appendChild(dice); panel.appendChild(result); panel.appendChild(roll); panel.appendChild(hint); panel.appendChild(status);
    overlay.appendChild(panel); documentRef.body.appendChild(overlay);
    try{ roll.focus({preventScroll:true}); }catch(error){}
    let closed=false;
    return Object.freeze({
      overlay:overlay,diceHost:dice,resultHost:result,rollButton:roll,
      setHint:function(text){ hint.textContent=String(text||''); },
      setPhase:function(phase,statusText){ overlay.setAttribute('data-dice-stage-phase',String(phase||'')); if(statusText!==undefined)status.textContent=String(statusText||''); },
      close:function(){ if(closed)return false; closed=true; try{ overlay.remove(); }catch(error){ try{ if(overlay.parentNode)overlay.parentNode.removeChild(overlay); }catch(removeError){} } try{ if(focusOrigin&&focusOrigin.isConnected!==false)focusOrigin.focus({preventScroll:true}); }catch(error){} return true; }
    });
  }

  // ── runtime (campaign.html adapter surface) ────────────────────────────
  let deps=null, machine=null, view=null, initialized=false, currentKey='', batchSeq=0, armedCallbacks=null, adoptedToken=null, releasing=false, visibilityBound=false, lastToggleLogKey='';
  const preHoldTokens=new Map();

  function documentRef(){ try{ return deps&&deps.document?deps.document:(typeof document!=='undefined'?document:null); }catch(error){ return null; } }
  function copy(th,en){ try{ const text=deps&&typeof deps.copy==='function'?deps.copy(th,en):null; return typeof text==='string'?text:String(en||th||''); }catch(error){ return String(en||th||''); } }
  function dep(name){ return deps&&typeof deps[name]==='function'?deps[name]:null; }
  function callDep(name,argument,fallback){ const fn=dep(name); if(!fn)return fallback; try{ return fn(argument); }catch(error){ return fallback; } }
  function campaignId(){ return String(callDep('campaignId',undefined,'')||''); }
  function logRow(row){
    try{ const log=dep('log'); if(log)log(row); }catch(error){}
    try{ const ledger=dep('ledger'); if(ledger)ledger(String(row&&row.reason_code||'stage_event'),{roundId:String(row&&(row.key||row.closed_key||row.hold_key)||''),campaignId:campaignId(),source:'diceStage'}); }catch(error){}
  }
  function disabledCause(){
    if(!initialized||!machine)return 'uninitialized';
    if(callDep('stageOff',undefined,false)===true)return 'stage_off';
    if(callDep('fxOff',undefined,false)===true)return 'fx_off';
    if(callDep('reducedMotion',undefined,false)===true)return 'reduced_motion';
    return '';
  }
  function enabled(){ return disabledCause()===''; }
  function hiddenNow(){ return callDep('hidden',undefined,false)===true; }
  function closeView(){ if(view){ const closing=view; view=null; try{ closing.close(); }catch(error){} } }
  function endNarrationPreHold(key,reason){
    const id=String(key||''); const token=preHoldTokens.get(id);
    if(machine)machine.endPreHold('narration',id,reason);
    if(token!==undefined){ preHoldTokens.delete(id); callDep('endHold',token,null); }
  }
  function hintText(seconds){ return copy('ถ้าไม่กด ระบบจะทอยให้เองใน ','Auto-roll in ')+String(Math.max(0,Number(seconds)||0))+copy(' วิ',' s if you do not press'); }
  function failOpen(error){
    try{ logRow({source:'diceStage',reason_code:REASONS.errorFailOpen,error:String(error&&error.message||error||'').slice(0,160),key:machine?machine.snapshot().key:''}); }catch(logError){}
    try{ if(machine&&machine.isOpen())machine.skip(REASONS.errorFailOpen); else closeView(); }catch(skipError){ closeView(); }
  }
  function machineHooks(){
    return {
      now:dep('now')||function(){ return Date.now(); },
      setTimer:dep('setTimer')||function(callback,delay){ return setTimeout(callback,delay); },
      clearTimer:dep('clearTimer')||function(id){ clearTimeout(id); },
      onLog:logRow,
      onTick:function(seconds){ if(view)view.setHint(hintText(seconds)); },
      onPress:function(source){ if(view)view.setPhase('rolling',copy('กำลังทอยเต๋า','Rolling dice')); const callbacks=armedCallbacks; safeCall(callbacks&&callbacks.onPress,source); },
      onSkip:function(payload){ const callbacks=armedCallbacks; armedCallbacks=null; safeCall(callbacks&&callbacks.onSkip,payload&&payload.reason); },
      onHiddenRelease:function(payload){ callDep('releaseNarration',payload&&payload.key,null); },
      onClose:function(payload){
        closeView(); armedCallbacks=null;
        if(adoptedToken!==null){ const token=adoptedToken; adoptedToken=null; callDep('endHold',token,null); }
        if(payload&&payload.reason!==REASONS.sequenceDone)callDep('releaseNarration',payload&&payload.key,null);
      },
      onPreHoldEnd:function(entry){ if(entry&&entry.kind==='narration'){ const token=preHoldTokens.get(entry.key); if(token!==undefined){ preHoldTokens.delete(entry.key); callDep('endHold',token,null); } } },
      onHoldsChanged:function(){ callDep('onHoldChange',undefined,null); }
    };
  }

  function init(options){
    try{
      deps=options&&typeof options==='object'?options:{};
      if(machine)machine.reset(); closeView(); preHoldTokens.clear(); adoptedToken=null; armedCallbacks=null; currentKey=''; lastToggleLogKey='';
      machine=createStageMachine(machineHooks()); initialized=true;
      if(!visibilityBound){
        const doc=documentRef();
        if(doc&&typeof doc.addEventListener==='function'){ doc.addEventListener('visibilitychange',function(){ try{ if(hiddenNow()&&machine)machine.hidden(); }catch(error){ failOpen(error); } }); visibilityBound=true; }
      }
      return true;
    }catch(error){ initialized=false; return false; }
  }
  function beginRound(roundId){ currentKey=String(roundId||''); return currentKey; }
  function arm(input){
    try{
      if(!machine)return null;
      const source=input&&typeof input==='object'?input:{};
      const plan=planStageBatch(source.events);
      if(!plan.arm)return null;                                   // spectator batch: existing rails + auto-play
      const key=currentKey||('batch:'+String(++batchSeq));
      if(releasing){ const why=machine.snapshot().lastReason||REASONS.released; return Object.freeze({armed:true,pressed:false,onPress:function(){},onSkip:function(callback){ safeCall(callback,why); }}); }
      const cause=disabledCause();
      if(cause){ if(lastToggleLogKey!==key){ lastToggleLogKey=key; logRow({source:'diceStage',reason_code:REASONS.toggleOff,cause:cause,key:key}); } return null; }
      if(hiddenNow())return null;
      if(machine.isOpen()){
        if(machine.snapshot().key===key&&machine.pressed()){ safeCall(source.onStart); return Object.freeze({armed:false,pressed:true,onPress:function(callback){ safeCall(callback,machine.pressed()); },onSkip:function(){}}); }
        releasing=true; try{ machine.skip(REASONS.superseded); }finally{ releasing=false; }
      }
      const doc=documentRef();
      const model={
        title:copy('ถึงตาคุณทอย','Your roll'),
        label:plan.label+(plan.queueTotal>1?' · 1/'+String(plan.queueTotal):''),
        glyphs:plan.glyphs,
        buttonLabel:copy('🎲 ทอยเต๋า','🎲 Roll the dice'),
        hint:hintText(DICE_PREROLL_AUTO_MS/1000),
        escapeLabel:copy('เล่นต่อ','Play on'),
        onPress:function(){ try{ if(machine)machine.press('player',REASONS.pressed); }catch(error){ failOpen(error); } },
        onEscape:function(){ try{ release(REASONS.playerEscape); }catch(error){ failOpen(error); } }
      };
      view=mountStageView(doc,model);
      if(!view){ logRow({source:'diceStage',reason_code:REASONS.viewUnavailable,key:key}); return null; }
      armedCallbacks={onPress:null,onSkip:null};
      if(!machine.arm(key)){ closeView(); armedCallbacks=null; return null; }
      safeCall(source.onStart);                                    // the choreography's own narration hold starts now
      endNarrationPreHold(key,REASONS.holdAdopted);
      machine.endPreHoldsOfKind('battleLog',REASONS.holdAdopted);
      return Object.freeze({armed:true,pressed:false,onPress:function(callback){ if(armedCallbacks)armedCallbacks.onPress=callback; },onSkip:function(callback){ if(armedCallbacks)armedCallbacks.onSkip=callback; }});
    }catch(error){ failOpen(error); return null; }
  }
  function pressed(){ try{ return machine?machine.pressed():null; }catch(error){ return null; } }
  function hosts(){
    try{
      if(!machine||!view||!machine.isOpen())return null;
      machine.jobStarted(); view.setPhase('rolling',copy('กำลังทอยเต๋า','Rolling dice'));
      return Object.freeze({dice:view.diceHost,result:view.resultHost});
    }catch(error){ failOpen(error); return null; }
  }
  function jobResult(){ try{ if(machine&&machine.jobResult()&&view)view.setPhase('result',''); return true; }catch(error){ failOpen(error); return false; } }
  function jobDisposed(){ try{ return !!(machine&&machine.jobDisposed()); }catch(error){ failOpen(error); return false; } }
  function resultAckAutoMs(){ try{ return machine?machine.ackBudget():null; }catch(error){ return null; } }
  function holdsRound(roundId){ try{ return !!(machine&&machine.holdsRound(roundId)); }catch(error){ return false; } }
  function holdsBattleLog(){ try{ return !!(machine&&machine.holdsBattleLog()); }catch(error){ return false; } }
  function sequenceDone(roundId,token){
    try{
      if(!machine||!machine.isOpen()||machine.snapshot().key!==String(roundId||''))return false;
      if(token!==undefined&&token!==null)adoptedToken=token;
      machine.sequenceDone(String(roundId||'')); return true;
    }catch(error){ failOpen(error); return false; }
  }
  function preHoldNarration(roundId){
    try{
      const key=String(roundId||''); if(!key||!machine||!enabled()||hiddenNow())return false;
      if(machine.isOpen()&&machine.snapshot().key===key)return false;
      if(preHoldTokens.has(key))return false;
      const token=callDep('beginHold',key,null); if(token===null||token===undefined)return false;
      preHoldTokens.set(key,token);
      if(!machine.preHold('narration',key)){ preHoldTokens.delete(key); callDep('endHold',token,null); return false; }
      return true;
    }catch(error){ failOpen(error); return false; }
  }
  function postFlipSignal(reason,roundId){
    try{
      const key=String(roundId||''); const why=String(reason||'');
      if(why==='post_flip_refetch_trigger')return preHoldNarration(key);
      if(why==='post_flip_refetch_ready'||why==='post_flip_refetch_cap'){ endNarrationPreHold(key,REASONS.holdSettled); return true; }
      return false;
    }catch(error){ failOpen(error); return false; }
  }
  function noteBattleLogRow(row,character){
    try{
      if(!machine||!enabled()||hiddenNow())return false;
      const keyOf=dep('ownerKey')||function(value){ return String(value||'').trim().toLowerCase(); };
      const ownKey=keyOf(character&&character.name);
      if(!ownBattleLogRow(row,ownKey,keyOf))return false;
      if(machine.isOpen())return false;
      return machine.preHold('battleLog','pending');
    }catch(error){ failOpen(error); return false; }
  }
  function release(reason){
    try{ if(!machine||!machine.isOpen())return false; releasing=true; try{ return machine.skip(reason||REASONS.playerEscape); }finally{ releasing=false; } }
    catch(error){ failOpen(error); return false; }
  }
  function state(){
    return Object.freeze({build:BUILD,initialized:initialized,enabled:enabled(),cause:disabledCause(),currentKey:currentKey,viewOpen:!!view,machine:machine?machine.snapshot():null,preHoldTokens:Array.from(preHoldTokens.keys())});
  }
  function resetForTests(){ if(machine)machine.reset(); closeView(); preHoldTokens.clear(); adoptedToken=null; armedCallbacks=null; currentKey=''; batchSeq=0; releasing=false; lastToggleLogKey=''; }

  window.DiceStage=Object.freeze({
    build:BUILD,init:init,enabled:enabled,beginRound:beginRound,arm:arm,pressed:pressed,hosts:hosts,jobResult:jobResult,jobDisposed:jobDisposed,
    resultAckAutoMs:resultAckAutoMs,holdsRound:holdsRound,holdsBattleLog:holdsBattleLog,sequenceDone:sequenceDone,
    preHoldNarration:preHoldNarration,postFlipSignal:postFlipSignal,noteBattleLogRow:noteBattleLogRow,release:release,state:state,
    _pure:Object.freeze({
      DICE_PREROLL_AUTO_MS:DICE_PREROLL_AUTO_MS,DICE_HOLD_MAX_MS:DICE_HOLD_MAX_MS,DICE_STAGE_TOTAL_MS:DICE_STAGE_TOTAL_MS,DICE_STAGE_ACK_MIN_MS:DICE_STAGE_ACK_MIN_MS,DICE_STAGE_ACK_MAX_MS:DICE_STAGE_ACK_MAX_MS,MAX_GLYPHS:MAX_GLYPHS,REASONS:REASONS,
      dieKind:dieKind,stageGlyphs:stageGlyphs,planStageBatch:planStageBatch,ackBudgetMs:ackBudgetMs,countdownSeconds:countdownSeconds,ownBattleLogRow:ownBattleLogRow,createStageMachine:createStageMachine,glyphPoints:glyphPoints
    }),
    _test:Object.freeze({reset:resetForTests,mountStageView:mountStageView})
  });
})();
