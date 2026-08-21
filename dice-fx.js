/*
 * DICE-01 "Dice Feel" — server-value visualizer and synthesized roll SFX.
 *
 * The caller owns every mechanical value. Math.random() is used only for
 * cosmetic flight/noise details; a settled face always comes from input.value.
 *
 * language-impact: th+en — the two module-owned accessibility strings are
 * routed through the injected t(th,en) localizer. Labels/numbers come from the
 * caller and the audio layer is language-neutral.
 */
(function attachDiceFx(){
  'use strict';

  const BUILD='20260815-dice04-r1';
  const MAX_VISIBLE_DICE=6;
  const MAX_IN_FLIGHT=2;
  const PENDING_TIMEOUT_MS=20000;
  const CHOREOGRAPHY_STEP_TIMEOUT_MS=3000;
  const MASTER_GAIN=0.25;
  const DIE_SIDES=Object.freeze({d4:4,d6:6,d8:8,d10:10,d12:12,d20:20});
  const SVG_NS='http://www.w3.org/2000/svg';

  let localizer=null;
  let initialized=false;
  let environment=null;
  let activeJob=null;
  let queue=[];
  let sequence=0;
  let lastPlan=null;
  let audioContext=null;
  const pendingStates=new Set();

  function finiteNumber(value){
    if(value===null||value===undefined||value==='') return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }

  function integer(value){
    const number=finiteNumber(value);
    return number===null?null:Math.trunc(number);
  }

  function boundedInteger(value,min,max,fallback){
    const number=integer(value);
    return number===null?fallback:Math.max(min,Math.min(max,number));
  }

  function cleanText(value,maxLength){
    const text=String(value==null?'':value).trim();
    return text.slice(0,maxLength);
  }

  function safeRng(rng){
    return function next(){
      try{
        const value=Number((typeof rng==='function'?rng:Math.random)());
        if(Number.isFinite(value)) return Math.max(0,Math.min(0.999999999,value));
      }catch(error){}
      return 0.5;
    };
  }

  function hashSeed(value){
    const text=String(value==null?'':value);
    let hash=2166136261;
    for(let index=0;index<text.length;index++){
      hash^=text.charCodeAt(index);
      hash=Math.imul(hash,16777619);
    }
    return hash>>>0;
  }

  function seededRng(seed){
    let state=hashSeed(seed)||0x9e3779b9;
    return function next(){
      state=(state+0x6d2b79f5)>>>0;
      let value=state;
      value=Math.imul(value^(value>>>15),value|1);
      value^=value+Math.imul(value^(value>>>7),value|61);
      return ((value^(value>>>14))>>>0)/4294967296;
    };
  }

  function dieKind(value){
    const key=String(value||'').toLowerCase();
    return DIE_SIDES[key]?key:'d20';
  }

  function normalizeDice(rawDice){
    if(!Array.isArray(rawDice)) return Object.freeze([]);
    const dice=rawDice.slice(0,64).map(function(raw,index){
      const source=raw&&typeof raw==='object'?raw:{};
      const die=dieKind(source.die);
      return Object.freeze({
        index:index,
        die:die,
        sides:DIE_SIDES[die],
        value:integer(source.value)
      });
    });
    return Object.freeze(dice);
  }

  // DICESURFACE-02: one pure mapping seam for authoritative combat save
  // receipts. The UI owns paired labels; this function only carries server
  // values into the existing save choreography and never derives a face/total.
  function combatSaveReceiptPlaybackPayload(receipt,label){
    const source=receipt&&typeof receipt==='object'&&!Array.isArray(receipt)?receipt:null;
    if(!source||source.kind!=='save') return null;
    const eventId=cleanText(source.receiptId,260),cleanLabel=cleanText(label,320);
    const roll=Number.isInteger(source.roll)&&source.roll>=1&&source.roll<=20?source.roll:null;
    const bonus=Number.isInteger(source.bonus)&&source.bonus>=-100&&source.bonus<=1000?source.bonus:null;
    const total=Number.isInteger(source.total)&&source.total>=-100&&source.total<=1000?source.total:null;
    const dc=Number.isInteger(source.dc)&&source.dc>=0&&source.dc<=1000?source.dc:null;
    const pass=typeof source.pass==='boolean'?source.pass:null;
    if(!eventId||roll===null||bonus===null||total===null||dc===null||pass===null||total!==roll+bonus) return null;
    const ability=String(source.ability||'').trim().toLowerCase().replace(/[\s_]+/g,'-');
    if(ability==='initiative') return Object.freeze({eventId:eventId,kind:'initiative',role:'check',dice:[{die:'d20',value:roll}],flat:bonus,total:total,label:cleanLabel});
    if(ability==='death'||ability==='death-save'||ability==='deathsave') return Object.freeze({eventId:eventId,kind:'save',role:'death-save',dice:[{die:'d20',value:roll}],flat:bonus,total:total,dc:dc,pass:pass,tier:pass?'success':'failure',label:cleanLabel});
    return Object.freeze({eventId:eventId,kind:'save',role:'save',dice:[{die:'d20',value:roll}],flat:bonus,total:total,dc:dc,pass:pass,tier:pass?'success':'failure',label:cleanLabel});
  }

  function visualDurationFor(diceCount,seed,reducedMotion){
    if(reducedMotion) return 140;
    const count=Math.max(1,Math.min(MAX_VISIBLE_DICE,boundedInteger(diceCount,1,64,1)));
    const rng=seededRng(seed);
    return Math.min(1420,980+(count-1)*72+Math.floor(rng()*60));
  }

  function resultExpression(dice,flat,total){
    const values=dice.map(function(item){ return item.value; }).filter(function(value){ return value!==null; });
    const parts=values.map(String);
    const flatValue=integer(flat)||0;
    if(flatValue>0) parts.push(String(flatValue));
    if(flatValue<0) parts.push('\u2212'+String(Math.abs(flatValue)));
    const derived=values.reduce(function(sum,value){ return sum+value; },0)+flatValue;
    const finalTotal=integer(total);
    return Object.freeze({
      parts:Object.freeze(parts),
      total:finalTotal===null?derived:finalTotal,
      expression:parts.join('+').replace(/\+\u2212/g,'\u2212')
    });
  }

  function planRollVisual(input,rng){
    const source=input&&typeof input==='object'?input:{};
    const dice=normalizeDice(source.dice);
    const visibleCount=Math.min(MAX_VISIBLE_DICE,dice.length);
    const seed=source.seed==null
      ?hashSeed(dice.map(function(item){ return item.die+':'+String(item.value); }).join('|')+'|'+cleanText(source.label,120))
      :source.seed;
    const random=safeRng(rng||source.rng||seededRng(seed));
    const reducedMotion=source.reducedMotion===true;
    const durationMs=visualDurationFor(visibleCount||1,seed,reducedMotion);
    const plannedDice=dice.map(function(item,index){
      const visible=index<MAX_VISIBLE_DICE;
      const staggerMs=visible&& !reducedMotion?Math.round(index*(80+random()*70)):0;
      const xPct=visible?Math.round((((index+1)/(visibleCount+1))-.5)*76+(random()-.5)*8):0;
      const launchY=visible?Math.round(-120-random()*100):0;
      const rotateX=visible?Math.round(360+random()*720):0;
      const rotateY=visible?Math.round(360+random()*720):0;
      return Object.freeze({
        index:item.index,
        die:item.die,
        sides:item.sides,
        finalFace:item.value,
        visible:visible,
        staggerMs:staggerMs,
        xPct:xPct,
        launchY:launchY,
        rotateX:rotateX,
        rotateY:rotateY,
        settleMs:visible?Math.max(staggerMs+120,durationMs):0
      });
    });
    const frames=reducedMotion?[]:[
      Object.freeze({phase:'launch',atMs:0}),
      Object.freeze({phase:'first-bounce',atMs:Math.round(durationMs*.58)}),
      Object.freeze({phase:'second-bounce',atMs:Math.round(durationMs*.78)}),
      Object.freeze({phase:'settle',atMs:durationMs})
    ];
    return Object.freeze({
      kind:'dice-roll-visual-v1',
      seed:seed,
      label:cleanText(source.label,160),
      flat:integer(source.flat)||0,
      dc:integer(source.dc),
      pass:typeof source.pass==='boolean'?source.pass:null,
      tier:cleanText(source.tier,40).toLowerCase(),
      dice:Object.freeze(plannedDice),
      visibleDice:Object.freeze(plannedDice.filter(function(item){ return item.visible; })),
      collapsedCount:Math.max(0,dice.length-MAX_VISIBLE_DICE),
      result:resultExpression(dice,source.flat,source.total),
      durationMs:durationMs,
      reducedMotion:reducedMotion,
      frames:Object.freeze(frames)
    });
  }

  function finalFacesOf(plan){
    if(!plan||!Array.isArray(plan.dice)) return Object.freeze([]);
    return Object.freeze(plan.dice.map(function(item){ return item.finalFace; }));
  }

  function splitTotalCosmetic(total,n,sides,rng){
    const wanted=integer(total);
    const count=integer(n);
    const faceCount=integer(sides);
    if(wanted===null||count===null||faceCount===null||count<1||count>64||faceCount<2) return null;
    if(wanted<count||wanted>count*faceCount) return null;
    const random=safeRng(rng);
    const faces=new Array(count).fill(1);
    let remaining=wanted-count;
    for(let index=0;index<count;index++){
      const remainingDice=count-index-1;
      const minAdd=Math.max(0,remaining-remainingDice*(faceCount-1));
      const maxAdd=Math.min(faceCount-1,remaining);
      const add=index===count-1?remaining:minAdd+Math.floor(random()*(maxAdd-minAdd+1));
      faces[index]+=add;
      remaining-=add;
    }
    return Object.freeze(faces);
  }

  function isCriticalKind(kind){
    return /(?:^|[-_])(crit|critical|nat20)(?:$|[-_])|crit-success/.test(String(kind||'').toLowerCase());
  }

  function sfxPlan(kind,diceCount,seed){
    const count=Math.max(1,Math.min(MAX_VISIBLE_DICE,boundedInteger(diceCount,1,64,1)));
    const random=seededRng(seed);
    const durationMs=visualDurationFor(count,seed,false);
    const events=[];
    let at=30;
    const shakeCount=3+Math.min(5,count);
    for(let index=0;index<shakeCount;index++){
      const progress=shakeCount<=1?1:index/(shakeCount-1);
      events.push(Object.freeze({
        t:Math.round(at),
        type:'shake',
        durationMs:Math.round(30+random()*30),
        freqBand:Object.freeze([Math.round(1800+random()*500),Math.round(3400+random()*600)]),
        gain:0.3+random()*0.18
      }));
      at+=60+progress*80+random()*20;
    }
    const settleStart=Math.min(durationMs-180,760+Math.round(random()*70));
    for(let index=0;index<count;index++){
      events.push(Object.freeze({
        t:Math.min(durationMs-90,settleStart+index*74),
        type:'settle',
        durationMs:58,
        freqBand:Object.freeze([Math.round(2100+random()*500),Math.round(3600+random()*400)]),
        gain:0.58
      }));
    }
    if(isCriticalKind(kind)){
      const lastSettle=events.reduce(function(max,event){ return event.type==='settle'?Math.max(max,event.t):max; },0);
      events.push(Object.freeze({
        t:Math.min(durationMs-35,lastSettle+54),
        type:'ting',
        durationMs:180,
        freqBand:Object.freeze([2550,2700]),
        gain:0.32
      }));
    }
    events.sort(function(left,right){ return left.t-right.t; });
    return Object.freeze(events);
  }

  function safeCall(callback){
    if(typeof callback!=='function') return;
    try{ callback(); }catch(error){}
  }

  function callbackList(){
    const callbacks=[];
    for(let sourceIndex=0;sourceIndex<arguments.length;sourceIndex++){
      const source=arguments[sourceIndex];
      const callback=source&&typeof source.onDone==='function'?source.onDone:null;
      if(callback&&!callbacks.includes(callback)) callbacks.push(callback);
    }
    return callbacks;
  }

  function finishCallbacks(callbacks){
    (callbacks||[]).forEach(safeCall);
  }

  function runChoreography(input,runtime){
    const source=input&&typeof input==='object'?input:{};
    const events=Array.isArray(source.events)
      ?source.events.filter(function(event){ return event&&typeof event==='object'&&!Array.isArray(event); }).slice(0,32)
      :[];
    const adapter=runtime&&typeof runtime==='object'?runtime:{};
    const rollOne=typeof adapter.roll==='function'?adapter.roll:null;
    const setTimer=typeof adapter.setTimer==='function'?adapter.setTimer:null;
    const clearTimer=typeof adapter.clearTimer==='function'?adapter.clearTimer:function(){};
    let finished=false;
    let timer=null;
    let index=0;
    function complete(){
      if(finished) return false;
      finished=true;
      if(timer!==null){ try{ clearTimer(timer); }catch(error){} timer=null; }
      safeCall(source.onDone);
      return true;
    }
    if(!events.length||!rollOne){
      complete();
      return Object.freeze({started:false,skipped:true,cancel:function(){ return false; }});
    }
    safeCall(source.onStart);
    function next(){
      if(finished) return;
      if(timer!==null){ try{ clearTimer(timer); }catch(error){} timer=null; }
      if(index>=events.length){ complete(); return; }
      const event=events[index++];
      let advanced=false;
      function advance(){ if(advanced||finished)return; advanced=true; next(); }
      if(!setTimer){ advance(); return; }
      try{ timer=setTimer(advance,CHOREOGRAPHY_STEP_TIMEOUT_MS); }
      catch(error){ advance(); return; }
      try{ rollOne(Object.assign({},event,{onDone:advance})); }
      catch(error){ advance(); }
    }
    next();
    return Object.freeze({
      started:true,
      skipped:false,
      cancel:function(){ return complete(); }
    });
  }

  function localize(th,en){
    if(!initialized||typeof localizer!=='function') return '';
    try{
      const text=localizer(th,en);
      return typeof text==='string'?text:'';
    }catch(error){ return ''; }
  }

  function localizedCopy(){
    return Object.freeze({
      rollAria:localize('\u0e1c\u0e25\u0e01\u0e32\u0e23\u0e17\u0e2d\u0e22\u0e40\u0e15\u0e4b\u0e32','Dice roll result'),
      pendingAria:localize('\u0e01\u0e33\u0e25\u0e31\u0e07\u0e17\u0e2d\u0e22\u0e40\u0e15\u0e4b\u0e32','Rolling dice')
    });
  }

  function injectStyles(){
    if(typeof document==='undefined'||!document.createElement) return false;
    if(document.getElementById&&document.getElementById('dice-fx-style')) return true;
    const style=document.createElement('style');
    style.id='dice-fx-style';
    style.textContent='\n'+
      '.dfx-overlay{position:fixed;left:50%;bottom:max(104px,calc(env(safe-area-inset-bottom) + 92px));transform:translateX(-50%);z-index:2147482000;width:min(94vw,860px);display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none;filter:drop-shadow(0 8px 14px rgba(20,12,5,.35))}\n'+
      '.dfx-stage{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-end;gap:8px 12px;perspective:900px;max-width:100%}\n'+
      '.dfx-die{width:clamp(72px,18vw,126px);height:clamp(72px,18vw,126px);color:#f8edce;transform-style:preserve-3d;will-change:transform,filter,opacity}\n'+
      '.dfx-die svg{display:block;width:100%;height:100%;overflow:visible}\n'+
      '.dfx-die .dfx-shell{fill:#322316;stroke:#d9b978;stroke-width:4;stroke-linejoin:round}\n'+
      '.dfx-die .dfx-facet{fill:none;stroke:rgba(240,211,154,.38);stroke-width:2}\n'+
      '.dfx-die text{fill:currentColor;font:700 27px Georgia,serif;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#26170c;stroke-width:2px}\n'+
      '.dfx-die.dfx-roll{animation:dfx-flight var(--dfx-duration) cubic-bezier(.18,.68,.2,1) var(--dfx-delay) both}\n'+
      '.dfx-die.dfx-pending{animation:dfx-idle 1.15s ease-in-out infinite}\n'+
      '.dfx-die.dfx-reduced{animation:dfx-pop .14s ease-out both}\n'+
      '.dfx-overlay.dfx-crit .dfx-shell{stroke:#f3ca52;filter:drop-shadow(0 0 10px rgba(255,210,70,.95))}\n'+
      '.dfx-overlay.dfx-fumble .dfx-shell{stroke:#d14b3d;filter:drop-shadow(0 0 9px rgba(190,36,30,.8))}\n'+
      '.dfx-result{max-width:min(90vw,680px);padding:8px 15px;border:1px solid rgba(194,153,91,.88);border-radius:12px;background:linear-gradient(180deg,rgba(54,39,23,.97),rgba(33,23,14,.97));color:#f5e7c6;font:600 15px/1.35 Georgia,serif;text-align:center;box-shadow:inset 0 0 0 1px rgba(255,238,196,.12)}\n'+
      '.dfx-label{display:block;color:#e6c98d;font-size:13px;font-weight:500;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n'+
      '.dfx-total{font-size:18px;letter-spacing:.02em}\n'+
      '.dfx-collapse{align-self:center;padding:6px 9px;border:1px solid rgba(217,185,120,.7);border-radius:999px;background:rgba(40,27,15,.92);color:#f5e7c6;font:700 15px Georgia,serif}\n'+
      '@keyframes dfx-flight{0%{opacity:.15;transform:translate3d(calc(var(--dfx-x) * -1),var(--dfx-y),-180px) rotateX(var(--dfx-rx)) rotateY(var(--dfx-ry)) scale(.48)}58%{opacity:1;transform:translate3d(var(--dfx-x),18px,24px) rotateX(80deg) rotateY(130deg) scale(1.08)}76%{transform:translate3d(var(--dfx-x),-22px,8px) rotateX(36deg) rotateY(54deg) scale(.98)}90%{transform:translate3d(var(--dfx-x),7px,2px) rotateX(12deg) rotateY(18deg) scale(1.02)}100%{opacity:1;transform:translate3d(var(--dfx-x),0,0) rotateX(0) rotateY(0) scale(1)}}\n'+
      '@keyframes dfx-idle{0%,100%{transform:translateY(0) rotateZ(-4deg) scale(.9);opacity:.7}50%{transform:translateY(-12px) rotateZ(5deg) scale(.97);opacity:1}}\n'+
      '@keyframes dfx-pop{0%{transform:scale(.82);opacity:0}100%{transform:scale(1);opacity:1}}\n'+
      '@media (max-width:480px){.dfx-overlay{bottom:max(92px,calc(env(safe-area-inset-bottom) + 80px));gap:7px}.dfx-stage{max-width:310px;gap:5px 8px}.dfx-die{width:clamp(72px,24vw,92px);height:clamp(72px,24vw,92px)}.dfx-result{padding:7px 11px;font-size:13px}.dfx-total{font-size:16px}}\n'+
      '@media (prefers-reduced-motion:reduce){.dfx-die{animation:none!important;transform:none!important}}';
    const target=document.head||document.documentElement||document.body;
    if(!target||!target.appendChild) return false;
    target.appendChild(style);
    return true;
  }

  function shapePoints(die){
    if(die==='d4') return '50,5 96,91 4,91';
    if(die==='d8') return '50,3 94,50 50,97 6,50';
    if(die==='d10') return '50,3 91,31 84,82 50,97 16,82 9,31';
    if(die==='d12') return '50,3 86,16 98,52 77,91 23,91 2,52 14,16';
    if(die==='d20') return '50,2 88,20 98,58 72,96 28,96 2,58 12,20';
    return '8,8 92,8 92,92 8,92';
  }

  function appendSvgLine(svg,x1,y1,x2,y2){
    if(!document.createElementNS) return;
    const line=document.createElementNS(SVG_NS,'line');
    line.setAttribute('class','dfx-facet');
    line.setAttribute('x1',String(x1));
    line.setAttribute('y1',String(y1));
    line.setAttribute('x2',String(x2));
    line.setAttribute('y2',String(y2));
    svg.appendChild(line);
  }

  function createDieNode(item,pending,reducedMotion,durationMs){
    const holder=document.createElement('div');
    holder.className='dfx-die '+(pending?'dfx-pending':reducedMotion?'dfx-reduced':'dfx-roll');
    holder.setAttribute('data-die',item.die);
    if(item.finalFace!==null) holder.setAttribute('data-face',String(item.finalFace));
    holder.style.setProperty('--dfx-delay',String(item.staggerMs||0)+'ms');
    holder.style.setProperty('--dfx-duration',String(Math.max(160,durationMs-(item.staggerMs||0)))+'ms');
    holder.style.setProperty('--dfx-x',String(item.xPct||0)+'px');
    holder.style.setProperty('--dfx-y',String(item.launchY||-140)+'px');
    holder.style.setProperty('--dfx-rx',String(item.rotateX||540)+'deg');
    holder.style.setProperty('--dfx-ry',String(item.rotateY||720)+'deg');
    if(document.createElementNS){
      const svg=document.createElementNS(SVG_NS,'svg');
      svg.setAttribute('viewBox','0 0 100 100');
      svg.setAttribute('aria-hidden','true');
      const polygon=document.createElementNS(SVG_NS,item.die==='d6'?'rect':'polygon');
      polygon.setAttribute('class','dfx-shell');
      if(item.die==='d6'){
        polygon.setAttribute('x','8'); polygon.setAttribute('y','8');
        polygon.setAttribute('width','84'); polygon.setAttribute('height','84');
        polygon.setAttribute('rx','8');
      }else polygon.setAttribute('points',shapePoints(item.die));
      svg.appendChild(polygon);
      if(item.die!=='d6'){
        appendSvgLine(svg,50,50,50,3);
        appendSvgLine(svg,50,50,88,20);
        appendSvgLine(svg,50,50,72,96);
        appendSvgLine(svg,50,50,28,96);
        appendSvgLine(svg,50,50,12,20);
      }
      const text=document.createElementNS(SVG_NS,'text');
      text.setAttribute('x','50');
      text.setAttribute('y','53');
      text.textContent=pending?'?':item.finalFace===null?'\u2026':String(item.finalFace);
      svg.appendChild(text);
      holder.appendChild(svg);
    }else holder.textContent=pending?'?':item.finalFace===null?'\u2026':String(item.finalFace);
    return holder;
  }

  function renderBrowserView(plan,copy,options){
    if(typeof document==='undefined'||!document.createElement||!document.body||!injectStyles()) return null;
    const pending=!!(options&&options.pending);
    const overlay=document.createElement('div');
    overlay.className='dfx-overlay';
    if(/nat20|crit-success/.test(plan.tier)) overlay.className+=' dfx-crit';
    if(/nat1|crit-fail/.test(plan.tier)) overlay.className+=' dfx-fumble';
    overlay.setAttribute('role','status');
    overlay.setAttribute('aria-live','polite');
    const aria=pending?copy.pendingAria:copy.rollAria;
    if(aria) overlay.setAttribute('aria-label',aria);
    const stage=document.createElement('div');
    stage.className='dfx-stage';
    stage.setAttribute('data-count',String(plan.visibleDice.length));
    plan.visibleDice.forEach(function(item){
      stage.appendChild(createDieNode(item,pending,plan.reducedMotion,plan.durationMs));
    });
    if(plan.collapsedCount>0){
      const collapsed=document.createElement('span');
      collapsed.className='dfx-collapse';
      collapsed.textContent='+'+String(plan.collapsedCount);
      stage.appendChild(collapsed);
    }
    overlay.appendChild(stage);
    if(!pending){
      const result=document.createElement('div');
      result.className='dfx-result';
      if(plan.label){
        const label=document.createElement('span');
        label.className='dfx-label';
        label.textContent=plan.label;
        result.appendChild(label);
      }
      const total=document.createElement('span');
      total.className='dfx-total';
      let expression=plan.result.expression;
      if(expression&&plan.result.parts.length>1) expression+=' = ';
      total.textContent=expression+String(plan.result.total)+(plan.dc===null?'':'  ·  DC '+String(plan.dc))+
        (plan.pass===null?'':plan.pass?'  ✓':'  ✗');
      result.appendChild(total);
      overlay.appendChild(result);
    }
    document.body.appendChild(overlay);
    let dismissed=false;
    return Object.freeze({
      dismiss:function(){
        if(dismissed) return;
        dismissed=true;
        try{ if(overlay.parentNode) overlay.parentNode.removeChild(overlay); }catch(error){}
      }
    });
  }

  function userGestureReady(){
    try{
      const activation=window.navigator&&window.navigator.userActivation;
      return !activation||activation.isActive===true||activation.hasBeenActive===true;
    }catch(error){ return false; }
  }

  function audioCtor(){
    try{ return window.AudioContext||window.webkitAudioContext||null; }catch(error){ return null; }
  }

  function noiseBuffer(context,durationMs){
    const length=Math.max(1,Math.ceil(context.sampleRate*durationMs/1000));
    const buffer=context.createBuffer(1,length,context.sampleRate);
    const data=buffer.getChannelData(0);
    for(let index=0;index<data.length;index++) data[index]=(Math.random()*2-1)*(1-index/data.length);
    return buffer;
  }

  function connectNoiseEvent(context,event,baseTime,nodes){
    const at=baseTime+event.t/1000;
    const source=context.createBufferSource();
    const filter=context.createBiquadFilter();
    const gain=context.createGain();
    source.buffer=noiseBuffer(context,event.durationMs);
    filter.type='bandpass';
    filter.frequency.setValueAtTime((event.freqBand[0]+event.freqBand[1])/2,at);
    filter.Q.setValueAtTime(1.2,at);
    gain.gain.setValueAtTime(MASTER_GAIN*event.gain,at);
    gain.gain.exponentialRampToValueAtTime(0.0001,at+event.durationMs/1000);
    source.connect(filter); filter.connect(gain); gain.connect(context.destination);
    nodes.add(source); nodes.add(filter); nodes.add(gain);
    source.onended=function(){ nodes.delete(source); };
    source.start(at);
    if(event.type==='settle'){
      const second=context.createBufferSource();
      const secondFilter=context.createBiquadFilter();
      const secondGain=context.createGain();
      second.buffer=noiseBuffer(context,36);
      secondFilter.type='highpass';
      secondFilter.frequency.setValueAtTime(1700,at+.018);
      secondGain.gain.setValueAtTime(MASTER_GAIN*.34,at+.018);
      secondGain.gain.exponentialRampToValueAtTime(0.0001,at+.058);
      second.connect(secondFilter); secondFilter.connect(secondGain); secondGain.connect(context.destination);
      nodes.add(second); nodes.add(secondFilter); nodes.add(secondGain);
      second.onended=function(){ nodes.delete(second); };
      second.start(at+.018);
      const thump=context.createOscillator();
      const thumpGain=context.createGain();
      thump.type='sine';
      thump.frequency.setValueAtTime(115,at);
      thump.frequency.exponentialRampToValueAtTime(72,at+.07);
      thumpGain.gain.setValueAtTime(MASTER_GAIN*.22,at);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001,at+.08);
      thump.connect(thumpGain); thumpGain.connect(context.destination);
      nodes.add(thump); nodes.add(thumpGain);
      thump.onended=function(){ nodes.delete(thump); };
      thump.start(at); thump.stop(at+.085);
    }
  }

  function connectTingEvent(context,event,baseTime,nodes){
    const at=baseTime+event.t/1000;
    const oscillator=context.createOscillator();
    const gain=context.createGain();
    oscillator.type='sine';
    oscillator.frequency.setValueAtTime((event.freqBand[0]+event.freqBand[1])/2,at);
    gain.gain.setValueAtTime(MASTER_GAIN*event.gain,at);
    gain.gain.exponentialRampToValueAtTime(0.0001,at+event.durationMs/1000);
    oscillator.connect(gain); gain.connect(context.destination);
    nodes.add(oscillator); nodes.add(gain);
    oscillator.onended=function(){ nodes.delete(oscillator); };
    oscillator.start(at); oscillator.stop(at+event.durationMs/1000+.01);
  }

  function playSfxBrowser(events){
    const nodes=new Set();
    let cancelled=false;
    function stop(){
      if(cancelled) return;
      cancelled=true;
      nodes.forEach(function(node){
        try{ if(typeof node.stop==='function') node.stop(); }catch(error){}
        try{ if(typeof node.disconnect==='function') node.disconnect(); }catch(error){}
      });
      nodes.clear();
    }
    try{
      const Constructor=audioCtor();
      if(!Constructor||!userGestureReady()) return Object.freeze({stop:stop});
      if(!audioContext) audioContext=new Constructor();
      const ready=function(){
        if(cancelled||!audioContext||audioContext.state!=='running') return;
        const baseTime=audioContext.currentTime+.015;
        events.forEach(function(event){
          if(event.type==='ting') connectTingEvent(audioContext,event,baseTime,nodes);
          else connectNoiseEvent(audioContext,event,baseTime,nodes);
        });
      };
      if(audioContext.state==='running') ready();
      else if(typeof audioContext.resume==='function'){
        const resumed=audioContext.resume();
        if(resumed&&typeof resumed.then==='function') resumed.then(ready).catch(function(){});
        else ready();
      }
    }catch(error){ stop(); }
    return Object.freeze({stop:stop});
  }

  function defaultEnvironment(){
    return {
      setTimer:function(callback,delay){ return window.setTimeout(callback,delay); },
      clearTimer:function(timer){ return window.clearTimeout(timer); },
      fxOff:function(){
        try{ return window.localStorage&&window.localStorage.getItem('dice_fx')==='off'; }
        catch(error){ return false; }
      },
      sfxOff:function(){
        try{ return window.localStorage&&window.localStorage.getItem('dice_sfx')==='off'; }
        catch(error){ return false; }
      },
      reducedMotion:function(){
        try{ return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch(error){ return false; }
      },
      createView:renderBrowserView,
      playSfx:playSfxBrowser
    };
  }

  function visualPolicy(){
    let off=true;
    let reduced=false;
    try{
      off=!initialized||!!environment.fxOff();
      reduced=!off&&!!environment.reducedMotion();
    }catch(error){ off=true; }
    return Object.freeze({skip:off,reducedMotion:reduced});
  }

  function soundEnabled(){
    try{ return initialized&&!environment.sfxOff(); }catch(error){ return false; }
  }

  function safeTimer(callback,delay){
    try{ return environment.setTimer(callback,delay); }
    catch(error){ safeCall(callback); return null; }
  }

  function clearSafeTimer(timer){
    if(timer===null||timer===undefined) return;
    try{ environment.clearTimer(timer); }catch(error){}
  }

  function dismissView(view){
    try{ if(view&&typeof view.dismiss==='function') view.dismiss(); }catch(error){}
  }

  function stopAudio(audio){
    try{ if(audio&&typeof audio.stop==='function') audio.stop(); }catch(error){}
  }

  function runNextJob(){
    if(activeJob||!queue.length) return;
    const job=queue.shift();
    activeJob=job;
    lastPlan=job.plan;
    let view=null;
    let audio=null;
    try{ view=environment.createView(job.plan,localizedCopy(),{pending:false}); }catch(error){}
    if(!view){
      finishJob(job);
      return;
    }
    if(soundEnabled()){
      try{ audio=environment.playSfx(sfxPlan(job.plan.tier||'roll',job.plan.visibleDice.length||1,job.plan.seed),job.plan); }
      catch(error){}
    }
    job.view=view;
    job.audio=audio;
    job.timer=safeTimer(function(){ finishJob(job); },Math.min(1600,job.plan.durationMs+(job.plan.reducedMotion?80:150)));
  }

  function finishJob(job){
    if(!job||job.done) return;
    job.done=true;
    clearSafeTimer(job.timer);
    dismissView(job.view);
    stopAudio(job.audio);
    if(activeJob===job) activeJob=null;
    else queue=queue.filter(function(candidate){ return candidate!==job; });
    finishCallbacks(job.callbacks);
    runNextJob();
  }

  function immediateHandle(callbacks,reason){
    finishCallbacks(callbacks);
    return Object.freeze({
      skipped:true,
      reason:reason,
      cancel:function(){ return false; }
    });
  }

  function enqueueRoll(input,callbacks,policy){
    if(policy.skip) return immediateHandle(callbacks,'disabled-or-uninitialized');
    if((activeJob?1:0)+queue.length>=MAX_IN_FLIGHT) return immediateHandle(callbacks,'queue-full');
    const source=Object.assign({},input||{},{reducedMotion:policy.reducedMotion});
    const plan=planRollVisual(source);
    const job={
      id:++sequence,
      plan:plan,
      callbacks:callbacks,
      timer:null,
      view:null,
      audio:null,
      done:false
    };
    queue.push(job);
    runNextJob();
    return Object.freeze({
      skipped:false,
      id:job.id,
      cancel:function(){
        if(job.done) return false;
        finishJob(job);
        return true;
      }
    });
  }

  function roll(input){
    const callbacks=callbackList(input);
    try{ return enqueueRoll(input,callbacks,visualPolicy()); }
    catch(error){ return immediateHandle(callbacks,'error'); }
  }

  function choreograph(input){
    let done=false;
    const finish=function(){ if(done)return false;done=true;safeCall(input&&input.onDone);return true; };
    const source=Object.assign({},input&&typeof input==='object'?input:{},{onDone:finish});
    try{
      return runChoreography(source,{
        roll:roll,
        setTimer:function(callback,delay){ return environment.setTimer(callback,delay); },
        clearTimer:function(timer){ return environment.clearTimer(timer); }
      });
    }catch(error){
      finish();
      return Object.freeze({started:false,skipped:true,cancel:function(){ return false; }});
    }
  }

  function inertPending(input,reason){
    const initialCallbacks=callbackList(input);
    finishCallbacks(initialCallbacks);
    let done=false;
    return Object.freeze({
      settle:function(settled){
        if(done) return false;
        done=true;
        finishCallbacks(callbackList(settled));
        return true;
      },
      fail:function(){
        if(done) return false;
        done=true;
        return true;
      },
      skipped:true,
      reason:reason
    });
  }

  function pending(input){
    try{
      const policy=visualPolicy();
      if(policy.skip) return inertPending(input,'disabled-or-uninitialized');
      const source=input&&typeof input==='object'?input:{};
      const plan=planRollVisual(Object.assign({},source,{reducedMotion:policy.reducedMotion}));
      let view=null;
      try{ view=environment.createView(plan,localizedCopy(),{pending:true}); }catch(error){}
      if(!view) return inertPending(input,'view-unavailable');
      const state={done:false,view:view,timer:null,input:source};
      pendingStates.add(state);
      function close(callbacks){
        if(state.done) return false;
        state.done=true;
        clearSafeTimer(state.timer);
        dismissView(state.view);
        pendingStates.delete(state);
        finishCallbacks(callbacks);
        return true;
      }
      state.timer=safeTimer(function(){ close(callbackList(source)); },PENDING_TIMEOUT_MS);
      return Object.freeze({
        settle:function(settled){
          if(state.done) return false;
          state.done=true;
          clearSafeTimer(state.timer);
          dismissView(state.view);
          pendingStates.delete(state);
          const finalInput=Object.assign({},source,settled||{});
          const callbacks=callbackList(source,settled);
          try{ enqueueRoll(finalInput,callbacks,visualPolicy()); }
          catch(error){ finishCallbacks(callbacks); }
          return true;
        },
        fail:function(){ return close(callbackList(source)); },
        skipped:false
      });
    }catch(error){ return inertPending(input,'error'); }
  }

  function init(options){
    try{
      if(!options||typeof options.t!=='function') return false;
      localizer=options.t;
      initialized=true;
      return true;
    }catch(error){ return false; }
  }

  function configureTestEnvironment(overrides){
    const source=overrides&&typeof overrides==='object'?overrides:{};
    environment=Object.assign({},environment||defaultEnvironment(),source);
    return true;
  }

  function resetForTests(){
    if(activeJob){
      clearSafeTimer(activeJob.timer);
      dismissView(activeJob.view);
      stopAudio(activeJob.audio);
    }
    queue.forEach(function(job){ clearSafeTimer(job.timer); });
    pendingStates.forEach(function(state){ clearSafeTimer(state.timer); dismissView(state.view); });
    pendingStates.clear();
    activeJob=null;
    queue=[];
    sequence=0;
    lastPlan=null;
    localizer=null;
    initialized=false;
    environment=defaultEnvironment();
  }

  function testState(){
    return Object.freeze({
      initialized:initialized,
      active:!!activeJob,
      queueDepth:queue.length+(activeJob?1:0),
      pendingCount:pendingStates.size,
      lastPlan:lastPlan
    });
  }

  environment=defaultEnvironment();
  window.DiceFx=Object.freeze({
    build:BUILD,
    init:init,
    roll:roll,
    choreograph:choreograph,
    pending:pending,
    _pure:Object.freeze({
      MAX_VISIBLE_DICE:MAX_VISIBLE_DICE,
      PENDING_TIMEOUT_MS:PENDING_TIMEOUT_MS,
      CHOREOGRAPHY_STEP_TIMEOUT_MS:CHOREOGRAPHY_STEP_TIMEOUT_MS,
      normalizeDice:normalizeDice,
      combatSaveReceiptPlaybackPayload:combatSaveReceiptPlaybackPayload,
      planRollVisual:planRollVisual,
      finalFacesOf:finalFacesOf,
      splitTotalCosmetic:splitTotalCosmetic,
      resultExpression:resultExpression,
      visualDurationFor:visualDurationFor,
      sfxPlan:sfxPlan,
      runChoreography:runChoreography
    }),
    _test:Object.freeze({
      configure:configureTestEnvironment,
      reset:resetForTests,
      state:testState
    })
  });
})();
