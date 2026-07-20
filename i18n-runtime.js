/* English Mode frontend runtime catalog.
 * language-impact: th+en — strict key parity, no English-to-Thai fallback.
 * Source/user-authored nodes are intentionally outside translateDom().
 */
(function attachTtrpgI18n(root){
  'use strict';
  const th={
    'language.title':'เลือกภาษาของโลก / Choose World Language','language.sub':'ภาษาจะถูกล็อกเมื่อสร้างหรือเข้าร่วมโลกแล้ว และเปลี่ยนภายหลังไม่ได้ / Your chosen language is locked when you create or join a world and cannot be changed later.','language.th':'ไทย / THAI','language.en':'ENGLISH / อังกฤษ','language.enDisabled':'English mode ยังไม่เปิดใช้งาน / English mode is not enabled yet.','language.assetsUnavailable':'ไฟล์ภาษาอังกฤษโหลดไม่ครบหรือเป็นคนละรุ่น ระบบจึงหยุดการสร้างหรือเข้าร่วมโลกอังกฤษอย่างปลอดภัย กรุณารีเฟรชหน้าเว็บ',
    'role.hostTitle':'HOST — สร้างโลกใหม่','role.hostSub':'คุณเป็นผู้คุมเกม (DM) ของโลกนี้ — เลือกรูปแบบการเล่น สร้างโลก แล้วชวนเพื่อนได้สูงสุด 4 คน','role.hostAction':'สร้างโลก →','role.joinTitle':'JOIN — เข้าร่วมโลกเพื่อน','role.joinSub':'ขอรหัสเชิญ 6 ตัวอักษรจาก Host แล้วสร้างตัวละครเข้าไปผจญภัยด้วยกัน','role.joinAction':'ใส่รหัสเชิญ →','common.or':'หรือ','common.back':'← กลับ','common.backLanguage':'← เปลี่ยนภาษา','common.backMode':'← กลับไปเลือกโหมด',
    'join.title':'เข้าร่วมด้วยรหัส','join.sub':'ขอรหัสเชิญ 6 ตัวอักษรจาก Host','join.code':'รหัสเชิญ','join.placeholder':'เช่น EMM8YM','join.button':'เข้าร่วม','join.codeRequired':'กรอกรหัสเชิญก่อน','join.failed':'เข้าร่วมไม่สำเร็จ (รหัสผิด / โลกเต็ม / อยู่ในโลกอื่นแล้ว)','join.mismatch':'(แก้: ระบบหยุดการ JOIN ก่อนเพิ่มสมาชิก เพราะภาษาที่เลือกไม่ตรงกับโลก)','join.invalidCode':'ไม่พบโลกที่เปิดใช้งานด้วยรหัสนี้','join.invalidLanguage':'ภาษาที่เลือกไม่ถูกต้อง',
    'mode.title':'เลือกรูปแบบการเล่น','mode.openLabel':'— เล่นอิสระ ไม่มีกำหนดจบ','mode.openDesc':'อยากทำอะไรก็ได้ตามใจ — รับงานจากกระดานประกาศ ออกสำรวจโลก หรือใช้ชีวิตสบายๆ ในเมือง เรื่องราวใหญ่จะค่อยๆ เผยตัวตามทางที่เราเลือกเอง เหมาะกับการเล่นต่อเนื่องยาวๆ','mode.sessionLabel':'— เล่นจบเป็นตอนๆ ในโลกใบเดิม','mode.sessionDesc':'แต่ละตอนมีภารกิจใหญ่หนึ่งเรื่องให้ทำตั้งแต่ต้นจนจบ — สืบเรื่องราว ออกเดินทาง ผ่านศึกใหญ่ แล้วรับรางวัลปิดตอน กลับมาเล่นครั้งหน้าก็เริ่มตอนใหม่ต่อจากเรื่องเดิม เหมาะกับการนัดเล่นเป็นครั้งๆ','mode.oneshotLabel':'— เรื่องสั้น จบในรอบเดียว','mode.oneshotDesc':'เริ่มด้วยตัวละครฝีมือระดับสูงและภารกิจที่ชัดเจนตั้งแต่ต้น เดินเรื่องเข้มข้นรวดเดียวถึงบทสรุป จบแล้วโลกปิดถาวร (ยังเปิดอ่านย้อนหลังได้) เหมาะกับลองเล่นครั้งแรก หรืออยากเล่นให้จบในคืนเดียว','mode.next':'ถัดไป: สร้างโลก →',
    'create.title':'สร้างแคมเปญใหม่','create.sub':'คุณเป็น Host (DM) ของโลกนี้ — ผู้เล่นได้สูงสุด 4 คน','create.name':'ชื่อแคมเปญ','create.namePlaceholder':'เช่น ตำนานแห่งเอลดราเรีย','create.storyStyle':'แนวเนื้อเรื่อง (Story Style) — ระบบใช้ถ่วงน้ำหนักการสุ่มเควส/การผจญภัยทั้งโลก','style.journeyDesc':'— การเดินทางอิสระตามปกติ ปริศนา+การผจญภัยหลายรูปแบบสุ่มคละกัน (ค่าเริ่มต้น)','style.mysteryDesc':'— เน้นแก้ปริศนา ช่วยเหลือชาวบ้าน เดินเรื่องในเมืองเป็นหลัก · คอมแบต/ดันเจี้ยนเป็นรอง','style.dungeonDesc':'— ไล่ลงดันเจี้ยนปริศนาไปเรื่อยๆ พัซเซิล+คอมแบตเข้มข้นเป็นแกน','create.rules':'กติกา / โทน (ไม่บังคับ)','create.rulesPlaceholder':'พิมพ์กติกาหรือโทนของโลก หรือปล่อยว่างให้ DM ใช้กลไกมาตรฐาน','create.tone':'โทนเรื่อง','create.tonePlaceholder':'เช่น heroic, dark, mystery, comedic','create.musicNote':'🎵 เพลงประกอบ — เพิ่มภายหลังได้ที่แท็บ Files ในเกม','create.button':'สร้างแคมเปญ','create.ownerOnly':'ช่วงทดสอบ: เฉพาะเจ้าของระบบหรือผู้ทดสอบที่มีรหัสเท่านั้นที่สร้างโลกได้','create.nameRequired':'ตั้งชื่อแคมเปญก่อน','create.languageDisabled':'English mode ยังไม่เปิดใช้งาน จึงยังสร้างโลกภาษาอังกฤษไม่ได้','create.publicLatinRequired':'ชื่อสาธารณะของโลกภาษาอังกฤษต้องใช้อักษรละติน และห้ามมีอักษรจากภาษาอื่น','create.failed':'สร้างแคมเปญไม่สำเร็จ','create.configFailed':'บันทึกโหมด/แนวเนื้อเรื่องไม่สำเร็จ ({message}) — โลกใช้ค่าเริ่มต้นและปรับได้ใน DM Tools','create.indexing':'กำลังจัดทำดัชนีกฎ…','create.seedingLore':'กำลังฝังลอร์ Forgotten Realms…','create.settingKey':'กำลังตั้งค่า Gemini key…',
    'oneshot.title':'ONE SHOT — ตั้งโจทย์เรื่องเดียวจบ','oneshot.sub':'ฟอร์มย่อ — โลกใบนี้เกิดมาเพื่อเรื่องนี้เรื่องเดียว จบแล้วปิดถาวร (อ่านย้อนได้ เล่นต่อไม่ได้)','oneshot.name':'ชื่อเรื่อง','oneshot.namePlaceholder':'เช่น คืนสังหารที่คฤหาสน์เรเวนมัวร์','oneshot.style':'แนวเนื้อเรื่อง — คุมโครงทั้งเรื่อง','oneshot.journeyDesc':'— ภารกิจผจญภัยเข้มข้นเรื่องเดียว เดินทาง→ปะทะ→ไคลแมกซ์','oneshot.mysteryDesc':'— คดีเดียวไขให้จบ','oneshot.dungeonDesc':'— ดันเจี้ยนเดียว ดำดิ่งถึงก้น โค่นสิ่งที่เฝ้าอยู่','oneshot.premise':'โจทย์ของเรื่อง (สั้นๆ พอ — DM ขยายเอง)','oneshot.premisePlaceholder':'เช่น ขุนนางถูกฆ่ากลางงานเลี้ยง ประตูปิดตาย ฆาตกรอยู่ในหมู่แขก','oneshot.level':'เลเวลเริ่มต้นของปาร์ตี้ — ทุกคนถูกดันขึ้นถึงเลเวลนี้หลังสร้างตัวละคร','oneshot.level3':'เลเวล 3','oneshot.level3Note':'เหมาะกับมือใหม่','oneshot.level5':'เลเวล 5','oneshot.level5Note':'ช่วงสนุกสุดของ D&D','oneshot.level8':'เลเวล 8','oneshot.level8Note':'สายบู๊จัดเต็ม','oneshot.omitted':'ตัดออกจากฟอร์มย่อ: เพลง · โทนเรื่องแยกช่อง · ลอร์ ingest','oneshot.button':'เริ่มเรื่อง ⚡',
    'builder.title':'สร้างตัวละคร','builder.sub':'อ่านปูมหลังโลกก่อน แล้วสร้างตัวละครให้เข้ากับโลกนี้ ข้อมูลพื้นฐานทุกคนเห็น ส่วนแผ่นเต็มเห็นเฉพาะคุณ','builder.name':'ชื่อ','builder.namePlaceholder':'เช่น Kael','builder.race':'เผ่า','builder.selectRace':'— เลือกเผ่า —','builder.custom':'อื่นๆ (พิมพ์เอง)','builder.sex':'เพศ','builder.select':'— เลือก —','builder.male':'ชาย (M)','builder.female':'หญิง (F)','builder.other':'อื่นๆ/ไม่ระบุ','builder.age':'อายุ','builder.agePlaceholder':'เช่น 24','builder.birth':'วันเกิดในปฏิทินโลก (ไม่บังคับ)','builder.birthPlaceholder':'YYYY-MM-DD · เดือนละ 30 วัน','builder.customRacePlaceholder':'ชื่อเผ่านอกกฎ เช่น Aarakocra','builder.customClassPlaceholder':'ชื่ออาชีพนอกกฎ เช่น Blood Hunter','builder.class':'อาชีพ','builder.selectClass':'— เลือกอาชีพ —','builder.customClass':'อื่นๆ (พิมพ์เอง / นอกกฎ)','builder.dragonElement':'ธาตุสายมังกร (Dragonborn):','builder.dragonFire':'ไฟ Fire (แดง/ทอง/ทองเหลือง)','builder.dragonCold':'เย็น Cold (ขาว/เงิน)','builder.dragonLightning':'ไฟฟ้า Lightning (น้ำเงิน/บรอนซ์)','builder.dragonAcid':'กรด Acid (ดำ/ทองแดง)','builder.dragonPoison':'พิษ Poison (เขียว)','builder.dragonNote':'— ใช้กับลมหายใจ + ความต้านทาน','builder.equipment':'ชุดอุปกรณ์เริ่มต้น','builder.chooseClassPackage':'เลือกอาชีพก่อน เพื่อดูชุดเริ่มต้นตามคลาส','builder.noPackage':'คลาสนี้ไม่มีชุดสำเร็จรูป — เลือกอาวุธด้านล่างเอง','builder.packageN':'ชุด {n}','builder.pointBuy':'ค่าความสามารถ · POINT BUY','builder.standardArray':'Standard Array','builder.reset':'รีเซ็ต (ทุกค่าเป็น 8)','builder.pointBudget':'งบ 27 แต้ม · ค่า 8–15 (ก่อนโบนัสเผ่า) · 14–15 ใช้แต้มแพงขึ้น','builder.bonus':'โบนัสเผ่า / พื้นเพ','builder.bonusNote':'เลือก +2 และ +1 คนละค่า หรือ +1/+1/+1 สามค่า → สูงสุด 17','builder.maxHp':'Max HP (คำนวณตามกฎ)','builder.weapon':'อาวุธเริ่มต้น','builder.selectWeapon':'— เลือกอาวุธ —','builder.customWeaponPlaceholder':'อาวุธนอกกฎ เช่น Whip (1d4)','builder.hpNote':'HP เลเวล 1 = Hit Die สูงสุดของคลาส + CON modifier (custom class = d8)','builder.skills':'ทักษะถนัด','builder.spells':'CANTRIP / เวทเริ่มต้น','builder.notes':'ภูมิหลัง / โน้ต (ส่วนตัว)','builder.notesPlaceholder':'ภูมิหลัง ความลับ ฯลฯ (เห็นเฉพาะคุณ)','builder.hooks':'🎯 ปมที่อยากให้ DM หยิบไปผูกเรื่อง (DM เห็น)','builder.hooksPlaceholder':'เช่น ตามหาน้องสาวที่หายไป หรือเป็นหนี้กิลด์โจร','builder.enter':'เข้าสู่โลก','builder.nameRequired':'ตั้งชื่อตัวละครก่อน','builder.classRequired':'ยังไม่ได้เลือกอาชีพ (Class)','builder.raceRequired':'ยังไม่ได้เลือกเผ่าพันธุ์ (Race)','builder.sexRequired':'ยังไม่ได้เลือกเพศ (Sex)','builder.publicLatinRequired':'ชื่อ ตัวเลือกเผ่าพิเศษ และอาชีพพิเศษของโลกอังกฤษต้องใช้อักษรละติน','builder.pointsRemaining':'ยังเหลือแต้มสถานะ {n} แต้ม — กระจายให้ครบก่อนเข้าเกม','builder.pointsInsufficient':'แต้มไม่พอ — ลดค่าอื่นก่อน','builder.pointsLeft':'แต้มคงเหลือ: {left} / {total}','builder.bonusDistinct21':' ⚠ +2/+1 ต้องคนละค่า','builder.bonusDistinct111':' ⚠ ต้องเลือก 3 ค่าต่างกัน','builder.skillInfo':'เลือก {max} สกิล ({current}/{max}){raceBonus}{custom}','builder.humanSkillBonus':' (+1 เผ่า Human)','builder.halfElfSkillBonus':' (+2 เผ่า Half-Elf)','builder.customClassSkills':' · คลาสนอกกฎ → เลือกได้ 2 จากทั้งหมด','builder.skillLimit':'เลือกได้ {n} สกิลตามคลาส','builder.spellsLoading':'กำลังโหลดคลังเวท…','builder.spellInfo':'เลือก cantrip {cantrips}/{cantripMax}{levelOne}{custom}','builder.levelOneCount':' · เวทเลเวล 1 {current}/{max}','builder.customSpellNote':' · อาชีพนอกกฎ (เลือกอิสระ DM กำกับ)','builder.levelOne':'เลเวล 1','builder.cantripLimit':'เลือก cantrip ได้ {n}','builder.spellLimit':'เลือกเวทเลเวล 1 ได้ {n}','builder.catalogBlocked':'คลังภาษาอังกฤษยังไม่ผ่านการตรวจครบ จึงหยุด Character Builder อย่างปลอดภัย','builder.recovered':'พบตัวละครค้างจากรอบก่อน — สร้างต่อจากแถวเดิมให้แล้ว','builder.createFailed':'สร้างตัวละครไม่สำเร็จ','builder.briefTitle':'📖 เรื่องราวจนถึงตอนนี้ (สรุปให้ผู้มาใหม่)','builder.currentScene':'ฉากปัจจุบัน','builder.briefNote':'สร้างตัวละครให้เข้ากับสถานการณ์นี้ — DM จะแนะนำตัวคุณเข้าสู่กลุ่มในตาถัดไป',
    'builder.birthdayFailed':'วันเกิดยังไม่ถูกล็อกในปฏิทิน server — ตั้งใหม่ได้ในแท็บ Companion','builder.skillSeedPartial':'บันทึกสกิล/เวทเริ่มต้นไม่ครบ ({message}) — เข้าเกมได้ แต่ควรแจ้งผู้ดูแล','builder.skillSeedFailed':'บันทึกสกิลเริ่มต้นไม่สำเร็จ — เข้าเกมได้ แต่ควรแจ้งผู้ดูแล',
    'world.codeCopied':'คัดลอกรหัสแล้ว','world.idCopied':'คัดลอก World ID แล้ว ✓'
  };
  const en={
    'language.title':'Choose World Language','language.sub':'Language is locked when you create or join a world and cannot be changed later.','language.th':'ไทย','language.en':'ENGLISH','language.enDisabled':'English mode is not enabled yet.','language.assetsUnavailable':'English language files are missing or from mixed builds. English create or join was safely stopped; please refresh.',
    'role.hostTitle':'HOST — Create a New World','role.hostSub':'You are this world’s host (DM). Choose a play mode, create the world, and invite up to four players.','role.hostAction':'Create a world →','role.joinTitle':'JOIN — Enter a Friend’s World','role.joinSub':'Ask the Host for the six-character invite code, then create a character and join the adventure.','role.joinAction':'Enter invite code →','common.or':'OR','common.back':'← Back','common.backLanguage':'← Change Language','common.backMode':'← Back to Play Mode',
    'join.title':'Join with Code','join.sub':'Ask the Host for the six-character invite code.','join.code':'Invite code','join.placeholder':'e.g. EMM8YM','join.button':'Join','join.codeRequired':'Enter the invite code first.','join.failed':'Join failed (wrong code, full world, or already in another world).','join.mismatch':'(Fixed: JOIN was stopped before membership because the selected language did not match the world.)','join.invalidCode':'No active world was found for that invite code.','join.invalidLanguage':'The selected language is invalid.',
    'mode.title':'Choose a Play Mode','mode.openLabel':'— Free play with no fixed ending','mode.openDesc':'Follow any path: take notice-board jobs, explore the world, or spend time in town. Larger stories emerge from your choices. Best for a continuing campaign.','mode.sessionLabel':'— Complete one episode at a time in the same world','mode.sessionDesc':'Each episode has one major mission with investigation, travel, a climax, and a reward. Return later for a new episode that continues the same world.','mode.oneshotLabel':'— One complete adventure','mode.oneshotDesc':'Begin with capable heroes and a clear mission, then play through to a permanent ending. The finished world remains available to read.','mode.next':'Next: Create World →',
    'create.title':'New Campaign','create.sub':'You will be this world’s Host (DM), with up to four players.','create.name':'Campaign name','create.namePlaceholder':'e.g. Legend of Eldraria','create.storyStyle':'Story Style — weights the kinds of quests and adventures generated for this world','style.journeyDesc':'— A free-ranging journey with a balanced mix of mysteries and adventures (default)','style.mysteryDesc':'— Emphasizes mysteries, helping locals, and urban stories; combat and dungeons are secondary','style.dungeonDesc':'— Emphasizes recurring dungeon expeditions, puzzles, and intense combat','create.rules':'Rules / tone (optional)','create.rulesPlaceholder':'Enter private source rules or tone for the world, or leave blank for the standard DM rules.','create.tone':'Story tone','create.tonePlaceholder':'e.g. heroic, dark, mystery, comedic','create.musicNote':'🎵 Music can be added later from the Files tab in the game.','create.button':'Create Campaign','create.ownerOnly':'During testing, only the system owner or a tester with a valid code can create a world.','create.nameRequired':'Name your campaign first.','create.languageDisabled':'English mode is not enabled yet, so an English world cannot be created.','create.publicLatinRequired':'Public names in an English world must use Latin letters and must not contain letters from another script.','create.failed':'Campaign creation failed.','create.configFailed':'Could not save the play mode or story style ({message}). The world is using defaults; you can adjust them in DM Tools.','create.indexing':'Indexing rules…','create.seedingLore':'Loading Forgotten Realms lore…','create.settingKey':'Setting up the Gemini key…',
    'oneshot.title':'ONE SHOT — One Complete Adventure','oneshot.sub':'A focused form for a world built around one adventure. It closes permanently at the ending but remains readable.','oneshot.name':'Adventure title','oneshot.namePlaceholder':'e.g. Murder at Ravenmoor Manor','oneshot.style':'Story Style — controls the shape of the adventure','oneshot.journeyDesc':'— One intense adventure: journey, confrontation, and climax','oneshot.mysteryDesc':'— One mystery to solve completely','oneshot.dungeonDesc':'— One dungeon, a descent to its depths, and the guardian below','oneshot.premise':'Adventure premise (brief is fine; the DM will expand it)','oneshot.premisePlaceholder':'e.g. A noble is murdered during a feast. The doors are sealed, and the killer is among the guests.','oneshot.level':'Starting party level — each character advances to this level after creation','oneshot.level3':'Level 3','oneshot.level3Note':'Best for new players','oneshot.level5':'Level 5','oneshot.level5Note':'The classic D&D sweet spot','oneshot.level8':'Level 8','oneshot.level8Note':'High-powered combat','oneshot.omitted':'Not in this focused form: music, a separate tone field, and lore ingest','oneshot.button':'Begin Adventure ⚡',
    'builder.title':'Create Character','builder.sub':'Read the world briefing first, then create a character who fits this world. Everyone sees basic details; only you see the full sheet.','builder.name':'Name','builder.namePlaceholder':'e.g. Kael','builder.race':'Race','builder.selectRace':'— Select a race —','builder.custom':'Other (custom)','builder.sex':'Sex','builder.select':'— Select —','builder.male':'Male','builder.female':'Female','builder.other':'Other / Unspecified','builder.age':'Age','builder.agePlaceholder':'e.g. 24','builder.birth':'Birthday in the World Calendar (optional)','builder.birthPlaceholder':'YYYY-MM-DD · 30 days per month','builder.customRacePlaceholder':'Custom race, e.g. Aarakocra','builder.customClassPlaceholder':'Custom class, e.g. Blood Hunter','builder.class':'Class','builder.selectClass':'— Select a class —','builder.customClass':'Other (custom / homebrew)','builder.dragonElement':'Draconic Ancestry:','builder.dragonFire':'Fire (red, gold, brass)','builder.dragonCold':'Cold (white, silver)','builder.dragonLightning':'Lightning (blue, bronze)','builder.dragonAcid':'Acid (black, copper)','builder.dragonPoison':'Poison (green)','builder.dragonNote':'— Used for your breath weapon and resistance','builder.equipment':'Starting Equipment','builder.chooseClassPackage':'Choose a class to see its starting packages.','builder.noPackage':'This class has no preset package. Choose a weapon below.','builder.packageN':'Package {n}','builder.pointBuy':'Ability Scores · Point Buy','builder.standardArray':'Standard Array','builder.reset':'Reset (all 8)','builder.pointBudget':'27-point budget · scores 8–15 before ancestry bonuses · scores 14–15 cost more','builder.bonus':'Ancestry / Background Bonus','builder.bonusNote':'Choose +2 and +1 for different abilities, or +1/+1/+1 for three abilities; maximum 17','builder.maxHp':'Max HP (rules calculated)','builder.weapon':'Starting weapon','builder.selectWeapon':'— Select a weapon —','builder.customWeaponPlaceholder':'Custom weapon, e.g. Whip (1d4)','builder.hpNote':'Level 1 HP = maximum class Hit Die + CON modifier (custom class uses d8)','builder.skills':'Skill Proficiencies','builder.spells':'Cantrips / Starting Spells','builder.notes':'Background / Notes (private)','builder.notesPlaceholder':'Background, secrets, and private notes','builder.hooks':'🎯 Story hooks for the DM','builder.hooksPlaceholder':'e.g. searching for a missing sister or indebted to a thieves’ guild','builder.enter':'Enter the World','builder.nameRequired':'Name your character first.','builder.classRequired':'Choose a class before entering the world.','builder.raceRequired':'Choose a race before entering the world.','builder.sexRequired':'Choose a sex value before entering the world.','builder.publicLatinRequired':'Character names, custom races, and custom classes in an English world must use Latin letters.','builder.pointsRemaining':'You have {n} ability points left. Spend them before entering the world.','builder.pointsInsufficient':'Not enough points. Lower another score first.','builder.pointsLeft':'Points left: {left} / {total}','builder.bonusDistinct21':' ⚠ +2 and +1 must use different abilities','builder.bonusDistinct111':' ⚠ Choose three different abilities','builder.skillInfo':'Choose {max} skills ({current}/{max}){raceBonus}{custom}','builder.humanSkillBonus':' (+1 from Human)','builder.halfElfSkillBonus':' (+2 from Half-Elf)','builder.customClassSkills':' · Custom class: choose 2 from all skills','builder.skillLimit':'Your class allows {n} skill choices.','builder.spellsLoading':'Loading spell catalog…','builder.spellInfo':'Choose cantrips {cantrips}/{cantripMax}{levelOne}{custom}','builder.levelOneCount':' · level 1 spells {current}/{max}','builder.customSpellNote':' · Custom class: free choice under DM supervision','builder.levelOne':'Level 1','builder.cantripLimit':'You can choose {n} cantrips.','builder.spellLimit':'You can choose {n} level 1 spells.','builder.catalogBlocked':'The reviewed English catalog is incomplete, so Character Builder stopped safely.','builder.recovered':'A character row from the previous attempt was found and safely resumed.','builder.createFailed':'Character creation failed.','builder.briefTitle':'📖 The Story So Far','builder.currentScene':'Current Scene','builder.briefNote':'Build a character who fits this situation. The DM will introduce you to the party on the next turn.',
    'builder.birthdayFailed':'The birthday was not locked in the server calendar. You can set it again from the Companion tab.','builder.skillSeedPartial':'Some starting skills or spells were not saved ({message}). You may enter the game, but please notify the administrator.','builder.skillSeedFailed':'Starting skills were not saved. You may enter the game, but please notify the administrator.',
    'world.codeCopied':'Invite code copied.','world.idCopied':'World ID copied.'
  };
  const catalogs={th:Object.freeze(th),en:Object.freeze(en)};
  const token=/\{([A-Za-z0-9_]+)\}/g;
  function language(value){if(value!=='th'&&value!=='en')throw new Error('invalid-game-language');return value;}
  function text(lang,key,vars){
    const row=catalogs[language(lang)];
    if(!Object.prototype.hasOwnProperty.call(row,key)) throw new Error('missing-i18n-key:'+key);
    const values=vars||{};
    return row[key].replace(token,function(_m,k){if(!Object.prototype.hasOwnProperty.call(values,k))throw new Error('missing-i18n-param:'+key+':'+k);return String(values[k]);});
  }
  function errorText(lang,code){
    const c=String(code||'');
    if(c==='world-language-mismatch')return text(lang,'join.mismatch');
    if(c==='invalid-or-inactive-code')return text(lang,'join.invalidCode');
    if(c==='invalid-selected-language'||c==='invalid-game-language')return text(lang,'join.invalidLanguage');
    if(c==='english-mode-disabled')return text(lang,'create.languageDisabled');
    if(c==='english-i18n-assets-not-ready')return text(lang,'language.assetsUnavailable');
    if(c.indexOf('english-public-text-required:')===0)return text(lang,'create.publicLatinRequired');
    if(c==='host-restricted')return text(lang,'create.ownerOnly');
    if(c==='name-required')return text(lang,'create.nameRequired');
    return text(lang,c.indexOf('join')>=0?'join.failed':'create.failed');
  }
  function latinPublicTextVerdict(value){
    const s=String(value==null?'':value).trim();
    if(!s)return 'required';
    if(/[\u0E00-\u0E7F]/u.test(s))return 'thai-script';
    const letters=s.match(/\p{L}/gu)||[];
    if(!letters.length)return 'no-latin-letter';
    const latin=letters.filter(function(ch){return /\p{Script=Latin}/u.test(ch);});
    return latin.length===letters.length?'ok':'non-latin-letter';
  }
  function catalogEnglishText(row,baseKey,enKey){
    const base=String(row&&row[baseKey]!=null?row[baseKey]:'');
    const translated=String(row&&row[enKey]!=null?row[enKey]:'');
    const out=/[\u0E00-\u0E7F]/u.test(base)?translated:(translated||base);
    if(!out.trim()||/[\u0E00-\u0E7F]/u.test(out)||/\b\d+(?:\.\d+)?\s*(?:m|meters?|metres?|km|kilometers?|kilometres?|centimeters?|centimetres?)\b/iu.test(out)) throw new Error('english-catalog-field-invalid:'+String(row&&row.slug||'')+':'+enKey);
    return out;
  }
  function catalogRowVisibleForWorld(lang,kind,row,campaignId){
    language(lang);
    if(kind!=='item'&&kind!=='skill')return true;
    const source=String(row&&row.source||'').toLowerCase();
    const inferredDynamic=source==='dm'||source==='forge'||(kind==='skill'&&row&&row.is_dm===true);
    const scope=String(row&&row.catalog_scope||(inferredDynamic?'legacy_unscoped':'curated'));
    if(scope==='curated')return !inferredDynamic;
    if(scope!=='campaign')return false;
    return String(row&&row.origin_campaign_id||'')===String(campaignId||'')&&row&&row.game_language===lang;
  }
  function localizeCatalogRow(lang,kind,source){
    language(lang); if(lang==='th')return source;
    const row=Object.assign({},source);
    if(kind==='item'){
      row.name=catalogEnglishText(row,'name','name_en');
      if(row.effect!=null)row.effect=catalogEnglishText(row,'effect','effect_en');
      if(row.charges!=null)row.charges=catalogEnglishText(row,'charges','charges_en');
    }else if(kind==='spell'||kind==='skill'){
      if(row.effect!=null)row.effect=catalogEnglishText(row,'effect','effect_en');
    }else if(kind==='class'){
      if(!Array.isArray(row.starting_packages_en))throw new Error('english-catalog-field-invalid:'+row.slug+':starting_packages_en');
      const packed=JSON.stringify(row.starting_packages_en);
      if(/[\u0E00-\u0E7F]/u.test(packed)||/\b\d+(?:\.\d+)?\s*(?:m|meters?|metres?|km|kilometers?|kilometres?|centimeters?|centimetres?)\b/iu.test(packed))throw new Error('english-catalog-field-invalid:'+row.slug+':starting_packages_en');
      row.starting_packages=row.starting_packages_en;
    }else throw new Error('unknown-catalog-kind:'+kind);
    return row;
  }
  const thaiScript=/[\u0E00-\u0E7F]/u;
  const metricDistance=/\b\d+(?:\.\d+)?\s*(?:m|meters?|metres?|km|kilometers?|kilometres?|centimeters?|centimetres?)\b/iu;
  const sourceOrigins=new Set(['user-source','reference-source']);
  function displayTextVerdict(lang,value,origin){
    language(lang);
    if(lang!=='en')return 'ok';
    if(sourceOrigins.has(String(origin||'')))return 'source-exempt';
    const s=String(value==null?'':value);
    if(thaiScript.test(s))return 'thai-script';
    if(metricDistance.test(s))return 'metric-distance';
    return 'ok';
  }
  function originForNode(node){
    const el=node&&node.nodeType===1?node:node&&node.parentElement;
    const owner=el&&el.closest?el.closest('[data-runtime-origin]'):null;
    return owner?owner.getAttribute('data-runtime-origin'):'system';
  }
  const wallFallbacks=Object.freeze({
    'interface text':'—',
    'placeholder':'Enter text',
    'title':'More information',
    'aria-label':'Control',
    'value':'Continue',
    'dialog message':'This action could not be completed.',
    'confirmation message':'Continue?',
    'prompt message':'Enter a value'
  });
  function wallReplacement(kind){return wallFallbacks[kind]||wallFallbacks['interface text'];}
  function safeEnglishSystemText(value,kind){
    const copy=root.TTRPG_RUNTIME_COPY;
    const translated=copy&&copy.translateEnglishSystemText?copy.translateEnglishSystemText(value):null;
    return translated==null?wallReplacement(kind||'interface text'):translated;
  }
  const languageRepairMetaLines=new Set([
    '(fixed: system output was normalized to english.)',
    '(แก้: ระบบปรับผลลัพธ์ให้เป็นภาษาอังกฤษแล้ว)'
  ]);
  function stripLanguageRepairMetaText(value){
    const src=String(value==null?'':value);
    const lines=src.split(/\r?\n/);
    const kept=lines.filter(function(line){return !languageRepairMetaLines.has(line.trim().toLowerCase());});
    if(kept.length===lines.length) return src;   // v716b: no obsolete meta line → return verbatim (Thai byte-transparent; only normalize whitespace when a note was actually removed)
    return kept.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function auditEnglishDom(scope,opts){
    const base=scope&&scope.querySelectorAll?scope:root.document;
    const findings=[]; if(!base)return findings;
    const repair=!opts||opts.repair!==false;
    const doc=base.nodeType===9?base:(base.ownerDocument||root.document);
    const nf=(doc&&doc.defaultView&&doc.defaultView.NodeFilter)||root.NodeFilter;
    const walker=doc&&doc.createTreeWalker?doc.createTreeWalker(base,nf?nf.SHOW_TEXT:4):null;
    if(walker){
      let n; while((n=walker.nextNode())){
        const p=n.parentElement; if(!p||/^(SCRIPT|STYLE|NOSCRIPT)$/i.test(p.tagName))continue;
        const origin=originForNode(n), verdict=displayTextVerdict('en',n.nodeValue,origin);
        if(verdict==='ok'||verdict==='source-exempt')continue;
        findings.push({kind:'text',verdict,origin,value:String(n.nodeValue||'').slice(0,160)});
        if(repair){n.nodeValue=safeEnglishSystemText(n.nodeValue,'interface text');p.setAttribute('data-language-wall',verdict);}
      }
    }
    const elements=[];
    if(base.nodeType===1)elements.push(base);
    base.querySelectorAll('*').forEach(function(el){elements.push(el);});
    elements.forEach(function(el){
      const origin=originForNode(el); if(sourceOrigins.has(origin))return;
      const attrs=['placeholder','title','aria-label'];
      if(/^(BUTTON)$/i.test(el.tagName)||(/^(INPUT)$/i.test(el.tagName)&&/^(button|submit|reset)$/i.test(el.type||'')))attrs.push('value');
      attrs.forEach(function(attr){
        if(!el.hasAttribute||!el.hasAttribute(attr))return;
        const value=el.getAttribute(attr), verdict=displayTextVerdict('en',value,origin);
        if(verdict==='ok')return;
        findings.push({kind:'attribute',attribute:attr,verdict,origin,value:String(value||'').slice(0,160)});
        if(repair){el.setAttribute(attr,safeEnglishSystemText(value,attr));el.setAttribute('data-language-wall',verdict);}
      });
    });
    return findings;
  }
  let wallObserver=null, wallProvider=null;
  function installDisplayWall(scope,langProvider){
    const base=scope&&scope.querySelectorAll?scope:root.document; if(!base)return null;
    wallProvider=typeof langProvider==='function'?langProvider:function(){return langProvider;};
    const run=function(){let lang;try{lang=wallProvider();}catch(_e){return [];}return lang==='en'?auditEnglishDom(base):[];};
    run();
    if(!wallObserver&&root.MutationObserver){
      let queued=false;
      wallObserver=new root.MutationObserver(function(){if(queued)return;queued=true;Promise.resolve().then(function(){queued=false;const rows=run();if(rows.length&&root.console)root.console.warn('[languageWall] repaired displayed English leak',rows);});});
      wallObserver.observe(base.nodeType===9?base.documentElement:base,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label','value']});
    }
    return wallObserver;
  }
  let dialogWallInstalled=false;
  function installDialogWall(langProvider){
    if(dialogWallInstalled)return;
    const provider=typeof langProvider==='function'?langProvider:function(){return langProvider;};
    const localized=function(value,kind){
      let lang;try{lang=provider();}catch(_e){return value;}
      return displayTextVerdict(lang,value,'system')==='ok'?value:safeEnglishSystemText(value,kind);
    };
    if(typeof root.alert==='function'){const original=root.alert.bind(root);root.alert=function(message){return original(localized(message,'dialog message'));};}
    if(typeof root.confirm==='function'){const original=root.confirm.bind(root);root.confirm=function(message){return original(localized(message,'confirmation message'));};}
    if(typeof root.prompt==='function'){const original=root.prompt.bind(root);root.prompt=function(message,defaultValue){return original(localized(message,'prompt message'),defaultValue);};}
    dialogWallInstalled=true;
  }
  function translateDom(scope,lang){
    language(lang);
    const base=scope&&scope.querySelectorAll?scope:root.document;
    if(!base)return;
    base.querySelectorAll('[data-i18n]').forEach(function(el){el.textContent=text(lang,el.dataset.i18n);});
    base.querySelectorAll('[data-i18n-prefix]').forEach(function(el){
      let n=Array.from(el.childNodes).find(function(x){return x.nodeType===3;});
      if(!n){n=root.document.createTextNode('');el.insertBefore(n,el.firstChild);}
      n.nodeValue=text(lang,el.dataset.i18nPrefix);
    });
    base.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){el.setAttribute('placeholder',text(lang,el.dataset.i18nPlaceholder));});
    base.setAttribute&&base.setAttribute('lang',lang==='en'?'en':'th');
  }
  root.TTRPG_I18N=Object.freeze({build:'20260720e2',catalogs:Object.freeze(catalogs),text,errorText,language,latinPublicTextVerdict,catalogRowVisibleForWorld,localizeCatalogRow,displayTextVerdict,safeEnglishSystemText,stripLanguageRepairMetaText,auditEnglishDom,installDisplayWall,installDialogWall,translateDom});
})(globalThis);
