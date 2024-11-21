import { DateTime, Duration } from 'luxon';

export const dateTimeFrom = (date: string = '') => {
  return DateTime.fromISO(date, { zone: 'utc' })
    .startOf('day')
    .setZone('local');
};

export const secondsToHours = (seconds: number | string | undefined) => {
  return Duration.fromObject({ seconds: Number(seconds) })
    .shiftTo('hours')
    .toHuman({ maximumFractionDigits: 1 });
};
