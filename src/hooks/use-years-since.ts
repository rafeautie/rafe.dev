import { DateTime } from 'luxon';
import { useState, useEffect } from 'react';

export const useYearsSince = (date: string): number => {
  const [years, setYears] = useState<number>(0);

  useEffect(() => {
    const inputDate = DateTime.fromFormat(date, 'dd-MM-yyyy'); // Parse the input date
    if (!inputDate.isValid) {
      throw new Error('Invalid date format');
    }
    const currentDate = DateTime.now();
    const yearsSince = Math.round(currentDate.diff(inputDate, 'years').years);
    setYears(yearsSince);
  }, [date]);

  return years;
};
