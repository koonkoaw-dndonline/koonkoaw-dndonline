/*
 * DICE-FE1 Phase A — deterministic Canvas 2D roll-event renderer.
 *
 * The server owns every face and outcome. This module only lays out and paints
 * values already present in rollEvent.groups[].rolls.
 *
 * language-impact: th+en — player-facing accessibility copy is routed through
 * an injected t(th, en) localizer. Phase A adds no runtime catalog or wiring.
 */
(function attachDiceCanvas() {
  "use strict";

  const BUILD = "20260810-dice-fe1-phase-a";
  const SOURCE_CATEGORIES = Object.freeze([
    "weapon",
    "spell",
    "class-feature",
    "racial",
    "item",
    "environment",
    "feat",
    "condition",
  ]);
  const DIE_SIDES = Object.freeze({
    d4: 4,
    d6: 6,
    d8: 8,
    d10: 10,
    d12: 12,
    d20: 20,
    d100: 100,
  });
  const DIE_MASS = Object.freeze({
    d4: .72,
    d6: 1,
    d8: 1.08,
    d10: 1.18,
    d12: 1.34,
    d20: 1.55,
  });
  const THEME_NAMES = Object.freeze(["light", "dark"]);
  const TAU = Math.PI * 2;
  // The whole scene is painted into a half-resolution backing buffer and the
  // browser enlarges it by this integer factor. Geometry is also snapped to
  // the same grid, so moving dice keep deliberately hard pixel edges.
  const PIXEL_ART_SCALE = 2;

  let localizer = null;
  let environment = null;
  let renderSequence = 0;
  let lastRenderState = null;
  const activeRenders = new Set();

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }
    Object.getOwnPropertyNames(value).forEach(function (key) {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function paletteEntry(code, family, lightFill, darkFill) {
    return deepFreeze({
      code: code,
      family: family,
      light: { fill: lightFill, ink: "#FFFFFF" },
      dark: { fill: darkFill, ink: "#FFFFFF" },
    });
  }

  const damagePalette = deepFreeze({
    bludgeoning: paletteEntry(
      "damage-bludgeoning",
      "physical-earth",
      "#4E4036",
      "#695548",
    ),
    piercing: paletteEntry(
      "damage-piercing",
      "physical-earth",
      "#574136",
      "#705548",
    ),
    slashing: paletteEntry(
      "damage-slashing",
      "physical-earth",
      "#603B3B",
      "#784C4C",
    ),
    acid: paletteEntry("damage-acid", "acid", "#35631F", "#477A2E"),
    cold: paletteEntry("damage-cold", "cold", "#14546A", "#20677D"),
    fire: paletteEntry("damage-fire", "fire", "#8E2E1E", "#A43A25"),
    force: paletteEntry("damage-force", "force", "#513280", "#694495"),
    lightning: paletteEntry(
      "damage-lightning",
      "lightning",
      "#665100",
      "#7A6200",
    ),
    necrotic: paletteEntry("damage-necrotic", "necrotic", "#403048", "#594062"),
    poison: paletteEntry("damage-poison", "poison", "#275C38", "#397348"),
    psychic: paletteEntry("damage-psychic", "psychic", "#76245F", "#903373"),
    radiant: paletteEntry("damage-radiant", "radiant", "#6F5200", "#856500"),
    thunder: paletteEntry("damage-thunder", "thunder", "#294F76", "#38658E"),
  });

  const rolePalette = deepFreeze({
    attack: paletteEntry("role-attack", "attack", "#712B34", "#883943"),
    check: paletteEntry("role-check", "check", "#25566C", "#326A80"),
    save: paletteEntry("role-save", "save", "#4A3D78", "#61528E"),
    healing: paletteEntry("role-healing", "healing", "#245C3D", "#34734E"),
    bonus: paletteEntry("role-bonus", "bonus", "#665000", "#7C6300"),
    penalty: paletteEntry("role-penalty", "penalty", "#702929", "#873939"),
    recovery: paletteEntry(
      "role-recovery-hit-die",
      "recovery",
      "#2D594E",
      "#3C6E61",
    ),
    "hit-die": paletteEntry(
      "role-recovery-hit-die",
      "recovery",
      "#2D594E",
      "#3C6E61",
    ),
    "death-save": paletteEntry(
      "role-death-save",
      "death-save",
      "#3B2B55",
      "#533E6D",
    ),
    "hp-loss": paletteEntry("role-hp-loss", "hp-loss", "#593B2D", "#704D3B"),
    unclassified: paletteEntry(
      "role-unclassified",
      "unclassified",
      "#41464B",
      "#575E64",
    ),
  });

  const BORDER_STYLES = deepFreeze({
    weapon: {
      code: "source-weapon",
      dash: [],
      width: 2,
      layers: 1,
      edge: "solid",
    },
    spell: {
      code: "source-spell",
      dash: [9, 4],
      width: 2,
      layers: 1,
      edge: "dash",
    },
    "class-feature": {
      code: "source-class-feature",
      dash: [2, 3],
      width: 3,
      layers: 1,
      edge: "dot",
    },
    racial: {
      code: "source-racial",
      dash: [11, 3, 2, 3],
      width: 2,
      layers: 1,
      edge: "long-dot",
    },
    item: {
      code: "source-item",
      dash: [1, 3],
      width: 2,
      layers: 2,
      edge: "double-dot",
    },
    environment: {
      code: "source-environment",
      dash: [13, 5],
      width: 3,
      layers: 1,
      edge: "long-dash",
    },
    feat: {
      code: "source-feat",
      dash: [6, 2, 1, 2],
      width: 3,
      layers: 1,
      edge: "dash-dot",
    },
    condition: {
      code: "source-condition",
      dash: [3, 3],
      width: 1.5,
      layers: 2,
      edge: "double-dash",
    },
    unclassified: {
      code: "source-unclassified",
      dash: [4, 4],
      width: 2,
      layers: 1,
      edge: "unclassified",
    },
  });

  const criticalBorder = deepFreeze({
    code: "critical",
    color: "#E7B83B",
    dash: [],
    width: 3,
    layers: 2,
    edge: "double",
    glow: true,
  });
  const natOneBorder = deepFreeze({
    code: "nat-one",
    color: "#C85D51",
    dash: [1, 2, 5, 2],
    width: 3,
    layers: 1,
    edge: "jagged",
    jagged: true,
  });

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function integer(value) {
    const number = finiteNumber(value);
    return number === null ? null : Math.trunc(number);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function cleanText(value, maxLength) {
    return String(value == null ? "" : value).trim().slice(0, maxLength);
  }

  function normalizedKey(value) {
    return cleanText(value, 80).toLowerCase().replace(/[_\s]+/g, "-");
  }

  function dieKind(value) {
    const key = normalizedKey(value);
    return DIE_SIDES[key] ? key : null;
  }

  function sourceCategory(value) {
    const key = normalizedKey(value);
    if (key === "class" || key === "classfeature") return "class-feature";
    if (key === "race" || key === "racial-trait") return "racial";
    return SOURCE_CATEGORIES.includes(key) ? key : "unclassified";
  }

  function roleKind(value) {
    const key = normalizedKey(value);
    if (key === "saving-throw" || key === "savingthrow") return "save";
    if (key === "ability-check" || key === "ability") return "check";
    if (key === "heal") return "healing";
    if (key === "hitdie" || key === "recovery-hit-die") return "hit-die";
    if (key === "deathsave") return "death-save";
    if (key === "hploss" || key === "non-damage-hp-loss") return "hp-loss";
    return rolePalette[key] ? key : "unclassified";
  }

  function parseHex(value) {
    const text = String(value || "").trim();
    const short = /^#([0-9a-f]{3})$/i.exec(text);
    if (short) {
      return short[1].split("").map(function (char) {
        return parseInt(char + char, 16);
      });
    }
    const full = /^#([0-9a-f]{6})$/i.exec(text);
    if (!full) return null;
    return [0, 2, 4].map(function (offset) {
      return parseInt(full[1].slice(offset, offset + 2), 16);
    });
  }

  function relativeLuminance(value) {
    const rgb = parseHex(value);
    if (!rgb) return null;
    const channels = rgb.map(function (channel) {
      const unit = channel / 255;
      return unit <= .03928
        ? unit / 12.92
        : Math.pow((unit + .055) / 1.055, 2.4);
    });
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  }

  function contrastRatio(foreground, background) {
    const first = relativeLuminance(foreground);
    const second = relativeLuminance(background);
    if (first === null || second === null) return 0;
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + .05) / (darker + .05);
  }

  function adjustHex(value, amount) {
    const rgb = parseHex(value);
    if (!rgb) return value;
    const target = amount >= 0 ? 255 : 0;
    const weight = Math.abs(clamp(amount, -1, 1));
    const next = rgb.map(function (channel) {
      return Math.round(channel + (target - channel) * weight);
    });
    return "#" + next.map(function (channel) {
      return channel.toString(16).padStart(2, "0");
    }).join("").toUpperCase();
  }

  function colorBlindVariant(palette) {
    const source = palette && typeof palette === "object" ? palette : {};
    const output = {};
    Object.keys(source).forEach(function (key, index) {
      const entry = source[key];
      if (!entry || typeof entry !== "object") return;
      output[key] = {
        code: entry.code,
        family: entry.family,
        light: {
          fill: adjustHex(entry.light.fill, -.08),
          ink: entry.light.ink,
        },
        dark: { fill: adjustHex(entry.dark.fill, -.12), ink: entry.dark.ink },
        pattern: {
          code: "cb-" + entry.code,
          kind: index % 3 === 0
            ? "hatch"
            : index % 3 === 1
            ? "crosshatch"
            : "dots",
          angle: (index * 37) % 180,
          spacing: 5 + (index % 4),
          strokeWidth: 1 + (index % 2) * .5,
        },
      };
    });
    return deepFreeze(output);
  }

  const colorBlindDamagePalette = colorBlindVariant(damagePalette);
  const colorBlindRolePalette = colorBlindVariant(rolePalette);

  function borderStyleFor(category) {
    return BORDER_STYLES[sourceCategory(category)];
  }

  function motionSeedFrom(rollEventId) {
    const text = String(rollEventId == null ? "" : rollEventId);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= text.length;
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^ (hash >>> 16)) >>> 0;
  }

  function createMotionPrng(seed) {
    let state = (integer(seed) >>> 0) || 0x6d2b79f5;
    return function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function eventGroups(rollEvent) {
    const event = rollEvent && typeof rollEvent === "object" ? rollEvent : {};
    const raw = Array.isArray(event.groups) ? event.groups : [];
    return deepFreeze(raw.map(function (group, groupIndex) {
      const source = group && typeof group === "object" ? group : {};
      const rolls = Array.isArray(source.rolls)
        ? source.rolls.map(integer)
        : [];
      return {
        index: groupIndex,
        id: cleanText(source.id || source.key || ("group-" + groupIndex), 120),
        label: cleanText(source.label || source.title || source.source, 180),
        formula: cleanText(source.formula, 80),
        die: dieKind(source.die),
        rolls: rolls,
        subtotal: integer(source.subtotal),
        damageType: normalizedKey(source.damageType),
        role: roleKind(source.role || event.kind),
        sourceCategory: sourceCategory(
          source.sourceCategory || source.category,
        ),
        critical: source.critical === true || source.criticalExtra === true,
        natOne: source.natOne === true,
      };
    }));
  }

  function faceInRange(die, value) {
    const face = integer(value);
    return face !== null && face >= 1 && face <= DIE_SIDES[die];
  }

  function visualDiceFor(rollEvent) {
    const output = [];
    eventGroups(rollEvent).forEach(function (group) {
      group.rolls.forEach(function (face, rollIndex) {
        const sourceId = group.id + ":" + rollIndex;
        if (group.die === "d100") {
          const valid = faceInRange("d100", face);
          const percentile = valid && face === 100 ? 0 : valid ? face : null;
          const tens = percentile === null
            ? null
            : Math.floor(percentile / 10) * 10;
          const ones = percentile === null ? null : percentile % 10;
          output.push({
            id: sourceId + ":tens",
            sourceId: sourceId,
            groupIndex: group.index,
            rollIndex: rollIndex,
            die: "d10",
            declaredDie: "d100",
            authoritativeFace: face,
            displayFace: tens,
            percentilePart: "tens",
            valid: valid,
            role: group.role,
            damageType: group.damageType,
            sourceCategory: group.sourceCategory,
            critical: group.critical,
            natOne: group.natOne,
          });
          output.push({
            id: sourceId + ":ones",
            sourceId: sourceId,
            groupIndex: group.index,
            rollIndex: rollIndex,
            die: "d10",
            declaredDie: "d100",
            authoritativeFace: face,
            displayFace: ones,
            percentilePart: "ones",
            valid: valid,
            role: group.role,
            damageType: group.damageType,
            sourceCategory: group.sourceCategory,
            critical: group.critical,
            natOne: group.natOne,
          });
        } else {
          output.push({
            id: sourceId,
            sourceId: sourceId,
            groupIndex: group.index,
            rollIndex: rollIndex,
            die: group.die,
            declaredDie: group.die,
            authoritativeFace: face,
            displayFace: face,
            percentilePart: null,
            valid: faceInRange(group.die, face),
            role: group.role,
            damageType: group.damageType,
            sourceCategory: group.sourceCategory,
            critical: group.critical,
            natOne: group.natOne,
          });
        }
      });
    });
    return deepFreeze(output);
  }

  function finalFacesFor(rollEvent) {
    return deepFreeze(
      eventGroups(rollEvent).map(function (group) {
        return {
          groupId: group.id,
          die: group.die,
          rolls: group.rolls.slice(),
        };
      }),
    );
  }

  function eventHasEffect(rollEvent, effect) {
    const event = rollEvent && typeof rollEvent === "object" ? rollEvent : {};
    const effects = Array.isArray(event.effects)
      ? event.effects.map(normalizedKey)
      : [];
    if (effect === "critical") {
      return event.critical === true || effects.includes("critical") ||
        eventGroups(event).some(function (group) {
          return group.critical;
        });
    }
    return event.natOne === true || effects.includes("nat-one") ||
      eventGroups(event).some(function (group) {
        return group.natOne;
      });
  }

  function timelineFor(rollEvent) {
    const event = rollEvent && typeof rollEvent === "object" ? rollEvent : {};
    const count = Math.max(1, visualDiceFor(event).length);
    const seed = motionSeedFrom(event.id);
    const rollMs = Math.min(3000, 2200 + Math.max(0, count - 1) * 25);
    const settleMs = 400 + (seed % 201);
    const holdMs = 2000;
    const rollEndMs = rollMs;
    const revealAtMs = rollMs + settleMs;
    const totalMs = revealAtMs + holdMs;
    const effects = [];
    if (eventHasEffect(event, "critical")) {
      effects.push({
        kind: "critical",
        startMs: revealAtMs + 80,
        endMs: Math.min(totalMs, revealAtMs + 720),
      });
    }
    if (eventHasEffect(event, "nat-one")) {
      effects.push({
        kind: "nat-one",
        startMs: revealAtMs + 80,
        endMs: Math.min(totalMs, revealAtMs + 720),
      });
    }
    return deepFreeze({
      rollMs: rollMs,
      rollEndMs: rollEndMs,
      settleMs: settleMs,
      revealAtMs: revealAtMs,
      holdMs: holdMs,
      totalMs: totalMs,
      effects: effects,
    });
  }

  function qualityPlan(deviceHints) {
    const hints = deviceHints && typeof deviceHints === "object"
      ? deviceHints
      : {};
    const memory = finiteNumber(hints.deviceMemory);
    const cores = integer(hints.hardwareConcurrency);
    const battery = finiteNumber(hints.batteryLevel);
    const lowBattery = battery !== null && battery <= .2 &&
      hints.charging !== true;
    const low = hints.batterySaver === true || hints.saveData === true ||
      lowBattery ||
      (memory !== null && memory <= 2) || (cores !== null && cores <= 2);
    const medium = !low &&
      ((memory !== null && memory <= 4) || (cores !== null && cores <= 4));
    if (low) {
      return deepFreeze({
        level: "low",
        particleCount: 0,
        shadowBlur: 0,
        stepMs: 84,
        pixelRatioCap: 1,
      });
    }
    if (medium) {
      return deepFreeze({
        level: "medium",
        particleCount: 4,
        shadowBlur: 5,
        stepMs: 50,
        pixelRatioCap: 1.5,
      });
    }
    return deepFreeze({
      level: "high",
      particleCount: 10,
      shadowBlur: 10,
      stepMs: 34,
      pixelRatioCap: 2,
    });
  }

  function faceGeometryFor(die) {
    const key = dieKind(die);
    if (!key) {
      return deepFreeze({
        die: "unclassified",
        kind: "unclassified",
        vertices: 6,
        facets: 0,
        read: "none",
        apexValue: false,
      });
    }
    if (key === "d100") {
      return deepFreeze({
        die: "d100",
        kind: "percentile-pair",
        read: "two-d10",
        components: [
          { die: "d10", part: "tens" },
          { die: "d10", part: "ones" },
        ],
      });
    }
    const descriptor = {
      d4: { vertices: 3, read: "apex", facets: 4 },
      d6: { vertices: 6, read: "face", facets: 6 },
      d8: { vertices: 4, read: "face", facets: 8 },
      d10: { vertices: 6, read: "face", facets: 10 },
      d12: { vertices: 10, read: "face", facets: 12 },
      d20: { vertices: 6, read: "face", facets: 20 },
    }[key];
    return deepFreeze({
      die: key,
      kind: "polyhedron",
      vertices: descriptor.vertices,
      facets: descriptor.facets,
      read: descriptor.read,
      apexValue: descriptor.read === "apex",
    });
  }

  function layoutGroups(groups, viewportWidth) {
    const normalized = eventGroups({
      groups: Array.isArray(groups) ? groups : [],
    });
    const width = clamp(integer(viewportWidth) || 720, 240, 2400);
    const mobile = width < 640;
    const visual = visualDiceFor({ groups: groups });
    // 60/72 keeps a single roll compact on phones while giving the facet grid
    // at least 30/36 logical pixels. Under crowd pressure, 36 is the smallest
    // useful size: 18 low-resolution pixels instead of the previous 12.
    const baseSize = mobile ? 60 : 72;
    const scalePressure = Math.max(
      1,
      Math.sqrt(Math.max(1, visual.length) / (mobile ? 12 : 20)),
    );
    const dieSize = clamp(Math.floor(baseSize / scalePressure), 36, baseSize);
    const dieGap = Math.max(4, Math.floor(dieSize * .12));
    const groupGap = mobile ? 22 : 28;
    const sidePadding = mobile ? 14 : 22;
    const usable = Math.max(dieSize, width - sidePadding * 2);
    const perRow = Math.max(
      1,
      Math.floor((usable + dieGap) / (dieSize + dieGap)),
    );
    const positions = [];
    const groupLayouts = [];
    let cursorY = 18;
    normalized.forEach(function (group) {
      const members = visual.filter(function (item) {
        return item.groupIndex === group.index;
      });
      const rows = Math.max(1, Math.ceil(members.length / perRow));
      const labelY = cursorY;
      const diceTop = labelY + 22;
      members.forEach(function (item, index) {
        const row = Math.floor(index / perRow);
        const column = index % perRow;
        const countInRow = Math.min(perRow, members.length - row * perRow);
        const rowWidth = countInRow * dieSize +
          Math.max(0, countInRow - 1) * dieGap;
        const startX = (width - rowWidth) / 2;
        positions.push({
          id: item.id,
          groupIndex: group.index,
          x: startX + column * (dieSize + dieGap) + dieSize / 2,
          y: diceTop + row * (dieSize + dieGap) + dieSize / 2,
          size: dieSize,
          authoritativeFace: item.authoritativeFace,
          displayFace: item.displayFace,
          percentilePart: item.percentilePart,
          die: item.die,
        });
      });
      const height = 22 + rows * (dieSize + dieGap) - dieGap;
      groupLayouts.push({
        id: group.id,
        index: group.index,
        label: group.label,
        formula: group.formula,
        labelY: labelY,
        top: cursorY,
        height: height,
        count: members.length,
      });
      cursorY += height + groupGap;
    });
    return deepFreeze({
      width: width,
      height: Math.max(180, cursorY - groupGap + 18),
      mobile: mobile,
      dicePinned: mobile,
      detailsScrollable: true,
      allDiceVisible: positions.length === visual.length,
      autoScaled: dieSize < baseSize,
      dieSize: dieSize,
      groupGap: groupGap,
      groups: groupLayouts,
      positions: positions,
    });
  }

  function bodyRadius(die, size) {
    const factor = die === "d4" ? .46 : die === "d20" ? .52 : .49;
    return Math.max(10, size * factor);
  }

  function initialBodies(dice, layout, width, height, seed) {
    const random = createMotionPrng(seed);
    const positionById = new Map(layout.positions.map(function (position) {
      return [position.id, position];
    }));
    return dice.map(function (item, index) {
      const target = positionById.get(item.id);
      const size = target ? target.size : 48;
      const radius = bodyRadius(item.die, size);
      const x = radius + random() * Math.max(1, width - radius * 2);
      const y = radius + random() * Math.max(1, height * .55 - radius * 2);
      const speed = .32 + random() * .48;
      const direction = random() * TAU;
      return {
        id: item.id,
        index: index,
        x: x,
        y: y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed - .25 - random() * .25,
        angle: random() * TAU,
        angular: (random() - .5) * .035,
        mass: DIE_MASS[item.die] || 1.18,
        radius: radius,
        collisions: 0,
      };
    });
  }

  function collideBodies(left, right) {
    const dx = right.x - left.x;
    const dy = right.y - left.y;
    const minDistance = left.radius + right.radius;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minDistance * minDistance) return 0;
    const distance = Math.sqrt(distanceSquared) || .0001;
    const nx = distanceSquared === 0 ? 1 : dx / distance;
    const ny = distanceSquared === 0 ? 0 : dy / distance;
    const overlap = minDistance - distance;
    const totalMass = left.mass + right.mass;
    left.x -= nx * overlap * (right.mass / totalMass);
    left.y -= ny * overlap * (right.mass / totalMass);
    right.x += nx * overlap * (left.mass / totalMass);
    right.y += ny * overlap * (left.mass / totalMass);
    const relativeX = right.vx - left.vx;
    const relativeY = right.vy - left.vy;
    const along = relativeX * nx + relativeY * ny;
    if (along < 0) {
      const impulse = -(1 + .72) * along / (1 / left.mass + 1 / right.mass);
      left.vx -= impulse * nx / left.mass;
      left.vy -= impulse * ny / left.mass;
      right.vx += impulse * nx / right.mass;
      right.vy += impulse * ny / right.mass;
    }
    left.angular -= .0025 * right.mass;
    right.angular += .0025 * left.mass;
    left.collisions++;
    right.collisions++;
    return 1;
  }

  function stepBodies(bodies, width, height, stepMs) {
    const scale = stepMs / 16.6667;
    let edgeCollisions = 0;
    let pairCollisions = 0;
    bodies.forEach(function (body) {
      body.vy += .018 * scale;
      body.vx *= Math.pow(.989, scale);
      body.vy *= Math.pow(.989, scale);
      body.angular *= Math.pow(.991, scale);
      body.x += body.vx * stepMs;
      body.y += body.vy * stepMs;
      body.angle += body.angular * stepMs;
      if (body.x < body.radius) {
        body.x = body.radius;
        body.vx = Math.abs(body.vx) * .76;
        edgeCollisions++;
      }
      if (body.x > width - body.radius) {
        body.x = width - body.radius;
        body.vx = -Math.abs(body.vx) * .76;
        edgeCollisions++;
      }
      if (body.y < body.radius) {
        body.y = body.radius;
        body.vy = Math.abs(body.vy) * .72;
        edgeCollisions++;
      }
      if (body.y > height - body.radius) {
        body.y = height - body.radius;
        body.vy = -Math.abs(body.vy) * .66;
        body.vx *= .94;
        edgeCollisions++;
      }
    });
    for (let left = 0; left < bodies.length; left++) {
      for (let right = left + 1; right < bodies.length; right++) {
        pairCollisions += collideBodies(bodies[left], bodies[right]);
      }
    }
    return { edge: edgeCollisions, pair: pairCollisions };
  }

  function bodySnapshot(body) {
    return deepFreeze({
      id: body.id,
      x: Number(body.x.toFixed(4)),
      y: Number(body.y.toFixed(4)),
      angle: Number(body.angle.toFixed(6)),
      collisions: body.collisions,
    });
  }

  function motionFramesFor(
    rollEvent,
    viewportWidth,
    viewportHeight,
    deviceHints,
  ) {
    const event = rollEvent && typeof rollEvent === "object" ? rollEvent : {};
    const width = clamp(integer(viewportWidth) || 720, 240, 2400);
    const layout = layoutGroups(event.groups, width);
    const height = clamp(
      integer(viewportHeight) || Math.max(260, layout.height),
      220,
      1600,
    );
    const quality = qualityPlan(deviceHints);
    const timeline = timelineFor(event);
    const dice = visualDiceFor(event);
    const seed = motionSeedFrom(event.id);
    const bodies = initialBodies(dice, layout, width, height, seed);
    const frames = [{ atMs: 0, items: bodies.map(bodySnapshot) }];
    let edgeCollisionCount = 0;
    let pairCollisionCount = 0;
    let at = 0;
    while (at < timeline.rollMs) {
      const step = Math.min(quality.stepMs, timeline.rollMs - at);
      const collisions = stepBodies(bodies, width, height, step);
      edgeCollisionCount += collisions.edge;
      pairCollisionCount += collisions.pair;
      at += step;
      frames.push({ atMs: at, items: bodies.map(bodySnapshot) });
    }
    return deepFreeze({
      seed: seed,
      width: width,
      height: height,
      quality: quality,
      timeline: timeline,
      collisionCount: edgeCollisionCount + pairCollisionCount,
      edgeCollisionCount: edgeCollisionCount,
      pairCollisionCount: pairCollisionCount,
      frames: frames,
      layout: layout,
      dice: dice,
    });
  }

  function lerp(first, second, progress) {
    return first + (second - first) * progress;
  }

  function rollingFrameAt(motion, elapsed) {
    const frames = motion.frames;
    let right = frames.findIndex(function (frame) {
      return frame.atMs >= elapsed;
    });
    if (right < 0) return frames[frames.length - 1];
    if (right === 0) return frames[0];
    const before = frames[right - 1];
    const after = frames[right];
    const span = Math.max(1, after.atMs - before.atMs);
    const progress = clamp((elapsed - before.atMs) / span, 0, 1);
    return {
      atMs: elapsed,
      items: before.items.map(function (item, index) {
        const target = after.items[index];
        return {
          id: item.id,
          x: lerp(item.x, target.x, progress),
          y: lerp(item.y, target.y, progress),
          angle: lerp(item.angle, target.angle, progress),
          collisions: target.collisions,
        };
      }),
    };
  }

  function framePlanAt(motion, elapsedMs) {
    const elapsed = clamp(
      finiteNumber(elapsedMs) || 0,
      0,
      motion.timeline.totalMs,
    );
    const finalRolling = motion.frames[motion.frames.length - 1];
    const targetById = new Map(motion.layout.positions.map(function (position) {
      return [position.id, position];
    }));
    let phase = "roll";
    let items = [];
    if (elapsed < motion.timeline.rollMs) {
      const frame = rollingFrameAt(motion, elapsed);
      items = frame.items.map(function (item) {
        return Object.assign({}, item);
      });
    } else {
      const progress = clamp(
        (elapsed - motion.timeline.rollMs) /
          Math.max(1, motion.timeline.settleMs),
        0,
        1,
      );
      phase = progress < 1 ? "settle" : "hold";
      items = finalRolling.items.map(function (item) {
        const target = targetById.get(item.id);
        return {
          id: item.id,
          x: target ? lerp(item.x, target.x, progress) : item.x,
          y: target ? lerp(item.y, target.y, progress) : item.y,
          angle: item.angle,
          collisions: item.collisions,
        };
      });
    }
    const settled = elapsed >= motion.timeline.rollEndMs;
    const revealed = elapsed >= motion.timeline.revealAtMs;
    const activeEffects = motion.timeline.effects.filter(function (effect) {
      return elapsed >= effect.startMs && elapsed <= effect.endMs;
    }).map(function (effect) {
      return effect.kind;
    });
    const diceById = new Map(motion.dice.map(function (item) {
      return [item.id, item];
    }));
    return deepFreeze({
      atMs: elapsed,
      phase: phase,
      settled: settled,
      revealed: revealed,
      activeEffects: activeEffects,
      items: items.map(function (item) {
        const die = diceById.get(item.id);
        const target = targetById.get(item.id);
        return Object.assign({}, item, {
          size: target ? target.size : 48,
          die: die.die,
          groupIndex: die.groupIndex,
          authoritativeFace: settled ? die.authoritativeFace : null,
          displayFace: settled ? die.displayFace : null,
          percentilePart: die.percentilePart,
          role: die.role,
          damageType: die.damageType,
          sourceCategory: die.sourceCategory,
          critical: die.critical,
          natOne: die.natOne,
        });
      }),
    });
  }

  function paletteForItem(item, theme, colorBlind) {
    const themeName = theme === "light" ? "light" : "dark";
    const damageKey = damagePalette[item.damageType] ? item.damageType : null;
    const palette = damageKey
      ? (colorBlind ? colorBlindDamagePalette : damagePalette)
      : (colorBlind ? colorBlindRolePalette : rolePalette);
    const entry = palette[damageKey || roleKind(item.role)];
    return deepFreeze({
      code: entry.code,
      fill: entry[themeName].fill,
      ink: entry[themeName].ink,
      pattern: entry.pattern || null,
      theme: themeName,
    });
  }

  // Normalized orthographic silhouettes and visible face meshes. Facet counts
  // in faceGeometryFor still describe the physical dice; this table contains
  // only the faces visible from the fixed pixel-art camera.
  const PIXEL_DIE_MODELS = deepFreeze({
    d4: {
      vertices: [[0, -1], [.9, .72], [-.9, .72], [0, .12]],
      outline: [0, 1, 2],
      facets: [
        { vertices: [0, 1, 3], tone: 4 },
        { vertices: [1, 2, 3], tone: 1 },
        { vertices: [2, 0, 3], tone: 2 },
      ],
    },
    d6: {
      vertices: [
        [0, -.92], [.82, -.42], [.82, .44], [0, .92],
        [-.82, .44], [-.82, -.42], [0, .08],
      ],
      outline: [0, 1, 2, 3, 4, 5],
      facets: [
        { vertices: [0, 1, 6, 5], tone: 4 },
        { vertices: [1, 2, 3, 6], tone: 2 },
        { vertices: [5, 6, 3, 4], tone: 0 },
      ],
    },
    d8: {
      vertices: [[0, -1], [.86, 0], [0, 1], [-.86, 0], [0, .02]],
      outline: [0, 1, 2, 3],
      facets: [
        { vertices: [0, 1, 4], tone: 4 },
        { vertices: [1, 2, 4], tone: 2 },
        { vertices: [2, 3, 4], tone: 0 },
        { vertices: [3, 0, 4], tone: 3 },
      ],
    },
    d10: {
      vertices: [
        [0, -1], [.72, -.4], [.58, .52], [0, 1],
        [-.58, .52], [-.72, -.4], [0, -.45], [0, .06],
      ],
      outline: [0, 1, 2, 3, 4, 5],
      facets: [
        { vertices: [0, 1, 6], tone: 4 },
        { vertices: [1, 7, 6], tone: 3 },
        { vertices: [1, 2, 7], tone: 2 },
        { vertices: [2, 3, 7], tone: 1 },
        { vertices: [3, 4, 7], tone: 0 },
        { vertices: [4, 5, 7], tone: 1 },
        { vertices: [5, 6, 7], tone: 2 },
        { vertices: [5, 0, 6], tone: 3 },
      ],
    },
    d12: {
      vertices: [
        [0, -1], [.58, -.78], [.92, -.26], [.84, .38], [.38, .9],
        [-.38, .9], [-.84, .38], [-.92, -.26], [-.58, -.78],
        [0, -.46], [.42, -.14], [.26, .42], [-.26, .42], [-.42, -.14],
      ],
      outline: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      facets: [
        { vertices: [9, 10, 11, 12, 13], tone: 3 },
        { vertices: [0, 1, 10, 9, 8], tone: 4 },
        { vertices: [1, 2, 3, 11, 10], tone: 2 },
        { vertices: [3, 4, 5, 12, 11], tone: 1 },
        { vertices: [5, 6, 7, 13, 12], tone: 0 },
        { vertices: [7, 8, 9, 13], tone: 2 },
      ],
    },
    d20: {
      vertices: [
        [0, -1], [.78, -.46], [.92, .25], [0, 1],
        [-.92, .25], [-.78, -.46], [0, -.42], [.4, .08],
        [.28, .58], [-.28, .58], [-.4, .08],
      ],
      outline: [0, 1, 2, 3, 4, 5],
      facets: [
        { vertices: [0, 5, 6], tone: 4 },
        { vertices: [0, 6, 1], tone: 3 },
        { vertices: [5, 4, 10], tone: 2 },
        { vertices: [5, 10, 6], tone: 3 },
        { vertices: [6, 10, 7], tone: 1 },
        { vertices: [6, 7, 1], tone: 4 },
        { vertices: [1, 7, 2], tone: 2 },
        { vertices: [10, 4, 9], tone: 0 },
        { vertices: [10, 9, 7], tone: 2 },
        { vertices: [7, 9, 8], tone: 1 },
        { vertices: [7, 8, 2], tone: 3 },
        { vertices: [4, 3, 9], tone: 0 },
        { vertices: [9, 3, 8], tone: 1 },
        { vertices: [8, 3, 2], tone: 2 },
      ],
    },
  });

  function pixelStepFor(size) {
    return clamp(Math.round((finiteNumber(size) || 48) / 32), 2, 3);
  }

  function pixelArtPlanFor(item) {
    const geometry = faceGeometryFor(item && item.die);
    const model = PIXEL_DIE_MODELS[geometry.die] || PIXEL_DIE_MODELS.d6;
    const size = Math.max(24, finiteNumber(item && item.size) || 48);
    const radius = size * .48;
    const step = pixelStepFor(size);
    const centerX = finiteNumber(item && item.x) || 0;
    const centerY = finiteNumber(item && item.y) || 0;
    const rotation = geometry.read === "apex"
      ? 0
      : finiteNumber(item && item.angle) || 0;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const vertices = model.vertices.map(function (vertex) {
      const x = vertex[0] * cosine - vertex[1] * sine;
      const y = vertex[0] * sine + vertex[1] * cosine;
      return {
        x: Math.round((centerX + x * radius) / step) * step,
        y: Math.round((centerY + y * radius) / step) * step,
      };
    });
    return deepFreeze({
      die: geometry.die,
      pixelScale: PIXEL_ART_SCALE,
      pixelStep: step,
      outline: model.outline.map(function (index) {
        return vertices[index];
      }),
      facets: model.facets.map(function (facet) {
        return {
          tone: facet.tone,
          points: facet.vertices.map(function (index) {
            return vertices[index];
          }),
        };
      }),
    });
  }

  function polygonPoints(item) {
    return pixelArtPlanFor(item).outline;
  }

  function mixHexColor(source, target, ratio) {
    const clean = String(source || "#555555").replace("#", "");
    const fallback = clean.length === 6 ? clean : "555555";
    const amount = clamp(finiteNumber(ratio) || 0, 0, 1);
    const channels = [0, 2, 4].map(function (offset) {
      const from = parseInt(fallback.slice(offset, offset + 2), 16);
      const to = target === "white" ? 255 : 0;
      return Math.round(from + (to - from) * amount).toString(16)
        .padStart(2, "0");
    });
    return "#" + channels.join("").toUpperCase();
  }

  function pixelFacetPalette(fill) {
    return deepFreeze([
      mixHexColor(fill, "black", .44),
      mixHexColor(fill, "black", .24),
      String(fill),
      mixHexColor(fill, "white", .2),
      mixHexColor(fill, "white", .38),
    ]);
  }

  function safeContextCall(context, name, args) {
    try {
      if (context && typeof context[name] === "function") {
        return context[name].apply(context, args || []);
      }
    } catch (error) {}
    return undefined;
  }

  function strokePolygon(context, points, border, color, scale) {
    let outline = points;
    if (border.jagged === true) {
      outline = [];
      points.forEach(function (point, index) {
        const next = points[(index + 1) % points.length];
        const dx = next.x - point.x;
        const dy = next.y - point.y;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        for (let segment = 0; segment < 5; segment++) {
          const progress = segment / 5;
          const offset = segment === 0
            ? 0
            : (segment % 2 === 0 ? -2.4 : 2.4) * scale;
          outline.push({
            x: point.x + dx * progress - dy / length * offset,
            y: point.y + dy * progress + dx / length * offset,
          });
        }
      });
    }
    function drawStroke(width, strokeColor) {
      safeContextCall(context, "beginPath");
      outline.forEach(function (point, index) {
        safeContextCall(context, index === 0 ? "moveTo" : "lineTo", [
          point.x,
          point.y,
        ]);
      });
      safeContextCall(context, "closePath");
      try {
        context.strokeStyle = strokeColor;
        context.lineWidth = width;
        context.setLineDash(border.dash || []);
      } catch (error) {}
      safeContextCall(context, "stroke");
    }
    if (border.edge === "double") {
      const base = (border.width || 2) * scale;
      drawStroke(base + 5 * scale, color || border.color || "#FFFFFF");
      drawStroke(base + 3 * scale, "rgba(24,18,12,.88)");
      drawStroke(base, color || border.color || "#FFFFFF");
      return;
    }
    const layers = Math.max(1, integer(border.layers) || 1);
    for (let layer = 0; layer < layers; layer++) {
      drawStroke(
        (border.width || 2) + (layers - layer - 1) * 3 * scale,
        color || border.color || "#FFFFFF",
      );
    }
  }

  function drawPattern(context, points, pattern, color) {
    if (!pattern || !points.length) return;
    const minX = Math.min.apply(
      null,
      points.map(function (point) {
        return point.x;
      }),
    );
    const maxX = Math.max.apply(
      null,
      points.map(function (point) {
        return point.x;
      }),
    );
    const minY = Math.min.apply(
      null,
      points.map(function (point) {
        return point.y;
      }),
    );
    const maxY = Math.max.apply(
      null,
      points.map(function (point) {
        return point.y;
      }),
    );
    safeContextCall(context, "save");
    safeContextCall(context, "beginPath");
    points.forEach(function (point, index) {
      safeContextCall(context, index === 0 ? "moveTo" : "lineTo", [
        point.x,
        point.y,
      ]);
    });
    safeContextCall(context, "closePath");
    safeContextCall(context, "clip");
    try {
      context.strokeStyle = color;
      context.lineWidth = pattern.strokeWidth || 1;
    } catch (error) {}
    const spacing = Math.max(4, pattern.spacing || 6);
    if (pattern.kind === "dots") {
      try {
        context.fillStyle = color;
      } catch (error) {}
      for (let x = minX; x <= maxX; x += spacing) {
        for (let y = minY; y <= maxY; y += spacing) {
          safeContextCall(context, "beginPath");
          safeContextCall(context, "arc", [
            x,
            y,
            pattern.strokeWidth || 1,
            0,
            TAU,
          ]);
          safeContextCall(context, "fill");
        }
      }
      safeContextCall(context, "restore");
      return;
    }
    for (
      let offset = minX - (maxY - minY);
      offset < maxX + (maxY - minY);
      offset += spacing
    ) {
      safeContextCall(context, "beginPath");
      safeContextCall(context, "moveTo", [offset, minY]);
      safeContextCall(context, "lineTo", [offset + (maxY - minY), maxY]);
      safeContextCall(context, "stroke");
      if (pattern.kind === "crosshatch") {
        safeContextCall(context, "beginPath");
        safeContextCall(context, "moveTo", [offset, maxY]);
        safeContextCall(context, "lineTo", [offset + (maxY - minY), minY]);
        safeContextCall(context, "stroke");
      }
    }
    safeContextCall(context, "restore");
  }

  function displayFaceText(item) {
    if (item.displayFace === null || item.displayFace === undefined) return "";
    if (item.percentilePart === "tens") {
      return String(item.displayFace).padStart(2, "0");
    }
    return String(item.displayFace);
  }

  function tracePolygon(context, points) {
    safeContextCall(context, "beginPath");
    points.forEach(function (point, index) {
      safeContextCall(context, index === 0 ? "moveTo" : "lineTo", [
        point.x,
        point.y,
      ]);
    });
    safeContextCall(context, "closePath");
  }

  function drawDie(context, item, settings, quality) {
    const colors = paletteForItem(item, settings.theme, settings.colorBlind);
    const art = pixelArtPlanFor(item);
    const points = art.outline;
    const facetPalette = pixelFacetPalette(colors.fill);
    safeContextCall(context, "save");
    try {
      context.imageSmoothingEnabled = false;
      context.lineJoin = "miter";
      context.lineCap = "butt";
      context.fillStyle = facetPalette[0];
      context.shadowColor = "rgba(0,0,0,.42)";
      context.shadowBlur = quality.shadowBlur;
      context.shadowOffsetY = quality.shadowBlur ? art.pixelStep : 0;
    } catch (error) {}
    tracePolygon(context, points);
    safeContextCall(context, "fill");
    try {
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
    } catch (error) {}

    art.facets.forEach(function (facet) {
      try {
        context.fillStyle = facetPalette[facet.tone] || facetPalette[2];
      } catch (error) {}
      tracePolygon(context, facet.points);
      safeContextCall(context, "fill");
      try {
        context.strokeStyle = facetPalette[0];
        context.lineWidth = art.pixelStep;
        context.setLineDash([]);
      } catch (error) {}
      safeContextCall(context, "stroke");
    });

    drawPattern(context, points, colors.pattern, "rgba(255,255,255,.42)");
    strokePolygon(
      context,
      points,
      borderStyleFor(item.sourceCategory),
      "rgba(255,255,255,.82)",
      1,
    );
    if (item.critical) {
      strokePolygon(context, points, criticalBorder, criticalBorder.color, 1);
    }
    if (item.natOne) {
      strokePolygon(context, points, natOneBorder, natOneBorder.color, 1);
    }
    if (item.displayFace !== null) {
      try {
        context.fillStyle = colors.ink;
        context.font = "800 " +
          String(Math.max(12, Math.round(item.size * .28))) +
          "px ui-monospace,monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
      } catch (error) {}
      const y = item.die === "d4" ? item.y - item.size * .13 : item.y;
      safeContextCall(context, "fillText", [displayFaceText(item), item.x, y]);
    }
    safeContextCall(context, "restore");
  }

  function drawActiveEffects(context, motion, frame) {
    if (!frame.activeEffects.length) return;
    const centerX = motion.width / 2;
    const centerY = motion.height / 2;
    frame.activeEffects.forEach(function (kind, effectIndex) {
      const critical = kind === "critical";
      const color = critical ? "#E7B83B" : "#D9D1C2";
      const phase = ((frame.atMs + effectIndex * 97) % 640) / 640;
      const radius = Math.min(motion.width, motion.height) *
        (.22 + phase * .12);
      safeContextCall(context, "save");
      try {
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = critical ? 3 : 2;
        context.globalAlpha = Math.max(.18, 1 - phase);
        context.setLineDash(critical ? [] : [2, 5, 8, 5]);
      } catch (error) {}
      safeContextCall(context, "beginPath");
      if (critical) {
        safeContextCall(context, "arc", [centerX, centerY, radius, 0, TAU]);
      } else {
        for (let point = 0; point < 16; point++) {
          const angle = TAU * point / 16;
          const jag = radius + (point % 2 === 0 ? 7 : -5);
          safeContextCall(context, point === 0 ? "moveTo" : "lineTo", [
            centerX + Math.cos(angle) * jag,
            centerY + Math.sin(angle) * jag,
          ]);
        }
        safeContextCall(context, "closePath");
      }
      safeContextCall(context, "stroke");
      const random = createMotionPrng(
        motion.seed ^ (critical ? 0xc81a : 0xa711),
      );
      for (let index = 0; index < motion.quality.particleCount; index++) {
        const angle = random() * TAU;
        const distance = radius * (.55 + random() * .6);
        const size = 1 + random() * 2.2;
        safeContextCall(context, "beginPath");
        safeContextCall(context, "arc", [
          centerX + Math.cos(angle) * distance,
          centerY + Math.sin(angle) * distance,
          size,
          0,
          TAU,
        ]);
        safeContextCall(context, "fill");
      }
      safeContextCall(context, "restore");
    });
  }

  function drawFrame(context, motion, frame, settings) {
    safeContextCall(context, "clearRect", [0, 0, motion.width, motion.height]);
    frame.items.forEach(function (item) {
      drawDie(context, item, settings, motion.quality);
    });
    drawActiveEffects(context, motion, frame);
    if (frame.revealed) {
      try {
        context.fillStyle = settings.theme === "light" ? "#17130F" : "#F4E7CE";
        context.font = "600 13px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
      } catch (error) {}
      motion.layout.groups.forEach(function (group) {
        const label = [group.label, group.formula].filter(Boolean).join(" · ");
        if (label) {
          safeContextCall(context, "fillText", [
            label,
            motion.width / 2,
            group.labelY + 8,
          ]);
        }
      });
    }
  }

  function localize(t, th, en) {
    if (typeof t !== "function") return "";
    try {
      const value = t(th, en);
      return typeof value === "string" ? value : "";
    } catch (error) {
      return "";
    }
  }

  function accessibleMirrorModel(rollEvent, t) {
    const event = rollEvent && typeof rollEvent === "object" ? rollEvent : {};
    const groups = eventGroups(event).map(function (group) {
      return {
        id: group.id,
        label: group.label,
        formula: group.formula,
        die: group.die,
        rolls: group.rolls.slice(),
        subtotal: group.subtotal,
      };
    });
    const title = cleanText(event.title, 180);
    const formula = cleanText(event.formula, 120);
    const total = integer(event.total);
    const raw = groups.map(function (group) {
      return group.rolls.join(", ");
    }).filter(Boolean).join(" | ");
    const th = localize(t, "ผลการทอย", "Dice roll result");
    const en = localize(t, "ค่าดิบ", "Raw values");
    const pieces = [
      th,
      title,
      formula,
      en,
      raw,
      total === null ? "" : String(total),
    ].filter(Boolean);
    return deepFreeze({
      role: "status",
      live: "polite",
      announceAtMs: timelineFor(event).revealAtMs,
      title: title,
      formula: formula,
      total: total,
      groups: groups,
      announcement: pieces.join(" · "),
    });
  }

  function defaultDeviceHints() {
    try {
      const nav = window.navigator || {};
      return {
        deviceMemory: nav.deviceMemory,
        hardwareConcurrency: nav.hardwareConcurrency,
        saveData: !!(nav.connection && nav.connection.saveData),
      };
    } catch (error) {
      return {};
    }
  }

  function defaultEnvironment() {
    return {
      now: function () {
        try {
          return window.performance &&
              typeof window.performance.now === "function"
            ? window.performance.now()
            : 0;
        } catch (error) {
          return 0;
        }
      },
      setTimer: function (callback, delay) {
        return window.setTimeout(callback, delay);
      },
      clearTimer: function (timer) {
        return window.clearTimeout(timer);
      },
      requestFrame: function (callback) {
        if (typeof window.requestAnimationFrame === "function") {
          return window.requestAnimationFrame(callback);
        }
        return window.setTimeout(function () {
          callback(environment.now());
        }, 16);
      },
      cancelFrame: function (frame) {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(frame);
        } else window.clearTimeout(frame);
      },
      createCanvas: function () {
        if (typeof document === "undefined" || !document.createElement) {
          return null;
        }
        return document.createElement("canvas");
      },
      appendCanvas: function (container, canvas) {
        if (!container || typeof container.appendChild !== "function") {
          return false;
        }
        container.appendChild(canvas);
        return true;
      },
      removeCanvas: function (canvas) {
        if (
          canvas && canvas.parentNode &&
          typeof canvas.parentNode.removeChild === "function"
        ) canvas.parentNode.removeChild(canvas);
      },
      deviceHints: defaultDeviceHints,
      reducedMotion: function () {
        try {
          return !!(window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        } catch (error) {
          return false;
        }
      },
      pixelRatio: function () {
        try {
          return Math.max(1, Number(window.devicePixelRatio) || 1);
        } catch (error) {
          return 1;
        }
      },
    };
  }

  function safeCallback(callback, value) {
    if (typeof callback !== "function") return;
    try {
      callback(value);
    } catch (error) {}
  }

  function scheduleTimer(callback, delay) {
    try {
      return environment.setTimer(callback, delay);
    } catch (error) {
      safeCallback(callback);
      return null;
    }
  }

  function clearScheduled(timer) {
    if (timer === null || timer === undefined) return;
    try {
      environment.clearTimer(timer);
    } catch (error) {}
  }

  function cancelScheduledFrame(frame) {
    if (frame === null || frame === undefined) return;
    try {
      environment.cancelFrame(frame);
    } catch (error) {}
  }

  function fallbackRender(rollEvent, onDone, reason) {
    const timeline = timelineFor(rollEvent);
    const state = {
      id: ++renderSequence,
      status: "fallback",
      reason: reason,
      timeline: timeline,
      settled: false,
      revealed: false,
      finalFaces: [],
      frameCount: 0,
      done: false,
      timer: null,
    };
    lastRenderState = state;
    activeRenders.add(state);
    state.timer = scheduleTimer(function () {
      if (state.done) return;
      state.done = true;
      state.settled = true;
      state.revealed = true;
      state.finalFaces = finalFacesFor(rollEvent);
      activeRenders.delete(state);
      safeCallback(onDone, {
        status: "fallback",
        reason: reason,
        timeline: timeline,
      });
    }, timeline.totalMs);
    return deepFreeze({
      status: "fallback",
      reason: reason,
      timeline: timeline,
      cancel: function () {
        return false;
      },
    });
  }

  function render(options) {
    const source = options && typeof options === "object" ? options : {};
    const event = source.rollEvent && typeof source.rollEvent === "object"
      ? source.rollEvent
      : {};
    const settings = source.settings && typeof source.settings === "object"
      ? source.settings
      : {};
    const onDone = source.onDone;
    const dice = visualDiceFor(event);
    if (
      !dice.length || dice.some(function (item) {
        return !item.valid;
      })
    ) {
      return fallbackRender(event, onDone, "invalid-roll-event");
    }
    let canvas = null;
    let context = null;
    try {
      canvas = environment.createCanvas();
      context = canvas && typeof canvas.getContext === "function"
        ? canvas.getContext("2d")
        : null;
    } catch (error) {
      context = null;
    }
    if (!canvas || !context) {
      return fallbackRender(event, onDone, "canvas-context-unavailable");
    }

    const width = clamp(
      integer(settings.viewportWidth) ||
        integer(source.container && source.container.clientWidth) || 720,
      240,
      2400,
    );
    const hints = Object.assign(
      {},
      environment.deviceHints(),
      settings.deviceHints || {},
    );
    const layout = layoutGroups(event.groups, width);
    const height = clamp(
      integer(settings.viewportHeight) || layout.height,
      220,
      1600,
    );
    const motion = motionFramesFor(event, width, height, hints);
    const reduced = settings.reducedMotion === true ||
      (settings.reducedMotion !== false &&
        environment.reducedMotion() === true);
    const ratio = Math.min(
      motion.quality.pixelRatioCap,
      Math.max(1, finiteNumber(environment.pixelRatio()) || 1),
    );
    const backingRatio = clamp(Math.floor(ratio), 1, 2);
    const bufferWidth = Math.max(1, Math.floor(width / PIXEL_ART_SCALE));
    const bufferHeight = Math.max(1, Math.floor(height / PIXEL_ART_SCALE));
    try {
      canvas.width = bufferWidth * backingRatio;
      canvas.height = bufferHeight * backingRatio;
      if (canvas.style) {
        canvas.style.width = String(bufferWidth * PIXEL_ART_SCALE) + "px";
        canvas.style.height = String(bufferHeight * PIXEL_ART_SCALE) + "px";
        canvas.style.imageRendering = "pixelated";
      }
      context.imageSmoothingEnabled = false;
      if (typeof context.scale === "function") {
        context.scale(
          backingRatio / PIXEL_ART_SCALE,
          backingRatio / PIXEL_ART_SCALE,
        );
      }
      if (environment.appendCanvas(source.container, canvas) !== true) {
        return fallbackRender(event, onDone, "container-unavailable");
      }
    } catch (error) {
      try {
        environment.removeCanvas(canvas);
      } catch (removeError) {}
      return fallbackRender(event, onDone, "canvas-attach-failed");
    }

    const t = typeof settings.t === "function" ? settings.t : localizer;
    const mirror = accessibleMirrorModel(event, t);
    const state = {
      id: ++renderSequence,
      status: "rendering",
      reason: null,
      timeline: motion.timeline,
      reducedMotion: reduced,
      settled: false,
      revealed: false,
      finalFaces: [],
      frameCount: 0,
      done: false,
      mirror: null,
      canvas: canvas,
      doneTimer: null,
      settleTimer: null,
      revealTimer: null,
      frame: null,
      start: environment.now(),
    };
    lastRenderState = state;
    activeRenders.add(state);

    function paint(elapsed) {
      if (state.done) return;
      const frame = framePlanAt(motion, elapsed);
      try {
        drawFrame(context, motion, frame, {
          theme: settings.theme,
          colorBlind: settings.colorBlind === true,
        });
      } catch (error) {}
      state.frameCount++;
      state.settled = frame.settled;
      state.revealed = frame.revealed;
      if (frame.settled) {
        state.finalFaces = finalFacesFor(event);
      }
      if (frame.revealed) {
        state.mirror = mirror;
      }
    }

    function finish(status) {
      if (state.done) return;
      paint(motion.timeline.totalMs);
      state.done = true;
      cancelScheduledFrame(state.frame);
      clearScheduled(state.settleTimer);
      clearScheduled(state.revealTimer);
      clearScheduled(state.doneTimer);
      activeRenders.delete(state);
      safeCallback(onDone, {
        status: status,
        timeline: motion.timeline,
        mirror: mirror,
      });
    }

    state.settleTimer = scheduleTimer(function () {
      paint(motion.timeline.rollEndMs);
    }, motion.timeline.rollEndMs);
    state.revealTimer = scheduleTimer(function () {
      paint(motion.timeline.revealAtMs);
    }, motion.timeline.revealAtMs);
    state.doneTimer = scheduleTimer(function () {
      finish("complete");
    }, motion.timeline.totalMs);
    if (reduced) {
      paint(0);
    } else {
      const tick = function (now) {
        if (state.done) return;
        const elapsed = clamp(
          (finiteNumber(now) || environment.now()) - state.start,
          0,
          motion.timeline.totalMs,
        );
        paint(elapsed);
        if (elapsed < motion.timeline.revealAtMs) {
          try {
            state.frame = environment.requestFrame(tick);
          } catch (error) {
            state.frame = null;
          }
        }
      };
      try {
        state.frame = environment.requestFrame(tick);
      } catch (error) {
        state.frame = null;
      }
    }

    return deepFreeze({
      status: "rendering",
      timeline: motion.timeline,
      quality: motion.quality,
      reducedMotion: reduced,
      mirror: mirror,
      cancel: function () {
        if (state.done) return false;
        cancelScheduledFrame(state.frame);
        try {
          environment.removeCanvas(state.canvas);
        } catch (error) {}
        state.status = "fallback";
        state.reason = "visual-cancelled";
        return true;
      },
    });
  }

  function init(options) {
    const source = options && typeof options === "object" ? options : {};
    if (typeof source.t !== "function") return false;
    localizer = source.t;
    return true;
  }

  function configureTestEnvironment(overrides) {
    const source = overrides && typeof overrides === "object" ? overrides : {};
    environment = Object.assign(
      {},
      environment || defaultEnvironment(),
      source,
    );
    return true;
  }

  function resetForTests() {
    activeRenders.forEach(function (state) {
      clearScheduled(state.timer);
      clearScheduled(state.doneTimer);
      clearScheduled(state.settleTimer);
      clearScheduled(state.revealTimer);
      cancelScheduledFrame(state.frame);
      try {
        if (state.canvas) environment.removeCanvas(state.canvas);
      } catch (error) {}
      state.done = true;
    });
    activeRenders.clear();
    renderSequence = 0;
    lastRenderState = null;
    localizer = null;
    environment = defaultEnvironment();
  }

  function testState() {
    if (!lastRenderState) return deepFreeze({ active: 0, last: null });
    return deepFreeze({
      active: activeRenders.size,
      last: {
        id: lastRenderState.id,
        status: lastRenderState.status,
        reason: lastRenderState.reason,
        reducedMotion: lastRenderState.reducedMotion === true,
        settled: lastRenderState.settled === true,
        revealed: lastRenderState.revealed === true,
        finalFaces: lastRenderState.finalFaces,
        frameCount: lastRenderState.frameCount,
        done: lastRenderState.done === true,
        mirror: lastRenderState.mirror,
      },
    });
  }

  environment = defaultEnvironment();
  window.DiceCanvas = deepFreeze({
    build: BUILD,
    init: init,
    render: render,
    _pure: {
      damagePalette: damagePalette,
      rolePalette: rolePalette,
      criticalBorder: criticalBorder,
      natOneBorder: natOneBorder,
      borderStyleFor: borderStyleFor,
      colorBlindVariant: colorBlindVariant,
      contrastRatio: contrastRatio,
      motionSeedFrom: motionSeedFrom,
      createMotionPrng: createMotionPrng,
      timelineFor: timelineFor,
      qualityPlan: qualityPlan,
      faceGeometryFor: faceGeometryFor,
      pixelArtPlanFor: pixelArtPlanFor,
      pixelFacetPalette: pixelFacetPalette,
      layoutGroups: layoutGroups,
      visualDiceFor: visualDiceFor,
      finalFacesFor: finalFacesFor,
      motionFramesFor: motionFramesFor,
      framePlanAt: framePlanAt,
      accessibleMirrorModel: accessibleMirrorModel,
    },
    _test: {
      configure: configureTestEnvironment,
      reset: resetForTests,
      state: testState,
    },
  });
})();
