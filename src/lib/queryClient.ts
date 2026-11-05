import { QueryCache, QueryClient } from "@tanstack/react-query";

import { BlockfrostError } from "./dingo/blockfrost";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error instanceof BlockfrostError && error.status === 404)
        query.setState({ data: undefined, dataUpdatedAt: 0 });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});
