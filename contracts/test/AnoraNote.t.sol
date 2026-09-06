// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AnoraNote} from "../src/AnoraNote.sol";

contract AnoraNoteTest is Test {
    bytes32 constant SENIOR = keccak256("SENIOR");
    bytes32 constant JUNIOR = keccak256("JUNIOR");

    AnoraNote note;
    address bank = address(0xB1);
    address coop = address(0xC0);
    address meridian = address(0xDEAD);

    function setUp() public {
        bytes32[] memory parts = new bytes32[](2);
        parts[0] = SENIOR;
        parts[1] = JUNIOR;

        uint256[] memory caps = new uint256[](2);
        caps[0] = 270_000_000;
        caps[1] = 120_000_000;

        note = new AnoraNote("ANR-SRG-024", "SRG-TEH-024", parts, caps);

        note.allow(bank, _one(SENIOR));
        note.allow(coop, _one(JUNIOR));
    }

    function _one(bytes32 p) internal pure returns (bytes32[] memory out) {
        out = new bytes32[](1);
        out[0] = p;
    }

    function test_issues_reserved() public view {
        assertEq(uint256(note.state()), uint256(AnoraNote.State.Reserved));
        assertEq(note.series(), "ANR-SRG-024");
    }

    function test_allocates_within_capacity() public {
        note.allocate(SENIOR, bank, 270_000_000);
        assertEq(note.balanceOf(SENIOR, bank), 270_000_000);
    }

    function test_refuses_allocation_beyond_capacity() public {
        vm.expectRevert(
            abi.encodeWithSelector(AnoraNote.ExceedsCapacity.selector, SENIOR, 270_000_000)
        );
        note.allocate(SENIOR, bank, 270_000_001);
    }

    function test_refuses_holder_who_is_not_allowlisted() public {
        vm.expectRevert(abi.encodeWithSelector(AnoraNote.NotAllowlisted.selector, meridian));
        note.allocate(JUNIOR, meridian, 10_000_000);
    }

    function test_refuses_tranche_outside_mandate() public {
        vm.expectRevert(
            abi.encodeWithSelector(AnoraNote.MandateExcludesTranche.selector, bank, JUNIOR)
        );
        note.allocate(JUNIOR, bank, 10_000_000);
    }

    function test_only_operator_allocates() public {
        vm.prank(bank);
        vm.expectRevert(AnoraNote.NotOperator.selector);
        note.allocate(SENIOR, bank, 1);
    }

    function _fill() internal {
        note.allocate(SENIOR, bank, 270_000_000);
        note.allocate(JUNIOR, coop, 120_000_000);
    }

    function test_refuses_activation_while_a_tranche_is_short() public {
        note.allocate(SENIOR, bank, 269_999_999);
        note.allocate(JUNIOR, coop, 120_000_000);
        vm.expectRevert(
            abi.encodeWithSelector(AnoraNote.TrancheNotFilled.selector, SENIOR, 1)
        );
        note.activate();
    }

    function test_transfer_requires_active_state() public {
        note.allocate(SENIOR, bank, 100_000_000);
        address other = address(0xB2);
        note.allow(other, _one(SENIOR));

        vm.prank(bank);
        vm.expectRevert(
            abi.encodeWithSelector(
                AnoraNote.WrongState.selector, AnoraNote.State.Active, AnoraNote.State.Reserved
            )
        );
        note.transfer(SENIOR, other, 1);
    }

    function test_transfer_between_approved_holders() public {
        _fill();
        address other = address(0xB2);
        note.allow(other, _one(SENIOR));
        note.activate();

        vm.prank(bank);
        note.transfer(SENIOR, other, 40_000_000);

        assertEq(note.balanceOf(SENIOR, bank), 230_000_000);
        assertEq(note.balanceOf(SENIOR, other), 40_000_000);
    }

    function test_transfer_refused_to_unapproved_wallet() public {
        _fill();
        note.activate();

        vm.prank(bank);
        vm.expectRevert(abi.encodeWithSelector(AnoraNote.NotAllowlisted.selector, meridian));
        note.transfer(SENIOR, meridian, 1);
    }

    function test_transfer_refused_when_mandate_excludes_tranche() public {
        _fill();
        note.activate();

        vm.prank(coop);
        vm.expectRevert(
            abi.encodeWithSelector(AnoraNote.MandateExcludesTranche.selector, bank, JUNIOR)
        );
        note.transfer(JUNIOR, bank, 1);
    }

    function test_transfer_refused_beyond_holdings() public {
        _fill();
        address other = address(0xB2);
        note.allow(other, _one(SENIOR));
        note.activate();

        vm.prank(bank);
        vm.expectRevert(abi.encodeWithSelector(AnoraNote.InsufficientUnits.selector, 270_000_000));
        note.transfer(SENIOR, other, 270_000_001);
    }

    function test_revocation_blocks_further_receipt() public {
        _fill();
        note.activate();
        note.revoke(bank);

        vm.expectRevert(abi.encodeWithSelector(AnoraNote.NotAllowlisted.selector, bank));
        vm.prank(coop);
        note.transfer(SENIOR, bank, 1);
    }

    function test_lifecycle_states() public {
        _fill();
        note.activate();
        assertEq(uint256(note.state()), uint256(AnoraNote.State.Active));
        note.redeem();
        assertEq(uint256(note.state()), uint256(AnoraNote.State.Redeemed));
    }

    function testFuzz_allocation_never_exceeds_capacity(uint256 units) public {
        units = bound(units, 0, 270_000_000);
        note.allocate(SENIOR, bank, units);
        (uint256 capacity, uint256 issued) = note.tranche(SENIOR);
        assertLe(issued, capacity);
    }
}
