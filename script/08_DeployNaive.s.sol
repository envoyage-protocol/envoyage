// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {Actions} from "v4-periphery/libraries/Actions.sol";

import {Base} from "./Base.s.sol";
import {NaiveUtils} from "./demo/NaiveUtils.sol";

interface IERC721Approve {
    function approve(address to, uint256 tokenId) external;
}

/// @notice Puts the deliberately vulnerable comparator on Sepolia, with its own
///         position approved to it, so the theft in test/replay can be performed
///         from the web app by a real wallet against a real chain.
///
/// A page that SAYS the keeper cannot withdraw is a claim. A page where the viewer
/// presses "withdraw", watches it drain the naive contract's position, then presses
/// the same button against Envoyage and watches it have nowhere to go, is evidence.
///
///   forge script script/08_DeployNaive.s.sol --rpc-url sepolia --broadcast
contract DeployNaive is Base {
    uint256 constant MINT_LIQUIDITY = 20e18;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address t0 = _readAddr("token0");
        address t1 = _readAddr("token1");
        PoolKey memory key =
            PoolKey(Currency.wrap(t0), Currency.wrap(t1), DEMO_FEE, DEMO_TICK_SPACING, IHooks(address(0)));

        vm.startBroadcast(pk);

        NaiveUtils naive = new NaiveUtils(POSM);

        // A separate, smaller position, so the theft demo never touches the mandate's
        // own position #38896 and can be re-run by re-minting.
        uint256 victimId = POSM.nextTokenId();
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key,
            -DEMO_TICK_SPACING * 10,
            DEMO_TICK_SPACING * 10,
            MINT_LIQUIDITY,
            type(uint128).max,
            type(uint128).max,
            deployer,
            bytes("")
        );
        params[1] = abi.encode(key.currency0, key.currency1);
        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp + 300);

        // The approval that every automation contract asks for today. This is the
        // whole vulnerability: it answers WHICH position, not WHAT may be done.
        IERC721Approve(address(POSM)).approve(address(naive), victimId);

        vm.stopBroadcast();

        string memory o = "n";
        vm.serializeString(o, "naive", vm.toString(address(naive)));
        string memory out = vm.serializeString(o, "victimTokenId", vm.toString(victimId));
        vm.writeJson(out, "deployments/naive-sepolia.json");

        console2.log("NaiveUtils      ", address(naive));
        console2.log("victim position ", victimId);
    }
}
