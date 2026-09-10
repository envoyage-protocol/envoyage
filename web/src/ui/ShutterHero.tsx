import type {ReactNode} from "react";

/// A hand-written stand-in for 21st's "hero-shutter-text": the sentence is
/// rendered once for layout and screen readers, then again in N horizontal
/// slats (clip-path bands) that slide into place with a stagger — the shutter.
/// Under prefers-reduced-motion the slats are not animated and the plain copy
/// is all that shows. The visible copies are aria-hidden.
export function ShutterHero({children, slats = 6, id}: {children: ReactNode; slats?: number; id?: string}) {
  const bands = Array.from({length: slats}, (_, i) => i);
  return (
    <h1 id={id} className="shutter">
      <span className="shutter-plain">{children}</span>
      <span className="shutter-slats" aria-hidden="true">
        {bands.map((i) => {
          const top = (i / slats) * 100;
          const bottom = 100 - ((i + 1) / slats) * 100;
          return (
            <span
              key={i}
              className="shutter-slat"
              style={{
                clipPath: `inset(${top}% 0 ${bottom}% 0)`,
                animationDelay: `${i * 70}ms`,
                ["--from" as string]: i % 2 ? "6%" : "-6%"
              }}
            >
              {children}
            </span>
          );
        })}
      </span>
    </h1>
  );
}
