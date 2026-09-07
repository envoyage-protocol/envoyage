import {parseAbiItem} from "viem";

export const MANDATES = parseAbiItem(
  "function mandates(uint256) view returns (address keeper, address grantor, uint256 tokenId, uint16 maxFeeBps, address feeRecipient, uint64 expiry, uint64 minInterval, uint64 lastCall, bool compoundAllowed)"
);
export const CAN_COMPOUND = parseAbiItem("function canCompound(uint256) view returns (bytes4)");
export const COMPOUND = parseAbiItem("function compound(uint256 mandateId, uint256 minFee)");
export const NEXT_MANDATE_ID = parseAbiItem("function nextMandateId() view returns (uint256)");
/// ENS side. The keeper holds ROLE_SET_TEXT on exactly ONE key, so this is the only
/// resolver call it can make — writing any other key reverts EACUnauthorizedAccountRoles.
export const SET_TEXT = parseAbiItem("function setText(bytes32 node, string key, string value)");
export const NODE_FOR = parseAbiItem("function nodeFor(uint256 positionId) view returns (bytes32)");
export const KEEPER_KEY = "envoyage:lastRun";

export const MANDATE_GRANTED = parseAbiItem(
  "event MandateGranted(uint256 indexed id, address indexed keeper, uint256 indexed tokenId)"
);

/// Selector -> human reason, derived rather than hard-coded. See web/README.md for
/// why: written-down selectors were wrong four times out of six, and a wrong one is
/// invisible — it reads as "unknown" while the contract is entirely correct.
export const REFUSALS = [
  "MandateInactive()",
  "NotKeeper()",
  "CompoundNotAllowed()",
  "MandateExpired()",
  "CooldownActive()",
  "OwnerChanged()"
] as const;

/// Errors compound() can revert with that canCompound() cannot predict, because they
/// depend on how much has accrued rather than on the mandate's terms. Decoded so the
/// log says FeeBelowMinimum instead of a truncated viem sentence — the difference
/// between "the keeper is working correctly" and "something is broken" during a demo.
export const EXECUTION_ERRORS = [
  "FeeBelowMinimum()",
  "ZeroLiquidityDelta()",
  "ResidualBalance()",
  "TransferFailed()",
  "Reentrancy()",
  "NotPositionOwner()"
] as const;
