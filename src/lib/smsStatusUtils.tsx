import { Check, CheckCheck, Clock, Loader2, AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Unified SMS Status Mapping
 * 
 * Twilio statuses:
 * - queued: Message is queued to be sent
 * - sending: Message is being sent
 * - sent: Message has been sent to carrier
 * - delivered: Carrier confirmed delivery to recipient
 * - undelivered: Carrier could not deliver
 * - failed: Message failed to send
 * - received: Inbound message received
 * 
 * Only show ❌ (X) for truly failed messages (failed OR undelivered with error)
 */

export type SmsStatus = string | null | undefined;

export interface StatusInfo {
  status: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  badgeClassName?: string;
}

const STATUS_MAP: Record<string, StatusInfo> = {
  delivered: {
    status: 'delivered',
    label: 'Delivered',
    icon: <CheckCheck className="h-3 w-3" />,
    color: 'text-green-500',
    badgeVariant: 'default',
    badgeClassName: 'bg-green-600 hover:bg-green-600',
  },
  sent: {
    status: 'sent',
    label: 'Sent',
    icon: <Check className="h-3 w-3" />,
    color: 'text-blue-500',
    badgeVariant: 'default',
    badgeClassName: 'bg-blue-600 hover:bg-blue-600',
  },
  received: {
    status: 'received',
    label: 'Received',
    icon: <Check className="h-3 w-3" />,
    color: 'text-purple-500',
    badgeVariant: 'default',
    badgeClassName: 'bg-purple-600 hover:bg-purple-600',
  },
  queued: {
    status: 'queued',
    label: 'Queued',
    icon: <Clock className="h-3 w-3" />,
    color: 'text-muted-foreground',
    badgeVariant: 'secondary',
  },
  sending: {
    status: 'sending',
    label: 'Sending',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    color: 'text-muted-foreground',
    badgeVariant: 'secondary',
  },
  pending: {
    status: 'pending',
    label: 'Pending',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    color: 'text-muted-foreground',
    badgeVariant: 'secondary',
  },
  undelivered: {
    status: 'undelivered',
    label: 'Undelivered',
    icon: <AlertTriangle className="h-3 w-3" />,
    color: 'text-yellow-500',
    badgeVariant: 'destructive',
    badgeClassName: 'bg-yellow-600 hover:bg-yellow-600',
  },
  failed: {
    status: 'failed',
    label: 'Failed',
    icon: <XCircle className="h-3 w-3" />,
    color: 'text-destructive',
    badgeVariant: 'destructive',
  },
};

/**
 * Get status information for a given status string
 */
export function getStatusInfo(status: SmsStatus, errorCode?: string | null): StatusInfo {
  const normalizedStatus = status?.toLowerCase()?.trim() || '';
  
  // If there's an error code, it's a failure
  if (errorCode) {
    return STATUS_MAP.failed;
  }
  
  // Check for known statuses
  if (normalizedStatus in STATUS_MAP) {
    return STATUS_MAP[normalizedStatus];
  }
  
  // For unknown or null status, show pending (not failed!)
  return STATUS_MAP.pending;
}

/**
 * Get just the status icon for inline use
 */
export function SmsStatusIcon({ 
  status, 
  errorCode, 
  errorMessage,
  timestamp,
  messageSid,
  className,
}: { 
  status: SmsStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  timestamp?: string;
  messageSid?: string | null;
  className?: string;
}) {
  const info = getStatusInfo(status, errorCode);
  
  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-medium">{info.label}</div>
      {timestamp && <div className="text-muted-foreground">{timestamp}</div>}
      {messageSid && <div className="font-mono text-muted-foreground truncate max-w-[200px]">SID: {messageSid}</div>}
      {errorCode && <div className="text-destructive">Error: {errorCode}</div>}
      {errorMessage && <div className="text-destructive truncate max-w-[200px]">{errorMessage}</div>}
    </div>
  );
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={cn(info.color, className, "cursor-help inline-flex")}>
            {info.icon}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px]">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Get a badge for the status
 */
export function SmsStatusBadge({ 
  status, 
  errorCode,
  showLabel = true,
}: { 
  status: SmsStatus;
  errorCode?: string | null;
  showLabel?: boolean;
}) {
  const info = getStatusInfo(status, errorCode);
  
  return (
    <Badge 
      variant={info.badgeVariant} 
      className={cn(info.badgeClassName, "gap-1")}
    >
      {info.icon}
      {showLabel && <span>{info.label}</span>}
    </Badge>
  );
}

/**
 * Campaign status badge helper
 */
export function CampaignStatusBadge({ status }: { status: string }) {
  switch (status?.toLowerCase()) {
    case 'running':
      return <Badge className="bg-green-600 hover:bg-green-600">Running</Badge>;
    case 'paused':
      return <Badge className="bg-yellow-600 hover:bg-yellow-600">Paused</Badge>;
    case 'completed':
      return <Badge className="bg-blue-600 hover:bg-blue-600">Completed</Badge>;
    case 'canceled':
    case 'cancelled':
      return <Badge variant="secondary">Canceled</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'draft':
      return <Badge variant="outline">Draft</Badge>;
    default:
      return <Badge variant="outline">{status || 'Unknown'}</Badge>;
  }
}

/**
 * Recipient status badge for campaigns
 */
export function RecipientStatusBadge({ status }: { status: string }) {
  switch (status?.toLowerCase()) {
    case 'sent':
      return <Badge className="bg-green-600 hover:bg-green-600">Sent</Badge>;
    case 'delivered':
      return <Badge className="bg-green-600 hover:bg-green-600">Delivered</Badge>;
    case 'queued':
      return <Badge variant="secondary">Queued</Badge>;
    case 'sending':
      return <Badge className="bg-blue-600 hover:bg-blue-600">Sending</Badge>;
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'skipped':
      return <Badge variant="outline">Skipped</Badge>;
    default:
      return <Badge variant="outline">{status || 'Unknown'}</Badge>;
  }
}
