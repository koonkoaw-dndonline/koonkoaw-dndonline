(function(root){
  'use strict';
  const protectedLayers=new Set();
  let activeDraft=null,observer=null,scheduled=false,installedDocument=null;
  const editable=el=>!!el&&/^(INPUT|TEXTAREA)$/i.test(String(el.tagName||''))&&!el.disabled&&!el.readOnly&&!/^(?:button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/i.test(String(el.type||''));
  const connected=el=>!!el&&(el.isConnected===true||(el.ownerDocument&&typeof el.ownerDocument.contains==='function'&&el.ownerDocument.contains(el)));
  const esc=value=>String(value||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  function locator(el){
    if(!el) return null;
    if(String(el.id||'')) return {kind:'id',value:String(el.id)};
    const layer=typeof el.closest==='function'?el.closest('[data-ui-dialog-surface]'):null;
    if(layer&&el.getAttribute&&el.getAttribute('data-ui-dialog-field')!==null) return {kind:'dialog',value:String(layer.getAttribute('data-ui-dialog-surface')||'')};
    if(String(el.name||'')) return {kind:'name',value:String(el.name),tag:String(el.tagName||'').toLowerCase()};
    return null;
  }
  function capture(doc){
    const d=doc||root.document,el=d&&d.activeElement;
    if(!editable(el)) return null;
    return {element:el,locator:locator(el),value:String(el.value==null?'':el.value),start:Number.isInteger(el.selectionStart)?el.selectionStart:null,end:Number.isInteger(el.selectionEnd)?el.selectionEnd:null,direction:String(el.selectionDirection||'none'),scrollTop:Number(el.scrollTop)||0};
  }
  function locate(snapshot,doc){
    const d=doc||root.document;
    if(!snapshot||!d) return null;
    if(connected(snapshot.element)) return snapshot.element;
    const key=snapshot.locator;
    if(!key) return null;
    if(key.kind==='id'&&typeof d.getElementById==='function') return d.getElementById(key.value);
    if(typeof d.querySelector!=='function') return null;
    if(key.kind==='dialog') return d.querySelector('[data-ui-dialog-surface="'+esc(key.value)+'"] [data-ui-dialog-field]');
    if(key.kind==='name') return d.querySelector(String(key.tag||'input')+'[name="'+esc(key.value)+'"]');
    return null;
  }
  function restore(snapshot,doc){
    const el=locate(snapshot,doc);
    if(!editable(el)) return false;
    if(String(el.value==null?'':el.value)!==snapshot.value) el.value=snapshot.value;
    try{ el.focus({preventScroll:true}); }catch(_e){ try{ el.focus(); }catch(_e2){} }
    if(snapshot.start!==null&&typeof el.setSelectionRange==='function'){
      try{ el.setSelectionRange(snapshot.start,snapshot.end,snapshot.direction); }catch(_e){}
    }
    try{ el.scrollTop=snapshot.scrollTop; }catch(_e){}
    snapshot.element=el;
    return true;
  }
  function repair(doc){
    const d=doc||installedDocument||root.document;
    if(!d) return false;
    for(const layer of protectedLayers){ if(!connected(layer)&&d.body&&typeof d.body.appendChild==='function') d.body.appendChild(layer); }
    return activeDraft?restore(activeDraft,d):false;
  }
  function schedule(doc){
    if(scheduled) return;
    scheduled=true;
    const run=()=>{ scheduled=false; repair(doc); };
    if(typeof queueMicrotask==='function') queueMicrotask(run); else Promise.resolve().then(run);
  }
  function protectLayer(layer,doc){
    if(!layer) return function(){};
    protectedLayers.add(layer); schedule(doc);
    return function(){ protectedLayers.delete(layer); };
  }
  function install(doc){
    const d=doc||root.document;
    if(!d||installedDocument===d) return;
    installedDocument=d;
    const remember=event=>{ if(editable(event&&event.target)){ activeDraft=capture(d)||activeDraft; } };
    ['focusin','input','keyup','select'].forEach(name=>d.addEventListener(name,remember,true));
    d.addEventListener('focusout',event=>{ const prior=event&&event.target; const clear=()=>{ if(connected(prior)&&d.activeElement!==prior) activeDraft=null; }; if(typeof queueMicrotask==='function') queueMicrotask(clear); else Promise.resolve().then(clear); },true);
    const Observer=(d.defaultView&&d.defaultView.MutationObserver)||root.MutationObserver;
    if(Observer&&d.documentElement){ observer=new Observer(()=>schedule(d)); observer.observe(d.documentElement,{childList:true,subtree:true}); }
  }
  const api={capture,restore,repair,protectLayer,install};
  root.UiDraftGuard=api;
  if(root.document){ if(root.document.readyState==='loading') root.document.addEventListener('DOMContentLoaded',()=>install(root.document),{once:true}); else install(root.document); }
})(typeof window!=='undefined'?window:globalThis);

// language-impact: none — interaction state only; no player-visible copy.
