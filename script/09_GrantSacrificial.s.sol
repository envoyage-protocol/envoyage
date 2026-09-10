// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {Actions} from "v4-periphery/libraries/Actions.sol";

import {Base} from "./Base.s.sol";
import {Envoyage} from "../src/Envoyage.sol";
import {IEnvoyage} from "../src/interfaces/IEnvoyage.sol";

interface IERC721Approve {
    function approve(address to, uint256 tokenId) external;
}

/// @notice Mints a second position and grants a mandate on it, for the Proof tab to
///         revoke on camera. Mandate #1 is the worked example on Home and the Lookup
///         default; nothing in the app may revoke it. This one is expendable and can
///         be re-granted between takes by re-running this script.
///
///   forge script script/09_GrantSacrificial.s.sol --rpc-url sepolia --broadcast
contract GrantSacrificial is Base {
    uint256 constant MINT_LIQUIDITY = 20e18;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address keeper = vm.envAddress("KEEPER_ADDRESS");

        Envoyage envoyage = Envoyage(payable(_readAddr("envoyage")));
        PoolKey memory key = PoolKey(
            Currency.wrap(_readAddr("token0")),
            Currency.wrap(_readAddr("token1")),
            DEMO_FEE,
            DEMO_TICK_SPACING,
            IHooks(address(0))
        );

        vm.startBroadcast(pk);

        uint256 tokenId = POSM.nextTokenId();
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key, -DEMO_TICK_SPACING * 10, DEMO_TICK_SPACING * 10, MINT_LIQUIDITY,
            type(uint128).max, type(uint128).max, deployer, bytes("")
        );
        params[1] = abi.encode(key.currency0, key.currency1);
        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp + 300);

        IERC721Approve(address(POSM)).approve(address(envoyage), tokenId);

        uint256 mandateId = envoyage.grant(
            IEnvoyage.Mandate({
                keeper: keeper,
                grantor: address(0),
                tokenId: tokenId,
                maxFeeBps: 200,
                feeRecipient: keeper,
                expiry: uint64(block.timestamp) + 30 days,
                minInterval: 60,
                lastCall: 0,
                compoundAllowed: true
            })
        );

        vm.stopBroadcast();

        string memory o = "s";
        vm.serializeString(o, "sacrificialMandateId", vm.toString(mandateId));
        string memory out = vm.serializeString(o, "sacrificialTokenId", vm.toString(tokenId));
        vm.writeJson(out, "deployments/sacrificial-sepolia.json");

        console2.log("sacrificial position", tokenId);
        console2.log("sacrificial mandate ", mandateId);
    }
}
