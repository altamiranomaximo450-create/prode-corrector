import { ProveedorProde } from "@/components/estado";
import { Shell } from "@/components/shell";

export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorProde>
      <Shell>{children}</Shell>
    </ProveedorProde>
  );
}
