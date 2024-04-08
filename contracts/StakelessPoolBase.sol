// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IGauge.sol";

/// @title Simplified abstract stakeless pool for multiple rewards
/// @author belbix
/// @author a17
abstract contract StakelessPoolBase is IGauge, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // *************************************************************
    //                        CONSTANTS
    // *************************************************************

    /// @dev Precision for internal calculations
    uint internal constant _PRECISION = 10 ** 27;

    // *************************************************************
    //                        VARIABLES
    // *************************************************************

    address public governance;

    /// @dev Rewards are released over this period
    uint public duration;

    /// @dev This token will be always allowed as reward
    address public defaultRewardToken;

    /// @dev Supply adjusted on derived balance logic. Use for rewards boost.
    uint public derivedSupply;

    /// @dev Account => Staking token virtual balance. Can be adjusted regarding rewards boost logic.
    mapping(address => uint) public derivedBalances;

    /// @dev Account => User virtual balance of staking token.
    mapping(address => uint) public balanceOf;

    /// @dev Total amount of attached staking tokens
    uint public totalSupply;

    /// @dev Reward token => Reward rate with precision _PRECISION
    mapping(address => uint) public rewardRate;

    /// @dev Reward token => Reward finish period in timestamp.
    mapping(address => uint) public periodFinish;

    /// @dev Reward token => Last updated time for reward token for internal calculations.
    mapping(address => uint) public lastUpdateTime;

    /// @dev Reward token => Part of SNX pool logic. Internal snapshot of reward per token value.
    mapping(address => uint) public rewardPerTokenStored;

    /// @dev Reward token => Account => amount. Already paid reward amount for snapshot calculation.
    mapping(address => mapping(address => uint)) public userRewardPerTokenPaid;

    /// @dev Reward token => Account => amount. Snapshot of user's reward per token.
    mapping(address => mapping(address => uint)) public rewards;

    /// @dev Allowed reward tokens for staking token
    address[] public rewardTokens;

    /// @dev Allowed reward tokens for staking token stored in map for fast check.
    mapping(address => bool) public isRewardToken;

    /// @notice account => recipient. The recipient will receive all rewards for this account.
    mapping(address => address) public rewardsRedirect;

    // *************************************************************
    //                        EVENTS
    // *************************************************************

    event BalanceIncreased(address indexed account, uint amount);
    event BalanceDecreased(address indexed account, uint amount);
    event NotifyReward(address indexed from, address indexed reward, uint amount);
    event ClaimRewards(address indexed account, address indexed reward, uint amount, address recepient);

    // *************************************************************
    //                        ERRORS
    // *************************************************************

    error AlreadyRegistered();
    error RewardsNotEnded();
    error NotAllowed();
    error NotRewardToken();
    error ZeroAmount();
    error AmountShouldBeHigherThanRemainingRewards();

    // *************************************************************
    //                        INIT
    // *************************************************************

    constructor(address defaultRewardToken_, uint duration_, address governance_) {
        defaultRewardToken = defaultRewardToken_;
        duration = duration_;
        governance = governance_;
    }

    // *************************************************************
    //                        RESTRICTIONS
    // *************************************************************

    modifier onlyAllowedContracts() {
        _requireGov();
        _;
    }

    // *************************************************************
    //                            VIEWS
    // *************************************************************

    /// @dev Length of rewards tokens array for given token
    function rewardTokensLength() external view returns (uint) {
        return rewardTokens.length;
    }

    /// @dev Reward paid for token for the current period.
    function rewardPerToken(address rewardToken) public view returns (uint) {
        uint _derivedSupply = derivedSupply;
        if (_derivedSupply == 0) {
            return rewardPerTokenStored[rewardToken];
        }

        return rewardPerTokenStored[rewardToken]
            +
            (lastTimeRewardApplicable(rewardToken) - lastUpdateTime[rewardToken])
            * rewardRate[rewardToken]
            / _derivedSupply;
    }

    /// @dev Returns the last time the reward was modified or periodFinish if the reward has ended
    function lastTimeRewardApplicable(address rewardToken) public view returns (uint) {
        uint _periodFinish = periodFinish[rewardToken];
        return block.timestamp < _periodFinish ? block.timestamp : _periodFinish;
    }

    /// @dev Balance of holder adjusted with specific rules for boost calculation.
    ///      Supposed to be implemented in a parent contract
    ///      Adjust user balance with some logic, like boost logic.
    function derivedBalance(address account) public view virtual returns (uint) {
        return balanceOf[account];
    }

    /// @dev Amount of reward tokens left for the current period
    function left(address rewardToken) public view returns (uint) {
        uint _periodFinish = periodFinish[rewardToken];
        if (block.timestamp >= _periodFinish) return 0;
        uint remaining = _periodFinish - block.timestamp;
        return remaining * rewardRate[rewardToken] / _PRECISION;
    }

    /// @dev Approximate of earned rewards ready to claim
    function earned(address rewardToken, address account) public view returns (uint) {
        return derivedBalance(account)
        * (rewardPerToken(rewardToken) - userRewardPerTokenPaid[rewardToken][account])
        / _PRECISION
            + rewards[rewardToken][account];
    }

    // *************************************************************
    //                  OPERATOR ACTIONS
    // *************************************************************

    /// @dev Whitelist reward token for staking token. Only operator can do it.
    function registerRewardToken(address rewardToken) external onlyAllowedContracts {
        if (isRewardToken[rewardToken]) {
            revert AlreadyRegistered();
        }
        isRewardToken[rewardToken] = true;
        rewardTokens.push(rewardToken);
    }

    /// @dev Remove from whitelist reward token for staking token. Only operator can do it.
    ///      We assume that the first token can not be removed.
    function removeRewardToken(address rewardToken) external onlyAllowedContracts {
        if (periodFinish[rewardToken] >= block.timestamp) {
            revert RewardsNotEnded();
        }
        if (!isRewardToken[rewardToken]) {
            revert NotRewardToken();
        }

        isRewardToken[rewardToken] = false;
        uint length = rewardTokens.length;
        uint i = 0;
        for (; i < length; i++) {
            address t = rewardTokens[i];
            if (t == rewardToken) {
                break;
            }
        }
        // if isRewardToken map and rewardTokens array changed accordingly the token always exist
        rewardTokens[i] = rewardTokens[length - 1];
        rewardTokens.pop();
    }

    /// @dev Account or governance can setup a redirect of all rewards.
    ///      It needs for 3rd party contracts integrations.
    function setRewardsRedirect(address account, address recipient) external {
        if (msg.sender != account && msg.sender != governance) {
            revert NotAllowed();
        }
        rewardsRedirect[account] = recipient;
    }

    // *************************************************************
    //                      BALANCE
    // *************************************************************

    /// @dev Assume to be called when linked token balance changes.
    function _registerBalanceIncreasing(
        address account,
        uint amount
    ) internal virtual nonReentrant {
        if (amount == 0) {
            revert ZeroAmount();
        }

        _increaseBalance(account, amount);
        emit BalanceIncreased(account, amount);
    }

    function _increaseBalance(
        address account,
        uint amount
    ) internal virtual {
        _updateRewardForAllTokens(account);
        totalSupply += amount;
        balanceOf[account] += amount;
        _updateDerivedBalance(account);
    }

    /// @dev Assume to be called when linked token balance changes.
    function _registerBalanceDecreasing(
        address account,
        uint amount
    ) internal nonReentrant virtual {
        _decreaseBalance(account, amount);
        emit BalanceDecreased(account, amount);
    }

    function _decreaseBalance(
        address account,
        uint amount
    ) internal virtual {
        _updateRewardForAllTokens(account);
        totalSupply -= amount;
        balanceOf[account] -= amount;
        _updateDerivedBalance(account);
    }

    function _updateDerivedBalance(address account) internal {
        uint __derivedBalance = derivedBalances[account];
        derivedSupply -= __derivedBalance;
        __derivedBalance = derivedBalance(account);
        derivedBalances[account] = __derivedBalance;
        derivedSupply += __derivedBalance;
    }

    // *************************************************************
    //                          CLAIM
    // *************************************************************

    /// @dev Caller should implement restriction checks
    function _getReward(
        address account,
        address[] memory rewardTokens_,
        address recipient
    ) internal nonReentrant virtual {
        address newRecipient = rewardsRedirect[recipient];
        if (newRecipient != address(0)) {
            recipient = newRecipient;
        }
        if (recipient != msg.sender) {
            revert NotAllowed();
        }

        _updateDerivedBalance(account);

        uint len = rewardTokens_.length;

        for (uint i; i < len; ++i) {
            address rewardToken = rewardTokens_[i];
            _updateReward(rewardToken, account);

            uint _reward = rewards[rewardToken][account];
            if (_reward != 0) {
                rewards[rewardToken][account] = 0;
                IERC20(rewardToken).transfer(recipient, _reward);
            }

            emit ClaimRewards(account, rewardToken, _reward, recipient);
        }
    }

    // *************************************************************
    //                    REWARDS CALCULATIONS
    // *************************************************************

    function _updateRewardForAllTokens(address account) internal {
        address[] memory rts = rewardTokens;
        uint length = rts.length;
        for (uint i; i < length; ++i) {
            _updateReward(rts[i], account);
        }
        _updateReward(defaultRewardToken, account);
    }

    function _updateReward(address rewardToken, address account) internal {
        uint _rewardPerTokenStored = rewardPerToken(rewardToken);
        rewardPerTokenStored[rewardToken] = _rewardPerTokenStored;
        lastUpdateTime[rewardToken] = lastTimeRewardApplicable(rewardToken);
        if (account != address(0)) {
            rewards[rewardToken][account] = earned(rewardToken, account);
            userRewardPerTokenPaid[rewardToken][account] = _rewardPerTokenStored;
        }
    }

    // *************************************************************
    //                         NOTIFY
    // *************************************************************

    /// @param transferRewards False mean that the given amount is already sent to the balance
    function _notifyRewardAmount(
        address rewardToken,
        uint amount,
        bool transferRewards
    ) internal virtual {
        if (amount == 0) {
            revert ZeroAmount();
        }
        if (defaultRewardToken != rewardToken && !isRewardToken[rewardToken]) {
            revert NotRewardToken();
        }

        _updateReward(rewardToken, address(0));
        uint _duration = duration;

        if (transferRewards) {
            uint balanceBefore = IERC20(rewardToken).balanceOf(address(this));
            IERC20(rewardToken).transferFrom(msg.sender, address(this), amount);
            // refresh amount if token was taxable
            amount = IERC20(rewardToken).balanceOf(address(this)) - balanceBefore;
        }
        // if transferRewards=false need to wisely use it in implementation!

        if (block.timestamp >= periodFinish[rewardToken]) {
            rewardRate[rewardToken] = amount * _PRECISION / _duration;
        } else {
            uint remaining = periodFinish[rewardToken] - block.timestamp;
            uint _left = remaining * rewardRate[rewardToken];
            // rewards should not extend period infinity, only higher amount allowed
            if (amount <= _left / _PRECISION) {
                revert AmountShouldBeHigherThanRemainingRewards();
            }
            rewardRate[rewardToken] = (amount * _PRECISION + _left) / _duration;
        }

        lastUpdateTime[rewardToken] = block.timestamp;
        periodFinish[rewardToken] = block.timestamp + _duration;
        emit NotifyReward(msg.sender, rewardToken, amount);
    }

    // *************************************************************
    //                         ACCESS
    // *************************************************************

    function _requireGov() internal view {
        if (msg.sender != governance) {
            revert NotAllowed();
        }
    }
}
