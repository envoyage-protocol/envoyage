#!/bin/sh
# Every text/graphic pair the stylesheet uses, in BOTH colour schemes, with the
# WCAG minimum it must meet. Tokens are the 21st "Amber Minimal" palette mapped
# onto ink / paper / desk / amber (text) / amber-fill (buttons only).
# Run: sh web/scripts/contrast-pairs.sh   (exit 1 if any pair fails)
cd "$(dirname "$0")" && node contrast.mjs \
  "#262626,#FFFFFF,light ink on paper" \
  "#262626,#F9FAFB,light ink on desk" \
  "#6B7280,#FFFFFF,light muted on paper" \
  "#6B7280,#F9FAFB,light muted on desk" \
  "#92400E,#FFFFFF,light amber text on paper" \
  "#92400E,#F9FAFB,light amber text on desk" \
  "#92400E,#FFFFFF,light amber strike / seal on paper (graphic),3" \
  "#FFFFFF,#262626,light paper on ink button" \
  "#000000,#F59E0B,light black on amber-fill button" \
  "#262626,#FFFBEB,light ink on amber tint" \
  "#6B7280,#FFFBEB,light muted on amber tint" \
  "#262626,#FFFFFF,light ink edge of the amber-fill button on paper,3" \
  "#E5E5E5,#262626,dark ink on paper" \
  "#E5E5E5,#171717,dark ink on desk" \
  "#A3A3A3,#262626,dark muted on paper" \
  "#A3A3A3,#171717,dark muted on desk" \
  "#FBBF24,#262626,dark amber text on paper" \
  "#FBBF24,#171717,dark amber text on desk" \
  "#262626,#E5E5E5,dark paper on ink button" \
  "#000000,#F59E0B,dark black on amber-fill button" \
  "#E5E5E5,#3A2A0A,dark ink on amber tint" \
  "#A3A3A3,#3A2A0A,dark muted on amber tint" \
  "#E5E5E5,#262626,dark ink edge of the amber-fill button on paper,3"
