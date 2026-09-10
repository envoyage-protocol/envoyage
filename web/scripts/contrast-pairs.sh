#!/bin/sh
# Every text/graphic pair the stylesheet uses, with the WCAG minimum it must meet.
# Palette is ink + paper (sheet and desk) + one amber; nothing else is coloured.
# Run: sh web/scripts/contrast-pairs.sh   (exit 1 if any pair fails)
cd "$(dirname "$0")" && node contrast.mjs \
  "#1A1612,#FBF8F1,ink on paper" \
  "#1A1612,#EDE7DB,ink on desk" \
  "#5C554A,#FBF8F1,muted on paper" \
  "#5C554A,#EDE7DB,muted on desk" \
  "#A34800,#FBF8F1,amber text on paper" \
  "#A34800,#EDE7DB,amber text on desk" \
  "#A34800,#FBF8F1,amber seal / strike on paper (graphic),3" \
  "#FBF8F1,#1A1612,paper on ink button" \
  "#FBF8F1,#A34800,paper on amber button" \
  "#1A1612,#FBF8F1,ink on hostile button paper,4.5" \
  "#A34800,#FBF8F1,amber border on paper (graphic),3" \
  "#CFC6B4,#FBF8F1,rule on paper decorative,1" \
  "#5C554A,#EDE7DB,muted on desk (outcome panel)"
