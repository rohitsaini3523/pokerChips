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
  gameStarted: false,
  history: [],
  communityCards: [],
  gameStage: "PRE_FLOP",
  bettingRoundNumber: 0,
  playersWhoHaveActedThisRound: new Set(),
  lastRaiseSize: 0,
  lastAggressorIndex: null,
};

const playersData = {
  // Will store: { name, balance, totalWon, totalLost, currentBet, status, startingBalance }
};

// ====================
// POKER RULES & CONSTANTS
// ====================
const POKER_RULES = {
  COMMUNITY_CARDS_STAGES: [
    {
      stage: "PRE_FLOP",
      cardsRevealed: 0,
      name: "Pre-Flop",
    },
    {
      stage: "FLOP",
      cardsRevealed: 3,
      name: "Flop",
    },
    {
      stage: "TURN",
      cardsRevealed: 4,
      name: "Turn",
    },
    {
      stage: "RIVER",
      cardsRevealed: 5,
      name: "River",
    },
  ],

  ACTIONS: {
    CHECK: {
      allowed: (currentBet, playerBet) => currentBet === playerBet,
    },

    CALL: {
      allowed: (currentBet, playerBet, balance) => {
        const callAmount = currentBet - playerBet;
        return callAmount > 0 && balance > 0;
      },
    },

    RAISE: {
      allowed: (currentBet, playerBet, balance) => {
        return balance > currentBet - playerBet;
      },
    },

    FOLD: {
      allowed: () => true,
    },

    ALL_IN: {
      allowed: (currentBet, playerBet, balance) => balance > 0,
    },
  },
};

// ====================
// POKER RULES VALIDATION & MANAGEMENT
// ====================

/**
 * Validates if a player can perform a specific action
 * @param {string} action - The action to validate (CHECK, CALL, RAISE, FOLD, ALL_IN)
 * @param {object} player - The player object
 * @returns {object} - { isValid: boolean, message: string }
 */
function validatePokerAction(action, player) {
  if (!player) return { isValid: false, message: "Player not found" };

  const callAmount = gameState.currentBet - player.currentBet;
  const rule = POKER_RULES.ACTIONS[action];

  if (!rule) {
    return { isValid: false, message: "Invalid action" };
  }

  // Check if action is allowed based on game state
  const isAllowed = rule.allowed(
    gameState.currentBet,
    player.currentBet,
    player.balance,
  );

  if (!isAllowed) {
    const messages = {
      CHECK: "Cannot check - there is a bet to call",
      CALL: "Cannot call - insufficient balance",
      RAISE: "Cannot raise - no balance remaining",
      FOLD: "Cannot fold - no bet to respond to",
      ALL_IN: "Cannot go all-in - no balance remaining",
    };
    return { isValid: false, message: messages[action] || rule.description };
  }

  return { isValid: true, message: "Action allowed", callAmount };
}

/**
 * Progresses game to next stage (Flop → Turn → River)
 * Reveals community cards according to Texas Hold'em rules (3, 1, 1)
 */
function progressGameStage() {
  const stages = POKER_RULES.COMMUNITY_CARDS_STAGES;
  const currentStageIndex = stages.findIndex(
    (s) => s.stage === gameState.gameStage,
  );

  if (currentStageIndex < stages.length - 1) {
    const nextStage = stages[currentStageIndex + 1];
    gameState.gameStage = nextStage.stage;

    // Simulate card revelation (in real game, these would be actual cards)
    const cardsToAdd =
      nextStage.cardsRevealed - gameState.communityCards.length;
    for (let i = 0; i < cardsToAdd; i++) {
      gameState.communityCards.push({
        suit: ["♠", "♣", "♥", "♦"][Math.floor(Math.random() * 4)],
        rank: [
          "A",
          "K",
          "Q",
          "J",
          "10",
          "9",
          "8",
          "7",
          "6",
          "5",
          "4",
          "3",
          "2",
        ][Math.floor(Math.random() * 13)],
      });
    }

    addToHistory(
      `📋 ${nextStage.name} - ${cardsToAdd} card(s) revealed. Total community cards: ${gameState.communityCards.length}`,
    );
    return true;
  }
  return false;
}

/**
 * Gets available actions for current player based on poker rules
 * @returns {object} - { check, call, raise, fold, allIn } - true if allowed
 */
function getAvailableActions() {
  const currentPlayer =
    playersData[gameState.players[gameState.currentPlayerIndex]];

  if (!currentPlayer || currentPlayer.status === "folded") {
    return {
      check: false,
      call: false,
      raise: false,
      fold: false,
      allIn: false,
    };
  }

  const callAmount = gameState.currentBet - currentPlayer.currentBet;
  const hasBalance = currentPlayer.balance > 0;
  const needsToCall = callAmount > 0;

  return {
    check: !needsToCall && hasBalance,
    call: needsToCall && hasBalance && callAmount <= currentPlayer.balance,
    raise: hasBalance,
    fold: gameState.currentBet > 0 || currentPlayer.currentBet > 0,
    allIn: hasBalance,
  };
}

/**
 * Resets checks tracking for new betting stage
 */
function initializeStageChecks() {
  gameState.checksRemaining = {};
  gameState.players.forEach((playerName) => {
    gameState.checksRemaining[playerName] = POKER_RULES.MAX_CHECKS_PER_STAGE;
  });
}

/**
 * Gets current game stage info
 * @returns {object} - { stage, cardsRevealed, stageName, description }
 */
function getCurrentStageInfo() {
  const stage = POKER_RULES.COMMUNITY_CARDS_STAGES.find(
    (s) => s.stage === gameState.gameStage,
  );
  return {
    stage: stage.stage,
    cardsRevealed: stage.cardsRevealed,
    stageName: stage.name,
    description: stage.description,
    communityCardsDisplay: gameState.communityCards
      .map((c) => c.rank + c.suit)
      .join(" "),
  };
}

// ====================
// DOM ELEMENTS
// ====================
const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");
const playerCountInput = document.getElementById("playerCount");
const startingAmountInput = document.getElementById("startingAmount");
const playerSetupList = document.getElementById("playerSetupList");
const startGameBtn = document.getElementById("startGameBtn");
const decPlayersBtn = document.getElementById("decPlayersBtn");
const incPlayersBtn = document.getElementById("incPlayersBtn");

const playersContainer = document.getElementById("playersContainer");
const potAmount = document.getElementById("potAmount");
const roundNumber = document.getElementById("roundNumber");
const historyLog = document.getElementById("historyLog");
const actionButtons = document.getElementById("actionButtons");

const raiseModal = document.getElementById("raiseModal");
const winnerModal = document.getElementById("winnerModal");
const moneyTrackingModal = document.getElementById("moneyTrackingModal");

// ====================
// SETUP SCREEN LOGIC
// ====================

// Update player count
decPlayersBtn.addEventListener("click", () => {
  const count = parseInt(playerCountInput.value);
  if (count > 2) {
    playerCountInput.value = count - 1;
    updatePlayerSetupList();
  }
});

incPlayersBtn.addEventListener("click", () => {
  const count = parseInt(playerCountInput.value);
  if (count < 10) {
    playerCountInput.value = count + 1;
    updatePlayerSetupList();
  }
});

playerCountInput.addEventListener("change", updatePlayerSetupList);
startingAmountInput.addEventListener("change", updatePlayerSetupList);

function updatePlayerSetupList() {
  const count = parseInt(playerCountInput.value);
  const amount = parseInt(startingAmountInput.value);

  playerSetupList.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const playerItem = document.createElement("div");
    playerItem.className = "player-setup-item";
    playerItem.innerHTML = `
            <span>Player ${i + 1}:</span>
            <input type="text" placeholder="Player Name" class="player-name-input" data-index="${i}">
        `;
    playerSetupList.appendChild(playerItem);
  }
}

startGameBtn.addEventListener("click", validateAndStartGame);

function validateAndStartGame() {
  const count = parseInt(playerCountInput.value);
  const amount = parseInt(startingAmountInput.value);

  // Validation
  if (count < 2 || count > 10) {
    alert("Players must be between 2 and 10");
    return;
  }

  if (amount <= 0) {
    alert("Starting amount must be greater than 0");
    return;
  }

  // Collect player names
  const nameInputs = document.querySelectorAll(".player-name-input");
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
      status: "active", // 'active', 'folded', 'all-in'
      startingBalance: amount,
    };
  });

  // Start game
  gameState.gameStarted = true;
  setupScreen.classList.remove("active");
  gameScreen.classList.add("active");

  initializeGame();
  showNotification(`Game started with ${count} players!`, "success");
}

function initializeGame() {
  gameState.currentPlayerIndex = 0;

  gameState.pot = 0;

  gameState.currentBet = 0;

  gameState.communityCards = [];

  gameState.gameStage = "PRE_FLOP";

  gameState.bettingRoundNumber = 0;

  gameState.playersWhoHaveActedThisRound.clear();

  gameState.lastRaiseSize = 0;

  gameState.lastAggressorIndex = null;

  gameState.history = [];

  gameState.players.forEach((playerName) => {
    playersData[playerName].status = "active";

    playersData[playerName].currentBet = 0;
  });

  renderGameBoard();

  addToHistory("=== GAME STARTED ===");

  addToHistory("🃏 Texas Hold’em Started");
}

// ====================
// GAME BOARD RENDERING
// ====================
function renderGameBoard() {
  playersContainer.innerHTML = "";

  gameState.players.forEach((playerName, index) => {
    const player = playersData[playerName];
    const isActive = index === gameState.currentPlayerIndex;
    const playerCard = document.createElement("div");

    playerCard.className = "player-card";
    if (isActive) playerCard.classList.add("active");
    if (player.status === "folded") playerCard.classList.add("folded");
    if (player.status === "all-in") playerCard.classList.add("all-in");

    playerCard.innerHTML = `
            <div class="player-name">${player.name}</div>
            <div class="player-balance">
                <label>Balance:</label>
                ₹${player.balance.toLocaleString("en-IN")}
            </div>
            <div class="player-current-bet">
                <label>Current Bet:</label>
                <div class="amount">₹${player.currentBet.toLocaleString("en-IN")}</div>
            </div>
            <span class="player-status ${player.status}">${player.status.toUpperCase()}</span>
        `;

    playersContainer.appendChild(playerCard);
  });

  updatePotDisplay();
  updateActionButtons();
}

function updatePotDisplay() {
  potAmount.textContent = gameState.pot.toLocaleString("en-IN");
  roundNumber.textContent = gameState.roundNumber;
  document.getElementById("currentPlayerDisplay").textContent =
    gameState.players[gameState.currentPlayerIndex];
  document.getElementById("currentBetDisplay").textContent =
    `₹${gameState.currentBet.toLocaleString("en-IN")}`;

  const activePlayers = gameState.players.filter(
    (name) => playersData[name].status !== "folded",
  );
  document.getElementById("activePlayerCount").textContent =
    activePlayers.length;
}

function updateActionButtons() {
  const currentPlayer =
    playersData[gameState.players[gameState.currentPlayerIndex]];

  if (!currentPlayer) return;

  const allButtonsDisabled =
    currentPlayer.status !== "active" && currentPlayer.status !== "all-in";
  const availableActions = getAvailableActions();
  const stageInfo = getCurrentStageInfo();

  const checkBtn = document.getElementById("checkBtn");
  const callBtn = document.getElementById("callBtn");
  const raiseBtn = document.getElementById("raiseBtn");
  const allInBtn = document.getElementById("allInBtn");
  const foldBtn = document.getElementById("foldBtn");

  // Disable all if player is not active
  [checkBtn, callBtn, raiseBtn, allInBtn, foldBtn].forEach((btn) => {
    btn.disabled = allButtonsDisabled;
  });

  // Calculate how much player needs to call
  const callAmount = gameState.currentBet - currentPlayer.currentBet;

  // UPDATE CHECK BUTTON - Poker Rule: Check only allowed if no bet made
  if (availableActions.check) {
    checkBtn.disabled = false;
    checkBtn.textContent = "✓ Check";
    checkBtn.title = POKER_RULES.ACTIONS.CHECK.description;
  } else {
    checkBtn.disabled = true;
    checkBtn.textContent = "Check (N/A)";
    checkBtn.title = "Cannot check - there is a bet to call";
  }

  // UPDATE CALL BUTTON - Poker Rule: Call must match current bet
  if (availableActions.call && callAmount > 0) {
    callBtn.disabled = currentPlayer.balance < callAmount;
    callBtn.textContent = `📞 Call ₹${callAmount.toLocaleString("en-IN")}`;
    callBtn.title = POKER_RULES.ACTIONS.CALL.description;
  } else {
    callBtn.disabled = true;
    callBtn.textContent = "Call (N/A)";
    callBtn.title = "Cannot call - no bet to match or insufficient balance";
  }

  // UPDATE RAISE BUTTON - Poker Rule: Can raise if you have balance
  if (availableActions.raise) {
    raiseBtn.disabled = false;
    raiseBtn.textContent = "📈 Raise";
    raiseBtn.title = POKER_RULES.ACTIONS.RAISE.description;
  } else {
    raiseBtn.disabled = true;
    raiseBtn.textContent = "Raise (N/A)";
    raiseBtn.title = "Cannot raise - no balance";
  }

  // UPDATE ALL-IN BUTTON - Poker Rule: Can go all-in if you have balance
  if (availableActions.allIn) {
    allInBtn.disabled = false;
    allInBtn.textContent = `🔥 All-In (₹${currentPlayer.balance.toLocaleString("en-IN")})`;
    allInBtn.title = POKER_RULES.ACTIONS.ALL_IN.description;
  } else {
    allInBtn.disabled = true;
    allInBtn.textContent = "All-In (N/A)";
    allInBtn.title = "Cannot go all-in - no balance";
  }

  // UPDATE FOLD BUTTON - Poker Rule: Can fold if there's a bet to respond to
  if (availableActions.fold) {
    foldBtn.disabled = false;
    foldBtn.textContent = "🚫 Fold";
    foldBtn.title = POKER_RULES.ACTIONS.FOLD.description;
  } else {
    foldBtn.disabled = true;
    foldBtn.textContent = "Fold (N/A)";
    foldBtn.title = "Cannot fold - no bet to respond to";
  }
}

// ====================
// BETTING ACTIONS - POKER RULES IMPLEMENTATION
// ====================
document
  .getElementById("checkBtn")
  .addEventListener("click", handleCheckOrCall);
document.getElementById("callBtn").addEventListener("click", handleCheckOrCall);
document.getElementById("raiseBtn").addEventListener("click", handleRaise);
document.getElementById("allInBtn").addEventListener("click", handleAllIn);
document.getElementById("foldBtn").addEventListener("click", handleFold);
function handleCheckOrCall() {
  const currentPlayer =
    playersData[gameState.players[gameState.currentPlayerIndex]];

  const callAmount = gameState.currentBet - currentPlayer.currentBet;

  if (callAmount === 0) {
    addToHistory(`${currentPlayer.name} checked`);

    showNotification("Check", "success");
  } else {
    const amount = Math.min(callAmount, currentPlayer.balance);

    currentPlayer.balance -= amount;

    currentPlayer.currentBet += amount;

    gameState.pot += amount;

    if (currentPlayer.balance === 0) {
      currentPlayer.status = "all-in";
    }

    addToHistory(`${currentPlayer.name} called ₹${amount}`);

    showNotification(`Called ₹${amount}`, "success");
  }

  gameState.playersWhoHaveActedThisRound.add(currentPlayer.name);

  if (isBettingRoundComplete()) {
    const progressed = progressGameStage();

    if (progressed) {
      startNewBettingRound();
    } else {
      endRound();
    }
  } else {
    moveToNextPlayer();
  }

  renderGameBoard();
}

// Poker rule: Betting round is complete when all active players have:
// 1. Called the current bet amount, OR
// 2. Folded, OR
// 3. Gone all-in
function isBettingRoundComplete() {
  const activePlayers = gameState.players.filter((name) => {
    const p = playersData[name];

    return p.status !== "folded" && p.status !== "all-in";
  });

  if (activePlayers.length <= 1) {
    return true;
  }

  const allMatched = activePlayers.every((name) => {
    return playersData[name].currentBet === gameState.currentBet;
  });

  const allActed = activePlayers.every((name) => {
    return gameState.playersWhoHaveActedThisRound.has(name);
  });

  return allMatched && allActed;
}

function startNewBettingRound() {
  gameState.bettingRoundNumber++;

  gameState.currentBet = 0;

  gameState.lastRaiseSize = 0;

  gameState.playersWhoHaveActedThisRound.clear();

  gameState.players.forEach((playerName) => {
    playersData[playerName].currentBet = 0;
  });

  // IMPORTANT:
  // Start new street from first active player

  gameState.currentPlayerIndex = gameState.players.findIndex(
    (name) => playersData[name].status === "active",
  );

  renderGameBoard();

  addToHistory(`--- ${gameState.gameStage} Betting Round ---`);

  showNotification(
    `${getCurrentStageInfo().stageName} betting started`,
    "info",
  );
}

function handleRaise() {
  const currentPlayer =
    playersData[gameState.players[gameState.currentPlayerIndex]];
  const stageInfo = getCurrentStageInfo();

  // Validate poker raise rule
  const validation = validatePokerAction("RAISE", currentPlayer);
  if (!validation.isValid) {
    showNotification(validation.message, "error");
    return;
  }

  // Show raise modal with suggestions
  const currentBetDisplay = document.getElementById("currentBetDisplay");
  const availableBalanceDisplay = document.getElementById(
    "availableBalanceDisplay",
  );
  const yourCurrentBetDisplay = document.getElementById(
    "yourCurrentBetDisplay",
  );

  currentBetDisplay.textContent = `₹${gameState.currentBet.toLocaleString("en-IN")}`;
  availableBalanceDisplay.textContent = `₹${currentPlayer.balance.toLocaleString("en-IN")}`;
  yourCurrentBetDisplay.textContent = `₹${currentPlayer.currentBet.toLocaleString("en-IN")}`;

  // Clear previous input
  document.getElementById("raiseAmount").value = "";
  document
    .querySelectorAll(".btn-suggestion")
    .forEach((btn) => btn.classList.remove("selected"));

  // Calculate raise suggestions based on poker betting rules
  const minRaise = Math.max(
    gameState.currentBet - currentPlayer.currentBet + 1,
    1,
  );
  const minRaiseTotal = gameState.currentBet + minRaise;
  const quarterPot = gameState.pot / 4;
  const halfPot = gameState.pot / 2;
  const fullPot = gameState.pot;
  const doublePot = gameState.pot * 2;

  // Set up suggestion buttons
  document.getElementById("minRaiseBtn").onclick = () =>
    setSuggestedRaise(minRaiseTotal);
  document.getElementById("quarterPotBtn").onclick = () =>
    setSuggestedRaise(Math.ceil(quarterPot));
  document.getElementById("halfPotBtn").onclick = () =>
    setSuggestedRaise(Math.ceil(halfPot));
  document.getElementById("potBtn").onclick = () =>
    setSuggestedRaise(Math.ceil(fullPot));
  document.getElementById("doublePotBtn").onclick = () =>
    setSuggestedRaise(Math.ceil(doublePot));

  // Display minimum raise info and stage info
  document.querySelector(".suggestion-title").textContent =
    `📈 Raise in ${stageInfo.stageName} (Min: ₹${minRaiseTotal.toLocaleString("en-IN")})`;

  raiseModal.classList.add("active");
}

function setSuggestedRaise(amount) {
  document.getElementById("raiseAmount").value = amount;
  document.getElementById("raiseAmountDisplay").textContent =
    `Total Bet: ₹${amount.toLocaleString("en-IN")}`;

  // Highlight selected button
  const currentPlayer =
    playersData[gameState.players[gameState.currentPlayerIndex]];
  const suggestions = {
    minRaiseBtn:
      gameState.currentBet -
      currentPlayer.currentBet +
      1 +
      gameState.currentBet,
    quarterPotBtn: Math.ceil(gameState.pot / 4),
    halfPotBtn: Math.ceil(gameState.pot / 2),
    potBtn: Math.ceil(gameState.pot),
    doublePotBtn: Math.ceil(gameState.pot * 2),
  };

  document
    .querySelectorAll(".btn-suggestion")
    .forEach((btn) => btn.classList.remove("selected"));
  Object.entries(suggestions).forEach(([id, val]) => {
    if (val === amount) {
      document.getElementById(id).classList.add("selected");
    }
  });
}

document.getElementById("raiseAmount").addEventListener("input", (e) => {
  const amount = parseInt(e.target.value) || 0;
  document.getElementById("raiseAmountDisplay").textContent =
    `Total Bet: ₹${amount.toLocaleString("en-IN")}`;
  document
    .querySelectorAll(".btn-suggestion")
    .forEach((btn) => btn.classList.remove("selected"));
});

document.getElementById("confirmRaiseBtn").addEventListener("click", () => {
  const raiseTo = parseInt(document.getElementById("raiseAmount").value);

  const currentPlayer =
    playersData[gameState.players[gameState.currentPlayerIndex]];

  if (!raiseTo || raiseTo <= gameState.currentBet) {
    showNotification("Invalid raise", "error");

    return;
  }

  const callAmount = gameState.currentBet - currentPlayer.currentBet;

  const raiseSize = raiseTo - gameState.currentBet;

  const minRaise = gameState.lastRaiseSize || 1;

  if (
    raiseSize < minRaise &&
    raiseTo < currentPlayer.balance + currentPlayer.currentBet
  ) {
    showNotification(`Minimum raise is ₹${minRaise}`, "error");

    return;
  }

  const totalNeeded = raiseTo - currentPlayer.currentBet;

  if (totalNeeded > currentPlayer.balance) {
    showNotification("Insufficient balance", "error");

    return;
  }

  currentPlayer.balance -= totalNeeded;

  currentPlayer.currentBet = raiseTo;

  gameState.pot += totalNeeded;

  gameState.lastRaiseSize = raiseSize;

  gameState.currentBet = raiseTo;

  gameState.lastAggressorIndex = gameState.currentPlayerIndex;

  if (currentPlayer.balance === 0) {
    currentPlayer.status = "all-in";
  }

  addToHistory(`${currentPlayer.name} raised to ₹${raiseTo}`);

  showNotification(`Raised to ₹${raiseTo}`, "success");

  // IMPORTANT:
  // reset action tracking after raise

  gameState.playersWhoHaveActedThisRound.clear();

  gameState.playersWhoHaveActedThisRound.add(currentPlayer.name);

  raiseModal.classList.remove("active");

  moveToNextPlayer();

  renderGameBoard();
});

document.getElementById("cancelRaiseBtn").addEventListener("click", () => {
  document.getElementById("raiseAmount").value = "";
  raiseModal.classList.remove("active");
});

function handleAllIn() {
  const currentPlayer =
    playersData[gameState.players[gameState.currentPlayerIndex]];
  const allInAmount = currentPlayer.balance;

  if (allInAmount === 0) {
    showNotification("No balance left", "error");
    return;
  }

  gameState.pot += allInAmount;
  const newBet = currentPlayer.currentBet + allInAmount;

  if (newBet > gameState.currentBet) {
    gameState.currentBet = newBet;
  }

  currentPlayer.currentBet = newBet;
  currentPlayer.balance = 0;
  currentPlayer.status = "all-in";

  addToHistory(
    `${currentPlayer.name} went ALL-IN with ₹${allInAmount.toLocaleString("en-IN")}`,
  );
  showNotification(`${currentPlayer.name} is ALL-IN!`, "warning");

  // Mark player as having acted
  gameState.playersWhoHaveActedThisRound.add(
    gameState.players[gameState.currentPlayerIndex],
  );

  // Check if betting is done
  if (isBettingRoundComplete()) {
    showNotification(
      "All players either folded or all-in. Hand complete!",
      "info",
    );
    setTimeout(() => {
      endRound();
    }, 1500);
  } else {
    moveToNextPlayer();
  }
}

function handleFold() {
  const currentPlayer =
    playersData[gameState.players[gameState.currentPlayerIndex]];
  currentPlayer.status = "folded";

  addToHistory(`${currentPlayer.name} folded`);
  showNotification(`${currentPlayer.name} folded`, "info");

  // Mark player as having acted
  gameState.playersWhoHaveActedThisRound.add(
    gameState.players[gameState.currentPlayerIndex],
  );

  // Check if only one player remains active
  const activePlayers = gameState.players.filter(
    (name) =>
      playersData[name].status === "active" ||
      playersData[name].status === "all-in",
  );

  if (activePlayers.length === 1) {
    showNotification("Only one active player left. Hand is over!", "warning");
    setTimeout(() => endRound(), 1500);
  } else {
    moveToNextPlayer();
  }
}

function moveToNextPlayer() {
  let attempts = 0;

  do {
    gameState.currentPlayerIndex =
      (gameState.currentPlayerIndex + 1) % gameState.players.length;

    attempts++;

    if (attempts > gameState.players.length) {
      return;
    }
  } while (
    playersData[gameState.players[gameState.currentPlayerIndex]].status ===
    "folded"
  );

  renderGameBoard();
}

// ====================
// NOTIFICATION SYSTEM
// ====================
function showNotification(message, type = "info") {
  const notificationArea = document.getElementById("notificationArea");
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;

  notificationArea.appendChild(notification);

  // Auto remove after 4 seconds
  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease";
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
  historyLog.innerHTML = "";
  gameState.history.forEach((item) => {
    const historyItem = document.createElement("div");
    historyItem.className = "history-item";
    historyItem.textContent = item;
    historyLog.appendChild(historyItem);
  });
  // Auto scroll to bottom
  historyLog.scrollTop = historyLog.scrollHeight;
}

document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  gameState.history = [];
  updateHistoryDisplay();
});

// ====================
// END ROUND / WINNER SELECTION
// ====================
document
  .getElementById("endRoundBtn")
  .addEventListener("click", openWinnerSelection);

function endRound() {
  if (gameState.pot === 0) {
    showNotification("No pot to distribute", "error");
    return;
  }
  openWinnerSelection();
}

function openWinnerSelection() {
  const activePlayers = gameState.players.filter(
    (name) => playersData[name].status !== "folded",
  );

  if (activePlayers.length === 0) {
    showNotification("No active players", "error");
    return;
  }

  // Populate single winner tab
  const singleWinnerList = document.getElementById("singleWinnerList");
  singleWinnerList.innerHTML = "";

  activePlayers.forEach((playerName) => {
    const item = document.createElement("label");
    item.className = "winner-item";
    item.innerHTML = `
            <input type="radio" name="singleWinner" value="${playerName}">
            <span>${playerName}</span>
            <span class="amount">₹${gameState.pot.toLocaleString("en-IN")}</span>
        `;
    singleWinnerList.appendChild(item);
  });

  // Populate split equally tab
  const splitWinnerList = document.getElementById("splitWinnerList");
  splitWinnerList.innerHTML = "";
  const splitAmount = Math.floor(gameState.pot / activePlayers.length);

  activePlayers.forEach((playerName) => {
    const item = document.createElement("label");
    item.className = "winner-item";
    item.innerHTML = `
            <input type="checkbox" class="split-winner" value="${playerName}">
            <span>${playerName}</span>
            <span class="amount">₹${splitAmount.toLocaleString("en-IN")}</span>
        `;
    splitWinnerList.appendChild(item);
  });

  // Populate custom split tab
  const customWinnerList = document.getElementById("customWinnerList");
  customWinnerList.innerHTML = "";

  activePlayers.forEach((playerName) => {
    const item = document.createElement("div");
    item.className = "custom-winner-item";
    item.innerHTML = `
            <div class="player-name">${playerName}</div>
            <input type="number" placeholder="Amount" class="custom-amount" value="0" min="0">
        `;
    customWinnerList.appendChild(item);
  });

  document.getElementById("potForCustom").textContent =
    gameState.pot.toLocaleString("en-IN");

  // Add event listener for custom split
  document.querySelectorAll(".custom-amount").forEach((input) => {
    input.addEventListener("input", updateCustomSplitTotal);
  });

  winnerModal.classList.add("active");
  showNotification("Select winner(s) to distribute the pot", "info");
}

function updateCustomSplitTotal() {
  const inputs = document.querySelectorAll(".custom-amount");
  let total = 0;

  inputs.forEach((input) => {
    total += parseInt(input.value) || 0;
  });

  const totalDistributed = document.getElementById("totalDistributed");
  const errorMessage = document.getElementById("customSplitError");

  totalDistributed.textContent = total.toLocaleString("en-IN");

  if (total > gameState.pot) {
    errorMessage.textContent = `❌ Total exceeds pot amount (${gameState.pot})`;
    errorMessage.style.display = "block";
  } else {
    errorMessage.style.display = "none";
  }
}

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const tabName = e.target.dataset.tab;

    // Remove active class from all tabs and buttons
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((t) => t.classList.remove("active"));

    // Add active class to clicked button and corresponding tab
    e.target.classList.add("active");
    document.getElementById(`${tabName}Tab`).classList.add("active");
  });
});

document
  .getElementById("confirmWinnerBtn")
  .addEventListener("click", distributeWinnings);

function distributeWinnings() {
  const activeTab = document.querySelector(".tab-content.active").id;
  const pot = gameState.pot;
  const distribution = {}; // { playerName: amount }

  if (activeTab === "singleTab") {
    const winner = document.querySelector('input[name="singleWinner"]:checked');
    if (!winner) {
      showNotification("Please select a winner", "error");
      return;
    }
    distribution[winner.value] = pot;
  } else if (activeTab === "splitTab") {
    const winners = document.querySelectorAll(".split-winner:checked");
    if (winners.length === 0) {
      showNotification("Please select at least one winner", "error");
      return;
    }
    const amountPerWinner = Math.floor(pot / winners.length);
    const remainder = pot % winners.length;

    winners.forEach((winner, index) => {
      const amount = amountPerWinner + (index < remainder ? 1 : 0);
      distribution[winner.value] = amount;
    });
  } else if (activeTab === "customTab") {
    const inputs = document.querySelectorAll(".custom-amount");
    let totalDistributed = 0;

    inputs.forEach((input) => {
      const parent = input.parentElement;
      const playerName = parent.querySelector(".player-name").textContent;
      const amount = parseInt(input.value) || 0;

      if (amount > 0) {
        distribution[playerName] = amount;
        totalDistributed += amount;
      }
    });

    if (totalDistributed !== pot) {
      showNotification(
        `Total distributed must equal pot amount (₹${pot})`,
        "error",
      );
      return;
    }
  }

  // Apply distribution
  Object.entries(distribution).forEach(([playerName, amount]) => {
    playersData[playerName].balance += amount;
    playersData[playerName].totalWon += amount;

    addToHistory(`${playerName} won ₹${amount.toLocaleString("en-IN")}`);
    showNotification(
      `${playerName} won ₹${amount.toLocaleString("en-IN")}`,
      "success",
    );
  });

  // Update players who lost
  gameState.players.forEach((playerName) => {
    if (!distribution[playerName]) {
      const playerBet = playersData[playerName].currentBet;
      playersData[playerName].totalLost += playerBet;
    }
  });

  // Close modal and prepare for next round
  winnerModal.classList.remove("active");

  // Check if game can continue
  const activePlayers = gameState.players.filter(
    (name) => playersData[name].balance > 0,
  );

  if (activePlayers.length <= 1) {
    showNotification("Game over! Only one player has money left.", "warning");
    setTimeout(() => endGame(), 1500);
  } else {
    newRound();
  }
}

// ====================
// NEW ROUND / RESET GAME
// ====================
document.getElementById("newRoundBtn").addEventListener("click", newRound);
document.getElementById("resetGameBtn").addEventListener("click", resetGame);

function newRound() {
  gameState.roundNumber++;

  gameState.pot = 0;

  gameState.currentBet = 0;

  gameState.communityCards = [];

  gameState.gameStage = "PRE_FLOP";

  gameState.bettingRoundNumber = 0;

  gameState.playersWhoHaveActedThisRound.clear();

  gameState.lastRaiseSize = 0;

  gameState.lastAggressorIndex = null;

  gameState.history = [];

  gameState.players.forEach((playerName) => {
    playersData[playerName].status =
      playersData[playerName].balance > 0 ? "active" : "folded";

    playersData[playerName].currentBet = 0;
  });

  gameState.currentPlayerIndex = 0;

  renderGameBoard();

  updateHistoryDisplay();

  showNotification(`Round ${gameState.roundNumber} started!`, "info");
}

function resetGame() {
  if (confirm("Are you sure you want to reset the entire game?")) {
    setupScreen.classList.add("active");
    gameScreen.classList.remove("active");

    gameState.gameStarted = false;
    gameState.roundNumber = 1;
    gameState.history = [];

    // Clear all modals
    raiseModal.classList.remove("active");
    winnerModal.classList.remove("active");
    moneyTrackingModal.classList.remove("active");

    document.getElementById("raiseAmount").value = "";

    // Reset to setup
    updatePlayerSetupList();

    showNotification("Game reset. Ready for new game!", "info");
  }
}

function endGame() {
  showNotification("Game concluded!", "success");
  setTimeout(() => {
    if (confirm("Game ended. Would you like to see money tracking or reset?")) {
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
  const trackingList = document.getElementById("moneyTrackingList");
  trackingList.innerHTML = "";

  gameState.players.forEach((playerName) => {
    const player = playersData[playerName];
    const profit = player.totalWon - player.totalLost;
    const profitClass = profit >= 0 ? "profit" : "loss";

    const item = document.createElement("div");
    item.className = "tracking-item";
    item.innerHTML = `
            <div class="player-name">${player.name}</div>
            <div class="tracking-stat">
                <label>Starting Balance:</label>
                <span class="value">₹${player.startingBalance.toLocaleString("en-IN")}</span>
            </div>
            <div class="tracking-stat">
                <label>Current Balance:</label>
                <span class="value">₹${player.balance.toLocaleString("en-IN")}</span>
            </div>
            <div class="tracking-stat">
                <label>Total Won:</label>
                <span class="value">₹${player.totalWon.toLocaleString("en-IN")}</span>
            </div>
            <div class="tracking-stat">
                <label>Total Lost:</label>
                <span class="value">₹${player.totalLost.toLocaleString("en-IN")}</span>
            </div>
            <div class="tracking-stat ${profitClass}">
                <label>Profit/Loss:</label>
                <span class="value">${profit >= 0 ? "↑" : "↓"} ₹${Math.abs(profit).toLocaleString("en-IN")}</span>
            </div>
        `;
    trackingList.appendChild(item);
  });

  moneyTrackingModal.classList.add("active");
}

document.getElementById("closeTrackingBtn").addEventListener("click", () => {
  moneyTrackingModal.classList.remove("active");
});

// ====================
// INITIALIZATION
// ====================
updatePlayerSetupList();
