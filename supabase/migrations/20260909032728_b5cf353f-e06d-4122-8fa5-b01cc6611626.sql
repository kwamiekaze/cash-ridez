ALTER ROLE authenticator SET statement_timeout = '8s';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';