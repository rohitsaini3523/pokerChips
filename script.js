// ========================================
// POKER BETTING MANAGER - JAVASCRIPT
// ========================================

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
  raiseSequenceTracker: {},
  cardsRevealed: false,
  actionHistory: [], // Track actions for undo functionality
};

const playersData = {
  // Will store: { name, balance, totalWon, totalLost, currentBet, status, startingBalance }
};

// ====================
// POKER RULES & CONSTANTS
// ====================
const POKER_RULES = {
  // Game phases
  GAME_PHASES: {
    PRE_FLOP: "PRE_FLOP",
    FLOP: "FLOP",
    TURN: "TURN",
    RIVER: "RIVER",
    SHOWDOWN: "SHOWDOWN",
    ROUND_END: "ROUND_END",
  },

  // Player statuses
  PLAYER_STATUS: {
    ACTIVE: "active",
    FOLDED: "folded",
    ALL_IN: "all-in",
    ELIMINATED: "eliminated",
  },

  COMMUNITY_CARDS_STAGES: [
    {
      stage: "PRE_FLOP",
      cardsRevealed: 0,
      name: "Pre-Flop",
      description: "Pre-flop betting round.",
    },
    {
      stage: "FLOP",
      cardsRevealed: 3,
      name: "Flop",
      description: "3 community cards revealed",
    },
    {
      stage: "TURN",
      cardsRevealed: 4,
      name: "Turn",
      description: "1 additional community card (4th card)",
    },
    {
      stage: "RIVER",
      cardsRevealed: 5,
      name: "River",
      description: "Final community card (5th card)",
    },
  ],

  HAND_RANKINGS: {
    ROYAL_FLUSH: { rank: 10, name: "Royal Flush" },
    STRAIGHT_FLUSH: { rank: 9, name: "Straight Flush" },
    FOUR_OF_A_KIND: { rank: 8, name: "Four of a Kind" },
    FULL_HOUSE: { rank: 7, name: "Full House" },
    FLUSH: { rank: 6, name: "Flush" },
    STRAIGHT: { rank: 5, name: "Straight" },
    THREE_OF_A_KIND: { rank: 4, name: "Three of a Kind" },
    TWO_PAIR: { rank: 3, name: "Two Pair" },
    ONE_PAIR: { rank: 2, name: "One Pair" },
    HIGH_CARD: { rank: 1, name: "High Card" },
  },

  ACTIONS: {
    CHECK: {
      allowed: (currentBet, playerBet) => currentBet === playerBet,
      description: "Pass without betting",
    },

    CALL: {
      allowed: (currentBet, playerBet, balance) => {
        const callAmount = currentBet - playerBet;
        return callAmount > 0 && balance > 0;
      },
      description: "Match the current bet",
    },

    RAISE: {
      allowed: (currentBet, playerBet, balance) => {
        return balance > currentBet - playerBet;
      },
      description: "Increase the current bet",
    },

    FOLD: {
      allowed: () => true,
      description: "Exit the hand",
    },

    ALL_IN: {
      allowed: (currentBet, playerBet, balance) => balance > 0,
      description: "Bet all remaining chips",
    },
  },
};

// ====================
// LOCALSTORAGE MANAGEMENT
// ====================

const STORAGE_KEYS = {
  GAME_STATE: "pokerChips_gameState",
  PLAYERS_DATA: "pokerChips_playersData",
  GAME_HISTORY: "pokerChips_gameHistory",
};

/**
 * Save current game state to localStorage
 */
function saveGameState() {
  try {
    // Convert Sets to Arrays for JSON serialization
    const gameStateToSave = {
      ...gameState,
      playersWhoHaveActedThisRound: Array.from(gameState.playersWhoHaveActedThisRound),
    };

    localStorage.setItem(STORAGE_KEYS.GAME_STATE, JSON.stringify(gameStateToSave));
    localStorage.setItem(STORAGE_KEYS.PLAYERS_DATA, JSON.stringify(playersData));
    localStorage.setItem(STORAGE_KEYS.GAME_HISTORY, JSON.stringify(gameState.history));
  } catch (error) {
    console.error("Error saving game state:", error);
  }
}

/**
 * Load game state from localStorage
 * Returns true if state was loaded, false if no saved state exists
 */
function loadGameState() {
  try {
    const savedGameState = localStorage.getItem(STORAGE_KEYS.GAME_STATE);
    const savedPlayersData = localStorage.getItem(STORAGE_KEYS.PLAYERS_DATA);

    if (!savedGameState || !savedPlayersData) {
      return false;
    }

    const gameStateData = JSON.parse(savedGameState);
    const playersDataValue = JSON.parse(savedPlayersData);

    // Restore gameState
    Object.assign(gameState, gameStateData);
    
    // Convert Arrays back to Sets
    gameState.playersWhoHaveActedThisRound = new Set(
      gameStateData.playersWhoHaveActedThisRound || []
    );

    // Restore playersData
    Object.assign(playersData, playersDataValue);

    // Restore history
    const savedHistory = localStorage.getItem(STORAGE_KEYS.GAME_HISTORY);
    if (savedHistory) {
      gameState.history = JSON.parse(savedHistory);
    }

    return true;
  } catch (error) {
    console.error("Error loading game state:", error);
    return false;
  }
}

/**
 * Clear all saved game state from localStorage
 */
function clearSavedGameState() {
  try {
    localStorage.removeItem(STORAGE_KEYS.GAME_STATE);
    localStorage.removeItem(STORAGE_KEYS.PLAYERS_DATA);
    localStorage.removeItem(STORAGE_KEYS.GAME_HISTORY);
  } catch (error) {
    console.error("Error clearing saved game state:", error);
  }
}

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
 * Hand Ranking Engine - Evaluates poker hands
 * Returns: { rank: number, name: string, kickers: array }
 */
function evaluatePokerHand(cards) {
  // Enhanced Texas Hold'em hand evaluator
  // Selects best 5-card hand from 7 available cards
  if (!cards || cards.length < 5) {
    return { rank: 0, name: "Invalid Hand", kickers: [] };
  }

  const rankValues = { "A": 14, "K": 13, "Q": 12, "J": 11, "10": 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };
  
  // Generate all 5-card combinations from available cards
  let bestHand = null;
  let bestRank = -1;

  function generateCombinations(arr, size) {
    const result = [];
    const combine = (prefix, start) => {
      if (prefix.length === size) {
        result.push([...prefix]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        prefix.push(arr[i]);
        combine(prefix, i + 1);
        prefix.pop();
      }
    };
    combine([], 0);
    return result;
  }

  const combinations = generateCombinations(cards, 5);

  for (const combo of combinations) {
    const sorted = combo.sort((a, b) => rankValues[b.rank] - rankValues[a.rank]);
    const values = sorted.map(c => rankValues[c.rank]);
    const suits = sorted.map(c => c.suit);

    // Check for flush
    const isFlush = suits.every(s => s === suits[0]);

    // Check for straight (including wheel A-2-3-4-5)
    let isStraight = false;
    let straightHigh = 0;
    
    if (values[0] - values[4] === 4 && new Set(values).size === 5) {
      isStraight = true;
      straightHigh = values[0];
    }
    // Wheel straight check (A-2-3-4-5)
    else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
      isStraight = true;
      straightHigh = 5; // In wheel, 5 is high
    }

    // Count ranks for pairs, trips, quads
    const rankCounts = {};
    sorted.forEach(c => {
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    });

    const counts = Object.values(rankCounts).sort((a, b) => b - a);

    // Determine hand rank and construct evaluation
    let handRank = -1;
    let handName = "";
    let kickers = values;

    if (isStraight && isFlush) {
      handRank = 9;
      handName = straightHigh === 5 ? "Straight Flush (Wheel)" : "Straight Flush";
      kickers = straightHigh === 5 ? [5, 4, 3, 2, 1] : values;
    } else if (counts[0] === 4) {
      handRank = 8;
      handName = "Four of a Kind";
      const quad = sorted.filter(c => rankCounts[c.rank] === 4)[0];
      kickers = [rankValues[quad.rank], ...sorted.filter(c => c.rank !== quad.rank).map(c => rankValues[c.rank])];
    } else if (counts[0] === 3 && counts[1] === 2) {
      handRank = 7;
      handName = "Full House";
      const trips = sorted.filter(c => rankCounts[c.rank] === 3)[0];
      const pair = sorted.filter(c => rankCounts[c.rank] === 2)[0];
      kickers = [rankValues[trips.rank], rankValues[pair.rank]];
    } else if (isFlush) {
      handRank = 6;
      handName = "Flush";
      kickers = values;
    } else if (isStraight) {
      handRank = 5;
      handName = straightHigh === 5 ? "Straight (Wheel)" : "Straight";
      kickers = straightHigh === 5 ? [5, 4, 3, 2, 1] : values;
    } else if (counts[0] === 3) {
      handRank = 4;
      handName = "Three of a Kind";
      const trips = sorted.filter(c => rankCounts[c.rank] === 3)[0];
      const kickersArray = sorted.filter(c => c.rank !== trips.rank).map(c => rankValues[c.rank]).sort((a, b) => b - a);
      kickers = [rankValues[trips.rank], ...kickersArray];
    } else if (counts[0] === 2 && counts[1] === 2) {
      handRank = 3;
      handName = "Two Pair";
      const pairs = sorted.filter(c => rankCounts[c.rank] === 2);
      const pair1 = rankValues[pairs[0].rank];
      const pair2 = rankValues[pairs[1].rank];
      const kicker = rankValues[sorted.filter(c => rankCounts[c.rank] === 1)[0].rank];
      kickers = [Math.max(pair1, pair2), Math.min(pair1, pair2), kicker];
    } else if (counts[0] === 2) {
      handRank = 2;
      handName = "One Pair";
      const pair = sorted.filter(c => rankCounts[c.rank] === 2)[0];
      const kickersArray = sorted.filter(c => c.rank !== pair.rank).map(c => rankValues[c.rank]).sort((a, b) => b - a);
      kickers = [rankValues[pair.rank], ...kickersArray];
    } else {
      handRank = 1;
      handName = "High Card";
      kickers = values;
    }

    // Update best hand if this is better
    if (handRank > bestRank || (handRank === bestRank && compareKickers(kickers, bestHand?.kickers || []))) {
      bestRank = handRank;
      bestHand = { rank: handRank, name: handName, kickers };
    }
  }

  return bestHand || { rank: 1, name: "High Card", kickers: [] };
}

function compareKickers(kickers1, kickers2) {
  if (kickers2.length === 0) return true;
  for (let i = 0; i < Math.min(kickers1.length, kickers2.length); i++) {
    if (kickers1[i] > kickers2[i]) return true;
    if (kickers1[i] < kickers2[i]) return false;
  }
  return false;
}

/**
 * Compares two poker hands and returns winner
 * Returns: { winner: 1 or 2, winningHand: hand object }
 */
function compareHands(hand1, hand2) {
  const eval1 = evaluatePokerHand(hand1);
  const eval2 = evaluatePokerHand(hand2);

  if (eval1.rank > eval2.rank) return { winner: 1, winningHand: eval1 };
  if (eval2.rank > eval1.rank) return { winner: 2, winningHand: eval2 };

  // Same rank, compare kickers
  for (let i = 0; i < eval1.kickers.length; i++) {
    if (eval1.kickers[i] > eval2.kickers[i]) return { winner: 1, winningHand: eval1 };
    if (eval2.kickers[i] > eval1.kickers[i]) return { winner: 2, winningHand: eval2 };
  }

  return { winner: 0, winningHand: eval1 }; // Tie
}

/**
 * Calculate side pots when players go all-in with different amounts
 * Returns: { mainPot: number, sidePots: [{ amount, eligiblePlayers }] }
 */
function calculateSidePots() {
  const sidePots = [];
  const activePlayers = gameState.players.filter(name => {
    const player = playersData[name];
    return player.status === "active" || player.status === "all-in";
  });

  if (activePlayers.length === 0) return { mainPot: gameState.pot, sidePots: [] };

  // Get all unique bet amounts
  const betAmounts = activePlayers
    .map(name => playersData[name].currentBet)
    .sort((a, b) => a - b);

  let previousAmount = 0;
  let potSoFar = 0;

  for (let amount of betAmounts) {
    if (amount > previousAmount) {
      const contribution = (amount - previousAmount) * activePlayers.length;
      const eligiblePlayers = activePlayers.filter(
        name => playersData[name].currentBet >= amount
      );

      if (eligiblePlayers.length > 0) {
        sidePots.push({
          amount: contribution,
          eligiblePlayers: eligiblePlayers,
          minBet: amount,
        });
        potSoFar += contribution;
      }
      previousAmount = amount;
    }
  }

  return { sidePots, totalPot: potSoFar };
}

/**
 * Determines winner(s) based on hands (Showdown Logic)
 * Handles side pots and tie scenarios
 * Returns: { winners: [{ playerName, amount, hand }], distribution: {} }
 */
function determineShowdownWinner() {
  const activePlayers = gameState.players.filter(name => {
    const player = playersData[name];
    return player.status === "active" || player.status === "all-in";
  });

  if (activePlayers.length === 0) {
    addToHistory("No active players for showdown");
    return { winners: [], distribution: {} };
  }

  const { sidePots } = calculateSidePots();
  const distribution = {};
  const winners = [];

  // Evaluate each side pot
  for (let pot of sidePots) {
    const eligiblePlayers = pot.eligiblePlayers;

    if (eligiblePlayers.length === 1) {
      // Only one player eligible for this pot
      const winner = eligiblePlayers[0];
      distribution[winner] = (distribution[winner] || 0) + pot.amount;
      winners.push({
        playerName: winner,
        amount: pot.amount,
        reason: "Only eligible player",
      });
    } else {
      // Multiple players - evaluate hands
      let bestHand = null;
      let bestPlayers = [];

      for (let playerName of eligiblePlayers) {
        // In real scenario, players would have hole cards
        // For now, we evaluate based on community cards
        const hand = gameState.communityCards;
        const evaluation = evaluatePokerHand(hand);

        if (!bestHand || evaluation.rank > bestHand.rank) {
          bestHand = evaluation;
          bestPlayers = [playerName];
        } else if (evaluation.rank === bestHand.rank) {
          bestPlayers.push(playerName);
        }
      }

      // Split pot among best players
      const amountPerWinner = Math.floor(pot.amount / bestPlayers.length);
      const remainder = pot.amount % bestPlayers.length;

      bestPlayers.forEach((playerName, index) => {
        const amount = amountPerWinner + (index < remainder ? 1 : 0);
        distribution[playerName] = (distribution[playerName] || 0) + amount;
        winners.push({
          playerName,
          amount,
          hand: bestHand,
          tied: bestPlayers.length > 1,
        });
      });
    }
  }

  return { winners, distribution };
}

/**
 * Executes showdown and distributes pot
 */
function executeShowdown() {
  addToHistory("--- SHOWDOWN ---");

  const result = determineShowdownWinner();
  const { winners, distribution } = result;

  if (winners.length === 0) {
    addToHistory("No winner determined. Pot returned.");
    return;
  }

  // Distribute winnings
  Object.entries(distribution).forEach(([playerName, amount]) => {
    if (amount > 0) {
      playersData[playerName].balance += amount;
      playersData[playerName].totalWon += amount;
      addToHistory(
        `${playerName} wins ₹${amount.toLocaleString("en-IN")} - ${
          winners.find(w => w.playerName === playerName)?.hand?.name || "Best hand"
        }`
      );
      showNotification(
        `${playerName} wins ₹${amount.toLocaleString("en-IN")}`,
        "success"
      );
    }
  });

  // Mark losers
  gameState.players.forEach((playerName) => {
    if (!distribution[playerName]) {
      const lost = playersData[playerName].currentBet;
      playersData[playerName].totalLost += lost;
    }
  });
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
// INITIALIZE PAGE - CHECK FOR SAVED GAME
// ====================

/**
 * Initialize the page - check for saved game state
 */
function initializePage() {
  const hasSavedGame = loadGameState();
  
  if (hasSavedGame && gameState.gameStarted) {
    // Restore UI to game screen
    setupScreen.classList.remove("active");
    gameScreen.classList.add("active");
    renderGameBoard();
    updatePotDisplay();
    updateHistoryDisplay();
    showNotification("✅ Game restored from previous session!", "success");
    addToHistory("🔄 Game restored from previous session");
  } else {
    // Show setup screen
    setupScreen.classList.add("active");
    gameScreen.classList.remove("active");
    updatePlayerSetupList();
  }
}

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
  saveGameState();
  showNotification(`Game started with ${count} players!`, "success");
}

function initializeGame() {
  // Start from player after dealer
  gameState.currentPlayerIndex = (gameState.dealerIndex + 1) % gameState.players.length;

  gameState.pot = 0;
  gameState.currentBet = 0;
  gameState.communityCards = [];
  gameState.gameStage = "PRE_FLOP";
  gameState.bettingRoundNumber = 0;
  gameState.playersWhoHaveActedThisRound.clear();
  gameState.lastRaiseSize = 0;
  gameState.lastAggressorIndex = null;
  gameState.history = [];
  gameState.raiseSequenceTracker = {};
  gameState.cardsRevealed = false;

  gameState.players.forEach((playerName) => {
    playersData[playerName].status = "active";
    playersData[playerName].currentBet = 0;
  });

  renderGameBoard();

  addToHistory("=== ROUND STARTED ===");
  addToHistory(`🎰 Dealer: ${gameState.players[gameState.dealerIndex]}`);
  addToHistory(`📍 First to act: ${gameState.players[gameState.currentPlayerIndex]}`);
  
  if (gameState.players.length === 4) {
    addToHistory("⚠️ SPECIAL 4-PLAYER RULE: P1 raises → P2 re-raises → Cards held until P1 calls!");
  }
}

// ====================
// GAME BOARD RENDERING
// ====================
function renderGameBoard() {
  playersContainer.innerHTML = "";

  gameState.players.forEach((playerName, index) => {
    const player = playersData[playerName];
    const isActive = index === gameState.currentPlayerIndex;
    const isDealer = index === gameState.dealerIndex;
    
    const playerCard = document.createElement("div");

    playerCard.className = "player-card";
    if (isActive) playerCard.classList.add("active");
    if (isDealer) playerCard.classList.add("dealer");
    if (player.status === "folded") playerCard.classList.add("folded");
    if (player.status === "all-in") playerCard.classList.add("all-in");

    let badges = "";
    if (isDealer) badges += `<div class="badge dealer-badge">🎰 D</div>`;

    playerCard.innerHTML = `
            ${badges}
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
  updatePotDisplay();
  saveGameState();
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
  // Start new street from dealer (or first active player after dealer)
  
  let nextPlayerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
  
  // Find first active player starting from dealer position
  for (let i = 0; i < gameState.players.length; i++) {
    const playerName = gameState.players[nextPlayerIndex];
    if (playersData[playerName].status === "active") {
      break;
    }
    nextPlayerIndex = (nextPlayerIndex + 1) % gameState.players.length;
  }
  
  gameState.currentPlayerIndex = nextPlayerIndex;

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
  updatePotDisplay();
  saveGameState();
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

  renderGameBoard();
  updatePotDisplay();
  saveGameState();

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

  renderGameBoard();
  updatePotDisplay();
  saveGameState();

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
  const totalPlayers = gameState.players.length;

  // Safety check
  if (totalPlayers === 0) return;

  let nextIndex = gameState.currentPlayerIndex;
  let attempts = 0;

  do {
    nextIndex = (nextIndex + 1) % totalPlayers;
    attempts++;

    // Prevent infinite loop
    if (attempts > totalPlayers) {
      console.warn("No valid next player found");
      return;
    }

    const playerName = gameState.players[nextIndex];
    const player = playersData[playerName];

    // Skip folded and all-in players
    if (
      player &&
      player.status === "active"
    ) {
      // If betting round already complete, stop here
      if (isBettingRoundComplete()) {
        return;
      }

      gameState.currentPlayerIndex = nextIndex;

      renderGameBoard();
      updatePotDisplay();
      saveGameState();

      return;
    }
  } while (attempts <= totalPlayers);

  console.warn("Could not move to next active player");
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

// ====================
// ADMIN CONTROLS
// ====================

/**
 * Generic helper to open a modal by ID
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
  }
}

/**
 * Generic helper to close a modal by ID
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
  }
}

let adminMode = false;

/**
 * Admin function to force a player to fold
 */
function handlePlayerFold(playerName, isAdmin = false) {
  const player = playersData[playerName];
  if (!player) return;

  player.status = "folded";

  if (isAdmin) {
    addToHistory(`🔨 Admin forced ${playerName} to fold`);
  } else {
    addToHistory(`${playerName} folded`);
  }
  showNotification(`${playerName} folded`, "info");

  gameState.playersWhoHaveActedThisRound.add(playerName);
}

document.getElementById("toggleAdminBtn").addEventListener("click", () => {
  adminMode = !adminMode;
  document.getElementById("adminPanel").style.display = adminMode ? "block" : "none";
  addToHistory(`⚙️  Admin Mode: ${adminMode ? "ON" : "OFF"}`);
});

document.getElementById("showdownBtn").addEventListener("click", () => {
  if (gameState.gameStage === "SHOWDOWN" || gameState.gameStage === "RIVER") {
    executeShowdown();
    addToHistory("🏆 Showdown forced by admin");
  } else {
    showNotification("Not at showdown stage yet", "warning");
  }
});

document.getElementById("undoBtn").addEventListener("click", () => {
  if (gameState.actionHistory && gameState.actionHistory.length > 0) {
    const lastAction = gameState.actionHistory.pop();
    addToHistory(`↩️  Undo: ${lastAction}`);
    showNotification("Last action undone", "info");
  } else {
    showNotification("No actions to undo", "warning");
  }
});

document.getElementById("forceFoldBtn").addEventListener("click", () => {
  openPlayerSelectionModal("Select player to fold", (playerName) => {
    handlePlayerFold(playerName, true);
    addToHistory(`🔨 Admin forced ${playerName} to fold`);
  });
});

document.getElementById("removePlayerBtn").addEventListener("click", () => {
  openPlayerSelectionModal("Select player to remove", (playerName) => {
    const idx = gameState.players.indexOf(playerName);
    if (idx > -1) {
      gameState.players.splice(idx, 1);
      delete playersData[playerName];
      addToHistory(`❌ Admin removed ${playerName} from game`);
      renderGameBoard();
    }
  });
});

document.getElementById("adjustBalanceBtn").addEventListener("click", () => {
  openPlayerSelectionModal("Select player to adjust balance", (playerName) => {
    selectedAdminPlayer = playerName;
    document.getElementById("selectedPlayerDisplay").textContent = `Selected: ${playerName}`;
    document.getElementById("balanceAdjustAmount").value = "";
    document.getElementById("balanceAdjustType").value = "add";
    openModal("adjustBalanceModal");
  });
});

document.getElementById("confirmAdjustBtn").addEventListener("click", () => {
  if (!selectedAdminPlayer) {
    showNotification("No player selected", "warning");
    return;
  }

  const amount = parseInt(document.getElementById("balanceAdjustAmount").value);
  const type = document.getElementById("balanceAdjustType").value;

  if (isNaN(amount) || amount < 0) {
    showNotification("Invalid amount", "error");
    return;
  }

  const oldBalance = playersData[selectedAdminPlayer].balance;
  let newBalance = oldBalance;

  if (type === "add") {
    newBalance = oldBalance + amount;
  } else if (type === "subtract") {
    newBalance = oldBalance - amount;
  } else if (type === "set") {
    newBalance = amount;
  }

  playersData[selectedAdminPlayer].balance = newBalance;
  addToHistory(
    `⚙️  Admin adjusted ${selectedAdminPlayer} balance: ₹${oldBalance.toLocaleString("en-IN")} → ₹${newBalance.toLocaleString("en-IN")}`
  );
  showNotification(`Balance adjusted for ${selectedAdminPlayer}`, "success");
  closeModal("adjustBalanceModal");
  renderGameBoard();
});

document.getElementById("cancelAdjustBtn").addEventListener("click", () => {
  closeModal("adjustBalanceModal");
});

let selectedAdminPlayer = null;

function openPlayerSelectionModal(title, callback) {
  document.getElementById("selectPlayerTitle").textContent = title;
  const list = document.getElementById("playerSelectionList");
  list.innerHTML = "";

  gameState.players.forEach((playerName) => {
    const div = document.createElement("div");
    div.className = "player-selection-item";
    div.style.cssText =
      "padding: 10px; margin: 5px 0; background: #f0f0f0; border-radius: 5px; cursor: pointer; border: 2px solid transparent;";
    div.textContent = `${playerName} - Balance: ₹${playersData[
      playerName
    ].balance.toLocaleString("en-IN")}`;
    div.onmouseover = () => (div.style.background = "#e0e0e0");
    div.onmouseout = () => (div.style.background = "#f0f0f0");
    div.onclick = () => {
      callback(playerName);
      closeModal("selectPlayerModal");
    };
    list.appendChild(div);
  });

  document.getElementById("cancelSelectPlayerBtn").onclick = () => {
    closeModal("selectPlayerModal");
  };

  openModal("selectPlayerModal");
}

function newRound() {
  gameState.roundNumber++;
  clearSavedGameState();

  // Move dealer button clockwise
  gameState.dealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;

  // Start from player after dealer
  gameState.currentPlayerIndex = (gameState.dealerIndex + 1) % gameState.players.length;

  gameState.pot = 0;
  gameState.currentBet = 0;
  gameState.communityCards = [];
  gameState.gameStage = "PRE_FLOP";
  gameState.bettingRoundNumber = 0;
  gameState.playersWhoHaveActedThisRound.clear();
  gameState.lastRaiseSize = 0;
  gameState.lastAggressorIndex = null;
  gameState.history = [];
  gameState.raiseSequenceTracker = {};
  gameState.cardsRevealed = false;

  gameState.players.forEach((playerName) => {
    playersData[playerName].status =
      playersData[playerName].balance > 0 ? "active" : "folded";
    playersData[playerName].currentBet = 0;
  });

  renderGameBoard();
  updateHistoryDisplay();

  addToHistory(`--- Round ${gameState.roundNumber} Started ---`);
  addToHistory(`🎰 Dealer: ${gameState.players[gameState.dealerIndex]}`);
  addToHistory(`📍 First to act: ${gameState.players[gameState.currentPlayerIndex]}`);

  showNotification(`Round ${gameState.roundNumber} started! Dealer moved to ${gameState.players[gameState.dealerIndex]}`, "info");
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

    // Clear saved game state from localStorage
    clearSavedGameState();

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
// Initialize page - check for saved game or show setup
initializePage();
