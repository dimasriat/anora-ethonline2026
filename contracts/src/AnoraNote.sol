// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract AnoraNote {
    enum State {
        Reserved,
        Active,
        Redeemed
    }

    struct Tranche {
        uint256 capacity;
        uint256 issued;
    }

    error NotOperator();
    error WrongState(State expected, State actual);
    error UnknownTranche(bytes32 partition);
    error NotAllowlisted(address holder);
    error MandateExcludesTranche(address holder, bytes32 partition);
    error ExceedsCapacity(bytes32 partition, uint256 remaining);
    error InsufficientUnits(uint256 held);
    error TrancheNotFilled(bytes32 partition, uint256 shortfall);

    event Allowlisted(address indexed holder, bytes32[] mandate);
    event Revoked(address indexed holder);
    event Allocated(bytes32 indexed partition, address indexed to, uint256 units);
    event Transferred(bytes32 indexed partition, address indexed from, address indexed to, uint256 units);
    event StateChanged(State state);

    address public immutable operator;
    string public series;
    string public underlying;
    State public state;

    bytes32[] private _partitions;
    mapping(bytes32 => Tranche) public tranche;
    mapping(bytes32 => bool) private _known;

    mapping(address => bool) public allowlisted;
    mapping(address => mapping(bytes32 => bool)) public mandate;
    mapping(bytes32 => mapping(address => uint256)) public balanceOf;

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier inState(State expected) {
        if (state != expected) revert WrongState(expected, state);
        _;
    }

    constructor(
        string memory series_,
        string memory underlying_,
        bytes32[] memory partitions_,
        uint256[] memory capacities_
    ) {
        operator = msg.sender;
        series = series_;
        underlying = underlying_;
        state = State.Reserved;

        for (uint256 i = 0; i < partitions_.length; i++) {
            _partitions.push(partitions_[i]);
            _known[partitions_[i]] = true;
            tranche[partitions_[i]].capacity = capacities_[i];
        }
    }

    function partitions() external view returns (bytes32[] memory) {
        return _partitions;
    }

    function allow(address holder, bytes32[] calldata allowed) external onlyOperator {
        allowlisted[holder] = true;
        for (uint256 i = 0; i < allowed.length; i++) {
            if (!_known[allowed[i]]) revert UnknownTranche(allowed[i]);
            mandate[holder][allowed[i]] = true;
        }
        emit Allowlisted(holder, allowed);
    }

    function revoke(address holder) external onlyOperator {
        allowlisted[holder] = false;
        emit Revoked(holder);
    }

    function allocate(bytes32 partition, address to, uint256 units)
        external
        onlyOperator
        inState(State.Reserved)
    {
        _requireEligible(to, partition);

        Tranche storage t = tranche[partition];
        uint256 remaining = t.capacity - t.issued;
        if (units > remaining) revert ExceedsCapacity(partition, remaining);

        t.issued += units;
        balanceOf[partition][to] += units;
        emit Allocated(partition, to, units);
    }

    function activate() external onlyOperator inState(State.Reserved) {
        for (uint256 i = 0; i < _partitions.length; i++) {
            Tranche storage t = tranche[_partitions[i]];
            if (t.issued < t.capacity) {
                revert TrancheNotFilled(_partitions[i], t.capacity - t.issued);
            }
        }
        state = State.Active;
        emit StateChanged(state);
    }

    function redeem() external onlyOperator inState(State.Active) {
        state = State.Redeemed;
        emit StateChanged(state);
    }

    function transfer(bytes32 partition, address to, uint256 units) external inState(State.Active) {
        _requireEligible(to, partition);

        uint256 held = balanceOf[partition][msg.sender];
        if (units > held) revert InsufficientUnits(held);

        balanceOf[partition][msg.sender] = held - units;
        balanceOf[partition][to] += units;
        emit Transferred(partition, msg.sender, to, units);
    }

    function _requireEligible(address holder, bytes32 partition) private view {
        if (!_known[partition]) revert UnknownTranche(partition);
        if (!allowlisted[holder]) revert NotAllowlisted(holder);
        if (!mandate[holder][partition]) revert MandateExcludesTranche(holder, partition);
    }
}
