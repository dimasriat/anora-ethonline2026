// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Tranche {
    uint256 internal constant BASIS = 10_000;

    error EmptyJuniorCap();
    error FractionOutOfRange(uint256 basisPoints);

    function seniorUnlocked(uint256 juniorFunded, uint256 seniorCap, uint256 juniorCap)
        internal
        pure
        returns (uint256)
    {
        if (juniorCap == 0) revert EmptyJuniorCap();
        uint256 unlocked = (seniorCap * juniorFunded) / juniorCap;
        return unlocked < seniorCap ? unlocked : seniorCap;
    }

    function seniorFits(uint256 seniorCommitted, uint256 juniorFunded, uint256 seniorCap, uint256 juniorCap)
        internal
        pure
        returns (bool)
    {
        if (juniorCap == 0) revert EmptyJuniorCap();
        if (seniorCommitted > seniorCap) return false;
        return seniorCommitted * juniorCap <= seniorCap * juniorFunded;
    }

    function retainedMinimum(uint256 juniorCap, uint256 retentionBp) internal pure returns (uint256) {
        if (retentionBp > BASIS) revert FractionOutOfRange(retentionBp);
        uint256 product = juniorCap * retentionBp;
        return product == 0 ? 0 : (product - 1) / BASIS + 1;
    }
}
