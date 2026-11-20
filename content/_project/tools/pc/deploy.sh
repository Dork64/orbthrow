#!/bin/bash
# Выкладка сборки на ПК (запускается в оболочке, где подключены папки Доты).
M=$HOME/mnt; G="$M/game--dota_addons/orbthrow"; C="$M/content--dota_addons/orbthrow"; OT="$M/game--dota_addons/overthrow"
mkdir -p "$G" "$C"
if [ ! -f "$G/maps/forest_solo.vpk" ]; then
  mkdir -p "$G/maps" "$G/resource/overviews" "$G/panorama"
  cp "$OT/maps/forest_solo.vpk" "$G/maps/" && cp "$OT/resource/overviews/forest_solo.txt" "$G/resource/overviews/"
  for d in materials models particles soundevents; do cp -r "$OT/$d" "$G/"; done
  cp -r "$OT/panorama/images" "$G/panorama/" 2>/dev/null
  echo "ассеты Valve скопированы"
fi
rm -rf /tmp/orbdeploy && mkdir -p /tmp/orbdeploy && cd /tmp/orbdeploy && unzip -q -o "$C/_deploy/orbthrow_deploy.zip" && cp -r game/. "$G/" && cp -r content/. "$C/"
cp "$C/_project/tools/pc/"*.bat "$C/" 2>/dev/null
echo "выложено: $(cat "$C/_project/BUILD_VERSION.txt")"
