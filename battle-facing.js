// FACE-02 / W277. language-impact: none — visual URL selection and reason codes only.
(function(root){
  'use strict';
  const ORDER=Object.freeze(['N','NE','E','SE','S','SW','W','NW']);
  const DIR=new Set(ORDER);
  const KEY=/^[a-z]+_(?:female|male)_(?:[a-z]+(?:_[a-z]+)*)$/;
  const HASH=/^[a-f0-9]{64}$/i;
  const SLUG=Object.freeze({N:'north',NE:'north-east',E:'east',SE:'south-east',S:'south',SW:'south-west',W:'west',NW:'north-west'});
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function fromDelta(dc,dr,previous){
    if(!Number.isFinite(dc)||!Number.isFinite(dr))return DIR.has(previous)?previous:null;
    const x=Math.sign(dc),y=Math.sign(dr);
    if(x===0&&y===0)return DIR.has(previous)?previous:null;
    return (y<0?'N':y>0?'S':'')+(x<0?'W':x>0?'E':'');
  }
  function fromCells(start,end,previous){
    if(!start||!end)return DIR.has(previous)?previous:null;
    if([start.col,start.row,end.col,end.row].some(v=>v===null||v===undefined||v===''))
      return DIR.has(previous)?previous:null;
    const numbers=[start.col,start.row,end.col,end.row].map(Number);
    if(numbers.some(n=>!Number.isInteger(n)))return DIR.has(previous)?previous:null;
    return fromDelta(numbers[2]-numbers[0],numbers[3]-numbers[1],previous);
  }
  function fromCommittedReceipt(row,scope,token){
    if(!row||!scope||!token||token.kind!=='pc'||
      String(token.id)!==String(row.token_id)||
      String(token.ref_char_id)!==String(row.character_id)||
      !UUID.test(String(row.token_id||''))||
      String(row.campaign_id)!==String(scope.campaign_id)||
      String(row.encounter_id)!==String(scope.encounter_id)||
      Number(row.group_no)!==Number(scope.group_no)||
      !UUID.test(String(row.character_id||''))||
      !['move','attack'].includes(row.source_kind)||!DIR.has(row.direction)||
      !['v1','v2'].includes(row.pack)||!Number.isSafeInteger(Number(row.source_seq))||
      Number(row.source_seq)<1)return null;
    return Object.freeze({tokenId:row.token_id,characterId:row.character_id,
      direction:row.direction,pack:row.pack,seq:Number(row.source_seq)||0});
  }
  function approvedSet(manifest,pack,key){
    if(!manifest||manifest.active!==true||manifest.schema_version!==1||
      !['v1','v2'].includes(pack)||!KEY.test(String(key||'')))return null;
    const set=manifest.sets&&manifest.sets[pack+'/'+key];
    if(!set||set.status!=='owner_approved'||set.pack!==pack||set.key!==key||
      !set.directions||!ORDER.every(d=>{
        const item=set.directions[d];
        return item&&HASH.test(String(item.sha256||''))&&
          (!item.path||item.path===pack+'/'+key+'/'+SLUG[d]+'.png')&&
          Number.isInteger(item.anchor_y)&&item.anchor_y>=0&&item.anchor_y<=128;
      }))return null;
    return set;
  }
  function select(input){
    const fallback=Object.freeze({href:input&&input.fallback||null,anchorFraction:0.875,
      directional:false,reason:'fallback'});
    if(!input||input.enabled!==true||input.kind!=='pc'||!UUID.test(String(input.characterId||''))||
      !DIR.has(input.direction))return fallback;
    const set=approvedSet(input.manifest,input.pack,input.key);
    if(!set)return fallback;
    const base=String(input.base||'');
    if(!base||!/^https?:\/\/|^\//.test(base))return fallback;
    const item=set.directions[input.direction];
    const href=base.replace(/\/$/,'')+'/'+(item.path||input.pack+'/'+input.key+'/'+input.direction+'.png')+'?v='+
      encodeURIComponent(String(input.manifest.version||''));
    return Object.freeze({href,anchorFraction:item.anchor_y/128,directional:true,reason:'approved'});
  }
  function selectTokenAsset(input){
    const fallback=Object.freeze({href:input&&input.fallback||null,anchorFraction:0.875,
      directional:false,reason:'fallback'});
    const token=input&&input.token;
    if(!token||token.kind!=='pc'||!UUID.test(String(token.ref_char_id||'')))return fallback;
    const match=String(input.fallback||'').match(/\/([a-z]+_(?:female|male)_[a-z_]+)\.png(?:\?.*)?$/);
    if(!match)return fallback;
    const pack=Array.isArray(token.flags)&&token.flags.some(f=>String(f).toLowerCase()==='sprite_set:v1')?'v1':'v2';
    const choice=select({enabled:input.enabled,kind:'pc',characterId:token.ref_char_id,
      direction:token.facing,pack,key:match[1],manifest:input.manifest,
      base:input.base,fallback:input.fallback});
    return choice.directional&&input.failedUrls&&input.failedUrls[choice.href]===false
      ?fallback:choice;
  }
  root.BattleFacing=Object.freeze({ORDER,fromDelta,fromCells,fromCommittedReceipt,approvedSet,select,selectTokenAsset});
})(typeof window!=='undefined'?window:globalThis);
