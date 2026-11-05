import { Core } from "@blaze-cardano/sdk";

const governanceCertificates = new Set<Core.CertificateType>([
  ...Core.VoteDelegationCredentialCertificateTypes,
  Core.CertificateType.AuthorizeCommitteeHot,
  Core.CertificateType.ResignCommitteeCold,
  Core.CertificateType.RegisterDelegateRepresentative,
  Core.CertificateType.UnregisterDelegateRepresentative,
  Core.CertificateType.UpdateDelegateRepresentative,
]);
export const activityLabels = {
  failed: "Failed script transaction",
  governance: "Governance",
  mint: "Asset creation & burn",
  scripts: "Smart contract interaction",
  stake: "Stake & identity",
  withdrawal: "Reward withdrawal",
  transfer: "Value transfer",
};
export type TransactionActivity = keyof typeof activityLabels;

export function transactionActivity(tx: Core.Transaction): TransactionActivity {
  if (!tx.isValid()) return "failed";
  const body = tx.body();
  if (
    body.votingProcedures()?.getVoters().length ||
    body.proposalProcedures()?.size() ||
    body.certs()?.values().some((cert) =>
      governanceCertificates.has(cert.toCore().__typename),
    )
  ) return "governance";
  if (body.mint()?.size) return "mint";
  if (tx.witnessSet().redeemers()?.values().length) return "scripts";
  if (body.certs()?.size()) return "stake";
  if (body.withdrawals()?.size) return "withdrawal";
  return "transfer";
}
