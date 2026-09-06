import {
  assert,
  describe,
  test,
  clearStore,
  afterEach,
  createMockedFunction
} from "matchstick-as/assembly/index";
import {Address, BigInt, ethereum} from "@graphprotocol/graph-ts";

import {handleMandateGranted, handleMandateExecuted, handleMandateRevoked} from "../src/envoyage";
import {MandateGranted, MandateExecuted, MandateRevoked} from "../generated/Envoyage/Envoyage";
import {newMockEvent} from "matchstick-as";

const ENVOYAGE = Address.fromString("0x8466e82E02edF3F00c0387D5C3E66d407dc7259C");
const KEEPER = Address.fromString("0xd643ee841bf365E4d5f46Bb9072B18a4cD056C5B");
const GRANTOR = Address.fromString("0x311159a207D9C9c9AE83C4F83ED18De346bfa4BA");
const TOKEN_ID = BigInt.fromI32(38896);
const MANDATE_ID = BigInt.fromI32(1);
const UNMOCKED_ID = BigInt.fromI32(999);

/// Mocks mandates(id) exactly as the generated binding calls it. The tuple order and
/// types are taken from the ABI, not from memory: a mock built from an assumed shape
/// would let a handler bug pass by agreeing with itself.
function mockMandates(compoundAllowed: boolean): void {
  createMockedFunction(
    ENVOYAGE,
    "mandates",
    "mandates(uint256):(address,address,uint256,uint16,address,uint64,uint64,uint64,bool)"
  )
    .withArgs([ethereum.Value.fromUnsignedBigInt(MANDATE_ID)])
    .returns([
      ethereum.Value.fromAddress(KEEPER),
      ethereum.Value.fromAddress(GRANTOR),
      ethereum.Value.fromUnsignedBigInt(TOKEN_ID),
      ethereum.Value.fromI32(200),
      ethereum.Value.fromAddress(KEEPER),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(1790000000)),
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(60)),
      ethereum.Value.fromUnsignedBigInt(BigInt.zero()),
      ethereum.Value.fromBoolean(compoundAllowed)
    ]);
}

function grantedEvent(): MandateGranted {
  let e = changetype<MandateGranted>(newMockEvent());
  e.address = ENVOYAGE;
  e.parameters = new Array();
  e.parameters.push(new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(MANDATE_ID)));
  e.parameters.push(new ethereum.EventParam("keeper", ethereum.Value.fromAddress(KEEPER)));
  e.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(TOKEN_ID)));
  return e;
}

/// @param logIndex must differ per event. newMockEvent() returns a fixed logIndex and
///         a fixed transaction hash, and Execution ids are txHash-logIndex, so two
///         events left at the defaults collapse into one entity and an accumulation
///         test silently checks a single write.
function executedEvent(fee0: i64, fee1: i64, liq: i64, logIndex: i32): MandateExecuted {
  let e = changetype<MandateExecuted>(newMockEvent());
  e.address = ENVOYAGE;
  e.logIndex = BigInt.fromI32(logIndex);
  e.parameters = new Array();
  e.parameters.push(new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(MANDATE_ID)));
  e.parameters.push(new ethereum.EventParam("fee0Paid", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(fee0))));
  e.parameters.push(new ethereum.EventParam("fee1Paid", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(fee1))));
  e.parameters.push(
    new ethereum.EventParam("liquidityAdded", ethereum.Value.fromUnsignedBigInt(BigInt.fromI64(liq)))
  );
  return e;
}

function revokedEvent(): MandateRevoked {
  let e = changetype<MandateRevoked>(newMockEvent());
  e.address = ENVOYAGE;
  e.parameters = new Array();
  e.parameters.push(new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(MANDATE_ID)));
  return e;
}

describe("Envoyage mappings", () => {
  afterEach(() => {
    clearStore();
  });

  test("grant records the scope, which lives only in storage", () => {
    mockMandates(true);
    handleMandateGranted(grantedEvent());

    assert.entityCount("Mandate", 1);
    assert.fieldEquals("Mandate", "1", "status", "ACTIVE");
    assert.fieldEquals("Mandate", "1", "keeper", KEEPER.toHexString());
    // None of the four below appear in any event.
    assert.fieldEquals("Mandate", "1", "maxFeeBps", "200");
    assert.fieldEquals("Mandate", "1", "grantor", GRANTOR.toHexString());
    assert.fieldEquals("Mandate", "1", "minInterval", "60");
    assert.fieldEquals("Mandate", "1", "compoundAllowed", "true");
    assert.fieldEquals("Position", "38896", "hasActiveMandate", "true");
    assert.fieldEquals("Protocol", "envoyage", "activeMandateCount", "1");
  });

  test("a failed storage read defaults to the conservative direction", () => {
    // A mock that REVERTS, on an id no other test uses. matchstick treats an
    // entirely unmocked call as a hard error rather than a revert, and it offers no
    // way to clear a mock — mocks are keyed by (address, signature, args), so a mock
    // registered in an earlier test would otherwise leak in and make this pass for
    // the wrong reason.
    createMockedFunction(
      ENVOYAGE,
      "mandates",
      "mandates(uint256):(address,address,uint256,uint16,address,uint64,uint64,uint64,bool)"
    )
      .withArgs([ethereum.Value.fromUnsignedBigInt(UNMOCKED_ID)])
      .reverts();

    let e = changetype<MandateGranted>(newMockEvent());
    e.address = ENVOYAGE;
    e.parameters = new Array();
    e.parameters.push(new ethereum.EventParam("id", ethereum.Value.fromUnsignedBigInt(UNMOCKED_ID)));
    e.parameters.push(new ethereum.EventParam("keeper", ethereum.Value.fromAddress(KEEPER)));
    e.parameters.push(new ethereum.EventParam("tokenId", ethereum.Value.fromUnsignedBigInt(TOKEN_ID)));

    handleMandateGranted(e);

    assert.entityCount("Mandate", 1);
    assert.fieldEquals("Mandate", "999", "compoundAllowed", "false");
    assert.fieldEquals("Mandate", "999", "maxFeeBps", "0");
  });

  test("executions accumulate onto mandate, keeper, position and protocol", () => {
    mockMandates(true);
    handleMandateGranted(grantedEvent());
    handleMandateExecuted(executedEvent(1200000000000000, 1199999999999999, 614338692357009962, 0));
    handleMandateExecuted(executedEvent(1000000000000000, 1000000000000000, 500000000000000000, 1));

    assert.entityCount("Execution", 2);
    assert.fieldEquals("Mandate", "1", "executionCount", "2");
    assert.fieldEquals("Mandate", "1", "totalFee0ToKeeper", "2200000000000000");
    assert.fieldEquals("Mandate", "1", "totalLiquidityAdded", "1114338692357009962");
    assert.fieldEquals("Keeper", KEEPER.toHexString(), "executionCount", "2");
    assert.fieldEquals("Position", "38896", "totalLiquidityAdded", "1114338692357009962");
    assert.fieldEquals("Protocol", "envoyage", "executionCount", "2");
  });

  test("an execution with no prior grant is dropped, not invented", () => {
    // A synthetic parent here would fabricate a mandate with no scope, which is the
    // one record this subgraph exists to be trusted on.
    handleMandateExecuted(executedEvent(1, 1, 1, 0));
    assert.entityCount("Execution", 0);
    assert.entityCount("Mandate", 0);
  });

  test("revoke preserves the scope granted historically", () => {
    mockMandates(true);
    handleMandateGranted(grantedEvent());
    handleMandateExecuted(executedEvent(1200000000000000, 1199999999999999, 614338692357009962, 0));
    handleMandateRevoked(revokedEvent());

    assert.fieldEquals("Mandate", "1", "status", "REVOKED");
    // The struct is deleted on chain by revoke(). The record of what was permitted,
    // and of what was done under it, must survive that deletion.
    assert.fieldEquals("Mandate", "1", "maxFeeBps", "200");
    assert.fieldEquals("Mandate", "1", "executionCount", "1");
    assert.fieldEquals("Mandate", "1", "totalLiquidityAdded", "614338692357009962");

    assert.fieldEquals("Position", "38896", "hasActiveMandate", "false");
    assert.fieldEquals("Keeper", KEEPER.toHexString(), "activeMandateCount", "0");
    assert.fieldEquals("Protocol", "envoyage", "activeMandateCount", "0");
    assert.fieldEquals("Protocol", "envoyage", "revokedMandateCount", "1");
  });
});
