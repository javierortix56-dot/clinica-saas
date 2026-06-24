import { SidebarContent } from "./SidebarContent";

/**
 * Sidebar fijo de escritorio. Oculto en mobile (< md): ahí se usa el drawer
 * `MobileSidebar` que se abre desde el botón hamburguesa de la topbar.
 */
export function Sidebar(props: {
  displayName: string;
  roleLabel: string;
  isOwner: boolean;
  approvalsCount: number;
  signOutAction: () => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[246px] shrink-0 md:block">
      <SidebarContent {...props} />
    </aside>
  );
}
