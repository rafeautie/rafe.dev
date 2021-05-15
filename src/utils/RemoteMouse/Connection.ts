import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

interface Options {
  room?: string;
}

class Connection {
  public doc: Y.Doc;

  public provider: WebrtcProvider;

  constructor(options: Options) {
    const doc = new Y.Doc();
    const provider = new WebrtcProvider(
      Connection.getRoomName(options.room),
      doc,
    );
    if (!provider.connected) {
      provider.connect();
    }
    this.doc = doc;
    this.provider = provider;
  }

  private static getRoomName(room: string = '') {
    return `rafe.dev-${
      import.meta.env.SNOWPACK_PUBLIC_HOME_WEBRTC_ROOM
    }${room}`;
  }

  public disconnect() {
    this.provider.destroy();
    this.doc.destroy();
  }
}

export default Connection;
