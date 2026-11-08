import { reactor } from "../src/server/reactor";

export function onRequest({ request }: { request: Request }) {
  return reactor(request);
}
