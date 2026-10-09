import type { AttendanceSession, Employee, Shift } from '@/lib/types'

/**
 * The people a branch's day is about: those based there, rota'd there (pass that branch's shifts) or who clocked
 * in on its terminal. With no branch selected, everyone.
 */
export function peopleAtBranch<E extends Pick<Employee, 'id' | 'branch_id'>>(
  employees: E[],
  branchId: string | null,
  branchShifts: Pick<Shift, 'employee_id'>[],
  sessions: Pick<AttendanceSession, 'employee_id' | 'branch_id'>[]
) {
  if (!branchId) return employees
  return employees.filter(
    (e) =>
      e.branch_id === branchId ||
      branchShifts.some((x) => x.employee_id === e.id) ||
      sessions.some((x) => x.employee_id === e.id && x.branch_id === branchId)
  )
}
