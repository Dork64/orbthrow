// Точки карты forest_solo (Overthrow от Valve). Получены разбором forest_solo.vmap
// и сетки проходимости forest_solo.gnv (скрипты в _project/docs/camps.py, dmx.py).

export interface XY { x: number; y: number }

export const MAP = {
    center: { x: 0, y: 0 } as XY,
    bounds: 5632,
    // 8 точек приземления сокровищ (path_track item_spawn_1..8)
    itemSpawns: [
        { x: 1664, y: 1664 }, { x: 2432, y: 0 }, { x: 1664, y: -1664 }, { x: 0, y: -2432 },
        { x: -1664, y: -1664 }, { x: -2432, y: 0 }, { x: -1664, y: 1664 }, { x: 0, y: 2432 },
    ] as XY[],
    // Места рун (префабы rune_base)
    runeSpots: [
        { x: -2432, y: -3264 }, { x: -3808, y: 1344 }, { x: 3776, y: 1088 }, { x: 128, y: 3904 }, { x: 2240, y: -3200 },
    ] as XY[],
    // 10 баз по кругу: фонтан, точка появления, башня (против часовой стрелки от 70.5°)
    bases: [
        { fountain: { x: 1696, y: 4800 }, spawn: { x: 1544, y: 4396 }, tower: { x: 1472, y: 4128 } },
        { fountain: { x: 4193, y: 2886 }, spawn: { x: 3833, y: 2649 }, tower: { x: 3617, y: 2474 } },
        { fountain: { x: 5089, y: -130 }, spawn: { x: 4658, y: -110 }, tower: { x: 4381, y: -124 } },
        { fountain: { x: 4041, y: -3096 }, spawn: { x: 3704, y: -2827 }, tower: { x: 3471, y: -2676 } },
        { fountain: { x: 1449, y: -4880 }, spawn: { x: 1335, y: -4464 }, tower: { x: 1236, y: -4205 } },
        { fountain: { x: -1696, y: -4800 }, spawn: { x: -1544, y: -4396 }, tower: { x: -1472, y: -4128 } },
        { fountain: { x: -4193, y: -2886 }, spawn: { x: -3833, y: -2649 }, tower: { x: -3617, y: -2474 } },
        { fountain: { x: -5089, y: 130 }, spawn: { x: -4658, y: 110 }, tower: { x: -4381, y: 124 } },
        { fountain: { x: -4041, y: 3096 }, spawn: { x: -3704, y: 2827 }, tower: { x: -3471, y: 2676 } },
        { fountain: { x: -1449, y: 4880 }, spawn: { x: -1335, y: 4464 }, tower: { x: -1236, y: 4205 } },
    ],
    // 16 лагерей нейтралов (проверены на проходимость, ≥850 друг от друга, ≥1150 от башен)
    camps: [
        { type: "medium", x: 1454, y: 2681 }, { type: "small", x: 2752, y: 1315 },
        { type: "medium", x: 3048, y: -563 }, { type: "small", x: 2170, y: -2284 },
        { type: "medium", x: 393, y: -2974 }, { type: "small", x: -1525, y: -2813 },
        { type: "medium", x: -2707, y: -1293 }, { type: "small", x: -3098, y: 572 },
        { type: "medium", x: -2066, y: 2175 }, { type: "small", x: -393, y: 2974 },
        { type: "large", x: 493, y: 2959 }, { type: "large", x: 2216, y: -783 },
        { type: "large", x: -493, y: -2959 }, { type: "large", x: -2169, y: 766 },
        { type: "ancient", x: 651, y: 1571 }, { type: "ancient", x: -670, y: -1617 },
    ] as { type: "small" | "medium" | "large" | "ancient"; x: number; y: number }[],
};

/** Угол точки в градусах [0, 360). */
export function angleOf(p: XY): number {
    let a = (Math.atan2(p.y, p.x) * 180) / Math.PI;
    if (a < 0) a += 360;
    return a;
}

/** Индекс ближайшей базы карты к точке. */
export function nearestBase(p: XY): number {
    let best = 0;
    let bestD = 1e18;
    MAP.bases.forEach((b, i) => {
        const d = (b.fountain.x - p.x) ** 2 + (b.fountain.y - p.y) ** 2;
        if (d < bestD) { bestD = d; best = i; }
    });
    return best;
}
