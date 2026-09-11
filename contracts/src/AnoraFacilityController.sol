// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Collateral} from "./Collateral.sol";
import {Tranche} from "./Tranche.sol";
import {Pricing} from "./Pricing.sol";
import {Settlement} from "./Settlement.sol";

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
    error AlreadyActive();
    error TrancheNotFilled();
    error RegistryNotConfirmed();
    error RetentionNotMet();
    error CoverageBreached();
    error NotActive();
    error AlreadySettled();
    error NotSettled();
    error AlreadyClaimed();
    error ReportTooOld();
    error ReportFromTheFuture();
    error NonceNotAdvanced();
    error ObservationWentBackwards();
    error EvidenceMissing();
    error RecordsDisagree();

    event FacilityOpened(uint256 seniorCap, uint256 juniorCap, uint256 termDays);
    event Subscribed(Slice indexed slice, address indexed holder, uint256 face, uint256 price);
    event RegistryConfirmed(bytes32 security);
    event Activated(uint256 issuedFace, uint256 eligibleValueIdr);
    event Settled(uint256 senior, uint256 junior, uint256 surplus, bytes32 cashEvidence);
    event Claimed(Slice indexed slice, address indexed holder, uint256 amount);
    event CollateralReported(uint256 eligibleValueIdr, uint256 observedAt, uint256 nonce, bytes32 evidence);

    address public immutable oracle;
    uint256 public immutable maxAge;
    uint256 public immutable reconciliationToleranceBp;

    Terms public terms;
    bool public open;

    bool public active;
    bool public settled;
    uint256 public surplus;
    bytes32 public cashEvidence;

    mapping(Slice => uint256) public payout;
    mapping(Slice => uint256) public frozenFace;
    mapping(Slice => uint256) public claimedTotal;
    mapping(Slice => mapping(address => bool)) public claimedBy;

    bytes32 public registrySecurity;

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

    function confirmRegistry(bytes32 security) external {
        if (security == bytes32(0)) revert EvidenceMissing();
        registrySecurity = security;
        emit RegistryConfirmed(security);
    }

    function issuedFace() public view returns (uint256) {
        return committed[Slice.Senior] + committed[Slice.Junior];
    }

    function activate() external {
        if (!open) revert NotOpen();
        if (active) revert AlreadyActive();
        if (committed[Slice.Senior] != terms.seniorCap || committed[Slice.Junior] != terms.juniorCap) {
            revert TrancheNotFilled();
        }
        if (registrySecurity == bytes32(0)) revert RegistryNotConfirmed();
        if (block.timestamp - observedAt > maxAge) revert ReportTooOld();
        if (face[Slice.Junior][terms.sponsor] < Tranche.retainedMinimum(terms.juniorCap, terms.retentionBp)) {
            revert RetentionNotMet();
        }
        if (issuedFace() > Collateral.ceiling(eligibleValueIdr, terms.maxLtvBp)) revert CoverageBreached();

        active = true;
        emit Activated(issuedFace(), eligibleValueIdr);
    }

    function settle(uint256 recovered, uint256 costs, bytes32 evidenceOfCash) external {
        if (!active) revert NotActive();
        if (settled) revert AlreadySettled();
        if (evidenceOfCash == bytes32(0)) revert EvidenceMissing();

        frozenFace[Slice.Senior] = committed[Slice.Senior];
        frozenFace[Slice.Junior] = committed[Slice.Junior];

        Settlement.Split memory split =
            Settlement.split(recovered, costs, frozenFace[Slice.Senior], frozenFace[Slice.Junior]);

        payout[Slice.Senior] = split.senior;
        payout[Slice.Junior] = split.junior;
        surplus = split.surplus;
        cashEvidence = evidenceOfCash;
        settled = true;

        emit Settled(split.senior, split.junior, split.surplus, evidenceOfCash);
    }

    function entitlement(Slice slice, address holder) public view returns (uint256) {
        uint256 total = frozenFace[slice];
        if (total == 0) return 0;
        return (payout[slice] * face[slice][holder]) / total;
    }

    function claim(Slice slice) external returns (uint256 amount) {
        if (!settled) revert NotSettled();
        if (claimedBy[slice][msg.sender]) revert AlreadyClaimed();

        amount = entitlement(slice, msg.sender);
        claimedBy[slice][msg.sender] = true;
        claimedTotal[slice] += amount;

        emit Claimed(slice, msg.sender, amount);
    }

    function dust(Slice slice) external view returns (uint256) {
        return payout[slice] - claimedTotal[slice];
    }
}
