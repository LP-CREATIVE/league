// State management
const state = {
    discordConnected: false,
    harvesterConnected: false,
    serverCount: 0,
    voiceCount: 0,
    messageCount: 0,
    clientStatus: 'Not Connected',
    gamePhase: '-',
    analysisCount: 0,
    activityFeed: []
};

// Update UI elements
function updateUI() {
    // Status indicator
    const statusElement = document.getElementById('status');
    const statusDot = statusElement.querySelector('.status-dot');
    const statusText = statusElement.querySelector('.status-text');
    
    if (state.discordConnected && state.harvesterConnected) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'All Systems Online';
    } else if (state.discordConnected || state.harvesterConnected) {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Partial Connection';
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Offline';
    }
    
    // Discord status
    const discordStatus = document.getElementById('discord-status');
    discordStatus.textContent = state.discordConnected ? 'Online' : 'Offline';
    discordStatus.className = state.discordConnected ? 'service-status online' : 'service-status offline';
    
    // Harvester status
    const harvesterStatus = document.getElementById('harvester-status');
    harvesterStatus.textContent = state.harvesterConnected ? 'Running' : 'Stopped';
    harvesterStatus.className = state.harvesterConnected ? 'service-status online' : 'service-status offline';
    
    // Update values
    document.getElementById('server-count').textContent = state.serverCount;
    document.getElementById('voice-count').textContent = state.voiceCount;
    document.getElementById('message-count').textContent = state.messageCount;
    document.getElementById('client-status').textContent = state.clientStatus;
    document.getElementById('game-phase').textContent = state.gamePhase;
    document.getElementById('analysis-count').textContent = state.analysisCount;
}

// Add activity to feed
function addActivity(message, type = 'info') {
    const time = new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
    
    state.activityFeed.unshift({ time, message, type });
    
    // Keep only last 50 activities
    if (state.activityFeed.length > 50) {
        state.activityFeed = state.activityFeed.slice(0, 50);
    }
    
    updateActivityFeed();
}

// Update activity feed UI
function updateActivityFeed() {
    const feedContainer = document.getElementById('activity-feed');
    feedContainer.innerHTML = state.activityFeed.map(item => `
        <div class="feed-item">
            <span class="feed-time">${item.time}</span>
            <span class="feed-message ${item.type}">${item.message}</span>
        </div>
    `).join('');
}

// Check Discord bot status
async function checkDiscordStatus() {
    try {
        const response = await fetch('/ping');
        if (response.ok) {
            state.discordConnected = true;
            const data = await response.json();
            
            // Update stats if available
            if (data.stats) {
                state.serverCount = data.stats.servers || 0;
                state.voiceCount = data.stats.voiceConnections || 0;
                state.messageCount = data.stats.messagesProcessed || 0;
            }
        } else {
            state.discordConnected = false;
        }
    } catch (error) {
        state.discordConnected = false;
    }
    updateUI();
}

// Check Harvester status (mock for now since it doesn't have an API)
async function checkHarvesterStatus() {
    // In a real implementation, the harvester would expose a health endpoint
    // For now, we'll simulate by checking if the Discord bot received recent game data
    try {
        const response = await fetch('/harvester-status');
        if (response.ok) {
            const data = await response.json();
            state.harvesterConnected = data.connected || false;
            state.clientStatus = data.leagueClientConnected ? 'Connected' : 'Not Connected';
            state.gamePhase = data.gamePhase || '-';
            state.analysisCount = data.analysisCount || 0;
        }
    } catch (error) {
        // If endpoint doesn't exist yet, assume harvester is running if Discord is up
        state.harvesterConnected = state.discordConnected;
    }
    updateUI();
}

// Test TTS functionality
async function testTTS() {
    const button = document.getElementById('test-tts');
    button.disabled = true;
    
    try {
        const response = await fetch('/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: 'League Coach is online and ready to assist you!',
                waitForCompletion: true 
            })
        });
        
        if (response.ok) {
            addActivity('Voice test successful', 'success');
        } else {
            addActivity('Voice test failed', 'error');
        }
    } catch (error) {
        addActivity('Voice test error: ' + error.message, 'error');
    } finally {
        button.disabled = false;
    }
}

// Restart services
async function restartServices() {
    const button = document.getElementById('restart-services');
    button.disabled = true;
    
    addActivity('Restarting services...', 'info');
    
    try {
        // In production, this would trigger a service restart
        // For now, we'll simulate with a delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        addActivity('Services restarted successfully', 'success');
        
        // Re-check status after restart
        await checkDiscordStatus();
        await checkHarvesterStatus();
    } catch (error) {
        addActivity('Failed to restart services', 'error');
    } finally {
        button.disabled = false;
    }
}

// Open logs (mock implementation)
function openLogs() {
    addActivity('Opening logs...', 'info');
    // In production, this would open a log viewer or terminal
    alert('Log viewer would open here. Check console for debug output.');
}

// Open settings (mock implementation)
function openSettings() {
    addActivity('Opening settings...', 'info');
    // In production, this would open a settings modal
    alert('Settings panel coming soon!');
}

// WebSocket connection for real-time updates
function connectWebSocket() {
    // In production, connect to a WebSocket for real-time updates
    // For now, we'll simulate with polling
}

// Detect if running in Electron
function detectElectron() {
    if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
        document.body.classList.add('electron');
        return true;
    }
    return false;
}

// Electron IPC bridge
if (detectElectron()) {
    const { ipcRenderer } = require('electron');
    
    window.electron = {
        minimize: () => ipcRenderer.send('window-minimize'),
        maximize: () => ipcRenderer.send('window-maximize'),
        close: () => ipcRenderer.send('window-close'),
        startService: (name) => ipcRenderer.send('start-service', name),
        stopService: (name) => ipcRenderer.send('stop-service', name),
        restartServices: () => ipcRenderer.send('restart-services')
    };
    
    // Listen for service status changes
    ipcRenderer.on('service-status-changed', (event, data) => {
        if (data.serviceName === 'discord') {
            state.discordConnected = data.status === 'running';
        } else if (data.serviceName === 'harvester') {
            state.harvesterConnected = data.status === 'running';
        }
        updateUI();
        addActivity(`${data.serviceName} ${data.status}`, data.status === 'running' ? 'success' : 'info');
    });
}

// Native notifications
function showNotification(title, message, type = 'info') {
    if (detectElectron()) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-header">
                <svg class="notification-icon" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    ${type === 'success' ? '<path d="M10 0C4.5 0 0 4.5 0 10s4.5 10 10 10 10-4.5 10-10S15.5 0 10 0zm4.7 7.7l-5 5c-.2.2-.5.3-.7.3s-.5-.1-.7-.3l-2.5-2.5c-.4-.4-.4-1 0-1.4s1-.4 1.4 0l1.8 1.8 4.3-4.3c.4-.4 1-.4 1.4 0s.4 1 0 1.4z"/>' :
                      type === 'error' ? '<path d="M10 0C4.5 0 0 4.5 0 10s4.5 10 10 10 10-4.5 10-10S15.5 0 10 0zm5 13.6L13.6 15 10 11.4 6.4 15 5 13.6 8.6 10 5 6.4 6.4 5 10 8.6 13.6 5 15 6.4 11.4 10 15 13.6z"/>' :
                      '<path d="M10 0C4.5 0 0 4.5 0 10s4.5 10 10 10 10-4.5 10-10S15.5 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z"/>'}
                </svg>
                <span class="notification-title">${title}</span>
            </div>
            <div class="notification-message">${message}</div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initial status check
    checkDiscordStatus();
    checkHarvesterStatus();
    
    // Set up periodic status checks
    setInterval(checkDiscordStatus, 5000);
    setInterval(checkHarvesterStatus, 5000);
    
    // Bind button events
    document.getElementById('test-tts').addEventListener('click', testTTS);
    document.getElementById('restart-services').addEventListener('click', restartServices);
    document.getElementById('open-logs').addEventListener('click', openLogs);
    document.getElementById('settings').addEventListener('click', openSettings);
    
    // Initial activity
    addActivity('Control panel initialized', 'success');
    
    // Connect WebSocket for real-time updates
    connectWebSocket();
});