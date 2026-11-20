// Подмога отстающим (DESIGN 9.3): золото, синяя сфера или «Ярость». Через 30 с — золото.

function helpRender() {
    const t = CustomNetTables.GetTableValue("orb_game", "help") as { [k: string]: { d: number; g: number } } | undefined;
    const mine = t ? t[String(Players.GetLocalPlayer())] : undefined;
    const panel = $("#HelpPanel");
    panel.SetHasClass("Hidden", mine === undefined);
    if (mine === undefined) return;
    ($("#HelpGoldLabel") as LabelPanel).text = L("orb_help_gold", String(mine.g));
    const st = CustomNetTables.GetTableValue("orb_game", "state") as OrbGameState | undefined;
    const left = st ? Math.max(0, mine.d - st.now) : 0;
    ($("#HelpAuto") as LabelPanel).text = L("orb_help_auto", String(Math.ceil(left)));
}

function HelpPick(choice: string) {
    GameEvents.SendCustomGameEventToServer("orb_help", { choice });
    $("#HelpPanel").SetHasClass("Hidden", true);
}

(function initHelp() {
    const loop = () => {
        helpRender();
        $.Schedule(0.5, loop);
    };
    loop();
})();
