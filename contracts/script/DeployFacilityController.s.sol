// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {AnoraFacilityController} from "../src/AnoraFacilityController.sol";

contract DeployFacilityController is Script {
    function run() external {
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        address compliance = vm.envAddress("COMPLIANCE_ADDRESS");
        uint256 maxAge = vm.envUint("COLLATERAL_MAX_AGE");

        AnoraFacilityController.Policy memory policy = AnoraFacilityController.Policy({
            maxLtvBp: vm.envUint("POLICY_MAX_LTV_BP"),
            juniorNumerator: vm.envUint("POLICY_JUNIOR_NUMERATOR"),
            juniorDenominator: vm.envUint("POLICY_JUNIOR_DENOMINATOR"),
            seniorYieldBp: vm.envUint("POLICY_SENIOR_YIELD_BP"),
            juniorYieldBp: vm.envUint("POLICY_JUNIOR_YIELD_BP"),
            termDays: vm.envUint("POLICY_TERM_DAYS"),
            retentionBp: vm.envUint("POLICY_RETENTION_BP"),
            sponsor: vm.envAddress("POLICY_SPONSOR")
        });

        vm.startBroadcast();
        new AnoraFacilityController(oracle, compliance, maxAge, policy);
        vm.stopBroadcast();
    }
}
