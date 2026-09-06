import {BigInt, Bytes, Address} from "@graphprotocol/graph-ts";
import {
  MandateGranted,
  MandateExecuted,
  MandateRevoked,
  Envoyage as EnvoyageContract
} from "../generated/Envoyage/Envoyage";
import {Mandate, Execution, Keeper, Position, Protocol} from "../generated/schema";

const PROTOCOL_ID = "envoyage";
const ZERO = BigInt.fromI32(0);

function protocol(): Protocol {
  let p = Protocol.load(PROTOCOL_ID);
  if (p == null) {
    p = new Protocol(PROTOCOL_ID);
    p.mandateCount = 0;
    p.activeMandateCount = 0;
    p.revokedMandateCount = 0;
    p.executionCount = 0;
    p.keeperCount = 0;
    p.positionCount = 0;
    p.totalLiquidityAdded = ZERO;
    p.totalFee0ToKeepers = ZERO;
    p.totalFee1ToKeepers = ZERO;
  }
  return p as Protocol;
}

function keeper(addr: Address, ts: BigInt, p: Protocol): Keeper {
  let id = addr.toHexString();
  let k = Keeper.load(id);
  if (k == null) {
    k = new Keeper(id);
    k.mandateCount = 0;
    k.activeMandateCount = 0;
    k.executionCount = 0;
    k.totalFee0Earned = ZERO;
    k.totalFee1Earned = ZERO;
    k.totalLiquidityAdded = ZERO;
    k.firstSeenAt = ts;
    p.keeperCount = p.keeperCount + 1;
  }
  return k as Keeper;
}

function position(tokenId: BigInt, p: Protocol): Position {
  let id = tokenId.toString();
  let pos = Position.load(id);
  if (pos == null) {
    pos = new Position(id);
    pos.tokenId = tokenId;
    pos.mandateCount = 0;
    pos.hasActiveMandate = false;
    pos.totalLiquidityAdded = ZERO;
    p.positionCount = p.positionCount + 1;
  }
  return pos as Position;
}

export function handleMandateGranted(event: MandateGranted): void {
  let p = protocol();
  let k = keeper(event.params.keeper, event.block.timestamp, p);
  let pos = position(event.params.tokenId, p);

  let m = new Mandate(event.params.id.toString());
  m.mandateId = event.params.id;
  m.keeper = k.id;
  m.position = pos.id;
  m.status = "ACTIVE";
  m.grantedAt = event.block.timestamp;
  m.grantedAtBlock = event.block.number;
  m.grantedTx = event.transaction.hash;
  m.executionCount = 0;
  m.totalFee0ToKeeper = ZERO;
  m.totalFee1ToKeeper = ZERO;
  m.totalLiquidityAdded = ZERO;

  // MandateGranted carries only (id, keeper, tokenId). The scope — fee cap, expiry,
  // cooldown, feeRecipient, grantor — is the whole point of this subgraph and is not
  // in any event, so it is read from contract storage at this block.
  //
  // try_ rather than a plain call: a failed eth_call would otherwise halt indexing.
  // If it fails, the mandate is still recorded with the scope fields defaulted and
  // compoundAllowed=false, which is the conservative direction — it under-states
  // what the keeper may do rather than over-stating it.
  let contract = EnvoyageContract.bind(event.address);
  let res = contract.try_mandates(event.params.id);
  if (!res.reverted) {
    m.grantor = res.value.getGrantor();
    m.maxFeeBps = res.value.getMaxFeeBps();
    m.feeRecipient = res.value.getFeeRecipient();
    m.expiry = res.value.getExpiry();
    m.minInterval = res.value.getMinInterval();
    m.compoundAllowed = res.value.getCompoundAllowed();
  } else {
    m.grantor = Bytes.empty();
    m.maxFeeBps = 0;
    m.feeRecipient = Bytes.empty();
    m.expiry = ZERO;
    m.minInterval = ZERO;
    m.compoundAllowed = false;
  }
  m.save();

  k.mandateCount = k.mandateCount + 1;
  k.activeMandateCount = k.activeMandateCount + 1;
  k.save();

  pos.mandateCount = pos.mandateCount + 1;
  pos.hasActiveMandate = true;
  pos.save();

  p.mandateCount = p.mandateCount + 1;
  p.activeMandateCount = p.activeMandateCount + 1;
  p.save();
}

export function handleMandateExecuted(event: MandateExecuted): void {
  let m = Mandate.load(event.params.id.toString());
  // A mandate cannot execute before it is granted, so a miss here means the
  // startBlock is wrong or the entity was never written. Return rather than create a
  // synthetic parent, which would silently invent a mandate with no scope.
  if (m == null) return;

  let p = protocol();
  let liq = event.params.liquidityAdded;
  let fee0 = event.params.fee0Paid;
  let fee1 = event.params.fee1Paid;

  let e = new Execution(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  e.mandate = m.id;
  e.keeper = m.keeper;
  e.fee0ToKeeper = fee0;
  e.fee1ToKeeper = fee1;
  e.liquidityAdded = liq;
  e.timestamp = event.block.timestamp;
  e.block = event.block.number;
  e.tx = event.transaction.hash;
  e.caller = event.transaction.from;
  e.save();

  m.executionCount = m.executionCount + 1;
  m.lastExecutedAt = event.block.timestamp;
  m.totalFee0ToKeeper = m.totalFee0ToKeeper.plus(fee0);
  m.totalFee1ToKeeper = m.totalFee1ToKeeper.plus(fee1);
  m.totalLiquidityAdded = m.totalLiquidityAdded.plus(liq);
  m.save();

  let k = Keeper.load(m.keeper);
  if (k != null) {
    k.executionCount = k.executionCount + 1;
    k.totalFee0Earned = k.totalFee0Earned.plus(fee0);
    k.totalFee1Earned = k.totalFee1Earned.plus(fee1);
    k.totalLiquidityAdded = k.totalLiquidityAdded.plus(liq);
    k.save();
  }

  let pos = Position.load(m.position);
  if (pos != null) {
    pos.totalLiquidityAdded = pos.totalLiquidityAdded.plus(liq);
    pos.save();
  }

  p.executionCount = p.executionCount + 1;
  p.totalLiquidityAdded = p.totalLiquidityAdded.plus(liq);
  p.totalFee0ToKeepers = p.totalFee0ToKeepers.plus(fee0);
  p.totalFee1ToKeepers = p.totalFee1ToKeepers.plus(fee1);
  p.save();
}

export function handleMandateRevoked(event: MandateRevoked): void {
  let m = Mandate.load(event.params.id.toString());
  if (m == null) return;

  m.status = "REVOKED";
  m.revokedAt = event.block.timestamp;
  m.revokedTx = event.transaction.hash;
  m.save();

  // Deliberately NOT re-read from storage here: revoke() deletes the struct, so a
  // call at this block returns zeroes. The scope recorded at grant time is the
  // historical truth and must survive revocation — otherwise the record of what a
  // keeper was permitted to do disappears the moment it stops being permitted.

  let k = Keeper.load(m.keeper);
  if (k != null) {
    k.activeMandateCount = k.activeMandateCount - 1;
    k.save();
  }

  let pos = Position.load(m.position);
  if (pos != null) {
    // The contract enforces at most one live mandate per position, so revoking the
    // one that exists always clears the flag.
    pos.hasActiveMandate = false;
    pos.save();
  }

  let p = protocol();
  p.activeMandateCount = p.activeMandateCount - 1;
  p.revokedMandateCount = p.revokedMandateCount + 1;
  p.save();
}
