export interface GameData {
  events: Event[];
  gameTime: number;
  // Add other game data properties as needed
}

export interface Event {
  EventID: number;
  EventName: string;
  EventTime: number;
  // Add other event properties as needed
}