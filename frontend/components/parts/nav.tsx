// Component Imports
import DemoAccountWidget from "../auth/demo-widget";
import Link from "next/link";
import { ModeToggle } from "@/components/parts/mode-toggle";
import { DEMO_USER } from "@/lib/demo-user";
import { LucideProps } from "lucide-react";

// Icon Imports
import { BarChart, Disc3, MessageSquare, Plug, FolderKanban } from "lucide-react";

const links = [
  { href: "/", text: "Dashboard", icon: BarChart },
  { href: "/logs", text: "Logs", icon: Disc3 },
  { href: "/integrations", text: "Integrations", icon: Plug },
  { href: "/projects", text: "Projects", icon: FolderKanban },
  { href: "/ai-chat", text: "AI Chat", icon: MessageSquare },
];

export default async function Nav() {
  // Use demo user for POC
  const plan = DEMO_USER.plan;

  return (
    <nav className="p-4 flex flex-col gap-4 justify-between h-screen">
      <Link
        href="/"
        className="border bg-muted/50 flex items-center gap-2 rounded-lg p-4"
      >
        <span className="text-3xl font-bold text-foreground">OutageX</span>
      </Link>
      <div className="border bg-muted/50 rounded-lg flex flex-col justify-between p-6 h-full">
        <div className="flex flex-col gap-8">
          <div className="grid gap-2">
            {links.map((link) => (
              <NavLink key={link.href} icon={link.icon} href={link.href}>
                {link.text}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-8">
            <DemoAccountWidget plan={plan} />
            <div className="flex justify-between items-center gap-2">
              <ModeToggle />
              <p className="text-xs text-muted-foreground opacity-50">
                &copy; OutageX, 2025
              </p>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  icon: React.ComponentType<LucideProps>;
  className?: string;
}

const NavLink = ({ href, children, icon: Icon, className }: NavLinkProps) => {
  return (
    <Link
      className={`flex items-center gap-2 group p-2 rounded-md -ml-2 transition-all ${className}`}
      href={href}
    >
      <Icon
        className="text-muted-foreground group-hover:text-foreground transition-all"
        size={20}
      />
      {children}
    </Link>
  );
};
