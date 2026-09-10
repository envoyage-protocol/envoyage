import type {Address} from "viem";
import {ENS_PARENT} from "../lib/config";
import {Addr, Seal, Sponsor} from "./kit";

export type PreviewTerms = {
  tokenId: bigint | null;
  keeper: Address;
  feeRecipient: Address;
  maxFeeBps: number;
  minInterval: bigint;
  expiry: bigint;
  compoundAllowed: boolean;
};

const fmtDate = (t: bigint) => (t === 0n ? "—" : new Date(Number(t) * 1000).toISOString().slice(0, 10));
const fmtInterval = (s: bigint) => {
  const n = Number(s);
  if (n === 0) return "no cooldown";
  if (n % 3600 === 0) return `${n / 3600} h`;
  if (n % 60 === 0) return `${n / 60} min`;
  return `${n} s`;
};

/// The mandate as an instrument: what the keeper may and may not do. Used live by
/// the hire form (updates as terms change), by Lookup (from resolver records), and
/// by the completion screen. `status` drives the seal and the strikes.
export function MandatePreview({
  terms,
  status = "draft",
  mandateId,
  docket
}: {
  terms: PreviewTerms;
  status?: "draft" | "in-force" | "revoked";
  mandateId?: bigint | null;
  docket?: string;
}) {
  const revoked = status === "revoked";
  const name = terms.tokenId !== null ? `${terms.tokenId}.${ENS_PARENT}` : `<position>.${ENS_PARENT}`;
  return (
    <article className="sheet preview" data-state={revoked ? "revoked" : "in-force"} aria-label="Mandate preview">
      {revoked && (
        <span className="stamp-revoked" aria-hidden="true">
          Revoked
        </span>
      )}
      <div className="docket">
        <span>
          <span className="caps">{mandateId ? `Mandate No. ${mandateId}` : status === "draft" ? "Draft mandate" : "Mandate"}</span>
          {docket ? ` · ${docket}` : ""}
        </span>
        <span>
          {status === "draft" ? "not yet signed" : revoked ? "revoked by the owner" : `in force until ${fmtDate(terms.expiry)}`}
        </span>
      </div>
      <h3 className="instrument-title" style={{fontSize: "clamp(22px, 3vw, 32px)"}}>
        Limited power of attorney over Uniswap v4 position {terms.tokenId !== null ? `No. ${terms.tokenId}` : "(choose one)"}
      </h3>
      <p className="instrument-sub">
        Attorney-in-fact <Addr addr={terms.keeper} /> (the bot) · paid to <Addr addr={terms.feeRecipient} /> · published as{" "}
        <b>{name}</b> <Sponsor name="ENS" />
      </p>

      <div className="articles" style={{marginTop: 24}}>
        <div className="article">
          <h3 className="caps">Article 1 · May</h3>
          <p>The bot may</p>
          <ol className="clauses">
            <li className="clause">
              <span className="no">1.1</span>
              <span className="text">
                {terms.compoundAllowed ? (
                  <>
                    Call <strong>compound</strong>: harvest this position's fees and reinvest them into the same position. <Sponsor name="Uniswap" />
                  </>
                ) : (
                  "Nothing: compounding is not permitted."
                )}
              </span>
            </li>
            <li className="clause">
              <span className="no">1.2</span>
              <span className="text">
                Keep at most <span className="num">{(terms.maxFeeBps / 100).toFixed(2)}%</span> of the <strong>fees harvested</strong> — never any part of the position.
              </span>
            </li>
            <li className="clause">
              <span className="no">1.3</span>
              <span className="text">
                Act at most once every <span className="num">{fmtInterval(terms.minInterval)}</span>{terms.minInterval > 0n ? " (the first compound is exempt)" : ""}.
              </span>
            </li>
            <li className="clause">
              <span className="no">1.4</span>
              <span className="text">
                Act until <span className="num">{fmtDate(terms.expiry)}</span>, or until you revoke, whichever comes first.
              </span>
            </li>
          </ol>
        </div>
        <div className="article">
          <h3 className="caps">Article 2 · May not</h3>
          <p>The bot may not</p>
          <ol className="clauses">
            <li className="clause struck">
              <span className="no">2.1</span>
              <span className="text">
                <span>Withdraw liquidity.</span>
                <span className="why">No function accepts an instruction list.</span>
              </span>
            </li>
            <li className="clause struck">
              <span className="no">2.2</span>
              <span className="text">
                <span>Choose where anything goes.</span>
                <span className="why">The recipient is fixed at grant.</span>
              </span>
            </li>
            <li className="clause struck">
              <span className="no">2.3</span>
              <span className="text">
                <span>Swap, move the range, or touch another position.</span>
                <span className="why">Only compound exists.</span>
              </span>
            </li>
            <li className="clause struck">
              <span className="no">2.4</span>
              <span className="text">
                <span>Keep acting after the position is sold.</span>
                <span className="why">Every call checks the owner.</span>
              </span>
            </li>
            <li className="clause struck">
              <span className="no">2.5</span>
              <span className="text">
                <span>Change any of the above.</span>
                <span className="why">No admin, no upgrade path.</span>
              </span>
            </li>
          </ol>
        </div>
      </div>

      <div className="attest" style={{marginTop: 24}}>
        <p className="how" style={{margin: 0}}>
          {status === "draft"
            ? "Signing grants exactly this and nothing else. You can revoke at any time from My mandates."
            : revoked
              ? "Every clause is struck: the owner revoked this mandate. The name keeps resolving as a historical record."
              : "Every line is enforced by the contract, not promised by the bot."}
        </p>
        <Seal
          off={revoked}
          centre={status === "draft" ? "Draft" : revoked ? "Revoked" : "In force"}
          rim={status === "draft" ? "Envoyage · Sepolia · not yet signed · " : revoked ? `Envoyage · Sepolia · mandate ${mandateId ?? ""} · revoked · ` : `Envoyage · Sepolia · in force until ${fmtDate(terms.expiry)} · `}
        />
      </div>
    </article>
  );
}
