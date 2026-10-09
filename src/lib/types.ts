export type Employee = {
  id: string
  user_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  job_title: string | null
  device_user_id: string | null
  /** Home branch; they can still be rota'd at any branch. */
  branch_id: string | null
  daily_minutes: number | null
  color: string
  active: boolean
  started_on: string | null
  created_at: string
}

export type PayRate = {
  id: string
  employee_id: string
  hourly_rate_pence: number
  effective_from: string
}

export type Device = {
  id: string
  serial_number: string
  name: string | null
  enabled: boolean
  branch_id: string | null
  timezone: string
  last_seen_at: string | null
  last_ip: string | null
  created_at: string
}

export type Punch = {
  id: number
  device_id: string | null
  device_user_id: string | null
  employee_id: string | null
  punched_at: string
  source: 'device' | 'manual'
  verify_mode: string | null
  outcome: 'in' | 'out' | 'duplicate' | 'unknown_user' | null
}

export type AttendanceSession = {
  id: string
  employee_id: string
  clock_in: string
  clock_out: string | null
  work_date: string
  /** The terminal's branch; null for a manual clock in. */
  branch_id: string | null
  edited: boolean
  note: string | null
}

export type DailySummary = {
  employee_id: string
  work_date: string
  full_name: string
  color: string
  sessions: number
  worked_seconds: number
  is_clocked_in: boolean
  missed_clock_out: boolean
  first_in: string | null
  last_out: string | null
  daily_minutes: number | null
  approved_minutes: number | null
  approval_note: string | null
  paid_minutes: number
}

export type Shift = {
  id: string
  employee_id: string
  starts_at: string
  ends_at: string
  shift_date: string
  branch_id: string | null
  note: string | null
}

/** One slot of someone's usual week. weekday: 1 = Monday ... 7 = Sunday; times are "HH:MM:SS" UK local. */
export type ShiftPattern = {
  id: string
  employee_id: string
  weekday: number
  branch_id: string | null
  start_time: string
  end_time: string
}

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'declined' | 'cancelled'

export type LeaveRequest = {
  id: string
  employee_id: string
  start_date: string
  end_date: string
  leave_type: LeaveType
  status: LeaveStatus
  note: string | null
  decided_at: string | null
  created_at: string
}

export type WageRow = {
  employee_id: string
  full_name: string
  color: string
  days_worked: number
  worked_seconds: number
  paid_minutes: number
  gross_pence: number
  days_without_rate: number
  current_rate_pence: number | null
}

export type CalendarDay = {
  day: string
  employees_worked: number
  worked_seconds: number
  paid_minutes: number
  shifts: number
  scheduled_minutes: number
  on_leave: number
}

export type ActionResult = { error?: string; ok?: boolean }
