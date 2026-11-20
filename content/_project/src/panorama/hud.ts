// Верхняя панель (цель, таймер, игроки по убийствам), лента событий, ошибки.

const cards = new Map<number, Panel>();
const toasts: Panel[] = [];
const errors: Panel[] = [];

function getState(): OrbGameState | undefined {
    return CustomNetTables.GetTableValue("orb_game", "state") as OrbGameState | undefined;
}

function getScores(): OrbScoreRow[] {
    const t = CustomNetTables.GetTableValue("orb_game", "scores") as { [k: string]: OrbScoreRow } | undefined;
    if (!t) return [];
    return Object.keys(t).map(k => t[k]);
}

function renderTop() {
    const st = getState();
    const goalLabel = $("#GoalLabel") as LabelPanel;
    const timer = $("#TimerLabel") as LabelPanel;
    if (st) {
        goalLabel.text = String(st.goal);
        const overtime = st.phase === "overtime";
        timer.SetHasClass("Overtime", overtime);
        timer.text = overtime ? L("orb_overtime") : fmtTime(st.limit - Math.max(0, st.now));
    }
    const rows = getScores().sort((a, b) => (b.k - a.k) || (a.d - b.d) || (a.id - b.id));
    // Полоса цели: сколько убийств у лидера из нужных
    if (st && st.goal > 0) {
        const best = rows.length > 0 ? rows[0].k : 0;
        $("#GoalProgressFill").style.width = Math.min(100, (best / st.goal) * 100).toFixed(1) + "%";
    }
    const parent = $("#PlayersRow");
    const local = Players.GetLocalPlayer();
    rows.forEach((r, i) => {
        let card = cards.get(r.id);
        if (!card) {
            card = $.CreatePanel("Panel", parent, "Player" + r.id);
            card.AddClass("PlayerCard");
            const img = $.CreatePanel("DOTAHeroImage", card, "Hero");
            img.hittest = false;
            // Корона — в одном ряду с числом убийств (раньше она занимала свою строку и сдвигала карточку)
            const row = $.CreatePanel("Panel", card, "KillsRow");
            row.AddClass("KillsRow");
            row.hittest = false;
            const crown = $.CreatePanel("Panel", row, "Crown");
            crown.AddClass("Crown");
            crown.hittest = false;
            const kills = $.CreatePanel("Label", row, "Kills");
            kills.AddClass("Kills");
            kills.hittest = false;
            const hunt = $.CreatePanel("Label", card, "Hunt");
            hunt.AddClass("HuntLabel");
            hunt.text = L("orb_hunt_label");
            const rev = $.CreatePanel("Label", card, "Revenge");
            rev.AddClass("Revenge");
            const dots = $.CreatePanel("Panel", card, "Dots");
            dots.AddClass("QueueDots");
            const id = r.id;
            card.SetPanelEvent("onmouseover", () => {
                const tip = cardTip(id);
                if (tip !== "") $.DispatchEvent("DOTAShowTextTooltip", card!, tip);
            });
            card.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", card!));
            cards.set(r.id, card);
        }
        const img = card.FindChildTraverse("Hero") as HeroImage;
        if (img && img.heroname !== r.hero) img.heroname = r.hero;
        (card.FindChildTraverse("Kills") as LabelPanel).text = String(r.k);
        card.style.borderBottom = "3px solid " + playerColorCss(r.id as PlayerID);
        card.SetHasClass("Leader", st !== undefined && st.leader === r.id);
        card.SetHasClass("Left", r.left === 1);
        card.SetHasClass("Local", r.id === local);
        card.SetHasClass("Hunted", st !== undefined && st.hunted === r.id);
        const mine = revengeOf(local, r.id);
        const theirs = revengeOf(r.id, local);
        const revLabel = card.FindChildTraverse("Revenge") as LabelPanel;
        revLabel.text = mine > 0 ? "+" + mine * 10 + "%" : theirs > 0 ? "−" + theirs * 10 + "%" : "";
        revLabel.SetHasClass("Mine", mine > 0);
        revLabel.SetHasClass("Theirs", mine === 0 && theirs > 0);
        renderQueueDots(card.FindChildTraverse("Dots") as Panel, r.id);
        // порядок: переставляем карточку на нужное место
        const before = i === 0 ? undefined : cards.get(rows[i - 1].id);
        if (before) parent.MoveChildAfter(card, before);
        else if (parent.GetChild(0) !== card) parent.MoveChildBefore(card, parent.GetChild(0)!);
    });
}

function revengeOf(a: number, b: number): number {
    const t = CustomNetTables.GetTableValue("orb_game", "revenge") as { [k: string]: { [k: string]: number } } | undefined;
    if (!t || !t[String(a)]) return 0;
    return t[String(a)][String(b)] || 0;
}

function renderQueueDots(panel: Panel, pid: number) {
    const d = CustomNetTables.GetTableValue("orb_spheres", String(pid)) as OrbSphereNet | undefined;
    const counts = d ? d.q : undefined;
    const key = counts ? ["legend", "purple", "blue", "grey"].map(r => counts[r] || 0).join(",") : "";
    if ((panel as any).__key === key) return;
    (panel as any).__key = key;
    panel.RemoveAndDeleteChildren();
    if (!counts) return;
    for (const r of ["legend", "purple", "blue", "grey"]) {
        for (let i = 0; i < Math.min(3, counts[r] || 0); i++) {
            const dot = $.CreatePanel("Panel", panel, "");
            dot.AddClass("QDot");
            dot.AddClass(r);
        }
    }
}

function cardTip(pid: number): string {
    const local = Players.GetLocalPlayer();
    const st = getState();
    const parts: string[] = [];
    const row = getScores().filter(r => r.id === pid)[0];
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (row) parts.push("<b>" + esc(Players.GetPlayerName(pid as PlayerID)) + "</b> — " + heroLabel(row.hero) + "<br>" + L("orb_card_kda", String(row.k), String(row.d), String(row.a)));
    const mine = revengeOf(local, pid);
    const theirs = revengeOf(pid, local);
    if (mine > 0) parts.push(L("orb_revenge_tip", String(mine * 10)));
    if (theirs > 0) parts.push(L("orb_revenge_them_tip", String(theirs * 10)));
    if (st && st.hunted === pid) parts.push(L("orb_hunt_tip"));
    return parts.join("<br><br>");
}

function addToast(e: OrbToastEvent) {
    const parent = $("#Toasts");
    const lbl = $.CreatePanel("Label", parent, "");
    lbl.AddClass("Toast");
    lbl.AddClass(e.kind);
    lbl.hittest = false;
    lbl.html = true;
    // Имена игроков могут содержать < и &: экранируем, иначе ломается разметка
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const name = (s: string | undefined) => {
        if (s === undefined) return s;
        if (s.indexOf("npc_dota_hero_") === 0) return heroLabel(s);
        if (s.indexOf("item_") === 0) return $.Localize("#DOTA_Tooltip_ability_" + s);
        return esc(s);
    };
    lbl.text = L(e.text, name(e.p1), name(e.p2), name(e.p3));
    toasts.push(lbl);
    while (toasts.length > 6) {
        const old = toasts.shift()!;
        old.DeleteAsync(0);
    }
    $.Schedule(7, () => {
        if (lbl.IsValid()) lbl.AddClass("Fade");
    });
    $.Schedule(7.7, () => {
        const i = toasts.indexOf(lbl);
        if (i >= 0) {
            toasts.splice(i, 1);
            lbl.DeleteAsync(0);
        }
    });
}

function addError(e: OrbErrorEvent) {
    const parent = $("#Errors");
    const lbl = $.CreatePanel("Label", parent, "");
    lbl.AddClass("ErrorLine");
    lbl.hittest = false;
    lbl.text = e.text.startsWith("#") ? L(e.text) : e.text;
    errors.push(lbl);
    while (errors.length > 5) errors.shift()!.DeleteAsync(0);
}

/** Плашка события арены: «через N с» или «идет, осталось N с» и что делает. */
function renderEvent() {
    const ev = CustomNetTables.GetTableValue("orb_game", "event") as ArenaEventNet | undefined;
    const banner = $("#EventBanner");
    const show = ev !== undefined && ev.id !== "";
    banner.SetHasClass("Hidden", !show);
    if (!show || !ev) return;
    for (const id of ["bloodmoon", "goldrain", "storm", "haste"]) banner.SetHasClass(id, ev.id === id);
    banner.SetHasClass("Soon", ev.on !== 1);
    const name = L("orb_event_" + ev.id);
    ($("#EventTitle") as LabelPanel).text = ev.on === 1
        ? L("orb_event_running", name, String(ev.left))
        : L("orb_event_in", name, String(ev.left));
    ($("#EventDesc") as LabelPanel).text = L("orb_event_desc_" + ev.id);
}

/** Стандартная лента убийств Доты скрыта: наши уведомления показываются на ее месте. */
function hideDotaCombatEvents() {
    const ce = dotaHudElement("combat_events");
    if (ce) ce.style.visibility = "collapse";
    $("#Toasts").SetHasClass("Flipped", Game.IsHUDFlipped());
    $.Schedule(2, hideDotaCombatEvents);
}

(function init() {
    ($("#VersionLabel") as LabelPanel).text = "ORBTHROW " + BUILD_VERSION;
    hideDotaCombatEvents();
    // Сферы Повелителя (boss) рисует boss.ts; верхней панели нужны только счет и состояние
    CustomNetTables.SubscribeNetTableListener("orb_game", (_t, key) => {
        if (key === "state" || key === "scores" || key === "revenge" || key === "help") renderTop();
        if (key === "event") renderEvent();
    });
    GameEvents.Subscribe("orb_toast", e => addToast(e as unknown as OrbToastEvent));
    GameEvents.Subscribe("orb_error", e => addError(e as unknown as OrbErrorEvent));
    renderTop();
    renderEvent();
})();
