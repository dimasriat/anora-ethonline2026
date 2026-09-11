// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library Settlement {
    struct Split {
        uint256 costsPaid;
        uint256 senior;
        uint256 junior;
        uint256 seniorLoss;
        uint256 juniorLoss;
        uint256 surplus;
    }

    function split(uint256 recovered, uint256 costs, uint256 seniorFace, uint256 juniorFace)
        internal
        pure
        returns (Split memory result)
    {
        result.costsPaid = costs < recovered ? costs : recovered;
        uint256 available = recovered - result.costsPaid;

        result.senior = available < seniorFace ? available : seniorFace;
        uint256 afterSenior = available - result.senior;

        result.junior = afterSenior < juniorFace ? afterSenior : juniorFace;

        result.seniorLoss = seniorFace - result.senior;
        result.juniorLoss = juniorFace - result.junior;
        result.surplus = afterSenior - result.junior;
    }
}
