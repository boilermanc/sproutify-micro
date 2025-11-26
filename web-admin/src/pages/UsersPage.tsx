import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import './TablePage.css';
import { Edit, Trash2, UserPlus, X, Eye, EyeOff, Mail, Lock, User, Shield } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastActive: string;
  createdAt: string;
}

const UsersPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Viewer',
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const sessionData = localStorage.getItem('sproutify_session');
        if (!sessionData) return;

        const { farmUuid } = JSON.parse(sessionData);

        const { data, error } = await supabase
          .from('profile')
          .select('*')
          .eq('farm_uuid', farmUuid);

        if (error) throw error;

        const formattedUsers: User[] = (data || []).map((user: any) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.is_active,
          lastActive: user.last_active ? new Date(user.last_active).toLocaleDateString() : 'Never',
          createdAt: user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown',
        }));

        setUsers(formattedUsers);
      } catch (error) {
        console.error('Error fetching users:', error);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleCreateUser = async () => {
    if (!formData.name || !formData.email || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const sessionData = localStorage.getItem('sproutify_session');
      if (!sessionData) {
        throw new Error('Session not found');
      }

      const { farmUuid } = JSON.parse(sessionData);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          role: formData.role,
          farmUuid,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user');
      }

      // Format and add the new user to the list
      const newUser: User = {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        isActive: result.user.isActive,
        lastActive: 'Just now',
        createdAt: new Date(result.user.createdAt).toLocaleDateString(),
      };
      setUsers([newUser, ...users]);
      
      // Reset form and close modal
      setFormData({ name: '', email: '', password: '', role: 'Viewer' });
      setShowAddModal(false);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className="table-page">
        <div className="page-header">
          <div>
            <h1>User Management</h1>
            <p className="subtitle">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="table-page">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p className="subtitle">Manage farm users and permissions</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Add User
        </button>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="All">All Roles</option>
          <option value="Owner">Owner</option>
          <option value="Editor">Editor</option>
          <option value="Viewer">Viewer</option>
        </select>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Active</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => (
              <tr key={user.id}>
                <td className="font-semibold">{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`badge badge-${user.role.toLowerCase()}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <span className={`status ${user.isActive ? 'active' : 'inactive'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{user.lastActive}</td>
                <td>{user.createdAt}</td>
                <td>
                  <div className="actions">
                    <button className="action-icon" title="Edit" onClick={() => alert(`Edit ${user.name}`)}><Edit size={18} color="#5B7C99" /></button>
                    <button className="action-icon" title="Delete" onClick={() => alert(`Delete ${user.name}`)}><Trash2 size={18} color="#E57373" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredUsers.length === 0 && (
        <div className="empty-state">
          <p>No users found</p>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <div className="modal-icon-wrapper">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h2>Create New User</h2>
                  <p className="modal-subtitle">Add a new team member to your farm</p>
                </div>
              </div>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {error && (
                <div className="error-message">
                  <div className="error-icon">!</div>
                  <div className="error-text">{error}</div>
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); handleCreateUser(); }}>
                <div className="form-group">
                  <label>
                    <User size={16} />
                    Full Name
                  </label>
                  <input 
                    type="text" 
                    placeholder="John Doe" 
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    disabled={creating}
                  />
                </div>
                <div className="form-group">
                  <label>
                    <Mail size={16} />
                    Email Address
                  </label>
                  <input 
                    type="email" 
                    placeholder="john.doe@example.com" 
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    disabled={creating}
                  />
                </div>
                <div className="form-group">
                  <label>
                    <Lock size={16} />
                    Password
                  </label>
                  <div className="password-input-wrapper">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      placeholder="Minimum 6 characters" 
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      disabled={creating}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={creating}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="password-hint">Password must be at least 6 characters long</div>
                </div>
                <div className="form-group">
                  <label>
                    <Shield size={16} />
                    Role
                  </label>
                  <select 
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    disabled={creating}
                  >
                    <option value="Viewer">Viewer - Read-only access</option>
                    <option value="Editor">Editor - Can edit data</option>
                    <option value="Owner">Owner - Full access</option>
                  </select>
                  <div className="role-description">
                    {formData.role === 'Viewer' && 'Can view data but cannot make changes'}
                    {formData.role === 'Editor' && 'Can view and edit data but cannot manage users'}
                    {formData.role === 'Owner' && 'Full access including user management'}
                  </div>
                </div>
              </form>
            </div>
            <div className="modal-footer">
              <button 
                type="button"
                className="btn btn-secondary" 
                onClick={() => {
                  setShowAddModal(false);
                  setFormData({ name: '', email: '', password: '', role: 'Viewer' });
                  setError('');
                  setShowPassword(false);
                }}
                disabled={creating}
              >
                Cancel
              </button>
              <button 
                type="button"
                className="btn btn-primary" 
                onClick={handleCreateUser}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <span className="spinner"></span>
                    Creating User...
                  </>
                ) : (
                  <>
                    <UserPlus size={18} />
                    Create User
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
