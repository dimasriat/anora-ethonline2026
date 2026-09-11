// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Collateral} from "./Collateral.sol";
import {Tranche} from "./Tranche.sol";
import {Pricing} from "./Pricing.sol";

contract AnoraFacilityController {
    enum Slice {
        Senior,
        Junior
    }

    struct Terms {
        uint256 seniorCap;
        uint256 juniorCap;
        uint256 approvedIdr;
        uint256 seniorYieldBp;
        uint256 juniorYieldBp;
        uint256 termDays;
        uint256 maxLtvBp;
        uint256 retentionBp;
        address sponsor;
    }

    error NotOracle();
    error AlreadyOpen();
    error EmptyTranche();
    error AboveApproved();
    error SponsorRequired();
    error EmptyTerm();
    error NotOpen();
    error SeniorNotUnlocked();
    error ExceedsCap();
    error ReportTooOld();
    error ReportFromTheFuture();
    error NonceNotAdvanced();
    error ObservationWentBackwards();
    error EvidenceMissing();
    error RecordsDisagree();

    event FacilityOpened(uint256 seniorCap, uint256 juniorCap, uint256 termDays);
    event Subscribed(Slice indexed slice, address indexed holder, uint256 face, uint256 price);
    event CollateralReported(uint256 eligibleValueIdr, uint256 observedAt, uint256 nonce, bytes32 evidence);

    address public immutable oracle;
    uint256 public immutable maxAge;
    uint256 public immutable reconciliationToleranceBp;

    Terms public terms;
    bool public open;

    mapping(Slice => uint256) public committed;
    mapping(Slice => mapping(address => uint256)) public face;
    mapping(Slice => mapping(address => uint256)) public paid;

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

    function openFacility(Terms calldata proposed) external {
        if (open) revert AlreadyOpen();
        if (proposed.seniorCap == 0 || proposed.juniorCap == 0) revert EmptyTranche();
        if (proposed.termDays == 0) revert EmptyTerm();
        if (proposed.seniorCap + proposed.juniorCap > proposed.approvedIdr) revert AboveApproved();
        if (proposed.retentionBp > 0 && proposed.sponsor == address(0)) revert SponsorRequired();

        terms = proposed;
        open = true;

        emit FacilityOpened(proposed.seniorCap, proposed.juniorCap, proposed.termDays);
    }

    function retainedJuniorMinimum() external view returns (uint256) {
        return Tranche.retainedMinimum(terms.juniorCap, terms.retentionBp);
    }

    function subscribe(Slice slice, uint256 amount) external {
        if (!open) revert NotOpen();

        uint256 already = committed[slice];
        uint256 next = already + amount;

        if (slice == Slice.Junior) {
            if (next > terms.juniorCap) revert ExceedsCap();
        } else if (!Tranche.seniorFits(next, committed[Slice.Junior], terms.seniorCap, terms.juniorCap)) {
            revert SeniorNotUnlocked();
        }

        uint256 yieldBp = slice == Slice.Junior ? terms.juniorYieldBp : terms.seniorYieldBp;
        uint256 price = Pricing.charge(face[slice][msg.sender], amount, yieldBp, terms.termDays);

        committed[slice] = next;
        face[slice][msg.sender] += amount;
        paid[slice][msg.sender] += price;

        emit Subscribed(slice, msg.sender, amount, price);
    }
}
