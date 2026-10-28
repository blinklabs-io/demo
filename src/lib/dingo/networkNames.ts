export function networkName(magic: number): string {
  switch (magic) {
    case 764824073:
      return "Mainnet";
    case 1:
      return "Preprod";
    case 2:
      return "Preview";
    default:
      return "Custom network";
  }
}

export function eraNameFromProtocol(major: number): string {
  if (!Number.isInteger(major) || major < 0) return "Unknown era";
  if (major <= 1) return "Byron";
  if (major === 2) return "Shelley";
  if (major === 3) return "Allegra";
  if (major === 4) return "Mary";
  if (major <= 6) return "Alonzo";
  if (major <= 8) return "Babbage";
  if (major <= 11) return "Conway";
  if (major <= 13) return "Dijkstra";
  return "Unknown era";
}
