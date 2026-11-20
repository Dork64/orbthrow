#!/bin/bash
# Прогон симулятора на многих партиях параллельно: tools/sim/many.sh [первая] [последняя] [минут]
# Печатает строку итога каждой партии и все ошибки. Код выхода 1, если ошибки были.
cd "$(dirname "$0")/../.."
FROM=${1:-1}; TO=${2:-40}; MIN=${3:-40}
OUT=$(mktemp -d)
seq "$FROM" "$TO" | xargs -P "$(nproc)" -I{} sh -c "luajit tools/sim/sim.lua build/game/scripts/vscripts .sim $MIN {} > $OUT/{}.log 2>&1"
bad=0
for s in $(seq "$FROM" "$TO"); do
  line=$(grep -m1 "^симуляция" "$OUT/$s.log" | sed 's/, модификаторов создано.*//')
  if grep -q "ОШИБ" "$OUT/$s.log"; then
    bad=1
    echo "$line — ОШИБКИ:"
    grep "ОШИБКА" "$OUT/$s.log" | sort | uniq -c | sort -rn | head -5
  else
    echo "$line — ок"
  fi
done
rm -rf "$OUT"
exit $bad
