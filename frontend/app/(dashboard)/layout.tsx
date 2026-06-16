// TODO: layout protegido del panel de staff.
// Guard de sesión (redirige a /login si no hay sesión) y de rol.
// Nav lateral con links a /approvals y /patients.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
