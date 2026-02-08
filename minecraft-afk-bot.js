// =====================================================
// MINECRAFT AFK BOT - Complete Node.js Script
// =====================================================
// Features:
// - Anti-idle: random jumping, sprinting, block breaking, walking
// - Smart chat: only messages when no other players, no spam
// - Auto-reconnect on ban with unique username (5 sec delay)
// - Retry on server offline (every 60 seconds)
// =====================================================

const mineflayer = require('mineflayer');

// ========== CONFIGURATION ==========
const CONFIG = {
  host: 'chiku99.aternos.me',  // Change this!
  port: 50044,                      // Change if needed
  baseName: 'MC_Bot',               // Base bot name
  version: '1.20.4',                // Minecraft version (adjust as needed)
};

// ========== STATE ==========
const usedNames = new Set();
let bot = null;
let isRunning = true;
let actionInterval = null;
let chatInterval = null;
let reconnectTimeout = null;

// ========== RANDOM DATA ==========
const RANDOM_MESSAGES = [
  "Anyone online?",
  "This server is pretty cool",
  "AFK but not really lol",
  "Just vibing here",
  "Hello world!",
  "Nice builds around here",
  "Where is everyone?",
  "I'm exploring the area",
  "Found some diamonds... jk",
  "The weather is nice today",
  "Creeper? Aw man...",
  "Mining away...",
  "Is this server lag or just me?",
  "brb getting snacks",
  "I love this server!",
];

const NAME_SUFFIXES = [
  "Pro", "Master", "King", "Hero", "Legend", "Ninja", "Shadow",
  "Storm", "Fire", "Ice", "Dark", "Light", "Swift", "Bold", "Epic",
  "Ultra", "Mega", "Super", "Alpha", "Beta", "Prime", "Elite", "Ace"
];

// ========== UTILITIES ==========
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const prefix = {
    info: '[INFO]',
    action: '[ACTION]',
    chat: '[CHAT]',
    error: '[ERROR]',
    success: '[SUCCESS]',
    warning: '[WARNING]'
  }[type] || '[INFO]';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function getUniqueName() {
  let name = CONFIG.baseName;
  let attempts = 0;
  
  while (usedNames.has(name) && attempts < 50) {
    const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
    const num = Math.floor(Math.random() * 999);
    name = `${CONFIG.baseName}_${suffix}${num}`;
    attempts++;
  }
  
  if (usedNames.has(name)) {
    name = `${CONFIG.baseName}_${Date.now().toString(36)}`;
  }
  
  usedNames.add(name);
  return name;
}

function getRandomMessage() {
  return RANDOM_MESSAGES[Math.floor(Math.random() * RANDOM_MESSAGES.length)];
}

function getPlayerCount() {
  if (!bot || !bot.players) return 0;
  // Count players excluding the bot itself
  return Object.keys(bot.players).filter(name => name !== bot.username).length;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== ANTI-IDLE ACTIONS ==========
function performRandomAction() {
  if (!bot || !bot.entity) return;
  
  const actions = [
    () => {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 300);
      log('Jumping!', 'action');
    },
    () => {
      bot.setControlState('sprint', true);
      bot.setControlState('forward', true);
      setTimeout(() => {
        bot.setControlState('sprint', false);
        bot.setControlState('forward', false);
      }, 1000 + Math.random() * 2000);
      log('Sprinting forward!', 'action');
    },
    () => {
      bot.setControlState('forward', true);
      setTimeout(() => bot.setControlState('forward', false), 500 + Math.random() * 1500);
      log('Walking around...', 'action');
    },
    () => {
      // Look in random direction
      const yaw = Math.random() * Math.PI * 2 - Math.PI;
      const pitch = Math.random() * Math.PI - Math.PI / 2;
      bot.look(yaw, pitch, false);
      log('Looking around randomly', 'action');
    },
    () => {
      // Jump + move combo
      bot.setControlState('jump', true);
      bot.setControlState('forward', true);
      setTimeout(() => {
        bot.setControlState('jump', false);
        bot.setControlState('forward', false);
      }, 500);
      log('Jump-walking!', 'action');
    },
    () => {
      // Try to break a block below/nearby
      const blockBelow = bot.blockAt(bot.entity.position.offset(0, -1, 0));
      if (blockBelow && blockBelow.name !== 'air' && blockBelow.name !== 'bedrock') {
        bot.dig(blockBelow).then(() => {
          log(`Broke a ${blockBelow.name} block`, 'action');
        }).catch(() => {
          log('Attempted to break a block', 'action');
        });
      } else {
        // Fallback to jumping
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 300);
        log('Jumping (no block to break)', 'action');
      }
    },
    () => {
      // Strafe left/right
      const direction = Math.random() > 0.5 ? 'left' : 'right';
      bot.setControlState(direction, true);
      setTimeout(() => bot.setControlState(direction, false), 500 + Math.random() * 1000);
      log(`Strafing ${direction}`, 'action');
    },
    () => {
      // Sneak briefly
      bot.setControlState('sneak', true);
      setTimeout(() => bot.setControlState('sneak', false), 1000 + Math.random() * 2000);
      log('Sneaking around...', 'action');
    }
  ];
  
  const action = actions[Math.floor(Math.random() * actions.length)];
  action();
}

// ========== SMART CHAT ==========
function sendRandomChat() {
  if (!bot) return;
  
  const playerCount = getPlayerCount();
  
  if (playerCount === 0) {
    const message = getRandomMessage();
    bot.chat(message);
    log(`Sent: "${message}"`, 'chat');
  } else {
    log(`Skipping chat - ${playerCount} player(s) online`, 'info');
  }
}

// ========== BOT LIFECYCLE ==========
function clearIntervals() {
  if (actionInterval) {
    clearInterval(actionInterval);
    actionInterval = null;
  }
  if (chatInterval) {
    clearInterval(chatInterval);
    chatInterval = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function startBot() {
  if (!isRunning) return;
  
  clearIntervals();
  
  const username = getUniqueName();
  log(`Connecting to ${CONFIG.host}:${CONFIG.port} as "${username}"...`, 'info');
  
  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: username,
    version: CONFIG.version,
    hideErrors: false,
  });
  
  bot.on('login', () => {
    log(`Successfully logged in as ${bot.username}!`, 'success');
  });
  
  bot.on('spawn', () => {
    log('Bot spawned in world!', 'success');
    
    const playerCount = getPlayerCount();
    log(`Players online (excluding bot): ${playerCount}`, 'info');
    
    // Start anti-idle actions every 3-8 seconds
    actionInterval = setInterval(() => {
      performRandomAction();
    }, 3000 + Math.random() * 5000);
    
    // Start chat every 20-45 seconds (only when alone)
    chatInterval = setInterval(() => {
      sendRandomChat();
    }, 20000 + Math.random() * 25000);
  });
  
  bot.on('playerJoined', (player) => {
    if (player.username !== bot.username) {
      log(`Player joined: ${player.username} (now ${getPlayerCount()} online)`, 'info');
    }
  });
  
  bot.on('playerLeft', (player) => {
    if (player.username !== bot.username) {
      log(`Player left: ${player.username} (now ${getPlayerCount()} online)`, 'info');
    }
  });
  
  bot.on('kicked', (reason) => {
    log(`Bot was kicked: ${reason}`, 'error');
    clearIntervals();
    
    // Check if it's a ban
    const reasonStr = JSON.stringify(reason).toLowerCase();
    if (reasonStr.includes('ban')) {
      log('Detected BAN! Reconnecting with new username in 5 seconds...', 'warning');
      reconnectTimeout = setTimeout(() => {
        startBot();
      }, 5000);
    } else {
      log('Reconnecting in 10 seconds...', 'warning');
      reconnectTimeout = setTimeout(() => {
        startBot();
      }, 10000);
    }
  });
  
  bot.on('error', (err) => {
    log(`Connection error: ${err.message}`, 'error');
    clearIntervals();
    
    // Server offline - retry every 60 seconds
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      log('Server appears to be offline. Retrying in 60 seconds...', 'warning');
      reconnectTimeout = setTimeout(() => {
        startBot();
      }, 60000);
    } else {
      log('Reconnecting in 30 seconds...', 'warning');
      reconnectTimeout = setTimeout(() => {
        startBot();
      }, 30000);
    }
  });
  
  bot.on('end', (reason) => {
    log(`Disconnected: ${reason}`, 'warning');
    clearIntervals();
    
    if (isRunning) {
      log('Reconnecting in 10 seconds...', 'info');
      reconnectTimeout = setTimeout(() => {
        startBot();
      }, 10000);
    }
  });
  
  bot.on('message', (message) => {
    const msgStr = message.toString();
    if (msgStr && !msgStr.includes(bot.username)) {
      log(`[Server] ${msgStr}`, 'info');
    }
  });
}

// ========== MAIN ==========
function main() {
  console.log('');
  console.log('=====================================================');
  console.log('   MINECRAFT AFK BOT - Starting...');
  console.log('=====================================================');
  console.log(`Server: ${CONFIG.host}:${CONFIG.port}`);
  console.log(`Base Name: ${CONFIG.baseName}`);
  console.log('=====================================================');
  console.log('');
  
  startBot();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    log('Shutting down bot...', 'warning');
    isRunning = false;
    clearIntervals();
    if (bot) {
      bot.quit();
    }
    process.exit(0);
  });
}

main();
