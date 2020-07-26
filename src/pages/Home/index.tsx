import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';

import styles from './Home.module.css';
import ColorPicker from './components/ColorPicker';
import { useColorState } from './state/atoms';
import { MouseType } from './interfaces';
import RemoteMouse from './components/RemoteMouse';
import calculateMouse from '../../utils/calculateMouse';
import { provider } from '../../utils/yjs';
import isMe from '../../utils/isMe';

const Home = () => {
  const [color, setColor] = useColorState();
  const [mice, setMice] = useState<Array<MouseType>>([]);

  useEffect(() => {
    provider.awareness.setLocalStateField('color', color.hex);
  }, [color]);

  useEffect(() => {
    const { awareness } = provider;

    awareness.on('change', () => {
      const newMice: Array<MouseType> = [];

      awareness.getStates().forEach((state, clientID) => {
        newMice.push({
          clientID,
          color: state.color,
          ...calculateMouse(state.mouse, state.window),
        });
      });

      setMice(newMice);
    });

    const setWindowLocalState = () => {
      provider.awareness.setLocalStateField('window', {
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.onresize = setWindowLocalState;

    setWindowLocalState();
  }, []);

  const onMouseMove = useCallback((e) => {
    provider.awareness.setLocalStateField('mouse', {
      x: e.pageX,
      y: e.pageY,
    });
  }, []);

  return (
    <div className={styles.container} onMouseMove={onMouseMove}>
      <h1>rafe.dev</h1>
      <ColorPicker
        color={color}
        onChange={(newColor) => setColor(newColor)}
      />
      {mice.map((mouse) =>
        isMe(mouse.clientID) ? null : (
          <RemoteMouse {...mouse} key={mouse.clientID} />
        ),
      )}
    </div>
  );
};

export default Home;
