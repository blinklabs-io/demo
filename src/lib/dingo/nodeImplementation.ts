export function nodeImplementation(minor: string, major?: string) {
  switch (minor) {
    case "69":
      return { id: "dingo", name: "Dingo", icon: "/nodes/dingo.png" };
    case "67":
      return { id: "bean", name: "Bean", icon: "/nodes/bean.svg" };
    default:
      if (major === "11" && (minor === "1" || minor === "2"))
        return {
          id: "cardano-node",
          name: "Haskell cardano-node",
          icon: "/nodes/cardano-node.svg",
        };
      return {
        id: "unknown",
        name: "Unidentified node",
        icon: "/nodes/unknown.svg",
      };
  }
}
