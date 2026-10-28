export function nodeImplementation(minor: string) {
  switch (minor) {
    case "69":
      return { id: "dingo", name: "Dingo", icon: "/nodes/dingo.png" };
    case "67":
      return { id: "bean", name: "Bean", icon: "/nodes/bean.svg" };
    default:
      return {
        id: "cardano-node",
        name: "Haskell cardano-node",
        icon: "/nodes/cardano-node.svg",
      };
  }
}
