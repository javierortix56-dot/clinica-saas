"use client";

import { SidebarContent } from "./SidebarContent";

export function Sidebar(props: {
  displayName: string;
  roleLabel: string;
  isOwner: boolean;
  approvalsCount: number;
  signOutAction: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[246px] shrink-0 md:flex">
      <SidebarContent {...props} />
    </aside>
  );
}
