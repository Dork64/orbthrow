"use strict";
let orbCatalogOpen = false;
let orbCatalogTab = "Hero";
let orbCatalogRenderKey = "";
function OrbToggleCatalog() {
    orbCatalogOpen = !orbCatalogOpen;
    orbRenderCatalog(orbData());
}
function OrbSetCatalogTab(tab) {
    orbCatalogTab = tab;
    orbRenderCatalog(orbData());
}
function orbRenderCatalog(spheres) {
    const pid = Players.GetLocalPlayer();
    const catalog = pid >= 0 ? CustomNetTables.GetTableValue("orb_catalog", String(pid)) : undefined;
    const ready = !!(catalog === null || catalog === void 0 ? void 0 : catalog.hero) && !!catalog.cards && !!spheres;
    const toggle = $("#OrbCatalogToggle");
    toggle.SetHasClass("Hidden", !ready);
    toggle.SetHasClass("Selected", orbCatalogOpen);
    $("#OrbCatalog").SetHasClass("Hidden", !ready || !orbCatalogOpen);
    if (!ready || !orbCatalogOpen)
        return;
    const key = [pid, catalog.hero, spheres.v, orbCatalogTab].join(":");
    if (key === orbCatalogRenderKey)
        return;
    orbCatalogRenderKey = key;
    const cards = Object.keys(catalog.cards).map(i => catalog.cards[i]);
    const stacks = spheres.st || {};
    const total = cards.reduce((sum, card) => sum + (stacks[card.id] || 0), 0);
    $("#OrbCatalogHero").heroname = catalog.hero;
    $("#OrbCatalogHeroName").text = heroLabel(catalog.hero);
    $("#OrbCatalogTakenText").text = L("orb_catalog_taken_tab", String(total));
    for (const tab of ["Hero", "Common", "Taken"]) {
        $("#OrbCatalog" + tab + "Tab").SetHasClass("Selected", tab === orbCatalogTab);
    }
    const rows = $("#OrbCatalogRows");
    rows.RemoveAndDeleteChildren();
    const taken = cards.filter(card => (stacks[card.id] || 0) > 0);
    if (orbCatalogTab === "Hero") {
        for (const branch of ["Q", "W", "E", "R", "H"]) {
            orbCatalogRow(rows, branch === "H" ? L("orb_branch_H") : branch, cards.filter(card => card.br === branch), stacks);
        }
    }
    else {
        const pool = orbCatalogTab === "Common" ? cards.filter(card => card.br === "G") : taken;
        for (const rarity of ["legend", "purple", "blue", "grey"]) {
            orbCatalogRow(rows, L(rarity === "legend" ? "orb_catalog_legend" : "orb_bar_" + rarity), pool.filter(card => card.rr === rarity), stacks);
        }
        if (orbCatalogTab === "Taken" && total === 0) {
            const empty = $.CreatePanel("Label", rows, "", { class: "OrbCatalogEmpty", hittest: "false" });
            empty.text = L("orb_catalog_empty");
        }
    }
}
function orbCatalogRow(parent, title, cards, stacks) {
    if (cards.length === 0)
        return;
    const row = $.CreatePanel("Panel", parent, "", { class: "OrbCatalogRow", hittest: "false" });
    const label = $.CreatePanel("Label", row, "", { class: "OrbCatalogRowTitle", hittest: "false" });
    label.text = title;
    const tiles = $.CreatePanel("Panel", row, "", { class: "OrbCatalogTiles", hittest: "false" });
    for (const card of cards) {
        const count = stacks[card.id] || 0;
        const tile = $.CreatePanel("Panel", tiles, "", { class: "OrbCatalogTile " + card.rr });
        tile.SetHasClass("Taken", count > 0);
        const awakened = card.rr === "legend" && count > 0 && (stacks.awake || 0) > 0;
        tile.SetHasClass("Awakened", awakened);
        orbIconPanel(tile, card.ic);
        if (count > 0) {
            const badge = $.CreatePanel("Label", tile, "", { class: "OrbCatalogCount", hittest: "false" });
            badge.text = "×" + count;
        }
        orbTooltip(tile, () => {
            const status = count > 0 ? L("orb_catalog_taken_tab", String(count)) : L("orb_catalog_unowned");
            const name = L("orb_up_" + card.id);
            const mechanic = card.m === 1 ? " · " + L("orb_mech_tag") : "";
            const description = L("orb_up_" + card.id + "_d");
            const awakening = card.rr === "legend" ? "\n" + L("orb_up_" + card.id + "_aw") : "";
            return name + " · " + status + mechanic + "\n" + description + awakening;
        });
    }
}
