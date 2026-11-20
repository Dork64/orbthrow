// Данные сфер: data/orbs/*.json → проверка по файлам Доты (data/kv) → src/vscripts/core/orbdata.ts и тексты.
// Ошибка в данных (нет способности или ключа в текущем патче) останавливает сборку.
const fs = require("fs");
const path = require("path");
const { heroSummary } = require("./kv.js");

const BRANCHES = ["Q", "W", "E", "R", "H"];

function fmtNum(x) {
    return String(Math.round(x * 100) / 100);
}

// ---------- Проверка эффектов сфер-кода ----------
const FX_TYPES = {
    mark: ["by", "consume", "dur", "icd", "max", "dmg"],
    guard: ["win", "thr", "icd", "radius", "dmg", "dur", "props"],
    combo: ["abs", "need", "within", "icd", "radius", "dmg", "dur", "props"],
    zone: ["at", "radius", "dur", "every", "dmg"],
    tether: ["dur", "range", "maxDist", "breakRange", "every", "dmg"],
    buff: ["dur", "props"], passive: ["props"], lowhp: ["thr", "props"], stacks: ["mod", "min", "props"], still: ["delay", "props"],
    charges: ["n"], refund: ["chance", "cdpct"], kill: ["by"], hit: ["by"], echo: ["delays", "pct"],
    blast: ["at", "delay", "radius", "dmg", "type"], taken: ["reflect"], aura: ["radius", "props"], crit: ["chance", "mult"], vs: ["pct"],
    // механики (04.11)
    auto: ["every", "range"], multi: ["chance"], dash: ["dist"], pull: ["at", "radius", "dist"], illusion: ["n", "dur", "out", "inc"],
    trail: ["dps", "radius", "life", "type"], trap: ["at", "radius", "arm", "life", "max", "dmg", "type"], summon: ["unit", "n", "dur"],
    swap: [], storm: ["win", "every", "radius", "dmg", "type"], rewind: ["delay", "heal"],
};
const MECH_TYPES = ["combo", "zone", "tether", "auto", "multi", "dash", "pull", "illusion", "trail", "trap", "summon", "swap", "storm", "rewind"];
const FX_PROPS = ["armor", "ms", "msc", "as", "dmg", "dmgc", "inc", "status", "slowres", "sa", "mr", "regen", "regenpct", "evasion",
    "range", "castrange", "str", "agi", "int", "hp", "ls", "sls", "cleave", "immune", "silence", "root", "stun", "disarm", "brk", "reveal", "nocol", "healred",
    "invis", "fly", "scale"];
const FX_FIELDS = new Set(["t", "ab", "icon", "aw", "key", "orb", "hero", "dur", "props", "dispel", "shield", "perlvl", "thr", "mod", "min", "perstack",
    "delay", "n", "chance", "cdpct", "mana", "by", "win", "refresh", "heal", "manapct", "ext", "stack", "heroOnly", "every", "cond", "lowhp", "icd",
    "debuff", "extra", "chain", "splash", "pierce", "cdr", "addstack", "delays", "pct", "at", "radius", "dmg", "type", "pfx", "reflect", "mult", "attackOnly",
    "range", "times", "dist", "to", "out", "inc", "life", "arm", "max", "unit", "dps", "abs", "need", "within", "inner", "minDist", "maxDist", "breakRange", "isolated", "targetMod", "ownerMod", "consume", "group", "entryDmg", "finishTicks", "finishDmg", "nextCast", "nativeMark"]);
const PFX_OK = new Set([
    "particles/units/heroes/hero_lina/lina_spell_light_strike_array.vpcf",
    "particles/units/heroes/hero_earthshaker/earthshaker_echoslam_start.vpcf",
    "particles/units/heroes/hero_crystalmaiden/maiden_crystal_nova.vpcf",
    "particles/units/heroes/hero_lich/lich_frost_nova.vpcf",
    "particles/units/heroes/hero_queenofpain/queen_scream_of_pain_owner.vpcf",
    "particles/units/heroes/hero_ursa/ursa_earthshock.vpcf",
    "particles/units/heroes/hero_sven/sven_spell_storm_bolt_lightning.vpcf",
    "particles/units/heroes/hero_tidehunter/tidehunter_anchor_hero.vpcf",
    "particles/units/heroes/hero_pudge/pudge_rot.vpcf",
    "particles/units/heroes/hero_viper/viper_nethertoxin.vpcf",
    "particles/units/heroes/hero_luna/luna_lucent_beam.vpcf",
    "particles/units/heroes/hero_mirana/mirana_starfall_attack.vpcf",
    "particles/units/heroes/hero_legion_commander/legion_commander_odds.vpcf",
    "particles/units/heroes/hero_dragon_knight/dragon_knight_breathe_fire.vpcf",
    "particles/units/heroes/hero_bristleback/bristleback_quill_spray.vpcf",
    "particles/units/heroes/hero_phantom_assassin/phantom_assassin_crit_impact.vpcf",
    "particles/units/heroes/hero_drow/drow_silence_wave.vpcf",
    "particles/units/heroes/hero_sniper/sniper_shrapnel.vpcf",
    "particles/units/heroes/hero_axe/axe_beserkers_call_owner.vpcf",
    "particles/units/heroes/hero_juggernaut/juggernaut_blade_fury.vpcf",
    "particles/units/heroes/hero_batrider/batrider_firefly_path.vpcf",
    "particles/units/heroes/hero_crystalmaiden/maiden_freezing_field_explosion.vpcf",
    "particles/units/heroes/hero_techies/techies_land_mine_explode.vpcf",
    "particles/units/heroes/hero_dark_seer/dark_seer_vacuum.vpcf",
    "particles/units/heroes/hero_venomancer/venomancer_poison_nova.vpcf",
    "particles/units/heroes/hero_magnataur/magnataur_reverse_polarity.vpcf",
]);
const SUMMON_OK = ["npc_dota_neutral_alpha_wolf", "npc_dota_neutral_giant_wolf", "npc_dota_neutral_polar_furbolg_ursa_warrior",
    "npc_dota_neutral_centaur_khan", "npc_dota_neutral_satyr_hellcaller", "npc_dota_neutral_dark_troll_warlord", "npc_dota_neutral_ogre_mauler"];

function validateFx(f, summary) {
    const errs = [];
    const need = FX_TYPES[f.t];
    if (!need) return ["неизвестный тип " + f.t];
    for (const k of need) if (f[k] === undefined) errs.push("нет поля " + k);
    for (const k of Object.keys(f)) if (!FX_FIELDS.has(k)) errs.push("неизвестное поле " + k);
    const abilities = summary ? summary.abilities : {};
    const abOk = name => !summary || summary.slots.includes(name);
    if (f.ab && !abOk(f.ab)) errs.push("нет способности " + f.ab);
    const ab = summary && f.ab ? abilities[f.ab] : undefined;
    const checkNum = (v, where) => {
        if (v === undefined) return;
        if (typeof v === "number") { if (!Number.isFinite(v)) errs.push(where + ": не число"); return; }
        if (typeof v !== "string") { errs.push(where + ": должно быть число или «ключ*множитель»"); return; }
        const [key, mult] = v.split("*");
        if (mult !== undefined && !Number.isFinite(Number(mult))) errs.push(where + ": плохой множитель " + v);
        if (summary && (!ab || ab.values[key] === undefined)) errs.push(where + ": у " + f.ab + " нет ключа " + key);
    };
    const checkProps = (p, where) => {
        if (!p) return;
        for (const [k, v] of Object.entries(p)) {
            if (!FX_PROPS.includes(k)) errs.push(where + ": неизвестное свойство " + k);
            checkNum(v, where + "." + k);
        }
    };
    const checkDebuff = (d, where) => {
        if (!d) return;
        if (!where.startsWith("aw.") && (!d.props || d.dur === undefined)) errs.push(where + ": у дебаффа нужны props и dur");
        checkProps(d.props, where);
        checkNum(d.dur, where + ".dur");
        checkNum(d.delay, where + ".delay");
    };
    const checkAll = (o, where) => {
        checkProps(o.props, where + "props");
        checkDebuff(o.debuff, where + "debuff");
        for (const k of ["dur", "min", "cdpct", "mana", "win", "heal", "manapct", "pct", "delay", "radius", "dmg", "reflect", "chance", "mult",
            "every", "range", "dist", "out", "inc", "dps"]) checkNum(o[k], where + k);
        if (o.extra) for (const k of ["pct", "maxhp", "curhp", "atk", "flat"]) checkNum(o.extra[k], where + "extra." + k);
        if (o.chain) checkNum(o.chain.pct, where + "chain.pct");
        if (o.splash) checkNum(o.splash.pct, where + "splash.pct");
        if (o.pierce) checkNum(o.pierce.pct, where + "pierce.pct");
        if (o.cdr) { checkNum(o.cdr.sec, where + "cdr.sec"); for (const a of o.cdr.abs) if (a !== "self" && !abOk(a)) errs.push("cdr: нет способности " + a); }
        if (o.refresh) for (const a of o.refresh) if (a !== "self" && !abOk(a)) errs.push("refresh: нет способности " + a);
        if (o.shield) { checkNum(o.shield.base, where + "shield.base"); checkNum(o.shield.str, where + "shield.str"); checkNum(o.shield.dur, where + "shield.dur"); }
        if (o.stack) checkProps(o.stack.props, where + "stack.props");
        if (o.addstack) { checkNum(o.addstack.max, where + "addstack.max"); checkNum(o.addstack.dur, where + "addstack.dur"); }
        if (o.ext) checkNum(o.ext.sec, where + "ext.sec");
    };
    checkAll(f, "");
    if (f.aw) checkAll(f.aw, "aw.");
    for (const spec of [f, { ...f, ...(f.aw || {}) }]) {
        if (f.t === "mark") {
            if (!["ab", "cast"].includes(spec.by) || !Array.isArray(spec.consume) || !spec.consume.length ||
                spec.consume.some(a => a !== "attack" && !abOk(a)) || !(spec.max >= 1 && spec.max <= 6) ||
                !(spec.icd >= spec.dur && spec.dur > (spec.arm || 0))) errs.push("mark: неверный источник, срок или лимит");
            if (spec.consume?.includes(spec.ab) && !(spec.arm >= 0.35)) errs.push("mark: повтор той же способности требует задержки");
        }
        if (f.t === "guard" && (!(spec.thr >= 8 && spec.thr <= 35) || !(spec.icd >= spec.win && spec.win > 0) || spec.heal > 15))
            errs.push("guard: неверный порог, срок или лечение");
        if (spec.entryDmg !== undefined) checkNum(spec.entryDmg, "entryDmg");
        if (spec.finishDmg !== undefined) checkNum(spec.finishDmg, "finishDmg");
    }
    if (f.pfx && !PFX_OK.has(f.pfx)) errs.push("эффект частиц не из проверенного списка: " + f.pfx);
    if (f.t === "combo") {
        if (!Array.isArray(f.abs) || new Set(f.abs).size !== f.abs.length || f.need < 2 || f.need > f.abs.length || !(f.within > 0) || !(f.icd >= f.within)) errs.push("combo: неверные ограничения");
        for (const name of f.abs || []) if (!abOk(name)) errs.push("combo: нет способности " + name);
    }
    if (f.t === "zone" && (!(f.radius > (f.inner || 0)) || f.inner < 0 || !(f.every >= 0.5) || !["self", "point", "target"].includes(f.at))) errs.push("zone: неверная геометрия/период");
    if (f.t === "tether" && (!(f.every >= 0.5) || !(f.maxDist > (f.minDist || 0)) || f.breakRange < f.maxDist || !(f.range > 0))) errs.push("tether: неверные дистанции/период");
    if (f.t === "charges" && ab && ab.values.AbilityCharges !== undefined) errs.push("у способности свои заряды — используйте данные AbilityCharges");
    if (f.t === "hit" && !["ab", "attack"].includes(f.by)) errs.push("by должно быть ab или attack");
    if (f.t === "kill" && !["ab", "win", "any"].includes(f.by)) errs.push("by должно быть ab, win или any");
    if (f.t === "kill" && f.by === "win" && f.win === undefined) errs.push("для by=win нужно win");
    if (f.t === "blast" && !["self", "target", "point"].includes(f.at)) errs.push("at: self, target или point");
    if (f.cond !== undefined && !["stunned", "slowed", "silenced", "rooted"].includes(f.cond) && !/^has:\w+$/.test(f.cond)) errs.push("cond: " + f.cond);
    if ((f.t === "buff" || f.t === "echo" || f.t === "blast" || f.t === "charges" || f.t === "refund") && !f.ab) errs.push("нужна способность ab");
    if (MECH_TYPES.includes(f.t) && f.t !== "trail" && !f.ab) errs.push("нужна способность ab");
    // Повтор и самоприменение вызывают OnSpellStart: поддерживающие (канал) и переключаемые способности нельзя
    if ((f.t === "auto" || f.t === "multi") && ab && /CHANNELLED|TOGGLE|PASSIVE/.test(ab.behavior || "")) errs.push(f.t + ": способность с каналом, переключением или пассивная — нельзя");
    if (f.t === "summon" && !SUMMON_OK.includes(f.unit)) errs.push("summon: юнит не из списка " + f.unit);
    if (f.t === "pull" && !["self", "point", "target"].includes(f.at)) errs.push("pull.at: self, point или target");
    if (f.t === "trap" && !["self", "point", "target"].includes(f.at)) errs.push("trap.at: self, point или target");
    if (f.t === "dash" && f.to !== undefined && !["point", "target", "back"].includes(f.to)) errs.push("dash.to: point, target или back");
    return errs;
}

function build(root) {
    const errors = [];
    const read = f => JSON.parse(fs.readFileSync(path.join(root, "data/orbs", f), "utf8"));
    const grey = read("grey.json").list;
    const statLabels = read("stat_labels.json");
    const specialCaps = read("special_caps.json");
    const sources = [["blue", read("blue.json")], ["purple", read("purple.json")], ["legend", read("legend.json")]];
    const heroesTs = fs.readFileSync(path.join(root, "src/vscripts/core/heroes.ts"), "utf8");
    const pool = [...heroesTs.matchAll(/"(npc_dota_hero_\w+)"/g)].map(m => m[1]);
    const ids = new Set();
    const tokens = { russian: {}, english: {} };
    const summaries = {};
    const summaryOf = hero => {
        if (summaries[hero] === undefined) {
            const kvPath = path.join(root, "data/kv", hero + ".txt");
            summaries[hero] = fs.existsSync(kvPath) ? heroSummary(kvPath) : null;
        }
        return summaries[hero];
    };

    for (const g of grey) {
        if (ids.has(g.id)) errors.push("повтор id " + g.id);
        ids.add(g.id);
        tokens.russian["orb_up_" + g.id] = g.ru;
        tokens.english["orb_up_" + g.id] = g.en;
        tokens.russian["orb_up_" + g.id + "_d"] = g.ru_d;
        tokens.english["orb_up_" + g.id + "_d"] = g.en_d;
    }

    const ups = [];
    const counts = {};
    const fxList = [];
    // Записи: массивы (старый формат) и объекты (data/orbs/heroes/*.json)
    const entries = [];
    for (const [rarity, data] of sources) {
        for (const [heroKey, list] of Object.entries(data)) {
            if (heroKey === "_") continue;
            const hero = heroKey === "_universal" ? "*" : heroKey;
            for (const e of list) {
                const [id, branch, ability, modsText, max, ru, en, ru_d, en_d, ru_aw, en_aw] = e;
                entries.push({ id, r: rarity, hero, branch, ab: ability, mods: modsText === "code" ? undefined : modsText, code: modsText === "code", max, ru, en, ru_d, en_d, ru_aw, en_aw });
            }
        }
    }
    const heroesDir = path.join(root, "data/orbs/heroes");
    if (fs.existsSync(heroesDir)) {
        for (const f of fs.readdirSync(heroesDir).filter(f => f.endsWith(".json")).sort()) {
            const data = JSON.parse(fs.readFileSync(path.join(heroesDir, f), "utf8"));
            const hero = data.hero;
            for (const e of data.orbs) entries.push(Object.assign({ hero, max: 1 }, e, { file: f }));
        }
    }

    const parseMods = (id, ability, ab, text, errors) => {
        const mods = [];
        let cd = 0;
        if (!text) return { mods, cd };
        for (const part of String(text).split(";")) {
            const [key, opText, unit = ""] = part.split(":");
            let op = "add", num = opText;
            if (opText.startsWith("*")) { op = "mul"; num = opText.slice(1); }
            else if (opText.startsWith("%")) { op = "pct"; num = opText.slice(1); }
            else if (opText.startsWith("=")) { op = "set"; num = opText.slice(1); }
            else if (opText.startsWith("+")) num = opText.slice(1);
            const add = Number(num);
            if (!Number.isFinite(add)) errors.push(id + ": плохое число в " + part);
            if (key === "cd") { cd = add; continue; }
            if (ab && ab.values[key] === undefined) errors.push(id + ": у " + ability + " нет ключа " + key);
            const base = ab?.values[key];
            const m = { key, add, unit, base: base ? base[base.length - 1] : 0 };
            if (op !== "add") m.op = op;
            mods.push(m);
        }
        return { mods, cd };
    };

    for (const e of entries) {
        const { id, r: rarity, hero, branch, ab: ability, max, ru, en, ru_d, en_d, ru_aw, en_aw } = e;
        if (hero !== "*" && !pool.includes(hero)) errors.push("герой не в пуле: " + hero);
        const summary = hero === "*" ? null : summaryOf(hero);
        if (hero !== "*" && !summary) errors.push("нет файла Доты для " + hero);
        if (ids.has(id)) errors.push("повтор id " + id);
        ids.add(id);
        if (!BRANCHES.includes(branch)) errors.push(id + ": неизвестная ветка " + branch);
        if (!(max > 0)) errors.push(id + ": макс. должен быть > 0");
        if (!["blue", "purple", "legend"].includes(rarity)) errors.push(id + ": редкость " + rarity);
        const ab = ability ? summary?.abilities[ability] : undefined;
        if (ability && summary && !summary.slots.includes(ability)) errors.push(id + ": у героя нет способности " + ability);
        if (ab?.grantedUpgrade) errors.push(id + ": сфера не должна зависеть от способности Scepter/Shard");
        const conflicts = text => String(text || "").split(";").map(m => m.split(":")[0] === "cd" ? "AbilityCooldown" : m.split(":")[0])
            .filter(k => (ab?.upgradeKeys || []).includes(k));
        const duplicates = [...conflicts(e.mods), ...conflicts(e.awmods)];
        if (duplicates.length) errors.push(id + ": повтор улучшения Scepter/Shard: " + duplicates.join(", "));
        const { mods, cd } = parseMods(id, ability, ab, e.mods, errors);
        const aw = parseMods(id, ability, ab, e.awmods, errors);
        if (cd > 0 && ab && ab.values.AbilityCooldown === undefined && ab.values.AbilityChargeRestoreTime === undefined)
            errors.push(id + ": у " + ability + " нет перезарядки");
        const fx = Array.isArray(e.fx) ? e.fx : [];
        fx.forEach((f, i) => {
            const full = Object.assign({ ab: ability }, f, { key: id + "_" + (i + 1), orb: id, hero });
            if (!full.icon) full.icon = full.ab || "item_ultimate_orb";
            for (const err of validateFx(full, summary)) errors.push(id + " эффект " + (i + 1) + ": " + err);
            fxList.push(full);
        });
        const code = mods.length === 0 && cd === 0;
        if (code && fx.length === 0 && !e.code) errors.push(id + ": нет ни изменений значений, ни эффектов");
        if ((code || rarity !== "blue") && (!ru_d || !en_d)) errors.push(id + ": нужно описание");
        if (rarity === "legend" && (!ru_aw || !en_aw)) errors.push(id + ": у легендарки нужно описание Пробуждения");
        const def = { id, rarity, hero, branch, ability: ability || "", mods, cd, max, code };
        // Механика: сфера меняет то, как играется способность (такие предлагаются и в синих)
        if (fx.some(f => MECH_TYPES.includes(f.t)) || e.mech) def.mech = true;
        if (aw.mods.length > 0) def.awmods = aw.mods;
        ups.push(def);
        counts[rarity] = (counts[rarity] || 0) + 1;
        const units = { "%": ["%", "%"], s: [" с", " s"], "": ["", ""] };
        const label = (m, lang) => statLabels[m.key]?.[lang] || (lang === 0 ? ru : en);
        const one = (m, lang) => {
            const unit = units[m.unit || statLabels[m.key]?.[2] || ""][lang];
            if (m.op === "mul") return label(m, lang) + " ×" + fmtNum(m.add);
            const sign = m.op === "set" ? "= " : m.add < 0 ? "−" : "+";
            const amount = fmtNum(Math.abs(m.add));
            const suffix = m.op === "pct" ? (lang === 0 ? "% от значения" : "% of base value") : unit;
            return label(m, lang) + " " + sign + amount + suffix;
        };
        const per = lang => mods.map(m => one(m, lang)).join(", ");
        const soft = rarity === "blue" && max > 0 ? (lang => lang === 0 ? ` (после ${max}-й сферы прибавка вдвое меньше)` : ` (half gain after orb ${max})`) : () => "";
        tokens.russian["orb_up_" + id] = ru;
        tokens.english["orb_up_" + id] = en;
        tokens.russian["orb_up_" + id + "_d"] = ru_d || (cd > 0 ? `Перезарядка −${cd}% за сферу (с убыванием, всего до −60%)` : `За сферу: ${per(0)}${soft(0)}`);
        tokens.english["orb_up_" + id + "_d"] = en_d || (cd > 0 ? `Cooldown −${cd}% per orb (diminishing, up to −60% total)` : `Per orb: ${per(1)}${soft(1)}`);
        if (ru_aw) tokens.russian["orb_up_" + id + "_aw"] = ru_aw;
        if (en_aw) tokens.english["orb_up_" + id + "_aw"] = en_aw;
    }
    for (const u of ups) {
        if (u.rarity !== "blue") continue;
        if (u.ability === "puck_phase_shift" && u.cd > 0) {
            tokens.russian["orb_up_" + u.id + "_d"] += "; общее снижение КД Phase Shift от сфер не больше 20%";
            tokens.english["orb_up_" + u.id + "_d"] += "; total Phase Shift cooldown reduction from orbs capped at 20%";
        }
        for (const mod of u.mods) {
            const cap = specialCaps[u.ability]?.[mod.key];
            if (cap === undefined) continue;
            tokens.russian["orb_up_" + u.id + "_d"] += "; предел значения со сферами: " + cap;
            tokens.english["orb_up_" + u.id + "_d"] += "; value with orbs capped at " + cap;
        }
    }
    // Подсказки модификаторов эффектов: имя и описание сферы
    for (const f of fxList) {
        const name = "DOTA_Tooltip_modifier_orb_fx_" + f.key;
        tokens.russian[name] = tokens.russian["orb_up_" + f.orb];
        tokens.english[name] = tokens.english["orb_up_" + f.orb];
        tokens.russian[name + "_Description"] = tokens.russian["orb_up_" + f.orb + "_d"];
        tokens.english[name + "_Description"] = tokens.english["orb_up_" + f.orb + "_d"];
    }
    for (const h of pool) if (!ups.some(u => u.hero === h && u.rarity === "blue")) console.warn("нет синих сфер для " + h + " (будут заменяться серыми)");
    if (errors.length > 0) {
        for (const e of errors) console.error("ДАННЫЕ СФЕР: " + e);
        process.exit(1);
    }
    const ts = "// Сгенерировано tools/orbs.js из data/orbs/*.json — не править руками.\n" +
        "import type { UpgradeDef, GreyDef } from \"./orbtypes\";\n\n" +
        "export const GREY_DEFS: GreyDef[] = " + JSON.stringify(grey.map(g => ({ id: g.id, per: g.per, cap: g.cap, max: g.max, unit: g.unit }))) + ";\n\n" +
        "export const SPECIAL_CAPS: Record<string, Record<string, number>> = " + JSON.stringify(specialCaps) + ";\n\n" +
        "export const UPGRADE_DEFS: UpgradeDef[] = " + JSON.stringify(ups) + ";\n";
    fs.writeFileSync(path.join(root, "src/vscripts/core/orbdata.ts"), ts);
    // Файл модификаторов эффектов: каждое имя — явной глобальной переменной (так их находит движок)
    const HAS_MOD = f => ["mark", "guard", "combo", "buff", "passive", "lowhp", "stacks", "still", "aura"].includes(f.t) || (f.t === "kill" && f.stack) || (["zone", "hit", "blast", "trail", "trap", "storm"].includes(f.t) && f.debuff);
    const withMod = fxList.filter(HAS_MOD);
    fs.writeFileSync(path.join(root, "src/vscripts/modifiers/modifier_orb_fx.ts"),
        "// Сгенерировано tools/orbs.js — не править руками. Модификаторы эффектов сфер-кода (класс — lib/fxmodifier.ts).\n" +
        "import { makeFx } from \"../lib/fxmodifier\";\n\n" +
        "declare global {\n    /* eslint-disable no-var */\n" + withMod.map(f => `    var modifier_orb_fx_${f.key}: unknown;\n`).join("") + "    /* eslint-enable no-var */\n}\n\n" +
        withMod.map(f => `modifier_orb_fx_${f.key} = makeFx("${f.key}");\n`).join("") +
        (withMod.length === 0 ? "export {};\n" : ""));
    fs.writeFileSync(path.join(root, "src/vscripts/core/fxdata.ts"),
        "// Сгенерировано tools/orbs.js из data/orbs/heroes/*.json — не править руками.\n" +
        "import type { FxDef } from \"./fxtypes\";\n\n" +
        "export const FX_LIST: FxDef[] = " + JSON.stringify(fxList, null, 0) + " as unknown as FxDef[];\n");
    console.log("сферы: серых " + grey.length + ", синих " + (counts.blue || 0) + ", фиолетовых " + (counts.purple || 0) + ", легендарных " + (counts.legend || 0) + ", эффектов " + fxList.length);
    return { tokens };
}

module.exports = { build, SUMMON_OK };
