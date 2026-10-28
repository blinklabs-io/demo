import { Core } from "@blaze-cardano/sdk";

export type Meta = Core.Cardano.Metadatum;
export const freeTextHash =
  "d59ae5f91542b2b70fd5fe267efbb520d5cb83786ef2cac2cd5286ac446b6240";
export interface Question {
  customAnchor?: { uri: string; hash: string };
  tag: number;
  prompt: string;
  options: string[];
  required: boolean;
  min: number;
  max: number;
  step: number;
  budget: number;
  requireAll: boolean;
  ratingLabels?: string[];
}
export interface Survey {
  hash: string;
  index: number;
  owner: string;
  title: string;
  description: string;
  endEpoch: number;
  questions: Question[];
}
export type Answer = string | number | number[] | Array<[number, number]>;
export const questionNames = [
  "Free text",
  "Single choice",
  "Multiple choice",
  "Ranking",
  "Numeric range",
  "Points allocation",
  "Rating",
];
const encoder = new TextEncoder();
export function integer(value: Meta | undefined): number {
  if (
    typeof value !== "bigint" ||
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("Unsupported or invalid survey integer.");
  return Number(value);
}
export function array(value: Meta | undefined): Meta[] {
  if (!Array.isArray(value)) throw new Error("Invalid survey array.");
  return value;
}
export function record(value: Meta | undefined): Map<Meta, Meta> {
  if (!(value instanceof Map)) throw new Error("Invalid survey record.");
  let previous = -1n;
  for (const key of value.keys()) {
    if (typeof key !== "bigint" || key < 0n || key <= previous)
      throw new Error(
        "Survey record keys must be unique and in ascending numeric order.",
      );
    previous = key;
  }
  return value;
}
export function text(value: Meta | undefined): string {
  const chunks = Array.isArray(value) ? value : [value];
  if (
    !chunks.length ||
    chunks.some((s) => typeof s !== "string" || encoder.encode(s).length > 64)
  )
    throw new Error("Invalid survey text.");
  return chunks.join("");
}
export function bytes(value: Meta | undefined, length: number): string {
  if (!(value instanceof Uint8Array) || value.length !== length)
    throw new Error("Invalid survey credential or reference.");
  return Core.HexBlob.fromBytes(value).toString();
}
export function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
}
export function credential(value: Meta | undefined): string {
  const parts = array(value);
  if (parts.length !== 2 || integer(parts[0]) !== 0)
    throw new Error("This survey needs an unsupported script credential.");
  return bytes(parts[1], 28);
}
export function ref(value: Meta | undefined) {
  const parts = array(value);
  const index = integer(parts[1]);
  if (parts.length !== 2 || index < 0 || index > 65535)
    throw new Error("Invalid survey reference.");
  return { hash: bytes(parts[0], 32), index };
}
function flag(value: Meta | undefined): boolean {
  if (value === undefined) return false;
  const n = integer(value);
  if (n !== 0 && n !== 1) throw new Error("Invalid survey flag.");
  return n === 1;
}
function grid(value: Meta | undefined) {
  const a = array(value);
  const min = integer(a[0]),
    max = integer(a[1]),
    step = a.length === 3 ? integer(a[2]) : 1;
  if (a.length < 2 || a.length > 3 || max < min || step < 1)
    throw new Error("Invalid survey numeric constraints.");
  return { min, max, step };
}
export function decodeQuestion(value: Meta): Question {
  const q = array(value);
  const tag = integer(q[0]);
  if (tag < 0 || tag > 6)
    throw new Error(
      "Custom survey methods require an external schema and cannot be answered here.",
    );
  const sizes = [3, 3, 5, 5, 3, 4, 5];
  const size = sizes[tag];
  if (q.length !== size && q.length !== size + 1)
    throw new Error("Invalid survey question fields.");
  const result: Question = {
    tag,
    prompt: text(q[1]),
    options: [],
    required: flag(q[size]),
    min: 0,
    max: 0,
    step: 1,
    budget: 0,
    requireAll: false,
  };
  if (tag === 0) {
    const anchor = array(q[2]);
    const hash = bytes(anchor[1], 32);
    if (anchor.length !== 2 || hash !== freeTextHash)
      throw new Error("This custom question uses an unsupported schema.");
    result.customAnchor = { uri: text(anchor[0]), hash };
    return result;
  }
  if (tag === 4) Object.assign(result, grid(q[2]));
  else {
    result.options = array(q[2]).map((option) => {
      if (typeof option !== "string" || encoder.encode(option).length > 64)
        throw new Error("Unsupported external option labels.");
      return option;
    });
    if (result.options.length < 2)
      throw new Error("A question needs at least two options.");
  }
  if (tag === 2 || tag === 3) {
    result.min = integer(q[3]);
    result.max = integer(q[4]);
    if (
      result.min < (tag === 3 ? 1 : 0) ||
      result.max < 1 ||
      result.max < result.min ||
      result.max > result.options.length
    )
      throw new Error("Invalid selection limits.");
  }
  if (tag === 5) {
    result.budget = integer(q[3]);
    if (result.budget < 1) throw new Error("Invalid points budget.");
  }
  if (tag === 6) {
    const scale = array(q[3]);
    if (scale.every((v) => typeof v === "string")) {
      result.ratingLabels = scale.map((v) => text(v));
      if (scale.length < 2) throw new Error("Invalid rating scale.");
      result.min = 0;
      result.max = scale.length - 1;
    } else Object.assign(result, grid(q[3]));
    result.requireAll = flag(q[4]);
  }
  return result;
}
export function decodeSurvey(value: Meta, hash: string, index: number): Survey {
  const m = record(value);
  if (integer(m.get(0n)) !== 5)
    throw new Error("Only CIP-179 version 5 is supported.");
  const roles = array(m.get(4n));
  if (roles.length !== 1 || integer(roles[0]) !== 4)
    throw new Error(
      "This survey requires ledger-role eligibility snapshots. Only keyholder surveys are supported here.",
    );
  const mode = array(m.get(6n));
  if (mode.length !== 1 || integer(mode[0]) !== 0)
    throw new Error("Sealed surveys require an external reveal service.");
  if (m.has(8n))
    throw new Error(
      "This survey uses external content. Only self-contained surveys are supported here.",
    );
  const endEpoch = integer(m.get(5n));
  if (endEpoch < 0) throw new Error("Invalid survey deadline.");
  const questions = array(m.get(7n)).map(decodeQuestion);
  if (!questions.length)
    throw new Error("A survey needs at least one question.");
  return {
    hash,
    index,
    owner: credential(m.get(1n)),
    title: text(m.get(2n)),
    description: text(m.get(3n)),
    endEpoch,
    questions,
  };
}
export function chunkText(value: string): Meta {
  const chunks: string[] = [];
  let chunk = "";
  for (const char of value) {
    if (encoder.encode(chunk + char).length > 64) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  chunks.push(chunk);
  return chunks.length === 1 ? chunks[0] : chunks;
}
export function encodeQuestion(q: Question): Meta[] {
  const numeric =
    q.tag === 4 || q.tag === 6
      ? [q.min, q.max, q.step]
      : q.tag === 2 || q.tag === 3
        ? [q.min, q.max]
        : q.tag === 5
          ? [q.budget]
          : [];
  if (numeric.some((n) => !Number.isSafeInteger(n)))
    throw new Error("Use whole numbers for question constraints.");
  if (q.tag === 0) {
    if (!q.customAnchor) throw new Error("Missing custom schema.");
    const raw: Meta[] = [
      0n,
      chunkText(q.prompt),
      [chunkText(q.customAnchor.uri), fromHex(q.customAnchor.hash)],
    ];
    if (q.required) raw.push(1n);
    decodeQuestion(raw);
    return raw;
  }
  const fields: Meta[] =
    q.tag === 4 ? [BigInt(q.min), BigInt(q.max), BigInt(q.step)] : q.options;
  const raw: Meta[] = [BigInt(q.tag), chunkText(q.prompt), fields];
  if (q.tag === 2 || q.tag === 3) raw.push(BigInt(q.min), BigInt(q.max));
  if (q.tag === 5) raw.push(BigInt(q.budget));
  if (q.tag === 6)
    raw.push(
      q.ratingLabels ?? [BigInt(q.min), BigInt(q.max), BigInt(q.step)],
      q.requireAll ? 1n : 0n,
    );
  if (q.required) raw.push(1n);
  decodeQuestion(raw);
  return raw;
}
export function surveyDefinition(
  owner: string,
  title: string,
  description: string,
  endEpoch: number,
  questions: Question[],
): Meta {
  if (!title.trim() || questions.some((q) => !q.prompt.trim()))
    throw new Error("Add a title and question prompts.");
  if (
    questions.some(
      (q) =>
        q.tag !== 0 &&
        q.tag !== 4 &&
        q.options.some((option) => !option.trim()),
    )
  )
    throw new Error("Give every option a label.");
  const m = new Map<Meta, Meta>([
    [0n, 5n],
    [1n, [0n, fromHex(owner)]],
    [2n, chunkText(title.trim())],
    [3n, chunkText(description)],
    [4n, [4n]],
    [5n, BigInt(endEpoch)],
    [6n, [0n]],
    [7n, questions.map(encodeQuestion)],
  ]);
  decodeSurvey(m, "00".repeat(32), 0);
  return [0n, [m]];
}
export function validateAnswers(
  questions: Question[],
  items: Meta[],
): Map<number, Answer> {
  if (!items.length) throw new Error("Answer at least one question.");
  const answers = new Map<number, Answer>();
  for (const value of items) {
    const a = array(value);
    const index = integer(a[1]);
    const q = questions[index];
    if (!q || answers.has(index) || integer(a[0]) !== q.tag || a.length !== 3)
      throw new Error("Invalid or duplicate question answer.");
    const option = (v: Meta) => {
      const n = integer(v);
      if (n < 0 || n >= q.options.length)
        throw new Error("Answer option out of range.");
      return n;
    };
    if (q.tag === 0) {
      const answer = text(a[2]);
      if (encoder.encode(answer).length > 1024)
        throw new Error("Free-text answers are limited to 1024 UTF-8 bytes.");
      answers.set(index, answer);
    }
    if (q.tag === 1) answers.set(index, option(a[2]));
    if (q.tag === 4) {
      const n = integer(a[2]);
      if (
        n < q.min ||
        n > q.max ||
        (BigInt(n) - BigInt(q.min)) % BigInt(q.step) !== 0n
      )
        throw new Error("Answer is outside the numeric grid.");
      answers.set(index, n);
    }
    if (q.tag === 2 || q.tag === 3) {
      const values = array(a[2]).map(option);
      if (
        new Set(values).size !== values.length ||
        values.length < q.min ||
        values.length > q.max
      )
        throw new Error("Check selection limits and duplicate choices.");
      answers.set(index, values);
    }
    if (q.tag === 5 || q.tag === 6) {
      const pairs = array(a[2]).map((v) => {
        const pair = array(v);
        if (pair.length !== 2) throw new Error("Invalid option/value pair.");
        return [option(pair[0]), integer(pair[1])] as [number, number];
      });
      if (
        !pairs.length ||
        new Set(pairs.map((p) => p[0])).size !== pairs.length
      )
        throw new Error("Missing or duplicate option values.");
      if (
        q.tag === 5 &&
        (pairs.some((p) => p[1] < 0) ||
          pairs.reduce((sum, p) => sum + BigInt(p[1]), 0n) !== BigInt(q.budget))
      )
        throw new Error(`Allocate exactly ${q.budget} points.`);
      if (
        q.tag === 6 &&
        (pairs.some(
          (p) =>
            p[1] < q.min ||
            p[1] > q.max ||
            (BigInt(p[1]) - BigInt(q.min)) % BigInt(q.step) !== 0n,
        ) ||
          (q.requireAll && pairs.length !== q.options.length))
      )
        throw new Error("Check the rating scale and required options.");
      answers.set(index, pairs);
    }
  }
  if (questions.some((q, i) => q.required && !answers.has(i)))
    throw new Error("Answer every required question.");
  return answers;
}
export function encodeAnswers(
  questions: Question[],
  values: Record<number, Answer | undefined>,
): Meta[] {
  const items: Meta[] = Object.entries(values)
    .filter(([, v]) => v !== undefined)
    .map(([index, value]) => {
      const q = questions[Number(index)];
      const whole = (n: number) => {
        if (!Number.isSafeInteger(n))
          throw new Error(
            `Enter whole numbers for question ${Number(index) + 1}.`,
          );
        return BigInt(n);
      };
      const v: Meta =
        typeof value === "string"
          ? chunkText(value)
          : typeof value === "number"
            ? whole(value)
            : Array.isArray(value)
              ? value.map((x) => (Array.isArray(x) ? x.map(whole) : whole(x)))
              : [];
      return [BigInt(q.tag), BigInt(index), v];
    });
  validateAnswers(questions, items);
  return items;
}

export function answerLabel(q: Question, value: Answer | undefined): string {
  if (value === undefined) return "Abstain";
  if (typeof value === "string") return value;
  if (typeof value === "number")
    return q.tag === 1 ? q.options[value] : String(value);
  if (q.tag === 2 || q.tag === 3)
    return (
      (value as number[])
        .map((i) => q.options[i])
        .join(q.tag === 3 ? " → " : ", ") || "None selected"
    );
  return (value as Array<[number, number]>)
    .map(([i, n]) => `${q.options[i]}: ${q.ratingLabels?.[n] ?? n}`)
    .join(", ");
}
