// Shared email sending utility with domain verification fallback
// This module provides centralized email sending with automatic fallback to temporary senders
// when the primary domain (cashridez.com) is not yet verified with Resend.

import { Resend } from "https://esm.sh/resend@4.0.0";

// Email sender addresses in priority order
const VERIFIED_SENDER = "CashRidez <support@cashridez.com>";
// updates.cashridez.com is verified in Resend - use this as fallback
const FALLBACK_SENDER_1 = "CashRidez <noreply@updates.cashridez.com>";
const FALLBACK_SENDER_2 = "CashRidez <support@updates.cashridez.com>";

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
    
    console.log("[EmailSender] Domains response:", JSON.stringify(domains));
    
    // Handle various response structures from Resend API
    // The API might return { data: [...] } or directly [...]
    const domainList = Array.isArray(domains) 
      ? domains 
      : (domains?.data && Array.isArray(domains.data)) 
        ? domains.data 
        : [];
    
    // Look for verified cashridez.com domain
    const cashRidezDomain = domainList.find(
      (d: any) => d.name === "cashridez.com" && d.status === "verified"
    );
    
    const isVerified = !!cashRidezDomain;
    console.log(`[EmailSender] Domain cashridez.com verified: ${isVerified}`);
    if (cashRidezDomain) {
      console.log(`[EmailSender] Domain details: ${JSON.stringify(cashRidezDomain)}`);
    }
    
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
 * ALWAYS tries fallback senders on failure to ensure delivery
 */
export async function sendEmail(
  resend: Resend,
  options: EmailOptions,
  forceFallback: boolean = false
): Promise<EmailSendResult> {
  const { to, subject, html, replyTo } = options;
  
  // Build the list of senders to try in order
  const sendersToTry: string[] = [];
  
  if (forceFallback) {
    // Skip primary, go straight to fallbacks
    sendersToTry.push(FALLBACK_SENDER_1, FALLBACK_SENDER_2);
  } else {
    // Check domain verification status first
    const isVerified = await isDomainVerified(resend);
    
    if (isVerified) {
      // Try primary first, then fallbacks if it fails
      sendersToTry.push(VERIFIED_SENDER, FALLBACK_SENDER_1, FALLBACK_SENDER_2);
    } else {
      // Domain not verified, skip primary entirely
      console.log("[EmailSender] Domain not verified, skipping primary sender");
      sendersToTry.push(FALLBACK_SENDER_1, FALLBACK_SENDER_2);
    }
  }
  
  let lastError: string = "";
  
  // Try each sender in order until one succeeds
  for (let i = 0; i < sendersToTry.length; i++) {
    const currentSender = sendersToTry[i];
    const isFallback = currentSender !== VERIFIED_SENDER;
    
    console.log(`[EmailSender] Attempt ${i + 1}/${sendersToTry.length}: Sending to ${to.join(", ")} using sender: ${currentSender}`);
    
    try {
      const emailPayload: any = {
        from: currentSender,
        to,
        subject,
        html,
      };
      
      if (replyTo) {
        emailPayload.replyTo = replyTo;
      }
      
      const response = await resend.emails.send(emailPayload);
      
      if (response.error) {
        const errorMsg = response.error.message || JSON.stringify(response.error);
        console.error(`[EmailSender] Send failed with sender ${currentSender}:`, errorMsg);
        lastError = errorMsg;
        
        // If this was the primary sender and it failed with domain error, invalidate cache
        if (currentSender === VERIFIED_SENDER && 
            (errorMsg.includes("not verified") || errorMsg.includes("domain"))) {
          console.log("[EmailSender] Primary sender domain error, invalidating cache");
          domainVerifiedCache = false;
          domainCacheTime = Date.now();
        }
        
        // Continue to next sender
        continue;
      }
      
      console.log(`[EmailSender] Email sent successfully with sender ${currentSender}:`, response);
      
      return {
        success: true,
        data: response,
        senderUsed: currentSender,
        fallbackActive: isFallback,
      };
      
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      console.error(`[EmailSender] Exception with sender ${currentSender}:`, errorMsg);
      lastError = errorMsg;
      
      // If domain-related error, invalidate cache
      if (currentSender === VERIFIED_SENDER && 
          (errorMsg.includes("not verified") || errorMsg.includes("domain"))) {
        console.log("[EmailSender] Primary sender domain exception, invalidating cache");
        domainVerifiedCache = false;
        domainCacheTime = Date.now();
      }
      
      // Continue to next sender
      continue;
    }
  }
  
  // All senders failed
  console.error(`[EmailSender] All senders failed. Last error: ${lastError}`);
  
  return {
    success: false,
    error: `All senders failed. Last error: ${lastError}`,
    senderUsed: "none",
    fallbackActive: true,
  };
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
