import React from 'react';
import styles from './Mouse.module.css';
import { MouseType } from '../../interfaces';

interface Props extends MouseType {}

const Mouse = ({ color, x, y }: Props) => (
  <div
    className={styles.mouse}
    style={{
      background: color,
      top: y,
      left: x,
    }}
  />
);

export default Mouse;
