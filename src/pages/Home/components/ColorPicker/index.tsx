import React from 'react';
import { GithubPicker, ColorChangeHandler } from 'react-color';
import { useSelector } from 'react-redux';
import { ApplicationState } from '../../../../redux/store';
import { selectLocalMouse } from '../../state/HomeSelectors';
import styles from './ColorPicker.module.css';
import Colors from './Colors';

interface Props {
  onChange: ColorChangeHandler;
  onClick: () => void;
  active: boolean;
}

const ColorPicker = ({ onChange, onClick, active }: Props) => {
  const localMouseColor =
    useSelector((state: ApplicationState) => selectLocalMouse(state)?.color) ??
    '#fff';

  return (
    <div
      onClick={() => onClick()}
      className={styles.container}
      style={{ background: localMouseColor }}
    >
      {active && (
        <GithubPicker
          colors={Colors}
          className={styles.colorPicker}
          triangle="top-right"
          color={localMouseColor}
          onChange={onChange}
        />
      )}
    </div>
  );
};

export default ColorPicker;
