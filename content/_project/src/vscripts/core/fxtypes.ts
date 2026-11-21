// Описание эффектов сфер-кода данными (data/orbs/heroes/*.json → core/fxdata.ts).
// Исполняет их modifiers/modifier_orb_hero.ts; свойства баффов и дебаффов — modifiers/modifier_orb_fx.ts.
// Числа можно задавать числом или строкой «ключ*множитель» — тогда значение берется из
// способности героя (у клиента тоже, поэтому подсказки и цифры панели верные).

export type FxNum = number | string;

/** Состояние цели; «has:часть_имени» — цель под модификатором с такой частью имени. */
export type FxCond = "stunned" | "slowed" | "silenced" | "rooted" | string;

/** Свойства баффа/дебаффа. Все необязательны. */
export interface FxProps {
    armor?: FxNum;      // броня
    ms?: FxNum;         // скорость бега, %
    msc?: FxNum;        // скорость бега, число
    as?: FxNum;         // скорость атаки
    dmg?: FxNum;        // исходящий урон, %
    dmgc?: FxNum;       // урон атаки, число
    inc?: FxNum;        // получаемый урон, % (минус — меньше урона)
    status?: FxNum;     // сопротивление эффектам, %
    slowres?: FxNum;    // сопротивление замедлению, %
    sa?: FxNum;         // усиление способностей, %
    mr?: FxNum;         // сопротивление магии, %
    regen?: FxNum;      // восстановление здоровья в секунду
    regenpct?: FxNum;   // восстановление здоровья, % от максимума в секунду
    evasion?: FxNum;    // уклонение, %
    range?: FxNum;      // дальность атаки
    castrange?: FxNum;  // дальность способностей
    str?: FxNum;
    agi?: FxNum;
    int?: FxNum;
    hp?: FxNum;         // здоровье
    ls?: FxNum;         // вампиризм атак по героям, %
    sls?: FxNum;        // вампиризм способностей по героям, %
    cleave?: FxNum;     // раскол, % урона атаки (только ближний бой)
    // состояния (1 — включено)
    immune?: number;    // невосприимчивость к магии
    silence?: number;
    root?: number;
    stun?: number;
    disarm?: number;
    brk?: number;       // отключение пассивных способностей
    reveal?: number;    // снимает невидимость
    nocol?: number;     // без столкновений
    healred?: FxNum;    // снижение получаемого лечения, %
    invis?: number;     // невидимость (снимается атакой — как у теней в Доте)
    fly?: number;       // полет: деревья и обрывы не мешают
    scale?: FxNum;      // размер модели, % (100 — без изменений)
}

export interface FxDebuff {
    props: FxProps;
    dur: FxNum;
    /** Наложить через столько секунд (например, после оглушения способности). */
    delay?: FxNum;
    /** Складывается до max раз (свойства × стаки). */
    max?: number;
}

export interface FxActions {
    /** Дебафф на цель. */
    debuff?: FxDebuff;
    /** Лечение героя: % нанесенного урона. */
    heal?: FxNum;
    /** Восстановление маны: % нанесенного урона. */
    mana?: FxNum;
    /** Доп. урон цели: pct — % нанесенного, maxhp/curhp — % здоровья цели, atk — % атаки героя, flat — число. */
    extra?: { pct?: FxNum; maxhp?: FxNum; curhp?: FxNum; atk?: FxNum; flat?: FxNum; type?: "magic" | "phys" | "pure" };
    /** Перескок на других героев рядом с целью. */
    chain?: { jumps: number; radius: number; pct: FxNum };
    /** Взрыв вокруг цели: % нанесенного урона всем врагам в радиусе (кроме самой цели). */
    splash?: { radius: number; pct: FxNum };
    /** Пробивание: урон врагам на линии за целью. */
    pierce?: { dist: number; width: number; pct: FxNum };
    /** Сократить перезарядку способностей (имена или "self") на sec секунд. */
    cdr?: { abs: string[]; sec: FxNum };
    /** Добавить стак модификатору героя (имя содержит mod), до max, обновить длительность. */
    addstack?: { mod: string; max: FxNum; dur: FxNum };
}

interface FxBase {
    /** Уникальный ключ эффекта (сфера + номер). */
    key: string;
    /** Сфера, к которой относится эффект. */
    orb: string;
    hero: string;
    /** Способность, к которой привязан эффект. */
    ab: string;
    /** Иконка баффа. */
    icon: string;
    /** Параметры, заменяемые после Пробуждения легендарки. */
    aw?: Record<string, unknown>;
}

/** Бафф героя при применении способности ab. */
export interface FxBuff extends FxBase {
    t: "buff";
    dur: FxNum;
    props: FxProps;
    dispel?: number;
    /** Щит: base + str × сила героя. */
    shield?: { base: FxNum; str?: FxNum; dur: FxNum };
}

/** Постоянные свойства, пока изучена ab (perlvl — умножить на уровень способности). */
export interface FxPassive extends FxBase {
    t: "passive";
    props: FxProps;
    perlvl?: number;
}

/** Свойства, пока здоровье ниже thr%. */
export interface FxLowHp extends FxBase {
    t: "lowhp";
    thr: number;
    props: FxProps;
}

/** Свойства, пока у героя модификатор с частью имени mod и стаков ≥ min (perstack — × стаки). */
export interface FxStacks extends FxBase {
    t: "stacks";
    mod: string;
    min: FxNum;
    props: FxProps;
    perstack?: number;
}

/** Свойства, пока герой стоит на месте дольше delay секунд. */
export interface FxStill extends FxBase {
    t: "still";
    delay: number;
    props: FxProps;
}

/** Дополнительные заряды способности. */
export interface FxCharges extends FxBase {
    t: "charges";
    n: number;
}

/** Возврат перезарядки/маны при применении. */
export interface FxRefund extends FxBase {
    t: "refund";
    chance: number;
    cdpct: FxNum;
    mana?: FxNum;
}

/** Убийство героя (способностью ab, если by="ab"; или в окне после применения ab). */
export interface FxKill extends FxBase {
    t: "kill";
    by: "ab" | "win" | "any";
    win?: FxNum;
    refresh?: string[];
    cdpct?: FxNum;
    heal?: FxNum;
    manapct?: FxNum;
    ext?: { parts: string[]; sec: FxNum };
    /** Постоянные стаки свойств за убийство (perm — переживают смерть). */
    stack?: { props: FxProps; max: number; perm?: number };
}

/** Попадание: урон способностью ab или атакой (by="attack"). */
export interface FxHit extends FxBase, FxActions {
    t: "hit";
    by: "ab" | "attack";
    heroOnly?: number;
    chance?: number;
    /** Каждая N-я атака по одной цели. */
    every?: number;
    /** Только в окне после применения ab (секунды или ключ). */
    win?: FxNum;
    /** Только если цель оглушена / замедлена / ниже % здоровья. */
    cond?: FxCond;
    lowhp?: number;
    /** Не чаще раза в icd секунд на одну цель. */
    icd?: number;
}

/** Повтор урона способности по тем же целям. */
export interface FxEcho extends FxBase {
    t: "echo";
    delays: number[];
    pct: FxNum;
}

/** Взрыв при применении ab: вокруг героя, цели или точки. */
export interface FxBlast extends FxBase {
    t: "blast";
    at: "self" | "target" | "point";
    delay: FxNum;
    radius: FxNum;
    dmg: FxNum;
    type: "magic" | "phys" | "pure";
    debuff?: FxDebuff;
    pfx?: string;
}

/** Отражение урона от героев (всегда или в окне после ab). */
export interface FxTaken extends FxBase {
    t: "taken";
    win?: FxNum;
    reflect: FxNum;
}

/** Дебафф врагам вокруг героя (всегда или в окне после ab). */
export interface FxAura extends FxBase {
    t: "aura";
    heroOnly?: number;
    radius: FxNum;
    win?: FxNum;
    props: FxProps;
}

/** Критический удар (всегда, в окне после ab или по условию). */
export interface FxCrit extends FxBase {
    t: "crit";
    chance: FxNum;
    mult: FxNum;
    win?: FxNum;
    heroOnly?: number;
    lowhp?: number;
}

/** Больше урона по цели в состоянии cond (или ниже lowhp% здоровья). */
export interface FxVs extends FxBase {
    t: "vs";
    pct: FxNum;
    cond?: FxCond;
    lowhp?: number;
    attackOnly?: number;
}

// ---------- Механики (04.11): меняют то, как играется способность ----------

/** Самоприменение: раз в every с способность срабатывает сама по ближайшему врагу в range (бесплатно). */
export interface FxAuto extends FxBase {
    t: "auto";
    every: FxNum;
    range: FxNum;
    heroOnly?: number;
}

/** Мультикаст: с шансом chance% способность срабатывает еще раз через delay с (до times раз подряд). */
export interface FxMulti extends FxBase {
    t: "multi";
    chance: FxNum;
    times?: number;
    delay?: number;
}

/** Рывок после применения: к точке/цели (to) или назад от нее (back). */
export interface FxDash extends FxBase {
    t: "dash";
    dist: FxNum;
    to?: "point" | "target" | "back";
}

/** Притяжение врагов к центру (вокруг героя, точки или цели) при применении. */
export interface FxPull extends FxBase {
    t: "pull";
    at: "self" | "point" | "target";
    radius: FxNum;
    dist: FxNum;
    delay?: FxNum;
    dmg?: FxNum;
    type?: "magic" | "phys" | "pure";
    pfx?: string;
}

/** Иллюзии героя при применении: n штук на dur с, наносят out% урона, получают inc%. */
export interface FxIllusion extends FxBase {
    t: "illusion";
    n: number;
    dur: FxNum;
    out: FxNum;
    inc: FxNum;
}

/** След: пока герой бежит (в окне после применения или всегда), земля жжет врагов. */
export interface FxTrail extends FxBase {
    t: "trail";
    win?: FxNum;
    dps: FxNum;
    radius: number;
    life: number;
    type: "magic" | "phys" | "pure";
    debuff?: FxDebuff;
    pfx?: string;
}

/** Ловушка: при применении в точке (или под героем) — взрыв, когда рядом враг-герой. */
export interface FxTrap extends FxBase {
    t: "trap";
    at: "point" | "self" | "target";
    radius: number;
    arm: number;
    life: number;
    max: number;
    dmg: FxNum;
    type: "magic" | "phys" | "pure";
    debuff?: FxDebuff;
    pfx?: string;
}

/** Призыв союзника на время. */
export interface FxSummon extends FxBase {
    t: "summon";
    unit: string;
    n: number;
    dur: FxNum;
}

/** Обмен местами с целью способности. */
export interface FxSwap extends FxBase {
    t: "swap";
}

/** Гроза: в окне после применения каждые every с молния бьет случайного врага в радиусе. */
export interface FxStorm extends FxBase {
    t: "storm";
    win: FxNum;
    every: number;
    radius: FxNum;
    dmg: FxNum;
    type: "magic" | "phys" | "pure";
    debuff?: FxDebuff;
}

/** Петля времени: через delay с после применения — назад на место применения и pct% потерянного здоровья. */
export interface FxRewind extends FxBase {
    t: "rewind";
    delay: number;
    heal: FxNum;
}

/** Комбо разных собственных заклинаний: окно, общий КД, импульс и временный бафф. */
export interface FxCombo extends FxBase {
    t: "combo";
    abs: string[];
    need: number;
    within: number;
    icd: number;
    radius: FxNum;
    dmg: FxNum;
    dur: FxNum;
    props: FxProps;
}

/** Неподвижная видимая зона; у каждого эффекта не больше одной. Только против настоящих героев. */
export interface FxZone extends FxBase {
    t: "zone";
    at: "self" | "point" | "target";
    radius: number;
    inner?: number;
    dur: FxNum;
    every: number;
    dmg: FxNum;
    /** Первый тик по каждому герою может быть сильнее. */
    entryDmg?: FxNum;
    /** Две сферы с одним тегом оставляют одну область. */
    group?: string;
    debuff?: FxDebuff;
}

/** Связь с одной целью: награда за дистанцию или изоляцию; обрывается при смерти/уходе. */
export interface FxTether extends FxBase {
    t: "tether";
    dur: FxNum;
    delay?: number;
    range: number;
    minDist?: number;
    maxDist: number;
    breakRange: number;
    every: number;
    dmg: FxNum;
    heal?: number;
    isolated?: number;
    targetMod?: string;
    ownerMod?: string;
    /** После этого числа тиков подряд связь наносит один дополнительный разряд. */
    finishTicks?: number;
    finishDmg?: FxNum;
}

/** Видимая, снимаемая метка на герое. Одно из условий расходует её один раз. */
export interface FxMark extends FxBase {
    t: "mark";
    by: "ab" | "cast";
    consume: string[];
    dur: number;
    icd: number;
    arm?: number;
    /** Урон той же способностью должен быть после нового реального применения. */
    nextCast?: boolean;
    /** Подхватывает срабатывание автоприменяемой способности по её штатному дебаффу. */
    nativeMark?: string;
    max: number;
    dmg: FxNum;
    heal?: number;
}

/** После применения накапливает полученный от героев урон и отвечает один раз. */
export interface FxGuard extends FxBase {
    t: "guard";
    win: number;
    thr: number;
    icd: number;
    radius: number;
    dmg: FxNum;
    heal?: number;
    dur: number;
    props: FxProps;
}

/** Два каста с разных точек замыкают линию. Контакт и отход тратят её запас. */
export interface FxWire extends FxBase {
    t: "wire";
    within: number;
    dur: number;
    arm: number;
    icd: number;
    minDist: number;
    maxDist: number;
    radius: number;
    dist: number;
    max: number;
    debuff: FxDebuff;
}

/** Площадка отрыва для одного героя. */
export interface FxSpring extends FxBase {
    t: "spring";
    radius: number;
    dur: number;
    arm: number;
    delay: number;
    dist: number;
    range: number;
    ownerReturn?: boolean;
}

/** Один передаваемый удар Wrath с общим таймером. */
export interface FxThunderball extends FxBase {
    t: "thunderball";
    range: number;
    dur: number;
    delay: number;
    dist: number;
    pct: number;
    bolt?: boolean;
}

export interface FxManeuver extends FxBase {
    t: "maneuver";
    mode: "dagger" | "blindside" | "blade" |
        "burrow" | "sidestep" | "trailhunt" | "reel" | "windlane" | "vault";
    seconds?: number;
    debuff?: FxDebuff;
}

export type FxDef = FxManeuver | FxSpring | FxThunderball | FxWire | FxCombo | FxZone | FxTether | FxMark | FxGuard | FxBuff | FxPassive | FxLowHp | FxStacks | FxStill | FxCharges | FxRefund | FxKill | FxHit | FxEcho |
    FxBlast | FxTaken | FxAura | FxCrit | FxVs | FxAuto | FxMulti | FxDash | FxPull | FxIllusion | FxTrail | FxTrap |
    FxSummon | FxSwap | FxStorm | FxRewind;

/** Эффекты, у которых есть свой модификатор со свойствами (бафф или дебафф). */
export function fxHasModifier(f: FxDef): boolean {
    if (f.t === "mark" || f.t === "guard") return true;
    if (f.t === "combo" || f.t === "wire" || f.t === "thunderball") return true;
    if (f.t === "zone" || f.t === "maneuver") return f.debuff !== undefined;
    if (f.t === "buff" || f.t === "passive" || f.t === "lowhp" || f.t === "stacks" || f.t === "still" || f.t === "aura") return true;
    if (f.t === "kill") return f.stack !== undefined;
    if (f.t === "hit") return f.debuff !== undefined;
    if (f.t === "blast" || f.t === "trail" || f.t === "trap" || f.t === "storm") return f.debuff !== undefined;
    return false;
}

export function fxModifierName(key: string): string {
    return "modifier_orb_fx_" + key;
}
