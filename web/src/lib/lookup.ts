import {ENS_PARENT} from "./config";

/// What the Lookup field means. A bare integer is a mandate number; anything else
/// is a name, with `.envoyage.eth` appended when it has no dot. Only
/// `<positionId>.envoyage.eth` labels resolve in v0; other names are rejected with
/// a sentence rather than a lookup that quietly finds nothing.
export type LookupTarget =
  | {kind: "mandate"; id: bigint}
  | {kind: "position"; id: bigint; name: string}
  | {kind: "invalid"; reason: string};

export function parseLookup(raw: string, opts: {asName?: boolean} = {}): LookupTarget {
  const input = raw.trim();
  if (!input) return {kind: "invalid", reason: "Type a mandate number or a name."};
  if (/^\d+$/.test(input) && !opts.asName) return {kind: "mandate", id: BigInt(input)};
  const name = input.includes(".") ? input.toLowerCase() : `${input.toLowerCase()}.${ENS_PARENT}`;
  const suffix = `.${ENS_PARENT}`;
  if (!name.endsWith(suffix)) return {kind: "invalid", reason: `Only names under ${ENS_PARENT} resolve here; "${name}" is elsewhere.`};
  const label = name.slice(0, -suffix.length);
  if (!/^\d+$/.test(label)) {
    return {kind: "invalid", reason: `"${name}" is not a mandate name: labels under ${ENS_PARENT} are position numbers, like 38896.${ENS_PARENT}.`};
  }
  return {kind: "position", id: BigInt(label), name};
}
