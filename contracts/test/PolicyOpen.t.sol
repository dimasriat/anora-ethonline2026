// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AnoraFacilityController} from "../src/AnoraFacilityController.sol";

contract PolicyOpenTest is Test {
    AnoraFacilityController controller;

    address constant ORACLE = address(0xA1);
    address constant SPONSOR = address(0xC0FFEE);
    address constant ANYONE = address(0xBEEF);
    uint256 constant MAX_AGE = 1 hours;

    uint256 constant GRAMS = 24_000_000;
    uint256 constant PRICE_PER_KG = 25_000;
    uint256 constant REQUESTED = 390_000_000;

    function _policy() internal pure returns (AnoraFacilityController.Policy memory) {
        return AnoraFacilityController.Policy({
            maxLtvBp: 7_000,
            juniorNumerator: 4,
            juniorDenominator: 13,
            seniorYieldBp: 200,
            juniorYieldBp: 450,
            termDays: 90,
            retentionBp: 2_500,
            sponsor: SPONSOR
        });
    }

    function setUp() public {
        vm.warp(1_000_000);
        controller = new AnoraFacilityController(ORACLE, address(this), MAX_AGE, _policy());
    }

    function _report() internal {
        vm.prank(ORACLE);
        controller.reportCollateral(GRAMS, GRAMS, PRICE_PER_KG, 0, block.timestamp, 1, keccak256("evidence"));
    }

    function test_anyoneMayOpenAFacilityOnceCollateralIsObserved() public {
        _report();
        vm.prank(ANYONE);
        controller.openFacility(REQUESTED);
        assertTrue(controller.open());
    }

    function test_derivesTheTrancheCapsInsteadOfAcceptingThem() public {
        _report();
        vm.prank(ANYONE);
        controller.openFacility(REQUESTED);

        (uint256 seniorCap, uint256 juniorCap,,,,,,,) = controller.terms();
        assertEq(juniorCap, 120_000_000);
        assertEq(seniorCap, 270_000_000);
    }

    function test_leavesTheUnusedCeilingAsHeadroom() public {
        _report();
        vm.prank(ANYONE);
        controller.openFacility(REQUESTED);

        (,, uint256 approvedIdr,,,,,,) = controller.terms();
        assertEq(approvedIdr, 420_000_000);
    }

    function test_capsTheRequestAtWhatTheCollateralCarries() public {
        _report();
        vm.prank(ANYONE);
        controller.openFacility(500_000_000);

        (uint256 seniorCap, uint256 juniorCap,,,,,,,) = controller.terms();
        assertEq(seniorCap + juniorCap, 420_000_000);
    }

    function test_takesYieldsAndTermFromThePolicy() public {
        _report();
        vm.prank(ANYONE);
        controller.openFacility(REQUESTED);

        (,,, uint256 seniorYieldBp, uint256 juniorYieldBp, uint256 termDays,,,) = controller.terms();
        assertEq(seniorYieldBp, 200);
        assertEq(juniorYieldBp, 450);
        assertEq(termDays, 90);
    }

    function test_refusesToOpenBeforeAnyCollateralIsObserved() public {
        vm.expectRevert(AnoraFacilityController.NoCollateralYet.selector);
        vm.prank(ANYONE);
        controller.openFacility(REQUESTED);
    }

    function test_refusesToOpenOnAStaleObservation() public {
        _report();
        vm.warp(block.timestamp + MAX_AGE + 1);
        vm.expectRevert(AnoraFacilityController.ReportTooOld.selector);
        vm.prank(ANYONE);
        controller.openFacility(REQUESTED);
    }

    function test_refusesAnEmptyRequest() public {
        _report();
        vm.expectRevert(AnoraFacilityController.EmptyTranche.selector);
        vm.prank(ANYONE);
        controller.openFacility(0);
    }

    function test_opensOnlyOnce() public {
        _report();
        vm.prank(ANYONE);
        controller.openFacility(REQUESTED);
        vm.expectRevert(AnoraFacilityController.AlreadyOpen.selector);
        vm.prank(ANYONE);
        controller.openFacility(REQUESTED);
    }
}
