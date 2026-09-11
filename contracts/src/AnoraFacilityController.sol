// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Collateral} from "./Collateral.sol";

contract AnoraFacilityController {
    error NotOracle();
    error ReportTooOld();
    error ReportFromTheFuture();
    error NonceNotAdvanced();
    error ObservationWentBackwards();
    error EvidenceMissing();
    error RecordsDisagree();

    event CollateralReported(uint256 eligibleValueIdr, uint256 observedAt, uint256 nonce, bytes32 evidence);

    address public immutable oracle;
    uint256 public immutable maxAge;
    uint256 public immutable reconciliationToleranceBp;

    uint256 public eligibleValueIdr;
    uint256 public observedAt;
    uint256 public nonce;
    bytes32 public evidence;

    constructor(address reporter, uint256 freshness) {
        oracle = reporter;
        maxAge = freshness;
        reconciliationToleranceBp = 100;
    }

    function reportCollateral(
        uint256 registryGrams,
        uint256 warehouseGrams,
        uint256 pricePerKgIdr,
        uint256 haircutBp,
        uint256 reportedAt,
        uint256 reportNonce,
        bytes32 reportEvidence
    ) external {
        if (msg.sender != oracle) revert NotOracle();
        if (reportEvidence == bytes32(0)) revert EvidenceMissing();
        if (reportedAt > block.timestamp) revert ReportFromTheFuture();
        if (block.timestamp - reportedAt > maxAge) revert ReportTooOld();
        if (reportedAt < observedAt) revert ObservationWentBackwards();
        if (reportNonce <= nonce) revert NonceNotAdvanced();
        if (!Collateral.withinTolerance(registryGrams, warehouseGrams, reconciliationToleranceBp)) {
            revert RecordsDisagree();
        }

        uint256 grams = Collateral.reconciled(registryGrams, warehouseGrams);
        eligibleValueIdr = Collateral.value(grams, pricePerKgIdr, haircutBp);
        observedAt = reportedAt;
        nonce = reportNonce;
        evidence = reportEvidence;

        emit CollateralReported(eligibleValueIdr, reportedAt, reportNonce, reportEvidence);
    }
}
