import React from 'react';
import { GithubPicker, ColorChangeHandler } from 'react-color';
import { useRecoilValue } from 'recoil';
import selectedColorState from '../../../../state/selectedColor';
import styles from './ColorPicker.module.css';
import Colors from './Colors';

interface Props {
  onChange: ColorChangeHandler;
  onClick: () => void;
  active: boolean;
}

const ColorPicker = ({ onChange, onClick, active }: Props) => {
  const selectedColor = useRecoilValue(selectedColorState);

  return (
    <div
      onClick={() => onClick()}
      className={styles.container}
      style={{ background: selectedColor }}
    >
      {active && (
        <GithubPicker
          colors={Colors}
          className={styles.colorPicker}
          triangle="top-right"
          color={selectedColor}
          onChange={onChange}
        />
      )}
    </div>
  );
};

export default ColorPicker;
