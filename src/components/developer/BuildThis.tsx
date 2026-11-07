import {
  recipeExample,
  recipeSdkExample,
  recipes,
  type BuildRecipe,
} from "../../lib/developerRecipes";
import { useId, useState } from "react";
import { DINGO_NETWORK } from "../../lib/dingo/config";
import { CopyButton } from "../explorer/CopyButton";
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
        Build this yourself <span aria-hidden="true">⌘</span>
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
      <span className="eyebrow">{DINGO_NETWORK.label} · Dingo APIs</span>
      <h2>{definition.title}</h2>
      <p>{definition.context}</p>
      <div className="developer-actions">
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
        <CopyButton value={code} label="developer example" />
      </div>
      <pre className="developer-code">{code}</pre>
      <p className="developer-note">
        {language === "SDK"
          ? "Use the imported package in an ES module project. "
          : "Read-only requests to the selected node. Replace TRANSACTION_ID where shown. "}
        Transaction construction and wallet signing are in the linked
        implementation.
      </p>
      <div className="developer-actions">
        <a
          href={`https://github.com/blinklabs-io/demo/blob/main/${definition.source}`}
          target="_blank"
          rel="noreferrer"
        >
          View implementation ↗
        </a>
        <Link to="/api">Open API playground →</Link>
        {recipe === "tracker" && (
          <Link to="/wallet/tools/data">Inspect datum & redeemer data →</Link>
        )}
      </div>
    </div>
  );
}
