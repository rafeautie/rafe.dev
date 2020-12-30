import React from 'react';
import {
  GithubPicker,
  ColorChangeHandler,
  ColorResult,
} from 'react-color';
import styles from './ColorPicker.module.css';
import Colors from './Colors';

interface Props {
  color: ColorResult;
  onChange: ColorChangeHandler;
  onClick: () => void;
  active: boolean;
}

const ColorPicker = ({ color, onChange, onClick, active }: Props) => {
  return (
    <div
      onClick={() => onClick()}
      className={styles.container}
      style={{ background: color.hex }}
    >
      {active && (
        <GithubPicker
          colors={Colors}
          className={styles.colorPicker}
          triangle="top-right"
          color={color.hex}
          onChange={onChange}
        />
      )}
    </div>
  );
};

export default ColorPicker;
