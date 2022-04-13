import { NextApiRequest, NextApiResponse } from 'next';

interface Result {
  confidence: 0.4694005846977234;
  label: 'person';
}

export interface GarageState {
  carCount: number | null;
  lastUpdatedAt: number;
  results: Array<Result> | null;
}

export const TotalGarageSpaces = 2;

const GarageState: GarageState = {
  carCount: null,
  lastUpdatedAt: Date.now(),
  results: null,
};

const garage = (req: NextApiRequest, res: NextApiResponse) => {
  switch (req.method) {
    case 'GET': {
      return res.status(200).json(GarageState);
    }
    case 'POST': {
      if (req.body.password !== process.env.GARAGE_PASSWORD) {
        return res.status(401).json({
          error: 'Invalid password',
        });
      }

      const results = req.body.results as GarageState['results'];
      const carCount = results?.reduce(
        (acc, cur) => acc + (cur.label.includes('car') ? 1 : 0),
        0,
      );

      GarageState.carCount = carCount ?? null;
      GarageState.lastUpdatedAt = Date.now();
      GarageState.results = results ?? null;

      return res.status(200).json(GarageState);
    }
    default: {
      return res.status(405).json({ message: 'Method not allowed' });
    }
  }
};

export default garage;
