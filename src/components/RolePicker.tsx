import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Car, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface RolePickerProps {
  onRoleSelect: (role: 'rider' | 'driver') => void;
  selectedRole?: 'rider' | 'driver' | null;
}

export const RolePicker = ({ onRoleSelect, selectedRole }: RolePickerProps) => {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold mb-2">Choose Your Role</h3>
        <p className="text-sm text-muted-foreground">
          Select whether you'll be requesting rides or providing rides
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className={cn(
            "p-6 cursor-pointer transition-all hover:shadow-lg border-2",
            selectedRole === 'rider'
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          )}
          onClick={() => onRoleSelect('rider')}
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center",
              selectedRole === 'rider' ? "bg-primary" : "bg-muted"
            )}>
              <Users className={cn(
                "w-8 h-8",
                selectedRole === 'rider' ? "text-white" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-2">Rider</h4>
              <p className="text-sm text-muted-foreground">
                Request rides and connect with drivers
              </p>
            </div>
          </div>
        </Card>

        <Card
          className={cn(
            "p-6 cursor-pointer transition-all hover:shadow-lg border-2",
            selectedRole === 'driver'
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          )}
          onClick={() => onRoleSelect('driver')}
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center",
              selectedRole === 'driver' ? "bg-primary" : "bg-muted"
            )}>
              <Car className={cn(
                "w-8 h-8",
                selectedRole === 'driver' ? "text-white" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <h4 className="font-semibold text-lg mb-2">Driver</h4>
              <p className="text-sm text-muted-foreground">
                Provide rides and earn money
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};