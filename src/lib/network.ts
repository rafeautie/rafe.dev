type FetchParams = Parameters<typeof fetch>;
export const doRequest = <Response>(
  url: string,
  options?: FetchParams[1]
): Promise<Response> =>
  fetch(
    import.meta.env.DEV ? 'http://localhost:3002' + url : url,
    options
  ).then((res) => res.json());
