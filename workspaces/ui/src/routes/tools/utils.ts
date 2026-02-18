export type WeekRange = {
    start: Date;
    end: Date;
};

export const getWeekRange = (date: Date): WeekRange => {
    const base = new Date(date.getTime());
    const dayIndex = base.getDay(); // 0 = Sunday, 6 = Saturday

    const start = new Date(base.getTime());
    start.setDate(base.getDate() - dayIndex);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};
