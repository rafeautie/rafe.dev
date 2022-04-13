import React, { useState, useEffect } from 'react';
import { isNil } from 'lodash';
import pluralize from 'pluralize';
import { formatDistanceToNow } from 'date-fns';
import styles from './Garage.module.css';
import { GarageState, TotalGarageSpaces } from '../../../api/garage';

const Garage = () => {
  const [garageState, setGarageState] = useState<GarageState | null>(null);

  useEffect(() => {
    const fetchGarageState = async () => {
      const response = await fetch('/api/garage');
      const json = await response.json();
      setGarageState(json);
    };

    fetchGarageState();
  }, []);

  let text: string;
  let subtext: string = '';

  if (isNil(garageState)) {
    text = 'Loading...';
  } else if (isNil(garageState.carCount)) {
    text = 'Garage State Unavailable';
  } else {
    const spotsLeft = TotalGarageSpaces - garageState.carCount;
    text = `${spotsLeft} ${pluralize('spot', spotsLeft)} left`;
    subtext = formatDistanceToNow(garageState.lastUpdatedAt, {
      addSuffix: true,
    });
  }

  return (
    <div className={`${styles.container}`}>
      <h1>{text}</h1>
      {!isNil(subtext) && <p>{subtext}</p>}
    </div>
  );
};

export default Garage;
