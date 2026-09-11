// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Pricing} from "../src/Pricing.sol";

contract PricingTest is Test {
    uint256 constant TERM_DAYS = 90;

    function test_seniorPriceMatchesTheWorkedExample() public pure {
        assertEq(Pricing.purchase(270_000_000, 200, TERM_DAYS), 268_675_027);
    }

    function test_juniorPriceMatchesTheWorkedExample() public pure {
        assertEq(Pricing.purchase(120_000_000, 450, TERM_DAYS), 118_683_105);
    }

    function test_zeroYieldPaysFace() public pure {
        assertEq(Pricing.purchase(500_000_000, 0, TERM_DAYS), 500_000_000);
    }

    function test_discountIsWhatTheBuyerEarns() public pure {
        assertEq(Pricing.discount(270_000_000, 200, TERM_DAYS), 1_324_973);
    }

    function test_splittingAnOrderCostsTheSameAsPlacingItWhole() public pure {
        uint256 whole = Pricing.purchase(390_000_000, 300, TERM_DAYS);
        uint256 first = Pricing.charge(0, 150_000_000, 300, TERM_DAYS);
        uint256 second = Pricing.charge(150_000_000, 240_000_000, 300, TERM_DAYS);
        assertEq(first + second, whole);
    }

    function testFuzz_priceNeverExceedsFace(uint256 face, uint256 yieldBp) public pure {
        face = bound(face, 1, 1e15);
        yieldBp = bound(yieldBp, 0, 50_000);
        assertTrue(Pricing.purchase(face, yieldBp, TERM_DAYS) <= face);
    }

    function testFuzz_higherYieldCostsLess(uint256 low, uint256 high) public pure {
        low = bound(low, 0, 20_000);
        high = bound(high, low, 20_000);
        assertTrue(Pricing.purchase(390_000_000, high, TERM_DAYS) <= Pricing.purchase(390_000_000, low, TERM_DAYS));
    }
}
