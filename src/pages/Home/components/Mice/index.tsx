import React from 'react';
import { useSelector } from 'react-redux';
import { selectAllRemoteMice } from '../../state/HomeSelectors';
import Mouse from '../Mouse';

interface Props {
  hideSelf: boolean;
}

const Mice = ({ hideSelf }: Props) => {
  const allMice = useSelector(selectAllRemoteMice);

  return (
    <>
      {allMice.map((id) => (
        <Mouse hide={hideSelf && id === 0} id={id} key={id} />
      ))}
    </>
  );
};

export default Mice;
