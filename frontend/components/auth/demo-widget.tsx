import Link from "next/link";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEMO_USER } from "@/lib/demo-user";

interface AccountWidgetProps {
  plan?: string;
}

export default function DemoAccountWidget({ plan }: AccountWidgetProps) {
  const showUpgrade = plan === "free" || plan === "lite";
  const currentPlan = plan || DEMO_USER.plan;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          asChild
          className="text-foreground w-full items-start px-2 hover:no-underline"
          variant="link"
        >
          <div className="flex flex-col items-start group">
            <p>{DEMO_USER.name}</p>
            <p className="text-xs text-muted-foreground">
              {DEMO_USER.email}
            </p>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top">
        <DropdownMenuLabel className="text-xs">
          {DEMO_USER.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs text-muted-foreground">
          POC Demo Account
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs text-muted-foreground">
          Plan: {currentPlan}
        </DropdownMenuItem>
        {showUpgrade && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="p-0">
              <Link
                href="/upgrade"
                className="w-full p-2 flex items-center gap-2 text-green-500 hover:bg-green-500/15 hover:text-green-500"
              >
                <ArrowUp className="h-4 w-4" />
                <div className="grid gap-0.5">
                  <span className="font-medium">Upgrade Plan</span>
                  <span className="text-xs text-muted-foreground">
                    Capture more leads
                  </span>
                </div>
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

