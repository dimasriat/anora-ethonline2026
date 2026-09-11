// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Sizing} from "../src/Sizing.sol";

contract SizingTest is Test {
    function test_sizesTheFacilityFromCollateralAndPolicy() public pure {
        Sizing.Caps memory caps = Sizing.derive(600_000_000, 7_000, 4_000);
        assertEq(caps.senior + caps.junior, 420_000_000);
        assertEq(caps.junior, 168_000_000);
        assertEq(caps.senior, 252_000_000);
    }

    function test_juniorCoverageFollowsTheConfiguredFraction() public pure {
        Sizing.Caps memory caps = Sizing.derive(600_000_000, 7_000, 3_077);
        assertEq(caps.junior, 129_234_000);
        assertEq(caps.senior, 420_000_000 - 129_234_000);
    }

    function test_roundsJuniorUpSoSeniorNeverOverstates() public pure {
        Sizing.Caps memory caps = Sizing.derive(7, 10_000, 3_333);
        assertEq(caps.junior, 3);
        assertEq(caps.senior, 4);
    }


    function testFuzz_capsAlwaysSumToTheCeiling(uint256 value, uint256 ltvBp, uint256 juniorBp) public pure {
        value = bound(value, 1_000_000, 1e15);
        ltvBp = bound(ltvBp, 1, 10_000);
        juniorBp = bound(juniorBp, 1, 9_999);

        Sizing.Caps memory caps = Sizing.derive(value, ltvBp, juniorBp);
        assertEq(caps.senior + caps.junior, (value * ltvBp) / 10_000);
    }
}
