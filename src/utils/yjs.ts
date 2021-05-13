import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

export type ProviderType = Partial<ReturnType<typeof getProvider>>;

export const getProvider = () => {
  const ydoc = new Y.Doc();
  const provider = new WebrtcProvider(
    `rafe.dev-${import.meta.env.SNOWPACK_PUBLIC_HOME_WEBRTC_ROOM}`,
    ydoc,
  );
  if (!provider.connected) {
    provider.connect();
  }
  return { ydoc, provider };
};
