import type { Role } from '@/context/AuthContext';

export const HOME_ROUTE: Record<Role, string> = {
  admin: '/(admin)/home',
  resident: '/(resident)/resident-home',
  security: '/(security)/security-home',
  facility: '/(facility)/home',
};
