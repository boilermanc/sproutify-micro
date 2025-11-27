-- Create report_templates table (saved report configurations)
CREATE TABLE IF NOT EXISTS report_templates (
    template_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    template_name TEXT NOT NULL,
    report_type TEXT NOT NULL CHECK (report_type IN ('harvest', 'delivery', 'sales')),
    parameters JSONB NOT NULL, -- Stores report parameters: {dateRange: {...}, filters: {...}, etc.}
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profile(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create report_history table (generated report records)
CREATE TABLE IF NOT EXISTS report_history (
    report_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    report_type TEXT NOT NULL CHECK (report_type IN ('harvest', 'delivery', 'sales')),
    template_id INTEGER REFERENCES report_templates(template_id),
    parameters JSONB NOT NULL, -- Report parameters used
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    generated_by UUID REFERENCES profile(id),
    report_url TEXT, -- URL to generated report (PDF, etc.)
    status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'completed', 'failed')),
    error_message TEXT
);

-- Enable Row Level Security
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for report_templates
CREATE POLICY "Users can view farm report templates" ON report_templates
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm report templates" ON report_templates
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- RLS Policies for report_history
CREATE POLICY "Users can view farm report history" ON report_history
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can create farm report history" ON report_history
    FOR INSERT WITH CHECK (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- Add indexes for performance
CREATE INDEX idx_report_templates_farm_uuid ON report_templates(farm_uuid);
CREATE INDEX idx_report_templates_report_type ON report_templates(report_type);
CREATE INDEX idx_report_history_farm_uuid ON report_history(farm_uuid);
CREATE INDEX idx_report_history_report_type ON report_history(report_type);
CREATE INDEX idx_report_history_generated_at ON report_history(generated_at);

