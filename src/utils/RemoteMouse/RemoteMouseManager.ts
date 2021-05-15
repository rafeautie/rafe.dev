import {
  RemoteChanges,
  RemoteMouseState,
  WebRTCRoom,
} from '../../pages/Home/typings';
import Connection from './Connection';

interface Options {
  listeners: {
    onAdd: (id: number, state: RemoteMouseState) => void;
    onUpdate: (id: number, state: Partial<RemoteMouseState>) => void;
    onRemove: (id: number) => void;
  };
  room?: string;
}

const INITIAL_REMOTE_STATE = {
  color: '#FFF',
  window: { width: window.innerWidth, height: window.innerHeight },
  mouse: { x: -100, y: -100 },
};

class RemoteMouseManager {
  private connection?: Connection;

  private listeners?: Options['listeners'];

  private validateSetup() {
    const errors = [];

    if (this.connection == null) {
      errors.push('\tRemote Mouse connection missing!');
    }

    if (this.listeners == null) {
      errors.push(
        '\tRequired event listeners not set! Please set the required event listeners.',
      );
    }

    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
  }

  public isLocalMouse(id: number) {
    // Return true if no connect to hide all mice until connection established.
    return !this.connection || id === this.connection?.doc.clientID;
  }

  private initializeLocalMouse() {
    this.listeners?.onAdd(0, INITIAL_REMOTE_STATE);
    this.connection?.provider.awareness.setLocalStateField(
      'color',
      INITIAL_REMOTE_STATE.color,
    );
    this.connection?.provider.awareness.setLocalStateField(
      'mouse',
      INITIAL_REMOTE_STATE.mouse,
    );
    this.connection?.provider.awareness.setLocalStateField(
      'window',
      INITIAL_REMOTE_STATE.window,
    );
  }

  private subscribeToRemoteMice() {
    this.validateSetup();

    if (this.listeners == null) {
      throw new Error('Listeners not set!');
    }

    const { onAdd, onUpdate, onRemove } = this.listeners;

    this.connection?.provider.awareness.on(
      'change',
      (changes: RemoteChanges, room: WebRTCRoom | string) => {
        if (typeof room === 'string') {
          return;
        }

        const { states } = room.awareness;

        changes.added.forEach((id) => onAdd(id, states.get(id)!));
        changes.updated.forEach((id) => onUpdate(id, states.get(id)!));
        changes.removed.forEach((id) => onRemove(id));
      },
    );
  }

  private subscribeToLocalMouseMovement(): () => void {
    this.validateSetup();

    const handleMouseMove = ({ clientX, clientY }: MouseEvent) => {
      const mousePosition = {
        x: clientX,
        y: clientY,
      };

      this.listeners?.onUpdate(0, { mouse: mousePosition });
      this.connection?.provider.awareness.setLocalStateField(
        'mouse',
        mousePosition,
      );
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => window.removeEventListener('mousemove', handleMouseMove);
  }

  private subscribeToLocalWindowResize() {
    this.validateSetup();

    const handleWindowResize = () => {
      const windowDimensions = {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      this.listeners?.onUpdate(0, { window: windowDimensions });
      this.connection?.provider.awareness.setLocalStateField(
        'window',
        windowDimensions,
      );
    };

    window.addEventListener('resize', handleWindowResize);

    return () => window.removeEventListener('resize', handleWindowResize);
  }

  public setRemoteMouseColor(color: string) {
    this.validateSetup();
    this.connection?.provider.awareness.setLocalStateField('color', color);
  }

  public connect(options: Options) {
    this.listeners = options.listeners;
    this.connection = new Connection(options);

    this.initializeLocalMouse();
    this.subscribeToRemoteMice();
    const cleanupMouseListener = this.subscribeToLocalMouseMovement();
    const cleanupWindowResizeListener = this.subscribeToLocalWindowResize();

    return () => {
      cleanupMouseListener();
      cleanupWindowResizeListener();
      this.connection?.disconnect();
    };
  }
}

const RemoteMouseManagerInstance = new RemoteMouseManager();

// @ts-ignore - Missing global type.
window.RemoteMouseManagerInstance = RemoteMouseManagerInstance;

export default RemoteMouseManagerInstance;
