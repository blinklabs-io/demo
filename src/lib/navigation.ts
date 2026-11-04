export function isParticipationPath(path: string) {
  return (
    path === "/participate" ||
    /^\/explorer\/(governance|proposal|surveys|dreps|drep)(\/|$)/.test(path)
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
