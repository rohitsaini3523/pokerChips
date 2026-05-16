// ========================================
// POKER BETTING MANAGER - JAVASCRIPT
// ========================================

// ====================
// GLOBAL STATE
// ====================
const gameState = {
    players: [],
    currentPlayerIndex: 0,
    pot: 0,
    roundNumber: 1,
    currentBet: 0,
    roundStartingBet: 0,
    gameStarted: false,
    history: [],
    roundPotHistory: [],
    playersWhoHaveActedThisRound: new Set(), // Track who has acted in current betting round
    bettingRoundNumber: 0, // Track betting rounds
};

const playersData = {
    // Will store: { name, balance, totalWon, totalLost, currentBet, status, startingBalance }
};

// ====================
// DOM ELEMENTS
// ====================
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');
const playerCountInput = document.getElementById('playerCount');
const startingAmountInput = document.getElementById('startingAmount');
const playerSetupList = document.getElementById('playerSetupList');
const startGameBtn = document.getElementById('startGameBtn');
const decPlayersBtn = document.getElementById('decPlayersBtn');
const incPlayersBtn = document.getElementById('incPlayersBtn');

const playersContainer = document.getElementById('playersContainer');
const potAmount = document.getElementById('potAmount');
const roundNumber = document.getElementById('roundNumber');
const historyLog = document.getElementById('historyLog');
const actionButtons = document.getElementById('actionButtons');

const raiseModal = document.getElementById('raiseModal');
const winnerModal = document.getElementById('winnerModal');
const moneyTrackingModal = document.getElementById('moneyTrackingModal');

// ====================
// SETUP SCREEN LOGIC
// ====================

// Update player count
decPlayersBtn.addEventListener('click', () => {
    const count = parseInt(playerCountInput.value);
    if (count > 2) {
        playerCountInput.value = count - 1;
        updatePlayerSetupList();
    }
});

incPlayersBtn.addEventListener('click', () => {
    const count = parseInt(playerCountInput.value);
    if (count < 10) {
        playerCountInput.value = count + 1;
        updatePlayerSetupList();
    }
});

playerCountInput.addEventListener('change', updatePlayerSetupList);
startingAmountInput.addEventListener('change', updatePlayerSetupList);

function updatePlayerSetupList() {
    const count = parseInt(playerCountInput.value);
    const amount = parseInt(startingAmountInput.value);

    playerSetupList.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-setup-item';
        playerItem.innerHTML = `
            <span>Player ${i + 1}:</span>
            <input type="text" placeholder="Player Name" class="player-name-input" data-index="${i}">
        `;
        playerSetupList.appendChild(playerItem);
    }
}

startGameBtn.addEventListener('click', validateAndStartGame);

function validateAndStartGame() {
    const count = parseInt(playerCountInput.value);
    const amount = parseInt(startingAmountInput.value);

    // Validation
    if (count < 2 || count > 10) {
        alert('Players must be between 2 and 10');
        return;
    }

    if (amount <= 0) {
        alert('Starting amount must be greater than 0');
        return;
    }

    // Collect player names
    const nameInputs = document.querySelectorAll('.player-name-input');
    gameState.players = [];

    nameInputs.forEach((input, index) => {
        const name = input.value.trim() || `Player ${index + 1}`;
        gameState.players.push(name);
        playersData[name] = {
            name: name,
            balance: amount,
            totalWon: 0,
            totalLost: 0,
            currentBet: 0,
            status: 'active', // 'active', 'folded', 'all-in'
            startingBalance: amount,
        };
    });

    // Start game
    gameState.gameStarted = true;
    setupScreen.classList.remove('active');
    gameScreen.classList.add('active');

    initializeGame();
    showNotification(`Game started with ${count} players!`, 'success');
}

function initializeGame() {
    // Reset game state
    gameState.currentPlayerIndex = 0;
    gameState.pot = 0;
    gameState.currentBet = 0;
    gameState.roundStartingBet = 0;
    gameState.bettingRoundNumber = 0;
    gameState.playersWhoHaveActedThisRound.clear();
    gameState.history = [];

    // Reset player statuses
    gameState.players.forEach(playerName => {
        playersData[playerName].status = 'active';
        playersData[playerName].currentBet = 0;
    });

    renderGameBoard();
    updateHistoryDisplay();
    addToHistory('=== GAME STARTED ===');
}

// ====================
// GAME BOARD RENDERING
// ====================
function renderGameBoard() {
    playersContainer.innerHTML = '';

    gameState.players.forEach((playerName, index) => {
        const player = playersData[playerName];
        const isActive = index === gameState.currentPlayerIndex;
        const playerCard = document.createElement('div');
        
        playerCard.className = 'player-card';
        if (isActive) playerCard.classList.add('active');
        if (player.status === 'folded') playerCard.classList.add('folded');
        if (player.status === 'all-in') playerCard.classList.add('all-in');

        playerCard.innerHTML = `
            <div class="player-name">${player.name}</div>
            <div class="player-balance">
                <label>Balance:</label>
                ₹${player.balance.toLocaleString('en-IN')}
            </div>
            <div class="player-current-bet">
                <label>Current Bet:</label>
                <div class="amount">₹${player.currentBet.toLocaleString('en-IN')}</div>
            </div>
            <span class="player-status ${player.status}">${player.status.toUpperCase()}</span>
        `;

        playersContainer.appendChild(playerCard);
    });

    updatePotDisplay();
    updateActionButtons();
}

function updatePotDisplay() {
    potAmount.textContent = gameState.pot.toLocaleString('en-IN');
    roundNumber.textContent = gameState.roundNumber;
    document.getElementById('currentPlayerDisplay').textContent = gameState.players[gameState.currentPlayerIndex];
    document.getElementById('currentBetDisplay').textContent = `₹${gameState.currentBet.toLocaleString('en-IN')}`;
    
    const activePlayers = gameState.players.filter(
        name => playersData[name].status !== 'folded'
    );
    document.getElementById('activePlayerCount').textContent = activePlayers.length;
}

function updateActionButtons() {
    const currentPlayer = playersData[gameState.players[gameState.currentPlayerIndex]];
    const allButtonsDisabled = currentPlayer.status !== 'active';

    const checkBtn = document.getElementById('checkBtn');
    const callBtn = document.getElementById('callBtn');
    const raiseBtn = document.getElementById('raiseBtn');
    const allInBtn = document.getElementById('allInBtn');
    const foldBtn = document.getElementById('foldBtn');

    // Disable all if player is not active or has no balance
    [checkBtn, callBtn, raiseBtn, allInBtn, foldBtn].forEach(btn => {
        btn.disabled = allButtonsDisabled || currentPlayer.balance === 0;
    });

    // Calculate how much player needs to call
    const callAmount = gameState.currentBet - currentPlayer.currentBet;

    // Check button - only when no bet or player has matched bet
    if (callAmount === 0) {
        checkBtn.disabled = allButtonsDisabled;
        checkBtn.textContent = 'Check';
        callBtn.disabled = true;
        callBtn.textContent = 'Call ₹0';
    } else {
        // Player needs to call
        checkBtn.disabled = true;
        checkBtn.textContent = 'Check';
        
        callBtn.disabled = allButtonsDisabled || currentPlayer.balance < callAmount;
        callBtn.textContent = `Call ₹${callAmount.toLocaleString('en-IN')}`;
    }

    // Raise button
    raiseBtn.disabled = allButtonsDisabled || currentPlayer.balance === 0;

    // All-In button
    allInBtn.disabled = allButtonsDisabled || currentPlayer.balance === 0;

    // Fold button - only disable if no one has bet yet (silly to fold with no bet)
    if (callAmount === 0 && gameState.currentBet === 0) {
        foldBtn.disabled = true;
        foldBtn.textContent = 'Fold (N/A)';
    } else {
        foldBtn.disabled = allButtonsDisabled;
        foldBtn.textContent = 'Fold';
    }
}

// ====================
// BETTING ACTIONS
// ====================
document.getElementById('checkBtn').addEventListener('click', handleCheckOrCall);
document.getElementById('callBtn').addEventListener('click', handleCheckOrCall);
document.getElementById('raiseBtn').addEventListener('click', handleRaise);
document.getElementById('allInBtn').addEventListener('click', handleAllIn);
document.getElementById('foldBtn').addEventListener('click', handleFold);

function handleCheckOrCall() {
    const currentPlayer = playersData[gameState.players[gameState.currentPlayerIndex]];
    const callAmount = gameState.currentBet - currentPlayer.currentBet;

    if (callAmount === 0) {
        // Check action - only if no bet needed
        if (gameState.currentBet !== currentPlayer.currentBet) {
            showNotification('You must call or raise!', 'error');
            return;
        }
        addToHistory(`${currentPlayer.name} checked`);
    } else {
        // Call action
        if (callAmount > currentPlayer.balance) {
            showNotification('Insufficient balance to call', 'error');
            return;
        }

        currentPlayer.balance -= callAmount;
        currentPlayer.currentBet += callAmount;
        gameState.pot += callAmount;

        addToHistory(`${currentPlayer.name} called ₹${callAmount.toLocaleString('en-IN')}`);
        showNotification(`Called ₹${callAmount.toLocaleString('en-IN')}`, 'success');
    }

    // Mark player as having acted this round
    gameState.playersWhoHaveActedThisRound.add(gameState.players[gameState.currentPlayerIndex]);

    // Check if betting round is complete
    if (isBettingRoundComplete()) {
        showNotification('Betting round complete! Starting next round...', 'info');
        setTimeout(() => {
            startNewBettingRound();
        }, 1500);
    } else {
        moveToNextPlayer();
    }
}

// Poker rule: Betting round is complete when all active players have:
// 1. Called the current bet amount, OR
// 2. Folded, OR  
// 3. Gone all-in
function isBettingRoundComplete() {
    const activeAndNotFolded = gameState.players.filter(
        name => playersData[name].status !== 'folded'
    );

    // If only 1 player left, betting round is complete
    if (activeAndNotFolded.length === 1) {
        return false; // Let moveToNextPlayer handle this
    }

    // Check if all active players have either:
    // - Matched the current bet
    // - Gone all-in
    // - Have acted this round
    for (let playerName of activeAndNotFolded) {
        const player = playersData[playerName];
        const hasMatched = player.currentBet === gameState.currentBet;
        const isAllIn = player.status === 'all-in';
        const hasActed = gameState.playersWhoHaveActedThisRound.has(playerName);

        // If player hasn't matched bet, isn't all-in, but has acted, they need to act again after raise
        if (!hasMatched && !isAllIn && hasActed) {
            continue; // This is fine, they can act again
        }

        // If player hasn't acted yet and doesn't have a matched bet, round not complete
        if (!hasMatched && !isAllIn && !hasActed) {
            return false;
        }
    }

    return true;
}

function startNewBettingRound() {
    gameState.bettingRoundNumber++;
    gameState.playersWhoHaveActedThisRound.clear();
    
    // Reset current bet for next round
    gameState.currentBet = 0;
    
    gameState.players.forEach(playerName => {
        playersData[playerName].currentBet = 0;
    });

    renderGameBoard();
    addToHistory(`--- New Betting Round ${gameState.bettingRoundNumber} ---`);
}

function handleRaise() {
    const currentPlayer = playersData[gameState.players[gameState.currentPlayerIndex]];
    
    // Show raise modal with suggestions
    const currentBetDisplay = document.getElementById('currentBetDisplay');
    const availableBalanceDisplay = document.getElementById('availableBalanceDisplay');
    const yourCurrentBetDisplay = document.getElementById('yourCurrentBetDisplay');

    currentBetDisplay.textContent = gameState.currentBet.toLocaleString('en-IN');
    availableBalanceDisplay.textContent = currentPlayer.balance.toLocaleString('en-IN');
    yourCurrentBetDisplay.textContent = currentPlayer.currentBet.toLocaleString('en-IN');

    // Clear previous input
    document.getElementById('raiseAmount').value = '';
    document.querySelectorAll('.btn-suggestion').forEach(btn => btn.classList.remove('selected'));

    // Calculate raise suggestions
    const minRaise = gameState.currentBet - currentPlayer.currentBet + 1;
    const minRaiseTotal = gameState.currentBet + minRaise;
    const quarterPot = gameState.pot / 4;
    const halfPot = gameState.pot / 2;
    const fullPot = gameState.pot;
    const doublePot = gameState.pot * 2;

    // Set up suggestion buttons
    document.getElementById('minRaiseBtn').onclick = () => setSuggestedRaise(minRaiseTotal);
    document.getElementById('quarterPotBtn').onclick = () => setSuggestedRaise(Math.ceil(quarterPot));
    document.getElementById('halfPotBtn').onclick = () => setSuggestedRaise(Math.ceil(halfPot));
    document.getElementById('potBtn').onclick = () => setSuggestedRaise(Math.ceil(fullPot));
    document.getElementById('doublePotBtn').onclick = () => setSuggestedRaise(Math.ceil(doublePot));

    // Display minimum raise info
    document.querySelector('.suggestion-title').textContent = `Quick Suggestions: (Min: ₹${minRaiseTotal.toLocaleString('en-IN')})`;

    raiseModal.classList.add('active');
}

function setSuggestedRaise(amount) {
    document.getElementById('raiseAmount').value = amount;
    document.getElementById('raiseAmountDisplay').textContent = `Total Bet: ₹${amount.toLocaleString('en-IN')}`;
    
    // Highlight selected button
    const currentPlayer = playersData[gameState.players[gameState.currentPlayerIndex]];
    const suggestions = {
        'minRaiseBtn': gameState.currentBet - currentPlayer.currentBet + 1 + gameState.currentBet,
        'quarterPotBtn': Math.ceil(gameState.pot / 4),
        'halfPotBtn': Math.ceil(gameState.pot / 2),
        'potBtn': Math.ceil(gameState.pot),
        'doublePotBtn': Math.ceil(gameState.pot * 2),
    };

    document.querySelectorAll('.btn-suggestion').forEach(btn => btn.classList.remove('selected'));
    Object.entries(suggestions).forEach(([id, val]) => {
        if (val === amount) {
            document.getElementById(id).classList.add('selected');
        }
    });
}

document.getElementById('raiseAmount').addEventListener('input', (e) => {
    const amount = parseInt(e.target.value) || 0;
    document.getElementById('raiseAmountDisplay').textContent = `Total Bet: ₹${amount.toLocaleString('en-IN')}`;
    document.querySelectorAll('.btn-suggestion').forEach(btn => btn.classList.remove('selected'));
});

document.getElementById('confirmRaiseBtn').addEventListener('click', () => {
    const raiseAmountInput = document.getElementById('raiseAmount');
    const raiseAmount = parseInt(raiseAmountInput.value);
    const currentPlayer = playersData[gameState.players[gameState.currentPlayerIndex]];

    // Validation
    if (!raiseAmount || raiseAmount <= 0) {
        showNotification('Please enter a valid raise amount', 'error');
        return;
    }

    if (raiseAmount > currentPlayer.balance + currentPlayer.currentBet) {
        showNotification('Raise amount exceeds your total available balance', 'error');
        return;
    }

    const minRaiseTo = gameState.currentBet > currentPlayer.currentBet 
        ? gameState.currentBet + (gameState.currentBet - currentPlayer.currentBet)
        : gameState.currentBet + 1;

    if (raiseAmount < minRaiseTo && currentPlayer.balance + currentPlayer.currentBet > raiseAmount) {
        showNotification(`Minimum raise is ₹${minRaiseTo.toLocaleString('en-IN')}`, 'error');
        return;
    }

    // Execute raise
    const amountToAdd = raiseAmount - currentPlayer.currentBet;

    if (amountToAdd > currentPlayer.balance) {
        showNotification('Insufficient balance for this raise', 'error');
        return;
    }

    currentPlayer.balance -= amountToAdd;
    currentPlayer.currentBet = raiseAmount;
    gameState.pot += amountToAdd;
    
    // Update current bet - this is the new amount all players need to match
    const previousBet = gameState.currentBet;
    gameState.currentBet = raiseAmount;

    addToHistory(`${currentPlayer.name} raised from ₹${previousBet.toLocaleString('en-IN')} to ₹${raiseAmount.toLocaleString('en-IN')}`);
    showNotification(`Raised to ₹${raiseAmount.toLocaleString('en-IN')}`, 'success');

    // Mark player as having acted
    gameState.playersWhoHaveActedThisRound.add(gameState.players[gameState.currentPlayerIndex]);

    raiseAmountInput.value = '';
    raiseModal.classList.remove('active');

    // Move to next player - they need to respond to this raise
    moveToNextPlayer();
});

document.getElementById('cancelRaiseBtn').addEventListener('click', () => {
    document.getElementById('raiseAmount').value = '';
    raiseModal.classList.remove('active');
});

function handleAllIn() {
    const currentPlayer = playersData[gameState.players[gameState.currentPlayerIndex]];
    const allInAmount = currentPlayer.balance;

    if (allInAmount === 0) {
        showNotification('No balance left', 'error');
        return;
    }

    gameState.pot += allInAmount;
    const newBet = currentPlayer.currentBet + allInAmount;

    if (newBet > gameState.currentBet) {
        gameState.currentBet = newBet;
    }

    currentPlayer.currentBet = newBet;
    currentPlayer.balance = 0;
    currentPlayer.status = 'all-in';

    addToHistory(`${currentPlayer.name} went ALL-IN with ₹${allInAmount.toLocaleString('en-IN')}`);
    showNotification(`${currentPlayer.name} is ALL-IN!`, 'warning');

    // Mark player as having acted
    gameState.playersWhoHaveActedThisRound.add(gameState.players[gameState.currentPlayerIndex]);

    // Check if betting is done
    if (isBettingRoundComplete()) {
        showNotification('All players either folded or all-in. Hand complete!', 'info');
        setTimeout(() => {
            endRound();
        }, 1500);
    } else {
        moveToNextPlayer();
    }
}

function handleFold() {
    const currentPlayer = playersData[gameState.players[gameState.currentPlayerIndex]];
    currentPlayer.status = 'folded';

    addToHistory(`${currentPlayer.name} folded`);
    showNotification(`${currentPlayer.name} folded`, 'info');

    // Mark player as having acted
    gameState.playersWhoHaveActedThisRound.add(gameState.players[gameState.currentPlayerIndex]);

    // Check if only one player remains active
    const activePlayers = gameState.players.filter(
        name => playersData[name].status === 'active' || playersData[name].status === 'all-in'
    );

    if (activePlayers.length === 1) {
        showNotification('Only one active player left. Hand is over!', 'warning');
        setTimeout(() => endRound(), 1500);
    } else {
        moveToNextPlayer();
    }
}

function moveToNextPlayer() {
    let nextIndex = gameState.currentPlayerIndex;

    // Find next active player
    do {
        nextIndex = (nextIndex + 1) % gameState.players.length;
    } while (playersData[gameState.players[nextIndex]].status === 'folded');

    gameState.currentPlayerIndex = nextIndex;
    renderGameBoard();
}

// ====================
// NOTIFICATION SYSTEM
// ====================
function showNotification(message, type = 'info') {
    const notificationArea = document.getElementById('notificationArea');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    notificationArea.appendChild(notification);

    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// ====================
// HISTORY MANAGEMENT
// ====================
function addToHistory(action) {
    gameState.history.push(action);
    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    historyLog.innerHTML = '';
    gameState.history.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.textContent = item;
        historyLog.appendChild(historyItem);
    });
    // Auto scroll to bottom
    historyLog.scrollTop = historyLog.scrollHeight;
}

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    gameState.history = [];
    updateHistoryDisplay();
});

// ====================
// END ROUND / WINNER SELECTION
// ====================
document.getElementById('endRoundBtn').addEventListener('click', openWinnerSelection);

function endRound() {
    if (gameState.pot === 0) {
        showNotification('No pot to distribute', 'error');
        return;
    }
    openWinnerSelection();
}

function openWinnerSelection() {
    const activePlayers = gameState.players.filter(
        name => playersData[name].status !== 'folded'
    );

    if (activePlayers.length === 0) {
        showNotification('No active players', 'error');
        return;
    }

    // Populate single winner tab
    const singleWinnerList = document.getElementById('singleWinnerList');
    singleWinnerList.innerHTML = '';

    activePlayers.forEach(playerName => {
        const item = document.createElement('label');
        item.className = 'winner-item';
        item.innerHTML = `
            <input type="radio" name="singleWinner" value="${playerName}">
            <span>${playerName}</span>
            <span class="amount">₹${gameState.pot.toLocaleString('en-IN')}</span>
        `;
        singleWinnerList.appendChild(item);
    });

    // Populate split equally tab
    const splitWinnerList = document.getElementById('splitWinnerList');
    splitWinnerList.innerHTML = '';
    const splitAmount = Math.floor(gameState.pot / activePlayers.length);

    activePlayers.forEach(playerName => {
        const item = document.createElement('label');
        item.className = 'winner-item';
        item.innerHTML = `
            <input type="checkbox" class="split-winner" value="${playerName}">
            <span>${playerName}</span>
            <span class="amount">₹${splitAmount.toLocaleString('en-IN')}</span>
        `;
        splitWinnerList.appendChild(item);
    });

    // Populate custom split tab
    const customWinnerList = document.getElementById('customWinnerList');
    customWinnerList.innerHTML = '';

    activePlayers.forEach(playerName => {
        const item = document.createElement('div');
        item.className = 'custom-winner-item';
        item.innerHTML = `
            <div class="player-name">${playerName}</div>
            <input type="number" placeholder="Amount" class="custom-amount" value="0" min="0">
        `;
        customWinnerList.appendChild(item);
    });

    document.getElementById('potForCustom').textContent = gameState.pot.toLocaleString('en-IN');

    // Add event listener for custom split
    document.querySelectorAll('.custom-amount').forEach(input => {
        input.addEventListener('input', updateCustomSplitTotal);
    });

    winnerModal.classList.add('active');
    showNotification('Select winner(s) to distribute the pot', 'info');
}

function updateCustomSplitTotal() {
    const inputs = document.querySelectorAll('.custom-amount');
    let total = 0;

    inputs.forEach(input => {
        total += parseInt(input.value) || 0;
    });

    const totalDistributed = document.getElementById('totalDistributed');
    const errorMessage = document.getElementById('customSplitError');

    totalDistributed.textContent = total.toLocaleString('en-IN');

    if (total > gameState.pot) {
        errorMessage.textContent = `❌ Total exceeds pot amount (${gameState.pot})`;
        errorMessage.style.display = 'block';
    } else {
        errorMessage.style.display = 'none';
    }
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;

        // Remove active class from all tabs and buttons
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

        // Add active class to clicked button and corresponding tab
        e.target.classList.add('active');
        document.getElementById(`${tabName}Tab`).classList.add('active');
    });
});

document.getElementById('confirmWinnerBtn').addEventListener('click', distributeWinnings);

function distributeWinnings() {
    const activeTab = document.querySelector('.tab-content.active').id;
    const pot = gameState.pot;
    const distribution = {}; // { playerName: amount }

    if (activeTab === 'singleTab') {
        const winner = document.querySelector('input[name="singleWinner"]:checked');
        if (!winner) {
            showNotification('Please select a winner', 'error');
            return;
        }
        distribution[winner.value] = pot;
    } else if (activeTab === 'splitTab') {
        const winners = document.querySelectorAll('.split-winner:checked');
        if (winners.length === 0) {
            showNotification('Please select at least one winner', 'error');
            return;
        }
        const amountPerWinner = Math.floor(pot / winners.length);
        const remainder = pot % winners.length;

        winners.forEach((winner, index) => {
            const amount = amountPerWinner + (index < remainder ? 1 : 0);
            distribution[winner.value] = amount;
        });
    } else if (activeTab === 'customTab') {
        const inputs = document.querySelectorAll('.custom-amount');
        let totalDistributed = 0;

        inputs.forEach(input => {
            const parent = input.parentElement;
            const playerName = parent.querySelector('.player-name').textContent;
            const amount = parseInt(input.value) || 0;

            if (amount > 0) {
                distribution[playerName] = amount;
                totalDistributed += amount;
            }
        });

        if (totalDistributed !== pot) {
            showNotification(`Total distributed must equal pot amount (₹${pot})`, 'error');
            return;
        }
    }

    // Apply distribution
    Object.entries(distribution).forEach(([playerName, amount]) => {
        playersData[playerName].balance += amount;
        playersData[playerName].totalWon += amount;

        addToHistory(`${playerName} won ₹${amount.toLocaleString('en-IN')}`);
        showNotification(`${playerName} won ₹${amount.toLocaleString('en-IN')}`, 'success');
    });

    // Update players who lost
    gameState.players.forEach(playerName => {
        if (!distribution[playerName]) {
            const playerBet = playersData[playerName].currentBet;
            playersData[playerName].totalLost += playerBet;
        }
    });

    // Close modal and prepare for next round
    winnerModal.classList.remove('active');

    // Check if game can continue
    const activePlayers = gameState.players.filter(
        name => playersData[name].balance > 0
    );

    if (activePlayers.length <= 1) {
        showNotification('Game over! Only one player has money left.', 'warning');
        setTimeout(() => endGame(), 1500);
    } else {
        newRound();
    }
}

// ====================
// NEW ROUND / RESET GAME
// ====================
document.getElementById('newRoundBtn').addEventListener('click', newRound);
document.getElementById('resetGameBtn').addEventListener('click', resetGame);

function newRound() {
    gameState.roundNumber++;
    gameState.pot = 0;
    gameState.currentBet = 0;
    gameState.roundStartingBet = 0;
    gameState.bettingRoundNumber = 0;
    gameState.playersWhoHaveActedThisRound.clear();
    gameState.history = [];

    gameState.players.forEach(playerName => {
        playersData[playerName].status = playersData[playerName].balance > 0 ? 'active' : 'folded';
        playersData[playerName].currentBet = 0;
    });

    gameState.currentPlayerIndex = 0;

    renderGameBoard();
    updateHistoryDisplay();
    showNotification(`Round ${gameState.roundNumber} started!`, 'info');
}

function resetGame() {
    if (confirm('Are you sure you want to reset the entire game?')) {
        setupScreen.classList.add('active');
        gameScreen.classList.remove('active');

        gameState.gameStarted = false;
        gameState.roundNumber = 1;
        gameState.history = [];

        // Clear all modals
        raiseModal.classList.remove('active');
        winnerModal.classList.remove('active');
        moneyTrackingModal.classList.remove('active');

        document.getElementById('raiseAmount').value = '';

        // Reset to setup
        updatePlayerSetupList();
        
        showNotification('Game reset. Ready for new game!', 'info');
    }
}

function endGame() {
    showNotification('Game concluded!', 'success');
    setTimeout(() => {
        if (confirm('Game ended. Would you like to see money tracking or reset?')) {
            showMoneyTracking();
        } else {
            resetGame();
        }
    }, 1000);
}

// ====================
// MONEY TRACKING
// ====================
function showMoneyTracking() {
    const trackingList = document.getElementById('moneyTrackingList');
    trackingList.innerHTML = '';

    gameState.players.forEach(playerName => {
        const player = playersData[playerName];
        const profit = player.totalWon - player.totalLost;
        const profitClass = profit >= 0 ? 'profit' : 'loss';

        const item = document.createElement('div');
        item.className = 'tracking-item';
        item.innerHTML = `
            <div class="player-name">${player.name}</div>
            <div class="tracking-stat">
                <label>Starting Balance:</label>
                <span class="value">₹${player.startingBalance.toLocaleString('en-IN')}</span>
            </div>
            <div class="tracking-stat">
                <label>Current Balance:</label>
                <span class="value">₹${player.balance.toLocaleString('en-IN')}</span>
            </div>
            <div class="tracking-stat">
                <label>Total Won:</label>
                <span class="value">₹${player.totalWon.toLocaleString('en-IN')}</span>
            </div>
            <div class="tracking-stat">
                <label>Total Lost:</label>
                <span class="value">₹${player.totalLost.toLocaleString('en-IN')}</span>
            </div>
            <div class="tracking-stat ${profitClass}">
                <label>Profit/Loss:</label>
                <span class="value">${profit >= 0 ? '↑' : '↓'} ₹${Math.abs(profit).toLocaleString('en-IN')}</span>
            </div>
        `;
        trackingList.appendChild(item);
    });

    moneyTrackingModal.classList.add('active');
}

document.getElementById('closeTrackingBtn').addEventListener('click', () => {
    moneyTrackingModal.classList.remove('active');
});

// ====================
// INITIALIZATION
// ====================
updatePlayerSetupList();
