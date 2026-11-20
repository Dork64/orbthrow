// Полоски захвата над сферами Повелителя (цвет захватчика, «СПОР», если в круге двое) и метки сундука.

let worldMarkSerial = 0;
const bossMarks = new Map<number, Panel>();

function bossRender() {
    const t = CustomNetTables.GetTableValue("orb_game", "boss") as BossNet | undefined;
    const root = $("#WorldMarks");
    const seen: number[] = [];
    if (t !== undefined && t.orbs !== undefined) {
        const scaleX = $.GetContextPanel().actualuiscale_x || 1;
        const scaleY = $.GetContextPanel().actualuiscale_y || 1;
        for (const k of Object.keys(t.orbs)) {
            const o = t.orbs[k];
            if (o.l !== 1) continue;
            seen.push(o.id);
            let mark = bossMarks.get(o.id);
            if (mark === undefined || !mark.IsValid()) {
                mark = $.CreatePanel("Panel", root, "BossOrb" + (++worldMarkSerial));
                mark.AddClass("BossMark");
                mark.hittest = false; // метка над сферой не должна перехватывать клики по земле
                mark.hittestchildren = false;
                const bar = $.CreatePanel("Panel", mark, "Bar");
                bar.AddClass("Bar");
                const fill = $.CreatePanel("Panel", bar, "Fill");
                fill.AddClass("Fill");
                const lbl = $.CreatePanel("Label", mark, "Label");
                lbl.AddClass("Label");
                bossMarks.set(o.id, mark);
            }
            mark.SetHasClass("purple", o.r === "purple");
            const sx = Game.WorldToScreenX(o.x, o.y, o.z + 220);
            const sy = Game.WorldToScreenY(o.x, o.y, o.z + 220);
            const visible = isFinite(sx) && isFinite(sy) && sx >= 0 && sy >= 0 && sx < Game.GetScreenWidth() && sy < Game.GetScreenHeight();
            mark.SetHasClass("Offscreen", !visible);
            if (visible) mark.style.position = (sx / scaleX - 50) + "px " + (sy / scaleY - 20) + "px 0px";
            const fill = mark.FindChildTraverse("Fill") as Panel;
            fill.style.width = Math.floor(Math.max(0, Math.min(1, o.p)) * 100) + "%";
            fill.style.backgroundColor = o.h >= 0 ? playerColorCss(o.h as PlayerID) : "#888888";
            const lbl = mark.FindChildTraverse("Label") as LabelPanel;
            lbl.text = o.c === 1 ? L("orb_capture_contested") : "";
        }
    }
    for (const [id, panel] of bossMarks) {
        if (seen.indexOf(id) < 0) {
            if (panel.IsValid()) panel.DeleteAsync(0);
            bossMarks.delete(id);
        }
    }
}

// ---------- Сундук курьера: метка над местом/курьером/сундуком и стрелка у края экрана ----------

const chestMarks = new Map<string, Panel>();

function chestMark(root: Panel, key: string): Panel {
    let mark = chestMarks.get(key);
    if (mark === undefined || !mark.IsValid()) {
        mark = $.CreatePanel("Panel", root, "ChestMark" + (++worldMarkSerial));
        mark.AddClass("ChestMark");
        mark.hittest = false;
        mark.hittestchildren = false;
        const lbl = $.CreatePanel("Label", mark, "Label");
        lbl.AddClass("ChestLabel");
        const bar = $.CreatePanel("Panel", mark, "Bar");
        bar.AddClass("Bar");
        const fill = $.CreatePanel("Panel", bar, "Fill");
        fill.AddClass("Fill");
        chestMarks.set(key, mark);
    }
    return mark;
}

function chestRender() {
    const t = CustomNetTables.GetTableValue("orb_game", "chest") as { list: { [i: string]: ChestNet } } | undefined;
    const root = $("#WorldMarks");
    const arrow = $("#ChestArrow");
    const scaleX = $.GetContextPanel().actualuiscale_x || 1;
    const scaleY = $.GetContextPanel().actualuiscale_y || 1;
    const w = Game.GetScreenWidth();
    const h = Game.GetScreenHeight();
    const seen: string[] = [];
    let arrowTarget: ChestNet | undefined;
    if (t !== undefined && t.list !== undefined) {
        for (const k of Object.keys(t.list)) {
            const c = t.list[k];
            const key = c.st === 3 ? "courier" : c.st === 0 ? "spot" : "chest" + k;
            seen.push(key);
            const mark = chestMark(root, key);
            const sx = Game.WorldToScreenX(c.x, c.y, c.z + (c.st === 3 ? 260 : 170));
            const sy = Game.WorldToScreenY(c.x, c.y, c.z + (c.st === 3 ? 260 : 170));
            const onScreen = isFinite(sx) && isFinite(sy) && sx >= 0 && sy >= 0 && sx < w && sy < h;
            mark.SetHasClass("Offscreen", !onScreen);
            mark.SetHasClass("Courier", c.st === 3);
            mark.SetHasClass("Spot", c.st === 0);
            if (onScreen) mark.style.position = (sx / scaleX - 60) + "px " + (sy / scaleY - 24) + "px 0px";
            const lbl = mark.FindChildTraverse("Label") as LabelPanel;
            lbl.text = c.st === 0 ? L("orb_chest_incoming", String(c.t)) : c.c === 1 ? L("orb_capture_contested") : L("orb_chest_label");
            const fill = mark.FindChildTraverse("Fill") as Panel;
            fill.style.width = Math.floor(Math.max(0, Math.min(1, c.p)) * 100) + "%";
            fill.style.backgroundColor = c.h >= 0 ? playerColorCss(c.h as PlayerID) : "#888888";
            if (!onScreen && (c.st === 0 || c.st === 2) && arrowTarget === undefined) arrowTarget = c;
        }
    }
    for (const [key, panel] of chestMarks) {
        if (seen.indexOf(key) < 0) {
            if (panel.IsValid()) panel.DeleteAsync(0);
            chestMarks.delete(key);
        }
    }
    // Стрелка у края экрана в сторону сундука (если его не видно)
    if (!arrow) return;
    arrow.SetHasClass("Hidden", arrowTarget === undefined);
    if (arrowTarget === undefined) return;
    const cam = GameUI.GetCameraLookAtPosition();
    const dx = arrowTarget.x - cam[0];
    const dy = arrowTarget.y - cam[1];
    const ang = Math.atan2(dy, dx); // мир: y вверх; экран: y вниз
    const cx = w / scaleX / 2;
    const cy = h / scaleY / 2;
    const rx = cx - 70;
    const ry = cy - 90;
    const ax = cx + Math.cos(ang) * rx;
    const ay = cy - Math.sin(ang) * ry;
    arrow.style.position = (ax - 32) + "px " + (ay - 32) + "px 0px";
    const icon = arrow.FindChildTraverse("ChestArrowIcon");
    // Острый угол значка смотрит вниз-влево (135° на экране); поворачиваем его к цели
    if (icon) icon.style.transform = "rotateZ(" + (-(ang * 180) / Math.PI - 135) + "deg)";
    const dist = Math.sqrt(dx * dx + dy * dy);
    (arrow.FindChildTraverse("ChestArrowText") as LabelPanel).text = arrowTarget.st === 0
        ? L("orb_chest_incoming", String(arrowTarget.t))
        : L("orb_chest_label") + " · " + Math.round(dist / 100) / 10 + "k";
}

(function initBoss() {
    let reported = false;
    const loop = () => {
        for (const render of [bossRender, chestRender]) {
            try { render(); }
            catch (err) {
                if (!reported) { $.Msg("ORBTHROW world marks: ", String(err)); reported = true; }
            }
        }
        $.Schedule(0.03, loop);
    };
    loop();
})();
