import { useBusiness } from './business'

// Permisos por rol dentro del negocio actual.
// El dueño puede todo; el empleado registra y edita, pero NO borra,
// ni ve Informes/Ajustes, ni gestiona el equipo.
export function usePerms() {
  const { role } = useBusiness()
  const isOwner = role === 'owner'
  return {
    isOwner,
    isEmployee: role === 'employee',
    canDelete: isOwner,
    canSeeReports: isOwner,
    canSeeSettings: isOwner,
    canManageTeam: isOwner,
  }
}
