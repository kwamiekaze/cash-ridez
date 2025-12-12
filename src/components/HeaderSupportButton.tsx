import { useState } from "react";
import { Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import SupportDialog from "@/components/SupportDialog";

/**
 * HeaderSupportButton - Support button for the top navigation bar
 * Matches the style of NotificationBell and ThemeToggle
 */
export function HeaderSupportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="h-8 w-8 sm:h-9 sm:w-9"
        title="Contact Support"
      >
        <Headset className="h-4 w-4" />
      </Button>
      <SupportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
