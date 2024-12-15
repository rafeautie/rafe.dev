interface Endpoint {
  url: string;
  method: 'get' | 'post';
}

interface APIOptions<Payload> {
  endpoint: keyof typeof endpoints;
  payload?: Payload;
}

interface ErrorResponse {
  message: string;
  trace: string;
  code: string;
}

const endpoints = {
  'me/statistics': {
    url: 'me/statistics',
    method: 'get',
  },
  cars: {
    url: 'cars',
    method: 'get',
  },
  tracks: {
    url: 'tracks',
    method: 'get',
  },
} satisfies Record<string, Endpoint>;

export const doRequest = async <Response, Payload = unknown>({
  endpoint,
}: APIOptions<Payload>) => {
  const { url, method } = endpoints[endpoint];
  const response = await fetch(`https://garage61.net/api/v1/${url}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GARAGE61_API_KEY}` },
  });
  return (await response.json()) as Response | ErrorResponse;
};
