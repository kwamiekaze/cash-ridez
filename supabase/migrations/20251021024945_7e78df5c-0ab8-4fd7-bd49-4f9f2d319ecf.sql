-- Fix search_path for all notification functions

ALTER FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID) 
SET search_path = public;

ALTER FUNCTION public.notify_new_message() 
SET search_path = public;

ALTER FUNCTION public.notify_new_offer() 
SET search_path = public;

ALTER FUNCTION public.notify_trip_accepted() 
SET search_path = public;

ALTER FUNCTION public.notify_trip_cancelled() 
SET search_path = public;

ALTER FUNCTION public.notify_verification_status() 
SET search_path = public;