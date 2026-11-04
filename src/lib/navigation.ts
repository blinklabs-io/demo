export function normalizePath(path: string) {
  return path.replace(/\/+$/, "") || "/";
}
export function isParticipationPath(path: string) {
  return participationSections.some((section) =>
    section.matches(normalizePath(path)),
  );
}
export const participationSections = [
  {
    to: "/participate",
    label: "Get involved",
    matches: (path: string) => path === "/participate",
  },
  {
    to: "/explorer/governance",
    label: "Governance",
    matches: (path: string) =>
      /^\/explorer\/(governance|proposal)(\/|$)/.test(path),
  },
  {
    to: "/explorer/surveys",
    label: "Surveys",
    matches: (path: string) => /^\/explorer\/surveys(\/|$)/.test(path),
  },
  {
    to: "/explorer/dreps",
    label: "Representatives",
    matches: (path: string) => /^\/explorer\/(dreps|drep)(\/|$)/.test(path),
  },
];

export function isExplorePath(path: string) {
  path = normalizePath(path);
  return (
    path === "/explorer" ||
    (path.startsWith("/explorer/") && !isParticipationPath(path))
  );
}
export const exploreSections = [
  {
    to: "/explorer",
    label: "Blocks",
    matches: (path: string) =>
      path === "/explorer" || /^\/explorer\/(block|tx)(\/|$)/.test(path),
  },
  {
    to: "/explorer/mempool",
    label: "Mempool",
    matches: (path: string) => path === "/explorer/mempool",
  },
  {
    to: "/explorer/epoch",
    label: "Epochs",
    matches: (path: string) => /^\/explorer\/epoch(\/|$)/.test(path),
  },
  {
    to: "/explorer/pools",
    label: "Stake pools",
    matches: (path: string) => /^\/explorer\/(pools|pool)(\/|$)/.test(path),
  },
  {
    to: "/explorer/network",
    label: "Network",
    matches: (path: string) => path === "/explorer/network",
  },
];
