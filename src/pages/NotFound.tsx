import { Link } from "react-router";
import { EmptyState } from "../components/explorer/Visuals";
export default function NotFound() {
  return (
    <EmptyState
      icon="⌁"
      title="This path is off the chain"
      detail="The page you are looking for does not exist."
      action={
        <Link to="/explorer" className="status-badge positive">
          Back to overview →
        </Link>
      }
    />
  );
}
