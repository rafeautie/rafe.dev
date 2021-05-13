import * as Y from 'yjs';

const isMe = (ydoc: Y.Doc | undefined, clientID: number) => {
  return ydoc?.clientID === clientID;
};

export default isMe;
