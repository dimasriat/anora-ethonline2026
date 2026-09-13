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


    function test_splitsATargetOnAnExactFraction() public pure {
        Sizing.Caps memory caps = Sizing.fromTarget(390_000_000, 4, 13);
        assertEq(caps.junior, 120_000_000);
        assertEq(caps.senior, 270_000_000);
    }

    function test_roundsJuniorUpWhenTheFractionDoesNotDivide() public pure {
        Sizing.Caps memory caps = Sizing.fromTarget(100, 1, 3);
        assertEq(caps.junior, 34);
        assertEq(caps.senior, 66);
    }

    function test_refusesAFractionThatIsNotProper() public {
        vm.expectRevert(abi.encodeWithSelector(Sizing.FractionNotProper.selector, uint256(13), uint256(4)));
        this.splitTarget(390_000_000, 13, 4);
    }

    function test_refusesATargetTooSmallToSplit() public {
        vm.expectRevert(abi.encodeWithSelector(Sizing.TargetTooSmall.selector, uint256(1)));
        this.splitTarget(1, 1, 2);
    }

    function splitTarget(uint256 target, uint256 numerator, uint256 denominator)
        external
        pure
        returns (Sizing.Caps memory)
    {
        return Sizing.fromTarget(target, numerator, denominator);
    }

    function testFuzz_targetSplitsWithoutLosingARupiah(uint256 target, uint256 numerator, uint256 denominator)
        public
        pure
    {
        denominator = bound(denominator, 2, 1_000);
        numerator = bound(numerator, 1, denominator - 1);
        target = bound(target, denominator, 1e15);

        Sizing.Caps memory caps = Sizing.fromTarget(target, numerator, denominator);
        assertEq(caps.senior + caps.junior, target);
    }

    function testFuzz_capsAlwaysSumToTheCeiling(uint256 value, uint256 ltvBp, uint256 juniorBp) public pure {
        value = bound(value, 1_000_000, 1e15);
        ltvBp = bound(ltvBp, 100, 10_000);
        juniorBp = bound(juniorBp, 1, 9_999);

        Sizing.Caps memory caps = Sizing.derive(value, ltvBp, juniorBp);
        assertEq(caps.senior + caps.junior, (value * ltvBp) / 10_000);
    }
}
