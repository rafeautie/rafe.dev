import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import styles from './Home.module.css';
import ColorPicker from './components/ColorPicker';
import backgroundStyles from '../../styles/Background.module.css';
import RemoteMouseManager from '../../utils/RemoteMouse/RemoteMouseManager';
import RemoteMice from './components/Mice';
import useActions from '../../utils/useActions';
import { HomeActions } from './state/HomeActions';
import { Params } from './typings';

const Landing = () => {
  const BoundHomeActions = useActions(HomeActions, []);
  const [swatchActive, setSwatchActive] = useState(false);
  const { room } = useParams<Params>();

  useEffect(() => {
    return RemoteMouseManager.connect({
      room,
      listeners: {
        onAdd: (id, mouse) => BoundHomeActions.createMouse({ id, mouse }),
        onUpdate: (id, mouse) => BoundHomeActions.updateMouse({ id, mouse }),
        onRemove: (id) => BoundHomeActions.deleteMouse({ id }),
      },
    });
  }, [BoundHomeActions]);

  const mouseStyle = !swatchActive ? styles.disableMouse : '';

  return (
    <div
      className={`${styles.container} ${mouseStyle} ${backgroundStyles.backgroundGradient}`}
    >
      <h1>rafe.dev</h1>
      <ColorPicker
        active={swatchActive}
        onClick={() => setSwatchActive(!swatchActive)}
        onChange={(newColor) => {
          BoundHomeActions.updateMouse({
            id: 0,
            mouse: { color: newColor.hex },
          });
          RemoteMouseManager.setRemoteMouseColor(newColor.hex);
        }}
      />
      <RemoteMice hideSelf={swatchActive} />
    </div>
  );
};

export default Landing;
