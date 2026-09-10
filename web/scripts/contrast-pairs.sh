#!/bin/sh
# Every text/graphic pair the stylesheet uses, with the WCAG minimum it must meet.
# Run: sh web/scripts/contrast-pairs.sh   (exit 1 if any pair fails)
cd "$(dirname "$0")" && node contrast.mjs \
  "#1A1612,#FBF8F1,ink on paper" \
  "#1A1612,#EDE7DB,ink on desk" \
  "#5C554A,#FBF8F1,muted on paper" \
  "#5C554A,#EDE7DB,muted on desk" \
  "#9A4600,#FBF8F1,amber text on paper" \
  "#9A4600,#EDE7DB,amber text on desk" \
  "#C24E00,#FBF8F1,seal amber on paper (graphic / large text),3" \
  "#C24E00,#EDE7DB,seal amber on desk (graphic),3" \
  "#8A1E12,#FBF8F1,red ink on paper" \
  "#8A1E12,#EDE7DB,red ink on desk" \
  "#FBF8F1,#1A1612,paper on ink button" \
  "#FBF8F1,#C24E00,paper on seal-amber button" \
  "#FBF8F1,#8A1E12,paper on red button" \
  "#1A1612,#FCE7D2,ink on amber tint" \
  "#5C554A,#FCE7D2,muted on amber tint" \
  "#9A4600,#FCE7D2,amber text on amber tint"
