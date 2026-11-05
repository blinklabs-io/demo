import { Link as RouterLink, NavLink as RouterNavLink } from "react-router";
import type { ComponentProps } from "react";
import { networkTo } from "../lib/dingo/networkLinks";

export function Link(props: ComponentProps<typeof RouterLink>) {
  return <RouterLink {...props} to={networkTo(props.to)} />;
}
export function NavLink(props: ComponentProps<typeof RouterNavLink>) {
  return <RouterNavLink {...props} to={networkTo(props.to)} />;
}
