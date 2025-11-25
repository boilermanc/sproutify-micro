import { useState } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Eye, Edit } from 'lucide-react';
import './TablePage.css';

const OrdersPage = () => {
  const [orders] = useState([
    { id: 1, orderId: 'ORD-1001', customer: 'Local Market', date: '2025-01-20', total: '$150.00', status: 'Pending' },
    { id: 2, orderId: 'ORD-1002', customer: 'Fresh Cafe', date: '2025-01-19', total: '$45.00', status: 'Fulfilled' },
    { id: 3, orderId: 'ORD-1003', customer: 'Green Grocer', date: '2025-01-18', total: '$320.00', status: 'Cancelled' },
  ]);

  // Mock sales data
  const salesData = [
    { date: 'Jan 15', amount: 120 },
    { date: 'Jan 16', amount: 180 },
    { date: 'Jan 17', amount: 150 },
    { date: 'Jan 18', amount: 320 },
    { date: 'Jan 19', amount: 45 },
    { date: 'Jan 20', amount: 150 },
    { date: 'Jan 21', amount: 210 },
  ];

  return (
    <div className="table-page fade-in-up">
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p className="subtitle">Manage your Orders</p>
        </div>
        <button className="btn btn-primary" onClick={() => alert('Create Order feature coming soon!')}>+ Add New</button>
      </div>

      <div className="chart-section" style={{ marginBottom: '2rem', background: '#FFF', padding: '1.5rem', borderRadius: '12px', border: '1px solid #D8DFE5' }}>
        <h2 style={{ fontSize: '1.125rem', color: '#2A3744', marginBottom: '1rem' }}>Sales Trend (Last 7 Days)</h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={salesData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} />
            <Tooltip 
              contentStyle={{
                backgroundColor: '#FFF', 
                borderRadius: '8px', 
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="amount" 
              stroke="#5B7C99" 
              strokeWidth={3} 
              dot={{ r: 4, fill: '#5B7C99', strokeWidth: 2, stroke: '#FFF' }} 
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Total</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order.id}>
                <td className="font-semibold">{order.orderId}</td>
                <td>{order.customer}</td>
                <td>{order.date}</td>
                <td>{order.total}</td>
                <td>
                  <span className={`status ${order.status.toLowerCase() === 'fulfilled' ? 'active' : order.status.toLowerCase() === 'cancelled' ? 'inactive' : 'pending'}`}>
                    {order.status}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View details for ${order.orderId}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit ${order.orderId}`)}><Edit size={18} color="#5B7C99" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrdersPage;
