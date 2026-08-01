/*
 * Grid command host adapter — pre-wire module.
 *
 * This script only publishes a factory. It does not create a controller,
 * bind events, or change the current battle UI until the host wires it.
 *
 * language-impact: th+en — adapter-owned picker copy is paired; identity,
 * event, snapshot, and draft fields are language-neutral.
 */
(function attachGridCommandAdapter(root){
  'use strict';

  const BUILD='20260731-adapter-prewire-1';
  const SVG_NS='http://www.w3.org/2000/svg';
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
      moveSelected:'🚶 เลือก {cell} แล้ว → กด ✓',
      aoeSelected:'🎯 ศูนย์กลาง {cell} · ครอบคลุม {count} ช่อง → กด ✓',
      confirmMove:'ยืนยันช่องปลายทาง',
      confirmAoe:'ยืนยันพื้นที่',
      cancel:'ยกเลิก'
    }),
    en:Object.freeze({
      movePrompt:'🚶 Tap a green cell, then press ✓ to confirm.',
      aoePrompt:'🎯 Tap the center cell, then press ✓ to confirm the area.',
      moveSelected:'🚶 {cell} selected → press ✓',
      aoeSelected:'🎯 Center {cell} · {count} cells affected → press ✓',
      confirmMove:'Confirm destination',
      confirmAoe:'Confirm area',
      cancel:'Cancel'
    })
  });

  function own(object,key){
    return Object.prototype.hasOwnProperty.call(object,key);
  }

  function isObject(value){
    return !!value&&typeof value==='object'&&!Array.isArray(value);
  }

  function clean(value){
    return String(value==null?'':value).trim();
  }

  function finite(value){
    if(value===null||value===undefined||value==='') return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  }

  function integer(value,min,max){
    const number=Number(value);
    return Number.isInteger(number)&&number>=min&&number<=max?number:null;
  }

  function language(value){
    return String(value||'').toLowerCase()==='en'?'en':'th';
  }

  function copy(lang,key,vars){
    let text=(COPY[language(lang)]&&COPY[language(lang)][key])||'';
    Object.entries(vars||{}).forEach(function(entry){
      text=text.split('{'+entry[0]+'}').join(String(entry[1]));
    });
    return text;
  }

  function cellLabel(c,r){
    const columns='ABCDEFGHIJKLMNOPQRST';
    return Number.isInteger(c)&&c>=0&&c<columns.length&&Number.isInteger(r)&&r>=0
      ?columns[c]+String(r+1)
      :'';
  }

  function validIdentity(identity){
    return isObject(identity)&&IDENTITY_FIELDS.every(function(field){
      return clean(identity[field]).length>0;
    });
  }

  function setAttribute(node,name,value){
    if(!node||typeof node.setAttribute!=='function') return false;
    node.setAttribute(name,String(value));
    return true;
  }

  function addListener(node,type,handler){
    if(!node||typeof handler!=='function') return false;
    if(typeof node.addEventListener==='function'){
      node.addEventListener(type,handler);
      return true;
    }
    node['on'+type]=handler;
    return true;
  }

  function removeNode(node){
    if(!node) return;
    try{
      if(typeof node.remove==='function') node.remove();
      else if(node.parentNode&&typeof node.parentNode.removeChild==='function') node.parentNode.removeChild(node);
    }catch(error){}
  }

  function freezeShape(shape){
    return shape?Object.freeze(shape):null;
  }

  function freezeCell(cell){
    return Object.freeze(cell);
  }

  function liveCampaign(){
    try{ if(typeof campaign!=='undefined') return campaign; }catch(error){}
    return root.campaign||null;
  }

  function liveRound(){
    try{ if(typeof curRound!=='undefined') return curRound; }catch(error){}
    return root.curRound||null;
  }

  function liveGridCache(){
    try{ if(typeof _gridCache!=='undefined') return _gridCache; }catch(error){}
    return root._gridCache||null;
  }

  function liveCharacter(){
    try{ if(typeof myChar!=='undefined') return myChar; }catch(error){}
    return root.myChar||null;
  }

  function liveSheet(){
    try{ if(typeof mySheet!=='undefined') return mySheet; }catch(error){}
    return root.mySheet||null;
  }

  function liveGroupNo(){
    try{ if(typeof terminalGroupForUi==='function') return terminalGroupForUi(); }catch(error){}
    const character=liveCharacter();
    return character&&character.group_no!=null?character.group_no:null;
  }

  function liveLanguage(){
    try{ if(typeof uiLanguage==='function') return uiLanguage(); }catch(error){}
    const campaignRow=liveCampaign();
    return campaignRow&&campaignRow.game_language||'th';
  }

  function liveCloseSheets(){
    try{ if(typeof bsCloseSheets==='function') return bsCloseSheets; }catch(error){}
    return null;
  }

  function liveToast(){
    try{ if(typeof toast==='function') return toast; }catch(error){}
    return null;
  }

  function createAdapter(host){
    host=isObject(host)?host:{};
    let revision=0;
    let mounted=null;
    let binding=null;

    function hostValue(name,fallback){
      try{
        if(own(host,name)){
          const value=host[name];
          return typeof value==='function'?value():value;
        }
        return typeof fallback==='function'?fallback():undefined;
      }catch(error){
        return undefined;
      }
    }

    function documentForHost(){
      return hostValue('document',function(){ return root.document||null; });
    }

    function campaignForHost(){
      return hostValue('campaign',liveCampaign);
    }

    function roundForHost(){
      return hostValue('round',liveRound);
    }

    function cacheForHost(){
      return hostValue('gridCache',liveGridCache);
    }

    function characterForHost(){
      return hostValue('character',liveCharacter);
    }

    function sheetForHost(){
      return hostValue('sheet',liveSheet);
    }

    function groupForHost(){
      return hostValue('groupNo',liveGroupNo);
    }

    function languageForHost(){
      return language(hostValue('language',liveLanguage));
    }

    function readIdentity(){
      const campaignRow=campaignForHost();
      const roundRow=roundForHost();
      const cache=cacheForHost();
      const grid=hostValue('grid',function(){ return cache&&cache.grid; });
      const encounterId=hostValue('encounterId',function(){ return root.gEncId; });
      const groupNo=groupForHost();
      if(!campaignRow||!roundRow||!grid) return false;
      const baseRevision=hostValue('gridRevision',function(){
        return grid.updated_at||(cache&&cache.ts)||('grid:'+clean(grid.id));
      });
      const identity={
        campaignId:clean(campaignRow.id),
        encounterId:clean(encounterId),
        roundId:clean(roundRow.id),
        groupNo:clean(groupNo),
        gridId:clean(grid.id),
        gridRevision:clean(baseRevision)+'#'+String(revision)
      };
      return validIdentity(identity)?Object.freeze(identity):false;
    }

    function bumpRevision(){
      revision+=1;
      return revision;
    }

    function geometryFor(input,c,r,mode){
      const geometry=isObject(input.geometry)?input.geometry:{};
      let center=null;
      const centerFor=typeof geometry.centerFor==='function'
        ?geometry.centerFor
        :(typeof input.centerFor==='function'?input.centerFor:null);
      try{
        if(centerFor) center=centerFor(c,r);
      }catch(error){
        center=null;
      }
      if(!Array.isArray(center)||finite(center[0])===null||finite(center[1])===null){
        if(mode!=='square') return null;
        const tile=finite(geometry.tile??input.tile)??36;
        const squash=finite(geometry.squash??input.squash)??0.62;
        const padX=finite(geometry.padX??input.padX)??16;
        const padTop=finite(geometry.padTop??input.padTop)??48;
        center=[padX+c*tile+tile/2,padTop+r*tile*squash+(tile*squash)/2];
      }
      const centerX=Number(center[0]), centerY=Number(center[1]);
      if(mode==='isometric'){
        const halfWidth=finite(geometry.halfWidth??input.halfWidth);
        const halfHeight=finite(geometry.halfHeight??input.halfHeight);
        if(halfWidth===null||halfHeight===null||halfWidth<=0||halfHeight<=0) return null;
        return Object.freeze({
          centerX:centerX,
          centerY:centerY,
          shape:freezeShape({
            kind:'polygon',
            points:[
              centerX+','+(centerY-halfHeight),
              (centerX+halfWidth)+','+centerY,
              centerX+','+(centerY+halfHeight),
              (centerX-halfWidth)+','+centerY
            ].join(' ')
          })
        });
      }
      const width=finite(geometry.width??input.width)??36;
      const height=finite(geometry.height??input.height)??(36*0.62);
      if(width<=0||height<=0) return null;
      return Object.freeze({
        centerX:centerX,
        centerY:centerY,
        shape:freezeShape({
          kind:'rect',
          x:centerX-width/2,
          y:centerY-height/2,
          width:width,
          height:height
        })
      });
    }

    function buildSnapshot(input){
      input=isObject(input)?input:{};
      const cache=cacheForHost();
      const grid=input.grid||(cache&&cache.grid);
      const identity=input.identity||readIdentity();
      if(!grid||!validIdentity(identity)||clean(identity.gridId)!==clean(grid.id)) return false;
      const cols=integer(grid.cols??input.cols,1,20);
      const rows=integer(grid.rows??input.rows,1,200);
      const cellFt=finite(grid.cell_ft??input.cellFt??input.cell_ft);
      if(cols===null||rows===null||cellFt===null||cellFt<=0) return false;
      const mode=(input.mode==='isometric'||input.iso===true)?'isometric':'square';
      const tokens=Array.isArray(input.tokens)
        ?input.tokens
        :(cache&&Array.isArray(cache.toks)?cache.toks:null);
      if(!tokens) return false;
      const character=input.character||characterForHost();
      const characterId=clean(input.characterId||(character&&character.id));
      const token=characterId?tokens.find(function(item){
        return clean(item&&item.ref_char_id)===characterId;
      }):null;
      const origin=token&&integer(token.col,0,cols-1)!==null&&integer(token.row,0,rows-1)!==null
        ?Object.freeze({c:Number(token.col),r:Number(token.row)})
        :null;
      const sheet=input.sheet||sheetForHost();
      const speed=finite(input.speedFt??(sheet&&sheet.combat&&sheet.combat.speed))??30;
      const maxCells=Math.max(1,Math.floor(speed/cellFt));
      const terrain=isObject(grid.terrain)?grid.terrain:{};
      const rawWalls=input.walls!==undefined?input.walls:terrain.walls;
      const walls=rawWalls instanceof Set
        ?rawWalls
        :new Set(Array.isArray(rawWalls)?rawWalls.map(clean):[]);
      const cells=[];
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          const geometry=geometryFor(input,c,r,mode);
          if(!geometry) return false;
          const label=cellLabel(c,r);
          const distance=origin?Math.max(Math.abs(c-origin.c),Math.abs(r-origin.r)):Infinity;
          cells.push(freezeCell({
            c:c,
            r:r,
            cell:label,
            pickable:true,
            moveAllowed:!!origin&&distance>0&&distance<=maxCells&&!walls.has(label),
            centerX:geometry.centerX,
            centerY:geometry.centerY,
            shape:geometry.shape
          }));
        }
      }
      return Object.freeze({
        identity:Object.freeze({
          campaignId:clean(identity.campaignId),
          encounterId:clean(identity.encounterId),
          roundId:clean(identity.roundId),
          groupNo:clean(identity.groupNo),
          gridId:clean(identity.gridId),
          gridRevision:clean(identity.gridRevision)
        }),
        cols:cols,
        rows:rows,
        cellFt:cellFt,
        origin:origin,
        cells:Object.freeze(cells)
      });
    }

    function shapeNode(documentRef,cell){
      if(!documentRef||typeof documentRef.createElementNS!=='function'||!cell||!cell.shape) return null;
      const shape=cell.shape;
      let node=null;
      if(shape.kind==='polygon'){
        node=documentRef.createElementNS(SVG_NS,'polygon');
        if(!setAttribute(node,'points',shape.points)) return null;
      }else if(shape.kind==='path'){
        node=documentRef.createElementNS(SVG_NS,'path');
        if(!setAttribute(node,'d',shape.d)) return null;
      }else if(shape.kind==='rect'){
        node=documentRef.createElementNS(SVG_NS,'rect');
        ['x','y','width','height'].forEach(function(name){ setAttribute(node,name,shape[name]); });
      }
      return node;
    }

    function closestItem(svg){
      try{
        if(svg&&typeof svg.closest==='function'){
          const found=svg.closest('.item');
          if(found) return found;
        }
      }catch(error){}
      let node=svg&&svg.parentNode;
      while(node){
        const name=clean(node.className&&node.className.baseVal!==undefined?node.className.baseVal:node.className);
        if((' '+name+' ').indexOf(' item ')>=0) return node;
        node=node.parentNode;
      }
      return null;
    }

    function removeMounted(){
      if(!mounted) return false;
      removeNode(mounted.group);
      removeNode(mounted.controls);
      mounted=null;
      return true;
    }

    function mountPicker(view){
      try{
        if(!isObject(view)||!isObject(view.snapshot)||!isObject(view.handlers)) return false;
        if(view.kind!=='move'&&view.kind!=='aoe') return false;
        if(typeof view.handlers.select!=='function'||typeof view.handlers.confirm!=='function'||typeof view.handlers.cancel!=='function') return false;
        const documentRef=documentForHost();
        if(!documentRef||typeof documentRef.getElementById!=='function'||typeof documentRef.createElement!=='function'||typeof documentRef.createElementNS!=='function') return false;
        const board=documentRef.getElementById('bsBoard');
        if(!board||typeof board.querySelector!=='function') return false;
        const svg=board.querySelector('svg');
        const item=closestItem(svg);
        if(!svg||!item||typeof svg.appendChild!=='function'||typeof item.appendChild!=='function') return false;
        removeMounted();
        const group=documentRef.createElementNS(SVG_NS,'g');
        if(!group||!setAttribute(group,'data-grid-command-overlay',view.sessionId)) return false;
        const cellNodes=[];
        view.snapshot.cells.forEach(function(cell){
          const allowed=view.kind==='move'?cell.moveAllowed:cell.pickable;
          if(!allowed) return;
          const node=shapeNode(documentRef,cell);
          if(!node) return;
          setAttribute(node,'data-grid-command-cell',cell.cell);
          setAttribute(node,'data-grid-c',cell.c);
          setAttribute(node,'data-grid-r',cell.r);
          setAttribute(node,'data-grid-center-x',cell.centerX);
          setAttribute(node,'data-grid-center-y',cell.centerY);
          setAttribute(node,'fill',view.kind==='move'?'rgba(90,210,130,0.20)':'rgba(255,255,255,0.02)');
          setAttribute(node,'stroke',view.kind==='move'?'#5ce08a':'none');
          setAttribute(node,'stroke-width',view.kind==='move'?'0.7':'0');
          setAttribute(node,'style',view.kind==='move'?'cursor:pointer':'cursor:crosshair');
          addListener(node,'click',function(){ view.handlers.select({c:cell.c,r:cell.r}); });
          group.appendChild(node);
          cellNodes.push({cell:cell,node:node});
        });
        if(!cellNodes.length) return false;
        const controls=documentRef.createElement('div');
        const status=documentRef.createElement('span');
        const confirm=documentRef.createElement('button');
        const cancel=documentRef.createElement('button');
        if(!controls||!status||!confirm||!cancel) return false;
        controls.className='optrow';
        if(controls.style) controls.style.marginTop='8px';
        setAttribute(controls,'data-grid-command-controls',view.sessionId);
        status.className='dicelbl';
        setAttribute(status,'data-grid-command-status','1');
        status.textContent=copy(view.request&&view.request.language,view.kind==='move'?'movePrompt':'aoePrompt');
        confirm.className='btn sm';
        confirm.type='button';
        confirm.textContent='✓';
        confirm.title=copy(view.request&&view.request.language,view.kind==='move'?'confirmMove':'confirmAoe');
        setAttribute(confirm,'aria-label',confirm.title);
        setAttribute(confirm,'aria-disabled','true');
        confirm.disabled=true;
        addListener(confirm,'click',view.handlers.confirm);
        cancel.className='btn ghost sm';
        cancel.type='button';
        cancel.textContent=copy(view.request&&view.request.language,'cancel');
        addListener(cancel,'click',view.handlers.cancel);
        controls.appendChild(status);
        controls.appendChild(confirm);
        controls.appendChild(cancel);
        mounted={
          sessionId:view.sessionId,
          kind:view.kind,
          language:language(view.request&&view.request.language),
          snapshot:view.snapshot,
          svg:svg,
          group:group,
          controls:controls,
          status:status,
          confirm:confirm,
          cells:cellNodes,
          marker:null,
          arrow:null
        };
        svg.appendChild(group);
        item.appendChild(controls);
        return true;
      }catch(error){
        removeMounted();
        return false;
      }
    }

    function drawMoveArrow(documentRef,selection){
      if(!mounted||!mounted.snapshot.origin) return true;
      const origin=mounted.snapshot.cells.find(function(item){
        return item.c===mounted.snapshot.origin.c&&item.r===mounted.snapshot.origin.r;
      });
      const destination=mounted.snapshot.cells.find(function(item){ return item.cell===selection.cell; });
      if(!origin||!destination) return false;
      const x1=Number(origin.centerX), y1=Number(origin.centerY);
      const x2=Number(destination.centerX), y2=Number(destination.centerY);
      const dx=x2-x1, dy=y2-y1, length=Math.sqrt(dx*dx+dy*dy);
      if(!Number.isFinite(length)||length<8) return true;
      const ux=dx/length, uy=dy/length, ax=x2-ux*10, ay=y2-uy*10, px=-uy, py=ux;
      const arrow=documentRef.createElementNS(SVG_NS,'g');
      const line=documentRef.createElementNS(SVG_NS,'line');
      const head=documentRef.createElementNS(SVG_NS,'polygon');
      if(!arrow||!line||!head) return false;
      setAttribute(arrow,'data-grid-command-arrow','1');
      setAttribute(arrow,'style','pointer-events:none');
      [['x1',x1],['y1',y1],['x2',ax],['y2',ay],['stroke','#FAC775'],['stroke-width','2.5']]
        .forEach(function(entry){ setAttribute(line,entry[0],entry[1]); });
      setAttribute(head,'points',[
        x2+','+y2,
        (ax+px*5)+','+(ay+py*5),
        (ax-px*5)+','+(ay-py*5)
      ].join(' '));
      setAttribute(head,'fill','#FAC775');
      arrow.appendChild(line);
      arrow.appendChild(head);
      mounted.group.appendChild(arrow);
      mounted.arrow=arrow;
      return true;
    }

    function paintSelection(view){
      try{
        if(!mounted||!isObject(view)||mounted.sessionId!==view.sessionId||mounted.kind!==view.kind) return false;
        const selection=view.selection;
        if(!selection||!clean(selection.cell)) return false;
        const hit=mounted.cells.find(function(entry){ return entry.cell.cell===selection.cell; });
        if(!hit) return false;
        const documentRef=documentForHost();
        if(!documentRef||typeof documentRef.createElementNS!=='function') return false;
        if(view.kind==='move'){
          mounted.cells.forEach(function(entry){
            const selected=entry===hit;
            setAttribute(entry.node,'fill',selected?'rgba(250,199,117,0.55)':'rgba(90,210,130,0.20)');
            setAttribute(entry.node,'stroke',selected?'#FAC775':'#5ce08a');
            setAttribute(entry.node,'stroke-width',selected?'1.6':'0.7');
          });
          removeNode(mounted.arrow);
          mounted.arrow=null;
          if(!drawMoveArrow(documentRef,selection)) return false;
          mounted.status.textContent=copy(mounted.language,'moveSelected',{cell:selection.cell});
        }else{
          const affected=new Set(Array.isArray(view.affected)?view.affected:[]);
          mounted.cells.forEach(function(entry){
            const selected=entry===hit, included=affected.has(entry.cell.cell);
            setAttribute(entry.node,'fill',selected?'rgba(226,75,74,0.62)':(included?'rgba(226,75,74,0.45)':'rgba(255,255,255,0.02)'));
            setAttribute(entry.node,'stroke',selected?'#fff':(included?'#ff7b7b':'none'));
            setAttribute(entry.node,'stroke-width',selected?'1.6':(included?'0.8':'0'));
          });
          if(!mounted.marker){
            mounted.marker=documentRef.createElementNS(SVG_NS,'circle');
            if(!mounted.marker) return false;
            setAttribute(mounted.marker,'data-grid-command-center','1');
            setAttribute(mounted.marker,'r','4');
            setAttribute(mounted.marker,'fill','#fff');
            setAttribute(mounted.marker,'stroke','#e23b3b');
            setAttribute(mounted.marker,'stroke-width','1.5');
            setAttribute(mounted.marker,'style','pointer-events:none');
            mounted.group.appendChild(mounted.marker);
          }
          setAttribute(mounted.marker,'cx',hit.cell.centerX);
          setAttribute(mounted.marker,'cy',hit.cell.centerY);
          mounted.status.textContent=copy(mounted.language,'aoeSelected',{
            cell:selection.cell,
            count:affected.size
          });
        }
        mounted.confirm.disabled=false;
        setAttribute(mounted.confirm,'aria-disabled','false');
        return true;
      }catch(error){
        return false;
      }
    }

    function bindCommand(nextBinding){
      if(!isObject(nextBinding)||(nextBinding.kind!=='move'&&nextBinding.kind!=='aoe')) return false;
      binding=nextBinding;
      return true;
    }

    function applyDraft(draft){
      try{
        if(!binding||!isObject(draft)||binding.kind!==draft.kind) return false;
        if(draft.kind==='move'){
          const cell=clean(draft.destination&&draft.destination.cell);
          if(!cell) return false;
          const movement={label:'เดินไปช่อง '+cell,moveTo:cell};
          if(isObject(binding.turn)){
            binding.turn.movement=movement;
          }else if(typeof binding.applyMovement==='function'){
            if(binding.applyMovement(movement,draft)===false) return false;
          }else{
            return false;
          }
          if(typeof binding.sequenceAdd==='function') binding.sequenceAdd('movement');
          if(typeof binding.setPendingMove==='function'){
            binding.setPendingMove({
              c:draft.destination.c,
              r:draft.destination.r,
              cell:cell
            });
          }
          return true;
        }
        const area=draft.area;
        if(!area||area.policy!=='legacy-chebyshev-v1'||typeof binding.callback!=='function') return false;
        const payload={
          center:clean(area.center&&area.center.cell),
          cells:Array.isArray(area.cells)?area.cells.slice():[],
          radiusFt:Number(area.radiusFt)
        };
        if(!payload.center||!Number.isFinite(payload.radiusFt)) return false;
        return binding.callback(payload)===false?false:true;
      }catch(error){
        return false;
      }
    }

    function closeCommandSheet(){
      try{
        if(typeof host.closeCommandSheet==='function') return host.closeCommandSheet()===false?false:true;
        const closeSheets=liveCloseSheets();
        if(typeof closeSheets!=='function') return false;
        closeSheets();
        return true;
      }catch(error){
        return false;
      }
    }

    function unmountPicker(info){
      if(!mounted) return false;
      if(info&&info.sessionId!=null&&mounted.sessionId!==info.sessionId) return false;
      return removeMounted();
    }

    function resumeCommandMenu(info){
      const current=binding;
      try{
        let result=false;
        if(current&&typeof current.resume==='function') result=current.resume(info)!==false;
        else if(typeof host.resumeCommandMenu==='function') result=host.resumeCommandMenu(info,current)!==false;
        if(result) binding=null;
        return result;
      }catch(error){
        return false;
      }
    }

    function requestFallback(info){
      const current=binding;
      try{
        let result=false;
        if(current&&typeof current.fallback==='function') result=current.fallback(info)!==false;
        else if(typeof host.requestFallback==='function') result=host.requestFallback(info,current)!==false;
        if(result) binding=null;
        return result;
      }catch(error){
        return false;
      }
    }

    function announce(info){
      try{
        if(!info||!clean(info.text)) return false;
        if(typeof host.announce==='function') return host.announce(info)!==false;
        const showToast=liveToast();
        if(typeof showToast!=='function') return false;
        showToast(info.text,info.level==='error');
        return true;
      }catch(error){
        return false;
      }
    }

    function onEvent(event){
      try{
        if(typeof host.onEvent==='function') return host.onEvent(event)!==false;
      }catch(error){}
      return false;
    }

    return Object.freeze({
      build:BUILD,
      readIdentity:readIdentity,
      bumpRevision:bumpRevision,
      buildSnapshot:buildSnapshot,
      bindCommand:bindCommand,
      mountPicker:mountPicker,
      paintSelection:paintSelection,
      applyDraft:applyDraft,
      closeCommandSheet:closeCommandSheet,
      unmountPicker:unmountPicker,
      resumeCommandMenu:resumeCommandMenu,
      requestFallback:requestFallback,
      announce:announce,
      onEvent:onEvent,
      debugState:function(){
        return Object.freeze({
          revision:revision,
          mountedSessionId:mounted?mounted.sessionId:null,
          bindingKind:binding?binding.kind:null
        });
      }
    });
  }

  root.TTRPG_GRID_COMMAND_ADAPTER=Object.freeze({
    build:BUILD,
    copy:COPY,
    create:createAdapter
  });
})(globalThis);
