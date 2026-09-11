// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {AnoraFacilityController} from "../src/AnoraFacilityController.sol";

contract DeployFacilityController is Script {
    function run() external {
        address oracle = vm.envAddress("ORACLE_ADDRESS");
        address compliance = vm.envAddress("COMPLIANCE_ADDRESS");
        uint256 maxAge = vm.envUint("COLLATERAL_MAX_AGE");

        vm.startBroadcast();
        new AnoraFacilityController(oracle, compliance, maxAge);
        vm.stopBroadcast();
    }
}
