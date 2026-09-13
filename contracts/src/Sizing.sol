// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Collateral} from "./Collateral.sol";

library Sizing {
    uint256 internal constant BASIS = 10_000;

    struct Caps {
        uint256 senior;
        uint256 junior;
    }

    error FractionOutOfRange(uint256 basisPoints);
    error CeilingTooSmall(uint256 ceilingIdr);

    error FractionNotProper(uint256 numerator, uint256 denominator);
    error TargetTooSmall(uint256 targetFaceIdr);

    function fromTarget(uint256 targetFaceIdr, uint256 juniorNumerator, uint256 juniorDenominator)
        internal
        pure
        returns (Caps memory caps)
    {
        if (juniorNumerator == 0 || juniorNumerator >= juniorDenominator) {
            revert FractionNotProper(juniorNumerator, juniorDenominator);
        }

        uint256 product = targetFaceIdr * juniorNumerator;
        caps.junior = product == 0 ? 0 : (product - 1) / juniorDenominator + 1;

        if (caps.junior == 0 || caps.junior >= targetFaceIdr) revert TargetTooSmall(targetFaceIdr);
        caps.senior = targetFaceIdr - caps.junior;
    }

    function derive(uint256 eligibleValueIdr, uint256 maxLtvBp, uint256 juniorFractionBp)
        internal
        pure
        returns (Caps memory caps)
    {
        if (juniorFractionBp == 0 || juniorFractionBp >= BASIS) revert FractionOutOfRange(juniorFractionBp);

        uint256 ceiling = Collateral.ceiling(eligibleValueIdr, maxLtvBp);
        uint256 product = ceiling * juniorFractionBp;
        caps.junior = product == 0 ? 0 : (product - 1) / BASIS + 1;

        if (caps.junior == 0 || caps.junior >= ceiling) revert CeilingTooSmall(ceiling);
        caps.senior = ceiling - caps.junior;
    }
}
