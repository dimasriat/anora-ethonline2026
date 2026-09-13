// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Settlement} from "../src/Settlement.sol";

contract SettlementTest is Test {
    uint256 constant S = 270_000_000;
    uint256 constant J = 120_000_000;
    uint256 constant F = S + J;

    function _split(uint256 recovered, uint256 costs) internal pure returns (Settlement.Split memory) {
        return Settlement.split(recovered, costs, S, J);
    }

    function test_paysCostsBeforeNoteholders() public pure {
        Settlement.Split memory s = _split(F + 5_000_000, 5_000_000);
        assertEq(s.costsPaid, 5_000_000);
        assertEq(s.senior, S);
        assertEq(s.junior, J);
        assertEq(s.surplus, 0);
    }

    function test_costsCannotExceedRecovered() public pure {
        Settlement.Split memory s = _split(1_000_000, 4_000_000);
        assertEq(s.costsPaid, 1_000_000);
        assertEq(s.senior, 0);
        assertEq(s.junior, 0);
    }

    function test_juniorAbsorbsLossFirst() public pure {
        Settlement.Split memory s = _split(S, 0);
        assertEq(s.senior, S);
        assertEq(s.junior, 0);
        assertEq(s.juniorLoss, J);
        assertEq(s.seniorLoss, 0);
    }

    function test_seniorUntouchedOneRupiahAboveItsFace() public pure {
        Settlement.Split memory s = _split(S + 1, 0);
        assertEq(s.senior, S);
        assertEq(s.junior, 1);
        assertEq(s.seniorLoss, 0);
    }

    function test_seniorLosesOneRupiahBelowItsFace() public pure {
        Settlement.Split memory s = _split(S - 1, 0);
        assertEq(s.senior, S - 1);
        assertEq(s.seniorLoss, 1);
        assertEq(s.juniorLoss, J);
    }

    function test_surplusLeavesTheNoteholders() public pure {
        Settlement.Split memory s = _split(F + 30_000_000, 0);
        assertEq(s.senior, S);
        assertEq(s.junior, J);
        assertEq(s.surplus, 30_000_000);
    }

    function testFuzz_identitiesHold(uint256 recovered, uint256 costs) public pure {
        recovered = bound(recovered, 0, 10 * F);
        costs = bound(costs, 0, 2 * F);
        Settlement.Split memory s = _split(recovered, costs);

        assertEq(s.senior + s.seniorLoss, S);
        assertEq(s.junior + s.juniorLoss, J);
        assertEq(recovered, s.costsPaid + s.senior + s.junior + s.surplus);
        assertTrue(s.seniorLoss == 0 || s.junior == 0);
    }

    function testFuzz_payoutsAreNondecreasingInCash(uint256 a, uint256 b) public pure {
        a = bound(a, 0, 5 * F);
        b = bound(b, a, 5 * F);
        Settlement.Split memory lo = _split(a, 0);
        Settlement.Split memory hi = _split(b, 0);

        assertTrue(hi.senior >= lo.senior);
        assertTrue(hi.junior >= lo.junior);
        assertTrue(hi.senior - lo.senior <= b - a);
    }
}
