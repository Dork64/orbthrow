// Слоты расходников (просьба автора 31.10, раскладка и клавиши как в 1x6):
// над инвентарем — дым и пыль (и кнопка «съесть Boots of Travel», когда они есть),
// справа от инвентаря — обсерверы и сентри. По умолчанию 5 — обсервер, 6 — сентри, 7 — дым, 8 — пыль; ПКМ меняет раскладку.
// Место считаем по инвентарю Доты (его id из стилей Доты), при неудаче — запасное место.

interface SlotDef { kind: "ob" | "se" | "sm" | "du"; ability: string; item: string; key: string; command: string }

const SLOT_DEFS: SlotDef[] = [
    { kind: "sm", ability: "orb_slot_smoke", item: "item_smoke_of_deceit", key: "7", command: "OrbSlotSmoke" },
    { kind: "du", ability: "orb_slot_dust", item: "item_dust", key: "8", command: "OrbSlotDust" },
    { kind: "ob", ability: "orb_slot_observer", item: "item_ward_observer", key: "5", command: "OrbSlotObserver" },
    { kind: "se", ability: "orb_slot_sentry", item: "item_ward_sentry", key: "6", command: "OrbSlotSentry" },
];

// Раскладки клавиш (обсервер, сентри, дым, пыль). У многих игроков 5 и 6 заняты предметами,
// тогда клавиша ставит предмет, а не вард. ПКМ по любому слоту — следующая раскладка.
const SLOT_LAYOUTS: string[][] = [["5", "6", "7", "8"], ["7", "8", "9", "0"], ["F5", "F6", "F7", "F8"], []];
const SLOT_ORDER: SlotDef["kind"][] = ["ob", "se", "sm", "du"];
const slotConfig = GameUI.CustomUIConfig() as { orbSlotLayout?: number; orbSlotDispatch?: (key: string) => void };
let slotLayout = slotConfig.orbSlotLayout ?? 0; // По умолчанию цифры 5–8

function slotKey(def: SlotDef): string {
    const keys = SLOT_LAYOUTS[slotLayout];
    const i = SLOT_ORDER.indexOf(def.kind);
    return keys.length > i && i >= 0 ? keys[i] : "";
}

/** Команды зарегистрированы заранее; привязаны только клавиши выбранной раскладки. */
function slotKeyPressed(key: string) {
    const i = SLOT_LAYOUTS[slotLayout].indexOf(key);
    if (i < 0) return;
    const def = SLOT_DEFS.find(d => d.kind === SLOT_ORDER[i]);
    if (def) slotUse(def);
}

function slotNextLayout() {
    cancelWardTarget();
    for (const key of SLOT_LAYOUTS[slotLayout]) Game.CreateCustomKeyBind(key, "");
    slotLayout = (slotLayout + 1) % SLOT_LAYOUTS.length;
    slotConfig.orbSlotLayout = slotLayout;
    slotBindLayout();
    const keys = SLOT_LAYOUTS[slotLayout];
    for (const def of SLOT_DEFS) {
        const btn = $("#Slot_" + def.kind);
        if (btn) (btn.FindChildTraverse("Key") as LabelPanel).text = slotKey(def);
    }
    Game.EmitSound("ui.click_alt");
    const msg = keys.length > 0 ? L("orb_slot_layout", keys.join(" ")) : L("orb_slot_layout_off");
    GameEvents.SendEventClientSide("dota_hud_error_message", { splitscreenplayer: 0, reason: 80, message: msg } as never);
}

function slotsData(): OrbItemsNet | undefined {
    const pid = Players.GetLocalPlayer();
    if (pid < 0) return undefined;
    return CustomNetTables.GetTableValue("orb_items", String(pid)) as OrbItemsNet | undefined;
}

function slotsHero(): EntityIndex {
    return Players.GetPlayerHeroEntityIndex(Players.GetLocalPlayer());
}

let wardTarget: "ob" | "se" | undefined;
let wardHero = -1;

function cancelWardTarget() {
    wardTarget = undefined;
    wardHero = -1;
    $("#OrbWardTarget").SetHasClass("Hidden", true);
}

function slotUse(def: SlotDef) {
    const hero = slotsHero();
    if (hero === -1) return;
    if (def.kind === "ob" || def.kind === "se") {
        if (wardTarget === def.kind && wardHero === hero) { cancelWardTarget(); return; }
        wardTarget = def.kind;
        wardHero = hero;
        $("#OrbWardTarget").SetHasClass("Hidden", false);
        return;
    }
    cancelWardTarget();
    GameEvents.SendCustomGameEventToServer("orb_slot_use", { kind: def.kind });
}

function slotMouse(event: string, button: number): boolean {
    if (wardTarget === undefined) return false;
    if (wardHero !== slotsHero() || !Entities.IsAlive(wardHero as EntityIndex)) { cancelWardTarget(); return false; }
    if (event !== "pressed") return false;
    if (button === 1) { cancelWardTarget(); return true; }
    if (button !== 0) return false;
    const kind = wardTarget;
    const point = GameUI.GetScreenWorldPosition(GameUI.GetCursorPosition());
    if (point == null) return false;
    cancelWardTarget();
    GameEvents.SendCustomGameEventToServer("orb_slot_use", { kind, x: point[0], y: point[1] });
    return true;
}

function slotTip(def: SlotDef): string {
    const d = slotsData();
    const n = d ? (d[def.kind] || 0) : 0;
    const k = slotKey(def);
    return L("orb_slot_tip_" + def.kind, String(n), k !== "" ? k : "—") + "<br>" + L("orb_slot_tip_keys");
}

function slotsBuild() {
    const top = $("#SlotsTop");
    const right = $("#SlotsRight");
    if (top.GetChildCount() > 0) return;
    for (const def of SLOT_DEFS) {
        const parent = def.kind === "sm" || def.kind === "du" ? top : right;
        const btn = $.CreatePanel("Button", parent, "Slot_" + def.kind);
        btn.AddClass("Slot");
        btn.AddClass(def.kind);
        const img = $.CreatePanel("DOTAItemImage", btn, "Img") as ItemImage;
        img.itemname = def.item;
        img.hittest = false;
        img.AddClass("SlotImg");
        const key = $.CreatePanel("Label", btn, "Key");
        key.AddClass("SlotKey");
        key.text = slotKey(def);
        key.hittest = false;
        const count = $.CreatePanel("Label", btn, "Count");
        count.AddClass("SlotCount");
        count.hittest = false;
        btn.SetPanelEvent("onactivate", () => slotUse(def));
        btn.SetPanelEvent("oncontextmenu", () => slotNextLayout());
        btn.SetPanelEvent("onmouseover", () => $.DispatchEvent("DOTAShowTextTooltip", btn, slotTip(def)));
        btn.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", btn));
    }
    // Съесть Boots of Travel
    const eat = $.CreatePanel("Button", top, "SlotEat");
    eat.AddClass("Slot");
    eat.AddClass("Eat");
    const img = $.CreatePanel("DOTAItemImage", eat, "Img") as ItemImage;
    img.itemname = "item_travel_boots";
    img.hittest = false;
    img.AddClass("SlotImg");
    const plus = $.CreatePanel("Label", eat, "Plus");
    plus.AddClass("SlotEatPlus");
    plus.text = "+";
    plus.hittest = false;
    eat.SetPanelEvent("onactivate", () => {
        GameEvents.SendCustomGameEventToServer("orb_eat_travel", {});
        Game.EmitSound("ui.click_alt");
    });
    eat.SetPanelEvent("onmouseover", () => {
        const d = slotsData();
        $.DispatchEvent("DOTAShowTextTooltip", eat, L("orb_slot_tip_eat", d ? String(d.tb) : "0", d ? String(d.tm) : "2"));
    });
    eat.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", eat));
}

function slotsRender() {
    slotsBuild();
    const d = slotsData();
    const hero = slotsHero();
    const show = d !== undefined && hero !== -1 && Game.GetState() >= DOTA_GameState.DOTA_GAMERULES_STATE_PRE_GAME;
    $("#SlotsTop").SetHasClass("Hidden", !show);
    $("#SlotsRight").SetHasClass("Hidden", !show);
    if (!show || !d) return;
    for (const def of SLOT_DEFS) {
        const btn = $("#Slot_" + def.kind);
        if (!btn) continue;
        const n = d[def.kind] || 0;
        (btn.FindChildTraverse("Count") as LabelPanel).text = String(n);
        btn.SetHasClass("Empty", n <= 0);
    }
    $("#SlotEat").SetHasClass("Hidden", d.te !== 1);
}

/** Прямоугольник панели Доты в единицах нашего интерфейса. */
function slotsRect(id: string): { x: number; y: number; w: number; h: number } | undefined {
    const p = dotaHudElement(id);
    if (!p || p.actuallayoutwidth <= 0 || !p.IsValid()) return undefined;
    const root = $.GetContextPanel();
    const sx = root.actualuiscale_x || 1;
    const sy = root.actualuiscale_y || 1;
    const pos = p.GetPositionWithinWindow();
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return undefined;
    return { x: pos.x / sx, y: pos.y / sy, w: p.actuallayoutwidth / sx, h: p.actuallayoutheight / sy };
}

function slotsPlace() {
    const top = $("#SlotsTop");
    const right = $("#SlotsRight");
    const root = $.GetContextPanel();
    const sx = root.actualuiscale_x || 1;
    const sy = root.actualuiscale_y || 1;
    const screenW = root.actuallayoutwidth / sx;
    const screenH = root.actuallayoutheight / sy;
    const inv = slotsRect("inventory_list_container") || slotsRect("inventory");
    const topW = top.actuallayoutwidth / sx;
    const topH = top.actuallayoutheight / sy;
    const rightH = right.actuallayoutheight / sy;
    if (inv && inv.y > screenH * 0.5) {
        // Правая граница: инвентарь, ячейка ТП и ячейка нейтралки
        let edge = inv.x + inv.w;
        for (const id of ["inventory_tpscroll_container", "inventory_neutral_slot_container"]) {
            const r = slotsRect(id);
            if (r && r.y > screenH * 0.5 && Math.abs(r.x - (inv.x + inv.w)) < 160) edge = Math.max(edge, r.x + r.w);
        }
        top.style.position = Math.floor(inv.x) + "px " + Math.floor(inv.y - topH - 4) + "px 0px";
        right.style.position = Math.floor(edge + 4) + "px " + Math.floor(inv.y + inv.h - rightH) + "px 0px";
    } else {
        // Запасное место: справа от центра нижней панели
        top.style.position = Math.floor(screenW / 2 + 140) + "px " + Math.floor(screenH - 150 - topH) + "px 0px";
        right.style.position = Math.floor(screenW / 2 + 140 + Math.max(topW, 120) + 8) + "px " + Math.floor(screenH - 10 - rightH) + "px 0px";
    }
    $.Schedule(0.5, slotsPlace);
}

function slotBindLayout() {
    for (const key of SLOT_LAYOUTS[slotLayout]) Game.CreateCustomKeyBind(key, "OrbConsumableKey" + key);
}

(function initSlots() {
    slotConfig.orbSlotDispatch = slotKeyPressed;
    GameUI.SetMouseCallback(slotMouse);
    const bound: string[] = [];
    for (const keys of SLOT_LAYOUTS) {
        for (const key of keys) {
            if (bound.indexOf(key) >= 0) continue;
            bound.push(key);
            const cmd = "OrbConsumableKey" + key;
            Game.AddCommand(cmd, () => {
                const config = GameUI.CustomUIConfig() as typeof slotConfig;
                config.orbSlotDispatch?.(key);
            }, "", 0);

        }
    }
    CustomNetTables.SubscribeNetTableListener("orb_items", (_t, key) => {
        if (key === String(Players.GetLocalPlayer())) slotsRender();
    });
    let matchHero = -1;
    let matchState = -1;
    const loop = () => {
        const hero = slotsHero();
        const state = Game.GetState();
        if (matchHero !== hero || matchState !== state) {
            matchHero = hero;
            matchState = state;
            cancelWardTarget();
            slotBindLayout();
        }
        slotsRender();
        $.Schedule(0.5, loop);
    };
    loop();
    slotsPlace();
})();
