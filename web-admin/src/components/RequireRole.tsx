import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';

type Role = 'Owner' | 'Farm Manager' | 'Farm Hand';

interface RequireRoleProps {
  children: ReactNode;
  /** Roles that are allowed to access this route */
  allowedRoles: Role[];
  /** Where to redirect if role is not allowed (defaults to /tasks for Farm Hands, / for others) */
  redirectTo?: string;
}

/**
 * Route protection component that checks user role from session.
 * Redirects users without the required role to an appropriate page.
 */
const RequireRole = ({ children, allowedRoles, redirectTo }: RequireRoleProps) => {
  const sessionStr = localStorage.getItem('sproutify_session');

  if (!sessionStr) {
    return <Navigate to="/login" replace />;
  }

  try {
    const session = JSON.parse(sessionStr);
    const userRole = session?.role?.toLowerCase() || '';

    const isAllowed = allowedRoles.some(
      (role) => role.toLowerCase() === userRole
    );

    if (!isAllowed) {
      // Determine redirect path based on user role
      const defaultRedirect = userRole === 'farm hand' ? '/tasks' : '/';
      return <Navigate to={redirectTo || defaultRedirect} replace />;
    }

    return <>{children}</>;
  } catch {
    return <Navigate to="/login" replace />;
  }
};

export default RequireRole;

/**
 * Helper to check if user can manage the farm (Owner or Farm Manager).
 * Farm Hands have limited access.
 */
export const canManageFarm = (): boolean => {
  const sessionStr = localStorage.getItem('sproutify_session');
  if (!sessionStr) return false;

  try {
    const session = JSON.parse(sessionStr);
    const role = session?.role?.toLowerCase() || '';
    return role === 'owner' || role === 'farm manager';
  } catch {
    return false;
  }
};

/**
 * Helper to check if user is a Farm Hand with limited access.
 */
export const isFarmHand = (): boolean => {
  const sessionStr = localStorage.getItem('sproutify_session');
  if (!sessionStr) return false;

  try {
    const session = JSON.parse(sessionStr);
    const role = session?.role?.toLowerCase() || '';
    return role === 'farm hand';
  } catch {
    return false;
  }
};
