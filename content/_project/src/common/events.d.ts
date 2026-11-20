// Общие типы событий и сетевых таблиц для сервера (Lua) и интерфейса (Panorama).

interface OrbToastEvent {
    kind: string;      // kill, goal, event, info
    text: string;      // ключ локализации или готовый текст
    p1?: string;       // подстановки
    p2?: string;
    p3?: string;
    player?: PlayerID; // чей портрет показать
}

interface OrbErrorEvent {
    text: string;
}

interface CustomGameEventDeclarations {
    orb_toast: OrbToastEvent;
    orb_error: OrbErrorEvent;
    orb_client_ready: {};
    orb_pick: { seq: number; id: string };
    orb_reroll: { seq: number };
    orb_help: { choice: string };
    orb_settings: { bots?: number };
    orb_start: {};
    /** Голос в лобби: лимит убийств (kills) или время партии в минутах (minutes). */
    orb_vote: { kills?: number; minutes?: number };
    /** Съесть Boots of Travel из инвентаря. */
    orb_eat_travel: {};
    /** Расходник из слота; для варда обязательна точка на земле. */
    orb_slot_use: { kind: string; x?: number; y?: number };
    /** Выбор нейтрального предмета: kind — trinket или enh, name — предмет. */
    orb_neutral_pick: { seq: number; kind: string; name: string };
}

/** Карточка в предложении сфер. */
interface OrbCardNet {
    id: string;
    br: string;      // ветка: Q W E R H, у серых G
    st: number;      // уже взято стаков
    mx: number;      // максимум стаков
    now: string;     // значение сейчас
    nx: string;      // значение после выбора
    ic: string;      // иконка: «a:способность» или «i:предмет»
    m?: number;      // 1 — механика (меняет то, как играется способность)
    rr?: string;     // редкость самой карточки (механика в синем предложении — фиолетовая)
}

interface OrbOfferNet {
    seq: number;
    r: string;       // редкость карточек
    a: string;       // какая сфера получена (если пул пуст — карточки редкостью ниже)
    c: { [i: string]: OrbCardNet };
    t: number;       // секунд до автовыбора
}

/** Сфера Повелителя на земле. */
interface BossOrbNet {
    id: number;
    x: number; y: number; z: number;
    r: string;   // blue / purple
    p: number;   // прогресс захвата 0..1
    h: number;   // кто захватывает (-1 — никто)
    c: number;   // 1 — спор (в круге двое и больше)
    l: number;   // 1 — приземлилась
}

/** Сундук курьера: место падения, курьер, падающий или лежащий сундук. */
interface ChestNet {
    x: number; y: number; z: number;
    st: number;  // 0 — место падения (курьер летит), 1 — падает, 2 — лежит, 3 — курьер с сундуком
    p: number;   // прогресс захвата 0..1
    h: number;   // кто захватывает (-1 — никто)
    c: number;   // 1 — спор
    t: number;   // секунд до падения (для st 0)
}

/** Расходники и нейтральные предметы игрока: orb_items/<номер игрока>. */
interface OrbItemsNet {
    ob: number;   // обсерверы
    se: number;   // сентри
    sm: number;   // дым
    du: number;   // пыль
    tb: number;   // съедено Boots of Travel
    te: number;   // 1 — в инвентаре есть Boots of Travel, можно съесть
    tm: number;   // сколько можно съесть всего
    // Нейтральные предметы
    nk: number;   // жетонов собрано
    nn: number;   // нужно на следующий тир (0 — все взято)
    nx: number;   // следующий тир (6 — пересоздание пятого)
    na: number;   // когда откроется следующий тир (время партии), 0 — уже открыт
    no?: NeutralOfferNet;
}

interface NeutralOfferNet {
    seq: number;
    tier: number;
    tr: { [i: string]: string };  // артефакты на выбор
    en: { [i: string]: string };  // улучшения на выбор
    levels: Record<string, number>; // уровень каждого предложенного улучшения
    pt: string;                   // выбранный артефакт ("" — еще нет)
    pe: string;                   // выбранное улучшение
    t: number;                    // секунд до автовыбора
}

/** Настройки лобби и голосование. */
interface SettingsNet {
    bots: number;
    humans: number;
    goal: number;       // итоговый лимит убийств по голосам
    minutes: number;    // итоговое время по голосам
    left: number;       // секунд до автостарта
    done: number;
    ko: { [i: string]: number };  // варианты лимита убийств
    mo: { [i: string]: number };  // варианты времени, минут
    kv: { [option: string]: number }; // голосов за каждый лимит
    mv: { [option: string]: number }; // голосов за каждое время
    my: { [pid: string]: { k: number; m: number } }; // кто за что голосовал (0 — не голосовал)
    auto: number;       // лимит убийств без голосов (по числу игроков)
}

interface BossNet {
    orbs: { [i: string]: BossOrbNet };
    next: number;   // время следующего броска
    armed: number;  // лидер под угрозой Свержения (-1 — нет)
}

/** Строка итогов партии. */
interface FinalRowNet {
    id: number;
    hero: string;
    place: number;
    k: number; d: number; a: number;
    nw: number;
    left: number;
    bot: number;
    legend: string;
    build: { [i: string]: string };
    titles: { [i: string]: string };
    /** Иконки и редкости сфер билда: id → «a:способность»/«i:предмет», id → редкость. */
    ic: { [id: string]: string };
    rr: { [id: string]: string };
}

/** Сферы игрока: orb_spheres/<номер игрока>. */
interface OrbSphereNet {
    v: number;                          // версия стаков
    pa: number;                         // основной атрибут героя
    st: { [id: string]: number };       // взятые улучшения
    g: number; gn: number; gr: number;  // серая шкала: очки, порог, прирост в секунду
    b: number; bn: number;              // синяя шкала
    p: number; pn: number;              // фиолетовая шкала
    q: { [rarity: string]: number };    // очередь по редкостям
    fr: number;                         // бесплатных перебросов
    cost: number;                       // цена платного переброса
    o?: OrbOfferNet;                    // открытое предложение
    fi?: number;                        // 1 — игрок в бою (окно выбора само не открывается)
}

interface OrbScoreRow {
    id: number;
    team: number;
    hero: string;
    k: number;
    d: number;
    a: number;
    streak: number;
    left: number;      // 0/1
    bot: number;       // 0/1
    place: number;     // итоговое место сейчас
    nw: number;
}

interface OrbGameState {
    phase: string;      // setup, pregame, game, overtime, ended
    goal: number;
    now: number;        // время партии (секунды, без паузы)
    limit: number;      // конец времени
    leader: number;     // id лидера или -1
    winner: number;     // id победителя или -1
    players: number;
    hunted: number;     // кто под охотой (-1 — никто)
}

/** Событие арены: id ("" — нет), on — идет сейчас, left — секунд до конца (или до начала, если on=0), next — до следующего. */
interface ArenaEventNet {
    id: string;
    on: number;
    left: number;
    next: number;
}

interface OrbChargeNet { count: number; max: number; next: number }

interface CustomNetTableDeclarations {
    orb_charges: { [pid: string]: { hero: EntityIndex; abilities: Record<string, OrbChargeNet> } };
    orb_game: {
        state: OrbGameState;
        scores: { [id: string]: OrbScoreRow };
        boss: BossNet;
        revenge: { [pid: string]: { [target: string]: number } };
        help: { [pid: string]: { d: number; g: number } };
        final: { winner: number; reason: string; rows: { [i: string]: FinalRowNet } };
        settings: SettingsNet;
        chest: { list: { [i: string]: ChestNet } };
        event: ArenaEventNet;
    };
    orb_spheres: { [pid: string]: OrbSphereNet };
    orb_items: { [pid: string]: OrbItemsNet };
}
