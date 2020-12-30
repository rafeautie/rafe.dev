import React from 'react';
import { createPortal } from 'react-dom';
import getRootElement from '../utils/getRootElement';
import styles from './Background.module.css';

const Background = () => {
  return createPortal(
    <div className={styles.background} />,
    getRootElement(),
  );
};

export default Background;
