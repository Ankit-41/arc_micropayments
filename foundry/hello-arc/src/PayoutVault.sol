// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title PayoutVault — pooled USDC vault with user deposits + owner distributions (Arc Testnet)
/// @notice Zero-arg constructor. Configure via owner-only setters after deploy.
contract PayoutVault {
    address public owner;
    address public platformFeeWallet;  // where fee is sent
    uint256 public feeBps;             // 250 = 2.5%
    IERC20 public usdc;                // must be set before deposit/distribute

    mapping(address => uint256) public userDeposits;
    uint256 public totalPooled;

    event OwnerTransferred(address indexed oldOwner, address indexed newOwner);
    event USDCSet(address indexed token);
    event PlatformFeeWalletSet(address indexed wallet);
    event FeeBpsSet(uint256 feeBps);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Distributed(address[] creators, uint256[] amounts, bytes32 batchId, uint256 totalSent, uint256 fee);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier usdcSet() { require(address(usdc) != address(0), "USDC not set"); _; }

    constructor() {
        owner = msg.sender;
    }

    // ---------- One-time / admin configuration ----------
    function setUSDC(address _usdc) external onlyOwner {
        require(_usdc != address(0), "zero addr");
        usdc = IERC20(_usdc);
        emit USDCSet(_usdc);
    }

    function setPlatformFeeWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "zero addr");
        platformFeeWallet = newWallet;
        emit PlatformFeeWalletSet(newWallet);
    }

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 2000, "fee too high"); // cap at 20%
        feeBps = _feeBps;
        emit FeeBpsSet(_feeBps);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero addr");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ---------- Core ----------
    function deposit(uint256 amount) external usdcSet {
        require(amount > 0, "amount=0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        userDeposits[msg.sender] += amount;
        totalPooled += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external usdcSet {
        require(userDeposits[msg.sender] >= amount, "insufficient");
        userDeposits[msg.sender] -= amount;
        totalPooled -= amount;
        require(usdc.transfer(msg.sender, amount), "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function distribute(address[] calldata creators, uint256[] calldata amounts) external onlyOwner usdcSet {
        require(creators.length == amounts.length, "length mismatch");
        uint256 total;
        for (uint256 i = 0; i < creators.length; i++) total += amounts[i];

        uint256 fee = (total * feeBps) / 10000;
        uint256 totalWithFee = total + fee;
        require(totalWithFee <= totalPooled, "insufficient pooled");

        for (uint256 i = 0; i < creators.length; i++) {
            require(usdc.transfer(creators[i], amounts[i]), "creator transfer failed");
        }
        if (fee > 0) {
            require(platformFeeWallet != address(0), "fee wallet not set");
            require(usdc.transfer(platformFeeWallet, fee), "fee transfer failed");
        }

        totalPooled -= totalWithFee;
        emit Distributed(creators, amounts, keccak256(abi.encodePacked(block.timestamp, totalWithFee)), total, fee);
    }
}
