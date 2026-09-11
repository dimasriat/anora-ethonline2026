// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AnoraFacilityController} from "../src/AnoraFacilityController.sol";

contract AnoraFacilityControllerTest is Test {
    AnoraFacilityController controller;

    address constant ORACLE = address(0xA1);
    address constant STRANGER = address(0xBEEF);
    uint256 constant MAX_AGE = 1 hours;

    uint256 constant GRAMS = 24_000_000;
    uint256 constant PRICE_PER_KG = 25_000;

    function setUp() public {
        vm.warp(1_000_000);
        controller = new AnoraFacilityController(ORACLE, MAX_AGE);
    }

    function _report(uint256 registry, uint256 warehouse, uint256 observedAt, uint256 nonce) internal {
        vm.prank(ORACLE);
        controller.reportCollateral(registry, warehouse, PRICE_PER_KG, 0, observedAt, nonce, keccak256("evidence"));
    }

    function test_recordsAnAuthorizedReport() public {
        _report(GRAMS, GRAMS, block.timestamp, 1);
        assertEq(controller.eligibleValueIdr(), 600_000_000);
        assertEq(controller.observedAt(), block.timestamp);
        assertEq(controller.nonce(), 1);
    }

    function test_refusesAStranger() public {
        vm.expectRevert(AnoraFacilityController.NotOracle.selector);
        vm.prank(STRANGER);
        controller.reportCollateral(GRAMS, GRAMS, PRICE_PER_KG, 0, block.timestamp, 1, keccak256("e"));
    }

    function test_refusesAStaleReport() public {
        vm.expectRevert(AnoraFacilityController.ReportTooOld.selector);
        _report(GRAMS, GRAMS, block.timestamp - MAX_AGE - 1, 1);
    }

    function test_refusesAReportFromTheFuture() public {
        vm.expectRevert(AnoraFacilityController.ReportFromTheFuture.selector);
        _report(GRAMS, GRAMS, block.timestamp + 1, 1);
    }

    function test_refusesAReplayedNonce() public {
        _report(GRAMS, GRAMS, block.timestamp, 5);
        vm.expectRevert(AnoraFacilityController.NonceNotAdvanced.selector);
        _report(GRAMS, GRAMS, block.timestamp, 5);
    }

    function test_refusesObservationTimeGoingBackwards() public {
        _report(GRAMS, GRAMS, block.timestamp, 1);
        vm.expectRevert(AnoraFacilityController.ObservationWentBackwards.selector);
        _report(GRAMS, GRAMS, block.timestamp - 1, 2);
    }

    function test_refusesEvidenceThatNamesNothing() public {
        vm.expectRevert(AnoraFacilityController.EvidenceMissing.selector);
        vm.prank(ORACLE);
        controller.reportCollateral(GRAMS, GRAMS, PRICE_PER_KG, 0, block.timestamp, 1, bytes32(0));
    }

    function test_refusesRecordsThatDisagreeBeyondTolerance() public {
        vm.expectRevert(AnoraFacilityController.RecordsDisagree.selector);
        _report(GRAMS, GRAMS / 2, block.timestamp, 1);
    }
}

contract FacilityTermsTest is Test {
    AnoraFacilityController controller;

    address constant ORACLE = address(0xA1);
    address constant COMPLIANCE = address(0xC0);
    address constant SPONSOR = address(0x50);
    address constant STRANGER = address(0xBEEF);

    function setUp() public {
        vm.warp(1_000_000);
        controller = new AnoraFacilityController(ORACLE, 1 hours);
    }

    function _open() internal {
        vm.prank(COMPLIANCE);
        controller.openFacility(
            AnoraFacilityController.Terms({
                seniorCap: 270_000_000,
                juniorCap: 120_000_000,
                approvedIdr: 420_000_000,
                seniorYieldBp: 200,
                juniorYieldBp: 450,
                termDays: 90,
                maxLtvBp: 7_000,
                retentionBp: 2_500,
                sponsor: SPONSOR
            })
        );
    }

    function test_opensWithTheApprovedTerms() public {
        _open();
        (uint256 seniorCap, uint256 juniorCap,,,,,,, ) = controller.terms();
        assertEq(seniorCap, 270_000_000);
        assertEq(juniorCap, 120_000_000);
        assertTrue(controller.open());
    }

    function test_refusesASecondOpening() public {
        _open();
        vm.expectRevert(AnoraFacilityController.AlreadyOpen.selector);
        _open();
    }

    function test_refusesEmptyTranches() public {
        vm.expectRevert(AnoraFacilityController.EmptyTranche.selector);
        vm.prank(COMPLIANCE);
        controller.openFacility(
            AnoraFacilityController.Terms({
                seniorCap: 270_000_000,
                juniorCap: 0,
                approvedIdr: 420_000_000,
                seniorYieldBp: 200,
                juniorYieldBp: 450,
                termDays: 90,
                maxLtvBp: 7_000,
                retentionBp: 2_500,
                sponsor: SPONSOR
            })
        );
    }

    function test_refusesTargetAboveTheApprovedCeiling() public {
        vm.expectRevert(AnoraFacilityController.AboveApproved.selector);
        vm.prank(COMPLIANCE);
        controller.openFacility(
            AnoraFacilityController.Terms({
                seniorCap: 400_000_000,
                juniorCap: 120_000_000,
                approvedIdr: 420_000_000,
                seniorYieldBp: 200,
                juniorYieldBp: 450,
                termDays: 90,
                maxLtvBp: 7_000,
                retentionBp: 2_500,
                sponsor: SPONSOR
            })
        );
    }

    function test_refusesRetentionWithoutASponsor() public {
        vm.expectRevert(AnoraFacilityController.SponsorRequired.selector);
        vm.prank(COMPLIANCE);
        controller.openFacility(
            AnoraFacilityController.Terms({
                seniorCap: 270_000_000,
                juniorCap: 120_000_000,
                approvedIdr: 420_000_000,
                seniorYieldBp: 200,
                juniorYieldBp: 450,
                termDays: 90,
                maxLtvBp: 7_000,
                retentionBp: 2_500,
                sponsor: address(0)
            })
        );
    }

    function test_derivesTheRetainedJuniorMinimum() public {
        _open();
        assertEq(controller.retainedJuniorMinimum(), 30_000_000);
    }
}

contract SubscriptionTest is Test {
    AnoraFacilityController controller;

    address constant ORACLE = address(0xA1);
    address constant SPONSOR = address(0x50);
    address constant BANK = address(0xB0);

    uint256 constant S_CAP = 270_000_000;
    uint256 constant J_CAP = 120_000_000;

    function setUp() public {
        vm.warp(1_000_000);
        controller = new AnoraFacilityController(ORACLE, 1 hours);
        controller.openFacility(
            AnoraFacilityController.Terms({
                seniorCap: S_CAP,
                juniorCap: J_CAP,
                approvedIdr: 420_000_000,
                seniorYieldBp: 200,
                juniorYieldBp: 450,
                termDays: 90,
                maxLtvBp: 7_000,
                retentionBp: 2_500,
                sponsor: SPONSOR
            })
        );
    }

    function _junior(address who, uint256 face) internal {
        vm.prank(who);
        controller.subscribe(AnoraFacilityController.Slice.Junior, face);
    }

    function _senior(address who, uint256 face) internal {
        vm.prank(who);
        controller.subscribe(AnoraFacilityController.Slice.Senior, face);
    }

    function test_refusesSeniorBeforeAnyJunior() public {
        vm.expectRevert(AnoraFacilityController.SeniorNotUnlocked.selector);
        _senior(BANK, 1);
    }

    function test_juniorOpensSeniorInProportion() public {
        _junior(SPONSOR, 30_000_000);
        _senior(BANK, 67_500_000);
        assertEq(controller.committed(AnoraFacilityController.Slice.Senior), 67_500_000);
    }

    function test_refusesOneRupiahAboveTheUnlock() public {
        _junior(SPONSOR, 30_000_000);
        vm.expectRevert(AnoraFacilityController.SeniorNotUnlocked.selector);
        _senior(BANK, 67_500_001);
    }

    function test_refusesJuniorBeyondItsCap() public {
        vm.expectRevert(AnoraFacilityController.ExceedsCap.selector);
        _junior(SPONSOR, J_CAP + 1);
    }

    function test_chargesTheDiscountedPrice() public {
        _junior(SPONSOR, J_CAP);
        assertEq(controller.paid(AnoraFacilityController.Slice.Junior, SPONSOR), 118_683_105);
    }

    function test_fullJuniorUnlocksAllSenior() public {
        _junior(SPONSOR, J_CAP);
        _senior(BANK, S_CAP);
        assertEq(controller.committed(AnoraFacilityController.Slice.Senior), S_CAP);
        assertEq(controller.paid(AnoraFacilityController.Slice.Senior, BANK), 268_675_027);
    }

    function test_splittingASeniorOrderCostsTheSame() public {
        _junior(SPONSOR, J_CAP);
        _senior(BANK, 100_000_000);
        _senior(BANK, 170_000_000);
        assertEq(controller.paid(AnoraFacilityController.Slice.Senior, BANK), 268_675_027);
    }
}

contract ActivationTest is Test {
    AnoraFacilityController controller;

    address constant ORACLE = address(0xA1);
    address constant SPONSOR = address(0x50);
    address constant BANK = address(0xB0);

    uint256 constant S_CAP = 270_000_000;
    uint256 constant J_CAP = 120_000_000;
    uint256 constant GRAMS = 24_000_000;

    function setUp() public {
        vm.warp(1_000_000);
        controller = new AnoraFacilityController(ORACLE, 1 hours);
        controller.openFacility(
            AnoraFacilityController.Terms({
                seniorCap: S_CAP,
                juniorCap: J_CAP,
                approvedIdr: 420_000_000,
                seniorYieldBp: 200,
                juniorYieldBp: 450,
                termDays: 90,
                maxLtvBp: 7_000,
                retentionBp: 2_500,
                sponsor: SPONSOR
            })
        );
    }

    function _report() internal {
        vm.prank(ORACLE);
        controller.reportCollateral(GRAMS, GRAMS, 25_000, 0, block.timestamp, 1, keccak256("e"));
    }

    function _fill() internal {
        vm.prank(SPONSOR);
        controller.subscribe(AnoraFacilityController.Slice.Junior, J_CAP);
        vm.prank(BANK);
        controller.subscribe(AnoraFacilityController.Slice.Senior, S_CAP);
    }

    function test_activatesWhenEveryGateIsSatisfied() public {
        _report();
        _fill();
        controller.confirmRegistry(keccak256("hak-jaminan"));
        controller.activate();
        assertTrue(controller.active());
    }

    function test_refusesUnfilledTranches() public {
        _report();
        vm.prank(SPONSOR);
        controller.subscribe(AnoraFacilityController.Slice.Junior, J_CAP);
        controller.confirmRegistry(keccak256("hak-jaminan"));
        vm.expectRevert(AnoraFacilityController.TrancheNotFilled.selector);
        controller.activate();
    }

    function test_refusesWithoutRegistryConfirmation() public {
        _report();
        _fill();
        vm.expectRevert(AnoraFacilityController.RegistryNotConfirmed.selector);
        controller.activate();
    }

    function test_refusesStaleCollateral() public {
        _report();
        _fill();
        controller.confirmRegistry(keccak256("hak-jaminan"));
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(AnoraFacilityController.ReportTooOld.selector);
        controller.activate();
    }

    function test_refusesWhenSponsorRetainsTooLittleJunior() public {
        _report();
        vm.prank(BANK);
        controller.subscribe(AnoraFacilityController.Slice.Junior, J_CAP);
        vm.prank(BANK);
        controller.subscribe(AnoraFacilityController.Slice.Senior, S_CAP);
        controller.confirmRegistry(keccak256("hak-jaminan"));
        vm.expectRevert(AnoraFacilityController.RetentionNotMet.selector);
        controller.activate();
    }

    function test_refusesIssuedFaceAboveTheCoverageCeiling() public {
        vm.prank(ORACLE);
        controller.reportCollateral(GRAMS / 2, GRAMS / 2, 25_000, 0, block.timestamp, 1, keccak256("e"));
        _fill();
        controller.confirmRegistry(keccak256("hak-jaminan"));
        vm.expectRevert(AnoraFacilityController.CoverageBreached.selector);
        controller.activate();
    }

    function test_refusesASecondActivation() public {
        _report();
        _fill();
        controller.confirmRegistry(keccak256("hak-jaminan"));
        controller.activate();
        vm.expectRevert(AnoraFacilityController.AlreadyActive.selector);
        controller.activate();
    }
}
