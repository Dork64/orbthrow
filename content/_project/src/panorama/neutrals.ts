// Нейтральные предметы: шкала жетонов под шкалами сфер и панель выбора (артефакт + улучшение).

let neutralLastKey = "";
/** Как в Доте: выбор открывается кнопкой у слотов (она светится, когда нейтралка готова). */
let neutralOpen = false;
let neutralLastSeq = -1;

function neutralData(): OrbItemsNet | undefined {
    const pid = Players.GetLocalPlayer();
    if (pid < 0) return undefined;
    return CustomNetTables.GetTableValue("orb_items", String(pid)) as OrbItemsNet | undefined;
}

function neutralEnsureBar() {
    if ($("#NeutralBar")) return;
    const row = $("#OrbBarsRow");
    const bar = $.CreatePanel("Button", row, "NeutralBar");
    bar.AddClass("OrbBar");
    bar.AddClass("neutral");
    const fill = $.CreatePanel("Panel", bar, "Fill");
    fill.AddClass("Fill");
    const gem = $.CreatePanel("Panel", bar, "Gem");
    gem.AddClass("OrbGem");
    gem.AddClass("neutral");
    gem.hittest = false;
    const lbl = $.CreatePanel("Label", bar, "Text");
    lbl.AddClass("Text");
    bar.SetPanelEvent("onactivate", () => {
        neutralOpen = !neutralOpen;
        neutralRender();
        neutralPlace();
    });
    bar.SetPanelEvent("onmouseover", () => {
        const d = neutralData();
        if (!d) return;
        const when = d.na > 0 ? L("orb_neutral_tip_wait", fmtTime(d.na)) : "";
        $.DispatchEvent("DOTAShowTextTooltip", bar, L("orb_neutral_tip", String(d.nk), String(d.nn), neutralTierName(d.nx)) + when);
    });
    bar.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", bar));
}

function neutralTierName(t: number): string {
    return t <= 0 ? L("orb_neutral_done") : L("orb_neutral_tier", String(t));
}

function neutralCard(parent: Panel, item: string, kind: "trinket" | "enh", seq: number, chosen: string, level: number) {
    const card = $.CreatePanel("Button", parent, "");
    card.AddClass("NeutralCard");
    card.SetHasClass("Chosen", chosen === item);
    card.SetHasClass("Dim", chosen !== "" && chosen !== item);
    const img = $.CreatePanel("DOTAItemImage", card, "") as ItemImage;
    img.itemname = item;
    img.AddClass("NeutralImg");
    img.hittest = false;
    if (kind === "enh" && level > 1) {
        const lvl = $.CreatePanel("Label", card, "");
        lvl.AddClass("NeutralLvl");
        lvl.text = String(level);
        lvl.hittest = false;
    }
    card.SetPanelEvent("onmouseover", () => $.DispatchEvent("DOTAShowAbilityTooltip", card, item));
    card.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideAbilityTooltip", card));
    card.SetPanelEvent("onactivate", () => {
        GameEvents.SendCustomGameEventToServer("orb_neutral_pick", { seq, kind, name: item });
        Game.EmitSound("ui.click_alt");
    });
}

function neutralRender() {
    neutralEnsureBar();
    const d = neutralData();
    const bar = $("#NeutralBar");
    const panel = $("#NeutralChoice");
    if (!d || !bar || !panel) return;
    // Шкала: жетоны к следующему созданию
    const pct = d.nn > 0 ? Math.max(0, Math.min(100, (d.nk / d.nn) * 100)) : 100;
    (bar.FindChildTraverse("Fill") as Panel).style.width = pct.toFixed(1) + "%";
    const waiting = d.na > 0;
    (bar.FindChildTraverse("Text") as LabelPanel).text = waiting
        ? neutralTierName(d.nx) + "  " + fmtTime(d.na)
        : neutralTierName(d.nx) + "  " + d.nk + " / " + d.nn;
    bar.SetHasClass("Waiting", waiting);
    bar.SetHasClass("Ready", d.no !== undefined);

    const o = d.no;
    if (o !== undefined && o.seq !== neutralLastSeq) {
        neutralLastSeq = o.seq;
        Game.EmitSound("Item.PickUpRingShop");
    }
    neutralEnsureButton();
    const btn = $("#SlotNeutral");
    if (btn) btn.SetHasClass("Hidden", o === undefined);
    const show = o !== undefined && neutralOpen;
    if (o === undefined) neutralOpen = false;
    panel.SetHasClass("Hidden", !show);
    if (!show || o === undefined) return;
    ($("#NeutralTitle") as LabelPanel).text = L("orb_neutral_title", String(o.tier));
    ($("#NeutralAuto") as LabelPanel).text = L("orb_auto", String(o.t));
    const tr = Object.keys(o.tr).sort().map(k => o.tr[k]);
    const en = Object.keys(o.en).sort().map(k => o.en[k]);
    const key = o.seq + ":" + o.pt + ":" + o.pe + ":" + tr.join(",") + en.join(",");
    if (key === neutralLastKey) return;
    neutralLastKey = key;
    const rowT = $("#NeutralTrinkets");
    const rowE = $("#NeutralEnh");
    rowT.RemoveAndDeleteChildren();
    rowE.RemoveAndDeleteChildren();
    for (const it of tr) neutralCard(rowT, it, "trinket", o.seq, o.pt, 1);
    for (const it of en) neutralCard(rowE, it, "enh", o.seq, o.pe, o.levels[it] ?? 1);
}

/** Светящаяся кнопка у слотов: нейтралка готова — нажми, чтобы выбрать. */
function neutralEnsureButton() {
    if ($("#SlotNeutral")) return;
    const right = $("#SlotsRight");
    if (!right) return;
    const btn = $.CreatePanel("Button", right, "SlotNeutral");
    btn.AddClass("Slot");
    btn.AddClass("Neutral");
    btn.AddClass("Hidden");
    const mark = $.CreatePanel("Label", btn, "");
    mark.AddClass("SlotNeutralMark");
    mark.text = "N";
    mark.hittest = false;
    right.MoveChildBefore(btn, right.GetChild(0)!);
    btn.SetPanelEvent("onactivate", () => {
        neutralOpen = !neutralOpen;
        Game.EmitSound("ui.click_alt");
        neutralRender();
        neutralPlace();
    });
    btn.SetPanelEvent("onmouseover", () => $.DispatchEvent("DOTAShowTextTooltip", btn, L("orb_neutral_ready")));
    btn.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", btn));
}

/** Окно выбора — над слотами у инвентаря (как выбор нейтралки в Доте), не по центру экрана. */
function neutralPlace() {
    const panel = $("#NeutralChoice");
    const top = $("#SlotsTop");
    const right = $("#SlotsRight");
    const root = $.GetContextPanel();
    if (panel && top && right && top.actuallayoutwidth > 0) {
        const sx = root.actualuiscale_x || 1;
        const sy = root.actualuiscale_y || 1;
        const t = top.GetPositionWithinWindow();
        const r = right.GetPositionWithinWindow();
        const w = panel.actuallayoutwidth / sx;
        const h = panel.actuallayoutheight / sy;
        const xRight = (r.x + right.actuallayoutwidth) / sx;
        const x = Math.max(4, xRight - w);
        const y = Math.max(60, t.y / sy - h - 6);
        panel.style.position = Math.floor(x) + "px " + Math.floor(y) + "px 0px";
    }
}

function NeutralCollapse() {
    neutralOpen = false;
    neutralRender();
}

(function initNeutrals() {
    CustomNetTables.SubscribeNetTableListener("orb_items", (_t, key) => {
        if (key === String(Players.GetLocalPlayer())) neutralRender();
    });
    const loop = () => {
        neutralRender();
        neutralPlace();
        $.Schedule(0.5, loop);
    };
    loop();
})();
