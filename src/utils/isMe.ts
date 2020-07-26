import { ydoc } from './yjs';

const isMe = (clientID: number) => ydoc.clientID === clientID;

export default isMe;
