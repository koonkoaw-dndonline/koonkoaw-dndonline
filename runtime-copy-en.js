/* D3/D4 deterministic runtime copy used by the English display wall.
 * language-impact: th+en — Thai remains the renderer source of truth; English
 * worlds translate known app-owned copy and fail closed on every unknown leak.
 */
(function attachRuntimeCopy(root){
  'use strict';
  const exact=Object.freeze({
    'ย่อ/ขยายเมนู':'Collapse / expand menu','ไปข้อความล่าสุด':'Jump to latest message',
    'สลับสกิน: กระดาษนิยาย / คลาสสิก (พิกเซล)':'Switch theme: story paper / classic pixel',
    'เลือกหมวดเพลง (Auto = เปลี่ยนตามฉาก)':'Choose music mood (Auto follows the scene)',
    'ระดับเสียงดนตรี (ค่าเริ่มต้น 50%)':'Music volume (default 50%)',
    'ก๊อป session token (host) สำหรับเครื่องมือ ingest ลอร์ — token สดทุกครั้งที่กด':'Copy a fresh host session token for lore ingest tools',
    'ต่อสู้':'Battle','บอส':'Boss','เมืองหลวง':'Capital','ดันเจี้ยน':'Dungeon','ป่า/เดินทาง':'Forest / Travel','พักแรม':'Rest','โรงเตี๊ยม':'Tavern','เมือง':'Town','หมู่บ้าน':'Village',
    'บทเก่ากว่านี้ดูสรุปได้ในแท็บ Chronicle':'Older chapters are summarized in the Chronicle tab',
    '▲ โหลดบทก่อนหน้า':'▲ Load Earlier Story','ยังไม่มีข้อความ — เริ่มคุยได้เลย':'No messages yet — start the conversation','— ยังไม่มีข้อความ —':'— No messages yet —',
    '⚔️ ถึงตาคุณแล้ว!':'⚔️ It is your turn!','ส่งโหวตแล้ว ✓':'Vote submitted ✓','ส่งโหวตไม่สำเร็จ ลองใหม่อีกครั้ง':'Vote failed. Try again.',
    'เรื่องนี้จบบริบูรณ์แล้ว':'This story is complete','โลกนี้ปิดถาวร — เลื่อนอ่านเนื้อเรื่องทั้งหมดย้อนหลังได้':'This world is permanently closed. You can still read the full story.',
    'เปิดเรื่องจากสถานที่จริงใน lore ที่ ingest ไว้ (แนะนำ)':'Open at a real location from the ingested lore (recommended)',
    '✨ Begin Adventure (สร้างปูมหลังโลก)':'✨ Begin Adventure (create the world prologue)',
    'อ่านปูมหลังโลกด้านบนก่อน แล้วสร้างตัวละครของคุณให้เข้ากับโลกนี้':'Read the world prologue above, then create a character who fits this world.',
    'วันใหม่ — เตรียมเวทในแท็บ Skills ก่อน ถึงจะสั่งการต่อได้':'A new day has begun. Prepare spells in the Skills tab before acting.',
    'การต่อสู้จบลงด้วยความพ่ายแพ้':'The battle ended in defeat','การต่อสู้สิ้นสุดลง':'The battle is over',
    'อ่านฉากสุดท้ายของ DM ด้านบน แล้วกด':'Read the DM’s final scene above, then select',
    'ไปต่อ':'Continue','✓ ไปต่อ (อ่านจบแล้ว)':'✓ Continue (finished reading)',
    '⚡ ข้ามรอทุกคน → ไปต่อ':'⚡ Skip the wait → Continue','⚡ ข้ามรอทุกคน → VICTORY':'⚡ Skip the wait → VICTORY',
    '🎲 ขอตัวเลือกเฉพาะตัว':'🎲 Request Personal Options','🎲 DM กำลังคิดตัวเลือกให้คุณ…':'🎲 The DM is preparing options for you…',
    'ขอตัวเลือกไม่สำเร็จ':'Could not request personal options','ยังไม่ได้ตัวเลือก ลองอีกครั้ง':'No options yet. Try again.',
    'Type your action first':'Type your action first','ส่งแล้ว ✓':'Submitted ✓','ส่งไม่สำเร็จ':'Submission failed','Action submitted ✓':'Action submitted ✓',
    'ระบบถาม':'System prompt','จะใช้บัฟช่วยการทอยหรือไม่?':'Use a buff on this roll?',
    'ชีท/สกิล':'Sheet / Skills','ปิด':'Close','สั่งการ':'Commands','ลำดับ':'Initiative','บันทึก':'Log','สถานะ':'Status','แชท':'Chat','ล้าง':'Clear',
    'คำพูด/โรลเพลย์ (ทุกคนเห็น)…':'Dialogue / roleplay (visible to everyone)…','ฉากต่อสู้':'Battle Scene','รอดมาได้!':'Survived!',
    'ตั้ง HP':'Set HP','ใส่ตัวเลข HP':'Enter an HP value','ไม่สำเร็จ':'Operation failed',
    'จบการต่อสู้ทันที':'End Combat Now','จบการต่อสู้ปัจจุบันทันที? (ศัตรูถอนจากฉาก)':'End the current combat now? Enemies will leave the scene.',
    'จบการต่อสู้แล้ว ✓':'Combat ended ✓','ล้างแชททั้งห้อง (ลบจริง)':'Clear Room Chat (permanent)',
    'ลบแชททั้งหมดของห้องนี้ถาวร?\nทุกเครื่องเห็นผล และกู้คืนไม่ได้':'Permanently delete all chat in this room?\nEvery device will see the change, and it cannot be undone.',
    'มอนในศึก':'Combatant','ตั้ง HP มอน':'Set Monster HP','รีเฟรชรายชื่อ/HP มอน':'Refresh monster list / HP','เลือกมอนในศึกก่อน':'Choose a monster first',
    'สไตล์ DM:':'DM style:','ปกติ — base DanMachi':'Standard — base DanMachi','Cinematic — ภาพยนตร์ · NPC จัดจ้าน · slow-burn':'Cinematic — vivid NPCs and slow-burn drama',
    'High-energy — ด้นสดรับลูก · ตลกสลับดราม่า':'High-energy — responsive improvisation, comedy, and drama','Intimate — อารมณ์ใกล้ชิด · สยองค่อยๆ บีบ':'Intimate — close emotion and slowly tightening horror',
    'ตั้งสไตล์':'Set Style','โหมดการเล่น:':'Play mode:','🌍 OPEN WORLD — อิสระเต็มรูปแบบ':'🌍 OPEN WORLD — full freedom','📖 SESSION — จบเป็นตอน ในโลกต่อเนื่อง':'📖 SESSION — episodic play in a persistent world','ตั้งโหมด':'Set Mode',
    'โครงเรื่อง session (ลับ — ผู้เล่นไม่เห็น):':'Session plan (private — players cannot see it):','เป้าหมาย เช่น พาปาร์ตี้ไปพบผู้เฒ่าในถ้ำ':'Goal, e.g. lead the party to the elder in the cave','climax เช่น เผชิญหน้าหัวหน้าโจร':'Climax, e.g. confront the bandit chief','วางโครงเรื่อง':'Set Plan','ล้างโครงเรื่องแล้ว ✓':'Session plan cleared ✓','วางโครงเรื่องแล้ว ✓ DM จะค่อยๆ พาเรื่องไป':'Session plan saved ✓ The DM will guide the story gradually.','ใส่เป้าหมายก่อน':'Enter a goal first','ล้างโครงเรื่อง session?':'Clear the session plan?',
    'ปกติ':'Normal','ยังไม่มีบันทึก — ระบบเดินเรียบ':'No system logs yet — everything is running normally',
    'ไฟล์ .md / .txt (กฎ/lore/ตารางสุ่ม) — DM จะค้นมาใช้อัตโนมัติตอนเล่าเรื่องที่เกี่ยวข้อง':'Upload .md or .txt rules, lore, or random tables. The DM retrieves them automatically when relevant.',
    'ยังไม่มีไฟล์ — อัปด้านบน':'No files yet — upload one above','DM ยังไม่ได้เพิ่มไฟล์อ้างอิง':'The DM has not added reference files','ไฟล์อ้างอิงทั้งหมด':'All Reference Files',
    'อัปเพลง (.mp3/.ogg/.m4a) ผูกอารมณ์ฉาก — DM เปลี่ยนฉากเพลงจะสลับให้ (ทุกคนเพิ่มได้)':'Upload .mp3, .ogg, or .m4a tracks by scene mood. Music follows the scene, and everyone may contribute.',
    'เพลงทั้งหมด':'All Tracks','เลือกไฟล์เพลงก่อน':'Choose a music file first','ไฟล์ใหญ่เกิน 15MB':'The file exceeds 15 MB','เพิ่มเพลงแล้ว ✓':'Track added ✓','อัปเพลงล้มเหลว':'Track upload failed','ลบเพลงนี้?':'Delete this track?','ลบแล้ว':'Deleted',
    'การแสดง':'Performance','อัปเพลงของตัวละคร (สูงสุด 3 · .mp3/.ogg) → ระหว่างเล่าเรื่องกด "เปิดการแสดง" เพลงจะสลับเป็นเพลงนี้ทั้งปาร์ตี้ จนกว่าจะกดหยุด (เข้าฉากสู้หยุดอัตโนมัติ)':'Upload up to three character tracks (.mp3/.ogg). Start a performance to play it for the party until stopped; combat stops it automatically.','ฟังตัวอย่าง':'Preview',
    'จบแล้ว':'Ended','คัดลอกแล้ว':'Copied','ก๊อปไม่สำเร็จ':'Copy failed','ไม่พบ session — ลองรีเฟรช':'No session found. Refresh and try again.'
  });
  const patterns=Object.freeze([
    [/^โหวตเส้นทางปาร์ตี้ \((\d+) โหวตแล้ว\)$/u,(_m,n)=>`Party Path Vote (${n} votes)`],
    [/^(.*) — (\d+) เสียง$/u,(_m,label,n)=>`${label} — ${n} votes`],
    [/^พร้อมแล้ว (\d+)\/(\d+) คน$/u,(_m,a,b)=>`Ready: ${a}/${b}`],
    [/^✓ คุณพร้อมแล้ว — รอเพื่อนอีก (\d+) คน$/u,(_m,n)=>`✓ You are ready — waiting for ${n} more`],
    [/^⭐ เลเวลอัพ (\d+)\/(\d+) — เลือกสกิลในแท็บ Stat ก่อน$/u,(_m,a,b)=>`⭐ Level up ${a}/${b} — choose features in the Stat tab first`],
    [/^⚡ ข้ามรอทุกคน \(host\)$/u,()=>`⚡ Skip the wait (Host)`],
    [/^ตอนที่ (\d+) จบบริบูรณ์$/u,(_m,n)=>`Episode ${n} is complete`],
    [/^▶ เริ่มตอนที่ (\d+)$/u,(_m,n)=>`▶ Start Episode ${n}`],
    [/^📖 เริ่มตอนที่ (\d+) แล้ว — DM จะเปิดฉากพร้อม recap ในรอบถัดไป$/u,(_m,n)=>`📖 Episode ${n} started. The DM will open with a recap next round.`],
    [/^ลบแล้ว (\d+) ข้อความ ✓$/u,(_m,n)=>`Deleted ${n} messages ✓`],
    [/^สไตล์ DM → (.+) ✓ \(มีผลรอบถัดไป\)$/u,(_m,v)=>`DM style → ${v} ✓ (applies next round)`],
    [/^โหมดการเล่น → (.+) ✓ \(มีผลรอบถัดไป\)$/u,(_m,v)=>`Play mode → ${v} ✓ (applies next round)`],
    [/^ตั้ง HP ของ (.+) เป็น (\d+)\?$/u,(_m,n,hp)=>`Set ${n} HP to ${hp}?`],
    [/^ตั้ง HP ของ (.+) เป็น (\d+)\?\n\(มอนจะออกจากการต่อสู้\)$/u,(_m,n,hp)=>`Set ${n} HP to ${hp}?\nThe monster will leave combat.`],
    [/^ไฟล์อ้างอิงทั้งหมด \((\d+)\)$/u,(_m,n)=>`All Reference Files (${n})`],
    [/^เพลงทั้งหมด \((\d+)\)$/u,(_m,n)=>`All Tracks (${n})`]
  ]);
  const thai=/[\u0E00-\u0E7F]/u;
  const metric=/\b\d+(?:\.\d+)?\s*(?:m|meters?|metres?|km|kilometers?|kilometres?|centimeters?|centimetres?)\b/iu;
  function invalidEnglish(value){const s=String(value==null?'':value);return thai.test(s)||metric.test(s);}
  function translateEnglishSystemText(value){
    const raw=String(value==null?'':value); if(!invalidEnglish(raw))return raw;
    const lead=(raw.match(/^\s*/)||[''])[0], trail=(raw.match(/\s*$/)||[''])[0], body=raw.slice(lead.length,raw.length-trail.length);
    let out=exact[body];
    if(out==null){for(const row of patterns){if(row[0].test(body)){out=body.replace(row[0],row[1]);break;}}}
    return out!=null&&!invalidEnglish(out)?lead+out+trail:null;
  }
  root.TTRPG_RUNTIME_COPY=Object.freeze({build:'20260720e1',exact,patterns,invalidEnglish,translateEnglishSystemText});
})(globalThis);
