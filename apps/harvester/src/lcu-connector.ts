import { execSync } from 'child_process';
import fetch from 'node-fetch';
import https from 'https';
import pino from 'pino';

const log = pino({ level: 'info' });

interface LCUCredentials {
  port: number;
  password: string;
  protocol: string;
}

// Create HTTPS agent that ignores self-signed certificates
const agent = new https.Agent({
  rejectUnauthorized: false
});

// Get LCU credentials from the running process
export function getLCUCredentials(): LCUCredentials | null {
  try {
    // Windows command to get League Client process info
    const command = 'wmic PROCESS WHERE "name=\'LeagueClientUx.exe\'" GET commandline /format:list';
    const stdout = execSync(command, { encoding: 'utf-8', windowsHide: true });
    
    // Parse port and password from command line
    const portMatch = stdout.match(/--app-port=(\d+)/);
    const authMatch = stdout.match(/--remoting-auth-token=([\w-]+)/);
    
    if (!portMatch || !authMatch) {
      return null;
    }
    
    return {
      port: parseInt(portMatch[1]),
      password: authMatch[1],
      protocol: 'https'
    };
  } catch (error) {
    // League client not running
    return null;
  }
}

// Create authenticated fetch for LCU API
export function createLCUFetch(credentials: LCUCredentials) {
  const auth = Buffer.from(`riot:${credentials.password}`).toString('base64');
  
  return async (endpoint: string) => {
    const url = `${credentials.protocol}://127.0.0.1:${credentials.port}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        },
        agent
      });
      
      if (response.status === 404) {
        return null; // Endpoint not available (e.g., not in champ select)
      }
      
      if (!response.ok) {
        throw new Error(`LCU request failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        return null; // Client not running
      }
      throw error;
    }
  };
}

// Singleton LCU connection
let lcuFetch: ReturnType<typeof createLCUFetch> | null = null;
let lastCredentials: LCUCredentials | null = null;

// Get or create LCU fetch function
export function getLCUFetch(): ReturnType<typeof createLCUFetch> | null {
  const credentials = getLCUCredentials();
  
  if (!credentials) {
    lcuFetch = null;
    lastCredentials = null;
    return null;
  }
  
  // Check if credentials changed (client restarted)
  if (!lastCredentials || 
      lastCredentials.port !== credentials.port || 
      lastCredentials.password !== credentials.password) {
    lcuFetch = createLCUFetch(credentials);
    lastCredentials = credentials;
    log.info(`Connected to LCU on port ${credentials.port}`);
  }
  
  return lcuFetch;
}