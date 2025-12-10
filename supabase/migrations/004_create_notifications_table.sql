-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    notification_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('low_stock', 'harvest_reminder', 'order_update', 'system', 'info')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT, -- Optional link to related page (e.g., /supplies, /trays)
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_notifications_farm_uuid ON notifications(farm_uuid);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications or notifications for their farm
CREATE POLICY "Users can view farm notifications" ON notifications
    FOR SELECT USING (
        user_id = auth.uid() OR 
        farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
    );

-- Policy: System can create notifications (via service role)
-- Users with Owner/Editor role can create notifications
CREATE POLICY "Users can create notifications" ON notifications
    FOR INSERT WITH CHECK (
        farm_uuid IN (
            SELECT farm_uuid FROM profile 
            WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
        )
    );

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their notifications" ON notifications
    FOR UPDATE USING (user_id = auth.uid() OR farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid()
    ));

-- Function to automatically set read_at timestamp when is_read is set to true
CREATE OR REPLACE FUNCTION set_notification_read_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_read = TRUE AND OLD.is_read = FALSE AND NEW.read_at IS NULL THEN
        NEW.read_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically set read_at
CREATE TRIGGER trigger_set_notification_read_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    WHEN (NEW.is_read = TRUE AND OLD.is_read = FALSE)
    EXECUTE FUNCTION set_notification_read_at();
















