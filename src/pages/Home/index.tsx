import React, { useEffect, useState, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import styles from './Home.module.css';
import ColorPicker from './components/ColorPicker';
import { useColorState } from './state/atoms';
import { MouseType } from './interfaces';
import RemoteMouse from './components/RemoteMouse';
import { calculateRelativeMouse } from '../../utils/mouse';
import { getProvider, ProviderType } from '../../utils/yjs';
import isMe from '../../utils/isMe';

const Home = () => {
  const history = useHistory();
  const [{ provider, ydoc }, setProvider] = useState<ProviderType>(
    {},
  );
  const [swatchActive, setSwatchActive] = useState(false);
  const [color, setColor] = useColorState();
  const [mice, setMice] = useState<Array<MouseType>>([]);
  const [myMouse, setMyMouse] = useState<Pick<MouseType, 'x' | 'y'>>({
    x: -100,
    y: -100,
  });

  useEffect(() => {
    provider?.awareness.setLocalStateField('color', color.hex);
  }, [color, provider]);

  useEffect(() => {
    if (!provider) {
      setProvider(getProvider());
    }

    provider?.awareness?.on('change', () => {
      const newMice: Array<MouseType> = [];

      provider?.awareness.getStates().forEach((state, clientID) => {
        newMice.push({
          clientID,
          color: state.color,
          ...calculateRelativeMouse(state.mouse, state.window),
        });
      });

      setMice(newMice);
    });

    const setWindowLocalState = () => {
      provider?.awareness.setLocalStateField('window', {
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.onresize = setWindowLocalState;

    setWindowLocalState();

    return () => {
      provider?.destroy();
      ydoc?.destroy();
    };
  }, [provider]);

  const onMouseMove = useCallback(
    (e) => {
      const pos = {
        x: e.pageX,
        y: e.pageY,
      };
      provider?.awareness.setLocalStateField('mouse', pos);
      setMyMouse(pos);
    },
    [provider],
  );

  const mouseStyle = !swatchActive ? styles.disableMouse : '';

  return (
    <div
      className={`${styles.container} ${mouseStyle}`}
      onMouseMove={onMouseMove}
    >
      <h1>rafe.dev</h1>
      <ColorPicker
        color={color}
        active={swatchActive}
        onClick={() => setSwatchActive(!swatchActive)}
        onChange={(newColor) => setColor(newColor)}
      />
      {!swatchActive && (
        <RemoteMouse {...myMouse} color={color.hex} clientID={0} />
      )}
      {mice.map((mouse) =>
        isMe(ydoc, mouse.clientID) ? null : (
          <RemoteMouse {...mouse} key={mouse.clientID} />
        ),
      )}
    </div>
  );
};

export default Home;
