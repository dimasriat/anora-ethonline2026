// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Collateral {
    uint256 internal constant BASIS = 10_000;
    uint256 internal constant GRAMS_PER_KG = 1_000;

    error FractionOutOfRange(uint256 basisPoints);
    error NoEligibleCollateral();

    function reconciled(uint256 registryGrams, uint256 warehouseGrams) internal pure returns (uint256) {
        return registryGrams < warehouseGrams ? registryGrams : warehouseGrams;
    }

    function withinTolerance(uint256 registryGrams, uint256 warehouseGrams, uint256 toleranceBp)
        internal
        pure
        returns (bool)
    {
        if (toleranceBp > BASIS) revert FractionOutOfRange(toleranceBp);
        uint256 larger = registryGrams > warehouseGrams ? registryGrams : warehouseGrams;
        uint256 gap = larger - reconciled(registryGrams, warehouseGrams);
        return BASIS * gap <= toleranceBp * larger;
    }

    function value(uint256 grams, uint256 pricePerKgIdr, uint256 haircutBp) internal pure returns (uint256) {
        if (haircutBp > BASIS) revert FractionOutOfRange(haircutBp);
        return (grams * pricePerKgIdr * (BASIS - haircutBp)) / (GRAMS_PER_KG * BASIS);
    }

    function ceiling(uint256 eligibleValueIdr, uint256 maxLtvBp) internal pure returns (uint256) {
        if (maxLtvBp > BASIS) revert FractionOutOfRange(maxLtvBp);
        return (eligibleValueIdr * maxLtvBp) / BASIS;
    }

    function headroom(uint256 approvedIdr, uint256 ceilingIdr, uint256 issuedIdr) internal pure returns (uint256) {
        uint256 limit = approvedIdr < ceilingIdr ? approvedIdr : ceilingIdr;
        return limit > issuedIdr ? limit - issuedIdr : 0;
    }

    function issuedLtvBp(uint256 issuedIdr, uint256 eligibleValueIdr) internal pure returns (uint256) {
        if (eligibleValueIdr == 0) revert NoEligibleCollateral();
        uint256 product = issuedIdr * BASIS;
        return product == 0 ? 0 : (product - 1) / eligibleValueIdr + 1;
    }
}
