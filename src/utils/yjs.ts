import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

export const ydoc = new Y.Doc();
export const provider = new WebrtcProvider(
  `rafe.dev-${process.env.REACT_APP_HOME_WEBRTC_ROOM}`,
  ydoc,
);
