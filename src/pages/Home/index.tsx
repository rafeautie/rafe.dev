import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useSetRecoilState } from 'recoil';
import styles from './Home.module.css';
import ColorPicker from './components/ColorPicker';
import backgroundStyles from '../../styles/Background.module.css';
import RemoteMouseManager from '../../utils/RemoteMouse/RemoteMouseManager';
import RemoteMice from './components/Mice';
import selectedColorState from '../../state/selectedColor';

const Landing = () => {
  const [swatchActive, setSwatchActive] = useState(false);
  const setSelectedColor = useSetRecoilState(selectedColorState);

  const mouseStyle = !swatchActive ? styles.disableMouse : '';

  return (
    <div
      className={`${styles.container} ${mouseStyle} ${backgroundStyles.backgroundGradient}`}
    >
      <h1>rafe.dev</h1>
      <div className={styles.canvasContainer}>
        <Canvas
          frameloop="demand"
          camera={{ position: [0, 0, 5] }}
          onMouseMove={({ nativeEvent: { x, y } }) => {
            RemoteMouseManager.handleMouseMovement(x, y);
          }}
        >
          <ambientLight />
          <RemoteMice />
        </Canvas>
      </div>
      <ColorPicker
        active={swatchActive}
        onClick={() => setSwatchActive(!swatchActive)}
        onChange={(newColor) => {
          setSelectedColor(newColor.hex);
          RemoteMouseManager.setRemoteMouseColor(newColor.hex);
        }}
      />
    </div>
  );
};

export default Landing;
