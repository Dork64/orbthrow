// Сферы: три шкалы, кнопка очереди и панель выбора из 3 карточек (DESIGN 5.3, 11).
// Все строится из сетевой таблицы orb_spheres — после переподключения восстанавливается само.

let orbPanelOpen = false;
/** Игрок свернул панель: новые сферы не открывают ее сами, пока очередь не опустеет. */
let orbUserCollapsed = false;
let orbLastSeq = -1;
/** Новое предложение пришло в бою — откроем после боя. */
let orbPendingOpen = false;
let orbLastCardsKey = "";

const ORB_RARITY_ORDER = ["legend", "purple", "blue", "grey"];

function orbData(): OrbSphereNet | undefined {
    const pid = Players.GetLocalPlayer();
    if (pid < 0) return undefined;
    return CustomNetTables.GetTableValue("orb_spheres", String(pid)) as OrbSphereNet | undefined;
}

function orbTooltip(panel: Panel, textFn: () => string) {
    panel.SetPanelEvent("onmouseover", () => $.DispatchEvent("DOTAShowTextTooltip", panel, textFn()));
    panel.SetPanelEvent("onmouseout", () => $.DispatchEvent("DOTAHideTextTooltip", panel));
}

/** Иконка карточки: способность героя («a:имя») или предмет («i:имя»). */
function orbIconPanel(parent: Panel, ic: string | undefined) {
    const v = ic !== undefined ? ic : "";
    if (v.indexOf("a:") === 0) {
        const img = $.CreatePanel("DOTAAbilityImage", parent, "") as AbilityImage;
        img.abilityname = v.substring(2);
        img.AddClass("Icon");
        img.hittest = false;
        return;
    }
    const img = $.CreatePanel("DOTAItemImage", parent, "") as ItemImage;
    img.itemname = v.indexOf("i:") === 0 ? v.substring(2) : "item_ultimate_orb";
    img.AddClass("Icon");
    img.hittest = false;
}

function orbEnsureBars() {
    const parent = $("#OrbBars");
    if (parent.GetChildCount() > 0) return;
    for (const r of ["grey", "blue", "purple"]) {
        const bar = $.CreatePanel("Panel", parent, "OrbBar_" + r);
        bar.AddClass("OrbBar");
        bar.AddClass(r);
        const fill = $.CreatePanel("Panel", bar, "Fill");
        fill.AddClass("Fill");
        const gem = $.CreatePanel("Panel", bar, "Gem");
        gem.AddClass("OrbGem");
        gem.AddClass(r);
        gem.hittest = false;
        const lbl = $.CreatePanel("Label", bar, "Text");
        lbl.AddClass("Text");
        orbTooltip(bar, () => {
            const d = orbData();
            return L("orb_bar_" + r + "_tip", d ? String(d.gr) : "");
        });
    }
}

function orbSetBar(r: string, points: number, need: number) {
    const bar = $("#OrbBar_" + r);
    if (!bar) return;
    const pct = need > 0 ? Math.max(0, Math.min(100, (points / need) * 100)) : 0;
    (bar.FindChildTraverse("Fill") as Panel).style.width = pct.toFixed(1) + "%";
    const shown = Math.floor(points * 10) / 10;
    (bar.FindChildTraverse("Text") as LabelPanel).text = L("orb_bar_" + r) + "  " + shown + " / " + need;
}

function orbRender() {
    orbEnsureBars();
    const d = orbData();
    $("#OrbBarsDock").SetHasClass("Hidden", d === undefined);
    orbRenderCatalog(d);
    if (d === undefined) return;
    orbSetBar("grey", d.g, d.gn);
    orbSetBar("blue", d.b, d.bn);
    orbSetBar("purple", d.p, d.pn);

    // Кнопка очереди
    let total = 0;
    for (const r of ORB_RARITY_ORDER) total += d.q[r] || 0;
    const btn = $("#OrbQueueButton");
    btn.SetHasClass("HasOrbs", total > 0);
    btn.SetHasClass("Open", orbPanelOpen);
    const dots = $("#OrbQueueDots");
    dots.RemoveAndDeleteChildren();
    for (const r of ORB_RARITY_ORDER) {
        const n = d.q[r] || 0;
        if (n <= 0) continue;
        const dot = $.CreatePanel("Label", dots, "");
        dot.AddClass("OrbDot");
        dot.AddClass(r);
        dot.text = String(n);
    }
    ($("#OrbQueueLabel") as LabelPanel).text = total > 0 ? L("orb_queue", String(total)) : L("orb_queue_empty");
    if (total === 0) orbUserCollapsed = false;

    // Новое предложение — открываем панель сами, если игрок ее не сворачивал и не в бою
    // (в бою только пульсирует кнопка; панель откроется, когда бой закончится)
    const offer = d.o;
    if (offer !== undefined && offer.seq !== orbLastSeq) {
        orbLastSeq = offer.seq;
        orbPendingOpen = !orbUserCollapsed;
        if (offer.test === 1) {
            orbUserCollapsed = false;
            orbPendingOpen = false;
            orbPanelOpen = true;
        }
        Game.EmitSound("Item.PickUpGemShop");
    }
    if (offer === undefined) orbPendingOpen = false;
    if (orbPendingOpen && d.fi !== 1) {
        orbPendingOpen = false;
        orbPanelOpen = true;
    }
    const choice = $("#OrbChoice");
    const show = offer !== undefined && orbPanelOpen;
    choice.SetHasClass("Hidden", !show);
    if (!show || offer === undefined) return;

    ($("#OrbChoiceTitle") as LabelPanel).text = L("orb_choose_" + offer.a) + (offer.r !== offer.a ? "  " + L("orb_fallback_" + offer.r) : "");
    choice.SetHasClass("grey", offer.r === "grey");
    choice.SetHasClass("blue", offer.r === "blue");
    choice.SetHasClass("purple", offer.r === "purple");
    choice.SetHasClass("legend", offer.r === "legend");

    const cards = Object.keys(offer.c).sort().map(k => offer.c[k]);
    const key = offer.seq + ":" + cards.map(c => c.id + c.now + c.nx).join("|");
    if (key !== orbLastCardsKey) {
        orbLastCardsKey = key;
        const parent = $("#OrbCards");
        parent.RemoveAndDeleteChildren();
        cards.forEach((c, i) => {
            const card = $.CreatePanel("Button", parent, "");
            card.AddClass("OrbCard");
            card.AddClass(c.rr !== undefined && c.rr !== "" ? c.rr : offer.r);
            card.SetHasClass("Mech", c.m === 1);
            // Шапка: иконка способности или предмета + название и ветка
            const head = $.CreatePanel("Panel", card, "");
            head.AddClass("Head");
            orbIconPanel(head, c.ic);
            const titles = $.CreatePanel("Panel", head, "");
            titles.AddClass("Titles");
            if (c.m === 1) {
                const tag = $.CreatePanel("Label", titles, "");
                tag.AddClass("MechTag");
                tag.text = L("orb_mech_tag");
            } else if (i === 0) {
                const rec = $.CreatePanel("Label", titles, "");
                rec.AddClass("Recommended");
                rec.text = L("orb_recommended");
            }
            const name = $.CreatePanel("Label", titles, "");
            name.AddClass("Name");
            name.text = L("orb_up_" + c.id);
            const meta = $.CreatePanel("Label", titles, "");
            meta.AddClass("Meta");
            // Предела стаков нет — показываем только, сколько уже взято
            meta.text = L("orb_branch_" + c.br) + " · " + (c.mx >= 99 ? (c.st > 0 ? L("orb_taken_inf", String(c.st)) : L("orb_taken_new")) : L("orb_taken", String(c.st), String(c.mx)));
            const desc = $.CreatePanel("Label", card, "");
            desc.AddClass("Desc");
            desc.text = L("orb_up_" + c.id + "_d");
            if (offer.r === "legend") {
                const aw = $.CreatePanel("Label", card, "");
                aw.AddClass("Awake");
                aw.text = L("orb_up_" + c.id + "_aw");
            }
            if (c.now !== "" || c.nx !== "") {
                const val = $.CreatePanel("Label", card, "");
                val.AddClass("Values");
                val.text = L("orb_up_" + c.id) + " · " + c.now + "  →  " + c.nx;
            }
            const seq = offer.seq;
            card.SetPanelEvent("onactivate", () => {
                GameEvents.SendCustomGameEventToServer("orb_pick", { seq, id: c.id });
                Game.EmitSound("ui.click_alt");
            });
        });
    }
    ($("#OrbRerollLabel") as LabelPanel).text = offer.r === "legend"
        ? L("orb_reroll_none")
        : d.fr > 0 ? L("orb_reroll_free", String(d.fr)) : L("orb_reroll_paid", String(d.cost));
    $("#OrbReroll").enabled = offer.r !== "legend";
    ($("#OrbAutoLabel") as LabelPanel).text = L("orb_auto", String(offer.t));
}

function OrbToggle() {
    orbPanelOpen = !orbPanelOpen;
    orbUserCollapsed = !orbPanelOpen;
    orbRender();
}

function OrbCollapse() {
    orbPanelOpen = false;
    orbUserCollapsed = true;
    orbRender();
}

function OrbReroll() {
    const d = orbData();
    if (d === undefined || d.o === undefined) return;
    GameEvents.SendCustomGameEventToServer("orb_reroll", { seq: d.o.seq });
    Game.EmitSound("ui.click_alt");
}

/**
 * Шкалы — справа, прямо над блоком магазина Доты (его высоту берем из интерфейса Доты),
 * при перевернутом интерфейсе — слева. Пока открыт магазин — скрыты, чтобы его не закрывать.
 */
function orbPlaceBars() {
    const dock = $("#OrbBarsDock");
    const flipped = Game.IsHUDFlipped();
    const shopOpen = Game.IsShopOpen();
    dock.SetHasClass("Flipped", flipped);
    dock.SetHasClass("ShopOpen", shopOpen);
    const catalog = $("#OrbCatalog");
    catalog.SetHasClass("Flipped", flipped);
    catalog.SetHasClass("ShopOpen", shopOpen);
    const shop = dotaHudElement("shop_launcher_block");
    const root = $.GetContextPanel();
    const scale = root.actualuiscale_y || 1;
    if (shop && shop.actuallayoutheight > 0 && root.actuallayoutheight > 0) {
        const top = shop.GetPositionWithinWindow().y;
        const fromBottom = Math.max(120, Math.min(420, (root.actuallayoutheight - top) / scale + 8));
        const m = Math.floor(fromBottom) + "px";
        dock.style.margin = flipped ? "0px 0px " + m + " 10px" : "0px 10px " + m + " 0px";
    }
    $.Schedule(0.25, orbPlaceBars);
}

(function initOrbs() {
    orbPlaceBars();
    CustomNetTables.SubscribeNetTableListener("orb_spheres", (_t, key) => {
        if (key === String(Players.GetLocalPlayer())) orbRender();
    });
    // Таймер автовыбора тикает и без новых данных
    const loop = () => {
        orbRender();
        $.Schedule(0.5, loop);
    };
    loop();
})();
