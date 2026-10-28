export function governanceName(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const document = metadata as Record<string, unknown>;
  const body =
    document.body && typeof document.body === "object"
      ? (document.body as Record<string, unknown>)
      : document;
  for (const key of ["givenName", "name", "title"]) {
    const field = body[key];
    if (typeof field === "string" && field.trim()) return field.trim();
    if (field && typeof field === "object") {
      const literal = field as Record<string, unknown>;
      const value = literal["@value"] ?? literal.value;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return undefined;
}
