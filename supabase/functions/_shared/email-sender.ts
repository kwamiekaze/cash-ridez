// Shared email sending utility with domain verification fallback
// This module provides centralized email sending with automatic fallback to temporary senders
// when the primary domain (cashridez.com) is not yet verified with Resend.

import { Resend } from "https://esm.sh/resend@4.0.0";

// Email sender addresses in priority order
const VERIFIED_SENDER = "CashRidez <support@cashridez.com>";
const FALLBACK_SENDER_1 = "CashRidez <noreply@cashridezconnect.onresend.com>";
const FALLBACK_SENDER_2 = "CashRidez <onboarding@resend.dev>";

// Cache for domain verification status (TTL: 30 minutes)
let domainVerifiedCache: boolean | null = null;
let domainCacheTime: number = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface EmailSendResult {
  success: boolean;
  data?: any;
  error?: string;
  senderUsed: string;
  fallbackActive: boolean;
}

export interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Check if the cashridez.com domain is verified with Resend
 * Returns cached result if within TTL
 */
export async function isDomainVerified(resend: Resend): Promise<boolean> {
  const now = Date.now();
  
  // Return cached result if still valid
  if (domainVerifiedCache !== null && (now - domainCacheTime) < CACHE_TTL_MS) {
    console.log(`[EmailSender] Using cached domain verification status: ${domainVerifiedCache}`);
    return domainVerifiedCache;
  }
  
  try {
    console.log("[EmailSender] Checking domain verification status with Resend...");
    
    // List domains and check for cashridez.com
    const { data: domains, error } = await resend.domains.list();
    
    if (error) {
      console.error("[EmailSender] Error checking domains:", error);
      // On error, assume not verified to use fallback
      domainVerifiedCache = false;
      domainCacheTime = now;
      return false;
    }
    
    // Look for verified cashridez.com domain
    const cashRidezDomain = domains?.data?.find(
      (d: any) => d.name === "cashridez.com" && d.status === "verified"
    );
    
    const isVerified = !!cashRidezDomain;
    console.log(`[EmailSender] Domain cashridez.com verified: ${isVerified}`);
    
    // Cache the result
    domainVerifiedCache = isVerified;
    domainCacheTime = now;
    
    return isVerified;
  } catch (err) {
    console.error("[EmailSender] Exception checking domain verification:", err);
    // On error, assume not verified to use fallback
    domainVerifiedCache = false;
    domainCacheTime = now;
    return false;
  }
}

/**
 * Get the appropriate sender email based on domain verification status
 */
export async function getSenderEmail(resend: Resend): Promise<{ sender: string; fallbackActive: boolean }> {
  const isVerified = await isDomainVerified(resend);
  
  if (isVerified) {
    return { sender: VERIFIED_SENDER, fallbackActive: false };
  }
  
  // Domain not verified - use fallback
  console.log("[EmailSender] Domain not verified, using fallback sender");
  return { sender: FALLBACK_SENDER_1, fallbackActive: true };
}

/**
 * Send an email with automatic fallback handling
 * Tries the primary sender first, then falls back if needed
 */
export async function sendEmail(
  resend: Resend,
  options: EmailOptions,
  forceFallback: boolean = false
): Promise<EmailSendResult> {
  const { to, subject, html, replyTo } = options;
  
  // Determine which sender to use
  let senderInfo: { sender: string; fallbackActive: boolean };
  
  if (forceFallback) {
    senderInfo = { sender: FALLBACK_SENDER_1, fallbackActive: true };
  } else {
    senderInfo = await getSenderEmail(resend);
  }
  
  console.log(`[EmailSender] Sending email to ${to.join(", ")} using sender: ${senderInfo.sender}`);
  
  // Try sending with primary/determined sender
  try {
    const emailPayload: any = {
      from: senderInfo.sender,
      to,
      subject,
      html,
    };
    
    if (replyTo) {
      emailPayload.replyTo = replyTo;
    }
    
    const response = await resend.emails.send(emailPayload);
    
    if (response.error) {
      throw new Error(response.error.message || JSON.stringify(response.error));
    }
    
    console.log(`[EmailSender] Email sent successfully:`, response);
    
    return {
      success: true,
      data: response,
      senderUsed: senderInfo.sender,
      fallbackActive: senderInfo.fallbackActive,
    };
  } catch (primaryError: any) {
    console.error(`[EmailSender] Primary send failed:`, primaryError);
    
    // If we weren't already using fallback, try the fallback sender
    if (!senderInfo.fallbackActive) {
      console.log("[EmailSender] Attempting fallback sender...");
      
      try {
        const emailPayload: any = {
          from: FALLBACK_SENDER_1,
          to,
          subject,
          html,
        };
        
        if (replyTo) {
          emailPayload.replyTo = replyTo;
        }
        
        const fallbackResponse = await resend.emails.send(emailPayload);
        
        if (fallbackResponse.error) {
          throw new Error(fallbackResponse.error.message || JSON.stringify(fallbackResponse.error));
        }
        
        console.log(`[EmailSender] Fallback send succeeded:`, fallbackResponse);
        
        // Invalidate cache since primary failed
        domainVerifiedCache = false;
        domainCacheTime = Date.now();
        
        return {
          success: true,
          data: fallbackResponse,
          senderUsed: FALLBACK_SENDER_1,
          fallbackActive: true,
        };
      } catch (fallbackError: any) {
        console.error(`[EmailSender] Fallback send also failed:`, fallbackError);
        
        // Try the last resort sender (onboarding@resend.dev)
        try {
          const emailPayload: any = {
            from: FALLBACK_SENDER_2,
            to,
            subject,
            html,
          };
          
          if (replyTo) {
            emailPayload.replyTo = replyTo;
          }
          
          const lastResortResponse = await resend.emails.send(emailPayload);
          
          if (lastResortResponse.error) {
            throw new Error(lastResortResponse.error.message || JSON.stringify(lastResortResponse.error));
          }
          
          console.log(`[EmailSender] Last resort send succeeded:`, lastResortResponse);
          
          return {
            success: true,
            data: lastResortResponse,
            senderUsed: FALLBACK_SENDER_2,
            fallbackActive: true,
          };
        } catch (lastResortError: any) {
          return {
            success: false,
            error: `All senders failed. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}, LastResort: ${lastResortError.message}`,
            senderUsed: "none",
            fallbackActive: true,
          };
        }
      }
    }
    
    return {
      success: false,
      error: primaryError.message,
      senderUsed: senderInfo.sender,
      fallbackActive: senderInfo.fallbackActive,
    };
  }
}

/**
 * Force refresh the domain verification cache
 */
export function invalidateDomainCache(): void {
  domainVerifiedCache = null;
  domainCacheTime = 0;
  console.log("[EmailSender] Domain cache invalidated");
}

/**
 * Get current fallback status for admin display
 */
export async function getEmailSystemStatus(resend: Resend): Promise<{
  domainVerified: boolean;
  currentSender: string;
  fallbackActive: boolean;
  cacheAge: number;
}> {
  const isVerified = await isDomainVerified(resend);
  const senderInfo = isVerified 
    ? { sender: VERIFIED_SENDER, fallbackActive: false }
    : { sender: FALLBACK_SENDER_1, fallbackActive: true };
  
  return {
    domainVerified: isVerified,
    currentSender: senderInfo.sender,
    fallbackActive: senderInfo.fallbackActive,
    cacheAge: domainCacheTime ? Math.floor((Date.now() - domainCacheTime) / 1000) : 0,
  };
}
