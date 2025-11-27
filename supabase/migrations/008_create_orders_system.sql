-- Create orders table (order header)
CREATE TABLE IF NOT EXISTS orders (
    order_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    customer_id INTEGER REFERENCES customers(customerid),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    delivery_date DATE,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'In Progress', 'Completed', 'Cancelled')),
    order_type TEXT NOT NULL DEFAULT 'one-time' CHECK (order_type IN ('one-time', 'weekly', 'bi-weekly', 'standing')),
    total_amount NUMERIC(10, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profile(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create order_items table (order line items)
CREATE TABLE IF NOT EXISTS order_items (
    item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id),
    variant_id INTEGER REFERENCES product_variants(variant_id),
    quantity NUMERIC(10, 2) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create standing_orders table (recurring order templates)
CREATE TABLE IF NOT EXISTS standing_orders (
    standing_order_id SERIAL PRIMARY KEY,
    farm_uuid UUID REFERENCES farms(farm_uuid),
    customer_id INTEGER REFERENCES customers(customerid),
    order_name TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'bi-weekly')),
    delivery_days TEXT[] NOT NULL, -- Array of delivery days: ['Monday', 'Wednesday']
    start_date DATE NOT NULL,
    end_date DATE, -- NULL for indefinite
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES profile(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create standing_order_items table (items for standing orders)
CREATE TABLE IF NOT EXISTS standing_order_items (
    item_id SERIAL PRIMARY KEY,
    standing_order_id INTEGER REFERENCES standing_orders(standing_order_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id),
    variant_id INTEGER REFERENCES product_variants(variant_id),
    quantity NUMERIC(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create order_schedules table (generated order instances from standing orders)
CREATE TABLE IF NOT EXISTS order_schedules (
    schedule_id SERIAL PRIMARY KEY,
    standing_order_id INTEGER REFERENCES standing_orders(standing_order_id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE SET NULL, -- NULL until order is created
    scheduled_delivery_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'completed', 'skipped')),
    generated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE standing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE standing_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orders
CREATE POLICY "Users can view farm orders" ON orders
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm orders" ON orders
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- RLS Policies for order_items
CREATE POLICY "Users can view order items" ON order_items
    FOR SELECT USING (
        order_id IN (
            SELECT order_id FROM orders 
            WHERE farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
        )
    );

CREATE POLICY "Users can manage order items" ON order_items
    FOR ALL USING (
        order_id IN (
            SELECT order_id FROM orders 
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- RLS Policies for standing_orders
CREATE POLICY "Users can view farm standing orders" ON standing_orders
    FOR SELECT USING (farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid()));

CREATE POLICY "Users can manage farm standing orders" ON standing_orders
    FOR ALL USING (farm_uuid IN (
        SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
    ));

-- RLS Policies for standing_order_items
CREATE POLICY "Users can view standing order items" ON standing_order_items
    FOR SELECT USING (
        standing_order_id IN (
            SELECT standing_order_id FROM standing_orders 
            WHERE farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
        )
    );

CREATE POLICY "Users can manage standing order items" ON standing_order_items
    FOR ALL USING (
        standing_order_id IN (
            SELECT standing_order_id FROM standing_orders 
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- RLS Policies for order_schedules
CREATE POLICY "Users can view order schedules" ON order_schedules
    FOR SELECT USING (
        standing_order_id IN (
            SELECT standing_order_id FROM standing_orders 
            WHERE farm_uuid IN (SELECT farm_uuid FROM profile WHERE id = auth.uid())
        )
    );

CREATE POLICY "Users can manage order schedules" ON order_schedules
    FOR ALL USING (
        standing_order_id IN (
            SELECT standing_order_id FROM standing_orders 
            WHERE farm_uuid IN (
                SELECT farm_uuid FROM profile WHERE id = auth.uid() AND role IN ('Owner', 'Editor')
            )
        )
    );

-- Add indexes for performance
CREATE INDEX idx_orders_farm_uuid ON orders(farm_uuid);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX idx_orders_order_type ON orders(order_type);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE INDEX idx_standing_orders_farm_uuid ON standing_orders(farm_uuid);
CREATE INDEX idx_standing_orders_customer_id ON standing_orders(customer_id);
CREATE INDEX idx_standing_order_items_standing_order_id ON standing_order_items(standing_order_id);
CREATE INDEX idx_order_schedules_standing_order_id ON order_schedules(standing_order_id);
CREATE INDEX idx_order_schedules_delivery_date ON order_schedules(scheduled_delivery_date);

-- Create function to update order total_amount when items change
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE orders
    SET total_amount = (
        SELECT COALESCE(SUM(total_price), 0)
        FROM order_items
        WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
    ),
    updated_at = NOW()
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update order total
CREATE TRIGGER trigger_update_order_total
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION update_order_total();

