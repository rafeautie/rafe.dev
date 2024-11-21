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

export const getYearsSince = (date: string) => {
  const inputDate = DateTime.fromFormat(date, 'dd-MM-yyyy'); // Parse the input date
  if (!inputDate.isValid) {
    return 0;
  }
  const currentDate = DateTime.now();
  const yearsSince = Math.round(currentDate.diff(inputDate, 'years').years);
  return yearsSince;
};
