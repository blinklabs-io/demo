import { useState } from "react";
import { Link, useParams } from "react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Core } from "@blaze-cardano/sdk";
import {
  PageIntro,
  Metric,
  Gauge,
  Distribution,
} from "../../components/explorer/Visuals";
import { Panel } from "../../components/explorer/Panel";
import { SurveyIntegerInput } from "../../components/explorer/SurveyIntegerInput";
import { CopyButton } from "../../components/explorer/CopyButton";
import { HashLink } from "../../components/explorer/HashLink";
import { SurveyTransaction } from "../../components/explorer/SurveyTransaction";
import {
  metadataPage,
  loadSurvey,
  loadSurveyResults,
  answerTotals,
} from "../../lib/surveys/data";
import {
  answerLabel,
  freeTextHash,
  questionNames,
  type Question,
  type Answer,
} from "../../lib/surveys/cip179";
import { useNodeHealth } from "../../lib/dingo/nodeHealth";
import { useWalletStore } from "../../stores/walletStore";
const blankQuestion = (): Question => ({
  tag: 1,
  prompt: "",
  options: ["Yes", "No"],
  required: true,
  min: 1,
  max: 2,
  step: 1,
  budget: 100,
  requireAll: true,
});
function InlineError({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="text-red-300">
      {error.message}
    </p>
  ) : null;
}
export default function Surveys() {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const health = useNodeHealth();
  const query = useInfiniteQuery({
    queryKey: ["dingo", "surveys", "directory"],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => metadataPage(pageParam, signal),
    getNextPageParam: (last, _all, page) =>
      last.length === 100 ? page + 1 : undefined,
    staleTime: 30000,
  });
  const cards = (query.data?.pages.flat() ?? []).flatMap((row) => {
    const p = row.json_metadata;
    if (!Array.isArray(p) || p[0] !== 0 || !Array.isArray(p[1])) return [];
    return p[1].flatMap((raw: unknown, index: number) => {
      if (!raw || typeof raw !== "object") return [];
      const m = raw as Record<string, unknown>;
      const title =
        typeof m["2"] === "string"
          ? m["2"]
          : Array.isArray(m["2"])
            ? m["2"].filter((x) => typeof x === "string").join("")
            : "Untitled survey";
      const roles = Array.isArray(m["4"]) ? m["4"] : [];
      return [
        {
          hash: row.tx_hash,
          index,
          title,
          end: typeof m["5"] === "number" ? m["5"] : null,
          questions: Array.isArray(m["7"]) ? m["7"].length : 0,
          keyholders: roles.length === 1 && roles[0] === 4,
          version: m["0"],
        },
      ];
    });
  });
  const unique = [
    ...new Map(cards.map((c) => [`${c.hash}:${c.index}`, c])).values(),
  ];
  const shown = unique
    .filter((c) => showAll || (c.keyholders && c.version === 5))
    .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="survey-page">
      <PageIntro
        eyebrow="Ask. Answer. Verify."
        title="A voice on the chain."
        symbol="◉"
      />
      <section className="survey-banner">
        <div>
          <span className="eyebrow">CIP-179 · Preview</span>
          <h2>Turn a question into a public record.</h2>
          <p>
            Create a survey, respond with your wallet, and explore the results.
            All chain data comes from Dingo.
          </p>
        </div>
        <Link className="survey-primary" to="/explorer/surveys/new">
          Create a survey +
        </Link>
      </section>
      <div className="metric-grid">
        <Metric label="Survey definitions loaded" value={unique.length} />
        <Metric label="Current epoch" value={health.data?.tipEpoch ?? "—"} />
        <Metric label="Metadata label" value="17" detail="CIP-179 version 5" />
      </div>
      <Panel
        title="Discover surveys"
        action={
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            Refresh
          </button>
        }
      >
        <input
          className="survey-input"
          type="search"
          aria-label="Filter surveys"
          placeholder="Filter survey titles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <InlineError error={query.error} />
        {query.isError && (
          <button
            type="button"
            className="survey-secondary"
            onClick={() => void query.refetch()}
          >
            Retry survey
          </button>
        )}
        {query.isPending && <p role="status">Reading surveys from Dingo…</p>}
        <label className="survey-check survey-note">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Include surveys requiring other roles or versions
        </label>
        <div className="survey-directory">
          {shown.map((c) => (
            <Link
              className="survey-card"
              key={`${c.hash}:${c.index}`}
              to={`/explorer/surveys/${c.hash}/${c.index}`}
            >
              <span className="survey-card-symbol" aria-hidden="true">
                ◉
              </span>
              <span className="eyebrow">
                {c.keyholders ? "Wallet keyholders" : "Role-restricted"} · v
                {String(c.version)}
              </span>
              <h3>{c.title}</h3>
              <div className="survey-card-footer">
                <span>{c.questions} questions</span>
                <strong>
                  {c.end === null
                    ? "Unknown deadline"
                    : health.data && c.end < health.data.tipEpoch
                      ? "Deadline passed"
                      : `Through epoch ${c.end}`}
                </strong>
              </div>
              <span className="survey-card-arrow">Explore survey →</span>
            </Link>
          ))}
        </div>
        {!query.isPending && !shown.length && (
          <p className="list-empty">
            No matching survey definitions in the loaded metadata pages.
          </p>
        )}
        {query.hasNextPage && (
          <button
            type="button"
            className="survey-secondary"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more chain metadata"}
          </button>
        )}
        <p className="survey-note">
          Directory entries are discovered from metadata. Opening a survey
          verifies its creator’s signer proof. Participation supports public,
          self-contained keyholder surveys.
        </p>
      </Panel>
    </div>
  );
}
function QuestionEditor({
  value,
  onChange,
}: {
  value: Question;
  onChange: (q: Question) => void;
}) {
  const update = (part: Partial<Question>) => onChange({ ...value, ...part });
  return (
    <div className="survey-question-editor">
      <label>
        Question type
        <select
          value={value.tag}
          onChange={(e) => {
            const tag = Number(e.target.value);
            update({
              tag,
              customAnchor:
                tag === 0
                  ? {
                      uri: "https://cardano-foundation.github.io/state-of-the-developer-ecosystem/survey/cip179/free-text.schema.json",
                      hash: freeTextHash,
                    }
                  : undefined,
              min: tag === 4 || tag === 6 ? 1 : tag === 2 ? 0 : 1,
              max: tag === 4 || tag === 6 ? 5 : value.options.length,
              step: 1,
            });
          }}
        >
          {questionNames.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Question
        <input
          value={value.prompt}
          placeholder="What should we build next?"
          onChange={(e) => update({ prompt: e.target.value })}
        />
      </label>
      {value.tag !== 0 && value.tag !== 4 && (
        <label>
          Options · one per line
          <textarea
            value={value.options.join("\n")}
            rows={3}
            onChange={(e) => update({ options: e.target.value.split("\n") })}
          />
        </label>
      )}
      <div className="survey-constraint-grid">
        {(value.tag === 2 ||
          value.tag === 3 ||
          value.tag === 4 ||
          value.tag === 6) && (
          <>
            <label>
              Minimum
              <SurveyIntegerInput
                value={value.min}
                onChange={(n) => update({ min: n ?? NaN })}
              />
            </label>
            <label>
              Maximum
              <SurveyIntegerInput
                value={value.max}
                onChange={(n) => update({ max: n ?? NaN })}
              />
            </label>
          </>
        )}
        {(value.tag === 4 || value.tag === 6) && (
          <label>
            Step
            <SurveyIntegerInput
              value={value.step}
              onChange={(n) => update({ step: n ?? NaN })}
            />
          </label>
        )}
        {value.tag === 5 && (
          <label>
            Points budget
            <SurveyIntegerInput
              value={value.budget}
              onChange={(n) => update({ budget: n ?? NaN })}
            />
          </label>
        )}
      </div>
      <label className="survey-check">
        <input
          type="checkbox"
          checked={value.required}
          onChange={(e) => update({ required: e.target.checked })}
        />
        Answer required
      </label>
      {value.tag === 6 && (
        <label className="survey-check">
          <input
            type="checkbox"
            checked={value.requireAll}
            onChange={(e) => update({ requireAll: e.target.checked })}
          />
          Rate every option
        </label>
      )}
    </div>
  );
}
export function SurveyCreate() {
  const health = useNodeHealth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(3);
  const [questions, setQuestions] = useState<Question[]>([blankQuestion()]);
  return (
    <div className="survey-page">
      <Link to="/explorer/surveys" className="text-teal-300">
        ← Surveys
      </Link>
      <PageIntro
        eyebrow="CIP-179 survey studio"
        title="Ask something worth answering."
        symbol="+"
      />
      <div className="survey-studio">
        <Panel title="Build your survey">
          <div className="survey-form">
            <label>
              Survey title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What should the community build next?"
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </label>
            <div className="survey-constraint-grid">
              <label>
                Open for this many additional epochs
                <input
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <div className="survey-deadline">
                <span className="eyebrow">Inclusive deadline</span>
                <strong>
                  Epoch {health.data ? health.data.tipEpoch + duration : "—"}
                </strong>
                <p>Keyholders · public responses</p>
              </div>
            </div>
            {questions.map((q, i) => (
              <section className="survey-editor-section" key={i}>
                <div className="survey-question-number">
                  <span>Question {String(i + 1).padStart(2, "0")}</span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setQuestions((prev) => prev.filter((_, n) => n !== i))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
                <QuestionEditor
                  value={q}
                  onChange={(next) =>
                    setQuestions((prev) =>
                      prev.map((old, n) => (i === n ? next : old)),
                    )
                  }
                />
              </section>
            ))}
            <button
              className="survey-secondary"
              type="button"
              onClick={() => setQuestions((prev) => [...prev, blankQuestion()])}
            >
              + Add question
            </button>
            <SurveyTransaction
              label="Review survey transaction"
              ready={Boolean(health.data)}
              action={() => {
                if (!health.data)
                  throw new Error("Wait for Dingo chain timing.");
                if (!Number.isSafeInteger(duration) || duration < 1)
                  throw new Error("Choose at least one additional epoch.");
                return {
                  kind: "create",
                  title,
                  description,
                  endEpoch: health.data.tipEpoch + duration,
                  questions,
                };
              }}
            />
          </div>
        </Panel>
        <aside className="survey-preview">
          <span className="eyebrow">Live preview</span>
          <h2>{title || "Your survey title"}</h2>
          <p>{description || "Tell participants why their answers matter."}</p>
          <ol>
            {questions.map((q, i) => (
              <li key={i}>
                <span>{questionNames[q.tag]}</span>
                <strong>{q.prompt || `Question ${i + 1}`}</strong>
                {q.tag === 0 ? (
                  <p>Public free-text answer · up to 1024 UTF-8 bytes</p>
                ) : q.tag === 4 ? (
                  <p>
                    {q.min} – {q.max} · step {q.step}
                  </p>
                ) : (
                  <div>
                    {q.options.map((option, n) => (
                      <span className="survey-preview-option" key={n}>
                        {option || `Option ${n + 1}`}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p>
            Public responses. One latest valid response per payment credential.
            No ADA weighting.
          </p>
        </aside>
      </div>
    </div>
  );
}
function AnswerInput({
  question: q,
  value,
  onChange,
  index,
}: {
  question: Question;
  value: Answer | undefined;
  onChange: (value: Answer | undefined) => void;
  index: number;
}) {
  const pairChange = (option: number, n: number | undefined) => {
    const pairs = (value as Array<[number, number]> | undefined) ?? [];
    onChange([
      ...pairs.filter((p) => p[0] !== option),
      ...(n === undefined ? [] : [[option, n] as [number, number]]),
    ]);
  };
  return (
    <div className="survey-answer">
      <div className="survey-question-number">
        <span>
          Question {String(index + 1).padStart(2, "0")} · {questionNames[q.tag]}
        </span>
        <span>{q.required ? "Required" : "Optional"}</span>
      </div>
      <h3>{q.prompt}</h3>
      {q.tag === 0 && (
        <label>
          Public answer
          <textarea
            rows={4}
            aria-label={`Answer question ${index + 1}`}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="survey-note">
            Up to 1024 UTF-8 bytes. This answer will be public.
          </span>
        </label>
      )}
      {q.tag === 1 && (
        <div className="survey-choice-grid">
          {q.options.map((option, i) => (
            <label
              className={`survey-choice ${value === i ? "selected" : ""}`}
              key={i}
            >
              <input
                type="radio"
                name={`question-${index}`}
                checked={value === i}
                onChange={() => onChange(i)}
              />
              {option}
            </label>
          ))}
        </div>
      )}
      {q.tag === 2 && (
        <>
          <p>
            Select {q.min}–{q.max} options.
          </p>
          {value === undefined && (
            <button
              type="button"
              className="text-teal-300"
              onClick={() => onChange([])}
            >
              Answer this question
            </button>
          )}
          <div className="survey-choice-grid">
            {q.options.map((option, i) => (
              <label
                className={`survey-choice ${(value as number[] | undefined)?.includes(i) ? "selected" : ""}`}
                key={i}
              >
                <input
                  type="checkbox"
                  checked={
                    (value as number[] | undefined)?.includes(i) ?? false
                  }
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...((value as number[] | undefined) ?? []), i]
                        : ((value as number[] | undefined) ?? []).filter(
                            (n) => n !== i,
                          ),
                    )
                  }
                />
                {option}
              </label>
            ))}
          </div>
        </>
      )}
      {q.tag === 3 && (
        <div className="survey-ranking">
          <p>
            Rank {q.min}–{q.max} options. Select each choice in preference
            order.
          </p>
          {((value as number[] | undefined) ?? []).map((option, rank) => (
            <div key={option}>
              <strong>{rank + 1}</strong>
              <span>{q.options[option]}</span>
              <button
                type="button"
                aria-label={`Remove ${q.options[option]} from ranking`}
                onClick={() =>
                  onChange((value as number[]).filter((i) => i !== option))
                }
              >
                ×
              </button>
            </div>
          ))}
          <select
            aria-label={`Add ranked option for question ${index + 1}`}
            value=""
            onChange={(e) =>
              onChange([
                ...((value as number[] | undefined) ?? []),
                Number(e.target.value),
              ])
            }
          >
            <option value="">Add your next choice…</option>
            {q.options.map(
              (option, i) =>
                !(value as number[] | undefined)?.includes(i) && (
                  <option value={i} key={i}>
                    {option}
                  </option>
                ),
            )}
          </select>
        </div>
      )}
      {q.tag === 4 && (
        <label className="survey-number-answer">
          <span>
            {q.min} – {q.max} · step {q.step}
          </span>
          <SurveyIntegerInput
            label={`Answer question ${index + 1}`}
            value={typeof value === "number" ? value : undefined}
            onChange={onChange}
          />
        </label>
      )}
      {(q.tag === 5 || q.tag === 6) && (
        <div className="survey-allocation">
          {q.tag === 5 && (
            <p>
              <strong>
                {((value as Array<[number, number]> | undefined) ?? []).reduce(
                  (sum, p) => sum + p[1],
                  0,
                )}{" "}
                / {q.budget}
              </strong>{" "}
              points allocated
            </p>
          )}
          {q.options.map((option, i) => (
            <label key={i}>
              <span>{option}</span>
              {q.ratingLabels ? (
                <select
                  aria-label={`Rate ${option}`}
                  value={
                    (value as Array<[number, number]> | undefined)?.find(
                      (p) => p[0] === i,
                    )?.[1] ?? ""
                  }
                  onChange={(e) =>
                    pairChange(
                      i,
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                    )
                  }
                >
                  <option value="">Choose…</option>
                  {q.ratingLabels.map((label, n) => (
                    <option value={n} key={n}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <SurveyIntegerInput
                  label={`${q.tag === 5 ? "Points for" : "Rating for"} ${option}`}
                  value={
                    (value as Array<[number, number]> | undefined)?.find(
                      (p) => p[0] === i,
                    )?.[1]
                  }
                  onChange={(n) => pairChange(i, n)}
                />
              )}
            </label>
          ))}
        </div>
      )}
      {!q.required && (
        <button
          type="button"
          className="survey-abstain"
          onClick={() => onChange(undefined)}
        >
          Abstain / clear answer
        </button>
      )}
    </div>
  );
}
export function SurveyDetail() {
  const { hash, index } = useParams();
  const connectionId = useWalletStore((s) => s.connectionId);
  return <SurveyDetailContent key={`${hash}:${index}:${connectionId}`} />;
}
function SurveyDetailContent() {
  const { hash = "", index = "" } = useParams();
  const valid =
    /^[a-f0-9]{64}$/i.test(hash) &&
    /^\d+$/.test(index) &&
    Number(index) <= 65535;
  const health = useNodeHealth();
  const connectionId = useWalletStore((s) => s.connectionId);
  const change = useWalletStore((s) => s.changeAddress);
  const [answers, setAnswers] = useState<Record<number, Answer | undefined>>(
    {},
  );
  const [scanned, setScanned] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const query = useQuery({
    queryKey: ["dingo", "surveys", "detail", hash, index],
    enabled: valid,
    queryFn: ({ signal }) =>
      loadSurvey(hash.toLowerCase(), Number(index), signal),
    retry: false,
  });
  const survey = query.data?.survey;
  const results = useQuery({
    queryKey: ["dingo", "surveys", "results", hash, index],
    enabled: Boolean(survey),
    queryFn: ({ signal }) => loadSurveyResults(survey!, signal, setScanned),
    staleTime: 30000,
    retry: false,
  });
  let owner: boolean;
  try {
    owner = Boolean(
      change &&
      Core.Address.fromBech32(change).getProps().paymentPart?.hash ===
        survey?.owner,
    );
  } catch {
    owner = false;
  }
  if (!valid)
    return (
      <Panel title="Survey not found">
        <p>Use a transaction ID and a valid survey index.</p>
      </Panel>
    );
  if (!survey)
    return (
      <Panel title={query.error ? "Survey unavailable" : "Loading survey"}>
        <InlineError error={query.error} />
        {query.isError && (
          <button
            type="button"
            className="survey-secondary"
            onClick={() => void query.refetch()}
          >
            Retry survey
          </button>
        )}
        {query.isPending && (
          <p role="status">Verifying the survey definition and creator…</p>
        )}
      </Panel>
    );
  const counted = results.data?.responses.filter((r) => r.counted) ?? [];
  const closed = health.data ? health.data.tipEpoch > survey.endEpoch : false;
  const cancelled = results.data?.cancelled ?? false;
  const eligible =
    !closed && !cancelled && Boolean(health.data) && results.isSuccess;
  return (
    <div className="survey-page">
      <Link to="/explorer/surveys" className="text-teal-300">
        ← Surveys
      </Link>
      <PageIntro
        eyebrow="Verified creator · CIP-179 v5"
        title={survey.title}
        symbol="◉"
      />
      <section className="survey-detail-hero">
        <div>
          <span className="status-badge">
            {cancelled ? "Cancelled" : closed ? "Closed" : "Open"}
          </span>
          <p>
            {survey.description || "A public survey for wallet keyholders."}
          </p>
          <span className="eyebrow">
            Survey definition · index {survey.index}
          </span>
          <HashLink kind="tx" id={survey.hash} />
        </div>
        {health.data ? (
          <Gauge
            value={
              (Math.max(0, survey.endEpoch - health.data.tipEpoch + 1) /
                Math.max(
                  1,
                  survey.endEpoch - query.data!.publication.epoch + 1,
                )) *
              100
            }
            label="Time remaining"
            detail={`${Math.max(0, survey.endEpoch - health.data.tipEpoch + 1)} epochs · inclusive deadline ${survey.endEpoch}`}
          />
        ) : (
          <p>Waiting for chain timing…</p>
        )}
      </section>
      <div className="metric-grid">
        <Metric
          label="Verified keyholders"
          value={results.isSuccess ? counted.length : "—"}
        />
        <Metric label="Questions" value={survey.questions.length} />
        <Metric
          label="Superseded or excluded"
          value={
            results.isSuccess
              ? results.data.responses.length - counted.length
              : "—"
          }
        />
      </div>
      <InlineError error={results.error} />
      {results.isFetching && (
        <p role="status" className="directory-progress">
          Scanning label 17 · {scanned.toLocaleString()} records read…
        </p>
      )}
      <section className="survey-question-navigation">
        <div>
          <span className="eyebrow">
            Question {activeQuestion + 1} of {survey.questions.length}
          </span>
          <span>
            {Object.values(answers).filter((v) => v !== undefined).length}{" "}
            answers entered
          </span>
        </div>
        <nav aria-label="Survey questions">
          {survey.questions.map((q, i) => (
            <button
              type="button"
              key={i}
              aria-label={`Question ${i + 1}: ${q.prompt}`}
              aria-current={activeQuestion === i ? "step" : undefined}
              className={`${activeQuestion === i ? "active " : ""}${answers[i] !== undefined ? "answered" : ""}`}
              onClick={() => setActiveQuestion(i)}
            >
              {answers[i] !== undefined ? "✓ " : ""}
              {i + 1}
            </button>
          ))}
        </nav>
      </section>
      <div className="survey-detail-layout">
        <Panel
          title={closed || cancelled ? "Survey questions" : "Your response"}
        >
          <div key={`${hash}:${index}:${connectionId}`} className="survey-form">
            <fieldset disabled={!eligible}>
              {survey.questions.map(
                (q, i) =>
                  i === activeQuestion && (
                    <AnswerInput
                      key={i}
                      question={q}
                      index={i}
                      value={answers[i]}
                      onChange={(value) =>
                        setAnswers((prev) => ({ ...prev, [i]: value }))
                      }
                    />
                  ),
              )}
            </fieldset>
            <div className="survey-actions">
              <button
                type="button"
                className="survey-secondary"
                disabled={activeQuestion === 0}
                onClick={() => setActiveQuestion((i) => i - 1)}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="survey-secondary"
                disabled={activeQuestion === survey.questions.length - 1}
                onClick={() => setActiveQuestion((i) => i + 1)}
              >
                Next question →
              </button>
            </div>
            {eligible && (
              <SurveyTransaction
                label="Review public response"
                ready={eligible}
                action={() => {
                  const missing = survey.questions.findIndex(
                    (q, i) => q.required && answers[i] === undefined,
                  );
                  if (missing >= 0) {
                    setActiveQuestion(missing);
                    throw new Error(`Answer required question ${missing + 1}.`);
                  }
                  return { kind: "respond", survey, answers };
                }}
              />
            )}
            <p className="survey-note">
              One response per payment credential, with the latest valid
              response replacing earlier answers. These counts do not represent
              unique people or ADA-weighted votes.
            </p>
          </div>
        </Panel>
        <Panel
          title={closed ? "Results" : "Results so far"}
          action={
            <button
              type="button"
              disabled={results.isFetching}
              onClick={() => void results.refetch()}
            >
              Refresh
            </button>
          }
        >
          {results.isError && (
            <p>
              Results could not be fully verified. Retry to load the complete
              result set.
            </p>
          )}
          {results.isSuccess &&
            survey.questions.map((q, i) => {
              if (i !== activeQuestion) return null;
              const totals = answerTotals(survey, results.data.responses, i);
              return (
                <section className="survey-result" key={i}>
                  <h3>{q.prompt}</h3>
                  <p>
                    {totals.answered} answered · {totals.abstain} abstained
                  </p>
                  {q.tag === 0 ? (
                    <div className="survey-text-responses">
                      {counted
                        .filter((r) => r.answers.has(i))
                        .map((r) => (
                          <blockquote key={r.hash}>
                            <p>{String(r.answers.get(i))}</p>
                            {r.credential && (
                              <div className="survey-credential">
                                <code>{r.credential}</code>
                                <CopyButton
                                  value={r.credential}
                                  label="credential"
                                />
                              </div>
                            )}
                            <HashLink kind="tx" id={r.hash} />
                          </blockquote>
                        ))}
                    </div>
                  ) : q.tag === 4 ? (
                    <div className="survey-numeric-results">
                      {[...new Set(totals.numeric)]
                        .sort((a, b) => a - b)
                        .map((value) => (
                          <div key={value}>
                            <strong>{value}</strong>
                            <span>
                              {totals.numeric.filter((n) => n === value).length}{" "}
                              responses
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : q.tag === 6 ? (
                    <div className="survey-numeric-results">
                      {totals.counts.map((item) => (
                        <div key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value.toString()}</strong>
                          <span>sum of ratings</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <Distribution
                        title={
                          q.tag === 3
                            ? "Borda score"
                            : q.tag === 5
                              ? "Allocated points"
                              : q.tag === 6
                                ? "Rating totals"
                                : "Selections"
                        }
                        unit={`${totals.answered} ${totals.answered === 1 ? "answer" : "answers"}`}
                        items={totals.counts.map((item, optionIndex) => ({
                          label: `${optionIndex + 1}. ${item.label}`,
                          value: item.value,
                          display: String(item.value),
                        }))}
                      />
                      <p className="survey-note">
                        {q.tag === 3
                          ? `Display policy: ${q.options.length} points for first place, one fewer per lower rank; unranked choices receive zero.`
                          : q.tag === 6
                            ? "Display policy: sum of ratings for each option; omitted options contribute no rating."
                            : q.tag === 5
                              ? "Display policy: sum of allocated points per option."
                              : "Display policy: one count per selected option and credential."}
                      </p>
                    </>
                  )}
                </section>
              );
            })}
        </Panel>
      </div>
      <Panel title="Response audit">
        <p className="survey-note">
          Credential proof, cutoff, question constraints, replacements, and
          cancellation are checked before counting.
        </p>
        <div className="survey-audit">
          {results.data?.responses.map((r) => (
            <details key={`${r.hash}:${r.responseIndex}`}>
              <summary>
                <span
                  className={r.counted ? "text-teal-300" : "text-slate-400"}
                >
                  {r.counted ? "✓ Counted" : "Excluded"}
                </span>
                <code title={r.credential}>
                  {r.credential || "Invalid credential"}
                </code>
                <span>{r.reason}</span>
              </summary>
              {r.credential && (
                <div className="survey-credential">
                  <code>{r.credential}</code>
                  <CopyButton value={r.credential} label="credential" />
                </div>
              )}
              <HashLink kind="tx" id={r.hash} />
              <dl>
                {survey.questions.map(
                  (q, i) =>
                    i === activeQuestion && (
                      <div key={i}>
                        <dt>{q.prompt}</dt>
                        <dd>{answerLabel(q, r.answers.get(i))}</dd>
                      </div>
                    ),
                )}
              </dl>
            </details>
          ))}
        </div>
      </Panel>
      {owner && eligible && (
        <Panel title="Creator controls">
          <p className="survey-note">
            Cancellation ends participation and excludes all responses. The
            on-chain records remain public.
          </p>
          <SurveyTransaction
            label="Review survey cancellation"
            ready={eligible}
            action={() => ({ kind: "cancel", survey })}
          />
        </Panel>
      )}
    </div>
  );
}
