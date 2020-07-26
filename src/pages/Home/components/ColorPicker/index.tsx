import React, { useState } from 'react';
import styles from './ColorPicker.module.css';
import {
  GithubPicker,
  ColorChangeHandler,
  ColorResult,
} from 'react-color';

interface Props {
  color: ColorResult;
  onChange: ColorChangeHandler;
}

const ColorPicker = ({ color, onChange }: Props) => {
  const [colorPicker, toggleColorPicker] = useState(false);
  return (
    <div
      onClick={() => toggleColorPicker(!colorPicker)}
      className={styles.container}
      style={{ background: color.hex }}
    >
      {colorPicker && (
        <GithubPicker
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
