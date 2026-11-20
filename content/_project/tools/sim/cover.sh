#!/bin/bash
# Какие модификаторы эффектов сфер ни разу не появились в партиях симулятора: tools/sim/cover.sh [партий]
cd "$(dirname "$0")/../.."
N=${1:-40}
T=$(mktemp -d)
seq 1 "$N" | xargs -P "$(nproc)" -I{} sh -c "SIM_COVER=1 luajit tools/sim/sim.lua build/game/scripts/vscripts .sim 40 {} 2>&1 | grep 'эффекты героев' > $T/{}.txt"
cat $T/*.txt | grep -o "fx_[a-z_0-9]*=" | sed 's/=//' | sort -u > $T/seen
grep -o 'modifier_orb_fx_[a-z_0-9]* = ' src/vscripts/modifiers/modifier_orb_fx.ts | sed 's/modifier_orb_//; s/ = //' | sort -u > $T/all
echo "модификаторов эффектов: $(wc -l < $T/all), появились: $(wc -l < $T/seen)"
echo "не появились:"; comm -23 $T/all $T/seen | tr '\n' ' '; echo
rm -rf "$T"
