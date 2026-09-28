// FACE-LIVE: visual-only slide between server-committed adjacent PC cells.
// language-impact: none — no runtime text or game-state writes.
(function(root){
  'use strict';
  const snapshots=new Map();
  let scope='';
  function reduced(){try{return root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;}catch(_e){return true;}}
  function reset(){snapshots.clear();scope='';}
  function sample(node){
    const id=String(node.getAttribute('data-face-token-id')||'');
    const grid=String(node.getAttribute('data-face-grid-id')||'');
    const raw=['data-face-col','data-face-row','data-face-x','data-face-y']
      .map(name=>node.getAttribute(name));
    if(raw.some(value=>value===null||value===''))return null;
    const [col,row,x,y]=raw.map(Number);
    if(!id||!grid||![col,row,x,y].every(Number.isFinite)||![col,row].every(Number.isInteger))return null;
    return {id,grid,col,row,x,y};
  }
  function slidePlan(previous,current,context){
    if(!previous||!current||previous.id!==current.id||previous.grid!==current.grid||
      context?.hidden===true||context?.reduced===true||context?.sameView!==true)return null;
    const dc=current.col-previous.col,dr=current.row-previous.row;
    // A single orthogonal server-committed step cannot cut through a corner.
    // Multi-cell and diagonal changes snap until an authoritative path is supplied.
    if(Math.abs(dc)+Math.abs(dr)!==1)return null;
    const dx=previous.x-current.x,dy=previous.y-current.y;
    if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>200||Math.abs(dy)>200)return null;
    return Object.freeze({dx,dy,duration:220});
  }
  function sync(board,context){
    if(!board||!context?.campaignId||!context?.encounterId){reset();return {played:0};}
    const nextScope=[context.campaignId,context.groupNo,context.encounterId].join('|');
    if(scope!==nextScope){snapshots.clear();scope=nextScope;}
    const svg=board.querySelector('svg'),view=svg?.getAttribute('viewBox')||'';
    const hidden=root.document?.hidden===true,reducedMotion=reduced();let played=0;
    const present=new Set();
    for(const node of board.querySelectorAll('[data-face-token-id]')){
      const now=sample(node);if(!now)continue;
      const key=now.grid+'/'+now.id;present.add(key);
      const old=snapshots.get(key);
      const plan=slidePlan(old?.position,now,{hidden,reduced:reducedMotion,sameView:old?.view===view});
      snapshots.set(key,{position:now,view});
      if(plan&&typeof node.animate==='function'){
        node.animate([{transform:`translate(${plan.dx}px, ${plan.dy}px)`},{transform:'translate(0px, 0px)'}],
          {duration:plan.duration,easing:'ease-out',fill:'none'});
        played++;
      }
    }
    for(const key of snapshots.keys())if(!present.has(key))snapshots.delete(key);
    return {played};
  }
  root.BattleFacingMotion=Object.freeze({slidePlan,sync,reset});
  root.document?.addEventListener?.('visibilitychange',()=>{if(root.document.hidden)reset();});
})(typeof window!=='undefined'?window:globalThis);
