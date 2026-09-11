// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Pricing {
    uint256 internal constant BASIS = 10_000;
    uint256 internal constant YEAR_DAYS = 365;

    error EmptyTerm();

    function purchase(uint256 face, uint256 yieldBp, uint256 termDays) internal pure returns (uint256) {
        if (termDays == 0) revert EmptyTerm();
        uint256 numerator = face * BASIS * YEAR_DAYS;
        uint256 denominator = BASIS * YEAR_DAYS + yieldBp * termDays;
        uint256 quotient = numerator / denominator;
        uint256 remainder = numerator % denominator;
        return 2 * remainder >= denominator ? quotient + 1 : quotient;
    }

    function discount(uint256 face, uint256 yieldBp, uint256 termDays) internal pure returns (uint256) {
        return face - purchase(face, yieldBp, termDays);
    }

    function charge(uint256 committedFace, uint256 addedFace, uint256 yieldBp, uint256 termDays)
        internal
        pure
        returns (uint256)
    {
        return purchase(committedFace + addedFace, yieldBp, termDays) - purchase(committedFace, yieldBp, termDays);
    }
}
