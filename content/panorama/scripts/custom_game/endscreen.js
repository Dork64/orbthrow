"use strict";
// Итоговый экран: места, У/С/П, нетворс, звания, билд сфер с иконками (DESIGN 11.9).
/** Иконка сферы (как на карточках выбора). */
function endIcon(parent, ic) {
    const v = ic !== undefined ? ic : "";
    if (v.indexOf("a:") === 0) {
        const img = $.CreatePanel("DOTAAbilityImage", parent, "");
        img.abilityname = v.substring(2);
        return img;
    }
    const img = $.CreatePanel("DOTAItemImage", parent, "");
    img.itemname = v.indexOf("i:") === 0 ? v.substring(2) : "item_ultimate_orb";
    return img;
}
function endTip(p, text) {
    p.SetPanelEvent("onmouseover", () => $.DispatchEvent("DOTAShowTextTooltip", p, text));
    p.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", p));
}
function endRender() {
    const t = CustomNetTables.GetTableValue("orb_game", "final");
    if (!t) {
        $.Schedule(0.5, endRender);
        return;
    }
    const winnerHero = Players.GetPlayerSelectedHero(t.winner);
    $("#EndTitle").text = L("orb_end_winner", heroLabel(winnerHero), Players.GetPlayerName(t.winner));
    $("#EndReason").text = L("orb_victory_" + t.reason);
    const parent = $("#EndRows");
    parent.RemoveAndDeleteChildren();
    const rows = Object.keys(t.rows).map(k => t.rows[k]).sort((a, b) => a.place - b.place);
    for (const r of rows) {
        const row = $.CreatePanel("Panel", parent, "");
        row.AddClass("EndRow");
        if (r.id === Players.GetLocalPlayer())
            row.AddClass("Local");
        if (r.left === 1)
            row.AddClass("Left");
        const place = $.CreatePanel("Panel", row, "");
        place.AddClass("Place");
        const badge = $.CreatePanel("Panel", place, "");
        badge.AddClass("PlaceBadge");
        badge.SetHasClass("First", r.place === 1);
        badge.SetHasClass("Second", r.place === 2);
        badge.SetHasClass("Third", r.place === 3);
        const placeLbl = $.CreatePanel("Label", badge, "");
        placeLbl.text = String(r.place);
        const heroBox = $.CreatePanel("Panel", row, "");
        heroBox.AddClass("Hero");
        const img = $.CreatePanel("DOTAHeroImage", heroBox, "");
        img.heroname = r.hero;
        img.AddClass("HeroImg");
        const name = $.CreatePanel("Label", heroBox, "");
        name.AddClass("Name");
        name.text = Players.GetPlayerName(r.id) || heroLabel(r.hero);
        const score = $.CreatePanel("Label", row, "");
        score.AddClass("Score");
        score.text = r.k + " / " + r.d + " / " + r.a;
        const nw = $.CreatePanel("Label", row, "");
        nw.AddClass("Nw");
        nw.text = String(r.nw);
        const titles = $.CreatePanel("Panel", row, "");
        titles.AddClass("Titles");
        for (const k of Object.keys(r.titles || {})) {
            const b = $.CreatePanel("Label", titles, "");
            b.AddClass("TitleBadge");
            b.text = L("orb_title_" + r.titles[k]);
            const tip = L("orb_title_" + r.titles[k] + "_d");
            b.SetPanelEvent("onmouseover", () => $.DispatchEvent("DOTAShowTextTooltip", b, tip));
            b.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", b));
        }
        const build = $.CreatePanel("Panel", row, "");
        build.AddClass("Build");
        const icons = r.ic || {};
        const rarities = r.rr || {};
        if (r.legend) {
            const leg = $.CreatePanel("Panel", build, "");
            leg.AddClass("LegendChip");
            const li = endIcon(leg, icons[r.legend]);
            li.AddClass("BuildIcon");
            li.AddClass("legend");
            const ll = $.CreatePanel("Label", leg, "");
            ll.text = L("orb_up_" + r.legend);
            endTip(leg, L("orb_up_" + r.legend + "_d"));
        }
        const counts = {};
        const order = [];
        for (const k of Object.keys(r.build || {}).sort((a, b) => Number(a) - Number(b))) {
            const id = r.build[k];
            if (id === r.legend || id === "awake")
                continue;
            if (!counts[id])
                order.push(id);
            counts[id] = (counts[id] || 0) + 1;
        }
        // Сначала фиолетовые, потом синие и серые
        const rank = { purple: 0, blue: 1, grey: 2 };
        order.sort((a, b) => { var _a, _b; return ((_a = rank[rarities[a] || "blue"]) !== null && _a !== void 0 ? _a : 1) - ((_b = rank[rarities[b] || "blue"]) !== null && _b !== void 0 ? _b : 1); });
        for (const id of order) {
            const icon = endIcon(build, icons[id]);
            icon.AddClass("BuildIcon");
            icon.AddClass(rarities[id] || "blue");
            endTip(icon, L("orb_up_" + id) + (counts[id] > 1 ? " ×" + counts[id] : "") + "<br>" + L("orb_up_" + id + "_d"));
            if (counts[id] > 1) {
                const cnt = $.CreatePanel("Panel", build, "");
                cnt.AddClass("BuildCount");
                cnt.hittest = false;
                const cl = $.CreatePanel("Label", cnt, "");
                cl.text = "×" + counts[id];
            }
        }
    }
}
(function initEnd() {
    endRender();
})();
