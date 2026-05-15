// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PredictionFee
 * @dev Minimal contract to handle prediction round entry fees on Ritual Testnet.
 */
contract PredictionFee {
    address public owner;
    uint256 public constant ENTRY_FEE = 0.0001 ether; // 0.0001 Ritual tokens (assuming 18 decimals)

    event RoundPlayed(address indexed player, uint256 timestamp, uint256 fee);

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Allows a player to enter a prediction round by paying the entry fee.
     */
    function play() external payable {
        require(msg.value == ENTRY_FEE, "Incorrect entry fee: Must be 0.0001 Ritual");
        
        emit RoundPlayed(msg.sender, block.timestamp, msg.value);
    }

    /**
     * @dev Allows the owner to withdraw collected fees.
     */
    function withdraw() external {
        require(msg.sender == owner, "Only owner can withdraw");
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    /**
     * @dev Fallback to receive tokens.
     */
    receive() external payable {}
}
