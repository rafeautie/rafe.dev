import { DateTime } from 'luxon';

export const dateTimeFrom = (date: string = '') => {
  return DateTime.fromFormat(date, 'yyyy-MM-dd');
};
