import { useState } from "react";
import { Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import SupportDialog from "@/components/SupportDialog";

export default function FloatingSupport() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 h-14 w-14 rounded-full shadow-lg z-50 flex items-center justify-center p-0"
        aria-label="Contact Support"
      >
        <Headset className="h-6 w-6" />
      </Button>
      <SupportDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
