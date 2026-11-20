"use strict";
// Общие функции интерфейса.
function L(token, ...params) {
    let s = $.Localize(token.startsWith("#") ? token : "#" + token);
    // Подстановка во ВСЕ вхождения (%s1 бывает в строке дважды — например, в подсказке мести)
    params.forEach((p, i) => {
        if (p !== undefined)
            s = s.split("%s" + (i + 1)).join(p);
    });
    return s;
}
function heroLabel(heroName) {
    if (heroName === undefined || heroName === "")
        return "?";
    return $.Localize("#" + heroName);
}
function playerColorCss(pid) {
    const c = Players.GetPlayerColor(pid);
    const r = c & 0xff;
    const g = (c >> 8) & 0xff;
    const b = (c >> 16) & 0xff;
    return "rgb(" + r + "," + g + "," + b + ")";
}
function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
}
/** Корневая панель интерфейса Доты (для поиска ее элементов: миникарта, инвентарь, лента убийств). */
function dotaHudRoot() {
    let p = $.GetContextPanel();
    while (p.GetParent() !== null && p.GetParent() !== undefined)
        p = p.GetParent();
    return p;
}
function dotaHudElement(id) {
    return dotaHudRoot().FindChildTraverse(id);
}
