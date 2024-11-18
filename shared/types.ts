export type DrivingStatItem = {
  day: string;
  car: number;
  track: number;
  sessionType: number;
  events: number;
  timeOnTrack: number;
  lapsDriven: number;
  cleanLapsDriven: number;
  user: string;
};

export type DrivingStats = {
  drivingStatistics: DrivingStatItem[];
};

export type CarItem = {
  id: number;
  name: string;
  platform: string;
  platform_id: string;
};

export type Cars = {
  items: CarItem[];
  total: number;
};

export type TrackItem = {
  id: number;
  name: string;
  variant: string;
  platform: string;
  platform_id: string;
};

export type Tracks = {
  items: TrackItem[];
  total: number;
};

export type CarsAndTracksByID = {
  carsById: Record<number, CarItem>;
  tracksById: Record<number, TrackItem>;
};

export type StatsResponse = {
  carsDriven: CarItem[];
  tracksDriven: TrackItem[];
} & DrivingStats;
