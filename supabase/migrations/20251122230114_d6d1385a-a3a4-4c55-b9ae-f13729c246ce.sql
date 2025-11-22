-- Enable realtime for profiles table to allow frontend to receive updates
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;