function OrbToggleTestPanel() {
    const panel = $("#OrbTestPanel");
    const open = panel.BHasClass("Hidden");
    panel.SetHasClass("Hidden", !open);
    $("#OrbTestToggle").SetHasClass("Open", open);
}

function OrbTestAction(action: string) {
    GameEvents.SendCustomGameEventToServer("orb_test_action", { action });
}

let testHeroSelection = "";
let testHeroPending = false;
const testHeroCards = new Map<string, Panel>();

function testHeroStatus(token: string) {
    ($("#OrbTestHeroStatus") as LabelPanel).text = L(token);
    $("#OrbTestHeroClose").enabled = !testHeroPending;
    $("#OrbTestHeroConfirm").enabled = testHeroSelection !== "" && !testHeroPending;
    $("#OrbTestHeroSearch").enabled = !testHeroPending;
}

function OrbFilterTestHeroes() {
    const query = ($("#OrbTestHeroSearch") as TextEntry).text.toLowerCase().trim();
    let shown = 0;
    for (const [name, card] of testHeroCards) {
        const fallback = name.replace(/^npc_dota_hero_/, "").replace(/_/g, " ");
        const show = heroLabel(name).toLowerCase().includes(query) || fallback.includes(query);
        card.SetHasClass("Hidden", !show);
        if (show) shown++;
        else if (name === testHeroSelection) {
            testHeroSelection = "";
            card.SetHasClass("Selected", false);
        }
    }
    $("#OrbTestHeroEmpty").SetHasClass("Hidden", shown > 0);
    $("#OrbTestHeroConfirm").enabled = testHeroSelection !== "" && !testHeroPending;
}

function OrbShowTestHeroPicker() {
    if (testHeroPending) return;
    testHeroSelection = "";
    testHeroCards.clear();
    const grid = $("#OrbTestHeroGrid");
    grid.RemoveAndDeleteChildren();
    const heroes = CustomNetTables.GetTableValue("orb_game", "test_heroes") ?? {};
    const choices = Object.keys(heroes).map(key => ({ name: heroes[key], label: heroLabel(heroes[key]) }));
    choices.sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    for (const { name, label: title } of choices) {
        const button = $.CreatePanel("Button", grid, "");
        button.AddClass("OrbTestHeroCard");
        const image = $.CreatePanel("DOTAHeroImage", button, "");
        image.hittest = false;
        image.heroname = name;
        image.heroimagestyle = "landscape";
        const label = $.CreatePanel("Label", button, "");
        label.hittest = false;
        label.text = title;
        button.SetPanelEvent("onactivate", () => {
            if (testHeroPending) return;
            testHeroCards.get(testHeroSelection)?.SetHasClass("Selected", false);
            testHeroSelection = name;
            button.SetHasClass("Selected", true);
            testHeroStatus("orb_test_hero_reset");
        });
        testHeroCards.set(name, button);
    }
    const search = $("#OrbTestHeroSearch") as TextEntry;
    search.text = "";
    OrbFilterTestHeroes();
    testHeroStatus("orb_test_hero_reset");
    $("#OrbTestHeroOverlay").SetHasClass("Hidden", false);
    search.SetFocus();
}

function OrbCloseTestHeroPicker() {
    if (!testHeroPending) $("#OrbTestHeroOverlay").SetHasClass("Hidden", true);
}

function OrbConfirmTestHero() {
    if (testHeroPending || testHeroSelection === "") return;
    testHeroPending = true;
    testHeroStatus("orb_test_hero_loading");
    GameEvents.SendCustomGameEventToServer("orb_test_pick_hero", { hero: testHeroSelection });
}

(function initOrbTestPanel() {
    if (!Game.IsInToolsMode()) return;

    const dock = $("#OrbTestDock");
    $("#OrbTestHeroSearch").SetPanelEvent("ontextentrychange", OrbFilterTestHeroes);
    const update = () => {
        const phase = CustomNetTables.GetTableValue("orb_game", "state")?.phase;
        const visible = phase === "game" || phase === "overtime";
        dock.SetHasClass("Hidden", !visible);
        if (!visible) $("#OrbTestHeroOverlay").SetHasClass("Hidden", true);
    };
    CustomNetTables.SubscribeNetTableListener("orb_game", (_table, key) => {
        if (key === "state") update();
    });
    GameEvents.Subscribe("orb_test_hero_result", e => {
        testHeroPending = false;
        if (e.error) {
            testHeroStatus(e.error);
            return;
        }
        OrbCloseTestHeroPicker();
        $("#OrbTestPanel").SetHasClass("Hidden", true);
        $("#OrbTestToggle").SetHasClass("Open", false);
    });
    update();
})();
