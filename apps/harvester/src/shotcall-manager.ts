// Enhanced harvester logic for shotcalling
import { GameData, Event } from './types'; // Assuming you have these types

interface ObjectiveTimers {
  dragon: number;
  baron: number;
  herald: number;
  elderDragon: number;
}

class ShotcallManager {
  private lastEventId: number = -1;
  private lastMinuteUpdate: number = 0;
  private objectiveTimers: ObjectiveTimers = {
    dragon: 300, // 5 min first spawn
    baron: 1200, // 20 min spawn
    herald: 480, // 8 min spawn  
    elderDragon: -1 // After 4 dragons
  };
  private announcedObjectives = new Set<string>();
  private dragonsTaken = 0;

  async processGameState(gameData: GameData, sendToDiscord: (message: string) => Promise<void>) {
    const currentTime = gameData.gameData.gameTime;
    
    // 1. Process new events (kills, towers, objectives)
    await this.processEvents(gameData.events.Events, currentTime, sendToDiscord);
    
    // 2. Check for upcoming objectives (1 minute warnings)
    await this.checkUpcomingObjectives(currentTime, sendToDiscord);
    
    // 3. Regular minute updates
    await this.regularUpdate(gameData, currentTime, sendToDiscord);
  }

  private async processEvents(events: Event[], currentTime: number, sendToDiscord: (message: string) => Promise<void>) {
    // Process only new events
    const newEvents = events.filter(e => e.EventID > this.lastEventId);
    
    for (const event of newEvents) {
      this.lastEventId = event.EventID;
      
      switch (event.EventName) {
        case 'ChampionKill':
          await this.handleChampionKill(event, currentTime, sendToDiscord);
          break;
          
        case 'TurretKilled':
          await this.handleTurretKill(event, currentTime, sendToDiscord);
          break;
          
        case 'DragonKill':
          await this.handleDragonKill(event, currentTime, sendToDiscord);
          break;
          
        case 'BaronKill':
          await this.handleBaronKill(event, currentTime, sendToDiscord);
          break;
          
        case 'HeraldKill':
          await this.handleHeraldKill(event, currentTime, sendToDiscord);
          break;
          
        case 'InhibKilled':
          await this.handleInhibitorKill(event, currentTime, sendToDiscord);
          break;
      }
    }
  }

  private async handleTurretKill(event: any, currentTime: number, sendToDiscord: (message: string) => Promise<void>) {
    const isOurKill = event.KillerName === 'ROWDY' || event.Assisters?.includes('ROWDY');
    const turretType = this.getTurretType(event.TurretKilled);
    
    if (isOurKill) {
      await sendToDiscord(`TURRET DOWN! We got their ${turretType}. Push for more or reset for items. Next objective in ${this.getNextObjectiveTime(currentTime)}.`);
    } else {
      await sendToDiscord(`We lost our ${turretType}! Careful of dives. Ward up and farm safe. ${this.getDefensivePlay(currentTime)}`);
    }
  }

  private async handleDragonKill(event: any, currentTime: number, sendToDiscord: (message: string) => Promise<void>) {
    this.dragonsTaken++;
    this.objectiveTimers.dragon = currentTime + 300; // 5 min respawn
    
    const isOurKill = event.KillerName === 'ROWDY' || event.Assisters?.includes('ROWDY');
    
    if (isOurKill) {
      await sendToDiscord(`DRAGON SECURED! ${this.dragonsTaken}/4 dragons. Next dragon at ${this.formatTime(this.objectiveTimers.dragon)}. ${this.getPostDragonPlay(currentTime)}`);
    } else {
      await sendToDiscord(`Enemy took dragon! They have ${this.dragonsTaken} dragons. Contest next one at ${this.formatTime(this.objectiveTimers.dragon)}.`);
    }
    
    // Check for soul point
    if (this.dragonsTaken === 3) {
      await sendToDiscord(`SOUL POINT! Next dragon is CRITICAL. Set up vision 1 minute early!`);
    }
  }

  private async checkUpcomingObjectives(currentTime: number, sendToDiscord: (message: string) => Promise<void>) {
    // Dragon warning
    if (this.objectiveTimers.dragon > 0 && 
        this.objectiveTimers.dragon - currentTime <= 60 && 
        this.objectiveTimers.dragon - currentTime > 55 &&
        !this.announcedObjectives.has(`dragon-${this.objectiveTimers.dragon}`)) {
      
      this.announcedObjectives.add(`dragon-${this.objectiveTimers.dragon}`);
      await sendToDiscord(`DRAGON spawning in 1 MINUTE! ${this.getDragonSetup(currentTime)}. Start moving at ${this.formatTime(currentTime + 30)}.`);
    }
    
    // Baron warning
    if (currentTime >= 1140 && // 19 minutes
        this.objectiveTimers.baron - currentTime <= 60 && 
        this.objectiveTimers.baron - currentTime > 55 &&
        !this.announcedObjectives.has(`baron-${this.objectiveTimers.baron}`)) {
      
      this.announcedObjectives.add(`baron-${this.objectiveTimers.baron}`);
      await sendToDiscord(`BARON spawning in 1 MINUTE! ${this.getBaronSetup(currentTime)}. Vision control is KEY!`);
    }
    
    // Herald warning (before 20 min)
    if (currentTime < 1200 &&
        this.objectiveTimers.herald > 0 &&
        this.objectiveTimers.herald - currentTime <= 60 && 
        this.objectiveTimers.herald - currentTime > 55 &&
        !this.announcedObjectives.has(`herald-${this.objectiveTimers.herald}`)) {
      
      this.announcedObjectives.add(`herald-${this.objectiveTimers.herald}`);
      await sendToDiscord(`HERALD spawning in 1 MINUTE! ${this.getHeraldSetup(currentTime)}. Great for first turret gold!`);
    }
  }

  private async regularUpdate(gameData: GameData, currentTime: number, sendToDiscord: (message: string) => Promise<void>) {
    const currentMinute = Math.floor(currentTime / 60);
    
    if (currentMinute > this.lastMinuteUpdate) {
      this.lastMinuteUpdate = currentMinute;
      
      // Get game state analysis
      const analysis = this.analyzeGameState(gameData);
      
      await sendToDiscord(`[${this.formatTime(currentTime)}] UPDATE: ${analysis}. Next objective: ${this.getNextObjectivePlan(currentTime)}.`);
    }
  }

  private analyzeGameState(gameData: GameData): string {
    const player = gameData.activePlayer;
    const cs = gameData.allPlayers[0].scores.creepScore;
    const kda = `${gameData.allPlayers[0].scores.kills}/${gameData.allPlayers[0].scores.deaths}/${gameData.allPlayers[0].scores.assists}`;
    
    // Basic analysis - you can expand this
    if (player.currentGold > 1500) {
      return `You have ${Math.floor(player.currentGold)}g - RECALL for items`;
    } else if (cs < gameData.gameData.gameTime / 60 * 6) {
      return `CS is low (${cs}). Focus on farming`;
    } else {
      return `Looking good. KDA: ${kda}, CS: ${cs}`;
    }
  }

  private getDragonSetup(currentTime: number): string {
    if (currentTime < 900) { // Before 15 min
      return "Push out bot lane, get vision control";
    } else {
      return "Clear bot side vision, push out all lanes";
    }
  }

  private getBaronSetup(currentTime: number): string {
    return "FULL TEAM needed. Clear top side wards, set up in pixel brush";
  }

  private getHeraldSetup(currentTime: number): string {
    return "Solo or duo this. Use for first turret or mid priority";
  }

  private getNextObjectivePlan(currentTime: number): string {
    const objectives = [];
    
    if (this.objectiveTimers.dragon > currentTime) {
      objectives.push({ name: 'Dragon', time: this.objectiveTimers.dragon });
    }
    if (this.objectiveTimers.baron > currentTime && currentTime > 1140) {
      objectives.push({ name: 'Baron', time: this.objectiveTimers.baron });
    }
    if (this.objectiveTimers.herald > currentTime && currentTime < 1200) {
      objectives.push({ name: 'Herald', time: this.objectiveTimers.herald });
    }
    
    if (objectives.length === 0) {
      return "Push for towers and vision";
    }
    
    const next = objectives.sort((a, b) => a.time - b.time)[0];
    return `${next.name} at ${this.formatTime(next.time)}`;
  }

  private getTurretType(turretId: string): string {
    if (turretId.includes('L1')) return 'Outer Turret';
    if (turretId.includes('L2')) return 'Inner Turret';
    if (turretId.includes('L3')) return 'Inhibitor Turret';
    if (turretId.includes('C_')) return 'Nexus Turret';
    return 'Turret';
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private getNextObjectiveTime(currentTime: number): string {
    const times = [
      this.objectiveTimers.dragon,
      this.objectiveTimers.baron,
      this.objectiveTimers.herald
    ].filter(t => t > currentTime);
    
    if (times.length === 0) return "No objectives up";
    
    const nextTime = Math.min(...times);
    const timeUntil = nextTime - currentTime;
    return `${Math.floor(timeUntil / 60)}:${Math.floor(timeUntil % 60).toString().padStart(2, '0')}`;
  }

  private getPostDragonPlay(currentTime: number): string {
    if (currentTime < 900) {
      return "Push for bot turret or rotate mid";
    } else {
      return "Reset and prep for next objective";
    }
  }

  private getDefensivePlay(currentTime: number): string {
    return "Give up contested farm, wait for them to overextend";
  }

  private async handleChampionKill(event: any, currentTime: number, sendToDiscord: (message: string) => Promise<void>) {
    const isOurKill = event.KillerName === 'ROWDY';
    const isOurDeath = event.VictimName === 'ROWDY';
    
    if (isOurKill) {
      await sendToDiscord(`KILL! You got ${event.VictimName}. ${this.getPostKillPlay(currentTime, event)}`);
    } else if (isOurDeath) {
      await sendToDiscord(`You died to ${event.KillerName}. Play safe and farm up. ${this.getDeathTimer(event)}`);
    }
  }

  private getPostKillPlay(currentTime: number, event: any): string {
    if (currentTime < 600) {
      return "Shove wave and recall or roam";
    } else if (this.isObjectiveUp(currentTime)) {
      return "Move to objective while they're down!";
    } else {
      return "Push for towers or deep vision";
    }
  }

  private getDeathTimer(event: any): string {
    // Rough death timer calculation
    const level = event.VictimLevel || 11;
    const deathTimer = 10 + (level * 2.5);
    return `Respawn in ~${Math.floor(deathTimer)}s`;
  }

  private isObjectiveUp(currentTime: number): boolean {
    return (this.objectiveTimers.dragon > 0 && this.objectiveTimers.dragon <= currentTime) ||
           (this.objectiveTimers.baron > 0 && this.objectiveTimers.baron <= currentTime) ||
           (this.objectiveTimers.herald > 0 && this.objectiveTimers.herald <= currentTime && currentTime < 1200);
  }

  private async handleBaronKill(event: any, currentTime: number, sendToDiscord: (message: string) => Promise<void>) {
    this.objectiveTimers.baron = currentTime + 360; // 6 min respawn
    const isOurs = event.KillerName === 'ROWDY' || event.Assisters?.includes('ROWDY');
    
    if (isOurs) {
      await sendToDiscord(`BARON SECURED! HUGE! Push all lanes, force fights with buff. End the game!`);
    } else {
      await sendToDiscord(`Enemy has Baron! Clear waves, don't fight! Wait out the buff.`);
    }
  }

  private async handleHeraldKill(event: any, currentTime: number, sendToDiscord: (message: string) => Promise<void>) {
    const isOurs = event.KillerName === 'ROWDY' || event.Assisters?.includes('ROWDY');
    
    if (isOurs) {
      await sendToDiscord(`Herald taken! Use it for first turret gold or to open up mid!`);
    } else {
      await sendToDiscord(`Enemy has Herald. Watch for their push, defend turrets!`);
    }
  }

  private async handleInhibitorKill(event: any, currentTime: number, sendToDiscord: (message: string) => Promise<void>) {
    const isOurs = event.KillerName === 'ROWDY' || event.Assisters?.includes('ROWDY');
    
    if (isOurs) {
      await sendToDiscord(`INHIBITOR DOWN! Get Baron/Elder or push for END!`);
    } else {
      await sendToDiscord(`We lost an inhibitor! Clear super minions, scale up. Don't panic!`);
    }
  }
}

// Export for use in your main harvester loop
export default ShotcallManager;