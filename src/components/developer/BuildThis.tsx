import {
  recipeExample,
  recipeSdkExample,
  selfHostedDemoExample,
  recipes,
  type BuildRecipe,
} from "../../lib/developerRecipes";
import { useId, useState } from "react";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { CodeBlock } from "./CodeBlock";
import { Link } from "../NetworkLink";
import "../explorer/developer-tools.css";

export function BuildThis({ recipe }: { recipe: BuildRecipe }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="developer-panel build-this"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Build this yourself
      </summary>
      {open && <BuildThisBody recipe={recipe} />}
    </details>
  );
}

function BuildThisBody({ recipe }: { recipe: BuildRecipe }) {
  const [language, setLanguage] = useState<"JavaScript" | "cURL" | "SDK">(
    "JavaScript",
  );
  const definition = recipes[recipe];
  const id = useId();
  const sdk = recipeSdkExample(recipe);
  const code = language === "SDK" ? sdk! : recipeExample(recipe, language);
  return (
    <div className="build-this-body">
      <h2>{definition.title}</h2>
      <p>{definition.context}</p>
      <div className="build-this-setup">
        <h3>Connect your own instance</h3>
        <ol>
          <li><a href="https://docs.blinklabs.io/guides/dingo/002-quick-start-overview/" target="_blank" rel="noreferrer">Install and sync Dingo ↗</a> on {DINGO_NETWORK.label}.</li>
          <li>Use <code>storageMode: api</code> and enable Blockfrost (port 3000) and UTxO RPC (port 9090). <a href="https://docs.blinklabs.io/guides/dingo/006-apis-and-archive/" target="_blank" rel="noreferrer">API configuration ↗</a></li>
          <li>Set the URLs below to your listeners. Local examples use <code>127.0.0.1</code>; hosted applications need reachable HTTPS endpoints and their exact browser origin in your node’s CORS allowlist.</li>
        </ol>
      </div>
      <CodeBlock
        code={code}
        copyLabel="developer example"
        bar={
          <div className="code-editor-language">
            <label htmlFor={id}>Example language</label>
            <select
              id={id}
              value={language}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
            >
              <option>JavaScript</option>
              <option>cURL</option>
              {sdk && <option>SDK</option>}
            </select>
          </div>
        }
      />
      <p className="developer-note">
        {language === "SDK"
          ? "Install the imported package in your ES module project. Endpoint constants refer to your Dingo instance. "
          : recipe === "bridge" ? "Read-only requests to this workspace’s Reactor relay. " : "Read-only requests to your Dingo instance. Replace TRANSACTION_ID and BLOCK_HEIGHT where shown. "}
        Transaction construction and wallet signing are in the linked
        implementation.
      </p>
      <details>
        <summary>Run this UI with your own node</summary>
        <p>Check out the demo source, then run these commands from its directory. Replace the listener URLs with your own, and enable Mesh on port 8080 for its API playground.</p>
        <CodeBlock code={selfHostedDemoExample()} title="Terminal" copyLabel="self-hosted demo setup" />
      </details>
      <div className="developer-actions">
        <a
          href={`https://github.com/blinklabs-io/demo/blob/main/${definition.source}`}
          target="_blank"
          rel="noreferrer"
        >
          View implementation ↗
        </a>
        {recipe === "tracker" && (
          <Link to="/wallet/tools/data">Inspect datum & redeemer data</Link>
        )}
      </div>
    </div>
  );
}
