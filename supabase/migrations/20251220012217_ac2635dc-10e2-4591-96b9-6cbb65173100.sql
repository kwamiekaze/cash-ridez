-- Create an RPC function for atomic recipient claiming using FOR UPDATE SKIP LOCKED
-- This prevents the bug where UPDATE...LIMIT updates ALL rows then returns 1

CREATE OR REPLACE FUNCTION claim_sms_recipient(
  p_campaign_id UUID,
  p_lock_id UUID,
  p_stale_threshold INTERVAL DEFAULT '5 minutes'
)
RETURNS SETOF admin_sms_campaign_recipients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_id UUID;
BEGIN
  -- Select one queued recipient that is either unlocked or has a stale lock
  -- Use FOR UPDATE SKIP LOCKED to prevent race conditions
  SELECT id INTO v_recipient_id
  FROM admin_sms_campaign_recipients
  WHERE campaign_id = p_campaign_id
    AND status = 'queued'
    AND (locked_at IS NULL OR locked_at < (NOW() - p_stale_threshold))
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  -- If no recipient found, return empty
  IF v_recipient_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Lock the recipient
  UPDATE admin_sms_campaign_recipients
  SET 
    locked_at = NOW(),
    lock_id = p_lock_id,
    last_attempt_at = NOW()
  WHERE id = v_recipient_id;
  
  -- Return the locked recipient
  RETURN QUERY 
  SELECT * FROM admin_sms_campaign_recipients WHERE id = v_recipient_id;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION claim_sms_recipient(UUID, UUID, INTERVAL) TO service_role;

-- Also create a function to release stale locks (utility for manual cleanup)
CREATE OR REPLACE FUNCTION release_stale_sms_locks(p_stale_threshold INTERVAL DEFAULT '5 minutes')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE admin_sms_campaign_recipients
  SET 
    locked_at = NULL,
    lock_id = NULL
  WHERE status = 'queued'
    AND locked_at IS NOT NULL
    AND locked_at < (NOW() - p_stale_threshold);
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION release_stale_sms_locks(INTERVAL) TO service_role;