import React from 'react';
import styles from './Mouse.module.css';
import { MouseType } from '../../interfaces';

const Mouse = ({ color, x = 0, y = 0 }: MouseType) => (
  <div
    className={styles.mouse}
    style={{
      background: color,
      top: y - 10,
      left: x - 10,
    }}
  />
);

export default Mouse;
