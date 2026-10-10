/* ER409b: cosmetic R4 material on a server-certified cell union. No range inference. */
(function(root){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const PREFIX='./battle-vfx/2026-10-10/zone-area-r4/';
  // Pinned source guide: 224x160, 3x3 floor corners (112,82),(208,112),(112,142),(16,112).
  const GUIDE=Object.freeze({width:224,height:160,left:16,top:82,floorWidth:192,floorHeight:60});
  const DURATION=Object.freeze([300,260,260,260,300,260,260,260,300]);
  const COLORS={zone_fire:'#ffad69',zone_ice:'#b0e5ff',zone_poison:'#bcdb8b',zone_fog:'#cfdee2',zone_darkness:'#aeb0db'};
  let generation=0,serial=0,timer=null,container=null,signature='',art=Object.create(null),cues=Object.create(null);
  const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  const own=(v,k)=>v&&Object.hasOwn(v,k);
  function reset(){
    generation++;signature='';
    if(timer!==null)root.clearTimeout(timer);timer=null;
    if(container)container.replaceChildren();container=null;
  }
  function configure(areas,registry){
    reset();art=Object.create(null);cues=Object.create(null);
    for(const [key,value]of Object.entries(areas||{})){
      if(!/^zone_[a-z_]+$/.test(key)||!value||value.presentation!=='area-r4'||
        value.still!==PREFIX+'stills/'+key+'.png'||!Array.isArray(value.frames)||value.frames.length!==9||
        value.frames.some((url,i)=>url!==PREFIX+'frames/'+key+'/'+String(i).padStart(2,'0')+'.png'))continue;
      art[key]=Object.freeze({still:value.still,frames:Object.freeze([...value.frames])});
    }
    for(const [slug,row]of Object.entries(registry||{}))if(Array.isArray(row?.areas))
      cues[slug]=Object.freeze(row.areas.filter(key=>own(art,key)));
  }
  function normalize(row,expected,frame){
    if(!row||row.schema!=='combat-zone-footprint/v1'||row.kind!=='zone'||row.active!==true||
      row.visibility_scope!=='party'||row.campaign_id!==expected.campaign_id||
      row.encounter_id!==expected.encounter_id||row.group_no!==expected.group_no||
      !UUID.test(String(row.campaign_id||''))||!UUID.test(String(row.encounter_id||''))||
      !UUID.test(String(row.grid_id||''))||!UUID.test(String(row.effect_id||''))||
      !int(row.group_no,1,2)||!int(row.revision,0,Number.MAX_SAFE_INTEGER)||
      row.grid_id!==frame.grid||!int(frame.cols,2,20)||!int(frame.rows,2,20)||
      !own(cues,row.spell_slug)||!cues[row.spell_slug].includes(row.area_key)||
      !own(art,row.area_key)||!Array.isArray(row.affected_cells)||
      !row.affected_cells.length||row.affected_cells.length>400)return null;
    const ids=new Set(),positions=new Set(),cells=[];
    for(const cell of row.affected_cells){
      if(!cell||!UUID.test(String(cell.cell_id||''))||!int(cell.col,0,frame.cols-1)||
        !int(cell.row,0,frame.rows-1))return null;
      const at=cell.col+','+cell.row;
      if(ids.has(cell.cell_id)||positions.has(at))return null;
      ids.add(cell.cell_id);positions.add(at);cells.push({id:cell.cell_id,col:cell.col,row:cell.row});
    }
    cells.sort((a,b)=>a.row-b.row||a.col-b.col);
    return {id:row.effect_id,revision:row.revision,key:row.area_key,grid:row.grid_id,cells};
  }
  function svg(tag,attrs={}){
    const node=root.document.createElementNS(NS,tag);
    for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;
  }
  function readFrame(board){
    const nodes=board?.querySelectorAll('[data-vfx-zone-ground]');
    if(!board?.isConnected||nodes?.length!==1)return null;
    const node=nodes[0],data=node.dataset;
    if(!UUID.test(data.gridId||'')||!int(Number(data.cols),2,20)||!int(Number(data.rows),2,20))return null;
    return {node,grid:data.gridId,cols:Number(data.cols),rows:Number(data.rows)};
  }
  function cellPolygon(node){
    if(node.localName==='rect'){
      const [x,y,w,h]=['x','y','width','height'].map(k=>Number(node.getAttribute(k)));
      if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return null;
      return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
    }
    if(node.localName!=='polygon')return null;
    const values=(node.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number);
    if(values.length!==8||!values.every(Number.isFinite))return null;
    const points=Array.from({length:4},(_,i)=>values.slice(i*2,i*2+2));
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const turns=points.map((p,i)=>cross(p,points[(i+1)%4],points[(i+2)%4]));
    return turns.every(n=>n>0)||turns.every(n=>n<0)?points:null;
  }
  function geometry(cue,board){
    const all=board.querySelectorAll('[data-vfx-cell]'),map=new Map();
    for(const node of all){const key=node.dataset.vfxCell;if(map.has(key))return null;map.set(key,node);}
    const polygons=[];
    for(const cell of cue.cells){
      const node=map.get(cell.col+','+cell.row),p=node&&cellPolygon(node);
      if(!p||node.dataset.gridId!==cue.grid)return null;polygons.push(p);
    }
    const points=polygons.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;
    if(width<=0||height<=0||width>4096||height>4096)return null;
    // Art adapts to the already-certified union; this bounding box never adds cells.
    const sx=width/GUIDE.floorWidth,sy=height/GUIDE.floorHeight;
    const cellWidth=Math.max(...polygons.map(p=>Math.max(...p.map(v=>v[0]))-Math.min(...p.map(v=>v[0]))));
    const rise=GUIDE.top*cellWidth/64;
    return {polygons,left,top,width,height,sx,sy,rise};
  }
  function path(points){return points.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ')+'Z';}
  function hull(points){
    const list=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const half=values=>{const out=[];for(const p of values){while(out.length>=2&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
    return [...half(list).slice(0,-1),...half(list.slice().reverse()).slice(0,-1)];
  }
  function build(cue,shape){
    const id='er409b-zone-'+(++serial),entry=svg('g',{'data-vfx-zone':cue.id,'data-area-key':cue.key,'pointer-events':'none','aria-hidden':'true'});
    const defs=svg('defs'),clip=svg('clipPath',{id,clipPathUnits:'userSpaceOnUse'});
    // Cosmetic raised volume is the vertical extrusion of exactly those cells.
    // The distinct floor outline remains the mechanical footprint, including holes.
    for(const polygon of shape.polygons)clip.appendChild(svg('path',{d:path(hull([...polygon,...polygon.map(([x,y])=>[x,y-shape.rise])]))}));
    defs.appendChild(clip);entry.appendChild(defs);
    const fill=COLORS[cue.key]||'#bfc9eb',floor=shape.polygons.map(path).join(' ');
    entry.appendChild(svg('path',{d:floor,fill,'fill-opacity':'.10','data-vfx-zone-floor':'true'}));
    const group=svg('g',{'clip-path':'url(#'+id+')',opacity:'.72'});
    const image=svg('image',{x:shape.left-GUIDE.left*shape.sx,y:shape.top-GUIDE.top*shape.sy,width:GUIDE.width*shape.sx,height:GUIDE.height*shape.sy,preserveAspectRatio:'none','image-rendering':'pixelated'});
    group.appendChild(image);entry.appendChild(group);
    entry.appendChild(svg('path',{d:floor,fill:'none',stroke:fill,'stroke-opacity':'.65','stroke-width':'.8','vector-effect':'non-scaling-stroke','data-vfx-zone-boundary':'true'}));
    return {entry,image,key:cue.key};
  }
  async function preload(urls){
    if(typeof root.Image!=='function')return false;
    try{await Promise.all([...new Set(urls)].map(async url=>{const image=new root.Image();image.src=url;
      if(typeof image.decode==='function')await image.decode();else await new Promise((yes,no)=>{image.onload=yes;image.onerror=no;});
      if(!image.naturalWidth||!image.naturalHeight)throw Error('zone image missing');}));return true;
    }catch{return false;}
  }
  async function render(rows,expected,board){
    const frame=readFrame(board);
    if(!frame||!Array.isArray(rows)||rows.length>256){reset();return false;}
    const selected=[],seen=new Set();let cells=0;
    for(const row of rows){
      if(row?.kind!=='zone')continue;
      const cue=normalize(row,expected,frame);
      if(!cue||seen.has(cue.id)){reset();return false;}
      const shape=geometry(cue,board);if(!shape){reset();return false;}
      cells+=cue.cells.length;if(selected.length>=8||cells>1600){reset();return false;}
      seen.add(cue.id);selected.push({cue,shape});
    }
    const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
    const next=JSON.stringify({scope:expected,selected,reduced});
    if(container===frame.node&&signature===next)return true;
    reset();container=frame.node;signature=next;const flight=generation;
    if(!selected.length)return true;
    const urls=selected.flatMap(({cue})=>reduced?[art[cue.key].still]:[art[cue.key].still,...art[cue.key].frames]);
    if(!await preload(urls)||flight!==generation||!board.isConnected||readFrame(board)?.node!==frame.node){
      if(flight===generation)reset();return false;
    }
    const entries=selected.map(({cue,shape})=>build(cue,shape));
    for(const item of entries){item.image.setAttribute('href',art[item.key].still);frame.node.appendChild(item.entry);}
    if(!reduced){let index=0;
      const advance=()=>{timer=null;if(flight!==generation||!frame.node.isConnected)return;
        index=(index+1)%9;for(const item of entries)item.image.setAttribute('href',art[item.key].frames[index]);
        timer=root.setTimeout(advance,DURATION[index]);};
      timer=root.setTimeout(advance,DURATION[0]);
    }
    return true;
  }
  root.BattleVfxZones={configure,normalize,readFrame,cellPolygon,geometry,render,reset,guide:GUIDE};
})(typeof window!=='undefined'?window:globalThis);
