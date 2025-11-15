import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="h-9 w-9 relative overflow-hidden bg-gradient-primary rounded-full"
      aria-label="Toggle theme"
    >
      <Sun className="h-4 w-4 text-black rotate-0 scale-100 transition-all dark:-rotate-180 dark:scale-0" />
      <Moon className="absolute h-4 w-4 text-black rotate-180 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
