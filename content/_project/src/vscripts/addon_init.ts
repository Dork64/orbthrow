// addon_init.lua Дота выполняет и на сервере, и на клиенте — привязываем модификаторы и здесь.
// Без привязки на клиенте не видно бонусов сфер в характеристиках и новых чисел в подсказках.
// (addon_game_mode_client.lua оставлен как запасной путь.)

import { linkModifiers } from "./lib/links";

linkModifiers();
print("[orbthrow] addon_init: модификаторы привязаны (" + (IsServer() ? "сервер" : "клиент") + ")");
