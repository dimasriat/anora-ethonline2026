// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Probe {
    uint256 public value;

    event Set(uint256 previous, uint256 next);

    function set(uint256 next) external {
        emit Set(value, next);
        value = next;
    }
}
