import {BigInt, Address, Bytes, store} from "@graphprotocol/graph-ts";
import {Approval, ApprovalForAll} from "../generated/PositionManager/PositionManager";
import {Delegate, BlanketApproval, PositionApproval, Census} from "../generated/schema";

/// The Envoyage deployment. An approval pointing here is scoped; one pointing anywhere
/// else is not, and that single comparison is the whole point of this data source.
// Envoyage on Sepolia. On the mainnet deployment of this same handler nothing
// matches, so activeScopedApprovals is 0 there — which is the true figure: no
// scoped alternative exists on mainnet yet. That zero is the point of the census.
const ENVOYAGE = "0x8466e82e02edf3f00c0387d5c3e66d407dc7259c";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const CENSUS_ID = "census";

function census(): Census {
  let c = Census.load(CENSUS_ID);
  if (c == null) {
    c = new Census(CENSUS_ID);
    c.activeBlanketApprovals = 0;
    c.activePositionApprovals = 0;
    c.activeScopedApprovals = 0;
    c.activeUnscopedApprovals = 0;
    c.distinctDelegates = 0;
    c.totalApprovalEvents = 0;
  }
  return c as Census;
}

function delegate(addr: Address, ts: BigInt, c: Census): Delegate {
  let id = addr.toHexString();
  let d = Delegate.load(id);
  if (d == null) {
    d = new Delegate(id);
    d.blanketGrants = 0;
    d.positionGrants = 0;
    d.scopedGrants = 0;
    d.firstSeenAt = ts;
    c.distinctDelegates = c.distinctDelegates + 1;
  }
  d.lastSeenAt = ts;
  return d as Delegate;
}

/// @notice ApprovalForAll — the dangerous one.
///
/// @dev This is not "a keeper may touch this position". It is "this address may act on
///      EVERY position I hold, now and in future, without bound". It is the shape
///      behind the Aperture Finance drain, and it is what Envoyage exists to make
///      unnecessary. Counted separately from single-position approvals because the
///      blast radius is categorically different.
export function handleApprovalForAll(event: ApprovalForAll): void {
  let c = census();
  let d = delegate(event.params.operator, event.block.timestamp, c);

  let id = event.params.owner.toHexString() + "-" + event.params.operator.toHexString();
  let b = BlanketApproval.load(id);

  if (event.params.approved) {
    if (b == null) {
      b = new BlanketApproval(id);
      b.owner = event.params.owner;
      b.delegate = d.id;
      b.grantedAt = event.block.timestamp;
      b.grantedTx = event.transaction.hash;
      c.activeBlanketApprovals = c.activeBlanketApprovals + 1;
      d.blanketGrants = d.blanketGrants + 1;
    } else if (!b.active) {
      // Re-granted after revocation. Counted again, because the exposure is live
      // again — but the entity keeps its original grantedAt so the history is honest.
      c.activeBlanketApprovals = c.activeBlanketApprovals + 1;
      d.blanketGrants = d.blanketGrants + 1;
    }
    b.active = true;
    b.revokedAt = null;
  } else {
    // Revoking an approval that was never granted is a no-op on chain and must be a
    // no-op here. Decrementing on it would drive the count negative.
    if (b != null && b.active) {
      b.active = false;
      b.revokedAt = event.block.timestamp;
      c.activeBlanketApprovals = c.activeBlanketApprovals - 1;
      d.blanketGrants = d.blanketGrants - 1;
    }
    if (b == null) {
      b = new BlanketApproval(id);
      b.owner = event.params.owner;
      b.delegate = d.id;
      b.grantedAt = event.block.timestamp;
      b.grantedTx = event.transaction.hash;
      b.active = false;
      b.revokedAt = event.block.timestamp;
    }
  }

  b.save();
  d.save();
  c.totalApprovalEvents = c.totalApprovalEvents + 1;
  c.save();
}

/// @notice Single-position ERC-721 approval.
///
/// @dev ERC-721 approve(address(0), tokenId) CLEARS the approval, and a transfer
///      clears it implicitly too. Treating address(0) as just another delegate would
///      invent a delegate that holds thousands of grants and never acts — so the zero
///      address is handled as a revocation, not as an approval to nobody.
export function handleApproval(event: Approval): void {
  let c = census();
  let id = event.params.id.toString();
  let p = PositionApproval.load(id);
  let spender = event.params.spender;
  let clearing = spender.toHexString() == ZERO_ADDR;

  // Undo whatever the previous state contributed before applying the new one.
  if (p != null && p.active) {
    c.activePositionApprovals = c.activePositionApprovals - 1;
    if (p.scoped) c.activeScopedApprovals = c.activeScopedApprovals - 1;
    else c.activeUnscopedApprovals = c.activeUnscopedApprovals - 1;

    let prev = Delegate.load(p.delegate);
    if (prev != null) {
      prev.positionGrants = prev.positionGrants - 1;
      if (p.scoped) prev.scopedGrants = prev.scopedGrants - 1;
      prev.save();
    }
  }

  if (p == null) {
    p = new PositionApproval(id);
    p.tokenId = event.params.id;
  }
  p.owner = event.params.owner;
  p.updatedAt = event.block.timestamp;
  p.updatedTx = event.transaction.hash;

  if (clearing) {
    p.active = false;
    p.scoped = false;
    // Point at the zero address rather than leaving a dangling reference; it is never
    // counted, because the branch above only runs for active approvals.
    let z = delegate(spender, event.block.timestamp, c);
    z.save();
    p.delegate = z.id;
  } else {
    let d = delegate(spender, event.block.timestamp, c);
    let scoped = spender.toHexString() == ENVOYAGE;

    p.active = true;
    p.scoped = scoped;
    p.delegate = d.id;

    d.positionGrants = d.positionGrants + 1;
    if (scoped) d.scopedGrants = d.scopedGrants + 1;
    d.save();

    c.activePositionApprovals = c.activePositionApprovals + 1;
    if (scoped) c.activeScopedApprovals = c.activeScopedApprovals + 1;
    else c.activeUnscopedApprovals = c.activeUnscopedApprovals + 1;
  }

  p.save();
  c.totalApprovalEvents = c.totalApprovalEvents + 1;
  c.save();
}
