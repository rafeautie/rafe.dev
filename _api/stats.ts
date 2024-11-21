import { Cars, CarsAndTracksByID, DrivingStats, Tracks } from '../shared/types';
import { doRequest } from './_utils/garage61';

export const edge = true;

export const headers = {
  'Cache-Control': 'public, max-age=60',
  'CDN-Cache-Control': 'public, s-maxage=3600',
};

export const GET = async (_request: Request) => {
  const [stats, cars, tracks] = await Promise.all([
    doRequest<DrivingStats>({ endpoint: 'me/statistics' }),
    doRequest<Cars>({ endpoint: 'cars' }),
    doRequest<Tracks>({ endpoint: 'tracks' }),
  ]);

  if ('code' in stats) {
    throw new Error(stats.message);
  }

  if ('code' in cars) {
    throw new Error(cars.message);
  }

  if ('code' in tracks) {
    throw new Error(tracks.message);
  }

  const { carsDriven, tracksDriven } = extractCarsAndTracks(
    stats.drivingStatistics,
    cars.items,
    tracks.items
  );

  return new Response(
    JSON.stringify({
      drivingStatistics: stats.drivingStatistics,
      carsDriven,
      tracksDriven,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
};

/**
 * Utils
 */

const getCarAndTrackMap = (cars: Cars['items'], tracks: Tracks['items']) => {
  const response: CarsAndTracksByID = {
    carsById: {},
    tracksById: {},
  };

  cars.forEach((car) => {
    response.carsById[car.id] = car;
  });

  tracks.forEach((track) => {
    response.tracksById[track.id] = track;
  });

  return response;
};

const extractCarsAndTracks = (
  drivingStats: DrivingStats['drivingStatistics'],
  cars: Cars['items'],
  tracks: Tracks['items']
) => {
  const carSet = new Set<number>();
  const trackSet = new Set<number>();
  const carsAndTracksById = getCarAndTrackMap(cars, tracks);

  drivingStats.forEach(({ car, track }) => {
    carSet.add(car);
    trackSet.add(track);
  });

  return {
    carsDriven: Array.from(carSet).map((id) => carsAndTracksById.carsById[id]),
    tracksDriven: Array.from(trackSet).map(
      (id) => carsAndTracksById.tracksById[id]
    ),
  };
};
