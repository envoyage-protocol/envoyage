// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IERC721} from "openzeppelin-contracts/contracts/interfaces/IERC721.sol";
import {PosmTestSetup} from "v4-periphery-test/shared/PosmTestSetup.sol";
import {PositionConfig} from "v4-periphery-test/shared/PositionConfig.sol";

contract HarnessProbe is PosmTestSetup {
    function test_harnessMintsRealPosition() public {
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies(); // WAJIB sebelum deployAndApprovePosm
        deployPosmHookSavesDelta();
        (key,) = initPool(currency0, currency1, IHooks(hook), 3000, SQRT_PRICE_1_1);
        deployAndApprovePosm(manager);

        PositionConfig memory cfg = PositionConfig({poolKey: key, tickLower: -300, tickUpper: 300});
        uint256 tokenId = lpm.nextTokenId();
        mint(cfg, 1e18, address(this), "");

        assertEq(IERC721(address(lpm)).ownerOf(tokenId), address(this), "posisi ter-mint");
    }
}
