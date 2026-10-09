// Generated browser projection of _shared/spell-area-geometry.ts; parity checked by spell-area-picker.test.ts.
(function(global){
"use strict";
const COMPASS = {
    N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
    S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};
function spellAreaCompassDirection(value) {
    if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(COMPASS, value))
        return null;
    const [x, y] = COMPASS[value];
    return spellAreaDirection({ col: 0, row: 0 }, { col: x, row: y });
}
// The picker contract uses side length for cubes, radius for sphere/cylinder,
// and length for cone/line. A self cube starts outside the caster's footprint.
function spellAreaPickerContainsCell(template, cell) {
    const { shape, origin, originCell, sizeFt, cellFt } = template;
    if (![cell.col, cell.row, originCell.col, originCell.row].every(Number.isSafeInteger) ||
        !Number.isSafeInteger(sizeFt) || sizeFt < 1 || !Number.isSafeInteger(cellFt) || cellFt < 1 ||
        sizeFt % cellFt !== 0 || (origin !== "self" && origin !== "point"))
        return false;
    const n = sizeFt / cellFt, dx = cell.col - originCell.col, dy = cell.row - originCell.row;
    if (shape === "sphere" || shape === "cylinder")
        return dx * dx + dy * dy <= n * n;
    const d = spellAreaCompassDirection(template.direction);
    if (shape === "cone" || shape === "line") {
        if (origin !== "self" || !d)
            return false;
        return spellAreaContainsCell(shape, cell, originCell, n, d);
    }
    if (shape !== "cube")
        return false;
    if (origin === "point")
        return dx >= 0 && dx < n && dy >= 0 && dy < n;
    if (!d)
        return false;
    const x = COMPASS[template.direction][0];
    const y = COMPASS[template.direction][1];
    const axis = (delta, sign) => sign > 0 ? delta >= 1 && delta <= n
        : sign < 0 ? delta <= -1 && delta >= -n
            : delta >= -Math.floor((n - 1) / 2) && delta <= Math.ceil((n - 1) / 2);
    return axis(dx, x) && axis(dy, y);
}
function spellAreaTokenCells(token) {
    const size = token.size == null ? 1 : Number(token.size);
    if (![token.col, token.row, size].every(Number.isSafeInteger) || size < 1 || size > 20)
        return null;
    const cells = [];
    for (let col = token.col; col < token.col + size; col++)
        for (let row = token.row; row < token.row + size; row++)
            cells.push({ col, row });
    return cells;
}
function spellAreaPickerHitsToken(template, token) {
    const cells = spellAreaTokenCells(token);
    return cells ? cells.some((cell) => spellAreaPickerContainsCell(template, cell)) : null;
}
function spellAreaPickerCells(template, cols, rows) {
    if (![cols, rows].every(Number.isSafeInteger) || cols < 1 || rows < 1 || cols > 128 || rows > 128)
        return null;
    const cells = [];
    for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++)
            if (spellAreaPickerContainsCell(template, { col, row }))
                cells.push({ col, row });
    return cells;
}
function spellAreaChebyDistance(a, b) {
    return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}
function spellAreaDirection(from, to) {
    const dx = to.col - from.col, dy = to.row - from.row;
    const length = Math.sqrt(dx * dx + dy * dy);
    return length > 0 ? { vx: dx / length, vy: dy / length } : null;
}
function legacyAreaRadiusContains(cell, center, radiusCells) {
    return spellAreaChebyDistance(cell, center) <= radiusCells;
}
function legacyAreaDirectionalContains(shape, cell, origin, direction, lengthCells) {
    const px = cell.col - origin.col, py = cell.row - origin.row;
    const along = px * direction.vx + py * direction.vy;
    const perp = Math.abs(px * direction.vy - py * direction.vx);
    if (!(along > 0.25) || along > lengthCells + 0.25)
        return false;
    return shape === "cone" ? perp <= along / 2 + 0.35 : perp <= 0.55;
}
// A later picker may opt into geometric cell-center membership after effect-owner review.
// The three pre-existing callers use the explicit legacy adapters above.
function spellAreaContainsCell(shape, cell, origin, sizeCells, direction = null) {
    if (!Number.isFinite(sizeCells) || sizeCells < 0 ||
        !Number.isFinite(cell.col) || !Number.isFinite(cell.row) ||
        !Number.isFinite(origin.col) || !Number.isFinite(origin.row))
        return false;
    const dx = cell.col - origin.col, dy = cell.row - origin.row;
    if (shape === "cube")
        return Math.max(Math.abs(dx), Math.abs(dy)) <= sizeCells;
    if (shape === "sphere" || shape === "cylinder")
        return dx * dx + dy * dy <= sizeCells * sizeCells;
    if (!direction || !Number.isFinite(direction.vx) || !Number.isFinite(direction.vy))
        return false;
    const along = dx * direction.vx + dy * direction.vy;
    const perp = Math.abs(dx * direction.vy - dy * direction.vx);
    if (!(along > 0) || along > sizeCells)
        return false;
    return shape === "cone" ? perp <= along / 2 : perp <= 0.5;
}
global.SpellAreaGeometry={spellAreaPickerCells,spellAreaPickerHitsToken};
})(globalThis);
