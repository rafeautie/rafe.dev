type FetchParams = Parameters<typeof fetch>;
export const doRequest = <Response>(
  url: string,
  options?: FetchParams[1]
): Promise<Response> => fetch(url, options).then((res) => res.json());
