// Экран лобби: голосование за лимит убийств и время партии (все игроки), боты и старт (хост).

function setupIsHost(): boolean {
    const info = Game.GetLocalPlayerInfo();
    return info !== undefined && info !== null && info.player_has_host_privileges === true;
}

function setupValues(t: { [i: string]: number } | undefined): number[] {
    if (!t) return [];
    return Object.keys(t).sort((a, b) => Number(a) - Number(b)).map(k => t[k]);
}

/** Ряд кнопок голосования: число, подпись и точки голосов. */
function setupVoteRow(parent: Panel, kind: "kills" | "minutes", options: number[], counts: { [o: string]: number }, mine: number, winner: number) {
    const key = kind + options.join(",");
    if ((parent as any).__key !== key) {
        (parent as any).__key = key;
        parent.RemoveAndDeleteChildren();
        for (const o of options) {
            const btn = $.CreatePanel("Button", parent, kind + o);
            btn.AddClass("SetupChoice");
            btn.AddClass("Vote");
            const num = $.CreatePanel("Label", btn, "Num");
            num.AddClass("VoteNum");
            num.text = String(o);
            const unit = $.CreatePanel("Label", btn, "Unit");
            unit.AddClass("VoteUnit");
            unit.text = L(kind === "kills" ? "orb_setup_vote_kills_unit" : "orb_setup_vote_minutes_unit");
            const dots = $.CreatePanel("Label", btn, "Dots");
            dots.AddClass("VoteDots");
            btn.SetPanelEvent("onactivate", () => {
                GameEvents.SendCustomGameEventToServer("orb_vote", kind === "kills" ? { kills: o } : { minutes: o });
                Game.EmitSound("ui.click_alt");
            });
        }
    }
    for (const o of options) {
        const btn = parent.FindChildTraverse(kind + o);
        if (!btn) continue;
        const n = counts[String(o)] || 0;
        btn.SetHasClass("Selected", mine === o);
        btn.SetHasClass("Winning", winner === o && n > 0);
        let dots = "";
        for (let i = 0; i < n; i++) dots += "●";
        (btn.FindChildTraverse("Dots") as LabelPanel).text = n > 0 ? dots : " ";
    }
}

function setupRender() {
    const t = CustomNetTables.GetTableValue("orb_game", "settings") as SettingsNet | undefined;
    const host = setupIsHost();
    $.GetContextPanel().SetHasClass("ReadOnly", !host);
    $("#SetupStart").SetHasClass("NotHost", !host);
    const players = $("#SetupPlayers");
    players.RemoveAndDeleteChildren();
    const my = t && t.my ? t.my : {};
    for (const pid of Game.GetAllPlayerIDs()) {
        const info = Game.GetPlayerInfo(pid);
        const lbl = $.CreatePanel("Label", players, "");
        lbl.AddClass("SetupPlayer");
        if (info && info.player_has_host_privileges) lbl.AddClass("Host");
        const v = my[String(pid)];
        if (v && v.k > 0 && v.m > 0) lbl.AddClass("Voted");
        lbl.text = Players.GetPlayerName(pid);
    }
    if (!t) return;
    const mine = my[String(Players.GetLocalPlayer())];
    setupVoteRow($("#VoteKills"), "kills", setupValues(t.ko), t.kv || {}, mine ? mine.k : 0, t.goal);
    setupVoteRow($("#VoteMinutes"), "minutes", setupValues(t.mo), t.mv || {}, mine ? mine.m : 0, t.minutes);
    ($("#SetupBotsLabel") as LabelPanel).text = String(t.bots);
    ($("#SetupSummary") as LabelPanel).text = L("orb_setup_summary", String(t.humans + t.bots), String(t.goal), String(t.minutes));
    ($("#SetupWait") as LabelPanel).text = t.left >= 0 ? L(host ? "orb_setup_auto" : "orb_setup_wait", String(t.left)) : "";
}

function SetupBots(delta: number) {
    if (!setupIsHost()) return;
    const t = CustomNetTables.GetTableValue("orb_game", "settings") as SettingsNet | undefined;
    const cur = t ? t.bots : 0;
    GameEvents.SendCustomGameEventToServer("orb_settings", { bots: Math.max(0, cur + delta) });
}

function SetupStart() {
    if (!setupIsHost()) return;
    GameEvents.SendCustomGameEventToServer("orb_start", {});
}

(function initSetup() {
    CustomNetTables.SubscribeNetTableListener("orb_game", (_t, key) => {
        if (key === "settings") setupRender();
    });
    const loop = () => {
        setupRender();
        const t = CustomNetTables.GetTableValue("orb_game", "settings") as SettingsNet | undefined;
        if (t && t.done === 1) return; // настройка завершена — экран больше не нужен
        $.Schedule(1, loop);
    };
    loop();
})();
