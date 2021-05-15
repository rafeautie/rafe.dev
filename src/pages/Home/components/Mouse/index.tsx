import React from 'react';
import { useSelector } from 'react-redux';
import styles from './Mouse.module.css';
import { selectRemoteMouseByID } from '../../state/HomeSelectors';
import useRelativeMouse from '../../../../utils/useRelativeMouse';

interface Props {
  id: number;
  hide: boolean;
}

const Mouse = ({ id, hide }: Props) => {
  const { mouse, color, window } = useSelector(selectRemoteMouseByID(id));
  const relativeMouse = useRelativeMouse(mouse, window);

  if (mouse == null || hide) {
    return null;
  }

  return (
    <div
      className={styles.mouse}
      style={{
        background: color,
        top: relativeMouse.y - 10,
        left: relativeMouse.x - 10,
      }}
    />
  );
};

export default Mouse;
