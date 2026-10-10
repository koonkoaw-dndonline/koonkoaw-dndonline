// SP-3: preview intent only; the combat resolver owns targets, saves and spending.
// language-impact: th+en — all player copy goes through the supplied uiCopy.
(function(global){
  'use strict';
  const OPEN = Object.freeze({
    'burning-hands':['cone',15,'self'], thunderwave:['cube',15,'self'],
    fireball:['sphere',20,'point'], 'lightning-bolt':['line',100,'self'],
    shatter:['sphere',10,'point'], 'cone-of-cold':['cone',60,'self'],
    'flame-strike':['cylinder',10,'point']
  });
  const DIRECTIONS=['N','NE','E','SE','S','SW','W','NW'];
  const DIR_TH=['เหนือ','ตะวันออกเฉียงเหนือ','ตะวันออก','ตะวันออกเฉียงใต้','ใต้','ตะวันตกเฉียงใต้','ตะวันตก','ตะวันตกเฉียงเหนือ'];
  const integer=Number.isSafeInteger;
  function supported(slug,spec){
    const row=OPEN[slug];
    return !!(row&&spec&&spec.kind==='area'&&row[0]===spec.shape&&row[1]===spec.sizeFt&&row[2]===spec.origin);
  }
  function project(spell,snapshot,selection){
    const spec=spell.menuDecision&&spell.menuDecision.target, geom=global.SpellAreaGeometry;
    if(!geom||!supported(spell.id,spec)||!snapshot||!snapshot.g||!Array.isArray(snapshot.toks)||!Array.isArray(snapshot.entries)) return null;
    const g=snapshot.g, tokens=snapshot.toks;
    if(!g.id||!g.encounter_id||![g.cols,g.rows,g.cell_ft].every(integer)||g.cols<1||g.rows<1||g.cols>128||g.rows>128||g.cell_ft<1||spec.sizeFt%g.cell_ft) return null;
    const inside=t=>integer(t.col)&&integer(t.row)&&t.col>=0&&t.row>=0&&t.col<g.cols&&t.row<g.rows;
    const casters=tokens.filter(t=>t.ref_char_id===snapshot.casterId&&t.kind!=='object'&&t.kind!=='marker');
    if(casters.length!==1||!inside(casters[0])||(casters[0].size??1)!==1) return null;
    const caster=casters[0], origin=spec.origin==='self'?{col:caster.col,row:caster.row}:selection.point;
    const rangeFt=spec.origin==='point'?Number(String(spell.range).match(/\d+/)?.[0]):spec.sizeFt;
    if(!origin||!inside(origin)||!Number.isFinite(rangeFt)||rangeFt<1||
      (spec.origin==='self'&&!DIRECTIONS.includes(selection.direction))||
      Math.max(Math.abs(origin.col-caster.col),Math.abs(origin.row-caster.row))*g.cell_ft>rangeFt) return null;
    const template={shape:spec.shape,origin:spec.origin,originCell:origin,sizeFt:spec.sizeFt,cellFt:g.cell_ft,direction:spec.origin==='self'?selection.direction:null};
    const cells=geom.spellAreaPickerCells(template,g.cols,g.rows);
    if(!cells||!cells.length) return null;
    const targets=[], visible=[], seen=new Set();
    for(const token of tokens){
      if(!['pc','ally','monster','npc'].includes(token.kind)) continue;
      const hit=geom.spellAreaPickerHitsToken(template,token);
      if(hit==null||token.grid_id!==g.id) return null;
      const hidden=Array.isArray(token.flags)&&token.flags.some(f=>/dead|down|hidden|invisib|ซ่อน|ล่องหน/i.test(String(f)));
      const ref=token.ref_combat_state_id??token.ref_char_id;
      const matches=snapshot.entries.filter(e=>token.ref_combat_state_id?e.side==='enemy'&&e.combat_state_id===ref:e.side==='party'&&e.character_id===ref);
      if(hit&&(!ref||seen.has(ref)||!token.id)) return null;
      if(hit) seen.add(ref);
      if(hidden||!matches.length||matches[0].is_active===false) continue;
      if(matches.length!==1||!matches[0].display_name||!inside(token)) return null;
      const item={id:token.id,ref,name:matches[0].display_name,side:matches[0].side,col:token.col,row:token.row,size:token.size??1};
      visible.push(item);if(hit) targets.push(item);
    }
    const range=[];
    for(let row=0;row<g.rows;row++) for(let col=0;col<g.cols;col++)
      if(Math.max(Math.abs(col-caster.col),Math.abs(row-caster.row))*g.cell_ft<=rangeFt) range.push({col,row});
    const allies=targets.filter(t=>t.side==='party');
    const payload={version:1,mode:'area',spell_slug:spell.id,slot_level:selection.level,confirm_allies:false,
      area:{shape:spec.shape,size_ft:spec.sizeFt,origin:spec.origin,origin_cell:origin,direction:template.direction},
      point:spec.origin==='point'?origin:null};
    const validLevel=integer(selection.level)&&selection.level>=spell.level&&selection.level<=9;
    if(spell.id==='flame-strike'&&selection.level>5){
      if(!['fire','radiant'].includes(selection.upcastDamageType))return null;
      payload.upcast_damage_type=selection.upcastDamageType;
    }else if(selection.upcastDamageType!=null)return null;
    return {g,caster,cells,range,rangeFt,targets,visible,allies,payload,
      ready:validLevel&&targets.some(t=>t.side==='enemy'),
      signature:JSON.stringify([g.id,g.encounter_id,g.cols,g.rows,g.cell_ft,caster.id,payload,targets,visible])};
  }
  function open(options){
    const {spell,copy,document:doc,onCommit,refresh,capability,slotsLeft}=options;
    if(capability()!==true||!supported(spell.id,spell.menuDecision&&spell.menuDecision.target)) return null;
    const oldFocus=doc.activeElement, spec=spell.menuDecision.target;
    let snapshot=options.snapshot, closed=false, generation=0, busy=false, reviewed=false, confirmedAllies=false, currentConfirm=null;
    let selection={level:Math.max(1,spell.level),direction:'N',point:null,upcastDamageType:null};
    const levels=()=>Array.from({length:10-Math.max(1,spell.level)},(_,i)=>i+Math.max(1,spell.level)).filter(n=>slotsLeft(n)>0);
    selection.level=levels()[0]||selection.level;
    if(spell.id==='flame-strike'&&selection.level>5)selection.upcastDamageType='fire';
    const caster=(snapshot&&snapshot.toks||[]).find(t=>t.ref_char_id===snapshot.casterId);
    if(caster) selection.point={col:caster.col,row:caster.row};
    function node(tag,text,parent){const el=doc.createElement(tag);if(text!=null)el.textContent=text;if(parent)parent.appendChild(el);return el;}
    const overlay=node('div',null,doc.body);overlay.id='ccAreaPick';
    overlay.style.cssText='position:fixed;inset:0;z-index:100001;background:#000b;display:flex;align-items:center;justify-content:center;padding:8px';
    const panel=node('div',null,overlay);panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',copy('เลือกพื้นที่เวท','Choose spell area'));
    panel.style.cssText='width:min(100%,560px);max-height:100%;background:#171c26;color:#fff;border:1px solid #aab3c4;border-radius:10px;display:flex;flex-direction:column;font:15px/1.5 sans-serif;overflow:hidden';
    const head=node('div',null,panel);head.style.cssText='padding:10px 12px;border-bottom:1px solid #566';
    const body=node('div',null,panel);body.style.cssText='min-height:0;overflow:auto;padding:10px 12px';
    const foot=node('div',null,panel);foot.style.cssText='display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px max(10px,env(safe-area-inset-bottom));border-top:1px solid #566';
    function button(text,parent,fn){const b=node('button',text,parent);b.type='button';b.style.cssText='min-height:44px;padding:8px 12px;background:#28384b;color:white;border:1px solid #8093a8;border-radius:7px;cursor:pointer';b.onclick=fn;return b;}
    function close(){closed=true;generation++;unsubscribe?.();overlay.remove();oldFocus?.focus?.();options.onClose?.();}
    function changed(){reviewed=false;confirmedAllies=false;draw();}
    function select(label,values,value,fn){const wrap=node('label',label,head);wrap.style.cssText='display:inline-flex;align-items:center;gap:6px;margin:6px 10px 0 0';const el=node('select',null,wrap);el.style.cssText='min-height:44px;max-width:200px';values.forEach(([v,t])=>{const o=node('option',t,el);o.value=String(v);});el.value=String(value);el.onchange=()=>{fn(el.value);changed();};return el;}
    overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Tab'){const all=Array.from(panel.querySelectorAll('button:not(:disabled),select,input'));const first=all[0],last=all[all.length-1];if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first?.focus();}}};
    function draw(){
      const ticket=++generation;currentConfirm=null;head.replaceChildren();body.replaceChildren();foot.replaceChildren();
      node('strong',spell.name,head).style.display='block';
      button(copy('ยกเลิก','Cancel'),foot,close);
      if(capability()!==true){node('p',copy('ยังไม่เปิดการยืนยันพื้นที่เวท เลือกคำสั่งอื่นได้','Area confirmation is unavailable. You can choose another command.'),body);return;}
      select(copy('สล็อต','Slot'),levels().map(n=>[n,'L'+n]),selection.level,v=>{selection.level=+v;selection.upcastDamageType=spell.id==='flame-strike'&&+v>5?'fire':null;});
      if(spell.id==='flame-strike'&&selection.level>5)select(copy('เพิ่มลูกเต๋าให้ธาตุ','Add upcast dice to'),[['fire',copy('ไฟ','Fire')],['radiant',copy('แสงศักดิ์สิทธิ์','Radiant')]],selection.upcastDamageType,v=>selection.upcastDamageType=v);
      if(spec.origin==='self') select(copy('ทิศ','Direction'),DIRECTIONS.map((d,i)=>[d,copy(DIR_TH[i],d)]),selection.direction,v=>selection.direction=v);
      else if(snapshot&&snapshot.g){
        select(copy('คอลัมน์','Column'),Array.from({length:snapshot.g.cols},(_,i)=>[i,String(i+1)]),selection.point?.col,v=>selection.point={col:+v,row:selection.point?.row||0});
        select(copy('แถว','Row'),Array.from({length:snapshot.g.rows},(_,i)=>[i,String(i+1)]),selection.point?.row,v=>selection.point={col:selection.point?.col||0,row:+v});
      }
      const model=project(spell,snapshot,selection);
      if(!model){node('p',copy('ยังตรวจพื้นที่หรือระยะไม่ได้ กรุณาเลือกใหม่หรือเปิดเมนูอีกครั้ง','Cannot verify area or range. Choose again or reopen the menu.'),body);return;}
      const rangeText=spec.origin==='point'?copy('ระยะร่าย ','Cast range '):copy('จุดกำเนิด: ตัวเอง · ความยาวพื้นที่ ','Origin: self · Area extent ');
      node('div',rangeText+model.rangeFt+copy(' ฟุต',' ft')+' · '+copy('ขนาดพื้นที่ ','Area size ')+spec.sizeFt+copy(' ฟุต',' ft'),body);
      const preview=node('div',null,body);preview.setAttribute('data-area-preview','1');
      const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');preview.appendChild(svg);
      svg.setAttribute('viewBox','0 0 '+model.g.cols+' '+model.g.rows);svg.setAttribute('role','img');svg.setAttribute('aria-label',copy('ภาพตัวอย่างระยะและพื้นที่เวท','Spell range and area preview'));
      svg.style.cssText='display:block;width:100%;height:240px;background:#10151c;border:1px solid #8190a0;margin:8px 0;touch-action:manipulation';
      function mark(tag,attrs){const el=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const key in attrs)el.setAttribute(key,String(attrs[key]));svg.appendChild(el);return el;}
      const area=new Set(model.cells.map(c=>c.col+','+c.row)), range=new Set(model.range.map(c=>c.col+','+c.row));
      for(let row=0;row<model.g.rows;row++) for(let col=0;col<model.g.cols;col++) mark('rect',{x:col,y:row,width:1,height:1,fill:area.has(col+','+row)?'#bf7428':range.has(col+','+row)?'#254c6b':'#10151c',stroke:'#718096','stroke-width':0.025});
      model.visible.forEach((t,i)=>{mark('rect',{x:t.col+0.12,y:t.row+0.12,width:t.size-0.24,height:t.size-0.24,fill:t.side==='party'?'#d7f3e3':'#f2bbc0',stroke:'#000','stroke-width':0.04});const label=mark('text',{x:t.col+t.size/2,y:t.row+t.size/2+0.15,'text-anchor':'middle','font-size':0.45,fill:'#111'});label.textContent=String(i+1);});
      mark('rect',{x:model.payload.area.origin_cell.col,y:model.payload.area.origin_cell.row,width:1,height:1,fill:'none',stroke:'#fff','stroke-width':0.12});
      if(spec.origin==='point') svg.onclick=e=>{if(busy)return;const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const matrix=svg.getScreenCTM();if(!matrix)return;const p=pt.matrixTransform(matrix.inverse());const col=Math.floor(p.x),row=Math.floor(p.y);if(col>=0&&row>=0&&col<model.g.cols&&row<model.g.rows){selection.point={col,row};changed();}};
      node('div',copy('น้ำเงิน: ระยะ · ส้ม: พื้นที่โดน · กรอบขาว: จุดกำเนิด','Blue: range · Orange: affected area · White border: origin'),preview);
      const roster=node('div',null,body);roster.style.cssText='overflow-wrap:anywhere;margin-top:8px';
      model.visible.forEach((t,i)=>node('div',(i+1)+'. '+t.name+(model.targets.some(hit=>hit.id===t.id)?copy(' — อยู่ในพื้นที่',' — in area'):''),roster));
      if(model.allies.length){node('p',copy('ระวัง: พวกเดียวกันอยู่ในพื้นที่ — ','Warning: allies in the area — ')+model.allies.map(t=>t.name).join(', '),body);
        const label=node('label',null,body);label.style.cssText='display:flex;gap:8px;align-items:center;min-height:44px';const check=node('input',null,label);check.type='checkbox';check.checked=confirmedAllies;node('span',copy('ยืนยันให้พวกเดียวกันอยู่ในพื้นที่','Confirm including these allies'),label);check.onchange=()=>{confirmedAllies=check.checked;draw();};}
      if(!model.ready){node('p',copy('ต้องมีศัตรูอย่างน้อยหนึ่งตัวในพื้นที่ และมีสล็อตที่ใช้ได้','The area needs at least one enemy and an available spell slot.'),body);return;}
      if(!reviewed){button(copy('ตรวจพื้นที่ก่อนยืนยัน','Review area before confirmation'),foot,()=>{reviewed=true;draw();});return;}
      // Confirmation is only attached after the range/area preview has been painted.
      (options.frame||global.requestAnimationFrame)(()=>{(options.frame||global.requestAnimationFrame)(()=>{
        if(closed||ticket!==generation||capability()!==true||!reviewed)return;
        const confirm=button(copy('ยืนยันพื้นที่','Confirm area'),foot,async()=>{
          if(busy||capability()!==true||!reviewed||(model.allies.length&&!confirmedAllies))return;
          busy=true;confirm.disabled=true;
          try{
            const fresh=await refresh();if(closed)return;
            const check=project(spell,fresh,selection);
            if(capability()!==true||!check||check.signature!==model.signature||slotsLeft(selection.level)<=0){snapshot=fresh;reviewed=false;confirmedAllies=false;draw();options.notice?.(copy('ข้อมูลเปลี่ยนแล้ว กรุณาตรวจพื้นที่ใหม่','The board changed. Review the area again.'));return;}
            onCommit({...check.payload,confirm_allies:check.allies.length?confirmedAllies:false},check.signature);close();
          }catch(_error){reviewed=false;confirmedAllies=false;snapshot=null;draw();options.notice?.(copy('ตรวจข้อมูลล่าสุดไม่สำเร็จ ยังไม่ได้ส่งเวท','Could not verify the latest board. The spell was not submitted.'));}
          finally{busy=false;}
        });currentConfirm=confirm;confirm.setAttribute('data-area-confirm','1');confirm.disabled=busy||(model.allies.length>0&&!confirmedAllies)||slotsLeft(selection.level)<=0;
      });});
    }
    const unsubscribe=options.subscribeCapability?.(()=>{if(closed)return;if(capability()!==true)currentConfirm?.remove();if(!busy){reviewed=false;confirmedAllies=false;draw();}});
    draw();panel.querySelector('select,button')?.focus();return {close};
  }
  global.SpellAreaPicker={supported,project,open};
})(globalThis);
