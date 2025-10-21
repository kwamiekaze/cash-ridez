-- Fix search_path security warnings for notification functions
ALTER FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID) SET search_path = '';
ALTER FUNCTION public.notify_new_message() SET search_path = '';
ALTER FUNCTION public.notify_new_offer() SET search_path = '';
ALTER FUNCTION public.notify_trip_accepted() SET search_path = '';
ALTER FUNCTION public.notify_trip_cancelled() SET search_path = '';
ALTER FUNCTION public.notify_verification_status() SET search_path = '';