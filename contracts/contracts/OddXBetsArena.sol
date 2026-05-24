// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract OddXBetsArena {
    enum TicketType {
        Game,
        Prediction
    }

    struct Ticket {
        address player;
        TicketType ticketType;
        bytes32 scopeId;
        uint8 outcomeId;
        address token;
        uint256 stake;
        uint256 payout;
        uint64 createdAt;
        bool finalised;
        bool claimed;
        bool won;
    }

    address public owner;
    uint256 public ticketCount;

    mapping(uint256 => Ticket) public tickets;
    mapping(bytes32 => bool) public openGames;
    mapping(bytes32 => bool) public openMarkets;
    mapping(address => bool) public supportedTokens;

    bool private locked;

    event GameStatusChanged(bytes32 indexed gameId, bool isOpen);
    event MarketStatusChanged(bytes32 indexed marketId, bool isOpen);
    event SupportedTokenChanged(address indexed token, bool isAllowed);
    event TicketCreated(
        uint256 indexed ticketId,
        address indexed player,
        TicketType indexed ticketType,
        bytes32 scopeId,
        uint8 outcomeId,
        address token,
        uint256 stake
    );
    event TicketFinalised(uint256 indexed ticketId, address indexed player, bool won, uint256 payout);
    event TicketClaimed(uint256 indexed ticketId, address indexed player, address token, uint256 payout);
    event NativeDeposited(address indexed from, uint256 amount);
    event NativeWithdrawn(address indexed to, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "OddXBetsArena: not owner");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "OddXBetsArena: reentrant");
        locked = true;
        _;
        locked = false;
    }

    constructor(address[] memory initialTokens) {
        owner = msg.sender;

        for (uint256 i = 0; i < initialTokens.length; i++) {
            address token = initialTokens[i];
            if (token != address(0)) {
                supportedTokens[token] = true;
                emit SupportedTokenChanged(token, true);
            }
        }
    }

    receive() external payable {
        emit NativeDeposited(msg.sender, msg.value);
    }

    function setGameOpen(bytes32 gameId, bool isOpen) external onlyOwner {
        openGames[gameId] = isOpen;
        emit GameStatusChanged(gameId, isOpen);
    }

    function setMarketOpen(bytes32 marketId, bool isOpen) external onlyOwner {
        openMarkets[marketId] = isOpen;
        emit MarketStatusChanged(marketId, isOpen);
    }

    function setSupportedToken(address token, bool isAllowed) external onlyOwner {
        require(token != address(0), "OddXBetsArena: native token auto-supported");
        supportedTokens[token] = isAllowed;
        emit SupportedTokenChanged(token, isAllowed);
    }

    function joinRound(address paymentToken, bytes32 gameId, uint256 amount) external payable nonReentrant returns (uint256 ticketId) {
        require(amount > 0, "OddXBetsArena: amount required");
        _collectPayment(paymentToken, amount);

        ticketId = _recordTicket(TicketType.Game, gameId, 0, paymentToken, amount);
    }

    function placePrediction(
        address paymentToken,
        bytes32 marketId,
        uint8 outcomeId,
        uint256 amount
    ) external payable nonReentrant returns (uint256 ticketId) {
        require(amount > 0, "OddXBetsArena: amount required");
        _collectPayment(paymentToken, amount);

        ticketId = _recordTicket(TicketType.Prediction, marketId, outcomeId, paymentToken, amount);
    }

    function finaliseTicket(uint256 ticketId, bool won, uint256 payout) external onlyOwner {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.player != address(0), "OddXBetsArena: unknown ticket");
        require(!ticket.finalised, "OddXBetsArena: already finalised");

        ticket.finalised = true;
        ticket.won = won;
        ticket.payout = payout;

        emit TicketFinalised(ticketId, ticket.player, won, payout);
    }

    function cashOut(uint256 ticketId) external nonReentrant {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.player != address(0), "OddXBetsArena: unknown ticket");
        require(ticket.player == msg.sender, "OddXBetsArena: not ticket owner");
        require(ticket.finalised, "OddXBetsArena: not finalised");
        require(!ticket.claimed, "OddXBetsArena: already claimed");

        ticket.claimed = true;

        if (ticket.payout > 0) {
            _sendPayout(ticket.token, ticket.player, ticket.payout);
        }

        emit TicketClaimed(ticketId, ticket.player, ticket.token, ticket.payout);
    }

    function withdrawNative(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(address(this).balance >= amount, "OddXBetsArena: insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "OddXBetsArena: native withdraw failed");
        emit NativeWithdrawn(to, amount);
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(token != address(0), "OddXBetsArena: native withdraw uses withdrawNative");
        require(supportedTokens[token], "OddXBetsArena: token not supported");
        _safeTransfer(token, to, amount);
        emit TokenWithdrawn(token, to, amount);
    }

    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        return tickets[ticketId];
    }

    function _recordTicket(
        TicketType ticketType,
        bytes32 scopeId,
        uint8 outcomeId,
        address paymentToken,
        uint256 amount
    ) internal returns (uint256 ticketId) {
        ticketId = ticketCount++;

        tickets[ticketId] = Ticket({
            player: msg.sender,
            ticketType: ticketType,
            scopeId: scopeId,
            outcomeId: outcomeId,
            token: paymentToken,
            stake: amount,
            payout: 0,
            createdAt: uint64(block.timestamp),
            finalised: false,
            claimed: false,
            won: false
        });

        emit TicketCreated(ticketId, msg.sender, ticketType, scopeId, outcomeId, paymentToken, amount);
    }

    function _collectPayment(address paymentToken, uint256 amount) internal {
        if (paymentToken == address(0)) {
            require(msg.value == amount, "OddXBetsArena: wrong native value");
            return;
        }

        require(msg.value == 0, "OddXBetsArena: unexpected native value");
        require(supportedTokens[paymentToken], "OddXBetsArena: token not supported");
        _safeTransferFrom(paymentToken, msg.sender, address(this), amount);
    }

    function _sendPayout(address paymentToken, address to, uint256 amount) internal {
        if (paymentToken == address(0)) {
            require(address(this).balance >= amount, "OddXBetsArena: insufficient native balance");
            (bool success, ) = payable(to).call{value: amount}("");
            require(success, "OddXBetsArena: native payout failed");
            return;
        }

        require(supportedTokens[paymentToken], "OddXBetsArena: token not supported");
        _safeTransfer(paymentToken, to, amount);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "OddXBetsArena: transferFrom failed");
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "OddXBetsArena: transfer failed");
    }
}
