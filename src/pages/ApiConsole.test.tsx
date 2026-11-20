import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ApiConsole from "./ApiConsole";

const request = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../lib/dingo/blockfrost", () => ({
  blockfrostFetchResponse: request.run,
  BlockfrostError: class extends Error {},
}));

it("ignores a completed response after the request context changes", async () => {
  let finish!: (response: Response) => void;
  request.run.mockImplementation(
    () => new Promise<Response>((resolve) => { finish = resolve; }),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ApiConsole />));
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(request.run).toHaveBeenCalledOnce();
    const signal = request.run.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => {
      const target = container.querySelector<HTMLSelectElement>("#api-target")!;
      target.value = "mesh";
      target.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      finish(new Response('{"stale-response":true}'));
    });
    expect(container.textContent).not.toContain("stale-response");
    expect(container.querySelector("button[type=submit]")?.textContent).toBe(
      "Execute POST",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("executes bounded read-only Kupo requests and rejects absolute URLs",async()=>{
 const fetch=vi.fn(async()=>new Response('{"connection_status":"connected","version":"test"}',{headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetch);const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<ApiConsole/>));await act(async()=>{const select=host.querySelector<HTMLSelectElement>("#api-target")!;select.value="kupo";select.dispatchEvent(new Event("change",{bubbles:true}));});await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));expect(fetch).toHaveBeenCalledWith(expect.stringContaining(":1442/health"),expect.objectContaining({method:"GET"}));expect(host.textContent).toContain('"connection_status": "connected"');
  await act(async()=>{const input=host.querySelector<HTMLInputElement>("#api-endpoint")!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,"https://evil.example/health");input.dispatchEvent(new Event("input",{bubbles:true}));});await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));expect(fetch).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
