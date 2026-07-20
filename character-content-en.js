/* Reviewed Character Builder English overlay. language-impact: en-only display;
 * mechanics remain in the canonical Thai-path rows and are parity-tested. */
(function attachCharacterEnglish(root){
  'use strict';
  const f=(name,description,max_uses=0,recharge='passive')=>Object.freeze({name,description,max_uses,recharge});
  const races={
    human:[f('Skillful (Human)','Humans are highly adaptable. Gain proficiency in 1 additional skill during character creation (2024 Human).'),f('Versatile (Human)','Gain 1 additional Origin Feat during character creation. Choose it on the SPECIAL TRAITS · FEATS card (2024 Human Versatile).'),f('Heroic Inspiration','After a Long Rest, gain 1 Heroic Inspiration. When you fail a d20 roll, reroll it and use the new result (1/Long Rest; 2024 Human Resourceful).',1,'long')],
    elf:[f('Darkvision','You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light. You see only shades of gray in darkness.'),f('Fey Ancestry','You have advantage on saving throws against being charmed, and magic cannot put you to sleep.'),f('Trance','You complete a full rest by meditating for 4 hours instead of sleeping for 8 hours.'),f('Keen Senses','You have proficiency in the Perception skill.')],
    drow:[f('Superior Darkvision','Your Darkvision has a range of 120 feet.'),f('Fey Ancestry','You have advantage on saving throws against being charmed, and magic cannot put you to sleep.'),f('Sunlight Sensitivity','In bright sunlight, you have disadvantage on attack rolls and on Perception checks that rely on sight.'),f('Drow Magic','You can cast Dancing Lights. At level 3, you gain Faerie Fire; at level 5, you gain Darkness. You can cast each leveled spell once per Long Rest.',0,'atwill')],
    dwarf:[f('Darkvision','You can see in darkness within 60 feet.'),f('Dwarven Resilience','You have advantage on saving throws against poison, and you have resistance to poison damage.'),f('Stonecunning','You are an expert on stone and stonework and gain a bonus on related checks.')],
    halfling:[f('Lucky','When you roll a natural 1 on a d20 for an attack roll, ability check, or saving throw, reroll it and use the new result.'),f('Brave','You have advantage on saving throws against being frightened.'),f('Halfling Nimbleness','You can move through the space of any creature larger than you.')],
    halfelf:[f('Darkvision','You can see in darkness within 60 feet.'),f('Fey Ancestry','You have advantage on saving throws against being charmed, and magic cannot put you to sleep.'),f('Skill Versatility','Gain proficiency in 2 additional skills of your choice.')],
    halforc:[f('Darkvision','You can see in darkness within 60 feet.'),f('Relentless Endurance','When you are reduced to 0 HP but not killed outright, you drop to 1 HP instead (1/Long Rest).',1,'long'),f('Savage Attacks','When you score a critical hit with a melee weapon, roll 1 additional weapon damage die.')],
    tiefling:[f('Darkvision','You can see in darkness within 60 feet.'),f('Hellish Resistance','You have resistance to fire damage.'),f('Infernal Legacy','You can cast Thaumaturgy. At level 3, you gain Hellish Rebuke; at level 5, you gain Darkness. You can cast each leveled spell once per Long Rest.',0,'atwill')],
    dragonborn:[f('Draconic Ancestry','Choose a draconic ancestry. Its damage type determines your breath weapon and damage resistance.'),f('Breath Weapon',"Exhale destructive energy that deals 2d6 damage of your ancestry's type; a successful saving throw halves the damage (1/Short Rest).",1,'short'),f('Damage Resistance','You have resistance to the damage type of your draconic ancestry.')],
    gnome:[f('Darkvision','You can see in darkness within 60 feet.'),f('Gnome Cunning','You have advantage on Intelligence, Wisdom, and Charisma saving throws against magic.')],
    aasimar:[f('Darkvision','You can see in darkness within 60 feet.'),f('Celestial Resistance','You have resistance to necrotic damage and radiant damage.'),f('Healing Hands','Touch a creature and roll a number of d4s equal to your level. The target regains HP equal to the total (1/Long Rest).',1,'long'),f('Light Bearer','You know the Light cantrip.',0,'atwill')],
    goliath:[f("Stone's Endurance",'Reduce damage you take by 1d12 + your Constitution modifier (1/Short Rest).',1,'short'),f('Powerful Build','You count as 1 size larger when determining your carrying capacity and the weight you can push, drag, or lift.'),f('Mountain Born','You have resistance to cold damage and are naturally acclimated to high altitude.')],
    orc:[f('Darkvision','You can see in darkness within 60 feet.'),f('Aggressive','As a Bonus Action, move up to your Speed toward an enemy you can see or hear.'),f('Relentless Endurance','When you are reduced to 0 HP, you drop to 1 HP instead (1/Long Rest).',1,'long')]
  };
  Object.keys(races).forEach(k=>Object.freeze(races[k]));
  root.TTRPG_CHARACTER_EN=Object.freeze({
    build:'20260720e3',
    raceFeatures:Object.freeze(races),
    classFeatureDescriptions:Object.freeze({ranger:Object.freeze({'Favored Foe':'Tasha\'s: mark a creature you hit; the first hit each turn deals +1d4 damage (1d6 at level 6; 1d8 at level 14). Uses equal your proficiency bonus per Long Rest. Declare "Use Favored Foe on <enemy>" in combat.'})})
  });
})(globalThis);
