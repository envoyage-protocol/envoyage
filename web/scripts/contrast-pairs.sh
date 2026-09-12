#!/bin/sh
# Every text/graphic pair the stylesheet uses, in BOTH colour schemes, with the
# WCAG minimum it must meet. Run: sh web/scripts/contrast-pairs.sh (exit 1 on fail)
#
# Tokens (see styles.css :root / prefers-color-scheme: dark):
#                light      dark
#   --paper      #FFFFFF    #000000    page ground
#   --well       #F6F6F4    #111110    recessed panel
#   --wash       #FFF3E0    #241708    amber tint
#   --ink        #000000    #EDEDEA    body text
#   --ink2       #4A4A47    #A3A39E    secondary text
#   --amber      #F08A00    #FFA02E    BUTTON FILL ONLY — 2.52:1 on white, never text
#   --amberink   #8A4A00    #FFC061    amber as TEXT
#   --ambermark  #C46A00    #FFA02E    amber as a MEANINGFUL MARK (dot, active rule)
#   --ok/--warn/--bad, --uni/--graph/--ens as below
#
# Why --ambermark exists: --amber is 2.52:1 on white, so a 9px status dot or the
# 2px active-nav underline drawn in it fails 1.4.11 in light mode. Dark is fine
# (10.32:1), but a token that is only safe in one theme is not a token. Measured,
# not assumed — #C46A00 clears 3:1 on paper, well AND wash.
#
# NB: a label may not contain a comma. contrast.mjs splits each argument on ",",
# so a comma inside the label lands in the `min` slot, becomes NaN, and the pair
# FAILS with a passing ratio printed beside it — confusing, but at least loud.
#
# NOT listed, deliberately: --rule and --soft hairlines. They are decorative
# separators between already-separated content, not meaningful non-text content,
# so 1.4.11 does not apply. Listing them at a lowered minimum would be gaming the
# check rather than passing it.
cd "$(dirname "$0")" && node contrast.mjs \
  "#000000,#FFFFFF,light ink on paper" \
  "#000000,#F6F6F4,light ink on well" \
  "#000000,#FFF3E0,light ink on wash" \
  "#4A4A47,#FFFFFF,light ink2 on paper" \
  "#4A4A47,#F6F6F4,light ink2 on well" \
  "#4A4A47,#FFF3E0,light ink2 on wash" \
  "#8A4A00,#FFFFFF,light amber text on paper" \
  "#8A4A00,#F6F6F4,light amber text on well" \
  "#8A4A00,#FFF3E0,light amber text on wash" \
  "#0E7A3C,#FFFFFF,light ok on paper" \
  "#0E7A3C,#F6F6F4,light ok on well — calldata honest recipient" \
  "#B3261E,#F6F6F4,light bad on well — calldata theft recipient" \
  "#9A5B00,#FFFFFF,light warn on paper" \
  "#B3261E,#FFFFFF,light bad on paper" \
  "#B3261E,#FFF3E0,light bad on wash" \
  "#C2185B,#FFFFFF,light uniswap edge label on paper" \
  "#5B3BE0,#FFFFFF,light graph edge label on paper" \
  "#1F6FD0,#FFFFFF,light ens edge label on paper" \
  "#000000,#F08A00,light black on amber button" \
  "#FFFFFF,#000000,light paper on ink button" \
  "#C46A00,#FFFFFF,light amber mark on paper (graphic),3" \
  "#C46A00,#F6F6F4,light amber mark on well (graphic),3" \
  "#C46A00,#FFF3E0,light amber mark on wash (graphic),3" \
  "#0E7A3C,#FFFFFF,light ok dot on paper (graphic),3" \
  "#B3261E,#FFFFFF,light bad dot on paper (graphic),3" \
  "#C2185B,#FFFFFF,light uniswap edge on paper (graphic),3" \
  "#5B3BE0,#FFFFFF,light graph edge on paper (graphic),3" \
  "#1F6FD0,#FFFFFF,light ens edge on paper (graphic),3" \
  "#EDEDEA,#000000,dark ink on paper" \
  "#EDEDEA,#111110,dark ink on well" \
  "#EDEDEA,#241708,dark ink on wash" \
  "#A3A39E,#000000,dark ink2 on paper" \
  "#A3A39E,#111110,dark ink2 on well" \
  "#A3A39E,#241708,dark ink2 on wash" \
  "#FFC061,#000000,dark amber text on paper" \
  "#FFC061,#111110,dark amber text on well" \
  "#FFC061,#241708,dark amber text on wash" \
  "#4FD684,#000000,dark ok on paper" \
  "#4FD684,#111110,dark ok on well — calldata honest recipient" \
  "#FF7A70,#111110,dark bad on well — calldata theft recipient" \
  "#F2B04F,#000000,dark warn on paper" \
  "#FF7A70,#000000,dark bad on paper" \
  "#FF7A70,#241708,dark bad on wash" \
  "#FF6FA8,#000000,dark uniswap edge label on paper" \
  "#9B85FF,#000000,dark graph edge label on paper" \
  "#6FB0F7,#000000,dark ens edge label on paper" \
  "#000000,#FFA02E,dark black on amber button" \
  "#000000,#EDEDEA,dark paper on ink button" \
  "#FFA02E,#000000,dark amber mark on paper (graphic),3" \
  "#FFA02E,#111110,dark amber mark on well (graphic),3" \
  "#FFA02E,#241708,dark amber mark on wash (graphic),3" \
  "#4FD684,#000000,dark ok dot on paper (graphic),3" \
  "#FF7A70,#000000,dark bad dot on paper (graphic),3" \
  "#FF6FA8,#000000,dark uniswap edge on paper (graphic),3" \
  "#9B85FF,#000000,dark graph edge on paper (graphic),3" \
  "#6FB0F7,#000000,dark ens edge on paper (graphic),3"
