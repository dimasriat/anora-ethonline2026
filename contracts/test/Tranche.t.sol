// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Tranche} from "../src/Tranche.sol";

contract TrancheTest is Test {
    uint256 constant S_CAP = 270_000_000;
    uint256 constant J_CAP = 120_000_000;

    function test_nothingUnlocksBeforeJuniorFunds() public pure {
        assertEq(Tranche.seniorUnlocked(0, S_CAP, J_CAP), 0);
    }

    function test_fullJuniorUnlocksAllSenior() public pure {
        assertEq(Tranche.seniorUnlocked(J_CAP, S_CAP, J_CAP), S_CAP);
    }

    function test_seniorUnlocksInProportionToJunior() public pure {
        assertEq(Tranche.seniorUnlocked(30_000_000, S_CAP, J_CAP), 67_500_000);
        assertEq(Tranche.seniorUnlocked(60_000_000, S_CAP, J_CAP), 135_000_000);
    }

    function test_acceptsSeniorExactlyAtTheUnlock() public pure {
        assertTrue(Tranche.seniorFits(67_500_000, 30_000_000, S_CAP, J_CAP));
    }

    function test_refusesOneRupiahAboveTheUnlock() public pure {
        assertFalse(Tranche.seniorFits(67_500_001, 30_000_000, S_CAP, J_CAP));
    }

    function test_retentionRoundsUp() public pure {
        assertEq(Tranche.retainedMinimum(J_CAP, 2_500), 30_000_000);
        assertEq(Tranche.retainedMinimum(7, 2_500), 2);
    }

    function test_zeroRetentionPolicyRequiresNothing() public pure {
        assertEq(Tranche.retainedMinimum(J_CAP, 0), 0);
    }

    function testFuzz_unlockIsNondecreasingAndBounded(uint256 lower, uint256 upper) public pure {
        lower = bound(lower, 0, J_CAP);
        upper = bound(upper, lower, J_CAP);

        uint256 low = Tranche.seniorUnlocked(lower, S_CAP, J_CAP);
        uint256 high = Tranche.seniorUnlocked(upper, S_CAP, J_CAP);

        assertTrue(high >= low);
        assertTrue(high <= S_CAP);
    }

    function testFuzz_crossProductHoldsWheneverSeniorFits(uint256 funded, uint256 senior) public pure {
        funded = bound(funded, 0, J_CAP);
        senior = bound(senior, 0, S_CAP);

        if (Tranche.seniorFits(senior, funded, S_CAP, J_CAP)) {
            assertTrue(senior * J_CAP <= S_CAP * funded);
        }
    }
}
