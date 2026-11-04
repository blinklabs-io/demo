import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Cip30WalletApi } from "../../lib/dingo/cip30";
import type {
  PreparedSurvey,
  SurveyAction,
} from "../../lib/surveys/transactions";
import { useWalletStore } from "../../stores/walletStore";
import { SurveyTransaction } from "./SurveyTransaction";

const boundary = vi.hoisted(() => ({
  actions: 0,
  posts: 0,
  finish: null as (() => void) | null,
  guard: null as (() => void) | null,
}));
vi.mock("../../lib/surveys/transactions", () => ({
  prepareSurveyTransaction: async (
    _api: Cip30WalletApi,
    action: SurveyAction,
    assert: () => void,
  ) => {
    assert();
    return {
      action,
      tx: { body: () => ({ fee: () => 170000n }) },
    } as unknown as PreparedSurvey;
  },
  submitSurveyTransaction: async (
    _api: Cip30WalletApi,
    _draft: PreparedSurvey,
    assert: () => void,
  ) => {
    assert();
    boundary.guard = assert;
    return new Promise<string>((resolve, reject) => {
      boundary.finish = () => {
        try {
          assert();
          boundary.posts++;
          resolve("11".repeat(32));
        } catch (error) {
          reject(error);
        }
      };
    });
  },
}));
function Form() {
  const [title, setTitle] = useState("A");
  return (
    <>
      <label>
        Survey title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <SurveyTransaction
        ready
        label="Prepare survey fixture"
        draftKey={title}
        action={() => {
          boundary.actions++;
          return {
            kind: "create",
            title,
            description: "Description",
            endEpoch: 2000,
            questions: [
              {
                tag: 0,
                prompt: "Question",
                required: true,
                options: [],
                min: 1,
                max: 2,
                step: 1,
                budget: 100,
                requireAll: true,
              },
            ],
          };
        }}
      />
    </>
  );
}
let root: Root, container: HTMLDivElement, client: QueryClient;
beforeEach(async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  boundary.actions = 0;
  boundary.posts = 0;
  boundary.finish = null;
  boundary.guard = null;
  notifyManager.setScheduler(queueMicrotask);
  useWalletStore.setState({
    status: "connected",
    walletApi: {} as Cip30WalletApi,
    connectionId: 1,
  });
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Form />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
});
afterEach(async () => {
  if (boundary.finish) await act(async () => boundary.finish!());
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function title(value: string) {
  const input = container.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("does not evaluate an impure survey action during render or form edits", async () => {
  expect(boundary.actions).toBe(0);
  await title("B");
  expect(boundary.actions).toBe(0);
  await click("Prepare survey fixture");
  expect(boundary.actions).toBe(1);
  expect(container.querySelector(".survey-review h3")?.textContent).toBe("B");
});
it("removes the old review when a controlled survey field changes", async () => {
  await click("Prepare survey fixture");
  expect(container.querySelector(".survey-review")).not.toBeNull();
  await title("B");
  expect(container.querySelector(".survey-review")).toBeNull();
  expect(boundary.actions).toBe(1);
});
it("rejects a pending old signature after A to B to A edits without submitting", async () => {
  await click("Prepare survey fixture");
  await click("Sign & submit");
  const oldGuard = boundary.guard!;
  await title("B");
  await title("A");
  expect(() => oldGuard()).toThrow("Draft details changed");
  await act(async () => boundary.finish!());
  boundary.finish = null;
  expect(boundary.posts).toBe(0);
});
it("rejects a pending approval after leaving the survey form", async () => {
  await click("Prepare survey fixture");
  await click("Sign & submit");
  const oldGuard = boundary.guard!;
  await act(async () => root.render(<p>Another page</p>));
  expect(() => oldGuard()).toThrow("Draft details changed");
  await act(async () => boundary.finish!());
  boundary.finish = null;
  expect(boundary.posts).toBe(0);
});
