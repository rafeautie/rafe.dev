export interface MouseType {
  x: number;
  y: number;
}

export interface WindowType {
  width: number;
  height: number;
}

export interface RemoteMouseState {
  color: string;
  mouse: Pick<MouseType, 'x' | 'y'>;
  window: WindowType;
}

export interface RemoteChanges {
  added: Array<number>;
  updated: Array<number>;
  removed: Array<number>;
}

export interface WebRTCRoom {
  awareness: {
    states: Map<number, RemoteMouseState>;
  };
}

export interface Params {
  room: string;
}
