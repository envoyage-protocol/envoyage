import {useEffect, useRef, type ReactNode} from "react";

/// A wallet-style confirm sheet: what you are about to do, in a sentence, and
/// every transaction it will take, before the first wallet prompt opens.
///
/// Why it enumerates the transactions instead of hiding them. Hiring is three
/// signatures — approve the position to Envoyage, grant the mandate, publish the
/// name — and the wallet WILL prompt three times whatever this screen says. The
/// tempting simplification is to present it as one action; that does not remove
/// the three prompts, it just means the second one arrives unannounced, which is
/// exactly when a user assumes something has gone wrong and rejects it. Naming
/// them up front is what makes the second and third prompt legible.
///
/// The steps listed are the ones actually planned for THIS position — a position
/// that is already approved shows two, one carrying a revoked name shows four —
/// so the sheet never promises a transaction that will not happen, or omits one
/// that will.
export function ConfirmSheet({
  open,
  title,
  body,
  steps,
  note,
  cta,
  tone = "primary",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  steps?: string[];
  note?: ReactNode;
  cta: string;
  tone?: "primary" | "hostile";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      // A confirm sheet the keyboard can tab out of is not a confirm sheet: the
      // focus would land on the page behind it while the overlay still covers it.
      if (e.key !== "Tab" || !panel.current) return;
      const f = panel.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreTo.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <div className="confirm-head">
          <h2>{title}</h2>
          <button className="confirm-x" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="confirm-body">
          <p className="confirm-sentence">{body}</p>
          {steps && steps.length > 0 && (
            <div className="confirm-steps">
              <span className="confirm-steps-cap">
                your wallet will ask you to sign, in order — {steps.length} transaction{steps.length === 1 ? "" : "s"}
              </span>
              <ol>
                {steps.map((s, i) => (
                  <li key={i}>
                    <span className="num">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {note && <p className="confirm-note">{note}</p>}
        </div>
        <div className="confirm-foot">
          <button className="act act-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={tone === "hostile" ? "act act-hostile" : "act act-primary"} onClick={onConfirm}>
            {cta}
          </button>
        </div>
      </div>
    </div>
  );
}
