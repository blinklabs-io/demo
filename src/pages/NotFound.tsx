import { Link } from "../components/NetworkLink";
import { EmptyState, PageIntro } from "../components/explorer/Visuals";
export default function NotFound() {
  return (
    <div className="detail-showcase">
      <PageIntro eyebrow="Dingo workspace" title="Page not found" symbol="⌕" />
      <EmptyState
        icon="⌁"
        title="Choose a Dingo capability"
        detail="This route is not available. Use the navigation or global lookup to continue."
        action={<Link to="/" className="experience-primary">Discover capabilities →</Link>}
      />
    </div>
  );
}
