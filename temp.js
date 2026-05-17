
// ====================
// GLOBAL STATE
// ====================
const gameState = {
  players: [],
  currentPlayerIndex: 0,
  dealerIndex: 0,
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
  raiseSequenceTracker: {}, // Tracks raise sequences for 4-player special rule
  cardsRevealed: false, // Tracks if cards have been revealed (for 4-player rule)
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
      description: "Betting before any community cards are revealed (Texas Hold'em initial round)",
    },
    {
      stage: "FLOP",
      cardsRevealed: 3,
      name: "Flop",
      description: "3 community cards revealed, second betting round",
    },
    {
      stage: "TURN",
      cardsRevealed: 4,
      name: "Turn",
      description: "1 additional community card (4th card), third betting round",
    },
    {
      stage: "RIVER",
      cardsRevealed: 5,
      name: "River",
      description: "Final community card (5th card), fourth and final betting round",
    },
  ],

  ACTIONS: {
    CHECK: {
      allowed: (currentBet, playerBet) => currentBet === playerBet,
      description: "Check if no bet has been made (pass your turn without betting)",
    },

    CALL: {
      allowed: (currentBet, playerBet, balance) => {
        const callAmount = currentBet - playerBet;
        return callAmount > 0 && balance > 0;
      },
      description: "Match the current bet amount to stay in the hand",
    },

    RAISE: {
      allowed: (currentBet, playerBet, balance) => {
        return balance > currentBet - playerBet;
      },
      description: "Increase the current bet amount (must be at least double the last raise)",
    },

    FOLD: {
      allowed: () => true,
      description: "Discard your hand and exit the current round (forfeit bets)",
    },

    ALL_IN: {
      allowed: (currentBet, playerBet, balance) => balance > 0,
      description: "Bet all remaining chips at once",
    },
  },

  STANDARD_RULES: [
    "1. Dealer button moves clockwise after each round",
    "2. Small blind is posted by player after dealer",
    "3. Big blind is posted by player after small blind",
    "4. Blinds are forced bets to start the pot",
    "5. Each player receives 2 private cards (hole cards)",
    "6. Betting proceeds clockwise starting after big blind",
    "7. Texas Hold'em hand ranking: Royal Flush > Straight Flush > Four of a Kind > Full House > Flush > Straight > Three of a Kind > Two Pair > One Pair > High Card",
    "8. Once a bet is raised, other players must match the new amount or fold",
    "9. Betting round ends when all active players have matched the highest bet or folded",
    "10. Community cards are revealed progressively: Flop (3), Turn (1), River (1)",
  ],
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
 * Special Rule for 4 Players: If Player 1 raises and Player 2 re-raises,
 * cards are NOT revealed until Player 1 calls
 */
function progressGameStage() {
  const stages = POKER_RULES.COMMUNITY_CARDS_STAGES;
  const currentStageIndex = stages.findIndex(
    (s) => s.stage === gameState.gameStage,
  );

  // Check 4-player special rule
  if (gameState.players.length === 4 && !gameState.cardsRevealed) {
    const raiseTracker = gameState.raiseSequenceTracker;
    // If we have a raise-re-raise pattern and Player 1 hasn't called yet, don't progress
    if (raiseTracker.player1Raised && raiseTracker.player2Reraised && !raiseTracker.player1Called) {
      addToHistory(`⚠️  4-Player Rule: Cards held. Waiting for Player 1 to call Player 2's re-raise.`);
      return false;
    }
  }

  if (currentStageIndex < stages.length - 1) {
    const nextStage = stages[currentStageIndex + 1];
    gameState.gameStage = nextStage.stage;
    gameState.cardsRevealed = true;

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
  gameState.dealerIndex = 0;
  gameState.raiseSequenceTracker = {};
  gameState.cardsRevealed = false;

  gameState.players.forEach((playerName) => {
    playersData[playerName].status = "active";

    playersData[playerName].currentBet = 0;
  });

  renderGameBoard();

  addToHistory("=== GAME STARTED ===");

