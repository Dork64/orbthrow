// The engine owns the count and recharge timer. Fill in only when the stock badge is absent.
(function initOrbChargeBadges() {
    const layer = $("#OrbChargeOverlay");
    const badges: { panel: Panel; ring: Panel; count: LabelPanel; ability: number; remaining: number; span: number }[] = [];
    const size = 24;

    function tick() {
        let used = 0;
        const hero = Players.GetLocalPlayerPortraitUnit();
        const ownHero = Players.GetPlayerHeroEntityIndex(Players.GetLocalPlayer());
        const bar = dotaHudElement("AbilitiesAndStatBranch")?.FindChildTraverse("abilities");
        if (hero >= 0 && hero === ownHero && bar && Entities.IsValidEntity(hero)) {
            const abilities: AbilityEntityIndex[] = [];
            for (let i = 0; i < Entities.GetAbilityCount(hero); i++) {
                const ab = Entities.GetAbility(hero, i);
                if (ab < 0 || Abilities.IsHidden(ab) || !Abilities.IsDisplayedAbility(ab)) continue;
                const name = Abilities.GetAbilityName(ab);
                if (name && name !== "generic_hidden" && !name.startsWith("special_bonus_")) abilities.push(ab);
            }

            const buttons = bar.Children().filter(p => /^Ability\d+$/.test(p.id) && p.actuallayoutwidth > 0);
            buttons.sort((a, b) => Number(a.id.slice(7)) - Number(b.id.slice(7)));
            for (let i = 0; i < buttons.length; i++) {
                const slot = buttons[i];
                if (slot.BHasClass("show_ability_charges")) continue;
                const button = slot.FindChildTraverse("AbilityButton");
                if (!button || button.actuallayoutwidth <= 0 || button.actuallayoutheight <= 0) continue;

                const image = button.FindChildTraverse("AbilityImage") as AbilityImage | null;
                const name = image?.abilityname;
                const ab = name ? Entities.GetAbilityByName(hero, name) : buttons.length === abilities.length ? abilities[i] : undefined;
                if (ab === undefined || ab < 0 || Abilities.GetLevel(ab) <= 0) continue;

                const current = Abilities.GetCurrentAbilityCharges(ab);
                const remaining = Math.max(0, Abilities.GetAbilityChargeRestoreTimeRemaining(ab));
                if (current < 0 || !(Abilities.GetMaxAbilityCharges(ab) > 0 || current > 0 || remaining > 0)) continue;

                const pos = button.GetPositionWithinWindow();
                const sx = layer.actualuiscale_x || 1;
                const sy = layer.actualuiscale_y || 1;
                if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) continue;
                const x = Math.round((pos.x + button.actuallayoutwidth) / sx - size - 2);
                const y = Math.round((pos.y + button.actuallayoutheight) / sy - size - 2);

                if (used === badges.length) {
                    const panel = $.CreatePanel("Panel", layer, "", { class: "OrbChargeBadge", hittest: "false", hittestchildren: "false" });
                    const ring = $.CreatePanel("Panel", panel, "", { class: "OrbChargeRing", hittest: "false" });
                    const count = $.CreatePanel("Label", panel, "", { class: "OrbChargeCount", hittest: "false" }) as LabelPanel;
                    badges.push({ panel, ring, count, ability: -1, remaining: 0, span: 0 });
                }
                const badge = badges[used++];
                if (remaining > 0 && (badge.ability !== ab || badge.remaining <= 0 || remaining > badge.remaining + 0.15)) {
                    // A new recharge gives us the effective duration, including item and sphere CDR.
                    const configured = Abilities.GetSpecialValueFor(ab, "AbilityChargeRestoreTime");
                    const observedStart = badge.ability === ab && badge.panel.visible;
                    badge.span = observedStart ? remaining : Math.max(remaining, configured || 0);
                }
                badge.ability = ab;
                badge.remaining = remaining;
                const progress = remaining > 0 ? Math.max(0, 1 - remaining / Math.max(remaining, badge.span)) : 1;
                badge.ring.style.clip = "radial(50% 50%, 0deg, " + (360 * progress).toFixed(1) + "deg)";
                badge.count.text = String(current);
                badge.panel.style.position = x + "px " + y + "px 0px";
                badge.panel.visible = true;
            }
        }

        for (let i = used; i < badges.length; i++) {
            badges[i].panel.visible = false;
            badges[i].ability = -1;
        }
        $.Schedule(used > 0 ? 0.05 : 0.2, tick);
    }

    tick();
})();
