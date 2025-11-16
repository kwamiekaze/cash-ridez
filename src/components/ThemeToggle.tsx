import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
export function ThemeToggle() {
  const {
    theme,
    setTheme
  } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return <Button variant="ghost" size="icon" className="h-9 w-9">
        <Sun className="h-4 w-4" />
      </Button>;
  }
  return <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme" className="h-9 w-9 relative overflow-hidden group transition-colors text-yellow-300">
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 drop-shadow-sm dark:drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 dark:drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
    </Button>;
}