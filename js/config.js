// Public client configuration. The anon key is designed to be public: every table is
// protected by Row Level Security, and admin-only data is only reachable through checked RPCs.
export const SUPABASE_URL = 'https://mmengqeunonzusaxtdrm.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tZW5ncWV1bm9uenVzYXh0ZHJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzNzIzNzQsImV4cCI6MjExMDk0ODM3NH0.hujQT1BGALqhSUMHqe4oWdjv59WB47Fy6J7gV_t2vXQ';
export const APP_URL = location.origin + location.pathname;
