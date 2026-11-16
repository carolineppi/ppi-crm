CREATE TABLE IF NOT EXISTS feedback_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_profile_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  reporter_name text NOT NULL,
  reporter_email text NOT NULL,
  reporter_role text,
  flag_type text NOT NULL DEFAULT 'bug',
  severity text NOT NULL DEFAULT 'normal',
  title text NOT NULL,
  message text NOT NULL,
  page_url text,
  pathname text,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  admin_notes text,
  resolved_by text,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_feedback_flags_status_created
  ON feedback_flags (status, created_at DESC);

ALTER TABLE feedback_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_flags_insert_own ON feedback_flags;
CREATE POLICY feedback_flags_insert_own ON feedback_flags
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS feedback_flags_select_own_or_admin ON feedback_flags;
CREATE POLICY feedback_flags_select_own_or_admin ON feedback_flags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.auth_user_id = auth.uid()
        AND ('admin' = ANY(up.roles) OR up.id = feedback_flags.user_profile_id)
    )
  );

DROP POLICY IF EXISTS feedback_flags_admin_update ON feedback_flags;
CREATE POLICY feedback_flags_admin_update ON feedback_flags
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.auth_user_id = auth.uid() AND 'admin' = ANY(up.roles)
    )
  );

DROP POLICY IF EXISTS feedback_flags_admin_delete ON feedback_flags;
CREATE POLICY feedback_flags_admin_delete ON feedback_flags
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.auth_user_id = auth.uid() AND 'admin' = ANY(up.roles)
    )
  );
