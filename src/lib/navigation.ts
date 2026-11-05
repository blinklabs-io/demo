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

export function isWalletPath(path: string) {
  return /^\/wallet(?:\/(send|delegate))?$/.test(normalizePath(path));
}

export const walletSections = [
  {
    to: "/wallet",
    label: "Portfolio",
    matches: (path: string) => path === "/wallet",
  },
  {
    to: "/wallet/send",
    label: "Send",
    matches: (path: string) => path === "/wallet/send",
  },
  {
    to: "/wallet/delegate",
    label: "Delegate",
    matches: (path: string) => path === "/wallet/delegate",
  },
];

export function sectionNavigation(path: string) {
  path = normalizePath(path);
  if (isExplorePath(path))
    return { label: "Explorer navigation", items: exploreSections };
  if (isParticipationPath(path))
    return { label: "Participation navigation", items: participationSections };
  if (isWalletPath(path))
    return { label: "Wallet navigation", items: walletSections };
  return null;
}

export const mainNavigation = [
  {
    to: "/",
    area: "discover",
    label: "Discover",
    icon: "✦",
    matches: (path: string) => path === "/",
    group: false,
  },
  {
    to: "/explorer",
    area: "explore",
    label: "Explore",
    icon: "◫",
    matches: isExplorePath,
    group: true,
  },
  {
    to: "/participate",
    area: "participate",
    label: "Participate",
    icon: "◉",
    matches: isParticipationPath,
    group: true,
  },
  {
    to: "/wallet/swap",
    area: "swap",
    label: "Swap",
    icon: "⇄",
    matches: (path: string) => path === "/wallet/swap",
    group: false,
  },
  {
    to: "/wallet/tools",
    area: "build",
    label: "Create & build",
    icon: "⌁",
    matches: (path: string) => /^\/wallet\/tools(?:\/|$)/.test(path),
    group: true,
  },
  {
    to: "/wallet",
    area: "wallet",
    label: "Wallet",
    icon: "▣",
    matches: isWalletPath,
    group: true,
  },
  {
    to: "/api",
    area: "api",
    label: "API playground",
    icon: "⌘",
    matches: (path: string) => path === "/api",
    group: false,
  },
];
