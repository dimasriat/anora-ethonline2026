// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Collateral} from "../src/Collateral.sol";

contract CollateralTest is Test {
    uint256 constant GRAMS = 24_000_000;
    uint256 constant PRICE_PER_KG = 25_000;

    function test_takesTheLowerOfTheTwoRecords() public pure {
        assertEq(Collateral.reconciled(GRAMS, GRAMS - 1_000_000), GRAMS - 1_000_000);
        assertEq(Collateral.reconciled(GRAMS - 1_000_000, GRAMS), GRAMS - 1_000_000);
    }

    function test_acceptsAGapExactlyAtTolerance() public pure {
        assertTrue(Collateral.withinTolerance(1_000_000, 990_000, 100));
    }

    function test_refusesAGapJustOutsideTolerance() public pure {
        assertFalse(Collateral.withinTolerance(1_000_000, 989_999, 100));
    }

    function test_valuesGramsAgainstAPricePerKilo() public pure {
        assertEq(Collateral.value(GRAMS, PRICE_PER_KG, 0), 600_000_000);
    }

    function test_haircutReducesTheValue() public pure {
        assertEq(Collateral.value(GRAMS, PRICE_PER_KG, 500), 570_000_000);
    }

    function test_fullHaircutLeavesNothing() public pure {
        assertEq(Collateral.value(GRAMS, PRICE_PER_KG, 10_000), 0);
    }

    function test_ceilingFollowsTheLoanToValuePolicy() public pure {
        assertEq(Collateral.ceiling(600_000_000, 7_000), 420_000_000);
    }

    function test_headroomIsWhatIsLeftUnderBothLimits() public pure {
        assertEq(Collateral.headroom(420_000_000, 420_000_000, 390_000_000), 30_000_000);
        assertEq(Collateral.headroom(420_000_000, 380_000_000, 390_000_000), 0);
    }

    function test_issuedLoanToValueRoundsUp() public pure {
        assertEq(Collateral.issuedLtvBp(390_000_000, 600_000_000), 6_500);
        assertEq(Collateral.issuedLtvBp(1, 3), 3_334);
    }

    function testFuzz_valueNeverRisesWithHaircut(uint256 haircutBp, uint256 extraBp) public pure {
        haircutBp = bound(haircutBp, 0, 10_000);
        extraBp = bound(extraBp, haircutBp, 10_000);

        assertTrue(
            Collateral.value(GRAMS, PRICE_PER_KG, extraBp) <= Collateral.value(GRAMS, PRICE_PER_KG, haircutBp)
        );
    }
}
