export const metadata = {
  title: "Beautasy Studio",
};

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100]" style={{ margin: 0 }}>
      {children}
    </div>
  );
}
